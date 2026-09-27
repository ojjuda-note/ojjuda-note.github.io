-- Expand bundled Note card backgrounds from 10..17 to 10..189 (180 images).
-- Upload and verify note/assets/10.jpg ... 189.jpg before applying this file:
-- publish_card/publish_event start choosing all 180 images immediately.
-- All current keys 10..17 remain valid; card, visual, draft and purchase
-- receipt IDs, paid terms, and wallet history remain unchanged.
-- Function bodies are from the live database on 2026-09-27. Only valid photo
-- ranges and the two random-pick counts change; event validation remains.
BEGIN;

ALTER TABLE ojjuda_note.cards DROP CONSTRAINT cards_background_key_check;
ALTER TABLE ojjuda_note.cards ADD CONSTRAINT cards_background_key_check
  CHECK (background_key = 'plain' OR background_key ~ '^([1-9][0-9]|1[0-8][0-9])$');

ALTER TABLE ojjuda_note_internal.card_visuals DROP CONSTRAINT card_visuals_photo_key_check;
ALTER TABLE ojjuda_note_internal.card_visuals ADD CONSTRAINT card_visuals_photo_key_check
  CHECK (photo_key IS NULL OR photo_key ~ '^([1-9][0-9]|1[0-8][0-9])$');

ALTER TABLE ojjuda_note_internal.drafts DROP CONSTRAINT note_draft_content;
ALTER TABLE ojjuda_note_internal.drafts ADD CONSTRAINT note_draft_content
  CHECK (
    (NOT active AND body IS NULL AND tags IS NULL AND background_key IS NULL
      AND kind IS NULL AND parent_id IS NULL AND style IS NULL AND photo_key IS NULL)
    OR
    (active AND body IS NOT NULL AND char_length(body) <= 10000
      AND tags IS NOT NULL AND char_length(tags) <= 240
      AND background_key IS NOT NULL AND background_key ~ '^([1-9][0-9]|1[0-8][0-9])$'
      AND (style IS NULL OR ojjuda_note_internal.valid_card_style(style))
      AND (photo_key IS NULL OR photo_key ~ '^([1-9][0-9]|1[0-8][0-9])$')
      AND kind IS NOT NULL
      AND ((kind = 'memo' AND parent_id IS NULL)
        OR (kind = 'comment' AND parent_id IS NOT NULL)))
  );
CREATE OR REPLACE FUNCTION ojjuda_note_internal.save_draft(
  p_expected_revision bigint, p_content jsonb)
RETURNS TABLE(revision bigint, content jsonb, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE draft_parent uuid;
BEGIN
  IF NOT ojjuda_note_internal.is_world_member() THEN
    RAISE EXCEPTION 'World membership required' USING ERRCODE = '42501';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0
      OR p_expected_revision >= 9007199254740991 THEN
    RAISE EXCEPTION 'Invalid draft revision' USING ERRCODE = '22023';
  END IF;
  IF p_content IS NULL OR jsonb_typeof(p_content) IS DISTINCT FROM 'object'
    OR p_content - ARRAY['body','tags','background_key','kind','parent_id',
      'style','photo_key']::text[] <> '{}'::jsonb
    OR jsonb_typeof(p_content->'body') IS DISTINCT FROM 'string'
    OR char_length(p_content->>'body') > 10000
    OR jsonb_typeof(p_content->'tags') IS DISTINCT FROM 'string'
    OR char_length(p_content->>'tags') > 240
    OR jsonb_typeof(p_content->'background_key') IS DISTINCT FROM 'string'
    OR p_content->>'background_key' !~ '^([1-9][0-9]|1[0-8][0-9])$'
    OR jsonb_typeof(p_content->'kind') IS DISTINCT FROM 'string'
    OR p_content->>'kind' NOT IN ('memo', 'comment')
    OR NOT (p_content ? 'parent_id')
    OR jsonb_typeof(p_content->'parent_id') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'Invalid draft content' USING ERRCODE = '22023';
  END IF;
  IF (p_content ? 'style' AND p_content->'style' <> 'null'::jsonb
        AND ojjuda_note_internal.valid_card_style(p_content->'style') IS DISTINCT FROM true)
    OR (p_content ? 'photo_key'
        AND jsonb_typeof(p_content->'photo_key') NOT IN ('string','null'))
    OR (p_content->>'photo_key' IS NOT NULL
        AND p_content->>'photo_key' !~ '^([1-9][0-9]|1[0-8][0-9])$') THEN
    RAISE EXCEPTION 'Invalid draft visual' USING ERRCODE = '22023';
  END IF;
  BEGIN
    draft_parent := (p_content->>'parent_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid draft parent' USING ERRCODE = '22023';
  END;
  IF (p_content->>'kind' = 'memo' AND draft_parent IS NOT NULL)
    OR (p_content->>'kind' = 'comment' AND draft_parent IS NULL) THEN
    RAISE EXCEPTION 'Invalid draft parent' USING ERRCODE = '22023';
  END IF;
  INSERT INTO ojjuda_note_internal.drafts (user_id) VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE ojjuda_note_internal.drafts AS d
    SET revision = d.revision + 1, active = true,
        body = p_content->>'body', tags = p_content->>'tags',
        background_key = p_content->>'background_key', kind = p_content->>'kind',
        parent_id = draft_parent, style = NULLIF(p_content->'style','null'::jsonb),
        photo_key = p_content->>'photo_key', updated_at = statement_timestamp()
    WHERE d.user_id = auth.uid() AND d.revision = p_expected_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft changed in another tab or device; local text was not overwritten'
      USING ERRCODE = 'PT409';
  END IF;
  RETURN QUERY SELECT * FROM ojjuda_note_internal.read_draft();
END;
$function$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.save_draft(bigint,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.save_draft(bigint,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION ojjuda_note.publish_card(
  p_request_id uuid,p_body text,p_tags text[] DEFAULT '{}'::text[],
  p_identity_mode text DEFAULT 'anonymous',p_style jsonb DEFAULT '{}'::jsonb,
  p_lat double precision DEFAULT NULL,p_lon double precision DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
  v_result := jsonb_build_object('ok',true,'card_id',v_id,
    'background_key',v_bg,'coins_spent',0,
    'effective_archive_due_at',ojjuda_note_internal.effective_archive_due(v_id));
  UPDATE ojjuda_note_internal.spend_requests
    SET target_id=v_id,result=v_result WHERE request_id=p_request_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION ojjuda_note.publish_card(uuid,text,text[],text,jsonb,double precision,double precision,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.publish_card(uuid,text,text[],text,jsonb,double precision,double precision,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION ojjuda_note.publish_event(
  p_request_id uuid,p_body text,p_tags text[],p_identity_mode text,
  p_style jsonb,p_lat double precision,p_lon double precision,
  p_radius_km integer,p_starts_at timestamptz,p_duration_hours integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_id uuid; v_bg text; v_price integer; v_balance integer;
        v_old record; v_result jsonb; v_start timestamptz;
BEGIN
  IF v_user IS NULL OR NOT ojjuda_note_internal.can_note_act('event') THEN
    RAISE EXCEPTION 'Event publishing unavailable' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_identity_mode IS NULL
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
    RETURN v_old.result;
  END IF;
  UPDATE public.user_private SET coins=coins-v_price
    WHERE user_id=v_user RETURNING coins INTO v_balance;
  INSERT INTO ojjuda_note.cards(author_id,kind,parent_id,body,tags,background_key,identity_mode)
    VALUES(v_user,'event',NULL,p_body,p_tags,
      ((10 + floor(random() * 180))::integer)::text,p_identity_mode)
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
$$;
REVOKE ALL ON FUNCTION ojjuda_note.publish_event(uuid,text,text[],text,jsonb,double precision,double precision,integer,timestamptz,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.publish_event(uuid,text,text[],text,jsonb,double precision,double precision,integer,timestamptz,integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.card_visual_for(p_card_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'style', CASE WHEN v.style_until > statement_timestamp() THEN v.style
      ELSE jsonb_build_object('font','default','size','normal','theme','plain','effect','none') END,
    'style_until', CASE WHEN v.style_until > statement_timestamp() THEN v.style_until END,
    'photo_key', CASE WHEN v.photo_until > statement_timestamp() THEN v.photo_key
      WHEN c.background_key ~ '^([1-9][0-9]|1[0-8][0-9])$' THEN c.background_key END,
    'photo_until', CASE WHEN v.photo_until > statement_timestamp() THEN v.photo_until END
  )
  FROM ojjuda_note.cards AS c
  LEFT JOIN ojjuda_note_internal.card_visuals AS v ON v.card_id = c.id
  WHERE c.id = p_card_id;
$function$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.card_visual_for(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION ojjuda_note.purchase_card_photo(
  p_card_id uuid, p_photo_key text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user uuid := (SELECT auth.uid());
        v_coins integer; v_until timestamptz; v_prior record; v_result jsonb;
        v_card ojjuda_note.cards%ROWTYPE;
BEGIN
  IF v_user IS NULL OR NOT ojjuda_note_internal.can_note_act('memo') THEN
    RAISE EXCEPTION 'Purchase unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_card_id IS NULL OR p_photo_key IS NULL OR p_photo_key !~ '^([1-9][0-9]|1[0-8][0-9])$'
      OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid photo purchase' USING ERRCODE = '22023';
  END IF;
  SELECT coins INTO v_coins FROM public.user_private WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet unavailable' USING ERRCODE = '42501'; END IF;
  SELECT user_id, kind, target_id, result INTO v_prior
    FROM ojjuda_note_internal.spend_requests WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.user_id <> v_user OR v_prior.kind <> 'card_photo'
        OR v_prior.target_id <> p_card_id
        OR v_prior.result->>'photo_key' IS DISTINCT FROM p_photo_key THEN
      RAISE EXCEPTION 'Request ID already used' USING ERRCODE = '22023';
    END IF;
    RETURN v_prior.result;
  END IF;
  SELECT * INTO v_card FROM ojjuda_note.cards
    WHERE id = p_card_id AND author_id = v_user AND kind = 'memo'
      AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card unavailable' USING ERRCODE = '42501'; END IF;
  SELECT greatest(coalesce(photo_until, statement_timestamp()), statement_timestamp())
           + interval '1 month' INTO v_until
    FROM ojjuda_note_internal.card_visuals WHERE card_id = p_card_id;
  IF v_until IS NULL THEN v_until := statement_timestamp() + interval '1 month'; END IF;
  IF NOT v_card.permanent AND v_card.archive_due_at < v_until THEN
    RAISE EXCEPTION 'Card expires before photo term; make it permanent first'
      USING ERRCODE = '22023';
  END IF;
  IF v_coins < 10 THEN RAISE EXCEPTION 'Insufficient coins' USING ERRCODE = '22023'; END IF;
  UPDATE public.user_private SET coins = coins - 10 WHERE user_id = v_user RETURNING coins INTO v_coins;
  INSERT INTO ojjuda_note_internal.card_visuals (card_id, photo_key, photo_until)
  VALUES (p_card_id, p_photo_key, v_until)
  ON CONFLICT (card_id) DO UPDATE SET
    photo_key = EXCLUDED.photo_key,
    photo_until = EXCLUDED.photo_until,
    updated_at = statement_timestamp()
  RETURNING photo_until INTO v_until;
  v_result := jsonb_build_object('card_id',p_card_id,'cost_coins',10,'coins_after',v_coins,
                                  'photo_key',p_photo_key,'photo_until',v_until);
  INSERT INTO ojjuda_note_internal.spend_requests
    (request_id,user_id,kind,target_id,coins,result)
  VALUES (p_request_id,v_user,'card_photo',p_card_id,10,v_result);
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION ojjuda_note.purchase_card_photo(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.purchase_card_photo(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION ojjuda_note.admin_edit_card_visual(
  p_card_id uuid, p_style jsonb, p_photo_key text,
  p_style_until timestamptz, p_photo_until timestamptz, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_old jsonb; v_new jsonb;
BEGIN
  IF NOT ojjuda_note_internal.is_note_moderator() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
    OR NOT ojjuda_note_internal.valid_card_style(p_style)
    OR (p_photo_key IS NOT NULL AND p_photo_key !~ '^([1-9][0-9]|1[0-8][0-9])$')
    OR ((p_photo_key IS NULL) <> (p_photo_until IS NULL)) THEN
    RAISE EXCEPTION 'Invalid visual correction' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM ojjuda_note.cards WHERE id = p_card_id
    AND (archived_at IS NULL OR purge_after>statement_timestamp()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card unavailable' USING ERRCODE = '22023'; END IF;
  SELECT to_jsonb(v) INTO v_old FROM ojjuda_note_internal.card_visuals AS v WHERE card_id = p_card_id;
  INSERT INTO ojjuda_note_internal.card_visuals
    (card_id,style,style_until,photo_key,photo_until)
  VALUES (p_card_id,p_style,p_style_until,p_photo_key,p_photo_until)
  ON CONFLICT (card_id) DO UPDATE SET style=EXCLUDED.style,style_until=EXCLUDED.style_until,
    photo_key=EXCLUDED.photo_key,photo_until=EXCLUDED.photo_until,updated_at=statement_timestamp();
  SELECT to_jsonb(v) INTO v_new FROM ojjuda_note_internal.card_visuals AS v WHERE card_id = p_card_id;
  INSERT INTO ojjuda_note_internal.moderation_actions
    (card_id,moderator_id,action,reason,detail)
  VALUES (p_card_id,(SELECT auth.uid()),'edit',btrim(p_reason),
    jsonb_build_object('visual_before',jsonb_build_object('style',v_old->'style',
      'style_until',v_old->'style_until','photo_key',v_old->'photo_key','photo_until',v_old->'photo_until'),
      'visual_after',jsonb_build_object('style',v_new->'style',
      'style_until',v_new->'style_until','photo_key',v_new->'photo_key','photo_until',v_new->'photo_until')));
END;
$function$;
REVOKE ALL ON FUNCTION ojjuda_note.admin_edit_card_visual(uuid,jsonb,text,timestamptz,timestamptz,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.admin_edit_card_visual(uuid,jsonb,text,timestamptz,timestamptz,text)
  TO authenticated;

COMMIT;
