-- Private group membership stays owner-only. Folder RLS resolves live membership
-- through a scoped helper in a schema that is not exposed by PostgREST.
create table public.house_friend_groups (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check (name = btrim(name) and char_length(name) between 1 and 20),
 members uuid[] not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,name),
 check (cardinality(members)<=500 and array_position(members,null) is null)
);
alter table public.house_friend_groups enable row level security;
revoke all on public.house_friend_groups from public,anon;
grant select,insert,update,delete on public.house_friend_groups to authenticated;
grant all on public.house_friend_groups to service_role;
create policy house_groups_read on public.house_friend_groups for select to authenticated using(user_id=(select auth.uid()));
create policy house_groups_insert on public.house_friend_groups for insert to authenticated with check(user_id=(select auth.uid()) and not public.is_banned((select auth.uid())));
create policy house_groups_update on public.house_friend_groups for update to authenticated using(user_id=(select auth.uid()) and not public.is_banned((select auth.uid()))) with check(user_id=(select auth.uid()) and not public.is_banned((select auth.uid())));
create policy house_groups_delete on public.house_friend_groups for delete to authenticated using(user_id=(select auth.uid()) and not public.is_banned((select auth.uid())));

create function public.house_friend_group_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id) then raise exception 'group_owner_immutable' using errcode='42501'; end if;
 if new.members is null or cardinality(new.members)>500 or array_position(new.members,null) is not null then raise exception 'invalid_group_members'; end if;
 if exists(select 1 from unnest(new.members) member where member=new.user_id or not public.is_friend(new.user_id,member)) then raise exception 'group_member_not_friend' using errcode='42501'; end if;
 new.name:=btrim(new.name);
 new.members:=array(select distinct member from unnest(new.members) member order by member);
 new.updated_at:=now();return new;
end;$$;
revoke all on function public.house_friend_group_guard() from public,anon;
create trigger house_friend_group_guard before insert or update on public.house_friend_groups for each row execute function public.house_friend_group_guard();

alter table public.media_folders add column allowed_groups uuid[] not null default '{}';
alter table public.media_folders add constraint media_folders_allowed_groups_valid check(cardinality(allowed_groups)<=100 and array_position(allowed_groups,null) is null);
create function public.house_folder_groups_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare group_id uuid;
begin
 if tg_op='UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id) then raise exception 'folder_owner_immutable' using errcode='42501'; end if;
 if new.visibility<>'chosen' then new.allowed_groups:='{}';return new;end if;
 if new.allowed_groups is null or cardinality(new.allowed_groups)>100 or array_position(new.allowed_groups,null) is not null then raise exception 'invalid_folder_groups';end if;
 foreach group_id in array new.allowed_groups loop
  perform 1 from public.house_friend_groups g where g.id=group_id and g.user_id=new.user_id for key share;
  if not found then raise exception 'folder_group_unavailable' using errcode='42501';end if;
 end loop;
 new.allowed_groups:=array(select distinct g from unnest(new.allowed_groups) g order by g);
 return new;
end;$$;
revoke all on function public.house_folder_groups_guard() from public,anon;
create trigger house_folder_groups_guard before insert or update on public.media_folders for each row execute function public.house_folder_groups_guard();

create schema if not exists ojjuda_house_internal;
revoke all on schema ojjuda_house_internal from public,anon;
grant usage on schema ojjuda_house_internal to authenticated,service_role;
-- Definer is necessary to read owner-only groups without exposing their names or
-- members, and to avoid recursive media_folders RLS. Never accept a foreign viewer.
create function ojjuda_house_internal.folder_visible(p_folder uuid,p_viewer uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not (coalesce(auth.uid()=p_viewer,false) or coalesce(nullif(pg_catalog.current_setting('role',true),'none'),session_user) in ('service_role','postgres','supabase_admin')) then raise exception 'helper_scope_denied' using errcode='42501';end if;
 return exists(select 1 from public.media_folders f where f.id=p_folder and
  (f.user_id=p_viewer or (public.door_open(f.user_id) and
   (f.visibility='all' or (f.visibility='friends' and public.is_friend(f.user_id,p_viewer))
    or (f.visibility='chosen' and public.is_friend(f.user_id,p_viewer) and
     (p_viewer=any(f.allowed) or exists(select 1 from public.house_friend_groups g where g.user_id=f.user_id and g.id=any(f.allowed_groups) and p_viewer=any(g.members))))))));
end;$$;
revoke all on function ojjuda_house_internal.folder_visible(uuid,uuid) from public,anon;
grant execute on function ojjuda_house_internal.folder_visible(uuid,uuid) to authenticated,service_role;
create or replace function public.folder_can_see(p_folder uuid,p_viewer uuid)
returns boolean language sql stable security invoker set search_path='' as $$select ojjuda_house_internal.folder_visible(p_folder,p_viewer)$$;
revoke all on function public.folder_can_see(uuid,uuid) from public,anon;
grant execute on function public.folder_can_see(uuid,uuid) to authenticated,service_role;

create function public.house_friend_group_cleanup() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.media_folders set allowed_groups=array_remove(allowed_groups,old.id) where user_id=old.user_id and old.id=any(allowed_groups);
 return old;
end;$$;
revoke all on function public.house_friend_group_cleanup() from public,anon;
create trigger house_friend_group_cleanup after delete on public.house_friend_groups for each row execute function public.house_friend_group_cleanup();

create function public.house_save_friend_group(p_id uuid,p_name text,p_members uuid[],p_create boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare viewer uuid:=auth.uid();saved public.house_friend_groups;
begin
 if viewer is null or public.is_banned(viewer) then raise exception 'group_access_denied' using errcode='42501';end if;
 if p_id is null or p_name is null or char_length(btrim(p_name)) not between 1 and 20 then raise exception 'invalid_group';end if;
 if p_create then
  insert into public.house_friend_groups(id,user_id,name,members) values(p_id,viewer,p_name,p_members)
  on conflict(id) do update set name=excluded.name,members=excluded.members where house_friend_groups.user_id=viewer returning * into saved;
 else
  update public.house_friend_groups set name=p_name,members=p_members where id=p_id and user_id=viewer returning * into saved;
 end if;
 if saved.id is null then raise exception 'group_unavailable' using errcode='42501';end if;
 return jsonb_build_object('id',saved.id,'name',saved.name,'members',saved.members);
end;$$;
revoke all on function public.house_save_friend_group(uuid,text,uuid[],boolean) from public,anon;
grant execute on function public.house_save_friend_group(uuid,text,uuid[],boolean) to authenticated;
create function public.house_delete_friend_group(p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare viewer uuid:=auth.uid();removed uuid;
begin
 if viewer is null or public.is_banned(viewer) then raise exception 'group_access_denied' using errcode='42501';end if;
 delete from public.house_friend_groups where id=p_id and user_id=viewer returning id into removed;
 if removed is null then raise exception 'group_unavailable' using errcode='42501';end if;
 return jsonb_build_object('id',removed);
end;$$;
revoke all on function public.house_delete_friend_group(uuid) from public,anon;
grant execute on function public.house_delete_friend_group(uuid) to authenticated;
