begin;
set local lock_timeout='5s';

create or replace function ojjuda_groups_internal.invitation_service(p_action text,p jsonb)
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
  if p_action='preview_link' then
   select * into r from ojjuda_groups_internal.rooms where share_code=nullif(p->>'code','')::uuid;
  else
   select * into r from ojjuda_groups_internal.rooms where share_code=nullif(p->>'code','')::uuid for update;
  end if;
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
 -- Members may read a shared invite link; recipient lookup, sending and rotation remain owner-only.
 if p_action='send' then perform pg_advisory_xact_lock(hashtextextended(u::text,716)); end if;
 if p_action='search' or (p_action='link' and not coalesce((p->>'rotate')::boolean,false)) then
  select * into r from ojjuda_groups_internal.rooms where id=rid;
 else
  select * into r from ojjuda_groups_internal.rooms where id=rid for update;
 end if;
 if not found or r.deleting then raise exception '사용할 수 없는 그룹이에요.' using errcode='42501'; end if;
 if p_action='link' and not coalesce((p->>'rotate')::boolean,false) then
  if r.owner_id<>u and not exists(select 1 from ojjuda_groups_internal.members where room_id=r.id and user_id=u) then
   raise exception '그룹원만 초대 링크를 공유할 수 있어요.' using errcode='42501';
  end if;
  return jsonb_build_object('code',r.share_code,'group_name',r.name);
 end if;
 if r.owner_id<>u then raise exception '방장만 이용할 수 있어요.' using errcode='42501'; end if;
 if p_action='search' then
  if length(q)>60 then return '[]'; end if;
  return coalesce((select jsonb_agg(x order by x.created_at desc,x.user_id desc) from (
   select pr.id user_id,pr.nickname,pr.created_at,coalesce(v.status='pending',false) invited
   from public.profiles pr left join ojjuda_groups_internal.invitations v on v.room_id=r.id and v.recipient_id=pr.id
   where pr.id<>u and (q='' or strpos(lower(pr.nickname),lower(q))>0) and ojjuda_groups_internal.invitable_peer(pr.id)
   and not exists(select 1 from ojjuda_groups_internal.members m where m.room_id=r.id and m.user_id=pr.id)
   and (nullif(p->>'before','') is null or (pr.created_at,pr.id)<((p->>'before')::timestamptz,(p->>'before_id')::uuid))
   order by pr.created_at desc,pr.id desc limit 31) x),'[]');
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

NOTIFY pgrst,'reload schema';
commit;
