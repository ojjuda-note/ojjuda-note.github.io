-- One active membership per canonical phone number, including phone edits.
create unique index member_identity_phone_number_key
  on ojjuda_account_internal.member_identity(phone_number);

create function ojjuda_account_internal.enforce_unique_member_phone()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  new.phone_number := ojjuda_account_internal.normalize_phone(new.phone_number);
  if exists(select 1 from ojjuda_account_internal.member_identity m
    where m.phone_number=new.phone_number and m.user_id<>new.user_id) then
    raise exception 'phone_already_registered' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function ojjuda_account_internal.enforce_unique_member_phone() from public,anon,authenticated;
create trigger enforce_unique_member_phone before insert or update of phone_number
  on ojjuda_account_internal.member_identity
  for each row execute function ojjuda_account_internal.enforce_unique_member_phone();

-- Only HMAC digests are retained for abuse limits, never submitted identity details.
create table ojjuda_account_internal.recovery_attempts (
  bucket_key text primary key,
  window_started timestamptz not null,
  attempts integer not null check(attempts>0)
);
alter table ojjuda_account_internal.recovery_attempts enable row level security;
revoke all on ojjuda_account_internal.recovery_attempts from public,anon,authenticated;

create function ojjuda_account_internal.check_member_recovery(
  p_email text,p_phone text,p_birth_date text,p_gender text,p_ip_hash text,p_email_hash text)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare v_now timestamptz := clock_timestamp(); v_key text; v_limit integer;
  v_count integer; v_allowed boolean := true; v_phone text; v_birth date;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$'
    or p_email_hash is null or p_email_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_recovery_request' using errcode='22023';
  end if;
  delete from ojjuda_account_internal.recovery_attempts where window_started < v_now-interval '1 day';
  -- Consistent lock order; the global bucket also bounds creation of per-input rows.
  for v_key,v_limit in select * from (values
    ('0:global',200),('1:ip:'||p_ip_hash,20),('2:email:'||p_email_hash,5)) as limits(k,n)
  loop
    insert into ojjuda_account_internal.recovery_attempts as a(bucket_key,window_started,attempts)
    values(v_key,v_now,1)
    on conflict(bucket_key) do update set
      attempts=case when a.window_started<=v_now-interval '15 minutes' then 1 else least(a.attempts+1,1000000) end,
      window_started=case when a.window_started<=v_now-interval '15 minutes' then v_now else a.window_started end
    returning attempts into v_count;
    if v_count>v_limit then v_allowed := false; end if;
    if v_key='0:global' and not v_allowed then return 'limited'; end if;
  end loop;
  if not v_allowed then return 'limited'; end if;
  if p_email is null or char_length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_gender is null or p_gender not in ('male','female')
    or p_birth_date is null or p_birth_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return 'unmatched'; end if;
  begin
    v_phone := ojjuda_account_internal.normalize_phone(p_phone);
    v_birth := p_birth_date::date;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_parameter_value then
    return 'unmatched';
  end;
  if exists(select 1 from auth.users u join ojjuda_account_internal.member_identity m on m.user_id=u.id
    where lower(u.email)=lower(btrim(p_email)) and m.phone_number=v_phone
      and m.birth_date=v_birth and m.gender=p_gender
      and (u.banned_until is null or u.banned_until<=v_now)) then
    return 'matched';
  end if;
  return 'unmatched';
end;
$$;
create function public.check_member_recovery(
  p_email text,p_phone text,p_birth_date text,p_gender text,p_ip_hash text,p_email_hash text)
returns text language sql security invoker set search_path=pg_catalog as $$
  select ojjuda_account_internal.check_member_recovery(p_email,p_phone,p_birth_date,p_gender,p_ip_hash,p_email_hash);
$$;
revoke all on function ojjuda_account_internal.check_member_recovery(text,text,text,text,text,text),
  public.check_member_recovery(text,text,text,text,text,text) from public,anon,authenticated;
grant usage on schema ojjuda_account_internal to service_role;
grant execute on function ojjuda_account_internal.check_member_recovery(text,text,text,text,text,text),
  public.check_member_recovery(text,text,text,text,text,text) to service_role;
notify pgrst,'reload schema';
