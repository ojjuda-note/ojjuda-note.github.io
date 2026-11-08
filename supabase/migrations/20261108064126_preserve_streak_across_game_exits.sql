-- Exiting an unfinished game is neither a win nor a loss. Count completed
-- results across visits, including previously saved wins, without modifying
-- any round ledger, wallet, reward, or archived monthly leaderboard.
begin;
set local lock_timeout='5s';

-- Tank rooms can be closed after the last participant leaves. Earlier trigger
-- versions wrote zero-value losses for those unfinished rooms; ignore those
-- records, while counting a real finish even if its room was later closed.
create or replace function ojjuda_ranking_internal.tank_participants(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,opponents smallint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select r.* from ojjuda_guest_internal.round_records r
  where r.game='tank' and r.achieved_at>=p_start and r.achieved_at<=p_end
   and not exists (
    select 1 from ojjuda_tank_internal.rooms t where t.id=r.round_id
     and ((t.status='closed' and t.state->>'over' is distinct from 'true')
      or t.rank_excluded @> array[array_position(t.members,r.user_id)-1])
   )
 ), ordered as (
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

create or replace function ojjuda_guest_internal.tank_candidates(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,opponents smallint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with eligible as (
  select r.* from ojjuda_guest_internal.round_records r
  where r.game='tank' and r.achieved_at>=p_start and r.achieved_at<=p_end and r.opponents is not null
   and not exists (
    select 1 from ojjuda_tank_internal.rooms t where t.id=r.round_id
     and ((t.status='closed' and t.state->>'over' is distinct from 'true')
      or t.rank_excluded @> array[array_position(t.members,r.user_id)-1])
   )
 ), ordered as (
  select r.*,count(*) filter(where r.value=0) over(partition by r.user_id,r.opponents
   order by r.achieved_at desc,r.round_id desc rows unbounded preceding) breaks
  from eligible r
 ), streaks as (
  select r.user_id,r.opponents,count(*) filter(where r.value=1 and r.breaks=0) score,
   max(r.achieved_at) achieved_at from ordered r group by r.user_id,r.opponents
 )
 select distinct on(user_id) user_id,score,opponents,achieved_at from streaks where score>0
 order by user_id,opponents desc,score desc,achieved_at;
$$;

-- A former Bang solo timeout could insert a synthetic loss. Only suppress a
-- matching unfinished timeout; real losses and explicit forfeits still break
-- the current streak.
create or replace function ojjuda_ranking_internal.bang_participants(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select r.* from ojjuda_bang_internal.results r where r.achieved_at>=p_start and r.achieved_at<=p_end
   and not exists (
    select 1 from ojjuda_bang_internal.rooms b where b.id=r.room_id
     and b.mode='solo' and b.status='closed' and b.state->>'winner' is null
     and r.won=false and r.achieved_at=b.expires_at
     and not coalesce(b.state->'forfeited' @> jsonb_build_array(array_position(b.members,r.user_id)-1),false)
   )
 ), ordered as (
  select r.*,count(*) filter(where not r.won) over(partition by r.user_id
   order by r.achieved_at,r.room_id rows unbounded preceding) run from eligible r
 ), runs as (
  select r.user_id,r.run,count(*) filter(where r.won) score,
   max(r.achieved_at) filter(where r.won) achieved_at from ordered r group by r.user_id,r.run
 ), best as materialized (
  select distinct on(r.user_id) r.user_id,r.score,r.achieved_at from runs r
  where r.score>0 order by r.user_id,r.score desc,r.achieved_at
 )
 select b.user_id,b.score,b.achieved_at from best b;
$$;

-- Apply the identical timeout exclusion to Bang's own current-streak receipt.
do $streak_bang_receipt$
declare definition text:=pg_get_functiondef('ojjuda_bang_internal.player_record(uuid,uuid)'::regprocedure);
 original text;replacement text;
begin
 original:=$old$from ojjuda_bang_internal.results where user_id=p_actor$old$;
 replacement:=$new$from ojjuda_bang_internal.results r where user_id=p_actor
   and not exists (select 1 from ojjuda_bang_internal.rooms b where b.id=r.room_id
    and b.mode='solo' and b.status='closed' and b.state->>'winner' is null
    and r.won=false and r.achieved_at=b.expires_at
    and not coalesce(b.state->'forfeited' @> jsonb_build_array(array_position(b.members,r.user_id)-1),false))$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then
  raise exception 'bang current streak source changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$from ojjuda_bang_internal.results r where r.room_id=p_room and r.user_id=p_actor$old$;
 replacement:=$new$from ojjuda_bang_internal.results r where r.room_id=p_room and r.user_id=p_actor
  and not exists (select 1 from ojjuda_bang_internal.rooms b where b.id=r.room_id
   and b.mode='solo' and b.status='closed' and b.state->>'winner' is null
   and r.won=false and r.achieved_at=b.expires_at
   and not coalesce(b.state->'forfeited' @> jsonb_build_array(array_position(b.members,r.user_id)-1),false))$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then
  raise exception 'bang receipt result source changed';end if;
 execute replace(definition,original,replacement);
end;
$streak_bang_receipt$;

-- An expired or voluntarily closed Bang solo room has no scored result.
do $streak_bang_exit$
declare definition text:=pg_get_functiondef('public.bang_online_service(uuid,text,uuid,text,uuid,jsonb,integer,jsonb)'::regprocedure);
 original text;replacement text;
begin
 original:=$old$ -- Abandoned solo runs cannot be used to skip a loss and keep a streak.
 if p_action in('mine','create') then
  insert into ojjuda_bang_internal.results(room_id,user_id,won,achieved_at)
   select id,host_id,false,expires_at from ojjuda_bang_internal.rooms
   where host_id=p_actor and mode='solo' and status='active' and expires_at<=v_now
   on conflict(room_id,user_id) do nothing;
  update ojjuda_bang_internal.rooms$old$;
 replacement:=$new$ -- Expiry closes an unfinished solo room without recording a loss.
 if p_action in('mine','create') then
  update ojjuda_bang_internal.rooms$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then
  raise exception 'bang expiry behavior changed';end if;
 definition:=replace(definition,original,replacement);
 original:=$old$if r.mode='solo' and coalesce((r.state->'players'->v_seat->>'alive')::boolean,true) and not coalesce((r.state->'forfeited') @> jsonb_build_array(v_seat),false) then raise exception 'use_surrender';end if;$old$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then
  raise exception 'bang solo leave behavior changed';end if;
 execute replace(definition,original,'');
end;
$streak_bang_exit$;

-- Completing a Tank round records a result; leaving an active round does not.
do $streak_tank_exit$
declare definition text:=pg_get_functiondef('ojjuda_game_internal.capture_ranked_round()'::regprocedure);
 original text:=$old$new.mode<>'local' and new.status in ('finished','closed') and old.status='active'$old$;
begin
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then
  raise exception 'tank close capture behavior changed';end if;
 execute replace(definition,original,$new$new.mode<>'local' and new.status='finished' and old.status='active'$new$);
end;
$streak_tank_exit$;

notify pgrst,'reload schema';
commit;
