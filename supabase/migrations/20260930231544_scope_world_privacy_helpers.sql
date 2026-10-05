-- Keep policy helpers usable by signed-in members without exposing another
-- member's relationships, block state, ban state, or folder permissions by RPC.
-- Existing RLS/callers always supply auth.uid() as the viewer or one party.
-- Public card reads do not depend on these helpers. No account data is changed.
--
-- SECURITY DEFINER changes current_user to the owner, so it MUST NOT be used
-- to identify a privileged caller. The outer SET ROLE remains the API role.
-- Direct owner/admin sessions and service_role retain their maintenance access;
-- an authenticated request stays scoped, even inside another definer function.

CREATE OR REPLACE FUNCTION public.is_friend(a uuid, b uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (
    coalesce(auth.uid() IN (a, b), false)
    OR coalesce(nullif(pg_catalog.current_setting('role', true), 'none'), session_user)
       IN ('service_role', 'postgres', 'supabase_admin')
  ) THEN
    RAISE EXCEPTION 'helper_scope_denied' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester = a AND f.addressee = b)
        OR (f.requester = b AND f.addressee = a))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.blocked_between(a uuid, b uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (
    coalesce(auth.uid() IN (a, b), false)
    OR coalesce(nullif(pg_catalog.current_setting('role', true), 'none'), session_user)
       IN ('service_role', 'postgres', 'supabase_admin')
  ) THEN
    RAISE EXCEPTION 'helper_scope_denied' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.blocks x
    WHERE (x.blocker = a AND x.blocked = b)
       OR (x.blocker = b AND x.blocked = a)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_banned(u uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (
    coalesce(auth.uid() = u, false)
    OR coalesce(nullif(pg_catalog.current_setting('role', true), 'none'), session_user)
       IN ('service_role', 'postgres', 'supabase_admin')
  ) THEN
    RAISE EXCEPTION 'helper_scope_denied' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_private p
    WHERE p.user_id = u AND p.banned_until IS NOT NULL AND p.banned_until > now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.folder_can_see(p_folder uuid, p_viewer uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (
    coalesce(auth.uid() = p_viewer, false)
    OR coalesce(nullif(pg_catalog.current_setting('role', true), 'none'), session_user)
       IN ('service_role', 'postgres', 'supabase_admin')
  ) THEN
    RAISE EXCEPTION 'helper_scope_denied' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.media_folders f
    WHERE f.id = p_folder
      AND (f.user_id = p_viewer
        OR (public.door_open(f.user_id)
          AND (f.visibility = 'all'
            OR (f.visibility = 'friends' AND public.is_friend(f.user_id, p_viewer))
            OR (f.visibility = 'chosen' AND p_viewer = ANY(f.allowed)
                AND public.is_friend(f.user_id, p_viewer)))))
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.is_friend(uuid, uuid),
  public.blocked_between(uuid, uuid), public.is_banned(uuid),
  public.folder_can_see(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_friend(uuid, uuid),
  public.blocked_between(uuid, uuid), public.is_banned(uuid),
  public.folder_can_see(uuid, uuid) TO authenticated, service_role;
