/**
 * «Планирование завтра» — вечерний режим. Сверху места на завтра,
 * ниже всё, из чего выбирать: не сделанное сегодня, поставленное на
 * дни позже завтра, «Входящие», сферы. Тап по задаче ставит её на завтра,
 * повторный — снимает; смахивание влево открывает «Delete».
 */
import { h, glyph, sphereMark, icon, sortable, swipeable, removeRow, toast } from '../ui.js';
import { dayLabel, dueLabel, fmtDay } from '../dates.js';
import { dayTasks, planGroups } from '../logic.js';
import * as store from '../store.js';
import { ui, header, requestPlan, emptySlots, iconButton } from './common.js';
import { dateSheet } from './pickers.js';
import { calendarSheet } from './calendar.js';

function candidate(t, picked, spheres, showSphere, showDay) {
  const num = picked.get(t.id);
  const sphere = spheres.get(t.sphereId);
  const due = t.deadline ? dueLabel(t.deadline, ui.day) : null;
  return h('li', { class: 'pick-row', 'data-id': t.id, 'data-swipe': '' },
    h('button', {
      class: 'swipe-action', type: 'button', 'aria-label': `Delete “${t.title}”`,
      onclick: (e) => removeRow(e.currentTarget.closest('li'), () => {
        store.deleteTask(t.id);
        toast('Task deleted');
      }),
    }, icon('close', 20), h('span', null, 'Delete')),
    h('div', { class: 'swipe-body' }, h('button', {
    class: ['pick', num && 'is-on'], type: 'button', 'aria-pressed': String(Boolean(num)),
    onclick: () => (num ? store.unplanTask(t.id) : requestPlan(t, ui.tomorrow)),
  },
    h('span', { class: 'pick-mark', 'aria-hidden': 'true' }, num ? String(num) : ''),
    h('span', { class: 'pick-text' },
      h('span', { class: 'task-title' }, t.title),
      h('span', { class: 'task-meta' },
        dotted([
          showSphere && h('span', { class: 'meta-sphere', 'data-sc': sphere?.color }, glyph(sphere ? sphere.glyph : 'inbox'), sphere ? sphere.name : 'Inbox'),
          showDay && t.day && [dayLabel(t.day, ui.day), t.time].filter(Boolean).join(' '),
          t.status === 'doing' && 'In progress',
          due && h('span', { class: due.late ? 'is-late' : null }, due.text),
        ])))),
    iconButton('calendar', `Pick a date for “${t.title}”`,
      () => dateSheet(t, (v) => requestPlan(t, v.day, { time: v.time, repeat: v.repeat }), {
        current: t.day, onReminder: () => calendarSheet(t.id),
      }), 'pick-date', 20)));
}

/** Части подписи через точку; пустые пропускаются. */
const dotted = (parts) => parts.filter(Boolean).map((p, i) => [i > 0 && h('span', { class: 'dot' }, '·'), p]);

/**
 * В группе сферы сфера не подписывается — она в заголовке; в «Not done yet»
 * и «Upcoming» — подписывается, а в «Upcoming» ещё и день.
 */
function group(title, mark, tasks, picked, spheres, showDay = false) {
  if (!tasks.length) return null;
  const showSphere = mark == null;
  return h('section', { class: 'plan-group' },
    h('h2', { class: 'label' }, mark, title, h('span', { class: 'count' }, tasks.length)),
    swipeable(h('ul', { class: 'picks' }, tasks.map((t) => candidate(t, picked, spheres, showSphere, showDay)))));
}

export function planView() {
  const st = store.getState();
  const g = planGroups(st, ui.day);
  const { open } = dayTasks(st, g.target);
  const picked = new Map(open.map((t, i) => [t.id, i + 1]));
  const spheres = new Map(st.spheres.map((s) => [s.id, s]));

  const slots = sortable(h('ol', { class: 'tasks day-list', 'aria-label': 'Tomorrow' }, open.map((t, i) =>
    h('li', { class: 'task slot', 'data-id': t.id },
      h('div', { class: 'task-row' },
        h('span', { class: 'task-num', 'data-drag': open.length > 1 ? '' : null }, String(i + 1)),
        h('span', { class: 'task-main' }, h('span', { class: 'task-title' }, t.title)),
        h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': `Remove “${t.title}” from tomorrow`,
          onclick: () => store.unplanTask(t.id),
        }, icon('close'))))), emptySlots(open.length)), (ids) => store.reorderDay(ids), { hold: true });

  const groups = [
    group('Not done yet', null, g.carried, picked, spheres, true),
    group('Upcoming', null, g.upcoming, picked, spheres, true),
    group('Inbox', glyph('inbox'), g.inbox, picked, spheres),
    ...g.spheres.map((x) => group(x.sphere.name, sphereMark(x.sphere), x.tasks, picked, spheres)),
  ].filter(Boolean);

  return h('section', { class: 'screen screen-plan' },
    header('Tomorrow', fmtDay(g.target)),
    slots,
    h('p', { class: 'hint hint-top' }, 'Tap a task to plan it for tomorrow, the calendar — for any other date. Swipe left to delete.'),
    groups.length ? groups : h('p', { class: 'hint' }, 'No active tasks to plan. Add some on Today.'));
}
