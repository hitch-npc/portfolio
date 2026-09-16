/**
 * VHS — плёнка, а не картинка поверх.
 *
 * Что делает кассету кассетой: зерно меняется каждый кадр, изображение
 * теряет строки (дропауты), внизу кадра живёт полоса переключения головок,
 * и время от времени трекинг срывается на десятую долю секунды.
 * Статичная текстура ничего этого не даёт — она читается наклейкой.
 *
 * Полоса трекинга рисуется на том же холсте, а не отдельным слоем с
 * backdrop-filter: такой слой в Chromium забирает под себя всё, что под ним,
 * и холст радужки в соседней секции переставал обновляться на экране.
 *
 * Зерно не генерится попиксельно каждый кадр: заранее печатаем несколько
 * плиток шума и каждый кадр кладём другую со случайным сдвигом. Тайлинг не
 * виден именно из-за сдвига, а цена — несколько drawImage вместо сотен тысяч
 * случайных чисел.
 *
 * prefers-reduced-motion: один статичный кадр зерна, без срывов и дропаутов.
 */

const rand = (a, b) => a + Math.random() * (b - a);

const TILE = 220;
const TILES = 4;

export class Tape {
  /** @param {HTMLCanvasElement} canvas холст плёнки */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.t = 0;
    this.paused = false;
    this._raf = null;
    this._last = 0;
    this._acc = 0;

    this.glitchIn = rand(5, 12);
    this.glitch = 0;
    this.drops = [];
    this.bandY = 1.1;   // положение полосы трекинга, доли высоты

    this._bakeTiles();
    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize);
  }

  /** Плитки зерна: печатаются один раз, дальше только тасуются. */
  _bakeTiles() {
    this.tiles = [];
    for (let n = 0; n < TILES; n++) {
      const c = document.createElement('canvas');
      c.width = TILE;
      c.height = TILE;
      const g = c.getContext('2d');
      const img = g.createImageData(TILE, TILE);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        // яркостный шум: зерно бесцветное, цвет плёнке даёт отдельный слой
        const v = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.tiles.push(c);
    }
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.dpr = 1; // плёнке разрешение не нужно: она и должна быть грубой
    this.canvas.width = Math.round(w / 2);
    this.canvas.height = Math.round(h / 2);
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.draw(0);
  }

  /** Дропаут: короткий светлый штрих, плёнка потеряла кусок строки. */
  _spawnDrop() {
    this.drops.push({
      x: rand(0, this.w),
      y: rand(0, this.h),
      w: rand(6, 60),
      h: rand(1, 2.5),
      life: rand(0.05, 0.2),
    });
  }

  draw(dt) {
    const { ctx } = this;
    if (!this.w) return;

    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'source-over';

    // зерно: другая плитка, другой сдвиг — каждый кадр
    const tile = this.tiles[(Math.random() * TILES) | 0];
    const ox = -Math.random() * TILE;
    const oy = -Math.random() * TILE;
    ctx.globalAlpha = 0.3 + this.glitch * 0.45;
    const pattern = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, this.w - ox, this.h - oy);
    ctx.restore();

    if (this.reduced) { ctx.globalAlpha = 1; return; }

    this.t += dt;

    // срыв трекинга: редко, коротко, заметно
    this.glitchIn -= dt;
    if (this.glitchIn <= 0) {
      this.glitch = 1;
      this.glitchIn = rand(5, 13);
    }
    this.glitch = Math.max(0, this.glitch - dt * 5);

    // полоса трекинга: медленно ползёт снизу вверх, на срыве дёргается
    this.bandY -= dt / 11;
    if (this.bandY < -0.2) this.bandY = 1.1;
    const by = this.bandY * this.h;
    const bh = this.h * 0.15;
    const jump = this.glitch > 0 ? rand(-20, 20) : 0;

    const sheen = ctx.createLinearGradient(0, by, 0, by + bh);
    sheen.addColorStop(0, 'rgb(255 255 255 / 0)');
    sheen.addColorStop(0.45, 'rgb(255 255 255 / 0.5)');
    sheen.addColorStop(0.6, 'rgb(255 255 255 / 0.16)');
    sheen.addColorStop(1, 'rgb(255 255 255 / 0)');
    ctx.globalAlpha = 0.85 + this.glitch * 0.15;
    ctx.fillStyle = sheen;
    ctx.fillRect(jump, by, this.w, bh);

    // внутри полосы лента тянется: шум растянут по горизонтали
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, by + bh * 0.35, this.w, bh * 0.3);
    ctx.clip();
    ctx.globalAlpha = 0.6;
    ctx.translate(jump, 0);
    ctx.scale(4, 1);
    ctx.fillStyle = ctx.createPattern(this.tiles[(Math.random() * TILES) | 0], 'repeat');
    ctx.fillRect(-this.w, by, this.w * 2, bh);
    ctx.restore();

    // на срыве лента едет полосами
    if (this.glitch > 0.02) {
      const slices = 3 + ((Math.random() * 4) | 0);
      for (let i = 0; i < slices; i++) {
        const y = rand(0, this.h);
        const hh = rand(2, 14);
        const dx = rand(-30, 30) * this.glitch;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(this.canvas, 0, y, this.w, hh, dx, y, this.w, hh);
      }
    }

    // дропауты
    if (Math.random() < dt * (7 + this.glitch * 60)) this._spawnDrop();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      if (d.life <= 0) { this.drops.splice(i, 1); continue; }
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = 'rgb(255 255 255)';
      ctx.fillRect(d.x, d.y, d.w, d.h);
    }
    ctx.globalCompositeOperation = 'source-over';

    // полоса переключения головок: самый узнаваемый след кассеты
    const hs = Math.round(this.h * 0.022);
    const hy = this.h - hs;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, hy, this.w, hs);
    ctx.clip();
    ctx.globalAlpha = 0.85;
    ctx.translate(rand(-14, 14), 0);
    ctx.fillStyle = ctx.createPattern(this.tiles[(Math.random() * TILES) | 0], 'repeat');
    ctx.fillRect(-20, hy, this.w + 40, hs);
    ctx.restore();

    ctx.globalAlpha = 0.28;
    ctx.fillStyle = 'rgb(255 255 255)';
    ctx.fillRect(0, hy - 1, this.w, 1);
    ctx.globalAlpha = 1;
  }

  start() {
    if (this.reduced) { this.resize(); return; }
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt = this._last ? Math.min((now - this._last) / 1000, 0.05) : 0;
      this._last = now;
      if (document.hidden || this.paused) return;
      // плёнка идёт 24 кадра в секунду: дешевле и честнее по фактуре
      this._acc += dt;
      if (this._acc < 1 / 24) return;
      this.draw(this._acc);
      this._acc = 0;
    };
    this._raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    removeEventListener('resize', this._onResize);
  }
}

/** Поднимает плёнку: всё живёт на одном холсте. */
export function mountTape(canvas) {
  if (!canvas) return null;
  const tape = new Tape(canvas);
  tape.resize();
  tape.start();
  return tape;
}
