begin;

-- The old unscoped RPCs remain available to installed clients during rollout.
-- Replies to support tickets, sitewide bulletins and wallet gifts are shared.
CREATE FUNCTION ojjuda_note_internal.notification_in_app(p_app text,p_source text,p_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=''
AS $$
 SELECT p_app IN ('agit','park','pajang') AND CASE
   WHEN p_source IN ('updates','support') OR p_kind='visit_gift' THEN true
   WHEN p_source='note' THEN p_app='park'
   WHEN p_source='world' AND p_kind IN ('world_message','world_friend_request','world_friend_accepted')
     THEN p_app IN ('agit','park')
   WHEN p_source='world' THEN p_app='agit'
   WHEN p_source='pajang' THEN p_app='pajang'
   ELSE false END
$$;

CREATE FUNCTION ojjuda_note_internal.notification_page(p_app text, p_limit integer DEFAULT 30, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR ((p_before_created_at IS NULL)<>(p_before_id IS NULL))
    OR (p_before_created_at IS NOT NULL AND NOT isfinite(p_before_created_at)) OR length(p_before_id)>512 THEN
    RAISE EXCEPTION 'Invalid notification page' USING ERRCODE='22023'; END IF;
  WITH visible AS MATERIALIZED (
    SELECT v.* FROM ojjuda_note_internal.visible_app_notifications() v
    WHERE p_app IS NULL OR ojjuda_note_internal.notification_in_app(p_app,v.source,v.kind)
  ),
  candidates AS MATERIALIZED (SELECT v.* FROM visible v
    WHERE p_before_created_at IS NULL OR (v.created_at,v.id)<(p_before_created_at,p_before_id)
    ORDER BY v.created_at DESC,v.id DESC LIMIT p_limit+1),
  page AS MATERIALIZED (SELECT c.* FROM candidates c ORDER BY c.created_at DESC,c.id DESC LIMIT p_limit)
  SELECT jsonb_build_object('as_of',statement_timestamp(),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(p) || CASE
      WHEN p.kind='visit_gift' THEN jsonb_build_object('first_visit_ju',g.first_visit_ju,'launch_ju',g.launch_ju,'claimed',g.claimed_at is not null)
      when p.kind='drinking_invite' then (
        select jsonb_build_object('room_title',h.title,'sender_name',pr.nickname)
        from public.arcade_friend_invites i
        join ojjuda_arcade_internal.drinking_rooms h on h.code=i.room_code
        join public.profiles pr on pr.id=i.sender_id
        where i.id=p.target_id::uuid and i.recipient_id=auth.uid()
      )
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

CREATE OR REPLACE FUNCTION ojjuda_note_internal.list_app_notifications(p_limit integer DEFAULT 30,
 p_before_created_at timestamptz DEFAULT NULL,p_before_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT ojjuda_note_internal.notification_page(NULL,p_limit,p_before_created_at,p_before_id) $$;

CREATE FUNCTION public.list_app_notifications(p_app text,p_limit integer DEFAULT 30,
 p_before_created_at timestamptz DEFAULT NULL,p_before_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT ojjuda_note_internal.notification_page(coalesce(p_app,''),p_limit,p_before_created_at,p_before_id) $$;

CREATE FUNCTION ojjuda_note_internal.app_notification_unread_count(p_app text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT count(*)::integer FROM ojjuda_note_internal.visible_app_notifications() v
 WHERE v.read_at IS NULL AND ojjuda_note_internal.notification_in_app(p_app,v.source,v.kind) $$;
CREATE FUNCTION public.app_notification_unread_count(p_app text)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT ojjuda_note_internal.app_notification_unread_count(p_app) $$;
CREATE FUNCTION public.app_notification_summary(p_app text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT jsonb_build_object(
 'notifications',public.app_notification_unread_count(p_app),
 'retention',CASE WHEN p_app='park' THEN (
   SELECT count(*)::integer FROM ojjuda_note.list_retention_alerts() n
   WHERE n.read_at IS NULL AND n.id IS NOT NULL AND n.card_id IS NOT NULL
     AND isfinite(n.created_at) AND isfinite(n.archive_due_at)
 ) ELSE 0 END) $$;

CREATE FUNCTION ojjuda_note_internal.mark_app_notifications_read(p_app text,p_ids text[] DEFAULT NULL,
 p_expected_created_at timestamptz DEFAULT NULL,p_before timestamptz DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE batch text[]; changed integer:=0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_ids IS NOT NULL AND (cardinality(p_ids)>100 OR coalesce(array_ndims(p_ids),1)<>1 OR array_position(p_ids,NULL) IS NOT NULL) THEN
   RAISE EXCEPTION 'Invalid notification IDs' USING ERRCODE='22023'; END IF;
 IF (p_ids IS NULL AND p_before IS NULL) OR (p_before IS NOT NULL AND NOT isfinite(p_before))
   OR (p_expected_created_at IS NOT NULL AND (NOT isfinite(p_expected_created_at) OR p_ids IS NULL OR cardinality(p_ids)<>1)) THEN
   RAISE EXCEPTION 'Invalid read boundary' USING ERRCODE='22023'; END IF;
 -- Always pass explicit IDs, even for a bulk read. The existing writer rechecks
 -- ownership, visibility and the snapshot, and accepts up to 100 IDs per call.
 FOR batch IN
   SELECT array_agg(s.id) FROM (
     SELECT v.id,row_number() OVER (ORDER BY v.id) AS n
     FROM ojjuda_note_internal.visible_app_notifications() v
     WHERE ojjuda_note_internal.notification_in_app(p_app,v.source,v.kind) AND v.read_at IS NULL
       AND (p_ids IS NULL OR v.id=ANY(p_ids)) AND (p_before IS NULL OR v.created_at<=p_before)
       AND (p_expected_created_at IS NULL OR v.created_at=p_expected_created_at)
   ) s GROUP BY (s.n-1)/100
 LOOP
   changed:=changed+ojjuda_note_internal.mark_app_notifications_read(batch,p_expected_created_at,p_before);
 END LOOP;
 RETURN changed;
END $$;
CREATE FUNCTION public.mark_app_notifications_read(p_app text,p_ids text[] DEFAULT NULL,
 p_expected_created_at timestamptz DEFAULT NULL,p_before timestamptz DEFAULT NULL)
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT ojjuda_note_internal.mark_app_notifications_read(p_app,p_ids,p_expected_created_at,p_before) $$;

REVOKE ALL ON FUNCTION ojjuda_note_internal.notification_in_app(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ojjuda_note_internal.notification_page(text,integer,timestamptz,text),
 ojjuda_note_internal.app_notification_unread_count(text),
 ojjuda_note_internal.mark_app_notifications_read(text,text[],timestamptz,timestamptz),
 public.list_app_notifications(text,integer,timestamptz,text),
 public.app_notification_unread_count(text),
 public.app_notification_summary(text),
 public.mark_app_notifications_read(text,text[],timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.notification_page(text,integer,timestamptz,text),
 ojjuda_note_internal.app_notification_unread_count(text),
 ojjuda_note_internal.mark_app_notifications_read(text,text[],timestamptz,timestamptz),
 public.list_app_notifications(text,integer,timestamptz,text),
 public.app_notification_unread_count(text),
 public.app_notification_summary(text),
 public.mark_app_notifications_read(text,text[],timestamptz,timestamptz) TO authenticated;

NOTIFY pgrst,'reload schema';
commit;
