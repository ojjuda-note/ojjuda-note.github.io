BEGIN;
CREATE OR REPLACE FUNCTION ojjuda_updates_internal.get_daily_update_notice()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH latest AS (
    SELECT n.* FROM ojjuda_updates_internal.daily_notices n
    WHERE n.available_at <= statement_timestamp()
      AND statement_timestamp() < n.available_at + interval '24 hours'
    ORDER BY n.report_date DESC LIMIT 1
  )
  SELECT jsonb_build_object('server_now',statement_timestamp(),'viewer',auth.uid(),
    'notice',(SELECT jsonb_build_object('id',n.report_date,'date',n.report_date,
      'available_at',n.available_at,'expires_at',n.available_at + interval '24 hours',
      'items',(SELECT jsonb_agg(i.value->>'text' ORDER BY i.ordinality)
        FROM jsonb_array_elements(n.items) WITH ORDINALITY i(value,ordinality)))
      FROM latest n WHERE NOT EXISTS (
        SELECT 1 FROM ojjuda_updates_internal.notice_reads r
        WHERE r.user_id = (SELECT auth.uid()) AND r.report_date=n.report_date)));
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
