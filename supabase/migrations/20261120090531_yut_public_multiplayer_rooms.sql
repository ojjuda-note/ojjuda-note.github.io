-- Public discovery and authenticated seats for the existing signed Yut game.
-- Game actions remain on the signed channel; the directory never exposes its
-- signing keys, member UUIDs or state to spectators.
create schema ojjuda_yut_internal;
revoke all on schema ojjuda_yut_internal from public, anon;
grant usage on schema ojjuda_yut_internal to authenticated;

create table ojjuda_yut_internal.rooms (
  room_no bigint primary key default nextval('ojjuda_arcade_internal.rooms_room_no_seq'::regclass),
  host_id uuid not null references auth.users(id) on delete cascade,
  host_key text not null unique check (host_key ~ '^B[A-Za-z0-9_-]{86}$'),
  request_id uuid not null,
  title text not null check (char_length(replace(title, '❤️❤️', 'x')) between 1 and 40),
  capacity integer not null check (capacity between 2 and 8),
  setup jsonb not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'closed')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '90 seconds',
  unique(host_id, request_id),
  check (room_no between 1001 and 9007199254740991)
);
create table ojjuda_yut_internal.members (
  room_no bigint not null references ojjuda_yut_internal.rooms(room_no) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^B[A-Za-z0-9_-]{86}$'),
  name text not null,
  joined_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '90 seconds',
  departed boolean not null default false,
  primary key(room_no, user_id), unique(room_no, key)
);
create index yut_open_rooms on ojjuda_yut_internal.rooms(expires_at) where status <> 'closed';
create index yut_member_rooms on ojjuda_yut_internal.members(user_id, room_no) where not departed;
alter table ojjuda_yut_internal.rooms enable row level security;
alter table ojjuda_yut_internal.members enable row level security;
revoke all on all tables in schema ojjuda_yut_internal from public, anon, authenticated;

create function ojjuda_yut_internal.room_view(r ojjuda_yut_internal.rooms, actor uuid)
returns jsonb language sql stable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'room_no', r.room_no, 'title', r.title, 'capacity', r.capacity,
    'status', r.status, 'host', r.host_key, 'is_host', r.host_id = actor,
    'setup', r.setup, 'players', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'name', name,
        'is_host', user_id = r.host_id, 'departed', departed) order by case when user_id = r.host_id then 0 else 1 end, joined_at, user_id)
      from ojjuda_yut_internal.members where room_no = r.room_no
    ), '[]'::jsonb));
$$;

create function ojjuda_yut_internal.directory()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if actor is null or not exists (select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = actor and not coalesce(u.is_anonymous, false)) then raise exception 'not_signed_in'; end if;
  if public.is_banned(actor) then raise exception 'banned'; end if;
  select coalesce(jsonb_agg(card order by created_at desc), '[]'::jsonb) into result from (
    select r.created_at, jsonb_build_object(
      'room_no', r.room_no, 'kind', 'yut', 'native', true, 'title', r.title,
      'status', r.status, 'host_name', host.name,
      'players', (select count(*) from ojjuda_yut_internal.members m where m.room_no = r.room_no
        and not m.departed and (r.status = 'playing' or m.expires_at > clock_timestamp())),
      'capacity', r.capacity, 'is_host', r.host_id = actor,
      'is_member', exists(select 1 from ojjuda_yut_internal.members m where m.room_no = r.room_no
        and m.user_id = actor and not m.departed and (r.status = 'playing' or m.expires_at > clock_timestamp())),
      'match_id', r.room_no::text, 'code', r.room_no::text, 'created_at', r.created_at
    ) card
    from ojjuda_yut_internal.rooms r
    join ojjuda_yut_internal.members host on host.room_no = r.room_no and host.user_id = r.host_id
    where r.status <> 'closed' and r.expires_at > clock_timestamp()
      and not exists(select 1 from ojjuda_yut_internal.members m where m.room_no = r.room_no
        and not m.departed and (public.blocked_between(actor, m.user_id) or public.is_banned(m.user_id)))
    order by r.created_at desc limit 100
  ) listed;
  return jsonb_build_object('ok', true, 'rooms', result,
    'mine', (select card from jsonb_array_elements(result) card where (card->>'is_member')::boolean limit 1));
end;
$$;

create function ojjuda_yut_internal.room_service(p_action text, p_room bigint default null, p_options jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  actor uuid := auth.uid(); r ojjuda_yut_internal.rooms%rowtype;
  member ojjuda_yut_internal.members%rowtype;
  key_value text; nick text; title_value text; request_value uuid;
  cap integer; settings jsonb; counts jsonb; animals jsonb; offset_value integer; mode_value text;
  room_keys jsonb; present_count integer;
begin
  if actor is null or not exists(select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = actor and not coalesce(u.is_anonymous, false)) then raise exception 'not_signed_in'; end if;
  if public.is_banned(actor) then raise exception 'banned'; end if;
  if p_action is null or p_action not in ('list','create','join','heartbeat','start','leave') then raise exception 'invalid_action'; end if;
  if jsonb_typeof(p_options) is distinct from 'object' or octet_length(p_options::text) > 4096 then raise exception 'invalid_options'; end if;
  if p_action = 'list' then return ojjuda_yut_internal.directory(); end if;
  -- Serialize an actor's simultaneous tabs before locking their selected room.
  perform pg_advisory_xact_lock(hashtextextended('yut-room:' || actor::text, 0));
  if p_action in ('create','join') then
    key_value := p_options->>'key';
    if key_value is null or key_value !~ '^B[A-Za-z0-9_-]{86}$' then raise exception 'invalid_identity'; end if;
    select left(regexp_replace(public.mask_banned(coalesce(nullif(btrim(nickname), ''), '회원')),
      '[[:cntrl:]<>]', '', 'g'), 16) into nick from public.profiles where id = actor;
  end if;
  if p_action = 'create' then
    begin request_value := (p_options->>'request_id')::uuid; exception when invalid_text_representation then raise exception 'invalid_request'; end;
    if request_value is null then raise exception 'invalid_request'; end if;
    select * into r from ojjuda_yut_internal.rooms where host_id = actor and request_id = request_value for update;
    if found then
      if r.status = 'closed' or r.expires_at <= clock_timestamp() then raise exception 'room_unavailable'; end if;
      if r.host_key <> key_value then raise exception 'room_identity_mismatch'; end if;
      return jsonb_build_object('ok', true, 'room', ojjuda_yut_internal.room_view(r, actor));
    end if;
    if exists(select 1 from ojjuda_yut_internal.rooms a join ojjuda_yut_internal.members m using(room_no)
      where m.user_id = actor and not m.departed and a.status <> 'closed' and a.expires_at > clock_timestamp()
        and (a.status = 'playing' or m.expires_at > clock_timestamp())) then raise exception 'room_in_progress'; end if;
    if (select count(*) from ojjuda_yut_internal.rooms where host_id = actor and created_at > clock_timestamp() - interval '1 minute') >= 5 then raise exception 'room_rate_limit'; end if;
    if jsonb_typeof(p_options->'title') is distinct from 'string' then raise exception 'invalid_title'; end if;
    title_value := public.mask_banned(btrim(regexp_replace(p_options->>'title', '[[:space:]]+', ' ', 'g')));
    if char_length(replace(title_value, '❤️❤️', 'x')) not between 1 and 40 or title_value ~ '[[:cntrl:]]' then raise exception 'invalid_title'; end if;
    if coalesce(p_options->>'capacity','') !~ '^[2-8]$' then raise exception 'invalid_capacity'; end if;
    cap := (p_options->>'capacity')::integer;
    settings := coalesce(p_options->'setup', '{}'::jsonb);
    if jsonb_typeof(settings) <> 'object' then raise exception 'invalid_options'; end if;
    mode_value := coalesce(settings->>'mode', 'island');
    if mode_value not in ('island','easy') or coalesce(settings->>'offset','2') !~ '^([0-9]|1[01])$' then raise exception 'invalid_options'; end if;
    offset_value := coalesce(settings->>'offset','2')::integer;
    counts := coalesce(settings->'counts', (select jsonb_agg(4) from generate_series(1, cap)));
    animals := coalesce(settings->'animals', (select jsonb_agg((offset_value + x) % 12 order by i) from unnest(array[0,3,6,9,1,4,7,10]) with ordinality a(x,i) where i <= cap));
    if jsonb_typeof(counts) <> 'array' or jsonb_typeof(animals) <> 'array' then raise exception 'invalid_options'; end if;
    if jsonb_array_length(counts) <> cap or jsonb_array_length(animals) <> cap
      or exists(select 1 from jsonb_array_elements(counts) v where jsonb_typeof(v) <> 'number' or v::text !~ '^[2-4]$')
      or exists(select 1 from jsonb_array_elements(animals) v where jsonb_typeof(v) <> 'number' or v::text !~ '^([0-9]|1[01])$') then raise exception 'invalid_options'; end if;
    settings := jsonb_build_object('count', cap, 'mode', mode_value, 'offset', offset_value, 'counts', counts, 'animals', animals);
    insert into ojjuda_yut_internal.rooms(host_id,host_key,request_id,title,capacity,setup)
      values(actor,key_value,request_value,title_value,cap,settings) returning * into r;
    insert into ojjuda_yut_internal.members(room_no,user_id,key,name) values(r.room_no,actor,key_value,nick);
    return jsonb_build_object('ok', true, 'room', ojjuda_yut_internal.room_view(r, actor));
  end if;

  select * into r from ojjuda_yut_internal.rooms where room_no = p_room for update;
  if not found then raise exception 'room_unavailable'; end if;
  select * into member from ojjuda_yut_internal.members where room_no = r.room_no and user_id = actor;
  if p_action = 'leave' then
    if member.user_id is null then raise exception 'not_room_member'; end if;
    if actor = r.host_id then update ojjuda_yut_internal.rooms set status = 'closed' where room_no = r.room_no;
    elsif r.status = 'waiting' then delete from ojjuda_yut_internal.members where room_no = r.room_no and user_id = actor;
    else update ojjuda_yut_internal.members set departed = true where room_no = r.room_no and user_id = actor; end if;
    return jsonb_build_object('ok', true);
  end if;
  if r.status = 'closed' or r.expires_at <= clock_timestamp() then raise exception 'room_unavailable'; end if;
  if exists(select 1 from ojjuda_yut_internal.members m where m.room_no = r.room_no and not m.departed
    and (public.blocked_between(actor,m.user_id) or public.is_banned(m.user_id))) then raise exception 'room_unavailable'; end if;
  if r.status = 'waiting' then
    delete from ojjuda_yut_internal.members where room_no = r.room_no and user_id <> r.host_id and expires_at <= clock_timestamp();
    select * into member from ojjuda_yut_internal.members where room_no = r.room_no and user_id = actor;
  else
    -- A disconnected human cannot hold the remaining players' turns forever.
    -- Keep its frozen seat; the signed host converts departed seats to computers.
    update ojjuda_yut_internal.members set departed = true where room_no = r.room_no
      and user_id <> r.host_id and not departed and expires_at <= clock_timestamp();
    select * into member from ojjuda_yut_internal.members where room_no = r.room_no and user_id = actor;
  end if;
  if p_action = 'join' then
    if member.user_id is not null then
      if member.departed then raise exception 'room_unavailable'; end if;
      -- A live signing identity is never silently replaced by another browser.
      if member.key <> key_value then raise exception 'room_identity_mismatch'; end if;
    else
      if r.status <> 'waiting' then raise exception 'room_already_started'; end if;
      if exists(select 1 from ojjuda_yut_internal.rooms a join ojjuda_yut_internal.members m using(room_no)
        where m.user_id = actor and not m.departed and a.status <> 'closed' and a.expires_at > clock_timestamp()
          and (a.status = 'playing' or m.expires_at > clock_timestamp())) then raise exception 'room_in_progress'; end if;
      if (select count(*) from ojjuda_yut_internal.members where room_no = r.room_no) >= r.capacity then raise exception 'room_full'; end if;
      insert into ojjuda_yut_internal.members(room_no,user_id,key,name) values(r.room_no,actor,key_value,nick);
    end if;
  elsif member.user_id is null or member.departed then raise exception 'not_room_member'; end if;
  if p_action = 'start' then
    if actor <> r.host_id then raise exception 'not_room_owner'; end if;
    select jsonb_agg(key order by case when user_id = r.host_id then 0 else 1 end,joined_at,user_id), count(*) into room_keys,present_count from ojjuda_yut_internal.members where room_no = r.room_no;
    if p_options->'keys' is distinct from room_keys then raise exception 'state_conflict'; end if;
    if coalesce((p_options->>'fill_bots')::boolean,false) = false and present_count < r.capacity then raise exception 'need_players'; end if;
    update ojjuda_yut_internal.rooms set status = 'playing' where room_no = r.room_no returning * into r;
  end if;
  update ojjuda_yut_internal.members set expires_at = clock_timestamp() + interval '90 seconds' where room_no = r.room_no and user_id = actor;
  if actor = r.host_id then
    update ojjuda_yut_internal.rooms set expires_at = clock_timestamp() + interval '90 seconds' where room_no = r.room_no returning * into r;
  end if;
  return jsonb_build_object('ok', true, 'room', ojjuda_yut_internal.room_view(r, actor));
end;
$$;

revoke all on all functions in schema ojjuda_yut_internal from public, anon, authenticated;
grant execute on function ojjuda_yut_internal.directory() to authenticated;
grant execute on function ojjuda_yut_internal.room_service(text,bigint,jsonb) to authenticated;
create function public.yut_room_service(p_action text, p_room bigint default null, p_options jsonb default '{}')
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select ojjuda_yut_internal.room_service(p_action,p_room,p_options);
$$;
revoke all on function public.yut_room_service(text,bigint,jsonb) from public, anon;
grant execute on function public.yut_room_service(text,bigint,jsonb) to authenticated;

create or replace function public.arcade_general_extra_rooms()
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select jsonb_build_object('ok', true, 'rooms',
    coalesce(ojjuda_poker_internal.arcade_rooms()->'rooms', '[]'::jsonb)
    || coalesce(ojjuda_bang_internal.arcade_rooms()->'rooms', '[]'::jsonb)
    || coalesce(ojjuda_roulette_internal.arcade_rooms()->'rooms', '[]'::jsonb)
    || coalesce(ojjuda_arcade_internal.onecard_rooms()->'rooms', '[]'::jsonb)
    || coalesce(ojjuda_yut_internal.directory()->'rooms', '[]'::jsonb));
$$;
revoke all on function public.arcade_general_extra_rooms() from public, anon;
grant execute on function public.arcade_general_extra_rooms() to authenticated;
notify pgrst, 'reload schema';
