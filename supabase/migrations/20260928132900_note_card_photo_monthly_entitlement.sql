-- A card photo is licensed to the purchaser for one calendar month per key.
-- The card's visual row is only the place the photo is currently applied.

CREATE TABLE ojjuda_note_internal.card_photo_entitlements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_key text NOT NULL CHECK (photo_key ~ '^([1-9][0-9]|1[0-8][0-9])$'),
  first_purchased_at timestamptz NOT NULL,
  last_purchased_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT card_photo_entitlements_valid_term CHECK (expires_at > last_purchased_at),
  PRIMARY KEY (user_id, photo_key)
);

ALTER TABLE ojjuda_note_internal.card_photo_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ojjuda_note_internal.card_photo_entitlements FROM PUBLIC, anon, authenticated;

-- Drain old paid writes before the historical snapshot. An old RPC that has
-- already begun but inserts after this migration commits is caught by this
-- trigger as well, so the account license is never lost at cutover.
LOCK TABLE ojjuda_note_internal.spend_requests IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION ojjuda_note_internal.capture_paid_card_photo_entitlement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF NEW.kind = 'card_photo' AND NEW.coins > 0
      AND NEW.result->>'photo_key' ~ '^([1-9][0-9]|1[0-8][0-9])$'
      AND NEW.result->>'photo_until' IS NOT NULL THEN
    INSERT INTO ojjuda_note_internal.card_photo_entitlements
      (user_id, photo_key, first_purchased_at, last_purchased_at, expires_at)
    VALUES (NEW.user_id, NEW.result->>'photo_key', NEW.created_at, NEW.created_at,
            (NEW.result->>'photo_until')::timestamptz)
    ON CONFLICT (user_id,photo_key) DO UPDATE SET
      first_purchased_at = least(
        ojjuda_note_internal.card_photo_entitlements.first_purchased_at,
        EXCLUDED.first_purchased_at),
      last_purchased_at = greatest(
        ojjuda_note_internal.card_photo_entitlements.last_purchased_at,
        EXCLUDED.last_purchased_at),
      expires_at = greatest(
        ojjuda_note_internal.card_photo_entitlements.expires_at,
        EXCLUDED.expires_at);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.capture_paid_card_photo_entitlement()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER spend_requests_card_photo_entitlement
AFTER INSERT ON ojjuda_note_internal.spend_requests
FOR EACH ROW EXECUTE FUNCTION ojjuda_note_internal.capture_paid_card_photo_entitlement();

-- Spend history survives deletion of the card, unlike card_visuals. Retain
-- the latest previously paid expiration for each purchaser and photo.
INSERT INTO ojjuda_note_internal.card_photo_entitlements
  (user_id, photo_key, first_purchased_at, last_purchased_at, expires_at)
SELECT s.user_id, s.result->>'photo_key', min(s.created_at), max(s.created_at),
       max((s.result->>'photo_until')::timestamptz)
FROM ojjuda_note_internal.spend_requests AS s
WHERE s.kind = 'card_photo' AND s.coins > 0
  AND s.result->>'photo_key' ~ '^([1-9][0-9]|1[0-8][0-9])$'
  AND s.result->>'photo_until' IS NOT NULL
GROUP BY s.user_id, s.result->>'photo_key';

CREATE OR REPLACE FUNCTION ojjuda_note.list_my_card_photo_entitlements()
RETURNS TABLE(photo_key text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT e.photo_key, e.expires_at
  FROM ojjuda_note_internal.card_photo_entitlements AS e
  WHERE e.user_id = (SELECT auth.uid())
    AND e.expires_at > statement_timestamp()
  ORDER BY e.photo_key;
$function$;
REVOKE ALL ON FUNCTION ojjuda_note.list_my_card_photo_entitlements()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.list_my_card_photo_entitlements()
  TO authenticated;

CREATE OR REPLACE FUNCTION ojjuda_note.apply_owned_card_photo(
  p_card_id uuid, p_photo_key text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user uuid := (SELECT auth.uid());
        v_coins integer; v_until timestamptz; v_prior record; v_result jsonb;
BEGIN
  IF v_user IS NULL OR NOT ojjuda_note_internal.can_note_act('memo') THEN
    RAISE EXCEPTION 'Photo unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_card_id IS NULL OR p_photo_key IS NULL
      OR p_photo_key !~ '^([1-9][0-9]|1[0-8][0-9])$'
      OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid photo selection' USING ERRCODE = '22023';
  END IF;

  -- Use the same lock order as purchase_card_photo, making a paid renewal
  -- and a free application of one key serializable for this account.
  SELECT coins INTO v_coins FROM public.user_private
    WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet unavailable' USING ERRCODE = '42501'; END IF;

  SELECT user_id, kind, target_id, result INTO v_prior
    FROM ojjuda_note_internal.spend_requests WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.user_id <> v_user OR v_prior.kind <> 'card_photo_apply'
        OR v_prior.target_id <> p_card_id
        OR v_prior.result->>'photo_key' IS DISTINCT FROM p_photo_key THEN
      RAISE EXCEPTION 'Request ID already used' USING ERRCODE = '22023';
    END IF;
    RETURN v_prior.result;
  END IF;

  PERFORM 1 FROM ojjuda_note.cards
    WHERE id = p_card_id AND author_id = v_user AND kind = 'memo'
      AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card unavailable' USING ERRCODE = '42501'; END IF;

  SELECT e.expires_at INTO v_until
    FROM ojjuda_note_internal.card_photo_entitlements AS e
    WHERE e.user_id = v_user AND e.photo_key = p_photo_key FOR UPDATE;
  IF v_until IS NULL OR v_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'Photo entitlement expired' USING ERRCODE = '22023';
  END IF;

  INSERT INTO ojjuda_note_internal.card_visuals (card_id, photo_key, photo_until)
  VALUES (p_card_id, p_photo_key, v_until)
  ON CONFLICT (card_id) DO UPDATE SET
    photo_key = EXCLUDED.photo_key,
    photo_until = EXCLUDED.photo_until,
    updated_at = statement_timestamp();

  v_result := jsonb_build_object('card_id',p_card_id,'cost_coins',0,
    'coins_after',v_coins,'photo_key',p_photo_key,'photo_until',v_until);
  INSERT INTO ojjuda_note_internal.spend_requests
    (request_id,user_id,kind,target_id,coins,result)
  VALUES (p_request_id,v_user,'card_photo_apply',p_card_id,0,v_result);
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION ojjuda_note.apply_owned_card_photo(uuid,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.apply_owned_card_photo(uuid,text,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION ojjuda_note.purchase_card_photo(
  p_card_id uuid, p_photo_key text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user uuid := (SELECT auth.uid());
        v_coins integer; v_until timestamptz; v_now timestamptz;
        v_cost integer := 0; v_prior record; v_result jsonb;
BEGIN
  IF v_user IS NULL OR NOT ojjuda_note_internal.can_note_act('memo') THEN
    RAISE EXCEPTION 'Purchase unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_card_id IS NULL OR p_photo_key IS NULL
      OR p_photo_key !~ '^([1-9][0-9]|1[0-8][0-9])$'
      OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid photo purchase' USING ERRCODE = '22023';
  END IF;

  SELECT coins INTO v_coins FROM public.user_private
    WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet unavailable' USING ERRCODE = '42501'; END IF;

  SELECT user_id, kind, target_id, result INTO v_prior
    FROM ojjuda_note_internal.spend_requests WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.user_id <> v_user OR v_prior.kind <> 'card_photo'
        OR v_prior.target_id <> p_card_id
        OR v_prior.result->>'photo_key' IS DISTINCT FROM p_photo_key THEN
      RAISE EXCEPTION 'Request ID already used' USING ERRCODE = '22023';
    END IF;
    RETURN v_prior.result;
  END IF;

  PERFORM 1 FROM ojjuda_note.cards
    WHERE id = p_card_id AND author_id = v_user AND kind = 'memo'
      AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card unavailable' USING ERRCODE = '42501'; END IF;

  SELECT e.expires_at INTO v_until
    FROM ojjuda_note_internal.card_photo_entitlements AS e
    WHERE e.user_id = v_user AND e.photo_key = p_photo_key FOR UPDATE;
  v_now := clock_timestamp();
  IF v_until IS NULL OR v_until <= v_now THEN
    v_cost := 10;
    IF v_coins < v_cost THEN
      RAISE EXCEPTION 'Insufficient coins' USING ERRCODE = '22023';
    END IF;
    UPDATE public.user_private SET coins = coins - v_cost
      WHERE user_id = v_user RETURNING coins INTO v_coins;
    v_until := v_now + interval '1 month';
    INSERT INTO ojjuda_note_internal.card_photo_entitlements
      (user_id, photo_key, first_purchased_at, last_purchased_at, expires_at)
    VALUES (v_user, p_photo_key, v_now, v_now, v_until)
    ON CONFLICT (user_id,photo_key) DO UPDATE SET
      last_purchased_at = EXCLUDED.last_purchased_at,
      expires_at = EXCLUDED.expires_at;
  END IF;

  -- A card may archive before the account-wide license expires; its archive
  -- lifecycle does not shorten the license for other cards.
  INSERT INTO ojjuda_note_internal.card_visuals (card_id, photo_key, photo_until)
  VALUES (p_card_id, p_photo_key, v_until)
  ON CONFLICT (card_id) DO UPDATE SET
    photo_key = EXCLUDED.photo_key,
    photo_until = EXCLUDED.photo_until,
    updated_at = statement_timestamp();

  v_result := jsonb_build_object('card_id',p_card_id,'cost_coins',v_cost,
    'coins_after',v_coins,'photo_key',p_photo_key,'photo_until',v_until);
  INSERT INTO ojjuda_note_internal.spend_requests
    (request_id,user_id,kind,target_id,coins,result)
  VALUES (p_request_id,v_user,'card_photo',p_card_id,v_cost,v_result);
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION ojjuda_note.purchase_card_photo(uuid,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.purchase_card_photo(uuid,text,uuid)
  TO authenticated;
