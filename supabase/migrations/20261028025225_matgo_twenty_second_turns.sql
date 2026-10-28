-- Extend new multiplayer turns to 20 seconds without resetting active games.
alter table ojjuda_matgo_internal.rooms
  alter column deadline set default (now()+interval '20 seconds');

-- Keep the live service's authentication, locking, settlement and grants intact.
-- The original implementation is renamed to _v1 by the shared-stakes migration.
do $$
declare
  service regprocedure;
  definition text;
  old_clock text := 'interval ''15 seconds''';
  new_clock text := 'interval ''20 seconds''';
  occurrences integer;
begin
  service := coalesce(
    to_regprocedure('ojjuda_matgo_internal.online_service_v1(uuid,text,uuid,text,text,integer,uuid,jsonb)'),
    to_regprocedure('ojjuda_matgo_internal.online_service(uuid,text,uuid,text,text,integer,uuid,jsonb)')
  );
  if service is null then raise exception 'matgo_online_service_missing'; end if;
  definition := pg_get_functiondef(service);
  occurrences := (length(definition)-length(replace(definition,old_clock,'')))/length(old_clock);
  if occurrences=3 then
    execute replace(definition,old_clock,new_clock);
  elsif occurrences<>0 or (length(definition)-length(replace(definition,new_clock,'')))/length(new_clock)<>3 then
    raise exception 'unexpected_matgo_turn_clock_definition';
  end if;
end $$;
