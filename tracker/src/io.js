/**
 * Резервная копия и импорт — чистые функции, без DOM и базы.
 *
 * Два вида данных:
 *  · резервная копия (свой экспорт: app = 'tracker') — заменяет всё;
 *  · импорт (tasks / spheres / goals) — добавляется к тому, что есть:
 *    сферы и цели сопоставляются по названию, повторы задач пропускаются;
 *    запись с id существующей задачи, цели или сферы меняет её (только
 *    указанные поля), с "delete": true — удаляет. Так ИИ может не только
 *    заполнить трекер, но и поправить его (см. aiPrompt).
 *    Импорт приходит JSON-ом, таблицей CSV или простым списком
 *    (текст, Markdown) — всё сводится к одному виду и дальше идёт общим путём.
 *
 * Разбор импорта терпимый: поля принимаются под разными именами
 * (title/name, deadline/due, …) и значениями (high/высокий/1, …).
 */
import { GLYPHS, dayLimit, isDone, timeSlot } from './logic.js';
import { addDays, fmtLong, fmtWeekday } from './dates.js';

export const APP = 'tracker';
/** 2 — вложения (files, base64) и настройки в копии. */
export const SCHEMA = 2;

/** files — уже упакованные packFiles: копия — это текст, Blob в JSON не ложится. */
export function makeBackup(st, now = new Date(), files = []) {
  return {
    app: APP,
    schema: SCHEMA,
    exportedAt: now.toISOString(),
    settings: st.settings,
    spheres: st.spheres,
    tasks: st.tasks,
    goals: st.goals,
    files,
  };
}

/* Base64 кусками: String.fromCharCode(...огромный массив) переполняет стек. */
function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* atob, а не fetch('data:…'): политика безопасности страницы fetch к data: не пускает. */
function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Вложения → записи для копии: всё, кроме Blob, как есть, байты — base64 в data. */
export async function packFiles(files) {
  const out = [];
  for (const { blob, ...meta } of files) out.push({ ...meta, data: toBase64(new Uint8Array(await blob.arrayBuffer())) });
  return out;
}

function unpackFiles(list, taskIds) {
  return list
    .filter((f) => f && f.id && taskIds.has(f.taskId) && typeof f.data === 'string')
    .map(({ data, ...meta }) => {
      const blob = new Blob([fromBase64(data)], { type: meta.type || 'application/octet-stream' });
      return { ...meta, name: text(meta.name) || 'file', size: blob.size, blob };
    });
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

/** Поле есть в записи — даже пустое или null: так правка может очистить значение. */
const has = (obj, ...names) => names.some((n) => Object.hasOwn(obj, n));

/** Запись просит удаления. */
const wantsDelete = (r) => [r.delete, r.remove, r.deleted].includes(true);

/** Пункты чек-листа (подзадачи, шаги цели): новые — в конец, у знакомых по названию — отметка. */
function mergeChecklist(items, list, uid) {
  let added = 0;
  for (const s of Array.isArray(list) ? list : []) {
    const title = text(typeof s === 'object' ? pick(s, 'title', 'name', 'text') : s);
    if (!title) continue;
    const done = typeof s === 'object' ? pick(s, 'done', 'completed', 'checked') : undefined;
    const known = items.find((x) => key(x.title) === key(title));
    if (known) {
      if (typeof done === 'boolean') known.done = done;
      continue;
    }
    items.push({ id: uid(), title, done: done === true });
    added++;
  }
  return added;
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

const REPEAT_WORDS = {
  daily: ['daily', 'every day', 'day', 'каждый день', 'ежедневно'],
  weekdays: ['weekdays', 'workdays', 'every weekday', 'по будням', 'будни'],
  weekly: ['weekly', 'every week', 'week', 'каждую неделю', 'еженедельно'],
  monthly: ['monthly', 'every month', 'month', 'каждый месяц', 'ежемесячно'],
};

export const normStatus = (v) => fromWords(STATUS_WORDS, v);
export const normPriority = (v) => fromWords(PRIORITY_WORDS, v);
export const normRepeat = (v) => fromWords(REPEAT_WORDS, v);

/** '9:05', '09:05' → '09:05'; остальное — null. */
export function normTime(v) {
  const m = text(v).match(/^(\d{1,2}):(\d{2})$/);
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function normNumber(v) {
  const n = typeof v === 'number' ? v : Number(text(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** 'YYYY-MM-DD', ISO с временем или 'DD.MM.YYYY' → 'YYYY-MM-DD'; остальное — null. */
export function normDate(v) {
  const s = text(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
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
export function planImport(st, data, { uid, now = new Date() }) {
  const stamp = now.toISOString();
  const limit = dayLimit(st);

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

  // сферы файла; id из файла запоминаем, чтобы задачи могли ссылаться по нему.
  // id существующей сферы — правка: новое имя, глиф, архив
  const fileIds = new Map(st.spheres.map((s) => [s.id, s]));
  const changedSpheres = new Map();
  for (const raw of Array.isArray(data.spheres) ? data.spheres : []) {
    const cur = raw && typeof raw === 'object' ? st.spheres.find((s) => s.id === text(pick(raw, 'id'))) : null;
    if (cur) {
      const s = changedSpheres.get(cur.id) ?? { ...cur };
      const name = text(pick(raw, 'name', 'title'));
      if (name && key(name) !== key(s.name) && !spheres.has(key(name))) {
        spheres.delete(key(s.name));
        s.name = name;
        spheres.set(key(name), s);
      }
      const glyph = pick(raw, 'glyph', 'shape');
      if (GLYPHS.includes(glyph)) s.glyph = glyph;
      if (typeof raw.archived === 'boolean') s.archived = raw.archived;
      changedSpheres.set(s.id, s);
      fileIds.set(s.id, s);
      continue;
    }
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
  // место в дне — как у задач, добавленных руками: со временем — по времени (logic.timeSlot)
  const work = { ...st, tasks: [...st.tasks] };
  const place = (t) => {
    work.tasks = work.tasks.filter((x) => x.id !== t.id);
    t.dayOrder = t.day ? timeSlot(work, t, t.day) : 0;
    work.tasks.push(t);
  };
  const SPHERE_KEYS = ['sphere', 'sphereName', 'sphere_name', 'sphereId', 'sphere_id', 'area', 'project'];
  const sphereOf = (r) => {
    const ref = pick(r, ...SPHERE_KEYS);
    const refObj = ref && typeof ref === 'object' ? pick(ref, 'name', 'title') : ref;
    return refObj != null && fileIds.has(String(refObj)) ? fileIds.get(String(refObj)) : sphereFor(refObj);
  };

  // правки существующих задач по id
  const changedTasks = new Map();
  const goneTasks = new Set();
  let madeDone = 0;
  let notFound = 0;
  let noRoom = 0;
  function changeTask(cur, r) {
    if (wantsDelete(r)) {
      goneTasks.add(cur.id);
      changedTasks.delete(cur.id);
      return;
    }
    const t = changedTasks.get(cur.id) ?? { ...cur, subtasks: cur.subtasks.map((x) => ({ ...x })) };
    const title = text(pick(r, 'title', 'name', 'text', 'task'));
    if (title) t.title = title;
    if (has(r, ...SPHERE_KEYS)) t.sphereId = sphereOf(r)?.id ?? null;
    if (has(r, 'note', 'notes', 'description')) t.note = text(pick(r, 'note', 'notes', 'description'));
    if (has(r, 'priority', 'prio')) t.priority = normPriority(pick(r, 'priority', 'prio'));
    if (has(r, 'deadline', 'due', 'dueDate', 'due_date')) t.deadline = normDate(pick(r, 'deadline', 'due', 'dueDate', 'due_date'));
    const status = normStatus(pick(r, 'status', 'state')) ?? (r.done === true ? 'done' : r.done === false ? 'todo' : null);
    if (status && status !== t.status) {
      if (status === 'done' && cur.status !== 'done') madeDone++;
      t.status = status;
      t.doneAt = status === 'done' ? stamp : null;
    }
    let moved = false;
    if (has(r, 'day', 'planned', 'plannedFor', 'planned_for', 'scheduled')) {
      const day = normDate(pick(r, 'day', 'planned', 'plannedFor', 'planned_for', 'scheduled'));
      if (day !== t.day) {
        if (day && !isDone(t) && limit > 0 && openOn(day) >= limit) noRoom++;
        else {
          if (t.day && !isDone(t)) dayCount.set(t.day, openOn(t.day) - 1);
          if (day && !isDone(t)) dayCount.set(day, openOn(day) + 1);
          t.day = day;
          moved = true;
          if (!day) Object.assign(t, { time: null, repeat: null });
        }
      }
    }
    if (has(r, 'time', 'at') && t.day) {
      const time = normTime(pick(r, 'time', 'at'));
      if (time !== t.time) {
        t.time = time;
        moved = true;
      }
    }
    if (has(r, 'repeat', 'recurrence', 'recurring') && t.day) t.repeat = normRepeat(pick(r, 'repeat', 'recurrence', 'recurring'));
    if (moved) place(t);
    mergeChecklist(t.subtasks, pick(r, 'subtasks', 'checklist', 'items'), uid);
    t.updatedAt = stamp;
    changedTasks.set(t.id, t);
  }

  for (const raw of Array.isArray(data.tasks) ? data.tasks : []) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const id = text(pick(r, 'id'));
    const cur = id ? st.tasks.find((t) => t.id === id) : null;
    if (cur) {
      changeTask(cur, r);
      continue;
    }
    // незнакомый id: удалять нечего; иначе это просто новая задача (ИИ мог придумать id сам)
    if (id && wantsDelete(r)) {
      notFound++;
      continue;
    }
    const title = text(typeof raw === 'string' ? raw : pick(r, 'title', 'name', 'text', 'task'));
    if (!title) continue;
    const sphere = sphereOf(r);

    const dedupe = `${sphere?.id ?? ''}|${key(title)}`;
    const status = normStatus(pick(r, 'status', 'state')) ?? (pick(r, 'done', 'completed') === true ? 'done' : 'todo');
    if (seen.has(dedupe)) {
      skipped++;
      continue;
    }
    seen.add(dedupe);

    // «на день» из файла принимаем, только пока день не полон
    let day = normDate(pick(r, 'day', 'planned', 'plannedFor', 'planned_for', 'scheduled', 'today'));
    if (day && (status === 'done' || status === 'paused' || (limit > 0 && openOn(day) >= limit))) day = null;
    if (day) dayCount.set(day, openOn(day) + 1);

    const t = {
      id: uid(),
      title,
      sphereId: sphere?.id ?? null,
      priority: normPriority(pick(r, 'priority', 'prio', 'importance')),
      deadline: normDate(pick(r, 'deadline', 'due', 'dueDate', 'due_date', 'date')),
      status,
      subtasks: normChecklist(pick(r, 'subtasks', 'checklist', 'steps', 'items'), uid),
      note: text(pick(r, 'note', 'notes', 'description', 'comment')),
      day,
      dayOrder: 0,
      time: day ? normTime(pick(r, 'time', 'at')) : null,
      repeat: day ? normRepeat(pick(r, 'repeat', 'recurrence', 'recurring')) : null,
      createdAt: stamp,
      doneAt: status === 'done' ? stamp : null,
    };
    if (day) place(t);
    newTasks.push(t);
  }

  // цели: по названию; у существующей заполняются пустые поля и добавляются новые шаги
  const goals = new Map(st.goals.map((g) => [key(g.title), g]));
  const newGoals = [];
  const changedGoals = new Map();
  let goalOrder = Math.max(-1, ...st.goals.map((g) => g.order)) + 1;
  let newSteps = 0;
  const goneGoals = new Set();
  const stepKeys = ['steps', 'monthSteps', 'month_steps', 'milestones', 'tasks'];

  for (const raw of Array.isArray(data.goals) ? data.goals : []) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const id = text(pick(r, 'id'));
    const cur = id ? st.goals.find((g) => g.id === id) : null;
    if (cur) {
      // правка по id: меняются только указанные поля
      if (wantsDelete(r)) {
        goneGoals.add(cur.id);
        changedGoals.delete(cur.id);
        continue;
      }
      const goal = changedGoals.get(cur.id) ?? { ...cur, steps: cur.steps.map((x) => ({ ...x })) };
      const title = text(pick(r, 'title', 'name', 'goal'));
      if (title && key(title) !== key(goal.title)) {
        goals.delete(key(goal.title));
        goal.title = title;
        goals.set(key(title), goal);
      }
      if (has(r, 'target')) {
        const target = normNumber(r.target);
        goal.target = target > 0 ? target : null;
      }
      if (has(r, 'current', 'value', 'progress')) goal.current = Math.max(0, normNumber(pick(r, 'current', 'value', 'progress')) ?? 0);
      if (has(r, 'unit', 'units')) goal.unit = text(pick(r, 'unit', 'units'));
      if (has(r, 'step')) goal.step = normNumber(r.step) > 0 ? normNumber(r.step) : null;
      if (has(r, 'deadline', 'due', 'by')) goal.deadline = normDate(pick(r, 'deadline', 'due', 'by'));
      newSteps += mergeChecklist(goal.steps, pick(r, ...stepKeys), uid);
      changedGoals.set(goal.id, goal);
      continue;
    }
    if (id && wantsDelete(r)) {
      notFound++;
      continue;
    }
    const title = text(typeof raw === 'string' ? raw : pick(r, 'title', 'name', 'goal'));
    if (!title) continue;
    const fields = {
      target: normNumber(pick(r, 'target', 'targetValue', 'target_value', 'of')),
      current: normNumber(pick(r, 'current', 'value', 'progress')),
      unit: text(pick(r, 'unit', 'units')),
      step: normNumber(pick(r, 'step')),
      deadline: normDate(pick(r, 'deadline', 'due', 'by')),
    };

    let goal = goals.get(key(title));
    if (!goal) {
      goal = {
        id: uid(), title, order: goalOrder++, steps: [], createdAt: stamp,
        target: fields.target > 0 ? fields.target : null, current: Math.max(0, fields.current ?? 0),
        unit: fields.unit, step: fields.step > 0 ? fields.step : null, deadline: fields.deadline,
      };
      goals.set(key(title), goal);
      newGoals.push(goal);
    } else {
      goal = changedGoals.get(goal.id) ?? { ...goal, steps: [...goal.steps] };
      if (!(goal.target > 0) && fields.target > 0) Object.assign(goal, { target: fields.target, current: Math.max(0, fields.current ?? goal.current ?? 0) });
      if (!goal.unit && fields.unit) goal.unit = fields.unit;
      if (!(goal.step > 0) && fields.step > 0) goal.step = fields.step;
      if (!goal.deadline && fields.deadline) goal.deadline = fields.deadline;
      changedGoals.set(goal.id, goal);
      goals.set(key(title), goal);
    }

    const steps = pick(r, ...stepKeys) ?? [];
    for (const s of Array.isArray(steps) ? steps : []) {
      const stepTitle = text(typeof s === 'object' ? pick(s, 'title', 'name', 'text') : s);
      if (!stepTitle) continue;
      if (goal.steps.some((x) => key(x.title) === key(stepTitle))) continue;
      goal.steps.push({
        id: uid(),
        title: stepTitle,
        done: typeof s === 'object' && Boolean(pick(s, 'done', 'completed', 'checked')),
      });
      newSteps++;
    }
  }

  const deleted = [
    ...[...goneTasks].map((id) => st.tasks.find((t) => t.id === id).title),
    ...[...goneGoals].map((id) => st.goals.find((g) => g.id === id).title),
  ];
  return {
    spheres: newSpheres,
    tasks: newTasks,
    goals: [...newGoals, ...changedGoals.values()],
    changes: {
      spheres: [...changedSpheres.values()],
      tasks: [...changedTasks.values()],
      deleteTasks: [...goneTasks],
      deleteGoals: [...goneGoals],
    },
    summary: {
      spheres: newSpheres.length,
      tasks: newTasks.length,
      goals: newGoals.length,
      steps: newSteps,
      skipped,
      changed: changedTasks.size + changedGoals.size + changedSpheres.size,
      done: madeDone,
      deleted,
      notFound,
      noRoom,
    },
  };
}

/* ── резервная копия: проверка перед заменой ─────────────────────────── */

/** Оставляет только годные записи; бросает ошибку, если файл не похож на копию. */
export function readBackup(data) {
  if (detect(data) !== 'backup') throw new Error('Not a tracker backup');
  if (data.schema > SCHEMA) throw new Error('Backup is from a newer version of the app');
  const list = (v) => (Array.isArray(v) ? v : []);
  const tasks = list(data.tasks)
    .filter((t) => t && t.id && text(t.title))
    .map((t) => ({ ...t, subtasks: list(t.subtasks) }));
  return {
    settings: data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings : null,
    spheres: list(data.spheres).filter((s) => s && s.id && text(s.name)),
    tasks,
    goals: list(data.goals)
      .filter((g) => g && g.id && text(g.title))
      .map((g) => ({ ...g, steps: list(g.steps) })),
    files: unpackFiles(list(data.files), new Set(tasks.map((t) => t.id))),
  };
}

/* ── импорт из текста: список, Markdown, CSV ─────────────────────────── */

const RELATIVE = { today: 0, сегодня: 0, tomorrow: 1, завтра: 1 };

function dateToken(v, today) {
  const k = key(v);
  if (k in RELATIVE) return addDays(today, RELATIVE[k]);
  return normDate(v);
}

/**
 * Метки в строке задачи: `@today` / `@2026-10-01` — день, `due:2026-10-05` —
 * дедлайн, `!` / `!high` / `!low` — приоритет. Возвращает поля и чистое название.
 */
function tokens(line, today) {
  const out = {};
  let title = line.replace(/(^|\s)due:(\S+)/gi, (m, sp, v) => ((out.deadline = dateToken(v, today)) ? sp : m));
  title = title.replace(/(^|\s)@(\S+)/g, (m, sp, v) => ((out.day = dateToken(v, today)) ? sp : m));
  title = title.replace(/(^|\s)!(high|medium|low|h|m|l|1|2|3)?(?=\s|$)/gi, (m, sp, v) => {
    out.priority = v ? normPriority(v) : 'high';
    return sp;
  });
  return { ...out, title: title.replace(/\s+/g, ' ').trim() };
}

/**
 * Список задач из текста или Markdown. Заголовок (`# Работа`) или строка
 * с двоеточием в конце (`Работа:`) — сфера для задач ниже; пункт списка
 * (`-`, `*`, `1.`, `- [ ]`, `- [x]`) или просто строка — задача; пункт
 * с отступом под задачей — её подзадача.
 */
export function parseList(src, today) {
  const tasks = [];
  let sphere = null;
  let last = null;
  let lastIndent = 0;
  for (const raw of String(src).split(/\r?\n/)) {
    if (!raw.trim() || /^\s*(```|---+\s*$|\*\*\*+\s*$|>)/.test(raw)) continue;
    const heading = raw.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      sphere = heading[1];
      last = null;
      continue;
    }
    const m = raw.match(/^(\s*)([-*+•]|\d+[.)])?\s*(?:\[([ xX✓])\]\s*)?(.*)$/);
    const indent = m[1].replace(/\t/g, '    ').length;
    const body = m[4].trim();
    if (!body) continue;
    if (!m[2] && !m[3] && indent === 0 && /:$/.test(body)) {
      sphere = body.slice(0, -1).trim();
      last = null;
      continue;
    }
    const done = Boolean(m[3] && m[3] !== ' ');
    if (last && indent > lastIndent) {
      const sub = tokens(body, today).title;
      if (sub) last.subtasks.push({ title: sub, done });
      continue;
    }
    const t = tokens(body, today);
    if (!t.title) continue;
    last = { ...t, sphere, status: done ? 'done' : 'todo', subtasks: [] };
    lastIndent = indent;
    tasks.push(last);
  }
  return { tasks };
}

/** Строки CSV с кавычками (в том числе переносы внутри кавычек). */
function csvRows(src, delim) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

const COLUMNS = {
  title: ['title', 'name', 'task', 'задача', 'название'],
  sphere: ['sphere', 'project', 'area', 'list', 'category', 'сфера', 'проект', 'список'],
  status: ['status', 'state', 'статус'],
  priority: ['priority', 'prio', 'приоритет'],
  deadline: ['deadline', 'due', 'due date', 'date', 'срок', 'дедлайн'],
  day: ['day', 'planned', 'scheduled', 'do date', 'день'],
  note: ['note', 'notes', 'description', 'заметка', 'описание'],
  subtasks: ['subtasks', 'checklist', 'подзадачи'],
};

/**
 * Таблица CSV (Excel, Numbers, Google Sheets, Notion): разделитель — запятая,
 * точка с запятой или табуляция, по первой строке. Столбцы узнаются
 * по названию; без узнаваемой шапки первый столбец — название задачи.
 */
export function parseCSV(src) {
  const body = String(src).replace(/^\uFEFF/, '');
  const first = body.split(/\r?\n/, 1)[0];
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = csvRows(body, delim);
  if (!rows.length) return { tasks: [] };
  const head = rows[0].map(key);
  const col = {};
  for (const [field, names] of Object.entries(COLUMNS)) {
    const i = head.findIndex((c) => names.includes(c));
    if (i >= 0) col[field] = i;
  }
  const hasHead = 'title' in col;
  if (!hasHead) col.title = 0;
  const tasks = rows.slice(hasHead ? 1 : 0).map((r) => {
    const get = (f) => (f in col ? text(r[col[f]]) : '');
    const t = {};
    for (const f of Object.keys(COLUMNS)) if (get(f)) t[f] = get(f);
    if (t.subtasks) t.subtasks = t.subtasks.split(/\s*[;|\n]\s*/).filter(Boolean);
    return t;
  });
  return { tasks: tasks.filter((t) => t.title) };
}

/**
 * Любой текст импорта → данные: JSON (копия или импорт; массив — это задачи),
 * CSV (по расширению), остальное — список. null — если JSON битый.
 */
export function readImportText(name, src, today) {
  const trimmed = String(src).trim();
  const json = extractJSON(trimmed);
  if (json !== undefined) return Array.isArray(json) ? { tasks: json } : json;
  if (/\.json$/i.test(name)) return null;
  if (/\.(csv|tsv)$/i.test(name)) return parseCSV(trimmed);
  return parseList(trimmed, today);
}

/**
 * JSON из ответа ИИ: весь текст, блок ```json … ``` или объект посреди
 * пояснений (если в нём есть tasks / goals / spheres). undefined — JSON нет.
 * Markdown-список с [ ] и [x] за JSON не принимается.
 */
export function extractJSON(src) {
  const s = String(src).trim();
  const parse = (x) => {
    try {
      return JSON.parse(x);
    } catch {
      return undefined;
    }
  };
  if (/^[[{]/.test(s)) {
    const v = parse(s);
    if (v !== undefined) return v;
  }
  const fence = s.match(/```[a-z]*[ \t]*\n?([\s\S]*?)```/i);
  if (fence) {
    const v = parse(fence[1].trim());
    if (v !== undefined) return v;
  }
  if (/"(tasks|goals|spheres)"\s*:/.test(s)) {
    const v = parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    if (v !== undefined) return v;
  }
  return undefined;
}

/* ── инструкция для ИИ ─────────────────────────────────────────────────── */

const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) =>
  v != null && v !== '' && v !== false && !(Array.isArray(v) && !v.length)));

/**
 * Данные для ИИ, чтобы он мог не только добавить, но и поменять: открытые
 * задачи, сферы и цели с их id. Сделанные не нужны — их не трогают.
 */
export function aiData(st) {
  const names = new Map(st.spheres.map((s) => [s.id, s.name]));
  const list = (items) => items.map((x) => compact({ title: x.title, done: x.done || null }));
  return {
    spheres: st.spheres.map((s) => compact({ id: s.id, name: s.name, glyph: s.glyph, archived: s.archived || null })),
    tasks: st.tasks.filter((t) => !isDone(t)).map((t) => compact({
      id: t.id, title: t.title, sphere: names.get(t.sphereId) ?? 'Inbox', status: t.status, day: t.day, time: t.time,
      repeat: t.repeat && t.repeat !== 'none' ? t.repeat : null, priority: t.priority, deadline: t.deadline,
      note: t.note, subtasks: list(t.subtasks),
    })),
    goals: st.goals.map((g) => compact({
      id: g.id, title: g.title, target: g.target, current: g.target > 0 ? g.current ?? 0 : null, unit: g.unit,
      step: g.step, deadline: g.deadline, steps: list(g.steps),
    })),
  };
}

/** Пример из инструкции — настоящий: тест прогоняет его через импорт. */
export function aiExample(today) {
  return {
    spheres: [{ name: 'Work', glyph: 'square' }, { name: 'Health', glyph: 'circle' }],
    tasks: [
      { title: 'Send the quarterly report', sphere: 'Work', day: today, time: '10:00', priority: 'high',
        subtasks: ['Collect the numbers', 'Write the summary'] },
      { title: 'Morning run', sphere: 'Health', day: today, time: '07:30', repeat: 'weekdays' },
      { title: 'Renew passport', deadline: addDays(today, 30), note: 'Photo booth near the station' },
    ],
    goals: [
      { title: 'Save for a car', target: 30000, current: 4000, unit: '€', step: 250,
        deadline: `${Number(today.slice(0, 4)) + 1}-12-31` },
      { title: 'Learn Dutch', steps: ['Finish the A1 course', { title: 'Buy a textbook', done: true }] },
    ],
  };
}

/**
 * Инструкция для любого ИИ-чата (ChatGPT, Claude, Gemini…): формат импорта,
 * правила и пример. С data — ещё и нынешние данные с id, чтобы ИИ мог
 * отметить, перенести или удалить. Ответ ИИ вставляют в Settings → Paste AI answer.
 */
export function aiPrompt({ today, limit = 3, data = null }) {
  const json = (v) => JSON.stringify(v, null, 1);
  return [
    '# Tracker — instructions for an AI assistant',
    '',
    'I use "Tracker", a personal task app on my phone. It imports one JSON object. Help me fill it or change it:',
    'read my request at the end, ask me first if something important is unclear, then answer with a one-line',
    'summary and exactly one ```json code block. I copy your whole answer into the app (Settings → Paste AI answer);',
    'the app shows what will change, and I confirm.',
    '',
    `Today is ${fmtWeekday(today)} ${fmtLong(today)} (${today}). ${limit > 0
      ? `A day holds at most ${limit} open tasks; planned tasks that don't fit stay without a date.`
      : 'There is no limit of tasks per day.'}`,
    '',
    '## JSON format',
    '{ "spheres": [ … ], "tasks": [ … ], "goals": [ … ] } — every key is optional.',
    'Dates are "YYYY-MM-DD", times "HH:MM" (24-hour). Valid JSON only: double quotes, no comments, no trailing commas.',
    '',
    '### spheres — areas of life or work',
    '- name (required); glyph (optional): circle, pill, square, bar, triangle, ring, half or diamond.',
    '- A task may name a sphere that is not listed — it is created. No sphere → the task goes to Inbox.',
    '',
    '### tasks',
    '- title (required) — short, starts with a verb',
    '- sphere — sphere name',
    '- day — the date to do it (puts it into that day)',
    '- time — "HH:MM", only together with day; tasks of a day are sorted by time',
    '- repeat — daily, weekdays, weekly or monthly; only together with day',
    '- deadline — the date it must be done by (not the same as day)',
    '- priority — high, medium or low',
    '- status — todo, doing, paused or done',
    '- note — details, links',
    '- subtasks — ["Part", {"title": "Part", "done": true}]',
    '',
    '### goals',
    '- title (required), deadline',
    '- measured by a number: target, current (default 0), unit ("€", "km", "pages"),',
    '  step — how much the app\'s − and + buttons change current',
    '- or by steps: steps — a checklist ["…", {"title": "…", "done": true}]',
    '',
    '## Changing existing entries',
    data
      ? 'My current data is below. Refer to an entry by its "id"; only the fields you include change, the rest stays.'
      : 'I have not shared my current data, so you can only add. To complete, move or delete something, ask me\nto copy the instructions "with my data" from the app.',
    '- Complete: {"id": "…", "status": "done"} · Move: {"id": "…", "day": "YYYY-MM-DD", "time": "HH:MM"} · Unplan: {"id": "…", "day": null}',
    '- Delete: {"id": "…", "delete": true} — only when I clearly ask to delete.',
    '- Goal progress: {"id": "…", "current": 5200}. Tick a goal step: {"id": "…", "steps": [{"title": "exact step title", "done": true}]}',
    '- Rename a sphere: {"id": "…", "name": "New name"}. Archive it: {"id": "…", "archived": true}',
    '- Without an id an entry is added as new. A task with the same title in the same sphere is skipped',
    '  as a duplicate — do not repeat existing tasks.',
    '',
    '## Example',
    '```json',
    json(aiExample(today)),
    '```',
    '',
    '## Good practice',
    '- Do not invent tasks, dates or numbers I did not mention — suggest them in the text instead.',
    '- One task is one action: long details go to note, parts to subtasks.',
    '- Do not show ids in the text of your answer.',
    '- If I only ask a question or for advice, just answer — no JSON needed.',
    ...(data ? ['', '## My current data', '```json', json(data), '```'] : []),
    '',
    '## My request',
    '',
  ].join('\n');
}

/* ── файл календаря (.ics) ────────────────────────────────────────────── */

/** Когда напомнить: для задачи со временем — минуты до начала, для дня без времени — от полуночи. */
export const ALERTS_TIMED = [
  ['0', 'At time', 'PT0S'],
  ['10', '10 min before', '-PT10M'],
  ['60', '1 hour before', '-PT1H'],
  ['1440', '1 day before', '-P1D'],
  ['none', 'No alert', null],
];
export const ALERTS_DAY = [
  ['morning', 'Morning, 9:00', 'PT9H'],
  ['eve', 'Day before, 9:00', '-PT15H'],
  ['none', 'No alert', null],
];

const RRULES = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
};

/** Запятая, точка с запятой, обратная косая и перенос строки в тексте iCalendar экранируются. */
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * Строки длиннее 75 байт переносятся с пробелом в начале продолжения.
 * Не режутся пополам ни буква в UTF-8, ни экранированная пара вроде \n.
 */
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line.match(/\\.|[\s\S]/gu) ?? []) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stampUTC = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Событие календаря для задачи с днём. Время — «плавающее» (без часового
 * пояса): 10:30 значит 10:30 там, где телефон. Со временем — событие
 * на 30 минут, без времени — на весь день. Повтор — RRULE, напоминание — VALARM.
 * alert — значение из ALERTS_TIMED / ALERTS_DAY.
 */
export function toICS(t, { alert, now = new Date(), sphere = null } = {}) {
  if (!t.day) throw new Error('Task has no date');
  const d = t.day.replace(/-/g, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tracker//Personal task tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${t.id}@tracker`, `DTSTAMP:${stampUTC(now)}`, `SUMMARY:${icsText(t.title)}`,
  ];
  if (t.time) {
    const [hh, mm] = t.time.split(':').map(Number);
    const end = new Date(Date.UTC(2000, 0, 1, hh, mm + 30));
    const endDay = end.getUTCDate() > 1 ? addDays(t.day, 1).replace(/-/g, '') : d;
    const pad = (n) => String(n).padStart(2, '0');
    lines.push(`DTSTART:${d}T${pad(hh)}${pad(mm)}00`, `DTEND:${endDay}T${pad(end.getUTCHours())}${pad(end.getUTCMinutes())}00`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(t.day, 1).replace(/-/g, '')}`);
  }
  if (RRULES[t.repeat]) lines.push(`RRULE:${RRULES[t.repeat]}`);
  const about = [
    sphere && `Sphere: ${sphere}`,
    t.note?.trim(),
    t.subtasks?.length && t.subtasks.map((s) => `${s.done ? '✓' : '–'} ${s.title}`).join('\n'),
  ].filter(Boolean).join('\n\n');
  if (about) lines.push(`DESCRIPTION:${icsText(about)}`);
  const trigger = [...ALERTS_TIMED, ...ALERTS_DAY].find(([v]) => v === alert)?.[2];
  if (trigger) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(t.title)}`, `TRIGGER:${trigger}`, 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Имя файла из названия задачи: без символов, которые не любят файловые системы. */
export const icsName = (title) =>
  `${title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim() || 'task'}.ics`;
