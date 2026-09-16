/**
 * Блок навыков: зрачок, который собирается из точек по мере прокрутки.
 *
 * Секция высокая, внутри — липкий экран. Прокрутка переводится в прогресс 0..1:
 * по нему радужка заливается по часовой стрелке, а в зрачке сменяются строки.
 * Один навык = одна восьмая круга; на смене зрачок коротко сужается.
 *
 * Прокрутка, а не таймер: зритель сам задаёт темп и может вернуться назад.
 */
import { Iris } from './iris.js';

export const SKILLS = [
  { kind: 'Craft',    title: 'Design systems',      note: 'Tokens as the single source of truth' },
  { kind: 'Craft',    title: 'Design engineering',  note: 'HTML, CSS, canvas and WebGL in production' },
  { kind: 'Craft',    title: 'Figma architecture',  note: 'Variables, components, scripted at scale' },
  { kind: 'Craft',    title: 'Brand identity',      note: 'Marks, type systems, art direction' },
  { kind: 'Practice', title: 'Accessibility',       note: 'Contrast, focus and motion — measured, not assumed' },
  { kind: 'Practice', title: 'Release discipline',  note: 'SemVer, CI checks, changelogs that say why' },
  { kind: 'Practice', title: 'Developer handoff',   note: 'Specs a front-end can build from' },
  { kind: 'People',   title: 'Leading a team',      note: 'Seven people shipping, in English and Spanish' },
];

const CHAR_STAGGER = 18; // мс между буквами при смене строки

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class SkillsWheel {
  constructor(section) {
    this.section = section;
    this.lineEl = section.querySelector('[data-skills-line]');
    this.noteEl = section.querySelector('[data-skills-note]');
    this.kindEl = section.querySelector('[data-skills-kind]');

    this.index = -1;
    this.ticking = false;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.section.style.setProperty('--steps', String(SKILLS.length));

    // липкий экран — хост: на нём живут --gx/--gy/--lid, по ним текст
    // поворачивается вместе с глазом
    this.iris = new Iris(
      section.querySelector('[data-iris]'),
      section.querySelector('.skills__sticky'),
    );
    this.iris.resize();
    this.iris.start();

    this._onScroll = () => {
      if (this.ticking) return;
      this.ticking = true;
      requestAnimationFrame(() => {
        this.ticking = false;
        this.update();
      });
    };

    addEventListener('scroll', this._onScroll, { passive: true });
    addEventListener('resize', this._onScroll);
    this.update();
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

    const skill = SKILLS[i];
    if (this.kindEl) this.kindEl.textContent = skill.kind;
    this._setLine(skill.title);
    this.iris.pulse();

    this.noteEl.classList.remove('is-in');
    setTimeout(() => {
      this.noteEl.textContent = skill.note;
      this.noteEl.classList.add('is-in');
    }, 160);
  }

  update() {
    const rect = this.section.getBoundingClientRect();
    const span = rect.height - innerHeight;
    if (span <= 0) return;

    const progress = clamp(-rect.top / span, 0, 1);
    this.iris.setProgress(progress);

    const step = clamp(Math.floor(progress * SKILLS.length), 0, SKILLS.length - 1);
    this._setIndex(step);
  }

  destroy() {
    this.iris.destroy();
    removeEventListener('scroll', this._onScroll);
    removeEventListener('resize', this._onScroll);
  }
}
