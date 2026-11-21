const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const directory=path.join(__dirname,'../../supabase/migrations');
const read=name=>fs.readFile(path.join(directory,name),'utf8');
const clock=sql=>sql.replaceAll('clock_timestamp()','public.answer_edit_test_now()');

async function fixture(t,migration){
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
    create view pajang_private.visible_answers with(security_invoker=true,security_barrier=true) as select a.* from pajang_private.answers a
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
  // Exercise the precise deployed feed definitions, not only reconstructed historical migrations.
  await db.exec(await fs.readFile(path.join(__dirname,'pajang-answer-feeds-before-likes.sql'),'utf8'));
  await db.exec(`
    revoke all on function public.pajang_discovery_feed(jsonb,text,text),
      public.pajang_discovery_feed(jsonb,text,text,text),public.pajang_answer_feed(jsonb)
      from public,anon,authenticated,service_role;
    grant execute on function public.pajang_discovery_feed(jsonb,text,text),
      public.pajang_discovery_feed(jsonb,text,text,text),public.pajang_answer_feed(jsonb) to authenticated;
    grant execute on function public.pajang_member(text,jsonb) to service_role;
    alter default privileges grant execute on functions to anon,authenticated,service_role;
    alter default privileges grant all on tables to anon,authenticated,service_role;
  `);
  const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
  const signatures=['public.pajang_my_answers()','public.pajang_answer_feed(jsonb)',
    'public.pajang_discovery_feed(jsonb,text,text,text)'];
  const definitions=async()=>{
    const result={};
    for(const signature of signatures){
      result[signature]=(await db.query(`select pg_get_functiondef(p.oid) as definition,
        p.proacl,p.proowner,p.prosecdef,p.proconfig from pg_proc p where p.oid=$1::regprocedure`,[signature])).rows[0];
    }
    return result;
  };
  const beforeDefinitions=await definitions();
  await db.exec(migration);
  const afterDefinitions=await definitions();
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
    if(options.deleted)await db.query('update auth.users set deleted_at=now() where id=$1',[actor.id]);
    if(options.suspended)await db.query("update auth.users set banned_until=now()+interval '1 year' where id=$1",[actor.id]);
    if(options.noProfile)await db.query('delete from public.profiles where id=$1',[actor.id]);
    if(!options.unjoined)await db.query("insert into pajang_private.people(id,owner_id,name,region,interest) values($1,$2,'검사 회원','서울특별시','walk')",[actor.person,actor.id]);
    return actor;
  };
  const answer=async(actor,day='2026-11-18',slot='pm',body='이전에 남긴 답변',options={})=>{
    await db.query(`insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived,publication_window_days)
      values($1,$2,$3,$4,$5,$6,$7,$8)`,[actor.person,day,slot,body,options.at??123456,options.question===null?null:'저장된 옛 질문',options.archived??true,options.window??30]);
    if(options.hidden)await db.query('insert into ojjuda_admin_internal.pajang_answer_moderation values($1,$2,$3)',[actor.person,day,slot]);
    return {peer:actor.person,day,slot,body};
  };
  const like=(actor,item,liked=true,role='authenticated',claims={},expectedPerson=actor?.person)=>as(actor,()=>value(
    'select public.pajang_answer_like($1,$2,$3,$4,$5) as value',
    [item.peer||item.person,item.day,item.slot,liked,expectedPerson]),role,claims);
  const mine=actor=>as(actor,()=>value('select public.pajang_my_answers() as value'));
  const feedFor=(actor,cursor=null)=>as(actor,()=>value('select public.pajang_answer_feed($1) as value',[cursor]));
  const discoveryFor=(actor,cursor=null,interest='all',order='latest',gender='all')=>as(actor,()=>value(
    'select public.pajang_discovery_feed($1,$2,$3,$4) as value',[cursor,interest,order,gender]));
  const snapshot=()=>value(`select jsonb_build_object(
    'answers',(select jsonb_agg(to_jsonb(a) order by person,day,slot) from pajang_private.answers a),
    'people',(select jsonb_agg(to_jsonb(p) order by id) from pajang_private.people p),
    'signals',(select jsonb_agg(to_jsonb(s) order by src,dst) from pajang_private.signals s),
    'messages',(select jsonb_agg(to_jsonb(m) order by id) from pajang_private.messages m),
    'wallets',(select jsonb_agg(to_jsonb(w) order by user_id) from public.user_private w),
    'paid',(select jsonb_agg(to_jsonb(b) order by user_id) from pajang_private.signal_balances b),
    'preferences',(select jsonb_agg(to_jsonb(p) order by person) from pajang_private.public_profile_preferences p),
    'moderation',(select jsonb_agg(to_jsonb(h) order by person,day,slot) from ojjuda_admin_internal.pajang_answer_moderation h)) as value`);
  return {db,value,as,seed,answer,like,mine,feedFor,discoveryFor,snapshot,definitions,beforeDefinitions,afterDefinitions};
}

module.exports={fixture};
