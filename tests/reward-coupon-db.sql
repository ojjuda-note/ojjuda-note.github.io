-- Transactional contract checks. Synthetic users, image metadata and notes all roll back.
-- No real coupon files are uploaded and no real member receives a message.
begin;
create temporary table coupon_checks(check_name text,passed boolean) on commit drop;
create temporary table coupon_fixture(sender uuid,recipient uuid,outsider uuid,award uuid,other_award uuid,path text,other_path text,code text,message uuid) on commit drop;
create function pg_temp.coupon_user(p_number integer) returns uuid language plpgsql as $$
declare u uuid:=gen_random_uuid(); begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
 values(u,'authenticated','authenticated','coupon-fixture-'||u||'@example.invalid','invalid-test-only-hash',now(),now(),now(),
  jsonb_build_object('age_14_or_older',true,'terms_version','test-only','birth_yymmdd','900101','gender_code','1','phone_number','01094'||lpad(p_number::text,6,'0')));
 insert into public.profiles(id,nickname) values(u,'cpntest'||p_number);
 insert into public.user_private(user_id) values(u);
 return u;
end;$$;
create function pg_temp.expect_coupon_error(p_award uuid,p_path text,p_code text,p_expiry date,p_expected text)
returns void language plpgsql as $$ begin
 begin
  perform public.admin_send_reward_coupon(p_award,p_path,p_code,'테스트 상품',p_expiry);
  raise exception 'unexpected_success';
 exception when others then if position(p_expected in sqlerrm)=0 then raise; end if; end;
end;$$;
do $$
declare f coupon_fixture; answer jsonb; expiry date:=(now() at time zone 'Asia/Seoul')::date+30; initial_messages bigint; wrong_hash text;
begin
 f.sender:=pg_temp.coupon_user(1);f.recipient:=pg_temp.coupon_user(2);f.outsider:=pg_temp.coupon_user(3);
 f.award:=gen_random_uuid();f.other_award:=gen_random_uuid();f.code:=replace(gen_random_uuid()::text,'-','');
 f.path:=f.sender||'/'||f.award||'/'||gen_random_uuid()||'.png';
 f.other_path:=f.sender||'/'||f.other_award||'/'||gen_random_uuid()||'.png';
 insert into public.app_admins(user_id) values(f.sender);
 update ojjuda_rewards_internal.policy set dispatch_enabled=false,provider_status='not_connected';
 insert into ojjuda_rewards_internal.awards(id,award_key,kind,recipient_id,recipient_phone_hash,amount,game,month_start,status)
 select a,'coupon-test:'||a,'monthly_game',f.recipient,ojjuda_rewards_internal.phone_hash(m.phone_number),5000,'test:'||a,date '2090-01-01','awaiting_coupon'
 from unnest(array[f.award,f.other_award]) a cross join ojjuda_account_internal.member_identity m where m.user_id=f.recipient;
 insert into ojjuda_rewards_internal.monthly_results(month_start,game,winner_id,winner_label,score,captured_at,award_id,reason)
 select month_start,game,recipient_id,'synthetic winner',100,now(),id,'awaiting_coupon' from ojjuda_rewards_internal.awards where id in(f.award,f.other_award);
 insert into storage.objects(bucket_id,name,owner_id,metadata)
 values('reward-coupons',f.path,f.sender::text,'{"size":100,"mimetype":"image/png"}'),
  ('reward-coupons',f.other_path,f.sender::text,'{"size":100,"mimetype":"image/png"}');
 perform set_config('request.jwt.claim.sub',f.sender::text,true);
 if not ojjuda_rewards_internal.coupon_upload_allowed(f.path) then raise exception 'admin_upload_rejected'; end if;
 if has_table_privilege('authenticated','ojjuda_rewards_internal.coupon_deliveries','INSERT') or
  has_function_privilege('anon','public.admin_send_reward_coupon(uuid,text,text,text,date)','EXECUTE') or
  has_function_privilege('anon','public.my_reward_coupon(uuid)','EXECUTE') or
  exists(select 1 from storage.buckets where id='reward-coupons' and public) then raise exception 'private_access_failed'; end if;
 insert into coupon_checks values('Private bucket, receipts and RPC privileges',true);
 perform pg_temp.expect_coupon_error(f.award,f.path,f.code,current_date-2,'coupon_expired');
 update storage.objects set metadata='{"size":100}' where bucket_id='reward-coupons' and name=f.path;
 perform pg_temp.expect_coupon_error(f.award,f.path,f.code,expiry,'coupon_image_missing');
 update storage.objects set metadata='{"size":100,"mimetype":"image/png"}' where bucket_id='reward-coupons' and name=f.path;
 insert into coupon_checks values('Expired or unverified image rejected',true);
 insert into public.app_admins(user_id) values(f.recipient);
 perform pg_temp.expect_coupon_error(f.award,f.path,f.code,expiry,'reward_recipient_excluded: admin_excluded');
 delete from public.app_admins where user_id=f.recipient;
 insert into ojjuda_rewards_internal.excluded_phones(phone_hash,reason)
 select recipient_phone_hash,'test-only' from ojjuda_rewards_internal.awards where id=f.award;
 perform pg_temp.expect_coupon_error(f.award,f.path,f.code,expiry,'reward_recipient_excluded: admin_phone_excluded');
 delete from ojjuda_rewards_internal.excluded_phones where reason='test-only' and phone_hash=(select recipient_phone_hash from ojjuda_rewards_internal.awards where id=f.award);
 insert into coupon_checks values('Admin accounts and excluded numbers rechecked at send time',true);
 insert into public.blocks(blocker,blocked) values(f.recipient,f.sender);
 perform pg_temp.expect_coupon_error(f.award,f.path,f.code,expiry,'recipient_blocked');
 delete from public.blocks where blocker=f.recipient and blocked=f.sender;
 insert into coupon_checks values('Recipient block respected',true);
 update ojjuda_rewards_internal.monthly_results set winner_id=f.outsider where award_id=f.award;
 perform pg_temp.expect_coupon_error(f.award,f.path,f.code,expiry,'monthly_winner_not_confirmed');
 update ojjuda_rewards_internal.monthly_results set winner_id=f.recipient where award_id=f.award;
 insert into coupon_checks values('Recipient taken only from the confirmed monthly result',true);
 select recipient_phone_hash into wrong_hash from ojjuda_rewards_internal.awards where id=f.award;
 update ojjuda_rewards_internal.awards set recipient_phone_hash='test-mismatch' where id=f.award;
 perform pg_temp.expect_coupon_error(f.award,f.path,f.code,expiry,'reward_phone_changed');
 if exists(select 1 from ojjuda_rewards_internal.coupon_deliveries where award_id=f.award) or
  exists(select 1 from ojjuda_note_internal.friend_messages where request_id=f.award) then raise exception 'transaction_not_atomic'; end if;
 update ojjuda_rewards_internal.awards set recipient_phone_hash=wrong_hash where id=f.award;
 insert into coupon_checks values('Failed final eligibility check rolls back note and receipt',true);
 select count(*) into initial_messages from ojjuda_note_internal.friend_messages where sender_id=f.sender;
 answer:=public.admin_send_reward_coupon(f.award,f.path,f.code,'테스트 상품',expiry);
 f.message:=(answer->>'message_id')::uuid;
 if answer->>'ok'<>'true' or answer->>'replayed'<>'false' or not exists(
  select 1 from ojjuda_rewards_internal.awards a join ojjuda_rewards_internal.coupon_deliveries c on c.award_id=a.id
  join ojjuda_note_internal.friend_messages m on m.id=c.message_id
  where a.id=f.award and a.status='sent' and a.delivery_channel='private_message' and m.recipient_id=f.recipient
  and m.sender_id=f.sender and m.body like '%https://ojjuda.kr/gift.html?id='||f.award::text
 ) then raise exception 'delivery_failed'; end if;
 insert into coupon_checks values('Purchased coupon delivered as private note while provider disabled',true);
 answer:=public.admin_send_reward_coupon(f.award,f.path,lower(f.code),'테스트 상품',expiry);
 if answer->>'replayed'<>'true' or (answer->>'message_id')::uuid<>f.message or
  (select count(*) from ojjuda_note_internal.friend_messages where sender_id=f.sender)<>initial_messages+1 then raise exception 'replay_failed'; end if;
 perform pg_temp.expect_coupon_error(f.award,f.path,'DIFFERENTCODE',expiry,'award_already_delivered');
 perform pg_temp.expect_coupon_error(f.other_award,f.other_path,f.code,expiry,'coupon_already_used');
 if exists(select 1 from ojjuda_note_internal.friend_messages where request_id=f.other_award) then raise exception 'duplicate_message'; end if;
 insert into coupon_checks values('Retries are idempotent and one coupon cannot serve two awards',true);
 perform set_config('request.jwt.claim.sub',f.recipient::text,true);
 if public.my_reward_coupon(f.award)->>'storage_path'<>f.path then raise exception 'recipient_cannot_read'; end if;
 if not exists(select 1 from ojjuda_note_internal.visible_app_notifications() where id='world:message:'||f.message::text) then raise exception 'notification_missing'; end if;
 answer:=public.friend_message_thread(p_peer=>f.sender,p_anchor=>f.message);
 if jsonb_array_length(answer->'items')<>1 or answer->>'can_send'<>'false' then raise exception 'nonfriend_cannot_read_note'; end if;
 insert into coupon_checks values('Winner receives inbox notification and can open a non-friend prize note',true);
 perform pg_temp.expect_coupon_error(f.other_award,f.other_path,'OTHERCOUPON',expiry,'not_admin');
 perform set_config('request.jwt.claim.sub',f.outsider::text,true);
 begin
  perform public.my_reward_coupon(f.award);raise exception 'outsider_read_succeeded';
 exception when insufficient_privilege then if sqlerrm<>'coupon_unavailable' then raise; end if;end;
 if ojjuda_rewards_internal.coupon_read_allowed(f.path) or ojjuda_rewards_internal.coupon_upload_allowed(f.other_path) then raise exception 'outsider_access'; end if;
 insert into coupon_checks values('Other members cannot read coupons or send prizes',true);
 insert into coupon_fixture values(f.*);
end;$$;
grant select on coupon_fixture to authenticated;
grant insert on coupon_checks to authenticated;
set local role authenticated;
do $$ declare f coupon_fixture; n integer; begin
 select * into f from coupon_fixture;
 perform set_config('request.jwt.claim.sub',f.recipient::text,true);
 perform set_config('storage.operation','object.get_authenticated',true);
 select count(*) into n from storage.objects where bucket_id='reward-coupons' and name=f.path;
 if n<>1 then raise exception 'winner_storage_rls_failed'; end if;
 perform set_config('storage.operation','object.sign',true);
 if exists(select 1 from storage.objects where bucket_id='reward-coupons' and name=f.path) then raise exception 'signed_url_allowed'; end if;
 perform set_config('storage.operation','object.list',true);
 if exists(select 1 from storage.objects where bucket_id='reward-coupons') then raise exception 'list_allowed'; end if;
 perform set_config('request.jwt.claim.sub',f.outsider::text,true);
 perform set_config('storage.operation','object.get_authenticated',true);
 if exists(select 1 from storage.objects where bucket_id='reward-coupons' and name=f.path) then raise exception 'outsider_storage_rls_failed'; end if;
 insert into coupon_checks values('Storage RLS limits downloads to winner and prevents signing/listing',true);
 perform set_config('request.jwt.claim.sub',f.sender::text,true);
 select count(*) into n from storage.objects where bucket_id='reward-coupons' and name=f.path;
 if n<>1 then raise exception 'admin_storage_rls_failed'; end if;
 update storage.objects set metadata='{}' where bucket_id='reward-coupons' and name=f.path;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'delivered_image_overwritten'; end if;
 perform set_config('storage.operation','object.delete',true);
 if exists(select 1 from storage.objects where bucket_id='reward-coupons' and name=f.path) then raise exception 'delivered_image_deletable'; end if;
 if not exists(select 1 from storage.objects where bucket_id='reward-coupons' and name=f.other_path) then raise exception 'orphan_cleanup_unavailable'; end if;
 insert into coupon_checks values('Admin can review but cannot overwrite/delete delivered coupon',true);
end;$$;
reset role;
select * from coupon_checks;
rollback;
