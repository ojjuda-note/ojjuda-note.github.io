-- Preserve all existing selections and reserve 201 for the public tree disguise.
set local lock_timeout='4s';

alter table pajang_private.people
  drop constraint people_profile_avatar_valid,
  add constraint people_profile_avatar_valid check (
    jsonb_typeof(avatar) = 'object'
    and avatar ?& array['id','form','bg']
    and avatar - array['id','form','bg'] = '{}'::jsonb
    and jsonb_typeof(avatar->'id') = 'number' and (avatar->>'id') ~ '^([1-9][0-9]?|1[0-9]{2}|200|20[2-5])$'
    and jsonb_typeof(avatar->'form') = 'string' and (avatar->>'form') in ('mini','full')
    and jsonb_typeof(avatar->'bg') = 'number' and (avatar->>'bg') ~ '^[0-8]$'
  );

create or replace function pajang_private.avatar_for_collection(p_avatar jsonb,p_collection text)
returns jsonb language sql immutable set search_path='' as $$
  select case
    when p_collection='male' and jsonb_typeof(p_avatar->'id')='number'
      and (p_avatar->>'id') ~ '^([1-9][0-9]?|100)$'
      then jsonb_set(p_avatar,'{id}',to_jsonb((p_avatar->>'id')::integer+100))
    when p_collection='female' and jsonb_typeof(p_avatar->'id')='number'
      and (p_avatar->>'id') ~ '^(10[1-9]|1[1-9][0-9]|200)$'
      then jsonb_set(p_avatar,'{id}',to_jsonb((p_avatar->>'id')::integer-100))
    when p_collection='male' and p_avatar->'id' in ('202'::jsonb,'204'::jsonb)
      then jsonb_set(p_avatar,'{id}',to_jsonb((p_avatar->>'id')::integer+1))
    when p_collection='female' and p_avatar->'id' in ('203'::jsonb,'205'::jsonb)
      then jsonb_set(p_avatar,'{id}',to_jsonb((p_avatar->>'id')::integer-1))
    else p_avatar end;
$$;

-- Older clients can still save other settings and change the pose or scene.
-- The hint retains the canonical outfit for optimistic concurrency checks.
create or replace function pajang_private.legacy_avatar_id(outfit integer, catalog integer)
returns integer language sql immutable set search_path='' as $$
  select case
    when outfit in (202,204) then 1
    when outfit in (203,205) then case when catalog=2 then 101 else 1 end
    when catalog=1 and outfit between 101 and 200 then outfit-100
    else outfit end;
$$;
revoke all on function pajang_private.legacy_avatar_id(integer,integer) from public,anon,authenticated,service_role;

create or replace function public.pajang_profile_details(
  p_action text default 'mine', p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  previous_avatar jsonb:=p_data->'previousAvatar';
  next_avatar jsonb:=p_data->'avatar';
  result jsonb;
  outfit integer;
  legacy_id integer;
  catalog integer:=case when p_data->'avatarCatalog'='2'::jsonb then 2 else 1 end;
begin
  if p_data->'avatarCatalog'='3'::jsonb then
    return pajang_private.profile_details(p_action,p_data-'avatarCatalog');
  end if;
  if catalog=2 then
    p_data:=p_data-'avatarCatalog';
  end if;
  if p_action='save' and jsonb_typeof(next_avatar)='object' then
    if jsonb_typeof(next_avatar->'id') is distinct from 'number'
      or (next_avatar->>'id') !~ '^([1-9][0-9]?|1[0-9]{2}|200)$'
      or (catalog=1 and (next_avatar->>'id')::integer>100) then
      raise exception '캐릭터 선택을 확인해 주세요.' using errcode='23514';
    end if;
    if previous_avatar ? 'catalogId' then
      if jsonb_typeof(previous_avatar->'catalogId') is distinct from 'number'
        or (previous_avatar->>'catalogId') !~ '^(10[1-9]|1[1-9][0-9]|200|20[2-5])$' then
        raise exception '이전 캐릭터를 확인해 주세요.' using errcode='22023';
      end if;
      outfit:=(previous_avatar->>'catalogId')::integer;
      legacy_id:=pajang_private.legacy_avatar_id(outfit,catalog);
      if outfit=legacy_id or previous_avatar->'id' is distinct from to_jsonb(legacy_id) then
        raise exception '이전 캐릭터를 확인해 주세요.' using errcode='22023';
      end if;
      if next_avatar->'id'=previous_avatar->'id' then
        next_avatar:=jsonb_set(next_avatar,'{id}',to_jsonb(outfit));
      end if;
      previous_avatar:=jsonb_set(previous_avatar-'catalogId','{id}',to_jsonb(outfit));
      p_data:=p_data||jsonb_build_object('previousAvatar',previous_avatar,'avatar',next_avatar-'catalogId');
    end if;
  end if;
  result:=pajang_private.profile_details(p_action,p_data);
  outfit:=(result#>>'{avatar,id}')::integer;
  legacy_id:=pajang_private.legacy_avatar_id(outfit,catalog);
  if legacy_id<>outfit then
    result:=jsonb_set(result,'{avatar}',(result->'avatar')||jsonb_build_object('id',legacy_id,'catalogId',outfit));
  end if;
  return result;
end;
$$;
