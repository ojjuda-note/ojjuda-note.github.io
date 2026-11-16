-- Keep the seat index stable for old clients and track the lap separately.
do $migration$
declare
  engine text:=pg_get_functiondef('ojjuda_arcade_internal.live_truth(jsonb,text,jsonb,integer,integer,bigint)'::regprocedure);
  room_fn text:=pg_get_functiondef('ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure);
  edit record;
  old_guard text:=$old$p_options->'turn'=r.game_state->'turn' and ((p_action='truth_pick'$old$;
  new_guard text:=$new$p_options->'turn'=r.game_state->'turn'
        and coalesce(p_options->'lap','1'::jsonb)=coalesce(r.game_state->'lap','1'::jsonb)
        and ((p_action='truth_pick'$new$;
begin
  for edit in select * from (values
    ($old$ phase text:=g->>'phase'; player int:=$old$,
     $new$ lap int:=coalesce((g->>'lap')::int,1);
 phase text:=g->>'phase'; player int:=$new$),
    ($old$'phase',phase,'turn',player,'question'$old$,
     $new$'phase',phase,'turn',player,'lap',case when phase in ('pick','answer') then lap else (g->>'lap')::int end,'question'$new$),
    ($old$'phase','pick','turn',0,'deck',merged$old$,
     $new$'phase','pick','turn',0,'lap',1,'deck',merged$new$),
    ($old$ if seat is distinct from player then raise exception 'not_your_turn'; end if;$old$,
     $new$ if seat is distinct from player then raise exception 'not_your_turn'; end if;
 if opts ? 'lap' and opts->'lap' is distinct from to_jsonb(lap) then raise exception 'stale_turn'; end if;$new$),
    ($old$  if player+1>=n then return jsonb_build_object('phase','done'); end if;
  return (g-'question'-'flavor')||jsonb_build_object('phase','pick','turn',player+1,'spicySide',floor(random()*2)::int);$old$,
     $new$  player:=player+1;
  if player>=n then
   if lap=3 then return jsonb_build_object('phase','done','lap',lap); end if;
   player:=0;
   lap:=lap+1;
  end if;
  return (g-'question'-'flavor')||jsonb_build_object('phase','pick','turn',player,'lap',lap,'spicySide',floor(random()*2)::int);$new$)
  ) as edits(old_text,new_text) loop
    if cardinality(string_to_array(engine,edit.old_text))<>2 then raise exception 'unexpected truth game definition'; end if;
    engine:=replace(engine,edit.old_text,edit.new_text);
  end loop;
  if cardinality(string_to_array(room_fn,old_guard))<>2 then raise exception 'unexpected truth concurrency check'; end if;
  execute engine;
  execute replace(room_fn,old_guard,new_guard);
end
$migration$;
