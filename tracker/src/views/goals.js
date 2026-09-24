/**
 * «Цели» — долгосрочные цели. У цели может быть число (10 откликов,
 * 5 км, 100 000 ₽) — тогда прогресс считается по нему, кнопки −/+ его
 * двигают; без числа прогресс — отмеченные шаги. Шаги — простой чек-лист,
 * без привязки к месяцу. Срок необязателен.
 */
import { h, icon, entry, openSheet, closeSheet, renderSheet, toast } from '../ui.js';
import { diffDays, fmtLong } from '../dates.js';
import { goalProgress, goalsOverview, isGoalDone } from '../logic.js';
import * as store from '../store.js';
import { ui, header, iconButton, pillButton, checkButton } from './common.js';

/** Число без лишних нулей: 2.5, 10, 100 000. */
export const num = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }).replace(/,/g, ' ');

/** Большая дробь: сделано — чернилами, «/всего» — приглушённо. */
export const fraction = (done, total, unit = '') =>
  h('span', { class: 'fraction' }, num(done), h('span', { class: 'muted' }, `/${num(total)}`), unit && h('span', { class: 'fraction-unit' }, unit));

/** Полоса прогресса: сделанное сплошным, оставшееся штриховкой. */
export function meter(done, total) {
  const bar = h('div', {
    class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done),
  }, h('div', { class: 'meter-done' }));
  bar.firstChild.style.width = total ? `${Math.min(100, (done / total) * 100)}%` : '0%';
  return bar;
}

/** «12 days left», «Due today», «Overdue 3d» — срок цели. */
export function goalDue(goal, today) {
  if (!goal.deadline) return null;
  const d = diffDays(today, goal.deadline);
  if (d < 0) return { text: `Overdue ${-d}d`, late: !isGoalDone(goal) };
  if (d === 0) return { text: 'Due today', late: false };
  return { text: d === 1 ? '1 day left' : `${d} days left`, late: false };
}

const field = (label, ...content) =>
  h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), h('div', { class: 'field-body' }, content));

function numberInput(value, label, key, onSet) {
  return h('input', {
    class: 'num-input', type: 'text', inputmode: 'decimal', value: value == null ? '' : String(value),
    'aria-label': label, placeholder: '—', 'data-key': key,
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    onchange: (e) => {
      const raw = e.target.value.trim().replace(',', '.').replace(/\s/g, '');
      const n = raw === '' ? null : Number(raw);
      if (raw !== '' && !Number.isFinite(n)) {
        e.target.value = value == null ? '' : String(value);
        return;
      }
      onSet(n);
    },
  });
}

/** Шторка цели: название, число (цель, сейчас, единица), срок, удаление. */
export function editGoal(id) {
  ui.confirm = null;
  openSheet(() => {
    const g = store.getState().goals.find((x) => x.id === id);
    if (!g) return [];
    const confirming = ui.confirm === `goal-${id}`;
    const measured = g.target > 0;
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
      h('div', { class: 'goal-form' },
        field('Progress', h('div', { class: 'pills' },
          h('button', {
            class: ['pill', !measured && 'is-on'], type: 'button', 'aria-pressed': String(!measured),
            onclick: () => store.updateGoal(g.id, { target: null }),
          }, 'By steps'),
          h('button', {
            class: ['pill', measured && 'is-on'], type: 'button', 'aria-pressed': String(measured),
            onclick: () => !measured && store.updateGoal(g.id, { target: 10, current: g.current ?? 0 }),
          }, 'By number'))),
        measured && field('Target', numberInput(g.target, 'Target', `goal-target-${g.id}`,
          (n) => store.updateGoal(g.id, { target: n > 0 ? n : null }))),
        measured && field('Now', numberInput(g.current ?? 0, 'Current value', `goal-current-${g.id}`,
          (n) => store.updateGoal(g.id, { current: Math.max(0, n ?? 0) }))),
        measured && field('Unit', h('input', {
          class: 'num-input', type: 'text', value: g.unit ?? '', placeholder: 'km, ₽, pages', 'aria-label': 'Unit',
          'data-key': `goal-unit-${g.id}`,
          onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
          onchange: (e) => store.updateGoal(g.id, { unit: e.target.value.trim() }),
        })),
        field('Deadline',
          h('label', { class: 'date-wrap' },
            h('span', { class: ['pill', g.deadline && 'is-on'] }, icon('calendar', 20), g.deadline ? fmtLong(g.deadline) : 'None'),
            h('input', {
              class: 'date', type: 'date', 'aria-label': 'Goal deadline', value: g.deadline ?? '',
              onclick: (e) => { try { e.target.showPicker?.(); } catch { /* уже открыт */ } },
              onchange: (e) => store.updateGoal(g.id, { deadline: e.target.value || null }),
            })),
          g.deadline && iconButton('close', 'Clear deadline', () => store.updateGoal(g.id, { deadline: null }), '', 20))),
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

/** Шаг значения: для десятков — 1, для тысяч — сотня, чтобы тапать не до утра. */
const stepOf = (target) => (target >= 5000 ? 100 : target >= 500 ? 10 : 1);

function goalCard(goal) {
  const p = goalProgress(goal);
  const due = goalDue(goal, ui.day);
  const done = isGoalDone(goal);
  return h('article', { class: ['goal', done && 'is-done'] },
    h('div', { class: 'goal-head' },
      h('h2', { class: 'goal-title' }, goal.title),
      iconButton('more', `Edit ${goal.title}`, () => editGoal(goal.id))),
    (due || done) && h('p', { class: 'goal-meta' },
      done && h('span', null, 'Reached'),
      done && due && h('span', { class: 'dot' }, '·'),
      due && h('span', { class: due.late ? 'is-late' : null }, due.text),
      due && h('span', { class: 'muted' }, ` · ${fmtLong(goal.deadline)}`)),
    h('div', { class: ['goal-progress', p.kind === 'value' && 'is-value'] },
      p.kind === 'value' ? fraction(p.current, p.total, goal.unit) : fraction(p.done, p.total),
      meter(p.done, p.total)),
    p.kind === 'value' && h('div', { class: 'goal-bump' },
      h('button', {
        class: 'bump', type: 'button', 'aria-label': `Minus ${stepOf(goal.target)}`, disabled: !p.current,
        onclick: () => store.bumpGoal(goal.id, -stepOf(goal.target)),
      }, icon('minus')),
      h('button', {
        class: 'bump bump-plus', type: 'button', 'aria-label': `Plus ${stepOf(goal.target)}`,
        onclick: () => store.bumpGoal(goal.id, stepOf(goal.target)),
      }, icon('plus'), h('span', null, `${stepOf(goal.target)}`))),
    p.steps.length > 0 && h('ul', { class: 'steps' }, p.steps.map((s) =>
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
    entry(`step-add-${goal.id}`, 'Add a step', (title) => store.addStep(goal.id, title), { cls: 'entry-sm' }));
}

export function goalsView() {
  const goals = goalsOverview(store.getState());
  const reached = goals.filter(({ goal }) => isGoalDone(goal)).length;
  return h('section', { class: 'screen screen-goals' },
    header('Goals', goals.length ? `${reached} of ${goals.length} reached` : ''),
    goals.length > 0 && h('div', { class: 'goal-list' }, goals.map(({ goal }) => goalCard(goal))),
    !goals.length && h('p', { class: 'hint' },
      'No goals yet. Name one below — then give it a number (10 applications, 5 km) and a deadline, or just add steps.'),
    // новая цель сразу открывает шторку: число и срок видно с первого раза
    entry('goal-new', 'New goal', (title) => editGoal(store.createGoal(title).id), { cls: 'entry-card' }));
}
