-- Treat the requested tag as an ordinary tag; preserve general tag validation.
BEGIN;

CREATE OR REPLACE FUNCTION ojjuda_note.valid_tags(input_tags text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT cardinality(input_tags) <= 5
    AND NOT EXISTS (
      SELECT 1 FROM unnest(input_tags) AS t(tag)
      WHERE t.tag IS NULL OR t.tag <> btrim(t.tag)
         OR char_length(t.tag) NOT BETWEEN 1 AND 20
    )
    AND cardinality(input_tags) = (
      SELECT count(DISTINCT t.tag) FROM unnest(input_tags) AS t(tag)
    );
$function$;

DO $check$
BEGIN
  IF ojjuda_note.valid_tags(ARRAY['19금']) IS DISTINCT FROM true
    OR ojjuda_note.valid_tags(ARRAY['19금','일상']) IS DISTINCT FROM true
    OR ojjuda_note.valid_tags(ARRAY['19금','19금']) IS DISTINCT FROM false
    OR ojjuda_note.valid_tags(ARRAY['a','b','c','d','e','f']) IS DISTINCT FROM false
    OR ojjuda_note.valid_tags(ARRAY[repeat('a',21)]) IS DISTINCT FROM false
    OR ojjuda_note.valid_tags(ARRAY['']) IS DISTINCT FROM false
    OR ojjuda_note.valid_tags(ARRAY[' 공백 ']) IS DISTINCT FROM false
    OR ojjuda_note.valid_tags(ARRAY[NULL::text]) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Tag validation regression';
  END IF;
END;
$check$;

COMMIT;
