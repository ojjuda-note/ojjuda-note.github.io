create function ojjuda_rewards_internal.settle_referrals(p_as_of timestamptz default now())
returns jsonb language plpgsql set search_path=pg_catalog as $$
declare cfg ojjuda_rewards_internal.policy%rowtype; remaining integer; inserted integer:=0;
 owner_record record; batch_ids uuid[]; award uuid; batch_number integer; made integer:=0; recipient_phone text;
begin
 if p_as_of>clock_timestamp() then raise exception 'future_settlement_not_allowed'; end if;
 select * into strict cfg from ojjuda_rewards_internal.policy where singleton for update;
 select greatest(0,cfg.referral_member_limit-count(*)::integer) into remaining from ojjuda_rewards_internal.qualifications;
 with eligible as (
  select s.id,s.user_id,s.referrer_id,s.created_at+make_interval(days=>cfg.observation_days) as qualified_at,
   ojjuda_rewards_internal.phone_hash(m.phone_number) as member_phone_hash
  from ojjuda_referral_internal.signups s
  join ojjuda_account_internal.member_identity m on m.user_id=s.user_id
  join ojjuda_account_internal.member_identity r on r.user_id=s.referrer_id
  where s.confirmed_at is not null and s.created_at>=cfg.starts_at
   and s.created_at+make_interval(days=>cfg.observation_days)<=p_as_of
   and ojjuda_rewards_internal.exclusion_reason(s.user_id) is null
   and ojjuda_rewards_internal.exclusion_reason(s.referrer_id) is null
   and ojjuda_rewards_internal.phone_hash(m.phone_number)<>ojjuda_rewards_internal.phone_hash(r.phone_number)
   and not exists(select 1 from ojjuda_rewards_internal.qualifications q where q.signup_id=s.id
    or q.member_phone_hash=ojjuda_rewards_internal.phone_hash(m.phone_number))
   and (select count(*) from ojjuda_rewards_internal.activity_days d where d.user_id=s.user_id
    and d.active_day>=(s.created_at at time zone 'Asia/Seoul')::date
    and d.active_day<(s.created_at at time zone 'Asia/Seoul')::date+cfg.observation_days)>=cfg.active_days_required
 ), distinct_people as (
  select distinct on(member_phone_hash) * from eligible order by member_phone_hash,qualified_at,id
 )
 insert into ojjuda_rewards_internal.qualifications(signup_id,user_id,referrer_id,member_phone_hash,qualified_at)
 select id,user_id,referrer_id,member_phone_hash,qualified_at from distinct_people
 order by qualified_at,id limit remaining on conflict do nothing;
 get diagnostics inserted=row_count;
 for owner_record in select referrer_id from ojjuda_rewards_internal.qualifications
  where award_id is null and referrer_id is not null group by referrer_id having count(*)>=cfg.referral_group_size
  order by referrer_id loop
  if ojjuda_rewards_internal.exclusion_reason(owner_record.referrer_id) is not null then continue; end if;
  select ojjuda_rewards_internal.phone_hash(phone_number) into recipient_phone
   from ojjuda_account_internal.member_identity where user_id=owner_record.referrer_id;
  loop
   select array_agg(signup_id order by qualified_at,signup_id) into batch_ids from (
    select signup_id,qualified_at from ojjuda_rewards_internal.qualifications
    where referrer_id=owner_record.referrer_id and award_id is null
    order by qualified_at,signup_id limit cfg.referral_group_size) b;
   exit when coalesce(cardinality(batch_ids),0)<cfg.referral_group_size;
   select count(*)+1 into batch_number from ojjuda_rewards_internal.awards
    where kind='referral' and recipient_id=owner_record.referrer_id;
   insert into ojjuda_rewards_internal.awards(award_key,kind,recipient_id,recipient_phone_hash,amount,status_reason)
    values('referral:'||owner_record.referrer_id||':'||batch_number,'referral',owner_record.referrer_id,
     recipient_phone,cfg.referral_amount,'provider_setup_required') returning id into award;
   update ojjuda_rewards_internal.qualifications set award_id=award where signup_id=any(batch_ids);
   made:=made+1;
  end loop;
 end loop;
 return jsonb_build_object('new_qualified_members',inserted,'new_awards',made,
  'qualified_members',(select count(*) from ojjuda_rewards_internal.qualifications),
  'referral_amount_reserved',coalesce((select sum(amount) from ojjuda_rewards_internal.awards where kind='referral'),0));
end;$$;
revoke all on function ojjuda_rewards_internal.settle_referrals(timestamptz) from public,anon,authenticated;
