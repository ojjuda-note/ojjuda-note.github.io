-- Registration controls the private catalog. Only an explicit public hide
-- selects the neutral public disguise; it never overwrites the owner's outfit.
set local lock_timeout='4s';
lock table ojjuda_account_internal.member_identity,pajang_private.people in share row exclusive mode;

create function pajang_private.avatar_for_collection(p_avatar jsonb,p_collection text)
returns jsonb language sql immutable set search_path='' as $$
  select case
    when p_collection='male' and jsonb_typeof(p_avatar->'id')='number'
      and (p_avatar->>'id') ~ '^([1-9][0-9]?|100)$'
      then jsonb_set(p_avatar,'{id}',to_jsonb((p_avatar->>'id')::integer+100))
    when p_collection='female' and jsonb_typeof(p_avatar->'id')='number'
      and (p_avatar->>'id') ~ '^(10[1-9]|1[1-9][0-9]|200)$'
      then jsonb_set(p_avatar,'{id}',to_jsonb((p_avatar->>'id')::integer-100))
    else p_avatar end;
$$;
revoke all on function pajang_private.avatar_for_collection(jsonb,text) from public,anon,authenticated,service_role;

create function pajang_private.check_avatar_collection()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  collection text;
  matched jsonb;
begin
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,125));
  end if;
  select i.gender into collection from ojjuda_account_internal.member_identity i
    where i.user_id=new.owner_id and i.gender in ('male','female');
  matched:=pajang_private.avatar_for_collection(new.avatar,collection);
  if tg_op='INSERT' then
    if collection is null and
      (new.avatar->'id' is distinct from '1'::jsonb or new.avatar->>'form' is distinct from 'full') then
      raise exception '가입 성별을 확인한 후 캐릭터를 선택해 주세요.' using errcode='22023';
    end if;
    new.avatar:=matched;
  elsif collection is null then
    if new.avatar->'id' is distinct from old.avatar->'id'
      or new.avatar->'form' is distinct from old.avatar->'form' then
      raise exception '가입 성별을 확인한 후 캐릭터를 선택해 주세요.' using errcode='22023';
    end if;
  elsif new.avatar is distinct from matched then
    raise exception '가입 성별에 맞는 캐릭터를 선택해 주세요.' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function pajang_private.check_avatar_collection() from public,anon,authenticated,service_role;
create trigger check_avatar_collection before insert or update of avatar,owner_id
  on pajang_private.people for each row execute function pajang_private.check_avatar_collection();

-- A late registration or authorized account correction brings existing
-- artwork into the new catalog, keeping the outfit's ordinal, pose and scene.
create function pajang_private.sync_registered_avatar_collection()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.gender in ('male','female') then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,125));
    update pajang_private.people p set avatar=pajang_private.avatar_for_collection(p.avatar,new.gender)
      where p.owner_id=new.user_id and p.avatar is distinct from pajang_private.avatar_for_collection(p.avatar,new.gender);
  end if;
  return new;
end;
$$;
revoke all on function pajang_private.sync_registered_avatar_collection() from public,anon,authenticated,service_role;
create trigger sync_new_registered_avatar after insert on ojjuda_account_internal.member_identity
  for each row execute function pajang_private.sync_registered_avatar_collection();
create trigger sync_corrected_registered_avatar after update of gender on ojjuda_account_internal.member_identity
  for each row when (new.gender is distinct from old.gender) execute function pajang_private.sync_registered_avatar_collection();

update pajang_private.people p set avatar=pajang_private.avatar_for_collection(p.avatar,i.gender)
from ojjuda_account_internal.member_identity i
where i.user_id=p.owner_id and i.gender in ('male','female')
  and p.avatar is distinct from pajang_private.avatar_for_collection(p.avatar,i.gender);

create function pajang_private.public_portrait_id(p_avatar jsonb,p_visible boolean)
returns integer language sql immutable set search_path='' as $$
  select case when p_visible is false then 201 else (p_avatar->>'id')::integer end;
$$;
revoke all on function pajang_private.public_portrait_id(jsonb,boolean) from public,anon,authenticated,service_role;

do $migration$
declare
  change record;
  definition text;
begin
  for change in select * from (values
    ('pajang_private.profile_details(text,jsonb)',
      '  mine pajang_private.people;',
      $new$  mine pajang_private.people;
  avatar_collection text := (select i.gender from ojjuda_account_internal.member_identity i
    where i.user_id=account and i.gender in ('male','female'));$new$,1),
    ('pajang_private.profile_details(text,jsonb)',
      $old$'avatar',mine.avatar,'person',actor$old$,
      $new$'avatar',mine.avatar,'avatarCollection',avatar_collection,'person',actor$new$,2),
    ('public.pajang_member(text,jsonb)',
      $old$'avatarId',mine.avatar->'id'$old$,
      $new$'avatarId',pajang_private.public_portrait_id(mine.avatar,mine.gender_visibility_choice)$new$,1),
    ('public.pajang_member(text,jsonb)',
      $old$m.avatar->'id'$old$,
      'pajang_private.public_portrait_id(m.avatar,m.gender_visibility_choice)',1),
    ('pajang_private.nearby_people(uuid,date,text,pajang_private.locations)',
      $old$m.avatar->'id' as avatar_id$old$,
      'pajang_private.public_portrait_id(m.avatar,m.gender_visibility_choice) as avatar_id',1),
    ('public.pajang_discovery_feed(jsonb,text,text,text)',
      $old$p.avatar->'id' as "avatarId"$old$,
      'pajang_private.public_portrait_id(p.avatar,p.gender_visibility_choice) as "avatarId"',1),
    ('pajang_private.read_public_profile_preferences(uuid)',
      $old$(select p.avatar->'id' from pajang_private.people p where p.id=target)$old$,
      '(select pajang_private.public_portrait_id(p.avatar,p.gender_visibility_choice) from pajang_private.people p where p.id=target)',1)
  ) as patches(signature,previous,replacement,occurrences)
  loop
    definition:=pg_get_functiondef(change.signature::regprocedure);
    if cardinality(string_to_array(definition,change.previous))-1<>change.occurrences then
      raise exception 'Unexpected character projection in %. Reconcile before applying.',change.signature;
    end if;
    execute replace(definition,change.previous,change.replacement);
  end loop;
end;
$migration$;
