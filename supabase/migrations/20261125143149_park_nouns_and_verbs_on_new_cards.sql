-- Analyze only new card operations. Existing rows and queued copy are never rewritten.
CREATE SCHEMA IF NOT EXISTS park_tag_http;
REVOKE ALL ON SCHEMA park_tag_http FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA park_tag_http;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.park_card_context_tags(p_body text)
RETURNS text[] LANGUAGE plpgsql VOLATILE SET search_path = ''
AS $tagger$
DECLARE
  cfg jsonb;
  response park_tag_http.http_response;
  payload jsonb;
  result text[];
BEGIN
  IF p_body IS NULL OR btrim(p_body)='' THEN RETURN ARRAY[]::text[]; END IF;
  IF char_length(replace(p_body,'❤️❤️','♥'))>200 THEN RAISE EXCEPTION 'Invalid Park card length'; END IF;
  SELECT decrypted_secret::jsonb INTO STRICT cfg FROM vault.decrypted_secrets WHERE name='park_word_tags_endpoint';
  SELECT * INTO response FROM park_tag_http.http((
    'POST',cfg->>'url',ARRAY[park_tag_http.http_header('Authorization','Bearer '||(cfg->>'anon'))],
    'application/json',jsonb_build_object('body',p_body)::text
  )::park_tag_http.http_request);
  IF response.status <> 200 THEN RAISE EXCEPTION 'Park word tags unavailable (%)',response.status; END IF;
  payload := response.content::jsonb->'tags';
  IF jsonb_typeof(payload) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid Park word tags response'; END IF;
  result := ARRAY(SELECT jsonb_array_elements_text(payload));
  IF NOT ojjuda_note.valid_tags(result) THEN RAISE EXCEPTION 'Invalid Park word tags'; END IF;
  RETURN result;
END $tagger$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.park_card_context_tags(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ojjuda_note.valid_tags(input_tags text[])
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path='pg_catalog' AS $valid$
  SELECT cardinality(input_tags)<=256 AND char_length(replace(array_to_string(input_tags,', '),'❤️❤️','♥'))<=4096
    AND NOT EXISTS (SELECT FROM unnest(input_tags) tag WHERE tag IS NULL OR tag<>btrim(tag)
      OR char_length(replace(tag,'❤️❤️','♥')) NOT BETWEEN 1 AND 201
      OR tag ~ U&'[[:space:]\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]')
    AND cardinality(input_tags)=(SELECT count(DISTINCT tag) FROM unnest(input_tags) tag);
$valid$;

ALTER FUNCTION ojjuda_note.suggest_card_tags(text) VOLATILE;
DO $update$
DECLARE
  runner regprocedure := 'ojjuda_note_internal.run_park_post_v2()'::regprocedure;
  guest regprocedure := 'ojjuda_note.publish_guest_card(uuid,text,uuid)'::regprocedure;
  save regprocedure := 'ojjuda_note_internal.save_draft(bigint,jsonb)'::regprocedure;
  ddl text;
BEGIN
  ddl := pg_get_functiondef(runner);
  IF strpos(ddl,'cardinality(v_tags) BETWEEN 2 AND 3')=0 THEN RAISE EXCEPTION 'Unexpected scheduled Park tag rule'; END IF;
  EXECUTE replace(replace(ddl,'cardinality(v_tags) BETWEEN 2 AND 3','cardinality(v_tags) > 0'),
    'coalesce(cardinality(v_tags),0) NOT BETWEEN 2 AND 3','coalesce(cardinality(v_tags),0)=0');
  ddl := pg_get_functiondef(guest);
  IF strpos(ddl,'ojjuda_note_internal.auto_card_tags(0,current_date,body_text)')=0 THEN RAISE EXCEPTION 'Unexpected guest Park tag rule'; END IF;
  EXECUTE replace(replace(ddl,'ojjuda_note_internal.auto_card_tags(0,current_date,body_text)','ojjuda_note_internal.park_card_context_tags(body_text)'),
    ' || card_tags[1:4]', ' || card_tags');
  ddl := pg_get_functiondef(save);
  IF strpos(ddl,'char_length(p_content->>''tags'') > 240')=0 THEN RAISE EXCEPTION 'Unexpected Park draft tag length'; END IF;
  EXECUTE replace(ddl,'char_length(p_content->>''tags'') > 240','char_length(replace(p_content->>''tags'',''❤️❤️'',''♥'')) > 4096');
  SELECT pg_get_constraintdef(oid) INTO STRICT ddl FROM pg_constraint
    WHERE conrelid='ojjuda_note_internal.drafts'::regclass AND conname='note_draft_content';
  IF strpos(ddl,'char_length(tags) <= 240')=0 THEN RAISE EXCEPTION 'Unexpected Park draft constraint'; END IF;
  ALTER TABLE ojjuda_note_internal.drafts DROP CONSTRAINT note_draft_content;
  EXECUTE 'ALTER TABLE ojjuda_note_internal.drafts ADD CONSTRAINT note_draft_content '||
    replace(ddl,'char_length(tags) <= 240','char_length(replace(tags,''❤️❤️'',''♥'')) <= 4096');
END $update$;
