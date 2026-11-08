-- One monthly read for a game's top ten and the viewer's own position.
-- This never resets or rewrites scores: the existing 01:00 KST ledger and
-- monthly archive cron remain the sole source of truth.
begin;
set local lock_timeout='5s';

create function public.community_game_monthly_personal(p_game text,p_guest_token text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();
 v_now timestamptz:=statement_timestamp();
 v_month date;
 v_start timestamptz;
 v_hash text;
 v_leaders jsonb;
 v_mine jsonb;
 v_own record;
 v_before bigint;
begin
 if p_game is null or p_game<>all(ojjuda_ranking_internal.catalog()) then
  raise exception 'invalid_game' using errcode='22023';
 end if;

 -- Use the existing per-game member, age, moderation and block checks.
 v_leaders:=ojjuda_ranking_internal.current_rows(p_game,p_guest_token)::jsonb;
 v_month:=ojjuda_ranking_internal.month_key(v_now);
 v_start:=ojjuda_ranking_internal.month_start(v_month);

 -- A top-ten player's own row is already highlighted by `me`.
 -- Search the full list only for players outside the top ten, avoiding an
 -- extra ranking sort for the common top-ten/anonymous viewer.
 if not exists(select 1 from jsonb_array_elements(v_leaders) entry
  where entry->>'me'='true') then
  if p_guest_token ~ '^[a-f0-9]{64}$' then
   v_hash:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');
  end if;
  if actor is not null or v_hash is not null then
   -- Look up the owner's record first. A visitor without a score must not
   -- trigger a full-list ranking sort on every page view.
   select c.* into v_own
   from ojjuda_ranking_internal.candidates(p_game,v_start,v_now+interval '1 microsecond') c
   where (p_game not in('bang','tank','matgo','poker','roulette')
    or not public.blocked_between(actor,c.user_id))
    and ((actor is not null and c.user_id=actor)
     or (v_hash is not null and c.identity_key='guest:'||v_hash))
   order by c.priority desc,c.score desc,c.achieved_at,c.identity_key limit 1;
   if found then
    select count(*) into v_before
    from ojjuda_ranking_internal.candidates(p_game,v_start,v_now+interval '1 microsecond') c
    where (p_game not in('bang','tank','matgo','poker','roulette')
     or not public.blocked_between(actor,c.user_id))
     and (c.priority>v_own.priority
      or (c.priority=v_own.priority and c.score>v_own.score)
      or (c.priority=v_own.priority and c.score=v_own.score and c.achieved_at<v_own.achieved_at)
      or (c.priority=v_own.priority and c.score=v_own.score and c.achieved_at=v_own.achieved_at
       and c.identity_key<v_own.identity_key));
    v_mine:=v_own.details||jsonb_build_object('rank',v_before+1,'nick',v_own.nick,'score',v_own.score,'me',true);
   end if;
  end if;
 end if;

 return jsonb_build_object(
  'month',to_char(v_month,'YYYY-MM'),
  'startsAt',v_start,
  'endsAt',ojjuda_ranking_internal.month_start((v_month+interval '1 month')::date),
  'leaders',v_leaders,'mine',v_mine);
end;
$$;

revoke all on function public.community_game_monthly_personal(text,text) from public,anon,authenticated;
grant execute on function public.community_game_monthly_personal(text,text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
