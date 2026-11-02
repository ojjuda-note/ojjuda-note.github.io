const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

test('one-time archery record reset preserves purchases and reward entitlements', async t => {
  const db = new PGlite();
  let currentUser = '';
  const folder = path.join(__dirname, '../supabase/migrations');
  const migration = suffix => {
    const file = fs.readdirSync(folder).find(name => name.endsWith(suffix));
    assert(file, `migration exists: ${suffix}`);
    return fs.readFileSync(path.join(folder, file), 'utf8');
  };
  const auth = async id => {
    currentUser = id;
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec('set role authenticated');
  };
  const admin = async (sql, values = []) => {
    await db.exec('reset role');
    try { return await db.query(sql, values); }
    finally { await db.exec('set role authenticated'); }
  };
  const rpc = async (name, values = []) => {
    const args = values.map((_, i) => `$${i + 1}`).join(',');
    return (await db.query(`select public.${name}(${args}) result`, values)).rows[0].result;
  };
  const start = (stage, request = randomUUID()) => rpc('archery_round_start', [request, stage]);
  const complete = (run, stage, request = randomUUID()) => rpc('archery_round_complete', [request, run, stage]);
  const matureRound = async stage => {
    const run = await start(stage);
    assert.equal(run.ok, true);
    await admin("update ojjuda_archery_internal.runs set started_at=clock_timestamp()-interval '7 seconds' where run_id=$1", [run.run_id]);
    const request = randomUUID(), result = await complete(run.run_id, stage, request);
    assert.equal(result.ok, true);
    return { run: run.run_id, stage, request, result };
  };
  const rows = async (table, order) => (await admin(`select to_jsonb(t) value from ${table} t order by ${order}`)).rows.map(row => row.value);
  const snapshot = async () => ({
    accounts: await rows('ojjuda_archery_internal.accounts', 'user_id'),
    runs: await rows('ojjuda_archery_internal.runs', 'run_id'),
    awards: await rows('ojjuda_archery_internal.milestone_awards', 'user_id,ordinal'),
    receipts: await rows('ojjuda_archery_internal.receipts', 'request_id'),
    purchases: await rows('ojjuda_note_internal.spend_requests', 'request_id'),
    wallets: await rows('public.user_private', 'user_id'),
    otherGames: await rows('public.unrelated_game_records', 'user_id')
  });
  const applyReset = async () => {
    await db.exec('reset role');
    await db.exec(migration('_archery_records_reset_v3.sql'));
    await auth(currentUser);
  };

  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema ojjuda_note_internal;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.user_private(user_id uuid primary key,coins integer not null check(coins>=0),banned_until timestamptz);
      create function public.is_banned(p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
        begin
          if auth.uid() is distinct from p_user then raise exception 'helper_scope_denied'; end if;
          return exists(select 1 from public.user_private where user_id=p_user and banned_until>now());
        end; $$;
      create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid not null,kind text not null,coins integer not null,result jsonb not null);
      create table public.unrelated_game_records(user_id uuid primary key,stage integer not null,score integer not null);
      grant usage on schema public,auth to anon,authenticated;`);
    for (const suffix of ['_archery_event_ammunition.sql', '_archery_fresh_start.sql', '_archery_timed_coach_pricing.sql', '_archery_120_stage_range.sql']) {
      await db.exec(migration(suffix));
    }

    const players = [];
    for (const [index, roundCount] of [5, 10].entries()) {
      const user = randomUUID();
      await admin('insert into public.user_private(user_id,coins) values($1,$2)', [user, 50 + index * 25]);
      await admin('insert into public.unrelated_game_records(user_id,stage,score) values($1,$2,$3)', [user, 19 + index, 870 + index]);
      await auth(user);
      const ammoRequest = randomUUID(), coachRequest = randomUUID();
      const ammo = await rpc('archery_ammo_buy', [ammoRequest]);
      const coach = await rpc('archery_coach_buy', [coachRequest]);
      assert.equal(ammo.ok, true); assert.equal(coach.ok, true);
      let completed;
      for (let round = 0; round < roundCount; round++) completed = await matureRound(index ? 120 : 7);
      assert.equal((await rpc('archery_ammo_spend', [randomUUID()])).ok, true);
      await start(4); // An already-abandoned run must remain byte-for-byte intact.
      const active = await start(index ? 120 : 8);
      await admin("update ojjuda_archery_internal.runs set started_at=clock_timestamp()-interval '7 seconds' where run_id=$1", [active.run_id]);
      players.push({ user, ammoRequest, coachRequest, ammo, coach, completed, active, activeStage: index ? 120 : 8 });
    }
    const before = await snapshot();
    assert.equal(before.accounts.length, 2);
    assert.ok(before.accounts.every(account => account.free_remaining > 0 && account.paid_remaining > 0 && account.coach_expires_at));
    await applyReset();
    const after = await snapshot();

    await t.test('every player starts at zero rounds without losing balances, rentals, receipts or other games', async () => {
      assert.deepEqual(after.accounts, before.accounts.map(account => ({ ...account, main_rounds: 0, revision: account.revision + 1 })));
      for (const field of ['awards', 'receipts', 'purchases', 'wallets', 'otherGames']) assert.deepEqual(after[field], before[field], field);
      const backup = (await admin("select accounts,runs,milestone_awards,created_at from ojjuda_archery_internal.release_backups where release_key='archery-records-v3-20261102'")).rows[0];
      assert(backup);
      const sort = (items, key) => [...items].sort((a, b) => String(key(a)).localeCompare(String(key(b))));
      assert.deepEqual(sort(backup.accounts, row => row.user_id), before.accounts);
      assert.deepEqual(sort(backup.runs, row => row.run_id), before.runs);
      assert.deepEqual(sort(backup.milestone_awards, row => `${row.user_id}:${row.ordinal}`), before.awards);
      assert.deepEqual(after.runs, before.runs.map(run => run.completed_at === null && run.abandoned_at === null
        ? { ...run, abandoned_at: after.runs.find(saved => saved.run_id === run.run_id).abandoned_at } : run));
      const abandoned = after.runs.filter(run => players.some(player => player.active.run_id === run.run_id));
      assert.equal(abandoned.length, 2);
      assert.ok(abandoned.every(run => run.abandoned_at !== null));
      assert.equal(new Set(abandoned.map(run => run.abandoned_at)).size, 1, 'all open runs close at the same reset instant');
    });

    await t.test('a pre-reset open round cannot restore progress or earn a reward', async () => {
      for (const player of players) {
        await auth(player.user);
        const result = await complete(player.active.run_id, player.activeStage);
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'run_conflict');
        assert.equal(result.main_rounds, 0);
        const original = before.accounts.find(account => account.user_id === player.user);
        assert.deepEqual([result.free_remaining, result.paid_remaining, result.milestones_granted],
          [original.free_remaining, original.paid_remaining, original.milestones_granted]);
      }
    });

    await t.test('old completed-round and purchase retries use current counters without repeating effects', async () => {
      for (const player of players) {
        await auth(player.user);
        const replay = await complete(player.completed.run, player.completed.stage, player.completed.request);
        assert.equal(replay.ok, true); assert.equal(replay.replayed, true); assert.equal(replay.main_rounds, 0);
        const ammoReplay = await rpc('archery_ammo_buy', [player.ammoRequest]);
        const coachReplay = await rpc('archery_coach_buy', [player.coachRequest]);
        assert.equal(ammoReplay.replayed, true); assert.equal(coachReplay.replayed, true);
        assert.equal(coachReplay.coach_expires_at, player.coach.coach_expires_at);
        const original = before.accounts.find(account => account.user_id === player.user);
        assert.deepEqual([coachReplay.free_remaining, coachReplay.paid_remaining, coachReplay.coins],
          [original.free_remaining, original.paid_remaining, before.wallets.find(wallet => wallet.user_id === player.user).coins]);
      }
      assert.deepEqual(await rows('ojjuda_note_internal.spend_requests', 'request_id'), before.purchases);
    });

    await t.test('new progress survives reapplying the reset and old milestone ordinals do not pay twice', async () => {
      const player = players[0];
      await auth(player.user);
      let completed;
      for (let round = 0; round < 5; round++) completed = await matureRound(1);
      assert.equal(completed.result.main_rounds, 5);
      assert.equal(completed.result.milestone_grant, 0, 'ordinal 1 has already been paid before the reset');
      const original = before.accounts.find(account => account.user_id === player.user);
      assert.deepEqual([completed.result.free_remaining, completed.result.paid_remaining, completed.result.milestones_granted],
        [original.free_remaining, original.paid_remaining, original.milestones_granted]);
      const liveRun = await start(2);
      const beforeRepeat = await snapshot();
      await applyReset();
      assert.deepEqual(await snapshot(), beforeRepeat, 'the reset key makes the entire operation a one-time change');
      const stillActive = (await admin('select abandoned_at from ojjuda_archery_internal.runs where run_id=$1', [liveRun.run_id])).rows[0];
      assert.equal(stillActive.abandoned_at, null);
      assert.equal((await admin("select count(*)::integer total from ojjuda_archery_internal.release_backups where release_key='archery-records-v3-20261102'")).rows[0].total, 1);
    });

    await t.test('reset backup and server tables remain private with RLS enabled', async () => {
      const tables = (await admin(`select c.relname,c.relrowsecurity,
        has_table_privilege('anon',c.oid,'select') as anon_read,
        has_table_privilege('authenticated',c.oid,'select') as member_read,
        has_table_privilege('authenticated',c.oid,'update') as member_write
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='ojjuda_archery_internal' and c.relkind='r' order by c.relname`)).rows;
      assert.equal(tables.length, 5);
      for (const table of tables) {
        assert.equal(table.relrowsecurity, true, table.relname);
        assert.equal(table.anon_read, false, table.relname);
        assert.equal(table.member_read, false, table.relname);
        assert.equal(table.member_write, false, table.relname);
      }
      await assert.rejects(() => db.query('select * from ojjuda_archery_internal.release_backups'), /permission denied/);
    });
  } finally {
    await db.close();
  }
});
