/**
 * Ввод и выбор: поле новой задачи с чипами (сфера, дата, приоритет),
 * всплывающее меню и шторка даты — быстрые дни, дата, время, повтор.
 */
import {
  h, icon, glyph, sphereMark, pickerInput, sectionIcon, toast, openSheet, closeSheet, renderSheet, focusEnd, prioIcon, haptic, calm,
  APPLE_TOUCH,
} from '../ui.js';
import { dayLabel, fmtLong, fmtShort, fmtWeekday, addDays, nextWeek } from '../dates.js';
import { PRIORITIES, REPEATS, activeSpheres, dayLimit, isDayFull } from '../logic.js';
import * as store from '../store.js';
import { ui } from './common.js';

/* ── всплывающее меню ────────────────────────────────────────────────── */

let menuEl = null;

/** Меню уходит коротким угасанием к якорю (при «меньше движения» — сразу). */
function closeMenu() {
  const el = menuEl;
  menuEl = null;
  document.removeEventListener('pointerdown', outside, true);
  if (!el) return;
  if (calm()) {
    el.remove();
    return;
  }
  el.classList.add('is-closing');
  el.inert = true;
  setTimeout(() => el.remove(), 160);
}

function outside(e) {
  if (menuEl && !menuEl.contains(e.target) && !e.target.closest?.('[data-menu-anchor]')) closeMenu();
}

/* пункты меню появляются лесенкой: номер пункта — в --i (стиль — через CSSOM: CSP) */
const stagger = (i, el) => {
  el.style.setProperty('--i', String(i));
  return el;
};

/* кнопка не забирает фокус у поля ввода: клавиатура остаётся на месте */
const keep = (e) => e.preventDefault();

/**
 * Меню под якорем, внутри host (position: relative). items — [value, label, mark, on];
 * mark — имя глифа, 'icon:имя' или готовый узел (sphereMark). Повторный тап по якорю закрывает меню.
 */
export function menu(host, items, onPick, label) {
  const again = menuEl && menuEl.parentElement === host && menuEl.dataset.label === label;
  closeMenu();
  if (again) return;
  menuEl = h('div', { class: 'menu', role: 'menu', 'aria-label': label, 'data-label': label },
    items.map(([value, text, mark, on], i) => stagger(i,
      h('button', {
        class: ['menu-item', on && 'is-on'], type: 'button', role: 'menuitemradio', 'aria-checked': String(Boolean(on)),
        onpointerdown: keep, onmousedown: keep,
        onclick: () => { haptic(); closeMenu(); onPick(value); },
      },
        h('span', { class: 'menu-check' }, on && icon('check', 20)),
        h('span', { class: 'menu-mark' }, mark && (mark instanceof Node ? mark : mark.startsWith('icon:') ? icon(mark.slice(5), 20) : glyph(mark))),
        h('span', null, text)))));
  host.append(menuEl);
  place(menuEl, host);
  document.addEventListener('pointerdown', outside, true);
}

/* Над клавиатурой iPhone (iOS 26+) плавает стеклянная панель «^ v ✓»: она
   поверх страницы и из visualViewport не вычитается. Высота — по снимку
   экрана с iOS 27, с запасом; API, чтобы её узнать, нет */
const ACCESSORY_BAR = 64;

/** Высота выреза сверху (островок, часы): меню под ним не заезжает. */
function safeTop() {
  const probe = h('div', { class: 'offscreen' });
  probe.style.setProperty('padding-top', 'env(safe-area-inset-top, 0px)');
  document.body.append(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
}

/**
 * Меню — там, где его видно целиком: под якорем, а если снизу клавиатура или
 * панель вкладок — над всем полем (не поверх набираемого текста). Видимая
 * часть экрана — по visualViewport: клавиатура iOS страницу не сжимает.
 * Пока на iPhone набирают текст, меню — над полем: поле с курсором iOS всегда
 * держит на виду, а что под ним скрыто клавиатурой и панелью, надёжно не узнать.
 */
function place(el, host) {
  const vv = globalThis.visualViewport;
  const nav = document.getElementById('nav')?.getBoundingClientRect().top ?? innerHeight;
  // курсор в поле — клавиатура с панелью открыта (как iOS считает экран при
  // ней, по размерам надёжно не понять: панель вкладок бывает видна над ней)
  const typing = APPLE_TOUCH && document.activeElement?.matches('input, textarea');
  const bottom = Math.min(vv ? vv.offsetTop + vv.height : innerHeight, nav) - (typing ? ACCESSORY_BAR : 0) - 8;
  const top = (vv?.offsetTop ?? 0) + safeTop() + 8;
  const below = bottom - el.getBoundingClientRect().top;
  const above = host.getBoundingClientRect().top - 6 - top;
  const up = typing && above >= 120 ? true : el.scrollHeight > below && above > below;
  el.classList.toggle('is-up', up);
  el.style.maxHeight = `${Math.max(120, Math.floor(up ? above : below))}px`;
}

const sphereItems = (current) => [
  [null, 'All', 'inbox', current == null],
  ...activeSpheres(store.getState()).map((s) => [s.id, s.name, sphereMark(s), current === s.id]),
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
  let wasFull = false; // подсказка «день полон» проявляется, когда появилась, а не на каждый тап
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
    const appear = full && !wasFull;
    wasFull = Boolean(full);

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
            pickerInput({ class: 'date', type: 'date', 'aria-label': 'Date', value: draft.day ?? '' }, (v) => set({ day: v })))),
        h('div', { class: ['row', !draft.day && 'is-off'] },
          icon('clock'), h('span', { class: 'row-label' }, 'Time'),
          draft.time && overlay(h('span', { class: 'pill' }, draft.time),
            pickerInput({ class: 'date', type: 'time', 'aria-label': 'Time', value: draft.time }, (v) => set({ time: v }))),
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

      full && h('p', { class: ['sheet-note', appear && 'is-appearing'] },
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
        g instanceof Node ? g : glyph(g), h('span', { class: 'replace-title' }, name)))),
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
/**
 * Новая задача в списке на экране: вспыхивает и, когда клавиатура уехала,
 * показывается целиком. Не на этом экране (ушла во «Входящие») — ничего,
 * там уже сказал тост.
 */
function showNew(id) {
  const el = document.querySelector(`.tasks [data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  haptic();
  if (calm()) return;
  el.classList.add('is-new');
  setTimeout(() => el.isConnected && el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 340);
  setTimeout(() => el.classList.remove('is-new'), 1600);
}

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
      const t = submit(title);
      // клавиатура уходит — видно, что изменилось и куда встала задача
      input.blur();
      if (t) showNew(t.id);
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
      toast(`Added to ${planned ? dayLabel(planned, ui.day) : st.spheres.find((s) => s.id === sid)?.name ?? 'All'}`, { done: true });
    }
    // после добавления всё по умолчанию: сфера экрана, день, без времени и приоритета
    Object.assign(d, { title: '', sphereId, ...fresh() });
    input.value = '';
    send.classList.remove('is-ready');
    return store.createTask(title, {
      sphereId: sid, priority, day: planned, time: planned ? time : null, repeat: planned ? repeat : null,
    });
  }

  function chip(content, label, onclick, on = false, color = null) {
    return h('button', {
      class: ['compose-chip', on && 'is-on'], type: 'button', 'aria-label': label, 'data-menu-anchor': '', 'data-sc': color,
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
          onclick: (e) => pickPrio(v, e.currentTarget),
        }, prioIcon(level, 18), h('span', null, text)))));
      return;
    }
    chips.replaceChildren(
      chip([glyph(sphere ? sphere.glyph : 'inbox'), h('span', null, sphere ? sphere.name : 'All')], 'Sphere',
        () => menu(form, sphereItems(d.sphereId), (v) => { d.sphereId = v; refresh(); }, 'Sphere'), false, sphere?.color),
      chip([icon('calendarFill', 20), h('span', null, when ?? 'No date')], 'Date', () => {
        dateSheet(d, (v) => {
          Object.assign(d, v);
          refresh();
          focusEnd(input);
        }, { full: 'drop' });
      }, Boolean(d.day)),
      chip(d.priority ? [prioIcon(PRIO_LEVEL[d.priority], 20), h('span', null, pri)] : icon('flag', 20),
        d.priority ? `Priority: ${pri}` : 'Priority', openPrio, Boolean(d.priority)),
    );
  }

  /* Приоритет разворачивается из самой кнопки-флажка: уровни вылетают из неё
     в стороны; выбор — выбранный вздрагивает, все складываются обратно во
     флажок, и он возвращается уже с уровнем. */
  let flag = null; // центр флажка на экране — откуда вылетают и куда складываются
  const center = (el) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const fromFlag = (el, scale = 0.3) => {
    const [x, y] = center(el);
    return `translate(${flag[0] - x}px, ${flag[1] - y}px) scale(${scale})`;
  };

  function openPrio(e) {
    closeMenu();
    flag = center(e.currentTarget);
    d.prioOpen = true;
    refresh();
    if (calm()) return;
    [...chips.querySelectorAll('.prio-opt')].forEach((el, i) => el.animate(
      [{ transform: fromFlag(el), opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 480, delay: i * 40, easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)', fill: 'backwards' },
    ));
  }

  function pickPrio(v, chosen) {
    haptic();
    d.priority = v;
    const opts = [...chips.querySelectorAll('.prio-opt')];
    const done = () => {
      d.prioOpen = false;
      refresh();
      if (calm()) return;
      const back = chips.querySelector('[aria-label^="Priority"]');
      back?.animate([{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 420, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
      [...chips.children].filter((c) => c !== back).forEach((c) =>
        c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease' }));
    };
    if (calm() || !flag) {
      done();
      return;
    }
    opts.forEach((o) => o.classList.toggle('is-on', o === chosen));
    Promise.allSettled(opts.map((o, i) => o.animate(
      o === chosen
        ? [{ transform: 'none' }, { transform: 'scale(1.08)', offset: 0.3 }, { transform: fromFlag(o, 0.5), opacity: 0 }]
        : [{ transform: 'none', opacity: 1 }, { transform: fromFlag(o), opacity: 0 }],
      { duration: o === chosen ? 380 : 260, delay: o === chosen ? 40 : (opts.length - 1 - i) * 25, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' },
    ).finished)).then(done);
  }

  refresh();
  form.refresh = refresh;
  form.focusInput = () => focusEnd(input);
  return form;
}
