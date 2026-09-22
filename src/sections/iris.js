/**
 * Iris — глаз, а не кольцо.
 *
 * Геометрия. Точки радужки лежат на сфере: z = √(Rb² − r²). Глаз поворачивается
 * (рыскание/тангаж), точки поворачиваются вместе с ним и проецируются
 * ортогонально. Отсюда ракурс: круг становится эллипсом, дальний край
 * сжимается, дальние точки мельче и темнее. Без этого любая радужка читается
 * плоским кругом, чем бы её ни заполнять.
 *
 * Физика. Взгляд ведёт цель плавно, с инерцией: догоняет курсор и
 * останавливается, без рывков. Зрачок на пружине с недодемпфированием:
 * сужается с перелётом, как от света. Без курсора глаз блуждает сам,
 * так же плавно.
 *
 * Саккады и моргание выключены (dart, blink). Настоящий глаз держит точку
 * и прыгает, а веко роняет радужку до нуля, — и то и другое здесь читалось
 * как дёрганье интерфейса, а не как жизнь: блок стоит посреди страницы
 * и попадает в боковое зрение. Код оставлен и включается параметром.
 *
 * Вращение. Радужка медленно поворачивается вокруг своей оси — оборот за
 * полторы минуты. В начале появления вращение заметнее и за пару секунд
 * сходит к этой скорости: глаз заводится, а не включается.
 *
 * Смаз. Кадр не стирается, а гасится: прошлый остаётся на (1 − trail).
 * На саккаде гашение слабее — точки тянутся следом. Это и есть моушн-блюр,
 * он появляется ровно тогда, когда глаз двигается.
 *
 * Дисторсия. Роговица выпуклая: радиус растёт от центра к краю нелинейно,
 * плюс медленное жидкое дрожание по углу.
 *
 * Хост получает --gx/--gy/--lid — по ним текст внутри зрачка живёт в той же
 * трёхмерности, а не лежит поверх картинки.
 *
 * Сияние. По краю зрачка — тонкая переливающаяся корона, как у затмения:
 * ледяной синий, сиреневый и бело-золотой медленно плывут по кругу. Корона
 * лежит ровно на эллипсе зрачка — тот же центр, ракурс и пружина, — поэтому
 * едет и дышит вместе с ним и заряжается с навыками. Курсор работает как
 * фонарь: сторона короны, обращённая к нему, разгорается бело-золотой дугой,
 * тем ярче, чем он ближе; направление и сила догоняют курсор с инерцией,
 * и свет перетекает по кругу, а не прыгает. Форму курсор при этом не
 * трогает: пробовали раздувать кольцо в овал и выпускать к руке язык
 * света — оба раза выходил не отклик, а аттракцион. Отклик здесь
 * тональный: свет ярче и смещается, кольцо остаётся кольцом.
 * Только край зрачка:
 * сияние по всей радужке спорило с точками и размывало рисунок.
 * Искр нет сознательно: пробовали, блёстки удешевляли глаз. Корона
 * рисуется в том же холсте — отдельный CSS-слой поверх радужки композитор
 * гасит вместе с ней (see skills.css).
 *
 * prefers-reduced-motion: один статичный кадр, прямой взгляд, без смаза,
 * корона стоит.
 */

import { onScrollFrame, requestFrame } from '../motion/frame.js';
import { reduced } from '../motion/reduced.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const rand = (a, b) => a + Math.random() * (b - a);

// детерминированный шум: одна и та же радужка при каждой перерисовке
const hash = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const IRIS = {
  rays: 168,          // штрихов по кругу
  pupil: 0.62,        // радиус зрачка, доли радиуса радужки
  ball: 1.34,         // радиус глазного яблока, доли радиуса радужки
  dotsMin: 3,         // точек в самом коротком штрихе
  dotsMax: 10,        // и в самом длинном
  dotRatio: 0.3,      // радиус точки от шага между точками
  taper: 0.5,         // насколько точка мельчает к внешнему краю
  feather: 7,         // сколько штрихов занимает фронт заливки
  dim: 0.045,         // яркость ещё не зажжённого штриха (накапливается следом)
  gazeMax: 0.22,      // предельный поворот глаза, радианы
  saccadeDur: 0.09,   // длительность скачка
  holdMin: 0.5,       // пауза между скачками
  holdMax: 2.2,
  blink: false,       // моргание; выключено — веко всё время открыто
  blinkMin: 6,        // пауза между морганиями
  blinkMax: 14,
  blinkDur: 0.15,
  dart: false,        // саккады и тремор: глаз прыгает по точкам, а не ведёт
  follow: 3.2,        // как быстро взгляд догоняет курсор, когда саккад нет
  drift: 0.9,         // то же без курсора: глаз ходит сам, вдвое медленнее
  wanderReach: 0.45,  // насколько далеко уходит взгляд без курсора, доля хода
  wanderMin: 3.2,     // пауза между сменами цели без курсора
  wanderMax: 6.8,
  spin: 0.07,         // собственное вращение радужки, рад/с — оборот за 90 с
  spinIn: 0.55,       // добавка к вращению в начале появления, рад/с
  spinEase: 2.5,      // за сколько секунд добавка сходит на нет
  trail: 0.36,        // гашение прошлого кадра: меньше — длиннее смаз
  refract: 0.09,      // выпуклость роговицы
  wobble: 0.010,      // жидкое дрожание радужки
  textFollow: 0.3,    // насколько строка едет за зрачком: 1 — вплотную, 0 — стоит
  textSquash: 0.14,   // насколько ракурс и моргание сплющивают строку
  glow: 0.6,          // сила короны по краю зрачка; 0 — без неё
  glowDrift: 0.14,    // скорость перелива по кругу, рад/с — оборот за 45 с
  glowHot: 0.95,      // яркость дуги со стороны курсора
  glowReach: 1.4,     // с какого расстояния от края зрачка курсор влияет, доли радиуса радужки
};

export class Iris {
  /**
   * @param {HTMLCanvasElement} canvas холст радужки
   * @param {HTMLElement} [host] элемент, на который уходят --gx/--gy/--lid
   */
  constructor(canvas, host = null, params = {}) {
    this.canvas = canvas;
    this.host = host;
    this.p = { ...IRIS, ...params };
    this.ctx = canvas.getContext('2d');

    this.progress = 0;
    this.t = 0;
    this.paused = false;
    this._raf = null;
    this._last = 0;

    // взгляд: текущий угол, цель, скачок
    this.yaw = 0;
    this.pitch = 0;
    this.aimX = 0;
    this.aimY = 0;
    this.hold = 0.4;
    this.sacc = null;
    this.speed = 0;
    this.pointerAt = -1e3;

    // курсор для короны: координаты окна, близость и угол с инерцией
    this.cursor = null;
    this.box = null;
    this.near = 0;
    this.hotAng = 0;

    // собственный поворот радужки и его синус с косинусом на кадр
    this.spin = 0;
    this._cf = 1;
    this._sf = 0;

    // зрачок на пружине
    this.pr = 1;
    this.pv = 0;
    this.flash = 0;

    this.blinkIn = rand(this.p.blinkMin, this.p.blinkMax);
    this.lid = 1;

    this.reduced = reduced();
    this._buildRays();

    this._onPointer = (e) => {
      this.cursor = { x: e.clientX, y: e.clientY };
      // геометрию холста читает общий кадр (ниже): чтение в обработчике
      // событий посреди кадра заставляло пересчитывать вёрстку
      const r = this.box || this.canvas.getBoundingClientRect();
      if (!r.width) return;
      // цель взгляда в долях полуэкрана: глаз косит, а не выворачивается
      this.aimX = clamp((e.clientX - (r.left + r.width / 2)) / (innerWidth / 2), -1, 1);
      this.aimY = clamp((e.clientY - (r.top + r.height / 2)) / (innerHeight / 2), -1, 1);
      this.pointerAt = this.t;
      // просим кадр: в его фазе чтения обновится прямоугольник холста.
      // Без этого он остаётся таким, каким был на последней прокрутке, —
      // а сцена на входе ещё масштабируется, и свет уходил мимо курсора
      requestFrame();
    };
    this._onResize = () => this.resize();
    this._onLeave = () => { this.cursor = null; };

    if (!this.reduced) {
      addEventListener('pointermove', this._onPointer, { passive: true });
      document.documentElement.addEventListener('pointerleave', this._onLeave);
    }
    addEventListener('resize', this._onResize);

    // положение холста на экране — в фазе чтения общего кадра; пока глаз
    // на паузе за экраном, читать его незачем (see motion/frame.js)
    this._offFrame = onScrollFrame(
      () => (this.paused ? null : this.canvas.getBoundingClientRect()),
      (r) => { if (r) this.box = r; },
    );
  }

  /** Длины штрихов: клочья задаются волнами по углу, шум лишь ломает регулярность. */
  _buildRays() {
    const n = this.p.rays;
    this.rays = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - Math.PI / 2; // отсчёт с двенадцати часов
      const w = (i / n) * TAU;
      const clump =
        Math.sin(w * 3 + 0.7) * 0.45 +
        Math.sin(w * 7 + 2.1) * 0.3 +
        Math.sin(w * 13 + 4.4) * 0.25;
      const shape = clamp(0.5 + 0.5 * clump, 0, 1);
      const k = clamp(shape * 0.74 + hash(i) * 0.26, 0, 1);
      this.rays[i] = {
        cos: Math.cos(a),
        sin: Math.sin(a),
        theta: a,
        dots: Math.round(this.p.dotsMin + k * (this.p.dotsMax - this.p.dotsMin)),
        phase: hash(i + 91) * TAU,
      };
    }
  }

  /** Цвета берём из токенов: в JS нет ни одного hex. */
  _readColors() {
    const s = getComputedStyle(this.canvas);
    const get = (n, fallback) => (s.getPropertyValue(n) || fallback).trim();
    this.colors = {
      mark: get('--brand-mark', s.color),
      line: get('--brand-line', s.color),
      ground: get('--brand-ground', s.color),
      // перелив короны — своя палитра зрачка (токены --iris-*)
      ice: get('--iris-ice', s.color),
      glow: get('--iris-glow', s.color),
      gold: get('--iris-gold', s.color),
      halo: get('--iris-halo', s.color),
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 2 || h < 2) return;

    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w;
    this.h = h;
    // радужка занимает холст целиком; яблоко больше неё и в кадр не влезает —
    // рисуется только шапка сферы, как у настоящего глаза в лице
    this.R = (Math.min(w, h) / 2) * 0.97;
    this.Rb = this.R * this.p.ball;
    // шаг точек — от самого длинного штриха: он и упирается во внешний радиус
    this.step = (this.R * (1 - this.p.pupil)) / (this.p.dotsMax + 0.6);
    this._readColors();
    this._bakeGlow();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, w, h);
    this.draw();
  }

  /**
   * Корона запекается один раз на размер холста: переливающееся кольцо
   * (conic) с узким профилем вокруг радиуса зрачка. В кадре остаётся один
   * drawImage — с тем же центром, ракурсом и пружиной, что у чаши зрачка.
   * Радиусы профиля — в долях радиуса зрачка.
   */
  _bakeGlow() {
    const rpn = this.R * this.p.pupil;
    const OUT = 1.25;                       // внешний край запечённого кольца
    const Rg = rpn * OUT;
    const size = Math.max(2, Math.ceil(2 * Rg * this.dpr));
    const c = this._glow || (this._glow = document.createElement('canvas'));
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const m = size / 2;
    const { ice, glow, gold } = this.colors;

    // два оборота перелива: одного на кольцо мало, цвет стоит пятнами
    if (typeof g.createConicGradient === 'function') {
      const cg = g.createConicGradient(0, m, m);
      [ice, glow, gold, ice, glow, gold, ice].forEach((col, i, all) => cg.addColorStop(i / (all.length - 1), col));
      g.fillStyle = cg;
    } else {
      g.fillStyle = glow;
    }
    g.fillRect(0, 0, size, size);

    // узкий профиль: внутрь зрачка корона почти не заходит — там текст,
    // наружу даёт мягкий короткий шлейф
    const at = (r) => r / OUT;
    const rg = g.createRadialGradient(m, m, 0, m, m, m);
    rg.addColorStop(0, 'rgb(0 0 0 / 0)');
    rg.addColorStop(at(0.88), 'rgb(0 0 0 / 0)');
    rg.addColorStop(at(0.96), 'rgb(0 0 0 / 0.45)');
    rg.addColorStop(at(1.0), 'rgb(0 0 0 / 1)');
    rg.addColorStop(at(1.05), 'rgb(0 0 0 / 0.5)');
    rg.addColorStop(at(1.13), 'rgb(0 0 0 / 0.14)');
    rg.addColorStop(1, 'rgb(0 0 0 / 0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = rg;
    g.fillRect(0, 0, size, size);

    // Дуга фонаря: то же кольцо, но бело-золотое и только в секторе ±75°
    // вокруг 0° (три часа). В кадре её поворачивают к курсору.
    const h = this._hot || (this._hot = document.createElement('canvas'));
    h.width = size;
    h.height = size;
    const hg = h.getContext('2d');
    hg.fillStyle = this.colors.halo;
    hg.fillRect(0, 0, size, size);
    hg.globalCompositeOperation = 'destination-in';
    const hr = hg.createRadialGradient(m, m, 0, m, m, m);
    hr.addColorStop(0, 'rgb(0 0 0 / 0)');
    hr.addColorStop(at(0.9), 'rgb(0 0 0 / 0)');
    hr.addColorStop(at(0.97), 'rgb(0 0 0 / 0.5)');
    hr.addColorStop(at(1.0), 'rgb(0 0 0 / 1)');
    hr.addColorStop(at(1.07), 'rgb(0 0 0 / 0.45)');
    hr.addColorStop(at(1.18), 'rgb(0 0 0 / 0.1)');
    hr.addColorStop(1, 'rgb(0 0 0 / 0)');
    hg.fillStyle = hr;
    hg.fillRect(0, 0, size, size);
    if (typeof hg.createConicGradient === 'function') {
      const cm = hg.createConicGradient(0, m, m);
      cm.addColorStop(0, 'rgb(0 0 0 / 1)');
      cm.addColorStop(0.09, 'rgb(0 0 0 / 0.5)');
      cm.addColorStop(0.21, 'rgb(0 0 0 / 0)');
      cm.addColorStop(0.79, 'rgb(0 0 0 / 0)');
      cm.addColorStop(0.91, 'rgb(0 0 0 / 0.5)');
      cm.addColorStop(1, 'rgb(0 0 0 / 1)');
      hg.fillStyle = cm;
      hg.fillRect(0, 0, size, size);
    }

    this._glowR = Rg;
  }

  setProgress(v) {
    this.progress = clamp(v, 0, 1);
    if (this.reduced) this.draw();
  }

  /** Короткое сужение зрачка: смена навыка отмечается телом, а не подписью. */
  pulse() {
    if (this.reduced) return;
    this.flash = 1;
    // толчок пружине: зрачок поджимается и отпускает. Прежние −6 давали
    // рывок, заметный даже боковым зрением, — смена пункта читается и мягче
    this.pv -= 2.2;
    if (this.p.blink) this.blinkIn = Math.min(this.blinkIn, rand(0.5, 1.4));
  }

  /**
   * Взгляд. По умолчанию — плавный догон цели с инерцией; с dart включается
   * настоящая глазная механика: удержание, скачок, микродрожание.
   */
  _gaze(dt) {
    const p = this.p;

    // курсор молчит — глаз ходит сам
    if (this.t - this.pointerAt > 3) {
      this.wanderIn = (this.wanderIn ?? 0) - dt;
      if (this.wanderIn <= 0) {
        // Цель ближе к центру и меняется реже прежнего: на пустой странице
        // глаз мёл взглядом от края до края каждые пару секунд, и боковым
        // зрением это читалось как дёрганье, хотя ход и был плавным
        this.aimX = rand(-1, 1) * p.wanderReach;
        this.aimY = rand(-1, 1) * p.wanderReach * 0.75;
        this.wanderIn = rand(p.wanderMin, p.wanderMax);
      }
    }

    const ty = this.aimX * p.gazeMax;
    const tp = this.aimY * p.gazeMax * 0.7;

    const prevY = this.yaw;
    const prevP = this.pitch;

    if (!p.dart) {
      // экспоненциальный догон: к цели быстро, у цели мягко, без остатка.
      // За курсором глаз идёт живее, сам по себе — медленнее: собственное
      // блуждание не должно спорить с текстом рядом
      const speed = this.t - this.pointerAt > 3 ? p.drift : p.follow;
      const k = 1 - Math.exp(-dt * speed);
      this.yaw += (ty - this.yaw) * k;
      this.pitch += (tp - this.pitch) * k;
      this.speed = Math.hypot(this.yaw - prevY, this.pitch - prevP) / Math.max(dt, 1e-3);
      return;
    }

    if (this.sacc) {
      this.sacc.t += dt;
      const k = clamp(this.sacc.t / p.saccadeDur, 0, 1);
      // резкий старт, мягкая посадка — профиль саккады
      const e = 1 - Math.pow(1 - k, 4);
      this.yaw = this.sacc.y0 + (this.sacc.y1 - this.sacc.y0) * e;
      this.pitch = this.sacc.p0 + (this.sacc.p1 - this.sacc.p0) * e;
      if (k >= 1) {
        this.sacc = null;
        this.hold = rand(p.holdMin, p.holdMax);
      }
    } else {
      this.hold -= dt;
      const off = Math.hypot(ty - this.yaw, tp - this.pitch);
      if (this.hold <= 0 && off > 0.012) {
        this.sacc = { t: 0, y0: this.yaw, p0: this.pitch, y1: ty, p1: tp };
      }
      // глазодвигательный тремор: глаз никогда не стоит идеально
      this.yaw += Math.sin(this.t * 34) * 0.0011 + Math.sin(this.t * 1.7) * 0.0006;
      this.pitch += Math.cos(this.t * 29) * 0.0009;
    }

    this.speed = Math.hypot(this.yaw - prevY, this.pitch - prevP) / Math.max(dt, 1e-3);
  }

  /** Моргание: радужка схлопывается по вертикали и почти гаснет. */
  _blink(dt) {
    if (!this.p.blink) { this.lid = 1; return; }
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0;
      this.blinkIn = rand(this.p.blinkMin, this.p.blinkMax);
    }
    if (this.blinkT !== undefined) {
      this.blinkT += dt;
      const k = this.blinkT / this.p.blinkDur;
      if (k >= 1) { this.blinkT = undefined; this.lid = 1; }
      // вниз быстрее, вверх мягче — как настоящее веко
      else this.lid = k < 0.4 ? 1 - Math.pow(k / 0.4, 0.7) * 0.92 : 0.08 + 0.92 * Math.pow((k - 0.4) / 0.6, 1.6);
    }
  }

  /** Зрачок на пружине: сужается с перелётом, как от света. */
  _pupil(dt) {
    const target = 1 - this.progress * 0.16 - this.flash * 0.1;
    const k = 190;   // жёсткость
    const c = 13;    // демпфирование: недодемпфировано, отсюда перелёт
    this.pv += (target - this.pr) * k * dt - this.pv * c * dt;
    this.pr += this.pv * dt;
    this.flash *= Math.pow(0.04, dt);
  }

  /** Точка радужки на сфере → экран. Возвращает x, y и глубину 0..1. */
  _project(ray, r, cy, sy, cp, sp) {
    // роговица выпуклая, плюс жидкое дрожание по углу
    const u = r / this.R;
    const rr = r * (1 + this.p.refract * u * u + this.p.wobble * Math.sin(ray.theta * 4 + this.t * 0.8));

    // собственный поворот радужки. Считается поворотом уже готовой точки,
    // а не угла штриха: синус с косинусом на весь кадр одни, а точек тысячи
    const x0 = rr * (ray.cos * this._cf - ray.sin * this._sf);
    const y0 = rr * (ray.sin * this._cf + ray.cos * this._sf);
    const z0 = Math.sqrt(Math.max(0, this.Rb * this.Rb - rr * rr));

    const x1 = x0 * cy + z0 * sy;
    const z1 = z0 * cy - x0 * sy;
    const y1 = y0 * cp - z1 * sp;
    const z2 = y0 * sp + z1 * cp;

    return { x: x1, y: y1 * this.lid, d: z2 / this.Rb };
  }

  draw(dt = 0) {
    const { ctx, p } = this;
    if (!this.w) return;

    if (!this.reduced) {
      this.t += dt;
      // в начале появления радужка крутится заметнее и за пару секунд
      // сходит к своей обычной скорости
      this.spin += (p.spin + p.spinIn * Math.exp(-this.t / Math.max(0.1, p.spinEase))) * dt;
      this._gaze(dt);
      this._blink(dt);
      this._pupil(dt);
    }
    this._cf = Math.cos(this.spin);
    this._sf = Math.sin(this.spin);

    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);

    const cx = this.w / 2;
    const ccy = this.h / 2;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // смаз: прошлый кадр не стираем, а гасим. На скачке гасим слабее —
    // точки тянутся следом, ровно пока глаз двигается
    const fade = this.reduced ? 1 : clamp(p.trail - this.speed * 0.06, 0.09, 1);
    if (fade >= 1) {
      ctx.clearRect(0, 0, this.w, this.h);
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = fade;
      ctx.fillStyle = this.colors.mark;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'source-over';
    }

    // зрачок: тёмная чаша со своим ободком. Даёт объём и подкладку под текст
    const rp = this.R * p.pupil * this.pr;
    const pc = this._project({ cos: 0, sin: 0, theta: 0 }, 0, cy, sy, cp, sp);
    const px = cx + pc.x;
    const py = ccy + pc.y;
    const rx = rp * Math.cos(this.yaw) * 1.02;
    const ry = rp * Math.cos(this.pitch) * this.lid * 1.02;

    const bowl = ctx.createRadialGradient(px - rx * 0.25, py - ry * 0.3, rx * 0.1, px, py, rx);
    bowl.addColorStop(0, this.colors.ground);
    bowl.addColorStop(0.72, this.colors.ground);
    bowl.addColorStop(1, this.colors.line);
    ctx.globalAlpha = 1;
    ctx.fillStyle = bowl;
    ctx.beginPath();
    ctx.ellipse(px, py, Math.abs(rx), Math.abs(ry), 0, 0, TAU);
    ctx.fill();

    // ободок зрачка
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = this.colors.line;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Корона — поверх края чаши, под точками: первый ряд точек лежит
    // на свету. Домножена на fade: холст не стирается, а гасится, и свет,
    // положенный каждый кадр, иначе копился бы до glow / fade — втрое ярче
    // в покое и вдесятеро на саккаде, где гашение слабеет.
    if (p.glow > 0 && this._glow) {
      const breathe = this.reduced ? 1 : 0.8 + 0.2 * Math.sin(this.t * 0.7);
      // глаз заряжается вместе с навыками: к последнему корона полнее
      const charge = 0.55 + 0.45 * this.progress;
      const sx = this.pr * 1.02 * Math.cos(this.yaw);
      const sy = this.pr * 1.02 * Math.cos(this.pitch) * this.lid;

      // Фонарь: где курсор относительно центра зрачка. Экранный вектор
      // переводится в плоскость глаза — делится на ракурс, иначе при взгляде
      // вбок дуга смотрела бы мимо курсора. Только на ракурс, без века:
      // на моргании веко падает до 0.08, и деление на него раздувало
      // вертикаль в 12 раз — дуга дёргалась вверх-вниз с каждым морганием.
      // Сила и угол догоняют цель с инерцией — свет перетекает, а не прыгает.
      if (!this.reduced) {
        let nearT = 0;
        let angT = this.hotAng;
        const b = this.box;
        if (this.cursor && b && b.width) {
          const dx = (this.cursor.x - b.left) * (this.w / b.width) - px;
          const dy = (this.cursor.y - b.top) * (this.h / b.height) - py;
          const d = Math.hypot(dx, dy);
          nearT = smooth(clamp(1 - (d - rp) / (this.R * p.glowReach), 0, 1));
          angT = Math.atan2(dy / Math.cos(this.pitch), dx / Math.cos(this.yaw));
        }
        this.near += (nearT - this.near) * (1 - Math.exp(-dt * 5));
        const da = Math.atan2(Math.sin(angT - this.hotAng), Math.cos(angT - this.hotAng));
        this.hotAng += da * (1 - Math.exp(-dt * 7));
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(px, py);
      // ровно эллипс чаши: её пружина, ракурс и моргание
      ctx.scale(sx, sy);

      // вся корона чуть светлеет, когда курсор рядом
      ctx.globalAlpha = clamp(p.glow * breathe * charge * (1 + this.near * 0.45) * this.lid * fade, 0, 1);
      ctx.save();
      ctx.rotate(this.t * p.glowDrift);
      ctx.drawImage(this._glow, -this._glowR, -this._glowR, this._glowR * 2, this._glowR * 2);
      ctx.restore();

      // дуга фонаря — к курсору
      if (this.near > 0.004 && this._hot) {
        ctx.globalAlpha = clamp(p.glowHot * this.near * breathe * this.lid * fade, 0, 1);
        ctx.rotate(this.hotAng);
        ctx.drawImage(this._hot, -this._glowR, -this._glowR, this._glowR * 2, this._glowR * 2);
      }
      ctx.restore();
    }

    ctx.fillStyle = this.colors.mark;

    const front = p.feather / p.rays;
    const blur = this.reduced ? 0 : clamp(this.speed * 0.5, 0, 1); // тяга точек на скачке

    for (let i = 0; i < p.rays; i++) {
      const ray = this.rays[i];
      // фронт заливки идёт по часовой стрелке; хвост остаётся зажжённым.
      // прогресс растягиваем на длину фронта, иначе на единице у двенадцати
      // часов остаётся непогашенная прорезь
      const lit = clamp((this.progress * (1 + front) - i / p.rays) / front, 0, 1);

      for (let j = 0; j < ray.dots; j++) {
        // внутри штриха точки загораются наружу — цепочка, а не полоса
        const dotLit = clamp(lit * 1.7 - (j / ray.dots) * 0.7, 0, 1);
        // Мерцание и дыхание точек вдвое тише прежнего: рисунок остаётся
        // живым, но по краю зрения уже не считывается как рябь
        const shimmer = this.reduced ? 1 : 0.95 + 0.05 * Math.sin(this.t * 1.3 + ray.phase + j);
        const drift = this.reduced ? 0 : Math.sin(this.t * 0.6 + ray.phase) * this.step * 0.035;

        const r = rp + this.step * (j + 0.7) + drift;
        const q = this._project(ray, r, cy, sy, cp, sp);
        if (q.d <= 0.02) continue; // точка ушла за лимб

        const taper = 1 - p.taper * (j / Math.max(1, ray.dots - 1));
        const depth = 0.62 + 0.38 * q.d; // дальний край мельче и темнее
        const size = this.step * p.dotRatio * taper * (0.62 + 0.38 * dotLit) * depth * (1 + this.flash * 0.22 * dotLit);

        // точку кладём в полную силу: гашение кадра само растянет её в след,
        // а домножение на fade просто съело бы яркость
        const alpha = (p.dim + (1 - p.dim) * dotLit) * shimmer * depth * this.lid;
        ctx.globalAlpha = clamp(alpha * (1 + blur * 0.3), 0, 1);

        ctx.beginPath();
        ctx.arc(cx + q.x, ccy + q.y, Math.max(0.35, size), 0, TAU);
        ctx.fill();
      }
    }

    // блик роговицы: источник света стоит на месте, поэтому при повороте
    // глаза блик уезжает в другую сторону — главный признак выпуклости
    const hx = cx - this.yaw * this.Rb * 0.8 - this.R * 0.42;
    const hy = ccy - this.pitch * this.Rb * 0.8 - this.R * 0.5;
    const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, this.R * 0.42);
    spec.addColorStop(0, this.colors.mark);
    spec.addColorStop(1, this.colors.ground);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.05 * this.lid;
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(hx, hy, this.R * 0.42, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // текст внутри зрачка живёт в той же трёхмерности
    if (this.host) {
      const st = this.host.style;
      st.setProperty('--gx', (this.yaw / p.gazeMax).toFixed(3));
      st.setProperty('--gy', (this.pitch / p.gazeMax).toFixed(3));
      st.setProperty('--lid', this.lid.toFixed(3));
      // Строка едет за центром зрачка, но не вплотную. Вплотную — это ход
      // до ±52 px при радиусе зрачка 138 и собственной ширине строки 199:
      // на саккаде край строки выезжал за зрачок на светлые точки радужки,
      // и прочесть её было нельзя. textFollow держит ход внутри зрачка:
      // связь с взглядом читается, а строка остаётся на тёмном.
      st.setProperty('--pcx', `${(pc.x * p.textFollow).toFixed(1)}px`);
      st.setProperty('--pcy', `${(pc.y * p.textFollow).toFixed(1)}px`);
      // Ракурс — тем же косинусом, что сплющивает зрачок в эллипс, но взятым
      // долей: на моргании множитель падал до 0.09 и строка схлопывалась
      // в полоску на всю длительность моргания. Теперь моргание её только
      // приминает. Только 2d-трансформы: 3d поднимает строку в отдельный
      // слой, и композитор гасит холст радужки под ним
      const squash = (v) => 1 - (1 - v) * p.textSquash;
      st.setProperty('--sx', squash(Math.cos(this.yaw) * 0.985).toFixed(4));
      st.setProperty('--sy', squash(Math.cos(this.pitch) * this.lid * 0.985).toFixed(4));
    }
  }

  start() {
    if (this.reduced) { this.resize(); return; }
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt = this._last ? Math.min((now - this._last) / 1000, 0.05) : 0;
      this._last = now;
      if (!document.hidden && !this.paused) this.draw(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    removeEventListener('pointermove', this._onPointer);
    document.documentElement.removeEventListener('pointerleave', this._onLeave);
    removeEventListener('resize', this._onResize);
    this._offFrame?.();
  }
}
