/**
 * Состояние в памяти + запись в IndexedDB.
 *
 * Изменение применяется к памяти сразу и синхронно перерисовывает экран —
 * ввод не ждёт диска. Запись в базу идёт следом; если она не удалась,
 * onError показывает это пользователю.
 */
import * as db from './db.js';
import {
  DEFAULT_SETTINGS, DEFAULT_SPHERES, STARTER_GOAL, STARTER_TASKS, GLYPHS, COLORS, colorize, dayTasks, isDayFull, isDone,
  nextColor, timeSlot,
} from './logic.js';
import { addDays, diffDays, nextRepeat, todayISO } from './dates.js';

/** files — вложения задач: { id, taskId, name, type, size, createdAt, blob }. */
const state = { spheres: [], tasks: [], goals: [], files: [], settings: { ...DEFAULT_SETTINGS } };
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
  const [spheres, tasks, goals, meta, files] = await Promise.all(['spheres', 'tasks', 'goals', 'meta', 'files'].map(db.getAll));
  const saved = meta.find((m) => m.key === 'settings')?.value;
  Object.assign(state, { spheres, tasks, goals, files, settings: { ...DEFAULT_SETTINGS, ...saved } });

  // первый запуск: стартовые сферы, задачи-подсказки и цель-пример
  if (!meta.some((m) => m.key === 'seeded')) {
    state.spheres = DEFAULT_SPHERES.map(([name, glyph], order) => ({
      id: uid(), name, glyph, color: COLORS[order % COLORS.length], order, archived: false, createdAt: stamp(),
    }));
    // подсказки — только в пустой трекер (данных нет — показать нечего)
    if (!state.tasks.length && !state.goals.length) {
      const today = todayISO();
      state.tasks = STARTER_TASKS.map((x, i) => ({
        id: uid(), title: x.title, sphereId: x.sphere == null ? null : state.spheres[x.sphere].id,
        priority: null, deadline: null, status: 'todo',
        subtasks: (x.subtasks ?? []).map((title) => ({ id: uid(), title, done: false })),
        note: '', day: x.today ? today : null, dayOrder: i, time: null, repeat: null, createdAt: stamp(), doneAt: null,
      }));
      state.goals = [{ id: uid(), steps: [], deadline: null, createdAt: stamp(), order: 0, ...STARTER_GOAL }];
    }
    await db.batch([
      ...state.spheres.map((value) => ({ store: 'spheres', value })),
      ...state.tasks.map((value) => ({ store: 'tasks', value })),
      ...state.goals.map((value) => ({ store: 'goals', value })),
      { store: 'meta', value: { key: 'seeded', value: true } },
    ]);
  }
  colorSpheres();
}

/** Сферы из времени до цветов получают цвет по порядку — один раз, дальше он свой. */
function colorSpheres() {
  const changed = colorize(state.spheres);
  if (changed.length) persist(db.batch(changed.map((value) => ({ store: 'spheres', value }))));
}

/* ── настройки ───────────────────────────────────────────────────────── */

export function setSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  emit();
  persist(db.put('meta', { key: 'settings', value: state.settings }));
}

/* ── задачи ──────────────────────────────────────────────────────────── */

const findTask = (id) => state.tasks.find((t) => t.id === id);

/** Место в конце дня: порядок следующий за последней задачей этого дня. */
const endOf = (day) => Math.max(-1, ...state.tasks.filter((t) => t.day === day).map((t) => t.dayOrder ?? 0)) + 1;

/** Место в дне: со временем — по времени (logic.timeSlot), без — в конец. */
const slotOf = (t, day) => (t.time ? timeSlot(state, t, day) : endOf(day));

export function createTask(title, patch = {}) {
  const t = {
    id: uid(), title, sphereId: null, priority: null, deadline: null, status: 'todo',
    subtasks: [], note: '', day: null, dayOrder: 0, time: null, repeat: null, createdAt: stamp(), doneAt: null,
    ...patch,
  };
  if (t.day) t.dayOrder = slotOf(t, t.day);
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

/** Удаляет задачи вместе с их вложениями. */
export function deleteTasks(ids) {
  const gone = new Set(ids);
  const files = state.files.filter((f) => gone.has(f.taskId));
  state.tasks = state.tasks.filter((t) => !gone.has(t.id));
  state.files = state.files.filter((f) => !gone.has(f.taskId));
  emit();
  persist(db.batch([
    ...ids.map((id) => ({ store: 'tasks', id, remove: true })),
    ...files.map((f) => ({ store: 'files', id: f.id, remove: true })),
  ]));
}

export const deleteTask = (id) => deleteTasks([id]);

/* статус до «готово» — чтобы снятая галочка вернула «в работе», а не «к выполнению» */
const statusBefore = new Map();

/**
 * Следующий раз повторяющейся задачи: тот же текст, сфера, приоритет и
 * подзадачи (неотмеченные), день — по правилу повтора, но не раньше завтра.
 * Лимит дня тут не проверяется: повтор назначили заранее, его не отменяют.
 */
function spawnNext(t) {
  const today = todayISO();
  let day = nextRepeat(t.day ?? today, t.repeat);
  while (day <= today) day = nextRepeat(day, t.repeat);
  const shift = diffDays(t.day ?? today, day);
  const next = {
    id: uid(), title: t.title, sphereId: t.sphereId, priority: t.priority,
    deadline: t.deadline ? addDays(t.deadline, shift) : null,
    status: 'todo', subtasks: t.subtasks.map((x) => ({ ...x, id: uid(), done: false })), note: t.note,
    day, dayOrder: 0, time: t.time ?? null, repeat: t.repeat, createdAt: stamp(), doneAt: null,
  };
  next.dayOrder = slotOf(next, day);
  return next;
}

/** Отмечает или снимает отметку. Для повторяющейся возвращает созданную следующую задачу. */
export function toggleDone(id) {
  const t = findTask(id);
  if (!t) return null;
  const ops = [];
  let next = null;
  if (isDone(t)) {
    // снятая отметка забирает и следующий повтор, если его ещё не трогали
    const n = t.nextId && findTask(t.nextId);
    if (n && !isDone(n)) {
      state.tasks = state.tasks.filter((x) => x !== n);
      ops.push({ store: 'tasks', id: n.id, remove: true });
    }
    Object.assign(t, { status: statusBefore.get(id) ?? 'todo', doneAt: null, nextId: null });
  } else {
    statusBefore.set(id, t.status);
    Object.assign(t, { status: 'done', doneAt: stamp() });
    if (t.repeat && t.repeat !== 'none') {
      next = spawnNext(t);
      t.nextId = next.id;
      state.tasks.push(next);
      ops.push({ store: 'tasks', value: next });
    }
  }
  t.updatedAt = stamp();
  ops.push({ store: 'tasks', value: t });
  emit();
  persist(db.batch(ops));
  return next;
}

export function setStatus(id, status) {
  const t = findTask(id);
  if (!t || t.status === status) return;
  updateTask(id, { status, doneAt: status === 'done' ? stamp() : null });
}

/**
 * Ставит задачу в день (extra — время и повтор из шторки даты). День полон —
 * ничего не делает и возвращает false: экран предлагает заменить одну
 * из задач дня (replaceId). Задача на паузе, поставленная в день, снимается
 * с паузы — иначе её там не будет видно. Тот же день — только extra.
 */
export function planTask(id, day, replaceId = null, extra = {}) {
  const t = findTask(id);
  if (!t) return false;
  if (!day) {
    updateTask(id, { day: null, dayOrder: 0, time: null, repeat: null });
    return true;
  }
  const ops = [];
  let order = t.dayOrder;
  const timeChanged = 'time' in extra && (extra.time ?? null) !== (t.time ?? null);
  if (t.day !== day || isDone(t)) {
    if (replaceId) {
      // замена занимает место заменённой — его выбрали руками
      const old = findTask(replaceId);
      order = old.dayOrder;
      Object.assign(old, { day: null, dayOrder: 0 });
      ops.push({ store: 'tasks', value: old });
    } else {
      if (!isDone(t) && isDayFull(state, day)) return false;
      order = null;
    }
  } else if (timeChanged) {
    order = null; // время поменяли — задача встаёт по новому времени
  }
  Object.assign(t, extra, { day, updatedAt: stamp() });
  t.dayOrder = order ?? slotOf(t, day);
  if (t.status === 'paused') t.status = 'todo';
  ops.push({ store: 'tasks', value: t });
  emit();
  persist(db.batch(ops));
  return true;
}

export const unplanTask = (id) => planTask(id, null);

/**
 * Несколько задач в один день — сколько поместится, по порядку.
 * day = null снимает дату. Возвращает число поставленных.
 */
export function planMany(ids, day) {
  const ops = [];
  let placed = 0;
  for (const id of ids) {
    const t = findTask(id);
    if (!t) continue;
    if (!day) Object.assign(t, { day: null, dayOrder: 0, time: null, repeat: null });
    else if (t.day === day) { placed++; continue; }
    else if (isDone(t) || !isDayFull(state, day)) Object.assign(t, { day, dayOrder: slotOf(t, day), status: t.status === 'paused' ? 'todo' : t.status });
    else continue;
    placed++;
    t.updatedAt = stamp();
    ops.push({ store: 'tasks', value: t });
  }
  emit();
  if (ops.length) persist(db.batch(ops));
  return placed;
}

/** Одно и то же изменение нескольким задачам (сфера, приоритет). */
export function updateMany(ids, patch) {
  const ops = ids.map(findTask).filter(Boolean).map((t) => {
    const timeChanged = 'time' in patch && (patch.time ?? null) !== (t.time ?? null);
    Object.assign(t, patch, { updatedAt: stamp() });
    if (timeChanged && t.day) t.dayOrder = slotOf(t, t.day);
    return { store: 'tasks', value: t };
  });
  emit();
  persist(db.batch(ops));
}

/** Отметить несколько сделанными (повторяющиеся ставят следующий раз). */
export function completeMany(ids) {
  for (const id of ids) {
    const t = findTask(id);
    if (t && !isDone(t)) toggleDone(id);
  }
}

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

/* ── вложения ────────────────────────────────────────────────────────── */

export const filesOf = (taskId) => state.files.filter((f) => f.taskId === taskId);

/**
 * Файлы копируются в базу целиком (Blob из прочитанных байтов): ссылка на
 * файл из системного выбора в Safari может пропасть после закрытия выбора.
 */
export async function addFiles(taskId, list) {
  const records = [];
  for (const file of list) {
    const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' });
    records.push({
      id: uid(), taskId, name: file.name || 'file', type: blob.type, size: blob.size, createdAt: stamp(), blob,
    });
  }
  await db.batch(records.map((value) => ({ store: 'files', value })));
  state.files.push(...records);
  emit();
  return records;
}

export function deleteFile(id) {
  state.files = state.files.filter((f) => f.id !== id);
  emit();
  persist(db.remove('files', id));
}

/* ── сферы ───────────────────────────────────────────────────────────── */

export function createSphere(name) {
  const used = new Set(state.spheres.filter((s) => !s.archived).map((s) => s.glyph));
  const s = {
    id: uid(),
    name,
    glyph: GLYPHS.find((g) => !used.has(g)) ?? GLYPHS[state.spheres.length % GLYPHS.length],
    color: nextColor(state.spheres),
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

/**
 * Удалить сферу насовсем. Её задачи не удаляются — уходят во «Входящие».
 * Возвращает, сколько задач переехало.
 */
export function deleteSphere(id) {
  const moved = state.tasks.filter((t) => t.sphereId === id);
  for (const t of moved) t.sphereId = null;
  state.spheres = state.spheres.filter((s) => s.id !== id);
  emit();
  persist(db.batch([
    ...moved.map((value) => ({ store: 'tasks', value })),
    { store: 'spheres', id, remove: true },
  ]));
  return moved.length;
}

/* ── цели ────────────────────────────────────────────────────────────── */

const findGoal = (id) => state.goals.find((g) => g.id === id);

function saveGoal(g) {
  emit();
  persist(db.put('goals', g));
}

/**
 * Цель: название, необязательные число (target, current, unit) и срок,
 * шаги — простой чек-лист.
 */
/** fields — сразу число, единица, шаг, срок (из поля новой цели). */
export function createGoal(title, fields = {}) {
  const g = {
    id: uid(), title, steps: [], target: null, current: 0, unit: '', step: null, deadline: null, createdAt: stamp(),
    order: Math.max(-1, ...state.goals.map((x) => x.order)) + 1,
    ...fields,
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

/** Текущее значение цели ± шаг, не ниже нуля. */
export function bumpGoal(id, delta) {
  const g = findGoal(id);
  if (!g) return;
  g.current = Math.max(0, Math.round(((g.current ?? 0) + delta) * 100) / 100);
  saveGoal(g);
}

export function addStep(goalId, title) {
  const g = findGoal(goalId);
  if (!g) return;
  g.steps = [...g.steps, { id: uid(), title, done: false }];
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
/**
 * Импорт по плану (io.planImport): новое добавляется, правки по id заменяют
 * записи, удаления убирают задачи с вложениями и цели. Повторяющаяся задача,
 * которую импорт отметил сделанной, ставит следующий раз — как галочка руками.
 */
export async function applyImport(plan) {
  const ch = plan.changes ?? { spheres: [], tasks: [], deleteTasks: [], deleteGoals: [] };
  const goneTasks = new Set(ch.deleteTasks);
  const goneGoals = new Set(ch.deleteGoals);
  const files = state.files.filter((f) => goneTasks.has(f.taskId));
  const spawned = [];
  for (const t of ch.tasks) {
    const before = findTask(t.id);
    if (isDone(t) && before && !isDone(before) && t.repeat && t.repeat !== 'none' && !t.nextId) {
      const next = spawnNext(t);
      t.nextId = next.id;
      spawned.push(next);
    }
  }
  await db.batch([
    ...[...plan.spheres, ...ch.spheres].map((value) => ({ store: 'spheres', value })),
    ...[...plan.tasks, ...ch.tasks, ...spawned].map((value) => ({ store: 'tasks', value })),
    ...plan.goals.map((value) => ({ store: 'goals', value })),
    ...[...goneTasks].map((id) => ({ store: 'tasks', id, remove: true })),
    ...files.map((f) => ({ store: 'files', id: f.id, remove: true })),
    ...[...goneGoals].map((id) => ({ store: 'goals', id, remove: true })),
  ]);
  const put = (list, items) => {
    for (const x of items) {
      const i = list.findIndex((y) => y.id === x.id);
      if (i >= 0) list[i] = x;
      else list.push(x);
    }
  };
  put(state.spheres, [...plan.spheres, ...ch.spheres]);
  put(state.tasks, [...plan.tasks, ...ch.tasks, ...spawned]);
  put(state.goals, plan.goals);
  state.tasks = state.tasks.filter((t) => !goneTasks.has(t.id));
  state.files = state.files.filter((f) => !goneTasks.has(f.taskId));
  state.goals = state.goals.filter((g) => !goneGoals.has(g.id));
  emit();
}

/** Полная замена из резервной копии: сначала база, потом память — копия встаёт целиком или никак. */
export async function restore(data) {
  await db.replaceAll(data);
  Object.assign(state, { spheres: data.spheres, tasks: data.tasks, goals: data.goals, files: data.files });
  colorSpheres();
  if (data.settings) {
    state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    persist(db.put('meta', { key: 'settings', value: state.settings }));
  }
  emit();
}
