-- Difficulty is account progress, independent of gold. Legacy live rounds keep NULL.
alter table ojjuda_matgo_internal.wallets
  add column cpu_level smallint not null default 1 check (cpu_level between 1 and 10),
  add column cpu_win_streak smallint not null default 0 check (cpu_win_streak between 0 and 4),
  add column cpu_loss_streak smallint not null default 0 check (cpu_loss_streak between 0 and 2),
  add constraint matgo_exclusive_streak check (cpu_win_streak=0 or cpu_loss_streak=0),
  add column round_cpu_level smallint check (round_cpu_level between 1 and 10);

create or replace function ojjuda_matgo_internal.wallet_service_v1(
  p_actor uuid,p_action text,p_request uuid default null,p_paid boolean default false,
  p_round uuid default null,p_gold bigint default null,p_first smallint default null,p_carry integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  -- Promote only between rounds; the live round keeps its own rate.
  if w.round_id is null then
    w.stake_rate:=greatest(w.stake_rate,ojjuda_matgo_internal.stake_for_gold(w.gold));
    w.stake_seen:=w.stake_rate;
  end if;
  if p_action='refill' then
    if p_request is null then raise exception 'request_id_required'; end if;
    select charged into v_charge from ojjuda_matgo_internal.refills where user_id=p_actor and request_id=p_request;
    v_duplicate:=found;
    if not v_duplicate then
      if w.round_id is not null then raise exception 'round_in_progress'; end if;
      if w.gold>=1000 then raise exception 'gold_not_empty'; end if;
      if w.free_used<2 then
        v_charge:=0;w.free_used:=w.free_used+1;
      else
        if p_paid is distinct from true then raise exception 'paid_confirmation_required'; end if;
        update public.user_private set coins=coins-5,updated_at=now() where user_id=p_actor and coins>=5 returning coins into v_coins;
        if not found then raise exception 'insufficient_zzu'; end if;
        v_charge:=5;
      end if;
      if w.gold=0 then w.next_first:=0;w.next_carry:=1;end if;
      w.gold:=w.gold+5000;
      insert into ojjuda_matgo_internal.refills(user_id,request_id,charged) values(p_actor,p_request,v_charge);
    end if;
  elsif p_action in('start','start_stakes') then
    if w.gold<=0 then raise exception 'gold_empty'; end if;
    if p_action='start' and (case when w.round_id is null then w.stake_rate else w.round_rate end)>100 then
      raise exception 'client_update_required';
    end if;
    if w.round_id is null then
      w.round_rate:=w.stake_rate;w.round_cpu_level:=w.cpu_level;
      w.round_id:=gen_random_uuid();w.round_seed:=floor(random()*4294967296)::bigint;
    end if;
  elsif p_action in ('round','settle') then
    if p_round is not null and w.last_round=p_round then v_settled:=true;
    elsif p_round is null or w.round_id is distinct from p_round then raise exception 'round_mismatch';
    elsif p_action='settle' then
      if p_gold is null or p_gold<0 or p_gold>9007199254740991 or p_first is null or p_first not in(0,1)
         or p_carry is null or p_carry<1 or p_carry>1024 then raise exception 'invalid_result'; end if;
      w.gold:=p_gold;w.next_first:=p_first;w.next_carry:=p_carry;
      w.last_round:=w.round_id;w.round_id:=null;w.round_seed:=null;w.round_cpu_level:=null;v_settled:=true;
    end if;
  end if;
  if w.round_id is null then
    w.stake_rate:=case when w.gold=0 then 100 else greatest(w.stake_rate,ojjuda_matgo_internal.stake_for_gold(w.gold)) end;
    w.stake_seen:=w.stake_rate;
  end if;
  update ojjuda_matgo_internal.wallets set gold=w.gold,refill_day=w.refill_day,free_used=w.free_used,
    next_first=w.next_first,next_carry=w.next_carry,round_id=w.round_id,round_seed=w.round_seed,last_round=w.last_round,
    stake_rate=w.stake_rate,stake_seen=w.stake_seen,round_rate=w.round_rate,round_cpu_level=w.round_cpu_level,updated_at=now()
    where user_id=p_actor returning * into w;
  return jsonb_build_object('ok',true,'gold',w.gold,'free_left',2-w.free_used,'refill_day',w.refill_day,
    'coins',v_coins,'charged',coalesce(v_charge,0),'duplicate',v_duplicate,'settled',v_settled,
    'stake_rate',w.stake_rate,
    'stake_offer',null,'cpu_level',w.cpu_level,'cpu_win_streak',w.cpu_win_streak,'cpu_loss_streak',w.cpu_loss_streak,
    'round',case when w.round_id is null then null else jsonb_build_object('id',w.round_id,'seed',w.round_seed,'gold',w.gold,'first',w.next_first,'carry',w.next_carry,'rate',w.round_rate,'cpu_level',w.round_cpu_level,'rules_version',case when w.round_cpu_level is null then 10 else 11 end) end);
end;
$$;

revoke all on function ojjuda_matgo_internal.wallet_service_v1(uuid,text,uuid,boolean,uuid,bigint,smallint,integer) from public,anon,authenticated;

-- Gold settlement and the verified win/loss are committed under the same lock.
-- Only the Edge verifier supplies an outcome. Paid rounds and draws never count.
create function ojjuda_matgo_internal.ranked_settle(
  p_actor uuid,p_round uuid,p_gold bigint,p_first smallint,p_carry integer,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;w ojjuda_matgo_internal.wallets%rowtype;v_count boolean;v_wins integer;v_losses integer;v_level integer;
begin
  s:=ojjuda_matgo_internal.wallet_with_fun(p_actor,'status');
  select * into strict w from ojjuda_matgo_internal.wallets where user_id=p_actor for update;
  if p_round is not null and w.last_round=p_round then return s||jsonb_build_object('settled',true);end if;
  if p_round is null or w.round_id is distinct from p_round then raise exception 'round_mismatch';end if;
  if w.round_cpu_level is null or p_outcome is null or p_outcome not in('win','loss','draw') then raise exception 'invalid_result';end if;
  v_count:=p_outcome<>'draw' and not exists(select 1 from ojjuda_matgo_internal.fun_purchases
    where user_id=p_actor and kind='tazza' and reference_id=p_round);
  s:=ojjuda_matgo_internal.wallet_with_fun(p_actor,'settle',null,false,p_round,p_gold,p_first,p_carry);
  if v_count then
    v_wins:=case when p_outcome='win' then w.cpu_win_streak+1 else 0 end;
    v_losses:=case when p_outcome='loss' then w.cpu_loss_streak+1 else 0 end;
    v_level:=w.cpu_level;
    if v_wins=5 or v_losses=3 then
      v_level:=greatest(1,least(10,v_level+case when v_wins=5 then 1 else -1 end));
      v_wins:=0;v_losses:=0;
    end if;
    update ojjuda_matgo_internal.wallets set cpu_level=v_level,cpu_win_streak=v_wins,cpu_loss_streak=v_losses,updated_at=now() where user_id=p_actor;
    s:=ojjuda_matgo_internal.wallet_with_fun(p_actor,'status')||jsonb_build_object('settled',true);
  end if;
  return s;
end $$;
revoke all on function ojjuda_matgo_internal.ranked_settle(uuid,uuid,bigint,smallint,integer,text) from public,anon,authenticated;
grant execute on function ojjuda_matgo_internal.ranked_settle(uuid,uuid,bigint,smallint,integer,text) to service_role;
create function public.matgo_ranked_settle(p_actor uuid,p_round uuid,p_gold bigint,p_first smallint,p_carry integer,p_outcome text)
returns jsonb language sql security invoker set search_path='' as $$
  select ojjuda_matgo_internal.ranked_settle(p_actor,p_round,p_gold,p_first,p_carry,p_outcome);
$$;
revoke all on function public.matgo_ranked_settle(uuid,uuid,bigint,smallint,integer,text) from public,anon,authenticated;
grant execute on function public.matgo_ranked_settle(uuid,uuid,bigint,smallint,integer,text) to service_role;

-- A stale consent dialog cannot change automatic rates or its current round.
create or replace function ojjuda_matgo_internal.stake_service(p_actor uuid,p_rate integer,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_accept is null or p_rate is null or p_rate not in(200,500,2000,5000,10000,20000,50000,100000) then raise exception 'invalid_stake';end if;
  return ojjuda_matgo_internal.wallet_with_fun(p_actor,'status');
end $$;
revoke all on function ojjuda_matgo_internal.stake_service(uuid,integer,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
