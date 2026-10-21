-- Private, server-authoritative poker. Practice chips never touch any account wallet.
create schema ojjuda_poker_internal;
revoke all on schema ojjuda_poker_internal from public,anon,authenticated;
grant usage on schema ojjuda_poker_internal to service_role;
create table ojjuda_poker_internal.rooms (
 id uuid primary key default gen_random_uuid(),code text not null unique,
 host_id uuid not null,members uuid[] not null,names text[] not null,
 title text not null check(char_length(title) between 1 and 40),capacity integer not null check(capacity between 2 and 4),
 status text not null default 'waiting' check(status in ('waiting','active','finished','closed')),
 state jsonb,version integer not null default 0,round integer not null default 0,
 requests uuid[] not null default '{}',create_request uuid not null,
 departed boolean[] not null default '{false}',ready boolean[] not null default '{false}',
 deadline timestamptz,created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '30 minutes'),
 unique(host_id,create_request),check(cardinality(members) between 0 and 4 and cardinality(members)=cardinality(names))
);
create index poker_room_members on ojjuda_poker_internal.rooms using gin(members) where status in ('waiting','active','finished');
create index poker_room_host_created on ojjuda_poker_internal.rooms(host_id,created_at desc);
alter table ojjuda_poker_internal.rooms enable row level security;
revoke all on ojjuda_poker_internal.rooms from public,anon,authenticated,service_role;

create function ojjuda_poker_internal.check_member(p_actor uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare birth date;
begin
 if p_actor is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=p_actor and not coalesce(u.is_anonymous,false)) then raise exception 'not_signed_in';end if;
 if public.is_banned(p_actor) then raise exception 'banned';end if;
 select birth_date into birth from ojjuda_account_internal.member_identity where user_id=p_actor;
 if birth is null then raise exception 'member_identity_required';end if;
 if ojjuda_account_internal.age_on(birth,(clock_timestamp() at time zone 'Asia/Seoul')::date)<19 then raise exception 'adult_required';end if;
end;
$$;
revoke all on function ojjuda_poker_internal.check_member(uuid) from public,anon,authenticated,service_role;

create function ojjuda_poker_internal.room_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_request uuid default null,p_expected integer default null,p_options jsonb default '{}',p_next jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r ojjuda_poker_internal.rooms%rowtype; existing uuid; seat integer; nick text; cap integer; title_value text; n integer; m uuid; phase text;
begin
 perform ojjuda_poker_internal.check_member(p_actor);
 if p_action is null or p_action not in ('list','mine','create','join','read','start','commit','ready','leave') then raise exception 'invalid_request';end if;
 if jsonb_typeof(p_options) is distinct from 'object' or octet_length(p_options::text)>1024 then raise exception 'invalid_options';end if;
 if p_action='list' then
  return jsonb_build_object('rooms',coalesce((select jsonb_agg(card) from (
   select jsonb_build_object('code',q.code,'title',q.title,'players',cardinality(q.members),'capacity',q.capacity) card
   from ojjuda_poker_internal.rooms q where q.status='waiting' and q.expires_at>clock_timestamp()
   and cardinality(q.members)<q.capacity
   and not exists(select 1 from unnest(q.members) member where public.blocked_between(p_actor,member) or public.is_banned(member))
   order by q.created_at desc limit 30) available),'[]'::jsonb));
 end if;
 if p_action in ('mine','create','join') then
  perform pg_advisory_xact_lock(hashtextextended('poker:'||p_actor::text,0));
  select id into existing from ojjuda_poker_internal.rooms where members @> array[p_actor] and status in ('waiting','active','finished') and not departed[array_position(members,p_actor)] and expires_at>clock_timestamp() order by created_at desc limit 1;
  if p_action='mine' then
   if existing is null then return jsonb_build_object('room',null);end if;
   select * into r from ojjuda_poker_internal.rooms where id=existing;
   return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1);
  end if;
 end if;
 if p_action='create' then
  if p_request is null then raise exception 'invalid_request';end if;
  select * into r from ojjuda_poker_internal.rooms where host_id=p_actor and create_request=p_request;
  if found then return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1);end if;
  if existing is not null then raise exception 'room_in_progress';end if;
  if (select count(*) from ojjuda_poker_internal.rooms where host_id=p_actor and created_at>clock_timestamp()-interval '1 minute')>=5 then raise exception 'room_rate_limit';end if;
  cap:=(p_options->>'capacity')::integer;title_value:=btrim(p_options->>'title');
  if cap is null or cap not between 2 and 4 or title_value is null or char_length(title_value) not between 1 and 40 then raise exception 'invalid_options';end if;
  select left(regexp_replace(coalesce(nullif(btrim(nickname),''),'회원'),'[[:cntrl:]<>]','','g'),12) into nick from public.profiles where id=p_actor;
  for n in 1..5 loop
   begin
    insert into ojjuda_poker_internal.rooms(code,host_id,members,names,title,capacity,create_request)
     values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),p_actor,array[p_actor],array[nick],title_value,cap,p_request) returning * into r;
    exit;
   exception when unique_violation then if n=5 then raise;end if;
   end;
  end loop;
 else
  if p_action='join' then select * into r from ojjuda_poker_internal.rooms where code=upper(p_code) for update;
  else select * into r from ojjuda_poker_internal.rooms where id=p_room and members @> array[p_actor] for update;end if;
  if r.id is null then raise exception 'room_not_found';end if;
  seat:=array_position(r.members,p_actor);
  if r.expires_at<=clock_timestamp() or r.status='closed' then raise exception 'room_unavailable';end if;
  if seat is not null and r.departed[seat] then raise exception 'room_unavailable';end if;
  if p_action='join' and seat is null then
   if existing is not null then raise exception 'room_in_progress';end if;
   if r.status<>'waiting' then raise exception 'room_unavailable';end if;
   if cardinality(r.members)>=r.capacity then raise exception 'room_full';end if;
   if exists(select 1 from unnest(r.members) member where public.blocked_between(p_actor,member)) then raise exception 'room_unavailable';end if;
   foreach m in array r.members loop perform ojjuda_poker_internal.check_member(m);end loop;
   select left(regexp_replace(coalesce(nullif(btrim(nickname),''),'회원'),'[[:cntrl:]<>]','','g'),12) into nick from public.profiles where id=p_actor;
   update ojjuda_poker_internal.rooms set members=array_append(members,p_actor),names=array_append(names,nick),departed=array_append(departed,false),ready=array_append(ready,false),version=version+1 where id=r.id returning * into r;
  elsif p_action in ('start','commit','ready','leave') then
   if p_request is null then raise exception 'invalid_request';end if;
   if not (p_request=any(r.requests)) then
    if r.version is distinct from p_expected then raise exception 'state_conflict';end if;
    if p_action='start' then
     if r.status<>'waiting' or r.host_id<>p_actor then raise exception 'not_room_owner';end if;
     if cardinality(r.members)<2 then raise exception 'need_players';end if;
     foreach m in array r.members loop perform ojjuda_poker_internal.check_member(m);end loop;
    elsif p_action='commit' then
     if r.status<>'active' then raise exception 'room_unavailable';end if;
     if p_next->>'kind'='timeout' then
      if r.deadline>clock_timestamp() then raise exception 'not_your_turn';end if;
     elsif (r.state->>'turn')::integer is distinct from seat-1 then raise exception 'not_your_turn';end if;
    elsif p_action='ready' then
     if r.status<>'finished' or true=any(r.departed) then raise exception 'room_unavailable';end if;
     r.ready[seat]:=true;
     if not (false=any(r.ready)) then
      foreach m in array r.members loop perform ojjuda_poker_internal.check_member(m);end loop;
     elsif p_next->'state' is not null and p_next->'state'<>'null'::jsonb then raise exception 'invalid_request';end if;
    elsif p_action='leave' then
     if r.status='waiting' then
      r.members:=array_remove(r.members,p_actor);
      r.names:=array(select name from unnest(r.names) with ordinality x(name,idx) where idx<>seat order by idx);
      r.departed:=array_fill(false,array[cardinality(r.members)]);r.ready:=r.departed;
      r.host_id:=coalesce(r.members[1],r.host_id);
      if cardinality(r.members)=0 then r.status:='closed';end if;
     else
      r.departed[seat]:=true;
      if not (false=any(r.departed)) then r.status:='closed';end if;
     end if;
    end if;
    if p_next->'state' is not null and p_next->'state'<>'null'::jsonb then
     if jsonb_typeof(p_next->'state') is distinct from 'object' or octet_length(p_next::text)>32768
       or jsonb_array_length(p_next->'state'->'players') is distinct from cardinality(r.members) then raise exception 'invalid_request';end if;
     r.state:=p_next->'state';phase:=r.state->>'phase';
     if r.status<>'closed' then r.status:=case when phase='finished' then 'finished' else 'active' end;end if;
     if p_action in ('start','ready') then r.round:=r.round+1;r.ready:=array_fill(false,array[cardinality(r.members)]);end if;
     r.deadline:=clock_timestamp()+make_interval(secs=>case when phase in ('between','runout') then 2 else 30 end);
    end if;
    update ojjuda_poker_internal.rooms set state=r.state,status=r.status,round=r.round,members=r.members,names=r.names,host_id=r.host_id,
     departed=r.departed,ready=r.ready,deadline=r.deadline,version=version+1,
     requests=array_append(r.requests[greatest(1,cardinality(r.requests)-510):cardinality(r.requests)],p_request),
     expires_at=clock_timestamp()+case when r.status='waiting' then interval '30 minutes' else interval '24 hours' end
     where id=r.id returning * into r;
   end if;
  end if;
 end if;
 return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1);
end;
$$;
revoke all on function ojjuda_poker_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function ojjuda_poker_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) to service_role;
create function public.poker_online_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_request uuid default null,p_expected integer default null,p_options jsonb default '{}',p_next jsonb default null)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select ojjuda_poker_internal.room_service(p_actor,p_action,p_room,p_code,p_request,p_expected,p_options,p_next);
$$;
revoke all on function public.poker_online_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.poker_online_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
