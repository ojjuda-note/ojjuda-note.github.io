-- Balanced market: visits 40%, actual play time 30%, distinct visitors 15%,
-- saved records 10%, verified game improvements 5%. No player daily cap. Historic days
-- without tracked sessions retain a transparent saved-activity fallback.
-- Game time comes only from server-timed heartbeats, never client seconds.

create table if not exists ojjuda_market_internal.stock_game_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  started_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  active_seconds bigint not null default 0 check (active_seconds >= 0),
  ended_at timestamptz,
  check (last_seen_at >= started_at)
);
create index if not exists stock_sessions_game_day_idx
  on ojjuda_market_internal.stock_game_sessions(game, started_at);
create unique index if not exists stock_one_active_game_session_idx
  on ojjuda_market_internal.stock_game_sessions(user_id,game)
  where ended_at is null;
alter table ojjuda_market_internal.stock_game_sessions enable row level security;
revoke all on ojjuda_market_internal.stock_game_sessions from public,anon,authenticated;
grant usage on schema ojjuda_market_internal to authenticated;

-- Only operators can register an actually deployed semantic-version change.
-- Untracked historic edits are not guessed, and browser clients cannot add them.
create table if not exists ojjuda_market_internal.stock_game_releases (
  game text not null check (game ~ '^[a-z0-9_]{2,40}$'),
  version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  kind text not null check (kind in ('fix','improvement','major')),
  commit_sha text not null check (commit_sha ~ '^[a-f0-9]{40}$'),
  released_at timestamptz not null,
  primary key(game,version)
);
create table if not exists ojjuda_market_internal.stock_delistings (
  game text primary key,
  delisted_on date not null,
  exit_price_g integer not null default 100 check (exit_price_g = 100),
  removal_status text not null default 'needs_review'
    check (removal_status in ('needs_review','removed'))
);
alter table ojjuda_market_internal.stock_game_releases enable row level security;
alter table ojjuda_market_internal.stock_delistings enable row level security;
revoke all on ojjuda_market_internal.stock_game_releases,
  ojjuda_market_internal.stock_delistings from public,anon,authenticated;

create or replace function ojjuda_market_internal.stock_presence(
  p_action text, p_game text, p_session uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  current_time timestamptz := clock_timestamp();
  row_found ojjuda_market_internal.stock_game_sessions%rowtype;
  elapsed bigint;
begin
  if actor is null then raise exception 'login_required'; end if;
  if p_session is null or p_game is null or p_game !~ '^[a-z0-9_]{2,40}$'
    or p_action is null or p_action not in ('start','tick','stop')
  then raise exception 'invalid_session'; end if;
  if not exists (
    select 1 from public.arcade_stock_snapshot s,
      jsonb_array_elements(s.payload->'games') g
    where s.singleton is true and g->>'id' = p_game
  ) then raise exception 'stock_unavailable'; end if;

  if p_action = 'start' then
    select * into row_found from ojjuda_market_internal.stock_game_sessions
      where session_id = p_session and user_id = actor and game = p_game;
    if found then return jsonb_build_object('ok',true,'repeated',true); end if;
    update ojjuda_market_internal.stock_game_sessions
      set ended_at = current_time
      where user_id = actor and game = p_game and ended_at is null;
    insert into ojjuda_market_internal.stock_game_sessions
      (session_id,user_id,game,started_at,last_seen_at)
      values (p_session,actor,p_game,current_time,current_time);
    return jsonb_build_object('ok',true,'repeated',false);
  end if;

  select * into row_found from ojjuda_market_internal.stock_game_sessions
    where session_id = p_session and user_id = actor and game = p_game
    for update;
  if not found then return jsonb_build_object('ok',false,'reason','session_not_found'); end if;
  if row_found.ended_at is not null then
    return jsonb_build_object('ok',true,'activeSeconds',row_found.active_seconds);
  end if;
  -- One heartbeat can count at most 45 elapsed server seconds. More calls
  -- can count more real time, with no per-user daily or session cap.
  elapsed := greatest(0, least(45,
    floor(extract(epoch from current_time - row_found.last_seen_at))::bigint));
  update ojjuda_market_internal.stock_game_sessions
    set active_seconds = active_seconds + elapsed,
      last_seen_at = current_time,
      ended_at = case when p_action = 'stop' then current_time else null end
    where session_id = p_session;
  return jsonb_build_object('ok',true,'activeSeconds',row_found.active_seconds + elapsed);
end;
$function$;
revoke all on function ojjuda_market_internal.stock_presence(text,text,uuid)
  from public,anon,authenticated;
grant execute on function ojjuda_market_internal.stock_presence(text,text,uuid)
  to authenticated;

create or replace function public.community_game_stock_presence(
  p_action text, p_game text, p_session uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $function$ select ojjuda_market_internal.stock_presence(p_action,p_game,p_session); $function$;
revoke all on function public.community_game_stock_presence(text,text,uuid)
  from public,anon;
grant execute on function public.community_game_stock_presence(text,text,uuid)
  to authenticated;

create or replace function ojjuda_market_internal.refresh_stock_history()
returns void
language plpgsql volatile security definer set search_path = ''
as $function$
declare snapshot jsonb;
begin
with raw as (
  select case
      when game like 'sacheonseong_%' then 'sacheonseong'
      when game in ('screw_box', 'screw_flat') then 'screw'
      else game end as game,
    created_at as occurred_at, 'u:' || user_id::text as actor
  from public.game_scores where user_id is not null
  union all
  select case
      when game like 'sacheonseong_%' then 'sacheonseong'
      when game in ('screw_box', 'screw_flat') then 'screw'
      else game end,
    achieved_at, coalesce('u:' || user_id::text, 'g:' || guest_hash, 'a:' || actor_key)
  from ojjuda_guest_internal.round_records
  union all
  select case
      when game like 'sacheonseong_%' then 'sacheonseong'
      when game in ('screw_box', 'screw_flat') then 'screw'
      else game end,
    achieved_at, 'g:' || guest_hash
  from ojjuda_guest_internal.scores
  union all
  select case when game in ('carom3','carom4','pool8') then 'billiards'
      else game end, created_at, 'u:' || user_id::text
  from ojjuda_game_internal.practice_results
  union all
  select game, achieved_at,
    coalesce('u:' || user_id::text, 'g:' || guest_hash, 'a:' || actor_key)
  from ojjuda_ranking_internal.picture_clears
  union all
  select 'archery', started_at, 'u:' || user_id::text
  from ojjuda_archery_internal.runs
  union all
  select 'bang', achieved_at, 'u:' || user_id::text
  from ojjuda_bang_internal.results
  union all
  select 'tank', finished_at, 'u:' || user_id::text
  from ojjuda_tank_internal.wins
  where finished_at < coalesce(
    (select min(achieved_at) from ojjuda_guest_internal.round_records where game = 'tank'),
    'infinity'::timestamptz)
  union all
  select 'roulette', settled_at, 'u:' || user_id::text
  from ojjuda_roulette_internal.entries
), daily_actor as (
  select game, (occurred_at at time zone 'Asia/Seoul')::date game_day,
    actor, count(*)::integer saved_events
  from raw
  where occurred_at is not null and actor is not null and game <> 'snake'
  group by game, (occurred_at at time zone 'Asia/Seoul')::date, actor
), daily_records as (
  select game,game_day,count(*)::integer players,sum(saved_events)::integer records
  from daily_actor group by game,game_day
), daily_sessions as (
  select game,(started_at at time zone 'Asia/Seoul')::date game_day,
    count(*)::integer visits,count(distinct user_id)::integer visitors,
    sum(active_seconds)::bigint seconds
  from ojjuda_market_internal.stock_game_sessions
  where active_seconds >= 10
  group by game,(started_at at time zone 'Asia/Seoul')::date
), daily_releases as (
  select game,(released_at at time zone 'Asia/Seoul')::date game_day,
    count(*)::integer updates,
    sum(case kind when 'fix' then 0.25 when 'improvement' then 1.0 else 1.5 end)::double precision points
  from ojjuda_market_internal.stock_game_releases
  group by game,(released_at at time zone 'Asia/Seoul')::date
), daily as (
  select coalesce(r.game,s.game,u.game) game,
    coalesce(r.game_day,s.game_day,u.game_day) game_day,
    coalesce(r.players,0) players,coalesce(r.records,0) records,
    coalesce(s.visits,0) visits,coalesce(s.visitors,0) visitors,
    coalesce(s.seconds,0) seconds,coalesce(u.updates,0) updates,
    coalesce(u.points,0) release_points
  from daily_records r full outer join daily_sessions s
    on r.game=s.game and r.game_day=s.game_day
  full outer join daily_releases u on
    u.game=coalesce(r.game,s.game) and u.game_day=coalesce(r.game_day,s.game_day)
), reference as (
  select *,
    avg(nullif(players,0)) over w previous_players,
    avg(nullif(records,0)) over w previous_records,
    avg(nullif(visits,0)) over w previous_visits,
    avg(nullif(visitors,0)) over w previous_visitors,
    avg(nullif(seconds,0)) over w previous_seconds
  from daily
  window w as (partition by game order by game_day rows between 7 preceding and 1 preceding)
), movement as (
  select *,
    (visits > 0 and previous_visits is not null and seconds > 0
      and previous_seconds is not null) as timed,
    case when previous_players is null and previous_visits is null then 0::double precision
    else greatest(-0.10,least(0.10,0.12 * (
      case when visits > 0 and previous_visits is not null and seconds > 0
          and previous_seconds is not null
      then
        0.40 * ln((visits + 2.0)/(previous_visits + 2.0)) +
        0.30 * ln((seconds / 60.0 + 10.0)/(previous_seconds / 60.0 + 10.0)) +
        0.15 * ln((visitors + 2.0)/(previous_visitors + 2.0)) +
        0.10 * ln((records + 2.0)/(coalesce(previous_records,records) + 2.0)) +
        0.05 * ln(1.0 + release_points)
      else
        -- No invented historic playtime: full saved events and distinct
        -- participants are the older records-only activity proxy.
        0.62 * ln((records + 2.0)/(coalesce(previous_records,records) + 2.0)) +
        0.33 * ln((players + 2.0)/(coalesce(previous_players,players) + 2.0)) +
        0.05 * ln(1.0 + release_points)
      end
    ) * (
      case when visits > 0 and previous_visits is not null and seconds > 0
          and previous_seconds is not null
      then (visitors + previous_visitors + case when updates>0 then 2 else 0 end)/
           (visitors + previous_visitors + case when updates>0 then 2 else 0 end + 8.0)
      else (players + coalesce(previous_players,0) + case when updates>0 then 2 else 0 end)/
           (players + coalesce(previous_players,0) + case when updates>0 then 2 else 0 end + 8.0)
      end
    ))) end as day_return
  from reference
), priced as (
  select *,greatest(1,round(1000 * exp(sum(ln(1.0 + day_return)) over
    (partition by game order by game_day)))::integer) price_g
  from movement
), summary as (
  select game,min(game_day) listed_at,max(game_day) last_record_at,
    count(*)::integer recorded_days,sum(records)::integer saved_records,
    sum(visits)::integer visits,round(sum(seconds)/60.0)::integer play_minutes,
    (array_agg(price_g order by game_day desc))[1] current_price_g
  from priced group by game
)
select jsonb_build_object(
  'asOf',(now() at time zone 'Asia/Seoul')::date,
  'method','balanced-v3',
  'weights',jsonb_build_object('visits',40,'time',30,'uniqueVisitors',15,'records',10,'updates',5,'perPersonCap',false),
  'games',coalesce(jsonb_agg(jsonb_build_object(
    'id',s.game,'listedAt',s.listed_at,'lastRecordAt',s.last_record_at,
    'recordedDays',s.recorded_days,'savedRecords',s.saved_records,
    'visits',s.visits,'playMinutes',s.play_minutes,
    'updates',(select count(*) from ojjuda_market_internal.stock_game_releases where game=s.game),
    'uniqueVisitors',(
      select count(distinct user_id) from ojjuda_market_internal.stock_game_sessions
      where game=s.game and active_seconds >= 10
    ),
    'status',case when d.game is not null or s.current_price_g <= 100 then 'delisted' else 'active' end,
    'priceG',case when d.game is not null or s.current_price_g <= 100 then 100 else s.current_price_g end,
    'changePct',round(((case when d.game is not null or s.current_price_g <= 100
       then 100 else s.current_price_g end)/1000.0-1)*100,2),
    'history',(
      select jsonb_agg(jsonb_build_object(
        'date',p.game_day,
        'priceG',case when (d.game is not null and p.game_day>=d.delisted_on)
          or (d.game is null and s.current_price_g<=100 and p.game_day=s.last_record_at)
          then 100 else p.price_g end,
        'players',p.players,'savedRecords',p.records,
        'visits',p.visits,'visitors',p.visitors,'playMinutes',round(p.seconds/60.0),
        'countedPlays',p.records,'updates',p.updates,'timed',p.timed
      ) order by p.game_day) from priced p where p.game=s.game
    )
  ) order by s.listed_at,s.game),'[]'::jsonb)
) into snapshot
from summary s left join ojjuda_market_internal.stock_delistings d on d.game=s.game;

-- Delisting persists even if a game's later raw activity rises again.
insert into ojjuda_market_internal.stock_delistings(game,delisted_on)
  select g->>'id',(now() at time zone 'Asia/Seoul')::date
  from jsonb_array_elements(snapshot->'games') g
  where g->>'status' = 'delisted'
on conflict (game) do nothing;

insert into public.arcade_stock_snapshot(singleton,payload,refreshed_at)
values(true,snapshot,now())
on conflict(singleton) do update
  set payload=excluded.payload,refreshed_at=excluded.refreshed_at;
end;
$function$;

revoke all on function ojjuda_market_internal.refresh_stock_history()
  from public,anon,authenticated;
select ojjuda_market_internal.refresh_stock_history();
