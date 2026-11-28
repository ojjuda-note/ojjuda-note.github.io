-- The member's stored hide choice is authoritative across all Pajang member views.
create function pajang_private.visible_member_gender(p_person uuid)
returns text language sql stable security invoker set search_path='' as $$
  select i.gender::text
  from pajang_private.people p
  join ojjuda_account_internal.member_identity i on i.user_id=p.owner_id
  where p.id=p_person and p.gender_visibility_choice is distinct from false
    and i.gender in ('male','female');
$$;
revoke all on function pajang_private.visible_member_gender(uuid) from public,anon,authenticated,service_role;

-- Preserve the existing entry, adult, block, location, and answer-window checks.
-- Match each hunk against the installed definition before changing the projection.
do $migration$
declare
  src text;
  change record;
  pending text := 'mine.id is not null and mine.gender_visibility_choice is null and exists(select from ojjuda_account_internal.member_identity i where i.user_id=u and i.gender in (''male'',''female''))';
begin
  for change in select * from (values
    ('public.pajang_member(text,jsonb)', '''genderSharePending'',' || pending || ',', '', 2),
    ('public.pajang_member(text,jsonb)',
      'if p_action in (''join'',''participate'',''answer'') and (' || pending || ')
       and p_data->''shareAccountGender''=''true''::jsonb then
       perform public.pajang_discovery_visibility(true);
       mine.gender_visibility_choice:=true;
     end if;', '', 1),
    ('pajang_private.read_public_profile_preferences(uuid)',
     '(select i.gender from pajang_private.people p
         join ojjuda_account_internal.member_identity i on i.user_id=p.owner_id
         join pajang_private.discovery_gender_opt_ins o on o.person=p.id
         where p.id=target and p.gender_visibility_choice is true)',
     'pajang_private.visible_member_gender(target)', 1),
    ('public.pajang_discovery_visibility(boolean)',
     'select exists(select from pajang_private.discovery_gender_opt_ins o where o.person=actor) into enabled;',
     'select gender_visibility_choice is distinct from false into enabled from pajang_private.people where id=actor;', 1),
    ('public.pajang_discovery_feed(jsonb,text,text,text)',
     'exists (
        select from pajang_private.discovery_gender_opt_ins opt
        join ojjuda_account_internal.member_identity i on i.user_id=p.owner_id and i.gender=p_gender
        where opt.person=p.id
      )',
     'pajang_private.visible_member_gender(p.id)=p_gender', 1),
    ('public.pajang_discovery_feed(jsonb,text,text,text)',
     'a.body,p.name,p.region,p.interest,',
     'a.body,p.name,p.region,p.interest,pajang_private.visible_member_gender(p.id) as gender,', 1),
    ('public.pajang_member(text,jsonb)',
     '''id'',m.id,''name'',m.name,',
     '''id'',m.id,''name'',m.name,''gender'',pajang_private.visible_member_gender(m.id),', 1),
    ('public.pajang_member(text,jsonb)',
     '''id'',mine.id,''name'',mine.name,',
     '''id'',mine.id,''name'',mine.name,''gender'',pajang_private.visible_member_gender(mine.id),', 1),
    ('pajang_private.nearby_people(uuid,date,text,pajang_private.locations)',
     '''id'',g.id,''name'',g.name,',
     '''id'',g.id,''name'',g.name,''gender'',pajang_private.visible_member_gender(g.id),', 1)
  ) as patch(signature,before_src,after_src,expected_count)
  loop
    src:=pg_get_functiondef(change.signature::regprocedure);
    if cardinality(string_to_array(src,change.before_src))<>change.expected_count+1 then
      raise exception 'Unexpected member gender definition in %',change.signature;
    end if;
    execute replace(src,change.before_src,change.after_src);
  end loop;
end;
$migration$;
