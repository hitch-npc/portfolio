/**
 * Песочница знака TBCS.
 *
 * Слева — то же поле, что в hero, справа — все его ручки по группам.
 * Дыхание, вдох-выдох и курсор решаем здесь, глядя на знак целиком,
 * а не в hero между прелоадером и прокруткой.
 *
 * Пресеты — готовые точки для сравнения: сайт сейчас, прежний вихрь
 * с дырой под курсором, спокойное и глубокое дыхание, стрелки до R1.
 * «Курсор по кругу» водит курсор сам: так видно лупу и линзу, не держа мышь.
 *
 * Главный счётчик — «кадр поля»: сколько миллисекунд знак тратит на кадр.
 * Бюджет — 4 мс на этой ширине (docs/03-prd.md). FPS упрётся в частоту
 * экрана раньше, чем покажет проблему.
 *
 * «Скопировать» кладёт в буфер только отличия от PARAMS — их и переносим
 * в src/field/glyph-field.js.
 *
 * Страница живёт только на dev-сервере (npm run lab:field): в сборку
 * (build.rollupOptions.input) она не входит.
 */
import '../styles/fonts.css';
import '../styles/fonts-fontshare.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/hero.css';
import '../styles/lab.css';
import '../styles/field-lab.css';
import { GlyphField, PARAMS } from '../field/glyph-field.js';
import { SHAPES } from '../field/shapes.js';

const $ = (sel, root = document) => root.querySelector(sel);

/* ─── ручки ─────────────────────────────────────────────────────── */

// rebuild — параметр входит в маску или в запечённые фазы ячеек,
// поэтому после него поле пересобирается целиком
const SLIDERS = [
  { group: 'Знак', key: 'fit', label: 'ширина знака', min: 0.4, max: 0.98, step: 0.01, rebuild: true },
  { group: 'Знак', key: 'tracking', label: 'разрядка', min: -0.1, max: 0.3, step: 0.005, rebuild: true },
  { group: 'Знак', key: 'rowsPerCap', label: 'рядов в букве', min: 8, max: 40, step: 1, rebuild: true },
  { group: 'Знак', key: 'blurRatio', label: 'мягкость края', min: 0, max: 1.2, step: 0.02, rebuild: true },
  { group: 'Фигура', key: 'sizeMin', label: 'размер на краю', min: 0, max: 1, step: 0.01 },
  { group: 'Фигура', key: 'sizeMax', label: 'размер в букве', min: 0.3, max: 2, step: 0.01 },
  { group: 'Фигура', key: 'base', label: 'основание', min: 0.2, max: 1.2, step: 0.01, only: 'triangle' },
  { group: 'Фигура', key: 'headRatio', label: 'наконечник', min: 0, max: 0.6, step: 0.01, only: 'arrow' },
  { group: 'Фигура', key: 'weight', label: 'толщина линии', min: 0.5, max: 4, step: 0.05, unit: 'px', only: 'arrow' },
  { group: 'Фигура', key: 'ghost', label: 'фон', min: 0, max: 0.3, step: 0.005 },
  { group: 'Поток', key: 'flowScale', label: 'масштаб волн', min: 0.5, max: 8, step: 0.1, rebuild: true },
  { group: 'Поток', key: 'flowSpeed', label: 'скорость', min: 0, max: 1.5, step: 0.01 },
  { group: 'Дыхание инверсии', key: 'breathe', label: 'глубина', min: 0, max: 1, step: 0.02 },
  { group: 'Дыхание инверсии', key: 'breatheScale', label: 'масштаб пятен', min: 0.4, max: 5, step: 0.05, rebuild: true },
  { group: 'Дыхание инверсии', key: 'breatheSpeed', label: 'скорость', min: 0, max: 0.6, step: 0.005 },
  { group: 'Вдох-выдох', key: 'pulse', label: 'глубина', min: 0, max: 0.6, step: 0.01 },
  { group: 'Вдох-выдох', key: 'pulseScale', label: 'длина волны', min: 0.2, max: 5, step: 0.05, rebuild: true },
  { group: 'Вдох-выдох', key: 'pulseSpeed', label: 'темп', min: 0, max: 3, step: 0.05, unit: 'рад/с' },
  { group: 'Курсор', key: 'mouseRadius', label: 'радиус', min: 60, max: 700, step: 10, unit: 'px' },
  { group: 'Курсор', key: 'swirl', label: 'вихрь', min: 0, max: 1, step: 0.02 },
  { group: 'Курсор', key: 'magnify', label: 'лупа', min: 0, max: 1.5, step: 0.01 },
  { group: 'Курсор', key: 'push', label: 'расталкивание (дыра)', min: 0, max: 120, step: 1, unit: 'px' },
  { group: 'Курсор', key: 'ease', label: 'отклик', min: 0.02, max: 0.5, step: 0.01 },
  { group: 'Линза инверсии', key: 'invert', label: 'глубина', min: 0, max: 1, step: 0.02 },
  { group: 'Линза инверсии', key: 'invertRadius', label: 'радиус', min: 40, max: 600, step: 10, unit: 'px' },
];

const PRESETS = {
  site: { label: 'сайт сейчас', values: {} },
  hole: {
    label: 'до: вихрь с дырой',
    values: { push: 51, magnify: 0, pulse: 0, breathe: 0.82, breatheScale: 1.9, breatheSpeed: 0.09 },
  },
  calm: {
    label: 'спокойнее',
    values: { pulse: 0.1, pulseSpeed: 0.4, breathe: 0.6, breatheSpeed: 0.08 },
  },
  deep: {
    label: 'глубокое дыхание',
    values: { pulse: 0.35, pulseSpeed: 0.95, breathe: 1, breatheScale: 2.8, breatheSpeed: 0.22 },
  },
  nolens: { label: 'без линзы инверсии', values: { invert: 0 } },
  arrows: { label: 'стрелки, до R1', values: { shape: 'arrow', push: 51, magnify: 0, pulse: 0 } },
};

/** Значения по умолчанию для фигуры: общие PARAMS плюс её размеры. */
const defaultsFor = (shape) => ({ ...PARAMS, ...SHAPES[shape].params, shape });

let field = null;
const sync = new Map(); // ключ → обновить ползунок после пресета

/* ─── сцена ─────────────────────────────────────────────────────── */

async function mountField() {
  try {
    await document.fonts.load('800 100px Archivo');
    await document.fonts.ready;
  } catch {
    /* шрифт не приехал — маска соберётся из системного гротеска */
  }

  const canvas = $('[data-field]');
  const idea = $('[data-idea]');
  canvas.addEventListener('markbox', (e) => {
    const box = e.detail;
    idea.style.left = `${box.left}px`;
    idea.style.top = `${box.top + box.height + box.cap * 0.2}px`;
    idea.textContent = `${box.count.toLocaleString('en-US').replace(/,/g, ' ')} triangles. One system.`;
  });

  field = new GlyphField(canvas);
  field.resize();
  field.start();
  window.__field = field;
  addEventListener('resize', () => field.resize());
}

/** Ставит пресет: всё к умолчаниям фигуры, поверх — значения пресета. */
function applyPreset(name) {
  const { values } = PRESETS[name];
  const shape = values.shape || PARAMS.shape;
  Object.assign(field.p, defaultsFor(shape), values);
  field.resize();
  for (const [key, set] of sync) set(field.p[key]);
}

/** Только то, что отличается от умолчаний: это и переносится в код. */
function diff() {
  const base = defaultsFor(field.p.shape);
  const out = {};
  for (const { key } of SLIDERS) {
    if (!(key in field.p)) continue;
    if (Math.abs(field.p[key] - base[key]) > 1e-9) out[key] = field.p[key];
  }
  if (field.p.shape !== PARAMS.shape) out.shape = field.p.shape;
  return out;
}

/* ─── счётчики ──────────────────────────────────────────────────── */

function mountStats(box) {
  const cell = (name) => {
    const d = document.createElement('div');
    d.className = 'lab__stat';
    d.innerHTML = `<span>${name}</span><span data-v>—</span>`;
    box.append(d);
    return d;
  };
  const cost = cell('кадр поля');
  const worst = cell('худший кадр');
  const fps = cell('FPS');
  const shapes = cell('фигур');

  // цена кадра поля меряется вокруг самой отрисовки, без остального кадра
  const draw = field._draw.bind(field);
  let spent = 0;
  let drawn = 0;
  field._draw = (dt) => {
    const t0 = performance.now();
    draw(dt);
    spent += performance.now() - t0;
    drawn += 1;
  };

  let frames = 0;
  let acc = 0;
  let peak = 0;
  let peakAge = 0;
  let last = 0;
  const tick = (now) => {
    requestAnimationFrame(tick);
    if (!last) { last = now; return; }
    const ms = now - last;
    last = now;
    frames += 1;
    acc += ms;
    if (ms > peak) { peak = ms; peakAge = now; }
    if (now - peakAge > 2000) peak = ms;

    if (acc >= 400) {
      const avg = drawn ? spent / drawn : 0;
      cost.querySelector('[data-v]').textContent = `${avg.toFixed(2)} мс`;
      cost.dataset.warn = avg > 4 ? '1' : '0';
      worst.querySelector('[data-v]').textContent = `${peak.toFixed(1)} мс`;
      worst.dataset.warn = peak > 20 ? '1' : '0';
      fps.querySelector('[data-v]').textContent = Math.round((frames / acc) * 1000);
      shapes.querySelector('[data-v]').textContent = field.n.toLocaleString('ru-RU');
      frames = 0;
      acc = 0;
      spent = 0;
      drawn = 0;
    }
  };
  requestAnimationFrame(tick);
}

/* ─── курсор по кругу ───────────────────────────────────────────── */

let orbit = false;
function runOrbit() {
  const loop = (now) => {
    if (!orbit) return;
    requestAnimationFrame(loop);
    const box = field.markBox;
    if (!box) return;
    const a = now / 2600;
    field.mouse.inside = true;
    field.mouse.tx = box.left + box.width / 2 + Math.cos(a) * box.width * 0.34;
    field.mouse.ty = box.top + box.height / 2 + Math.sin(a) * box.height * 0.5;
  };
  requestAnimationFrame(loop);
}

/* ─── пульт ─────────────────────────────────────────────────────── */

function row(parent, label) {
  const r = document.createElement('div');
  r.className = 'lab__row';
  const l = document.createElement('label');
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'lab__val';
  r.append(l, v);
  parent.append(r);
  return { r, l, v };
}

function group(panel, name) {
  const g = document.createElement('div');
  g.className = 'lab__group';
  g.innerHTML = `<div class="lab__legend">${name}</div>`;
  panel.append(g);
  return g;
}

function check(parent, label, onChange) {
  const c = document.createElement('label');
  c.className = 'lab__check';
  c.innerHTML = `<input type="checkbox"><span>${label}</span>`;
  parent.append(c);
  c.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked));
}

function mountPanel() {
  const panel = $('[data-panel]');

  const head = document.createElement('div');
  head.innerHTML = '<h1 class="lab__title">Знак TBCS · песочница</h1>'
    + '<p class="lab__hint">Крути ручки, сравнивай с пресетами. Главный счётчик — '
    + '«кадр поля»: бюджет 4 мс. «Скопировать» отдаёт только отличия от сайта.</p>';
  panel.append(head);

  const stats = document.createElement('div');
  stats.className = 'lab__stats';
  panel.append(stats);
  mountStats(stats);

  // пресеты
  const presets = group(panel, 'Пресеты');
  const grid = document.createElement('div');
  grid.className = 'field-lab__presets';
  presets.append(grid);
  const buttons = [];
  for (const [name, preset] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lab__btn';
    b.textContent = preset.label;
    b.setAttribute('aria-pressed', String(name === 'site'));
    b.addEventListener('click', () => {
      applyPreset(name);
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
    });
    buttons.push(b);
    grid.append(b);
  }
  // ручную правку пресет уже не описывает — подсветку снимаем
  const unpress = () => { for (const b of buttons) b.setAttribute('aria-pressed', 'false'); };

  // режим
  const modes = group(panel, 'Режим');
  const shapeRow = row(modes, 'фигура');
  const shape = document.createElement('select');
  shape.innerHTML = Object.keys(SHAPES).map((k) => `<option value="${k}">${k}</option>`).join('');
  shape.value = field.p.shape;
  shapeRow.r.append(shape);
  shapeRow.v.remove();
  shape.addEventListener('change', () => {
    field.setShape(shape.value);
    for (const [key, set] of sync) set(field.p[key]);
    unpress();
  });
  sync.set('shape', (v) => { shape.value = v; });

  check(modes, 'курсор по кругу', (on) => {
    orbit = on;
    if (on) runOrbit();
    else field.mouse.inside = false;
  });
  check(modes, 'пауза', (on) => { field.paused = on; });

  // ползунки по группам
  let current = null;
  let currentName = '';
  for (const s of SLIDERS) {
    if (s.group !== currentName) {
      currentName = s.group;
      current = group(panel, currentName);
    }
    const { r, v } = row(current, s.label);
    const input = document.createElement('input');
    input.type = 'range';
    Object.assign(input, { min: s.min, max: s.max, step: s.step });
    r.append(input);

    const show = (val) => {
      // у стрелки нет основания, у треугольника — наконечника и толщины линии
      const missing = val === undefined || (s.only && s.only !== field.p.shape);
      r.hidden = missing;
      if (missing) return;
      input.value = String(val);
      v.textContent = `${val}${s.unit ? ` ${s.unit}` : ''}`;
    };
    show(field.p[s.key]);
    sync.set(s.key, show);

    input.addEventListener('input', () => {
      const val = Number(input.value);
      field.p[s.key] = val;
      show(val);
      if (s.rebuild) field.resize();
      unpress();
    });
  }

  // выгрузка
  const out = group(panel, 'Выгрузка');
  const btns = document.createElement('div');
  btns.className = 'lab__btns';
  out.append(btns);
  const pre = document.createElement('pre');
  pre.className = 'lab__out';
  pre.textContent = '{}';
  out.append(pre);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'lab__btn';
  copy.textContent = 'скопировать отличия';
  copy.addEventListener('click', () => {
    const json = JSON.stringify(diff(), null, 2);
    pre.textContent = json;
    navigator.clipboard?.writeText(json);
    copy.textContent = 'скопировано';
    setTimeout(() => { copy.textContent = 'скопировать отличия'; }, 1200);
  });

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'lab__btn';
  reset.textContent = 'как на сайте';
  reset.addEventListener('click', () => {
    applyPreset('site');
    for (const b of buttons) b.setAttribute('aria-pressed', String(b === buttons[0]));
    pre.textContent = '{}';
  });

  btns.append(copy, reset);
}

mountField().then(mountPanel);
