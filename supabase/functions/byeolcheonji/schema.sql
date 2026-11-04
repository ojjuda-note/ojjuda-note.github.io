-- New member-owned notification service, independent of the retired Star helper.
-- Execute as the database owner. No tables or functions are exposed to browser roles.
create extension if not exists pg_net;
create schema if not exists byeolcheonji_internal;
revoke all on schema byeolcheonji_internal from public, anon, authenticated;

create table if not exists byeolcheonji_internal.runtime (
  singleton boolean primary key default true check (singleton),
  vapid_public_key text,
  inventory jsonb,
  inventory_at timestamptz,
  inventory_usable boolean not null default false,
  scan_token uuid,
  scan_lease_until timestamptz not null default '-infinity',
  next_scan_after timestamptz not null default '-infinity',
  delivery_token uuid,
  delivery_lease_until timestamptz not null default '-infinity',
  last_tick_at timestamptz,
  last_error text,
  scan_count bigint not null default 0
);
insert into byeolcheonji_internal.runtime(singleton) values(true) on conflict do nothing;

create table if not exists byeolcheonji_internal.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[a-f0-9]{64}$'),
  endpoint text not null unique check (length(endpoint) <= 2048),
  keys jsonb not null,
  filters jsonb not null,
  enabled boolean not null default true,
  revision bigint not null default 1,
  seen jsonb not null default '[]'::jsonb,
  failures integer not null default 0,
  retry_after timestamptz not null default '-infinity',
  last_test_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_hash),
  check (jsonb_typeof(keys) = 'object'),
  check (jsonb_typeof(filters) = 'object' and filters ? 'dateMode' and filters ? 'guests' and filters ->> 'dateMode' in ('all','weekend','weekday')
    and filters ->> 'guests' in ('all','2','4','6','8')),
  check (jsonb_typeof(seen) = 'array')
);
create index if not exists byeolcheonji_delivery_order on byeolcheonji_internal.subscriptions(retry_after, updated_at) where enabled;

create table if not exists byeolcheonji_internal.request_limits (
  bucket text primary key,
  attempts integer not null default 1,
  created_at timestamptz not null default now()
);
create table if not exists byeolcheonji_internal.nonces (
  nonce uuid primary key,
  created_at timestamptz not null default now()
);

alter table byeolcheonji_internal.runtime enable row level security;
alter table byeolcheonji_internal.subscriptions enable row level security;
alter table byeolcheonji_internal.request_limits enable row level security;
alter table byeolcheonji_internal.nonces enable row level security;
revoke all on all tables in schema byeolcheonji_internal from public, anon, authenticated;
alter default privileges in schema byeolcheonji_internal revoke all on tables from public, anon, authenticated;
alter default privileges in schema byeolcheonji_internal revoke all on functions from public, anon, authenticated;

do $$ begin
  if not exists(select 1 from vault.secrets where name='byeolcheonji_signing_v1') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'byeolcheonji_signing_v1','One-use signatures for Ojjuda vacancy checks');
  end if;
end $$;

create or replace function byeolcheonji_internal.dispatch(probe boolean default false)
returns bigint language plpgsql security invoker set search_path='' as $$
declare
  sent_at text := floor(extract(epoch from clock_timestamp()))::bigint::text;
  nonce text := gen_random_uuid()::text;
  mode text := case when probe then 'probe' else 'scan' end;
  signature text;
begin
  signature := encode(extensions.hmac(sent_at || ':' || nonce || ':' || mode,
    (select decrypted_secret from vault.decrypted_secrets where name='byeolcheonji_signing_v1'), 'sha256'), 'hex');
  return net.http_post(
    url := 'https://ziezbdjofcugznowiuda.supabase.co/functions/v1/byeolcheonji/tick',
    headers := jsonb_build_object('Content-Type','application/json', 'X-Byeol-Time',sent_at,
      'X-Byeol-Nonce',nonce,'X-Byeol-Signature',signature,'X-Byeol-Probe',case when probe then '1' else '0' end),
    body := '{}'::jsonb, timeout_milliseconds := 115000
  );
end $$;
revoke all on function byeolcheonji_internal.dispatch(boolean) from public, anon, authenticated;
