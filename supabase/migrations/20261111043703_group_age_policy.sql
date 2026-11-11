-- Community age rules use private self-reported registration dates, NOT verified identity.
alter table ojjuda_groups_internal.rooms
 add column age_policy text not null default 'all',
 add column min_age smallint,
 add column max_age smallint,
 add constraint rooms_age_policy_check check (
  (age_policy='all' and min_age is null and max_age is null) or
  (age_policy='adults' and min_age is not null and min_age=19 and max_age is null) or
  (age_policy='minors' and min_age is not null and min_age=14 and max_age is not null and max_age=18) or
  (age_policy='range' and min_age is not null and max_age is not null and min_age between 14 and 150 and max_age between min_age and 150)
 );
create function ojjuda_groups_internal.registered_age(peer uuid)
returns integer language sql stable set search_path='' as $$
 select case when a between 14 and 150 then a end from (
  select ojjuda_account_internal.age_on(birth_date,(now() at time zone 'Asia/Seoul')::date) a
  from ojjuda_account_internal.member_identity where user_id=peer
 ) x;
$$;
create function ojjuda_groups_internal.age_matches(policy text,lo integer,hi integer,age integer)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(case policy when 'all' then true
  when 'adults' then age>=19 when 'minors' then age between 14 and 18
  when 'range' then age between lo and hi else false end,false);
$$;
create function ojjuda_groups_internal.age_allowed(r uuid,peer uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce((select ojjuda_groups_internal.age_matches(age_policy,min_age,max_age,ojjuda_groups_internal.registered_age(peer))
 from ojjuda_groups_internal.rooms where id=r),false);
$$;
create function ojjuda_groups_internal.age_details(r uuid,peer uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('age_policy',age_policy,'min_age',min_age,'max_age',max_age,
 'age_eligible',eligible,'age_note',case when eligible then ''
 when a is null then '가입 시 입력한 생년월일 정보가 없어 연령 제한 그룹을 이용할 수 없어요.'
 else '이 그룹의 연령 조건에 맞지 않아 이용할 수 없어요.' end)
 from (select t.*,a,ojjuda_groups_internal.age_matches(age_policy,min_age,max_age,a) eligible
 from ojjuda_groups_internal.rooms t cross join lateral (select ojjuda_groups_internal.registered_age(peer) a) v where id=r) x;
$$;
create function ojjuda_groups_internal.require_room_age(r uuid,peer uuid)
returns void language plpgsql stable set search_path='' as $$
begin
 if not ojjuda_groups_internal.age_allowed(r,peer) then
  raise exception '%',coalesce(ojjuda_groups_internal.age_details(r,peer)->>'age_note','그룹을 확인해 주세요.') using errcode='42501';
 end if;
end $$;
create function ojjuda_groups_internal.guard_room_age()
returns trigger language plpgsql set search_path='' as $$
begin
 case new.age_policy
 when 'all' then new.min_age:=null;new.max_age:=null;
 when 'adults' then new.min_age:=19;new.max_age:=null;
 when 'minors' then new.min_age:=14;new.max_age:=18;
 when 'range' then
  if new.min_age is null or new.max_age is null or new.min_age<14 or new.max_age>150 or new.min_age>new.max_age then
   raise exception '만 14~150세 사이에서 최소·최대 나이를 확인해 주세요.' using errcode='22023';
  end if;
 else raise exception '연령 설정을 확인해 주세요.' using errcode='22023';
 end case;
 if tg_op='UPDATE' then
  if (new.age_policy,new.min_age,new.max_age,new.owner_id) is not distinct from (old.age_policy,old.min_age,old.max_age,old.owner_id) then return new;end if;
 end if;
 if not ojjuda_groups_internal.age_matches(new.age_policy,new.min_age,new.max_age,ojjuda_groups_internal.registered_age(new.owner_id)) then
  raise exception '방장도 연령 조건에 맞아야 해요. 가입 시 입력한 생년월일을 기준으로 확인해요.' using errcode='42501';
 end if;
 if tg_op='UPDATE' and exists(select 1 from ojjuda_groups_internal.members m where m.room_id=new.id
  and not ojjuda_groups_internal.age_matches(new.age_policy,new.min_age,new.max_age,ojjuda_groups_internal.registered_age(m.user_id))) then
  raise exception '기존 그룹원 중 새 연령 조건에 맞지 않거나 생년월일 정보가 없는 회원이 있어 변경할 수 없어요.' using errcode='22023';
 end if;
 return new;
end $$;
create function ojjuda_groups_internal.guard_member_age()
returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from ojjuda_groups_internal.rooms where id=new.room_id for share;
 perform ojjuda_groups_internal.require_room_age(new.room_id,new.user_id);
 return new;
end $$;
create trigger group_room_age before insert or update of age_policy,min_age,max_age,owner_id
 on ojjuda_groups_internal.rooms for each row execute function ojjuda_groups_internal.guard_room_age();
create trigger group_member_age before insert or update of room_id,user_id
 on ojjuda_groups_internal.members for each row execute function ojjuda_groups_internal.guard_member_age();
create trigger group_request_age before insert or update of room_id,user_id
 on ojjuda_groups_internal.requests for each row execute function ojjuda_groups_internal.guard_member_age();
revoke all on function ojjuda_groups_internal.registered_age(uuid),ojjuda_groups_internal.age_matches(text,integer,integer,integer),
 ojjuda_groups_internal.age_allowed(uuid,uuid),ojjuda_groups_internal.age_details(uuid,uuid),
 ojjuda_groups_internal.require_room_age(uuid,uuid),ojjuda_groups_internal.guard_room_age(),ojjuda_groups_internal.guard_member_age()
 from public,anon,authenticated;

-- Preserve existing functionality and grants; fail on ambiguous or changed anchors.
do $patch$
declare e record;src text;n integer;
begin
 for e in select * from (values
 ('member(uuid)',$a$and exists(select 1 from ojjuda_groups_internal.rooms where id=r and not deleting)$a$,
  $b$and exists(select 1 from ojjuda_groups_internal.rooms where id=r and not deleting) and ojjuda_groups_internal.age_allowed(r,auth.uid())$b$,1),
 ('service(text,jsonb)',$a$jsonb_agg(x order by x.created_at desc) from (
    select a.id$a$,
  $b$jsonb_agg(to_jsonb(x)||ojjuda_groups_internal.age_details(x.id,u) order by x.created_at desc) from (
    select a.id$b$,1),
 ('service(text,jsonb)',$a$jsonb_agg(x order by x.created_at desc,x.id desc) from (
   select a.id$a$,
  $b$jsonb_agg(to_jsonb(x)||ojjuda_groups_internal.age_details(x.id,u) order by x.created_at desc,x.id desc) from (
   select a.id$b$,1),
 ('service(text,jsonb)',$a$insert into ojjuda_groups_internal.rooms(id,owner_id,name,description) values(coalesce(eid,gen_random_uuid()),u,trim(p->>'name'),coalesce(trim(p->>'description'),''))$a$,
  $b$insert into ojjuda_groups_internal.rooms(id,owner_id,name,description,age_policy,min_age,max_age) values(coalesce(eid,gen_random_uuid()),u,trim(p->>'name'),coalesce(trim(p->>'description'),''),coalesce(p->>'age_policy','all'),nullif(p->>'min_age','')::smallint,nullif(p->>'max_age','')::smallint)$b$,1),
 ('service(text,jsonb)',$a$if r is null then raise exception '그룹이나 초대코드를 확인해 주세요.'; end if;$a$,
  $b$if r is null then raise exception '그룹이나 초대코드를 확인해 주세요.'; end if;
  if p_action<>'cancel_request' then perform ojjuda_groups_internal.require_room_age(r,u);end if;$b$,1),
 ('service(text,jsonb)',$a$and exists(select 1 from ojjuda_groups_internal.rooms a where a.id=e.room_id and not a.deleting) and (r is null$a$,
  $b$and exists(select 1 from ojjuda_groups_internal.rooms a where a.id=e.room_id and not a.deleting) and ojjuda_groups_internal.age_allowed(e.room_id,u) and (r is null$b$,1),
 ('service(text,jsonb)',$a$where not a.deleting and (r is null or e.room_id=r)$a$,
  $b$where not a.deleting and ojjuda_groups_internal.age_allowed(a.id,u) and (r is null or e.room_id=r)$b$,1),
 ('service(text,jsonb)',$a$if p_action in ('members','requests','comments') then
  if not ojjuda_groups_internal.member(r) then$a$,
  $b$if p_action in ('members','requests','comments') then
  if not ojjuda_groups_internal.member(r) and not (p_action in ('members','requests') and exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u and not deleting)) then$b$,1),
 ('service(text,jsonb)',$a$if not ojjuda_groups_internal.member(r) then raise exception '그룹원만 이용할 수 있어요.' using errcode='42501'; end if;
 -- Serialize$a$,
  $b$if not ojjuda_groups_internal.member(r) and not (
  p_action='leave' and exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=u)
  or p_action in ('rename','transfer','reject','kick') and exists(select 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u and not deleting)
 ) then raise exception '그룹원만 이용할 수 있어요.' using errcode='42501'; end if;
 -- Serialize$b$,1),
 ('service(text,jsonb)',$a$update ojjuda_groups_internal.rooms set name=trim(p->>'name'),description=coalesce(trim(p->>'description'),'') where id=r;$a$,
  $b$update ojjuda_groups_internal.rooms set name=trim(p->>'name'),description=coalesce(trim(p->>'description'),''),
   age_policy=case when p ? 'age_policy' then p->>'age_policy' else age_policy end,
   min_age=case when p ? 'age_policy' then nullif(p->>'min_age','')::smallint else min_age end,
   max_age=case when p ? 'age_policy' then nullif(p->>'max_age','')::smallint else max_age end where id=r;$b$,1),
 ('invitation_service(text,jsonb)',$a$jsonb_agg(x order by x.created_at desc) from ($a$,
  $b$jsonb_agg(to_jsonb(x)||ojjuda_groups_internal.age_details(x.room_id,u) order by x.created_at desc) from ($b$,1),
 ('invitation_service(text,jsonb)',$a$'member',exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=u));$a$,
  $b$'member',exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=u))||ojjuda_groups_internal.age_details(r.id,u);$b$,1),
 ('invitation_service(text,jsonb)',$a$if p_action='accept' and i.status='accepted'$a$,
  $b$if p_action='accept' then perform ojjuda_groups_internal.require_room_age(r.id,u);end if;
  if p_action='accept' and i.status='accepted'$b$,1),
 ('invitation_service(text,jsonb)',$a$if not found or r.deleting then raise exception '사용할 수 없는 그룹이에요.' using errcode='42501'; end if;$a$,
  $b$if not found or r.deleting then raise exception '사용할 수 없는 그룹이에요.' using errcode='42501'; end if;
 perform ojjuda_groups_internal.require_room_age(r.id,u);$b$,1),
 ('invitation_service(text,jsonb)',$a$and ojjuda_groups_internal.invitable_peer(pr.id)$a$,
  $b$and ojjuda_groups_internal.invitable_peer(pr.id) and ojjuda_groups_internal.age_allowed(r.id,pr.id)$b$,1),
 ('invitation_service(text,jsonb)',$a$if exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=target) then raise exception '이미 가입한 그룹원이에요.'; end if;$a$,
  $b$perform ojjuda_groups_internal.require_room_age(r.id,target);
  if exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=target) then raise exception '이미 가입한 그룹원이에요.'; end if;$b$,1)
 ) as edits(signature,needle,replacement,expected)
 loop
  select pg_get_functiondef(to_regprocedure('ojjuda_groups_internal.'||e.signature)) into src;
  n:=(length(src)-length(replace(src,e.needle,'')))/length(e.needle);
  if src is null or n<>e.expected then raise exception 'Age migration anchor mismatch: % (% matches)',e.signature,n;end if;
  execute replace(src,e.needle,e.replacement);
 end loop;
end $patch$;
notify pgrst,'reload schema';
