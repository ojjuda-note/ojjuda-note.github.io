-- Secrets, transcripts and both hands remain behind service-only RPCs.
create table ojjuda_matgo_internal.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[A-F0-9]{8}$'),
  mode text not null check(mode in('quick','private')),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete cascade,
  names text[] not null,
  status text not null default 'waiting' check(status in('waiting','active','finished','cancelled')),
  seed text not null check(seed ~ '^[a-f0-9]{64}$'),
  actions jsonb not null default '[]' check(jsonb_typeof(actions)='array' and jsonb_array_length(actions)<=256),
  version integer not null default 0,
  requests uuid[] not null default '{}',
  start_gold bigint[] not null default '{0,0}',
  first smallint not null default 0 check(first in(0,1)),
  carry integer not null default 1 check(carry between 1 and 1024),
  round_no integer not null default 1,
  ready boolean[] not null default '{false,false}',
  bots boolean[] not null default '{false,false}',
  departed boolean[] not null default '{false,false}',
  auto_count integer not null default 0,
  last_auto jsonb,
  result jsonb,
  reason text,
  seen_host timestamptz not null default now(),
  seen_guest timestamptz not null default now(),
  deadline timestamptz not null default (now()+interval '15 seconds'),
  created_at timestamptz not null default now(),
  check(host_id is distinct from guest_id)
);
create index matgo_waiting_rooms on ojjuda_matgo_internal.rooms(created_at) where status='waiting' and mode='quick';
create index matgo_room_host on ojjuda_matgo_internal.rooms(host_id);
create index matgo_room_guest on ojjuda_matgo_internal.rooms(guest_id);
alter table ojjuda_matgo_internal.rooms enable row level security;
revoke all on ojjuda_matgo_internal.rooms from public,anon,authenticated;
alter table ojjuda_matgo_internal.wallets add column online_room uuid references ojjuda_matgo_internal.rooms(id) on delete set null;
create index matgo_wallet_online_room on ojjuda_matgo_internal.wallets(online_room) where online_room is not null;

-- All Matgo RPC mutations share a short transaction lock. Never hold it during
-- network calls or game replay. The room version additionally protects stale moves.
create function ojjuda_matgo_internal.expire_online(p_room uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  update ojjuda_matgo_internal.rooms set bots=array[bots[1] or seen_host<clock_timestamp()-interval '30 seconds',bots[2] or seen_guest<clock_timestamp()-interval '30 seconds'],
    departed=array[departed[1] or seen_host<clock_timestamp()-interval '30 seconds',departed[2] or seen_guest<clock_timestamp()-interval '30 seconds'],version=version+1
    where id=p_room and status='active' and ((not bots[1] and seen_host<clock_timestamp()-interval '30 seconds') or (not bots[2] and seen_guest<clock_timestamp()-interval '30 seconds'));
  update ojjuda_matgo_internal.rooms set status='cancelled',reason='timeout',version=version+1
  where id=p_room and (
    (status='active' and departed=array[true,true]) or
    (status='waiting' and seen_host<clock_timestamp()-interval '60 seconds') or
    (status='finished' and ready<>array[false,false] and deadline<clock_timestamp())
  );
  update ojjuda_matgo_internal.wallets set online_room=null where online_room=p_room
    and exists(select 1 from ojjuda_matgo_internal.rooms where id=p_room and status='cancelled');
end;
$$;
revoke all on function ojjuda_matgo_internal.expire_online(uuid) from public,anon,authenticated;

alter function ojjuda_matgo_internal.wallet_service(uuid,text,uuid,boolean,uuid,bigint,smallint,integer) rename to wallet_service_v1;
create function ojjuda_matgo_internal.wallet_service(
  p_actor uuid,p_action text,p_request uuid default null,p_paid boolean default false,
  p_round uuid default null,p_gold bigint default null,p_first smallint default null,p_carry integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_room uuid;v_state jsonb;
begin
  perform pg_advisory_xact_lock(1280136271,1);
  -- The original function validates server-stored age, ban and account status.
  v_state:=ojjuda_matgo_internal.wallet_service_v1(p_actor,'status');
  select online_room into v_room from ojjuda_matgo_internal.wallets where user_id=p_actor;
  if v_room is not null then
    perform ojjuda_matgo_internal.expire_online(v_room);
    select online_room into v_room from ojjuda_matgo_internal.wallets where user_id=p_actor;
  end if;
  if v_room is not null and p_action<>'status' then raise exception 'match_in_progress'; end if;
  if p_action<>'status' then
    v_state:=ojjuda_matgo_internal.wallet_service_v1(p_actor,p_action,p_request,p_paid,p_round,p_gold,p_first,p_carry);
  end if;
  return v_state||jsonb_build_object('online_room',v_room);
end;
$$;
revoke all on function ojjuda_matgo_internal.wallet_service(uuid,text,uuid,boolean,uuid,bigint,smallint,integer) from public,anon,authenticated;
grant execute on function ojjuda_matgo_internal.wallet_service(uuid,text,uuid,boolean,uuid,bigint,smallint,integer) to service_role;

create function ojjuda_matgo_internal.online_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_seed text default null,p_expected integer default null,p_request uuid default null,p_next jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r ojjuda_matgo_internal.rooms%rowtype;v_existing uuid;v_wallet jsonb;v_gold bigint[];
 v_nick text;v_seat integer;v_now timestamptz:=clock_timestamp();v_delta bigint;v_transfer bigint;v_paid bigint[];
 v_next_first smallint;v_next_carry integer;v_candidate uuid;
begin
  perform pg_advisory_xact_lock(1280136271,1);
  v_wallet:=ojjuda_matgo_internal.wallet_service_v1(p_actor,'status');
  if p_action not in('quick','create','join','read','commit','leave','ready') then raise exception 'invalid_action';end if;
  select online_room into v_existing from ojjuda_matgo_internal.wallets where user_id=p_actor;
  if v_existing is not null then
    perform ojjuda_matgo_internal.expire_online(v_existing);
    select online_room into v_existing from ojjuda_matgo_internal.wallets where user_id=p_actor;
  end if;
  if p_action in('quick','create','join') then
    if v_existing is not null then
      select * into strict r from ojjuda_matgo_internal.rooms where id=v_existing;
    else
      if (v_wallet->>'gold')::bigint<=0 then raise exception 'gold_empty';end if;
      if p_seed is null or p_seed!~'^[a-f0-9]{64}$' then raise exception 'invalid_seed';end if;
      select left(coalesce(nullif(btrim(nickname),''),'회원'),30) into v_nick from public.profiles where id=p_actor;
      v_nick:=coalesce(v_nick,'회원');
      if p_action='quick' then
        -- Expire abandoned queue entries before matching. No transcript is public.
        for v_candidate in select id from ojjuda_matgo_internal.rooms where status='waiting' and mode='quick' loop
          perform ojjuda_matgo_internal.expire_online(v_candidate);
        end loop;
        select * into r from ojjuda_matgo_internal.rooms where status='waiting' and mode='quick' and host_id<>p_actor order by created_at limit 1 for update;
      elsif p_action='join' then
        select * into r from ojjuda_matgo_internal.rooms where code=upper(p_code) for update;
        if not found then raise exception 'room_not_found';end if;
        perform ojjuda_matgo_internal.expire_online(r.id);
        select * into r from ojjuda_matgo_internal.rooms where id=r.id;
        if r.status<>'waiting' or r.host_id=p_actor then raise exception 'room_unavailable';end if;
      end if;
      if r.id is null then
        insert into ojjuda_matgo_internal.rooms(code,mode,host_id,names,seed,first)
          values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),case when p_action='quick' then 'quick' else 'private' end,p_actor,array[v_nick,'상대'],p_seed,(get_byte(decode(substr(p_seed,1,2),'hex'),0)%2)::smallint) returning * into r;
        update ojjuda_matgo_internal.wallets set online_room=r.id,round_id=null,round_seed=null where user_id=p_actor;
      else
        -- Re-check both members and use their actual current balances atomically.
        perform ojjuda_matgo_internal.wallet_service_v1(r.host_id,'status');
        if not exists(select 1 from ojjuda_matgo_internal.wallets where user_id=r.host_id and online_room=r.id and gold>0) then raise exception 'room_unavailable';end if;
        select array[(select gold from ojjuda_matgo_internal.wallets where user_id=r.host_id),(v_wallet->>'gold')::bigint] into v_gold;
        update ojjuda_matgo_internal.rooms set guest_id=p_actor,names=array[r.names[1],v_nick],status='active',start_gold=v_gold,
          seen_guest=v_now,deadline=v_now+interval '15 seconds',version=version+1 where id=r.id returning * into r;
        update ojjuda_matgo_internal.wallets set online_room=r.id,round_id=null,round_seed=null where user_id=p_actor;
      end if;
    end if;
  else
    select * into r from ojjuda_matgo_internal.rooms where id=p_room and p_actor in(host_id,guest_id) for update;
    if not found then raise exception 'room_not_found';end if;
    perform ojjuda_matgo_internal.expire_online(r.id);
    select * into r from ojjuda_matgo_internal.rooms where id=r.id;
    v_seat:=case when p_actor=r.host_id then 1 else 2 end;
    if p_action='leave' and r.status='active' then
      r.bots[v_seat]:=true;r.departed[v_seat]:=true;
      update ojjuda_matgo_internal.rooms set bots=r.bots,departed=r.departed,version=version+1 where id=r.id returning * into r;
      if r.departed=array[true,true] then
        update ojjuda_matgo_internal.rooms set status='cancelled',reason='left',version=version+1 where id=r.id returning * into r;
        update ojjuda_matgo_internal.wallets set online_room=null where online_room=r.id;
      end if;
    elsif p_action='leave' and (r.status in('waiting','active') or r.ready<>array[false,false]) then
      update ojjuda_matgo_internal.rooms set status='cancelled',reason='left',ready=array[false,false],version=version+1 where id=r.id returning * into r;
      update ojjuda_matgo_internal.wallets set online_room=null where online_room=r.id;
    elsif p_action='commit' and not(coalesce(p_request=any(r.requests),false)) then
      if r.status<>'active' then raise exception 'room_unavailable';end if;
      if p_expected is distinct from r.version then raise exception 'state_conflict';end if;
      if p_request is null or jsonb_typeof(p_next->'actions') is distinct from 'array' or jsonb_array_length(p_next->'actions')>256 then raise exception 'invalid_move';end if;
      perform ojjuda_matgo_internal.wallet_service_v1(r.host_id,'status');
      perform ojjuda_matgo_internal.wallet_service_v1(r.guest_id,'status');
      if (select count(*) from ojjuda_matgo_internal.wallets where online_room=r.id and user_id in(r.host_id,r.guest_id))<>2 then raise exception 'room_unavailable';end if;
      if p_next->'result' is not null and p_next->'result'<>'null'::jsonb then
        v_delta:=(p_next->'result'->'goldDelta'->>0)::bigint;
        if v_delta is null or (p_next->'result'->'goldDelta'->>1)::bigint is distinct from -v_delta or abs(v_delta)>9007199254740991 then raise exception 'invalid_result';end if;
        select array[(select gold from ojjuda_matgo_internal.wallets where user_id=r.host_id),(select gold from ojjuda_matgo_internal.wallets where user_id=r.guest_id)] into v_gold;
        -- Human opponents can only transfer available gold; total gold is conserved.
        v_transfer:=case when v_delta>=0 then least(v_delta,v_gold[2],9007199254740991-v_gold[1]) else -least(-v_delta,v_gold[1],9007199254740991-v_gold[2]) end;
        -- A departed player never receives winnings. Losses still settle at the end.
        v_paid:=array[case when r.departed[1] and v_transfer>0 then 0 else v_transfer end,case when r.departed[2] and v_transfer<0 then 0 else -v_transfer end];
        v_gold:=array[v_gold[1]+v_paid[1],v_gold[2]+v_paid[2]];
        update ojjuda_matgo_internal.wallets set gold=case when user_id=r.host_id then v_gold[1] else v_gold[2] end,online_room=null,updated_at=v_now where online_room=r.id;
        r.result:=p_next->'result'||jsonb_build_object('paidDelta',v_paid,'gold',v_gold,'nextFirst',p_next->'first','nextCarry',p_next->'carry');
        r.status:='finished';
      end if;
      update ojjuda_matgo_internal.rooms set actions=p_next->'actions',version=version+1,requests=array_append(requests,p_request),status=r.status,result=r.result,
        auto_count=auto_count+case when p_next?'auto' then 1 else 0 end,last_auto=case when p_next?'auto' then p_next->'auto' else last_auto end,
        deadline=case when coalesce((p_next->>'reset_clock')::boolean,false) then v_now+interval '15 seconds' else deadline end where id=r.id returning * into r;
    elsif p_action='ready' then
      if r.status<>'finished' or r.departed<>array[false,false] then raise exception 'room_unavailable';end if;
      if v_existing is not null and v_existing<>r.id then raise exception 'match_in_progress';end if;
      if (v_wallet->>'gold')::bigint<=0 then raise exception 'gold_empty';end if;
      if not r.ready[v_seat] then
        r.ready[v_seat]:=true;
        update ojjuda_matgo_internal.wallets set online_room=r.id,round_id=null,round_seed=null where user_id=p_actor;
        update ojjuda_matgo_internal.rooms set ready=r.ready,version=version+1,deadline=v_now+interval '90 seconds' where id=r.id returning * into r;
      end if;
      if r.ready=array[true,true] then
        if p_seed is null or p_seed!~'^[a-f0-9]{64}$' then raise exception 'invalid_seed';end if;
        perform ojjuda_matgo_internal.wallet_service_v1(r.host_id,'status');
        perform ojjuda_matgo_internal.wallet_service_v1(r.guest_id,'status');
        select array[(select gold from ojjuda_matgo_internal.wallets where user_id=r.host_id),(select gold from ojjuda_matgo_internal.wallets where user_id=r.guest_id)] into v_gold;
        if least(v_gold[1],v_gold[2])<=0 then raise exception 'gold_empty';end if;
        v_next_first:=(r.result->>'nextFirst')::smallint;v_next_carry:=(r.result->>'nextCarry')::integer;
        update ojjuda_matgo_internal.rooms set status='active',seed=p_seed,actions='[]',requests='{}',start_gold=v_gold,first=v_next_first,carry=v_next_carry,
          round_no=round_no+1,ready=array[false,false],bots=array[false,false],departed=array[false,false],result=null,version=version+1,seen_host=v_now,seen_guest=v_now,deadline=v_now+interval '15 seconds' where id=r.id returning * into r;
      end if;
    end if;
  end if;
  if p_actor=r.host_id then update ojjuda_matgo_internal.rooms set seen_host=v_now where id=r.id;
  else update ojjuda_matgo_internal.rooms set seen_guest=v_now where id=r.id;end if;
  select array[(select gold from ojjuda_matgo_internal.wallets where user_id=r.host_id),(select gold from ojjuda_matgo_internal.wallets where user_id=r.guest_id)] into v_gold;
  return jsonb_build_object('ok',true,'seat',case when p_actor=r.host_id then 0 else 1 end,'room',to_jsonb(r)||jsonb_build_object('gold',v_gold));
end;
$$;
revoke all on function ojjuda_matgo_internal.online_service(uuid,text,uuid,text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function ojjuda_matgo_internal.online_service(uuid,text,uuid,text,text,integer,uuid,jsonb) to service_role;
create function public.matgo_online_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_seed text default null,p_expected integer default null,p_request uuid default null,p_next jsonb default null)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select ojjuda_matgo_internal.online_service(p_actor,p_action,p_room,p_code,p_seed,p_expected,p_request,p_next);
$$;
revoke all on function public.matgo_online_service(uuid,text,uuid,text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.matgo_online_service(uuid,text,uuid,text,text,integer,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
