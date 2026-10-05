-- Proposed function changes; apply together in one migration transaction.
CREATE OR REPLACE FUNCTION ojjuda_note_internal.publish_card_core(p_request_id uuid, p_body text, p_tags text[] DEFAULT '{}'::text[], p_identity_mode text DEFAULT 'anonymous'::text, p_style jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_parent_id uuid DEFAULT NULL::uuid, p_photo_path text DEFAULT NULL::text)
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
    RETURN v_old.result;
  END IF;
  INSERT INTO ojjuda_note.cards(author_id,kind,parent_id,body,tags,background_key,identity_mode)
    VALUES(v_user,v_kind,p_parent_id,p_body,p_tags,
      ((10 + floor(random() * 180))::integer)::text,p_identity_mode)
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


-- Preserve the existing no-photo API and its eight named arguments.
CREATE OR REPLACE FUNCTION ojjuda_note.publish_card(
  p_request_id uuid,
  p_body text,
  p_tags text[] DEFAULT '{}'::text[],
  p_identity_mode text DEFAULT 'anonymous'::text,
  p_style jsonb DEFAULT '{}'::jsonb,
  p_lat double precision DEFAULT NULL::double precision,
  p_lon double precision DEFAULT NULL::double precision,
  p_parent_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT ojjuda_note_internal.publish_card_core(
    p_request_id,p_body,p_tags,p_identity_mode,p_style,p_lat,p_lon,p_parent_id,NULL::text
  );
$function$;

-- Device photos are uploaded first; their card link is committed with the card.
CREATE OR REPLACE FUNCTION ojjuda_note.publish_card_with_photo(
  p_request_id uuid,
  p_body text,
  p_photo_path text,
  p_tags text[] DEFAULT '{}'::text[],
  p_identity_mode text DEFAULT 'anonymous'::text,
  p_style jsonb DEFAULT '{}'::jsonb,
  p_lat double precision DEFAULT NULL::double precision,
  p_lon double precision DEFAULT NULL::double precision,
  p_parent_id uuid DEFAULT NULL::uuid
)
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
    p_request_id,p_body,p_tags,p_identity_mode,p_style,p_lat,p_lon,p_parent_id,p_photo_path
  );
END;
$function$;

-- Edits may replace an existing attachment, but cannot create the first one.
-- The caller keeps the original photo until this transaction has committed.
CREATE OR REPLACE FUNCTION ojjuda_note.replace_card_photo(
  p_card_id uuid,
  p_path text,
  p_expected_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text;
  v_previous text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE='42501';
  END IF;
  IF p_card_id IS NULL OR p_path IS NULL OR p_expected_path IS NULL
     OR p_path !~ ('^' || v_uid::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
     OR p_expected_path !~ ('^' || v_uid::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') THEN
    RAISE EXCEPTION 'Invalid card photo' USING ERRCODE='22023';
  END IF;

  -- Match the card-before-photo lock order used by publish/archiving paths.
  SELECT c.kind INTO v_kind
  FROM ojjuda_note.cards c
  WHERE c.id=p_card_id AND c.author_id=v_uid
    AND c.kind IN ('memo','comment') AND c.archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR NOT ojjuda_note_internal.can_note_act(v_kind) THEN
    RAISE EXCEPTION 'Card unavailable' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ojjuda_note.public_cards c WHERE c.id=p_card_id) THEN
    RAISE EXCEPTION 'Card unavailable' USING ERRCODE='42501';
  END IF;

  SELECT p.photo_path INTO v_previous
  FROM ojjuda_note_internal.card_photos p
  WHERE p.card_id=p_card_id AND p.author_id=v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card has no photo to replace' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='note-card-photos' AND o.name=p_path AND o.owner_id=v_uid::text
  ) THEN
    RAISE EXCEPTION 'Photo not uploaded' USING ERRCODE='22023';
  END IF;

  -- A lost success response can safely replay the same replacement.
  IF v_previous=p_path THEN
    RETURN jsonb_build_object('ok',true,'path',p_path,'previous_path',NULL::text);
  END IF;
  IF v_previous IS DISTINCT FROM p_expected_path THEN
    RAISE EXCEPTION 'Card photo changed; reload before replacing' USING ERRCODE='40001';
  END IF;

  UPDATE ojjuda_note_internal.card_photos
  SET photo_path=p_path
  WHERE card_id=p_card_id AND author_id=v_uid;
  INSERT INTO ojjuda_note_internal.note_photo_tombstones(bucket_id,photo_path,card_id)
  VALUES('note-card-photos',v_previous,p_card_id)
  ON CONFLICT (bucket_id,photo_path) DO NOTHING;
  RETURN jsonb_build_object('ok',true,'path',p_path,'previous_path',v_previous);
END;
$function$;

-- Only the function owner can reach the reusable core/initial-attachment helper.
-- Keep internal helpers out of the client API; in particular the legacy attach
-- endpoint must no longer add first photos to already-published cards.
REVOKE ALL ON FUNCTION ojjuda_note_internal.publish_card_core(uuid,text,text[],text,jsonb,double precision,double precision,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION ojjuda_note.attach_card_photo(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION ojjuda_note.publish_card(uuid,text,text[],text,jsonb,double precision,double precision,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION ojjuda_note.publish_card_with_photo(uuid,text,text,text[],text,jsonb,double precision,double precision,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION ojjuda_note.replace_card_photo(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.publish_card(uuid,text,text[],text,jsonb,double precision,double precision,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note.publish_card_with_photo(uuid,text,text,text[],text,jsonb,double precision,double precision,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note.replace_card_photo(uuid,text,text) TO authenticated;
