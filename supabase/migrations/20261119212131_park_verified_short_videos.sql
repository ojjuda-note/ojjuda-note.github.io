-- Short Park videos share the mature JPEG attachment publication/replacement
-- lifecycle. Only the server validator can create a verified MP4 sidecar receipt.
create table ojjuda_note_internal.card_video_uploads (
  photo_path text primary key,
  video_path text not null unique,
  author_id uuid not null references auth.users(id) on delete cascade,
  photo_object_id uuid not null,
  video_object_id uuid not null,
  duration double precision not null check (duration > 0 and duration < 60),
  width integer not null check (width between 1 and 1280),
  height integer not null check (height between 1 and 1280),
  bytes integer not null check (bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz not null default clock_timestamp(),
  check (least(width,height) <= 720),
  check (photo_path = regexp_replace(video_path,'[.]mp4$','.jpg'))
);
create index card_video_uploads_author on ojjuda_note_internal.card_video_uploads(author_id);
alter table ojjuda_note_internal.card_video_uploads enable row level security;
revoke all on ojjuda_note_internal.card_video_uploads from public,anon,authenticated,service_role;

create table ojjuda_note_internal.card_video_validation_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_started timestamptz not null,
  minute_count integer not null,
  day_started timestamptz not null,
  day_count integer not null
);
alter table ojjuda_note_internal.card_video_validation_limits enable row level security;
revoke all on ojjuda_note_internal.card_video_validation_limits from public,anon,authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('note-card-videos','note-card-videos',false,20971520,array['video/mp4']);

alter table ojjuda_note_internal.note_photo_tombstones
  drop constraint note_photo_tombstones_bucket_id_check;
alter table ojjuda_note_internal.note_photo_tombstones
  add constraint note_photo_tombstones_bucket_id_check
  check (bucket_id in ('note-card-photos','note-event-photos','note-card-videos'));

create function ojjuda_note_internal.card_video_path_valid(p_path text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]mp4$',false);
$$;

create function ojjuda_note_internal.can_upload_card_video(p_path text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid(); recent integer; unlinked integer;
begin
  if u is null or not ojjuda_note_internal.card_video_path_valid(p_path)
    or split_part(p_path,'/',1)<>u::text
    or not ojjuda_account_deletion.upload_allowed()
    or not (ojjuda_note_internal.can_note_act('memo') or ojjuda_note_internal.can_note_act('comment')) then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(21482,pg_catalog.hashtext(u::text));
  if exists(select 1 from ojjuda_note_internal.card_video_uploads where video_path=p_path)
    or exists(select 1 from ojjuda_note_internal.note_photo_tombstones
      where (bucket_id='note-card-videos' and photo_path=p_path)
        or (bucket_id='note-card-photos' and photo_path=regexp_replace(p_path,'[.]mp4$','.jpg')))
    or exists(select 1 from ojjuda_note_internal.card_photos
      where photo_path=regexp_replace(p_path,'[.]mp4$','.jpg')) then return false; end if;
  select count(*),count(*) filter (where p.card_id is null) into recent,unlinked
  from storage.objects o left join ojjuda_note_internal.card_photos p
    on p.photo_path=regexp_replace(o.name,'[.]mp4$','.jpg')
  where o.bucket_id='note-card-videos' and o.owner_id=u::text
    and o.created_at>statement_timestamp()-interval '24 hours';
  return recent<12 and unlinked<3;
end;
$$;

-- Both Storage deletion and linking take this per-account lock. A deletion
-- waiting behind publication rechecks the link after acquiring the lock.
create function ojjuda_note_internal.card_video_deletable(p_path text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
  if u is null or not ojjuda_note_internal.card_video_path_valid(p_path)
    or split_part(p_path,'/',1)<>u::text then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(127247341,pg_catalog.hashtext(u::text));
  perform pg_catalog.pg_advisory_xact_lock(21482,pg_catalog.hashtext(u::text));
  return ojjuda_account_deletion.pending() or not exists(
    select 1 from ojjuda_note_internal.card_photos
    where photo_path=regexp_replace(p_path,'[.]mp4$','.jpg'));
end;
$$;

create function ojjuda_note_internal.card_video_signable(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from ojjuda_note_internal.card_video_uploads v
    where v.video_path=p_path and ojjuda_note_internal.card_photo_signable(v.photo_path));
$$;

create policy note_card_video_insert on storage.objects for insert to authenticated
with check (bucket_id='note-card-videos' and owner_id=(select auth.uid()::text)
  and (owner is null or owner=(select auth.uid()))
  and ojjuda_note_internal.can_upload_card_video(name));
create policy note_card_video_no_update on storage.objects as restrictive for update to authenticated
using (bucket_id<>'note-card-videos') with check (bucket_id<>'note-card-videos');
create policy note_card_video_sign on storage.objects for select to authenticated
using (bucket_id='note-card-videos'
  and storage.allow_any_operation(array['object.sign','object.sign_many','object.get_authenticated'])
  and ojjuda_note_internal.card_video_signable(name));
-- Validation downloads are authenticated, exact owner paths only. Unverified
-- videos cannot be signed or listed and can never appear in other members' cards.
create policy note_card_video_validate_owner on storage.objects for select to authenticated
using (bucket_id='note-card-videos' and owner_id=(select auth.uid()::text)
  and storage.allow_any_operation(array['object.get_authenticated'])
  and not ojjuda_note_internal.note_photo_tombstoned(bucket_id,name)
  and ojjuda_note_internal.card_video_deletable(name)
  and (select ojjuda_account_deletion.upload_allowed()));
create policy note_card_video_owner_delete_select on storage.objects for select to authenticated
using (bucket_id='note-card-videos' and owner_id=(select auth.uid()::text)
  and storage.allow_any_operation(array['object.delete','object.delete_many'])
  and ojjuda_note_internal.card_video_deletable(name));
create policy note_card_video_owner_delete on storage.objects for delete to authenticated
using (bucket_id='note-card-videos' and owner_id=(select auth.uid()::text)
  and ojjuda_note_internal.card_video_deletable(name));
create policy note_card_video_admin_delete_select on storage.objects for select to authenticated
using (bucket_id='note-card-videos'
  and storage.allow_any_operation(array['object.delete','object.delete_many'])
  and ojjuda_note_internal.is_note_moderator()
  and ojjuda_note_internal.note_photo_tombstoned(bucket_id,name));
create policy note_card_video_admin_delete on storage.objects for delete to authenticated
using (bucket_id='note-card-videos' and ojjuda_note_internal.is_note_moderator()
  and ojjuda_note_internal.note_photo_tombstoned(bucket_id,name));

create function ojjuda_note.prepare_card_video_validation(p_photo_path text,p_video_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p storage.objects%rowtype; v storage.objects%rowtype;
  receipt ojjuda_note_internal.card_video_uploads%rowtype;
  limits ojjuda_note_internal.card_video_validation_limits%rowtype;
begin
  if u is null or not ojjuda_account_deletion.upload_allowed()
    or not (ojjuda_note_internal.can_note_act('memo') or ojjuda_note_internal.can_note_act('comment')) then
    raise exception 'video_forbidden' using errcode='42501'; end if;
  if not ojjuda_note_internal.card_video_path_valid(p_video_path)
    or split_part(p_video_path,'/',1)<>u::text
    or p_photo_path is distinct from regexp_replace(p_video_path,'[.]mp4$','.jpg') then
    raise exception 'invalid_video_path' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(21482,pg_catalog.hashtext(u::text));
  if ojjuda_note_internal.note_photo_tombstoned('note-card-photos',p_photo_path)
    or ojjuda_note_internal.note_photo_tombstoned('note-card-videos',p_video_path) then
    raise exception 'video_retired' using errcode='40001'; end if;
  select * into p from storage.objects where bucket_id='note-card-photos' and name=p_photo_path
    and owner_id=u::text and (owner is null or owner=u);
  select * into v from storage.objects where bucket_id='note-card-videos' and name=p_video_path
    and owner_id=u::text and (owner is null or owner=u);
  if p.id is null or v.id is null or p.metadata->>'mimetype' is distinct from 'image/jpeg'
    or v.metadata->>'mimetype' is distinct from 'video/mp4'
    or coalesce((p.metadata->>'size')::bigint,0) not between 1 and 524288
    or coalesce((v.metadata->>'size')::bigint,0) not between 1 and 20971520 then
    raise exception 'invalid_video_upload' using errcode='22023'; end if;
  select * into receipt from ojjuda_note_internal.card_video_uploads where photo_path=p_photo_path;
  if found then
    if receipt.photo_object_id<>p.id or receipt.video_object_id<>v.id then
      raise exception 'video_upload_changed' using errcode='40001'; end if;
    return jsonb_build_object('verified',jsonb_build_object('ok',true,'photo_path',p_photo_path,
      'video_path',p_video_path,'duration',receipt.duration,'width',receipt.width,'height',receipt.height,'bytes',receipt.bytes));
  end if;
  insert into ojjuda_note_internal.card_video_validation_limits(user_id,minute_started,minute_count,day_started,day_count)
    values(u,clock_timestamp(),0,clock_timestamp(),0) on conflict do nothing;
  select * into limits from ojjuda_note_internal.card_video_validation_limits where user_id=u;
  if limits.minute_started<clock_timestamp()-interval '1 minute' then
    limits.minute_started:=clock_timestamp(); limits.minute_count:=0; end if;
  if limits.day_started<clock_timestamp()-interval '24 hours' then
    limits.day_started:=clock_timestamp(); limits.day_count:=0; end if;
  if limits.minute_count>=6 or limits.day_count>=48 then
    raise exception 'video_validation_rate_limit' using errcode='P0001'; end if;
  update ojjuda_note_internal.card_video_validation_limits
    set minute_started=limits.minute_started,minute_count=limits.minute_count+1,
      day_started=limits.day_started,day_count=limits.day_count+1 where user_id=u;
  return jsonb_build_object('photo_object_id',p.id,'video_object_id',v.id,
    'photo_bytes',(p.metadata->>'size')::integer,'video_bytes',(v.metadata->>'size')::integer);
end;
$$;

-- The Edge Function authenticates the caller and parses the stored binaries.
-- Browser roles have no permission to mint these receipts or supply metadata.
create function ojjuda_note.register_verified_card_video(p_user_id uuid,p_photo_path text,p_video_path text,
  p_photo_object_id uuid,p_video_object_id uuid,p_duration double precision,p_width integer,p_height integer,
  p_bytes integer,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old ojjuda_note_internal.card_video_uploads%rowtype;
begin
  if p_user_id is null or not ojjuda_note_internal.card_video_path_valid(p_video_path)
    or split_part(p_video_path,'/',1)<>p_user_id::text
    or p_photo_path is distinct from regexp_replace(p_video_path,'[.]mp4$','.jpg')
    or p_duration is null or not (p_duration>0 and p_duration<60)
    or p_width is null or p_height is null or least(p_width,p_height)<1
    or greatest(p_width,p_height)>1280 or least(p_width,p_height)>720
    or p_bytes is null or p_bytes not between 1 and 20971520
    or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_video_metadata' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(127247341,pg_catalog.hashtext(p_user_id::text));
  perform pg_catalog.pg_advisory_xact_lock(21482,pg_catalog.hashtext(p_user_id::text));
  if not exists(select 1 from auth.users where id=p_user_id)
    or exists(select 1 from ojjuda_account_deletion.requests where user_id=p_user_id) then
    raise exception 'video_forbidden' using errcode='42501'; end if;
  if ojjuda_note_internal.note_photo_tombstoned('note-card-photos',p_photo_path)
    or ojjuda_note_internal.note_photo_tombstoned('note-card-videos',p_video_path) then
    raise exception 'video_retired' using errcode='40001'; end if;
  if not exists(select 1 from storage.objects where id=p_photo_object_id and bucket_id='note-card-photos'
      and name=p_photo_path and owner_id=p_user_id::text and (owner is null or owner=p_user_id)
      and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 524288)
    or not exists(select 1 from storage.objects where id=p_video_object_id and bucket_id='note-card-videos'
      and name=p_video_path and owner_id=p_user_id::text and (owner is null or owner=p_user_id)
      and metadata->>'mimetype'='video/mp4' and (metadata->>'size')::bigint=p_bytes) then
    raise exception 'video_upload_changed' using errcode='40001'; end if;
  select * into old from ojjuda_note_internal.card_video_uploads where photo_path=p_photo_path;
  if found then
    if old.author_id<>p_user_id or old.video_object_id<>p_video_object_id or old.photo_object_id<>p_photo_object_id
      or old.video_path<>p_video_path or old.sha256<>p_sha256 then
      raise exception 'video_upload_changed' using errcode='40001'; end if;
  else
    if exists(select 1 from ojjuda_note_internal.card_photos where photo_path=p_photo_path) then
      raise exception 'video_already_published' using errcode='40001'; end if;
    insert into ojjuda_note_internal.card_video_uploads(photo_path,video_path,author_id,photo_object_id,
      video_object_id,duration,width,height,bytes,sha256)
    values(p_photo_path,p_video_path,p_user_id,p_photo_object_id,p_video_object_id,p_duration,p_width,p_height,p_bytes,p_sha256);
  end if;
  return jsonb_build_object('ok',true,'photo_path',p_photo_path,'video_path',p_video_path,
    'duration',p_duration,'width',p_width,'height',p_height,'bytes',p_bytes);
end;
$$;

create function ojjuda_note_internal.guard_card_video_attachment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v ojjuda_note_internal.card_video_uploads%rowtype; video text;
begin
  video:=regexp_replace(new.photo_path,'[.]jpg$','.mp4');
  -- Also lock ordinary photos so a concurrent video upload cannot upgrade a
  -- previously published attachment by racing its initial publication.
  perform pg_catalog.pg_advisory_xact_lock(127247341,pg_catalog.hashtext(new.author_id::text));
  perform pg_catalog.pg_advisory_xact_lock(21482,pg_catalog.hashtext(new.author_id::text));
  select * into v from ojjuda_note_internal.card_video_uploads where photo_path=new.photo_path;
  if not found then
    if exists(select 1 from storage.objects where bucket_id='note-card-videos' and name=video) then
      raise exception 'video_not_verified' using errcode='22023'; end if;
    return new;
  end if;
  if new.author_id<>v.author_id or auth.uid() is distinct from v.author_id
    or not ojjuda_account_deletion.upload_allowed() then
    raise exception 'video_forbidden' using errcode='42501'; end if;
  if ojjuda_note_internal.note_photo_tombstoned('note-card-videos',v.video_path)
    or not exists(select 1 from storage.objects where id=v.video_object_id and bucket_id='note-card-videos'
      and name=v.video_path and owner_id=v.author_id::text and (metadata->>'size')::bigint=v.bytes)
    or not exists(select 1 from storage.objects where id=v.photo_object_id and bucket_id='note-card-photos'
      and name=v.photo_path and owner_id=v.author_id::text) then
    raise exception 'video_upload_changed' using errcode='40001'; end if;
  return new;
end;
$$;
create trigger note_card_video_guard before insert or update of photo_path on ojjuda_note_internal.card_photos
for each row execute function ojjuda_note_internal.guard_card_video_attachment();

-- Existing poster deletion policies must share the same publication barrier.
create or replace function ojjuda_note_internal.card_photo_unlinked(p_path text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare u uuid;
begin
  -- Lock before looking for a video: its upload may not have inserted a row
  -- yet. Otherwise a poster deletion could race a later upload/publication.
  if ojjuda_note_internal.card_video_path_valid(regexp_replace(p_path,'[.]jpg$','.mp4')) then
    u:=split_part(p_path,'/',1)::uuid;
    perform pg_catalog.pg_advisory_xact_lock(127247341,pg_catalog.hashtext(u::text));
    perform pg_catalog.pg_advisory_xact_lock(21482,pg_catalog.hashtext(u::text));
  end if;
  return not exists(select 1 from ojjuda_note_internal.card_photos where photo_path=p_path);
end;
$$;

create function ojjuda_note.card_media_paths(p_ids uuid[])
returns table(card_id uuid,photo_path text,video_path text,duration double precision,width integer,height integer)
language sql stable security definer set search_path='' as $$
  select p.card_id,p.photo_path,v.video_path,v.duration,v.width,v.height
  from ojjuda_note_internal.card_photos p
  left join ojjuda_note_internal.card_video_uploads v on v.photo_path=p.photo_path
  where p.card_id=any((coalesce(p_ids,'{}'::uuid[]))[1:100])
    and ojjuda_note_internal.card_photo_signable(p.photo_path);
$$;

create function ojjuda_note_internal.tombstone_card_video()
returns trigger language plpgsql security definer set search_path='' as $$
declare v text;
begin
  if new.bucket_id='note-card-photos' then
    v:=regexp_replace(new.photo_path,'[.]jpg$','.mp4');
    if exists(select 1 from ojjuda_note_internal.card_video_uploads where photo_path=new.photo_path)
      or exists(select 1 from storage.objects where bucket_id='note-card-videos' and name=v) then
      insert into ojjuda_note_internal.note_photo_tombstones(bucket_id,photo_path,card_id)
      values('note-card-videos',v,new.card_id) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
create trigger note_card_video_tombstone after insert on ojjuda_note_internal.note_photo_tombstones
for each row execute function ojjuda_note_internal.tombstone_card_video();

-- Abandoned preparations expire after a full day. Mark first, then the existing
-- Storage cleanup worker removes bytes; no direct storage.objects deletion.
create function ojjuda_note_internal.retire_unlinked_card_videos()
returns integer language plpgsql security definer set search_path='' as $$
declare r record; poster text; n integer:=0; u uuid;
begin
  for r in select o.name,o.owner_id from storage.objects o
    where o.bucket_id='note-card-videos' and o.created_at<statement_timestamp()-interval '24 hours'
      and ojjuda_note_internal.card_video_path_valid(o.name)
      and o.owner_id=split_part(o.name,'/',1)
      and not exists(select 1 from ojjuda_note_internal.note_photo_tombstones t
        where t.bucket_id='note-card-videos' and t.photo_path=o.name)
      and not exists(select 1 from ojjuda_note_internal.card_photos p
        where p.photo_path=regexp_replace(o.name,'[.]mp4$','.jpg'))
    order by o.created_at limit 100 loop
    u:=r.owner_id::uuid; poster:=regexp_replace(r.name,'[.]mp4$','.jpg');
    perform pg_catalog.pg_advisory_xact_lock(127247341,pg_catalog.hashtext(u::text));
    perform pg_catalog.pg_advisory_xact_lock(21482,pg_catalog.hashtext(u::text));
    if not exists(select 1 from ojjuda_note_internal.card_photos where photo_path=poster) then
      insert into ojjuda_note_internal.note_photo_tombstones(bucket_id,photo_path,card_id)
      values('note-card-videos',r.name,split_part(split_part(r.name,'/',2),'.',1)::uuid),
        ('note-card-photos',poster,split_part(split_part(r.name,'/',2),'.',1)::uuid) on conflict do nothing;
      n:=n+1;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function ojjuda_note_internal.card_video_path_valid(text),
  ojjuda_note_internal.can_upload_card_video(text),ojjuda_note_internal.card_video_deletable(text),
  ojjuda_note_internal.card_video_signable(text),ojjuda_note_internal.guard_card_video_attachment(),
  ojjuda_note_internal.tombstone_card_video(),ojjuda_note_internal.retire_unlinked_card_videos()
from public,anon,authenticated,service_role;
grant execute on function ojjuda_note_internal.can_upload_card_video(text),
  ojjuda_note_internal.card_video_deletable(text),ojjuda_note_internal.card_video_signable(text) to authenticated;
revoke all on function ojjuda_note.prepare_card_video_validation(text,text),ojjuda_note.card_media_paths(uuid[])
  from public,anon,authenticated,service_role;
grant execute on function ojjuda_note.prepare_card_video_validation(text,text),ojjuda_note.card_media_paths(uuid[])
  to authenticated;
revoke all on function ojjuda_note.register_verified_card_video(uuid,text,text,uuid,uuid,double precision,integer,integer,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function ojjuda_note.register_verified_card_video(uuid,text,text,uuid,uuid,double precision,integer,integer,integer,text)
  to service_role;
grant usage on schema ojjuda_note to service_role;

select cron.schedule('note-short-video-orphan-retirement','17 * * * *',
  'select ojjuda_note_internal.retire_unlinked_card_videos()');

-- Preserve all existing special-bucket ownership checks during withdrawal.
CREATE OR REPLACE FUNCTION ojjuda_account_deletion.assert_paths(u uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if exists(
  select 1 from storage.objects o
  where (o.owner_id=u::text or o.owner=u
   or (o.bucket_id in ('media','note-card-photos','note-event-photos','note-card-videos','restaurant-recommendations','restaurant-comment-photos') and split_part(o.name,'/',1)=u::text))
   and not coalesce(
    (o.bucket_id in ('media','note-card-photos','note-event-photos')
     or (o.bucket_id='note-card-videos' and ojjuda_note_internal.card_video_path_valid(o.name) and o.owner_id=u::text)
     or (o.bucket_id='pajang-exchange-photos' and pajang_private.exchange_photo_path_ok(o.name) and o.owner_id=u::text)
     or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text)
     or (o.bucket_id='restaurant-comment-photos' and o.name ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.]jpg$'
      and ojjuda_restaurants_internal.comment_photo_path_valid(o.name,u,split_part(o.name,'/',2)) and o.owner_id=u::text))
    and (split_part(o.name,'/',1)=u::text or (o.bucket_id='pajang-exchange-photos' and o.owner_id=u::text))
    and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
    and (o.owner is null or o.owner=u)
    and o.name !~ '(^|/)([.]|[.][.])(/|$)' and o.name !~ '//|/$' and position(chr(92) in o.name)=0,
   false)
 ) then raise exception 'account_storage_manual_review' using errcode='P0001'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_account_deletion.files(p_expected_user_id uuid, p_limit integer)
 RETURNS TABLE(bucket_id text, photo_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := ojjuda_account_deletion.check_owner(p_expected_user_id);
begin
 if not ojjuda_account_deletion.pending() then
  raise exception 'account_deletion_not_prepared' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_limit' using errcode='22023'; end if;
 perform ojjuda_account_deletion.assert_paths(u);
 return query select o.bucket_id::text,o.name::text from storage.objects o
  where (o.bucket_id in ('media','note-card-photos','note-event-photos')
     or (o.bucket_id='note-card-videos' and ojjuda_note_internal.card_video_path_valid(o.name) and o.owner_id=u::text)
     or (o.bucket_id='pajang-exchange-photos' and pajang_private.exchange_photo_path_ok(o.name) and o.owner_id=u::text)
   or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text)
   or (o.bucket_id='restaurant-comment-photos' and o.name ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.]jpg$'
    and ojjuda_restaurants_internal.comment_photo_path_valid(o.name,u,split_part(o.name,'/',2)) and o.owner_id=u::text))
   and (split_part(o.name,'/',1)=u::text or (o.bucket_id='pajang-exchange-photos' and o.owner_id=u::text))
   and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
   and (o.owner is null or o.owner=u)
  order by o.bucket_id,o.name limit p_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_account_deletion.finish(p_expected_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := ojjuda_account_deletion.check_owner(p_expected_user_id);
begin
  if exists(select 1 from ojjuda_note_internal.auto_card_config where author_id=u) then
    raise exception 'managed_account_requires_admin' using errcode='42501';
  end if;
  perform ojjuda_account_deletion.assert_paths(u);
  if exists(select 1 from storage.objects o where o.owner_id=u::text or o.owner=u
    or (o.bucket_id in ('media','note-card-photos','note-event-photos','note-card-videos') and split_part(o.name,'/',1)=u::text)) then
    raise exception 'account_storage_remaining' using errcode='P0001';
  end if;
  update public.guestbook set author_nick='탈퇴한 사용자' where author_id=u;
  update public.media_comments set author_nick='탈퇴한 사용자' where author_id=u;
  delete from auth.users where id=u;
  if not found then raise exception 'account_not_found' using errcode='P0001'; end if;
end;
$function$;

notify pgrst,'reload schema';
