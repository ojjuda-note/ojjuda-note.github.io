-- Optional, self-selected public profile details. Do not infer or backfill choices.
-- Private exchange profiles, account identity and the shared member/purchase RPC stay untouched.
set local lock_timeout = '4s';

create table pajang_private.public_profile_preferences (
  person uuid primary key references pajang_private.people(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  version bigint not null default 1 check (version > 0)
);
alter table pajang_private.public_profile_preferences enable row level security;
revoke all on pajang_private.public_profile_preferences from public, anon, authenticated, service_role;

create function pajang_private.normalize_public_profile_preferences(input jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  choices constant jsonb := '{
    "relationship_intents":["conversation","casual","friendship","dating","marriage"],
    "meeting_styles":["deep_talk","playful_chat","share_worries","dine_together","cafe_talk","neighborhood_walk","park_picnic","food_exploration","new_experiences","exhibitions","films_performances","music_listening","book_talk","exercise_together","light_hiking","nature_seaside","scenic_drives","day_trips","short_travel","cook_together","learn_hobbies","games","relax_at_home","everyday_company"],
    "relationship_values":["trust","honesty","mutual_respect","thoughtful_care","humor","empathy","deep_conversation","everyday_comfort","romance","stability","alone_time","freedom","respect_differences","shared_growth","reliability","mutual_effort","steady_affection","resolve_conflicts","shared_challenges","family_harmony","financial_responsibility","healthy_living","shared_experiences","encouragement"],
    "affection_styles":["check_in_first","frequent_contact","long_conversations","affectionate_words","compliments","gratitude","heartfelt_letters","little_messages","attentive_listening","solve_worries_together","emotional_attunement","make_time","celebrate_dates","remember_preferences","small_gifts","handmade_gifts","cook_for_someone","practical_help","respect_personal_time","celebrate_success","support_goals","offer_rest","holding_hands_hugs","ask_and_care"],
    "life_priorities":["family","friends","pets","partner_time","career","financial_comfort","future_savings","physical_health","emotional_health","enough_sleep","exercise_habit","good_food","learning","creativity","hobbies","travel_experience","stable_routine","free_time","personal_space","life_balance","new_challenges","community","volunteering","nature_environment"]
  }'::jsonb;
  group_name text;
  item jsonb;
  label text;
  selected jsonb;
  custom_selected jsonb;
  group_input jsonb;
  custom_input jsonb;
  result jsonb := '{}'::jsonb;
  custom_result jsonb := '{}'::jsonb;
  -- Match the whitespace removed by JavaScript String.trim, including Korean full-width spaces.
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if jsonb_typeof(input) is distinct from 'object'
    or input - array['relationship_intents','meeting_styles','relationship_values','affection_styles','life_priorities','custom'] <> '{}'::jsonb then
    raise exception '프로필 선택 항목을 확인해 주세요.' using errcode = '22023';
  end if;
  custom_input := coalesce(input->'custom','{}'::jsonb);
  if jsonb_typeof(custom_input) is distinct from 'object'
    or custom_input - array['meeting_styles','relationship_values','affection_styles','life_priorities'] <> '{}'::jsonb then
    raise exception '직접 입력한 프로필 항목을 확인해 주세요.' using errcode = '22023';
  end if;
  for group_name in select jsonb_object_keys(choices) loop
    group_input := coalesce(input->group_name,'[]'::jsonb);
    if jsonb_typeof(group_input) is distinct from 'array' then
      raise exception '프로필 선택 형식을 확인해 주세요.' using errcode = '22023';
    end if;
    if jsonb_array_length(group_input) > (case when group_name = 'relationship_intents' then 5 else 32 end) then
      raise exception '프로필 선택 개수를 확인해 주세요.' using errcode = '22023';
    end if;
    selected := '[]'::jsonb;
    for item in select value from jsonb_array_elements(group_input) loop
      if jsonb_typeof(item) is distinct from 'string' or not ((choices->group_name) ? (item #>> '{}')) then
        raise exception '알 수 없는 프로필 선택 항목이에요.' using errcode = '22023';
      end if;
      label := item #>> '{}';
      if not (selected ? label) then selected := selected || jsonb_build_array(label); end if;
    end loop;
    result := result || jsonb_build_object(group_name,selected);
    if group_name = 'relationship_intents' then continue; end if;

    group_input := coalesce(custom_input->group_name,'[]'::jsonb);
    if jsonb_typeof(group_input) is distinct from 'array' then
      raise exception '직접 입력한 프로필 형식을 확인해 주세요.' using errcode = '22023';
    end if;
    if jsonb_array_length(group_input) > 32 then
      raise exception '한 항목에서 최대 32개까지 고를 수 있어요.' using errcode = '22023';
    end if;
    custom_selected := '[]'::jsonb;
    for item in select value from jsonb_array_elements(group_input) loop
      if jsonb_typeof(item) is distinct from 'string' then
        raise exception '직접 입력한 프로필 형식을 확인해 주세요.' using errcode = '22023';
      end if;
      label := btrim(item #>> '{}',trim_characters);
      if char_length(label) not between 1 and 40 then
        raise exception '직접 입력은 1~40자로 적어 주세요.' using errcode = '22023';
      end if;
      if not (custom_selected ? label) then custom_selected := custom_selected || jsonb_build_array(label); end if;
    end loop;
    if jsonb_array_length(selected) + jsonb_array_length(custom_selected) > 32 then
      raise exception '한 항목에서 최대 32개까지 고를 수 있어요.' using errcode = '22023';
    end if;
    custom_result := custom_result || jsonb_build_object(group_name,custom_selected);
  end loop;
  return result || jsonb_build_object('custom',custom_result);
end;
$function$;

create function pajang_private.read_public_profile_preferences(p_peer uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  entry jsonb := public.pajang_member('entry');
  actor uuid;
  target uuid;
  today date := (entry->>'day')::date;
  current_slot text := entry->>'slot';
  saved pajang_private.public_profile_preferences;
begin
  -- Reuse the current member restriction, anonymous-account and adult eligibility checks.
  if (entry->'joined') is distinct from 'true'::jsonb then
    raise exception '먼저 파장에 참여해 주세요.' using errcode = '42501';
  end if;
  select p.id into strict actor from pajang_private.people p where p.owner_id = auth.uid();
  target := coalesce(p_peer,actor);
  if target <> actor and not (
    exists(select from pajang_private.people p where p.id = target)
    and pajang_private.clear_pair(actor,target)
    and (
      exists(select from pajang_private.visible_answers a
        where a.person = target and a.question_prompt is not null
          and pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,current_slot,a.publication_window_days))
      or exists(select from pajang_private.signals s
        where (s.src = actor and s.dst = target) or (s.src = target and s.dst = actor))
    )
  ) then
    raise exception '이 프로필은 더 이상 볼 수 없어요.' using errcode = '42501';
  end if;
  select * into saved from pajang_private.public_profile_preferences where person = target;
  return jsonb_build_object('person',target,
    'preferences',pajang_private.normalize_public_profile_preferences(coalesce(saved.preferences,'{}'::jsonb)),
    'version',coalesce(saved.version,0));
end;
$function$;

create function pajang_private.save_public_profile_preferences(p_data jsonb,p_setup boolean)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  account uuid := ojjuda_restaurants_internal.require_member();
  previous_person uuid;
  actor uuid;
  state jsonb;
  saved pajang_private.public_profile_preferences;
  previous_preferences jsonb;
  next_preferences jsonb;
  patch jsonb;
  expected_version bigint;
  current_version bigint;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or p_setup is null then
    raise exception '프로필 입력을 확인해 주세요.' using errcode = '22023';
  end if;
  -- Coordinate with all existing member/location mutations, not a parallel lock family.
  perform pg_advisory_xact_lock(hashtextextended(account::text,125));
  select p.id into previous_person from pajang_private.people p where p.owner_id = account;
  if p_data ? 'profilePerson' and p_data->'profilePerson' <> 'null'::jsonb
    and p_data->>'profilePerson' is distinct from previous_person::text then
    raise exception '계정이 바뀌었어요. 현재 프로필을 다시 열어 주세요.' using errcode = '42501';
  end if;
  -- Calling the current RPC preserves current identity, consent, profile, quota and location logic.
  -- Any error below rolls this base-profile mutation back in the same transaction.
  state := public.pajang_member(case when p_setup then 'participate' else 'profile' end,p_data);
  actor := (state #>> '{me,id}')::uuid;
  select * into saved from pajang_private.public_profile_preferences where person = actor for update;
  current_version := coalesce(saved.version,0);
  previous_preferences := pajang_private.normalize_public_profile_preferences(coalesce(saved.preferences,'{}'::jsonb));
  next_preferences := previous_preferences;

  -- Preserve legacy saves and completed first-participation retries, including their selections.
  if p_data ? 'preferences' and not (p_setup and previous_person is not null) then
    patch := p_data->'preferences';
    if jsonb_typeof(patch) is distinct from 'object'
      or jsonb_typeof(p_data->'preferencesVersion') is distinct from 'number'
      or (p_data->>'preferencesVersion') !~ '^(0|[1-9][0-9]{0,15})$' then
      raise exception '프로필 선택 항목과 저장 버전을 확인해 주세요.' using errcode = '22023';
    end if;
    expected_version := (p_data->>'preferencesVersion')::bigint;
    if expected_version > 9007199254740991 then
      raise exception '프로필 저장 버전을 확인해 주세요.' using errcode = '22023';
    end if;
    if expected_version <> current_version then
      raise exception '다른 화면에서 프로필이 바뀌었어요. 프로필을 다시 열어 주세요.' using errcode = 'PT412';
    end if;
    next_preferences := previous_preferences || patch;
    if patch ? 'custom' then
      if jsonb_typeof(patch->'custom') is distinct from 'object' then
        raise exception '직접 입력한 프로필 항목을 확인해 주세요.' using errcode = '22023';
      end if;
      next_preferences := next_preferences || jsonb_build_object('custom',
        (previous_preferences->'custom') || (patch->'custom'));
    end if;
    next_preferences := pajang_private.normalize_public_profile_preferences(next_preferences);
    if next_preferences is distinct from previous_preferences then
      current_version := current_version + 1;
      insert into pajang_private.public_profile_preferences(person,preferences,version)
        values(actor,next_preferences,current_version)
      on conflict(person) do update set preferences = excluded.preferences,version = excluded.version;
    end if;
  end if;
  return jsonb_set(state,'{me}',(state->'me') || jsonb_build_object(
    'preferences',next_preferences,'preferencesVersion',current_version));
end;
$function$;

-- SQL-standard bodies bind the private helpers without opening private-schema USAGE.
-- The helpers still authenticate and authorize every call themselves.
create function public.pajang_profile_preferences(p_peer uuid default null)
returns jsonb language sql security invoker set search_path = ''
return pajang_private.read_public_profile_preferences(p_peer);

create function public.pajang_profile_save(p_data jsonb,p_setup boolean default false)
returns jsonb language sql security invoker set search_path = ''
return pajang_private.save_public_profile_preferences(p_data,p_setup);

revoke all on function pajang_private.normalize_public_profile_preferences(jsonb),
  pajang_private.read_public_profile_preferences(uuid),pajang_private.save_public_profile_preferences(jsonb,boolean),
  public.pajang_profile_preferences(uuid),public.pajang_profile_save(jsonb,boolean)
  from public,anon,authenticated,service_role;
grant execute on function pajang_private.read_public_profile_preferences(uuid),
  pajang_private.save_public_profile_preferences(jsonb,boolean),
  public.pajang_profile_preferences(uuid),public.pajang_profile_save(jsonb,boolean) to authenticated;

-- Extend the existing filter argument so cached three/four-argument clients keep working.
-- Preserve the deployed publication window, moderation, pagination, quota and sorting logic.
-- Fail before replacing the function if any audited anchor has changed.
do $migration$
declare
  definition text := pg_get_functiondef(to_regprocedure('public.pajang_discovery_feed(jsonb,text,text,text)'));
  replacement record;
  occurrences integer;
begin
  for replacement in select * from (values
    ($old$p_interest not in ('all','vinyl','coffee','walk','camera','book','tennis')$old$,
     $new$p_interest not in ('all','vinyl','coffee','walk','camera','book','tennis','conversation','casual','friendship','dating','marriage')$new$),
    ($old$and (p_interest='all' or p.interest=p_interest)$old$,
     $new$and (p_interest='all'
        or (p_interest in ('vinyl','coffee','walk','camera','book','tennis') and p.interest=p_interest)
        or (p_interest in ('conversation','casual','friendship','dating','marriage') and exists (
          select from pajang_private.public_profile_preferences pref
          where pref.person=p.id and (pref.preferences->'relationship_intents') ? p_interest
        )))$new$),
    ($old$select x.*,a.question_prompt as question,a.body,p.name,p.region,p.interest,$old$,
     $new$select x.*,a.question_prompt as question,a.body,p.name,p.region,p.interest,
      coalesce((select pref.preferences->'relationship_intents'
        from pajang_private.public_profile_preferences pref where pref.person=x.peer),'[]'::jsonb) as relationship_intents,$new$)
  ) as replacements(old_text,new_text) loop
    occurrences := (length(definition) - length(replace(definition,replacement.old_text,''))) / length(replacement.old_text);
    if occurrences is distinct from 1 then
      raise exception 'Unexpected Pajang discovery definition; review the changed filter before applying';
    end if;
    definition := replace(definition,replacement.old_text,replacement.new_text);
  end loop;
  execute definition;
end;
$migration$;

comment on table pajang_private.public_profile_preferences is
  'Optional self-selected public Pajang profile choices; no inferred values, no private exchange fields.';
comment on function public.pajang_profile_preferences(uuid) is
  'Read self or an accessible answer/signal peer. Current member eligibility, answer visibility and both block directions apply.';
comment on function public.pajang_profile_save(jsonb,boolean) is
  'Atomically save the existing Pajang profile and optional public choices. Missing groups preserve saved values; arrays clear explicitly; preferencesVersion prevents stale edits.';
