-- The existing age checkbox applies after exchange acceptance. One gender choice
-- governs both the member-facing border and the accepted exchange profile.
set local lock_timeout='5s';
lock table pajang_private.people,pajang_private.exchange_profiles in share row exclusive mode;

alter table pajang_private.exchange_profiles
  alter column show_age set default true,
  alter column show_gender set default true;

-- Retain an opt-out from either legacy control when combining the settings.
update pajang_private.people m set gender_visibility_choice=false
from pajang_private.exchange_profiles p
where p.person=m.id and not p.show_gender and m.gender_visibility_choice is distinct from false;
update pajang_private.exchange_profiles p set show_gender=false
from pajang_private.people m where m.id=p.person and m.gender_visibility_choice is false and p.show_gender;

do $migration$
declare
  part record;
  src text;
begin
  for part in select * from (values
    ('pajang_private.exchange_profile(uuid,boolean)',
     'own_profile or p.show_age then','own_profile or coalesce(p.show_age,true) then'),
    ('pajang_private.exchange_profile(uuid,boolean)',
     'own_profile or (p.show_gender and m.gender_visibility_choice is distinct from false) then',
     'own_profile or m.gender_visibility_choice is distinct from false then'),
    ('pajang_private.exchange_profile(uuid,boolean)',
     '''showAge'',coalesce(p.show_age,false),''showGender'',coalesce(p.show_gender,false)',
     '''showAge'',coalesce(p.show_age,true),''showGender'',m.gender_visibility_choice is distinct from false'),
    ('public.pajang_exchange(text,uuid,text,jsonb)',
     'insert into pajang_private.exchange_profiles(person,fields,show_age,show_gender)',
     'perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,125));
      if p_data ? ''showGender'' and (p_data->>''showGender'')::boolean is distinct from
        (select gender_visibility_choice is distinct from false from pajang_private.people where id=actor) then
        perform public.pajang_discovery_visibility((p_data->>''showGender'')::boolean);
      end if;
      insert into pajang_private.exchange_profiles(person,fields,show_age,show_gender)'),
    ('public.pajang_exchange(text,uuid,text,jsonb)',
     'coalesce((p_data->>''showAge'')::boolean,false)',
     'coalesce((p_data->>''showAge'')::boolean,true)'),
    ('public.pajang_exchange(text,uuid,text,jsonb)',
     'coalesce((p_data->>''showGender'')::boolean,false)',
     '(select gender_visibility_choice is distinct from false from pajang_private.people where id=actor)'),
    ('public.pajang_exchange(text,uuid,text,jsonb)',
     'show_age=excluded.show_age,show_gender=excluded.show_gender',
     'show_age=case when p_data ? ''showAge'' then excluded.show_age else exchange_profiles.show_age end,show_gender=excluded.show_gender'),
    ('public.pajang_discovery_visibility(boolean)',
     'update pajang_private.people set gender_visibility_choice=p_visible where id=actor;',
     'update pajang_private.people set gender_visibility_choice=p_visible where id=actor;
     update pajang_private.exchange_profiles set show_gender=p_visible where person=actor and show_gender is distinct from p_visible;')
  ) as changes(signature,old_text,new_text)
  loop
    src:=pg_get_functiondef(part.signature::regprocedure);
    if cardinality(string_to_array(src,part.old_text))<>2 then
      raise exception 'Unexpected visibility definition in %',part.signature;
    end if;
    execute replace(src,part.old_text,part.new_text);
  end loop;
end;
$migration$;
