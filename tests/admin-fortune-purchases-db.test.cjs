const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

test('administrator fortune purchase history is a bounded read-only ledger projection', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = '00000000-0000-4000-8000-000000000001';
  const a = '00000000-0000-4000-8000-00000000000a';
  const b = '00000000-0000-4000-8000-00000000000b';
  const missing = '00000000-0000-4000-8000-00000000000c';
  const malformed = '00000000-0000-4000-8000-00000000000d';
  const requestId = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await db.exec(`
    set timezone='UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create table public.app_admins(user_id uuid primary key);
    create table public.profiles(id uuid primary key,nickname text);
    create table public.user_private(user_id uuid primary key,coins integer);
    create function public.is_admin() returns boolean language sql stable security definer
      set search_path='' as $$
      select case when current_setting('test.null_admin',true)='true' then null
        else exists(select 1 from public.app_admins where user_id=auth.uid()) end;
    $$;
    insert into public.app_admins values('${admin}');
    insert into public.profiles values('${admin}','운영자'),('${a}','달100%_님'),
      ('${b}','BuyerALICE'),('${malformed}','MalformedYear');
    insert into public.user_private values('${a}',123),('${b}',456);
    create schema ojjuda_note_internal;
    create table ojjuda_note_internal.spend_requests(
      request_id uuid primary key,user_id uuid not null,kind text not null,
      coins integer not null,result jsonb not null,created_at timestamptz not null
    );
    alter table ojjuda_note_internal.spend_requests enable row level security;
    revoke all on schema ojjuda_note_internal from public,anon,authenticated,service_role;
    revoke all on ojjuda_note_internal.spend_requests from public,anon,authenticated,service_role;
    -- Even permissive function defaults may not expose the new administrator RPC.
    alter default privileges grant execute on functions to anon,authenticated,service_role;
  `);
  const insert = async (n,user,kind,coins,result,createdAt='2026-11-13T02:00:00Z') => {
    await db.query(`insert into ojjuda_note_internal.spend_requests
      (request_id,user_id,kind,coins,result,created_at) values($1,$2,$3,$4,$5,$6)`,
    [requestId(n),user,kind,coins,result,createdAt]);
  };
  await insert(1,a,'tarot_reading_v1',30,{ok:true,topic:'overall',price:999,coins:9999,drawn:[1,2,3],birth:'not-for-admin'},'2026-11-12T15:00:00Z');
  await insert(2,a,'tarot_reading_v1',10,{ok:true,topic:'love'},'2026-11-12T14:59:59.999999Z');
  await insert(3,b,'saju_reading_v1',10,{ok:true,chart_key:'private-fingerprint'},'2026-11-13T14:59:59.999999Z');
  await insert(4,b,'saju_reading_v2',10,{ok:true,topic:'lifelong',year:0},'2026-11-13T15:00:00Z');
  await insert(5,b,'saju_reading_v2',10,{ok:true,topic:'yearly',year:2026});
  await insert(6,b,'saju_reading_v2',10,{ok:true,topic:'monthly',year:2026});
  await insert(7,b,'saju_reading_all_v3',0,{ok:true,charged:30,items:[4,5,6]});
  await insert(8,a,'card_photo',7,{ok:true});
  await insert(9,a,'tarot_reading_v1',10,{ok:false,topic:'overall'});
  await insert(10,a,'tarot_reading_v1',10,{topic:'overall'});
  await insert(11,b,'saju_reading_v2',0,{ok:true,topic:'yearly',year:2026});
  await insert(12,b,'saju_reading_v2',-10,{ok:true,topic:'monthly',year:2026});
  await insert(13,missing,'tarot_reading_v1',10,{ok:true,topic:'money'},'2026-11-14T04:00:00Z');
  await insert(14,a,'tarot_reading_v1',10,{ok:true,topic:'work'},'2026-11-14T04:00:00Z');
  await insert(15,a,'tarot_reading_v1',10,{ok:'true',topic:'overall'});
  await insert(16,a,'tarot_reading_v2',10,{ok:true,topic:'overall'});
  await insert(17,b,'saju_reading_all_v3',30,{ok:true,charged:30,items:[4,5,6]});
  await db.exec(fs.readFileSync(path.join(__dirname,
    '../supabase/migrations/20261112234851_admin_fortune_purchase_history.sql'), 'utf8'));

  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const as = async (actor,fn,role='authenticated') => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor || '']);
    await db.exec(`set role ${role}`);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const query = (product='all',search='',from=null,to=null,limit=30,offset=0) => value(
    'select public.admin_fortune_purchases($1,$2,$3,$4,$5,$6) as value',
    [product,search,from,to,limit,offset]);
  const list = (...args) => as(admin, () => query(...args));
  const snapshot = () => value(`select jsonb_build_object(
    'ledger',(select jsonb_agg(to_jsonb(s) order by request_id) from ojjuda_note_internal.spend_requests s),
    'wallets',(select jsonb_agg(to_jsonb(w) order by user_id) from public.user_private w),
    'profiles',(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p)
  ) as value`);
  const baseline = await snapshot();

  await t.test('only current authenticated administrators can call either function', async () => {
    const signatures = [
      'public.admin_fortune_purchases(text,text,date,date,integer,integer)',
      'ojjuda_admin_internal.fortune_purchases(text,text,date,date,integer,integer)'
    ];
    for (const signature of signatures) {
      for (const role of ['anon','service_role']) {
        assert.equal(await value('select has_function_privilege($1,$2,\'execute\') as value',[role,signature]),false);
      }
      assert.equal(await value('select has_function_privilege(\'authenticated\',$1,\'execute\') as value',[signature]),true);
    }
    for (const [actor,role] of [[null,'authenticated'],[a,'authenticated'],[admin,'anon'],[admin,'service_role']]) {
      await assert.rejects(() => as(actor,()=>query(),role), error => error.code === '42501');
    }
    await assert.rejects(() => as(a,()=>value('select ojjuda_admin_internal.fortune_purchases() as value')),
      error => error.code === '42501' && /admin_required/.test(error.message));
    await value("select set_config('test.null_admin','true',false) as value");
    await assert.rejects(()=>list(),error=>error.code==='42501');
    await value("select set_config('test.null_admin','false',false) as value");
    for (const role of ['anon','authenticated','service_role']) {
      assert.equal(await value('select has_table_privilege($1,\'ojjuda_note_internal.spend_requests\',\'select\') as value',[role]),false);
      await assert.rejects(()=>as(admin,()=>value('select count(*) as value from ojjuda_note_internal.spend_requests'),role),error=>error.code==='42501');
    }
    const definitions = (await db.query(`select n.nspname,p.prosecdef,p.provolatile,p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('fortune_purchases','admin_fortune_purchases') order by n.nspname`)).rows;
    assert.deepEqual(definitions.map(row=>[row.nspname,row.prosecdef,row.provolatile]),
      [['ojjuda_admin_internal',true,'s'],['public',false,'s']]);
    assert.ok(definitions.every(row=>row.proconfig.includes('search_path=""')));
  });

  await t.test('only actual successful charges are counted, including old and current products', async () => {
    const all = await list();
    assert.equal(all.total_count,8);
    assert.equal(all.total_ju,100);
    assert.equal(all.tarot_count,4);
    assert.equal(all.saju_count,4);
    assert.deepEqual(all.items.map(row=>row.request_id),[14,13,4,3,6,5,1,2].map(requestId));
    const tarot = await list('tarot');
    assert.equal(tarot.total_count,4); assert.equal(tarot.total_ju,60);
    assert.equal(tarot.tarot_count,4); assert.equal(tarot.saju_count,0);
    const saju = await list('saju');
    assert.equal(saju.total_count,4); assert.equal(saju.total_ju,40);
    assert.equal(saju.tarot_count,0); assert.equal(saju.saju_count,4);
    const legacy = saju.items.find(row=>row.request_id===requestId(3));
    assert.equal(legacy.topic,'all');
    assert.equal(legacy.topic_title,'사주 전체 풀이(이전 상품)');
    assert.equal(legacy.year,null);
    assert.equal(all.items.find(row=>row.request_id===requestId(1)).coins,30,'ledger debit is authoritative, not result price or wallet balance');
    assert.equal(all.items.find(row=>row.request_id===requestId(13)).nickname,null,'missing profiles do not hide historical purchases');
    assert.deepEqual(await list(),all,'reloading history does not duplicate or renew purchases');
    assert.deepEqual(await snapshot(),baseline);
  });

  await t.test('inclusive KST calendar dates use precise UTC boundaries independently of session timezone', async () => {
    await db.exec("set timezone='America/Los_Angeles'");
    const day = await list('all','','2026-11-13','2026-11-13');
    assert.deepEqual(day.items.map(row=>row.request_id),[3,6,5,1].map(requestId));
    assert.equal(day.total_count,4); assert.equal(day.total_ju,60);
    assert.deepEqual((await list('all','','2026-11-14')).items.map(row=>row.request_id),[14,13,4].map(requestId));
    assert.deepEqual((await list('all','',null,'2026-11-12')).items.map(row=>row.request_id),[requestId(2)]);
    await db.exec("set timezone='UTC'");
  });

  await t.test('search is case-insensitive literal nickname containment or exact user UUID', async () => {
    for (const search of ['%','_','100%_']) {
      const result = await list('all',search);
      assert.equal(result.total_count,3); assert.equal(result.total_ju,50);
      assert.ok(result.items.every(row=>row.user_id===a));
    }
    assert.equal((await list('all','  alice  ')).total_count,4);
    assert.equal((await list('all',a.toUpperCase())).total_count,3);
    assert.equal((await list('all',a.slice(0,-1))).total_count,0);
    assert.equal((await list('all',missing)).total_count,1);
    assert.deepEqual(await list('all','no matching nickname'),{
      items:[],total_count:0,total_ju:0,tarot_count:0,saju_count:0
    });
  });

  await t.test('stable pages retain totals for the complete filtered result, including empty pages', async () => {
    const first = await list('all','',null,null,2,0);
    const second = await list('all','',null,null,2,2);
    assert.deepEqual(first.items.map(row=>row.request_id),[14,13].map(requestId));
    assert.deepEqual(second.items.map(row=>row.request_id),[4,3].map(requestId));
    assert.equal(new Set([...first.items,...second.items].map(row=>row.request_id)).size,4);
    for (const result of [first,second,await list('all','',null,null,2,8),await list('all','',null,null,2,2147483647)]) {
      assert.equal(result.total_count,8); assert.equal(result.total_ju,100);
      assert.equal(result.tarot_count,4); assert.equal(result.saju_count,4);
    }
    assert.equal((await list('all','',null,null,2,8)).items.length,0);
    const filtered = await list('saju','ALICE','2026-11-13','2026-11-13',1,1);
    assert.equal(filtered.items.length,1); assert.equal(filtered.total_count,3);
    assert.equal(filtered.total_ju,30); assert.equal(filtered.saju_count,3);
  });

  await t.test('invalid filter bounds fail without changing wallets or purchase history', async () => {
    for (const args of [
      [null],['other'],['all',null],['all','x'.repeat(101)],
      ['all','',null,null,0],['all','',null,null,101],['all','',null,null,null],
      ['all','',null,null,30,-1],['all','',null,null,30,null],
      ['all','','2026-11-14','2026-11-13'],['all','','infinity',null],
      ['all','',null,'-infinity']
    ]) {
      await assert.rejects(()=>list(...args),error=>error.code==='22023' && /invalid_fortune_page/.test(error.message));
    }
    assert.equal((await list('all','x'.repeat(100))).total_count,0);
    await assert.rejects(()=>list('all','',null,null,30,2147483648),error=>error.code==='22003');
    assert.deepEqual(await snapshot(),baseline);
  });

  await t.test('malformed optional fields stay safe and private reading data never enters the projection', async () => {
    const years = [{value:2026},[2026],true,'9'.repeat(100),10000,0,2026.5,'2027',2028];
    for (let i=0;i<years.length;i++) {
      await insert(30+i,malformed,'saju_reading_v2',10,{ok:true,topic:'yearly',year:years[i],
        chart_key:'secret-chart',birth:{date:'private-birth'},cards:['private-card'],auth:'secret-auth',title:'untrusted-title'});
    }
    await insert(40,malformed,'saju_reading_v2',10,{ok:true,topic:'lifelong',year:2026});
    await insert(41,malformed,'tarot_reading_v1',10,{ok:true,topic:{private:'hidden'},year:2026});
    const before = await snapshot();
    const result = await list('all',malformed);
    assert.equal(result.total_count,11); assert.equal(result.total_ju,110);
    for (const row of result.items) {
      assert.deepEqual(Object.keys(row).sort(),[
        'request_id','user_id','nickname','product','topic','topic_title','year','coins','created_at'
      ].sort());
      const index = years.findIndex((_,i)=>row.request_id===requestId(30+i));
      assert.equal(row.year,index===7?2027:index===8?2028:null);
    }
    const unknown = result.items.find(row=>row.request_id===requestId(41));
    assert.equal(unknown.topic,'unknown');
    assert.equal(unknown.topic_title,'타로 풀이(항목 미확인)');
    assert.doesNotMatch(JSON.stringify(result),/secret-chart|private-birth|private-card|secret-auth|untrusted-title|chart_key|"result"|"birth"|"cards"|"auth"/);
    assert.deepEqual(await snapshot(),before);
    await db.exec(`delete from public.app_admins where user_id='${admin}'`);
    await assert.rejects(()=>list(),error=>error.code==='42501');
  });
});
