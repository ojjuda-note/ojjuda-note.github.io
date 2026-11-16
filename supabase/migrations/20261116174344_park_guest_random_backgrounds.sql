-- A draft gets one server-assigned draw, shared by preview and publication.
CREATE FUNCTION ojjuda_note.guest_card_background(p_request_id uuid)
RETURNS text LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pool_size CONSTANT integer := 288;
  digest bytea;
  draw integer;
BEGIN
  SELECT sha256(uuid_send(s.salt) || convert_to('park-background-v1','UTF8') || uuid_send(p_request_id))
    INTO STRICT digest FROM ojjuda_traffic.settings s WHERE s.singleton;
  LOOP
    -- Reject the partial bucket so all 180 photos and 108 washes have equal probability.
    draw := get_byte(digest,0) * 256 + get_byte(digest,1);
    EXIT WHEN draw < 65536 - mod(65536,pool_size);
    digest := sha256(digest);
  END LOOP;
  RETURN (10 + mod(draw,pool_size))::text;
END;
$$;
REVOKE ALL ON FUNCTION ojjuda_note.guest_card_background(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note.guest_card_background(uuid) TO anon, authenticated;

-- cards_background_key_check bounds numeric keys. Guest cards may use any of
-- those built-ins, while retaining their anonymous memo/reply constraints.
ALTER TABLE ojjuda_note.cards DROP CONSTRAINT note_guest_basic_card,
  ADD CONSTRAINT note_guest_basic_card CHECK (author_id IS NOT NULL OR (
    kind IN ('memo','comment') AND identity_mode='anonymous'
    AND background_key IS NOT NULL AND background_key <> 'plain'
  ));

-- Change only the insert in the installed RPC. Existing retry, validation,
-- network limits and reply handling (and the function ACL) stay in force.
DO $migration$
DECLARE
  original text := pg_get_functiondef('ojjuda_note.publish_guest_card(uuid,text,uuid)'::regprocedure);
  old_values CONSTANT text := 'body_text,card_tags,''10'',''anonymous''';
  new_values CONSTANT text := 'body_text,card_tags,ojjuda_note.guest_card_background(p_request_id),''anonymous''';
BEGIN
  IF length(original) - length(replace(original,old_values,'')) <> length(old_values) THEN
    RAISE EXCEPTION 'Expected exactly one fixed guest background in publish_guest_card';
  END IF;
  EXECUTE replace(original,old_values,new_values);
END;
$migration$;
NOTIFY pgrst, 'reload schema';
