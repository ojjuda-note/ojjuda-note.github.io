-- Fixed JU-to-local-game-coin packs, with durable account-bound receipts.
begin;
set local lock_timeout='5s';
create table ojjuda_archery_internal.coin_exchange_receipts(
 request_id uuid primary key,
 user_id uuid not null references public.user_private(user_id) on delete cascade,
 zu integer not null check(zu in(10,50,100,500,1000,5000)),
 result jsonb not null,
 created_at timestamptz not null default now()
);
create index archery_coin_exchange_owner on ojjuda_archery_internal.coin_exchange_receipts(user_id);
alter table ojjuda_archery_internal.coin_exchange_receipts enable row level security;
revoke all on ojjuda_archery_internal.coin_exchange_receipts from public,anon,authenticated;

create or replace function ojjuda_archery_internal.exchange_coins(p_action text,p_request_id uuid,p_zu integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();wallet integer;previous ojjuda_archery_internal.coin_exchange_receipts%rowtype;result jsonb;
begin
 if actor is null then return jsonb_build_object('ok',false,'reason','sign_in');end if;
 if public.is_banned(actor) then return jsonb_build_object('ok',false,'reason','banned');end if;
 if p_action is null or p_action not in('exchange','receipt') or p_request_id is null or p_zu is null or p_zu not in(10,50,100,500,1000,5000) then
  return jsonb_build_object('ok',false,'reason','invalid');
 end if;
 perform pg_advisory_xact_lock(hashtextextended('archery-coin:'||p_request_id::text,0));
 select coins into wallet from public.user_private where user_id=actor for update;
 if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable');end if;
 select * into previous from ojjuda_archery_internal.coin_exchange_receipts where request_id=p_request_id;
 if found then
  if previous.user_id<>actor or previous.zu<>p_zu then return jsonb_build_object('ok',false,'reason','request_conflict');end if;
  return previous.result||jsonb_build_object('coins',wallet,'replayed',true,'found',true,'receipt',previous.result);
 end if;
 if p_action='receipt' then return jsonb_build_object('ok',true,'coins',wallet,'found',false,'receipt',null);end if;
 if exists(select 1 from ojjuda_note_internal.spend_requests where request_id=p_request_id) then
  return jsonb_build_object('ok',false,'reason','request_conflict');
 end if;
 result:=jsonb_build_object('ok',wallet>=p_zu,'owner',actor,'request_id',p_request_id,'zu',p_zu,'game_coins',case when wallet>=p_zu then p_zu*10 else 0 end);
 if wallet<p_zu then result:=result||jsonb_build_object('reason','coins','coins',wallet);
 else
  update public.user_private set coins=coins-p_zu where user_id=actor returning coins into wallet;
  result:=result||jsonb_build_object('coins',wallet);
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result)
   values(p_request_id,actor,'archery_coin_exchange',p_zu,result);
 end if;
 -- Store definitive declines too: retries cannot charge after a lost decline.
 insert into ojjuda_archery_internal.coin_exchange_receipts(request_id,user_id,zu,result)
  values(p_request_id,actor,p_zu,result);
 return result;
exception when unique_violation then
 -- A receipt ID used by another feature can never leave a partial wallet debit.
 return jsonb_build_object('ok',false,'reason','request_conflict');
end;
$$;
revoke all on function ojjuda_archery_internal.exchange_coins(text,uuid,integer) from public,anon;
grant execute on function ojjuda_archery_internal.exchange_coins(text,uuid,integer) to authenticated;
create or replace function public.archery_coin_exchange(p_request_id uuid,p_zu integer,p_action text default 'exchange')
returns jsonb language sql security invoker set search_path='' as $$
 select ojjuda_archery_internal.exchange_coins(p_action,p_request_id,p_zu);
$$;
revoke all on function public.archery_coin_exchange(uuid,integer,text) from public,anon;
grant execute on function public.archery_coin_exchange(uuid,integer,text) to authenticated;
commit;
