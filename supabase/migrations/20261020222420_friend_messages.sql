-- Friend-only notes. All message access goes through scoped RPCs.
CREATE TABLE ojjuda_note_internal.friend_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000 AND octet_length(body)<=4000),
 request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(sender_id<>recipient_id), UNIQUE(sender_id,request_id)
);
CREATE INDEX friend_messages_inbox ON ojjuda_note_internal.friend_messages(recipient_id,created_at DESC,id DESC);
CREATE INDEX friend_messages_sent ON ojjuda_note_internal.friend_messages(sender_id,created_at DESC,id DESC);
CREATE INDEX friend_messages_pair ON ojjuda_note_internal.friend_messages(least(sender_id,recipient_id),greatest(sender_id,recipient_id),created_at DESC,id DESC);
CREATE TABLE ojjuda_note_internal.friend_message_access_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 message_ids uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX friend_message_access_admin ON ojjuda_note_internal.friend_message_access_log(admin_id,created_at DESC);
ALTER TABLE ojjuda_note_internal.friend_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ojjuda_note_internal.friend_message_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ojjuda_note_internal.friend_messages,ojjuda_note_internal.friend_message_access_log FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE ojjuda_note_internal.friend_message_access_log_id_seq FROM PUBLIC,anon,authenticated;

CREATE FUNCTION ojjuda_note_internal.friend_message_blocked(p_peer uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE viewer uuid:=auth.uid();
BEGIN
 IF viewer IS NULL THEN RAISE EXCEPTION 'sign_in_required' USING ERRCODE='42501'; END IF;
 RETURN EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker=viewer AND b.blocked=p_peer) OR (b.blocker=p_peer AND b.blocked=viewer))
 OR EXISTS(SELECT 1 FROM ojjuda_note_internal.blocks b WHERE (b.blocker_id=viewer AND b.blocked_id=p_peer) OR (b.blocker_id=p_peer AND b.blocked_id=viewer));
END $$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.friend_message_blocked(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION ojjuda_note_internal.send_friend_message(p_recipient uuid,p_body text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE viewer uuid:=auth.uid(); clean text:=regexp_replace(p_body,'^\s+|\s+$','','g'); item ojjuda_note_internal.friend_messages;
BEGIN
 IF viewer IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=viewer) THEN RAISE EXCEPTION 'sign_in_required' USING ERRCODE='42501'; END IF;
 IF p_recipient IS NULL OR viewer=p_recipient OR p_request IS NULL OR clean IS NULL OR length(clean) NOT BETWEEN 1 AND 1000 OR octet_length(clean)>4000 THEN RAISE EXCEPTION 'invalid_message' USING ERRCODE='22023'; END IF;
 -- Serialize this sender's retries/rate checks without locking any other account.
 PERFORM pg_advisory_xact_lock(hashtextextended('friend_message:'||viewer::text,0));
 IF public.is_banned(viewer) OR ojjuda_note_internal.friend_message_blocked(p_recipient)
 OR NOT EXISTS(SELECT 1 FROM public.friendships f WHERE f.status='accepted' AND ((f.requester=viewer AND f.addressee=p_recipient) OR (f.requester=p_recipient AND f.addressee=viewer)))
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_recipient) THEN RAISE EXCEPTION 'friend_message_unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM ojjuda_note_internal.friend_messages WHERE sender_id=viewer AND request_id=p_request;
 IF FOUND THEN
  IF item.recipient_id<>p_recipient OR item.body<>clean THEN RAISE EXCEPTION 'request_conflict' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('ok',true,'id',item.id,'replayed',true);
 END IF;
 IF (SELECT count(*) FROM ojjuda_note_internal.friend_messages WHERE sender_id=viewer AND created_at>clock_timestamp()-interval '1 minute')>=20 THEN RAISE EXCEPTION 'message_rate_limit' USING ERRCODE='P0001'; END IF;
 INSERT INTO ojjuda_note_internal.friend_messages(sender_id,recipient_id,body,request_id) VALUES(viewer,p_recipient,clean,p_request) RETURNING * INTO item;
 RETURN jsonb_build_object('ok',true,'id',item.id,'replayed',false);
END $$;

CREATE FUNCTION ojjuda_note_internal.friend_message_target(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE viewer uuid:=auth.uid(); peer uuid;
BEGIN
 IF viewer IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=viewer) THEN RAISE EXCEPTION 'sign_in_required' USING ERRCODE='42501'; END IF;
 SELECT CASE WHEN m.sender_id=viewer THEN m.recipient_id ELSE m.sender_id END INTO peer
 FROM ojjuda_note_internal.friend_messages m WHERE m.id=p_id AND viewer IN(m.sender_id,m.recipient_id);
 IF peer IS NULL OR ojjuda_note_internal.friend_message_blocked(peer) THEN RAISE EXCEPTION 'friend_message_unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('peer_id',peer,'message_id',p_id);
END $$;

CREATE FUNCTION ojjuda_note_internal.friend_message_thread(p_peer uuid,p_limit integer DEFAULT 30,p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_anchor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE viewer uuid:=auth.uid(); result jsonb; ids uuid[]; anchor_time timestamptz; allowed boolean;
BEGIN
 IF viewer IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=viewer) THEN RAISE EXCEPTION 'sign_in_required' USING ERRCODE='42501'; END IF;
 IF p_peer IS NULL OR p_peer=viewer OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR ((p_before_created_at IS NULL)<>(p_before_id IS NULL)) OR (p_before_created_at IS NOT NULL AND NOT isfinite(p_before_created_at)) OR (p_anchor IS NOT NULL AND p_before_id IS NOT NULL) THEN RAISE EXCEPTION 'invalid_message_page' USING ERRCODE='22023'; END IF;
 IF ojjuda_note_internal.friend_message_blocked(p_peer) THEN RAISE EXCEPTION 'friend_message_unavailable' USING ERRCODE='42501'; END IF;
 allowed:=NOT public.is_banned(viewer) AND EXISTS(SELECT 1 FROM public.friendships f WHERE f.status='accepted' AND ((f.requester=viewer AND f.addressee=p_peer) OR (f.requester=p_peer AND f.addressee=viewer)));
 IF NOT allowed AND NOT EXISTS(SELECT 1 FROM ojjuda_note_internal.friend_messages m WHERE least(m.sender_id,m.recipient_id)=least(viewer,p_peer) AND greatest(m.sender_id,m.recipient_id)=greatest(viewer,p_peer)) THEN RAISE EXCEPTION 'friend_message_unavailable' USING ERRCODE='42501'; END IF;
 IF p_anchor IS NOT NULL THEN
  SELECT m.created_at INTO anchor_time FROM ojjuda_note_internal.friend_messages m WHERE m.id=p_anchor AND viewer IN(m.sender_id,m.recipient_id) AND p_peer IN(m.sender_id,m.recipient_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'friend_message_unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 WITH candidates AS MATERIALIZED (
  SELECT m.id,m.sender_id,m.recipient_id,m.body,m.created_at FROM ojjuda_note_internal.friend_messages m
  WHERE least(m.sender_id,m.recipient_id)=least(viewer,p_peer) AND greatest(m.sender_id,m.recipient_id)=greatest(viewer,p_peer)
  AND (p_before_id IS NULL OR (m.created_at,m.id)<(p_before_created_at,p_before_id))
  AND (p_anchor IS NULL OR (m.created_at,m.id)<=(anchor_time,p_anchor))
  ORDER BY m.created_at DESC,m.id DESC LIMIT p_limit+1
 ), page AS MATERIALIZED(SELECT * FROM candidates ORDER BY created_at DESC,id DESC LIMIT p_limit)
 SELECT jsonb_build_object('peer_id',p_peer,'nickname',(SELECT nickname FROM public.profiles WHERE id=p_peer),'can_send',allowed,
  'items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at,p.id) FROM page p),'[]'::jsonb),
  'has_more',(SELECT count(*)>p_limit FROM candidates),
  'next_cursor',CASE WHEN (SELECT count(*)>p_limit FROM candidates) THEN (SELECT jsonb_build_object('created_at',p.created_at,'id',p.id) FROM page p ORDER BY p.created_at,p.id LIMIT 1) ELSE NULL END),
  (SELECT array_agg(id) FROM page) INTO result,ids;
 INSERT INTO ojjuda_note_internal.world_notification_reads(user_id,event_id,event_created_at)
 SELECT viewer,'world:message:'||m.id::text,m.created_at FROM ojjuda_note_internal.friend_messages m WHERE m.id=ANY(ids) AND m.recipient_id=viewer ON CONFLICT DO NOTHING;
 RETURN result;
END $$;

CREATE FUNCTION ojjuda_note_internal.admin_friend_messages(p_query text DEFAULT '',p_limit integer DEFAULT 30,p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE viewer uuid:=auth.uid(); result jsonb; ids uuid[]; term text:=btrim(p_query);
BEGIN
 IF viewer IS NULL OR public.is_admin() IS NOT TRUE THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
 IF term IS NULL OR length(term)>100 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR ((p_before_created_at IS NULL)<>(p_before_id IS NULL)) OR (p_before_created_at IS NOT NULL AND NOT isfinite(p_before_created_at)) THEN RAISE EXCEPTION 'invalid_message_page' USING ERRCODE='22023'; END IF;
 WITH candidates AS MATERIALIZED (
  SELECT m.id,m.sender_id,m.recipient_id,m.body,m.created_at,s.nickname AS sender_name,r.nickname AS recipient_name
  FROM ojjuda_note_internal.friend_messages m LEFT JOIN public.profiles s ON s.id=m.sender_id LEFT JOIN public.profiles r ON r.id=m.recipient_id
  WHERE (term='' OR strpos(lower(m.body),lower(term))>0 OR strpos(lower(s.nickname),lower(term))>0 OR strpos(lower(r.nickname),lower(term))>0 OR m.sender_id::text=term OR m.recipient_id::text=term)
  AND (p_before_id IS NULL OR (m.created_at,m.id)<(p_before_created_at,p_before_id)) ORDER BY m.created_at DESC,m.id DESC LIMIT p_limit+1
 ), page AS MATERIALIZED(SELECT * FROM candidates ORDER BY created_at DESC,id DESC LIMIT p_limit)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.id DESC) FROM page p),'[]'::jsonb),
  'has_more',(SELECT count(*)>p_limit FROM candidates),
  'next_cursor',CASE WHEN (SELECT count(*)>p_limit FROM candidates) THEN (SELECT jsonb_build_object('created_at',p.created_at,'id',p.id) FROM page p ORDER BY p.created_at,p.id LIMIT 1) ELSE NULL END),
  (SELECT array_agg(id) FROM page) INTO result,ids;
 IF cardinality(ids)>0 THEN INSERT INTO ojjuda_note_internal.friend_message_access_log(admin_id,message_ids) VALUES(viewer,ids); END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.send_friend_message(p_recipient uuid,p_body text,p_request uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT ojjuda_note_internal.send_friend_message(p_recipient,p_body,p_request) $$;
CREATE FUNCTION public.friend_message_target(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT ojjuda_note_internal.friend_message_target(p_id) $$;
CREATE FUNCTION public.friend_message_thread(p_peer uuid,p_limit integer DEFAULT 30,p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_anchor uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT ojjuda_note_internal.friend_message_thread(p_peer,p_limit,p_before_created_at,p_before_id,p_anchor) $$;
CREATE FUNCTION public.admin_friend_messages(p_query text DEFAULT '',p_limit integer DEFAULT 30,p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT ojjuda_note_internal.admin_friend_messages(p_query,p_limit,p_before_created_at,p_before_id) $$;
REVOKE ALL ON FUNCTION public.send_friend_message(uuid,text,uuid),public.friend_message_target(uuid),public.friend_message_thread(uuid,integer,timestamptz,uuid,uuid),public.admin_friend_messages(text,integer,timestamptz,uuid),ojjuda_note_internal.send_friend_message(uuid,text,uuid),ojjuda_note_internal.friend_message_target(uuid),ojjuda_note_internal.friend_message_thread(uuid,integer,timestamptz,uuid,uuid),ojjuda_note_internal.admin_friend_messages(text,integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA ojjuda_note_internal TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_message(uuid,text,uuid),public.friend_message_target(uuid),public.friend_message_thread(uuid,integer,timestamptz,uuid,uuid),public.admin_friend_messages(text,integer,timestamptz,uuid),ojjuda_note_internal.send_friend_message(uuid,text,uuid),ojjuda_note_internal.friend_message_target(uuid),ojjuda_note_internal.friend_message_thread(uuid,integer,timestamptz,uuid,uuid),ojjuda_note_internal.admin_friend_messages(text,integer,timestamptz,uuid) TO authenticated;

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
  UNION ALL
  SELECT 'world:message:'||m.id::text,'world_message','message',m.id::text,m.created_at,NULL::timestamptz
  FROM ojjuda_note_internal.friend_messages m WHERE m.recipient_id=viewer AND NOT ojjuda_note_internal.friend_message_blocked(m.sender_id)
 ) w LEFT JOIN ojjuda_note_internal.world_notification_reads r
 ON r.user_id=viewer AND r.event_id=w.id AND r.event_created_at=w.created_at;
END $$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.visible_app_notifications() FROM PUBLIC,anon,authenticated;

NOTIFY pgrst,'reload schema';
