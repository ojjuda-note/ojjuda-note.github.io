-- Single edit / single transaction for public and exchange-only Pajang details.
-- Existing matching, message-count, consent and private-photo rules are unchanged.
set local lock_timeout = '4s';

do $safety$
declare source_text text := (select p.prosrc from pg_proc p
                             where p.oid = to_regprocedure('pajang_private.profile_details(text,jsonb)'));
begin
  if source_text is null then raise exception 'Pajang profile details procedure not found'; end if;
  if md5(source_text) <> 'e782149cbaa94b2ab662beeaf7784899'
    and position('Unified Pajang profile editing' in source_text) = 0 then
    raise exception 'Pajang profile details changed unexpectedly; review before merging';
  end if;
end;
$safety$;

create or replace function pajang_private.profile_details(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  account uuid := ojjuda_restaurants_internal.require_member();
  actor uuid := pajang_private.exchange_actor();
  mine pajang_private.people;
  preferences jsonb;
  state jsonb;
  saved_profile jsonb;
  taste_patch jsonb;
begin
  if p_action is null or p_action not in ('mine','save') or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception '프로필 요청을 확인해 주세요.' using errcode = '22023';
  end if;
  -- The combined read/save and existing public-profile edits share the member lock.
  perform pg_advisory_xact_lock(hashtextextended(account::text,125));
  select * into mine from pajang_private.people p where p.id = actor and p.owner_id = account;
  if mine.id is null then
    raise exception '현재 프로필을 다시 열어 주세요.' using errcode = '42501';
  end if;

  if p_action = 'mine' then
    -- This endpoint has no peer selector and never reads another member's exchange fields.
    if p_data <> '{}'::jsonb then
      raise exception '프로필 요청을 확인해 주세요.' using errcode = '22023';
    end if;
    preferences := public.pajang_profile_preferences();
    saved_profile := public.pajang_exchange('mine');
    return saved_profile || jsonb_build_object(
      'person',actor,'name',mine.name,'region',mine.region,'interest',mine.interest,
      'preferences',preferences->'preferences','preferencesVersion',preferences->'version');
  end if;

  if p_data - array['profilePerson','name','region','fields','showAge','showGender','interest','preferences','preferencesVersion'] <> '{}'::jsonb then
    raise exception '프로필 입력 항목을 확인해 주세요.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_data->'profilePerson') is distinct from 'string'
    or p_data->>'profilePerson' is distinct from actor::text then
    raise exception '계정이 바뀌었어요. 현재 프로필을 다시 열어 주세요.' using errcode = '42501';
  end if;
  if p_data ? 'interest' and jsonb_typeof(p_data->'interest') is distinct from 'string' then
    raise exception '대표 취향을 확인해 주세요.' using errcode = '22023';
  end if;
  -- Unified Pajang profile editing: public name, location and relationship
  -- intentions save in the same transaction as private exchange fields.
  if (p_data ? 'name' and jsonb_typeof(p_data->'name') is distinct from 'string')
    or (p_data ? 'region' and jsonb_typeof(p_data->'region') is distinct from 'string') then
    raise exception '공개 프로필 입력 형식을 확인해 주세요.' using errcode = '22023';
  end if;
  taste_patch := coalesce(p_data->'preferences','{}'::jsonb);
  if jsonb_typeof(taste_patch) is distinct from 'object'
    or taste_patch - array['relationship_intents','meeting_styles','relationship_values','affection_styles','life_priorities','custom'] <> '{}'::jsonb then
    raise exception '나를 표현하는 취향 항목을 확인해 주세요.' using errcode = '22023';
  end if;

  -- The existing public save validates account ownership and stale edits.
  -- Missing fields from older clients retain the current public name/region.
  state := public.pajang_profile_save(jsonb_build_object(
    'profilePerson',actor,'name',coalesce(p_data->>'name',mine.name),
    'region',coalesce(p_data->>'region',mine.region),
    'interest',coalesce(p_data->>'interest',mine.interest),
    'preferences',taste_patch,'preferencesVersion',p_data->'preferencesVersion'),false);

  -- Do not replace the exchange implementation: its validation, canonical masking
  -- receipt and actual stored fields are returned as-is. Failure rolls back both writes.
  saved_profile := public.pajang_exchange('save',p_data := p_data - array[
    'profilePerson','name','region','interest','preferences','preferencesVersion']);
  return saved_profile || jsonb_build_object(
    'person',actor,'name',state #> '{me,name}','region',state #> '{me,region}',
    'interest',state #> '{me,interest}',
    'preferences',state #> '{me,preferences}',
    'preferencesVersion',state #> '{me,preferencesVersion}');
end;
$function$;

-- CREATE OR REPLACE preserves the prior EXECUTE grant: no additional profile
-- readers gain access to private data, and the invoker RPC wrapper stays intact.
