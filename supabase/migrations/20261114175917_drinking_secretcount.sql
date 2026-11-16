create function ojjuda_arcade_internal.live_secretcount(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 target int;
 total int;
 used int;
begin
 if action='init' then return jsonb_build_object('phase','setup'); end if;
 if action='tick' then return g; end if;
 if action='view' then
  if g->>'phase'='press' then
   return jsonb_build_object('phase','press','current',g->'current','turn',g->'turn') ||
       case when seat=(g->>'current')::int then jsonb_build_object('used',g->'used') else '{}'::jsonb end;
  end if;
  return g;
 end if;
 if action='sc_start' then
  if seat<>0 then raise exception 'host_only'; end if;
  if g->>'phase'<>'setup' then raise exception 'unavailable'; end if;
  if opts->'target'='null'::jsonb then
   target:=n+1+floor(random()*(8*n))::int;
  elsif jsonb_typeof(opts->'target')='number' and opts->>'target' ~ '^[1-9][0-9]{0,2}$' then
   target:=(opts->>'target')::int;
  end if;
  if target is null or target not between n+1 and n*9 then raise exception 'invalid_target_number'; end if;
  return jsonb_build_object('phase','press','secret',target,'total',0,'used',0,'current',0,'turn',0);
 end if;
 if g->>'phase'<>'press' then raise exception 'unavailable'; end if;
 if seat<>(g->>'current')::int then raise exception 'not_your_turn'; end if;
 if opts->'turn' is distinct from g->'turn' then raise exception 'stale_turn'; end if;
 used:=(g->>'used')::int;
 if action='sc_pass' then
  if used=0 then raise exception 'press_first'; end if;
  return g||jsonb_build_object('used',0,'current',(seat+1)%n,'turn',(g->>'turn')::int+1);
 elsif action='sc_press' then
  if used>=3 then raise exception 'turn_limit'; end if;
  total:=(g->>'total')::int+1;
  if total=(g->>'secret')::int then
   return jsonb_build_object('phase','done','winner',seat,'answer',total);
  end if;
  return g||jsonb_build_object('used',used+1,'total',total);
 end if;
 raise exception 'invalid_action';
end;
$$;
revoke all on function ojjuda_arcade_internal.live_secretcount(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;

alter table ojjuda_arcade_internal.party_vote_rooms drop constraint party_vote_rooms_kind_check,
 add constraint party_vote_rooms_kind_check check (kind in ('mission','minority','bottle','bomb','stopwatch','truth','initial','fingers','imagevote','updown','secretcount'));

do $wire$
declare
 item record;
 definition text;
begin
 for item in select * from (values
   ('ojjuda_arcade_internal.live_game_step(text,jsonb,text,jsonb,int,int,bigint)'::regprocedure,
    '  else raise exception ''invalid_game'';',E'  when ''secretcount'' then return ojjuda_arcade_internal.live_secretcount(g,action,opts,seat,n,ms);\n  else raise exception ''invalid_game'';'),
   ('ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure,
    '''imagevote'',''updown'')','''imagevote'',''updown'',''secretcount'')'),
   ('public.party_live_multiplayer(text,text,text,jsonb)'::regprocedure,
    '''imagevote'',''updown'')','''imagevote'',''updown'',''secretcount'')'),
   ('ojjuda_arcade_internal.drinking_room(text,text,jsonb)'::regprocedure,
    '''imagevote'',''updown'']','''imagevote'',''updown'',''secretcount'']')
 ) edits(proc,old_text,new_text) loop
  definition:=pg_get_functiondef(item.proc);
  if strpos(definition,item.old_text)=0 then raise exception 'Unexpected game registry in %',item.proc; end if;
  execute replace(definition,item.old_text,item.new_text);
 end loop;
end;
$wire$;
