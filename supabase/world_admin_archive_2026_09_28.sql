-- World admin archive. Apply to the production World database before deploying
-- the admin UI. No historical content is copied. Owner deletes stay immediate.
-- Room chat stays in place: it is hidden after 1 day and deleted after 30 days.

create schema if not exists ojjuda_world_private;
revoke all on schema ojjuda_world_private from public, anon, authenticated;

create table ojjuda_world_private.content_archive (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('diary','media','guestbook','intro','chat','media_comment')),
  source_id text not null,
  reason text not null default 'admin' check (reason = 'admin'),
  title text,
  body text not null default '',
  reply text,
  author_id uuid references public.profiles(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  author_nick text,
  created_at timestamptz not null,
  archived_at timestamptz not null default statement_timestamp(),
  purge_after timestamptz not null,
  constraint world_archive_purge_after_check check (purge_after > archived_at)
);
alter table ojjuda_world_private.content_archive enable row level security;
revoke all on ojjuda_world_private.content_archive from public, anon, authenticated;
revoke all on sequence ojjuda_world_private.content_archive_id_seq from public, anon, authenticated;
create index content_archive_purge_idx on ojjuda_world_private.content_archive (purge_after);
create index content_archive_list_idx on ojjuda_world_private.content_archive (archived_at desc, id desc);

-- Removing a media row and deleting its Storage objects are separate network
-- operations. Keep only the path until the admin client confirms removal.
create table ojjuda_world_private.media_cleanup_queue (
  id bigint generated always as identity primary key,
  media_id text not null,
  path text not null unique,
  queued_at timestamptz not null default statement_timestamp()
);
alter table ojjuda_world_private.media_cleanup_queue enable row level security;
revoke all on ojjuda_world_private.media_cleanup_queue from public, anon, authenticated;
revoke all on sequence ojjuda_world_private.media_cleanup_queue_id_seq
  from public, anon, authenticated;

-- Called only by the checked admin deletion RPCs. Store public text, never the
-- photo/video storage path, private posts, secret/hidden notes or owner deletes.
create or replace function ojjuda_world_private.archive_admin_public_content(
  p_kind text, p_row jsonb
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_author uuid;
  v_owner uuid;
  v_public boolean := false;
  v_title text;
  v_body text;
  v_reply text;
  v_nick text;
  v_media record;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_row is null then return; end if;

  case p_kind
    when 'diary' then
      v_author := (p_row->>'user_id')::uuid;
      v_owner := v_author;
      v_public := (p_row->>'visibility') = 'all';
      v_title := p_row->>'title';
      v_body := p_row->>'body';
    when 'media' then
      v_author := (p_row->>'user_id')::uuid;
      v_owner := v_author;
      if p_row->>'folder_id' is null then
        v_public := (p_row->>'visibility') = 'all';
      else
        select f.visibility = 'all' into v_public
        from public.media_folders f where f.id = (p_row->>'folder_id')::uuid;
      end if;
      v_body := p_row->>'caption';
    when 'guestbook' then
      v_author := (p_row->>'author_id')::uuid;
      v_owner := (p_row->>'owner_id')::uuid;
      v_public := (p_row->>'secret') = 'false' and (p_row->>'hidden') = 'false';
      v_body := p_row->>'body';
      v_reply := p_row->>'reply';
      v_nick := p_row->>'author_nick';
    when 'intro' then
      v_author := (p_row->>'author_id')::uuid;
      v_owner := (p_row->>'owner_id')::uuid;
      v_public := true;
      v_body := p_row->>'body';
      v_nick := p_row->>'author_nick';
    when 'chat' then
      v_author := (p_row->>'author_id')::uuid;
      v_owner := v_author;
      v_public := true;
      v_title := p_row->>'room';
      v_body := p_row->>'body';
      v_nick := p_row->>'author_nick';
    when 'media_comment' then
      v_author := (p_row->>'author_id')::uuid;
      select m.user_id,
             case when m.folder_id is not null then f.visibility = 'all'
                  else m.visibility = 'all' end as is_public
        into v_media
      from public.media m
      left join public.media_folders f on f.id = m.folder_id
      where m.id = p_row->>'media_id';
      v_owner := v_media.user_id;
      v_public := coalesce(v_media.is_public, false);
      v_body := p_row->>'body';
      v_nick := p_row->>'author_nick';
    else
      raise exception 'unknown world content type' using errcode = '22023';
  end case;

  -- Deleted accounts must never be copied. A closed room is not public.
  if not coalesce(v_public, false) or v_owner is null or
     not exists (select 1 from public.profiles p where p.id = v_owner and not p.door_closed) or
     (p_kind in ('guestbook','intro','media_comment') and v_author is null) or
     (v_author is not null and not exists
       (select 1 from public.profiles p where p.id = v_author)) then
    return;
  end if;

  if p_kind = 'chat' and (p_row->>'created_at')::timestamptz + interval '30 days' <= statement_timestamp() then
    return;
  end if;

  if v_nick is null and v_author is not null then
    select p.nickname into v_nick from public.profiles p where p.id = v_author;
  end if;
  insert into ojjuda_world_private.content_archive
    (kind,source_id,title,body,reply,author_id,owner_id,author_nick,created_at,purge_after)
  values
    (p_kind,case when p_kind = 'intro'
       then (p_row->>'owner_id') || ':' || (p_row->>'author_id')
       else p_row->>'id' end,
     v_title,coalesce(v_body,''),v_reply,v_author,v_owner,v_nick,
     (p_row->>'created_at')::timestamptz,
     case when p_kind = 'chat' then
       least(statement_timestamp() + interval '30 days',
             (p_row->>'created_at')::timestamptz + interval '30 days')
     else statement_timestamp() + interval '30 days' end);
end;
$$;
revoke all on function ojjuda_world_private.archive_admin_public_content(text,jsonb)
  from public, anon, authenticated;

-- Keep the existing RPC signature and media path return value, so the client
-- still deletes the actual storage objects. The archive retains caption only.
create or replace function public.admin_delete_item(p_kind text, p_id text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb;
  v_path text;
  v_thumb text;
  v_deleted integer := 0;
  v_comment jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_kind = 'diary' then
    select to_jsonb(d) into v_row from public.diaries d where d.id::text = p_id for update;
    delete from public.diaries where id::text = p_id;
  elsif p_kind = 'media' then
    select to_jsonb(m) into v_row from public.media m where m.id = p_id for update;
    if v_row is not null then
      -- Media comments cascade on delete, so preserve eligible public text
      -- while the parent row still exists for the visibility check.
      for v_comment in select to_jsonb(c) from public.media_comments c
        where c.media_id = p_id
      loop
        perform ojjuda_world_private.archive_admin_public_content('media_comment',v_comment);
      end loop;
      update public.diaries set media_id = null where media_id = p_id;
      delete from public.media where id = p_id returning path,thumb_path into v_path,v_thumb;
      get diagnostics v_deleted = row_count;
      insert into ojjuda_world_private.media_cleanup_queue (media_id,path)
        select p_id,paths.path from (values (v_path),(v_thumb)) as paths(path)
        where paths.path is not null and paths.path <> ''
        on conflict (path) do update set media_id = excluded.media_id,
          queued_at = statement_timestamp();
    end if;
  elsif p_kind = 'guestbook' then
    select to_jsonb(g) into v_row from public.guestbook g where g.id::text = p_id for update;
    delete from public.guestbook where id::text = p_id;
  elsif p_kind = 'intro' then
    select to_jsonb(i) into v_row from public.intros i
      where i.owner_id::text = split_part(p_id,':',1)
        and i.author_id::text = split_part(p_id,':',2) for update;
    delete from public.intros where owner_id::text = split_part(p_id,':',1)
       and author_id::text = split_part(p_id,':',2);
  elsif p_kind = 'chat' then
    select to_jsonb(c) into v_row from public.place_messages c where c.id::text = p_id for update;
    delete from public.place_messages where id::text = p_id;
  else
    return json_build_object('ok',false,'reason','unknown');
  end if;
  if p_kind <> 'media' then
    get diagnostics v_deleted = row_count;
  end if;
  if v_deleted = 0 then
    return json_build_object('ok',false,'reason','missing');
  end if;
  perform ojjuda_world_private.archive_admin_public_content(p_kind,v_row);
  return json_build_object('ok',true,'path',v_path,'thumb',v_thumb);
end;
$$;
revoke all on function public.admin_delete_item(text,text) from public, anon;
grant execute on function public.admin_delete_item(text,text) to authenticated;

create or replace function public.admin_world_media_cleanup_pending(
  p_media_id text default null, p_limit integer default 100,
  p_after_id bigint default 0
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb)
    into v_result
  from (select q.id,q.path from ojjuda_world_private.media_cleanup_queue q
        where (p_media_id is null or q.media_id = p_media_id)
          and q.id > coalesce(p_after_id,0)
          and not exists (select 1 from public.media m
            where m.path = q.path or m.thumb_path = q.path)
        order by id limit least(greatest(coalesce(p_limit,100),1),100)) q;
  return v_result;
end;
$$;
revoke all on function public.admin_world_media_cleanup_pending(text,integer,bigint)
  from public, anon;
grant execute on function public.admin_world_media_cleanup_pending(text,integer,bigint)
  to authenticated;

create or replace function public.admin_world_media_cleanup_ack(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  delete from ojjuda_world_private.media_cleanup_queue where id = p_id;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok',v_deleted > 0);
end;
$$;
revoke all on function public.admin_world_media_cleanup_ack(bigint) from public, anon;
grant execute on function public.admin_world_media_cleanup_ack(bigint) to authenticated;

-- The report moderation screen uses a different deletion RPC.
create or replace function public.admin_delete_content(kind text,target_id text,target_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb;
  v_chat record;
  v_count integer := 0;
  v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if kind = 'guestbook' then
    select to_jsonb(g) into v_row from public.guestbook g where g.id = target_id for update;
    delete from public.guestbook where id = target_id;
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then
      v_count := v_deleted;
      perform ojjuda_world_private.archive_admin_public_content('guestbook',v_row);
    end if;
  elsif kind = 'chat' then
    for v_chat in select c.* from public.place_messages c
      where c.author_id = target_user and c.room = target_id
        and c.created_at > now() - interval '1 day' for update
    loop
      delete from public.place_messages where id = v_chat.id;
      get diagnostics v_deleted = row_count;
      if v_deleted > 0 then
        v_count := v_count + v_deleted;
        perform ojjuda_world_private.archive_admin_public_content('chat',to_jsonb(v_chat));
      end if;
    end loop;
  elsif kind = 'media_comment' then
    select to_jsonb(c) into v_row from public.media_comments c where c.id = target_id for update;
    delete from public.media_comments where id = target_id;
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then
      v_count := v_deleted;
      perform ojjuda_world_private.archive_admin_public_content('media_comment',v_row);
    end if;
  end if;
  return v_count;
end;
$$;
revoke all on function public.admin_delete_content(text,text,uuid) from public, anon;
grant execute on function public.admin_delete_content(text,text,uuid) to authenticated;

-- Expired chat is read in place. The existing 30-day deletion job stays active.
create or replace function public.admin_world_archive_feed(
  p_reason text default 'all', p_offset integer default 0, p_limit integer default 20
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_reason text := coalesce(p_reason,'all');
  v_offset integer := least(greatest(coalesce(p_offset,0),0),100000);
  v_limit integer := least(greatest(coalesce(p_limit,20),1),100);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if v_reason not in ('all','admin','expired') then
    raise exception 'invalid archive filter' using errcode = '22023';
  end if;
  with visible as (
    select 'saved:' || a.id::text as id,a.kind,a.reason,a.title,a.body,a.reply,
           a.author_nick,a.created_at,a.archived_at,a.purge_after
      from ojjuda_world_private.content_archive a
      where a.purge_after > now() and v_reason in ('all','admin')
    union all
    select 'chat:' || c.id::text,'chat'::text,'expired'::text,c.room,c.body,null::text,
           c.author_nick,c.created_at,c.created_at + interval '1 day',
           c.created_at + interval '30 days'
      from public.place_messages c
      where c.created_at <= now() - interval '1 day'
        and c.created_at > now() - interval '30 days'
        and v_reason in ('all','expired')
  )
  select jsonb_build_object(
    'total',(select count(*) from visible),
    'pending_media_count',(select count(*) from ojjuda_world_private.media_cleanup_queue),
    'items',(select coalesce(jsonb_agg(to_jsonb(page) order by page.archived_at desc,page.id desc),'[]'::jsonb)
      from (select * from visible order by archived_at desc,id desc
            limit v_limit offset v_offset) page)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_world_archive_feed(text,integer,integer) from public, anon;
grant execute on function public.admin_world_archive_feed(text,integer,integer) to authenticated;

create or replace function public.admin_world_purge_archive(p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_id ~ '^saved:[0-9]{1,19}$' then
    delete from ojjuda_world_private.content_archive
      where id = substring(p_id from 7)::bigint;
  elsif p_id ~ '^chat:[0-9]{1,19}$' then
    delete from public.place_messages
      where id = substring(p_id from 6)::bigint
        and created_at <= now() - interval '1 day';
  else
    raise exception 'invalid archive id' using errcode = '22023';
  end if;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok',v_deleted > 0);
end;
$$;
revoke all on function public.admin_world_purge_archive(text) from public, anon;
grant execute on function public.admin_world_purge_archive(text) to authenticated;

-- Always purge even if no administrator opens the screen.
select cron.schedule(
  'ojjuda_world_admin_archive_30d',
  '19 * * * *',
  'delete from ojjuda_world_private.content_archive where purge_after <= now()'
);
