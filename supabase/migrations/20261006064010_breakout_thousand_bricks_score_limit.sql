-- A complete 100-stage run now contains 50,410 breakable bricks (504,100 points).
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
      definition, '''breakout''[[:space:]]+then[[:space:]]+40000', 'gi');
    select count(*) into new_count from regexp_matches(
      definition, '''breakout''[[:space:]]+then[[:space:]]+550000', 'gi');
    if old_count=0 and new_count=1 then continue; end if;
    if old_count<>1 or new_count<>0 then
      raise exception 'Unexpected Breakout bound in %', target;
    end if;
    execute regexp_replace(definition,
      '''breakout''[[:space:]]+then[[:space:]]+40000', '''breakout'' THEN 550000', 'gi');
  end loop;
end;
$migration$;
