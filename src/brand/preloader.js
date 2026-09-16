/**
 * Прелоадер TBCS — лента из линз.
 *
 * Лента собрана из вертикальных линз (пересечение двух дуг). К центру линзы шире
 * и выше, перекрываются и сливаются в сплошную массу с зубчатым краем; к краям
 * расходятся в тонкие серпы. Прогресс раскрывает ленту от центра наружу —
 * поэтому «сколько загрузилось» видно по ширине, а не только по цифре.
 *
 * Поверх ленты — процент и сменяющиеся строки. Они появляются и гаснут,
 * не дёргая раскладку: обе живут в одной строке и меняют только прозрачность.
 *
 * prefers-reduced-motion: прелоадер не показывается вовсе.
 */

export const PHRASES = [
  'Looking for references',
  'Digital can be art',
  'Finding the vibe',
  'Measuring the contrast',
  'Generating tokens',
  'Sharpening the edges',
];

const MIN_DURATION = 2400; // мс — чтобы прелоадер успели прочитать
const PHRASE_EVERY = 900;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Preloader {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('[data-preloader-band]');
    this.phraseEl = root.querySelector('[data-preloader-phrase]');
    this.pctEl = root.querySelector('[data-preloader-pct]');
    this.ctx = this.canvas.getContext('2d');

    this.progress = 0;
    this.shown = 0;       // сглаженный прогресс, чтобы цифра не прыгала
    this.phrase = 0;
    this.t = 0;
    this._raf = null;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 2) return;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = Math.round(r.width);
    this.h = Math.round(r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  _bandColor() {
    return getComputedStyle(this.canvas).getPropertyValue('--brand-veil').trim();
  }

  _draw() {
    const { ctx, w, h } = this;
    if (!w) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this._bandColor();

    const count = Math.max(21, Math.round(w / 34)) | 1; // нечётное — линза строго по центру
    const spacing = w / count;
    const cx = w / 2;
    const cy = h / 2;
    const maxH = h * 0.92;

    for (let i = 0; i < count; i++) {
      const u = (i / (count - 1)) * 2 - 1;          // -1..1
      const bell = Math.pow(Math.cos((u * Math.PI) / 2), 0.55);

      // раскрытие от центра: за фронтом линзы ещё не выросли
      const vis = smoothstep(this.shown + 0.10, this.shown - 0.02, Math.abs(u));
      if (vis <= 0.001) continue;

      const wobble = 1 + 0.05 * Math.sin(this.t * 2.1 + i * 0.85);
      const b = (maxH / 2) * (0.30 + 0.70 * bell) * wobble * (0.25 + 0.75 * vis);
      const a = (spacing / 2) * (0.55 + 0.80 * bell) * (0.35 + 0.65 * vis);

      const x = cx + u * (w / 2 - spacing / 2);

      ctx.beginPath();
      ctx.moveTo(x, cy - b);
      ctx.quadraticCurveTo(x + 2 * a, cy, x, cy + b);
      ctx.quadraticCurveTo(x - 2 * a, cy, x, cy - b);
      ctx.fill();
    }
  }

  /**
   * Крутит прелоадер, пока не готовы шрифты и не вышло минимальное время.
   * @returns {Promise<void>}
   */
  run() {
    this.resize();

    const started = performance.now();
    let fontsReady = false;
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { fontsReady = true; });

    this.phraseEl.textContent = PHRASES[0];
    this.phraseEl.classList.add('is-in');

    return new Promise((resolve) => {
      let lastPhrase = started;
      let last = started;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        cancelAnimationFrame(this._raf);
        clearTimeout(watchdog);
        this.pctEl.textContent = '100';
        resolve();
      };

      // в фоновой вкладке requestAnimationFrame не вызывается и прелоадер замирает;
      // сторож доводит его до конца по обычному таймеру
      const watchdog = setTimeout(finish, MIN_DURATION + 4000);

      const loop = (now) => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        this.t += dt;

        const byTime = (now - started) / MIN_DURATION;
        // до готовности шрифтов прогресс упирается в 0.92 — цифра не врёт про «100»
        this.progress = fontsReady ? Math.min(1, byTime) : Math.min(0.92, byTime);
        this.shown += (this.progress - this.shown) * 0.12;

        this.pctEl.textContent = String(Math.round(this.shown * 100));
        this._draw();

        if (now - lastPhrase > PHRASE_EVERY && this.progress < 0.98) {
          lastPhrase = now;
          this.phraseEl.classList.remove('is-in');
          setTimeout(() => {
            this.phrase = (this.phrase + 1) % PHRASES.length;
            this.phraseEl.textContent = PHRASES[this.phrase];
            this.phraseEl.classList.add('is-in');
          }, 220);
        }

        if (this.progress >= 1 && this.shown > 0.995) {
          finish();
          return;
        }
        this._raf = requestAnimationFrame(loop);
      };

      this._raf = requestAnimationFrame(loop);
    });
  }

  /** Гасит прелоадер и убирает его из дерева. */
  async dismiss() {
    this.root.classList.add('is-done');
    await new Promise((r) => setTimeout(r, 620));
    this.destroy();
    this.root.remove();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
  }
}
