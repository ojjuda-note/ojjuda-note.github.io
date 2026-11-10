-- Rewrite only the published system-bot cards that still have the old,
-- slot-based tag list. Preserve edited_at so their timestamps do not change.
BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(
  284726,
  ((pg_catalog.statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date - date '2000-01-01')::integer
);

CREATE TEMP TABLE scheduled_tag_original ON COMMIT DROP AS
SELECT c.id, c.tags AS old_tags, c.edited_at
FROM ojjuda_note_internal.auto_card_schedule AS q
JOIN ojjuda_note.cards AS c ON c.id = q.card_id
JOIN ojjuda_note_internal.auto_card_config AS cfg
  ON cfg.singleton AND cfg.author_id = c.author_id
JOIN auth.users AS u ON u.id = c.author_id
  AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot' = 'true'
WHERE q.posted_at IS NOT NULL AND c.kind = 'memo' AND c.parent_id IS NULL
  AND c.tags = CASE
    WHEN q.slot > 24 OR (q.local_day = date '2026-09-29' AND q.slot >= 16)
      THEN CASE WHEN c.body ~ '(기상청|나사|NASA|발표|에 따르면)'
        THEN ARRAY['소식','정보']::text[] ELSE ARRAY['유머']::text[] END
    ELSE CASE q.slot % 4
      WHEN 0 THEN ARRAY['위로','공감']::text[]
      WHEN 1 THEN ARRAY['응원']::text[]
      WHEN 2 THEN ARRAY['공감']::text[]
      ELSE ARRAY['명언','위로']::text[] END
    END;

-- The existing moderation trigger requires an authenticated author context.
-- Reuse only the registered, verified system bot, scoped to this transaction.
SELECT pg_catalog.set_config('request.jwt.claim.sub', cfg.author_id::text, true)
FROM ojjuda_note_internal.auto_card_config AS cfg
JOIN auth.users AS u ON u.id = cfg.author_id
  AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot' = 'true'
WHERE cfg.singleton;

UPDATE ojjuda_note.cards AS c
SET tags = ojjuda_note_internal.auto_card_tags(q.slot, q.local_day, c.body)
FROM scheduled_tag_original AS original
JOIN ojjuda_note_internal.auto_card_schedule AS q ON q.card_id = original.id
WHERE c.id = original.id AND c.tags = original.old_tags
  AND c.tags IS DISTINCT FROM ojjuda_note_internal.auto_card_tags(q.slot, q.local_day, c.body);

-- The BEFORE UPDATE OF tags trigger sets edited_at. Restore its previous value.
UPDATE ojjuda_note.cards AS c
SET edited_at = original.edited_at
FROM scheduled_tag_original AS original
WHERE c.id = original.id AND c.edited_at IS DISTINCT FROM original.edited_at;

SELECT count(*) AS backfilled_cards
FROM scheduled_tag_original AS original
JOIN ojjuda_note.cards AS c ON c.id = original.id
WHERE c.tags IS DISTINCT FROM original.old_tags
  AND c.edited_at IS NOT DISTINCT FROM original.edited_at;

COMMIT;
