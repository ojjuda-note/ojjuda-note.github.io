-- One Card has no wagers, wallet, paid items or age gate. Hands and deck are never
-- exposed through the Data API. The authenticated Edge Function projects each view.
create schema ojjuda_onecard_internal;
revoke all on schema ojjuda_onecard_internal from public, anon, authenticated;
grant usage on schema ojjuda_onecard_internal to service_role;

create table ojjuda_onecard_internal.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{8}$'),
  creator_id uuid not null,
  host_id uuid not null,
  members uuid[] not null,
  names text[] not null,
  departed boolean[] not null default '{false}',
  capacity integer not null default 5 check (capacity between 2 and 5),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'closed')),
  state jsonb,
  version integer not null default 0,
  round integer not null default 0,
  requests text[] not null default '{}',
  create_request uuid not null,
  deadline timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 minutes'),
  unique (creator_id, create_request),
  check (cardinality(members) between 0 and 5 and cardinality(members) <= capacity),
  check (cardinality(members) = cardinality(names) and cardinality(members) = cardinality(departed))
);
create index onecard_room_members on ojjuda_onecard_internal.rooms using gin (members)
  where status in ('waiting', 'active', 'finished');
create index onecard_room_creator_created on ojjuda_onecard_internal.rooms (creator_id, created_at desc);
create index onecard_waiting_rooms on ojjuda_onecard_internal.rooms (created_at desc) where status = 'waiting';
alter table ojjuda_onecard_internal.rooms enable row level security;
revoke all on ojjuda_onecard_internal.rooms from public, anon, authenticated, service_role;

-- The private definer owns the inaccessible room table. Its only caller is the
-- service-role-only invoker below; p_actor comes from /auth/v1/user, never a body field.
create function ojjuda_onecard_internal.room_service(
  p_actor uuid, p_action text, p_room uuid default null, p_code text default null,
  p_request uuid default null, p_expected integer default null,
  p_options jsonb default '{}', p_next jsonb default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  r ojjuda_onecard_internal.rooms%rowtype;
  existing uuid;
  seat integer;
  nick text;
  cap integer;
  n integer;
  m uuid;
  request_key text;
  prior_turn integer;
begin
  if p_actor is null or not exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = p_actor and not coalesce(u.is_anonymous, false)
  ) then raise exception 'not_signed_in'; end if;
  if public.is_banned(p_actor) then raise exception 'banned'; end if;
  if p_action is null or p_action not in ('mine', 'list', 'create', 'join', 'read', 'start', 'commit', 'leave')
    then raise exception 'invalid_request'; end if;
  if jsonb_typeof(p_options) is distinct from 'object' or octet_length(p_options::text) > 512
    then raise exception 'invalid_options'; end if;

  if p_action = 'list' then
    return jsonb_build_object('rooms', coalesce((
      select jsonb_agg(card) from (
        select jsonb_build_object('code', q.code, 'title', q.names[1] || '의 원카드',
          'players', cardinality(q.members), 'capacity', q.capacity) card
        from ojjuda_onecard_internal.rooms q
        where q.status = 'waiting' and q.expires_at > clock_timestamp() and cardinality(q.members) < q.capacity
          and not exists (select 1 from unnest(q.members) member
            where public.blocked_between(p_actor, member) or public.is_banned(member))
        order by q.created_at desc limit 30
      ) available
    ), '[]'::jsonb));
  end if;

  if p_action in ('mine', 'create', 'join') then
    -- One actor can join/create only one live room, including concurrent tabs.
    perform pg_advisory_xact_lock(hashtextextended('onecard:' || p_actor::text, 0));
    select id into existing from ojjuda_onecard_internal.rooms
      where members @> array[p_actor] and status in ('waiting', 'active', 'finished')
        and not departed[array_position(members, p_actor)] and expires_at > clock_timestamp()
      order by created_at desc limit 1;
    if p_action = 'mine' then
      if existing is null then return jsonb_build_object('room', null); end if;
      select * into r from ojjuda_onecard_internal.rooms where id = existing;
      return jsonb_build_object('room', to_jsonb(r));
    end if;
  end if;

  if p_action = 'create' then
    if p_request is null then raise exception 'invalid_request'; end if;
    select * into r from ojjuda_onecard_internal.rooms where creator_id = p_actor and create_request = p_request;
    if found then
      if r.status = 'closed' or r.expires_at <= clock_timestamp() or array_position(r.members, p_actor) is null
        or r.departed[array_position(r.members, p_actor)] then raise exception 'room_unavailable'; end if;
      return jsonb_build_object('room', to_jsonb(r));
    end if;
    if existing is not null then raise exception 'room_in_progress'; end if;
    if (select count(*) from ojjuda_onecard_internal.rooms
      where creator_id = p_actor and created_at > clock_timestamp() - interval '1 minute') >= 5
      then raise exception 'room_rate_limit'; end if;
    cap := (p_options->>'capacity')::integer;
    if cap is null or cap not between 2 and 5 then raise exception 'invalid_options'; end if;
    select left(regexp_replace(public.mask_banned(coalesce(nullif(btrim(nickname), ''), '회원')),
      '[[:cntrl:]<>]', '', 'g'), 16) into nick from public.profiles where id = p_actor;
    for n in 1..5 loop
      begin
        insert into ojjuda_onecard_internal.rooms (code, creator_id, host_id, members, names, capacity, create_request)
          values (upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
            p_actor, p_actor, array[p_actor], array[nick], cap, p_request) returning * into r;
        exit;
      exception when unique_violation then if n = 5 then raise; end if;
      end;
    end loop;
  else
    if p_action = 'join' then
      select * into r from ojjuda_onecard_internal.rooms where code = upper(p_code) for update;
    else
      select * into r from ojjuda_onecard_internal.rooms where id = p_room and members @> array[p_actor] for update;
    end if;
    if r.id is null then raise exception 'room_not_found'; end if;
    seat := array_position(r.members, p_actor);
    if r.expires_at <= clock_timestamp() or r.status = 'closed' then raise exception 'room_unavailable'; end if;
    if seat is not null and r.departed[seat] then raise exception 'room_unavailable'; end if;

    if p_action = 'join' and seat is null then
      if existing is not null then raise exception 'room_in_progress'; end if;
      if r.status <> 'waiting' then raise exception 'room_unavailable'; end if;
      if cardinality(r.members) >= r.capacity then raise exception 'room_full'; end if;
      if exists (select 1 from unnest(r.members) member where public.blocked_between(p_actor, member))
        then raise exception 'room_unavailable'; end if;
      if exists (select 1 from unnest(r.members) member where public.is_banned(member))
        then raise exception 'room_unavailable'; end if;
      select left(regexp_replace(public.mask_banned(coalesce(nullif(btrim(nickname), ''), '회원')),
        '[[:cntrl:]<>]', '', 'g'), 16) into nick from public.profiles where id = p_actor;
      update ojjuda_onecard_internal.rooms set members = array_append(members, p_actor),
        names = array_append(names, nick), departed = array_append(departed, false), version = version + 1,
        expires_at = clock_timestamp() + interval '30 minutes'
        where id = r.id returning * into r;
    elsif p_action in ('start', 'commit', 'leave') then
      if p_request is null then raise exception 'invalid_request'; end if;
      request_key := p_actor::text || ':' || p_request::text;
      if not (request_key = any(r.requests)) then
        if r.version is distinct from p_expected then raise exception 'state_conflict'; end if;
        prior_turn := (r.state->>'turn')::integer;
        if p_action = 'start' then
          if r.status not in ('waiting', 'finished') or r.host_id <> p_actor then raise exception 'not_room_owner'; end if;
          if (select count(*) from unnest(r.departed) d where not d) < 2 then raise exception 'need_players'; end if;
          foreach m in array r.members loop
            if not r.departed[array_position(r.members, m)] and public.is_banned(m) then raise exception 'banned'; end if;
          end loop;
          r.members := array(select value from unnest(r.members) with ordinality a(value, i) where not r.departed[i] order by i);
          r.names := array(select value from unnest(r.names) with ordinality a(value, i) where not r.departed[i] order by i);
          r.departed := array_fill(false, array[cardinality(r.members)]);
          r.round := r.round + 1;
          if p_next->'state' is null or p_next->'state' = 'null'::jsonb then raise exception 'invalid_request'; end if;
        elsif p_action = 'commit' then
          if r.status <> 'active' then raise exception 'room_unavailable'; end if;
          if p_next->>'kind' = 'timeout' then
            if r.deadline is null or r.deadline > clock_timestamp() then raise exception 'not_your_turn'; end if;
          elsif p_next->>'command' is distinct from 'declare' and prior_turn is distinct from seat - 1 then
            raise exception 'not_your_turn';
          end if;
          if p_next->'state' is null or p_next->'state' = 'null'::jsonb then raise exception 'invalid_request'; end if;
        else
          if r.status = 'waiting' then
            r.members := array_remove(r.members, p_actor);
            r.names := array(select value from unnest(r.names) with ordinality a(value, i) where i <> seat order by i);
            r.departed := array_fill(false, array[cardinality(r.members)]);
          else
            r.departed[seat] := true;
            if r.status = 'active' and (p_next->'state' is null or p_next->'state' = 'null'::jsonb)
              then raise exception 'invalid_request'; end if;
          end if;
          select value into m from unnest(r.members) with ordinality a(value, i) where not r.departed[i] order by i limit 1;
          r.host_id := coalesce(m, r.host_id);
          if m is null then r.status := 'closed'; end if;
        end if;

        if p_next->'state' is not null and p_next->'state' <> 'null'::jsonb then
          if jsonb_typeof(p_next->'state') is distinct from 'object' or octet_length(p_next::text) > 65536
            or jsonb_array_length(p_next->'state'->'players') is distinct from cardinality(r.members)
            or p_next->'state'->>'status' not in ('playing', 'finished') then raise exception 'invalid_request'; end if;
          for n in 1..cardinality(r.members) loop
            if p_next->'state'->'players'->(n - 1)->>'id' is distinct from r.members[n]::text
              then raise exception 'invalid_request'; end if;
          end loop;
          r.state := p_next->'state';
          if r.status <> 'closed' then
            r.status := case when r.state->>'status' = 'finished' then 'finished' else 'active' end;
          end if;
          -- Declaring ONE CARD does not buy extra thinking time.
          if p_action = 'start' or p_next->>'command' is distinct from 'declare' then
            r.deadline := clock_timestamp() + make_interval(secs => case when p_action = 'start' then 35 else 30 end);
          end if;
        end if;
        if r.status <> 'active' then r.deadline := null; end if;
        update ojjuda_onecard_internal.rooms set state = r.state, status = r.status, round = r.round,
          members = r.members, names = r.names, departed = r.departed, host_id = r.host_id,
          deadline = r.deadline, version = version + 1,
          requests = array_append(r.requests[greatest(1, cardinality(r.requests) - 254):cardinality(r.requests)], request_key),
          expires_at = clock_timestamp() + case when r.status = 'waiting' then interval '30 minutes' else interval '2 hours' end
          where id = r.id returning * into r;
      end if;
    end if;
  end if;
  return jsonb_build_object('room', to_jsonb(r));
end;
$$;
revoke all on function ojjuda_onecard_internal.room_service(uuid, text, uuid, text, uuid, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function ojjuda_onecard_internal.room_service(uuid, text, uuid, text, uuid, integer, jsonb, jsonb) to service_role;

create function public.onecard_online_service(
  p_actor uuid, p_action text, p_room uuid default null, p_code text default null,
  p_request uuid default null, p_expected integer default null,
  p_options jsonb default '{}', p_next jsonb default null
) returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select ojjuda_onecard_internal.room_service(p_actor, p_action, p_room, p_code, p_request, p_expected, p_options, p_next);
$$;
revoke all on function public.onecard_online_service(uuid, text, uuid, text, uuid, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.onecard_online_service(uuid, text, uuid, text, uuid, integer, jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
