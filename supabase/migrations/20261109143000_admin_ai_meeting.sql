-- Private, admin-only chat room for the representative and AI roles.
-- Do not expose this data through an anonymous policy.
create table public.ai_meeting_messages (
  id uuid primary key default gen_random_uuid(),
  room text not null default 'hq' check (room = 'hq'),
  created_by uuid not null references auth.users(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('human', 'ai')),
  sender_role text not null check (sender_role in (
    'representative', 'director', 'growth', 'marketing', 'quality',
    'ux', 'platform', 'design'
  )),
  target_role text not null default 'director' check (target_role in (
    'all', 'director', 'growth', 'marketing', 'quality',
    'ux', 'platform', 'design'
  )),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  file_path text check (file_path is null or char_length(file_path) between 3 and 500),
  file_name text check (file_name is null or char_length(file_name) between 1 and 180),
  reply_to uuid references public.ai_meeting_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ai_meeting_file_pair check ((file_path is null) = (file_name is null)),
  constraint ai_meeting_human_only check (
    (sender_kind = 'human' and sender_role = 'representative' and reply_to is null)
    or (sender_kind = 'ai' and sender_role <> 'representative' and reply_to is not null)
  )
);

create index ai_meeting_room_recent_idx
  on public.ai_meeting_messages (room, created_at desc, id desc);
create index ai_meeting_actor_recent_idx
  on public.ai_meeting_messages (created_by, sender_kind, created_at desc);
create index ai_meeting_reply_idx
  on public.ai_meeting_messages (reply_to);
create unique index ai_meeting_one_role_per_reply_idx
  on public.ai_meeting_messages (reply_to, sender_role)
  where sender_kind = 'ai';

alter table public.ai_meeting_messages enable row level security;
revoke all on public.ai_meeting_messages from public, anon;
grant select, insert on public.ai_meeting_messages to authenticated;
grant select, insert on public.ai_meeting_messages to service_role;

create policy ai_meeting_admin_read on public.ai_meeting_messages
  for select to authenticated
  using ((select public.is_admin()));
create policy ai_meeting_admin_write_human on public.ai_meeting_messages
  for insert to authenticated
  with check (
    (select public.is_admin())
    and created_by = (select auth.uid())
    and sender_kind = 'human'
    and sender_role = 'representative'
    and reply_to is null
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-meeting-files', 'ai-meeting-files', false, 8388608,
  array['image/jpeg', 'image/png', 'application/pdf', 'text/plain']::text[]
)
on conflict (id) do nothing;

-- Only administrators may see a file. Upload paths are scoped to their user id.
create policy ai_meeting_files_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'ai-meeting-files' and (select public.is_admin()));
create policy ai_meeting_files_admin_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ai-meeting-files'
    and (select public.is_admin())
    and split_part(name, '/', 1) = (select auth.uid())::text
  );
create policy ai_meeting_files_owner_cleanup on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ai-meeting-files'
    and (select public.is_admin())
    and split_part(name, '/', 1) = (select auth.uid())::text
  );
