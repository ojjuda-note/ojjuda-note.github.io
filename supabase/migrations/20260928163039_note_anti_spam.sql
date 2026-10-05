-- Per-member limits cover new Note cards and replies.
BEGIN;

ALTER TABLE ojjuda_note_internal.settings
  ADD COLUMN IF NOT EXISTS spam_max_consecutive integer NOT NULL DEFAULT 2
    CHECK (spam_max_consecutive BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS spam_window_seconds integer NOT NULL DEFAULT 60
    CHECK (spam_window_seconds BETWEEN 1 AND 3600),
  ADD COLUMN IF NOT EXISTS spam_max_posts integer NOT NULL DEFAULT 2
    CHECK (spam_max_posts BETWEEN 1 AND 100);

-- A bounded per-member record survives card deletion without retaining body text.
CREATE TABLE ojjuda_note_internal.spam_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_body_hash text NOT NULL,
  consecutive_count integer NOT NULL CHECK (consecutive_count BETWEEN 1 AND 1000),
  recent_posts timestamptz[] NOT NULL CHECK (cardinality(recent_posts) BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE ojjuda_note_internal.spam_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ojjuda_note_internal.spam_state FROM PUBLIC, anon, authenticated;

CREATE FUNCTION ojjuda_note_internal.spam_body_hash(p_body text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $function$
  SELECT pg_catalog.md5(pg_catalog.regexp_replace(pg_catalog.normalize(p_body, 'NFC'), '[[:space:]]', '', 'g'));
$function$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.spam_body_hash(text) FROM PUBLIC, anon, authenticated;

-- Seed from recent history so activation does not reset existing streaks.
WITH ranked AS (
  SELECT author_id, created_at,
    ojjuda_note_internal.spam_body_hash(body) AS body_hash,
    row_number() OVER (PARTITION BY author_id ORDER BY created_at DESC, id DESC) AS position
  FROM ojjuda_note.cards WHERE kind IN ('memo','comment')
), recent AS (
  SELECT *, first_value(body_hash) OVER (PARTITION BY author_id ORDER BY position) AS latest_hash
  FROM ranked WHERE position <= 100
)
INSERT INTO ojjuda_note_internal.spam_state(user_id,last_body_hash,consecutive_count,recent_posts)
SELECT author_id, max(latest_hash),
  coalesce(min(position) FILTER (WHERE body_hash <> latest_hash) - 1, count(*))::integer,
  array_agg(created_at ORDER BY position)
FROM recent GROUP BY author_id;

CREATE FUNCTION ojjuda_note_internal.enforce_anti_spam()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_limit integer; v_seconds integer; v_max_posts integer;
  v_state ojjuda_note_internal.spam_state%ROWTYPE;
  v_now timestamptz; v_hash text; v_count integer; v_retry integer;
BEGIN
  IF NEW.kind NOT IN ('memo','comment') THEN RETURN NEW; END IF;
  -- Serialize different tabs/requests from the same author until commit.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.author_id::text, 724891));
  v_now := pg_catalog.clock_timestamp();
  SELECT spam_max_consecutive,spam_window_seconds,spam_max_posts
    INTO STRICT v_limit,v_seconds,v_max_posts
  FROM ojjuda_note_internal.settings WHERE singleton;
  SELECT * INTO v_state FROM ojjuda_note_internal.spam_state WHERE user_id=NEW.author_id FOR UPDATE;
  v_hash := ojjuda_note_internal.spam_body_hash(NEW.body);
  IF v_state.last_body_hash = v_hash AND v_state.consecutive_count >= v_limit THEN
    RAISE EXCEPTION 'note_spam_repeat' USING ERRCODE='PNS01',
      DETAIL=jsonb_build_object('max_consecutive',v_limit)::text;
  END IF;
  -- Only the last 100 successful publications are needed: max_posts cannot exceed 100.
  SELECT count(*)::integer,
    greatest(1,ceil(extract(epoch FROM (min(t) + make_interval(secs=>v_seconds) - v_now)))::integer)
    INTO v_count,v_retry
  FROM unnest(v_state.recent_posts) AS recent(t)
  WHERE t > v_now - make_interval(secs=>v_seconds);
  IF v_count >= v_max_posts THEN
    -- After an administrator lowers the limit, wait for enough entries to expire.
    SELECT greatest(1,ceil(extract(epoch FROM (t + make_interval(secs=>v_seconds) - v_now)))::integer)
      INTO v_retry
    FROM unnest(v_state.recent_posts) AS recent(t)
    WHERE t > v_now - make_interval(secs=>v_seconds)
    ORDER BY t DESC OFFSET (v_max_posts - 1) LIMIT 1;
    RAISE EXCEPTION 'note_spam_rate' USING ERRCODE='PNS02',
      DETAIL=jsonb_build_object('window_seconds',v_seconds,'max_posts',v_max_posts,'retry_after_seconds',v_retry)::text;
  END IF;
  INSERT INTO ojjuda_note_internal.spam_state(user_id,last_body_hash,consecutive_count,recent_posts,updated_at)
  VALUES(NEW.author_id,v_hash,
    CASE WHEN v_state.last_body_hash=v_hash THEN least(v_state.consecutive_count+1,1000) ELSE 1 END,
    (array_prepend(v_now,coalesce(v_state.recent_posts,ARRAY[]::timestamptz[])))[1:100],v_now)
  ON CONFLICT(user_id) DO UPDATE SET
    last_body_hash=excluded.last_body_hash,consecutive_count=excluded.consecutive_count,
    recent_posts=excluded.recent_posts,updated_at=excluded.updated_at;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.enforce_anti_spam() FROM PUBLIC, anon, authenticated;

-- AFTER INSERT counts only inserted rows, preserving ON CONFLICT/idempotent retries.
-- Any rejection rolls back the card, its spending and its side effects together.
CREATE TRIGGER note_anti_spam AFTER INSERT ON ojjuda_note.cards
FOR EACH ROW WHEN (NEW.kind IN ('memo','comment'))
EXECUTE FUNCTION ojjuda_note_internal.enforce_anti_spam();

CREATE FUNCTION ojjuda_note_internal.admin_spam_settings()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NOT ojjuda_note_internal.is_note_moderator() THEN
    RAISE EXCEPTION 'Note moderator required' USING ERRCODE='42501';
  END IF;
  RETURN (SELECT jsonb_build_object('max_consecutive',spam_max_consecutive,
    'window_seconds',spam_window_seconds,'max_posts',spam_max_posts)
    FROM ojjuda_note_internal.settings WHERE singleton);
END;
$function$;

CREATE FUNCTION ojjuda_note_internal.admin_update_spam_settings(
  p_max_consecutive integer,p_window_seconds integer,p_max_posts integer,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  IF NOT ojjuda_note_internal.is_note_moderator() THEN
    RAISE EXCEPTION 'Note moderator required' USING ERRCODE='42501';
  END IF;
  IF p_max_consecutive IS NULL OR p_max_consecutive NOT BETWEEN 1 AND 10
    OR p_window_seconds IS NULL OR p_window_seconds NOT BETWEEN 1 AND 3600
    OR p_max_posts IS NULL OR p_max_posts NOT BETWEEN 1 AND 100
    OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Valid spam limits and reason required' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM ojjuda_note_internal.settings WHERE singleton FOR UPDATE;
  v_before := ojjuda_note_internal.admin_spam_settings();
  UPDATE ojjuda_note_internal.settings SET spam_max_consecutive=p_max_consecutive,
    spam_window_seconds=p_window_seconds,spam_max_posts=p_max_posts,
    updated_at=statement_timestamp(),updated_by=auth.uid() WHERE singleton;
  v_after := ojjuda_note_internal.admin_spam_settings();
  INSERT INTO ojjuda_note_internal.moderation_actions(moderator_id,action,reason,detail)
    VALUES(auth.uid(),'update_settings',btrim(p_reason),
      jsonb_build_object('spam_before',v_before,'spam_after',v_after));
END;
$function$;

CREATE FUNCTION ojjuda_note.admin_spam_settings()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT ojjuda_note_internal.admin_spam_settings();
$function$;
CREATE FUNCTION ojjuda_note.admin_update_spam_settings(
  p_max_consecutive integer,p_window_seconds integer,p_max_posts integer,p_reason text)
RETURNS void LANGUAGE sql SET search_path = '' AS $function$
  SELECT ojjuda_note_internal.admin_update_spam_settings(p_max_consecutive,p_window_seconds,p_max_posts,p_reason);
$function$;

REVOKE ALL ON FUNCTION ojjuda_note_internal.admin_spam_settings() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ojjuda_note_internal.admin_update_spam_settings(integer,integer,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ojjuda_note.admin_spam_settings() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ojjuda_note.admin_update_spam_settings(integer,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.admin_spam_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note_internal.admin_update_spam_settings(integer,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note.admin_spam_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_note.admin_update_spam_settings(integer,integer,integer,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
