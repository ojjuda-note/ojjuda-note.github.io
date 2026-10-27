-- Only daily aggregates are retained. Raw browser IDs and IP addresses are never stored.
create schema if not exists ojjuda_traffic;
revoke all on schema ojjuda_traffic from public, anon, authenticated;
grant usage on schema ojjuda_traffic to anon, authenticated;

create table ojjuda_traffic.settings (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz not null default now(),
  salt uuid not null default gen_random_uuid()
);
insert into ojjuda_traffic.settings(singleton) values(true);
create table ojjuda_traffic.daily (
  visit_day date primary key,
  guest_visits bigint not null default 0 check (guest_visits >= 0)
);
create table ojjuda_traffic.seen (
  visit_day date not null,
  browser_hash bytea not null check (octet_length(browser_hash) = 32),
  primary key(visit_day, browser_hash)
);
create table ojjuda_traffic.rate_limits (
  hour_start timestamptz not null,
  network_hash bytea not null check (octet_length(network_hash) = 32),
  requests integer not null check (requests between 1 and 200),
  primary key(hour_start, network_hash)
);
alter table ojjuda_traffic.settings enable row level security;
alter table ojjuda_traffic.daily enable row level security;
alter table ojjuda_traffic.seen enable row level security;
alter table ojjuda_traffic.rate_limits enable row level security;
revoke all on all tables in schema ojjuda_traffic from public, anon, authenticated;

-- Intentional anonymous, write-only endpoint: no totals, rows, secrets or IDs are returned.
-- The implementation is outside the exposed schema and the public wrapper is SECURITY INVOKER.
create function ojjuda_traffic.record_guest(p_visit_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_day date := (v_now at time zone 'Asia/Seoul')::date;
  v_hour timestamptz := date_trunc('hour', v_now);
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_origin text;
  v_ip text;
  v_salt text;
  v_browser bytea;
  v_network bytea;
  v_requests integer;
begin
  if auth.uid() is not null then raise exception 'guest_only' using errcode='42501'; end if;
  if p_visit_id is null or p_visit_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid_visit_id' using errcode='22023';
  end if;
  v_origin := v_headers->>'origin';
  if v_origin is null or v_origin not in ('https://ojjuda.kr','https://www.ojjuda.kr','https://ojjuda.com','https://www.ojjuda.com','https://ojjuda-note.github.io') then
    raise exception 'invalid_visit_origin' using errcode='22023';
  end if;
  if coalesce(v_headers->>'user-agent','') ~* '(bot|crawler|spider|slurp|bingpreview)' then
    return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
  end if;
  -- A trusted gateway supplies this header. Missing/invalid addresses share a limited bucket.
  begin
    v_ip := host(trim(split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1))::inet);
  exception when invalid_text_representation then v_ip := 'unknown'; end;
  v_ip := coalesce(v_ip,'unknown');
  select salt::text into strict v_salt from ojjuda_traffic.settings where singleton;
  v_browser := sha256(convert_to(p_visit_id::text || ':' || v_day::text || ':' || v_salt,'UTF8'));
  v_network := sha256(convert_to(v_ip || ':' || v_hour::text || ':' || v_salt,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(encode(v_browser,'hex'), 726104));
  if exists(select 1 from ojjuda_traffic.seen where visit_day=v_day and browser_hash=v_browser) then
    return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
  end if;
  insert into ojjuda_traffic.rate_limits as rate(hour_start,network_hash,requests)
  values(v_hour,v_network,1)
  on conflict(hour_start,network_hash) do update set requests=rate.requests+1 where rate.requests<200
  returning requests into v_requests;
  if v_requests is null then return jsonb_build_object('ok',false,'reason','rate_limited'); end if;
  insert into ojjuda_traffic.seen(visit_day,browser_hash) values(v_day,v_browser) on conflict do nothing;
  if found then
    insert into ojjuda_traffic.daily as totals(visit_day,guest_visits) values(v_day,1)
    on conflict(visit_day) do update set guest_visits=totals.guest_visits+1;
  end if;
  return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
end;
$$;
revoke all on function ojjuda_traffic.record_guest(uuid) from public, anon, authenticated;
grant execute on function ojjuda_traffic.record_guest(uuid) to anon;

create function public.record_guest_visit(p_visit_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select ojjuda_traffic.record_guest(p_visit_id);
$$;
revoke all on function public.record_guest_visit(uuid) from public, anon, authenticated;
grant execute on function public.record_guest_visit(uuid) to anon;

create function ojjuda_traffic.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_start timestamptz;
  v_start_day date;
  v_month date := date_trunc('month',v_today::timestamp)::date;
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select started_at into strict v_start from ojjuda_traffic.settings where singleton;
  v_start_day := (v_start at time zone 'Asia/Seoul')::date;
  return jsonb_build_object(
    'started_at',v_start,'today_date',v_today,'timezone','Asia/Seoul',
    'today',coalesce((select guest_visits from ojjuda_traffic.daily where visit_day=v_today),0),
    'month',(select coalesce(sum(guest_visits),0) from ojjuda_traffic.daily where visit_day between v_month and v_today),
    'total',(select coalesce(sum(guest_visits),0) from ojjuda_traffic.daily where visit_day<=v_today),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('period',d::date,'visits',coalesce(t.guest_visits,0)) order by d desc)
      from generate_series(greatest(v_start_day,v_today-29)::timestamp,v_today::timestamp,interval '1 day') d
      left join ojjuda_traffic.daily t on t.visit_day=d::date),'[]'::jsonb),
    'monthly',coalesce((select jsonb_agg(jsonb_build_object('period',to_char(d,'YYYY-MM'),'visits',coalesce(t.visits,0)) order by d desc)
      from generate_series(greatest(date_trunc('month',v_start_day::timestamp),v_month::timestamp-interval '11 months'),v_month::timestamp,interval '1 month') d
      left join (select date_trunc('month',visit_day::timestamp) as month_start,sum(guest_visits) as visits from ojjuda_traffic.daily
        where visit_day>=v_month-interval '11 months' and visit_day<=v_today group by 1) t on t.month_start=d),'[]'::jsonb)
  );
end;
$$;
revoke all on function ojjuda_traffic.admin_stats() from public, anon, authenticated;
grant execute on function ojjuda_traffic.admin_stats() to authenticated;
create function public.admin_guest_visit_stats()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select ojjuda_traffic.admin_stats();
$$;
revoke all on function public.admin_guest_visit_stats() from public, anon, authenticated;
grant execute on function public.admin_guest_visit_stats() to authenticated;

create function ojjuda_traffic.purge_expired()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from ojjuda_traffic.seen where visit_day < (now() at time zone 'Asia/Seoul')::date-1;
  delete from ojjuda_traffic.rate_limits where hour_start < now()-interval '2 days';
end;
$$;
revoke all on function ojjuda_traffic.purge_expired() from public, anon, authenticated;
-- Production has pg_cron. The conditional also lets an isolated database test the same migration.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('ojjuda-guest-visit-retention','12 * * * *','select ojjuda_traffic.purge_expired();');
  end if;
end $$;
notify pgrst,'reload schema';
