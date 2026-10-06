-- Remove unnecessary anonymous entry points without changing member authorization.
-- Trigger functions are invoked by PostgreSQL, never directly by browser RPC.
DO $hardening$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','ojjuda_note') AND p.prokind='f'
      AND left(p.proname,6)='admin_' AND has_function_privilege('anon',p.oid,'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn.signature);
  END LOOP;
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','ojjuda_note') AND p.prosecdef
      AND p.prorettype='pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
  END LOOP;
END
$hardening$;

-- These tables are maintained by authorized server functions.
REVOKE ALL ON TABLE public.app_admins, public.admin_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.app_admins, public.admin_log FROM authenticated;

-- Knowledge of an administrator's personal details is not proof of account ownership.
-- Reject both new grants and previously issued grants after promotion to administrator.
CREATE OR REPLACE FUNCTION ojjuda_account_internal.begin_member_password_recovery(p_email text, p_phone text, p_birth_date text, p_gender text, p_ip_hash text, p_email_hash text, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_status text; v_user uuid; v_fingerprint text;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_recovery_request' using errcode='22023';
  end if;
  v_status := ojjuda_account_internal.check_member_recovery(p_email,p_phone,p_birth_date,p_gender,p_ip_hash,p_email_hash);
  if v_status<>'matched' then return jsonb_build_object('status',v_status); end if;
  select u.id,encode(sha256(convert_to(concat_ws('|',u.encrypted_password,lower(u.email),m.phone_number,m.birth_date::text,m.gender),'UTF8')),'hex')
  into v_user,v_fingerprint from auth.users u join ojjuda_account_internal.member_identity m on m.user_id=u.id
  where lower(u.email)=lower(btrim(p_email)) and m.phone_number=ojjuda_account_internal.normalize_phone(p_phone)
    and m.birth_date=p_birth_date::date and m.gender=p_gender
    and (u.banned_until is null or u.banned_until<=clock_timestamp())
    and not exists(select 1 from public.app_admins a where a.user_id=u.id);
  if v_user is null then return jsonb_build_object('status','unmatched'); end if;
  -- The rate limiter's global row lock serializes issuance. A newer check invalidates older grants.
  delete from ojjuda_account_internal.password_recovery_grants
    where user_id=v_user or expires_at<=clock_timestamp();
  insert into ojjuda_account_internal.password_recovery_grants(token_hash,user_id,account_fingerprint,expires_at)
  values(p_token_hash,v_user,v_fingerprint,clock_timestamp()+interval '5 minutes');
  return jsonb_build_object('status','matched','expires_in',300);
end;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_account_internal.consume_member_password_recovery(p_token_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_user uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  -- The atomic update allows exactly one concurrent caller to claim this grant.
  update ojjuda_account_internal.password_recovery_grants g set consumed_at=clock_timestamp()
  where g.token_hash=p_token_hash and g.consumed_at is null and g.expires_at>clock_timestamp()
    and exists(select 1 from auth.users u join ojjuda_account_internal.member_identity m on m.user_id=u.id
      where u.id=g.user_id and (u.banned_until is null or u.banned_until<=clock_timestamp())
        and not exists(select 1 from public.app_admins a where a.user_id=u.id)
        and g.account_fingerprint=encode(sha256(convert_to(concat_ws('|',u.encrypted_password,lower(u.email),m.phone_number,m.birth_date::text,m.gender),'UTF8')),'hex'))
  returning g.user_id into v_user;
  return v_user;
end;
$function$;

REVOKE ALL ON FUNCTION ojjuda_account_internal.begin_member_password_recovery(text,text,text,text,text,text,text),
  ojjuda_account_internal.consume_member_password_recovery(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ojjuda_account_internal.begin_member_password_recovery(text,text,text,text,text,text,text),
  ojjuda_account_internal.consume_member_password_recovery(text) TO service_role;
-- Enforce the same allowlist at the API write boundary, including alternate clients.
ALTER TABLE public.profiles ADD CONSTRAINT profiles_wall_color_safe
  CHECK (room->'wall' IS NULL OR (
    jsonb_typeof(room->'wall')='string' AND (room->>'wall') ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'
  )) NOT VALID;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_wall_color_safe;

NOTIFY pgrst, 'reload schema';
