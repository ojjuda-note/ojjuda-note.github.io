create table ojjuda_note_internal.g2_voice_devices (
  member_id uuid primary key references auth.users(id) on delete cascade,
  code_hash bytea unique, code_until timestamptz,
  token_hash bytea unique, token_until timestamptz
);
create table ojjuda_note_internal.g2_voice_counts (
  bucket text primary key, day date not null, turns integer not null, last_turn timestamptz not null
);
alter table ojjuda_note_internal.g2_voice_devices enable row level security;
alter table ojjuda_note_internal.g2_voice_counts enable row level security;
revoke all on ojjuda_note_internal.g2_voice_devices, ojjuda_note_internal.g2_voice_counts from public, anon, authenticated;

-- A member issues a five-minute pairing code. Only hashes are retained.
create function public.park_g2_voice_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  member uuid := auth.uid();
  code text := upper(encode(extensions.gen_random_bytes(6), 'hex'));
begin
  if member is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Sign in to Park first' using errcode='42501';
  end if;
  insert into ojjuda_note_internal.g2_voice_devices(member_id,code_hash,code_until)
  values(member,extensions.digest(code,'sha256'),now()+interval '5 minutes')
  on conflict(member_id) do update set code_hash=excluded.code_hash, code_until=excluded.code_until;
  return code;
end $$;
revoke all on function public.park_g2_voice_code() from public, anon, authenticated;
grant execute on function public.park_g2_voice_code() to authenticated;

create function public.park_g2_voice_redeem(p_code text) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  token text := encode(extensions.gen_random_bytes(32),'hex');
begin
  update ojjuda_note_internal.g2_voice_devices
  set code_hash=null, code_until=null, token_hash=extensions.digest(token,'sha256'), token_until=now()+interval '90 days'
  where code_hash=extensions.digest(p_code,'sha256') and code_until>now();
  if not found then return null; end if;
  return token;
end $$;
grant usage on schema ojjuda_note_internal to service_role;
grant select,update on ojjuda_note_internal.g2_voice_devices to service_role;
grant select,insert,update,delete on ojjuda_note_internal.g2_voice_counts to service_role;
revoke all on function public.park_g2_voice_redeem(text) from public, anon, authenticated;
grant execute on function public.park_g2_voice_redeem(text) to service_role;

-- A device token grants voice questions only. Reserve both limits in one transaction.
create function public.park_g2_voice_claim(p_token text) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  member uuid;
  today date := (now() at time zone 'Asia/Seoul')::date;
  item ojjuda_note_internal.g2_voice_counts%rowtype;
begin
  select member_id into member from ojjuda_note_internal.g2_voice_devices
    where token_hash=extensions.digest(p_token,'sha256') and token_until>now();
  if member is null then return 'pair'; end if;
  perform pg_advisory_xact_lock(731104324);
  delete from ojjuda_note_internal.g2_voice_counts where day<today;
  select * into item from ojjuda_note_internal.g2_voice_counts where bucket=member::text;
  if item.turns>=24 or item.last_turn>now()-interval '3 seconds' then return 'limit'; end if;
  if exists(select 1 from ojjuda_note_internal.g2_voice_counts where bucket='all' and turns>=120) then return 'limit'; end if;
  insert into ojjuda_note_internal.g2_voice_counts as c(bucket,day,turns,last_turn)
    values(member::text,today,1,now()),('all',today,1,now())
    on conflict(bucket) do update set turns=c.turns+1,last_turn=excluded.last_turn;
  return 'ok';
end $$;
revoke all on function public.park_g2_voice_claim(text) from public, anon, authenticated;
grant execute on function public.park_g2_voice_claim(text) to service_role;
