-- Practice outcomes are private; online outcomes remain authoritative in board_games.
create table if not exists ojjuda_game_internal.practice_results (
  user_id uuid not null references public.profiles(id) on delete cascade,
  round_id uuid not null,
  game text not null check(game in ('carom4','carom3','pool8','chess','janggi')),
  difficulty text not null check(difficulty in ('easy','normal','hard')),
  outcome text not null check(outcome in ('win','loss','draw')),
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,round_id)
);
alter table ojjuda_game_internal.practice_results enable row level security;
revoke all on ojjuda_game_internal.practice_results from public,anon,authenticated;
create index if not exists practice_results_ranking_idx on ojjuda_game_internal.practice_results(game,difficulty,user_id,created_at desc);
create index if not exists board_games_streak_ranking_idx on public.board_games(kind,updated_at desc) include(p1,p2,result) where status='done';

create or replace function ojjuda_game_internal.record_practice_game_result(p_game text,p_round uuid,p_outcome text,p_difficulty text)
returns json language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing ojjuda_game_internal.practice_results%rowtype;
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor) then
    raise exception 'not_signed_in' using errcode='42501';
  end if;
  if public.is_banned(actor) then raise exception 'banned' using errcode='42501'; end if;
  if p_difficulty is null or p_difficulty not in ('easy','normal','hard') then raise exception 'invalid_difficulty'; end if;
  if p_round is null or p_game is null or p_game not in ('carom4','carom3','pool8','chess','janggi')
    or p_outcome is null or p_outcome not in ('win','loss','draw') then raise exception 'invalid_result'; end if;
  if exists(select 1 from public.board_games where id=p_round) then raise exception 'online_result_is_server_owned'; end if;
  insert into ojjuda_game_internal.practice_results(user_id,round_id,game,outcome,difficulty)
    values(actor,p_round,p_game,p_outcome,p_difficulty) on conflict(user_id,round_id) do nothing;
  select * into existing from ojjuda_game_internal.practice_results where user_id=actor and round_id=p_round;
  if existing.game<>p_game or existing.outcome<>p_outcome or existing.difficulty<>p_difficulty then raise exception 'result_already_recorded'; end if;
  return json_build_object('ok',true);
end;
$$;
revoke all on function ojjuda_game_internal.record_practice_game_result(text,uuid,text,text) from public,anon;
grant execute on function ojjuda_game_internal.record_practice_game_result(text,uuid,text,text) to authenticated;
create or replace function public.record_practice_game_result(p_game text,p_round uuid,p_outcome text,p_difficulty text)
returns json language sql security invoker set search_path='' as $$
  select ojjuda_game_internal.record_practice_game_result(p_game,p_round,p_outcome,p_difficulty);
$$;
revoke all on function public.record_practice_game_result(text,uuid,text,text) from public,anon;
grant execute on function public.record_practice_game_result(text,uuid,text,text) to authenticated;

-- Rank Matgo by the current server wallet balance, without a daily score cutoff.
create or replace function ojjuda_game_internal.community_game_ranking(p_game text)
returns json language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_game text:=regexp_replace(p_game,'_(easy|normal|hard|online)$','');
  v_difficulty text:=case when p_game~'_(easy|normal|hard)$' then substring(p_game from '(easy|normal|hard)$') else 'online' end;
  v_limit integer;
  v_result json;
  v_start timestamptz := date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if v_actor is null or not exists(select 1 from public.profiles where id=v_actor) then
    raise exception 'not_signed_in' using errcode='42501';
  end if;
  if v_game in ('carom4','carom3','pool8','chess','janggi') then
    with finished as (
      select id,p1,p2,result,updated_at from public.board_games
      where v_difficulty='online' and kind=v_game and status='done' and result in ('p1','p2','draw')
    ), events as (
      select p1 as user_id,id as round_id,updated_at as finished_at,
        case when result='p1' then 'win' when result='draw' then 'draw' else 'loss' end as outcome from finished
      union all
      select p2,id,updated_at,case when result='p2' then 'win' when result='draw' then 'draw' else 'loss' end
        from finished where p2 is not null and p2<>p1
      union all
      select user_id,round_id,created_at,outcome from ojjuda_game_internal.practice_results where game=v_game and difficulty=v_difficulty
    ), ordered as (
      select *,count(*) filter(where outcome<>'win') over (
        partition by user_id order by finished_at desc,round_id desc rows unbounded preceding
      ) as breaks from events
    ), streaks as (
      select user_id,count(*) filter(where outcome='win' and breaks=0) as streak,
        max(finished_at) as latest from ordered group by user_id
    )
    select coalesce(json_agg(json_build_object(
      'nick',r.nickname,'score',r.streak,'me',r.user_id=v_actor,'source','current_streak'
    ) order by r.streak desc,r.latest,r.user_id),'[]'::json) into v_result
    from (
      select s.*,p.nickname from streaks s join public.profiles p on p.id=s.user_id
      where s.streak>0 and not exists(select 1 from public.user_private moderation
        where moderation.user_id=s.user_id and moderation.banned_until>now())
      order by s.streak desc,s.latest,s.user_id limit 10
    ) r;
    return v_result;
  end if;
  if p_game='matgo' then
    select coalesce(json_agg(json_build_object(
      'nick',r.nickname,'score',r.gold,'me',r.user_id=v_actor,'source','current_gold'
    ) order by r.gold desc,r.user_id),'[]'::json) into v_result
    from (
      select w.user_id,p.nickname,w.gold
      from ojjuda_matgo_internal.wallets w join public.profiles p on p.id=w.user_id
      where not exists (select 1 from public.user_private moderation
        where moderation.user_id=w.user_id and moderation.banned_until>now())
      order by w.gold desc,w.user_id limit 10
    ) r;
    return v_result;
  end if;
  v_limit := case p_game
    when 'mole' then 200 when 'runner' then 50000 when 'stacker' then 300
    when 'breakout' then 20000 when 'snake' then 300
    when 'screw' then 1000000 when 'screw_box' then 1000000 when 'screw_flat' then 1000000
    when 'spot' then 6 when 'carom4' then 1000 when 'carom3' then 1000
    when 'pool8' then 8 when 'janggi' then 1 when 'chess' then 1 end;
  if v_limit is null then return '[]'::json; end if;
  select coalesce(json_agg(json_build_object(
    'nick',r.nickname,'score',r.score,'me',r.user_id=v_actor,'source','member_record'
  ) order by r.score desc,r.achieved_at,r.user_id),'[]'::json) into v_result
  from (
    select best.user_id,p.nickname,best.score,best.achieved_at
    from (
      select distinct on (g.user_id) g.user_id,g.score,g.created_at as achieved_at
      from public.game_scores g
      where g.game=p_game and g.created_at>=v_start and g.created_at<v_start+interval '1 day'
        and g.score between 0 and v_limit
      order by g.user_id,g.score desc,g.created_at
    ) best join public.profiles p on p.id=best.user_id
    where not exists (select 1 from public.user_private moderation
      where moderation.user_id=best.user_id and moderation.banned_until>now())
    order by best.score desc,best.achieved_at,best.user_id limit 10
  ) r;
  return v_result;
end;
$$;
notify pgrst,'reload schema';
