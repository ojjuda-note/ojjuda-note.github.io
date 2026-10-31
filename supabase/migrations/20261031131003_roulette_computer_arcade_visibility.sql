-- Computer games are private. Public room discovery and invitations admit only
-- online rooms; a computer is never an auth user, wallet, or ranking identity.
-- Human solo payouts retain the existing entries-based ranking policy.
begin;
set local lock_timeout='5s';

create or replace function ojjuda_roulette_internal.arcade_rooms()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();result jsonb;
begin
 if actor is null or not exists(select 1 from auth.users a join public.profiles p on p.id=a.id
  where a.id=actor and not coalesce(a.is_anonymous,false)) then raise exception 'not_signed_in';end if;
 if public.is_banned(actor) then raise exception 'banned';end if;
 if not ojjuda_roulette_internal.arcade_eligible(actor) then return jsonb_build_object('ok',true,'rooms','[]'::jsonb);end if;
 select coalesce(jsonb_agg(jsonb_build_object('room_no','R-'||r.code,'kind','roulette','native',true,'title',r.title,
  'status',case when r.status='betting' then 'waiting' else 'playing' end,
  'host_name',p.nickname,'players',members.total,'capacity',r.capacity,
  'is_host',actor=r.host_id,'is_member',members.is_member,'match_id',r.id,'code',r.code,'created_at',r.created_at)
  order by r.created_at desc),'[]'::jsonb) into result
 from (
  select q.* from ojjuda_roulette_internal.rooms q
  where q.mode='online' and q.status in('betting','spinning','finished')
   and exists(select 1 from ojjuda_roulette_internal.players m where m.room_id=q.id and m.active
    and m.last_seen>now()-interval '2 minutes')
   and not exists(select 1 from ojjuda_roulette_internal.players m where m.room_id=q.id and m.active
    and (public.blocked_between(actor,m.user_id) or not ojjuda_roulette_internal.arcade_eligible(m.user_id)))
  order by q.created_at desc limit 100
 ) r join public.profiles p on p.id=r.host_id
 cross join lateral(select count(*)::integer total,bool_or(m.user_id=actor) is_member
  from ojjuda_roulette_internal.players m where m.room_id=r.id and m.active) members;
 return jsonb_build_object('ok',true,'rooms',result);
end;
$$;

-- Preserve the member-only feed boundary and the private invitation validator.
revoke all on function ojjuda_roulette_internal.arcade_rooms() from public,anon,service_role;
grant execute on function ojjuda_roulette_internal.arcade_rooms() to authenticated;

create or replace function ojjuda_roulette_internal.assert_invite_room(p_sender uuid,p_recipient uuid,p_code text,p_allow_member boolean default false)
returns void language plpgsql stable security invoker set search_path='' as $$
declare room ojjuda_roulette_internal.rooms%rowtype;participant boolean;players_count integer;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then raise exception 'invalid_room';end if;
 if not ojjuda_roulette_internal.arcade_eligible(p_sender) or not ojjuda_roulette_internal.arcade_eligible(p_recipient)
  then raise exception 'adult_required';end if;
 select r.* into room from ojjuda_roulette_internal.rooms r where r.host_id=p_sender and r.code=p_code and r.mode='online' and r.status='betting'
  and exists(select 1 from ojjuda_roulette_internal.players p where p.room_id=r.id and p.user_id=p_sender and p.active);
 if not found then raise exception 'room_unavailable';end if;
 if exists(select 1 from ojjuda_roulette_internal.players p where p.room_id=room.id and p.active
  and (not ojjuda_roulette_internal.arcade_eligible(p.user_id) or public.blocked_between(auth.uid(),p.user_id)))
  then raise exception 'room_unavailable';end if;
 select count(*)::integer,coalesce(bool_or(p.user_id=p_recipient),false) into players_count,participant
  from ojjuda_roulette_internal.players p where p.room_id=room.id and p.active;
 if participant and not p_allow_member then raise exception 'room_unavailable';end if;
 if not participant and players_count>=room.capacity then raise exception 'room_full';end if;
end;
$$;
revoke all on function ojjuda_roulette_internal.assert_invite_room(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;

-- Send and accept already use assert_invite_room. Also suppress any stale or
-- preexisting pending invitation which points at a private computer room.
do $online_invites$
declare definition text;anchor text;replacement text;
begin
 definition:=pg_get_functiondef('ojjuda_arcade_internal.friend_invite_service(text,uuid,text,text,uuid)'::regprocedure);
 anchor:=$before$and (i.kind<>'roulette' or (ojjuda_roulette_internal.arcade_eligible(actor) and ojjuda_roulette_internal.arcade_eligible(i.sender_id)))$before$;
 replacement:=$after$and (i.kind<>'roulette' or (ojjuda_roulette_internal.arcade_eligible(actor) and ojjuda_roulette_internal.arcade_eligible(i.sender_id)
     and exists(select 1 from ojjuda_roulette_internal.rooms roulette_room
      where roulette_room.code=i.room_code and roulette_room.host_id=i.sender_id and roulette_room.mode='online')))$after$;
 if cardinality(string_to_array(definition,anchor))<>2 then
  raise exception 'roulette invite list prerequisite changed';
 end if;
 execute replace(definition,anchor,replacement);
end;
$online_invites$;

notify pgrst,'reload schema';
commit;
