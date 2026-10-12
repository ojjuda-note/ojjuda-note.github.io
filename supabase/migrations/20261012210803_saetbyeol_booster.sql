-- A server-priced consumable, using the existing private, atomic JU receipts.
create schema if not exists ojjuda_shop_internal;
revoke all on schema ojjuda_shop_internal from public, anon;
grant usage on schema ojjuda_shop_internal to authenticated;

create or replace function ojjuda_shop_internal.saetbyeol_booster_buy(
  p_request_id uuid, p_run_id uuid, p_stage integer, p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_coins integer;
  v_previous record;
  v_result jsonb;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned'); end if;
  if p_request_id is null or p_run_id is null or p_stage is null or p_stage not between 0 and 4 or p_verify_only is null then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;

  select coins into v_coins from public.user_private where user_id = v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id = p_request_id;
  if found then
    if v_previous.user_id <> v_user or v_previous.kind <> 'saetbyeol_booster'
       or v_previous.result->>'run_id' is distinct from p_run_id::text
       or v_previous.result->>'stage' is distinct from p_stage::text then
      return jsonb_build_object('ok',false,'reason','request_conflict','coins',v_coins);
    end if;
    return v_previous.result || jsonb_build_object('coins',v_coins);
  end if;
  if p_verify_only then return jsonb_build_object('ok',false,'reason','not_found','coins',v_coins); end if;
  if v_coins < 3 then return jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',3); end if;

  update public.user_private set coins = coins - 3 where user_id = v_user and coins >= 3 returning coins into v_coins;
  if not found then return jsonb_build_object('ok',false,'reason','coins'); end if;
  v_result := jsonb_build_object('ok',true,'kind','saetbyeol_booster','price',3,'coins',v_coins,
    'run_id',p_run_id,'stage',p_stage,'seconds',5,'density',2);
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result)
    values(p_request_id,v_user,'saetbyeol_booster',3,v_result);
  return v_result;
end;
$$;
revoke all on function ojjuda_shop_internal.saetbyeol_booster_buy(uuid,uuid,integer,boolean) from public, anon;
grant execute on function ojjuda_shop_internal.saetbyeol_booster_buy(uuid,uuid,integer,boolean) to authenticated;

create or replace function public.saetbyeol_booster_buy(
  p_request_id uuid, p_run_id uuid, p_stage integer, p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path = '' as $$
  select ojjuda_shop_internal.saetbyeol_booster_buy(p_request_id,p_run_id,p_stage,p_verify_only);
$$;
revoke all on function public.saetbyeol_booster_buy(uuid,uuid,integer,boolean) from public, anon;
grant execute on function public.saetbyeol_booster_buy(uuid,uuid,integer,boolean) to authenticated;
