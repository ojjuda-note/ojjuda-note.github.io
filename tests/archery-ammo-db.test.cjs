const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

test('server-owned archery ammunition, timed coach and wallet transactions', async t => {
  const db = new PGlite();
  let currentUser = '';
  const auth = async id => {
    currentUser = id || '';
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [currentUser]);
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
  const status = () => rpc('archery_ammo_status');
  const buy = (id = randomUUID()) => rpc('archery_ammo_buy', [id]);
  const coachBuy = (id = randomUUID()) => rpc('archery_coach_buy', [id]);
  const spend = (id = randomUUID()) => rpc('archery_ammo_spend', [id]);
  const start = (stage = 1, id = randomUUID()) => rpc('archery_round_start', [id, stage]);
  const complete = (run, stage = 1, id = randomUUID()) => rpc('archery_round_complete', [id, run, stage]);
  const receipt = (id, action) => rpc('archery_ammo_receipt', [id, action]);
  const member = async (coins = 10) => {
    const id = randomUUID();
    await admin('insert into public.user_private(user_id,coins) values($1,$2)', [id, coins]);
    await auth(id);
    return id;
  };
  const account = async () => (await admin('select * from ojjuda_archery_internal.accounts where user_id=$1', [currentUser])).rows[0];
  const age = run => admin("update ojjuda_archery_internal.runs set started_at=clock_timestamp()-interval '7 seconds' where run_id=$1", [run]);
  const matureRound = async (stage = 1) => {
    const run = await start(stage);
    assert.equal(run.ok, true);
    await age(run.run_id);
    return complete(run.run_id, stage);
  };
  const setAccount = async (free, paid = 0, eligible = true, mainRounds = 5) => {
    await status();
    await admin(`update ojjuda_archery_internal.accounts set free_remaining=$2,paid_remaining=$3,
      main_rounds=$4,milestones_granted=least(10,$4/5),
      first_milestone_day=case when $5 then ojjuda_archery_internal.korea_day(clock_timestamp())-2 else null end,
      daily_checked_day=case when $5 then ojjuda_archery_internal.korea_day(clock_timestamp())-1 else null end
      where user_id=$1`, [currentUser, free, paid, mainRounds, eligible]);
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
      grant usage on schema public,auth to anon,authenticated;`);
    const folder = path.join(__dirname, '../supabase/migrations');
    const filename = fs.readdirSync(folder).find(name => name.endsWith('_archery_event_ammunition.sql'));
    assert(filename, 'the CLI-generated ammo migration exists');
    await db.exec(fs.readFileSync(path.join(folder, filename), 'utf8'));

    // A real old-price purchase must stay immutable when the new catalog is installed.
    const legacyUser = await member(30);
    const legacyRequest = randomUUID();
    const legacyPurchase = await buy(legacyRequest);
    const legacyAccount = await account();
    assert.deepEqual([legacyPurchase.price, legacyPurchase.ammo_added, legacyPurchase.coins], [1, 20, 29]);
    const pricingFile = fs.readdirSync(folder).find(name => name.endsWith('_archery_timed_coach_pricing.sql'));
    assert(pricingFile, 'the CLI-generated timed-coach/pricing migration exists');
    await db.exec('reset role');
    await db.exec(fs.readFileSync(path.join(folder, pricingFile), 'utf8'));
    await auth(legacyUser);

    await t.test('catalog migration preserves old-price balances and immutable purchase receipts', async () => {
      const migrated = await account();
      assert.deepEqual(migrated, { ...legacyAccount, coach_expires_at: null });
      const recovered = await receipt(legacyRequest, 'buy');
      assert.deepEqual(recovered.receipt, legacyPurchase);
      assert.deepEqual([recovered.pack_ammo, recovered.pack_price, recovered.coins, recovered.remaining], [10, 5, 29, 20]);
      const replay = await buy(legacyRequest);
      assert.equal(replay.replayed, true);
      assert.deepEqual([replay.price, replay.ammo_added, replay.coins, replay.remaining], [1, 20, 29, 20]);
      const ledger = (await admin('select coins,result from ojjuda_note_internal.spend_requests where request_id=$1', [legacyRequest])).rows[0];
      assert.equal(ledger.coins, 1);
      assert.deepEqual(ledger.result, legacyPurchase);
    });

    await t.test('private tables and helpers stay inaccessible; public RPCs require an authenticated member', async () => {
      await db.exec('set role anon');
      await assert.rejects(status, /permission denied/);
      await assert.rejects(coachBuy, /permission denied/);
      await auth(null);
      await assert.rejects(status, /not_signed_in/);
      await assert.rejects(coachBuy, /not_signed_in/);
      await auth(randomUUID());
      assert.equal((await status()).reason, 'wallet_unavailable');
      assert.equal((await coachBuy()).reason, 'wallet_unavailable');
      const id = await member();
      await status();
      await assert.rejects(() => db.exec('select * from ojjuda_archery_internal.accounts'), /permission denied/);
      await assert.rejects(() => db.exec('update ojjuda_archery_internal.accounts set free_remaining=999'), /permission denied/);
      await assert.rejects(() => db.exec("update ojjuda_archery_internal.accounts set coach_expires_at=now()+interval '1 year'"), /permission denied/);
      await assert.rejects(() => db.exec('update public.user_private set coins=999'), /permission denied/);
      await assert.rejects(() => db.query('select ojjuda_archery_internal.daily_floor($1,now())', [id]), /permission denied/);
      await assert.rejects(() => db.query('select ojjuda_archery_internal.snapshot($1,now())', [id]), /permission denied/);
      const tables = (await admin("select relname,relrowsecurity from pg_class where relnamespace='ojjuda_archery_internal'::regnamespace and relkind='r'")).rows;
      assert.equal(tables.length, 4);
      assert(tables.every(row => row.relrowsecurity));
      const wrappers = (await admin("select proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname like 'archery_%'")).rows;
      assert.equal(wrappers.length, 7);
      assert(wrappers.every(row => !row.prosecdef && row.proconfig.some(value => value.startsWith('search_path='))));
    });

    await t.test('new members begin with zero ammunition and receipt lookup creates no account', async () => {
      await member(7);
      const lookup = await receipt(randomUUID(), 'spend');
      assert.equal(lookup.found, false);
      assert.equal(lookup.receipt, null);
      assert.equal(lookup.remaining, 0);
      assert.equal(await account(), undefined);
      const result = await status();
      assert.deepEqual([result.remaining, result.free_remaining, result.paid_remaining, result.main_rounds, result.milestones_granted], [0, 0, 0, 0, 0]);
      assert.equal(result.daily_eligible, false);
      assert.equal(result.daily_checked, false);
      assert.equal(result.coins, 7);
      assert.equal(result.pack_ammo, 10);
      assert.equal(result.pack_price, 5);
      assert.equal(result.coach_price, 10);
      assert.equal(result.coach_duration_seconds, 86400);
      assert.equal(result.coach_expires_at, null);
      assert.equal(result.coach_active, false);
      assert(Number.isFinite(Date.parse(result.server_now)));
      assert.equal((await status()).remaining, 0);
      assert.equal((await spend()).reason, 'ammo_empty');
    });

    await t.test('server run IDs, one active run, six-second guard and immutable start receipts prevent replay grants', async () => {
      await member();
      const request = randomUUID();
      const first = await start(50, request);
      assert.match(first.run_id, /^[0-9a-f-]{36}$/);
      assert.notEqual(first.run_id, request);
      assert.equal(first.min_seconds, 6);
      assert.equal((await start(50, request)).run_id, first.run_id);
      assert.equal((await start(49, request)).reason, 'request_conflict');
      const found = await receipt(request, 'round-start');
      assert.equal(found.receipt.ok, true);
      assert.equal(found.receipt.run_id, first.run_id);
      const second = await start(3);
      assert.equal((await complete(first.run_id, 50)).reason, 'run_conflict');
      const completeId = randomUUID();
      const early = await complete(second.run_id, 3, completeId);
      assert.equal(early.reason, 'round_too_soon');
      assert(early.retry_after >= 1 && early.retry_after <= 6);
      assert.equal((await receipt(completeId, 'round-complete')).found, false);
      await age(second.run_id);
      const done = await complete(second.run_id, 3, completeId);
      assert.equal(done.main_rounds, 1);
      assert.equal(done.completed_now, true);
      assert.equal((await complete(second.run_id, 3, completeId)).main_rounds, 1);
      const freshRequest = await complete(second.run_id, 3);
      assert.equal(freshRequest.main_rounds, 1);
      assert.equal(freshRequest.completed_now, false);
      assert.equal((await complete(second.run_id, 4)).reason, 'run_conflict');
      assert.equal((await start(0)).reason, 'invalid');
      assert.equal((await start(51)).reason, 'invalid');
      const active = (await admin('select count(*)::int n from ojjuda_archery_internal.runs where user_id=$1 and abandoned_at is null and completed_at is null', [currentUser])).rows[0].n;
      assert.equal(active, 0);
    });

    await t.test('first ten five-round milestones award exactly 20 each; replayed stages count but bonuses stop after 50', async () => {
      await member();
      for (let round = 1; round <= 55; round++) {
        const result = await matureRound(round % 2 ? 50 : 1);
        const milestone = round <= 50 && round % 5 === 0;
        assert.equal(result.main_rounds, round);
        assert.equal(result.milestone_grant, milestone ? 20 : 0);
        assert.equal(result.remaining, Math.min(10, Math.floor(round / 5)) * 20);
        assert.equal(result.milestones_granted, Math.min(10, Math.floor(round / 5)));
        if (round === 20) assert.equal(result.remaining, 80, '5, 10, 15 and 20 rounds grant 80, with no extra daily 20');
      }
      const result = await status();
      assert.equal(result.remaining, 200);
      assert.equal(result.daily_checked, true);
      assert.equal(result.daily_eligible, false, 'first milestone day is excluded from the daily floor');
      const awards = (await admin('select ordinal,ammo from ojjuda_archery_internal.milestone_awards where user_id=$1 order by ordinal', [currentUser])).rows;
      assert.deepEqual(awards.map(row => row.ordinal), Array.from({ length: 10 }, (_, i) => i + 1));
      assert(awards.every(row => row.ammo === 20));
    });

    await t.test('Korea calendar rollover uses 15:00 UTC, independent of the database timezone', async () => {
      const rows = (await admin(`select ojjuda_archery_internal.korea_day('2026-11-01T14:59:59Z'::timestamptz)::text before_day,
        ojjuda_archery_internal.korea_day('2026-11-01T15:00:00Z'::timestamptz)::text after_day`)).rows[0];
      assert.deepEqual(rows, { before_day: '2026-11-01', after_day: '2026-11-02' });
    });

    await t.test('daily floor raises 0 or 19 to 20, preserves 20 or 80, and counts paid ammunition toward the same floor', async () => {
      for (const [free, paid, expectedFree] of [[0, 0, 20], [19, 0, 20], [20, 0, 20], [80, 0, 80], [0, 19, 1], [0, 20, 0], [10, 70, 10]]) {
        await member();
        await setAccount(free, paid);
        const before = await account();
        const result = await status();
        assert.equal(result.free_remaining, expectedFree);
        assert.equal(result.paid_remaining, paid);
        assert.equal(result.daily_grant, expectedFree - free);
        assert.equal(result.daily_eligible, true);
        assert.equal(result.daily_checked, true);
        assert.equal(result.revision, Number(before.revision) + 1);
        const again = await status();
        assert.equal(again.remaining, result.remaining);
        assert.equal(again.revision, result.revision);
        assert.equal(again.daily_grant, 0);
      }
    });

    await t.test('checking a high balance consumes the daily checkpoint even if the same day later reaches zero', async () => {
      await member();
      await setAccount(0, 80);
      const checked = await status();
      assert.equal(checked.daily_grant, 0);
      for (let shot = 0; shot < 80; shot++) assert.equal((await spend()).remaining, 79 - shot);
      assert.equal((await status()).remaining, 0);
      assert.equal((await spend()).reason, 'ammo_empty');
      await admin("update ojjuda_archery_internal.accounts set daily_checked_day=daily_checked_day-1 where user_id=$1", [currentUser]);
      const nextDay = await status();
      assert.equal(nextDay.remaining, 20);
      assert.equal(nextDay.paid_remaining, 0);
    });

    await t.test('spend, buy and completion apply rollover before any later-day milestone award', async () => {
      await member();
      await setAccount(19);
      let result = await spend();
      assert.equal(result.daily_grant, 1);
      assert.equal(result.remaining, 19);
      await member();
      await setAccount(0, 0);
      result = await buy();
      assert.equal(result.daily_grant, 20);
      assert.deepEqual([result.free_remaining, result.paid_remaining, result.remaining], [20, 10, 30]);
      await member();
      await setAccount(0, 0, true, 8);
      result = await matureRound();
      assert.equal(result.main_rounds, 9);
      assert.equal(result.daily_grant, 20);
      await member();
      await setAccount(0, 0, true, 9);
      result = await matureRound();
      assert.equal(result.main_rounds, 10);
      assert.equal(result.milestone_grant, 20);
      assert.equal(result.daily_grant, 20);
      assert.equal(result.remaining, 40);
      assert.equal((await status()).remaining, 40);
    });

    await t.test('each confirmed shot spends one free-first then paid unit; empty declines remain final after a later purchase', async () => {
      await member();
      await setAccount(1, 1, false, 0);
      const shot = randomUUID();
      let result = await spend(shot);
      assert.deepEqual([result.remaining, result.spent, result.spent_from], [1, 1, 'free']);
      assert.equal((await spend(shot)).remaining, 1);
      result = await spend();
      assert.deepEqual([result.remaining, result.spent_from], [0, 'paid']);
      const empty = randomUUID();
      assert.equal((await spend(empty)).reason, 'ammo_empty');
      await buy();
      result = await spend(empty);
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'ammo_empty');
      assert.equal(result.remaining, 10);
      assert.equal((await receipt(empty, 'spend')).receipt.ok, false);
      await setAccount(100, 2147483647, false, 0);
      assert.equal((await spend()).remaining, 2147483746, 'total comparison must not overflow a PostgreSQL integer');
    });

    await t.test('buy atomically trades five platform coins for 10 paid rounds with a shared ledger and exact-once receipt', async () => {
      await member(10);
      const request = randomUUID();
      const first = await buy(request);
      assert.equal(first.ok, true);
      assert.deepEqual([first.coins, first.paid_remaining, first.ammo_added, first.price], [5, 10, 10, 5]);
      const replay = await buy(request);
      assert.equal(replay.replayed, true);
      assert.deepEqual([replay.coins, replay.paid_remaining], [5, 10]);
      const ledger = (await admin('select kind,coins,result from ojjuda_note_internal.spend_requests where request_id=$1', [request])).rows[0];
      assert.equal(ledger.kind, 'archery_ammo');
      assert.equal(ledger.coins, 5);
      assert.equal(ledger.result.ok, true);
      await buy();
      const decline = randomUUID();
      assert.equal((await buy(decline)).reason, 'coins');
      await admin('update public.user_private set coins=5 where user_id=$1', [currentUser]);
      const stillDeclined = await buy(decline);
      assert.equal(stillDeclined.reason, 'coins');
      assert.deepEqual([stillDeclined.coins, stillDeclined.paid_remaining], [5, 20]);
      assert.equal((await receipt(decline, 'buy')).receipt.ok, false);
    });

    await t.test('the 10-round pack fills the integer capacity exactly and refuses overflow without payment', async () => {
      await member(20);
      await setAccount(100, 2147483637, false, 0);
      const filled = await buy();
      assert.equal(filled.ok, true);
      assert.deepEqual([filled.coins, filled.paid_remaining, filled.remaining], [15, 2147483647, 2147483747]);
      const over = await buy();
      assert.equal(over.reason, 'limit');
      assert.deepEqual([over.coins, over.paid_remaining, over.remaining], [15, 2147483647, 2147483747]);
    });

    await t.test('coach purchase trades exactly 10 JU for 86400 seconds measured by the server and replays once', async () => {
      await member(30);
      const request = randomUUID();
      const first = await coachBuy(request);
      assert.equal(first.ok, true);
      assert.equal(first.action, 'coach-buy');
      assert.deepEqual([first.coins, first.price, first.coach_price, first.coach_duration_seconds], [20, 10, 10, 86400]);
      assert.equal(first.coach_active, true);
      assert.equal(first.coach_started_at, first.server_now);
      assert.equal(Date.parse(first.coach_expires_at) - Date.parse(first.server_now), 86400000);
      assert.deepEqual([first.remaining, first.free_remaining, first.paid_remaining, first.main_rounds], [0, 0, 0, 0]);
      const stored = await account();
      assert.equal(new Date(stored.coach_expires_at).getTime(), Date.parse(first.coach_expires_at));
      const replay = await coachBuy(request);
      assert.equal(replay.replayed, true);
      assert.deepEqual([replay.coins, replay.coach_expires_at, replay.revision], [20, first.coach_expires_at, first.revision]);
      const recovered = await receipt(request, 'coach-buy');
      assert.equal(recovered.found, true);
      assert.deepEqual(recovered.receipt, first);
      assert.equal(recovered.coach_active, true);
      const ledger = (await admin('select kind,coins,result from ojjuda_note_internal.spend_requests where request_id=$1', [request])).rows[0];
      assert.equal(ledger.kind, 'archery_coach');
      assert.equal(ledger.coins, 10);
      assert.deepEqual(ledger.result, first);
    });

    await t.test('an active coach cannot be bought twice, and expiry permits only a fresh explicit renewal', async () => {
      const user = await member(40);
      const firstId = randomUUID();
      const first = await coachBuy(firstId);
      const declinedId = randomUUID();
      const declined = await coachBuy(declinedId);
      assert.equal(declined.ok, false);
      assert.equal(declined.reason, 'coach_active');
      assert.deepEqual([declined.coins, declined.coach_expires_at, declined.revision], [30, first.coach_expires_at, first.revision]);
      assert.equal((await receipt(declinedId, 'coach-buy')).receipt.reason, 'coach_active');
      assert.equal((await admin('select count(*)::int n from ojjuda_note_internal.spend_requests where request_id=$1', [declinedId])).rows[0].n, 0);

      await admin("update ojjuda_archery_internal.accounts set coach_expires_at=clock_timestamp()-interval '1 second' where user_id=$1", [user]);
      const expired = await status();
      assert.equal(expired.coach_active, false);
      const recovered = await receipt(firstId, 'coach-buy');
      assert.equal(recovered.coach_active, false, 'the current snapshot must override a historical active entitlement');
      assert.equal(recovered.receipt.coach_active, true, 'the old receipt still records the original purchase');
      const oldReplay = await coachBuy(firstId);
      assert.equal(oldReplay.ok, true);
      assert.equal(oldReplay.replayed, true);
      assert.equal(oldReplay.coach_active, false);
      assert.equal(oldReplay.coins, 30);
      const stillDeclined = await coachBuy(declinedId);
      assert.equal(stillDeclined.reason, 'coach_active');
      assert.equal(stillDeclined.coach_active, false);
      assert.equal(stillDeclined.coins, 30);

      const renewal = await coachBuy();
      assert.equal(renewal.ok, true);
      assert.equal(renewal.coach_active, true);
      assert.equal(renewal.coins, 20);
      assert.equal(Date.parse(renewal.coach_expires_at) - Date.parse(renewal.server_now), 86400000);
      assert(renewal.revision > first.revision);
    });

    await t.test('coach insufficient funds and request conflicts never debit or create an entitlement', async () => {
      const owner = await member(9);
      const declinedId = randomUUID();
      const declined = await coachBuy(declinedId);
      assert.equal(declined.reason, 'coins');
      assert.deepEqual([declined.coins, declined.coach_active, declined.coach_expires_at], [9, false, null]);
      await admin('update public.user_private set coins=30 where user_id=$1', [owner]);
      const replay = await coachBuy(declinedId);
      assert.equal(replay.reason, 'coins');
      assert.equal(replay.coins, 30);
      assert.equal(replay.coach_expires_at, null);
      assert.equal((await buy(declinedId)).reason, 'request_conflict');
      assert.equal((await receipt(declinedId, 'buy')).reason, 'request_conflict');
      const externalId = randomUUID();
      await admin('insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values($1,$2,$3,3,$4)', [externalId, owner, 'sacheonseong_hint', { ok: true }]);
      assert.equal((await coachBuy(externalId)).reason, 'request_conflict');
      const purchasedId = randomUUID();
      await coachBuy(purchasedId);
      await member(30);
      assert.equal((await coachBuy(purchasedId)).reason, 'request_conflict');
      assert.equal((await receipt(purchasedId, 'coach-buy')).found, false);
      assert.deepEqual([(await status()).coins, (await status()).coach_expires_at], [30, null]);
    });

    await t.test('competing coach and ammo purchases share the wallet lock; duplicate coach requests cannot extend time', async () => {
      await member(20);
      let results = await Promise.all([coachBuy(), coachBuy()]);
      assert.equal(results.filter(row => row.ok).length, 1);
      assert.equal(results.find(row => !row.ok).reason, 'coach_active');
      assert.equal((await status()).coins, 10);
      await member(10);
      const request = randomUUID();
      results = await Promise.all([coachBuy(request), coachBuy(request)]);
      assert(results.every(row => row.ok && row.coins === 0 && row.coach_active));
      assert.equal(new Set(results.map(row => row.coach_expires_at)).size, 1);
      assert.equal(results.filter(row => row.replayed).length, 1);
      await member(10);
      results = await Promise.all([coachBuy(), buy()]);
      assert.equal(results.filter(row => row.ok).length, 1);
      assert.equal(results.find(row => !row.ok).reason, 'coins');
      const latest = await status();
      assert((latest.coach_active && latest.coins === 0 && latest.remaining === 0) ||
        (!latest.coach_active && latest.coins === 5 && latest.remaining === 10));
    });

    await t.test('coach status and read-only receipt recovery use server time without extending or daily refilling', async () => {
      const user = await member(10);
      const request = randomUUID();
      const purchase = await coachBuy(request);
      await setAccount(0, 0);
      const before = await account();
      const lookup = await receipt(request, 'coach-buy');
      assert.equal(lookup.remaining, 0);
      assert.equal(lookup.daily_checked, false);
      assert.equal(lookup.coach_active, true);
      assert.equal(lookup.coach_expires_at, purchase.coach_expires_at);
      assert.deepEqual(await account(), before);
      const atExpiry = (await admin('select ojjuda_archery_internal.snapshot($1,$2::timestamptz) value', [user, purchase.coach_expires_at])).rows[0].value;
      assert.equal(atExpiry.coach_active, false, 'the exact expiry instant is excluded');
      const beforeExpiry = (await admin("select ojjuda_archery_internal.snapshot($1,$2::timestamptz-interval '1 microsecond') value", [user, purchase.coach_expires_at])).rows[0].value;
      assert.equal(beforeExpiry.coach_active, true);
      const refreshed = await status();
      assert.equal(refreshed.remaining, 20, 'the existing daily floor remains separate from coach entitlement');
      assert.equal(refreshed.coach_expires_at, purchase.coach_expires_at);
    });

    await t.test('a coach ledger failure rolls back payment, expiry and receipt as one transaction', async () => {
      await member(20);
      await status();
      const before = await account();
      const request = randomUUID();
      await admin(`create function ojjuda_note_internal.reject_test_coach() returns trigger language plpgsql as
        $$begin raise exception 'fixture_coach_ledger_failure'; end;$$`);
      await admin('create trigger reject_test_coach before insert on ojjuda_note_internal.spend_requests for each row execute function ojjuda_note_internal.reject_test_coach()');
      try { await assert.rejects(() => coachBuy(request), /fixture_coach_ledger_failure/); }
      finally {
        await admin('drop trigger reject_test_coach on ojjuda_note_internal.spend_requests');
        await admin('drop function ojjuda_note_internal.reject_test_coach()');
      }
      assert.deepEqual(await account(), before);
      assert.equal((await status()).coins, 20);
      assert.equal((await receipt(request, 'coach-buy')).found, false);
      const retry = await coachBuy(request);
      assert.equal(retry.coach_active, true);
      assert.equal(retry.coins, 10);
    });

    await t.test('request IDs cannot change action, owner, stage, run or collide with another game purchase', async () => {
      const owner = await member();
      const request = randomUUID();
      await buy(request);
      assert.equal((await spend(request)).reason, 'request_conflict');
      assert.equal((await receipt(request, 'spend')).reason, 'request_conflict');
      const ownRun = await start(8);
      await member();
      assert.equal((await buy(request)).reason, 'request_conflict');
      assert.equal((await receipt(request, 'buy')).found, false);
      assert.equal((await complete(ownRun.run_id, 8)).reason, 'run_not_found');
      await auth(owner);
      const external = randomUUID();
      await admin('insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values($1,$2,$3,3,$4)', [external, owner, 'sacheonseong_hint', { ok: true }]);
      const before = await status();
      assert.equal((await buy(external)).reason, 'request_conflict');
      const after = await status();
      assert.deepEqual([after.coins, after.remaining], [before.coins, before.remaining]);
      await age(ownRun.run_id);
      const completion = randomUUID();
      await complete(ownRun.run_id, 8, completion);
      assert.equal((await complete(randomUUID(), 8, completion)).reason, 'request_conflict');
    });

    await t.test('competing calls cannot overspend five coins or one bullet, and duplicate concurrent IDs charge once', async () => {
      await member(5);
      let results = await Promise.all([buy(), buy()]);
      assert.equal(results.filter(row => row.ok).length, 1);
      assert.equal(results.find(row => !row.ok).reason, 'coins');
      assert.deepEqual([(await status()).coins, (await status()).remaining], [0, 10]);
      await setAccount(1, 0, false, 0);
      results = await Promise.all([spend(), spend()]);
      assert.equal(results.filter(row => row.ok).length, 1);
      assert.equal(results.find(row => !row.ok).reason, 'ammo_empty');
      await member(5);
      const request = randomUUID();
      results = await Promise.all([buy(request), buy(request)]);
      assert(results.every(row => row.ok && row.paid_remaining === 10 && row.coins === 0));
      assert.equal(results.filter(row => row.replayed).length, 1);
    });

    await t.test('receipt recovery is read-only and returns the immutable result plus current counters without rollover', async () => {
      await member();
      const purchase = randomUUID();
      await buy(purchase);
      await spend();
      const current = await receipt(purchase, 'buy');
      assert.equal(current.remaining, 9);
      assert.equal(current.receipt.remaining, 10);
      assert.equal(current.receipt.ok, true);
      assert.equal(current.receipt.action, 'buy');
      await setAccount(0, 0);
      const before = await account();
      const lookup = await receipt(purchase, 'buy');
      assert.equal(lookup.remaining, 0);
      assert.equal(lookup.daily_checked, false);
      assert.deepEqual(await account(), before, 'verify-only lookup must not mark or refill a new day');
      assert.equal((await status()).remaining, 20);
      const startId = randomUUID();
      const run = await start(42, startId);
      assert.equal((await receipt(startId, 'round-start')).receipt.run_id, run.run_id);
      assert.equal((await receipt(randomUUID(), 'buy')).found, false);
    });

    await t.test('banned members and invalid actions cannot debit or create a run', async () => {
      const user = await member();
      await status();
      const before = await account();
      await admin("update public.user_private set banned_until=clock_timestamp()+interval '1 day' where user_id=$1", [user]);
      for (const action of [status, buy, coachBuy, spend, start, () => receipt(randomUUID(), 'buy'), () => receipt(randomUUID(), 'coach-buy')]) assert.equal((await action()).reason, 'banned');
      assert.deepEqual(await account(), before);
      await admin('update public.user_private set banned_until=null where user_id=$1', [user]);
      assert.equal((await rpc('archery_ammo_buy', [null])).reason, 'invalid');
      assert.equal((await rpc('archery_coach_buy', [null])).reason, 'invalid');
      assert.equal((await rpc('archery_round_complete', [randomUUID(), null, 1])).reason, 'invalid');
      assert.equal((await receipt(randomUUID(), 'arbitrary-rpc')).reason, 'invalid');
    });

    await t.test('a ledger write failure rolls the coin debit, ammunition credit and receipt back together', async () => {
      await member(10);
      await status();
      const before = await account();
      await admin(`create function ojjuda_note_internal.reject_test_purchase() returns trigger language plpgsql as
        $$begin raise exception 'fixture_ledger_failure'; end;$$`);
      await admin('create trigger reject_test_purchase before insert on ojjuda_note_internal.spend_requests for each row execute function ojjuda_note_internal.reject_test_purchase()');
      const request = randomUUID();
      try { await assert.rejects(() => buy(request), /fixture_ledger_failure/); }
      finally {
        await admin('drop trigger reject_test_purchase on ojjuda_note_internal.spend_requests');
        await admin('drop function ojjuda_note_internal.reject_test_purchase()');
      }
      assert.deepEqual(await account(), before);
      assert.equal((await status()).coins, 10);
      assert.equal((await receipt(request, 'buy')).found, false);
      assert.equal((await buy(request)).paid_remaining, 10, 'explicit retry is safe after an atomic rollback');
    });
    await t.test('the requested fresh start resets only archery once and keeps payment receipts and a private rollback snapshot', async () => {
      const user = await member(30);
      for (let index = 0; index < 5; index++) await matureRound();
      const purchaseId = randomUUID();
      await buy(purchaseId);await spend();await spend();
      const obsoleteRun = await start(9);
      const before = await account();
      assert.deepEqual([before.main_rounds, before.free_remaining, before.paid_remaining], [5, 18, 10]);
      const walletBefore = (await admin('select user_id,coins from public.user_private order by user_id')).rows;
      const resetFile = fs.readdirSync(folder).find(name => name.endsWith('_archery_fresh_start.sql'));
      assert(resetFile, 'the explicit reset has a CLI-generated migration');
      const resetSql = fs.readFileSync(path.join(folder, resetFile), 'utf8');
      await db.exec('reset role');await db.exec(resetSql);await auth(user);
      const fresh = await status();
      assert.deepEqual([fresh.remaining, fresh.main_rounds, fresh.milestones_granted, fresh.daily_eligible], [0, 0, 0, false]);
      assert.equal(fresh.coins, 25);
      assert.ok(fresh.revision > before.revision);
      assert.deepEqual((await admin('select user_id,coins from public.user_private order by user_id')).rows, walletBefore);
      assert.equal((await complete(obsoleteRun.run_id, 9)).reason, 'run_not_found', 'an old open round cannot recreate progress');
      const purchaseReceipt = await receipt(purchaseId, 'buy');
      assert.equal(purchaseReceipt.found, true);
      assert.equal(purchaseReceipt.receipt.ammo_added, 10);
      assert.equal((await buy(purchaseId)).remaining, 0, 'an old purchase replay cannot charge or grant again');
      await assert.rejects(() => db.exec('select * from ojjuda_archery_internal.release_backups'), /permission denied/);
      const backup = (await admin("select accounts,runs,milestone_awards from ojjuda_archery_internal.release_backups where release_key='archery-progression-v2'")).rows[0];
      const saved = backup.accounts.find(entry => entry.user_id === user);
      assert.deepEqual([saved.main_rounds, saved.free_remaining, saved.paid_remaining], [5, 18, 10]);
      assert.ok(backup.runs.some(entry => entry.run_id === obsoleteRun.run_id));
      assert.ok(backup.milestone_awards.some(entry => entry.user_id === user && entry.ordinal === 1));
      await matureRound();
      await db.exec('reset role');await db.exec(resetSql);await auth(user);
      assert.equal((await status()).main_rounds, 1, 'reapplying the release must not reset a new journey');
      for (let index = 1; index < 5; index++) await matureRound();
      const firstMilestone = await status();
      assert.deepEqual([firstMilestone.main_rounds, firstMilestone.remaining, firstMilestone.milestones_granted], [5, 20, 1]);
    });
  } finally { await db.close(); }
});
