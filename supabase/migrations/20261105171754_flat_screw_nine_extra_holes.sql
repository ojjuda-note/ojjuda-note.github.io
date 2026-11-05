-- Flat puzzle: three free storage holes, plus up to nine purchased per attempt.
-- Preserve the original limits for box/buffer purchases and all receipts.
CREATE OR REPLACE FUNCTION ojjuda_shop_internal.screw_upgrade_buy_v3(
  p_kind text, p_request_id uuid, p_stage integer, p_attempt_id uuid, p_verify_only boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_user uuid := auth.uid();
 v_kind text;
 v_price integer;
 v_coins integer;
 v_previous record;
 v_result jsonb;
 v_count integer := 0;
 v_meta jsonb;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
 IF public.is_banned(v_user) THEN RETURN jsonb_build_object('ok',false,'reason','banned'); END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('box','buffer','flat_hole','flat_moves')
   OR p_stage IS NULL OR p_stage < 1 OR p_stage > 1000
   OR p_attempt_id IS NULL OR p_verify_only IS NULL
   OR (p_request_id IS NULL AND NOT (p_verify_only AND p_kind IN ('flat_hole','flat_moves')))
 THEN RETURN jsonb_build_object('ok',false,'reason','invalid'); END IF;

 v_kind := 'screw_' || p_kind;
 v_price := CASE p_kind WHEN 'box' THEN 3 ELSE 1 END;
 SELECT coins INTO v_coins FROM public.user_private WHERE user_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','wallet_unavailable'); END IF;

 SELECT count(*)::integer INTO v_count FROM ojjuda_note_internal.spend_requests
 WHERE user_id=v_user AND kind=v_kind
 AND result->>'stage'=p_stage::text AND result->>'attempt_id'=p_attempt_id::text;

 v_meta := jsonb_build_object('stage',p_stage,'attempt_id',p_attempt_id,'count',v_count,'price',v_price);
 IF p_kind='flat_moves' THEN
   v_meta := v_meta || jsonb_build_object('extra_moves',v_count*3,'moves_per_purchase',3);
 END IF;
 IF p_request_id IS NULL THEN
   RETURN v_meta || jsonb_build_object('ok',true,'kind',p_kind,'coins',v_coins);
 END IF;

 SELECT user_id,kind,coins,result INTO v_previous
 FROM ojjuda_note_internal.spend_requests WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_previous.user_id<>v_user OR v_previous.kind<>v_kind
     OR v_previous.result->>'stage' IS DISTINCT FROM p_stage::text
     OR v_previous.result->>'attempt_id' IS DISTINCT FROM p_attempt_id::text
   THEN RETURN jsonb_build_object('ok',false,'reason','request_conflict','coins',v_coins); END IF;
   RETURN v_previous.result || v_meta || jsonb_build_object('coins',v_coins);
 END IF;

 IF p_verify_only THEN
   RETURN v_meta || jsonb_build_object('ok',false,'reason','not_found','coins',v_coins);
 END IF;
 IF (p_kind='box' AND v_count>=2) OR (p_kind='buffer' AND v_count>=3)
   OR (p_kind='flat_hole' AND v_count>=9)
 THEN RETURN v_meta || jsonb_build_object('ok',false,'reason','limit','coins',v_coins); END IF;
 IF v_coins<v_price THEN
   RETURN v_meta || jsonb_build_object('ok',false,'reason','coins','coins',v_coins);
 END IF;
 UPDATE public.user_private SET coins=coins-v_price
 WHERE user_id=v_user AND coins>=v_price RETURNING coins INTO v_coins;
 IF NOT FOUND THEN RETURN v_meta || jsonb_build_object('ok',false,'reason','coins'); END IF;

 v_result := jsonb_build_object('ok',true,'kind',p_kind,'price',v_price,
   'coins',v_coins,'stage',p_stage,'attempt_id',p_attempt_id,'count',v_count+1);
 IF p_kind='flat_moves' THEN
   v_result := v_result || jsonb_build_object('extra_moves',(v_count+1)*3,'moves_per_purchase',3);
 END IF;
 INSERT INTO ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result)
 VALUES(p_request_id,v_user,v_kind,v_price,v_result);
 RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.screw_upgrade_buy_v3(
  p_kind text, p_request_id uuid, p_stage integer, p_attempt_id uuid, p_verify_only boolean
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO '' AS $function$
 SELECT ojjuda_shop_internal.screw_upgrade_buy_v3(p_kind,p_request_id,p_stage,p_attempt_id,p_verify_only);
$function$;

REVOKE ALL ON FUNCTION ojjuda_shop_internal.screw_upgrade_buy_v3(text,uuid,integer,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.screw_upgrade_buy_v3(text,uuid,integer,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION ojjuda_shop_internal.screw_upgrade_buy_v3(text,uuid,integer,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.screw_upgrade_buy_v3(text,uuid,integer,uuid,boolean) TO authenticated;
