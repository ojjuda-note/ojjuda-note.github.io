-- Three free fonts; all other composer fonts have account-wide monthly licenses.
CREATE TABLE ojjuda_note_internal.card_font_entitlements (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 font text NOT NULL CHECK (font IN ('nanum-myeongjo','handwriting','heart','calligraphy','mono')),
 purchased_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK (expires_at > purchased_at),
 PRIMARY KEY(user_id,font)
);
ALTER TABLE ojjuda_note_internal.card_font_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ojjuda_note_internal.card_font_entitlements FROM PUBLIC,anon,authenticated;

CREATE FUNCTION ojjuda_note.list_my_card_font_entitlements()
RETURNS TABLE(font text,expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT e.font,e.expires_at FROM ojjuda_note_internal.card_font_entitlements e
 WHERE e.user_id=(SELECT auth.uid()) AND e.expires_at>statement_timestamp();
$$;
REVOKE ALL ON FUNCTION ojjuda_note.list_my_card_font_entitlements() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.list_my_card_font_entitlements() TO authenticated;

CREATE FUNCTION ojjuda_note.purchase_card_font(p_font text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := (SELECT auth.uid()); v_coins integer; v_until timestamptz;
 v_now timestamptz; v_cost integer := 0; v_prior record; v_result jsonb;
BEGIN
 IF v_user IS NULL OR NOT ojjuda_note_internal.can_note_act('memo') THEN
  RAISE EXCEPTION 'Font purchase unavailable' USING ERRCODE='42501';
 END IF;
 IF p_font IS NULL OR p_font NOT IN ('nanum-myeongjo','handwriting','heart','calligraphy','mono') OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'Invalid font purchase' USING ERRCODE='22023';
 END IF;
 SELECT coins INTO v_coins FROM public.user_private WHERE user_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Wallet unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_prior FROM ojjuda_note_internal.spend_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_prior.user_id<>v_user OR v_prior.kind<>'card_font' OR v_prior.result->>'font' IS DISTINCT FROM p_font THEN
   RAISE EXCEPTION 'Request ID already used' USING ERRCODE='22023';
  END IF;
  RETURN v_prior.result;
 END IF;
 SELECT e.expires_at INTO v_until FROM ojjuda_note_internal.card_font_entitlements e
 WHERE e.user_id=v_user AND e.font=p_font FOR UPDATE;
 v_now:=clock_timestamp();
 IF v_until IS NULL OR v_until<=v_now THEN
  v_cost:=10;
  IF v_coins<v_cost THEN RAISE EXCEPTION 'Insufficient coins' USING ERRCODE='22023'; END IF;
  UPDATE public.user_private SET coins=coins-v_cost WHERE user_id=v_user RETURNING coins INTO v_coins;
  v_until:=v_now+interval '1 month';
  INSERT INTO ojjuda_note_internal.card_font_entitlements VALUES(v_user,p_font,v_now,v_until)
  ON CONFLICT(user_id,font) DO UPDATE SET purchased_at=EXCLUDED.purchased_at,expires_at=EXCLUDED.expires_at;
 END IF;
 v_result:=jsonb_build_object('font',p_font,'expires_at',v_until,'cost_coins',v_cost,'coins_after',v_coins);
 INSERT INTO ojjuda_note_internal.spend_requests(request_id,user_id,kind,target_id,coins,result)
 VALUES(p_request_id,v_user,'card_font',v_user,v_cost,v_result);
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION ojjuda_note.purchase_card_font(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.purchase_card_font(text,uuid) TO authenticated;

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
 IF coalesce(p_style->>'font','default') NOT IN ('default','round','serif') THEN
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
REVOKE ALL ON FUNCTION ojjuda_note_internal.upsert_card_style(uuid,jsonb) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
