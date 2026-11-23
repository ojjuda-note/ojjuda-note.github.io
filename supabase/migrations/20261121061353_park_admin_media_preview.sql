-- Administrators can inspect uploaded Park attachments on current, hidden and
-- retained archived cards. Ordinary member visibility and all upload/delete
-- policies remain unchanged. Never expose unlinked uploads or retired bytes.
create function ojjuda_note_internal.admin_card_media_signable(p_bucket_id text,p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $function$
begin
  if auth.uid() is null or ojjuda_note_internal.is_note_moderator() is distinct from true
    or p_path is null or p_bucket_id is null then return false; end if;
  if ojjuda_note_internal.note_photo_tombstoned(p_bucket_id,p_path) then return false; end if;

  if p_bucket_id='note-card-photos' then
    return exists(
      select 1 from ojjuda_note_internal.card_photos p
      join ojjuda_note.cards c on c.id=p.card_id
      where p.photo_path=p_path and c.kind in ('memo','comment')
        and (c.archived_at is null or c.purge_after>statement_timestamp())
    );
  elsif p_bucket_id='note-card-videos' then
    return exists(
      select 1 from ojjuda_note_internal.card_video_uploads v
      join ojjuda_note_internal.card_photos p
        on p.photo_path=v.photo_path and p.author_id=v.author_id
      join ojjuda_note.cards c on c.id=p.card_id
      where v.video_path=p_path and c.kind in ('memo','comment')
        and (c.archived_at is null or c.purge_after>statement_timestamp())
        and not ojjuda_note_internal.note_photo_tombstoned('note-card-photos',p.photo_path)
    );
  elsif p_bucket_id='note-event-photos' then
    return exists(
      select 1 from ojjuda_note_internal.event_ads e
      join ojjuda_note.cards c on c.id=e.card_id
      where e.photo_path=p_path and c.kind='event'
        and (c.archived_at is null or c.purge_after>statement_timestamp())
    );
  end if;
  return false;
end;
$function$;

create function ojjuda_note_internal.admin_card_media_paths(p_ids uuid[])
returns table(card_id uuid,photo_bucket text,photo_path text,video_bucket text,
  video_path text,duration double precision,width integer,height integer)
language plpgsql stable security definer set search_path='' as $function$
begin
  if auth.uid() is null or ojjuda_note_internal.is_note_moderator() is distinct from true then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if coalesce(cardinality(p_ids),0)>100 then
    raise exception 'Invalid media page' using errcode='22023';
  end if;
  return query
    select p.card_id,'note-card-photos'::text,p.photo_path,
      case when v.video_path is not null then 'note-card-videos'::text end,
      v.video_path,v.duration,v.width,v.height
    from ojjuda_note_internal.card_photos p
    left join ojjuda_note_internal.card_video_uploads v on v.photo_path=p.photo_path and v.author_id=p.author_id
      and ojjuda_note_internal.admin_card_media_signable('note-card-videos',v.video_path)
    where p.card_id=any(coalesce(p_ids,'{}'::uuid[]))
      and ojjuda_note_internal.admin_card_media_signable('note-card-photos',p.photo_path)
    union all
    select e.card_id,'note-event-photos'::text,e.photo_path,
      null::text,null::text,null::double precision,null::integer,null::integer
    from ojjuda_note_internal.event_ads e
    where e.card_id=any(coalesce(p_ids,'{}'::uuid[]))
      and ojjuda_note_internal.admin_card_media_signable('note-event-photos',e.photo_path);
end;
$function$;

-- The API facade does not gain table-owner privileges. The private functions
-- above enforce the same app_admins identity check as existing Park moderation.
create function ojjuda_note.admin_card_media_paths(p_ids uuid[])
returns table(card_id uuid,photo_bucket text,photo_path text,video_bucket text,
  video_path text,duration double precision,width integer,height integer)
language sql stable security invoker set search_path='' as $function$
  select * from ojjuda_note_internal.admin_card_media_paths(p_ids);
$function$;

revoke all on function ojjuda_note_internal.admin_card_media_signable(text,text),
  ojjuda_note_internal.admin_card_media_paths(uuid[]),ojjuda_note.admin_card_media_paths(uuid[])
  from public,anon,authenticated,service_role;
grant execute on function ojjuda_note_internal.admin_card_media_signable(text,text),
  ojjuda_note_internal.admin_card_media_paths(uuid[]),ojjuda_note.admin_card_media_paths(uuid[])
  to authenticated;

-- Signed URL creation only: no bucket listing, mutation, owner impersonation or
-- general authenticated download permission is added by this policy.
create policy note_media_admin_sign on storage.objects for select to authenticated
using (bucket_id in ('note-card-photos','note-card-videos','note-event-photos')
  and storage.allow_any_operation(array['object.sign','object.sign_many'])
  and ojjuda_note_internal.admin_card_media_signable(bucket_id,name));

notify pgrst, 'reload schema';
