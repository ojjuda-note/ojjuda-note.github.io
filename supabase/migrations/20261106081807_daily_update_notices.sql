BEGIN;
CREATE SCHEMA IF NOT EXISTS ojjuda_updates_internal;
REVOKE ALL ON SCHEMA ojjuda_updates_internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA ojjuda_updates_internal TO anon, authenticated, service_role;

CREATE TABLE ojjuda_updates_internal.daily_notices (
  report_date date PRIMARY KEY,
  available_at timestamptz NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 30),
  verified_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK (available_at = (report_date + 1)::timestamp AT TIME ZONE 'Asia/Seoul')
);
CREATE TABLE ojjuda_updates_internal.notice_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date date NOT NULL REFERENCES ojjuda_updates_internal.daily_notices(report_date) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (user_id, report_date)
);
CREATE INDEX daily_notice_reads_date ON ojjuda_updates_internal.notice_reads(report_date);
ALTER TABLE ojjuda_updates_internal.daily_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ojjuda_updates_internal.notice_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ojjuda_updates_internal FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA ojjuda_updates_internal TO service_role;

-- Trusted publishing only. Source evidence stays private; clients receive short text.
CREATE FUNCTION ojjuda_updates_internal.publish_daily_notice(p_date date, p_items jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE item jsonb; changed integer;
BEGIN
  IF p_date IS NULL OR p_date > (statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date
    OR p_date < (statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date - 30
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid daily notice' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'A notice needs 1 to 30 completed changes' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR coalesce(item->>'category','') NOT IN ('games','park','account','general','restaurants','festivals')
      OR jsonb_typeof(item->'text') IS DISTINCT FROM 'string'
      OR char_length(btrim(item->>'text')) NOT BETWEEN 2 AND 80
      OR (item->>'text') ~ '[\r\n<>]'
      OR (item->>'text') ~* '(관리자|원고실|admin|manuscript)'
      OR coalesce(item->>'source_sha','') !~ '^[0-9a-f]{40}$'
      OR coalesce(item->>'deployment_url','') !~ '^https://github[.]com/ojjuda-note/ojjuda-note[.]github[.]io/actions/runs/[0-9]+$' THEN
      RAISE EXCEPTION 'Only verified public changes with deployment evidence are allowed' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- Immutable publication: retries cannot change a notice users already confirmed.
  INSERT INTO ojjuda_updates_internal.daily_notices(report_date,available_at,items)
  VALUES (p_date,(p_date+1)::timestamp AT TIME ZONE 'Asia/Seoul',p_items)
  ON CONFLICT (report_date) DO NOTHING;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END $$;
REVOKE ALL ON FUNCTION ojjuda_updates_internal.publish_daily_notice(date,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_updates_internal.publish_daily_notice(date,jsonb) TO service_role;

-- Public announcements may be read by guests. A member's read state is scoped
-- exclusively to auth.uid(); there is no caller-supplied account identifier.
CREATE FUNCTION ojjuda_updates_internal.get_daily_update_notice()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH latest AS (
    SELECT n.* FROM ojjuda_updates_internal.daily_notices n
    WHERE n.available_at <= statement_timestamp()
    ORDER BY n.report_date DESC LIMIT 1
  )
  SELECT jsonb_build_object('server_now',statement_timestamp(),'viewer',auth.uid(),
    'notice',(SELECT jsonb_build_object('id',n.report_date,'date',n.report_date,
      'items',(SELECT jsonb_agg(i.value->>'text' ORDER BY i.ordinality)
        FROM jsonb_array_elements(n.items) WITH ORDINALITY i(value,ordinality)))
      FROM latest n WHERE NOT EXISTS (
        SELECT 1 FROM ojjuda_updates_internal.notice_reads r
        WHERE r.user_id = (SELECT auth.uid()) AND r.report_date=n.report_date)));
$$;
CREATE FUNCTION ojjuda_updates_internal.acknowledge_daily_update_notice(p_date date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid := auth.uid();
BEGIN
  IF viewer IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF p_date IS NULL OR NOT EXISTS (SELECT 1 FROM ojjuda_updates_internal.daily_notices n
    WHERE n.report_date=p_date AND n.available_at<=statement_timestamp()) THEN
    RAISE EXCEPTION 'Published notice required' USING ERRCODE='22023';
  END IF;
  INSERT INTO ojjuda_updates_internal.notice_reads(user_id,report_date)
  VALUES (viewer,p_date) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;
CREATE FUNCTION public.get_daily_update_notice()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT ojjuda_updates_internal.get_daily_update_notice();
$$;
CREATE FUNCTION public.acknowledge_daily_update_notice(p_date date)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT ojjuda_updates_internal.acknowledge_daily_update_notice(p_date);
$$;
REVOKE ALL ON FUNCTION ojjuda_updates_internal.get_daily_update_notice(),public.get_daily_update_notice(),
  ojjuda_updates_internal.acknowledge_daily_update_notice(date),public.acknowledge_daily_update_notice(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_updates_internal.get_daily_update_notice(),public.get_daily_update_notice() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_updates_internal.acknowledge_daily_update_notice(date),public.acknowledge_daily_update_notice(date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
