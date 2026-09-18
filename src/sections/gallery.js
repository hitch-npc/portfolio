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
 * prefers-reduced-motion: кольцо стоит в конечном положении наезда,
 * без вращения, без наводки, без кадров.
 */

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
// матрицу не переписываем, пока сдвиг меньше половины физического пикселя
const EPS = 0.004;
// колесо отдаёт до 400 px за событие; больше — это уже инерция трекпада
const WHEEL_CLAMP = 400;
const TOUCH_GAIN = 2.2;

export const GALLERY = {
  count: 25,          // карточек в кольце
  ringRadius: 224,    // радиус кольца в его собственных единицах
  cardW: 40,          // карточка в тех же единицах: масштаб задаёт кольцо
  cardH: 45,
  cardRadius: 4,
  zoom: 5,            // во сколько раз кольцо вырастает к концу наезда
  zoomOffset: 0,      // ручная поправка к подъёму центра, px
  sensitivity: 5,     // 0…10 — сколько прокрутки стоит одна карточка
  smoothing: 10,      // 0…10 — инерция прокрутки
  reach: 5,           // радиус действия курсора
  strength: 5,        // насколько сильно карточка отталкивается и растёт
  parallax: 5,        // наклон всей сцены за курсором
  entryCards: 2,      // сколько карточек прокрутки занимает наезд
  laps: 1,            // оборотов на всю высоту трека (drive: 'page')
  drive: 'wheel',     // 'wheel' — колесо внутри блока, 'page' — прокрутка страницы
  naive: false,       // снять экономию кадра — для замеров «до/после», см. _frame
};

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
    this.pointer = null;  // координаты курсора, снятые в событии и прочитанные в кадре
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

    this.stage.append(this.ring);
    this.root.append(this.stage);
    this._buildCards();
  }

  /** Карточки строятся заново только когда меняется их число. */
  _buildCards() {
    const count = Math.max(1, Math.round(this.p.count));
    const src = this.images.length ? this.images : [];

    this.ring.textContent = '';
    this.cards = [];

    for (let i = 0; i < count; i += 1) {
      const el = document.createElement('div');
      el.className = 'gallery__card';

      const url = src.length ? src[i % src.length] : null;
      if (url) {
        const img = document.createElement('img');
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
      this.cards.push({
        el,
        angle: cardAngle(i, count),
        rot: 0, rotT: 0,
        x: 0, xT: 0,
        y: 0, yT: 0,
        scale: 1, scaleT: 1,
        last: '',
      });
    }
    this._applyCardBox();
  }

  /** Габариты карточки живут в CSS-переменных: менять их перестройкой дорого. */
  _applyCardBox() {
    const { cardW, cardH, cardRadius } = this.p;
    const st = this.root.style;
    st.setProperty('--card-w', `${cardW}px`);
    st.setProperty('--card-h', `${cardH}px`);
    st.setProperty('--card-r', `${cardRadius}px`);
  }

  /* ─── производные величины ─────────────────────────────────────── */

  _derive() {
    const p = this.p;
    const count = Math.max(1, Math.round(p.count));
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;

    // кольцо целиком в кадре: диаметр плюс диагональ карточки по краям
    const span = 2 * p.ringRadius + Math.hypot(p.cardW, p.cardH);
    this.baseScale = w > 0 && h > 0 ? clamp(Math.min(w, h) / span, 0.01, 1) : 1;
    this.zoomScale = clamp(p.zoom, 0.5, 20) * this.baseScale;
    this.lift = p.ringRadius * this.zoomScale + p.zoomOffset;

    const total = Math.max(1, p.entryCards + (count - 1));
    this.entryFraction = p.entryCards / total;
    this.spanDeg = ((count - 1) * 360) / count;
    this.lapProgress = (1 - this.entryFraction) * (count / Math.max(1, count - 1));
    this.scrollTotal = Math.max(1, (400 - clamp(p.sensitivity, 0, 10) * 32) * total);
    this.scrollLerp = clamp(0.16 - clamp(p.smoothing, 0, 10) * 0.012, 0.03, 0.16);

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

  /** Сбрасывает кеш матриц: следующий кадр перепишет всё. */
  _invalidate() {
    this._ringLast = '';
    this._stageLast = '';
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
    this._onTouchStart = (e) => { ty = e.touches[0]?.clientY ?? null; };
    this._onTouchMove = (e) => {
      const y = e.touches[0]?.clientY;
      if (y == null || ty == null) return;
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
   */
  _bindPage() {
    const track = this.root.closest('[data-gallery-track]') || this.root;
    let ticking = false;

    const read = () => {
      ticking = false;
      const r = track.getBoundingClientRect();
      const run = Math.max(1, r.height - innerHeight);
      const k = clamp(-r.top / run, 0, 1);
      this.target = k * (this.entryFraction + this.lapProgress * this.p.laps);
    };

    this._onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(read); } };
    addEventListener('scroll', this._onScroll, { passive: true });
    read();
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
   * Один кадр. Возвращать наружу нечего — всё уходит в transform.
   * @param {number} dt секунд с прошлого кадра
   */
  _frame(dt) {
    const p = this.p;
    this.writes = 0;

    const sk = 1 - (1 - this.scrollLerp) ** (dt * 60);
    this.progress += (this.target - this.progress) * sk;

    // оборот замкнут: откатываем и текущее, и цель — иначе цель убежит в бесконечность
    const lapEnd = this.entryFraction + this.lapProgress;
    if (this.progress >= lapEnd) {
      this.progress -= this.lapProgress;
      this.target -= this.lapProgress;
    }

    this.entry = smoothstep(clamp(this.progress / this.entryFraction, 0, 1));
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
    this.root.removeEventListener('wheel', this._onWheel);
    this.root.removeEventListener('touchstart', this._onTouchStart);
    this.root.removeEventListener('touchmove', this._onTouchMove);
    this.root.removeEventListener('touchend', this._onTouchEnd);
    this.root.removeEventListener('touchcancel', this._onTouchEnd);
    if (this._onScroll) removeEventListener('scroll', this._onScroll);
    this.stage.remove();
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
