-- Friend-only invitations for the two embedded multiplayer games.
create table public.arcade_friend_invites (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('matgo','ttang')),
 room_code text not null check(length(room_code) between 4 and 32),
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '3 minutes',
 check(sender_id<>recipient_id)
);
create index arcade_friend_invites_inbox on public.arcade_friend_invites(recipient_id,expires_at desc) where status='pending';
create index arcade_friend_invites_recipient on public.arcade_friend_invites(recipient_id);
create index arcade_friend_invites_sent on public.arcade_friend_invites(sender_id,created_at desc);
alter table public.arcade_friend_invites enable row level security;
revoke all on public.arcade_friend_invites from public,anon,authenticated;
grant select on public.arcade_friend_invites to authenticated;
create policy participants_read on public.arcade_friend_invites for select to authenticated
 using((select auth.uid()) in (sender_id,recipient_id));

create or replace function ojjuda_arcade_internal.friend_invite_service(
 p_action text,p_to uuid default null,p_kind text default null,p_code text default null,p_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.arcade_friend_invites%rowtype; result jsonb;
begin
 if actor is null or public.is_banned(actor) then raise exception 'not_allowed' using errcode='42501';end if;
 if p_action='list' then
  select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (
   select i.id,i.sender_id,i.recipient_id,i.kind,i.status,i.expires_at,p.nickname as sender_name
   from public.arcade_friend_invites i join public.profiles p on p.id=i.sender_id
   where i.recipient_id=actor and i.status='pending' and i.expires_at>now()
    and public.is_friend(actor,i.sender_id) and not public.blocked_between(actor,i.sender_id)
   order by i.created_at desc limit 20
  ) x;
  return jsonb_build_object('ok',true,'invites',result);
 elsif p_action='send' then
  if p_to is null or p_to=actor or not public.is_friend(actor,p_to) or public.blocked_between(actor,p_to)
   or public.is_banned(p_to) then raise exception 'friend_required' using errcode='42501';end if;
  if p_kind is null or p_kind not in ('matgo','ttang') or p_code is null then raise exception 'invalid_game';end if;
  if p_kind='matgo' then
   if not exists(select 1 from ojjuda_matgo_internal.rooms where host_id=actor and code=p_code and status='waiting')
    then raise exception 'room_unavailable';end if;
  elsif p_code !~ '^[a-f0-9]{24}$' then raise exception 'invalid_room';end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select * into r from public.arcade_friend_invites where sender_id=actor and recipient_id=p_to
   and kind=p_kind and room_code=p_code and status='pending' and expires_at>now() order by created_at desc limit 1;
  if found then return jsonb_build_object('ok',true,'id',r.id);end if;
  if (select count(*) from public.arcade_friend_invites where sender_id=actor and created_at>now()-interval '5 minutes')>=20
   then raise exception 'invite_rate_limit';end if;
  insert into public.arcade_friend_invites(sender_id,recipient_id,kind,room_code)
   values(actor,p_to,p_kind,p_code) returning * into r;
  return jsonb_build_object('ok',true,'id',r.id);
 elsif p_action in ('accept','decline','cancel') then
  select * into r from public.arcade_friend_invites where id=p_id for update;
  if not found or (p_action='cancel' and r.sender_id<>actor) or (p_action<>'cancel' and r.recipient_id<>actor)
   then raise exception 'invite_unavailable' using errcode='42501';end if;
  if p_action='cancel' then
   update public.arcade_friend_invites set status='cancelled' where id=r.id and status='pending';
   return jsonb_build_object('ok',true);
  end if;
  if r.expires_at<=now() or r.status not in ('pending','accepted') or not public.is_friend(actor,r.sender_id)
   or public.blocked_between(actor,r.sender_id) or public.is_banned(r.sender_id) then raise exception 'invite_expired';end if;
  if p_action='accept' and r.kind='matgo' and not exists(
   select 1 from ojjuda_matgo_internal.rooms where host_id=r.sender_id and code=r.room_code and status='waiting')
   then raise exception 'room_unavailable';end if;
  update public.arcade_friend_invites set status=case when p_action='accept' then 'accepted' else 'declined' end where id=r.id;
  return jsonb_build_object('ok',true,'kind',r.kind,'code',r.room_code);
 end if;
 raise exception 'invalid_action';
end;$$;
revoke all on function ojjuda_arcade_internal.friend_invite_service(text,uuid,text,text,uuid) from public,anon;
grant execute on function ojjuda_arcade_internal.friend_invite_service(text,uuid,text,text,uuid) to authenticated;
create or replace function public.arcade_friend_invite(
 p_action text,p_to uuid default null,p_kind text default null,p_code text default null,p_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select ojjuda_arcade_internal.friend_invite_service(p_action,p_to,p_kind,p_code,p_id);
$$;
revoke all on function public.arcade_friend_invite(text,uuid,text,text,uuid) from public,anon;
grant execute on function public.arcade_friend_invite(text,uuid,text,text,uuid) to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.arcade_friend_invites;
 end if;
end;$$;
