-- Run through the authorized database connection. All fixture changes roll back.
begin;
create temporary table reward_test_results(check_name text,passed boolean) on commit drop;
create function pg_temp.reward_fixture(p_number integer,p_created timestamptz) returns uuid
language plpgsql as $$ declare u uuid:=gen_random_uuid(); begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
 values(u,'authenticated','authenticated','reward-fixture-'||u||'@example.invalid','invalid-test-only-hash',p_created,p_created,p_created,
  jsonb_build_object('age_14_or_older',true,'terms_version','test-only','birth_yymmdd','900101','gender_code','1','phone_number','01095'||lpad(p_number::text,6,'0')));
 insert into public.profiles(id,nickname) values(u,'rwdtest'||p_number);
 insert into public.user_private(user_id) values(u);
 return u;
end;$$;
do $$
declare referrer uuid; u uuid; signup uuid; answer jsonb; ids uuid[]:='{}'; before_count integer; i integer;
 created timestamptz:=now()-interval '20 days'; current_game text; expected jsonb; actual record;
begin
 if has_table_privilege('authenticated','ojjuda_rewards_internal.awards','INSERT') or
   has_function_privilege('authenticated','ojjuda_rewards_internal.settle_referrals(timestamptz)','EXECUTE') or
   has_function_privilege('anon','public.admin_reward_summary()','EXECUTE') then raise exception 'privilege_test_failed'; end if;
 insert into reward_test_results values('private tables and settlement cannot be called by clients',true);
 if ojjuda_rewards_internal.phone_hash('010-1234-5678') is distinct from ojjuda_rewards_internal.phone_hash('+82 10 1234 5678') then raise exception 'normalization_test_failed'; end if;
 if not exists(select 1 from ojjuda_rewards_internal.excluded_users e where ojjuda_rewards_internal.exclusion_reason(e.user_id)='admin_excluded') then raise exception 'admin_exclusion_failed'; end if;
 insert into reward_test_results values('administrator and international phone formatting excluded',true);
 update ojjuda_rewards_internal.policy set starts_at=now()-interval '30 days';
 referrer:=pg_temp.reward_fixture(1,created);
 for i in 2..24 loop
  u:=pg_temp.reward_fixture(i,case when i=23 then now()-interval '13 days' else created end);ids:=array_append(ids,u);
  insert into ojjuda_referral_internal.signups(user_id,referrer_id,created_at,confirmed_at)
   values(u,referrer,case when i=23 then now()-interval '13 days' else created end,created) returning id into signup;
  insert into ojjuda_rewards_internal.activity_days(user_id,active_day)
   select u,(case when i=23 then now()-interval '13 days' else created end at time zone 'Asia/Seoul')::date+n
   from generate_series(0,case when i in (22,24) then 5 else 6 end) n;
  if i=24 then insert into ojjuda_rewards_internal.activity_days(user_id,active_day)
   values(u,(created at time zone 'Asia/Seoul')::date+14); end if;
 end loop;
 answer:=ojjuda_rewards_internal.settle_referrals();
 if (answer->>'new_qualified_members')::integer<>20 or (answer->>'new_awards')::integer<>2 then raise exception 'eligibility_failed: %',answer; end if;
 if (select sum(amount) from ojjuda_rewards_internal.awards where recipient_id=referrer)<>10000 then raise exception 'repeat_reward_failed'; end if;
 insert into reward_test_results values('20 qualified members create two 5000 KRW rewards; 6 days, early, and out-of-window visits rejected',true);
 answer:=ojjuda_rewards_internal.settle_referrals();
 if (answer->>'new_awards')::integer<>0 or (answer->>'new_qualified_members')::integer<>0 then raise exception 'duplicate_settlement_failed'; end if;
 insert into reward_test_results values('repeat execution is idempotent',true);
 begin
  insert into ojjuda_rewards_internal.awards(award_key,kind,recipient_id,recipient_phone_hash,amount,status)
   select 'test-provider-gate','referral',referrer,ojjuda_rewards_internal.phone_hash(phone_number),5000,'ready'
    from ojjuda_account_internal.member_identity where user_id=referrer;
  raise exception 'provider_gate_test_failed';
 exception when others then if sqlerrm<>'reward_provider_not_connected' then raise; end if; end;
 insert into reward_test_results values('unconfigured provider cannot send rewards',true);
 perform set_config('request.jwt.claim.sub',referrer::text,true);
 update public.user_private set last_seen_at=now() where user_id=referrer;
 update public.user_private set last_seen_at=now() where user_id=referrer;
 if (select count(*) from ojjuda_rewards_internal.activity_days where user_id=referrer and active_day=(now() at time zone 'Asia/Seoul')::date)<>1 then raise exception 'duplicate_activity_failed'; end if;
 insert into reward_test_results values('same-day activity counted once',true);
 for current_game in select distinct game from ojjuda_rewards_internal.monthly_candidates() loop
  expected:=(public.community_game_monthly_ranking(current_game)::jsonb)->0;
  select * into actual from ojjuda_rewards_internal.monthly_candidates() where game=current_game order by score desc,tie_at,identity_key limit 1;
  if expected->>'nick' is distinct from actual.nickname or (expected->>'score')::bigint is distinct from actual.score then
   raise exception 'monthly_leader_mismatch: %',current_game;
  end if;
 end loop;
 insert into reward_test_results values('monthly winners match the existing public ranking',true);
 perform set_config('request.jwt.claim.sub','',true);
 if ojjuda_rewards_internal.capture_month_end()->>'skipped' is distinct from 'not_month_end_cutoff' then raise exception 'month_end_gate_failed'; end if;
 insert into reward_test_results values('monthly rewards cannot settle before month end',true);
 select count(*) into before_count from ojjuda_rewards_internal.qualifications;
 insert into ojjuda_rewards_internal.qualifications(signup_id,member_phone_hash,qualified_at)
  select gen_random_uuid(),encode(sha256(convert_to('cap-fixture-'||n,'UTF8')),'hex'),created
   from generate_series(1,499-before_count) n;
 -- Two users become eligible at once while only one global slot remains.
 insert into ojjuda_rewards_internal.activity_days(user_id,active_day)
  values(ids[21],(created at time zone 'Asia/Seoul')::date+6),(ids[23],(created at time zone 'Asia/Seoul')::date+6);
 answer:=ojjuda_rewards_internal.settle_referrals();
 if (answer->>'new_qualified_members')::integer<>1 or (answer->>'qualified_members')::integer<>500 then raise exception 'global_cap_failed: %',answer; end if;
 answer:=ojjuda_rewards_internal.settle_referrals();
 if (answer->>'new_qualified_members')::integer<>0 then raise exception 'global_cap_repeat_failed'; end if;
 insert into reward_test_results values('500-member global cap holds at the boundary and on retries',true);
end;$$;
select * from reward_test_results;
rollback;
