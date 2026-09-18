/**
 * Блок навыков: список слева и зрачок, который собирается из точек по мере прокрутки.
 *
 * Секция высокая, внутри — липкий экран. Прокрутка переводится в прогресс 0..1:
 * по нему радужка заливается по часовой стрелке, в списке подсвечивается
 * текущий навык, а в зрачке сменяются строки. Один навык = одна доля круга;
 * на смене зрачок коротко сужается.
 *
 * Содержимое — список в разметке: его читает и лид, и скринридер. Зрачок только
 * повторяет активный пункт, поэтому скрыт от вспомогательных технологий.
 * Навыков четыре: больше — и блок листается дольше, чем его читают.
 *
 * Прокрутка, а не таймер: зритель сам задаёт темп и может вернуться назад.
 * Пункт списка — кнопка: нажатие докручивает до своего навыка.
 *
 * Вход и выход — глубина. Пока блок поднимается, глаз приближается из дали
 * (--enter). После четвёртого навыка идёт хвост (--tail экранов, CSS):
 * глаз растёт, пока прокрутка не пролетит сквозь зрачок, а текст отступает
 * (--exit). Под хвост уже подъезжает раздел с кейсами.
 */
import { Iris } from './iris.js';
import { onScrollFrame, requestFrame } from '../brand/frame.js';

const CHAR_STAGGER = 18; // мс между буквами при смене строки

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t * t;
const pad = (n) => String(n).padStart(2, '0');

export class SkillsWheel {
  constructor(section) {
    this.section = section;
    this.lineEl = section.querySelector('[data-skills-line]');
    this.noteEl = section.querySelector('[data-skills-note]');
    this.kindEl = section.querySelector('[data-skills-kind]');

    this.items = [...section.querySelectorAll('[data-skill]')];
    this.skills = this.items.map((li) => ({
      title: li.querySelector('.skills__name').textContent.trim(),
      tags: li.dataset.tags,
    }));

    this.index = -1;
    this._readTail();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.section.style.setProperty('--steps', String(this.skills.length));

    // липкий экран — хост: на нём живут --gx/--gy/--lid, по ним текст
    // поворачивается вместе с глазом
    this.iris = new Iris(
      section.querySelector('[data-iris]'),
      section.querySelector('.skills__stage'),
    );
    this.iris.resize();
    this.iris.start();

    this.items.forEach((li, i) => {
      li.querySelector('.skills__jump').addEventListener('click', () => this.jump(i));
    });

    this._onResize = () => {
      this._readTail();
      requestFrame();
    };

    addEventListener('resize', this._onResize);
    // чтение геометрии и запись стилей разведены по общим фазам кадра
    // (see brand/frame.js)
    this._offFrame = onScrollFrame(() => this._read(), (rect) => this._write(rect));
  }

  /** Длина хвоста в экранах — из CSS, где она задаёт высоту секции. */
  _readTail() {
    this.tail = parseFloat(getComputedStyle(this.section).getPropertyValue('--tail')) || 0;
  }

  /**
   * Прокрутка делится на навыки и хвост в тех же долях, что и высота в CSS:
   * (n − 1) экранов на смену навыков, tail экранов на пролёт сквозь зрачок.
   */
  _spans(rectHeight) {
    const n = this.skills.length;
    const span = rectHeight - innerHeight;
    return { span, stepsSpan: span * ((n - 1) / (n - 1 + this.tail)) };
  }

  /** Докручивает до середины доли навыка: там он точно активен. */
  jump(i) {
    const top = this.section.getBoundingClientRect().top + scrollY;
    const { stepsSpan } = this._spans(this.section.offsetHeight);
    const at = top + stepsSpan * ((i + 0.5) / this.skills.length);
    scrollTo({ top: at, behavior: this.reduced ? 'auto' : 'smooth' });
  }

  /** Раскладывает строку по буквам, чтобы они появлялись со сдвигом. */
  _setLine(text) {
    this.lineEl.textContent = '';

    const frag = document.createDocumentFragment();
    const spans = [];
    let i = 0;

    // буквы заворачиваем в слова: иначе строка переносится посреди слова,
    // потому что каждая буква — самостоятельный inline-block
    text.split(' ').forEach((word, w) => {
      if (w > 0) frag.appendChild(document.createTextNode(' '));
      const wordEl = document.createElement('span');
      wordEl.className = 'skills__word';
      for (const ch of word) {
        const span = document.createElement('span');
        span.className = 'skills__char';
        span.textContent = ch;
        span.style.transitionDelay = this.reduced ? '0ms' : `${i * CHAR_STAGGER}ms`;
        wordEl.appendChild(span);
        spans.push(span);
        i++;
      }
      frag.appendChild(wordEl);
    });

    this.lineEl.appendChild(frag);

    // принудительный рефлоу вместо requestAnimationFrame: в скрытой вкладке
    // кадры не идут, и буквы остались бы невидимыми навсегда
    void this.lineEl.offsetWidth;
    for (const span of spans) span.classList.add('is-in');
  }

  _setIndex(i) {
    if (i === this.index) return;
    this.index = i;

    this.items.forEach((li, k) => {
      li.classList.toggle('is-active', k === i);
      li.classList.toggle('is-done', k < i);
      if (k === i) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });

    const skill = this.skills[i];
    if (this.kindEl) this.kindEl.textContent = `${pad(i + 1)} / ${pad(this.skills.length)}`;
    this._setLine(skill.title);
    this.iris.pulse();

    this.noteEl.classList.remove('is-in');
    clearTimeout(this._noteTimer);
    this._noteTimer = setTimeout(() => {
      this.noteEl.textContent = skill.tags;
      this.noteEl.classList.add('is-in');
    }, 160);
  }

  /** Фаза чтения: единственное обращение к геометрии за кадр. */
  _read() {
    return this.section.getBoundingClientRect();
  }

  /** Единый пересчёт: читает сам и сразу пишет. Для вызовов вне кадра прокрутки. */
  update() {
    this._write(this._read());
  }

  /** Фаза записи: только стили, ни одного чтения геометрии. */
  _write(rect) {
    const { span, stepsSpan } = this._spans(rect.height);
    if (span <= 0) return;

    const n = this.skills.length;
    const st = this.section.style;
    const scrolled = -rect.top;

    if (!this.reduced) {
      const enter = clamp(1 - rect.top / innerHeight, 0, 1);
      const exit = clamp((scrolled - stepsSpan) / Math.max(span - stepsSpan, 1), 0, 1);
      st.setProperty('--enter', easeOut(enter).toFixed(3));
      st.setProperty('--exit', easeIn(exit).toFixed(3));
    }

    const progress = clamp(scrolled / stepsSpan, 0, 1);
    this.iris.setProgress(progress);

    const step = clamp(Math.floor(progress * n), 0, n - 1);
    // полоса у активного пункта показывает, сколько осталось до следующего
    const local = clamp(progress * n - step, 0, 1);
    st.setProperty('--step-progress', local.toFixed(3));
    this._setIndex(step);
  }

  destroy() {
    this.iris.destroy();
    clearTimeout(this._noteTimer);
    this._offFrame?.();
    removeEventListener('resize', this._onResize);
  }
}
