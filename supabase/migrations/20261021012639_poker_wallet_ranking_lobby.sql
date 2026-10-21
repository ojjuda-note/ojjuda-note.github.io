-- Account poker gold. Two lifetime free refills, then 5 ZU for +5,000 G.
-- Only authenticated Edge code may move balances or commit a game.
create table ojjuda_poker_internal.wallets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 gold bigint not null default 5000 check(gold between 0 and 9007199254740991),
 free_used smallint not null default 0 check(free_used between 0 and 2),
 active_room uuid,rounds integer not null default 0,wins integer not null default 0,
 updated_at timestamptz not null default clock_timestamp()
);
create table ojjuda_poker_internal.refills (
 user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,
 charged smallint not null check(charged in (0,5)),created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,request_id)
);
alter table ojjuda_poker_internal.wallets enable row level security;
alter table ojjuda_poker_internal.refills enable row level security;
revoke all on ojjuda_poker_internal.wallets,ojjuda_poker_internal.refills from public,anon,authenticated,service_role;
create index poker_wallet_ranking on ojjuda_poker_internal.wallets(gold desc,user_id) where rounds>0;
alter table ojjuda_poker_internal.rooms
 add column mode text not null default 'online' check(mode in ('online','solo')),
 add column difficulty text not null default 'normal' check(difficulty in ('easy','normal')),
 add column funded boolean not null default false,
 add column credited bigint[] not null default '{}',
 add column settled_round integer not null default 0;

create function ojjuda_poker_internal.wallet(p_actor uuid,p_refill boolean default false,p_request uuid default null,p_paid boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare w ojjuda_poker_internal.wallets%rowtype; coins_now integer; charge integer:=0; duplicate boolean:=false; table_gold bigint:=0;
begin
 perform ojjuda_poker_internal.check_member(p_actor);
 select coins into coins_now from public.user_private where user_id=p_actor;
 if not found then raise exception 'no_account';end if;
 insert into ojjuda_poker_internal.wallets(user_id) values(p_actor) on conflict do nothing;
 select * into w from ojjuda_poker_internal.wallets where user_id=p_actor for update;
 if p_refill then
  if p_request is null then raise exception 'invalid_request';end if;
  select charged into charge from ojjuda_poker_internal.refills where user_id=p_actor and request_id=p_request;
  duplicate:=found;
  if not duplicate then
   if w.active_room is not null then raise exception 'round_in_progress';end if;
   if w.gold>=1000 then raise exception 'gold_not_empty';end if;
   if w.free_used<2 then w.free_used:=w.free_used+1;charge:=0;
   else
    if p_paid is distinct from true then raise exception 'paid_confirmation_required';end if;
    update public.user_private set coins=coins-5,updated_at=now() where user_id=p_actor and coins>=5 returning coins into coins_now;
    if not found then raise exception 'insufficient_zzu';end if;
    charge:=5;
   end if;
   update ojjuda_poker_internal.wallets set gold=gold+5000,free_used=w.free_used,updated_at=clock_timestamp() where user_id=p_actor returning * into w;
   insert into ojjuda_poker_internal.refills(user_id,request_id,charged) values(p_actor,p_request,charge);
  end if;
 end if;
 if w.active_room is not null then
  select coalesce((r.state->'players'->(array_position(r.members,p_actor)-1)->>'stack')::bigint,0) into table_gold from ojjuda_poker_internal.rooms r where r.id=w.active_room;
 end if;
 return jsonb_build_object('gold',w.gold+coalesce(table_gold,0),'available',w.gold,'free_left',2-w.free_used,'refill_cost',case when w.free_used<2 then 0 else 5 end,
  'refill_amount',5000,'coins',coins_now,'charged',coalesce(charge,0),'duplicate',duplicate,'locked',w.active_room is not null,'rounds',w.rounds,'wins',w.wins);
end;$$;
revoke all on function ojjuda_poker_internal.wallet(uuid,boolean,uuid,boolean) from public,anon,authenticated,service_role;

create function ojjuda_poker_internal.room_result(p_actor uuid,p_room uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r ojjuda_poker_internal.rooms%rowtype; stacks jsonb;
begin
 select * into r from ojjuda_poker_internal.rooms where id=p_room;
 select jsonb_agg(least(coalesce(w.gold,5000),1000000000) order by m.seat) into stacks
 from unnest(r.members) with ordinality m(id,seat) left join ojjuda_poker_internal.wallets w on w.user_id=m.id;
 return jsonb_build_object('room',case when r.id is null then null else to_jsonb(r) end,'seat',array_position(r.members,p_actor)-1,
  'stacks',stacks,'wallet',ojjuda_poker_internal.wallet(p_actor));
end;$$;
revoke all on function ojjuda_poker_internal.room_result(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function ojjuda_poker_internal.room_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_request uuid default null,p_expected integer default null,p_options jsonb default '{}',p_next jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r ojjuda_poker_internal.rooms%rowtype; existing uuid; seat integer; nick text; cap integer; title_value text; n integer; m uuid; phase text;
 w ojjuda_poker_internal.wallets%rowtype; amount bigint; remaining bigint; expected_count integer;
begin
 perform ojjuda_poker_internal.check_member(p_actor);
 if p_action is null or p_action not in ('status','refill','list','mine','create','join','read','start','commit','ready','leave') then raise exception 'invalid_request';end if;
 if jsonb_typeof(p_options) is distinct from 'object' or octet_length(p_options::text)>1024 then raise exception 'invalid_options';end if;
 if p_action in ('status','refill') then
  return jsonb_build_object('wallet',ojjuda_poker_internal.wallet(p_actor,p_action='refill',p_request,(p_options->>'paid')::boolean));
 end if;
 if p_action='list' then
  return jsonb_build_object('rooms',coalesce((select jsonb_agg(card) from (
   select jsonb_build_object('code',q.code,'title',q.title,'players',cardinality(q.members),'capacity',q.capacity) card
   from ojjuda_poker_internal.rooms q where q.mode='online' and q.status='waiting' and q.expires_at>clock_timestamp()
   and cardinality(q.members)<q.capacity
   and not exists(select 1 from unnest(q.members) member where public.blocked_between(p_actor,member) or public.is_banned(member))
   order by q.created_at desc limit 30) available),'[]'::jsonb));
 end if;
 if p_action in ('mine','create','join') then
  perform pg_advisory_xact_lock(hashtextextended('poker:'||p_actor::text,0));
  select id into existing from ojjuda_poker_internal.rooms where members @> array[p_actor] and status in ('waiting','active','finished')
   and not departed[array_position(members,p_actor)] and (expires_at>clock_timestamp() or status='active' and funded) order by created_at desc limit 1;
  if p_action='mine' then return ojjuda_poker_internal.room_result(p_actor,existing);end if;
 end if;
 if p_action='create' then
  if p_request is null then raise exception 'invalid_request';end if;
  select * into r from ojjuda_poker_internal.rooms where host_id=p_actor and create_request=p_request;
  if found then return ojjuda_poker_internal.room_result(p_actor,r.id);end if;
  if existing is not null then raise exception 'room_in_progress';end if;
  if (select count(*) from ojjuda_poker_internal.rooms where host_id=p_actor and created_at>clock_timestamp()-interval '1 minute')>=5 then raise exception 'room_rate_limit';end if;
  perform ojjuda_poker_internal.wallet(p_actor);
  if (select active_room is not null from ojjuda_poker_internal.wallets where user_id=p_actor) then raise exception 'round_in_progress';end if;
  cap:=(p_options->>'capacity')::integer;title_value:=btrim(p_options->>'title');
  if cap is null or cap not between 2 and 4 or title_value is null or char_length(title_value) not between 1 and 40
   or coalesce(p_options->>'mode','online') not in ('online','solo') or coalesce(p_options->>'difficulty','normal') not in ('easy','normal') then raise exception 'invalid_options';end if;
  select left(regexp_replace(coalesce(nullif(btrim(nickname),''),'회원'),'[[:cntrl:]<>]','','g'),12) into nick from public.profiles where id=p_actor;
  for n in 1..5 loop
   begin
    insert into ojjuda_poker_internal.rooms(code,host_id,members,names,title,capacity,create_request,mode,difficulty)
     values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),p_actor,array[p_actor],array[nick],title_value,cap,p_request,coalesce(p_options->>'mode','online'),coalesce(p_options->>'difficulty','normal')) returning * into r;
    exit;
   exception when unique_violation then if n=5 then raise;end if;
   end;
  end loop;
 else
  if p_action='join' then select * into r from ojjuda_poker_internal.rooms where code=upper(p_code) for update;
  else select * into r from ojjuda_poker_internal.rooms where id=p_room and members @> array[p_actor] for update;end if;
  if r.id is null then raise exception 'room_not_found';end if;
  seat:=array_position(r.members,p_actor);
  if (r.expires_at<=clock_timestamp() and not (r.status='active' and r.funded)) or r.status='closed' then raise exception 'room_unavailable';end if;
  if seat is not null and r.departed[seat] then raise exception 'room_unavailable';end if;
  if p_action='join' and seat is null then
   if existing is not null then raise exception 'room_in_progress';end if;
   if r.status<>'waiting' or r.mode='solo' then raise exception 'room_unavailable';end if;
   if cardinality(r.members)>=r.capacity then raise exception 'room_full';end if;
   if exists(select 1 from unnest(r.members) member where public.blocked_between(p_actor,member)) then raise exception 'room_unavailable';end if;
   foreach m in array r.members loop perform ojjuda_poker_internal.check_member(m);end loop;
   perform ojjuda_poker_internal.wallet(p_actor);
   if (select active_room is not null from ojjuda_poker_internal.wallets where user_id=p_actor) then raise exception 'round_in_progress';end if;
   select left(regexp_replace(coalesce(nullif(btrim(nickname),''),'회원'),'[[:cntrl:]<>]','','g'),12) into nick from public.profiles where id=p_actor;
   update ojjuda_poker_internal.rooms set members=array_append(members,p_actor),names=array_append(names,nick),departed=array_append(departed,false),ready=array_append(ready,false),version=version+1 where id=r.id returning * into r;
  elsif p_action in ('start','commit','ready','leave') then
   if p_request is null then raise exception 'invalid_request';end if;
   if not (p_request=any(r.requests)) then
    if r.version is distinct from p_expected then raise exception 'state_conflict';end if;
    if p_action='start' then
     if r.status<>'waiting' or r.host_id<>p_actor then raise exception 'not_room_owner';end if;
     if r.mode='online' and cardinality(r.members)<2 then raise exception 'need_players';end if;
    elsif p_action='commit' then
     if r.status<>'active' then raise exception 'room_unavailable';end if;
     if p_next->>'kind'='timeout' then
      if r.deadline>clock_timestamp() then raise exception 'not_your_turn';end if;
     elsif (r.state->>'turn')::integer is distinct from seat-1 then raise exception 'not_your_turn';end if;
    elsif p_action='ready' then
     if r.status<>'finished' or true=any(r.departed) then raise exception 'room_unavailable';end if;
     perform ojjuda_poker_internal.wallet(p_actor);
     if (select gold<50 from ojjuda_poker_internal.wallets where user_id=p_actor) then raise exception 'gold_empty';end if;
     r.ready[seat]:=true;
     if false=any(r.ready) and p_next->'state' is not null and p_next->'state'<>'null'::jsonb then raise exception 'invalid_request';end if;
    elsif p_action='leave' then
     if r.status='waiting' then
      r.members:=array_remove(r.members,p_actor);
      r.names:=array(select name from unnest(r.names) with ordinality x(name,idx) where idx<>seat order by idx);
      r.departed:=array_fill(false,array[cardinality(r.members)]);r.ready:=r.departed;
      r.host_id:=coalesce(r.members[1],r.host_id);
      if cardinality(r.members)=0 then r.status:='closed';end if;
     else r.departed[seat]:=true;if not (false=any(r.departed)) then r.status:='closed';end if;
     end if;
    end if;
    if p_next->'state' is not null and p_next->'state'<>'null'::jsonb then
     expected_count:=case when r.mode='solo' then 4 else cardinality(r.members) end;
     if jsonb_typeof(p_next->'state') is distinct from 'object' or octet_length(p_next::text)>32768
      or jsonb_array_length(p_next->'state'->'players') is distinct from expected_count then raise exception 'invalid_request';end if;
     if p_action in ('start','ready') then
      if p_action='ready' and false=any(r.ready) then raise exception 'invalid_request';end if;
      -- Stable ordering prevents two table starts from locking members in opposite orders.
      foreach m in array (select array_agg(id order by id) from unnest(r.members) id) loop
       perform ojjuda_poker_internal.check_member(m);perform ojjuda_poker_internal.wallet(m);
      end loop;
      for n in 1..cardinality(r.members) loop
       select * into w from ojjuda_poker_internal.wallets where user_id=r.members[n];
       if w.active_room is not null then raise exception 'round_in_progress';end if;
       if w.gold<50 then raise exception 'gold_empty';end if;
       amount:=least(w.gold,1000000000);
       if (p_next->'state'->'players'->(n-1)->>'initial')::bigint is distinct from amount then raise exception 'state_conflict';end if;
       update ojjuda_poker_internal.wallets set gold=gold-amount,active_room=r.id where user_id=w.user_id;
      end loop;
      r.round:=r.round+1;r.ready:=array_fill(false,array[cardinality(r.members)]);
      r.funded:=true;r.credited:=array_fill(0::bigint,array[cardinality(r.members)]);
     end if;
     r.state:=p_next->'state';phase:=r.state->>'phase';
     if r.status<>'closed' then r.status:=case when phase='finished' then 'finished' else 'active' end;end if;
     if r.funded and r.settled_round<r.round then
      perform 1 from ojjuda_poker_internal.wallets where user_id=any(r.members) order by user_id for update;
      if phase='finished' then
       for n in 1..cardinality(r.members) loop
        amount:=(r.state->'players'->(n-1)->>'stack')::bigint-coalesce(r.credited[n],0);
        if amount<0 then raise exception 'invalid_request';end if;
        update ojjuda_poker_internal.wallets set gold=gold+amount,active_room=case when active_room=r.id then null else active_room end,
         rounds=rounds+1,wins=wins+case when (r.state->'result'->'net'->>(n-1))::bigint>0 then 1 else 0 end,updated_at=clock_timestamp() where user_id=r.members[n];
        r.credited[n]:=(r.state->'players'->(n-1)->>'stack')::bigint;
       end loop;
       r.settled_round:=r.round;
      elsif p_action='leave' then
       remaining:=(r.state->'players'->(seat-1)->>'stack')::bigint;
       amount:=remaining-coalesce(r.credited[seat],0);
       if amount<0 then raise exception 'invalid_request';end if;
       update ojjuda_poker_internal.wallets set gold=gold+amount,active_room=null,updated_at=clock_timestamp() where user_id=p_actor and active_room=r.id;
       r.credited[seat]:=remaining;
      end if;
     end if;
     r.deadline:=clock_timestamp()+make_interval(secs=>case when phase in ('between','runout') then 2 when r.mode='solo' and (r.state->>'turn')::integer>0 then 1 else 30 end);
    end if;
    update ojjuda_poker_internal.rooms set state=r.state,status=r.status,round=r.round,members=r.members,names=r.names,host_id=r.host_id,
     departed=r.departed,ready=r.ready,deadline=r.deadline,version=version+1,funded=r.funded,credited=r.credited,settled_round=r.settled_round,
     requests=array_append(r.requests[greatest(1,cardinality(r.requests)-510):cardinality(r.requests)],p_request),
     expires_at=clock_timestamp()+case when r.status='waiting' then interval '30 minutes' else interval '24 hours' end where id=r.id returning * into r;
   end if;
  end if;
 end if;
 return ojjuda_poker_internal.room_result(p_actor,r.id);
end;$$;

create function ojjuda_poker_internal.ranking(p_monthly boolean default true)
returns json language plpgsql stable security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();result json;
begin
 perform ojjuda_poker_internal.check_member(actor);
 select coalesce(json_agg(json_build_object('nick',x.nickname,'score',x.gold,'me',x.user_id=actor,'source','current_gold') order by x.gold desc,x.user_id),'[]'::json) into result
 from (select w.user_id,p.nickname,w.gold+coalesce((r.state->'players'->(array_position(r.members,w.user_id)-1)->>'stack')::bigint,0) gold
  from ojjuda_poker_internal.wallets w join public.profiles p on p.id=w.user_id
  join ojjuda_account_internal.member_identity identity on identity.user_id=w.user_id
  left join ojjuda_poker_internal.rooms r on r.id=w.active_room
  where w.rounds>0 and (not p_monthly or w.updated_at>=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
   and not public.is_banned(w.user_id) and not public.blocked_between(actor,w.user_id)
   and ojjuda_account_internal.age_on(identity.birth_date,(now() at time zone 'Asia/Seoul')::date)>=19
  order by gold desc,w.user_id limit 10) x;
 return result;
end;$$;
revoke all on function ojjuda_poker_internal.ranking(boolean) from public,anon;
grant usage on schema ojjuda_poker_internal to authenticated;
grant execute on function ojjuda_poker_internal.ranking(boolean) to authenticated;
create or replace function public.community_game_monthly_ranking(p_game text)
returns json language plpgsql stable security invoker set search_path='' as $$
begin
 if p_game='poker' then return ojjuda_poker_internal.ranking(true);end if;
 if p_game='tank' then return public.tank_monthly_ranking();end if;
 if ojjuda_guest_internal.score_limit(p_game) is not null then return ojjuda_guest_internal.ranking(p_game,'month',null);end if;
 return ojjuda_game_internal.community_game_monthly_ranking(p_game);
end;$$;
create or replace function public.community_game_ranking(p_game text)
returns json language plpgsql stable security invoker set search_path='' as $$
begin
 if p_game='poker' then return ojjuda_poker_internal.ranking(false);end if;
 if ojjuda_guest_internal.score_limit(p_game) is not null then return ojjuda_guest_internal.ranking(p_game,'day',null);end if;
 return ojjuda_game_internal.community_game_ranking(p_game);
end;$$;

-- Preserve the current tank/marble/territory feed; add adult-only poker rooms.
create function ojjuda_poker_internal.arcade_rooms()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();result jsonb;adult boolean;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and not coalesce(is_anonymous,false)) then raise exception 'not_signed_in';end if;
 if public.is_banned(actor) then raise exception 'banned';end if;
 select coalesce(ojjuda_account_internal.age_on(birth_date,(now() at time zone 'Asia/Seoul')::date)>=19,false) into adult from ojjuda_account_internal.member_identity where user_id=actor;
 with all_rooms as (
  select 'tank'::text kind,'T-'||r.code room_no,r.code,r.id,r.title,r.host_id,r.members,r.capacity,r.status,r.created_at,r.expires_at
   from ojjuda_tank_internal.rooms r where r.mode='online'
  union all select 'tour','M-'||r.code,r.code,r.id,r.title,r.host_id,r.members,r.capacity,r.status,r.created_at,r.expires_at from ojjuda_marble_internal.rooms r where r.public_lobby
  union all select 'ttang','D-'||upper(left(r.id::text,8)),null,r.id,r.title,r.host_id,array_remove(array[r.host_id,r.guest_id],null),2,
   case r.status when 'playing' then 'active' else r.status end,r.created_at,r.expires_at from ojjuda_arcade_internal.ttang_rooms r
  union all select 'poker','P-'||r.code,r.code,r.id,r.title,r.host_id,
   array(select member from unnest(r.members) with ordinality m(member,idx) where not r.departed[m.idx]),r.capacity,r.status,r.created_at,r.expires_at
   from ojjuda_poker_internal.rooms r where adult and r.mode='online'
 ), visible as (
  select r.* from all_rooms r where r.status in ('waiting','active') and r.expires_at>clock_timestamp()
   and not exists(select 1 from unnest(r.members) member where public.is_banned(member) or public.blocked_between(actor,member))
  order by r.created_at desc limit 100
 )
 select coalesce(jsonb_agg(jsonb_build_object('room_no',r.room_no,'kind',r.kind,'native',true,'title',r.title,
  'status',case r.status when 'active' then 'playing' else 'waiting' end,
  'host_name',coalesce(p.nickname,'회원'),'players',cardinality(r.members),'capacity',r.capacity,
  'is_host',actor=r.host_id,'is_member',actor=any(r.members),'match_id',r.id,'code',r.code,'created_at',r.created_at)
  order by r.created_at desc),'[]'::jsonb) into result from visible r left join public.profiles p on p.id=r.host_id;
 return jsonb_build_object('ok',true,'rooms',result);
end;$$;
revoke all on function ojjuda_poker_internal.arcade_rooms() from public,anon;
grant execute on function ojjuda_poker_internal.arcade_rooms() to authenticated;
create or replace function public.arcade_extra_rooms()
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$select ojjuda_poker_internal.arcade_rooms();$$;
revoke all on function public.arcade_extra_rooms() from public,anon;
grant execute on function public.arcade_extra_rooms() to authenticated;
notify pgrst,'reload schema';
