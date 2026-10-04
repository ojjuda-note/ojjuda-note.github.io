-- Each record category owns its folders. Split legacy shared folders only when
-- they contain records of that kind; preserve privacy and original record data.
BEGIN;
LOCK TABLE public.media_folders,public.media,public.house_posts,public.house_media_trash IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.media_folders ADD COLUMN kind text NOT NULL DEFAULT 'photo'
 CHECK(kind IN ('text','photo','video'));

CREATE TEMP TABLE house_folder_kind_map ON COMMIT DROP AS
WITH used AS (
 SELECT f.id AS old_id,f.user_id,coalesce(k.kind,'photo') AS kind
 FROM public.media_folders f
 LEFT JOIN LATERAL (
  SELECT CASE m.type WHEN 'image' THEN 'photo' ELSE 'video' END AS kind FROM public.media m WHERE m.folder_id=f.id AND m.user_id=f.user_id
  UNION SELECT 'text' FROM public.house_posts p WHERE p.folder_id=f.id AND p.user_id=f.user_id
  UNION SELECT CASE t.type WHEN 'image' THEN 'photo' ELSE 'video' END FROM public.house_media_trash t WHERE t.folder_id=f.id AND t.user_id=f.user_id
 ) k ON true
), ranked AS (
 SELECT *,row_number() OVER(PARTITION BY old_id ORDER BY CASE kind WHEN 'photo' THEN 0 WHEN 'text' THEN 1 ELSE 2 END) AS ordinal FROM used
)
SELECT old_id,user_id,kind,CASE WHEN ordinal=1 THEN old_id ELSE gen_random_uuid() END AS new_id FROM ranked;

-- Existing names and friend restrictions are copied exactly, without rerunning
-- content normalization; the exclusive lock and transaction prevent live writes.
ALTER TABLE public.media_folders DISABLE TRIGGER banned_check;
ALTER TABLE public.media_folders DISABLE TRIGGER house_folder_groups_guard;
ALTER TABLE public.house_posts DISABLE TRIGGER house_post_guard;
INSERT INTO public.media_folders(id,user_id,name,visibility,allowed,allowed_groups,created_at,kind)
 SELECT m.new_id,f.user_id,f.name,f.visibility,f.allowed,f.allowed_groups,f.created_at,m.kind
 FROM house_folder_kind_map m JOIN public.media_folders f ON f.id=m.old_id WHERE m.new_id<>m.old_id;
UPDATE public.media_folders f SET kind=m.kind FROM house_folder_kind_map m WHERE f.id=m.old_id AND m.new_id=m.old_id;
UPDATE public.media r SET folder_id=m.new_id FROM house_folder_kind_map m
 WHERE r.folder_id=m.old_id AND r.user_id=m.user_id AND m.kind=CASE r.type WHEN 'image' THEN 'photo' ELSE 'video' END AND r.folder_id<>m.new_id;
UPDATE public.house_posts r SET folder_id=m.new_id FROM house_folder_kind_map m
 WHERE r.folder_id=m.old_id AND r.user_id=m.user_id AND m.kind='text' AND r.folder_id<>m.new_id;
UPDATE public.house_media_trash r SET folder_id=m.new_id FROM house_folder_kind_map m
 WHERE r.folder_id=m.old_id AND r.user_id=m.user_id AND m.kind=CASE r.type WHEN 'image' THEN 'photo' ELSE 'video' END AND r.folder_id<>m.new_id;
ALTER TABLE public.house_posts ENABLE TRIGGER house_post_guard;
ALTER TABLE public.media_folders ENABLE TRIGGER house_folder_groups_guard;
ALTER TABLE public.media_folders ENABLE TRIGGER banned_check;

CREATE INDEX media_folders_owner_kind_created ON public.media_folders(user_id,kind,created_at,id);
CREATE FUNCTION public.house_folder_kind_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.kind IS DISTINCT FROM OLD.kind THEN RAISE EXCEPTION 'house_folder_kind_immutable' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION public.house_folder_kind_guard() FROM PUBLIC,anon;
CREATE TRIGGER house_folder_kind_guard BEFORE UPDATE ON public.media_folders FOR EACH ROW EXECUTE FUNCTION public.house_folder_kind_guard();

-- Lock the destination while validating ownership/kind. RLS still applies to
-- every write, including direct REST writes and the existing management RPCs.
CREATE OR REPLACE FUNCTION public.media_folder_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE target_kind text;
BEGIN
 IF NEW.folder_id IS NOT NULL THEN
  SELECT f.kind INTO target_kind FROM public.media_folders f WHERE f.id=NEW.folder_id AND f.user_id=NEW.user_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'house_folder_unavailable' USING ERRCODE='42501'; END IF;
  IF target_kind IS DISTINCT FROM (CASE NEW.type WHEN 'image' THEN 'photo' WHEN 'video' THEN 'video' ELSE NULL END) THEN
   RAISE EXCEPTION 'house_folder_kind_mismatch' USING ERRCODE='22023';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.folder_id IS NULL AND OLD.folder_id IS NOT NULL THEN NEW.visibility:='me'; END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION public.media_folder_guard() FROM PUBLIC,anon;
DROP TRIGGER media_folder_guard ON public.media;
CREATE TRIGGER media_folder_guard BEFORE INSERT OR UPDATE ON public.media FOR EACH ROW EXECUTE FUNCTION public.media_folder_guard();
CREATE TRIGGER house_trash_folder_guard BEFORE INSERT OR UPDATE ON public.house_media_trash FOR EACH ROW EXECUTE FUNCTION public.media_folder_guard();

CREATE OR REPLACE FUNCTION public.house_post_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE target_kind text;
BEGIN
 IF NEW.folder_id IS NOT NULL THEN
  SELECT f.kind INTO target_kind FROM public.media_folders f WHERE f.id=NEW.folder_id AND f.user_id=NEW.user_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'house_folder_unavailable' USING ERRCODE='42501'; END IF;
  IF target_kind<>'text' THEN RAISE EXCEPTION 'house_folder_kind_mismatch' USING ERRCODE='22023'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'house_owner_immutable' USING ERRCODE='42501'; END IF;
  IF NEW.folder_id IS NULL AND OLD.folder_id IS NOT NULL THEN NEW.visibility:='me'; END IF;
 END IF;
 NEW.updated_at:=now();RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION public.house_post_guard() FROM PUBLIC,anon;

DO $$
BEGIN
 IF EXISTS(
  SELECT 1 FROM public.media r JOIN public.media_folders f ON f.id=r.folder_id WHERE f.user_id<>r.user_id OR f.kind<>CASE r.type WHEN 'image' THEN 'photo' ELSE 'video' END
  UNION ALL SELECT 1 FROM public.house_posts r JOIN public.media_folders f ON f.id=r.folder_id WHERE f.user_id<>r.user_id OR f.kind<>'text'
  UNION ALL SELECT 1 FROM public.house_media_trash r JOIN public.media_folders f ON f.id=r.folder_id WHERE f.user_id<>r.user_id OR f.kind<>CASE r.type WHEN 'image' THEN 'photo' ELSE 'video' END
 ) THEN RAISE EXCEPTION 'house_folder_split_incomplete'; END IF;
END;$$;
NOTIFY pgrst,'reload schema';
COMMIT;
