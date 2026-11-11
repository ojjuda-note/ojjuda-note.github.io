const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migrations=path.join(__dirname,'../supabase/migrations');
const migration=suffix=>fs.readFileSync(path.join(migrations,fs.readdirSync(migrations).find(n=>n.endsWith(suffix))),'utf8');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('member invitations: private notifications, explicit acceptance, shared links and revocation',async()=>{
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create schema ojjuda_account_deletion;create schema ojjuda_restaurants_internal;
create table auth.users(id uuid primary key,is_anonymous boolean default false,deleted_at timestamptz,banned_until timestamptz);
create table public.profiles(id uuid primary key references auth.users(id),nickname text,created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.is_banned(uuid) returns boolean language sql stable as $$select false$$;
create function ojjuda_account_deletion.pending() returns boolean language sql stable as $$select coalesce(current_setting('test.pending',true),'')='yes'$$;
create function ojjuda_account_deletion.check_owner(uuid) returns uuid language sql as $$select auth.uid()$$;
create function ojjuda_restaurants_internal.photo_path_valid(text) returns boolean language sql immutable as $$select false$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb);
alter table storage.objects enable row level security;
create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$select coalesce(current_setting('storage.operation',true),'')=any($1)$$;
grant usage on schema auth,storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
create policy broad_legacy on storage.objects for all to anon,authenticated using(true) with check(true);`);

await db.exec(`create schema ojjuda_note;create schema ojjuda_note_internal;
create table public.user_private(user_id uuid primary key,banned_until timestamptz);
create table public.friendships(id text primary key,requester uuid,addressee uuid,status text,created_at timestamptz default now(),accepted_at timestamptz);
create table public.blocks(blocker uuid,blocked uuid);create table ojjuda_note_internal.blocks(blocker_id uuid,blocked_id uuid);
create table public.guestbook(id text,owner_id uuid,author_id uuid,hidden boolean,is_read boolean,created_at timestamptz);
create table public.media(id text,user_id uuid);create table public.media_comments(id text,media_id text,author_id uuid,created_at timestamptz);
create function public.is_admin() returns boolean language sql stable as $$select false$$;
create function public.blocked_between(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.blocks where (blocker=a and blocked=b) or (blocker=b and blocked=a))$$;
create function ojjuda_note_internal.visible_notifications() returns table(id uuid,kind text,card_id uuid,inquiry_id uuid,created_at timestamptz,read_at timestamptz) language sql as $$select null::uuid,null::text,null::uuid,null::uuid,null::timestamptz,null::timestamptz where false$$;
create function ojjuda_note_internal.mark_notifications_read(uuid[],timestamptz,timestamptz) returns integer language sql as $$select 0$$;
create function ojjuda_note.list_retention_alerts() returns table(id uuid,card_id uuid,created_at timestamptz,archive_due_at timestamptz,read_at timestamptz) language sql as $$select null::uuid,null::uuid,null::timestamptz,null::timestamptz,null::timestamptz where false$$;
grant usage on schema ojjuda_note to authenticated;`);
for(const suffix of ['_shared_app_notifications.sql','_friend_messages.sql','_notification_summary_and_retired_reads.sql','_private_group_board.sql','_group_member_invitations.sql','_group_reliability_performance.sql','_group_recent_member_invitations.sql','_group_member_invite_sharing.sql'])await db.exec(migration(suffix));
for(let n=1;n<=6;n++){await db.query('insert into auth.users(id) values($1)',[uid(n)]);await db.query("insert into public.profiles(id,nickname,created_at) values($1,$2,'2026-11-01'::timestamptz+($3||' minutes')::interval)",[uid(n),'회원'+n,String(n)]);}
const as=async n=>db.exec(`reset role;set role ${n?'authenticated':'anon'};select set_config('request.jwt.claim.sub','${n?uid(n):''}',false);`);
const val=async(q,p=[])=>(await db.query(q,p)).rows[0]?.value;
const api=async(action,p={})=>val('select public.group_invitation($1,$2::jsonb) value',[action,JSON.stringify(p)]);
const board=async(action,p={})=>val('select public.group_board($1,$2::jsonb) value',[action,JSON.stringify(p)]);
const inbox=()=>val('select public.list_app_notifications() value');
await as(0);await assert.rejects(api('received'));
await as(1);await assert.rejects(db.query('select * from ojjuda_groups_internal.invitations'));
const room=(await board('create_room',{name:'우리 여행 <script>',description:'함께'})).id;
const legacy=(await board('invite',{room_id:room})).code,link=(await api('link',{room_id:room})).code;
assert.notEqual(legacy,link,'approval-only codes never become direct-join links');
assert.equal((await api('search',{room_id:room,query:'회원2'}))[0].user_id,uid(2));
assert.deepEqual((await api('search',{room_id:room,query:''})).map(x=>x.user_id),[6,5,4,3,2].map(uid));
const firstRecent=await api('search',{room_id:room});assert.deepEqual((await api('search',{room_id:room,before:firstRecent[1].created_at,before_id:firstRecent[1].user_id})).map(x=>x.user_id),[4,3,2].map(uid));
const invite=await api('send',{room_id:room,user_id:uid(2)});
assert.equal((await api('send',{room_id:room,user_id:uid(2)})).id,invite.id,'retry does not duplicate or reset notification');
await assert.rejects(api('send',{room_id:room,user_id:uid(1)}));
assert.equal((await inbox()).items.length,0,'sender has no recipient notification');
await as(3);assert.equal((await inbox()).items.length,0);assert.deepEqual(await api('received'),[]);await assert.rejects(api('accept',{id:invite.id}));
await assert.rejects(api('search',{room_id:room,query:'회원'}));await assert.rejects(api('send',{room_id:room,user_id:uid(2)}));await assert.rejects(api('link',{room_id:room}));
await as(2);const notice=(await inbox()).items[0];assert.equal(notice.kind,'group_invite');assert.equal(notice.group_name,'우리 여행 <script>');assert.equal(notice.sender_name,'회원1');
assert.equal((await val('select public.app_notification_summary() value')).notifications,1);assert.equal((await board('rooms')).length,0);
await assert.rejects(board('feed',{room_id:room}),'pending invitation grants no content access');
await val('select public.mark_app_notifications_read($1::text[],$2::timestamptz,null) value',[[notice.id],notice.created_at]);
assert.equal((await val('select public.app_notification_summary() value')).notifications,0);assert.equal((await api('received')).length,1,'read is not acceptance');
await board('request',{room_id:room});assert.equal((await api('accept',{id:invite.id})).room_id,room);assert.equal((await board('rooms')).length,1);assert.equal((await inbox()).items.length,0);
assert.equal((await api('accept',{id:invite.id})).joined,true,'accept retry is idempotent');
assert.equal((await api('link',{room_id:room})).code,link,'an ordinary member can share the same group invitation');
await db.exec('begin read only');try{assert.equal((await api('link',{room_id:room,rotate:false})).code,link);}finally{await db.exec('rollback');}
await assert.rejects(api('link',{room_id:room,rotate:true}),'members cannot invalidate other shared invitations');
await assert.rejects(api('search',{room_id:room}));await assert.rejects(api('send',{room_id:room,user_id:uid(3)}));
await db.exec('reset role');await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[uid(2)]);
await as(2);await assert.rejects(api('link',{room_id:room}),'suspended members cannot retrieve links');
await db.exec('reset role');await db.query('update auth.users set banned_until=null where id=$1',[uid(2)]);await as(2);

await as(1);assert.equal((await board('requests',{room_id:room})).length,0);await board('kick',{room_id:room,user_id:uid(2)});
await as(2);await assert.rejects(api('link',{room_id:room}),'kicked members cannot retrieve the replacement link');await assert.rejects(api('accept',{id:invite.id}),'accepted invitation cannot rejoin after kick');await assert.rejects(api('accept_link',{code:link}),'kick invalidates old shared links');
await as(1);const second=await api('send',{room_id:room,user_id:uid(3)});
await as(3);await api('decline',{id:second.id});assert.equal((await board('rooms')).length,0);assert.equal((await inbox()).items.length,0);await assert.rejects(api('accept',{id:second.id}));
await as(1);await assert.rejects(api('send',{room_id:room,user_id:uid(3)}),'declined users are not repeatedly notified');
// Shared links open a preview first and do not need a second owner approval after acceptance.
const current=(await api('link',{room_id:room})).code;
await as(4);assert.equal((await api('preview_link',{code:current})).member,false);assert.equal((await board('rooms')).length,0);await assert.rejects(api('preview_link',{code:legacy}));
await board('request',{room_id:room});await api('accept_link',{code:current});await api('accept_link',{code:current});assert.equal((await board('rooms')).length,1);
await as(1);assert.equal((await board('requests',{room_id:room})).length,0);const rotated=(await api('link',{room_id:room,rotate:true})).code;assert.notEqual(current,rotated);
await as(5);await assert.rejects(api('accept_link',{code:current}));
// A normal join approval also consumes any pending invitation, preventing a stale invitation after a kick.
await as(1);const fifth=await api('send',{room_id:room,user_id:uid(5)});
await as(5);await board('request',{room_id:room});await as(1);await board('approve',{room_id:room,user_id:uid(5)});
await as(5);assert.deepEqual(await api('received'),[]);await as(1);await board('kick',{room_id:room,user_id:uid(5)});await as(5);await assert.rejects(api('accept',{id:fifth.id}));
// Both existing block systems are respected by search, inbox, direct and shared acceptance.
for(const table of ['public.blocks','ojjuda_note_internal.blocks']){
 await as(1);const pending=await api('send',{room_id:room,user_id:uid(6)}),code=(await api('link',{room_id:room})).code;
 await db.exec('reset role');await db.query(`insert into ${table} values($1,$2)`,[uid(6),uid(1)]);
 await as(1);assert.deepEqual(await api('search',{room_id:room,query:'회원6'}),[]);await assert.rejects(api('send',{room_id:room,user_id:uid(6)}));
 await as(6);assert.equal((await inbox()).items.length,0);await assert.rejects(api('accept',{id:pending.id}));await assert.rejects(api('accept_link',{code}));
 await db.exec('reset role');await db.exec(`delete from ${table}`);
}
await as(1);const sixth=(await api('send',{room_id:room,user_id:uid(6)})).id,oldLink=(await api('link',{room_id:room})).code;
await board('transfer',{room_id:room,user_id:uid(4)});
assert.ok((await api('link',{room_id:room})).code,'former owner remains able to share as a member');await assert.rejects(api('link',{room_id:room,rotate:true}));
await as(6);assert.deepEqual(await api('received'),[]);await assert.rejects(api('accept',{id:sixth}));await assert.rejects(api('accept_link',{code:oldLink}));
await as(4);const fresh=await api('send',{room_id:room,user_id:uid(6)});assert.notEqual(fresh.id,sixth);await board('delete_room',{room_id:room});
await as(1);await assert.rejects(api('link',{room_id:room}),'deleting groups cannot be shared');
await as(6);assert.equal((await inbox()).items.length,0);await assert.rejects(api('accept',{id:fresh.id}));
// Reads work in a read-only transaction; room creation is idempotent after a lost response.
await as(1);const stableId=uid(1000),safeRoom=(await board('create_room',{id:stableId,name:'다시 시도'})).id;
assert.equal(safeRoom,stableId);assert.equal((await board('create_room',{id:stableId,name:'다시 시도'})).id,stableId);
assert.equal((await board('rooms')).filter(r=>r.id===stableId).length,1);
await as(2);await assert.rejects(board('create_room',{id:stableId,name:'다른 계정'}));await as(1);
await board('save',{room_id:safeRoom,id:uid(1001),kind:'post',body:'확인',media:[]});
const safeLink=(await api('link',{room_id:safeRoom})).code;
await db.exec('begin read only');
try{
 assert.equal((await board('members',{room_id:safeRoom})).length,1);assert.deepEqual(await board('requests',{room_id:safeRoom}),[]);
 assert.deepEqual(await board('comments',{id:uid(1001)}),[]);assert.ok(Array.isArray(await api('search',{room_id:safeRoom,query:'회원'})));
 assert.equal((await api('preview_link',{code:safeLink})).room_id,safeRoom);assert.equal((await api('link',{room_id:safeRoom})).code,safeLink);
 const home=await val("select public.group_home('다시') value");assert.equal(home.directory.length,1);assert.ok(Array.isArray(home.rooms));assert.ok(Array.isArray(home.invitations));
}finally{await db.exec('rollback');}
await db.exec('reset role');await db.query('update auth.users set is_anonymous=true where id=$1',[uid(6)]);await as(6);await assert.rejects(api('received'));
assert.equal(await val("select has_function_privilege('anon','public.group_invitation(text,jsonb)','execute') value"),false);
assert.equal(await val("select has_function_privilege('authenticated','ojjuda_groups_internal.invitable_peer(uuid)','execute') value"),false);
await db.exec('reset role');
for(let n=20;n<60;n++){await db.query('insert into auth.users(id) values($1)',[uid(n)]);await db.query("insert into public.profiles(id,nickname,created_at) values($1,$2,'2026-11-06T00:00:00Z')",[uid(n),'신규'+n]);}
await as(1);const recentPage=await api('search',{room_id:safeRoom,query:'신규'});
assert.equal(recentPage.length,31);assert.deepEqual(recentPage.slice(0,30).map(x=>x.user_id),Array.from({length:30},(_,i)=>uid(59-i)));
const lastRecent=recentPage[29],olderRecent=await api('search',{room_id:safeRoom,query:'신규',before:lastRecent.created_at,before_id:lastRecent.user_id});
assert.equal(olderRecent.length,10);assert.equal(new Set([...recentPage.slice(0,30),...olderRecent].map(x=>x.user_id)).size,40);

await db.exec('reset role');
await require('./helpers/group-age-scenarios.cjs')({db,assert,as,api,board,val,uid,migration});
}finally{await db.close();}
});
