/**
 * Правила трекера — чистые функции над состоянием { spheres, tasks, goals }.
 * Ни DOM, ни IndexedDB: всё здесь проверяется node --test (tracker/test).
 */
import { addDays, monthOf } from './dates.js';

/** «Сегодня» и «завтра» вмещают по три незавершённые задачи — не больше. */
export const DAY_LIMIT = 3;

export const STATUSES = [
  ['todo', 'To do'],
  ['doing', 'In progress'],
  ['paused', 'Paused'],
  ['done', 'Done'],
];
export const PRIORITIES = [
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
];
/** Сферы различаются глифом, не цветом: цвет в системе один, и он значит «срочно». */
export const GLYPHS = ['circle', 'pill', 'square', 'bar', 'triangle', 'ring', 'half', 'diamond'];

export const DEFAULT_SPHERES = [
  ['TTS', 'circle'],
  ['CAELUM', 'pill'],
  ['Career', 'triangle'],
  ['Personal', 'square'],
  ['Documents', 'bar'],
];

const PRI_RANK = { high: 0, medium: 1, low: 2 };

export const isDone = (t) => t.status === 'done';
/** В работе или ждёт: пауза и готовые в «Сегодня» и планирование не попадают. */
export const isActive = (t) => t.status === 'todo' || t.status === 'doing';

export const activeSpheres = (st) => st.spheres.filter((s) => !s.archived).sort((a, b) => a.order - b.order);
export const archivedSpheres = (st) => st.spheres.filter((s) => s.archived).sort((a, b) => a.order - b.order);

/** Задачи архивной сферы убраны отовсюду, кроме самой сферы. */
function visibility(st) {
  const archived = new Set(st.spheres.filter((s) => s.archived).map((s) => s.id));
  return (t) => !t.sphereId || !archived.has(t.sphereId);
}

/** В работе → раньше дедлайн → выше приоритет → старше. */
export function compareTasks(a, b) {
  return (
    (b.status === 'doing') - (a.status === 'doing') ||
    (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') ||
    (PRI_RANK[a.priority] ?? 3) - (PRI_RANK[b.priority] ?? 3) ||
    (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
  );
}

const byDayOrder = (a, b) => (a.dayOrder ?? 0) - (b.dayOrder ?? 0);

/** Задачи дня: open — незавершённые по порядку (первая — №1), done — сделанные в этот день. */
export function dayTasks(st, day) {
  const visible = visibility(st);
  const list = st.tasks.filter((t) => t.day === day && t.status !== 'paused' && visible(t));
  return {
    open: list.filter((t) => !isDone(t)).sort(byDayOrder),
    done: list.filter(isDone).sort(byDayOrder),
  };
}

export const isDayFull = (st, day) => dayTasks(st, day).open.length >= DAY_LIMIT;

/**
 * Просроченные на день `day`. На экране «Сегодня» задачи, уже стоящие в дне,
 * второй раз не показываются (withPlanned: false); в брифе — все.
 */
export function overdue(st, day, { withPlanned = false } = {}) {
  const visible = visibility(st);
  return st.tasks
    .filter((t) => isActive(t) && t.deadline && t.deadline < day && visible(t) && (withPlanned || t.day !== day))
    .sort(compareTasks);
}

/**
 * Кандидаты на завтра. Не сделанное «на сегодня» и раньше — первым блоком,
 * дальше «Входящие» и сферы по порядку. Выбранные на завтра остаются в своих
 * группах — отмечены номером, повторный тап снимает выбор.
 */
export function planGroups(st, today) {
  const target = addDays(today, 1);
  const visible = visibility(st);
  const pool = st.tasks.filter((t) => isActive(t) && visible(t));
  const isCarried = (t) => t.day && t.day <= today;
  const rest = pool.filter((t) => !isCarried(t));
  return {
    target,
    carried: pool.filter(isCarried).sort(compareTasks),
    inbox: rest.filter((t) => !t.sphereId).sort(compareTasks),
    spheres: activeSpheres(st)
      .map((sphere) => ({ sphere, tasks: rest.filter((t) => t.sphereId === sphere.id).sort(compareTasks) }))
      .filter((g) => g.tasks.length),
  };
}

/** Число активных задач (без паузы и готовых) по сферам; ключ null — «Входящие». */
export function sphereCounts(st) {
  const counts = new Map();
  for (const t of st.tasks) {
    if (!isActive(t)) continue;
    const k = t.sphereId ?? null;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** Задачи одной сферы (null — «Входящие»): активные, пауза в конце, готовые отдельно — свежие сверху. */
export function sphereTasks(st, sphereId) {
  const own = st.tasks.filter((t) => (t.sphereId ?? null) === sphereId);
  const paused = (t) => t.status === 'paused';
  return {
    open: own.filter((t) => !isDone(t)).sort((a, b) => paused(a) - paused(b) || compareTasks(a, b)),
    done: own.filter(isDone).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
  };
}

/** Цели с шагами месяца `month` ('YYYY-MM') и прогрессом. */
export function goalsForMonth(st, month) {
  return [...st.goals]
    .sort((a, b) => a.order - b.order)
    .map((goal) => {
      const steps = goal.steps.filter((s) => s.month === month);
      return { goal, steps, done: steps.filter((s) => s.done).length, total: steps.length };
    });
}

/** Всё для брифа: завтра, просроченное, неделя дедлайнов от сегодня, цели месяца. */
export function brief(st, today) {
  const tomorrow = addDays(today, 1);
  const visible = visibility(st);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const tasks = st.tasks.filter((t) => isActive(t) && t.deadline === date && visible(t)).sort(compareTasks);
    return { date, tasks };
  });
  return {
    today,
    tomorrow,
    planned: dayTasks(st, tomorrow).open,
    overdue: overdue(st, today, { withPlanned: true }),
    week,
    month: monthOf(today),
    goals: goalsForMonth(st, monthOf(today)),
  };
}

/** Убирает пустые поля: в буфер уходит компактный JSON без null и пустых списков. */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

/** «Экспорт для Claude»: бриф, незавершённые задачи и цели месяца одним компактным JSON. */
export function exportForClaude(st, today) {
  const b = brief(st, today);
  const names = new Map(st.spheres.map((s) => [s.id, s.name]));
  const visible = visibility(st);
  const task = (t) =>
    compact({
      title: t.title,
      sphere: t.sphereId ? names.get(t.sphereId) : 'Inbox',
      status: t.status,
      priority: t.priority,
      deadline: t.deadline,
      planned: t.day && t.day >= today ? t.day : null,
      subtasks: t.subtasks.map((s) => compact({ title: s.title, done: s.done || null })),
      note: t.note,
    });
  const data = {
    date: today,
    brief: {
      tomorrow: b.planned.map((t) => t.title),
      overdue: b.overdue.map((t) => compact({ title: t.title, deadline: t.deadline })),
      week: Object.fromEntries(b.week.filter((d) => d.tasks.length).map((d) => [d.date, d.tasks.map((t) => t.title)])),
    },
    tasks: st.tasks.filter((t) => !isDone(t) && visible(t)).sort(compareTasks).map(task),
    goals: b.goals.map(({ goal, steps, done, total }) =>
      compact({
        title: goal.title,
        month: b.month,
        progress: `${done}/${total}`,
        steps: steps.map((s) => compact({ title: s.title, done: s.done || null })),
      }),
    ),
  };
  return JSON.stringify(data);
}
