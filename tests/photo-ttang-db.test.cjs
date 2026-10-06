const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003',D='00000000-0000-4000-8000-000000000004',E='00000000-0000-4000-8000-000000000005',F='00000000-0000-4000-8000-000000000006',G='00000000-0000-4000-8000-000000000007';
(async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create schema storage;
   create table auth.users(id uuid primary key,is_anonymous boolean default false);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,storage to anon,authenticated,service_role;
   create table public.friendships(requester uuid,addressee uuid,status text);
   create table public.app_admins(user_id uuid);
   create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from app_admins where user_id=auth.uid())$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
   create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
   alter table storage.objects enable row level security;
   grant select,insert,delete on storage.objects to anon,authenticated;
   insert into auth.users(id) values('${A}'),('${B}'),('${C}'),('${D}'),('${E}'),('${F}'),('${G}');
   update auth.users set is_anonymous=true where id='${G}';
   create schema ojjuda_account_internal;
   create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date not null);
   create function ojjuda_account_internal.age_on(p_birth date,p_today date) returns integer language sql immutable strict as $$
    select extract(year from p_today)::integer-extract(year from p_birth)::integer-case when to_char(p_today,'MMDD')<to_char(p_birth,'MMDD') then 1 else 0 end;
   $$;
   insert into ojjuda_account_internal.member_identity values
    ('${A}',(now() at time zone 'Asia/Seoul')::date-interval '30 years'),
    ('${B}',(now() at time zone 'Asia/Seoul')::date-interval '19 years'),
    ('${C}',(now() at time zone 'Asia/Seoul')::date-interval '20 years'),
    ('${D}',(now() at time zone 'Asia/Seoul')::date-interval '35 years'),
    ('${E}',(now() at time zone 'Asia/Seoul')::date-interval '19 years'+interval '1 day'),
    ('${G}',(now() at time zone 'Asia/Seoul')::date-interval '40 years');
   insert into app_admins values('${D}');insert into friendships values('${A}','${B}','accepted');`);
  const folder=path.join(__dirname,'../supabase/migrations'),file=fs.readdirSync(folder).find(x=>x.endsWith('_photo_ttang_stages.sql'));
  await db.exec(fs.readFileSync(path.join(folder,file),'utf8').replace('create extension if not exists pgcrypto;',''));
  await db.exec(fs.readFileSync(path.join(folder,fs.readdirSync(folder).find(x=>x.endsWith('_photo_ttang_adult_access.sql'))),'utf8'));
  async function as(actor,sql,params=[],role='authenticated'){
   return db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);await tx.exec('set local role '+role);return tx.query(sql,params);});
  }
  async function stage(actor,vis){return (await as(actor,`insert into photo_stages(owner,image_path,full_path,mask_rle,visibility,status,sil_pct,created_at) values($1,$2,$3,'400,400',$4,$5,40,'2000-01-01') returning id,created_at`,[actor,actor+'/'+vis+'.jpg',actor+'/'+vis+'-full.jpg',vis,vis==='public'?'pending':'approved'])).rows[0];}
  const pending=await stage(A,'public'),friends=await stage(A,'friends'),privateStage=await stage(A,'private');
  await db.exec(`insert into storage.objects(bucket_id,name) select 'photo-stages',image_path from photo_stages union all select 'photo-stages',full_path from photo_stages;`);
  assert.ok(new Date(pending.created_at).getFullYear()>2025,'server sets upload time');
  assert.equal((await as(B,'select id from photo_stages')).rows.length,1,'accepted friend sees friends stage');
  assert.equal((await as(C,'select id from photo_stages')).rows.length,0,'other member sees no pending/private/friends stages');
  assert.equal((await as(null,'select id from photo_stages',[],'anon')).rows.length,0,'guest sees no unapproved stages');
  assert.equal((await as(B,'select name from storage.objects')).rows.length,2,'friend sees matching files only');
  assert.equal((await as(C,'select name from storage.objects')).rows.length,0,'private files stay private');
  await assert.rejects(()=>as(C,'select photo_set_visibility($1,$2)',[privateStage.id,'public']),/not allowed/);
  await assert.rejects(()=>as(null,'select photo_set_visibility($1,$2)',[privateStage.id,'public']),/not allowed/);
  await assert.rejects(()=>as(null,'select photo_set_visibility($1,$2)',[privateStage.id,'public'],'anon'),/permission denied/);
  await assert.rejects(()=>as(C,'select photo_report($1,$2)',[privateStage.id,'test']),/not allowed/);
  const queue=await as(D,"select id from photo_stages where visibility='public' and status='pending'");assert.deepEqual(queue.rows.map(r=>r.id),[pending.id],'World admins can review public uploads before approval');
  await assert.rejects(()=>as(C,'select photo_set_status($1,$2)',[pending.id,'approved']),/not allowed/);
  await as(D,'select photo_set_status($1,$2)',[pending.id,'approved']);
  assert.equal((await as(C,'select id from photo_stages')).rows.length,1,'approval enables public play for an adult');
  assert.equal((await as(null,'select id from photo_stages',[],'anon')).rows.length,0,'guests cannot play approved photos');
  assert.equal((await as(C,'select name from storage.objects')).rows.length,2,'an adult can obtain approved photo files');
  assert.equal((await as(null,'select name from storage.objects',[],'anon')).rows.length,0,'guests cannot obtain photo files');
  for(const actor of [E,F,G]){
   assert.equal((await as(actor,'select ojjuda_photo_internal.member_allowed() as allowed')).rows[0].allowed,false);
   assert.equal((await as(actor,'select id from photo_stages')).rows.length,0,'minor, missing birth date and anonymous accounts cannot read photos');
   assert.equal((await as(actor,'select name from storage.objects')).rows.length,0,'photo file access is restricted too');
   await assert.rejects(()=>stage(actor,'private'),/row-level security/);
   await assert.rejects(()=>as(actor,"insert into storage.objects(bucket_id,name) values('photo-stages',$1)",[actor+'/new.jpg']),/row-level security/);
   await as(actor,'select photo_record($1,true)',[pending.id]);
  }
  assert.equal((await db.query('select clears from photo_stages where id=$1',[pending.id])).rows[0].clears,0,'definer RPC cannot bypass the age limit');
  assert.equal((await as(B,'select ojjuda_photo_internal.member_allowed() as allowed')).rows[0].allowed,true,'the 19th birthday is allowed');
  await as(B,'select photo_record($1,true)',[pending.id]);
  assert.equal((await db.query('select clears from photo_stages where id=$1',[pending.id])).rows[0].clears,1);
  await db.exec(`insert into storage.objects(bucket_id,name) values('other-bucket','unrelated');create policy other_bucket_read on storage.objects for select using(bucket_id='other-bucket');`);
  assert.equal((await as(E,"select name from storage.objects where bucket_id='other-bucket'")).rows.length,1,'other games and buckets keep their original access');
  for(const actor of [A,B,C])await as(actor,'select photo_report($1,$2)',[pending.id,'test']);
  const after=(await db.query('select status,report_count from photo_stages where id=$1',[pending.id])).rows[0];
  assert.deepEqual(after,{status:'hidden',report_count:3});
  assert.equal((await as(null,"select name from storage.objects where bucket_id='photo-stages'",[],'anon')).rows.length,0,'hidden photo no longer readable');
  await stage(A,'private');await stage(A,'private');await assert.rejects(()=>stage(A,'private'),/하루에 5장/);
  await assert.rejects(()=>as(C,`insert into photo_stages(owner,image_path,mask_rle) values($1,$2,'1')`,[C,A+'/other.jpg']),/row-level security/);
  console.log('PASS: server 19th-birthday boundary, guest/minor/anonymous/missing-identity data and storage gates, RPC protection, admin approval, friends, reports, daily cap and other buckets');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
