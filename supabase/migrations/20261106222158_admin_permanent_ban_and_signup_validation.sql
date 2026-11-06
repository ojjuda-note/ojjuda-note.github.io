-- Account bans and signup checks are authoritative on the server.
-- An Auth admin API call in the admin-ban Edge Function separately prevents login.

create or replace function ojjuda_account_internal.signup_email_valid(p_email text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $email_fn$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_local text := split_part(v_email,'@',1);
  v_domain text := split_part(v_email,'@',2);
begin
  if length(v_email) < 6 or length(v_email) > 254
      or length(v_local) > 64 or left(v_local,1) = '.' or right(v_local,1) = '.'
      or position('..' in v_local) > 0
      or v_email !~ $rx$^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,63}$$rx$ then
    return false;
  end if;
  if exists (
    select 1 from unnest(array[
      'example.com','example.net','example.org',
      'mailinator.com','yopmail.com','tempmail.com','temp-mail.org',
      '10minutemail.com','guerrillamail.com','sharklasers.com',
      'trashmail.com','getnada.com','maildrop.cc','dispostable.com'
    ]::text[]) as denied(domain)
    where v_domain = denied.domain or right(v_domain,length(denied.domain)+1) = '.'||denied.domain
  ) then return false; end if;
  return true;
end;
$email_fn$;

create or replace function ojjuda_account_internal.signup_phone_valid(p_phone text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_phone text := coalesce(p_phone,'');
  v_tail text := substring(v_phone,4,8);
begin
  return v_phone ~ '^010[0-9]{8}$'
    and v_tail <> repeat(left(v_tail,1),8)
    and v_tail not in ('01234567','12345678','87654321');
end;
$$;

revoke all on function ojjuda_account_internal.signup_email_valid(text),
  ojjuda_account_internal.signup_phone_valid(text) from public,anon,authenticated;

create or replace function ojjuda_account_internal.capture_signup_identity()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_info jsonb;
  v_meta jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
begin
  if coalesce(new.email,'') = '' or coalesce(new.encrypted_password,'') = '' then
    raise exception 'email_password_signup_required' using errcode = '22023';
  end if;
  if not ojjuda_account_internal.signup_email_valid(new.email) then
    raise exception 'invalid_signup_email' using errcode = '22023';
  end if;
  if coalesce(v_meta->>'age_14_or_older',v_meta->>'age_15_to_69') is distinct from 'true'
      or nullif(v_meta->>'terms_version','') is null then
    raise exception 'signup_consent_required' using errcode = '22023';
  end if;
  v_info := ojjuda_account_internal.parse_identity(v_meta->>'birth_yymmdd',v_meta->>'gender_code',
    v_meta->>'phone_number',(clock_timestamp() at time zone 'Asia/Seoul')::date,true);
  if not ojjuda_account_internal.signup_phone_valid(v_info->>'phone_number') then
    raise exception 'invalid_signup_phone' using errcode = '22023';
  end if;
  insert into ojjuda_account_internal.member_identity
    (user_id,birth_date,gender,phone_number,age_at_signup,consent_version)
  values (new.id,(v_info->>'birth_date')::date,v_info->>'gender',
    v_info->>'phone_number',(v_info->>'age')::smallint,v_meta->>'terms_version');
  update auth.users set raw_user_meta_data = raw_user_meta_data
    - array['birth_yymmdd','gender_code','phone_number','birth_date','gender']
    where id = new.id;
  return new;
end;
$$;
revoke all on function ojjuda_account_internal.capture_signup_identity() from public,anon,authenticated;

create or replace function public.admin_ban(target_user uuid,days integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_until timestamptz;
begin
  if v_actor is null or not coalesce(public.is_admin(),false) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if days is null or days not in (-1,0,7,30) then
    raise exception 'invalid_ban_period' using errcode = '22023';
  end if;
  if target_user is null or target_user = v_actor then
    raise exception 'cannot_ban_self' using errcode = '42501';
  end if;
  if exists (select 1 from public.app_admins where user_id=target_user) then
    raise exception 'cannot_ban_admin' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id=target_user) then
    raise exception 'account_not_found' using errcode = '22023';
  end if;
  v_until := case when days = -1 then 'infinity'::timestamptz
    when days = 0 then null
    else clock_timestamp() + make_interval(days => days) end;
  update public.user_private set banned_until=v_until where user_id=target_user;
  if not found then raise exception 'account_not_found' using errcode = '22023'; end if;
  insert into public.admin_log(admin_id,action,target_user,detail)
  values (v_actor,case when days=-1 then 'member_permanent_ban'
    when days=0 then 'member_unban' else 'member_temporary_ban' end,
    target_user,jsonb_build_object('days',days));
  return v_until;
end;
$$;
revoke all on function public.admin_ban(uuid,integer) from public,anon,authenticated;
grant execute on function public.admin_ban(uuid,integer) to authenticated;

notify pgrst,'reload schema';
