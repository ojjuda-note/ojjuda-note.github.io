-- First start opens a fixed 30-second betting window. Every participant's
-- server-held draft is frozen once, either by unanimous consent or expiry.
begin;
set local lock_timeout='5s';
alter table ojjuda_roulette_internal.rooms add column betting_deadline timestamptz;
alter table ojjuda_roulette_internal.entries drop constraint entries_stake_check;
alter table ojjuda_roulette_internal.entries add constraint entries_stake_check check(stake between 0 and 50000);

create function ojjuda_roulette_internal.close_betting(p_room uuid,p_now timestamptz)
returns boolean language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare r ojjuda_roulette_internal.rooms%rowtype;s ojjuda_roulette_internal.rounds%rowtype;
 q record;count_players integer;all_ready boolean;total_stake bigint;amount bigint;
 last_duration integer;duration integer;result jsonb;
begin
 select * into r from ojjuda_roulette_internal.rooms where id=p_room for update;
 if not found or r.status<>'betting' or r.betting_deadline is null then return false;end if;
 select count(*)::integer,coalesce(bool_and(ready),false) into count_players,all_ready
  from ojjuda_roulette_internal.players where room_id=p_room and active;
 if count_players=0 then
  update ojjuda_roulette_internal.rooms set status='closed',betting_deadline=null,updated_at=p_now where id=p_room;return false;
 end if;
 if p_now<r.betting_deadline and (count_players<2 or not all_ready) then return false;end if;

 -- A revoked member must not make other members' read/leave requests fail.
 -- Drop the ineligible seat and return its reserved gold before reevaluating.
 for q in select user_id from ojjuda_roulette_internal.players where room_id=p_room and active order by user_id loop
  begin
   perform ojjuda_roulette_internal.check_member(q.user_id);
  exception when raise_exception then
   if sqlerrm in('not_signed_in','banned','member_identity_required','adult_required','no_account') then
    perform ojjuda_roulette_internal.depart(p_room,q.user_id,p_now);
   else raise;end if;
  end;
 end loop;
 select count(*)::integer,coalesce(bool_and(ready),false) into count_players,all_ready
  from ojjuda_roulette_internal.players where room_id=p_room and active;
 if count_players=0 then
  update ojjuda_roulette_internal.rooms set status='closed',betting_deadline=null,updated_at=p_now where id=p_room;return false;
 end if;
 if p_now<r.betting_deadline and (count_players<2 or not all_ready) then return false;end if;

 -- Ready stakes are already reserved. At timeout only unready drafts need a
 -- debit; zero-bet viewers receive a zero-stake receipt and the same spin.
 perform 1 from ojjuda_roulette_internal.wallets w join ojjuda_roulette_internal.players p on p.user_id=w.user_id
  where p.room_id=p_room and p.active order by w.user_id for update of w;
 for q in select * from ojjuda_roulette_internal.players where room_id=p_room and active order by user_id loop
  if not q.ready then
   amount:=case when q.bets='{}'::jsonb then 0 else ojjuda_roulette_internal.bet_total(q.bets) end;
   update ojjuda_roulette_internal.wallets set gold=gold-amount,updated_at=p_now where user_id=q.user_id and gold>=amount;
   if not found then
    -- A changed/insufficient balance never overdrafts or blocks the room.
    amount:=0;q.bets:='{}'::jsonb;
   end if;
   update ojjuda_roulette_internal.players set ready=true,bets=q.bets,stake=amount,confirmed=false where room_id=p_room and user_id=q.user_id;
  end if;
 end loop;
 select coalesce(sum(stake),0) into total_stake from ojjuda_roulette_internal.players where room_id=p_room and active;
 if total_stake=0 then
  update ojjuda_roulette_internal.players set ready=false,confirmed=false,bets='{}',stake=0 where room_id=p_room and active;
  update ojjuda_roulette_internal.rooms set betting_deadline=null,updated_at=p_now where id=p_room;return false;
 end if;

 select duration_ms into last_duration from ojjuda_roulette_internal.rounds where room_id=p_room and round_no=r.round_no;
 loop duration:=20000+ojjuda_roulette_internal.random_int(10001);exit when duration is distinct from last_duration;end loop;
 insert into ojjuda_roulette_internal.rounds(room_id,round_no,number,started_at,duration_ms,variation)
  values(p_room,r.round_no+1,ojjuda_roulette_internal.random_int(37),case when p_now>=r.betting_deadline then r.betting_deadline else p_now end,duration,ojjuda_roulette_internal.random_int(1000000)/1000000.0) returning * into s;
 for q in select * from ojjuda_roulette_internal.players where room_id=p_room and active order by user_id loop
  result:=ojjuda_roulette_internal.payout(q.bets,s.number);
  insert into ojjuda_roulette_internal.entries(round_id,room_id,user_id,bets,stake,gross,fee,payout,net)
   values(s.id,p_room,q.user_id,q.bets,q.stake,(result->>'gross')::bigint,(result->>'fee')::bigint,(result->>'total')::bigint,(result->>'total')::bigint-q.stake);
 end loop;
 update ojjuda_roulette_internal.rooms set status='spinning',round_no=r.round_no+1,betting_deadline=null,updated_at=p_now where id=p_room;
 return true;
end;$$;
revoke all on function ojjuda_roulette_internal.close_betting(uuid,timestamptz) from public,anon,authenticated,service_role;

do $countdown$
declare definition text;updated text;start_at integer;end_at integer;anchor text;ending text;
begin
 definition:=pg_get_functiondef('ojjuda_roulette_internal.action(text,jsonb)'::regprocedure);
 anchor:=$start$    if v_ready and (select count(*) from ojjuda_roulette_internal.players where room_id=target and active)>=2$start$;
 ending:=$end$    end if;
   end if;
  elsif p_action='confirm' then$end$;
 if cardinality(string_to_array(definition,anchor))<>2 or cardinality(string_to_array(definition,ending))<>2 then
  raise exception 'roulette ready start prerequisite changed';end if;
 start_at:=strpos(definition,anchor);end_at:=strpos(definition,ending);
 if end_at<=start_at then raise exception 'roulette start block boundary changed';end if;
 updated:=substr(definition,1,start_at-1)||$replacement$    if v_ready then
     update ojjuda_roulette_internal.rooms set betting_deadline=coalesce(betting_deadline,ts+interval '30 seconds'),updated_at=ts where id=target;
    end if;
    perform ojjuda_roulette_internal.close_betting(target,ts);
$replacement$||substr(definition,end_at+length('    end if;'||chr(10)));
 anchor:='v_total:=case when v_ready then ojjuda_roulette_internal.bet_total(v_bets) else 0 end;';
 if cardinality(string_to_array(updated,anchor))<>2 then raise exception 'roulette ready escrow prerequisite changed';end if;
 updated:=replace(updated,anchor,$escrow$v_total:=case when v_ready and v_bets<>'{}'::jsonb then ojjuda_roulette_internal.bet_total(v_bets) else 0 end;
    if v_ready and v_total=0 and r.betting_deadline is null then raise exception 'invalid_bet';end if;$escrow$);
 execute updated;

 definition:=pg_get_functiondef('ojjuda_roulette_internal.advance(uuid,timestamptz)'::regprocedure);
 anchor:=$before_timeout$ if not found or r.status='closed' then return;end if;$before_timeout$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette timeout prerequisite changed';end if;
 definition:=replace(definition,anchor,anchor||$expired$
 if r.status='betting' and r.betting_deadline is not null and r.betting_deadline<=p_now then
  perform ojjuda_roulette_internal.close_betting(r.id,p_now);
  select * into r from ojjuda_roulette_internal.rooms where id=p_room;
 end if;$expired$);
 anchor:=$advance$ if r.status='betting' and not exists(select 1 from ojjuda_roulette_internal.players where room_id=r.id and active) then
  update ojjuda_roulette_internal.rooms set status='closed',updated_at=p_now where id=r.id;
 end if;$advance$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette advance prerequisite changed';end if;
 execute replace(definition,anchor,anchor||chr(10)||' perform ojjuda_roulette_internal.close_betting(r.id,p_now);');

 definition:=pg_get_functiondef('ojjuda_roulette_internal.snapshot(uuid,uuid,timestamptz)'::regprocedure);
 anchor:='''status'',r.status,''round'',r.round_no';
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette snapshot prerequisite changed';end if;
 execute replace(definition,anchor,'''status'',r.status,''bettingDeadline'',case when r.betting_deadline is null then null else floor(extract(epoch from r.betting_deadline)*1000)::bigint end,''round'',r.round_no');
end;
$countdown$;
notify pgrst,'reload schema';
commit;
