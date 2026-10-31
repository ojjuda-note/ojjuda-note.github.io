-- Route individual roulette boards through the same settled-payout source
-- used by the monthly leaders and history archive. Preserve other games.
begin;
set local lock_timeout='5s';

do $roulette_dispatch$
declare definition text;anchor text;addition text;signature text;
begin
 definition:=pg_get_functiondef('ojjuda_guest_internal.criteria_ranking(text,text,text)'::regprocedure);
 anchor:=$anchor$begin
 if p_period='month' and p_game in('tour','tank','ttang','spot','matgo','poker','billiards','carom4','carom3','pool8','janggi','chess') then$anchor$;
 if cardinality(string_to_array(definition,anchor))<>2 or position('ojjuda_roulette_internal.check_member' in definition)>0 then
  raise exception 'roulette criteria dispatch prerequisite changed';
 end if;
 addition:=$branch$begin
 if p_game='roulette' then
  if p_period is null or p_period not in('day','month','all') then return '[]'::json;end if;
  perform ojjuda_roulette_internal.check_member(actor);
  if p_period='month' then return ojjuda_ranking_internal.current_rows(p_game,p_guest_token);end if;
  v_start:=case when p_period='all' then '-infinity'::timestamptz
   else date_trunc('day',v_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' end;
  select coalesce(json_agg(r.item order by r.score desc,r.achieved_at,r.identity_key),'[]'::json) into result
  from (
   select c.score,c.achieved_at,c.identity_key,
    c.details||jsonb_build_object('nick',c.nick,'score',c.score,'me',c.user_id=actor) item
   from ojjuda_ranking_internal.candidates('roulette',v_start,v_now+interval '1 microsecond') c
   where not public.blocked_between(actor,c.user_id)
   order by c.score desc,c.achieved_at,c.identity_key limit 10
  ) r;
  return result;
 end if;
 if p_period='month' and p_game in('tour','tank','ttang','spot','matgo','poker','billiards','carom4','carom3','pool8','janggi','chess') then$branch$;
 execute replace(definition,anchor,addition);

 -- Both public wrappers are invokers. Keep their existing permission boundary
 -- by calling the established, member-checking security-definer dispatcher.
 anchor:=$allowlist$if p_game in ('tour','tank','ttang','spot','matgo','poker','billiards','carom4','carom3','pool8','janggi','chess') then$allowlist$;
 addition:=$allowlist$if p_game in ('tour','tank','ttang','spot','matgo','poker','billiards','carom4','carom3','pool8','janggi','chess','roulette') then$allowlist$;
 foreach signature in array array['public.community_game_monthly_ranking(text)','public.community_game_ranking(text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if cardinality(string_to_array(definition,anchor))<>2 then
   raise exception 'roulette public ranking prerequisite changed: %',signature;
  end if;
  execute replace(definition,anchor,addition);
 end loop;
end;
$roulette_dispatch$;

notify pgrst,'reload schema';
commit;
