-- New compatibility purchases and explicit renewals cost 20 ju.
-- Keep every existing 10-ju ledger row and its original 24-hour entitlement.
-- Fingerprints, purchase UUIDs, ordinary saju prices and the 30-ju bundle stay
-- unchanged. A stale 10-ju quote is recognized and rejected as price_changed.

alter table ojjuda_saju_internal.compatibility_entitlements
  drop constraint compatibility_entitlements_price_check,
  alter column price set default 20,
  add constraint compatibility_entitlements_price_check check (price in (10,20));

comment on table ojjuda_saju_internal.compatibility_entitlements is
  'Current separate compatibility access, newly purchased for 20 ju. Legacy 10-ju access retains its original price and 24-hour deadline; renewal preserves immutable spend history.';

-- Validate the actual price of each historical receipt against its paid ledger.
-- The top-level status price below is the current price for a new purchase.
create or replace function ojjuda_saju_internal.compatibility_receipt_v1(
  p_user uuid,p_pair_key text,p_coins integer,p_now timestamptz,
  p_replayed boolean,p_entitlement_replayed boolean,p_charged integer
) returns jsonb language sql stable security invoker set search_path='' as $function$
  select pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',e.request_id,'pair_key',e.pair_key,
    'product','saju','topic','compatibility','title','사주 궁합','price',e.price,
    'coins',p_coins,'charged',p_charged,'replayed',p_replayed,
    'entitlement_replayed',p_entitlement_replayed,
    'paid_at',e.purchased_at,'expires_at',e.purchased_at+interval '24 hours',
    'server_now',p_now,'access_hours',24,'access_version',1,'entitlement_version',1
  )
  from ojjuda_saju_internal.compatibility_entitlements e
  join ojjuda_note_internal.spend_requests s on s.request_id=e.request_id
  where e.user_id=p_user and e.pair_key=p_pair_key
    and s.user_id=e.user_id and s.kind='saju_compatibility_v1' and e.price in (10,20) and s.coins=e.price
    and s.created_at=e.purchased_at
    and s.result->'ok'='true'::jsonb and s.result->'entitled'='true'::jsonb
    and s.result->>'request_id'=e.request_id::text and s.result->>'pair_key'=e.pair_key
    and s.result->>'product'='saju' and s.result->>'topic'='compatibility'
    and s.result->>'price'=e.price::text and s.result->>'charged'=e.price::text
    and s.result->>'access_version'='1' and s.result->>'access_hours'='24'
    and s.result->>'entitlement_version'='1';
$function$;
revoke all on function ojjuda_saju_internal.compatibility_receipt_v1(uuid,text,integer,timestamptz,boolean,boolean,integer)
  from public,anon,authenticated,service_role;

create or replace function ojjuda_saju_internal.compatibility_status_v1(p_pair_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid:=auth.uid();
  v_pair_key text:=pg_catalog.lower(p_pair_key);
  v_coins integer;
  v_now timestamptz;
  v_item jsonb;
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if v_pair_key is not null and v_pair_key !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if public.is_banned(v_user) then return pg_catalog.jsonb_build_object('ok',false,'reason','banned'); end if;
  select coins into v_coins from public.user_private where user_id=v_user;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  v_now:=pg_catalog.clock_timestamp();
  if v_pair_key is not null and exists(select 1 from ojjuda_saju_internal.compatibility_entitlements
    where user_id=v_user and pair_key=v_pair_key) then
    v_item:=ojjuda_saju_internal.compatibility_receipt_v1(v_user,v_pair_key,v_coins,v_now,true,true,0);
    if v_item is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    if (v_item->>'expires_at')::timestamptz<=v_now then v_item:=null; end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',true,'coins',v_coins,'pair_key',v_pair_key,'price',20,
    'server_now',v_now,'access_hours',24,'access_version',1,'entitlement_version',1,
    'entitlement',v_item
  );
end;
$function$;
revoke all on function ojjuda_saju_internal.compatibility_status_v1(text) from public,anon,authenticated,service_role;
grant execute on function ojjuda_saju_internal.compatibility_status_v1(text) to authenticated;

create or replace function ojjuda_saju_internal.compatibility_buy_v1(
  p_request_id uuid,p_pair_key text,p_expected_user uuid,
  p_expected_charge integer,p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid:=auth.uid();
  v_pair_key text:=pg_catalog.lower(p_pair_key);
  v_coins integer;
  v_previous record;
  v_item jsonb;
  v_result jsonb;
  v_now timestamptz;
  v_required integer:=20;
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if p_expected_user is distinct from v_user then
    return pg_catalog.jsonb_build_object('ok',false,'reason','account_changed');
  end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if p_request_id is null or v_pair_key is null or v_pair_key !~ '^[0-9a-f]{64}$'
    or p_expected_charge is null or p_expected_charge not in (0,10,20) or p_verify_only is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if p_verify_only then
    -- Recovery can run in a read-only transaction: no row/advisory locks and no writes.
    select coins into v_coins from public.user_private where user_id=v_user;
  else
    -- Same lock order as the existing paid products: global UUID, then wallet.
    -- A wallet lock also serializes different UUIDs for the same member/pair.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
    select coins into v_coins from public.user_private where user_id=v_user for update;
  end if;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  if public.is_banned(v_user) then return pg_catalog.jsonb_build_object('ok',false,'reason','banned'); end if;
  -- Capture the clock after acquiring the wallet, rather than at transaction start.
  v_now:=pg_catalog.clock_timestamp();

  select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found and (v_previous.user_id<>v_user or v_previous.kind<>'saju_compatibility_v1'
    or v_previous.result->>'pair_key' is distinct from v_pair_key) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
  end if;

  if exists(select 1 from ojjuda_saju_internal.compatibility_entitlements where user_id=v_user and pair_key=v_pair_key) then
    v_item:=ojjuda_saju_internal.compatibility_receipt_v1(v_user,v_pair_key,v_coins,v_now,true,true,0);
    if v_item is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
  end if;

  if v_previous.user_id is not null then
    if v_item is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    if v_item->>'request_id' is distinct from p_request_id::text or (v_item->>'expires_at')::timestamptz<=v_now then
      return pg_catalog.jsonb_build_object('ok',false,'reason','access_expired','coins',v_coins,'price',20,'server_now',v_now);
    end if;
    -- Exact successful retries stay free, including pre-migration 10-ju purchases.
    return v_item||pg_catalog.jsonb_build_object('entitlement_replayed',false);
  end if;
  if v_item is not null and (v_item->>'expires_at')::timestamptz>v_now then
    v_result:=v_item;v_required:=0;
  end if;
  if not p_verify_only and p_expected_charge<>v_required then
    return pg_catalog.jsonb_build_object('ok',false,'reason','price_changed','coins',v_coins,'price',20,'required',v_required,'server_now',v_now);
  end if;
  if v_result is not null then return v_result; end if;
  if p_verify_only then
    return pg_catalog.jsonb_build_object('ok',false,'reason','not_found','coins',v_coins,'price',20,'required',20,'server_now',v_now);
  end if;
  if v_coins<20 then
    return pg_catalog.jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',20,'required',20,'server_now',v_now);
  end if;

  update public.user_private set coins=coins-20 where user_id=v_user and coins>=20 returning coins into v_coins;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','coins'); end if;
  v_result:=pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',p_request_id,'pair_key',v_pair_key,
    'product','saju','topic','compatibility','title','사주 궁합','price',20,
    'coins',v_coins,'charged',20,'replayed',false,'entitlement_replayed',false,
    'paid_at',v_now,'expires_at',v_now+interval '24 hours','server_now',v_now,
    'access_hours',24,'access_version',1,'entitlement_version',1
  );
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
    values(p_request_id,v_user,'saju_compatibility_v1',20,v_result,v_now);
  insert into ojjuda_saju_internal.compatibility_entitlements(user_id,pair_key,request_id,price,purchased_at)
    values(v_user,v_pair_key,p_request_id,20,v_now)
    on conflict(user_id,pair_key) do update set request_id=excluded.request_id,price=excluded.price,purchased_at=excluded.purchased_at;
  -- A failure in either insert aborts the whole statement, including its debit.
  return v_result;
end;
$function$;
revoke all on function ojjuda_saju_internal.compatibility_buy_v1(uuid,text,uuid,integer,boolean)
  from public,anon,authenticated,service_role;
grant execute on function ojjuda_saju_internal.compatibility_buy_v1(uuid,text,uuid,integer,boolean) to authenticated;

comment on function public.saju_compatibility_buy_v1(uuid,text,uuid,integer,boolean) is
  'Separate 20-ju compatibility purchase, exactly 24h access, expected-account and quoted-price guards. Legacy 10-ju access remains valid until its original deadline. Verification and replay never debit or extend access.';
