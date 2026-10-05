-- Members may change only their own contact number; birth and gender remain locked.
create function ojjuda_account_internal.normalize_phone(p_phone text)
returns text language plpgsql immutable set search_path = pg_catalog as $$
declare v_phone text;
begin
  if p_phone is null or btrim(p_phone) !~ '^(\+82[[:space:]-]?)?[0-9][0-9[:space:]-]*$' then
    raise exception 'invalid_phone_number' using errcode = '22023';
  end if;
  v_phone := regexp_replace(btrim(p_phone), '[[:space:]-]', '', 'g');
  if left(v_phone,3) = '+82' then v_phone := '0' || substring(v_phone,4); end if;
  if v_phone !~ '^(010[0-9]{8}|01[16789][0-9]{7,8}|02[0-9]{7,8}|0([3-6][1-5]|70)[0-9]{7,8})$' then
    raise exception 'invalid_phone_number' using errcode = '22023';
  end if;
  return v_phone;
end;
$$;
revoke all on function ojjuda_account_internal.normalize_phone(text) from public, anon, authenticated;

create function ojjuda_account_internal.update_my_phone_number(p_phone text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_uid uuid := auth.uid(); v_phone text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  v_phone := ojjuda_account_internal.normalize_phone(p_phone);
  update ojjuda_account_internal.member_identity set phone_number = v_phone where user_id = v_uid;
  if not found then raise exception 'member_identity_required' using errcode = '42501'; end if;
  return ojjuda_account_internal.get_my_member_identity();
end;
$$;

create function public.update_my_phone_number(p_phone text)
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select ojjuda_account_internal.update_my_phone_number(p_phone);
$$;

revoke all on function ojjuda_account_internal.update_my_phone_number(text), public.update_my_phone_number(text) from public, anon, authenticated;
grant execute on function ojjuda_account_internal.update_my_phone_number(text), public.update_my_phone_number(text) to authenticated;
notify pgrst, 'reload schema';
