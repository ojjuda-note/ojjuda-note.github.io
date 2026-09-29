-- Switch automatic cards from half-hourly (48/day) to hourly (24/day).
-- Published cards and draft copy are preserved. Old half-hour reservations
-- remain recoverable as cancelled rows. Unpublished missed hours never burst.
DO $lock$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(284726,
    ((pg_catalog.statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date-date '2000-01-01')::integer);
END;
$lock$;

ALTER TABLE ojjuda_note_internal.auto_card_schedule
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

UPDATE ojjuda_note_internal.auto_card_schedule
SET cancelled_at=pg_catalog.statement_timestamp(),cancel_reason='hourly_frequency_change'
WHERE posted_at IS NULL AND cancelled_at IS NULL
  AND local_day >= (pg_catalog.statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date
  AND extract(minute FROM planned_at AT TIME ZONE 'Asia/Seoul')<>0;

-- Input order follows publication time: inspiration, humor, inspiration, humor.
-- Preserve the existing tag convention: slots 1-12 inspiration, 25-36 humor.
CREATE OR REPLACE FUNCTION ojjuda_note_internal.stage_auto_cards(p_day date, p_bodies text[], p_source text DEFAULT 'curated_automation'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_today date := (pg_catalog.statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF p_day IS NULL OR p_day<=v_today OR p_day>v_today+14
     OR p_bodies IS NULL OR pg_catalog.cardinality(p_bodies)<>24
     OR p_source IS NULL OR p_source NOT IN ('curated_automation','editor') THEN
    RAISE EXCEPTION 'Stage exactly twenty-four future-day card texts' USING ERRCODE='22023';
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
          FROM pg_catalog.unnest(p_bodies) AS t(body))<>24
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
  SELECT body,p_day,(CASE WHEN ordinality%2=1 THEN (ordinality+1)/2 ELSE 24+ordinality/2 END)::smallint,pg_catalog.statement_timestamp(),p_source
  FROM pg_catalog.unnest(p_bodies) WITH ORDINALITY AS staged(body,ordinality);
  RETURN 24;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.plan_auto_cards(p_day date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE v_count integer;
BEGIN
  IF p_day IS NULL THEN RAISE EXCEPTION 'Date required' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(284726,(p_day-date '2000-01-01')::integer);
  IF EXISTS(SELECT 1 FROM ojjuda_note_internal.auto_card_schedule WHERE local_day=p_day) THEN
    SELECT count(*) INTO v_count FROM ojjuda_note_internal.auto_card_schedule
      WHERE local_day=p_day AND cancelled_at IS NULL;
    RETURN v_count;
  END IF;
  IF (SELECT count(*) FROM ojjuda_note_internal.auto_card_copy
      WHERE local_day=p_day AND ready_at IS NOT NULL)<>24 THEN RETURN 0; END IF;
  IF EXISTS(SELECT 1 FROM ojjuda_note_internal.auto_card_copy
      WHERE local_day=p_day AND ready_at IS NOT NULL
        AND (slot IS NULL OR NOT (slot BETWEEN 1 AND 12 OR slot BETWEEN 25 AND 36))) THEN
    RAISE EXCEPTION 'Hourly copy slots must be 1-12 and 25-36';
  END IF;
  IF (SELECT count(*) FROM ojjuda_note_internal.auto_card_sites)<17 THEN
    RAISE EXCEPTION 'Insufficient nationwide sites';
  END IF;
  INSERT INTO ojjuda_note_internal.auto_card_schedule(local_day,slot,planned_at,copy_id,site_id,gender)
  SELECT p_day,c.slot,
    (p_day::timestamp +
      (CASE WHEN c.slot<=12 THEN (c.slot-1)*2 ELSE (c.slot-25)*2+1 END)*interval '1 hour')
      AT TIME ZONE 'Asia/Seoul',
    c.id,s.id,'private'
  FROM ojjuda_note_internal.auto_card_copy c
  CROSS JOIN LATERAL (
    SELECT id FROM ojjuda_note_internal.auto_card_sites
    ORDER BY random()+c.slot::float8*0.000000000001 LIMIT 1
  ) s
  WHERE c.local_day=p_day AND c.ready_at IS NOT NULL
  ON CONFLICT(local_day,slot) DO NOTHING;
  SELECT count(*) INTO v_count FROM ojjuda_note_internal.auto_card_schedule
    WHERE local_day=p_day AND cancelled_at IS NULL;
  IF v_count<>24 THEN RAISE EXCEPTION 'Schedule must contain exactly 24 entries'; END IF;
  RETURN v_count;
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
  v_hour timestamptz := pg_catalog.date_trunc('hour',v_now AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
  v_author uuid;
  v_enabled boolean;
  v_starts_on date;
  v_old_claim text;
  v_item record;
  v_result jsonb;
  v_card_id uuid;
  v_posted integer := 0;
BEGIN

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
  IF ojjuda_note_internal.plan_auto_cards(v_day)=0 THEN RETURN 0; END IF;
  -- Do not flood the feed with catch-up cards after a delayed execution.
  UPDATE ojjuda_note_internal.auto_card_schedule
    SET cancelled_at=v_now,cancel_reason='missed_hour'
    WHERE local_day=v_day AND posted_at IS NULL AND cancelled_at IS NULL AND planned_at<v_hour;
  IF EXISTS(SELECT 1 FROM ojjuda_note_internal.auto_card_schedule
    WHERE posted_at>=v_hour AND posted_at<v_hour+interval '1 hour') THEN RETURN 0; END IF;
  v_old_claim := pg_catalog.current_setting('request.jwt.claim.sub',true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_author::text,true);
  FOR v_item IN
    SELECT q.local_day,q.slot,q.request_id,q.gender,t.body,s.lat,s.lon
    FROM ojjuda_note_internal.auto_card_schedule q
    JOIN ojjuda_note_internal.auto_card_copy t ON t.id=q.copy_id
    JOIN ojjuda_note_internal.auto_card_sites s ON s.id=q.site_id
    WHERE q.local_day=v_day AND q.posted_at IS NULL AND q.cancelled_at IS NULL AND q.planned_at<=v_now
    ORDER BY q.planned_at,q.slot LIMIT 1 FOR UPDATE OF q
  LOOP
    BEGIN
      v_result := ojjuda_note.publish_card(
        v_item.request_id,v_item.body,ojjuda_note_internal.auto_card_tags(v_item.slot,v_day,v_item.body),
        'anonymous',ojjuda_note_internal.auto_card_style(v_item.slot,v_day),v_item.lat,v_item.lon,NULL::uuid);
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
  ojjuda_note_internal.run_auto_cards() FROM PUBLIC,anon,authenticated;

-- Keep the established one-minute posting buffer; remove the :31 execution.
DO $cron$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO STRICT v_job FROM cron.job WHERE jobname='ojjuda_note_daily_auto_cards';
  PERFORM cron.alter_job(v_job,schedule := '1 * * * *');
END;
$cron$;
