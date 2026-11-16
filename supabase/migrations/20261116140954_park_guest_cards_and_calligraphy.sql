-- Accountless cards do not belong to a member. Retention records for them
-- still carry the due date; only a member can receive or read an alert.
ALTER TABLE ojjuda_note.cards ALTER COLUMN author_id DROP NOT NULL,
  ADD CONSTRAINT note_guest_basic_card CHECK (author_id IS NOT NULL OR
    (kind IN ('memo','comment') AND identity_mode='anonymous' AND background_key='10'));
ALTER TABLE ojjuda_note_internal.retention_alerts ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE ojjuda_note_internal.notifications ALTER COLUMN actor_id DROP NOT NULL,
  ADD CONSTRAINT note_guest_notification_kind CHECK (actor_id IS NOT NULL OR kind='reply');

CREATE TABLE ojjuda_note_internal.guest_publications (
  request_id uuid PRIMARY KEY,
  card_id uuid UNIQUE NOT NULL REFERENCES ojjuda_note.cards(id) ON DELETE CASCADE,
  network_hash bytea NOT NULL,
  body_hash text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX guest_publications_rate ON ojjuda_note_internal.guest_publications(network_hash,posted_at DESC);
ALTER TABLE ojjuda_note_internal.guest_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ojjuda_note_internal.guest_publications FROM PUBLIC, anon, authenticated;

-- Member account controls continue to use the existing member-only state.
CREATE OR REPLACE TRIGGER note_anti_spam AFTER INSERT ON ojjuda_note.cards
  FOR EACH ROW WHEN (NEW.author_id IS NOT NULL AND NEW.kind IN ('memo','comment'))
  EXECUTE FUNCTION ojjuda_note_internal.enforce_anti_spam();
CREATE OR REPLACE TRIGGER remember_thread_alias AFTER INSERT OR UPDATE OF identity_mode ON ojjuda_note.cards
  FOR EACH ROW WHEN (NEW.author_id IS NOT NULL AND NEW.identity_mode='anonymous' AND NEW.kind IN ('memo','comment'))
  EXECUTE FUNCTION ojjuda_note_internal.remember_thread_alias();

CREATE OR REPLACE FUNCTION ojjuda_note_internal.enforce_note_blocked_words()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL AND (TG_OP <> 'INSERT' OR NEW.author_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF public.has_banned(coalesce(NEW.body, '')) OR EXISTS (
    SELECT 1 FROM unnest(coalesce(NEW.tags, ARRAY[]::text[])) AS tag(value)
    WHERE public.has_banned(tag.value)
  ) THEN
    RAISE EXCEPTION '노트 운영 기준에 맞지 않는 표현이 포함되어 있어요.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.notify_card_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE recipient uuid;
BEGIN
  IF NEW.kind<>'comment' THEN RETURN NEW; END IF;
  IF auth.uid() IS DISTINCT FROM NEW.author_id THEN
    RAISE EXCEPTION 'Reply actor mismatch' USING ERRCODE='42501';
  END IF;
  SELECT c.author_id INTO recipient FROM ojjuda_note.cards c WHERE c.id=NEW.parent_id;
  IF recipient IS NOT NULL AND recipient IS DISTINCT FROM NEW.author_id THEN
    INSERT INTO ojjuda_note_internal.notifications(recipient_id,actor_id,event_key,kind,card_id)
    VALUES(recipient,NEW.author_id,'reply:'||NEW.id::text,'reply',NEW.id)
    ON CONFLICT(recipient_id,event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.visible_notifications(p_unread_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, kind text, card_id uuid, inquiry_id uuid, created_at timestamp with time zone, read_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE viewer uuid := auth.uid();
BEGIN
  IF viewer IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT n.id,n.kind,n.card_id,n.inquiry_id,n.created_at,n.read_at
  FROM ojjuda_note_internal.notifications n
  WHERE n.recipient_id=viewer AND (NOT p_unread_only OR n.read_at IS NULL)
    AND (n.kind='inquiry_reply' OR NOT EXISTS (SELECT 1 FROM ojjuda_note_internal.blocks b
      WHERE (b.blocker_id=viewer AND b.blocked_id=n.actor_id)
        OR (b.blocker_id=n.actor_id AND b.blocked_id=viewer)))
    AND CASE n.kind
      WHEN 'reply' THEN EXISTS (
        SELECT 1 FROM ojjuda_note.cards c JOIN ojjuda_note.cards p ON p.id=c.parent_id
        WHERE c.id=n.card_id AND c.kind='comment' AND c.author_id IS NOT DISTINCT FROM n.actor_id
          AND p.author_id=viewer AND ojjuda_note_internal.notification_card_visible(c.id))
      WHEN 'like' THEN EXISTS (
        SELECT 1 FROM ojjuda_note.cards c JOIN ojjuda_note.reactions r ON r.card_id=c.id
        WHERE c.id=n.card_id AND c.author_id=viewer AND r.user_id=n.actor_id
          AND r.kind='like' AND ojjuda_note_internal.notification_card_visible(c.id))
      WHEN 'inquiry_reply' THEN EXISTS (
        SELECT 1 FROM ojjuda_note_internal.inquiries i
        WHERE i.id=n.inquiry_id AND i.user_id=viewer AND i.replied_by=n.actor_id
          AND i.status='resolved' AND char_length(btrim(i.reply))>0)
      ELSE false END;
END $function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.archive_card_tree(p_card_id uuid, p_reason text, p_actor uuid, p_detail text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_author uuid; v_root uuid; v_permanent boolean; v_due timestamptz;
        v_notice timestamptz;
        v_count integer;
        v_now timestamptz := statement_timestamp();
BEGIN
  IF p_reason NOT IN ('retention','admin','owner') THEN
    RAISE EXCEPTION 'Invalid archive reason' USING ERRCODE = '22023';
  END IF;
  -- Use the same root-to-parent lock order as publish_card. A reply inserted
  -- during archival then either commits before the subtree scan or fails the
  -- post-lock visibility check in the publisher.
  WITH RECURSIVE ancestors(id,parent_id,path) AS (
    SELECT c.id,c.parent_id,ARRAY[c.id] FROM ojjuda_note.cards c WHERE c.id=p_card_id
    UNION ALL
    SELECT p.id,p.parent_id,a.path||p.id FROM ojjuda_note.cards p
      JOIN ancestors a ON p.id=a.parent_id WHERE NOT p.id=ANY(a.path)
  ) SELECT id INTO v_root FROM ancestors WHERE parent_id IS NULL LIMIT 1;
  IF v_root IS NULL THEN RETURN 0; END IF;
  PERFORM 1 FROM ojjuda_note.cards WHERE id=v_root FOR UPDATE;
  SELECT author_id,permanent,archive_due_at,retention_notice_at
    INTO v_author,v_permanent,v_due,v_notice
    FROM ojjuda_note.cards
    WHERE id=p_card_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_now:=clock_timestamp();
  IF p_reason='retention' AND (
      v_permanent OR v_due>v_now OR v_notice IS NULL
      OR ((v_notice AT TIME ZONE 'Asia/Seoul') + interval '1 month')
        AT TIME ZONE 'Asia/Seoul' > v_now
    ) THEN RETURN 0; END IF;
  -- The root's notice alone is insufficient: a reply written before the
  -- warning month must also have a full month's advance notice of the
  -- ancestor's cascade. Replies written during that month receive an alert
  -- immediately on publication and are the explicit short-notice exception.
  IF p_reason='retention' AND EXISTS (
    WITH RECURSIVE subtree(id) AS (
      SELECT id FROM ojjuda_note.cards WHERE id=p_card_id
      UNION ALL
      SELECT ch.id FROM ojjuda_note.cards ch JOIN subtree s ON ch.parent_id=s.id
    )
    SELECT 1 FROM ojjuda_note.cards c JOIN subtree s ON s.id=c.id
    LEFT JOIN LATERAL ojjuda_note_internal.effective_retention(c.id) e ON true
    LEFT JOIN ojjuda_note_internal.retention_alerts a
      ON a.card_id=c.id AND a.recipient_id IS NOT DISTINCT FROM c.author_id
      AND a.source_card_id=e.source_card_id AND a.reason=e.reason
      AND a.archive_due_at=e.effective_archive_due_at
    WHERE c.archived_at IS NULL AND (
      e.effective_archive_due_at IS NULL
      OR e.effective_archive_due_at>v_now OR a.id IS NULL
      OR (c.created_at < (date_trunc('month',
            e.effective_archive_due_at AT TIME ZONE 'Asia/Seoul')
            - interval '1 month') AT TIME ZONE 'Asia/Seoul'
        AND ((a.created_at AT TIME ZONE 'Asia/Seoul') + interval '1 month')
          AT TIME ZONE 'Asia/Seoul' > v_now)
    )
  ) THEN RETURN 0; END IF;
  WITH RECURSIVE subtree(id) AS (
    SELECT id FROM ojjuda_note.cards WHERE id=p_card_id
    UNION ALL
    SELECT ch.id FROM ojjuda_note.cards ch JOIN subtree s ON ch.parent_id=s.id
  )
  UPDATE ojjuda_note.cards c
  SET archived_at=v_now,purge_after=v_now+interval '1 month',
      archive_group_id=p_card_id,archive_reason=p_reason
  WHERE c.id IN (SELECT id FROM subtree) AND c.archived_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO ojjuda_note_internal.moderation_actions
    (card_id,moderator_id,subject_user_id,action,reason,detail)
  VALUES (p_card_id,p_actor,v_author,'archive_card',coalesce(p_detail,p_reason),
    jsonb_build_object('count',v_count));
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.valid_card_style(p_style jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT coalesce(p_style->>'shopSticker','none') in ('none','heart','clover','moon','coffee','flower','cheer')
    AND coalesce(p_style->>'shopFont','none') in ('none','book','letter','poster')
    AND coalesce(p_style->>'shopEffect','none') in ('none','foil')
    AND p_style IS NOT NULL AND jsonb_typeof(p_style) = 'object'
    AND octet_length(p_style::text) <= 512
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(CASE WHEN jsonb_typeof(p_style) = 'object'
        THEN p_style ELSE '{}'::jsonb END) AS k(key)
      WHERE k.key NOT IN
        ('font', 'size', 'theme', 'effect', 'textColor', 'backgroundColor', 'boxColor', 'boxTransparency','shopSticker','shopFont','shopEffect')
    )
    AND coalesce(p_style->>'font', 'default') IN
      ('default', 'round', 'serif', 'handwriting', 'calligraphy', 'mono')
    AND coalesce(p_style->>'size', 'normal') IN ('normal', 'large', 'small')
    AND coalesce(p_style->>'theme', 'plain') IN ('plain', 'rose', 'night')
    AND coalesce(p_style->>'effect', 'none') IN
      ('none', 'sparkle', 'frame',
       'rain', 'shimmer', 'rainbow', 'snow', 'starlight',
       'fireflies', 'petals', 'bubbles', 'aurora', 'confetti',
       'sunbeams', 'mist', 'ocean', 'heartbeat', 'orbit',
       'glitter', 'meteor', 'leaves', 'neon', 'dawn')
    AND coalesce(p_style->>'textColor', 'default') IN
      ('default', 'red', 'yellow', 'green', 'blue', 'purple', 'black', 'white')
    AND coalesce(p_style->>'backgroundColor', 'default') IN
      ('default', 'red', 'yellow', 'green', 'blue', 'purple', 'black', 'white')
    AND coalesce(p_style->>'boxColor', 'default') IN
      ('default', 'red', 'yellow', 'green', 'blue', 'purple', 'black', 'white')
    AND (p_style->>'boxTransparency' IS NULL OR (p_style->>'boxTransparency') ~ '^(100|[1-9]?[0-9])$');
$function$;

-- Guests submit only text and an optional public parent. Formatting, identity,
-- background and tags are determined here; the role has no table write grant.
CREATE FUNCTION ojjuda_note.publish_guest_card(p_request_id uuid, p_body text, p_parent_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  network text;
  network_key bytea;
  body_text text := btrim(p_body);
  content_hash text;
  saved record;
  limits record;
  n integer;
  retry integer;
  card uuid;
  card_tags text[];
  ancestor uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'guest_only' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR NOT coalesce(ojjuda_note_internal.valid_note_body(body_text),false) THEN
    RAISE EXCEPTION 'invalid_guest_card' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,7349));
  SELECT c.id,c.body,c.parent_id,c.tags INTO saved
    FROM ojjuda_note_internal.guest_publications g JOIN ojjuda_note.cards c ON c.id=g.card_id
    WHERE g.request_id=p_request_id;
  IF FOUND THEN
    IF saved.body<>body_text OR saved.parent_id IS DISTINCT FROM p_parent_id THEN
      RAISE EXCEPTION 'request_content_changed' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('card_id',saved.id,'tags',saved.tags);
  END IF;

  -- Keep only a salted daily network hash. Unavailable addresses share a bucket.
  BEGIN
    network := host(coalesce(nullif(headers->>'cf-connecting-ip',''),
      nullif(split_part(headers->>'x-forwarded-for',',',-1),''))::inet);
  EXCEPTION WHEN invalid_text_representation THEN network := NULL; END;
  SELECT sha256(convert_to(concat_ws(':',salt,'park_guest',current_date,coalesce(network,'unknown')),'UTF8'))
    INTO STRICT network_key FROM ojjuda_traffic.settings WHERE singleton;
  PERFORM pg_advisory_xact_lock(hashtextextended(encode(network_key,'hex'),7350));
  SELECT spam_max_consecutive,spam_window_seconds,spam_max_posts INTO STRICT limits
    FROM ojjuda_note_internal.settings WHERE singleton;
  content_hash := ojjuda_note_internal.spam_body_hash(body_text);
  SELECT count(*) INTO n FROM (
    SELECT body_hash FROM ojjuda_note_internal.guest_publications WHERE network_hash=network_key
    ORDER BY posted_at DESC LIMIT limits.spam_max_consecutive
  ) recent WHERE body_hash=content_hash;
  IF n>=limits.spam_max_consecutive THEN
    RAISE EXCEPTION 'note_spam_repeat' USING ERRCODE='PNS01',
      DETAIL=jsonb_build_object('max_consecutive',limits.spam_max_consecutive)::text;
  END IF;
  SELECT greatest(1,ceil(extract(epoch FROM posted_at + make_interval(secs=>limits.spam_window_seconds) - clock_timestamp()))::int)
    INTO retry FROM ojjuda_note_internal.guest_publications
    WHERE network_hash=network_key AND posted_at>clock_timestamp()-make_interval(secs=>limits.spam_window_seconds)
    ORDER BY posted_at DESC OFFSET (limits.spam_max_posts-1) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'note_spam_rate' USING ERRCODE='PNS02',
      DETAIL=jsonb_build_object('max_posts',limits.spam_max_posts,'window_seconds',limits.spam_window_seconds,'retry_after_seconds',retry)::text;
  END IF;

  IF p_parent_id IS NOT NULL THEN
    -- Acquire the same root-to-leaf locks as member replies and archival.
    FOR ancestor IN
      WITH RECURSIVE chain(id,parent_id,depth) AS (
        SELECT c.id,c.parent_id,0 FROM ojjuda_note.cards c WHERE c.id=p_parent_id
        UNION ALL SELECT c.id,c.parent_id,a.depth+1 FROM ojjuda_note.cards c JOIN chain a ON a.parent_id=c.id
      ) SELECT id FROM chain ORDER BY depth DESC
    LOOP
      PERFORM 1 FROM ojjuda_note.cards WHERE id=ancestor AND archived_at IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'reply_unavailable' USING ERRCODE='42501'; END IF;
    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM ojjuda_note.public_cards WHERE id=p_parent_id AND kind IN ('memo','comment')) THEN
      RAISE EXCEPTION 'reply_unavailable' USING ERRCODE='42501';
    END IF;
  END IF;
  card_tags := ojjuda_note_internal.auto_card_tags(0,current_date,body_text);
  IF position('#19금' in body_text)>0 AND NOT ('19금'=ANY(card_tags)) THEN
    card_tags := ARRAY['19금'] || card_tags[1:4];
  END IF;
  INSERT INTO ojjuda_note.cards(author_id,kind,parent_id,body,tags,background_key,identity_mode)
  VALUES(NULL,CASE WHEN p_parent_id IS NULL THEN 'memo' ELSE 'comment' END,p_parent_id,body_text,card_tags,'10','anonymous')
  RETURNING id INTO card;
  IF p_parent_id IS NOT NULL THEN PERFORM ojjuda_note_internal.queue_new_reply_retention_alert(card); END IF;
  INSERT INTO ojjuda_note_internal.guest_publications(request_id,card_id,network_hash,body_hash)
    VALUES(p_request_id,card,network_key,content_hash);
  RETURN jsonb_build_object('card_id',card,'tags',card_tags);
END;
$$;
REVOKE ALL ON FUNCTION ojjuda_note.publish_guest_card(uuid,text,uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION ojjuda_note.publish_guest_card(uuid,text,uuid) TO anon;
NOTIFY pgrst, 'reload schema';
