-- A server-priced consumable, using the existing private, atomic JU receipts.
create schema if not exists ojjuda_shop_internal;
revoke all on schema ojjuda_shop_internal from public, anon;
grant usage on schema ojjuda_shop_internal to authenticated;

create or replace function ojjuda_shop_internal.sacheonseong_tool_buy(
  p_kind text, p_request_id uuid, p_run_id uuid, p_stage integer, p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_coins integer;
  v_price integer;
  v_previous record;
  v_result jsonb;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned'); end if;
  if p_kind is null or p_kind not in ('hint','shuffle') or p_request_id is null or p_run_id is null or p_stage is null or p_stage not between 1 and 15 or p_verify_only is null then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;

  v_price := case p_kind when 'hint' then 3 else 10 end;
  select coins into v_coins from public.user_private where user_id = v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id = p_request_id;
  if found then
    if v_previous.user_id <> v_user or v_previous.kind <> 'sacheonseong_' || p_kind
       or v_previous.result->>'run_id' is distinct from p_run_id::text
       or v_previous.result->>'stage' is distinct from p_stage::text then
      return jsonb_build_object('ok',false,'reason','request_conflict','coins',v_coins);
    end if;
    return v_previous.result || jsonb_build_object('coins',v_coins);
  end if;
  if p_verify_only then return jsonb_build_object('ok',false,'reason','not_found','coins',v_coins); end if;
  if v_coins < v_price then return jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',v_price); end if;

  update public.user_private set coins = coins - v_price where user_id = v_user and coins >= v_price returning coins into v_coins;
  if not found then return jsonb_build_object('ok',false,'reason','coins'); end if;
  v_result := jsonb_build_object('ok',true,'kind',p_kind,'price',v_price,'coins',v_coins,
    'run_id',p_run_id,'stage',p_stage);
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result)
    values(p_request_id,v_user,'sacheonseong_' || p_kind,v_price,v_result);
  return v_result;
end;
$$;
revoke all on function ojjuda_shop_internal.sacheonseong_tool_buy(text,uuid,uuid,integer,boolean) from public, anon;
grant execute on function ojjuda_shop_internal.sacheonseong_tool_buy(text,uuid,uuid,integer,boolean) to authenticated;

create or replace function public.sacheonseong_tool_buy(
  p_kind text, p_request_id uuid, p_run_id uuid, p_stage integer, p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path = '' as $$
  select ojjuda_shop_internal.sacheonseong_tool_buy(p_kind,p_request_id,p_run_id,p_stage,p_verify_only);
$$;
revoke all on function public.sacheonseong_tool_buy(text,uuid,uuid,integer,boolean) from public, anon;
grant execute on function public.sacheonseong_tool_buy(text,uuid,uuid,integer,boolean) to authenticated;
