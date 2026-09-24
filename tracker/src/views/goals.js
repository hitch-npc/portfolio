/**
 * «Цели» — долгосрочные цели. У цели может быть число (10 откликов,
 * 5 км, 100 000 ₽) — тогда прогресс считается по нему, кнопки −/+ его
 * двигают на шаг (свой у каждой цели, меняется в любой момент); без числа
 * прогресс — отмеченные шаги. Шаги — простой чек-лист, без привязки
 * к месяцу. Срок необязателен. Новая цель набирается с крутилками над
 * полем: число, текущее, шаг, единица и срок — до создания, без Enter.
 */
import { h, icon, entry, openSheet, closeSheet, renderSheet, toast } from '../ui.js';
import { addMonths, diffDays, fmtLong } from '../dates.js';
import { autoStep, goalProgress, goalStep, goalsOverview, isGoalDone } from '../logic.js';
import * as store from '../store.js';
import { ui, header, iconButton, pillButton, checkButton, rerender } from './common.js';
import { dial, AMOUNTS, STEPS } from './dial.js';

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

/** Поле числа в фокусе: без пробелов-разрядов и выделено — набор заменяет старое. */
function editNumber(el, raw) {
  el.value = raw;
  el.select();
}

/** Число из поля: пробелы и запятая допустимы; пусто — null, не число — NaN. */
const readNum = (s) => {
  const raw = s.trim().replace(',', '.').replace(/\s/g, '');
  return raw === '' ? null : Number(raw);
};

function numberInput(value, label, key, onSet, placeholder = '—') {
  return h('input', {
    class: 'num-input', type: 'text', inputmode: 'decimal', value: value == null ? '' : String(value),
    'aria-label': label, placeholder, 'data-key': key,
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    onchange: (e) => {
      const n = readNum(e.target.value);
      if (n != null && !Number.isFinite(n)) {
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
        measured && field('Step', numberInput(g.step, 'Step', `goal-step-${g.id}`,
          (n) => store.updateGoal(g.id, { step: n > 0 ? n : null }), `Auto · ${num(autoStep(g.target))}`)),
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

/**
 * Шторка шага: крутилка по круглым шагам, точное число — в поле сверху,
 * Auto — шаг снова по величине цели. Меняется сразу, Done только закрывает.
 */
export function stepSheet(id) {
  openSheet(() => {
    const g = store.getState().goals.find((x) => x.id === id);
    if (!g) return [];
    const step = goalStep(g);
    const auto = !(g.step > 0);
    // единица — сразу за числом: цифры моноширинные, ширина по их числу
    const fit = () => { value.style.width = `${Math.max(1, value.value.length) * 0.6 + 0.15}em`; };
    const value = h('input', {
      class: 'dial-readout', type: 'text', inputmode: 'decimal', value: num(step), 'aria-label': 'Step',
      oninput: fit,
      'data-key': `step-value-${g.id}`,
      onfocus: (e) => editNumber(e.target, String(step)),
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
      onchange: (e) => {
        const n = readNum(e.target.value);
        if (n > 0 && Number.isFinite(n)) store.updateGoal(g.id, { step: n });
        else e.target.value = num(step);
      },
    });
    return [
      h('div', { class: 'sheet-bar' },
        h('span'),
        h('h2', { class: 'sheet-bar-title' }, 'Step'),
        h('button', { class: 'pill pill-action is-on', type: 'button', onclick: closeSheet }, 'Done')),
      h('p', { class: 'sheet-text muted step-for' }, `− and + on “${g.title}” move by`),
      h('div', { class: 'dial-head' }, (fit(), value), g.unit && h('span', { class: 'dial-unit' }, g.unit)),
      dial({
        values: STEPS, value: step, label: 'Step',
        onInput: (v) => {
          value.value = num(v);
          fit();
        },
        onCommit: (v) => { if (auto || v !== step) store.updateGoal(g.id, { step: v }); },
      }),
      h('div', { class: 'pills step-auto' },
        h('button', {
          class: ['pill', auto && 'is-on'], type: 'button', 'aria-pressed': String(auto),
          onclick: () => store.updateGoal(g.id, { step: null }),
        }, `Auto · ${num(autoStep(g.target ?? 0))}`)),
    ];
  });
}

function goalCard(goal) {
  const p = goalProgress(goal);
  const step = goalStep(goal);
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
    h('div', { class: ['goal-progress', p.kind === 'value' && 'is-value', `${num(p.current ?? p.done)}${num(p.total)}`.length > 8 && 'is-long'] },
      p.kind === 'value' ? fraction(p.current, p.total, goal.unit) : fraction(p.done, p.total),
      meter(p.done, p.total)),
    p.kind === 'value' && h('div', { class: 'goal-bump' },
      h('button', {
        class: 'bump', type: 'button', 'aria-label': `Minus ${num(step)}`, disabled: !p.current,
        onclick: () => store.bumpGoal(goal.id, -step),
      }, icon('minus')),
      h('button', {
        class: 'bump bump-plus', type: 'button', 'aria-label': `Plus ${num(step)}`,
        onclick: () => store.bumpGoal(goal.id, step),
      }, icon('plus'), h('span', null, num(step))),
      h('button', {
        class: 'bump bump-step', type: 'button', 'aria-label': `Step ${num(step)} — change`,
        onclick: () => stepSheet(goal.id),
      }, h('span', null, 'Step'), icon('updown', 16))),
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

/* ── новая цель ─────────────────────────────────────────────────────── */

const UNITS = ['€', '$', '₽', 'km', 'kg', 'h', 'pages', 'times', '%'];
const blankGoal = () => ({ title: '', target: 0, current: 0, step: null, unit: '', deadline: null, open: false, touched: false });
let draft = blankGoal();

/** Кнопки и крутилки поля не забирают фокус у названия — клавиатура не прыгает. */
const keep = (e) => e.preventDefault();

// клавиатура выехала или уехала — поле новой цели снова целиком над ней
let revealNow = null;
window.visualViewport?.addEventListener('resize', () => revealNow?.());

/**
 * Строка с крутилкой: подпись и точное число слева (его можно набрать),
 * линейка справа. off — штриховка: без числа цели текущее и шаг не нужны.
 */
function dialRow(label, values, value, onSet, { off = false, hint = null } = {}) {
  const show = (v) => (v ? num(v) : '');
  const out = h('input', {
    class: 'gd-value', type: 'text', inputmode: 'decimal', value: show(value), placeholder: hint ?? '—',
    'aria-label': label, disabled: off,
    onfocus: (e) => editNumber(e.target, e.target.value.replace(/\s/g, '')),
    // Enter в числе — только «готово», а не «создать цель»
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.target.blur();
    },
    onchange: (e) => {
      const n = readNum(e.target.value);
      const v = Number.isFinite(n) && n > 0 ? n : 0;
      onSet(v);
      line.setValue(v);
      e.target.value = show(v);
    },
  });
  const line = dial({ values, value, label, disabled: off, onInput: (v) => { out.value = show(v); onSet(v); } });
  const row = h('div', { class: ['gd-row', off && 'is-off'] },
    h('label', { class: 'gd-label' }, h('span', { class: 'gd-name' }, label), out), line);
  row.sync = (v, isOff, placeholder) => {
    row.classList.toggle('is-off', isOff);
    out.disabled = isOff;
    if (placeholder != null) out.placeholder = placeholder;
    if (v != null) {
      out.value = show(v);
      line.setValue(v);
    }
    line.setDisabled(isOff);
  };
  return row;
}

/** Строка пилюль (единица, срок): подпись и выбранное слева, пилюли — лентой. */
function chipRow(label, shown, chips, extra = null, off = false) {
  return h('div', { class: ['gd-row', 'gd-chips-row', off && 'is-off'] },
    h('div', { class: 'gd-label' }, h('span', { class: 'gd-name' }, label), h('span', { class: 'gd-shown' }, shown || '—')),
    h('div', { class: 'gd-chips' }, chips, extra));
}

function goalComposer() {
  const d = draft;
  const params = h('div', { class: 'gd' });
  const input = h('input', {
    class: 'compose-input', type: 'text', placeholder: 'New goal', 'aria-label': 'New goal', autocomplete: 'off',
    autocapitalize: 'sentences', enterkeyhint: 'done', 'data-key': 'goal-new', value: d.title,
    oninput: (e) => {
      d.title = e.target.value;
      send.classList.toggle('is-ready', Boolean(d.title.trim()));
    },
    onfocus: () => open(),
  });
  const send = h('button', {
    class: ['compose-send', d.title.trim() && 'is-ready'], type: 'submit', 'aria-label': 'Add goal',
    onpointerdown: keep, onmousedown: keep,
  }, icon('send', 20));
  const form = h('form', {
    class: ['compose', 'goal-compose', d.open && 'is-open'],
    onsubmit: (e) => {
      e.preventDefault();
      create();
    },
  }, params, h('div', { class: 'goal-compose-row' }, input, send));
  // запас снизу, чтобы короткую страницу было куда подвинуть над клавиатурой
  const spacer = h('div', { class: 'gd-spacer', 'aria-hidden': 'true' });

  /**
   * Крутилки и поле — целиком над клавиатурой (или над панелью вкладок):
   * низ поля прижимается к низу видимой части экрана.
   */
  function reveal() {
    if (!d.open || !form.isConnected) return;
    const vv = window.visualViewport;
    const nav = document.getElementById('nav')?.getBoundingClientRect().top ?? innerHeight;
    const limit = Math.min(vv ? vv.offsetTop + vv.height : innerHeight, nav) - 12;
    const over = form.getBoundingClientRect().bottom - limit;
    if (over <= 0) return;
    const room = document.scrollingElement.scrollHeight - innerHeight - scrollY;
    if (over > room) spacer.style.height = `${Math.ceil(over - room)}px`;
    window.scrollBy(0, over);
  }
  if (d.open) revealNow = reveal;

  function open() {
    if (d.open) return;
    d.open = true;
    revealNow = reveal;
    form.classList.add('is-open', 'is-opening');
    fill();
    requestAnimationFrame(reveal);
    setTimeout(() => form.classList.remove('is-opening'), 600);
  }

  function close() {
    draft = blankGoal();
    revealNow = null;
    input.blur();
    rerender();
  }

  function create() {
    const title = d.title.trim();
    if (!title) {
      input.focus();
      return;
    }
    const measured = d.target > 0;
    const fields = measured
      ? { target: d.target, current: d.current, unit: d.unit, step: d.step, deadline: d.deadline }
      : { deadline: d.deadline };
    draft = blankGoal();
    revealNow = null;
    input.blur();
    store.createGoal(title, fields);
    toast(measured ? `Goal added — ${num(fields.current)}/${num(fields.target)}${fields.unit ? ` ${fields.unit}` : ''}` : 'Goal added — add steps to it');
  }

  function fill() {
    if (!d.open) {
      params.replaceChildren();
      return;
    }
    const measured = () => d.target > 0;
    const touch = () => { d.touched = true; };
    const stepHint = () => `Auto · ${num(autoStep(d.target))}`;
    const hint = h('p', { class: 'gd-hint' });
    const sayHint = () => {
      hint.textContent = measured()
        ? `− and + will move it by ${num(d.step ?? autoStep(d.target))}${d.unit ? ` ${d.unit}` : ''}.`
        : 'No number — progress by steps. Turn the target to set one.';
    };
    const target = dialRow('Target', AMOUNTS, d.target, (v) => {
      d.target = v;
      touch();
      const off = !measured();
      now.sync(null, off);
      step.sync(d.step == null ? autoStep(v) : null, off, stepHint());
      unit.classList.toggle('is-off', off);
      sayHint();
    });
    const now = dialRow('Now', AMOUNTS, d.current, (v) => { d.current = v; touch(); }, { off: !measured() });
    const step = dialRow('Step', STEPS, d.step ?? autoStep(d.target), (v) => { d.step = v; touch(); sayHint(); },
      { off: !measured(), hint: stepHint() });

    const pick = (on, text, onclick, label = text) => h('button', {
      class: ['pill', 'gd-chip', on && 'is-on'], type: 'button', 'aria-pressed': String(on), 'aria-label': label,
      onpointerdown: keep, onmousedown: keep, onclick,
    }, text);
    const setUnit = (u) => { d.unit = u; touch(); fill(); };
    const unit = chipRow('Unit', d.unit, [
      pick(!d.unit, '—', () => setUnit(''), 'No unit'),
      ...UNITS.map((u) => pick(d.unit === u, u, () => setUnit(u))),
    ], h('input', {
      class: 'gd-other', type: 'text', placeholder: 'other', 'aria-label': 'Other unit', autocomplete: 'off',
      value: UNITS.includes(d.unit) ? '' : d.unit,
      onchange: (e) => setUnit(e.target.value.trim()),
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
    }), !measured());

    const today = ui.day;
    const year = `${today.slice(0, 4)}-12-31`;
    const setDue = (day) => { d.deadline = day; touch(); fill(); };
    const presets = [['1 mo', addMonths(today, 1)], ['3 mo', addMonths(today, 3)], ['6 mo', addMonths(today, 6)],
      ['1 year', addMonths(today, 12)], ['Year end', year]];
    const custom = d.deadline && !presets.some(([, v]) => v === d.deadline);
    const due = chipRow('By', d.deadline ? fmtLong(d.deadline) : 'No date', [
      pick(!d.deadline, 'None', () => setDue(null), 'No deadline'),
      ...presets.map(([text, v]) => pick(d.deadline === v, text, () => setDue(v), `Deadline ${fmtLong(v)}`)),
    ], h('label', { class: ['pill', 'gd-chip', 'date-wrap', custom && 'is-on'] },
      icon('calendar', 18), h('span', null, 'Date'),
      h('input', {
        class: 'date', type: 'date', 'aria-label': 'Deadline date', value: d.deadline ?? '', min: today,
        onclick: (e) => { try { e.target.showPicker?.(); } catch { /* уже открыт */ } },
        onchange: (e) => setDue(e.target.value || null),
      })));

    sayHint();
    params.replaceChildren(
      h('div', { class: 'gd-head' },
        h('span', { class: 'label' }, 'New goal'),
        h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': 'Close', title: 'Close',
          onpointerdown: keep, onmousedown: keep, onclick: close,
        }, icon('close', 20))),
      target, now, step, unit, due, hint);
  }

  fill();
  return [form, spacer];
}

export function goalsView() {
  const goals = goalsOverview(store.getState());
  const reached = goals.filter(({ goal }) => isGoalDone(goal)).length;
  return h('section', { class: 'screen screen-goals' },
    header('Goals', goals.length ? `${reached} of ${goals.length} reached` : ''),
    goals.length > 0 && h('div', { class: 'goal-list' }, goals.map(({ goal }) => goalCard(goal))),
    !goals.length && h('p', { class: 'hint' },
      'No goals yet. Name one below — then give it a number (10 applications, 5 km) and a deadline, or just add steps.'),
    goalComposer());
}
