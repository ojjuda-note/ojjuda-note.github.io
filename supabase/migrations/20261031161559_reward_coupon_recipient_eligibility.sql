-- Coupon administrators inspect a different member's eligibility. The public
-- is_banned RPC is deliberately caller-scoped, even inside SECURITY DEFINER
-- callers, so it cannot be used for this private recipient lookup.
-- Preserve the existing ban rule, invoker mode, and private function privileges.
create or replace function ojjuda_rewards_internal.exclusion_reason(p_user uuid)
returns text language sql stable security invoker set search_path=pg_catalog as $$
 select case
  when p_user is null then 'not_a_member'
  when exists(select 1 from public.app_admins where user_id=p_user)
    or exists(select 1 from ojjuda_rewards_internal.excluded_users where user_id=p_user) then 'admin_excluded'
  when exists(select 1 from ojjuda_account_internal.member_identity m join ojjuda_rewards_internal.excluded_phones e
    on e.phone_hash=ojjuda_rewards_internal.phone_hash(m.phone_number) where m.user_id=p_user) then 'admin_phone_excluded'
  when not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and is_anonymous is not true) then 'unconfirmed_member'
  when exists(select 1 from public.user_private p
    where p.user_id=p_user and p.banned_until is not null and p.banned_until>now()) then 'banned'
  when not exists(select 1 from ojjuda_account_internal.member_identity where user_id=p_user
    and ojjuda_rewards_internal.phone_hash(phone_number) is not null) then 'missing_phone'
  else null end;
$$;
