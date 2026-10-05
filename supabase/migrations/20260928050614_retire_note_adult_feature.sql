-- Retire the Note age-tag feature. Preserve ordinary cards, tags, moderation,
-- photo tombstones, map, and member/card gender.
BEGIN;

-- At preparation time there were zero tagged cards, drafts, age rows,
-- feature moderation entries, and storage objects. If cards appeared since,
-- stop before losing linked photo binaries (which require Storage deletion).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ojjuda_note.cards c
    CROSS JOIN LATERAL unnest(coalesce(c.tags, '{}'::text[])) t(value)
    WHERE regexp_replace(t.value, '[#[:space:]]', '', 'g') = '19금'
  ) THEN
    RAISE EXCEPTION 'Unexpected age-tagged cards: inspect linked photos before removal';
  END IF;
END;
$$;
DELETE FROM ojjuda_note_internal.drafts d
WHERE coalesce(d.tags, '') ~ '19[[:space:]]*금';
DELETE FROM ojjuda_note_internal.moderation_actions
WHERE action = 'reset_adult';

-- The existing CHECK on cards calls this general validator for all writes.
CREATE OR REPLACE FUNCTION ojjuda_note.valid_tags(input_tags text[])
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT
SET search_path TO 'pg_catalog'
AS $function$
  SELECT cardinality(input_tags) <= 5
    AND NOT EXISTS (
      SELECT 1 FROM unnest(input_tags) AS t(tag)
      WHERE t.tag IS NULL OR t.tag <> btrim(t.tag)
         OR char_length(t.tag) NOT BETWEEN 1 AND 20
         OR regexp_replace(t.tag, '[#[:space:]]', '', 'g') = '19금'
    )
    AND cardinality(input_tags) = (
      SELECT count(DISTINCT t.tag) FROM unnest(input_tags) AS t(tag)
    );
$function$;

CREATE OR REPLACE VIEW ojjuda_note.public_cards
  WITH (security_barrier=true, security_invoker=false) AS
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
         SELECT eligible.id,
            eligible.author_id,
            eligible.kind,
            eligible.parent_id,
            eligible.body,
            eligible.tags,
            eligible.background_key,
            eligible.created_at,
            eligible.edited_at,
            eligible.identity_mode,
            eligible.archive_due_at,
            eligible.permanent
           FROM eligible
          WHERE eligible.parent_id IS NULL
        UNION ALL
         SELECT e.id,
            e.author_id,
            e.kind,
            e.parent_id,
            e.body,
            e.tags,
            e.background_key,
            e.created_at,
            e.edited_at,
            e.identity_mode,
            e.archive_due_at,
            e.permanent
           FROM eligible e
             JOIN visible parent ON e.parent_id = parent.id
        )
 SELECT c.id,
    c.kind,
    c.parent_id,
    c.body,
        CASE
            WHEN c.identity_mode = 'nickname'::text THEN COALESCE(( SELECT NULLIF(btrim(to_jsonb(p.*) ->> 'nickname'::text), ''::text) AS "nullif"
               FROM public.profiles p
              WHERE p.id = c.author_id), '익명'::text)
            ELSE '익명'::text
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
     CROSS JOIN LATERAL ( SELECT ojjuda_note_internal.card_visual_for(c.id) AS visual) v;

CREATE OR REPLACE FUNCTION ojjuda_note.list_cards(p_sort text DEFAULT 'recent'::text, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_radius_m integer DEFAULT 30000, p_limit integer DEFAULT 20, p_cursor jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(id uuid, kind text, parent_id uuid, body text, display_name text, tags text[], background_key text, created_at timestamp with time zone, edited_at timestamp with time zone, like_count bigint, reply_count bigint, is_mine boolean, is_liked boolean, is_bookmarked boolean, identity_mode text, style jsonb, photo_key text, distance_band text, event_starts_at timestamp with time zone, event_ends_at timestamp with time zone, event_radius_km integer, event_center_lat double precision, event_center_lon double precision, style_until timestamp with time zone, photo_until timestamp with time zone, archive_due_at timestamp with time zone, permanent boolean, effective_archive_due_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_sort text := CASE WHEN p_sort='latest' THEN 'recent' ELSE p_sort END;
        v_offset integer := 0; v_snapshot timestamptz := statement_timestamp();
BEGIN
  IF v_sort IS NULL OR v_sort NOT IN ('recent','popular','nearby')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 30
     OR p_radius_m IS NULL OR p_radius_m NOT BETWEEN 1 AND 30000
     OR (p_lat IS NULL)<>(p_lon IS NULL)
     OR (p_lat IS NOT NULL AND (p_lat NOT BETWEEN -90 AND 90 OR p_lon NOT BETWEEN -180 AND 180))
     OR (v_sort='nearby' AND p_lat IS NULL) THEN
    RAISE EXCEPTION 'Invalid card feed parameters' USING ERRCODE='22023';
  END IF;
  IF p_cursor IS NOT NULL THEN
    IF jsonb_typeof(p_cursor)<>'object' THEN
      RAISE EXCEPTION 'Invalid card cursor' USING ERRCODE='22023';
    END IF;
    v_offset := coalesce((p_cursor->>'offset')::integer,0);
    v_snapshot := least(coalesce((p_cursor->>'snapshot')::timestamptz,v_snapshot),v_snapshot);
    IF v_offset NOT BETWEEN 0 AND 5000 THEN
      RAISE EXCEPTION 'Invalid card cursor offset' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN QUERY
  WITH source AS MATERIALIZED (
    SELECT pc.id,pc.kind,pc.parent_id,pc.body,pc.display_name,pc.tags,
      pc.background_key,pc.created_at,pc.edited_at,pc.like_count,
      pc.reply_count,pc.is_mine,pc.is_liked,pc.is_bookmarked,pc.identity_mode,
      loc.coarse_lat AS search_lat,loc.coarse_lon AS search_lon,
      NULL::timestamptz AS starts_at,NULL::timestamptz AS ends_at,
      NULL::integer AS radius_km,NULL::double precision AS center_lat,
      NULL::double precision AS center_lon,c.archive_due_at,c.permanent
    FROM ojjuda_note.public_cards pc
    JOIN ojjuda_note.cards c ON c.id=pc.id
    LEFT JOIN ojjuda_note_internal.card_locations loc ON loc.card_id=pc.id
    WHERE pc.kind='memo' AND pc.created_at<=v_snapshot
    UNION ALL
    SELECT c.id,c.kind,c.parent_id,c.body,
      CASE WHEN c.identity_mode='nickname' THEN
        coalesce((SELECT nullif(btrim(to_jsonb(p.*)->>'nickname'),'')
                  FROM public.profiles p WHERE p.id=c.author_id),'익명')
        ELSE '익명' END,
      c.tags,c.background_key,c.created_at,c.edited_at,
      0::bigint,0::bigint,coalesce(c.author_id=auth.uid(),false),
      false,false,c.identity_mode,
      e.center_lat,e.center_lon,e.starts_at,e.ends_at,e.radius_km,
      e.center_lat,e.center_lon,c.archive_due_at,c.permanent
    FROM ojjuda_note.cards c
    JOIN ojjuda_note_internal.event_ads e ON e.card_id=c.id
    WHERE auth.uid() IS NOT NULL AND p_lat IS NOT NULL
      AND c.kind='event' AND c.archived_at IS NULL
      AND c.created_at<=v_snapshot
      AND e.starts_at<=statement_timestamp() AND e.ends_at>statement_timestamp()
      AND NOT EXISTS (SELECT 1 FROM ojjuda_note_internal.card_moderation m
                      WHERE m.card_id=c.id AND m.hidden)
      AND NOT EXISTS (SELECT 1 FROM ojjuda_note_internal.blocks b
                      WHERE b.blocker_id=auth.uid() AND b.blocked_id=c.author_id)
      AND ojjuda_note_internal.distance_m(p_lat,p_lon,e.center_lat,e.center_lon)
          <=e.radius_km*1000.0
  ), measured AS MATERIALIZED (
    SELECT s.*,
      CASE WHEN p_lat IS NULL OR s.search_lat IS NULL THEN NULL::double precision
           ELSE ojjuda_note_internal.distance_m(p_lat,p_lon,s.search_lat,s.search_lon)
      END AS meters
    FROM source s
  ), ranked AS (
    SELECT * FROM measured m
    WHERE (v_sort<>'nearby' OR m.kind='event'
      OR (m.meters IS NOT NULL AND m.meters<=p_radius_m))
      AND (v_sort<>'popular' OR m.kind='event'
        OR m.created_at>=v_snapshot-interval '7 days')
    ORDER BY CASE WHEN m.kind='event' THEN 0 ELSE 1 END,
      CASE WHEN v_sort='nearby' THEN m.meters END ASC NULLS LAST,
      CASE WHEN v_sort='popular' THEN m.like_count END DESC NULLS LAST,
      m.created_at DESC,m.id DESC
    LIMIT p_limit OFFSET v_offset
  )
  SELECT r.id,r.kind,r.parent_id,r.body,r.display_name,r.tags,
    r.background_key,r.created_at,r.edited_at,r.like_count,r.reply_count,
    r.is_mine,r.is_liked,r.is_bookmarked,r.identity_mode,
    coalesce(v.visual->'style',jsonb_build_object('font','default','size','normal','theme','plain')),
    v.visual->>'photo_key',
    CASE WHEN r.meters IS NULL THEN NULL
         WHEN r.meters<=1000 THEN '근처'
         ELSE ceil(r.meters/1000.0)::integer::text||'km' END,
    r.starts_at,r.ends_at,r.radius_km,r.center_lat,r.center_lon,
    nullif(v.visual->>'style_until','')::timestamptz,
    nullif(v.visual->>'photo_until','')::timestamptz,
    r.archive_due_at,r.permanent,
    ojjuda_note_internal.effective_archive_due(r.id)
  FROM ranked r
  CROSS JOIN LATERAL (SELECT ojjuda_note_internal.card_visual_for(r.id) AS visual) v
  ORDER BY CASE WHEN r.kind='event' THEN 0 ELSE 1 END,
    CASE WHEN v_sort='nearby' THEN r.meters END ASC NULLS LAST,
    CASE WHEN v_sort='popular' THEN r.like_count END DESC NULLS LAST,
    r.created_at DESC,r.id DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION ojjuda_note.list_event_map(p_lat double precision, p_lon double precision, p_limit integer DEFAULT 100)
 RETURNS TABLE(event_id uuid, center_lat double precision, center_lon double precision, radius_km integer, starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_lat IS NULL OR p_lon IS NULL OR p_lat NOT BETWEEN -90 AND 90
     OR p_lon NOT BETWEEN -180 AND 180 OR p_limit IS NULL
     OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid map bounds' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  SELECT e.card_id,e.center_lat,e.center_lon,e.radius_km,e.starts_at,e.ends_at
  FROM ojjuda_note_internal.event_ads e
  JOIN ojjuda_note.cards c ON c.id=e.card_id
  WHERE c.archived_at IS NULL
    AND e.starts_at<=statement_timestamp()
    AND e.ends_at>statement_timestamp()
    AND NOT EXISTS (SELECT 1 FROM ojjuda_note_internal.card_moderation m
                    WHERE m.card_id=c.id AND m.hidden)
    AND ojjuda_note_internal.distance_m(p_lat,p_lon,e.center_lat,e.center_lon)
        <=100000.0+e.radius_km*1000.0
  ORDER BY ojjuda_note_internal.distance_m(p_lat,p_lon,e.center_lat,e.center_lon),e.card_id
  LIMIT p_limit;
END;
$function$;

-- The helper is used by ordinary card and photo APIs; keep its signature.
CREATE OR REPLACE FUNCTION ojjuda_note_internal.can_read_card(p_card_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_card_id IS NOT NULL;
$function$;

ALTER POLICY note_cards_read_own ON ojjuda_note.cards
  USING (author_id = (SELECT auth.uid()) AND archived_at IS NULL);

ALTER POLICY note_event_photo_sign_owner ON storage.objects
  USING (
    bucket_id='note-event-photos'
    AND owner_id=(SELECT auth.uid())::text
    AND storage.allow_any_operation(ARRAY['object.sign','object.get_authenticated'])
    AND NOT ojjuda_note_internal.note_photo_tombstoned('note-event-photos', name)
  );
DROP FUNCTION ojjuda_note_internal.event_photo_owner_age_ok(text) RESTRICT;

DROP TRIGGER guard_adult_tag_before_write ON ojjuda_note.cards;
DROP FUNCTION ojjuda_note_internal.guard_adult_tag() RESTRICT;
DROP FUNCTION ojjuda_note.confirm_adult(integer) RESTRICT;
DROP FUNCTION ojjuda_note.get_adult_status() RESTRICT;
DROP FUNCTION ojjuda_note.admin_member_flags(uuid[]) RESTRICT;
DROP FUNCTION ojjuda_note.admin_reset_adult(uuid,text) RESTRICT;
DROP FUNCTION ojjuda_note_internal.is_adult_member() RESTRICT;
DROP FUNCTION ojjuda_note_internal.has_adult_tag(text[]) RESTRICT;
DROP TABLE ojjuda_note_internal.member_age RESTRICT;

ALTER TABLE ojjuda_note_internal.moderation_actions
  DROP CONSTRAINT moderation_actions_action_check;
ALTER TABLE ojjuda_note_internal.moderation_actions
  ADD CONSTRAINT moderation_actions_action_check CHECK (action = ANY (ARRAY[
    'hide','restore','resolve_report','edit','restrict_user','release_user',
    'add_moderator','remove_moderator','update_settings','reply_inquiry',
    'archive_card','restore_archived_card','purge_card'
  ]));

NOTIFY pgrst, 'reload schema';
COMMIT;
