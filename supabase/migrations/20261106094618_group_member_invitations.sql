begin;
set local lock_timeout='5s';

-- A new capability is separate from the legacy approval-only code.
alter table ojjuda_groups_internal.rooms add column share_code uuid not null default gen_random_uuid();
create unique index group_rooms_share_code on ojjuda_groups_internal.rooms(share_code);
create table ojjuda_groups_internal.invitations(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references ojjuda_groups_internal.rooms(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
 created_at timestamptz not null default clock_timestamp(),responded_at timestamptz,
 unique(room_id,recipient_id),check(sender_id<>recipient_id));
create index group_invitations_recipient on ojjuda_groups_internal.invitations(recipient_id,created_at desc) where status='pending';
create index group_invitations_sender on ojjuda_groups_internal.invitations(sender_id,created_at desc);
alter table ojjuda_groups_internal.invitations enable row level security;
revoke all on ojjuda_groups_internal.invitations from public,anon,authenticated;

create function ojjuda_groups_internal.invitable_peer(peer uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users a join public.profiles p on p.id=a.id
 where a.id=peer and not coalesce(a.is_anonymous,false) and a.deleted_at is null
 and (a.banned_until is null or a.banned_until<=now())
 and not exists(select 1 from public.user_private v where v.user_id=a.id and v.banned_until>now()))
 and not ojjuda_note_internal.friend_message_blocked(peer);
$$;
revoke all on function ojjuda_groups_internal.invitable_peer(uuid) from public,anon,authenticated;

create function ojjuda_groups_internal.invitation_room_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.invite_code is distinct from old.invite_code then new.share_code:=gen_random_uuid(); end if;
 if new.owner_id is distinct from old.owner_id or new.deleting then
  update ojjuda_groups_internal.invitations set status='cancelled',responded_at=clock_timestamp()
  where room_id=new.id and status='pending';
 end if;
 return new;
end $$;
create trigger group_invitation_room_changed before update on ojjuda_groups_internal.rooms
for each row execute function ojjuda_groups_internal.invitation_room_changed();
create function ojjuda_groups_internal.invitation_member_joined()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update ojjuda_groups_internal.invitations set status='accepted',responded_at=clock_timestamp()
 where room_id=new.room_id and recipient_id=new.user_id and status='pending';
 return new;
end $$;
create trigger group_invitation_member_joined after insert on ojjuda_groups_internal.members
for each row execute function ojjuda_groups_internal.invitation_member_joined();
revoke all on function ojjuda_groups_internal.invitation_room_changed(),ojjuda_groups_internal.invitation_member_joined() from public,anon,authenticated;

create function ojjuda_groups_internal.invitation_service(p_action text,p jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid();r ojjuda_groups_internal.rooms;i ojjuda_groups_internal.invitations;
 rid uuid:=nullif(p->>'room_id','')::uuid;target uuid:=nullif(p->>'user_id','')::uuid;q text:=trim(coalesce(p->>'query',''));
begin
 if not ojjuda_groups_internal.allowed() then raise exception '로그인이 필요하거나 이용할 수 없는 계정이에요.' using errcode='42501'; end if;
 if p_action='received' then
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
   select v.id,v.room_id,a.name group_name,pr.nickname sender_name,v.created_at
   from ojjuda_groups_internal.invitations v join ojjuda_groups_internal.rooms a on a.id=v.room_id
   join public.profiles pr on pr.id=v.sender_id
   where v.recipient_id=u and v.status='pending' and not a.deleting and a.owner_id=v.sender_id
   and ojjuda_groups_internal.invitable_peer(v.sender_id)
   and not exists(select 1 from ojjuda_groups_internal.members m where m.room_id=v.room_id and m.user_id=u)
   order by v.created_at desc limit 100) x),'[]');
 elsif p_action in ('preview_link','accept_link') then
  select * into r from ojjuda_groups_internal.rooms where share_code=nullif(p->>'code','')::uuid for update;
  if not found or r.deleting or not ojjuda_groups_internal.invitable_peer(r.owner_id) then raise exception '사용할 수 없는 초대 링크예요.' using errcode='42501'; end if;
  if p_action='accept_link' then
   insert into ojjuda_groups_internal.members(room_id,user_id) values(r.id,u) on conflict do nothing;
   delete from ojjuda_groups_internal.requests where room_id=r.id and user_id=u;
  end if;
  return jsonb_build_object('room_id',r.id,'group_name',r.name,'sender_name',(select nickname from public.profiles where id=r.owner_id),
   'member',exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=u));
 elsif p_action in ('accept','decline') then
  select v.room_id into rid from ojjuda_groups_internal.invitations v where v.id=nullif(p->>'id','')::uuid and v.recipient_id=u;
  select * into r from ojjuda_groups_internal.rooms where id=rid for update;
  if not found or r.deleting then raise exception '종료된 초대예요.' using errcode='42501'; end if;
  select * into i from ojjuda_groups_internal.invitations where id=nullif(p->>'id','')::uuid and recipient_id=u for update;
  if not found or i.sender_id<>r.owner_id or not ojjuda_groups_internal.invitable_peer(i.sender_id) then raise exception '사용할 수 없는 초대예요.' using errcode='42501'; end if;
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
 -- Only the current owner may look up recipients or send/revoke invitations.
 if p_action='send' then perform pg_advisory_xact_lock(hashtextextended(u::text,716)); end if;
 select * into r from ojjuda_groups_internal.rooms where id=rid for update;
 if not found or r.deleting or r.owner_id<>u then raise exception '방장만 초대할 수 있어요.' using errcode='42501'; end if;
 if p_action='search' then
  if length(q) not between 1 and 60 then return '[]'; end if;
  return coalesce((select jsonb_agg(x order by x.nickname,x.user_id) from (
   select pr.id user_id,pr.nickname,coalesce(v.status='pending',false) invited
   from public.profiles pr left join ojjuda_groups_internal.invitations v on v.room_id=r.id and v.recipient_id=pr.id
   where pr.id<>u and strpos(lower(pr.nickname),lower(q))>0 and ojjuda_groups_internal.invitable_peer(pr.id)
   and not exists(select 1 from ojjuda_groups_internal.members m where m.room_id=r.id and m.user_id=pr.id)
   order by pr.nickname,pr.id limit 20) x),'[]');
 elsif p_action='send' then
  if target is null or target=u or not ojjuda_groups_internal.invitable_peer(target) then raise exception '초대할 수 없는 회원이에요.' using errcode='42501'; end if;
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
  return jsonb_build_object('code',r.share_code,'group_name',r.name);
 else raise exception '지원하지 않는 요청이에요.' using errcode='22023';
 end if;
end $$;
create function public.group_invitation(p_action text,p_payload jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$select ojjuda_groups_internal.invitation_service(p_action,p_payload)$$;
revoke all on function ojjuda_groups_internal.invitation_service(text,jsonb),public.group_invitation(text,jsonb) from public,anon,authenticated;
grant execute on function ojjuda_groups_internal.invitation_service(text,jsonb),public.group_invitation(text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.visible_app_notifications()
RETURNS TABLE(id text,kind text,source text,card_id uuid,inquiry_id uuid,target_type text,target_id text,created_at timestamptz,read_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE viewer uuid:=auth.uid();
BEGIN
 IF viewer IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT 'note:'||n.id::text,n.kind,CASE WHEN n.kind='inquiry_reply' THEN 'support' ELSE 'note' END,
 n.card_id,n.inquiry_id,NULL::text,NULL::text,n.created_at,n.read_at
 FROM ojjuda_note_internal.visible_notifications() n
 UNION ALL
 SELECT w.id,w.kind,'world'::text,NULL::uuid,NULL::uuid,w.target_type,w.target_id,w.created_at,r.read_at
 FROM (
  SELECT 'world:friend_request:'||f.id AS id,'world_friend_request'::text AS kind,
   'friends'::text AS target_type,f.id AS target_id,f.created_at
  FROM public.friendships f WHERE f.addressee=viewer AND f.status='pending' AND NOT public.blocked_between(viewer,f.requester)
  UNION ALL
  SELECT 'world:friend_accepted:'||f.id,'world_friend_accepted','friends',f.id,coalesce(f.accepted_at,f.created_at)
  FROM public.friendships f WHERE f.requester=viewer AND f.status='accepted' AND NOT public.blocked_between(viewer,f.addressee)
  UNION ALL
  SELECT 'world:message:'||m.id::text,'world_message','message',m.id::text,m.created_at
  FROM ojjuda_note_internal.friend_messages m WHERE m.recipient_id=viewer AND NOT ojjuda_note_internal.friend_message_blocked(m.sender_id)
  UNION ALL
  SELECT 'world:group_invite:'||i.id::text,'group_invite','group_invite',i.id::text,i.created_at
  FROM ojjuda_groups_internal.invitations i JOIN ojjuda_groups_internal.rooms a ON a.id=i.room_id
  WHERE i.recipient_id=viewer AND i.status='pending' AND NOT a.deleting AND a.owner_id=i.sender_id
   AND ojjuda_groups_internal.allowed() AND ojjuda_groups_internal.invitable_peer(i.sender_id)
   AND NOT EXISTS(SELECT 1 FROM ojjuda_groups_internal.members m WHERE m.room_id=i.room_id AND m.user_id=viewer)
 ) w LEFT JOIN ojjuda_note_internal.world_notification_reads r
 ON r.user_id=viewer AND r.event_id=w.id AND r.event_created_at=w.created_at;
END $$;


CREATE OR REPLACE FUNCTION ojjuda_note_internal.list_app_notifications(p_limit integer DEFAULT 30,p_before_created_at timestamptz DEFAULT NULL,p_before_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR ((p_before_created_at IS NULL)<>(p_before_id IS NULL))
  OR (p_before_created_at IS NOT NULL AND NOT isfinite(p_before_created_at)) OR length(p_before_id)>512 THEN
  RAISE EXCEPTION 'Invalid notification page' USING ERRCODE='22023'; END IF;
 WITH visible AS MATERIALIZED (SELECT * FROM ojjuda_note_internal.visible_app_notifications()),
 candidates AS MATERIALIZED (SELECT v.* FROM visible v WHERE p_before_created_at IS NULL OR (v.created_at,v.id)<(p_before_created_at,p_before_id) ORDER BY v.created_at DESC,v.id DESC LIMIT p_limit+1),
 page AS MATERIALIZED (SELECT c.* FROM candidates c ORDER BY c.created_at DESC,c.id DESC LIMIT p_limit)
 SELECT jsonb_build_object('as_of',statement_timestamp(),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(p)||CASE WHEN p.kind='group_invite' THEN jsonb_build_object('group_name',a.name,'sender_name',pr.nickname) ELSE '{}'::jsonb END ORDER BY p.created_at DESC,p.id DESC) FROM page p LEFT JOIN ojjuda_groups_internal.invitations gi ON p.kind='group_invite' AND gi.id::text=p.target_id AND gi.recipient_id=auth.uid() LEFT JOIN ojjuda_groups_internal.rooms a ON a.id=gi.room_id LEFT JOIN public.profiles pr ON pr.id=gi.sender_id),'[]'::jsonb),
 'unread_count',(SELECT count(*) FROM visible v WHERE v.read_at IS NULL),
 'has_more',(SELECT count(*)>p_limit FROM candidates),
 'next_cursor',CASE WHEN (SELECT count(*)>p_limit FROM candidates) THEN (SELECT jsonb_build_object('created_at',p.created_at,'id',p.id) FROM page p ORDER BY p.created_at,p.id LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END $$;


NOTIFY pgrst,'reload schema';
commit;
