const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.join(__dirname,'..');
(async()=>{const db=new PGlite();try{
 const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003';
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema ojjuda_account_internal;create schema ojjuda_photo_internal;
 create table auth.users(id uuid primary key,is_anonymous boolean default false);
 create table public.user_private(user_id uuid primary key,coins integer,last_checkin date,banned_until timestamptz);
 create table ojjuda_account_internal.member_identity(user_id uuid,birth_date date);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function ojjuda_account_internal.age_on(date,date) returns integer language sql immutable strict as $$select extract(year from age($2,$1))::integer$$;
 grant usage on schema auth,ojjuda_photo_internal to anon,authenticated;
 create function public.daily_checkin() returns json language plpgsql security definer set search_path=public as $$
 declare d date:=(now() at time zone 'Asia/Seoul')::date;c integer;
 begin update user_private set coins=coins+1,last_checkin=d where user_id=auth.uid() and (last_checkin is null or last_checkin<d) returning coins into c;
 return json_build_object('ok',found,'coins',c);end$$;
 create function ojjuda_photo_internal.member_allowed() returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from ojjuda_account_internal.member_identity m join auth.users u on u.id=m.user_id
 where m.user_id=auth.uid() and u.is_anonymous is not true and ojjuda_account_internal.age_on(m.birth_date,(now() at time zone 'Asia/Seoul')::date)>=19)$$;
 insert into auth.users values('${A}',false),('${B}',false),('${C}',true);
 insert into public.user_private values('${A}',10,null,null),('${B}',20,null,now()+interval '1 day'),('${C}',30,null,null);
 insert into ojjuda_account_internal.member_identity values('${A}',(now() at time zone 'Asia/Seoul')::date-interval '19 years'),('${B}',(now() at time zone 'Asia/Seoul')::date-interval '30 years'),('${C}',(now() at time zone 'Asia/Seoul')::date-interval '30 years');
 create table public.photo_fixture(id integer);insert into photo_fixture values(1);
 alter table photo_fixture enable row level security;
 create policy adult_read on photo_fixture for select to authenticated using(ojjuda_photo_internal.member_allowed());
 create policy adult_insert on photo_fixture for insert to authenticated with check(ojjuda_photo_internal.member_allowed());
 grant select,insert on photo_fixture to authenticated;`);
 const signatures=['accept_friend(text)','game_answer(uuid,boolean)','game_cancel(uuid)','game_invite(text,uuid)','game_resign(uuid)','record_visit(uuid)','touch_last_seen()'];
 for(const s of signatures)await db.exec(`create function public.${s} returns void language sql as $$select$$`);
 const as=async(actor,sql,role='authenticated')=>db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);await tx.exec('set local role '+role);
  return (await tx.query(sql)).rows;
 });
 const checkin=actor=>as(actor,'select public.daily_checkin() as result').then(r=>r[0].result);
 const allowed=actor=>as(actor,'select ojjuda_photo_internal.member_allowed() as result').then(r=>r[0].result);
 // Prove the reported gap with the previously deployed definitions in an isolated database.
 assert.equal(await allowed(B),true);
 assert.equal((await checkin(B)).ok,true);
 await db.exec(`update user_private set coins=20,last_checkin=null where user_id='${B}'`);
 const file=fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_enforce_member_restrictions_and_rpc_access.sql'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
 assert.equal(await allowed(B),false);assert.deepEqual(await checkin(B),{ok:false,reason:'banned',coins:20});
 assert.equal((await as(B,'select * from photo_fixture')).length,0);
 await assert.rejects(()=>as(B,'insert into photo_fixture values(2)'),/row-level security/);
 assert.equal(await allowed(A),true,'the 19th birthday remains eligible');
 assert.deepEqual(await checkin(A),{ok:true,coins:11,reward:1});assert.deepEqual(await checkin(A),{ok:false,coins:11});
 await db.exec(`update user_private set banned_until=now()-interval '1 second' where user_id='${B}'`);
 assert.equal(await allowed(B),true);assert.deepEqual(await checkin(B),{ok:true,coins:21,reward:1});
 await db.exec(`update ojjuda_account_internal.member_identity set birth_date=(now() at time zone 'Asia/Seoul')::date-interval '19 years'+interval '1 day' where user_id='${B}'`);
 assert.equal(await allowed(B),false,'the day before the 19th birthday is denied');
 assert.equal(await allowed(C),false);await assert.rejects(()=>checkin(C),/not_signed_in/);
 await assert.rejects(()=>checkin(null),/not_signed_in/);
 await db.exec(`delete from auth.users where id='${A}'`);
 assert.equal(await allowed(A),false);await assert.rejects(()=>checkin(A),/not_signed_in/);
 for(const signature of [...signatures,'daily_checkin()']){
  const rows=await db.query("select has_function_privilege('anon',$1,'execute') as guest,has_function_privilege('authenticated',$1,'execute') as member",[signature]);
  assert.deepEqual(rows.rows[0],{guest:false,member:true});
 }
 console.log('PASS: reproduced and blocked restricted-account rewards/photo access; birthday boundary, expired bans, one reward per day, anonymous/deleted users and member-only RPC grants');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
