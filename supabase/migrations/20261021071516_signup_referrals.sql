-- Optional referrals are captured once, in the signup transaction.
create extension if not exists fuzzystrmatch with schema extensions;
create schema ojjuda_referral_internal;
revoke all on schema ojjuda_referral_internal from public, anon, authenticated;
grant usage on schema ojjuda_referral_internal to anon, authenticated;

create table ojjuda_referral_internal.signups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (user_id is null or user_id <> referrer_id)
);
create index signup_referrer_idx on ojjuda_referral_internal.signups(referrer_id);
alter table ojjuda_referral_internal.signups enable row level security;
revoke all on ojjuda_referral_internal.signups from public, anon, authenticated;

-- The only anonymous lookup exposes at most five public nicknames and their IDs.
-- It intentionally works before login; private account data is never returned.
create function ojjuda_referral_internal.search_candidates(p_query text)
returns table(id uuid, nickname text)
language plpgsql stable security definer set search_path = pg_catalog as $$
declare q text := lower(normalize(btrim(coalesce(p_query,'')),NFC));
begin
  if char_length(q) not between 1 and 12 then return; end if;
  return query
  with candidates as (
    select p.id, p.nickname, lower(normalize(p.nickname,NFC)) as name
    from public.profiles p
    join auth.users u on u.id=p.id
    left join public.user_private v on v.user_id=p.id
    where char_length(p.nickname) between 1 and 12
      and u.email_confirmed_at is not null
      and (v.banned_until is null or v.banned_until<=now())
  ), matches as (
    select c.*, extensions.levenshtein_less_equal(c.name,q,2) as distance
    from candidates c
    where c.name=q or (char_length(q)>=2 and (
      strpos(c.name,q)>0 or (abs(char_length(c.name)-char_length(q))<=2
        and extensions.levenshtein_less_equal(c.name,q,2)<=case when char_length(q)>=5 then 2 else 1 end)))
  )
  select m.id,m.nickname from matches m
  order by case when m.name=q then 0 when starts_with(m.name,q) then 1
    when strpos(m.name,q)>0 then 2 else 3 end,m.distance,m.name,m.id
  limit 5;
end;
$$;
create function public.search_signup_referrers(p_query text)
returns table(id uuid,nickname text)
language sql stable security invoker set search_path = pg_catalog as $$
  select * from ojjuda_referral_internal.search_candidates(p_query);
$$;

create function ojjuda_referral_internal.capture_signup()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
  v_id text := nullif(btrim(v_meta->>'referrer_id'),'');
  v_name text := nullif(btrim(v_meta->>'referrer_nickname'),'');
  v_referrer uuid;
begin
  if v_id is null and v_name is null then return new; end if;
  if v_id is null or v_name is null or char_length(v_name)>12 then
    raise exception 'invalid_signup_referrer' using errcode='22023';
  end if;
  begin v_referrer:=v_id::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid_signup_referrer' using errcode='22023';
  end;
  if v_referrer=new.id then raise exception 'invalid_signup_referrer' using errcode='22023'; end if;
  perform p.id from public.profiles p
    join auth.users u on u.id=p.id
    left join public.user_private v on v.user_id=p.id
    where p.id=v_referrer and p.nickname=v_name and u.email_confirmed_at is not null
      and (v.banned_until is null or v.banned_until<=now())
    for share of p;
  if not found then raise exception 'invalid_signup_referrer' using errcode='22023'; end if;
  insert into ojjuda_referral_internal.signups(user_id,referrer_id,created_at,confirmed_at)
    values(new.id,v_referrer,new.created_at,new.email_confirmed_at);
  update auth.users set raw_user_meta_data=raw_user_meta_data-array['referrer_id','referrer_nickname'] where id=new.id;
  return new;
end;
$$;
create trigger capture_signup_referral after insert on auth.users
for each row execute function ojjuda_referral_internal.capture_signup();

create function ojjuda_referral_internal.confirm_signup()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  update ojjuda_referral_internal.signups set confirmed_at=new.email_confirmed_at
    where user_id=new.id and confirmed_at is null;
  return new;
end;
$$;
create trigger confirm_signup_referral after update of email_confirmed_at on auth.users
for each row when (new.email_confirmed_at is not null)
execute function ojjuda_referral_internal.confirm_signup();

create function ojjuda_referral_internal.admin_counts(p_query text default '',p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  q text := lower(left(btrim(coalesce(p_query,'')),100));
  page_offset integer := greatest(coalesce(p_offset,0),0);
  page_limit integer := least(greatest(coalesce(p_limit,20),1),50);
  result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'not_admin' using errcode='42501';
  end if;
  with counts as materialized (
    select p.id,p.nickname,
      count(s.id) filter(where s.confirmed_at is not null) as referral_count,
      count(s.id) filter(where s.confirmed_at is null and s.user_id is not null) as pending_count,
      max(s.confirmed_at) as last_referred_at
    from public.profiles p left join ojjuda_referral_internal.signups s on s.referrer_id=p.id
    where q='' or strpos(lower(p.nickname),q)>0
    group by p.id,p.nickname
  ), page as (
    select * from counts order by referral_count desc,last_referred_at desc nulls last,nickname,id
    offset page_offset limit page_limit
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by p.referral_count desc,p.last_referred_at desc nulls last,p.nickname,p.id) from page p),'[]'::jsonb),
    'total',(select count(*) from counts),'total_referrals',coalesce((select sum(referral_count) from counts),0),
    'pending_referrals',coalesce((select sum(pending_count) from counts),0),'offset',page_offset,'limit',page_limit)
  into result;
  return result;
end;
$$;
create function public.admin_referral_counts(p_query text default '',p_offset integer default 0,p_limit integer default 20)
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select ojjuda_referral_internal.admin_counts(p_query,p_offset,p_limit);
$$;

revoke all on all functions in schema ojjuda_referral_internal from public,anon,authenticated;
revoke all on function public.search_signup_referrers(text) from public,anon,authenticated;
revoke all on function public.admin_referral_counts(text,integer,integer) from public,anon,authenticated;
grant execute on function ojjuda_referral_internal.search_candidates(text),public.search_signup_referrers(text) to anon,authenticated;
grant execute on function ojjuda_referral_internal.admin_counts(text,integer,integer),public.admin_referral_counts(text,integer,integer) to authenticated;
notify pgrst,'reload schema';
