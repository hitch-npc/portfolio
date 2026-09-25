/**
 * Лаборатория вибрации — ЭКСПЕРИМЕНТ, экран #/lab (вход — Settings →
 * Experiments). Вопрос: даст ли iPhone системный щелчок на каждом шаге
 * степпера за один непрерывный жест, если палец лежит на настоящем
 * <input type="checkbox" switch>.
 *
 * Вибрацию отсюда не вызываем ничем: ни click(), ни checked = …, ни
 * dispatchEvent, ни navigator.vibrate, ни звуком. Только смотрим, что делает
 * сам WebKit, и пишем всё в лог (localStorage — переживает перезапуск).
 *
 * Режимы (где лежит переключатель):
 *   A — родного размера, едет за пальцем: всё время прямо под ним;
 *   B — растянут прозрачным на всю дорожку;
 *   C — родного размера, стоит в центре;
 *   D — переключателя нет (контроль);
 *   E — как A, но на каждом шаге прыгает вбок, и палец оказывается на
 *       другой его половине: вдруг WebKit сам «перещёлкнет» его под пальцем.
 *
 * Выключить — IOS_HAPTIC_EXPERIMENT = false: пропадут экран и вход в
 * Settings. Степперы приложения (крутилки целей, −/+) отсюда не зависят.
 */
import { h, copyText, toast } from '../ui.js';
import { backLink, header } from './common.js';

export const IOS_HAPTIC_EXPERIMENT = true;

const LOG_KEY = 'tracker-haptic-lab-log';
const OPTS_KEY = 'tracker-haptic-lab-opts';
const LOG_MAX = 800; // строк хранится
const LOG_SHOWN = 300; // строк на экране
const MIN = 0;
const MAX = 100;
const START = 50;
const STEP_PX = 12; // шаг значения — 12 точек пути пальца
const JUMP_PX = 13; // E: прыжок вбок — четверть ширины переключателя

const MODES = {
  A: 'Put your finger on the dashed circle and drag. The switch rides along, always right under your finger.',
  B: 'Put your finger anywhere on the track and drag. The whole track is one transparent switch.',
  C: 'Put your finger on the dashed circle and drag. The switch stays in the centre at its normal size.',
  D: 'Put your finger anywhere on the track and drag. No switch here — the control: expect no ticks.',
  E: 'Put your finger on the dashed circle and drag. On every step the switch jumps sideways under your finger.',
};

/* ── хранение ────────────────────────────────────────────────────────── */

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // хранилище недоступно — лог живёт до перезагрузки
  }
}

const saved = read(OPTS_KEY, {});
const opts = {
  mode: MODES[saved.mode] ? saved.mode : 'A',
  axis: saved.axis === 'h' ? 'h' : 'v',
  show: saved.show === true,
};

let lines = read(LOG_KEY, []);
if (!Array.isArray(lines)) lines = [];

/* ── лог ─────────────────────────────────────────────────────────────── */

const clock = () => {
  const d = new Date();
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};
const px = (n) => Math.round(n * 10) / 10;
const who = (el) => (el instanceof Element
  ? `${el.tagName}${el.id ? `#${el.id}` : ''}${el.classList[0] ? `.${el.classList[0]}` : ''}`
  : String(el));
const modeTag = () => `${opts.mode}/${opts.axis === 'v' ? 'vertical' : 'horizontal'}${opts.show ? '/visible' : ''}`;

let dirty = false;

function log(text) {
  lines.unshift(`[${clock()}] ${opts.mode}: ${text}`);
  if (lines.length > LOG_MAX) lines.length = LOG_MAX;
  if (!dirty) {
    dirty = true;
    requestAnimationFrame(flush);
  }
}

// лог пишется раз в кадр, а не на каждое событие: запись в хранилище не дёшева
function flush() {
  dirty = false;
  write(LOG_KEY, lines);
  if (logEl) logEl.textContent = lines.slice(0, LOG_SHOWN).join('\n') || 'Log is empty.';
}

if (IOS_HAPTIC_EXPERIMENT) addEventListener('pagehide', flush);

/* ── состояние ───────────────────────────────────────────────────────── */

let value = START;
let g = null; // жест, который идёт: палец, откуда начал, последний шаг
let endedAt = -Infinity;
const changes = { drag: 0, release: 0, other: 0 };

let rootEl;
let controlsEl;
let guideEl;
let stageEl;
let logEl;
let track;
let sw;
const f = {}; // поля панели

const setField = (key, text) => { if (f[key]) f[key].textContent = text; };

function paintValue() {
  if (!track) return;
  track.style.setProperty('--k', String((value - MIN) / (MAX - MIN)));
  track.querySelector('.lab-value').textContent = String(value);
  setField('value', String(value));
}

function paintChanges() {
  const any = changes.drag + changes.release + changes.other;
  setField('change', any
    ? `yes — during drag ${changes.drag}×, on release ${changes.release}×, other ${changes.other}×`
    : 'no');
}

/* ── жест ────────────────────────────────────────────────────────────── */

/** A и E: переключатель держится под пальцем; E ещё и прыгает вбок. */
function follow(dx, dy) {
  if (!sw || !(opts.mode === 'A' || opts.mode === 'E')) return;
  sw.style.setProperty('--fx', `${dx + (g?.jump ?? 0) * JUMP_PX}px`);
  sw.style.setProperty('--fy', `${dy}px`);
}

/**
 * Экспериментальный путь «вибрации» на смене шага. Из кода щелчок не
 * вызывается: A–C ждут, что сделает сам переключатель под пальцем, E
 * сдвигает его, чтобы палец оказался на другой половине.
 */
function hapticPath(dx, dy) {
  if (opts.mode === 'D') return 'none (control)';
  if (opts.mode !== 'E') return 'no JS trigger — watching the native switch';
  g.jump = g.jump === 1 ? -1 : 1;
  follow(dx, dy);
  return `switch moved ${g.jump > 0 ? 'right' : 'left'}: finger now on its ${g.jump > 0 ? 'left' : 'right'} half`;
}

function endGesture(e, kind) {
  if (!g || e.pointerId !== g.id) return;
  log(`${kind} x=${px(e.clientX)} y=${px(e.clientY)} target=${who(e.target)} id=${e.pointerId}`);
  log(`END: ${g.steps} step(s) in this drag · native switch changes during it: ${g.changes}`);
  setField('state', kind === 'pointercancel' ? 'cancelled' : 'idle');
  g = null;
  endedAt = performance.now();
  sw?.style.setProperty('--fx', '0px');
  sw?.style.setProperty('--fy', '0px');
}

function bindTrack(el) {
  el.addEventListener('pointerdown', (e) => {
    setField('target', who(e.target));
    if (g) {
      log(`pointerdown ignored: finger ${e.pointerId} while ${g.id} is down`);
      return;
    }
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, v0: value, prev: value, moved: false, touchMoved: false, steps: 0, changes: 0, jump: 0 };
    setField('state', 'active');
    log(`pointerdown x=${px(e.clientX)} y=${px(e.clientY)} target=${who(e.target)} type=${e.pointerType} primary=${e.isPrimary} id=${e.pointerId}`);
  });

  el.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.moved) {
      g.moved = true;
      log(`pointermove (first) x=${px(e.clientX)} y=${px(e.clientY)} target=${who(e.target)} value=${value}`);
    }
    follow(dx, dy);
    const along = opts.axis === 'v' ? -dy : dx; // вверх и вправо — больше
    const next = Math.min(MAX, Math.max(MIN, g.v0 + Math.round(along / STEP_PX)));
    if (next === g.prev) return;
    const from = g.prev;
    g.prev = next;
    g.steps += 1;
    value = next;
    paintValue();
    const attempt = hapticPath(dx, dy);
    setField('step', `${from} → ${next}`);
    setField('attempt', `${clock()} — ${attempt}`);
    setField('target', who(e.target));
    log(`STEP ${from} → ${next} | x=${px(e.clientX)} y=${px(e.clientY)} target=${who(e.target)} | switch=${sw ? (sw.checked ? 'on' : 'off') : 'none'} | ${attempt}`);
  });

  el.addEventListener('pointerup', (e) => endGesture(e, 'pointerup'));
  el.addEventListener('pointercancel', (e) => endGesture(e, 'pointercancel'));
  el.addEventListener('gotpointercapture', (e) => log(`gotpointercapture target=${who(e.target)} id=${e.pointerId}`));
  el.addEventListener('lostpointercapture', (e) => log(`lostpointercapture target=${who(e.target)} id=${e.pointerId}`));
}

function bindSwitch(el) {
  const phase = () => {
    if (g) return 'drag';
    return performance.now() - endedAt < 1000 ? 'release' : 'other';
  };
  const said = { drag: 'during the drag', release: 'right after release', other: 'outside a drag' };

  el.addEventListener('change', (e) => {
    const p = phase();
    changes[p] += 1;
    if (g) g.changes += 1;
    setField('checked', el.checked ? 'on' : 'off');
    paintChanges();
    log(`NATIVE SWITCH change → ${el.checked ? 'ON' : 'OFF'} | ${said[p]} | trusted=${e.isTrusted}`);
  });

  for (const type of ['input', 'click', 'pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel']) {
    el.addEventListener(type, (e) => {
      const where = e.clientX != null ? ` x=${px(e.clientX)} y=${px(e.clientY)}` : '';
      const touches = e.touches ? ` touches=${e.touches.length}` : '';
      log(`switch ${type}${where}${touches} checked=${el.checked} trusted=${e.isTrusted}`);
    }, { passive: true });
  }

  // touchmove — только первый за жест, иначе лог тонет
  el.addEventListener('touchmove', (e) => {
    if (g && !g.touchMoved) {
      g.touchMoved = true;
      log(`switch touchmove (first) touches=${e.touches.length} trusted=${e.isTrusted}`);
    }
  }, { passive: true });
}

/* ── экран ───────────────────────────────────────────────────────────── */

function pills(label, key, options) {
  return h('div', { class: 'setting' },
    h('span', { class: 'setting-label' }, label),
    h('div', { class: 'pills', role: 'group', 'aria-label': label },
      options.map(([v, text]) => h('button', {
        class: ['pill', opts[key] === v && 'is-on'], type: 'button', 'aria-pressed': String(opts[key] === v),
        onclick: () => {
          if (opts[key] === v) return;
          opts[key] = v;
          write(OPTS_KEY, opts);
          log(`OPTIONS → ${modeTag()}`);
          paint();
        },
      }, text))));
}

function stage() {
  const hasSwitch = opts.mode !== 'D';
  const onDot = opts.mode === 'A' || opts.mode === 'C' || opts.mode === 'E';
  sw = hasSwitch
    ? h('input', { class: 'lab-switch', id: 'iosHapticSwitch', type: 'checkbox', switch: true, tabindex: '-1', 'aria-hidden': 'true' })
    : null;
  track = h('div', {
    class: ['lab-track', opts.axis === 'v' ? 'is-v' : 'is-h', `is-${opts.mode.toLowerCase()}`, opts.show && 'is-shown'],
  },
  h('div', { class: 'lab-fill' }),
  h('div', { class: 'lab-handle' }),
  h('output', { class: 'lab-value' }, String(value)),
  onDot && h('span', { class: 'lab-dot', 'aria-hidden': 'true' }),
  sw);
  bindTrack(track);
  if (sw) bindSwitch(sw);
  return track;
}

function paint() {
  controlsEl.replaceChildren(
    pills('Mode', 'mode', Object.keys(MODES).map((m) => [m, m])),
    pills('Direction', 'axis', [['v', 'Vertical'], ['h', 'Horizontal']]),
    pills('Switch', 'show', [[false, 'Hidden'], [true, 'Visible']]));
  guideEl.textContent = `${MODES[opts.mode]} ${opts.axis === 'v' ? 'Up and down' : 'Left and right'}, one continuous move, no lifting.`;
  stageEl.replaceChildren(stage());
  paintValue();
  setField('checked', sw ? (sw.checked ? 'on' : 'off') : 'none (mode D)');
  // где переключатель на самом деле: WebKit мог не растянуть его (режим B)
  requestAnimationFrame(() => {
    if (!sw?.isConnected) return;
    const r = sw.getBoundingClientRect();
    log(`switch box ${px(r.width)}×${px(r.height)} at x=${px(r.left)} y=${px(r.top)}`);
  });
}

function build() {
  const row = (label, key) => h('div', { class: 'lab-row' }, h('dt', null, label), (f[key] = h('dd', null, '—')));
  const button = (text, onclick) => h('button', { class: 'pill', type: 'button', onclick }, text);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  controlsEl = h('div', { class: 'lab-controls' });
  guideEl = h('p', { class: 'lab-guide' });
  stageEl = h('div', { class: 'lab-stage' });
  logEl = h('pre', { class: 'lab-log' });

  rootEl = h('section', { class: 'screen screen-lab' },
    backLink('#/settings', 'Settings'),
    header('Haptics lab', 'Experiment'),
    h('p', { class: 'block-text' },
      'Can iPhone tick on every step of one continuous drag, if the finger lies on a real switch? Nothing here triggers haptics from code — the lab only watches what the switch does by itself and logs it.'),
    controlsEl,
    guideEl,
    stageEl,
    h('h2', { class: 'label' }, 'Debug'),
    h('dl', { class: 'block-alt lab-panel' },
      row('iOS / WebKit', 'ua'),
      row('navigator.vibrate', 'vibrate'),
      row('display-mode', 'display'),
      row('Native switch', 'checked'),
      row('Last pointer target', 'target'),
      row('Pointer state', 'state'),
      row('Current value', 'value'),
      row('Last step', 'step'),
      row('Last haptic attempt', 'attempt'),
      row('Native switch change', 'change')),
    h('div', { class: 'lab-actions' },
      button('Clear log', () => {
        lines = [];
        Object.assign(changes, { drag: 0, release: 0, other: 0 });
        paintChanges();
        flush();
        toast('Log cleared', { done: true });
      }),
      button('Copy log', async () => {
        const head = [
          'Haptics lab log (newest first)',
          `UA: ${navigator.userAgent}`,
          `display-mode: ${standalone ? 'standalone' : 'browser'} · navigator.vibrate: ${typeof navigator.vibrate === 'function' ? 'present' : 'absent'}`,
          `now: ${modeTag()}`,
          '',
        ];
        flush();
        toast(await copyText([...head, ...lines].join('\n')) ? 'Log copied' : 'Could not copy', { done: true });
      }),
      button('Value → 50', () => {
        value = START;
        paintValue();
        log('value reset to 50');
      })),
    logEl);

  setField('ua', navigator.userAgent);
  setField('vibrate', typeof navigator.vibrate === 'function' ? 'present' : 'absent');
  setField('display', standalone ? 'standalone' : 'browser');
  setField('state', 'idle');
  setField('step', '—');
  setField('attempt', '—');
  paintChanges();
  log(`LAB OPEN · ${modeTag()} · ${standalone ? 'standalone' : 'browser'} · vibrate ${typeof navigator.vibrate === 'function' ? 'present' : 'absent'}`);
  paint();
  flush();
  return rootEl;
}

/**
 * Экран строится один раз и дальше тот же: приложение перерисовывает экран
 * на каждое изменение данных, а пересоздать переключатель посреди жеста —
 * значит оборвать жест.
 */
export function labView() {
  return rootEl ?? build();
}
