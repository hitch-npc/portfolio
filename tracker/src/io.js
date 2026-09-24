/**
 * Резервная копия и импорт — чистые функции, без DOM и базы.
 *
 * Два вида файлов:
 *  · резервная копия (свой экспорт: app = 'tracker') — заменяет всё;
 *  · файл импорта (tasks / spheres / goals) — добавляется к тому, что есть:
 *    сферы и цели сопоставляются по названию, повторы задач пропускаются.
 *
 * Разбор импорта терпимый: поля принимаются под разными именами
 * (title/name, deadline/due, …) и значениями (high/высокий/1, …).
 */
import { GLYPHS, DAY_LIMIT, isDone } from './logic.js';
import { monthOf } from './dates.js';

export const APP = 'tracker';
export const SCHEMA = 1;

export function makeBackup(st, now = new Date()) {
  return {
    app: APP,
    schema: SCHEMA,
    exportedAt: now.toISOString(),
    spheres: st.spheres,
    tasks: st.tasks,
    goals: st.goals,
  };
}

export const backupName = (day) => `tracker-backup-${day}.json`;

/** 'backup' | 'import' | null */
export function detect(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.app === APP && Number.isInteger(data.schema)) return 'backup';
  if (['tasks', 'spheres', 'goals'].some((k) => Array.isArray(data[k]))) return 'import';
  return null;
}

/* ── нормализация ─────────────────────────────────────────────────────── */

const text = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const key = (s) => text(s).toLowerCase().replace(/\s+/g, ' ');

function pick(obj, ...names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const n of names) if (obj[n] != null && obj[n] !== '') return obj[n];
  return undefined;
}

const STATUS_WORDS = {
  todo: ['todo', 'to do', 'to-do', 'to_do', 'open', 'new', 'pending', 'backlog', 'к выполнению', 'сделать'],
  doing: ['doing', 'in progress', 'in_progress', 'in-progress', 'progress', 'wip', 'started', 'active', 'в работе'],
  paused: ['paused', 'pause', 'on hold', 'on_hold', 'hold', 'blocked', 'waiting', 'пауза', 'на паузе'],
  done: ['done', 'completed', 'complete', 'closed', 'finished', 'готово', 'сделано', 'выполнено'],
};
const PRIORITY_WORDS = {
  high: ['high', 'h', '1', 'p1', 'urgent', 'высокий', 'высокая'],
  medium: ['medium', 'med', 'm', '2', 'p2', 'normal', 'средний', 'средняя'],
  low: ['low', 'l', '3', 'p3', 'низкий', 'низкая'],
};

function fromWords(table, v) {
  const k = key(v);
  for (const [value, words] of Object.entries(table)) if (words.includes(k)) return value;
  return null;
}

export const normStatus = (v) => fromWords(STATUS_WORDS, v);
export const normPriority = (v) => fromWords(PRIORITY_WORDS, v);

/** 'YYYY-MM-DD', ISO с временем или 'DD.MM.YYYY' → 'YYYY-MM-DD'; остальное — null. */
export function normDate(v) {
  const s = text(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function normMonth(v) {
  const m = text(v).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function normChecklist(list, uid) {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => {
      const title = text(typeof s === 'object' ? pick(s, 'title', 'name', 'text') : s);
      const done = typeof s === 'object' && Boolean(pick(s, 'done', 'completed', 'checked'));
      return title ? { id: uid(), title, done } : null;
    })
    .filter(Boolean);
}

/* ── импорт: план слияния ─────────────────────────────────────────────── */

/**
 * Считает, что добавится, ничего не меняя. Результат — готовые объекты для
 * базы и сводка для подтверждения.
 *
 * ctx: { uid, now: Date, today: 'YYYY-MM-DD' }
 */
export function planImport(st, data, { uid, now = new Date(), today }) {
  const stamp = now.toISOString();
  const month = monthOf(today);

  // сферы: существующие по названию (сначала активные), новые — в конец
  const spheres = new Map();
  for (const s of [...st.spheres].sort((a, b) => a.archived - b.archived)) {
    if (!spheres.has(key(s.name))) spheres.set(key(s.name), s);
  }
  const newSpheres = [];
  const used = new Set(st.spheres.filter((s) => !s.archived).map((s) => s.glyph));
  let order = Math.max(-1, ...st.spheres.map((s) => s.order)) + 1;

  function sphereFor(name, glyph) {
    const k = key(name);
    if (!k || k === 'inbox' || k === 'входящие') return null;
    if (spheres.has(k)) return spheres.get(k);
    const g = GLYPHS.includes(glyph) ? glyph : GLYPHS.find((x) => !used.has(x)) ?? GLYPHS[order % GLYPHS.length];
    used.add(g);
    const s = { id: uid(), name: text(name), glyph: g, order: order++, archived: false, createdAt: stamp };
    spheres.set(k, s);
    newSpheres.push(s);
    return s;
  }

  // сферы файла; id из файла запоминаем, чтобы задачи могли ссылаться по нему
  const fileIds = new Map();
  for (const raw of Array.isArray(data.spheres) ? data.spheres : []) {
    const name = typeof raw === 'string' ? raw : pick(raw, 'name', 'title');
    const s = sphereFor(name, typeof raw === 'object' ? pick(raw, 'glyph', 'shape') : undefined);
    const fileId = typeof raw === 'object' ? pick(raw, 'id', 'key', 'slug') : undefined;
    if (s && fileId != null) fileIds.set(String(fileId), s);
  }

  // задачи: повтор — задача с тем же названием в той же сфере, в том числе уже сделанная
  // (иначе файл, собранный из старого списка, вернёт закрытое обратно)
  const seen = new Set(st.tasks.map((t) => `${t.sphereId ?? ''}|${key(t.title)}`));
  const newTasks = [];
  let skipped = 0;
  const dayCount = new Map();
  const openOn = (day) =>
    dayCount.get(day) ?? st.tasks.filter((t) => t.day === day && !isDone(t) && t.status !== 'paused').length;
  const lastOrder = new Map();
  const nextOrder = (day) => {
    const n = (lastOrder.get(day) ?? Math.max(-1, ...st.tasks.filter((t) => t.day === day).map((t) => t.dayOrder ?? 0))) + 1;
    lastOrder.set(day, n);
    return n;
  };

  for (const raw of Array.isArray(data.tasks) ? data.tasks : []) {
    const title = text(typeof raw === 'string' ? raw : pick(raw, 'title', 'name', 'text', 'task'));
    if (!title) continue;
    const r = typeof raw === 'object' ? raw : {};

    const ref = pick(r, 'sphere', 'sphereName', 'sphere_name', 'sphereId', 'sphere_id', 'area', 'project');
    const refObj = ref && typeof ref === 'object' ? pick(ref, 'name', 'title') : ref;
    const sphere = refObj != null && fileIds.has(String(refObj)) ? fileIds.get(String(refObj)) : sphereFor(refObj);

    const dedupe = `${sphere?.id ?? ''}|${key(title)}`;
    const status = normStatus(pick(r, 'status', 'state')) ?? (pick(r, 'done', 'completed') === true ? 'done' : 'todo');
    if (seen.has(dedupe)) {
      skipped++;
      continue;
    }
    seen.add(dedupe);

    // «на день» из файла принимаем, только пока день не полон
    let day = normDate(pick(r, 'day', 'planned', 'plannedFor', 'planned_for', 'scheduled', 'today'));
    if (day && (status === 'done' || status === 'paused' || openOn(day) >= DAY_LIMIT)) day = null;
    if (day) dayCount.set(day, openOn(day) + 1);

    newTasks.push({
      id: uid(),
      title,
      sphereId: sphere?.id ?? null,
      priority: normPriority(pick(r, 'priority', 'prio', 'importance')),
      deadline: normDate(pick(r, 'deadline', 'due', 'dueDate', 'due_date', 'date')),
      status,
      subtasks: normChecklist(pick(r, 'subtasks', 'checklist', 'steps', 'items'), uid),
      note: text(pick(r, 'note', 'notes', 'description', 'comment')),
      day,
      dayOrder: day ? nextOrder(day) : 0,
      createdAt: stamp,
      doneAt: status === 'done' ? stamp : null,
    });
  }

  // цели: по названию; шаги добавляются, если такого шага в этом месяце ещё нет
  const goals = new Map(st.goals.map((g) => [key(g.title), g]));
  const newGoals = [];
  const changedGoals = new Map();
  let goalOrder = Math.max(-1, ...st.goals.map((g) => g.order)) + 1;
  let newSteps = 0;

  for (const raw of Array.isArray(data.goals) ? data.goals : []) {
    const title = text(typeof raw === 'string' ? raw : pick(raw, 'title', 'name', 'goal'));
    if (!title) continue;
    const r = typeof raw === 'object' ? raw : {};
    const goalMonth = normMonth(pick(r, 'month')) ?? month;

    let goal = goals.get(key(title));
    if (!goal) {
      goal = { id: uid(), title, order: goalOrder++, steps: [], createdAt: stamp };
      goals.set(key(title), goal);
      newGoals.push(goal);
    } else {
      goal = changedGoals.get(goal.id) ?? { ...goal, steps: [...goal.steps] };
      changedGoals.set(goal.id, goal);
      goals.set(key(title), goal);
    }

    const steps = pick(r, 'steps', 'monthSteps', 'month_steps', 'milestones', 'tasks') ?? [];
    for (const s of Array.isArray(steps) ? steps : []) {
      const stepTitle = text(typeof s === 'object' ? pick(s, 'title', 'name', 'text') : s);
      if (!stepTitle) continue;
      const stepMonth = (typeof s === 'object' && normMonth(pick(s, 'month'))) || goalMonth;
      if (goal.steps.some((x) => x.month === stepMonth && key(x.title) === key(stepTitle))) continue;
      goal.steps.push({
        id: uid(),
        title: stepTitle,
        month: stepMonth,
        done: typeof s === 'object' && Boolean(pick(s, 'done', 'completed', 'checked')),
      });
      newSteps++;
    }
  }

  return {
    spheres: newSpheres,
    tasks: newTasks,
    goals: [...newGoals, ...changedGoals.values()],
    summary: {
      spheres: newSpheres.length,
      tasks: newTasks.length,
      goals: newGoals.length,
      steps: newSteps,
      skipped,
    },
  };
}

/* ── резервная копия: проверка перед заменой ─────────────────────────── */

/** Оставляет только годные записи; бросает ошибку, если файл не похож на копию. */
export function readBackup(data) {
  if (detect(data) !== 'backup') throw new Error('Not a tracker backup');
  if (data.schema > SCHEMA) throw new Error('Backup is from a newer version of the app');
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    spheres: list(data.spheres).filter((s) => s && s.id && text(s.name)),
    tasks: list(data.tasks)
      .filter((t) => t && t.id && text(t.title))
      .map((t) => ({ ...t, subtasks: list(t.subtasks) })),
    goals: list(data.goals)
      .filter((g) => g && g.id && text(g.title))
      .map((g) => ({ ...g, steps: list(g.steps) })),
  };
}
