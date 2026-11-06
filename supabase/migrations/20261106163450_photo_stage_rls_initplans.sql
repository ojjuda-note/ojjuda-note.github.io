-- Resolve request-scoped identity once per statement, preserving every visibility rule.
alter policy photo_stages_select on public.photo_stages using (
  owner = (select auth.uid())
  or (select public.photo_is_admin())
  or (visibility = 'public' and status = 'approved')
  or (visibility = 'friends' and status = 'approved'
      and public.photo_is_friend(owner, (select auth.uid())))
);

alter policy photo_stages_insert on public.photo_stages with check (
  (select auth.uid()) = owner
  and split_part(image_path, '/', 1) = (select auth.uid())::text
  and (full_path is null or split_part(full_path, '/', 1) = (select auth.uid())::text)
  and plays = 0 and clears = 0 and report_count = 0
  and ((visibility = 'public' and status = 'pending')
       or (visibility in ('friends', 'private') and status = 'approved'))
);

alter policy photo_stages_delete on public.photo_stages using (
  owner = (select auth.uid()) or (select public.photo_is_admin())
);
