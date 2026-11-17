-- Count raw game keys before normalizing names. The public response, rolling
-- window and anonymous/member access match the original popularity endpoint.
create or replace function ojjuda_popularity_internal.popularity()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  since_at timestamptz := now() - interval '30 days';
  until_at timestamptz := now();
  aggregate_result jsonb;
begin
  if actor is not null and not exists (select 1 from public.profiles where id = actor) then
    return jsonb_build_object('generated_at', until_at, 'games', '[]'::jsonb);
  end if;

  with counts(game, plays) as (
    select game, count(*) from public.game_scores
    where created_at between since_at and until_at group by game
    union all
    select game, count(*) from ojjuda_popularity_internal.guest_plays
    where played_at between since_at and until_at group by game
    union all
    select game, count(*) from ojjuda_guest_internal.round_records
    where achieved_at between since_at and until_at and source <> 'recovered' group by game
    union all
    select 'bang', count(*) from ojjuda_bang_internal.results
    where achieved_at between since_at and until_at
    union all
    select game, count(*) from ojjuda_game_internal.practice_results
    where created_at between since_at and until_at group by game
    union all
    select kind, sum(case when p2 is not null and p2 <> p1 then 2 else 1 end)
    from public.board_games
    where status = 'done' and result in ('p1','p2','draw')
      and updated_at between since_at and until_at group by kind
    union all
    select 'spot', count(*) from ojjuda_guest_internal.spot_clears
    where achieved_at between since_at and until_at
    union all
    select 'photo_ttang', count(*) from ojjuda_photo_internal.game_clears
    where cleared_at between since_at and until_at
  ), normalized as materialized (
    select case
      when game in ('carom4','carom3','pool8') then 'billiards'
      when game in ('screw_box','screw_flat') then 'screw'
      when game ~ '^sacheonseong_[0-9]+$' then 'sacheonseong'
      else game end as game, plays
    from counts where plays > 0
  ), totals as (
    select game, sum(plays)::bigint as plays from normalized
    where game in ('mole','runner','stacker','breakout','screw','spot','photo_ttang',
      'saetbyeol','mines','sacheonseong','bang','tank','tour','ttang','janggi',
      'chess','billiards','matgo','poker') group by game
  )
  select jsonb_build_object('generated_at', until_at, 'window_started_at', since_at,
    'games', coalesce(jsonb_agg(jsonb_build_object('game',game,'plays',plays) order by game), '[]'::jsonb))
  into aggregate_result from totals;
  return aggregate_result;
end;
$$;
