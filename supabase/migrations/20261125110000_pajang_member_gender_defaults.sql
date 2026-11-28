-- Keep the existing discovery index so old and new clients see the same filter.
-- NULL records the default, while false records a member's explicit choice to hide.
lock table pajang_private.people, pajang_private.discovery_gender_opt_ins in share row exclusive mode;
alter table pajang_private.people add column gender_visibility_choice boolean;

-- The old positive-only list records filter visibility, not affirmative profile
-- sharing. Existing members can publish under the new scope with their next answer.
update pajang_private.people p set gender_visibility_choice=false
where exists (select from pajang_private.exchange_profiles e where e.person=p.id and not e.show_gender);

-- Patch the existing member checks in place so all adult eligibility, blocks and
-- time-window rules stay in the same transaction as the original join.
do $migration$
declare
  f regprocedure;
  src text;
  item record;
  pending text := 'mine.id is not null and mine.gender_visibility_choice is null and exists(select from ojjuda_account_internal.member_identity i where i.user_id=u and i.gender in (''male'',''female''))';
begin
  for item in select * from (values
    ('public.pajang_member(text,jsonb)',
     '''joined'',mine.id is not null,''nickname'',display_name,''age'',known_age,',
     '''joined'',mine.id is not null,''nickname'',display_name,''age'',known_age,
      ''genderSharePending'',' || pending || ',
      ''accountGender'',(select i.gender from ojjuda_account_internal.member_identity i where i.user_id=u),'),
    ('public.pajang_member(text,jsonb)',
     'if mine.id is null then raise exception ''먼저 파장에 참여해 주세요.''',
     'if p_action in (''join'',''participate'',''answer'') and (' || pending || ')
       and p_data->''shareAccountGender''=''true''::jsonb then
       perform public.pajang_discovery_visibility(true);
       mine.gender_visibility_choice:=true;
     end if;
     if mine.id is null then raise exception ''먼저 파장에 참여해 주세요.'''),
    ('public.pajang_member(text,jsonb)',
     '''authenticated'',true,''me'',pr,',
     '''genderSharePending'',' || pending || ',''authenticated'',true,''me'',pr,'),
    ('public.pajang_discovery_visibility(boolean)',
     '''hasGender'',linked)',
     '''hasGender'',linked,''hidden'',(select gender_visibility_choice is false from pajang_private.people where id=actor))'),
    ('public.pajang_discovery_visibility(boolean)',
     'if p_visible is true then',
     'if p_visible is not null then
     update pajang_private.people set gender_visibility_choice=p_visible where id=actor;
   end if;
   if p_visible is true then'),
    ('pajang_private.read_public_profile_preferences(uuid)',
     '''preferences'',pajang_private.normalize_public_profile_preferences',
     '''gender'',(select i.gender from pajang_private.people p
         join ojjuda_account_internal.member_identity i on i.user_id=p.owner_id
         join pajang_private.discovery_gender_opt_ins o on o.person=p.id
         where p.id=target and p.gender_visibility_choice is true),
      ''preferences'',pajang_private.normalize_public_profile_preferences'),
    ('pajang_private.exchange_profile(uuid,boolean)',
     'own_profile or p.show_gender then',
     'own_profile or (p.show_gender and m.gender_visibility_choice is distinct from false) then')
  ) as changes(signature,old_text,new_text)
  loop
    f:=item.signature::regprocedure;
    src:=pg_get_functiondef(f);
    if cardinality(string_to_array(src,item.old_text))<>2 then
      raise exception 'Unexpected definition for %',f;
    end if;
    execute replace(src,item.old_text,item.new_text);
  end loop;
end;
$migration$;
