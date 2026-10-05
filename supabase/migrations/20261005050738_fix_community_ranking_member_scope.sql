-- Keep owner-only privacy helpers scoped to their owner; filter moderation inside this private ranking function.
create or replace function ojjuda_game_internal.community_game_ranking(p_game text)
returns json language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer;
  v_result json;
  v_start timestamptz := date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if v_actor is null or not exists(select 1 from public.profiles where id=v_actor) then
    raise exception 'not_signed_in' using errcode='42501';
  end if;
  v_limit := case p_game
    when 'mole' then 200 when 'runner' then 50000 when 'stacker' then 300
    when 'breakout' then 20000 when 'snake' then 300
    when 'screw' then 1000000 when 'screw_box' then 1000000 when 'screw_flat' then 1000000
    when 'spot' then 6 when 'carom4' then 1000 when 'carom3' then 1000
    when 'pool8' then 8 when 'janggi' then 1 when 'chess' then 1 when 'matgo' then 1000000 end;
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
