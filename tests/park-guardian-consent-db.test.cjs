const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const {pgcrypto} = require('@electric-sql/pglite/contrib/pgcrypto');
const migration = name => fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8');

async function createGuardianDb(t) {
  const db=new PGlite({extensions:{pgcrypto}});
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role authenticator;
    create schema auth; create schema ojjuda_note; create schema ojjuda_note_internal; create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema cron;
    create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table auth.users(id uuid primary key, email text unique, encrypted_password text,
      raw_user_meta_data jsonb, raw_app_meta_data jsonb, role text not null default 'authenticated',
      created_at timestamptz not null default now(), banned_until timestamptz, is_anonymous boolean default false);
    create table public.app_admins(user_id uuid primary key);
    create function public.is_admin() returns boolean language sql security definer as $$
      select exists(select from public.app_admins where user_id=auth.uid())
    $$;
    create table public.profiles(id uuid primary key,nickname text not null);
    create table public.user_private(user_id uuid primary key, coins bigint not null default 0, banned_until timestamptz);
    alter table public.profiles enable row level security;
    alter table public.user_private enable row level security;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role',true),'')
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object('sub',auth.uid(),'role',auth.role())
    $$;
    create table ojjuda_note_internal.card_locations(card_id uuid primary key,author_id uuid not null,exact_lat double precision,exact_lon double precision);
  `);
  for(const name of ['20260928151422_member_identity_and_card_gender.sql','20260929145656_signup_age_14_plus.sql',
    '20261106222158_admin_permanent_ban_and_signup_validation.sql','20261106223617_signup_reserve_domains.sql']){
    await db.exec(migration(name));
  }
  await db.exec(`create table ojjuda_account_internal.location_preferences(user_id uuid primary key,enabled boolean not null,version bigint not null)`);
  await db.exec(migration('20261125042000_park_guardian_consent.sql'));
  return db;
}

test('Park requires an operator-verified single-use signup grant and a separate guardian location decision',async t=>{
  const db=await createGuardianDb(t);
  const admin=randomUUID(), member=randomUUID();
  const v=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const actor=id=>db.query('select set_config($1,$2,false)',['request.jwt.claim.sub',id]);
  const dob=(years,days=0)=>v("select ((now() at time zone 'Asia/Seoul')::date-make_interval(years=>$1::int)+$2::int*interval '1 day')::date::text as value",[years,days]);
  const email='park-child-fixture@ojjuda.kr', guardian='park-guardian-fixture@ojjuda.kr';
  const twelve=await dob(12), thirteen=await dob(13), underTwelve=await dob(12,1), fourteen=await dob(14);
  let evidence=0;
  const record=(birth,allowed=false)=>v('select public.park_guardian_record_reply($1,$2,$3,$4,$5) as value',
    [email,birth,guardian,'test-reply-'+(++evidence),allowed]);
  const valid=code=>v('select public.park_guardian_code_valid($1) as value',[code]);
  const choice=d=>db.query('select public.park_guardian_change_choice($1,$2,$3,$4)',
    [email,guardian,'test-change-'+(++evidence),d]);
  let phone=12345680;
  const signup=(id,address,birth,extra={})=>db.query(`insert into auth.users(id,email,encrypted_password,raw_user_meta_data)
     values($1,$2,'fixture',$3)`,[id,address,{birth_yymmdd:birth.slice(2).replaceAll('-',''),gender_code:'3',
       phone_number:'010'+(++phone),terms_version:'park-guardian-v1',park_signup:true,...extra}]);
  const locate=()=>db.query('insert into ojjuda_note_internal.card_locations values($1,$2,37.0,127.0)',[randomUUID(),member]);
  await db.query('insert into public.app_admins values($1)',[admin]); await actor(admin);
  assert.equal(await v('select public.park_guardian_signup_open() as value'),false);
  await assert.rejects(()=>record(twelve),/park_signup_not_open/);
  await db.exec(`update ojjuda_account_internal.park_guardian_release set enabled=true`);
  await db.exec(`update ojjuda_account_internal.park_guardian_release set opens_at=now()+interval '1 day'`);
  assert.equal(await v('select public.park_guardian_signup_open() as value'),false);
  await db.exec(`update ojjuda_account_internal.park_guardian_release set opens_at=now()-interval '1 day'`);
  await actor(member);
  await assert.rejects(()=>record(twelve),/not_admin/);
  await actor(admin);
  await assert.rejects(()=>record(underTwelve),/invalid_guardian_reply/);
  await assert.rejects(()=>record(fourteen),/invalid_guardian_reply/);
  const first=await record(thirteen), code=await record(twelve);
  assert.equal(await valid(first),false);
  assert.equal(await valid(code),true);
  await assert.rejects(()=>signup(member,email,underTwelve,{park_guardian_code:code}),/signup_age_12/);
  await assert.rejects(()=>signup(member,email,twelve,{age_14_or_older:true}),/park_guardian_consent_required/);
  await assert.rejects(()=>signup(member,'other@example.kr',twelve,{park_guardian_code:code}),/park_guardian_consent_required/);
  await assert.rejects(()=>signup(member,email,thirteen,{park_guardian_code:code}),/park_guardian_consent_required/);
  assert.equal(await valid(code),true);
  await signup(member,email,twelve,{park_guardian_code:code});
  assert.equal(await valid(code),false);
  const account=(await db.query('select role,raw_user_meta_data,raw_app_meta_data from auth.users where id=$1',[member])).rows[0];
  assert.equal(account.role,'park_junior');
  assert.equal(account.raw_app_meta_data.park_guardian_account,true);
  assert.equal('park_guardian_code' in account.raw_user_meta_data,false);
  assert.equal(await v('select age_at_signup as value from ojjuda_account_internal.member_identity where user_id=$1',[member]),12);
  await assert.rejects(()=>signup(randomUUID(),'sibling@example.kr',twelve,{park_guardian_code:code}),/park_guardian_consent_required/);
  await assert.rejects(locate,/park_guardian_location_required/);
  await choice('allow_location'); await locate();
  await choice('withdraw_location');
  assert.equal(await v('select count(*)::int as value from ojjuda_note_internal.card_locations where author_id=$1',[member]),0);
  await assert.rejects(locate,/park_guardian_location_required/);
  await choice('withdraw_signup');
  assert.equal(await v('select banned_until=\'infinity\'::timestamptz as value from auth.users where id=$1',[member]),true);
  const ordinary=randomUUID();
  await signup(ordinary,'ordinary@example.kr',fourteen,{age_14_or_older:true,terms_version:'2026-11-20',park_signup:false});
  assert.equal(await v('select role as value from auth.users where id=$1',[ordinary]),'authenticated');
});

test('restricted Park sessions get their own profile, feed and drafts, and need separate consent for proximity and publishing',async t=>{
  const db=await createGuardianDb(t);
  const admin=randomUUID(), child=randomUUID(), adult=randomUUID(), existingCard=randomUUID();
  const email='park-access-fixture@example.kr', guardian='guardian@example.kr';
  const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const claims=(id,role)=>db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id||'',role||'']);
  const hook=()=>db.query('select public.check_park_junior_session()');
  const choice=async(decision)=>{
    await db.exec('reset role'); await claims(admin,'authenticated');
    await db.query('select public.park_guardian_change_choice($1,$2,$3,$4)',[email,guardian,'scope-'+decision,decision]);
    await claims(child,'park_junior'); await db.exec('set role park_junior');
  };
  // Keep the same public invoker/private definer boundaries and mandatory coordinates as the live Park RPCs.
  await db.exec(`
    create table ojjuda_note.cards(id uuid primary key default gen_random_uuid(),author_id uuid not null,body text not null);
    create view ojjuda_note_internal.visible_cards_feed with (security_barrier=true,security_invoker=false)
      as select id,body from ojjuda_note.cards;
    create view ojjuda_note.public_cards with (security_invoker=true) as select * from ojjuda_note_internal.visible_cards_feed;
    create function ojjuda_note.get_card(p_id uuid,p_lat double precision,p_lon double precision) returns text language plpgsql security definer as $$
BEGIN
      return (select body from ojjuda_note.public_cards where id=p_id);
    END; $$;
    create function ojjuda_note.list_cards(p_sort text,p_lat double precision,p_lon double precision,p_radius integer,p_limit integer,p_cursor jsonb)
      returns bigint language plpgsql security definer as $$
BEGIN
      return (select count(*) from ojjuda_note.public_cards);
    END; $$;
    create table ojjuda_note_internal.drafts(id uuid primary key,body jsonb);
    create function ojjuda_note_internal.save_draft(bigint,jsonb) returns void language sql security definer as $$
      insert into ojjuda_note_internal.drafts values(auth.uid(),$2) on conflict(id) do update set body=excluded.body
    $$;
    create function ojjuda_note_internal.read_draft() returns jsonb language sql security definer as $$
      select body from ojjuda_note_internal.drafts where id=auth.uid()
    $$;
    create function ojjuda_note_internal.discard_draft(bigint) returns void language sql security definer as $$
      delete from ojjuda_note_internal.drafts where id=auth.uid()
    $$;
    create function ojjuda_note.save_draft(bigint,jsonb) returns void language sql as $$select ojjuda_note_internal.save_draft($1,$2)$$;
    create function ojjuda_note.read_draft() returns jsonb language sql as $$select ojjuda_note_internal.read_draft()$$;
    create function ojjuda_note.discard_draft(bigint) returns void language sql as $$select ojjuda_note_internal.discard_draft($1)$$;
    create function ojjuda_note.publish_card(p_body text,p_lat double precision,p_lon double precision) returns uuid language plpgsql security definer as $$
    declare card uuid;
    begin
      if p_lat is null or p_lon is null then raise exception 'Invalid card input'; end if;
      if not exists(select from public.profiles p join public.user_private u on u.user_id=p.id where p.id=auth.uid()) then
        raise exception 'Card publishing unavailable'; end if;
      insert into ojjuda_note.cards(author_id,body) values(auth.uid(),p_body) returning id into card;
      insert into ojjuda_note_internal.card_locations values(card,auth.uid(),p_lat,p_lon);
      return card;
    end; $$;
    create function public.ojjuda_location_preference(boolean,bigint,uuid,boolean) returns jsonb language sql as $$ select '{}'::jsonb $$;
    revoke execute on all functions in schema ojjuda_note,ojjuda_note_internal from public;
    create schema unrelated_service;
    create function unrelated_service.enter() returns boolean language sql as $$select true$$;
    grant usage on schema unrelated_service to authenticated;
    revoke all on function unrelated_service.enter() from public;
    grant execute on function unrelated_service.enter() to authenticated;
  `);
  await db.exec(migration('20261125042200_park_junior_scope.sql'));
  assert.equal(await scalar("select pg_has_role('authenticator','park_junior','MEMBER') as value"),true);
  assert.equal(await scalar("select pg_has_role('park_junior','authenticated','MEMBER') as value"),false);
  assert.equal(await scalar("select 'pgrst.db_pre_request=public.check_park_junior_session'=any(rolconfig) as value from pg_roles where rolname='authenticator'"),true);
  await db.query('insert into public.app_admins values($1)',[admin]);
  await claims(admin,'authenticated'); await db.exec("update ojjuda_account_internal.park_guardian_release set enabled=true,opens_at=now()-interval '1 day'");
  const birth=await scalar("select ((now() at time zone 'Asia/Seoul')::date-interval '13 years')::date::text as value");
  const code=await scalar('select public.park_guardian_record_reply($1,$2,$3,$4,false) as value',[email,birth,guardian,'scope-proof']);
  const metadata={nickname:'공원친구',birth_yymmdd:birth.slice(2).replaceAll('-',''),gender_code:'3',phone_number:'01012345876',terms_version:'park-guardian-v1',park_signup:true,park_guardian_code:code};
  await db.query("insert into auth.users(id,email,encrypted_password,raw_user_meta_data) values($1,$2,'fixture',$3)",[child,email,metadata]);
  await db.query("update auth.users set role='authenticated',raw_app_meta_data='{}' where id=$1",[child]);
  assert.equal(await scalar("select role='park_junior' and raw_app_meta_data->>'park_guardian_account'='true' as value from auth.users where id=$1",[child]),true);
  const adultBirth=await scalar("select to_char((now() at time zone 'Asia/Seoul')::date-interval '20 years','YYMMDD') as value");
  await db.query("insert into auth.users(id,email,encrypted_password,raw_user_meta_data) values($1,$2,'fixture',$3)",
    [adult,'ordinary-access-fixture@example.kr',{birth_yymmdd:adultBirth,gender_code:'3',phone_number:'01012345877',terms_version:'2026-11-20',age_14_or_older:true}]);
  await db.query('insert into public.profiles values($1,$2)',[adult,'other']);
  await db.query('insert into public.user_private(user_id) values($1)',[adult]);
  await db.query('insert into ojjuda_note.cards values($1,$2,$3)',[existingCard,adult,'existing']);
  await claims(child,'park_junior'); await db.exec('set role park_junior'); await hook();
  assert.deepEqual((await db.query('select id,nickname from public.profiles')).rows,[{id:child,nickname:'공원친구'}]);
  assert.deepEqual((await db.query('select user_id from public.user_private')).rows,[{user_id:child}]);
  await assert.rejects(()=>db.query('select banned_until from public.user_private'),/permission denied/);
  await assert.rejects(()=>db.query('select * from ojjuda_account_internal.park_guardian_consents'),/permission denied/);
  await assert.rejects(()=>db.query('select unrelated_service.enter()'),/permission denied/);
  await assert.rejects(()=>db.query('select * from ojjuda_note.cards'),/permission denied/);
  assert.equal(await scalar('select body as value from ojjuda_note.public_cards'),'existing');
  const detail=(lat,lon)=>scalar('select ojjuda_note.get_card($1,$2,$3) as value',[existingCard,lat,lon]);
  const feed=(lat,lon)=>scalar("select ojjuda_note.list_cards('recent',$1,$2,1,10,null) as value",[lat,lon]);
  const publish=(lat,lon)=>scalar("select ojjuda_note.publish_card('new',$1,$2) as value",[lat,lon]);
  assert.equal(await detail(null,null),'existing');
  assert.equal(Number(await feed(null,null)),1);
  await db.query('select ojjuda_note.save_draft(0,$1)',[{body:'draft'}]);
  assert.deepEqual(await scalar('select ojjuda_note.read_draft() as value'),{body:'draft'});
  await db.query('select ojjuda_note.discard_draft(1)');
  assert.equal(await scalar('select ojjuda_note.read_draft() as value'),null);
  assert.equal(await scalar('select public.park_guardian_location_allowed() as value'),false);
  for(const op of [()=>detail(37,127),()=>feed(37,127),()=>publish(37,127)]) await assert.rejects(op,/park_guardian_location_required/);
  await assert.rejects(()=>publish(null,null),/Invalid card input/);
  assert.equal(Number(await feed(null,null)),1);
  await choice('allow_location'); await hook();
  assert.equal(await scalar('select public.park_guardian_location_allowed() as value'),true);
  assert.equal(await detail(37,127),'existing');
  assert.ok(await publish(37,127));
  assert.equal(Number(await feed(37,127)),2);
  await choice('withdraw_location'); await hook();
  await assert.rejects(()=>publish(37,127),/park_guardian_location_required/);
  assert.equal(Number(await feed(null,null)),2);
  await claims(child,'authenticated'); await db.exec('reset role;set role authenticated');
  await assert.rejects(hook,/park_membership_unavailable/);
  await claims(child,''); await assert.rejects(hook,/park_membership_unavailable/);
  await claims(null,'park_junior'); await assert.rejects(hook,/park_membership_unavailable/);
  await claims(adult,'park_junior'); await assert.rejects(hook,/park_membership_unavailable/);
  await claims(adult,'authenticated'); await hook();
  await claims(null,'anon'); await hook();
  await choice('withdraw_signup'); await assert.rejects(hook,/park_membership_unavailable/);
  await db.exec('reset role');
  assert.equal(Number(await scalar('select count(*) as value from ojjuda_note_internal.card_locations where author_id=$1',[child])),0);
  await db.query('delete from ojjuda_account_internal.park_guardian_consents where child_user_id=$1',[child]);
  await claims(child,'authenticated'); await db.exec('set role authenticated');
  await assert.rejects(hook,/park_membership_unavailable/);
});
