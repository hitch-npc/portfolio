/**
 * Кейсы — колода карт.
 *
 * Прокрутка не ведёт кейсы друг за другом, а кладёт карту на карту. Карта
 * поднимается снизу наклонённой и уменьшенной, как из глубины, и распрямляется,
 * вставая в стопку; накрытая уходит вниз стопки и темнеет. Заголовок раздела
 * тоже приезжает издалека. Карта — это превью: что за проект, какая работа,
 * первый экран продукта. Сам кейс раскрывается только по нажатию — в окне
 * поверх страницы, со своей прокруткой.
 *
 * Окно — нативный <dialog>: фокус, Esc и инертный фон браузер держит сам.
 * Раскрытие растёт из прямоугольника карты (clip-path), закрытие сворачивает
 * окно обратно в карту. У открытого кейса свой адрес (#case-tts): ссылкой
 * можно поделиться, кнопка «назад» закрывает окно.
 *
 * prefers-reduced-motion: окно открывается и закрывается без анимации,
 * заголовки карт не дешифруются, стопка не сжимается.
 */
import { decrypt } from './decrypt.js';

// ширина, под которую свёрстан первый экран редизайна; в карте он масштабируется
const SHOT_WIDTH = 1180;
// мельче текст макета не читается: на телефоне экран обрезается справа, а не сжимается
const SHOT_MIN_SCALE = 0.42;

const OPEN_MS = 620;
const CLOSE_MS = 420;
const EASE_OPEN = 'cubic-bezier(.16, 1, .3, 1)';
const EASE_CLOSE = 'cubic-bezier(.4, 0, .2, 1)';
const FULL = 'inset(0px 0px 0px 0px round 0px)';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - (1 - t) ** 3;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Окно кейса, привязанное к своей карте. */
class CaseView {
  constructor(dialog, card, opener) {
    this.dialog = dialog;
    this.card = card;
    this.opener = opener;
    this.content = dialog.querySelector('.case');
    this.anim = null;
    this.contentAnim = null;
    this.closing = false;

    dialog.querySelector('[data-case-close]').addEventListener('click', () => this.close());
    // Esc: вместо мгновенного закрытия — то же сворачивание в карту.
    // Ловим и саму клавишу: запрос закрытия браузер строит по коду клавиши,
    // а он приходит не всегда (синтетический ввод, часть экранных клавиатур)
    dialog.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      this.close();
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.close();
    });
  }

  get hash() { return `#${this.dialog.id}`; }

  /** Прямоугольник карты в координатах экрана — отсюда растёт окно. */
  _cardClip() {
    const r = this.card.getBoundingClientRect();
    const radius = getComputedStyle(this.card).borderTopLeftRadius;
    return `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round ${radius})`;
  }

  open({ instant = false, push = true } = {}) {
    if (this.dialog.open) return;

    if (push && location.hash !== this.hash) {
      history.pushState({ case: this.dialog.id }, '', this.hash);
    }

    // по прямой ссылке страница стоит в начале — подводим карту под окно,
    // чтобы закрытие свернулось в неё, а не в пустоту
    if (instant) this.card.scrollIntoView({ block: 'center' });

    const from = this._cardClip();
    this.dialog.showModal();
    this.dialog.scrollTop = 0;

    if (instant || reduced()) return;

    this.anim?.cancel();
    this.anim = this.dialog.animate(
      [{ clipPath: from }, { clipPath: FULL }],
      { duration: OPEN_MS, easing: EASE_OPEN },
    );
    // содержимое приближается следом за окном: сначала рамка, потом кейс
    this.contentAnim?.cancel();
    this.contentAnim = this.content.animate(
      [{ opacity: 0, transform: 'translateY(40px) scale(0.94)' }, { opacity: 1, transform: 'none' }],
      { duration: OPEN_MS, delay: 120, easing: EASE_OPEN, fill: 'backwards' },
    );
  }

  /**
   * @param {{fromHistory?: boolean}} [opts] fromHistory — окно закрывает «назад»,
   *   адрес уже сменился, трогать историю не нужно
   */
  async close({ fromHistory = false } = {}) {
    if (!this.dialog.open || this.closing) return;
    this.closing = true;

    if (!reduced()) {
      this.anim?.cancel();
      this.anim = this.dialog.animate(
        [{ clipPath: FULL }, { clipPath: this._cardClip() }],
        { duration: CLOSE_MS, easing: EASE_CLOSE, fill: 'forwards' },
      );
      // кейс отдаляется, пока окно сворачивается в карту
      this.contentAnim?.cancel();
      this.contentAnim = this.content.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.94)' }],
        { duration: CLOSE_MS, easing: EASE_CLOSE, fill: 'forwards' },
      );
      // в фоновой вкладке анимации стоят — окно всё равно закрывается по таймеру
      const timeout = new Promise((r) => setTimeout(r, CLOSE_MS + 80));
      await Promise.race([this.anim.finished.catch(() => {}), timeout]);
    }

    this.dialog.close();
    this.anim?.cancel();
    this.contentAnim?.cancel();
    this.anim = null;
    this.contentAnim = null;
    this.closing = false;

    // адрес: окно открыли мы — шаг назад; пришли по ссылке — просто снимаем хэш
    if (!fromHistory && location.hash === this.hash) {
      if (history.state?.case === this.dialog.id) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    }

    this.opener.focus({ preventScroll: true });
  }
}

/**
 * Первый экран продукта свёрстан в натуральную ширину и сжимается под рамку.
 * На узкой рамке сжатие останавливается: виден левый край — логотип, афиша, кнопка.
 */
function fitShots(root) {
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const w = e.contentBoxSize?.[0]?.inlineSize ?? e.contentRect.width;
      const k = Math.max(w / SHOT_WIDTH, SHOT_MIN_SCALE);
      e.target.style.setProperty('--k', k.toFixed(4));
    }
  });
  for (const shot of root.querySelectorAll('[data-shot]')) ro.observe(shot);
  return ro;
}

/**
 * Глубина колоды и заголовка — одна прокрутка, три переменные:
 *   --head  заголовок раздела: 0 — внизу экрана и далеко, 1 — на месте;
 *   --rise  карта: 1 — только показалась снизу, 0 — встала в стопку;
 *   --cover карта: насколько её накрыла следующая.
 * Трансформы карты идут от её верхнего края, поэтому верх, по которому
 * всё считается, от них почти не сдвигается.
 */
function bindDepth(section, cards) {
  if (reduced()) return () => {};

  const head = section.querySelector('[data-work-head]');
  let stickTops = [];
  const measure = () => {
    stickTops = cards.map((card) => parseFloat(getComputedStyle(card).top) || 0);
  };

  let ticking = false;
  const apply = () => {
    ticking = false;
    const vh = innerHeight;

    if (head) {
      const top = head.getBoundingClientRect().top;
      head.style.setProperty('--head', easeOut(clamp((vh - top) / (vh * 0.55), 0, 1)).toFixed(3));
    }

    const rects = cards.map((card) => card.getBoundingClientRect());
    cards.forEach((card, i) => {
      // распрямляется к середине экрана: дальше карта уже читается ровной
      const rise = clamp((rects[i].top - stickTops[i]) / (vh - stickTops[i]), 0, 1);
      card.style.setProperty('--rise', (rise * rise).toFixed(3));

      const next = rects[i + 1];
      const cover = next ? clamp(1 - (next.top - rects[i].top) / rects[i].height, 0, 1) : 0;
      card.style.setProperty('--cover', cover.toFixed(3));
    });
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(apply);
  };
  const onResize = () => {
    measure();
    onScroll();
  };

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  measure();
  apply();
  return () => {
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onResize);
  };
}

/** Название проекта дешифруется, когда карта выходит на экран. Один раз. */
function bindTitles(root) {
  if (reduced()) return null;

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const title = e.target;
      if (!e.isIntersecting) {
        // строку стираем только здесь: наблюдатель ответил, карта за экраном.
        // Не отрисовалось ни кадра (робот, фоновая вкладка) — название на месте
        if (!title.dataset.armed) {
          title.dataset.armed = '1';
          title.textContent = '';
        }
        continue;
      }
      io.unobserve(title);
      decrypt(title, title.dataset.text, { stagger: 42 });
    }
  }, { threshold: 0.6 });

  for (const title of root.querySelectorAll('[data-card-title]')) {
    const text = title.textContent.trim();
    title.dataset.text = text;
    // пока строка перебирается, скринридер читает имя, а не мусор
    title.setAttribute('aria-label', text);
    io.observe(title);
  }
  return io;
}

export function mountWork(section) {
  if (!section) return null;

  const cards = [...section.querySelectorAll('[data-card]')];
  const views = new Map();

  for (const btn of section.querySelectorAll('[data-open]')) {
    const dialog = document.getElementById(btn.dataset.open);
    if (!dialog) continue;
    const view = new CaseView(dialog, btn.closest('[data-card]'), btn);
    views.set(view.hash, view);
    btn.addEventListener('click', () => view.open());
  }

  // «назад» и «вперёд» открывают и закрывают окна вслед за адресом
  addEventListener('popstate', () => {
    for (const view of views.values()) {
      if (location.hash === view.hash) view.open({ push: false });
      else if (view.dialog.open) view.close({ fromHistory: true });
    }
  });

  const shots = fitShots(section);
  const undepth = bindDepth(section, cards);
  bindTitles(section);

  // прямая ссылка на кейс
  views.get(location.hash)?.open({ instant: true, push: false });

  return {
    views,
    destroy() {
      shots.disconnect();
      undepth();
    },
  };
}
