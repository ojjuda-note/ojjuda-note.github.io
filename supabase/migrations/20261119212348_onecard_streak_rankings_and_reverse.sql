-- Server-confirmed One Card results share the arcade's monthly best-streak board.
-- A private computer game uses the same authoritative five-seat engine. Guests
-- and old local saves remain unranked practice; clients never submit a score.
begin;
set local lock_timeout='5s';

alter table ojjuda_onecard_internal.rooms
 add column mode text not null default 'multiplayer'
 check(mode in('solo','multiplayer'));

create table ojjuda_onecard_internal.results(
 room_id uuid not null,
 round integer not null check(round>0),
 user_id uuid not null references public.profiles(id) on delete cascade,
 won boolean not null,
 mode text not null check(mode in('solo','multiplayer')),
 achieved_at timestamptz not null default clock_timestamp(),
 primary key(room_id,round,user_id)
);
create index onecard_result_member_time
 on ojjuda_onecard_internal.results(user_id,achieved_at,room_id,round);
create index onecard_result_period
 on ojjuda_onecard_internal.results(achieved_at,user_id,room_id,round);
alter table ojjuda_onecard_internal.results enable row level security;
revoke all on table ojjuda_onecard_internal.results from public,anon,authenticated,service_role;

-- Capture only a newly completed authoritative round, atomically with its state.
-- Reading an old result, retrying a move and leaving a completed room do not add
-- records. A departed seat belongs to a computer and never changes its owner's run.
create function ojjuda_onecard_internal.capture_result()
returns trigger language plpgsql security invoker set search_path='' as $$
declare finished_at timestamptz:=clock_timestamp();
begin
 if old.status<>'active' or new.status<>'finished' or old.round<>new.round
  or new.round<1 or new.state->>'status' is distinct from 'finished'
  or jsonb_array_length(new.state->'players') is distinct from 5 then return new;end if;
 insert into ojjuda_onecard_internal.results(room_id,round,user_id,won,mode,achieved_at)
 select new.id,new.round,m.id,
  coalesce(new.state->>'winnerId'=m.id::text,false),new.mode,finished_at
 from unnest(new.members) with ordinality m(id,i)
 join public.profiles p on p.id=m.id
 join auth.users u on u.id=m.id and not coalesce(u.is_anonymous,false)
 where not coalesce(new.departed[m.i],true)
  and not public.is_banned(m.id)
  and exists(select 1 from jsonb_array_elements(new.state->'players') player
   where player->>'id'=m.id::text and player->'bot'='false'::jsonb)
 on conflict(room_id,round,user_id) do nothing;
 return new;
end;
$$;
revoke all on function ojjuda_onecard_internal.capture_result() from public,anon,authenticated,service_role;
create trigger onecard_completed_round
 after update of status,state on ojjuda_onecard_internal.rooms
 for each row execute function ojjuda_onecard_internal.capture_result();

create function ojjuda_ranking_internal.onecard_participants(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized(
  select r.* from ojjuda_onecard_internal.results r
  where r.achieved_at>=p_start and r.achieved_at<=p_end
 ), ordered as(
  select r.*,count(*) filter(where not r.won) over(partition by r.user_id
   order by r.achieved_at,r.room_id,r.round rows unbounded preceding) run
  from eligible r
 ), runs as(
  select r.user_id,r.run,count(*) filter(where r.won) score,
   max(r.achieved_at) filter(where r.won) achieved_at
  from ordered r group by r.user_id,r.run
 ), best as materialized(
  select distinct on(r.user_id) r.user_id,r.score,r.achieved_at from runs r
  where r.score>0 order by r.user_id,r.score desc,r.achieved_at
 )
 select b.user_id,b.score,b.achieved_at from best b
 union all
 select r.user_id,0::bigint,min(r.achieved_at) from eligible r
 where not exists(select 1 from best b where b.user_id=r.user_id) group by r.user_id;
$$;
revoke all on function ojjuda_ranking_internal.onecard_participants(timestamptz,timestamptz)
 from public,anon,authenticated,service_role;

-- Only the checked room service may read this per-actor receipt. The same month
-- boundary and loss/draw behavior apply to computer and online games together.
create function ojjuda_onecard_internal.player_record(p_actor uuid,p_room uuid,p_round integer)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare saved ojjuda_onecard_internal.results%rowtype;
 v_now timestamptz:=clock_timestamp();v_month date;v_start timestamptz;
 current_streak bigint:=0;best_streak bigint:=0;
begin
 select * into saved from ojjuda_onecard_internal.results
 where room_id=p_room and round=p_round and user_id=p_actor;
 if not found then return null;end if;
 v_month:=ojjuda_ranking_internal.month_key(v_now);
 v_start:=ojjuda_ranking_internal.month_start(v_month);
 with ordered as materialized(
  select r.won,count(*) filter(where not r.won) over(
   order by r.achieved_at,r.room_id,r.round rows unbounded preceding) run
  from ojjuda_onecard_internal.results r
  where r.user_id=p_actor and r.achieved_at>=v_start and r.achieved_at<=v_now
 ), runs as materialized(
  select run,count(*) filter(where won) score from ordered group by run
 )
 select coalesce(max(score),0),coalesce(max(score) filter(where run=(select max(run) from runs)),0)
 into best_streak,current_streak from runs;
 return jsonb_build_object('recorded',true,'won',saved.won,'currentStreak',current_streak,
  'bestStreak',best_streak,'month',to_char(v_month,'YYYY-MM'),'achievedAt',saved.achieved_at);
end;
$$;
revoke all on function ojjuda_onecard_internal.player_record(uuid,uuid,integer)
 from public,anon,authenticated,service_role;

-- Keep the existing CAS, request receipts, membership locks and moderation.
-- Every anchor is checked, so a changed prerequisite aborts this whole migration.
do $rooms$
declare definition text;old_fragment text;new_fragment text;
begin
 definition:=pg_get_functiondef('ojjuda_onecard_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)'::regprocedure);
 for old_fragment,new_fragment in select * from(values
  ('  title_value text;',E'  title_value text;\n  mode_value text;'),
  ($old$    then raise exception 'invalid_options'; end if;$old$,
   $new$    then raise exception 'invalid_options'; end if;
  mode_value:=coalesce(p_options->>'mode','multiplayer');
  if p_options ? 'mode' and (jsonb_typeof(p_options->'mode') is distinct from 'string'
    or mode_value not in('solo','multiplayer')) then raise exception 'invalid_options';end if;$new$),
  ($old$where source_room.status in ('waiting', 'active', 'finished') and source_room.expires_at$old$,
   $new$where source_room.mode='multiplayer' and source_room.status in ('waiting', 'active', 'finished') and source_room.expires_at$new$),
  ($old$    if found then
      if r.status = 'closed'$old$,
   $new$    if found then
      if r.mode is distinct from mode_value then raise exception 'invalid_request';end if;
      if r.status = 'closed'$new$),
  ('(code, creator_id, host_id, members, names, capacity, create_request, title)',
   '(code, creator_id, host_id, members, names, capacity, create_request, title, mode)'),
  ('array[nick], cap, p_request, title_value) returning * into r;',
   'array[nick], cap, p_request, title_value, mode_value) returning * into r;'),
  ($old$    if r.id is null then raise exception 'room_not_found'; end if;$old$,
   $new$    if r.id is null then raise exception 'room_not_found'; end if;
    if p_action='join' and r.mode='solo' then raise exception 'room_unavailable';end if;$new$),
  ($old$          if r.status not in ('waiting', 'finished') or r.host_id <> p_actor then raise exception 'not_room_owner'; end if;$old$,
   $new$          if r.status not in ('waiting', 'finished') or r.host_id <> p_actor then raise exception 'not_room_owner'; end if;
          if r.mode='solo' and cardinality(r.members)<>1 then raise exception 'invalid_request';end if;$new$),
  ($old$or (p_next->'state'->>'direction')::integer is distinct from 1$old$,
   $new$or (p_next->'state'->>'direction')::integer is null
            or (p_next->'state'->>'direction')::integer not in(-1,1)
            or (p_action='start' and (p_next->'state'->>'direction')::integer<>1)$new$),
  ($old$return jsonb_build_object('room', to_jsonb(r));$old$,
   $new$return jsonb_build_object('room', to_jsonb(r),
    'ranking',ojjuda_onecard_internal.player_record(p_actor,r.id,r.round));$new$)
 ) patch(old_value,new_value) loop
  if position(old_fragment in definition)=0 then raise exception 'One Card room patch missing: %',old_fragment;end if;
  definition:=replace(definition,old_fragment,new_fragment);
 end loop;
 execute definition;
end;
$rooms$;

do $rankings$
declare definition text;updated text;signature regprocedure;
begin
 definition:=pg_get_functiondef('ojjuda_ranking_internal.catalog()'::regprocedure);
 if position('''onecard''' in definition)>0 or position('''bang''' in definition)=0 then
  raise exception 'One Card catalog prerequisite changed';end if;
 execute replace(definition,'''bang''','''onecard'',''bang''');

 definition:=pg_get_functiondef('ojjuda_ranking_internal.candidates(text,timestamptz,timestamptz)'::regprocedure);
 if position('upper_bound timestamptz' in definition)=0 then raise exception 'Monthly candidate prerequisite changed';end if;
 updated:=regexp_replace(definition,'\mbegin\M',$branch$begin
 if p_game='onecard' then
  return query select c.user_id,'member:'||c.user_id::text,p.nickname,c.score,c.achieved_at,0,
   jsonb_build_object('source','best_streak')
  from ojjuda_ranking_internal.onecard_participants(p_start,upper_bound) c
  join public.profiles p on p.id=c.user_id
  join auth.users u on u.id=c.user_id and not coalesce(u.is_anonymous,false)
  where c.score>0 and not public.is_banned(c.user_id);
  return;
 end if;$branch$,'i');
 if updated=definition then raise exception 'Monthly candidate branch missing';end if;
 execute updated;

 -- Reuse the existing member-only and blocked-user rules, including archives
 -- and ranks beyond the top ten. No other game's access or ordering changes.
 foreach signature in array array[
  'ojjuda_ranking_internal.current_rows(text,text)'::regprocedure,
  'ojjuda_ranking_internal.visible_winners(jsonb,text[],uuid)'::regprocedure,
  'public.community_game_monthly_personal(text,text)'::regprocedure
 ] loop
  definition:=pg_get_functiondef(signature);
  updated:=replace(definition,'''bang'',''tank''','''onecard'',''bang'',''tank''');
  if updated=definition then raise exception 'One Card visibility branch missing: %',signature;end if;
  execute updated;
 end loop;

 definition:=pg_get_functiondef('ojjuda_ranking_internal.close_month(date)'::regprocedure);
 updated:=replace(definition,'ojjuda_bang_internal.results,','ojjuda_bang_internal.results,ojjuda_onecard_internal.results,');
 if updated=definition then raise exception 'Monthly archive lock prerequisite changed';end if;
 execute updated;

 definition:=pg_get_functiondef('public.community_game_monthly_ranking(text)'::regprocedure);
 updated:=regexp_replace(definition,'\mbegin\M',E'begin\n if p_game=''onecard'' then return (public.community_game_monthly_personal(p_game,null)->''leaders'')::json;end if;','i');
 if updated=definition then raise exception 'Monthly ranking dispatcher missing';end if;
 execute updated;
end;
$rankings$;

notify pgrst,'reload schema';
commit;
