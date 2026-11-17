-- The feed must aggregate public cards across authors while private rows stay
-- inaccessible to clients. Give its internal reader only the columns it uses.
SET LOCAL lock_timeout = '4s';
CREATE ROLE ojjuda_note_feed_reader NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT ojjuda_note_feed_reader TO CURRENT_USER;
GRANT USAGE ON SCHEMA auth, public, ojjuda_note, ojjuda_note_internal TO ojjuda_note_feed_reader;
GRANT EXECUTE ON FUNCTION auth.uid() TO ojjuda_note_feed_reader;
GRANT SELECT (id, nickname) ON public.profiles TO ojjuda_note_feed_reader;
GRANT SELECT (id, author_id, kind, parent_id, body, tags, background_key, created_at,
              edited_at, identity_mode, archive_due_at, permanent, archived_at)
  ON ojjuda_note.cards TO ojjuda_note_feed_reader;
GRANT SELECT (card_id, kind, user_id) ON ojjuda_note.reactions TO ojjuda_note_feed_reader;
GRANT SELECT (blocker_id, blocked_id) ON ojjuda_note_internal.blocks TO ojjuda_note_feed_reader;
GRANT SELECT (card_id, hidden) ON ojjuda_note_internal.card_moderation TO ojjuda_note_feed_reader;
GRANT SELECT (thread_id, author_id, display_name, established_at)
  ON ojjuda_note_internal.thread_aliases TO ojjuda_note_feed_reader;
GRANT SELECT (card_id, style, style_until, photo_key, photo_until)
  ON ojjuda_note_internal.card_visuals TO ojjuda_note_feed_reader;

CREATE POLICY feed_reader_select ON ojjuda_note.cards FOR SELECT TO ojjuda_note_feed_reader
  USING (archived_at IS NULL AND kind <> 'event');
CREATE POLICY feed_reader_select ON ojjuda_note.reactions FOR SELECT TO ojjuda_note_feed_reader
  USING (kind = 'like' OR (kind = 'bookmark' AND user_id = (SELECT auth.uid())));
CREATE POLICY feed_reader_select ON ojjuda_note_internal.blocks FOR SELECT TO ojjuda_note_feed_reader
  USING (blocker_id = (SELECT auth.uid()));
CREATE POLICY feed_reader_select ON ojjuda_note_internal.card_moderation FOR SELECT TO ojjuda_note_feed_reader
  USING (hidden);
CREATE POLICY feed_reader_select ON public.profiles FOR SELECT TO ojjuda_note_feed_reader USING (true);
CREATE POLICY feed_reader_select ON ojjuda_note_internal.thread_aliases FOR SELECT TO ojjuda_note_feed_reader USING (true);
CREATE POLICY feed_reader_select ON ojjuda_note_internal.card_visuals FOR SELECT TO ojjuda_note_feed_reader USING (true);

CREATE VIEW ojjuda_note_internal.visible_cards_feed
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
            WHEN c.identity_mode = 'nickname'::text THEN COALESCE(( SELECT NULLIF(btrim(p.nickname), ''::text) AS "nullif"
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

-- Transfer only the private projection and revoke the temporary creation right.
GRANT CREATE ON SCHEMA ojjuda_note_internal TO ojjuda_note_feed_reader;
ALTER VIEW ojjuda_note_internal.visible_cards_feed OWNER TO ojjuda_note_feed_reader;
REVOKE CREATE ON SCHEMA ojjuda_note_internal FROM ojjuda_note_feed_reader;
REVOKE ALL ON ojjuda_note_internal.visible_cards_feed FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON ojjuda_note_internal.visible_cards_feed TO anon, authenticated, service_role;

-- Compare both projections in one snapshot before switching the live endpoint.
DO $compare$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ojjuda_note.public_cards previous
    FULL JOIN ojjuda_note_internal.visible_cards_feed candidate USING (id)
    WHERE to_jsonb(previous) IS DISTINCT FROM to_jsonb(candidate)
  ) THEN
    RAISE EXCEPTION 'Public card projection differs from its previous result';
  END IF;
END
$compare$;

-- Keep the public view's OID, column contract, grants and existing dependents.
CREATE OR REPLACE VIEW ojjuda_note.public_cards WITH (security_barrier=true, security_invoker=true) AS
  SELECT id, kind, parent_id, body, display_name, tags, background_key, created_at, edited_at,
         like_count, reply_count, is_mine, is_liked, is_bookmarked, identity_mode,
         style, photo_key, style_until, photo_until, archive_due_at, permanent, my_reply_alias
  FROM ojjuda_note_internal.visible_cards_feed;
NOTIFY pgrst, 'reload schema';
