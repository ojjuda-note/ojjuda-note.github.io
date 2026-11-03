-- Keep the original save RPC and its cache-compatible signature. The new RPC
-- wraps the existing content/photo save in one transaction and adds a selected
-- map position without rewriting its ownership, retry or photo-cleanup rules.
alter table ojjuda_restaurants_internal.recommendations
 add column latitude double precision,
 add column longitude double precision,
 add constraint restaurant_recommendation_location_pair check(
  (latitude is null and longitude is null)
  or (latitude is not null and longitude is not null
   and latitude between -90 and 90 and longitude between -180 and 180)
 );

create or replace function ojjuda_restaurants_internal.item_json(p_item ojjuda_restaurants_internal.recommendations)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('id',p_item.id,'owner_id',p_item.owner_id,
  'name',p_item.name,'category',p_item.category,'region',p_item.region,
  'address',p_item.address,'menu',p_item.menu,'reason',p_item.reason,'photos',p_item.photos,
  'latitude',p_item.latitude,'longitude',p_item.longitude,
  'author_name',coalesce((select nullif(btrim(nickname),'') from public.profiles where id=p_item.owner_id),'회원'),
  'created_at',p_item.created_at,'updated_at',p_item.updated_at,'is_owner',p_item.owner_id=auth.uid(),
  'request_id',case when p_item.owner_id=auth.uid() then p_item.last_request_id else null end)
 where auth.uid() is not null;
$$;

create function ojjuda_restaurants_internal.save_item_with_location(
 p_id uuid,p_request_id uuid,p_name text,p_category text,p_region text,p_address text,
 p_menu text,p_reason text,p_photos text[],p_expected_updated_at timestamptz,p_location jsonb
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare u uuid := ojjuda_restaurants_internal.require_member(); previous ojjuda_restaurants_internal.recommendations;
 saved ojjuda_restaurants_internal.recommendations; result jsonb; retry boolean := false;
 next_latitude double precision; next_longitude double precision;
begin
 perform pg_advisory_xact_lock(127247341,hashtext(u::text));
 perform ojjuda_restaurants_internal.require_member();
 if p_id is null or p_request_id is null then
  raise exception 'recommendation_invalid_input' using errcode='22023';
 end if;
 -- SQL NULL/omission preserves the previous position. An explicit null pair
 -- clears it; JSON strings, partial pairs and unexpected fields are rejected.
 if p_location is not null then
  if jsonb_typeof(p_location) is distinct from 'object' then
   raise exception 'recommendation_location_invalid' using errcode='22023';
  end if;
  if not(p_location ?& array['latitude','longitude']) or p_location-'latitude'-'longitude'<>'{}'::jsonb then
   raise exception 'recommendation_location_invalid' using errcode='22023';
  end if;
  if p_location->'latitude'='null'::jsonb and p_location->'longitude'='null'::jsonb then
   next_latitude := null; next_longitude := null;
  elsif jsonb_typeof(p_location->'latitude')='number' and jsonb_typeof(p_location->'longitude')='number' then
   -- Check exact numeric bounds before converting to floating-point storage, so
   -- out-of-range values cannot become valid by rounding during conversion.
   if (p_location->>'latitude')::numeric not between -90 and 90
    or (p_location->>'longitude')::numeric not between -180 and 180 then
    raise exception 'recommendation_location_invalid' using errcode='22023';
   end if;
   next_latitude := (p_location->>'latitude')::double precision;
   next_longitude := (p_location->>'longitude')::double precision;
  else
   raise exception 'recommendation_location_invalid' using errcode='22023';
  end if;
 end if;
 -- Acquire the same post lock before checking the retry payload. save_item
 -- reacquires these transaction locks safely and retains all its own checks.
 perform pg_advisory_xact_lock(127247342,hashtext(p_id::text));
 select * into previous from ojjuda_restaurants_internal.recommendations where id=p_id for update;
 if found then
  if previous.owner_id<>u then raise exception 'recommendation_not_owner' using errcode='42501'; end if;
  retry := previous.last_request_id=p_request_id;
  if retry and p_location is not null
   and (previous.latitude,previous.longitude) is distinct from (next_latitude,next_longitude) then
   raise exception 'recommendation_request_conflict' using errcode='22023';
  end if;
 end if;
 result := ojjuda_restaurants_internal.save_item(p_id,p_request_id,p_name,p_category,p_region,
  p_address,p_menu,p_reason,p_photos,p_expected_updated_at);
 if not retry and p_location is not null then
  update ojjuda_restaurants_internal.recommendations set latitude=next_latitude,longitude=next_longitude
   where id=p_id and (latitude,longitude) is distinct from (next_latitude,next_longitude);
  -- The core already advanced updated_at once for this request. Keep that exact
  -- version and its removed_paths, replacing only the final item in the response.
  select * into saved from ojjuda_restaurants_internal.recommendations where id=p_id;
  result := jsonb_set(result,'{item}',ojjuda_restaurants_internal.item_json(saved));
 end if;
 return result;
end;
$$;

-- A distinct RPC name avoids overloaded PostgREST argument resolution. Old
-- clients keep using save_restaurant_recommendation and preserve both columns.
create function public.save_restaurant_recommendation_with_location(
 p_id uuid,p_request_id uuid,p_name text,p_category text,p_region text,p_address text,
 p_menu text,p_reason text,p_photos text[],p_expected_updated_at timestamptz default null,p_location jsonb default null
)
returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.save_item_with_location(p_id,p_request_id,p_name,p_category,p_region,
  p_address,p_menu,p_reason,p_photos,p_expected_updated_at,p_location);
$$;

revoke all on function ojjuda_restaurants_internal.save_item_with_location(uuid,uuid,text,text,text,text,text,text,text[],timestamptz,jsonb)
 from public,anon,authenticated;
grant execute on function ojjuda_restaurants_internal.save_item_with_location(uuid,uuid,text,text,text,text,text,text,text[],timestamptz,jsonb)
 to authenticated;
revoke all on function public.save_restaurant_recommendation_with_location(uuid,uuid,text,text,text,text,text,text,text[],timestamptz,jsonb)
 from public,anon,authenticated;
grant execute on function public.save_restaurant_recommendation_with_location(uuid,uuid,text,text,text,text,text,text,text[],timestamptz,jsonb)
 to authenticated;

notify pgrst,'reload schema';
