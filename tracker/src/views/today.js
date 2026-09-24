/**
 * «Сегодня» — главный экран. Поле ввода сверху: Enter кладёт задачу во
 * «Входящие». Ниже три места на день: №1 — единственное, что горит красным
 * вместе с просроченными. Пустые места заштрихованы — лимит виден сразу.
 */
import { h, icon, sortable, toast } from '../ui.js';
import { fmtDay } from '../dates.js';
import { dayTasks, overdue } from '../logic.js';
import * as store from '../store.js';
import { ui, header, taskItem, emptySlots } from './common.js';

let shell;
let input;
let sub;
let body;

/* Шапка и поле собираются один раз: поле не пересоздаётся при перерисовке,
   фокус и клавиатура остаются, пока набираешь задачи подряд. */
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
  }, icon('plus'), input);

  const head = header('Today', '', h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings', title: 'Settings' }, icon('settings')));
  sub = head.querySelector('.head-text').appendChild(h('p', { class: 'sub' }));
  body = h('div', { class: 'today-body' });
  shell = h('section', { class: 'screen screen-today' }, head, form, body);
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

  // пустые места — в том же списке, после задач: перетаскивание их не трогает (у них нет data-id)
  const slots = sortable(h('ol', { class: 'tasks day-list', 'aria-label': 'Today' },
    open.map((t, i) => taskItem(t, { num: i + 1, accent: i === 0, drag: open.length > 1 })),
    emptySlots(open.length)), (ids) => store.reorderDay(ids));

  body.replaceChildren(...[
    slots,
    !open.length && !done.length && h('p', { class: 'hint' }, 'Nothing planned. Open any task and tap Today — or plan tomorrow tonight.'),
    done.length > 0 && h('ul', { class: 'tasks done-list', 'aria-label': 'Done today' }, done.map((t) => taskItem(t))),
    late.length > 0 && h('section', { class: 'block block-alt' },
      h('h2', { class: 'block-title' }, 'Overdue', h('span', { class: 'count' }, late.length)),
      h('ul', { class: 'tasks tasks-compact' }, late.map((t) => taskItem(t)))),
  ].filter(Boolean));
  return shell;
}
