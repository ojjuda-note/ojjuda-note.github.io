const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003';
await db.exec(`create role anon;create role authenticated;create schema auth;create schema ojjuda_arcade_internal;create schema ojjuda_matgo_internal;
create table auth.users(id uuid primary key);create table public.profiles(id uuid primary key,nickname text);create table public.friendships(a uuid,b uuid);
create table ojjuda_matgo_internal.rooms(host_id uuid,code text,status text);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.is_banned(uuid) returns boolean language sql as $$select false$$;
create function public.is_friend(a uuid,b uuid) returns boolean language sql as $$select exists(select 1 from public.friendships f where (f.a=$1 and f.b=$2)or(f.b=$1 and f.a=$2))$$;
create function public.blocked_between(uuid,uuid) returns boolean language sql as $$select false$$;
grant usage on schema public,auth,ojjuda_arcade_internal to authenticated;
insert into auth.users values('${A}'),('${B}'),('${C}');insert into public.profiles values('${A}','A'),('${B}','B'),('${C}','C');insert into public.friendships values('${A}','${B}');
insert into ojjuda_matgo_internal.rooms values('${A}','A1B2C3D4','waiting');`);
const migration=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(f=>f.endsWith('_arcade_friend_invites.sql'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',migration),'utf8'));
async function run(user,sql,args=[]){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);try{return await db.query(sql,args)}finally{await db.exec('reset role')}}
async function call(user,action,to=null,kind=null,code=null,id=null){return (await run(user,'select public.arcade_friend_invite($1,$2,$3,$4,$5) as result',[action,to,kind,code,id])).rows[0].result;}
await assert.rejects(()=>call(null,'list'),/not_allowed/);
await assert.rejects(()=>call(A,'send',C,'ttang','abc123abc123abc123abc123'),/friend_required/);
await assert.rejects(()=>call(A,'send',B,'ttang','1234'),/invalid_room/);
await assert.rejects(()=>call(B,'send',A,'matgo','A1B2C3D4'),/room_unavailable/);
const invite=await call(A,'send',B,'ttang','abc123abc123abc123abc123');assert.equal((await call(A,'send',B,'ttang','abc123abc123abc123abc123')).id,invite.id);
assert.equal((await call(B,'list')).invites.length,1);assert.equal((await call(C,'list')).invites.length,0);
assert.equal((await run(C,'select * from public.arcade_friend_invites')).rows.length,0,'nonparticipants cannot see room tokens');
await assert.rejects(()=>run(B,'update public.arcade_friend_invites set recipient_id=$1',[C]),/permission denied/);
await assert.rejects(()=>call(C,'accept',null,null,null,invite.id),/invite_unavailable/);
await assert.rejects(()=>call(A,'accept',null,null,null,invite.id),/invite_unavailable/);
assert.equal((await call(B,'accept',null,null,null,invite.id)).code,'abc123abc123abc123abc123');assert.equal((await call(B,'list')).invites.length,0);
const next=await call(A,'send',B,'matgo','A1B2C3D4');await db.query("update ojjuda_matgo_internal.rooms set status='cancelled'");await assert.rejects(()=>call(B,'accept',null,null,null,next.id),/room_unavailable/);await call(A,'cancel',null,null,null,next.id);
const expired=await call(A,'send',B,'ttang','123abc123abc123abc123abc');await db.query("update public.arcade_friend_invites set expires_at=now()-interval '1 minute' where id=$1",[expired.id]);await assert.rejects(()=>call(B,'accept',null,null,null,expired.id),/invite_expired/);
console.log('PASS: friend-only invites, recipient-only decisions, RLS room-code privacy, idempotent sends, host verification, cancellation and expiry');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
