-- Only the invitation service can use the passwordless join path.
create function ojjuda_arcade_internal.drinking_invitable_room(room_id text,sender uuid,recipient uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from ojjuda_arcade_internal.drinking_rooms h
  where h.code=room_id and h.expires_at>now() and h.phase='lobby' and sender=any(h.members)
   and not recipient=any(h.members) and cardinality(h.members)<h.capacity
   and ojjuda_arcade_internal.drinking_adult_members(h.members||recipient)=h.members||recipient
   and not public.is_banned(sender) and not public.is_banned(recipient)
   and not exists(select 1 from unnest(h.members) m where public.blocked_between(recipient,m)));
$$;
revoke all on function ojjuda_arcade_internal.drinking_invitable_room(text,uuid,uuid) from public,anon,authenticated;

do $join$
declare
 source text:=pg_get_functiondef('ojjuda_arcade_internal.drinking_room(text,text,jsonb)'::regprocedure);
 anchor text:='if length(pw) not between 4 and 32 or octet_length(pw)>72 or extensions.crypt(pw,h.password_hash)<>h.password_hash then';
begin
 if strpos(source,anchor)=0 then raise exception 'unexpected drinking join'; end if;
 source:=regexp_replace(source,'drinking_room\([^)]*\)', 'drinking_room_dispatch(p_action text,p_code text,p_options jsonb,inviter uuid)');
 source:=replace(source,anchor,$check$if inviter is not null then
    if not public.is_friend(actor_id,inviter) or not ojjuda_arcade_internal.drinking_invitable_room(h.code,inviter,actor_id)
      then raise exception 'room_unavailable'; end if;
   els$check$||anchor);
 execute source;
end;
$join$;
revoke all on function ojjuda_arcade_internal.drinking_room_dispatch(text,text,jsonb,uuid) from public,anon,authenticated;
create or replace function ojjuda_arcade_internal.drinking_room(p_action text,p_code text default '',p_options jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); h ojjuda_arcade_internal.drinking_rooms%rowtype; candidates jsonb;
begin
 if p_action='invite_friends' then
  perform ojjuda_poker_internal.check_member(actor);
  select * into h from ojjuda_arcade_internal.drinking_rooms where code=upper(trim(p_code))
   and expires_at>now() and phase='lobby' and actor=any(members);
  if not found then raise exception 'room_unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nick',p.nickname) order by p.nickname,p.id),'[]'::jsonb) into candidates
  from public.friendships f join public.profiles p on p.id=case when f.requester=actor then f.addressee else f.requester end
  where actor in(f.requester,f.addressee) and f.status='accepted'
   and ojjuda_arcade_internal.drinking_invitable_room(h.code,actor,p.id);
  return jsonb_build_object('friends',candidates);
 end if;
 return ojjuda_arcade_internal.drinking_room_dispatch(p_action,p_code,p_options,null);
end;
$$;

alter table public.arcade_friend_invites drop constraint arcade_friend_invites_kind_check;
alter table public.arcade_friend_invites add constraint arcade_friend_invites_kind_check
 check(kind in ('matgo','ttang','marble','tank','roulette','drinking'));

do $invites$
declare
 source text:=pg_get_functiondef('ojjuda_arcade_internal.friend_invite_service(text,uuid,text,text,uuid)'::regprocedure);
 anchor text:='if p_kind=''roulette'' then';
 reply text:='if p_action=''accept'' and r.kind=''roulette'' then';
begin
 if strpos(source,anchor)=0 or strpos(source,reply)=0 or strpos(source,'p.nickname as sender_name')=0
    or strpos(source,$k$('matgo','ttang','marble','tank','roulette')$k$)=0 then raise exception 'unexpected invite service'; end if;
 source:=replace(source,$k$('matgo','ttang','marble','tank','roulette')$k$,$k$('matgo','ttang','marble','tank','roulette','drinking')$k$);
 source:=replace(source,anchor,$send$if p_kind='drinking' then
   if not ojjuda_arcade_internal.drinking_invitable_room(p_code,actor,p_to) then raise exception 'room_unavailable'; end if;
  els$send$||anchor);
 source:=replace(source,'p.nickname as sender_name',$title$p.nickname as sender_name,
    case when i.kind='drinking' then (select h.title from ojjuda_arcade_internal.drinking_rooms h where h.code=i.room_code) end as room_title$title$);
 source:=replace(source,'where i.recipient_id=actor and i.status=''pending''',$list$where (i.kind<>'drinking' or ojjuda_arcade_internal.drinking_invitable_room(i.room_code,i.sender_id,actor))
    and i.recipient_id=actor and i.status='pending'$list$);
 source:=replace(source,reply,$accept$if p_action='accept' and r.kind='drinking' then
   result:=ojjuda_arcade_internal.drinking_room_dispatch('join',r.room_code,'{}'::jsonb,r.sender_id);
   if result ? 'error' then raise exception '%',result->>'error'; end if;
  end if;
  $accept$||reply);
 execute source;
end;
$invites$;
