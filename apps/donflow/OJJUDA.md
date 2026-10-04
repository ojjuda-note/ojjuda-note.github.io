# DonFlow in Ojjuda

Actual upstream application imported from https://github.com/maxmini0214/donflow,
commit `05a7462241be58f3dd36c92168a9ce1d5d61d7d4` (MIT).
The source is kept here; `ledger/` contains the production build. Upstream's dashboard,
budget editor, categorization, imports and charts are retained.

Build from the repository root:

    npm --prefix apps/donflow ci --ignore-scripts
    npm --prefix apps/donflow run build

Integration changes:
- Everyday home: actual monthly income/expense/balance, amount + description quick entry,
  optional date/category fields, searchable date-grouped records, inline edit/delete.
  Saving an older entry opens its month. Imported charts are under Statistics; budget,
  CSV/notification imports and backup restore are secondary tools under Settings.
- Existing World session through a same-origin iframe host; no new account or server.
- IndexedDB names and unsent drafts isolated by authenticated user ID; Web Locks prevent
  simultaneous editing in multiple tabs on one browser. The iframe closes on owner change.
- Local changes persist immediately, then debounce to a private Supabase snapshot.
  RLS and a compare-and-swap RPC prevent cross-user access and stale overwrites.
  An uncertain write response can be retried. Conflicts retain local data and offer an
  export plus explicit restoration of the account copy. No polling or paid resource.
- Snapshots are limited to 5 MiB by the database. If account save fails, local data and
  full JSON export remain available. Existing Supabase storage/traffic quotas apply.
- Explicit legacy import copies existing cloud and local ledger entries, preserves
  original data, and stores deduplication markers so deleted imports stay deleted.
- Korean/light defaults; quick input/full edit/delete; atomic backup restore includes
  app settings, monthly salary and import markers. CSV export escapes formula cells.
- Removed demo seeding, paid PDF promotions and original local-only privacy claims.
- Removed original service worker and third-party font calls; dependency fixes and
  pinned SheetJS 0.20.3 from its official distribution. Lockfile is committed.

Tests: tests/donflow-db.test.cjs and tests/donflow-ui.test.cjs; host/navigation coverage
in tests/world-life-ui.test.cjs. No real user financial records are needed for tests.
