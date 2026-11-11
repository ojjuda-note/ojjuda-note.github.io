-- Stacker and Chacha Rush continue accumulating points during normal play:
-- validated engine runs exceeded 300 and 9,999,999 respectively. Keep their
-- submissions and rankings on the existing continuous-score integer boundary.
-- Change only six CASE values. Chacha's public rankings use score_limit; the
-- older internal fallback ranking functions have no Chacha branch to change.
do $migration$
declare
  target text;
  definition text;
  games text[] := array['stacker', 'chacha_rush'];
  old_limits integer[] := array[300, 9999999];
  game_index integer;
  old_pattern text;
  new_pattern text;
  old_count integer;
  new_count integer;
  changed boolean;
begin
  foreach target in array array[
    'ojjuda_game_internal.submit_score(text,integer)',
    'ojjuda_game_internal.community_game_ranking(text)',
    'ojjuda_game_internal.community_game_monthly_ranking(text)',
    'ojjuda_guest_internal.score_limit(text)'
  ] loop
    definition := pg_get_functiondef(target::regprocedure);
    changed := false;
    for game_index in 1..array_length(games, 1) loop
      if games[game_index] = 'chacha_rush' and target not in (
        'ojjuda_game_internal.submit_score(text,integer)',
        'ojjuda_guest_internal.score_limit(text)'
      ) then
        continue;
      end if;
      -- Require a whole numeric token, and stop atomically on unexpected drift.
      old_pattern := format('(''%s''[[:space:]]+then[[:space:]]+)%s(?=[[:space:]]|$)',
        games[game_index], old_limits[game_index]);
      new_pattern := format('''%s''[[:space:]]+then[[:space:]]+1999999999(?=[[:space:]]|$)',
        games[game_index]);
      select count(*) into old_count from regexp_matches(definition, old_pattern, 'gi');
      select count(*) into new_count from regexp_matches(definition, new_pattern, 'gi');
      if old_count = 0 and new_count = 1 then
        continue;
      end if;
      if old_count <> 1 or new_count <> 0 then
        raise exception 'Unexpected % score limit in % (old %, new %)',
          games[game_index], target, old_count, new_count;
      end if;
      definition := regexp_replace(definition, old_pattern, '\1' || '1999999999', 'gi');
      changed := true;
    end loop;
    if changed then
      execute definition;
    end if;
  end loop;
end;
$migration$;
