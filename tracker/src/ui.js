/**
 * Кирпичи интерфейса: h() для DOM, иконки и глифы, тост, шторка,
 * перетаскивание и сохранение фокуса при перерисовке.
 *
 * Стили — только через классы и el.style: политика безопасности страницы
 * запрещает атрибут style и встроенные <style>.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** h('div', { class, on…, data-…, aria-… }, ...дети). null/false пропускаются. */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : String(k));
  }
}

/* ── иконки и глифы ──────────────────────────────────────────────────── */

function svg(viewBox, markup, cls) {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('class', cls);
  el.innerHTML = markup;
  return el;
}

const S = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';
const loop = 'repeatCount="indefinite"';
const ease = 'calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"';

/*
 * Иконки разделов — тонкая линия, кольца и оси; где линии встречаются,
 * стык «слипается» каплей (фильтр goo: лёгкое размытие + порог по альфе).
 * Движение — SMIL, без JS: глобус вращает меридианы, у Луны ходит фаза,
 * к центру мишени сходятся круги, в брифе прописываются строки,
 * шестерёнка крутится, у солнца по кругу бежит свет.
 *
 * Базовые атрибуты — поза покоя: без элементов анимации иконка неподвижна
 * и закончена (так рисуются неоткрытые вкладки и «Уменьшить движение»).
 * __ID__ — место для уникального id фильтра: иконок на странице несколько.
 */
const GOO = `<defs><filter id="__ID__" x="-20%" y="-20%" width="140%" height="140%">
  <feGaussianBlur stdDeviation=".55"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -6.5"/></filter></defs>`;
const G = `filter="url(#__ID__)" ${S}`;

const meridian = (rx, begin) =>
  `<ellipse cx="12" cy="12" rx="${rx}" ry="9"><animate attributeName="rx" dur="3.6s" begin="${begin}" ${loop} values="9;6.4;0;6.4;9"/></ellipse>`;

const sunDots = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  const x = (12 + 8.4 * Math.sin(a)).toFixed(2);
  const y = (12 - 8.4 * Math.cos(a)).toFixed(2);
  return `<circle cx="${x}" cy="${y}" r="1.3"><animate attributeName="opacity" dur="1.6s" begin="${(-i * 0.2).toFixed(1)}s" ${loop} values="1;.25;.25"/></circle>`;
}).join('');

const LIVE = {
  // сегодня — солнце: точка и венец, по которому бежит свет
  today: `<g ${F}><circle cx="12" cy="12" r="3.4"/>${sunDots}</g>`,
  // план — Луна: терминатор проходит по диску, фазы сменяются; в покое — половина
  plan: `${GOO}<g ${G}><circle cx="12" cy="12" r="8.5"/>
    <g transform="translate(12 0)"><g transform="scale(0.001 1)"><path d="M0 3.5A8.5 8.5 0 0 1 0 20.5" vector-effect="non-scaling-stroke"/>
      <animateTransform attributeName="transform" type="scale" dur="4s" begin="-1s" ${loop} values="1 1;-1 1;1 1" keyTimes="0;.5;1" ${ease}/></g></g></g>
    <path d="M20 1.5v3M18.5 3h3" ${S} opacity=".9"><animate attributeName="opacity" dur="2s" ${loop} values="0;1;0"/></path>`,
  // сферы — глобус: меридианы вращаются, полюса слипаются
  spheres: `${GOO}<g ${G}><g transform="rotate(-18 12 12)">
    <circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="2.6"/>
    ${meridian(9, '0s')}${meridian(3.2, '-1.2s')}${meridian(3.2, '-2.4s')}</g></g>`,
  // цели — прицел: кольцо с рисками, круги сходятся к центру
  goals: `${GOO}<g ${G}><circle cx="12" cy="12" r="8"/>
    <path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/>
    ${[0, -1.2].map((b) => `<circle cx="12" cy="12" r="8" opacity="0"><animate attributeName="r" dur="2.4s" begin="${b}s" ${loop} values="8;1.5"/><animate attributeName="opacity" dur="2.4s" begin="${b}s" ${loop} values="0;1;0"/></circle>`).join('')}
    </g><circle cx="12" cy="12" r="1.5" ${F}/>`,
  // бриф — ось и строки, которые прописываются от оси
  brief: `${GOO}<g ${G}><path d="M6 3v18"/>
    ${[[7, 12, '0;.25'], [12, 9, '.15;.4'], [17, 11, '.3;.55']].map(([y, w, k]) => {
      const [k1, k2] = k.split(';');
      return `<path d="M6 ${y}h${w}" stroke-dasharray="${w}" stroke-dashoffset="0"><animate attributeName="stroke-dashoffset" dur="3.2s" ${loop} values="${w};${w};0;0;${w}" keyTimes="0;${k1 === '0' ? '0.001' : k1};${k2};.85;1"/></path>`;
    }).join('')}</g>`,
  // настройки — шестерёнка: кольцо, втулка и зубья-риски, медленно вращается
  settings: `${GOO}<g ${G}><g>
    <circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.2"/>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M5.64 18.36l2.12-2.12M16.24 7.76l2.12-2.12"/>
    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="14s" ${loop}/></g></g>`,
};

let gooId = 0;

/**
 * Иконка раздела. live — с движением; без него элементы анимации убраны,
 * и остаётся поза покоя.
 */
export function sectionIcon(name, live = false) {
  const el = svg('0 0 24 24', LIVE[name].replaceAll('__ID__', `goo-${++gooId}`), `icon icon-${name}`);
  el.setAttribute('width', 24);
  el.setAttribute('height', 24);
  if (!live) el.querySelectorAll('animate, animateTransform, animateMotion').forEach((n) => n.remove());
  return el;
}

/*
 * Служебные иконки: сетка 24×24, та же тонкая линия, прямые — на целых
 * координатах. Ничего лишнего: предмет и всё.
 */
const ICONS = {
  plus: `<path d="M12 5v14M5 12h14" ${S}/>`,
  check: `<path d="M5 12l4 4 10-10" ${S}/>`,
  close: `<path d="M6 6l12 12M18 6L6 18" ${S}/>`,
  back: `<path d="M15 5l-7 7 7 7" ${S}/>`,
  chevron: `<path d="M9 5l7 7-7 7" ${S}/>`,
  more: `<circle cx="5" cy="12" r="1.5" ${F}/><circle cx="12" cy="12" r="1.5" ${F}/><circle cx="19" cy="12" r="1.5" ${F}/>`,
  drag: `<g ${F}><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>`,
  copy: `<rect x="8" y="8" width="12" height="12" rx="2" ${S}/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" ${S}/>`,
  download: `<path d="M12 4v11M7 10l5 5 5-5M5 20h14" ${S}/>`,
  upload: `<path d="M12 15V4M7 9l5-5 5 5M5 20h14" ${S}/>`,
};

/**
 * Иконка size×size без масштабирования: меньший размер — это обрезка поля
 * вокруг рисунка, а не уменьшение, так что 2 px остаются 2 px.
 */
export function icon(name, size = 24) {
  if (LIVE[name] && size === 24) return sectionIcon(name);
  const o = (24 - size) / 2;
  const el = svg(`${o} ${o} ${size} ${size}`, ICONS[name], `icon icon-${name}`);
  el.setAttribute('width', size);
  el.setAttribute('height', size);
  return el;
}

const GLYPH_SVG = {
  circle: '<circle cx="7" cy="7" r="6"/>',
  pill: '<rect x="0.5" y="3.5" width="13" height="7" rx="3.5"/>',
  square: '<rect x="1.5" y="1.5" width="11" height="11"/>',
  bar: '<rect x="0.5" y="5" width="13" height="4"/>',
  triangle: '<path d="M7 1l6.5 12H.5z"/>',
  ring: '<path d="M7 1a6 6 0 1 1 0 12A6 6 0 0 1 7 1zm0 3.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z" fill-rule="evenodd"/>',
  half: '<path d="M1 10a6 6 0 0 1 12 0z"/>',
  diamond: '<path d="M7 .5L13.5 7 7 13.5.5 7z"/>',
  inbox: '<path d="M1.5 1.5h11v11h-11zm2 2v7h7v-7z" fill-rule="evenodd"/>',
};

export const glyph = (name) => svg('0 0 14 14', `<g fill="currentColor">${GLYPH_SVG[name] ?? GLYPH_SVG.circle}</g>`, 'glyph');

/* ── перерисовка без потери фокуса ───────────────────────────────────── */

/**
 * Поле с data-key после перерисовки снова в фокусе, каретка на месте: можно
 * вводить подзадачи, шаги и сферы подряд, не тапая в поле каждый раз.
 */
export function keepFocus(render) {
  const a = document.activeElement;
  const key = a?.dataset?.key;
  let sel = null;
  if (key && typeof a.selectionStart === 'number') sel = [a.selectionStart, a.selectionEnd];
  render();
  if (!key) return;
  const n = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (!n || n === a) return;
  n.focus({ preventScroll: true });
  if (sel && n.value != null) {
    try {
      n.setSelectionRange(...sel);
    } catch {
      /* date и подобные поля каретки не имеют */
    }
  }
}

/* ── поле «добавить» ─────────────────────────────────────────────────── */

const drafts = new Map();

/** Одна строка ввода: Enter добавляет, поле очищается и остаётся в фокусе. */
export function entry(key, placeholder, onSubmit, { cls = '' } = {}) {
  const input = h('input', {
    class: 'entry-input', type: 'text', placeholder, 'aria-label': placeholder, autocomplete: 'off',
    'data-key': key, value: drafts.get(key) ?? '',
    oninput: (e) => drafts.set(key, e.target.value),
  });
  return h('form', {
    class: ['entry', cls],
    onsubmit: (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      drafts.delete(key);
      input.value = '';
      onSubmit(v);
    },
  }, icon('plus', 20), input);
}

/** textarea, растущая по тексту. */
export function autosize(el) {
  const fit = () => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  el.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return el;
}

/* ── тост ────────────────────────────────────────────────────────────── */

let toastEl;
let toastTimer;

export function toast(message) {
  toastEl ??= document.body.appendChild(h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }));
  toastEl.textContent = message;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2200);
}

/* ── шторка ──────────────────────────────────────────────────────────── */

let sheetRender = null;
let sheetRoot;

/** Шторка снизу. render() вызывается заново при каждой перерисовке приложения. */
export function openSheet(render) {
  sheetRender = render;
  renderSheet();
}

export function closeSheet() {
  sheetRender = null;
  renderSheet();
}

export function renderSheet() {
  sheetRoot ??= document.getElementById('sheet');
  if (!sheetRender) {
    sheetRoot.replaceChildren();
    sheetRoot.hidden = true;
    return;
  }
  sheetRoot.hidden = false;
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, sheetRender());
  sheetRoot.replaceChildren(
    h('div', { class: 'sheet-scrim', onclick: closeSheet }),
    panel,
  );
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetRender) closeSheet();
});

/* ── перетаскивание ──────────────────────────────────────────────────── */

/**
 * Порядок перетаскиванием. Тянуть можно за элемент с data-drag внутри
 * строки с data-id. Соседи расступаются на высоту строки, по отпусканию
 * onDrop получает id в новом порядке. Скролл страницы за ручку не цепляется
 * (touch-action: none в стилях).
 */
export function sortable(list, onDrop) {
  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-drag]');
    const item = handle?.closest('[data-id]');
    if (!item || item.parentElement !== list || e.button > 0) return;
    e.preventDefault();

    const items = [...list.children].filter((n) => n.dataset.id);
    const rects = items.map((n) => n.getBoundingClientRect());
    const from = items.indexOf(item);
    const gap = items.length > 1 ? rects[1].top - rects[0].bottom : 0;
    const shift = rects[from].height + gap;
    const startY = e.clientY;
    let to = from;

    item.classList.add('is-dragging');
    handle.setPointerCapture(e.pointerId);

    const move = (ev) => {
      const dy = ev.clientY - startY;
      item.style.transform = `translateY(${dy}px)`;
      const center = rects[from].top + rects[from].height / 2 + dy;
      to = items.filter((_, i) => i !== from && rects[i].top + rects[i].height / 2 < center).length;
      items.forEach((n, i) => {
        if (i === from) return;
        const s = i > from && i <= to ? -shift : i < from && i >= to ? shift : 0;
        n.style.transform = s ? `translateY(${s}px)` : '';
      });
    };

    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      items.forEach((n) => (n.style.transform = ''));
      item.classList.remove('is-dragging');
      if (to === from) return;
      const ids = items.map((n) => n.dataset.id);
      ids.splice(from, 1);
      ids.splice(to, 0, item.dataset.id);
      onDrop(ids);
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
  return list;
}

/* ── движение ────────────────────────────────────────────────────────── */

/** «Уменьшить движение» в системе — никаких анимаций из JS. */
export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Число досчитывает до значения за ~0,4 с. Только при входе на экран. */
export function countUp(el, to) {
  if (calm() || to <= 0 || to > 999) return;
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / 420);
    el.firstChild.nodeValue = String(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  el.firstChild.nodeValue = '0';
  requestAnimationFrame(step);
}

/**
 * FLIP: запомнить места элементов, изменить DOM, плавно довезти элементы
 * со старых мест на новые. Для композиции дня: сделанная задача уезжает влево.
 */
export function flip(els, change) {
  const before = new Map(els().map((el) => [el, el.getBoundingClientRect()]));
  change();
  if (calm()) return;
  for (const el of els()) {
    const a = before.get(el);
    if (!a) continue;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    const sy = b.height ? a.height / b.height : 1;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sy - 1) < 0.01) continue;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scaleY(${sy})` }, { transform: 'none' }],
      { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }
}

/**
 * Порядок плиток в сетке. Плитка едет за пальцем, соседи переставляются
 * в DOM, как только палец оказывается над ними. Тянуть — за data-drag.
 */
export function sortableGrid(grid, onDrop) {
  grid.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-drag]');
    const item = handle?.closest('[data-id]');
    if (!item || item.parentElement !== grid || e.button > 0) return;
    e.preventDefault();

    const tiles = () => [...grid.children].filter((n) => n.dataset.id);
    const startOrder = tiles().map((n) => n.dataset.id).join();
    const r0 = item.getBoundingClientRect();
    const grab = { x: e.clientX - r0.left, y: e.clientY - r0.top };

    item.classList.add('is-dragging');

    // попадание и сдвиг считаются по раскладке (offset*), а не по экрану:
    // соседи в это время едут анимацией, и их экранные рамки врут
    const move = (ev) => {
      const g = grid.getBoundingClientRect();
      const x = ev.clientX - g.left;
      const y = ev.clientY - g.top;
      const over = tiles().find((n) => n !== item
        && x > n.offsetLeft && x < n.offsetLeft + n.offsetWidth
        && y > n.offsetTop && y < n.offsetTop + n.offsetHeight);
      if (over) {
        const list = tiles();
        const others = () => list.filter((n) => n !== item);
        flip(others, () => grid.insertBefore(item, list.indexOf(over) > list.indexOf(item) ? over.nextSibling : over));
      }
      const tx = ev.clientX - grab.x - (g.left + item.offsetLeft);
      const ty = ev.clientY - grab.y - (g.top + item.offsetTop);
      item.style.transform = `translate(${tx}px, ${ty}px)`;
    };

    // слушаем окно, а не ручку: плитка переезжает в DOM, и захват указателя
    // при этом отпускается — события ручке больше не пришли бы
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      item.style.transform = '';
      item.classList.remove('is-dragging');
      const ids = tiles().map((n) => n.dataset.id);
      if (ids.join() !== startOrder) onDrop(ids);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });
  return grid;
}
