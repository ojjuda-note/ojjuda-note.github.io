-- Only the authenticated Marble Edge Function can read or commit room snapshots.
create schema if not exists ojjuda_marble_internal;
revoke all on schema ojjuda_marble_internal from public,anon,authenticated;
grant usage on schema ojjuda_marble_internal to service_role;
create table ojjuda_marble_internal.rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check(code ~ '^[A-F0-9]{8}$'),
 host_id uuid not null,
 members uuid[] not null,
 names text[] not null,
 title text not null check(char_length(title) between 1 and 40),
 capacity integer not null check(capacity between 2 and 8),
 max_round integer not null check(max_round in (0,15,25)),
 status text not null default 'waiting' check(status in ('waiting','active','finished','closed')),
 state jsonb,
 version integer not null default 0,
 requests uuid[] not null default '{}',
 create_request uuid not null,
 deadline timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '30 minutes'),
 ranked_at timestamptz,
 unique(host_id,create_request),
 check(cardinality(members) between 0 and 8 and cardinality(members)=cardinality(names))
);
create index marble_room_members on ojjuda_marble_internal.rooms using gin(members) where status in ('waiting','active');
create index marble_room_host_created on ojjuda_marble_internal.rooms(host_id,created_at desc);
alter table ojjuda_marble_internal.rooms enable row level security;
revoke all on ojjuda_marble_internal.rooms from public,anon,authenticated,service_role;

create function ojjuda_marble_internal.room_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_request uuid default null,p_expected integer default null,p_options jsonb default '{}',p_next jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r ojjuda_marble_internal.rooms%rowtype; existing uuid; seat integer; nick text; cap integer; rounds integer; title_value text; score_value integer; n integer;
begin
 if p_actor is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=p_actor and not coalesce(u.is_anonymous,false)) then raise exception 'not_signed_in';end if;
 if public.is_banned(p_actor) then raise exception 'banned';end if;
 if p_action is null or p_action not in ('mine','create','join','read','start','commit','leave') then raise exception 'invalid_action';end if;
 if jsonb_typeof(p_options) is distinct from 'object' or octet_length(p_options::text)>1024 then raise exception 'invalid_options';end if;
 -- Serialize membership changes per person and game changes per room, never network calls.
 if p_action in ('mine','create','join') then
  perform pg_advisory_xact_lock(hashtextextended('marble:'||p_actor::text,0));
  select id into existing from ojjuda_marble_internal.rooms where members @> array[p_actor] and status in ('waiting','active') and expires_at>clock_timestamp() order by created_at desc limit 1;
  if p_action='mine' then
   if existing is null then return jsonb_build_object('room',null);end if;
   select * into r from ojjuda_marble_internal.rooms where id=existing;
   return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1);
  end if;
 end if;
 if p_action='create' then
  if p_request is null then raise exception 'invalid_request';end if;
  select * into r from ojjuda_marble_internal.rooms where host_id=p_actor and create_request=p_request;
  if found then return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1);end if;
  if existing is not null then raise exception 'room_in_progress';end if;
  if (select count(*) from ojjuda_marble_internal.rooms where host_id=p_actor and created_at>clock_timestamp()-interval '1 minute')>=5 then raise exception 'room_rate_limit';end if;
  cap:=coalesce((p_options->>'capacity')::integer,4);rounds:=coalesce((p_options->>'maxRound')::integer,25);
  title_value:=btrim(coalesce(p_options->>'title','오쭈다 마블 같이 해요'));
  if cap not between 2 and 8 or rounds not in (0,15,25) or char_length(title_value) not between 1 and 40 then raise exception 'invalid_options';end if;
  select left(regexp_replace(coalesce(nullif(btrim(nickname),''),'회원'),'[[:cntrl:]<>]','','g'),12) into nick from public.profiles where id=p_actor;
  for n in 1..5 loop
   begin
    insert into ojjuda_marble_internal.rooms(code,host_id,members,names,title,capacity,max_round,create_request)
     values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),p_actor,array[p_actor],array[nick],title_value,cap,rounds,p_request) returning * into r;
    exit;
   exception when unique_violation then if n=5 then raise;end if;
   end;
  end loop;
 else
  if p_action='join' then
   select * into r from ojjuda_marble_internal.rooms where code=upper(p_code) for update;
  else
   select * into r from ojjuda_marble_internal.rooms where id=p_room and members @> array[p_actor] for update;
  end if;
  if r.id is null then raise exception 'room_not_found';end if;
  if r.expires_at<=clock_timestamp() or r.status='closed' then raise exception 'room_unavailable';end if;
  seat:=array_position(r.members,p_actor);
  if p_action='join' and seat is null then
   if existing is not null then raise exception 'room_in_progress';end if;
   if r.status<>'waiting' then raise exception 'room_already_started';end if;
   if cardinality(r.members)>=r.capacity then raise exception 'room_full';end if;
   if exists(select 1 from unnest(r.members) m where public.blocked_between(p_actor,m) or public.is_banned(m)) then raise exception 'room_unavailable';end if;
   select left(regexp_replace(coalesce(nullif(btrim(nickname),''),'회원'),'[[:cntrl:]<>]','','g'),12) into nick from public.profiles where id=p_actor;
   update ojjuda_marble_internal.rooms set members=array_append(members,p_actor),names=array_append(names,nick),version=version+1 where id=r.id returning * into r;
  elsif p_action='leave' then
   if r.status='active' then raise exception 'use_surrender';end if;
   if r.status='waiting' then
    r.members:=array_remove(r.members,p_actor);
    r.names:=array(select name from unnest(r.names) with ordinality as x(name,idx) where idx<>seat order by idx);
    update ojjuda_marble_internal.rooms set members=r.members,names=r.names,host_id=coalesce(r.members[1],r.host_id),status=case when cardinality(r.members)=0 then 'closed' else 'waiting' end,version=version+1 where id=r.id;
   end if;
   return jsonb_build_object('room',null);
  elsif p_action in ('start','commit') then
   if p_request is null then raise exception 'invalid_request';end if;
   if not (p_request=any(r.requests)) then
    if r.version is distinct from p_expected then raise exception 'state_conflict';end if;
    if p_action='start' then
     if r.status<>'waiting' or r.host_id<>p_actor then raise exception 'not_room_owner';end if;
     if cardinality(r.members)<2 then raise exception 'need_players';end if;
     if exists(select 1 from unnest(r.members) m where public.is_banned(m)) then raise exception 'room_unavailable';end if;
    elsif r.status<>'active' then raise exception 'room_unavailable';end if;
    if jsonb_typeof(p_next->'state') is distinct from 'object' or octet_length(p_next::text)>65536
      or jsonb_array_length(p_next->'state'->'players') is distinct from cardinality(r.members)
      or p_next->'state'->>'runId' is distinct from r.id::text then raise exception 'invalid_state';end if;
    update ojjuda_marble_internal.rooms set state=p_next->'state',version=version+1,
     status=case when (p_next->'state'->>'over')::boolean then 'finished' else 'active' end,
     requests=array_append(r.requests[greatest(1,cardinality(r.requests)-510):cardinality(r.requests)],p_request),
     deadline=clock_timestamp()+interval '45 seconds',expires_at=clock_timestamp()+interval '24 hours'
     where id=r.id returning * into r;
    if r.status='finished' and r.ranked_at is null then
     if jsonb_typeof(p_next->'scores') is distinct from 'array' or jsonb_array_length(p_next->'scores')<>cardinality(r.members) then raise exception 'invalid_result';end if;
     for n in 1..cardinality(r.members) loop
      score_value:=(p_next->'scores'->>(n-1))::integer;
      if score_value is null or score_value not between 0 and 1000000 then raise exception 'invalid_result';end if;
      if exists(select 1 from public.profiles where id=r.members[n]) and not public.is_banned(r.members[n]) then
       insert into public.game_scores(user_id,nick,game,score,reward,verified) values(r.members[n],r.names[n],'tour',score_value,0,false);
      end if;
     end loop;
     update ojjuda_marble_internal.rooms set ranked_at=clock_timestamp() where id=r.id returning * into r;
    end if;
   end if;
  end if;
 end if;
 return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1);
end;
$$;
revoke all on function ojjuda_marble_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function ojjuda_marble_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) to service_role;
create function public.marble_online_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_request uuid default null,p_expected integer default null,p_options jsonb default '{}',p_next jsonb default null)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select ojjuda_marble_internal.room_service(p_actor,p_action,p_room,p_code,p_request,p_expected,p_options,p_next);
$$;
revoke all on function public.marble_online_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.marble_online_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
