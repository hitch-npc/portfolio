/**
 * Лучи за пластиной тега.
 *
 * Ровный веер из повторяющихся спиц читался колесом: одинаковый шаг,
 * одинаковая длина, общий поворот. Свет так не выглядит. Поэтому веер
 * собирается здесь, из случайных спиц:
 *   • углы — случайные, с минимальным зазором, чтобы спицы не слипались;
 *   • ширина у каждой своя;
 *   • яркость — одна из трёх ступеней (--ray-hi/mid/lo). Тусклая спица
 *     гаснет в маске раньше яркой, поэтому на глаз она короче: из яркости
 *     получается длина, без отдельной маски на каждую спицу.
 *
 * Вееров два, и крутятся они навстречу друг другу с разной скоростью
 * (neon.css, .neon-rays): длинный редкий и короткий частый. Короткий к тому же
 * дышит длиной. Спицы расходятся и пересекаются — свет «ходит», а не вертится.
 *
 * Случайность сеется текстом тега: у каждого тега свой рисунок, и он один
 * и тот же при каждой загрузке. Одинаковые веера на соседних тегах выдали бы
 * трафарет.
 *
 * Разметку лучи не трогают: лишний span скрыт от вспомогательных технологий,
 * текст тега прежний. Без скрипта тег просто остаётся без лучей.
 */

import { onScrollFrame, requestFrame } from './frame.js';

/** FNV-1a: из строки — 32-битное зерно. */
function hash(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: маленький генератор с зерном — повторяемая случайность. */
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Угловое расстояние по кругу, градусы. */
const arc = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Веер: conic-gradient из не более чем count спиц со случайными углами.
 *
 * Спицы расставляются с учётом собственной ширины: новая встаёт, только если
 * не задевает соседей, — широкие занимают своё место, узкие помещаются между
 * ними. Число спиц поэтому не фиксировано: сколько влезло за 600 попыток.
 * Точки градиента обязаны идти по порядку, и перехлёст спиц их бы сломал.
 *
 * Стык градиента (0°) ставится в середину самой широкой щели между краями
 * спиц — там он ни одну не разрежет.
 *
 * @param {() => number} rand
 * @param {number} count сколько спиц хотелось бы
 * @param {number} wMin полуширина самой тонкой спицы, градусы
 * @param {number} wMax и самой широкой
 */
function fan(rand, count, wMin, wMax) {
  const spokes = [];
  for (let tries = 0; spokes.length < count && tries < 600; tries += 1) {
    const a = rand() * 360;
    // степень растягивает разброс: большинство спиц средние, а редкие —
    // заметно шире остальных. При ровном распределении ширины сливались
    // в одну и веер снова читался трафаретом
    const w = wMin + rand() ** 1.7 * (wMax - wMin);
    if (spokes.every((s) => arc(a, s.a) > w + s.w + 1.5)) {
      const r = rand();
      spokes.push({ a, w, tier: r < 0.28 ? 'hi' : r < 0.62 ? 'mid' : 'lo' });
    }
  }
  if (!spokes.length) return 'none';
  spokes.sort((x, y) => x.a - y.a);

  // самая широкая щель между краями соседних спиц — туда встаёт стык
  let seam = 0;
  let widest = -1;
  spokes.forEach((s, i) => {
    const next = spokes[(i + 1) % spokes.length];
    const from = s.a + s.w;
    const to = (i + 1 < spokes.length ? next.a : next.a + 360) - next.w;
    if (to - from > widest) {
      widest = to - from;
      seam = (from + to) / 2;
    }
  });

  const stops = ['transparent 0deg'];
  spokes
    .map((s) => ({ ...s, a: (((s.a - seam) % 360) + 360) % 360 }))
    .sort((x, y) => x.a - y.a)
    .forEach(({ a, w, tier }) => {
      stops.push(
        `transparent ${(a - w).toFixed(2)}deg`,
        `var(--ray-${tier}) ${a.toFixed(2)}deg`,
        `transparent ${(a + w).toFixed(2)}deg`,
      );
    });
  stops.push('transparent 360deg');
  return `conic-gradient(from ${(seam % 360).toFixed(2)}deg, ${stops.join(', ')})`;
}

/** Подкладывает лучи под пластину тега. */
export function mountRays(host) {
  if (!host || host.querySelector(':scope > .neon-rays')) return;
  const rand = seeded(hash(host.textContent.trim()));

  const el = document.createElement('span');
  el.className = 'neon-rays';
  el.setAttribute('aria-hidden', 'true');
  // длинный веер — редкие широкие пучки, короткий — чаще и уже.
  // Пучки широкие: полуширина до 37° — это уже не спица, а столб света
  el.style.setProperty('--rays-long', fan(rand, 9, 10, 37));
  el.style.setProperty('--rays-short', fan(rand, 14, 6, 20));
  // фаза: соседние теги крутятся не в ногу
  el.style.setProperty('--ray-phase', rand().toFixed(3));
  host.prepend(el);
}

/* ── Курсор ────────────────────────────────────────────────────────────
   Курсор работает как фонарь: чем он ближе к тегу, тем ярче кант и ореол
   (--pulse-near), а лучи на стороне курсора разгораются и вытягиваются —
   маска .neon-rays открывает их полную длину в пятне вокруг точки
   --ray-x/--ray-y. Лучи с другой стороны остаются в покое, поэтому свет
   читается направленным, а не просто «ярче при наведении».

   Считается в общем кадре (see frame.js): геометрия тегов читается в фазе
   чтения, переменные пишутся в фазе записи. Прокрутка тоже просит кадр —
   теги едут под неподвижным курсором, и свет едет за ними сам. */

const REACH = 240;   // радиус, в котором курсор начинает влиять, px
const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Привязывает свет тегов к курсору. Только там, где курсор есть:
 * на тач-экранах и при prefers-reduced-motion теги остаются в покое.
 * @param {HTMLElement[]} hosts теги с уже подложенными лучами
 */
export function bindRays(hosts) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = hosts
    .map((host) => ({ host, rays: host.querySelector(':scope > .neon-rays'), near: 0 }))
    .filter((it) => it.rays);
  if (!fine || still || !items.length) return;

  let pointer = null;
  addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    requestFrame();
  }, { passive: true });
  // курсор ушёл из окна — фонарь гаснет
  document.documentElement.addEventListener('pointerleave', () => {
    pointer = null;
    requestFrame();
  });

  onScrollFrame(
    () => {
      // без курсора и с уже погасшим светом читать геометрию незачем
      if (!pointer && items.every((it) => it.near === 0)) return null;
      return items.map((it) => it.rays.getBoundingClientRect());
    },
    (rects) => {
      if (!rects) return;
      items.forEach((it, i) => {
        const r = rects[i];
        let near = 0;
        if (pointer) {
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const d = Math.hypot(pointer.x - cx, pointer.y - cy);
          near = smooth(Math.max(0, 1 - d / REACH));
          // точка фонаря — в координатах контейнера лучей
          it.rays.style.setProperty('--ray-x', `${(pointer.x - r.left).toFixed(1)}px`);
          it.rays.style.setProperty('--ray-y', `${(pointer.y - r.top).toFixed(1)}px`);
        }
        if (Math.abs(near - it.near) < 0.002) return;
        it.near = near < 0.002 ? 0 : near;
        it.host.style.setProperty('--pulse-near', it.near.toFixed(3));
      });
    },
  );
}
