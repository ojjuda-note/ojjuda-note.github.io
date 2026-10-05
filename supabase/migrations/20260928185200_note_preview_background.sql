-- Keep the preview background through publication; old clients retain their original RPC signatures.
-- Paid photo_key entitlements and uploaded-photo checks remain in their existing paths.

CREATE OR REPLACE FUNCTION ojjuda_note_internal.publish_card_core(p_request_id uuid, p_body text, p_background_key text, p_tags text[] DEFAULT '{}'::text[], p_identity_mode text DEFAULT 'anonymous'::text, p_style jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_parent_id uuid DEFAULT NULL::uuid, p_photo_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid := auth.uid(); v_id uuid; v_bg text; v_old record; v_result jsonb;
        v_kind text := CASE WHEN p_parent_id IS NULL THEN 'memo' ELSE 'comment' END;
        v_node uuid; v_root uuid;
BEGIN
  IF v_user IS NULL OR NOT ojjuda_note_internal.can_note_act(v_kind) THEN
    RAISE EXCEPTION 'Card publishing unavailable' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_identity_mode IS NULL
     OR (p_background_key IS NOT NULL AND p_background_key !~ '^([1-9][0-9]|1[0-8][0-9])$')
     OR p_identity_mode NOT IN ('anonymous','nickname')
     OR p_lat IS NULL OR p_lon IS NULL
     OR p_lat NOT BETWEEN -90 AND 90 OR p_lon NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid card input' USING ERRCODE='22023';
  END IF;
  IF p_parent_id IS NOT NULL THEN
    -- Lock the complete ancestry from memo root down to direct parent. Both
    -- owner/admin subtree archive and a concurrent reply then serialize on
    -- the same rows in a fixed order. Recheck visibility after acquiring them.
    WITH RECURSIVE chain(id,parent_id,kind,depth,path) AS (
      SELECT c.id,c.parent_id,c.kind,0,ARRAY[c.id]
      FROM ojjuda_note.cards c WHERE c.id=p_parent_id
      UNION ALL
      SELECT c.id,c.parent_id,c.kind,ch.depth+1,ch.path||c.id
      FROM ojjuda_note.cards c JOIN chain ch ON c.id=ch.parent_id
      WHERE NOT c.id=ANY(ch.path)
    ) SELECT ch.id INTO v_root FROM chain ch
      WHERE ch.parent_id IS NULL AND ch.kind='memo';
    IF v_root IS NULL THEN
      RAISE EXCEPTION 'Reply target unavailable' USING ERRCODE='42501';
    END IF;
    FOR v_node IN
      WITH RECURSIVE chain(id,parent_id,depth,path) AS (
        SELECT c.id,c.parent_id,0,ARRAY[c.id]
        FROM ojjuda_note.cards c WHERE c.id=p_parent_id
        UNION ALL
        SELECT c.id,c.parent_id,ch.depth+1,ch.path||c.id
        FROM ojjuda_note.cards c JOIN chain ch ON c.id=ch.parent_id
        WHERE NOT c.id=ANY(ch.path)
      ) SELECT ch.id FROM chain ch ORDER BY ch.depth DESC
    LOOP
      PERFORM 1 FROM ojjuda_note.cards c
        WHERE c.id=v_node AND c.archived_at IS NULL FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Reply target archived' USING ERRCODE='42501';
      END IF;
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM ojjuda_note.public_cards pc
      WHERE pc.id=p_parent_id AND pc.kind IN ('memo','comment')
    ) THEN
      -- Event replies require a location-scoped reply/detail API. The old
      -- public view intentionally excludes event roots and descendants.
      RAISE EXCEPTION 'Reply target unavailable' USING ERRCODE='42501';
    END IF;
  END IF;
  IF p_style IS NULL OR jsonb_typeof(p_style)<>'object' THEN
    RAISE EXCEPTION 'Invalid card style' USING ERRCODE='22023';
  END IF;
  -- Existing card constraints and forbidden-word trigger validate body/tags.
  INSERT INTO ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins)
    VALUES(p_request_id,v_user,'note_card',0) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_old FROM ojjuda_note_internal.spend_requests
      WHERE request_id=p_request_id FOR UPDATE;
    IF v_old.user_id<>v_user OR v_old.kind<>'note_card' THEN
      RAISE EXCEPTION 'Request ID already used' USING ERRCODE='23505';
    END IF;
    -- The original attachment choice is immutable even after a later replacement.
    -- Legacy results without this field represent the original no-photo API call.
    IF (v_old.result->>'photo_path') IS DISTINCT FROM p_photo_path THEN
      RAISE EXCEPTION 'Request photo does not match original publication' USING ERRCODE='23505';
    END IF;
    IF p_background_key IS NOT NULL AND (v_old.result->>'background_key') IS DISTINCT FROM p_background_key THEN
      RAISE EXCEPTION 'Request background does not match original publication' USING ERRCODE='23505';
    END IF;
    RETURN v_old.result;
  END IF;
  INSERT INTO ojjuda_note.cards(author_id,kind,parent_id,body,tags,background_key,identity_mode)
    VALUES(v_user,v_kind,p_parent_id,p_body,p_tags,
      coalesce(p_background_key,((10 + floor(random() * 180))::integer)::text),p_identity_mode)
    RETURNING id,background_key INTO v_id,v_bg;
  INSERT INTO ojjuda_note_internal.card_locations
    (card_id,author_id,exact_lat,exact_lon,coarse_lat,coarse_lon)
  VALUES(v_id,v_user,p_lat,p_lon,
    ojjuda_note_internal.snap_lat(p_lat),
    ojjuda_note_internal.snap_lon(p_lat,p_lon));
  IF v_kind='comment' THEN
    PERFORM ojjuda_note_internal.queue_new_reply_retention_alert(v_id);
  END IF;
  PERFORM ojjuda_note_internal.upsert_card_style(v_id,p_style);
  IF p_photo_path IS NOT NULL THEN
    -- Failure rolls the card, location, style, alerts and request back together.
    PERFORM ojjuda_note.attach_card_photo(v_id,p_photo_path);
  END IF;
  v_result := jsonb_build_object('ok',true,'card_id',v_id,
    'background_key',v_bg,'coins_spent',0,'photo_path',p_photo_path,
    'effective_archive_due_at',ojjuda_note_internal.effective_archive_due(v_id));
  UPDATE ojjuda_note_internal.spend_requests
    SET target_id=v_id,result=v_result WHERE request_id=p_request_id;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.publish_card_core(p_request_id uuid, p_body text, p_tags text[] DEFAULT '{}'::text[], p_identity_mode text DEFAULT 'anonymous'::text, p_style jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_parent_id uuid DEFAULT NULL::uuid, p_photo_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT ojjuda_note_internal.publish_card_core(
    p_request_id,p_body,NULL::text,p_tags,p_identity_mode,p_style,p_lat,p_lon,p_parent_id,p_photo_path
  );
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note.publish_card(p_request_id uuid, p_body text, p_background_key text, p_tags text[] DEFAULT '{}'::text[], p_identity_mode text DEFAULT 'anonymous'::text, p_style jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT ojjuda_note_internal.publish_card_core(
    p_request_id,p_body,p_background_key,p_tags,p_identity_mode,p_style,p_lat,p_lon,p_parent_id,NULL::text
  );
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note.publish_card_with_photo(p_request_id uuid, p_body text, p_photo_path text, p_background_key text, p_tags text[] DEFAULT '{}'::text[], p_identity_mode text DEFAULT 'anonymous'::text, p_style jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_photo_path IS NULL THEN
    RAISE EXCEPTION 'Invalid card photo' USING ERRCODE='22023';
  END IF;
  RETURN ojjuda_note_internal.publish_card_core(
    p_request_id,p_body,p_background_key,p_tags,p_identity_mode,p_style,p_lat,p_lon,p_parent_id,p_photo_path
  );
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note.publish_event(p_request_id uuid, p_body text, p_tags text[], p_identity_mode text, p_style jsonb, p_lat double precision, p_lon double precision, p_radius_km integer, p_starts_at timestamp with time zone, p_duration_hours integer, p_background_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid := auth.uid(); v_id uuid; v_bg text; v_price integer; v_balance integer;
        v_old record; v_result jsonb; v_start timestamptz;
BEGIN
  IF v_user IS NULL OR NOT ojjuda_note_internal.can_note_act('event') THEN
    RAISE EXCEPTION 'Event publishing unavailable' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_identity_mode IS NULL
     OR (p_background_key IS NOT NULL AND p_background_key !~ '^([1-9][0-9]|1[0-8][0-9])$')
     OR p_identity_mode NOT IN ('anonymous','nickname')
     OR p_lat IS NULL OR p_lon IS NULL OR p_lat NOT BETWEEN -90 AND 90
     OR p_lon NOT BETWEEN -180 AND 180 OR p_radius_km IS NULL
     OR p_radius_km NOT BETWEEN 1 AND 30 OR p_duration_hours IS NULL
     OR p_duration_hours NOT BETWEEN 1 AND 24 OR p_starts_at IS NULL
     OR p_starts_at < statement_timestamp()-interval '1 minute'
     OR p_starts_at > statement_timestamp()+interval '30 days'
     OR p_style IS NULL OR jsonb_typeof(p_style)<>'object'
     OR NOT coalesce(ojjuda_note_internal.valid_note_body(p_body),false)
     OR NOT coalesce(ojjuda_note.valid_tags(p_tags),false) THEN
    RAISE EXCEPTION 'Invalid event input' USING ERRCODE='22023';
  END IF;
  v_price := 100*p_radius_km*p_duration_hours;
  v_start := greatest(p_starts_at,statement_timestamp());
  SELECT * INTO v_old FROM ojjuda_note_internal.spend_requests
    WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_old.user_id<>v_user OR v_old.kind<>'note_event' THEN
      RAISE EXCEPTION 'Request ID already used' USING ERRCODE='23505';
    END IF;
    IF p_background_key IS NOT NULL AND (v_old.result->>'background_key') IS DISTINCT FROM p_background_key THEN
      RAISE EXCEPTION 'Request background does not match original publication' USING ERRCODE='23505';
    END IF;
    RETURN v_old.result;
  END IF;
  SELECT coins INTO v_balance FROM public.user_private
    WHERE user_id=v_user FOR UPDATE;
  IF v_balance IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','no_account'); END IF;
  IF v_balance < v_price THEN
    RETURN jsonb_build_object('ok',false,'reason','coins','required',v_price,'coins',v_balance);
  END IF;
  INSERT INTO ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins)
    VALUES(p_request_id,v_user,'note_event',v_price) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_old FROM ojjuda_note_internal.spend_requests
      WHERE request_id=p_request_id FOR UPDATE;
    IF v_old.user_id<>v_user OR v_old.kind<>'note_event' THEN
      RAISE EXCEPTION 'Request ID already used' USING ERRCODE='23505';
    END IF;
    IF p_background_key IS NOT NULL AND (v_old.result->>'background_key') IS DISTINCT FROM p_background_key THEN
      RAISE EXCEPTION 'Request background does not match original publication' USING ERRCODE='23505';
    END IF;
    RETURN v_old.result;
  END IF;
  UPDATE public.user_private SET coins=coins-v_price
    WHERE user_id=v_user RETURNING coins INTO v_balance;
  INSERT INTO ojjuda_note.cards(author_id,kind,parent_id,body,tags,background_key,identity_mode)
    VALUES(v_user,'event',NULL,p_body,p_tags,
      coalesce(p_background_key,((10 + floor(random() * 180))::integer)::text),p_identity_mode)
    RETURNING id,background_key INTO v_id,v_bg;
  INSERT INTO ojjuda_note_internal.event_ads
    (card_id,author_id,center_lat,center_lon,radius_km,starts_at,ends_at,price_coins)
    VALUES(v_id,v_user,p_lat,p_lon,p_radius_km,v_start,
           v_start+make_interval(hours=>p_duration_hours),v_price);
  PERFORM ojjuda_note_internal.upsert_card_style(v_id,p_style);
  v_result := jsonb_build_object('ok',true,'card_id',v_id,'background_key',v_bg,
    'coins_spent',v_price,'coins_after',v_balance,'starts_at',v_start,
    'ends_at',v_start+make_interval(hours=>p_duration_hours),
    'effective_archive_due_at',ojjuda_note_internal.effective_archive_due(v_id));
  UPDATE ojjuda_note_internal.spend_requests
    SET target_id=v_id,result=v_result WHERE request_id=p_request_id;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note.publish_event(p_request_id uuid, p_body text, p_tags text[], p_identity_mode text, p_style jsonb, p_lat double precision, p_lon double precision, p_radius_km integer, p_starts_at timestamp with time zone, p_duration_hours integer)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT ojjuda_note.publish_event(
    p_request_id,p_body,p_tags,p_identity_mode,p_style,p_lat,p_lon,p_radius_km,p_starts_at,p_duration_hours,NULL::text
  );
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note.publish_event_with_photo(p_request_id uuid, p_body text, p_tags text[], p_identity_mode text, p_style jsonb, p_lat double precision, p_lon double precision, p_radius_km integer, p_starts_at timestamp with time zone, p_duration_hours integer, p_photo_path text, p_background_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid := auth.uid(); v_result jsonb; v_card uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501';
  END IF;
  IF p_photo_path IS NULL OR p_photo_path !~
      ('^'||v_user::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id='note-event-photos' AND o.name=p_photo_path
         AND o.owner_id=v_user::text
         AND o.created_at>statement_timestamp()-interval '1 day'
     ) THEN
    RAISE EXCEPTION 'Invalid event photo' USING ERRCODE='22023';
  END IF;

  v_result := ojjuda_note.publish_event(
    p_request_id,p_body,p_tags,p_identity_mode,p_style,p_lat,p_lon,
    p_radius_km,p_starts_at,p_duration_hours,p_background_key
  );
  IF COALESCE((v_result->>'ok')::boolean,false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;
  v_card := (v_result->>'card_id')::uuid;
  UPDATE ojjuda_note_internal.event_ads e
     SET photo_path=p_photo_path
   WHERE e.card_id=v_card AND e.author_id=v_user
     AND (e.photo_path IS NULL OR e.photo_path=p_photo_path);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event photo mismatch' USING ERRCODE='23505';
  END IF;
  RETURN v_result||jsonb_build_object('photo_path',p_photo_path);
END;
$function$;

REVOKE ALL ON FUNCTION ojjuda_note_internal.publish_card_core(uuid,text,text,text[],text,jsonb,double precision,double precision,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION ojjuda_note.publish_card(uuid,text,text,text[],text,jsonb,double precision,double precision,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.publish_card(uuid,text,text,text[],text,jsonb,double precision,double precision,uuid) TO authenticated;
REVOKE ALL ON FUNCTION ojjuda_note.publish_card_with_photo(uuid,text,text,text,text[],text,jsonb,double precision,double precision,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.publish_card_with_photo(uuid,text,text,text,text[],text,jsonb,double precision,double precision,uuid) TO authenticated;
REVOKE ALL ON FUNCTION ojjuda_note.publish_event(uuid,text,text[],text,jsonb,double precision,double precision,integer,timestamp with time zone,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.publish_event(uuid,text,text[],text,jsonb,double precision,double precision,integer,timestamp with time zone,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION ojjuda_note.publish_event_with_photo(uuid,text,text[],text,jsonb,double precision,double precision,integer,timestamp with time zone,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.publish_event_with_photo(uuid,text,text[],text,jsonb,double precision,double precision,integer,timestamp with time zone,integer,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
