create function ojjuda_rewards_internal.admin_summary()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'not_admin' using errcode='42501'; end if;
 select jsonb_build_object(
  'policy',(select to_jsonb(p) from ojjuda_rewards_internal.policy p),
  'qualified_members',(select count(*) from ojjuda_rewards_internal.qualifications),
  'reserved_amount',coalesce((select sum(amount) from ojjuda_rewards_internal.awards where kind='referral'),0),
  'sent_amount',coalesce((select sum(amount) from ojjuda_rewards_internal.awards where kind='referral' and status='sent'),0),
  'excluded_numbers',(select count(*) from ojjuda_rewards_internal.excluded_phones),
  'pending_awards',(select count(*) from ojjuda_rewards_internal.awards where status='awaiting_provider'),
  'referrers',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select p.nickname,count(*) as qualified_members,count(q.award_id) as allocated_members
    from ojjuda_rewards_internal.qualifications q join public.profiles p on p.id=q.referrer_id
    group by p.id,p.nickname order by count(*) desc,p.nickname limit 50) x),'[]'::jsonb),
  'awards',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select a.kind,p.nickname,a.amount,a.game,a.month_start,a.status,a.status_reason,a.created_at,a.sent_at
    from ojjuda_rewards_internal.awards a left join public.profiles p on p.id=a.recipient_id
    order by a.created_at desc,a.id limit 100) x),'[]'::jsonb),
  'monthly_results',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select month_start,game,winner_label,score,reason,captured_at from ojjuda_rewards_internal.monthly_results
    order by month_start desc,game limit 100) x),'[]'::jsonb)
 ) into result;
 return result;
end;$$;
create function public.admin_reward_summary()
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select ojjuda_rewards_internal.admin_summary();
$$;
revoke all on function ojjuda_rewards_internal.admin_summary() from public,anon,authenticated;
revoke all on function public.admin_reward_summary() from public,anon,authenticated;
grant usage on schema ojjuda_rewards_internal to authenticated;
grant execute on function ojjuda_rewards_internal.admin_summary() to authenticated;
grant execute on function public.admin_reward_summary() to authenticated;

-- Independently idempotent jobs. Neither job buys or sends a coupon.
select cron.schedule('ojjuda_referral_reward_accounting','17 * * * *','select ojjuda_rewards_internal.settle_referrals();');
select cron.schedule('ojjuda_month_end_reward_snapshot','59 14 * * *','select ojjuda_rewards_internal.capture_month_end();');
