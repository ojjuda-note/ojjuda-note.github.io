-- Flat screw holes cost one ju each, with three purchases per member and stage.
-- Reuse the wallet lock and idempotent receipts used by the box screw game.
create index if not exists spend_requests_flat_screw_stage
  on ojjuda_note_internal.spend_requests(user_id, (result ->> 'stage'))
  where kind = 'screw_flat_hole';

create or replace function public.screw_upgrade_buy(p_kind text, p_request_id uuid, p_stage integer, p_verify_only boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  if p_kind is null or p_kind not in ('box', 'buffer', 'flat_hole')
     or p_stage is null or p_stage < 1 or p_stage > (case when p_kind = 'flat_hole' then 1000 else 500 end)
     or p_verify_only is null
     or (p_request_id is null and not (p_kind = 'flat_hole' and p_verify_only)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  v_kind := 'screw_' || p_kind;
  v_price := case p_kind when 'box' then 10 when 'buffer' then 3 else 1 end;
  select coins into v_coins from public.user_private where user_id = v_user for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'wallet_unavailable'); end if;

  if p_kind = 'flat_hole' then
    select count(*)::integer into v_count from ojjuda_note_internal.spend_requests
      where user_id = v_user and kind = 'screw_flat_hole' and result ->> 'stage' = p_stage::text;
    v_meta := jsonb_build_object('stage', p_stage, 'count', v_count, 'price', 1);
    if p_request_id is null then
      return v_meta || jsonb_build_object('ok', true, 'kind', p_kind, 'coins', v_coins);
    end if;
  end if;

  select user_id, kind, coins, result into v_previous
    from ojjuda_note_internal.spend_requests where request_id = p_request_id;
  if found then
    if v_previous.user_id <> v_user or v_previous.kind <> v_kind or v_previous.coins <> v_price
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
  if p_kind = 'flat_hole' then v_result := v_result || jsonb_build_object('count', v_count + 1); end if;
  insert into ojjuda_note_internal.spend_requests(request_id, user_id, kind, coins, result)
    values (p_request_id, v_user, v_kind, v_price, v_result);
  return v_result;
end;
$function$;

revoke all on function public.screw_upgrade_buy(text, uuid, integer, boolean) from public, anon;
grant execute on function public.screw_upgrade_buy(text, uuid, integer, boolean) to authenticated, service_role;
notify pgrst, 'reload schema';
