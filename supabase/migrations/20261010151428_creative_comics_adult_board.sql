-- Creative comics use the immutable membership birth date, never JWT user_metadata.
create schema ojjuda_comics_internal;
revoke all on schema ojjuda_comics_internal from public;
grant usage on schema ojjuda_comics_internal to authenticated;
create function ojjuda_comics_internal.can_read() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from ojjuda_account_internal.member_identity m join auth.users u on u.id=m.user_id
  where m.user_id=auth.uid() and u.is_anonymous is not true
   and ojjuda_account_internal.age_on(m.birth_date,(now() at time zone 'Asia/Seoul')::date)>=19
 ) and not coalesce(public.is_banned(auth.uid()),false);
$$;
revoke all on function ojjuda_comics_internal.can_read() from public,anon;
grant execute on function ojjuda_comics_internal.can_read() to authenticated;
create function public.comics_access() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('allowed',ojjuda_comics_internal.can_read(),
  'admin',ojjuda_comics_internal.can_read() and public.is_admin());
$$;
revoke all on function public.comics_access() from public,anon;
grant execute on function public.comics_access() to authenticated;

create table public.creative_comics(
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(btrim(title)) between 1 and 120),
 description text not null default '' check(char_length(description)<=1000),
 published boolean not null default false,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create table public.creative_comic_pages(
 id uuid primary key default gen_random_uuid(),
 comic_id uuid not null references public.creative_comics(id) on delete cascade,
 position integer not null check(position between 1 and 500),
 filename text not null check(char_length(filename) between 1 and 255),
 path text not null unique,
 width integer not null check(width between 1 and 40000),
 height integer not null check(height between 1 and 40000),
 unique(comic_id,position),
 check(split_part(path,'/',2)=comic_id::text),
 check(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$')
);
create index creative_comics_published on public.creative_comics(published,created_at desc);
alter table public.creative_comics enable row level security;
alter table public.creative_comic_pages enable row level security;
revoke all on public.creative_comics,public.creative_comic_pages from anon,authenticated;
grant select,delete on public.creative_comics,public.creative_comic_pages to authenticated;
grant insert(id,title,description) on public.creative_comics to authenticated;
grant update(title,description,published) on public.creative_comics to authenticated;
grant insert(id,comic_id,position,filename,path,width,height) on public.creative_comic_pages to authenticated;
create policy comics_read on public.creative_comics for select to authenticated
 using((select ojjuda_comics_internal.can_read()) and (published or (select public.is_admin())));
create policy comics_create on public.creative_comics for insert to authenticated
 with check((select ojjuda_comics_internal.can_read()) and (select public.is_admin()) and created_by=(select auth.uid()) and not published);
create policy comics_edit on public.creative_comics for update to authenticated
 using((select ojjuda_comics_internal.can_read()) and (select public.is_admin()))
 with check((select ojjuda_comics_internal.can_read()) and (select public.is_admin()));
create policy comics_delete on public.creative_comics for delete to authenticated
 using((select ojjuda_comics_internal.can_read()) and (select public.is_admin()));
create policy comic_pages_read on public.creative_comic_pages for select to authenticated
 using((select ojjuda_comics_internal.can_read()) and exists(select 1 from public.creative_comics c where c.id=comic_id));
create policy comic_pages_create on public.creative_comic_pages for insert to authenticated
 with check((select ojjuda_comics_internal.can_read()) and (select public.is_admin())
  and split_part(path,'/',1)=(select auth.uid())::text
  and exists(select 1 from public.creative_comics c where c.id=comic_id and not c.published));
create policy comic_pages_delete on public.creative_comic_pages for delete to authenticated
 using((select ojjuda_comics_internal.can_read()) and (select public.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('creative-comics','creative-comics',false,20971520,array['image/png','image/jpeg','image/webp']);
-- No signed bearer URLs: each download must pass the viewer's current session/RLS.
create policy comic_files_read on storage.objects for select to authenticated
 using(bucket_id='creative-comics' and (select ojjuda_comics_internal.can_read())
  and ((select public.is_admin()) or exists(select 1 from public.creative_comic_pages p where p.path=name)));
create policy comic_files_session_only on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'creative-comics' or ((select ojjuda_comics_internal.can_read())
  and storage.allow_any_operation(array['object.get_authenticated','object.delete','object.delete_many'])
  and ((select public.is_admin()) or exists(select 1 from public.creative_comic_pages p where p.path=name))));
create policy comic_files_insert on storage.objects for insert to authenticated
 with check(bucket_id='creative-comics' and (select ojjuda_comics_internal.can_read()) and (select public.is_admin())
  and split_part(name,'/',1)=(select auth.uid())::text
  and exists(select 1 from public.creative_comics c where c.id::text=split_part(name,'/',2) and not c.published));
create policy comic_files_delete on storage.objects for delete to authenticated
 using(bucket_id='creative-comics' and (select ojjuda_comics_internal.can_read()) and (select public.is_admin()));
create policy comic_files_no_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'creative-comics') with check(bucket_id<>'creative-comics');

create function ojjuda_comics_internal.validate_publish() returns trigger
language plpgsql security definer set search_path='' as $$
declare n integer; last_page integer;
begin
 if auth.uid() is null or not ojjuda_comics_internal.can_read() or not public.is_admin() then
  raise exception 'comic_admin_required' using errcode='42501'; end if;
 if new.published and not old.published then
  select count(*),max(position) into n,last_page from public.creative_comic_pages where comic_id=new.id;
  if n=0 or n<>last_page or exists(select 1 from public.creative_comic_pages p where p.comic_id=new.id
   and not exists(select 1 from storage.objects o where o.bucket_id='creative-comics' and o.name=p.path))
   then raise exception 'comic_pages_incomplete' using errcode='23514'; end if;
 end if;return new;
end;$$;
revoke all on function ojjuda_comics_internal.validate_publish() from public,anon,authenticated;
create trigger creative_comics_publish_check before update on public.creative_comics
 for each row execute function ojjuda_comics_internal.validate_publish();
