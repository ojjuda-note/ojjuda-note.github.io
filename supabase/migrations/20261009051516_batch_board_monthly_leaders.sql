-- One request for the board's game leaders, using the existing ranking rules.
-- Invoker rights preserve member, moderation, guest and wallet restrictions.
create function public.community_game_monthly_leaders(p_games text[])
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  v_game text;
  v_result jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode='42501';
  end if;
  if p_games is null or cardinality(p_games)>40 then
    raise exception 'invalid_games' using errcode='22023';
  end if;
  for v_game in select distinct game from unnest(p_games) as requested(game)
  loop
    if v_game is null or v_game !~ '^[a-z0-9_]{1,40}$' then
      raise exception 'invalid_game' using errcode='22023';
    end if;
    v_result := v_result || jsonb_build_object(v_game,
      public.community_game_monthly_ranking(v_game)::jsonb->0);
  end loop;
  return v_result;
end;
$$;
revoke all on function public.community_game_monthly_leaders(text[]) from public,anon;
grant execute on function public.community_game_monthly_leaders(text[]) to authenticated;
notify pgrst,'reload schema';
