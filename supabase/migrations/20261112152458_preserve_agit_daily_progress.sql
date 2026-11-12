BEGIN;
CREATE SCHEMA IF NOT EXISTS ojjuda_agit_internal;
REVOKE ALL ON SCHEMA ojjuda_agit_internal FROM PUBLIC, anon, authenticated;

-- Older open tabs still replace user_private.data as a whole. Keep only the
-- additive visit/mission history from the row they would otherwise overwrite.
-- This runs with the writer's rights, reads no other rows, and changes no wallet
-- columns or unrelated settings. Account deletion continues to delete the row.
CREATE OR REPLACE FUNCTION ojjuda_agit_internal.preserve_daily_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  today date := (statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
  old_hub jsonb := OLD.data #> '{settings,agitHub}';
  new_hub jsonb := NEW.data #> '{settings,agitHub}';
  settings jsonb;
  stamps jsonb;
  completed jsonb;
BEGIN
  old_hub := CASE WHEN jsonb_typeof(old_hub) = 'object' THEN old_hub ELSE '{}'::jsonb END;
  new_hub := CASE WHEN jsonb_typeof(new_hub) = 'object' THEN new_hub ELSE '{}'::jsonb END;
  IF old_hub = '{}'::jsonb AND new_hub = '{}'::jsonb THEN RETURN NEW; END IF;

  SELECT coalesce(jsonb_agg(day ORDER BY day), '[]'::jsonb) INTO stamps
  FROM (
    SELECT DISTINCT item #>> '{}' AS day
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(old_hub->'stamps') = 'array' THEN old_hub->'stamps' ELSE '[]'::jsonb END ||
      CASE WHEN jsonb_typeof(new_hub->'stamps') = 'array' THEN new_hub->'stamps' ELSE '[]'::jsonb END
    ) AS entries(item)
    WHERE jsonb_typeof(item) = 'string'
      AND (item #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND pg_input_is_valid(item #>> '{}', 'date')
      AND (item #>> '{}') <= to_char(today, 'YYYY-MM-DD')
    ORDER BY day DESC LIMIT 120
  ) AS valid_stamps;

  SELECT coalesce(jsonb_object_agg(day, ids), '{}'::jsonb) INTO completed
  FROM (
    SELECT day, jsonb_agg(mission ORDER BY mission) AS ids
    FROM (
      SELECT DISTINCT entry.key AS day, mission.value #>> '{}' AS mission
      FROM (
        SELECT * FROM jsonb_each(CASE WHEN jsonb_typeof(old_hub->'completed') = 'object' THEN old_hub->'completed' ELSE '{}'::jsonb END)
        UNION ALL
        SELECT * FROM jsonb_each(CASE WHEN jsonb_typeof(new_hub->'completed') = 'object' THEN new_hub->'completed' ELSE '{}'::jsonb END)
      ) AS entry
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(entry.value) = 'array' THEN entry.value ELSE '[]'::jsonb END
      ) AS mission(value)
      WHERE entry.key BETWEEN to_char(today - 35, 'YYYY-MM-DD') AND to_char(today, 'YYYY-MM-DD')
        AND entry.key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND pg_input_is_valid(entry.key, 'date')
        AND mission.value #>> '{}' IN ('park','baseball','quiz','recommend','visit')
    ) AS valid_missions GROUP BY day
  ) AS valid_days;

  -- Tolerate malformed optional JSON without preventing unrelated account saves.
  NEW.data := CASE WHEN jsonb_typeof(NEW.data) = 'object' THEN NEW.data ELSE '{}'::jsonb END;
  settings := CASE WHEN jsonb_typeof(NEW.data->'settings') = 'object' THEN NEW.data->'settings' ELSE '{}'::jsonb END;
  NEW.data := jsonb_set(NEW.data, '{settings}', settings || jsonb_build_object(
    'agitHub', new_hub || jsonb_build_object('stamps', stamps, 'completed', completed)
  ), true);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION ojjuda_agit_internal.preserve_daily_progress()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS preserve_agit_daily_progress ON public.user_private;
CREATE TRIGGER preserve_agit_daily_progress
BEFORE UPDATE OF data ON public.user_private
FOR EACH ROW WHEN (OLD.data IS DISTINCT FROM NEW.data)
EXECUTE FUNCTION ojjuda_agit_internal.preserve_daily_progress();
COMMIT;
