-- Park enrollment is independently released after notice, provider and access checks.
create table ojjuda_account_internal.park_guardian_release (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  opens_at timestamptz not null default timestamptz '2026-12-26 00:00:00+09'
);
insert into ojjuda_account_internal.park_guardian_release default values;

create table ojjuda_account_internal.park_guardian_consents (
  id uuid primary key default gen_random_uuid(),
  token_digest bytea not null unique,
  child_email text not null,
  birth_date date not null,
  guardian_email text not null check(guardian_email <> child_email),
  evidence_id text not null unique,
  reviewed_by uuid not null,
  verified_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '48 hours'),
  notice_version text not null default 'park-guardian-v1',
  location_allowed boolean not null,
  child_user_id uuid unique references auth.users(id) on delete cascade,
  consumed_at timestamptz,
  revoked_at timestamptz,
  check ((child_user_id is null) = (consumed_at is null))
);
create index park_guardian_email on ojjuda_account_internal.park_guardian_consents(child_email);
create table ojjuda_account_internal.park_guardian_decisions (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null references ojjuda_account_internal.park_guardian_consents on delete cascade,
  evidence_id text not null unique,
  actor uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  decision text not null check(decision in ('allow_location','withdraw_location','withdraw_signup'))
);
alter table ojjuda_account_internal.park_guardian_release enable row level security;
alter table ojjuda_account_internal.park_guardian_consents enable row level security;
alter table ojjuda_account_internal.park_guardian_decisions enable row level security;
revoke all on ojjuda_account_internal.park_guardian_release,
  ojjuda_account_internal.park_guardian_consents, ojjuda_account_internal.park_guardian_decisions
  from public, anon, authenticated;

create function public.park_guardian_signup_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled and now()>=opens_at from ojjuda_account_internal.park_guardian_release where singleton),false)
$$;

-- An operator first sends the versioned notice and verifies the guardian's reply.
-- The opaque code is returned once, never stored in plaintext or sent in a URL.
create function public.park_guardian_record_reply(p_child_email text,p_birth date,p_guardian_email text,
  p_evidence_id text,p_location boolean) returns text
language plpgsql security definer set search_path='' as $$
declare
  child text:=lower(btrim(p_child_email)); guardian text:=lower(btrim(p_guardian_email));
  evidence text:=btrim(p_evidence_id); token text;
  years integer:=ojjuda_account_internal.age_on(p_birth,(now() at time zone 'Asia/Seoul')::date);
begin
  if auth.uid() is null or public.is_admin() is not true then raise exception 'not_admin' using errcode='42501'; end if;
  if not public.park_guardian_signup_open() then raise exception 'park_signup_not_open'; end if;
  if years is null or years not in (12,13) or ojjuda_account_internal.signup_email_valid(child) is not true
    or coalesce(guardian,'') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or length(guardian)>254 or guardian=child or coalesce(length(evidence),0) not between 4 and 240
    or p_location is null then raise exception 'invalid_guardian_reply' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(child,1742));
  if exists(select from auth.users where lower(email)=child) then raise exception 'account_already_exists'; end if;
  -- Re-sending a new grant invalidates any previous unconsumed code.
  update ojjuda_account_internal.park_guardian_consents set revoked_at=clock_timestamp()
    where child_email=child and child_user_id is null and revoked_at is null;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into ojjuda_account_internal.park_guardian_consents
    (token_digest,child_email,birth_date,guardian_email,evidence_id,reviewed_by,location_allowed)
    values(sha256(convert_to(token,'UTF8')),child,p_birth,guardian,evidence,auth.uid(),p_location);
  return token;
end $$;

create function public.park_guardian_code_valid(p_code text) returns boolean language sql stable
security definer set search_path='' as $$
  select public.park_guardian_signup_open() and coalesce(p_code ~ '^[0-9a-f]{64}$',false) and exists (
    select from ojjuda_account_internal.park_guardian_consents where token_digest=sha256(convert_to(p_code,'UTF8'))
    and revoked_at is null and consumed_at is null and expires_at>now())
$$;

create function public.park_guardian_change_choice(p_child_email text,p_guardian_email text,
  p_evidence_id text,p_decision text) returns void
language plpgsql security definer set search_path='' as $$
declare c ojjuda_account_internal.park_guardian_consents; evidence text:=btrim(p_evidence_id);
begin
  if auth.uid() is null or public.is_admin() is not true then raise exception 'not_admin' using errcode='42501'; end if;
  if coalesce(p_decision,'') not in ('allow_location','withdraw_location','withdraw_signup')
    or coalesce(length(evidence),0) not between 4 and 240 then raise exception 'invalid_guardian_reply'; end if;
  select * into strict c from ojjuda_account_internal.park_guardian_consents
    where child_email=lower(btrim(p_child_email)) and guardian_email=lower(btrim(p_guardian_email))
      and revoked_at is null and (consumed_at is not null or expires_at>now()) for update;
  insert into ojjuda_account_internal.park_guardian_decisions(consent_id,evidence_id,actor,decision)
    values(c.id,evidence,auth.uid(),p_decision);
  update ojjuda_account_internal.park_guardian_consents set location_allowed=(p_decision='allow_location'),
    revoked_at=case when p_decision='withdraw_signup' then clock_timestamp() else null end where id=c.id;
  if c.child_user_id is not null and p_decision<>'allow_location' then
    insert into ojjuda_account_internal.location_preferences(user_id,enabled,version) values(c.child_user_id,false,1)
      on conflict(user_id) do update set enabled=false,version=ojjuda_account_internal.location_preferences.version+1;
    delete from ojjuda_note_internal.card_locations where author_id=c.child_user_id;
  end if;
  if c.child_user_id is not null and p_decision='withdraw_signup' then
    update auth.users set banned_until='infinity' where id=c.child_user_id;
  end if;
end $$;
revoke all on function public.park_guardian_signup_open(),public.park_guardian_code_valid(text),
  public.park_guardian_record_reply(text,date,text,text,boolean),
  public.park_guardian_change_choice(text,text,text,text) from public,anon,authenticated;
grant execute on function public.park_guardian_signup_open(),public.park_guardian_code_valid(text) to anon,authenticated;
grant execute on function public.park_guardian_record_reply(text,date,text,text,boolean),
  public.park_guardian_change_choice(text,text,text,text) to authenticated;

-- Consume the authorization in the same transaction that creates the child account.
create or replace function ojjuda_account_internal.capture_signup_identity()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  info jsonb; meta jsonb:=coalesce(new.raw_user_meta_data,'{}'::jsonb);
  years integer; member_birth date; code text:=meta->>'park_guardian_code'; consent_id uuid;
begin
  if coalesce(new.email,'')='' or coalesce(new.encrypted_password,'')='' then
    raise exception 'email_password_signup_required' using errcode='22023'; end if;
  if not ojjuda_account_internal.signup_email_valid(new.email) then raise exception 'invalid_signup_email' using errcode='22023'; end if;
  info:=ojjuda_account_internal.parse_identity(meta->>'birth_yymmdd',meta->>'gender_code',meta->>'phone_number',
    (clock_timestamp() at time zone 'Asia/Seoul')::date,false);
  if not ojjuda_account_internal.signup_phone_valid(info->>'phone_number') then raise exception 'invalid_signup_phone' using errcode='22023'; end if;
  years:=(info->>'age')::integer; member_birth:=(info->>'birth_date')::date;
  if years<12 then raise exception 'signup_age_12_or_older_required' using errcode='22023';
  elsif years<14 then
    if meta->>'park_signup' is distinct from 'true' or meta->>'terms_version' is distinct from 'park-guardian-v1'
      or public.park_guardian_code_valid(code) is not true then raise exception 'park_guardian_consent_required' using errcode='42501'; end if;
    update ojjuda_account_internal.park_guardian_consents set consumed_at=clock_timestamp(),child_user_id=new.id
      where token_digest=sha256(convert_to(code,'UTF8')) and child_email=lower(btrim(new.email))
      and birth_date=member_birth and revoked_at is null and consumed_at is null and expires_at>clock_timestamp()
      and notice_version=meta->>'terms_version' returning id into consent_id;
    if consent_id is null then raise exception 'park_guardian_consent_required' using errcode='42501'; end if;
    update auth.users set role='park_junior',raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
      || jsonb_build_object('park_guardian_account',true) where id=new.id;
  elsif coalesce(meta->>'age_14_or_older',meta->>'age_15_to_69') is distinct from 'true'
     or nullif(meta->>'terms_version','') is null or meta->>'terms_version'='park-guardian-v1' then
    raise exception 'signup_consent_required' using errcode='22023';
  end if;
  insert into ojjuda_account_internal.member_identity(user_id,birth_date,gender,phone_number,age_at_signup,consent_version)
    values(new.id,member_birth,info->>'gender',info->>'phone_number',years,meta->>'terms_version');
  update auth.users set raw_user_meta_data=raw_user_meta_data-array['birth_yymmdd','gender_code','phone_number',
    'birth_date','gender','park_guardian_code','park_signup'] where id=new.id;
  return new;
end $$;

create function ojjuda_account_internal.guard_child_card_location() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists (select from ojjuda_account_internal.park_guardian_consents where child_user_id=new.author_id) then
    perform 1 from ojjuda_account_internal.park_guardian_consents where child_user_id=new.author_id
      and location_allowed and revoked_at is null for share;
    if not found then raise exception 'park_guardian_location_required' using errcode='42501'; end if;
  end if;
  return new;
end $$;
revoke all on function ojjuda_account_internal.guard_child_card_location() from public,anon,authenticated;
create trigger park_guardian_card_location before insert or update on ojjuda_note_internal.card_locations
  for each row execute function ojjuda_account_internal.guard_child_card_location();

-- Email identity rows can be written after the Auth user trigger.
CREATE OR REPLACE FUNCTION ojjuda_account_internal.strip_captured_signup_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  private_keys CONSTANT text[] := ARRAY['birth_yymmdd','gender_code','phone_number','birth_date','gender','park_guardian_code','park_signup'];
BEGIN
  IF TG_RELID = 'auth.users'::regclass THEN
    IF EXISTS (SELECT FROM ojjuda_account_internal.member_identity WHERE user_id = NEW.id) THEN
      NEW.raw_user_meta_data := NEW.raw_user_meta_data - private_keys;
    END IF;
  ELSIF TG_RELID = 'auth.identities'::regclass THEN
    IF EXISTS (SELECT FROM ojjuda_account_internal.member_identity WHERE user_id = NEW.user_id) THEN
      NEW.identity_data := NEW.identity_data - private_keys;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Expired invitations never attached to an account are no longer needed.
select cron.schedule('park-guardian-expired-grants','18 * * * *',
  'delete from ojjuda_account_internal.park_guardian_consents where child_user_id is null and (expires_at<now() or revoked_at is not null)');
notify pgrst,'reload schema';
