-- Campaign cohorts only. Raw URLs/referrers, contact information, IP addresses
-- and account IDs are never copied to analytics tables or report responses.
set local lock_timeout = '4s';
alter table ojjuda_insights.settings add column campaign_started_at timestamptz not null default now();

create function ojjuda_insights.campaign_slug(p_value text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select p_value is not null and p_value ~ '^[a-z][a-z0-9_-]{0,63}$';
$$;
revoke all on function ojjuda_insights.campaign_slug(text) from public, anon, authenticated;

create table ojjuda_insights.campaign_totals (
  visit_day date not null,
  source text not null check (source in ('threads','naver','instagram','facebook','youtube','tiktok','kakao','x','google','other')),
  medium text not null check (medium in ('social','blog','video','search','referral','organic','paid','other')),
  campaign text not null check (ojjuda_insights.campaign_slug(campaign)),
  content text not null check (ojjuda_insights.campaign_slug(content)),
  visits bigint not null default 0 check (visits >= 0),
  signup_starts bigint not null default 0 check (signup_starts >= 0 and signup_starts <= visits),
  confirmed_signups bigint not null default 0 check (confirmed_signups >= 0),
  primary key (visit_day,source,medium,campaign,content)
);
-- Short-lived, server-salted deduplication. No account identifier is in this table.
create table ojjuda_insights.campaign_touches (
  token_hash bytea primary key check (octet_length(token_hash)=32),
  visit_day date not null,
  source text not null,
  medium text not null,
  campaign text not null,
  content text not null,
  started boolean not null default false,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  foreign key (visit_day,source,medium,campaign,content)
    references ojjuda_insights.campaign_totals(visit_day,source,medium,campaign,content)
);
create index campaign_touches_expiry on ojjuda_insights.campaign_touches(expires_at);
-- Exists for at most seven days to count a real email confirmation once.
-- The salted account hash is never exposed and is not a browsing-history key.
create table ojjuda_insights.campaign_signup_checks (
  account_hash bytea primary key check (octet_length(account_hash)=32),
  visit_day date not null,
  source text not null,
  medium text not null,
  campaign text not null,
  content text not null,
  confirmed boolean not null default false,
  expires_at timestamptz not null,
  foreign key (visit_day,source,medium,campaign,content)
    references ojjuda_insights.campaign_totals(visit_day,source,medium,campaign,content)
);
create index campaign_signup_checks_expiry on ojjuda_insights.campaign_signup_checks(expires_at);
create table ojjuda_insights.campaign_limits (
  hour_start timestamptz primary key,
  events integer not null check(events between 1 and 5000)
);
alter table ojjuda_insights.campaign_totals enable row level security;
alter table ojjuda_insights.campaign_touches enable row level security;
alter table ojjuda_insights.campaign_signup_checks enable row level security;
alter table ojjuda_insights.campaign_limits enable row level security;
revoke all on ojjuda_insights.campaign_totals,ojjuda_insights.campaign_touches,
  ojjuda_insights.campaign_signup_checks,ojjuda_insights.campaign_limits from public,anon,authenticated;

create function ojjuda_insights.record_campaign_event(
  p_visit_id uuid,p_event text,p_source text,p_medium text,p_campaign text,p_content text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_day date := (v_now at time zone 'Asia/Seoul')::date;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_salt text;
  v_hash bytea;
  v_touch ojjuda_insights.campaign_touches%rowtype;
  v_limit integer;
begin
  if auth.uid() is not null or v_headers->>'dnt'='1' or v_headers->>'sec-gpc'='1'
      or coalesce(v_headers->>'user-agent','') ~* '(bot|crawler|spider|slurp|bingpreview)' then
    return jsonb_build_object('ok',true,'accepted',false);
  end if;
  if coalesce(v_headers->>'origin','') not in ('https://ojjuda.kr','https://www.ojjuda.kr',
      'https://ojjuda.com','https://www.ojjuda.com','https://ojjuda-note.github.io') then
    raise exception 'invalid_campaign_origin' using errcode='22023';
  end if;
  if p_visit_id is null or p_visit_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or p_event is null or p_event not in ('visit','signup_start') then
    raise exception 'invalid_campaign_event' using errcode='22023';
  end if;
  if p_source is null or p_source not in ('threads','naver','instagram','facebook','youtube','tiktok','kakao','x','google','other')
      or p_medium is null or p_medium not in ('social','blog','video','search','referral','organic','paid','other')
      or not ojjuda_insights.campaign_slug(p_campaign) or not ojjuda_insights.campaign_slug(p_content) then
    raise exception 'invalid_campaign_labels' using errcode='22023';
  end if;
  select salt::text into strict v_salt from ojjuda_insights.settings where singleton;
  v_hash := sha256(convert_to('campaign:'||p_visit_id::text||':'||v_salt,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(encode(v_hash,'hex'),211126));
  select * into v_touch from ojjuda_insights.campaign_touches where token_hash=v_hash;
  if found then
    if v_touch.expires_at <= v_now or (v_touch.source,v_touch.medium,v_touch.campaign,v_touch.content)
      is distinct from (p_source,p_medium,p_campaign,p_content) then
      return jsonb_build_object('ok',true,'accepted',false);
    end if;
    if p_event='visit' or v_touch.started then return jsonb_build_object('ok',true,'accepted',true); end if;
  elsif p_event <> 'visit' then
    return jsonb_build_object('ok',true,'accepted',false);
  end if;
  insert into ojjuda_insights.campaign_limits as limits(hour_start,events)
    values(date_trunc('hour',v_now),1) on conflict(hour_start) do update
    set events=limits.events+1 where limits.events<5000 returning events into v_limit;
  if v_limit is null then return jsonb_build_object('ok',false,'accepted',false); end if;
  if p_event='visit' then
    insert into ojjuda_insights.campaign_totals as totals(visit_day,source,medium,campaign,content,visits)
      values(v_day,p_source,p_medium,p_campaign,p_content,1)
      on conflict(visit_day,source,medium,campaign,content) do update set visits=totals.visits+1;
    insert into ojjuda_insights.campaign_touches(token_hash,visit_day,source,medium,campaign,content,created_at,expires_at)
      values(v_hash,v_day,p_source,p_medium,p_campaign,p_content,v_now,v_now+interval '24 hours');
  else
    update ojjuda_insights.campaign_touches set started=true where token_hash=v_hash;
    update ojjuda_insights.campaign_totals set signup_starts=signup_starts+1
      where (visit_day,source,medium,campaign,content)=(v_touch.visit_day,v_touch.source,v_touch.medium,v_touch.campaign,v_touch.content);
  end if;
  return jsonb_build_object('ok',true,'accepted',true);
end;
$$;
revoke all on function ojjuda_insights.record_campaign_event(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function ojjuda_insights.record_campaign_event(uuid,text,text,text,text,text) to anon,authenticated;
create function public.record_campaign_event(
  p_visit_id uuid,p_event text,p_source text,p_medium text,p_campaign text,p_content text
)
returns jsonb language sql security invoker set search_path = '' as $$
  select ojjuda_insights.record_campaign_event(p_visit_id,p_event,p_source,p_medium,p_campaign,p_content);
$$;
revoke all on function public.record_campaign_event(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_campaign_event(uuid,text,text,text,text,text) to anon,authenticated;

-- No client "signup success" event. Only a newly inserted Auth row can acquire
-- a cohort, and only a real email-confirmed, non-anonymous account can complete it.
create function ojjuda_insights.capture_campaign_signup()
returns trigger language plpgsql security definer set search_path = '' set lock_timeout = '100ms' as $$
declare
  v_token text := new.raw_user_meta_data->>'campaign_visit_token';
  v_now timestamptz := statement_timestamp();
  v_salt text;
  v_hash bytea;
  v_account bytea;
  v_touch ojjuda_insights.campaign_touches%rowtype;
  v_check ojjuda_insights.campaign_signup_checks%rowtype;
begin
  -- Auth may write its original metadata again. Never retain the temporary token
  -- in user-editable account metadata or allow metadata edits to attach a cohort.
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data,'{}'::jsonb)-'campaign_visit_token';
  begin
    if coalesce(new.is_anonymous,false) or new.deleted_at is not null then return new; end if;
    select salt::text into strict v_salt from ojjuda_insights.settings where singleton;
    v_account := sha256(convert_to('campaign-account:'||new.id::text||':'||v_salt,'UTF8'));
    if tg_op='INSERT' and v_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and new.created_at between v_now-interval '5 minutes' and v_now+interval '5 seconds' then
      v_hash := sha256(convert_to('campaign:'||v_token||':'||v_salt,'UTF8'));
      select * into v_touch from ojjuda_insights.campaign_touches
        where token_hash=v_hash and started and expires_at>v_now;
      if found then
        insert into ojjuda_insights.campaign_signup_checks(account_hash,visit_day,source,medium,campaign,content,expires_at)
          values(v_account,v_touch.visit_day,v_touch.source,v_touch.medium,v_touch.campaign,v_touch.content,v_now+interval '7 days')
          on conflict(account_hash) do nothing;
      end if;
    end if;
    if new.email_confirmed_at is null or new.banned_until>v_now then return new; end if;
    -- Row update is the duplicate barrier, including concurrent confirmation calls.
    update ojjuda_insights.campaign_signup_checks set confirmed=true
      where account_hash=v_account and not confirmed and expires_at>v_now returning * into v_check;
    if found then
      update ojjuda_insights.campaign_totals set confirmed_signups=confirmed_signups+1
        where (visit_day,source,medium,campaign,content)=(v_check.visit_day,v_check.source,v_check.medium,v_check.campaign,v_check.content);
    end if;
  exception when query_canceled or others then
    -- Measurement failure must not fail account creation or email confirmation.
    -- Includes statement cancellation/lock contention in this measurement block.
    -- The protected block rolls back its own partial writes; no private value is logged.
    raise log 'campaign_signup_measurement_failed';
  end;
  return new;
end;
$$;
revoke all on function ojjuda_insights.capture_campaign_signup() from public,anon,authenticated;
create trigger capture_campaign_signup before insert or update of email_confirmed_at,raw_user_meta_data on auth.users
  for each row execute function ojjuda_insights.capture_campaign_signup();

create function ojjuda_insights.strip_campaign_identity_token()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.identity_data := new.identity_data-'campaign_visit_token';
  return new;
end;
$$;
revoke all on function ojjuda_insights.strip_campaign_identity_token() from public,anon,authenticated;
create trigger strip_campaign_identity_token before insert or update of identity_data on auth.identities
  for each row when (new.identity_data ? 'campaign_visit_token')
  execute function ojjuda_insights.strip_campaign_identity_token();

create function ojjuda_insights.campaign_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_start timestamptz;
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select campaign_started_at into strict v_start from ojjuda_insights.settings where singleton;
  return jsonb_build_object('started_at',v_start,'date_from',v_today-29,'date_to',v_today,
    'timezone','Asia/Seoul','model','session24h-confirm7d',
    'totals',(select jsonb_build_object('visits',coalesce(sum(visits),0),'signup_starts',coalesce(sum(signup_starts),0),
      'confirmed_signups',coalesce(sum(confirmed_signups),0)) from ojjuda_insights.campaign_totals where visit_day between v_today-29 and v_today),
    'rows',coalesce((select jsonb_agg(to_jsonb(r) order by confirmed_signups desc,visits desc,source,medium,campaign,content)
      from (select source,medium,campaign,content,sum(visits) as visits,sum(signup_starts) as signup_starts,
        sum(confirmed_signups) as confirmed_signups from ojjuda_insights.campaign_totals
        where visit_day between v_today-29 and v_today group by source,medium,campaign,content
        order by confirmed_signups desc,visits desc,source,medium,campaign,content limit 100) r),'[]'::jsonb),
    'truncated',(select count(*)>100 from (select 1 from ojjuda_insights.campaign_totals
      where visit_day between v_today-29 and v_today group by source,medium,campaign,content) r));
end;
$$;
revoke all on function ojjuda_insights.campaign_stats() from public,anon,authenticated;
grant execute on function ojjuda_insights.campaign_stats() to authenticated;
create function public.admin_campaign_signup_stats()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select ojjuda_insights.campaign_stats();
$$;
revoke all on function public.admin_campaign_signup_stats() from public,anon,authenticated;
grant execute on function public.admin_campaign_signup_stats() to authenticated;

create function ojjuda_insights.purge_campaigns()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from ojjuda_insights.campaign_touches where expires_at<=now();
  delete from ojjuda_insights.campaign_signup_checks where expires_at<=now();
  delete from ojjuda_insights.campaign_limits where hour_start<now()-interval '2 days';
  delete from ojjuda_insights.campaign_totals where visit_day<(now() at time zone 'Asia/Seoul')::date-400;
end;
$$;
revoke all on function ojjuda_insights.purge_campaigns() from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('ojjuda-campaign-insights-retention','*/10 * * * *','select ojjuda_insights.purge_campaigns();');
  end if;
end $$;
notify pgrst,'reload schema';
