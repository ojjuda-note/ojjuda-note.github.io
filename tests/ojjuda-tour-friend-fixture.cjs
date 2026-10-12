const fs=require('node:fs'),path=require('node:path');
async function installInvites(db){
 await db.exec(`create schema ojjuda_arcade_internal;create schema ojjuda_matgo_internal;
  create table ojjuda_matgo_internal.rooms(host_id uuid,code text,status text);
  create table public.friendships(a uuid,b uuid);
  create view public.user_private as select id as user_id,'infinity'::timestamptz as banned_until from public.bans;
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create or replace function public.is_banned(u uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
   if not(coalesce(auth.uid()=u,false) or coalesce(nullif(current_setting('role',true),'none'),session_user) in ('service_role','postgres','supabase_admin'))
    then raise exception 'helper_scope_denied';end if;
   return exists(select 1 from public.user_private where user_id=u and banned_until>now());end;$$;
  create function public.is_friend(a uuid,b uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.friendships f where(f.a=$1 and f.b=$2)or(f.b=$1 and f.a=$2))$$;
  grant usage on schema auth,ojjuda_arcade_internal to authenticated;`);
 const dir=path.join(__dirname,'../supabase/migrations');
 for(const suffix of ['_arcade_friend_invites.sql','_arcade_invite_popup.sql','_marble_friend_invites.sql']){
  await db.exec(fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(f=>f.endsWith(suffix))),'utf8'));
 }
 return async(actor,args)=>{
  return db.transaction(async tx=>{
   await tx.exec('set local role authenticated');
   await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);
   return (await tx.query('select public.arcade_friend_invite($1,$2,$3,$4,$5) as result',[args.p_action,args.p_to??null,args.p_kind??null,args.p_code??null,args.p_id??null])).rows[0].result;
  });
 };
}
module.exports={installInvites};
