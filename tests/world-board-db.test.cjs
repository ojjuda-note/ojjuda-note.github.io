const assert=require('node:assert/strict'),fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.is_banned(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.banned',true),'')='yes'$$; create function public.has_banned(text) returns boolean language sql immutable as $$select $1='blockedword'$$;
create function public.door_open(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.door',true),'')<>'closed'$$;
create function public.blocked_between(uuid,uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.blocked',true),'')='yes'$$;
create table profiles(id uuid primary key);insert into profiles values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
create table media_folders(id int primary key,visibility text);insert into media_folders values(1,'me'),(2,'all');
create table house_posts(id text primary key,user_id uuid,body text,folder_id int,visibility text,created_at timestamptz default now(),deleted_at timestamptz);
create table media(id text,user_id uuid,type text,caption text,path text,folder_id int,visibility text,created_at timestamptz default now());
create table diaries(id text primary key,user_id uuid,title text,body text,visibility text,likes int,created_at timestamptz default now());
grant usage on schema auth,public to authenticated,anon;grant select on house_posts,media,media_folders,diaries to authenticated;
insert into house_posts(id,user_id,body,folder_id,visibility,deleted_at) values
('public','10000000-0000-0000-0000-000000000001','public',null,'all',null),
('private','10000000-0000-0000-0000-000000000001','private',null,'me',null),
('friends','10000000-0000-0000-0000-000000000001','friends',null,'friends',null),
('private-folder','10000000-0000-0000-0000-000000000001','private',1,'all',null),
('public-folder','10000000-0000-0000-0000-000000000001','public',2,'me',null),
('trash','10000000-0000-0000-0000-000000000001','trash',null,'all',now());
insert into media(id,user_id,type,caption,path,visibility) values('image','10000000-0000-0000-0000-000000000001','image','image','a.jpg','all');
insert into diaries(id,user_id,title,body,visibility,likes) values('diary','10000000-0000-0000-0000-000000000001','legacy','body','all',3);
create table media_comments(id text primary key,body text CONSTRAINT media_comments_body_check CHECK(char_length(body) between 1 and 200)); alter table house_posts enable row level security;create policy source_visible on house_posts for select to authenticated using(id<>'public-folder');`);
await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/20261004111608_world_board.sql'),'utf8'));
await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/20261009033125_world_board_comments.sql'),'utf8'));
await db.exec(`set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'`);
assert.deepEqual((await db.query('select id from world_board_feed order by id')).rows.map(x=>x.id),['diary','image','public']);
await db.exec("insert into world_board_likes(source,record_id) values('post','public')");
assert.equal((await db.query("select like_count from world_board_feed where id='public'")).rows[0].like_count,1);
await assert.rejects(db.exec("insert into world_board_likes(source,record_id) values('post','private')"));
await assert.rejects(db.exec("insert into world_board_likes(user_id,source,record_id) values('10000000-0000-0000-0000-000000000002','post','public')"));
await assert.rejects(db.exec("insert into world_board_likes(source,record_id) values('post','public')"));
assert.equal((await db.query('select id from world_board_feed order by like_count desc limit 1')).rows[0].id,'diary');

const comment=(await db.query("insert into world_board_comments(post_id,body) values('public','새 댓글') returning id")).rows[0].id;
assert.equal((await db.query('select body from world_board_comments')).rows[0].body,'새 댓글');
await db.exec("insert into world_board_comments(diary_id,body) values('diary',repeat('긴 댓글 ',5000))");
for(const id of ['private','friends','trash','private-folder','public-folder']) await assert.rejects(db.exec(`insert into world_board_comments(post_id,body) values('${id}','숨긴 글에는 쓸 수 없음')`));
await assert.rejects(db.exec("insert into world_board_comments(post_id,author_id,body) values('public','10000000-0000-0000-0000-000000000002','다른 사람 사칭')"));
await assert.rejects(db.exec("insert into world_board_comments(post_id,body) values('public','blockedword')"));
await assert.rejects(db.exec("insert into world_board_comments(post_id,body) values('public','  ')"));
await db.exec("set test.banned='yes'");await assert.rejects(db.exec("insert into world_board_comments(post_id,body) values('public','정지된 회원')"));await db.exec("set test.banned='no'");
await db.exec("set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002'");
assert.equal((await db.query('delete from world_board_comments where id=$1 returning id',[comment])).rows.length,0);
await db.exec("set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'");
await db.query('delete from world_board_comments where id=$1',[comment]);
assert.equal((await db.query('select id from world_board_comments where id=$1',[comment])).rows.length,0);
await db.exec("set test.blocked='yes'");assert.equal((await db.query('select * from world_board_feed')).rows.length,0);assert.equal((await db.query('select * from world_board_comments')).rows.length,0);await db.exec("set test.blocked='no'");
await db.exec("set test.door='closed'");assert.equal((await db.query('select * from world_board_feed')).rows.length,0);
assert.equal((await db.query('select * from world_board_comments')).rows.length,0);await db.exec('reset role');await db.exec("delete from diaries where id='diary'");assert.equal((await db.query('select * from world_board_comments')).rows.length,0);await db.exec('set role anon');await assert.rejects(db.query('select * from world_board_comments'));await assert.rejects(db.query('select * from world_board_feed'));
console.log('PASS: board source RLS, private/friend/folder/trash/door exclusion, legacy notes, real likes, duplicate and foreign-like denial, guest denial; comment RLS, long text, owner-only deletion, bans and source deletion cascade');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
