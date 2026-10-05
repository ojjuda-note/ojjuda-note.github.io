-- Photos are removed through Storage, never by deleting storage.objects in SQL.
-- Only an in-progress request is retained; Auth deletion also removes this marker.
create schema ojjuda_account_deletion;
revoke all on schema ojjuda_account_deletion from public,anon;
grant usage on schema ojjuda_account_deletion to authenticated;
create table ojjuda_account_deletion.requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default clock_timestamp()
);
alter table ojjuda_account_deletion.requests enable row level security;
revoke all on ojjuda_account_deletion.requests from public,anon,authenticated;

create function ojjuda_account_deletion.check_owner(p_expected_user_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare u uuid := (select auth.uid());
begin
  if u is null or u is distinct from p_expected_user_id then
    raise exception 'account_changed' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(127247341,pg_catalog.hashtext(u::text));
  if not exists(select 1 from auth.users where id=u) then
    raise exception 'account_not_found' using errcode='42501';
  end if;
  return u;
end;
$$;

create function ojjuda_account_deletion.pending()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from ojjuda_account_deletion.requests where user_id=(select auth.uid()));
$$;

create function ojjuda_account_deletion.upload_allowed()
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare u uuid := (select auth.uid());
begin
  if u is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(127247341,pg_catalog.hashtext(u::text));
  return exists(select 1 from auth.users where id=u)
     and not exists(select 1 from ojjuda_account_deletion.requests where user_id=u);
end;
$$;

create function ojjuda_account_deletion.assert_paths(u uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if exists(
    select 1 from storage.objects o
    where (o.owner_id=u::text or o.owner=u
      or (o.bucket_id in ('media','note-card-photos','note-event-photos') and split_part(o.name,'/',1)=u::text))
      and not coalesce(
        o.bucket_id in ('media','note-card-photos','note-event-photos')
        and split_part(o.name,'/',1)=u::text
        and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
        and (o.owner is null or o.owner=u)
        and o.name !~ '(^|/)([.]|[.][.])(/|$)' and o.name !~ '//|/$' and position(chr(92) in o.name)=0,
      false)
  ) then raise exception 'account_storage_manual_review' using errcode='P0001'; end if;
end;
$$;

create function ojjuda_account_deletion.prepare(p_expected_user_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare u uuid := ojjuda_account_deletion.check_owner(p_expected_user_id);
begin
  if exists(select 1 from ojjuda_note_internal.auto_card_config where author_id=u) then
    raise exception 'managed_account_requires_admin' using errcode='42501';
  end if;
  perform ojjuda_account_deletion.assert_paths(u);
  insert into ojjuda_account_deletion.requests(user_id) values(u) on conflict do nothing;
end;
$$;

create function ojjuda_account_deletion.files(p_expected_user_id uuid,p_limit integer)
returns table(bucket_id text,photo_path text)
language plpgsql volatile security definer set search_path='' as $$
declare u uuid := ojjuda_account_deletion.check_owner(p_expected_user_id);
begin
  if not ojjuda_account_deletion.pending() then
    raise exception 'account_deletion_not_prepared' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_limit' using errcode='22023'; end if;
  perform ojjuda_account_deletion.assert_paths(u);
  return query select o.bucket_id::text,o.name::text from storage.objects o
    where o.bucket_id in ('media','note-card-photos','note-event-photos')
      and split_part(o.name,'/',1)=u::text
      and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
      and (o.owner is null or o.owner=u)
    order by o.bucket_id,o.name limit p_limit;
end;
$$;

create function ojjuda_account_deletion.finish(p_expected_user_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare u uuid := ojjuda_account_deletion.check_owner(p_expected_user_id);
begin
  if exists(select 1 from ojjuda_note_internal.auto_card_config where author_id=u) then
    raise exception 'managed_account_requires_admin' using errcode='42501';
  end if;
  perform ojjuda_account_deletion.assert_paths(u);
  if exists(select 1 from storage.objects o where o.owner_id=u::text or o.owner=u
    or (o.bucket_id in ('media','note-card-photos','note-event-photos') and split_part(o.name,'/',1)=u::text)) then
    raise exception 'account_storage_remaining' using errcode='P0001';
  end if;
  update public.guestbook set author_nick='탈퇴한 사용자' where author_id=u;
  update public.media_comments set author_nick='탈퇴한 사용자' where author_id=u;
  delete from auth.users where id=u;
  if not found then raise exception 'account_not_found' using errcode='P0001'; end if;
end;
$$;

-- Public RPC wrappers carry the confirmed account ID; privilege stays private.
create function public.prepare_my_account_deletion(p_expected_user_id uuid)
returns void language sql security invoker set search_path='' as $$
  select ojjuda_account_deletion.prepare(p_expected_user_id);
$$;
create function public.my_account_deletion_files(p_expected_user_id uuid,p_limit integer default 100)
returns table(bucket_id text,photo_path text) language sql security invoker set search_path='' as $$
  select * from ojjuda_account_deletion.files(p_expected_user_id,p_limit);
$$;
create function public.delete_my_account(p_expected_user_id uuid)
returns void language sql security invoker set search_path='' as $$
  select ojjuda_account_deletion.finish(p_expected_user_id);
$$;
-- Older clients may still finish accounts with no files, but cannot skip cleanup.
create or replace function public.delete_my_account()
returns void language sql security invoker set search_path='' as $$
  select ojjuda_account_deletion.finish((select auth.uid()));
$$;

create policy account_deletion_owned_files_select on storage.objects for select to authenticated
using (bucket_id in ('media','note-card-photos','note-event-photos')
  and split_part(name,'/',1)=(select auth.uid()::text)
  and (owner_id=(select auth.uid()::text) or (owner_id is null and owner=(select auth.uid())))
  and (owner is null or owner=(select auth.uid()))
  and storage.allow_any_operation(array['object.delete','object.delete_many'])
  and (select ojjuda_account_deletion.pending()));
create policy account_deletion_owned_files_delete on storage.objects for delete to authenticated
using (bucket_id in ('media','note-card-photos','note-event-photos')
  and split_part(name,'/',1)=(select auth.uid()::text)
  and (owner_id=(select auth.uid()::text) or (owner_id is null and owner=(select auth.uid())))
  and (owner is null or owner=(select auth.uid()))
  and (select ojjuda_account_deletion.pending()));
create policy account_deletion_no_new_storage on storage.objects as restrictive for insert to authenticated
with check ((select ojjuda_account_deletion.upload_allowed()));
create policy account_deletion_no_storage_update on storage.objects as restrictive for update to authenticated
using ((select ojjuda_account_deletion.upload_allowed()))
with check ((select ojjuda_account_deletion.upload_allowed()));

revoke all on all functions in schema ojjuda_account_deletion from public,anon,authenticated;
grant execute on function ojjuda_account_deletion.prepare(uuid),ojjuda_account_deletion.files(uuid,integer),
  ojjuda_account_deletion.finish(uuid),ojjuda_account_deletion.pending(),ojjuda_account_deletion.upload_allowed() to authenticated;
revoke all on function public.prepare_my_account_deletion(uuid),public.my_account_deletion_files(uuid,integer),
  public.delete_my_account(uuid),public.delete_my_account() from public,anon;
grant execute on function public.prepare_my_account_deletion(uuid),public.my_account_deletion_files(uuid,integer),
  public.delete_my_account(uuid),public.delete_my_account() to authenticated;

notify pgrst,'reload schema';
