-- Daily aggregate counts for game challenges. No account ID, raw browser UUID,
-- IP address, URL or user-agent is stored. This is usage telemetry, not score proof.
create schema if not exists ojjuda_growth;
revoke all on schema ojjuda_growth from public, anon, authenticated;
grant usage on schema ojjuda_growth to anon, authenticated;

create table ojjuda_growth.settings (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz not null default now(),
  salt uuid not null default gen_random_uuid()
);
insert into ojjuda_growth.settings(singleton) values(true);
create table ojjuda_growth.daily (
  visit_day date not null,
  game text not null check (game in ('stacker','mole')),
  source text not null check (source in ('direct','challenge')),
  visits bigint not null default 0 check (visits >= 0),
  starts bigint not null default 0 check (starts >= 0),
  completes bigint not null default 0 check (completes >= 0),
  shares bigint not null default 0 check (shares >= 0),
  primary key(visit_day, game, source)
);
create table ojjuda_growth.seen (
  visit_day date not null,
  browser_hash bytea not null check (octet_length(browser_hash) = 32),
  game text not null check (game in ('stacker','mole')),
  source text not null check (source in ('direct','challenge')),
  event text not null check (event in ('visit','start','complete','share')),
  primary key(visit_day, browser_hash, game, source, event)
);
create table ojjuda_growth.hour_limits (
  hour_start timestamptz primary key,
  events integer not null check (events between 1 and 10000)
);
alter table ojjuda_growth.settings enable row level security;
alter table ojjuda_growth.daily enable row level security;
alter table ojjuda_growth.seen enable row level security;
alter table ojjuda_growth.hour_limits enable row level security;
revoke all on all tables in schema ojjuda_growth from public, anon, authenticated;

-- Intentional anonymous/member write-only endpoint. No access to individual history
-- or totals is granted. The public entry point remains SECURITY INVOKER.
create function ojjuda_growth.record_event(p_visit_id uuid, p_game text, p_source text, p_event text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_day date := (v_now at time zone 'Asia/Seoul')::date;
  v_hour timestamptz := date_trunc('hour', v_now);
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_salt text;
  v_browser bytea;
  v_events integer;
begin
  if p_visit_id is null or p_visit_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid_visit_id' using errcode='22023';
  end if;
  if p_game is null or p_game not in ('stacker','mole')
    or p_source is null or p_source not in ('direct','challenge')
    or p_event is null or p_event not in ('visit','start','complete','share') then
    raise exception 'invalid_growth_event' using errcode='22023';
  end if;
  if coalesce(v_headers->>'origin','') not in ('https://ojjuda.kr','https://www.ojjuda.kr','https://ojjuda.com','https://www.ojjuda.com','https://ojjuda-note.github.io') then
    raise exception 'invalid_visit_origin' using errcode='22023';
  end if;
  if v_headers->>'dnt' = '1' or v_headers->>'sec-gpc' = '1'
    or coalesce(v_headers->>'user-agent','') ~* '(bot|crawler|spider|slurp|bingpreview)' then
    return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
  end if;
  select salt::text into strict v_salt from ojjuda_growth.settings where singleton;
  v_browser := sha256(convert_to(p_visit_id::text || ':' || v_day::text || ':' || v_salt,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(encode(v_browser,'hex'), 110126));
  if exists(select 1 from ojjuda_growth.seen
    where visit_day=v_day and browser_hash=v_browser and game=p_game and source=p_source and event=p_event) then
    return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
  end if;
  -- A global storage ceiling limits UUID-rotation spam without retaining network identifiers.
  -- This does not authenticate visitors and must never determine rewards or game rankings.
  insert into ojjuda_growth.hour_limits as limits(hour_start,events) values(v_hour,1)
  on conflict(hour_start) do update set events=limits.events+1 where limits.events<10000
  returning events into v_events;
  if v_events is null then return jsonb_build_object('ok',false,'reason','rate_limited'); end if;
  insert into ojjuda_growth.seen(visit_day,browser_hash,game,source,event)
    values(v_day,v_browser,p_game,p_source,p_event) on conflict do nothing;
  if found then
    insert into ojjuda_growth.daily as totals(visit_day,game,source,visits,starts,completes,shares)
    values(v_day,p_game,p_source,(p_event='visit')::integer,(p_event='start')::integer,
      (p_event='complete')::integer,(p_event='share')::integer)
    on conflict(visit_day,game,source) do update set
      visits=totals.visits+excluded.visits, starts=totals.starts+excluded.starts,
      completes=totals.completes+excluded.completes, shares=totals.shares+excluded.shares;
  end if;
  return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
end;
$$;
revoke all on function ojjuda_growth.record_event(uuid,text,text,text) from public, anon, authenticated;
grant execute on function ojjuda_growth.record_event(uuid,text,text,text) to anon, authenticated;
create function public.record_game_growth(p_visit_id uuid, p_game text, p_source text, p_event text)
returns jsonb language sql security invoker set search_path = '' as $$
  select ojjuda_growth.record_event(p_visit_id,p_game,p_source,p_event);
$$;
revoke all on function public.record_game_growth(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.record_game_growth(uuid,text,text,text) to anon, authenticated;

create function ojjuda_growth.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_month date := date_trunc('month',v_today::timestamp)::date;
  v_start timestamptz;
  v_today_rows jsonb;
  v_month_rows jsonb;
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select started_at into strict v_start from ojjuda_growth.settings where singleton;
  select jsonb_agg(jsonb_build_object('game',g.game,'source',s.source,
    'visits',coalesce(d.visits,0),'starts',coalesce(d.starts,0),
    'completes',coalesce(d.completes,0),'shares',coalesce(d.shares,0)) order by g.game,s.source)
  into v_today_rows
  from (values ('stacker'),('mole')) g(game) cross join (values ('direct'),('challenge')) s(source)
  left join ojjuda_growth.daily d on d.visit_day=v_today and d.game=g.game and d.source=s.source;
  select jsonb_agg(jsonb_build_object('game',g.game,'source',s.source,
    'visits',coalesce(d.visits,0),'starts',coalesce(d.starts,0),
    'completes',coalesce(d.completes,0),'shares',coalesce(d.shares,0)) order by g.game,s.source)
  into v_month_rows
  from (values ('stacker'),('mole')) g(game) cross join (values ('direct'),('challenge')) s(source)
  left join (select game,source,sum(visits) visits,sum(starts) starts,
    sum(completes) completes,sum(shares) shares from ojjuda_growth.daily
    where visit_day between v_month and v_today group by game,source) d on d.game=g.game and d.source=s.source;
  return jsonb_build_object('started_at',v_start,'today_date',v_today,
    'today',v_today_rows,'month',v_month_rows);
end;
$$;
revoke all on function ojjuda_growth.admin_stats() from public, anon, authenticated;
grant execute on function ojjuda_growth.admin_stats() to authenticated;
create function public.admin_game_growth_stats()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select ojjuda_growth.admin_stats();
$$;
revoke all on function public.admin_game_growth_stats() from public, anon, authenticated;
grant execute on function public.admin_game_growth_stats() to authenticated;

create function ojjuda_growth.purge_expired()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from ojjuda_growth.seen where visit_day < (now() at time zone 'Asia/Seoul')::date-1;
  delete from ojjuda_growth.hour_limits where hour_start < now()-interval '2 days';
end;
$$;
revoke all on function ojjuda_growth.purge_expired() from public, anon, authenticated;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('ojjuda-game-growth-retention','17 * * * *','select ojjuda_growth.purge_expired();');
  end if;
end $$;
notify pgrst,'reload schema';
