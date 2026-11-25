SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='10s';
DO $guard$ BEGIN
IF md5(pg_get_functiondef('public.admin_errors()'::regprocedure)) IS DISTINCT FROM 'a27292673bc6f478dccba7853752ad8d' THEN RAISE EXCEPTION 'Unexpected predecessor: admin_errors'; END IF;
IF md5(pg_get_functiondef('public.admin_log_list(integer)'::regprocedure)) IS DISTINCT FROM 'f955fe5c7f00cf226eb555549934df89' THEN RAISE EXCEPTION 'Unexpected predecessor: admin_log_list'; END IF;
IF md5(pg_get_functiondef('public.admin_quiz_list(text)'::regprocedure)) IS DISTINCT FROM 'fe1b182d101b58c184d471ba8a488ccb' THEN RAISE EXCEPTION 'Unexpected predecessor: admin_quiz_list'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.admin_errors()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(x) from (
    select e.id, e.message, e.stack, e.screen, e.app_version, e.user_agent, e.created_at, p.nickname
    from public.client_errors e left join public.profiles p on p.id = e.user_id
    order by e.created_at desc limit 50) x), '[]'::json);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_log_list(p_limit integer DEFAULT 30)
 RETURNS TABLE(id bigint, created_at timestamp with time zone, admin_nick text, action text, target_nick text, target text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return query
    select l.id, l.created_at, pa.nickname, l.action, pt.nickname, l.target, l.detail
      from public.admin_log l
      left join public.profiles pa on pa.id = l.admin_id
      left join public.profiles pt on pt.id = l.target_user
     order by l.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 200);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_quiz_list(q text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(x) from (
    select id, category, question, answers, hint, used_count, active from public.quiz_bank
    where q = '' or question ilike '%' || q || '%' or category ilike '%' || q || '%' or array_to_string(answers, ' ') ilike '%' || q || '%'
    order by id desc limit 60) x), '[]'::json);
end $function$
;
DO $verify$ BEGIN
IF (select count(*) from pg_proc where oid in ('public.admin_errors()'::regprocedure,'public.admin_log_list(integer)'::regprocedure,'public.admin_quiz_list(text)'::regprocedure) and proowner='postgres'::regrole and proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' and provolatile='v' and prosecdef and proconfig=array['search_path=""']::text[])<>3 THEN RAISE EXCEPTION 'Function ownership or grants changed'; END IF;
END $verify$;