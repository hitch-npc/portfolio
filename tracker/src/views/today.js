/**
 * «Сегодня» — главный экран.
 *
 * Сверху — композиция дня: по пилюле на задачу. Сделанное — штриховкой
 * (прошлое), открытое — чернилами, №1 — красным (требует внимания сейчас),
 * свободные места — бледные кружки. Высота пилюли — приоритет. Когда задачу
 * отмечают, её пилюля переезжает влево и штрихуется — день виден без чтения.
 *
 * Ниже — поле ввода с чипами (сфера, дата, приоритет; по умолчанию —
 * на сегодня, это настройка), места дня, отдельно — не сделанное
 * в прошлые дни и просроченные.
 */
import { h, icon, sortable, swipeable, toast, flip, countUp, haptic, calm } from '../ui.js';
import { fmtDay } from '../dates.js';
import { carriedOver, dayLimit, dayTasks, overdue, settingsOf } from '../logic.js';
import * as store from '../store.js';
import { ui, header, taskItem, emptySlots, plot, pillButton } from './common.js';
import { composer, dropDraft } from './pickers.js';

let shell;
let compose;
let composeDay;
let sub;
let chart;
let stat;
let body;
const shapes = new Map(); // ключ (id задачи или место) → пилюля; живут между перерисовками

const HEIGHT = { high: 1, medium: 0.8, low: 0.62 };

/* Шапка, композиция и поле собираются один раз: поле не пересоздаётся при
   перерисовке (фокус и клавиатура остаются), пилюли переезжают, а не мигают. */
function build() {
  compose = makeComposer();
  const head = header('Today', '', h('a', { class: 'icon-btn corner-btn', href: '#/settings', 'aria-label': 'Settings', title: 'Settings' }, icon('settings')));
  sub = head.querySelector('.title-sub');
  chart = h('div', { class: 'day-chart', role: 'img', onclick: tapShape });
  stat = h('div', { class: 'stat' });
  body = h('div', { class: 'today-body' });
  shell = h('section', { class: 'screen screen-today' }, head, plot(chart), stat, compose, body);
}

/** Дата по умолчанию для новых задач — из настроек; сменили настройку — новое поле. */
function makeComposer() {
  composeDay = settingsOf(store.getState()).addTo;
  dropDraft('today-add');
  return composer('today-add', { day: composeDay === 'today' ? 'today' : null });
}

function drawChart(open, done) {
  const want = [
    ...done.map((t) => [t.id, 'done', t]),
    ...open.map((t, i) => [t.id, i === 0 ? 'first' : 'open', t]),
    ...Array.from({ length: Math.max(0, dayLimit(store.getState()) - open.length) }, (_, i) => [`empty-${i}`, 'empty', null]),
  ];
  const keep = new Set(want.map(([k]) => k));

  flip(() => [...shapes.values()], () => {
    for (const [k, el] of shapes) {
      if (!keep.has(k)) {
        el.remove();
        shapes.delete(k);
      }
    }
    want.forEach(([k, state, t], i) => {
      let el = shapes.get(k);
      if (!el) {
        el = h('span', { class: 'shape', 'data-key': k });
        shapes.set(k, el);
      }
      el.className = `shape is-${state}`;
      el.style.setProperty('--h', String(t ? HEIGHT[t.priority] ?? 0.62 : 0));
      el.style.setProperty('--i', String(i));
      if (chart.children[i] !== el) chart.insertBefore(el, chart.children[i] ?? null);
    });
  });
  chart.setAttribute('aria-label', `${done.length} of ${done.length + open.length} tasks done today`);
}

/**
 * Пилюли дня отзываются на тап: пружинят и щёлкают. Пилюля задачи
 * подсвечивает её строку в списке; пустое место открывает поле новой задачи.
 */
function tapShape(e) {
  const el = e.target.closest('.shape');
  if (!el) return;
  haptic();
  if (!calm()) {
    el.animate([
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.08, 0.86)', offset: 0.25 },
      { transform: 'scale(0.96, 1.06)', offset: 0.55 },
      { transform: 'scale(1, 1)' },
    ], { duration: 520, easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)' });
  }
  const key = el.dataset.key;
  if (key.startsWith('empty-')) {
    focusInput();
    return;
  }
  const row = body.querySelector(`[data-id="${CSS.escape(key)}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
  if (calm()) return;
  row.classList.remove('is-ping');
  void row.offsetWidth; // тапнули ещё раз — подсветка сначала
  row.classList.add('is-ping');
}

function drawStat(open, done) {
  const total = open.length + done.length;
  if (!total) {
    stat.replaceChildren(h('span', { class: 'stat-label' }, 'Nothing planned yet'));
    return;
  }
  const value = h('span', { class: 'stat-value' }, String(done.length), h('span', { class: 'muted' }, `/${total}`));
  stat.replaceChildren(h('span', { class: 'stat-label' }, 'Done today'), value);
  if (ui.entering) countUp(value, done.length);
}

export function focusInput() {
  compose?.focusInput();
}

export function todayView() {
  if (!shell) build();
  const st = store.getState();
  if (settingsOf(st).addTo !== composeDay) {
    const next = makeComposer();
    compose.replaceWith(next);
    compose = next;
  }
  compose.refresh();
  const { open, done } = dayTasks(st, ui.day);
  const late = overdue(st, ui.day);
  // не сделанное в прошлые дни; просроченное и так показано ниже — второй раз не повторяем
  const lateIds = new Set(late.map((t) => t.id));
  const carried = carriedOver(st, ui.day).filter((t) => !lateIds.has(t.id));

  sub.textContent = fmtDay(ui.day);
  drawChart(open, done);
  drawStat(open, done);

  // пустые места — в том же списке, после задач: перетаскивание их не трогает (у них нет data-id)
  const slots = sortable(swipeable(h('ol', { class: 'tasks day-list', 'aria-label': 'Today' },
    open.map((t, i) => taskItem(t, { num: i + 1, accent: i === 0, drag: open.length > 1, inDay: true })),
    emptySlots(open.length))), (ids) => store.reorderDay(ids), { hold: true });

  body.replaceChildren(...[
    slots,
    !open.length && !done.length && h('p', { class: 'hint' }, 'Type a task above — it lands on today. Or open any task and pick a date.'),
    done.length > 0 && swipeable(h('ul', { class: 'tasks done-list', 'aria-label': 'Done today' }, done.map((t) => taskItem(t, { inDay: true })))),
    carried.length > 0 && h('section', { class: 'block block-alt' },
      h('div', { class: 'block-head' },
        h('h2', { class: 'label' }, 'Not done yet', h('span', { class: 'count' }, carried.length)),
        pillButton(null, 'Move to today', () => {
          const n = store.planMany(carried.map((t) => t.id), ui.day);
          toast(n === carried.length ? `Moved ${n} to today` : n ? `Moved ${n} — today is full` : 'Today is full');
        }, 'pill-sm')),
      swipeable(h('ul', { class: 'tasks tasks-compact' }, carried.map((t) => taskItem(t))))),
    late.length > 0 && h('section', { class: 'block block-alt' },
      h('h2', { class: 'label' }, 'Overdue', h('span', { class: 'count' }, late.length)),
      swipeable(h('ul', { class: 'tasks tasks-compact' }, late.map((t) => taskItem(t))))),
  ].filter(Boolean));
  return shell;
}
