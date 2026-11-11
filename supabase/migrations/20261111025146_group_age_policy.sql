-- Group participation rules use the existing immutable registered birth date.
-- This is age-based membership, not external identity/adult verification.
begin;
set local lock_timeout = '5s';

alter table ojjuda_groups_internal.rooms
  add column age_policy text not null default 'all',
  add column min_age smallint,
  add column max_age smallint,
  add constraint group_room_age_policy check (
    age_policy in ('all','adult','minor','range') and (
      (age_policy = 'range' and min_age is not null and max_age is not null
        and min_age between 14 and 150 and max_age between 14 and 150 and min_age <= max_age)
      or (age_policy <> 'range' and min_age is null and max_age is null)
    )
  );

create function ojjuda_groups_internal.registered_age(p_user uuid)
returns integer language sql stable security invoker set search_path = '' as $$
  select ojjuda_account_internal.age_on(m.birth_date, (now() at time zone 'Asia/Seoul')::date)
  from ojjuda_account_internal.member_identity m where m.user_id = p_user;
$$;

create function ojjuda_groups_internal.age_matches(p_policy text, p_min integer, p_max integer, p_age integer)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(case p_policy
    when 'all' then true
    when 'adult' then p_age >= 19
    when 'minor' then p_age between 14 and 18
    when 'range' then p_age between p_min and p_max
    else false end, false);
$$;

create function ojjuda_groups_internal.age_message(p_policy text, p_min integer, p_max integer, p_age integer)
returns text language sql immutable set search_path = '' as $$
  select case
    when ojjuda_groups_internal.age_matches(p_policy,p_min,p_max,p_age) then ''
    when p_age is null then '연령 정보가 없어요. 내 정보에서 생년월일을 확인해 주세요.'
    when p_policy = 'adult' then '만 19세 이상만 이용할 수 있는 그룹이에요.'
    when p_policy = 'minor' then '만 14~18세만 이용할 수 있는 그룹이에요.'
    when p_policy = 'range' and p_max = 150 then '만 ' || p_min || '세 이상만 이용할 수 있는 그룹이에요.'
    when p_policy = 'range' then '만 ' || p_min || '~' || p_max || '세만 이용할 수 있는 그룹이에요.'
    else '이 그룹의 이용 연령 조건을 확인해 주세요.' end;
$$;

create function ojjuda_groups_internal.age_details(p_room ojjuda_groups_internal.rooms, p_age integer)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('age_policy',p_room.age_policy,'min_age',p_room.min_age,'max_age',p_room.max_age,
    'age_allowed',ojjuda_groups_internal.age_matches(p_room.age_policy,p_room.min_age,p_room.max_age,p_age),
    'age_message',ojjuda_groups_internal.age_message(p_room.age_policy,p_room.min_age,p_room.max_age,p_age));
$$;

create function ojjuda_groups_internal.require_room_age(p_room uuid, p_user uuid)
returns void language plpgsql stable security invoker set search_path = '' as $$
declare r ojjuda_groups_internal.rooms; member_age integer;
begin
  select * into r from ojjuda_groups_internal.rooms where id = p_room;
  if not found then raise exception '그룹을 확인해 주세요.' using errcode = '42501'; end if;
  member_age := ojjuda_groups_internal.registered_age(p_user);
  if not ojjuda_groups_internal.age_matches(r.age_policy,r.min_age,r.max_age,member_age) then
    raise exception '%', ojjuda_groups_internal.age_message(r.age_policy,r.min_age,r.max_age,member_age)
      using errcode = '42501';
  end if;
end;
$$;

-- Recheck the rule on every content/media request, including after a birthday.
create or replace function ojjuda_groups_internal.member(r uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and ojjuda_groups_internal.allowed() and exists (
    select 1 from ojjuda_groups_internal.members m
    join ojjuda_groups_internal.rooms a on a.id = m.room_id
    where m.room_id = r and m.user_id = auth.uid() and not a.deleting
      and ojjuda_groups_internal.age_matches(a.age_policy,a.min_age,a.max_age,
        ojjuda_groups_internal.registered_age(auth.uid()))
  );
$$;

-- Keep membership/request invariants even if another server path is added later.
create function ojjuda_groups_internal.guard_member_age()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform ojjuda_groups_internal.require_room_age(new.room_id,new.user_id);
  return new;
end;
$$;
create trigger group_member_age_guard before insert or update of room_id,user_id
  on ojjuda_groups_internal.members for each row execute function ojjuda_groups_internal.guard_member_age();
create trigger group_request_age_guard before insert or update of room_id,user_id
  on ojjuda_groups_internal.requests for each row execute function ojjuda_groups_internal.guard_member_age();

create or replace function ojjuda_groups_internal.service(p_action text,p jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid();r uuid:=nullif(p->>'room_id','')::uuid;eid uuid:=nullif(p->>'id','')::uuid;
 v jsonb;old ojjuda_groups_internal.entries;f jsonb;obj storage.objects;media jsonb:='[]';
 k text;st timestamptz;en timestamptz;d date;last_day date;target uuid;total bigint:=0;
 viewer_age integer;policy text;lo integer;hi integer;
begin
 if not ojjuda_groups_internal.allowed() then raise exception '로그인이 필요하거나 이용할 수 없는 계정이에요.' using errcode='42501'; end if;
 viewer_age:=ojjuda_groups_internal.registered_age(u);
 if p_action='rooms' then
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select a.id,a.name,a.description,a.owner_id,a.created_at,a.deleting,a.age_policy,a.min_age,a.max_age,ojjuda_groups_internal.age_matches(a.age_policy,a.min_age,a.max_age,viewer_age) age_allowed,ojjuda_groups_internal.age_message(a.age_policy,a.min_age,a.max_age,viewer_age) age_message,(select count(*) from ojjuda_groups_internal.members b where b.room_id=a.id) member_count
    from ojjuda_groups_internal.rooms a join ojjuda_groups_internal.members m on m.room_id=a.id and m.user_id=u where not a.deleting or a.owner_id=u) x),'[]');
 elsif p_action='directory' then
  return coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from (
   select a.id,a.name,a.description,a.created_at,a.age_policy,a.min_age,a.max_age,ojjuda_groups_internal.age_matches(a.age_policy,a.min_age,a.max_age,viewer_age) age_allowed,ojjuda_groups_internal.age_message(a.age_policy,a.min_age,a.max_age,viewer_age) age_message,coalesce(pr.nickname,'방장') owner_name,
   (select count(*) from ojjuda_groups_internal.members m where m.room_id=a.id) member_count,
   exists(select 1 from ojjuda_groups_internal.members m where m.room_id=a.id and m.user_id=u) is_member,
   exists(select 1 from ojjuda_groups_internal.requests q where q.room_id=a.id and q.user_id=u) requested
   from ojjuda_groups_internal.rooms a left join public.profiles pr on pr.id=a.owner_id where not a.deleting
   and (coalesce(p->>'query','')='' or strpos(lower(a.name||' '||a.description),lower(p->>'query'))>0)
   and (nullif(p->>'before','') is null or (a.created_at,a.id)<((p->>'before')::timestamptz,(p->>'before_id')::uuid))
   order by a.created_at desc,a.id desc limit 41) x),'[]');
 elsif p_action='create_room' then
  policy:=coalesce(p->>'age_policy','all');
  if policy not in ('all','adult','minor','range') then raise exception '이용 연령을 선택해 주세요.' using errcode='22023'; end if;
  if policy='range' then
   if coalesce(p->>'min_age','') !~ '^[0-9]{1,3}$' or coalesce(p->>'max_age','') !~ '^[0-9]{1,3}$' then raise exception '최소·최대 나이를 정수로 입력해 주세요.' using errcode='22023'; end if;
   lo:=(p->>'min_age')::integer;hi:=(p->>'max_age')::integer;
   if lo not between 14 and 150 or hi not between 14 and 150 or lo>hi then raise exception '만 14~150세 안에서 최소·최대 나이를 확인해 주세요.' using errcode='22023'; end if;
  elsif p->>'min_age' is not null or p->>'max_age' is not null then
   raise exception '나이대 지정에서만 최소·최대 나이를 입력해 주세요.' using errcode='22023';
  end if;
  if not ojjuda_groups_internal.age_matches(policy,lo,hi,viewer_age) then
   raise exception '%',ojjuda_groups_internal.age_message(policy,lo,hi,viewer_age) using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,715));
  if eid is not null and exists(select 1 from ojjuda_groups_internal.rooms where id=eid) then
   if not exists(select 1 from ojjuda_groups_internal.rooms where id=eid and owner_id=u and not deleting) then raise exception '이미 사용된 그룹 번호예요.' using errcode='42501'; end if;
   if not exists(select 1 from ojjuda_groups_internal.rooms where id=eid and age_policy=policy and min_age is not distinct from lo and max_age is not distinct from hi) then
    raise exception '이미 다른 연령 조건으로 만들어진 그룹이에요. 새로고침해 주세요.' using errcode='22023';
   end if;
   return jsonb_build_object('id',eid);
  end if;
  if (select count(*) from ojjuda_groups_internal.rooms where owner_id=u)>=30 then raise exception '만들 수 있는 방은 30개까지예요.'; end if;
  insert into ojjuda_groups_internal.rooms(id,owner_id,name,description,age_policy,min_age,max_age) values(coalesce(eid,gen_random_uuid()),u,trim(p->>'name'),coalesce(trim(p->>'description'),''),policy,lo,hi) returning id into r;
  insert into ojjuda_groups_internal.members values(r,u,clock_timestamp());
  return jsonb_build_object('id',r);
 elsif p_action in ('join','request','cancel_request') then
  if p_action='join' then
   select id into r from ojjuda_groups_internal.rooms where invite_code=nullif(trim(p->>'code'),'')::uuid and not deleting for share;
  else perform 1 from ojjuda_groups_internal.rooms where id=r and not deleting for share;
   if not found then r:=null; end if;
  end if;
  if r is null then raise exception '그룹이나 초대코드를 확인해 주세요.'; end if;
  if p_action<>'cancel_request' then perform ojjuda_groups_internal.require_room_age(r,u); end if;
  if exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=u) then return jsonb_build_object('id',r,'member',true); end if;
  if p_action='cancel_request' then delete from ojjuda_groups_internal.requests where room_id=r and user_id=u;
  else insert into ojjuda_groups_internal.requests(room_id,user_id) values(r,u) on conflict do nothing; end if;
  return jsonb_build_object('id',r,'requested',p_action<>'cancel_request');
 end if;
 -- Null room means the combined feed of this user's own groups only.
 if p_action in ('feed','calendar') then
  if r is not null then perform ojjuda_groups_internal.require_room_age(r,u); end if;
  if r is not null and not ojjuda_groups_internal.member(r) then raise exception '그룹원만 볼 수 있어요.' using errcode='42501'; end if;
  k:=coalesce(p->>'filter','all');
  if p_action='calendar' then
   d:=date_trunc('month',(p->>'month')::date)::date;last_day:=(d+interval '1 month - 1 day')::date;
   if d is null then raise exception '날짜를 선택해 주세요.'; end if;
   return coalesce((select jsonb_agg(x order by x.day) from (
    select cal_day::date as day,count(e.id) count,count(e.id) filter(where e.kind<>'post') events
    from generate_series(d::timestamp,last_day::timestamp,interval '1 day') as cal_day
    left join ojjuda_groups_internal.entries e on exists(select 1 from ojjuda_groups_internal.members m where m.room_id=e.room_id and m.user_id=u)
     and exists(select 1 from ojjuda_groups_internal.rooms a where a.id=e.room_id and not a.deleting and ojjuda_groups_internal.age_matches(a.age_policy,a.min_age,a.max_age,viewer_age)) and (r is null or e.room_id=r) and (k='all' or (k='post' and e.kind='post') or (k='event' and e.kind<>'post'))
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
   where not a.deleting and ojjuda_groups_internal.age_matches(a.age_policy,a.min_age,a.max_age,viewer_age) and (r is null or e.room_id=r) and (k='all' or (k='post' and e.kind='post') or (k='event' and e.kind<>'post'))
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
 -- Read-only lists do not acquire the room's write lock.
 if p_action in ('members','requests','comments') then
  perform ojjuda_groups_internal.require_room_age(r,u);
  if not ojjuda_groups_internal.member(r) then raise exception '그룹원만 이용할 수 있어요.' using errcode='42501'; end if;
  if p_action='requests' then
   if not exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u) then raise exception '방장만 관리할 수 있어요.' using errcode='42501'; end if;

   return coalesce((select jsonb_agg(x order by x.created_at) from (select q.user_id,q.created_at,coalesce(pr.nickname,'회원') nickname
    from ojjuda_groups_internal.requests q left join public.profiles pr on pr.id=q.user_id where q.room_id=r) x),'[]');
  elsif p_action='members' then

  return coalesce((select jsonb_agg(x order by x.joined_at) from (select m.user_id,m.joined_at,coalesce(pr.nickname,'회원') nickname
   from ojjuda_groups_internal.members m left join public.profiles pr on pr.id=m.user_id where m.room_id=r) x),'[]');
  else

  return coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from (
   select c.*,coalesce(pr.nickname,'탈퇴한 회원') author_name from ojjuda_groups_internal.comments c left join public.profiles pr on pr.id=c.author_id
   where c.entry_id=eid and (nullif(p->>'before','') is null or (c.created_at,c.id)<((p->>'before')::timestamptz,(p->>'before_id')::uuid))
   order by c.created_at desc,c.id desc limit 51) x),'[]');
  end if;
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
 if p_action='leave' then
  perform 1 from ojjuda_groups_internal.rooms where id=r and not deleting for update;
  if not found or not exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=u) then raise exception '가입한 그룹을 확인해 주세요.' using errcode='42501'; end if;
  if exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u) then raise exception '방장은 방을 나갈 수 없어요.'; end if;
  delete from ojjuda_groups_internal.members where room_id=r and user_id=u;
  return jsonb_build_object('ok',true);
 end if;
 perform ojjuda_groups_internal.require_room_age(r,u);
 if not ojjuda_groups_internal.member(r) then raise exception '그룹원만 이용할 수 있어요.' using errcode='42501'; end if;
 -- Serialize room changes and membership revocation with writes.
 perform 1 from ojjuda_groups_internal.rooms where id=r for update;
 if not exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=u) then raise exception '그룹원만 이용할 수 있어요.' using errcode='42501'; end if;
 if p_action in ('rename','approve','reject','transfer') then
  if not exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u) then raise exception '방장만 관리할 수 있어요.' using errcode='42501'; end if;
  if p_action='rename' then
   update ojjuda_groups_internal.rooms set name=trim(p->>'name'),description=coalesce(trim(p->>'description'),'') where id=r;
  elsif p_action in ('approve','reject') then
   target:=(p->>'user_id')::uuid;
   delete from ojjuda_groups_internal.requests where room_id=r and user_id=target;
   if not found then raise exception '처리된 가입 신청이에요. 새로고침해 주세요.'; end if;
   if p_action='approve' then perform ojjuda_groups_internal.require_room_age(r,target); end if;
   if p_action='approve' then insert into ojjuda_groups_internal.members(room_id,user_id) values(r,target) on conflict do nothing; end if;
  elsif p_action='transfer' then
   target:=(p->>'user_id')::uuid;
   if target is null or target=u or not exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=target) then raise exception '위임할 그룹원을 선택해 주세요.'; end if;
   perform ojjuda_groups_internal.require_room_age(r,target);
   update ojjuda_groups_internal.rooms set owner_id=target,invite_code=gen_random_uuid() where id=r;
  end if;
  return jsonb_build_object('ok',true);
 elsif p_action='invite' then
  if not exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u) then raise exception '방장만 초대할 수 있어요.' using errcode='42501'; end if;
  if coalesce((p->>'rotate')::boolean,false) then update ojjuda_groups_internal.rooms set invite_code=gen_random_uuid() where id=r; end if;
  return (select jsonb_build_object('code',invite_code) from ojjuda_groups_internal.rooms where id=r);
 elsif p_action='kick' then
  target:=(p->>'user_id')::uuid;
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

create or replace function ojjuda_groups_internal.invitation_service(p_action text,p jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid();r ojjuda_groups_internal.rooms;i ojjuda_groups_internal.invitations;
 rid uuid:=nullif(p->>'room_id','')::uuid;target uuid:=nullif(p->>'user_id','')::uuid;q text:=trim(coalesce(p->>'query',''));
 viewer_age integer;
begin
 if not ojjuda_groups_internal.allowed() then raise exception '로그인이 필요하거나 이용할 수 없는 계정이에요.' using errcode='42501'; end if;
 viewer_age:=ojjuda_groups_internal.registered_age(u);
 if p_action='received' then
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
   select v.id,v.room_id,a.name group_name,pr.nickname sender_name,v.created_at,a.age_policy,a.min_age,a.max_age,ojjuda_groups_internal.age_matches(a.age_policy,a.min_age,a.max_age,viewer_age) age_allowed,ojjuda_groups_internal.age_message(a.age_policy,a.min_age,a.max_age,viewer_age) age_message
   from ojjuda_groups_internal.invitations v join ojjuda_groups_internal.rooms a on a.id=v.room_id
   join public.profiles pr on pr.id=v.sender_id
   where v.recipient_id=u and v.status='pending' and not a.deleting and a.owner_id=v.sender_id
   and ojjuda_groups_internal.invitable_peer(v.sender_id)
   and not exists(select 1 from ojjuda_groups_internal.members m where m.room_id=v.room_id and m.user_id=u)
   order by v.created_at desc limit 100) x),'[]');
 elsif p_action in ('preview_link','accept_link') then
  if p_action='preview_link' then
   select * into r from ojjuda_groups_internal.rooms where share_code=nullif(p->>'code','')::uuid;
  else
   select * into r from ojjuda_groups_internal.rooms where share_code=nullif(p->>'code','')::uuid for update;
  end if;
  if not found or r.deleting or not ojjuda_groups_internal.invitable_peer(r.owner_id) then raise exception '사용할 수 없는 초대 링크예요.' using errcode='42501'; end if;
  if p_action='accept_link' then
   perform ojjuda_groups_internal.require_room_age(r.id,u);
   insert into ojjuda_groups_internal.members(room_id,user_id) values(r.id,u) on conflict do nothing;
   delete from ojjuda_groups_internal.requests where room_id=r.id and user_id=u;
  end if;
  return jsonb_build_object('room_id',r.id,'group_name',r.name,'sender_name',(select nickname from public.profiles where id=r.owner_id),
   'member',exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=u)) || ojjuda_groups_internal.age_details(r,viewer_age);
 elsif p_action in ('accept','decline') then
  select v.room_id into rid from ojjuda_groups_internal.invitations v where v.id=nullif(p->>'id','')::uuid and v.recipient_id=u;
  select * into r from ojjuda_groups_internal.rooms where id=rid for update;
  if not found or r.deleting then raise exception '종료된 초대예요.' using errcode='42501'; end if;
  select * into i from ojjuda_groups_internal.invitations where id=nullif(p->>'id','')::uuid and recipient_id=u for update;
  if not found or i.sender_id<>r.owner_id or not ojjuda_groups_internal.invitable_peer(i.sender_id) then raise exception '사용할 수 없는 초대예요.' using errcode='42501'; end if;
  if p_action='accept' then perform ojjuda_groups_internal.require_room_age(r.id,u); end if;
  if p_action='accept' and i.status='accepted' and exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=u) then return jsonb_build_object('room_id',r.id,'joined',true); end if;
  if p_action='decline' and i.status='declined' then return jsonb_build_object('ok',true); end if;
  if i.status<>'pending' then raise exception '이미 처리된 초대예요.' using errcode='42501'; end if;
  if p_action='accept' then
   insert into ojjuda_groups_internal.members(room_id,user_id) values(r.id,u) on conflict do nothing;
   delete from ojjuda_groups_internal.requests where room_id=r.id and user_id=u;
  end if;
  update ojjuda_groups_internal.invitations set status=case when p_action='accept' then 'accepted' else 'declined' end,responded_at=clock_timestamp() where id=i.id;
  return jsonb_build_object('room_id',r.id,'joined',p_action='accept');
 end if;
 -- Members may read a shared invite link; recipient lookup, sending and rotation remain owner-only.
 if p_action='send' then perform pg_advisory_xact_lock(hashtextextended(u::text,716)); end if;
 if p_action='search' or (p_action='link' and not coalesce((p->>'rotate')::boolean,false)) then
  select * into r from ojjuda_groups_internal.rooms where id=rid;
 else
  select * into r from ojjuda_groups_internal.rooms where id=rid for update;
 end if;
 if not found or r.deleting then raise exception '사용할 수 없는 그룹이에요.' using errcode='42501'; end if;
 perform ojjuda_groups_internal.require_room_age(r.id,u);
 if p_action='link' and not coalesce((p->>'rotate')::boolean,false) then
  if r.owner_id<>u and not exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=u) then
   raise exception '그룹원만 초대 링크를 공유할 수 있어요.' using errcode='42501';
  end if;
  return jsonb_build_object('code',r.share_code,'group_name',r.name) || ojjuda_groups_internal.age_details(r,viewer_age);
 end if;
 if r.owner_id<>u then raise exception '방장만 이용할 수 있어요.' using errcode='42501'; end if;
 if p_action='search' then
  if length(q)>60 then return '[]'; end if;
  return coalesce((select jsonb_agg(x order by x.created_at desc,x.user_id desc) from (
   select pr.id user_id,pr.nickname,pr.created_at,coalesce(v.status='pending',false) invited
   from public.profiles pr left join ojjuda_groups_internal.invitations v on v.room_id=r.id and v.recipient_id=pr.id
   where pr.id<>u and (q='' or strpos(lower(pr.nickname),lower(q))>0) and ojjuda_groups_internal.invitable_peer(pr.id)
   and ojjuda_groups_internal.age_matches(r.age_policy,r.min_age,r.max_age,ojjuda_groups_internal.registered_age(pr.id))
   and not exists(select 1 from ojjuda_groups_internal.members m where m.room_id=r.id and m.user_id=pr.id)
   and (nullif(p->>'before','') is null or (pr.created_at,pr.id)<((p->>'before')::timestamptz,(p->>'before_id')::uuid))
   order by pr.created_at desc,pr.id desc limit 31) x),'[]');
 elsif p_action='send' then
  if target is null or target=u or not ojjuda_groups_internal.invitable_peer(target) then raise exception '초대할 수 없는 회원이에요.' using errcode='42501'; end if;
  perform ojjuda_groups_internal.require_room_age(r.id,target);
  if exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=target) then raise exception '이미 가입한 그룹원이에요.'; end if;
  select * into i from ojjuda_groups_internal.invitations where room_id=r.id and recipient_id=target for update;
  if found and i.status='pending' then return jsonb_build_object('id',i.id,'sent',true); end if;
  if i.status='declined' and i.responded_at>now()-interval '1 day' then raise exception '이 회원에게는 내일 다시 초대할 수 있어요.'; end if;
  if (select count(*) from ojjuda_groups_internal.invitations where sender_id=u and created_at>now()-interval '1 minute')>=30 then raise exception '잠시 후 다시 초대해 주세요.'; end if;
  insert into ojjuda_groups_internal.invitations(room_id,sender_id,recipient_id) values(r.id,u,target)
  on conflict(room_id,recipient_id) do update set id=gen_random_uuid(),sender_id=u,status='pending',created_at=clock_timestamp(),responded_at=null
  returning * into i;
  return jsonb_build_object('id',i.id,'sent',true);
 elsif p_action='link' then
  if coalesce((p->>'rotate')::boolean,false) then
   update ojjuda_groups_internal.rooms set share_code=gen_random_uuid() where id=r.id returning * into r;
  end if;
  return jsonb_build_object('code',r.share_code,'group_name',r.name) || ojjuda_groups_internal.age_details(r,viewer_age);
 else raise exception '지원하지 않는 요청이에요.' using errcode='22023';
 end if;
end $$;

-- Only the existing authenticated RPC entry points execute these private helpers.
revoke all on function ojjuda_groups_internal.registered_age(uuid),
  ojjuda_groups_internal.age_matches(text,integer,integer,integer),
  ojjuda_groups_internal.age_message(text,integer,integer,integer),
  ojjuda_groups_internal.age_details(ojjuda_groups_internal.rooms,integer),
  ojjuda_groups_internal.require_room_age(uuid,uuid),
  ojjuda_groups_internal.guard_member_age(),ojjuda_groups_internal.member(uuid)
  from public,anon,authenticated;
revoke all on function ojjuda_groups_internal.service(text,jsonb),
  ojjuda_groups_internal.invitation_service(text,jsonb) from public,anon;
grant execute on function ojjuda_groups_internal.service(text,jsonb),
  ojjuda_groups_internal.invitation_service(text,jsonb) to authenticated;

NOTIFY pgrst,'reload schema';
commit;
