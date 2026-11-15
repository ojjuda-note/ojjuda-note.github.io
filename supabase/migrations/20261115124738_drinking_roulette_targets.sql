-- The target is private to its owner until every participant has pressed.
create or replace function ojjuda_arcade_internal.live_partyroulette(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 marks jsonb := g->'marks';
 targets jsonb := coalesce(g->'targets','{}'::jsonb);
 marked int;
 chosen int;
 shooter int;
 result jsonb;
begin
 if action='init' then return jsonb_build_object('phase','prepare','marks','{}'::jsonb); end if;
 if action='tick' then return g; end if;
 if action='view' then
  if g->>'phase'='done' then
   result:=jsonb_build_object('phase','done','fired',seat=(g->>'drawn')::int);
   if g ? 'target' then
    result:=result||jsonb_build_object('shooter',g->'drawn','target',g->'target','revealAt',g->'revealAt');
   end if;
   return result;
  end if;
  select count(*) into marked from jsonb_object_keys(marks);
  return jsonb_strip_nulls(jsonb_build_object('phase',g->'phase','count',marked,'mine',marks ? seat::text,'opensAt',g->'opensAt','myTarget',targets->(seat::text)));
 end if;
 if action='roulette_ready' and g->>'phase'='prepare' then null;
 elsif action='roulette_press' and g->>'phase'='together' then
  if ms<(g->>'opensAt')::bigint then raise exception 'countdown_running'; end if;
 else raise exception 'unavailable'; end if;
 if opts ? 'target' then
  if jsonb_typeof(opts->'target')<>'number' or (opts->>'target') !~ '^[0-9]{1,2}$' then raise exception 'invalid_target'; end if;
  chosen:=(opts->>'target')::int;
  if chosen=seat or chosen>=n then raise exception 'invalid_target'; end if;
  if targets ? seat::text and (targets->>(seat::text))::int<>chosen then raise exception 'target_locked'; end if;
  targets:=targets||jsonb_build_object(seat::text,chosen);
 end if;
 if marks ? seat::text then return g; end if;
 marks:=marks||jsonb_build_object(seat::text,true);
 select count(*) into marked from jsonb_object_keys(marks);
 if marked<n then return g||jsonb_build_object('marks',marks,'targets',targets); end if;
 if action='roulette_ready' then
  return jsonb_build_object('phase','together','marks','{}'::jsonb,'opensAt',ms+3000,'targets',targets);
 end if;
 shooter:=floor(random()*n)::int;
 result:=jsonb_build_object('phase','done','drawn',shooter);
 -- A legacy shooter's physically indicated target is not known to the server.
 if targets ? shooter::text then
  result:=result||jsonb_build_object('target',targets->(shooter::text),'revealAt',ms+900);
 end if;
 return result;
end;
$$;

-- Old rounds never recorded a target; keep their original host.
do $$
declare
 definition text:=pg_get_functiondef('ojjuda_arcade_internal.drinking_result_seat(text,jsonb,int)'::regprocedure);
 old_branch text:='when ''partyroulette'' then return 0;';
begin
 if strpos(definition,old_branch)=0 then raise exception 'Unexpected roulette host rule'; end if;
 execute replace(definition,old_branch,'when ''partyroulette'' then return coalesce((g->>''target'')::int,0);');
end;
$$;
