/**
 * Правила трекера без браузера: node --test tracker/test/
 * Данные здесь выдуманные — настоящих задач в репозитории нет и не будет.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, diffDays, dueLabel, fmtDay, fmtMonth } from '../src/dates.js';
import { brief, dayTasks, exportForClaude, isDayFull, overdue, planGroups, sphereCounts, sphereTasks } from '../src/logic.js';
import { detect, makeBackup, planImport, readBackup, normDate, normPriority, normStatus } from '../src/io.js';

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
  );
  const g = planGroups(st, TODAY);
  assert.equal(g.target, '2026-09-25');
  assert.deepEqual(g.carried.map((t) => t.title), ['carried']);
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

test('бриф и экспорт для Claude: неделя от сегодня, цели месяца, компактный JSON', () => {
  const st = world();
  st.tasks.push(
    task('tomorrow', { day: addDays(TODAY, 1), sphereId: 'sa', priority: 'high' }),
    task('friday', { deadline: addDays(TODAY, 2) }),
    task('far', { deadline: addDays(TODAY, 9) }),
  );
  st.goals.push({
    id: 'g1', title: 'Goal', order: 0, steps: [
      { id: 's1', title: 'now', month: '2026-09', done: true },
      { id: 's2', title: 'now 2', month: '2026-09', done: false },
      { id: 's3', title: 'next', month: '2026-10', done: false },
    ],
  });
  const b = brief(st, TODAY);
  assert.equal(b.week.length, 7);
  assert.equal(b.week[0].date, TODAY);
  assert.deepEqual(b.week[2].tasks.map((t) => t.title), ['friday']);
  assert.equal(b.goals[0].done, 1);
  assert.equal(b.goals[0].total, 2);

  const out = exportForClaude(st, TODAY);
  assert.ok(!out.includes('\n'));
  const data = JSON.parse(out);
  assert.deepEqual(data.brief.tomorrow, ['tomorrow']);
  assert.equal(data.goals[0].progress, '1/2');
  assert.equal(data.tasks.find((t) => t.title === 'tomorrow').sphere, 'Alpha');
  assert.equal(data.tasks.find((t) => t.title === 'far').priority, undefined);
});

test('импорт: нормализация значений', () => {
  assert.equal(normStatus('In Progress'), 'doing');
  assert.equal(normStatus('готово'), 'done');
  assert.equal(normPriority('высокий'), 'high');
  assert.equal(normPriority(2), 'medium');
  assert.equal(normDate('2026-10-03T09:00:00Z'), '2026-10-03');
  assert.equal(normDate('3.10.2026'), '2026-10-03');
  assert.equal(normDate('soon'), null);
});

test('импорт: сферы по названию, повторы пропускаются, цели дополняются', () => {
  const st = world();
  st.tasks.push(task('Existing', { sphereId: 'sa' }), task('Closed', { status: 'done' }));
  st.goals.push({ id: 'g1', title: 'Run', order: 0, steps: [{ id: 'x', title: 'Week 1', month: '2026-09', done: false }] });

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
      { title: 'run', steps: ['Week 1', 'Week 2'] },
      { name: 'Read', month: '2026-10', steps: [{ title: 'Book' }] },
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
  assert.equal(st.goals[0].steps.length, 1, 'исходная цель не меняется до подтверждения');
  const read = plan.goals.find((g) => g.title === 'Read');
  assert.equal(read.steps[0].month, '2026-10');
  assert.equal(plan.summary.steps, 2);
});

test('импорт: день из файла не переполняет лимит в три', () => {
  const st = world();
  st.tasks.push(task('a', { day: TODAY }), task('b', { day: TODAY, dayOrder: 1 }));
  const plan = planImport(st, { tasks: [{ title: 'c', day: TODAY }, { title: 'd', day: TODAY }] }, { uid, today: TODAY });
  assert.deepEqual(plan.tasks.map((t) => t.day), [TODAY, null]);
  assert.equal(plan.tasks[0].dayOrder, 2);
});

test('резервная копия: туда и обратно, чужие файлы не принимаются', () => {
  const st = world();
  st.tasks.push(task('x'));
  const copy = JSON.parse(JSON.stringify(makeBackup(st, new Date('2026-09-24T20:00:00Z'))));
  assert.equal(detect(copy), 'backup');
  const back = readBackup(copy);
  assert.deepEqual(back.tasks.map((t) => t.title), ['x']);
  assert.equal(back.spheres.length, 3);
  assert.throws(() => readBackup({ tasks: [] }));
  assert.throws(() => readBackup({ ...copy, schema: 99 }));
  assert.equal(detect([1, 2]), null);
  assert.equal(detect({ foo: 1 }), null);
});
