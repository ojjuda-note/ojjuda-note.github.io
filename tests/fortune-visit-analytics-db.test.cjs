const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

test('fortune visits extend private daily analytics without changing historical or billing data', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = '00000000-0000-4000-8000-000000000001';
  const member = '00000000-0000-4000-8000-000000000002';
  await db.exec(`
    set timezone='UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create table public.app_admins(user_id uuid primary key);
    insert into public.app_admins values('${admin}');
    create function public.is_admin() returns boolean language sql stable security definer
      set search_path='' as $$
      select case when current_setting('test.null_admin',true)='true' then null
        else exists(select 1 from public.app_admins where user_id=auth.uid()) end;
    $$;
    create function public.fortune_visits_clock() returns timestamptz
      language sql stable as $$ select current_setting('test.clock')::timestamptz; $$;
    select set_config('test.clock','2026-11-12T14:59:59Z',false);
    create table public.user_private(user_id uuid primary key,coins integer);
    insert into public.user_private values('${member}',321);
    create schema ojjuda_note_internal;
    create table ojjuda_note_internal.spend_requests(
      request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb,created_at timestamptz
    );
    insert into ojjuda_note_internal.spend_requests values
      ('10000000-0000-4000-8000-000000000001','${member}','tarot_reading_v1',30,
        '{"ok":true,"drawn":[1,2],"topic":"overall"}','2026-11-01T00:00:00Z'),
      ('10000000-0000-4000-8000-000000000002','${member}','saju_reading_v2',10,
        '{"ok":true,"chart_key":"private-chart","topic":"yearly"}','2026-11-01T00:00:00Z');
  `);
  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const clock = now => value("select set_config('test.clock',$1,false) as value",[now]);
  const headers = object => value("select set_config('request.headers',$1,false) as value",[JSON.stringify(object)]);
  const as = async (actor,fn,role='authenticated') => {
    await value("select set_config('request.jwt.claim.sub',$1,false) as value",[actor || '']);
    await db.exec(`set role ${role}`);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const record = (id,feature) => value('select public.record_site_usage($1,$2,$3,$4) as value',[id,'feature',feature,null]);
  const report = () => value('select public.admin_site_usage_stats() as value');
  const adminReport = () => as(admin,report);
  const privateReport = () => value('select ojjuda_insights.admin_fortune_visits() as value');
  const directory = path.join(__dirname,'../supabase/migrations');
  const load = suffix => {
    const matches = fs.readdirSync(directory).filter(name=>name.endsWith(suffix));
    assert.equal(matches.length,1,suffix);
    // Only the clock is controlled. The real recorder, policies and reporting
    // functions run so KST midnight and consecutive-day dedup can be exercised.
    return fs.readFileSync(path.join(directory,matches[0]),'utf8')
      .replaceAll('statement_timestamp()','public.fortune_visits_clock()')
      .replaceAll('now()','public.fortune_visits_clock()');
  };
  for (const suffix of ['_site_usage_analytics.sql','_guest_popularity.sql','_feature_detail_breakdown.sql']) {
    await db.exec(load(suffix));
  }
  const normalHeaders = {origin:'https://ojjuda.kr','user-agent':'Mozilla/5.0'};
  await headers(normalHeaders);
  const oldVisitor = randomUUID();
  await as(null,async () => {
    await value('select public.record_site_usage($1,$2,$3,$4) as value',[oldVisitor,'visit',null,'direct']);
    await record(oldVisitor,'park');
    await record(oldVisitor,'game_stacker');
    await value('select public.record_site_detail($1,$2) as value',[oldVisitor,'agit_stamp']);
    await value('select public.record_site_detail($1,$2) as value',[oldVisitor,'arcade_game_stacker']);
    await assert.rejects(()=>record(oldVisitor,'tarot'),/invalid_insight_feature/);
  },'anon');
  const billingSnapshot = () => value(`select jsonb_build_object(
    'wallet',(select jsonb_agg(to_jsonb(w) order by user_id) from public.user_private w),
    'ledger',(select jsonb_agg(to_jsonb(s) order by request_id) from ojjuda_note_internal.spend_requests s)
  ) as value`);
  const historySnapshot = () => value(`select jsonb_build_object(
    'settings',(select jsonb_build_object('started_at',started_at,'salt',salt) from ojjuda_insights.settings),
    'visits',(select jsonb_agg(to_jsonb(v) order by visit_day,visit_hour,source) from ojjuda_insights.visit_totals v),
    'features',(select jsonb_agg(to_jsonb(f) order by visit_day,feature) from ojjuda_insights.feature_totals f),
    'guests',(select jsonb_agg(to_jsonb(g) order by visit_day,feature) from ojjuda_insights.guest_feature_totals g),
    'details',(select jsonb_agg(to_jsonb(d) order by visit_day,detail) from ojjuda_insights.detail_totals d),
    'seen',(select jsonb_agg(to_jsonb(s) order by visit_day,browser_hash,event_key) from ojjuda_insights.seen s),
    'limits',(select jsonb_agg(to_jsonb(l) order by hour_start) from ojjuda_insights.hour_limits l)
  ) as value`);
  const originalBilling = await billingSnapshot();
  const originalHistory = await historySnapshot();
  await clock('2026-11-12T15:00:00Z');
  const previousReport = await adminReport();
  const previousRecorder = await value("select prosrc as value from pg_proc where oid='ojjuda_insights.record_event(uuid,text,text,text)'::regprocedure");
  await db.exec(load('_fortune_visit_analytics.sql'));

  await t.test('collection starts at deployment without reconstructing visits or removing existing charts', async () => {
    const result = await adminReport();
    assert.equal(Date.parse(result.fortune_visits.started_at),Date.parse('2026-11-12T15:00:00Z'));
    assert.equal(result.fortune_visits.daily.length,30);
    assert.deepEqual(result.fortune_visits.daily.at(-1),{period:'2026-11-13',tarot:0,saju:0});
    assert.ok(result.fortune_visits.daily.every(row=>row.tarot===0 && row.saju===0));
    const {fortune_visits,...existing} = result;
    assert.deepEqual(existing,previousReport);
    assert.deepEqual(await historySnapshot(),originalHistory);
    assert.deepEqual(await billingSnapshot(),originalBilling);
    const currentRecorder = await value("select prosrc as value from pg_proc where oid='ojjuda_insights.record_event(uuid,text,text,text)'::regprocedure");
    assert.equal(currentRecorder.replace("'tarot','saju',",'').replace(/\s/g,''),previousRecorder.replace(/\s/g,''),
      'the pre-existing recorder logic changes only by accepting the two new feature keys');
  });

  await t.test('only current administrators can read the aggregate extension, without direct table access', async () => {
    for (const signature of ['public.admin_site_usage_stats()','ojjuda_insights.admin_fortune_visits()']) {
      for (const role of ['anon','service_role']) {
        assert.equal(await value('select has_function_privilege($1,$2,\'execute\') as value',[role,signature]),false);
      }
      assert.equal(await value('select has_function_privilege(\'authenticated\',$1,\'execute\') as value',[signature]),true);
    }
    for (const [actor,role] of [[null,'authenticated'],[member,'authenticated'],[admin,'anon'],[admin,'service_role']]) {
      await assert.rejects(()=>as(actor,report,role),error=>error.code==='42501');
      await assert.rejects(()=>as(actor,privateReport,role),error=>error.code==='42501');
    }
    await value("select set_config('test.null_admin','true',false) as value");
    await assert.rejects(adminReport,error=>error.code==='42501');
    await value("select set_config('test.null_admin','false',false) as value");
    for (const role of ['anon','authenticated']) {
      for (const table of ['settings','visit_totals','feature_totals','seen','hour_limits','guest_feature_totals','detail_totals']) {
        for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) {
          assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,`ojjuda_insights.${table}`,privilege]),false);
        }
        assert.equal(await value('select relrowsecurity as value from pg_class where oid=$1::regclass',[`ojjuda_insights.${table}`]),true);
      }
    }
    const definitions=(await db.query(`select n.nspname,p.prosecdef,p.provolatile,p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('admin_site_usage_stats','admin_fortune_visits') order by n.nspname`)).rows;
    assert.deepEqual(definitions.map(row=>[row.nspname,row.prosecdef,row.provolatile]),
      [['ojjuda_insights',true,'s'],['public',false,'s']]);
    assert.ok(definitions.every(row=>row.proconfig.includes('search_path=""')));
  });

  const first = randomUUID();
  const second = randomUUID();
  await t.test('real anonymous and member events count once per browser, day and product', async () => {
    await headers(normalHeaders);
    await as(null,async () => {
      for (const feature of ['tarot','tarot','saju','saju']) {
        const result=await record(first,feature);
        assert.equal(result.ok,true);
        assert.equal(result.day,'2026-11-13');
        assert.deepEqual(Object.keys(result).sort(),['day','ok','server_now']);
      }
      await value('select public.record_site_usage($1,$2,$3,$4) as value',[first,'visit',null,'google']);
      await value('select public.record_site_usage($1,$2,$3,$4) as value',[first,'visit',null,'naver']);
    },'anon');
    await as(member,async () => {
      await record(first,'tarot');
      await record(second,'saju');
      await record(second,'saju');
    });
    await as(null,()=>record(randomUUID(),'tarot'),'anon');
    const result=await adminReport();
    assert.deepEqual(result.fortune_visits.daily.at(-1),{period:'2026-11-13',tarot:2,saju:2});
    assert.equal(result.today,1); assert.equal(result.total,2);
    assert.equal(result.features.some(row=>['tarot','saju'].includes(row.feature)),false,
      'old clients never receive unknown feature keys in their existing top-12 chart');
    assert.deepEqual(result.guest_games,[{feature:'game_stacker',uses:1}]);
    assert.deepEqual(result.guest_boards,[{feature:'park',uses:1}]);
    assert.deepEqual(result.agit_details,[{detail:'agit_stamp',uses:1}]);
    assert.deepEqual(result.arcade_details,[{detail:'arcade_game_stacker',uses:1}]);
    assert.deepEqual(await billingSnapshot(),originalBilling);
  });

  await t.test('origin, UUID, bot, DNT and GPC protections still apply before any aggregation', async () => {
    const before=await historySnapshot();
    for (const preference of [
      {...normalHeaders,dnt:'1'}, {...normalHeaders,'sec-gpc':'1'},
      {...normalHeaders,'user-agent':'Googlebot crawler'},
      {...normalHeaders,'user-agent':'BingPreview'}
    ]) {
      await headers(preference);
      await as(null,async () => {
        assert.equal((await record(randomUUID(),'tarot')).ok,true);
        assert.equal((await record(randomUUID(),'saju')).ok,true);
      },'anon');
    }
    await headers({...normalHeaders,origin:'https://foreign.example'});
    await assert.rejects(()=>as(null,()=>record(randomUUID(),'tarot'),'anon'),/invalid_visit_origin/);
    await headers(normalHeaders);
    await assert.rejects(()=>as(null,()=>record('00000000-0000-1000-8000-000000000001','tarot'),'anon'),/invalid_visit_id/);
    await assert.rejects(()=>as(null,()=>record(randomUUID(),'tarot_private'),'anon'),/invalid_insight_feature/);
    await assert.rejects(()=>as(null,()=>value('select public.record_site_usage($1,$2,$3,$4) as value',
      [randomUUID(),'visit',null,'raw-referrer.example']),'anon'),/invalid_insight_source/);
    assert.deepEqual(await historySnapshot(),before);
  });

  const boundaryVisitor=randomUUID();
  const lastDayVisitor=randomUUID();
  await t.test('KST midnight resets product dedup and reports exactly thirty chronological days with zeros', async () => {
    await db.exec("set timezone='Pacific/Honolulu'");
    await clock('2026-11-13T14:59:59.999999Z');
    const beforeMidnight=await as(null,()=>record(boundaryVisitor,'tarot'),'anon');
    assert.equal(beforeMidnight.day,'2026-11-13');
    await clock('2026-11-13T15:00:00Z');
    const afterMidnight=await as(null,()=>record(boundaryVisitor,'tarot'),'anon');
    assert.equal(afterMidnight.day,'2026-11-14');
    const midnight=await adminReport();
    assert.deepEqual(midnight.fortune_visits.daily.at(-2),{period:'2026-11-13',tarot:3,saju:2});
    assert.deepEqual(midnight.fortune_visits.daily.at(-1),{period:'2026-11-14',tarot:1,saju:0});
    const hashes=(await db.query("select encode(browser_hash,'hex') as hash from ojjuda_insights.seen where event_key='tarot' and visit_day in ('2026-11-13','2026-11-14')")).rows;
    assert.equal(new Set(hashes.map(row=>row.hash)).size,hashes.length,'daily salted hashes rotate across KST days');
    await clock('2026-12-12T15:00:00Z');
    await as(member,()=>record(lastDayVisitor,'saju'));
    const month=await adminReport();
    const days=month.fortune_visits.daily;
    assert.equal(days.length,30);
    assert.deepEqual(days[0],{period:'2026-11-14',tarot:1,saju:0});
    assert.deepEqual(days.at(-1),{period:'2026-12-13',tarot:0,saju:1});
    assert.ok(days.slice(1,-1).every(row=>row.tarot===0 && row.saju===0));
    assert.deepEqual(days.map(row=>row.period),[...days.map(row=>row.period)].sort());
    assert.equal(Date.parse(month.fortune_visits.started_at),Date.parse('2026-11-12T15:00:00Z'),'collection start does not move with the chart window');
    await db.exec("set timezone='UTC'");
  });

  await t.test('the shared hourly cap rejects new events without losing dedup or inventing counts', async () => {
    await db.exec(`update ojjuda_insights.hour_limits set events=20000
      where hour_start=date_trunc('hour',public.fortune_visits_clock())`);
    const before=await historySnapshot();
    const rejected=await as(null,()=>record(randomUUID(),'tarot'),'anon');
    assert.deepEqual(rejected,{ok:false,reason:'rate_limited'});
    assert.equal((await as(member,()=>record(lastDayVisitor,'saju'))).ok,true,
      'already-counted events remain harmless when the global cap is full');
    assert.deepEqual(await historySnapshot(),before);
    await clock('2026-12-12T16:00:00Z');
    assert.equal((await as(null,()=>record(randomUUID(),'tarot'),'anon')).ok,true);
    assert.deepEqual((await adminReport()).fortune_visits.daily.at(-1),{period:'2026-12-13',tarot:1,saju:1});
  });

  await t.test('the extension exposes only date aggregates and leaves purchase records untouched', async () => {
    const result=await adminReport();
    assert.deepEqual(Object.keys(result.fortune_visits).sort(),['daily','started_at']);
    assert.ok(result.fortune_visits.daily.every(row=>
      Object.keys(row).sort().join(',')==='period,saju,tarot' &&
      Number.isInteger(row.tarot) && row.tarot>=0 && Number.isInteger(row.saju) && row.saju>=0));
    const payload=JSON.stringify(result);
    const salt=await value('select salt::text as value from ojjuda_insights.settings where singleton');
    for (const privateValue of [salt,admin,member,oldVisitor,first,second,boundaryVisitor,lastDayVisitor,'private-chart']) {
      assert.equal(payload.includes(privateValue),false);
    }
    assert.doesNotMatch(payload,/browser_hash|visit_id|user_id|chart_key|drawn|request.headers|user-agent/);
    const seenColumns=(await db.query("select column_name from information_schema.columns where table_schema='ojjuda_insights' and table_name='seen' order by ordinal_position")).rows.map(row=>row.column_name);
    assert.deepEqual(seenColumns,['visit_day','browser_hash','event_key']);
    assert.deepEqual(await billingSnapshot(),originalBilling);
    await db.exec(`delete from public.app_admins where user_id='${admin}'`);
    await assert.rejects(adminReport,error=>error.code==='42501');
  });
});
