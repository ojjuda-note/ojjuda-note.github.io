-- Server-authoritative European roulette. Gold is a game wallet; ZU is never wagered.
begin;
set local lock_timeout='5s';
create schema ojjuda_roulette_internal;
revoke all on schema ojjuda_roulette_internal from public,anon,authenticated,service_role;

create table ojjuda_roulette_internal.wallets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 gold bigint not null default 10000 check(gold between 0 and 9007199254740991),
 updated_at timestamptz not null default clock_timestamp()
);
create table ojjuda_roulette_internal.rooms (
 id uuid primary key default gen_random_uuid(),code text not null unique check(code~'^[A-F0-9]{8}$'),
 host_id uuid not null,title text not null default '룰렛' check(char_length(title) between 1 and 40),
 capacity integer not null default 4 check(capacity between 2 and 4),
 status text not null default 'betting' check(status in('betting','spinning','finished','closed')),
 round_no integer not null default 0,create_request text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(host_id,create_request)
);
create table ojjuda_roulette_internal.players (
 room_id uuid not null references ojjuda_roulette_internal.rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,name text not null,
 active boolean not null default true,ready boolean not null default false,
 bets jsonb not null default '{}',stake bigint not null default 0 check(stake between 0 and 50000),
 confirmed boolean not null default false,joined_at timestamptz not null default clock_timestamp(),
 last_seen timestamptz not null default clock_timestamp(),primary key(room_id,user_id)
);
create unique index roulette_one_active_room on ojjuda_roulette_internal.players(user_id) where active;
create index roulette_room_live_players on ojjuda_roulette_internal.players(room_id,last_seen) where active;
create index roulette_open_rooms on ojjuda_roulette_internal.rooms(updated_at,id) where status<>'closed';
create table ojjuda_roulette_internal.rounds (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references ojjuda_roulette_internal.rooms(id),
 round_no integer not null,number integer not null check(number between 0 and 36),
 started_at timestamptz not null default clock_timestamp(),duration_ms integer not null check(duration_ms between 20000 and 30000),
 variation double precision not null check(variation>=0 and variation<1),unique(room_id,round_no)
);
create table ojjuda_roulette_internal.entries (
 round_id uuid not null references ojjuda_roulette_internal.rounds(id),room_id uuid not null references ojjuda_roulette_internal.rooms(id),
 user_id uuid not null references auth.users(id) on delete cascade,bets jsonb not null,stake bigint not null check(stake between 100 and 50000),
 gross bigint not null check(gross>=0),fee bigint not null check(fee>=0),payout bigint not null check(payout>=0),
 net bigint not null,abandoned boolean not null default false,settled_at timestamptz,primary key(round_id,user_id),
 check(payout=gross-fee and net=payout-stake)
);
create index roulette_unpaid on ojjuda_roulette_internal.entries(room_id,user_id) where settled_at is null;
create table ojjuda_roulette_internal.bet_catalog(id text primary key,numbers integer[] not null,multiplier integer not null);
insert into ojjuda_roulette_internal.bet_catalog select 'n'||n,array[n],36 from generate_series(0,36) n;
insert into ojjuda_roulette_internal.bet_catalog select 'split-'||n||'-'||(n+1),array[n,n+1],18 from generate_series(1,36) n where (n-1)%3<2;
insert into ojjuda_roulette_internal.bet_catalog select 'split-'||n||'-'||(n+3),array[n,n+3],18 from generate_series(1,33) n;
insert into ojjuda_roulette_internal.bet_catalog select 'split-0-'||n,array[0,n],18 from generate_series(1,3) n;
insert into ojjuda_roulette_internal.bet_catalog select 'corner-'||n||'-'||(n+1)||'-'||(n+3)||'-'||(n+4),array[n,n+1,n+3,n+4],9 from generate_series(1,32) n where (n-1)%3<2;
insert into ojjuda_roulette_internal.bet_catalog select 'col'||c,array(select c+i*3 from generate_series(0,11) i),3 from generate_series(1,3)c;
insert into ojjuda_roulette_internal.bet_catalog select 'dozen'||d,array(select (d-1)*12+i from generate_series(1,12)i),3 from generate_series(1,3)d;
insert into ojjuda_roulette_internal.bet_catalog values
 ('red',array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36],2),
 ('black',array[2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35],2),
 ('odd',array(select n from generate_series(1,36)n where n%2=1),2),
 ('even',array(select n from generate_series(1,36)n where n%2=0),2),
 ('low',array(select n from generate_series(1,18)n),2),('high',array(select n from generate_series(19,36)n),2);

-- All money and rooms are hidden behind the authenticated action function.
alter table ojjuda_roulette_internal.wallets enable row level security;
alter table ojjuda_roulette_internal.rooms enable row level security;
alter table ojjuda_roulette_internal.players enable row level security;
alter table ojjuda_roulette_internal.rounds enable row level security;
alter table ojjuda_roulette_internal.entries enable row level security;
alter table ojjuda_roulette_internal.bet_catalog enable row level security;
revoke all on all tables in schema ojjuda_roulette_internal from public,anon,authenticated,service_role;

create function ojjuda_roulette_internal.check_member(p_actor uuid)
returns void language plpgsql stable set search_path=pg_catalog as $$
declare birth date;
begin
 if p_actor is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=p_actor and not coalesce(u.is_anonymous,false)) then raise exception 'not_signed_in';end if;
 if not exists(select 1 from public.user_private where user_id=p_actor) then raise exception 'no_account';end if;
 if exists(select 1 from public.user_private where user_id=p_actor and banned_until>now()) then raise exception 'banned';end if;
 select birth_date into birth from ojjuda_account_internal.member_identity where user_id=p_actor;
 if birth is null then raise exception 'member_identity_required';end if;
 if ojjuda_account_internal.age_on(birth,(clock_timestamp() at time zone 'Asia/Seoul')::date)<19 then raise exception 'adult_required';end if;
end;$$;

create function ojjuda_roulette_internal.random_int(p_max integer)
returns integer language plpgsql volatile set search_path=pg_catalog as $$
declare v bigint;lim bigint;
begin
 if p_max<1 then raise exception 'invalid_range';end if;
 lim:=4294967296-(4294967296%p_max);
 loop v:=('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint;exit when v<lim;end loop;
 return (v%p_max)::integer;
end;$$;

create function ojjuda_roulette_internal.bet_total(p_bets jsonb)
returns bigint language plpgsql stable set search_path=pg_catalog as $$
declare b record;total bigint:=0;amount numeric;
begin
 if jsonb_typeof(p_bets) is distinct from 'object' or octet_length(p_bets::text)>10000 then raise exception 'invalid_bet';end if;
 for b in select key,value from jsonb_each(p_bets) loop
  if not exists(select 1 from ojjuda_roulette_internal.bet_catalog where id=b.key) or jsonb_typeof(b.value)<>'number' then raise exception 'invalid_bet';end if;
  amount:=b.value::text::numeric;
  if amount<100 or amount>50000 or amount%100<>0 then raise exception 'invalid_bet';end if;
  total:=total+amount::bigint;if total>50000 then raise exception 'invalid_bet';end if;
 end loop;
 if total=0 then raise exception 'invalid_bet';end if;
 return total;
end;$$;

create function ojjuda_roulette_internal.payout(p_bets jsonb,p_number integer)
returns jsonb language sql stable set search_path=pg_catalog as $$
 with winning as (
  select b.key id,(b.value::text)::bigint stake,(b.value::text)::bigint*c.multiplier amount
  from jsonb_each(p_bets)b join ojjuda_roulette_internal.bet_catalog c on c.id=b.key where p_number=any(c.numbers)
 ), totals as(select coalesce(sum(amount),0)::bigint gross,coalesce(jsonb_agg(jsonb_build_object('id',id,'stake',stake,'return',amount)),'[]') wins from winning)
 select jsonb_build_object('gross',gross,'fee',round(gross::numeric/100)::bigint,'total',gross-round(gross::numeric/100)::bigint,'wins',wins) from totals;
$$;

-- Call only while holding the room lock. One receipt row guards every credit.
create function ojjuda_roulette_internal.settle(p_round uuid,p_actor uuid,p_now timestamptz)
returns void language plpgsql set search_path=pg_catalog as $$
declare e ojjuda_roulette_internal.entries%rowtype;
begin
 select * into e from ojjuda_roulette_internal.entries where round_id=p_round and user_id=p_actor for update;
 if not found or e.settled_at is not null then return;end if;
 update ojjuda_roulette_internal.wallets set gold=gold+e.payout,updated_at=p_now where user_id=p_actor;
 update ojjuda_roulette_internal.entries set settled_at=p_now where round_id=p_round and user_id=p_actor;
 update ojjuda_roulette_internal.players set confirmed=true where room_id=e.room_id and user_id=p_actor;
end;$$;

create function ojjuda_roulette_internal.depart(p_room uuid,p_actor uuid,p_now timestamptz)
returns void language plpgsql set search_path=pg_catalog as $$
declare r ojjuda_roulette_internal.rooms%rowtype;p ojjuda_roulette_internal.players%rowtype;e record;
begin
 select * into r from ojjuda_roulette_internal.rooms where id=p_room for update;
 select * into p from ojjuda_roulette_internal.players where room_id=p_room and user_id=p_actor for update;
 if not found or not p.active then return;end if;
 if r.status='betting' and p.stake>0 then
  update ojjuda_roulette_internal.wallets set gold=gold+p.stake,updated_at=p_now where user_id=p_actor;
 else
  update ojjuda_roulette_internal.entries set abandoned=true where room_id=p_room and user_id=p_actor and settled_at is null;
  for e in select round_id from ojjuda_roulette_internal.entries where room_id=p_room and user_id=p_actor and settled_at is null order by round_id loop
   perform ojjuda_roulette_internal.settle(e.round_id,p_actor,p_now);
  end loop;
 end if;
 update ojjuda_roulette_internal.players set active=false,ready=false,bets='{}',stake=0 where room_id=p_room and user_id=p_actor;
 update ojjuda_roulette_internal.rooms set updated_at=p_now where id=p_room;
end;$$;

create function ojjuda_roulette_internal.advance(p_room uuid,p_now timestamptz)
returns void language plpgsql set search_path=pg_catalog as $$
declare r ojjuda_roulette_internal.rooms%rowtype;s ojjuda_roulette_internal.rounds%rowtype;p record;new_host uuid;
begin
 select * into r from ojjuda_roulette_internal.rooms where id=p_room for update;
 if not found or r.status='closed' then return;end if;
 for p in select user_id from ojjuda_roulette_internal.players where room_id=r.id and active and last_seen<p_now-interval '2 minutes' order by user_id loop
  perform ojjuda_roulette_internal.depart(r.id,p.user_id,p_now);
 end loop;
 select * into s from ojjuda_roulette_internal.rounds where room_id=r.id and round_no=r.round_no;
 if s.id is not null and p_now>=s.started_at+s.duration_ms*interval '1 millisecond' then
  if r.status='spinning' then update ojjuda_roulette_internal.rooms set status='finished',updated_at=p_now where id=r.id;r.status:='finished';end if;
  for p in select user_id from ojjuda_roulette_internal.entries where round_id=s.id and abandoned and settled_at is null order by user_id loop
   perform ojjuda_roulette_internal.settle(s.id,p.user_id,p_now);
  end loop;
 end if;
 if not exists(select 1 from ojjuda_roulette_internal.players where room_id=r.id and user_id=r.host_id and active) then
  select user_id into new_host from ojjuda_roulette_internal.players where room_id=r.id and active order by joined_at,user_id limit 1;
  if new_host is not null then update ojjuda_roulette_internal.rooms set host_id=new_host where id=r.id;end if;
 end if;
 if r.status='finished' and not exists(select 1 from ojjuda_roulette_internal.entries where round_id=s.id and settled_at is null) then
  update ojjuda_roulette_internal.players set ready=false,confirmed=false,bets='{}',stake=0 where room_id=r.id;
  update ojjuda_roulette_internal.rooms set status='betting',updated_at=p_now where id=r.id;r.status:='betting';
 end if;
 if r.status='betting' and not exists(select 1 from ojjuda_roulette_internal.players where room_id=r.id and active) then
  update ojjuda_roulette_internal.rooms set status='closed',updated_at=p_now where id=r.id;
 end if;
end;$$;

create function ojjuda_roulette_internal.snapshot(p_actor uuid,p_room uuid,p_now timestamptz)
returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare r ojjuda_roulette_internal.rooms%rowtype;p ojjuda_roulette_internal.players%rowtype;s ojjuda_roulette_internal.rounds%rowtype;e ojjuda_roulette_internal.entries%rowtype;v_room jsonb;v_players jsonb;v_result jsonb;v_spin jsonb;v_wallet jsonb;
begin
 select jsonb_build_object('gold',w.gold,'available',w.gold,'coins',u.coins) into v_wallet from ojjuda_roulette_internal.wallets w join public.user_private u on u.user_id=w.user_id where w.user_id=p_actor;
 select * into r from ojjuda_roulette_internal.rooms where id=p_room and status<>'closed';
 select * into p from ojjuda_roulette_internal.players where room_id=p_room and user_id=p_actor and active;
 if r.id is not null and p.user_id is not null then
  select coalesce(jsonb_agg(jsonb_build_object('userId',q.user_id,'name',q.name,'ready',q.ready,'confirmed',q.confirmed,'connected',q.active,'stake',coalesce((select sum(value::text::bigint) from jsonb_each(q.bets)),0),'bets',q.bets) order by q.joined_at,q.user_id),'[]') into v_players from ojjuda_roulette_internal.players q where q.room_id=r.id and q.active;
  if r.status in('spinning','finished') then
   select * into s from ojjuda_roulette_internal.rounds where room_id=r.id and round_no=r.round_no;
   select * into e from ojjuda_roulette_internal.entries where round_id=s.id and user_id=p_actor;
   v_spin:=jsonb_build_object('id',s.id,'number',s.number,'startedAt',floor(extract(epoch from s.started_at)*1000)::bigint,'duration',s.duration_ms,'variation',s.variation,'bets',e.bets);
   if r.status='finished' then v_result:=ojjuda_roulette_internal.payout(e.bets,s.number)||jsonb_build_object('stake',e.stake,'net',e.net,'number',s.number,'bets',e.bets);end if;
  end if;
  v_room:=jsonb_build_object('id',r.id,'code',r.code,'title',r.title,'capacity',r.capacity,'hostId',r.host_id,'status',r.status,'round',r.round_no,'players',v_players,
   'me',jsonb_build_object('userId',p_actor,'ready',p.ready,'confirmed',p.confirmed,'bets',p.bets,'stake',p.stake),'spin',v_spin,'result',v_result);
 end if;
 return jsonb_build_object('ok',true,'serverTime',floor(extract(epoch from p_now)*1000)::bigint,'wallet',v_wallet,'room',v_room);
end;$$;

create function ojjuda_roulette_internal.action(p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();ts timestamptz:=clock_timestamp();existing uuid;target uuid;r ojjuda_roulette_internal.rooms%rowtype;p ojjuda_roulette_internal.players%rowtype;
 s ojjuda_roulette_internal.rounds%rowtype;q record;v_bets jsonb;v_total bigint;v_ready boolean;v_payout jsonb;v_result jsonb;v_rooms jsonb;v_cap integer;v_title text;v_code text;v_request text;v_name text;v_round uuid;n integer;last_duration integer;duration integer;
begin
 perform ojjuda_roulette_internal.check_member(actor);
 if p_action is null or p_action not in('status','list','mine','create','join','read','bet','ready','start','confirm','leave') then raise exception 'invalid_request';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>12000 then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended('roulette:'||actor::text,0));
 insert into ojjuda_roulette_internal.wallets(user_id) values(actor) on conflict do nothing;
 select room_id into existing from ojjuda_roulette_internal.players where user_id=actor and active;
 v_code:=upper(btrim(p_payload->>'code'));v_request:=p_payload->>'request_id';
 if v_code is not null and v_code!~'^[A-F0-9]{8}$' then raise exception 'invalid_request';end if;
 if v_request is not null and length(v_request)>64 then raise exception 'invalid_request';end if;
 if p_payload ? 'room_id' and p_payload->>'room_id' is not null then
  begin target:=(p_payload->>'room_id')::uuid;exception when invalid_text_representation then raise exception 'invalid_request';end;
 elsif v_code is not null then select id into target from ojjuda_roulette_internal.rooms where code=v_code;
 else target:=existing;end if;
 if p_action='join' and target is null then raise exception 'room_not_found';end if;
 -- Fixed room ordering avoids deadlocks when two members switch rooms together.
 perform 1 from ojjuda_roulette_internal.rooms where id in(existing,target) order by id for update;
 if existing is not null then perform ojjuda_roulette_internal.advance(existing,ts);end if;
 if target is not null and target is distinct from existing then perform ojjuda_roulette_internal.advance(target,ts);end if;
 select room_id into existing from ojjuda_roulette_internal.players where user_id=actor and active;
 if p_action='create' then
  if v_request is not null then select id into target from ojjuda_roulette_internal.rooms where host_id=actor and create_request=v_request;
   if target is not null then return ojjuda_roulette_internal.snapshot(actor,target,ts);end if;end if;
  if existing is not null then return ojjuda_roulette_internal.snapshot(actor,existing,ts);end if;
  if (select count(*) from ojjuda_roulette_internal.rooms where host_id=actor and created_at>ts-interval '1 minute')>=5 then raise exception 'room_rate_limit';end if;
  begin v_cap:=coalesce((p_payload->>'capacity')::integer,4);exception when invalid_text_representation then raise exception 'invalid_request';end;
  v_title:=coalesce(nullif(btrim(p_payload->>'title'),''),'룰렛');
  if v_cap not between 2 and 4 or char_length(v_title)>40 or v_title~'[[:cntrl:]]' then raise exception 'invalid_request';end if;
  select left(regexp_replace(coalesce(nullif(btrim(nickname),''),'회원'),'[[:cntrl:]<>]','','g'),12) into v_name from public.profiles where id=actor;
  for n in 1..5 loop begin
   insert into ojjuda_roulette_internal.rooms(code,host_id,title,capacity,create_request) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),actor,v_title,v_cap,v_request) returning * into r;exit;
   exception when unique_violation then if n=5 then raise;end if;end;end loop;
  insert into ojjuda_roulette_internal.players(room_id,user_id,name) values(r.id,actor,v_name);target:=r.id;
 elsif p_action='join' then
  select * into r from ojjuda_roulette_internal.rooms where id=target;
  if r.id is null or r.status<>'betting' then
   if existing=target then return ojjuda_roulette_internal.snapshot(actor,target,ts);end if;
   raise exception 'room_not_found';end if;
  if existing is distinct from target then
   if (select count(*) from ojjuda_roulette_internal.players where room_id=target and active)>=r.capacity then raise exception 'room_full';end if;
   if exists(select 1 from ojjuda_roulette_internal.players where room_id=target and active and (public.blocked_between(actor,user_id) or exists(select 1 from public.user_private u where u.user_id=ojjuda_roulette_internal.players.user_id and u.banned_until>now()))) then raise exception 'room_not_found';end if;
   if existing is not null then perform ojjuda_roulette_internal.depart(existing,actor,ts);perform ojjuda_roulette_internal.advance(existing,ts);end if;
   select left(regexp_replace(coalesce(nullif(btrim(nickname),''),'회원'),'[[:cntrl:]<>]','','g'),12) into v_name from public.profiles where id=actor;
   insert into ojjuda_roulette_internal.players(room_id,user_id,name) values(target,actor,v_name)
    on conflict(room_id,user_id) do update set name=excluded.name,active=true,ready=false,bets='{}',stake=0,confirmed=false,joined_at=ts,last_seen=ts;
  end if;
 elsif p_action='leave' then
  if target is not null and exists(select 1 from ojjuda_roulette_internal.players where room_id=target and user_id=actor and active) then
   perform ojjuda_roulette_internal.depart(target,actor,ts);perform ojjuda_roulette_internal.advance(target,ts);
  end if;
  select room_id into target from ojjuda_roulette_internal.players where user_id=actor and active;
 elsif p_action in('bet','ready','start','confirm','read') then
  select * into r from ojjuda_roulette_internal.rooms where id=target and status<>'closed';
  select * into p from ojjuda_roulette_internal.players where room_id=target and user_id=actor and active;
  if r.id is null or p.user_id is null then raise exception 'room_not_found';end if;
  if exists(select 1 from ojjuda_roulette_internal.players where room_id=target and active and public.blocked_between(actor,user_id)) then raise exception 'room_not_found';end if;
  if p_action in('bet','ready','start') then
   if r.status<>'betting' then
    if p_action in('ready','start') and p.ready then return ojjuda_roulette_internal.snapshot(actor,target,ts);end if;
    raise exception 'round_in_progress';
   end if;
   if p_action='bet' then
    if p.ready then raise exception 'already_ready';end if;
    v_bets:=p_payload->'bets';v_total:=case when v_bets='{}'::jsonb then 0 else ojjuda_roulette_internal.bet_total(v_bets) end;
    if (select gold from ojjuda_roulette_internal.wallets where user_id=actor)<v_total then raise exception 'insufficient_gold';end if;
    update ojjuda_roulette_internal.players set bets=v_bets where room_id=target and user_id=actor;
   else
    if p_payload ? 'ready' and jsonb_typeof(p_payload->'ready')<>'boolean' then raise exception 'invalid_request';end if;
    v_ready:=case when p_action='start' then true else coalesce((p_payload->>'ready')::boolean,true) end;
    v_bets:=case when v_ready then coalesce(p_payload->'bets',p.bets) else '{}'::jsonb end;
    v_total:=case when v_ready then ojjuda_roulette_internal.bet_total(v_bets) else 0 end;
    update ojjuda_roulette_internal.wallets set gold=gold+p.stake-v_total,updated_at=ts where user_id=actor and gold+p.stake>=v_total;
    if not found then raise exception 'insufficient_gold';end if;
    update ojjuda_roulette_internal.players set ready=v_ready,bets=v_bets,stake=v_total,confirmed=false where room_id=target and user_id=actor;
    if v_ready and (select count(*) from ojjuda_roulette_internal.players where room_id=target and active)>=2
     and not exists(select 1 from ojjuda_roulette_internal.players where room_id=target and active and (not ready or stake<100)) then
     for q in select user_id from ojjuda_roulette_internal.players where room_id=target and active loop perform ojjuda_roulette_internal.check_member(q.user_id);end loop;
     select duration_ms into last_duration from ojjuda_roulette_internal.rounds where room_id=target and round_no=r.round_no;
     loop duration:=20000+ojjuda_roulette_internal.random_int(10001);exit when duration is distinct from last_duration;end loop;
     insert into ojjuda_roulette_internal.rounds(room_id,round_no,number,started_at,duration_ms,variation)
      values(target,r.round_no+1,ojjuda_roulette_internal.random_int(37),ts,duration,ojjuda_roulette_internal.random_int(1000000)/1000000.0) returning * into s;
     for q in select * from ojjuda_roulette_internal.players where room_id=target and active order by user_id loop
      v_payout:=ojjuda_roulette_internal.payout(q.bets,s.number);
      insert into ojjuda_roulette_internal.entries(round_id,room_id,user_id,bets,stake,gross,fee,payout,net)
       values(s.id,target,q.user_id,q.bets,q.stake,(v_payout->>'gross')::bigint,(v_payout->>'fee')::bigint,(v_payout->>'total')::bigint,(v_payout->>'total')::bigint-q.stake);
     end loop;
     update ojjuda_roulette_internal.rooms set status='spinning',round_no=r.round_no+1,updated_at=ts where id=target;
    end if;
   end if;
  elsif p_action='confirm' then
   begin v_round:=(p_payload->>'roundId')::uuid;exception when invalid_text_representation then raise exception 'invalid_request';end;
   if v_round is null then raise exception 'invalid_request';end if;
   select * into s from ojjuda_roulette_internal.rounds where id=v_round and room_id=target;
   if s.id is null or not exists(select 1 from ojjuda_roulette_internal.entries where round_id=v_round and user_id=actor) then raise exception 'invalid_request';end if;
   if ts<s.started_at+s.duration_ms*interval '1 millisecond' then raise exception 'round_in_progress';end if;
   perform ojjuda_roulette_internal.settle(v_round,actor,ts);perform ojjuda_roulette_internal.advance(target,ts);
  end if;
 else target:=existing;
 end if;
 if target is not null then update ojjuda_roulette_internal.players set last_seen=ts where room_id=target and user_id=actor and active;end if;
 v_result:=ojjuda_roulette_internal.snapshot(actor,target,ts);
 if p_action='list' then
  select coalesce(jsonb_agg(item),'[]') into v_rooms from(
   select jsonb_build_object('id',a.id,'code',a.code,'title',a.title,'hostName',h.name,'players',count(live.user_id),'capacity',a.capacity,'status',a.status) item
   from ojjuda_roulette_internal.rooms a join ojjuda_roulette_internal.players live on live.room_id=a.id and live.active
   join ojjuda_roulette_internal.players h on h.room_id=a.id and h.user_id=a.host_id
   where a.status='betting' and live.last_seen>ts-interval '2 minutes'
    and not exists(select 1 from ojjuda_roulette_internal.players b where b.room_id=a.id and b.active and (public.blocked_between(actor,b.user_id) or exists(select 1 from public.user_private u where u.user_id=b.user_id and u.banned_until>now())))
   group by a.id,h.name having count(live.user_id)<a.capacity order by a.created_at desc limit 30
  ) available;
  v_result:=v_result||jsonb_build_object('rooms',v_rooms);
 end if;
 return v_result;
end;$$;

create function public.roulette_action(p_action text,p_payload jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$
 select ojjuda_roulette_internal.action(p_action,p_payload);
$$;

revoke all on all functions in schema ojjuda_roulette_internal from public,anon,authenticated,service_role;
grant usage on schema ojjuda_roulette_internal to authenticated;
grant execute on function ojjuda_roulette_internal.action(text,jsonb) to authenticated;
revoke all on function public.roulette_action(text,jsonb) from public,anon,service_role;
grant execute on function public.roulette_action(text,jsonb) to authenticated;
commit;
