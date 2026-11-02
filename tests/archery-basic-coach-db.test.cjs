const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

test('basic coaching retires charges while retaining archery purchases and progress', async t => {
  const db = new PGlite();
  const folder = path.join(__dirname, '../supabase/migrations');
  let user = '';
  const auth = async id => {
    user = id || '';
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec('set role authenticated');
  };
  const admin = async (sql, values = []) => {
    await db.exec('reset role');
    try { return await db.query(sql, values); }
    finally { await db.exec('set role authenticated'); }
  };
  const migrate = async suffix => {
    const filename = fs.readdirSync(folder).find(name => name.endsWith(`_${suffix}.sql`));
    assert(filename, `the CLI-generated ${suffix} migration exists`);
    await db.exec('reset role');
    await db.exec(fs.readFileSync(path.join(folder, filename), 'utf8'));
    await auth(user);
  };
  const rpc = async (name, values = []) => (await db.query(
    `select public.${name}(${values.map((_, i) => `$${i + 1}`).join(',')}) result`, values
  )).rows[0].result;
  const status = () => rpc('archery_ammo_status');
  const coach = (id = randomUUID()) => rpc('archery_coach_buy', [id]);
  const directCoach = async (id = randomUUID()) => (await db.query(
    "select ojjuda_archery_internal.operate('coach-buy',$1) result", [id]
  )).rows[0].result;
  const buy = (id = randomUUID()) => rpc('archery_ammo_buy', [id]);
  const receipt = (id, action = 'coach-buy') => rpc('archery_ammo_receipt', [id, action]);
  const account = async () => (await admin(
    'select * from ojjuda_archery_internal.accounts where user_id=$1', [user]
  )).rows[0];
  const ledger = async () => (await admin(
    'select * from ojjuda_note_internal.spend_requests where user_id=$1 order by request_id', [user]
  )).rows;
  const member = async coins => {
    const id = randomUUID();
    await admin('insert into public.user_private(user_id,coins) values($1,$2)', [id, coins]);
    await auth(id);
    return id;
  };
  const finishRound = async stage => {
    const start = await rpc('archery_round_start', [randomUUID(), stage]);
    assert.equal(start.ok, true);
    await admin("update ojjuda_archery_internal.runs set started_at=clock_timestamp()-interval '7 seconds' where run_id=$1", [start.run_id]);
    return rpc('archery_round_complete', [randomUUID(), start.run_id, stage]);
  };
  const functionMetadata = `select n.nspname,p.proname,p.prosrc,p.prosecdef,p.proconfig,p.proowner,p.proacl::text
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
    for (const suffix of ['archery_event_ammunition', 'archery_fresh_start', 'archery_timed_coach_pricing', 'archery_120_stage_range', 'archery_records_reset_v3']) {
      await migrate(suffix);
    }

    // Keep a genuine pre-change purchase and active game, not a fabricated receipt.
    const legacyUser = await member(40);
    const legacyCoachId = randomUUID(), legacyAmmoId = randomUUID();
    const legacyCoach = await coach(legacyCoachId), legacyAmmo = await buy(legacyAmmoId);
    assert.deepEqual([legacyCoach.price, legacyCoach.coins, legacyAmmo.coins], [10, 30, 25]);
    const legacyRun = await rpc('archery_round_start', [randomUUID(), 120]);
    const beforeAccount = await account(), beforeLedger = await ledger();
    const beforeReceipts = (await admin('select * from ojjuda_archery_internal.receipts order by request_id')).rows;
    const beforeRuns = (await admin('select * from ojjuda_archery_internal.runs order by run_id')).rows;
    const beforeFunctions = (await admin(functionMetadata)).rows;
    await migrate('archery_basic_coach');

    await t.test('migration changes no balances, purchases, expiries, runs, receipts or function permissions', async () => {
      assert.deepEqual(await account(), beforeAccount);
      assert.deepEqual(await ledger(), beforeLedger);
      assert.equal((await status()).coins, 25);
      assert.deepEqual((await admin('select * from ojjuda_archery_internal.receipts order by request_id')).rows, beforeReceipts);
      assert.deepEqual((await admin('select * from ojjuda_archery_internal.runs order by run_id')).rows, beforeRuns);
      const afterFunctions = (await admin(functionMetadata)).rows;
      assert.equal(afterFunctions.length, beforeFunctions.length);
      for (let i = 0; i < beforeFunctions.length; i++) {
        const old = beforeFunctions[i], current = afterFunctions[i];
        if (old.nspname === 'ojjuda_archery_internal' && old.proname === 'operate') {
          assert.deepEqual({ ...current, prosrc: old.prosrc }, old);
        } else assert.deepEqual(current, old, `${old.nspname}.${old.proname} must stay unchanged`);
      }
      assert.equal((await admin('select abandoned_at from ojjuda_archery_internal.runs where run_id=$1', [legacyRun.run_id])).rows[0].abandoned_at, null);
    });

    await t.test('old successful purchases and immutable receipts replay without charging or extending time', async () => {
      const recovered = await receipt(legacyCoachId);
      assert.deepEqual(recovered.receipt, legacyCoach);
      const replay = await coach(legacyCoachId);
      assert.equal(replay.ok, true);
      assert.equal(replay.replayed, true);
      assert.deepEqual([replay.coins, replay.price, replay.coach_expires_at], [25, 10, legacyCoach.coach_expires_at]);
      assert.deepEqual((await receipt(legacyAmmoId, 'buy')).receipt, legacyAmmo);
      assert.deepEqual(await account(), beforeAccount);
      assert.deepEqual(await ledger(), beforeLedger);
    });

    await t.test('an already-active legacy rental cannot buy a new period', async () => {
      const result = await coach();
      assert.deepEqual([result.ok, result.reason, result.coins], [false, 'coach_basic', 25]);
      assert.equal(result.coach_expires_at, legacyCoach.coach_expires_at);
      assert.deepEqual(await account(), beforeAccount);
      assert.deepEqual(await ledger(), beforeLedger);
    });

    await t.test('new, repeated and direct dispatcher requests never charge or create rental entitlements', async () => {
      await member(40);
      const initial = await status(), initialAccount = await account();
      const request = randomUUID();
      const first = await coach(request), replay = await coach(request), direct = await directCoach();
      for (const result of [first, replay, direct]) {
        assert.deepEqual([result.ok, result.reason, result.coins, result.coach_expires_at], [false, 'coach_basic', 40, null]);
        assert.equal(result.revision, initial.revision);
        assert.equal(result.coach_price, 10, 'retain the cached-client schema, not an active offer');
        assert.equal(result.coach_duration_seconds, 86400);
      }
      assert.equal(replay.replayed, true);
      assert.deepEqual((await receipt(request)).receipt, first);
      assert.deepEqual(await account(), initialAccount);
      assert.deepEqual(await ledger(), []);
    });

    await t.test('zero-balance accounts receive the same definitive basic-feature response', async () => {
      await member(0);
      const result = await coach();
      assert.deepEqual([result.ok, result.reason, result.coins], [false, 'coach_basic', 0]);
      assert.equal((await directCoach()).reason, 'coach_basic');
      assert.deepEqual(await ledger(), []);
    });

    await t.test('an expired legacy purchase cannot renew through a replay or new request', async () => {
      await auth(legacyUser);
      await admin("update ojjuda_archery_internal.accounts set coach_expires_at=clock_timestamp()-interval '1 second' where user_id=$1", [user]);
      const expiredAccount = await account();
      const replay = await coach(legacyCoachId), fresh = await coach();
      assert.equal(replay.replayed, true);
      assert.equal(replay.coach_active, false);
      assert.deepEqual([fresh.reason, fresh.coins, fresh.coach_active], ['coach_basic', 25, false]);
      assert.deepEqual(await account(), expiredAccount);
      assert.deepEqual((await receipt(legacyCoachId)).receipt, legacyCoach);
      assert.deepEqual(await ledger(), beforeLedger);
    });

    await t.test('queued duplicate coach requests stay idempotent while ammo still costs five JU', async () => {
      await member(10);
      const request = randomUUID();
      const results = await Promise.all([coach(request), coach(request), directCoach(), buy()]);
      assert(results.slice(0, 3).every(result => result.reason === 'coach_basic'));
      assert.equal(results[1].replayed, true);
      assert.deepEqual([results[3].price, results[3].ammo_added, results[3].coins], [5, 10, 5]);
      const final = await status();
      assert.deepEqual([final.coins, final.paid_remaining, final.coach_expires_at], [5, 10, null]);
      const rows = await ledger();
      assert.equal(rows.length, 1);
      assert.deepEqual([rows[0].kind, rows[0].coins], ['archery_ammo', 5]);
    });

    await t.test('retired requests preserve request conflicts and account isolation', async () => {
      const firstUser = await member(20), request = randomUUID();
      await coach(request);
      assert.equal((await buy(request)).reason, 'request_conflict');
      await member(30);
      assert.equal((await coach(request)).reason, 'request_conflict');
      assert.equal((await receipt(request)).found, false);
      assert.equal((await status()).coins, 30);
      await auth(firstUser);
      assert.equal((await status()).coins, 20);
      assert.deepEqual(await ledger(), []);
    });

    await t.test('120-stage play, milestone ammo, daily floor and ordinary ammo use remain operational', async () => {
      await member(0);
      assert.equal((await rpc('archery_round_start', [randomUUID(), 121])).reason, 'invalid');
      let result;
      for (let i = 0; i < 5; i++) result = await finishRound(120);
      assert.deepEqual([result.main_rounds, result.milestone_grant, result.remaining], [5, 20, 20]);
      const spent = await rpc('archery_ammo_spend', [randomUUID()]);
      assert.deepEqual([spent.spent, spent.remaining, spent.spent_from], [1, 19, 'free']);
      await admin(`update ojjuda_archery_internal.accounts set free_remaining=3,paid_remaining=7,
        first_milestone_day=ojjuda_archery_internal.korea_day(clock_timestamp())-2,
        daily_checked_day=ojjuda_archery_internal.korea_day(clock_timestamp())-1 where user_id=$1`, [user]);
      const refilled = await status();
      assert.deepEqual([refilled.daily_grant, refilled.remaining, refilled.paid_remaining], [10, 20, 7]);
      assert.equal((await status()).daily_grant, 0);
      assert.equal((await coach()).reason, 'coach_basic');
      assert.equal((await status()).remaining, 20);
    });

    await t.test('authentication, bans, invalid identifiers and private-table permissions remain enforced', async () => {
      await db.exec('set role anon');
      await assert.rejects(coach, /permission denied/);
      await assert.rejects(directCoach, /permission denied/);
      await auth(null);
      await assert.rejects(coach, /not_signed_in/);
      await assert.rejects(directCoach, /not_signed_in/);
      await auth(randomUUID());
      assert.equal((await coach()).reason, 'wallet_unavailable');
      const banned = await member(30);
      assert.equal((await rpc('archery_coach_buy', [null])).reason, 'invalid');
      await admin("update public.user_private set banned_until=now()+interval '1 day' where user_id=$1", [banned]);
      assert.equal((await coach()).reason, 'banned');
      assert.equal((await directCoach()).reason, 'banned');
      await assert.rejects(() => db.exec('select * from ojjuda_archery_internal.accounts'), /permission denied/);
      await assert.rejects(() => db.exec('update public.user_private set coins=999'), /permission denied/);
      assert.deepEqual(await ledger(), []);
    });
  } finally {
    await db.close();
  }
});
