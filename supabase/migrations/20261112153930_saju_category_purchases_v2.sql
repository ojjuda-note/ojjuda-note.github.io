-- Each birth chart has three separately purchased products: lifelong,
-- annual (one selected year), and monthly (all 12 months of one selected year).
-- Existing v1 bundle owners retain access to every topic/year without a debit.
revoke all on function public.saju_reading_buy_v1(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.saju_reading_buy_v1(uuid,text,uuid,boolean) from public,anon,authenticated;
revoke all on function ojjuda_saju_internal.buy_v1(uuid,text,boolean) from public,anon,authenticated;
revoke all on function ojjuda_saju_internal.buy_v1(uuid,text,uuid,boolean) from public,anon,authenticated;

create table ojjuda_saju_internal.topic_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  chart_key text not null check (chart_key ~ '^[0-9a-f]{64}$'),
  topic text not null check (topic in ('lifelong','annual','monthly')),
  year integer not null,
  request_id uuid not null unique references ojjuda_note_internal.spend_requests(request_id) on delete cascade,
  price integer not null default 10 check (price=10),
  purchased_at timestamptz not null default now(),
  primary key (user_id,chart_key,topic,year),
  check ((topic='lifelong' and year=0) or (topic in ('annual','monthly') and year between 1900 and 2050))
);
alter table ojjuda_saju_internal.topic_entitlements enable row level security;
revoke all on table ojjuda_saju_internal.topic_entitlements from public,anon,authenticated;
comment on column ojjuda_saju_internal.topic_entitlements.chart_key is
  'Member-scoped SHA-256 fingerprint of normalized birth input; no raw birth date, time, or report body.';
comment on column ojjuda_saju_internal.topic_entitlements.year is
  '0 for lifelong; selected report year for annual/monthly. Monthly includes all 12 months.';

create function ojjuda_saju_internal.receipt_v2(
  p_user uuid, p_chart_key text, p_topic text, p_year integer, p_coins integer,
  p_replayed boolean, p_entitlement_replayed boolean, p_charged integer
) returns jsonb language sql stable security invoker set search_path='' as $function$
  select s.result || pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',e.request_id,'chart_key',e.chart_key,
    'topic',e.topic,'year',e.year,'price',10,'coins',p_coins,'charged',p_charged,
    'replayed',p_replayed,'entitlement_replayed',p_entitlement_replayed,
    'paid_at',e.purchased_at,'product','saju','legacy_bundle',false,'entitlement_version',2
  )
  from ojjuda_saju_internal.topic_entitlements e
  join ojjuda_note_internal.spend_requests s on s.request_id=e.request_id
  where e.user_id=p_user and e.chart_key=p_chart_key and e.topic=p_topic and e.year=p_year
    and s.user_id=e.user_id and s.kind='saju_reading_v2' and s.coins=10
    and s.result->>'chart_key'=e.chart_key and s.result->>'topic'=e.topic
    and s.result->>'year'=e.year::text;
$function$;
revoke all on function ojjuda_saju_internal.receipt_v2(uuid,text,text,integer,integer,boolean,boolean,integer)
  from public,anon,authenticated;

create function ojjuda_saju_internal.buy_v2(
  p_request_id uuid, p_chart_key text, p_topic text, p_year integer,
  p_expected_user uuid, p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid := auth.uid();
  v_chart_key text := pg_catalog.lower(p_chart_key);
  v_topic text := pg_catalog.lower(p_topic);
  v_year integer;
  v_title text;
  v_coins integer;
  v_previous record;
  v_result jsonb;
  v_now timestamptz;
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if p_expected_user is distinct from v_user then
    return pg_catalog.jsonb_build_object('ok',false,'reason','account_changed');
  end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','member_required');
  end if;
  v_year:=case when v_topic='lifelong' then coalesce(p_year,0) else p_year end;
  if p_request_id is null or v_chart_key is null or v_chart_key !~ '^[0-9a-f]{64}$'
     or v_topic is null or v_topic not in ('lifelong','annual','monthly')
     or v_year is null or (v_topic='lifelong' and v_year<>0)
     or (v_topic in ('annual','monthly') and v_year not between 1900 and 2050)
     or p_verify_only is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
  end if;
  v_title:=case v_topic when 'lifelong' then '사주 평생운'
    when 'annual' then v_year::text||'년 사주 연간운'
    else v_year::text||'년 사주 월별운 (12개월)' end;

  -- All purchases retain the shared lock order: global request UUID, then wallet.
  -- The wallet lock serializes different request IDs for the same product.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  if public.is_banned(v_user) then return pg_catalog.jsonb_build_object('ok',false,'reason','banned'); end if;

  select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if v_previous.user_id<>v_user then
      return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
    elsif v_previous.kind='saju_reading_v2' then
      if v_previous.result->>'chart_key' is distinct from v_chart_key
         or v_previous.result->>'topic' is distinct from v_topic
         or v_previous.result->>'year' is distinct from v_year::text then
        return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
      end if;
      v_result:=ojjuda_saju_internal.receipt_v2(v_user,v_chart_key,v_topic,v_year,v_coins,true,false,0);
      if v_result is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
      return v_result;
    elsif v_previous.kind<>'saju_reading_v1'
       or v_previous.result->>'chart_key' is distinct from v_chart_key
       or not exists(select 1 from ojjuda_saju_internal.entitlements
         where user_id=v_user and chart_key=v_chart_key and request_id=p_request_id) then
      return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
    end if;
    -- A genuine v1 bundle receipt may be reused across its chart's topics/years.
  end if;

  if exists(select 1 from ojjuda_saju_internal.topic_entitlements
    where user_id=v_user and chart_key=v_chart_key and topic=v_topic and year=v_year) then
    v_result:=ojjuda_saju_internal.receipt_v2(v_user,v_chart_key,v_topic,v_year,v_coins,true,true,0);
    if v_result is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    return v_result;
  end if;
  if exists(select 1 from ojjuda_saju_internal.entitlements where user_id=v_user and chart_key=v_chart_key) then
    v_result:=ojjuda_saju_internal.receipt_v1(v_user,v_chart_key,v_coins,true,true,0);
    if v_result is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    return v_result || pg_catalog.jsonb_build_object(
      'topic',v_topic,'year',v_year,'title',v_title,'legacy_bundle',true,'entitlement_version',2,
      'entitlement_replayed',(v_result->>'request_id') is distinct from p_request_id::text
    );
  end if;
  if p_verify_only then return pg_catalog.jsonb_build_object('ok',false,'reason','not_found','coins',v_coins,'price',10); end if;
  if v_coins<10 then return pg_catalog.jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',10); end if;

  update public.user_private set coins=coins-10 where user_id=v_user and coins>=10 returning coins into v_coins;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','coins'); end if;
  v_now:=pg_catalog.clock_timestamp();
  v_result:=pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',p_request_id,'chart_key',v_chart_key,
    'topic',v_topic,'year',v_year,'price',10,'coins',v_coins,'charged',10,'replayed',false,
    'entitlement_replayed',false,'paid_at',v_now,'product','saju','title',v_title,
    'legacy_bundle',false,'entitlement_version',2
  );
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
    values(p_request_id,v_user,'saju_reading_v2',10,v_result,v_now);
  insert into ojjuda_saju_internal.topic_entitlements(user_id,chart_key,topic,year,request_id,price,purchased_at)
    values(v_user,v_chart_key,v_topic,v_year,p_request_id,10,v_now);
  return v_result;
end;
$function$;
revoke all on function ojjuda_saju_internal.buy_v2(uuid,text,text,integer,uuid,boolean) from public,anon;
grant execute on function ojjuda_saju_internal.buy_v2(uuid,text,text,integer,uuid,boolean) to authenticated;

create function ojjuda_saju_internal.status_v2(p_chart_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid := auth.uid();
  v_chart_key text := pg_catalog.lower(p_chart_key);
  v_coins integer;
  v_entitlements jsonb := '[]'::jsonb;
  v_bundle jsonb;
  v_bundle_receipt jsonb;
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
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'topic',e.topic,'year',e.year,'request_id',e.request_id,'paid_at',e.purchased_at,'price',10
    ) order by case e.topic when 'lifelong' then 1 when 'annual' then 2 else 3 end,e.year),'[]'::jsonb)
      into v_entitlements
    from ojjuda_saju_internal.topic_entitlements e
    join ojjuda_note_internal.spend_requests s on s.request_id=e.request_id
    where e.user_id=v_user and e.chart_key=v_chart_key and s.user_id=e.user_id
      and s.kind='saju_reading_v2' and s.coins=10 and s.result->>'chart_key'=e.chart_key
      and s.result->>'topic'=e.topic and s.result->>'year'=e.year::text;
    if pg_catalog.jsonb_array_length(v_entitlements)<>(select count(*) from ojjuda_saju_internal.topic_entitlements
      where user_id=v_user and chart_key=v_chart_key) then
      return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable');
    end if;
    if exists(select 1 from ojjuda_saju_internal.entitlements where user_id=v_user and chart_key=v_chart_key) then
      v_bundle_receipt:=ojjuda_saju_internal.receipt_v1(v_user,v_chart_key,v_coins,true,true,0);
      if v_bundle_receipt is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
      v_bundle:=pg_catalog.jsonb_build_object(
        'request_id',v_bundle_receipt->>'request_id','paid_at',v_bundle_receipt->>'paid_at','price',10
      );
    end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',true,'chart_key',v_chart_key,'coins',v_coins,'price',10,
    'prices',pg_catalog.jsonb_build_object('lifelong',10,'annual',10,'monthly',10),
    'entitlements',v_entitlements,'bundle_entitlement',v_bundle,'product','saju','entitlement_version',2
  );
end;
$function$;
revoke all on function ojjuda_saju_internal.status_v2(text) from public,anon;
grant execute on function ojjuda_saju_internal.status_v2(text) to authenticated;

create function public.saju_reading_buy_v2(
  p_request_id uuid, p_chart_key text, p_topic text, p_year integer,
  p_expected_user uuid, p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_saju_internal.buy_v2(p_request_id,p_chart_key,p_topic,p_year,p_expected_user,p_verify_only);
$function$;
revoke all on function public.saju_reading_buy_v2(uuid,text,text,integer,uuid,boolean) from public,anon;
grant execute on function public.saju_reading_buy_v2(uuid,text,text,integer,uuid,boolean) to authenticated;

create function public.saju_reading_status_v2(p_chart_key text default null)
returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_saju_internal.status_v2(p_chart_key);
$function$;
revoke all on function public.saju_reading_status_v2(text) from public,anon;
grant execute on function public.saju_reading_status_v2(text) to authenticated;

notify pgrst, 'reload schema';
