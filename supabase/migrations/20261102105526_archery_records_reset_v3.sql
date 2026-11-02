-- One-time owner-requested reset of visible archery records for every player.
-- Preserve equipment on device and all server-owned ammo, coach rentals, wallets,
-- immutable receipts, and milestone entitlements. Completed runs remain audit data.
begin;
set local lock_timeout = '5s';

do $reset$
declare
  v_reset_at timestamptz;
begin
  lock table ojjuda_archery_internal.accounts,
    ojjuda_archery_internal.runs,
    ojjuda_archery_internal.milestone_awards in exclusive mode;
  v_reset_at := clock_timestamp();

  insert into ojjuda_archery_internal.release_backups
    (release_key, created_at, accounts, runs, milestone_awards)
  values (
    'archery-records-v3-20261102', v_reset_at,
    coalesce((select jsonb_agg(to_jsonb(a)) from ojjuda_archery_internal.accounts a), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(r)) from ojjuda_archery_internal.runs r), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(m)) from ojjuda_archery_internal.milestone_awards m), '[]'::jsonb)
  ) on conflict (release_key) do nothing;
  if not found then return; end if;

  -- A pre-reset shot must not restore a round or issue a reward after the reset.
  update ojjuda_archery_internal.runs set abandoned_at = v_reset_at
    where completed_at is null and abandoned_at is null;
  update ojjuda_archery_internal.accounts set
    main_rounds = 0, revision = revision + 1;

  if exists (
    select 1 from ojjuda_archery_internal.accounts a
    join ojjuda_archery_internal.release_backups b
      on b.release_key = 'archery-records-v3-20261102'
    cross join lateral jsonb_array_elements(b.accounts) saved
    where saved->>'user_id' = a.user_id::text
      and ((to_jsonb(a)-'main_rounds'-'revision') is distinct from
           (saved-'main_rounds'-'revision')
           or a.main_rounds <> 0
           or a.revision <> (saved->>'revision')::bigint + 1)
  ) then raise exception 'archery_records_reset_preservation_failed'; end if;
end;
$reset$;

commit;
