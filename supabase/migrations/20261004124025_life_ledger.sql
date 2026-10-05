-- Private ledger on the existing project; no extra server or paid service.
create table public.life_ledger_entries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  date date not null check (date >= date '1900-01-01' and date < date '9999-01-01'),
  type text not null check (type in ('income','expense')),
  category text not null default '기타' check (category in ('식비','교통','쇼핑','주거·통신','건강','문화·여가','교육','월급','용돈','기타')),
  memo text not null check (char_length(btrim(memo)) between 1 and 80),
  amount bigint not null check (amount between 1 and 999999999999),
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id,id)
);
create index life_ledger_month_idx on public.life_ledger_entries(user_id,date desc,id desc) where deleted_at is null;
alter table public.life_ledger_entries enable row level security;
revoke all on public.life_ledger_entries from public,anon,authenticated;
grant select,insert on public.life_ledger_entries to authenticated;
grant update(date,type,category,memo,amount,deleted_at) on public.life_ledger_entries to authenticated;
create policy life_ledger_read on public.life_ledger_entries for select to authenticated using ((select auth.uid())=user_id);
create policy life_ledger_insert on public.life_ledger_entries for insert to authenticated with check ((select auth.uid())=user_id);
create policy life_ledger_update on public.life_ledger_entries for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

-- New revisions provide compare-and-swap editing across devices.
create function public.life_ledger_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.revision := gen_random_uuid();
  return new;
end;
$$;
revoke all on function public.life_ledger_revision() from public,anon,authenticated;
create trigger life_ledger_revision before update on public.life_ledger_entries for each row execute function public.life_ledger_revision();

-- Totals cover the entire month, including entries outside the displayed page.
-- Send totals as strings so large sums remain exact in JavaScript.
create function public.life_ledger_month(p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
  with records as (
    select type,category,amount from public.life_ledger_entries
    where user_id=(select auth.uid()) and deleted_at is null
      and date >= date_trunc('month',p_month::timestamp)::date
      and date < (date_trunc('month',p_month::timestamp)+interval '1 month')::date
  ), totals as (
    select coalesce(sum(amount) filter (where type='income'),0) as income,
           coalesce(sum(amount) filter (where type='expense'),0) as expense from records
  ), categories as (
    select category,sum(amount) as amount from records where type='expense' group by category
  )
  select jsonb_build_object('income',income::text,'expense',expense::text,'balance',(income-expense)::text,
    'categories',coalesce((select jsonb_agg(jsonb_build_object('category',category,'amount',amount::text) order by amount desc,category) from categories),'[]'::jsonb))
  from totals;
$$;
revoke all on function public.life_ledger_month(date) from public,anon;
grant execute on function public.life_ledger_month(date) to authenticated;
comment on table public.life_ledger_entries is 'Private account ledger. Retain deleted ID tombstones to make legacy imports idempotent. Cascades on account deletion.';
