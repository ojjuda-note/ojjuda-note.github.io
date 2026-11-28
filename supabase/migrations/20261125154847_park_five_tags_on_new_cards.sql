-- Keep the morphology service's complete candidate list available for analysis.
-- Pick up to five tags for publication, including explicit hashtags found late in the body.
DO $migration$
DECLARE
  ddl text := pg_get_functiondef('ojjuda_note_internal.park_card_context_tags(text)'::regprocedure);
  previous text := '  RETURN result;';
BEGIN
  IF cardinality(string_to_array(ddl,previous)) <> 2 THEN RAISE EXCEPTION 'Unexpected Park tag selector'; END IF;
  EXECUTE replace(ddl,previous,$new$  RETURN ARRAY(
    WITH explicit AS (
      SELECT lower(capture[1]) AS word, min(pos) AS pos
      FROM regexp_matches(p_body,'#([[:alnum:]_]+)','g') WITH ORDINALITY AS m(capture,pos)
      GROUP BY lower(capture[1])
    )
    SELECT candidate FROM unnest(result) WITH ORDINALITY AS w(candidate,pos)
    LEFT JOIN explicit e ON lower(candidate)=e.word
    ORDER BY (candidate='19금') DESC, e.pos NULLS LAST, w.pos
    LIMIT 5
  );$new$);
  ddl := pg_get_functiondef('ojjuda_note.publish_guest_card(uuid,text,uuid)'::regprocedure);
  previous := 'ARRAY[''19금''] || card_tags;';
  IF cardinality(string_to_array(ddl,previous)) <> 2 THEN RAISE EXCEPTION 'Unexpected guest classification'; END IF;
  EXECUTE replace(ddl,previous,'ARRAY[''19금''] || card_tags[1:4];');
END;
$migration$;

-- Leave historical cards readable and editable with their original tag lists.
-- Cached clients, events and direct writes all pass through the same table.
CREATE FUNCTION ojjuda_note_internal.limit_new_card_tags()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $limit$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.tags IS DISTINCT FROM OLD.tags THEN
      RAISE EXCEPTION '태그는 최대 5개까지 달 수 있어요.' USING ERRCODE='23514';
    END IF;
  ELSE
    NEW.tags := ARRAY(
      SELECT tag FROM unnest(NEW.tags) WITH ORDINALITY AS word(tag,pos)
      ORDER BY (tag='19금') DESC NULLS LAST, pos LIMIT 5
    );
  END IF;
  RETURN NEW;
END;
$limit$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.limit_new_card_tags() FROM PUBLIC;
CREATE TRIGGER note_limit_new_card_tags
BEFORE INSERT OR UPDATE OF tags ON ojjuda_note.cards
FOR EACH ROW WHEN (cardinality(NEW.tags)>5)
EXECUTE FUNCTION ojjuda_note_internal.limit_new_card_tags();
