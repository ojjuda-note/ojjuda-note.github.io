-- Reuse the existing validated manifest editor within one transaction.
-- Cached eight-argument clients keep their current behavior and preserve links.
create function ojjuda_comics_internal.save_edit(
 p_id uuid,p_revision bigint,p_title text,p_description text,
 p_series_title text,p_series_order integer,p_pages jsonb,p_request_id uuid,p_next_id uuid
) returns bigint language plpgsql security definer set search_path='' as $$
declare book public.creative_comics%rowtype; payload jsonb; receipt record; next_revision bigint;
begin
 if auth.uid() is null or not ojjuda_comics_internal.can_read() or not public.is_admin() then
  raise exception 'comic_admin_required' using errcode='42501';end if;
 select * into book from public.creative_comics where id=p_id for update;
 if not found then raise exception 'comic_not_found' using errcode='P0002';end if;
 if p_request_id is null then raise exception 'request_id_required' using errcode='22023';end if;
 payload=jsonb_build_array(p_revision,p_title,p_description,p_series_title,p_series_order,p_pages,p_request_id,p_next_id);
 select * into receipt from ojjuda_comics_internal.revisions where request_id=p_request_id;
 if found then
  if receipt.comic_id<>p_id or receipt.request_payload<>payload then raise exception 'request_mismatch' using errcode='22023';end if;
  return receipt.revision+2;
 end if;
 if p_revision is null or book.revision<>p_revision then raise exception 'comic_edit_conflict' using errcode='40001';end if;
 if p_next_id=p_id or (p_next_id is not null and not exists(select 1 from public.creative_comics where id=p_next_id)) then
  raise exception 'invalid_next_comic' using errcode='22023';end if;
 perform ojjuda_comics_internal.save_edit(p_id,p_revision,p_title,p_description,p_series_title,p_series_order,p_pages,p_request_id);
 -- Both updates use the existing revision trigger; replay returns the committed revision.
 update public.creative_comics set next_comic_id=p_next_id where id=p_id returning revision into next_revision;
 update ojjuda_comics_internal.revisions set request_payload=payload where request_id=p_request_id;
 return next_revision;
end;$$;
revoke all on function ojjuda_comics_internal.save_edit(uuid,bigint,text,text,text,integer,jsonb,uuid,uuid) from public,anon;
grant execute on function ojjuda_comics_internal.save_edit(uuid,bigint,text,text,text,integer,jsonb,uuid,uuid) to authenticated;
create function public.comics_save_edit(p_id uuid,p_revision bigint,p_title text,p_description text,
 p_series_title text,p_series_order integer,p_pages jsonb,p_request_id uuid,p_next_id uuid) returns bigint
language sql security invoker set search_path='' as $$
 select ojjuda_comics_internal.save_edit(p_id,p_revision,p_title,p_description,p_series_title,p_series_order,p_pages,p_request_id,p_next_id);
$$;
revoke all on function public.comics_save_edit(uuid,bigint,text,text,text,integer,jsonb,uuid,uuid) from public,anon;
grant execute on function public.comics_save_edit(uuid,bigint,text,text,text,integer,jsonb,uuid,uuid) to authenticated;
