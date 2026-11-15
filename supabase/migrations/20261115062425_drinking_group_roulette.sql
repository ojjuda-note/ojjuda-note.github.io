create function ojjuda_arcade_internal.live_partyroulette(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare marks jsonb; marked int;
begin
 if action='init' then return jsonb_build_object('phase','prepare','marks','{}'::jsonb); end if;
 if action='tick' then return g; end if;
 marks:=g->'marks';
 if action='view' and g->>'phase'='done' then
  return jsonb_build_object('phase','done','fired',seat=(g->>'drawn')::int);
 end if;
 if action='view' then
  select count(*) into marked from jsonb_object_keys(marks);
  return jsonb_strip_nulls(jsonb_build_object('phase',g->'phase','count',marked,'mine',marks ? seat::text,'opensAt',g->'opensAt'));
 end if;
 if action='roulette_ready' and g->>'phase'='prepare' then null;
 elsif action='roulette_press' and g->>'phase'='together' then
  if ms<(g->>'opensAt')::bigint then raise exception 'countdown_running'; end if;
 else raise exception 'unavailable'; end if;
 if marks ? seat::text then return g; end if;
 marks:=marks||jsonb_build_object(seat::text,true);
 select count(*) into marked from jsonb_object_keys(marks);
 if marked<n then return g||jsonb_build_object('marks',marks); end if;
 if action='roulette_ready' then
  return jsonb_build_object('phase','together','marks','{}'::jsonb,'opensAt',ms+3000);
 end if;
 return jsonb_build_object('phase','done','drawn',floor(random()*n)::int);
end;
$$;
revoke all on function ojjuda_arcade_internal.live_partyroulette(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;

alter table ojjuda_arcade_internal.party_vote_rooms drop constraint party_vote_rooms_kind_check,
 add constraint party_vote_rooms_kind_check check (kind in ('mission','minority','bottle','bomb','stopwatch','truth','initial','fingers','imagevote','updown','secretcount','partyroulette'));

do $wire$
declare item record; definition text;
 parent_engine regprocedure:=coalesce(to_regprocedure('ojjuda_arcade_internal.drinking_room_dispatch(text,text,jsonb,uuid)'),
                                    'ojjuda_arcade_internal.drinking_room(text,text,jsonb)'::regprocedure);
begin
 for item in select * from (values
  ('ojjuda_arcade_internal.live_game_step(text,jsonb,text,jsonb,int,int,bigint)'::regprocedure,
   '  else raise exception ''invalid_game'';',E'  when ''partyroulette'' then return ojjuda_arcade_internal.live_partyroulette(g,action,opts,seat,n,ms);\n  else raise exception ''invalid_game'';'),
  (parent_engine,'''updown'',''secretcount'']','''updown'',''secretcount'',''partyroulette'']'),
  ('public.party_live_multiplayer(text,text,text,jsonb)'::regprocedure,'''updown'',''secretcount'')','''updown'',''secretcount'',''partyroulette'')'),
  ('ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure,'''updown'',''secretcount'')','''updown'',''secretcount'',''partyroulette'')'),
  ('ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure,
   '(p_kind=''stopwatch'' and p_action=''watch_score''', '(p_kind=''partyroulette'' and ((p_action=''roulette_ready'' and r.phase=''prepare'') or (p_action=''roulette_press'' and r.phase=''together''))) or (p_kind=''stopwatch'' and p_action=''watch_score'''),
  ('ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure,
   '''players'',r.names,''me'',me,','''players'',case when p_kind=''partyroulette'' and p_action<>''hub_bootstrap'' then array(select i::text||''번'' from generate_series(1,cardinality(r.members)) i) else r.names end,''me'',me,'),
  ('ojjuda_arcade_internal.drinking_result_seat(text,jsonb,int)'::regprocedure,
   'when ''truth'' then null;', 'when ''partyroulette'' then return 0; when ''truth'' then null;')
 ) edits(proc,old_text,new_text) loop
  definition:=pg_get_functiondef(item.proc);
  if strpos(definition,item.old_text)=0 then raise exception 'Unexpected roulette registry in %',item.proc; end if;
  execute replace(definition,item.old_text,item.new_text);
 end loop;
end;
$wire$;
