-- Ojjuda arcade market: read-only historical activity index.
-- Each listed game opens at 1000G on its first saved play in Asia/Seoul.
-- Only stored, per-game play events are used: no inferred logins or play time.
-- Players contribute up to three saved events per game per day to momentum.
-- Days without a saved event keep their last price (no evidence of a change).
-- This is a provisional activity index, not a money balance or a trade ledger.
-- The public API reads a single RLS-protected aggregate snapshot. Only a
-- private server function can inspect source ledgers and refresh the snapshot.

create table if not exists public.arcade_stock_snapshot (
  singleton boolean primary key default true check (singleton),
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);
alter table public.arcade_stock_snapshot enable row level security;
revoke all on public.arcade_stock_snapshot from public, anon, authenticated;
grant select on public.arcade_stock_snapshot to anon, authenticated;
create policy "Public aggregated arcade stock prices"
  on public.arcade_stock_snapshot for select to anon, authenticated
  using (singleton is true);

create schema if not exists ojjuda_market_internal;
revoke all on schema ojjuda_market_internal from public, anon, authenticated;

create or replace function ojjuda_market_internal.refresh_stock_history()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare snapshot jsonb;
begin
with raw as (
  select case
      when game like 'sacheonseong_%' then 'sacheonseong'
      when game in ('screw_box', 'screw_flat') then 'screw'
      else game end as game,
    created_at as occurred_at, 'u:' || user_id::text as actor
  from public.game_scores
  where user_id is not null

  union all
  select case
      when game like 'sacheonseong_%' then 'sacheonseong'
      when game in ('screw_box', 'screw_flat') then 'screw'
      else game end,
    achieved_at,
    coalesce('u:' || user_id::text, 'g:' || guest_hash, 'a:' || actor_key)
  from ojjuda_guest_internal.round_records

  union all
  select case
      when game like 'sacheonseong_%' then 'sacheonseong'
      when game in ('screw_box', 'screw_flat') then 'screw'
      else game end,
    achieved_at, 'g:' || guest_hash
  from ojjuda_guest_internal.scores

  union all
  select case
      when game in ('carom3', 'carom4', 'pool8') then 'billiards'
      else game end,
    created_at, 'u:' || user_id::text
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

  -- Older tank winners predate the per-round record ledger. Once that ledger
  -- starts, use it alone so the same round cannot be counted twice.
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
  select game, (occurred_at at time zone 'Asia/Seoul')::date as game_day,
    actor, count(*)::integer as saved_events
  from raw
  where occurred_at is not null and actor is not null and game <> 'snake'
  group by game, (occurred_at at time zone 'Asia/Seoul')::date, actor
), daily as (
  select game, game_day, count(*)::integer as players,
    sum(saved_events)::integer as records,
    sum(least(saved_events, 3))::integer as counted_plays
  from daily_actor
  group by game, game_day
), reference as (
  select *,
    avg(players) over (partition by game order by game_day rows between 7 preceding and 1 preceding) as previous_players,
    avg(counted_plays) over (partition by game order by game_day rows between 7 preceding and 1 preceding) as previous_plays
  from daily
), movement as (
  select *, case when previous_players is null then 0::double precision else
    greatest(-0.10, least(0.10,
      0.12 * (
        0.65 * ln((players + 2.0) / (previous_players + 2.0)) +
        0.35 * ln((counted_plays + 3.0) / (previous_plays + 3.0))
      ) * ((players + previous_players) / (players + previous_players + 8.0))
    )) end as day_return
  from reference
), priced as (
  select *,
    round(1000 * exp(sum(ln(1.0 + day_return)) over
      (partition by game order by game_day)))::integer as price_g
  from movement
), summary as (
  select game, min(game_day) as listed_at, max(game_day) as last_record_at,
    count(*)::integer as recorded_days, sum(records)::integer as saved_records,
    sum(counted_plays)::integer as counted_plays,
    (array_agg(price_g order by game_day desc))[1] as current_price_g
  from priced
  group by game
)
select jsonb_build_object(
  'asOf', (now() at time zone 'Asia/Seoul')::date,
  'method', 'record-activity-v1',
  'games', coalesce(jsonb_agg(jsonb_build_object(
    'id', s.game,
    'listedAt', s.listed_at,
    'lastRecordAt', s.last_record_at,
    'recordedDays', s.recorded_days,
    'savedRecords', s.saved_records,
    'countedPlays', s.counted_plays,
    'priceG', s.current_price_g,
    'changePct', round((s.current_price_g / 1000.0 - 1) * 100, 2),
    'history', (
      select jsonb_agg(jsonb_build_object(
        'date', p.game_day, 'priceG', p.price_g,
        'players', p.players, 'savedRecords', p.records,
        'countedPlays', p.counted_plays
      ) order by p.game_day)
      from priced p where p.game = s.game
    )
  ) order by s.listed_at, s.game), '[]'::jsonb)
)
into snapshot
from summary s;

insert into public.arcade_stock_snapshot(singleton, payload, refreshed_at)
values (true, snapshot, now())
on conflict (singleton) do update
  set payload = excluded.payload, refreshed_at = excluded.refreshed_at;
end;
$function$;

revoke all on function ojjuda_market_internal.refresh_stock_history()
  from public, anon, authenticated;

-- The browser reads only the snapshot, under the ordinary table RLS policy.
create or replace function public.community_game_stock_history()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select payload from public.arcade_stock_snapshot where singleton is true;
$function$;
revoke all on function public.community_game_stock_history() from public;
grant execute on function public.community_game_stock_history() to anon, authenticated;

select ojjuda_market_internal.refresh_stock_history();
select cron.schedule(
  'ojjuda-arcade-stock-hourly',
  '5 * * * *',
  'select ojjuda_market_internal.refresh_stock_history()'
);
