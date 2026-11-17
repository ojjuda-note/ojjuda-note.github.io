-- An immutable random filename per upload keeps a later replacement safe from a stale delete.
-- A unique slot from 1 to 10 also accounts for concurrent/in-flight uploads.
create table pajang_private.exchange_photo_slots (
  person uuid not null references pajang_private.people(id) on delete cascade,
  slot smallint not null check (slot between 1 and 10),
  photo uuid not null unique,
  reserved_at timestamptz not null default clock_timestamp(),
  primary key(person,slot)
);
alter table pajang_private.exchange_photo_slots enable row level security;
revoke all on pajang_private.exchange_photo_slots from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('pajang-exchange-photos','pajang-exchange-photos',false,2097152,array['image/jpeg']);

create function pajang_private.exchange_photo_path_ok(path text)
returns boolean language sql immutable strict parallel safe
return path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$';
revoke all on function pajang_private.exchange_photo_path_ok(text) from public,anon,authenticated;

create function public.pajang_photos(p_action text default 'list',p_peer uuid default null,p_photo uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me uuid := pajang_private.exchange_actor();
  target uuid := coalesce(p_peer,me);
  reservation pajang_private.exchange_photo_slots;
  result jsonb;
begin
  if me is null then raise exception '파장 회원만 사진을 이용할 수 있어요.' using errcode='42501'; end if;
  if p_action='list' then
    if target<>me and not coalesce(pajang_private.exchange_can_view(me,target,'photos'),false) then
      raise exception '사진 교환 권한을 다시 확인해 주세요.' using errcode='42501';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',s.photo,'slot',s.slot,'path',o.name) order by s.slot),'[]'::jsonb)
      into result from pajang_private.exchange_photo_slots s
      join pajang_private.people p on p.id=s.person
      join storage.objects o on o.bucket_id='pajang-exchange-photos'
        and o.name=s.person::text||'/'||s.photo::text||'.jpg' and o.owner_id=p.owner_id::text
      where s.person=target;
    return result;
  end if;
  if target<>me or p_photo is null or p_action is null or p_action not in ('reserve','release') then
    raise exception '사진 요청을 확인해 주세요.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text,214));
  if p_action='release' then
    if exists(select from storage.objects where bucket_id='pajang-exchange-photos' and name=me::text||'/'||p_photo::text||'.jpg') then
      raise exception '사진 파일을 먼저 삭제해 주세요.' using errcode='PT409';
    end if;
    delete from pajang_private.exchange_photo_slots where person=me and photo=p_photo;
    return '{}'::jsonb;
  end if;
  delete from pajang_private.exchange_photo_slots s where s.person=me and s.reserved_at<clock_timestamp()-interval '20 minutes'
    and not exists(select from storage.objects o where o.bucket_id='pajang-exchange-photos' and o.name=me::text||'/'||s.photo::text||'.jpg');
  select * into reservation from pajang_private.exchange_photo_slots where person=me and photo=p_photo;
  if not found then
    insert into pajang_private.exchange_photo_slots(person,slot,photo)
      select me,n,p_photo from generate_series(1,10) n
      where not exists(select from pajang_private.exchange_photo_slots s where s.person=me and s.slot=n)
      order by n limit 1 returning * into reservation;
    if not found then raise exception '사진은 최대 10장까지 등록할 수 있어요.' using errcode='PT409'; end if;
  end if;
  return jsonb_build_object('id',reservation.photo,'slot',reservation.slot,'path',me::text||'/'||reservation.photo::text||'.jpg');
end; $$;
revoke all on function public.pajang_photos(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pajang_photos(text,uuid,uuid) to authenticated;

create function pajang_private.exchange_photo_access(path text, storage_owner text, action text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid();
  target uuid;
  photo_id uuid;
  me uuid;
begin
  if u is null or path is null or not pajang_private.exchange_photo_path_ok(path) then return false; end if;
  target:=split_part(path,'/',1)::uuid;
  photo_id:=split_part(split_part(path,'/',2),'.',1)::uuid;
  if action='read' and storage.allow_any_operation(array['object.delete','object.delete_many']) then action:='delete'; end if;
  if action='delete' then
    if storage_owner is distinct from u::text then return false; end if;
    if ojjuda_account_deletion.pending() then return true; end if;
  elsif action='read' then
    -- Signing, copying, listing and transforms must not turn an exchange into a reusable link.
    if not storage.allow_only_operation('object.get_authenticated') then return false; end if;
  elsif action<>'upload' then return false; end if;
  me:=pajang_private.exchange_actor();
  if me is null then return false; end if;
  if action='upload' then
    if me<>target or storage_owner is distinct from u::text then return false; end if;
    perform pg_advisory_xact_lock(hashtextextended(target::text,214));
  end if;
  if action='delete' then return me=target; end if;
  if me<>target and not coalesce(pajang_private.exchange_can_view(me,target,'photos'),false) then return false; end if;
  return exists(select from pajang_private.exchange_photo_slots s join pajang_private.people p on p.id=s.person
    where s.person=target and s.photo=photo_id and p.owner_id::text=storage_owner);
end; $$;
revoke all on function pajang_private.exchange_photo_access(text,text,text) from public,anon,authenticated;
grant execute on function pajang_private.exchange_photo_access(text,text,text) to authenticated;

create policy pajang_exchange_photo_read on storage.objects for select to authenticated
 using(bucket_id='pajang-exchange-photos' and pajang_private.exchange_photo_access(name,owner_id,'read'));
create policy pajang_exchange_photo_read_guard on storage.objects as restrictive for select to authenticated
 using(case when bucket_id='pajang-exchange-photos' then pajang_private.exchange_photo_access(name,owner_id,'read') else true end);
create policy pajang_exchange_photo_insert on storage.objects for insert to authenticated
 with check(bucket_id='pajang-exchange-photos' and pajang_private.exchange_photo_access(name,owner_id,'upload'));
create policy pajang_exchange_photo_insert_guard on storage.objects as restrictive for insert to authenticated
 with check(case when bucket_id='pajang-exchange-photos' then pajang_private.exchange_photo_access(name,owner_id,'upload') else true end);
create policy pajang_exchange_photo_delete on storage.objects for delete to authenticated
 using(bucket_id='pajang-exchange-photos' and pajang_private.exchange_photo_access(name,owner_id,'delete'));
create policy pajang_exchange_photo_delete_guard on storage.objects as restrictive for delete to authenticated
 using(case when bucket_id='pajang-exchange-photos' then pajang_private.exchange_photo_access(name,owner_id,'delete') else true end);
create policy pajang_exchange_photo_no_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'pajang-exchange-photos') with check(bucket_id<>'pajang-exchange-photos');
create policy pajang_exchange_photo_no_guest on storage.objects as restrictive for all to anon
 using(bucket_id<>'pajang-exchange-photos') with check(bucket_id<>'pajang-exchange-photos');

-- The member client removes the physical files via Storage before deleting the Pajang profile.
create function pajang_private.require_empty_photo_library() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(old.id::text,214));
  if exists(select from storage.objects o where o.bucket_id='pajang-exchange-photos' and o.name like old.id::text||'/%') then
    raise exception '사진 정리가 끝나지 않았어요. 다시 삭제를 눌러 주세요.' using errcode='PT409';
  end if;
  return old;
end; $$;
revoke all on function pajang_private.require_empty_photo_library() from public,anon,authenticated;
create trigger require_empty_photo_library before delete on pajang_private.people
for each row execute function pajang_private.require_empty_photo_library();

-- Withdrawal can still remove files through the owner's existing authenticated Storage session.
create or replace function ojjuda_account_deletion.assert_paths(u uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if exists(
  select 1 from storage.objects o
  where (o.owner_id=u::text or o.owner=u
   or (o.bucket_id in ('media','note-card-photos','note-event-photos','restaurant-recommendations','restaurant-comment-photos') and split_part(o.name,'/',1)=u::text))
   and not coalesce(
    (o.bucket_id in ('media','note-card-photos','note-event-photos')
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
$$;
create or replace function ojjuda_account_deletion.files(p_expected_user_id uuid,p_limit integer)
returns table(bucket_id text,photo_path text)
language plpgsql volatile security definer set search_path='' as $$
declare u uuid := ojjuda_account_deletion.check_owner(p_expected_user_id);
begin
 if not ojjuda_account_deletion.pending() then
  raise exception 'account_deletion_not_prepared' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_limit' using errcode='22023'; end if;
 perform ojjuda_account_deletion.assert_paths(u);
 return query select o.bucket_id::text,o.name::text from storage.objects o
  where (o.bucket_id in ('media','note-card-photos','note-event-photos')
     or (o.bucket_id='pajang-exchange-photos' and pajang_private.exchange_photo_path_ok(o.name) and o.owner_id=u::text)
   or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text)
   or (o.bucket_id='restaurant-comment-photos' and o.name ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.]jpg$'
    and ojjuda_restaurants_internal.comment_photo_path_valid(o.name,u,split_part(o.name,'/',2)) and o.owner_id=u::text))
   and (split_part(o.name,'/',1)=u::text or (o.bucket_id='pajang-exchange-photos' and o.owner_id=u::text))
   and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
   and (o.owner is null or o.owner=u)
  order by o.bucket_id,o.name limit p_limit;
end;
$$;
