import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const directory=new URL('../supabase/migrations/',import.meta.url);
const read=name=>readFile(new URL(name,directory),'utf8');
const migration=await read('20261119044520_pajang_edit_answer_history.sql');
const today='2026-11-19';
const clock=sql=>sql.replaceAll('clock_timestamp()','public.answer_edit_test_now()');

async function fixture(t){
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema ojjuda_restaurants_internal;
    create schema ojjuda_account_internal; create schema ojjuda_account_deletion;
    create schema ojjuda_admin_internal;
    grant usage on schema auth to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,is_anonymous boolean not null default false,
      deleted_at timestamptz,banned_until timestamptz);
    create table public.profiles(id uuid primary key,nickname text);
    create table public.user_private(user_id uuid primary key,coins integer not null default 70,
      banned boolean not null default false,pending_deletion boolean not null default false);
    create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date,gender text);
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
    $$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create function public.is_banned(u uuid) returns boolean language sql stable security definer as $$
      select coalesce((select banned from public.user_private where user_id=u),false);
    $$;
    create function ojjuda_account_deletion.pending() returns boolean language sql stable security definer as $$
      select coalesce((select pending_deletion from public.user_private where user_id=auth.uid()),false);
    $$;
    create function ojjuda_restaurants_internal.member_allowed() returns boolean
      language plpgsql stable security definer set search_path='pg_catalog' as $$
    declare u uuid:=auth.uid();
    begin
      if u is null then return false; end if;
      return exists(select from auth.users a join public.profiles p on p.id=a.id
        where a.id=u and a.is_anonymous is not true and a.deleted_at is null
          and (a.banned_until is null or a.banned_until<=now()))
        and not coalesce(public.is_banned(u),false) and not ojjuda_account_deletion.pending();
    end; $$;
    create function ojjuda_restaurants_internal.require_member() returns uuid
      language plpgsql stable security definer set search_path='pg_catalog' as $$
    declare u uuid:=auth.uid();
    begin
      if u is null then raise exception 'sign_in_required' using errcode='42501'; end if;
      if not ojjuda_restaurants_internal.member_allowed() then
        raise exception 'member_unavailable' using errcode='42501';
      end if;
      return u;
    end; $$;
    create function public.ojjuda_location_preference(
      p_enabled boolean default null,p_expected_version bigint default null,p_account_id uuid default null
    ) returns jsonb language sql as $$select '{"enabled":false,"version":0}'::jsonb$$;
    create function public.answer_edit_test_now() returns timestamptz language sql as $$
      select current_setting('pajang.test_now')::timestamptz;
    $$;
    select set_config('pajang.test_now','2026-11-19T01:00:00Z',false);
    create table public.banned_base(word text primary key,active boolean not null default true);
    create table public.banned_words(word text primary key);
    create table public.banned_allow(phrase text primary key);
    create function public.norm_text(t text) returns text language sql immutable set search_path='pg_catalog' as $$
      select regexp_replace(lower(coalesce(t,'')),'[^가-힣ㄱ-ㅎㅏ-ㅣa-z]','','g');
    $$;
    -- Existing common policy, with synthetic dictionary entries only.
    create function public.has_banned(t text) returns boolean language plpgsql stable security definer set search_path='public' as $$
    declare n text; a record;
    begin
      n:=norm_text(t);
      if n='' then return false; end if;
      for a in select phrase from banned_allow loop n:=replace(n,norm_text(a.phrase),''); end loop;
      return exists(select from banned_base b where b.active and norm_text(b.word)<>'' and position(norm_text(b.word) in n)>0)
        or exists(select from banned_words w where norm_text(w.word)<>'' and position(norm_text(w.word) in n)>0);
    end; $$;
    insert into public.banned_words values('검사용금칙어');
    insert into public.banned_allow values('검사용금칙어 허용문구');
  `);
  const members=await read('20261117060900_pajang_members.sql');
  await db.exec(members.slice(0,members.indexOf('insert into storage.buckets')));
  await db.exec(`
    alter table pajang_private.people alter column age drop not null;
    alter table pajang_private.people add column location_enabled boolean not null default false,
      add column location_version bigint not null default 0;
    alter table pajang_private.answers add column slot text not null default 'am',
      drop constraint answers_pkey,add primary key(person,day,slot),
      add constraint answers_slot_check check(slot in ('am','pm'));
    create table pajang_private.region_choices(region text primary key);
    create table pajang_private.discovery_gender_opt_ins(person uuid primary key);
    create function pajang_private.answer_window(instant timestamptz)
      returns table(day date,slot text,next_at timestamptz) language sql stable strict set search_path='' as $$
      select local_time::date,case when local_time::time<time '12:00' then 'am' else 'pm' end,
        (local_time::date+case when local_time::time<time '12:00' then interval '12 hours' else interval '1 day' end) at time zone 'Asia/Seoul'
      from (select instant at time zone 'Asia/Seoul' as local_time) as clock;
    $$;
    create function pajang_private.question_for_window(date,text) returns jsonb language sql as $$
      select '{"id":42,"q":["검사용 오늘 질문"]}'::jsonb;
    $$;
  `);
  const feed=await read('20261117180000_pajang_answer_feed.sql');
  await db.exec(feed.slice(0,feed.indexOf('create or replace function public.pajang_member')));
  await db.exec(await read('20261118093216_pajang_answer_history_one_year.sql'));
  // Audited live additions are intentionally not replaced by the new migration.
  await db.exec(`
    alter table pajang_private.answers add column publication_window_days smallint not null default 30,
      add constraint publication_window_check check(publication_window_days in (30,365) and (publication_window_days=30 or archived));
    create function pajang_private.answer_is_visible(date,text,boolean,date,text,smallint)
      returns boolean language sql immutable set search_path='' as $$
      select $1 between $4-(case when $6=365 then 365 else 30 end-1) and $4
        and (($1=$4 and $2=$5) or ($3 and ($1<$4 or ($2='am' and $5='pm'))));
    $$;
    create table ojjuda_admin_internal.pajang_answer_moderation(person uuid,day date,slot text,primary key(person,day,slot));
    create view pajang_private.visible_answers as select a.* from pajang_private.answers a
      where not exists(select from ojjuda_admin_internal.pajang_answer_moderation h
        where (h.person,h.day,h.slot)=(a.person,a.day,a.slot));
    create view pajang_private.visible_messages as select * from pajang_private.messages;
    create table pajang_private.signal_balances(user_id uuid primary key,paid_remaining integer not null default 0);
    create table pajang_private.signal_packs(id text primary key,enabled boolean,price integer);
    create function pajang_private.signal_quota(p_user uuid,p_day date) returns jsonb language sql stable set search_path='' as $$
      select jsonb_build_object('freeRemaining',q.free_left,'paidRemaining',q.paid_left,
        'remaining',q.free_left+q.paid_left,'purchasingEnabled',false)
      from (select greatest(0,3-(select count(*)::integer from pajang_private.signals s
        join pajang_private.people p on p.id=s.src where p.owner_id=p_user and s.day=p_day)) as free_left,
        coalesce((select b.paid_remaining from pajang_private.signal_balances b where b.user_id=p_user),0) as paid_left) q;
    $$;
  `);
  const visibility=sql=>sql
    .replaceAll('a.archived,today,current_slot)','a.archived,today,current_slot,a.publication_window_days)')
    .replaceAll('a.archived,today,active_window.slot)','a.archived,today,active_window.slot,a.publication_window_days)')
    .replace(/\b(from|join)(\s+)pajang_private\.answers\b/gi,'$1$2pajang_private.visible_answers')
    .replace(/\b(from|join)(\s+)pajang_private\.messages\b/gi,'$1$2pajang_private.visible_messages');
  const latest=await read('20261118084120_shared_park_pajang_location.sql');
  let member=latest.slice(latest.indexOf('CREATE OR REPLACE FUNCTION public.pajang_member'),latest.indexOf('-- An older Park tab'));
  member=visibility(member)
    .replace('insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived)',
      'insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived,publication_window_days)')
    .replace("(p_data->'archive') is not distinct from 'true'::jsonb)",
      "(p_data->'archive') is not distinct from 'true'::jsonb,case when (p_data->'archive') is not distinct from 'true'::jsonb and p_data->>'publicationPolicy'='year-v1' then 365 else 30 end)")
    .replace("       if (select count(*) from pajang_private.signals where src=mine.id and day=today)>=3 then raise exception '오늘 보낼 신호를 모두 사용했어요.';end if;",
      "       if (select count(*) from pajang_private.signals where src=mine.id and day=today)>=3 then update pajang_private.signal_balances set paid_remaining=paid_remaining-1 where user_id=u and paid_remaining>0; if not found then raise exception '오늘 보낼 신호를 모두 사용했어요.';end if;end if;")
    .replace(' return result;\nend;',' return result||pajang_private.signal_quota(u,today);\nend;');
  await db.exec(clock(member));
  await db.exec(visibility(await read('20261118012000_pajang_owner_answer_history.sql')));
  await db.exec(await read('20261119040729_pajang_public_profile_preferences.sql'));
  await db.exec(`
    grant execute on function public.pajang_member(text,jsonb) to service_role;
    alter default privileges grant execute on functions to anon,authenticated,service_role;
    alter default privileges grant all on tables to anon,authenticated,service_role;
  `);
  const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
  const source=()=>value("select pg_get_functiondef('public.pajang_member(text,jsonb)'::regprocedure) as value");
  const metadata=()=>db.query(`select p.proacl,p.proowner,p.prosecdef,p.proconfig from pg_proc p
    where p.oid='public.pajang_member(text,jsonb)'::regprocedure`);
  const beforeSource=await source(),beforeMetadata=(await metadata()).rows;
  await db.exec(migration);
  const patchedSource=await source();
  assert.deepEqual((await metadata()).rows,beforeMetadata,'the patch preserves owner, ACL, definer and search_path');
  const as=async(actor,fn,role='authenticated',claims={})=>{
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor?.id||null,...claims})]);
    await db.exec(`set role ${role}`);
    try{return await fn();}finally{await db.exec('reset role');}
  };
  const seed=async(options={})=>{
    const actor={id:randomUUID(),person:randomUUID()};
    await db.query('insert into auth.users(id,is_anonymous) values($1,$2)',[actor.id,!!options.anonymous]);
    await db.query("insert into public.profiles values($1,'검사 회원')",[actor.id]);
    await db.query('insert into public.user_private(user_id,banned,pending_deletion) values($1,$2,$3)',[actor.id,!!options.banned,!!options.pending]);
    await db.query('insert into ojjuda_account_internal.member_identity values($1,$2,null)',[actor.id,options.minor?'2012-01-01':'1990-01-01']);
    if(!options.unjoined)await db.query("insert into pajang_private.people(id,owner_id,name,region,interest) values($1,$2,'검사 회원','서울특별시','walk')",[actor.person,actor.id]);
    return actor;
  };
  const answer=async(actor,day='2026-11-18',slot='pm',body='이전에 남긴 답변',options={})=>{
    await db.query(`insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived,publication_window_days)
      values($1,$2,$3,$4,$5,$6,$7,$8)`,[actor.person,day,slot,body,options.at??123456,options.question===null?null:'저장된 옛 질문',options.archived??true,options.window??30]);
    if(options.hidden)await db.query('insert into ojjuda_admin_internal.pajang_answer_moderation values($1,$2,$3)',[actor.person,day,slot]);
    return {day,slot,body};
  };
  const call=(actor,action,data={},role='authenticated',claims={})=>as(actor,()=>value('select public.pajang_member($1,$2) as value',[action,data]),role,claims);
  const edit=(actor,item,body='수정한 답변',overrides={})=>call(actor,'edit-history-answer',
    {day:item.day,slot:item.slot,body,previousBody:item.body,expectedPerson:actor.person,...overrides});
  const mine=actor=>as(actor,()=>value('select public.pajang_my_answers() as value'));
  const feedFor=actor=>as(actor,()=>value('select public.pajang_answer_feed() as value'));
  const row=(actor,item)=>value('select to_jsonb(a) as value from pajang_private.answers a where (person,day,slot)=($1,$2,$3)',[actor.person,item.day,item.slot]);
  const snapshot=()=>value(`select jsonb_build_object(
    'answers',(select jsonb_agg(to_jsonb(a) order by person,day,slot) from pajang_private.answers a),
    'people',(select jsonb_agg(to_jsonb(p) order by id) from pajang_private.people p),
    'signals',(select jsonb_agg(to_jsonb(s) order by src,dst) from pajang_private.signals s),
    'messages',(select jsonb_agg(to_jsonb(m) order by id) from pajang_private.messages m),
    'wallets',(select jsonb_agg(to_jsonb(w) order by user_id) from public.user_private w),
    'paid',(select jsonb_agg(to_jsonb(b) order by user_id) from pajang_private.signal_balances b),
    'preferences',(select jsonb_agg(to_jsonb(p) order by person) from pajang_private.public_profile_preferences p),
    'moderation',(select jsonb_agg(to_jsonb(h) order by person,day,slot) from ojjuda_admin_internal.pajang_answer_moderation h)) as value`);
  return {db,value,source,beforeSource,patchedSource,as,seed,answer,call,edit,mine,feedFor,row,snapshot};
}

const rejects=(operation,code,message)=>assert.rejects(operation,error=>error.code===code&&(!message||error.message===message));
const unavailable='수정할 답변을 찾을 수 없어요. 목록을 다시 열어 주세요.';

test('past-answer edits preserve ownership, shared policy, publication and current-round behavior',async t=>{
  const f=await fixture(t);
  const {db,value,source,beforeSource,patchedSource,as,seed,answer,call,edit,mine,feedFor,row,snapshot}=f;

  await t.test('updates the selected past body while preserving every unrelated row and field',async()=>{
    const actor=await seed(),peer=await seed();
    const item=await answer(actor,'2026-11-18','pm','옛 답변',{window:365});
    await answer(actor,today,'am','오늘 답변');
    await answer(peer,'2026-11-18','pm','상대 답변');
    await db.query('insert into pajang_private.signals values($1,$2,$3,$4,987)',[actor.person,peer.person,today,'이미 보낸 신호']);
    await db.query('insert into pajang_private.signals values($1,$2,$3,$4,988)',[peer.person,actor.person,today,'이미 받은 신호']);
    await db.query('insert into pajang_private.messages values($1,$2,$3,$4,989)',[randomUUID(),actor.person,peer.person,'기존 대화']);
    await db.query('insert into pajang_private.signal_balances values($1,5)',[actor.id]);
    const before=await snapshot(),saved=await row(actor,item);
    const response=await edit(actor,item,'새로운 지난 답변',{person:peer.person,owner_id:peer.id});
    assert.equal(response.authenticated,true);assert.equal(response.me.id,actor.person);
    assert.equal(response.me.body,'오늘 답변');assert.equal(response.remaining,7);
    assert.deepEqual(await row(actor,item),{...saved,body:'새로운 지난 답변'});
    const after=await snapshot();
    assert.deepEqual(after,{...before,answers:before.answers.map(a=>a.person===actor.person&&a.day===item.day&&a.slot===item.slot?{...a,body:'새로운 지난 답변'}:a)});
    assert.equal((await mine(actor)).find(a=>a.day===item.day&&a.slot===item.slot).body,'새로운 지난 답변');
  });

  await t.test('same-body retries are idempotent and stale or missing previous bodies cannot overwrite',async()=>{
    const actor=await seed(),item=await answer(actor);
    await edit(actor,item,'첫 수정');const first=await snapshot();
    await edit(actor,item,'첫 수정');assert.deepEqual(await snapshot(),first);
    await rejects(()=>edit(actor,item,'오래된 창의 수정'),'PT412');
    await rejects(()=>edit(actor,item,'다른 수정',{previousBody:null}),'PT412');
    assert.deepEqual(await snapshot(),first);
    await edit(actor,{...item,body:'첫 수정'},'두 번째 수정');
    assert.equal((await row(actor,item)).body,'두 번째 수정');
  });

  await t.test('expectedPerson is mandatory and cannot select another account or resurrect a deleted answer',async()=>{
    const actor=await seed(),other=await seed(),item=await answer(actor);
    const before=await snapshot();
    for(const expectedPerson of [null,'',other.person])await rejects(()=>edit(actor,item,'새 답변',{expectedPerson}),'42501');
    await rejects(()=>edit(other,item,'계정이 바뀐 요청',{expectedPerson:actor.person}),'42501');
    await rejects(()=>edit(other,item,'타인의 답변 수정'),'PT409',unavailable);
    assert.deepEqual(await snapshot(),before);
    await db.query('delete from pajang_private.answers where person=$1',[actor.person]);
    await rejects(()=>edit(actor,item),'PT409',unavailable);
    assert.equal(await row(actor,item),undefined);
  });

  await t.test('matches owner-history eligibility for hidden, unknown-question and future rounds',async()=>{
    const actor=await seed();
    const hidden=await answer(actor,'2026-11-17','am','숨김 원문',{hidden:true});
    const unknown=await answer(actor,'2026-11-17','pm','질문 없는 원문',{question:null});
    const futureDay=await answer(actor,'2026-11-20','am');
    const futureSlot=await answer(actor,today,'pm');
    const before=await snapshot();
    for(const item of [hidden,unknown,futureDay,futureSlot])await rejects(()=>edit(actor,item),'PT409',unavailable);
    assert.deepEqual(await mine(actor),[]);assert.deepEqual(await snapshot(),before);
  });

  await t.test('expired and non-archived own history stays private after editing',async()=>{
    const actor=await seed(),viewer=await seed();
    const expired=await answer(actor,'2025-01-01','am','기간 지난 답변',{window:365});
    const privateRound=await answer(actor,'2026-11-18','pm','당시만 공개한 답변',{archived:false});
    assert.equal((await mine(actor)).length,2);
    const publicBefore=(await feedFor(viewer)).items;
    for(const item of [expired,privateRound]){
      const before=await row(actor,item);await edit(actor,item,'고친 지난 답변');
      assert.deepEqual(await row(actor,item),{...before,body:'고친 지난 답변'});
    }
    assert.deepEqual((await feedFor(viewer)).items,publicBefore);
  });

  await t.test('uses the common banned-word policy and allow list without changing failed submissions',async()=>{
    const actor=await seed(),item=await answer(actor),before=await snapshot();
    await assert.rejects(()=>edit(actor,item,'검 사 용 금 칙 어'),error=>error.code==='P0001'&&error.message==='banned_word'&&error.hint==='욕설, 음란, 마약 관련 표현은 쓸 수 없어요');
    assert.deepEqual(await snapshot(),before);
    await edit(actor,item,'검사용금칙어 허용문구');
    const saved=await row(actor,item);
    assert.equal(saved.body,'검사용금칙어 허용문구');
    await db.exec('delete from public.banned_allow');
    await edit(actor,item,'검사용금칙어 허용문구');
    assert.deepEqual(await row(actor,item),saved,'a completed unchanged retry follows the common trigger semantics');
  });

  await t.test('checks body length and valid day/slot input before writing',async()=>{
    const actor=await seed(),item=await answer(actor),before=await snapshot();
    for(const body of ['', '   ', '가'.repeat(221)])await rejects(()=>edit(actor,item,body),'P0001');
    for(const fields of [{day:null},{day:'2026-02-30'},{day:'infinity'},{day:'2026-1-1'},{slot:null},{slot:'night'}])
      await rejects(()=>edit(actor,item,'수정',fields),'22023');
    assert.deepEqual(await snapshot(),before);
    await edit(actor,item,'  '+ '가'.repeat(220)+'  ');
    assert.equal((await row(actor,item)).body.length,220);
  });

  await t.test('preserves member bans, withdrawal, age, participation and anonymous authorization',async()=>{
    const actor=await seed(),item=await answer(actor);
    for(const options of [{banned:true},{pending:true},{minor:true},{anonymous:true},{unjoined:true}]){
      const restricted=await seed(options);
      await rejects(()=>edit(restricted,item),'42501');
    }
    await rejects(()=>call(null,'edit-history-answer',{}),'42501');
    await rejects(()=>call(actor,'edit-history-answer',{},'anon'),'42501');
    await rejects(()=>call(actor,'edit-history-answer',{},'authenticated',{is_anonymous:true}),'42501');
    await rejects(()=>as(actor,()=>value('select body as value from pajang_private.answers')),'42501');
    await rejects(()=>as(actor,()=>db.query('update pajang_private.answers set body=$1 where person=$2',['직접 수정',actor.person])),'42501');
    assert.equal((await row(actor,item)).body,item.body);
  });

  await t.test('keeps original current-answer CAS, question guard and boundary-time PT409 behavior',async()=>{
    const actor=await seed(),item=await answer(actor,today,'am','오전 원문');
    const request={day:today,slot:'am',questionId:42,body:'오늘 수정',previousBody:item.body};
    await rejects(()=>call(actor,'edit-answer',{...request,questionId:41}),'PT409');
    await rejects(()=>call(actor,'edit-answer',{...request,day:'2026-11-18'}),'PT409');
    const saved=await row(actor,item);
    await call(actor,'edit-answer',request);
    assert.deepEqual(await row(actor,item),{...saved,body:'오늘 수정'});
    await call(actor,'edit-answer',request);
    await rejects(()=>call(actor,'edit-answer',{...request,body:'오래된 현재창'}),'PT412');
    await db.exec("select set_config('pajang.test_now','2026-11-19T03:01:00Z',false)");
    await rejects(()=>call(actor,'edit-answer',{...request,previousBody:'오늘 수정',body:'시간 지난 창'}),'PT409');
    const response=await edit(actor,{...item,body:'오늘 수정'},'지난 오전 수정');
    assert.equal(response.slot,'pm');assert.equal(response.me.body,undefined);
    assert.deepEqual(await row(actor,item),{...saved,body:'지난 오전 수정'});
    await db.exec("select set_config('pajang.test_now','2026-11-19T01:00:00Z',false)");
  });

  await t.test('preserves concurrent shared validation and fails closed when an audited anchor changes',async()=>{
    const decorated=beforeSource.replace('begin\n if coalesce','begin\n -- concurrent shared policy remains installed\n if coalesce');
    await db.exec(decorated);
    await db.exec(`create function public.answer_edit_test_guard() returns trigger language plpgsql as $$
      begin
        if new.body is distinct from old.body and public.has_banned(new.body) then
          raise exception 'banned_word' using errcode='P0001';
        end if;
        return new;
      end; $$;
      create trigger answer_edit_test_guard before update of body on pajang_private.answers
        for each row execute function public.answer_edit_test_guard();`);
    const trigger=await value("select pg_get_triggerdef(oid) as value from pg_trigger where tgname='answer_edit_test_guard'");
    await db.exec(migration);
    assert.match(await source(),/concurrent shared policy remains installed/);
    assert.equal(await value("select pg_get_triggerdef(oid) as value from pg_trigger where tgname='answer_edit_test_guard'"),trigger);
    const actor=await seed(),item=await answer(actor);
    await rejects(()=>edit(actor,item,'검사용금칙어'),'P0001');
    const changed=beforeSource.replace('known_age int;','known_age integer;');
    await db.exec(changed);
    await rejects(()=>db.exec(migration),'55000');
    assert.equal(await source(),changed,'an unexpected live definition remains untouched');
    await db.exec(patchedSource);
  });
});
