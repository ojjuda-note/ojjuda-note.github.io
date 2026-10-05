-- Opinions remain open/done (unseen/seen). Codex processing is tracked separately.
create schema if not exists ojjuda_ops;
revoke all on schema ojjuda_ops from public, anon, authenticated;

create table public.feedback_ai_jobs (
  feedback_id bigint primary key references public.feedback(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'needs_review', 'blocked', 'resolved')),
  summary text not null default '' check (char_length(summary) <= 1200),
  result text not null default '' check (char_length(result) <= 12000),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  evidence_url text check (char_length(evidence_url) <= 500),
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_token uuid,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  retry_after timestamptz,
  check (status <> 'running' or (lease_token is not null and claimed_at is not null)),
  check (retry_after is null or status = 'blocked')
);
alter table public.feedback_ai_jobs enable row level security;
revoke all on table public.feedback_ai_jobs from public, anon, authenticated, service_role;
comment on table public.feedback_ai_jobs is
  'Private Codex processing state. Browser clients read only through admin_feedback.';

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
        'updated_at', j.updated_at
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

-- Submission creates one durable event record. External dispatch is configured separately.
create or replace function ojjuda_ops.enqueue_feedback_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.feedback_ai_jobs(feedback_id) values (new.id)
    on conflict (feedback_id) do nothing;
  return new;
end
$function$;
revoke all on function ojjuda_ops.enqueue_feedback_ai() from public, anon, authenticated, service_role;
create trigger feedback_enqueue_codex
  after insert on public.feedback
  for each row execute function ojjuda_ops.enqueue_feedback_ai();

create or replace function ojjuda_ops.claim_feedback_ai(p_feedback_id bigint)
returns json
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  claimed json;
begin
  if p_feedback_id is null then
    raise exception 'feedback_id_required' using errcode = '22023';
  end if;
  -- An explicit ID also permits a manual request for an older opinion. No queue scan.
  insert into public.feedback_ai_jobs(feedback_id)
    select f.id from public.feedback f where f.id = p_feedback_id
    on conflict (feedback_id) do nothing;

  -- A crashed third attempt becomes an explicit hold, never an infinite retry.
  update public.feedback_ai_jobs
  set status = 'blocked', lease_token = null, retry_after = null,
    summary = '자동 처리 시도 한도에 도달했습니다.',
    result = '세 번째 처리의 실행 시간이 초과되었습니다. 관리자가 원인을 확인한 뒤 재개해야 합니다.',
    updated_at = clock_timestamp()
  where feedback_id = p_feedback_id and status = 'running' and attempts >= 3
    and claimed_at <= clock_timestamp() - interval '2 hours';

  with candidate as (
    select j.feedback_id
    from public.feedback_ai_jobs j
    where j.feedback_id = p_feedback_id and j.attempts < 3 and (
      j.status = 'queued'
      or (j.status = 'running' and j.claimed_at <= clock_timestamp() - interval '2 hours')
      or (j.status = 'blocked' and j.retry_after is not null and j.retry_after <= clock_timestamp())
    )
    for update of j skip locked limit 1
  ), claimed_job as (
    update public.feedback_ai_jobs j
    set status = 'running', attempts = j.attempts + 1,
      lease_token = gen_random_uuid(), claimed_at = clock_timestamp(),
      retry_after = null, updated_at = clock_timestamp()
    from candidate c where j.feedback_id = c.feedback_id
    returning j.feedback_id, j.lease_token, j.attempts
  )
  select json_build_object(
    'feedback_id', j.feedback_id, 'lease_token', j.lease_token,
    'kind', f.kind, 'body', f.body, 'screen', f.screen,
    'app_version', f.app_version, 'user_agent', f.user_agent,
    'attempts', j.attempts
  ) into claimed
  from claimed_job j join public.feedback f on f.id = j.feedback_id;
  return claimed;
end
$function$;
revoke all on function ojjuda_ops.claim_feedback_ai(bigint) from public, anon, authenticated, service_role;

-- Workers must renew immediately before publishing code or changing remote state.
create or replace function ojjuda_ops.renew_feedback_ai(p_feedback_id bigint, p_lease_token uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  renewed boolean;
begin
  update public.feedback_ai_jobs j
  set claimed_at = clock_timestamp(), updated_at = clock_timestamp()
  where j.feedback_id = p_feedback_id and j.status = 'running'
    and j.lease_token = p_lease_token
    and j.claimed_at > clock_timestamp() - interval '2 hours'
  returning true into renewed;
  return coalesce(renewed, false);
end
$function$;
revoke all on function ojjuda_ops.renew_feedback_ai(bigint, uuid) from public, anon, authenticated, service_role;

create or replace function ojjuda_ops.finish_feedback_ai(
  p_feedback_id bigint,
  p_lease_token uuid,
  p_status text,
  p_summary text,
  p_result text,
  p_priority text,
  p_evidence_url text default null,
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
  then
    raise exception 'invalid_feedback_ai_result' using errcode = '22023';
  end if;
  if (p_status = 'resolved' and (p_evidence_url is null
      or p_evidence_url !~ '^https://github[.]com/ojjuda-note/ojjuda-note[.]github[.]io/commit/[0-9a-f]{40}$'))
    or (p_evidence_url is not null and (
      char_length(p_evidence_url) > 500
      or p_evidence_url !~ '^https://github[.]com/ojjuda-note/ojjuda-note[.]github[.]io/(commit/[0-9a-f]{40}|pull/[1-9][0-9]*|actions/runs/[1-9][0-9]*)$'
    ))
  then
    raise exception 'invalid_feedback_ai_evidence' using errcode = '22023';
  end if;
  if p_retry_after is not null and (
    p_status <> 'blocked' or p_retry_after <= clock_timestamp() or not isfinite(p_retry_after)
  ) then
    raise exception 'invalid_feedback_ai_retry' using errcode = '22023';
  end if;

  update public.feedback_ai_jobs j
  set status = p_status, summary = p_summary, result = p_result, priority = p_priority,
    evidence_url = p_evidence_url, lease_token = null,
    retry_after = case when p_status = 'blocked' and j.attempts < 3 then p_retry_after else null end,
    updated_at = clock_timestamp()
  where j.feedback_id = p_feedback_id and j.status = 'running' and j.lease_token = p_lease_token
    and j.claimed_at > clock_timestamp() - interval '2 hours'
  returning json_build_object('feedback_id', j.feedback_id, 'status', j.status,
    'updated_at', j.updated_at) into finished;
  if finished is null then
    raise exception 'feedback_ai_lease_lost' using errcode = '55000';
  end if;
  return finished;
end
$function$;
revoke all on function ojjuda_ops.finish_feedback_ai(bigint, uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
