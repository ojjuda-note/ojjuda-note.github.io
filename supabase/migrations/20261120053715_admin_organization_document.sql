-- The organization document is private runtime data. Do not commit its payload.
-- Existing app_admins membership remains the source of administrator authority.
create table public.admin_organization_documents (
  id text primary key check (id = 'main'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.admin_organization_documents enable row level security;
revoke all on table public.admin_organization_documents
  from public, anon, authenticated, service_role;
grant select on table public.admin_organization_documents to authenticated;
grant all on table public.admin_organization_documents to service_role;

create policy admin_organization_read
  on public.admin_organization_documents
  for select to authenticated
  using ((select public.is_admin()));

create function public.admin_organization_read()
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $function$
declare
  v_document jsonb;
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select d.payload || pg_catalog.jsonb_build_object('updated_at', d.updated_at)
    into v_document
    from public.admin_organization_documents d
    where d.id = 'main';

  if not found then
    raise exception 'organization_not_ready' using errcode = 'P0002';
  end if;

  return v_document;
end;
$function$;

revoke all on function public.admin_organization_read()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_organization_read() to authenticated;

comment on table public.admin_organization_documents is
  'Administrator-only organization chart and curated responsibilities. Runtime payload is seeded separately; no client writes.';
comment on function public.admin_organization_read() is
  'Read-only organization document for current app_admins members. SECURITY INVOKER retains table RLS.';

notify pgrst, 'reload schema';
