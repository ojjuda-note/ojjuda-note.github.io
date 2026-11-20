const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {randomUUID} = require('node:crypto');
const {PGlite} = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite(), admin = randomUUID(), oldMember = randomUUID();
  await db.exec(`create role anon;create role authenticated;
    create schema auth;grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key,created_at timestamptz default now(),email_confirmed_at timestamptz,
      is_anonymous boolean default false,deleted_at timestamptz,banned_until timestamptz,last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.identities(id uuid primary key,user_id uuid,identity_data jsonb);
    create table public.app_admins(user_id uuid primary key);insert into public.app_admins values('${admin}');
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.app_admins where user_id=auth.uid())$$;
    insert into auth.users(id,created_at)values('${oldMember}',now()-interval '2 days');`);
  const migrations = fs.readdirSync(path.join(__dirname,'../supabase/migrations'));
  for(const suffix of ['_site_usage_analytics.sql','_campaign_signup_attribution.sql']) {
    const name=migrations.find(file=>file.endsWith(suffix));assert.ok(name);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8'));
  }
  const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
  const headers=obj=>value("select set_config('request.headers',$1,false) as value",[JSON.stringify(obj)]);
  const claim=id=>value("select set_config('request.jwt.claim.sub',$1,false) as value",[id||'']);
  const event=(token,stage='visit',content='threads-onecard-20261121',source='threads',campaign='onecard-20261121') => value(
    'select public.record_campaign_event($1,$2,$3,$4,$5,$6) as value',[token,stage,source,'social',campaign,content]);
  const total=()=>value('select coalesce(sum(confirmed_signups),0)::integer as value from ojjuda_insights.campaign_totals');
  const signup=async(token,{confirmed=false,anonymous=false,meta={},id=randomUUID()}={})=>{
    await db.query('insert into auth.users(id,raw_user_meta_data,email_confirmed_at,is_anonymous)values($1,$2,$3,$4)',
      [id,JSON.stringify({nickname:'fixture',terms_version:'fixture',referrer_code:'kept',campaign_visit_token:token,...meta}),confirmed?new Date().toISOString():null,anonymous]);return id;
  };
  for(const role of ['anon','authenticated']) {
    for(const table of ['campaign_totals','campaign_touches','campaign_signup_checks','campaign_limits']) {
      for(const permission of ['select','insert','update','delete']) assert.equal(await value(
        `select has_table_privilege('${role}','ojjuda_insights.${table}','${permission}') as value`),false);
      assert.equal(await value(`select relrowsecurity as value from pg_class where oid='ojjuda_insights.${table}'::regclass`),true);
    }
    for(const fn of ['capture_campaign_signup()','strip_campaign_identity_token()','purge_campaigns()'])
      assert.equal(await value(`select has_function_privilege('${role}','ojjuda_insights.${fn}','execute') as value`),false);
  }
  assert.equal(await value("select prosecdef as value from pg_proc where oid='public.record_campaign_event(uuid,text,text,text,text,text)'::regprocedure"),false);
  await db.exec('set role anon');
  await assert.rejects(()=>value('select public.admin_campaign_signup_stats() as value'),/permission denied/);
  await headers({origin:'https://evil.example'});await assert.rejects(()=>event(randomUUID()),/invalid_campaign_origin/);
  await headers({origin:'https://ojjuda.kr'});
  await assert.rejects(()=>event(randomUUID(),'signup_complete'),/invalid_campaign_event/);
  for(const label of ['person@example.com','https://example.com','01012345678','bad value','a'.repeat(65)])
    await assert.rejects(()=>event(randomUUID(),'visit',label),/invalid_campaign_labels/);
  await assert.rejects(()=>event(randomUUID(),'visit','valid','unregistered'),/invalid_campaign_labels/);
  const touch=randomUUID();
  assert.equal((await event(touch,'signup_start')).accepted,false,'start alone cannot forge a visit');
  assert.equal((await event(touch)).accepted,true);
  await event(touch);await event(touch,'signup_start');await event(touch,'signup_start');
  assert.equal((await event(touch,'visit','different-post')).accepted,false,'a token cannot be relabelled');
  for(const flag of [{dnt:'1'},{'sec-gpc':'1'},{'user-agent':'Googlebot'}]) {
    await headers({origin:'https://ojjuda.kr',...flag});assert.equal((await event(randomUUID())).accepted,false);
  }
  await headers({origin:'https://ojjuda.kr'});await db.exec('reset role');
  assert.deepEqual((await db.query('select visits::integer,signup_starts::integer,confirmed_signups::integer from ojjuda_insights.campaign_totals')).rows,
    [{visits:1,signup_starts:1,confirmed_signups:0}]);
  const member=await signup(touch);
  assert.equal(await total(),0,'unconfirmed account is not a completed signup');
  const meta=await value('select raw_user_meta_data as value from auth.users where id=$1',[member]);
  assert.equal(meta.campaign_visit_token,undefined);assert.equal(meta.referrer_code,'kept');assert.equal(meta.terms_version,'fixture');
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[member]);
  assert.equal(await total(),1);
  await db.query('update auth.users set email_confirmed_at=now(),raw_user_meta_data=raw_user_meta_data||$2 where id=$1',[member,JSON.stringify({campaign_visit_token:touch})]);
  await db.query('update auth.users set last_sign_in_at=now() where id=$1',[member]);
  assert.equal(await total(),1,'re-login/repeated confirmation/metadata do not add signups');
  await db.query('update auth.users set raw_user_meta_data=$2,email_confirmed_at=now() where id=$1',[oldMember,JSON.stringify({campaign_visit_token:touch})]);
  assert.equal(await total(),1,'existing accounts cannot acquire attribution through metadata edits');
  await signup(touch,{anonymous:true,confirmed:true});assert.equal(await total(),1);
  await signup(randomUUID(),{confirmed:true});assert.equal(await total(),1,'unknown tokens are not attributed');
  await signup(touch,{confirmed:true});assert.equal(await total(),2,'real auto-confirmed new accounts count');
  const failedUser=randomUUID();
  await db.exec(`create function public.reject_signup_fixture() returns trigger language plpgsql as $$begin if new.raw_user_meta_data->>'force_fail'='true' then raise exception 'fixture_rejected';end if;return new;end$$;
    create trigger fixture_guard after insert on auth.users for each row execute function public.reject_signup_fixture();`);
  await assert.rejects(()=>signup(touch,{id:failedUser,confirmed:true,meta:{force_fail:true}}),/fixture_rejected/);
  assert.equal(await total(),2,'existing signup validation failure rolls back the analytics write too');
  assert.equal(await value('select count(*)::integer as value from auth.users where id=$1',[failedUser]),0);
  const recovering=await signup(touch);
  await db.exec(`create function public.fail_measurement_fixture() returns trigger language plpgsql as $$begin raise exception 'fixture_measurement_failure' using errcode=current_setting('test.campaign_error');end$$;
    create trigger fixture_measurement before update on ojjuda_insights.campaign_totals for each row execute function public.fail_measurement_fixture();`);
  for(const errorCode of ['P0001','57014','55P03']) {
    await value("select set_config('test.campaign_error',$1,false) as value",[errorCode]);
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[recovering]);
    assert.equal(await value('select email_confirmed_at is not null as value from auth.users where id=$1',[recovering]),true,errorCode+': analytics failure cannot reject real confirmation');
    assert.equal(await total(),2);
  }
  await db.exec('drop trigger fixture_measurement on ojjuda_insights.campaign_totals');
  await db.query('update auth.users set email_confirmed_at=email_confirmed_at where id=$1',[recovering]);
  await db.query('update auth.users set email_confirmed_at=email_confirmed_at where id=$1',[recovering]);
  assert.equal(await total(),3,'a retry repairs a missed completion without duplicates');
  const identity=randomUUID();
  await db.query('insert into auth.identities values($1,$2,$3)',[identity,member,JSON.stringify({campaign_visit_token:touch,provider:'email'})]);
  await db.query('update auth.identities set identity_data=$2 where id=$1',[identity,JSON.stringify({campaign_visit_token:touch,provider:'email'})]);
  assert.deepEqual(await value('select identity_data as value from auth.identities where id=$1',[identity]),{provider:'email'});
  await db.exec("update ojjuda_insights.campaign_touches set expires_at=now()-interval '1 minute'");
  await signup(touch,{confirmed:true});assert.equal(await total(),3,'expired touch cannot attribute a new account');
  await db.exec('set role authenticated');await claim(member);
  assert.equal((await event(randomUUID())).accepted,false,'existing logged-in members/admins are not acquisition visits');
  await assert.rejects(()=>value('select public.admin_campaign_signup_stats() as value'),/admin_required/);
  await claim(admin);const report=await value('select public.admin_campaign_signup_stats() as value');
  assert.equal(report.totals.confirmed_signups,3);assert.equal(report.rows[0].content,'threads-onecard-20261121');
  assert.equal(report.rows[0].visits,1);assert.equal(report.rows[0].signup_starts,1);assert.equal(report.model,'session24h-confirm7d');
  assert.doesNotMatch(JSON.stringify(report),/token_hash|account_hash|fixture|@|phone|email|browser|user_id/);
  await db.exec('reset role');await claim(null);
  await db.exec("update ojjuda_insights.campaign_signup_checks set expires_at=now()-interval '1 minute';select ojjuda_insights.purge_campaigns()");
  assert.equal(await value('select count(*)::integer as value from ojjuda_insights.campaign_touches'),0);
  assert.equal(await value('select count(*)::integer as value from ojjuda_insights.campaign_signup_checks'),0);
  assert.equal(await total(),3,'purge removes short-lived links, not historical totals');
  await db.exec('update ojjuda_insights.campaign_limits set events=5000;set role anon');
  assert.equal((await event(randomUUID())).accepted,false,'bounded hourly ingestion');
  await db.close();
  console.log('PASS: campaign-only ingestion, privileges, confirmation-only signup, dedup, auth failure isolation and retention');
})().catch(error=>{console.error(error);process.exitCode=1;});
