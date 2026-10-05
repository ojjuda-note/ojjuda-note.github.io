const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations');
const sql=name=>fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.endsWith('_'+name+'.sql'))),'utf8');
const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002';
const fid=n=>'20000000-0000-0000-0000-'+String(n).padStart(12,'0');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.is_banned(uuid) returns boolean language sql stable as $$select false$$;
 create function public.door_open(uuid) returns boolean language sql stable as $$select true$$;
 create function public.is_friend(uuid,uuid) returns boolean language sql stable as $$select true$$;
 create table public.profiles(id uuid primary key);insert into public.profiles values('${a}'),('${b}');
 create table public.media_folders(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),name text not null,visibility text not null default 'friends',allowed uuid[] not null default '{}',created_at timestamptz not null default now());
 create function public.folder_can_see(uuid,uuid) returns boolean language sql stable as $$select false$$;
 create table public.media(id text primary key,user_id uuid not null references public.profiles(id),type text not null check(type in ('image','video')),path text not null unique,thumb_path text,caption text not null default '',duration real not null default 0,visibility text not null default 'me',folder_id uuid references public.media_folders(id) on delete set null,created_at timestamptz not null default now());
 create function public.media_folder_guard() returns trigger language plpgsql security definer set search_path=public as $$begin if new.folder_id is not null and not exists(select 1 from public.media_folders f where f.id=new.folder_id and f.user_id=new.user_id) then raise exception 'bad_folder';end if;return new;end$$;
 create trigger media_folder_guard before insert or update of folder_id on public.media for each row execute function public.media_folder_guard();
 create function public.check_banned_cols() returns trigger language plpgsql as $$begin return new;end$$;
 create trigger banned_check before insert or update on public.media_folders for each row execute function public.check_banned_cols('name');
 alter table public.media enable row level security;alter table public.media_folders enable row level security;
 create policy folder_read on public.media_folders for select to authenticated using(user_id=auth.uid() or visibility='all');
 create policy folder_insert on public.media_folders for insert to authenticated with check(user_id=auth.uid());
 create policy folder_update on public.media_folders for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create policy folder_delete on public.media_folders for delete to authenticated using(user_id=auth.uid());
 create policy own_media on public.media to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 grant usage on schema public,auth to authenticated,anon;grant select,insert,update,delete on public.media,public.media_folders to authenticated;`);
 await db.exec(sql('house_posts_trash'));await db.exec(sql('house_friend_groups'));
 await db.exec(`insert into public.house_friend_groups(id,user_id,name,members) values('${fid(20)}','${a}','친구들',array['${b}'::uuid]);
 insert into public.media_folders(id,user_id,name,visibility,allowed,allowed_groups,created_at) values
 ('${fid(1)}','${a}','혼합','chosen',array['${b}'::uuid],array['${fid(20)}'::uuid],'2026-01-01'),
 ('${fid(2)}','${a}','글만','all','{}','{}','2026-01-02'),
 ('${fid(3)}','${a}','영상만','friends','{}','{}','2026-01-03'),
 ('${fid(4)}','${a}','빈 폴더','me','{}','{}','2026-01-04'),
 ('${fid(5)}','${b}','남의 폴더','all','{}','{}','2026-01-05'),
 ('${fid(6)}','${a}','글과 영상','me','{}','{}','2026-01-06'),
 ('${fid(7)}','${a}','휴지통만','me','{}','{}','2026-01-07');
 insert into public.media(id,user_id,type,path,thumb_path,caption,duration,visibility,folder_id,created_at) values
 ('mixed-photo','${a}','image','${a}/mixed.jpg','${a}/mixed-thumb.jpg','사진',0,'all','${fid(1)}','2026-02-01'),
 ('mixed-video','${a}','video','${a}/mixed.mp4',null,'동영상',15,'friends','${fid(1)}','2026-02-02'),
 ('only-video','${a}','video','${a}/only.mp4',null,'동영상',12,'me','${fid(3)}','2026-02-03'),
 ('other-photo','${b}','image','${b}/photo.jpg',null,'사진',0,'me','${fid(5)}','2026-02-04'),
 ('text-video','${a}','video','${a}/text-video.mp4',null,'혼합영상',5,'me','${fid(6)}','2026-02-05'),
 ('unfiled','${a}','image','${a}/unfiled.jpg',null,'미분류',0,'all',null,'2026-02-06');
 insert into public.house_posts(id,user_id,body,visibility,folder_id,created_at,updated_at,deleted_at) values
 ('mixed-post','${a}','글 본문','all','${fid(1)}','2026-02-01','2026-02-05',null),
 ('deleted-post','${a}','휴지통 본문','me','${fid(1)}','2026-02-01','2026-02-05','2026-02-06'),
 ('only-post','${a}','글만 본문','all','${fid(2)}','2026-02-01','2026-02-05',null),
 ('text-video-post','${a}','글 영상 폴더','me','${fid(6)}','2026-02-01','2026-02-05',null);
 insert into public.house_media_trash(id,user_id,type,path,thumb_path,caption,duration,visibility,folder_id,created_at,deleted_at) values
 ('trash-photo','${a}','image','${a}/trash.jpg','${a}/trash-thumb.jpg','삭제된 사진',0,'all','${fid(1)}','2026-02-01','2026-02-07'),
 ('trash-video','${a}','video','${a}/trash.mp4',null,'삭제된 영상',30,'friends','${fid(1)}','2026-02-01','2026-02-07'),
 ('only-trash','${a}','video','${a}/only-trash.mp4',null,'휴지통만',8,'me','${fid(7)}','2026-02-01','2026-02-07');`);
 const foldersBefore=(await db.query('select * from public.media_folders order by id')).rows;
 const content=async table=>(await db.query(`select to_jsonb(r)-'folder_id' as row from public.${table} r order by id`)).rows;
 const before={};for(const table of ['media','house_posts','house_media_trash'])before[table]=await content(table);
 await db.exec(sql('house_folder_kinds'));
 for(const table of Object.keys(before))assert.deepEqual(await content(table),before[table],table+' data and timestamps survive migration unchanged');
 const folders=(await db.query('select * from public.media_folders order by id')).rows;
 assert.equal(folders.length,10,'only kinds used by each legacy folder are created');
 for(const old of foldersBefore){const copies=folders.filter(f=>f.user_id===old.user_id&&f.name===old.name);assert(copies.length);for(const copy of copies){const {id,kind,...metadata}=copy,{id:oldId,...oldMetadata}=old;assert.deepEqual(metadata,oldMetadata,'privacy, friends/groups, name and creation time retained');}}
 const kindFor=id=>folders.find(f=>f.id===id).kind;
 assert.equal(kindFor(fid(1)),'photo','photo keeps original ID');assert.equal(kindFor(fid(2)),'text');assert.equal(kindFor(fid(3)),'video');assert.equal(kindFor(fid(4)),'photo','empty legacy folders remain in album');assert.equal(kindFor(fid(6)),'text');assert.equal(kindFor(fid(7)),'video','trash-only kind is retained');
 const mixed=Object.fromEntries(folders.filter(f=>f.name==='혼합').map(f=>[f.kind,f.id]));
 assert.deepEqual((await db.query("select id,folder_id from public.house_posts where id in ('mixed-post','deleted-post') order by id")).rows,[{id:'deleted-post',folder_id:mixed.text},{id:'mixed-post',folder_id:mixed.text}]);
 assert.equal((await db.query("select folder_id from public.media where id='mixed-video'")).rows[0].folder_id,mixed.video);
 assert.equal((await db.query("select folder_id from public.house_media_trash where id='trash-video'")).rows[0].folder_id,mixed.video);
 assert((await db.query("select prosecdef from pg_proc where proname in ('media_folder_guard','house_post_guard','house_folder_kind_guard')")).rows.every(r=>!r.prosecdef),'guards never bypass RLS');
 assert.equal((await db.query("select has_function_privilege('anon','public.media_folder_guard()','execute') ok")).rows[0].ok,false);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}';`);
 const save=(id,folder)=>db.query('select public.house_save_post($1,$2,$3,$4,true)',[id,'새 글',folder,'me']);
 const move=(media,posts,folder)=>db.query("select public.house_manage_records('move',$1,$2,$3)",[media,posts,folder]);
 for(const kind of ['all','image','unknown',null])await assert.rejects(db.query('insert into public.media_folders(user_id,name,kind) values($1,$2,$3)',[a,'실패',kind]));
 await assert.rejects(db.query('update public.media_folders set kind=$1 where id=$2',['video',fid(4)]),/house_folder_kind_immutable/);
 await save('valid-text',mixed.text);await assert.rejects(save('invalid-text',mixed.photo),/house_folder_kind_mismatch/);await assert.rejects(save('foreign',fid(5)),/house_folder_unavailable/);
 await assert.rejects(db.query("update public.media set type='video' where id='mixed-photo'"),/house_folder_kind_mismatch/,'changing type cannot bypass the folder guard');
 await assert.rejects(db.query("insert into public.media(id,user_id,type,path,folder_id) values('wrong',$1,'image',$2,$3)",[a,a+'/wrong.jpg',mixed.video]),/house_folder_kind_mismatch/);
 await assert.rejects(db.query("insert into public.house_media_trash(id,user_id,type,path,visibility,folder_id,created_at) values('wrong-trash',$1,'video',$2,'me',$3,now())",[a,a+'/wrong-trash.mp4',mixed.photo]),/house_folder_kind_mismatch/);
 const current=async()=>(await db.query("select id,folder_id,visibility from public.house_records where id in ('mixed-photo','mixed-video','mixed-post') order by id")).rows;
 const prior=await current();await assert.rejects(move(['mixed-photo','mixed-video'],['mixed-post'],mixed.photo),/house_folder_kind_mismatch/);assert.deepEqual(await current(),prior,'mixed-kind move rolls back every change');
 await move(['mixed-photo','mixed-video'],['mixed-post'],null);assert((await current()).every(r=>r.folder_id===null&&r.visibility==='me'),'mixed move to unfiled is safe');
 await move(['mixed-photo'],[],mixed.photo);await move(['mixed-video'],[],mixed.video);await move([],['mixed-post'],mixed.text);
 await db.query("select public.house_manage_records('trash',$1,$2)",[['mixed-photo','mixed-video'],['mixed-post']]);
 await db.query("select public.house_manage_records('restore',$1,$2)",[['mixed-photo','mixed-video'],['mixed-post']]);assert((await current()).every(r=>r.folder_id===null&&r.visibility==='me'),'mixed trash/restore still works');
 await db.query('select public.house_delete_media_folder($1)',[mixed.video]);assert.equal((await db.query("select folder_id from public.house_media_trash where id='trash-video'")).rows[0].folder_id,null,'deleting video folder also detaches matching trash safely');
 assert.equal((await db.query('select count(*)::int n from public.media_folders where id=$1',[mixed.photo])).rows[0].n,1,'deleting one kind leaves sibling folders intact');
 await db.exec(`set request.jwt.claim.sub='${b}';`);await assert.rejects(save('foreign-kind',mixed.text),/house_folder_unavailable/);
 await db.exec('set role anon');await assert.rejects(db.query('select * from public.media_folders'));
 console.log('PASS: legacy folder splits preserve all records, privacy and timestamps; independent immutable kinds; ownership and direct/API kind guards; atomic mixed moves; trash/restore and category deletion');
 }finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
