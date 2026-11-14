-- Native room RPCs store the selected words in the round state. Consult the
-- current catalog only when dealing a new prompt.
create or replace function ojjuda_arcade_internal.drinking_draw_prompt(p_kind text,p_previous text[])
returns text[] language plpgsql volatile security invoker set search_path='' as $draw$
declare
 result text[];
begin
 select case when c.second is null then array[c.body] else array[c.body,c.second] end
 into result
 from ojjuda_arcade_internal.drinking_content_items c
 where c.kind=p_kind and c.active
 order by case when c.body is distinct from p_previous[1] then 0
               when c.second is distinct from p_previous[2] then 1 else 2 end,
          random()
 limit 1;
 if not found then raise exception 'invalid_game'; end if;
 return result;
end;
$draw$;
revoke all on function ojjuda_arcade_internal.drinking_draw_prompt(text,text[]) from public,anon,authenticated;

create or replace function ojjuda_arcade_internal.live_initial(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql volatile set search_path='' as $$
declare
 phase text:=g->>'phase';
 alive int[];
 current_seat int:=(g->>'current')::int;
 cursor_pos int;
 next_seat int;
 turn_no int:=coalesce((g->>'turn')::int,0);
 reason text;
 prompt text;
begin
 if action='init' then
  select array_agg(i order by i) into alive from generate_series(0,n-1) i;
  prompt:=(ojjuda_arcade_internal.drinking_draw_prompt('initial',array[g->>'initial']))[1];
  return jsonb_build_object('phase','ready','initial',prompt,'alive',alive,'current',0,'turn',0);
 elsif action='view' then
  return g;
 elsif action='tick' and (phase<>'active' or ms<(g->>'endsAt')::bigint) then
  return g;
 elsif action='tick' and phase='active' then
  reason:='시간 초과';
 elsif action in ('start','answer','out','next') then
  if opts->'turn' is distinct from g->'turn' then raise exception 'stale_turn'; end if;
  if seat<>current_seat then raise exception 'not_your_turn'; end if;
  if action='start' and phase='ready' then
   return g||jsonb_build_object('phase','active','endsAt',ms+5000);
  elsif action='next' and phase='intermission' then
   return (g-'lastOut'-'reason')||jsonb_build_object('phase','ready');
  elsif phase='active' and action in ('answer','out') then
   if ms>=(g->>'endsAt')::bigint then reason:='시간 초과';
   elsif action='out' then reason:='중복·오답';
   end if;
  else raise exception 'unavailable';
  end if;
 else raise exception 'unavailable';
 end if;
 select array_agg(value::int order by ord) into alive from jsonb_array_elements_text(g->'alive') with ordinality a(value,ord);
 cursor_pos:=array_position(alive,current_seat);
 if reason is null then
  next_seat:=alive[1+cursor_pos%cardinality(alive)];
  return (g-'endsAt')||jsonb_build_object('phase','ready','current',next_seat,'turn',turn_no+1);
 end if;
 alive:=array_remove(alive,current_seat);
 if cardinality(alive)=1 then
  return jsonb_build_object('phase','done','winner',alive[1],'lastOut',current_seat,'reason',reason,'alive',alive,'turn',turn_no+1);
 end if;
 next_seat:=alive[1+(cursor_pos-1)%cardinality(alive)];
 prompt:=(ojjuda_arcade_internal.drinking_draw_prompt('initial',array[g->>'initial']))[1];
 return jsonb_build_object('phase','intermission','initial',prompt,'lastOut',current_seat,'reason',reason,'alive',alive,'current',next_seat,'turn',turn_no+1);
end;
$$;
revoke all on function ojjuda_arcade_internal.live_initial(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;
