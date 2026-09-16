/**
 * Iris — глаз, а не кольцо.
 *
 * Геометрия. Точки радужки лежат на сфере: z = √(Rb² − r²). Глаз поворачивается
 * (рыскание/тангаж), точки поворачиваются вместе с ним и проецируются
 * ортогонально. Отсюда ракурс: круг становится эллипсом, дальний край
 * сжимается, дальние точки мельче и темнее. Без этого любая радужка читается
 * плоским кругом, чем бы её ни заполнять.
 *
 * Физика. Глаз не ведёт цель плавно — он держит точку и прыгает: саккада
 * 90 мс, пауза 0.5–2.2 с, между ними микродрожание. Зрачок на пружине
 * с недодемпфированием: сужается с перелётом, как от света. Моргание
 * схлопывает радужку по вертикали. Без курсора глаз блуждает сам.
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
 * prefers-reduced-motion: один статичный кадр, прямой взгляд, без смаза.
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
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
  blinkMin: 6,        // пауза между морганиями
  blinkMax: 14,
  blinkDur: 0.15,
  trail: 0.36,        // гашение прошлого кадра: меньше — длиннее смаз
  refract: 0.09,      // выпуклость роговицы
  wobble: 0.018,      // жидкое дрожание радужки
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

    // зрачок на пружине
    this.pr = 1;
    this.pv = 0;
    this.flash = 0;

    this.blinkIn = rand(this.p.blinkMin, this.p.blinkMax);
    this.lid = 1;

    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._buildRays();

    this._onPointer = (e) => {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width) return;
      // цель взгляда в долях полуэкрана: глаз косит, а не выворачивается
      this.aimX = clamp((e.clientX - (r.left + r.width / 2)) / (innerWidth / 2), -1, 1);
      this.aimY = clamp((e.clientY - (r.top + r.height / 2)) / (innerHeight / 2), -1, 1);
      this.pointerAt = this.t;
    };
    this._onResize = () => this.resize();

    if (!this.reduced) addEventListener('pointermove', this._onPointer, { passive: true });
    addEventListener('resize', this._onResize);
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
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, w, h);
    this.draw();
  }

  setProgress(v) {
    this.progress = clamp(v, 0, 1);
    if (this.reduced) this.draw();
  }

  /** Короткое сужение зрачка: смена навыка отмечается телом, а не подписью. */
  pulse() {
    if (this.reduced) return;
    this.flash = 1;
    this.pv -= 6;           // толчок пружине: зрачок дёргается, потом отпускает
    this.blinkIn = Math.min(this.blinkIn, rand(0.5, 1.4));
  }

  /** Взгляд: удержание, скачок, микродрожание, блуждание без курсора. */
  _gaze(dt) {
    const p = this.p;

    // курсор молчит — глаз ходит сам
    if (this.t - this.pointerAt > 3) {
      this.wanderIn = (this.wanderIn ?? 0) - dt;
      if (this.wanderIn <= 0) {
        this.aimX = rand(-0.8, 0.8);
        this.aimY = rand(-0.6, 0.6);
        this.wanderIn = rand(1.4, 3.6);
      }
    }

    const ty = this.aimX * p.gazeMax;
    const tp = this.aimY * p.gazeMax * 0.7;

    const prevY = this.yaw;
    const prevP = this.pitch;

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

    const x0 = rr * ray.cos;
    const y0 = rr * ray.sin;
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
      this._gaze(dt);
      this._blink(dt);
      this._pupil(dt);
    }

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
        const shimmer = this.reduced ? 1 : 0.9 + 0.1 * Math.sin(this.t * 1.3 + ray.phase + j);
        const drift = this.reduced ? 0 : Math.sin(this.t * 0.6 + ray.phase) * this.step * 0.07;

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
      // текст едет ровно с центром зрачка: иначе при взгляде вбок строка
      // выезжает на радужку и упирается в точки
      st.setProperty('--pcx', `${pc.x.toFixed(1)}px`);
      st.setProperty('--pcy', `${pc.y.toFixed(1)}px`);
      // ракурс строки — тем же косинусом, что сплющивает зрачок в эллипс.
      // Только 2d-трансформы: 3d поднимает строку в отдельный слой,
      // и композитор гасит холст радужки под ним
      st.setProperty('--sx', (Math.cos(this.yaw) * 0.985).toFixed(4));
      st.setProperty('--sy', (Math.cos(this.pitch) * this.lid * 0.985).toFixed(4));
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
    removeEventListener('resize', this._onResize);
  }
}
