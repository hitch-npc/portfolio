/**
 * «Цели» — долгосрочные цели, под каждой шаги текущего месяца.
 * Шаг отмечается одним тапом; прогресс — сделанная часть сплошной,
 * остаток штриховкой.
 */
import { h, entry, openSheet, closeSheet, renderSheet, toast } from '../ui.js';
import { monthName, monthOf } from '../dates.js';
import { goalsForMonth } from '../logic.js';
import * as store from '../store.js';
import { ui, header, iconButton, pillButton, checkButton } from './common.js';

/** Большая дробь: сделано — чернилами, «/всего» — приглушённо. */
export const fraction = (done, total) =>
  h('span', { class: 'fraction' }, String(done), h('span', { class: 'muted' }, `/${total}`));


/** Полоса прогресса: сделанное сплошным, оставшееся штриховкой. */
export function meter(done, total) {
  const bar = h('div', {
    class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done),
  }, h('div', { class: 'meter-done' }));
  bar.firstChild.style.width = total ? `${(done / total) * 100}%` : '0%';
  return bar;
}

function editGoal(id) {
  ui.confirm = null;
  openSheet(() => {
    const g = store.getState().goals.find((x) => x.id === id);
    if (!g) return [];
    const confirming = ui.confirm === `goal-${id}`;
    return [
      h('input', {
        class: 'sheet-input', type: 'text', value: g.title, 'aria-label': 'Goal', 'data-key': `goal-title-${g.id}`,
        onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
        onchange: (e) => {
          const v = e.target.value.trim();
          if (v) store.updateGoal(g.id, { title: v });
          else e.target.value = g.title;
        },
      }),
      h('div', { class: 'sheet-actions' },
        pillButton(null, confirming ? 'Tap again to delete' : 'Delete goal', () => {
          if (!confirming) {
            ui.confirm = `goal-${id}`;
            renderSheet();
            return;
          }
          ui.confirm = null;
          store.deleteGoal(g.id);
          closeSheet();
          toast('Goal deleted');
        }, confirming ? 'is-on' : ''),
        pillButton(null, 'Done', () => { ui.confirm = null; closeSheet(); }, 'is-on')),
    ];
  });
}

function goalCard({ goal, steps, done, total }, month) {
  return h('article', { class: 'goal' },
    h('div', { class: 'goal-head' },
      h('h2', { class: 'goal-title' }, goal.title),
      iconButton('more', `Edit ${goal.title}`, () => editGoal(goal.id))),
    h('div', { class: 'goal-progress' }, fraction(done, total), meter(done, total)),
    steps.length > 0 && h('ul', { class: 'steps' }, steps.map((s) =>
      h('li', { class: ['step', s.done && 'is-done'] },
        checkButton(s.done, s.done ? 'Mark step as not done' : 'Mark step as done',
          () => store.updateStep(goal.id, s.id, { done: !s.done }), 'check-sm'),
        h('input', {
          class: 'step-title', type: 'text', value: s.title, 'aria-label': 'Step', 'data-key': `step-${s.id}`,
          onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
          onchange: (e) => {
            const v = e.target.value.trim();
            v ? store.updateStep(goal.id, s.id, { title: v }) : store.deleteStep(goal.id, s.id);
          },
        }),
        iconButton('close', 'Delete step', () => store.deleteStep(goal.id, s.id), '', 18)))),
    entry(`step-add-${goal.id}`, `Add step for ${monthName(month)}`,
      (title) => store.addStep(goal.id, title, month), { cls: 'entry-sm' }));
}

export function goalsView() {
  const month = monthOf(ui.day);
  const goals = goalsForMonth(store.getState(), month);
  return h('section', { class: 'screen screen-goals' },
    header('Goals', monthName(month)),
    goals.length > 0 && h('div', { class: 'goal-list' }, goals.map((g) => goalCard(g, month))),
    !goals.length && h('p', { class: 'hint' }, 'No goals yet. Add a long-term goal, then this month’s steps under it.'),
    entry('goal-new', 'New goal', (title) => store.createGoal(title), { cls: 'entry-card' }));
}
