-- Monthly prizes are purchased by the administrator and delivered through private notes.
alter table ojjuda_rewards_internal.policy add column monthly_delivery_mode text not null default 'private_message'
 check(monthly_delivery_mode='private_message');
alter table ojjuda_rewards_internal.awards add column delivery_channel text not null default 'provider'
 check(delivery_channel in('provider','private_message'));
alter table ojjuda_rewards_internal.awards drop constraint awards_status_check;
alter table ojjuda_rewards_internal.awards add constraint awards_status_check
 check(status in('awaiting_provider','awaiting_coupon','ready','sending','sent','blocked','failed','unknown'));
update ojjuda_rewards_internal.awards set status='awaiting_coupon',status_reason='coupon_upload_required'
 where kind='monthly_game' and status='awaiting_provider';
update ojjuda_rewards_internal.monthly_results set reason='awaiting_coupon' where reason='awaiting_provider';

create table ojjuda_rewards_internal.coupon_deliveries (
 award_id uuid primary key references ojjuda_rewards_internal.awards(id),
 sender_id uuid references auth.users(id) on delete set null,
 storage_path text not null unique,
 coupon_fingerprint text not null unique,
 title text not null check(length(title) between 1 and 120),
 expires_on date not null,
 message_id uuid unique references ojjuda_note_internal.friend_messages(id) on delete set null,
 delivered_at timestamptz not null default clock_timestamp()
);
alter table ojjuda_rewards_internal.coupon_deliveries enable row level security;
revoke all on ojjuda_rewards_internal.coupon_deliveries from public,anon,authenticated;

create function ojjuda_rewards_internal.active_admin()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
  and coalesce(public.is_admin(),false) and not public.is_banned(auth.uid())
  and not ojjuda_account_deletion.pending();
$$;

create function ojjuda_rewards_internal.coupon_upload_allowed(p_path text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select ojjuda_rewards_internal.active_admin()
  and p_path ~ ('^'||auth.uid()||'/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$')
  and exists(select 1 from ojjuda_rewards_internal.awards a where a.id::text=split_part(p_path,'/',2)
   and a.kind='monthly_game' and a.status='awaiting_coupon'
   and ojjuda_rewards_internal.exclusion_reason(a.recipient_id) is null);
$$;

create function ojjuda_rewards_internal.coupon_read_allowed(p_path text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid())
  and not public.is_banned(auth.uid()) and not ojjuda_account_deletion.pending()
  and (ojjuda_rewards_internal.active_admin() or exists(
   select 1 from ojjuda_rewards_internal.coupon_deliveries c join ojjuda_rewards_internal.awards a on a.id=c.award_id
    where c.storage_path=p_path and a.recipient_id=auth.uid() and a.status='sent' and a.delivery_channel='private_message'));
$$;

create function ojjuda_rewards_internal.coupon_delete_allowed(p_path text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select ojjuda_rewards_internal.active_admin() and split_part(p_path,'/',1)=auth.uid()::text
  and not exists(select 1 from ojjuda_rewards_internal.coupon_deliveries where storage_path=p_path);
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('reward-coupons','reward-coupons',false,5242880,array['image/png','image/jpeg','image/webp']);
create policy reward_coupon_upload on storage.objects for insert to authenticated
 with check(bucket_id='reward-coupons' and owner_id=auth.uid()::text and ojjuda_rewards_internal.coupon_upload_allowed(name));
create policy reward_coupon_read on storage.objects for select to authenticated
 using(bucket_id='reward-coupons' and ojjuda_rewards_internal.coupon_read_allowed(name));
create policy reward_coupon_delete_orphan on storage.objects for delete to authenticated
 using(bucket_id='reward-coupons' and ojjuda_rewards_internal.coupon_delete_allowed(name));
-- Never expose long-lived signed URLs or allow a delivered image to be overwritten.
create policy reward_coupon_session_only on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'reward-coupons' or
  (storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated'])
    and ojjuda_rewards_internal.coupon_read_allowed(name)) or
  (storage.allow_any_operation(array['object.delete','object.delete_many'])
    and ojjuda_rewards_internal.coupon_delete_allowed(name)));
create policy reward_coupon_no_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'reward-coupons') with check(bucket_id<>'reward-coupons');

create or replace function ojjuda_rewards_internal.guard_award()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare reason text; current_phone text;
begin
 if tg_op='UPDATE' and old.status='sent' then
  if new.recipient_id is null and old.recipient_id is not null
    and (to_jsonb(new)-'recipient_id')=(to_jsonb(old)-'recipient_id') then return new; end if;
  if new is distinct from old then raise exception 'sent_award_is_immutable'; end if;
 end if;
 if new.status in('ready','sending','sent') then
  reason:=ojjuda_rewards_internal.exclusion_reason(new.recipient_id);
  if reason is not null then raise exception 'reward_recipient_excluded: %',reason; end if;
  select ojjuda_rewards_internal.phone_hash(phone_number) into current_phone
   from ojjuda_account_internal.member_identity where user_id=new.recipient_id;
  if current_phone is distinct from new.recipient_phone_hash then raise exception 'reward_phone_changed'; end if;
  if new.delivery_channel='private_message' then
   if new.kind<>'monthly_game' or new.status<>'sent' or not exists(
    select 1 from ojjuda_rewards_internal.coupon_deliveries c
     join ojjuda_note_internal.friend_messages m on m.id=c.message_id
     where c.award_id=new.id and m.recipient_id=new.recipient_id and m.sender_id=c.sender_id
      and new.provider_receipt='message:'||m.id::text
   ) then raise exception 'reward_coupon_receipt_required'; end if;
  elsif not exists(select 1 from ojjuda_rewards_internal.policy where dispatch_enabled and provider_status='connected') then
   raise exception 'reward_provider_not_connected';
  end if;
 end if;
 return new;
end;$$;

create function ojjuda_rewards_internal.send_coupon(p_award uuid,p_path text,p_coupon_code text,p_title text,p_expires date)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a ojjuda_rewards_internal.awards; c ojjuda_rewards_internal.coupon_deliveries;
 sender uuid:=auth.uid(); fingerprint text; normalized text; new_message uuid; why text; stored_size bigint; mime text;
begin
 if not ojjuda_rewards_internal.active_admin() then raise exception 'not_admin' using errcode='42501'; end if;
 normalized:=upper(regexp_replace(coalesce(p_coupon_code,''),'[[:space:]-]','','g'));
 if normalized !~ '^[A-Z0-9]{6,80}$' or p_title is null or length(btrim(p_title)) not between 1 and 120 or p_expires is null then
  raise exception 'invalid_coupon_details' using errcode='22023';
 end if;
 fingerprint:=encode(sha256(convert_to(normalized,'UTF8')),'hex');
 select * into a from ojjuda_rewards_internal.awards where id=p_award for update;
 if not found or a.kind<>'monthly_game' then raise exception 'monthly_award_required'; end if;
 select * into c from ojjuda_rewards_internal.coupon_deliveries where award_id=a.id;
 if found then
  if c.storage_path=p_path and c.coupon_fingerprint=fingerprint and c.title=btrim(p_title) and c.expires_on=p_expires then
   return jsonb_build_object('ok',true,'message_id',c.message_id,'replayed',true);
  end if;
  raise exception 'award_already_delivered';
 end if;
 if a.status<>'awaiting_coupon' then raise exception 'award_not_waiting'; end if;
 why:=ojjuda_rewards_internal.exclusion_reason(a.recipient_id);
 if why is not null then raise exception 'reward_recipient_excluded: %',why; end if;
 if ojjuda_note_internal.friend_message_blocked(a.recipient_id) then raise exception 'recipient_blocked'; end if;
 if not exists(select 1 from ojjuda_rewards_internal.monthly_results r
  where r.award_id=a.id and r.month_start=a.month_start and r.game=a.game and r.winner_id=a.recipient_id) then
  raise exception 'monthly_winner_not_confirmed';
 end if;
 if p_expires<(clock_timestamp() at time zone 'Asia/Seoul')::date then raise exception 'coupon_expired'; end if;
 if not coalesce(ojjuda_rewards_internal.coupon_upload_allowed(p_path),false) or split_part(p_path,'/',2)<>a.id::text then
  raise exception 'invalid_coupon_path';
 end if;
 select (metadata->>'size')::bigint,metadata->>'mimetype' into stored_size,mime from storage.objects
  where bucket_id='reward-coupons' and name=p_path and owner_id=sender::text for update;
 if not found or stored_size is null or stored_size not between 1 and 5242880 or mime is null or mime not in('image/png','image/jpeg','image/webp') then
  raise exception 'coupon_image_missing';
 end if;
 if exists(select 1 from ojjuda_rewards_internal.coupon_deliveries where coupon_fingerprint=fingerprint) then
  raise exception 'coupon_already_used';
 end if;
 insert into ojjuda_note_internal.friend_messages(sender_id,recipient_id,body,request_id)
  values(sender,a.recipient_id,to_char(a.month_start,'YYYY년 MM월')||' 게임 순위 1위를 축하합니다!'||E'\n'
   ||btrim(p_title)||E'\n사용기한: '||to_char(p_expires,'YYYY-MM-DD')||E'\n기프티콘 확인: https://ojjuda.kr/gift.html?id='||a.id::text,a.id)
  returning id into new_message;
 insert into ojjuda_rewards_internal.coupon_deliveries(award_id,sender_id,storage_path,coupon_fingerprint,title,expires_on,message_id)
  values(a.id,sender,p_path,fingerprint,btrim(p_title),p_expires,new_message);
 update ojjuda_rewards_internal.awards set delivery_channel='private_message',status='sent',sent_at=clock_timestamp(),
  provider_receipt='message:'||new_message::text,status_reason='private_message_delivered' where id=a.id;
 update ojjuda_rewards_internal.monthly_results set reason='sent' where award_id=a.id;
 return jsonb_build_object('ok',true,'message_id',new_message,'replayed',false);
end;$$;

create function ojjuda_rewards_internal.get_coupon(p_award uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'sign_in_required' using errcode='42501'; end if;
 select jsonb_build_object('title',c.title,'expires_on',c.expires_on,'storage_path',c.storage_path,'delivered_at',c.delivered_at,
  'month_start',a.month_start,'game',a.game) into result
  from ojjuda_rewards_internal.coupon_deliveries c join ojjuda_rewards_internal.awards a on a.id=c.award_id
  where a.id=p_award and a.status='sent' and ojjuda_rewards_internal.coupon_read_allowed(c.storage_path);
 if result is null then raise exception 'coupon_unavailable' using errcode='42501'; end if;
 return result;
end;$$;

create function public.admin_send_reward_coupon(p_award uuid,p_path text,p_coupon_code text,p_title text,p_expires date)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select ojjuda_rewards_internal.send_coupon(p_award,p_path,p_coupon_code,p_title,p_expires);
$$;
create function public.my_reward_coupon(p_award uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select ojjuda_rewards_internal.get_coupon(p_award);
$$;

revoke all on function ojjuda_rewards_internal.active_admin(),ojjuda_rewards_internal.coupon_upload_allowed(text),
 ojjuda_rewards_internal.coupon_read_allowed(text),ojjuda_rewards_internal.coupon_delete_allowed(text),
 ojjuda_rewards_internal.send_coupon(uuid,text,text,text,date),ojjuda_rewards_internal.get_coupon(uuid),
 public.admin_send_reward_coupon(uuid,text,text,text,date),public.my_reward_coupon(uuid) from public,anon,authenticated;
grant execute on function ojjuda_rewards_internal.active_admin(),ojjuda_rewards_internal.coupon_upload_allowed(text),
 ojjuda_rewards_internal.coupon_read_allowed(text),ojjuda_rewards_internal.coupon_delete_allowed(text),
 ojjuda_rewards_internal.send_coupon(uuid,text,text,text,date),ojjuda_rewards_internal.get_coupon(uuid),
 public.admin_send_reward_coupon(uuid,text,text,text,date),public.my_reward_coupon(uuid) to authenticated;

create function ojjuda_rewards_internal.coupon_admin_summary()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not ojjuda_rewards_internal.active_admin() then raise exception 'not_admin' using errcode='42501'; end if;
 return ojjuda_rewards_internal.admin_summary() || jsonb_build_object(
  'monthly_pending',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select a.id,a.month_start,a.game,a.amount,p.nickname,
    coalesce(ojjuda_rewards_internal.exclusion_reason(a.recipient_id),
     case when ojjuda_note_internal.friend_message_blocked(a.recipient_id) then 'recipient_blocked' end) as blocked_reason
   from ojjuda_rewards_internal.awards a left join public.profiles p on p.id=a.recipient_id
   where a.kind='monthly_game' and a.status='awaiting_coupon'
   order by a.month_start,a.game,a.id limit 500) x),'[]'::jsonb),
  'monthly_sent',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select a.id,a.month_start,a.game,p.nickname,c.title,c.expires_on,c.delivered_at
   from ojjuda_rewards_internal.coupon_deliveries c join ojjuda_rewards_internal.awards a on a.id=c.award_id
    left join public.profiles p on p.id=a.recipient_id
   order by c.delivered_at desc limit 100) x),'[]'::jsonb));
end;$$;
revoke all on function ojjuda_rewards_internal.coupon_admin_summary() from public,anon,authenticated;
grant execute on function ojjuda_rewards_internal.coupon_admin_summary() to authenticated;
create or replace function public.admin_reward_summary()
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select ojjuda_rewards_internal.coupon_admin_summary();
$$;

create or replace function ojjuda_rewards_internal.capture_month_end()
returns jsonb language plpgsql set search_path=pg_catalog as $$
declare captured timestamptz:=statement_timestamp(); local_now timestamp:=captured at time zone 'Asia/Seoul';
 month_day date:=date_trunc('month',local_now)::date; cfg ojjuda_rewards_internal.policy%rowtype;
 winner record; why text; award uuid; recipient_phone text; recorded integer:=0;
begin
 -- Cron runs daily at 23:59 KST; only the final calendar day is actionable.
 if local_now::date<>(date_trunc('month',local_now)+interval '1 month - 1 day')::date
  or local_now::time<time '23:59' then return jsonb_build_object('skipped','not_month_end_cutoff'); end if;
 select * into strict cfg from ojjuda_rewards_internal.policy where singleton for update;
 for winner in
  select distinct on(game) * from ojjuda_rewards_internal.monthly_candidates(captured)
  order by game,score desc,tie_at,identity_key
 loop
  if exists(select 1 from ojjuda_rewards_internal.monthly_results where month_start=month_day and game=winner.game) then continue; end if;
  why:=ojjuda_rewards_internal.exclusion_reason(winner.user_id); award:=null;
  if why is null then
   select ojjuda_rewards_internal.phone_hash(phone_number) into recipient_phone
    from ojjuda_account_internal.member_identity where user_id=winner.user_id;
   insert into ojjuda_rewards_internal.awards(award_key,kind,recipient_id,recipient_phone_hash,amount,game,month_start,status,status_reason)
    values('monthly:'||month_day||':'||winner.game,'monthly_game',winner.user_id,recipient_phone,
     cfg.monthly_amount,winner.game,month_day,'awaiting_coupon','coupon_upload_required') returning id into award;
  end if;
  insert into ojjuda_rewards_internal.monthly_results(month_start,game,winner_id,winner_label,score,captured_at,award_id,reason)
   values(month_day,winner.game,winner.user_id,winner.nickname,winner.score,captured,award,coalesce(why,'awaiting_coupon'));
  recorded:=recorded+1;
 end loop;
 return jsonb_build_object('recorded_games',recorded,'month',month_day,'cutoff',captured);
end;$$;
