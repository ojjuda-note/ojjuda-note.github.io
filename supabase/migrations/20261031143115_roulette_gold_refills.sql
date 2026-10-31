-- Roulette-only gold: two lifetime free +10,000G refills, then 10 ZU each.
-- ZU keeps the established 1 ZU : 1,000G exchange rate used by card games.
begin;
set local lock_timeout='5s';

alter table ojjuda_roulette_internal.wallets
 add column free_used smallint not null default 0 check(free_used between 0 and 2);
create table ojjuda_roulette_internal.refills (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 charged smallint not null check(charged in(0,10)),
 gold_added integer not null default 10000 check(gold_added=10000),
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,request_id)
);
alter table ojjuda_roulette_internal.refills enable row level security;
revoke all on ojjuda_roulette_internal.refills from public,anon,authenticated,service_role;
create index roulette_unpaid_user on ojjuda_roulette_internal.entries(user_id) where settled_at is null;

create function ojjuda_roulette_internal.refill_locked(p_actor uuid)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select exists(
  select 1 from ojjuda_roulette_internal.players p join ojjuda_roulette_internal.rooms r on r.id=p.room_id
  where p.user_id=p_actor and p.active and (p.ready or p.stake>0 or r.status in('spinning','finished'))
 ) or exists(
  select 1 from ojjuda_roulette_internal.entries e where e.user_id=p_actor and e.settled_at is null
 );
$$;

create function ojjuda_roulette_internal.wallet_snapshot(p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare locked boolean;result jsonb;
begin
 locked:=ojjuda_roulette_internal.refill_locked(p_actor);
 select jsonb_build_object('gold',w.gold,'available',w.gold,'coins',u.coins,
  'free_left',2-w.free_used,'refill_cost',case when w.free_used<2 then 0 else 10 end,'refill_amount',10000,
  'refill_locked',locked,'can_refill',w.gold<1000 and not locked and (w.free_used<2 or u.coins>=10),
  'charged',0,'duplicate',false)
 into result from ojjuda_roulette_internal.wallets w join public.user_private u on u.user_id=w.user_id
 where w.user_id=p_actor;
 return result;
end;$$;

-- The action dispatcher already holds actor advisory and current-room locks.
-- Never lock a wallet before that room: another member's start can debit all
-- of the room's wallets. The receipt is checked before balance/round gates so
-- a lost response can be retried after the refill or after starting a round.
create function ojjuda_roulette_internal.apply_refill(p_actor uuid,p_request uuid,p_paid boolean,p_now timestamptz)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare w ojjuda_roulette_internal.wallets%rowtype;charge smallint:=0;duplicate boolean:=false;
begin
 if p_actor is distinct from auth.uid() then raise exception 'not_signed_in';end if;
 if p_request is null or p_paid is null then raise exception 'invalid_request';end if;
 select * into strict w from ojjuda_roulette_internal.wallets where user_id=p_actor for update;
 select charged into charge from ojjuda_roulette_internal.refills where user_id=p_actor and request_id=p_request;
 duplicate:=found;
 if not duplicate then
  if ojjuda_roulette_internal.refill_locked(p_actor) then raise exception 'round_in_progress';end if;
  if w.gold>=1000 then raise exception 'gold_not_empty';end if;
  if w.free_used<2 then
   charge:=0;w.free_used:=w.free_used+1;
  else
   if not p_paid then raise exception 'paid_confirmation_required';end if;
   update public.user_private set coins=coins-10,updated_at=now() where user_id=p_actor and coins>=10;
   if not found then raise exception 'insufficient_zzu';end if;
   charge:=10;
  end if;
  update ojjuda_roulette_internal.wallets set gold=gold+10000,free_used=w.free_used,updated_at=p_now where user_id=p_actor;
  insert into ojjuda_roulette_internal.refills(user_id,request_id,charged,created_at) values(p_actor,p_request,charge,p_now);
 end if;
 return ojjuda_roulette_internal.wallet_snapshot(p_actor)||jsonb_build_object('charged',charge,'duplicate',duplicate);
end;$$;
revoke all on function ojjuda_roulette_internal.refill_locked(uuid),
 ojjuda_roulette_internal.wallet_snapshot(uuid),
 ojjuda_roulette_internal.apply_refill(uuid,uuid,boolean,timestamptz)
 from public,anon,authenticated,service_role;

do $refill_dispatch$
declare definition text;anchor text;addition text;
begin
 definition:=pg_get_functiondef('ojjuda_roulette_internal.snapshot(uuid,uuid,timestamptz)'::regprocedure);
 anchor:=$wallet$select jsonb_build_object('gold',w.gold,'available',w.gold,'coins',u.coins) into v_wallet from ojjuda_roulette_internal.wallets w join public.user_private u on u.user_id=w.user_id where w.user_id=p_actor;$wallet$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette refill wallet prerequisite changed';end if;
 execute replace(definition,anchor,'v_wallet:=ojjuda_roulette_internal.wallet_snapshot(p_actor);');

 definition:=pg_get_functiondef('ojjuda_roulette_internal.action(text,jsonb)'::regprocedure);
 anchor:=$actions$'status','list','mine','create','join','read','bet','ready','start','confirm','leave'$actions$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette refill action prerequisite changed';end if;
 definition:=replace(definition,anchor,anchor||',''refill''');
 anchor:='last_duration integer;duration integer;';
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette refill variables prerequisite changed';end if;
 definition:=replace(definition,anchor,anchor||'refill_request uuid;refill_wallet jsonb;');

 anchor:=$room$ -- Fixed room ordering avoids deadlocks when two members switch rooms together.$room$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette refill room prerequisite changed';end if;
 definition:=replace(definition,anchor,$own_room$ -- A refill never operates on another room supplied by the client.
 if p_action='refill' then target:=existing;end if;
$own_room$||anchor);
 anchor:=$lock$ perform 1 from ojjuda_roulette_internal.rooms where id in(existing,target) order by id for update;$lock$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette refill lock prerequisite changed';end if;
 definition:=replace(definition,anchor,anchor||$clock$
 if p_action='refill' then ts:=clock_timestamp();end if;$clock$);

 anchor:=$create$ if p_action='create' then
  if coalesce(p_payload->>'mode','online')$create$;
 addition:=$refill$ if p_action='refill' then
  if p_payload ? 'paid' and jsonb_typeof(p_payload->'paid') is distinct from 'boolean' then raise exception 'invalid_request';end if;
  begin refill_request:=v_request::uuid;exception when invalid_text_representation then raise exception 'invalid_request';end;
  if refill_request is null then raise exception 'invalid_request';end if;
  refill_wallet:=ojjuda_roulette_internal.apply_refill(actor,refill_request,coalesce((p_payload->>'paid')::boolean,false),ts);
  if existing is not null then update ojjuda_roulette_internal.players set last_seen=ts where room_id=existing and user_id=actor and active;end if;
  return ojjuda_roulette_internal.snapshot(actor,existing,ts)||jsonb_build_object('wallet',refill_wallet);
 elsif p_action='create' then
  if coalesce(p_payload->>'mode','online')$refill$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'roulette refill dispatch prerequisite changed';end if;
 execute replace(definition,anchor,addition);
end;
$refill_dispatch$;
notify pgrst,'reload schema';
commit;
