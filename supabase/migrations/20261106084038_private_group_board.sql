-- Private groups: the only API is an authenticated, membership-checked RPC.
create schema ojjuda_groups_internal;
revoke all on schema ojjuda_groups_internal from public,anon;
grant usage on schema ojjuda_groups_internal to authenticated;
create table ojjuda_groups_internal.rooms(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 60), description text not null default '' check(length(description)<=300),
 invite_code uuid not null unique default gen_random_uuid(),deleting boolean not null default false,created_at timestamptz not null default clock_timestamp());
create table ojjuda_groups_internal.members(
 room_id uuid not null references ojjuda_groups_internal.rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,joined_at timestamptz not null default clock_timestamp(),primary key(room_id,user_id));
create index group_members_user on ojjuda_groups_internal.members(user_id,room_id);
create table ojjuda_groups_internal.requests(
 room_id uuid not null references ojjuda_groups_internal.rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default clock_timestamp(),primary key(room_id,user_id));
create index group_requests_user on ojjuda_groups_internal.requests(user_id);
alter table ojjuda_groups_internal.requests enable row level security;
create table ojjuda_groups_internal.entries(
 id uuid primary key,room_id uuid not null references ojjuda_groups_internal.rooms(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,kind text not null check(kind in ('post','event','trip')),
 title text not null default '' check(length(title)<=120),body text not null default '' check(length(body)<=10000),
 location text not null default '' check(length(location)<=200),starts_at timestamptz,ends_at timestamptz,all_day boolean not null default false,
 media jsonb not null default '[]' check(jsonb_typeof(media)='array' and jsonb_array_length(media)<=10),
 created_at timestamptz not null default statement_timestamp(),updated_at timestamptz not null default statement_timestamp(),
 check((kind='post' and starts_at is null and ends_at is null) or (kind<>'post' and starts_at is not null and ends_at>=starts_at and ends_at<starts_at+interval '367 days')),
 check(length(trim(title))+length(trim(body))>0 or jsonb_array_length(media)>0));
create index group_entries_feed on ojjuda_groups_internal.entries(room_id,created_at desc,id desc);
create index group_entries_author on ojjuda_groups_internal.entries(author_id);
create index group_entries_schedule on ojjuda_groups_internal.entries(room_id,starts_at,ends_at) where kind<>'post';
create table ojjuda_groups_internal.comments(
 id uuid primary key default gen_random_uuid(),entry_id uuid not null references ojjuda_groups_internal.entries(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,body text not null check(length(trim(body)) between 1 and 2000),created_at timestamptz not null default clock_timestamp());
create index group_comments_entry on ojjuda_groups_internal.comments(entry_id,created_at,id);
create index group_comments_author on ojjuda_groups_internal.comments(author_id);
alter table ojjuda_groups_internal.rooms enable row level security;
alter table ojjuda_groups_internal.members enable row level security;
alter table ojjuda_groups_internal.entries enable row level security;
alter table ojjuda_groups_internal.comments enable row level security;
revoke all on all tables in schema ojjuda_groups_internal from public,anon,authenticated;

create function ojjuda_groups_internal.allowed()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users u join public.profiles p on p.id=u.id
 where u.id=auth.uid() and not coalesce(u.is_anonymous,false) and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now()))
 and not public.is_banned(auth.uid()) and not ojjuda_account_deletion.pending();
$$;
create function ojjuda_groups_internal.member(r uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and ojjuda_groups_internal.allowed() and exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=auth.uid()) and exists(select 1 from ojjuda_groups_internal.rooms where id=r and not deleting);
$$;
create function ojjuda_groups_internal.path_valid(p text)
returns boolean language sql immutable set search_path='' as $$
 select p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}[.](jpg|png|webp|gif|avif|mp4|webm|mov|m4v)$';
$$;
create function ojjuda_groups_internal.file_access(p text,op text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); r uuid; own boolean; linked boolean;
begin
 if u is null or not ojjuda_groups_internal.path_valid(p) then return false; end if;
 r:=split_part(p,'/',2)::uuid; own:=split_part(p,'/',1)=u::text;
 select exists(select 1 from ojjuda_groups_internal.entries e where e.id=split_part(p,'/',3)::uuid and e.room_id=r and e.media @> jsonb_build_array(jsonb_build_object('path',p))) into linked;
 if op='delete' then return (own and (not linked or ojjuda_account_deletion.pending())) or (ojjuda_groups_internal.allowed() and exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u and deleting)); end if;
 if not ojjuda_groups_internal.member(r) then return false; end if;
 if op='upload' then return own; end if;
 return linked;
end;
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('group-media','group-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime','video/x-m4v']);
create policy group_files_insert on storage.objects for insert to authenticated
 with check(bucket_id='group-media' and owner_id=auth.uid()::text and ojjuda_groups_internal.file_access(name,'upload'));
create policy group_files_insert_guard on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'group-media' or (owner_id=auth.uid()::text and (owner is null or owner=auth.uid()) and ojjuda_groups_internal.file_access(name,'upload')));
create policy group_files_read on storage.objects for select to authenticated using(bucket_id='group-media' and
 ((storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']) and ojjuda_groups_internal.file_access(name,'read'))
 or (storage.allow_any_operation(array['object.delete','object.delete_many']) and ojjuda_groups_internal.file_access(name,'delete'))));
create policy group_files_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'group-media' or
 ((storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']) and ojjuda_groups_internal.file_access(name,'read'))
 or (storage.allow_any_operation(array['object.delete','object.delete_many']) and ojjuda_groups_internal.file_access(name,'delete'))));
create policy group_files_delete on storage.objects for delete to authenticated using(bucket_id='group-media' and ojjuda_groups_internal.file_access(name,'delete'));
create policy group_files_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'group-media' or ojjuda_groups_internal.file_access(name,'delete'));
create policy group_files_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'group-media') with check(bucket_id<>'group-media');
create policy group_files_no_anon on storage.objects as restrictive for all to anon using(bucket_id<>'group-media') with check(bucket_id<>'group-media');

create function ojjuda_groups_internal.service(p_action text,p jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid();r uuid:=nullif(p->>'room_id','')::uuid;eid uuid:=nullif(p->>'id','')::uuid;
 v jsonb;old ojjuda_groups_internal.entries;f jsonb;obj storage.objects;media jsonb:='[]';
 k text;st timestamptz;en timestamptz;d date;last_day date;target uuid;total bigint:=0;
begin
 if not ojjuda_groups_internal.allowed() then raise exception '로그인이 필요하거나 이용할 수 없는 계정이에요.' using errcode='42501'; end if;
 if p_action='rooms' then
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select a.id,a.name,a.description,a.owner_id,a.created_at,a.deleting,(select count(*) from ojjuda_groups_internal.members b where b.room_id=a.id) member_count
    from ojjuda_groups_internal.rooms a join ojjuda_groups_internal.members m on m.room_id=a.id and m.user_id=u where not a.deleting or a.owner_id=u) x),'[]');
 elsif p_action='directory' then
  return coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from (
   select a.id,a.name,a.description,a.created_at,coalesce(pr.nickname,'방장') owner_name,
   (select count(*) from ojjuda_groups_internal.members m where m.room_id=a.id) member_count,
   exists(select 1 from ojjuda_groups_internal.members m where m.room_id=a.id and m.user_id=u) is_member,
   exists(select 1 from ojjuda_groups_internal.requests q where q.room_id=a.id and q.user_id=u) requested
   from ojjuda_groups_internal.rooms a left join public.profiles pr on pr.id=a.owner_id where not a.deleting
   and (coalesce(p->>'query','')='' or strpos(lower(a.name||' '||a.description),lower(p->>'query'))>0)
   and (nullif(p->>'before','') is null or (a.created_at,a.id)<((p->>'before')::timestamptz,(p->>'before_id')::uuid))
   order by a.created_at desc,a.id desc limit 41) x),'[]');
 elsif p_action='create_room' then
  perform pg_advisory_xact_lock(hashtextextended(u::text,715));
  if (select count(*) from ojjuda_groups_internal.rooms where owner_id=u)>=30 then raise exception '만들 수 있는 방은 30개까지예요.'; end if;
  insert into ojjuda_groups_internal.rooms(owner_id,name,description) values(u,trim(p->>'name'),coalesce(trim(p->>'description'),'')) returning id into r;
  insert into ojjuda_groups_internal.members values(r,u,clock_timestamp());
  return jsonb_build_object('id',r);
 elsif p_action in ('join','request','cancel_request') then
  if p_action='join' then
   select id into r from ojjuda_groups_internal.rooms where invite_code=nullif(trim(p->>'code'),'')::uuid and not deleting for share;
  else perform 1 from ojjuda_groups_internal.rooms where id=r and not deleting for share;
   if not found then r:=null; end if;
  end if;
  if r is null then raise exception '그룹이나 초대코드를 확인해 주세요.'; end if;
  if exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=u) then return jsonb_build_object('id',r,'member',true); end if;
  if p_action='cancel_request' then delete from ojjuda_groups_internal.requests where room_id=r and user_id=u;
  else insert into ojjuda_groups_internal.requests(room_id,user_id) values(r,u) on conflict do nothing; end if;
  return jsonb_build_object('id',r,'requested',p_action<>'cancel_request');
 end if;
 -- Null room means the combined feed of this user's own groups only.
 if p_action in ('feed','calendar') then
  if r is not null and not ojjuda_groups_internal.member(r) then raise exception '그룹원만 볼 수 있어요.' using errcode='42501'; end if;
  k:=coalesce(p->>'filter','all');
  if p_action='calendar' then
   d:=date_trunc('month',(p->>'month')::date)::date;last_day:=(d+interval '1 month - 1 day')::date;
   if d is null then raise exception '날짜를 선택해 주세요.'; end if;
   return coalesce((select jsonb_agg(x order by x.day) from (
    select cal_day::date as day,count(e.id) count,count(e.id) filter(where e.kind<>'post') events
    from generate_series(d::timestamp,last_day::timestamp,interval '1 day') as cal_day
    left join ojjuda_groups_internal.entries e on exists(select 1 from ojjuda_groups_internal.members m where m.room_id=e.room_id and m.user_id=u)
     and exists(select 1 from ojjuda_groups_internal.rooms a where a.id=e.room_id and not a.deleting) and (r is null or e.room_id=r) and (k='all' or (k='post' and e.kind='post') or (k='event' and e.kind<>'post'))
     and (coalesce(p->>'query','')='' or strpos(lower(e.title||' '||e.body||' '||e.location),lower(p->>'query'))>0)
     and (case when e.kind='post' then (e.created_at at time zone 'Asia/Seoul')::date=cal_day::date
       else e.starts_at < (cal_day+interval '1 day') at time zone 'Asia/Seoul' and e.ends_at>=cal_day at time zone 'Asia/Seoul' end)
    group by cal_day) x),'[]');
  end if;
  d:=nullif(p->>'date','')::date;
  return coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from (
   select e.*,coalesce(pr.nickname,'탈퇴한 회원') author_name,a.name room_name,
    (select count(*) from ojjuda_groups_internal.comments c where c.entry_id=e.id) comment_count
   from ojjuda_groups_internal.entries e join ojjuda_groups_internal.members m on m.room_id=e.room_id and m.user_id=u
   join ojjuda_groups_internal.rooms a on a.id=e.room_id left join public.profiles pr on pr.id=e.author_id
   where not a.deleting and (r is null or e.room_id=r) and (k='all' or (k='post' and e.kind='post') or (k='event' and e.kind<>'post'))
   and (coalesce(p->>'query','')='' or strpos(lower(e.title||' '||e.body||' '||e.location),lower(p->>'query'))>0)
   and (d is null or (case when e.kind='post' then (e.created_at at time zone 'Asia/Seoul')::date=d
    else e.starts_at < (d+1)::timestamp at time zone 'Asia/Seoul' and e.ends_at>=d::timestamp at time zone 'Asia/Seoul' end))
   and (nullif(p->>'before','') is null or (e.created_at,e.id)<((p->>'before')::timestamptz,(p->>'before_id')::uuid))
   order by e.created_at desc,e.id desc limit 41) x),'[]');
 end if;
 if p_action in ('comments','comment','delete_comment','remove') then
  if p_action='delete_comment' then select entry_id into eid from ojjuda_groups_internal.comments where id=(p->>'comment_id')::uuid; end if;
  select * into old from ojjuda_groups_internal.entries where id=eid;
  r:=old.room_id;
 end if;
 if p_action in ('delete_room','deletion_files','finish_delete') then
  perform 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u for update;
  if not found then raise exception '방장만 삭제할 수 있어요.' using errcode='42501'; end if;
  if p_action='delete_room' then update ojjuda_groups_internal.rooms set deleting=true where id=r; return jsonb_build_object('ok',true); end if;
  if not exists(select 1 from ojjuda_groups_internal.rooms where id=r and deleting) then raise exception '삭제 중인 그룹이 아니에요.'; end if;
  if p_action='deletion_files' then return coalesce((select jsonb_agg(name) from (select name from storage.objects where bucket_id='group-media' and split_part(name,'/',2)=r::text order by name limit 100) x),'[]'); end if;
  if exists(select 1 from storage.objects where bucket_id='group-media' and split_part(name,'/',2)=r::text) then raise exception '첨부 파일 삭제를 먼저 완료해 주세요.'; end if;
  delete from ojjuda_groups_internal.rooms where id=r;return jsonb_build_object('ok',true);
 end if;
 if not ojjuda_groups_internal.member(r) then raise exception '그룹원만 이용할 수 있어요.' using errcode='42501'; end if;
 -- Serialize room changes and membership revocation with writes.
 perform 1 from ojjuda_groups_internal.rooms where id=r for update;
 if not exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=u) then raise exception '그룹원만 이용할 수 있어요.' using errcode='42501'; end if;
 if p_action in ('rename','requests','approve','reject','transfer') then
  if not exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u) then raise exception '방장만 관리할 수 있어요.' using errcode='42501'; end if;
  if p_action='rename' then
   update ojjuda_groups_internal.rooms set name=trim(p->>'name'),description=coalesce(trim(p->>'description'),'') where id=r;
  elsif p_action='requests' then
   return coalesce((select jsonb_agg(x order by x.created_at) from (select q.user_id,q.created_at,coalesce(pr.nickname,'회원') nickname
    from ojjuda_groups_internal.requests q left join public.profiles pr on pr.id=q.user_id where q.room_id=r) x),'[]');
  elsif p_action in ('approve','reject') then
   target:=(p->>'user_id')::uuid;
   delete from ojjuda_groups_internal.requests where room_id=r and user_id=target;
   if not found then raise exception '처리된 가입 신청이에요. 새로고침해 주세요.'; end if;
   if p_action='approve' then insert into ojjuda_groups_internal.members(room_id,user_id) values(r,target) on conflict do nothing; end if;
  elsif p_action='transfer' then
   target:=(p->>'user_id')::uuid;
   if target is null or target=u or not exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=target) then raise exception '위임할 그룹원을 선택해 주세요.'; end if;
   update ojjuda_groups_internal.rooms set owner_id=target,invite_code=gen_random_uuid() where id=r;
  end if;
  return jsonb_build_object('ok',true);
 elsif p_action='members' then
  return coalesce((select jsonb_agg(x order by x.joined_at) from (select m.user_id,m.joined_at,coalesce(pr.nickname,'회원') nickname
   from ojjuda_groups_internal.members m left join public.profiles pr on pr.id=m.user_id where m.room_id=r) x),'[]');
 elsif p_action='invite' then
  if not exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u) then raise exception '방장만 초대할 수 있어요.' using errcode='42501'; end if;
  if coalesce((p->>'rotate')::boolean,false) then update ojjuda_groups_internal.rooms set invite_code=gen_random_uuid() where id=r; end if;
  return (select jsonb_build_object('code',invite_code) from ojjuda_groups_internal.rooms where id=r);
 elsif p_action in ('leave','kick') then
  target:=case when p_action='leave' then u else (p->>'user_id')::uuid end;
  if p_action='kick' and not exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u) then raise exception '방장만 내보낼 수 있어요.' using errcode='42501'; end if;
  if exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=target) then raise exception '방장은 방을 나갈 수 없어요.'; end if;
  delete from ojjuda_groups_internal.members where room_id=r and user_id=target;
  -- A removed member cannot rejoin using a previously shared invitation.
  if p_action='kick' then update ojjuda_groups_internal.rooms set invite_code=gen_random_uuid() where id=r; end if;
  return jsonb_build_object('ok',true);
 elsif p_action='save' then
  if eid is null then raise exception '게시글 번호가 필요해요.'; end if;
  select * into old from ojjuda_groups_internal.entries where id=eid for update;
  if found then
   if old.author_id is distinct from u or old.room_id<>r then raise exception '본인 글만 수정할 수 있어요.' using errcode='42501'; end if;
   -- A retried initial publish is idempotent; editing uses the observed revision.
   if nullif(p->>'updated_at','') is null then return to_jsonb(old); end if;
   if old.updated_at<>(p->>'updated_at')::timestamptz then raise exception '다른 화면에서 수정된 글이에요. 새로고침해 주세요.'; end if;
  elsif nullif(p->>'updated_at','') is not null then raise exception '삭제된 글이에요.'; end if;
  k:=coalesce(p->>'kind','post');
  if k not in ('post','event','trip') then raise exception '종류를 확인해 주세요.'; end if;
  if k<>'post' then
   st:=(p->>'starts_at')::timestamptz;en:=(p->>'ends_at')::timestamptz;
   if st is null or en is null or st>en or length(trim(coalesce(p->>'title','')))=0 then raise exception '일정 제목과 시작·종료 날짜를 확인해 주세요.'; end if;
  end if;
  if jsonb_typeof(coalesce(p->'media','[]'))<>'array' or jsonb_array_length(coalesce(p->'media','[]'))>10 then raise exception '첨부는 10개까지 가능해요.'; end if;
  for f in select value from jsonb_array_elements(coalesce(p->'media','[]')) loop
   if not ojjuda_groups_internal.path_valid(f->>'path') or split_part(f->>'path','/',1)<>u::text or split_part(f->>'path','/',2)<>r::text or split_part(f->>'path','/',3)<>eid::text then raise exception '첨부 파일을 확인해 주세요.' using errcode='42501'; end if;
   if media @> jsonb_build_array(jsonb_build_object('path',f->>'path')) then raise exception '중복 첨부예요.'; end if;
   select * into obj from storage.objects where bucket_id='group-media' and name=f->>'path' and owner_id=u::text and (owner is null or owner=u);
   if not found or coalesce((obj.metadata->>'size')::bigint,0) not between 1 and 52428800 or obj.metadata->>'mimetype' not in ('image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime','video/x-m4v') then raise exception '첨부 파일 업로드를 완료해 주세요.'; end if;
   total:=total+(obj.metadata->>'size')::bigint;
   media:=media||jsonb_build_array(jsonb_build_object('path',obj.name,'name',left(coalesce(f->>'name','첨부파일'),180),'mime',obj.metadata->>'mimetype','size',(obj.metadata->>'size')::bigint));
  end loop;
  if total>209715200 then raise exception '첨부 파일은 한 번에 총 200MB까지 가능해요.'; end if;
  insert into ojjuda_groups_internal.entries(id,room_id,author_id,kind,title,body,location,starts_at,ends_at,all_day,media)
   values(eid,r,u,k,coalesce(trim(p->>'title'),''),coalesce(trim(p->>'body'),''),coalesce(trim(p->>'location'),''),st,en,coalesce((p->>'all_day')::boolean,false),media)
   on conflict(id) do update set kind=excluded.kind,title=excluded.title,body=excluded.body,location=excluded.location,
    starts_at=excluded.starts_at,ends_at=excluded.ends_at,all_day=excluded.all_day,media=excluded.media,updated_at=clock_timestamp()
   returning to_jsonb(entries.*) into v;
  return v;
 elsif p_action='remove' then
  if old.author_id is distinct from u then raise exception '본인 글만 삭제할 수 있어요.' using errcode='42501'; end if;
  delete from ojjuda_groups_internal.entries where id=eid;
  return jsonb_build_object('media',old.media);
 elsif p_action='comments' then
  return coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from (
   select c.*,coalesce(pr.nickname,'탈퇴한 회원') author_name from ojjuda_groups_internal.comments c left join public.profiles pr on pr.id=c.author_id
   where c.entry_id=eid and (nullif(p->>'before','') is null or (c.created_at,c.id)<((p->>'before')::timestamptz,(p->>'before_id')::uuid))
   order by c.created_at desc,c.id desc limit 51) x),'[]');
 elsif p_action='comment' then
  target:=(p->>'comment_id')::uuid;
  insert into ojjuda_groups_internal.comments(id,entry_id,author_id,body) values(target,eid,u,trim(p->>'body')) on conflict(id) do nothing;
  return jsonb_build_object('ok',true);
 elsif p_action='delete_comment' then
  delete from ojjuda_groups_internal.comments where id=(p->>'comment_id')::uuid and author_id=u;
  if not found then raise exception '본인 댓글만 삭제할 수 있어요.' using errcode='42501'; end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception '알 수 없는 요청이에요.';
end;
$$;
create function public.group_board(p_action text,p_payload jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$select ojjuda_groups_internal.service(p_action,p_payload)$$;
revoke all on all functions in schema ojjuda_groups_internal from public,anon,authenticated;
grant execute on function ojjuda_groups_internal.service(text,jsonb),ojjuda_groups_internal.file_access(text,text) to authenticated;
revoke all on function public.group_board(text,jsonb) from public,anon;
grant execute on function public.group_board(text,jsonb) to authenticated;

-- Include private group attachments in the existing account withdrawal cleanup.
create or replace function ojjuda_account_deletion.assert_paths(u uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if exists(
  select 1 from storage.objects o
  where (o.owner_id=u::text or o.owner=u
   or (o.bucket_id in ('media','note-card-photos','note-event-photos','restaurant-recommendations','group-media') and split_part(o.name,'/',1)=u::text))
   and not coalesce(
    (o.bucket_id in ('media','note-card-photos','note-event-photos')
     or (o.bucket_id='group-media' and ojjuda_groups_internal.path_valid(o.name) and o.owner_id=u::text)
   or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text))
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
   or (o.bucket_id='group-media' and ojjuda_groups_internal.path_valid(o.name) and o.owner_id=u::text)
   or (o.bucket_id='restaurant-recommendations' and ojjuda_restaurants_internal.photo_path_valid(o.name) and o.owner_id=u::text))
   and split_part(o.name,'/',1)=u::text
   and (o.owner_id=u::text or (o.owner_id is null and o.owner=u))
   and (o.owner is null or o.owner=u)
  order by o.bucket_id,o.name limit p_limit;
end;
$$;

