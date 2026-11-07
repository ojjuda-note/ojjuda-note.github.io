-- Extend existing stage-specific leaderboard keys and paid tools to level 200.
-- Keep every other game's accepted keys, all function owners, security modes,
-- role grants and search paths unchanged.

-- Install and verify the more permissive constraint before dropping the old one.
alter table public.game_scores
  add constraint game_scores_game_check_200
  check (
    game in (
      'tour','saetbyeol','solitaire','mines','ttang','mole','runner',
      'stacker','breakout','snake','screw','screw_box','screw_flat',
      'spot','carom4','carom3','pool8','janggi','chess','matgo'
    )
    or game ~ '^sacheonseong_([1-9]|[1-9][0-9]|1[0-9]{2}|200)$'
  ) not valid;
alter table public.game_scores validate constraint game_scores_game_check_200;
alter table public.game_scores drop constraint game_scores_game_check;
alter table public.game_scores rename constraint game_scores_game_check_200 to game_scores_game_check;

do $migration$
declare
  target record;
  source_sql text;
  extra_stage_keys text;
begin
  select string_agg(quote_literal('sacheonseong_' || n), ',' order by n)
    into extra_stage_keys
    from generate_series(16,200) as numbers(n);

  -- Ranking and guest ranking functions contain literal stage-key arrays.
  -- Reuse existing definitions so this migration cannot alter other games'
  -- ranking rules or SECURITY DEFINER / search_path settings.
  for target in
    select * from (values
      ('ojjuda_guest_internal','score_limit'),
      ('ojjuda_guest_internal','ranking'),
      ('ojjuda_ranking_internal','candidates')
    ) as functions(schema_name,function_name)
  loop
    select pg_get_functiondef(p.oid) into source_sql
      from pg_proc as p
      join pg_namespace as n on n.oid=p.pronamespace
     where n.nspname=target.schema_name and p.proname=target.function_name;
    if source_sql is null or position('''sacheonseong_15''' in source_sql)=0 then
      raise exception 'Expected stage boundary not found in %.%',target.schema_name,target.function_name;
    end if;
    execute replace(source_sql,'''sacheonseong_15''','''sacheonseong_15'',' || extra_stage_keys);
  end loop;

  select pg_get_functiondef(p.oid) into source_sql
    from pg_proc as p
    join pg_namespace as n on n.oid=p.pronamespace
   where n.nspname='ojjuda_game_internal' and p.proname='submit_score';
  if source_sql is null or position('IF v_limit IS NULL OR' in source_sql)=0 then
    raise exception 'Expected score validation boundary not found';
  end if;
  execute replace(
    source_sql,
    'IF v_limit IS NULL OR',
    $extra$
  IF p_game ~ '^sacheonseong_([1-9]|[1-9][0-9]|1[0-9]{2}|200)$' THEN
    v_limit := 1999999999;
  END IF;
  IF v_limit IS NULL OR$extra$
  );

  select pg_get_functiondef(p.oid) into source_sql
    from pg_proc as p
    join pg_namespace as n on n.oid=p.pronamespace
   where n.nspname='ojjuda_shop_internal' and p.proname='sacheonseong_tool_buy';
  if source_sql is null or position('p_stage not between 1 and 15' in source_sql)=0 then
    raise exception 'Expected paid-tool stage boundary not found';
  end if;
  execute replace(source_sql,'p_stage not between 1 and 15','p_stage not between 1 and 200');
end;
$migration$;

notify pgrst, 'reload schema';
