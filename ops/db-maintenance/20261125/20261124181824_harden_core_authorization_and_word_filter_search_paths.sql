-- Preserve all existing authorization, filtering, signatures, owner and grants.
-- Existing-vs-candidate comparisons: 214; temporary-table isolation: 3.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '10s';
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.door_open(uuid)'::regprocedure)) <> '0aa5432a25c8c25d7a864bc6b7003100' THEN RAISE EXCEPTION 'Concurrent function change: door_open'; END IF;
 IF md5(pg_get_functiondef('public.has_banned(text)'::regprocedure)) <> '0ee3053aa55bee76983aace177f8f815' THEN RAISE EXCEPTION 'Concurrent function change: has_banned'; END IF;
 IF md5(pg_get_functiondef('public.is_admin()'::regprocedure)) <> '42f3ed4462cf89e6f82cfed242086637' THEN RAISE EXCEPTION 'Concurrent function change: is_admin'; END IF;
 IF md5(pg_get_functiondef('public.photo_is_friend(uuid,uuid)'::regprocedure)) <> '588b7f953fb0ce0ea7483e196d234e4c' THEN RAISE EXCEPTION 'Concurrent function change: photo_is_friend'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.door_open(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not coalesce((select door_closed from public.profiles where id = uid), false);
$function$
;
CREATE OR REPLACE FUNCTION public.has_banned(t text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n text; a record;
begin
  n := public.norm_text(t);
  if n = '' then return false; end if;
  for a in select phrase from public.banned_allow loop n := replace(n, public.norm_text(a.phrase), ''); end loop;
  return exists (select 1 from public.banned_base b where b.active and public.norm_text(b.word) <> '' and position(public.norm_text(b.word) in n) > 0)
      or exists (select 1 from public.banned_words w where public.norm_text(w.word) <> '' and position(public.norm_text(w.word) in n) > 0);
end $function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION public.photo_is_friend(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null and (auth.uid() = a or auth.uid() = b)
    and exists (select 1 from public.friendships f where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)))
$function$
;
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.door_open(uuid)'::regprocedure AND p.proacl::text='{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' AND p.prosecdef AND p.provolatile='s' AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""']) THEN RAISE EXCEPTION 'Metadata changed: door_open'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.has_banned(text)'::regprocedure AND p.proacl::text='{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' AND p.prosecdef AND p.provolatile='s' AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""']) THEN RAISE EXCEPTION 'Metadata changed: has_banned'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.is_admin()'::regprocedure AND p.proacl::text='{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' AND p.prosecdef AND p.provolatile='s' AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""']) THEN RAISE EXCEPTION 'Metadata changed: is_admin'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.photo_is_friend(uuid,uuid)'::regprocedure AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres}' AND p.prosecdef AND p.provolatile='s' AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""']) THEN RAISE EXCEPTION 'Metadata changed: photo_is_friend'; END IF;
END $guard$;