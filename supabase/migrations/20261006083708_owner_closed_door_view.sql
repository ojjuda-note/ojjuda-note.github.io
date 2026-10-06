-- Add the existing door state without changing room permissions or stored geometry.
CREATE OR REPLACE FUNCTION ojjuda_house_internal.room_load(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_row public.house_rooms%ROWTYPE;v_open boolean;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_actor) THEN RAISE EXCEPTION 'house_room_not_authenticated' USING ERRCODE='42501';END IF;
 SELECT NOT p.door_closed INTO v_open FROM public.profiles p WHERE p.id=p_owner;
 IF NOT FOUND OR p_owner IS NULL OR (p_owner<>v_actor AND (v_open IS NOT TRUE OR public.blocked_between(p_owner,v_actor) IS NOT FALSE)) THEN RAISE EXCEPTION 'house_room_unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO v_row FROM public.house_rooms WHERE owner_id=p_owner;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'found',false,'canEdit',p_owner=v_actor,'doorClosed',v_open IS NOT TRUE);END IF;
 RETURN jsonb_build_object('ok',true,'found',true,'snapshot',v_row.snapshot,'revision',v_row.revision,'updatedAt',v_row.updated_at,'canEdit',p_owner=v_actor,'doorClosed',v_open IS NOT TRUE);
END;$$;

