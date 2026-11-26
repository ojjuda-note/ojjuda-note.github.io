create table ojjuda_note_internal.g2_voice_links (
  challenge text primary key,
  member_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  redeemed boolean not null default false
);
create index g2_voice_links_expiry on ojjuda_note_internal.g2_voice_links(expires_at);
create index g2_voice_links_member on ojjuda_note_internal.g2_voice_links(member_id);
alter table ojjuda_note_internal.g2_voice_links enable row level security;
revoke all on ojjuda_note_internal.g2_voice_links from public, anon, authenticated;
grant select,update on ojjuda_note_internal.g2_voice_links to service_role;
grant insert on ojjuda_note_internal.g2_voice_devices to service_role;

create function public.park_g2_voice_approve(p_challenge text, p_until bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  member uuid := auth.uid();
  deadline timestamptz;
begin
  if member is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Member required' using errcode='42501';
  end if;
  if p_challenge is null or p_challenge !~ '^[a-f0-9]{64}$' or p_until is null or
     p_until <= extract(epoch from now()) or p_until > extract(epoch from now()) + 660 then return false; end if;
  deadline := to_timestamp(p_until);
  perform pg_advisory_xact_lock(hashtextextended(member::text,51413));
  delete from ojjuda_note_internal.g2_voice_links where expires_at <= now();
  if exists(select 1 from ojjuda_note_internal.g2_voice_links where challenge=p_challenge) then
    return exists(select 1 from ojjuda_note_internal.g2_voice_links where challenge=p_challenge and member_id=member and expires_at=deadline);
  end if;
  -- Keep one unclaimed approval per member and preserve spent challenges until expiry.
  delete from ojjuda_note_internal.g2_voice_links where member_id=member and not redeemed;
  insert into ojjuda_note_internal.g2_voice_links(challenge,member_id,expires_at)
    values(p_challenge,member,deadline) on conflict do nothing;
  return found;
end $$;
revoke all on function public.park_g2_voice_approve(text,bigint) from public, anon;
grant execute on function public.park_g2_voice_approve(text,bigint) to authenticated;

create function public.park_g2_voice_complete(p_proof text,p_until bigint) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  link ojjuda_note_internal.g2_voice_links%rowtype;
  token_digest bytea;
begin
  if p_proof is null or p_proof !~ '^[a-f0-9]{64}$' or p_until is null or
     p_until <= extract(epoch from now()) or p_until > extract(epoch from now()) + 660 then return false; end if;
  select * into link from ojjuda_note_internal.g2_voice_links
    where challenge=encode(extensions.digest('park-g2-link-v1:'||p_until||':'||p_proof,'sha256'),'hex')
      and expires_at=to_timestamp(p_until) and expires_at>now() for update;
  if not found then return false; end if;
  token_digest := extensions.digest(p_proof,'sha256');
  if link.redeemed then
    return exists(select 1 from ojjuda_note_internal.g2_voice_devices where member_id=link.member_id and token_hash=token_digest and token_until>now());
  end if;
  insert into ojjuda_note_internal.g2_voice_devices(member_id,token_hash,token_until)
    values(link.member_id,token_digest,now()+interval '90 days')
    on conflict(member_id) do update set token_hash=excluded.token_hash, token_until=excluded.token_until,code_hash=null,code_until=null;
  update ojjuda_note_internal.g2_voice_links set redeemed=true where challenge=link.challenge;
  return true;
end $$;
revoke all on function public.park_g2_voice_complete(text,bigint) from public, anon, authenticated;
grant execute on function public.park_g2_voice_complete(text,bigint) to service_role;
