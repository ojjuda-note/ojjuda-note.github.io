const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

const directory = path.join(__dirname, '../supabase/migrations');
const read = name => fs.readFileSync(path.join(directory, name), 'utf8');
const migration = read('20261119160744_pajang_natural_question_copy.sql');
const trainPrompt = '마음에 드는 사람과 기차 여행을 한다면, 어떤 풍경을 함께 보고 싶나요?';
const seeds = [
  '20261117090101_pajang_questions_taste.sql',
  '20261117090102_pajang_questions_world.sql',
  '20261117090103_pajang_questions_arts.sql',
  '20261117090104_pajang_questions_life.sql',
  '20261117090105_pajang_questions_together.sql',
  '20261117090106_pajang_questions_imagine.sql',
  '20261117090107_pajang_calendar_edition_1.sql',
  '20261117090108_pajang_calendar_edition_2.sql',
];

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create schema pajang_private;');
  await db.exec(read('20261117090000_pajang_question_catalog.sql'));
  for (const name of seeds) await db.exec(read(name));

  // The delivery functions need only the catalog and calendar. Do not load
  // the member API or synthetic member data for an editorial migration.
  const delivery = read('20261117090200_pajang_question_delivery.sql');
  const memberStart = delivery.indexOf('create or replace function public.pajang_member');
  assert.ok(memberStart > 0, 'question delivery functions precede the member API');
  await db.exec(delivery.slice(0, memberStart));
  return db;
}

async function catalog(db) {
  return (await db.query('select * from pajang_private.question_catalog order by id')).rows;
}

function identity(row) {
  const { prompt, samples, ...metadata } = row;
  return metadata;
}

test('question copy updates preserve all 936 identities and catalog constraints', async t => {
  const db = await fixture(t);
  const before = await catalog(db);
  assert.equal(before.length, 936);

  await db.exec(migration);
  const after = await catalog(db);
  assert.equal(after.length, 936);
  assert.deepEqual(after.map(identity), before.map(identity),
    'IDs, occasions, editions and turns must not change');
  assert.equal(new Set(after.map(row => row.prompt)).size, 936,
    'every question must retain a distinct prompt');
  for (const row of after) {
    assert.ok(row.prompt.trim(), `question ${row.id} has a nonempty prompt`);
    assert.equal(row.samples.length, 3, `question ${row.id} retains three examples`);
    assert.ok(row.samples.every(sample => typeof sample === 'string' && sample.trim()),
      `question ${row.id} has three nonempty examples`);
  }
  assert.equal(after.find(row => row.id === 5).prompt, trainPrompt);
  assert.deepEqual(after.find(row => row.id === 489), before.find(row => row.id === 489),
    'an already natural question and its examples remain unchanged');
});

async function scheduledQuestions(db) {
  return (await db.query(`
    select day::text, slot, pajang_private.question_for_window(day, slot) as question
    from (values
      (date '2026-11-20'), (date '2026-11-21'), (date '2026-12-12'),
      (date '2026-12-24'), (date '2027-01-01'), (date '2027-02-07'),
      (date '2027-03-13'), (date '2027-09-15'), (date '2027-10-09')
    ) dates(day)
    cross join (values ('am'), ('pm')) slots(slot)
    order by day, slot
  `)).rows;
}

test('current and future windows retain their IDs and serve the revised catalog copy', async t => {
  const db = await fixture(t);
  const before = await scheduledQuestions(db);
  await db.exec(migration);
  const after = await scheduledQuestions(db);
  const rows = new Map((await catalog(db)).map(row => [row.id, row]));

  const assignment = list => list.map(({ day, slot, question }) => [day, slot, question.id]);
  assert.deepEqual(assignment(after), assignment(before),
    'editorial changes must not move questions between dates or AM/PM slots');
  assert.ok(after.some(window => rows.get(window.question.id).occasion !== null),
    'the delivery check includes seasonal and holiday questions');
  for (const window of after) {
    const row = rows.get(window.question.id);
    assert.deepEqual(window.question.q, [row.prompt]);
    assert.deepEqual(window.question.answers, row.samples);
  }
  const train = after.find(window => window.day === '2026-11-20' && window.slot === 'am');
  assert.equal(train.question.id, 5);
  assert.deepEqual(train.question.q, [trainPrompt]);
});

test('copy migration can repeat but rejects concurrent edits without partially changing other rows', async t => {
  const db = await fixture(t);
  const before = await catalog(db);
  await db.exec(migration);
  const applied = await catalog(db);
  await db.exec(migration);
  assert.deepEqual(await catalog(db), applied, 'reapplying the same copy is a no-op');

  // Leave one other revised row at its original value so a failed retry has
  // an eligible update to reject, not just rows that are already up to date.
  const oldRows = new Map(before.map(row => [row.id, row]));
  const pending = applied.find(row => row.id !== 5 && (
    row.prompt !== oldRows.get(row.id).prompt ||
    JSON.stringify(row.samples) !== JSON.stringify(oldRows.get(row.id).samples)
  ));
  assert.ok(pending, 'another question is revised alongside the train question');
  const original = oldRows.get(pending.id);
  await db.query(`
    update pajang_private.question_catalog
    set prompt=$1, samples=array(select jsonb_array_elements_text($2::jsonb))
    where id=$3
  `, [original.prompt, JSON.stringify(original.samples), original.id]);
  await db.query('update pajang_private.question_catalog set prompt=$1 where id=5',
    ['다른 편집자가 먼저 수정한 기차 질문이에요.']);
  const conflicted = await catalog(db);

  await assert.rejects(db.exec(migration), /catalog changed/i);
  // An explicit transaction, if supplied by the migration, must also be
  // rolled back before inspecting the database after the expected failure.
  await db.exec('rollback');
  assert.deepEqual(await catalog(db), conflicted,
    'a conflict preserves the third-party edit and every other question');
});
