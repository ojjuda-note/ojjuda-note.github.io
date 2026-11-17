-- Retire a profile field from new entry and all exchange responses.
create or replace function pajang_private.exchange_profile(person_id uuid, own_profile boolean) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'fields',coalesce(p.fields,'{}'::jsonb) - 'religion',
    'age',case when own_profile or p.show_age then
      extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date))::integer end,
    'gender',case when own_profile or p.show_gender then
      case i.gender when 'male' then '남성' when 'female' then '여성' end end
  ) || case when own_profile then jsonb_build_object(
    'showAge',coalesce(p.show_age,false),'showGender',coalesce(p.show_gender,false)) else '{}'::jsonb end
  from pajang_private.people m
  left join pajang_private.exchange_profiles p on p.person=m.id
  left join ojjuda_account_internal.member_identity i on i.user_id=m.owner_id
  where m.id=person_id;
$$;

create or replace function pajang_private.exchange_fields(input jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
  item record;
  txt text;
  result jsonb := '{}';
begin
  if jsonb_typeof(input) is distinct from 'object' then
    raise exception '프로필 입력 항목을 확인해 주세요.' using errcode='22023';
  end if;
  -- Ignore the retired key from clients that still have the old form open.
  input := input - 'religion';
  if input - array['relationship','job','region','height','mbti','bloodType','skills','hobbies','drinking','smoking','bio'] <> '{}' then
    raise exception '프로필 입력 항목을 확인해 주세요.' using errcode='22023';
  end if;
  for item in select key,value from jsonb_each(input) loop
    if item.value='null' then continue; end if;
    if jsonb_typeof(item.value)<>'string' and not (item.key='height' and jsonb_typeof(item.value)='number') then
      raise exception '프로필 입력 형식을 확인해 주세요.' using errcode='22023';
    end if;
    txt:=btrim(item.value #>> '{}');
    if txt='' then continue; end if;
    if char_length(txt)>(case item.key when 'bio' then 1000 when 'skills' then 160 when 'hobbies' then 160 else 80 end) then
      raise exception '프로필 글자 수를 확인해 주세요.' using errcode='22023';
    end if;
    if item.key='relationship' and txt not in ('싱글','돌싱') then
      raise exception '싱글 또는 돌싱을 선택해 주세요.' using errcode='22023';
    elsif item.key='height' then
      if txt !~ '^[0-9]{1,3}$' then raise exception '키를 센티미터 단위로 입력해 주세요.' using errcode='22023'; end if;
      if txt::integer not between 1 and 300 then raise exception '키를 확인해 주세요.' using errcode='22023'; end if;
      result:=result||jsonb_build_object(item.key,txt::integer);
      continue;
    elsif item.key in ('mbti','bloodType') then
      txt:=upper(txt);
      if (item.key='mbti' and txt !~ '^[IE][NS][FT][JP]$') or (item.key='bloodType' and txt not in ('A','B','O','AB')) then
        raise exception '선택한 프로필 값을 확인해 주세요.' using errcode='22023';
      end if;
    end if;
    result:=result||jsonb_build_object(item.key,txt);
  end loop;
  return result;
end; $$;

-- Existing saved values are not erased by this migration or by an unrelated profile edit.
-- Normal deliberate profile deletion and account deletion remain unchanged.
create function pajang_private.protect_retired_exchange_field() returns trigger
language plpgsql set search_path='' as $$
begin
  new.fields := new.fields - 'religion';
  if tg_op='UPDATE' and old.fields ? 'religion' then
    new.fields := new.fields || jsonb_build_object('religion',old.fields->'religion');
  end if;
  return new;
end; $$;
revoke all on function pajang_private.protect_retired_exchange_field() from public,anon,authenticated;

create trigger protect_retired_exchange_field
before insert or update of fields on pajang_private.exchange_profiles
for each row execute function pajang_private.protect_retired_exchange_field();
