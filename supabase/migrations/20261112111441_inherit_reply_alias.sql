-- The first anonymous name follows its author into subsequent replies even when
-- an older client or a saved composer preference submits the account nickname.
-- Earlier named cards and unrelated threads keep their original identity choice.
LOCK TABLE ojjuda_note.cards IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE ojjuda_note_internal.thread_aliases
  ADD COLUMN established_at timestamptz NOT NULL DEFAULT transaction_timestamp();

WITH RECURSIVE threads AS (
  SELECT id, id AS thread_id FROM ojjuda_note.cards WHERE kind = 'memo' AND parent_id IS NULL
  UNION ALL
  SELECT c.id, t.thread_id FROM ojjuda_note.cards c JOIN threads t ON c.parent_id = t.id
), first_anonymous AS (
  SELECT t.thread_id, c.author_id, min(c.created_at) AS first_at
  FROM threads t JOIN ojjuda_note.cards c ON c.id = t.id
  WHERE c.identity_mode = 'anonymous'
  GROUP BY t.thread_id, c.author_id
)
UPDATE ojjuda_note_internal.thread_aliases a SET established_at = f.first_at
FROM first_anonymous f WHERE a.thread_id = f.thread_id AND a.author_id = f.author_id;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.remember_thread_alias() RETURNS trigger
-- Card writers can only update the private registry through this trigger.
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  root_id uuid := NEW.id;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, kind FROM ojjuda_note.cards WHERE id = NEW.parent_id
      UNION ALL
      SELECT c.id, c.parent_id, c.kind FROM ojjuda_note.cards c JOIN ancestors a ON c.id = a.parent_id
    )
    SELECT id INTO root_id FROM ancestors WHERE parent_id IS NULL AND kind = 'memo';
  END IF;
  IF root_id IS NOT NULL THEN
    INSERT INTO ojjuda_note_internal.thread_aliases (thread_id, author_id, display_name, established_at)
    VALUES (root_id, NEW.author_id, ojjuda_note_internal.initial_thread_alias(NEW.id, NEW.created_at),
            CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at ELSE statement_timestamp() END)
    ON CONFLICT (thread_id, author_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW ojjuda_note.public_cards
WITH (security_barrier = true, security_invoker = false) AS
 WITH RECURSIVE eligible AS MATERIALIZED (
         SELECT c_1.id,
            c_1.author_id,
            c_1.kind,
            c_1.parent_id,
            c_1.body,
            c_1.tags,
            c_1.background_key,
            c_1.created_at,
            c_1.edited_at,
            c_1.identity_mode,
            c_1.archive_due_at,
            c_1.permanent
           FROM ojjuda_note.cards c_1
          WHERE c_1.kind <> 'event'::text AND c_1.archived_at IS NULL AND NOT (EXISTS ( SELECT 1
                   FROM ojjuda_note_internal.card_moderation m
                  WHERE m.card_id = c_1.id AND m.hidden)) AND NOT (EXISTS ( SELECT 1
                   FROM ojjuda_note_internal.blocks b
                  WHERE b.blocker_id = (( SELECT auth.uid() AS uid)) AND b.blocked_id = c_1.author_id))
        ), visible AS (
         SELECT eligible.*, eligible.id AS thread_id
           FROM eligible WHERE eligible.parent_id IS NULL
        UNION ALL
         SELECT e.*, parent.thread_id
           FROM eligible e JOIN visible parent ON e.parent_id = parent.id
        )
 SELECT c.id,
    c.kind,
    c.parent_id,
    c.body,
        CASE
            WHEN alias.display_name IS NOT NULL THEN alias.display_name
            WHEN c.identity_mode = 'nickname'::text THEN COALESCE(( SELECT NULLIF(btrim(to_jsonb(p.*) ->> 'nickname'::text), ''::text) AS "nullif"
               FROM public.profiles p
              WHERE p.id = c.author_id), '익명'::text)
            ELSE '익명'::text
        END AS display_name,
    c.tags,
    c.background_key,
    c.created_at,
    c.edited_at,
    ( SELECT count(*) AS count
           FROM ojjuda_note.reactions r
          WHERE r.card_id = c.id AND r.kind = 'like'::text) AS like_count,
    ( SELECT count(*) AS count
           FROM visible reply
          WHERE reply.parent_id = c.id AND reply.kind = 'comment'::text) AS reply_count,
    COALESCE(c.author_id = (( SELECT auth.uid() AS uid)), false) AS is_mine,
    (EXISTS ( SELECT 1
           FROM ojjuda_note.reactions r
          WHERE r.card_id = c.id AND r.user_id = (( SELECT auth.uid() AS uid)) AND r.kind = 'like'::text)) AS is_liked,
    (EXISTS ( SELECT 1
           FROM ojjuda_note.reactions r
          WHERE r.card_id = c.id AND r.user_id = (( SELECT auth.uid() AS uid)) AND r.kind = 'bookmark'::text)) AS is_bookmarked,
    CASE WHEN alias.display_name IS NOT NULL THEN 'anonymous' ELSE c.identity_mode END AS identity_mode,
    COALESCE(v.visual -> 'style'::text, '{}'::jsonb) AS style,
    v.visual ->> 'photo_key'::text AS photo_key,
    (v.visual ->> 'style_until'::text)::timestamp with time zone AS style_until,
    (v.visual ->> 'photo_until'::text)::timestamp with time zone AS photo_until,
    c.archive_due_at,
    c.permanent,
    (SELECT mine.display_name FROM ojjuda_note_internal.thread_aliases mine
      WHERE mine.thread_id = c.thread_id AND mine.author_id = (SELECT auth.uid())) AS my_reply_alias
   FROM visible c
     LEFT JOIN ojjuda_note_internal.thread_aliases alias
       ON alias.thread_id = c.thread_id AND alias.author_id = c.author_id
      AND (c.identity_mode = 'anonymous'
           OR (c.kind = 'comment' AND c.created_at >= alias.established_at))
     LEFT JOIN ojjuda_note_internal.card_visuals cv ON cv.card_id = c.id
     CROSS JOIN LATERAL (
       SELECT jsonb_build_object(
         'style', CASE WHEN cv.style_until > statement_timestamp() THEN cv.style
           ELSE jsonb_build_object('font','default','size','normal','theme','plain','effect','none') END,
         'style_until', CASE WHEN cv.style_until > statement_timestamp() THEN cv.style_until END,
         'photo_key', CASE WHEN cv.photo_until > statement_timestamp() THEN cv.photo_key
           WHEN c.background_key ~ '^([1-9][0-9]|1[0-8][0-9])$' THEN c.background_key END,
         'photo_until', CASE WHEN cv.photo_until > statement_timestamp() THEN cv.photo_until END
       ) AS visual
     ) v;
NOTIFY pgrst, 'reload schema';
