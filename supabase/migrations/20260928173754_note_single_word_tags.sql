-- Tags are single words. The composer splits spaces and commas before saving.
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
         OR t.tag ~ U&'[[:space:]\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    )
    AND cardinality(input_tags) = (
      SELECT count(DISTINCT t.tag) FROM unnest(input_tags) AS t(tag)
    );
$function$;

DO $check$
BEGIN
  IF ojjuda_note.valid_tags(ARRAY['일상','산책','19금']) IS DISTINCT FROM true
    OR ojjuda_note.valid_tags(ARRAY['일상 산책']) IS DISTINCT FROM false
    OR ojjuda_note.valid_tags(ARRAY[E'일상\t산책']) IS DISTINCT FROM false
    OR ojjuda_note.valid_tags(ARRAY[U&'일상\00A0산책']) IS DISTINCT FROM false
    OR ojjuda_note.valid_tags(ARRAY[U&'일상\3000산책']) IS DISTINCT FROM false
    OR ojjuda_note.valid_tags(ARRAY['일상','일상']) IS DISTINCT FROM false
    OR ojjuda_note.valid_tags(ARRAY['a','b','c','d','e','f']) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Single-word tag validation regression';
  END IF;
END;
$check$;

COMMIT;
