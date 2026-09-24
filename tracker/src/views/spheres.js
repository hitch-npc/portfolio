/**
 * «Сферы» — папки для задач. Список: глиф, название, число активных задач.
 * Порядок — перетаскиванием за ручку; «⋯» открывает шторку: имя, глиф,
 * архив. Архив задачи не удаляет, только убирает сферу с глаз.
 * Задачи без сферы живут во «Входящих».
 */
import { h, glyph, icon, entry, sortableGrid, openSheet, closeSheet, toast } from '../ui.js';
import { GLYPHS, activeSpheres, archivedSpheres, sphereCounts, sphereTasks } from '../logic.js';
import * as store from '../store.js';
import { header, backLink, iconButton, pillButton, foldout, taskItem } from './common.js';

/**
 * Плитка сферы: глиф в кружке, «⋯» и ручка перетаскивания по углам, внизу —
 * название и крупное число открытых задач. Ссылка лежит под всей плиткой,
 * кнопки — поверх неё (кнопка внутри ссылки была бы невалидной разметкой).
 */
function sphereTile(s, count, { drag = true } = {}) {
  const n = count ?? 0;
  return h('li', { class: ['tile', 'sphere-tile', s.archived && 'is-archived'], 'data-id': s.id },
    h('a', { class: 'tile-cover', href: `#/spheres/${s.id}`, 'aria-label': `${s.name}, ${n} open` }),
    h('span', { class: 'chip' }, glyph(s.glyph)),
    iconButton('more', `Edit ${s.name}`, () => editSphere(s.id), 'tile-more'),
    h('span', { class: 'tile-name' }, s.name),
    h('span', { class: ['tile-count', !n && 'is-zero'] }, n),
    drag && h('span', { class: 'drag', 'data-drag': '', 'aria-label': `Drag ${s.name} to reorder` }, icon('drag')));
}

function inboxTile(n) {
  return h('li', { class: 'tile sphere-tile tile-inbox' },
    h('a', { class: 'tile-cover', href: '#/spheres/inbox', 'aria-label': `Inbox, ${n} open` }),
    h('span', { class: 'chip' }, glyph('inbox')),
    h('span', { class: 'tile-name' }, 'Inbox'),
    h('span', { class: ['tile-count', !n && 'is-zero'] }, n));
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

  // открытые во «Входящих» и активных сферах; архив не считается — его задачи скрыты
  const open = [null, ...active.map((s) => s.id)].reduce((n, id) => n + (counts.get(id) ?? 0), 0);

  // «Входящие» — первая плитка, но без data-id: её не перетащить и перед ней не встать
  const grid = sortableGrid(h('ul', { class: 'tiles' },
    inboxTile(counts.get(null) ?? 0),
    active.map((s) => sphereTile(s, counts.get(s.id)))),
  (ids) => store.reorderSpheres(ids));

  return h('section', { class: 'screen screen-spheres' },
    header('Spheres', `${open} open`),
    grid,
    entry('sphere-new', 'New sphere', (name) => store.createSphere(name), { cls: 'entry-card' }),
    archived.length > 0 && foldout('archived', 'Archived', archived.length, () =>
      h('ul', { class: 'tiles' }, archived.map((s) => sphereTile(s, counts.get(s.id), { drag: false })))));
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

