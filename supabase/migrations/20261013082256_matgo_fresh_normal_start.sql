-- An explicit normal start must not silently resume an unfinished paid tazza deal.
-- Paid retries still use fun_service('tazza'); balances and purchase receipts stay intact.
create or replace function ojjuda_matgo_internal.wallet_with_fun(
  p_actor uuid,p_action text,p_request uuid default null,p_paid boolean default false,
  p_round uuid default null,p_gold bigint default null,p_first smallint default null,p_carry integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;m text;
begin
  -- Validate age/account/online state and hold the existing wallet lock first.
  s:=ojjuda_matgo_internal.wallet_service(p_actor,p_action,p_request,p_paid,p_round,p_gold,p_first,p_carry);
  if p_action in ('start','start_stakes') and exists(
    select 1 from ojjuda_matgo_internal.fun_purchases
    where user_id=p_actor and kind='tazza' and reference_id=(s->'round'->>'id')::uuid
  ) then
    update ojjuda_matgo_internal.wallets set round_id=null,round_seed=null
      where user_id=p_actor and round_id=(s->'round'->>'id')::uuid;
    s:=ojjuda_matgo_internal.wallet_service(p_actor,p_action,p_request,p_paid,p_round,p_gold,p_first,p_carry);
  end if;
  if s->'round' is not null and s->'round'<>'null'::jsonb then
    select effect into m from ojjuda_matgo_internal.fun_purchases
      where user_id=p_actor and kind='tazza' and reference_id=(s->'round'->>'id')::uuid;
    s:=jsonb_set(s,'{round,tazza_mode}',coalesce(to_jsonb(m),'null'::jsonb));
  end if;
  return s;
end $$;
revoke all on function ojjuda_matgo_internal.wallet_with_fun(uuid,text,uuid,boolean,uuid,bigint,smallint,integer) from public,anon,authenticated;
grant execute on function ojjuda_matgo_internal.wallet_with_fun(uuid,text,uuid,boolean,uuid,bigint,smallint,integer) to service_role;
notify pgrst,'reload schema';
