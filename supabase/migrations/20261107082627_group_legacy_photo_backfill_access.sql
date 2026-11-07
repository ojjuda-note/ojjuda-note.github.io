-- S3 maintenance uploads have no JWT subject, so their owner fields are NULL.
-- Only this exact private, image/webp, UUID-scoped sidecar is recognized.
-- This helper is also used by account deletion to avoid orphaning old previews.
create function ojjuda_groups_internal.service_generated_preview(o storage.objects, u uuid)
returns boolean language sql stable set search_path='' as $$
 select o.bucket_id='group-media'
  and ojjuda_groups_internal.path_valid(o.name)
  and split_part(o.name,'/',1)=u::text
  and o.name ~ '[.]thumb[.]webp$'
  and o.owner_id is null and o.owner is null
  and o.metadata->>'mimetype'='image/webp';
$$;
revoke all on function ojjuda_groups_internal.service_generated_preview(storage.objects,uuid) from public,anon,authenticated;

create or replace function ojjuda_groups_internal.attach_media_previews()
returns trigger language plpgsql security definer set search_path='' as $$
declare f jsonb;media jsonb:='[]'::jsonb;preview text;
begin
 for f in select value from jsonb_array_elements(new.media) loop
  f:=f-'preview_path';
  if coalesce(f->>'mime','') in ('image/jpeg','image/png','image/webp','image/gif','image/avif') then
   preview:=regexp_replace(f->>'path','[.](jpg|png|webp|gif|avif)$','.thumb.webp');
   if preview is distinct from f->>'path' and exists(
    select 1 from storage.objects o where o.bucket_id='group-media'
      and o.name=preview
      and ((o.owner_id=new.author_id::text and (o.owner is null or o.owner=new.author_id))
       or ojjuda_groups_internal.service_generated_preview(o,new.author_id))
      and o.metadata->>'mimetype'='image/webp'
      and coalesce((o.metadata->>'size')::bigint,0) between 1 and 1048576
   ) then
    f:=jsonb_set(f,'{preview_path}',to_jsonb(preview),true);
   end if;
  end if;
  media:=media||jsonb_build_array(f);
 end loop;
 new.media:=media;
 return new;
end;
$$;

create or replace function ojjuda_account_deletion.assert_paths(u uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if exists(
  select 1 from storage.objects o
  where (o.owner_id=u::text or o.owner=u
   or (o.bucket_id in ('media','note-card-photos','note-event-photos','restaurant-recommendations','group-media') and split_part(o.name,'/',1)=u::text))
   and not coalesce(
    ((o.bucket_id in ('media','note-card-photos','note-event-photos')
      or (o.bucket_id='group-media' and ojjuda_groups_internal.path_valid(o.name) and o.owner_id=u::text)
      or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text))
     and split_part(o.name,'/',1)=u::text
     and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
     and (o.owner is null or o.owner=u)
     and o.name !~ '(^|/)([.]|[.][.])(/|$)' and o.name !~ '//|/$' and position(chr(92) in o.name)=0)
    or ojjuda_groups_internal.service_generated_preview(o,u),
   false)
 ) then raise exception 'account_storage_manual_review' using errcode='P0001'; end if;
end;
$$;

create or replace function ojjuda_account_deletion.files(p_expected_user_id uuid,p_limit integer)
returns table(bucket_id text,photo_path text)
language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=ojjuda_account_deletion.check_owner(p_expected_user_id);
begin
 if not ojjuda_account_deletion.pending() then
  raise exception 'account_deletion_not_prepared' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_limit' using errcode='22023'; end if;
 perform ojjuda_account_deletion.assert_paths(u);
 return query select o.bucket_id::text,o.name::text from storage.objects o
  where ((o.bucket_id in ('media','note-card-photos','note-event-photos')
    or (o.bucket_id='group-media' and ojjuda_groups_internal.path_valid(o.name) and o.owner_id=u::text)
    or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text))
   and split_part(o.name,'/',1)=u::text
   and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
   and (o.owner is null or o.owner=u))
   or ojjuda_groups_internal.service_generated_preview(o,u)
  order by o.bucket_id,o.name limit p_limit;
end;
$$;
