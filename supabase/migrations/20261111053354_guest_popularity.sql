-- Additional anonymous-only, aggregate game and board popularity.
-- Existing historical challenge/share records and total-traffic data are untouched.
create table ojjuda_insights.guest_feature_totals (
  visit_day date not null,
  feature text not null check (length(feature) between 2 and 40),
  uses bigint not null default 0 check (uses >= 0),
  primary key (visit_day,feature),
  foreign key (visit_day,feature)
    references ojjuda_insights.feature_totals(visit_day,feature) on delete cascade
);
alter table ojjuda_insights.guest_feature_totals enable row level security;
revoke all on ojjuda_insights.guest_feature_totals from public,anon,authenticated;

-- The existing event recorder already deduplicates per browser/day/feature.
-- Count the resulting feature increment only for requests without a member JWT.
create function ojjuda_insights.count_guest_feature()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and
    (left(new.feature,5)='game_' or new.feature in ('park','group','fanpages','restaurants')) then
    insert into ojjuda_insights.guest_feature_totals as totals(visit_day,feature,uses)
      values (new.visit_day,new.feature,1)
      on conflict(visit_day,feature) do update set uses=totals.uses+1;
  end if;
  return new;
end;
$$;
revoke all on function ojjuda_insights.count_guest_feature() from public,anon,authenticated;
create trigger count_guest_feature_on_increment
  after insert or update of uses on ojjuda_insights.feature_totals
  for each row execute function ojjuda_insights.count_guest_feature();

create function ojjuda_insights.guest_rankings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'guest_games',coalesce((
      select jsonb_agg(jsonb_build_object('feature',feature,'uses',uses) order by uses desc,feature)
      from (select feature,sum(uses) uses from ojjuda_insights.guest_feature_totals
        where visit_day between v_today-29 and v_today and left(feature,5)='game_'
        group by feature order by uses desc,feature limit 12) ranked
    ),'[]'::jsonb),
    'guest_boards',coalesce((
      select jsonb_agg(jsonb_build_object('feature',feature,'uses',uses) order by uses desc,feature)
      from (select feature,sum(uses) uses from ojjuda_insights.guest_feature_totals
        where visit_day between v_today-29 and v_today
          and feature in ('park','group','fanpages','restaurants')
        group by feature order by uses desc,feature limit 4) ranked
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function ojjuda_insights.guest_rankings() from public,anon,authenticated;
grant execute on function ojjuda_insights.guest_rankings() to authenticated;

-- Reuse the existing one-request admin report, avoiding extra network latency.
create or replace function public.admin_site_usage_stats()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select ojjuda_insights.admin_stats() || ojjuda_insights.guest_rankings();
$$;
revoke all on function public.admin_site_usage_stats() from public,anon,authenticated;
grant execute on function public.admin_site_usage_stats() to authenticated;
notify pgrst,'reload schema';
