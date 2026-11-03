-- Promote Wind Archer to the single-game rankings with a fresh launch epoch.
-- Only archery progress, records and item entitlements reset. Immutable purchase
-- receipts and the shared JU wallet remain available for accounting/recovery.
begin;
set local lock_timeout='5s';
-- Drain the old accounts-before-runs write path before taking DDL locks.
lock table ojjuda_archery_internal.accounts,ojjuda_archery_internal.runs,
 ojjuda_archery_internal.milestone_awards,ojjuda_archery_internal.receipts in exclusive mode;

alter table ojjuda_archery_internal.runs add column if not exists score integer check(score between 0 and 50);
alter table ojjuda_archery_internal.runs add column if not exists cleared boolean not null default false;
alter table ojjuda_archery_internal.runs add column if not exists launch_epoch integer not null default 4 check(launch_epoch=4);
create index if not exists archery_cleared_rank_period
 on ojjuda_archery_internal.runs(completed_at,user_id,stage desc,score desc)
 where cleared and completed_at is not null and abandoned_at is null;

-- A legacy RPC already inside its old PL/pgSQL body can outlive a deployment.
-- Every archery write checks an unforgeable private transaction context opened
-- by the new dispatcher. A queued old body therefore rolls back, including any
-- wallet deduction it made in that same transaction, when it reaches a write.
create table if not exists ojjuda_archery_internal.write_context (
 transaction_id bigint primary key,user_id uuid not null
);
alter table ojjuda_archery_internal.write_context enable row level security;
revoke all on ojjuda_archery_internal.write_context from public,anon,authenticated;
create or replace function ojjuda_archery_internal.guard_single_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(nullif(current_setting('role',true),'none'),session_user) in('anon','authenticated')
  and not exists(select 1 from ojjuda_archery_internal.write_context c
   where c.transaction_id=txid_current() and c.user_id=auth.uid()) then
  raise exception 'archery_update_required' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function ojjuda_archery_internal.guard_single_write() from public,anon,authenticated;
do $write_guards$
declare target text;
begin
 foreach target in array array['accounts','runs','milestone_awards','receipts'] loop
  execute format('drop trigger if exists archery_single_epoch_write on ojjuda_archery_internal.%I',target);
  execute format('create trigger archery_single_epoch_write before insert or update on ojjuda_archery_internal.%I for each row execute function ojjuda_archery_internal.guard_single_write()',target);
 end loop;
end;
$write_guards$;

-- A durable marker makes the data reset one-time even if the deployment retries.
do $reset$
declare reset_at timestamptz;
begin
 lock table ojjuda_archery_internal.accounts,ojjuda_archery_internal.runs,
  ojjuda_archery_internal.milestone_awards,ojjuda_archery_internal.receipts in exclusive mode;
 reset_at:=clock_timestamp();
 insert into ojjuda_archery_internal.release_backups(release_key,created_at,accounts,runs,milestone_awards)
 values('archery-single-v4-20261103',reset_at,
  coalesce((select jsonb_agg(to_jsonb(a)) from ojjuda_archery_internal.accounts a),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(r)) from ojjuda_archery_internal.runs r),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(m)) from ojjuda_archery_internal.milestone_awards m),'[]'::jsonb))
 on conflict(release_key) do nothing;
 if not found then return;end if;
 delete from ojjuda_archery_internal.milestone_awards;
 delete from ojjuda_archery_internal.runs;
 update ojjuda_archery_internal.accounts set free_remaining=0,paid_remaining=0,
  main_rounds=0,milestones_granted=0,first_milestone_day=null,daily_checked_day=null,
  coach_expires_at=null,revision=revision+1;
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

-- Retain the tested wallet/ammo transaction engine as a private core. It is
-- callable only by the epoch-aware dispatcher, never by an old authenticated tab.
do $core$
begin
 if to_regprocedure('ojjuda_archery_internal.operate_core_v4(text,uuid,uuid,integer)') is null then
  alter function ojjuda_archery_internal.operate(text,uuid,uuid,integer) rename to operate_core_v4;
 end if;
end;
$core$;
revoke all on function ojjuda_archery_internal.operate_core_v4(text,uuid,uuid,integer) from public,anon,authenticated;

do $snapshot$
declare definition text;
begin
 definition:=pg_get_functiondef('ojjuda_archery_internal.snapshot(uuid,timestamptz)'::regprocedure);
 if position('launch_epoch' in definition)=0 then
  if position('''ok'',true,' in definition)=0 then raise exception 'archery snapshot prerequisite changed';end if;
  definition:=replace(definition,'''ok'',true,','''ok'',true,''launch_epoch'',4,');
  execute definition;
 end if;
end;
$snapshot$;

-- Exact goals from the shipped 220-stage catalog, checked against engine.mjs.
create or replace function ojjuda_archery_internal.stage_goal(p_stage integer)
returns integer language sql immutable strict parallel safe set search_path='' as $$
 select (array[10,12,14,16,12,14,16,18,12,14,16,18,12,14,16,18,12,14,16,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,22,22,22,22,23,23,23,23,24,24,25,25,26,26,26,19,13,7,26,23,16,8,27,23,18,11,27,19,14,7,27,22,15,12,27,16,17,5,28,28,28,28,28,28,28,24,28,28,28,23,29,29,29,23,29,29,29,23,29,29,23,21,20,20,20,20,20,20,20,20,20,26,28,28,31,30,28,21,28,22,16,15,26,26,28,28,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,22,22,22,22,11,10,10,10,10,14,13,11,11,11,13,13,13,13,13,10,10,10,10,10,19,16,15,13,13,12,12,11,11,11,23,23,23,23,20,23,23,23,23,23,23,23,23,23,23]::integer[])[p_stage];
$$;
revoke all on function ojjuda_archery_internal.stage_goal(integer) from public,anon,authenticated;

create or replace function ojjuda_archery_internal.single_operate(
 p_action text,p_epoch integer,p_request_id uuid default null,p_run_id uuid default null,
 p_stage integer default null,p_score integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_run ojjuda_archery_internal.runs%rowtype;
 v_result jsonb;v_receipt ojjuda_archery_internal.receipts%rowtype;v_reset_at timestamptz;v_cleared boolean;
begin
 if p_epoch is distinct from 4 then return jsonb_build_object('ok',false,'reason','update_required','launch_epoch',4);end if;
 if actor is null then return jsonb_build_object('ok',false,'reason','sign_in','launch_epoch',4);end if;
 if public.is_banned(actor) then return jsonb_build_object('ok',false,'reason','banned','launch_epoch',4);end if;
 if p_action is null or p_action not in('status','round-start','round-complete','spend','buy','coach-buy')
  or (p_action<>'status' and p_request_id is null)
  or (p_action in('round-start','round-complete') and (p_stage is null or p_stage not between 1 and 220))
  or (p_action='round-complete' and (p_run_id is null or p_score is null or p_score not between 0 and 50))
 then return jsonb_build_object('ok',false,'reason','invalid','launch_epoch',4);end if;
 -- Use the same lock order as the underlying engine and serialize score receipt
 -- validation with ammo and purchases for this player.
 if p_request_id is not null then perform pg_advisory_xact_lock(hashtextextended('archery:'||p_request_id::text,0));end if;
 perform 1 from public.user_private where user_id=actor for update;
 if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable','launch_epoch',4);end if;
 select created_at into v_reset_at from ojjuda_archery_internal.release_backups where release_key='archery-single-v4-20261103';
 if p_request_id is not null then
  select * into v_receipt from ojjuda_archery_internal.receipts where request_id=p_request_id and user_id=actor;
  if found and v_receipt.created_at<v_reset_at then
   return ojjuda_archery_internal.snapshot(actor,clock_timestamp())||jsonb_build_object('ok',false,'reason','progress_reset','launch_epoch',4);
  end if;
 end if;
 if p_action='round-complete' then
  select * into v_run from ojjuda_archery_internal.runs where run_id=p_run_id and user_id=actor for update;
  if not found then return ojjuda_archery_internal.snapshot(actor,clock_timestamp())||jsonb_build_object('ok',false,'reason','run_not_found','launch_epoch',4);end if;
  if v_run.launch_epoch<>4 then return ojjuda_archery_internal.snapshot(actor,clock_timestamp())||jsonb_build_object('ok',false,'reason','progress_reset','launch_epoch',4);end if;
  if v_run.completed_at is not null and v_run.score is distinct from p_score then
   return ojjuda_archery_internal.snapshot(actor,clock_timestamp())||jsonb_build_object('ok',false,'reason','request_conflict','launch_epoch',4);
  end if;
 end if;
 insert into ojjuda_archery_internal.write_context(transaction_id,user_id) values(txid_current(),actor)
  on conflict(transaction_id) do nothing;
 v_result:=ojjuda_archery_internal.operate_core_v4(p_action,p_request_id,p_run_id,p_stage)||jsonb_build_object('launch_epoch',4);
 if p_action='round-complete' and coalesce((v_result->>'ok')::boolean,false) then
  v_cleared:=p_score>=ojjuda_archery_internal.stage_goal(p_stage);
  update ojjuda_archery_internal.runs set score=p_score,cleared=v_cleared
   where run_id=p_run_id and user_id=actor and completed_at is not null and abandoned_at is null and score is null;
  v_result:=v_result||jsonb_build_object('stage',p_stage,'score',p_score,'cleared',v_cleared,'ranked',v_cleared);
  -- Extend a newly committed receipt in the same transaction; retries retain
  -- its original score and completion time and cannot improve the stored run.
  update ojjuda_archery_internal.receipts set result=result||jsonb_build_object(
   'launch_epoch',4,'stage',p_stage,'score',p_score,'cleared',v_cleared,'ranked',v_cleared)
   where request_id=p_request_id and user_id=actor and not result?'score';
 end if;
 delete from ojjuda_archery_internal.write_context where transaction_id=txid_current() and user_id=actor;
 return v_result;
end;
$$;
revoke all on function ojjuda_archery_internal.single_operate(text,integer,uuid,uuid,integer,integer) from public,anon;
grant execute on function ojjuda_archery_internal.single_operate(text,integer,uuid,uuid,integer,integer) to authenticated;

create or replace function ojjuda_archery_internal.single_receipt(p_request_id uuid,p_action text,p_epoch integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_previous ojjuda_archery_internal.receipts%rowtype;v_snapshot jsonb;v_reset_at timestamptz;
begin
 if p_epoch is distinct from 4 then return jsonb_build_object('ok',false,'reason','update_required','launch_epoch',4);end if;
 if actor is null then return jsonb_build_object('ok',false,'reason','sign_in','launch_epoch',4);end if;
 if public.is_banned(actor) then return jsonb_build_object('ok',false,'reason','banned','launch_epoch',4);end if;
 v_snapshot:=ojjuda_archery_internal.snapshot(actor,clock_timestamp())||jsonb_build_object('launch_epoch',4);
 if p_request_id is null or p_action is null or p_action not in('round-start','round-complete','spend','buy','coach-buy') then
  return v_snapshot||jsonb_build_object('ok',false,'reason','invalid','found',false,'receipt',null);
 end if;
 select * into v_previous from ojjuda_archery_internal.receipts where request_id=p_request_id and user_id=actor;
 if not found then return v_snapshot||jsonb_build_object('found',false,'receipt',null);end if;
 if v_previous.action<>p_action then return v_snapshot||jsonb_build_object('ok',false,'reason','request_conflict','found',false,'receipt',null);end if;
 select created_at into v_reset_at from ojjuda_archery_internal.release_backups where release_key='archery-single-v4-20261103';
 if v_previous.created_at<v_reset_at then
  return v_snapshot||jsonb_build_object('ok',false,'reason','progress_reset','found',false,'receipt',null);
 end if;
 return v_snapshot||jsonb_build_object('found',true,'receipt',v_previous.result||jsonb_build_object('launch_epoch',4));
end;
$$;
revoke all on function ojjuda_archery_internal.single_receipt(uuid,text,integer) from public,anon;
grant execute on function ojjuda_archery_internal.single_receipt(uuid,text,integer) to authenticated;

create or replace function public.archery_single_action(
 p_action text,p_epoch integer,p_request_id uuid default null,p_run_id uuid default null,
 p_stage integer default null,p_score integer default null
) returns jsonb language sql security invoker set search_path='' as $$
 select ojjuda_archery_internal.single_operate(p_action,p_epoch,p_request_id,p_run_id,p_stage,p_score);
$$;
create or replace function public.archery_single_receipt(p_request_id uuid,p_action text,p_epoch integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 select ojjuda_archery_internal.single_receipt(p_request_id,p_action,p_epoch);
$$;
revoke all on function public.archery_single_action(text,integer,uuid,uuid,integer,integer),public.archery_single_receipt(uuid,text,integer) from public,anon;
grant execute on function public.archery_single_action(text,integer,uuid,uuid,integer,integer),public.archery_single_receipt(uuid,text,integer) to authenticated;

-- Legacy public RPCs still resolve cleanly but cannot recreate progress, spend
-- new items or buy ammo from an old test tab after the reset.
create or replace function ojjuda_archery_internal.operate(
 p_action text,p_request_id uuid default null,p_run_id uuid default null,p_stage integer default null
) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('ok',false,'reason','update_required','launch_epoch',4);
$$;
create or replace function ojjuda_archery_internal.receipt(p_request_id uuid,p_action text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('ok',false,'reason','update_required','launch_epoch',4,'found',false,'receipt',null);
$$;
revoke all on function ojjuda_archery_internal.operate(text,uuid,uuid,integer),ojjuda_archery_internal.receipt(uuid,text) from public,anon;
grant execute on function ojjuda_archery_internal.operate(text,uuid,uuid,integer),ojjuda_archery_internal.receipt(uuid,text) to authenticated;

-- Ranking reads use completed server runs; general score submission remains
-- unsupported for archery. Highest cleared stage, then its highest round score,
-- then the earliest completion wins. Failed rounds keep normal ammo cadence.
do $rankings$
declare definition text;updated text;signature text;
begin
 definition:=pg_get_functiondef('ojjuda_ranking_internal.catalog()'::regprocedure);
 if not 'archery'=any(ojjuda_ranking_internal.catalog()) then
  updated:=replace(definition,']::text[]',',''archery'']::text[]');
  if updated=definition then raise exception 'archery catalog prerequisite changed';end if;
  execute updated;
 end if;
 definition:=pg_get_functiondef('ojjuda_ranking_internal.candidates(text,timestamptz,timestamptz)'::regprocedure);
 if position('ojjuda_archery_internal.runs' in definition)=0 then
  updated:=regexp_replace(definition,'begin[[:space:]]',$branch$begin
 if p_game='archery' then
  return query select best.user_id,'member:'||best.user_id::text,p.nickname,best.score::bigint,best.completed_at,best.stage,
   jsonb_build_object('source','archery_stage_score','stage',best.stage)
  from (select distinct on(r.user_id) r.user_id,r.stage,r.score,r.completed_at
   from ojjuda_archery_internal.runs r
   where r.launch_epoch=4 and r.cleared and r.score>0 and r.completed_at>=p_start and r.completed_at<p_end and r.abandoned_at is null
   order by r.user_id,r.stage desc,r.score desc,r.completed_at,r.run_id) best
  join public.profiles p on p.id=best.user_id
  join auth.users a on a.id=best.user_id and not coalesce(a.is_anonymous,false)
  where not exists(select 1 from public.user_private u where u.user_id=best.user_id and u.banned_until>now());
  return;
 end if;
 $branch$);
  if updated=definition then raise exception 'archery candidate prerequisite changed';end if;
  execute updated;
 end if;
 definition:=pg_get_functiondef('ojjuda_ranking_internal.close_month(date)'::regprocedure);
 if position('ojjuda_archery_internal.runs' in definition)=0 then
  updated:=replace(definition,'ojjuda_ranking_internal.picture_clears in share mode;',
   'ojjuda_ranking_internal.picture_clears,ojjuda_archery_internal.runs in share mode;');
  if updated=definition then raise exception 'archery monthly lock prerequisite changed';end if;
  execute updated;
 end if;
end;
$rankings$;

create or replace function ojjuda_archery_internal.ranking(p_period text default 'month')
returns json language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_now timestamptz:=statement_timestamp();v_start timestamptz;v_result json;
begin
 if p_period is null or p_period not in('day','month','all') then return '[]'::json;end if;
 v_start:=case p_period when 'month' then ojjuda_ranking_internal.month_start(ojjuda_ranking_internal.month_key(v_now))
  when 'day' then date_trunc('day',v_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' else '-infinity'::timestamptz end;
 select coalesce(json_agg(r.details||jsonb_build_object('nick',r.nick,'score',r.score,'me',coalesce(r.user_id=actor,false))
  order by r.priority desc,r.score desc,r.achieved_at,r.identity_key),'[]'::json) into v_result
 from (select * from ojjuda_ranking_internal.candidates('archery',v_start,v_now+interval '1 microsecond')
  order by priority desc,score desc,achieved_at,identity_key limit 10) r;
 return v_result;
end;
$$;
grant usage on schema ojjuda_archery_internal to anon,authenticated;
revoke all on function ojjuda_archery_internal.ranking(text) from public;
grant execute on function ojjuda_archery_internal.ranking(text) to anon,authenticated;

do $dispatch$
declare signature text;definition text;updated text;period text;
begin
 foreach signature in array array['public.community_game_ranking(text)','public.community_game_monthly_ranking(text)','public.guest_game_ranking(text,text,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('ojjuda_archery_internal.ranking' in definition)>0 then continue;end if;
  period:=case signature when 'public.community_game_ranking(text)' then '''all'''
   when 'public.community_game_monthly_ranking(text)' then '''month''' else 'p_period' end;
  updated:=regexp_replace(definition,'begin[[:space:]]','begin'||chr(10)||
   ' if p_game=''archery'' then return ojjuda_archery_internal.ranking('||period||');end if;'||chr(10));
  if updated=definition then raise exception 'archery rank dispatch prerequisite changed: %',signature;end if;
  execute updated;
 end loop;
end;
$dispatch$;
notify pgrst,'reload schema';
commit;
