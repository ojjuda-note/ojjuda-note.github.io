-- Private group thumbnails are immutable sidecars of already-authorized images.
-- Never expose the bucket or create signed URLs; an entry must reference the
-- original image before any member or admin can read its thumbnail.

create or replace function ojjuda_groups_internal.path_valid(p text)
returns boolean language sql immutable set search_path='' as $$
 select p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}([.](jpg|png|webp|gif|avif|mp4|webm|mov|m4v)|[.]thumb[.]webp)$';
$$;

create or replace function ojjuda_groups_internal.file_access(p text, op text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();r uuid;own boolean;linked boolean;
begin
 if u is null or not ojjuda_groups_internal.path_valid(p) then return false; end if;
 r:=split_part(p,'/',2)::uuid;
 own:=split_part(p,'/',1)=u::text;
 select exists(
  select 1 from ojjuda_groups_internal.entries e
  where e.id=split_part(p,'/',3)::uuid and e.room_id=r
   and (e.media @> jsonb_build_array(jsonb_build_object('path',p))
     or e.media @> jsonb_build_array(jsonb_build_object('preview_path',p)))
 ) into linked;
 if op='delete' then
  return (own and (not linked or ojjuda_account_deletion.pending()))
   or (ojjuda_groups_internal.allowed() and exists(
    select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u and deleting));
 end if;
 if op='read' and linked and ojjuda_groups_internal.allowed() and public.is_admin() then return true; end if;
 if not ojjuda_groups_internal.member(r) then return false; end if;
 if op='upload' then return own; end if;
 return linked;
end;
$$;

create function ojjuda_groups_internal.attach_media_previews()
returns trigger language plpgsql security definer set search_path='' as $$
declare f jsonb;media jsonb:='[]'::jsonb;preview text;
begin
 for f in select value from jsonb_array_elements(new.media) loop
  f:=f-'preview_path';
  if coalesce(f->>'mime','') in ('image/jpeg','image/png','image/webp','image/gif','image/avif') then
   preview:=regexp_replace(f->>'path','[.](jpg|png|webp|gif|avif)$','.thumb.webp');
   if preview is distinct from f->>'path' and exists(
    select 1 from storage.objects o where o.bucket_id='group-media'
      and o.name=preview and o.owner_id=new.author_id::text
      and (o.owner is null or o.owner=new.author_id)
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
revoke all on function ojjuda_groups_internal.attach_media_previews() from public,anon,authenticated;

create trigger group_entry_media_previews
before insert or update of media on ojjuda_groups_internal.entries
for each row execute function ojjuda_groups_internal.attach_media_previews();
