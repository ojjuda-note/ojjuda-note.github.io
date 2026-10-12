-- Add Saetbyeol to casual member/guest rankings. Existing authentication, moderation,
-- throttling, zero rewards and unverified status remain unchanged.
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
    if position('''saetbyeol''' in definition)=0 then
      updated := regexp_replace(definition,
        '(when[[:space:]]+''spot''[[:space:]]+then[[:space:]]+6)',
        'WHEN ''saetbyeol'' THEN 60000 \1','i');
      if updated=definition then raise exception 'Expected score limit missing in %',signature; end if;
      execute updated;
    end if;
  end loop;
  select pg_get_constraintdef(oid) into constraint_definition from pg_constraint
    where conrelid='public.game_scores'::regclass and conname='game_scores_game_check';
  if constraint_definition is null then raise exception 'Missing game score constraint'; end if;
  if position('''saetbyeol''' in constraint_definition)=0 then
    updated := replace(constraint_definition,'''ttang''::text','''saetbyeol''::text, ''ttang''::text');
    if updated=constraint_definition then raise exception 'Unexpected game score constraint'; end if;
    alter table public.game_scores drop constraint game_scores_game_check;
    execute 'alter table public.game_scores add constraint game_scores_game_check '||updated;
  end if;
end;
$migration$;
notify pgrst,'reload schema';
