-- Separate 5-ju biorhythm access for the same member and birthday for 24 hours.
-- Only a member-bound SHA-256 fingerprint is transmitted; the selected date,
-- raw birthday and calculated curves never enter this schema or the ledger.
-- New access requires an explicit quoted-price purchase. Replays never renew.
create schema if not exists ojjuda_biorhythm_internal;
revoke all on schema ojjuda_biorhythm_internal from public,anon,authenticated,service_role;
grant usage on schema ojjuda_biorhythm_internal to authenticated;

create table ojjuda_biorhythm_internal.entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  birth_key text not null check (birth_key ~ '^[0-9a-f]{64}$'),
  request_id uuid not null unique references ojjuda_note_internal.spend_requests(request_id) on delete cascade,
  price integer not null default 5 check (price=5),
  purchased_at timestamptz not null default now(),
  primary key (user_id,birth_key)
);
alter table ojjuda_biorhythm_internal.entitlements enable row level security;
revoke all on table ojjuda_biorhythm_internal.entitlements from public,anon,authenticated,service_role;
comment on column ojjuda_biorhythm_internal.entitlements.birth_key is
  'Lowercase SHA-256 of JSON [ojjuda:biorhythm:v1, lowercase member UUID, ISO solar birthday]. No raw birthday, selected result date, name, or reading text.';
comment on table ojjuda_biorhythm_internal.entitlements is
  'Current separate 5-ju biorhythm access. Valid for exactly 24 hours from purchased_at; renewal preserves immutable spend history.';

-- No client can call this formatter or supply a balance to it. Both public
-- entry points validate the account, then use this exact paid-ledger join.
create function ojjuda_biorhythm_internal.receipt_v1(
  p_user uuid,p_birth_key text,p_coins integer,p_now timestamptz,
  p_replayed boolean,p_entitlement_replayed boolean,p_charged integer
) returns jsonb language sql stable security invoker set search_path='' as $function$
  select pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',e.request_id,'birth_key',e.birth_key,
    'product','biorhythm','topic','rhythm','title','오늘의 바이오리듬','price',5,
    'coins',p_coins,'charged',p_charged,'replayed',p_replayed,
    'entitlement_replayed',p_entitlement_replayed,
    'paid_at',e.purchased_at,'expires_at',e.purchased_at+interval '24 hours',
    'server_now',p_now,'access_hours',24,'access_version',1,'entitlement_version',1
  )
  from ojjuda_biorhythm_internal.entitlements e
  join ojjuda_note_internal.spend_requests s on s.request_id=e.request_id
  where e.user_id=p_user and e.birth_key=p_birth_key
    and s.user_id=e.user_id and s.kind='biorhythm_reading_v1' and s.coins=5
    and s.created_at=e.purchased_at
    and s.result->'ok'='true'::jsonb and s.result->'entitled'='true'::jsonb
    and s.result->>'request_id'=e.request_id::text and s.result->>'birth_key'=e.birth_key
    and s.result->>'product'='biorhythm' and s.result->>'topic'='rhythm'
    and s.result->>'price'='5' and s.result->>'charged'='5'
    and s.result->>'access_version'='1' and s.result->>'access_hours'='24'
    and s.result->>'entitlement_version'='1';
$function$;
revoke all on function ojjuda_biorhythm_internal.receipt_v1(uuid,text,integer,timestamptz,boolean,boolean,integer)
  from public,anon,authenticated,service_role;

create function ojjuda_biorhythm_internal.status_v1(p_birth_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid:=auth.uid();
  v_birth_key text:=pg_catalog.lower(p_birth_key);
  v_coins integer;
  v_now timestamptz;
  v_item jsonb;
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if v_birth_key is not null and v_birth_key !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if not exists(select 1 from public.profiles where id=v_user) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','profile_unavailable');
  end if;
  if public.is_banned(v_user) then return pg_catalog.jsonb_build_object('ok',false,'reason','banned'); end if;
  select coins into v_coins from public.user_private where user_id=v_user;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  v_now:=pg_catalog.clock_timestamp();
  if v_birth_key is not null and exists(select 1 from ojjuda_biorhythm_internal.entitlements
    where user_id=v_user and birth_key=v_birth_key) then
    v_item:=ojjuda_biorhythm_internal.receipt_v1(v_user,v_birth_key,v_coins,v_now,true,true,0);
    if v_item is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    if (v_item->>'expires_at')::timestamptz<=v_now then v_item:=null; end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',true,'coins',v_coins,'birth_key',v_birth_key,'price',5,
    'server_now',v_now,'access_hours',24,'access_version',1,'entitlement_version',1,
    'entitlement',v_item
  );
end;
$function$;
revoke all on function ojjuda_biorhythm_internal.status_v1(text) from public,anon,authenticated,service_role;
grant execute on function ojjuda_biorhythm_internal.status_v1(text) to authenticated;

create function ojjuda_biorhythm_internal.buy_v1(
  p_request_id uuid,p_birth_key text,p_expected_user uuid,
  p_expected_charge integer,p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid:=auth.uid();
  v_birth_key text:=pg_catalog.lower(p_birth_key);
  v_coins integer;
  v_previous record;
  v_item jsonb;
  v_result jsonb;
  v_now timestamptz;
  v_required integer:=5;
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if p_expected_user is distinct from v_user then
    return pg_catalog.jsonb_build_object('ok',false,'reason','account_changed');
  end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if p_request_id is null or v_birth_key is null or v_birth_key !~ '^[0-9a-f]{64}$'
    or p_expected_charge is null or p_expected_charge not in (0,5) or p_verify_only is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if p_verify_only then
    -- Recovery can run in a read-only transaction: no row/advisory locks and no writes.
    select coins into v_coins from public.user_private where user_id=v_user;
  else
    -- Same lock order as the existing paid products: global UUID, then wallet.
    -- A wallet lock also serializes different UUIDs for the same member/birthday.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
    select coins into v_coins from public.user_private where user_id=v_user for update;
  end if;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  if not exists(select 1 from public.profiles where id=v_user) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','profile_unavailable');
  end if;
  if public.is_banned(v_user) then return pg_catalog.jsonb_build_object('ok',false,'reason','banned'); end if;
  -- Capture the clock after acquiring the wallet, rather than at transaction start.
  v_now:=pg_catalog.clock_timestamp();

  select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found and (v_previous.user_id<>v_user or v_previous.kind<>'biorhythm_reading_v1'
    or v_previous.result->>'birth_key' is distinct from v_birth_key) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','request_conflict');
  end if;

  if exists(select 1 from ojjuda_biorhythm_internal.entitlements where user_id=v_user and birth_key=v_birth_key) then
    v_item:=ojjuda_biorhythm_internal.receipt_v1(v_user,v_birth_key,v_coins,v_now,true,true,0);
    if v_item is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
  end if;

  if v_previous.user_id is not null then
    if v_item is null then return pg_catalog.jsonb_build_object('ok',false,'reason','receipt_unavailable'); end if;
    if v_item->>'request_id' is distinct from p_request_id::text or (v_item->>'expires_at')::timestamptz<=v_now then
      return pg_catalog.jsonb_build_object('ok',false,'reason','access_expired','coins',v_coins,'price',5,'server_now',v_now);
    end if;
    -- An exact successful request retry is free even if its original quote was 5.
    return v_item||pg_catalog.jsonb_build_object('entitlement_replayed',false);
  end if;
  if v_item is not null and (v_item->>'expires_at')::timestamptz>v_now then
    v_result:=v_item;v_required:=0;
  end if;
  if not p_verify_only and p_expected_charge<>v_required then
    return pg_catalog.jsonb_build_object('ok',false,'reason','price_changed','coins',v_coins,'price',5,'required',v_required,'server_now',v_now);
  end if;
  if v_result is not null then return v_result; end if;
  if p_verify_only then
    return pg_catalog.jsonb_build_object('ok',false,'reason','not_found','coins',v_coins,'price',5,'required',5,'server_now',v_now);
  end if;
  if v_coins<5 then
    return pg_catalog.jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',5,'required',5,'server_now',v_now);
  end if;

  update public.user_private set coins=coins-5 where user_id=v_user and coins>=5 returning coins into v_coins;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','coins'); end if;
  v_result:=pg_catalog.jsonb_build_object(
    'ok',true,'entitled',true,'request_id',p_request_id,'birth_key',v_birth_key,
    'product','biorhythm','topic','rhythm','title','오늘의 바이오리듬','price',5,
    'coins',v_coins,'charged',5,'replayed',false,'entitlement_replayed',false,
    'paid_at',v_now,'expires_at',v_now+interval '24 hours','server_now',v_now,
    'access_hours',24,'access_version',1,'entitlement_version',1
  );
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
    values(p_request_id,v_user,'biorhythm_reading_v1',5,v_result,v_now);
  insert into ojjuda_biorhythm_internal.entitlements(user_id,birth_key,request_id,price,purchased_at)
    values(v_user,v_birth_key,p_request_id,5,v_now)
    on conflict(user_id,birth_key) do update set request_id=excluded.request_id,purchased_at=excluded.purchased_at;
  -- A failure in either insert aborts the whole statement, including its debit.
  return v_result;
end;
$function$;
revoke all on function ojjuda_biorhythm_internal.buy_v1(uuid,text,uuid,integer,boolean)
  from public,anon,authenticated,service_role;
grant execute on function ojjuda_biorhythm_internal.buy_v1(uuid,text,uuid,integer,boolean) to authenticated;

create function public.biorhythm_status_v1(p_birth_key text default null)
returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_biorhythm_internal.status_v1(p_birth_key);
$function$;
create function public.biorhythm_buy_v1(
  p_request_id uuid,p_birth_key text,p_expected_user uuid,
  p_expected_charge integer,p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_biorhythm_internal.buy_v1(p_request_id,p_birth_key,p_expected_user,p_expected_charge,p_verify_only);
$function$;
revoke all on function public.biorhythm_status_v1(text) from public,anon,authenticated,service_role;
revoke all on function public.biorhythm_buy_v1(uuid,text,uuid,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.biorhythm_status_v1(text) to authenticated;
grant execute on function public.biorhythm_buy_v1(uuid,text,uuid,integer,boolean) to authenticated;
comment on function public.biorhythm_buy_v1(uuid,text,uuid,integer,boolean) is
  'Separate 5-ju biorhythm purchase, exactly 24h access, expected-account and quoted-price guards. Verification and replay never debit or extend access.';

-- Extend the administrator's existing debit-only history, retaining its roles,
-- filters, KST date boundaries, pagination and exclusion of zero-price markers.
drop index if exists ojjuda_note_internal.spend_requests_fortune_history_idx;
create index spend_requests_fortune_history_idx
  on ojjuda_note_internal.spend_requests (created_at desc,request_id desc)
  where kind in ('tarot_reading_v1','saju_reading_v1','saju_reading_v2','saju_compatibility_v1','biorhythm_reading_v1')
    and coins>0 and result->'ok'='true'::jsonb;

create or replace function ojjuda_admin_internal.fortune_purchases(
  p_product text default 'all',p_query text default '',
  p_from date default null,p_to date default null,
  p_limit integer default 30,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare
  v_query text;
  v_from timestamptz;
  v_until timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_product is null or p_product not in ('all','tarot','saju','biorhythm')
    or p_query is null or char_length(p_query)>100
    or p_limit is null or p_limit not between 1 and 100
    or p_offset is null or p_offset<0
    or (p_from is not null and not isfinite(p_from))
    or (p_to is not null and not isfinite(p_to))
    or (p_from is not null and p_to is not null and p_from>p_to) then
    raise exception 'invalid_fortune_page' using errcode='22023';
  end if;
  v_query:=lower(btrim(p_query));
  begin
    v_from:=p_from::timestamp at time zone 'Asia/Seoul';
    v_until:=(p_to+1)::timestamp at time zone 'Asia/Seoul';
  exception when datetime_field_overflow then
    raise exception 'invalid_fortune_page' using errcode='22023';
  end;

  with filtered as materialized (
    select s.request_id,s.user_id,p.nickname,s.coins,s.created_at,
      case when s.kind='tarot_reading_v1' then 'tarot'
        when s.kind='biorhythm_reading_v1' then 'biorhythm' else 'saju' end as product,
      case
        when s.kind='biorhythm_reading_v1' then 'rhythm'
        when s.kind='saju_reading_v1' then 'all'
        when s.kind='saju_compatibility_v1' then 'compatibility'
        when s.kind='tarot_reading_v1'
          and s.result->>'topic' in ('overall','love','money','work') then s.result->>'topic'
        when s.kind='saju_reading_v2'
          and s.result->>'topic' in ('lifelong','annual','yearly','monthly') then s.result->>'topic'
        else 'unknown'
      end as topic,
      case when s.kind='saju_reading_v2'
        and s.result->>'topic' in ('annual','yearly','monthly')
        and jsonb_typeof(s.result->'year') in ('number','string')
        and s.result->>'year' ~ '^[1-9][0-9]{3}$'
        then (s.result->>'year')::integer else null end as year
    from ojjuda_note_internal.spend_requests s
    left join public.profiles p on p.id=s.user_id
    where s.kind in ('tarot_reading_v1','saju_reading_v1','saju_reading_v2','saju_compatibility_v1','biorhythm_reading_v1')
      and s.coins>0 and s.result->'ok'='true'::jsonb
      and (p_product='all'
        or (p_product='tarot' and s.kind='tarot_reading_v1')
        or (p_product='saju' and s.kind in ('saju_reading_v1','saju_reading_v2','saju_compatibility_v1'))
        or (p_product='biorhythm' and s.kind='biorhythm_reading_v1'))
      and (v_query='' or strpos(lower(coalesce(p.nickname,'')),v_query)>0 or s.user_id::text=v_query)
      and (v_from is null or s.created_at>=v_from)
      and (v_until is null or s.created_at<v_until)
  ), page as (
    select * from filtered order by created_at desc,request_id desc limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'request_id',p.request_id,'user_id',p.user_id,'nickname',p.nickname,
      'product',p.product,'topic',p.topic,
      'topic_title',case p.topic
        when 'overall' then '전체운세' when 'love' then '연애운'
        when 'money' then '금전운' when 'work' then '일과 도전'
        when 'lifelong' then '평생운' when 'annual' then '연간운' when 'yearly' then '연간운'
        when 'monthly' then '월별운' when 'compatibility' then '궁합'
        when 'rhythm' then '오늘의 바이오리듬'
        when 'all' then '사주 전체 풀이(이전 상품)'
        else case when p.product='tarot' then '타로 풀이(항목 미확인)' else '사주 풀이(항목 미확인)' end
      end,
      'year',p.year,'coins',p.coins,'created_at',p.created_at
    ) order by p.created_at desc,p.request_id desc) from page p),'[]'::jsonb),
    'total_count',count(*),'total_ju',coalesce(sum(f.coins),0),
    'tarot_count',count(*) filter(where f.product='tarot'),
    'saju_count',count(*) filter(where f.product='saju'),
    'biorhythm_count',count(*) filter(where f.product='biorhythm')
  ) into v_result from filtered f;
  return v_result;
end;
$function$;
revoke all on function ojjuda_admin_internal.fortune_purchases(text,text,date,date,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function ojjuda_admin_internal.fortune_purchases(text,text,date,date,integer,integer) to authenticated;

notify pgrst,'reload schema';
