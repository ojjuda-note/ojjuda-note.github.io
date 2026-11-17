-- Private profile and reciprocal grants are separate from discovery profiles and chat messages.
create table pajang_private.exchange_profiles (
  person uuid primary key references pajang_private.people(id) on delete cascade,
  fields jsonb not null default '{}' check (jsonb_typeof(fields)='object'),
  show_age boolean not null default false,
  show_gender boolean not null default false
);
create table pajang_private.exchanges (
  first_person uuid not null references pajang_private.people(id) on delete cascade,
  second_person uuid not null references pajang_private.people(id) on delete cascade,
  kind text not null check (kind in ('profile','photos')),
  requester uuid not null,
  accepted boolean not null default false,
  primary key (first_person,second_person,kind),
  check (first_person < second_person and requester in (first_person,second_person))
);
alter table pajang_private.exchange_profiles enable row level security;
alter table pajang_private.exchanges enable row level security;
revoke all on pajang_private.exchange_profiles,pajang_private.exchanges from public,anon,authenticated;

create function pajang_private.exchange_actor() returns uuid
language plpgsql security definer set search_path='' as $$
declare
  account uuid:=ojjuda_restaurants_internal.require_member();
  actor uuid;
begin
  select p.id into actor from pajang_private.people p
  left join ojjuda_account_internal.member_identity i on i.user_id=p.owner_id
  where p.owner_id=account
    and (i.birth_date is null or extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date))>=19);
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception '성인 파장 회원만 이용할 수 있어요.' using errcode='42501';
  end if;
  return actor;
end; $$;

create function pajang_private.exchange_matched(actor uuid,peer uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select pajang_private.clear_pair(actor,peer)
    and exists(select from pajang_private.signals s where s.src=actor and s.dst=peer)
    and exists(select from pajang_private.signals s where s.src=peer and s.dst=actor);
$$;

-- Called by the private photo reader too. Each grant applies to its own kind only.
create function pajang_private.exchange_can_view(viewer uuid, owner_id uuid, wanted_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select pajang_private.exchange_matched(viewer,owner_id)
    and exists(select from pajang_private.exchanges e where e.first_person=least(viewer,owner_id)
      and e.second_person=greatest(viewer,owner_id) and e.kind=wanted_kind and e.accepted)
    and exists(select from pajang_private.messages m where m.src=viewer and m.dst=owner_id offset 4)
    and exists(select from pajang_private.messages m where m.src=owner_id and m.dst=viewer offset 4);
$$;

create function pajang_private.exchange_profile(person_id uuid, own_profile boolean) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'fields',coalesce(p.fields,'{}'::jsonb),
    'age',case when own_profile or p.show_age then
      extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date))::integer end,
    'gender',case when own_profile or p.show_gender then
      case i.gender when 'male' then '남성' when 'female' then '여성' end end
  ) || case when own_profile then jsonb_build_object(
    'showAge',coalesce(p.show_age,false),'showGender',coalesce(p.show_gender,false)) else '{}'::jsonb end
  from pajang_private.people m
  left join pajang_private.exchange_profiles p on p.person=m.id
  left join ojjuda_account_internal.member_identity i on i.user_id=m.owner_id
  where m.id=person_id;
$$;

create function pajang_private.exchange_fields(input jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
  item record;
  txt text;
  result jsonb := '{}';
begin
  if jsonb_typeof(input) is distinct from 'object'
    or input - array['relationship','job','region','religion','height','mbti','bloodType','skills','hobbies','drinking','smoking','bio'] <> '{}' then
    raise exception '프로필 입력 항목을 확인해 주세요.' using errcode='22023';
  end if;
  for item in select key,value from jsonb_each(input) loop
    if item.value='null' then continue; end if;
    if jsonb_typeof(item.value)<>'string' and not (item.key='height' and jsonb_typeof(item.value)='number') then
      raise exception '프로필 입력 형식을 확인해 주세요.' using errcode='22023';
    end if;
    txt:=btrim(item.value #>> '{}');
    if txt='' then continue; end if;
    if char_length(txt)>(case item.key when 'bio' then 1000 when 'skills' then 160 when 'hobbies' then 160 else 80 end) then
      raise exception '프로필 글자 수를 확인해 주세요.' using errcode='22023';
    end if;
    if item.key='relationship' and txt not in ('싱글','돌싱') then
      raise exception '싱글 또는 돌싱을 선택해 주세요.' using errcode='22023';
    elsif item.key='height' then
      if txt !~ '^[0-9]{1,3}$' then raise exception '키를 센티미터 단위로 입력해 주세요.' using errcode='22023'; end if;
      if txt::integer not between 1 and 300 then raise exception '키를 확인해 주세요.' using errcode='22023'; end if;
      result:=result||jsonb_build_object(item.key,txt::integer);
      continue;
    elsif item.key in ('mbti','bloodType') then
      txt:=upper(txt);
      if (item.key='mbti' and txt !~ '^[IE][NS][FT][JP]$') or (item.key='bloodType' and txt not in ('A','B','O','AB')) then
        raise exception '선택한 프로필 값을 확인해 주세요.' using errcode='22023';
      end if;
    end if;
    result:=result||jsonb_build_object(item.key,txt);
  end loop;
  return result;
end; $$;

create function pajang_private.exchange_clear_blocked() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from pajang_private.exchanges e
  where e.first_person=least(new.src,new.dst) and e.second_person=greatest(new.src,new.dst);
  return new;
end; $$;
create trigger exchange_clear_blocked after insert on pajang_private.blocks
for each row execute function pajang_private.exchange_clear_blocked();

revoke all on function pajang_private.exchange_actor(),pajang_private.exchange_matched(uuid,uuid),
  pajang_private.exchange_can_view(uuid,uuid,text),pajang_private.exchange_profile(uuid,boolean),
  pajang_private.exchange_fields(jsonb),pajang_private.exchange_clear_blocked() from public,anon,authenticated;

create function public.pajang_exchange(
  p_action text default 'mine',p_peer uuid default null,p_kind text default null,p_data jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=pajang_private.exchange_actor();
  first_id uuid; second_id uuid;
  my_count bigint; their_count bigint; eligible boolean;
  states jsonb;
begin
  if p_action in ('mine','save') then
    if p_action='save' then
      if jsonb_typeof(p_data) is distinct from 'object' or p_data - array['fields','showAge','showGender'] <> '{}'
        or (p_data ? 'showAge' and jsonb_typeof(p_data->'showAge')<>'boolean')
        or (p_data ? 'showGender' and jsonb_typeof(p_data->'showGender')<>'boolean') then
        raise exception '프로필 입력 형식을 확인해 주세요.' using errcode='22023';
      end if;
      insert into pajang_private.exchange_profiles(person,fields,show_age,show_gender)
        values(actor,pajang_private.exchange_fields(p_data->'fields'),coalesce((p_data->>'showAge')::boolean,false),
          coalesce((p_data->>'showGender')::boolean,false))
      on conflict(person) do update set fields=excluded.fields,show_age=excluded.show_age,show_gender=excluded.show_gender;
    end if;
    return pajang_private.exchange_profile(actor,true);
  end if;
  if p_action is null or p_action not in ('state','request','accept','decline','withdraw','revoke')
    or (p_action<>'state' and (p_kind is null or p_kind not in ('profile','photos'))) then
    raise exception '교환 항목을 확인해 주세요.' using errcode='22023';
  end if;
  if p_peer is null or actor=p_peer then raise exception '이 대화방을 이용할 수 없어요.' using errcode='42501'; end if;
  first_id:=least(actor,p_peer); second_id:=greatest(actor,p_peer);
  if p_action<>'state' then
    -- Same pair lock as blocking, sending a chat message, and responding to a signal.
    perform pg_advisory_xact_lock(hashtextextended(first_id::text||second_id::text,126));
  end if;
  if not pajang_private.exchange_matched(actor,p_peer) then
    raise exception '서로 신호를 보낸 회원만 이용할 수 있어요.' using errcode='42501';
  end if;
  select count(*) into my_count from pajang_private.messages m where m.src=actor and m.dst=p_peer;
  select count(*) into their_count from pajang_private.messages m where m.src=p_peer and m.dst=actor;
  eligible:=my_count>=5 and their_count>=5;
  if p_action in ('request','accept') and not eligible then
    raise exception '두 사람이 각각 메시지를 5개 이상 보내면 교환할 수 있어요.' using errcode='42501';
  end if;
  if p_action='request' then
    insert into pajang_private.exchanges(first_person,second_person,kind,requester)
      values(first_id,second_id,p_kind,actor) on conflict do nothing;
  elsif p_action='accept' then
    update pajang_private.exchanges e set accepted=true where
      e.first_person=first_id and e.second_person=second_id and e.kind=p_kind and e.requester=p_peer;
    if not found then raise exception '받은 교환 요청을 다시 확인해 주세요.' using errcode='42501'; end if;
  elsif p_action in ('withdraw','decline','revoke') then
    delete from pajang_private.exchanges e where e.first_person=first_id and e.second_person=second_id and e.kind=p_kind
      and ((p_action='revoke' and e.accepted) or (not e.accepted and
        ((p_action='withdraw' and e.requester=actor) or (p_action='decline' and e.requester=p_peer))));
  end if;
  select jsonb_build_object('profile','none','photos','none')||coalesce(jsonb_object_agg(e.kind,
      case when e.accepted then 'accepted' when e.requester=actor then 'sent' else 'received' end),'{}'::jsonb) into states
    from pajang_private.exchanges e where e.first_person=first_id and e.second_person=second_id;
  return states||jsonb_build_object('myCount',my_count,'peerCount',their_count,'eligible',eligible,
    'peerProfile',case when eligible and states->>'profile'='accepted' then pajang_private.exchange_profile(p_peer,false) end);
end; $$;
revoke all on function public.pajang_exchange(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pajang_exchange(text,uuid,text,jsonb) to authenticated;
