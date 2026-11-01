-- The owner requested a first-time start for the reordered archery test game.
-- Keep a private rollback snapshot and payment/idempotency receipts. Wallets
-- and every other game's data are outside this reset.
begin;

create table if not exists ojjuda_archery_internal.release_backups (
  release_key text primary key,
  created_at timestamptz not null default clock_timestamp(),
  accounts jsonb not null,
  runs jsonb not null,
  milestone_awards jsonb not null
);
alter table ojjuda_archery_internal.release_backups enable row level security;
revoke all on ojjuda_archery_internal.release_backups from public, anon, authenticated;

do $$
begin
  lock table ojjuda_archery_internal.accounts,
    ojjuda_archery_internal.runs,
    ojjuda_archery_internal.milestone_awards in exclusive mode;

  insert into ojjuda_archery_internal.release_backups(release_key,accounts,runs,milestone_awards)
  values (
    'archery-progression-v2',
    coalesce((select jsonb_agg(to_jsonb(a)) from ojjuda_archery_internal.accounts a),'[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(r)) from ojjuda_archery_internal.runs r),'[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(m)) from ojjuda_archery_internal.milestone_awards m),'[]'::jsonb)
  ) on conflict (release_key) do nothing;
  if not found then return; end if;

  delete from ojjuda_archery_internal.milestone_awards;
  delete from ojjuda_archery_internal.runs;
  update ojjuda_archery_internal.accounts set
    free_remaining=0, paid_remaining=0, main_rounds=0, milestones_granted=0,
    first_milestone_day=null, daily_checked_day=null, revision=revision+1;
end;
$$;

commit;
