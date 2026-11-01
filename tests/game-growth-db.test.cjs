const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  const admin = '00000000-0000-4000-8000-000000000001', member = '00000000-0000-4000-8000-000000000002';
  await db.exec(`create role anon; create role authenticated; create schema auth;
    grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.app_admins(user_id uuid primary key); insert into public.app_admins values('${admin}');
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.app_admins where user_id=auth.uid())$$;`);
  const file = fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(name => name.endsWith('_game_growth_statistics.sql'));
  assert.ok(file, 'the generated migration is present');
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0].value;
  const headers = obj => value("select set_config('request.headers',$1,false) as value",[JSON.stringify(obj)]);
  const record = (id,game='stacker',source='challenge',event='visit') => value('select public.record_game_growth($1,$2,$3,$4) as value',[id,game,source,event]);
  const stats = () => value('select public.admin_game_growth_stats() as value');
  const goodHeaders = {origin:'https://ojjuda.kr','user-agent':'Mozilla/5.0'};
  for (const role of ['anon','authenticated']) {
    for (const table of ['settings','daily','seen','hour_limits']) {
      for (const permission of ['select','insert','update','delete']) assert.equal(await value(`select has_table_privilege('${role}','ojjuda_growth.${table}','${permission}') as value`),false);
      assert.equal(await value(`select relrowsecurity as value from pg_class where oid='ojjuda_growth.${table}'::regclass`),true);
    }
    assert.equal(await value(`select has_function_privilege('${role}','ojjuda_growth.purge_expired()','execute') as value`),false);
  }
  assert.equal(await value("select prosecdef as value from pg_proc where oid='public.record_game_growth(uuid,text,text,text)'::regprocedure"),false);
  assert.equal(await value("select prosecdef as value from pg_proc where oid='public.admin_game_growth_stats()'::regprocedure"),false);
  await db.exec('set role anon');
  await assert.rejects(stats,/permission denied/);
  await assert.rejects(() => record(randomUUID()),/invalid_visit_origin/);
  await headers({origin:'https://example.com'});
  await assert.rejects(() => record(randomUUID()),/invalid_visit_origin/);
  await headers(goodHeaders);
  await assert.rejects(() => record(null),/invalid_visit_id/);
  await assert.rejects(() => record('00000000-0000-0000-0000-000000000000'),/invalid_visit_id/);
  for (const args of [[randomUUID(),'poker','challenge','visit'],[randomUUID(),'mole','https://evil.example','visit'],[randomUUID(),'mole','direct','score'],[randomUUID(),'mole',null,'visit']]) await assert.rejects(() => record(...args),/invalid_growth_event/);
  const id=randomUUID(), first=await record(id);
  assert.deepEqual(Object.keys(first).sort(),['day','ok','server_now']);
  assert.equal(first.day,new Date(Date.parse(first.server_now)+9*3600000).toISOString().slice(0,10));
  for(let i=0;i<5;i++) await record(id);
  for(const event of ['start','complete','share']) { await record(id,'stacker','challenge',event); await record(id,'stacker','challenge',event); }
  await record(id,'mole','challenge'); await record(id,'stacker','direct');
  for(const privacy of [{dnt:'1'},{'sec-gpc':'1'},{'user-agent':'Googlebot'}]) {
    await headers({...goodHeaders,...privacy}); assert.equal((await record(randomUUID())).ok,true);
  }
  await db.exec('reset role');
  assert.equal(await value('select count(*)::integer as value from ojjuda_growth.seen'),6,'only unique browser/day/game/source/event combinations persist');
  assert.equal(await value('select sum(events)::integer as value from ojjuda_growth.hour_limits'),6,'duplicates and privacy exclusions consume no storage quota');
  const columns=(await db.query("select column_name from information_schema.columns where table_schema='ojjuda_growth' and table_name='seen' order by ordinal_position")).rows.map(row=>row.column_name);
  assert.deepEqual(columns,['visit_day','browser_hash','game','source','event'],'no raw UUID, user ID, IP, URL or user-agent is stored');
  await db.exec('set role authenticated'); await headers(goodHeaders);
  await assert.rejects(stats,/admin_required/);
  await value("select set_config('request.jwt.claim.sub',$1,false) as value",[member]);
  await assert.rejects(stats,/admin_required/);
  await record(id); // Login cannot inflate a previously recorded anonymous visit.
  await record(randomUUID(),'mole','direct','start');
  await value("select set_config('request.jwt.claim.sub',$1,false) as value",[admin]);
  const result=await stats(); assert.equal(result.today.length,4); assert.equal(result.month.length,4);
  assert.deepEqual(result.today.find(row=>row.game==='stacker'&&row.source==='challenge'),{game:'stacker',source:'challenge',visits:1,starts:1,completes:1,shares:1});
  assert.deepEqual(result.today.find(row=>row.game==='mole'&&row.source==='direct'),{game:'mole',source:'direct',visits:0,starts:1,completes:0,shares:0});
  await db.exec('reset role');
  await db.exec("update ojjuda_growth.hour_limits set events=10000 where hour_start=date_trunc('hour',statement_timestamp())");
  await db.exec('set role anon');
  assert.equal((await record(id)).ok,true,'duplicate remains acknowledged at the quota ceiling');
  assert.deepEqual(await record(randomUUID()),{ok:false,reason:'rate_limited'});
  await db.exec('reset role');
  assert.equal(await value('select count(*)::integer as value from ojjuda_growth.seen'),7);
  await db.exec('delete from ojjuda_growth.hour_limits; update ojjuda_growth.seen set visit_day=visit_day-1; update ojjuda_growth.daily set visit_day=visit_day-1;');
  await db.exec('set role anon'); await record(id); await db.exec('reset role');
  assert.equal(await value('select sum(visits)::integer as value from ojjuda_growth.daily'),4,'another KST day is counted independently');
  await db.exec("insert into ojjuda_growth.seen values((now() at time zone 'Asia/Seoul')::date-3,sha256('old'::bytea),'mole','direct','visit'); insert into ojjuda_growth.hour_limits values(date_trunc('hour',now())-interval '3 days',1); select ojjuda_growth.purge_expired();");
  assert.equal(await value("select count(*)::integer as value from ojjuda_growth.seen where visit_day<(now() at time zone 'Asia/Seoul')::date-1"),0);
  assert.equal(await value("select count(*)::integer as value from ojjuda_growth.hour_limits where hour_start<now()-interval '2 days'"),0);
  assert.equal(await value('select sum(visits)::integer as value from ojjuda_growth.daily'),4,'aggregate totals survive ledger retention');
  await db.close();
  console.log('PASS: game growth daily deduplication, KST separation, allowlists, privacy exclusions, storage cap, anonymous/member/admin authorization and retention');
})().catch(error=>{console.error(error.message,error.where||'',error.stack?.split('\n').slice(0,3).join('\n'));process.exitCode=1;});
