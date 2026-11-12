create table public.fanpage_pages (
  artist_id text primary key check (artist_id ~ '^[a-z0-9][a-z0-9-]{0,63}$' and artist_id not in ('constructor','prototype')),
  sections jsonb not null default '{}' check (jsonb_typeof(sections) = 'object' and octet_length(sections::text) <= 2000000)
);
create table public.fanpage_managers (
  artist_id text primary key references public.fanpage_pages on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade
);
create index fanpage_managers_by_member on public.fanpage_managers(member_id);
alter table public.fanpage_pages enable row level security;
alter table public.fanpage_managers enable row level security;
revoke all on public.fanpage_pages, public.fanpage_managers from public, anon, authenticated;
grant select on public.fanpage_pages to anon, authenticated;
grant insert (artist_id, sections), update (sections) on public.fanpage_pages to authenticated;
grant select, insert, update (member_id), delete on public.fanpage_managers to authenticated;
create policy fanpage_read on public.fanpage_pages for select using (true);
create policy fanpage_create on public.fanpage_pages for insert to authenticated
  with check ((select public.is_admin()) and not (select public.is_banned(auth.uid())));
create policy fanpage_manager_lookup on public.fanpage_managers for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
create policy fanpage_manager_admin on public.fanpage_managers for all to authenticated
  using ((select public.is_admin()) and not (select public.is_banned(auth.uid())))
  with check ((select public.is_admin()) and not (select public.is_banned(auth.uid())));

create function public.can_edit_fanpage(p_artist text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and not public.is_banned(auth.uid()) and
    (public.is_admin() or exists (select 1 from public.fanpage_managers m where m.artist_id = p_artist and m.member_id = auth.uid()));
$$;
revoke all on function public.can_edit_fanpage(text) from public, anon;
grant execute on function public.can_edit_fanpage(text) to authenticated;
create policy fanpage_edit on public.fanpage_pages for update to authenticated
  using (public.can_edit_fanpage(artist_id)) with check (public.can_edit_fanpage(artist_id));

-- Compare one section at a time. Concurrent edits to other sections can proceed.
create function public.save_fanpage_section(p_artist text, p_section text, p_expected jsonb, p_value jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.can_edit_fanpage(p_artist) then raise insufficient_privilege; end if;
  if p_section not in ('identity','profile','members','photos','videos','music','merch','appearances','schedules','news','campaigns','links','awards','records','sources')
    or p_section is null or p_value is null then raise invalid_parameter_value; end if;
  update public.fanpage_pages set sections = jsonb_set(sections, array[p_section], p_value)
    where artist_id=p_artist and (sections -> p_section) is not distinct from p_expected;
  if not found then raise exception 'fanpage_conflict' using errcode='40001'; end if;
end;
$$;

create function public.create_fanpage(p_artist text, p_name text, p_category text, p_manager uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then raise insufficient_privilege; end if;
  if nullif(trim(p_name),'') is null or length(trim(p_name)) > 120 or p_category not in ('girl','boy','mixed') or p_category is null then raise invalid_parameter_value; end if;
  insert into public.fanpage_pages(artist_id,sections) values (p_artist,jsonb_build_object('identity',jsonb_build_object('name',trim(p_name),'korean',trim(p_name),'category',p_category)));
  if p_manager is not null then
    insert into public.fanpage_managers(artist_id,member_id) values (p_artist,p_manager);
  end if;
end;
$$;
revoke all on function public.save_fanpage_section(text,text,jsonb,jsonb), public.create_fanpage(text,text,text,uuid) from public, anon;
grant execute on function public.save_fanpage_section(text,text,jsonb,jsonb), public.create_fanpage(text,text,text,uuid) to authenticated;

insert into public.fanpage_pages(artist_id)
select unnest(array['rescene','ive','aespa','lesserafim','twice','illit','a2omay','a2olite','a2osoul','nmixx','babymonster','hearts2hearts','kissoflife','kiiikiii','blackpink','stayc','idle','bts','seventeen','straykids','txt','enhypen','riize','boynextdoor','tws','nctdream','ateez','treasure','nctwish','andteam']);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('fanpage-media','fanpage-media',true,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']);
create policy fanpage_media_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'fanpage-media' and owner_id = (select auth.uid())::text
  and name ~ '^[a-z0-9-]+/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$'
  and public.can_edit_fanpage(split_part(name,'/',1))
  and exists (select 1 from public.fanpage_pages p where p.artist_id=split_part(name,'/',1))
);

create function public.assign_fanpage_manager(p_artist text, p_manager uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() or public.is_banned(auth.uid()) then raise insufficient_privilege; end if;
  if p_manager is null then
    delete from public.fanpage_managers where artist_id=p_artist;
  else
    insert into public.fanpage_managers(artist_id,member_id) values (p_artist,p_manager)
    on conflict (artist_id) do update set member_id=excluded.member_id;
  end if;
end;
$$;
revoke all on function public.assign_fanpage_manager(text,uuid) from public, anon;
grant execute on function public.assign_fanpage_manager(text,uuid) to authenticated;
