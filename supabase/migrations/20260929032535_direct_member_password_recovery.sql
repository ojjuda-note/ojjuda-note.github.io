-- Temporary identity-based recovery, explicitly requested until phone verification is introduced.
-- Passwords are changed by Supabase Auth, never written to auth.users by this migration.
create table ojjuda_account_internal.password_recovery_grants (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_fingerprint text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index password_recovery_grants_user_idx on ojjuda_account_internal.password_recovery_grants(user_id);
alter table ojjuda_account_internal.password_recovery_grants enable row level security;
revoke all on ojjuda_account_internal.password_recovery_grants from public,anon,authenticated;

create function ojjuda_account_internal.begin_member_password_recovery(
  p_email text,p_phone text,p_birth_date text,p_gender text,p_ip_hash text,p_email_hash text,p_token_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
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
    and (u.banned_until is null or u.banned_until<=clock_timestamp());
  if v_user is null then return jsonb_build_object('status','unmatched'); end if;
  -- The rate limiter's global row lock serializes issuance. A newer check invalidates older grants.
  delete from ojjuda_account_internal.password_recovery_grants
    where user_id=v_user or expires_at<=clock_timestamp();
  insert into ojjuda_account_internal.password_recovery_grants(token_hash,user_id,account_fingerprint,expires_at)
  values(p_token_hash,v_user,v_fingerprint,clock_timestamp()+interval '5 minutes');
  return jsonb_build_object('status','matched','expires_in',300);
end;
$$;

create function ojjuda_account_internal.consume_member_password_recovery(p_token_hash text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_user uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  -- The atomic update allows exactly one concurrent caller to claim this grant.
  update ojjuda_account_internal.password_recovery_grants g set consumed_at=clock_timestamp()
  where g.token_hash=p_token_hash and g.consumed_at is null and g.expires_at>clock_timestamp()
    and exists(select 1 from auth.users u join ojjuda_account_internal.member_identity m on m.user_id=u.id
      where u.id=g.user_id and (u.banned_until is null or u.banned_until<=clock_timestamp())
        and g.account_fingerprint=encode(sha256(convert_to(concat_ws('|',u.encrypted_password,lower(u.email),m.phone_number,m.birth_date::text,m.gender),'UTF8')),'hex'))
  returning g.user_id into v_user;
  return v_user;
end;
$$;
create function public.begin_member_password_recovery(
  p_email text,p_phone text,p_birth_date text,p_gender text,p_ip_hash text,p_email_hash text,p_token_hash text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
  select ojjuda_account_internal.begin_member_password_recovery(p_email,p_phone,p_birth_date,p_gender,p_ip_hash,p_email_hash,p_token_hash);
$$;
create function public.consume_member_password_recovery(p_token_hash text)
returns uuid language sql security invoker set search_path=pg_catalog as $$
  select ojjuda_account_internal.consume_member_password_recovery(p_token_hash);
$$;
revoke all on function ojjuda_account_internal.begin_member_password_recovery(text,text,text,text,text,text,text),
  public.begin_member_password_recovery(text,text,text,text,text,text,text),
  ojjuda_account_internal.consume_member_password_recovery(text),public.consume_member_password_recovery(text)
  from public,anon,authenticated;
grant execute on function ojjuda_account_internal.begin_member_password_recovery(text,text,text,text,text,text,text),
  public.begin_member_password_recovery(text,text,text,text,text,text,text),
  ojjuda_account_internal.consume_member_password_recovery(text),public.consume_member_password_recovery(text)
  to service_role;
notify pgrst,'reload schema';
