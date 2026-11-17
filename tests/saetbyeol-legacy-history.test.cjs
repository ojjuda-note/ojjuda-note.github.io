const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

const before = '2026-11-17T10:29:53.999999Z';
const cutoff = '2026-11-17T10:29:54Z';
const after = '2026-11-17T10:29:54.000001Z';
const memberId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const guestToken = n => n.toString(16).padStart(64, '0');
const hash = token => createHash('sha256').update(token).digest('hex');

test('legacy food history uses only the caller’s own dated Saetbyeol evidence', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create role unrelated_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table public.game_scores (user_id uuid, game text, score bigint, created_at timestamptz);
    create schema ojjuda_guest_internal;
    create table ojjuda_guest_internal.scores (
      day date, game text, guest_hash text, score bigint, achieved_at timestamptz,
      last_score bigint, last_submitted_at timestamptz
    );
    create schema ojjuda_ranking_internal;
    create table ojjuda_ranking_internal.guest_peaks (
      month_start date, game text, guest_hash text, score bigint, achieved_at timestamptz
    );
  `);
  const migration = path.join(__dirname,
    '../supabase/migrations/20261117220000_saetbyeol_legacy_food_history.sql');
  await db.exec(readFileSync(migration, 'utf8'));

  const members = [
    [50000, before, 'saetbyeol', true], [57680, before, 'saetbyeol', true],
    [49999, before, 'saetbyeol', false], [57681, before, 'saetbyeol', false],
    [50000, cutoff, 'saetbyeol', false], [57680, after, 'saetbyeol', false],
    [57680, before, 'other', false]
  ];
  for (const [i, [score, time, game]] of members.entries()) {
    await db.query('insert into public.game_scores values ($1, $2, $3, $4)',
      [memberId(i + 1), game, score, time]);
  }
  const daily = [
    [57680, before, 100, after, 'saetbyeol', true],
    [57681, before, 50000, before, 'saetbyeol', true],
    [57681, before, 50000, after, 'saetbyeol', false],
    [57680, cutoff, 50000, after, 'saetbyeol', false],
    [49999, before, 0, before, 'saetbyeol', false],
    [57680, before, 50000, before, 'other', false]
  ];
  for (const [i, [best, bestTime, last, lastTime, game]] of daily.entries()) {
    await db.query(`insert into ojjuda_guest_internal.scores
      values (date '2026-11-17', $1, $2, $3, $4, $5, $6)`,
      [game, hash(guestToken(i + 1)), best, bestTime, last, lastTime]);
  }
  const monthly = [
    [50000, before, 'saetbyeol', true], [57680, cutoff, 'saetbyeol', false],
    [57681, before, 'saetbyeol', false], [50000, before, 'other', false]
  ];
  for (const [i, [score, time, game]] of monthly.entries()) {
    await db.query(`insert into ojjuda_ranking_internal.guest_peaks
      values (date '2026-11-01', $1, $2, $3, $4)`,
      [game, hash(guestToken(i + 10)), score, time]);
  }

  const eligible = async (token = null) => {
    const result = await db.query('select public.saetbyeol_legacy_food_eligible($1) as ok', [token]);
    return result.rows[0].ok;
  };
  const setActor = id => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);

  await db.exec('set role authenticated');
  for (const [i, [,, game, expected]] of members.entries()) {
    await setActor(memberId(i + 1));
    assert.equal(await eligible(guestToken(1)), expected, `member case ${i + 1}, game ${game}`);
  }
  await setActor(memberId(99));
  assert.equal(await eligible(guestToken(1)), false, 'logged-in user cannot substitute eligible guest');

  await db.exec('reset role; set role anon');
  await setActor('');
  const empty = await db.query('select public.saetbyeol_legacy_food_eligible() as ok');
  assert.equal(empty.rows[0].ok, false, 'no guest token cannot expose a member score');
  for (const token of ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64),
    'g'.repeat(64), memberId(1), hash(guestToken(1)), guestToken(99)]) {
    assert.equal(await eligible(token), false, 'invalid or unknown guest token');
  }
  await db.exec('begin transaction read only');
  for (const [i, [,,,,, expected]] of daily.entries()) {
    assert.equal(await eligible(guestToken(i + 1)), expected, `guest daily case ${i + 1}`);
  }
  for (const [i, [,,, expected]] of monthly.entries()) {
    assert.equal(await eligible(guestToken(i + 10)), expected, `guest monthly case ${i + 1}`);
  }
  await db.exec('commit');
  await assert.rejects(db.query('select * from ojjuda_guest_internal.scores'), { code: '42501' });
  await assert.rejects(db.query('select * from ojjuda_ranking_internal.guest_peaks'), { code: '42501' });
  await db.exec('reset role; set role unrelated_role');
  await assert.rejects(eligible(guestToken(1)), { code: '42501' });
});
