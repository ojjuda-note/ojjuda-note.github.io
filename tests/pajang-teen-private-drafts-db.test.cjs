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
    'create table public.profiles(id uuid primary key,nickname text);',
    "create function auth.jwt() returns jsonb language sql stable set search_path='' as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;",
    "create function auth.uid() returns uuid language sql stable set search_path='' as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;",
    'create function ojjuda_restaurants_internal.member_allowed() returns boolean language sql stable as $$ select exists(select from auth.users where id=auth.uid() and not suspended) $$;',
    "create function ojjuda_restaurants_internal.require_member() returns uuid language plpgsql as $$ begin if not ojjuda_restaurants_internal.member_allowed() then raise exception 'member required' using errcode='42501';end if; return auth.uid(); end $$;",
    'create function public.is_admin() returns boolean language sql stable security definer as $$ select exists(select from public.app_admins where user_id=auth.uid()) $$;',
    "create function public.mask_banned(t text) returns text language sql stable as $$ select replace(t,'검사용금칙어','❤️❤️') $$;"
  ].join('\n'));
  await db.exec(migration('20261122163836_pajang_age_groups.sql'));
  await db.exec(migration('20261122170234_pajang_teen_private_drafts.sql'));
  await db.exec(migration('20261122170500_pajang_teen_visible_feed.sql'));
  await db.exec(migration('20261122172528_pajang_teen_launch_gate.sql'));
  await db.exec(migration('20261122174320_pajang_teen_comment_cleanup.sql'));
  await db.exec(migration('20261122175134_pajang_teen_self_erasure.sql'));
  for(const [name,id] of Object.entries(actors)){
    await db.query('insert into auth.users values($1,false)',[id]);
    await db.query('insert into public.profiles values($1,$2)',[id,name==='teenA'?'새싹':name==='teenB'?'바람':name==='adult'?'어른':'관리자']);
    await db.query('insert into ojjuda_account_internal.member_identity values($1,$2)',[
      id,name==='teenA'?'2010-01-01':name==='teenB'?'2011-01-01':'1988-01-01']);
  }
  await db.query('insert into public.app_admins values($1)',[actors.admin]);
  const login=async name=>db.query('select set_config($1,$2,false)',[
    'request.jwt.claims',JSON.stringify(name?{sub:actors[name]}:{})]);
  const invoke=async(action='state',data={})=>(await db.query(
    'select public.pajang_teen_draft($1,$2) as result',[action,action==='save'?{...data,shareWithTeens:true}:data])).rows[0].result;
  const moderation=async(action,answer=null,report=null)=>(await db.query(
    'select public.admin_pajang_teen_moderation($1,$2,$3) as result',[action,answer,report])).rows[0].result;
  const fail=async(action,data={},code='42501')=>assert.rejects(
    ()=>invoke(action,data),e=>e.code===code,action);
  const feed=async question=>(await db.query('select public.pajang_teen_feed($1,20) as value',[question])).rows[0].value;
  const interact=async(action,target,data={})=>(await db.query('select public.pajang_teen_interact($1,$2,$3) as value',[action,target,data])).rows[0].value;
  const moderateComment=async(action,target=null)=>(await db.query('select public.admin_pajang_teen_comments($1,$2) as value',[action,target])).rows[0].value;
  const sample=questionData[0];
  await login('teenA');
  assert.deepEqual((await db.query('select public.pajang_teen_entry() as result')).rows[0].result,
    {ready:false,audience:'teen'});
  await fail('state');
  await assert.rejects(()=>db.query('select public.pajang_teen_feed($1,20)',[questionData[0].id]),error=>error.code==='42501');
  await db.query('update pajang_teen_private.release_control set enabled=true where singleton');
  assert.deepEqual((await db.query('select public.pajang_teen_entry() as result')).rows[0].result,
    {ready:true,audience:'teen'});
  const state=await invoke('state');
  assert.equal(state.mode,'community');
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
  await assert.rejects(()=>db.query("select public.pajang_teen_draft('save',$1)",[{questionId:sample.id,body:'동의 없는 답변'}]),error=>error.code==='22023');
  const saved=await invoke('save',{questionId:sample.id,body:'내 답변과 검사용금칙어 이야기'});
  assert.equal(saved.body,'내 답변과 ❤️❤️ 이야기');
  assert.ok(saved.id);
  assert.equal((await db.query('select share_consented_at is not null as agreed from pajang_teen_private.drafts where id=$1',[saved.id])).rows[0].agreed,true);
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
  // The approved answer is now visible to 14-18-year-olds only.
  await login('teenB');
  const peerFeed=await feed(sample.id);
  assert.equal(peerFeed.visibility,'teen-only');
  assert.equal(peerFeed.items.length,1);
  assert.equal(peerFeed.items[0].authorId,actors.teenA);
  assert.equal(peerFeed.items[0].body,'다르게 답해요');
  assert.equal(peerFeed.items[0].authorName,'새싹');
  assert.equal((await feed(questionData[1].id)).items.length,0);
  await assert.rejects(()=>feed('bad-id'),e=>e.code==='22023');
  const likeResult=await interact('like',saved.id,{liked:true});
  assert.deepEqual(likeResult,{liked:true,likeCount:1});
  assert.equal((await feed(sample.id)).items[0].likeCount,1);
  const comment=await interact('comment',saved.id,{body:'그렇게 생각할 수도 있겠네요.'});
  assert.equal(comment.status,'pending');
  assert.equal((await interact('comments',saved.id)).items[0].reviewStatus,'pending');
  assert.equal((await interact('comments',saved.id)).items[0].mine,true,'own pending comments are deletable');
  await login('teenA');
  assert.equal((await interact('comments',saved.id)).items.length,0,'unapproved comments are not public');
  await login('adult');
  await assert.rejects(()=>feed(sample.id),e=>e.code==='42501');
  await assert.rejects(()=>interact('comments',saved.id),e=>e.code==='42501');
  await assert.rejects(()=>interact('like',saved.id,{liked:true}),e=>e.code==='42501');
  await login('admin');
  const commentQueue=await moderateComment('queue');
  assert.equal(commentQueue.comments.length,1);
  assert.equal(commentQueue.comments[0].id,comment.id);
  assert.deepEqual(await moderateComment('approve',comment.id),{updated:true,status:'approved'});
  await login('teenA');
  const visibleComment=(await interact('comments',saved.id)).items[0];
  assert.equal(visibleComment.id,comment.id);
  assert.equal(visibleComment.body,'그렇게 생각할 수도 있겠네요.');
  assert.equal(visibleComment.authorId,actors.teenB);
  assert.equal(visibleComment.authorName,'바람');
  assert.equal(visibleComment.mine,false,'other members must not get author delete permission');
  assert.deepEqual(await interact('delete-comment',comment.id),{deleted:false},
    'the post owner cannot remove another member’s comment');
  assert.equal((await feed(sample.id)).items[0].commentCount,1);
  assert.deepEqual(await interact('report-comment',comment.id,{reason:'other'}),{reported:true});
  await login('admin');
  const reportQueue=await moderateComment('queue');
  assert.equal(reportQueue.reports.length,1);
  assert.equal(reportQueue.reports[0].body,'그렇게 생각할 수도 있겠네요.');
  assert.equal(reportQueue.reports[0].status,'approved');
  assert.deepEqual(await moderateComment('hide',comment.id),{updated:true,status:'hidden'});
  assert.deepEqual(await moderateComment('resolve-report',reportQueue.reports[0].id),{resolved:true});
  await login('teenB');
  assert.deepEqual(await interact('delete-comment',comment.id),{deleted:true},
    'comment author can withdraw an approved or hidden comment');
  assert.deepEqual(await interact('delete-comment',comment.id),{deleted:false},
    'a repeated delete does not reveal anyone else’s data');
  await login('admin');

  await login('teenA');
  assert.equal((await interact('comments',saved.id)).items.length,0);
  await login('teenB');
  assert.deepEqual(await invoke('block',{targetUser:actors.teenA}),{blocked:true});
  assert.equal((await feed(sample.id)).items.length,0,'blocked authors are excluded');
  await assert.rejects(()=>interact('like',saved.id,{liked:true}),e=>e.code==='42501');
  await invoke('unblock',{targetUser:actors.teenA});
  assert.equal((await feed(sample.id)).items.length,1);
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
  assert.equal(queue.reports[0].body,'다르게 답해요');
  assert.equal(queue.reports[0].status,'approved');
  const reportId=queue.reports[0].id;
  assert.deepEqual(await moderation('hide',saved.id),{updated:true,status:'hidden'});
  assert.deepEqual(await moderation('resolve',null,reportId),{resolved:true});
  assert.deepEqual(await moderation('resolve',null,reportId),{resolved:false});
  await login('teenB');
  assert.equal((await feed(sample.id)).items.length,0,'hidden answers are not publicly accessible');
  await assert.rejects(()=>interact('comments',saved.id),e=>e.code==='42501');
  await fail('report',{answerId:saved.id,reason:'bullying'});
  await fail('report',{answerId:b.id,reason:'other'});
  await login('teenA');
  await invoke('save',{questionId:sample.id,body:'고친 뒤 다시 비공개'});
  await login('admin');
  assert.equal((await moderation('queue')).drafts.find(x=>x.id===saved.id).status,'pending');
  await login('teenA');
  assert.deepEqual(await invoke('delete',{questionId:sample.id}),{deleted:true});
  assert.deepEqual(await invoke('delete',{questionId:sample.id}),{deleted:false});
  assert.equal((await invoke('state')).answers.length,0);
  await login('adult');
  assert.deepEqual((await db.query('select public.pajang_teen_entry() as result')).rows[0].result,
    {ready:false,audience:'restricted'});
  await fail('state');await fail('save',{questionId:sample.id,body:'무단 작성'});
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
  await db.query("insert into auth.users(id) select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(5,7) n");
  await db.query("insert into pajang_teen_private.drafts(owner_id,question_id,body,review_status,share_consented_at) select u.id,q.id,'Previously approved content','approved',now() from auth.users u cross join pajang_teen_private.questions q where u.id in ('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000007')");
  await login('admin');
  const pendingQueue=await moderation('queue');
  assert.equal(pendingQueue.drafts.length,1,'60 approved posts must not bury pending content');
  assert.equal(pendingQueue.drafts[0].id,b.id);
  // A member who becomes 19 is denied the teen feed but can still withdraw
  // their own past posts. A reported item is first hidden and held for review.
  await db.query('update auth.users set suspended=false where id=$1',[actors.teenB]);
  await db.query("update ojjuda_account_internal.member_identity set birth_date='1990-01-01' where user_id=$1",[actors.teenB]);
  await db.query('insert into pajang_teen_private.reports(reporter_id,draft_id,reason) values($1,$2,$3)',[actors.teenA,b.id,'other']);
  await login('teenB');
  await fail('state');
  const hold=(await db.query('select public.pajang_teen_erase_own() as value')).rows[0].value;
  assert.deepEqual(hold,{deleted:false,reviewHold:true});
  assert.equal((await db.query('select review_status from pajang_teen_private.drafts where id=$1',[b.id])).rows[0].review_status,'hidden');
  assert.equal((await db.query('select count(*)::int as n from pajang_teen_private.reports where draft_id=$1',[b.id])).rows[0].n,1);
  await db.query('delete from pajang_teen_private.reports where draft_id=$1',[b.id]); // synthetic moderator completion
  const removed=(await db.query('select public.pajang_teen_erase_own() as value')).rows[0].value;
  assert.equal(removed.deleted,true);
  assert.equal(removed.reviewHold,false);
  assert.equal(removed.deletedAnswers,1);
  assert.equal((await db.query('select count(*)::int as n from pajang_teen_private.drafts where id=$1',[b.id])).rows[0].n,0);
  await login('adult');
  assert.equal((await db.query('select public.pajang_teen_erase_own() as value')).rows[0].value.deleted,true);
  assert.equal((await db.query("select has_function_privilege('anon','public.pajang_teen_erase_own()','execute') as value")).rows[0].value,false);
  await login(null);
  await assert.rejects(()=>db.query('select public.pajang_teen_erase_own()'),error=>error.code==='42501');


});
