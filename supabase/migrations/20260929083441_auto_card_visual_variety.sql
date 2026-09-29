-- Avoid repeated automatic-card visuals in publication order.
-- Slot IDs interleave full-hour and half-hour cards; slot % 6 repeated pairs.
-- Run with the same daily lock as the publisher before changing live styles.
DO $lock$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(284726,
    ((pg_catalog.statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date-date '2000-01-01')::integer);
END;
$lock$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.auto_card_style(p_slot integer,p_day date)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  v_planned timestamptz;
  v_fonts text[];
  v_colors text[];
  v_font text;
  v_color text;
  v_seed text := p_day::text || ':' || p_slot::text;
BEGIN
  SELECT planned_at INTO v_planned FROM ojjuda_note_internal.auto_card_schedule
    WHERE local_day=p_day AND slot=p_slot;
  IF v_planned IS NULL THEN
    RAISE EXCEPTION 'Scheduled automatic card required' USING ERRCODE='22023';
  END IF;
  -- VOLATILE reads preceding loop writes, including several cards in one run.
  -- The cutoff also lets the one-time repair process old cards chronologically.
  WITH recent AS (
    SELECT v.style,row_number() OVER (ORDER BY q.planned_at DESC,q.slot DESC) AS position
    FROM ojjuda_note_internal.auto_card_schedule q
    JOIN ojjuda_note.cards c ON c.id=q.card_id
    JOIN ojjuda_note_internal.auto_card_config cfg ON cfg.singleton AND cfg.author_id=c.author_id
    JOIN ojjuda_note_internal.card_visuals v ON v.card_id=c.id
    WHERE q.posted_at IS NOT NULL AND c.archived_at IS NULL
      AND v.style_until>pg_catalog.statement_timestamp()
      AND (q.planned_at,q.slot)<(v_planned,p_slot)
    ORDER BY q.planned_at DESC,q.slot DESC LIMIT 4
  )
  SELECT coalesce(array_agg(style->>'font') FILTER (WHERE position<=3),'{}'::text[]),
    coalesce(array_agg(style->>'boxColor'),'{}'::text[]) INTO v_fonts,v_colors FROM recent;
  SELECT value INTO v_font
    FROM unnest(ARRAY['default','round','serif','handwriting','mono']) AS f(value)
    WHERE NOT (value=ANY(array_remove(v_fonts,NULL)))
    ORDER BY md5(v_seed || ':font:' || value) LIMIT 1;
  SELECT value INTO v_color
    FROM unnest(ARRAY['red','yellow','green','blue','purple','black','white']) AS c(value)
    WHERE NOT (value=ANY(array_remove(v_colors,NULL)))
    ORDER BY md5(v_seed || ':color:' || value) LIMIT 1;
  RETURN jsonb_build_object('font',v_font,'boxColor',v_color,
    'textColor',CASE WHEN v_color IN ('yellow','green','white') THEN 'black' ELSE 'white' END);
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
  v_old_claim := pg_catalog.current_setting('request.jwt.claim.sub',true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_author::text,true);
  FOR v_item IN
    SELECT q.local_day,q.slot,q.request_id,q.gender,t.body,s.lat,s.lon
    FROM ojjuda_note_internal.auto_card_schedule q
    JOIN ojjuda_note_internal.auto_card_copy t ON t.id=q.copy_id
    JOIN ojjuda_note_internal.auto_card_sites s ON s.id=q.site_id
    WHERE q.local_day=v_day AND q.posted_at IS NULL AND q.planned_at<=v_now
    ORDER BY q.planned_at,q.slot FOR UPDATE OF q
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


REVOKE ALL ON FUNCTION ojjuda_note_internal.auto_card_style(integer,date),
  ojjuda_note_internal.run_auto_cards() FROM PUBLIC,anon,authenticated;

-- Repair only registered system-bot cards with a current visual entitlement.
-- Keep body, tags, photos, transparency, expiry, purchases and human cards intact.
DO $repair$
DECLARE v_item record; v_count integer := 0;
BEGIN
  FOR v_item IN
    SELECT q.local_day,q.slot,q.card_id
    FROM ojjuda_note_internal.auto_card_schedule q
    JOIN ojjuda_note.cards c ON c.id=q.card_id
    JOIN ojjuda_note_internal.auto_card_config cfg ON cfg.singleton AND cfg.author_id=c.author_id
    JOIN auth.users u ON u.id=c.author_id AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true'
    JOIN ojjuda_note_internal.card_visuals v ON v.card_id=c.id
    WHERE q.posted_at IS NOT NULL AND c.archived_at IS NULL
      AND v.style_until>pg_catalog.statement_timestamp()
    ORDER BY q.planned_at,q.slot FOR UPDATE OF v
  LOOP
    UPDATE ojjuda_note_internal.card_visuals
      SET style=style || ojjuda_note_internal.auto_card_style(v_item.slot,v_item.local_day),
        updated_at=pg_catalog.statement_timestamp()
      WHERE card_id=v_item.card_id;
    v_count := v_count+1;
  END LOOP;
  RAISE NOTICE 'Automatic-card visuals repaired: %',v_count;
END;
$repair$;
