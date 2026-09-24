/**
 * Правила трекера без браузера: node --test tracker/test/
 * Данные здесь выдуманные — настоящих задач в репозитории нет и не будет.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayLabel, diffDays, dueLabel, fmtDay, fmtMonth, nextRepeat, nextWeek } from '../src/dates.js';
import {
  COLORS, brief, carriedOver, colorize, dayTasks, goalProgress, isDayFull, isGoalDone, nextColor, overdue, planGroups,
  searchTasks, sphereCounts, sphereTasks, timeSlot,
} from '../src/logic.js';
import {
  aiData, aiExample, aiPrompt, detect, extractJSON, icsName, makeBackup, packFiles, parseCSV, parseList, planImport,
  readBackup, readImportText, toICS, normDate, normPriority, normRepeat, normStatus, normTime,
} from '../src/io.js';

const TODAY = '2026-09-24';
let n = 0;
const uid = () => `id${++n}`;

function task(title, extra = {}) {
  return {
    id: uid(), title, sphereId: null, priority: null, deadline: null, status: 'todo',
    subtasks: [], note: '', day: null, dayOrder: 0, createdAt: '2026-09-01T00:00:00Z', doneAt: null, ...extra,
  };
}

function world() {
  const a = { id: 'sa', name: 'Alpha', glyph: 'circle', order: 0, archived: false };
  const b = { id: 'sb', name: 'Beta', glyph: 'square', order: 1, archived: false };
  const old = { id: 'so', name: 'Old', glyph: 'bar', order: 2, archived: true };
  return { spheres: [a, b, old], tasks: [], goals: [] };
}

test('даты: сдвиг через границу месяца и разница в днях', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-09-24', '2026-10-01'), 7);
  assert.deepEqual(dueLabel('2026-09-22', TODAY), { text: 'Overdue 2d', late: true });
  assert.equal(dueLabel(TODAY, TODAY).late, false);
  assert.equal(dueLabel('2026-09-29', TODAY).text, 'Due Tue');
  assert.equal(dueLabel('2026-10-05', TODAY).text, 'Due 5 Oct');
  assert.equal(fmtDay(TODAY), 'Thu 24 Sep');
  assert.equal(fmtMonth('2026-09'), 'September 2026');
});

test('даты: подписи дня, следующая неделя, повторы', () => {
  assert.equal(dayLabel(TODAY, TODAY), 'Today');
  assert.equal(dayLabel('2026-09-25', TODAY), 'Tomorrow');
  assert.equal(dayLabel('2026-09-23', TODAY), 'Yesterday');
  assert.equal(dayLabel('2026-09-28', TODAY), 'Mon');
  assert.equal(dayLabel('2026-10-05', TODAY), 'Mon 5 Oct');
  assert.equal(dayLabel('2027-01-05', TODAY), '5 Jan 2027');
  assert.equal(nextWeek(TODAY), '2026-09-28'); // четверг → понедельник
  assert.equal(nextWeek('2026-09-28'), '2026-10-05'); // понедельник → через неделю
  assert.equal(nextRepeat(TODAY, 'daily'), '2026-09-25');
  assert.equal(nextRepeat('2026-09-25', 'weekdays'), '2026-09-28'); // пятница → понедельник
  assert.equal(nextRepeat(TODAY, 'weekly'), '2026-10-01');
  assert.equal(nextRepeat('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextRepeat('2026-12-15', 'monthly'), '2027-01-15');
  assert.equal(nextRepeat(TODAY, 'none'), null);
});

test('день: пауза и архивная сфера скрыты, готовые отдельно, порядок по dayOrder', () => {
  const st = world();
  st.tasks.push(
    task('second', { day: TODAY, dayOrder: 1 }),
    task('first', { day: TODAY, dayOrder: 0 }),
    task('paused', { day: TODAY, status: 'paused' }),
    task('archived', { day: TODAY, sphereId: 'so' }),
    task('done', { day: TODAY, status: 'done' }),
    task('yesterday', { day: addDays(TODAY, -1) }),
  );
  const { open, done } = dayTasks(st, TODAY);
  assert.deepEqual(open.map((t) => t.title), ['first', 'second']);
  assert.deepEqual(done.map((t) => t.title), ['done']);
  assert.equal(isDayFull(st, TODAY), false);
  st.tasks.push(task('third', { day: TODAY, dayOrder: 2 }));
  assert.equal(isDayFull(st, TODAY), true);
  // лимит — настройка: 5 или без лимита
  assert.equal(isDayFull({ ...st, settings: { dayLimit: 5 } }, TODAY), false);
  assert.equal(isDayFull({ ...st, settings: { dayLimit: 0 } }, TODAY), false);
});

test('не сделанное в прошлые дни: только активное и не архивное', () => {
  const st = world();
  const y = addDays(TODAY, -1);
  st.tasks.push(
    task('yesterday', { day: y }),
    task('yesterday done', { day: y, status: 'done' }),
    task('yesterday archived', { day: y, sphereId: 'so' }),
    task('today', { day: TODAY }),
  );
  assert.deepEqual(carriedOver(st, TODAY).map((t) => t.title), ['yesterday']);
});

test('просроченные: без паузы, готовых и архива; уже стоящие в дне — только в брифе', () => {
  const st = world();
  const y = addDays(TODAY, -1);
  st.tasks.push(
    task('late', { deadline: y }),
    task('late planned', { deadline: y, day: TODAY }),
    task('late paused', { deadline: y, status: 'paused' }),
    task('late done', { deadline: y, status: 'done' }),
    task('late archived', { deadline: y, sphereId: 'so' }),
    task('due today', { deadline: TODAY }),
  );
  assert.deepEqual(overdue(st, TODAY).map((t) => t.title), ['late']);
  assert.deepEqual(overdue(st, TODAY, { withPlanned: true }).map((t) => t.title).sort(), ['late', 'late planned']);
});

test('планирование: несделанное первым, потом Входящие и сферы; пауза не видна', () => {
  const st = world();
  st.tasks.push(
    task('carried', { day: TODAY, sphereId: 'sa' }),
    task('inbox'),
    task('beta', { sphereId: 'sb' }),
    task('alpha', { sphereId: 'sa' }),
    task('paused', { status: 'paused' }),
    task('archived', { sphereId: 'so' }),
    task('picked', { day: addDays(TODAY, 1), sphereId: 'sa' }),
    task('later', { day: addDays(TODAY, 5), sphereId: 'sb' }),
    task('soon', { day: addDays(TODAY, 2) }),
  );
  const g = planGroups(st, TODAY);
  assert.equal(g.target, '2026-09-25');
  assert.deepEqual(g.carried.map((t) => t.title), ['carried']);
  assert.deepEqual(g.upcoming.map((t) => t.title), ['soon', 'later'], 'по датам, отдельно от сфер');
  assert.deepEqual(g.inbox.map((t) => t.title), ['inbox']);
  assert.deepEqual(g.spheres.map((x) => [x.sphere.name, x.tasks.map((t) => t.title).sort()]), [
    ['Alpha', ['alpha', 'picked']],
    ['Beta', ['beta']],
  ]);
});

test('сферы: счётчик без паузы и готовых; в сфере пауза в конце', () => {
  const st = world();
  st.tasks.push(
    task('a1', { sphereId: 'sa', status: 'paused' }),
    task('a2', { sphereId: 'sa' }),
    task('a3', { sphereId: 'sa', status: 'done', doneAt: '2026-09-20T00:00:00Z' }),
    task('in'),
  );
  const counts = sphereCounts(st);
  assert.equal(counts.get('sa'), 1);
  assert.equal(counts.get(null), 1);
  const { open, done } = sphereTasks(st, 'sa');
  assert.deepEqual(open.map((t) => t.title), ['a2', 'a1']);
  assert.deepEqual(done.map((t) => t.title), ['a3']);
});

test('обзор: неделя от сегодня, цели целиком', () => {
  const st = world();
  st.tasks.push(
    task('tomorrow', { day: addDays(TODAY, 1), sphereId: 'sa', priority: 'high' }),
    task('friday', { deadline: addDays(TODAY, 2) }),
    task('far', { deadline: addDays(TODAY, 9) }),
  );
  st.goals.push({
    id: 'g1', title: 'Goal', order: 0, steps: [
      { id: 's1', title: 'now', done: true },
      { id: 's2', title: 'now 2', done: false },
      { id: 's3', title: 'next', month: '2026-10', done: false },
    ],
  }, { id: 'g2', title: 'Apply', order: 1, steps: [], target: 10, current: 4, unit: 'jobs', deadline: '2026-12-31' });
  st.files = [{ id: 'f1', taskId: st.tasks[0].id, name: 'brief.pdf' }];
  const b = brief(st, TODAY);
  assert.equal(b.week.length, 7);
  assert.equal(b.week[0].date, TODAY);
  assert.deepEqual(b.week[2].tasks.map((t) => t.title), ['friday']);
  assert.equal(b.goals[0].done, 1);
  assert.equal(b.goals[0].total, 3, 'шаги целиком, без деления по месяцам');
  assert.equal(b.goals[1].kind, 'value');
  assert.deepEqual(b.planned.map((t) => t.title), ['tomorrow']);
});

test('импорт: нормализация значений', () => {
  assert.equal(normStatus('In Progress'), 'doing');
  assert.equal(normStatus('готово'), 'done');
  assert.equal(normPriority('высокий'), 'high');
  assert.equal(normPriority(2), 'medium');
  assert.equal(normDate('2026-10-03T09:00:00Z'), '2026-10-03');
  assert.equal(normDate('3.10.2026'), '2026-10-03');
  assert.equal(normDate('soon'), null);
  assert.equal(normRepeat('Every week'), 'weekly');
  assert.equal(normTime('9:05'), '09:05');
  assert.equal(normTime('25:00'), null);
});

test('цели: прогресс по числу или по шагам', () => {
  const steps = [{ title: 'a', done: true }, { title: 'b', done: false }];
  assert.deepEqual(
    (({ kind, done, total }) => ({ kind, done, total }))(goalProgress({ steps })),
    { kind: 'steps', done: 1, total: 2 },
  );
  const value = goalProgress({ steps, target: 10, current: 12 });
  assert.deepEqual([value.kind, value.done, value.total, value.current], ['value', 10, 10, 12]);
  assert.equal(isGoalDone({ steps, target: 10, current: 12 }), true);
  assert.equal(isGoalDone({ steps }), false);
  assert.equal(isGoalDone({ steps: [] }), false, 'пустая цель не достигнута');
});

test('поиск: название, заметка, подзадачи; незавершённые сверху', () => {
  const st = world();
  st.tasks.push(
    task('Call the bank', { status: 'done' }),
    task('Taxes', { note: 'ask the BANK about form' }),
    task('Trip', { subtasks: [{ id: 'x', title: 'bank card', done: false }] }),
    task('Other'),
  );
  assert.deepEqual(searchTasks(st, ' bank ').map((t) => t.title), ['Taxes', 'Trip', 'Call the bank']);
  assert.deepEqual(searchTasks(st, '  '), []);
});

test('импорт списка: заголовки — сферы, отступ — подзадачи, метки дня, срока и приоритета', () => {
  const { tasks } = parseList([
    '# Work',
    '- [ ] Send report @today !',
    '  - attach numbers',
    '- [x] Old thing due:3.10.2026',
    'Home:',
    'Buy lamp @tomorrow',
    '1. Read book !low',
    'Mail a@b.com',
    '---',
  ].join('\n'), TODAY);
  assert.deepEqual(tasks.map((t) => [t.title, t.sphere, t.status]), [
    ['Send report', 'Work', 'todo'],
    ['Old thing', 'Work', 'done'],
    ['Buy lamp', 'Home', 'todo'],
    ['Read book', 'Home', 'todo'],
    ['Mail a@b.com', 'Home', 'todo'],
  ]);
  assert.deepEqual([tasks[0].day, tasks[0].priority], [TODAY, 'high']);
  assert.deepEqual(tasks[0].subtasks, [{ title: 'attach numbers', done: false }]);
  assert.equal(tasks[1].deadline, '2026-10-03');
  assert.equal(tasks[2].day, '2026-09-25');
  assert.equal(tasks[3].priority, 'low');

  // дальше — общим путём импорта
  const plan = planImport(world(), { tasks }, { uid });
  assert.deepEqual(plan.spheres.map((s) => s.name), ['Work', 'Home']);
  assert.equal(plan.tasks[0].day, TODAY);
});

test('импорт CSV: разделитель по шапке, кавычки, столбцы по названию', () => {
  const { tasks } = parseCSV('\uFEFFName;Project;Due;Subtasks\n"Write, ""final"" report";Work;01.10.2026;a; b\nPlain;;;\n');
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks[0], { title: 'Write, "final" report', sphere: 'Work', deadline: '01.10.2026', subtasks: ['a'] });
  assert.deepEqual(parseCSV('title,priority\nX,high\n').tasks, [{ title: 'X', priority: 'high' }]);
  assert.deepEqual(parseCSV('just a task\nanother\n').tasks.map((t) => t.title), ['just a task', 'another']);

  assert.deepEqual(readImportText('list.md', '- one\n- two', TODAY).tasks.map((t) => t.title), ['one', 'two']);
  assert.deepEqual(readImportText('x.json', '[{"title":"a"}]', TODAY), { tasks: [{ title: 'a' }] });
  assert.equal(readImportText('x.json', '{broken', TODAY), null);
  assert.equal(readImportText('t.csv', 'title\nq', TODAY).tasks[0].title, 'q');
});

test('импорт: сферы по названию, повторы пропускаются, цели дополняются', () => {
  const st = world();
  st.tasks.push(task('Existing', { sphereId: 'sa' }), task('Closed', { status: 'done' }));
  st.goals.push({ id: 'g1', title: 'Run', order: 0, steps: [{ id: 'x', title: 'Week 1', month: '2026-09', done: false }], target: null });

  const file = {
    spheres: [{ id: 'f-alpha', name: 'alpha' }, { name: 'Gamma' }],
    tasks: [
      { title: 'Existing', sphere: 'Alpha' },
      { title: 'closed' },
      { title: 'By file id', sphereId: 'f-alpha', priority: 'low', due: '2026-10-01' },
      { name: 'New sphere task', sphere: 'Delta', status: 'in progress', subtasks: ['one', { text: 'two', done: true }] },
      { title: 'Inbox task', sphere: 'Inbox' },
      { title: 'Too many', day: TODAY },
      '',
    ],
    goals: [
      { title: 'run', steps: ['Week 1', 'Week 2'], target: 100, unit: 'km' },
      { name: 'Read', steps: [{ title: 'Book' }], target: '12', current: 3, deadline: '2026-12-31' },
    ],
  };
  assert.equal(detect(file), 'import');
  const plan = planImport(st, file, { uid, today: TODAY });

  assert.deepEqual(plan.spheres.map((s) => s.name), ['Gamma', 'Delta']);
  assert.equal(new Set(plan.spheres.map((s) => s.glyph)).size, 2);
  assert.deepEqual(plan.tasks.map((t) => t.title), ['By file id', 'New sphere task', 'Inbox task', 'Too many']);
  assert.equal(plan.summary.skipped, 2);

  const byTitle = Object.fromEntries(plan.tasks.map((t) => [t.title, t]));
  assert.equal(byTitle['By file id'].sphereId, 'sa');
  assert.equal(byTitle['By file id'].deadline, '2026-10-01');
  assert.equal(byTitle['New sphere task'].status, 'doing');
  assert.deepEqual(byTitle['New sphere task'].subtasks.map((s) => [s.title, s.done]), [['one', false], ['two', true]]);
  assert.equal(byTitle['Inbox task'].sphereId, null);
  assert.equal(byTitle['Too many'].day, TODAY);

  const run = plan.goals.find((g) => g.id === 'g1');
  assert.deepEqual(run.steps.map((s) => s.title), ['Week 1', 'Week 2']);
  assert.deepEqual([run.target, run.unit], [100, 'km'], 'у существующей цели заполняются пустые поля');
  assert.equal(st.goals[0].steps.length, 1, 'исходная цель не меняется до подтверждения');
  const read = plan.goals.find((g) => g.title === 'Read');
  assert.deepEqual([read.target, read.current, read.deadline, read.steps[0].title], [12, 3, '2026-12-31', 'Book']);
  assert.equal(plan.summary.steps, 2);
});

test('импорт: день из файла не переполняет лимит дня', () => {
  const st = world();
  st.tasks.push(task('a', { day: TODAY }), task('b', { day: TODAY, dayOrder: 1 }));
  const file = { tasks: [{ title: 'c', day: TODAY, time: '9:30', repeat: 'daily' }, { title: 'd', day: TODAY }] };
  const plan = planImport(st, file, { uid });
  assert.deepEqual(plan.tasks.map((t) => t.day), [TODAY, null]);
  assert.equal(plan.tasks[0].dayOrder, -1, 'со временем — выше задач дня без времени, как при вводе руками');
  assert.deepEqual([plan.tasks[0].time, plan.tasks[0].repeat], ['09:30', 'daily']);
  // без лимита — встают обе
  assert.deepEqual(planImport({ ...st, settings: { dayLimit: 0 } }, file, { uid }).tasks.map((t) => t.day), [TODAY, TODAY]);
});

test('резервная копия: туда и обратно, вместе с вложениями; чужие файлы не принимаются', async () => {
  const st = world();
  st.tasks.push(task('x'));
  st.settings = { dayLimit: 5 };
  const bytes = new Uint8Array(70000).map((_, i) => i % 251);
  const files = await packFiles([
    { id: 'f1', taskId: st.tasks[0].id, name: 'scan.pdf', type: 'application/pdf', size: bytes.length, blob: new Blob([bytes]) },
    { id: 'f2', taskId: 'gone', name: 'orphan.txt', type: 'text/plain', size: 1, blob: new Blob(['x']) },
  ]);
  const copy = JSON.parse(JSON.stringify(makeBackup(st, new Date('2026-09-24T20:00:00Z'), files)));
  assert.equal(detect(copy), 'backup');
  const back = readBackup(copy);
  assert.deepEqual(back.tasks.map((t) => t.title), ['x']);
  assert.equal(back.spheres.length, 3);
  assert.deepEqual(back.settings, { dayLimit: 5 });
  assert.deepEqual(back.files.map((f) => f.name), ['scan.pdf'], 'вложение без задачи отброшено');
  assert.deepEqual(new Uint8Array(await back.files[0].blob.arrayBuffer()), bytes);
  assert.equal(back.files[0].blob.type, 'application/pdf');
  // копия прошлой версии (без files и settings) читается
  const v1 = readBackup({ app: 'tracker', schema: 1, spheres: [], tasks: [], goals: [] });
  assert.deepEqual([v1.files, v1.settings], [[], null]);
  assert.throws(() => readBackup({ tasks: [] }));
  assert.throws(() => readBackup({ ...copy, schema: 99 }));
  assert.equal(detect([1, 2]), null);
  assert.equal(detect({ foo: 1 }), null);
});

test('календарь: событие со временем, на весь день, повтор, оповещение, экранирование', () => {
  const now = new Date('2026-09-24T05:16:00Z');
  const timed = toICS(
    { id: 't1', title: 'Call bank, re: card; now', day: '2026-09-25', time: '23:45', repeat: 'weekdays', note: 'line 1\nline 2', subtasks: [] },
    { alert: '10', now, sphere: 'Personal' },
  );
  const lines = timed.split('\r\n');
  assert.ok(timed.endsWith('\r\n') && !/[^\r]\n/.test(timed), 'строки через CRLF');
  assert.ok(lines.includes('DTSTART:20260925T234500'));
  assert.ok(lines.includes('DTEND:20260926T001500'), '30 минут через полночь — следующий день');
  assert.ok(lines.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'));
  assert.ok(lines.includes('TRIGGER:-PT10M'));
  assert.ok(lines.includes('SUMMARY:Call bank\\, re: card\\; now'));
  assert.ok(lines.includes('DESCRIPTION:Sphere: Personal\\n\\nline 1\\nline 2'));
  assert.ok(lines.includes('UID:t1@tracker') && lines.includes('DTSTAMP:20260924T051600Z'));

  const day = toICS({ id: 't2', title: 'Renew passport', day: '2026-12-31' }, { alert: 'morning', now }).split('\r\n');
  assert.ok(day.includes('DTSTART;VALUE=DATE:20261231') && day.includes('DTEND;VALUE=DATE:20270101'));
  assert.ok(day.includes('TRIGGER:PT9H'), 'весь день: оповещение в 9:00');
  assert.ok(!day.some((l) => l.startsWith('RRULE')));
  assert.ok(!toICS({ id: 't3', title: 'x', day: '2026-12-31' }, { alert: 'none', now }).includes('VALARM'));
  assert.throws(() => toICS({ id: 't4', title: 'x', day: null }, { now }));

  // длинная кириллица: строки не длиннее 75 байт, буквы и \n не разрезаны
  const long = toICS({ id: 't5', title: 'Очень длинное название задачи, '.repeat(6), day: '2026-10-01' }, { now });
  const raw = long.split('\r\n');
  assert.ok(raw.every((l) => new TextEncoder().encode(l).length <= 75));
  assert.equal(raw.map((l, i) => (i && l.startsWith(' ') ? l.slice(1) : `\n${l}`)).join('').includes('SUMMARY:Очень длинное'), true);
  assert.ok(!raw.some((l) => l.endsWith('\\') && !l.endsWith('\\\\')), 'экранированная пара не разрезана');
  assert.equal(icsName('a/b: c?'), 'a b c.ics');
});

test('день по времени: новая задача встаёт по времени, ручной порядок не пересчитывается', () => {
  const order = (st) => dayTasks(st, TODAY).open.map((t) => t.title);
  const put = (st, t) => {
    t.dayOrder = timeSlot(st, t, TODAY);
    st.tasks.push(t);
  };
  const st = { spheres: [], tasks: [], goals: [], settings: {} };
  put(st, task('Milk', { day: TODAY }));
  put(st, task('Gym', { day: TODAY, time: '09:00' }));
  assert.deepEqual(order(st), ['Gym', 'Milk'], 'со временем — выше задач без времени');
  put(st, task('Call', { day: TODAY, time: '14:00' }));
  put(st, task('Lunch', { day: TODAY, time: '12:30' }));
  put(st, task('Coffee', { day: TODAY, time: '07:15' }));
  assert.deepEqual(order(st), ['Coffee', 'Gym', 'Lunch', 'Call', 'Milk'], 'от ранней к поздней');
  put(st, task('Also gym', { day: TODAY, time: '09:00' }));
  assert.deepEqual(order(st).slice(0, 3), ['Coffee', 'Gym', 'Also gym'], 'то же время — после уже стоящей');
  put(st, task('Bread', { day: TODAY }));
  assert.equal(order(st).at(-1), 'Bread', 'без времени — в конец');

  // перетащили руками: Call наверх, Milk — второй. Порядок нарушает время, но он главнее
  const manual = ['Call', 'Milk', 'Coffee', 'Gym', 'Also gym', 'Lunch', 'Bread'];
  manual.forEach((title, i) => { st.tasks.find((t) => t.title === title).dayOrder = i; });
  assert.deepEqual(order(st), manual);
  put(st, task('Meeting', { day: TODAY, time: '10:00' }));
  assert.deepEqual(order(st), ['Meeting', 'Call', 'Milk', 'Coffee', 'Gym', 'Also gym', 'Lunch', 'Bread'],
    'новая — перед первой, что позже по времени; остальные стоят, как их поставили');
  // готовые не мешают
  st.tasks.find((t) => t.title === 'Coffee').status = 'done';
  const late = task('Late', { day: TODAY, time: '23:00' });
  put(st, late);
  assert.deepEqual(order(st).slice(-3), ['Lunch', 'Late', 'Bread'], 'позже всех — за последней со временем');
});

test('ИИ: пример из инструкции импортируется целиком, JSON находится в ответе чата', () => {
  const prompt = aiPrompt({ today: TODAY, limit: 3 });
  assert.match(prompt, /Today is Thu 24 Sep 2026/);
  assert.match(prompt, /at most 3 open tasks/);
  assert.match(prompt, /ask me to copy the instructions "with my data"|with my data/);
  assert.doesNotMatch(prompt, /My current data/);

  // пример в инструкции — настоящий JSON, и импорт принимает его весь
  const block = prompt.match(/```json\n([\s\S]*?)\n```/)[1];
  assert.deepEqual(JSON.parse(block), aiExample(TODAY));
  const st = { spheres: [], tasks: [], goals: [], settings: {} };
  const plan = planImport(st, JSON.parse(block), { uid });
  assert.deepEqual(plan.summary.spheres, 2);
  assert.deepEqual(plan.tasks.map((t) => [t.title, t.day, t.time]), [
    ['Send the quarterly report', TODAY, '10:00'], ['Morning run', TODAY, '07:30'], ['Renew passport', null, null]]);
  assert.ok(plan.tasks[1].dayOrder < plan.tasks[0].dayOrder, '07:30 выше 10:00');
  const car = plan.goals.find((g) => g.title === 'Save for a car');
  assert.deepEqual([car.target, car.current, car.unit, car.step], [30000, 4000, '€', 250]);
  assert.deepEqual(plan.goals.find((g) => g.title === 'Learn Dutch').steps.map((x) => x.done), [false, true]);

  // ответ чата: текст вокруг, блок кода; markdown-список с [ ] — не JSON
  const reply = `Sure! Here is your plan.\n\n\`\`\`json\n{"tasks": [{"title": "Call mom"}]}\n\`\`\`\nGood luck.`;
  assert.deepEqual(extractJSON(reply), { tasks: [{ title: 'Call mom' }] });
  assert.deepEqual(readImportText('pasted.txt', reply, TODAY), { tasks: [{ title: 'Call mom' }] });
  assert.deepEqual(extractJSON('Plan: {"goals": [{"title": "Run"}]} — done'), { goals: [{ title: 'Run' }] });
  assert.equal(extractJSON('- [ ] buy milk\n- [x] call'), undefined);
  assert.equal(readImportText('pasted.txt', '- [ ] buy milk', TODAY).tasks[0].title, 'buy milk');
});

test('ИИ: правки по id — меняется только указанное, удаление, незнакомые id', () => {
  const st = world();
  const call = task('Call bank', { sphereId: 'sa', day: TODAY, time: '09:00', note: 'card', subtasks: [{ id: 's1', title: 'find contract', done: false }] });
  const lamp = task('Buy lamp', { day: TODAY, dayOrder: 1 });
  const old = task('Old idea');
  st.tasks.push(call, lamp, old);
  st.goals.push({ id: 'g1', title: 'Car', order: 0, target: 30000, current: 4000, unit: '€', step: null, deadline: null,
    steps: [{ id: 'x1', title: 'Sell the bike', done: false }] });
  st.spheres[1].id = 'sb';

  const data = aiData(st);
  assert.equal(data.tasks.find((t) => t.title === 'Call bank').id, call.id, 'в данных для ИИ есть id');
  assert.match(aiPrompt({ today: TODAY, data }), /## My current data/);

  const answer = {
    spheres: [{ id: 'sb', name: 'Home', archived: true }],
    tasks: [
      { id: call.id, status: 'done', subtasks: [{ title: 'find contract', done: true }, 'sign'] },
      { id: lamp.id, time: '08:00' },
      { id: old.id, delete: true },
      { id: 'made-up-by-ai', title: 'New with own id', sphere: 'Alpha' },
      { id: 'missing', delete: true },
    ],
    goals: [{ id: 'g1', current: 5200, step: 250, steps: [{ title: 'Sell the bike', done: true }, 'Test drive'] }],
  };
  const plan = planImport(st, answer, { uid });
  const byId = Object.fromEntries(plan.changes.tasks.map((t) => [t.id, t]));

  assert.equal(byId[call.id].status, 'done');
  assert.ok(byId[call.id].doneAt);
  assert.deepEqual([byId[call.id].note, byId[call.id].time, byId[call.id].title], ['card', '09:00', 'Call bank'], 'остальное не тронуто');
  assert.deepEqual(byId[call.id].subtasks.map((x) => [x.title, x.done]), [['find contract', true], ['sign', false]]);
  assert.equal(byId[lamp.id].time, '08:00');
  assert.ok(byId[lamp.id].dayOrder < call.dayOrder, '08:00 встала выше 09:00');
  assert.deepEqual(plan.changes.deleteTasks, [old.id]);
  assert.deepEqual(plan.tasks.map((t) => t.title), ['New with own id'], 'незнакомый id — новая задача');
  assert.notEqual(plan.tasks[0].id, 'made-up-by-ai');

  const car = plan.goals.find((g) => g.id === 'g1');
  assert.deepEqual([car.current, car.step, car.target], [5200, 250, 30000]);
  assert.deepEqual(car.steps.map((x) => [x.title, x.done]), [['Sell the bike', true], ['Test drive', false]]);
  assert.deepEqual(plan.changes.spheres.map((x) => [x.name, x.archived]), [['Home', true]]);

  assert.deepEqual(plan.summary.deleted, ['Old idea']);
  assert.equal(plan.summary.done, 1);
  assert.equal(plan.summary.notFound, 1);
  assert.equal(st.tasks.find((t) => t.id === call.id).status, 'todo', 'до подтверждения ничего не меняется');
  assert.equal(st.goals[0].current, 4000);

  // удалить цель
  const gone = planImport(st, { goals: [{ id: 'g1', delete: true }] }, { uid });
  assert.deepEqual([gone.changes.deleteGoals, gone.summary.deleted], [['g1'], ['Car']]);
});

test('цвета сфер: новой — первый свободный, старым — по порядку, импорт и правка по id', () => {
  const sp = (id, order, color, archived = false) => ({ id, name: id, glyph: 'circle', order, archived, ...(color ? { color } : {}) });

  // первый свободный у активных; цвет архивной свободен; все заняты — по кругу
  assert.equal(nextColor([]), 'olive');
  assert.equal(nextColor([sp('a', 0, 'olive'), sp('b', 1, 'apricot')]), 'lavender');
  assert.equal(nextColor([sp('a', 0, 'olive', true)]), 'olive');
  const full = COLORS.map((c, i) => sp(`s${i}`, i, c));
  assert.equal(nextColor(full), COLORS[full.length % COLORS.length]);

  // сферы до цветов: цвет по порядку, заданный не трогается, записать — только поменянные
  const old = [sp('b', 1), sp('a', 0), sp('c', 2, 'olive'), sp('z', 3, null, true)];
  const changed = colorize(old);
  assert.deepEqual(changed.map((s) => s.id), ['a', 'b', 'z']);
  assert.deepEqual(Object.fromEntries(old.map((s) => [s.id, s.color])), { a: 'lavender', b: 'apricot', c: 'olive', z: 'mint' });
  assert.deepEqual(colorize(old), [], 'второй раз — ничего');

  // импорт: цвет из файла, иначе следующий свободный; чужое слово — как без цвета
  const st = { spheres: [sp('w', 0, 'olive')], tasks: [], goals: [], settings: {} };
  const plan = planImport(st, { spheres: [{ name: 'Health', color: 'mint' }, { name: 'Home' }, { name: 'Money', colour: 'red' }] }, { uid });
  assert.deepEqual(plan.spheres.map((s) => [s.name, s.color]), [['Health', 'mint'], ['Home', 'lavender'], ['Money', 'apricot']]);
  const edit = planImport(st, { spheres: [{ id: 'w', color: 'plum' }] }, { uid });
  assert.equal(edit.changes.spheres[0].color, 'plum');
  assert.equal(st.spheres[0].color, 'olive', 'сама сфера до подтверждения не меняется');
  assert.equal(planImport(st, { spheres: [{ id: 'w', color: 'pink' }] }, { uid }).changes.spheres[0].color, 'olive');

  // ИИ знает названия цветов и видит цвет сферы
  assert.ok(aiPrompt({ today: TODAY }).includes('olive, lavender, apricot, mint, slate, lilac, plum or khaki'));
  assert.equal(aiData(st).spheres[0].color, 'olive');
});
