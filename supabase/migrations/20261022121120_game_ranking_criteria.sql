-- Completed rounds, not wallet balances or final assets, drive these rankings.
create table ojjuda_guest_internal.round_records (
 game text not null check(game in ('tour','tank','matgo','poker')),
 actor_key text not null,
 user_id uuid references public.profiles(id) on delete cascade,
 guest_hash text,
 round_id uuid not null,
 round_no integer not null default 1 check(round_no>0),
 value bigint not null check(value between 0 and 9007199254740991),
 source text not null check(source in ('solo','online','recovered')),
 achieved_at timestamptz not null default clock_timestamp(),
 primary key(game,actor_key,round_id,round_no),
 check((user_id is not null and guest_hash is null and actor_key='member:'||user_id::text)
  or (user_id is null and guest_hash is not null and guest_hash ~ '^[a-f0-9]{64}$' and actor_key='guest:'||guest_hash and game='tour')),
 check(game not in ('tour','tank') or value in (0,1))
);
alter table ojjuda_guest_internal.round_records enable row level security;
revoke all on ojjuda_guest_internal.round_records from public,anon,authenticated,service_role;
create index round_records_period on ojjuda_guest_internal.round_records(game,achieved_at,user_id);

create function ojjuda_guest_internal.round_leaders(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,guest_hash text,score bigint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with ordered as (
  select r.*,count(*) filter(where r.value=0) over(partition by r.actor_key
   order by r.achieved_at desc,r.round_id desc,r.round_no desc rows unbounded preceding) as breaks
  from ojjuda_guest_internal.round_records r
  where r.game=p_game and r.achieved_at>=p_start and r.achieved_at<=p_end
 ), records as (
  select *,case when p_game in ('tour','tank') then count(*) filter(where value=1 and breaks=0) over(partition by actor_key)
   else max(value) over(partition by actor_key) end as best from ordered
 ), leaders as (
  select user_id,guest_hash,best,
   case when p_game in ('tour','tank') then max(achieved_at)
    else min(achieved_at) filter(where value=best) end as tie_at
  from records group by actor_key,user_id,guest_hash,best
 ) select user_id,guest_hash,best,tie_at from leaders where best>0;
$$;
revoke all on function ojjuda_guest_internal.round_leaders(text,timestamptz,timestamptz) from public,anon,authenticated;

-- One row per game. Online > hard > normal > easy; within a level, current streak.
-- Billiards variants keep separate streaks but share a single leaderboard.
create function ojjuda_guest_internal.streak_candidates(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,difficulty text,priority integer,variant text,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with finished as (
  select g.* from public.board_games g where
   (g.kind=p_game or (p_game='billiards' and g.kind in ('carom4','carom3','pool8')))
   and g.status='done' and g.result in ('p1','p2','draw')
   and g.updated_at>=p_start and g.updated_at<=p_end
 ), events as (
  select p1 user_id,id round_id,kind variant,'online'::text difficulty,updated_at finished_at,
   case when result='p1' then 'win' when result='draw' then 'draw' else 'loss' end outcome from finished
  union all
  select p2,id,kind,'online',updated_at,case when result='p2' then 'win' when result='draw' then 'draw' else 'loss' end
   from finished where p2 is not null and p2<>p1
  union all
  select r.user_id,r.round_id,r.game,r.difficulty,r.created_at,r.outcome
   from ojjuda_game_internal.practice_results r
   where (r.game=p_game or (p_game='billiards' and r.game in ('carom4','carom3','pool8')))
    and r.created_at>=p_start and r.created_at<=p_end
 ), ordered as (
  select *,count(*) filter(where outcome<>'win') over(partition by user_id,variant,difficulty
   order by finished_at desc,round_id desc rows unbounded preceding) as breaks from events
 ), streaks as (
  select user_id,variant,difficulty,count(*) filter(where outcome='win' and breaks=0) as score,
   max(finished_at) as achieved_at,
   case difficulty when 'online' then 4 when 'hard' then 3 when 'normal' then 2 else 1 end as priority
  from ordered group by user_id,variant,difficulty
 ) select distinct on(user_id) user_id,score,difficulty,priority,variant,achieved_at from streaks where score>0
  order by user_id,priority desc,score desc,achieved_at,variant;
$$;
revoke all on function ojjuda_guest_internal.streak_candidates(text,timestamptz,timestamptz) from public,anon,authenticated;

create function ojjuda_guest_internal.criteria_ranking(p_game text,p_period text,p_guest_token text default null)
returns json language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_hash text;v_start timestamptz;v_now timestamptz:=now();result json;
begin
 if p_game is null or p_game not in ('tour','tank','matgo','poker','billiards','carom4','carom3','pool8','janggi','chess')
  or p_period is null or p_period not in ('day','month','all') then return '[]'::json;end if;
 if p_game<>'tour' and (actor is null or not exists(select 1 from public.profiles where id=actor)) then
  raise exception 'not_signed_in' using errcode='42501';end if;
 if p_game in ('matgo','poker') then perform ojjuda_poker_internal.check_member(actor);end if;
 v_start:=case when p_period='all' then '-infinity'::timestamptz
  else date_trunc(p_period,v_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' end;
 if p_guest_token ~ '^[a-f0-9]{64}$' then v_hash:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');end if;
 if p_game in ('billiards','carom4','carom3','pool8','janggi','chess') then
  select coalesce(json_agg(json_build_object('nick',r.nickname,'score',r.score,'me',r.user_id=actor,
   'source','difficulty_streak','difficulty',r.difficulty,'variant',r.variant)
   order by r.priority desc,r.score desc,r.achieved_at,r.user_id),'[]'::json) into result
  from (select s.*,p.nickname from ojjuda_guest_internal.streak_candidates(p_game,v_start,v_now) s
   join public.profiles p on p.id=s.user_id
   where not exists(select 1 from public.user_private u where u.user_id=s.user_id and u.banned_until>v_now)
   order by s.priority desc,s.score desc,s.achieved_at,s.user_id limit 10) r;
 else
  select coalesce(json_agg(json_build_object('nick',r.nickname,'score',r.score,'me',r.me,
   'source',case when p_game in ('tour','tank') then 'current_streak' else 'best_round_gain' end)
   order by r.score desc,r.achieved_at,r.actor_key),'[]'::json) into result
  from (select s.*,coalesce(p.nickname,'손님') nickname,
   coalesce(s.user_id=actor,s.guest_hash=v_hash,false) me,
   coalesce('member:'||s.user_id::text,'guest:'||s.guest_hash) actor_key
   from ojjuda_guest_internal.round_leaders(p_game,v_start,v_now) s
   left join public.profiles p on p.id=s.user_id
   left join ojjuda_account_internal.member_identity identity on identity.user_id=s.user_id
   where (s.user_id is null or p.id is not null)
    and not exists(select 1 from public.user_private u where u.user_id=s.user_id and u.banned_until>v_now)
    and (p_game<>'tank' or not public.blocked_between(actor,s.user_id))
    and (p_game in ('tour','tank') or (ojjuda_account_internal.age_on(identity.birth_date,(v_now at time zone 'Asia/Seoul')::date)>=19
     and not public.blocked_between(actor,s.user_id)))
   order by s.score desc,s.achieved_at,actor_key limit 10) r;
 end if;
 return result;
end;$$;
revoke all on function ojjuda_guest_internal.criteria_ranking(text,text,text) from public;
grant execute on function ojjuda_guest_internal.criteria_ranking(text,text,text) to anon,authenticated;

-- The same-device game remains a casual, unverified record with no gold reward.
-- A round ID makes retries/re-entry idempotent for members and guests.
create function ojjuda_guest_internal.record_marble_result(p_round uuid,p_won boolean,p_guest_token text)
returns json language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_hash text;v_key text;previous ojjuda_guest_internal.round_records%rowtype;
begin
 if p_round is null or p_won is null then return json_build_object('ok',false,'reason','invalid');end if;
 if actor is not null then
  if not exists(select 1 from public.profiles where id=actor) then raise exception 'not_signed_in';end if;
  if public.is_banned(actor) then return json_build_object('ok',false,'reason','banned');end if;
  v_key:='member:'||actor::text;
 else
  if p_guest_token is null or p_guest_token !~ '^[a-f0-9]{64}$' then return json_build_object('ok',false,'reason','invalid');end if;
  v_hash:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');v_key:='guest:'||v_hash;
 end if;
 if exists(select 1 from ojjuda_marble_internal.rooms where id=p_round) then return json_build_object('ok',false,'reason','online_result_is_server_owned');end if;
 perform pg_advisory_xact_lock(hashtextextended('ojjuda-marble-result:'||v_key,0));
 select * into previous from ojjuda_guest_internal.round_records
  where game='tour' and actor_key=v_key and round_id=p_round and round_no=1;
 if found then
  if previous.value<>p_won::integer then return json_build_object('ok',false,'reason','request_conflict');end if;
  return json_build_object('ok',true,'duplicate',true,'verified',false,'reward',0);
 end if;
 if exists(select 1 from ojjuda_guest_internal.round_records where game='tour' and actor_key=v_key
  and achieved_at>clock_timestamp()-interval '5 seconds') then return json_build_object('ok',false,'reason','too_fast');end if;
 insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,guest_hash,round_id,value,source)
 values('tour',v_key,actor,v_hash,p_round,p_won::integer,'solo');
 return json_build_object('ok',true,'verified',false,'reward',0);
end;$$;
revoke all on function ojjuda_guest_internal.record_marble_result(uuid,boolean,text) from public;
grant execute on function ojjuda_guest_internal.record_marble_result(uuid,boolean,text) to anon,authenticated;
create function public.record_marble_result(p_round uuid,p_won boolean,p_guest_token text default null)
returns json language sql security invoker set search_path='' as $$
 select ojjuda_guest_internal.record_marble_result(p_round,p_won,p_guest_token);
$$;
revoke all on function public.record_marble_result(uuid,boolean,text) from public;
grant execute on function public.record_marble_result(uuid,boolean,text) to anon,authenticated;

-- Only server-owned settlement tables can create Matgo/Poker/online Marble records.
create function ojjuda_game_internal.capture_ranked_round()
returns trigger language plpgsql security definer set search_path='' as $$
declare n integer;m uuid;amount bigint;
begin
 if tg_table_schema='ojjuda_matgo_internal' and tg_table_name='wallets' then
  if new.last_round is distinct from old.last_round and old.round_id=new.last_round and new.round_id is null then
   insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,value,source)
   values('matgo','member:'||new.user_id::text,new.user_id,new.last_round,greatest(0,new.gold-old.gold),'solo') on conflict do nothing;
  end if;
 elsif tg_table_schema='ojjuda_matgo_internal' then
  if new.status='finished' and old.status='active' and new.result->'paidDelta' is not null then
   for n in 1..2 loop
    m:=case when n=1 then new.host_id else new.guest_id end;if m is null or not exists(select 1 from public.profiles where id=m) then continue;end if;
    amount:=greatest(0,(new.result->'paidDelta'->>(n-1))::bigint);
    insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,round_no,value,source)
    values('matgo','member:'||m::text,m,new.id,new.round_no,amount,'online') on conflict do nothing;
   end loop;
  end if;
 elsif tg_table_schema='ojjuda_poker_internal' then
  if new.settled_round>old.settled_round and new.settled_round=new.round and new.state->>'phase'='finished' then
   for n in 1..cardinality(new.members) loop
    m:=new.members[n];if m is null or not exists(select 1 from public.profiles where id=m) then continue;end if;amount:=greatest(0,(new.state->'result'->'net'->>(n-1))::bigint);
    insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,round_no,value,source)
    values('poker','member:'||m::text,m,new.id,new.round,amount,case when new.mode='solo' then 'solo' else 'online' end) on conflict do nothing;
   end loop;
  end if;
 elsif tg_table_schema='ojjuda_tank_internal' then
  if new.mode<>'local' and new.status in ('finished','closed') and old.status='active' then
   for n in 1..cardinality(new.members) loop
    m:=new.members[n];if m is null or not exists(select 1 from public.profiles where id=m) then continue;end if;
    amount:=case when new.status='finished' and (new.state->'tanks'->(n-1)->>'hp')::integer>0
     and (select count(*) from jsonb_array_elements(new.state->'tanks') t where (t->>'hp')::integer>0)=1 then 1 else 0 end;
    insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,value,source)
    values('tank','member:'||m::text,m,new.id,amount,case when new.mode='solo' then 'solo' else 'online' end) on conflict do nothing;
   end loop;
  end if;
 elsif tg_table_schema='ojjuda_marble_internal' then
  if new.ranked_at is not null and old.ranked_at is null and new.state->>'over'='true' then
   for n in 1..cardinality(new.members) loop
    m:=new.members[n];if m is null or not exists(select 1 from public.profiles where id=m) then continue;end if;amount:=case when (new.state->>'winner')::integer=n-1 then 1 else 0 end;
    insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,value,source)
    values('tour','member:'||m::text,m,new.id,amount,'online') on conflict do nothing;
   end loop;
  end if;
 end if;
 return new;
end;$$;
revoke all on function ojjuda_game_internal.capture_ranked_round() from public,anon,authenticated;
create trigger ranking_matgo_solo after update of last_round on ojjuda_matgo_internal.wallets
 for each row execute function ojjuda_game_internal.capture_ranked_round();
create trigger ranking_matgo_online after update of status on ojjuda_matgo_internal.rooms
 for each row execute function ojjuda_game_internal.capture_ranked_round();
create trigger ranking_poker after update of settled_round on ojjuda_poker_internal.rooms
 for each row execute function ojjuda_game_internal.capture_ranked_round();
create trigger ranking_tank after update of status on ojjuda_tank_internal.rooms
 for each row execute function ojjuda_game_internal.capture_ranked_round();
create trigger ranking_marble after update of ranked_at on ojjuda_marble_internal.rooms
 for each row execute function ojjuda_game_internal.capture_ranked_round();

-- Recover only surviving, settled snapshots from rooms started this month.
-- Their exact completion time is unavailable: use recovery time for equal-record ties.
insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,round_no,value,source)
 select 'poker','member:'||m.id::text,m.id,r.id,r.round,greatest(0,(r.state->'result'->'net'->>(m.n::integer-1))::bigint),'recovered'
 from ojjuda_poker_internal.rooms r cross join lateral unnest(r.members) with ordinality m(id,n)
 join public.profiles p on p.id=m.id
 where r.state->>'phase'='finished' and r.settled_round=r.round and r.round>0
  and r.created_at>=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' on conflict do nothing;
insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,round_no,value,source)
 select 'matgo','member:'||m.id::text,m.id,r.id,r.round_no,greatest(0,(r.result->'paidDelta'->>(m.n::integer-1))::bigint),'recovered'
 from ojjuda_matgo_internal.rooms r cross join lateral unnest(array[r.host_id,r.guest_id]) with ordinality m(id,n)
 join public.profiles p on p.id=m.id
 where r.result->'paidDelta' is not null
  and r.created_at>=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' on conflict do nothing;
insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,value,source,achieved_at)
 select 'tour','member:'||m.id::text,m.id,r.id,case when (r.state->>'winner')::integer=m.n-1 then 1 else 0 end,'online',r.ranked_at
 from ojjuda_marble_internal.rooms r cross join lateral unnest(r.members) with ordinality m(id,n)
 join public.profiles p on p.id=m.id where r.ranked_at is not null and r.state->>'over'='true' on conflict do nothing;

-- Preserve the existing protected APIs and all unrelated ranking paths.
do $migration$
declare signature text;definition text;updated text;period text;
begin
 foreach signature in array array['public.community_game_ranking(text)','public.community_game_monthly_ranking(text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  period:=case when signature like '%monthly%' then 'month' else 'all' end;
  updated:=regexp_replace(definition,'\mBEGIN\M',format($body$begin
   if p_game in ('tour','tank','matgo','poker','billiards','carom4','carom3','pool8','janggi','chess') then
    return ojjuda_guest_internal.criteria_ranking(p_game,case when p_game='tour' and %L='all' then 'day' else %L end,null);end if;$body$,period,period),'i');
  if updated=definition then raise exception 'Ranking dispatch not found: %',signature;end if;
  execute updated;
 end loop;
end;$migration$;
create or replace function public.tank_monthly_ranking()
returns json language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'not_signed_in';end if;
 if public.is_banned(auth.uid()) then raise exception 'banned';end if;
 return ojjuda_guest_internal.criteria_ranking('tank','month',null);
end;$$;
revoke all on function public.tank_monthly_ranking() from public,anon;
grant execute on function public.tank_monthly_ranking() to authenticated;
create or replace function ojjuda_poker_internal.ranking(p_monthly boolean default true)
returns json language sql stable security invoker set search_path='' as $$
 select ojjuda_guest_internal.criteria_ranking('poker',case when p_monthly then 'month' else 'all' end,null);
$$;
revoke all on function ojjuda_poker_internal.ranking(boolean) from public,anon;
grant execute on function ojjuda_poker_internal.ranking(boolean) to authenticated;
create or replace function public.guest_game_ranking(p_game text,p_period text default 'day',p_guest_token text default null)
returns json language plpgsql stable security invoker set search_path='' as $$
begin
 if p_game='tour' then return ojjuda_guest_internal.criteria_ranking(p_game,p_period,p_guest_token);end if;
 return ojjuda_guest_internal.ranking(p_game,p_period,p_guest_token);
end;$$;
-- Month-end winner selection must use exactly the same criteria as the board.
-- Keep unrelated reward/exclusion/delivery behavior intact.
do $rewards$
declare definition text;
begin
 if to_regprocedure('ojjuda_rewards_internal.monthly_candidates(timestamptz)') is not null then
  definition:=pg_get_functiondef('ojjuda_rewards_internal.monthly_candidates(timestamptz)'::regprocedure);
  execute replace(definition,'ojjuda_rewards_internal.monthly_candidates(',
   'ojjuda_rewards_internal.monthly_candidates_before_criteria(');
  execute 'revoke all on function ojjuda_rewards_internal.monthly_candidates_before_criteria(timestamptz) from public,anon,authenticated';
  execute $sql$
   create or replace function ojjuda_rewards_internal.monthly_candidates(p_as_of timestamptz default now())
   returns table(game text,user_id uuid,identity_key text,nickname text,score bigint,tie_at timestamptz)
   language sql stable security invoker set search_path='' as $body$
    with bounds as (select date_trunc('month',p_as_of at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as start_at),
    board as (
     select g.game,s.*,p.nickname,max(s.priority) over(partition by g.game) highest
     from (values('billiards'),('janggi'),('chess')) g(game) cross join bounds b
     cross join lateral ojjuda_guest_internal.streak_candidates(g.game,b.start_at,p_as_of) s
     join public.profiles p on p.id=s.user_id where not public.is_banned(s.user_id)
    ), rounds as (
     select g.game,r.*,coalesce(p.nickname,'손님') nickname
     from (values('tour'),('tank'),('matgo'),('poker')) g(game) cross join bounds b
     cross join lateral ojjuda_guest_internal.round_leaders(g.game,b.start_at,p_as_of) r
     left join public.profiles p on p.id=r.user_id
     left join ojjuda_account_internal.member_identity i on i.user_id=r.user_id
     where (r.user_id is null or (p.id is not null and not public.is_banned(r.user_id)))
      and (g.game in ('tour','tank') or ojjuda_account_internal.age_on(i.birth_date,(p_as_of at time zone 'Asia/Seoul')::date)>=19)
    )
    select * from ojjuda_rewards_internal.monthly_candidates_before_criteria(p_as_of) c
     where c.game not in ('tour','tank','matgo','poker','billiards','carom4','carom3','pool8','janggi','chess')
      and c.game !~ '^(carom4|carom3|pool8|janggi|chess)_(easy|normal|hard|online)$'
    union all select game,user_id,'member:'||user_id::text,nickname,score,achieved_at from board where priority=highest
    union all select game,user_id,coalesce('member:'||user_id::text,'guest:'||guest_hash),nickname,score,achieved_at from rounds;
   $body$;
  $sql$;
 end if;
end;$rewards$;
notify pgrst,'reload schema';
