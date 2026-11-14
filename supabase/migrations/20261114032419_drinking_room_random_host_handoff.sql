-- The shared room and native game clients treat seat zero as the host.
-- Keep the room code, password and other seats when that member leaves.
do $migration$
declare
 fn regprocedure := 'ojjuda_arcade_internal.drinking_room(text,text,jsonb)'::regprocedure;
 definition text := pg_get_functiondef(fn);
 old_leave text := $old$    if p_action='leave' and me=0 then
     delete from ojjuda_arcade_internal.drinking_rooms where code=h.code;
    elsif p_action='leave' then$old$;
 new_leave text := $new$    if p_action='leave' and n=1 then
     delete from ojjuda_arcade_internal.drinking_rooms where code=h.code;
    elsif p_action='leave' and me=0 then
     -- The SELECT FOR UPDATE above serializes this draw with joins and other exits.
     -- Array positions 2 through n are the remaining members, each equally likely.
     declare successor int := 2 + floor(random() * (n - 1))::int;
     begin
      update ojjuda_arcade_internal.drinking_rooms
       set creator=h.members[successor], request_id=gen_random_uuid(),
           members=array[h.members[successor]] || h.members[2:successor-1] || h.members[successor+1:n],
           names=array[h.names[successor]] || h.names[2:successor-1] || h.names[successor+1:n],
           phase='lobby', child=null
       where code=h.code;
     end;
    elsif p_action='leave' then$new$;
begin
 if strpos(definition,old_leave)=0 then raise exception 'shared room leave implementation changed'; end if;
 execute replace(definition,old_leave,new_leave);
end;
$migration$;
