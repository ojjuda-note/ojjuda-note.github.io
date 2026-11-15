-- Old clients submit "hard" for all four upper Janggi levels. Leave that
-- ledger untouched; updated clients use hard_exact for a confirmed hard game.
begin;
set local lock_timeout='5s';

alter table ojjuda_game_internal.practice_results
 drop constraint practice_results_difficulty_check,
 add constraint practice_results_difficulty_check check (
  difficulty in ('easy','normal','hard') or
  (game='janggi' and difficulty in ('hard_exact','pro','master','grandmaster'))
 );

create function ojjuda_game_internal.janggi_streaks_since(p_start timestamptz,p_actor uuid)
returns table(user_id uuid,difficulty text,current_streak bigint,best_streak bigint)
language sql stable security invoker set search_path='' as $$
 with ordered as (
  select r.user_id,r.difficulty,r.outcome,
   count(*) filter(where r.outcome<>'win') over(partition by r.user_id,r.difficulty
    order by r.created_at,r.round_id rows unbounded preceding) as run
  from ojjuda_game_internal.practice_results r
  where r.game='janggi' and r.created_at>=p_start and (p_actor is null or r.user_id=p_actor)
 ), runs as (
  select o.user_id,o.difficulty,o.run,count(*) filter(where o.outcome='win') as wins
  from ordered o group by o.user_id,o.difficulty,o.run
 )
 select distinct on (r.user_id,r.difficulty) r.user_id,r.difficulty,r.wins,
  max(r.wins) over(partition by r.user_id,r.difficulty)
 from runs r order by r.user_id,r.difficulty,r.run desc;
$$;
revoke all on function ojjuda_game_internal.janggi_streaks_since(timestamptz,uuid) from public,anon,authenticated;

create function ojjuda_game_internal.janggi_streak_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) then
  raise exception 'not_signed_in' using errcode='42501';
 end if;
 if public.is_banned(actor) then raise exception 'banned' using errcode='42501'; end if;
 with mine as (
  select * from ojjuda_game_internal.janggi_streaks_since('-infinity',actor)
 ), monthly as (
  select r.difficulty,max(r.best_streak) as best
  from ojjuda_game_internal.janggi_streaks_since(
   ojjuda_ranking_internal.month_start(ojjuda_ranking_internal.month_key(now())),null) r
  where not exists(select 1 from public.user_private u where u.user_id=r.user_id and u.banned_until>now())
  group by r.difficulty
 )
 select jsonb_object_agg(l.difficulty,jsonb_build_object(
  'current',m.current_streak,'best',m.best_streak,'monthly_best',a.best))
 into result from (values ('easy'),('normal'),('hard_exact'),('pro'),('master'),('grandmaster'),('hard')) l(difficulty)
 left join mine m using(difficulty) left join monthly a using(difficulty);
 return result;
end;
$$;
revoke all on function ojjuda_game_internal.janggi_streak_summary() from public,anon;
grant execute on function ojjuda_game_internal.janggi_streak_summary() to authenticated;
create function public.janggi_streak_summary() returns jsonb
language sql stable security invoker set search_path='' as $$
 select ojjuda_game_internal.janggi_streak_summary();
$$;
revoke all on function public.janggi_streak_summary() from public,anon;
grant execute on function public.janggi_streak_summary() to authenticated;

create or replace function ojjuda_game_internal.record_practice_game_result(p_game text,p_round uuid,p_outcome text,p_difficulty text)
returns json language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing ojjuda_game_internal.practice_results%rowtype;
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor) then
    raise exception 'not_signed_in' using errcode='42501';
  end if;
  if public.is_banned(actor) then raise exception 'banned' using errcode='42501'; end if;
  if p_difficulty is null or not (p_difficulty in ('easy','normal','hard') or
      (p_game='janggi' and p_difficulty in ('hard_exact','pro','master','grandmaster'))) then raise exception 'invalid_difficulty'; end if;
  if p_round is null or p_game is null or p_game not in ('carom4','carom3','pool8','chess','janggi')
    or p_outcome is null or p_outcome not in ('win','loss','draw') then raise exception 'invalid_result'; end if;
  if exists(select 1 from public.board_games where id=p_round) then raise exception 'online_result_is_server_owned'; end if;
  insert into ojjuda_game_internal.practice_results(user_id,round_id,game,outcome,difficulty)
    values(actor,p_round,p_game,p_outcome,p_difficulty) on conflict(user_id,round_id) do nothing;
  select * into existing from ojjuda_game_internal.practice_results where user_id=actor and round_id=p_round;
  if existing.game<>p_game or existing.outcome<>p_outcome or existing.difficulty<>p_difficulty then raise exception 'result_already_recorded'; end if;
  if p_game='janggi' then
    return (select json_build_object('ok',true,'streak',json_build_object('current',s.current_streak,'best',s.best_streak))
      from ojjuda_game_internal.janggi_streaks_since('-infinity',actor) s where s.difficulty=p_difficulty);
  end if;
  return json_build_object('ok',true);
end;
$$;

create or replace function ojjuda_ranking_internal.board_participants(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,difficulty text,priority integer,variant text,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with finished as (
  select g.* from public.board_games g where
   (g.kind=p_game or (p_game in('billiards','carom4','carom3','pool8') and g.kind in('carom4','carom3','pool8')))
   and g.status='done' and g.result in('p1','p2','draw')
   and g.updated_at>=p_start and g.updated_at<=p_end
 ), events as materialized (
  -- Takeover seats remain excluded before any win/loss segmentation.
  select p1 user_id,id round_id,kind variant,'online'::text difficulty,updated_at finished_at,
   case when result='p1' then 'win' when result='draw' then 'draw' else 'loss' end outcome
   from finished where not rank_excluded @> array['p1']
  union all
  select p2,id,kind,'online',updated_at,case when result='p2' then 'win' when result='draw' then 'draw' else 'loss' end
   from finished where p2 is not null and p2<>p1 and not rank_excluded @> array['p2']
  union all
  select r.user_id,r.round_id,r.game,r.difficulty,r.created_at,r.outcome from ojjuda_game_internal.practice_results r
   where (r.game=p_game or (p_game in('billiards','carom4','carom3','pool8') and r.game in('carom4','carom3','pool8')))
    and r.created_at>=p_start and r.created_at<=p_end
 ), ordered as (
  select e.*,count(*) filter(where e.outcome<>'win') over(partition by e.user_id,case when p_game='janggi' then e.difficulty end
   order by e.finished_at,e.round_id rows unbounded preceding) run from events e
 ), runs as (
  select e.user_id,e.variant,e.difficulty,e.run,count(*) filter(where e.outcome='win') score,
   max(e.finished_at) filter(where e.outcome='win') achieved_at,
   case e.difficulty when 'online' then case when p_game='janggi' then 7 else 4 end
    when 'grandmaster' then 6 when 'master' then 5 when 'pro' then 4
    when 'hard_exact' then 3 when 'hard' then 3 when 'normal' then 2 else 1 end priority
  from ordered e group by e.user_id,e.variant,e.difficulty,e.run
 ), best as materialized (
  -- Preserve separate condition counts, their priority and the first best time.
  select distinct on(r.user_id) r.user_id,r.score,r.difficulty,r.priority,r.variant,r.achieved_at
  from runs r where r.score>0 and (p_game='billiards' or r.variant=p_game)
  order by r.user_id,r.priority desc,r.score desc,r.achieved_at,r.variant
 )
 select b.user_id,b.score,b.difficulty,b.priority,b.variant,b.achieved_at from best b;
$$;

create or replace function ojjuda_guest_internal.streak_candidates(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,difficulty text,priority integer,variant text,achieved_at timestamptz)
language sql stable set search_path='' as $$
 with finished as (
  select g.* from public.board_games g where
   (g.kind=p_game or (p_game='billiards' and g.kind in('carom4','carom3','pool8')))
   and g.status='done' and g.result in('p1','p2','draw')
   and g.updated_at>=p_start and g.updated_at<=p_end
 ), events as (
  select p1 user_id,id round_id,kind variant,'online'::text difficulty,updated_at finished_at,
   case when result='p1' then 'win' when result='draw' then 'draw' else 'loss' end outcome
   from finished where not rank_excluded @> array['p1']
  union all
  select p2,id,kind,'online',updated_at,case when result='p2' then 'win' when result='draw' then 'draw' else 'loss' end
   from finished where p2 is not null and p2<>p1 and not rank_excluded @> array['p2']
  union all
  select r.user_id,r.round_id,r.game,r.difficulty,r.created_at,r.outcome from ojjuda_game_internal.practice_results r
   where (r.game=p_game or (p_game='billiards' and r.game in('carom4','carom3','pool8')))
    and r.created_at>=p_start and r.created_at<=p_end
 ), ordered as (
  select *,count(*) filter(where outcome<>'win') over(partition by user_id,variant,difficulty
   order by finished_at desc,round_id desc rows unbounded preceding) as breaks from events
 ), streaks as (
  select user_id,variant,difficulty,count(*) filter(where outcome='win' and breaks=0) as score,
   max(finished_at) as achieved_at,
   case difficulty when 'online' then case when p_game='janggi' then 7 else 4 end
    when 'grandmaster' then 6 when 'master' then 5 when 'pro' then 4
    when 'hard_exact' then 3 when 'hard' then 3 when 'normal' then 2 else 1 end as priority
  from ordered group by user_id,variant,difficulty
 ) select distinct on(user_id) user_id,score,difficulty,priority,variant,achieved_at from streaks where score>0
  order by user_id,priority desc,score desc,achieved_at,variant;
$$;

notify pgrst,'reload schema';
commit;
