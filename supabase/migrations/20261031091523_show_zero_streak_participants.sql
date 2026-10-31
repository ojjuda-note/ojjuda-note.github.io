-- Keep completed participants visible after a loss resets their current streak.
-- These helpers are only for displayed rankings. Existing positive-only helpers
-- remain unchanged for monthly coupon eligibility and every financial policy.
begin;
set local lock_timeout='5s';

create function ojjuda_ranking_internal.round_participants(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,guest_hash text,score bigint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with positive as materialized (
  select * from ojjuda_guest_internal.round_leaders(p_game,p_start,p_end)
 )
 select p.user_id,p.guest_hash,p.score,p.achieved_at from positive p
 union all
 select r.user_id,r.guest_hash,0::bigint,max(r.achieved_at)
 from ojjuda_guest_internal.round_records r
 where p_game in('tour','ttang') and r.game=p_game
  and r.achieved_at>=p_start and r.achieved_at<=p_end
  and not exists(select 1 from positive p where p.user_id is not distinct from r.user_id
   and p.guest_hash is not distinct from r.guest_hash)
 group by r.actor_key,r.user_id,r.guest_hash;
$$;

create function ojjuda_ranking_internal.tank_participants(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,opponents smallint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with positive as materialized (
  select * from ojjuda_guest_internal.tank_candidates(p_start,p_end)
 )
 select p.user_id,p.score,p.opponents,p.achieved_at from positive p
 union all
 select r.user_id,0::bigint,null::smallint,max(r.achieved_at)
 from ojjuda_guest_internal.round_records r
 where r.game='tank' and r.opponents is not null
  and r.achieved_at>=p_start and r.achieved_at<=p_end
  and not exists(select 1 from positive p where p.user_id=r.user_id)
 group by r.user_id;
$$;
revoke all on function ojjuda_ranking_internal.round_participants(text,timestamptz,timestamptz),
 ojjuda_ranking_internal.tank_participants(timestamptz,timestamptz) from public,anon,authenticated,service_role;

-- Patch displayed daily/all-time and monthly/archive readers, never the reward
-- reader. Source records are unchanged: a computer-taken-over seat still has no
-- eligible row, and someone who has not played is never invented as a candidate.
do $display_participants$
declare definition text;updated text;old_bang text;new_bang text;
begin
 definition:=pg_get_functiondef('ojjuda_guest_internal.criteria_ranking(text,text,text)'::regprocedure);
 if position('ojjuda_guest_internal.round_leaders(p_game,v_start,v_now)' in definition)=0
  or position('ojjuda_guest_internal.tank_candidates(v_start,v_now)' in definition)=0
  or position('r.opponents desc,r.score desc' in definition)=0
  or position('s.opponents desc,s.score desc' in definition)=0 then
  raise exception 'display criteria participant patch target missing';
 end if;
 updated:=replace(definition,'ojjuda_guest_internal.round_leaders(p_game,v_start,v_now)',
  'ojjuda_ranking_internal.round_participants(p_game,v_start,v_now)');
 updated:=replace(updated,'ojjuda_guest_internal.tank_candidates(v_start,v_now)',
  'ojjuda_ranking_internal.tank_participants(v_start,v_now)');
 -- NULL marks no active win streak; it must sort behind every real opponent field.
 updated:=replace(updated,'r.opponents desc,r.score desc','r.opponents desc nulls last,r.score desc');
 updated:=replace(updated,'s.opponents desc,s.score desc','s.opponents desc nulls last,s.score desc');
 execute updated;

 definition:=pg_get_functiondef('ojjuda_ranking_internal.candidates(text,timestamptz,timestamptz)'::regprocedure);
 old_bang:=$old$select r.user_id,count(*) score,max(r.achieved_at) achieved_at from ordered r
   where r.won and r.losses=0 group by r.user_id$old$;
 new_bang:=$new$select r.user_id,count(*) filter(where r.won and r.losses=0) score,max(r.achieved_at) achieved_at
   from ordered r group by r.user_id$new$;
 if position('ojjuda_guest_internal.round_leaders(p_game,p_start,upper_bound)' in definition)=0
  or position('ojjuda_guest_internal.tank_candidates(p_start,upper_bound)' in definition)=0
  or position('c.achieved_at,c.opponents::integer' in definition)=0
  or position(old_bang in definition)=0 then
  raise exception 'monthly participant patch target missing';
 end if;
 updated:=replace(definition,'ojjuda_guest_internal.round_leaders(p_game,p_start,upper_bound)',
  'ojjuda_ranking_internal.round_participants(p_game,p_start,upper_bound)');
 updated:=replace(updated,'ojjuda_guest_internal.tank_candidates(p_start,upper_bound)',
  'ojjuda_ranking_internal.tank_participants(p_start,upper_bound)');
 updated:=replace(updated,'c.achieved_at,c.opponents::integer','c.achieved_at,coalesce(c.opponents,0)::integer');
 updated:=replace(updated,old_bang,new_bang);
 execute updated;
end;
$display_participants$;

notify pgrst,'reload schema';
commit;
