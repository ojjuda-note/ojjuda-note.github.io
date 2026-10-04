-- Folder removal never deletes media or storage objects. Both operations keep
-- caller RLS, reject foreign IDs, and commit all selected changes together.
CREATE OR REPLACE FUNCTION public.house_delete_media_folder(p_folder_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE actor uuid := auth.uid(); moved integer;
BEGIN
  IF actor IS NULL OR public.is_banned(actor) THEN
    RAISE EXCEPTION 'house_management_denied' USING ERRCODE = '42501';
  END IF;
  PERFORM id FROM public.media_folders WHERE id = p_folder_id AND user_id = actor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'house_folder_unavailable' USING ERRCODE = '42501';
  END IF;
  UPDATE public.media SET folder_id = NULL, visibility = 'me'
    WHERE folder_id = p_folder_id AND user_id = actor;
  GET DIAGNOSTICS moved = ROW_COUNT;
  DELETE FROM public.media_folders WHERE id = p_folder_id AND user_id = actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'house_folder_unavailable' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('deleted_folder', p_folder_id, 'moved', moved);
END;
$function$;

CREATE OR REPLACE FUNCTION public.house_move_media(p_ids text[], p_folder_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE actor uuid := auth.uid(); requested text[]; found_ids text[]; moved integer;
BEGIN
  IF actor IS NULL OR public.is_banned(actor) THEN
    RAISE EXCEPTION 'house_management_denied' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(p_ids), 0) = 0 OR cardinality(p_ids) > 100
    OR array_position(p_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'house_media_selection_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO requested FROM (SELECT DISTINCT unnest(p_ids) AS id) ids;
  IF p_folder_id IS NOT NULL THEN
    PERFORM id FROM public.media_folders WHERE id = p_folder_id AND user_id = actor FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'house_folder_unavailable' USING ERRCODE = '42501'; END IF;
  END IF;
  SELECT array_agg(id ORDER BY id) INTO found_ids FROM (
    SELECT id FROM public.media WHERE id = ANY(requested) AND user_id = actor ORDER BY id FOR UPDATE
  ) locked;
  IF found_ids IS DISTINCT FROM requested THEN
    RAISE EXCEPTION 'house_media_unavailable' USING ERRCODE = '42501';
  END IF;
  UPDATE public.media SET folder_id = p_folder_id,
    visibility = CASE WHEN p_folder_id IS NULL THEN 'me' ELSE visibility END
    WHERE id = ANY(requested) AND user_id = actor;
  GET DIAGNOSTICS moved = ROW_COUNT;
  IF moved <> cardinality(requested) THEN
    RAISE EXCEPTION 'house_media_unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('ids', requested, 'folder_id', p_folder_id, 'moved', moved);
END;
$function$;

REVOKE ALL ON FUNCTION public.house_delete_media_folder(uuid), public.house_move_media(text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.house_delete_media_folder(uuid), public.house_move_media(text[], uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
