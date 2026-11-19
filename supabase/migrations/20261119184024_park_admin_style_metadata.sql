-- Keep stored decoration expiry metadata intact when an administrator changes a card font.
-- CREATE OR REPLACE retains the existing moderator guard, execution grants and audit log.
CREATE OR REPLACE FUNCTION ojjuda_note.admin_edit_card_visual(p_card_id uuid, p_style jsonb, p_photo_key text, p_style_until timestamp with time zone, p_photo_until timestamp with time zone, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_old jsonb; v_new jsonb; v_style jsonb;
BEGIN
  IF NOT ojjuda_note_internal.is_note_moderator() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  -- Expirations are server-owned metadata returned by admin_card_visual.
  -- Accept a visual round trip without trusting timestamps supplied by a client.
  v_style := CASE WHEN jsonb_typeof(p_style) = 'object'
    THEN p_style - ARRAY['shopFontUntil', 'shopEffectUntil'] ELSE p_style END;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
    OR NOT ojjuda_note_internal.valid_card_style(v_style)
    OR (p_photo_key IS NOT NULL AND p_photo_key !~ '^([1-9][0-9]|1[0-9]{2}|2[0-8][0-9]|29[0-7])$')
    OR ((p_photo_key IS NULL) <> (p_photo_until IS NULL)) THEN
    RAISE EXCEPTION 'Invalid visual correction' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM ojjuda_note.cards WHERE id = p_card_id
    AND (archived_at IS NULL OR purge_after>statement_timestamp()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card unavailable' USING ERRCODE = '22023'; END IF;
  SELECT to_jsonb(v) INTO v_old FROM ojjuda_note_internal.card_visuals AS v WHERE card_id = p_card_id;
  v_style := v_style || jsonb_build_object(
    'shopFontUntil', CASE
      WHEN coalesce(v_style->>'shopFont', 'none') <> 'none'
        AND v_style->>'shopFont' = v_old#>>'{style,shopFont}'
      THEN v_old#>'{style,shopFontUntil}' ELSE NULL END,
    'shopEffectUntil', CASE
      WHEN coalesce(v_style->>'shopEffect', 'none') <> 'none'
        AND v_style->>'shopEffect' = v_old#>>'{style,shopEffect}'
      THEN v_old#>'{style,shopEffectUntil}' ELSE NULL END);
  INSERT INTO ojjuda_note_internal.card_visuals
    (card_id,style,style_until,photo_key,photo_until)
  VALUES (p_card_id,v_style,p_style_until,p_photo_key,p_photo_until)
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
$function$
