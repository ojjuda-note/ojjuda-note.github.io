-- The editor assigns the narrator's present time in Korea to each new draft.
-- NULL hours means a draft still needs review; explicitly opt in to all hours for timeless copy.
ALTER TABLE ojjuda_note_internal.park_post_v2_contents
  ADD COLUMN publish_hours int4multirange
    CHECK (publish_hours <> '{}'::int4multirange AND publish_hours <@ '{[0,24)}'::int4multirange),
  ADD COLUMN publish_isodays int4multirange NOT NULL DEFAULT '{[1,8)}'
    CHECK (publish_isodays <> '{}'::int4multirange AND publish_isodays <@ '{[1,8)}'::int4multirange);

-- Reviewed draft windows are populated privately in the content table.
-- Fresh queues stay ineligible until their editor provides a window.

CREATE FUNCTION ojjuda_note_internal.park_post_v2_in_window(
  hours int4multirange, days int4multirange, at_time timestamptz
) RETURNS boolean LANGUAGE sql STABLE STRICT SET search_path = '' AS $window$
  SELECT hours @> extract(hour FROM local_time)::integer
     AND days @> extract(isodow FROM local_time)::integer
  FROM (SELECT at_time AT TIME ZONE 'Asia/Seoul' AS local_time) AS clock;
$window$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.park_post_v2_in_window(int4multirange,int4multirange,timestamptz) FROM PUBLIC;

-- Update just the eligibility predicate, preserving the live tag selector, rotation, and retry guards.
DO $migration$
DECLARE
  ddl text := pg_get_functiondef('ojjuda_note_internal.run_park_post_v2()'::regprocedure);
  previous text := '      AND c.posted_count = 0';
BEGIN
  IF cardinality(string_to_array(ddl, previous)) <> 2 THEN
    RAISE EXCEPTION 'Unexpected Park V2 content selection';
  END IF;
  EXECUTE replace(ddl, previous, previous || $filter$
      AND ojjuda_note_internal.park_post_v2_in_window(c.publish_hours, c.publish_isodays, v_now)$filter$);
END;
$migration$;
