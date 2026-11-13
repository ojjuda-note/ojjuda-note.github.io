const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');

// Synthetic members and fingerprints in an in-memory PostgreSQL engine only.
// No live project, wallet, birth information, credentials or external calls.
test('separate 20-ju compatibility access preserves legacy purchases and administrator history',async t=>{
  const db=new PGlite();
  const dir=path.join(__dirname,'../supabase/migrations');
  const apply=name=>db.exec(fs.readFileSync(path.join(dir,name),'utf8'));
  const key=value=>createHash('sha256').update('synthetic-compatibility:'+value).digest('hex');
  const pair=key('first'),otherPair=key('second');
  let sessionUser=null,sessionRole=null;
  const login=async(id,role=id?'authenticated':'anon')=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+role);
    sessionUser=id;sessionRole=role;
  };
  const asOwner=async work=>{
    const user=sessionUser,role=sessionRole;
    await db.exec('reset role');
    try{return await work();}
    finally{if(role)await login(user,role);}
  };
  const member=async({coins=100,anonymous=false,wallet=true,admin=false,nickname='Synthetic member'}={})=>asOwner(async()=>{
    const id=randomUUID();
    await db.query('insert into auth.users(id,is_anonymous,is_admin) values($1,$2,$3)',[id,anonymous,admin]);
    if(wallet)await db.query('insert into public.user_private(user_id,coins) values($1,$2)',[id,coins]);
    await db.query('insert into public.profiles(id,nickname) values($1,$2)',[id,nickname]);
    return id;
  });
  const status=async(pairKey=pair)=>(await db.query('select public.saju_compatibility_status_v1($1) as value',[pairKey])).rows[0].value;
  const buy=async(options={})=>{
    const {id=randomUUID(),pairKey=pair,owner=sessionUser,expectedCharge=20,verify=false}=options;
    return (await db.query('select public.saju_compatibility_buy_v1($1::uuid,$2::text,$3::uuid,$4::integer,$5::boolean) as value',[id,pairKey,owner,expectedCharge,verify])).rows[0].value;
  };
  const oldBuy=async(topic='lifelong',year=topic==='lifelong'?0:2026)=>(await db.query('select public.saju_reading_buy_v4($1,$2,$3,$4,$5,10,false) as value',[randomUUID(),key('old-chart'),topic,year,sessionUser])).rows[0].value;
  const state=async user=>asOwner(async()=>(await db.query(`select
    (select coins from public.user_private where user_id=$1) as coins,
    (select count(*)::int from ojjuda_saju_internal.compatibility_entitlements where user_id=$1) as entitlements,
    (select count(*)::int from ojjuda_note_internal.spend_requests where user_id=$1 and kind='saju_compatibility_v1') as requests,
    (select coalesce(sum(coins),0)::int from ojjuda_note_internal.spend_requests where user_id=$1 and kind='saju_compatibility_v1') as spent`,[user])).rows[0]);
  const ledger=async id=>asOwner(async()=>(await db.query('select * from ojjuda_note_internal.spend_requests where request_id=$1',[id])).rows[0]);
  const age=async(user,hours=24,pairKey=pair)=>asOwner(async()=>{
    // Move the complete synthetic payment into the past; application renewal
    // must never make any of these changes to real historical ledger rows.
    const row=(await db.query("update ojjuda_saju_internal.compatibility_entitlements set purchased_at=clock_timestamp()-$1::double precision*interval '1 hour' where user_id=$2 and pair_key=$3 returning request_id,purchased_at",[hours,user,pairKey])).rows[0];
    await db.query("update ojjuda_note_internal.spend_requests set created_at=$2::timestamptz,result=result||jsonb_build_object('paid_at',$2::timestamptz,'expires_at',$2::timestamptz+interval '24 hours','server_now',$2::timestamptz) where request_id=$1",[row.request_id,row.purchased_at]);
  });
  const assertReceipt=(value,charged,price=20)=>{
    assert.equal(value.ok,true);assert.equal(value.entitled,true);
    assert.equal(value.product,'saju');assert.equal(value.topic,'compatibility');
    assert.equal(value.title,'사주 궁합');assert.equal(value.price,price);
    assert.equal(value.access_version,1);assert.equal(value.entitlement_version,1);
    assert.equal(value.access_hours,24);assert.equal(value.charged,charged);
    assert.equal(value.replayed,charged===0);
    assert.match(value.request_id,/^[0-9a-f-]{36}$/);
    assert.match(value.pair_key,/^[0-9a-f]{64}$/);
    assert.equal(Date.parse(value.expires_at)-Date.parse(value.paid_at),86400000);
    assert.ok(Date.parse(value.server_now)<Date.parse(value.expires_at));
    assert.equal(Object.hasOwn(value,'year'),false);
  };
  const adminHistory=async(options={})=>{
    const {product='all',query='',from=null,to=null,limit=30,offset=0}=options;
    return (await db.query('select ojjuda_admin_internal.fortune_purchases($1,$2,$3::date,$4::date,$5,$6) as value',[product,query,from,to,limit,offset])).rows[0].value;
  };
  try{
    await db.exec(`
      create role anon;create role authenticated;create role service_role;
      create schema auth;create schema ojjuda_note_internal;create schema ojjuda_admin_internal;
      create table auth.users(id uuid primary key,is_anonymous boolean,is_admin boolean not null default false);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,nickname text);
      create table public.user_private(user_id uuid primary key references auth.users(id) on delete cascade,
        coins integer not null,banned_until timestamptz);
      alter table public.user_private enable row level security;
      create policy wallet_read on public.user_private for select to authenticated using(user_id=auth.uid());
      grant select on public.user_private to authenticated;
      create function public.is_banned(u uuid) returns boolean language sql stable security definer set search_path='' as
        $$select exists(select 1 from public.user_private where user_id=u and banned_until>now())$$;
      create function public.is_admin() returns boolean language sql stable security definer set search_path='' as
        $$select exists(select 1 from auth.users where id=auth.uid() and is_admin=true)$$;
      create table ojjuda_note_internal.spend_requests(
        request_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
        kind text not null check(char_length(kind) between 1 and 60),target_id uuid,
        coins integer not null check(coins>=0),result jsonb not null default '{}',created_at timestamptz not null default now()
      );
      grant usage on schema public,auth to anon,authenticated;
      revoke all on schema ojjuda_admin_internal from public,anon;
      grant usage on schema ojjuda_admin_internal to authenticated;
    `);
    for(const name of [
      '20261112152113_saju_reading_ten_ju_entitlement.sql',
      '20261112152603_saju_purchase_account_guard.sql',
      '20261112153930_saju_category_purchases_v2.sql',
      '20261112171205_saju_all_purchases_v3.sql',
      '20261112233619_saju_twenty_four_hour_access_v4.sql',
    ])await apply(name);
    const definitions=await db.query(`select p.oid::regprocedure::text as name,pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='ojjuda_saju_internal' or (n.nspname='public' and p.proname like 'saju_reading_%') order by name`);
    const migration=fs.readdirSync(dir).filter(name=>name.endsWith('_saju_compatibility_ten_ju_24h_v1.sql'));
    assert.equal(migration.length,1);
    await apply(migration[0]);

    // Buy through the original live API before the price migration, so the
    // preservation checks cover a genuine old receipt rather than a new fixture.
    const legacyUser=await member({coins:70}),legacyId=randomUUID();
    await login(legacyUser);
    const legacyPurchase=await buy({id:legacyId,expectedCharge:10});
    assertReceipt(legacyPurchase,10,10);
    const legacyLedger=await ledger(legacyId);
    const legacyEntitlement=await asOwner(async()=>(await db.query(
      'select * from ojjuda_saju_internal.compatibility_entitlements where user_id=$1',[legacyUser])).rows[0]);
    await db.exec('reset role');sessionUser=null;sessionRole=null;
    const priceMigration=fs.readdirSync(dir).filter(name=>name.endsWith('_saju_compatibility_twenty_ju.sql'));
    assert.equal(priceMigration.length,1);
    await apply(priceMigration[0]);

    await t.test('private tables and helpers remain inaccessible while member-only wrappers have fixed search paths',async()=>{
      const functions=(await db.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as member,
        has_function_privilege('service_role',p.oid,'EXECUTE') as service
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where (n.nspname='ojjuda_saju_internal' and p.proname like 'compatibility_%')
          or (n.nspname='public' and p.proname like 'saju_compatibility_%')`)).rows;
      assert.equal(functions.length,5);
      for(const fn of functions){
        const helper=fn.proname==='compatibility_receipt_v1';
        assert.equal(fn.anon,false);assert.equal(fn.service,false);
        assert.equal(fn.member,!helper);
        assert.equal(fn.prosecdef,fn.nspname==='ojjuda_saju_internal'&&!helper);
        assert.ok(fn.proconfig.includes('search_path=""'));
      }
      const table=(await db.query(`select c.relrowsecurity,
        has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as member,
        has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon,
        has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') as service
        from pg_class c where c.oid='ojjuda_saju_internal.compatibility_entitlements'::regclass`)).rows[0];
      assert.deepEqual(table,{relrowsecurity:true,member:false,anon:false,service:false});
      const columns=(await db.query("select column_name from information_schema.columns where table_schema='ojjuda_saju_internal' and table_name='compatibility_entitlements' order by ordinal_position")).rows.map(value=>value.column_name);
      assert.deepEqual(columns,['user_id','pair_key','request_id','price','purchased_at']);
      const user=await member();await login(user);
      await assert.rejects(()=>db.query('select * from ojjuda_saju_internal.compatibility_entitlements'),/permission denied/);
      await assert.rejects(()=>db.query('select ojjuda_saju_internal.compatibility_receipt_v1($1,$2,999,clock_timestamp(),true,true,0)',[user,pair]),/permission denied/);
    });

    await t.test('legacy 10-ju access stays free until its original deadline and its first renewal costs 20',async()=>{
      await login(legacyUser);
      assert.deepEqual(await ledger(legacyId),legacyLedger);
      const untouched=await asOwner(async()=>(await db.query(
        'select * from ojjuda_saju_internal.compatibility_entitlements where user_id=$1',[legacyUser])).rows[0]);
      assert.deepEqual(untouched,legacyEntitlement);
      const current=await status();assert.equal(current.price,20);
      assertReceipt(current.entitlement,0,10);
      assert.equal(current.entitlement.expires_at,legacyPurchase.expires_at);
      for(const receipt of [await buy({id:legacyId,expectedCharge:10}),await buy({expectedCharge:0}),await buy({verify:true})]){
        assertReceipt(receipt,0,10);
        assert.equal(receipt.request_id,legacyId);
        assert.equal(receipt.paid_at,legacyPurchase.paid_at);
        assert.equal(receipt.expires_at,legacyPurchase.expires_at);
      }
      assert.deepEqual(await state(legacyUser),{coins:60,entitlements:1,requests:1,spent:10});
      assert.deepEqual(await ledger(legacyId),legacyLedger);
      await age(legacyUser,24);
      const expiredLedger=await ledger(legacyId),expired=await state(legacyUser);
      assert.equal((await status()).entitlement,null);
      const stale=await buy({expectedCharge:10});
      assert.equal(stale.reason,'price_changed');assert.equal(stale.required,20);
      assert.equal((await buy({id:legacyId,expectedCharge:10})).reason,'access_expired');
      assert.deepEqual(await state(legacyUser),expired);
      const renewed=await buy();assertReceipt(renewed,20);
      assert.notEqual(renewed.request_id,legacyId);
      assert.deepEqual(await ledger(legacyId),expiredLedger);
      assert.deepEqual(await state(legacyUser),{coins:40,entitlements:1,requests:2,spent:30});
      const newPointer=await asOwner(async()=>(await db.query(
        'select price from ojjuda_saju_internal.compatibility_entitlements where user_id=$1',[legacyUser])).rows[0]);
      assert.equal(newPointer.price,20);
      const admin=await member({admin:true});await login(admin);
      const history=await adminHistory({query:legacyUser});
      assert.equal(Number(history.total_count),2);assert.equal(Number(history.total_ju),30);
      assert.deepEqual(history.items.map(item=>item.coins).sort((a,b)=>a-b),[10,20]);
    });

    await t.test('every existing saju function remains unchanged and the three-topic bundle grants no compatibility',async()=>{
      const after=await asOwner(()=>db.query(`select p.oid::regprocedure::text as name,pg_get_functiondef(p.oid) as definition
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='ojjuda_saju_internal' or (n.nspname='public' and p.proname like 'saju_reading_%')`));
      for(const before of definitions.rows)assert.equal(after.rows.find(row=>row.name===before.name).definition,before.definition,before.name);
      const user=await member({coins:60});await login(user);
      const old=(await db.query('select public.saju_reading_buy_all_v4($1,$2,2026,$3,30,false) as value',[randomUUID(),key('old-chart'),user])).rows[0].value;
      assert.equal(old.ok,true);assert.equal(old.price,30);assert.equal(old.items.length,3);
      const oldRows=await asOwner(()=>db.query('select * from ojjuda_saju_internal.topic_entitlements where user_id=$1 order by topic',[user]));
      assert.equal((await status()).entitlement,null);
      assert.equal((await buy({expectedCharge:0})).reason,'price_changed');
      assertReceipt(await buy(),20);
      const nextRows=await asOwner(()=>db.query('select * from ojjuda_saju_internal.topic_entitlements where user_id=$1 order by topic',[user]));
      assert.deepEqual(nextRows.rows,oldRows.rows);
      const oldStatus=(await db.query('select public.saju_reading_status_v4($1) as value',[key('old-chart')])).rows[0].value;
      assert.deepEqual(oldStatus.prices,{lifelong:10,annual:10,monthly:10,all:30});
      assert.equal(oldStatus.entitlements.length,3);
      assert.equal((await state(user)).coins,10);
    });

    await t.test('first purchase costs twenty, active replay costs zero and the deadline never moves',async()=>{
      const user=await member({coins:30}),id=randomUUID();await login(user);
      const empty=await status(null);
      assert.equal(empty.price,20);assert.equal(empty.pair_key,null);assert.equal(empty.entitlement,null);
      const paid=await buy({id,pairKey:pair.toUpperCase()});assertReceipt(paid,20);
      assert.equal(paid.pair_key,pair);assert.equal(paid.request_id,id);assert.equal(paid.coins,10);
      for(const receipt of [await buy({id}),await buy({expectedCharge:0}),await buy({verify:true})]){
        assertReceipt(receipt,0);assert.equal(receipt.request_id,id);
        assert.equal(receipt.paid_at,paid.paid_at);assert.equal(receipt.expires_at,paid.expires_at);
      }
      const current=await status();assertReceipt(current.entitlement,0);
      assert.equal(current.server_now,current.entitlement.server_now);
      assert.deepEqual(await state(user),{coins:10,entitlements:1,requests:1,spent:20});
    });

    await t.test('both higher and lower stale displayed charges are rejected without a debit',async()=>{
      const user=await member({coins:30});await login(user);
      const before=await state(user);
      const increased=await buy({expectedCharge:0});
      assert.equal(increased.reason,'price_changed');assert.equal(increased.required,20);
      const oldPrice=await buy({expectedCharge:10});
      assert.equal(oldPrice.reason,'price_changed');assert.equal(oldPrice.price,20);assert.equal(oldPrice.required,20);
      assert.deepEqual(await state(user),before);
      assertReceipt(await buy(),20);
      const paid=await state(user),decreased=await buy({expectedCharge:20});
      assert.equal(decreased.reason,'price_changed');assert.equal(decreased.required,0);
      assert.deepEqual(await state(user),paid);
      assertReceipt(await buy({expectedCharge:0}),0);
    });

    await t.test('at the 24-hour boundary an old UUID cannot renew and a new explicit purchase preserves history',async()=>{
      const user=await member({coins:40}),id=randomUUID();await login(user);
      await buy({id});await age(user,23.99);
      assertReceipt((await status()).entitlement,0);
      await age(user,24);
      assert.equal((await status()).entitlement,null);
      const historical=await ledger(id),expired=await state(user);
      assert.equal((await buy({id})).reason,'access_expired');
      assert.equal((await buy({expectedCharge:0})).reason,'price_changed');
      assert.equal((await buy({verify:true})).reason,'not_found');
      assert.deepEqual(await state(user),expired);
      const nextId=randomUUID(),renewed=await buy({id:nextId});assertReceipt(renewed,20);
      assert.equal(renewed.request_id,nextId);
      assert.equal((await buy({id,expectedCharge:0})).reason,'access_expired');
      assertReceipt(await buy({id:nextId}),0);
      assert.deepEqual(await ledger(id),historical);
      assert.deepEqual(await state(user),{coins:0,entitlements:1,requests:2,spent:40});
    });

    await t.test('verification and status work inside a read-only transaction and never create a request',async()=>{
      const user=await member({coins:20});await login(user);
      const initial=await state(user);
      await db.exec('begin read only');
      try{assert.equal((await buy({verify:true})).reason,'not_found');assert.equal((await status()).entitlement,null);}
      finally{await db.exec('rollback');}
      assert.deepEqual(await state(user),initial);
      const paid=await buy();const before=await state(user);
      await db.exec('begin read only');
      try{assertReceipt(await buy({verify:true}),0);assertReceipt((await status()).entitlement,0);}
      finally{await db.exec('rollback');}
      assert.deepEqual(await state(user),before);
      assert.equal((await status()).entitlement.expires_at,paid.expires_at);
    });

    await t.test('request conflicts and another member cannot read, move or spend an existing entitlement',async()=>{
      const first=await member(),second=await member(),id=randomUUID();await login(first);await buy({id});
      const firstState=await state(first);
      assert.equal((await buy({id,pairKey:otherPair})).reason,'request_conflict');
      await login(second);
      assert.equal((await status()).entitlement,null);
      assert.equal((await buy({id})).reason,'request_conflict');
      assert.equal((await buy({owner:first})).reason,'account_changed');
      assertReceipt(await buy(),20);
      assert.deepEqual(await state(first),firstState);
      assert.deepEqual(await state(second),{coins:80,entitlements:1,requests:1,spent:20});
      const otherKind=randomUUID();
      await asOwner(()=>db.query("insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values($1,$2,'card_photo',7,'{}')",[otherKind,second]));
      assert.equal((await buy({id:otherKind,expectedCharge:0})).reason,'request_conflict');
    });

    await t.test('a new request for the same pair never creates a duplicate debit, while another pair is separate',async()=>{
      const user=await member({coins:40});await login(user);
      const paid=await buy();assertReceipt(paid,20);
      assert.equal((await buy()).reason,'price_changed');
      assertReceipt(await buy({expectedCharge:0}),0);
      assertReceipt(await buy({pairKey:otherPair}),20);
      assert.deepEqual(await state(user),{coins:0,entitlements:2,requests:2,spent:40});
      assert.equal((await status(pair)).entitlement.request_id,paid.request_id);
    });

    await t.test('signed-out, anonymous, deleted, banned and walletless users fail without purchases',async()=>{
      await login(null);
      await assert.rejects(()=>status(),/permission denied/);
      await assert.rejects(()=>buy(),/permission denied/);
      await login(null,'authenticated');
      await assert.rejects(()=>status(),/not_signed_in/);
      await assert.rejects(()=>buy(),/not_signed_in/);
      const guest=await member({anonymous:true});await login(guest);
      assert.equal((await status()).reason,'member_required');assert.equal((await buy()).reason,'member_required');
      const missing=await member({wallet:false});await login(missing);
      assert.equal((await status()).reason,'wallet_unavailable');assert.equal((await buy()).reason,'wallet_unavailable');
      const deleted=randomUUID();await login(deleted);
      assert.equal((await status()).reason,'member_required');assert.equal((await buy()).reason,'member_required');
      const banned=await member();await login(banned);await buy();
      await asOwner(()=>db.query("update public.user_private set banned_until=clock_timestamp()+interval '1 day' where user_id=$1",[banned]));
      const before=await state(banned);
      assert.equal((await status()).reason,'banned');assert.equal((await buy({expectedCharge:0})).reason,'banned');
      assert.equal((await buy({verify:true})).reason,'banned');assert.deepEqual(await state(banned),before);
    });

    await t.test('malformed inputs and insufficient coins leave the wallet and ledger untouched',async()=>{
      const user=await member({coins:19});await login(user);const before=await state(user);
      for(const options of [{id:null},{pairKey:null},{pairKey:''},{pairKey:'1990-01-01'},{pairKey:'g'.repeat(64)},{expectedCharge:null},{expectedCharge:1},{verify:null}])assert.equal((await buy(options)).reason,'invalid');
      assert.equal((await status('raw-date')).reason,'invalid');
      const insufficient=await buy();assert.equal(insufficient.reason,'coins');assert.equal(insufficient.required,20);
      assert.deepEqual(await state(user),before);
    });

    await t.test('a mismatched ledger fails closed instead of granting or recharging a fabricated receipt',async()=>{
      const user=await member(),id=randomUUID();await login(user);await buy({id});
      await asOwner(()=>db.query("update ojjuda_note_internal.spend_requests set result=result||jsonb_build_object('pair_key',$2::text) where request_id=$1",[id,otherPair]));
      const before=await state(user);
      assert.equal((await status()).reason,'receipt_unavailable');
      assert.equal((await buy({expectedCharge:0})).reason,'receipt_unavailable');
      assert.equal((await buy({verify:true})).reason,'receipt_unavailable');
      assert.deepEqual(await state(user),before);
    });

    await t.test('a price mismatch between the entitlement and its paid ledger fails closed',async()=>{
      const user=await member();await login(user);await buy();
      await asOwner(()=>db.query('update ojjuda_saju_internal.compatibility_entitlements set price=10 where user_id=$1',[user]));
      const before=await state(user);
      assert.equal((await status()).reason,'receipt_unavailable');
      assert.equal((await buy({expectedCharge:0})).reason,'receipt_unavailable');
      assert.equal((await buy({verify:true})).reason,'receipt_unavailable');
      assert.deepEqual(await state(user),before);
    });

    await t.test('ledger or entitlement insertion failure rolls back the complete wallet debit',async()=>{
      const user=await member(),ledgerKey=key('failed-ledger'),entitlementKey=key('failed-entitlement');await login(user);
      await asOwner(()=>db.exec(`
        create function public.compatibility_test_fail_ledger() returns trigger language plpgsql as $$begin
          if new.kind='saju_compatibility_v1' and new.result->>'pair_key'='${ledgerKey}' then raise exception 'compatibility_ledger_failure';end if;return new;end$$;
        create trigger compatibility_test_fail_ledger before insert on ojjuda_note_internal.spend_requests for each row execute function public.compatibility_test_fail_ledger();
        create function public.compatibility_test_fail_entitlement() returns trigger language plpgsql as $$begin
          if new.pair_key='${entitlementKey}' then raise exception 'compatibility_entitlement_failure';end if;return new;end$$;
        create trigger compatibility_test_fail_entitlement before insert on ojjuda_saju_internal.compatibility_entitlements for each row execute function public.compatibility_test_fail_entitlement();
      `));
      const before=await state(user);
      await assert.rejects(()=>buy({pairKey:ledgerKey}),/compatibility_ledger_failure/);assert.deepEqual(await state(user),before);
      await assert.rejects(()=>buy({pairKey:entitlementKey}),/compatibility_entitlement_failure/);assert.deepEqual(await state(user),before);
    });

    await t.test('administrator history includes only paid compatibility rows and recognizes annual and yearly labels',async()=>{
      const admin=await member({admin:true}),user=await member({nickname:'Compatibility audit'});await login(user);
      const paid=await buy();await buy({expectedCharge:0});await oldBuy('annual',2026);await oldBuy('monthly',2026);
      await asOwner(async()=>{
        for(const [kind,coins,result] of [
          ['saju_reading_v2',10,{ok:true,topic:'yearly',year:2025}],
          ['tarot_reading_v1',10,{ok:true,topic:'love'}],
          ['saju_reading_all_v3',0,{ok:true,topic:'all'}],
          ['saju_compatibility_v1',0,{ok:true,topic:'compatibility'}],
          ['card_photo',7,{ok:true}],
          ['saju_compatibility_v1',10,{ok:false}],
        ])await db.query('insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values($1,$2,$3,$4,$5::jsonb)',[randomUUID(),user,kind,coins,JSON.stringify(result)]);
      });
      await assert.rejects(()=>adminHistory({query:user}),/admin_required/);
      await login(admin);
      const all=await adminHistory({query:user});
      assert.equal(Number(all.total_count),5);assert.equal(Number(all.total_ju),60);
      assert.equal(Number(all.saju_count),4);assert.equal(Number(all.tarot_count),1);
      const item=all.items.find(value=>value.request_id===paid.request_id);
      assert.equal(item.topic,'compatibility');assert.equal(item.topic_title,'궁합');assert.equal(item.year,null);assert.equal(item.coins,20);
      for(const topic of ['annual','yearly'])assert.equal(all.items.find(value=>value.topic===topic).topic_title,'연간운');
      assert.equal(all.items.find(value=>value.topic==='annual').year,2026);
      assert.equal(all.items.find(value=>value.topic==='yearly').year,2025);
      assert.ok(all.items.every(value=>!Object.hasOwn(value,'pair_key')&&!Object.hasOwn(value,'result')&&!Object.hasOwn(value,'birth')));
      const saju=await adminHistory({query:user,product:'saju'});assert.equal(Number(saju.total_count),4);assert.equal(Number(saju.total_ju),50);
      const tarot=await adminHistory({query:user,product:'tarot'});assert.equal(Number(tarot.total_count),1);
      assert.equal((await adminHistory({query:'compatibility AUDIT',limit:2,offset:1})).items.length,2);
      await assert.rejects(()=>adminHistory({product:'compatibility'}),/invalid_fortune_page/);
      await assert.rejects(()=>adminHistory({limit:101}),/invalid_fortune_page/);
    });

    await t.test('administrator KST date bounds, pagination and aggregate privacy stay unchanged',async()=>{
      const admin=await member({admin:true}),user=await member({nickname:'KST audit'});await login(admin);
      await asOwner(async()=>{
        for(const time of ['2020-01-01T14:59:59Z','2020-01-01T15:00:00Z','2020-01-02T14:59:59Z','2020-01-02T15:00:00Z'])await db.query("insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at) values($1,$2,'saju_compatibility_v1',10,'{\"ok\":true}', $3::timestamptz)",[randomUUID(),user,time]);
      });
      const filtered=await adminHistory({query:user,from:'2020-01-02',to:'2020-01-02'});
      assert.equal(Number(filtered.total_count),2);assert.equal(Number(filtered.total_ju),20);
      assert.ok(filtered.items.every(value=>value.topic_title==='궁합'));
      const first=await adminHistory({query:user,from:'2020-01-02',to:'2020-01-02',limit:1});
      const second=await adminHistory({query:user,from:'2020-01-02',to:'2020-01-02',limit:1,offset:1});
      assert.notEqual(first.items[0].request_id,second.items[0].request_id);
      assert.equal(Number(first.total_count),2);
      await assert.rejects(()=>adminHistory({from:'2020-01-03',to:'2020-01-02'}),/invalid_fortune_page/);
    });
  }finally{await db.close();}
});
