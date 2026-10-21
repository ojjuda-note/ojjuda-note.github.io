-- Keep member restrictions at the server boundary, including direct API calls.
CREATE OR REPLACE FUNCTION public.daily_checkin()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  viewer uuid := auth.uid();
  today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  balance integer;
  restricted_until timestamptz;
BEGIN
  IF viewer IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id=viewer AND is_anonymous IS NOT TRUE
  ) THEN RAISE EXCEPTION 'not_signed_in' USING ERRCODE='42501'; END IF;
  SELECT coins,banned_until INTO balance,restricted_until
    FROM public.user_private WHERE user_id=viewer FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok',false,'reason','no_account','coins',NULL); END IF;
  IF restricted_until>now() THEN
    RETURN json_build_object('ok',false,'reason','banned','coins',balance);
  END IF;
  UPDATE public.user_private SET coins=coins+1,last_checkin=today
    WHERE user_id=viewer AND (last_checkin IS NULL OR last_checkin<today)
    RETURNING coins INTO balance;
  IF NOT FOUND THEN
    SELECT coins INTO balance FROM public.user_private WHERE user_id=viewer;
    RETURN json_build_object('ok',false,'coins',balance);
  END IF;
  RETURN json_build_object('ok',true,'coins',balance,'reward',1);
END;
$$;

CREATE OR REPLACE FUNCTION ojjuda_photo_internal.member_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM ojjuda_account_internal.member_identity m
    JOIN auth.users u ON u.id=m.user_id
    WHERE m.user_id=auth.uid() AND u.is_anonymous IS NOT TRUE
      AND ojjuda_account_internal.age_on(m.birth_date,(now() AT TIME ZONE 'Asia/Seoul')::date)>=19
      AND NOT EXISTS (SELECT 1 FROM public.user_private p
        WHERE p.user_id=m.user_id AND p.banned_until>now())
  );
$$;

-- These mutations require a signed-in member. Public reads retain their grants.
REVOKE EXECUTE ON FUNCTION public.accept_friend(text),public.daily_checkin(),
  public.game_answer(uuid,boolean),public.game_cancel(uuid),public.game_invite(text,uuid),
  public.game_resign(uuid),public.record_visit(uuid),public.touch_last_seen()
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_friend(text),public.daily_checkin(),
  public.game_answer(uuid,boolean),public.game_cancel(uuid),public.game_invite(text,uuid),
  public.game_resign(uuid),public.record_visit(uuid),public.touch_last_seen()
  TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
