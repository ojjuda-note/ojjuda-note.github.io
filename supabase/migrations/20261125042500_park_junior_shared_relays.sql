-- Legacy game Edge Functions replace a user's JWT with a service credential.
-- Authorize their authenticated actor again where all deployed revisions converge.
create function public.park_require_shared_relay_actor(p_actor uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select from auth.users u where u.id=p_actor and
      (u.role='park_junior' or u.raw_app_meta_data->>'park_guardian_account'='true')
  ) then
    raise exception 'park_service_only' using errcode='42501';
  end if;
  return p_actor;
end;
$$;
revoke all on function public.park_require_shared_relay_actor(uuid) from public,anon,authenticated;
grant execute on function public.park_require_shared_relay_actor(uuid) to service_role;

do $migration$
declare
  names text[]:=array[
    'bang_online_service','flat_drill_verified_clear','game_computer_commit','game_verified_commit',
    'marble_online_service','matgo_abandon_round','matgo_fun_service','matgo_online_fallback',
    'matgo_online_service','matgo_ranked_settle','matgo_stake_service','matgo_wallet_service',
    'onecard_online_service','tank_online_service'
  ];
  routine record;
  original text;
  body text;
  actor text;
  visited text[]:='{}';
begin
  for routine in select p.*,l.lanname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    join pg_catalog.pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.proname=any(names)
  loop
    actor:=case when routine.proname='flat_drill_verified_clear' then 'p_user' else 'p_actor' end;
    if not coalesce(actor=any(routine.proargnames),false) then
      raise exception 'Missing relay actor in %',routine.oid::regprocedure;
    end if;
    -- Keep all argument defaults, ACLs, volatility, search paths and security attributes.
    original:=pg_get_functiondef(routine.oid);
    if routine.lanname='sql' and routine.prosrc ~* ('^\s*select\s+\w+\.\w+\(\s*'||actor||'\s*,') then
      body:=regexp_replace(routine.prosrc,'\m'||actor||'\M','public.park_require_shared_relay_actor('||actor||')');
    elsif routine.lanname='plpgsql' then
      body:=regexp_replace(routine.prosrc,'\mbegin\M','begin'||chr(10)||
        '  perform public.park_require_shared_relay_actor('||actor||');','i');
    else
      raise exception 'Unrecognized game relay %',routine.oid::regprocedure;
    end if;
    if body=routine.prosrc or strpos(original,routine.prosrc)=0 then
      raise exception 'Cannot add actor guard to %',routine.oid::regprocedure;
    end if;
    execute replace(original,routine.prosrc,body);
    visited:=array_append(visited,routine.proname::text);
  end loop;
  if not names<@visited then raise exception 'Game relay set changed'; end if;
end
$migration$;
