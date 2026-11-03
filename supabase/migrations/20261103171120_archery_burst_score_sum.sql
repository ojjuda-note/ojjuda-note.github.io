-- A three-arrow crossbow volley now adds the three arrow scores. Five volleys
-- can therefore score 5 * 3 * 10 = 150. Preserve all existing runs, receipts,
-- balances, launch epochs and rankings; only widen the accepted score range.
begin;
set local lock_timeout='5s';

alter table ojjuda_archery_internal.runs drop constraint runs_score_check;
alter table ojjuda_archery_internal.runs
 add constraint runs_score_check check(score between 0 and 150);

-- Keep the current dispatcher and its grants, owner checks, transaction guard
-- and idempotent receipts. Abort if its validation no longer matches the known
-- contract instead of replacing unrelated, newer server behavior.
do $migration$
declare
 definition text:=pg_get_functiondef('ojjuda_archery_internal.single_operate(text,integer,uuid,uuid,integer,integer)'::regprocedure);
begin
 if position('p_score not between 0 and 50' in definition)>0 then
  execute replace(definition,'p_score not between 0 and 50','p_score not between 0 and 150');
 elsif position('p_score not between 0 and 150' in definition)=0 then
  raise exception 'Unexpected archery score validation; migration aborted';
 end if;
end;
$migration$;

-- Ranking candidates already compare the stored integer score after the stage,
-- and receipts preserve that score verbatim. Administrator item trials never
-- create server runs; ordinary play by an administrator keeps normal rankings.
notify pgrst,'reload schema';
commit;
