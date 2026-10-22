-- Reward accounting is private. Coupon delivery stays off until a provider is configured.
create schema if not exists ojjuda_rewards_internal;
revoke all on schema ojjuda_rewards_internal from public, anon, authenticated;

create table ojjuda_rewards_internal.policy (
  singleton boolean primary key default true check(singleton),
  starts_at timestamptz not null default now(),
  referral_group_size integer not null default 10 check(referral_group_size=10),
  referral_member_limit integer not null default 500 check(referral_member_limit=500),
  referral_amount integer not null default 5000 check(referral_amount=5000),
  observation_days integer not null default 14 check(observation_days=14),
  active_days_required integer not null default 7 check(active_days_required=7),
  monthly_amount integer not null default 5000 check(monthly_amount=5000),
  gift_label text not null default '편의점 상품권 5,000원',
  provider_status text not null default 'not_connected' check(provider_status in ('not_connected','connected')),
  dispatch_enabled boolean not null default false,
  check(not dispatch_enabled or provider_status='connected')
);
insert into ojjuda_rewards_internal.policy default values;

create table ojjuda_rewards_internal.excluded_phones (
  phone_hash text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);
create table ojjuda_rewards_internal.excluded_users (
  user_id uuid primary key,
  reason text not null,
  created_at timestamptz not null default now()
);
create table ojjuda_rewards_internal.activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  active_day date not null,
  first_seen_at timestamptz not null default now(),
  primary key(user_id,active_day)
);
create table ojjuda_rewards_internal.awards (
  id uuid primary key default gen_random_uuid(),
  award_key text not null unique,
  kind text not null check(kind in ('referral','monthly_game')),
  recipient_id uuid references auth.users(id) on delete set null,
  recipient_phone_hash text not null,
  amount integer not null check(amount=5000),
  game text,
  month_start date,
  status text not null default 'awaiting_provider'
    check(status in ('awaiting_provider','ready','sending','sent','blocked','failed','unknown')),
  provider_order_id text unique,
  provider_receipt text,
  status_reason text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check((status='sent')=(sent_at is not null)),
  check(status<>'sent' or provider_receipt is not null)
);
create index awards_recent on ojjuda_rewards_internal.awards(created_at desc);
create table ojjuda_rewards_internal.qualifications (
  signup_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  referrer_id uuid references auth.users(id) on delete set null,
  member_phone_hash text not null unique,
  qualified_at timestamptz not null,
  award_id uuid references ojjuda_rewards_internal.awards(id),
  recorded_at timestamptz not null default now()
);
create index qualifications_referrer on ojjuda_rewards_internal.qualifications(referrer_id,qualified_at);
create table ojjuda_rewards_internal.monthly_results (
  month_start date not null,
  game text not null,
  winner_id uuid references auth.users(id) on delete set null,
  winner_label text,
  score bigint not null,
  captured_at timestamptz not null,
  award_id uuid references ojjuda_rewards_internal.awards(id),
  reason text not null,
  primary key(month_start,game)
);

create function ojjuda_rewards_internal.phone_hash(p_phone text)
returns text language sql immutable set search_path=pg_catalog as $$
 with digits as(select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') as n),
 normalized as(select case when n like '82%' then '0'||substr(n,3) else n end as n from digits)
 select case when n ~ '^010[0-9]{8}$' then encode(sha256(convert_to(n,'UTF8')),'hex') end from normalized;
$$;

create function ojjuda_rewards_internal.exclusion_reason(p_user uuid)
returns text language sql stable set search_path=pg_catalog as $$
 select case
  when p_user is null then 'not_a_member'
  when exists(select 1 from public.app_admins where user_id=p_user)
    or exists(select 1 from ojjuda_rewards_internal.excluded_users where user_id=p_user) then 'admin_excluded'
  when exists(select 1 from ojjuda_account_internal.member_identity m join ojjuda_rewards_internal.excluded_phones e
    on e.phone_hash=ojjuda_rewards_internal.phone_hash(m.phone_number) where m.user_id=p_user) then 'admin_phone_excluded'
  when not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and is_anonymous is not true) then 'unconfirmed_member'
  when public.is_banned(p_user) then 'banned'
  when not exists(select 1 from ojjuda_account_internal.member_identity where user_id=p_user
    and ojjuda_rewards_internal.phone_hash(phone_number) is not null) then 'missing_phone'
  else null end;
$$;

-- Only real server-side updates count; callers cannot supply an attendance date.
create function ojjuda_rewards_internal.track_activity()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid(); target uuid:=new.user_id;
begin
 if actor is not null and actor=target and exists(select 1 from auth.users where id=actor
    and email_confirmed_at is not null and is_anonymous is not true) and not public.is_banned(actor) then
  insert into ojjuda_rewards_internal.activity_days(user_id,active_day)
   values(actor,(clock_timestamp() at time zone 'Asia/Seoul')::date) on conflict do nothing;
 end if;
 return new;
end;$$;
create trigger rewards_checkin_activity after update of last_checkin,last_seen_at on public.user_private
 for each row execute function ojjuda_rewards_internal.track_activity();
create trigger rewards_score_activity after insert on public.game_scores
 for each row execute function ojjuda_rewards_internal.track_activity();

create function ojjuda_rewards_internal.guard_award()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare reason text; current_phone text;
begin
 if tg_op='UPDATE' and old.status='sent' then
  -- Account erasure may clear the FK without rewriting the delivery receipt.
  if new.recipient_id is null and old.recipient_id is not null
    and (to_jsonb(new)-'recipient_id')=(to_jsonb(old)-'recipient_id') then return new; end if;
  if new is distinct from old then raise exception 'sent_award_is_immutable'; end if;
 end if;
 if new.status in ('ready','sending','sent') then
  reason:=ojjuda_rewards_internal.exclusion_reason(new.recipient_id);
  if reason is not null then raise exception 'reward_recipient_excluded: %',reason; end if;
  select ojjuda_rewards_internal.phone_hash(phone_number) into current_phone
   from ojjuda_account_internal.member_identity where user_id=new.recipient_id;
  if current_phone is distinct from new.recipient_phone_hash then raise exception 'reward_phone_changed'; end if;
  if not exists(select 1 from ojjuda_rewards_internal.policy where dispatch_enabled and provider_status='connected') then
   raise exception 'reward_provider_not_connected';
  end if;
 end if;
 return new;
end;$$;
create trigger reward_send_guard before insert or update on ojjuda_rewards_internal.awards
 for each row execute function ojjuda_rewards_internal.guard_award();

do $$ declare t text; begin
 foreach t in array array['policy','excluded_phones','excluded_users','activity_days','awards','qualifications','monthly_results'] loop
  execute format('alter table ojjuda_rewards_internal.%I enable row level security',t);
 end loop;
end;$$;
revoke all on all tables in schema ojjuda_rewards_internal from public,anon,authenticated;
revoke all on all functions in schema ojjuda_rewards_internal from public,anon,authenticated;
