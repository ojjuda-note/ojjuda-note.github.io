import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const directory = new URL('../supabase/migrations/', import.meta.url);
const read = name => readFile(new URL(name, directory), 'utf8');
const migration = await read('20261119033902_pajang_signal_purchase_preparation.sql');
const activation = await read('20261119034822_pajang_signal_six_packs.sql');
const anytimePurchase = await read('20261119101015_pajang_signal_purchase_anytime.sql');
const clock = sql => sql.replaceAll('clock_timestamp()', 'public.signal_test_now()');
const oldLimit = "       if (select count(*) from pajang_private.signals where src=mine.id and day=today)>=3 then raise exception '오늘 보낼 신호를 모두 사용했어요.';end if;";
const newLimit = `       if (select count(*) from pajang_private.signals where src=mine.id and day=today)>=3 then
         update pajang_private.signal_balances set paid_remaining=paid_remaining-1
           where user_id=u and paid_remaining>0;
         if not found then raise exception '오늘 보낼 신호를 모두 사용했어요.';end if;
       end if;`;

async function fixture(t, productionReads = true) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create schema ojjuda_restaurants_internal; create schema ojjuda_account_internal;
    create schema ojjuda_note_internal;
    grant usage on schema auth to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,is_anonymous boolean not null default false,
      deleted_at timestamptz,banned_until timestamptz);
    create table public.profiles(id uuid primary key,nickname text);
    create table public.user_private(user_id uuid primary key references auth.users(id),
      coins integer not null check(coins>=0),banned boolean not null default false,pending_deletion boolean not null default false);
    create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date,gender text);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text);
    create table ojjuda_note_internal.spend_requests(request_id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      kind text not null check(char_length(kind) between 1 and 60),target_id uuid,
      coins integer not null check(coins>=0),result jsonb not null default '{}',created_at timestamptz not null default now());
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
    $$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create function public.signal_test_now() returns timestamptz language sql as $$
      select current_setting('pajang.test_now')::timestamptz;
    $$;
    select set_config('pajang.test_now','2026-11-19T01:00:00Z',false);
    create function ojjuda_restaurants_internal.member_allowed() returns boolean
      language sql stable security definer set search_path='' as $$
      select exists(select from auth.users a join public.profiles p on p.id=a.id
        where a.id=auth.uid() and not a.is_anonymous and a.deleted_at is null
          and (a.banned_until is null or a.banned_until<=now()))
        and not exists(select from public.user_private w where w.user_id=auth.uid() and (w.banned or w.pending_deletion));
    $$;
    create function ojjuda_restaurants_internal.require_member() returns uuid
      language plpgsql stable security definer set search_path='' as $$
      begin
        if auth.uid() is null or not ojjuda_restaurants_internal.member_allowed() then
          raise exception 'member required' using errcode='42501';
        end if;
        return auth.uid();
      end; $$;
  `);
  for (const name of (await readdir(directory)).filter(name => name.startsWith('20261117') &&
    name.includes('_pajang_') && name <= '20261117210000_pajang_discovery_gender.sql' &&
    !name.includes('_exchange_photos')).sort()) await db.exec(clock(await read(name)));
  for (const name of ['20261117235000_pajang_my_answers.sql','20261117235950_pajang_edit_current_answer.sql',
    '20261118052051_pajang_persistent_location.sql','20261118084120_shared_park_pajang_location.sql']) {
    await db.exec(clock(await read(name)));
  }
  if (productionReads) {
    // Mirror only the audited live publication/visibility additions missing from older source migrations.
    await db.exec(`
      alter table pajang_private.answers add column publication_window_days smallint not null default 30;
      create function pajang_private.answer_is_visible(date,text,boolean,date,text,smallint)
        returns boolean language sql immutable set search_path='' as $$
        select $1 between $4-(case when $6=365 then 365 else 30 end-1) and $4
          and (($1=$4 and $2=$5) or ($3 and ($1<$4 or ($2='am' and $5='pm'))));
      $$;
      create table pajang_private.test_hidden_answers(person uuid,day date,slot text);
      create view pajang_private.visible_answers with(security_invoker=true) as
        select a.* from pajang_private.answers a where not exists(select from pajang_private.test_hidden_answers h
          where (h.person,h.day,h.slot)=(a.person,a.day,a.slot));
      create view pajang_private.visible_messages with(security_invoker=true) as select * from pajang_private.messages;
    `);
    let definition = (await db.query("select pg_get_functiondef('public.pajang_member(text,jsonb)'::regprocedure) as definition")).rows[0].definition;
    definition = definition
      .replace('insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived)',
        'insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived,publication_window_days)')
      .replace("(p_data->'archive') is not distinct from 'true'::jsonb)",
        "(p_data->'archive') is not distinct from 'true'::jsonb,\n       case when (p_data->'archive') is not distinct from 'true'::jsonb\n          and p_data->>'publicationPolicy'='year-v1' then 365 else 30 end)")
      .replaceAll('a.archived,today,active_window.slot)', 'a.archived,today,active_window.slot,a.publication_window_days)')
      .replace(/\b(from|join)(\s+)pajang_private\.answers\b/gi, '$1$2pajang_private.visible_answers')
      .replace(/\b(from|join)(\s+)pajang_private\.messages\b/gi, '$1$2pajang_private.visible_messages');
    await db.exec(definition);
  }
  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const source = () => db.query(`select pg_get_functiondef(p.oid) as definition,p.proacl
    from pg_proc p where p.oid='public.pajang_member(text,jsonb)'::regprocedure`);
  const before = (await source()).rows[0];
  // Ensure permissive project defaults cannot expose new tables or internal helpers.
  await db.exec('alter default privileges grant execute on functions to anon,authenticated,service_role; alter default privileges grant all on tables to anon,authenticated,service_role;');
  await db.exec(clock(migration));
  const after = (await source()).rows[0];
  assert.deepEqual(after, { ...before, definition: before.definition.replace(oldLimit,newLimit)
    .replace(' return result;\nend;', ' return result||pajang_private.signal_quota(u,today);\nend;') });
  const admin = async fn => {
    await db.exec('reset role');
    return fn();
  };
  const login = async (actor, role = 'authenticated', claims = {}) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ ...claims,sub:actor?.id || null })]);
    await db.exec(`set role ${role}`);
  };
  const seed = async (coins = 100, options = {}) => admin(async () => {
    const actor = { id:randomUUID(),person:randomUUID() };
    await db.query('insert into auth.users(id,is_anonymous) values($1,$2)', [actor.id,!!options.anonymous]);
    await db.query("insert into public.profiles values($1,'검사 회원')", [actor.id]);
    if (!options.noWallet) await db.query('insert into public.user_private(user_id,coins,banned,pending_deletion) values($1,$2,$3,$4)',
      [actor.id,coins,!!options.banned,!!options.pendingDeletion]);
    await db.query('insert into ojjuda_account_internal.member_identity values($1,$2,null)', [actor.id,options.minor?'2012-01-01':'1990-01-01']);
    if (!options.unjoined) await db.query("insert into pajang_private.people(id,owner_id,name,region,interest) values($1,$2,'검사 회원','서울특별시','walk')", [actor.person,actor.id]);
    return actor;
  });
  const member = (action = 'state', data = {}) => value('select public.pajang_member($1,$2) as value', [action,data]);
  const wallet = () => value('select public.pajang_signal_wallet() as value');
  const purchase = (actor, offer, requestId = randomUUID(), verifyOnly = false, overrides = {}) => {
    const args = {pack:offer.id,requestId,expectedUser:actor.id,price:offer.price,revision:offer.revision,verifyOnly,...overrides};
    return value('select public.pajang_signal_purchase($1,$2,$3,$4,$5,$6) as value',
      [args.pack,args.requestId,args.expectedUser,args.price,args.revision,args.verifyOnly]);
  };
  const setTime = value => admin(() => db.query("select set_config('pajang.test_now',$1,false)", [value]));
  const peers = [];
  for (let i=0;i<12;i++) peers.push(await seed());
  const publish = (day = '2026-11-19', slot = 'am') => admin(async () => {
    for (const peer of peers) await db.query(`insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived)
      values($1,$2,$3,'검사 답변',1,'검사 질문',true) on conflict do nothing`, [peer.person,day,slot]);
  });
  await publish();
  const signal = async (index, data = {}) => {
    const entry = await member('entry');
    return member('signal',{peer:peers[index].person,day:entry.day,slot:entry.slot,...data});
  };
  const free = async actor => {
    await login(actor);
    for (let i=0;i<3;i++) await signal(i);
    return wallet();
  };
  const snapshot = actor => admin(() => value(`select jsonb_build_object(
    'coins',(select coins from public.user_private where user_id=$1),
    'paid',coalesce((select paid_remaining from pajang_private.signal_balances where user_id=$1),0),
    'receipts',(select count(*)::integer from ojjuda_note_internal.spend_requests where user_id=$1),
    'signals',(select count(*)::integer from pajang_private.signals s join pajang_private.people p on p.id=s.src where p.owner_id=$1)) as value`, [actor.id]));
  return {db,value,admin,login,seed,member,wallet,purchase,setTime,peers,publish,signal,free,snapshot};
}

test('extra signals preserve deployed rules and keep unconfirmed offers disabled', async t => {
  const f = await fixture(t);
  const {db,value,admin,login,seed,member,wallet,purchase,setTime,peers,publish,signal,free,snapshot} = f;
  // These amounts are test examples only. Production seeds contain no prices.
  const exampleOffers = [
    {id:'signal_1',quantity:1,price:10,revision:2},
    {id:'signal_3',quantity:3,price:29,revision:2},
    {id:'signal_5',quantity:5,price:48,revision:2}
  ];
  await t.test('installation changes no member balance and cannot sell an unconfirmed offer', async () => {
    const actor = await seed();
    await login(actor);
    assert.deepEqual(await wallet(), {ok:true,coins:100,freeRemaining:3,paidRemaining:0,remaining:3,purchasingEnabled:false,offers:[]});
    assert.equal((await member()).purchasingEnabled,false);
    assert.equal((await purchase(actor,exampleOffers[0])).reason,'purchase_unavailable');
    await free(actor);
    await assert.rejects(() => signal(3), /오늘 보낼 신호를 모두/);
    assert.deepEqual(await snapshot(actor), {coins:100,paid:0,receipts:0,signals:3});
    assert.equal(await value('select count(*)::integer as value from pajang_private.signal_packs where price is not null or enabled'),0);
  });
  await admin(() => db.exec("update pajang_private.signal_packs set price=case quantity when 1 then 10 when 3 then 29 else 48 end,enabled=true"));
  await t.test('only explicit purchases after the three free signals add each configured pack', async () => {
    for (const offer of exampleOffers) {
      const actor = await seed();
      await login(actor);
      assert.deepEqual((await wallet()).offers,exampleOffers);
      assert.equal((await purchase(actor,offer)).reason,'free_remaining');
      await free(actor);
      const requestId = randomUUID(), receipt = await purchase(actor,offer,requestId);
      assert.equal(receipt.ok,true);
      for (const [key,expected] of Object.entries({requestId,pack:offer.id,quantity:offer.quantity,price:offer.price,
        revision:offer.revision,charged:offer.price,replayed:false,coins:100-offer.price,
        freeRemaining:0,paidRemaining:offer.quantity,remaining:offer.quantity,purchasingEnabled:true})) assert.equal(receipt[key],expected,key);
      assert.equal((await member()).remaining,offer.quantity);
      assert.deepEqual(await snapshot(actor), {coins:100-offer.price,paid:offer.quantity,receipts:1,signals:3});
      const ledger = await value('select result as value from ojjuda_note_internal.spend_requests where request_id=$1', [requestId]);
      assert.deepEqual(ledger,receipt);
    }
  });
  await t.test('receipt retries and read-only recovery never add credits or charge twice', async () => {
    const actor = await seed(); await free(actor);
    const requestId=randomUUID(),offer=exampleOffers[1];
    const replies = await Promise.all(Array.from({length:6},()=>purchase(actor,offer,requestId)));
    assert.equal(replies.filter(x=>!x.replayed).length,1);
    assert.equal(replies.reduce((sum,x)=>sum+x.charged,0),offer.price);
    await signal(3);
    await db.exec('begin read only');
    try {
      const recovered=await purchase(actor,offer,requestId,true);
      assert.equal(recovered.replayed,true); assert.equal(recovered.charged,0);
      assert.equal(recovered.paidRemaining,2);
      assert.equal((await purchase(actor,offer,randomUUID(),true)).reason,'not_found');
    } finally {await db.exec('rollback');}
    assert.deepEqual(await snapshot(actor), {coins:71,paid:2,receipts:1,signals:4});
    await login(actor);
    assert.equal((await purchase(actor,exampleOffers[0],requestId)).reason,'request_conflict');
    const other=await seed();await free(other);
    assert.equal((await purchase(other,offer,requestId)).reason,'request_conflict');
    assert.deepEqual(await snapshot(other), {coins:100,paid:0,receipts:0,signals:3});
    const otherProductId=randomUUID();
    await admin(()=>db.query("insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values($1,$2,'another_product',1,'{}')",[otherProductId,actor.id]));
    await login(actor);
    assert.equal((await purchase(actor,offer,otherProductId)).reason,'request_conflict');
    assert.deepEqual(await snapshot(actor), {coins:71,paid:2,receipts:2,signals:4});
  });
  await t.test('competing request IDs cannot overdraw the shared wallet', async () => {
    const actor=await seed(15);await free(actor);
    const replies=await Promise.all([purchase(actor,exampleOffers[0]),purchase(actor,exampleOffers[0])]);
    assert.equal(replies.filter(x=>x.ok).length,1);
    assert.equal(replies.find(x=>!x.ok).reason,'coins');
    assert.deepEqual(await snapshot(actor), {coins:5,paid:1,receipts:1,signals:3});
    const low=await seed(9);await free(low);
    assert.equal((await purchase(low,exampleOffers[0])).reason,'coins');
    assert.deepEqual(await snapshot(low), {coins:9,paid:0,receipts:0,signals:3});
  });
  await t.test('price and revision changes require a fresh confirmation while old receipts remain recoverable', async () => {
    const actor=await seed();await free(actor);
    const requestId=randomUUID();await purchase(actor,exampleOffers[0],requestId);
    await admin(()=>db.exec("update pajang_private.signal_packs set price=11 where id='signal_1'"));
    await login(actor);
    const changed=await purchase(actor,exampleOffers[0]);
    assert.equal(changed.reason,'price_changed');
    assert.deepEqual(changed.offers[0],{id:'signal_1',quantity:1,price:11,revision:3});
    assert.equal((await purchase(actor,exampleOffers[0],requestId)).charged,0);
    assert.equal((await purchase(actor,{...exampleOffers[0],price:11})).reason,'price_changed');
    const fresh=await purchase(actor,changed.offers[0]);assert.equal(fresh.charged,11);
    await admin(()=>db.exec("update pajang_private.signal_packs set enabled=false where id='signal_1'"));
    await login(actor);
    assert.equal((await purchase(actor,changed.offers[0])).reason,'purchase_unavailable');
    assert.equal((await purchase(actor,exampleOffers[0],requestId,true)).charged,0);
    assert.equal((await signal(3)).paidRemaining,1,'disabling new sales does not cancel purchased credits');
    assert.deepEqual(await snapshot(actor),{coins:79,paid:1,receipts:2,signals:4});
    await admin(()=>db.exec("update pajang_private.signal_packs set price=10,enabled=true where id='signal_1'"));
    exampleOffers[0].revision=5;
  });
  await t.test('duplicate, blocked, invisible and invalid sends never consume an extra credit', async () => {
    const actor=await seed();await free(actor);await purchase(actor,exampleOffers[2]);
    assert.equal((await signal(0)).paidRemaining,5,'retry of a free signal is free');
    const sends=await Promise.all([signal(3),signal(3)]);
    assert.ok(sends.every(x=>x.paidRemaining===4));
    await assert.rejects(()=>signal(4,{note:'가'.repeat(121)}),error=>error.code==='23514');
    assert.equal((await wallet()).paidRemaining,4,'insert failure rolls the debit back');
    await member('block',{peer:peers[4].person});
    await assert.rejects(()=>signal(4),error=>error.code==='42501');
    await admin(()=>db.query('insert into pajang_private.test_hidden_answers values($1,$2,$3)',[peers[5].person,'2026-11-19','am']));
    await login(actor);
    await assert.rejects(()=>signal(5,{answerDay:'2026-11-19',answerSlot:'am'}),error=>error.code==='PT409');
    await assert.rejects(()=>signal(6,{answerDay:'2025-01-01',answerSlot:'am'}),error=>error.code==='PT409');
    await assert.rejects(()=>signal(6,{peer:actor.person}),error=>error.code==='42501');
    await assert.rejects(()=>signal(6,{peer:randomUUID()}),error=>error.code==='42501');
    assert.deepEqual(await snapshot(actor),{coins:52,paid:4,receipts:1,signals:4});
    await admin(()=>db.exec('delete from pajang_private.test_hidden_answers'));
  });
  await t.test('Seoul midnight renews free signals before carried-over credits and never buys automatically', async () => {
    const actor=await seed();await free(actor);await purchase(actor,exampleOffers[1]);
    await setTime('2026-11-19T14:59:59Z');await publish('2026-11-19','pm');await login(actor);
    assert.equal((await signal(3)).paidRemaining,2);
    await setTime('2026-11-19T15:00:00Z');await publish('2026-11-20','am');await login(actor);
    assert.deepEqual(Object.fromEntries(Object.entries(await wallet()).filter(([key])=>/Remaining|^remaining$/.test(key))),
      {freeRemaining:3,paidRemaining:2,remaining:5});
    for(let i=4;i<7;i++) assert.equal((await signal(i)).paidRemaining,2);
    assert.equal((await signal(7)).paidRemaining,1);
    assert.deepEqual(await snapshot(actor),{coins:71,paid:1,receipts:1,signals:8});
    await login(actor);await member('delete');
    await member('participate',{consent:true});
    assert.equal((await wallet()).paidRemaining,1,'paid credits belong to the account, not a disposable profile');
    await setTime('2026-11-19T01:00:00Z');
  });
  await t.test('receipt or credit-write failure rolls back the wallet debit', async () => {
    const actor=await seed();await free(actor);
    await admin(()=>db.exec(`create function public.signal_test_reject_receipt() returns trigger language plpgsql as $$
      begin if new.kind='pajang_signal_pack_v1' then raise exception 'test_receipt_failure';end if;return new;end$$;
      create trigger signal_test_reject_receipt before insert on ojjuda_note_internal.spend_requests
      for each row execute function public.signal_test_reject_receipt();`));
    await login(actor);
    await assert.rejects(()=>purchase(actor,exampleOffers[0]),/test_receipt_failure/);
    assert.deepEqual(await snapshot(actor),{coins:100,paid:0,receipts:0,signals:3});
    await admin(()=>db.exec('drop trigger signal_test_reject_receipt on ojjuda_note_internal.spend_requests'));
    await admin(()=>db.query('insert into pajang_private.signal_balances values($1,2147483647)',[actor.id]));
    await login(actor);
    await assert.rejects(()=>purchase(actor,exampleOffers[0]),error=>error.code==='22003');
    assert.deepEqual(await snapshot(actor),{coins:100,paid:2147483647,receipts:0,signals:3});
  });
  await t.test('account guards and private permissions protect both quota and payment state', async () => {
    const actor=await seed();await free(actor);
    assert.equal((await purchase(actor,exampleOffers[0],randomUUID(),false,{expectedUser:randomUUID()})).reason,'account_changed');
    for(const overrides of [{price:0},{revision:0},{pack:'custom'},{requestId:null},{verifyOnly:null}]) {
      assert.equal((await purchase(actor,exampleOffers[0],randomUUID(),false,overrides)).reason,'invalid');
    }
    for(const options of [{anonymous:true},{minor:true},{banned:true},{pendingDeletion:true},{unjoined:true}]) {
      const invalid=await seed(100,options);await login(invalid);
      await assert.rejects(()=>wallet(),error=>error.code==='42501');
      await assert.rejects(()=>purchase(invalid,exampleOffers[0]),error=>error.code==='42501');
    }
    await login(actor,'authenticated',{is_anonymous:true});
    await assert.rejects(()=>wallet(),error=>error.code==='42501');
    for(const role of ['anon','service_role']) {
      await login(actor,role);
      await assert.rejects(()=>wallet(),error=>error.code==='42501');
      await assert.rejects(()=>purchase(actor,exampleOffers[0]),error=>error.code==='42501');
    }
    await login(null);await assert.rejects(()=>wallet(),error=>error.code==='42501');
    const noWallet=await seed(0,{noWallet:true});await login(noWallet);
    assert.equal((await wallet()).reason,'wallet_unavailable');
    assert.equal((await purchase(noWallet,exampleOffers[0])).reason,'wallet_unavailable');
    await admin(async()=>{
      for(const relation of ['pajang_private.signal_packs','pajang_private.signal_balances']) {
        assert.equal(await value('select relrowsecurity as value from pg_class where oid=$1::regclass',[relation]),true);
        for(const role of ['anon','authenticated','service_role']) {
          for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,relation,privilege]),false);
        }
      }
      const internal=(await db.query("select oid::regprocedure::text as name from pg_proc where pronamespace='pajang_private'::regnamespace and proname in('signal_offer_revision','signal_offers','signal_quota','require_signal_member')")).rows;
      assert.equal(internal.length,4);
      for(const fn of internal)for(const role of ['anon','authenticated','service_role']) assert.equal(await value('select has_function_privilege($1,$2,\'execute\') as value',[role,fn.name]),false);
    });
  });
});

test('the quota patch also applies to the clean repository function without replacing its other behavior', async t => {
  const f=await fixture(t,false);
  const actor=await f.seed();await f.login(actor);
  const state=await f.member();
  assert.equal(state.remaining,3);assert.equal(state.freeRemaining,3);assert.equal(state.paidRemaining,0);
  assert.equal(state.purchasingEnabled,false);
});

test('six approved signal packs activate without changing balances, receipts or other payment logic', async t => {
  const {db,value,admin,login,seed,member,wallet,purchase,signal,free,snapshot}=await fixture(t);
  await t.test('the deployed unpriced preparation becomes six enabled offers with current revisions',async()=>{
    await db.exec('begin');
    try{
      await db.exec(activation);
      assert.deepEqual((await db.query('select id,quantity,price,enabled,revision from pajang_private.signal_packs order by quantity')).rows,[
        {id:'signal_1',quantity:1,price:10,enabled:true,revision:2},
        {id:'signal_3',quantity:3,price:28,enabled:true,revision:2},
        {id:'signal_5',quantity:5,price:45,enabled:true,revision:2},
        {id:'signal_10',quantity:10,price:85,enabled:true,revision:1},
        {id:'signal_20',quantity:20,price:160,enabled:true,revision:1},
        {id:'signal_30',quantity:30,price:225,enabled:true,revision:1}
      ]);
      assert.equal(await value('select count(*)::integer as value from pajang_private.signal_balances'),0);
      assert.equal(await value("select count(*)::integer as value from ojjuda_note_internal.spend_requests where kind='pajang_signal_pack_v1'"),0);
    }finally{await db.exec('rollback');}
  });
  const legacyOffers=[
    {id:'signal_1',quantity:1,price:10,revision:2},
    {id:'signal_3',quantity:3,price:29,revision:2},
    {id:'signal_5',quantity:5,price:48,revision:2}
  ];
  // Model earlier successful receipts as well as stale quotes; these prices are historical fixtures.
  await admin(()=>db.exec("update pajang_private.signal_packs set price=case quantity when 1 then 10 when 3 then 29 else 48 end,enabled=true"));
  const legacy=[];
  for(const offer of legacyOffers){
    const actor=await seed(500);await free(actor);
    const requestId=randomUUID(),receipt=await purchase(actor,offer,requestId);
    legacy.push({actor,offer,requestId,receipt,before:await snapshot(actor)});
  }
  const staleBuyer=await seed(500);await free(staleBuyer);
  const staleBuyerBefore=await snapshot(staleBuyer);
  const functions=()=>db.query(`select p.oid::regprocedure::text as signature,
    pg_get_functiondef(p.oid) as definition,p.proacl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='pajang_private' and p.proname in('signal_quota','signal_offers','signal_offer_revision','require_signal_member',
      'exchange_fields','exchange_profile','exchange_can_view','clear_pair','answer_is_visible'))
      or (n.nspname='public' and p.proname in('pajang_member','pajang_exchange','pajang_signal_wallet','pajang_signal_purchase'))
    order by signature`);
  const definitionsBefore=await admin(async()=>(await functions()).rows);
  const rowsBefore=await value(`select jsonb_build_object(
    'balances',(select jsonb_agg(to_jsonb(b) order by user_id) from pajang_private.signal_balances b),
    'wallets',(select jsonb_agg(to_jsonb(w) order by user_id) from public.user_private w),
    'receipts',(select jsonb_agg(to_jsonb(s) order by request_id) from ojjuda_note_internal.spend_requests s)) as value`);
  const triggerBefore=await value("select pg_get_triggerdef(oid) as value from pg_trigger where tgrelid='pajang_private.signal_packs'::regclass and tgname='signal_offer_revision'");
  await db.exec(activation);
  const approved=[
    {id:'signal_1',quantity:1,price:10,revision:2},
    {id:'signal_3',quantity:3,price:28,revision:3},
    {id:'signal_5',quantity:5,price:45,revision:3},
    {id:'signal_10',quantity:10,price:85,revision:1},
    {id:'signal_20',quantity:20,price:160,revision:1},
    {id:'signal_30',quantity:30,price:225,revision:1}
  ];

  await t.test('only offer configuration, the two ID/quantity checks and one RPC validation expression change',async()=>{
    const definitionsAfter=(await functions()).rows;
    assert.deepEqual(definitionsAfter,definitionsBefore.map(fn=>fn.signature.startsWith('pajang_signal_purchase(')
      ?{...fn,definition:fn.definition.replace("p_pack not in ('signal_1','signal_3','signal_5')",
        "p_pack not in ('signal_1','signal_3','signal_5','signal_10','signal_20','signal_30')")}:fn));
    assert.deepEqual(await value(`select jsonb_build_object(
      'balances',(select jsonb_agg(to_jsonb(b) order by user_id) from pajang_private.signal_balances b),
      'wallets',(select jsonb_agg(to_jsonb(w) order by user_id) from public.user_private w),
      'receipts',(select jsonb_agg(to_jsonb(s) order by request_id) from ojjuda_note_internal.spend_requests s)) as value`),rowsBefore);
    assert.equal(await value("select pg_get_triggerdef(oid) as value from pg_trigger where tgrelid='pajang_private.signal_packs'::regclass and tgname='signal_offer_revision'"),triggerBefore);
    const configs=await value("select jsonb_agg(jsonb_build_object('id',id,'quantity',quantity,'price',price,'revision',revision) order by quantity) as value from pajang_private.signal_packs where enabled");
    assert.deepEqual(configs,approved);
    await assert.rejects(()=>db.exec("insert into pajang_private.signal_packs(id,quantity,price,enabled) values('signal_99',99,1,true)"),error=>error.code==='23514');
    await assert.rejects(()=>db.exec("update pajang_private.signal_packs set quantity=11 where id='signal_10'"),error=>error.code==='23514');
    await assert.rejects(()=>db.exec("update pajang_private.signal_packs set price=null where id='signal_10'"),error=>error.code==='23514');
  });
  await t.test('all six configured packs credit the quoted quantity and debit their approved price',async()=>{
    for(const offer of approved){
      const actor=await seed(500);await login(actor);
      assert.deepEqual((await wallet()).offers,approved);
      assert.equal((await member()).purchasingEnabled,true);
      assert.equal((await purchase(actor,offer)).reason,'free_remaining');
      await free(actor);
      const receipt=await purchase(actor,offer);
      assert.equal(receipt.ok,true);assert.equal(receipt.quantity,offer.quantity);
      assert.equal(receipt.price,offer.price);assert.equal(receipt.charged,offer.price);
      assert.equal(receipt.paidRemaining,offer.quantity);assert.equal(receipt.remaining,offer.quantity);
      assert.equal(receipt.coins,500-offer.price);assert.equal(receipt.revision,offer.revision);
      assert.equal((await signal(3)).paidRemaining,offer.quantity-1);
      assert.deepEqual(await snapshot(actor),{coins:500-offer.price,paid:offer.quantity-1,receipts:1,signals:4});
    }
  });
  await t.test('stale pre-activation prices cannot buy new packs and exact prior receipts still recover for free',async()=>{
    await login(staleBuyer);
    for(const offer of legacyOffers.slice(1)){
      const stale=await purchase(staleBuyer,offer);
      assert.equal(stale.reason,'price_changed');assert.deepEqual(stale.offers,approved);
    }
    assert.deepEqual(await snapshot(staleBuyer),staleBuyerBefore);
    for(const {actor,offer,requestId,receipt,before} of legacy){
      await login(actor);
      const replay=await purchase(actor,offer,requestId,true);
      assert.equal(replay.ok,true);assert.equal(replay.replayed,true);assert.equal(replay.charged,0);
      assert.equal(replay.price,receipt.price);assert.equal(replay.quantity,receipt.quantity);
      assert.equal(replay.revision,receipt.revision);assert.deepEqual(replay.offers,approved);
      assert.deepEqual(await snapshot(actor),before);
      assert.deepEqual(await value('select result as value from ojjuda_note_internal.spend_requests where request_id=$1',[requestId]),receipt);
    }
  });
  await t.test('new large packs retain insufficient-funds, account, duplicate-request and stale-revision guards',async()=>{
    const actor=await seed(224);await free(actor);
    assert.equal((await purchase(actor,approved[5])).reason,'coins');
    assert.equal((await purchase(actor,approved[3],randomUUID(),false,{expectedUser:randomUUID()})).reason,'account_changed');
    assert.equal((await purchase(actor,approved[3],randomUUID(),false,{price:1})).reason,'price_changed');
    assert.equal((await purchase(actor,approved[3],randomUUID(),false,{revision:2})).reason,'price_changed');
    const requestId=randomUUID();
    const replies=await Promise.all([purchase(actor,approved[3],requestId),purchase(actor,approved[3],requestId)]);
    assert.equal(replies.filter(x=>!x.replayed).length,1);
    assert.equal(replies.reduce((sum,x)=>sum+x.charged,0),85);
    assert.deepEqual(await snapshot(actor),{coins:139,paid:10,receipts:1,signals:3});
    await login(actor);
    assert.equal((await purchase(actor,approved[4],requestId)).reason,'request_conflict');
  });
});

test('prepaid signals can be bought with any free balance while free sends and payment safeguards remain intact', async t => {
  const {db,value,admin,login,seed,member,wallet,purchase,setTime,publish,signal,free,snapshot}=await fixture(t);
  await db.exec(activation);
  const legacy=await seed(500);await free(legacy);
  const offers=(await wallet()).offers,legacyRequest=randomUUID();
  const legacyReceipt=await purchase(legacy,offers[1],legacyRequest);
  const freeLimit="  if (quota->>'freeRemaining')::integer>0 then\n    return quota||jsonb_build_object('ok',false,'reason','free_remaining');\n  end if;";
  const functions=()=>db.query(`select p.oid::regprocedure::text as signature,
    pg_get_functiondef(p.oid) as definition,p.proacl,p.prosecdef,p.proconfig,p.proowner
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='pajang_private' or (n.nspname='public' and p.proname like 'pajang_%')
    order by signature`);
  const privateRelations=()=>db.query(`select oid::regclass::text as relation,relacl,relrowsecurity
    from pg_class where relnamespace='pajang_private'::regnamespace order by relation`);
  const data=()=>value(`select jsonb_build_object(
    'wallets',(select jsonb_agg(to_jsonb(w) order by user_id) from public.user_private w),
    'balances',(select jsonb_agg(to_jsonb(b) order by user_id) from pajang_private.signal_balances b),
    'receipts',(select jsonb_agg(to_jsonb(r) order by request_id) from ojjuda_note_internal.spend_requests r),
    'offers',(select jsonb_agg(to_jsonb(p) order by quantity) from pajang_private.signal_packs p),
    'signals',(select jsonb_agg(to_jsonb(s) order by src,dst,day) from pajang_private.signals s)) as value`);
  const before=await admin(async()=>({functions:(await functions()).rows,relations:(await privateRelations()).rows,data:await data()}));
  await db.exec(clock(anytimePurchase));

  await t.test('the migration only removes the free-purchase gate and preserves ACLs, configuration and all saved data',async()=>{
    assert.deepEqual((await functions()).rows,before.functions.map(fn=>fn.signature.startsWith('pajang_signal_purchase(')
      ?{...fn,definition:fn.definition.replace(freeLimit,'')}:fn));
    assert.deepEqual((await privateRelations()).rows,before.relations);
    assert.deepEqual(await data(),before.data);
    await login(legacy);await db.exec('begin read only');
    try{
      const replay=await purchase(legacy,offers[1],legacyRequest,true);
      assert.equal(replay.replayed,true);assert.equal(replay.charged,0);
      assert.equal(replay.price,legacyReceipt.price);assert.equal(replay.quantity,legacyReceipt.quantity);
    }finally{await db.exec('rollback');}
    assert.deepEqual(await admin(data),before.data,'recovering a legacy receipt leaves every saved row unchanged');
  });

  await t.test('all six packs can be bought with zero, one, two or three free signals without consuming that allowance',async()=>{
    for(const freeRemaining of [0,1,2,3])for(const offer of offers){
      const actor=await seed(500);await login(actor);
      for(let i=0;i<3-freeRemaining;i++)await signal(i);
      assert.equal((await wallet()).freeRemaining,freeRemaining);
      const receipt=await purchase(actor,offer);
      assert.equal(receipt.ok,true,`${offer.id} with ${freeRemaining} free signals`);
      assert.equal(receipt.quantity,offer.quantity);assert.equal(receipt.charged,offer.price);
      assert.equal(receipt.revision,offer.revision);assert.equal(receipt.coins,500-offer.price);
      assert.equal(receipt.freeRemaining,freeRemaining);assert.equal(receipt.paidRemaining,offer.quantity);
      assert.equal(receipt.remaining,freeRemaining+offer.quantity);
      assert.equal((await member()).remaining,freeRemaining+offer.quantity);
      assert.deepEqual(await snapshot(actor),{coins:500-offer.price,paid:offer.quantity,receipts:1,signals:3-freeRemaining});
    }
  });

  await t.test('sending consumes free signals first, duplicate sends cost nothing and midnight preserves purchased credits',async()=>{
    const actor=await seed(500);await login(actor);
    const requestId=randomUUID();await purchase(actor,offers[1],requestId);
    for(let i=0;i<3;i++){
      const sent=await signal(i);
      assert.equal(sent.freeRemaining,2-i);assert.equal(sent.paidRemaining,3);
    }
    assert.equal((await signal(3)).paidRemaining,2);
    assert.equal((await signal(3)).paidRemaining,2,'a repeated send does not spend another purchased signal');
    await setTime('2026-11-19T15:00:00Z');await publish('2026-11-20','am');await login(actor);
    const renewed=await wallet();
    assert.equal(renewed.freeRemaining,3);assert.equal(renewed.paidRemaining,2);assert.equal(renewed.remaining,5);
    await db.exec('begin read only');
    try{
      const replay=await purchase(actor,offers[1],requestId,true);
      assert.equal(replay.charged,0);assert.equal(replay.freeRemaining,3);assert.equal(replay.paidRemaining,2);
    }finally{await db.exec('rollback');}
    const prepaid=await purchase(actor,offers[0]);
    assert.equal(prepaid.freeRemaining,3);assert.equal(prepaid.paidRemaining,3);
    for(let i=4;i<7;i++)assert.equal((await signal(i)).paidRemaining,3);
    assert.equal((await signal(7)).paidRemaining,2);
    assert.deepEqual(await snapshot(actor),{coins:462,paid:2,receipts:2,signals:8});
    await setTime('2026-11-19T01:00:00Z');
  });

  await t.test('prepaid retries and receipt-only recovery never duplicate a debit or a signal credit',async()=>{
    const actor=await seed(500);await login(actor);await signal(0);
    const requestId=randomUUID(),offer=offers[2];
    const replies=await Promise.all(Array.from({length:4},()=>purchase(actor,offer,requestId)));
    assert.equal(replies.filter(reply=>!reply.replayed).length,1);
    assert.equal(replies.reduce((total,reply)=>total+reply.charged,0),offer.price);
    assert.ok(replies.every(reply=>reply.freeRemaining===2&&reply.paidRemaining===5));
    await db.exec('begin read only');
    try{
      assert.equal((await purchase(actor,offer,requestId,true)).charged,0);
      assert.equal((await purchase(actor,offer,randomUUID(),true)).reason,'not_found');
    }finally{await db.exec('rollback');}
    assert.equal((await purchase(actor,offers[0],requestId)).reason,'request_conflict');
    assert.deepEqual(await snapshot(actor),{coins:455,paid:5,receipts:1,signals:1});
  });

  await t.test('having free signals does not bypass price, revision, identity, funds or disabled-offer checks',async()=>{
    const actor=await seed(500);await login(actor);
    for(const overrides of [{price:1},{revision:99}])
      assert.equal((await purchase(actor,offers[1],randomUUID(),false,overrides)).reason,'price_changed');
    assert.equal((await purchase(actor,offers[1],randomUUID(),false,{expectedUser:randomUUID()})).reason,'account_changed');
    assert.equal((await purchase(actor,offers[1],randomUUID(),false,{requestId:null})).reason,'invalid');
    assert.deepEqual(await snapshot(actor),{coins:500,paid:0,receipts:0,signals:0});
    const low=await seed(9);await login(low);
    assert.equal((await purchase(low,offers[0])).reason,'coins');
    assert.deepEqual(await snapshot(low),{coins:9,paid:0,receipts:0,signals:0});
    await admin(()=>db.exec("update pajang_private.signal_packs set enabled=false where id='signal_1'"));
    await login(actor);assert.equal((await purchase(actor,offers[0])).reason,'purchase_unavailable');
    assert.deepEqual(await snapshot(actor),{coins:500,paid:0,receipts:0,signals:0});
  });

  await t.test('prepaid purchase retains age, membership and role boundaries',async()=>{
    for(const options of [{anonymous:true},{minor:true},{banned:true},{pendingDeletion:true},{unjoined:true}]){
      const invalid=await seed(500,options);await login(invalid);
      await assert.rejects(()=>purchase(invalid,offers[1]),error=>error.code==='42501');
      assert.deepEqual(await snapshot(invalid),{coins:500,paid:0,receipts:0,signals:0});
    }
    const actor=await seed(500);
    for(const role of ['anon','service_role']){
      await login(actor,role);await assert.rejects(()=>purchase(actor,offers[1]),error=>error.code==='42501');
    }
    await login(null);await assert.rejects(()=>purchase(actor,offers[1]),error=>error.code==='42501');
    const noWallet=await seed(0,{noWallet:true});await login(noWallet);
    assert.equal((await purchase(noWallet,offers[1])).reason,'wallet_unavailable');
  });
});
