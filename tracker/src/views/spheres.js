/**
 * «Сферы» — папки для задач. Список: глиф, название, число активных задач.
 * Порядок — перетаскиванием за ручку; «⋯» открывает шторку: имя, глиф,
 * архив. Архив задачи не удаляет, только убирает сферу с глаз.
 * Задачи без сферы живут во «Входящих».
 */
import { h, glyph, icon, entry, sortable, openSheet, closeSheet, toast } from '../ui.js';
import { GLYPHS, activeSpheres, archivedSpheres, sphereCounts, sphereTasks } from '../logic.js';
import * as store from '../store.js';
import { header, backLink, iconButton, pillButton, foldout, taskItem } from './common.js';

function sphereRow(s, count, { drag = true } = {}) {
  return h('li', { class: 'sphere', 'data-id': s.id },
    h('a', { class: 'sphere-main', href: `#/spheres/${s.id}` },
      glyph(s.glyph),
      h('span', { class: 'sphere-name' }, s.name),
      h('span', { class: ['sphere-count', !count && 'is-zero'] }, count ?? 0)),
    iconButton('more', `Edit ${s.name}`, () => editSphere(s.id)),
    drag && h('span', { class: 'drag', 'data-drag': '', 'aria-label': `Drag ${s.name} to reorder` }, icon('drag')));
}

export function editSphere(id) {
  openSheet(() => {
    const s = store.getState().spheres.find((x) => x.id === id);
    if (!s) return [];
    return [
      h('div', { class: 'sheet-head' },
        glyph(s.glyph),
        h('input', {
          class: 'sheet-input', type: 'text', value: s.name, 'aria-label': 'Sphere name', 'data-key': `sphere-name-${s.id}`,
          onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
          onchange: (e) => {
            const v = e.target.value.trim();
            if (v) store.updateSphere(s.id, { name: v });
            else e.target.value = s.name;
          },
        })),
      h('div', { class: 'glyph-grid', role: 'group', 'aria-label': 'Glyph' }, GLYPHS.map((g) =>
        h('button', {
          class: ['glyph-pick', s.glyph === g && 'is-on'], type: 'button', 'aria-label': g, 'aria-pressed': String(s.glyph === g),
          onclick: () => store.updateSphere(s.id, { glyph: g }),
        }, glyph(g)))),
      h('div', { class: 'sheet-actions' },
        s.archived
          ? pillButton(null, 'Restore', () => { store.updateSphere(s.id, { archived: false }); closeSheet(); toast(`${s.name} restored`); })
          : pillButton(null, 'Archive', () => {
            store.updateSphere(s.id, { archived: true });
            closeSheet();
            toast(`${s.name} archived — tasks kept`);
          }),
        pillButton(null, 'Done', closeSheet, 'is-on')),
    ];
  });
}

export function spheresView() {
  const st = store.getState();
  const counts = sphereCounts(st);
  const active = activeSpheres(st);
  const archived = archivedSpheres(st);

  const inbox = h('ul', { class: 'spheres' },
    h('li', { class: 'sphere' },
      h('a', { class: 'sphere-main', href: '#/spheres/inbox' },
        glyph('inbox'),
        h('span', { class: 'sphere-name' }, 'Inbox'),
        h('span', { class: ['sphere-count', !counts.get(null) && 'is-zero'] }, counts.get(null) ?? 0))));

  const list = sortable(h('ul', { class: 'spheres' }, active.map((s) => sphereRow(s, counts.get(s.id)))),
    (ids) => store.reorderSpheres(ids));

  return h('section', { class: 'screen screen-spheres' },
    header('Spheres'),
    inbox,
    list,
    entry('sphere-new', 'New sphere', (name) => store.createSphere(name)),
    archived.length > 0 && foldout('archived', 'Archived', archived.length, () =>
      h('ul', { class: 'spheres spheres-archived' }, archived.map((s) => sphereRow(s, counts.get(s.id), { drag: false })))));
}

/** Одна сфера (или «Входящие»): добавить сюда, активные сверху, готовые свёрнуты. */
export function sphereView(id) {
  const st = store.getState();
  const isInbox = id === 'inbox';
  const s = isInbox ? null : st.spheres.find((x) => x.id === id);
  if (!isInbox && !s) return h('section', { class: 'screen' }, backLink('#/spheres', 'Spheres'), h('p', { class: 'hint' }, 'This sphere no longer exists.'));

  const { open, done } = sphereTasks(st, isInbox ? null : s.id);
  const name = isInbox ? 'Inbox' : s.name;

  return h('section', { class: 'screen screen-sphere' },
    backLink('#/spheres', 'Spheres'),
    header(h('span', { class: 'title-glyph' }, glyph(isInbox ? 'inbox' : s.glyph), name),
      s?.archived ? 'Archived' : `${open.filter((t) => t.status !== 'paused').length} active`,
      !isInbox && iconButton('more', `Edit ${name}`, () => editSphere(s.id))),
    entry(`add-${id}`, `Add to ${name}`, (title) => store.createTask(title, { sphereId: isInbox ? null : s.id }), { cls: 'entry-card' }),
    open.length
      ? h('ul', { class: 'tasks' }, open.map((t) => taskItem(t, { showSphere: false })))
      : h('p', { class: 'hint' }, 'No open tasks here.'),
    done.length > 0 && foldout(`done:${id}`, 'Done', done.length, () =>
      h('ul', { class: 'tasks' }, done.map((t) => taskItem(t, { showSphere: false })))));
}

