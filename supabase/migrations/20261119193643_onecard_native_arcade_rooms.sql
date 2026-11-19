-- Register One Card in the shared native arcade directory. Existing games,
-- private hands, CAS/leave semantics and the five-seat engine are unchanged.
-- The common identity sequence is the only allocator: no duplicated registry
-- row, separate counter, client sequence grant, or sequence reset is needed.
alter table ojjuda_onecard_internal.rooms
  add column room_no bigint not null default nextval('ojjuda_arcade_internal.rooms_room_no_seq'::regclass),
  add column title text not null default '원카드 같이 한 판 해요',
  add constraint onecard_room_number_unique unique (room_no),
  add constraint onecard_room_number_safe check (room_no between 1001 and 9007199254740991),
  add constraint onecard_room_title_length check (char_length(replace(title, '❤️❤️', 'x')) between 1 and 40);
create index onecard_native_room_directory on ojjuda_onecard_internal.rooms (created_at desc)
  where status in ('waiting', 'active', 'finished');

create or replace function ojjuda_onecard_internal.room_service(
  p_actor uuid, p_action text, p_room uuid default null, p_code text default null,
  p_request uuid default null, p_expected integer default null,
  p_options jsonb default '{}', p_next jsonb default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  r ojjuda_onecard_internal.rooms%rowtype;
  existing uuid;
  seat integer;
  nick text;
  title_value text;
  cap integer;
  n integer;
  m uuid;
  request_key text;
  prior_turn integer;
  prior_player jsonb;
  new_player jsonb;
  member_index integer;
  expected_seats integer;
  old_ids text[];
  new_ids text[];
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
    -- The directory receives only explicit public metadata, never state or
    -- membership UUID arrays. Computers do not consume a human waiting seat.
    return jsonb_build_object('ok', true, 'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'room_no', q.room_no, 'kind', 'onecard', 'native', true, 'title', q.title,
        'status', case when q.status = 'active' then 'playing' else 'waiting' end,
        'host_name', q.host_name, 'players', cardinality(q.humans), 'capacity', 5,
        'is_host', p_actor = q.host_id, 'is_member', p_actor = any(q.humans),
        'match_id', q.id, 'code', q.code, 'created_at', q.created_at
      ) order by q.created_at desc) from (
        select source_room.id, source_room.code, source_room.room_no, source_room.title, source_room.status, source_room.host_id, source_room.created_at,
          coalesce(source_room.names[array_position(source_room.members, source_room.host_id)], '회원') as host_name,
          people.humans
        from ojjuda_onecard_internal.rooms source_room
        cross join lateral (
          select array(select member from unnest(source_room.members) with ordinality member_entry(member, i)
            where not source_room.departed[member_entry.i] order by member_entry.i) as humans
        ) people
        where source_room.status in ('waiting', 'active', 'finished') and source_room.expires_at > clock_timestamp()
          and cardinality(people.humans) > 0
          and (source_room.status <> 'finished' or p_actor = any(people.humans))
          and not exists (select 1 from unnest(people.humans) member
            where public.blocked_between(p_actor, member) or public.is_banned(member))
        order by source_room.created_at desc limit 100
      ) q
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
      -- A concurrent leave can commit after the ID lookup. Lock and recheck
      -- membership before exposing this member's hand (now possibly computer-owned).
      select * into r from ojjuda_onecard_internal.rooms
        where id = existing and members @> array[p_actor]
          and not departed[array_position(members, p_actor)]
          and status in ('waiting', 'active', 'finished') and expires_at > clock_timestamp()
        for update;
      if not found then return jsonb_build_object('room', null); end if;
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
    -- Title masking is authoritative and idempotent. A mask counts as one
    -- displayed character, matching the shared content rule.
    if p_options ? 'title' and jsonb_typeof(p_options->'title') is distinct from 'string'
      then raise exception 'invalid_title'; end if;
    title_value := public.mask_banned(btrim(regexp_replace(
      coalesce(p_options->>'title', '원카드 같이 한 판 해요'), '[[:space:]]+', ' ', 'g')));
    if char_length(replace(title_value, '❤️❤️', 'x')) not between 1 and 40
      or title_value ~ '[[:cntrl:]]' then raise exception 'invalid_title'; end if;
    -- Older browsers can request a smaller capacity; new tables always have five seats.
    cap := 5;
    select left(regexp_replace(public.mask_banned(coalesce(nullif(btrim(nickname), ''), '회원')),
      '[[:cntrl:]<>]', '', 'g'), 16) into nick from public.profiles where id = p_actor;
    for n in 1..5 loop
      begin
        insert into ojjuda_onecard_internal.rooms (code, creator_id, host_id, members, names, capacity, create_request, title)
          values (upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
            p_actor, p_actor, array[p_actor], array[nick], cap, p_request, title_value) returning * into r;
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
      if cardinality(r.members) >= 5 then raise exception 'room_full'; end if;
      if exists (select 1 from unnest(r.members) member where public.blocked_between(p_actor, member))
        then raise exception 'room_unavailable'; end if;
      if exists (select 1 from unnest(r.members) member where public.is_banned(member))
        then raise exception 'room_unavailable'; end if;
      select left(regexp_replace(public.mask_banned(coalesce(nullif(btrim(nickname), ''), '회원')),
        '[[:cntrl:]<>]', '', 'g'), 16) into nick from public.profiles where id = p_actor;
      update ojjuda_onecard_internal.rooms set members = array_append(members, p_actor),
        names = array_append(names, nick), departed = array_append(departed, false), capacity = 5, version = version + 1,
        expires_at = clock_timestamp() + interval '30 minutes'
        where id = r.id returning * into r;
    elsif p_action in ('start', 'commit', 'leave') then
      if p_request is null then raise exception 'invalid_request'; end if;
      request_key := p_actor::text || ':' || p_request::text;
      if not (request_key = any(r.requests)) then
        if r.version is distinct from p_expected then raise exception 'state_conflict'; end if;
        prior_turn := (r.state->>'turn')::integer;
        prior_player := r.state->'players'->prior_turn;
        -- Already-running legacy games keep their exact seats and hands until
        -- that round ends. Only a fresh start changes the seating to five.
        expected_seats := jsonb_array_length(r.state->'players');
        if p_action = 'start' then
          if r.status not in ('waiting', 'finished') or r.host_id <> p_actor then raise exception 'not_room_owner'; end if;
          if (select count(*) from unnest(r.departed) d where not d) < 1 then raise exception 'need_players'; end if;
          foreach m in array r.members loop
            if not r.departed[array_position(r.members, m)] and public.is_banned(m) then raise exception 'banned'; end if;
          end loop;
          r.members := array(select value from unnest(r.members) with ordinality a(value, i) where not r.departed[i] order by i);
          r.names := array(select value from unnest(r.names) with ordinality a(value, i) where not r.departed[i] order by i);
          r.departed := array_fill(false, array[cardinality(r.members)]);
          r.round := r.round + 1;
          r.capacity := 5;
          expected_seats := 5;
          if p_next->'state' is null or p_next->'state' = 'null'::jsonb then raise exception 'invalid_request'; end if;
        elsif p_action = 'commit' then
          if r.status <> 'active' then raise exception 'room_unavailable'; end if;
          if p_next->>'kind' in ('computer', 'timeout') then
            if r.deadline is null or r.deadline > clock_timestamp() then raise exception 'not_your_turn'; end if;
            if p_next->>'kind' = 'computer' and prior_player->'bot' is distinct from 'true'::jsonb
              then raise exception 'not_your_turn'; end if;
            if p_next->>'kind' = 'timeout' and prior_player->'bot' = 'true'::jsonb
              then raise exception 'not_your_turn'; end if;
          elsif p_next->>'kind' is distinct from 'move' then
            raise exception 'invalid_request';
          elsif p_next->>'command' is distinct from 'declare' and prior_player->>'id' is distinct from p_actor::text then
            -- Human membership order no longer equals the shuffled game-seat order.
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
            or jsonb_array_length(p_next->'state'->'players') is distinct from expected_seats
            or expected_seats not between 2 and 5
            or p_next->'state'->>'status' not in ('playing', 'finished')
            or (p_next->'state'->>'direction')::integer is distinct from 1 then raise exception 'invalid_request'; end if;
          select array_agg(value->>'id' order by ordinality) into new_ids
            from jsonb_array_elements(p_next->'state'->'players') with ordinality;
          if (select count(distinct value) from unnest(new_ids) value) <> expected_seats
            then raise exception 'invalid_request'; end if;
          if p_action <> 'start' then
            select array_agg(value->>'id' order by ordinality) into old_ids
              from jsonb_array_elements(r.state->'players') with ordinality;
            if new_ids is distinct from old_ids then raise exception 'invalid_request'; end if;
          end if;
          foreach m in array r.members loop
            if not (m::text = any(new_ids)) then raise exception 'invalid_request'; end if;
          end loop;
          for new_player in select value from jsonb_array_elements(p_next->'state'->'players') loop
            select i::integer into member_index from unnest(r.members) with ordinality a(value, i)
              where value::text = new_player->>'id';
            if member_index is null then
              if new_player->'bot' is distinct from 'true'::jsonb
                then raise exception 'invalid_request'; end if;
              if p_action = 'start' and new_player->>'id' !~
                ('^onecard-bot:' || r.id::text || ':' || r.round::text || ':[0-4]$')
                then raise exception 'invalid_request'; end if;
            elsif not r.departed[member_index] then
              if new_player->'bot' is distinct from 'false'::jsonb
                then raise exception 'invalid_request'; end if;
            elsif new_player->'active' = 'true'::jsonb and new_player->'bot' is distinct from 'true'::jsonb then
              -- A departed human's live hand can only be played by the server.
              -- Previously eliminated legacy seats stay eliminated.
              raise exception 'invalid_request';
            end if;
          end loop;
          r.state := p_next->'state';
          if r.status <> 'closed' then
            r.status := case when r.state->>'status' = 'finished' then 'finished' else 'active' end;
          end if;
          if p_action = 'start' then
            -- All clients see the initial deal before a computer may act.
            r.deadline := clock_timestamp() + make_interval(secs =>
              case when r.state->'players'->((r.state->>'turn')::integer)->'bot' = 'true'::jsonb then 5 else 35 end);
          elsif p_action = 'commit' and p_next->>'command' is distinct from 'declare'
            or p_action = 'leave' and prior_player->>'id' = p_actor::text then
            r.deadline := clock_timestamp() + make_interval(secs =>
              case when r.state->'players'->((r.state->>'turn')::integer)->'bot' = 'true'::jsonb then 1.6 else 30 end);
          end if;
          -- Declaring and another person's departure keep the current deadline.
          -- The last human leaving closes the room without inventing a result.
        end if;
        if r.status <> 'active' then r.deadline := null; end if;
        update ojjuda_onecard_internal.rooms set state = r.state, status = r.status, round = r.round,
          members = r.members, names = r.names, departed = r.departed, host_id = r.host_id, capacity = r.capacity,
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
revoke all on function public.onecard_online_service(uuid, text, uuid, text, uuid, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.onecard_online_service(uuid, text, uuid, text, uuid, integer, jsonb, jsonb) to service_role;

-- The existing arcade schema already allows authenticated callers. This fixed,
-- parameterless directory wrapper delegates only the safe list action. One Card's
-- own schema, table and mutating RPC remain inaccessible to browser roles.
create function ojjuda_arcade_internal.onecard_rooms()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'not_signed_in'; end if;
  return ojjuda_onecard_internal.room_service(actor, 'list');
end;
$$;
revoke all on function ojjuda_arcade_internal.onecard_rooms() from public, anon;
grant execute on function ojjuda_arcade_internal.onecard_rooms() to authenticated;

-- Preserve the existing providers, including their own access/age checks.
create or replace function public.arcade_general_extra_rooms()
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select jsonb_build_object('ok', true, 'rooms',
    coalesce(ojjuda_poker_internal.arcade_rooms()->'rooms', '[]'::jsonb)
    || coalesce(ojjuda_bang_internal.arcade_rooms()->'rooms', '[]'::jsonb)
    || coalesce(ojjuda_roulette_internal.arcade_rooms()->'rooms', '[]'::jsonb)
    || coalesce(ojjuda_arcade_internal.onecard_rooms()->'rooms', '[]'::jsonb));
$$;
revoke all on function public.arcade_general_extra_rooms() from public, anon;
grant execute on function public.arcade_general_extra_rooms() to authenticated;
notify pgrst, 'reload schema';
