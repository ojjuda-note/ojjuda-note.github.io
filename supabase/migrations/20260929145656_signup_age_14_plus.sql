-- Align signup with the 14-and-over consent; keep legacy clients compatible.

create or replace function ojjuda_account_internal.parse_identity(
  p_birth_six text, p_gender_code text, p_phone text, p_day date, p_enforce_age boolean)
returns jsonb language plpgsql immutable set search_path = pg_catalog as $$
declare v_birth date; v_age integer; v_phone text;
begin
  if p_birth_six is null or p_birth_six !~ '^[0-9]{6}$'
     or p_gender_code is null or p_gender_code !~ '^[1-4]$' then
    raise exception 'invalid_birth_or_gender_code' using errcode = '22023';
  end if;
  begin
    v_birth := make_date((case when p_gender_code in ('1','2') then 1900 else 2000 end)
      + substring(p_birth_six,1,2)::integer,
      substring(p_birth_six,3,2)::integer, substring(p_birth_six,5,2)::integer);
  exception when datetime_field_overflow then
    raise exception 'invalid_birth_date' using errcode = '22023';
  end;
  if p_day is null or v_birth > p_day then
    raise exception 'invalid_birth_date' using errcode = '22023';
  end if;
  v_age := ojjuda_account_internal.age_on(v_birth, p_day);
  if p_enforce_age and v_age < 14 then
    raise exception 'signup_age_14_or_older_required' using errcode = '22023';
  end if;
  v_phone := regexp_replace(coalesce(p_phone,''), '[[:space:]-]', '', 'g');
  if left(v_phone,3) = '+82' then v_phone := '0' || substring(v_phone,4); end if;
  if v_phone !~ '^(010[0-9]{8}|01[16789][0-9]{7,8}|02[0-9]{7,8}|0([3-6][1-5]|70)[0-9]{7,8})$' then
    raise exception 'invalid_phone_number' using errcode = '22023';
  end if;
  return jsonb_build_object('birth_date',v_birth,'gender',case when p_gender_code in ('1','3') then 'male' else 'female' end,
    'phone_number',v_phone,'age',v_age);
end;
$$;

create or replace function ojjuda_account_internal.capture_signup_identity()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_info jsonb; v_meta jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
begin
  -- A database trigger also rejects direct Auth API calls that bypass the form.
  if coalesce(new.email,'') = '' or coalesce(new.encrypted_password,'') = '' then
    raise exception 'email_password_signup_required' using errcode = '22023';
  end if;
  -- Accept the previous consent field during rollout; birth date is still validated.
  if coalesce(v_meta->>'age_14_or_older', v_meta->>'age_15_to_69') is distinct from 'true' or nullif(v_meta->>'terms_version','') is null then
    raise exception 'signup_consent_required' using errcode = '22023';
  end if;
  v_info := ojjuda_account_internal.parse_identity(v_meta->>'birth_yymmdd',v_meta->>'gender_code',
    v_meta->>'phone_number',(clock_timestamp() at time zone 'Asia/Seoul')::date,true);
  insert into ojjuda_account_internal.member_identity(user_id,birth_date,gender,phone_number,age_at_signup,consent_version)
  values(new.id,(v_info->>'birth_date')::date,v_info->>'gender',v_info->>'phone_number',(v_info->>'age')::smallint,v_meta->>'terms_version');
  -- Do not retain input digits or phone in editable Auth metadata / future JWTs.
  update auth.users set raw_user_meta_data = raw_user_meta_data - array['birth_yymmdd','gender_code','phone_number','birth_date','gender']
    where id = new.id;
  return new;
end;
$$;

revoke all on function ojjuda_account_internal.parse_identity(text,text,text,date,boolean) from public,anon,authenticated;
revoke all on function ojjuda_account_internal.capture_signup_identity() from public,anon,authenticated;
