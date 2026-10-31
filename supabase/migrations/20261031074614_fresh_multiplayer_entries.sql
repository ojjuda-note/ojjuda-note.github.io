-- A normal multiplayer exit hands its existing seat to a computer.
-- Keep seat IDs, game snapshots, prior purchases and result ledgers intact.
-- No human left: close unfunded rooms without synthesizing a winner.
-- Poker keeps the current hand escrow until the existing final settlement.

alter table ojjuda_tank_internal.rooms add column computer_seats integer[] not null default '{}', add column rank_excluded integer[] not null default '{}';

alter table ojjuda_marble_internal.rooms add column computer_seats integer[] not null default '{}', add column rank_excluded integer[] not null default '{}';

alter table ojjuda_bang_internal.rooms add column computer_seats integer[] not null default '{}', add column rank_excluded integer[] not null default '{}';

alter table ojjuda_poker_internal.rooms add column computer_seats integer[] not null default '{}', add column rank_excluded integer[] not null default '{}';

do $handoff_tank$
declare
 target regprocedure := 'ojjuda_tank_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)'::regprocedure;
 definition text := pg_get_functiondef(target);
 original text;replacement text;
begin
 original:=$old$where members @> array[p_actor] and status in ('waiting','active') and expires_at>clock_timestamp()$old$;
 replacement:=$new$where members @> array[p_actor] and status in ('waiting','active') and not computer_seats @> array[array_position(members,p_actor)-1] and (status<>'active' or mode<>'online' or coalesce((state->'tanks'->(array_position(members,p_actor)-1)->>'hp')::integer,1)>0) and expires_at>clock_timestamp()$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'tank handoff anchor 1 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$seat:=array_position(r.members,p_actor);$old$;
 replacement:=$new$seat:=array_position(r.members,p_actor);
  if seat is not null and r.computer_seats @> array[seat-1] then
   if p_action='leave' then return jsonb_build_object('room',null,'coins',balance);end if;
   raise exception 'room_unavailable';
  end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'tank handoff anchor 2 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if r.status='active' then raise exception 'use_surrender';end if;$old$;
 replacement:=$new$if r.status='active' then
    update ojjuda_tank_internal.rooms set computer_seats=array_append(r.computer_seats,seat-1),rank_excluded=case when r.rank_excluded @> array[seat-1] or coalesce((r.state->'tanks'->(seat-1)->>'hp')::integer,0)<=0 then r.rank_excluded else array_append(r.rank_excluded,seat-1) end,version=version+1,
     status=case when not exists(select 1 from jsonb_array_elements(r.state->'tanks') with ordinality p(player,n) where (p.player->>'hp')::integer>0 and p.n<>seat and not r.computer_seats @> array[p.n::integer-1]) then 'closed' else 'active' end,
     deadline=case when (r.state->>'turn')::integer=seat-1 then clock_timestamp()+interval '1 second' else r.deadline end
     where id=r.id;
    return jsonb_build_object('room',null,'coins',balance);
   end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'tank handoff anchor 3 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if r.mode<>'solo' or seat<>1 or (r.state->>'turn')::integer=0$old$;
 replacement:=$new$if not ((r.mode='solo' and seat=1 and (r.state->>'turn')::integer<>0) or (r.mode='online' and (r.computer_seats @> array[(r.state->>'turn')::integer] or r.deadline<=clock_timestamp() and (p_next->'event'->>'timeout')::boolean is true)))$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'tank handoff anchor 4 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$90+least(300,coalesce((p_next->>'frames')::integer,0)/60)$old$;
 replacement:=$new$(case when r.computer_seats @> array[(p_next->'state'->>'turn')::integer] then 1 else 90 end)+least(300,coalesce((p_next->>'frames')::integer,0)/60)$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'tank handoff anchor 5 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$where (t.tank->>'hp')::integer>0 and r.members[t.seat::integer] is not null$old$;
 replacement:=$new$where (t.tank->>'hp')::integer>0 and r.members[t.seat::integer] is not null and not r.rank_excluded @> array[t.seat::integer-1]$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'tank handoff anchor 6 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$    price:=0;$old$;
 replacement:=$new$    if r.mode='online' and (p_next->'event'->>'computer')::boolean is true and not r.rank_excluded @> array[(r.state->>'turn')::integer] then
     r.rank_excluded:=array_append(r.rank_excluded,(r.state->>'turn')::integer);
    end if;
    price:=0;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'tank handoff anchor 7 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$update ojjuda_tank_internal.rooms set state=p_next->'state',version=version+1,$old$;
 replacement:=$new$update ojjuda_tank_internal.rooms set state=p_next->'state',rank_excluded=r.rank_excluded,version=version+1,$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'tank handoff anchor 8 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if found then return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1$old$;
 replacement:=$new$if found then if r.status='closed' or r.computer_seats @> array[array_position(r.members,p_actor)-1] then raise exception 'room_unavailable';end if;return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'tank handoff anchor 9 changed';end if;
 definition:=replace(definition,original,replacement);
 execute definition;
end;$handoff_tank$;

do $handoff_marble$
declare
 target regprocedure := 'ojjuda_marble_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)'::regprocedure;
 definition text := pg_get_functiondef(target);
 original text;replacement text;
begin
 original:=$old$where members @> array[p_actor] and status in ('waiting','active') and expires_at>clock_timestamp()$old$;
 replacement:=$new$where members @> array[p_actor] and status in ('waiting','active') and not computer_seats @> array[array_position(members,p_actor)-1] and (status<>'active' or not coalesce((state->'players'->(array_position(members,p_actor)-1)->>'bankrupt')::boolean,false)) and expires_at>clock_timestamp()$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'marble handoff anchor 1 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$seat:=array_position(r.members,p_actor);$old$;
 replacement:=$new$seat:=array_position(r.members,p_actor);
  if seat is not null and r.computer_seats @> array[seat-1] then
   if p_action='leave' then return jsonb_build_object('room',null);end if;
   raise exception 'room_unavailable';
  end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'marble handoff anchor 2 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if r.status='active' then raise exception 'use_surrender';end if;$old$;
 replacement:=$new$if r.status='active' then
    update ojjuda_marble_internal.rooms set computer_seats=array_append(r.computer_seats,seat-1),rank_excluded=case when r.rank_excluded @> array[seat-1] or coalesce((r.state->'players'->(seat-1)->>'bankrupt')::boolean,true) then r.rank_excluded else array_append(r.rank_excluded,seat-1) end,version=version+1,
     status=case when not exists(select 1 from jsonb_array_elements(r.state->'players') with ordinality p(player,n) where not (p.player->>'bankrupt')::boolean and p.n<>seat and not r.computer_seats @> array[p.n::integer-1]) then 'closed' else 'active' end,
     deadline=case when (r.state->>'turn')::integer=seat-1 then clock_timestamp()+interval '1 second' else r.deadline end
     where id=r.id;
    return jsonb_build_object('room',null);
   end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'marble handoff anchor 3 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$deadline=clock_timestamp()+interval '45 seconds'$old$;
 replacement:=$new$deadline=clock_timestamp()+case when r.computer_seats @> array[(p_next->'state'->>'turn')::integer] then interval '1 second' else interval '45 seconds' end$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'marble handoff anchor 4 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if exists(select 1 from public.profiles where id=r.members[n]) and not public.is_banned(r.members[n]) then$old$;
 replacement:=$new$if not r.rank_excluded @> array[n-1] and exists(select 1 from public.profiles where id=r.members[n]) and not public.is_banned(r.members[n]) then$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'marble handoff anchor 5 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$    update ojjuda_marble_internal.rooms set state=p_next->'state',version=version+1,$old$;
 replacement:=$new$    if p_next ? 'automaticSeat' then
     if p_action<>'commit' or (p_next->>'automaticSeat')::integer is distinct from (r.state->>'turn')::integer or r.deadline>clock_timestamp() then raise exception 'invalid_state';end if;
     if not r.rank_excluded @> array[(r.state->>'turn')::integer] then r.rank_excluded:=array_append(r.rank_excluded,(r.state->>'turn')::integer);end if;
    end if;
    update ojjuda_marble_internal.rooms set state=p_next->'state',rank_excluded=r.rank_excluded,version=version+1,$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'marble handoff anchor 6 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if found then return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1$old$;
 replacement:=$new$if found then if r.status='closed' or r.computer_seats @> array[array_position(r.members,p_actor)-1] then raise exception 'room_unavailable';end if;return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'marble handoff anchor 7 changed';end if;
 definition:=replace(definition,original,replacement);
 execute definition;
end;$handoff_marble$;

do $handoff_bang$
declare
 target regprocedure := 'public.bang_online_service(uuid,text,uuid,text,uuid,jsonb,integer,jsonb)'::regprocedure;
 definition text := pg_get_functiondef(target);
 original text;replacement text;
begin
 original:=$old$and not coalesce((x.state->'forfeited') @> jsonb_build_array(array_position(x.members,p_actor)-1),false)$old$;
 replacement:=$new$and not x.computer_seats @> array[array_position(x.members,p_actor)-1] and (x.status<>'active' or x.mode='solo' or coalesce((x.state->'players'->(array_position(x.members,p_actor)-1)->>'alive')::boolean,true)) and not coalesce((x.state->'forfeited') @> jsonb_build_array(array_position(x.members,p_actor)-1),false)$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>2 then raise exception 'bang handoff anchor 1 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$v_seat:=array_position(r.members,p_actor)-1;$old$;
 replacement:=$new$v_seat:=array_position(r.members,p_actor)-1;
 if v_seat is not null and r.computer_seats @> array[v_seat] then
  if p_action='leave' then return jsonb_build_object('room',null);end if;
  raise exception 'room_unavailable';
 end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'bang handoff anchor 2 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if r.status='active' then raise exception 'use_surrender';end if;$old$;
 replacement:=$new$if r.status='active' then
   if r.mode='solo' and coalesce((r.state->'players'->v_seat->>'alive')::boolean,true) and not coalesce((r.state->'forfeited') @> jsonb_build_array(v_seat),false) then raise exception 'use_surrender';end if;
   update ojjuda_bang_internal.rooms set computer_seats=array_append(r.computer_seats,v_seat),rank_excluded=case when r.rank_excluded @> array[v_seat] or not coalesce((r.state->'players'->v_seat->>'alive')::boolean,false) then r.rank_excluded else array_append(r.rank_excluded,v_seat) end,version=version+1,
    status=case when r.mode='solo' or not exists(select 1 from jsonb_array_elements(r.state->'players') with ordinality p(player,n) where (p.player->>'alive')::boolean and p.n<>v_seat+1 and not r.computer_seats @> array[p.n::integer-1]) then 'closed' else 'active' end,
    deadline=case when coalesce((r.state->'pending'->>'player')::integer,(r.state->>'current')::integer)=v_seat then v_now+interval '1 second' else r.deadline end
    where id=r.id;
   return jsonb_build_object('room',null);
  end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'bang handoff anchor 3 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$deadline=v_now+interval '45 seconds'$old$;
 replacement:=$new$deadline=v_now+case when r.computer_seats @> array[coalesce((v_state->'pending'->>'player')::integer,(v_state->>'current')::integer)] then interval '1 second' else interval '45 seconds' end$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'bang handoff anchor 4 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if v_forfeit or v_winner is not null then$old$;
 replacement:=$new$if not r.rank_excluded @> array[i] and (v_forfeit or v_winner is not null) then$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'bang handoff anchor 5 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$ update ojjuda_bang_internal.rooms set state=v_state,status=$old$;
 replacement:=$new$ if r.mode='multiplayer' and p_next ? 'automaticSeat' then
  if p_action<>'commit' or (p_next->>'automaticSeat')::integer is distinct from coalesce((r.state->'pending'->>'player')::integer,(r.state->>'current')::integer) or r.deadline>v_now then raise exception 'invalid_request';end if;
  if not r.rank_excluded @> array[(p_next->>'automaticSeat')::integer] then r.rank_excluded:=array_append(r.rank_excluded,(p_next->>'automaticSeat')::integer);end if;
 end if;
 update ojjuda_bang_internal.rooms set state=v_state,rank_excluded=r.rank_excluded,status=$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'bang handoff anchor 6 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if found then return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1$old$;
 replacement:=$new$if found then if r.status='closed' or r.computer_seats @> array[array_position(r.members,p_actor)-1] then raise exception 'room_unavailable';end if;return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'bang handoff anchor 7 changed';end if;
 definition:=replace(definition,original,replacement);
 execute definition;
end;$handoff_bang$;

do $handoff_poker$
declare
 target regprocedure := 'ojjuda_poker_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)'::regprocedure;
 definition text := pg_get_functiondef(target);
 original text;replacement text;
begin
 original:=$old$else r.departed[seat]:=true;if not (false=any(r.departed)) then r.status:='closed';end if;$old$;
 replacement:=$new$else
      if r.mode='online' and r.status='active' then r.computer_seats:=array_append(r.computer_seats,seat-1);if not coalesce((r.state->'players'->(seat-1)->>'folded')::boolean,false) and not r.rank_excluded @> array[seat-1] then r.rank_excluded:=array_append(r.rank_excluded,seat-1);end if;end if;
      r.departed[seat]:=true;if not (false=any(r.departed)) then r.status:='closed';end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'poker handoff anchor 1 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$departed=r.departed,ready=r.ready,deadline=r.deadline$old$;
 replacement:=$new$departed=r.departed,computer_seats=r.computer_seats,rank_excluded=r.rank_excluded,ready=r.ready,deadline=r.deadline$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'poker handoff anchor 2 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$rounds=rounds+1,wins=wins+case when (r.state->'result'->'net'->>(n-1))::bigint>0 then 1 else 0 end,updated_at=clock_timestamp() where user_id=r.members[n];$old$;
 replacement:=$new$rounds=rounds+case when r.rank_excluded @> array[n-1] then 0 else 1 end,
         wins=wins+case when not r.rank_excluded @> array[n-1] and (r.state->'result'->'net'->>(n-1))::bigint>0 then 1 else 0 end,
         updated_at=clock_timestamp() where user_id=r.members[n];$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'poker handoff anchor 3 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$elsif p_action='leave' then
       remaining:$old$;
 replacement:=$new$elsif p_action='leave' and (r.mode='solo' or (r.state->'players'->(seat-1)->>'folded')::boolean) then
       remaining:$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'poker handoff anchor 4 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$r.deadline:=clock_timestamp()+make_interval(secs=>case when phase in ('between','runout') then 0.65 when r.mode='solo' and (r.state->>'turn')::integer>0 then 0.45 else 30 end);$old$;
 replacement:=$new$if p_action<>'leave' or r.mode='solo' or r.computer_seats @> array[(r.state->>'turn')::integer] then
      r.deadline:=clock_timestamp()+make_interval(secs=>case when phase in ('between','runout') then 0.65 when r.computer_seats @> array[(r.state->>'turn')::integer] or r.mode='solo' and (r.state->>'turn')::integer>0 then 0.45 else 30 end);
     end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'poker handoff anchor 5 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$     r.state:=p_next->'state';phase:=r.state->>'phase';$old$;
 replacement:=$new$     if r.mode='online' and p_next ? 'automaticSeat' then
      if p_action<>'commit' or p_next->>'kind'<>'timeout' or (p_next->>'automaticSeat')::integer is distinct from (r.state->>'turn')::integer or r.deadline>clock_timestamp() then raise exception 'invalid_request';end if;
      if not r.rank_excluded @> array[(p_next->>'automaticSeat')::integer] then r.rank_excluded:=array_append(r.rank_excluded,(p_next->>'automaticSeat')::integer);end if;
     end if;
     if p_action in ('start','ready') then r.rank_excluded:='{}';end if;
     r.state:=p_next->'state';phase:=r.state->>'phase';$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'poker handoff anchor 6 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if found then return ojjuda_poker_internal.room_result(p_actor,r.id);end if;$old$;
 replacement:=$new$if found then if r.status='closed' or r.departed[array_position(r.members,p_actor)] then raise exception 'room_unavailable';end if;return ojjuda_poker_internal.room_result(p_actor,r.id);end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'poker handoff anchor 7 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if p_action='mine' then return ojjuda_poker_internal.room_result(p_actor,existing);end if;$old$;
 replacement:=$new$if p_action='mine' then
   -- Trusted Edge-only data: a departed account can drive an expired decision
   -- in its own still-funded hand, but never receives the old room publicly.
   return ojjuda_poker_internal.room_result(p_actor,existing)||jsonb_build_object('settlement',case when existing is null then
    (select to_jsonb(pending) from ojjuda_poker_internal.wallets locked
     join ojjuda_poker_internal.rooms pending on pending.id=locked.active_room
     where locked.user_id=p_actor and pending.status='active' and pending.funded and pending.settled_round<pending.round
      and pending.departed[array_position(pending.members,p_actor)] is true) else null end);
  end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'poker handoff anchor 8 changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if seat is not null and r.departed[seat] then raise exception 'room_unavailable';end if;$old$;
 replacement:=$new$if seat is not null and r.departed[seat] and
   (p_action='commit' and p_next->>'kind'='timeout' and r.status='active' and r.funded and r.deadline<=clock_timestamp()
    and exists(select 1 from ojjuda_poker_internal.wallets locked where locked.user_id=p_actor and locked.active_room=r.id)) is not true
   then raise exception 'room_unavailable';end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'poker handoff anchor 9 changed';end if;
 definition:=replace(definition,original,replacement);
 execute definition;
end;$handoff_poker$;

do $handoff_ranking_capture$
declare
 target regprocedure := 'ojjuda_game_internal.capture_ranked_round()'::regprocedure;
 definition text := pg_get_functiondef(target);
 original text;replacement text;
begin
 original:=$old$for n in 1..cardinality(new.members) loop$old$;
 replacement:=$new$for n in 1..cardinality(new.members) loop
    if new.rank_excluded @> array[n-1] then continue;end if;$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>3 then raise exception 'ranking_capture handoff anchor 1 changed';end if;
 definition:=replace(definition,original,replacement);
 execute definition;
end;$handoff_ranking_capture$;

do $handoff_bang_hint$
declare
 target regprocedure := 'ojjuda_shop_internal.bang_hint_buy(uuid,uuid,integer,boolean)'::regprocedure;
 definition text := pg_get_functiondef(target);
 original text;replacement text;
begin
 original:=$old$if not found or v_seat is null or v_room.status<>'active'$old$;
 replacement:=$new$if not found or v_seat is null or v_room.computer_seats @> array[v_seat] or v_room.status<>'active'$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'bang_hint handoff anchor 1 changed';end if;
 definition:=replace(definition,original,replacement);
 execute definition;
end;$handoff_bang_hint$;
