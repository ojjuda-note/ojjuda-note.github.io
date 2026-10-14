-- Automatic stakes: 100 / 200 / 500, then +1,000G per 100,000G from 300,000G.
-- Saved stakes never decrease here; existing rounds and balances remain intact.
select pg_advisory_xact_lock(1280136271,1);

alter table ojjuda_matgo_internal.wallets
  drop constraint wallets_stake_rate_check,
  drop constraint wallets_stake_seen_check,
  drop constraint wallets_round_rate_check,
  alter column stake_rate type bigint,
  alter column stake_seen type bigint,
  alter column round_rate type bigint,
  add constraint wallets_stake_rate_check check(stake_rate in(100,200,500) or (stake_rate>=1000 and stake_rate%1000=0)),
  add constraint wallets_stake_seen_check check(stake_seen in(100,200,500) or (stake_seen>=1000 and stake_seen%1000=0)),
  add constraint wallets_round_rate_check check(round_rate in(100,200,500) or (round_rate>=1000 and round_rate%1000=0));
alter table ojjuda_matgo_internal.rooms
  drop constraint rooms_round_rate_check,
  alter column round_rate type bigint,
  alter column stake_caps type bigint[],
  add constraint rooms_round_rate_check check(round_rate in(100,200,500) or (round_rate>=1000 and round_rate%1000=0));

-- Recreate only to widen the return type along with the wallet/room columns.
drop function ojjuda_matgo_internal.stake_for_gold(bigint);
create function ojjuda_matgo_internal.stake_for_gold(p_gold bigint)
returns bigint language sql immutable security invoker set search_path='' as $$
  select case when p_gold>=300000 then (p_gold/100000-2)*1000
    when p_gold>=200000 then 500 when p_gold>=100000 then 200 else 100 end;
$$;
revoke all on function ojjuda_matgo_internal.stake_for_gold(bigint) from public,anon,authenticated;

create or replace function ojjuda_matgo_internal.online_service(
 p_actor uuid,p_action text,p_room uuid default null,p_code text default null,
 p_seed text default null,p_expected integer default null,p_request uuid default null,p_next jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  state jsonb;wallet jsonb;existing uuid;before_room ojjuda_matgo_internal.rooms%rowtype;
  r ojjuda_matgo_internal.rooms%rowtype;seat integer;selected bigint:=100;new_entry boolean;new_ready boolean;
begin
  perform pg_advisory_xact_lock(1280136271,1);
  wallet:=ojjuda_matgo_internal.wallet_service(p_actor,'status');
  select online_room into existing from ojjuda_matgo_internal.wallets where user_id=p_actor;
  if p_action='ready' then
    select * into before_room from ojjuda_matgo_internal.rooms where id=p_room and p_actor in(host_id,guest_id);
  end if;
  if p_action in('quick','create','join','ready') and p_next->>'stakes_version'='1' then
    if wallet->'stake_offer' is not null and wallet->'stake_offer'<>'null'::jsonb then raise exception 'stake_offer_pending';end if;
    selected:=(wallet->>'stake_rate')::bigint;
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

-- Invalidate cached PL/pgSQL record-field plans on existing connections after
-- widening the two row types. Definitions, owners and grants stay unchanged.
do $$
declare definition text;
begin
  for definition in
    select pg_get_functiondef(p.oid) from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ojjuda_matgo_internal' and p.prokind='f'
      and (p.prosrc like '%ojjuda_matgo_internal.wallets%rowtype%'
        or p.prosrc like '%ojjuda_matgo_internal.rooms%rowtype%')
  loop
    execute definition;
  end loop;
end $$;

notify pgrst,'reload schema';
