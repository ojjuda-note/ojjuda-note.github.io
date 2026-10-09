-- Move curated writing out of Park photo cards into Our-house Notes atomically.
DO $admin$
DECLARE definition text;
BEGIN
  definition:=pg_get_functiondef('ojjuda_house_admin.change_content(text,text,text,text,text)'::regprocedure);
  IF position('(p_kind=''post'' AND char_length(v_body)>4000)' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected house admin validation; review before changing';
  END IF;
  EXECUTE replace(definition,' OR (p_kind=''post'' AND char_length(v_body)>4000)','');
END;
$admin$;
CREATE SCHEMA ojjuda_house_note_internal;
REVOKE ALL ON SCHEMA ojjuda_house_note_internal FROM PUBLIC,anon,authenticated;
CREATE TABLE ojjuda_house_note_internal.config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO ojjuda_house_note_internal.config(singleton,author_id,enabled)
SELECT singleton,author_id,enabled FROM ojjuda_note_internal.auto_card_config WHERE singleton;
CREATE TABLE ojjuda_house_note_internal.queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_day date NOT NULL,
  slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 12),
  planned_at timestamptz NOT NULL,
  body text NOT NULL CHECK(char_length(btrim(body))>=1),
  content_source text NOT NULL CHECK(content_source IN
    ('curated_fiction','curated_humor','curated_issue','curated_daily')),
  ready_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  note_id text UNIQUE REFERENCES public.house_posts(id) ON DELETE SET NULL,
  posted_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  source_copy_id bigint UNIQUE,
  source_card_id uuid,
  original_copy jsonb,
  original_schedule jsonb,
  original_card jsonb,
  UNIQUE(local_day,slot),
  CHECK(planned_at=(local_day::timestamp+(2*slot-1)*interval '1 hour') AT TIME ZONE 'Asia/Seoul')
);
CREATE UNIQUE INDEX house_note_body_sha256 ON ojjuda_house_note_internal.queue
  ((extensions.digest(body,'sha256')));
CREATE INDEX house_note_due ON ojjuda_house_note_internal.queue(planned_at)
  WHERE posted_at IS NULL AND cancelled_at IS NULL;
ALTER TABLE ojjuda_house_note_internal.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ojjuda_house_note_internal.queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ojjuda_house_note_internal FROM PUBLIC,anon,authenticated;

DO $move$
DECLARE bot uuid; day date; item record;
BEGIN
  SELECT c.author_id INTO STRICT bot FROM ojjuda_house_note_internal.config c
    JOIN auth.users u ON u.id=c.author_id
    WHERE c.singleton AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true';
  FOR day IN SELECT DISTINCT t.local_day FROM ojjuda_note_internal.auto_card_copy t
    WHERE t.content_source IN ('curated_fiction','curated_humor','curated_issue','curated_daily')
    ORDER BY t.local_day
  LOOP
    PERFORM pg_advisory_xact_lock(284726,(day-date '2000-01-01')::integer);
    PERFORM pg_advisory_xact_lock(284729,(day-date '2000-01-01')::integer);
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM ojjuda_note_internal.auto_card_copy t
    LEFT JOIN ojjuda_note_internal.auto_card_schedule q ON q.copy_id=t.id
    LEFT JOIN ojjuda_note.cards c ON c.id=q.card_id
    WHERE t.content_source IN ('curated_fiction','curated_humor','curated_issue','curated_daily')
      AND (q.copy_id IS NULL OR (q.posted_at IS NOT NULL AND
        (c.id IS NULL OR c.author_id<>bot OR c.body<>t.body OR c.archived_at IS NOT NULL)))
  ) THEN RAISE EXCEPTION 'Curated source changed; no content moved'; END IF;

  INSERT INTO ojjuda_house_note_internal.queue
    (local_day,slot,planned_at,body,content_source,ready_at,posted_at,cancelled_at,cancel_reason,
     source_copy_id,source_card_id,original_copy,original_schedule,original_card)
  SELECT q.local_day,q.slot,q.planned_at,t.body,t.content_source,t.ready_at,q.posted_at,
    q.cancelled_at,q.cancel_reason,t.id,c.id,to_jsonb(t),to_jsonb(q),to_jsonb(c)
  FROM ojjuda_note_internal.auto_card_copy t
  JOIN ojjuda_note_internal.auto_card_schedule q ON q.copy_id=t.id
  LEFT JOIN ojjuda_note.cards c ON c.id=q.card_id
  WHERE t.content_source IN ('curated_fiction','curated_humor','curated_issue','curated_daily');

  FOR item IN SELECT q.*,c.created_at FROM ojjuda_house_note_internal.queue q
    JOIN ojjuda_note.cards c ON c.id=q.source_card_id ORDER BY q.planned_at
  LOOP
    INSERT INTO public.house_posts(id,user_id,body,visibility,created_at)
      VALUES(item.id::text,bot,item.body,'all',item.created_at);
    UPDATE ojjuda_house_note_internal.queue SET note_id=item.id::text WHERE id=item.id;
    IF NOT EXISTS (SELECT 1 FROM public.house_posts p WHERE p.id=item.id::text
      AND p.user_id=bot AND p.body=item.body AND p.created_at=item.created_at AND p.visibility='all')
    THEN RAISE EXCEPTION 'House note copy verification failed'; END IF;
    PERFORM ojjuda_note_internal.archive_card_tree(item.source_card_id,'owner',bot,'우리집 노트로 이동');
  END LOOP;

  -- The full copy and schedule snapshots are retained above before removing the old route.
  IF EXISTS (SELECT 1 FROM ojjuda_note_internal.auto_card_copy t
    WHERE t.content_source IN ('curated_fiction','curated_humor','curated_issue','curated_daily')
    AND NOT EXISTS (SELECT 1 FROM ojjuda_house_note_internal.queue q
      WHERE q.source_copy_id=t.id AND q.body=t.body AND q.original_copy=to_jsonb(t)))
  THEN RAISE EXCEPTION 'Queue copy verification failed'; END IF;
  DELETE FROM ojjuda_note_internal.auto_card_schedule old
    USING ojjuda_house_note_internal.queue moved WHERE old.copy_id=moved.source_copy_id;
  DELETE FROM ojjuda_note_internal.auto_card_copy old
    USING ojjuda_house_note_internal.queue moved WHERE old.id=moved.source_copy_id;
END;
$move$;

-- Preserve the archived original while rejecting all new overlength photo cards.
ALTER TABLE ojjuda_note.cards DROP CONSTRAINT note_body_length;
CREATE OR REPLACE FUNCTION ojjuda_note_internal.valid_note_body(p_body text)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path='pg_catalog' AS $function$
  SELECT char_length(p_body) BETWEEN 1 AND 200
    AND position(chr(13) IN p_body)=0
    AND regexp_replace(p_body,
      '[[:space:][:cntrl:]' || chr(127) || '-' || chr(159)
      || chr(160) || chr(173) || chr(5760) || chr(6158)
      || chr(8192) || '-' || chr(8207)
      || chr(8232) || '-' || chr(8238)
      || chr(8239) || chr(8287)
      || chr(8288) || '-' || chr(8303)
      || chr(12288) || chr(65279) || ']', '', 'g') <> '';
$function$;
ALTER TABLE ojjuda_note.cards ADD CONSTRAINT note_body_length
  CHECK(archived_at IS NOT NULL OR coalesce(ojjuda_note_internal.valid_note_body(body),false));
ALTER TABLE ojjuda_note_internal.auto_card_copy DROP CONSTRAINT auto_card_copy_body_check;
ALTER TABLE ojjuda_note_internal.auto_card_copy ADD CONSTRAINT auto_card_copy_body_check
  CHECK(ojjuda_note_internal.valid_note_body(body));

-- Restore the original 10,000-character draft buffer (publication stays at 200).
DO $restore$
DECLARE definition text;
BEGIN
  definition:=pg_get_functiondef('ojjuda_note_internal.save_draft(bigint,jsonb)'::regprocedure);
  IF position('char_length(p_content->>''body'')' IN definition)=0 THEN
    EXECUTE replace(definition,
      'OR jsonb_typeof(p_content->''body'') IS DISTINCT FROM ''string''',
      'OR jsonb_typeof(p_content->''body'') IS DISTINCT FROM ''string'' OR char_length(p_content->>''body'') > 10000');
  END IF;
END;
$restore$;
ALTER TABLE ojjuda_note_internal.drafts DROP CONSTRAINT note_draft_content;
ALTER TABLE ojjuda_note_internal.drafts ADD CONSTRAINT note_draft_content CHECK (
  (NOT active AND body IS NULL AND tags IS NULL AND background_key IS NULL
    AND kind IS NULL AND parent_id IS NULL AND style IS NULL AND photo_key IS NULL)
  OR (active AND body IS NOT NULL AND char_length(body)<=10000
    AND tags IS NOT NULL AND char_length(tags)<=240
    AND background_key IS NOT NULL AND background_key ~ '^([1-9][0-9]|1[0-8][0-9])$'
    AND (style IS NULL OR ojjuda_note_internal.valid_card_style(style))
    AND (photo_key IS NULL OR photo_key ~ '^([1-9][0-9]|1[0-8][0-9])$')
    AND kind IS NOT NULL AND ((kind='memo' AND parent_id IS NULL) OR (kind='comment' AND parent_id IS NOT NULL)))
);
CREATE OR REPLACE FUNCTION ojjuda_note_internal.auto_card_tags(p_slot integer,p_day date,p_body text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 SELECT CASE WHEN p_slot>24 OR (p_day=date '2026-09-29' AND p_slot>=16) THEN
   CASE WHEN p_body ~ '(기상청|나사|NASA|발표|에 따르면)' THEN ARRAY['소식','정보']::text[]
        ELSE ARRAY['유머']::text[] END
 ELSE CASE p_slot%4 WHEN 0 THEN ARRAY['위로','공감']::text[]
   WHEN 1 THEN ARRAY['응원']::text[] WHEN 2 THEN ARRAY['공감']::text[]
   ELSE ARRAY['명언','위로']::text[] END END
$function$;

CREATE FUNCTION ojjuda_house_note_internal.run_house_notes()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE
  stamp timestamptz:=statement_timestamp();
  day date:=(stamp AT TIME ZONE 'Asia/Seoul')::date;
  hour_start timestamptz:=date_trunc('hour',stamp AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
  cfg ojjuda_house_note_internal.config;
  item ojjuda_house_note_internal.queue;
BEGIN
  SELECT * INTO cfg FROM ojjuda_house_note_internal.config WHERE singleton;
  IF NOT coalesce(cfg.enabled,false) THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
    WHERE u.id=cfg.author_id AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true')
    OR public.is_banned(cfg.author_id) THEN RAISE EXCEPTION 'Dedicated active bot required'; END IF;
  PERFORM pg_advisory_xact_lock(284729,(day-date '2000-01-01')::integer);
  UPDATE ojjuda_house_note_internal.queue SET cancelled_at=stamp,cancel_reason='missed_hour'
    WHERE posted_at IS NULL AND cancelled_at IS NULL AND planned_at<hour_start;
  IF EXISTS(SELECT 1 FROM ojjuda_house_note_internal.queue
    WHERE posted_at>=hour_start AND posted_at<hour_start+interval '1 hour') THEN RETURN 0; END IF;
  SELECT * INTO item FROM ojjuda_house_note_internal.queue
    WHERE local_day=day AND posted_at IS NULL AND cancelled_at IS NULL
      AND planned_at>=hour_start AND planned_at<=stamp AND ready_at<=stamp
    ORDER BY planned_at,slot LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF public.has_banned(item.body) THEN RAISE EXCEPTION 'Note failed content validation'; END IF;
  INSERT INTO public.house_posts(id,user_id,body,visibility,created_at)
    VALUES(item.id::text,cfg.author_id,item.body,'all',stamp);
  UPDATE ojjuda_house_note_internal.queue SET note_id=item.id::text,posted_at=stamp WHERE id=item.id;
  RETURN 1;
END;
$function$;
REVOKE ALL ON FUNCTION ojjuda_house_note_internal.run_house_notes() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('ojjuda_house_notes_every_2h','1 0-22/2 * * *',
  'select ojjuda_house_note_internal.run_house_notes()');
-- Follow a prior user stop rather than silently restarting their publishing.
SELECT cron.alter_job(jobid,active:=coalesce((SELECT enabled FROM ojjuda_house_note_internal.config WHERE singleton),false))
  FROM cron.job WHERE jobname='ojjuda_house_notes_every_2h';
NOTIFY pgrst,'reload schema';
