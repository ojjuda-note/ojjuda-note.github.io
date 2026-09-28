-- Retire the old focus reward. No wallet balance or check-in history changes.
-- The current production trigger initializes the three focus columns, so
-- replace its body before removing those columns. RESTRICT guards dependencies.
BEGIN;

DROP FUNCTION IF EXISTS public.claim_focus() RESTRICT;

CREATE OR REPLACE FUNCTION public.user_private_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.coins := 20;
  NEW.owned := '{}';
  NEW.last_checkin := NULL;
  RETURN NEW;
END
$function$;

ALTER TABLE public.user_private
  DROP COLUMN IF EXISTS focus_day RESTRICT,
  DROP COLUMN IF EXISTS focus_count RESTRICT,
  DROP COLUMN IF EXISTS last_focus_at RESTRICT;

COMMIT;
