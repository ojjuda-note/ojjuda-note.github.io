const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

// Real migrations against synthetic accounts in in-memory Postgres only.
// There is no live Supabase connection or real-member balance in this test.
test('full saju purchases preserve atomic payment and individual access', async t => {
  const db = new PGlite();
  const migrationDir = path.join(__dirname, '../supabase/migrations');
  const readMigration = name => fs.readFileSync(path.join(migrationDir, name), 'utf8');
  const finalMigration = fs.readdirSync(migrationDir).find(name => name.endsWith('_saju_all_purchases_v3.sql'));
  const bundleSql = fs.readFileSync(process.env.SAJU_BUNDLE_SQL || path.join(migrationDir, finalMigration || 'missing_saju_all_purchases_v3.sql'), 'utf8');
  const chart = label => createHash('sha256').update('synthetic:' + label).digest('hex');
  const chartA = chart('a'), chartB = chart('b');
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
  const all = async (id = randomUUID(), key = chartA, year = 2026, verify = false, expected = currentUser) =>
    (await db.query('select public.saju_reading_buy_all_v3($1::uuid,$2::text,$3::integer,$4::uuid,$5::boolean) as value', [id,key,year,expected,verify])).rows[0].value;
  const one = async (topic, year = topic === 'lifelong' ? 0 : 2026, id = randomUUID(), key = chartA) =>
    (await db.query('select public.saju_reading_buy_v2($1::uuid,$2::text,$3::text,$4::integer,$5::uuid,false) as value', [id,key,topic,year,currentUser])).rows[0].value;
  const status = async (key = chartA) => (await db.query('select public.saju_reading_status_v3($1) as value', [key])).rows[0].value;
  const state = async id => {
    await db.exec('reset role');
    return (await db.query(`select
      (select coins from public.user_private where user_id=$1) as coins,
      (select count(*)::integer from ojjuda_saju_internal.topic_entitlements where user_id=$1) as parts,
      (select count(*)::integer from ojjuda_saju_internal.all_orders where user_id=$1) as orders,
      (select count(*)::integer from ojjuda_note_internal.spend_requests where user_id=$1) as requests,
      (select coalesce(sum(coins),0)::integer from ojjuda_note_internal.spend_requests where user_id=$1) as ledger_spend`, [id])).rows[0];
  };
  const assertReceipt = (receipt, year, charged, coins, legacy = false) => {
    assert.equal(receipt.ok, true);
    assert.equal(receipt.entitled, true);
    assert.equal(receipt.topic, 'all');
    assert.equal(receipt.year, year);
    assert.equal(receipt.price, 30);
    assert.equal(receipt.charged, charged);
    assert.equal(receipt.coins, coins);
    assert.equal(receipt.entitlement_version, 3);
    assert.equal(receipt.legacy_bundle, legacy);
    assert.ok(Number.isFinite(Date.parse(receipt.paid_at)));
    assert.deepEqual(receipt.items.map(item => [item.topic,item.year]), [['lifelong',0],['annual',year],['monthly',year]]);
    assert.equal(receipt.items.reduce((total,item) => total + item.charged,0), charged);
    for (const item of receipt.items) {
      assert.equal(item.ok, true);
      assert.equal(item.entitled, true);
      assert.equal(item.price, 10);
      assert.equal(item.coins, coins);
      assert.equal(item.chart_key, receipt.chart_key);
      assert.equal(item.entitlement_version, 2);
      assert.equal(item.legacy_bundle, legacy);
      assert.ok([0,10].includes(item.charged));
      assert.ok(Number.isFinite(Date.parse(item.paid_at)));
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
      grant select,insert on public.user_private to authenticated;
      create function public.is_banned(u uuid) returns boolean language sql stable security definer set search_path='' as
        $$select exists(select 1 from public.user_private where user_id=u and banned_until>now())$$;
      create table ojjuda_note_internal.spend_requests(
        request_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
        kind text not null check(char_length(kind) between 1 and 60),target_id uuid,
        coins integer not null check(coins>=0),result jsonb not null default '{}',created_at timestamptz not null default now()
      );
      grant usage on schema public,auth to anon,authenticated;
    `);
    await db.exec(readMigration('20261112113703_tarot_reading_ten_ju.sql'));
    await db.exec(readMigration('20261112143703_tarot_daily_topics.sql'));
    await db.exec(readMigration('20261112152113_saju_reading_ten_ju_entitlement.sql'));
    await db.exec(readMigration('20261112152603_saju_purchase_account_guard.sql'));
    const legacy = await member(10), legacyRequest = randomUUID();
    await login(legacy);
    assert.equal((await db.query('select public.saju_reading_buy_v1($1,$2,$3,false) as value', [legacyRequest,chartA,legacy])).rows[0].value.charged, 10);
    await db.exec('reset role');
    await db.exec(readMigration('20261112153930_saju_category_purchases_v2.sql'));
    await db.exec(bundleSql);

    await t.test('private order table and formatter are inaccessible, with only authenticated RPC grants', async () => {
      const permissions = (await db.query(`select
        (select relrowsecurity from pg_class where oid='ojjuda_saju_internal.all_orders'::regclass) as rls,
        has_table_privilege('authenticated','ojjuda_saju_internal.all_orders','SELECT') as direct_select,
        has_table_privilege('authenticated','ojjuda_saju_internal.all_orders','INSERT') as direct_insert,
        has_table_privilege('authenticated','ojjuda_saju_internal.all_orders','UPDATE') as direct_update,
        has_table_privilege('authenticated','ojjuda_saju_internal.all_orders','DELETE') as direct_delete,
        has_function_privilege('authenticated','ojjuda_saju_internal.receipt_all_v3(uuid,text,integer,integer,boolean,boolean,integer,uuid[])','EXECUTE') as formatter,
        has_function_privilege('anon','public.saju_reading_buy_all_v3(uuid,text,integer,uuid,boolean)','EXECUTE') as anon_buy,
        has_function_privilege('anon','public.saju_reading_status_v3(text)','EXECUTE') as anon_status,
        has_function_privilege('authenticated','public.saju_reading_buy_all_v3(uuid,text,integer,uuid,boolean)','EXECUTE') as member_buy,
        has_function_privilege('authenticated','public.saju_reading_status_v3(text)','EXECUTE') as member_status`)).rows[0];
      assert.deepEqual(permissions, {rls:true,direct_select:false,direct_insert:false,direct_update:false,direct_delete:false,formatter:false,anon_buy:false,anon_status:false,member_buy:true,member_status:true});
      const functions = (await db.query("select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('receipt_all_v3','buy_all_v3','saju_reading_buy_all_v3','saju_reading_status_v3')")).rows;
      assert.equal(functions.length, 4);
      for (const fn of functions) {
        assert.ok(fn.proconfig.includes('search_path=""'), fn.proname);
        assert.equal(fn.prosecdef, fn.proname === 'buy_all_v3', fn.proname);
      }
    });

    await t.test('30-ju purchase grants all three parts and records exactly 30 ju spent', async () => {
      const user = await member(30), request = randomUUID();
      await login(user);
      assert.deepEqual((await status()).prices, {all:30,lifelong:10,annual:10,monthly:10});
      assert.equal((await status()).entitlement_version, 3);
      const receipt = await all(request);
      assertReceipt(receipt,2026,30,0);
      assert.equal(receipt.request_id, request);
      assert.equal(receipt.replayed, false);
      assert.equal(new Set(receipt.items.map(item => item.request_id)).size, 3);
      for (const item of receipt.items) assert.notEqual(item.request_id, request);
      assert.equal((await status()).entitlements.length, 3);
      for (const topic of ['lifelong','annual','monthly']) {
        const part = await one(topic);
        assert.equal(part.charged, 0);
        assert.equal(part.coins, 0);
      }
      assert.deepEqual(await state(user), {coins:0,parts:3,orders:1,requests:4,ledger_spend:30});
      const master = (await db.query('select kind,coins,result from ojjuda_note_internal.spend_requests where request_id=$1',[request])).rows[0];
      assert.equal(master.kind,'saju_reading_all_v3');
      assert.equal(master.coins,0);
      assert.equal(master.result.charged,30);
      assert.equal(master.result.item_requests.length,3);
    });

    await t.test('29 ju cannot partly buy a new 30-ju order, and the same request can retry after funding', async () => {
      const user = await member(29), request = randomUUID();
      await login(user);
      assert.deepEqual(await all(request), {ok:false,reason:'coins',coins:29,price:30,required:30});
      assert.deepEqual(await state(user), {coins:29,parts:0,orders:0,requests:0,ledger_spend:0});
      await db.query('update public.user_private set coins=30 where user_id=$1',[user]);
      await login(user);
      assertReceipt(await all(request),2026,30,0);
    });

    await t.test('one or two previously purchased parts reduce the full price to 20 or 10 ju', async () => {
      for (const prior of [['lifelong'],['lifelong','annual']]) {
        const user = await member(30);
        await login(user);
        const saved = [];
        for (const topic of prior) saved.push(await one(topic));
        const receipt = await all();
        assertReceipt(receipt,2026,30-prior.length*10,0);
        for (const part of saved) assert.equal(receipt.items.find(item => item.topic===part.topic).request_id, part.request_id);
        assert.deepEqual(await state(user), {coins:0,parts:3,orders:1,requests:4,ledger_spend:30});
      }
      const user = await member(19);
      await login(user);
      assert.equal((await one('lifelong')).coins,9);
      assert.deepEqual(await all(), {ok:false,reason:'coins',coins:9,price:30,required:20});
      assert.deepEqual(await state(user), {coins:9,parts:1,orders:0,requests:1,ledger_spend:10});
    });

    await t.test('verify-only never writes an audit, including when all three parts are already owned', async () => {
      const user = await member(30), request = randomUUID();
      await login(user);
      assert.deepEqual(await all(request,chartA,2026,true), {ok:false,reason:'not_found',coins:30,price:30,required:30});
      assert.deepEqual(await state(user), {coins:30,parts:0,orders:0,requests:0,ledger_spend:0});
      await login(user);
      for (const topic of ['lifelong','annual','monthly']) await one(topic);
      assert.deepEqual(await all(request,chartA,2026,true), {ok:false,reason:'not_found',coins:0,price:30,required:0});
      assert.deepEqual(await state(user), {coins:0,parts:3,orders:0,requests:3,ledger_spend:30});
      await login(user);
      const receipt = await all(request);
      assertReceipt(receipt,2026,0,0);
      assert.equal(receipt.replayed,true);
      assert.deepEqual(await state(user), {coins:0,parts:3,orders:1,requests:4,ledger_spend:30});
    });

    await t.test('same order retries and new-request reopens keep the receipt and never charge again', async () => {
      const user = await member(60), request = randomUUID();
      await login(user);
      const paid = await all(request);
      for (const verify of [true,false,true]) {
        const receipt = await all(request,chartA,2026,verify);
        assertReceipt(receipt,2026,0,30);
        assert.equal(receipt.request_id,request);
        assert.equal(receipt.entitlement_replayed,false);
        assert.equal(receipt.paid_at,paid.paid_at);
      }
      // PGlite queues a single connection: this tests replay bursts, not a
      // multi-connection load test. SQL locks and unique keys serialize writes.
      const reopens = await Promise.all(Array.from({length:6}, () => all()));
      for (const receipt of reopens) {
        assertReceipt(receipt,2026,0,30);
        assert.equal(receipt.request_id,request);
        assert.equal(receipt.entitlement_replayed,true);
      }
      assert.deepEqual(await state(user), {coins:30,parts:3,orders:1,requests:4,ledger_spend:30});
    });

    await t.test('another selected year buys only the annual and monthly parts, while a different chart is separate', async () => {
      const user = await member(100);
      await login(user);
      const first = await all();
      const next = await all(randomUUID(),chartA,2027);
      assertReceipt(next,2027,20,50);
      assert.equal(next.items[0].request_id,first.items[0].request_id);
      assertReceipt(await all(randomUUID(),chartB,2027),2027,30,20);
      assert.deepEqual(await state(user), {coins:20,parts:8,orders:3,requests:11,ledger_spend:80});
    });

    await t.test('global request IDs cannot cross member, chart, year, individual or tarot purchases', async () => {
      const user = await member(), other = await member(), request = randomUUID();
      await login(user);
      await all(request);
      assert.equal((await all(request,chartB)).reason,'request_conflict');
      assert.equal((await all(request,chartA,2027)).reason,'request_conflict');
      assert.equal((await one('lifelong',0,request)).reason,'request_conflict');
      assert.equal((await db.query('select public.tarot_reading_buy_v1($1,$2,false) as value',[request,'love'])).rows[0].value.reason,'request_conflict');
      const individualRequest = randomUUID();
      await one('annual',2027,individualRequest);
      assert.equal((await all(individualRequest,chartA,2027)).reason,'request_conflict');
      const tarotRequest = randomUUID();
      await db.query('select public.tarot_reading_buy_v1($1,$2,false) as value',[tarotRequest,'love']);
      assert.equal((await all(tarotRequest)).reason,'request_conflict');
      await login(other);
      assert.equal((await all(request)).reason,'request_conflict');
      assert.deepEqual(await state(other), {coins:100,parts:0,orders:0,requests:0,ledger_spend:0});
    });

    await t.test('member, expected account, ban, missing wallet and input guards precede any write', async () => {
      await login(null);
      await assert.rejects(() => all(),/permission denied/);
      await assert.rejects(() => status(),/permission denied/);
      await login(null,'authenticated');
      await assert.rejects(() => all(),/not_signed_in/);
      const user = await member(), other = await member(), guest = await member(100,true), noWallet = await member(0,false,false);
      await login(user);
      assert.equal((await all(randomUUID(),chartA,2026,false,other)).reason,'account_changed');
      assert.equal((await all(randomUUID(),chartA,2026,false,null)).reason,'account_changed');
      for (const badKey of [null,'','x'.repeat(64),'a'.repeat(63),'1990-01-01']) assert.equal((await all(randomUUID(),badKey)).reason,'invalid');
      for (const badYear of [null,0,1899,2051]) assert.equal((await all(randomUUID(),chartA,badYear)).reason,'invalid');
      assert.equal((await all(null)).reason,'invalid');
      assert.equal((await all(randomUUID(),chartA,2026,null)).reason,'invalid');
      assert.deepEqual(await state(user), {coins:100,parts:0,orders:0,requests:0,ledger_spend:0});
      await db.query("update public.user_private set banned_until=now()+interval '1 day' where user_id=$1",[user]);
      await login(user);
      assert.equal((await all()).reason,'banned');
      assert.equal((await status()).reason,'banned');
      await login(guest);
      assert.equal((await all()).reason,'member_required');
      assert.equal((await status()).reason,'member_required');
      await login(noWallet);
      assert.equal((await all()).reason,'wallet_unavailable');
      assert.equal((await status()).reason,'wallet_unavailable');
    });

    await t.test('old v1 bundle owners retain free whole access across years without new audits', async () => {
      await login(legacy);
      for (const year of [2026,2027]) {
        assertReceipt(await all(randomUUID(),chartA,year,true),year,0,0,true);
        const receipt = await all(legacyRequest,chartA,year,false);
        assertReceipt(receipt,year,0,0,true);
        assert.equal(receipt.request_id,legacyRequest);
        assert.ok(receipt.items.every(item => item.request_id===legacyRequest));
      }
      assert.deepEqual(await state(legacy), {coins:0,parts:0,orders:0,requests:1,ledger_spend:10});
    });

    await t.test('failure in a later part or final order rolls back the wallet and every prior insert', async () => {
      const lateKey = chart('fail-later-part'), orderKey = chart('fail-final-order');
      await db.exec('reset role');
      await db.exec(`create function public.saju_bundle_test_fail_part() returns trigger language plpgsql as $$begin
        if new.chart_key='${lateKey}' and new.topic='monthly' then raise exception 'test_later_part_failure'; end if; return new;
        end$$; create trigger saju_bundle_test_fail_part before insert on ojjuda_saju_internal.topic_entitlements for each row execute function public.saju_bundle_test_fail_part();
        create function public.saju_bundle_test_fail_order() returns trigger language plpgsql as $$begin
        if new.chart_key='${orderKey}' then raise exception 'test_final_order_failure'; end if; return new;
        end$$; create trigger saju_bundle_test_fail_order before insert on ojjuda_saju_internal.all_orders for each row execute function public.saju_bundle_test_fail_order();`);
      const user = await member(30);
      for (const [key,error] of [[lateKey,/test_later_part_failure/],[orderKey,/test_final_order_failure/]]) {
        await login(user);
        await assert.rejects(() => all(randomUUID(),key),error);
        assert.deepEqual(await state(user), {coins:30,parts:0,orders:0,requests:0,ledger_spend:0});
      }
    });

    await t.test('aggregate receipts fail closed if a part or master scope is corrupted', async () => {
      const user = await member(60), request = randomUUID();
      await login(user);
      const paid = await all(request), child = paid.items[1];
      await db.exec('reset role');
      await db.query("update ojjuda_note_internal.spend_requests set result=jsonb_set(result,'{year}','2027') where request_id=$1",[child.request_id]);
      await login(user);
      assert.equal((await all(request)).reason,'receipt_unavailable');
      assert.equal((await all(randomUUID(),chartA,2026,true)).reason,'receipt_unavailable');
      await db.exec('reset role');
      await db.query("update ojjuda_note_internal.spend_requests set result=jsonb_set(result,'{year}','2026') where request_id=$1",[child.request_id]);
      await db.query("update ojjuda_saju_internal.all_orders set item_requests=jsonb_set(item_requests,'{1,year}','2027') where request_id=$1",[request]);
      await login(user);
      assert.equal((await all(request)).reason,'receipt_unavailable');
      assert.deepEqual(await state(user), {coins:30,parts:3,orders:1,requests:4,ledger_spend:30});
    });

    await t.test('account deletion cascades the aggregate and its parts; stale tokens cannot recreate them', async () => {
      const user = await member(30);
      await login(user);
      await all();
      await db.exec('reset role');
      await db.query('delete from auth.users where id=$1',[user]);
      assert.deepEqual(await state(user), {coins:null,parts:0,orders:0,requests:0,ledger_spend:0});
      await login(user);
      assert.equal((await all()).reason,'member_required');
      assert.equal((await status()).reason,'member_required');
    });
  } finally {
    await db.close();
  }
});
