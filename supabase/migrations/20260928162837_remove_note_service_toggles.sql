-- Retire global posting, reply and report switches.
-- Preserve member permissions, bans, moderation, notices and audit history.
-- Legacy RPC arguments and response booleans remain compatible with already-open pages;
-- their values no longer control service availability.
BEGIN;

CREATE OR REPLACE FUNCTION ojjuda_note.report_event(p_card_id uuid, p_reason text, p_lat double precision, p_lon double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_event record;
BEGIN
  IF auth.uid() IS NULL OR NOT ojjuda_note_internal.is_world_member() THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
     OR p_card_id IS NULL OR p_lat IS NULL OR p_lon IS NULL
     OR p_lat NOT BETWEEN -90 AND 90 OR p_lon NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid event report' USING ERRCODE='22023';
  END IF;
  SELECT e.center_lat,e.center_lon,e.radius_km INTO v_event
  FROM ojjuda_note_internal.event_ads e
  JOIN ojjuda_note.cards c ON c.id=e.card_id
  WHERE c.id=p_card_id AND c.kind='event' AND c.archived_at IS NULL
    AND ojjuda_note_internal.can_read_card(c.id)
    AND e.starts_at<=statement_timestamp() AND e.ends_at>statement_timestamp()
    AND NOT EXISTS (SELECT 1 FROM ojjuda_note_internal.card_moderation m
                    WHERE m.card_id=c.id AND m.hidden)
    AND NOT EXISTS (SELECT 1 FROM ojjuda_note_internal.blocks b
                    WHERE b.blocker_id=auth.uid() AND b.blocked_id=c.author_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event unavailable' USING ERRCODE='42501';
  END IF;
  IF ojjuda_note_internal.distance_m(
    p_lat,p_lon,v_event.center_lat,v_event.center_lon)>v_event.radius_km*1000.0 THEN
    RAISE EXCEPTION 'Event unavailable' USING ERRCODE='42501';
  END IF;
  INSERT INTO ojjuda_note_internal.reports(card_id,reporter_id,reason)
    VALUES(p_card_id,auth.uid(),btrim(p_reason))
    ON CONFLICT(reporter_id,card_id) WHERE status='open' DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.admin_patch_service_settings(p_reason text, p_notice text DEFAULT NULL::text, p_posting_enabled boolean DEFAULT NULL::boolean, p_replies_enabled boolean DEFAULT NULL::boolean, p_reports_enabled boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT ojjuda_note_internal.is_note_moderator() THEN
    RAISE EXCEPTION 'Note moderator required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
     OR (p_notice IS NOT NULL AND char_length(p_notice) > 1000)
     OR p_notice IS NULL THEN
    RAISE EXCEPTION 'Valid settings and reason required' USING ERRCODE = '22023';
  END IF;

  UPDATE ojjuda_note_internal.settings AS s
  SET notice = coalesce(btrim(p_notice), s.notice),
      updated_at = statement_timestamp(),
      updated_by = auth.uid()
  WHERE s.singleton;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note settings missing' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO ojjuda_note_internal.moderation_actions
    (moderator_id, action, reason, detail)
  VALUES
    (auth.uid(), 'update_settings', btrim(p_reason), jsonb_strip_nulls(jsonb_build_object(
      'notice_length', char_length(btrim(p_notice))
    )));
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.admin_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT ojjuda_note_internal.is_note_moderator() THEN
    RAISE EXCEPTION 'Note moderator required' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT jsonb_build_object('notice', s.notice, 'posting_enabled', true,
    'replies_enabled', true, 'reports_enabled', true,
    'contact_text', s.contact_text, 'guidelines', s.guidelines, 'terms', s.terms,
    'privacy', s.privacy, 'blocked_words', s.blocked_words, 'updated_at', s.updated_at)
    FROM ojjuda_note_internal.settings AS s WHERE s.singleton);
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.admin_update_settings(p_notice text, p_posting_enabled boolean, p_replies_enabled boolean, p_reports_enabled boolean, p_reason text DEFAULT '운영설정 수정'::text, p_contact_text text DEFAULT NULL::text, p_guidelines text DEFAULT NULL::text, p_terms text DEFAULT NULL::text, p_privacy text DEFAULT NULL::text, p_blocked_words text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT ojjuda_note_internal.is_note_moderator() THEN
    RAISE EXCEPTION 'Note moderator required' USING ERRCODE = '42501';
  END IF;
  IF p_notice IS NULL OR char_length(p_notice) > 1000
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
     OR char_length(p_contact_text) > 1000 OR char_length(p_guidelines) > 5000
     OR char_length(p_terms) > 10000 OR char_length(p_privacy) > 10000
     OR (p_blocked_words IS NOT NULL AND NOT ojjuda_note_internal.valid_blocked_words(p_blocked_words)) THEN
    RAISE EXCEPTION 'Valid settings and reason required' USING ERRCODE = '22023';
  END IF;
  UPDATE ojjuda_note_internal.settings SET notice = btrim(p_notice),
    contact_text = coalesce(btrim(p_contact_text), contact_text),
    guidelines = coalesce(btrim(p_guidelines), guidelines),
    terms = coalesce(btrim(p_terms), terms), privacy = coalesce(btrim(p_privacy), privacy),
    blocked_words = coalesce(p_blocked_words, blocked_words),
    updated_at = statement_timestamp(), updated_by = auth.uid()
  WHERE singleton;
  INSERT INTO ojjuda_note_internal.moderation_actions (moderator_id, action, reason, detail)
  VALUES (auth.uid(), 'update_settings', btrim(p_reason), jsonb_build_object(
    'notice_length', char_length(btrim(p_notice)),
    'blocked_words_changed', p_blocked_words IS NOT NULL,
    'operating_documents_changed', p_contact_text IS NOT NULL OR p_guidelines IS NOT NULL
      OR p_terms IS NOT NULL OR p_privacy IS NOT NULL));
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.can_note_act(p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (SELECT ojjuda_note_internal.is_world_member())
    AND NOT public.is_banned((SELECT auth.uid()))
    AND NOT EXISTS (
      SELECT 1 FROM ojjuda_note_internal.user_restrictions r
      WHERE r.user_id=(SELECT auth.uid()) AND r.is_restricted
        AND (r.restricted_until IS NULL OR r.restricted_until > statement_timestamp())
    )
    AND p_action IN ('memo', 'event', 'comment', 'reaction');
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.get_note_state()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'notice', s.notice,
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

CREATE OR REPLACE FUNCTION ojjuda_note_internal.report_card(p_card_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT ojjuda_note_internal.is_world_member() THEN
    RAISE EXCEPTION 'World membership required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Reason must contain 1 to 500 characters' USING ERRCODE = '22023';
  END IF;
  IF NOT ojjuda_note_internal.is_card_visible(p_card_id) THEN
    RAISE EXCEPTION 'Card unavailable' USING ERRCODE = '42501';
  END IF;
  INSERT INTO ojjuda_note_internal.reports (card_id, reporter_id, reason)
  VALUES (p_card_id, auth.uid(), btrim(p_reason))
  ON CONFLICT (reporter_id, card_id) WHERE status = 'open' DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.run_auto_cards()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_day date := (v_now AT TIME ZONE 'Asia/Seoul')::date;
  v_time time := (v_now AT TIME ZONE 'Asia/Seoul')::time;
  v_author uuid;
  v_enabled boolean;
  v_starts_on date;
  v_old_claim text;
  v_item record;
  v_result jsonb;
  v_card_id uuid;
  v_posted integer := 0;
BEGIN
  IF v_time < time '08:00' OR v_time > time '21:00' THEN RETURN 0; END IF;
  SELECT author_id,enabled,starts_on INTO v_author,v_enabled,v_starts_on
  FROM ojjuda_note_internal.auto_card_config WHERE singleton;
  IF NOT coalesce(v_enabled,false) OR v_day<v_starts_on THEN RETURN 0; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id=v_author
      AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_private up ON up.user_id=p.id WHERE p.id=v_author
  ) THEN RAISE EXCEPTION 'Dedicated system bot Auth user and membership are required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(284726,(v_day-date '2000-01-01')::integer);
  IF ojjuda_note_internal.plan_auto_cards(v_day)<>10 THEN RETURN 0; END IF;
  v_old_claim := pg_catalog.current_setting('request.jwt.claim.sub',true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_author::text,true);
  FOR v_item IN
    SELECT q.local_day,q.slot,q.request_id,q.gender,t.body,s.lat,s.lon
    FROM ojjuda_note_internal.auto_card_schedule q
    JOIN ojjuda_note_internal.auto_card_copy t ON t.id=q.copy_id
    JOIN ojjuda_note_internal.auto_card_sites s ON s.id=q.site_id
    WHERE q.local_day=v_day AND q.posted_at IS NULL AND q.planned_at<=v_now
    ORDER BY q.slot FOR UPDATE OF q
  LOOP
    BEGIN
      v_result := ojjuda_note.publish_card(
        v_item.request_id,v_item.body,ARRAY[]::text[],
        'anonymous','{}'::jsonb,v_item.lat,v_item.lon,NULL::uuid);
      v_card_id := (v_result->>'card_id')::uuid;
      IF v_card_id IS NULL THEN RAISE EXCEPTION 'Card was not published'; END IF;
      UPDATE ojjuda_note_internal.card_gender SET gender=v_item.gender
      WHERE card_id=v_card_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Card gender marker missing'; END IF;
      UPDATE ojjuda_note_internal.auto_card_schedule
        SET card_id=v_card_id,posted_at=v_now
        WHERE local_day=v_item.local_day AND slot=v_item.slot AND posted_at IS NULL;
      v_posted := v_posted+1;
    EXCEPTION WHEN SQLSTATE 'PNS01' OR SQLSTATE 'PNS02' THEN
      -- Keep completed cards and retry remaining scheduled cards next run.
      EXIT;
    END;
  END LOOP;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(v_old_claim,''),true);
  RETURN v_posted;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(v_old_claim,''),true);
  RAISE;
END;
$function$;

ALTER TABLE ojjuda_note_internal.settings
  DROP COLUMN IF EXISTS posting_enabled,
  DROP COLUMN IF EXISTS replies_enabled,
  DROP COLUMN IF EXISTS reports_enabled;

REVOKE ALL ON FUNCTION ojjuda_note.report_event(p_card_id uuid, p_reason text, p_lat double precision, p_lon double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note.report_event(p_card_id uuid, p_reason text, p_lat double precision, p_lon double precision) TO authenticated;
REVOKE ALL ON FUNCTION ojjuda_note_internal.admin_patch_service_settings(p_reason text, p_notice text, p_posting_enabled boolean, p_replies_enabled boolean, p_reports_enabled boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.admin_patch_service_settings(p_reason text, p_notice text, p_posting_enabled boolean, p_replies_enabled boolean, p_reports_enabled boolean) TO authenticated;
REVOKE ALL ON FUNCTION ojjuda_note_internal.admin_settings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.admin_settings() TO authenticated;
REVOKE ALL ON FUNCTION ojjuda_note_internal.admin_update_settings(p_notice text, p_posting_enabled boolean, p_replies_enabled boolean, p_reports_enabled boolean, p_reason text, p_contact_text text, p_guidelines text, p_terms text, p_privacy text, p_blocked_words text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.admin_update_settings(p_notice text, p_posting_enabled boolean, p_replies_enabled boolean, p_reports_enabled boolean, p_reason text, p_contact_text text, p_guidelines text, p_terms text, p_privacy text, p_blocked_words text[]) TO authenticated;
REVOKE ALL ON FUNCTION ojjuda_note_internal.can_note_act(p_action text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.can_note_act(p_action text) TO authenticated;
REVOKE ALL ON FUNCTION ojjuda_note_internal.get_note_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.get_note_state() TO anon, authenticated;
REVOKE ALL ON FUNCTION ojjuda_note_internal.report_card(p_card_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.report_card(p_card_id uuid, p_reason text) TO authenticated;
REVOKE ALL ON FUNCTION ojjuda_note_internal.run_auto_cards() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
