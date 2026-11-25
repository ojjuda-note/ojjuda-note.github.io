set local lock_timeout='4s';
lock table pajang_private.people in share row exclusive mode;

create table pajang_private.character_ownership (
  owner_id uuid not null references auth.users(id) on delete cascade,
  character_id integer not null check (character_id between 2 and 205 and character_id not in (101,201)),
  primary key(owner_id,character_id)
);
alter table pajang_private.character_ownership enable row level security;
revoke all on pajang_private.character_ownership from public,anon,authenticated,service_role;
-- Keep the outfit each member already wears at launch.
insert into pajang_private.character_ownership(owner_id,character_id)
select owner_id,(avatar->>'id')::integer from pajang_private.people
where (avatar->>'id')::integer not in (1,101,201);

create function pajang_private.can_equip_character(member_id uuid,outfit integer)
returns boolean language sql stable set search_path='' as $$
  select outfit in (1,101) or exists(select 1 from pajang_private.character_ownership
    where owner_id=member_id and character_id=outfit);
$$;
revoke all on function pajang_private.can_equip_character(uuid,integer) from public,anon,authenticated,service_role;

create function pajang_private.check_character_ownership()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not pajang_private.can_equip_character(new.owner_id,(new.avatar->>'id')::integer) then
    raise exception '먼저 캐릭터를 구매해 주세요.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function pajang_private.check_character_ownership() from public,anon,authenticated,service_role;
-- Run after the existing registration/catalog trigger has normalized the ID.
create trigger verify_character_ownership before insert or update of avatar,owner_id on pajang_private.people
for each row execute function pajang_private.check_character_ownership();

create or replace function pajang_private.sync_registered_avatar_collection()
returns trigger language plpgsql security definer set search_path='' as $$
declare current_avatar jsonb; matched jsonb;
begin
  if new.gender in ('male','female') then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,125));
    select avatar into current_avatar from pajang_private.people where owner_id=new.user_id for update;
    matched:=pajang_private.avatar_for_collection(current_avatar,new.gender);
    if matched is distinct from current_avatar then
      if not pajang_private.can_equip_character(new.user_id,(matched->>'id')::integer) then
        matched:=jsonb_set(matched,'{id}',to_jsonb(case when new.gender='male' then 101 else 1 end));
      end if;
      update pajang_private.people set avatar=matched where owner_id=new.user_id;
    end if;
  end if;
  return new;
end;
$$;

create function pajang_private.character_shop_state(member_id uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('ownedCharacters',coalesce(
    (select jsonb_agg(character_id order by character_id) from pajang_private.character_ownership where owner_id=member_id),'[]'::jsonb),
    'characterCoins',(select coins from public.user_private where user_id=member_id));
$$;
revoke all on function pajang_private.character_shop_state(uuid) from public,anon,authenticated,service_role;

do $patch$
declare
  definition text:=pg_get_functiondef('public.pajang_profile_details(text,jsonb)'::regprocedure);
  prev text:=$old$return pajang_private.profile_details(p_action,p_data-'avatarCatalog');$old$;
begin
  if cardinality(string_to_array(definition,prev))<>2 then raise exception 'Unexpected profile wrapper'; end if;
  execute replace(definition,prev,$new$return pajang_private.profile_details(p_action,p_data-'avatarCatalog')
      ||pajang_private.character_shop_state(auth.uid());$new$);
end;
$patch$;

create function public.pajang_character_purchase(p_person uuid,p_character integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid:=pajang_private.require_signal_member();
  collection text;
  balance integer;
  charge integer:=0;
  previous ojjuda_note_internal.spend_requests;
  receipt jsonb;
begin
  if p_request_id is null or p_character is null or p_character not between 2 and 205 or p_character in (101,201) then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(u::text,125));
  perform pajang_private.require_signal_member();
  select i.gender into collection from pajang_private.people p join ojjuda_account_internal.member_identity i on i.user_id=p.owner_id
    where p.owner_id=u and p.id=p_person;
  if not found or collection is null or collection not in ('male','female') or
    pajang_private.avatar_for_collection(jsonb_build_object('id',p_character),collection)->>'id'<>p_character::text then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  select coins into balance from public.user_private where user_id=u for update;
  if not found or balance is null then return jsonb_build_object('ok',false,'reason','wallet'); end if;
  select * into previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if previous.user_id<>u or previous.kind<>'pajang_character_v1'
      or previous.result->>'character' is distinct from p_character::text or previous.result->>'person' is distinct from p_person::text then
      return jsonb_build_object('ok',false,'reason','request_conflict');
    end if;
    return previous.result||jsonb_build_object('charged',0,'coins',balance);
  end if;
  if not pajang_private.can_equip_character(u,p_character) then
    if balance<10 then return jsonb_build_object('ok',false,'reason','coins','coins',balance); end if;
    update public.user_private set coins=coins-10 where user_id=u and coins>=10 returning coins into balance;
    if not found then raise exception '잔액을 다시 확인해 주세요.'; end if;
    insert into pajang_private.character_ownership values(u,p_character);
    charge:=10;
  end if;
  receipt:=jsonb_build_object('ok',true,'character',p_character,'person',p_person,'userId',u,'coins',balance,'charged',charge);
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result)
    values(p_request_id,u,'pajang_character_v1',charge,receipt);
  return receipt;
end;
$$;
revoke all on function public.pajang_character_purchase(uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.pajang_character_purchase(uuid,integer,uuid) to authenticated;
