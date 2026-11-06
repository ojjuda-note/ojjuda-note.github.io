-- Show verified daily changes in the ordinary member inbox instead of a popup.
-- A one-off monthly recap uses the same inbox without creating one row per user.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE ojjuda_updates_internal.broadcast_notices (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 3 AND 80 AND id ~ '^[a-z0-9-]+$'),
  summary text NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 2 AND 180
    AND summary !~ '[\r\n<>]' AND summary !~* '(관리자|원고실|admin|manuscript)'),
  published_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz NOT NULL,
  source_sha text NOT NULL CHECK (source_sha ~ '^[0-9a-f]{40}$'),
  deployment_url text NOT NULL CHECK (deployment_url ~ '^https://github[.]com/ojjuda-note/ojjuda-note[.]github[.]io/actions/runs/[0-9]+$'),
  CHECK (expires_at > published_at AND expires_at <= published_at + interval '31 days')
);
CREATE TABLE ojjuda_updates_internal.broadcast_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notice_id text NOT NULL REFERENCES ojjuda_updates_internal.broadcast_notices(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (user_id, notice_id)
);
ALTER TABLE ojjuda_updates_internal.broadcast_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ojjuda_updates_internal.broadcast_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ojjuda_updates_internal.broadcast_notices,
  ojjuda_updates_internal.broadcast_reads FROM PUBLIC, anon, authenticated;
GRANT ALL ON ojjuda_updates_internal.broadcast_notices,
  ojjuda_updates_internal.broadcast_reads TO service_role;

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
  WHERE b.published_at<=statement_timestamp() AND statement_timestamp()<b.expires_at;
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
      WHEN p.kind='group_invite' THEN jsonb_build_object('group_name',a.name,'sender_name',pr.nickname)
      WHEN p.kind='daily_update' THEN jsonb_build_object('summary',left((
        SELECT string_agg(j.value->>'text',' · ' ORDER BY j.ordinality)
        FROM jsonb_array_elements(d.items) WITH ORDINALITY j(value,ordinality)),180))
      WHEN p.kind='broadcast_update' THEN jsonb_build_object('summary',b.summary)
      ELSE '{}'::jsonb END ORDER BY p.created_at DESC,p.id DESC)
    FROM page p
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

CREATE OR REPLACE FUNCTION ojjuda_note_internal.mark_app_notifications_read(
  p_ids text[] DEFAULT NULL,p_expected_created_at timestamptz DEFAULT NULL,p_before timestamptz DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE viewer uuid:=auth.uid(); selected_ids text[]; note_ids uuid[];
  changed integer:=0; world_changed integer:=0; daily_changed integer:=0; broadcast_changed integer:=0;
BEGIN
  IF viewer IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF p_ids IS NOT NULL AND (cardinality(p_ids)>100 OR coalesce(array_ndims(p_ids),1)<>1 OR array_position(p_ids,NULL) IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid notification IDs' USING ERRCODE='22023'; END IF;
  IF (p_ids IS NULL AND p_before IS NULL)
    OR (p_expected_created_at IS NOT NULL AND (NOT isfinite(p_expected_created_at) OR p_ids IS NULL OR cardinality(p_ids)<>1))
    OR (p_before IS NOT NULL AND NOT isfinite(p_before)) THEN
    RAISE EXCEPTION 'Invalid read boundary' USING ERRCODE='22023'; END IF;
  SELECT array_agg(v.id) INTO selected_ids FROM ojjuda_note_internal.visible_app_notifications() v
  WHERE v.read_at IS NULL AND (p_ids IS NULL OR v.id=ANY(p_ids))
    AND (p_before IS NULL OR v.created_at<=p_before)
    AND (p_expected_created_at IS NULL OR v.created_at=p_expected_created_at);
  IF selected_ids IS NULL THEN RETURN 0; END IF;
  SELECT array_agg(substring(x FROM 6)::uuid) INTO note_ids FROM unnest(selected_ids) x WHERE left(x,5)='note:';
  IF note_ids IS NOT NULL THEN
    changed:=ojjuda_note_internal.mark_notifications_read(CASE WHEN p_ids IS NULL THEN NULL::uuid[] ELSE note_ids END,p_expected_created_at,p_before);
  END IF;
  INSERT INTO ojjuda_note_internal.world_notification_reads(user_id,event_id,event_created_at)
  SELECT viewer,v.id,v.created_at FROM ojjuda_note_internal.visible_app_notifications() v
  WHERE v.source='world' AND v.id=ANY(selected_ids) AND v.read_at IS NULL
    AND (p_before IS NULL OR v.created_at<=p_before)
    AND (p_expected_created_at IS NULL OR v.created_at=p_expected_created_at)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS world_changed=ROW_COUNT;
  INSERT INTO ojjuda_updates_internal.notice_reads(user_id,report_date)
  SELECT viewer,n.report_date FROM ojjuda_updates_internal.daily_notices n
  WHERE ('daily:'||n.report_date::text)=ANY(selected_ids)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS daily_changed=ROW_COUNT;
  INSERT INTO ojjuda_updates_internal.broadcast_reads(user_id,notice_id)
  SELECT viewer,b.id FROM ojjuda_updates_internal.broadcast_notices b
  WHERE ('broadcast:'||b.id)=ANY(selected_ids)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS broadcast_changed=ROW_COUNT;
  RETURN changed+world_changed+daily_changed+broadcast_changed;
END $function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
