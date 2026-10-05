-- Disposable local Supabase only: application tables and existing Storage rules.
create schema if not exists ojjuda_note_internal;
create schema if not exists ojjuda_account_internal;
create schema if not exists cron;
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,nickname text);
create table public.guestbook(author_id uuid references auth.users(id) on delete set null,author_nick text);
create table public.media_comments(author_id uuid references auth.users(id) on delete set null,author_nick text);
create table ojjuda_account_internal.member_identity(user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date,gender text,phone_number text,age_at_signup smallint);
create function ojjuda_account_internal.normalize_phone(text) returns text language sql immutable as $$select $1$$;
do $$begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    execute 'create function cron.schedule(text,text,text) returns bigint language sql as ''select 1::bigint''';
  end if;
end$$;
create table ojjuda_note_internal.auto_card_config(author_id uuid primary key references auth.users(id));
create table ojjuda_note_internal.fixture_linked_photos(path text primary key,author_id uuid references auth.users(id) on delete cascade);
create function ojjuda_note_internal.fixture_unlinked(path text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from ojjuda_note_internal.fixture_linked_photos where path=$1);
$$;
grant usage on schema ojjuda_note_internal to authenticated;
insert into storage.buckets(id,name,public) values('media','media',false),('note-card-photos','note-card-photos',false),('note-event-photos','note-event-photos',false),('fixture-other','fixture-other',false);
create policy fixture_insert on storage.objects for insert to authenticated
with check(split_part(name,'/',1)=(select auth.uid()::text) and owner_id=(select auth.uid()::text));
create policy fixture_media_read on storage.objects for select to authenticated
using(bucket_id='media' and split_part(name,'/',1)=(select auth.uid()::text));
create policy fixture_media_delete on storage.objects for delete to authenticated
using(bucket_id='media' and split_part(name,'/',1)=(select auth.uid()::text));
-- Exercise the restrictive guard even when an ordinary upsert policy grants access.
create policy fixture_media_update on storage.objects for update to authenticated
using(bucket_id='media' and split_part(name,'/',1)=(select auth.uid()::text))
with check(bucket_id='media' and split_part(name,'/',1)=(select auth.uid()::text));
create policy fixture_note_delete on storage.objects for delete to authenticated
using(bucket_id in ('note-card-photos','note-event-photos') and owner_id=(select auth.uid()::text)
  and ojjuda_note_internal.fixture_unlinked(name));
create policy fixture_note_delete_select on storage.objects for select to authenticated
using(bucket_id in ('note-card-photos','note-event-photos') and owner_id=(select auth.uid()::text)
  and storage.allow_any_operation(array['object.delete','object.delete_many'])
  and ojjuda_note_internal.fixture_unlinked(name));
