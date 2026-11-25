-- Each new group chooses open or password entry. Existing approval settings
-- remain in place until the owner explicitly changes the group's password.
set local lock_timeout = '5s';

create table ojjuda_groups_internal.room_access (
 room_id uuid primary key references ojjuda_groups_internal.rooms(id) on delete cascade,
 revision bigint not null default 1 check (revision > 0),
 password_hash text
);
create table ojjuda_groups_internal.password_confirmations (
 room_id uuid not null, user_id uuid not null, revision bigint not null,
 primary key(room_id,user_id),
 foreign key(room_id,user_id) references ojjuda_groups_internal.members(room_id,user_id)
   on delete cascade deferrable initially deferred
);
create table ojjuda_groups_internal.password_attempts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 started_at timestamptz not null, failures integer not null
);
alter table ojjuda_groups_internal.room_access enable row level security;
alter table ojjuda_groups_internal.password_confirmations enable row level security;
alter table ojjuda_groups_internal.password_attempts enable row level security;
revoke all on ojjuda_groups_internal.room_access, ojjuda_groups_internal.password_confirmations,
 ojjuda_groups_internal.password_attempts from public, anon, authenticated;

create function ojjuda_groups_internal.password_current(r uuid, peer uuid)
returns boolean language sql stable set search_path='' as $$
 select not exists(
  select 1 from ojjuda_groups_internal.room_access a join ojjuda_groups_internal.rooms g on g.id=a.room_id
  where a.room_id=r and a.password_hash is not null and g.owner_id<>peer and not exists(
   select 1 from ojjuda_groups_internal.password_confirmations c
   where c.room_id=r and c.user_id=peer and c.revision=a.revision
  )
 );
$$;

create function ojjuda_groups_internal.require_current_password(r uuid)
returns void language plpgsql stable set search_path='' as $$
begin
 if not ojjuda_groups_internal.password_current(r,auth.uid()) and exists(
  select 1 from ojjuda_groups_internal.members where room_id=r and user_id=auth.uid()
 ) then raise exception '그룹 비밀번호를 다시 입력해 주세요.' using errcode='42501'; end if;
end $$;

create function ojjuda_groups_internal.room_access_details(r uuid, peer uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'join_mode',case when a.room_id is null then 'legacy' when a.password_hash is null then 'open' else 'password' end,
  'password_required',a.password_hash is not null,
  'password_confirmation_required',a.password_hash is not null
   and exists(select 1 from ojjuda_groups_internal.members m where m.room_id=r and m.user_id=peer)
   and not ojjuda_groups_internal.password_current(r,peer),
  'password_revision',coalesce(a.revision,0)
 ) from (select r as id) g left join ojjuda_groups_internal.room_access a on a.room_id=g.id;
$$;

create or replace function ojjuda_groups_internal.member(r uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and ojjuda_groups_internal.allowed()
  and exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=auth.uid())
  and exists(select 1 from ojjuda_groups_internal.rooms where id=r and not deleting)
  and ojjuda_groups_internal.age_allowed(r,auth.uid())
  and ojjuda_groups_internal.password_current(r,auth.uid());
$$;

create function ojjuda_groups_internal.set_room_password(r uuid, secret text, expected_revision bigint default null)
returns jsonb language plpgsql set search_path='' as $$
declare u uuid:=auth.uid(); previous ojjuda_groups_internal.room_access; new_hash text; current_revision bigint;
begin
 perform 1 from ojjuda_groups_internal.rooms where id=r and owner_id=u and not deleting for update;
 if not found then raise exception '방장만 비밀번호를 설정할 수 있어요.' using errcode='42501'; end if;
 if secret is null or octet_length(secret)>72 then raise exception '비밀번호는 72바이트까지 입력해 주세요.' using errcode='22023'; end if;
 select * into previous from ojjuda_groups_internal.room_access where room_id=r;
 if found and ((secret='' and previous.password_hash is null)
    or (secret<>'' and extensions.crypt(secret,previous.password_hash)=previous.password_hash))
 then return jsonb_build_object('ok',true); end if;
 if expected_revision is not null and expected_revision<>coalesce(previous.revision,0) then
  raise exception '다른 화면에서 비밀번호를 변경했어요. 그룹을 다시 열어 주세요.' using errcode='40001';
 end if;
 if secret<>'' then new_hash:=extensions.crypt(secret,extensions.gen_salt('bf',10)); end if;
 insert into ojjuda_groups_internal.room_access as a(room_id,password_hash) values(r,new_hash)
 on conflict(room_id) do update set revision=a.revision+1,password_hash=excluded.password_hash
 returning revision into current_revision;
 update ojjuda_groups_internal.rooms set auto_join=true where id=r and not auto_join;
 insert into ojjuda_groups_internal.password_confirmations(room_id,user_id,revision)
 values(r,u,current_revision) on conflict(room_id,user_id) do update set revision=excluded.revision;
 return jsonb_build_object('ok',true);
end $$;

-- Authorized admission paths hold the room row lock and create the membership
-- in this same transaction. The deferred FK never leaves proof for a nonmember.
create function ojjuda_groups_internal.check_room_password(r uuid, secret text)
returns jsonb language plpgsql set search_path='' as $$
declare u uuid:=auth.uid(); gate ojjuda_groups_internal.room_access;
 attempt ojjuda_groups_internal.password_attempts; now_at timestamptz; matches boolean;
begin
 select * into gate from ojjuda_groups_internal.room_access where room_id=r;
 if not found then return null; end if;
 if not exists(select 1 from ojjuda_groups_internal.rooms where id=r and
     (owner_id=u or ojjuda_groups_internal.invitable_peer(owner_id))) then
  raise exception '이 그룹에 가입할 수 없어요.' using errcode='42501';
 end if;
 if gate.password_hash is null or ojjuda_groups_internal.password_current(r,u) then return null; end if;
 if coalesce(secret,'')='' then
  return jsonb_build_object('ok',false,'reason','password_required','message','그룹 비밀번호를 입력해 주세요.');
 end if;
 -- One counter per account across all rooms and invitation methods. Returning
 -- errors as data commits failed attempts without accepting an invitation.
 perform pg_advisory_xact_lock(hashtextextended(u::text,472881));
 now_at:=clock_timestamp();
 select * into attempt from ojjuda_groups_internal.password_attempts where user_id=u;
 if found and attempt.started_at>now_at-interval '5 minutes' and attempt.failures>=8 then
  return jsonb_build_object('ok',false,'reason','password_rate_limited','message','잠시 후 다시 입력해 주세요.');
 end if;
 matches:=case when octet_length(secret)<=72 then extensions.crypt(secret,gate.password_hash)=gate.password_hash else false end;
 if not matches then
  insert into ojjuda_groups_internal.password_attempts as a(user_id,started_at,failures) values(u,now_at,1)
  on conflict(user_id) do update set
   started_at=case when a.started_at<=now_at-interval '5 minutes' then now_at else a.started_at end,
   failures=case when a.started_at<=now_at-interval '5 minutes' then 1 else a.failures+1 end;
  return jsonb_build_object('ok',false,'reason','password_incorrect','message','그룹 비밀번호가 맞지 않아요.');
 end if;
 insert into ojjuda_groups_internal.password_confirmations(room_id,user_id,revision) values(r,u,gate.revision)
 on conflict(room_id,user_id) do update set revision=excluded.revision;
 return null;
end $$;

-- Recheck the actual table insertion as well as the RPC. A pending manual
-- request from before a password was set cannot be approved past this guard.
create function ojjuda_groups_internal.guard_member_password()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from ojjuda_groups_internal.rooms where id=new.room_id for share;
 if not ojjuda_groups_internal.password_current(new.room_id,new.user_id) then
  raise exception '가입하려는 회원이 그룹 비밀번호를 확인해야 해요.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger group_member_password before insert on ojjuda_groups_internal.members
 for each row execute function ojjuda_groups_internal.guard_member_password();

revoke all on function ojjuda_groups_internal.password_current(uuid,uuid),
 ojjuda_groups_internal.require_current_password(uuid),ojjuda_groups_internal.room_access_details(uuid,uuid),
 ojjuda_groups_internal.set_room_password(uuid,text,bigint),ojjuda_groups_internal.check_room_password(uuid,text),
 ojjuda_groups_internal.guard_member_password() from public,anon,authenticated;

-- Extend the existing implementations (including live directory sorting,
-- moderation, age checks and media handling). Keep their OIDs and ACLs.
do $patch$
declare e record; src text; n integer;
begin
 for e in select * from (values
 ('age_details(uuid,uuid)', $a$from (select t.*,a,$a$, $b$||ojjuda_groups_internal.room_access_details(r,peer)
 from (select t.*,a,$b$,1),
 ('service(text,jsonb)', $a$if p_action in ('activity_state','activity_vote','activity_draw') then$a$,
 $b$if p_action='set_password' then
  if jsonb_typeof(p->'password') is distinct from 'string' then raise exception '비밀번호를 확인해 주세요.' using errcode='22023';end if;
  return ojjuda_groups_internal.set_room_password(r,p->>'password',(p->>'expected_revision')::bigint);
 elsif p_action='unlock' then
  perform 1 from ojjuda_groups_internal.rooms where id=r and not deleting for share;
  if not found or not exists(select 1 from ojjuda_groups_internal.members where room_id=r and user_id=u) then
   raise exception '그룹원만 이용할 수 있어요.' using errcode='42501';end if;
  perform ojjuda_groups_internal.require_room_age(r,u);
  v:=ojjuda_groups_internal.check_room_password(r,p->>'password');
  return coalesce(v,jsonb_build_object('id',r,'ok',true,'member',true));
 end if;
 if p_action in ('activity_state','activity_vote','activity_draw') then$b$,1),
 ('service(text,jsonb)', $a$insert into ojjuda_groups_internal.members values(r,u,clock_timestamp());$a$,
 $b$if p ? 'password' and jsonb_typeof(p->'password') is distinct from 'string' then
   raise exception '비밀번호를 확인해 주세요.' using errcode='22023';end if;
  perform ojjuda_groups_internal.set_room_password(r,coalesce(p->>'password',''));
  insert into ojjuda_groups_internal.members values(r,u,clock_timestamp());$b$,1),
 ('service(text,jsonb)', $a$if p_action<>'cancel_request' then perform ojjuda_groups_internal.require_room_age(r,u);end if;$a$,
 $b$if p_action<>'cancel_request' then
   perform ojjuda_groups_internal.require_room_age(r,u);
   v:=ojjuda_groups_internal.check_room_password(r,p->>'password');
   if v is not null then return v;end if;
  end if;$b$,1),
 ('service(text,jsonb)', $a$if p_action in ('feed','calendar') then$a$,
 $b$if p_action in ('feed','calendar') then
  if r is not null then perform ojjuda_groups_internal.require_current_password(r);end if;$b$,1),
 ('service(text,jsonb)', $a$and ojjuda_groups_internal.age_allowed(e.room_id,u) and (r is null$a$,
 $b$and ojjuda_groups_internal.age_allowed(e.room_id,u) and ojjuda_groups_internal.password_current(e.room_id,u) and (r is null$b$,1),
 ('service(text,jsonb)', $a$and ojjuda_groups_internal.age_allowed(a.id,u) and (r is null$a$,
 $b$and ojjuda_groups_internal.age_allowed(a.id,u) and ojjuda_groups_internal.password_current(a.id,u) and (r is null$b$,1),
 ('service(text,jsonb)', $a$-- Read-only lists do not acquire the room's write lock.$a$,
 $b$if p_action<>'leave' then perform ojjuda_groups_internal.require_current_password(r);end if;
 -- Read-only lists do not acquire the room's write lock.$b$,1),
 ('service(text,jsonb)', $a$perform 1 from ojjuda_groups_internal.rooms where id=r for update;
 if not exists$a$,
 $b$perform 1 from ojjuda_groups_internal.rooms where id=r for update;
 if p_action<>'leave' then perform ojjuda_groups_internal.require_current_password(r);end if;
 if not exists$b$,1),
 ('service(text,jsonb)', $a$auto_join=case when p ? 'auto_join' then$a$,
 $b$auto_join=case when exists(select 1 from ojjuda_groups_internal.room_access where room_id=r) then true
   when p ? 'auto_join' then$b$,1),
 ('activity_action(text,jsonb)', $a$if not ojjuda_groups_internal.member(r) then$a$,
 $b$perform ojjuda_groups_internal.require_current_password(r);
  if not ojjuda_groups_internal.member(r) then$b$,1),
 ('invitation_service(text,jsonb)', $a$q text:=trim(coalesce(p->>'query',''));$a$,
 $b$q text:=trim(coalesce(p->>'query','')); password_error jsonb;$b$,1),
 ('invitation_service(text,jsonb)', $a$if p_action='accept_link' then
   insert into$a$,
 $b$if p_action='accept_link' then
   perform ojjuda_groups_internal.require_room_age(r.id,u);
   password_error:=ojjuda_groups_internal.check_room_password(r.id,p->>'password');
   if password_error is not null then return password_error;end if;
   insert into$b$,1),
 ('invitation_service(text,jsonb)', $a$if p_action='accept' and i.status='accepted'$a$,
 $b$if p_action='accept' and i.status in ('accepted','pending') and
    (i.status='pending' or exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=u)) then
   password_error:=ojjuda_groups_internal.check_room_password(r.id,p->>'password');
   if password_error is not null then return password_error;end if;
  end if;
  if p_action='accept' and i.status='accepted'$b$,1),
 ('invitation_service(text,jsonb)', $a$if p_action='link' and not coalesce((p->>'rotate')::boolean,false) then$a$,
 $b$perform ojjuda_groups_internal.require_current_password(r.id);
 if p_action='link' and not coalesce((p->>'rotate')::boolean,false) then$b$,1)
 ) as edits(signature,needle,replacement,expected)
 loop
  src:=pg_get_functiondef(to_regprocedure('ojjuda_groups_internal.'||e.signature));
  n:=(length(src)-length(replace(src,e.needle,'')))/length(e.needle);
  if src is null or n<>e.expected then raise exception 'Group password migration anchor mismatch: % (% matches)',e.signature,n;end if;
  execute replace(src,e.needle,e.replacement);
 end loop;
end $patch$;
notify pgrst,'reload schema';
