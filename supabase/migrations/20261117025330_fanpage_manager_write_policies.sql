-- The SELECT policy already includes all administrators. Restrict the other
-- administrator policies to their individual writes, preserving the ban check.
alter policy fanpage_create on public.fanpage_pages
  with check ((select public.is_admin()) and not (select public.is_banned((select auth.uid()))));

drop policy fanpage_manager_admin on public.fanpage_managers;
create policy fanpage_manager_insert on public.fanpage_managers for insert to authenticated
  with check ((select public.is_admin()) and not (select public.is_banned((select auth.uid()))));
create policy fanpage_manager_update on public.fanpage_managers for update to authenticated
  using ((select public.is_admin()) and not (select public.is_banned((select auth.uid()))))
  with check ((select public.is_admin()) and not (select public.is_banned((select auth.uid()))));
create policy fanpage_manager_delete on public.fanpage_managers for delete to authenticated
  using ((select public.is_admin()) and not (select public.is_banned((select auth.uid()))));
