/**
 * Карточка постера: разворот.
 *
 * Клик по карточке в кольце открывает её обратную сторону. Переворот
 * сделан честно: коробка с двумя гранями крутится по Y, передняя грань —
 * та же обложка, что была в кольце, задняя — сам разбор. Летит коробка
 * из прямоугольника карточки в прямоугольник панели (FLIP): обе величины
 * снимаются в момент открытия, поэтому переворот начинается ровно там,
 * где карточка стояла в кольце, и не зависит от его положения.
 *
 * Дальше 3D снимается. Как только переворот доигран, вешается is-flat:
 * preserve-3d выключается, передняя грань убирается, задняя встаёт прямо.
 * Так прокручиваемая панель не остаётся внутри повёрнутой на 180° сцены —
 * там и текст мылит, и прокрутка в Safari ведёт себя странно.
 *
 * Флоат. Открытая панель продолжает жить: она чуть доворачивается за
 * курсором. Это не кадр в секунду — цель пишется один раз на движение
 * мыши (кадр общий, see motion/frame.js), доводит её CSS-переход.
 *
 * Поп-ап. Любое изображение внутри — обложка и материалы проекта —
 * открывается во весь экран вторым диалогом. Диалоги вложенные, и это
 * штатно: верхний слой их стопкой и держит.
 *
 * Разметка — <dialog>: фокус заперт, Esc работает, фон инертен, возврат
 * фокуса на карточку — всё это браузер делает сам.
 *
 * prefers-reduced-motion: переворота нет, панель просто появляется.
 */
import { reduced } from '../motion/reduced.js';
import { onScrollFrame, requestFrame } from '../motion/frame.js';

const FLIP_MS = 620;
// ровная дуга, а не --ease-slow: тот выносит карточку на место за первую
// четверть времени, и переворота не видно — остаётся мигание
const EASE = 'cubic-bezier(.4, 0, .2, 1)';
// доворот панели за курсором, градусов на краю экрана
const TILT = 3.5;

const SHELL = `
  <div class="poster__flip" data-flip>
    <div class="poster__face poster__face--front" aria-hidden="true">
      <img class="poster__ghost" alt="" draggable="false">
    </div>
    <div class="poster__face poster__face--back">
      <button type="button" class="poster__close" data-close autofocus>
        <span class="sr-only">Close</span>
        <span aria-hidden="true">✕</span>
      </button>
      <article class="poster__sheet" data-sheet>
        <button type="button" class="poster__cover" data-cover>
          <img class="poster__cover-img" alt="" draggable="false">
          <span class="poster__cover-cue" aria-hidden="true">View full size</span>
        </button>
        <header class="poster__head">
          <p class="poster__index" data-index></p>
          <h2 class="poster__title" data-title></h2>
          <ul class="poster__tags" data-tags></ul>
        </header>
        <dl class="poster__facts" data-facts></dl>
        <p class="poster__note" data-note></p>
        <section class="poster__media" data-media>
          <p class="poster__legend">Inside the project</p>
          <div class="poster__strip" data-strip></div>
        </section>
      </article>
    </div>
  </div>
`;

const SHOT = `
  <button type="button" class="shot__close" data-close>
    <span class="sr-only">Close</span>
    <span aria-hidden="true">✕</span>
  </button>
  <button type="button" class="shot__nav shot__nav--prev" data-step="-1">
    <span class="sr-only">Previous</span>
    <span aria-hidden="true">←</span>
  </button>
  <figure class="shot__frame">
    <img class="shot__img" data-img alt="" draggable="false">
    <video class="shot__img" data-video playsinline loop muted controls hidden></video>
  </figure>
  <button type="button" class="shot__nav shot__nav--next" data-step="1">
    <span class="sr-only">Next</span>
    <span aria-hidden="true">→</span>
  </button>
  <p class="shot__count" data-count></p>
`;

export class PosterDetail {
  /**
   * @param {{ onOpen?: (item: object) => void, onClose?: () => void }} [hooks]
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.item = null;
    this.fromEl = null;
    this.anim = null;
    this.media = [];
    this.at = 0;
    this.tilt = '';
    this._build();
  }

  /* ─── разметка ─────────────────────────────────────────────────── */

  _build() {
    const $ = (sel, root) => root.querySelector(sel);

    this.root = document.createElement('dialog');
    this.root.className = 'poster';
    this.root.setAttribute('aria-label', 'Archived work');
    this.root.innerHTML = SHELL;

    this.flip = $('[data-flip]', this.root);
    this.ghost = $('.poster__ghost', this.root);
    this.sheet = $('[data-sheet]', this.root);
    this.coverBtn = $('[data-cover]', this.root);
    this.cover = $('.poster__cover-img', this.root);
    this.index = $('[data-index]', this.root);
    this.title = $('[data-title]', this.root);
    this.tags = $('[data-tags]', this.root);
    this.facts = $('[data-facts]', this.root);
    this.note = $('[data-note]', this.root);
    this.mediaBox = $('[data-media]', this.root);
    this.strip = $('[data-strip]', this.root);

    this.shot = document.createElement('dialog');
    this.shot.className = 'shot';
    this.shot.setAttribute('aria-label', 'Image');
    this.shot.innerHTML = SHOT;
    this.shotImg = $('[data-img]', this.shot);
    this.shotVideo = $('[data-video]', this.shot);
    this.shotCount = $('[data-count]', this.shot);

    document.body.append(this.root, this.shot);
    this._bind();
  }

  _bind() {
    this.root.addEventListener('click', (e) => {
      // клик мимо панели — по самому <dialog>, то есть по затемнению
      if (e.target === this.root) { this.close(); return; }
      if (e.target.closest('[data-close]')) { this.close(); return; }
      if (e.target.closest('[data-cover]')) { this._shot(0); return; }
      const thumb = e.target.closest('[data-shot]');
      if (thumb) this._shot(Number(thumb.dataset.shot));
    });
    // Esc. Диалог закрылся бы и сам, но нам нужен обратный переворот,
    // поэтому отменяем штатное закрытие и закрываем руками. Слушаем и
    // cancel, и keydown: первое — как задумано платформой, второе —
    // на случай, когда запрос на закрытие до диалога не доходит.
    // Повторный вызов безвреден, close() держит свой засов.
    const bye = (e) => {
      e.preventDefault();
      if (this.shot.open) this.shot.close();
      else this.close();
    };
    this.root.addEventListener('cancel', bye);
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') bye(e); });

    this.shot.addEventListener('click', (e) => {
      if (e.target === this.shot) { this.shot.close(); return; }
      if (e.target.closest('[data-close]')) { this.shot.close(); return; }
      const step = e.target.closest('[data-step]');
      if (step) this._shot(this.at + Number(step.dataset.step));
    });
    this.shot.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this._shot(this.at - 1);
      else if (e.key === 'ArrowRight') this._shot(this.at + 1);
      // Esc закрывает поп-ап сам, но закрывать его должен именно он:
      // ниже лежит вторая открытая модалка, и порядок тут не лишний
      else if (e.key === 'Escape') { e.stopPropagation(); this.shot.close(); }
    });
    this.shot.addEventListener('close', () => { this.shotVideo.pause(); });

    // доворот за курсором: событие только запоминает цель, пишет кадр
    this.root.addEventListener('pointermove', (e) => {
      if (!this.root.open || reduced()) return;
      const x = (e.clientX / innerWidth - 0.5) * 2;
      const y = (e.clientY / innerHeight - 0.5) * 2;
      this.tilt = `perspective(2200px) rotateY(${(x * TILT).toFixed(2)}deg) rotateX(${(-y * TILT).toFixed(2)}deg)`;
      requestFrame();
    });
    this.root.addEventListener('pointerleave', () => { this.tilt = ''; requestFrame(); });

    onScrollFrame(null, () => {
      // доворот живёт только у доигравшей панели: пока идёт переворот,
      // transform занят анимацией и трогать его нельзя
      if (!this.root.open || !this.root.classList.contains('is-flat')) return;
      const want = this.tilt;
      if (want === this._tiltLast) return;
      this.flip.style.transform = want;
      this._tiltLast = want;
    });
  }

  /* ─── наполнение ───────────────────────────────────────────────── */

  _fill(item) {
    const row = (parent, tag, cls, text) => {
      const el = document.createElement(tag);
      el.className = cls;
      el.textContent = text;
      parent.append(el);
      return el;
    };

    this.ghost.src = item.src;
    this.cover.src = item.src;
    this.cover.alt = item.title;
    this.title.textContent = item.title;
    const at = item.index ? String(item.index).padStart(2, '0') : '';
    this.index.textContent = at && item.total ? `Archive ${at} / ${item.total}` : `Archive ${at}`.trim();

    this.tags.textContent = '';
    for (const kind of item.kind ?? []) {
      row(this.tags, 'li', 'poster__tag', `#${String(kind).toLowerCase().replace(/\s+/g, '-')}`);
    }
    this.tags.hidden = !this.tags.childElementCount;

    // показываем только то, что заполнено: пустая строка хуже её отсутствия
    const facts = [
      ['Year', item.year],
      ['Client', item.client],
      ['Role', item.role],
      ...Object.entries(item.facts ?? {}),
    ].filter(([, v]) => v);
    this.facts.textContent = '';
    for (const [key, value] of facts) {
      const pair = document.createElement('div');
      pair.className = 'poster__fact';
      row(pair, 'dt', 'poster__key', key);
      row(pair, 'dd', 'poster__value', value);
      this.facts.append(pair);
    }
    this.facts.hidden = !facts.length;

    this.note.textContent = item.note ?? '';
    this.note.hidden = !item.note;

    // обложка — первый кадр поп-апа: из панели её тоже можно открыть
    this.media = [{ src: item.src, type: 'image', alt: item.title }, ...(item.media ?? [])];
    this.strip.textContent = '';
    this.media.forEach((m, i) => {
      if (!i) return;  // обложка уже показана сверху
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'poster__thumb';
      btn.dataset.shot = String(i);
      btn.setAttribute('aria-label', `${item.title} — ${i} of ${this.media.length - 1}`);
      if (m.type === 'video') {
        const v = document.createElement('video');
        v.src = m.src;
        v.muted = true;
        v.playsInline = true;
        v.preload = 'metadata';
        btn.append(v);
      } else {
        const img = document.createElement('img');
        img.src = m.src;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        btn.append(img);
      }
      this.strip.append(btn);
    });
    this.mediaBox.hidden = this.media.length < 2;
  }

  /* ─── переворот ────────────────────────────────────────────────── */

  /** Матрица, в которой коробка совпадает с карточкой в кольце. */
  _ghostFrom() {
    const r = this.fromEl?.getBoundingClientRect();
    const p = this.flip.getBoundingClientRect();
    if (!r || !r.width || !p.width) return 'translate3d(0, 0, 0) scale(.9) rotateY(0deg)';
    const s = Math.max(0.04, r.width / p.width);
    const dx = r.left + r.width / 2 - (p.left + p.width / 2);
    const dy = r.top + r.height / 2 - (p.top + p.height / 2);
    return `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${s.toFixed(4)}) rotateY(0deg)`;
  }

  /** Конечное положение: панель на месте, развёрнута задней стороной. */
  get _facing() { return 'translate3d(0, 0, 0) scale(1) rotateY(180deg)'; }

  _flatten() {
    this.anim?.cancel();
    this.anim = null;
    this.flip.style.transform = '';
    this._tiltLast = '';
    // класс и отмена анимации — в одном кадре, иначе мелькнёт зеркальная грань
    this.root.classList.add('is-flat');
  }

  /**
   * @param {object} item постер из POSTERS
   * @param {HTMLElement} [fromEl] карточка в кольце — откуда лететь
   */
  open(item, fromEl) {
    if (!item || this.root.open) return;
    this.item = item;
    this.fromEl = fromEl ?? null;
    this._closing = false;
    this.tilt = '';
    this._fill(item);
    this.root.classList.remove('is-flat');
    this.flip.style.transform = '';
    this.sheet.scrollTop = 0;
    this.root.showModal();
    this.hooks.onOpen?.(item);

    if (reduced()) { this._flatten(); return; }
    this.anim = this.flip.animate(
      [{ transform: this._ghostFrom() }, { transform: this._facing }],
      { duration: FLIP_MS, easing: EASE, fill: 'both' },
    );
    this.anim.finished.then(() => this._flatten()).catch(() => { /* прервали — закрываемся */ });
  }

  close() {
    if (!this.root.open || this._closing) return;
    this._closing = true;
    if (this.shot.open) this.shot.close();

    const done = () => {
      this._closing = false;
      this.anim?.cancel();
      this.anim = null;
      this.flip.style.transform = '';
      this.root.close();
      this.hooks.onClose?.(this.item);
      this.item = null;
    };

    if (reduced()) { done(); return; }
    // возвращаем 3D до снятия is-flat: иначе кадр покажет зеркальную грань
    this.flip.style.transform = this._facing;
    this.root.classList.remove('is-flat');
    this.anim?.cancel();
    this.anim = this.flip.animate(
      [{ transform: this._facing }, { transform: this._ghostFrom() }],
      { duration: FLIP_MS * 0.78, easing: EASE, fill: 'both' },
    );
    this.anim.finished.then(done).catch(() => { /* уже закрыли */ });
  }

  /* ─── поп-ап ───────────────────────────────────────────────────── */

  _shot(i) {
    if (!this.media.length) return;
    const n = this.media.length;
    this.at = ((i % n) + n) % n;
    const m = this.media[this.at];

    const video = m.type === 'video';
    this.shotImg.hidden = video;
    this.shotVideo.hidden = !video;
    if (video) {
      this.shotVideo.src = m.src;
      this.shotVideo.play().catch(() => { /* автозапуск не обязателен */ });
    } else {
      this.shotVideo.pause();
      this.shotVideo.removeAttribute('src');
      this.shotImg.src = m.src;
      this.shotImg.alt = m.alt ?? '';
    }
    this.shotCount.textContent = `${this.at + 1} / ${n}`;
    this.shot.classList.toggle('is-alone', n < 2);
    if (!this.shot.open) this.shot.showModal();
  }
}
