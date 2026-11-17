-- Accept the full range of the existing integer score column for Saetbyeol.
-- The guest limit is also used to select eligible member and guest leaderboard rows.
do $migration$
declare
  target regprocedure;
  definition text;
  old_value constant text := '(''saetbyeol''[[:space:]]+then[[:space:]]+)60000\M';
  new_value constant text := '''saetbyeol''[[:space:]]+then[[:space:]]+2147483647\M';
begin
  foreach target in array array[
    'ojjuda_game_internal.submit_score(text,integer)'::regprocedure,
    'ojjuda_guest_internal.score_limit(text)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if definition ~* new_value then continue; end if;
    if definition !~* old_value then
      raise exception 'Unexpected Saetbyeol score rule in %', target;
    end if;
    execute regexp_replace(definition, old_value, '\1' || '2147483647', 'i');
  end loop;
end;
$migration$;
