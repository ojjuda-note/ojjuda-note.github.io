CREATE OR REPLACE FUNCTION ojjuda_note_internal.glasses_replies(p_parent uuid, p_lat double precision, p_lon double precision, p_after uuid, p_snapshot timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  member_id uuid := auth.uid();
  snapshot_at timestamptz := least(coalesce(p_snapshot, statement_timestamp()), statement_timestamp());
  result jsonb;
BEGIN
  IF member_id IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
     OR public.park_guardian_location_allowed() IS DISTINCT FROM true
     OR EXISTS (SELECT 1 FROM ojjuda_account_internal.location_preferences
                WHERE user_id = member_id AND NOT enabled) THEN
    RAISE EXCEPTION 'park_location_required' USING ERRCODE = '42501';
  END IF;
  IF p_parent IS NULL OR p_lat IS NULL OR p_lon IS NULL OR
     p_lat NOT BETWEEN -90 AND 90 OR p_lon NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid_nearby_request' USING ERRCODE = '22023';
  END IF;
  -- The visibility view checks moderation, blocks and archives along the entire branch.
  -- Also apply the G2 age-tag filter to every ancestor when opening a nested reply.
  IF NOT EXISTS (
    WITH RECURSIVE branch AS (
      SELECT c.id,c.parent_id,c.kind,c.tags FROM ojjuda_note.cards c WHERE c.id=p_parent
      UNION
      SELECT c.id,c.parent_id,c.kind,c.tags FROM ojjuda_note.cards c JOIN branch b ON c.id=b.parent_id
    )
    SELECT 1 FROM ojjuda_note.public_cards visible
    WHERE visible.id=p_parent AND visible.kind IN ('memo','comment')
      AND EXISTS (SELECT 1 FROM branch WHERE parent_id IS NULL AND kind='memo')
      AND NOT EXISTS (SELECT 1 FROM branch WHERE tags @> ARRAY['19금']::text[])
  ) THEN
    RETURN NULL;
  END IF;

  WITH measured AS MATERIALIZED (
    SELECT c.id, c.created_at, c.body, c.reply_count,
           CASE WHEN l.coarse_lat IS NOT NULL AND l.coarse_lon IS NOT NULL THEN
             ojjuda_note_internal.distance_m(p_lat,p_lon,l.coarse_lat,l.coarse_lon) END AS meters
    FROM ojjuda_note.public_cards c
    LEFT JOIN ojjuda_note_internal.card_locations l ON l.card_id = c.id
    WHERE c.parent_id = p_parent AND c.kind = 'comment' AND c.created_at <= snapshot_at
      AND NOT (c.tags @> ARRAY['19금']::text[]) AND nullif(btrim(c.body),'') IS NOT NULL
  ), ranked AS MATERIALIZED (
    SELECT m.*, row_number() OVER (ORDER BY meters ASC NULLS LAST, created_at DESC, id DESC) AS pos
    FROM measured m
  ), page AS (
    SELECT * FROM ranked WHERE pos > coalesce((SELECT pos FROM ranked WHERE id=p_after), 0)
    ORDER BY pos LIMIT 20
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM ranked), 'snapshot', snapshot_at,
    'items', coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'has_replies',reply_count > 0,'distance_band',
      CASE WHEN meters IS NULL THEN NULL WHEN meters <= 1000 THEN '근처'
           ELSE ceil(meters/1000.0)::int::text || 'km' END) ORDER BY pos),'[]'::jsonb),
    'next', CASE WHEN max(pos) < (SELECT count(*) FROM ranked)
                 THEN (array_agg(id ORDER BY pos DESC))[1] ELSE NULL END
  ) INTO result FROM page;
  RETURN result;
END;
$function$;
