-- Computer roulette has one real account and one server-owned virtual seat.
-- Bot bets are immutable per round and never create an auth user or a wallet.
begin;
set local lock_timeout='5s';
alter table ojjuda_roulette_internal.rooms
 add column mode text not null default 'online' check(mode in('online','solo')),
 add column computer_bets jsonb not null default '{}' check(jsonb_typeof(computer_bets)='object');
alter table ojjuda_roulette_internal.rounds
 add column computer_bets jsonb not null default '{}' check(jsonb_typeof(computer_bets)='object');

create function ojjuda_roulette_internal.new_computer_bets()
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare outside_id text;outside_amount integer;dozen_amount integer;
begin
 outside_id:=(array['red','black','odd','even','low','high'])[1+ojjuda_roulette_internal.random_int(6)];
 outside_amount:=(array[100,500,1000])[1+ojjuda_roulette_internal.random_int(3)];
 dozen_amount:=(array[100,500])[1+ojjuda_roulette_internal.random_int(2)];
 return jsonb_build_object(outside_id,outside_amount,
  'dozen'||(1+ojjuda_roulette_internal.random_int(3)),dozen_amount,
  'n'||ojjuda_roulette_internal.random_int(37),100);
end;$$;
revoke all on function ojjuda_roulette_internal.new_computer_bets() from public,anon,authenticated,service_role;

do $computer_mode$
declare definition text;anchor text;addition text;
begin
 definition:=pg_get_functiondef('ojjuda_roulette_internal.action(text,jsonb)'::regprocedure);
 anchor:=$create$ if p_action='create' then
  if v_request is not null then$create$;
 addition:=$create$ if p_action='create' then
  if coalesce(p_payload->>'mode','online') not in('online','solo') then raise exception 'invalid_request';end if;
  if v_request is not null then$create$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette mode create prerequisite changed';end if;
 definition:=replace(definition,anchor,addition);

 anchor:=$capacity$begin v_cap:=coalesce((p_payload->>'capacity')::integer,4);exception$capacity$;
 addition:=$capacity$begin v_cap:=case when p_payload->>'mode'='solo' then 2 else coalesce((p_payload->>'capacity')::integer,4) end;exception$capacity$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette mode capacity prerequisite changed';end if;
 definition:=replace(definition,anchor,addition);

 anchor:=$insert$insert into ojjuda_roulette_internal.rooms(code,host_id,title,capacity,create_request) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),actor,v_title,v_cap,v_request) returning * into r;$insert$;
 addition:=$insert$insert into ojjuda_roulette_internal.rooms(code,host_id,title,capacity,create_request,mode,computer_bets)
    values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),actor,v_title,v_cap,v_request,coalesce(p_payload->>'mode','online'),
     case when p_payload->>'mode'='solo' then ojjuda_roulette_internal.new_computer_bets() else '{}'::jsonb end) returning * into r;$insert$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette mode room insert prerequisite changed';end if;
 definition:=replace(definition,anchor,addition);

 anchor:=$join$ elsif p_action='join' then
  select * into r from ojjuda_roulette_internal.rooms where id=target;$join$;
 addition:=anchor||$private$
  if r.mode='solo' then raise exception 'room_not_found';end if;$private$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette mode join prerequisite changed';end if;
 definition:=replace(definition,anchor,addition);

 anchor:=$list$where a.status='betting' and live.last_seen>ts-interval '2 minutes'$list$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette mode list prerequisite changed';end if;
 definition:=replace(definition,anchor,$list$where a.mode='online' and a.status='betting' and live.last_seen>ts-interval '2 minutes'$list$);

 -- Solo consent seals immediately through the same authoritative escrow/spin
 -- function. Online rooms retain the existing, non-extendable 30-second timer.
 anchor:=$deadline$betting_deadline=coalesce(betting_deadline,ts+interval '30 seconds')$deadline$;
 addition:=$deadline$betting_deadline=case when mode='solo' then ts else coalesce(betting_deadline,ts+interval '30 seconds') end$deadline$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette mode deadline prerequisite changed';end if;
 definition:=replace(definition,anchor,addition);
 execute definition;

 definition:=pg_get_functiondef('ojjuda_roulette_internal.close_betting(uuid,timestamptz)'::regprocedure);
 anchor:=$round$duration,ojjuda_roulette_internal.random_int(1000000)/1000000.0) returning * into s;$round$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette computer round prerequisite changed';end if;
 execute replace(definition,anchor,anchor||$freeze$
 if r.mode='solo' then
  update ojjuda_roulette_internal.rounds set computer_bets=r.computer_bets where id=s.id;
 end if;$freeze$);

 definition:=pg_get_functiondef('ojjuda_roulette_internal.advance(uuid,timestamptz)'::regprocedure);
 anchor:=$next$update ojjuda_roulette_internal.rooms set status='betting',updated_at=p_now where id=r.id;r.status:='betting';$next$;
 addition:=$next$update ojjuda_roulette_internal.rooms set status='betting',updated_at=p_now,
   computer_bets=case when mode='solo' then ojjuda_roulette_internal.new_computer_bets() else computer_bets end
   where id=r.id;r.status:='betting';$next$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette computer next-round prerequisite changed';end if;
 execute replace(definition,anchor,addition);

 definition:=pg_get_functiondef('ojjuda_roulette_internal.snapshot(uuid,uuid,timestamptz)'::regprocedure);
 anchor:='v_wallet jsonb;';
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette computer snapshot variables changed';end if;
 definition:=replace(definition,anchor,'v_wallet jsonb;v_bot_bets jsonb;v_bot_result jsonb;v_bot_stake bigint;');
 anchor:=$human$'userId',q.user_id,'name',q.name$human$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette computer player snapshot changed';end if;
 definition:=replace(definition,anchor,$human$'userId',q.user_id,'name',q.name,'computer',false$human$);
 anchor:=$room$  v_room:=jsonb_build_object('id',r.id$room$;
 addition:=$bot$  if r.mode='solo' then
   v_bot_bets:=case when r.status in('spinning','finished') then s.computer_bets else r.computer_bets end;
   v_bot_stake:=ojjuda_roulette_internal.bet_total(v_bot_bets);
   if r.status='finished' then
    v_bot_result:=ojjuda_roulette_internal.payout(v_bot_bets,s.number);
    v_bot_result:=v_bot_result||jsonb_build_object('stake',v_bot_stake,'net',(v_bot_result->>'total')::bigint-v_bot_stake,'number',s.number,'bets',v_bot_bets);
   end if;
   v_players:=v_players||jsonb_build_array(jsonb_build_object('userId','computer','name','컴퓨터','computer',true,
    'connected',true,'ready',true,'confirmed',true,'bets',v_bot_bets,'stake',v_bot_stake,'result',v_bot_result));
  end if;
  v_room:=jsonb_build_object('id',r.id$bot$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette computer room snapshot changed';end if;
 definition:=replace(definition,anchor,addition);
 anchor:=$mode$'capacity',r.capacity,'hostId',r.host_id$mode$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette mode snapshot changed';end if;
 execute replace(definition,anchor,$mode$'capacity',r.capacity,'mode',r.mode,'hostId',r.host_id$mode$);
end;
$computer_mode$;
notify pgrst,'reload schema';
commit;
