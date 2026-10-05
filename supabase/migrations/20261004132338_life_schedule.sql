-- Private schedules: dates and optional times use the Korean calendar clock.
create table public.life_schedule_events (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 date date not null check (date between date '1900-01-01' and date '2200-12-31'),
 time text check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 title text not null check (char_length(btrim(title)) between 1 and 100),
 memo text not null default '' check (char_length(memo)<=2000),
 repeat text not null default 'none' check (repeat in ('none','weekly','monthly')),
 repeat_until date check (repeat_until is null or (repeat_until>=date and repeat_until<=date '2200-12-31')),
 revision uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(user_id,id),
 check (repeat<>'none' or repeat_until is null)
);
create index life_schedule_month_idx on public.life_schedule_events(user_id,date,id) where deleted_at is null;
alter table public.life_schedule_events enable row level security;
revoke all on public.life_schedule_events from public,anon,authenticated;
grant select on public.life_schedule_events to authenticated;
grant insert(user_id,id,date,time,title,memo,repeat,repeat_until) on public.life_schedule_events to authenticated;
grant update(date,time,title,memo,repeat,repeat_until,deleted_at) on public.life_schedule_events to authenticated;
create policy life_schedule_read on public.life_schedule_events for select to authenticated using ((select auth.uid())=user_id);
create policy life_schedule_insert on public.life_schedule_events for insert to authenticated with check ((select auth.uid())=user_id);
create policy life_schedule_update on public.life_schedule_events for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create function public.life_schedule_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revision:=gen_random_uuid();return new;end;
$$;
revoke all on function public.life_schedule_revision() from public,anon,authenticated;
create trigger life_schedule_revision before update on public.life_schedule_events for each row execute function public.life_schedule_revision();
-- Return original events and recurring series potentially present in a month.
-- The browser expands only that month's dates. RLS remains enforced.
create function public.life_schedule_month(p_month date) returns setof public.life_schedule_events
language sql stable security invoker set search_path='' as $$
 select e.* from public.life_schedule_events e
 where e.user_id=(select auth.uid()) and e.deleted_at is null
 and p_month between date '1900-01-01' and date '2200-12-31'
 and e.date<(date_trunc('month',p_month::timestamp)+interval '1 month')::date
 and ((e.repeat='none' and e.date>=date_trunc('month',p_month::timestamp)::date)
   or (e.repeat<>'none' and (e.repeat_until is null or e.repeat_until>=date_trunc('month',p_month::timestamp)::date)))
 order by e.date,e.id;
$$;
revoke all on function public.life_schedule_month(date) from public,anon;
grant execute on function public.life_schedule_month(date) to authenticated;
comment on table public.life_schedule_events is 'Private per-account schedules. Recurrence edits/deletes apply to the whole series. Monthly dates absent in a month are skipped. Deleted tombstones prevent retried creates resurrecting entries.';
