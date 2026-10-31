-- Roulette shares the existing arcade and monthly ranking policy.
-- Apply after roulette_multiplayer_core; unrelated game rules are preserved.
begin;
set local lock_timeout='5s';

create index roulette_entries_rank_period
 on ojjuda_roulette_internal.entries(settled_at,user_id,payout desc)
 where settled_at is not null and payout>0 and not abandoned;


create or replace function ojjuda_ranking_internal.catalog()
returns text[] language sql immutable parallel safe set search_path='' as $$
 select array['bang','sacheonseong','tank','saetbyeol','mines','tour','billiards',
  'janggi','chess','screw_box','screw_flat','spot','ttang','mole','runner','stacker',
  'breakout','matgo','poker','photo_ttang','roulette']::text[];
$$;

create or replace function ojjuda_ranking_internal.allowed_games(p_games text[])
returns text[] language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_game text;v_games text[]:='{}';v_adult boolean;
begin
 if coalesce(nullif(current_setting('role',true),'none'),session_user) not in('postgres','supabase_admin','authenticated','service_role')
  or actor is null or not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
   where p.id=actor and not coalesce(u.is_anonymous,false)) then raise exception 'not_signed_in' using errcode='42501';end if;
 if p_games is null or cardinality(p_games)>40 or array_ndims(p_games)>1 then raise exception 'invalid_games' using errcode='22023';end if;
 v_adult:=ojjuda_photo_internal.member_allowed() and not public.is_banned(actor);
 for v_game in select distinct g from unnest(p_games) x(g) loop
  if v_game is null or not v_game=any(ojjuda_ranking_internal.catalog()) then raise exception 'invalid_game' using errcode='22023';end if;
  if v_game not in('matgo','poker','photo_ttang','roulette') or v_adult then v_games:=array_append(v_games,v_game);end if;
 end loop;
 return v_games;
end;
$$;

-- Add only the roulette branch to the latest candidate function. This guarded
-- insertion preserves the later highest-streak and positive-score corrections.
do $roulette_candidates$
declare definition text;anchor text;addition text;
begin
 definition:=pg_get_functiondef('ojjuda_ranking_internal.candidates(text,timestamptz,timestamptz)'::regprocedure);
 anchor:=$anchor$begin
 if p_game in('billiards','carom4','carom3','pool8','janggi','chess') then$anchor$;
 if cardinality(string_to_array(definition,anchor))<>2 or position('ojjuda_roulette_internal.entries' in definition)>0 then
  raise exception 'roulette ranking candidate prerequisite changed';
 end if;
 addition:=$branch$begin
 if p_game='roulette' then
  return query select best.user_id,'member:'||best.user_id::text,p.nickname,best.payout,best.settled_at,0,
   jsonb_build_object('source','best_round_gain')
  from (
   select distinct on(e.user_id) e.user_id,e.payout,e.settled_at,e.round_id
   from ojjuda_roulette_internal.entries e
   where e.settled_at>=p_start and e.settled_at<p_end and e.payout>0 and not e.abandoned
   order by e.user_id,e.payout desc,e.settled_at,e.round_id
  ) best join public.profiles p on p.id=best.user_id
  join auth.users a on a.id=best.user_id and not coalesce(a.is_anonymous,false)
  join ojjuda_account_internal.member_identity m on m.user_id=best.user_id
  where ojjuda_account_internal.age_on(m.birth_date,(upper_bound at time zone 'Asia/Seoul')::date)>=19
   and not exists(select 1 from public.user_private u where u.user_id=best.user_id and u.banned_until>now());
  return;
 end if;
 if p_game in('billiards','carom4','carom3','pool8','janggi','chess') then$branch$;
 execute replace(definition,anchor,addition);
end;
$roulette_candidates$;

create or replace function ojjuda_ranking_internal.current_rows(p_game text,p_guest_token text default null)
returns json language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_now timestamptz:=statement_timestamp();v_start timestamptz;
 v_hash text;result json;
begin
 if p_game in('matgo','poker','roulette') then perform ojjuda_poker_internal.check_member(actor);
 elsif p_game='photo_ttang' then
  if actor is null or not ojjuda_photo_internal.member_allowed() or public.is_banned(actor)
   or not exists(select 1 from public.profiles where id=actor) then raise exception 'not_allowed' using errcode='42501';end if;
 elsif p_game in('bang','tank','billiards','carom4','carom3','pool8','janggi','chess') then
  if actor is null or not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
   where p.id=actor and not coalesce(u.is_anonymous,false)) then raise exception 'not_signed_in' using errcode='42501';end if;
 end if;
 v_start:=ojjuda_ranking_internal.month_start(ojjuda_ranking_internal.month_key(v_now));
 if p_guest_token ~ '^[a-f0-9]{64}$' then v_hash:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');end if;
 select coalesce(json_agg(r.item order by r.priority desc,r.score desc,r.achieved_at,r.identity_key),'[]'::json) into result
 from (select c.*,c.details||jsonb_build_object('nick',c.nick,'score',c.score,
   'me',coalesce(c.user_id=actor,c.identity_key='guest:'||v_hash,false)) item
  from ojjuda_ranking_internal.candidates(p_game,v_start,v_now+interval '1 microsecond') c
  where p_game not in('bang','tank','matgo','poker','roulette') or not public.blocked_between(actor,c.user_id)
  order by c.priority desc,c.score desc,c.achieved_at,c.identity_key limit 10) r;
 return result;
end;
$$;

create or replace function ojjuda_ranking_internal.visible_winners(p_winners jsonb,p_games text[],p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_game text;v_record jsonb;v_user uuid;v_result jsonb:='{}';
begin
 foreach v_game in array p_games loop
  v_record:=p_winners->v_game;
  v_user:=nullif(v_record->>'_userId','')::uuid;
  if v_record is null or v_record='null'::jsonb or coalesce((v_record->>'score')::numeric,0)<=0
   or exists(select 1 from public.user_private u where u.user_id=v_user and u.banned_until>now())
   or (v_game in('bang','tank','matgo','poker','roulette') and public.blocked_between(p_actor,v_user)) then
   v_record:='null'::jsonb;
  else
   v_record:=(v_record-'_userId')||jsonb_build_object('me',coalesce(v_user=p_actor,false));
  end if;
  v_result:=v_result||jsonb_build_object(v_game,v_record);
 end loop;
 return v_result;
end;
$$;

-- Internal helpers remain inaccessible as standalone client RPCs.
create function ojjuda_roulette_internal.arcade_eligible(p_actor uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from auth.users a join public.profiles p on p.id=a.id
  join ojjuda_account_internal.member_identity m on m.user_id=a.id
  where a.id=p_actor and not coalesce(a.is_anonymous,false)
   and ojjuda_account_internal.age_on(m.birth_date,(now() at time zone 'Asia/Seoul')::date)>=19
   and not exists(select 1 from public.user_private u where u.user_id=a.id and u.banned_until>now())
 );
$$;
revoke all on function ojjuda_roulette_internal.arcade_eligible(uuid) from public,anon,authenticated,service_role;

create function ojjuda_roulette_internal.arcade_rooms()
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
  where q.status in('betting','spinning','finished')
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
revoke all on function ojjuda_roulette_internal.arcade_rooms() from public,anon,service_role;
grant usage on schema ojjuda_roulette_internal to authenticated;
grant execute on function ojjuda_roulette_internal.arcade_rooms() to authenticated;

-- Preserve both existing feed providers, including Bang's separate native rooms.
create or replace function public.arcade_extra_rooms()
returns jsonb language sql stable security invoker set search_path='pg_catalog' as $$
 select jsonb_build_object('ok',true,'rooms',
  coalesce(ojjuda_poker_internal.arcade_rooms()->'rooms','[]'::jsonb)
  ||coalesce(ojjuda_bang_internal.arcade_rooms()->'rooms','[]'::jsonb)
  ||coalesce(ojjuda_roulette_internal.arcade_rooms()->'rooms','[]'::jsonb));
$$;
revoke all on function public.arcade_extra_rooms() from public,anon;
grant execute on function public.arcade_extra_rooms() to authenticated;

create function ojjuda_roulette_internal.assert_invite_room(p_sender uuid,p_recipient uuid,p_code text,p_allow_member boolean default false)
returns void language plpgsql stable security invoker set search_path='' as $$
declare room ojjuda_roulette_internal.rooms%rowtype;participant boolean;players_count integer;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then raise exception 'invalid_room';end if;
 if not ojjuda_roulette_internal.arcade_eligible(p_sender) or not ojjuda_roulette_internal.arcade_eligible(p_recipient)
  then raise exception 'adult_required';end if;
 select r.* into room from ojjuda_roulette_internal.rooms r where r.host_id=p_sender and r.code=p_code and r.status='betting'
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

alter table public.arcade_friend_invites drop constraint arcade_friend_invites_kind_check;
alter table public.arcade_friend_invites add constraint arcade_friend_invites_kind_check
 check(kind in('matgo','ttang','marble','tank','roulette'));


create or replace function ojjuda_arcade_internal.friend_invite_service(
 p_action text,p_to uuid default null,p_kind text default null,p_code text default null,p_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.arcade_friend_invites%rowtype; result jsonb; replies jsonb; desired text;
begin
 if actor is null or public.is_banned(actor) then raise exception 'not_allowed' using errcode='42501';end if;
 if p_action='list' then
  select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (
   select i.id,i.sender_id,i.recipient_id,i.kind,i.status,i.expires_at,p.nickname as sender_name
   from public.arcade_friend_invites i join public.profiles p on p.id=i.sender_id
   where i.recipient_id=actor and i.status='pending' and i.expires_at>now()
    and public.is_friend(actor,i.sender_id) and not public.blocked_between(actor,i.sender_id)
    and (i.kind<>'roulette' or (ojjuda_roulette_internal.arcade_eligible(actor) and ojjuda_roulette_internal.arcade_eligible(i.sender_id)))
   order by i.created_at desc limit 20
  ) x;
  select coalesce(jsonb_agg(x),'[]'::jsonb) into replies from (
   select i.id,i.kind,i.status,i.responded_at,p.nickname as recipient_name
   from public.arcade_friend_invites i join public.profiles p on p.id=i.recipient_id
   where i.sender_id=actor and i.status='declined' and i.response_seen_at is null
    and public.is_friend(actor,i.recipient_id) and not public.blocked_between(actor,i.recipient_id)
   order by i.responded_at,i.id limit 20
  ) x;
  return jsonb_build_object('ok',true,'invites',result,'responses',replies,'server_now',clock_timestamp());
 elsif p_action='send' then
  if p_to is null or p_to=actor or not public.is_friend(actor,p_to) or public.blocked_between(actor,p_to)
   or exists(select 1 from public.user_private where user_id=p_to and banned_until>now()) then raise exception 'friend_required' using errcode='42501';end if;
  if p_kind is null or p_kind not in ('matgo','ttang','marble','tank','roulette') or p_code is null then raise exception 'invalid_game';end if;
  if p_kind='roulette' then
   perform ojjuda_roulette_internal.assert_invite_room(actor,p_to,p_code);
  elsif p_kind='matgo' then
   if not exists(select 1 from ojjuda_matgo_internal.rooms where host_id=actor and code=p_code and status='waiting')
    then raise exception 'room_unavailable';end if;
  elsif p_kind='marble' then
   if p_code !~ '^[A-F0-9]{8}$' then raise exception 'invalid_room';end if;
   if not exists(select 1 from ojjuda_marble_internal.rooms where host_id=actor and code=p_code
    and status='waiting' and expires_at>now() and not (p_to=any(members)))
    then raise exception 'room_unavailable';end if;
   if exists(select 1 from ojjuda_marble_internal.rooms where code=p_code and cardinality(members)>=capacity)
    then raise exception 'room_full';end if;
  elsif p_kind='tank' then
   if p_code !~ '^[A-F0-9]{8}$' then raise exception 'invalid_room';end if;
   if not exists(select 1 from ojjuda_tank_internal.rooms where host_id=actor and code=p_code
    and status='waiting' and mode='online' and expires_at>now() and not (p_to=any(members)))
    then raise exception 'room_unavailable';end if;
   if exists(select 1 from ojjuda_tank_internal.rooms where code=p_code and cardinality(members)>=capacity)
    then raise exception 'room_full';end if;
  elsif p_code !~ '^[a-f0-9]{24}$' then raise exception 'invalid_room';end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select * into r from public.arcade_friend_invites where sender_id=actor and recipient_id=p_to
   and kind=p_kind and room_code=p_code and status='pending' and expires_at>now() order by created_at desc limit 1;
  if found then return jsonb_build_object('ok',true,'id',r.id,'expires_at',r.expires_at);end if;
  if (select count(*) from public.arcade_friend_invites where sender_id=actor and created_at>now()-interval '5 minutes')>=20
   then raise exception 'invite_rate_limit';end if;
  insert into public.arcade_friend_invites(sender_id,recipient_id,kind,room_code)
   values(actor,p_to,p_kind,p_code) returning * into r;
  return jsonb_build_object('ok',true,'id',r.id,'expires_at',r.expires_at);
 elsif p_action='ack' then
  select * into r from public.arcade_friend_invites where id=p_id for update;
  if not found or r.sender_id<>actor or r.status<>'declined'
   then raise exception 'invite_unavailable' using errcode='42501';end if;
  update public.arcade_friend_invites set response_seen_at=coalesce(response_seen_at,now()) where id=r.id;
  return jsonb_build_object('ok',true);
 elsif p_action in ('accept','decline','cancel') then
  select * into r from public.arcade_friend_invites where id=p_id for update;
  if not found or (p_action='cancel' and r.sender_id<>actor) or (p_action<>'cancel' and r.recipient_id<>actor)
   then raise exception 'invite_unavailable' using errcode='42501';end if;
  if p_action='cancel' then
   update public.arcade_friend_invites set status='cancelled' where id=r.id and status='pending';
   return jsonb_build_object('ok',true);
  end if;
  if not public.is_friend(actor,r.sender_id) or public.blocked_between(actor,r.sender_id)
   or exists(select 1 from public.user_private where user_id=r.sender_id and banned_until>now()) then raise exception 'invite_expired';end if;
  desired:=case when p_action='accept' then 'accepted' else 'declined' end;
  -- Retried decisions are idempotent; another tab cannot reverse an answer.
  if r.status=desired then
   return jsonb_build_object('ok',true,'kind',r.kind,'code',r.room_code);
  end if;
  if r.expires_at<=now() or r.status<>'pending' then raise exception 'invite_expired';end if;
  if p_action='accept' and r.kind='roulette' then
   perform ojjuda_roulette_internal.assert_invite_room(r.sender_id,actor,r.room_code,true);
  end if;
  if p_action='accept' and r.kind='matgo' and not exists(
   select 1 from ojjuda_matgo_internal.rooms where host_id=r.sender_id and code=r.room_code and status='waiting')
   then raise exception 'room_unavailable';end if;
  if p_action='accept' and r.kind='marble' then
   if not exists(select 1 from ojjuda_marble_internal.rooms where host_id=r.sender_id and code=r.room_code
    and status='waiting' and expires_at>now()) then raise exception 'room_unavailable';end if;
   if exists(select 1 from ojjuda_marble_internal.rooms where code=r.room_code
    and not (actor=any(members)) and cardinality(members)>=capacity) then raise exception 'room_full';end if;
  end if;
  if p_action='accept' and r.kind='tank' then
   if not exists(select 1 from ojjuda_tank_internal.rooms where host_id=r.sender_id and code=r.room_code
    and status='waiting' and mode='online' and expires_at>now()) then raise exception 'room_unavailable';end if;
   if exists(select 1 from ojjuda_tank_internal.rooms where code=r.room_code
    and not (actor=any(members)) and cardinality(members)>=capacity) then raise exception 'room_full';end if;
  end if;
  update public.arcade_friend_invites set status=desired,responded_at=now(),response_seen_at=null where id=r.id;
  return jsonb_build_object('ok',true,'kind',r.kind,'code',r.room_code);
 end if;
 raise exception 'invalid_action';
end;$$;

revoke all on function ojjuda_arcade_internal.friend_invite_service(text,uuid,text,text,uuid) from public,anon;
grant execute on function ojjuda_arcade_internal.friend_invite_service(text,uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
