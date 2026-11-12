-- A saju purchase is valid for exactly 24 hours from its original payment.
-- Existing paid rows use that same rule; renewal appends a ledger record and
-- replaces only the current entitlement pointer. No payment history is deleted.
-- A bundle renews only expired/missing parts. Active parts keep their deadlines.

create function ojjuda_saju_internal.access_receipt_v4(p_receipt jsonb,p_now timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $function$
  select case when p_receipt is null then null else p_receipt||pg_catalog.jsonb_build_object(
    'access_version',4,'access_hours',24,'server_now',p_now,
    'expires_at',(p_receipt->>'paid_at')::timestamptz+interval '24 hours'
  ) end;
$function$;
revoke all on function ojjuda_saju_internal.access_receipt_v4(jsonb,timestamptz) from public,anon,authenticated;

create function ojjuda_saju_internal.receipt_all_v4(
  p_user uuid,p_chart_key text,p_year integer,p_coins integer,
  p_replayed boolean,p_entitlement_replayed boolean,p_charged integer,p_now timestamptz,
  p_new_requests uuid[] default array[]::uuid[]
) returns jsonb language sql stable security invoker set search_path='' as $function$
  with base as (
    select ojjuda_saju_internal.receipt_all_v3(p_user,p_chart_key,p_year,p_coins,
      p_replayed,p_entitlement_replayed,p_charged,p_new_requests) as receipt
  ), parts as (
    select pg_catalog.jsonb_agg(ojjuda_saju_internal.access_receipt_v4(item,p_now) order by ordinal) as items,
      min((item->>'paid_at')::timestamptz+interval '24 hours') as expires_at
    from base,pg_catalog.jsonb_array_elements(base.receipt->'items') with ordinality as p(item,ordinal)
  )
  select case when base.receipt is null then null else base.receipt||pg_catalog.jsonb_build_object(
    'access_version',4,'access_hours',24,'server_now',p_now,'expires_at',parts.expires_at,'items',parts.items
  ) end from base cross join parts;
$function$;
revoke all on function ojjuda_saju_internal.receipt_all_v4(uuid,text,integer,integer,boolean,boolean,integer,timestamptz,uuid[])
  from public,anon,authenticated;

create function ojjuda_saju_internal.status_v4(p_chart_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_result jsonb;
  v_items jsonb;
  v_bundle jsonb;
  v_now timestamptz;
begin
  -- The old private reader still validates account, ban, wallet and ledger joins.
  -- Its public/internal client grants are retired below; it is only a helper.
  v_result:=ojjuda_saju_internal.status_v2(p_chart_key);
  if v_result->>'ok' is distinct from 'true' then return v_result; end if;
  v_now:=pg_catalog.clock_timestamp();
  select coalesce(pg_catalog.jsonb_agg(ojjuda_saju_internal.access_receipt_v4(item,v_now) order by ordinal),'[]'::jsonb)
    into v_items
  from pg_catalog.jsonb_array_elements(v_result->'entitlements') with ordinality as p(item,ordinal)
  where (item->>'paid_at')::timestamptz+interval '24 hours'>v_now;
  if v_result->'bundle_entitlement' is not null and v_result->'bundle_entitlement'<>'null'::jsonb
    and (v_result->'bundle_entitlement'->>'paid_at')::timestamptz+interval '24 hours'>v_now then
    v_bundle:=ojjuda_saju_internal.access_receipt_v4(v_result->'bundle_entitlement',v_now);
  end if;
  return v_result||pg_catalog.jsonb_build_object(
    'prices',(v_result->'prices')||pg_catalog.jsonb_build_object('all',30),'entitlement_version',3,
    'access_version',4,'access_hours',24,'server_now',v_now,
    'entitlements',v_items,'bundle_entitlement',v_bundle
  );
end;
$function$;
revoke all on function ojjuda_saju_internal.status_v4(text) from public,anon;
grant execute on function ojjuda_saju_internal.status_v4(text) to authenticated;

create function ojjuda_saju_internal.buy_v4(
  p_request_id uuid,p_chart_key text,p_topic text,p_year integer,
  p_expected_user uuid,p_expected_charge integer,p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid:=auth.uid();
  v_chart_key text:=pg_catalog.lower(p_chart_key);
  v_topic text:=pg_catalog.lower(p_topic);
  v_year integer;
  v_coins integer;
  v_previous record;
  v_item jsonb;
  v_legacy jsonb;
  v_result jsonb;
  v_now timestamptz;
  v_required integer:=10;
  v_title text;
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
    or v_topic is null or v_topic not in ('lifelong','annual','monthly') or v_year is null
    or (v_topic='lifelong' and v_year<>0) or (v_topic in ('annual','monthly') and v_year not between 1900 and 2050)
    or p_expected_charge is null or p_expected_charge not in (0,10) or p_verify_only is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
  end if;
  v_title:=case v_topic when 'lifelong' then '사주 평생운' when 'annual' then v_year::text||'년 사주 연간운'
    else v_year::text||'년 사주 월별운 (12개월)' end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  if public.is_banned(v_user) then return pg_catalog.jsonb_build_object('ok',false,'reason','banned'); end if;
  -- Read time after acquiring the wallet lock, never a transaction-start now().
  v_now:=pg_catalog.clock_timestamp();

  if exists(select 1 from ojjuda_saju_internal.topic_entitlements
    where user_id=v_user and chart_key=v_chart_key and topic=v_topic and year=v_year) then
    v_item:=ojjuda_saju_internal.access_receipt_v4(
      ojjuda_saju_internal.receipt_v2(v_user,v_chart_key,v_topic,v_year,v_coins,true,true,0),v_now);
    if v_item is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
  end if;
  if exists(select 1 from ojjuda_saju_internal.entitlements where user_id=v_user and chart_key=v_chart_key) then
    v_legacy:=ojjuda_saju_internal.access_receipt_v4(
      ojjuda_saju_internal.receipt_v1(v_user,v_chart_key,v_coins,true,true,0),v_now);
    if v_legacy is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    v_legacy:=v_legacy||pg_catalog.jsonb_build_object(
      'topic',v_topic,'year',v_year,'title',v_title,'legacy_bundle',true,'entitlement_version',2);
  end if;

  select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if v_previous.user_id<>v_user or v_previous.result->>'chart_key' is distinct from v_chart_key
      or v_previous.kind not in ('saju_reading_v1','saju_reading_v2')
      or (v_previous.kind='saju_reading_v2' and (v_previous.result->>'topic' is distinct from v_topic
        or v_previous.result->>'year' is distinct from v_year::text)) then
      return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
    end if;
    v_result:=case when v_previous.kind='saju_reading_v1' then v_legacy else v_item end;
    if v_result is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    if v_result->>'request_id' is distinct from p_request_id::text or (v_result->>'expires_at')::timestamptz<=v_now then
      return pg_catalog.jsonb_build_object('ok',false,'reason','access_expired','coins',v_coins,'price',10,'server_now',v_now);
    end if;
    -- A confirmed retry never charges, even when the initial displayed fee was 10.
    return v_result||pg_catalog.jsonb_build_object('entitlement_replayed',false);
  end if;

  if v_item is not null and (v_item->>'expires_at')::timestamptz>v_now then v_result:=v_item; end if;
  if v_legacy is not null and (v_legacy->>'expires_at')::timestamptz>v_now
    and (v_result is null or (v_legacy->>'expires_at')::timestamptz>(v_result->>'expires_at')::timestamptz) then
    v_result:=v_legacy;
  end if;
  if v_result is not null then v_required:=0; end if;
  if not p_verify_only and p_expected_charge<>v_required then
    return pg_catalog.jsonb_build_object('ok',false,'reason','price_changed','coins',v_coins,'price',10,'required',v_required,'server_now',v_now);
  end if;
  if v_result is not null then return v_result; end if;
  if p_verify_only then
    return pg_catalog.jsonb_build_object('ok',false,'reason','not_found','coins',v_coins,'price',10,'required',10,'server_now',v_now);
  end if;
  if v_coins<10 then return pg_catalog.jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',10,'required',10); end if;

  update public.user_private set coins=coins-10 where user_id=v_user and coins>=10 returning coins into v_coins;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','coins'); end if;
  v_result:=pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',p_request_id,'chart_key',v_chart_key,
    'topic',v_topic,'year',v_year,'price',10,'coins',v_coins,'charged',10,'replayed',false,
    'entitlement_replayed',false,'paid_at',v_now,'product','saju','title',v_title,
    'legacy_bundle',false,'entitlement_version',2,'access_version',4,'access_hours',24,
    'server_now',v_now,'expires_at',v_now+interval '24 hours'
  );
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
    values(p_request_id,v_user,'saju_reading_v2',10,v_result,v_now);
  insert into ojjuda_saju_internal.topic_entitlements(user_id,chart_key,topic,year,request_id,price,purchased_at)
    values(v_user,v_chart_key,v_topic,v_year,p_request_id,10,v_now)
    on conflict(user_id,chart_key,topic,year) do update set request_id=excluded.request_id,purchased_at=excluded.purchased_at;
  return v_result;
end;
$function$;
revoke all on function ojjuda_saju_internal.buy_v4(uuid,text,text,integer,uuid,integer,boolean) from public,anon;
grant execute on function ojjuda_saju_internal.buy_v4(uuid,text,text,integer,uuid,integer,boolean) to authenticated;

create function ojjuda_saju_internal.buy_all_v4(
  p_request_id uuid,p_chart_key text,p_year integer,p_expected_user uuid,
  p_expected_charge integer,p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid:=auth.uid();
  v_chart_key text:=pg_catalog.lower(p_chart_key);
  v_coins integer;
  v_previous record;
  v_order record;
  v_result jsonb;
  v_item jsonb;
  v_legacy jsonb;
  v_legacy_all jsonb;
  v_items jsonb:='[]'::jsonb;
  v_item_requests jsonb:='[]'::jsonb;
  v_topics text[]:=array['lifelong','annual','monthly'];
  v_years integer[]:=array[0,p_year,p_year];
  v_missing text[]:=array[]::text[];
  v_new_requests uuid[]:=array[]::uuid[];
  v_child_id uuid;
  v_required integer:=0;
  v_index integer;
  v_title text;
  v_now timestamptz;
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if p_expected_user is distinct from v_user then
    return pg_catalog.jsonb_build_object('ok',false,'reason','account_changed');
  end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if p_request_id is null or v_chart_key is null or v_chart_key !~ '^[0-9a-f]{64}$'
    or p_year is null or p_year not between 1900 and 2050 or p_verify_only is null
    or p_expected_charge is null or p_expected_charge not in (0,10,20,30) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  if public.is_banned(v_user) then return pg_catalog.jsonb_build_object('ok',false,'reason','banned'); end if;
  v_now:=pg_catalog.clock_timestamp();

  if exists(select 1 from ojjuda_saju_internal.entitlements where user_id=v_user and chart_key=v_chart_key) then
    v_legacy:=ojjuda_saju_internal.access_receipt_v4(
      ojjuda_saju_internal.receipt_v1(v_user,v_chart_key,v_coins,true,true,0),v_now);
    if v_legacy is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    for v_index in 1..3 loop
      v_title:=case v_topics[v_index] when 'lifelong' then '사주 평생운' when 'annual' then p_year::text||'년 사주 연간운'
        else p_year::text||'년 사주 월별운 (12개월)' end;
      v_items:=v_items||pg_catalog.jsonb_build_array(v_legacy||pg_catalog.jsonb_build_object(
        'topic',v_topics[v_index],'year',v_years[v_index],'title',v_title,'legacy_bundle',true,'entitlement_version',2));
    end loop;
    v_legacy_all:=v_legacy||pg_catalog.jsonb_build_object(
      'topic','all','year',p_year,'price',30,'charged',0,'title',p_year::text||'년 사주 전체 풀이',
      'legacy_bundle',true,'entitlement_version',3,'items',v_items);
  end if;

  select * into v_order from ojjuda_saju_internal.all_orders where user_id=v_user and chart_key=v_chart_key and year=p_year;
  if found and not exists(select 1 from ojjuda_note_internal.spend_requests s where s.request_id=v_order.request_id
    and s.user_id=v_user and s.kind='saju_reading_all_v3' and s.coins=0 and s.result->>'chart_key'=v_chart_key
    and s.result->>'topic'='all' and s.result->>'year'=p_year::text and s.result->>'price'='30'
    and s.result->>'charged'=v_order.charged::text and s.result->'item_requests'=v_order.item_requests) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable');
  end if;

  select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if v_previous.user_id<>v_user or v_previous.result->>'chart_key' is distinct from v_chart_key
      or v_previous.kind not in ('saju_reading_v1','saju_reading_all_v3')
      or (v_previous.kind='saju_reading_all_v3' and (v_previous.result->>'topic' is distinct from 'all'
        or v_previous.result->>'year' is distinct from p_year::text)) then
      return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
    end if;
    if v_previous.kind='saju_reading_v1' then v_result:=v_legacy_all;
    elsif v_order.request_id=p_request_id then
      v_result:=ojjuda_saju_internal.receipt_all_v4(v_user,v_chart_key,p_year,v_coins,true,false,0,v_now);
    end if;
    if v_result is null or v_result->>'request_id' is distinct from p_request_id::text
      or (v_result->>'expires_at')::timestamptz<=v_now then
      return pg_catalog.jsonb_build_object('ok',false,'reason','access_expired','coins',v_coins,'price',30,'server_now',v_now);
    end if;
    return v_result||pg_catalog.jsonb_build_object('entitlement_replayed',false);
  end if;

  if v_legacy_all is not null and (v_legacy_all->>'expires_at')::timestamptz>v_now then
    v_result:=v_legacy_all;
  elsif v_order.request_id is not null then
    v_result:=ojjuda_saju_internal.receipt_all_v4(v_user,v_chart_key,p_year,v_coins,true,true,0,v_now);
    if v_result is not null and (v_result->>'expires_at')::timestamptz<=v_now then v_result:=null; end if;
  end if;
  if v_result is not null then
    if not p_verify_only and p_expected_charge<>0 then
      return pg_catalog.jsonb_build_object('ok',false,'reason','price_changed','coins',v_coins,'price',30,'required',0,'server_now',v_now);
    end if;
    return v_result;
  end if;

  for v_index in 1..3 loop
    v_item:=null;
    if exists(select 1 from ojjuda_saju_internal.topic_entitlements
      where user_id=v_user and chart_key=v_chart_key and topic=v_topics[v_index] and year=v_years[v_index]) then
      v_item:=ojjuda_saju_internal.access_receipt_v4(
        ojjuda_saju_internal.receipt_v2(v_user,v_chart_key,v_topics[v_index],v_years[v_index],v_coins,true,true,0),v_now);
      if v_item is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    end if;
    if v_item is null or (v_item->>'expires_at')::timestamptz<=v_now then
      v_missing:=pg_catalog.array_append(v_missing,v_topics[v_index]);
      v_required:=v_required+10;
    end if;
  end loop;
  if not p_verify_only and p_expected_charge<>v_required then
    return pg_catalog.jsonb_build_object('ok',false,'reason','price_changed','coins',v_coins,'price',30,'required',v_required,'server_now',v_now);
  end if;
  if p_verify_only then
    return pg_catalog.jsonb_build_object('ok',false,'reason','not_found','coins',v_coins,'price',30,'required',v_required,'server_now',v_now);
  end if;
  if v_coins<v_required then
    return pg_catalog.jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',30,'required',v_required);
  end if;
  if v_required>0 then
    update public.user_private set coins=coins-v_required where user_id=v_user and coins>=v_required returning coins into v_coins;
    if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','coins','price',30,'required',v_required); end if;
  end if;

  for v_index in 1..3 loop
    if v_topics[v_index]=any(v_missing) then
      loop
        v_child_id:=pg_catalog.gen_random_uuid();
        exit when v_child_id<>p_request_id and not exists(select 1 from ojjuda_note_internal.spend_requests where request_id=v_child_id);
      end loop;
      v_title:=case v_topics[v_index] when 'lifelong' then '사주 평생운' when 'annual' then p_year::text||'년 사주 연간운'
        else p_year::text||'년 사주 월별운 (12개월)' end;
      v_item:=pg_catalog.jsonb_build_object(
        'ok',true,'entitled',true,'request_id',v_child_id,'chart_key',v_chart_key,
        'topic',v_topics[v_index],'year',v_years[v_index],'price',10,'coins',v_coins,'charged',10,
        'replayed',false,'entitlement_replayed',false,'paid_at',v_now,'product','saju','title',v_title,
        'legacy_bundle',false,'entitlement_version',2,'all_request_id',p_request_id,
        'access_version',4,'access_hours',24,'server_now',v_now,'expires_at',v_now+interval '24 hours'
      );
      insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
        values(v_child_id,v_user,'saju_reading_v2',10,v_item,v_now);
      insert into ojjuda_saju_internal.topic_entitlements(user_id,chart_key,topic,year,request_id,price,purchased_at)
        values(v_user,v_chart_key,v_topics[v_index],v_years[v_index],v_child_id,10,v_now)
        on conflict(user_id,chart_key,topic,year) do update set request_id=excluded.request_id,purchased_at=excluded.purchased_at;
      v_new_requests:=pg_catalog.array_append(v_new_requests,v_child_id);
    end if;
    v_item:=ojjuda_saju_internal.receipt_v2(v_user,v_chart_key,v_topics[v_index],v_years[v_index],v_coins,true,true,0);
    if v_item is null then raise exception 'saju_bundle_receipt_unavailable'; end if;
    v_item_requests:=v_item_requests||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'topic',v_topics[v_index],'year',v_years[v_index],'request_id',v_item->>'request_id'));
  end loop;
  v_result:=pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',p_request_id,'chart_key',v_chart_key,
    'topic','all','year',p_year,'price',30,'coins',v_coins,'charged',v_required,
    'replayed',v_required=0,'entitlement_replayed',false,'paid_at',v_now,
    'product','saju','title',p_year::text||'년 사주 전체 풀이','legacy_bundle',false,
    'entitlement_version',3,'access_version',4,'access_hours',24,'server_now',v_now,
    'item_requests',v_item_requests,'ledger_charge',0
  );
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
    values(p_request_id,v_user,'saju_reading_all_v3',0,v_result,v_now);
  insert into ojjuda_saju_internal.all_orders(user_id,chart_key,year,request_id,price,charged,item_requests,purchased_at)
    values(v_user,v_chart_key,p_year,p_request_id,30,v_required,v_item_requests,v_now)
    on conflict(user_id,chart_key,year) do update set request_id=excluded.request_id,charged=excluded.charged,
      item_requests=excluded.item_requests,purchased_at=excluded.purchased_at;
  v_result:=ojjuda_saju_internal.receipt_all_v4(v_user,v_chart_key,p_year,v_coins,v_required=0,false,v_required,v_now,v_new_requests);
  if v_result is null then raise exception 'saju_bundle_receipt_unavailable'; end if;
  return v_result;
end;
$function$;
revoke all on function ojjuda_saju_internal.buy_all_v4(uuid,text,integer,uuid,integer,boolean) from public,anon;
grant execute on function ojjuda_saju_internal.buy_all_v4(uuid,text,integer,uuid,integer,boolean) to authenticated;

create function public.saju_reading_status_v4(p_chart_key text default null)
returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_saju_internal.status_v4(p_chart_key);
$function$;
revoke all on function public.saju_reading_status_v4(text) from public,anon;
grant execute on function public.saju_reading_status_v4(text) to authenticated;

create function public.saju_reading_buy_v4(
  p_request_id uuid,p_chart_key text,p_topic text,p_year integer,p_expected_user uuid,
  p_expected_charge integer,p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_saju_internal.buy_v4(p_request_id,p_chart_key,p_topic,p_year,p_expected_user,p_expected_charge,p_verify_only);
$function$;
revoke all on function public.saju_reading_buy_v4(uuid,text,text,integer,uuid,integer,boolean) from public,anon;
grant execute on function public.saju_reading_buy_v4(uuid,text,text,integer,uuid,integer,boolean) to authenticated;

create function public.saju_reading_buy_all_v4(
  p_request_id uuid,p_chart_key text,p_year integer,p_expected_user uuid,
  p_expected_charge integer,p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_saju_internal.buy_all_v4(p_request_id,p_chart_key,p_year,p_expected_user,p_expected_charge,p_verify_only);
$function$;
revoke all on function public.saju_reading_buy_all_v4(uuid,text,integer,uuid,integer,boolean) from public,anon;
grant execute on function public.saju_reading_buy_all_v4(uuid,text,integer,uuid,integer,boolean) to authenticated;

-- Cached pre-v4 pages have never disclosed a 24-hour limit or confirmed a
-- renewal fee. Stop them without a debit rather than silently applying new terms.
create or replace function public.saju_reading_buy_v1(p_request_id uuid,p_chart_key text,p_verify_only boolean default false)
returns jsonb language sql security invoker set search_path='' as $function$
  select '{"ok":false,"reason":"update_required"}'::jsonb;
$function$;
create or replace function public.saju_reading_buy_v1(p_request_id uuid,p_chart_key text,p_expected_user uuid,p_verify_only boolean default false)
returns jsonb language sql security invoker set search_path='' as $function$
  select '{"ok":false,"reason":"update_required"}'::jsonb;
$function$;
create or replace function public.saju_reading_buy_v2(p_request_id uuid,p_chart_key text,p_topic text,p_year integer,p_expected_user uuid,p_verify_only boolean default false)
returns jsonb language sql security invoker set search_path='' as $function$
  select '{"ok":false,"reason":"update_required"}'::jsonb;
$function$;
create or replace function public.saju_reading_buy_all_v3(p_request_id uuid,p_chart_key text,p_year integer,p_expected_user uuid,p_verify_only boolean default false)
returns jsonb language sql security invoker set search_path='' as $function$
  select '{"ok":false,"reason":"update_required"}'::jsonb;
$function$;
create or replace function public.saju_reading_status_v1(p_chart_key text default null)
returns jsonb language sql security invoker set search_path='' as $function$
  select '{"ok":false,"reason":"update_required"}'::jsonb;
$function$;
create or replace function public.saju_reading_status_v2(p_chart_key text default null)
returns jsonb language sql security invoker set search_path='' as $function$
  select '{"ok":false,"reason":"update_required"}'::jsonb;
$function$;
create or replace function public.saju_reading_status_v3(p_chart_key text default null)
returns jsonb language sql security invoker set search_path='' as $function$
  select '{"ok":false,"reason":"update_required"}'::jsonb;
$function$;
revoke all on function public.saju_reading_buy_v1(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.saju_reading_buy_v1(uuid,text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.saju_reading_buy_v2(uuid,text,text,integer,uuid,boolean) from public,anon;
revoke all on function public.saju_reading_buy_all_v3(uuid,text,integer,uuid,boolean) from public,anon;
revoke all on function public.saju_reading_status_v1(text) from public,anon;
revoke all on function public.saju_reading_status_v2(text) from public,anon;
revoke all on function public.saju_reading_status_v3(text) from public,anon;
revoke all on function ojjuda_saju_internal.buy_v1(uuid,text,boolean) from public,anon,authenticated;
revoke all on function ojjuda_saju_internal.buy_v1(uuid,text,uuid,boolean) from public,anon,authenticated;
revoke all on function ojjuda_saju_internal.buy_v2(uuid,text,text,integer,uuid,boolean) from public,anon,authenticated;
revoke all on function ojjuda_saju_internal.buy_all_v3(uuid,text,integer,uuid,boolean) from public,anon,authenticated;
revoke all on function ojjuda_saju_internal.status_v1(text) from public,anon,authenticated;
revoke all on function ojjuda_saju_internal.status_v2(text) from public,anon,authenticated;

comment on table ojjuda_saju_internal.topic_entitlements is
  'Latest paid access per member/chart/topic/year, valid for 24 hours from purchased_at. Previous payments remain in spend_requests.';
comment on table ojjuda_saju_internal.all_orders is
  'Latest full-reading order, valid only while every referenced component remains active. Renewals append audit rows and replace this pointer.';
notify pgrst, 'reload schema';
