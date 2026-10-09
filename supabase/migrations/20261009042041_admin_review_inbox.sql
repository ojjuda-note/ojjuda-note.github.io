-- One administrator inbox; ordinary members cannot query its sources or actions.
CREATE TABLE ojjuda_house_admin.review_ack (
  item_key text PRIMARY KEY, revision text NOT NULL,
  reviewer_id uuid NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ojjuda_house_admin.review_ack ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ojjuda_house_admin.review_ack FROM PUBLIC,anon,authenticated;

CREATE VIEW ojjuda_house_admin.review_sources WITH (security_invoker=true) AS
SELECT a.kind,a.id,a.author_id,a.author_nick,a.folder_name AS title,a.body,a.created_at,a.is_private,
 NULL::text AS bucket,NULL::text AS path,NULL::text AS full_path,'visible'::text AS status,
 jsonb_build_object('owner_id',a.owner_id,'revision',a.revision) AS meta
FROM ojjuda_house_admin.active_content a
UNION ALL
SELECT CASE c.kind WHEN 'comment' THEN 'note_comment' WHEN 'event' THEN 'event' ELSE 'card' END,
 c.id::text,c.author_id,p.nickname,array_to_string(c.tags,' · '),c.body,c.created_at,false,
 CASE WHEN cp.photo_path IS NOT NULL THEN 'note-card-photos' WHEN ep.photo_path IS NOT NULL THEN 'note-event-photos' END,
 coalesce(cp.photo_path,ep.photo_path),coalesce(cp.photo_path,ep.photo_path),CASE WHEN coalesce(cm.hidden,false) THEN 'hidden' ELSE 'visible' END,
 jsonb_build_object('parent_id',c.parent_id,'tags',c.tags)
FROM ojjuda_note.cards c LEFT JOIN public.profiles p ON p.id=c.author_id
LEFT JOIN ojjuda_note_internal.card_moderation cm ON cm.card_id=c.id
LEFT JOIN ojjuda_note_internal.card_photos cp ON cp.card_id=c.id
LEFT JOIN ojjuda_note_internal.event_ads ep ON ep.card_id=c.id
WHERE c.archived_at IS NULL AND ojjuda_note_internal.is_note_moderator()
UNION ALL
SELECT 'diary',d.id::text,d.user_id,p.nickname,d.title,d.body,d.created_at,
 coalesce(d.visibility<>'all',true) OR coalesce(p.door_closed,false),NULL,NULL,NULL,'visible','{}'::jsonb
FROM public.diaries d LEFT JOIN public.profiles p ON p.id=d.user_id
UNION ALL
SELECT CASE WHEN m.type='video' THEN 'video' ELSE 'image' END,m.id::text,m.user_id,p.nickname,NULL,m.caption,m.created_at,
 coalesce(coalesce(f.visibility,m.visibility)<>'all',true) OR coalesce(p.door_closed,false),
 'media',coalesce(m.thumb_path,m.path),m.path,'visible',jsonb_build_object('folder_id',m.folder_id)
FROM public.media m LEFT JOIN public.profiles p ON p.id=m.user_id LEFT JOIN public.media_folders f ON f.id=m.folder_id
UNION ALL
SELECT 'guestbook',g.id::text,g.author_id,coalesce(g.author_nick,p.nickname),NULL,
 concat_ws(E'\n\n',g.body,CASE WHEN nullif(g.reply,'') IS NOT NULL THEN '집주인 답글: '||g.reply END),g.created_at,
 coalesce(g.secret,false) OR coalesce(g.hidden,false),NULL,NULL,NULL,CASE WHEN g.hidden THEN 'hidden' ELSE 'visible' END,
 jsonb_build_object('owner_id',g.owner_id)
FROM public.guestbook g LEFT JOIN public.profiles p ON p.id=g.author_id
UNION ALL
SELECT 'intro',i.owner_id::text||':'||i.author_id::text,i.author_id,coalesce(i.author_nick,p.nickname),NULL,i.body,i.created_at,
 false,NULL,NULL,NULL,'visible',jsonb_build_object('owner_id',i.owner_id)
FROM public.intros i LEFT JOIN public.profiles p ON p.id=i.author_id
UNION ALL
SELECT 'profile',p.id::text,p.id,p.nickname,'프로필',concat_ws(E'\n',nullif(p.bio,''),nullif(p.mood_text,'')),
 coalesce(p.updated_at,'epoch'::timestamptz),false,CASE WHEN p.profile_photo_path IS NOT NULL THEN 'media' END,
 p.profile_photo_path,p.profile_photo_path,'visible','{}'::jsonb
FROM public.profiles p WHERE nullif(p.bio,'') IS NOT NULL OR nullif(p.mood_text,'') IS NOT NULL OR p.profile_photo_path IS NOT NULL
UNION ALL
SELECT 'chat',c.id::text,c.author_id,coalesce(c.author_nick,p.nickname),c.room,c.body,c.created_at,
 false,NULL,NULL,NULL,'visible',jsonb_build_object('room',c.room)
FROM public.place_messages c LEFT JOIN public.profiles p ON p.id=c.author_id
UNION ALL
SELECT 'game_photo',s.id::text,s.owner,coalesce(s.nick,p.nickname),'포토땅따먹기',NULL,s.created_at,
 s.visibility<>'public','photo-stages',coalesce(s.image_path,s.full_path),coalesce(s.full_path,s.image_path),s.status,
 jsonb_build_object('visibility',s.visibility,'report_count',s.report_count)
FROM public.photo_stages s LEFT JOIN public.profiles p ON p.id=s.owner
WHERE public.photo_is_admin() AND ojjuda_photo_internal.member_allowed()
UNION ALL
SELECT 'world_report',r.id::text,r.target_user,p.nickname,'신고 · '||r.kind,
 concat_ws(E'\n',r.reason,r.detail,r.content),r.created_at,false,NULL,NULL,NULL,r.status,
 jsonb_build_object('target_kind',r.kind,'target_id',r.target_id)
FROM public.reports r LEFT JOIN public.profiles p ON p.id=r.target_user WHERE r.status='open'
UNION ALL
SELECT 'note_report',r.report_id::text,c.author_id,p.nickname,'노트 신고',concat_ws(E'\n',r.reason,c.body),
 r.created_at,false,NULL,NULL,NULL,r.status,jsonb_build_object('card_id',r.card_id)
FROM ojjuda_note_internal.reports r LEFT JOIN ojjuda_note.cards c ON c.id=r.card_id
LEFT JOIN public.profiles p ON p.id=c.author_id WHERE r.status='open' AND ojjuda_note_internal.is_note_moderator();
REVOKE ALL ON ojjuda_house_admin.review_sources FROM PUBLIC,anon,authenticated;

CREATE VIEW ojjuda_house_admin.review_items WITH (security_invoker=true) AS
WITH versions AS (
 SELECT s.*,s.kind||':'||s.id AS key,
 md5(jsonb_build_array(s.body,s.title,s.path,s.full_path,s.status,s.is_private,s.meta)::text) AS revision,
 coalesce(concat_ws(' ',s.title,s.body) ~* public.risk_pattern(),false) AS is_risk
 FROM ojjuda_house_admin.review_sources s
)
SELECT v.*,a.revision=v.revision AS reviewed,
 CASE WHEN v.kind IN ('world_report','note_report') THEN 0
 WHEN v.kind='game_photo' AND v.status='pending' AND v.meta->>'visibility'='public' THEN 1
 WHEN v.status NOT IN ('hidden','rejected') AND (a.revision IS DISTINCT FROM v.revision)
  AND (v.is_risk OR (v.kind='game_photo' AND coalesce((v.meta->>'report_count')::int,0)>0)) THEN 2
 ELSE 3 END AS priority
FROM versions v LEFT JOIN ojjuda_house_admin.review_ack a ON a.item_key=v.key;
REVOKE ALL ON ojjuda_house_admin.review_items FROM PUBLIC,anon,authenticated;

CREATE FUNCTION ojjuda_house_admin.review_feed(p_kind text DEFAULT 'all',p_state text DEFAULT 'all',p_q text DEFAULT '',p_cursor jsonb DEFAULT NULL,p_snapshot timestamptz DEFAULT NULL,p_limit int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result jsonb; v_limit int:=least(greatest(coalesce(p_limit,30),1),50); v_snapshot timestamptz:=least(coalesce(p_snapshot,now()),now());
BEGIN
 IF auth.uid() IS NULL OR public.is_admin() IS DISTINCT FROM true THEN RAISE EXCEPTION 'not_admin' USING ERRCODE='42501'; END IF;
 IF p_kind IS NULL OR p_state IS NULL OR p_state NOT IN ('all','priority','pending','reports','risk') OR length(coalesce(p_q,''))>200 THEN RAISE EXCEPTION 'invalid_filter' USING ERRCODE='22023'; END IF;
 WITH all_items AS MATERIALIZED (SELECT * FROM ojjuda_house_admin.review_items WHERE created_at<=v_snapshot),
 filtered AS MATERIALIZED (
  SELECT * FROM all_items WHERE (p_kind='all' OR kind=p_kind)
   AND (p_state='all' OR p_state='priority' AND priority<3 OR p_state='reports' AND priority=0 OR p_state='pending' AND priority=1 OR p_state='risk' AND priority=2)
   AND (btrim(coalesce(p_q,''))='' OR strpos(lower(concat_ws(' ',body,title,author_nick)),lower(btrim(p_q)))>0)
 ), page AS MATERIALIZED (
  SELECT * FROM filtered WHERE p_cursor IS NULL OR priority>(p_cursor->>'priority')::int
   OR priority=(p_cursor->>'priority')::int AND created_at<(p_cursor->>'created_at')::timestamptz
   OR priority=(p_cursor->>'priority')::int AND created_at=(p_cursor->>'created_at')::timestamptz AND key<(p_cursor->>'key')
  ORDER BY priority,created_at DESC,key DESC LIMIT v_limit+1
 ), shown AS MATERIALIZED (SELECT * FROM page ORDER BY priority,created_at DESC,key DESC LIMIT v_limit)
 SELECT jsonb_build_object(
  'items',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('body',left(s.body,500),'body_truncated',length(s.body)>500) ORDER BY priority,created_at DESC,key DESC) FROM shown s),'[]'::jsonb),
  'counts',(SELECT jsonb_build_object('all',count(*),'reports',count(*) FILTER(WHERE priority=0),'pending',count(*) FILTER(WHERE priority=1),'risk',count(*) FILTER(WHERE priority=2),'matched',(SELECT count(*) FROM filtered)) FROM all_items),
  'has_more',(SELECT count(*)>v_limit FROM page),
  'next_cursor',(SELECT jsonb_build_object('priority',priority,'created_at',created_at,'key',key) FROM shown ORDER BY priority DESC,created_at,key LIMIT 1),
  'snapshot',v_snapshot) INTO result;
 RETURN result;
END $fn$;

CREATE FUNCTION ojjuda_house_admin.review_detail(p_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF auth.uid() IS NULL OR public.is_admin() IS DISTINCT FROM true THEN RAISE EXCEPTION 'not_admin' USING ERRCODE='42501'; END IF;
 RETURN (SELECT to_jsonb(i) FROM ojjuda_house_admin.review_items i WHERE i.key=p_key);
END $fn$;

CREATE FUNCTION ojjuda_house_admin.review_action(p_key text,p_revision text,p_action text,p_reason text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r record; v_kind text:=split_part(p_key,':',1); v_id text:=substr(p_key,strpos(p_key,':')+1);
BEGIN
 IF auth.uid() IS NULL OR public.is_admin() IS DISTINCT FROM true THEN RAISE EXCEPTION 'not_admin' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key)>300 OR p_action IS NULL THEN RAISE EXCEPTION 'invalid_action' USING ERRCODE='22023'; END IF;
 IF v_kind='game_photo' THEN PERFORM 1 FROM public.photo_stages WHERE id=v_id::uuid FOR UPDATE;
 ELSIF v_kind='world_report' THEN PERFORM 1 FROM public.reports WHERE id=v_id::bigint FOR UPDATE;
 ELSIF v_kind='note_report' THEN PERFORM 1 FROM ojjuda_note_internal.reports WHERE report_id=v_id::uuid FOR UPDATE;
 ELSIF v_kind IN ('card','note_comment','event') THEN PERFORM 1 FROM ojjuda_note.cards WHERE id=v_id::uuid FOR UPDATE;
 END IF;
 SELECT * INTO r FROM ojjuda_house_admin.review_items WHERE key=p_key;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF r.revision IS DISTINCT FROM p_revision THEN RETURN jsonb_build_object('ok',false,'reason','conflict'); END IF;
 IF v_kind='game_photo' AND p_action IN ('approved','rejected','hidden') THEN
  IF r.meta->>'visibility' IS DISTINCT FROM 'public' THEN RAISE EXCEPTION 'not_public'; END IF;
  PERFORM public.photo_set_status(v_id::uuid,p_action);
 ELSIF v_kind='world_report' AND p_action IN ('reviewed','actioned') THEN PERFORM public.admin_set_report(v_id::bigint,p_action);
 ELSIF v_kind='note_report' AND p_action='reviewed' THEN PERFORM ojjuda_note.resolve_report(v_id::uuid);
 ELSIF v_kind IN ('card','note_comment','event') AND p_action IN ('hidden','visible') THEN
  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'reason_required'; END IF;
  PERFORM ojjuda_note.moderate_card(v_id::uuid,p_action='hidden',btrim(p_reason));
 ELSIF p_action='reviewed' AND r.priority=2 THEN
  INSERT INTO ojjuda_house_admin.review_ack(item_key,revision,reviewer_id,reviewed_at) VALUES(p_key,r.revision,auth.uid(),now())
  ON CONFLICT(item_key) DO UPDATE SET revision=excluded.revision,reviewer_id=excluded.reviewer_id,reviewed_at=excluded.reviewed_at;
 ELSE RAISE EXCEPTION 'invalid_action' USING ERRCODE='22023'; END IF;
 PERFORM public.admin_note('content_review_'||p_action,r.author_id,r.id,jsonb_build_object('kind',r.kind));
 RETURN jsonb_build_object('ok',true);
END $fn$;

CREATE FUNCTION public.admin_review_feed(p_kind text DEFAULT 'all',p_state text DEFAULT 'all',p_q text DEFAULT '',p_cursor jsonb DEFAULT NULL,p_snapshot timestamptz DEFAULT NULL,p_limit int DEFAULT 30)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT ojjuda_house_admin.review_feed(p_kind,p_state,p_q,p_cursor,p_snapshot,p_limit)$$;
CREATE FUNCTION public.admin_review_detail(p_key text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT ojjuda_house_admin.review_detail(p_key)$$;
CREATE FUNCTION public.admin_review_action(p_key text,p_revision text,p_action text,p_reason text DEFAULT '') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT ojjuda_house_admin.review_action(p_key,p_revision,p_action,p_reason)$$;
REVOKE ALL ON FUNCTION ojjuda_house_admin.review_feed(text,text,text,jsonb,timestamptz,int),ojjuda_house_admin.review_detail(text),ojjuda_house_admin.review_action(text,text,text,text),public.admin_review_feed(text,text,text,jsonb,timestamptz,int),public.admin_review_detail(text),public.admin_review_action(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA ojjuda_house_admin TO authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_house_admin.review_feed(text,text,text,jsonb,timestamptz,int),ojjuda_house_admin.review_detail(text),ojjuda_house_admin.review_action(text,text,text,text),public.admin_review_feed(text,text,text,jsonb,timestamptz,int),public.admin_review_detail(text),public.admin_review_action(text,text,text,text) TO authenticated;
