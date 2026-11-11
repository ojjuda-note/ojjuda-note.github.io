-- Daily aggregate drilldown: Agit cards/actions and individual Arcade games.
-- No account ID, IP, raw URL, or visitor identifier is stored in these totals.
create table ojjuda_insights.detail_totals (
  visit_day date not null,
  detail text not null check (
    detail ~ '^(agit_(stamp|mission|recommended_game|group|festival|restaurants|fanpages)|arcade_game_[a-z_]{2,30})$'),
  uses bigint not null default 0 check (uses >= 0),
  primary key (visit_day,detail)
);
alter table ojjuda_insights.detail_totals enable row level security;
revoke all on ojjuda_insights.detail_totals from public,anon,authenticated;

-- A separate RPC keeps the original public event contract backward compatible.
create function ojjuda_insights.record_detail(p_visit_id uuid,p_detail text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_day date := (v_now at time zone 'Asia/Seoul')::date;
  v_hour_utc timestamptz := date_trunc('hour',v_now);
  v_headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_salt text;
  v_browser bytea;
  v_total integer;
  v_key text;
begin
  if p_visit_id is null or p_visit_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid_visit_id' using errcode='22023';
  end if;
  if p_detail is null or p_detail not in (
    'agit_stamp','agit_mission','agit_recommended_game','agit_group',
    'agit_festival','agit_restaurants','agit_fanpages',
    'arcade_game_chacha_rush','arcade_game_solitaire','arcade_game_archery',
    'arcade_game_sacheonseong','arcade_game_mines','arcade_game_saetbyeol',
    'arcade_game_mole','arcade_game_runner','arcade_game_stacker',
    'arcade_game_breakout','arcade_game_spot','arcade_game_screw',
    'arcade_game_bang','arcade_game_tank','arcade_game_tour',
    'arcade_game_ttang','arcade_game_janggi','arcade_game_chess',
    'arcade_game_billiards','arcade_game_matgo','arcade_game_poker',
    'arcade_game_roulette','arcade_game_photo_ttang','arcade_game_other'
  ) then
    raise exception 'invalid_detail_feature' using errcode='22023';
  end if;
  if coalesce(v_headers->>'origin','') not in
    ('https://ojjuda.kr','https://www.ojjuda.kr','https://ojjuda.com',
     'https://www.ojjuda.com','https://ojjuda-note.github.io') then
    raise exception 'invalid_visit_origin' using errcode='22023';
  end if;
  if v_headers->>'dnt'='1' or v_headers->>'sec-gpc'='1'
    or coalesce(v_headers->>'user-agent','') ~* '(bot|crawler|spider|slurp|bingpreview)' then
    return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
  end if;
  v_key := 'detail:' || p_detail;
  select salt::text into strict v_salt from ojjuda_insights.settings where singleton;
  v_browser := sha256(convert_to(p_visit_id::text||':'||v_day::text||':'||v_salt,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(encode(v_browser,'hex'),111126));
  if exists(select 1 from ojjuda_insights.seen
    where visit_day=v_day and browser_hash=v_browser and event_key=v_key) then
    return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
  end if;
  insert into ojjuda_insights.hour_limits as limits(hour_start,events)
    values(v_hour_utc,1) on conflict(hour_start) do update
    set events=limits.events+1 where limits.events<20000
    returning events into v_total;
  if v_total is null then return jsonb_build_object('ok',false,'reason','rate_limited'); end if;
  insert into ojjuda_insights.seen(visit_day,browser_hash,event_key)
    values(v_day,v_browser,v_key) on conflict do nothing;
  if found then
    insert into ojjuda_insights.detail_totals as totals(visit_day,detail,uses)
      values(v_day,p_detail,1)
      on conflict(visit_day,detail) do update set uses=totals.uses+1;
  end if;
  return jsonb_build_object('ok',true,'day',v_day,'server_now',v_now);
end;
$$;
revoke all on function ojjuda_insights.record_detail(uuid,text) from public,anon,authenticated;
grant execute on function ojjuda_insights.record_detail(uuid,text) to anon,authenticated;
create function public.record_site_detail(p_visit_id uuid,p_detail text)
returns jsonb language sql security invoker set search_path = '' as $$
  select ojjuda_insights.record_detail(p_visit_id,p_detail);
$$;
revoke all on function public.record_site_detail(uuid,text) from public,anon,authenticated;
grant execute on function public.record_site_detail(uuid,text) to anon,authenticated;

create function ojjuda_insights.admin_details()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'agit_details',coalesce((
      select jsonb_agg(jsonb_build_object('detail',detail,'uses',uses) order by uses desc,detail)
      from (select detail,sum(uses) uses from ojjuda_insights.detail_totals
        where visit_day between v_today-29 and v_today and left(detail,5)='agit_'
        group by detail order by uses desc,detail limit 7) ranked
    ),'[]'::jsonb),
    'arcade_details',coalesce((
      select jsonb_agg(jsonb_build_object('detail',detail,'uses',uses) order by uses desc,detail)
      from (select detail,sum(uses) uses from ojjuda_insights.detail_totals
        where visit_day between v_today-29 and v_today and left(detail,12)='arcade_game_'
        group by detail order by uses desc,detail limit 24) ranked
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function ojjuda_insights.admin_details() from public,anon,authenticated;
grant execute on function ojjuda_insights.admin_details() to authenticated;

create or replace function public.admin_site_usage_stats()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select ojjuda_insights.admin_stats() || ojjuda_insights.guest_rankings()
    || ojjuda_insights.admin_details();
$$;
revoke all on function public.admin_site_usage_stats() from public,anon,authenticated;
grant execute on function public.admin_site_usage_stats() to authenticated;

create or replace function ojjuda_insights.purge_expired()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from ojjuda_insights.seen where visit_day < (now() at time zone 'Asia/Seoul')::date-1;
  delete from ojjuda_insights.hour_limits where hour_start < now()-interval '2 days';
  delete from ojjuda_insights.visit_totals where visit_day < (now() at time zone 'Asia/Seoul')::date-400;
  delete from ojjuda_insights.feature_totals where visit_day < (now() at time zone 'Asia/Seoul')::date-400;
  delete from ojjuda_insights.detail_totals where visit_day < (now() at time zone 'Asia/Seoul')::date-400;
end;
$$;
notify pgrst,'reload schema';
