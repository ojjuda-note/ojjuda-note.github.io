-- Rankings require a positive record. Keep accepted zero-score/loss events and
-- each period's best winning run; only remove zero-valued display candidates.
-- Personal current streaks, financial helpers, rewards and wallets are unchanged.
begin;
set local lock_timeout='5s';

create or replace function ojjuda_ranking_internal.round_participants(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,guest_hash text,score bigint,achieved_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_game not in('tour','ttang') then
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
 select b.user_id,b.guest_hash,b.score,b.achieved_at from best b;
end;
$$;

create or replace function ojjuda_ranking_internal.tank_participants(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,opponents smallint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select r.* from ojjuda_guest_internal.round_records r
  where r.game='tank' and r.achieved_at>=p_start and r.achieved_at<=p_end
 ), ordered as (
  -- Missing opponent metadata still cannot hide a stored loss from the run.
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
 select b.user_id,b.score,b.opponents,b.achieved_at from best b;
$$;

create or replace function ojjuda_ranking_internal.board_participants(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,difficulty text,priority integer,variant text,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with finished as (
  select g.* from public.board_games g where
   (g.kind=p_game or (p_game in('billiards','carom4','carom3','pool8') and g.kind in('carom4','carom3','pool8')))
   and g.status='done' and g.result in('p1','p2','draw')
   and g.updated_at>=p_start and g.updated_at<=p_end
 ), events as materialized (
  -- Takeover seats remain excluded before any win/loss segmentation.
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
  select e.*,count(*) filter(where e.outcome<>'win') over(partition by e.user_id
   order by e.finished_at,e.round_id rows unbounded preceding) run from events e
 ), runs as (
  select e.user_id,e.variant,e.difficulty,e.run,count(*) filter(where e.outcome='win') score,
   max(e.finished_at) filter(where e.outcome='win') achieved_at,
   case e.difficulty when 'online' then 4 when 'hard' then 3 when 'normal' then 2 else 1 end priority
  from ordered e group by e.user_id,e.variant,e.difficulty,e.run
 ), best as materialized (
  -- Preserve separate condition counts, their priority and the first best time.
  select distinct on(r.user_id) r.user_id,r.score,r.difficulty,r.priority,r.variant,r.achieved_at
  from runs r where r.score>0 and (p_game='billiards' or r.variant=p_game)
  order by r.user_id,r.priority desc,r.score desc,r.achieved_at,r.variant
 )
 select b.user_id,b.score,b.difficulty,b.priority,b.variant,b.achieved_at from best b;
$$;

create or replace function ojjuda_ranking_internal.bang_participants(p_start timestamptz,p_end timestamptz)
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
 select b.user_id,b.score,b.achieved_at from best b;
$$;

-- The same positive-record rule covers generic member/guest daily and monthly
-- reads. Keep the valid zero-score submission contract and stored ledgers.
do $positive_score_reads$
declare definition text;old_filter text;
begin
 definition:=pg_get_functiondef('ojjuda_ranking_internal.candidates(text,timestamptz,timestamptz)'::regprocedure);
 old_filter:='g.score between 0 and score_cap';
 if cardinality(string_to_array(definition,old_filter))<>3 then
  raise exception 'monthly positive-score patch targets missing';end if;
 execute replace(definition,old_filter,'g.score between 1 and score_cap');

 definition:=pg_get_functiondef('ojjuda_guest_internal.ranking(text,text,text)'::regprocedure);
 old_filter:='g.score between 0 and v_limit';
 if cardinality(string_to_array(definition,old_filter))<>5 then
  raise exception 'daily positive-score patch targets missing';end if;
 execute replace(definition,old_filter,'g.score between 1 and v_limit');
end;
$positive_score_reads$;

-- Previously frozen zero entries are hidden without rewriting a snapshot or
-- promoting another player. History derives hasRecords from these visible rows.
create or replace function ojjuda_ranking_internal.visible_winners(p_winners jsonb,p_games text[],p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_game text;v_record jsonb;v_user uuid;v_result jsonb:='{}';
begin
 foreach v_game in array p_games loop
  v_record:=p_winners->v_game;
  v_user:=nullif(v_record->>'_userId','')::uuid;
  if v_record is null or v_record='null'::jsonb or coalesce((v_record->>'score')::numeric,0)<=0
   or exists(select 1 from public.user_private u where u.user_id=v_user and u.banned_until>now())
   or (v_game in('bang','tank','matgo','poker') and public.blocked_between(p_actor,v_user)) then
   v_record:='null'::jsonb;
  else
   v_record:=(v_record-'_userId')||jsonb_build_object('me',coalesce(v_user=p_actor,false));
  end if;
  v_result:=v_result||jsonb_build_object(v_game,v_record);
 end loop;
 return v_result;
end;
$$;

-- CREATE OR REPLACE preserves all existing owners and execute privileges.
notify pgrst,'reload schema';
commit;
