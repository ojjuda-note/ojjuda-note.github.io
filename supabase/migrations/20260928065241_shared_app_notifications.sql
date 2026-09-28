-- Shared inbox: existing Note notifications plus visible World activity.
-- No content or anonymous author identity is copied into the inbox.
CREATE INDEX friendships_notifications_incoming ON public.friendships(addressee,created_at DESC) WHERE status='pending';
CREATE INDEX friendships_notifications_accepted ON public.friendships(requester,accepted_at DESC) WHERE status='accepted';
CREATE TABLE ojjuda_note_internal.world_notification_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_created_at timestamptz NOT NULL,
  read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,event_id,event_created_at)
);
ALTER TABLE ojjuda_note_internal.world_notification_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ojjuda_note_internal.world_notification_reads FROM PUBLIC,anon,authenticated;

CREATE FUNCTION ojjuda_note_internal.visible_app_notifications()
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
 SELECT w.id,w.kind,'world'::text,NULL::uuid,NULL::uuid,w.target_type,w.target_id,w.created_at,
 coalesce(r.read_at,w.existing_read_at)
 FROM (
  SELECT 'world:guestbook:'||g.id AS id,'world_guestbook'::text AS kind,'guestbook'::text AS target_type,g.id AS target_id,g.created_at,
   CASE WHEN g.is_read THEN g.created_at ELSE NULL::timestamptz END AS existing_read_at
  FROM public.guestbook g WHERE g.owner_id=viewer AND g.author_id<>viewer AND NOT g.hidden AND NOT public.blocked_between(viewer,g.author_id)
  UNION ALL
  SELECT 'world:friend_request:'||f.id,'world_friend_request','friends',f.id,f.created_at,NULL::timestamptz
  FROM public.friendships f WHERE f.addressee=viewer AND f.status='pending' AND NOT public.blocked_between(viewer,f.requester)
  UNION ALL
  SELECT 'world:friend_accepted:'||f.id,'world_friend_accepted','friends',f.id,coalesce(f.accepted_at,f.created_at),NULL::timestamptz
  FROM public.friendships f WHERE f.requester=viewer AND f.status='accepted' AND NOT public.blocked_between(viewer,f.addressee)
  UNION ALL
  SELECT 'world:comment:'||c.id,'world_comment','media',c.media_id,c.created_at,NULL::timestamptz
  FROM public.media_comments c JOIN public.media m ON m.id=c.media_id
  WHERE m.user_id=viewer AND c.author_id<>viewer AND NOT public.blocked_between(viewer,c.author_id)
 ) w LEFT JOIN ojjuda_note_internal.world_notification_reads r
 ON r.user_id=viewer AND r.event_id=w.id AND r.event_created_at=w.created_at;
END $$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.visible_app_notifications() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION ojjuda_note_internal.list_app_notifications(p_limit integer DEFAULT 30,p_before_created_at timestamptz DEFAULT NULL,p_before_id text DEFAULT NULL)
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
 'items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.id DESC) FROM page p),'[]'::jsonb),
 'unread_count',(SELECT count(*) FROM visible v WHERE v.read_at IS NULL),
 'has_more',(SELECT count(*)>p_limit FROM candidates),
 'next_cursor',CASE WHEN (SELECT count(*)>p_limit FROM candidates) THEN (SELECT jsonb_build_object('created_at',p.created_at,'id',p.id) FROM page p ORDER BY p.created_at,p.id LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION ojjuda_note_internal.app_notification_unread_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT count(*)::integer FROM ojjuda_note_internal.visible_app_notifications() n WHERE n.read_at IS NULL $$;

CREATE FUNCTION ojjuda_note_internal.mark_app_notifications_read(p_ids text[] DEFAULT NULL,p_expected_created_at timestamptz DEFAULT NULL,p_before timestamptz DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE viewer uuid:=auth.uid(); selected_ids text[]; note_ids uuid[]; changed integer:=0; world_changed integer:=0;
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
 IF note_ids IS NOT NULL THEN changed:=ojjuda_note_internal.mark_notifications_read(CASE WHEN p_ids IS NULL THEN NULL::uuid[] ELSE note_ids END,p_expected_created_at,p_before); END IF;
 INSERT INTO ojjuda_note_internal.world_notification_reads(user_id,event_id,event_created_at)
 SELECT viewer,v.id,v.created_at FROM ojjuda_note_internal.visible_app_notifications() v
 WHERE v.source='world' AND v.id=ANY(selected_ids) AND v.read_at IS NULL
 AND (p_before IS NULL OR v.created_at<=p_before)
 AND (p_expected_created_at IS NULL OR v.created_at=p_expected_created_at)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS world_changed=ROW_COUNT;
 -- Preserve the existing World guestbook's read indicator as well.
 UPDATE public.guestbook g SET is_read=true WHERE g.owner_id=viewer AND NOT g.is_read
 AND ('world:guestbook:'||g.id)=ANY(selected_ids)
 AND (p_before IS NULL OR g.created_at<=p_before)
 AND (p_expected_created_at IS NULL OR g.created_at=p_expected_created_at);
 RETURN changed+world_changed;
END $$;

CREATE FUNCTION public.list_app_notifications(p_limit integer DEFAULT 30,p_before_created_at timestamptz DEFAULT NULL,p_before_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT ojjuda_note_internal.list_app_notifications(p_limit,p_before_created_at,p_before_id) $$;
CREATE FUNCTION public.app_notification_unread_count()
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT ojjuda_note_internal.app_notification_unread_count() $$;
CREATE FUNCTION public.mark_app_notifications_read(p_ids text[] DEFAULT NULL,p_expected_created_at timestamptz DEFAULT NULL,p_before timestamptz DEFAULT NULL)
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT ojjuda_note_internal.mark_app_notifications_read(p_ids,p_expected_created_at,p_before) $$;

REVOKE ALL ON FUNCTION ojjuda_note_internal.list_app_notifications(integer,timestamptz,text),ojjuda_note_internal.app_notification_unread_count(),ojjuda_note_internal.mark_app_notifications_read(text[],timestamptz,timestamptz),public.list_app_notifications(integer,timestamptz,text),public.app_notification_unread_count(),public.mark_app_notifications_read(text[],timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.list_app_notifications(integer,timestamptz,text),ojjuda_note_internal.app_notification_unread_count(),ojjuda_note_internal.mark_app_notifications_read(text[],timestamptz,timestamptz),public.list_app_notifications(integer,timestamptz,text),public.app_notification_unread_count(),public.mark_app_notifications_read(text[],timestamptz,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';
