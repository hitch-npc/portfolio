/**
 * «Бриф» — собирается на устройстве из данных: завтра, просроченное,
 * неделя дедлайнов, цели месяца. «Export for Claude» кладёт компактный
 * JSON в буфер обмена — дальше его вставляют в чат руками.
 */
import { h, glyph, toast } from '../ui.js';
import { dueLabel, fmtDay, fmtWeekday, monthName, parse } from '../dates.js';
import { brief, exportForClaude } from '../logic.js';
import * as store from '../store.js';
import { ui, header, pillButton, panel, bigNumber } from './common.js';
import { fraction, meter } from './goals.js';

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // запасной путь для браузеров без Clipboard API
    const area = document.body.appendChild(h('textarea', { class: 'offscreen', readonly: true, value: text }));
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function line(t, spheres, { num, late } = {}) {
  const sphere = spheres.get(t.sphereId);
  const due = t.deadline ? dueLabel(t.deadline, ui.day) : null;
  return h('li', { class: 'line' },
    num != null && h('span', { class: 'line-num' }, String(num)),
    glyph(sphere ? sphere.glyph : 'inbox'),
    h('span', { class: 'line-title' }, t.title),
    late && due && h('span', { class: 'line-due is-late' }, due.text));
}

function week(days) {
  const max = Math.max(1, ...days.map((d) => d.tasks.length));
  const empty = days.every((d) => !d.tasks.length);
  const chart = h('div', { class: ['week', empty && 'is-empty'], role: 'img', 'aria-label': 'Deadlines over the next 7 days' },
    days.map((d, i) => {
      const bar = h('div', { class: ['week-bar', i === 0 && 'is-now', !d.tasks.length && 'is-zero'] });
      bar.style.height = d.tasks.length ? `${(d.tasks.length / max) * 100}%` : '';
      return h('div', { class: 'week-col' },
        h('span', { class: 'week-count' }, d.tasks.length || ''),
        h('div', { class: 'week-track' }, bar),
        h('span', { class: 'week-day' }, fmtWeekday(d.date)),
        h('span', { class: 'week-date' }, String(parse(d.date).getDate())));
    }));
  const withTasks = days.filter((d) => d.tasks.length);
  return [
    chart,
    withTasks.length > 0 && h('dl', { class: 'week-list' }, withTasks.map((d) => [
      h('dt', null, fmtDay(d.date)),
      h('dd', null, d.tasks.map((t) => t.title).join(' · ')),
    ])),
  ];
}

export function briefView() {
  const st = store.getState();
  const b = brief(st, ui.day);
  const spheres = new Map(st.spheres.map((s) => [s.id, s]));
  const deadlines = b.week.reduce((n, d) => n + d.tasks.length, 0);

  return h('section', { class: 'screen screen-brief' },
    header('Brief', fmtDay(b.today)),
    pillButton('copy', 'Export for Claude', async () => {
      toast((await copy(exportForClaude(st, ui.day))) ? 'Copied — paste it into Claude' : 'Could not copy');
    }, 'is-on pill-wide'),

    h('div', { class: 'panels' },
      panel('Tomorrow', fmtDay(b.tomorrow),
        b.planned.length
          ? h('ol', { class: 'lines' }, b.planned.map((t, i) => line(t, spheres, { num: i + 1 })))
          : h('p', { class: 'hint' }, 'Nothing planned yet. ', h('a', { href: '#/plan' }, 'Plan tomorrow'))),

      // просроченное — единственная панель, где число красное: это и есть «требует внимания»
      b.overdue.length > 0 && panel('Overdue', null,
        bigNumber(b.overdue.length, b.overdue.length === 1 ? ' task' : ' tasks', 'is-late'),
        h('ul', { class: 'lines' }, b.overdue.map((t) => line(t, spheres, { late: true })))),

      panel('Next 7 days', null,
        bigNumber(deadlines, deadlines === 1 ? ' deadline' : ' deadlines'),
        week(b.week)),

      panel('Goals', monthName(b.month),
        b.goals.length
          ? h('div', { class: 'brief-goals' }, b.goals.map(({ goal, steps, done, total }) =>
            h('article', { class: 'brief-goal' },
              h('div', { class: 'brief-goal-head' }, h('h3', null, goal.title), fraction(done, total)),
              meter(done, total),
              steps.length > 0 && h('ul', { class: 'brief-steps' }, steps.map((s) =>
                h('li', { class: s.done ? 'is-done' : null }, s.title))))))
          : h('p', { class: 'hint' }, 'No goals yet.'))));
}
