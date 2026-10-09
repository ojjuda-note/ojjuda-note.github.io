-- Curated public media for the existing automatic-card account.
-- No member-facing write permissions and no credentials in source.
create schema ojjuda_media_internal;
revoke all on schema ojjuda_media_internal from public, anon, authenticated;
grant usage on schema ojjuda_media_internal to service_role;

create table ojjuda_media_internal.config (
 singleton boolean primary key default true check(singleton),
 author_id uuid not null references public.profiles(id),
 enabled boolean not null default false,
 bootstrap_remaining integer not null default 2 check(bootstrap_remaining between 0 and 2),
 min_interval interval not null default interval '2 hours' check(min_interval>=interval '2 hours'),
 last_posted_at timestamptz,
 next_kind text not null default 'image' check(next_kind in ('image','video'))
);
insert into ojjuda_media_internal.config(author_id)
select author_id from ojjuda_note_internal.auto_card_config where singleton;

create table ojjuda_media_internal.items (
 id uuid primary key default gen_random_uuid(),
 source_key text not null unique check(source_key ~ '^commons:[0-9]+$'),
 source_page text not null check(source_page ~ '^https://commons[.]wikimedia[.]org/'),
 source_sha1 text not null unique check(source_sha1 ~ '^[a-f0-9]{40}$'),
 content_sha256 text not null unique check(content_sha256 ~ '^[a-f0-9]{64}$'),
 thumb_sha256 text not null check(thumb_sha256 ~ '^[a-f0-9]{64}$'),
 thumb_dhash bit(64) not null,
 download_url text not null check(download_url ~ '^https://(upload|thumb)[.]wikimedia[.]org/wikipedia/commons/'),
 thumb_url text not null check(thumb_url ~ '^https://(upload|thumb)[.]wikimedia[.]org/wikipedia/commons/'),
 kind text not null check(kind in ('image','video')),
 mime text not null check(mime in ('image/jpeg','image/png','image/gif','image/webp','video/webm','video/mp4')),
 thumb_mime text not null check(thumb_mime in ('image/jpeg','image/png','image/webp')),
 file_size bigint not null check(file_size between 1 and 31457280),
 thumb_size bigint not null check(thumb_size between 1 and 1048576),
 duration real not null default 0 check(duration between 0 and 90),
 caption text not null check(char_length(caption) between 1 and 100),
 attribution text not null check(char_length(attribution) between 1 and 200),
 license text not null check(license in ('CC0','CC BY 2.0','CC BY 3.0','CC BY 4.0','CC BY-SA 2.0','CC BY-SA 3.0','CC BY-SA 4.0')),
 reviewed_at timestamptz not null,
 status text not null default 'queued' check(status in ('queued','importing','published','failed','rejected')),
 attempts integer not null default 0,
 created_at timestamptz not null default now(),
 retry_after timestamptz,
 expires_at timestamptz,
 claimed_at timestamptz,
 token_hash text,
 request_id bigint,
 published_at timestamptz,
 error_code text,
 check((kind='image' and mime like 'image/%' and duration=0) or (kind='video' and mime like 'video/%' and duration>0))
);
create index auto_house_media_queue on ojjuda_media_internal.items(status,created_at);
alter table ojjuda_media_internal.config enable row level security;
alter table ojjuda_media_internal.items enable row level security;
revoke all on all tables in schema ojjuda_media_internal from public,anon,authenticated;
grant select,update on ojjuda_media_internal.config,ojjuda_media_internal.items to service_role;

create function ojjuda_media_internal.reject_similar_image() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(20261009,771);
 if new.kind='image' and exists(
   select 1 from ojjuda_media_internal.items i where i.kind='image'
   and bit_count(i.thumb_dhash # new.thumb_dhash)<=4
 ) then raise exception 'duplicate_visual' using errcode='23505'; end if;
 if public.has_banned(new.caption) then raise exception 'invalid_caption'; end if;
 return new;
end;$$;
create trigger reject_similar_image before insert on ojjuda_media_internal.items
for each row execute function ojjuda_media_internal.reject_similar_image();

create function ojjuda_media_internal.dispatch() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c ojjuda_media_internal.config%rowtype;
 j ojjuda_media_internal.items%rowtype; token text; req bigint;
begin
 select * into c from ojjuda_media_internal.config where singleton for update;
 if not found or not c.enabled then return jsonb_build_object('status','paused'); end if;
 if c.bootstrap_remaining=0 and c.last_posted_at is not null and now()<c.last_posted_at+c.min_interval then
  return jsonb_build_object('status','interval','next_at',c.last_posted_at+c.min_interval);
 end if;
 update ojjuda_media_internal.items set status=case when attempts<3 then 'queued' else 'failed' end,
  error_code='lease_expired',token_hash=null,claimed_at=null
 where status='importing' and expires_at<now();
 if exists(select 1 from ojjuda_media_internal.items where status='importing') then
  return jsonb_build_object('status','busy');
 end if;
 select * into j from ojjuda_media_internal.items
 where status='queued' and (retry_after is null or retry_after<=now())
 order by (kind=c.next_kind) desc,created_at,id limit 1 for update skip locked;
 if not found then return jsonb_build_object('status','empty'); end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 update ojjuda_media_internal.items set status='importing',attempts=attempts+1,
  token_hash=encode(extensions.digest(token,'sha256'),'hex'),expires_at=now()+interval '5 minutes',
  claimed_at=null,error_code=null where id=j.id;
 select net.http_post(
  url:='https://ziezbdjofcugznowiuda.supabase.co/functions/v1/auto-house-media',
  headers:=jsonb_build_object('Content-Type','application/json','X-Ojjuda-Media-Token',token),
  body:=jsonb_build_object('id',j.id),timeout_milliseconds:=120000
 ) into req;
 update ojjuda_media_internal.items set request_id=req where id=j.id;
 return jsonb_build_object('status','dispatched','id',j.id,'request_id',req,'kind',j.kind);
end;$$;

create function public.auto_house_media_claim(p_id uuid,p_token text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j ojjuda_media_internal.items%rowtype; c ojjuda_media_internal.config%rowtype;
 suffix text; thumb_suffix text; prefix text;
begin
 select * into c from ojjuda_media_internal.config where singleton;
 if not c.enabled or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into j from ojjuda_media_internal.items where id=p_id and status='importing'
 and expires_at>now() and claimed_at is null
 and token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if not found then return null; end if;
 update ojjuda_media_internal.items set claimed_at=now() where id=p_id;
 suffix:=case j.mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
 when 'image/gif' then 'gif' when 'image/webp' then 'webp' when 'video/webm' then 'webm' else 'mp4' end;
 thumb_suffix:=case j.thumb_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
 prefix:=c.author_id::text||'/auto_meme_'||replace(j.id::text,'-','');
 return (to_jsonb(j)-'token_hash')||jsonb_build_object('author_id',c.author_id,
 'path',prefix||'.'||suffix,'thumb_path',prefix||'_thumb.'||thumb_suffix);
end;$$;

create function public.auto_house_media_complete(p_id uuid,p_token text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j ojjuda_media_internal.items%rowtype; c ojjuda_media_internal.config%rowtype;
 suffix text; thumb_suffix text; prefix text; media_key text; saved_sub text;
begin
 select * into c from ojjuda_media_internal.config where singleton for update;
 select * into j from ojjuda_media_internal.items where id=p_id for update;
 if j.token_hash is null or j.token_hash<>encode(extensions.digest(p_token,'sha256'),'hex') then
  raise exception 'invalid_job_token';
 end if;
 media_key:='auto_meme_'||replace(j.id::text,'-','');
 if j.status='published' then return jsonb_build_object('status','published','media_id',media_key); end if;
 if not c.enabled or j.status<>'importing' or j.expires_at<now() or j.claimed_at is null then
  raise exception 'inactive_job';
 end if;
 if c.bootstrap_remaining=0 and c.last_posted_at is not null and now()<c.last_posted_at+c.min_interval then raise exception 'interval'; end if;
 suffix:=case j.mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
 when 'image/gif' then 'gif' when 'image/webp' then 'webp' when 'video/webm' then 'webm' else 'mp4' end;
 thumb_suffix:=case j.thumb_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
 prefix:=c.author_id::text||'/'||media_key;
 if not exists(select 1 from storage.objects where bucket_id='media' and name=prefix||'.'||suffix
 and (metadata->>'size')::bigint=j.file_size) or not exists(
 select 1 from storage.objects where bucket_id='media' and name=prefix||'_thumb.'||thumb_suffix
 and (metadata->>'size')::bigint=j.thumb_size) then raise exception 'storage_not_verified'; end if;
 insert into public.media(id,user_id,type,path,thumb_path,caption,duration,visibility)
 values(media_key,c.author_id,j.kind,prefix||'.'||suffix,prefix||'_thumb.'||thumb_suffix,j.caption,j.duration,'all');
 -- Scope the existing author trigger to this explicitly authorized system account.
 saved_sub:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',c.author_id::text,true);
 insert into public.media_comments(id,media_id,author_id,author_nick,body)
 values(media_key||'_source',media_key,c.author_id,'오쭈다자동카드',j.attribution);
 perform set_config('request.jwt.claim.sub',coalesce(saved_sub,''),true);
 update ojjuda_media_internal.items set status='published',published_at=now(),error_code=null where id=p_id;
 update ojjuda_media_internal.config set last_posted_at=now(),bootstrap_remaining=greatest(0,bootstrap_remaining-1),next_kind=case j.kind when 'image' then 'video' else 'image' end where singleton;
 return jsonb_build_object('status','published','media_id',media_key,'kind',j.kind);
end;$$;

create function public.auto_house_media_fail(p_id uuid,p_token text,p_error text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update ojjuda_media_internal.items set status=case when attempts<3 then 'queued' else 'failed' end,
  retry_after=now()+interval '30 minutes',error_code=left(p_error,100),token_hash=null,claimed_at=null
 where id=p_id and status='importing' and token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 return found;
end;$$;

revoke all on all functions in schema ojjuda_media_internal from public,anon,authenticated,service_role;
revoke all on function public.auto_house_media_claim(uuid,text),public.auto_house_media_complete(uuid,text),
 public.auto_house_media_fail(uuid,text,text) from public,anon,authenticated;
grant execute on function public.auto_house_media_claim(uuid,text),public.auto_house_media_complete(uuid,text),
 public.auto_house_media_fail(uuid,text,text) to service_role;
notify pgrst,'reload schema';
