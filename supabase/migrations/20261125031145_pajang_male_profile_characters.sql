-- Global outfit IDs 1–100 keep their existing meaning; 101–200 select the men's collection.
set local lock_timeout = '4s';

do $check$
begin
  if (select md5(prosrc) from pg_catalog.pg_proc
    where oid = 'public.pajang_profile_details(text,jsonb)'::regprocedure)
    is distinct from 'f465de8f0e9256b6a86cc7ac2dba0b7e' then
    raise exception 'The profile RPC wrapper changed. Reconcile the catalog adapter before applying.';
  end if;
end;
$check$;

alter table pajang_private.people
  drop constraint people_profile_avatar_valid,
  add constraint people_profile_avatar_valid check (
    jsonb_typeof(avatar) = 'object'
    and avatar ?& array['id','form','bg']
    and avatar - array['id','form','bg'] = '{}'::jsonb
    and jsonb_typeof(avatar->'id') = 'number' and (avatar->>'id') ~ '^([1-9][0-9]?|1[0-9]{2}|200)$'
    and jsonb_typeof(avatar->'form') = 'string' and (avatar->>'form') in ('mini','full')
    and jsonb_typeof(avatar->'bg') = 'number' and (avatar->>'bg') ~ '^[0-8]$'
  );

-- Older open editors only understand IDs up to 100, and copy extra properties
-- when they change a selection. The catalogId hint lets them edit a background,
-- choose a different outfit, or save other fields without losing the newer look.
create or replace function public.pajang_profile_details(
  p_action text default 'mine', p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $wrapper$
declare
  previous_avatar jsonb := p_data->'previousAvatar';
  next_avatar jsonb := p_data->'avatar';
  result jsonb;
  selected_id integer;
begin
  if p_data->'avatarCatalog' = '2'::jsonb then
    return pajang_private.profile_details(p_action,p_data - 'avatarCatalog');
  end if;

  if p_action = 'save' and jsonb_typeof(next_avatar) = 'object' then
    if (next_avatar->>'id') !~ '^([1-9][0-9]?|100)$' then
      raise exception '캐릭터 선택을 확인해 주세요.' using errcode = '23514';
    end if;
    if previous_avatar ? 'catalogId' then
      if jsonb_typeof(previous_avatar->'id') is distinct from 'number'
        or (previous_avatar->>'id') !~ '^([1-9][0-9]?|100)$' then
        raise exception '이전 캐릭터를 확인해 주세요.' using errcode = '22023';
      end if;
      selected_id := (previous_avatar->>'id')::integer + 100;
      if previous_avatar->'catalogId' is distinct from to_jsonb(selected_id) then
        raise exception '이전 캐릭터를 확인해 주세요.' using errcode = '22023';
      end if;
      -- Changing only the pose or background keeps the same global outfit ID.
      -- Choosing a different old-catalog outfit explicitly selects that outfit.
      if next_avatar->'id' = previous_avatar->'id' then
        next_avatar := jsonb_set(next_avatar,'{id}',to_jsonb(selected_id));
      end if;
      previous_avatar := jsonb_set(previous_avatar - 'catalogId','{id}',to_jsonb(selected_id));
      p_data := p_data || jsonb_build_object('previousAvatar',previous_avatar,'avatar',next_avatar - 'catalogId');
    end if;
  end if;

  result := pajang_private.profile_details(p_action,p_data);
  selected_id := (result #>> '{avatar,id}')::integer;
  if selected_id > 100 then
    return jsonb_set(result,'{avatar}',(result->'avatar') || jsonb_build_object('id',selected_id-100,'catalogId',selected_id));
  end if;
  return result;
end;
$wrapper$;
