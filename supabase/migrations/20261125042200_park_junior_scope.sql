-- A child membership gets a distinct database role, never authenticated privileges.
create role park_junior nologin noinherit;
grant park_junior to authenticator;
grant usage on schema public,auth,ojjuda_note,ojjuda_note_internal,ojjuda_account_internal to park_junior;
grant execute on function auth.uid(),auth.jwt(),auth.role() to park_junior;
grant select(id,nickname) on public.profiles to park_junior;
grant select(user_id,coins) on public.user_private to park_junior;
create policy park_junior_own_profile on public.profiles for select to park_junior using(id=(select auth.uid()));
create policy park_junior_own_balance on public.user_private for select to park_junior using(user_id=(select auth.uid()));

-- Auth sets its default group again after INSERT; preserve the restricted role on refresh/update too.
create function ojjuda_account_internal.keep_park_junior_role() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.role='park_junior' or old.raw_app_meta_data->>'park_guardian_account'='true' or new.raw_app_meta_data->>'park_guardian_account'='true' then
    new.role:='park_junior';
    new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}')||'{"park_guardian_account":true}'::jsonb;
  end if;
  return new;
end $$;
revoke all on function ojjuda_account_internal.keep_park_junior_role() from public,anon,authenticated,park_junior;
create trigger keep_park_junior_role before update of role,raw_app_meta_data on auth.users
  for each row execute function ojjuda_account_internal.keep_park_junior_role();

-- Only the ordinary adult signup flow runs the general account/profile setup UI.
create function ojjuda_account_internal.create_junior_park_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare nickname text;
begin
  if exists(select from ojjuda_account_internal.park_guardian_consents where child_user_id=new.user_id) then
    select btrim(raw_user_meta_data->>'nickname') into nickname from auth.users where id=new.user_id;
    if coalesce(char_length(replace(nickname,'❤️❤️','♥')),0) not between 1 and 12 then raise exception 'nickname_required'; end if;
    insert into public.profiles(id,nickname) values(new.user_id,nickname) on conflict(id) do nothing;
    insert into public.user_private(user_id) values(new.user_id) on conflict(user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function ojjuda_account_internal.create_junior_park_profile() from public,anon,authenticated,park_junior;
create trigger create_junior_park_profile after insert on ojjuda_account_internal.member_identity
  for each row execute function ojjuda_account_internal.create_junior_park_profile();

create function public.park_guardian_location_allowed() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select from auth.users u where u.id=auth.uid() and not coalesce(u.is_anonymous,false)
    and ((u.role is distinct from 'park_junior' and coalesce(u.raw_app_meta_data->>'park_guardian_account','false')<>'true')
    or exists(select from ojjuda_account_internal.park_guardian_consents c where c.child_user_id=u.id
      and c.location_allowed and c.revoked_at is null)))
$$;
revoke all on function public.park_guardian_location_allowed() from public,anon,authenticated,park_junior;
grant execute on function public.park_guardian_location_allowed() to authenticated,park_junior;

-- Invoker wrappers need the specific underlying function in addition to the public entry.
do $permissions$
declare fn regprocedure;
begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='ojjuda_note' and p.proname=any(array['get_note_state','list_cards','get_card','publish_card',
     'block_card_author','unblock_author','list_blocks','report_card','archive_my_card','card_genders','is_note_moderator',
     'read_draft','save_draft','discard_draft','list_my_card_font_entitlements','list_my_card_photo_entitlements','suggest_card_tags','set_my_gender']))
     or (n.nspname='ojjuda_note_internal' and p.proname=any(array['get_note_state','block_card_author','unblock_author',
       'read_draft','save_draft','discard_draft','list_blocks','report_card','archive_my_card','is_note_moderator']))
     or (n.nspname='ojjuda_account_internal' and p.proname=any(array['get_my_member_identity','set_card_gender']))
 loop execute format('grant execute on function %s to park_junior',fn); end loop;
end $permissions$;
grant execute on function public.get_my_member_identity(),public.ojjuda_location_preference(boolean,bigint,uuid,boolean)
  to park_junior;
grant select on ojjuda_note.public_cards,ojjuda_note_internal.visible_cards_feed to park_junior;

-- Proximity reads also accept coordinates, even if no new card gets stored.
do $read_guards$
declare fn regprocedure; current_def text; guarded text;
begin
 foreach fn in array array['ojjuda_note.get_card(uuid,double precision,double precision)'::regprocedure,
    'ojjuda_note.list_cards(text,double precision,double precision,integer,integer,jsonb)'::regprocedure] loop
   current_def:=pg_get_functiondef(fn);
   guarded:=regexp_replace(current_def,E'\nBEGIN\n',E'\nBEGIN\n  IF (p_lat IS NOT NULL OR p_lon IS NOT NULL) AND auth.uid() IS NOT NULL AND NOT public.park_guardian_location_allowed() THEN RAISE EXCEPTION ''park_guardian_location_required'' USING ERRCODE=''42501''; END IF;\n','i');
   if current_def=guarded then raise exception 'Unrecognized Park proximity function %',fn; end if;
   execute guarded;
 end loop;
end $read_guards$;

-- A revoked grant also invalidates outstanding REST sessions. Ordinary accounts keep their existing permissions.
create function public.check_park_junior_session() returns void
language plpgsql stable security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();
 claimed_role text:=auth.role();
 protected boolean;
 has_receipt boolean;
 active boolean;
begin
 if actor is null and claimed_role is distinct from 'park_junior' then return; end if;
 select (u.role='park_junior' or coalesce(u.raw_app_meta_data->>'park_guardian_account','false')='true'),
   c.child_user_id is not null,c.revoked_at is null
 into protected,has_receipt,active
 from auth.users u left join ojjuda_account_internal.park_guardian_consents c on c.child_user_id=u.id
 where u.id=actor;
 if claimed_role='park_junior' or coalesce(protected,false) or coalesce(has_receipt,false) then
   if claimed_role is distinct from 'park_junior' or not coalesce(protected and has_receipt and active,false) then
     raise exception 'park_membership_unavailable' using errcode='42501';
   end if;
 end if;
end $$;
revoke all on function public.check_park_junior_session() from public;
grant execute on function public.check_park_junior_session() to anon,authenticated,park_junior,service_role;
do $$ begin
  if exists(select from pg_db_role_setting s cross join lateral unnest(s.setconfig) x
     where s.setrole='authenticator'::regrole and s.setdatabase in (0,(select oid from pg_database where datname=current_database()))
     and x like 'pgrst.db_pre_request=%' and x<>'pgrst.db_pre_request=public.check_park_junior_session') then
     raise exception 'An existing PostgREST request hook must be preserved'; end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.check_park_junior_session';
notify pgrst,'reload config';
notify pgrst,'reload schema';
