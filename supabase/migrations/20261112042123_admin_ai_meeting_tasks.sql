-- An explicit administrator request connects one saved human message to the
-- existing feedback worker. Its trigger retains all quotas and dispatch checks.
create schema ojjuda_meeting_internal;
revoke all on schema ojjuda_meeting_internal from public, anon, authenticated, service_role;
grant usage on schema ojjuda_meeting_internal to authenticated;

create table public.ai_meeting_tasks (
  message_id uuid primary key references public.ai_meeting_messages(id) on delete cascade,
  feedback_id bigint not null unique references public.feedback(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);
create index ai_meeting_tasks_recent_idx
  on public.ai_meeting_tasks (created_at desc, message_id desc);
create index ai_meeting_tasks_requester_idx
  on public.ai_meeting_tasks (requested_by);

alter table public.ai_meeting_tasks enable row level security;
revoke all on public.ai_meeting_tasks from public, anon, authenticated, service_role;
grant select on public.ai_meeting_tasks to authenticated;
create policy ai_meeting_tasks_admin_read on public.ai_meeting_tasks
  for select to authenticated using ((select public.is_admin()));

-- This projection is callable only by the guarded, private functions below.
-- Never return dispatch nonces, leases, request payloads, or worker credentials.
create function ojjuda_meeting_internal.task_payload(p_message_id uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'message_id', t.message_id,
    'feedback_id', t.feedback_id,
    'requested_by', t.requested_by,
    'kind', f.kind,
    'content', f.body,
    'target_role', m.target_role,
    'created_at', t.created_at,
    'status', j.status,
    'summary', j.summary,
    'result', j.result,
    'priority', j.priority,
    'evidence_url', j.evidence_url,
    'worker_run_id', j.worker_run_id,
    'dispatch_status', j.dispatch_status,
    'dispatch_error', j.dispatch_error,
    'updated_at', coalesce(j.updated_at, t.created_at)
  )
  from public.ai_meeting_tasks t
  join public.ai_meeting_messages m on m.id = t.message_id
  join public.feedback f on f.id = t.feedback_id
  left join public.feedback_ai_jobs j on j.feedback_id = t.feedback_id
  where t.message_id = p_message_id;
$function$;
revoke all on function ojjuda_meeting_internal.task_payload(uuid)
  from public, anon, authenticated, service_role;

create function ojjuda_meeting_internal.create_task(p_message_id uuid, p_kind text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  source_message public.ai_meeting_messages%rowtype;
  existing_kind text;
  feedback_id bigint;
  executor_enabled boolean;
  task_content text;
begin
  if actor is null or not coalesce(public.is_admin(), false) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('bug', 'idea') then
    raise exception 'invalid_task_kind' using errcode = '22023';
  end if;

  -- The saved representative's message is the only instruction source. Locking
  -- it before checking the link also serializes retries from different clients.
  select m.* into source_message
  from public.ai_meeting_messages m
  where m.id = p_message_id and m.room = 'hq'
    and m.created_by = actor and m.sender_kind = 'human'
    and m.sender_role = 'representative' and m.reply_to is null
  for update;
  if not found then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;

  select f.kind into existing_kind
  from public.ai_meeting_tasks t
  join public.feedback f on f.id = t.feedback_id
  where t.message_id = p_message_id;
  if found then
    if existing_kind is distinct from p_kind then
      raise exception 'task_kind_conflict' using errcode = '22023';
    end if;
    return ojjuda_meeting_internal.task_payload(p_message_id);
  end if;

  task_content := btrim(source_message.content);
  if char_length(task_content) not between 1 and 2000
    or task_content = '첨부파일을 공유했어요.' then
    raise exception 'invalid_task_content' using errcode = '22023';
  end if;

  -- Keep the existing executor switch authoritative. This is the same row lock
  -- acquired by the feedback trigger, so disabling cannot race a new request.
  select c.enabled into executor_enabled
  from ojjuda_ops.feedback_codex_config c
  where c.singleton
  for update;
  if not coalesce(executor_enabled, false) then
    raise exception 'executor_unavailable' using errcode = '55000';
  end if;

  insert into public.feedback (user_id, kind, body, screen)
  values (actor, p_kind, task_content, 'admin:ai-meeting')
  returning id into feedback_id;

  insert into public.ai_meeting_tasks (message_id, feedback_id, requested_by)
  values (p_message_id, feedback_id, actor);

  -- Both inserts and the trigger's reservation commit together. A dispatch
  -- failure remains a saved task with its real failure state, never "completed".
  return ojjuda_meeting_internal.task_payload(p_message_id);
end
$function$;
revoke all on function ojjuda_meeting_internal.create_task(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function ojjuda_meeting_internal.create_task(uuid, text) to authenticated;

create function ojjuda_meeting_internal.list_tasks(p_limit integer)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_task_limit' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(
      ojjuda_meeting_internal.task_payload(t.message_id)
      order by t.created_at desc, t.message_id desc
    )
    from (
      select message_id, created_at
      from public.ai_meeting_tasks
      order by created_at desc, message_id desc
      limit p_limit
    ) t
  ), '[]'::jsonb);
end
$function$;
revoke all on function ojjuda_meeting_internal.list_tasks(integer)
  from public, anon, authenticated, service_role;
grant execute on function ojjuda_meeting_internal.list_tasks(integer) to authenticated;

-- Only invoker wrappers live in the exposed schema. Every private entry point
-- verifies the current administrator again, including direct SQL calls.
create function public.admin_ai_meeting_create_task(p_message_id uuid, p_kind text)
returns jsonb
language sql volatile security invoker
set search_path = ''
as $function$
  select ojjuda_meeting_internal.create_task(p_message_id, p_kind);
$function$;
revoke all on function public.admin_ai_meeting_create_task(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_ai_meeting_create_task(uuid, text) to authenticated;

create function public.admin_ai_meeting_tasks(p_limit integer default 30)
returns jsonb
language sql stable security invoker
set search_path = ''
as $function$
  select ojjuda_meeting_internal.list_tasks(p_limit);
$function$;
revoke all on function public.admin_ai_meeting_tasks(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_ai_meeting_tasks(integer) to authenticated;

comment on table public.ai_meeting_tasks is
  'Administrator-approved meeting messages linked to the existing feedback worker. Execution state and evidence stay in feedback_ai_jobs.';
comment on function public.admin_ai_meeting_create_task(uuid, text) is
  'Idempotently request a site bug fix or feature improvement from an owned human meeting message.';
comment on function public.admin_ai_meeting_tasks(integer) is
  'Administrator-only task status and evidence; no dispatcher or worker credentials.';
