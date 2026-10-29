-- Public aggregate only: no nicknames, account IDs, wallet values or raw records.
create schema ojjuda_popularity_internal;
revoke all on schema ojjuda_popularity_internal from public;
grant usage on schema ojjuda_popularity_internal to anon,authenticated;

-- Guest rankings keep only a daily best. Remember each accepted submission from
-- now on, without duplicating retries or exposing the guest's browser token.
create table ojjuda_popularity_internal.guest_plays (
 game text not null,
 request_id uuid not null,
 played_at timestamptz not null,
 primary key(game,request_id)
);
alter table ojjuda_popularity_internal.guest_plays enable row level security;
revoke all on ojjuda_popularity_internal.guest_plays from public,anon,authenticated,service_role;
create index guest_plays_period on ojjuda_popularity_internal.guest_plays(played_at,game);
insert into ojjuda_popularity_internal.guest_plays(game,request_id,played_at)
 select game,last_request_id,last_submitted_at from ojjuda_guest_internal.scores
 where last_submitted_at>=now()-interval '30 days' on conflict do nothing;

create function ojjuda_popularity_internal.remember_guest_play()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.last_request_id is distinct from old.last_request_id then
  insert into ojjuda_popularity_internal.guest_plays(game,request_id,played_at)
   values(new.game,new.last_request_id,new.last_submitted_at) on conflict do nothing;
 end if;
 return new;
end;$$;
revoke all on function ojjuda_popularity_internal.remember_guest_play() from public,anon,authenticated;
create trigger remember_arcade_guest_play after insert or update on ojjuda_guest_internal.scores
 for each row execute function ojjuda_popularity_internal.remember_guest_play();

create function ojjuda_popularity_internal.popularity()
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
 ), normalized as (
  select case when game in ('carom4','carom3','pool8') then 'billiards'
   when game in ('screw_box','screw_flat') then 'screw'
   when game ~ '^sacheonseong_[0-9]+$' then 'sacheonseong' else game end game,amount from plays
 ), totals as (
  select game,sum(amount)::bigint plays from normalized
   where game in ('mole','runner','stacker','breakout','screw','spot','saetbyeol','mines','sacheonseong','bang','tank','tour','ttang','janggi','chess','billiards','matgo','poker') group by game
 ) select jsonb_build_object('generated_at',now(),'window_started_at',now()-interval '30 days',
  'games',coalesce(jsonb_agg(jsonb_build_object('game',game,'plays',plays) order by game),'[]'::jsonb)) into aggregate_result from totals;
 return aggregate_result;
end;$$;
revoke all on function ojjuda_popularity_internal.popularity() from public;
grant execute on function ojjuda_popularity_internal.popularity() to anon,authenticated;
create function public.arcade_popularity() returns jsonb language sql stable security invoker set search_path='' as $$
 select ojjuda_popularity_internal.popularity();
$$;
revoke all on function public.arcade_popularity() from public;
grant execute on function public.arcade_popularity() to anon,authenticated;
comment on function public.arcade_popularity() is 'Last 30 days of saved play records, aggregated by arcade card. Known historical guest submissions plus every accepted new submission; no player data.';
