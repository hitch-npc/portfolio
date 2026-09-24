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

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  today: '<circle cx="12" cy="12" r="6.5" fill="currentColor"/>',
  plan: '<path d="M14.5 3.5a8.5 8.5 0 1 0 6 13.2A7 7 0 0 1 14.5 3.5z" fill="currentColor"/>',
  spheres:
    '<circle cx="7" cy="7" r="3.5" fill="currentColor"/><rect x="13" y="4.5" width="8" height="5" rx="2.5" fill="currentColor"/>' +
    '<rect x="3.5" y="13.5" width="7" height="7" fill="currentColor"/><rect x="13" y="15.5" width="8" height="3" fill="currentColor"/>',
  goals: `<circle cx="12" cy="12" r="8" ${STROKE}/><circle cx="12" cy="12" r="3" fill="currentColor"/>`,
  brief: '<rect x="4" y="5" width="16" height="2.5" fill="currentColor"/><rect x="4" y="10.75" width="16" height="2.5" fill="currentColor"/><rect x="4" y="16.5" width="10" height="2.5" fill="currentColor"/>',
  settings:
    `<path d="M4 8h9M17 8h3M4 16h3M11 16h9" ${STROKE}/><circle cx="15" cy="8" r="2" ${STROKE}/><circle cx="9" cy="16" r="2" ${STROKE}/>`,
  plus: `<path d="M12 5v14M5 12h14" ${STROKE}/>`,
  check: `<path d="M6 12.5l4 4 8-9" ${STROKE} stroke-width="2.5"/>`,
  close: `<path d="M7 7l10 10M17 7L7 17" ${STROKE}/>`,
  back: `<path d="M14.5 5.5L8 12l6.5 6.5" ${STROKE}/>`,
  more: '<circle cx="6" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="18" cy="12" r="1.8" fill="currentColor"/>',
  drag: `<path d="M6 9h12M6 15h12" ${STROKE}/>`,
  copy: `<rect x="8.5" y="8.5" width="11" height="11" rx="2" ${STROKE}/><path d="M15.5 5.5v-.5a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 5v8A1.5 1.5 0 0 0 6 14.5h.5" ${STROKE}/>`,
  download: `<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" ${STROKE}/>`,
  upload: `<path d="M12 16V5M7 9.5l5-5 5 5M5 19.5h14" ${STROKE}/>`,
  chevron: `<path d="M9.5 5.5L16 12l-6.5 6.5" ${STROKE}/>`,
};

export const icon = (name) => svg('0 0 24 24', ICONS[name], `icon icon-${name}`);

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
  }, icon('plus'), input);
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
