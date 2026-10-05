-- One shared beta allowance for Note and World. Preserve existing charge
-- history and administrator settings (currently enabled, five per KST day).
CREATE OR REPLACE FUNCTION public.beta_charge(pack text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  enabled boolean; lim integer; used integer; amt integer; won integer; c integer;
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
BEGIN
  IF uid IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'no_account'); END IF;
  SELECT value::text::boolean INTO enabled FROM public.app_config WHERE key = 'beta_free_charge';
  IF NOT coalesce(enabled, false) THEN RETURN json_build_object('ok', false, 'reason', 'closed'); END IF;
  CASE pack
    WHEN 'p1000' THEN amt := 10; won := 1000;
    WHEN 'p3000' THEN amt := 30; won := 3000;
    WHEN 'p5000' THEN amt := 50; won := 5000;
    WHEN 'p10000' THEN amt := 100; won := 10000;
    WHEN 'p30000' THEN amt := 300; won := 30000;
    WHEN 'p50000' THEN amt := 500; won := 50000;
    ELSE RETURN json_build_object('ok', false, 'reason', 'unknown');
  END CASE;
  SELECT value::text::integer INTO lim FROM public.app_config WHERE key = 'beta_charge_daily_limit';
  lim := greatest(0, least(coalesce(lim, 5), 100));
  -- Lock first: simultaneous requests from either service share one quota.
  SELECT coins INTO c FROM public.user_private WHERE user_id = uid FOR UPDATE;
  IF c IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'no_account'); END IF;
  SELECT count(*) INTO used FROM public.coin_charges WHERE user_id = uid AND created_at >= day_start;
  IF used >= lim THEN
    RETURN json_build_object('ok', false, 'reason', 'limit', 'limit', lim, 'left', 0, 'coins', c);
  END IF;
  UPDATE public.user_private SET coins = coins + amt WHERE user_id = uid RETURNING coins INTO c;
  INSERT INTO public.coin_charges (user_id, pack, coins, won, free) VALUES (uid, pack, amt, won, true);
  RETURN json_build_object('ok', true, 'coins', c, 'added', amt, 'limit', lim, 'left', lim - used - 1);
END
$function$;

-- Read-only status uses the caller's RLS policies and the server's KST clock.
CREATE OR REPLACE FUNCTION public.beta_charge_status()
RETURNS json LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  uid uuid := auth.uid(); enabled boolean; lim integer; used integer; c integer;
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
BEGIN
  IF uid IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'no_account'); END IF;
  SELECT coins INTO c FROM public.user_private WHERE user_id = uid;
  IF c IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'no_account'); END IF;
  SELECT value::text::boolean INTO enabled FROM public.app_config WHERE key = 'beta_free_charge';
  SELECT value::text::integer INTO lim FROM public.app_config WHERE key = 'beta_charge_daily_limit';
  lim := greatest(0, least(coalesce(lim, 5), 100));
  SELECT count(*) INTO used FROM public.coin_charges WHERE user_id = uid AND created_at >= day_start;
  RETURN json_build_object('ok', true, 'enabled', coalesce(enabled, false), 'coins', c,
    'limit', lim, 'used', used, 'left', greatest(lim - used, 0), 'resets_at', day_start + interval '1 day');
END
$function$;

REVOKE ALL ON FUNCTION public.beta_charge(text), public.beta_charge_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beta_charge(text), public.beta_charge_status() TO authenticated;
