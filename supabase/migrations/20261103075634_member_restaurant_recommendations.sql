-- Member recommendations are separate from the curated guide data.
-- Public RPC wrappers are invokers; privileged checks live in an unexposed schema.
create schema ojjuda_restaurants_internal;
revoke all on schema ojjuda_restaurants_internal from public,anon;
grant usage on schema ojjuda_restaurants_internal to authenticated;

create function ojjuda_restaurants_internal.photo_path_valid(p_path text)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$',false);
$$;

create function ojjuda_restaurants_internal.photo_paths_valid(p_paths text[],p_owner uuid,p_id uuid)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(array_ndims(p_paths)=1 and array_lower(p_paths,1)=1
  and cardinality(p_paths) between 3 and 9
  and cardinality(p_paths)=(select count(distinct path) from unnest(p_paths) path)
  and not exists(select 1 from unnest(p_paths) path
   where not ojjuda_restaurants_internal.photo_path_valid(path)
    or split_part(path,'/',1) is distinct from p_owner::text
    or split_part(path,'/',2) is distinct from p_id::text),false);
$$;

create table ojjuda_restaurants_internal.recommendations (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 80),
 category text not null check(category in ('한식','중식','일식','양식','분식','디저트','기타')),
 region text not null check(region in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주')),
 address text not null check(char_length(btrim(address)) between 5 and 200),
 menu text not null check(char_length(btrim(menu)) between 1 and 160),
 reason text not null check(char_length(btrim(reason)) between 5 and 1000),
 photos text[] not null,
 last_request_id uuid not null,
 last_removed_paths text[] not null default '{}',
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check(ojjuda_restaurants_internal.photo_paths_valid(photos,owner_id,id))
);
-- Retain only opaque identifiers after deletion, allowing safe delete retries and
-- preventing a delayed create request from resurrecting a deleted recommendation.
create table ojjuda_restaurants_internal.deleted_recommendations (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 removed_paths text[] not null,
 deleted_at timestamptz not null default clock_timestamp()
);
create index restaurant_recommendations_created on ojjuda_restaurants_internal.recommendations(created_at desc,id desc);
create index restaurant_recommendations_owner on ojjuda_restaurants_internal.recommendations(owner_id,created_at desc,id desc);
create index restaurant_recommendations_category on ojjuda_restaurants_internal.recommendations(category,created_at desc,id desc);
create index restaurant_recommendations_region on ojjuda_restaurants_internal.recommendations(region,created_at desc,id desc);
create index restaurant_recommendations_deleted_owner on ojjuda_restaurants_internal.deleted_recommendations(owner_id);
alter table ojjuda_restaurants_internal.recommendations enable row level security;
alter table ojjuda_restaurants_internal.deleted_recommendations enable row level security;
revoke all on ojjuda_restaurants_internal.recommendations,ojjuda_restaurants_internal.deleted_recommendations from public,anon,authenticated;

create function ojjuda_restaurants_internal.member_allowed()
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
declare u uuid := auth.uid();
begin
 if u is null then return false; end if;
 return exists(select 1 from auth.users a join public.profiles p on p.id=a.id
   where a.id=u and a.is_anonymous is not true and a.deleted_at is null
    and (a.banned_until is null or a.banned_until<=now()))
  and not coalesce(public.is_banned(u),false)
  and not ojjuda_account_deletion.pending();
end;
$$;

create function ojjuda_restaurants_internal.require_member()
returns uuid language plpgsql stable security definer set search_path=pg_catalog as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'sign_in_required' using errcode='42501'; end if;
 if not ojjuda_restaurants_internal.member_allowed() then
  raise exception 'member_unavailable' using errcode='42501'; end if;
 return u;
end;
$$;

-- Other authors' withdrawal state is read internally. The existing pending()
-- helper and is_banned(uuid) are never invoked for a different member.
create function ojjuda_restaurants_internal.author_visible(p_owner uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from auth.users a
  join public.profiles p on p.id=a.id
  where a.id=p_owner and a.is_anonymous is not true and a.deleted_at is null)
  and not exists(select 1 from ojjuda_account_deletion.requests r where r.user_id=p_owner);
$$;

create function ojjuda_restaurants_internal.item_json(p_item ojjuda_restaurants_internal.recommendations)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('id',p_item.id,'owner_id',p_item.owner_id,
  'name',p_item.name,'category',p_item.category,'region',p_item.region,
  'address',p_item.address,'menu',p_item.menu,'reason',p_item.reason,'photos',p_item.photos,
  'author_name',coalesce((select nullif(btrim(nickname),'') from public.profiles where id=p_item.owner_id),'회원'),
  'created_at',p_item.created_at,'updated_at',p_item.updated_at,'is_owner',p_item.owner_id=auth.uid(),
  'request_id',case when p_item.owner_id=auth.uid() then p_item.last_request_id else null end)
 where auth.uid() is not null;
$$;

create function ojjuda_restaurants_internal.list_items(p_query text,p_category text,p_region text,p_mine boolean,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare u uuid := ojjuda_restaurants_internal.require_member(); q text := btrim(coalesce(p_query,'')); result jsonb;
begin
 if char_length(q)>120 or p_offset is null or p_offset not between 0 and 10000
  or p_limit is null or p_limit not between 1 and 50 or p_mine is null
  or (p_category is not null and p_category not in ('한식','중식','일식','양식','분식','디저트','기타'))
  or (p_region is not null and p_region not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주')) then
  raise exception 'recommendation_invalid_input' using errcode='22023'; end if;
 with matched as materialized (
  select r.* from ojjuda_restaurants_internal.recommendations r
  where (not p_mine or r.owner_id=u) and (p_category is null or r.category=p_category)
   and (p_region is null or r.region=p_region)
   and (q='' or strpos(lower(concat_ws(' ',r.name,r.address,r.menu)),lower(q))>0)
   and ojjuda_restaurants_internal.author_visible(r.owner_id)
 ), page as (select * from matched order by created_at desc,id desc offset p_offset limit p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(ojjuda_restaurants_internal.item_json(p) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb),
  'total',(select count(*) from matched),'offset',p_offset,'limit',p_limit) into result;
 return result;
end;
$$;

create function ojjuda_restaurants_internal.get_item(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 perform ojjuda_restaurants_internal.require_member();
 select ojjuda_restaurants_internal.item_json(r) into result
  from ojjuda_restaurants_internal.recommendations r
  where r.id=p_id and ojjuda_restaurants_internal.author_visible(r.owner_id);
 return result;
end;
$$;

create function ojjuda_restaurants_internal.save_item(p_id uuid,p_request_id uuid,p_name text,p_category text,p_region text,p_address text,p_menu text,p_reason text,p_photos text[],p_expected_updated_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare u uuid := ojjuda_restaurants_internal.require_member(); old_row ojjuda_restaurants_internal.recommendations;
 saved_row ojjuda_restaurants_internal.recommendations; existed boolean; n integer; removed text[] := '{}';
 v_name text := btrim(p_name); v_address text := btrim(p_address); v_menu text := btrim(p_menu); v_reason text := btrim(p_reason);
begin
 -- Same member lock as account withdrawal / Storage uploads, then the post lock.
 perform pg_advisory_xact_lock(127247341,hashtext(u::text));
 perform ojjuda_restaurants_internal.require_member();
 if p_id is null or p_request_id is null
  or v_name is null or char_length(v_name) not between 1 and 80
  or v_address is null or char_length(v_address) not between 5 and 200
  or v_menu is null or char_length(v_menu) not between 1 and 160
  or v_reason is null or char_length(v_reason) not between 5 and 1000
  or p_category is null or p_category not in ('한식','중식','일식','양식','분식','디저트','기타')
  or p_region is null or p_region not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주') then
  raise exception 'recommendation_invalid_input' using errcode='22023'; end if;
 if p_photos is null or cardinality(p_photos) not between 3 and 9 then
  raise exception 'recommendation_photos_required' using errcode='23514'; end if;
 if not ojjuda_restaurants_internal.photo_paths_valid(p_photos,u,p_id) then
  raise exception 'recommendation_photo_invalid' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(127247342,hashtext(p_id::text));
 if exists(select 1 from ojjuda_restaurants_internal.deleted_recommendations where id=p_id) then
  raise exception 'recommendation_not_found' using errcode='P0002'; end if;
 select * into old_row from ojjuda_restaurants_internal.recommendations where id=p_id for update;
 existed := found;
 if existed then
  if old_row.owner_id<>u then raise exception 'recommendation_not_owner' using errcode='42501'; end if;
  if old_row.last_request_id=p_request_id then
   if (old_row.name,old_row.category,old_row.region,old_row.address,old_row.menu,old_row.reason,old_row.photos)
    is distinct from (v_name,p_category,p_region,v_address,v_menu,v_reason,p_photos) then
    raise exception 'recommendation_request_conflict' using errcode='22023'; end if;
   return jsonb_build_object('item',ojjuda_restaurants_internal.item_json(old_row),'removed_paths',old_row.last_removed_paths);
  end if;
  if p_expected_updated_at is distinct from old_row.updated_at then
   raise exception 'recommendation_conflict' using errcode='40001'; end if;
 elsif p_expected_updated_at is not null then
  raise exception 'recommendation_not_found' using errcode='P0002';
 end if;
 -- Storage owns these metadata rows; only read/lock them, never insert/delete them.
 -- The matching post lock in photo_delete_allowed serializes deletion vs publish.
 perform 1 from storage.objects o
  where o.bucket_id='restaurant-recommendations' and o.name=any(p_photos)
   and o.owner_id=u::text and (o.owner is null or o.owner=u)
   and o.archived_at is null and o.is_delete_marker is not true
   and o.metadata->>'mimetype'='image/jpeg'
   and jsonb_typeof(o.metadata->'size')='number'
   and case when o.metadata->>'size' ~ '^[0-9]{1,7}$'
       then (o.metadata->>'size')::bigint between 1 and 5242880 else false end
  order by o.name for key share;
 get diagnostics n=row_count;
 if n<>cardinality(p_photos) then raise exception 'recommendation_photo_invalid' using errcode='23514'; end if;
 if existed then
  select coalesce(array_agg(path order by position),'{}'::text[]) into removed
   from unnest(old_row.photos) with ordinality as previous(path,position) where not(path=any(p_photos));
  update ojjuda_restaurants_internal.recommendations set name=v_name,category=p_category,region=p_region,
   address=v_address,menu=v_menu,reason=v_reason,photos=p_photos,last_request_id=p_request_id,last_removed_paths=removed,
   updated_at=greatest(clock_timestamp(),old_row.updated_at+interval '1 microsecond') where id=p_id returning * into saved_row;
 else
  insert into ojjuda_restaurants_internal.recommendations(id,owner_id,name,category,region,address,menu,reason,photos,last_request_id)
   values(p_id,u,v_name,p_category,p_region,v_address,v_menu,v_reason,p_photos,p_request_id) returning * into saved_row;
 end if;
 return jsonb_build_object('item',ojjuda_restaurants_internal.item_json(saved_row),'removed_paths',removed);
end;
$$;

create function ojjuda_restaurants_internal.delete_item(p_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare u uuid := ojjuda_restaurants_internal.require_member(); old_row ojjuda_restaurants_internal.recommendations;
 tombstone ojjuda_restaurants_internal.deleted_recommendations;
begin
 perform pg_advisory_xact_lock(127247341,hashtext(u::text));
 perform ojjuda_restaurants_internal.require_member();
 if p_id is null then raise exception 'recommendation_invalid_input' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(127247342,hashtext(p_id::text));
 select * into old_row from ojjuda_restaurants_internal.recommendations where id=p_id for update;
 if not found then
  select * into tombstone from ojjuda_restaurants_internal.deleted_recommendations where id=p_id;
  if found and tombstone.owner_id<>u then raise exception 'recommendation_not_owner' using errcode='42501'; end if;
  return jsonb_build_object('id',p_id,'deleted',true,'removed_paths',coalesce(tombstone.removed_paths,'{}'::text[]));
 end if;
 if old_row.owner_id<>u then raise exception 'recommendation_not_owner' using errcode='42501'; end if;
 if p_expected_updated_at is distinct from old_row.updated_at then raise exception 'recommendation_conflict' using errcode='40001'; end if;
 insert into ojjuda_restaurants_internal.deleted_recommendations(id,owner_id,removed_paths) values(p_id,u,old_row.photos);
 delete from ojjuda_restaurants_internal.recommendations where id=p_id;
 return jsonb_build_object('id',p_id,'deleted',true,'removed_paths',old_row.photos);
end;
$$;

create function public.list_restaurant_recommendations(p_query text default '',p_category text default null,p_region text default null,p_mine boolean default false,p_offset integer default 0,p_limit integer default 20)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.list_items(p_query,p_category,p_region,p_mine,p_offset,p_limit);
$$;
create function public.get_restaurant_recommendation(p_id uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.get_item(p_id);
$$;
create function public.save_restaurant_recommendation(p_id uuid,p_request_id uuid,p_name text,p_category text,p_region text,p_address text,p_menu text,p_reason text,p_photos text[],p_expected_updated_at timestamptz default null)
returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.save_item(p_id,p_request_id,p_name,p_category,p_region,p_address,p_menu,p_reason,p_photos,p_expected_updated_at);
$$;
create function public.delete_restaurant_recommendation(p_id uuid,p_expected_updated_at timestamptz default null)
returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.delete_item(p_id,p_expected_updated_at);
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('restaurant-recommendations','restaurant-recommendations',false,5242880,array['image/jpeg']);

create function ojjuda_restaurants_internal.photo_upload_allowed(p_path text,p_owner text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and ojjuda_restaurants_internal.member_allowed()
  and ojjuda_restaurants_internal.photo_path_valid(p_path)
  and p_owner=auth.uid()::text and split_part(p_path,'/',1)=auth.uid()::text
  and not exists(select 1 from ojjuda_restaurants_internal.deleted_recommendations where id::text=split_part(p_path,'/',2))
  and not exists(select 1 from ojjuda_restaurants_internal.recommendations where id::text=split_part(p_path,'/',2) and owner_id<>auth.uid());
$$;

create function ojjuda_restaurants_internal.photo_read_allowed(p_path text,p_owner text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
declare u uuid := auth.uid();
begin
 if u is null or not ojjuda_restaurants_internal.member_allowed()
  or not ojjuda_restaurants_internal.photo_path_valid(p_path)
  or p_owner is distinct from split_part(p_path,'/',1) then return false; end if;
 if p_owner=u::text then return true; end if;
 return exists(select 1 from ojjuda_restaurants_internal.recommendations r
  where r.id=split_part(p_path,'/',2)::uuid and r.owner_id::text=p_owner
   and p_path=any(r.photos) and ojjuda_restaurants_internal.author_visible(r.owner_id));
end;
$$;

create function ojjuda_restaurants_internal.photo_delete_allowed(p_path text,p_owner text)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog as $$
declare u uuid := auth.uid();
begin
 if u is null or p_owner is distinct from u::text
  or not ojjuda_restaurants_internal.photo_path_valid(p_path)
  or split_part(p_path,'/',1)<>u::text then return false; end if;
 perform pg_advisory_xact_lock(127247341,hashtext(u::text));
 perform pg_advisory_xact_lock(127247342,hashtext(split_part(p_path,'/',2)));
 -- Volatile PL/pgSQL obtains a fresh snapshot after the lock, so a concurrent
 -- save cannot commit a reference between this check and Storage's DELETE.
 if not exists(select 1 from auth.users where id=u and is_anonymous is not true and deleted_at is null) then return false; end if;
 -- Explicitly prepared account withdrawal hides its posts before photo cleanup.
 if ojjuda_account_deletion.pending() then return true; end if;
 if not ojjuda_restaurants_internal.member_allowed() then return false; end if;
 return not exists(select 1 from ojjuda_restaurants_internal.recommendations r
  where r.id=split_part(p_path,'/',2)::uuid and p_path=any(r.photos));
end;
$$;

create function ojjuda_restaurants_internal.photo_select_allowed(p_path text,p_owner text)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then return false; end if;
 if storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated']) then
  return ojjuda_restaurants_internal.photo_read_allowed(p_path,p_owner); end if;
 if storage.allow_any_operation(array['object.delete','object.delete_many']) then
  return ojjuda_restaurants_internal.photo_delete_allowed(p_path,p_owner); end if;
 return false;
end;
$$;

-- Restrictive bucket-scoped guards prevent permissive legacy policies from
-- admitting another member's drafts, signing URLs, replacing or removing a photo.
create policy restaurant_files_insert on storage.objects for insert to authenticated
 with check(bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_upload_allowed(name,owner_id)
  and (owner is null or owner=(select auth.uid())));
create policy restaurant_files_insert_guard on storage.objects as restrictive for insert to authenticated
 with check(case when bucket_id='restaurant-recommendations' then ojjuda_restaurants_internal.photo_upload_allowed(name,owner_id)
  and (owner is null or owner=(select auth.uid())) else true end);
create policy restaurant_files_select on storage.objects for select to authenticated
 using(bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_select_allowed(name,owner_id));
create policy restaurant_files_select_guard on storage.objects as restrictive for select to authenticated
 using(case when bucket_id='restaurant-recommendations' then ojjuda_restaurants_internal.photo_select_allowed(name,owner_id) else true end);
create policy restaurant_files_delete on storage.objects for delete to authenticated
 using(bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_delete_allowed(name,owner_id)
  and (owner is null or owner=(select auth.uid())));
create policy restaurant_files_delete_guard on storage.objects as restrictive for delete to authenticated
 using(case when bucket_id='restaurant-recommendations' then ojjuda_restaurants_internal.photo_delete_allowed(name,owner_id)
  and (owner is null or owner=(select auth.uid())) else true end);
create policy restaurant_files_no_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'restaurant-recommendations') with check(bucket_id<>'restaurant-recommendations');
create policy restaurant_files_no_anon on storage.objects as restrictive for all to anon
 using(bucket_id<>'restaurant-recommendations') with check(bucket_id<>'restaurant-recommendations');

-- Narrow account-withdrawal integration. Existing logic/search_path/grants stay
-- intact; add only this bucket with exact owner + UUID-path validation.
-- Production pg_get_functiondef MD5 observed 2026-11-03:
-- assert_paths(uuid): 22ec5a4f0a64730d747d4c24d8d885fc
-- files(uuid,integer): f42224bd3be1819050fb6f9492b12acd
create or replace function ojjuda_account_deletion.assert_paths(u uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if exists(
  select 1 from storage.objects o
  where (o.owner_id=u::text or o.owner=u
   or (o.bucket_id in ('media','note-card-photos','note-event-photos','restaurant-recommendations') and split_part(o.name,'/',1)=u::text))
   and not coalesce(
    (o.bucket_id in ('media','note-card-photos','note-event-photos')
     or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text))
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
  raise exception 'account_deletion_not_prepared' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_limit' using errcode='22023'; end if;
 perform ojjuda_account_deletion.assert_paths(u);
 return query select o.bucket_id::text,o.name::text from storage.objects o
  where (o.bucket_id in ('media','note-card-photos','note-event-photos')
   or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text))
   and split_part(o.name,'/',1)=u::text
   and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
   and (o.owner is null or o.owner=u)
  order by o.bucket_id,o.name limit p_limit;
end;
$$;

revoke all on all functions in schema ojjuda_restaurants_internal from public,anon,authenticated;
grant execute on function ojjuda_restaurants_internal.list_items(text,text,text,boolean,integer,integer),
 ojjuda_restaurants_internal.get_item(uuid),
 ojjuda_restaurants_internal.save_item(uuid,uuid,text,text,text,text,text,text,text[],timestamptz),
 ojjuda_restaurants_internal.delete_item(uuid,timestamptz),
 ojjuda_restaurants_internal.photo_upload_allowed(text,text),
 ojjuda_restaurants_internal.photo_select_allowed(text,text),
 ojjuda_restaurants_internal.photo_delete_allowed(text,text) to authenticated;
revoke all on function public.list_restaurant_recommendations(text,text,text,boolean,integer,integer),
 public.get_restaurant_recommendation(uuid),
 public.save_restaurant_recommendation(uuid,uuid,text,text,text,text,text,text,text[],timestamptz),
 public.delete_restaurant_recommendation(uuid,timestamptz) from public,anon;
grant execute on function public.list_restaurant_recommendations(text,text,text,boolean,integer,integer),
 public.get_restaurant_recommendation(uuid),
 public.save_restaurant_recommendation(uuid,uuid,text,text,text,text,text,text,text[],timestamptz),
 public.delete_restaurant_recommendation(uuid,timestamptz) to authenticated;

notify pgrst,'reload schema';
