-- Stage-specific casual time ranks, using the existing member/guest pipeline.
-- score = 2,000,000,000 - elapsed centiseconds. A shorter time ranks higher.
-- Authentication, moderation, throttling, zero rewards and unverified status stay intact.
begin;
set local lock_timeout = '5s';
do $migration$
declare
 signature text;
 definition text;
 updated text;
 cases text;
 games text;
 stage integer;
begin
 select string_agg(format(' WHEN %L THEN 1999999999','sacheonseong_'||s),E'\n'),
        string_agg(format('%L::text','sacheonseong_'||s),', ')
 into cases,games from generate_series(1,15) s;
 foreach signature in array array['ojjuda_game_internal.submit_score(text,integer)','ojjuda_guest_internal.score_limit(text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('sacheonseong_1' in definition)=0 then
   updated:=regexp_replace(definition,'(case[[:space:]]+p_game)',E'\\1\n'||cases,'i');
   if updated=definition then raise exception 'Expected score cases missing in %',signature;end if;
   execute updated;
  end if;
  for stage in 1..15 loop
   if position(quote_literal('sacheonseong_'||stage) in pg_get_functiondef(signature::regprocedure))=0 then raise exception 'Missing stage % in %',stage,signature;end if;
  end loop;
 end loop;
 select pg_get_constraintdef(oid) into definition from pg_constraint
 where conrelid='public.game_scores'::regclass and conname='game_scores_game_check';
 if definition is null then raise exception 'Missing game score constraint';end if;
 if position('sacheonseong_1' in definition)=0 then
  updated:=replace(definition,'''mines''::text','''mines''::text, '||games);
  if updated=definition then raise exception 'Unexpected game score constraint';end if;
  alter table public.game_scores drop constraint game_scores_game_check;
  execute 'alter table public.game_scores add constraint game_scores_game_check '||updated;
 end if;
end;
$migration$;
notify pgrst,'reload schema';
commit;
