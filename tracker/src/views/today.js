/**
 * «Сегодня» — главный экран.
 *
 * Сверху — композиция дня: по пилюле на задачу. Сделанное — штриховкой
 * (прошлое), открытое — чернилами, №1 — красным (требует внимания сейчас),
 * свободные места — бледные кружки. Высота пилюли — приоритет. Когда задачу
 * отмечают, её пилюля переезжает влево и штрихуется — день виден без чтения.
 *
 * Ниже — поле ввода (Enter кладёт задачу во «Входящие»), три места на день
 * и отдельно просроченные.
 */
import { h, icon, sortable, toast, flip, countUp } from '../ui.js';
import { fmtDay } from '../dates.js';
import { DAY_LIMIT, dayTasks, overdue } from '../logic.js';
import * as store from '../store.js';
import { ui, header, taskItem, emptySlots, plot } from './common.js';

let shell;
let input;
let sub;
let chart;
let stat;
let body;
const shapes = new Map(); // ключ (id задачи или место) → пилюля; живут между перерисовками

const HEIGHT = { high: 1, medium: 0.8, low: 0.62 };

/* Шапка, композиция и поле собираются один раз: поле не пересоздаётся при
   перерисовке (фокус и клавиатура остаются), пилюли переезжают, а не мигают. */
function build() {
  input = h('input', {
    class: 'add-input', type: 'text', placeholder: 'Add a task', 'aria-label': 'New task',
    autocomplete: 'off', autocapitalize: 'sentences', 'data-key': 'today-add',
  });
  const form = h('form', {
    class: 'add',
    onsubmit: (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      input.value = '';
      store.createTask(title);
      toast('Added to Inbox');
    },
  }, h('span', { class: 'chip' }, icon('plus')), input);

  const head = header('Today', '', h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings', title: 'Settings' }, icon('settings')));
  sub = head.querySelector('.title-sub');
  chart = h('div', { class: 'day-chart', role: 'img' });
  stat = h('div', { class: 'stat' });
  body = h('div', { class: 'today-body' });
  shell = h('section', { class: 'screen screen-today' }, head, plot(chart), stat, form, body);
}

function drawChart(open, done) {
  const want = [
    ...done.map((t) => [t.id, 'done', t]),
    ...open.map((t, i) => [t.id, i === 0 ? 'first' : 'open', t]),
    ...Array.from({ length: Math.max(0, DAY_LIMIT - open.length) }, (_, i) => [`empty-${i}`, 'empty', null]),
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
        el = h('span', { class: 'shape' });
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
  input?.focus({ preventScroll: true });
}

export function todayView() {
  if (!shell) build();
  const st = store.getState();
  const { open, done } = dayTasks(st, ui.day);
  const late = overdue(st, ui.day);

  sub.textContent = fmtDay(ui.day);
  drawChart(open, done);
  drawStat(open, done);

  // пустые места — в том же списке, после задач: перетаскивание их не трогает (у них нет data-id)
  const slots = sortable(h('ol', { class: 'tasks day-list', 'aria-label': 'Today' },
    open.map((t, i) => taskItem(t, { num: i + 1, accent: i === 0, drag: open.length > 1 })),
    emptySlots(open.length)), (ids) => store.reorderDay(ids));

  body.replaceChildren(...[
    slots,
    !open.length && !done.length && h('p', { class: 'hint' }, 'Open any task and tap Today — or plan tomorrow tonight.'),
    done.length > 0 && h('ul', { class: 'tasks done-list', 'aria-label': 'Done today' }, done.map((t) => taskItem(t))),
    late.length > 0 && h('section', { class: 'block block-alt' },
      h('h2', { class: 'label' }, 'Overdue', h('span', { class: 'count' }, late.length)),
      h('ul', { class: 'tasks tasks-compact' }, late.map((t) => taskItem(t)))),
  ].filter(Boolean));
  return shell;
}
