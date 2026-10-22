-- Shorter automatic turns; preserve the 30-second human decision window.
-- Replace only the verified deadline expression, retaining the function's
-- existing ownership, permissions, wallet accounting and concurrency checks.
do $migration$
declare
 target regprocedure := 'ojjuda_poker_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)'::regprocedure;
 definition text := pg_get_functiondef(target);
 old_expression text := $old$r.deadline:=clock_timestamp()+make_interval(secs=>case when phase in ('between','runout') then 2 when r.mode='solo' and (r.state->>'turn')::integer>0 then 1 else 30 end);$old$;
 new_expression text := $new$r.deadline:=clock_timestamp()+make_interval(secs=>case when phase in ('between','runout') then 0.65 when r.mode='solo' and (r.state->>'turn')::integer>0 then 0.45 else 30 end);$new$;
begin
 if strpos(definition,old_expression)=0 then
  if strpos(definition,new_expression)>0 then return;end if;
  raise exception 'poker deadline expression changed; inspect before applying';
 end if;
 execute replace(definition,old_expression,new_expression);
end;
$migration$;
