-- Add the requested package bonuses to future credits only.
-- Keep receipts, balances, daily limits and KST rollover unchanged.
CREATE OR REPLACE FUNCTION public.beta_charge(pack text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  enabled boolean; lim integer; used integer; amt integer; base_amt integer; bonus_amt integer := 0; won integer; c integer;
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
BEGIN
  IF uid IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'no_account'); END IF;
  SELECT value::text::boolean INTO enabled FROM public.app_config WHERE key = 'beta_free_charge';
  IF NOT coalesce(enabled, false) THEN RETURN json_build_object('ok', false, 'reason', 'closed'); END IF;
  CASE pack
    WHEN 'p1000' THEN base_amt := 10; bonus_amt := 0; won := 1000;
    WHEN 'p3000' THEN base_amt := 30; bonus_amt := 0; won := 3000;
    WHEN 'p5000' THEN base_amt := 50; bonus_amt := 5; won := 5000;
    WHEN 'p10000' THEN base_amt := 100; bonus_amt := 10; won := 10000;
    WHEN 'p30000' THEN base_amt := 300; bonus_amt := 35; won := 30000;
    WHEN 'p50000' THEN base_amt := 500; bonus_amt := 50; won := 50000;
    ELSE RETURN json_build_object('ok', false, 'reason', 'unknown');
  END CASE;
  amt := base_amt + bonus_amt;
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
  RETURN json_build_object('ok', true, 'coins', c, 'added', amt, 'base', base_amt, 'bonus', bonus_amt, 'limit', lim, 'left', lim - used - 1);
END
$function$;

REVOKE ALL ON FUNCTION public.beta_charge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beta_charge(text) TO authenticated;
