-- Upgrade the already-installed but disabled daily-card infrastructure.
-- Creative content is staged for each FUTURE Seoul date; the original 101
-- undated seed lines stay unused. No visible source/location/gender tags.

ALTER TABLE ojjuda_note_internal.auto_card_copy
  ADD COLUMN IF NOT EXISTS local_day date,
  ADD COLUMN IF NOT EXISTS slot smallint,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS content_source text NOT NULL DEFAULT 'legacy_seed';
CREATE UNIQUE INDEX IF NOT EXISTS auto_card_copy_day_slot
  ON ojjuda_note_internal.auto_card_copy(local_day,slot);

CREATE OR REPLACE FUNCTION ojjuda_note_internal.stage_auto_cards(
  p_day date, p_bodies text[], p_source text DEFAULT 'curated_automation'
)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE v_today date := (pg_catalog.statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF p_day IS NULL OR p_day<=v_today OR p_day>v_today+14
     OR p_bodies IS NULL OR pg_catalog.cardinality(p_bodies)<>10
     OR p_source IS NULL OR p_source NOT IN ('curated_automation','editor') THEN
    RAISE EXCEPTION 'Stage exactly ten future-day card texts' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(284726,(p_day-date '2000-01-01')::integer);
  IF EXISTS (SELECT 1 FROM ojjuda_note_internal.auto_card_schedule WHERE local_day=p_day) THEN
    RAISE EXCEPTION 'That day is already scheduled' USING ERRCODE='23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_bodies) AS t(body)
    WHERE body IS NULL OR body<>pg_catalog.btrim(body)
      OR NOT ojjuda_note_internal.valid_note_body(body)
      OR public.has_banned(body)
  ) OR (SELECT count(DISTINCT pg_catalog.lower(
                    pg_catalog.regexp_replace(pg_catalog.btrim(body),'[[:space:]]+',' ','g')))
          FROM pg_catalog.unnest(p_bodies) AS t(body))<>10
     OR EXISTS (
       SELECT 1 FROM ojjuda_note_internal.auto_card_copy c
       WHERE c.local_day IS DISTINCT FROM p_day AND c.body=ANY(p_bodies)
     ) THEN
    RAISE EXCEPTION 'Card text failed length, prohibited-word or originality checks'
      USING ERRCODE='23514';
  END IF;
  -- Replacing tomorrow's draft before planning is atomic and repeatable.
  DELETE FROM ojjuda_note_internal.auto_card_copy WHERE local_day=p_day;
  INSERT INTO ojjuda_note_internal.auto_card_copy(body,local_day,slot,ready_at,content_source)
  SELECT body,p_day,ordinality::smallint,pg_catalog.statement_timestamp(),p_source
  FROM pg_catalog.unnest(p_bodies) WITH ORDINALITY AS staged(body,ordinality);
  RETURN 10;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.plan_auto_cards(p_day date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE v_count integer;
BEGIN
  IF p_day IS NULL THEN RAISE EXCEPTION 'Date required' USING ERRCODE='22023'; END IF;
  -- The 101 undated aphorisms are never selected. A missing/partial queue
  -- yields no cards; it never silently repeats old lines.
  IF (SELECT count(*) FROM ojjuda_note_internal.auto_card_copy
      WHERE local_day=p_day AND ready_at IS NOT NULL)<>10 THEN RETURN 0; END IF;
  IF (SELECT count(*) FROM ojjuda_note_internal.auto_card_sites)<10 THEN
    RAISE EXCEPTION 'Need at least ten public backdrop sites';
  END IF;
  WITH selected_site AS MATERIALIZED (
    SELECT s.id,row_number() OVER (ORDER BY pg_catalog.random())::smallint AS slot
    FROM (SELECT id FROM ojjuda_note_internal.auto_card_sites
          ORDER BY pg_catalog.random() LIMIT 10) s
  )
  INSERT INTO ojjuda_note_internal.auto_card_schedule
    (local_day,slot,planned_at,copy_id,site_id,gender)
  SELECT p_day,c.slot,
    (p_day::timestamp + interval '8 hours'
      + (((c.slot::integer-1)*78 + floor(pg_catalog.random()*78)::integer)
        * interval '1 minute')) AT TIME ZONE 'Asia/Seoul',
    c.id,s.id,CASE WHEN pg_catalog.random()<0.5 THEN 'male' ELSE 'female' END
  FROM ojjuda_note_internal.auto_card_copy c JOIN selected_site s USING(slot)
  WHERE c.local_day=p_day AND c.ready_at IS NOT NULL
  ON CONFLICT (local_day,slot) DO NOTHING;
  SELECT count(*) INTO v_count FROM ojjuda_note_internal.auto_card_schedule
  WHERE local_day=p_day;
  IF v_count<>10 THEN RAISE EXCEPTION 'Schedule must contain exactly ten entries'; END IF;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.run_auto_cards()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
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

REVOKE ALL ON FUNCTION ojjuda_note_internal.stage_auto_cards(date,text[],text),
  ojjuda_note_internal.plan_auto_cards(date),
  ojjuda_note_internal.run_auto_cards() FROM PUBLIC, anon, authenticated;

-- Example staging by a trusted server/owner automation, before 08:00 KST:
-- SELECT ojjuda_note_internal.stage_auto_cards(
--   ((now() AT TIME ZONE 'Asia/Seoul')::date + 1),
--   ARRAY['첫 번째 새 글', '둘째 새 글', ... exactly ten distinct texts ...]::text[],
--   'curated_automation');
