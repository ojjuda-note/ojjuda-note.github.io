const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

test('220-stage extension retains records, free coaching and server-owned reward limits', async t => {
  const db = new PGlite();
  const folder = path.join(__dirname, '../supabase/migrations');
  let user = '';
  const auth = async id => {
    user = id || '';
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec('set role authenticated');
  };
  const admin = async (sql, args = []) => {
    await db.exec('reset role');
    try { return await db.query(sql, args); }
    finally { await db.exec('set role authenticated'); }
  };
  const migrate = async suffix => {
    const file = fs.readdirSync(folder).find(name => name.endsWith(`_${suffix}.sql`));
    assert(file);
    await db.exec('reset role');
    await db.exec(fs.readFileSync(path.join(folder, file), 'utf8'));
    await auth(user);
  };
  const rpc = async (name, args = []) => (await db.query(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args
  )).rows[0].result;
  const start = (stage, id = randomUUID()) => rpc('archery_round_start', [id, stage]);
  const finish = (run, stage, id = randomUUID()) => rpc('archery_round_complete', [id, run, stage]);
  const age = run => admin("update ojjuda_archery_internal.runs set started_at=clock_timestamp()-interval '7 seconds' where run_id=$1", [run]);
  const snapshot = async () => {
    const data = {};
    for (const table of ['public.user_private', 'ojjuda_archery_internal.accounts', 'ojjuda_archery_internal.runs',
      'ojjuda_archery_internal.receipts', 'ojjuda_archery_internal.milestone_awards', 'ojjuda_note_internal.spend_requests']) {
      data[table] = (await admin(`select row_to_json(t) data from ${table} t order by row_to_json(t)::text`)).rows;
    }
    return data;
  };
  const metadata = `select n.nspname,p.proname,p.prosrc,p.prosecdef,p.proconfig,p.proowner,p.proacl::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ojjuda_archery_internal' or (n.nspname='public' and p.proname like 'archery_%')
    order by n.nspname,p.proname`;

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
      grant usage on schema public,auth to anon,authenticated;`);
    for (const suffix of ['archery_event_ammunition', 'archery_fresh_start', 'archery_timed_coach_pricing',
      'archery_120_stage_range', 'archery_records_reset_v3', 'archery_basic_coach']) await migrate(suffix);
    const member = randomUUID();
    await admin('insert into public.user_private(user_id,coins) values($1,40)', [member]);
    await auth(member);
    const purchaseId = randomUUID(), purchase = await rpc('archery_ammo_buy', [purchaseId]);
    const oldStartId = randomUUID(), oldRun = await start(120, oldStartId);
    assert.equal(oldRun.ok, true);
    assert.equal((await start(121)).reason, 'invalid');
    const before = await snapshot(), beforeFunctions = (await admin(metadata)).rows;
    await migrate('archery_220_stage_range');

    await t.test('migration preserves all rows and changes only the dispatcher range', async () => {
      assert.deepEqual(await snapshot(), before);
      const afterFunctions = (await admin(metadata)).rows;
      assert.equal(afterFunctions.length, beforeFunctions.length);
      for (let i = 0; i < beforeFunctions.length; i++) {
        const old = beforeFunctions[i];
        const expected = old.nspname === 'ojjuda_archery_internal' && old.proname === 'operate'
          ? {...old, prosrc: old.prosrc.replace('p_stage not between 1 and 120', 'p_stage not between 1 and 220')} : old;
        assert.deepEqual(afterFunctions[i], expected);
      }
      const recovered = await rpc('archery_ammo_receipt', [purchaseId, 'buy']);
      assert.deepEqual(recovered.receipt, purchase);
      assert.equal((await rpc('archery_ammo_buy', [purchaseId])).replayed, true);
      assert.equal((await rpc('archery_ammo_status')).coins, 35);
    });

    await t.test('an active stage120 round and its old request remain valid', async () => {
      const replay = await start(120, oldStartId);
      assert.equal(replay.replayed, true);assert.equal(replay.run_id, oldRun.run_id);
      await age(oldRun.run_id);
      assert.equal((await finish(oldRun.run_id, 120)).completed_now, true);
    });

    await t.test('new boundary stages register and settle exactly once', async () => {
      for (const stage of [121, 219, 220]) {
        const run = await start(stage), completionId = randomUUID();
        assert.equal(run.ok, true);assert.equal(run.stage, stage);
        assert.equal((await finish(run.run_id, stage, completionId)).reason, 'round_too_soon');
        await age(run.run_id);
        const settled = await finish(run.run_id, stage, completionId);
        assert.equal(settled.ok, true);assert.equal(settled.completed_now, true);
        const replay = await finish(run.run_id, stage, completionId);
        assert.equal(replay.replayed, true);assert.equal(replay.main_rounds, settled.main_rounds);
        const duplicate = await finish(run.run_id, stage);
        assert.equal(duplicate.completed_now, false);assert.equal(duplicate.milestone_grant, 0);
      }
    });

    await t.test('out-of-range requests and table writes remain rejected', async () => {
      for (const stage of [0, 221, null]) {
        assert.equal((await start(stage)).reason, 'invalid');
        assert.equal((await finish(randomUUID(), stage)).reason, 'invalid');
      }
      await assert.rejects(admin('insert into ojjuda_archery_internal.runs(user_id,stage,started_at) values($1,221,clock_timestamp())', [user]), /runs_stage_check/);
      await assert.rejects(db.query('select * from ojjuda_archery_internal.runs'), /permission denied/);
      const rls = (await admin("select relrowsecurity from pg_class where oid='ojjuda_archery_internal.runs'::regclass")).rows[0];
      assert.equal(rls.relrowsecurity, true);
      await db.exec('reset role; set role anon');
      await assert.rejects(rpc('archery_round_start', [randomUUID(), 220]), /permission denied/);
      await auth(member);
    });

    await t.test('stage expansion neither reintroduces coach fees nor extends milestone rewards', async () => {
      const balance = await rpc('archery_ammo_status');
      const coach = await rpc('archery_coach_buy', [randomUUID()]);
      assert.deepEqual([coach.ok, coach.reason, coach.coins], [false, 'coach_basic', balance.coins]);
      await admin(`update ojjuda_archery_internal.accounts set main_rounds=50,milestones_granted=10,
        first_milestone_day=ojjuda_archery_internal.korea_day(clock_timestamp()),
        daily_checked_day=ojjuda_archery_internal.korea_day(clock_timestamp()) where user_id=$1`, [user]);
      const initial = await rpc('archery_ammo_status');
      const run = await start(220);await age(run.run_id);
      const result = await finish(run.run_id, 220);
      assert.equal(result.main_rounds, 51);assert.equal(result.milestone_grant, 0);
      assert.equal(result.remaining, initial.remaining);assert.equal(result.coins, initial.coins);
    });

    await t.test('reapplying the guarded migration is harmless', async () => {
      const state = await snapshot(), functions = (await admin(metadata)).rows;
      await migrate('archery_220_stage_range');
      assert.deepEqual(await snapshot(), state);assert.deepEqual((await admin(metadata)).rows, functions);
    });
  } finally { await db.close(); }
});
