-- Solo stakes are explicit, persistent choices. Member matches always use 100G.
alter table ojjuda_matgo_internal.wallets
  add column stake_rate integer not null default 100 check(stake_rate in(100,200,500,2000,5000,10000,20000,50000,100000)),
  add column stake_seen integer not null default 100 check(stake_seen in(100,200,500,2000,5000,10000,20000,50000,100000)),
  add column round_rate integer not null default 100 check(round_rate in(100,200,500,2000,5000,10000,20000,50000,100000));

create function ojjuda_matgo_internal.stake_for_gold(p_gold bigint)
returns integer language sql immutable security invoker set search_path=pg_catalog as $$
  select case when p_gold>=900000 then 100000 when p_gold>=800000 then 50000
    when p_gold>=700000 then 20000 when p_gold>=600000 then 10000
    when p_gold>=500000 then 5000 when p_gold>=400000 then 2000
    when p_gold>=300000 then 500 when p_gold>=200000 then 200 else 100 end;
$$;
revoke all on function ojjuda_matgo_internal.stake_for_gold(bigint) from public,anon,authenticated;

-- Cover bankruptcy from both solo settlement and member-match transfers.
create function ojjuda_matgo_internal.reset_empty_stake()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if new.gold=0 then new.stake_rate:=100;new.stake_seen:=100;end if;
  return new;
end;
$$;
revoke all on function ojjuda_matgo_internal.reset_empty_stake() from public,anon,authenticated;
create trigger matgo_reset_empty_stake before insert or update on ojjuda_matgo_internal.wallets
  for each row execute function ojjuda_matgo_internal.reset_empty_stake();

create or replace function ojjuda_matgo_internal.wallet_service_v1(
  p_actor uuid,p_action text,p_request uuid default null,p_paid boolean default false,
  p_round uuid default null,p_gold bigint default null,p_first smallint default null,p_carry integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare w ojjuda_matgo_internal.wallets%rowtype; v_birth date;
  v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_coins integer; v_charge smallint := 0; v_duplicate boolean := false; v_settled boolean := false;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then
    raise exception 'not_signed_in' using errcode='42501';
  end if;
  select birth_date into v_birth from ojjuda_account_internal.member_identity where user_id=p_actor;
  if v_birth is null then raise exception 'member_identity_required' using errcode='42501'; end if;
  if ojjuda_account_internal.age_on(v_birth,v_today)<19 then raise exception 'adult_required' using errcode='42501'; end if;
  if exists(select 1 from public.user_private banned
    where banned.user_id=p_actor and banned.banned_until>now()) then
    raise exception 'banned' using errcode='42501';
  end if;
  select coins into v_coins from public.user_private where user_id=p_actor;
  if not found then raise exception 'no_account' using errcode='42501'; end if;
  if p_action not in ('status','start','start_stakes','round','settle','refill') then raise exception 'invalid_action'; end if;
  insert into ojjuda_matgo_internal.wallets(user_id) values(p_actor) on conflict do nothing;
  select * into strict w from ojjuda_matgo_internal.wallets where user_id=p_actor for update;
  if w.refill_day<>v_today then w.refill_day:=v_today;w.free_used:=0;end if;
  if p_action='refill' then
    if p_request is null then raise exception 'request_id_required'; end if;
    select charged into v_charge from ojjuda_matgo_internal.refills where user_id=p_actor and request_id=p_request;
    v_duplicate:=found;
    if not v_duplicate then
      if w.gold>0 then raise exception 'gold_not_empty'; end if;
      if w.free_used<2 then
        v_charge:=0;w.free_used:=w.free_used+1;
      else
        if p_paid is distinct from true then raise exception 'paid_confirmation_required'; end if;
        update public.user_private set coins=coins-5,updated_at=now() where user_id=p_actor and coins>=5 returning coins into v_coins;
        if not found then raise exception 'insufficient_zzu'; end if;
        v_charge:=5;
      end if;
      w.gold:=5000;w.round_id:=null;w.round_seed:=null;w.next_first:=0;w.next_carry:=1;
      insert into ojjuda_matgo_internal.refills(user_id,request_id,charged) values(p_actor,p_request,v_charge);
    end if;
  elsif p_action in('start','start_stakes') then
    if w.gold<=0 then raise exception 'gold_empty'; end if;
    if p_action='start' and (case when w.round_id is null then w.stake_rate else w.round_rate end)>100 then
      raise exception 'client_update_required';
    end if;
    if w.round_id is null then
      if p_action='start_stakes' and ojjuda_matgo_internal.stake_for_gold(w.gold)>greatest(w.stake_rate,w.stake_seen) then
        raise exception 'stake_offer_pending';
      end if;
      w.round_rate:=w.stake_rate;
      w.round_id:=gen_random_uuid();w.round_seed:=floor(random()*4294967296)::bigint;
    end if;
  elsif p_action in ('round','settle') then
    if p_round is not null and w.last_round=p_round then v_settled:=true;
    elsif p_round is null or w.round_id is distinct from p_round then raise exception 'round_mismatch';
    elsif p_action='settle' then
      if p_gold is null or p_gold<0 or p_gold>9007199254740991 or p_first is null or p_first not in(0,1)
         or p_carry is null or p_carry<1 or p_carry>1024 then raise exception 'invalid_result'; end if;
      w.gold:=p_gold;w.next_first:=p_first;w.next_carry:=p_carry;
      w.last_round:=w.round_id;w.round_id:=null;w.round_seed:=null;v_settled:=true;
    end if;
  end if;
  update ojjuda_matgo_internal.wallets set gold=w.gold,refill_day=w.refill_day,free_used=w.free_used,
    next_first=w.next_first,next_carry=w.next_carry,round_id=w.round_id,round_seed=w.round_seed,last_round=w.last_round,
    stake_rate=w.stake_rate,stake_seen=w.stake_seen,round_rate=w.round_rate,updated_at=now()
    where user_id=p_actor returning * into w;
  return jsonb_build_object('ok',true,'gold',w.gold,'free_left',2-w.free_used,'refill_day',w.refill_day,
    'coins',v_coins,'charged',coalesce(v_charge,0),'duplicate',v_duplicate,'settled',v_settled,
    'stake_rate',w.stake_rate,
    'stake_offer',case when w.round_id is null and w.online_room is null and ojjuda_matgo_internal.stake_for_gold(w.gold)>greatest(w.stake_rate,w.stake_seen)
      then jsonb_build_object('rate',ojjuda_matgo_internal.stake_for_gold(w.gold),'threshold',least(900000,(w.gold/100000)*100000)) else null end,
    'round',case when w.round_id is null then null else jsonb_build_object('id',w.round_id,'seed',w.round_seed,'gold',w.gold,'first',w.next_first,'carry',w.next_carry,'rate',w.round_rate) end);
end;
$$;

-- Only the authenticated Edge handler can invoke the public service-role wrapper.
-- Reuse the shared advisory lock, row lock, age/ban checks and online-room guard.
create function ojjuda_matgo_internal.stake_service(p_actor uuid,p_rate integer,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_state jsonb;w ojjuda_matgo_internal.wallets%rowtype;v_offer integer;
begin
  v_state:=ojjuda_matgo_internal.wallet_service(p_actor,'status');
  select * into strict w from ojjuda_matgo_internal.wallets where user_id=p_actor for update;
  if w.online_room is not null then raise exception 'match_in_progress';end if;
  if p_accept is null or p_rate is null or p_rate not in(200,500,2000,5000,10000,20000,50000,100000) then raise exception 'invalid_stake';end if;
  -- A network retry after a successful choice cannot change the rate again.
  if (p_accept and w.stake_rate=p_rate) or (not p_accept and w.stake_seen=p_rate) then return v_state;end if;
  if w.round_id is not null then raise exception 'round_in_progress';end if;
  v_offer:=ojjuda_matgo_internal.stake_for_gold(w.gold);
  if p_rate<>v_offer or p_rate<=greatest(w.stake_rate,w.stake_seen) then raise exception 'stake_offer_changed';end if;
  update ojjuda_matgo_internal.wallets set stake_rate=case when p_accept then p_rate else stake_rate end,
    stake_seen=p_rate,updated_at=now() where user_id=p_actor;
  return ojjuda_matgo_internal.wallet_service(p_actor,'status');
end;
$$;
revoke all on function ojjuda_matgo_internal.stake_service(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function ojjuda_matgo_internal.stake_service(uuid,integer,boolean) to service_role;
create function public.matgo_stake_service(p_actor uuid,p_rate integer,p_accept boolean)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
  select ojjuda_matgo_internal.stake_service(p_actor,p_rate,p_accept);
$$;
revoke all on function public.matgo_stake_service(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.matgo_stake_service(uuid,integer,boolean) to service_role;
