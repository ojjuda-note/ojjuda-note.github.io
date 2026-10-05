-- Extend existing member scores only. No rewards, balance changes or verification bypass.
do $migration$
declare v_definition text; v_updated text; v_signature text; v_constraint text;
begin
 foreach v_signature in array array[
  'ojjuda_game_internal.submit_score(text,integer)',
  'ojjuda_game_internal.community_game_ranking(text)'
 ] loop
  select pg_get_functiondef(v_signature::regprocedure) into v_definition;
  if position('''ttang''' in v_definition)=0 then
   v_updated:=regexp_replace(v_definition,'(when ''spot'' then 6)','WHEN ''ttang'' THEN 1000 \1','i');
   if v_updated=v_definition then raise exception 'Expected score limit not found in %',v_signature;end if;
   execute v_updated;
  end if;
 end loop;
 select pg_get_constraintdef(oid) into v_constraint from pg_constraint
 where conrelid='public.game_scores'::regclass and conname='game_scores_game_check';
 if v_constraint is null then raise exception 'Missing game score constraint';end if;
 if position('''ttang''' in v_constraint)=0 then
  v_updated:=replace(v_constraint,'''mole''::text','''ttang''::text, ''mole''::text');
  if v_updated=v_constraint then raise exception 'Unexpected game score constraint';end if;
  alter table public.game_scores drop constraint game_scores_game_check;
  execute 'alter table public.game_scores add constraint game_scores_game_check '||v_updated;
 end if;
end $migration$;
