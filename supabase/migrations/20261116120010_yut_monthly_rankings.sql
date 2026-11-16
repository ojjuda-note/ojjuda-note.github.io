begin;
set local lock_timeout='5s';

alter table ojjuda_guest_internal.round_records
 drop constraint round_records_game_check,
 drop constraint round_records_actor_check,
 drop constraint round_records_outcome_check,
 add constraint round_records_game_check check(game in ('tour','tank','ttang','matgo','poker','yut')),
 add constraint round_records_actor_check check(
  (user_id is not null and guest_hash is null and actor_key='member:'||user_id::text)
  or (user_id is null and guest_hash is not null and guest_hash ~ '^[a-f0-9]{64}$'
   and actor_key='guest:'||guest_hash and game in ('tour','ttang','yut'))),
 add constraint round_records_outcome_check check(game not in ('tour','tank','ttang','yut') or value in (0,1));

-- Reuse the casual, per-actor round receipt (including duplicate/conflict and ban checks).
-- These self-reported outcomes carry no rewards in any play mode.
do $yut$
declare definition text;
begin
 definition:=pg_get_functiondef('ojjuda_guest_internal.record_ttang_result(uuid,boolean,text)'::regprocedure);
 execute replace(replace(replace(definition,'record_ttang_result','record_yut_result'),
  '''ttang''','''yut'''),'ojjuda-ttang-result:','ojjuda-yut-result:');
end;
$yut$;
revoke all on function ojjuda_guest_internal.record_yut_result(uuid,boolean,text) from public;
grant execute on function ojjuda_guest_internal.record_yut_result(uuid,boolean,text) to anon,authenticated;
create function public.record_yut_result(p_round uuid,p_won boolean,p_guest_token text default null)
returns json language sql security invoker set search_path='' as $$
 select ojjuda_guest_internal.record_yut_result(p_round,p_won,p_guest_token)
$$;
revoke all on function public.record_yut_result(uuid,boolean,text) from public;
grant execute on function public.record_yut_result(uuid,boolean,text) to anon,authenticated;

-- Extend only the shared streak branches used by the monthly list, personal rank and archive.
do $monthly$
declare signature regprocedure; definition text; updated text;
begin
 foreach signature in array array[
  'ojjuda_ranking_internal.catalog()'::regprocedure,
  'ojjuda_ranking_internal.candidates(text,timestamptz,timestamptz)'::regprocedure,
  'ojjuda_ranking_internal.round_participants(text,timestamptz,timestamptz)'::regprocedure
 ] loop
  definition:=pg_get_functiondef(signature);
  updated:=replace(definition,'''tour'',','''tour'',''yut'',');
  if definition=updated then raise exception 'Missing streak branch in %',signature;end if;
  execute updated;
 end loop;
 definition:=pg_get_functiondef('public.community_game_monthly_ranking(text)'::regprocedure);
 updated:=regexp_replace(definition,'\mbegin\M',E'begin\n if p_game=''yut'' then return (public.community_game_monthly_personal(p_game,null)->''leaders'')::json;end if;','i');
 if definition=updated then raise exception 'Missing monthly dispatcher';end if;
 execute updated;
end;
$monthly$;
notify pgrst,'reload schema';
commit;
