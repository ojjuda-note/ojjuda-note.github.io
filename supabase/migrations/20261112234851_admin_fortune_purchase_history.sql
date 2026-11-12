-- Read-only administrator view of actual tarot/saju debits. Reopening an
-- entitlement and zero-price bundle markers are not additional purchases.
create schema if not exists ojjuda_admin_internal;
revoke all on schema ojjuda_admin_internal from public, anon;
grant usage on schema ojjuda_admin_internal to authenticated;

create index if not exists spend_requests_fortune_history_idx
  on ojjuda_note_internal.spend_requests (created_at desc, request_id desc)
  where kind in ('tarot_reading_v1', 'saju_reading_v1', 'saju_reading_v2')
    and coins > 0 and result->'ok' = 'true'::jsonb;

create function ojjuda_admin_internal.fortune_purchases(
  p_product text default 'all', p_query text default '',
  p_from date default null, p_to date default null,
  p_limit integer default 30, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  v_query text;
  v_from timestamptz;
  v_until timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_product is null or p_product not in ('all', 'tarot', 'saju')
    or p_query is null or char_length(p_query) > 100
    or p_limit is null or p_limit not between 1 and 100
    or p_offset is null or p_offset < 0
    or (p_from is not null and not isfinite(p_from))
    or (p_to is not null and not isfinite(p_to))
    or (p_from is not null and p_to is not null and p_from > p_to) then
    raise exception 'invalid_fortune_page' using errcode = '22023';
  end if;
  v_query := lower(btrim(p_query));
  begin
    v_from := p_from::timestamp at time zone 'Asia/Seoul';
    v_until := (p_to + 1)::timestamp at time zone 'Asia/Seoul';
  exception when datetime_field_overflow then
    raise exception 'invalid_fortune_page' using errcode = '22023';
  end;

  with filtered as materialized (
    select s.request_id, s.user_id, p.nickname, s.coins, s.created_at,
      case when s.kind = 'tarot_reading_v1' then 'tarot' else 'saju' end as product,
      case
        when s.kind = 'saju_reading_v1' then 'all'
        when s.kind = 'tarot_reading_v1'
          and s.result->>'topic' in ('overall', 'love', 'money', 'work') then s.result->>'topic'
        when s.kind = 'saju_reading_v2'
          and s.result->>'topic' in ('lifelong', 'yearly', 'monthly') then s.result->>'topic'
        else 'unknown'
      end as topic,
      case when s.kind = 'saju_reading_v2'
        and s.result->>'topic' in ('yearly', 'monthly')
        and jsonb_typeof(s.result->'year') in ('number', 'string')
        and s.result->>'year' ~ '^[1-9][0-9]{3}$'
        then (s.result->>'year')::integer else null end as year
    from ojjuda_note_internal.spend_requests s
    left join public.profiles p on p.id = s.user_id
    where s.kind in ('tarot_reading_v1', 'saju_reading_v1', 'saju_reading_v2')
      and s.coins > 0 and s.result->'ok' = 'true'::jsonb
      and (p_product = 'all'
        or (p_product = 'tarot' and s.kind = 'tarot_reading_v1')
        or (p_product = 'saju' and s.kind in ('saju_reading_v1', 'saju_reading_v2')))
      and (v_query = '' or strpos(lower(coalesce(p.nickname, '')), v_query) > 0
        or s.user_id::text = v_query)
      and (v_from is null or s.created_at >= v_from)
      and (v_until is null or s.created_at < v_until)
  ), page as (
    select * from filtered order by created_at desc, request_id desc
      limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'request_id', p.request_id, 'user_id', p.user_id, 'nickname', p.nickname,
      'product', p.product, 'topic', p.topic,
      'topic_title', case p.topic
        when 'overall' then '전체운세' when 'love' then '연애운'
        when 'money' then '금전운' when 'work' then '일과 도전'
        when 'lifelong' then '평생운' when 'yearly' then '연간운'
        when 'monthly' then '월별운' when 'all' then '사주 전체 풀이(이전 상품)'
        else case when p.product = 'tarot' then '타로 풀이(항목 미확인)'
          else '사주 풀이(항목 미확인)' end
      end,
      'year', p.year, 'coins', p.coins, 'created_at', p.created_at
    ) order by p.created_at desc, p.request_id desc) from page p), '[]'::jsonb),
    'total_count', count(*), 'total_ju', coalesce(sum(f.coins), 0),
    'tarot_count', count(*) filter (where f.product = 'tarot'),
    'saju_count', count(*) filter (where f.product = 'saju')
  ) into v_result from filtered f;
  return v_result;
end;
$function$;
revoke all on function ojjuda_admin_internal.fortune_purchases(text,text,date,date,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function ojjuda_admin_internal.fortune_purchases(text,text,date,date,integer,integer)
  to authenticated;

create function public.admin_fortune_purchases(
  p_product text default 'all', p_query text default '',
  p_from date default null, p_to date default null,
  p_limit integer default 30, p_offset integer default 0
) returns jsonb
language sql stable security invoker
set search_path = ''
as $function$
  select ojjuda_admin_internal.fortune_purchases(p_product,p_query,p_from,p_to,p_limit,p_offset);
$function$;
revoke all on function public.admin_fortune_purchases(text,text,date,date,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_fortune_purchases(text,text,date,date,integer,integer)
  to authenticated;

comment on function public.admin_fortune_purchases(text,text,date,date,integer,integer) is
  'Administrator-only, read-only actual tarot/saju purchase history with KST date filters. Excludes zero-price markers and raw reading/birth data; never changes billing or access.';
notify pgrst, 'reload schema';
