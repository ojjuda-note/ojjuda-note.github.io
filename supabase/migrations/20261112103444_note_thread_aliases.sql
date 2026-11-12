-- Keep each participant's first anonymous name within a single Park conversation.
-- Only the resulting display name is returned by the existing public projection.
CREATE TABLE ojjuda_note_internal.thread_aliases (
  thread_id uuid NOT NULL REFERENCES ojjuda_note.cards(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  PRIMARY KEY (thread_id, author_id)
);
ALTER TABLE ojjuda_note_internal.thread_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ojjuda_note_internal.thread_aliases FROM PUBLIC, anon, authenticated;
CREATE INDEX thread_aliases_author_idx ON ojjuda_note_internal.thread_aliases(author_id);

-- Match the existing card names, including the original 32-word lists.
CREATE FUNCTION ojjuda_note_internal.initial_thread_alias(card_id uuid, posted_at timestamptz)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE
  adjectives constant text[] := ARRAY['수줍은', '졸린', '반짝이는', '포근한', '용감한', '느긋한', '상냥한', '씩씩한', '말랑한', '조용한', '설레는', '엉뚱한',
  '다정한', '새침한', '동글동글한', '꿈꾸는', '산책하는', '노래하는', '배고픈', '웃는', '수다쟁이', '따뜻한', '시원한', '보송보송한',
  '몽글몽글한', '반가운', '차분한', '궁금한', '행복한', '장난꾸러기', '달콤한', '느릿한',
  '맑은', '해맑은', '산뜻한', '싱그러운', '향기로운', '평온한', '즐거운', '명랑한', '활기찬', '신나는', '친절한', '재치 넘치는',
  '똑똑한', '당당한', '부지런한', '꼼꼼한', '멋진', '귀여운', '깜찍한', '사랑스러운', '빛나는', '소중한', '화사한', '정겨운',
  '순한', '알록달록한', '폭신한', '푸근한', '사뿐한', '살금살금 걷는', '두근거리는', '한가로운'];
  nouns constant text[] := ARRAY['고래', '고양이', '강아지', '토끼', '수달', '펭귄', '다람쥐', '여우', '판다', '햄스터', '부엉이', '거북이', '오리', '코알라', '고슴도치', '너구리',
  '사슴', '해파리', '돌고래', '참새', '나비', '무지개', '구름', '별', '달', '새싹', '도토리', '솜사탕', '우산', '연필', '해바라기', '눈사람',
  '기린', '얼룩말', '코끼리', '하마', '사자', '호랑이', '표범', '치타', '알파카', '양', '염소', '병아리', '앵무새', '까치', '비둘기', '개구리',
  '달팽이', '반딧불이', '잠자리', '매미', '꿀벌', '무당벌레', '문어', '복어', '해마', '불가사리', '조개', '산호', '솔방울', '나뭇잎', '민들레', '별똥별'];
  word_count integer := CASE WHEN posted_at >= timestamptz '2026-09-27 18:00:00+00' THEN 64 ELSE 32 END;
  card_key text := card_id::text;
  h bigint := 2166136261;
BEGIN
  FOR i IN 1..length(card_key) LOOP
    h := ((h # ascii(substr(card_key, i, 1))::bigint) * 16777619) % 4294967296;
  END LOOP;
  RETURN adjectives[1 + h % word_count] || ' ' || nouns[1 + h / word_count % word_count];
END;
$$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.initial_thread_alias(uuid,timestamptz) FROM PUBLIC, anon, authenticated;

-- Install and seed the name registry in one transaction with card writes held back.
LOCK TABLE ojjuda_note.cards IN SHARE ROW EXCLUSIVE MODE;
WITH RECURSIVE threads AS (
  SELECT id, id AS thread_id FROM ojjuda_note.cards WHERE kind = 'memo' AND parent_id IS NULL
  UNION ALL
  SELECT c.id, t.thread_id FROM ojjuda_note.cards c JOIN threads t ON c.parent_id = t.id
), first_cards AS (
  SELECT DISTINCT ON (t.thread_id, c.author_id) t.thread_id, c.author_id, c.id, c.created_at
  FROM threads t JOIN ojjuda_note.cards c ON c.id = t.id
  WHERE c.identity_mode = 'anonymous'
  ORDER BY t.thread_id, c.author_id, (c.id = t.thread_id) DESC, c.created_at, c.id
)
INSERT INTO ojjuda_note_internal.thread_aliases (thread_id, author_id, display_name)
SELECT thread_id, author_id, ojjuda_note_internal.initial_thread_alias(id, created_at) FROM first_cards;

CREATE FUNCTION ojjuda_note_internal.remember_thread_alias() RETURNS trigger
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
    INSERT INTO ojjuda_note_internal.thread_aliases (thread_id, author_id, display_name)
    VALUES (root_id, NEW.author_id, ojjuda_note_internal.initial_thread_alias(NEW.id, NEW.created_at))
    ON CONFLICT (thread_id, author_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.remember_thread_alias() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER remember_thread_alias AFTER INSERT OR UPDATE OF identity_mode ON ojjuda_note.cards
FOR EACH ROW WHEN (NEW.identity_mode = 'anonymous' AND NEW.kind IN ('memo','comment'))
EXECUTE FUNCTION ojjuda_note_internal.remember_thread_alias();

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
            WHEN c.identity_mode = 'nickname'::text THEN COALESCE(( SELECT NULLIF(btrim(to_jsonb(p.*) ->> 'nickname'::text), ''::text) AS "nullif"
               FROM public.profiles p
              WHERE p.id = c.author_id), '익명'::text)
            ELSE COALESCE(alias.display_name, '익명'::text)
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
     LEFT JOIN ojjuda_note_internal.thread_aliases alias
       ON c.identity_mode = 'anonymous' AND alias.thread_id = c.thread_id AND alias.author_id = c.author_id
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
