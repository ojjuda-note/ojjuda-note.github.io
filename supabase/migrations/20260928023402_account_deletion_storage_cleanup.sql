-- Two-stage account deletion. Keep the account and its database rows until all
-- owned Storage files have been removed through the Storage API.
create table public.account_deletion_jobs (
  user_id uuid primary key,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.account_deletion_jobs enable row level security;
revoke all on public.account_deletion_jobs from public, anon, authenticated;

-- Shared transaction lock for an upload and account-deletion start/finalization.
-- A restrictive INSERT policy below calls this while Storage inserts its row.
create function public.account_deletion_upload_allowed()
returns boolean
language plpgsql
volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(127247341, pg_catalog.hashtext(v_uid::text));
  return not exists (
    select 1 from public.account_deletion_jobs where user_id = v_uid
  );
end;
$$;

create function public.account_deletion_pending()
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1 from public.account_deletion_jobs
       where user_id = (select auth.uid()) and completed_at is null
     );
$$;

create function public.prepare_my_account_deletion()
returns void
language plpgsql
volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(127247341, pg_catalog.hashtext(v_uid::text));
  if not exists (select 1 from auth.users where id = v_uid) then
    raise exception 'account_not_found' using errcode = '42501';
  end if;
  if exists (
    select 1 from ojjuda_note_internal.auto_card_config where author_id = v_uid
  ) then
    raise exception 'managed_account_requires_admin' using errcode = '42501';
  end if;
  insert into public.account_deletion_jobs(user_id) values (v_uid)
  on conflict (user_id) do nothing;
end;
$$;

-- Read-only inventory of this person's files. Deliberately do not grant
-- storage.list: it can expose linked Note photos or other users' objects.
create function public.my_account_deletion_files(p_limit integer default 100)
returns table(bucket_id text, photo_path text)
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.account_deletion_pending() then
    raise exception 'account_deletion_not_prepared' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;
  return query
    select o.bucket_id::text, o.name::text
    from storage.objects o
    where (o.owner_id = v_uid::text
      or (o.owner_id is null and o.owner = v_uid))
      and o.bucket_id in ('media', 'note-card-photos', 'note-event-photos')
      and (storage.foldername(o.name))[1] = v_uid::text
    order by o.bucket_id, o.name
    limit p_limit;
end;
$$;

-- These policies grant deletion of linked Note photos ONLY while their owner
-- has requested deletion. The SELECT policy is limited to Storage delete
-- operations; it does not make storage.list or photo signing available.
create policy account_deletion_owned_files_select
on storage.objects for select to authenticated
using (
  bucket_id in ('media', 'note-card-photos', 'note-event-photos')
  and (owner_id = (select auth.uid()::text)
    or (owner_id is null and owner = (select auth.uid())))
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.allow_any_operation(array['object.delete', 'object.delete_many'])
  and (select public.account_deletion_pending())
);

create policy account_deletion_owned_files_delete
on storage.objects for delete to authenticated
using (
  bucket_id in ('media', 'note-card-photos', 'note-event-photos')
  and (owner_id = (select auth.uid()::text)
    or (owner_id is null and owner = (select auth.uid())))
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (select public.account_deletion_pending())
);

-- A new upload cannot overtake the final empty-inventory check. The helper
-- takes the same transaction-level advisory lock as prepare/finalize.
create policy account_deletion_no_new_storage
on storage.objects as restrictive for insert to authenticated
with check ((select public.account_deletion_upload_allowed()));

-- Preserve the existing anonymization and immediate path for members with no
-- files. For everyone else, the client prepares and drains Storage first.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(127247341, pg_catalog.hashtext(v_uid::text));
  if exists (
    select 1 from ojjuda_note_internal.auto_card_config where author_id = v_uid
  ) then
    raise exception 'managed_account_requires_admin' using errcode = '42501';
  end if;
  insert into public.account_deletion_jobs(user_id) values (v_uid)
  on conflict (user_id) do nothing;

  -- Legacy objects can have only owner (uuid). A different bucket, path or
  -- conflicting owner needs manual review: never delete an unrelated file.
  if exists (
    select 1 from storage.objects o
    where (
      o.owner_id = v_uid::text or o.owner = v_uid
      or (o.bucket_id in ('media', 'note-card-photos', 'note-event-photos')
        and (storage.foldername(o.name))[1] = v_uid::text)
    )
    and (
      o.bucket_id not in ('media', 'note-card-photos', 'note-event-photos')
      or (storage.foldername(o.name))[1] is distinct from v_uid::text
      or not coalesce(
        o.owner_id = v_uid::text or (o.owner_id is null and o.owner = v_uid), false
      )
    )
  ) then
    raise exception 'account_storage_manual_review' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from storage.objects o
    where o.owner_id = v_uid::text or o.owner = v_uid
  ) then
    raise exception 'account_storage_remaining' using errcode = 'P0001';
  end if;

  update public.guestbook set author_nick = '탈퇴한 사용자' where author_id = v_uid;
  update public.media_comments set author_nick = '탈퇴한 사용자' where author_id = v_uid;
  delete from auth.users where id = v_uid;
  if not found then raise exception 'account_not_found' using errcode = 'P0001'; end if;
  -- Keep a restricted tombstone so an already issued JWT cannot upload a
  -- fresh object after its auth.users row has been deleted.
  update public.account_deletion_jobs
  set completed_at = pg_catalog.clock_timestamp()
  where user_id = v_uid;
end;
$$;

-- SECURITY DEFINER functions must not retain PostgreSQL's default PUBLIC
-- EXECUTE grant. Only signed-in clients may use these account operations.
revoke all on function public.account_deletion_upload_allowed() from public, anon;
revoke all on function public.account_deletion_pending() from public, anon;
revoke all on function public.prepare_my_account_deletion() from public, anon;
revoke all on function public.my_account_deletion_files(integer) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.account_deletion_upload_allowed() to authenticated;
grant execute on function public.account_deletion_pending() to authenticated;
grant execute on function public.prepare_my_account_deletion() to authenticated;
grant execute on function public.my_account_deletion_files(integer) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
