const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

// In-memory Postgres only: this test never contacts a live Supabase project.
(async () => {
  const db = new PGlite();
  const member = randomUUID(), poor = randomUUID(), guest = randomUUID();
  const zero = randomUUID(), missingWallet = randomUUID(), deleted = randomUUID();
  const fingerprint = value => createHash('sha256').update(value).digest('hex');
  const chartA = fingerprint('synthetic-chart-a'), chartB = fingerprint('synthetic-chart-b');
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261112152113_saju_reading_ten_ju_entitlement.sql'), 'utf8');
  const accountGuard = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261112152603_saju_purchase_account_guard.sql'), 'utf8');
  const categoryMigration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261112153930_saju_category_purchases_v2.sql'), 'utf8');
  const tarotFirst = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261112113703_tarot_reading_ten_ju.sql'), 'utf8');
  const tarotDaily = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261112143703_tarot_daily_topics.sql'), 'utf8');
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema ojjuda_note_internal;
      create table auth.users(id uuid primary key,is_anonymous boolean);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.user_private(
        user_id uuid primary key references auth.users(id) on delete cascade,
        coins integer not null,banned_until timestamptz
      );
      alter table public.user_private enable row level security;
      create policy wallet_read on public.user_private for select to authenticated using(user_id=auth.uid());
      grant select,insert on public.user_private to authenticated;
      create function public.is_banned(u uuid) returns boolean language plpgsql stable security definer set search_path='' as $$begin
        if not(coalesce(auth.uid()=u,false) or coalesce(nullif(current_setting('role',true),'none'),session_user) in('service_role','postgres','supabase_admin')) then
          raise exception 'helper_scope_denied' using errcode='42501';
        end if;
        return exists(select 1 from public.user_private where user_id=u and banned_until>now());
      end$$;
      create table ojjuda_note_internal.spend_requests(
        request_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
        kind text not null check(char_length(kind) between 1 and 60),target_id uuid,
        coins integer not null check(coins>=0),result jsonb not null default '{}',created_at timestamptz not null default now()
      );
      create table ojjuda_note_internal.photo_entitlements(request_id uuid primary key);
      create function ojjuda_note_internal.capture_paid_card_photo_entitlement() returns trigger language plpgsql as $$begin
        if new.kind='card_photo' then insert into ojjuda_note_internal.photo_entitlements values(new.request_id); end if;
        return new;
      end$$;
      create trigger spend_requests_card_photo_entitlement after insert on ojjuda_note_internal.spend_requests
        for each row execute function ojjuda_note_internal.capture_paid_card_photo_entitlement();
      grant usage on schema public,auth to anon,authenticated;
    `);
    for (const [id, coins, anonymous] of [[member,100,false],[poor,9,false],[guest,30,true],[zero,10,false],[deleted,30,false]]) {
      await db.query('insert into auth.users values($1,$2)', [id,anonymous]);
      await db.query('insert into public.user_private(user_id,coins) values($1,$2)', [id,coins]);
    }
    await db.query('insert into auth.users values($1,false)', [missingWallet]);
    // Real existing migrations retain the current tarot guard and RPCs.
    await db.exec(tarotFirst);
    await db.exec(tarotDaily);
    await db.exec(migration);
    await db.exec(accountGuard);

    let currentUser = null;
    const login = async (id, role = id ? 'authenticated' : 'anon') => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
      await db.exec('set role ' + role);
      currentUser = id;
    };
    const buy = async (id, key = chartA, verify = false, expectedUser = currentUser) => (await db.query('select public.saju_reading_buy_v1($1::uuid,$2::text,$3::uuid,$4::boolean) as value', [id,key,expectedUser,verify])).rows[0].value;
    const status = async (key = null) => (await db.query('select public.saju_reading_status_v1($1) as value', [key])).rows[0].value;
    const balance = async id => {
      await db.exec('reset role');
      return (await db.query('select coins from public.user_private where user_id=$1', [id])).rows[0]?.coins;
    };
    const counts = async id => {
      await db.exec('reset role');
      return (await db.query(`select
        (select count(*)::int from ojjuda_saju_internal.entitlements where user_id=$1) as entitlements,
        (select count(*)::int from ojjuda_note_internal.spend_requests where user_id=$1 and kind='saju_reading_v1') as receipts`, [id])).rows[0];
    };

    const security = (await db.query(`select
      (select relrowsecurity from pg_class where oid='ojjuda_saju_internal.entitlements'::regclass) as rls,
      has_table_privilege('authenticated','ojjuda_saju_internal.entitlements','SELECT') as direct_read,
      has_table_privilege('authenticated','ojjuda_saju_internal.entitlements','INSERT') as direct_insert,
      has_table_privilege('authenticated','ojjuda_saju_internal.entitlements','UPDATE') as direct_update,
      has_schema_privilege('authenticated','ojjuda_saju_internal','CREATE') as schema_create,
      has_function_privilege('authenticated','ojjuda_saju_internal.receipt_v1(uuid,text,integer,boolean,boolean,integer)','EXECUTE') as formatter,
      has_function_privilege('anon','public.saju_reading_buy_v1(uuid,text,uuid,boolean)','EXECUTE') as anon_buy,
      has_function_privilege('anon','public.saju_reading_status_v1(text)','EXECUTE') as anon_status,
      has_function_privilege('anon','ojjuda_saju_internal.buy_v1(uuid,text,uuid,boolean)','EXECUTE') as anon_internal,
      has_function_privilege('authenticated','public.saju_reading_buy_v1(uuid,text,uuid,boolean)','EXECUTE') as auth_buy,
      has_function_privilege('authenticated','public.saju_reading_buy_v1(uuid,text,boolean)','EXECUTE') as legacy_public,
      has_function_privilege('authenticated','ojjuda_saju_internal.buy_v1(uuid,text,boolean)','EXECUTE') as legacy_internal,
      has_function_privilege('anon','public.saju_reading_buy_v1(uuid,text,boolean)','EXECUTE') as legacy_anon_public,
      has_function_privilege('anon','ojjuda_saju_internal.buy_v1(uuid,text,boolean)','EXECUTE') as legacy_anon_internal,
      has_function_privilege('authenticated','public.saju_reading_status_v1(text)','EXECUTE') as auth_status`)).rows[0];
    assert.deepEqual(security, {
      rls:true,direct_read:false,direct_insert:false,direct_update:false,schema_create:false,
      formatter:false,anon_buy:false,anon_status:false,anon_internal:false,auth_buy:true,auth_status:true,
      legacy_public:false,legacy_internal:false,legacy_anon_public:false,legacy_anon_internal:false,
    });
    const functions = (await db.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='ojjuda_saju_internal') or (n.nspname='public' and p.proname in ('saju_reading_buy_v1','saju_reading_status_v1'))`)).rows;
    assert.equal(functions.length, 7);
    for (const fn of functions) {
      assert.ok(fn.proconfig.includes('search_path=""'), fn.proname);
      assert.equal(fn.prosecdef, fn.nspname === 'ojjuda_saju_internal' && fn.proname !== 'receipt_v1', fn.proname);
    }
    const columns = (await db.query("select column_name from information_schema.columns where table_schema='ojjuda_saju_internal' and table_name='entitlements' order by ordinal_position")).rows.map(row => row.column_name);
    assert.deepEqual(columns, ['user_id','chart_key','request_id','price','purchased_at']);

    await login(null);
    await assert.rejects(() => buy(randomUUID()), /permission denied/);
    await assert.rejects(() => status(), /permission denied/);
    await login(null, 'authenticated');
    await assert.rejects(() => buy(randomUUID()), /not_signed_in/);
    await assert.rejects(() => status(), /not_signed_in/);
    await login(member);
    await assert.rejects(() => db.exec('select * from ojjuda_saju_internal.entitlements'), /permission denied/);
    await assert.rejects(() => db.exec('update public.user_private set coins=999'), /permission denied/);
    await assert.rejects(() => db.exec('select * from ojjuda_note_internal.spend_requests'), /permission denied/);
    await assert.rejects(() => db.query('select ojjuda_saju_internal.receipt_v1($1,$2,999,true,true,0)', [member,chartA]), /permission denied/);
    await assert.rejects(() => db.query('select public.saju_reading_buy_v1($1::uuid,$2::text,$3::boolean)', [randomUUID(),chartA,false]), /permission denied/);
    await assert.rejects(() => db.query('select ojjuda_saju_internal.buy_v1($1::uuid,$2::text,$3::boolean)', [randomUUID(),chartA,false]), /permission denied/);
    assert.deepEqual(await buy(randomUUID(),chartA,false,null), {ok:false,reason:'account_changed'});
    assert.deepEqual(await buy(randomUUID(),chartA,false,poor), {ok:false,reason:'account_changed'});
    assert.deepEqual((await db.query('select ojjuda_saju_internal.buy_v1($1::uuid,$2::text,$3::uuid,$4::boolean) as value', [randomUUID(),chartA,poor,false])).rows[0].value, {ok:false,reason:'account_changed'});
    assert.deepEqual(await counts(member), {entitlements:0,receipts:0});
    assert.equal(await balance(member), 100);
    await login(member);
    assert.deepEqual(await status(), { ok:true,entitled:false,chart_key:null,price:10,coins:100,product:'saju' });
    assert.equal((await db.query('select public.saju_reading_status_v1() as value')).rows[0].value.coins, 100);
    assert.equal((await status(chartA)).entitled, false);
    const checkedId = randomUUID();
    assert.equal((await buy(checkedId, chartA, true)).reason, 'not_found');
    assert.equal((await status()).coins, 100);
    for (const key of [null,'','a'.repeat(63),'a'.repeat(65),'g'.repeat(64),'1990-01-01']) {
      assert.equal((await buy(randomUUID(),key)).reason, 'invalid');
      if (key !== null) assert.equal((await status(key)).reason, 'invalid');
    }
    assert.equal((await buy(null)).reason, 'invalid');
    assert.equal((await buy(randomUUID(),chartA,null)).reason, 'invalid');

    const first = await buy(checkedId);
    assert.equal(first.ok, true);
    assert.equal(first.entitled, true);
    assert.equal(first.request_id, checkedId);
    assert.equal(first.price, 10);
    assert.equal(first.charged, 10);
    assert.equal(first.coins, 90);
    assert.equal(first.product, 'saju');
    assert.equal(first.title, '사주팔자 상세 풀이');
    assert.equal(first.replayed, false);
    assert.equal(first.entitlement_replayed, false);
    assert.ok(Number.isFinite(Date.parse(first.paid_at)));
    const defaultVerify = (await db.query('select public.saju_reading_buy_v1(p_request_id=>$1::uuid,p_chart_key=>$2::text,p_expected_user=>$3::uuid) as value', [randomUUID(),chartA,member])).rows[0].value;
    assert.equal(defaultVerify.request_id, checkedId, 'required owner argument unambiguously selects the guarded overload, with the default verify flag');
    assert.equal(defaultVerify.charged, 0);
    for (let retry=0; retry<6; retry++) {
      const value = await buy(checkedId, chartA, retry % 2 === 0);
      assert.equal(value.request_id, checkedId);
      assert.equal(value.coins, 90);
      assert.equal(value.charged, 0);
      assert.equal(value.replayed, true);
      assert.equal(value.entitlement_replayed, false);
      assert.equal(value.paid_at, first.paid_at);
    }
    // PGlite queues these calls on one connection. This verifies retry bursts,
    // not a multi-connection load test; SQL locks/unique constraints enforce concurrency.
    const reopens = await Promise.all(Array.from({length:8}, () => buy(randomUUID())));
    assert.ok(reopens.every(value => value.request_id===checkedId && value.coins===90 && value.charged===0 && value.entitlement_replayed));
    assert.equal((await buy(randomUUID(), chartA.toUpperCase())).request_id, checkedId);
    assert.equal((await status(chartA.toUpperCase())).request_id, checkedId);
    assert.equal((await buy(randomUUID(),chartA,true)).request_id, checkedId);
    assert.deepEqual(await counts(member), { entitlements:1,receipts:1 });
    await login(member);
    assert.equal((await buy(checkedId, chartB)).reason, 'request_conflict');
    assert.equal((await buy(randomUUID(), chartB)).coins, 80);
    assert.deepEqual(await counts(member), { entitlements:2,receipts:2 });

    await login(poor);
    assert.deepEqual(await buy(randomUUID(),chartB,false,member), {ok:false,reason:'account_changed'}, 'a new session token must not debit the other account for the original account\'s request');
    assert.equal((await status()).coins, 9);
    assert.equal((await buy(checkedId)).reason, 'request_conflict');
    assert.equal((await status(chartA)).entitled, false, 'another member cannot inherit an entitlement even with the same chart key');
    const poorId = randomUUID();
    const poorResult = await buy(poorId);
    assert.equal(poorResult.reason, 'coins');
    assert.equal(poorResult.coins, 9);
    assert.deepEqual(await counts(poor), { entitlements:0,receipts:0 });
    await db.query('update public.user_private set coins=10 where user_id=$1', [poor]);
    await login(poor);
    assert.equal((await buy(poorId)).coins, 0, 'the same request can retry after insufficient balance without a reserved charge');
    assert.equal((await status(chartA)).request_id, poorId);
    assert.equal((await status(chartA)).request_id===checkedId, false);

    await login(zero);
    const zeroPaid = await buy(randomUUID());
    assert.equal(zeroPaid.coins, 0);
    assert.equal((await buy(randomUUID())).request_id, zeroPaid.request_id, 'zero balance still allows the already purchased chart');
    assert.equal((await status(chartA)).entitled, true);
    assert.equal((await buy(randomUUID(),chartB)).reason, 'coins');

    await login(guest);
    assert.equal((await buy(randomUUID())).reason, 'member_required');
    assert.equal((await status()).reason, 'member_required');

    await login(missingWallet);
    assert.equal((await buy(randomUUID())).reason, 'wallet_unavailable');
    assert.equal((await status()).reason, 'wallet_unavailable');
    await db.exec('reset role');
    await db.query("update public.user_private set banned_until=now()+interval '1 day' where user_id=$1", [member]);
    await login(member);
    assert.equal((await buy(checkedId)).reason, 'banned');
    assert.equal((await status(chartA)).reason, 'banned');
    await db.exec('reset role');
    await db.query('update public.user_private set banned_until=null where user_id=$1', [member]);

    // A failure after the debit must not leave either a charge or a receipt.
    const failedLedgerKey = fingerprint('fail-at-ledger'), failedEntitlementKey = fingerprint('fail-at-entitlement');
    await db.exec(`create function public.saju_test_fail_ledger() returns trigger language plpgsql as $$begin
      if new.kind='saju_reading_v1' and new.result->>'chart_key'='${failedLedgerKey}' then raise exception 'saju_test_ledger_failure'; end if; return new;
      end$$; create trigger saju_test_ledger_failure before insert on ojjuda_note_internal.spend_requests for each row execute function public.saju_test_fail_ledger();
      create function public.saju_test_fail_entitlement() returns trigger language plpgsql as $$begin
      if new.chart_key='${failedEntitlementKey}' then raise exception 'saju_test_entitlement_failure'; end if; return new;
      end$$; create trigger saju_test_entitlement_failure before insert on ojjuda_saju_internal.entitlements for each row execute function public.saju_test_fail_entitlement();`);
    await login(member);
    await assert.rejects(() => buy(randomUUID(),failedLedgerKey), /saju_test_ledger_failure/);
    assert.equal(await balance(member), 80);
    await login(member);
    await assert.rejects(() => buy(randomUUID(),failedEntitlementKey), /saju_test_entitlement_failure/);
    assert.equal(await balance(member), 80);
    assert.deepEqual(await counts(member), { entitlements:2,receipts:2 });

    await login(member);
    const tarotId = randomUUID();
    const tarot = (await db.query('select public.tarot_reading_buy_v1($1,$2,false) as value', [tarotId,'love'])).rows[0].value;
    assert.equal(tarot.coins, 70);
    assert.equal(tarot.drawn.length, 5);
    assert.equal((await buy(tarotId)).reason, 'request_conflict');
    assert.equal((await status(chartA)).coins, 70, 'reopening reports the current wallet, not the original cached balance');
    await db.exec('reset role');
    assert.equal((await db.query("select count(*)::int as n from ojjuda_tarot_internal.daily_readings where user_id=$1", [member])).rows[0].n, 1);
    const photoId = randomUUID();
    await db.query("insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values($1,$2,'card_photo',7,'{}')", [photoId,member]);
    assert.equal((await db.query('select count(*)::int as n from ojjuda_note_internal.photo_entitlements')).rows[0].n, 1);
    const ledger = (await db.query("select kind,coins,result from ojjuda_note_internal.spend_requests where user_id=$1 and kind='saju_reading_v1'", [member])).rows;
    assert.equal(ledger.length, 2);
    assert.ok(ledger.every(row => row.coins===10 && row.result.product==='saju' && row.result.title==='사주팔자 상세 풀이'));
    assert.ok(ledger.every(row => !['birth','date','year','month','day','hour','minute','name','gender'].some(key => key in row.result)));

    await login(deleted);
    const deletedReceipt = await buy(randomUUID());
    assert.equal(deletedReceipt.coins, 20);
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1', [deleted]);
    assert.deepEqual(await counts(deleted), { entitlements:0,receipts:0 });
    assert.equal(await balance(deleted), undefined);
    await login(deleted); // A stale JWT does not re-create the deleted member.
    assert.equal((await buy(randomUUID())).reason, 'member_required');
    assert.equal((await status(chartA)).reason, 'member_required');

    // Upgrade the real v1 fixtures in place: old purchases become grandfathered
    // bundles, while every new topic/year is a distinct fixed-price purchase.
    await db.exec('reset role');
    await db.exec(categoryMigration);
    const categoryMember = randomUUID(), categoryPoor = randomUUID(), categoryDeleted = randomUUID(), otherMember = randomUUID();
    for (const [id, coins] of [[categoryMember,100],[categoryPoor,9],[categoryDeleted,20],[otherMember,50]]) {
      await db.query('insert into auth.users values($1,false)', [id]);
      await db.query('insert into public.user_private(user_id,coins) values($1,$2)', [id,coins]);
    }
    const buy2 = async (id, topic = 'lifelong', year = 0, key = chartA, verify = false, expected = currentUser) =>
      (await db.query('select public.saju_reading_buy_v2($1::uuid,$2::text,$3::text,$4::integer,$5::uuid,$6::boolean) as value',
        [id,key,topic,year,expected,verify])).rows[0].value;
    const status2 = async (key = null) => (await db.query('select public.saju_reading_status_v2($1::text) as value', [key])).rows[0].value;
    const counts2 = async id => {
      await db.exec('reset role');
      return (await db.query(`select
        (select count(*)::int from ojjuda_saju_internal.topic_entitlements where user_id=$1) as entitlements,
        (select count(*)::int from ojjuda_note_internal.spend_requests where user_id=$1 and kind='saju_reading_v2') as receipts`, [id])).rows[0];
    };
    const categorySecurity = (await db.query(`select
      (select relrowsecurity from pg_class where oid='ojjuda_saju_internal.topic_entitlements'::regclass) as rls,
      has_table_privilege('authenticated','ojjuda_saju_internal.topic_entitlements','SELECT') as direct_read,
      has_table_privilege('authenticated','ojjuda_saju_internal.topic_entitlements','INSERT') as direct_insert,
      has_table_privilege('authenticated','ojjuda_saju_internal.topic_entitlements','UPDATE') as direct_update,
      has_function_privilege('authenticated','ojjuda_saju_internal.receipt_v2(uuid,text,text,integer,integer,boolean,boolean,integer)','EXECUTE') as formatter,
      has_function_privilege('anon','public.saju_reading_buy_v2(uuid,text,text,integer,uuid,boolean)','EXECUTE') as anon_buy,
      has_function_privilege('anon','public.saju_reading_status_v2(text)','EXECUTE') as anon_status,
      has_function_privilege('anon','ojjuda_saju_internal.buy_v2(uuid,text,text,integer,uuid,boolean)','EXECUTE') as anon_internal,
      has_function_privilege('authenticated','public.saju_reading_buy_v2(uuid,text,text,integer,uuid,boolean)','EXECUTE') as auth_buy,
      has_function_privilege('authenticated','public.saju_reading_status_v2(text)','EXECUTE') as auth_status`)).rows[0];
    assert.deepEqual(categorySecurity, {rls:true,direct_read:false,direct_insert:false,direct_update:false,formatter:false,
      anon_buy:false,anon_status:false,anon_internal:false,auth_buy:true,auth_status:true});
    for (const name of ['public.saju_reading_buy_v1','ojjuda_saju_internal.buy_v1']) {
      for (const signature of ['uuid,text,boolean','uuid,text,uuid,boolean']) {
        for (const role of ['anon','authenticated']) {
          assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') as allowed', [role,`${name}(${signature})`])).rows[0].allowed,false);
        }
      }
    }
    const categoryFunctions = (await db.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where (n.nspname='ojjuda_saju_internal' and p.proname in ('receipt_v2','buy_v2','status_v2'))
      or (n.nspname='public' and p.proname in ('saju_reading_buy_v2','saju_reading_status_v2'))`)).rows;
    assert.equal(categoryFunctions.length,5);
    for (const fn of categoryFunctions) {
      assert.ok(fn.proconfig.includes('search_path=""'));
      assert.equal(fn.prosecdef,fn.nspname==='ojjuda_saju_internal' && fn.proname!=='receipt_v2');
    }
    await login(null);
    await assert.rejects(() => buy2(randomUUID()), /permission denied/);
    await assert.rejects(() => status2(), /permission denied/);
    await login(null,'authenticated');
    await assert.rejects(() => buy2(randomUUID()), /not_signed_in/);
    await assert.rejects(() => status2(), /not_signed_in/);
    await login(categoryMember);
    await assert.rejects(() => buy(randomUUID()), /permission denied/, 'the guarded v1 overload must no longer create bundles');
    await assert.rejects(() => db.query('select ojjuda_saju_internal.buy_v1($1::uuid,$2::text,$3::uuid,false)', [randomUUID(),chartA,categoryMember]), /permission denied/);
    await assert.rejects(() => db.exec('select * from ojjuda_saju_internal.topic_entitlements'), /permission denied/);
    await assert.rejects(() => db.query('select ojjuda_saju_internal.receipt_v2($1,$2,$3,$4,100,true,true,0)', [categoryMember,chartA,'lifelong',0]), /permission denied/);
    const emptyCategoryStatus = await status2();
    assert.deepEqual(emptyCategoryStatus.prices,{lifelong:10,annual:10,monthly:10});
    assert.deepEqual(emptyCategoryStatus.entitlements,[]);
    assert.equal(emptyCategoryStatus.bundle_entitlement,null);
    assert.equal(emptyCategoryStatus.coins,100);
    assert.equal((await db.query('select public.saju_reading_status_v2() as value')).rows[0].value.coins,100);
    assert.equal((await buy2(randomUUID(),'lifelong',0,chartA,true)).reason,'not_found');
    for (const [topic,year] of [[null,0],['',0],['bundle',0],['daily',2026],['lifelong',1],['lifelong',2026],['annual',null],['annual',0],['monthly',1899],['monthly',2051]]) {
      assert.equal((await buy2(randomUUID(),topic,year)).reason,'invalid');
    }
    for (const key of [null,'','g'.repeat(64),'0'.repeat(63)]) assert.equal((await buy2(randomUUID(),'lifelong',0,key)).reason,'invalid');
    assert.equal((await status2('bad')).reason,'invalid');
    assert.equal((await buy2(null)).reason,'invalid');
    assert.equal((await buy2(randomUUID(),'lifelong',0,chartA,null)).reason,'invalid');
    for (const expected of [null,otherMember]) {
      assert.deepEqual(await buy2(randomUUID(),'lifelong',0,chartA,false,expected),{ok:false,reason:'account_changed'});
    }
    assert.equal((await status2()).coins,100);

    const lifelongId = randomUUID(), annualId = randomUUID(), monthlyId = randomUUID();
    const lifelong = await buy2(lifelongId,'lifelong',null);
    assert.equal(lifelong.year,0,'null lifelong year has exactly the same identity as year zero');
    assert.equal(lifelong.topic,'lifelong');
    assert.equal(lifelong.price,10);
    assert.equal(lifelong.charged,10);
    assert.equal(lifelong.coins,90);
    assert.equal(lifelong.legacy_bundle,false);
    assert.equal(lifelong.entitlement_version,2);
    assert.equal(lifelong.title,'사주 평생운');
    assert.equal((await buy2(lifelongId,'lifelong',0,chartA,true)).charged,0);
    assert.equal((await buy2(randomUUID(),'LIFELONG',null,chartA.toUpperCase())).request_id,lifelongId);
    assert.equal((await buy2(lifelongId,'annual',2026)).reason,'request_conflict');
    const annual = await buy2(annualId,'annual',2026);
    const monthly = await buy2(monthlyId,'monthly',2026);
    assert.equal(annual.coins,80);
    assert.equal(monthly.coins,70,'monthly is its own 10-ju item, covering all twelve months');
    assert.match(monthly.title,/12개월/);
    assert.equal((await buy2(randomUUID(),'annual',2027)).coins,60,'another annual year is another purchase');
    assert.equal((await buy2(randomUUID(),'monthly',2027)).coins,50,'another twelve-month year is another purchase');
    assert.equal((await buy2(randomUUID(),'lifelong',0,chartB)).coins,40,'another chart is a separate purchase');
    assert.equal((await buy2(annualId,'annual',2027)).reason,'request_conflict');
    assert.equal((await buy2(annualId,'monthly',2026)).reason,'request_conflict');
    assert.equal((await buy2(annualId,'annual',2026,chartB)).reason,'request_conflict');
    const categoryReopens = await Promise.all(Array.from({length:8},()=>buy2(randomUUID(),'annual',2026)));
    assert.ok(categoryReopens.every(value=>value.request_id===annualId && value.charged===0 && value.coins===40));
    const selectedStatus = await status2(chartA);
    assert.deepEqual(selectedStatus.entitlements.map(({topic,year})=>[topic,year]),[
      ['lifelong',0],['annual',2026],['annual',2027],['monthly',2026],['monthly',2027]
    ]);
    assert.equal(selectedStatus.bundle_entitlement,null);
    assert.equal((await status2(chartB)).entitlements.length,1);
    assert.deepEqual((await status2()).entitlements,[],'balance-only lookup does not enumerate all birth profiles');
    assert.deepEqual(await counts2(categoryMember),{entitlements:6,receipts:6});

    await login(otherMember);
    assert.equal((await status2(chartA)).entitlements.length,0,'same hash never grants another member access');
    assert.equal((await buy2(randomUUID(),'annual',2026,chartA,false,categoryMember)).reason,'account_changed');
    assert.equal((await buy2(annualId,'annual',2026)).reason,'request_conflict');
    assert.equal((await buy2(checkedId,'annual',2026)).reason,'request_conflict','another member\'s bundle UUID is not an entitlement');
    assert.equal((await status2()).coins,50);
    await login(categoryPoor);
    const poorCategoryId=randomUUID();
    assert.equal((await buy2(poorCategoryId,'annual',2026)).reason,'coins');
    await db.exec('reset role');
    await db.query('update public.user_private set coins=10 where user_id=$1',[categoryPoor]);
    await login(categoryPoor);
    assert.equal((await buy2(poorCategoryId,'annual',2026)).coins,0);
    assert.equal((await buy2(randomUUID(),'annual',2026)).request_id,poorCategoryId);
    assert.equal((await buy2(randomUUID(),'monthly',2026)).reason,'coins');
    await login(guest);
    assert.equal((await buy2(randomUUID())).reason,'member_required');
    assert.equal((await status2()).reason,'member_required');
    await login(missingWallet);
    assert.equal((await buy2(randomUUID())).reason,'wallet_unavailable');
    await db.exec('reset role');
    await db.query("update public.user_private set banned_until=now()+interval '1 day' where user_id=$1",[categoryMember]);
    await login(categoryMember);
    assert.equal((await buy2(lifelongId)).reason,'banned');
    assert.equal((await status2(chartA)).reason,'banned');
    await db.exec('reset role');
    await db.query('update public.user_private set banned_until=null where user_id=$1',[categoryMember]);

    // Existing bundle purchases keep all topics and years, even at zero balance.
    await login(member);
    const bundleStatus=await status2(chartA);
    assert.equal(bundleStatus.bundle_entitlement.request_id,checkedId);
    assert.deepEqual(bundleStatus.entitlements,[]);
    for (const [topic,year] of [['lifelong',null],['annual',1900],['annual',2026],['monthly',2026],['monthly',2050]]) {
      const inherited=await buy2(randomUUID(),topic,year);
      assert.equal(inherited.request_id,checkedId);
      assert.equal(inherited.legacy_bundle,true);
      assert.equal(inherited.coins,bundleStatus.coins);
      assert.equal(inherited.charged,0);
      assert.equal(inherited.topic,topic);
      assert.equal(inherited.year,year||0);
    }
    assert.equal((await buy2(checkedId,'monthly',2027)).charged,0,'a returned bundle UUID may reopen a different included topic/year');
    assert.deepEqual(await counts2(member),{entitlements:0,receipts:0},'grandfathering never inserts a new charge/receipt');
    await login(zero);
    assert.equal((await buy2(randomUUID(),'monthly',2026)).coins,0);
    assert.equal((await buy2(randomUUID(),'monthly',2026)).legacy_bundle,true);

    // An imported historical bundle can coexist with individual receipts.
    // The already-purchased individual receipt must remain canonical.
    await db.exec('reset role');
    const importedBundleId=randomUUID();
    await db.query("insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values($1,$2,'saju_reading_v1',10,$3::jsonb)",
      [importedBundleId,categoryMember,JSON.stringify({chart_key:chartA,title:'사주팔자 상세 풀이'})]);
    await db.query('insert into ojjuda_saju_internal.entitlements(user_id,chart_key,request_id) values($1,$2,$3)',[categoryMember,chartA,importedBundleId]);
    await login(categoryMember);
    assert.equal((await buy2(randomUUID(),'annual',2026)).request_id,annualId);
    assert.equal((await buy2(importedBundleId,'annual',2026)).legacy_bundle,false);
    assert.equal((await buy2(importedBundleId,'annual',2026)).request_id,annualId);
    assert.equal((await buy2(randomUUID(),'monthly',2030)).request_id,importedBundleId);
    assert.equal((await buy2(annualId,'monthly',2030)).reason,'request_conflict');
    const mixedStatus=await status2(chartA);
    assert.equal(mixedStatus.entitlements.length,5);
    assert.equal(mixedStatus.bundle_entitlement.request_id,importedBundleId);
    assert.equal(mixedStatus.coins,40);

    // Topic ledger and entitlement writes must both roll back the same debit.
    await db.exec('reset role');
    const failedV2Ledger=fingerprint('v2-failed-ledger'), failedV2Entitlement=fingerprint('v2-failed-entitlement');
    await db.exec(`create function public.saju_v2_test_fail_ledger() returns trigger language plpgsql as $$begin
      if new.kind='saju_reading_v2' and new.result->>'chart_key'='${failedV2Ledger}' then raise exception 'v2_ledger_failure'; end if; return new;
      end$$; create trigger saju_v2_test_ledger_failure before insert on ojjuda_note_internal.spend_requests for each row execute function public.saju_v2_test_fail_ledger();
      create function public.saju_v2_test_fail_entitlement() returns trigger language plpgsql as $$begin
      if new.chart_key='${failedV2Entitlement}' then raise exception 'v2_entitlement_failure'; end if; return new;
      end$$; create trigger saju_v2_test_entitlement_failure before insert on ojjuda_saju_internal.topic_entitlements for each row execute function public.saju_v2_test_fail_entitlement();`);
    await login(categoryMember);
    await assert.rejects(()=>buy2(randomUUID(),'annual',2026,failedV2Ledger),/v2_ledger_failure/);
    await assert.rejects(()=>buy2(randomUUID(),'monthly',2026,failedV2Entitlement),/v2_entitlement_failure/);
    assert.equal((await status2()).coins,40);
    assert.deepEqual(await counts2(categoryMember),{entitlements:6,receipts:6});
    await login(categoryMember);
    const v2TarotId=randomUUID();
    assert.equal((await db.query('select public.tarot_reading_buy_v1($1,$2,false) as value',[v2TarotId,'love'])).rows[0].value.coins,30);
    assert.equal((await buy2(v2TarotId,'lifelong',0,chartB)).reason,'request_conflict');
    assert.equal((await buy2(annualId,'annual',2026)).coins,30,'replayed receipt always returns the current shared wallet');
    await db.exec('reset role');
    const topicLedger=(await db.query("select kind,coins,result from ojjuda_note_internal.spend_requests where user_id=$1 and kind='saju_reading_v2'",[categoryMember])).rows;
    assert.equal(topicLedger.length,6);
    for (const row of topicLedger) {
      assert.equal(row.coins,10);
      assert.ok(['lifelong','annual','monthly'].includes(row.result.topic));
      assert.equal(row.result.entitlement_version,2);
      assert.ok(!Object.keys(row.result).some(key=>/birth|date_of_birth|solar|lunar|hour|minute|gender|report|reading_body/.test(key)));
    }
    await login(categoryDeleted);
    await buy2(randomUUID(),'lifelong',0);
    await buy2(randomUUID(),'annual',2026);
    assert.equal((await status2()).coins,0);
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1',[categoryDeleted]);
    assert.deepEqual(await counts2(categoryDeleted),{entitlements:0,receipts:0});
    assert.equal(await balance(categoryDeleted),undefined);
    await login(categoryDeleted);
    assert.equal((await buy2(randomUUID())).reason,'member_required');
    assert.equal((await status2()).reason,'member_required');

    console.log('PASS: legacy v1 upgrade fixtures preserve the original 10-ju bundle, same/different-UUID and uppercase-hash replay, and zero-balance reopening.');
    console.log('PASS: request/account isolation, member/ban/wallet checks, invalid fingerprints, RLS/least grants/empty search paths, private formatter and public invoker wrappers.');
    console.log('PASS: required expected-account guard blocks changed/null owners without debit; legacy public/internal purchase execution revoked; named guarded overload resolves.');
    console.log('PASS: ledger and entitlement failure roll back wallet debit, current-balance receipt, tarot/photo compatibility, hashed-data-only records, account deletion cascades.');
    console.log('PASS: v2 lifelong/annual/monthly each cost 10, selected-year isolation, free same-item retries, 12-month bundle, strict input and expected-account checks.');
    console.log('PASS: v1 purchase permissions revoked; historical bundles stay free; individual receipt wins; topic ledger rollback and deletion cascade; private status lists only the requested chart.');
  } finally { await db.close(); }
})().catch(error => { console.error(error.stack || error); process.exitCode=1; });
