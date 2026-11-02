-- New purchases: 10 event rounds for 5 JU; a 24-hour coach for 10 JU.
-- Existing ammo, progress, wallet balances, and immutable receipts are preserved.
-- The public RPC remains an invoker wrapper; privileged writes stay in the private schema.
begin;

alter table ojjuda_archery_internal.accounts add column if not exists coach_expires_at timestamptz;
alter table ojjuda_archery_internal.receipts drop constraint if exists receipts_action_check;
alter table ojjuda_archery_internal.receipts add constraint receipts_action_check
  check (action in ('round-start','round-complete','spend','buy','coach-buy'));

create or replace function ojjuda_archery_internal.snapshot(p_user uuid, p_at timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'ok',true,
      'remaining',coalesce(a.free_remaining,0)::bigint + coalesce(a.paid_remaining,0),
      'free_remaining',coalesce(a.free_remaining,0), 'paid_remaining',coalesce(a.paid_remaining,0),
      'coins',w.coins, 'revision',coalesce(a.revision,0), 'main_rounds',coalesce(a.main_rounds,0),
      'milestones_granted',coalesce(a.milestones_granted,0),
      'daily_eligible',coalesce(ojjuda_archery_internal.korea_day(p_at) > a.first_milestone_day,false),
      'day',ojjuda_archery_internal.korea_day(p_at)::text,
      'daily_checked',coalesce(a.daily_checked_day = ojjuda_archery_internal.korea_day(p_at),false),
      'pack_ammo',10, 'pack_price',5,
      'server_now',p_at, 'coach_expires_at',a.coach_expires_at,
      'coach_active',coalesce(a.coach_expires_at>p_at,false),
      'coach_price',10, 'coach_duration_seconds',86400)
    from public.user_private w left join ojjuda_archery_internal.accounts a on a.user_id=w.user_id
    where w.user_id=p_user
  ),jsonb_build_object('ok',false,'reason','wallet_unavailable'));
$$;

create or replace function ojjuda_archery_internal.operate(
  p_action text, p_request_id uuid default null, p_run_id uuid default null, p_stage integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz;
  v_day date;
  v_coins integer;
  v_account ojjuda_archery_internal.accounts%rowtype;
  v_previous ojjuda_archery_internal.receipts%rowtype;
  v_run ojjuda_archery_internal.runs%rowtype;
  v_payload jsonb := '{}'::jsonb;
  v_outcome jsonb := jsonb_build_object('ok',true);
  v_result jsonb;
  v_daily integer := 0;
  v_grant integer := 0;
  v_next integer;
  v_ordinal integer;
  v_source text;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned'); end if;
  if p_action is null or p_action not in ('status','round-start','round-complete','spend','buy','coach-buy')
    or (p_action <> 'status' and p_request_id is null)
    or (p_action in ('round-start','round-complete') and (p_stage is null or p_stage not between 1 and 50))
    or (p_action='round-complete' and p_run_id is null) then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if p_action='round-start' then v_payload:=jsonb_build_object('stage',p_stage);
  elsif p_action='round-complete' then v_payload:=jsonb_build_object('stage',p_stage,'run_id',p_run_id); end if;

  -- A shared UUID cannot race between two accounts; the wallet row serializes all actions for one account.
  if p_request_id is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('archery:'||p_request_id::text,0)); end if;
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  insert into ojjuda_archery_internal.accounts(user_id) values(v_user) on conflict do nothing;
  select * into v_account from ojjuda_archery_internal.accounts where user_id=v_user for update;
  v_now:=clock_timestamp(); v_day:=ojjuda_archery_internal.korea_day(v_now);

  if p_request_id is not null then
    select * into v_previous from ojjuda_archery_internal.receipts where request_id=p_request_id;
    if found then
      if v_previous.user_id<>v_user or v_previous.action<>p_action or v_previous.payload<>v_payload then
        return ojjuda_archery_internal.snapshot(v_user,v_now)||jsonb_build_object('ok',false,'reason','request_conflict');
      end if;
      if p_action<>'round-start' then v_daily:=ojjuda_archery_internal.daily_floor(v_user,v_now); end if;
      return v_previous.result||(ojjuda_archery_internal.snapshot(v_user,v_now)-'ok')||jsonb_build_object('replayed',true,'daily_grant',v_daily);
    end if;
  end if;

  if p_action='status' then
    v_daily:=ojjuda_archery_internal.daily_floor(v_user,v_now);
    return ojjuda_archery_internal.snapshot(v_user,v_now)||jsonb_build_object('daily_grant',v_daily);
  elsif p_action='round-start' then
    update ojjuda_archery_internal.runs set abandoned_at=v_now
      where user_id=v_user and completed_at is null and abandoned_at is null;
    insert into ojjuda_archery_internal.runs(user_id,stage,started_at) values(v_user,p_stage,v_now) returning * into v_run;
    update ojjuda_archery_internal.accounts set revision=revision+1 where user_id=v_user;
    v_outcome:=v_outcome||jsonb_build_object('run_id',v_run.run_id,'stage',p_stage,'min_seconds',6);
  elsif p_action='round-complete' then
    select * into v_run from ojjuda_archery_internal.runs where run_id=p_run_id and user_id=v_user for update;
    if not found then
      v_outcome:=jsonb_build_object('ok',false,'reason','run_not_found');
    elsif v_run.stage<>p_stage or v_run.abandoned_at is not null then
      v_outcome:=jsonb_build_object('ok',false,'reason','run_conflict');
    elsif v_run.completed_at is not null then
      v_daily:=ojjuda_archery_internal.daily_floor(v_user,v_now);
      v_outcome:=v_outcome||jsonb_build_object('run_id',p_run_id,'stage',p_stage,'completed_now',false,'milestone_grant',0);
    elsif v_now < v_run.started_at+interval '6 seconds' then
      -- This transient refusal is not a receipt: retrying this same request after the guard is safe.
      return ojjuda_archery_internal.snapshot(v_user,v_now)||jsonb_build_object('ok',false,'reason','round_too_soon',
        'retry_after',ceil(extract(epoch from v_run.started_at+interval '6 seconds'-v_now))::integer);
    else
      v_next:=v_account.main_rounds+1;
      if v_next<=50 and v_next%5=0 then
        v_ordinal:=v_next/5;
        insert into ojjuda_archery_internal.milestone_awards(user_id,ordinal,run_id,granted_at)
          values(v_user,v_ordinal,p_run_id,v_now) on conflict do nothing;
        if found then v_grant:=20; end if;
      end if;
      -- An already-eligible day checks its floor before this round's separate milestone award.
      -- The helper excludes the initial milestone and further checks on that first Korea day.
      v_daily:=ojjuda_archery_internal.daily_floor(v_user,v_now);
      update ojjuda_archery_internal.accounts set main_rounds=v_next,
        free_remaining=free_remaining+v_grant,
        milestones_granted=milestones_granted+case when v_grant>0 then 1 else 0 end,
        first_milestone_day=case when v_grant>0 then coalesce(first_milestone_day,v_day) else first_milestone_day end,
        daily_checked_day=case when v_grant>0 then greatest(coalesce(daily_checked_day,v_day),v_day) else daily_checked_day end,
        revision=revision+1 where user_id=v_user;
      update ojjuda_archery_internal.runs set completed_at=v_now where run_id=p_run_id;
      v_outcome:=v_outcome||jsonb_build_object('run_id',p_run_id,'stage',p_stage,'completed_now',true,'milestone_grant',v_grant);
    end if;
  else
    v_daily:=ojjuda_archery_internal.daily_floor(v_user,v_now);
    select * into v_account from ojjuda_archery_internal.accounts where user_id=v_user;
    if p_action='spend' then
      if v_account.free_remaining::bigint+v_account.paid_remaining=0 then
        v_outcome:=jsonb_build_object('ok',false,'reason','ammo_empty');
      else
        v_source:=case when v_account.free_remaining>0 then 'free' else 'paid' end;
        update ojjuda_archery_internal.accounts set
          free_remaining=free_remaining-case when v_source='free' then 1 else 0 end,
          paid_remaining=paid_remaining-case when v_source='paid' then 1 else 0 end,
          revision=revision+1 where user_id=v_user;
        v_outcome:=v_outcome||jsonb_build_object('spent',1,'spent_from',v_source);
      end if;
    elsif exists(select 1 from ojjuda_note_internal.spend_requests where request_id=p_request_id) then
      v_outcome:=jsonb_build_object('ok',false,'reason','request_conflict');
    elsif p_action='coach-buy' then
      if v_account.coach_expires_at>v_now then
        v_outcome:=jsonb_build_object('ok',false,'reason','coach_active');
      elsif v_coins<10 then
        v_outcome:=jsonb_build_object('ok',false,'reason','coins');
      else
        update public.user_private set coins=coins-10 where user_id=v_user and coins>=10 returning coins into v_coins;
        if not found then raise exception 'wallet_conflict'; end if;
        -- Duration is elapsed server time; it does not depend on client clocks, login, or play time.
        update ojjuda_archery_internal.accounts set coach_expires_at=v_now+interval '86400 seconds',
          revision=revision+1 where user_id=v_user;
        v_outcome:=v_outcome||jsonb_build_object('price',10,'coach_started_at',v_now);
      end if;
    elsif v_coins<5 then
      v_outcome:=jsonb_build_object('ok',false,'reason','coins');
    elsif v_account.paid_remaining>2147483637 then
      v_outcome:=jsonb_build_object('ok',false,'reason','limit');
    else
      update public.user_private set coins=coins-5 where user_id=v_user and coins>=5 returning coins into v_coins;
      if not found then raise exception 'wallet_conflict'; end if;
      update ojjuda_archery_internal.accounts set paid_remaining=paid_remaining+10,revision=revision+1 where user_id=v_user;
      v_outcome:=v_outcome||jsonb_build_object('ammo_added',10,'price',5);
    end if;
  end if;

  v_result:=ojjuda_archery_internal.snapshot(v_user,v_now)||v_outcome||
    jsonb_build_object('action',p_action,'request_id',p_request_id,'daily_grant',v_daily);
  if p_action in ('buy','coach-buy') and (v_outcome->>'ok')::boolean then
    insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result)
      values(p_request_id,v_user,case when p_action='coach-buy' then 'archery_coach' else 'archery_ammo' end,
        case when p_action='coach-buy' then 10 else 5 end,v_result);
  end if;
  -- Definitive declines are also immutable receipts: a lost reply cannot charge later on a retry.
  insert into ojjuda_archery_internal.receipts(request_id,user_id,action,payload,result,created_at)
    values(p_request_id,v_user,p_action,v_payload,v_result,v_now);
  return v_result;
end;
$$;

-- Recovery is strictly read-only: no account creation, rollover grant, debit, or run completion.
create or replace function ojjuda_archery_internal.receipt(p_request_id uuid, p_action text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_previous ojjuda_archery_internal.receipts%rowtype; v_snapshot jsonb;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned'); end if;
  v_snapshot:=ojjuda_archery_internal.snapshot(v_user,clock_timestamp());
  if p_request_id is null or p_action is null or p_action not in ('round-start','round-complete','spend','buy','coach-buy') then
    return v_snapshot||jsonb_build_object('ok',false,'reason','invalid','found',false,'receipt',null);
  end if;
  select * into v_previous from ojjuda_archery_internal.receipts where request_id=p_request_id and user_id=v_user;
  if not found then return v_snapshot||jsonb_build_object('found',false,'receipt',null); end if;
  if v_previous.action<>p_action then return v_snapshot||jsonb_build_object('ok',false,'reason','request_conflict','found',false,'receipt',null); end if;
  return v_snapshot||jsonb_build_object('found',true,'receipt',v_previous.result);
end;
$$;

create function public.archery_coach_buy(p_request_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select ojjuda_archery_internal.operate('coach-buy',p_request_id);
$$;
revoke all on function public.archery_coach_buy(uuid) from public, anon;
grant execute on function public.archery_coach_buy(uuid) to authenticated;

-- Keep private snapshots inaccessible even if default function grants change.
revoke all on function ojjuda_archery_internal.snapshot(uuid,timestamptz) from public, anon, authenticated;
revoke all on function ojjuda_archery_internal.operate(text,uuid,uuid,integer),
  ojjuda_archery_internal.receipt(uuid,text) from public, anon;
grant execute on function ojjuda_archery_internal.operate(text,uuid,uuid,integer),
  ojjuda_archery_internal.receipt(uuid,text) to authenticated;

commit;
