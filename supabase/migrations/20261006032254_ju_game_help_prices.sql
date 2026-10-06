-- Versioned endpoints keep cached clients and old receipts compatible.
CREATE OR REPLACE FUNCTION public.screw_upgrade_buy_v2(p_kind text, p_request_id uuid, p_stage integer, p_verify_only boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_kind text;
  v_price integer;
  v_coins integer;
  v_previous record;
  v_result jsonb;
  v_count integer := 0;
  v_meta jsonb := '{}'::jsonb;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok', false, 'reason', 'banned'); end if;
  if p_kind is null or p_kind not in ('box', 'buffer', 'flat_hole', 'flat_moves')
     or p_stage is null or p_stage < 1 or p_stage > (case when p_kind in ('flat_hole', 'flat_moves') then 1000 else 500 end)
     or p_verify_only is null
     or (p_request_id is null and not (p_kind in ('flat_hole', 'flat_moves') and p_verify_only)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  v_kind := 'screw_' || p_kind;
  v_price := case p_kind when 'box' then 3 when 'buffer' then 1 else 1 end;
  select coins into v_coins from public.user_private where user_id = v_user for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'wallet_unavailable'); end if;

  if p_kind in ('flat_hole', 'flat_moves') then
    if p_kind = 'flat_hole' then
      select count(*)::integer into v_count from ojjuda_note_internal.spend_requests
        where user_id = v_user and kind = 'screw_flat_hole' and result ->> 'stage' = p_stage::text;
    else
      select count(*)::integer into v_count from ojjuda_note_internal.spend_requests
        where user_id = v_user and kind = 'screw_flat_moves' and result ->> 'stage' = p_stage::text;
    end if;
    v_meta := jsonb_build_object('stage', p_stage, 'count', v_count, 'price', 1);
    if p_kind = 'flat_moves' then v_meta := v_meta || jsonb_build_object('extra_moves', v_count * 3, 'moves_per_purchase', 3); end if;
    if p_request_id is null then
      return v_meta || jsonb_build_object('ok', true, 'kind', p_kind, 'coins', v_coins);
    end if;
  end if;

  select user_id, kind, coins, result into v_previous
    from ojjuda_note_internal.spend_requests where request_id = p_request_id;
  if found then
    if v_previous.user_id <> v_user or v_previous.kind <> v_kind
       or v_previous.result ->> 'stage' is distinct from p_stage::text then
      return jsonb_build_object('ok', false, 'reason', 'request_conflict', 'coins', v_coins);
    end if;
    return v_previous.result || v_meta || jsonb_build_object('coins', v_coins);
  end if;

  if p_verify_only then
    return v_meta || jsonb_build_object('ok', false, 'reason', 'not_found', 'coins', v_coins);
  end if;
  if p_kind = 'flat_hole' and v_count >= 3 then
    return v_meta || jsonb_build_object('ok', false, 'reason', 'limit', 'coins', v_coins);
  end if;
  if v_coins < v_price then
    return v_meta || jsonb_build_object('ok', false, 'reason', 'coins', 'coins', v_coins, 'price', v_price);
  end if;
  update public.user_private set coins = coins - v_price
    where user_id = v_user and coins >= v_price returning coins into v_coins;
  if not found then return jsonb_build_object('ok', false, 'reason', 'coins'); end if;

  v_result := jsonb_build_object('ok', true, 'kind', p_kind, 'price', v_price, 'coins', v_coins, 'stage', p_stage);
  if p_kind in ('flat_hole', 'flat_moves') then v_result := v_result || jsonb_build_object('count', v_count + 1); end if;
  if p_kind = 'flat_moves' then v_result := v_result || jsonb_build_object('extra_moves', (v_count + 1) * 3, 'moves_per_purchase', 3); end if;
  insert into ojjuda_note_internal.spend_requests(request_id, user_id, kind, coins, result)
    values (p_request_id, v_user, v_kind, v_price, v_result);
  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.spot_game_buy_v2(p_kind text, p_request_id uuid, p_stage integer, p_spot integer DEFAULT '-1'::integer, p_verify_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_price integer;
  v_coins integer;
  v_previous record;
  v_result jsonb;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned'); end if;
  if p_request_id is null or p_stage is null or p_stage not between 1 and 48
     or p_kind is null or p_kind not in ('hint','time') or p_spot is null
     or (p_kind='hint' and p_spot not between 0 and 5)
     or (p_kind='time' and p_spot<>-1) or p_verify_only is null then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  v_price:=1;
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  select user_id,kind,coins,result into v_previous
    from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if v_previous.user_id<>v_user or v_previous.kind<>'spot_'||p_kind
       or v_previous.result->>'stage' is distinct from p_stage::text
       or v_previous.result->>'spot' is distinct from p_spot::text then
      return jsonb_build_object('ok',false,'reason','request_conflict','coins',v_coins);
    end if;
    return v_previous.result || jsonb_build_object('coins',v_coins);
  end if;
  if p_verify_only then return jsonb_build_object('ok',false,'reason','not_found','coins',v_coins); end if;
  if v_coins<v_price then return jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',v_price); end if;
  update public.user_private set coins=coins-v_price where user_id=v_user and coins>=v_price returning coins into v_coins;
  if not found then return jsonb_build_object('ok',false,'reason','coins'); end if;
  v_result:=jsonb_build_object('ok',true,'kind',p_kind,'price',v_price,'coins',v_coins,'stage',p_stage,'spot',p_spot,'extend_ms',case when p_kind='time' then 30000 else 0 end);
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result)
    values(p_request_id,v_user,'spot_'||p_kind,v_price,v_result);
  return v_result;
end;
$function$;

revoke all on function public.screw_upgrade_buy_v2(text,uuid,integer,boolean), public.spot_game_buy_v2(text,uuid,integer,integer,boolean) from public,anon;
grant execute on function public.screw_upgrade_buy_v2(text,uuid,integer,boolean), public.spot_game_buy_v2(text,uuid,integer,integer,boolean) to authenticated;
