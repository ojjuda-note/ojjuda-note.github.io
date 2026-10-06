-- Match Matgo: the immutable registered birth date, measured in Korea time.
-- Photo data and uploads require a non-anonymous member aged at least 19.
create schema if not exists ojjuda_photo_internal;
revoke all on schema ojjuda_photo_internal from public;
grant usage on schema ojjuda_photo_internal to anon, authenticated;

create function ojjuda_photo_internal.member_allowed() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select auth.uid() is not null and exists (
    select 1 from ojjuda_account_internal.member_identity m
    join auth.users u on u.id = m.user_id
    where m.user_id = auth.uid() and u.is_anonymous is not true
      and ojjuda_account_internal.age_on(m.birth_date,(now() at time zone 'Asia/Seoul')::date) >= 19
  );
$$;
revoke all on function ojjuda_photo_internal.member_allowed() from public;
grant execute on function ojjuda_photo_internal.member_allowed() to anon, authenticated;

-- Restrictive policies keep the existing owner, friend and admin rules intact.
create policy photo_stages_adult_select on public.photo_stages as restrictive
  for select to anon, authenticated using ((select ojjuda_photo_internal.member_allowed()));
create policy photo_stages_adult_insert on public.photo_stages as restrictive
  for insert to authenticated with check ((select ojjuda_photo_internal.member_allowed()));

-- Other storage buckets keep their existing access rules.
create policy photo_storage_adult_select on storage.objects as restrictive
  for select to anon, authenticated
  using (bucket_id <> 'photo-stages' or (select ojjuda_photo_internal.member_allowed()));
create policy photo_storage_adult_insert on storage.objects as restrictive
  for insert to authenticated
  with check (bucket_id <> 'photo-stages' or (select ojjuda_photo_internal.member_allowed()));

-- This definer RPC bypasses RLS, so its own eligibility check is required.
create or replace function public.photo_record(p_id uuid, p_cleared boolean) returns void
language sql security definer set search_path = pg_catalog as $$
  update public.photo_stages set plays = plays + case when p_cleared then 0 else 1 end,
    clears = clears + case when p_cleared then 1 else 0 end
  where id = p_id and status = 'approved'
    and ojjuda_photo_internal.member_allowed()
    and (owner = auth.uid() or public.photo_is_admin() or visibility = 'public'
      or (visibility = 'friends' and public.photo_is_friend(owner,auth.uid())));
$$;
revoke all on function public.photo_record(uuid,boolean) from public, anon;
grant execute on function public.photo_record(uuid,boolean) to authenticated;
