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

const S = 'fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';
const loop = 'repeatCount="indefinite"';
const ease = 'calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"';

/*
 * Иконки разделов — линия 1,2 px, кольца и оси; где линии встречаются,
 * стык «слипается» каплей (фильтр goo: лёгкое размытие + порог по альфе).
 * Движение — SMIL, без JS: эллипс кувыркается вокруг кольца, кольца Луны
 * расходятся и сходятся, к центру прицела сходятся круги, в брифе
 * прописываются строки, шестерёнка крутится, по лучам солнца бежит свет.
 *
 * Базовые атрибуты — поза покоя: без элементов анимации иконка неподвижна
 * и закончена (так рисуются неоткрытые вкладки и «Уменьшить движение»).
 * __ID__ — место для уникального id фильтра: иконок на странице несколько.
 */
const GOO = `<defs><filter id="__ID__" x="-20%" y="-20%" width="140%" height="140%">
  <feGaussianBlur stdDeviation=".55"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -6.5"/></filter></defs>`;
const G = `filter="url(#__ID__)" ${S}`;

// солнце: лучи начинаются прямо от кольца — стык слипается. По кругу бежит
// не яркость (фильтр goo срезал бы полупрозрачное), а длина: луч вытягивается
const sunRays = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  const p = (r) => `${(12 + r * Math.sin(a)).toFixed(2)} ${(12 - r * Math.cos(a)).toFixed(2)}`;
  const ray = (len) => `M${p(4)}L${p(len)}`;
  return `<path d="${ray(8)}"><animate attributeName="d" dur="1.6s" begin="${(-i * 0.2).toFixed(1)}s" ${loop} values="${ray(10)};${ray(6.5)};${ray(6.5)}" keyTimes="0;.35;1"/></path>`;
}).join('');

// зубцы шестерёнки: короткие риски наружу от кольца, стык слипается
const gearTeeth = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const p = (r) => `${(12 + r * Math.sin(a)).toFixed(2)} ${(12 - r * Math.cos(a)).toFixed(2)}`;
  return `M${p(6.8)}L${p(8.6)}`;
}).join('');

const LIVE = {
  // сегодня — солнце: кольцо и лучи от него, по лучам бежит свет
  today: `${GOO}<g ${G}><circle cx="12" cy="12" r="4"/>${sunRays}</g>`,
  // план — Луна: два кольца, одно проходит по другому — сменяются фазы
  plan: `${GOO}<g ${G}><circle cx="9" cy="12" r="6.5"/>
    <circle cx="13" cy="12" r="6.5"><animate attributeName="cx" dur="5s" ${loop} values="12.5;15.5;12.5" keyTimes="0;.5;1" ${ease}/></circle></g>`,
  // сферы — гироскоп: кольцо и эллипс, который кувыркается вокруг него
  spheres: `${GOO}<g ${G}><circle cx="12" cy="12" r="7.5"/>
    <g transform="rotate(-10 12 12)"><ellipse cx="12" cy="12" rx="0.4" ry="10.5"><animate attributeName="rx" dur="5s" ${loop} values="0.4;7;2;7.5;0.4" keyTimes="0;.3;.5;.75;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1"/></ellipse>
      <animateTransform attributeName="transform" type="rotate" dur="5s" ${loop} values="-10 12 12;40 12 12;100 12 12;150 12 12;170 12 12" keyTimes="0;.3;.5;.75;1"/></g></g>`,
  // цели — прицел: кольцо, оси насквозь, к центру сходятся круги
  goals: `${GOO}<g ${G}><circle cx="12" cy="12" r="7"/><path d="M12 1.5v21M1.5 12h21"/>
    ${[0, -1.2].map((b) => `<circle cx="12" cy="12" r="${b ? 3.9 : 7}"><animate attributeName="r" dur="2.4s" begin="${b}s" ${loop} values="7;0.6"/></circle>`).join('')}</g>`,
  // бриф — ось и строки, которые прописываются от оси
  brief: `${GOO}<g ${G}><path d="M6 3v18"/>
    ${[[7, 12, '0.001;.25'], [12, 8, '.15;.4'], [17, 10, '.3;.55']].map(([y, w, k]) => {
      const [k1, k2] = k.split(';');
      return `<path d="M6 ${y}h${w}" stroke-dasharray="${w}" stroke-dashoffset="0"><animate attributeName="stroke-dashoffset" dur="3.2s" ${loop} values="${w};${w};0;0;${w}" keyTimes="0;${k1};${k2};.85;1"/></path>`;
    }).join('')}</g>`,
  // настройки — шестерёнка: кольцо, двенадцать мелких зубцов по краю, втулка; медленно вращается
  settings: `${GOO}<g ${G}><g>
    <circle cx="12" cy="12" r="6.8"/><circle cx="12" cy="12" r="2.6"/>
    <path d="${gearTeeth}"/>
    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="16s" ${loop}/></g></g>`,
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
  // в движении кольца и эллипс подходят к краю поля — ничего не срезаем
  el.setAttribute('overflow', 'visible');
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
  send: `<path d="M12 19V5M6 11l6-6 6 6" ${S}/>`,
  calendar: `<rect x="4" y="5" width="16" height="15" rx="3" ${S}/><path d="M4 10h16M8 3v4M16 3v4" ${S}/><g ${F}><circle cx="8.5" cy="14" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="15.5" cy="14" r="1"/><circle cx="8.5" cy="17" r="1"/><circle cx="12" cy="17" r="1"/></g>`,
  clock: `<circle cx="12" cy="12" r="8" ${S}/><path d="M12 7v5l3 2" ${S}/>`,
  repeat: `<path d="M5 11V9a3 3 0 0 1 3-3h11M16 3l3 3-3 3M19 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3" ${S}/>`,
  flag: `<path d="M6 21V4M6 5h11l-2.5 4L17 13H6" ${S}/>`,
  next: `<rect x="4" y="4" width="16" height="16" rx="3" ${S}/><path d="M8 12h8M13 9l3 3-3 3" ${S}/>`,
  clip: `<path d="M16.5 11.5l-5.8 5.8a3.5 3.5 0 0 1-5-5l6.9-6.9a2.3 2.3 0 0 1 3.3 3.3l-6.6 6.6a1.1 1.1 0 0 1-1.6-1.6l5.6-5.6" ${S}/>`,
  file: `<path d="M7 3h7l4 4v14H7z" ${S}/><path d="M14 3v4h4" ${S}/>`,
  search: `<circle cx="11" cy="11" r="6" ${S}/><path d="M15.5 15.5L20 20" ${S}/>`,
  share: `<path d="M12 15V4M8 8l4-4 4 4M7 11H5v9h14v-9h-2" ${S}/>`,
  updown: `<path d="M8 10l4-4 4 4M8 14l4 4 4-4" ${S}/>`,
  minus: `<path d="M5 12h14" ${S}/>`,
  bell: `<path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15z" ${S}/><path d="M10 21.5h4" ${S}/>`,
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
let panel = null; // сама шторка: живёт, пока открыта, перерисовывается только содержимое
let closing = 0; // таймер ухода вниз
let closedNow = false; // закрыта в этом же обработчике — следующая шторка сменит содержимое на месте

const SHEET_OUT = 280; // мс, как .sheet-layer.is-closing в стилях
let returnKey = null; // data-key поля, где печатали до шторки

/** Фокус в поле, каретка — в конец: Safari иначе ставит её в начало. */
export function focusEnd(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  const n = el.value?.length;
  if (n == null) return;
  try {
    el.setSelectionRange(n, n);
  } catch {
    /* у date и подобных полей каретки нет */
  }
}

/**
 * Шторка поверх клавиатуры не видна: клавиатура наезжает на низ экрана.
 * Поэтому при открытии поле, где печатали, отпускает фокус (клавиатура
 * прячется), а при закрытии получает его обратно.
 */
function hideKeyboard() {
  const a = document.activeElement;
  if (!a || sheetRoot.contains(a) || !a.matches('input, textarea, select, [contenteditable="true"]')) return;
  returnKey = a.dataset.key ?? null;
  a.blur();
}

/**
 * Шторка снизу. render() вызывается заново при каждой перерисовке приложения.
 * Выезжает один раз при открытии: тапы внутри меняют содержимое, а не
 * запускают появление заново; уходит вниз при закрытии.
 */
export function openSheet(render) {
  sheetRoot ??= document.getElementById('sheet');
  if (closing) {
    clearTimeout(closing);
    closing = 0;
    sheetRoot.classList.remove('is-closing');
    // закрыли и тут же открыли другую (дата → Календарь) — шторка остаётся,
    // меняется содержимое; открыли позже — прошлая уже ушла
    if (!closedNow) finishClose();
  }
  // Дата → Календарь: закрытие уже вернуло фокус в поле — снова прячем
  if (!panel || closedNow) hideKeyboard();
  const swap = Boolean(panel);
  sheetRender = render;
  renderSheet();
  if (swap) panel.scrollTop = 0;
  if (swap && !calm()) {
    panel.classList.remove('is-swapping');
    void panel.offsetWidth; // перезапуск анимации содержимого
    panel.classList.add('is-swapping');
  }
}

/**
 * Закрыть шторку. Поле, где печатали до неё, снова в фокусе — клавиатура
 * возвращается. restore = false — при переходе на другой экран.
 */
export function closeSheet(restore = true) {
  if (!sheetRender) return;
  sheetRender = null;
  const key = returnKey;
  returnKey = null;
  if (calm()) {
    finishClose();
  } else {
    sheetRoot.classList.add('is-closing');
    closing = setTimeout(finishClose, SHEET_OUT);
    closedNow = true;
    queueMicrotask(() => {
      closedNow = false;
    });
  }
  if (restore && key) focusEnd(document.querySelector(`[data-key="${CSS.escape(key)}"]`));
}

function finishClose() {
  clearTimeout(closing);
  closing = 0;
  panel = null;
  sheetRoot.classList.remove('is-closing');
  sheetRoot.replaceChildren();
  sheetRoot.hidden = true;
}

/** Перерисовать шторку (свой черновик у шторки даты, Календаря и т. п.). */
export const renderSheet = () => settlePress(drawSheet);

function drawSheet() {
  sheetRoot ??= document.getElementById('sheet');
  if (!sheetRender) {
    if (!closing && panel) finishClose();
    return;
  }
  if (panel) {
    panel.classList.remove('is-swapping'); // проявление — один раз, не на каждый тап
    panel.replaceChildren();
    append(panel, [sheetRender()]);
    return;
  }
  sheetRoot.hidden = false;
  panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, sheetRender());
  sheetRoot.replaceChildren(
    h('div', { class: 'sheet-scrim', onclick: closeSheet }),
    panel,
  );
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetRender) closeSheet();
});

// Клавиатура iOS не сжимает страницу, а наезжает на неё. Слой шторки держится
// видимой части экрана (--vv-top, --vv-h), и поле в шторке остаётся над клавиатурой
const vv = window.visualViewport;
if (vv) {
  const fit = () => {
    const st = document.documentElement.style;
    st.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    st.setProperty('--vv-h', `${Math.round(vv.height)}px`);
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  fit();
}

/* ── нажатие ─────────────────────────────────────────────────────────── */

// iOS включает :active (кнопка проседает под пальцем), только если страница слушает касания
document.addEventListener('touchstart', () => {}, { passive: true });

const PRESSABLE = '.pill, .chip, .icon-btn, .check, .pick, .replace, .glyph-pick, .compose-chip, .compose-send, .quick-pick, .bump, .switch';
const RELEASE_MS = 500;
let pressed = null; // { el, at, from, start }
let settling = 0; // вложенный вызов (шторка внутри перерисовки экрана) — только рисует

document.addEventListener('pointerdown', (e) => {
  const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
  pressed = el && { el, at: performance.now() };
}, { capture: true, passive: true });
document.addEventListener('pointercancel', () => {
  pressed = null;
}, { capture: true, passive: true });

/** Место узла: номера детей от #main или #sheet — они не перерисовываются. */
function pathOf(el) {
  const path = [];
  while (el.parentElement && el.id !== 'main' && el.id !== 'sheet') {
    path.unshift(Array.prototype.indexOf.call(el.parentElement.children, el));
    el = el.parentElement;
  }
  return el.id === 'main' || el.id === 'sheet' ? { root: el, path } : null;
}

/** Та же кнопка: вид, задача и надпись совпадают (номер в кружке может смениться). */
const keyOf = (el) => [
  el.tagName, el.classList[0], el.closest('[data-id]')?.dataset.id,
  el.querySelector('.task-title')?.textContent ?? el.getAttribute('aria-label') ?? el.textContent,
].join('|');

/**
 * Тап перерисовывает экран, и нажатая кнопка — уже новый узел: без этого она
 * рывком вставала бы в полный размер и мгновенно меняла цвет. Здесь отпускание
 * доигрывается на новой кнопке: мягкий возврат из нажатия, цвет перетекает,
 * у переключателя едет бегунок.
 */
export function settlePress(render) {
  if (settling) {
    render();
    return;
  }
  const p = pressed;
  const live = p && p.el.isConnected && performance.now() - p.at < 1500 && !calm();
  const where = live ? pathOf(p.el) : null;
  if (where && !p.from) {
    const cs = getComputedStyle(p.el);
    const knob = p.el.querySelector('.switch-knob');
    p.from = { key: keyOf(p.el), bg: cs.backgroundColor, color: cs.color, knob: knob && getComputedStyle(knob).transform };
  }
  settling += 1;
  try {
    render();
  } finally {
    settling -= 1;
  }
  if (!where || p.el.isConnected) return;
  let n = where.root;
  for (const i of where.path) n = n?.children[i];
  if (!n || keyOf(n) !== p.from.key) {
    // рядом появилось или пропало что-то (время перед переключателем) — ищем
    // ту же кнопку по надписи, если она такая одна
    const same = [...where.root.querySelectorAll(PRESSABLE)].filter((el) => keyOf(el) === p.from.key);
    if (same.length !== 1) return;
    [n] = same;
  }
  p.el = n; // вторая перерисовка в том же тапе найдёт уже эту кнопку
  p.start ??= performance.now();
  const t = performance.now() - p.start;
  if (t >= RELEASE_MS) return;
  const cs = getComputedStyle(n);
  const play = (el, frames, ms, easing) => {
    el.animate(frames, { duration: ms, easing }).currentTime = Math.min(t, ms);
  };
  play(n, [{ transform: 'scale(0.95)' }, { transform: 'none' }], RELEASE_MS, 'cubic-bezier(0.34, 1.3, 0.64, 1)');
  if (p.from.bg !== cs.backgroundColor || p.from.color !== cs.color) {
    play(n, [{ backgroundColor: p.from.bg, color: p.from.color }, { backgroundColor: cs.backgroundColor, color: cs.color }], 260, 'ease');
  }
  const knob = n.querySelector('.switch-knob');
  if (knob && p.from.knob) {
    play(knob, [{ transform: p.from.knob }, { transform: getComputedStyle(knob).transform }], 380, 'cubic-bezier(0.34, 1.3, 0.64, 1)');
  }
}

/* ── смахивание ──────────────────────────────────────────────────────── */

const SWIPE_W = 88; // на сколько уезжает строка — ширина кнопки и зазор
let swiped = null; // открытая строка
let blockClick = 0; // до этого момента тап не срабатывает: палец смахивал, а не нажимал

document.addEventListener('click', (e) => {
  if (performance.now() < blockClick) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

// тап мимо открытой строки только закрывает её — как в Почте
document.addEventListener('pointerdown', (e) => {
  if (swiped && !swiped.contains(e.target)) {
    shut();
    blockClick = performance.now() + 450;
  }
}, true);

function paint(row, x) {
  row.querySelector('.swipe-body').style.transform = x ? `translateX(${x}px)` : '';
  row.style.setProperty('--reveal', String(Math.min(1, Math.max(0, -x / SWIPE_W))));
}

function settle(row, open) {
  row.classList.remove('is-dragging');
  paint(row, open ? -SWIPE_W : 0);
  if (open) swiped = row;
  else if (swiped === row) swiped = null;
}

function shut() {
  if (swiped?.isConnected) settle(swiped, false);
  swiped = null;
}

/**
 * Смахивание влево открывает кнопку под строкой ([data-swipe] с .swipe-body
 * и .swipe-action внутри). Прокрутке не мешает: вертикальное движение
 * отдаётся странице (touch-action: pan-y в стилях).
 */
export function swipeable(list) {
  list.addEventListener('focusin', (e) => {
    // с клавиатуры кнопку не смахнуть — фокус на ней открывает строку
    if (e.target.matches('.swipe-action')) settle(e.target.closest('[data-swipe]'), true);
  });
  list.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('[data-swipe]');
    if (!row || e.button > 0 || e.target.closest('.swipe-action')) return;
    const base = swiped === row ? -SWIPE_W : 0;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let x = base;
    let mode = null; // 'x' — смахивание, 'y' — прокрутка
    let last = { x: x0, t: e.timeStamp };
    let v = 0;
    const move = (ev) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!mode) {
        if (Math.hypot(dx, dy) < 8) return;
        mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
        if (mode === 'y') {
          stop();
          return;
        }
        row.classList.add('is-dragging');
      }
      x = base + dx;
      if (x > 0) x /= 5; // вправо открывать нечего — только упругость
      if (x < -SWIPE_W) x = -SWIPE_W + (x + SWIPE_W) / 3;
      v = (ev.clientX - last.x) / Math.max(1, ev.timeStamp - last.t);
      last = { x: ev.clientX, t: ev.timeStamp };
      paint(row, x);
    };
    const up = () => {
      stop();
      if (mode === 'x') {
        blockClick = performance.now() + 400;
        // бросок решает быстрее, чем положение
        settle(row, v < -0.3 || (v <= 0.3 && x < -SWIPE_W / 2));
      } else if (!mode && swiped === row) {
        blockClick = performance.now() + 400; // тап по открытой строке закрывает её
        settle(row, false);
      }
    };
    const cancel = () => {
      stop();
      if (mode === 'x') settle(row, x < -SWIPE_W / 2);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  });
  return list;
}

/** Строка уходит влево и схлопывается, потом done() удаляет её из данных. */
export function removeRow(row, done) {
  swiped = null;
  if (calm()) {
    done();
    return;
  }
  row.style.height = `${row.offsetHeight}px`;
  row.classList.add('is-removing');
  requestAnimationFrame(() => {
    row.style.height = '0px';
  });
  setTimeout(done, 280);
}

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

/** «Уменьшить движение» в системе или в настройках — никаких анимаций из JS. */
export const calm = () =>
  document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;

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
