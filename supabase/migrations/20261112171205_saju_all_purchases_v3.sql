-- Full saju = lifelong + one selected annual year + that year's 12 months.
-- The listed bundle price is 30 ju. Already-owned parts are never charged twice.
-- A zero-cost master spend row reserves the global request UUID; only the
-- existing 10-ju individual spend rows contribute to the wallet's spend total.
create table ojjuda_saju_internal.all_orders (
  user_id uuid not null references auth.users(id) on delete cascade,
  chart_key text not null check (chart_key ~ '^[0-9a-f]{64}$'),
  year integer not null check (year between 1900 and 2050),
  request_id uuid not null unique references ojjuda_note_internal.spend_requests(request_id) on delete cascade,
  price integer not null default 30 check (price=30),
  charged integer not null check (charged in (0,10,20,30)),
  item_requests jsonb not null check (jsonb_typeof(item_requests)='array' and jsonb_array_length(item_requests)=3),
  purchased_at timestamptz not null default now(),
  primary key (user_id,chart_key,year)
);
alter table ojjuda_saju_internal.all_orders enable row level security;
revoke all on table ojjuda_saju_internal.all_orders from public,anon,authenticated;
comment on table ojjuda_saju_internal.all_orders is
  'One atomic full-reading order for a member-scoped chart hash and report year. No raw birth input.';
comment on column ojjuda_saju_internal.all_orders.item_requests is
  'Exact topic/year/request_id references for lifelong year 0 and annual/monthly selected year; validated against individual v2 receipts.';

-- Rebuild all parts from the existing entitlement/ledger joins. The aggregate
-- cannot authorize a missing, corrupted or differently scoped individual part.
create function ojjuda_saju_internal.receipt_all_v3(
  p_user uuid,p_chart_key text,p_year integer,p_coins integer,
  p_replayed boolean,p_entitlement_replayed boolean,p_charged integer,
  p_new_requests uuid[] default array[]::uuid[]
) returns jsonb language sql stable security invoker set search_path='' as $function$
  with products(topic,year,ordinal) as (
    values ('lifelong'::text,0,1),('annual'::text,p_year,2),('monthly'::text,p_year,3)
  ), parts as (
    select p.topic,p.year,p.ordinal,e.request_id,
      ojjuda_saju_internal.receipt_v2(
        p_user,p_chart_key,p.topic,p.year,p_coins,
        not coalesce(e.request_id=any(p_new_requests),false),
        not coalesce(e.request_id=any(p_new_requests),false),
        case when e.request_id=any(p_new_requests) then 10 else 0 end
      ) as receipt
    from products p left join ojjuda_saju_internal.topic_entitlements e
      on e.user_id=p_user and e.chart_key=p_chart_key and e.topic=p.topic and e.year=p.year
  ), complete as (
    select count(receipt) as found,
      pg_catalog.jsonb_agg(receipt order by ordinal) as items,
      pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('topic',topic,'year',year,'request_id',request_id) order by ordinal) as item_requests
    from parts
  )
  select pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',o.request_id,'chart_key',o.chart_key,
    'topic','all','year',o.year,'price',30,'coins',p_coins,'charged',p_charged,
    'replayed',p_replayed,'entitlement_replayed',p_entitlement_replayed,
    'paid_at',o.purchased_at,'product','saju','title',o.year::text||'년 사주 전체 풀이',
    'legacy_bundle',false,'entitlement_version',3,'items',c.items
  )
  from ojjuda_saju_internal.all_orders o
  join ojjuda_note_internal.spend_requests s on s.request_id=o.request_id
  cross join complete c
  where o.user_id=p_user and o.chart_key=p_chart_key and o.year=p_year
    and c.found=3 and c.item_requests=o.item_requests
    and s.user_id=o.user_id and s.kind='saju_reading_all_v3' and s.coins=0
    and s.result->>'chart_key'=o.chart_key and s.result->>'topic'='all'
    and s.result->>'year'=o.year::text and s.result->>'price'='30'
    and s.result->>'charged'=o.charged::text and s.result->'item_requests'=o.item_requests;
$function$;
revoke all on function ojjuda_saju_internal.receipt_all_v3(uuid,text,integer,integer,boolean,boolean,integer,uuid[])
  from public,anon,authenticated;

create function ojjuda_saju_internal.buy_all_v3(
  p_request_id uuid,p_chart_key text,p_year integer,p_expected_user uuid,
  p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid:=auth.uid();
  v_chart_key text:=pg_catalog.lower(p_chart_key);
  v_coins integer;
  v_previous record;
  v_result jsonb;
  v_item jsonb;
  v_legacy jsonb;
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
    or p_year is null or p_year not between 1900 and 2050 or p_verify_only is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
  end if;

  -- Match all existing purchases: request UUID lock first, wallet row second.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  if public.is_banned(v_user) then return pg_catalog.jsonb_build_object('ok',false,'reason','banned'); end if;

  select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if v_previous.user_id<>v_user then
      return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
    elsif v_previous.kind='saju_reading_all_v3' then
      if v_previous.result->>'chart_key' is distinct from v_chart_key
        or v_previous.result->>'topic' is distinct from 'all'
        or v_previous.result->>'year' is distinct from p_year::text then
        return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
      end if;
      v_result:=ojjuda_saju_internal.receipt_all_v3(v_user,v_chart_key,p_year,v_coins,true,false,0);
      if v_result is null or v_result->>'request_id' is distinct from p_request_id::text then
        return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable');
      end if;
      return v_result;
    elsif v_previous.kind<>'saju_reading_v1'
      or v_previous.result->>'chart_key' is distinct from v_chart_key
      or not exists(select 1 from ojjuda_saju_internal.entitlements
        where user_id=v_user and chart_key=v_chart_key and request_id=p_request_id) then
      return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
    end if;
  end if;

  if exists(select 1 from ojjuda_saju_internal.all_orders where user_id=v_user and chart_key=v_chart_key and year=p_year) then
    v_result:=ojjuda_saju_internal.receipt_all_v3(v_user,v_chart_key,p_year,v_coins,true,true,0);
    if v_result is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    return v_result;
  end if;

  -- Old v1 owners retain their chart-wide access, without an audit write or fee.
  if exists(select 1 from ojjuda_saju_internal.entitlements where user_id=v_user and chart_key=v_chart_key) then
    v_legacy:=ojjuda_saju_internal.receipt_v1(v_user,v_chart_key,v_coins,true,true,0);
    if v_legacy is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    for v_index in 1..3 loop
      v_title:=case v_topics[v_index] when 'lifelong' then '사주 평생운'
        when 'annual' then p_year::text||'년 사주 연간운' else p_year::text||'년 사주 월별운 (12개월)' end;
      v_items:=v_items||pg_catalog.jsonb_build_array(v_legacy||pg_catalog.jsonb_build_object(
        'topic',v_topics[v_index],'year',v_years[v_index],'title',v_title,
        'legacy_bundle',true,'entitlement_version',2
      ));
    end loop;
    return v_legacy||pg_catalog.jsonb_build_object(
      'topic','all','year',p_year,'price',30,'charged',0,'title',p_year::text||'년 사주 전체 풀이',
      'legacy_bundle',true,'entitlement_version',3,'items',v_items,
      'entitlement_replayed',(v_legacy->>'request_id') is distinct from p_request_id::text
    );
  end if;

  -- Count only missing parts; existing parts must have valid original receipts.
  for v_index in 1..3 loop
    if exists(select 1 from ojjuda_saju_internal.topic_entitlements
      where user_id=v_user and chart_key=v_chart_key and topic=v_topics[v_index] and year=v_years[v_index]) then
      v_item:=ojjuda_saju_internal.receipt_v2(v_user,v_chart_key,v_topics[v_index],v_years[v_index],v_coins,true,true,0);
      if v_item is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    else
      v_missing:=pg_catalog.array_append(v_missing,v_topics[v_index]);
      v_required:=v_required+10;
    end if;
  end loop;
  if p_verify_only then
    return pg_catalog.jsonb_build_object('ok',false,'reason','not_found','coins',v_coins,'price',30,'required',v_required);
  end if;
  if v_coins<v_required then
    return pg_catalog.jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',30,'required',v_required);
  end if;
  if v_required>0 then
    update public.user_private set coins=coins-v_required where user_id=v_user and coins>=v_required returning coins into v_coins;
    if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','coins','price',30,'required',v_required); end if;
  end if;
  v_now:=pg_catalog.clock_timestamp();

  -- Every insert and the single debit are in this SQL statement's transaction.
  -- Child UUIDs are server-generated, never reused from the caller or another part.
  for v_index in 1..3 loop
    if v_topics[v_index]=any(v_missing) then
      loop
        v_child_id:=pg_catalog.gen_random_uuid();
        exit when v_child_id<>p_request_id and not exists(select 1 from ojjuda_note_internal.spend_requests where request_id=v_child_id);
      end loop;
      v_title:=case v_topics[v_index] when 'lifelong' then '사주 평생운'
        when 'annual' then p_year::text||'년 사주 연간운' else p_year::text||'년 사주 월별운 (12개월)' end;
      v_item:=pg_catalog.jsonb_build_object(
        'ok',true,'entitled',true,'request_id',v_child_id,'chart_key',v_chart_key,
        'topic',v_topics[v_index],'year',v_years[v_index],'price',10,'coins',v_coins,'charged',10,
        'replayed',false,'entitlement_replayed',false,'paid_at',v_now,'product','saju','title',v_title,
        'legacy_bundle',false,'entitlement_version',2,'all_request_id',p_request_id
      );
      insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
        values(v_child_id,v_user,'saju_reading_v2',10,v_item,v_now);
      insert into ojjuda_saju_internal.topic_entitlements(user_id,chart_key,topic,year,request_id,price,purchased_at)
        values(v_user,v_chart_key,v_topics[v_index],v_years[v_index],v_child_id,10,v_now);
      v_new_requests:=pg_catalog.array_append(v_new_requests,v_child_id);
    end if;
    v_item:=ojjuda_saju_internal.receipt_v2(v_user,v_chart_key,v_topics[v_index],v_years[v_index],v_coins,true,true,0);
    if v_item is null then raise exception 'saju_bundle_receipt_unavailable'; end if;
    v_item_requests:=v_item_requests||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'topic',v_topics[v_index],'year',v_years[v_index],'request_id',v_item->>'request_id'
    ));
  end loop;

  v_result:=pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',p_request_id,'chart_key',v_chart_key,
    'topic','all','year',p_year,'price',30,'coins',v_coins,'charged',v_required,
    'replayed',v_required=0,'entitlement_replayed',false,'paid_at',v_now,
    'product','saju','title',p_year::text||'년 사주 전체 풀이','legacy_bundle',false,
    'entitlement_version',3,'item_requests',v_item_requests,'ledger_charge',0
  );
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
    values(p_request_id,v_user,'saju_reading_all_v3',0,v_result,v_now);
  insert into ojjuda_saju_internal.all_orders(user_id,chart_key,year,request_id,price,charged,item_requests,purchased_at)
    values(v_user,v_chart_key,p_year,p_request_id,30,v_required,v_item_requests,v_now);
  v_result:=ojjuda_saju_internal.receipt_all_v3(v_user,v_chart_key,p_year,v_coins,v_required=0,false,v_required,v_new_requests);
  if v_result is null then raise exception 'saju_bundle_receipt_unavailable'; end if;
  return v_result;
end;
$function$;
revoke all on function ojjuda_saju_internal.buy_all_v3(uuid,text,integer,uuid,boolean) from public,anon;
grant execute on function ojjuda_saju_internal.buy_all_v3(uuid,text,integer,uuid,boolean) to authenticated;

create function public.saju_reading_buy_all_v3(
  p_request_id uuid,p_chart_key text,p_year integer,p_expected_user uuid,
  p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_saju_internal.buy_all_v3(p_request_id,p_chart_key,p_year,p_expected_user,p_verify_only);
$function$;
revoke all on function public.saju_reading_buy_all_v3(uuid,text,integer,uuid,boolean) from public,anon;
grant execute on function public.saju_reading_buy_all_v3(uuid,text,integer,uuid,boolean) to authenticated;

create function public.saju_reading_status_v3(p_chart_key text default null)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare v_result jsonb;
begin
  v_result:=ojjuda_saju_internal.status_v2(p_chart_key);
  if v_result->>'ok'='true' then
    return v_result||pg_catalog.jsonb_build_object(
      'prices',(v_result->'prices')||pg_catalog.jsonb_build_object('all',30),'entitlement_version',3
    );
  end if;
  return v_result;
end;
$function$;
revoke all on function public.saju_reading_status_v3(text) from public,anon;
grant execute on function public.saju_reading_status_v3(text) to authenticated;

notify pgrst, 'reload schema';
