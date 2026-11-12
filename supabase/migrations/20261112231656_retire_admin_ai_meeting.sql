-- Retire only the administrator AI meeting. Keep historical records and the
-- shared feedback repair service intact; cached clients lose every entry point.
drop function if exists public.admin_ai_meeting_create_task(uuid, text);
drop function if exists public.admin_ai_meeting_tasks(integer);
drop function if exists public.admin_ai_meeting_task(uuid);
drop function if exists ojjuda_meeting_internal.create_task(uuid, text);
drop function if exists ojjuda_meeting_internal.list_tasks(integer);
drop function if exists ojjuda_meeting_internal.get_task(uuid);
drop function if exists ojjuda_meeting_internal.task_payload(uuid);
drop schema if exists ojjuda_meeting_internal;

revoke all on table public.ai_meeting_messages, public.ai_meeting_tasks
  from public, anon, authenticated, service_role;
alter table public.ai_meeting_messages enable row level security;
alter table public.ai_meeting_tasks enable row level security;
drop policy if exists ai_meeting_admin_read on public.ai_meeting_messages;
drop policy if exists ai_meeting_admin_write_human on public.ai_meeting_messages;
drop policy if exists ai_meeting_tasks_admin_read on public.ai_meeting_tasks;

-- Restrictive guards must remain: other features have broad permissive storage
-- policies. Deny this archived bucket without changing any other bucket.
drop policy if exists ai_meeting_files_admin_read on storage.objects;
drop policy if exists ai_meeting_files_admin_upload on storage.objects;
drop policy if exists ai_meeting_files_owner_cleanup on storage.objects;
alter policy ai_meeting_files_read_isolation on storage.objects
  using (bucket_id <> 'ai-meeting-files');
alter policy ai_meeting_files_upload_isolation on storage.objects
  with check (bucket_id <> 'ai-meeting-files');
alter policy ai_meeting_files_delete_isolation on storage.objects
  using (bucket_id <> 'ai-meeting-files');
-- The existing update guard already denies this bucket in USING and WITH CHECK.

comment on table public.ai_meeting_messages is
  'Retired administrator AI meeting history. No browser or service API access.';
comment on table public.ai_meeting_tasks is
  'Retired meeting-to-feedback links kept as history. No new meeting jobs may be submitted.';
