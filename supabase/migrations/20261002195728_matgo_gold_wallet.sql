-- Matgo gold cannot be converted into 쭈. All wallet mutations are server-only.
create schema if not exists ojjuda_matgo_internal;
revoke all on schema ojjuda_matgo_internal from public, anon, authenticated;
grant usage on schema ojjuda_matgo_internal to service_role;

create table ojjuda_matgo_internal.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gold bigint not null default 5000 check (gold between 0 and 9007199254740991),
  refill_day date not null default ((now() at time zone 'Asia/Seoul')::date),
  free_used smallint not null default 0 check (free_used between 0 and 2),
  next_first smallint not null default 0 check (next_first in (0,1)),
  next_carry integer not null default 1 check (next_carry between 1 and 1024),
  round_id uuid,
  round_seed bigint,
  last_round uuid,
  updated_at timestamptz not null default now()
);
create table ojjuda_matgo_internal.refills (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  charged smallint not null check (charged in (0,5)),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table ojjuda_matgo_internal.wallets enable row level security;
alter table ojjuda_matgo_internal.refills enable row level security;
revoke all on ojjuda_matgo_internal.wallets,ojjuda_matgo_internal.refills from public,anon,authenticated;

create function ojjuda_matgo_internal.wallet_service(
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
  if public.is_banned(p_actor) then raise exception 'banned' using errcode='42501'; end if;
  select coins into v_coins from public.user_private where user_id=p_actor;
  if not found then raise exception 'no_account' using errcode='42501'; end if;
  if p_action not in ('status','start','round','settle','refill') then raise exception 'invalid_action'; end if;
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
  elsif p_action='start' then
    if w.gold<=0 then raise exception 'gold_empty'; end if;
    if w.round_id is null then
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
    next_first=w.next_first,next_carry=w.next_carry,round_id=w.round_id,round_seed=w.round_seed,last_round=w.last_round,updated_at=now()
    where user_id=p_actor;
  return jsonb_build_object('ok',true,'gold',w.gold,'free_left',2-w.free_used,'refill_day',w.refill_day,
    'coins',v_coins,'charged',coalesce(v_charge,0),'duplicate',v_duplicate,'settled',v_settled,
    'round',case when w.round_id is null then null else jsonb_build_object('id',w.round_id,'seed',w.round_seed,'gold',w.gold,'first',w.next_first,'carry',w.next_carry) end);
end;
$$;
revoke all on function ojjuda_matgo_internal.wallet_service(uuid,text,uuid,boolean,uuid,bigint,smallint,integer) from public,anon,authenticated;
grant execute on function ojjuda_matgo_internal.wallet_service(uuid,text,uuid,boolean,uuid,bigint,smallint,integer) to service_role;

create function public.matgo_wallet_service(
  p_actor uuid,p_action text,p_request uuid default null,p_paid boolean default false,
  p_round uuid default null,p_gold bigint default null,p_first smallint default null,p_carry integer default null)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
  select ojjuda_matgo_internal.wallet_service(p_actor,p_action,p_request,p_paid,p_round,p_gold,p_first,p_carry);
$$;
revoke all on function public.matgo_wallet_service(uuid,text,uuid,boolean,uuid,bigint,smallint,integer) from public,anon,authenticated;
grant execute on function public.matgo_wallet_service(uuid,text,uuid,boolean,uuid,bigint,smallint,integer) to service_role;
notify pgrst,'reload schema';
