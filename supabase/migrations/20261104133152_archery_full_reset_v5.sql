-- User-requested full Wind Archer reset and removal of item trials.
-- Epoch 5 prevents old clients from restoring scores or making new purchases.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table ojjuda_archery_internal.accounts,ojjuda_archery_internal.runs,
 ojjuda_archery_internal.milestone_awards,ojjuda_archery_internal.receipts,
 ojjuda_archery_internal.coin_exchange_receipts in exclusive mode;
alter table ojjuda_archery_internal.write_context add column if not exists launch_epoch integer not null default 0;
alter table ojjuda_archery_internal.release_backups add column if not exists purchase_records jsonb not null default '{}'::jsonb;

create or replace function ojjuda_archery_internal.guard_single_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(nullif(current_setting('role',true),'none'),session_user) in('anon','authenticated')
  and not exists(select 1 from ojjuda_archery_internal.write_context c
   where c.transaction_id=txid_current() and c.user_id=auth.uid() and c.launch_epoch=5) then
  raise exception 'archery_update_required' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function ojjuda_archery_internal.guard_single_write() from public,anon,authenticated;
drop trigger if exists archery_single_epoch_write on ojjuda_archery_internal.coin_exchange_receipts;
create trigger archery_single_epoch_write before insert or update on ojjuda_archery_internal.coin_exchange_receipts
 for each row execute function ojjuda_archery_internal.guard_single_write();

-- Snapshot only archery data for rollback, then clear active records once.
do $reset$
begin
 insert into ojjuda_archery_internal.release_backups(release_key,accounts,runs,milestone_awards,purchase_records)
 values('archery-full-v5-20261104',
  coalesce((select jsonb_agg(to_jsonb(a)) from ojjuda_archery_internal.accounts a),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(r)) from ojjuda_archery_internal.runs r),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(m)) from ojjuda_archery_internal.milestone_awards m),'[]'::jsonb),
  jsonb_build_object('receipts',coalesce((select jsonb_agg(to_jsonb(r)) from ojjuda_archery_internal.receipts r),'[]'::jsonb),
   'coin_receipts',coalesce((select jsonb_agg(to_jsonb(r)) from ojjuda_archery_internal.coin_exchange_receipts r),'[]'::jsonb),
   'spend_requests',coalesce((select jsonb_agg(to_jsonb(r)) from ojjuda_note_internal.spend_requests r
    where kind in('archery_ammo','archery_coach','archery_coin_exchange')),'[]'::jsonb)))
 on conflict(release_key) do nothing;
 if not found then return;end if;
 delete from ojjuda_archery_internal.milestone_awards;
 delete from ojjuda_archery_internal.runs;
 delete from ojjuda_archery_internal.receipts;
 delete from ojjuda_archery_internal.coin_exchange_receipts;
 delete from ojjuda_archery_internal.write_context;
 update ojjuda_archery_internal.accounts set free_remaining=0,paid_remaining=0,main_rounds=0,
  milestones_granted=0,first_milestone_day=null,daily_checked_day=null,coach_expires_at=null,revision=revision+1;
 delete from ojjuda_note_internal.spend_requests where kind in('archery_ammo','archery_coach','archery_coin_exchange');
 delete from public.game_scores where game='archery';
 delete from ojjuda_guest_internal.scores where game='archery';
 delete from ojjuda_guest_internal.round_records where game='archery';
 delete from ojjuda_ranking_internal.guest_peaks where game='archery';
 delete from ojjuda_game_internal.practice_results where game='archery';
 update ojjuda_ranking_internal.archives set winners=winners-'archery',
  has_records=exists(select 1 from jsonb_each(winners-'archery') e where e.value<>'null'::jsonb)
 where winners?'archery';
end;
$reset$;
alter table ojjuda_archery_internal.runs drop constraint runs_launch_epoch_check;
alter table ojjuda_archery_internal.runs alter column launch_epoch set default 5;
alter table ojjuda_archery_internal.runs add constraint runs_launch_epoch_check check(launch_epoch=5);

-- Retain current business logic and grants, changing only this game's epoch.
do $epoch$
declare signature text;definition text;
begin
 foreach signature in array array[
  'ojjuda_archery_internal.snapshot(uuid,timestamptz)',
  'ojjuda_archery_internal.single_operate(text,integer,uuid,uuid,integer,integer)',
  'ojjuda_archery_internal.single_receipt(uuid,text,integer)',
  'ojjuda_archery_internal.operate(text,uuid,uuid,integer)',
  'ojjuda_archery_internal.receipt(uuid,text)',
  'ojjuda_ranking_internal.candidates(text,timestamptz,timestamptz)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('launch_epoch' in definition)=0 then raise exception 'Missing archery epoch: %',signature;end if;
  definition:=replace(definition,'''launch_epoch'',4','''launch_epoch'',5');
  definition:=replace(definition,'p_epoch is distinct from 4','p_epoch is distinct from 5');
  definition:=replace(definition,'v_run.launch_epoch<>4','v_run.launch_epoch<>5');
  definition:=replace(definition,'r.launch_epoch=4','r.launch_epoch=5');
  definition:=replace(definition,'archery-single-v4-20261103','archery-full-v5-20261104');
  definition:=replace(definition,'write_context(transaction_id,user_id) values(txid_current(),actor)',
   'write_context(transaction_id,user_id,launch_epoch) values(txid_current(),actor,5)');
  execute definition;
 end loop;
end;
$epoch$;

-- Keep the old endpoint as a no-write tombstone so queued v4 purchases fail.
create or replace function ojjuda_archery_internal.exchange_coins(p_action text,p_request_id uuid,p_zu integer)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('ok',false,'reason','update_required','launch_epoch',5);
$$;
revoke all on function ojjuda_archery_internal.exchange_coins(text,uuid,integer) from public,anon;
grant execute on function ojjuda_archery_internal.exchange_coins(text,uuid,integer) to authenticated;

create or replace function ojjuda_archery_internal.exchange_coins_v5(p_action text,p_request_id uuid,p_zu integer,p_epoch integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();wallet integer;previous ojjuda_archery_internal.coin_exchange_receipts%rowtype;result jsonb;
begin
 if p_epoch is distinct from 5 then return jsonb_build_object('ok',false,'reason','update_required','launch_epoch',5);end if;
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
 insert into ojjuda_archery_internal.write_context(transaction_id,user_id,launch_epoch) values(txid_current(),actor,5) on conflict(transaction_id) do nothing;
 result:=jsonb_build_object('launch_epoch',5,'ok',wallet>=p_zu,'owner',actor,'request_id',p_request_id,'zu',p_zu,'game_coins',case when wallet>=p_zu then p_zu*10 else 0 end);
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
 delete from ojjuda_archery_internal.write_context where transaction_id=txid_current() and user_id=actor;
 return result;
exception when unique_violation then
 -- A receipt ID used by another feature can never leave a partial wallet debit.
 return jsonb_build_object('ok',false,'reason','request_conflict');
end;
$$;
revoke all on function ojjuda_archery_internal.exchange_coins_v5(text,uuid,integer,integer) from public,anon;
grant execute on function ojjuda_archery_internal.exchange_coins_v5(text,uuid,integer,integer) to authenticated;
create or replace function public.archery_coin_exchange_v5(p_request_id uuid,p_zu integer,p_epoch integer,p_action text default 'exchange')
returns jsonb language sql security invoker set search_path='' as $$
 select ojjuda_archery_internal.exchange_coins_v5(p_action,p_request_id,p_zu,p_epoch);
$$;
revoke all on function public.archery_coin_exchange_v5(uuid,integer,integer,text) from public,anon;
grant execute on function public.archery_coin_exchange_v5(uuid,integer,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
