-- Retain the legacy bot exemption and include the enabled V2 park bot.
-- The authenticated actor, card owner and protected bot metadata must all match.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
CREATE OR REPLACE FUNCTION ojjuda_note_internal.upsert_card_style(p_card_id uuid, p_style jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_style jsonb; v_font_until timestamptz; v_effect_until timestamptz; v_monthly_font_until timestamptz;
BEGIN
  IF p_card_id IS NULL OR NOT ojjuda_note_internal.valid_card_style(coalesce(p_style, '{}'::jsonb)) THEN
    RAISE EXCEPTION 'Invalid card style' USING ERRCODE = '22023';
  END IF;
 IF coalesce(p_style->>'font','default') NOT IN ('default','round','serif')
  AND NOT EXISTS (
   -- Only the enabled, server-configured bot styling its own card is exempt.
   -- Check protected Auth metadata directly, never client-controlled metadata.
   SELECT 1 FROM (
     SELECT author_id FROM ojjuda_note_internal.auto_card_config WHERE singleton AND enabled
     UNION ALL
     SELECT author_id FROM ojjuda_note_internal.park_post_v2_config WHERE singleton AND enabled
   ) cfg
   JOIN auth.users u ON u.id=cfg.author_id
   JOIN ojjuda_note.cards c ON c.id=p_card_id AND c.author_id=cfg.author_id
   WHERE cfg.author_id=(SELECT auth.uid())
    AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true'
  ) THEN
  SELECT e.expires_at INTO v_monthly_font_until FROM ojjuda_note_internal.card_font_entitlements e
  WHERE e.user_id=(SELECT auth.uid()) AND e.font=coalesce(p_style->>'font','default') AND e.expires_at>statement_timestamp();
  -- Previously posted cards keep their original display term when edited.
  IF v_monthly_font_until IS NULL THEN
   SELECT v.style_until INTO v_monthly_font_until FROM ojjuda_note_internal.card_visuals v
   JOIN ojjuda_note.cards c ON c.id=v.card_id
   WHERE v.card_id=p_card_id AND c.author_id=(SELECT auth.uid())
    AND v.style->>'font'=coalesce(p_style->>'font','default') AND v.style_until>statement_timestamp();
  END IF;
  IF v_monthly_font_until IS NULL THEN RAISE EXCEPTION 'Font entitlement required' USING ERRCODE='42501'; END IF;
 END IF;
  IF coalesce(p_style->>'shopSticker','none')<>'none' AND NOT ojjuda_shop_internal.owns(auth.uid(),'card_stickers') THEN RAISE EXCEPTION 'Sticker not owned' USING ERRCODE='42501'; END IF;
  IF coalesce(p_style->>'shopFont','none')<>'none' THEN
    IF NOT ojjuda_shop_internal.owns(auth.uid(),'card_fonts') THEN RAISE EXCEPTION 'Font not owned' USING ERRCODE='42501';END IF;
    SELECT expires_at INTO v_font_until FROM ojjuda_shop_internal.entitlements WHERE user_id=auth.uid() AND product='card_fonts';
  END IF;
  IF coalesce(p_style->>'shopEffect','none')<>'none' THEN
    IF NOT ojjuda_shop_internal.owns(auth.uid(),'card_foil') THEN RAISE EXCEPTION 'Effect not owned' USING ERRCODE='42501';END IF;
    SELECT expires_at INTO v_effect_until FROM ojjuda_shop_internal.entitlements WHERE user_id=auth.uid() AND product='card_foil';
  END IF;
  v_style := jsonb_build_object(
    'shopSticker',coalesce(p_style->>'shopSticker','none'),
    'shopFont',coalesce(p_style->>'shopFont','none'),'shopFontUntil',v_font_until,
    'shopEffect',coalesce(p_style->>'shopEffect','none'),'shopEffectUntil',v_effect_until,
    'font', coalesce(p_style->>'font', 'default'),
    'size', coalesce(p_style->>'size', 'normal'),
    'theme', coalesce(p_style->>'theme', 'plain'),
    'effect', coalesce(p_style->>'effect', 'none'),
    'textColor', coalesce(p_style->>'textColor', 'default'),
    'backgroundColor', coalesce(p_style->>'backgroundColor', 'default'),
    'boxColor', coalesce(p_style->>'boxColor', 'default'),
    'boxTransparency', coalesce((p_style->>'boxTransparency')::integer, 80)
  );
  INSERT INTO ojjuda_note_internal.card_visuals (card_id, style, style_until)
  VALUES (p_card_id, v_style, statement_timestamp() + interval '1 month')
  ON CONFLICT (card_id) DO UPDATE SET
    style = EXCLUDED.style, style_until = EXCLUDED.style_until,
    updated_at = statement_timestamp();
  IF v_monthly_font_until IS NOT NULL THEN
    UPDATE ojjuda_note_internal.card_visuals SET style_until=least(style_until,v_monthly_font_until) WHERE card_id=p_card_id;
  END IF;
END;
$function$;

