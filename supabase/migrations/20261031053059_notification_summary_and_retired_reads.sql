-- Retired World tables were emptied and made read-only on 2026-10-20.
-- Keep the existing public APIs and live notification privacy rules, while
-- removing their empty guestbook/media branches from each badge/inbox read.
begin;
set local lock_timeout = '5s';

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
 ) w LEFT JOIN ojjuda_note_internal.world_notification_reads r
 ON r.user_id=viewer AND r.event_id=w.id AND r.event_created_at=w.created_at;
END $$;

-- Badge polling needs two counts, not the retention cards' bodies and IDs.
-- Invoker rights delegate to the same scoped APIs used by existing clients.
CREATE FUNCTION public.app_notification_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$
 SELECT jsonb_build_object(
  'notifications',public.app_notification_unread_count(),
  'retention',(SELECT count(*)::integer FROM ojjuda_note.list_retention_alerts() n
   WHERE n.read_at IS NULL AND n.id IS NOT NULL AND n.card_id IS NOT NULL
    AND isfinite(n.created_at) AND isfinite(n.archive_due_at))
 );
$$;
REVOKE ALL ON FUNCTION public.app_notification_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.app_notification_summary() TO authenticated;

NOTIFY pgrst,'reload schema';
commit;
