/**
 * GlyphField — знак TBCS, собранный из поля стрелок.
 *
 * Как устроено:
 *   1. Текст рисуется в невидимый canvas и размывается — получается карта покрытия
 *      (0..1 на ячейку сетки). Размытие и есть «мягкий край»: у границы буквы
 *      покрытие падает плавно, стрелки укорачиваются и гаснут, а не обрываются.
 *   2. Сетка ячеек. В каждой рисуется стрелка: длина и яркость — от покрытия,
 *      направление — от поля потока.
 *   3. Поле потока — сумма несинхронных волн, поэтому рисунок не зацикливается
 *      на глаз. Курсор добавляет вихрь: рядом с ним стрелки разворачиваются
 *      по касательной и ячейки слегка расходятся — это и есть дисторсия.
 *
 *   4. Дыхание инверсии — медленные пятна, внутри которых покрытие переворачивается:
 *      буква уходит в тень, фон вспыхивает. Знак читается и в негативе, потому что
 *      его держит перепад плотности, а не сам по себе светлый цвет.
 *
 * Буква остаётся читаемой, потому что её держит плотность и яркость, а не контур.
 *
 * prefers-reduced-motion: один статичный кадр, без анимации и без реакции на курсор.
 */

export const PARAMS = {
  text: 'TBCS',
  stackBelow: 620,     // ниже этой ширины знак встаёт в две строки: TB / CS
  lineGap: 0.12,       // просвет между строками, доли высоты прописной
  fitStacked: 0.82,    // в две строки знак шире: строка вдвое короче, места больше
  lineGapStacked: 0.3, // и просвет крупнее, иначе длинные стрелки сшивают строки
  tracking: -0.05,     // разрядка знака, доли кегля
  fit: 0.71,           // доля ширины холста под знак
  cell: 14.02,         // шаг сетки, css-пиксели (пересчитывается, если autoCell)
  autoCell: true,      // шаг сетки от высоты букв, а не от ширины экрана
  rowsPerCap: 22,      // сколько рядов стрелок укладывается в высоту прописной
  cellMin: 6,
  cellMax: 34,
  maxCells: 26000,     // потолок числа стрелок: страховка для слабых машин и телефонов
  blur: 10.94,         // размытие маски, css-пиксели (пересчитывается, если autoCell)
  blurRatio: 0.78,     // размытие от шага сетки — мягкость края держится пропорционально
  ghost: 0.075,        // покрытие вне буквы: еле видные стрелки фона
  arrowMin: 0.28,      // длина стрелки при нулевом покрытии, доли ячейки
  arrowMax: 2.0,       // длина при полном покрытии
  headRatio: 0.13,     // размер наконечника от длины
  weight: 0.85,        // толщина линии, css-пиксели
  flowScale: 5.5,      // масштаб поля потока: меньше — крупнее и глаже волны
  flowSpeed: 0.86,     // скорость дрейфа поля
  breathe: 0.82,       // глубина инверсии: 0 — выключено, 1 — полный негатив в пятне
  breatheScale: 1.9,   // масштаб пятен инверсии: меньше — пятна крупнее
  breatheSpeed: 0.09,  // скорость дрейфа пятен: своё время, медленнее потока
  mouseRadius: 410,    // радиус вихря, css-пиксели
  swirl: 1.0,          // насколько курсор перебивает поле (0..1)
  push: 51,            // расхождение ячеек от курсора, css-пиксели
  ease: 0.16,          // инертность курсора
};

const TAU = Math.PI * 2;
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
    this.p = { ...PARAMS, ...params };
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
   * Привязывает DOM-элемент к полю: его сносит тем же потоком, что и стрелки,
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
    // и поле стрелок вырождается в растр
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

    const layout = this._layout(w, h);

    // шаг сетки — от высоты прописной: на любом экране в букву укладывается
    // одинаковое число стрелок, иначе знак вырождается либо в штриховку, либо в кашу
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

    // габариты знака в css-пикселях — по ним DOM ставит ™, шейпы и подписи
    const markWidth = Math.max(...layout.lines.map((l) => l.rawWidth)) * layout.scale;
    this.markBox = {
      left: (w - markWidth) / 2,
      top: h / 2 - layout.blockHeight / 2,
      width: markWidth,
      height: layout.blockHeight,
      cap: layout.cap,
    };
    this.canvas.dispatchEvent(new CustomEvent('markbox', { detail: this.markBox }));
    this._draw(0);
  }

  /** Направление поля потока в точке. */
  _flow(nx, ny, t) {
    const s = this.p.flowScale;
    return (
      Math.sin(nx * s * 2.0 + t * 0.9) * 1.25 +
      Math.cos(ny * s * 1.6 - t * 0.7) * 1.25 +
      Math.sin((nx + ny) * s * 1.1 + t * 0.45) * 0.6
    );
  }

  /**
   * Дыхание инверсии: медленно плывущие пятна, внутри которых покрытие
   * переворачивается — буква уходит в тень, фон вспыхивает. Берём только гребни
   * суммы волн, поэтому пятна отдельные, а не общий градиент.
   */
  _breath(nx, ny, t) {
    const s = this.p.breatheScale;
    const v =
      Math.sin(nx * s * 1.7 - t * 0.8) * 0.62 +
      Math.cos(ny * s * 1.3 + t * 0.55) * 0.62 +
      Math.sin((nx * 0.8 - ny) * s * 0.9 + t * 0.37) * 0.5;
    return smoothstep(0.3, 1.2, v);
  }

  _draw(dt) {
    const { ctx, p, w, h } = this;
    if (!w) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = this._markColor();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (!this.reduced) {
      this.mouse.x += (this.mouse.tx - this.mouse.x) * p.ease;
      this.mouse.y += (this.mouse.ty - this.mouse.y) * p.ease;
      this.t += dt * p.flowSpeed;
      this.tb += dt * p.breatheSpeed;
    }

    const active = !this.reduced && this.mouse.inside;
    const head = p.headRatio;

    // в покое инверсия выключена: это движение, а не оформление
    const depth = this.reduced ? 0 : p.breathe;

    for (const cell of this.cells) {
      let cov = Math.max(cell.cov, p.ghost);
      if (depth > 0) {
        const b = this._breath(cell.x / w, cell.y / h, this.tb) * depth;
        cov = cov * (1 - b) + (1 - cov) * b;
      }
      if (cov < 0.02) continue;

      let ax = cell.x;
      let ay = cell.y;

      const base = this._flow(cell.x / w, cell.y / h, this.t);
      let vx = Math.cos(base);
      let vy = Math.sin(base);

      if (active) {
        const dx = cell.x - this.mouse.x;
        const dy = cell.y - this.mouse.y;
        const dist = Math.hypot(dx, dy);
        const inf = smoothstep(p.mouseRadius, 0, dist) * p.swirl;
        if (inf > 0.001) {
          const nx = dist > 1e-3 ? dx / dist : 0;
          const ny = dist > 1e-3 ? dy / dist : 0;
          // касательная к курсору — стрелки закручиваются вокруг него
          // спираль: касательная плюс доля радиальной — так вихрь читается яснее кольца
          const sx = -ny * 0.82 + nx * 0.58;
          const sy = nx * 0.82 + ny * 0.58;
          vx = vx * (1 - inf) + sx * inf;
          vy = vy * (1 - inf) + sy * inf;
          // ячейки слегка расходятся — лёгкая дисторсия
          ax += nx * inf * p.push;
          ay += ny * inf * p.push;
        }
      }

      const len = p.cell * (p.arrowMin + (p.arrowMax - p.arrowMin) * cov);
      const inv = 1 / Math.hypot(vx, vy);
      const ux = vx * inv;
      const uy = vy * inv;

      const hx = ax + ux * len * 0.5;
      const hy = ay + uy * len * 0.5;
      const tx = ax - ux * len * 0.5;
      const ty = ay - uy * len * 0.5;

      ctx.globalAlpha = 0.06 + 0.94 * Math.pow(cov, 0.85);
      ctx.lineWidth = p.weight * (0.55 + 0.45 * cov);

      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      // наконечник
      const hl = len * head;
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - ux * hl - uy * hl * 0.55, hy - uy * hl + ux * hl * 0.55);
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - ux * hl + uy * hl * 0.55, hy - uy * hl - ux * hl * 0.55);
      ctx.stroke();
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
