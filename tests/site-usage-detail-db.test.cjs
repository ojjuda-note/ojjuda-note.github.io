const assert = require('node:assert/strict');
const fs = require('node:fs'),path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  const admin='00000000-0000-4000-8000-000000000001';
  const member='00000000-0000-4000-8000-000000000002';
  await db.exec(`create role anon;create role authenticated;
    create schema auth;grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.app_admins(user_id uuid primary key);
    insert into public.app_admins values('${admin}');
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.app_admins where user_id=auth.uid())$$;`);
  const directory=path.join(__dirname,'../supabase/migrations');
  for (const suffix of ['_site_usage_analytics.sql','_guest_popularity.sql','_feature_detail_breakdown.sql']) {
    const name=fs.readdirSync(directory).find(file=>file.endsWith(suffix));assert.ok(name,suffix);
    await db.exec(fs.readFileSync(path.join(directory,name),'utf8'));
  }
  const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
  const record=(id,detail)=>value('select public.record_site_detail($1,$2) as value',[id,detail]);
  for (const role of ['anon','authenticated']) {
    assert.equal(await value(`select has_table_privilege('${role}','ojjuda_insights.detail_totals','select') as value`),false);
    assert.equal(await value(`select has_table_privilege('${role}','ojjuda_insights.detail_totals','insert') as value`),false);
  }
  assert.equal(await value("select relrowsecurity as value from pg_class where oid='ojjuda_insights.detail_totals'::regclass"),true);
  await db.exec('set role anon');
  await assert.rejects(()=>record(randomUUID(),'agit_stamp'),/invalid_visit_origin/);
  await value('select set_config($1,$2,false) as value',['request.headers',JSON.stringify({origin:'https://ojjuda.kr','user-agent':'Mozilla/5.0'})]);
  await assert.rejects(()=>record(randomUUID(),'agit_hacked'),/invalid_detail_feature/);
  await assert.rejects(()=>record(randomUUID(),'arcade_game_xss'),/invalid_detail_feature/);
  const first=randomUUID();
  for(const item of ['agit_stamp','agit_stamp','agit_mission','agit_group','arcade_game_stacker','arcade_game_stacker']) {
    const result=await record(first,item);assert.equal(result.ok,true);
  }
  await record(randomUUID(),'arcade_game_stacker');
  await value('select set_config($1,$2,false) as value',['request.headers',JSON.stringify({origin:'https://ojjuda.kr','dnt':'1'})]);
  await record(randomUUID(),'agit_fanpages');
  await db.exec('reset role');
  assert.equal(await value('select sum(uses)::integer as value from ojjuda_insights.detail_totals'),5,
    'daily dedup and Do Not Track prevent inflated details');
  await db.exec('set role authenticated');
  await value('select set_config($1,$2,false) as value',['request.jwt.claim.sub',member]);
  await value('select set_config($1,$2,false) as value',['request.headers',JSON.stringify({origin:'https://ojjuda.kr'})]);
  await record(randomUUID(),'agit_recommended_game');
  await assert.rejects(()=>value('select public.admin_site_usage_stats() as value'),/admin_required/);
  await value('select set_config($1,$2,false) as value',['request.jwt.claim.sub',admin]);
  const result=await value('select public.admin_site_usage_stats() as value');
  assert.deepEqual(result.agit_details.map(row=>[row.detail,Number(row.uses)]),
    [['agit_group',1],['agit_mission',1],['agit_recommended_game',1],['agit_stamp',1]]);
  assert.deepEqual(result.arcade_details.map(row=>[row.detail,Number(row.uses)]),[['arcade_game_stacker',2]]);
  assert.equal(result.daily.length,30);
  await db.exec('reset role');
  await db.exec("update ojjuda_insights.detail_totals set visit_day=(now() at time zone 'Asia/Seoul')::date-401");
  await db.exec('select ojjuda_insights.purge_expired()');
  assert.equal(await value('select count(*)::integer as value from ojjuda_insights.detail_totals'),0);
  await db.close();
  console.log('PASS: private detailed Agit/Arcade actions, daily dedup, privacy, admin-only charts and retention');
})().catch(error=>{console.error(error.message,error.stack?.split('\n').slice(0,3).join('\n'));process.exitCode=1});
