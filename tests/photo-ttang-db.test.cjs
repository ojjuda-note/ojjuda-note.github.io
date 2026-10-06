const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003',D='00000000-0000-4000-8000-000000000004';
(async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create schema storage;
   create table auth.users(id uuid primary key);
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
   insert into auth.users values('${A}'),('${B}'),('${C}'),('${D}');
   insert into app_admins values('${D}');insert into friendships values('${A}','${B}','accepted');`);
  const folder=path.join(__dirname,'../supabase/migrations'),file=fs.readdirSync(folder).find(x=>x.endsWith('_photo_ttang_stages.sql'));
  await db.exec(fs.readFileSync(path.join(folder,file),'utf8').replace('create extension if not exists pgcrypto;',''));
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
  assert.equal((await as(null,'select id from photo_stages',[],'anon')).rows.length,1,'approval enables public play');
  assert.equal((await as(null,'select name from storage.objects',[],'anon')).rows.length,2,'guest can obtain approved photo files only');
  for(const actor of [A,B,C])await as(actor,'select photo_report($1,$2)',[pending.id,'test']);
  const after=(await db.query('select status,report_count from photo_stages where id=$1',[pending.id])).rows[0];
  assert.deepEqual(after,{status:'hidden',report_count:3});
  assert.equal((await as(null,'select name from storage.objects',[],'anon')).rows.length,0,'hidden photo no longer readable');
  await stage(A,'private');await stage(A,'private');await assert.rejects(()=>stage(A,'private'),/하루에 5장/);
  await assert.rejects(()=>as(C,`insert into photo_stages(owner,image_path,mask_rle) values($1,$2,'1')`,[C,A+'/other.jpg']),/row-level security/);
  console.log('PASS: existing admins/friends, owner privacy, file privacy, approval, 3 reports, RPC authorization and daily upload cap');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
