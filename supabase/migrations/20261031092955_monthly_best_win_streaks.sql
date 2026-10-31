-- Display each period's best consecutive winning run, not its current run.
-- A loss/draw separates runs; it never erases a best already achieved this month.
-- Personal current-streak counters and financial eligibility helpers are unchanged.
begin;
set local lock_timeout='5s';

create or replace function ojjuda_ranking_internal.round_participants(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,guest_hash text,score bigint,achieved_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_game not in('tour','ttang') then
  -- Matgo/Poker retain their positive best-round-gain semantics.
  return query select r.user_id,r.guest_hash,r.score,r.achieved_at
   from ojjuda_guest_internal.round_leaders(p_game,p_start,p_end) r;
  return;
 end if;
 return query with eligible as materialized (
  select r.* from ojjuda_guest_internal.round_records r
  where r.game=p_game and r.achieved_at>=p_start and r.achieved_at<=p_end
 ), ordered as (
  select r.*,count(*) filter(where r.value=0) over(partition by r.actor_key
   order by r.achieved_at,r.round_id,r.round_no rows unbounded preceding) run
  from eligible r
 ), runs as (
  select r.actor_key,r.user_id,r.guest_hash,r.run,count(*) filter(where r.value=1) score,
   max(r.achieved_at) filter(where r.value=1) achieved_at
  from ordered r group by r.actor_key,r.user_id,r.guest_hash,r.run
 ), best as materialized (
  select distinct on(r.actor_key) r.actor_key,r.user_id,r.guest_hash,r.score,r.achieved_at
  from runs r where r.score>0 order by r.actor_key,r.score desc,r.achieved_at
 )
 select b.user_id,b.guest_hash,b.score,b.achieved_at from best b
 union all
 select r.user_id,r.guest_hash,0::bigint,min(r.achieved_at)
 from eligible r where not exists(select 1 from best b where b.actor_key=r.actor_key)
 group by r.actor_key,r.user_id,r.guest_hash;
end;
$$;

create or replace function ojjuda_ranking_internal.tank_participants(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,opponents smallint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select r.* from ojjuda_guest_internal.round_records r
  where r.game='tank' and r.achieved_at>=p_start and r.achieved_at<=p_end
 ), ordered as (
  -- Every stored loss separates the game-wide run, even if old field metadata
  -- is missing. Unknown-field wins cannot claim a known opponent-field record.
  select r.*,count(*) filter(where r.value=0) over(partition by r.user_id
   order by r.achieved_at,r.round_id rows unbounded preceding) run from eligible r
 ), runs as (
  select r.user_id,r.opponents,r.run,count(*) filter(where r.value=1) score,
   max(r.achieved_at) filter(where r.value=1) achieved_at
  from ordered r where r.opponents is not null group by r.user_id,r.opponents,r.run
 ), best as materialized (
  select distinct on(r.user_id) r.user_id,r.score,r.opponents,r.achieved_at
  from runs r where r.score>0
  order by r.user_id,r.opponents desc,r.score desc,r.achieved_at
 )
 select b.user_id,b.score,b.opponents,b.achieved_at from best b
 union all
 select r.user_id,0::bigint,null::smallint,min(r.achieved_at)
 from eligible r where (r.opponents is not null or r.value=0)
  and not exists(select 1 from best b where b.user_id=r.user_id)
 group by r.user_id;
$$;

create function ojjuda_ranking_internal.board_participants(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,difficulty text,priority integer,variant text,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with finished as (
  select g.* from public.board_games g where
   (g.kind=p_game or (p_game in('billiards','carom4','carom3','pool8') and g.kind in('carom4','carom3','pool8')))
   and g.status='done' and g.result in('p1','p2','draw')
   and g.updated_at>=p_start and g.updated_at<=p_end
 ), events as materialized (
  -- Excluded seats neither increase a run nor split another eligible run.
  select p1 user_id,id round_id,kind variant,'online'::text difficulty,updated_at finished_at,
   case when result='p1' then 'win' when result='draw' then 'draw' else 'loss' end outcome
   from finished where not rank_excluded @> array['p1']
  union all
  select p2,id,kind,'online',updated_at,case when result='p2' then 'win' when result='draw' then 'draw' else 'loss' end
   from finished where p2 is not null and p2<>p1 and not rank_excluded @> array['p2']
  union all
  select r.user_id,r.round_id,r.game,r.difficulty,r.created_at,r.outcome from ojjuda_game_internal.practice_results r
   where (r.game=p_game or (p_game in('billiards','carom4','carom3','pool8') and r.game in('carom4','carom3','pool8')))
    and r.created_at>=p_start and r.created_at<=p_end
 ), ordered as (
  -- All levels/modes share the loss boundary. All three billiards variants do
  -- too, including when an individual variant is requested.
  select e.*,count(*) filter(where e.outcome<>'win') over(partition by e.user_id
   order by e.finished_at,e.round_id rows unbounded preceding) run from events e
 ), runs as (
  select e.user_id,e.variant,e.difficulty,e.run,count(*) filter(where e.outcome='win') score,
   max(e.finished_at) filter(where e.outcome='win') achieved_at,
   case e.difficulty when 'online' then 4 when 'hard' then 3 when 'normal' then 2 else 1 end priority
  from ordered e group by e.user_id,e.variant,e.difficulty,e.run
 ), best as materialized (
  -- Do not attribute mixed-level/variant wins to the highest level: retain each
  -- condition's own win count and the established condition precedence.
  select distinct on(r.user_id) r.user_id,r.score,r.difficulty,r.priority,r.variant,r.achieved_at
  from runs r where r.score>0 and (p_game='billiards' or r.variant=p_game)
  order by r.user_id,r.priority desc,r.score desc,r.achieved_at,r.variant
 )
 select b.user_id,b.score,b.difficulty,b.priority,b.variant,b.achieved_at from best b
 union all
 select e.user_id,0::bigint,null::text,0,null::text,min(e.finished_at)
 from events e where (p_game='billiards' or e.variant=p_game)
  and not exists(select 1 from best b where b.user_id=e.user_id)
 group by e.user_id;
$$;

create function ojjuda_ranking_internal.bang_participants(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select r.* from ojjuda_bang_internal.results r where r.achieved_at>=p_start and r.achieved_at<=p_end
 ), ordered as (
  select r.*,count(*) filter(where not r.won) over(partition by r.user_id
   order by r.achieved_at,r.room_id rows unbounded preceding) run from eligible r
 ), runs as (
  select r.user_id,r.run,count(*) filter(where r.won) score,max(r.achieved_at) filter(where r.won) achieved_at
  from ordered r group by r.user_id,r.run
 ), best as materialized (
  select distinct on(r.user_id) r.user_id,r.score,r.achieved_at from runs r
  where r.score>0 order by r.user_id,r.score desc,r.achieved_at
 )
 select b.user_id,b.score,b.achieved_at from best b
 union all
 select r.user_id,0::bigint,min(r.achieved_at) from eligible r
 where not exists(select 1 from best b where b.user_id=r.user_id) group by r.user_id;
$$;
revoke all on function ojjuda_ranking_internal.round_participants(text,timestamptz,timestamptz),
 ojjuda_ranking_internal.tank_participants(timestamptz,timestamptz),
 ojjuda_ranking_internal.board_participants(text,timestamptz,timestamptz),
 ojjuda_ranking_internal.bang_participants(timestamptz,timestamptz) from public,anon,authenticated,service_role;

-- Only period ranking readers change. Source outcomes, personal current counters,
-- positive-only financial helpers, coupons, wallets and public grants do not.
do $best_display_streaks$
declare definition text;updated text;old_bang text;
begin
 definition:=pg_get_functiondef('ojjuda_guest_internal.criteria_ranking(text,text,text)'::regprocedure);
 if position('ojjuda_ranking_internal.tank_participants(v_start,v_now)' in definition)=0
  or position('ojjuda_ranking_internal.round_participants(p_game,v_start,v_now)' in definition)=0 then
  raise exception 'daily participant display prerequisite missing';end if;
 updated:=replace(definition,'ojjuda_guest_internal.streak_candidates(p_game,v_start,v_now)',
  'ojjuda_ranking_internal.board_participants(p_game,v_start,v_now)');
 if updated=definition then raise exception 'daily board best streak patch target missing';end if;
 updated:=replace(updated,'''current_streak''','''best_streak''');
 execute updated;

 definition:=pg_get_functiondef('ojjuda_ranking_internal.candidates(text,timestamptz,timestamptz)'::regprocedure);
 if position('ojjuda_ranking_internal.tank_participants(p_start,upper_bound)' in definition)=0
  or position('ojjuda_ranking_internal.round_participants(p_game,p_start,upper_bound)' in definition)=0 then
  raise exception 'monthly participant display prerequisite missing';end if;
 updated:=replace(definition,'ojjuda_guest_internal.streak_candidates(p_game,p_start,upper_bound)',
  'ojjuda_ranking_internal.board_participants(p_game,p_start,upper_bound)');
 if updated=definition then raise exception 'monthly board best streak patch target missing';end if;
 old_bang:=$old$return query with ordered as(
   select r.*,sum(case when r.won then 0 else 1 end) over(partition by r.user_id
    order by r.achieved_at desc,r.room_id desc rows unbounded preceding) losses
   from ojjuda_bang_internal.results r where r.achieved_at>=p_start and r.achieved_at<p_end
  ), streaks as(
   select r.user_id,count(*) filter(where r.won and r.losses=0) score,max(r.achieved_at) achieved_at
   from ordered r group by r.user_id
  ) select$old$;
 if position(old_bang in updated)=0 or position('from streaks c join public.profiles' in updated)=0 then
  raise exception 'monthly bang best streak patch target missing';end if;
 updated:=replace(updated,old_bang,'return query select');
 updated:=replace(updated,'from streaks c join public.profiles',
  'from ojjuda_ranking_internal.bang_participants(p_start,upper_bound) c join public.profiles');
 updated:=replace(updated,'''current_streak''','''best_streak''');
 execute updated;
end;
$best_display_streaks$;

notify pgrst,'reload schema';
commit;
