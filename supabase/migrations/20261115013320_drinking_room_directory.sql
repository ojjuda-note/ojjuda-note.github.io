-- Filter before the directory limit, keeping the existing visibility checks.
do $directory$
declare
 source text:=pg_get_functiondef('ojjuda_arcade_internal.drinking_room(text,text,jsonb)'::regprocedure);
 anchor text:='   order by mine desc,d.expires_at desc limit 100) v;';
begin
 if strpos(source,anchor)=0 then raise exception 'unexpected drinking directory'; end if;
 source:=replace(source,anchor,$filter$   and (coalesce(room_id,'')='' or d.code=room_id)
   and strpos(lower(d.title),lower(left(trim(coalesce(p_options->>'query','')),40)))>0
$filter$||anchor);
 execute source;
end;
$directory$;
