create function ojjuda_arcade_internal.live_updown(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql volatile security invoker set search_path='' as $updown$
declare
 target int;
 guess int;
 next_state jsonb;
begin
 if action='init' then
  return jsonb_build_object('phase','guess','low',1,'high',100,'current',0,'turn',0,
                            'secret',1+floor(random()*100)::int);
 end if;
 if action='tick' then return g; end if;
 if action='view' then return g-'secret'; end if;
 if action is distinct from 'updown_guess' then raise exception 'invalid_action'; end if;
 if g->>'phase'<>'guess' then raise exception 'unavailable'; end if;
 if opts->'turn' is distinct from g->'turn' then raise exception 'stale_turn'; end if;
 if seat<>(g->>'current')::int then raise exception 'not_your_turn'; end if;
 if jsonb_typeof(opts->'guess') is distinct from 'number' or opts->>'guess' !~ '^(100|[1-9][0-9]?)$' then
  raise exception 'invalid_guess';
 end if;
 guess:=(opts->>'guess')::int;
 if guess not between (g->>'low')::int and (g->>'high')::int then raise exception 'invalid_guess'; end if;
 target:=(g->>'secret')::int;
 next_state:=g || jsonb_build_object('lastGuess',guess,'lastSeat',seat,'turn',(g->>'turn')::int+1);
 if guess=target then
  return (next_state-'secret') || jsonb_build_object('phase','done','hint','hit','winner',seat,'answer',guess);
 end if;
 next_state:=next_state || jsonb_build_object('current',(seat+1)%n);
 if guess<target then return next_state || jsonb_build_object('low',guess+1,'hint','up'); end if;
 return next_state || jsonb_build_object('high',guess-1,'hint','down');
end;
$updown$;
revoke all on function ojjuda_arcade_internal.live_updown(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;
alter table ojjuda_arcade_internal.party_vote_rooms
 drop constraint party_vote_rooms_kind_check,
 add constraint party_vote_rooms_kind_check check (kind in ('mission','minority','bottle','bomb','stopwatch','truth','initial','fingers','imagevote','updown'));

-- Extend game selection on the authenticated room path. The general arcade feed has a separate list.
do $connect$
declare
 old_kinds text := $k$('bottle','bomb','stopwatch','truth','initial','fingers','imagevote')$k$;
 new_kinds text := $k$('bottle','bomb','stopwatch','truth','initial','fingers','imagevote','updown')$k$;
 fn record;
 original text;
begin
 for fn in select * from (values
  ('ojjuda_arcade_internal.live_game_step(text,jsonb,text,jsonb,int,int,bigint)'::regprocedure,
   'ee7c42b6b0db0d3dd6332a6d2243597d', '  else raise exception ''invalid_game'';',
   E'  when ''updown'' then return ojjuda_arcade_internal.live_updown(g,action,opts,seat,n,ms);\n  else raise exception ''invalid_game'';'),
  ('ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure,
   'ce06cc2725c8f588ad07335d768efa03','is_live boolean:=p_kind in '||old_kinds,'is_live boolean:=p_kind in '||new_kinds),
  ('public.party_live_multiplayer(text,text,text,jsonb)'::regprocedure,
   '1b59d7b8bab586560d414a13b2d69d73','p_kind not in '||old_kinds,'p_kind not in '||new_kinds)
 ) as edits(proc_id,digest,old_part,new_part) loop
  select pg_get_functiondef(oid) into strict original from pg_proc where oid=fn.proc_id and md5(prosrc)=fn.digest;
  if cardinality(string_to_array(original,fn.old_part))<>2 then raise exception 'room definition changed: %',fn.proc_id; end if;
  execute replace(original,fn.old_part,fn.new_part);
 end loop;
end;
$connect$;
notify pgrst, 'reload schema';
