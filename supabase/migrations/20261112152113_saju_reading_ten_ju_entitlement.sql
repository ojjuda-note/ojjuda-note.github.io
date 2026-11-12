-- Saju: fixed 10-ju purchase per member and normalized chart fingerprint.
-- No birth date, birth time, name, gender, selected year, or reading body is sent here.
-- Reopening the same chart, including a different selected year, never charges again.
create schema if not exists ojjuda_saju_internal;
revoke all on schema ojjuda_saju_internal from public, anon, authenticated;
grant usage on schema ojjuda_saju_internal to authenticated;

create table ojjuda_saju_internal.entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  chart_key text not null check (chart_key ~ '^[0-9a-f]{64}$'),
  request_id uuid not null unique references ojjuda_note_internal.spend_requests(request_id) on delete cascade,
  price integer not null default 10 check (price = 10),
  purchased_at timestamptz not null default now(),
  primary key (user_id, chart_key)
);
alter table ojjuda_saju_internal.entitlements enable row level security;
revoke all on table ojjuda_saju_internal.entitlements from public, anon, authenticated;
comment on column ojjuda_saju_internal.entitlements.chart_key is
  'Lowercase SHA-256 fingerprint scoped by the member ID and normalized solar birth date/time; no raw birth data.';

-- This formatter has no client execution grant. It runs only inside an
-- authenticated internal definer call, and joins the immutable paid ledger.
create function ojjuda_saju_internal.receipt_v1(
  p_user uuid, p_chart_key text, p_coins integer,
  p_replayed boolean, p_entitlement_replayed boolean, p_charged integer
) returns jsonb language sql stable security invoker set search_path = '' as $function$
  select s.result || pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',e.request_id,'chart_key',e.chart_key,
    'price',10,'coins',p_coins,'charged',p_charged,
    'replayed',p_replayed,'entitlement_replayed',p_entitlement_replayed,
    'paid_at',e.purchased_at,'product','saju','entitlement_version',1
  )
  from ojjuda_saju_internal.entitlements e
  join ojjuda_note_internal.spend_requests s on s.request_id=e.request_id
  where e.user_id=p_user and e.chart_key=p_chart_key
    and s.user_id=e.user_id and s.kind='saju_reading_v1' and s.coins=10
    and s.result->>'chart_key'=e.chart_key;
$function$;
revoke all on function ojjuda_saju_internal.receipt_v1(uuid,text,integer,boolean,boolean,integer)
  from public, anon, authenticated;

create function ojjuda_saju_internal.buy_v1(
  p_request_id uuid, p_chart_key text, p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_user uuid := auth.uid();
  v_chart_key text := pg_catalog.lower(p_chart_key);
  v_coins integer;
  v_previous record;
  v_entitlement record;
  v_result jsonb;
  v_now timestamptz;
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if p_request_id is null or v_chart_key is null or v_chart_key !~ '^[0-9a-f]{64}$' or p_verify_only is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
  end if;
  -- Match the existing purchase lock order: global request ID, then wallet.
  -- The wallet lock also serializes different IDs for the same member/chart.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  if public.is_banned(v_user) then return pg_catalog.jsonb_build_object('ok',false,'reason','banned'); end if;

  select user_id,kind,result into v_previous
    from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if v_previous.user_id<>v_user or v_previous.kind<>'saju_reading_v1'
       or v_previous.result->>'chart_key' is distinct from v_chart_key then
      return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
    end if;
    v_result:=ojjuda_saju_internal.receipt_v1(v_user,v_chart_key,v_coins,true,false,0);
    if v_result is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    return v_result;
  end if;
  select request_id into v_entitlement
    from ojjuda_saju_internal.entitlements where user_id=v_user and chart_key=v_chart_key;
  if found then
    v_result:=ojjuda_saju_internal.receipt_v1(v_user,v_chart_key,v_coins,true,true,0);
    if v_result is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    return v_result;
  end if;
  if p_verify_only then
    return pg_catalog.jsonb_build_object('ok',false,'reason','not_found','coins',v_coins,'price',10);
  end if;
  if v_coins<10 then return pg_catalog.jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',10); end if;

  update public.user_private set coins=coins-10
    where user_id=v_user and coins>=10 returning coins into v_coins;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','coins'); end if;
  v_now:=pg_catalog.clock_timestamp();
  v_result:=pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',p_request_id,'chart_key',v_chart_key,
    'price',10,'coins',v_coins,'charged',10,'replayed',false,'entitlement_replayed',false,
    'paid_at',v_now,'product','saju','title','사주팔자 상세 풀이','entitlement_version',1
  );
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
    values(p_request_id,v_user,'saju_reading_v1',10,v_result,v_now);
  insert into ojjuda_saju_internal.entitlements(user_id,chart_key,request_id,price,purchased_at)
    values(v_user,v_chart_key,p_request_id,10,v_now);
  -- An error in either insert aborts this statement, including the wallet debit.
  return v_result;
end;
$function$;
revoke all on function ojjuda_saju_internal.buy_v1(uuid,text,boolean) from public,anon;
grant execute on function ojjuda_saju_internal.buy_v1(uuid,text,boolean) to authenticated;

create function ojjuda_saju_internal.status_v1(p_chart_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_user uuid := auth.uid();
  v_chart_key text := pg_catalog.lower(p_chart_key);
  v_coins integer;
  v_result jsonb;
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if v_chart_key is not null and v_chart_key !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if public.is_banned(v_user) then return pg_catalog.jsonb_build_object('ok',false,'reason','banned'); end if;
  select coins into v_coins from public.user_private where user_id=v_user;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  if v_chart_key is not null then
    v_result:=ojjuda_saju_internal.receipt_v1(v_user,v_chart_key,v_coins,true,true,0);
    if v_result is not null then return v_result; end if;
    if exists(select 1 from ojjuda_saju_internal.entitlements where user_id=v_user and chart_key=v_chart_key) then
      return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable');
    end if;
  end if;
  return pg_catalog.jsonb_build_object('ok',true,'entitled',false,'chart_key',v_chart_key,'price',10,'coins',v_coins,'product','saju');
end;
$function$;
revoke all on function ojjuda_saju_internal.status_v1(text) from public,anon;
grant execute on function ojjuda_saju_internal.status_v1(text) to authenticated;

create function public.saju_reading_buy_v1(
  p_request_id uuid, p_chart_key text, p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_saju_internal.buy_v1(p_request_id,p_chart_key,p_verify_only);
$function$;
revoke all on function public.saju_reading_buy_v1(uuid,text,boolean) from public,anon;
grant execute on function public.saju_reading_buy_v1(uuid,text,boolean) to authenticated;

create function public.saju_reading_status_v1(p_chart_key text default null)
returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_saju_internal.status_v1(p_chart_key);
$function$;
revoke all on function public.saju_reading_status_v1(text) from public,anon;
grant execute on function public.saju_reading_status_v1(text) to authenticated;
