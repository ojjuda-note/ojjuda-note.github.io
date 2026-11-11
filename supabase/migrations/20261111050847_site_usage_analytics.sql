-- Private, aggregate-only site analytics. Browser tokens, IPs, raw referrers,
-- URLs and account IDs never appear in reporting tables or admin responses.
create schema if not exists ojjuda_insights;
revoke all on schema ojjuda_insights from public, anon, authenticated;
grant usage on schema ojjuda_insights to anon, authenticated;

create table ojjuda_insights.settings (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz not null default now(),
  salt uuid not null default gen_random_uuid()
);
insert into ojjuda_insights.settings(singleton) values (true);

create table ojjuda_insights.visit_totals (
  visit_day date not null,
  visit_hour smallint not null check (visit_hour between 0 and 23),
  source text not null check (source in
    ('direct','naver','google','search','social','external','internal','campaign')),
  visits bigint not null default 0 check (visits >= 0),
  primary key (visit_day, visit_hour, source)
);
create table ojjuda_insights.feature_totals (
  visit_day date not null,
  feature text not null check (length(feature) between 2 and 40),
  uses bigint not null default 0 check (uses >= 0),
  primary key (visit_day, feature)
);
create table ojjuda_insights.seen (
  visit_day date not null,
  browser_hash bytea not null check (octet_length(browser_hash) = 32),
  event_key text not null check (length(event_key) between 2 and 40),
  primary key (visit_day, browser_hash, event_key)
);
create table ojjuda_insights.hour_limits (
  hour_start timestamptz primary key,
  events integer not null check (events between 1 and 20000)
);
alter table ojjuda_insights.settings enable row level security;
alter table ojjuda_insights.visit_totals enable row level security;
alter table ojjuda_insights.feature_totals enable row level security;
alter table ojjuda_insights.seen enable row level security;
alter table ojjuda_insights.hour_limits enable row level security;
revoke all on all tables in schema ojjuda_insights from public, anon, authenticated;

-- The browser sends one daily random UUID. Its salted hash is used only for
-- daily duplicate suppression, never for user identification or navigation logs.
create function ojjuda_insights.record_event(
  p_visit_id uuid, p_event text, p_feature text, p_source text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_day date := (v_now at time zone 'Asia/Seoul')::date;
  v_hour smallint := extract(hour from v_now at time zone 'Asia/Seoul')::smallint;
  v_hour_utc timestamptz := date_trunc('hour', v_now);
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_salt text;
  v_browser bytea;
  v_event_key text;
  v_total integer;
begin
  if p_visit_id is null or p_visit_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid_visit_id' using errcode = '22023';
  end if;
  if p_event not in ('visit','feature') or p_event is null then
    raise exception 'invalid_insight_event' using errcode = '22023';
  end if;
  if p_event = 'visit' and (p_source is null or p_source not in
    ('direct','naver','google','search','social','external','internal','campaign')) then
    raise exception 'invalid_insight_source' using errcode = '22023';
  end if;
  if p_event = 'feature' and (p_feature is null or p_feature not in (
    'agit','arcade','park','settings','portal','group','fanpages','restaurants','festival',
    'game_chacha_rush','game_solitaire','game_archery','game_sacheonseong',
    'game_mines','game_saetbyeol','game_mole','game_runner','game_stacker',
    'game_breakout','game_spot','game_screw','game_bang','game_tank',
    'game_tour','game_ttang','game_janggi','game_chess','game_billiards',
    'game_matgo','game_poker','game_roulette','game_photo_ttang','game_other'
  )) then
    raise exception 'invalid_insight_feature' using errcode = '22023';
  end if;
  if coalesce(v_headers->>'origin','') not in
    ('https://ojjuda.kr','https://www.ojjuda.kr','https://ojjuda.com',
     'https://www.ojjuda.com','https://ojjuda-note.github.io') then
    raise exception 'invalid_visit_origin' using errcode = '22023';
  end if;
  if v_headers->>'dnt' = '1' or v_headers->>'sec-gpc' = '1'
    or coalesce(v_headers->>'user-agent','') ~* '(bot|crawler|spider|slurp|bingpreview)' then
    return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
  end if;
  v_event_key := case when p_event = 'visit' then 'visit' else p_feature end;
  select salt::text into strict v_salt from ojjuda_insights.settings where singleton;
  v_browser := sha256(convert_to(p_visit_id::text || ':' || v_day::text || ':' || v_salt,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(encode(v_browser,'hex'), 111126));
  if exists(select 1 from ojjuda_insights.seen
    where visit_day=v_day and browser_hash=v_browser and event_key=v_event_key) then
    return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
  end if;
  insert into ojjuda_insights.hour_limits as limits(hour_start,events)
    values (v_hour_utc,1) on conflict(hour_start) do update
    set events=limits.events+1 where limits.events<20000
    returning events into v_total;
  if v_total is null then return jsonb_build_object('ok',false,'reason','rate_limited'); end if;
  insert into ojjuda_insights.seen(visit_day,browser_hash,event_key)
    values(v_day,v_browser,v_event_key) on conflict do nothing;
  if found then
    if p_event = 'visit' then
      insert into ojjuda_insights.visit_totals as totals(visit_day,visit_hour,source,visits)
        values(v_day,v_hour,p_source,1)
        on conflict(visit_day,visit_hour,source) do update set visits=totals.visits+1;
    else
      insert into ojjuda_insights.feature_totals as totals(visit_day,feature,uses)
        values(v_day,p_feature,1)
        on conflict(visit_day,feature) do update set uses=totals.uses+1;
    end if;
  end if;
  return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
end;
$$;
revoke all on function ojjuda_insights.record_event(uuid,text,text,text) from public, anon, authenticated;
grant execute on function ojjuda_insights.record_event(uuid,text,text,text) to anon, authenticated;
create function public.record_site_usage(p_visit_id uuid,p_event text,p_feature text,p_source text)
returns jsonb language sql security invoker set search_path = '' as $$
  select ojjuda_insights.record_event(p_visit_id,p_event,p_feature,p_source);
$$;
revoke all on function public.record_site_usage(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.record_site_usage(uuid,text,text,text) to anon, authenticated;

-- One bounded, privileged response supplies every chart in a single RPC.
create function ojjuda_insights.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_start timestamptz;
  v_day_start date := v_today - 29;
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select started_at into strict v_start from ojjuda_insights.settings where singleton;
  return jsonb_build_object(
    'started_at',v_start,'today_date',v_today,'timezone','Asia/Seoul',
    'today',coalesce((select sum(visits) from ojjuda_insights.visit_totals where visit_day=v_today),0),
    'month',coalesce((select sum(visits) from ojjuda_insights.visit_totals
      where visit_day>=date_trunc('month',v_today::timestamp)::date and visit_day<=v_today),0),
    'total',coalesce((select sum(visits) from ojjuda_insights.visit_totals),0),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('period',d::date,'visits',coalesce(v.visits,0)) order by d)
      from generate_series(v_day_start::timestamp,v_today::timestamp,interval '1 day') d
      left join (select visit_day,sum(visits) visits from ojjuda_insights.visit_totals
        where visit_day between v_day_start and v_today group by visit_day) v on v.visit_day=d::date),'[]'::jsonb),
    'hourly',coalesce((select jsonb_agg(jsonb_build_object('hour',h,'visits',coalesce(v.visits,0)) order by h)
      from generate_series(0,23) h left join (select visit_hour,sum(visits) visits
        from ojjuda_insights.visit_totals where visit_day=v_today group by visit_hour) v on v.visit_hour=h),'[]'::jsonb),
    'weekday',coalesce((select jsonb_agg(jsonb_build_object('day',n,'visits',coalesce(v.visits,0)) order by n)
      from generate_series(1,7) n left join (select extract(isodow from visit_day)::int weekday_num,sum(visits) visits
        from ojjuda_insights.visit_totals where visit_day between v_day_start and v_today group by 1) v on v.weekday_num=n),'[]'::jsonb),
    'features',coalesce((select jsonb_agg(jsonb_build_object('feature',feature,'uses',uses) order by uses desc,feature)
      from (select feature,sum(uses) uses from ojjuda_insights.feature_totals
        where visit_day between v_day_start and v_today group by feature order by uses desc,feature limit 12) ranked),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(jsonb_build_object('source',s.source,'visits',coalesce(v.visits,0)) order by s.seq)
      from (values (1,'direct'),(2,'naver'),(3,'google'),(4,'search'),(5,'social'),
        (6,'external'),(7,'internal'),(8,'campaign')) s(seq,source)
      left join (select source,sum(visits) visits from ojjuda_insights.visit_totals
        where visit_day between v_day_start and v_today group by source) v on v.source=s.source),'[]'::jsonb)
  );
end;
$$;
revoke all on function ojjuda_insights.admin_stats() from public, anon, authenticated;
grant execute on function ojjuda_insights.admin_stats() to authenticated;
create function public.admin_site_usage_stats()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select ojjuda_insights.admin_stats();
$$;
revoke all on function public.admin_site_usage_stats() from public, anon, authenticated;
grant execute on function public.admin_site_usage_stats() to authenticated;

create function ojjuda_insights.purge_expired()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from ojjuda_insights.seen where visit_day < (now() at time zone 'Asia/Seoul')::date-1;
  delete from ojjuda_insights.hour_limits where hour_start < now()-interval '2 days';
  delete from ojjuda_insights.visit_totals where visit_day < (now() at time zone 'Asia/Seoul')::date-400;
  delete from ojjuda_insights.feature_totals where visit_day < (now() at time zone 'Asia/Seoul')::date-400;
end;
$$;
revoke all on function ojjuda_insights.purge_expired() from public, anon, authenticated;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('ojjuda-site-insights-retention','27 2 * * *','select ojjuda_insights.purge_expired();');
  end if;
end $$;
notify pgrst,'reload schema';
