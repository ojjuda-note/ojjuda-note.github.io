-- Solitaire: normal before beginner, then fastest clear; no wallet or reward changes.
-- Encoded scores: mode (1/2) * 100000000 + 100000000 - elapsed seconds.
do $migration$
declare
  signature text;
  definition text;
  updated text;
  constraint_definition text;
begin
  foreach signature in array array[
    'ojjuda_game_internal.submit_score(text,integer)',
    'ojjuda_guest_internal.score_limit(text)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('''solitaire''' in definition)=0 then
      -- The member function uses CASE p_game; the guest function also supports
      -- searched CASE conditions after the stage-based game limit update.
      updated := regexp_replace(definition,
        '(when[[:space:]]+''mines''[[:space:]]+then[[:space:]]+89999)',
        'WHEN ''solitaire'' THEN 299999999 \1','i');
      if updated=definition then
        updated := regexp_replace(definition,
          '(when[[:space:]]+p_game[[:space:]]*=[[:space:]]*''mines''[[:space:]]+then[[:space:]]+89999)',
          'WHEN p_game = ''solitaire'' THEN 299999999 \1','i');
      end if;
      if updated=definition then raise exception 'Expected score limit missing in %',signature; end if;
      execute updated;
    end if;
  end loop;
  select pg_get_constraintdef(oid) into constraint_definition from pg_constraint
    where conrelid='public.game_scores'::regclass and conname='game_scores_game_check';
  if constraint_definition is null then raise exception 'Missing game score constraint'; end if;
  if position('''solitaire''' in constraint_definition)=0 then
    updated := replace(constraint_definition,'''mines''::text','''solitaire''::text, ''mines''::text');
    if updated=constraint_definition then raise exception 'Unexpected game score constraint'; end if;
    alter table public.game_scores drop constraint game_scores_game_check;
    execute 'alter table public.game_scores add constraint game_scores_game_check '||updated;
  end if;
end;
$migration$;
notify pgrst,'reload schema';
