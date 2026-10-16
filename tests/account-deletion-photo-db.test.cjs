const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.join(__dirname,'..');
const original=fs.readFileSync(path.join(root,'supabase/migrations/20261005081904_account_deletion_owned_storage_guard.sql'),'utf8');
const proposal=process.env.PHOTO_DELETION_MIGRATION || path.join(root,'supabase/migrations',fs.readdirSync(path.join(root,'supabase/migrations')).find(f=>f.endsWith('_account_deletion_photo_stages.sql')) || 'MISSING');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create schema ojjuda_note_internal;create schema ojjuda_photo_internal;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);insert into auth.users values('${A}'),('${B}');
 create table storage.objects(bucket_id text,name text,owner_id text,owner uuid);
 alter table storage.objects enable row level security;
 grant usage on schema auth,storage to anon,authenticated;
 grant select on storage.objects to anon;
 grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$select coalesce(current_setting('storage.operation',true)=any($1),false)$$;
 create table ojjuda_note_internal.auto_card_config(author_id uuid);
 create table public.guestbook(author_id uuid,author_nick text);create table public.media_comments(author_id uuid,author_nick text);
 create table public.photo_stages(owner uuid references auth.users(id) on delete cascade);
 create function ojjuda_photo_internal.member_allowed() returns boolean language sql stable as $$select coalesce(current_setting('fixture.adult',true)='true',false)$$;
 grant usage on schema ojjuda_photo_internal to anon,authenticated;
 create policy fixture_anon_read on storage.objects for select to anon using(true);
 create policy photo_storage_adult_select on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'photo-stages' or ojjuda_photo_internal.member_allowed());
 create policy fixture_photo_read on storage.objects for select to authenticated using(bucket_id='photo-stages' and split_part(name,'/',1)=auth.uid()::text);
 `);
 await db.exec(original);await db.exec(fs.readFileSync(proposal,'utf8'));
 const as=async(id,operation,sql,args=[],role='authenticated')=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('storage.operation',$2,true)",[id,operation]);await tx.exec('set local role '+role);return tx.query(sql,args)});
 const put=async(bucket,name,owner_id=A,owner=A)=>db.query('insert into storage.objects values($1,$2,$3,$4::uuid)',[bucket,name,owner_id,owner]);
 // Preserve public access to unrelated buckets without granting the deletion helper.
 await put('public-assets','public.jpg',null,null);await put('photo-stages',A+'/anon-hidden.jpg');
 for(const operation of ['object.get_authenticated','object.sign','object.delete_many']){
  assert.deepEqual((await as('',operation,'select name from storage.objects order by name',[],'anon')).rows.map(r=>r.name),['public.jpg']);
  assert.equal((await as('',operation,"select name from storage.objects where bucket_id='photo-stages'",[],'anon')).rows.length,0);
 }
 assert.equal((await db.query("select has_function_privilege('anon','ojjuda_account_deletion.pending()','EXECUTE') as allowed")).rows[0].allowed,false);
 await db.exec('delete from storage.objects');
 const prepare=()=>as(A,'','select public.prepare_my_account_deletion($1::uuid)',[A]);
 // Fail closed before creating a deletion marker, including newer admin-only buckets.
 for(const [bucket,name,ownerId,owner] of [
  ['photo-stages',A+'/mismatch.jpg',B,A],['photo-stages',A+'/conflict.jpg',A,B],
  ['photo-stages',B+'/foreign-path.jpg',A,A],['photo-stages',A+'/../escape.jpg',A,A],
  ['photo-stages',A+'//empty.jpg',A,A],['photo-stages',A+'/back\\slash.jpg',A,A],
  ['creative-comics',A+'/shared.jpg',A,A],['unknown',A+'/unknown.jpg',A,A]]){
  await put(bucket,name,ownerId,owner);await assert.rejects(prepare,/account_storage_manual_review/);await db.exec('delete from storage.objects');
 }
 for(const bucket of ['media','note-card-photos','note-event-photos','photo-stages'])await put(bucket,A+'/nested/original.jpg');
 await put('photo-stages',A+'/orphan-full.jpg');await put('photo-stages',A+'/legacy.jpg',null,A);
 await put('photo-stages',B+'/keep.jpg',B,B);await db.query('insert into public.photo_stages values($1)',[A]);
 await assert.rejects(()=>as(B,'','select public.prepare_my_account_deletion($1::uuid)',[A]),/account_changed/);
 await prepare();
 const inventory=await as(A,'','select * from public.my_account_deletion_files($1::uuid,100)',[A]);assert.equal(inventory.rows.length,6);
 await assert.rejects(()=>as(A,'','select public.delete_my_account($1::uuid)',[A]),/account_storage_remaining/);
 // Even a now-ineligible account can remove its own files, but cannot read them.
 assert.equal((await as(A,'object.get_authenticated',"select * from storage.objects where bucket_id='photo-stages'")).rows.length,0);
 assert.equal((await as(A,'object.sign',"select * from storage.objects where bucket_id='photo-stages'")).rows.length,0);
 assert.equal((await as(A,'object.delete_many',"select * from storage.objects where bucket_id='photo-stages'")).rows.length,3);
 const removed=await as(A,'object.delete_many','delete from storage.objects returning name');assert.equal(removed.rows.length,6);
 assert.equal((await db.query('select name from storage.objects')).rows[0].name,B+'/keep.jpg');
 await as(A,'','select public.delete_my_account($1::uuid)',[A]);
 assert.equal((await db.query('select * from public.photo_stages')).rows.length,0);
 assert.equal((await db.query('select * from ojjuda_account_deletion.requests')).rows.length,0);
 console.log('PASS: four-bucket SQL inventory/deletion, orphan and legacy objects, mismatched owners, traversal, admin/unknown buckets, anonymous public access and denied photo access, age-restricted deletion-only access, cascade and cross-account isolation.');
}finally{await db.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
