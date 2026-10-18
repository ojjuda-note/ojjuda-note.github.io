-- Same-device matches have one authenticated owner controlling every human seat.
-- They stay private, have no turn timer or computer moves, and do not award ranked wins.
-- All paid shells still debit the owner's wallet atomically through the existing service.
alter table ojjuda_tank_internal.rooms drop constraint rooms_mode_check;
alter table ojjuda_tank_internal.rooms add constraint rooms_mode_check check(mode in ('online','solo','local'));

create or replace function ojjuda_tank_internal.room_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_request uuid default null,p_expected integer default null,p_options jsonb default '{}',p_next jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r ojjuda_tank_internal.rooms%rowtype; existing uuid; seat integer; nick text; cap integer;  title_value text; balance integer; price integer; weapon integer; n integer;
begin
 if p_actor is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=p_actor and not coalesce(u.is_anonymous,false)) then raise exception 'not_signed_in';end if;
 if public.is_banned(p_actor) then raise exception 'banned';end if;
 if p_action is null or p_action not in ('list','mine','create','join','read','start','commit','leave') then raise exception 'invalid_action';end if;
 if jsonb_typeof(p_options) is distinct from 'object' or octet_length(p_options::text)>1024 then raise exception 'invalid_options';end if;

 select coins into balance from public.user_private where user_id=p_actor;
 if p_action='list' then
  return jsonb_build_object('coins',balance,'rooms',coalesce((select jsonb_agg(card) from (
   select jsonb_build_object('code',q.code,'title',q.title,'players',cardinality(q.members),'capacity',q.capacity) card
   from ojjuda_tank_internal.rooms q where q.mode='online' and q.status='waiting' and q.expires_at>clock_timestamp()
   and not exists(select 1 from unnest(q.members) m where public.blocked_between(p_actor,m) or public.is_banned(m))
   order by q.created_at desc limit 30) available),'[]'::jsonb));
 end if;
 -- Serialize membership changes per person and game changes per room, never network calls.
 if p_action in ('mine','create','join') then
  perform pg_advisory_xact_lock(hashtextextended('tank:'||p_actor::text,0));
  select id into existing from ojjuda_tank_internal.rooms where members @> array[p_actor] and status in ('waiting','active') and expires_at>clock_timestamp() order by created_at desc limit 1;
  if p_action='mine' then
   if existing is null then return jsonb_build_object('room',null,'coins',balance);end if;
   select * into r from ojjuda_tank_internal.rooms where id=existing;
   return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1,'coins',balance);
  end if;
 end if;
 if p_action='create' then
  if p_request is null then raise exception 'invalid_request';end if;
  select * into r from ojjuda_tank_internal.rooms where host_id=p_actor and create_request=p_request;
  if found then return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1,'coins',balance);end if;
  if existing is not null then raise exception 'room_in_progress';end if;
  if (select count(*) from ojjuda_tank_internal.rooms where host_id=p_actor and created_at>clock_timestamp()-interval '1 minute')>=5 then raise exception 'room_rate_limit';end if;
  cap:=coalesce((p_options->>'capacity')::integer,4);
  title_value:=btrim(coalesce(p_options->>'title','탱크게임 같이 해요'));
  if coalesce(p_options->>'mode','online') not in ('online','solo','local') or cap not between 2 and 12 or char_length(title_value) not between 1 and 40 then raise exception 'invalid_options';end if;
  select left(regexp_replace(coalesce(nullif(btrim(nickname),''),'회원'),'[[:cntrl:]<>]','','g'),12) into nick from public.profiles where id=p_actor;
  for n in 1..5 loop
   begin
    insert into ojjuda_tank_internal.rooms(code,host_id,members,names,title,capacity,create_request,mode)
     values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),p_actor,array[p_actor],array[nick],title_value,cap,p_request,coalesce(p_options->>'mode','online')) returning * into r;
    exit;
   exception when unique_violation then if n=5 then raise;end if;
   end;
  end loop;
 else
  if p_action='join' then
   select * into r from ojjuda_tank_internal.rooms where code=upper(p_code) for update;
  else
   select * into r from ojjuda_tank_internal.rooms where id=p_room and members @> array[p_actor] for update;
  end if;
  if r.id is null then raise exception 'room_not_found';end if;
  if r.expires_at<=clock_timestamp() or r.status='closed' then raise exception 'room_unavailable';end if;
  seat:=array_position(r.members,p_actor);
  if p_action='join' and seat is null then
   if r.mode<>'online' then raise exception 'room_not_found';end if;
   if existing is not null then raise exception 'room_in_progress';end if;
   if r.status<>'waiting' then raise exception 'room_already_started';end if;
   if cardinality(r.members)>=r.capacity then raise exception 'room_full';end if;
   if exists(select 1 from unnest(r.members) m where public.blocked_between(p_actor,m) or public.is_banned(m)) then raise exception 'room_unavailable';end if;
   select left(regexp_replace(coalesce(nullif(btrim(nickname),''),'회원'),'[[:cntrl:]<>]','','g'),12) into nick from public.profiles where id=p_actor;
   update ojjuda_tank_internal.rooms set members=array_append(members,p_actor),names=array_append(names,nick),version=version+1 where id=r.id returning * into r;
  elsif p_action='leave' then
   if r.mode<>'online' then
    update ojjuda_tank_internal.rooms set status='closed',version=version+1 where id=r.id;
    return jsonb_build_object('room',null,'coins',balance);
   end if;
   if r.status='active' then raise exception 'use_surrender';end if;
   if r.status='waiting' then
    r.members:=array_remove(r.members,p_actor);
    r.names:=array(select name from unnest(r.names) with ordinality as x(name,idx) where idx<>seat order by idx);
    update ojjuda_tank_internal.rooms set members=r.members,names=r.names,host_id=coalesce(r.members[1],r.host_id),status=case when cardinality(r.members)=0 then 'closed' else 'waiting' end,version=version+1 where id=r.id;
   end if;
   return jsonb_build_object('room',null,'coins',balance);
  elsif p_action in ('start','commit') then
   if p_request is null then raise exception 'invalid_request';end if;
   if not (p_request=any(r.requests)) then
    if r.version is distinct from p_expected then raise exception 'state_conflict';end if;
    if p_action='start' then
     if r.status<>'waiting' or r.host_id<>p_actor then raise exception 'not_room_owner';end if;
     if r.mode='online' and cardinality(r.members)<2 then raise exception 'need_players';end if;
     if exists(select 1 from unnest(r.members) m where public.is_banned(m)) then raise exception 'room_unavailable';end if;
    elsif r.status<>'active' then raise exception 'room_unavailable';end if;
    if jsonb_typeof(p_next->'state') is distinct from 'object' or octet_length(p_next::text)>262144
      or jsonb_array_length(p_next->'state'->'tanks') is distinct from (case when r.mode<>'online' then r.capacity else cardinality(r.members) end)
      or p_next->'state'->>'runId' is distinct from r.id::text then raise exception 'invalid_state';end if;

    price:=0;
    if p_next->'event'->>'type'='fire' then
     if coalesce((p_next->'event'->>'computer')::boolean,false) then
      if r.mode<>'solo' or seat<>1 or (r.state->>'turn')::integer=0
        or (p_next->'event'->>'actor')::integer is distinct from (r.state->>'turn')::integer
        or (p_next->'event'->'command'->>'weapon')::integer not between 0 and 2 then raise exception 'invalid_move';end if;
     elsif r.mode='local' then
      if seat<>1 or r.host_id<>p_actor or (p_next->'event'->>'actor')::integer is distinct from (r.state->>'turn')::integer then raise exception 'not_your_turn';end if;
     elsif (r.state->>'turn')::integer is distinct from seat-1 then raise exception 'not_your_turn';end if;
     weapon:=(p_next->'event'->'command'->>'weapon')::integer;
     if weapon is null or weapon not between 0 and 11 then raise exception 'invalid_move';end if;
     if (p_next->'state'->>'shotNo')::integer>(r.state->>'shotNo')::integer then
      price:=(array[0,0,0,2,1,2,1,1,3,3,1,1])[weapon+1];
     end if;
    end if;
    if price is distinct from (p_next->>'price')::integer then raise exception 'invalid_state';end if;
    if price>0 then
     select coins into balance from public.user_private where user_id=p_actor for update;
     if not found then raise exception 'wallet_unavailable';end if;
     if balance<price then raise exception 'coins';end if;
     update public.user_private set coins=coins-price where user_id=p_actor and coins>=price returning coins into balance;
     if not found then raise exception 'coins';end if;
     insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result)
      values(p_request,p_actor,'tank_ammo',price,jsonb_build_object('ok',true,'room_id',r.id,'weapon',weapon,'price',price,'coins',balance));
    end if;
    update ojjuda_tank_internal.rooms set state=p_next->'state',version=version+1,
     status=case when (p_next->'state'->>'over')::boolean then 'finished' else 'active' end,
     requests=array_append(r.requests[greatest(1,cardinality(r.requests)-510):cardinality(r.requests)],p_request),
     last_event=p_next->'event',deadline=case when r.mode<>'online' then null else clock_timestamp()+make_interval(secs=>90+least(300,coalesce((p_next->>'frames')::integer,0)/60)) end,expires_at=clock_timestamp()+interval '24 hours'
     where id=r.id returning * into r;
    if r.mode<>'local' and r.status='finished' and (select count(*) from jsonb_array_elements(r.state->'tanks') t where (t->>'hp')::integer>0)=1 then
     insert into ojjuda_tank_internal.wins(room_id,user_id)
      select r.id,r.members[t.seat::integer] from jsonb_array_elements(r.state->'tanks') with ordinality as t(tank,seat)
      where (t.tank->>'hp')::integer>0 and r.members[t.seat::integer] is not null
      on conflict(room_id) do nothing;
    end if;

   end if;
  end if;
 end if;
 return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1,'coins',balance);
end;
$$;

revoke all on function ojjuda_tank_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function ojjuda_tank_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) to service_role;

notify pgrst,'reload schema';
