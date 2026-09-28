-- Account contact/identity data only; passwords, tokens and posts are not archived.
create table ojjuda_account_internal.withdrawn_member_accounts (
  user_id uuid primary key,
  email text,
  nickname text,
  birth_date date,
  gender text check (gender in ('male','female')),
  phone_number text,
  age_at_signup smallint,
  account_created_at timestamptz,
  withdrawn_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > withdrawn_at)
);
alter table ojjuda_account_internal.withdrawn_member_accounts enable row level security;
revoke all on ojjuda_account_internal.withdrawn_member_accounts from public,anon,authenticated;
create index withdrawn_member_accounts_email_idx on ojjuda_account_internal.withdrawn_member_accounts(email,withdrawn_at);
create index withdrawn_member_accounts_phone_idx on ojjuda_account_internal.withdrawn_member_accounts(phone_number,withdrawn_at);
create index withdrawn_member_accounts_expiry_idx on ojjuda_account_internal.withdrawn_member_accounts(expires_at);

create function ojjuda_account_internal.archive_withdrawn_member_account()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_when timestamptz := clock_timestamp(); v_identity ojjuda_account_internal.member_identity%rowtype; v_nick text;
begin
  select * into v_identity from ojjuda_account_internal.member_identity where user_id=old.id;
  select nickname into v_nick from public.profiles where id=old.id;
  insert into ojjuda_account_internal.withdrawn_member_accounts
    (user_id,email,nickname,birth_date,gender,phone_number,age_at_signup,account_created_at,withdrawn_at,expires_at)
  values(old.id,lower(btrim(old.email)),v_nick,v_identity.birth_date,v_identity.gender,v_identity.phone_number,
    v_identity.age_at_signup,old.created_at,v_when,
    ((v_when at time zone 'Asia/Seoul') + interval '1 month') at time zone 'Asia/Seoul');
  return old;
end;
$$;
revoke all on function ojjuda_account_internal.archive_withdrawn_member_account() from public,anon,authenticated;
create trigger archive_withdrawn_member_account before delete on auth.users
for each row execute function ojjuda_account_internal.archive_withdrawn_member_account();

create function ojjuda_account_internal.enforce_rejoin_wait()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_phone text; v_now timestamptz := clock_timestamp();
begin
  v_phone := ojjuda_account_internal.normalize_phone(new.raw_user_meta_data->>'phone_number');
  if exists(select 1 from ojjuda_account_internal.withdrawn_member_accounts
    where withdrawn_at > v_now - interval '72 hours' and expires_at > v_now
      and (email=lower(btrim(new.email)) or phone_number=v_phone)) then
    raise exception 'rejoin_wait_3_days' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function ojjuda_account_internal.enforce_rejoin_wait() from public,anon,authenticated;
create trigger enforce_rejoin_wait before insert on auth.users
for each row execute function ojjuda_account_internal.enforce_rejoin_wait();

create function ojjuda_account_internal.purge_withdrawn_member_accounts()
returns bigint language plpgsql security definer set search_path = pg_catalog as $$
declare v_count bigint;
begin
  delete from ojjuda_account_internal.withdrawn_member_accounts where expires_at <= clock_timestamp();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function ojjuda_account_internal.purge_withdrawn_member_accounts() from public,anon,authenticated;
select cron.schedule('purge_withdrawn_member_accounts','*/5 * * * *',
  'select ojjuda_account_internal.purge_withdrawn_member_accounts()');
