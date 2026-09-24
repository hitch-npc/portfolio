/**
 * В АРХИВЕ: мешала быстрому вводу — приложение из кэша открывается почти
 * мгновенно, а заставка держала экран не меньше секунды. Как вернуть —
 * tracker/README.md, раздел «Архив».
 *
 * Заставка при запуске: пять иконок разделов в ряд, одного размера,
 * по ним от одной к другой прыгает чёрная пилюля — как индикатор
 * в навигации, — а под ними тонкая линия загрузки без цифр и текста.
 *
 * Линия идёт по настоящим шагам запуска (база, данные, шрифты). Чтобы
 * игру иконок успели увидеть, заставка держится не меньше MIN_MS;
 * с «Уменьшить движение» — ровно столько, сколько идёт загрузка.
 */
import { h, sectionIcon, calm } from '../src/ui.js';

const MIN_MS = 1100;
const ORDER = ['today', 'plan', 'spheres', 'goals', 'brief'];

export function showPreloader() {
  const started = performance.now();
  const bar = h('span', { class: 'pre-fill' });
  const el = h('div', { class: 'preloader', role: 'progressbar', 'aria-label': 'Loading', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('div', { class: 'pre-row' },
      h('span', { class: 'pre-pill', 'aria-hidden': 'true' }),
      ORDER.map((name, i) => h('span', { class: `pre-icon pre-icon-${i}` }, sectionIcon(name, !calm())))),
    h('span', { class: 'pre-track', 'aria-hidden': 'true' }, bar));
  document.body.append(el);

  return {
    /** Доля 0…1: сколько шагов запуска пройдено. */
    progress(k) {
      bar.style.transform = `scaleX(${k})`;
      el.setAttribute('aria-valuenow', String(Math.round(k * 100)));
    },
    /** Снять заставку: не раньше MIN_MS от показа, потом — растворение. */
    async done() {
      this.progress(1);
      const wait = calm() ? 0 : Math.max(0, MIN_MS - (performance.now() - started));
      await new Promise((r) => setTimeout(r, wait + 180));
      el.classList.add('is-gone');
      setTimeout(() => el.remove(), calm() ? 0 : 420);
    },
  };
}
