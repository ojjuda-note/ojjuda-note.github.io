alter table public.creative_comics
 add column revision bigint not null default 0,
 add column series_title text not null default '' check(char_length(series_title)<=120),
 add column series_order integer not null default 1 check(series_order between 1 and 9999);

create function ojjuda_comics_internal.bump_revision() returns trigger
language plpgsql set search_path='' as $$
begin new.revision=old.revision+1;return new;end;$$;
revoke all on function ojjuda_comics_internal.bump_revision() from public,anon,authenticated;
create trigger comic_revision before update on public.creative_comics
 for each row execute function ojjuda_comics_internal.bump_revision();

-- Preserve the prior manifest and untouched original bytes on each saved edit.
create table ojjuda_comics_internal.revisions(
 comic_id uuid not null references public.creative_comics(id) on delete cascade,
 revision bigint not null, snapshot jsonb not null, request_id uuid not null unique, request_payload jsonb not null,
 saved_at timestamptz not null default now(), primary key(comic_id,revision)
);
alter table ojjuda_comics_internal.revisions enable row level security;
revoke all on ojjuda_comics_internal.revisions from public,anon,authenticated;

-- An adult administrator may stage new unique originals while the old edition
-- remains readable. Readers cannot access staged files without page membership.
alter policy comic_files_insert on storage.objects
 with check(bucket_id='creative-comics' and (select ojjuda_comics_internal.can_read())
  and (select public.is_admin()) and split_part(name,'/',1)=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
  and exists(select 1 from public.creative_comics c where c.id::text=split_part(name,'/',2)));

create function ojjuda_comics_internal.save_edit(
 p_id uuid,p_revision bigint,p_title text,p_description text,
 p_series_title text,p_series_order integer,p_pages jsonb,p_request_id uuid
) returns bigint language plpgsql security definer set search_path='' as $$
declare book public.creative_comics%rowtype; oldpage public.creative_comic_pages%rowtype;
 payload jsonb; receipt record; item jsonb; next_pages jsonb='[]'; n integer; newpath text; next_revision bigint;
begin
 if auth.uid() is null or not ojjuda_comics_internal.can_read() or not public.is_admin() then
  raise exception 'comic_admin_required' using errcode='42501';end if;
 select * into book from public.creative_comics where id=p_id for update;
 if not found then raise exception 'comic_not_found' using errcode='P0002';end if;
 payload=jsonb_build_array(p_revision,p_title,p_description,p_series_title,p_series_order,p_pages,p_request_id);
 if p_request_id is null then raise exception 'request_id_required' using errcode='22023';end if;
 select * into receipt from ojjuda_comics_internal.revisions where request_id=p_request_id;
 if found then
  if receipt.comic_id<>p_id or receipt.request_payload<>payload then raise exception 'request_mismatch' using errcode='22023';end if;
  return receipt.revision+1;
 end if;
 if p_revision is null or book.revision<>p_revision then
  raise exception 'comic_edit_conflict' using errcode='40001';end if;
 if p_title is null or char_length(btrim(p_title)) not between 1 and 120
  or p_description is null or char_length(p_description)>1000
  or p_series_title is null or char_length(btrim(p_series_title))>120
  or p_series_order is null or p_series_order not between 1 and 9999
  or p_pages is null or jsonb_typeof(p_pages)<>'array' then
  raise exception 'invalid_comic_edit' using errcode='22023';end if;
 n=jsonb_array_length(p_pages);
 if n not between 1 and 500 then raise exception 'invalid_page_count' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_pages) loop
  if item ? 'id' then
   select * into oldpage from public.creative_comic_pages where id=(item->>'id')::uuid and comic_id=p_id;
   if not found then raise exception 'invalid_existing_page' using errcode='22023';end if;
   next_pages=next_pages||jsonb_build_array(to_jsonb(oldpage));
  else
   newpath=item->>'path';
   if newpath is null or split_part(newpath,'/',1)<>auth.uid()::text or split_part(newpath,'/',2)<>p_id::text
    or newpath !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
    or not exists(select 1 from storage.objects where bucket_id='creative-comics' and name=newpath)
    or exists(select 1 from public.creative_comic_pages where path=newpath) then
    raise exception 'invalid_uploaded_page' using errcode='22023';end if;
   next_pages=next_pages||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),
    'path',newpath,'filename',item->>'filename','width',(item->>'width')::integer,'height',(item->>'height')::integer));
  end if;
 end loop;
 insert into ojjuda_comics_internal.revisions(comic_id,revision,request_id,request_payload,snapshot)
 values(p_id,book.revision,p_request_id,payload,jsonb_build_object('book',to_jsonb(book),'pages',
  coalesce((select jsonb_agg(to_jsonb(p) order by position) from public.creative_comic_pages p where comic_id=p_id),'[]'::jsonb)));
 delete from public.creative_comic_pages where comic_id=p_id;
 insert into public.creative_comic_pages(id,comic_id,position,filename,path,width,height)
 select (value->>'id')::uuid,p_id,ordinality::integer,value->>'filename',value->>'path',
  (value->>'width')::integer,(value->>'height')::integer
 from jsonb_array_elements(next_pages) with ordinality;
 update public.creative_comics set title=btrim(p_title),description=p_description,
  series_title=btrim(p_series_title),series_order=p_series_order where id=p_id returning revision into next_revision;
 return next_revision;
end;$$;
revoke all on function ojjuda_comics_internal.save_edit(uuid,bigint,text,text,text,integer,jsonb,uuid) from public,anon;
grant execute on function ojjuda_comics_internal.save_edit(uuid,bigint,text,text,text,integer,jsonb,uuid) to authenticated;
create function public.comics_save_edit(p_id uuid,p_revision bigint,p_title text,p_description text,
 p_series_title text,p_series_order integer,p_pages jsonb,p_request_id uuid) returns bigint
language sql security invoker set search_path='' as $$
 select ojjuda_comics_internal.save_edit(p_id,p_revision,p_title,p_description,p_series_title,p_series_order,p_pages,p_request_id);
$$;
revoke all on function public.comics_save_edit(uuid,bigint,text,text,text,integer,jsonb,uuid) from public,anon;
grant execute on function public.comics_save_edit(uuid,bigint,text,text,text,integer,jsonb,uuid) to authenticated;
