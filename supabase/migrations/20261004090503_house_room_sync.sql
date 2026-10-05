-- Account-owned room geometry only. Diary text and private artwork never enter
-- this table. Writes use compare-and-swap so another device is not overwritten.
CREATE SCHEMA IF NOT EXISTS ojjuda_house_internal;
REVOKE ALL ON SCHEMA ojjuda_house_internal FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA ojjuda_house_internal TO authenticated;

CREATE FUNCTION ojjuda_house_internal.valid_pose(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v jsonb;k text;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['x','y','direction','elevation','mode','attachedTo','accessories']<>'{}'::jsonb THEN RETURN false;END IF;
 IF jsonb_typeof(p->'x') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'y') IS DISTINCT FROM 'number' OR coalesce(p->>'direction','') NOT IN ('left','center','right') THEN RETURN false;END IF;
 IF (p->>'x')::numeric NOT BETWEEN 0 AND 10 OR (p->>'y')::numeric NOT BETWEEN 0 AND 7 THEN RETURN false;END IF;
 IF p?'elevation' THEN
  IF jsonb_typeof(p->'elevation') IS DISTINCT FROM 'number' THEN RETURN false;END IF;
  IF (p->>'elevation')::numeric NOT BETWEEN 0 AND 4.5 THEN RETURN false;END IF;
 END IF;
 IF p?'mode' AND coalesce(p->>'mode','') NOT IN ('floor','sofa') THEN RETURN false;END IF;
 IF p?'attachedTo' AND p->>'attachedTo' IS DISTINCT FROM 'desk' THEN RETURN false;END IF;
 IF p?'accessories' THEN
  IF jsonb_typeof(p->'accessories') IS DISTINCT FROM 'object' THEN RETURN false;END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p->'accessories'))>128 THEN RETURN false;END IF;
  FOR k,v IN SELECT * FROM jsonb_each(p->'accessories') LOOP
   IF k!~'^[a-zA-Z0-9_-]{1,128}$' OR jsonb_typeof(v)<>'boolean' THEN RETURN false;END IF;
  END LOOP;
 END IF;
 RETURN true;
END;$$;

CREATE FUNCTION ojjuda_house_internal.valid_snapshot(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;pose jsonb;k text;v_count integer;
BEGIN
 IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>131072 OR p-ARRAY['version','rooms']<>'{}'::jsonb THEN RETURN false;END IF;
 IF jsonb_typeof(p->'version') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'rooms') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF (p->>'version')::numeric NOT BETWEEN 1 AND 100 OR (p->>'version')::numeric<>trunc((p->>'version')::numeric) OR jsonb_array_length(p->'rooms') NOT BETWEEN 1 AND 35 THEN RETURN false;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'rooms') LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['x','y','decor','curtains','shelf','furniture']<>'{}'::jsonb THEN RETURN false;END IF;
  IF jsonb_typeof(r->'x') IS DISTINCT FROM 'number' OR jsonb_typeof(r->'y') IS DISTINCT FROM 'number' THEN RETURN false;END IF;
  IF (r->>'x')::numeric NOT BETWEEN -2 AND 2 OR (r->>'y')::numeric NOT BETWEEN -3 AND 3 OR (r->>'x')::numeric<>trunc((r->>'x')::numeric) OR (r->>'y')::numeric<>trunc((r->>'y')::numeric) THEN RETURN false;END IF;
  IF (r?'decor' AND jsonb_typeof(r->'decor')<>'boolean') OR (r?'curtains' AND jsonb_typeof(r->'curtains')<>'boolean') THEN RETURN false;END IF;
  IF r?'shelf' AND r->'shelf'<>'null'::jsonb AND NOT ojjuda_house_internal.valid_pose(r->'shelf') THEN RETURN false;END IF;
  IF r?'furniture' THEN
   IF jsonb_typeof(r->'furniture') IS DISTINCT FROM 'object' THEN RETURN false;END IF;
   IF (SELECT count(*) FROM jsonb_object_keys(r->'furniture'))>128 THEN RETURN false;END IF;
   FOR k,pose IN SELECT * FROM jsonb_each(r->'furniture') LOOP
    IF k!~'^[a-zA-Z0-9_-]{1,128}$' OR NOT ojjuda_house_internal.valid_pose(pose) THEN RETURN false;END IF;
   END LOOP;
  END IF;
 END LOOP;
 SELECT count(DISTINCT ((value->>'x')::numeric,(value->>'y')::numeric)) INTO v_count FROM jsonb_array_elements(p->'rooms');
 IF v_count<>jsonb_array_length(p->'rooms') THEN RETURN false;END IF;
 WITH RECURSIVE cells AS (SELECT (value->>'x')::numeric::integer x,(value->>'y')::numeric::integer y FROM jsonb_array_elements(p->'rooms')),
 connected AS (SELECT x,y FROM cells WHERE x=0 AND y=0 UNION SELECT c.x,c.y FROM cells c JOIN connected n ON abs(c.x-n.x)+abs(c.y-n.y)=1)
 SELECT count(*) INTO v_count FROM connected;
 RETURN v_count=jsonb_array_length(p->'rooms');
END;$$;
REVOKE ALL ON FUNCTION ojjuda_house_internal.valid_pose(jsonb),ojjuda_house_internal.valid_snapshot(jsonb) FROM PUBLIC,anon,authenticated;

CREATE TABLE public.house_rooms(
 owner_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 snapshot jsonb NOT NULL CHECK(ojjuda_house_internal.valid_snapshot(snapshot)),
 revision uuid NOT NULL DEFAULT gen_random_uuid(),
 updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE public.house_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.house_rooms FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.house_rooms TO authenticated;
CREATE POLICY house_rooms_read ON public.house_rooms FOR SELECT TO authenticated
 USING ((SELECT auth.uid()) IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid())) AND (owner_id=(SELECT auth.uid()) OR (public.door_open(owner_id) IS TRUE AND public.blocked_between(owner_id,(SELECT auth.uid())) IS FALSE)));
-- No INSERT/UPDATE/DELETE grants or policies: every mutation must check revision.

CREATE FUNCTION ojjuda_house_internal.room_load(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_row public.house_rooms%ROWTYPE;v_open boolean;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_actor) THEN RAISE EXCEPTION 'house_room_not_authenticated' USING ERRCODE='42501';END IF;
 SELECT NOT p.door_closed INTO v_open FROM public.profiles p WHERE p.id=p_owner;
 IF NOT FOUND OR p_owner IS NULL OR (p_owner<>v_actor AND (v_open IS NOT TRUE OR public.blocked_between(p_owner,v_actor) IS NOT FALSE)) THEN RAISE EXCEPTION 'house_room_unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO v_row FROM public.house_rooms WHERE owner_id=p_owner;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'found',false,'canEdit',p_owner=v_actor);END IF;
 RETURN jsonb_build_object('ok',true,'found',true,'snapshot',v_row.snapshot,'revision',v_row.revision,'updatedAt',v_row.updated_at,'canEdit',p_owner=v_actor);
END;$$;

CREATE FUNCTION ojjuda_house_internal.room_save(p_owner uuid,p_snapshot jsonb,p_revision uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_row public.house_rooms%ROWTYPE;
BEGIN
 IF v_actor IS NULL OR p_owner IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'house_room_not_owner' USING ERRCODE='42501';END IF;
 IF ojjuda_house_internal.valid_snapshot(p_snapshot) IS NOT TRUE THEN RAISE EXCEPTION 'house_room_bad_snapshot' USING ERRCODE='22023';END IF;
 -- Lock the owner's existing profile to serialize the first insert as well.
 PERFORM 1 FROM public.profiles WHERE id=v_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'house_room_not_authenticated' USING ERRCODE='42501';END IF;
 SELECT * INTO v_row FROM public.house_rooms WHERE owner_id=p_owner FOR UPDATE;
 IF FOUND THEN
  -- A lost successful response can be retried without overwriting newer edits.
  IF v_row.snapshot=p_snapshot THEN RETURN jsonb_build_object('ok',true,'revision',v_row.revision,'updatedAt',v_row.updated_at);END IF;
  IF p_revision IS DISTINCT FROM v_row.revision THEN RETURN jsonb_build_object('ok',false,'reason','conflict');END IF;
  UPDATE public.house_rooms SET snapshot=p_snapshot,revision=gen_random_uuid(),updated_at=statement_timestamp() WHERE owner_id=p_owner RETURNING * INTO v_row;
 ELSE
  IF p_revision IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'reason','conflict');END IF;
  INSERT INTO public.house_rooms(owner_id,snapshot) VALUES(p_owner,p_snapshot) RETURNING * INTO v_row;
 END IF;
 RETURN jsonb_build_object('ok',true,'revision',v_row.revision,'updatedAt',v_row.updated_at);
END;$$;
REVOKE ALL ON FUNCTION ojjuda_house_internal.room_load(uuid),ojjuda_house_internal.room_save(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_house_internal.room_load(uuid),ojjuda_house_internal.room_save(uuid,jsonb,uuid) TO authenticated;

CREATE FUNCTION public.house_room_load(p_owner uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT ojjuda_house_internal.room_load(p_owner);$$;
CREATE FUNCTION public.house_room_save(p_owner uuid,p_snapshot jsonb,p_revision uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT ojjuda_house_internal.room_save(p_owner,p_snapshot,p_revision);$$;
REVOKE ALL ON FUNCTION public.house_room_load(uuid),public.house_room_save(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.house_room_load(uuid),public.house_room_save(uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
