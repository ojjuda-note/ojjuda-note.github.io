-- A complete 100-stage run now contains 3,560 breakable bricks (35,600 points).
-- Change only Breakout's bound; retain current auth, wallet and ranking rules.
do $migration$
declare
  target text;
  definition text;
  old_count integer;
  new_count integer;
begin
  foreach target in array array[
    'ojjuda_game_internal.submit_score(text,integer)',
    'ojjuda_game_internal.community_game_ranking(text)',
    'ojjuda_game_internal.community_game_monthly_ranking(text)'
  ] loop
    definition := pg_get_functiondef(target::regprocedure);
    select count(*) into old_count from regexp_matches(
      definition, '''breakout''[[:space:]]+then[[:space:]]+20000', 'gi');
    select count(*) into new_count from regexp_matches(
      definition, '''breakout''[[:space:]]+then[[:space:]]+40000', 'gi');
    if old_count=0 and new_count=1 then continue; end if;
    if old_count<>1 or new_count<>0 then
      raise exception 'Unexpected Breakout bound in %', target;
    end if;
    execute regexp_replace(definition,
      '''breakout''[[:space:]]+then[[:space:]]+20000', '''breakout'' THEN 40000', 'gi');
  end loop;
end;
$migration$;
