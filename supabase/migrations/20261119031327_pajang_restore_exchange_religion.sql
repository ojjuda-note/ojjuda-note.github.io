-- Restore the optional religion field without changing saved rows, consent, or access.
-- Match the deployed retirement blocks only; keep decimal heights and all other checks.
set local lock_timeout = '4s';

do $migration$
declare
  fields_definition text := pg_get_functiondef('pajang_private.exchange_fields(jsonb)'::regprocedure);
  profile_definition text := pg_get_functiondef('pajang_private.exchange_profile(uuid,boolean)'::regprocedure);
  retired_fields text := $retired$  -- Ignore the retired key from clients that still have the old form open.
  input := input - 'religion';
  if input - array['relationship','job','region','height','mbti','bloodType','skills','hobbies','drinking','smoking','bio'] <> '{}' then$retired$;
  restored_fields text := $restored$  if input - array['relationship','job','region','religion','height','mbti','bloodType','skills','hobbies','drinking','smoking','bio'] <> '{}' then$restored$;
  restored_allowlist text := $allowlist$array['relationship','job','region','religion','height','mbti','bloodType','skills','hobbies','drinking','smoking','bio']$allowlist$;
  retired_output text := $retired$'fields',coalesce(p.fields,'{}'::jsonb) - 'religion',$retired$;
  restored_output text := $restored$'fields',coalesce(p.fields,'{}'::jsonb),$restored$;
  retired_helper oid := to_regprocedure('pajang_private.protect_retired_exchange_field()');
  trigger_helper oid;
begin
  -- Fail before changing anything if either targeted function or trigger has drifted.
  if position(retired_fields in fields_definition)>0 then
    fields_definition := replace(fields_definition,retired_fields,restored_fields);
  elsif position(restored_allowlist in fields_definition)=0
    or position($strip$input := input - 'religion';$strip$ in fields_definition)>0 then
    raise exception 'Unexpected exchange field validator; review before restoring religion';
  end if;

  if position(retired_output in profile_definition)>0 then
    profile_definition := replace(profile_definition,retired_output,restored_output);
  elsif position(restored_output in profile_definition)=0 then
    raise exception 'Unexpected exchange profile output; review before restoring religion';
  end if;

  if retired_helper is not null and
    (select md5(prosrc) from pg_proc where oid=retired_helper) is distinct from '988bfd7340b6d8be95284f93ff69883c' then
    raise exception 'Unexpected retired exchange field helper; review before removing it';
  end if;
  select tgfoid into trigger_helper from pg_trigger
    where tgrelid='pajang_private.exchange_profiles'::regclass
      and tgname='protect_retired_exchange_field' and not tgisinternal;
  if trigger_helper is not null and trigger_helper is distinct from retired_helper then
    raise exception 'Unexpected retired exchange field trigger; review before removing it';
  end if;

  -- CREATE OR REPLACE retains the existing function ownership and grants.
  execute fields_definition;
  execute profile_definition;
  drop trigger if exists protect_retired_exchange_field on pajang_private.exchange_profiles;
  drop function if exists pajang_private.protect_retired_exchange_field();
end;
$migration$;
