-- Guests participate in the same unverified community score rankings as members.
-- A browser holds a random 256-bit token; only its hash is stored, never returned.
-- No member account, verified result, wallet entry or reward is created here.
create schema if not exists ojjuda_guest_internal;
revoke all on schema ojjuda_guest_internal from public;
grant usage on schema ojjuda_guest_internal to anon, authenticated;

create table ojjuda_guest_internal.scores (
  day date not null,
  game text not null,
  guest_hash text not null check (guest_hash ~ '^[a-f0-9]{64}$'),
  score integer not null check (score >= 0),
  achieved_at timestamptz not null,
  last_submitted_at timestamptz not null,
  last_request_id uuid not null,
  last_score integer not null,
  primary key (day, game, guest_hash)
);
alter table ojjuda_guest_internal.scores enable row level security;
revoke all on ojjuda_guest_internal.scores from public, anon, authenticated;
create index guest_scores_game_day on ojjuda_guest_internal.scores (game, day, score desc);

create function ojjuda_guest_internal.score_limit(p_game text)
returns integer language sql immutable security invoker set search_path='' as $$
  select case p_game
    when 'mole' then 200 when 'runner' then 50000 when 'stacker' then 300
    when 'breakout' then 550000 when 'screw' then 1000000
    when 'screw_box' then 1000000 when 'screw_flat' then 1000000
    when 'spot' then 6 when 'ttang' then 1000 end;
$$;
revoke all on function ojjuda_guest_internal.score_limit(text) from public;
grant execute on function ojjuda_guest_internal.score_limit(text) to anon, authenticated;

create function ojjuda_guest_internal.ranking(p_game text, p_period text, p_guest_token text)
returns json language plpgsql stable security definer set search_path='' as $$
declare
  v_limit integer := ojjuda_guest_internal.score_limit(p_game);
  v_actor uuid := auth.uid();
  v_hash text;
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_result json;
begin
  if v_limit is null or p_period is null or p_period not in ('day','month') then return '[]'::json; end if;
  if p_guest_token ~ '^[a-f0-9]{64}$' then
    v_hash := encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');
  end if;
  v_start := date_trunc(p_period,v_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  with member_best as (
    select distinct on (g.user_id) g.user_id,g.score,g.created_at as achieved_at
    from public.game_scores g
    where g.game=p_game and g.created_at>=v_start and g.created_at<=v_now
      and g.score between 0 and v_limit
    order by g.user_id,g.score desc,g.created_at
  ), guest_best as (
    select distinct on (g.guest_hash) g.guest_hash,g.score,g.achieved_at
    from ojjuda_guest_internal.scores g
    where g.game=p_game and g.day>=(v_start at time zone 'Asia/Seoul')::date
      and g.achieved_at>=v_start and g.achieved_at<=v_now and g.score between 0 and v_limit
    order by g.guest_hash,g.score desc,g.achieved_at
  ), combined as (
    select 'member:'||m.user_id::text as identity,p.nickname as nick,m.score,m.achieved_at,
      coalesce(m.user_id=v_actor,false) as me,'member_record'::text as source
    from member_best m join public.profiles p on p.id=m.user_id
    where not exists(select 1 from public.user_private u where u.user_id=m.user_id and u.banned_until>now())
    union all
    select 'guest:'||g.guest_hash,'손님',g.score,g.achieved_at,
      coalesce(g.guest_hash=v_hash,false),'guest_record' from guest_best g
  ), ranked as (
    select * from combined order by score desc,achieved_at,identity limit 10
  )
  select coalesce(json_agg(json_build_object('nick',nick,'score',score,'me',me,'source',source)
    order by score desc,achieved_at,identity),'[]'::json) into v_result from ranked;
  return v_result;
end;
$$;
revoke all on function ojjuda_guest_internal.ranking(text,text,text) from public;
grant execute on function ojjuda_guest_internal.ranking(text,text,text) to anon, authenticated;

create function ojjuda_guest_internal.submit_score(p_game text,p_score integer,p_guest_token text,p_request_id uuid)
returns json language plpgsql security definer set search_path='' as $$
declare
  v_limit integer := ojjuda_guest_internal.score_limit(p_game);
  v_hash text;
  v_now timestamptz;
  v_day date;
  v_best integer;
  v_previous ojjuda_guest_internal.scores%rowtype;
begin
  if v_limit is null or p_score is null or p_score<0 or p_score>v_limit
    or p_guest_token is null or p_guest_token !~ '^[a-f0-9]{64}$' or p_request_id is null then
    return json_build_object('ok',false,'reason','invalid');
  end if;
  if auth.uid() is not null and exists(select 1 from public.user_private
    where user_id=auth.uid() and banned_until>now()) then
    return json_build_object('ok',false,'reason','banned');
  end if;
  v_hash := encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('ojjuda-guest-score:'||v_hash||':'||p_game,0));
  v_now := clock_timestamp();
  v_day := (v_now at time zone 'Asia/Seoul')::date;
  select * into v_previous from ojjuda_guest_internal.scores
    where day=v_day and game=p_game and guest_hash=v_hash;
  if v_previous.last_request_id=p_request_id then
    if v_previous.last_score<>p_score then return json_build_object('ok',false,'reason','request_conflict'); end if;
    v_best := v_previous.score;
  else
    if v_previous.last_submitted_at>v_now-interval '5 seconds' then
      return json_build_object('ok',false,'reason','too_fast');
    end if;
    insert into ojjuda_guest_internal.scores as saved
      (day,game,guest_hash,score,achieved_at,last_submitted_at,last_request_id,last_score)
    values (v_day,p_game,v_hash,p_score,v_now,v_now,p_request_id,p_score)
    on conflict (day,game,guest_hash) do update set
      score=greatest(saved.score,excluded.score),
      achieved_at=case when excluded.score>saved.score then excluded.achieved_at else saved.achieved_at end,
      last_submitted_at=excluded.last_submitted_at,last_request_id=excluded.last_request_id,last_score=excluded.last_score
    returning score into v_best;
  end if;
  return json_build_object('ok',true,'guest',true,'best',v_best,'rank',null,'reward',0,'verified',false);
end;
$$;
revoke all on function ojjuda_guest_internal.submit_score(text,integer,text,uuid) from public;
grant execute on function ojjuda_guest_internal.submit_score(text,integer,text,uuid) to anon, authenticated;

create function public.submit_guest_game_score(p_game text,p_score integer,p_guest_token text,p_request_id uuid)
returns json language sql security invoker set search_path='' as $$
  select ojjuda_guest_internal.submit_score(p_game,p_score,p_guest_token,p_request_id);
$$;
revoke all on function public.submit_guest_game_score(text,integer,text,uuid) from public;
grant execute on function public.submit_guest_game_score(text,integer,text,uuid) to anon, authenticated;

create function public.guest_game_ranking(p_game text,p_period text default 'day',p_guest_token text default null)
returns json language sql stable security invoker set search_path='' as $$
  select ojjuda_guest_internal.ranking(p_game,p_period,p_guest_token);
$$;
revoke all on function public.guest_game_ranking(text,text,text) from public;
grant execute on function public.guest_game_ranking(text,text,text) to anon, authenticated;

-- Existing callers see the same combined scores. Protected age, wallet and streak
-- rankings keep their original member-only implementation and permissions.
create or replace function public.community_game_ranking(p_game text)
returns json language plpgsql stable security invoker set search_path='' as $$
begin
  if ojjuda_guest_internal.score_limit(p_game) is not null then
    return ojjuda_guest_internal.ranking(p_game,'day',null);
  end if;
  return ojjuda_game_internal.community_game_ranking(p_game);
end;
$$;
create or replace function public.community_game_monthly_ranking(p_game text)
returns json language plpgsql stable security invoker set search_path='' as $$
begin
  if ojjuda_guest_internal.score_limit(p_game) is not null then
    return ojjuda_guest_internal.ranking(p_game,'month',null);
  end if;
  return ojjuda_game_internal.community_game_monthly_ranking(p_game);
end;
$$;
revoke all on function public.community_game_ranking(text),public.community_game_monthly_ranking(text) from public;
grant execute on function public.community_game_ranking(text),public.community_game_monthly_ranking(text) to anon,authenticated;
notify pgrst,'reload schema';
