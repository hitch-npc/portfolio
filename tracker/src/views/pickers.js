/**
 * Ввод и выбор: поле новой задачи с чипами (сфера, дата, приоритет),
 * всплывающее меню и шторка даты — быстрые дни, дата, время, повтор.
 */
import { h, icon, glyph, sectionIcon, toast, openSheet, closeSheet, renderSheet, focusEnd, prioIcon } from '../ui.js';
import { dayLabel, fmtLong, fmtShort, fmtWeekday, addDays, nextWeek } from '../dates.js';
import { PRIORITIES, REPEATS, activeSpheres, dayLimit, isDayFull } from '../logic.js';
import * as store from '../store.js';
import { ui } from './common.js';

/* ── всплывающее меню ────────────────────────────────────────────────── */

let menuEl = null;

function closeMenu() {
  menuEl?.remove();
  menuEl = null;
  document.removeEventListener('pointerdown', outside, true);
}

function outside(e) {
  if (menuEl && !menuEl.contains(e.target) && !e.target.closest?.('[data-menu-anchor]')) closeMenu();
}

/* кнопка не забирает фокус у поля ввода: клавиатура остаётся на месте */
const keep = (e) => e.preventDefault();

/**
 * Меню под якорем, внутри host (position: relative). items — [value, label, mark, on];
 * mark — глиф сферы или имя иконки. Повторный тап по якорю закрывает меню.
 */
export function menu(host, items, onPick, label) {
  const again = menuEl && menuEl.parentElement === host && menuEl.dataset.label === label;
  closeMenu();
  if (again) return;
  menuEl = h('div', { class: 'menu', role: 'menu', 'aria-label': label, 'data-label': label },
    items.map(([value, text, mark, on]) =>
      h('button', {
        class: ['menu-item', on && 'is-on'], type: 'button', role: 'menuitemradio', 'aria-checked': String(Boolean(on)),
        onpointerdown: keep, onmousedown: keep,
        onclick: () => { closeMenu(); onPick(value); },
      },
        h('span', { class: 'menu-check' }, on && icon('check', 20)),
        h('span', { class: 'menu-mark' }, mark && (mark.startsWith('icon:') ? icon(mark.slice(5), 20) : glyph(mark))),
        h('span', null, text))));
  host.append(menuEl);
  place(menuEl, host);
  document.addEventListener('pointerdown', outside, true);
}

/**
 * Меню — там, где его видно целиком: под якорем, а если снизу клавиатура или
 * панель вкладок — над всем полем (не поверх набираемого текста). Видимая
 * часть экрана — по visualViewport: клавиатура iOS страницу не сжимает.
 */
function place(el, host) {
  const vv = globalThis.visualViewport;
  const nav = document.getElementById('nav')?.getBoundingClientRect().top ?? innerHeight;
  const bottom = Math.min(vv ? vv.offsetTop + vv.height : innerHeight, nav) - 8;
  const top = (vv?.offsetTop ?? 0) + 8;
  const below = bottom - el.getBoundingClientRect().top;
  const above = host.getBoundingClientRect().top - 6 - top;
  const up = el.scrollHeight > below && above > below;
  el.classList.toggle('is-up', up);
  el.style.maxHeight = `${Math.max(120, Math.floor(up ? above : below))}px`;
}

const sphereItems = (current) => [
  [null, 'Inbox', 'inbox', current == null],
  ...activeSpheres(store.getState()).map((s) => [s.id, s.name, s.glyph, current === s.id]),
];

/* ── подпись даты ────────────────────────────────────────────────────── */

const repeatLabel = (r) => REPEATS.find(([v]) => v === r)?.[1];

/** «Today», «Fri 2 Oct · 09:00 · Every week» — то, что видно на чипе и в карточке. */
export function whenLabel({ day, time, repeat }, today = ui.day) {
  if (!day) return null;
  return [dayLabel(day, today), time, repeat && repeat !== 'none' && repeatLabel(repeat)].filter(Boolean).join(' · ');
}

/* ── шторка даты ─────────────────────────────────────────────────────── */

/** Кружок-переключатель, как в настройках телефона. */
function switcher(on, label, onToggle, disabled = false) {
  return h('button', {
    class: ['switch', on && 'is-on'], type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': label,
    disabled, onclick: onToggle,
  }, h('span', { class: 'switch-knob' }));
}

/** Системный выбор (дата, время, список) прозрачным слоем поверх пилюли: видно подпись приложения. */
function overlay(pill, input) {
  return h('label', { class: 'date-wrap' }, pill, input);
}

const openPicker = (e) => {
  try {
    e.target.showPicker?.();
  } catch {
    /* уже открыт системой */
  }
};

/* что будет, если выбранный день полон: зависит от того, кто открыл шторку */
const FULL = {
  replace: 'Done will ask which task to replace.',
  drop: 'The new task will be saved without a date.',
  fit: 'Only the tasks that fit will move.',
};

/**
 * Шторка «Дата»: быстрые дни, дата, время, повтор. Меняется черновик;
 * «Done» отдаёт его onDone, «Cancel» — ничего не меняет.
 * current — день, где задача уже стоит: он не считается переполненным.
 * full — что будет с полным днём: 'replace' | 'drop' | 'fit'.
 * onReminder — есть у существующей задачи: строка Reminder применяет дату
 * и открывает шторку Календаря (если день встал — полный день спросит замену).
 */
export function dateSheet(value, onDone, { current = null, title = 'Date', full: whenFull = 'replace', onReminder = null } = {}) {
  const draft = { day: value.day ?? null, time: value.time ?? null, repeat: value.repeat ?? null };
  const set = (patch) => {
    Object.assign(draft, patch);
    if (!draft.day) Object.assign(draft, { time: null, repeat: null });
    renderSheet();
  };

  openSheet(() => {
    const st = store.getState();
    const today = ui.day;
    const quick = [
      ['Today', today, sectionIcon('today')],
      ['Tomorrow', addDays(today, 1), sectionIcon('plan')],
      ['Next week', nextWeek(today), icon('next')],
      ['No date', null, icon('close')],
    ];
    const full = draft.day && draft.day !== current && isDayFull(st, draft.day);
    const limit = dayLimit(st);

    return [
      h('div', { class: 'sheet-bar' },
        h('button', { class: 'pill pill-action', type: 'button', onclick: closeSheet }, 'Cancel'),
        h('h2', { class: 'sheet-bar-title' }, title),
        h('button', {
          class: 'pill pill-action is-on', type: 'button',
          onclick: () => { closeSheet(); onDone({ ...draft }); },
        }, 'Done')),

      h('div', { class: 'quick', role: 'group', 'aria-label': 'Quick dates' }, quick.map(([label, day, mark]) => {
        const on = draft.day === day;
        const sub = day && (isDayFull(st, day) && day !== current ? 'Full' : day === today ? fmtWeekday(day) : `${fmtWeekday(day)} ${fmtShort(day).split(' ')[0]}`);
        return h('button', {
          class: ['quick-pick', on && 'is-on'], type: 'button', 'aria-pressed': String(on),
          onclick: () => set({ day }),
        }, mark, h('span', { class: 'quick-label' }, label), h('span', { class: 'quick-sub' }, sub || '—'));
      })),

      h('div', { class: 'rows' },
        h('div', { class: 'row' },
          icon('calendar'), h('span', { class: 'row-label' }, 'Date'),
          overlay(h('span', { class: ['pill', draft.day && 'is-on'] }, draft.day ? fmtLong(draft.day) : 'None'),
            h('input', {
              class: 'date', type: 'date', 'aria-label': 'Date', value: draft.day ?? '',
              onclick: openPicker, onchange: (e) => set({ day: e.target.value || null }),
            }))),
        h('div', { class: ['row', !draft.day && 'is-off'] },
          icon('clock'), h('span', { class: 'row-label' }, 'Time'),
          draft.time && overlay(h('span', { class: 'pill' }, draft.time),
            h('input', {
              class: 'date', type: 'time', 'aria-label': 'Time', value: draft.time,
              onclick: openPicker, onchange: (e) => set({ time: e.target.value || null }),
            })),
          switcher(Boolean(draft.time), 'Time', () => set({ time: draft.time ? null : '09:00' }), !draft.day)),
        h('div', { class: 'row' },
          icon('repeat'), h('span', { class: 'row-label' }, 'Repeat'),
          overlay(h('span', { class: 'pill' }, repeatLabel(draft.repeat ?? 'none'), icon('updown', 20)),
            h('select', {
              class: 'date', 'aria-label': 'Repeat',
              onchange: (e) => {
                const r = e.target.value === 'none' ? null : e.target.value;
                // повтор без даты не бывает: без дня ставим на сегодня
                set({ repeat: r, day: r && !draft.day ? today : draft.day });
              },
            }, REPEATS.map(([v, text]) => h('option', { value: v, selected: (draft.repeat ?? 'none') === v }, text))))),
        onReminder && h('div', { class: ['row', !draft.day && 'is-off'] },
          icon('bell'), h('span', { class: 'row-label' }, 'Reminder'),
          h('button', {
            class: 'pill', type: 'button', disabled: !draft.day,
            onclick: () => {
              closeSheet();
              onDone({ ...draft });
              // день мог не встать (полный — открыта шторка замены): тогда Календарь не открываем
              if (value.id && store.getState().tasks.find((x) => x.id === value.id)?.day === draft.day) onReminder();
            },
          }, 'Calendar', icon('chevron', 20)))),

      full && h('p', { class: 'sheet-note' },
        `${dayLabel(draft.day, today)} is full — ${limit} of ${limit} planned. ${FULL[whenFull]}`),
    ];
  });
}

/* ── шторка «сфера» (для нескольких задач сразу) ─────────────────────── */

export function sphereSheet(onPick, title = 'Move to') {
  openSheet(() => [
    h('h2', { class: 'sheet-title' }, title),
    h('div', { class: 'sheet-options' }, sphereItems(undefined).map(([id, name, g]) =>
      h('button', { class: 'replace', type: 'button', onclick: () => { closeSheet(); onPick(id); } },
        glyph(g), h('span', { class: 'replace-title' }, name)))),
    h('button', { class: 'pill pill-action pill-wide', type: 'button', onclick: closeSheet }, 'Cancel'),
  ]);
}

/* ── поле новой задачи ───────────────────────────────────────────────── */

const drafts = new Map();

/** Забыть черновик поля: сменилась дата по умолчанию. */
export const dropDraft = (key) => drafts.delete(key);

/**
 * Поле новой задачи: название, под ним чипы — сфера, дата, приоритет —
 * и круглая кнопка «добавить». Enter тоже добавляет. После добавления
 * поле пустеет и остаётся в фокусе; сфера сохраняется, дата — по умолчанию.
 *
 * opts: { sphereId — сфера по умолчанию, day — 'today' | null, placeholder }.
 * Возвращает элемент с методом refresh() — перерисовать чипы.
 */
const PRIO_LEVEL = { low: 1, medium: 2, high: 3 };
const PRIO_CHOICES = [[null, 'None', 0], ['low', 'Low', 1], ['medium', 'Medium', 2], ['high', 'High', 3]];

export function composer(key, { sphereId = null, day = null, placeholder = 'Add a task' } = {}) {
  const fresh = () => ({ day: day === 'today' ? ui.day : day, time: null, repeat: null, priority: null, prioOpen: false });
  let d = drafts.get(key);
  if (!d) {
    d = { title: '', sphereId, ...fresh() };
    drafts.set(key, d);
  }

  const input = h('input', {
    class: 'compose-input', type: 'text', placeholder, 'aria-label': placeholder, autocomplete: 'off',
    autocapitalize: 'sentences', enterkeyhint: 'done', 'data-key': key, value: d.title,
    oninput: (e) => {
      d.title = e.target.value;
      send.classList.toggle('is-ready', Boolean(d.title.trim()));
    },
  });
  const chips = h('div', { class: 'compose-chips' });
  const send = h('button', {
    class: ['compose-send', d.title.trim() && 'is-ready'], type: 'submit', 'aria-label': 'Add task',
    onpointerdown: keep, onmousedown: keep,
  }, icon('send', 20));

  const form = h('form', {
    class: 'compose',
    onsubmit: (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      submit(title);
      input.focus({ preventScroll: true });
    },
  }, input, h('div', { class: 'compose-bar' }, chips, send));

  function submit(title) {
    const st = store.getState();
    const { sphereId: sid, time, repeat, priority } = d;
    let planned = d.day;
    if (planned && isDayFull(st, planned)) {
      toast(`${dayLabel(planned, ui.day)} is full — saved without a date`);
      planned = null;
    } else {
      toast(`Added to ${planned ? dayLabel(planned, ui.day) : st.spheres.find((s) => s.id === sid)?.name ?? 'Inbox'}`);
    }
    Object.assign(d, { title: '', ...fresh() });
    input.value = '';
    send.classList.remove('is-ready');
    store.createTask(title, {
      sphereId: sid, priority, day: planned, time: planned ? time : null, repeat: planned ? repeat : null,
    });
  }

  function chip(content, label, onclick, on = false) {
    return h('button', {
      class: ['compose-chip', on && 'is-on'], type: 'button', 'aria-label': label, 'data-menu-anchor': '',
      onpointerdown: keep, onmousedown: keep, onclick,
    }, content);
  }

  function refresh() {
    const st = store.getState();
    // черновик пережил полночь: вчерашняя дата — уже не «по умолчанию»
    if (d.day && d.day < ui.day) Object.assign(d, fresh());
    // сферу могли удалить в архив, пока черновик ждал
    if (d.sphereId && !activeSpheres(st).some((s) => s.id === d.sphereId)) d.sphereId = null;
    const sphere = st.spheres.find((s) => s.id === d.sphereId);
    const when = whenLabel(d);
    const pri = PRIORITIES.find(([v]) => v === d.priority)?.[1];
    if (d.prioOpen) {
      // приоритет выбирается прямо в поле: ни меню поверх текста, ни клавиатуры поверх меню
      chips.replaceChildren(h('div', { class: 'prio-pick', role: 'radiogroup', 'aria-label': 'Priority' },
        PRIO_CHOICES.map(([v, text, level]) => h('button', {
          class: ['prio-opt', d.priority === v && 'is-on'], type: 'button', role: 'radio',
          'aria-checked': String(d.priority === v), onpointerdown: keep, onmousedown: keep,
          onclick: () => {
            d.priority = v;
            d.prioOpen = false;
            refresh();
          },
        }, prioIcon(level, 18), h('span', null, text)))));
      return;
    }
    chips.replaceChildren(
      chip([glyph(sphere ? sphere.glyph : 'inbox'), h('span', null, sphere ? sphere.name : 'Inbox')], 'Sphere',
        () => menu(form, sphereItems(d.sphereId), (v) => { d.sphereId = v; refresh(); }, 'Sphere')),
      chip([icon('calendar', 20), h('span', null, when ?? 'No date')], 'Date', () => {
        dateSheet(d, (v) => {
          Object.assign(d, v);
          refresh();
          focusEnd(input);
        }, { full: 'drop' });
      }, Boolean(d.day)),
      chip(d.priority ? [prioIcon(PRIO_LEVEL[d.priority], 20), h('span', null, pri)] : icon('flag', 20),
        d.priority ? `Priority: ${pri}` : 'Priority',
        () => {
          closeMenu();
          d.prioOpen = true;
          refresh();
        }, Boolean(d.priority)),
    );
  }

  refresh();
  form.refresh = refresh;
  form.focusInput = () => focusEnd(input);
  return form;
}
