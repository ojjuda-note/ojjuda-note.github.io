-- Private DonFlow account snapshots. No new service or paid resource.
create table public.life_donflow_snapshots (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  revision uuid not null,
  payload jsonb not null check (coalesce(jsonb_typeof(payload) = 'object' and payload->>'version' = '1'
    and jsonb_typeof(payload->'tables') = 'object' and jsonb_typeof(payload->'tables'->'transactions') = 'array'
    and jsonb_typeof(payload->'tables'->'categories') = 'array' and octet_length(payload::text) <= 5242880, false)),
  updated_at timestamptz not null default now()
);
alter table public.life_donflow_snapshots enable row level security;
revoke all on public.life_donflow_snapshots from public, anon, authenticated;
grant select, insert on public.life_donflow_snapshots to authenticated;
grant update (revision, payload, updated_at) on public.life_donflow_snapshots to authenticated;
create policy own_select on public.life_donflow_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create policy own_insert on public.life_donflow_snapshots for insert to authenticated with check ((select auth.uid()) = user_id);
create policy own_update on public.life_donflow_snapshots for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.life_donflow_save(p_expected uuid, p_revision uuid, p_payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare saved uuid;
begin
  if auth.uid() is null or p_revision is null then raise exception 'authentication required' using errcode='42501'; end if;
  -- A timed-out successful request can be retried without duplicating or overwriting.
  select revision into saved from public.life_donflow_snapshots where user_id = auth.uid() and revision=p_revision and payload=p_payload;
  if saved is not null then return saved; end if;
  if p_expected is null then
    insert into public.life_donflow_snapshots(user_id,revision,payload)
      values(auth.uid(),p_revision,p_payload) on conflict (user_id) do nothing returning revision into saved;
  else
    update public.life_donflow_snapshots set revision=p_revision,payload=p_payload,updated_at=now()
      where user_id=auth.uid() and revision=p_expected returning revision into saved;
  end if;
  if saved is null then raise exception 'snapshot conflict' using errcode='40001'; end if;
  return saved;
end; $$;
revoke all on function public.life_donflow_save(uuid,uuid,jsonb) from public,anon;
grant execute on function public.life_donflow_save(uuid,uuid,jsonb) to authenticated;
