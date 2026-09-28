-- Administrative corrections do not unlock identity fields for ordinary members.
create or replace function ojjuda_account_internal.lock_member_identity()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.user_id is distinct from old.user_id or new.recorded_at is distinct from old.recorded_at
    or new.source is distinct from old.source then
    raise exception 'member_identity_locked' using errcode = '42501';
  end if;
  if (new.birth_date is distinct from old.birth_date or new.gender is distinct from old.gender
      or new.age_at_signup is distinct from old.age_at_signup)
    and not coalesce(public.is_admin(),false) then
    raise exception 'member_identity_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function ojjuda_account_internal.admin_get_member_identity(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  select jsonb_build_object('user_id',u.id,'registered',m.user_id is not null,
    'birth_date',m.birth_date,'gender',m.gender,'age_at_signup',m.age_at_signup,
    'age',ojjuda_account_internal.age_on(m.birth_date,(now() at time zone 'Asia/Seoul')::date),
    'joined_date',(u.created_at at time zone 'Asia/Seoul')::date,
    'phone_masked',case when m.phone_number is null then null else
      (case when left(m.phone_number,2)='02' then '02' else left(m.phone_number,3) end)
      || '-****-' || right(m.phone_number,4) end)
  into v_result from auth.users u left join ojjuda_account_internal.member_identity m on m.user_id=u.id
  where u.id=p_user;
  if not found then raise exception 'member_not_found' using errcode = '22023'; end if;
  return v_result;
end;
$$;

create function ojjuda_account_internal.admin_update_member_identity(
  p_user uuid,p_birth_date date,p_gender text,p_phone text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_joined date; v_age integer; v_phone text; v_old ojjuda_account_internal.member_identity%rowtype;
  v_fields text[] := array[]::text[];
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_birth_date is null or p_birth_date < date '1900-01-01'
    or p_birth_date > (clock_timestamp() at time zone 'Asia/Seoul')::date then
    raise exception 'invalid_birth_date' using errcode = '22023';
  end if;
  if p_gender is null or p_gender not in ('male','female') then
    raise exception 'invalid_gender' using errcode = '22023';
  end if;
  select (created_at at time zone 'Asia/Seoul')::date into v_joined from auth.users where id=p_user;
  if not found then raise exception 'member_not_found' using errcode = '22023'; end if;
  v_age := ojjuda_account_internal.age_on(p_birth_date,v_joined);
  if v_age not between 0 and 150 then raise exception 'invalid_birth_date' using errcode = '22023'; end if;
  select * into v_old from ojjuda_account_internal.member_identity where user_id=p_user for update;
  v_phone := case when nullif(btrim(p_phone),'') is null then v_old.phone_number
    else ojjuda_account_internal.normalize_phone(p_phone) end;
  if v_phone is null then raise exception 'invalid_phone_number' using errcode = '22023'; end if;
  if v_old.birth_date is distinct from p_birth_date then v_fields := array_append(v_fields,'birth_date'); end if;
  if v_old.gender is distinct from p_gender then v_fields := array_append(v_fields,'gender'); end if;
  if v_old.phone_number is distinct from v_phone then v_fields := array_append(v_fields,'phone_number'); end if;
  insert into ojjuda_account_internal.member_identity(user_id,birth_date,gender,phone_number,age_at_signup,consent_version)
  values(p_user,p_birth_date,p_gender,v_phone,v_age,'admin-correction-2026-09-29')
  on conflict(user_id) do update set birth_date=excluded.birth_date,gender=excluded.gender,
    phone_number=excluded.phone_number,age_at_signup=excluded.age_at_signup;
  update ojjuda_note_internal.member_gender set gender=p_gender,updated_at=now()
    where user_id=p_user and gender<>'private';
  if cardinality(v_fields)>0 then
    perform public.admin_note('member_identity_edit',p_user,null,
      jsonb_build_object('fields',to_jsonb(v_fields),'initial_registration',v_old.user_id is null));
  end if;
  return ojjuda_account_internal.admin_get_member_identity(p_user);
end;
$$;

create function ojjuda_account_internal.admin_reveal_member_phone(p_user uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_phone text; v_reason text := btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if char_length(v_reason)<5 or char_length(v_reason)>200 then
    raise exception 'emergency_reason_required' using errcode = '22023';
  end if;
  select phone_number into v_phone from ojjuda_account_internal.member_identity where user_id=p_user;
  if not found then raise exception 'member_identity_required' using errcode = '22023'; end if;
  -- Audit must succeed before the only administrator endpoint returning the full number responds.
  perform public.admin_note('member_phone_emergency',p_user,null,jsonb_build_object('reason',v_reason));
  return jsonb_build_object('phone_number',v_phone);
end;
$$;

create function public.admin_get_member_identity(p_user uuid)
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select ojjuda_account_internal.admin_get_member_identity(p_user);
$$;
create function public.admin_update_member_identity(p_user uuid,p_birth_date date,p_gender text,p_phone text default null)
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select ojjuda_account_internal.admin_update_member_identity(p_user,p_birth_date,p_gender,p_phone);
$$;
create function public.admin_reveal_member_phone(p_user uuid,p_reason text)
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select ojjuda_account_internal.admin_reveal_member_phone(p_user,p_reason);
$$;

revoke all on function ojjuda_account_internal.admin_get_member_identity(uuid),
  ojjuda_account_internal.admin_update_member_identity(uuid,date,text,text),
  ojjuda_account_internal.admin_reveal_member_phone(uuid,text),
  public.admin_get_member_identity(uuid),public.admin_update_member_identity(uuid,date,text,text),
  public.admin_reveal_member_phone(uuid,text) from public,anon,authenticated;
grant execute on function ojjuda_account_internal.admin_get_member_identity(uuid),
  ojjuda_account_internal.admin_update_member_identity(uuid,date,text,text),
  ojjuda_account_internal.admin_reveal_member_phone(uuid,text),
  public.admin_get_member_identity(uuid),public.admin_update_member_identity(uuid,date,text,text),
  public.admin_reveal_member_phone(uuid,text) to authenticated;
notify pgrst, 'reload schema';
