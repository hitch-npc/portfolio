/**
 * Дешифровка текста: символы сыплются случайным мусором и по очереди
 * встают на место слева направо. Смысл собирается из шума — тот же язык,
 * что у знака: из множества мелких частей по одному правилу.
 *
 * Работает по времени, а не по числу кадров: в фоновой вкладке кадры не идут,
 * и счётчик кадров оставил бы строку недописанной навсегда.
 *
 * Скринридер мусор не слышит: перебор идёт в видимой копии с aria-hidden,
 * рядом лежит итоговая строка для вспомогательных технологий. aria-label
 * здесь не годится — у абзаца и метки имени нет, и его не читают.
 *
 * prefers-reduced-motion: текст ставится сразу, без перебора.
 */
import { reduced } from './reduced.js';

const GLYPHS = '#%&/\\<>[]{}*+=-_01234567ABCDEFXZ';
const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
// пробелы, в том числе неразрывные в разрядах чисел, не перебираются
const fixed = (ch) => /\s/.test(ch);

/**
 * @param {HTMLElement} el куда писать
 * @param {string} text итоговая строка
 * @param {{stagger?:number, settle?:number, swap?:number, alive?:() => boolean}} [opts]
 *   alive — пока true, перебор идёт; false — останавливается, не трогая текст
 * @returns {Promise<void>}
 */
export function decrypt(el, text, opts = {}) {
  const { stagger = 34, settle = 260, swap = 45, alive = () => true } = opts;
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
      if (!alive()) { resolve(); return; }
      const t = now - start;
      const churn = now - lastSwap > swap;
      if (churn) lastSwap = now;

      let out = '';
      for (let i = 0; i < chars.length; i++) {
        const at = i * stagger + settle;
        if (t >= at || fixed(chars[i])) out += chars[i];
        else if (t >= at - settle * 3) out += churn ? pick() : (frame[i] ?? pick());
        else out += ' ';
      }
      if (out !== frame) {
        frame = out;
        el.textContent = out;
      }

      if (t >= total) { el.textContent = text; resolve(); return; }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

/**
 * Готовит элемент к дешифровке: видимая копия для перебора и итоговая
 * строка для скринридера. Возвращает видимую копию — писать нужно в неё.
 * Повторный вызов обновляет текст, не плодя копий.
 */
export function prepare(el, text) {
  let shown = el.querySelector(':scope > [data-decrypt-shown]');
  let sr = el.querySelector(':scope > [data-decrypt-sr]');
  if (!shown) {
    shown = document.createElement('span');
    shown.dataset.decryptShown = '';
    shown.setAttribute('aria-hidden', 'true');
    sr = document.createElement('span');
    sr.dataset.decryptSr = '';
    sr.className = 'sr-only';
    el.replaceChildren(shown, sr);
  }
  shown.textContent = text;
  sr.textContent = text;
  el.dataset.text = text;
  return shown;
}

/**
 * Всё, что помечено [data-decrypt], дешифруется один раз — когда элемент
 * на 60% в кадре. Значение атрибута, если есть, — шаг между буквами в мс.
 *
 * Строка стирается только когда наблюдатель ответил «за экраном»: если не
 * отрисовалось ни кадра (робот, фоновая вкладка), текст остаётся на месте.
 */
export function bindDecrypt(root = document) {
  const els = [...root.querySelectorAll('[data-decrypt]')];
  if (!els.length || reduced()) return null;

  const shown = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const el = e.target;
      const view = shown.get(el);
      if (!e.isIntersecting) {
        if (!el.dataset.armed) {
          el.dataset.armed = '1';
          view.textContent = '';
        }
        continue;
      }
      io.unobserve(el);
      decrypt(view, el.dataset.text, { stagger: Number(el.dataset.decrypt) || undefined });
    }
  }, { threshold: 0.6 });

  for (const el of els) {
    shown.set(el, prepare(el, el.textContent.trim()));
    io.observe(el);
  }
  return io;
}
