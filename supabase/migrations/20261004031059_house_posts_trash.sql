-- Account-backed text posts and recoverable media deletion. Storage objects stay intact.
CREATE TABLE public.house_posts (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
 body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
 visibility text NOT NULL DEFAULT 'me' CHECK (visibility IN ('me','friends','all')),
 folder_id uuid REFERENCES public.media_folders(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz
);
CREATE INDEX house_posts_owner_feed ON public.house_posts(user_id,created_at DESC,id DESC);
CREATE INDEX house_posts_folder ON public.house_posts(folder_id);
CREATE TABLE public.house_media_trash (
 id text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 type text NOT NULL CHECK(type IN ('image','video')),
 path text NOT NULL, thumb_path text,
 caption text NOT NULL DEFAULT '' CHECK(char_length(caption)<=100),
 duration real NOT NULL DEFAULT 0,
 visibility text NOT NULL CHECK(visibility IN ('me','friends','all')),
 folder_id uuid REFERENCES public.media_folders(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL,
 deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX house_media_trash_owner ON public.house_media_trash(user_id,deleted_at DESC,id DESC);
CREATE INDEX house_media_trash_folder ON public.house_media_trash(folder_id);
ALTER TABLE public.house_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_media_trash ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.house_posts,public.house_media_trash FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.house_posts TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.house_media_trash TO authenticated;
-- Row locks require UPDATE on at least one column; file metadata stays immutable.
GRANT UPDATE(deleted_at) ON public.house_media_trash TO authenticated;
GRANT ALL ON public.house_posts,public.house_media_trash TO service_role;
CREATE POLICY house_posts_read ON public.house_posts FOR SELECT TO authenticated USING (
 user_id=(SELECT auth.uid()) OR (deleted_at IS NULL AND public.door_open(user_id) AND
 CASE WHEN folder_id IS NULL THEN visibility='all' OR (visibility='friends' AND public.is_friend(user_id,(SELECT auth.uid())))
 ELSE public.folder_can_see(folder_id,(SELECT auth.uid())) END)
);
CREATE POLICY house_posts_insert ON public.house_posts FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid()) AND NOT public.is_banned((SELECT auth.uid())));
CREATE POLICY house_posts_update ON public.house_posts FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid()) AND NOT public.is_banned((SELECT auth.uid()))) WITH CHECK(user_id=(SELECT auth.uid()) AND NOT public.is_banned((SELECT auth.uid())));
CREATE POLICY house_trash_read ON public.house_media_trash FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY house_trash_insert ON public.house_media_trash FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid()) AND NOT public.is_banned((SELECT auth.uid())) AND path LIKE (SELECT auth.uid())::text||'/%' AND (thumb_path IS NULL OR thumb_path LIKE (SELECT auth.uid())::text||'/%'));
CREATE POLICY house_trash_lock ON public.house_media_trash FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid()) AND NOT public.is_banned((SELECT auth.uid()))) WITH CHECK(user_id=(SELECT auth.uid()) AND NOT public.is_banned((SELECT auth.uid())));
CREATE POLICY house_trash_delete ON public.house_media_trash FOR DELETE TO authenticated USING(user_id=(SELECT auth.uid()) AND NOT public.is_banned((SELECT auth.uid())));

CREATE FUNCTION public.house_post_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.media_folders WHERE id=NEW.folder_id AND user_id=NEW.user_id) THEN
  RAISE EXCEPTION 'house_folder_unavailable' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'house_owner_immutable' USING ERRCODE='42501'; END IF;
  IF NEW.folder_id IS NULL AND OLD.folder_id IS NOT NULL THEN NEW.visibility:='me'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END;$$;
CREATE TRIGGER house_post_guard BEFORE INSERT OR UPDATE ON public.house_posts FOR EACH ROW EXECUTE FUNCTION public.house_post_guard();
REVOKE ALL ON FUNCTION public.house_post_guard() FROM PUBLIC,anon;

CREATE VIEW public.house_records WITH(security_invoker=true) AS
 SELECT id,user_id,type,path,thumb_path,caption,duration,visibility,folder_id,created_at FROM public.media
 UNION ALL
 SELECT id,user_id,'text'::text,NULL::text,NULL::text,body,0::real,visibility,folder_id,created_at FROM public.house_posts WHERE deleted_at IS NULL;
CREATE VIEW public.house_trash_records WITH(security_invoker=true) AS
 SELECT id,user_id,type,path,thumb_path,caption,duration,visibility,folder_id,deleted_at AS created_at FROM public.house_media_trash
 UNION ALL
 SELECT id,user_id,'text'::text,NULL::text,NULL::text,body,0::real,visibility,folder_id,deleted_at FROM public.house_posts WHERE deleted_at IS NOT NULL;
REVOKE ALL ON public.house_records,public.house_trash_records FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.house_records,public.house_trash_records TO authenticated;

CREATE FUNCTION public.house_save_post(p_id text,p_body text,p_folder_id uuid DEFAULT NULL,p_visibility text DEFAULT 'me',p_create boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); saved public.house_posts;
BEGIN
 IF actor IS NULL OR public.is_banned(actor) THEN RAISE EXCEPTION 'house_management_denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR char_length(p_id) NOT BETWEEN 1 AND 128 OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'house_post_invalid' USING ERRCODE='22023'; END IF;
 IF p_folder_id IS NOT NULL THEN
  PERFORM id FROM public.media_folders WHERE id=p_folder_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'house_folder_unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_create THEN
  INSERT INTO public.house_posts(id,user_id,body,folder_id,visibility) VALUES(p_id,actor,btrim(p_body),p_folder_id,p_visibility)
  ON CONFLICT(id) DO UPDATE SET body=excluded.body,folder_id=excluded.folder_id,visibility=excluded.visibility
   WHERE house_posts.user_id=actor AND house_posts.deleted_at IS NULL RETURNING * INTO saved;
 ELSE
  UPDATE public.house_posts SET body=btrim(p_body),folder_id=p_folder_id,visibility=p_visibility
   WHERE id=p_id AND user_id=actor AND deleted_at IS NULL RETURNING * INTO saved;
 END IF;
 IF saved.id IS NULL THEN RAISE EXCEPTION 'house_post_unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',saved.id);
END;$$;

CREATE FUNCTION public.house_manage_records(p_action text,p_media_ids text[] DEFAULT '{}',p_post_ids text[] DEFAULT '{}',p_folder_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); mids text[]; pids text[]; found_ids text[];
BEGIN
 IF actor IS NULL OR public.is_banned(actor) THEN RAISE EXCEPTION 'house_management_denied' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('move','trash','restore') OR p_media_ids IS NULL OR p_post_ids IS NULL
  OR cardinality(p_media_ids)+cardinality(p_post_ids) NOT BETWEEN 1 AND 100
  OR array_position(p_media_ids,NULL) IS NOT NULL OR array_position(p_post_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'house_selection_invalid' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO mids FROM (SELECT DISTINCT unnest(p_media_ids) id) s;
 SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO pids FROM (SELECT DISTINCT unnest(p_post_ids) id) s;
 IF p_action='move' AND p_folder_id IS NOT NULL THEN
  PERFORM id FROM public.media_folders WHERE id=p_folder_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'house_folder_unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action='restore' THEN
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO found_ids FROM (SELECT id FROM public.house_media_trash WHERE id=ANY(mids) AND user_id=actor ORDER BY id FOR UPDATE) s;
 ELSE
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO found_ids FROM (SELECT id FROM public.media WHERE id=ANY(mids) AND user_id=actor ORDER BY id FOR UPDATE) s;
 END IF;
 IF found_ids IS DISTINCT FROM mids THEN RAISE EXCEPTION 'house_media_unavailable' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO found_ids FROM (
  SELECT id FROM public.house_posts WHERE id=ANY(pids) AND user_id=actor AND ((p_action='restore')=(deleted_at IS NOT NULL)) ORDER BY id FOR UPDATE
 ) s;
 IF found_ids IS DISTINCT FROM pids THEN RAISE EXCEPTION 'house_post_unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='move' THEN
  UPDATE public.media SET folder_id=p_folder_id,visibility=CASE WHEN p_folder_id IS NULL THEN 'me' ELSE visibility END WHERE id=ANY(mids) AND user_id=actor;
  UPDATE public.house_posts SET folder_id=p_folder_id,visibility=CASE WHEN p_folder_id IS NULL THEN 'me' ELSE visibility END WHERE id=ANY(pids) AND user_id=actor;
 ELSIF p_action='trash' THEN
  INSERT INTO public.house_media_trash(id,user_id,type,path,thumb_path,caption,duration,visibility,folder_id,created_at)
   SELECT id,user_id,type,path,thumb_path,caption,duration,visibility,folder_id,created_at FROM public.media WHERE id=ANY(mids) AND user_id=actor;
  DELETE FROM public.media WHERE id=ANY(mids) AND user_id=actor;
  UPDATE public.house_posts SET deleted_at=now() WHERE id=ANY(pids) AND user_id=actor;
 ELSE
  INSERT INTO public.media(id,user_id,type,path,thumb_path,caption,duration,visibility,folder_id,created_at)
   SELECT id,user_id,type,path,thumb_path,caption,duration,'me',NULL,created_at FROM public.house_media_trash WHERE id=ANY(mids) AND user_id=actor;
  DELETE FROM public.house_media_trash WHERE id=ANY(mids) AND user_id=actor;
  UPDATE public.house_posts SET deleted_at=NULL,folder_id=NULL,visibility='me' WHERE id=ANY(pids) AND user_id=actor;
 END IF;
 RETURN jsonb_build_object('action',p_action,'media_ids',mids,'post_ids',pids,'folder_id',p_folder_id,'media',CASE WHEN p_action='restore' THEN (SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]') FROM public.media m WHERE m.id=ANY(mids) AND m.user_id=actor) ELSE '[]'::jsonb END);
END;$$;

CREATE OR REPLACE FUNCTION public.house_delete_media_folder(p_folder_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); moved integer;
BEGIN
 IF actor IS NULL OR public.is_banned(actor) THEN RAISE EXCEPTION 'house_management_denied' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.media_folders WHERE id=p_folder_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'house_folder_unavailable' USING ERRCODE='42501'; END IF;
 UPDATE public.media SET folder_id=NULL,visibility='me' WHERE folder_id=p_folder_id AND user_id=actor;
 GET DIAGNOSTICS moved=ROW_COUNT;
 UPDATE public.house_posts SET folder_id=NULL,visibility='me' WHERE folder_id=p_folder_id AND user_id=actor;
 DELETE FROM public.media_folders WHERE id=p_folder_id AND user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'house_folder_unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('deleted_folder',p_folder_id,'moved',moved);
END;$$;
REVOKE ALL ON FUNCTION public.house_save_post(text,text,uuid,text,boolean),public.house_manage_records(text,text[],text[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.house_save_post(text,text,uuid,text,boolean),public.house_manage_records(text,text[],text[],uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
