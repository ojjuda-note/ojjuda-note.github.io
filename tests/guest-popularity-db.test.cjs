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
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.app_admins(user_id uuid primary key);
    insert into public.app_admins values('${admin}');
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.app_admins where user_id=auth.uid())$$;`);
  const dir=path.join(__dirname,'../supabase/migrations');
  for (const suffix of ['_site_usage_analytics.sql','_guest_popularity.sql']) {
    const filename=fs.readdirSync(dir).find(file=>file.endsWith(suffix));assert.ok(filename,suffix);
    await db.exec(fs.readFileSync(path.join(dir,filename),'utf8'));
  }
  const value=async (sql,args=[]) => (await db.query(sql,args)).rows[0].value;
  const record=(id,feature) => value('select public.record_site_usage($1,$2,$3,$4) as value',[id,'feature',feature,null]);
  for (const role of ['anon','authenticated']) {
    assert.equal(await value(`select has_table_privilege('${role}','ojjuda_insights.guest_feature_totals','select') as value`),false);
    assert.equal(await value(`select has_table_privilege('${role}','ojjuda_insights.guest_feature_totals','insert') as value`),false);
    assert.equal(await value(`select has_function_privilege('${role}','ojjuda_insights.count_guest_feature()','execute') as value`),false);
  }
  assert.equal(await value("select relrowsecurity as value from pg_class where oid='ojjuda_insights.guest_feature_totals'::regclass"),true);
  await db.exec('set role anon');
  await value('select set_config($1,$2,false) as value',['request.headers',JSON.stringify({origin:'https://ojjuda.kr','user-agent':'Mozilla/5.0'})]);
  await assert.rejects(() => value('select public.admin_site_usage_stats() as value'),/permission denied/);
  const first=randomUUID(),second=randomUUID();
  for (const feature of ['game_stacker','game_stacker','game_mole','park','group']) await record(first,feature);
  for (const feature of ['game_stacker','fanpages','restaurants']) await record(second,feature);
  await db.exec('reset role');
  assert.equal(await value("select sum(uses)::integer as value from ojjuda_insights.guest_feature_totals where feature='game_stacker'"),2);
  assert.equal(await value('select sum(uses)::integer as value from ojjuda_insights.guest_feature_totals'),7);
  await db.exec('set role authenticated');
  await value('select set_config($1,$2,false) as value',['request.jwt.claim.sub',member]);
  await record(randomUUID(),'game_stacker');
  await record(randomUUID(),'park');
  await assert.rejects(()=>value('select public.admin_site_usage_stats() as value'),/admin_required/);
  await db.exec('reset role');
  assert.equal(await value('select sum(uses)::integer as value from ojjuda_insights.guest_feature_totals'),7,
    'signed-in member events are excluded from guest charts');
  await db.exec('set role authenticated');
  await value('select set_config($1,$2,false) as value',['request.jwt.claim.sub',admin]);
  const stats=await value('select public.admin_site_usage_stats() as value');
  assert.deepEqual(stats.guest_games.map(row=>[row.feature,Number(row.uses)]),[['game_stacker',2],['game_mole',1]]);
  assert.deepEqual(stats.guest_boards.map(row=>[row.feature,Number(row.uses)]),
    [['fanpages',1],['group',1],['park',1],['restaurants',1]]);
  assert.equal(stats.daily.length,30,'the original charts still share the same response');
  await db.exec('reset role');
  await db.exec("delete from ojjuda_insights.feature_totals where feature='game_stacker'");
  assert.equal(await value("select count(*)::integer as value from ojjuda_insights.guest_feature_totals where feature='game_stacker'"),0,
    'legacy aggregate retention cascades to guest-only rankings');
  await db.close();
  console.log('PASS: guest-only games/boards, member exclusion, daily dedup, admin authorization and existing retention');
})().catch(error=>{console.error(error.message,error.stack?.split('\n').slice(0,3).join('\n'));process.exitCode=1});
