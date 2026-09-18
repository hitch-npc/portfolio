/**
 * GlyphField — знак TBCS, собранный из поля одинаковых фигур.
 *
 * Идея сайта в одном кадре: ни одна фигура не нарисована руками — размер,
 * яркость и поворот каждой задаёт одно правило. Сама фигура сменная
 * (see shapes.js): сейчас треугольник, раньше была стрелка.
 *
 * Как устроено:
 *   1. Текст рисуется в невидимый canvas и размывается — получается карта покрытия
 *      (0..1 на ячейку сетки). Размытие и есть «мягкий край»: у границы буквы
 *      покрытие падает плавно, фигуры мельчают и гаснут, а не обрываются.
 *   2. Сетка ячеек. В каждой рисуется фигура: размер и яркость — от покрытия,
 *      направление — от поля потока.
 *   3. Поле потока — сумма несинхронных волн, поэтому рисунок не зацикливается
 *      на глаз. Курсор добавляет вихрь: рядом с ним фигуры разворачиваются
 *      по касательной и ячейки слегка расходятся — это и есть дисторсия.
 *      Курсор ушёл — правило возвращает знак в форму: памяти у поля нет.
 *
 *   4. Инверсия — пятна, внутри которых покрытие переворачивается: буква уходит
 *      в тень, фон вспыхивает. Два источника: медленное дыхание по всему полю
 *      и линза под курсором. Знак читается и в негативе, потому что его держит
 *      перепад плотности, а не сам по себе светлый цвет.
 *
 * Буква остаётся читаемой, потому что её держит плотность и яркость, а не контур.
 *
 * Цена кадра. Фигур порядка десяти тысяч, и наивно это десять тысяч вызовов
 * канвы и шесть десятков тысяч синусов за кадр — на слабой машине один знак
 * съедает весь кадровый бюджет. Поэтому:
 *   • фазы волн у ячейки постоянны, меняется только время — формула суммы
 *     углов превращает синус на ячейку в пару умножений (see _bakePhases);
 *   • фигуры не рисуются по одной, а складываются в корзины по яркости
 *     (PARAMS.shades) и уходят в канву пачками по CHUNK: один fill или
 *     stroke на пачку. Геометрия каждой фигуры точная — округляется только
 *     прозрачность и толщина линии, и то на 1/128.
 * Итого на кадр: несколько сотен вызовов канвы вместо десяти тысяч и 12 синусов.
 *
 * Поле сообщает габариты знака и число фигур событием markbox: по ним DOM
 * ставит ™ и строку с идеей под знаком.
 *
 * prefers-reduced-motion: один статичный кадр, без анимации и без реакции на курсор.
 */
import { SHAPES } from './shapes.js';

export const PARAMS = {
  text: 'TBCS',
  stackBelow: 620,     // ниже этой ширины знак встаёт в две строки: TB / CS
  lineGap: 0.12,       // просвет между строками, доли высоты прописной
  fitStacked: 0.82,    // в две строки знак шире: строка вдвое короче, места больше
  lineGapStacked: 0.3, // и просвет крупнее, иначе крупные фигуры сшивают строки
  tracking: -0.05,     // разрядка знака, доли кегля
  fit: 0.71,           // доля ширины холста под знак
  cell: 14.02,         // шаг сетки, css-пиксели (пересчитывается, если autoCell)
  autoCell: true,      // шаг сетки от высоты букв, а не от ширины экрана
  rowsPerCap: 22,      // сколько рядов фигур укладывается в высоту прописной
  cellMin: 6,
  cellMax: 34,
  maxCells: 26000,     // потолок числа фигур: страховка для слабых машин и телефонов
  blur: 10.94,         // размытие маски, css-пиксели (пересчитывается, если autoCell)
  blurRatio: 0.78,     // размытие от шага сетки — мягкость края держится пропорционально
  shape: 'triangle',   // фигура в ячейке (see shapes.js); её размеры — там же
  ghost: 0.075,        // покрытие вне буквы: еле видные фигуры фона
  weight: 0.85,        // толщина линии для линейных фигур, css-пиксели
  flowScale: 5.5,      // масштаб поля потока: меньше — крупнее и глаже волны
  flowSpeed: 0.86,     // скорость дрейфа поля
  breathe: 0.82,       // глубина инверсии: 0 — выключено, 1 — полный негатив в пятне
  breatheScale: 1.9,   // масштаб пятен инверсии: меньше — пятна крупнее
  breatheSpeed: 0.09,  // скорость дрейфа пятен: своё время, медленнее потока
  mouseRadius: 410,    // радиус вихря, css-пиксели
  swirl: 1.0,          // насколько курсор перебивает поле (0..1)
  push: 51,            // расхождение ячеек от курсора, css-пиксели
  invert: 0.9,         // глубина линзы под курсором: 0 — нет, 1 — полный негатив
  invertRadius: 230,   // радиус линзы, css-пиксели: меньше вихря — линза внутри него
  ease: 0.16,          // инертность курсора
  shades: 128,         // ступеней яркости в кадре; 0 — рисовать каждую фигуру отдельно
};

// фигур в одном пути корзины: цена заливки растёт с числом контуров в пути
// быстрее, чем линейно, и пачки по 32 держат её ровной
const CHUNK = 32;

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export class GlyphField {
  /**
   * @param {HTMLCanvasElement} canvas холст знака
   * @param {object} [params] переопределения PARAMS
   */
  constructor(canvas, params = {}) {
    this.canvas = canvas;
    // общие параметры, поверх — размеры фигуры, поверх — переопределения
    const shape = params.shape || PARAMS.shape;
    this.p = { ...PARAMS, ...SHAPES[shape].params, ...params };
    this.ctx = canvas.getContext('2d');

    this.mask = document.createElement('canvas');
    this.maskCtx = this.mask.getContext('2d', { willReadFrequently: true });

    this.cells = [];
    this.cols = 0;
    this.rows = 0;

    this.mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, inside: false };
    this.t = 0;
    this.tb = 0; // время дыхания: отдельно от потока, он теперь быстрый
    this._raf = null;
    this._last = 0;
    this.paused = false;

    this.satellite = null; // элемент-спутник знака (™): его сносит тем же полем
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._onPointer = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.tx = e.clientX - r.left;
      this.mouse.ty = e.clientY - r.top;
      this.mouse.inside = true;
    };
    this._onLeave = () => { this.mouse.inside = false; };
    this._onResize = () => this.resize();

    window.addEventListener('pointermove', this._onPointer, { passive: true });
    window.addEventListener('blur', this._onLeave);
    window.addEventListener('resize', this._onResize);
  }

  /**
   * Меняет фигуру и подставляет её размеры по умолчанию.
   * Нужна панели ?tune: сравнить стрелку и треугольник на одном знаке.
   */
  setShape(name) {
    if (!SHAPES[name]) return;
    Object.assign(this.p, SHAPES[name].params, { shape: name });
    this._draw(0);
  }

  /**
   * Привязывает DOM-элемент к полю: его сносит тем же потоком, что и фигуры,
   * но он остаётся чёткой типографикой — в этом весь приём.
   */
  attachSatellite(el) {
    this.satellite = el;
  }

  /** Сносит спутник по полю и уводит от курсора. */
  _driftSatellite() {
    const el = this.satellite;
    if (!el || !this.markBox || this.reduced) return;

    const x = this.markBox.left + this.markBox.width;
    const y = this.markBox.top;
    const a = this._flow(x / this.w, y / this.h, this.t);

    const amp = Math.min(9, this.markBox.cap * 0.045);
    let dx = Math.cos(a) * amp;
    let dy = Math.sin(a) * amp;
    let rot = Math.sin(this.t * 0.7 + a) * 2.5;

    if (this.mouse.inside) {
      const mx = x - this.mouse.x;
      const my = y - this.mouse.y;
      const dist = Math.hypot(mx, my);
      const inf = smoothstep(this.p.mouseRadius, 0, dist);
      if (inf > 0.001 && dist > 1e-3) {
        dx += (mx / dist) * inf * this.p.push * 0.5;
        dy += (my / dist) * inf * this.p.push * 0.5;
        rot += inf * 9;
      }
    }

    el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
  }

  /** Читает цвет знака из CSS-переменной — в JS нет ни одного hex. */
  _markColor() {
    const s = getComputedStyle(this.canvas);
    return (s.getPropertyValue('--brand-mark') || s.color).trim();
  }

  /**
   * Раскладка знака: кегль, позиции символов, высота прописной.
   * Считается отдельно от отрисовки, потому что шаг сетки зависит от высоты букв,
   * а размытие маски — от шага сетки.
   */
  _layout(w, h) {
    const p = this.p;
    const m = this.maskCtx;
    const probe = 100;
    const font = getComputedStyle(this.canvas).getPropertyValue('--f-display').trim();

    // расширенное начертание переменного Archivo — канвас поддерживает fontStretch с Chrome 116
    if ('fontStretch' in m) m.fontStretch = 'expanded';
    m.font = `800 ${probe}px ${font}`;
    m.textBaseline = 'alphabetic';

    // на узком экране монограмма встаёт в две строки: иначе буквы слишком мелкие
    // и поле фигур вырождается в растр
    const stacked = w < p.stackBelow;
    const half = Math.ceil([...p.text].length / 2);
    const source = stacked ? [p.text.slice(0, half), p.text.slice(half)] : [p.text];

    const fit = stacked ? p.fitStacked : p.fit;
    const gapRatio = stacked ? p.lineGapStacked : p.lineGap;

    const track = probe * p.tracking;
    const lines = source.map((line) => {
      const chars = [...line];
      const advances = chars.map((c) => m.measureText(c).width);
      const rawWidth = advances.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
      return { chars, advances, rawWidth };
    });

    const capProbe = m.measureText(p.text).actualBoundingBoxAscent || probe * 0.72;
    const maxRaw = Math.max(...lines.map((l) => l.rawWidth));
    const rawBlockHeight = capProbe * lines.length + capProbe * gapRatio * (lines.length - 1);

    const scale = Math.min((w * fit) / maxRaw, (h * 0.68) / rawBlockHeight);

    return {
      font,
      lines,
      scale,
      track,
      size: probe * scale,
      cap: capProbe * scale,
      gap: capProbe * gapRatio * scale,
      blockHeight: rawBlockHeight * scale,
    };
  }

  /** Рисует размытую маску по готовой раскладке и возвращает пиксели. */
  _renderMask(w, h, L, blur) {
    const m = this.maskCtx;
    this.mask.width = w;
    this.mask.height = h;

    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, w, h);
    if ('fontStretch' in m) m.fontStretch = 'expanded';
    m.font = `800 ${L.size}px ${L.font}`;
    m.textBaseline = 'alphabetic';
    m.fillStyle = this._markColor(); // важен только альфа-канал, но цвет всё равно из токена
    m.filter = `blur(${blur}px)`;

    let baseline = h / 2 - L.blockHeight / 2 + L.cap;
    for (const line of L.lines) {
      let x = (w - line.rawWidth * L.scale) / 2;
      for (let i = 0; i < line.chars.length; i++) {
        m.fillText(line.chars[i], x, baseline);
        x += line.advances[i] * L.scale + L.track * L.scale;
      }
      baseline += L.cap + L.gap;
    }
    m.filter = 'none';

    return m.getImageData(0, 0, w, h).data;
  }

  /** Сетка ячеек с покрытием из маски. */
  _buildCells(w, h, data) {
    const p = this.p;
    const cols = Math.ceil(w / p.cell);
    const rows = Math.ceil(h / p.cell);
    const offX = (w - (cols - 1) * p.cell) / 2;
    const offY = (h - (rows - 1) * p.cell) / 2;

    const cells = new Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = offX + c * p.cell;
        const y = offY + r * p.cell;
        // покрытие усредняем по четырём точкам ячейки — край получается ровнее
        let sum = 0;
        const q = p.cell * 0.25;
        for (const [ox, oy] of [[-q, -q], [q, -q], [-q, q], [q, q]]) {
          const px = Math.min(w - 1, Math.max(0, Math.round(x + ox)));
          const py = Math.min(h - 1, Math.max(0, Math.round(y + oy)));
          sum += data[(py * w + px) * 4 + 3];
        }
        const alpha = sum / (4 * 255);
        cells[r * cols + c] = { x, y, cov: alpha };
      }
    }
    this.cols = cols;
    this.rows = rows;
    this.cells = cells;
    this._bakePhases(w, h);
  }

  /**
   * Фазы волн у ячейки постоянны — двигается только время. Поэтому
   * sin(a + ωt) раскладывается в sin a · cos ωt + cos a · sin ωt, где первый
   * множитель считается один раз здесь, а второй — один раз на весь кадр.
   * Шесть синусов на ячейку в кадре превращаются в шесть на кадр.
   * Сами формулы потока и дыхания в читаемом виде — в _flow и в комментариях
   * ниже; правка одной из записей обязана меняться и во второй.
   *
   * Пересобирается вместе с сеткой: масштабы потока и дыхания входят в фазу.
   */
  _bakePhases(w, h) {
    const p = this.p;
    const n = this.cells.length;
    const fs = p.flowScale;
    const bs = p.breatheScale;

    this.n = n;
    this.gx = new Float64Array(n);
    this.gy = new Float64Array(n);
    this.gcov = new Float64Array(n);
    this.ph = new Float64Array(n * 12);

    for (let i = 0; i < n; i += 1) {
      const cell = this.cells[i];
      this.gx[i] = cell.x;
      this.gy[i] = cell.y;
      this.gcov[i] = cell.cov;

      const nx = cell.x / w;
      const ny = cell.y / h;
      const o = i * 12;

      // поток: sin(a1 + .9t) · 1.25 + cos(a2 − .7t) · 1.25 + sin(a3 + .45t) · .6
      const a1 = nx * fs * 2.0;
      const a2 = ny * fs * 1.6;
      const a3 = (nx + ny) * fs * 1.1;
      this.ph[o] = Math.sin(a1); this.ph[o + 1] = Math.cos(a1);
      this.ph[o + 2] = Math.sin(a2); this.ph[o + 3] = Math.cos(a2);
      this.ph[o + 4] = Math.sin(a3); this.ph[o + 5] = Math.cos(a3);

      // дыхание: sin(b1 − .8τ) · .62 + cos(b2 + .55τ) · .62 + sin(b3 + .37τ) · .5
      const b1 = nx * bs * 1.7;
      const b2 = ny * bs * 1.3;
      const b3 = (nx * 0.8 - ny) * bs * 0.9;
      this.ph[o + 6] = Math.sin(b1); this.ph[o + 7] = Math.cos(b1);
      this.ph[o + 8] = Math.sin(b2); this.ph[o + 9] = Math.cos(b2);
      this.ph[o + 10] = Math.sin(b3); this.ph[o + 11] = Math.cos(b3);
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 2 || h < 2) return;

    this.ink = this._markColor();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w;
    this.h = h;

    const layout = this._layout(w, h);

    // шаг сетки — от высоты прописной: на любом экране в букву укладывается
    // одинаковое число фигур, иначе знак вырождается либо в штриховку, либо в кашу
    if (this.p.autoCell) {
      const raw = layout.cap / this.p.rowsPerCap;
      let cell = Math.min(this.p.cellMax, Math.max(this.p.cellMin, raw));

      // потолок числа ячеек: мелкий шаг на большом холсте иначе сажает слабые устройства
      const estimate = (w / cell) * (h / cell);
      if (estimate > this.p.maxCells) cell *= Math.sqrt(estimate / this.p.maxCells);

      this.p.cell = cell;
      this.p.blur = this.p.cell * this.p.blurRatio;
    }

    const data = this._renderMask(w, h, layout, this.p.blur);
    this._buildCells(w, h, data);

    // габариты знака в css-пикселях — по ним DOM ставит ™ и строку с идеей.
    // count — сколько фигур в поле: строка под знаком называет настоящее число
    const markWidth = Math.max(...layout.lines.map((l) => l.rawWidth)) * layout.scale;
    this.markBox = {
      left: (w - markWidth) / 2,
      top: h / 2 - layout.blockHeight / 2,
      width: markWidth,
      height: layout.blockHeight,
      cap: layout.cap,
      count: this.n,
    };
    this.canvas.dispatchEvent(new CustomEvent('markbox', { detail: this.markBox }));
    this._draw(0);
  }

  /**
   * Направление поля потока в точке — эталонная запись формулы.
   * Фигуры считают её же, но разложенной по формуле суммы углов и потому
   * нечитаемо (see _bakePhases и _draw): правку вносить в оба места.
   * Здесь она нужна ради одной точки в кадре — спутника знака.
   */
  _flow(nx, ny, t) {
    const s = this.p.flowScale;
    return (
      Math.sin(nx * s * 2.0 + t * 0.9) * 1.25 +
      Math.cos(ny * s * 1.6 - t * 0.7) * 1.25 +
      Math.sin((nx + ny) * s * 1.1 + t * 0.45) * 0.6
    );
  }

  /**
   * Таблицы яркости и корзины путей. Прозрачность и толщина округляются
   * до 1/shades — при 128 ступенях это 0.007 прозрачности и 0.003 px толщины,
   * то есть меньше ступени 8-битного буфера. Геометрия фигуры не округляется.
   */
  _shadeTables(shades) {
    if (!this._alpha || this._alpha.length !== shades || this._shadeWeight !== this.p.weight) {
      this._alpha = new Float32Array(shades);
      this._width = new Float32Array(shades);
      for (let i = 0; i < shades; i += 1) {
        const c = i / (shades - 1);
        this._alpha[i] = 0.06 + 0.94 * Math.pow(c, 0.85);
        this._width[i] = this.p.weight * (0.55 + 0.45 * c);
      }
      this._shadeWeight = this.p.weight;
    }
    if (!this._paths || this._paths.length !== shades) {
      this._paths = new Array(shades);
      this._counts = new Uint16Array(shades);
    }
    this._paths.fill(null);
    return this._paths;
  }

  _draw(dt) {
    const { ctx, p, w, h } = this;
    if (!w) return;

    const shape = SHAPES[p.shape] || SHAPES.triangle;
    const fill = shape.mode === 'fill';
    const trace = shape.trace;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // цвет знака — токен, он не меняется от кадра к кадру: читаем его на resize,
    // а не гоняем getComputedStyle внутри цикла отрисовки
    const ink = this.ink || (this.ink = this._markColor());
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (!this.reduced) {
      this.mouse.x += (this.mouse.tx - this.mouse.x) * p.ease;
      this.mouse.y += (this.mouse.ty - this.mouse.y) * p.ease;
      this.t += dt * p.flowSpeed;
      this.tb += dt * p.breatheSpeed;
    }

    const active = !this.reduced && this.mouse.inside;

    // в покое инверсия выключена: это движение, а не оформление
    const depth = this.reduced ? 0 : p.breathe;
    const lens = active ? p.invert : 0;

    // время входит в кадр двенадцатью синусами — по два на каждую волну,
    // дальше на ячейку остаётся только пара умножений (see _bakePhases)
    const t = this.t;
    const cu = Math.cos(t * 0.9), su = Math.sin(t * 0.9);
    const cv = Math.cos(t * 0.7), sv = Math.sin(t * 0.7);
    const cq = Math.cos(t * 0.45), sq = Math.sin(t * 0.45);
    const tb = this.tb;
    const cr1 = Math.cos(tb * 0.8), sr1 = Math.sin(tb * 0.8);
    const cr2 = Math.cos(tb * 0.55), sr2 = Math.sin(tb * 0.55);
    const cr3 = Math.cos(tb * 0.37), sr3 = Math.sin(tb * 0.37);

    const shades = p.shades | 0;
    const bins = shades > 1 ? this._shadeTables(shades) : null;
    const counts = this._counts;
    const last = shades - 1;

    const gx = this.gx, gy = this.gy, gcov = this.gcov, ph = this.ph;
    const ghost = p.ghost;
    const cellSize = p.cell;
    const sMin = p.sizeMin, sSpan = p.sizeMax - p.sizeMin;
    const mx = this.mouse.x, my = this.mouse.y;
    const mr = p.mouseRadius, swirl = p.swirl, pushK = p.push;
    const ir = p.invertRadius;

    for (let i = 0; i < this.n; i += 1) {
      const o = i * 12;
      let cov = gcov[i] > ghost ? gcov[i] : ghost;

      let ax = gx[i];
      let ay = gy[i];

      // расстояние до курсора нужно дважды: линзе инверсии и вихрю
      let dist = Infinity, dx = 0, dy = 0;
      if (active) {
        dx = ax - mx;
        dy = ay - my;
        // hypot в V8 заметно дороже корня, а переполнение здесь недостижимо
        dist = Math.sqrt(dx * dx + dy * dy);
      }

      // Инверсия: берётся сильнейший из двух источников — дыхание поля или
      // линза под курсором. Сумма пересвечивала бы место их встречи в ноль
      let b = 0;
      if (depth > 0) {
        const bv = 0.62 * (ph[o + 6] * cr1 - ph[o + 7] * sr1)
          + 0.62 * (ph[o + 9] * cr2 - ph[o + 8] * sr2)
          + 0.5 * (ph[o + 10] * cr3 + ph[o + 11] * sr3);
        b = smoothstep(0.3, 1.2, bv) * depth;
      }
      if (lens > 0 && dist < ir) {
        const bl = smoothstep(ir, ir * 0.25, dist) * lens;
        if (bl > b) b = bl;
      }
      if (b > 0) cov = cov * (1 - b) + (1 - cov) * b;
      if (cov < 0.02) continue;

      const base = 1.25 * (ph[o] * cu + ph[o + 1] * su)
        + 1.25 * (ph[o + 3] * cv + ph[o + 2] * sv)
        + 0.6 * (ph[o + 4] * cq + ph[o + 5] * sq);

      let ux = Math.cos(base);
      let uy = Math.sin(base);

      if (active) {
        const inf = smoothstep(mr, 0, dist) * swirl;
        if (inf > 0.001) {
          const nx = dist > 1e-3 ? dx / dist : 0;
          const ny = dist > 1e-3 ? dy / dist : 0;
          // касательная к курсору — фигуры закручиваются вокруг него
          // спираль: касательная плюс доля радиальной — так вихрь читается яснее кольца
          const sx = -ny * 0.82 + nx * 0.58;
          const sy = nx * 0.82 + ny * 0.58;
          const vx = ux * (1 - inf) + sx * inf;
          const vy = uy * (1 - inf) + sy * inf;
          // ячейки слегка расходятся — лёгкая дисторсия
          ax += nx * inf * pushK;
          ay += ny * inf * pushK;
          const inv = 1 / Math.sqrt(vx * vx + vy * vy);
          ux = vx * inv;
          uy = vy * inv;
        }
      }

      const len = cellSize * (sMin + sSpan * cov);

      if (bins) {
        let bi = (cov * last + 0.5) | 0;
        if (bi < 0) bi = 0; else if (bi > last) bi = last;
        // корзина — пачки по CHUNK фигур, а не один путь: фон почти целиком
        // падает в одну корзину, и заливка пути из десяти тысяч контуров
        // стоила 90 мс на кадр против 2 мс пачками (замер, Chrome)
        let list = bins[bi];
        if (!list) { list = bins[bi] = []; counts[bi] = CHUNK; }
        if (counts[bi] >= CHUNK) { list.push(new Path2D()); counts[bi] = 0; }
        counts[bi] += 1;
        trace(list[list.length - 1], ax, ay, ux, uy, len, p);
      } else {
        ctx.globalAlpha = 0.06 + 0.94 * Math.pow(cov, 0.85);
        ctx.lineWidth = p.weight * (0.55 + 0.45 * cov);
        ctx.beginPath();
        trace(ctx, ax, ay, ux, uy, len, p);
        if (fill) ctx.fill(); else ctx.stroke();
      }
    }

    // одна команда канве на пачку вместо одной на фигуру
    if (bins) {
      for (let i = 0; i < shades; i += 1) {
        const list = bins[i];
        if (!list) continue;
        ctx.globalAlpha = this._alpha[i];
        ctx.lineWidth = this._width[i];
        for (const path of list) {
          if (fill) ctx.fill(path); else ctx.stroke(path);
        }
      }
    }

    ctx.globalAlpha = 1;
    this._driftSatellite();
  }

  start() {
    if (this.reduced) { this.resize(); return; }
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt = this._last ? Math.min((now - this._last) / 1000, 0.05) : 0;
      this._last = now;
      if (!document.hidden && !this.paused) this._draw(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('pointermove', this._onPointer);
    window.removeEventListener('blur', this._onLeave);
    window.removeEventListener('resize', this._onResize);
  }
}
