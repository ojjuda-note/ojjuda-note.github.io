const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

// Real SQL, synthetic members, and an in-memory database only. No live wallet.
test('24-hour saju access renews explicitly without changing past payments', async t => {
  const db = new PGlite();
  const dir = path.join(__dirname, '../supabase/migrations');
  const apply = name => db.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
  const key = text => createHash('sha256').update('synthetic-expiry:' + text).digest('hex');
  const chart = key('chart'), otherChart = key('other');
  let currentUser;
  const login = async (id, role = id ? 'authenticated' : 'anon') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
    await db.exec('set role ' + role);
    currentUser = id;
  };
  const member = async (coins = 100, anonymous = false, wallet = true) => {
    await db.exec('reset role');
    const id = randomUUID();
    await db.query('insert into auth.users values($1,$2)', [id,anonymous]);
    if (wallet) await db.query('insert into public.user_private(user_id,coins) values($1,$2)', [id,coins]);
    return id;
  };
  const status = async (chartKey = chart) =>
    (await db.query('select public.saju_reading_status_v4($1) as value', [chartKey])).rows[0].value;
  const one = async (topic = 'lifelong', options = {}) => {
    const { id = randomUUID(), chartKey = chart, year = topic === 'lifelong' ? 0 : 2026,
      expectedCharge = 10, verify = false, owner = currentUser } = options;
    return (await db.query('select public.saju_reading_buy_v4($1::uuid,$2::text,$3::text,$4::integer,$5::uuid,$6::integer,$7::boolean) as value',
      [id,chartKey,topic,year,owner,expectedCharge,verify])).rows[0].value;
  };
  const all = async (options = {}) => {
    const { id = randomUUID(), chartKey = chart, year = 2026, expectedCharge = 30, verify = false, owner = currentUser } = options;
    return (await db.query('select public.saju_reading_buy_all_v4($1::uuid,$2::text,$3::integer,$4::uuid,$5::integer,$6::boolean) as value',
      [id,chartKey,year,owner,expectedCharge,verify])).rows[0].value;
  };
  const state = async id => {
    await db.exec('reset role');
    return (await db.query(`select
      (select coins from public.user_private where user_id=$1) as coins,
      (select count(*)::int from ojjuda_saju_internal.topic_entitlements where user_id=$1) as parts,
      (select count(*)::int from ojjuda_saju_internal.all_orders where user_id=$1) as orders,
      (select count(*)::int from ojjuda_note_internal.spend_requests where user_id=$1) as requests,
      (select coalesce(sum(coins),0)::int from ojjuda_note_internal.spend_requests where user_id=$1) as spent`, [id])).rows[0];
  };
  const age = async (user, topic, hours = 24, chartKey = chart, year = topic === 'lifelong' ? 0 : 2026) => {
    await db.exec('reset role');
    await db.query("update ojjuda_saju_internal.topic_entitlements set purchased_at=clock_timestamp()-$1::double precision*interval '1 hour' where user_id=$2 and chart_key=$3 and topic=$4 and year=$5", [hours,user,chartKey,topic,year]);
    await login(user);
  };
  const assertSingle = (receipt, charged) => {
    assert.equal(receipt.ok, true);
    assert.equal(receipt.entitled, true);
    assert.equal(receipt.entitlement_version, 2);
    assert.equal(receipt.access_version, 4);
    assert.equal(receipt.access_hours, 24);
    assert.equal(receipt.price, 10);
    assert.equal(receipt.charged, charged);
    assert.equal(Date.parse(receipt.expires_at) - Date.parse(receipt.paid_at), 86400000);
    assert.ok(Date.parse(receipt.server_now) < Date.parse(receipt.expires_at));
  };
  const assertAll = (receipt, charged) => {
    assert.equal(receipt.ok, true);
    assert.equal(receipt.entitlement_version, 3);
    assert.equal(receipt.access_version, 4);
    assert.equal(receipt.access_hours, 24);
    assert.equal(receipt.price, 30);
    assert.equal(receipt.charged, charged);
    assert.equal(receipt.items.length, 3);
    assert.equal(receipt.items.reduce((sum,item) => sum + item.charged, 0), charged);
    assert.equal(Date.parse(receipt.expires_at), Math.min(...receipt.items.map(item => Date.parse(item.expires_at))));
    for (const item of receipt.items) {
      assertSingle(item, item.charged);
      assert.equal(item.coins, receipt.coins);
      assert.equal(item.server_now, receipt.server_now);
    }
  };
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema ojjuda_note_internal;
      create table auth.users(id uuid primary key,is_anonymous boolean);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.user_private(user_id uuid primary key references auth.users(id) on delete cascade,
        coins integer not null,banned_until timestamptz);
      alter table public.user_private enable row level security;
      create policy wallet_read on public.user_private for select to authenticated using(user_id=auth.uid());
      grant select on public.user_private to authenticated;
      create function public.is_banned(u uuid) returns boolean language sql stable security definer set search_path='' as
        $$select exists(select 1 from public.user_private where user_id=u and banned_until>now())$$;
      create table ojjuda_note_internal.spend_requests(
        request_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
        kind text not null check(char_length(kind) between 1 and 60),target_id uuid,
        coins integer not null check(coins>=0),result jsonb not null default '{}',created_at timestamptz not null default now()
      );
      grant usage on schema public,auth to anon,authenticated;
    `);
    await apply('20261112152113_saju_reading_ten_ju_entitlement.sql');
    await apply('20261112152603_saju_purchase_account_guard.sql');
    const legacy = await member(), legacyId = randomUUID();
    await login(legacy);
    await db.query('select public.saju_reading_buy_v1($1,$2,$3,false)', [legacyId,chart,legacy]);
    await db.exec('reset role');
    await apply('20261112153930_saju_category_purchases_v2.sql');
    await apply('20261112171205_saju_all_purchases_v3.sql');
    const oldSingleUser = await member(), oldSingleId = randomUUID();
    await login(oldSingleUser);
    await db.query('select public.saju_reading_buy_v2($1,$2,$3,0,$4,false)', [oldSingleId,chart,'lifelong',oldSingleUser]);
    const oldAllUser = await member(), oldAllId = randomUUID();
    await login(oldAllUser);
    await db.query('select public.saju_reading_buy_all_v3($1,$2,2026,$3,false)', [oldAllId,chart,oldAllUser]);
    await db.exec('reset role');
    const migrationName = fs.readdirSync(dir).find(name => name.endsWith('_saju_twenty_four_hour_access_v4.sql'));
    assert.ok(migrationName);
    await apply(migrationName);

    await t.test('new RPCs are guarded, old public routes stop, old internal grants are revoked', async () => {
      const oldPrivileged = (await db.query(`select p.oid::regprocedure::text as name
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='ojjuda_saju_internal' and p.proname in ('buy_v1','buy_v2','buy_all_v3','status_v1','status_v2')
          and has_function_privilege('authenticated',p.oid,'EXECUTE')`)).rows;
      assert.deepEqual(oldPrivileged, []);
      const fns = (await db.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as member
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where (n.nspname='ojjuda_saju_internal' and p.proname in ('access_receipt_v4','receipt_all_v4','status_v4','buy_v4','buy_all_v4'))
          or (n.nspname='public' and p.proname in ('saju_reading_status_v4','saju_reading_buy_v4','saju_reading_buy_all_v4'))`)).rows;
      assert.equal(fns.length, 8);
      for (const fn of fns) {
        assert.equal(fn.anon, false, fn.proname);
        assert.ok(fn.proconfig.includes('search_path=""'));
        const helper = ['access_receipt_v4','receipt_all_v4'].includes(fn.proname);
        assert.equal(fn.member, !helper, fn.proname);
        assert.equal(fn.prosecdef, fn.nspname === 'ojjuda_saju_internal' && !helper, fn.proname);
      }
      const tables = (await db.query(`select c.relname,c.relrowsecurity,
        has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as member_access
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='ojjuda_saju_internal' and c.relkind='r'`)).rows;
      assert.ok(tables.every(row => row.relrowsecurity && !row.member_access));
      await login(oldAllUser);
      for (const name of ['saju_reading_status_v1','saju_reading_status_v2','saju_reading_status_v3']) {
        assert.equal((await db.query(`select public.${name}($1) as value`, [chart])).rows[0].value.reason, 'update_required');
      }
      assert.equal((await db.query('select public.saju_reading_buy_v2($1,$2,$3,0,$4,false) as value', [randomUUID(),chart,'lifelong',oldAllUser])).rows[0].value.reason, 'update_required');
      assert.equal((await db.query('select public.saju_reading_buy_all_v3($1,$2,2026,$3,false) as value', [randomUUID(),chart,oldAllUser])).rows[0].value.reason, 'update_required');
      await assert.rejects(() => db.query('select ojjuda_saju_internal.buy_v2($1,$2,$3,0,$4,false)', [randomUUID(),chart,'lifelong',oldAllUser]), /permission denied/);
      assert.equal((await state(oldAllUser)).spent, 30);
    });

    await t.test('reopening before 24 hours is free and never extends the original payment', async () => {
      const user = await member(30), id = randomUUID();
      await login(user);
      const paid = await one('lifelong', {id});
      assertSingle(paid, 10);
      for (const receipt of [await one('lifelong', {id}), await one('lifelong', {expectedCharge:0}), await one('lifelong', {verify:true})]) {
        assertSingle(receipt, 0);
        assert.equal(receipt.request_id, id);
        assert.equal(receipt.paid_at, paid.paid_at);
        assert.equal(receipt.expires_at, paid.expires_at);
      }
      const value = await status();
      assert.equal(value.access_version, 4);
      assert.equal(value.access_hours, 24);
      assert.equal(value.entitlements[0].expires_at, paid.expires_at);
      assert.equal(value.bundle_entitlement, null);
      assert.deepEqual(value.prices, {lifelong:10,annual:10,monthly:10,all:30});
      assert.deepEqual(await state(user), {coins:20,parts:1,orders:0,requests:1,spent:10});
    });

    await t.test('24-hour boundary expires access; stale free quotes and old UUIDs cannot charge', async () => {
      const user = await member(50), id = randomUUID();
      await login(user);
      await one('lifelong', {id});
      await age(user, 'lifelong', 23.99);
      assert.equal((await status()).entitlements.length, 1);
      assertSingle(await one('lifelong', {expectedCharge:0}), 0);
      await age(user, 'lifelong', 24);
      assert.deepEqual((await status()).entitlements, []);
      const stale = await one('lifelong', {expectedCharge:0});
      assert.equal(stale.reason, 'price_changed');
      assert.equal(stale.required, 10);
      assert.equal((await one('lifelong', {id})).reason, 'access_expired');
      assert.equal((await one('lifelong', {verify:true})).reason, 'not_found');
      assert.deepEqual(await state(user), {coins:40,parts:1,orders:0,requests:1,spent:10});
      const historical = (await db.query('select * from ojjuda_note_internal.spend_requests where request_id=$1', [id])).rows[0];
      await login(user);
      const nextId = randomUUID(), renewed = await one('lifelong', {id:nextId});
      assertSingle(renewed, 10);
      assert.equal(renewed.request_id, nextId);
      assert.equal((await one('lifelong', {id})).reason, 'access_expired');
      assertSingle(await one('lifelong', {id:nextId}), 0);
      assert.deepEqual(await state(user), {coins:30,parts:1,orders:0,requests:2,spent:20});
      assert.deepEqual((await db.query('select * from ojjuda_note_internal.spend_requests where request_id=$1', [id])).rows[0], historical);
    });

    await t.test('a full renewal costs only expired parts and preserves every active deadline', async () => {
      const user = await member(100), id = randomUUID();
      await login(user);
      const initial = await all({id});
      assertAll(initial, 30);
      assertAll(await all({id}), 0);
      await age(user, 'lifelong', 24);
      const quote = await status();
      assert.deepEqual(quote.entitlements.map(item => item.topic), ['annual','monthly']);
      assert.equal((await all({expectedCharge:0})).reason, 'price_changed');
      assert.equal((await all({id, expectedCharge:10})).reason, 'access_expired');
      assert.equal((await all({expectedCharge:10, verify:true})).required, 10);
      const renewed = await all({expectedCharge:10});
      assertAll(renewed, 10);
      assert.notEqual(renewed.items[0].request_id, initial.items[0].request_id);
      for (const topic of ['annual','monthly']) {
        const old = initial.items.find(item => item.topic === topic), next = renewed.items.find(item => item.topic === topic);
        assert.equal(next.request_id, old.request_id);
        assert.equal(next.paid_at, old.paid_at);
        assert.equal(next.expires_at, old.expires_at);
        assert.equal(next.charged, 0);
      }
      assert.equal((await all({id})).reason, 'access_expired');
      assert.deepEqual(await state(user), {coins:60,parts:3,orders:1,requests:6,spent:40});
      for (const topic of ['lifelong','annual','monthly']) await age(user, topic, 25);
      assertAll(await all(), 30);
      assert.deepEqual(await state(user), {coins:30,parts:3,orders:1,requests:10,spent:70});
    });

    await t.test('an individual renewal replaces old bundle references without charging active parts', async () => {
      const user = await member(60), id = randomUUID();
      await login(user);
      await all({id});
      await age(user, 'annual', 24);
      const annual = await one('annual');
      assertSingle(annual, 10);
      const before = await state(user);
      await login(user);
      assert.equal((await all({id, expectedCharge:0})).reason, 'access_expired');
      const verified = await all({expectedCharge:0,verify:true});
      assert.equal(verified.reason, 'not_found');
      assert.equal(verified.required, 0);
      assert.deepEqual(await state(user), before);
      await login(user);
      const reopened = await all({expectedCharge:0});
      assertAll(reopened, 0);
      assert.equal(reopened.items.find(item => item.topic === 'annual').request_id, annual.request_id);
      assert.deepEqual(await state(user), {...before,requests:before.requests+1});
    });

    await t.test('v1, v2 and v3 historical purchases receive deadlines based on their original payment', async () => {
      await login(legacy);
      const oldLegacy = await all({id:legacyId, expectedCharge:0});
      assertAll(oldLegacy, 0);
      assert.equal(oldLegacy.legacy_bundle, true);
      assert.equal((await status()).bundle_entitlement.expires_at, oldLegacy.expires_at);
      await db.exec('reset role');
      await db.query("update ojjuda_saju_internal.entitlements set purchased_at=clock_timestamp()-interval '24 hours' where user_id=$1", [legacy]);
      await login(legacy);
      assert.equal((await status()).bundle_entitlement, null);
      assert.equal((await all({id:legacyId,expectedCharge:0})).reason, 'access_expired');
      assertAll(await all(), 30);
      assert.deepEqual(await state(legacy), {coins:60,parts:3,orders:1,requests:5,spent:40});
      await login(oldSingleUser);
      assertSingle(await one('lifelong', {id:oldSingleId,expectedCharge:0}), 0);
      await age(oldSingleUser,'lifelong');
      assert.equal((await one('lifelong', {id:oldSingleId})).reason, 'access_expired');
      assertSingle(await one(), 10);
      await login(oldAllUser);
      assertAll(await all({id:oldAllId,expectedCharge:0}), 0);
      for (const topic of ['lifelong','annual','monthly']) await age(oldAllUser,topic);
      assert.equal((await all({id:oldAllId})).reason, 'access_expired');
      assertAll(await all(), 30);
    });

    await t.test('insufficient funds, verification, scope, account and price guards have no side effects', async () => {
      const user = await member(29), other = await member();
      await login(user);
      for (const expectedCharge of [0,10,20]) {
        const result = await all({expectedCharge});
        assert.equal(result.reason, 'price_changed');
        assert.equal(result.required, 30);
      }
      assert.equal((await all()).reason, 'coins');
      assert.equal((await all({verify:true})).reason, 'not_found');
      assert.equal((await one('lifelong',{owner:other})).reason, 'account_changed');
      for (const bad of [null,-1,1,20,30]) assert.equal((await one('lifelong',{expectedCharge:bad})).reason,'invalid');
      for (const bad of [null,-1,1,40]) assert.equal((await all({expectedCharge:bad})).reason,'invalid');
      assert.deepEqual(await state(user), {coins:29,parts:0,orders:0,requests:0,spent:0});
      await login(user);
      const paid = await one('annual');
      assert.equal((await one('monthly',{id:paid.request_id})).reason, 'request_conflict');
      assert.equal((await one('annual',{id:paid.request_id,year:2027})).reason, 'request_conflict');
      assert.equal((await one('annual',{id:paid.request_id,chartKey:otherChart})).reason, 'request_conflict');
      assert.equal((await all({id:paid.request_id})).reason, 'request_conflict');
      await login(other);
      assert.equal((await one('annual',{id:paid.request_id})).reason, 'request_conflict');
      assert.deepEqual(await state(other), {coins:100,parts:0,orders:0,requests:0,spent:0});
      const guest = await member(100,true), noWallet = await member(0,false,false);
      await login(guest);
      assert.equal((await all()).reason,'member_required');
      assert.equal((await status()).reason,'member_required');
      await login(noWallet);
      assert.equal((await one()).reason,'wallet_unavailable');
      await login(null);
      await assert.rejects(() => all(), /permission denied/);
      await login(null,'authenticated');
      await assert.rejects(() => one(), /not_signed_in/);
      await db.exec('reset role');
      await db.query("update public.user_private set banned_until=now()+interval '1 day' where user_id=$1", [user]);
      await login(user);
      assert.equal((await one('annual',{id:paid.request_id,expectedCharge:0})).reason,'banned');
      assert.equal((await status()).reason,'banned');
    });

    await t.test('late write failures roll back renewal debits, pointers and all ledger inserts', async () => {
      const user = await member(100), failKey = key('fail');
      await login(user);
      await all({chartKey:failKey});
      for (const topic of ['lifelong','annual','monthly']) await age(user,topic,25,failKey);
      const before = await state(user);
      const pointers = (await db.query('select topic,request_id,purchased_at from ojjuda_saju_internal.topic_entitlements where user_id=$1 order by topic',[user])).rows;
      await db.exec(`create function public.saju_expiry_fail() returns trigger language plpgsql as $$begin
        if new.chart_key='${failKey}' and new.topic='monthly' then raise exception 'expiry_test_failure'; end if; return new;
        end$$; create trigger saju_expiry_fail before insert or update on ojjuda_saju_internal.topic_entitlements
        for each row execute function public.saju_expiry_fail();`);
      await login(user);
      await assert.rejects(() => all({chartKey:failKey}), /expiry_test_failure/);
      assert.deepEqual(await state(user), before);
      assert.deepEqual((await db.query('select topic,request_id,purchased_at from ojjuda_saju_internal.topic_entitlements where user_id=$1 order by topic',[user])).rows, pointers);
      await db.exec('drop trigger saju_expiry_fail on ojjuda_saju_internal.topic_entitlements');
    });

    await t.test('an invalid backing ledger fails closed instead of turning corruption into a new purchase', async () => {
      const user = await member(60);
      await login(user);
      const receipt = await all();
      await db.exec('reset role');
      await db.query("update ojjuda_note_internal.spend_requests set kind='synthetic_invalid' where request_id=$1", [receipt.items[1].request_id]);
      await login(user);
      assert.equal((await status()).reason,'receipt_unavailable');
      assert.equal((await one('annual')).reason,'receipt_unavailable');
      assert.equal((await all()).reason,'receipt_unavailable');
      assert.deepEqual(await state(user), {coins:30,parts:3,orders:1,requests:4,spent:30});
    });
  } finally {
    await db.close();
  }
});
