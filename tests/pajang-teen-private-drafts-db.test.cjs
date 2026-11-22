const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {PGlite}=require('@electric-sql/pglite');
const migration=n=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',n),'utf8');
const questionData=JSON.parse(fs.readFileSync(path.join(__dirname,'../features/pajang/content/teen-questions.json'),'utf8')).questions;
const actors={teenA:'10000000-0000-4000-8000-000000000001',teenB:'10000000-0000-4000-8000-000000000002',adult:'10000000-0000-4000-8000-000000000003',admin:'10000000-0000-4000-8000-000000000004'};

test('teen-only drafts, moderation and reporting remain separate from adult services',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec([
    'create role anon;create role authenticated;create role service_role;',
    'create schema auth;',
    'create table auth.users(id uuid primary key, suspended boolean not null default false);',
    'create schema ojjuda_account_internal;',
    'create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date);',
    'create schema ojjuda_restaurants_internal;',
    'create table public.app_admins(user_id uuid primary key);',
    "create function auth.jwt() returns jsonb language sql stable set search_path='' as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;",
    "create function auth.uid() returns uuid language sql stable set search_path='' as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;",
    'create function ojjuda_restaurants_internal.member_allowed() returns boolean language sql stable as $$ select exists(select from auth.users where id=auth.uid() and not suspended) $$;',
    "create function ojjuda_restaurants_internal.require_member() returns uuid language plpgsql as $$ begin if not ojjuda_restaurants_internal.member_allowed() then raise exception 'member required' using errcode='42501';end if; return auth.uid(); end $$;",
    'create function public.is_admin() returns boolean language sql stable security definer as $$ select exists(select from public.app_admins where user_id=auth.uid()) $$;',
    "create function public.mask_banned(t text) returns text language sql stable as $$ select replace(t,'검사용금칙어','❤️❤️') $$;"
  ].join('\n'));
  await db.exec(migration('20261122163836_pajang_age_groups.sql'));
  await db.exec(migration('20261122170234_pajang_teen_private_drafts.sql'));
  for(const [name,id] of Object.entries(actors)){
    await db.query('insert into auth.users values($1,false)',[id]);
    await db.query('insert into ojjuda_account_internal.member_identity values($1,$2)',[
      id,name==='teenA'?'2010-01-01':name==='teenB'?'2011-01-01':'1988-01-01']);
  }
  await db.query('insert into public.app_admins values($1)',[actors.admin]);
  const login=async name=>db.query('select set_config($1,$2,false)',[
    'request.jwt.claims',JSON.stringify(name?{sub:actors[name]}:{})]);
  const invoke=async(action='state',data={})=>(await db.query(
    'select public.pajang_teen_draft($1,$2) as result',[action,data])).rows[0].result;
  const moderation=async(action,answer=null,report=null)=>(await db.query(
    'select public.admin_pajang_teen_moderation($1,$2,$3) as result',[action,answer,report])).rows[0].result;
  const fail=async(action,data={},code='42501')=>assert.rejects(
    ()=>invoke(action,data),e=>e.code===code,action);
  const sample=questionData[0];
  await login('teenA');
  const state=await invoke('state');
  assert.equal(state.mode,'private');
  assert.equal(state.questions.length,20);
  assert.equal(state.answers.length,0);
  assert.deepEqual(state.questions.map(q=>[q.id,q.question]),questionData.map(q=>[q.id,q.question]));
  assert.equal(Object.hasOwn(state,'people'),false);
  assert.equal(Object.hasOwn(state,'chat'),false);
  await fail('feed',{},'22023');
  await fail('state',{peer:actors.teenB},'22023');
  await fail('save',{questionId:'bad-id',body:'좋아요'},'22023');
  await fail('save',{questionId:sample.id,body:'  '},'22023');
  await fail('save',{questionId:sample.id,body:'a'.repeat(221)},'22023');
  await fail('save',{questionId:sample.id,body:42},'22023');
  const saved=await invoke('save',{questionId:sample.id,body:'내 답변과 검사용금칙어 이야기'});
  assert.equal(saved.body,'내 답변과 ❤️❤️ 이야기');
  assert.ok(saved.id);
  assert.equal((await invoke('state')).answers[0].body,saved.body);
  await invoke('save',{questionId:sample.id,body:'다르게 답해요'});
  assert.equal((await invoke('state')).answers.length,1);
  await login('teenB');
  assert.equal((await invoke('state')).answers.length,0,'other minors cannot see drafts');
  await fail('report',{answerId:saved.id,reason:'bullying'});
  await fail('block',{targetUser:actors.adult});
  await fail('block',{targetUser:actors.teenB});
  assert.deepEqual(await invoke('block',{targetUser:actors.teenA}),{blocked:true});
  assert.deepEqual(await invoke('block',{targetUser:actors.teenA}),{blocked:true});
  assert.deepEqual(await invoke('unblock',{targetUser:actors.teenA}),{blocked:false});
  const b=await invoke('save',{questionId:questionData[1].id,body:'나만 보는 내용'});
  await login('teenA');
  await assert.rejects(()=>moderation('queue'),e=>e.code==='42501');
  await login('admin');
  const pre=await moderation('queue');
  assert.equal(pre.reports.length,0);
  assert.equal(pre.drafts.length,2);
  assert.deepEqual(await moderation('approve',saved.id),{updated:true,status:'approved'});
  await login('teenA');
  assert.equal((await invoke('state')).answers[0].body,'다르게 답해요');
  await fail('report',{answerId:saved.id,reason:'bullying'});
  await login('teenB');
  assert.deepEqual(await invoke('report',{answerId:saved.id,reason:'bullying'}),{reported:true});
  await invoke('report',{answerId:saved.id,reason:'bullying'});
  await login('admin');
  const queue=await moderation('queue');
  assert.equal(queue.reports.length,1);
  assert.equal(queue.reports[0].reason,'bullying');
  const reportId=queue.reports[0].id;
  assert.deepEqual(await moderation('hide',saved.id),{updated:true,status:'hidden'});
  assert.deepEqual(await moderation('resolve',null,reportId),{resolved:true});
  assert.deepEqual(await moderation('resolve',null,reportId),{resolved:false});
  await login('teenB');
  await fail('report',{answerId:saved.id,reason:'bullying'});
  await fail('report',{answerId:b.id,reason:'other'});
  await login('teenA');
  await invoke('save',{questionId:sample.id,body:'고친 뒤 다시 비공개'});
  await login('admin');
  assert.equal((await moderation('queue')).drafts.find(x=>x.id===saved.id).status,'private');
  await login('teenA');
  assert.deepEqual(await invoke('delete',{questionId:sample.id}),{deleted:true});
  assert.deepEqual(await invoke('delete',{questionId:sample.id}),{deleted:false});
  assert.equal((await invoke('state')).answers.length,0);
  await login('adult');await fail('state');await fail('save',{questionId:sample.id,body:'무단 작성'});
  await login(null);await fail('state');
  await login('teenB');
  await db.query('update auth.users set suspended=true where id=$1',[actors.teenB]);
  await fail('state');
  const rights=await db.query("select has_schema_privilege('authenticated','pajang_teen_private','usage') as schema_visible,has_function_privilege('anon','public.pajang_teen_draft(text,jsonb)','execute') as anon_draft,has_function_privilege('authenticated','public.pajang_teen_draft(text,jsonb)','execute') as auth_draft");
  assert.deepEqual(rights.rows[0],{schema_visible:false,anon_draft:false,auth_draft:true});
  for(const table of ['questions','drafts','blocks','reports']){
    const row=(await db.query('select relrowsecurity from pg_class where oid=$1::regclass',['pajang_teen_private.'+table])).rows[0];
    assert.equal(row.relrowsecurity,true);
  }
});
