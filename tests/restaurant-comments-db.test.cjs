/* Real PostgreSQL semantics in PGlite: photo policies, ownership and public reads. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const migration=suffix=>{
 const found=fs.readdirSync(path.join(root,'supabase/migrations')).filter(name=>name.endsWith(suffix));
 assert.equal(found.length,1);return 'supabase/migrations/'+found[0];
};
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const comment='40000000-0000-4000-8000-000000000001';
const photo=`${a}/${comment}/30000000-0000-4000-8000-000000000001.jpg`;
const as=async(db,user,role='authenticated',operation='object.get_authenticated')=>{
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('storage.operation',$2,false)",[user||'',operation]);
 await db.exec(`set role ${role}`);
};
const list=(db,kind='certified',id='test-restaurant',offset=0)=>db.query('select public.list_restaurant_comments($1,$2,$3,$4) result',[kind,id,20,offset]).then(r=>r.rows[0].result);
const save=(db,id=comment,p=photo,body='사진도 올렸어요')=>db.query('select public.save_restaurant_comment($1,$2,$3,$4,$5) result',[id,'certified','test-restaurant',body,p]).then(r=>r.rows[0].result);
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role;
   create schema auth;create schema storage;
   create table auth.users(id uuid primary key,is_anonymous boolean default false,deleted_at timestamptz,banned_until timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function storage.allow_any_operation(ops text[]) returns boolean language sql stable as $$
    select coalesce(regexp_replace(current_setting('storage.operation',true),'^storage[.]','')=any(ops),false)$$;
   grant usage on schema auth,storage to anon,authenticated;
   create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),
    name text,owner uuid,owner_id text,metadata jsonb,archived_at timestamptz,is_delete_marker boolean default false,unique(bucket_id,name));
   alter table storage.objects enable row level security;
   grant select,insert,update,delete on storage.objects to anon,authenticated;
  `);
  await db.exec(read('tests/account-deletion-fixture.sql'));
  await db.exec(`
   create table public.user_private(user_id uuid primary key references auth.users(id) on delete cascade,banned_until timestamptz);
   create function public.is_banned(u uuid) returns boolean language sql stable as $$select false$$;
   create policy legacy_broad on storage.objects for all to anon,authenticated using(true) with check(true);
  `);
  for(const name of ['supabase/migrations/20261005081904_account_deletion_owned_storage_guard.sql',migration('_member_restaurant_recommendations.sql'),migration('_member_restaurant_photo_limits.sql'),migration('_restaurant_member_ratings.sql'),migration('_restaurant_member_comments_photos.sql')])await db.exec(read(name));
  for(const [id,nick] of [[a,'작성자'],[b,'다른 회원']]){
   await db.query('insert into auth.users(id) values($1)',[id]);
   await db.query('insert into public.profiles(id,nickname) values($1,$2)',[id,nick]);
  }
  assert.equal((await db.query("select public from storage.buckets where id='restaurant-comment-photos'")).rows[0].public,true);
  for(const role of ['anon','authenticated'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']){
   assert.equal((await db.query("select has_table_privilege($1,'ojjuda_restaurants_internal.comments',$2) allowed",[role,privilege])).rows[0].allowed,false);
  }
  await as(db,null,'anon');
  assert.deepEqual(await list(db),[],'anonymous visitors can see comments');
  await assert.rejects(()=>save(db),/permission denied/);
  await as(db,b);
  await assert.rejects(()=>save(db),/restaurant_comment_invalid_input/);
  await as(db,a,'authenticated','object.upload');
  await assert.rejects(()=>db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['restaurant-comment-photos',`${b}/${comment}/30000000-0000-4000-8000-000000000001.jpg`,a]),/row-level security/);
  await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',['restaurant-comment-photos',photo,a,{mimetype:'image/jpeg',size:123}]);
  await as(db,b,'authenticated','object.delete');
  assert.equal((await db.query('delete from storage.objects where bucket_id=$1 and name=$2 returning name',['restaurant-comment-photos',photo])).rowCount,0,'another member cannot remove the photo');
  await as(db,a);
  assert.deepEqual(await save(db),{id:comment,saved:true});
  assert.deepEqual(await save(db),{id:comment,saved:true},'retrying the same submission is idempotent');
  assert.equal((await list(db)).length,1);
  await assert.rejects(()=>save(db,'40000000-0000-4000-8000-000000000002',null,'두 번째'),/too_fast/);
  await as(db,null,'anon');
  assert.deepEqual((await list(db)).map(r=>({author:r.author_name,mine:r.mine,body:r.body})),[{author:'작성자',mine:false,body:'사진도 올렸어요'}]);
  assert.equal((await list(db))[0].photo_path,photo);
  await as(db,b);
  assert.equal((await list(db))[0].mine,false);
  await assert.rejects(()=>db.query('select public.delete_restaurant_comment($1)',[comment]),/forbidden/);
  await as(db,a,'authenticated','object.delete');
  assert.equal((await db.query('delete from storage.objects where bucket_id=$1 and name=$2 returning name',['restaurant-comment-photos',photo])).rowCount,0,'published photo cannot be removed');
  const deletion=await db.query('select public.delete_restaurant_comment($1) result',[comment]);
  assert.equal(deletion.rows[0].result.photo_path,photo);
  assert.equal((await db.query('delete from storage.objects where bucket_id=$1 and name=$2 returning name',['restaurant-comment-photos',photo])).rowCount,1,'own orphan photo can be removed');
  await as(db,null,'anon');assert.deepEqual(await list(db),[]);
  console.log('Restaurant comments SQL security and lifecycle OK');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
