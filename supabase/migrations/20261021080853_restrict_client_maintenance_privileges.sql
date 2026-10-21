-- Browser roles need row operations, not table maintenance or schema changes.
-- TRUNCATE does not obey RLS. Keep every existing CRUD/column grant and RPC.
revoke truncate, references, trigger, maintain
  on all tables in schema public, ojjuda_note
  from public, anon, authenticated;

-- Migrations owned by postgres must not recreate these client grants.
-- Managed supabase_admin defaults are outside this migration's ownership.
alter default privileges for role postgres in schema public, ojjuda_note
  revoke truncate, references, trigger, maintain on tables
  from public, anon, authenticated;

notify pgrst, 'reload schema';
