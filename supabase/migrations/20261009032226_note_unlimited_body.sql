-- No application character ceiling; retain body, membership, revision and tag validation.
CREATE OR REPLACE FUNCTION ojjuda_note_internal.valid_note_body(p_body text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT char_length(p_body) >= 1
    AND position(chr(13) IN p_body)=0
    AND regexp_replace(p_body,
      '[[:space:][:cntrl:]' || chr(127) || '-' || chr(159)
      || chr(160) || chr(173) || chr(5760) || chr(6158)
      || chr(8192) || '-' || chr(8207)
      || chr(8232) || '-' || chr(8238)
      || chr(8239) || chr(8287)
      || chr(8288) || '-' || chr(8303)
      || chr(12288) || chr(65279) || ']',
      '', 'g') <> '';
$function$
;
CREATE OR REPLACE FUNCTION ojjuda_note_internal.save_draft(p_expected_revision bigint, p_content jsonb)
 RETURNS TABLE(revision bigint, content jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE draft_parent uuid;
BEGIN
  IF NOT ojjuda_note_internal.is_world_member() THEN
    RAISE EXCEPTION 'World membership required' USING ERRCODE = '42501';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0
      OR p_expected_revision >= 9007199254740991 THEN
    RAISE EXCEPTION 'Invalid draft revision' USING ERRCODE = '22023';
  END IF;
  IF p_content IS NULL OR jsonb_typeof(p_content) IS DISTINCT FROM 'object'
    OR p_content - ARRAY['body','tags','background_key','kind','parent_id',
      'style','photo_key']::text[] <> '{}'::jsonb
    OR jsonb_typeof(p_content->'body') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_content->'tags') IS DISTINCT FROM 'string'
    OR char_length(p_content->>'tags') > 240
    OR jsonb_typeof(p_content->'background_key') IS DISTINCT FROM 'string'
    OR p_content->>'background_key' !~ '^([1-9][0-9]|1[0-8][0-9])$'
    OR jsonb_typeof(p_content->'kind') IS DISTINCT FROM 'string'
    OR p_content->>'kind' NOT IN ('memo', 'comment')
    OR NOT (p_content ? 'parent_id')
    OR jsonb_typeof(p_content->'parent_id') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'Invalid draft content' USING ERRCODE = '22023';
  END IF;
  IF (p_content ? 'style' AND p_content->'style' <> 'null'::jsonb
        AND ojjuda_note_internal.valid_card_style(p_content->'style') IS DISTINCT FROM true)
    OR (p_content ? 'photo_key'
        AND jsonb_typeof(p_content->'photo_key') NOT IN ('string','null'))
    OR (p_content->>'photo_key' IS NOT NULL
        AND p_content->>'photo_key' !~ '^([1-9][0-9]|1[0-8][0-9])$') THEN
    RAISE EXCEPTION 'Invalid draft visual' USING ERRCODE = '22023';
  END IF;
  BEGIN
    draft_parent := (p_content->>'parent_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid draft parent' USING ERRCODE = '22023';
  END;
  IF (p_content->>'kind' = 'memo' AND draft_parent IS NOT NULL)
    OR (p_content->>'kind' = 'comment' AND draft_parent IS NULL) THEN
    RAISE EXCEPTION 'Invalid draft parent' USING ERRCODE = '22023';
  END IF;
  INSERT INTO ojjuda_note_internal.drafts (user_id) VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE ojjuda_note_internal.drafts AS d
    SET revision = d.revision + 1, active = true,
        body = p_content->>'body', tags = p_content->>'tags',
        background_key = p_content->>'background_key', kind = p_content->>'kind',
        parent_id = draft_parent, style = NULLIF(p_content->'style','null'::jsonb),
        photo_key = p_content->>'photo_key', updated_at = statement_timestamp()
    WHERE d.user_id = auth.uid() AND d.revision = p_expected_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft changed in another tab or device; local text was not overwritten'
      USING ERRCODE = 'PT409';
  END IF;
  RETURN QUERY SELECT * FROM ojjuda_note_internal.read_draft();
END;
$function$
;
ALTER TABLE ojjuda_note_internal.drafts DROP CONSTRAINT note_draft_content;
ALTER TABLE ojjuda_note_internal.drafts ADD CONSTRAINT note_draft_content CHECK ((((NOT active) AND (body IS NULL) AND (tags IS NULL) AND (background_key IS NULL) AND (kind IS NULL) AND (parent_id IS NULL) AND (style IS NULL) AND (photo_key IS NULL)) OR (active AND (body IS NOT NULL) AND (tags IS NOT NULL) AND (char_length(tags) <= 240) AND (background_key IS NOT NULL) AND (background_key ~ '^([1-9][0-9]|1[0-8][0-9])$'::text) AND ((style IS NULL) OR ojjuda_note_internal.valid_card_style(style)) AND ((photo_key IS NULL) OR (photo_key ~ '^([1-9][0-9]|1[0-8][0-9])$'::text)) AND (kind IS NOT NULL) AND (((kind = 'memo'::text) AND (parent_id IS NULL)) OR ((kind = 'comment'::text) AND (parent_id IS NOT NULL))))));
-- Index a fixed-size digest so long fiction does not exceed the btree tuple limit.
CREATE UNIQUE INDEX auto_card_copy_body_sha256_key ON ojjuda_note_internal.auto_card_copy ((extensions.digest(body,'sha256')));
ALTER TABLE ojjuda_note_internal.auto_card_copy DROP CONSTRAINT auto_card_copy_body_key;
CREATE OR REPLACE FUNCTION ojjuda_note_internal.auto_card_tags(p_slot integer, p_day date, p_body text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE
 WHEN p_body LIKE '[창작 웹소설]%' THEN ARRAY['웹소설','연재']::text[]
 WHEN p_body LIKE '[유머]%' THEN ARRAY['유머']::text[]
 WHEN p_body LIKE '[이슈]%' THEN ARRAY['소식','이슈']::text[]
 WHEN p_body LIKE '[일상]%' THEN ARRAY['일상','공감']::text[]
 WHEN p_slot>24 OR (p_day=date '2026-09-29' AND p_slot>=16) THEN
   CASE WHEN p_body ~ '(기상청|나사|NASA|발표|에 따르면)' THEN ARRAY['소식','정보']::text[]
        ELSE ARRAY['유머']::text[] END
 ELSE CASE p_slot%4
   WHEN 0 THEN ARRAY['위로','공감']::text[]
   WHEN 1 THEN ARRAY['응원']::text[]
   WHEN 2 THEN ARRAY['공감']::text[]
   ELSE ARRAY['명언','위로']::text[] END
 END
$function$
;

