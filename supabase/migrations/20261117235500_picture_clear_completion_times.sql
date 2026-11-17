begin;

-- Picture clears already have a unique actor, stage and month. Preserve that identity
-- on a late retry, including the two distinct Korean midnight and 01:00 boundaries.
create function ojjuda_ranking_internal.picture_finished_at(p_at timestamptz)
returns timestamptz language sql stable set search_path='' as $$
  select least(p_at,statement_timestamp())
  where isfinite(p_at) and p_at<=statement_timestamp()+interval '5 minutes'
    and ojjuda_ranking_internal.month_key(p_at)>=(select first_month from ojjuda_ranking_internal.settings where singleton);
$$;
revoke all on function ojjuda_ranking_internal.picture_finished_at(timestamptz) from public,anon,authenticated;

create function ojjuda_guest_internal.record_spot_clear_at(p_stage integer,p_finished_at timestamptz,p_expected_owner uuid,p_guest_token text)
returns json language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  finished timestamptz:=ojjuda_ranking_internal.picture_finished_at(p_finished_at);
  season date:=ojjuda_ranking_internal.month_key(finished);
  token_hash text;
  who text;
  added integer;
  total integer;
begin
  if actor is distinct from p_expected_owner then return json_build_object('ok',false,'reason','account_changed'); end if;
  if finished is null or p_stage is null or p_stage not between 1 and 182 then return json_build_object('ok',false,'reason','invalid'); end if;
  if actor is not null then
    if not exists(select 1 from public.profiles where id=actor) then raise exception 'not_signed_in'; end if;
    if public.is_banned(actor) then return json_build_object('ok',false,'reason','banned'); end if;
    who:='member:'||actor::text;
  else
    if p_guest_token is null or octet_length(p_guest_token)<>64 or p_guest_token !~ '^[a-f0-9]{64}$' then
      return json_build_object('ok',false,'reason','invalid');
    end if;
    token_hash:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');
    who:='guest:'||token_hash;
  end if;
  insert into ojjuda_guest_internal.spot_clears(actor_key,user_id,guest_hash,stage,month_start,achieved_at)
    values(who,actor,token_hash,p_stage,date_trunc('month',finished at time zone 'Asia/Seoul')::date,finished)
    on conflict do nothing;
  insert into ojjuda_ranking_internal.picture_clears(game,actor_key,user_id,guest_hash,stage_key,month_start,achieved_at)
    values('spot',who,actor,token_hash,p_stage::text,season,finished) on conflict do nothing;
  get diagnostics added=row_count;
  select count(*) into total from ojjuda_ranking_internal.picture_clears
    where game='spot' and actor_key=who and month_start=season;
  return json_build_object('ok',true,'score',total,'duplicate',added=0,'verified',false,'reward',0,
    'previous_period',season<>ojjuda_ranking_internal.month_key(statement_timestamp()));
end;
$$;

create function ojjuda_photo_internal.record_game_clear_at(p_stage_id text,p_finished_at timestamptz,p_expected_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  finished timestamptz:=ojjuda_ranking_internal.picture_finished_at(p_finished_at);
  season date:=ojjuda_ranking_internal.month_key(finished);
  total integer;
begin
  if actor is null or not ojjuda_photo_internal.member_allowed()
    or not exists(select 1 from public.profiles where id=actor) or public.is_banned(actor)
    then raise exception 'not_allowed' using errcode='42501'; end if;
  if actor is distinct from p_expected_owner then return jsonb_build_object('ok',false,'reason','account_changed'); end if;
  if finished is null then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  if p_stage_id ~ '^([0-9]|[1-3][0-9])$' then null;
  elsif p_stage_id ~ '^c[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists(select 1 from public.photo_stages s where s.id=substring(p_stage_id from 2)::uuid
      and s.status='approved' and s.created_at<=finished and (s.owner=actor or public.photo_is_admin() or s.visibility='public'
        or (s.visibility='friends' and public.photo_is_friend(s.owner,actor)))) then null;
  else raise exception 'invalid_stage' using errcode='22023'; end if;
  insert into ojjuda_photo_internal.game_clears(user_id,month_start,stage_key,cleared_at)
    values(actor,date_trunc('month',finished at time zone 'Asia/Seoul')::date,p_stage_id,finished) on conflict do nothing;
  insert into ojjuda_ranking_internal.picture_clears(game,actor_key,user_id,stage_key,month_start,achieved_at)
    values('photo_ttang','member:'||actor::text,actor,p_stage_id,season,finished) on conflict do nothing;
  select count(*) into total from ojjuda_ranking_internal.picture_clears
    where game='photo_ttang' and user_id=actor and month_start=season;
  return jsonb_build_object('ok',true,'score',total,'previous_period',season<>ojjuda_ranking_internal.month_key(statement_timestamp()));
end;
$$;

create function public.record_spot_clear_at(p_stage integer,p_finished_at timestamptz,p_expected_owner uuid,p_guest_token text default null)
returns json language sql security invoker set search_path='' as $$
  select ojjuda_guest_internal.record_spot_clear_at(p_stage,p_finished_at,p_expected_owner,p_guest_token);
$$;
create function public.record_photo_ttang_clear_at(p_stage_id text,p_finished_at timestamptz,p_expected_owner uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select ojjuda_photo_internal.record_game_clear_at(p_stage_id,p_finished_at,p_expected_owner);
$$;
-- Clients already open continue to use the same rules with a server timestamp.
create or replace function ojjuda_guest_internal.record_spot_clear(p_stage integer,p_guest_token text)
returns json language sql security definer set search_path='' as $$
  select ojjuda_guest_internal.record_spot_clear_at(p_stage,statement_timestamp(),auth.uid(),p_guest_token);
$$;
create or replace function ojjuda_photo_internal.record_game_clear(p_stage text)
returns jsonb language sql security definer set search_path='' as $$
  select ojjuda_photo_internal.record_game_clear_at(p_stage,statement_timestamp(),auth.uid());
$$;
revoke all on function ojjuda_guest_internal.record_spot_clear_at(integer,timestamptz,uuid,text),public.record_spot_clear_at(integer,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function ojjuda_guest_internal.record_spot_clear_at(integer,timestamptz,uuid,text),public.record_spot_clear_at(integer,timestamptz,uuid,text) to anon,authenticated;
revoke all on function ojjuda_photo_internal.record_game_clear_at(text,timestamptz,uuid),public.record_photo_ttang_clear_at(text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function ojjuda_photo_internal.record_game_clear_at(text,timestamptz,uuid),public.record_photo_ttang_clear_at(text,timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
