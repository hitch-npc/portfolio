/**
 * Circular Gallery — кольцо, которое наезжает на зрителя.
 *
 * Геометрия. Карточки расставлены по окружности радиуса R и развёрнуты
 * по касательной: карточка под углом α стоит в (R·cos α, R·sin α) и повёрнута
 * на α + 90°. Отсчёт идёт от 3π/2 — нижней точки кольца: именно она приходит
 * к зрителю первой, и порядок карточек читается от неё.
 *
 * Прокрутка. Одна величина — progress — гонит два разных движения подряд.
 * Первые entryCards карточек прокрутки кольцо не крутится, а приближается:
 * масштаб идёт от «всё кольцо в кадре» до zoom, центр уезжает вниз на lift,
 * и кольцо выходит за низ экрана. Дальше кольцо крутится под неподвижным
 * зрителем. Разделяет их entryFraction; после полного оборота progress
 * откатывается на lapProgress назад — шва не видно, потому что кольцо
 * замкнуто, и кадр после отката совпадает с кадром до него.
 *
 * Почему оборот неполный. spanDeg = (count − 1)/count · 360: кольцо
 * доезжает не до исходной карточки, а до соседней с ней. Полный круг
 * вернул бы ту же карточку в ту же точку и прокрутка читалась бы холостой.
 *
 * Дешевизна. Наводка гаснет вместе с наездом (weight = 1 − entry), поэтому
 * после наезда матрицы карточек перестают меняться: крутится кольцо, а не
 * карточки в нём. Значит в установившемся режиме на кадр приходится одна
 * запись transform вместо count + 2 — этим кольцо и живёт на слабых машинах.
 * Карточки трогаются только пока entry < 1 или пока курсор рядом, и каждая —
 * только если её матрица правда изменилась (see _writeCard).
 *
 * Наводка работает лишь там, где есть курсор: (hover: hover) и (pointer: fine).
 * На тач-устройствах ветка не включается вовсе — и это же делает их случай
 * самым дешёвым.
 *
 * Ступени. Цель прокрутки подтягивается к ближайшей карточке, а не идёт
 * слитно: на спокойном листании карточки выходят в фокус по одной, каждая
 * успевает встать. Бросок тачпада уводит цель на десяток карточек вперёд —
 * кольцо проворачивается мимо них с потолком скорости и мягко тормозит на
 * той, куда попала прокрутка (see motion/scrub.js). Наезд не ступенчатый:
 * приближение должно идти за прокруткой слитно.
 *
 * Свайп вбок. На телефоне кольцо читается как карусель, и палец тянется
 * листать вбок — а ведёт кольцо вертикальная прокрутка страницы. Поэтому
 * горизонтальное движение переводится в прокрутку страницы: положение
 * кольца по-прежнему считается только от неё, и рассинхрону взяться неоткуда.
 * Вертикальный свайп при этом не трогается вовсе — им занимается браузер,
 * с родной инерцией. Делит их touch-action: pan-y pinch-zoom (see gallery.css):
 * вертикаль остаётся браузеру, горизонталь достаётся нам, и событие приходит
 * отменяемым. Оба жеста живые, ни один не обязателен.
 *
 * Конец ленты. В режиме страницы один проход — вся лента, от первой
 * карточки до последней; дальше кольцо стоит, а прокрутка уходит странице.
 * Хвост трека (tail) оставлен на то, чтобы последняя карточка успела
 * встать и подержаться в кадре, а не уехала в тот же миг.
 *
 * Клик. Карточка — кнопка, и кольцо о ней больше ничего не знает: оно
 * зовёт onPick и отдаёт постер вместе с элементом. Что показывать дальше —
 * дело вызывающего (see poster-detail.js). Слушатель один на всё кольцо.
 *
 * Надпись в центре. Живёт рядом с кольцом, а не внутри: внутри крутилась бы
 * вместе с карточками. На наезде она не уезжает с центром кольца (тот уходит
 * за нижний край) и не гаснет, а опускается под постер, мельчает и тускнеет:
 * середину занимает постер, а метка раздела остаётся на виду всю прокрутку.
 *
 * prefers-reduced-motion: кольцо стоит в конечном положении наезда,
 * без вращения, без наводки, без кадров.
 */

import { onScrollFrame } from '../motion/frame.js';
import { scrub } from '../motion/scrub.js';
import { haptics } from '../motion/haptics.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (t) => t * t * (3 - 2 * t);

// нижняя точка кольца: отсюда карточки приходят к зрителю
const FOCUS_ANGLE = (Math.PI * 3) / 2;
// перспектива карточки — её собственная, иначе разворот читается плоским
const CARD_PERSPECTIVE = 1000;
const STAGE_PERSPECTIVE = 2000;
// доля, на которую значение догоняет цель за кадр при 60 Гц
const HOVER_LERP = 0.15;
// мёртвая зона ступени: карточка меняется не ровно на половине шага, а чуть
// позже — иначе на самой границе кольцо дёргается между соседями
const SNAP_DEAD = 0.12;
// надпись после наезда: какая доля роста и какая доля яркости от исходных
const HUB_SMALL = 0.82;
const HUB_DIM = 0.38;
// и на сколько от низа блока встаёт её середина — под постером, над подсказкой
const HUB_BOTTOM = 150;
// матрицу не переписываем, пока сдвиг меньше половины физического пикселя
const EPS = 0.004;
// колесо отдаёт до 400 px за событие; больше — это уже инерция трекпада
const WHEEL_CLAMP = 400;
const TOUCH_GAIN = 2.2;

export const GALLERY = {
  count: 13,          // карточек в кольце; витрина ставит по числу постеров
  ringRadius: 286,    // радиус кольца в его собственных единицах
  // Карточка и приближение связаны: на экране постер выходит ростом
  // cardH/ringRadius от радиуса кольца, а сколько карточек помещается
  // в кадр — задаёт одно приближение. Здесь выбрано «по одному крупно»:
  // 80/286 при zoom 5.5 даёт постер почти во весь экран и ровно одну
  // карточку в кадре; соседние подходят с краёв.
  cardW: 82,          // карточка в тех же единицах: масштаб задаёт кольцо
  cardH: 80,
  cardRadius: 0,      // постер без скругления: рамка не спорит с работой
  zoom: 5.5,          // во сколько раз кольцо вырастает к концу наезда
  zoomOffset: -52,    // ручная поправка к подъёму центра, px
  sensitivity: 0.5,   // 0…10 — сколько прокрутки стоит одна карточка (drive: 'wheel')
  smoothing: 9,       // 0…10 — инерция прокрутки
  maxSpeed: 15,       // потолок: карточек в секунду, сколько бы ни накрутили; 0 — снять
  snap: true,         // цель подтягивается к ближайшей карточке
  buzz: true,         // тик пальцу на каждую карточку — где телефон это умеет
  swipeCard: 110,     // пикселей пальца на карточку при свайпе вбок; 0 — выключить
  tail: 0.14,         // доля трека после последней карточки (drive: 'page')
  reach: 3,           // радиус действия курсора
  strength: 6,        // насколько сильно карточка отталкивается и растёт
  parallax: 2.5,      // наклон всей сцены за курсором
  entryCards: 3,      // сколько карточек прокрутки занимает наезд
  laps: 1,            // оборотов на всю высоту трека (drive: 'page')
  fit: true,          // карточка берёт пропорции картинки; false — общий размер
  fitMin: 0.55,       // предельные пропорции: у́же и шире карточка не станет
  fitMax: 1.5,        // шире — и разворот ляжет на соседей по кольцу
  hub: 'ARCHIVED WORKS',  // надпись в центре кольца; '' — убрать
  drive: 'wheel',     // 'wheel' — колесо внутри блока, 'page' — прокрутка страницы
  naive: false,       // снять экономию кадра — для замеров «до/после», см. _frame
};

// подсказка к клику: на тач-устройствах жест называется иначе
const HINT_CLICK = 'Click a poster to open it';
const HINT_TAP = 'Tap a poster to open it';

/** Кольцо принимает и голые адреса, и постеры целиком. */
const asItem = (v) => (typeof v === 'string' ? { src: v } : v);

/** Угол карточки: отсчёт от нижней точки кольца. */
const cardAngle = (i, count) => (i / Math.max(1, count)) * TAU + FOCUS_ANGLE;

/** Заглушка вместо картинки: кольцо должно читаться и без контента. */
function placeholderFill(i) {
  const hue = (i * 47 + 210) % 360;
  return `linear-gradient(150deg, hsl(${hue} 38% 30%), hsl(${(hue + 45) % 360} 52% 8%))`;
}

export class CircularGallery {
  /**
   * @param {HTMLElement} root блок, в котором живёт кольцо
   * @param {string[]} [images] адреса картинок; короче count — повторяются
   * @param {Partial<typeof GALLERY>} [params]
   */
  constructor(root, images = [], params = {}) {
    this.root = root;
    this.p = { ...GALLERY, ...params };
    this.images = images;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.hoverable = matchMedia('(hover: hover) and (pointer: fine)').matches;

    this.paused = false;
    this.writes = 0;      // записей transform за последний кадр — для замеров
    this._raf = null;
    this._last = 0;

    this.progress = 0;
    this.target = 0;
    this.entry = 0;
    this.cards = [];
    this.onPick = null;   // (item, el) => void — клик по карточке
    this.pointer = null;  // координаты курсора, снятые в событии и прочитанные в кадре
    this._dragged = false;
    this._hubLast = '';
    this._snapAt = 0;
    // отдача заводится один раз: где её нет, здесь остаётся null
    this._buzz = this.p.buzz ? haptics() : null;
    this._buzzAt = null;
    this._run = 1;      // длина хода трека, снимается в кадре прокрутки
    this._glideRaf = 0;
    this._grown = false;
    this.tilt = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    this._ringLast = '';
    this._stageLast = '';
    this._settled = false;
    this._live = false;

    this._build();
    this._derive();
    this._bind();
  }

  /* ─── разметка ─────────────────────────────────────────────────── */

  _build() {
    this.root.classList.add('gallery');
    this.stage = document.createElement('div');
    this.stage.className = 'gallery__stage';
    this.stage.style.perspective = `${STAGE_PERSPECTIVE}px`;

    this.ring = document.createElement('div');
    this.ring.className = 'gallery__ring';

    this.hub = document.createElement('div');
    this.hub.className = 'gallery__hub';
    this.hub.setAttribute('aria-hidden', 'true');
    const hubTitle = document.createElement('p');
    hubTitle.className = 'gallery__hub-title';
    hubTitle.textContent = this.p.hub;
    this.hub.append(hubTitle);
    this.hub.hidden = !this.p.hub;

    // подсказка к клику: гаснет навсегда, как только карточку открыли
    this.cue = document.createElement('p');
    this.cue.className = 'gallery__cue';
    this.cue.textContent = this.hoverable ? HINT_CLICK : HINT_TAP;

    this.stage.append(this.ring, this.hub);
    this.root.append(this.stage, this.cue);
    this._buildCards();
  }

  /** Карточки строятся заново только когда меняется их число. */
  _buildCards() {
    const count = Math.max(1, Math.round(this.p.count));
    const src = this.images.length ? this.images : [];

    this.ring.textContent = '';
    this.cards = [];

    for (let i = 0; i < count; i += 1) {
      // кнопка, а не div: карточка открывается кликом, и клавиатуре
      // с экранным диктором это объясняется один раз — тегом
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'gallery__card';

      const item = src.length ? asItem(src[i % src.length]) : null;
      const url = item?.src ?? null;
      // без постера открывать нечего: кнопка выпадает и из обхода табом
      el.disabled = !item;
      if (item) el.setAttribute('aria-label', item.title || `Poster ${i + 1}`);
      let img = null;
      if (url) {
        img = document.createElement('img');
        img.className = 'gallery__img';
        img.src = url;
        img.alt = '';
        img.draggable = false;
        // картинка вне кадра не должна задерживать первый экран
        img.loading = 'lazy';
        img.decoding = 'async';
        el.append(img);
      } else {
        const fill = document.createElement('div');
        fill.className = 'gallery__img';
        fill.style.background = placeholderFill(i);
        el.append(fill);
      }

      this.ring.append(el);
      const card = {
        el,
        item,
        aspect: 0,
        angle: cardAngle(i, count),
        rot: 0, rotT: 0,
        x: 0, xT: 0,
        y: 0, yT: 0,
        scale: 1, scaleT: 1,
        last: '',
      };
      this.cards.push(card);

      // пропорции известны только после загрузки; до неё карточка стоит
      // в общем размере, потом подгоняется под свой постер
      if (img) {
        const fit = () => {
          if (!img.naturalWidth || !img.naturalHeight) return;
          card.aspect = clamp(img.naturalWidth / img.naturalHeight, this.p.fitMin, this.p.fitMax);
          this._fitCard(card);
        };
        if (img.complete) fit();
        else img.addEventListener('load', fit, { once: true });
      }
    }
    // открывать нечего — и подсказывать не о чем
    this.cue.hidden = !this.cards.some((c) => c.item);
    this._applyCardBox();
  }

  /** Габариты карточки живут в CSS-переменных: менять их перестройкой дорого. */
  _applyCardBox() {
    const { cardW, cardH, cardRadius } = this.p;
    const st = this.root.style;
    st.setProperty('--card-w', `${cardW}px`);
    st.setProperty('--card-h', `${cardH}px`);
    st.setProperty('--card-r', `${cardRadius}px`);
    for (const card of this.cards) this._fitCard(card);
  }

  /**
   * Ширина карточки под пропорции её постера. Высота у всех общая, меняется
   * ширина — так в кольце стоят и квадраты, и вертикали, и развороты, и
   * ничего не обрезается: кадр совпадает с картинкой, обрезать нечего.
   * Пределы нужны, чтобы разворот не лёг на соседей, а узкая вертикаль
   * не выродилась в полоску.
   */
  _fitCard(card) {
    if (!this.p.fit || !card.aspect) {
      card.el.style.removeProperty('--card-w');
      return;
    }
    card.el.style.setProperty('--card-w', `${(this.p.cardH * card.aspect).toFixed(1)}px`);
  }

  /* ─── производные величины ─────────────────────────────────────── */

  _derive() {
    const p = this.p;
    const count = Math.max(1, Math.round(p.count));
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;

    // кольцо целиком в кадре: диаметр плюс диагональ самой широкой карточки
    const wide = p.fit ? Math.max(p.cardW, p.cardH * p.fitMax) : p.cardW;
    const span = 2 * p.ringRadius + Math.hypot(wide, p.cardH);
    this.baseScale = w > 0 && h > 0 ? clamp(Math.min(w, h) / span, 0.01, 1) : 1;
    this.zoomScale = clamp(p.zoom, 0.5, 20) * this.baseScale;
    this.lift = p.ringRadius * this.zoomScale + p.zoomOffset;

    const total = Math.max(1, p.entryCards + (count - 1));
    this.entryFraction = p.entryCards / total;
    this.spanDeg = ((count - 1) * 360) / count;
    this.lapProgress = (1 - this.entryFraction) * (count / Math.max(1, count - 1));
    this.scrollTotal = Math.max(1, (400 - clamp(p.sensitivity, 0, 10) * 32) * total);
    this.scrollLerp = clamp(0.16 - clamp(p.smoothing, 0, 10) * 0.012, 0.03, 0.16);
    // одна карточка прокрутки — это ровно 1/total хода progress, и в наезде,
    // и во вращении: потолок в карточках переводится в потолок хода делением
    this.cardSpeed = Math.max(0, p.maxSpeed) / total;
    // одна карточка прокрутки в долях progress — шаг ступени
    this.cardStep = 1 / total;

    // куда уходит надпись: от середины блока к его низу
    this.hubDrop = Math.max(0, h / 2 - HUB_BOTTOM);

    this.hoverRadius = (100 + p.reach * 80) * this.baseScale;
    this.falloff = Math.max(1, this.hoverRadius / 2);
    this.push = p.strength * 10;
    this.grow = p.strength * 0.06;
    this.tiltMax = p.parallax * 3;
    this.twistMax = p.parallax;
  }

  /**
   * Перенастройка на лету. Карточки пересобираются только если изменилось их
   * число или картинки — остальное уезжает в производные и CSS-переменные.
   */
  setParams(patch = {}) {
    const rebuild = 'count' in patch && Math.round(patch.count) !== Math.round(this.p.count);
    Object.assign(this.p, patch);
    if (rebuild) this._buildCards();
    else this._applyCardBox();
    this._derive();
    this._invalidate();
    if (this.reduced || this.paused) this._frame(0);
  }

  setImages(images) {
    this.images = images;
    this._buildCards();
    this._invalidate();
  }

  /**
   * Сбрасывает кеш матриц: следующий кадр перепишет всё. Вместе с кешем
   * обязательно снимается и флаг «всё улеглось»: иначе после пересборки
   * карточек кадр выходил из расчёта раньше, чем расставил их, и кольцо
   * схлопывалось в одну точку в центре.
   */
  _invalidate() {
    this._snapAt = Math.max(0, Math.round((this.progress - this.entryFraction) / this.cardStep));
    this._ringLast = '';
    this._stageLast = '';
    this._hubLast = '';
    this._settled = false;
    for (const c of this.cards) c.last = '';
  }

  /* ─── ввод ─────────────────────────────────────────────────────── */

  _bind() {
    this._onResize = () => { this._derive(); this._invalidate(); if (this.reduced) this._frame(0); };
    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(this.root);

    if (this.reduced) return;

    // курсор только запоминается: считать наводку в событии значит считать её
    // чаще, чем рисуется кадр — на 120-герцевых мышах вдвое чаще
    this._onPointer = (e) => {
      if (!this.hoverable) return;
      const r = this.root.getBoundingClientRect();
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
      // наивный режим считает наводку прямо в событии: событий указателя
      // приходит больше, чем рисуется кадров, и вся разница уходит в холостую
      if (this.p.naive) this._hover();
    };
    this._onLeave = () => { this.pointer = null; };
    this.root.addEventListener('pointermove', this._onPointer, { passive: true });
    this.root.addEventListener('pointerleave', this._onLeave, { passive: true });

    // слушатель один на всё кольцо: карточек два десятка, и они пересобираются
    this._onClick = (e) => {
      if (this._dragged) return;   // пальцем крутили, а не выбирали
      const el = e.target.closest?.('.gallery__card');
      const card = el && this.cards.find((c) => c.el === el);
      if (!card?.item) return;
      this.root.classList.add('is-picked');   // подсказка своё отработала
      this.onPick?.(card.item, el);
    };
    this.ring.addEventListener('click', this._onClick);

    if (this.p.drive === 'page') this._bindPage();
    else this._bindWheel();
  }

  /** Колесо внутри блока. Вверх на нуле отдаём странице — блок не запирает прокрутку. */
  _bindWheel() {
    const advance = (px) => { this.target = Math.max(0, this.target + px / this.scrollTotal); };
    const spent = (d) => d < 0 && this.target <= 0;

    this._onWheel = (e) => {
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;
      else if (e.deltaMode === 2) d *= this.root.clientHeight || 800;
      d = clamp(d, -WHEEL_CLAMP, WHEEL_CLAMP);
      if (spent(d)) return;
      e.preventDefault();
      advance(d);
    };

    let ty = null;
    let ty0 = null;
    this._onTouchStart = (e) => {
      ty = e.touches[0]?.clientY ?? null;
      ty0 = ty;
      this._dragged = false;
    };
    this._onTouchMove = (e) => {
      const y = e.touches[0]?.clientY;
      if (y == null || ty == null) return;
      // сдвиг больше полпальца — это прокрутка, и клик за ней не считается
      if (Math.abs(y - ty0) > 8) this._dragged = true;
      const d = clamp((ty - y) * TOUCH_GAIN, -WHEEL_CLAMP, WHEEL_CLAMP);
      ty = y;
      if (spent(d)) return;
      if (e.cancelable) e.preventDefault();
      advance(d);
    };
    this._onTouchEnd = () => { ty = null; };

    this.root.addEventListener('wheel', this._onWheel, { passive: false });
    this.root.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.root.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.root.addEventListener('touchend', this._onTouchEnd, { passive: true });
    this.root.addEventListener('touchcancel', this._onTouchEnd, { passive: true });
  }

  /**
   * Прокрутка страницы. Блок не перехватывает колесо вовсе: кольцо читает
   * своё положение внутри трека — высокой обёртки с закреплённым кольцом.
   * Так кольцо встраивается в одностраничник и не дерётся с ним за прокрутку.
   *
   * Чтение геометрии и запись цели разведены по фазам общего кадра
   * (see motion/frame.js): свой слушатель прокрутки читал бы этот rect
   * после чужих записей и заставлял браузер пересчитывать вёрстку посреди
   * кадра — тем дороже, чем больше на странице таких блоков.
   */
  _bindPage() {
    const track = this.root.closest('[data-gallery-track]') || this.root;
    this._offScroll = onScrollFrame(
      () => {
        const r = track.getBoundingClientRect();
        const run = Math.max(1, r.height - innerHeight);
        return { k: clamp(-r.top / run, 0, 1), run };
      },
      ({ k, run }) => {
        // длина хода нужна свайпу: по ней считается, сколько прокрутки
        // стоит одна карточка
        this._run = run;
        // хвост трека кольцо не крутит: он нужен, чтобы последняя карточка
        // успела встать и подержаться в кадре, прежде чем раздел уедет вверх
        const ride = clamp(k / Math.max(0.05, 1 - this.p.tail), 0, 1);
        // один проход — вся лента: ride === 1 ставит в фокус последнюю
        // карточку, и дальше кольцо стоит
        this.target = ride * (this.entryFraction + (1 - this.entryFraction) * this.p.laps);
      },
    );

    if (this.p.swipeCard > 0) this._bindSwipe();
  }

  /** Во сколько раз прокрутка страницы обгоняет палец. */
  get _swipeGain() {
    const steps = Math.max(1, this.p.entryCards + Math.max(1, Math.round(this.p.count)) - 1);
    return (this._run * (1 - this.p.tail)) / steps / this.p.swipeCard;
  }

  /**
   * Свайп вбок ведёт ту же прокрутку страницы, что и обычный.
   *
   * Направление выбирается на первом же движении и до конца жеста не
   * меняется: пока браузер не начал прокрутку, её ещё можно забрать,
   * а после — уже нет. Диагональ отдаётся странице: чтобы жест признали
   * горизонтальным, вбок нужно пройти заметно больше, чем вверх.
   *
   * От самых краёв экрана жест игнорируется — там iOS ловит «назад».
   */
  _bindSwipe() {
    const EDGE = 24;
    // порог: пока палец не сдвинулся, о направлении говорить рано
    const WAKE = 6;
    let x0 = 0;
    let y0 = 0;
    let from = 0;
    let xPrev = 0;
    let tPrev = 0;
    let vx = 0;
    let side = false;   // false — не наш жест, null — ещё не решили, true — наш

    this._onSwipeStart = (e) => {
      side = false;
      cancelAnimationFrame(this._glideRaf);
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX < EDGE || t.clientX > innerWidth - EDGE) return;
      x0 = xPrev = t.clientX;
      y0 = t.clientY;
      from = scrollY;
      tPrev = e.timeStamp;
      vx = 0;
      side = null;
    };

    this._onSwipeMove = (e) => {
      if (side === false || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;

      if (side === null) {
        if (Math.abs(dx) < WAKE && Math.abs(dy) < WAKE) return;
        side = Math.abs(dx) > Math.abs(dy) * 1.4;
        if (!side) return;   // вертикаль — страница листает сама
      }

      if (e.cancelable) e.preventDefault();
      if (e.timeStamp > tPrev) vx = (t.clientX - xPrev) / (e.timeStamp - tPrev);
      xPrev = t.clientX;
      tPrev = e.timeStamp;
      // палец влево — лента вперёд, то есть страница вниз
      scrollTo(0, Math.max(0, from - dx * this._swipeGain));
    };

    this._onSwipeEnd = () => {
      if (side !== true) { side = false; return; }
      side = false;
      this._glide(-vx * this._swipeGain);
    };

    this.root.addEventListener('touchstart', this._onSwipeStart, { passive: true });
    this.root.addEventListener('touchmove', this._onSwipeMove, { passive: false });
    this.root.addEventListener('touchend', this._onSwipeEnd, { passive: true });
    this.root.addEventListener('touchcancel', this._onSwipeEnd, { passive: true });
  }

  /**
   * Доводка после броска: страница едет сама и затухает. Своя, потому что
   * жест мы у браузера забрали, а вместе с ним и его инерцию. Дальше кольцо
   * всё равно подтянет к ближайшей карточке — сюда точность не нужна.
   * @param {number} v пикселей страницы на миллисекунду в момент отпускания
   */
  _glide(v) {
    let speed = clamp(v, -4, 4) * 16;   // в пиксели за кадр
    if (Math.abs(speed) < 1) return;
    const step = () => {
      speed *= 0.94;
      if (Math.abs(speed) < 0.4) return;
      scrollTo(0, Math.max(0, scrollY + speed));
      this._glideRaf = requestAnimationFrame(step);
    };
    this._glideRaf = requestAnimationFrame(step);
  }

  /* ─── кадр ─────────────────────────────────────────────────────── */

  /** Наводка: считается один раз за кадр по запомненному курсору. */
  _hover() {
    const pt = this.pointer;
    const cx = pt ? pt.w / 2 : 0;
    const cy = pt ? pt.h / 2 : 0;

    if (pt) {
      const px = cx ? (pt.x - cx) / cx : 0;
      const py = cy ? (pt.y - cy) / cy : 0;
      this.tilt.ty = px * this.tiltMax;
      this.tilt.tx = -py * this.tiltMax;
      this.tilt.tz = (px + py) * this.twistMax;
    } else {
      this.tilt.tx = this.tilt.ty = this.tilt.tz = 0;
    }

    for (const c of this.cards) {
      if (!pt) { c.rotT = 0; c.scaleT = 1; c.xT = 0; c.yT = 0; continue; }
      const kx = cx + this.baseScale * (this.p.ringRadius * Math.cos(c.angle) + c.x);
      const ky = cy + this.baseScale * (this.p.ringRadius * Math.sin(c.angle) + c.y);
      const dist = Math.hypot(pt.x - kx, pt.y - ky);
      if (dist < this.hoverRadius) {
        const force = Math.max(0, 1 - dist / this.falloff);
        const move = this.push * force;
        c.rotT = 180 * force;
        c.scaleT = 1 + this.grow * force;
        c.xT = move * Math.cos(c.angle);
        c.yT = move * Math.sin(c.angle);
      } else {
        c.rotT = 0; c.scaleT = 1; c.xT = 0; c.yT = 0;
      }
    }
  }

  /**
   * Цель, подтянутая к ближайшей карточке. Наезд не трогаем: приближение
   * должно идти за прокруткой слитно, ступени начинаются после него.
   *
   * Шаг кольца — ровно 1/total хода progress, а откат оборота кратен шагу
   * (lapProgress = count шагов), поэтому сетка ступеней переживает откат.
   */
  _snap(raw) {
    if (!this.p.snap || raw <= this.entryFraction) {
      this._snapAt = 0;
      return raw;
    }
    const at = (raw - this.entryFraction) / this.cardStep;
    if (Math.abs(at - this._snapAt) > 0.5 + SNAP_DEAD) this._snapAt = Math.round(at);
    return this.entryFraction + this._snapAt * this.cardStep;
  }

  /**
   * Один кадр. Возвращать наружу нечего — всё уходит в transform.
   * @param {number} dt секунд с прошлого кадра
   */
  _frame(dt) {
    const p = this.p;
    this.writes = 0;

    // инерция подводит к цели мягко, потолок скорости не даёт броску тачпада
    // промотать кольцо целиком: на спокойной прокрутке он не включается
    // вовсе, на броске растягивает его (see motion/scrub.js)
    this.progress = scrub(this.progress, this._snap(this.target), dt, {
      lerp: this.scrollLerp,
      speed: this.cardSpeed,
    });

    // оборот замкнут: откатываем и текущее, и цель — иначе цель убежит в бесконечность
    const lapEnd = this.entryFraction + this.lapProgress;
    if (this.progress >= lapEnd) {
      this.progress -= this.lapProgress;
      this.target -= this.lapProgress;
    }

    this.entry = smoothstep(clamp(this.progress / this.entryFraction, 0, 1));

    // тик на каждую прошедшую фокус карточку. Считается по progress, а не
    // по цели: на броске мимо зрителя проходит десяток карточек, и отдача
    // должна отсчитать их все, а не щёлкнуть один раз в конце. Наезд молчит:
    // карточек там ещё нет, есть приближение
    if (this._buzz && this.entry > 0.9) {
      const at = Math.round((this.progress - this.entryFraction) / this.cardStep);
      if (at !== this._buzzAt) {
        if (this._buzzAt !== null) this._buzz();
        this._buzzAt = at;
      }
    } else if (this._buzzAt !== null) {
      this._buzzAt = null;
    }
    const ride = this.entryFraction < 1
      ? Math.max(0, (this.progress - this.entryFraction) / (1 - this.entryFraction))
      : 0;

    const weight = 1 - this.entry;
    // наводка считается, только пока курсор в блоке или карточки ещё
    // возвращаются на место: без этого 25 гипотенуз и 25 матриц
    // пересчитывались бы каждый кадр при неподвижной мыши за пределами блока
    const naive = this.p.naive;
    const live = naive
      ? this.hoverable
      : weight > EPS && this.hoverable && (this.pointer !== null || !this._settled);

    // слои карточек поднимаются только на время наводки: 25 постоянных
    // композиторских слоёв дороже, чем разовое повышение под движение
    const promote = naive || live;
    if (promote !== this._live) {
      this._live = promote;
      this.root.classList.toggle('is-live', promote);
    }

    if (live) this._hover();

    const k = 1 - (1 - HOVER_LERP) ** (dt * 60);
    const t = this.tilt;
    t.x += (t.tx - t.x) * k;
    t.y += (t.ty - t.y) * k;
    t.z += (t.tz - t.z) * k;

    // сцена наклоняется только пока наводка жива
    if (naive) { this._stageLast = ''; this._ringLast = ''; }

    const stage = `rotate(${(t.z * weight).toFixed(3)}deg) rotateX(${(t.x * weight).toFixed(3)}deg) rotateY(${(t.y * weight).toFixed(3)}deg)`;
    if (stage !== this._stageLast) {
      this.stage.style.transform = stage;
      this._stageLast = stage;
      this.writes += 1;
    }

    const scale = this.baseScale + (this.zoomScale - this.baseScale) * this.entry;
    const ring = `translate3d(0px, ${(this.lift * this.entry).toFixed(2)}px, 0) rotate(${(-ride * this.spanDeg).toFixed(3)}deg) scale(${scale.toFixed(4)})`;
    if (ring !== this._ringLast) {
      this.ring.style.transform = ring;
      this._ringLast = ring;
      this.writes += 1;
    }

    // Наезд доигран — отпускаем слой. Пока кольцо росло, слой был нужен:
    // масштаб менялся каждый кадр. Но растр в него снимается один раз, на
    // том масштабе, какой был в момент подъёма слоя, и Safari его потом не
    // пересобирает — постер так и остаётся растянутым с маленькой копии.
    // Отпустили — браузер перерисовал уже в конечном масштабе.
    const grown = this.entry > 0.999;
    if (grown !== this._grown) {
      this._grown = grown;
      this.root.classList.toggle('is-grown', grown);
    }

    // надпись уходит из центра вниз, под постер, и там остаётся: мельче
    // и тусклее, но на виду — середину кольца занимает постер
    if (this.p.hub) {
      const k = this.entry;
      // уходит с опережением: кольцо на наезде растёт и подбирается к её
      // месту, и на равномерном ходе они пересекались
      const y = ((1 - (1 - k) ** 3) * this.hubDrop).toFixed(1);
      const size = (1 - k * (1 - HUB_SMALL)).toFixed(3);
      const veil = (1 - k * (1 - HUB_DIM)).toFixed(3);
      const hub = `${y}:${size}:${veil}`;
      if (hub !== this._hubLast) {
        this.hub.style.transform = `translate3d(0, ${y}px, 0) scale(${size})`;
        this.hub.style.opacity = veil;
        this._hubLast = hub;
        this.writes += 1;
      }
    }

    // вне наводки смещения карточек нулевые, а значит их матрицы не зависят
    // ни от entry, ни от кадра: считать и сравнивать нечего
    if (!naive && !live && this._settled) return;

    let moving = false;
    for (const c of this.cards) {
      c.rot += (c.rotT - c.rot) * k;
      c.scale += (c.scaleT - c.scale) * k;
      c.x += (c.xT - c.x) * k;
      c.y += (c.yT - c.y) * k;
      if (Math.abs(c.rotT - c.rot) > EPS || Math.abs(c.xT - c.x) > EPS
        || Math.abs(c.yT - c.y) > EPS || Math.abs(c.scaleT - c.scale) > EPS) moving = true;
      if (naive) c.last = '';
      this._writeCard(c, weight, p.ringRadius);
    }
    this._settled = !moving;
  }

  /** Матрица карточки. Пишется только если строка правда изменилась. */
  _writeCard(c, weight, R) {
    const x = R * Math.cos(c.angle) + c.x * weight;
    const y = R * Math.sin(c.angle) + c.y * weight;
    const spin = (c.angle * 180) / Math.PI + 90;
    const twist = c.rot * weight;
    const scale = 1 + (c.scale - 1) * weight;
    const m = `perspective(${CARD_PERSPECTIVE}px) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${spin.toFixed(2)}deg) rotateY(${twist.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    if (m === c.last) return;
    c.el.style.transform = m;
    c.last = m;
    this.writes += 1;
  }

  /* ─── жизненный цикл ───────────────────────────────────────────── */

  start() {
    if (this.reduced) {
      // конечное положение наезда, без кадров: кольцо стоит крупным и прямым
      this.progress = this.target = this.entryFraction;
      this._frame(0);
      return;
    }
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt = this._last ? Math.min((now - this._last) / 1000, 0.05) : 1 / 60;
      this._last = now;
      if (document.hidden || this.paused) return;
      this._frame(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
    this.root.removeEventListener('pointermove', this._onPointer);
    this.root.removeEventListener('pointerleave', this._onLeave);
    this.ring.removeEventListener('click', this._onClick);
    this.root.removeEventListener('wheel', this._onWheel);
    this.root.removeEventListener('touchstart', this._onTouchStart);
    this.root.removeEventListener('touchmove', this._onTouchMove);
    this.root.removeEventListener('touchend', this._onTouchEnd);
    this.root.removeEventListener('touchcancel', this._onTouchEnd);
    this._offScroll?.();
    cancelAnimationFrame(this._glideRaf);
    this.root.removeEventListener('touchstart', this._onSwipeStart);
    this.root.removeEventListener('touchmove', this._onSwipeMove);
    this.root.removeEventListener('touchend', this._onSwipeEnd);
    this.root.removeEventListener('touchcancel', this._onSwipeEnd);
    this.stage.remove();
    this.cue.remove();
  }
}

/**
 * Поднимает кольцо и гасит его за экраном: пока блок не виден,
 * кадры не считаются.
 */
export function mountGallery(root, images, params) {
  if (!root) return null;
  const gallery = new CircularGallery(root, images, params);
  gallery.start();
  new IntersectionObserver(([e]) => { gallery.paused = !e.isIntersecting; }, { rootMargin: '10% 0px' })
    .observe(root);
  return gallery;
}
