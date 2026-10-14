-- Four additional cosmetic actions share the existing atomic one-ZU receipt flow.
-- CREATE OR REPLACE preserves existing service-only grants and ownership.
create or replace function ojjuda_matgo_internal.fun_service(
  p_actor uuid,p_action text,p_request uuid,p_reference uuid default null,p_effect text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;r ojjuda_matgo_internal.fun_purchases%rowtype;v_ref uuid;v_mode text;
  v_modes text[];v_price integer;v_coins integer;v_online uuid;
begin
  if p_action is null or p_action not in ('tazza','vent') or p_request is null then raise exception 'invalid_purchase';end if;
  if p_action='vent' and (p_reference is null or p_effect is null or p_effect not in ('gun','hammer','glove','bomb','lightning','table','burst','slash','tomato','bat')) then raise exception 'invalid_purchase';end if;
  -- The existing wallet service owns the match lock and validates identity/age/ban.
  -- Keep its lock order, then lock/debit the shared ZU balance in this transaction.
  s:=ojjuda_matgo_internal.wallet_with_fun(p_actor,'status');
  select * into r from ojjuda_matgo_internal.fun_purchases where request_id=p_request;
  if found then
    if r.user_id<>p_actor or r.kind<>p_action or (p_action='vent' and (r.reference_id<>p_reference or r.effect<>p_effect)) then raise exception 'purchase_mismatch';end if;
    if p_action='tazza' and (s->'round'->>'id')::uuid is distinct from r.reference_id then raise exception 'purchase_completed';end if;
    return s||jsonb_build_object('duplicate',true,'purchase',jsonb_build_object('id',r.request_id,'kind',r.kind,'effect',r.effect,'price',r.price));
  end if;
  if p_action='tazza' then
    if s->>'online_room' is not null then raise exception 'match_in_progress';end if;
    if s->'round'->>'id' is not null then
      if s->'round'->>'tazza_mode' is null then raise exception 'round_in_progress';end if;
      return s||jsonb_build_object('duplicate',true);
    end if;
    s:=ojjuda_matgo_internal.wallet_with_fun(p_actor,'start_stakes');
    v_ref:=(s->'round'->>'id')::uuid;v_price:=5;
    insert into ojjuda_matgo_internal.fun_modes(user_id) values(p_actor) on conflict do nothing;
    select remaining into v_modes from ojjuda_matgo_internal.fun_modes where user_id=p_actor for update;
    -- Upgrade existing bags lazily, preserving the order of unused regular modes.
    v_modes:=array_remove(coalesce(v_modes,array[]::text[]),'tan');
    if random()<0.05 then
      v_mode:='tan';
    else
      if cardinality(v_modes)=0 then
        select array_agg(mode order by random()) into v_modes
          from unnest(array['peek','ssang','gwang','godori','cheong','hong','cho']) as mode;
      end if;
      v_mode:=v_modes[1];
      v_modes:=v_modes[2:];
    end if;
    -- Tan never consumes a regular mode. Retries return above without drawing again.
    update ojjuda_matgo_internal.fun_modes set remaining=v_modes where user_id=p_actor;
  else
    v_ref:=p_reference;v_mode:=p_effect;v_price:=1;
    v_online:=(s->>'online_room')::uuid;
    if (s->'round'->>'id')::uuid is distinct from v_ref then
      if v_online is distinct from v_ref or not exists(select 1 from ojjuda_matgo_internal.rooms
          where id=v_ref and status='active' and ((host_id=p_actor and not bots[1]) or (guest_id=p_actor and not bots[2]))) then
        raise exception 'no_active_round';
      end if;
    end if;
  end if;
  update public.user_private set coins=coins-v_price,updated_at=now()
    where user_id=p_actor and coins>=v_price returning coins into v_coins;
  if not found then raise exception 'insufficient_zzu';end if;
  insert into ojjuda_matgo_internal.fun_purchases(request_id,user_id,kind,reference_id,effect,price)
    values(p_request,p_actor,p_action,v_ref,v_mode,v_price);
  s:=ojjuda_matgo_internal.wallet_with_fun(p_actor,'status');
  return s||jsonb_build_object('coins',v_coins,'duplicate',false,'purchase',jsonb_build_object('id',p_request,'kind',p_action,'effect',v_mode,'price',v_price));
end $$;
