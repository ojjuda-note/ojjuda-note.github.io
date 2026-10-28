-- Preserve stored stage scores and existing API permissions.
begin;
set local lock_timeout='5s';
CREATE OR REPLACE FUNCTION ojjuda_guest_internal.ranking(p_game text, p_period text, p_guest_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer := case when p_game='sacheonseong' then 1999999999 else ojjuda_guest_internal.score_limit(p_game) end;
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

  -- Only completed rounds are stored. Choose one best round per identity.
  if p_game='sacheonseong' then
    with member_best as (
      select distinct on (g.user_id) g.user_id,
        split_part(g.game,'_',2)::integer as stage,g.score,g.created_at as achieved_at
      from public.game_scores g
      where g.game in ('sacheonseong_1','sacheonseong_2','sacheonseong_3','sacheonseong_4','sacheonseong_5','sacheonseong_6','sacheonseong_7','sacheonseong_8','sacheonseong_9','sacheonseong_10','sacheonseong_11','sacheonseong_12','sacheonseong_13','sacheonseong_14','sacheonseong_15')
        and g.created_at>=v_start and g.created_at<=v_now
        and g.score between 0 and v_limit
      order by g.user_id,stage desc,g.score desc,g.created_at
    ), guest_best as (
      select distinct on (g.guest_hash) g.guest_hash,
        split_part(g.game,'_',2)::integer as stage,g.score,g.achieved_at
      from ojjuda_guest_internal.scores g
      where g.game in ('sacheonseong_1','sacheonseong_2','sacheonseong_3','sacheonseong_4','sacheonseong_5','sacheonseong_6','sacheonseong_7','sacheonseong_8','sacheonseong_9','sacheonseong_10','sacheonseong_11','sacheonseong_12','sacheonseong_13','sacheonseong_14','sacheonseong_15')
        and g.day>=(v_start at time zone 'Asia/Seoul')::date
        and g.achieved_at>=v_start and g.achieved_at<=v_now
        and g.score between 0 and v_limit
      order by g.guest_hash,stage desc,g.score desc,g.achieved_at
    ), combined as (
      select 'member:'||m.user_id::text as identity,p.nickname as nick,
        m.stage,m.score,m.achieved_at,coalesce(m.user_id=v_actor,false) as me,
        'member_record'::text as source
      from member_best m join public.profiles p on p.id=m.user_id
      where not exists(select 1 from public.user_private u
        where u.user_id=m.user_id and u.banned_until>now())
      union all
      select 'guest:'||g.guest_hash,'손님',g.stage,g.score,g.achieved_at,
        coalesce(g.guest_hash=v_hash,false),'guest_record' from guest_best g
    ), ranked as (
      select * from combined order by stage desc,score desc,achieved_at,identity limit 10
    )
    select coalesce(json_agg(json_build_object(
      'nick',nick,'stage',stage,'score',score,'me',me,'source',source)
      order by stage desc,score desc,achieved_at,identity),'[]'::json)
      into v_result from ranked;
    return v_result;
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.community_game_monthly_ranking(p_game text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
   if p_game in ('tour','tank','ttang','spot','matgo','poker','billiards','carom4','carom3','pool8','janggi','chess') then
    return ojjuda_guest_internal.criteria_ranking(p_game,case when p_game='tour' and 'month'='all' then 'day' else 'month' end,null);end if;
 if p_game='poker' then return ojjuda_poker_internal.ranking(true);end if;
 if p_game='tank' then return public.tank_monthly_ranking();end if;
 if p_game='sacheonseong' or ojjuda_guest_internal.score_limit(p_game) is not null then return ojjuda_guest_internal.ranking(p_game,'month',null);end if;
 return ojjuda_game_internal.community_game_monthly_ranking(p_game);
end;$function$;

notify pgrst,'reload schema';
commit;
