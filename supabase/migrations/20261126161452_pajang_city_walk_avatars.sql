-- City Walk adds one outfit per registered catalog. 201 remains the public-only disguise.
set local lock_timeout='4s';

alter table pajang_private.people
  drop constraint people_profile_avatar_valid,
  add constraint people_profile_avatar_valid check (
    jsonb_typeof(avatar) = 'object'
    and avatar ?& array['id','form','bg']
    and avatar - array['id','form','bg'] = '{}'::jsonb
    and jsonb_typeof(avatar->'id') = 'number' and (avatar->>'id') ~ '^([1-9][0-9]?|1[0-9]{2}|200|20[2-7])$'
    and jsonb_typeof(avatar->'form') = 'string' and (avatar->>'form') in ('mini','full')
    and jsonb_typeof(avatar->'bg') = 'number' and (avatar->>'bg') ~ '^[0-8]$'
  );

alter table pajang_private.character_ownership
  drop constraint character_ownership_character_id_check,
  add constraint character_ownership_character_id_check
    check (character_id between 2 and 207 and character_id not in (101,201));

create or replace function pajang_private.legacy_avatar_id(outfit integer, catalog integer)
returns integer language sql immutable set search_path='' as $$
  select case
    when catalog>=4 or (catalog=3 and outfit<=205) then outfit
    when outfit in (202,204,206) then 1
    when outfit in (203,205,207) then case when catalog>=2 then 101 else 1 end
    when catalog=1 and outfit between 101 and 200 then outfit-100
    else outfit end;
$$;

-- Preserve the deployed wallet, request-id, ownership, moderation and profile-save checks.
-- Refuse a partial update if the catalog anchors have changed since review.
do $migration$
declare
  patch record;
  definition text;
begin
  for patch in select * from (values
    ('pajang_private.avatar_for_collection(jsonb,text)',
      $old$in ('202'::jsonb,'204'::jsonb)$old$,
      $new$in ('202'::jsonb,'204'::jsonb,'206'::jsonb)$new$),
    ('pajang_private.avatar_for_collection(jsonb,text)',
      $old$in ('203'::jsonb,'205'::jsonb)$old$,
      $new$in ('203'::jsonb,'205'::jsonb,'207'::jsonb)$new$),
    ('public.pajang_character_purchase(uuid,integer,uuid)',
      'p_character not between 2 and 205','p_character not between 2 and 207'),
    ('public.pajang_profile_details(text,jsonb)',
      $old$catalog integer:=case when p_data->'avatarCatalog'='2'::jsonb then 2 else 1 end;$old$,
      $new$catalog integer:=case p_data->'avatarCatalog' when '3'::jsonb then 3 when '2'::jsonb then 2 else 1 end;$new$),
    ('public.pajang_profile_details(text,jsonb)',
      $old$if p_data->'avatarCatalog'='3'::jsonb then$old$,
      $new$if p_data->'avatarCatalog'='4'::jsonb then$new$),
    ('public.pajang_profile_details(text,jsonb)',
      'if catalog=2 then','if catalog in (2,3) then'),
    ('public.pajang_profile_details(text,jsonb)',
      $old$(next_avatar->>'id') !~ '^([1-9][0-9]?|1[0-9]{2}|200)$'
      or (catalog=1 and (next_avatar->>'id')::integer>100)$old$,
      $new$(next_avatar->>'id') !~ '^([1-9][0-9]?|1[0-9]{2}|200|20[2-5])$'
      or (next_avatar->>'id')::integer <> pajang_private.legacy_avatar_id((next_avatar->>'id')::integer,catalog)$new$),
    ('public.pajang_profile_details(text,jsonb)',
      $old$(previous_avatar->>'catalogId') !~ '^(10[1-9]|1[1-9][0-9]|200|20[2-5])$'$old$,
      $new$(previous_avatar->>'catalogId') !~ '^(10[1-9]|1[1-9][0-9]|200|20[2-7])$'$new$),
    ('public.pajang_profile_details(text,jsonb)',
      $old$result:=pajang_private.profile_details(p_action,p_data);$old$,
      $new$result:=pajang_private.profile_details(p_action,p_data);
  if catalog=3 then
    result:=result||pajang_private.character_shop_state(auth.uid());
  end if;$new$)
  ) as changes(signature,before_text,after_text)
  loop
    definition:=pg_get_functiondef(patch.signature::regprocedure);
    if cardinality(string_to_array(definition,patch.before_text))<>2 then
      raise exception 'Unexpected City Walk catalog definition in %',patch.signature;
    end if;
    execute replace(definition,patch.before_text,patch.after_text);
  end loop;
end;
$migration$;
