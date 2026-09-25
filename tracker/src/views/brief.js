/**
 * «Обзор» (Overview) — собирается на устройстве из данных: завтра,
 * просроченное, неделя дедлайнов, цели. «Ask AI about my plans» кладёт
 * в буфер инструкцию с открытыми задачами и целями — её вставляют в любой
 * ИИ-чат и спрашивают; предложенные правки вставляются обратно в Settings → AI.
 */
import { h, sphereMark, icon, toast, countUp, copyText } from '../ui.js';
import { dueLabel, fmtDay, fmtWeekday, parse } from '../dates.js';
import { brief, dayLimit, isGoalDone } from '../logic.js';
import { aiData, aiPrompt } from '../io.js';
import * as store from '../store.js';
import { ui, header, pillButton, plot, stat } from './common.js';
import { fraction, goalDue, meter } from './goals.js';

function line(t, spheres, { num, late } = {}) {
  const sphere = spheres.get(t.sphereId);
  const due = t.deadline ? dueLabel(t.deadline, ui.day) : null;
  return h('li', { class: 'line' },
    num != null && h('span', { class: 'line-num' }, String(num)),
    sphereMark(sphere),
    h('span', { class: 'line-title' }, t.title),
    late && due && h('span', { class: 'line-due is-late' }, due.text));
}

/** Неделя: столбики-пилюли на точечном поле. Сегодня — сплошным, остальные дни — штриховкой. */
function week(days) {
  const max = Math.max(1, ...days.map((d) => d.tasks.length));
  const chart = h('div', { class: 'week', role: 'img', 'aria-label': 'Deadlines over the next 7 days' },
    days.map((d, i) => {
      const n = d.tasks.length;
      const bar = h('div', { class: ['week-bar', i === 0 && 'is-now', !n && 'is-zero'] });
      bar.style.setProperty('--h', String(n / max));
      bar.style.setProperty('--i', String(i));
      return h('div', { class: 'week-col' },
        h('span', { class: 'week-count' }, n || ''),
        h('div', { class: 'week-track' }, bar),
        h('span', { class: 'week-day' }, fmtWeekday(d.date)),
        h('span', { class: 'week-date' }, String(parse(d.date).getDate())));
    }));
  return plot(chart);
}

function weekList(days) {
  const withTasks = days.filter((d) => d.tasks.length);
  return withTasks.length > 0 && h('dl', { class: 'week-list' }, withTasks.map((d) => [
    h('dt', null, fmtDay(d.date)),
    h('dd', null, d.tasks.map((t) => t.title).join(' · ')),
  ]));
}

/** Плитка: подпись сверху, крупное число, под ним — немного текста. */
function tile(label, value, tail, content, { wide = false, late = false, href = null } = {}) {
  const v = h('p', { class: ['big', late && 'is-late'] }, String(value), tail && h('span', { class: 'muted' }, tail));
  if (ui.entering) countUp(v, value);
  return h('section', { class: ['tile', wide && 'tile-wide'] },
    h('div', { class: 'tile-head' },
      h('span', { class: 'tile-label' }, label),
      href && h('a', { class: 'tile-link', href, 'aria-label': `Open ${label}` }, icon('chevron', 20))),
    v,
    content);
}

export function briefView() {
  const st = store.getState();
  const b = brief(st, ui.day);
  const spheres = new Map(st.spheres.map((s) => [s.id, s]));
  const deadlines = b.week.reduce((n, d) => n + d.tasks.length, 0);
  const reached = b.goals.filter(({ goal }) => isGoalDone(goal)).length;
  const limit = dayLimit(st);

  return h('section', { class: 'screen screen-brief' },
    header('Overview', fmtDay(b.today)),
    h('p', { class: 'hint hint-top' }, 'What needs attention, at a glance: tomorrow, overdue, deadlines this week and goals. Tap a block to open it.'),
    week(b.week),
    stat('Deadlines, next 7 days', deadlines),
    weekList(b.week),

    h('div', { class: 'bento' },
      tile('Tomorrow', b.planned.length, limit ? `/${limit}` : null,
        b.planned.length
          ? h('ol', { class: 'lines lines-sm' }, b.planned.map((t, i) => line(t, spheres, { num: i + 1 })))
          : h('p', { class: 'hint' }, 'Not planned yet'),
        { href: '#/plan' }),

      // просроченное — единственная плитка, где число красное: это и есть «требует внимания»
      tile('Overdue', b.overdue.length, null,
        b.overdue.length
          ? h('ul', { class: 'lines lines-sm' }, b.overdue.map((t) => line(t, spheres)))
          : h('p', { class: 'hint' }, 'All clear'),
        { late: b.overdue.length > 0 }),

      tile('Goals', reached, `/${b.goals.length} reached`,
        b.goals.length
          ? h('div', { class: 'brief-goals' }, b.goals.map(({ goal, done, total, kind, current }) => {
            const due = goalDue(goal, ui.day);
            return h('article', { class: 'brief-goal' },
              h('div', { class: 'brief-goal-head' },
                h('h3', null, goal.title, due && h('span', { class: ['brief-goal-due', due.late && 'is-late'] }, due.text)),
                kind === 'value' ? fraction(current, total, goal.unit) : fraction(done, total)),
              meter(done, total));
          }))
          : h('p', { class: 'hint' }, 'No goals yet'),
        { wide: true, href: '#/goals' })),

    pillButton('copy', 'Ask AI about my plans', async () => {
      const prompt = aiPrompt({ today: ui.day, limit: dayLimit(st), data: aiData(st) });
      const copied = await copyText(prompt);
      toast(copied ? 'Copied — paste it into the AI chat' : 'Could not copy', { done: copied });
    }, 'is-on pill-wide pill-export'),
    h('p', { class: 'setting-hint ask-hint' },
      'Copies your open tasks, deadlines and goals with instructions. Paste them into ChatGPT, Claude or Gemini and ask — what to focus on, how to split a big task. ',
      'If it suggests changes, paste its answer in Settings → AI → Paste AI answer.'));
}
