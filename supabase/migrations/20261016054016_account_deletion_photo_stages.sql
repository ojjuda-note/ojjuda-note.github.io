-- Extend owned-file cleanup to ordinary member photo stages.
-- Keep administrator-managed creative-comics and unknown buckets in manual review.

create or replace function ojjuda_account_deletion.assert_paths(u uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if exists(
    select 1 from storage.objects o
    where (o.owner_id=u::text or o.owner=u
      or (o.bucket_id in ('media','note-card-photos','note-event-photos','photo-stages') and split_part(o.name,'/',1)=u::text))
      and not coalesce(
        o.bucket_id in ('media','note-card-photos','note-event-photos','photo-stages')
        and split_part(o.name,'/',1)=u::text
        and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
        and (o.owner is null or o.owner=u)
        and o.name !~ '(^|/)([.]|[.][.])(/|$)' and o.name !~ '//|/$' and position(chr(92) in o.name)=0,
      false)
  ) then raise exception 'account_storage_manual_review' using errcode='P0001'; end if;
end;
$$;

create or replace function ojjuda_account_deletion.files(p_expected_user_id uuid,p_limit integer)
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
    where o.bucket_id in ('media','note-card-photos','note-event-photos','photo-stages')
      and split_part(o.name,'/',1)=u::text
      and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
      and (o.owner is null or o.owner=u)
    order by o.bucket_id,o.name limit p_limit;
end;
$$;

create or replace function ojjuda_account_deletion.finish(p_expected_user_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare u uuid := ojjuda_account_deletion.check_owner(p_expected_user_id);
begin
  if exists(select 1 from ojjuda_note_internal.auto_card_config where author_id=u) then
    raise exception 'managed_account_requires_admin' using errcode='42501';
  end if;
  perform ojjuda_account_deletion.assert_paths(u);
  if exists(select 1 from storage.objects o where o.owner_id=u::text or o.owner=u
    or (o.bucket_id in ('media','note-card-photos','note-event-photos','photo-stages') and split_part(o.name,'/',1)=u::text)) then
    raise exception 'account_storage_remaining' using errcode='P0001';
  end if;
  update public.guestbook set author_nick='탈퇴한 사용자' where author_id=u;
  update public.media_comments set author_nick='탈퇴한 사용자' where author_id=u;
  delete from auth.users where id=u;
  if not found then raise exception 'account_not_found' using errcode='P0001'; end if;
end;
$$;

drop policy account_deletion_owned_files_select on storage.objects;
create policy account_deletion_owned_files_select on storage.objects for select to authenticated
using (bucket_id in ('media','note-card-photos','note-event-photos','photo-stages')
  and split_part(name,'/',1)=(select auth.uid()::text)
  and (owner_id=(select auth.uid()::text) or (owner_id is null and owner=(select auth.uid())))
  and (owner is null or owner=(select auth.uid()))
  and storage.allow_any_operation(array['object.delete','object.delete_many'])
  and (select ojjuda_account_deletion.pending()));
drop policy account_deletion_owned_files_delete on storage.objects;
create policy account_deletion_owned_files_delete on storage.objects for delete to authenticated
using (bucket_id in ('media','note-card-photos','note-event-photos','photo-stages')
  and split_part(name,'/',1)=(select auth.uid()::text)
  and (owner_id=(select auth.uid()::text) or (owner_id is null and owner=(select auth.uid())))
  and (owner is null or owner=(select auth.uid()))
  and (select ojjuda_account_deletion.pending()));

-- Age corrections must not prevent withdrawal cleanup. This exception permits
-- only Storage deletion operations, never image reads or signed-URL creation.
-- Keep anonymous reads independent of authenticated-only cleanup helpers.
alter policy photo_storage_adult_select on storage.objects to anon;
create policy photo_storage_adult_select_member on storage.objects as restrictive
for select to authenticated using (
  bucket_id <> 'photo-stages' or (select ojjuda_photo_internal.member_allowed())
  or (bucket_id = 'photo-stages'
    and split_part(name,'/',1)=(select auth.uid()::text)
    and (owner_id=(select auth.uid()::text) or (owner_id is null and owner=(select auth.uid())))
    and (owner is null or owner=(select auth.uid()))
    and storage.allow_any_operation(array['object.delete','object.delete_many'])
    and (select ojjuda_account_deletion.pending()))
);
notify pgrst,'reload schema';
