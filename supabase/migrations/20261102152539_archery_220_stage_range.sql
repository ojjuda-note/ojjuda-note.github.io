-- Append the 100 long-distance missions without changing accounts or rewards.
begin;

alter table ojjuda_archery_internal.runs drop constraint runs_stage_check;
alter table ojjuda_archery_internal.runs
  add constraint runs_stage_check check (stage between 1 and 220);

-- Keep the current dispatcher, including free basic coaching and its grants.
-- Replace only the existing validation bound, rather than copying an older RPC.
do $migration$
declare
  definition text := pg_get_functiondef('ojjuda_archery_internal.operate(text,uuid,uuid,integer)'::regprocedure);
begin
  if position('p_stage not between 1 and 120' in definition) > 0 then
    execute replace(definition, 'p_stage not between 1 and 120', 'p_stage not between 1 and 220');
  elsif position('p_stage not between 1 and 220' in definition) = 0 then
    raise exception 'Unexpected archery stage validation; migration aborted';
  end if;
end;
$migration$;

commit;
