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
 * Названия карт дешифруются общим модулем по атрибуту (see motion/decrypt.js).
 *
 * prefers-reduced-motion: окно открывается и закрывается без анимации,
 * стопка не сжимается.
 */
import { onScrollFrame, requestFrame } from '../motion/frame.js';
import { reduced } from '../motion/reduced.js';

// ширина, под которую свёрстан первый экран редизайна; в карте он масштабируется
const SHOT_WIDTH = 1180;

const OPEN_MS = 620;
const CLOSE_MS = 420;
const EASE_OPEN = 'cubic-bezier(.16, 1, .3, 1)';
const EASE_CLOSE = 'cubic-bezier(.4, 0, .2, 1)';
const FULL = 'inset(0px 0px 0px 0px round 0px)';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - (1 - t) ** 3;

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
 * Первый экран продукта свёрстан в натуральную ширину 1180px и сжимается
 * под ширину рамки: макет виден целиком на любом экране, обрезать его
 * справа нельзя — на телефоне от него оставалась левая треть.
 */
function fitShots(root) {
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const w = e.contentBoxSize?.[0]?.inlineSize ?? e.contentRect.width;
      e.target.style.setProperty('--k', (w / SHOT_WIDTH).toFixed(4));
    }
  });
  const shots = [...root.querySelectorAll('[data-shot]')];
  for (const shot of shots) ro.observe(shot);
  // первый проход сразу: наблюдатель может не успеть до первого кадра,
  // и макет остался бы на запасном масштабе из CSS
  for (const shot of shots) {
    shot.style.setProperty('--k', (shot.getBoundingClientRect().width / SHOT_WIDTH).toFixed(4));
  }
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

  splitTitle(section.querySelector('.work__title'));

  // геометрия читается в общей фазе чтения, стили пишутся в общей фазе
  // записи — иначе каждая запись переменной обесценивает следующее чтение
  // (see motion/frame.js)
  const read = () => ({
    vh: innerHeight,
    headTop: head ? head.getBoundingClientRect().top : 0,
    rects: cards.map((card) => card.getBoundingClientRect()),
  });

  const write = ({ vh, headTop, rects }) => {
    if (head) {
      // Ход заголовка начинается на 0.18 экрана раньше, чем он войдёт в кадр:
      // к этому моменту строка в зрачке гаснет, и первые буквы принимают
      // эстафету, а не появляются в пустоте после паузы (замер: глаз на
      // нуле при --exit ≈ 0.33, прежняя формула давала ноль до 0.4).
      const raw = clamp((vh * 1.18 - headTop) / (vh * 0.98), 0, 1);
      // Глубине нужно замедление к концу: блок должен встать, а не доползать.
      head.style.setProperty('--head', easeOut(raw).toFixed(3));
      // Ленте появления — равномерный ход. С тем же easeOut две трети букв
      // вставали на место, пока заголовок ещё под сгибом, и на экран он
      // выезжал уже собранным: сборку никто не видел.
      head.style.setProperty('--tape', raw.toFixed(3));
    }

    cards.forEach((card, i) => {
      // распрямляется к середине экрана: дальше карта уже читается ровной
      const rise = clamp((rects[i].top - stickTops[i]) / (vh - stickTops[i]), 0, 1);
      card.style.setProperty('--rise', (rise * rise).toFixed(3));

      const next = rects[i + 1];
      const cover = next ? clamp(1 - (next.top - rects[i].top) / rects[i].height, 0, 1) : 0;
      card.style.setProperty('--cover', cover.toFixed(3));
    });
  };

  const onResize = () => {
    measure();
    requestFrame();
  };

  addEventListener('resize', onResize);
  measure();
  const off = onScrollFrame(read, write);
  return () => {
    off();
    removeEventListener('resize', onResize);
  };
}

/**
 * Разбирает заголовок раздела на буквы: каждая получает свою долю --d
 * в общей ленте появления и вектор, по которому приезжает на место.
 *
 * Появление ведёт --head, а не таймер: раздел наезжает на хвост навыков,
 * и буквы должны собираться ровно тогда, когда зрачок растворяется —
 * при таймере это совпало бы только на одной скорости прокрутки.
 * Прокрутили назад — буквы так же разлетелись.
 *
 * Буквы прилетают сверху-справа, оттуда, где только что был глаз, и
 * с разбросом: ровная лесенка читается титрами, а не сборкой.
 * Разброс детерминированный — один и тот же заголовок собирается одинаково.
 *
 * Скринридеру буквы не нужны: строка уходит в aria-label целиком,
 * иначе заголовок читался бы по одному символу.
 */
function splitTitle(title) {
  if (!title || reduced()) return;

  const text = title.textContent.trim();
  title.setAttribute('aria-label', text);
  title.textContent = '';

  const chars = [...text];
  const frag = document.createDocumentFragment();

  chars.forEach((ch, i) => {
    if (ch === ' ') {
      frag.append(' ');
      return;
    }
    const span = document.createElement('span');
    span.className = 'work__char';
    span.textContent = ch;
    // «случайность», одинаковая при каждой сборке
    const n = Math.sin(i * 12.9898) * 43758.5453;
    const jitter = n - Math.floor(n);
    span.style.setProperty('--d', (i / Math.max(1, chars.length - 1)).toFixed(3));
    span.style.setProperty('--dx', `${(18 + jitter * 44).toFixed(1)}px`);
    span.style.setProperty('--dy', `${(-22 - jitter * 52).toFixed(1)}px`);
    frag.append(span);
  });

  title.append(frag);
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
