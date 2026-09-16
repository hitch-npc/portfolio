/**
 * Дешифровка текста: символы сыплются случайным мусором и по очереди
 * встают на место слева направо.
 *
 * Работает по времени, а не по числу кадров: в фоновой вкладке кадры не идут,
 * и счётчик кадров оставил бы строку недописанной навсегда.
 *
 * prefers-reduced-motion: текст ставится сразу, без перебора.
 */

const GLYPHS = '#%&/\\<>[]{}*+=-_01234567ABCDEFXZ';
const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {HTMLElement} el куда писать
 * @param {string} text итоговая строка
 * @param {{stagger?:number, settle?:number, swap?:number}} [opts]
 * @returns {Promise<void>}
 */
export function decrypt(el, text, opts = {}) {
  const { stagger = 34, settle = 260, swap = 45 } = opts;
  const chars = [...text];

  if (reduced()) {
    el.textContent = text;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const start = performance.now();
    const total = chars.length * stagger + settle;
    let lastSwap = 0;
    let frame = '';

    const tick = (now) => {
      const t = now - start;
      const churn = now - lastSwap > swap;
      if (churn) lastSwap = now;

      let out = '';
      let changed = churn;
      for (let i = 0; i < chars.length; i++) {
        const at = i * stagger + settle;
        if (t >= at || chars[i] === ' ') out += chars[i];
        else if (t >= at - settle * 3) out += churn ? pick() : (frame[i] ?? pick());
        else out += ' ';
      }
      if (changed || out !== frame) {
        frame = out;
        el.textContent = out;
      }

      if (t >= total) { el.textContent = text; resolve(); return; }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

/** Обратная дешифровка: строка рассыпается в мусор и гаснет. */
export function scramble(el, duration = 420) {
  const text = el.textContent;
  if (reduced()) return Promise.resolve();

  return new Promise((resolve) => {
    const start = performance.now();
    const chars = [...text];
    const tick = (now) => {
      const k = Math.min(1, (now - start) / duration);
      el.textContent = chars.map((c) => (c === ' ' ? ' ' : Math.random() < k ? pick() : c)).join('');
      if (k >= 1) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
