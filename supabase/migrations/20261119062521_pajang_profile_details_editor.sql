-- Move the editing location without changing public/private storage or disclosure rules.
-- Delegate to current RPCs so masking receipts, decimal heights and exchange consent stay intact.
set local lock_timeout = '4s';

-- Public introduction edits no longer include the representative picture/interest.
-- Fill an omitted interest from the locked, current profile; an explicit empty string still clears it.
do $migration$
declare
  definition text := pg_get_functiondef(to_regprocedure('pajang_private.save_public_profile_preferences(jsonb,boolean)'));
  anchor text := $old$  state := public.pajang_member(case when p_setup then 'participate' else 'profile' end,p_data);$old$;
  replacement text := $new$  if not (p_data ? 'interest') and previous_person is not null then
    p_data := p_data || jsonb_build_object('interest',
      (select p.interest from pajang_private.people p where p.id = previous_person));
  end if;
  state := public.pajang_member(case when p_setup then 'participate' else 'profile' end,p_data);$new$;
  occurrences integer;
begin
  occurrences := (length(definition) - length(replace(definition,anchor,''))) / length(anchor);
  if occurrences is distinct from 1 or position('not (p_data ? ''interest'')' in definition) > 0 then
    raise exception 'Unexpected Pajang profile save definition; review the omitted-interest patch';
  end if;
  execute replace(definition,anchor,replacement);
end;
$migration$;

create function pajang_private.profile_details(p_action text,p_data jsonb)
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
      'person',actor,'interest',mine.interest,
      'preferences',preferences->'preferences','preferencesVersion',preferences->'version');
  end if;

  if p_data - array['profilePerson','fields','showAge','showGender','interest','preferences','preferencesVersion'] <> '{}'::jsonb then
    raise exception '프로필 입력 항목을 확인해 주세요.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_data->'profilePerson') is distinct from 'string'
    or p_data->>'profilePerson' is distinct from actor::text then
    raise exception '계정이 바뀌었어요. 현재 프로필을 다시 열어 주세요.' using errcode = '42501';
  end if;
  if p_data ? 'interest' and jsonb_typeof(p_data->'interest') is distinct from 'string' then
    raise exception '대표 취향을 확인해 주세요.' using errcode = '22023';
  end if;
  taste_patch := coalesce(p_data->'preferences','{}'::jsonb);
  if jsonb_typeof(taste_patch) is distinct from 'object'
    or taste_patch - array['meeting_styles','relationship_values','affection_styles','life_priorities','custom'] <> '{}'::jsonb then
    raise exception '나를 표현하는 취향 항목을 확인해 주세요.' using errcode = '22023';
  end if;

  -- Keep current name/region and patch only the four public taste groups.
  -- The existing save validates preferencesVersion even for an empty taste patch.
  -- Neither a stale client name/region nor relationship_intents can reach this payload.
  state := public.pajang_profile_save(jsonb_build_object(
    'profilePerson',actor,'name',mine.name,'region',mine.region,
    'interest',coalesce(p_data->>'interest',mine.interest),
    'preferences',taste_patch,'preferencesVersion',p_data->'preferencesVersion'),false);

  -- Do not replace the exchange implementation: its validation, canonical masking
  -- receipt and actual stored fields are returned as-is. Failure rolls back both writes.
  saved_profile := public.pajang_exchange('save',p_data := p_data - array[
    'profilePerson','interest','preferences','preferencesVersion']);
  return saved_profile || jsonb_build_object(
    'person',actor,'interest',state #> '{me,interest}',
    'preferences',state #> '{me,preferences}',
    'preferencesVersion',state #> '{me,preferencesVersion}');
end;
$function$;

create function public.pajang_profile_details(p_action text default 'mine',p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = ''
return pajang_private.profile_details(p_action,p_data);

revoke all on function pajang_private.profile_details(text,jsonb),public.pajang_profile_details(text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function pajang_private.profile_details(text,jsonb),public.pajang_profile_details(text,jsonb)
  to authenticated;

comment on function public.pajang_profile_details(text,jsonb) is
  'Own profile editor only. Atomically saves private exchange fields and the existing public taste groups/picture; preserves current public name, region, relationship intents and all disclosure/consent rules.';
