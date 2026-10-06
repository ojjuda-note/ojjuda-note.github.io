-- Snapshot both members' saved, explicitly accepted stakes for each new round.
-- Older clients and existing rounds keep 100G. Client-supplied rates are ignored.
alter table ojjuda_matgo_internal.rooms
  add column round_rate integer not null default 100 check(round_rate in(100,200,500,2000,5000,10000,20000,50000,100000)),
  add column stake_caps integer[] not null default '{100,100}';

alter function ojjuda_matgo_internal.online_service(uuid,text,uuid,text,text,integer,uuid,jsonb) rename to online_service_v1;
create function ojjuda_matgo_internal.online_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_seed text default null,p_expected integer default null,p_request uuid default null,p_next jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  state jsonb;wallet jsonb;existing uuid;before_room ojjuda_matgo_internal.rooms%rowtype;
  r ojjuda_matgo_internal.rooms%rowtype;seat integer;selected integer:=100;new_entry boolean;new_ready boolean;
begin
  perform pg_advisory_xact_lock(1280136271,1);
  wallet:=ojjuda_matgo_internal.wallet_service(p_actor,'status');
  select online_room into existing from ojjuda_matgo_internal.wallets where user_id=p_actor;
  if p_action='ready' then
    select * into before_room from ojjuda_matgo_internal.rooms where id=p_room and p_actor in(host_id,guest_id);
  end if;
  if p_action in('quick','create','join','ready') and p_next->>'stakes_version'='1' then
    if wallet->'stake_offer' is not null and wallet->'stake_offer'<>'null'::jsonb then raise exception 'stake_offer_pending';end if;
    selected:=(wallet->>'stake_rate')::integer;
  end if;
  state:=ojjuda_matgo_internal.online_service_v1(p_actor,p_action,p_room,p_code,p_seed,p_expected,p_request,p_next);
  select * into strict r from ojjuda_matgo_internal.rooms where id=(state->'room'->>'id')::uuid;
  seat:=(state->>'seat')::integer+1;
  new_entry:=p_action in('quick','create','join') and existing is null;
  new_ready:=p_action='ready' and before_room.status='finished' and not before_room.ready[seat];
  if new_entry or new_ready then
    r.stake_caps[seat]:=selected;
    -- Only a join or a two-person rematch starts a round. Never change a live rate.
    if r.status='active' and (new_entry or r.round_no>before_room.round_no) then
      r.round_rate:=least(r.stake_caps[1],r.stake_caps[2]);
    end if;
    update ojjuda_matgo_internal.rooms set stake_caps=r.stake_caps,round_rate=r.round_rate where id=r.id;
    state:=jsonb_set(state,'{room}',to_jsonb(r)||jsonb_build_object('gold',state->'room'->'gold'));
  end if;
  return state;
end;
$$;
revoke all on function ojjuda_matgo_internal.online_service(uuid,text,uuid,text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function ojjuda_matgo_internal.online_service(uuid,text,uuid,text,text,integer,uuid,jsonb) to service_role;
-- Rebind the public wrapper after the original implementation is renamed.
create or replace function public.matgo_online_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_seed text default null,p_expected integer default null,p_request uuid default null,p_next jsonb default null)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select ojjuda_matgo_internal.online_service(p_actor,p_action,p_room,p_code,p_seed,p_expected,p_request,p_next);
$$;
notify pgrst,'reload schema';
