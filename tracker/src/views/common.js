/**
 * Общее для экранов: шапка, строка задачи с раскрывающейся карточкой,
 * шторка «день полон — заменить одну из трёх».
 */
import { h, icon, glyph, autosize, entry, openSheet, closeSheet, toast } from '../ui.js';
import { addDays, dueLabel, fmtDay } from '../dates.js';
import { DAY_LIMIT, PRIORITIES, STATUSES, activeSpheres, dayTasks } from '../logic.js';
import * as store from '../store.js';

/** Состояние интерфейса, которого нет в данных. */
export const ui = {
  day: '', // сегодня, 'YYYY-MM-DD'; обновляет app.render
  tomorrow: '',
  expanded: null, // id раскрытой задачи
  open: new Set(), // раскрытые свёрнутые блоки: 'done:<sphere>', 'archived'
  confirm: null, // id, ждущий второго тапа «удалить»
};

/** Перерисовка без изменения данных (раскрыть карточку, свернуть блок). Ставит app.js. */
export let rerender = () => {};
export const setRerender = (fn) => (rerender = fn);

export function header(title, sub, ...actions) {
  return h('header', { class: 'head' },
    h('div', { class: 'head-text' },
      h('h1', { class: 'title' }, title),
      sub && h('p', { class: 'sub' }, sub)),
    actions.length > 0 && h('div', { class: 'head-actions' }, actions));
}

export const backLink = (href, label) => h('a', { class: 'back', href }, icon('back'), label);

export function iconButton(name, label, onclick, cls = '') {
  return h('button', { class: ['icon-btn', cls], type: 'button', 'aria-label': label, title: label, onclick }, icon(name));
}

/** Кнопка-пилюля: иконка + подпись. */
export function pillButton(name, label, onclick, cls = '') {
  return h('button', { class: ['pill', 'pill-action', cls], type: 'button', onclick }, name && icon(name), label);
}

export function toggleBlock(id) {
  ui.open.has(id) ? ui.open.delete(id) : ui.open.add(id);
}

/** Сворачиваемый блок: заголовок-кнопка с числом, содержимое по тапу. */
export function foldout(id, title, count, content) {
  const isOpen = ui.open.has(id);
  return h('section', { class: ['fold', isOpen && 'is-open'] },
    h('button', {
      class: 'fold-head', type: 'button', 'aria-expanded': String(isOpen),
      onclick: () => { toggleBlock(id); rerender(); },
    }, h('span', null, title), h('span', { class: 'count' }, count), icon('chevron')),
    isOpen && content());
}

/** Незанятые места дня — заштрихованы, с номером: лимит в три виден сразу. */
export const emptySlots = (taken) =>
  Array.from({ length: Math.max(0, DAY_LIMIT - taken) }, (_, i) =>
    h('li', { class: 'slot-empty', 'aria-hidden': 'true' }, h('span', { class: 'task-num' }, String(taken + i + 1))));

/* ── строка задачи ───────────────────────────────────────────────────── */

const sphereOf = (t) => store.getState().spheres.find((s) => s.id === t.sphereId);

function meta(t, { showSphere = true } = {}) {
  const parts = [];
  const sphere = sphereOf(t);
  if (showSphere) {
    parts.push(h('span', { class: 'meta-sphere' }, glyph(sphere ? sphere.glyph : 'inbox'), sphere ? sphere.name : 'Inbox'));
  }
  if (t.status === 'doing') parts.push('In progress');
  if (t.status === 'paused') parts.push('Paused');
  if (t.deadline && t.status !== 'done') {
    const due = dueLabel(t.deadline, ui.day);
    parts.push(h('span', { class: due.late ? 'is-late' : null }, due.text));
  }
  if (t.priority) parts.push(PRIORITIES.find(([v]) => v === t.priority)[1]);
  if (t.subtasks.length) parts.push(`${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}`);
  if (t.note) parts.push('Note');
  if (!parts.length) return null;
  return h('span', { class: 'task-meta' }, parts.map((p, i) => [i > 0 && h('span', { class: 'dot' }, '·'), p]));
}

export function checkButton(done, label, onclick, cls = '') {
  return h('button', {
    class: ['check', done && 'is-on', cls], type: 'button', 'aria-pressed': String(done), 'aria-label': label, onclick,
  }, icon('check'));
}

/**
 * Строка задачи. num — номер в дне (1–3); accent — задача №1 сегодня;
 * drag — номер служит ручкой перетаскивания.
 */
export function taskItem(t, opts = {}) {
  const expanded = ui.expanded === t.id;
  const done = t.status === 'done';
  return h('li', {
    class: ['task', done && 'is-done', t.status === 'paused' && 'is-paused', expanded && 'is-open', opts.cls],
    'data-id': t.id,
  },
    h('div', { class: 'task-row' },
      opts.num != null && h('span', {
        class: ['task-num', opts.accent && 'is-accent'],
        'data-drag': opts.drag ? '' : null,
        'aria-label': opts.drag ? `Position ${opts.num}, drag to reorder` : null,
      }, String(opts.num)),
      checkButton(done, done ? 'Mark as not done' : 'Mark as done', () => store.toggleDone(t.id)),
      // раскрытая: название правится прямо в строке, второй раз его не повторяем
      expanded
        ? [titleEditor(t), iconButton('close', 'Collapse', collapse, 'task-close')]
        : h('button', {
          class: 'task-main', type: 'button', 'aria-expanded': 'false',
          onclick: () => {
            ui.expanded = t.id;
            ui.confirm = null;
            rerender();
          },
        },
          h('span', { class: 'task-title' }, t.title),
          meta(t, opts))),
    expanded && taskCard(t));
}

function collapse() {
  ui.expanded = null;
  ui.confirm = null;
  rerender();
}

/* ── карточка задачи ─────────────────────────────────────────────────── */

function pills(options, current, onPick, label) {
  return h('div', { class: 'pills', role: 'group', 'aria-label': label },
    options.map(([value, text, g]) =>
      h('button', {
        class: ['pill', value === current && 'is-on'], type: 'button', 'aria-pressed': String(value === current),
        onclick: () => onPick(value === current ? null : value),
      }, g && glyph(g), text)));
}

const field = (label, ...content) =>
  h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), h('div', { class: 'field-body' }, content));

function titleEditor(t) {
  return autosize(h('textarea', {
    class: 'edit-title', rows: 1, 'aria-label': 'Title', 'data-key': `title-${t.id}`, value: t.title,
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
    oninput: liveSave((v) => v.trim() && store.updateTask(t.id, { title: v.trim() }, { silent: true })),
    onchange: (e) => {
      const v = e.target.value.trim();
      if (v) store.updateTask(t.id, { title: v });
      else e.target.value = t.title;
    },
  }));
}

/** Сохраняет набираемое без перерисовки — пропасть текст не должен, даже если приложение свернули. */
function liveSave(fn) {
  let timer;
  return (e) => {
    clearTimeout(timer);
    const v = e.target.value;
    timer = setTimeout(() => fn(v), 400);
  };
}

function taskCard(t) {
  const today = ui.day;
  const tomorrow = addDays(today, 1);
  const done = t.status === 'done';
  const planned = t.day === today ? 'today' : t.day === tomorrow ? 'tomorrow' : null;

  const note = autosize(h('textarea', {
    class: 'edit-note', rows: 2, placeholder: 'Note', 'aria-label': 'Note', 'data-key': `note-${t.id}`, value: t.note,
    oninput: liveSave((v) => store.updateTask(t.id, { note: v }, { silent: true })),
    onchange: (e) => store.updateTask(t.id, { note: e.target.value }),
  }));

  const spheres = [[null, 'Inbox', 'inbox'], ...activeSpheres(store.getState()).map((s) => [s.id, s.name, s.glyph])];

  return h('div', { class: 'card-edit' },
    !done && field('Plan', pills([['today', 'Today'], ['tomorrow', 'Tomorrow']], planned, (v) => {
      if (!v) store.unplanTask(t.id);
      else requestPlan(t, v === 'today' ? today : tomorrow);
    }, 'Plan')),
    field('Status', pills(STATUSES, t.status, (v) => v && store.setStatus(t.id, v), 'Status')),
    field('Sphere', h('div', { class: 'pills-scroll' },
      pills(spheres, t.sphereId ?? null, (v) => store.updateTask(t.id, { sphereId: v }), 'Sphere'))),
    field('Priority', pills(PRIORITIES, t.priority, (v) => store.updateTask(t.id, { priority: v }), 'Priority')),
    // поле даты прозрачное поверх пилюли: тап открывает системный выбор даты,
    // а видна дата в формате приложения, а не браузера
    field('Due',
      h('label', { class: 'date-wrap' },
        h('span', { class: 'pill' }, t.deadline ? fmtDay(t.deadline) : 'Set date'),
        h('input', {
          class: 'date', type: 'date', 'aria-label': 'Deadline', value: t.deadline ?? '',
          onclick: (e) => { try { e.target.showPicker?.(); } catch { /* уже открыт системой */ } },
          onchange: (e) => store.updateTask(t.id, { deadline: e.target.value || null }),
        })),
      t.deadline && iconButton('close', 'Clear deadline', () => store.updateTask(t.id, { deadline: null }))),
    field('Subtasks',
      t.subtasks.length > 0 && h('ul', { class: 'subs' }, t.subtasks.map((s) =>
        h('li', { class: ['sub', s.done && 'is-done'] },
          checkButton(s.done, s.done ? 'Mark subtask as not done' : 'Mark subtask as done',
            () => store.updateSubtask(t.id, s.id, { done: !s.done }), 'check-sm'),
          h('input', {
            class: 'sub-title', type: 'text', value: s.title, 'aria-label': 'Subtask', 'data-key': `sub-${s.id}`,
            onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
            onchange: (e) => {
              const v = e.target.value.trim();
              v ? store.updateSubtask(t.id, s.id, { title: v }) : store.deleteSubtask(t.id, s.id);
            },
          }),
          iconButton('close', 'Delete subtask', () => store.deleteSubtask(t.id, s.id))))),
      entry(`subadd-${t.id}`, 'Add subtask', (v) => store.addSubtask(t.id, v), { cls: 'entry-sm' })),
    note,
    h('div', { class: 'card-foot' },
      h('button', {
        class: ['pill', 'pill-action', ui.confirm === t.id && 'is-on'], type: 'button',
        onclick: () => {
          if (ui.confirm === t.id) {
            ui.confirm = null;
            ui.expanded = null;
            store.deleteTask(t.id);
            toast('Task deleted');
          } else {
            ui.confirm = t.id;
            rerender();
          }
        },
      }, ui.confirm === t.id ? 'Tap again to delete' : 'Delete'),
      h('button', { class: 'pill pill-action', type: 'button', onclick: collapse }, 'Close')));
}

/* ── день полон ──────────────────────────────────────────────────────── */

/**
 * Ставит задачу в день; если там уже три незавершённые — шторка
 * «заменить одну из трёх». Заменённая возвращается в общий список.
 */
export function requestPlan(t, day) {
  if (store.planTask(t.id, day)) return;
  const label = day === ui.day ? 'Today' : 'Tomorrow';
  openSheet(() => {
    const { open } = dayTasks(store.getState(), day);
    return [
      h('h2', { class: 'sheet-title' }, `${label} is full`),
      h('p', { class: 'sheet-text' }, `Three is the limit. Replace one with “${t.title}”?`),
      h('ol', { class: 'replace-list' }, open.map((x, i) =>
        h('li', null, h('button', {
          class: 'replace', type: 'button',
          onclick: () => {
            store.planTask(t.id, day, x.id);
            closeSheet();
            toast(`Planned for ${label.toLowerCase()}, ${fmtDay(day)}`);
          },
        }, h('span', { class: 'replace-num' }, String(i + 1)), h('span', { class: 'replace-title' }, x.title))))),
      h('button', { class: 'pill pill-action pill-wide', type: 'button', onclick: closeSheet }, 'Cancel'),
    ];
  });
}
