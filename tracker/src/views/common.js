/**
 * Общее для экранов: шапка, строка задачи с раскрывающейся карточкой,
 * шторка «день полон — заменить одну из задач», выбор нескольких задач.
 */
import { h, icon, glyph, autosize, entry, pickerInput, openSheet, closeSheet, toast, countUp, removeRow, haptic } from '../ui.js';
import { addDays, dayLabel, dueLabel, fmtDay } from '../dates.js';
import { PRIORITIES, REPEATS, STATUSES, activeSpheres, dayLimit, dayTasks } from '../logic.js';
import * as store from '../store.js';
import { dateSheet, sphereSheet } from './pickers.js';
import { calendarSheet } from './calendar.js';
import { filesField } from './files.js';

/** Состояние интерфейса, которого нет в данных. */
export const ui = {
  day: '', // сегодня, 'YYYY-MM-DD'; обновляет app.render
  tomorrow: '',
  expanded: null, // id раскрытой задачи
  open: new Set(), // раскрытые свёрнутые блоки: 'done:<sphere>', 'archived'
  confirm: null, // id, ждущий второго тапа «удалить»
  popped: null, // id задачи, которую только что отметили: анимация галочки
  entering: false, // экран только что открыт: анимации входа
  select: null, // выбор нескольких задач: { scope, ids: Set } или null
  query: '', // поиск на экране сфер
};

/** Перерисовка без изменения данных (раскрыть карточку, свернуть блок). Ставит app.js. */
export let rerender = () => {};
export const setRerender = (fn) => (rerender = fn);

/** Заголовок в две строки одного кегля: название чернилами, пояснение — приглушённо. */
export function header(title, sub, ...actions) {
  return h('header', { class: 'head' },
    h('h1', { class: 'title' },
      h('span', { class: 'title-main' }, title),
      sub != null && h('span', { class: 'title-sub' }, sub)),
    actions.length > 0 && h('div', { class: 'head-actions' }, actions));
}

export const backLink = (href, label) => h('a', { class: 'back', href }, icon('back'), label);

export function iconButton(name, label, onclick, cls = '', size = 24) {
  return h('button', { class: ['icon-btn', cls], type: 'button', 'aria-label': label, title: label, onclick }, icon(name, size));
}

/** Кнопка-пилюля: иконка в кружке + подпись. */
export function pillButton(name, label, onclick, cls = '') {
  return h('button', { class: ['pill', 'pill-action', name && 'has-chip', cls], type: 'button', onclick },
    name && h('span', { class: 'chip' }, icon(name, 20)), label);
}

/** Поле графика: точечная сетка и уголки-метки, как на чертеже. */
export const plot = (...content) =>
  h('div', { class: 'plot' }, content,
    ['tl', 'tr', 'bl', 'br'].map((c) => h('span', { class: `mark mark-${c}`, 'aria-hidden': 'true' })));

/** Строка «подпись — большое число» на одной базовой линии. */
export function stat(label, value, tail, cls = '') {
  const v = h('span', { class: ['stat-value', cls] }, String(value), tail && h('span', { class: 'muted' }, tail));
  if (ui.entering && typeof value === 'number') countUp(v, value);
  return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), v);
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
    }, h('span', null, title), h('span', { class: 'count' }, count), icon('chevron', 20)),
    isOpen && content());
}

/** Незанятые места дня — заштрихованы, с номером: лимит дня виден сразу. Без лимита мест нет. */
export const emptySlots = (taken) =>
  Array.from({ length: Math.max(0, dayLimit(store.getState()) - taken) }, (_, i) =>
    h('li', { class: 'slot-empty', 'aria-hidden': 'true' }, h('span', { class: 'task-num' }, String(taken + i + 1))));

/* ── строка задачи ───────────────────────────────────────────────────── */

const sphereOf = (t) => store.getState().spheres.find((s) => s.id === t.sphereId);

/**
 * Подпись под названием — коротко: сфера, день и время, срок, «High»,
 * подзадачи, вложения. Остальное — в карточке. inDay — строка в списке
 * своего дня: день не подписываем, время — да.
 */
function meta(t, { showSphere = true, inDay = false } = {}) {
  const parts = [];
  const sphere = sphereOf(t);
  if (showSphere) {
    parts.push(h('span', { class: 'meta-sphere', 'data-sc': sphere?.color }, glyph(sphere ? sphere.glyph : 'inbox'), sphere ? sphere.name : 'Inbox'));
  }
  if (t.day && t.status !== 'done') {
    const when = [!inDay && dayLabel(t.day, ui.day), t.time].filter(Boolean).join(' ');
    if (when || t.repeat) parts.push(h('span', { class: 'meta-when' }, when, t.repeat && icon('repeat')));
  }
  if (t.status === 'doing') parts.push('In progress');
  if (t.status === 'paused') parts.push('Paused');
  if (t.deadline && t.status !== 'done') {
    const due = dueLabel(t.deadline, ui.day);
    parts.push(h('span', { class: due.late ? 'is-late' : null }, due.text));
  }
  if (t.priority === 'high') parts.push('High');
  if (t.subtasks.length) parts.push(`${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}`);
  const files = store.filesOf(t.id).length;
  if (files) parts.push(h('span', { class: 'meta-when' }, icon('clip'), String(files)));
  if (!parts.length) return null;
  return h('span', { class: 'task-meta' }, parts.map((p, i) => [i > 0 && h('span', { class: 'dot' }, '·'), p]));
}

export function checkButton(done, label, onclick, cls = '') {
  return h('button', {
    class: ['check', done && 'is-on', cls], type: 'button', 'aria-pressed': String(done), 'aria-label': label, onclick,
  }, icon('check', cls.includes('check-sm') ? 16 : 20));
}

/** Галочка, которую только что поставили: у неё короткая анимация. Повтор — подсказка, когда следующий. */
function toggle(t) {
  haptic();
  ui.popped = t.status === 'done' ? null : t.id;
  const next = store.toggleDone(t.id);
  if (next) toast(`Repeats — next ${dayLabel(next.day, ui.day)}`);
  setTimeout(() => { if (ui.popped === t.id) ui.popped = null; }, 600);
}

/* ── выбор нескольких задач ──────────────────────────────────────────── */

export const selecting = (scope) => ui.select?.scope === scope;

export function startSelect(scope) {
  ui.select = { scope, ids: new Set() };
  ui.expanded = null;
  rerender();
}

export function endSelect() {
  ui.select = null;
  ui.confirm = null;
  rerender();
}

function toggleSelected(id) {
  const ids = ui.select.ids;
  ids.has(id) ? ids.delete(id) : ids.add(id);
  ui.confirm = null;
  rerender();
}

/** Строка в режиме выбора: кружок слева, тап по строке — выбрать. */
function selectItem(t, opts) {
  const on = ui.select.ids.has(t.id);
  return h('li', { class: ['task', 'is-selectable', on && 'is-selected', t.status === 'done' && 'is-done'], 'data-id': t.id },
    h('button', {
      class: 'task-row', type: 'button', 'aria-pressed': String(on), onclick: () => toggleSelected(t.id),
    },
      h('span', { class: ['select-mark', on && 'is-on'], 'aria-hidden': 'true' }, on && icon('check', 20)),
      h('span', { class: 'task-main' }, h('span', { class: 'task-title' }, t.title), meta(t, opts))));
}

/**
 * Панель над вкладками: что сделать с выбранными. all — id всех задач
 * списка (для «Select all»).
 */
export function selectBar(all) {
  const ids = [...ui.select.ids];
  const n = ids.length;
  const done = (msg) => {
    toast(msg);
    endSelect();
  };
  const plan = (day) => {
    const placed = store.planMany(ids, day);
    const where = dayLabel(day, ui.day);
    done(placed === n ? `${n} → ${where}` : `${placed} of ${n} fit — ${where} is full`);
  };
  const act = (name, label, onclick, cls = '') =>
    h('button', { class: ['bar-btn', cls], type: 'button', disabled: !n, onclick }, icon(name, 20), h('span', null, label));
  const deleting = ui.confirm === 'bulk-delete';

  return h('div', { class: 'select-bar', role: 'toolbar', 'aria-label': 'Selected tasks' },
    h('div', { class: 'select-bar-head' },
      h('span', { class: 'select-count' }, n ? `${n} selected` : 'Select tasks'),
      h('button', {
        class: 'pill', type: 'button',
        onclick: () => {
          ui.select.ids = new Set(n === all.length ? [] : all);
          rerender();
        },
      }, n === all.length && n ? 'None' : 'All'),
      h('button', { class: 'pill is-on', type: 'button', onclick: endSelect }, 'Done')),
    h('div', { class: 'select-actions' },
      act('check', 'Complete', () => { store.completeMany(ids); done(`${n} done`); }),
      act('calendar', 'Today', () => plan(ui.day)),
      act('calendar', 'Tomorrow', () => plan(addDays(ui.day, 1))),
      act('calendar', 'Date', () => dateSheet({}, (v) => {
        if (!v.day) {
          store.planMany(ids, null);
          done(`${n} without a date`);
          return;
        }
        plan(v.day);
        store.updateMany(ids.filter((id) => store.getState().tasks.find((t) => t.id === id)?.day === v.day), { time: v.time, repeat: v.repeat });
      }, { title: `${n} tasks`, full: 'fit' })),
      act('flag', 'Priority', () => openSheet(() => [
        h('h2', { class: 'sheet-title' }, 'Priority'),
        h('div', { class: 'sheet-options' }, [...PRIORITIES, [null, 'None']].map(([v, text]) =>
          h('button', {
            class: 'replace', type: 'button',
            onclick: () => { closeSheet(); store.updateMany(ids, { priority: v }); done(`Priority: ${text}`); },
          }, h('span', { class: 'replace-title' }, text)))),
        h('button', { class: 'pill pill-action pill-wide', type: 'button', onclick: closeSheet }, 'Cancel'),
      ])),
      act('next', 'Move', () => sphereSheet((sphereId) => {
        store.updateMany(ids, { sphereId });
        const s = store.getState().spheres.find((x) => x.id === sphereId);
        done(`${n} → ${s ? s.name : 'Inbox'}`);
      }, `Move ${n}`)),
      act('close', deleting ? 'Sure?' : 'Delete', () => {
        if (!deleting) {
          ui.confirm = 'bulk-delete';
          rerender();
          return;
        }
        store.deleteTasks(ids);
        done(`${n} deleted`);
      }, deleting ? 'is-on' : '')));
}

/**
 * Строка задачи: номер (в дне), название с подписью, галочка справа — под большой палец.
 * num — номер в дне (1–3); accent — задача №1 сегодня; drag — номер служит ручкой.
 */
export function taskItem(t, opts = {}) {
  if (ui.select) return selectItem(t, opts);
  const expanded = ui.expanded === t.id;
  const done = t.status === 'done';
  // смахивание влево открывает Delete — как в Plan; раскрытую карточку не смахивают
  return h('li', {
    class: ['task', done && 'is-done', t.status === 'paused' && 'is-paused', expanded && 'is-open', ui.popped === t.id && 'is-pop', opts.cls],
    'data-id': t.id, 'data-swipe': expanded ? null : '',
  },
    !expanded && h('button', {
      class: 'swipe-action', type: 'button', 'aria-label': `Delete “${t.title}”`,
      onclick: (e) => removeRow(e.currentTarget.closest('li'), () => {
        store.deleteTask(t.id);
        toast('Task deleted');
      }),
    }, icon('close', 20), h('span', null, 'Delete')),
    h('div', { class: 'swipe-body' }, h('div', { class: 'task-row' },
      opts.num != null && h('span', {
        class: ['task-num', opts.accent && 'is-accent'],
        'data-drag': opts.drag ? '' : null,
        'aria-label': opts.drag ? `Position ${opts.num}, drag to reorder` : null,
      }, String(opts.num)),
      // раскрытая: название правится прямо в строке, второй раз его не повторяем
      expanded
        ? [titleEditor(t), iconButton('close', 'Collapse', collapse, 'task-close')]
        : [
          h('button', {
            class: 'task-main', type: 'button', 'aria-expanded': 'false',
            onclick: () => {
              ui.expanded = t.id;
              ui.confirm = null;
              rerender();
            },
          },
            h('span', { class: 'task-title' }, t.title),
            meta(t, opts)),
          checkButton(done, done ? 'Mark as not done' : 'Mark as done', () => toggle(t), ui.popped === t.id ? 'is-pop' : ''),
        ]),
    expanded && taskCard(t)));
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
  const other = t.day && t.day !== today && t.day !== tomorrow;
  const extra = [other && dayLabel(t.day, today), t.time, t.repeat && REPEATS.find(([v]) => v === t.repeat)?.[1]]
    .filter(Boolean).join(' · ');

  const note = autosize(h('textarea', {
    class: 'edit-note', rows: 2, placeholder: 'Note', 'aria-label': 'Note', 'data-key': `note-${t.id}`, value: t.note,
    oninput: liveSave((v) => store.updateTask(t.id, { note: v }, { silent: true })),
    onchange: (e) => store.updateTask(t.id, { note: e.target.value }),
  }));

  const spheres = [[null, 'Inbox', 'inbox'], ...activeSpheres(store.getState()).map((s) => [s.id, s.name, s.glyph])];

  return h('div', { class: 'card-edit' },
    !done && field('Date',
      pills([[today, 'Today'], [tomorrow, 'Tomorrow']], t.day, (v) => (v ? requestPlan(t, v) : store.unplanTask(t.id)), 'Date'),
      h('button', {
        class: ['pill', other && 'is-on'], type: 'button', 'aria-label': 'Pick a date, time or repeat',
        onclick: () => dateSheet(t, (v) => requestPlan(t, v.day, { time: v.time, repeat: v.repeat }), {
          current: t.day, onReminder: () => calendarSheet(t.id),
        }),
      }, icon('calendar', 20), extra || null)),
    !done && t.day && field('Remind',
      h('button', { class: 'pill', type: 'button', onclick: () => calendarSheet(t.id) }, icon('bell', 20), 'Add to Calendar')),
    field('Status', pills(STATUSES, t.status, (v) => v && store.setStatus(t.id, v), 'Status')),
    field('Sphere', h('div', { class: 'pills-scroll' },
      pills(spheres, t.sphereId ?? null, (v) => store.updateTask(t.id, { sphereId: v }), 'Sphere'))),
    field('Priority', pills(PRIORITIES, t.priority, (v) => store.updateTask(t.id, { priority: v }), 'Priority')),
    // поле даты прозрачное поверх пилюли: тап открывает системный выбор даты,
    // а видна дата в формате приложения, а не браузера
    field('Deadline',
      h('label', { class: 'date-wrap' },
        h('span', { class: 'pill' }, t.deadline ? fmtDay(t.deadline) : 'Set date'),
        pickerInput({ class: 'date', type: 'date', 'aria-label': 'Deadline', value: t.deadline ?? '' },
          (v) => store.updateTask(t.id, { deadline: v }))),
      t.deadline && iconButton('close', 'Clear deadline', () => store.updateTask(t.id, { deadline: null }), '', 20)),
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
          iconButton('close', 'Delete subtask', () => store.deleteSubtask(t.id, s.id), '', 18)))),
      entry(`subadd-${t.id}`, 'Add subtask', (v) => store.addSubtask(t.id, v), { cls: 'entry-sm' })),
    field('Files', filesField(t)),
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
 * Ставит задачу в день (extra — время и повтор); если день полон — шторка
 * «заменить одну из задач дня». Заменённая возвращается в общий список.
 * day = null снимает дату.
 */
export function requestPlan(t, day, extra = {}) {
  if (store.planTask(t.id, day, null, extra)) return;
  const label = dayLabel(day, ui.day);
  const limit = dayLimit(store.getState());
  openSheet(() => {
    const { open } = dayTasks(store.getState(), day);
    return [
      h('h2', { class: 'sheet-title' }, `${label} is full`),
      h('p', { class: 'sheet-text' }, `${limit} a day is the limit (Settings). Replace one with “${t.title}”?`),
      h('ol', { class: 'replace-list' }, open.map((x, i) =>
        h('li', null, h('button', {
          class: 'replace', type: 'button',
          onclick: () => {
            store.planTask(t.id, day, x.id, extra);
            closeSheet();
            toast(`Planned for ${fmtDay(day)}`);
          },
        }, h('span', { class: 'replace-num' }, String(i + 1)), h('span', { class: 'replace-title' }, x.title))))),
      h('button', { class: 'pill pill-action pill-wide', type: 'button', onclick: closeSheet }, 'Cancel'),
    ];
  });
}
