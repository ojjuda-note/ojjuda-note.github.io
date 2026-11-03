-- Widen the member recommendation photo count from 3–9 to 1–12.
-- The table CHECK calls photo_paths_valid, so it uses the same updated bounds.
-- Existing 3–9-photo rows remain valid and are not rewritten.
-- CREATE OR REPLACE preserves existing owners/ACLs; all member, ownership,
-- actual Storage-object, JPEG, size, locking and idempotency checks stay intact.

create or replace function ojjuda_restaurants_internal.photo_paths_valid(p_paths text[],p_owner uuid,p_id uuid)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(array_ndims(p_paths)=1 and array_lower(p_paths,1)=1
  and cardinality(p_paths) between 1 and 12
  and cardinality(p_paths)=(select count(distinct path) from unnest(p_paths) path)
  and not exists(select 1 from unnest(p_paths) path
   where not ojjuda_restaurants_internal.photo_path_valid(path)
    or split_part(path,'/',1) is distinct from p_owner::text
    or split_part(path,'/',2) is distinct from p_id::text),false);
$$;

create or replace function ojjuda_restaurants_internal.save_item(p_id uuid,p_request_id uuid,p_name text,p_category text,p_region text,p_address text,p_menu text,p_reason text,p_photos text[],p_expected_updated_at timestamptz)
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
 if p_photos is null or cardinality(p_photos) not between 1 and 12 then
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
