/**
 * Состояние в памяти + запись в IndexedDB.
 *
 * Изменение применяется к памяти сразу и синхронно перерисовывает экран —
 * ввод не ждёт диска. Запись в базу идёт следом; если она не удалась,
 * onError показывает это пользователю.
 */
import * as db from './db.js';
import { DAY_LIMIT, DEFAULT_SPHERES, GLYPHS, dayTasks, isDone } from './logic.js';

const state = { spheres: [], tasks: [], goals: [] };
const listeners = new Set();
let onError = () => {};

export const getState = () => state;
export const subscribe = (fn) => listeners.add(fn);
export const setErrorHandler = (fn) => (onError = fn);

const emit = () => listeners.forEach((fn) => fn());
const persist = (p) => p.catch((err) => onError(err));
const stamp = () => new Date().toISOString();

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function load() {
  const [spheres, tasks, goals, meta] = await Promise.all(['spheres', 'tasks', 'goals', 'meta'].map(db.getAll));
  Object.assign(state, { spheres, tasks, goals });

  // первый запуск: стартовые сферы
  if (!meta.some((m) => m.key === 'seeded')) {
    state.spheres = DEFAULT_SPHERES.map(([name, glyph], order) => ({
      id: uid(), name, glyph, order, archived: false, createdAt: stamp(),
    }));
    await db.batch([
      ...state.spheres.map((value) => ({ store: 'spheres', value })),
      { store: 'meta', value: { key: 'seeded', value: true } },
    ]);
  }
}

/* ── задачи ──────────────────────────────────────────────────────────── */

const findTask = (id) => state.tasks.find((t) => t.id === id);

export function createTask(title, patch = {}) {
  const t = {
    id: uid(), title, sphereId: null, priority: null, deadline: null, status: 'todo',
    subtasks: [], note: '', day: null, dayOrder: 0, createdAt: stamp(), doneAt: null,
    ...patch,
  };
  state.tasks.push(t);
  emit();
  persist(db.put('tasks', t));
  return t;
}

/** silent — только запись, без перерисовки: для полей, которые сейчас набираются. */
export function updateTask(id, patch, { silent = false } = {}) {
  const t = findTask(id);
  if (!t) return;
  Object.assign(t, patch, { updatedAt: stamp() });
  if (!silent) emit();
  persist(db.put('tasks', t));
}

export function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  emit();
  persist(db.remove('tasks', id));
}

/* статус до «готово» — чтобы снятая галочка вернула «в работе», а не «к выполнению» */
const statusBefore = new Map();

export function toggleDone(id) {
  const t = findTask(id);
  if (!t) return;
  if (isDone(t)) {
    updateTask(id, { status: statusBefore.get(id) ?? 'todo', doneAt: null });
  } else {
    statusBefore.set(id, t.status);
    updateTask(id, { status: 'done', doneAt: stamp() });
  }
}

export function setStatus(id, status) {
  const t = findTask(id);
  if (!t || t.status === status) return;
  updateTask(id, { status, doneAt: status === 'done' ? stamp() : null });
}

/**
 * Ставит задачу в день. День полон — ничего не делает и возвращает false:
 * экран предлагает заменить одну из трёх (replaceId). Задача на паузе,
 * поставленная в день, снимается с паузы — иначе её там не будет видно.
 */
export function planTask(id, day, replaceId = null) {
  const t = findTask(id);
  if (!t) return false;
  const { open } = dayTasks(state, day);
  const ops = [];
  let order;
  if (replaceId) {
    const old = findTask(replaceId);
    order = old.dayOrder;
    Object.assign(old, { day: null, dayOrder: 0 });
    ops.push({ store: 'tasks', value: old });
  } else {
    if (open.length >= DAY_LIMIT) return false;
    order = Math.max(-1, ...open.map((x) => x.dayOrder ?? 0)) + 1;
  }
  Object.assign(t, { day, dayOrder: order, updatedAt: stamp() });
  if (t.status === 'paused') t.status = 'todo';
  ops.push({ store: 'tasks', value: t });
  emit();
  persist(db.batch(ops));
  return true;
}

export const unplanTask = (id) => updateTask(id, { day: null, dayOrder: 0 });

/** Новый порядок дня: ids — незавершённые задачи дня в нужном порядке. */
export function reorderDay(ids) {
  const ops = ids.map((id, i) => {
    const t = findTask(id);
    t.dayOrder = i;
    return { store: 'tasks', value: t };
  });
  emit();
  persist(db.batch(ops));
}

export function addSubtask(taskId, title) {
  const t = findTask(taskId);
  if (t) updateTask(taskId, { subtasks: [...t.subtasks, { id: uid(), title, done: false }] });
}

export function updateSubtask(taskId, subId, patch) {
  const t = findTask(taskId);
  if (t) updateTask(taskId, { subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, ...patch } : s)) });
}

export function deleteSubtask(taskId, subId) {
  const t = findTask(taskId);
  if (t) updateTask(taskId, { subtasks: t.subtasks.filter((s) => s.id !== subId) });
}

/* ── сферы ───────────────────────────────────────────────────────────── */

export function createSphere(name) {
  const used = new Set(state.spheres.filter((s) => !s.archived).map((s) => s.glyph));
  const s = {
    id: uid(),
    name,
    glyph: GLYPHS.find((g) => !used.has(g)) ?? GLYPHS[state.spheres.length % GLYPHS.length],
    order: Math.max(-1, ...state.spheres.map((x) => x.order)) + 1,
    archived: false,
    createdAt: stamp(),
  };
  state.spheres.push(s);
  emit();
  persist(db.put('spheres', s));
  return s;
}

export function updateSphere(id, patch) {
  const s = state.spheres.find((x) => x.id === id);
  if (!s) return;
  Object.assign(s, patch);
  emit();
  persist(db.put('spheres', s));
}

export function reorderSpheres(ids) {
  const ops = ids.map((id, order) => {
    const s = state.spheres.find((x) => x.id === id);
    s.order = order;
    return { store: 'spheres', value: s };
  });
  emit();
  persist(db.batch(ops));
}

/* ── цели ────────────────────────────────────────────────────────────── */

const findGoal = (id) => state.goals.find((g) => g.id === id);

function saveGoal(g) {
  emit();
  persist(db.put('goals', g));
}

export function createGoal(title) {
  const g = {
    id: uid(), title, steps: [], createdAt: stamp(),
    order: Math.max(-1, ...state.goals.map((x) => x.order)) + 1,
  };
  state.goals.push(g);
  saveGoal(g);
  return g;
}

export function updateGoal(id, patch) {
  const g = findGoal(id);
  if (!g) return;
  Object.assign(g, patch);
  saveGoal(g);
}

export function deleteGoal(id) {
  state.goals = state.goals.filter((g) => g.id !== id);
  emit();
  persist(db.remove('goals', id));
}

export function addStep(goalId, title, month) {
  const g = findGoal(goalId);
  if (!g) return;
  g.steps = [...g.steps, { id: uid(), title, month, done: false }];
  saveGoal(g);
}

export function updateStep(goalId, stepId, patch) {
  const g = findGoal(goalId);
  if (!g) return;
  g.steps = g.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s));
  saveGoal(g);
}

export function deleteStep(goalId, stepId) {
  const g = findGoal(goalId);
  if (!g) return;
  g.steps = g.steps.filter((s) => s.id !== stepId);
  saveGoal(g);
}

/* ── импорт и восстановление ─────────────────────────────────────────── */

/** План из io.planImport: новые сферы и задачи, новые и дополненные цели. */
export async function applyImport(plan) {
  await db.batch([
    ...plan.spheres.map((value) => ({ store: 'spheres', value })),
    ...plan.tasks.map((value) => ({ store: 'tasks', value })),
    ...plan.goals.map((value) => ({ store: 'goals', value })),
  ]);
  state.spheres.push(...plan.spheres);
  state.tasks.push(...plan.tasks);
  for (const g of plan.goals) {
    const i = state.goals.findIndex((x) => x.id === g.id);
    if (i >= 0) state.goals[i] = g;
    else state.goals.push(g);
  }
  emit();
}

/** Полная замена из резервной копии: сначала база, потом память — копия встаёт целиком или никак. */
export async function restore(data) {
  await db.replaceAll(data);
  Object.assign(state, { spheres: data.spheres, tasks: data.tasks, goals: data.goals });
  emit();
}
