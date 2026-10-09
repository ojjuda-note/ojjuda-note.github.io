-- Board comments use the existing admin feed, revision checks, audit log and public-only retention.
ALTER TABLE ojjuda_world_private.content_archive DROP CONSTRAINT content_archive_kind_check;
ALTER TABLE ojjuda_world_private.content_archive ADD CONSTRAINT content_archive_kind_check CHECK(kind IN ('diary','media','guestbook','intro','chat','media_comment','house_post','board_comment'));
CREATE OR REPLACE VIEW ojjuda_house_admin.active_content WITH(security_invoker=true) AS
SELECT 'post'::text AS kind,
    p.id,
    p.body,
    p.user_id AS author_id,
    a.nickname AS author_nick,
    p.user_id AS owner_id,
    a.nickname AS owner_nick,
    p.created_at,
        CASE
            WHEN p.folder_id IS NULL THEN p.visibility
            ELSE COALESCE(f.visibility, 'me'::text)
        END AS visibility,
    f.name AS folder_name,
    a.door_closed OR
        CASE
            WHEN p.folder_id IS NULL THEN p.visibility <> 'all'::text
            ELSE COALESCE(f.visibility, 'me'::text) <> 'all'::text
        END AS is_private,
    p.body ~* risk_pattern() AS is_risk,
    md5(p.body) AS revision
   FROM house_posts p
     JOIN profiles a ON a.id = p.user_id
     LEFT JOIN media_folders f ON f.id = p.folder_id AND f.user_id = p.user_id
  WHERE p.deleted_at IS NULL
UNION ALL
 SELECT 'comment'::text AS kind,
    c.id,
    c.body,
    c.author_id,
    COALESCE(a.nickname, '탈퇴한 사용자'::text) AS author_nick,
    m.user_id AS owner_id,
    o.nickname AS owner_nick,
    c.created_at,
        CASE
            WHEN m.folder_id IS NULL THEN m.visibility
            ELSE COALESCE(f.visibility, 'me'::text)
        END AS visibility,
    f.name AS folder_name,
    o.door_closed OR
        CASE
            WHEN m.folder_id IS NULL THEN m.visibility <> 'all'::text
            ELSE COALESCE(f.visibility, 'me'::text) <> 'all'::text
        END AS is_private,
    c.body ~* risk_pattern() AS is_risk,
    md5(c.body) AS revision
   FROM media_comments c
     JOIN media m ON m.id = c.media_id
     JOIN profiles o ON o.id = m.user_id
     LEFT JOIN profiles a ON a.id = c.author_id
     LEFT JOIN media_folders f ON f.id = m.folder_id AND f.user_id = m.user_id
UNION ALL
 SELECT 'board_comment',c.id::text,c.body,c.author_id,coalesce(a.nickname,'탈퇴한 사용자'),
 coalesce(p.user_id,d.user_id),o.nickname,c.created_at,
 CASE WHEN c.post_id IS NULL THEN d.visibility WHEN p.folder_id IS NULL THEN p.visibility ELSE coalesce(f.visibility,'me') END,
 f.name,
 (o.door_closed OR CASE WHEN c.post_id IS NULL THEN d.visibility<>'all' WHEN p.folder_id IS NULL THEN p.visibility<>'all' ELSE coalesce(f.visibility,'me')<>'all' END),
 (c.body ~* public.risk_pattern()),md5(c.body)
 FROM public.world_board_comments c
 LEFT JOIN public.house_posts p ON p.id=c.post_id
 LEFT JOIN public.diaries d ON d.id=c.diary_id
 JOIN public.profiles o ON o.id=coalesce(p.user_id,d.user_id)
 LEFT JOIN public.profiles a ON a.id=c.author_id
 LEFT JOIN public.media_folders f ON f.id=p.folder_id AND f.user_id=p.user_id
 WHERE c.post_id IS NULL OR p.deleted_at IS NULL;
CREATE OR REPLACE FUNCTION ojjuda_house_admin.content_feed(p_kind text DEFAULT 'all'::text, p_filter text DEFAULT 'all'::text, p_q text DEFAULT ''::text, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_limit integer:=least(greatest(coalesce(p_limit,30),1),50);
 v_q text:=btrim(coalesce(p_q,''));v_items jsonb;v_more boolean;v_last jsonb;
 v_before timestamptz;v_kind text;v_id text;
BEGIN
 IF auth.uid() IS NULL OR public.is_admin() IS NOT TRUE THEN RAISE EXCEPTION 'not_admin' USING ERRCODE='42501'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('all','post','comment','board_comment') OR p_filter IS NULL OR p_filter NOT IN ('all','public','private','risk') OR char_length(v_q)>100 THEN
  RAISE EXCEPTION 'house_admin_bad_filter' USING ERRCODE='22023';
 END IF;
 IF p_cursor IS NOT NULL THEN
  IF jsonb_typeof(p_cursor)<>'object' OR coalesce(p_cursor->>'kind','') NOT IN ('post','comment','board_comment') OR coalesce(char_length(p_cursor->>'id'),0) NOT BETWEEN 1 AND 128 OR coalesce(p_cursor->>'created_at','')='' THEN
   RAISE EXCEPTION 'house_admin_bad_cursor' USING ERRCODE='22023';
  END IF;
  v_before:=(p_cursor->>'created_at')::timestamptz;v_kind:=p_cursor->>'kind';v_id:=p_cursor->>'id';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.kind DESC,r.id DESC),'[]'::jsonb) INTO v_items
 FROM (SELECT c.* FROM ojjuda_house_admin.active_content c
  WHERE (p_kind='all' OR c.kind=p_kind)
   AND (p_filter='all' OR p_filter='private' AND c.is_private OR p_filter='public' AND NOT c.is_private OR p_filter='risk' AND c.is_risk)
   AND (v_q='' OR strpos(lower(c.body),lower(v_q))>0 OR strpos(lower(c.author_nick),lower(v_q))>0 OR strpos(lower(c.owner_nick),lower(v_q))>0)
   AND (p_cursor IS NULL OR (c.created_at,c.kind,c.id)<(v_before,v_kind,v_id))
  ORDER BY c.created_at DESC,c.kind DESC,c.id DESC LIMIT v_limit+1) r;
 v_more:=jsonb_array_length(v_items)>v_limit;
 IF v_more THEN v_items:=v_items-v_limit; END IF;
 v_last:=v_items->(jsonb_array_length(v_items)-1);
 RETURN jsonb_build_object('items',v_items,'has_more',v_more,'next_cursor',CASE WHEN v_more THEN jsonb_build_object('created_at',v_last->'created_at','kind',v_last->'kind','id',v_last->'id') ELSE NULL END);
END;$function$
;
CREATE OR REPLACE FUNCTION ojjuda_house_admin.change_content(p_action text, p_kind text, p_id text, p_body text, p_revision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_row jsonb;v_owner uuid;v_author uuid;v_folder uuid;v_media text;v_post text;v_diary text;v_visibility text;
 v_body text:=btrim(coalesce(p_body,''));v_old text;v_open boolean;v_public boolean:=false;v_nick text;v_archived boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR public.is_admin() IS NOT TRUE THEN RAISE EXCEPTION 'not_admin' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('edit','delete') OR p_kind IS NULL OR p_kind NOT IN ('post','comment','board_comment') OR p_id IS NULL OR char_length(p_id) NOT BETWEEN 1 AND 128 OR p_revision IS NULL OR p_revision !~ '^[a-f0-9]{32}$' THEN
  RAISE EXCEPTION 'house_admin_bad_request' USING ERRCODE='22023';
 END IF;
 IF p_action='edit' AND (char_length(v_body)<1 OR (p_kind='post' AND char_length(v_body)>4000)) THEN
  RAISE EXCEPTION 'house_admin_bad_body' USING ERRCODE='22023';
 END IF;

 IF p_kind='board_comment' THEN
  SELECT c.post_id,c.diary_id INTO v_post,v_diary FROM public.world_board_comments c WHERE c.id::text=p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','missing'); END IF;
  IF v_post IS NOT NULL THEN
   SELECT p.user_id,p.folder_id,p.visibility INTO v_owner,v_folder,v_visibility FROM public.house_posts p WHERE p.id=v_post AND p.deleted_at IS NULL FOR SHARE;
  ELSE
   SELECT d.user_id,d.visibility INTO v_owner,v_visibility FROM public.diaries d WHERE d.id=v_diary FOR SHARE;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','missing'); END IF;
  SELECT to_jsonb(c),c.author_id,c.body INTO v_row,v_author,v_old FROM public.world_board_comments c
   WHERE c.id::text=p_id AND c.post_id IS NOT DISTINCT FROM v_post AND c.diary_id IS NOT DISTINCT FROM v_diary FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','missing'); END IF;
  IF md5(v_old)<>p_revision THEN RETURN jsonb_build_object('ok',false,'reason','conflict'); END IF;
  IF p_action='edit' THEN
   IF public.has_banned(v_body) THEN RAISE EXCEPTION 'banned_word' USING ERRCODE='22023'; END IF;
   UPDATE public.world_board_comments SET body=v_body WHERE id::text=p_id;
  ELSE
   SELECT NOT p.door_closed INTO v_open FROM public.profiles p WHERE p.id=v_owner FOR SHARE;
   IF v_folder IS NOT NULL THEN
    SELECT f.visibility='all' INTO v_public FROM public.media_folders f WHERE f.id=v_folder AND f.user_id=v_owner FOR SHARE;
   ELSE v_public:=v_visibility='all';
   END IF;
   SELECT p.nickname INTO v_nick FROM public.profiles p WHERE p.id=v_author FOR SHARE;
   v_archived:=coalesce(v_open AND v_public,false) AND v_author IS NOT NULL AND v_nick IS NOT NULL;
   IF v_archived THEN
    INSERT INTO ojjuda_world_private.content_archive(kind,source_id,body,author_id,owner_id,author_nick,created_at,purge_after)
    VALUES('board_comment',p_id,v_old,v_author,v_owner,v_nick,(v_row->>'created_at')::timestamptz,statement_timestamp()+interval '30 days');
   END IF;
   DELETE FROM public.world_board_comments WHERE id::text=p_id;
  END IF;
  PERFORM public.admin_note('board_comment_'||p_action,v_author,p_id,jsonb_build_object('kind',p_kind,'source',CASE WHEN v_post IS NOT NULL THEN 'post' ELSE 'diary' END,'archived',v_archived));
  RETURN jsonb_build_object('ok',true,'archived',v_archived,'revision',CASE WHEN p_action='edit' THEN md5(v_body) ELSE NULL END);
 END IF;
 IF p_kind='post' THEN
  SELECT to_jsonb(p),p.user_id,p.user_id,p.folder_id,p.body INTO v_row,v_owner,v_author,v_folder,v_old
   FROM public.house_posts p WHERE p.id=p_id AND p.deleted_at IS NULL FOR UPDATE;
 ELSE
  -- Lock the parent before its comment, matching the parent-delete cascade order.
  SELECT c.media_id INTO v_media FROM public.media_comments c WHERE c.id=p_id;
  SELECT m.user_id,m.folder_id INTO v_owner,v_folder FROM public.media m WHERE m.id=v_media FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','missing'); END IF;
  SELECT to_jsonb(c),c.author_id,c.body INTO v_row,v_author,v_old FROM public.media_comments c WHERE c.id=p_id AND c.media_id=v_media FOR UPDATE;
 END IF;
 IF v_row IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','missing'); END IF;
 IF md5(v_old)<>p_revision THEN RETURN jsonb_build_object('ok',false,'reason','conflict'); END IF;
 IF p_action='edit' THEN
  IF public.has_banned(v_body) THEN RAISE EXCEPTION 'banned_word' USING ERRCODE='22023'; END IF;
  IF p_kind='post' THEN UPDATE public.house_posts SET body=v_body WHERE id=p_id AND deleted_at IS NULL;
  ELSE UPDATE public.media_comments SET body=v_body WHERE id=p_id; END IF;
 ELSE
  -- Lock current privacy settings until the archive decision and deletion commit.
  SELECT NOT p.door_closed,p.nickname INTO v_open,v_nick FROM public.profiles p WHERE p.id=v_owner FOR SHARE;
  IF v_folder IS NOT NULL THEN
   SELECT f.visibility='all' INTO v_public FROM public.media_folders f WHERE f.id=v_folder AND f.user_id=v_owner FOR SHARE;
  ELSIF p_kind='post' THEN v_public:=v_row->>'visibility'='all';
  ELSE SELECT m.visibility='all' INTO v_public FROM public.media m WHERE m.id=v_media;
  END IF;
  v_archived:=coalesce(v_open AND v_public,false) AND v_author IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=v_author);
  IF p_kind='post' THEN
   IF v_archived THEN
    INSERT INTO ojjuda_world_private.content_archive(kind,source_id,body,author_id,owner_id,author_nick,created_at,purge_after)
     VALUES('house_post',p_id,v_old,v_author,v_owner,v_nick,(v_row->>'created_at')::timestamptz,statement_timestamp()+interval '30 days');
   END IF;
   -- Do not put moderated text into an owner-restorable trash bin.
   DELETE FROM public.house_posts WHERE id=p_id AND deleted_at IS NULL;
  ELSE
   IF v_archived THEN PERFORM ojjuda_world_private.archive_admin_public_content('media_comment',v_row); END IF;
   DELETE FROM public.media_comments WHERE id=p_id;
  END IF;
 END IF;
 PERFORM public.admin_note(CASE WHEN p_kind='post' THEN 'house_post_' ELSE 'media_comment_' END||p_action,v_author,p_id,jsonb_build_object('kind',p_kind,'archived',v_archived));
 RETURN jsonb_build_object('ok',true,'archived',v_archived,'revision',CASE WHEN p_action='edit' THEN md5(v_body) ELSE NULL END);
END;$function$
;
NOTIFY pgrst,'reload schema';

