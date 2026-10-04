-- World and Park share one service announcement. Keep the old Park text
-- untouched as a historical backup, including when the shared notice is cleared.
BEGIN;

INSERT INTO public.app_config (key, value, updated_at)
SELECT 'notice', to_jsonb(coalesce(s.notice, '')), statement_timestamp()
FROM ojjuda_note_internal.settings AS s WHERE s.singleton
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.service_notice()
RETURNS text
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT coalesce((SELECT CASE WHEN jsonb_typeof(c.value) = 'string'
    THEN c.value #>> '{}' ELSE '' END
    FROM public.app_config AS c WHERE c.key = 'notice'), '');
$function$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.service_notice() FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION ojjuda_note_internal.get_note_state()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'notice', ojjuda_note_internal.service_notice(),
    'posting_enabled', true,
    'replies_enabled', true,
    'reports_enabled', true,
    'contact_text', s.contact_text,
    'guidelines', s.guidelines,
    'terms', s.terms,
    'privacy', s.privacy,
    'is_restricted', coalesce(r.is_restricted AND
      (r.restricted_until IS NULL OR r.restricted_until > statement_timestamp()), false),
    'restriction_reason', CASE WHEN r.is_restricted AND
      (r.restricted_until IS NULL OR r.restricted_until > statement_timestamp()) THEN r.reason END,
    'restricted_until', CASE WHEN r.is_restricted AND
      (r.restricted_until IS NULL OR r.restricted_until > statement_timestamp()) THEN r.restricted_until END
  )
  FROM ojjuda_note_internal.settings AS s
  LEFT JOIN ojjuda_note_internal.user_restrictions AS r
    ON r.user_id = (SELECT auth.uid())
  WHERE s.singleton;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.admin_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR ojjuda_note_internal.is_note_moderator() IS NOT TRUE THEN
    RAISE EXCEPTION 'Note moderator required' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT jsonb_build_object('notice', ojjuda_note_internal.service_notice(), 'posting_enabled', true,
    'replies_enabled', true, 'reports_enabled', true,
    'contact_text', s.contact_text, 'guidelines', s.guidelines, 'terms', s.terms,
    'privacy', s.privacy, 'blocked_words', s.blocked_words, 'updated_at', greatest(s.updated_at, (SELECT c.updated_at FROM public.app_config AS c WHERE c.key = 'notice')))
    FROM ojjuda_note_internal.settings AS s WHERE s.singleton);
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.admin_patch_service_settings(p_reason text, p_notice text DEFAULT NULL::text, p_posting_enabled boolean DEFAULT NULL::boolean, p_replies_enabled boolean DEFAULT NULL::boolean, p_reports_enabled boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR ojjuda_note_internal.is_note_moderator() IS NOT TRUE THEN
    RAISE EXCEPTION 'Note moderator required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
     OR (p_notice IS NOT NULL AND char_length(p_notice) > 1000)
     OR p_notice IS NULL THEN
    RAISE EXCEPTION 'Valid settings and reason required' USING ERRCODE = '22023';
  END IF;

  UPDATE ojjuda_note_internal.settings AS s
  SET updated_at = statement_timestamp(),
      updated_by = auth.uid()
  WHERE s.singleton;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note settings missing' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.app_config (key, value, updated_at)
  VALUES ('notice', to_jsonb(btrim(p_notice)), statement_timestamp())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  INSERT INTO ojjuda_note_internal.moderation_actions
    (moderator_id, action, reason, detail)
  VALUES
    (auth.uid(), 'update_settings', btrim(p_reason), jsonb_strip_nulls(jsonb_build_object(
      'notice_length', char_length(btrim(p_notice))
    )));
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.admin_update_settings(p_notice text, p_posting_enabled boolean, p_replies_enabled boolean, p_reports_enabled boolean, p_reason text DEFAULT '운영설정 수정'::text, p_contact_text text DEFAULT NULL::text, p_guidelines text DEFAULT NULL::text, p_terms text DEFAULT NULL::text, p_privacy text DEFAULT NULL::text, p_blocked_words text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR ojjuda_note_internal.is_note_moderator() IS NOT TRUE THEN
    RAISE EXCEPTION 'Note moderator required' USING ERRCODE = '42501';
  END IF;
  IF p_notice IS NULL OR char_length(p_notice) > 1000
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
     OR char_length(p_contact_text) > 1000 OR char_length(p_guidelines) > 5000
     OR char_length(p_terms) > 10000 OR char_length(p_privacy) > 10000
     OR (p_blocked_words IS NOT NULL AND NOT ojjuda_note_internal.valid_blocked_words(p_blocked_words)) THEN
    RAISE EXCEPTION 'Valid settings and reason required' USING ERRCODE = '22023';
  END IF;
  UPDATE ojjuda_note_internal.settings SET contact_text = coalesce(btrim(p_contact_text), contact_text),
    guidelines = coalesce(btrim(p_guidelines), guidelines),
    terms = coalesce(btrim(p_terms), terms), privacy = coalesce(btrim(p_privacy), privacy),
    blocked_words = coalesce(p_blocked_words, blocked_words),
    updated_at = statement_timestamp(), updated_by = auth.uid()
  WHERE singleton;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note settings missing' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.app_config (key, value, updated_at)
  VALUES ('notice', to_jsonb(btrim(p_notice)), statement_timestamp())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  INSERT INTO ojjuda_note_internal.moderation_actions (moderator_id, action, reason, detail)
  VALUES (auth.uid(), 'update_settings', btrim(p_reason), jsonb_build_object(
    'notice_length', char_length(btrim(p_notice)),
    'blocked_words_changed', p_blocked_words IS NOT NULL,
    'operating_documents_changed', p_contact_text IS NOT NULL OR p_guidelines IS NOT NULL
      OR p_terms IS NOT NULL OR p_privacy IS NOT NULL));
END;
$function$;

-- Existing wrappers, execute grants and audit history remain intact.
COMMIT;
