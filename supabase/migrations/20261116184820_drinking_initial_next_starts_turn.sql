-- The next survivor already owns this turn. One press starts their five seconds.
do $migration$
declare
  definition text := pg_get_functiondef('ojjuda_arcade_internal.live_initial(jsonb,text,jsonb,integer,integer,bigint)'::regprocedure);
  old_transition text := $old$return (g-'lastOut'-'reason')||jsonb_build_object('phase','ready');$old$;
  new_transition text := $new$return (g-'lastOut'-'reason')||jsonb_build_object('phase','active','endsAt',ms+5000);$new$;
begin
  if strpos(definition,old_transition)=0 then
    if strpos(definition,new_transition)>0 then return; end if;
    raise exception 'unexpected initial next-turn transition';
  end if;
  execute replace(definition,old_transition,new_transition);
end
$migration$;
