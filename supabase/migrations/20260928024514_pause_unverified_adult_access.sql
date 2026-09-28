-- The previous birth-year prompt was self-declaration, not age verification.
-- No 19금 cards existed when this pause was prepared. Keep signatures, ownership
-- and EXECUTE grants intact so a verified-age provider can replace the bodies.

CREATE OR REPLACE FUNCTION ojjuda_note_internal.is_adult_member()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT false;
$function$;

-- INSERT and UPDATE OF tags on cards already invoke this trigger. The old
-- trigger checked member_age directly, so disabling is_adult_member alone
-- would still allow publishing a 19금 card.
CREATE OR REPLACE FUNCTION ojjuda_note_internal.guard_adult_tag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF ojjuda_note_internal.has_adult_tag(NEW.tags) THEN
    RAISE EXCEPTION 'Adult tag is unavailable until verified age access is ready'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- Direct RPC calls must not keep collecting unverified birth years.
CREATE OR REPLACE FUNCTION ojjuda_note.confirm_adult(p_birth_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Adult access is unavailable until verified age access is ready'
    USING ERRCODE = '42501';
END;
$function$;
