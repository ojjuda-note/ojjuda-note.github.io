-- Apply the same five-item budget to presets and custom entries in each taste list.
-- Existing rows stay intact when read or when an unchanged profile is saved.
create function pajang_private.normalize_public_profile_preferences(input jsonb, reject_excess boolean)
returns jsonb language plpgsql stable set search_path = '' as $function$
declare
  prefs jsonb := pajang_private.normalize_public_profile_preferences(input);
  category text;
  preset_count integer;
begin
  foreach category in array array['meeting_styles','relationship_values','affection_styles','life_priorities'] loop
    preset_count := jsonb_array_length(prefs->category);
    if preset_count + jsonb_array_length(prefs->'custom'->category) <= 5 then continue; end if;
    if reject_excess then
      raise exception '한 목록에서 최대 5개까지 고를 수 있어요.' using errcode='22023';
    end if;
    -- Preserve the stored order within presets, followed by the stored order of custom entries.
    prefs := jsonb_set(prefs,array[category],(select coalesce(jsonb_agg(item order by pos),'[]'::jsonb)
      from jsonb_array_elements(prefs->category) with ordinality as preset(item,pos) where pos<=5));
    prefs := jsonb_set(prefs,array['custom',category],(select coalesce(jsonb_agg(item order by pos),'[]'::jsonb)
      from jsonb_array_elements(prefs->'custom'->category) with ordinality as custom(item,pos) where pos<=5-preset_count));
  end loop;
  return prefs;
end;
$function$;
revoke all on function pajang_private.normalize_public_profile_preferences(jsonb,boolean) from public,anon,authenticated,service_role;

do $migration$
declare
  change record;
  definition text;
begin
  for change in select * from (values
    ('pajang_private.read_public_profile_preferences(uuid)','coalesce(saved.preferences,''{}''::jsonb)','false'),
    ('pajang_private.save_public_profile_preferences(jsonb,boolean)','coalesce(saved.preferences,''{}''::jsonb)','false'),
    ('pajang_private.save_public_profile_preferences(jsonb,boolean)','next_preferences','true')
  ) as edits(signature,argument,reject_excess) loop
    definition := pg_get_functiondef(change.signature::regprocedure);
    if cardinality(string_to_array(definition,'pajang_private.normalize_public_profile_preferences('||change.argument||')'))<>2 then
      raise exception 'Unexpected preferences function: %', change.signature;
    end if;
    execute replace(definition,'pajang_private.normalize_public_profile_preferences('||change.argument||')',
      'pajang_private.normalize_public_profile_preferences('||change.argument||','||change.reject_excess||')');
  end loop;
end;
$migration$;
