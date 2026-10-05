-- One-time correction for the three distinct-card purchases of background 15
-- on 2026-09-27. The first 10-coin purchase remains charged; the other two
-- were made within that first month's term, so 20 coins are credited back.
-- Apply after the account-wide card photo entitlement migration.

CREATE TABLE IF NOT EXISTS ojjuda_note_internal.card_photo_refunds (
  original_request_id uuid PRIMARY KEY
    REFERENCES ojjuda_note_internal.spend_requests(request_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_key text NOT NULL CHECK (photo_key ~ '^([1-9][0-9]|1[0-8][0-9])$'),
  credit_coins integer NOT NULL CHECK (credit_coins > 0),
  reason text NOT NULL,
  refunded_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE ojjuda_note_internal.card_photo_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ojjuda_note_internal.card_photo_refunds FROM PUBLIC, anon, authenticated;

DO $refund$
DECLARE
  v_users uuid[];
  v_user uuid;
  v_receipts integer;
  v_cards integer;
  v_first timestamptz;
  v_last timestamptz;
  v_first_until timestamptz;
  v_credit integer;
  v_refund_count integer;
BEGIN
  -- The date and three-card guard make this correction specific to the
  -- verified incident. A changed or ambiguous receipt set fails closed.
  SELECT array_agg(user_id) INTO v_users
  FROM (
    SELECT s.user_id
    FROM ojjuda_note_internal.spend_requests AS s
    WHERE s.kind = 'card_photo' AND s.coins = 10
      AND s.result->>'photo_key' = '15'
      AND s.created_at >= timestamptz '2026-09-27 10:00:00+00'
      AND s.created_at < timestamptz '2026-09-27 15:00:00+00'
    GROUP BY s.user_id
    HAVING count(*) = 3 AND count(DISTINCT s.target_id) = 3
      AND max(s.created_at) < min(s.created_at) + interval '1 month'
  ) AS eligible;
  IF coalesce(cardinality(v_users), 0) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one account with three duplicate photo purchases';
  END IF;
  v_user := v_users[1];

  -- The wallet lock serializes this credit with the application's charges.
  PERFORM 1 FROM public.user_private WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund wallet is unavailable'; END IF;

  SELECT count(*), count(DISTINCT s.target_id), min(s.created_at), max(s.created_at)
    INTO v_receipts, v_cards, v_first, v_last
  FROM ojjuda_note_internal.spend_requests AS s
  WHERE s.user_id = v_user AND s.kind = 'card_photo' AND s.coins = 10
    AND s.result->>'photo_key' = '15'
    AND s.created_at >= timestamptz '2026-09-27 10:00:00+00'
    AND s.created_at < timestamptz '2026-09-27 15:00:00+00';
  SELECT (s.result->>'photo_until')::timestamptz INTO v_first_until
  FROM ojjuda_note_internal.spend_requests AS s
  WHERE s.user_id = v_user AND s.kind = 'card_photo' AND s.coins = 10
    AND s.result->>'photo_key' = '15'
    AND s.created_at >= timestamptz '2026-09-27 10:00:00+00'
    AND s.created_at < timestamptz '2026-09-27 15:00:00+00'
  ORDER BY s.created_at, s.request_id LIMIT 1;
  IF v_receipts <> 3 OR v_cards <> 3 OR v_first_until IS NULL
     OR v_last >= v_first_until
     OR EXISTS (
       SELECT 1 FROM ojjuda_note_internal.spend_requests AS prior
       WHERE prior.user_id = v_user AND prior.kind = 'card_photo'
         AND prior.coins = 10 AND prior.result->>'photo_key' = '15'
         AND prior.created_at < v_first
     ) THEN
    RAISE EXCEPTION 'Photo purchase history changed; refund not applied';
  END IF;

  WITH ranked AS (
    SELECT s.request_id,
      row_number() OVER (ORDER BY s.created_at, s.request_id) AS purchase_number
    FROM ojjuda_note_internal.spend_requests AS s
    WHERE s.user_id = v_user AND s.kind = 'card_photo' AND s.coins = 10
      AND s.result->>'photo_key' = '15'
      AND s.created_at >= timestamptz '2026-09-27 10:00:00+00'
      AND s.created_at < timestamptz '2026-09-27 15:00:00+00'
  ), inserted AS (
    INSERT INTO ojjuda_note_internal.card_photo_refunds
      (original_request_id, user_id, photo_key, credit_coins, reason)
    SELECT r.request_id, v_user, '15', 10,
      'same-photo monthly entitlement duplicate charge'
    FROM ranked AS r WHERE r.purchase_number > 1
    ON CONFLICT (original_request_id) DO NOTHING
    RETURNING credit_coins
  )
  SELECT coalesce(sum(credit_coins), 0)::integer INTO v_credit FROM inserted;

  IF v_credit > 0 THEN
    UPDATE public.user_private SET coins = coins + v_credit
    WHERE user_id = v_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'Refund wallet disappeared'; END IF;
  END IF;

  SELECT count(*) INTO v_refund_count
  FROM (
    SELECT s.request_id,
      row_number() OVER (ORDER BY s.created_at, s.request_id) AS purchase_number
    FROM ojjuda_note_internal.spend_requests AS s
    WHERE s.user_id = v_user AND s.kind = 'card_photo' AND s.coins = 10
      AND s.result->>'photo_key' = '15'
      AND s.created_at >= timestamptz '2026-09-27 10:00:00+00'
      AND s.created_at < timestamptz '2026-09-27 15:00:00+00'
  ) AS duplicate
  JOIN ojjuda_note_internal.card_photo_refunds AS refund
    ON refund.original_request_id = duplicate.request_id
  WHERE duplicate.purchase_number > 1
    AND refund.user_id = v_user AND refund.photo_key = '15'
    AND refund.credit_coins = 10;
  IF v_refund_count <> 2 THEN
    RAISE EXCEPTION 'Refund ledger does not contain the two verified duplicates';
  END IF;
  RAISE NOTICE 'Card photo duplicate refund: credited % coins this run', v_credit;
END;
$refund$;
