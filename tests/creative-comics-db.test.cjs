const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');const {PGlite}=require('@electric-sql/pglite');
const ids=Array.from({length:7},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));const [admin,adult,minor,unknown,anonymous,banned,minorAdmin]=ids;
(async()=>{const db=new PGlite();try{await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create schema ojjuda_account_internal;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key,is_anonymous boolean default false);
create table public.app_admins(user_id uuid);create table public.banned(user_id uuid);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.app_admins where user_id=auth.uid())$$;
create function public.is_banned(uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.banned where user_id=$1)$$;
create table ojjuda_account_internal.member_identity(user_id uuid,birth_date date);
create function ojjuda_account_internal.age_on(date,date) returns integer language sql immutable strict as $$select extract(year from age($2,$1))::integer$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$select coalesce(current_setting('test.operation',true),'')=any($1)$$;
alter table storage.objects enable row level security;grant usage on schema auth,storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;
insert into auth.users(id) values ${ids.map(id=>"('"+id+"')").join(',')};
update auth.users set is_anonymous=true where id='${anonymous}';
insert into app_admins values('${admin}'),('${minorAdmin}');insert into banned values('${banned}');
insert into ojjuda_account_internal.member_identity values
('${admin}',current_date-interval '30 years'),('${adult}',(now() at time zone 'Asia/Seoul')::date-interval '19 years'),
('${minor}',(now() at time zone 'Asia/Seoul')::date-interval '19 years'+interval '1 day'),
('${anonymous}',current_date-interval '30 years'),('${banned}',current_date-interval '30 years'),('${minorAdmin}',current_date-interval '15 years');`);
await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261010151428_creative_comics_adult_board.sql'),'utf8'));
await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261010153730_comic_authenticated_image_info.sql'),'utf8'));
async function as(id,sql,args=[],role='authenticated',op='object.get_authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.operation',$2,false)",[id||'',op]);await db.exec('set role '+role);try{return await db.query(sql,args)}finally{await db.exec('reset role')}}
const book=(await as(admin,"insert into creative_comics(title) values('테스트') returning id")).rows[0].id;const file=admin+'/'+book+'/00000000-0000-4000-8000-000000000099.png';
await assert.rejects(as(admin,'update creative_comics set published=true where id=$1',[book]),/comic_pages_incomplete/);
await as(admin,'insert into creative_comic_pages(comic_id,position,filename,path,width,height) values($1,1,$2,$3,100,200)',[book,'1.png',file]);
await assert.rejects(as(admin,'update creative_comics set published=true where id=$1',[book]),/comic_pages_incomplete/);
await as(admin,"insert into storage.objects(bucket_id,name) values('creative-comics',$1)",[file]);
assert.equal((await as(adult,'select * from creative_comics')).rows.length,0,'draft hidden');
assert.equal((await as(adult,'select * from storage.objects')).rows.length,0,'draft bytes hidden');
await as(admin,'update creative_comics set published=true where id=$1',[book]);
assert.equal((await as(adult,'select comics_access() as access')).rows[0].access.allowed,true,'19th birthday is allowed');
assert.equal((await as(adult,'select * from creative_comics')).rows.length,1);
assert.equal((await as(adult,'select * from creative_comic_pages')).rows.length,1);
assert.equal((await as(adult,'select * from storage.objects')).rows.length,1);
for(const id of [minor,unknown,anonymous,banned,minorAdmin]){assert.equal((await as(id,'select comics_access() as access')).rows[0].access.allowed,false);for(const table of ['creative_comics','creative_comic_pages','storage.objects'])assert.equal((await as(id,'select * from '+table)).rows.length,0,table+' denied');await assert.rejects(as(id,"insert into creative_comics(title) values('bypass')"),/row-level security/)}
for(const id of ids){const expected=[admin,adult].includes(id)?1:0;assert.equal((await as(id,'select * from storage.objects',[],'authenticated','object.get_authenticated_info')).rows.length,expected,'CDN metadata uses the same adult gate');}
for(const id of [admin,adult,minor])for(const op of ['object.sign','object.sign_many','object.list',''])assert.equal((await as(id,'select * from storage.objects',[],'authenticated',op)).rows.length,0,'signed URLs disabled');
await assert.rejects(as(null,'select * from creative_comics',[],'anon'),/permission denied/);await assert.rejects(as(null,'select comics_access()',[],'anon'),/permission denied/);
assert.equal((await as(null,'select * from storage.objects',[],'anon')).rows.length,0);
await assert.rejects(as(adult,"insert into creative_comics(title) values('not admin')"),/row-level security/);
assert.equal((await as(adult,"update creative_comics set title='changed' returning id")).rows.length,0);
assert.equal((await as(adult,'delete from creative_comics returning id')).rows.length,0);
await assert.rejects(as(adult,"insert into storage.objects(bucket_id,name) values('creative-comics','evil')"),/row-level security/);
await assert.rejects(as(admin,"update creative_comics set created_by=$1",[adult]),/permission denied/);
// Future permissive storage rules still cannot override the restriction for this bucket.
await db.exec('create policy overly_broad_read on storage.objects for select to authenticated using(true)');
assert.equal((await as(minor,'select * from storage.objects')).rows.length,0);
assert.equal((await as(adult,'select * from storage.objects',[],'authenticated','object.sign')).rows.length,0);
await db.exec("insert into storage.objects(bucket_id,name) values('unrelated','untouched')");
assert.equal((await as(minor,"select * from storage.objects where bucket_id='unrelated'")).rows.length,1,'unrelated files untouched');
await as(admin,'update creative_comics set published=false where id=$1',[book]);assert.equal((await as(adult,"select * from storage.objects where bucket_id='creative-comics'")).rows.length,0,'unpublish revokes new downloads');
assert.equal((await db.query("select public from storage.buckets where id='creative-comics'")).rows[0].public,false);
console.log('Creative comics DB: age boundary, guests, unknown age, anonymous, banned, admin-only writes, drafts, direct downloads and signing restrictions passed');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
