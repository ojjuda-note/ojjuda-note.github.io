-- Disabled until the authenticated Edge gateway and private worker are deployed.
create extension if not exists pg_net with schema extensions;

create table ojjuda_ops.feedback_codex_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  per_user_daily_limit integer not null default 10 check (per_user_daily_limit >= 0),
  global_daily_limit integer not null default 100 check (global_daily_limit >= 0),
  endpoint text not null default 'https://ziezbdjofcugznowiuda.supabase.co/functions/v1/feedback-codex'
    check (endpoint = 'https://ziezbdjofcugznowiuda.supabase.co/functions/v1/feedback-codex')
);
insert into ojjuda_ops.feedback_codex_config(singleton) values (true);
alter table ojjuda_ops.feedback_codex_config enable row level security;
revoke all on table ojjuda_ops.feedback_codex_config from public, anon, authenticated, service_role;

-- Successful outbound reservations only. These counters deliberately have no
-- feedback/profile FK: deleting an opinion or account must not refund its spend.
create table ojjuda_ops.feedback_codex_daily_usage (
  usage_day date primary key,
  dispatch_count integer not null check (dispatch_count >= 0)
);
create table ojjuda_ops.feedback_codex_user_daily_usage (
  usage_day date not null,
  user_id uuid not null,
  dispatch_count integer not null check (dispatch_count >= 0),
  primary key (usage_day, user_id)
);
alter table ojjuda_ops.feedback_codex_daily_usage enable row level security;
alter table ojjuda_ops.feedback_codex_user_daily_usage enable row level security;
revoke all on table ojjuda_ops.feedback_codex_daily_usage,
  ojjuda_ops.feedback_codex_user_daily_usage from public, anon, authenticated, service_role;

alter table public.feedback_ai_jobs
  add column dispatch_nonce uuid not null default gen_random_uuid(),
  add column dispatch_status text not null default 'pending'
    check (dispatch_status in ('pending', 'dispatching', 'dispatched', 'failed')),
  add column dispatch_error text check (char_length(dispatch_error) <= 400),
  add column dispatch_request_id bigint,
  add column dispatch_run_id text check (dispatch_run_id ~ '^[1-9][0-9]{0,19}$'),
  add column dispatched_at timestamptz,
  add column worker_run_id text check (worker_run_id ~ '^[1-9][0-9]{0,19}$');
create unique index feedback_ai_worker_run_once on public.feedback_ai_jobs(worker_run_id)
  where worker_run_id is not null;
create unique index feedback_ai_dispatch_run_once on public.feedback_ai_jobs(dispatch_run_id)
  where dispatch_run_id is not null;
-- The per-event nonce must not be exposed through generic API privileges.
revoke all on table public.feedback_ai_jobs from public, anon, authenticated, service_role;
revoke all on table net.http_request_queue, net._http_response from public, anon, authenticated;

create or replace function ojjuda_ops.enqueue_feedback_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event_nonce uuid;
  destination text;
  request_id bigint;
  usage_day_kst date;
  user_daily_limit integer;
  total_daily_limit integer;
begin
  insert into public.feedback_ai_jobs(feedback_id) values (new.id)
    on conflict (feedback_id) do nothing
    returning dispatch_nonce into event_nonce;
  if event_nonce is null then return new; end if;
  -- pg_net sends only after commit. This subtransaction isolates outbound failure
  -- from the user's successfully saved opinion and durable queued job, and rolls
  -- back the HTTP request and both counters together on any reservation failure.
  begin
    -- Every dispatch serializes on this private, fixed row, including a day with
    -- no usage rows yet. Read the clock only after obtaining the lock so waiting
    -- transactions use the actual KST calendar day, not their start time.
    select c.endpoint, c.per_user_daily_limit, c.global_daily_limit
      into destination, user_daily_limit, total_daily_limit
    from ojjuda_ops.feedback_codex_config c
    where c.singleton and c.enabled for update;
    if destination is null then return new; end if;
    usage_day_kst := (clock_timestamp() at time zone 'Asia/Seoul')::date;

    if new.user_id is null then
      update public.feedback_ai_jobs
      set dispatch_status = 'failed',
        dispatch_error = '자동 처리에 필요한 회원 정보가 없습니다. 의견은 정상적으로 저장되었습니다.',
        updated_at = clock_timestamp()
      where feedback_id = new.id;
      return new;
    end if;
    if coalesce((select u.dispatch_count from ojjuda_ops.feedback_codex_daily_usage u
        where u.usage_day = usage_day_kst), 0) >= total_daily_limit
      or coalesce((select u.dispatch_count from ojjuda_ops.feedback_codex_user_daily_usage u
        where u.usage_day = usage_day_kst and u.user_id = new.user_id), 0) >= user_daily_limit
    then
      update public.feedback_ai_jobs
      set dispatch_status = 'failed',
        dispatch_error = '오늘 자동처리 한도에 도달했습니다. 의견은 정상적으로 저장되었으며 관리자가 확인할 수 있습니다.',
        updated_at = clock_timestamp()
      where feedback_id = new.id;
      return new;
    end if;

    select net.http_post(
      url := destination,
      body := jsonb_build_object('action', 'dispatch', 'feedback_id', new.id,
        'dispatch_nonce', event_nonce),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 10000
    ) into request_id;
    if request_id is null then raise exception 'request_not_queued'; end if;
    insert into ojjuda_ops.feedback_codex_daily_usage(usage_day, dispatch_count)
      values (usage_day_kst, 1)
      on conflict (usage_day) do update
        set dispatch_count = ojjuda_ops.feedback_codex_daily_usage.dispatch_count + 1;
    insert into ojjuda_ops.feedback_codex_user_daily_usage(usage_day, user_id, dispatch_count)
      values (usage_day_kst, new.user_id, 1)
      on conflict (usage_day, user_id) do update
        set dispatch_count = ojjuda_ops.feedback_codex_user_daily_usage.dispatch_count + 1;
    update public.feedback_ai_jobs set dispatch_request_id = request_id
      where feedback_id = new.id;
  exception when others then
    update public.feedback_ai_jobs
    set dispatch_status = 'failed',
      dispatch_error = '실행 요청을 보내지 못했습니다. 관리자가 연결 상태를 확인해야 합니다.',
      updated_at = clock_timestamp()
    where feedback_id = new.id;
  end;
  return new;
end
$function$;
revoke all on function ojjuda_ops.enqueue_feedback_ai() from public, anon, authenticated, service_role;

create or replace function public.admin_feedback(st text)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return coalesce((select json_agg(x) from (
    select f.id, f.kind, f.body, f.screen, f.app_version, f.user_agent,
      f.status, f.created_at, p.nickname,
      case when j.feedback_id is null then null else json_build_object(
        'status', j.status, 'summary', j.summary, 'result', j.result,
        'priority', j.priority, 'evidence_url', j.evidence_url,
        'updated_at', j.updated_at, 'dispatch_status', j.dispatch_status,
        'dispatch_error', j.dispatch_error
      ) end as ai
    from public.feedback f
    left join public.profiles p on p.id = f.user_id
    left join public.feedback_ai_jobs j on j.feedback_id = f.id
    where f.status = st order by f.created_at desc limit 100
  ) x), '[]'::json);
end
$function$;
revoke all on function public.admin_feedback(text) from public, anon;
grant execute on function public.admin_feedback(text) to authenticated;

-- Preserve the manual finish contract and additionally allow the bound private
-- worker's Actions run as evidence for needs_review/blocked, never resolved.
create or replace function ojjuda_ops.finish_feedback_ai(
  p_feedback_id bigint, p_lease_token uuid, p_status text, p_summary text,
  p_result text, p_priority text, p_evidence_url text default null,
  p_retry_after timestamptz default null
)
returns json
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  finished json;
begin
  if p_feedback_id is null or p_lease_token is null
    or p_status is null or p_status not in ('needs_review', 'blocked', 'resolved')
    or p_priority is null or p_priority not in ('low', 'normal', 'high')
    or p_summary is null or char_length(btrim(p_summary)) = 0 or char_length(p_summary) > 1200
    or p_result is null or char_length(btrim(p_result)) = 0 or char_length(p_result) > 12000
  then raise exception 'invalid_feedback_ai_result' using errcode = '22023'; end if;
  if (p_status = 'resolved' and (p_evidence_url is null
      or p_evidence_url !~ '^https://github[.]com/ojjuda-note/ojjuda-note[.]github[.]io/commit/[0-9a-f]{40}$'))
    or (p_evidence_url is not null and (
      char_length(p_evidence_url) > 500
      or (p_evidence_url !~ '^https://github[.]com/ojjuda-note/ojjuda-note[.]github[.]io/(commit/[0-9a-f]{40}|pull/[1-9][0-9]*|actions/runs/[1-9][0-9]*)$'
        and not (p_status in ('needs_review', 'blocked') and exists (
          select 1 from public.feedback_ai_jobs j where j.feedback_id = p_feedback_id
            and j.worker_run_id is not null
            and p_evidence_url = 'https://github.com/ojjuda-note/ojjuda-codex-worker/actions/runs/' || j.worker_run_id
        )))
    ))
  then raise exception 'invalid_feedback_ai_evidence' using errcode = '22023'; end if;
  if p_retry_after is not null and (
    p_status <> 'blocked' or p_retry_after <= clock_timestamp() or not isfinite(p_retry_after)
  ) then raise exception 'invalid_feedback_ai_retry' using errcode = '22023'; end if;
  update public.feedback_ai_jobs j
  set status = p_status, summary = p_summary, result = p_result, priority = p_priority,
    evidence_url = p_evidence_url, lease_token = null,
    retry_after = case when p_status = 'blocked' and j.attempts < 3 then p_retry_after else null end,
    updated_at = clock_timestamp()
  where j.feedback_id = p_feedback_id and j.status = 'running' and j.lease_token = p_lease_token
    and j.claimed_at > clock_timestamp() - interval '2 hours'
  returning json_build_object('feedback_id', j.feedback_id, 'status', j.status,
    'updated_at', j.updated_at) into finished;
  if finished is null then raise exception 'feedback_ai_lease_lost' using errcode = '55000'; end if;
  return finished;
end
$function$;
revoke all on function ojjuda_ops.finish_feedback_ai(bigint, uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;

-- Only the gateway's server service_role may call this fixed-action bridge.
-- It must authenticate the nonce for dispatch and GitHub OIDC for worker actions.
create or replace function public.feedback_codex_bridge(p_action text, p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_id bigint;
  event_nonce uuid;
  run_id text;
  lease uuid;
  job public.feedback_ai_jobs%rowtype;
  claimed json;
  outcome json;
  requested_status text;
  safe_error text;
begin
  if p_action is null or p_action not in ('dispatch_claim', 'dispatch_finish', 'worker_claim', 'worker_renew', 'worker_finish')
    or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 65536
    or coalesce(p_payload->>'feedback_id', '') !~ '^[1-9][0-9]{0,18}$'
    or coalesce(p_payload->>'dispatch_nonce', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then raise exception 'invalid_feedback_codex_request' using errcode = '22023'; end if;
  begin
    target_id := (p_payload->>'feedback_id')::bigint;
    event_nonce := (p_payload->>'dispatch_nonce')::uuid;
  exception when others then
    raise exception 'invalid_feedback_codex_request' using errcode = '22023';
  end;
  select j.* into job from public.feedback_ai_jobs j
    where j.feedback_id = target_id and j.dispatch_nonce = event_nonce for update;
  if not found then return null; end if;

  if p_action = 'dispatch_claim' then
    -- Only the trigger's quota-reserved event may start a billable worker.
    if job.status <> 'queued' or job.dispatch_status <> 'pending'
      or job.dispatch_request_id is null then return null; end if;
    update public.feedback_ai_jobs set dispatch_status = 'dispatching', dispatch_error = null,
      updated_at = clock_timestamp() where feedback_id = target_id;
    return json_build_object('feedback_id', target_id, 'dispatch_nonce', event_nonce);
  elsif p_action = 'dispatch_finish' then
    requested_status := p_payload->>'status';
    if requested_status is null or requested_status not in ('dispatched', 'failed') then
      raise exception 'invalid_feedback_codex_dispatch_result' using errcode = '22023';
    end if;
    if job.dispatch_status <> 'dispatching' then return null; end if;
    if requested_status = 'dispatched' then
      run_id := p_payload->>'run_id';
      if run_id is null or run_id !~ '^[1-9][0-9]{0,19}$' then
        raise exception 'invalid_feedback_codex_run' using errcode = '22023';
      end if;
      if exists (select 1 from public.feedback_ai_jobs j where j.dispatch_run_id = run_id) then
        return null;
      end if;
    end if;
    safe_error := case p_payload->>'error_code'
      when 'github_unavailable' then 'GitHub에 연결하지 못했습니다. 관리자 확인이 필요합니다.'
      when 'github_unauthorized' then 'GitHub 실행 권한을 확인해야 합니다.'
      when 'github_rate_limited' then 'GitHub 요청 한도로 실행하지 못했습니다. 관리자 확인이 필요합니다.'
      when 'github_rejected' then 'GitHub가 실행 요청을 거절했습니다. 관리자 확인이 필요합니다.'
      when 'worker_unconfigured' then '자동 처리 실행기 설정을 완료해야 합니다.'
      else '자동 처리 실행 요청을 완료하지 못했습니다. 관리자 확인이 필요합니다.' end;
    update public.feedback_ai_jobs
    set dispatch_status = requested_status,
      dispatch_run_id = case when requested_status = 'dispatched' then run_id else null end,
      dispatch_error = case when requested_status = 'failed' then safe_error else null end,
      dispatched_at = case when requested_status = 'dispatched' then clock_timestamp() else null end,
      updated_at = clock_timestamp()
    where feedback_id = target_id
    returning json_build_object('feedback_id', feedback_id, 'dispatch_status', dispatch_status) into outcome;
    return outcome;
  end if;

  run_id := p_payload->>'run_id';
  if run_id is null or run_id !~ '^[1-9][0-9]{0,19}$' then
    raise exception 'invalid_feedback_codex_run' using errcode = '22023';
  end if;
  if p_action = 'worker_claim' then
    if job.dispatch_status <> 'dispatched' or job.dispatch_run_id is distinct from run_id or job.status <> 'queued'
      or job.worker_run_id is not null
      or exists (select 1 from public.feedback_ai_jobs j where j.worker_run_id = run_id)
    then return null; end if;
    claimed := ojjuda_ops.claim_feedback_ai(target_id);
    if claimed is null then return null; end if;
    update public.feedback_ai_jobs set worker_run_id = run_id where feedback_id = target_id;
    return (claimed::jsonb || jsonb_build_object('run_id', run_id))::json;
  end if;

  if coalesce(p_payload->>'lease_token', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'invalid_feedback_codex_lease' using errcode = '22023';
  end if;
  lease := (p_payload->>'lease_token')::uuid;
  if job.worker_run_id is distinct from run_id or job.status <> 'running'
    or job.lease_token is distinct from lease
  then return null; end if;
  if p_action = 'worker_renew' then
    return to_json(ojjuda_ops.renew_feedback_ai(target_id, lease));
  end if;
  return ojjuda_ops.finish_feedback_ai(target_id, lease, p_payload->>'status',
    p_payload->>'summary', p_payload->>'result', p_payload->>'priority',
    p_payload->>'evidence_url', null);
end
$function$;
revoke all on function public.feedback_codex_bridge(text, jsonb) from public, anon, authenticated;
grant execute on function public.feedback_codex_bridge(text, jsonb) to service_role;
