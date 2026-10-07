-- Photo stages have no daily registration quota.
-- Keep the existing trigger name for compatibility; it only validates ownership
-- and sets the server timestamp. Visibility and moderation still use RLS.
create or replace function public.photo_upload_limit() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if auth.uid() is null or new.owner is distinct from auth.uid() then
    raise exception 'login required';
  end if;
  new.created_at := now();
  return new;
end $$;
