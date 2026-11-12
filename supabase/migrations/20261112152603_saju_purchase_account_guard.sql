-- Bind a purchase to the member who clicked, even if Supabase obtains a newer
-- session token while dispatching the request. A changed account cannot pay for
-- an earlier account's chart fingerprint.
-- Keep the already applied purchase logic intact, with no client execute grant.
revoke all on function public.saju_reading_buy_v1(uuid,text,boolean)
  from public, anon, authenticated;
revoke all on function ojjuda_saju_internal.buy_v1(uuid,text,boolean)
  from public, anon, authenticated;

create function ojjuda_saju_internal.buy_v1(
  p_request_id uuid, p_chart_key text, p_expected_user uuid,
  p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if p_expected_user is distinct from v_user then
    return pg_catalog.jsonb_build_object('ok',false,'reason','account_changed');
  end if;
  return ojjuda_saju_internal.buy_v1(p_request_id,p_chart_key,p_verify_only);
end;
$function$;
revoke all on function ojjuda_saju_internal.buy_v1(uuid,text,uuid,boolean)
  from public, anon;
grant execute on function ojjuda_saju_internal.buy_v1(uuid,text,uuid,boolean)
  to authenticated;

create function public.saju_reading_buy_v1(
  p_request_id uuid, p_chart_key text, p_expected_user uuid,
  p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path = '' as $function$
  select ojjuda_saju_internal.buy_v1(p_request_id,p_chart_key,p_expected_user,p_verify_only);
$function$;
revoke all on function public.saju_reading_buy_v1(uuid,text,uuid,boolean)
  from public, anon;
grant execute on function public.saju_reading_buy_v1(uuid,text,uuid,boolean)
  to authenticated;

notify pgrst, 'reload schema';
