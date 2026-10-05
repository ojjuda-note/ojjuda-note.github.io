-- Hide 19금-tagged cards from discovery feeds, regardless of their other tags.
-- Explicit tag searches still use the existing public card projection.
BEGIN;

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
      AND NOT (pc.tags @> ARRAY['19금']::text[])
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
      AND NOT (c.tags @> ARRAY['19금']::text[])
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
$function$
;

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
    AND NOT (c.tags @> ARRAY['19금']::text[])
    AND e.starts_at<=statement_timestamp()
    AND e.ends_at>statement_timestamp()
    AND NOT EXISTS (SELECT 1 FROM ojjuda_note_internal.card_moderation m
                    WHERE m.card_id=c.id AND m.hidden)
    AND ojjuda_note_internal.distance_m(p_lat,p_lon,e.center_lat,e.center_lon)
        <=100000.0+e.radius_km*1000.0
  ORDER BY ojjuda_note_internal.distance_m(p_lat,p_lon,e.center_lat,e.center_lon),e.card_id
  LIMIT p_limit;
END;
$function$
;

NOTIFY pgrst, 'reload schema';
COMMIT;
