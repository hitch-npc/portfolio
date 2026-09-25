/**
 * Правила трекера — чистые функции над состоянием { spheres, tasks, goals }.
 * Ни DOM, ни IndexedDB: всё здесь проверяется node --test (tracker/test).
 */
import { addDays } from './dates.js';

/**
 * Настройки по умолчанию. dayLimit — сколько незавершённых задач помещается
 * в день (0 — без лимита). Оформление: palette — minimal (как было, без
 * цвета) или colour (у сфер свой цвет); у каждого — тема light, dark или
 * auto (как на устройстве; по умолчанию — если тему не выбирали).
 */
export const DEFAULT_SETTINGS = {
  dayLimit: 3, addTo: 'today', motion: 'system', start: 'today', theme: 'auto', palette: 'minimal',
};

export const settingsOf = (st) => ({ ...DEFAULT_SETTINGS, ...st.settings });
export const dayLimit = (st) => settingsOf(st).dayLimit;

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
/** Сферы различаются глифом; в оформлении Colour — ещё и цветом (красного среди них нет: он значит «срочно»). */
export const GLYPHS = ['circle', 'pill', 'square', 'bar', 'triangle', 'ring', 'half', 'diamond'];

/** Цвета сфер — ключи, не hex: сами цвета у каждой темы свои (app.css, --sph-*). */
export const COLORS = ['olive', 'lavender', 'apricot', 'mint', 'slate', 'lilac', 'plum', 'khaki'];

/** Цвет новой сферы: первый, которого нет у активных; все заняты — по кругу. */
export function nextColor(spheres) {
  const used = new Set(spheres.filter((s) => !s.archived).map((s) => s.color));
  return COLORS.find((c) => !used.has(c)) ?? COLORS[spheres.length % COLORS.length];
}

/**
 * Сферам без цвета (созданным до цветов, из старой копии) — цвет по порядку.
 * Меняет переданные сферы и возвращает те, что поменялись, — их записать.
 */
export function colorize(spheres) {
  const changed = [];
  for (const s of [...spheres].sort((a, b) => a.archived - b.archived || a.order - b.order)) {
    if (COLORS.includes(s.color)) continue;
    s.color = nextColor(spheres.filter((x) => COLORS.includes(x.color)));
    changed.push(s);
  }
  return changed;
}

/**
 * Первый запуск на новом устройстве: нейтральные сферы, несколько задач-
 * подсказок и цель-пример — их выполняют, правят или смахивают, как любые.
 * На устройстве, где трекер уже открывали, ничего не добавляется.
 */
export const DEFAULT_SPHERES = [
  ['Work', 'square'],
  ['Personal', 'circle'],
  ['Health', 'triangle'],
  ['Home', 'ring'],
  ['Learning', 'pill'],
];

/** Подсказки: sphere — номер в DEFAULT_SPHERES (null — без сферы), today — на сегодня. Сегодня — две: третье место свободно. */
export const STARTER_TASKS = [
  { title: 'Tap a task to open it — date, priority, notes', sphere: 1, today: true, subtasks: ['Tick a subtask like this one'] },
  { title: 'Swipe a task left to delete it — try this one', sphere: 0, today: true },
  { title: 'Each evening, plan tomorrow in the Plan tab', sphere: null },
  { title: 'On Today, hold a task and drag it to reorder', sphere: null },
  { title: 'Settings → Appearance: try Colour and Dark', sphere: null },
];

/** Цель-пример: − и + двигают прогресс на шаг. */
export const STARTER_GOAL = { title: 'Read 12 books', target: 12, current: 2, unit: 'books', step: 1 };

/** Повтор: сделанная задача ставит следующую на следующий день по правилу. */
export const REPEATS = [
  ['none', 'None'],
  ['daily', 'Every day'],
  ['weekdays', 'Weekdays'],
  ['weekly', 'Every week'],
  ['monthly', 'Every month'],
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

/**
 * Место задачи со временем в дне (dayOrder). Задачи дня идут от ранней
 * к поздней: новая встаёт перед первой, у которой время позже; позже никого
 * нет — сразу за последней задачей со временем, задачи без времени остаются
 * ниже. Порядок, заданный перетаскиванием, не пересчитывается: по времени
 * встаёт только новая задача или та, у которой время поменяли, — поэтому
 * ручной порядок главнее. Без времени — в конец дня.
 */
export function timeSlot(st, task, day) {
  const others = st.tasks
    .filter((t) => t.day === day && t.id !== task.id && !isDone(t))
    .sort(byDayOrder);
  const orders = others.map((t) => t.dayOrder ?? 0);
  const end = Math.max(-1, ...orders) + 1;
  if (!task.time) return end;
  let at = others.findIndex((t) => t.time && t.time > task.time);
  if (at < 0) at = others.findLastIndex((t) => t.time) + 1;
  const prev = orders[at - 1];
  const next = orders[at];
  if (prev == null && next == null) return 0;
  if (prev == null) return next - 1;
  if (next == null) return end;
  return (prev + next) / 2;
}

export function isDayFull(st, day) {
  const limit = dayLimit(st);
  return limit > 0 && dayTasks(st, day).open.length >= limit;
}

/** Поставленные на прошедшие дни и не сделанные — чтобы не пропадали из виду. */
export function carriedOver(st, today) {
  const visible = visibility(st);
  return st.tasks.filter((t) => isActive(t) && t.day && t.day < today && visible(t)).sort(compareTasks);
}

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
 * потом поставленное на даты дальше завтра (Upcoming, по датам), дальше
 * «Входящие» и сферы по порядку. Выбранные на завтра остаются в своих
 * группах — отмечены номером, повторный тап снимает выбор.
 */
export function planGroups(st, today) {
  const target = addDays(today, 1);
  const visible = visibility(st);
  const pool = st.tasks.filter((t) => isActive(t) && visible(t));
  const isCarried = (t) => t.day && t.day <= today;
  const isLater = (t) => t.day && t.day > target;
  const rest = pool.filter((t) => !isCarried(t) && !isLater(t));
  return {
    target,
    carried: pool.filter(isCarried).sort(compareTasks),
    upcoming: pool.filter(isLater).sort((a, b) => a.day.localeCompare(b.day) || (a.dayOrder ?? 0) - (b.dayOrder ?? 0)),
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

/** Поиск по названию, заметке и подзадачам: незавершённые сверху. */
export function searchTasks(st, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (v) => (v ?? '').toLowerCase().includes(q);
  return st.tasks
    .filter((t) => hit(t.title) || hit(t.note) || t.subtasks.some((x) => hit(x.title)))
    .sort((a, b) => isDone(a) - isDone(b) || compareTasks(a, b));
}

/**
 * Прогресс цели: если задано числовое значение (например, 10 откликов),
 * считается по нему; иначе — по шагам.
 */
/** Шаг кнопок −/+ по величине цели: для десятков — 1, для тысяч — сотня. */
export const autoStep = (target) => (target >= 5000 ? 100 : target >= 500 ? 10 : 1);

/** Шаг цели: заданный руками или по величине цели. */
export const goalStep = (goal) => (goal.step > 0 ? goal.step : autoStep(goal.target ?? 0));

export function goalProgress(goal) {
  const steps = goal.steps ?? [];
  if (goal.target > 0) {
    const current = Math.max(0, goal.current ?? 0);
    return { kind: 'value', done: Math.min(current, goal.target), total: goal.target, current, steps };
  }
  return { kind: 'steps', done: steps.filter((s) => s.done).length, total: steps.length, current: null, steps };
}

export const isGoalDone = (goal) => {
  const p = goalProgress(goal);
  return p.total > 0 && p.done >= p.total;
};

/** Все цели по порядку, с прогрессом. */
export function goalsOverview(st) {
  return [...st.goals].sort((a, b) => a.order - b.order).map((goal) => ({ goal, ...goalProgress(goal) }));
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
    goals: goalsOverview(st),
  };
}

