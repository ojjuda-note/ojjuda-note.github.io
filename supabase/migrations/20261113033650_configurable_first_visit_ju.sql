-- Reserve the gift at the first visit. Only an explicit inbox claim credits the wallet.
insert into public.app_config(key,value)
values ('first_visit_ju','10000'::jsonb) on conflict (key) do nothing;

create function ojjuda_rewards_internal.set_first_visit_ju(p_amount integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'not_admin' using errcode='42501';
  end if;
  if p_amount is null or p_amount not between 0 and 1000000 then
    raise exception 'invalid_first_visit_ju' using errcode='22023';
  end if;
  update public.app_config set value=to_jsonb(p_amount),updated_at=now() where key='first_visit_ju';
  if not found then raise exception 'missing_first_visit_setting'; end if;
end;
$$;
create function public.admin_set_first_visit_ju(p_amount integer)
returns void language sql security invoker set search_path='' as $$
  select ojjuda_rewards_internal.set_first_visit_ju(p_amount);
$$;

create table ojjuda_rewards_internal.visit_gifts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_visit_ju integer not null check (first_visit_ju between 0 and 1000000),
  launch_ju integer not null check (launch_ju in (0,10000)),
  offered_at timestamptz not null default statement_timestamp(),
  claimed_at timestamptz,
  check (first_visit_ju + launch_ju > 0)
);
alter table ojjuda_rewards_internal.visit_gifts enable row level security;
revoke all on ojjuda_rewards_internal.visit_gifts from public,anon,authenticated;

create or replace function public.user_private_defaults()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.coins := 0;
  new.owned := '{}';
  new.last_checkin := null;
  return new;
end;
$$;
alter table public.user_private alter column coins set default 0;

create function ojjuda_rewards_internal.reserve_visit_gift()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  signup_amount integer := 0;
  launch_amount integer := 0;
  cutoff constant timestamptz := '2026-11-16 00:00:00+09';
  signed_in_at timestamptz;
  member_id uuid;
  new_member boolean;
begin
  -- Wallet INSERT and first sign-in can arrive in either order.
  if tg_table_schema='auth' then
    if new.is_anonymous is true or new.last_sign_in_at is null then return null; end if;
    signed_in_at := new.last_sign_in_at;
    member_id := new.id;
    new_member := not exists(select 1 from public.user_private w where w.user_id=member_id);
  else
    member_id := new.user_id;
    select u.last_sign_in_at into signed_in_at from auth.users u
      where u.id=member_id and not coalesce(u.is_anonymous,false);
    if not found then return null; end if;
    new_member := tg_op='INSERT';
    if tg_op='UPDATE' and statement_timestamp() >= cutoff then return null; end if;
  end if;
  if exists(select 1 from ojjuda_rewards_internal.visit_gifts where user_id=member_id) then return null; end if;
  if new_member then
    select (value::text)::integer into strict signup_amount from public.app_config where key='first_visit_ju';
  end if;
  if statement_timestamp() < cutoff or signed_in_at < cutoff then launch_amount := 10000; end if;
  if signup_amount + launch_amount > 0 then
    insert into ojjuda_rewards_internal.visit_gifts(user_id,first_visit_ju,launch_ju)
    values(member_id,signup_amount,launch_amount) on conflict(user_id) do nothing;
  end if;
  return null;
end;
$$;
create trigger reserve_visit_gift after insert or update of last_seen_at on public.user_private
for each row execute function ojjuda_rewards_internal.reserve_visit_gift();
create trigger reserve_launch_gift_at_login after update of last_sign_in_at on auth.users
for each row when (new.last_sign_in_at is distinct from old.last_sign_in_at and
  new.last_sign_in_at < timestamptz '2026-11-16 00:00:00+09')
execute function ojjuda_rewards_internal.reserve_visit_gift();

-- Accounts with a recorded visit already qualify, even if they return after Sunday.
insert into ojjuda_rewards_internal.visit_gifts(user_id,first_visit_ju,launch_ju)
select w.user_id,0,10000 from public.user_private w join auth.users u on u.id=w.user_id
where not coalesce(u.is_anonymous,false) and (
  u.last_sign_in_at < timestamptz '2026-11-16 00:00:00+09'
  or w.last_seen_at < timestamptz '2026-11-16 00:00:00+09'
  or exists(select 1 from ojjuda_account_internal.member_navigation_history h where h.user_id=w.user_id and h.created_at < timestamptz '2026-11-16 00:00:00+09')
  or exists(select 1 from ojjuda_rewards_internal.activity_days a where a.user_id=w.user_id and a.active_day<=date '2026-11-15'))
on conflict(user_id) do nothing;

create function ojjuda_rewards_internal.claim_visit_gift(p_member uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  viewer uuid := auth.uid();
  gift ojjuda_rewards_internal.visit_gifts;
  balance integer;
  amount integer;
begin
  if viewer is null or p_member is distinct from viewer or public.is_banned(viewer) then
    raise exception 'member_required' using errcode='42501';
  end if;
  select w.coins into strict balance from public.user_private w where w.user_id=viewer for update;
  select * into strict gift from ojjuda_rewards_internal.visit_gifts g where g.user_id=viewer for update;
  amount := gift.first_visit_ju + gift.launch_ju;
  if gift.claimed_at is null then
    update public.user_private set coins=coins+amount where user_id=viewer returning coins into balance;
    update ojjuda_rewards_internal.visit_gifts set claimed_at=statement_timestamp() where user_id=viewer;
  end if;
  return jsonb_build_object('amount',amount,'coins',balance,'replayed',gift.claimed_at is not null);
end;
$$;
create function public.claim_visit_gift(p_member uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select ojjuda_rewards_internal.claim_visit_gift(p_member);
$$;
revoke all on function ojjuda_rewards_internal.reserve_visit_gift() from public,anon,authenticated;
revoke all on function ojjuda_rewards_internal.claim_visit_gift(uuid),public.claim_visit_gift(uuid),
  ojjuda_rewards_internal.set_first_visit_ju(integer),public.admin_set_first_visit_ju(integer) from public,anon,authenticated;
grant execute on function ojjuda_rewards_internal.claim_visit_gift(uuid),public.claim_visit_gift(uuid),
  ojjuda_rewards_internal.set_first_visit_ju(integer),public.admin_set_first_visit_ju(integer) to authenticated;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.visible_app_notifications()
RETURNS TABLE(id text,kind text,source text,card_id uuid,inquiry_id uuid,target_type text,target_id text,created_at timestamptz,read_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE viewer uuid := auth.uid();
BEGIN
  IF viewer IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501'; END IF;
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
    ON r.user_id=viewer AND r.event_id=w.id AND r.event_created_at=w.created_at
  UNION ALL
  SELECT 'daily:'||n.report_date::text,'daily_update'::text,'updates'::text,
    NULL::uuid,NULL::uuid,'update'::text,n.report_date::text,n.available_at,r.read_at
  FROM ojjuda_updates_internal.daily_notices n
  LEFT JOIN ojjuda_updates_internal.notice_reads r ON r.user_id=viewer AND r.report_date=n.report_date
  WHERE n.available_at<=statement_timestamp() AND statement_timestamp()<n.available_at+interval '24 hours'
  UNION ALL
  SELECT 'broadcast:'||b.id,'broadcast_update'::text,'updates'::text,
    NULL::uuid,NULL::uuid,'update'::text,b.id,b.published_at,r.read_at
  FROM ojjuda_updates_internal.broadcast_notices b
  LEFT JOIN ojjuda_updates_internal.broadcast_reads r ON r.user_id=viewer AND r.notice_id=b.id
  WHERE b.published_at<=statement_timestamp() AND statement_timestamp()<b.expires_at
  UNION ALL
  SELECT 'world:visit_gift','visit_gift','world',NULL::uuid,NULL::uuid,'visit_gift',NULL::text,
    g.offered_at,coalesce(g.claimed_at,rr.read_at)
  FROM ojjuda_rewards_internal.visit_gifts g
  LEFT JOIN ojjuda_note_internal.world_notification_reads rr ON rr.user_id=g.user_id
    AND rr.event_id='world:visit_gift' AND rr.event_created_at=g.offered_at
  WHERE g.user_id=viewer;
END $function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.list_app_notifications(
  p_limit integer DEFAULT 30,p_before_created_at timestamptz DEFAULT NULL,p_before_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR ((p_before_created_at IS NULL)<>(p_before_id IS NULL))
    OR (p_before_created_at IS NOT NULL AND NOT isfinite(p_before_created_at)) OR length(p_before_id)>512 THEN
    RAISE EXCEPTION 'Invalid notification page' USING ERRCODE='22023'; END IF;
  WITH visible AS MATERIALIZED (SELECT * FROM ojjuda_note_internal.visible_app_notifications()),
  candidates AS MATERIALIZED (SELECT v.* FROM visible v
    WHERE p_before_created_at IS NULL OR (v.created_at,v.id)<(p_before_created_at,p_before_id)
    ORDER BY v.created_at DESC,v.id DESC LIMIT p_limit+1),
  page AS MATERIALIZED (SELECT c.* FROM candidates c ORDER BY c.created_at DESC,c.id DESC LIMIT p_limit)
  SELECT jsonb_build_object('as_of',statement_timestamp(),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(p) || CASE
      WHEN p.kind='visit_gift' THEN jsonb_build_object('first_visit_ju',g.first_visit_ju,'launch_ju',g.launch_ju,'claimed',g.claimed_at is not null)
      WHEN p.kind='group_invite' THEN jsonb_build_object('group_name',a.name,'sender_name',pr.nickname)
      WHEN p.kind='daily_update' THEN jsonb_build_object('summary',left((
        SELECT string_agg(j.value->>'text',' · ' ORDER BY j.ordinality)
        FROM jsonb_array_elements(d.items) WITH ORDINALITY j(value,ordinality)),180))
      WHEN p.kind='broadcast_update' THEN jsonb_build_object('summary',b.summary)
      ELSE '{}'::jsonb END ORDER BY p.created_at DESC,p.id DESC)
    FROM page p
    LEFT JOIN ojjuda_rewards_internal.visit_gifts g ON p.kind='visit_gift' AND g.user_id=auth.uid()
    LEFT JOIN ojjuda_groups_internal.invitations gi ON p.kind='group_invite'
      AND gi.id::text=p.target_id AND gi.recipient_id=auth.uid()
    LEFT JOIN ojjuda_groups_internal.rooms a ON a.id=gi.room_id
    LEFT JOIN public.profiles pr ON pr.id=gi.sender_id
    LEFT JOIN ojjuda_updates_internal.daily_notices d ON p.kind='daily_update' AND d.report_date::text=p.target_id
    LEFT JOIN ojjuda_updates_internal.broadcast_notices b ON p.kind='broadcast_update' AND b.id=p.target_id
    ),'[]'::jsonb),
    'unread_count',(SELECT count(*) FROM visible v WHERE v.read_at IS NULL),
    'has_more',(SELECT count(*)>p_limit FROM candidates),
    'next_cursor',CASE WHEN (SELECT count(*)>p_limit FROM candidates)
      THEN (SELECT jsonb_build_object('created_at',p.created_at,'id',p.id)
        FROM page p ORDER BY p.created_at,p.id LIMIT 1) ELSE NULL END) INTO result;
  RETURN result;
END $function$;

notify pgrst,'reload schema';
