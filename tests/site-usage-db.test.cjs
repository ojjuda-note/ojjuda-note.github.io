const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  const admin = '00000000-0000-4000-8000-000000000001';
  const member = '00000000-0000-4000-8000-000000000002';
  await db.exec(`create role anon; create role authenticated;
    create schema auth; grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.app_admins(user_id uuid primary key);
    insert into public.app_admins values('${admin}');
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.app_admins where user_id=auth.uid())$$;`);
  const migration = fs.readdirSync(path.join(__dirname,'../supabase/migrations'))
    .find(file => file.endsWith('_site_usage_analytics.sql'));
  assert.ok(migration);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',migration),'utf8'));
  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0].value;
  const headers = obj => value("select set_config('request.headers',$1,false) as value",[JSON.stringify(obj)]);
  const record = (id,event,feature=null,source=null) => value(
    'select public.record_site_usage($1,$2,$3,$4) as value',[id,event,feature,source]);
  const stats = () => value('select public.admin_site_usage_stats() as value');
  for (const role of ['anon','authenticated']) {
    for (const table of ['settings','visit_totals','feature_totals','seen','hour_limits']) {
      for (const privilege of ['select','insert','update','delete']) {
        assert.equal(await value(`select has_table_privilege('${role}','ojjuda_insights.${table}','${privilege}') as value`),false);
      }
    }
    assert.equal(await value(`select has_function_privilege('${role}','ojjuda_insights.purge_expired()','execute') as value`),false);
  }
  assert.equal(await value("select prosecdef as value from pg_proc where oid='public.record_site_usage(uuid,text,text,text)'::regprocedure"),false);
  await db.exec('set role anon');
  await assert.rejects(stats,/permission denied/);
  await assert.rejects(() => record(randomUUID(),'visit',null,'direct'),/invalid_visit_origin/);
  await headers({origin:'https://evil.example'});
  await assert.rejects(() => record(randomUUID(),'visit',null,'direct'),/invalid_visit_origin/);
  await headers({origin:'https://ojjuda.kr', 'user-agent':'Mozilla/5.0'});
  await assert.rejects(() => record(randomUUID(),'unknown'),/invalid_insight_event/);
  await assert.rejects(() => record(randomUUID(),'visit',null,'raw-website'),/invalid_insight_source/);
  await assert.rejects(() => record(randomUUID(),'feature','game_hacked',null),/invalid_insight_feature/);
  const firstId = randomUUID();
  const first = await record(firstId,'visit',null,'direct');
  assert.deepEqual(Object.keys(first).sort(),['day','ok','server_now']);
  await record(firstId,'visit',null,'naver');
  await record(firstId,'feature','arcade');
  await record(firstId,'feature','arcade');
  await record(firstId,'feature','game_stacker');
  const another = randomUUID();
  await record(another,'visit',null,'naver');
  await record(another,'feature','arcade');
  await headers({origin:'https://ojjuda.kr','user-agent':'Googlebot'});
  await record(randomUUID(),'visit',null,'social');
  await headers({origin:'https://ojjuda.kr','user-agent':'Mozilla/5.0','dnt':'1'});
  await record(randomUUID(),'visit',null,'social');
  await db.exec('reset role');
  assert.equal(await value('select sum(visits)::integer as value from ojjuda_insights.visit_totals'),2);
  assert.equal(await value('select sum(uses)::integer as value from ojjuda_insights.feature_totals'),3);
  assert.equal(await value('select count(*)::integer as value from ojjuda_insights.seen'),5);
  assert.equal(await value("select count(*)::integer as value from ojjuda_insights.visit_totals where source='direct'"),1);
  await db.exec('set role authenticated');
  await assert.rejects(stats,/admin_required/);
  await value("select set_config('request.jwt.claim.sub',$1,false) as value",[member]);
  await assert.rejects(stats,/admin_required/);
  await value("select set_config('request.jwt.claim.sub',$1,false) as value",[admin]);
  const data = await stats();
  assert.equal(data.today,2); assert.equal(data.month,2); assert.equal(data.total,2);
  assert.equal(data.daily.length,30); assert.equal(data.daily.at(-1).visits,2);
  assert.equal(data.hourly.length,24); assert.equal(data.hourly.reduce((sum,row)=>sum+Number(row.visits),0),2);
  assert.equal(data.weekday.length,7); assert.equal(data.weekday.reduce((sum,row)=>sum+Number(row.visits),0),2);
  assert.deepEqual(data.features.slice(0,2).map(row=>[row.feature,Number(row.uses)]),[['arcade',2],['game_stacker',1]]);
  assert.equal(data.sources.length,8);
  assert.equal(data.sources.find(row=>row.source==='naver').visits,1);
  assert.equal(data.sources.find(row=>row.source==='direct').visits,1);
  await db.exec('reset role');
  await db.exec("update ojjuda_insights.seen set visit_day=visit_day-4; select ojjuda_insights.purge_expired();");
  assert.equal(await value('select count(*)::integer as value from ojjuda_insights.seen'),0);
  assert.equal(await value('select sum(visits)::integer as value from ojjuda_insights.visit_totals'),2,'retention keeps aggregate charts');
  await db.close();
  console.log('PASS: site analytics privacy, one-day dedup, KST hourly/weekday charts, source categorization, admin-only aggregates and retention');
})().catch(error => { console.error(error.message,error.stack?.split('\n').slice(0,3).join('\n')); process.exitCode = 1; });
