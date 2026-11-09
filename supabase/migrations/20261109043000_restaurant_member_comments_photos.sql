-- Publicly readable restaurant stories. Only verified members may publish or
-- remove their own comments/photos; the private table is never exposed by API.
-- Anonymous role only gets the specific list function, not table privileges.
grant usage on schema ojjuda_restaurants_internal to anon;
create table ojjuda_restaurants_internal.comments (
 id uuid primary key,
 target_kind text not null,
 target_id text not null,
 member_id uuid not null references auth.users(id) on delete cascade,
 recommendation_id uuid references ojjuda_restaurants_internal.recommendations(id) on delete cascade,
 body text not null default '',
 photo_path text unique,
 created_at timestamptz not null default clock_timestamp(),
 check(ojjuda_restaurants_internal.rating_target_valid(target_kind,target_id)),
 check((target_kind='certified' and recommendation_id is null)
   or (target_kind='recommended' and recommendation_id is not null and target_id=recommendation_id::text)),
 check(char_length(btrim(body))<=500 and (char_length(btrim(body))>0 or photo_path is not null)),
 check(photo_path is null or photo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$')
);
create index restaurant_comments_target_page on ojjuda_restaurants_internal.comments(target_kind,target_id,created_at desc,id desc);
create index restaurant_comments_member_recent on ojjuda_restaurants_internal.comments(member_id,created_at desc);
create index restaurant_comments_recommendation on ojjuda_restaurants_internal.comments(recommendation_id) where recommendation_id is not null;
alter table ojjuda_restaurants_internal.comments enable row level security;
revoke all on ojjuda_restaurants_internal.comments from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('restaurant-comment-photos','restaurant-comment-photos',true,2097152,array['image/jpeg']);

create function ojjuda_restaurants_internal.comment_photo_path_valid(p_path text,p_owner uuid,p_id text)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
  and split_part(p_path,'/',1)=p_owner::text
  and split_part(p_path,'/',2)=p_id,false);
$$;

-- Public reads intentionally omit hidden/withdrawn accounts and never reveal
-- an author's user ID. The photo URL is built by the trusted client SDK.
create function ojjuda_restaurants_internal.list_comments(p_kind text,p_id text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if not ojjuda_restaurants_internal.rating_target_valid(p_kind,p_id)
  or p_limit is null or p_limit not between 1 and 30
  or p_offset is null or p_offset not between 0 and 1000 then
  raise exception 'restaurant_comment_invalid_input' using errcode='22023'; end if;
 if p_kind='recommended' and not exists(
  select 1 from ojjuda_restaurants_internal.recommendations r join auth.users au on au.id=r.owner_id
  where r.id=p_id::uuid and au.is_anonymous is not true and au.deleted_at is null
   and not exists(select 1 from ojjuda_account_deletion.requests pending where pending.user_id=r.owner_id)
 ) then return '[]'::jsonb; end if;
 with page as (
  select c.id,c.body,c.photo_path,c.created_at,c.member_id,p.nickname
  from ojjuda_restaurants_internal.comments c
  join auth.users au on au.id=c.member_id
  join public.profiles p on p.id=c.member_id
  where c.target_kind=p_kind and c.target_id=p_id
   and au.is_anonymous is not true and au.deleted_at is null
   and not exists(select 1 from ojjuda_account_deletion.requests pending where pending.user_id=c.member_id)
  order by c.created_at desc,c.id desc offset p_offset limit p_limit
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'photo_path',photo_path,
  'author_name',coalesce(nullif(btrim(nickname),''),'회원'),'created_at',created_at,
  'mine',member_id=auth.uid()) order by created_at desc,id desc),'[]'::jsonb)
 into result from page;
 return result;
end;
$$;

create function ojjuda_restaurants_internal.save_comment(p_comment_id uuid,p_kind text,p_id text,p_body text,p_photo_path text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare u uuid := ojjuda_restaurants_internal.require_member(); v_body text := btrim(coalesce(p_body,''));
 v_recommendation uuid; old ojjuda_restaurants_internal.comments;
begin
 perform pg_advisory_xact_lock(127247341,hashtext(u::text));
 perform ojjuda_restaurants_internal.require_member();
 if p_comment_id is null or not ojjuda_restaurants_internal.rating_target_valid(p_kind,p_id)
  or char_length(v_body)>500 or (v_body='' and p_photo_path is null)
  or (p_photo_path is not null and not ojjuda_restaurants_internal.comment_photo_path_valid(p_photo_path,u,p_comment_id::text)) then
  raise exception 'restaurant_comment_invalid_input' using errcode='22023'; end if;
 if p_kind='recommended' then
  v_recommendation:=p_id::uuid;
  perform pg_advisory_xact_lock(127247342,hashtext(p_id));
  if not exists(select 1 from ojjuda_restaurants_internal.recommendations r
   where r.id=v_recommendation and ojjuda_restaurants_internal.author_visible(r.owner_id)) then
   raise exception 'restaurant_comment_target_unavailable' using errcode='P0002'; end if;
 end if;
 select * into old from ojjuda_restaurants_internal.comments where id=p_comment_id;
 if found then
  if old.member_id=u and old.target_kind=p_kind and old.target_id=p_id
   and old.body=v_body and old.photo_path is not distinct from p_photo_path then
   return jsonb_build_object('id',old.id,'saved',true); end if;
  raise exception 'restaurant_comment_conflict' using errcode='23505';
 end if;
 if exists(select 1 from ojjuda_restaurants_internal.comments
   where member_id=u and created_at>clock_timestamp()-interval '5 seconds') then
  raise exception 'restaurant_comment_too_fast' using errcode='54000'; end if;
 if (select count(*) from (select 1 from ojjuda_restaurants_internal.comments
   where member_id=u and created_at>clock_timestamp()-interval '1 day' limit 60) q)>=60 then
  raise exception 'restaurant_comment_daily_limit' using errcode='54000'; end if;
 if p_photo_path is not null and not exists(
  select 1 from storage.objects o where o.bucket_id='restaurant-comment-photos'
  and o.name=p_photo_path and o.owner_id=u::text
  and (o.owner is null or o.owner=u) and o.is_delete_marker is not true
 ) then raise exception 'restaurant_comment_photo_missing' using errcode='22023'; end if;
 insert into ojjuda_restaurants_internal.comments(id,target_kind,target_id,member_id,recommendation_id,body,photo_path)
 values(p_comment_id,p_kind,p_id,u,v_recommendation,v_body,p_photo_path);
 return jsonb_build_object('id',p_comment_id,'saved',true);
end;
$$;

create function ojjuda_restaurants_internal.delete_comment(p_comment_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare u uuid := ojjuda_restaurants_internal.require_member(); record ojjuda_restaurants_internal.comments;
begin
 perform pg_advisory_xact_lock(127247341,hashtext(u::text));
 perform ojjuda_restaurants_internal.require_member();
 select * into record from ojjuda_restaurants_internal.comments where id=p_comment_id for update;
 if not found then return jsonb_build_object('deleted',false); end if;
 if record.member_id<>u then raise exception 'restaurant_comment_forbidden' using errcode='42501'; end if;
 delete from ojjuda_restaurants_internal.comments where id=p_comment_id;
 return jsonb_build_object('deleted',true,'photo_path',record.photo_path);
end;
$$;

create function public.list_restaurant_comments(p_kind text,p_id text,p_limit integer default 20,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.list_comments(p_kind,p_id,p_limit,p_offset);
$$;
create function public.save_restaurant_comment(p_comment_id uuid,p_kind text,p_id text,p_body text,p_photo_path text default null)
returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.save_comment(p_comment_id,p_kind,p_id,p_body,p_photo_path);
$$;
create function public.delete_restaurant_comment(p_comment_id uuid)
returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.delete_comment(p_comment_id);
$$;

-- Restrictive guards also apply when an older broad storage policy exists.
create function ojjuda_restaurants_internal.comment_photo_upload_allowed(p_path text,p_owner text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.member_allowed() and p_owner=auth.uid()::text
  and ojjuda_restaurants_internal.comment_photo_path_valid(p_path,auth.uid(),split_part(p_path,'/',2))
  and not exists(select 1 from ojjuda_restaurants_internal.comments where id::text=split_part(p_path,'/',2));
$$;
create function ojjuda_restaurants_internal.comment_photo_delete_allowed(p_path text,p_owner text)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog as $$
declare u uuid := auth.uid();
begin
 if u is null or p_owner is distinct from u::text
  or p_path !~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.]jpg$'
  or not ojjuda_restaurants_internal.comment_photo_path_valid(p_path,u,split_part(p_path,'/',2)) then return false; end if;
 perform pg_advisory_xact_lock(127247341,hashtext(u::text));
 if not ojjuda_restaurants_internal.member_allowed() and not ojjuda_account_deletion.pending() then return false; end if;
 return not exists(select 1 from ojjuda_restaurants_internal.comments where photo_path=p_path);
end;
$$;

create policy restaurant_comment_files_insert on storage.objects for insert to authenticated
 with check(bucket_id='restaurant-comment-photos'
  and ojjuda_restaurants_internal.comment_photo_upload_allowed(name,owner_id)
  and (owner is null or owner=auth.uid()));
create policy restaurant_comment_files_insert_guard on storage.objects as restrictive for insert to authenticated
 with check(case when bucket_id='restaurant-comment-photos'
  then ojjuda_restaurants_internal.comment_photo_upload_allowed(name,owner_id)
   and (owner is null or owner=auth.uid()) else true end);
create policy restaurant_comment_files_select on storage.objects for select to authenticated
 using(bucket_id='restaurant-comment-photos' and owner_id=auth.uid()::text
  and storage.allow_any_operation(array['object.delete','object.delete_many'])
  and ojjuda_restaurants_internal.comment_photo_delete_allowed(name,owner_id));
create policy restaurant_comment_files_select_guard on storage.objects as restrictive for select to authenticated
 using(case when bucket_id='restaurant-comment-photos'
  then storage.allow_any_operation(array['object.delete','object.delete_many'])
   and ojjuda_restaurants_internal.comment_photo_delete_allowed(name,owner_id) else true end);
create policy restaurant_comment_files_delete on storage.objects for delete to authenticated
 using(bucket_id='restaurant-comment-photos'
  and ojjuda_restaurants_internal.comment_photo_delete_allowed(name,owner_id)
  and (owner is null or owner=auth.uid()));
create policy restaurant_comment_files_delete_guard on storage.objects as restrictive for delete to authenticated
 using(case when bucket_id='restaurant-comment-photos'
  then ojjuda_restaurants_internal.comment_photo_delete_allowed(name,owner_id)
   and (owner is null or owner=auth.uid()) else true end);
create policy restaurant_comment_files_no_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'restaurant-comment-photos') with check(bucket_id<>'restaurant-comment-photos');
create policy restaurant_comment_files_no_anon on storage.objects as restrictive for all to anon
 using(bucket_id<>'restaurant-comment-photos') with check(bucket_id<>'restaurant-comment-photos');

-- Allow account deletion to discover these new uploads before auth.users is
-- removed, including any abandoned photo awaiting a failed comment retry.
create or replace function ojjuda_account_deletion.assert_paths(u uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if exists(
  select 1 from storage.objects o
  where (o.owner_id=u::text or o.owner=u
   or (o.bucket_id in ('media','note-card-photos','note-event-photos','restaurant-recommendations','restaurant-comment-photos') and split_part(o.name,'/',1)=u::text))
   and not coalesce(
    (o.bucket_id in ('media','note-card-photos','note-event-photos')
     or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text)
     or (o.bucket_id='restaurant-comment-photos' and o.name ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.]jpg$'
      and ojjuda_restaurants_internal.comment_photo_path_valid(o.name,u,split_part(o.name,'/',2)) and o.owner_id=u::text))
    and split_part(o.name,'/',1)=u::text
    and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
    and (o.owner is null or o.owner=u)
    and o.name !~ '(^|/)([.]|[.][.])(/|$)' and o.name !~ '//|/$' and position(chr(92) in o.name)=0,
   false)
 ) then raise exception 'account_storage_manual_review' using errcode='P0001'; end if;
end;
$$;
create or replace function ojjuda_account_deletion.files(p_expected_user_id uuid,p_limit integer)
returns table(bucket_id text,photo_path text)
language plpgsql volatile security definer set search_path='' as $$
declare u uuid := ojjuda_account_deletion.check_owner(p_expected_user_id);
begin
 if not ojjuda_account_deletion.pending() then
  raise exception 'account_deletion_not_prepared' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_limit' using errcode='22023'; end if;
 perform ojjuda_account_deletion.assert_paths(u);
 return query select o.bucket_id::text,o.name::text from storage.objects o
  where (o.bucket_id in ('media','note-card-photos','note-event-photos')
   or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text)
   or (o.bucket_id='restaurant-comment-photos' and o.name ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.]jpg$'
    and ojjuda_restaurants_internal.comment_photo_path_valid(o.name,u,split_part(o.name,'/',2)) and o.owner_id=u::text))
   and split_part(o.name,'/',1)=u::text
   and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
   and (o.owner is null or o.owner=u)
  order by o.bucket_id,o.name limit p_limit;
end;
$$;

revoke all on function ojjuda_restaurants_internal.comment_photo_path_valid(text,uuid,text),
 ojjuda_restaurants_internal.list_comments(text,text,integer,integer),
 ojjuda_restaurants_internal.save_comment(uuid,text,text,text,text),
 ojjuda_restaurants_internal.delete_comment(uuid),
 ojjuda_restaurants_internal.comment_photo_upload_allowed(text,text),
 ojjuda_restaurants_internal.comment_photo_delete_allowed(text,text) from public,anon,authenticated;
grant execute on function ojjuda_restaurants_internal.list_comments(text,text,integer,integer) to anon,authenticated;
grant execute on function ojjuda_restaurants_internal.save_comment(uuid,text,text,text,text),
 ojjuda_restaurants_internal.delete_comment(uuid),
 ojjuda_restaurants_internal.comment_photo_upload_allowed(text,text),
 ojjuda_restaurants_internal.comment_photo_delete_allowed(text,text) to authenticated;
revoke all on function public.list_restaurant_comments(text,text,integer,integer),
 public.save_restaurant_comment(uuid,text,text,text,text),
 public.delete_restaurant_comment(uuid) from public,anon,authenticated;
grant execute on function public.list_restaurant_comments(text,text,integer,integer) to anon,authenticated;
grant execute on function public.save_restaurant_comment(uuid,text,text,text,text),
 public.delete_restaurant_comment(uuid) to authenticated;
notify pgrst,'reload schema';
