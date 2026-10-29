-- Include saved clears for the adult-only solo game in the same aggregate.
create or replace function ojjuda_popularity_internal.popularity()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); aggregate_result jsonb;
begin
 -- Anonymous visitors may read the same aggregate; an invalid member cannot.
 if actor is not null and not exists(select 1 from public.profiles where id=actor) then
  return jsonb_build_object('generated_at',now(),'games','[]'::jsonb);
 end if;
 with plays as (
  select game,created_at played_at,1::bigint amount from public.game_scores
   where created_at>=now()-interval '30 days' and created_at<=now()
  union all
  select game,played_at,1 from ojjuda_popularity_internal.guest_plays
   where played_at>=now()-interval '30 days' and played_at<=now()
  union all
  select game,achieved_at,1 from ojjuda_guest_internal.round_records
   where achieved_at>=now()-interval '30 days' and achieved_at<=now() and source<>'recovered'
  union all
  select 'bang',achieved_at,1 from ojjuda_bang_internal.results
   where achieved_at>=now()-interval '30 days' and achieved_at<=now()
  union all
  select game,created_at,1 from ojjuda_game_internal.practice_results
   where created_at>=now()-interval '30 days' and created_at<=now()
  union all
  select kind,updated_at,case when p2 is not null and p2<>p1 then 2 else 1 end from public.board_games
   where status='done' and result in ('p1','p2','draw') and updated_at>=now()-interval '30 days' and updated_at<=now()
  union all
  select 'spot',achieved_at,1 from ojjuda_guest_internal.spot_clears
   where achieved_at>=now()-interval '30 days' and achieved_at<=now()
  union all
  select 'photo_ttang',cleared_at,1 from ojjuda_photo_internal.game_clears
   where cleared_at>=now()-interval '30 days' and cleared_at<=now()
 ), normalized as (
  select case when game in ('carom4','carom3','pool8') then 'billiards'
   when game in ('screw_box','screw_flat') then 'screw'
   when game ~ '^sacheonseong_[0-9]+$' then 'sacheonseong' else game end game,amount from plays
 ), totals as (
  select game,sum(amount)::bigint plays from normalized
   where game in ('mole','runner','stacker','breakout','screw','spot','photo_ttang','saetbyeol','mines','sacheonseong','bang','tank','tour','ttang','janggi','chess','billiards','matgo','poker') group by game
 ) select jsonb_build_object('generated_at',now(),'window_started_at',now()-interval '30 days',
  'games',coalesce(jsonb_agg(jsonb_build_object('game',game,'plays',plays) order by game),'[]'::jsonb)) into aggregate_result from totals;
 return aggregate_result;
end;$$;
