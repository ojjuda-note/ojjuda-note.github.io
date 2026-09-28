-- Private member identity. Resident-number inputs are transient, never table columns.
create schema if not exists ojjuda_account_internal;
revoke all on schema ojjuda_account_internal from public, anon, authenticated;
grant usage on schema ojjuda_account_internal to authenticated;

create table ojjuda_account_internal.member_identity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null,
  gender text not null check (gender in ('male', 'female')),
  phone_number text not null,
  age_at_signup smallint not null check (age_at_signup between 0 and 150),
  recorded_at timestamptz not null default now(),
  consent_version text not null,
  source text not null default 'self_reported' check (source = 'self_reported')
);
alter table ojjuda_account_internal.member_identity enable row level security;
revoke all on ojjuda_account_internal.member_identity from public, anon, authenticated;

create function ojjuda_account_internal.age_on(p_birth date, p_today date)
returns integer language sql immutable strict set search_path = pg_catalog as $$
  select extract(year from p_today)::integer - extract(year from p_birth)::integer
    - case when to_char(p_today, 'MMDD') < to_char(p_birth, 'MMDD') then 1 else 0 end;
$$;

create function ojjuda_account_internal.parse_identity(
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
  if p_enforce_age and (v_age < 15 or v_age >= 70) then
    raise exception 'signup_age_15_to_69_required' using errcode = '22023';
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

create function ojjuda_account_internal.lock_member_identity()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.user_id is distinct from old.user_id or new.birth_date is distinct from old.birth_date
    or new.gender is distinct from old.gender or new.age_at_signup is distinct from old.age_at_signup
    or new.recorded_at is distinct from old.recorded_at or new.source is distinct from old.source then
    raise exception 'member_identity_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger member_identity_immutable before update on ojjuda_account_internal.member_identity
for each row execute function ojjuda_account_internal.lock_member_identity();

create function ojjuda_account_internal.capture_signup_identity()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_info jsonb; v_meta jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
begin
  -- A database trigger also rejects direct Auth API calls that bypass the form.
  if coalesce(new.email,'') = '' or coalesce(new.encrypted_password,'') = '' then
    raise exception 'email_password_signup_required' using errcode = '22023';
  end if;
  if v_meta->>'age_15_to_69' is distinct from 'true' or nullif(v_meta->>'terms_version','') is null then
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

create function ojjuda_account_internal.get_my_member_identity()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select jsonb_build_object('birth_date',m.birth_date,'gender',m.gender,'phone_number',m.phone_number,
    'age_at_signup',m.age_at_signup,'age',ojjuda_account_internal.age_on(m.birth_date,(now() at time zone 'Asia/Seoul')::date),
    'source',m.source,'locked',true)
  into v_result from ojjuda_account_internal.member_identity m where m.user_id = v_uid;
  return v_result;
end;
$$;

create function ojjuda_account_internal.complete_my_member_identity(
  p_birth_six text,p_gender_code text,p_phone text,p_consent boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_uid uuid := auth.uid(); v_info jsonb; v_joined date; v_age integer;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_consent is distinct from true then raise exception 'identity_consent_required' using errcode = '22023'; end if;
  if exists(select 1 from ojjuda_account_internal.member_identity where user_id=v_uid) then
    raise exception 'member_identity_locked' using errcode='42501';
  end if;
  -- Existing accounts register information once; a new signup's age limit does not suspend existing memberships.
  v_info := ojjuda_account_internal.parse_identity(p_birth_six,p_gender_code,p_phone,
    (clock_timestamp() at time zone 'Asia/Seoul')::date,false);
  select (created_at at time zone 'Asia/Seoul')::date into strict v_joined from auth.users where id=v_uid;
  v_age := ojjuda_account_internal.age_on((v_info->>'birth_date')::date,v_joined);
  if v_age < 0 then raise exception 'invalid_birth_date' using errcode='22023'; end if;
  insert into ojjuda_account_internal.member_identity(user_id,birth_date,gender,phone_number,age_at_signup,consent_version)
  values(v_uid,(v_info->>'birth_date')::date,v_info->>'gender',v_info->>'phone_number',v_age,'2026-09-29');
  return ojjuda_account_internal.get_my_member_identity();
exception when unique_violation then
  raise exception 'member_identity_locked' using errcode='42501';
end;
$$;

-- Public wrappers execute with caller rights; privileged implementations remain in an unexposed schema.
create function public.get_my_member_identity()
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  select ojjuda_account_internal.get_my_member_identity();
$$;
create function public.complete_my_member_identity(p_birth_six text,p_gender_code text,p_phone text,p_consent boolean)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
  select ojjuda_account_internal.complete_my_member_identity(p_birth_six,p_gender_code,p_phone,p_consent);
$$;

create function ojjuda_account_internal.set_card_gender(p_gender text)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare v_uid uuid := auth.uid(); v_gender text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  select gender into v_gender from ojjuda_account_internal.member_identity where user_id=v_uid;
  if v_gender is null then raise exception 'member_identity_required' using errcode='42501'; end if;
  if p_gender is null or p_gender not in (v_gender,'private') then
    raise exception 'registered_gender_or_private_only' using errcode='22023';
  end if;
  insert into ojjuda_note_internal.member_gender(user_id,gender,updated_at) values(v_uid,p_gender,now())
  on conflict(user_id) do update set gender=excluded.gender,updated_at=now();
  return p_gender;
end;
$$;
create or replace function ojjuda_note.set_my_gender(p_gender text)
returns text language sql security invoker set search_path=pg_catalog as $$
  select ojjuda_account_internal.set_card_gender(p_gender);
$$;
create or replace function ojjuda_note.get_my_gender()
returns text language sql stable security invoker set search_path=pg_catalog as $$
  select coalesce(ojjuda_account_internal.get_my_member_identity()->>'gender','private');
$$;
create or replace function ojjuda_note_internal.record_card_gender()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_gender text; v_choice text;
begin
  select gender into v_choice from ojjuda_note_internal.member_gender where user_id=new.author_id;
  if auth.uid() is not null then
    select gender into v_gender from ojjuda_account_internal.member_identity where user_id=new.author_id;
    if v_gender is null then raise exception 'member_identity_required' using errcode='42501'; end if;
    v_choice := case when v_choice='private' then 'private' else v_gender end;
  end if;
  insert into ojjuda_note_internal.card_gender(card_id,gender) values(new.id,coalesce(v_choice,'private'))
  on conflict(card_id) do nothing;
  return new;
end;
$$;

revoke all on all functions in schema ojjuda_account_internal from public,anon,authenticated;
grant execute on function ojjuda_account_internal.get_my_member_identity() to authenticated;
grant execute on function ojjuda_account_internal.complete_my_member_identity(text,text,text,boolean) to authenticated;
grant execute on function ojjuda_account_internal.set_card_gender(text) to authenticated;
revoke all on function public.get_my_member_identity(),public.complete_my_member_identity(text,text,text,boolean),
  ojjuda_note.get_my_gender(),ojjuda_note.set_my_gender(text) from public,anon;
grant execute on function public.get_my_member_identity(),public.complete_my_member_identity(text,text,text,boolean),
  ojjuda_note.get_my_gender(),ojjuda_note.set_my_gender(text) to authenticated;
revoke all on function ojjuda_note_internal.record_card_gender() from public,anon,authenticated;

create trigger capture_signup_identity after insert on auth.users
for each row execute function ojjuda_account_internal.capture_signup_identity();
notify pgrst,'reload schema';
