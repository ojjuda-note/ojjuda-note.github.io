-- Personal invite links use the same public UUID already returned by
-- search_signup_referrers. It is attribution data, never an authentication token.
-- Keep the one-time signup record and the existing reward settlement untouched.
do $preflight$
begin
  if (select pg_catalog.md5(p.prosrc) from pg_catalog.pg_proc p
      where p.oid='ojjuda_referral_internal.capture_signup()'::regprocedure)
     is distinct from '065f951550da153de258b8f57bbdb701' then
    raise exception 'signup_referral_capture_definition_changed';
  end if;
end;
$preflight$;

-- Anonymous visitors may resolve one known public ID, without account details
-- or direct access to auth, suspension, deletion, or referral tables.
create function ojjuda_referral_internal.resolve_candidate(p_ref text)
returns table(id uuid, nickname text)
language plpgsql stable security definer set search_path = '' as $$
declare v_code text := nullif(pg_catalog.btrim(p_ref),'');
begin
  if v_code is null or pg_catalog.char_length(v_code)<>36
    or v_code !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  return query
    select p.id,p.nickname
    from public.profiles p
    join auth.users u on u.id=p.id
    left join public.user_private v on v.user_id=p.id
    where p.id=v_code::uuid and pg_catalog.char_length(p.nickname)>0
      and u.email_confirmed_at is not null and u.is_anonymous is not true
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=pg_catalog.now())
      and (v.banned_until is null or v.banned_until<=pg_catalog.now())
      and not exists(select 1 from ojjuda_account_deletion.requests d where d.user_id=p.id);
end;
$$;
create function public.resolve_signup_referrer(p_ref text)
returns table(id uuid,nickname text)
language sql stable security invoker set search_path = '' as $$
  select * from ojjuda_referral_internal.resolve_candidate(p_ref);
$$;
revoke all on function ojjuda_referral_internal.resolve_candidate(text),public.resolve_signup_referrer(text)
  from public,anon,authenticated,service_role;
grant execute on function ojjuda_referral_internal.resolve_candidate(text),public.resolve_signup_referrer(text)
  to anon,authenticated;

create or replace function ojjuda_referral_internal.capture_signup()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
  v_code text := nullif(btrim(v_meta->>'referrer_code'),'');
  v_id text := nullif(btrim(v_meta->>'referrer_id'),'');
  v_name text := nullif(btrim(v_meta->>'referrer_nickname'),'');
  v_referrer uuid;
begin
  if v_code is null and v_id is null and v_name is null then return new; end if;
  if v_code is not null then
    -- A link is stable across nickname changes; do not mix it with a separate
    -- manually selected referrer or trust a client-supplied nickname.
    if v_id is not null or v_name is not null or char_length(v_code)<>36
      or v_code !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_signup_referrer' using errcode='22023';
    end if;
    v_referrer:=v_code::uuid;
  else
    -- Preserve the existing optional manual id + exact nickname contract.
    if v_id is null or v_name is null or char_length(v_name)>12 then
      raise exception 'invalid_signup_referrer' using errcode='22023';
    end if;
    begin v_referrer:=v_id::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_signup_referrer' using errcode='22023';
    end;
  end if;
  if v_referrer=new.id then raise exception 'invalid_signup_referrer' using errcode='22023'; end if;
  -- Revalidate inside the signup transaction, even after a successful preview.
  -- Lock the existing identity/profile while recording its attribution.
  perform p.id from public.profiles p
    join auth.users u on u.id=p.id
    left join public.user_private v on v.user_id=p.id
    where p.id=v_referrer and (v_code is not null or p.nickname=v_name)
      and char_length(p.nickname)>0
      and u.email_confirmed_at is not null and u.is_anonymous is not true
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now())
      and (v.banned_until is null or v.banned_until<=now())
      and not exists(select 1 from ojjuda_account_deletion.requests d where d.user_id=p.id)
    for share of p,u;
  if not found then raise exception 'invalid_signup_referrer' using errcode='22023'; end if;
  insert into ojjuda_referral_internal.signups(user_id,referrer_id,created_at,confirmed_at)
    values(new.id,v_referrer,new.created_at,new.email_confirmed_at);
  update auth.users set raw_user_meta_data=raw_user_meta_data-array['referrer_code','referrer_id','referrer_nickname'] where id=new.id;
  return new;
end;
$$;
-- CREATE OR REPLACE preserves the owner-only trigger-function ACL. No new table
-- access, trigger, existing-user claim path, or reward operation is introduced.
notify pgrst,'reload schema';
