-- The public projection must not invoke a private helper as the API caller.
-- Compute the same visual fields from already-visible rows using the view owner's
-- existing table privileges. Keep visibility filters, columns, ownership, and grants.
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
         SELECT eligible.id,
            eligible.author_id,
            eligible.kind,
            eligible.parent_id,
            eligible.body,
            eligible.tags,
            eligible.background_key,
            eligible.created_at,
            eligible.edited_at,
            eligible.identity_mode,
            eligible.archive_due_at,
            eligible.permanent
           FROM eligible
          WHERE eligible.parent_id IS NULL
        UNION ALL
         SELECT e.id,
            e.author_id,
            e.kind,
            e.parent_id,
            e.body,
            e.tags,
            e.background_key,
            e.created_at,
            e.edited_at,
            e.identity_mode,
            e.archive_due_at,
            e.permanent
           FROM eligible e
             JOIN visible parent ON e.parent_id = parent.id
        )
 SELECT c.id,
    c.kind,
    c.parent_id,
    c.body,
        CASE
            WHEN c.identity_mode = 'nickname'::text THEN COALESCE(( SELECT NULLIF(btrim(to_jsonb(p.*) ->> 'nickname'::text), ''::text) AS "nullif"
               FROM profiles p
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
    c.identity_mode,
    COALESCE(v.visual -> 'style'::text, '{}'::jsonb) AS style,
    v.visual ->> 'photo_key'::text AS photo_key,
    (v.visual ->> 'style_until'::text)::timestamp with time zone AS style_until,
    (v.visual ->> 'photo_until'::text)::timestamp with time zone AS photo_until,
    c.archive_due_at,
    c.permanent
   FROM visible c
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
