-- A normal board-game exit delegates the unchanged seat to the server AI.
-- Keep prior completed games and the other player's ranking eligibility intact.
alter table public.board_games
 add column computer_seats text[] not null default '{}',
 add column rank_excluded text[] not null default '{}',
 add constraint board_computer_seats_valid check(computer_seats <@ array['p1','p2']::text[]),
 add constraint board_rank_excluded_valid check(rank_excluded <@ array['p1','p2']::text[]);

alter policy board_games_select on public.board_games to authenticated using (
 (p1=(select auth.uid()) and (status<>'playing' or not computer_seats @> array['p1'])) or
 (p2=(select auth.uid()) and (status<>'playing' or not computer_seats @> array['p2']))
);

create function public.game_leave(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid:=auth.uid();g public.board_games%rowtype;seat text;computers text[];
begin
 if v_me is null then raise exception 'not_signed_in';end if;
 select * into g from public.board_games where id=p_id for update;
 if not found or v_me not in(g.p1,g.p2) then raise exception 'not_a_player';end if;
 if g.status<>'playing' then return;end if;
 seat:=case when v_me=g.p1 then 'p1' else 'p2' end;
 if g.computer_seats @> array[seat] then return;end if;
 computers:=array_append(g.computer_seats,seat);
 update public.board_games set computer_seats=computers,
  rank_excluded=case when g.rank_excluded @> array[seat] then g.rank_excluded else array_append(g.rank_excluded,seat) end,
  undo_requested_by=null,undo_requested_ply=null,
  status=case when computers @> array['p1','p2'] then 'done' else g.status end,
  result=case when computers @> array['p1','p2'] then null else g.result end,
  reason=case when computers @> array['p1','p2'] then 'abandoned' else g.reason end,
  updated_at=greatest(clock_timestamp(),g.updated_at+interval '1 microsecond') where id=p_id;
 update ojjuda_arcade_internal.rooms set status='closed' where match_id=p_id and status<>'closed';
end;$$;
revoke all on function public.game_leave(uuid) from public,anon;
grant execute on function public.game_leave(uuid) to authenticated;

-- Explicit resignation remains a real loss, unlike handing a seat over.
create or replace function public.game_resign(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.board_games g set status='done',result=case when auth.uid()=g.p1 then 'p2' else 'p1' end,
  reason='resign',undo_requested_by=null,undo_requested_ply=null,
  updated_at=greatest(clock_timestamp(),g.updated_at+interval '1 microsecond')
 where g.id=p_id and g.status='playing' and auth.uid() in(g.p1,g.p2)
  and not g.computer_seats @> array[case when auth.uid()=g.p1 then 'p1' else 'p2' end];
end;$$;
revoke all on function public.game_resign(uuid) from public,anon;
grant execute on function public.game_resign(uuid) to authenticated;

create or replace function public.game_verified_commit(p_id uuid,p_actor uuid,p_ply integer,p_updated_at timestamptz,p_move jsonb,p_turn text,p_result text,p_reason text,p_state jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare g public.board_games%rowtype;expected uuid;seat text;
begin
 if p_actor is null or p_ply is null or p_updated_at is null then raise exception 'bad_request';end if;
 select * into g from public.board_games where id=p_id for update;
 if not found or g.status<>'playing' then raise exception 'not_playing';end if;
 if p_actor not in(g.p1,g.p2) then raise exception 'not_a_player';end if;
 seat:=case when p_actor=g.p1 then 'p1' else 'p2' end;
 if g.computer_seats @> array[seat] then raise exception 'player_left';end if;
 if g.updated_at is distinct from p_updated_at or jsonb_array_length(g.moves)<>p_ply then raise exception 'out_of_sync';end if;
 if g.undo_requested_by is not null then raise exception 'undo_pending';end if;
 expected:=case when g.kind in('chess','janggi') then case when p_ply%2=0 then g.p1 else g.p2 end else case when g.turn='p1' then g.p1 else g.p2 end end;
 if p_actor is distinct from expected then raise exception 'not_your_turn';end if;
 if p_turn is null or p_turn not in('p1','p2') or (p_result is not null and p_result not in('p1','p2','draw')) or jsonb_typeof(p_move) is distinct from 'object' or length(p_move::text)>3000 then raise exception 'bad_move';end if;
 update public.board_games set moves=g.moves||jsonb_build_array(p_move),turn=p_turn,
  verified_state=p_state,result=p_result,reason=left(p_reason,20),
  status=case when p_result is null then 'playing' else 'done' end,
  updated_at=greatest(clock_timestamp(),g.updated_at+interval '1 microsecond') where id=p_id;
end;$$;
revoke all on function public.game_verified_commit(uuid,uuid,integer,timestamptz,jsonb,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.game_verified_commit(uuid,uuid,integer,timestamptz,jsonb,text,text,text,jsonb) to service_role;

-- Only the authenticated remaining player's trusted Edge request may commit
-- a server-generated move for a delegated seat. Browser-supplied AI is ignored.
create function public.game_computer_commit(p_id uuid,p_actor uuid,p_ply integer,p_updated_at timestamptz,p_move jsonb,p_turn text,p_result text,p_reason text,p_state jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare g public.board_games%rowtype;seat text;expected text;
begin
 if p_actor is null or p_ply is null or p_updated_at is null then raise exception 'bad_request';end if;
 select * into g from public.board_games where id=p_id for update;
 if not found or g.status<>'playing' then raise exception 'not_playing';end if;
 seat:=case when p_actor=g.p1 then 'p1' when p_actor=g.p2 then 'p2' else null end;
 if seat is null or g.computer_seats @> array[seat] then raise exception 'not_a_player';end if;
 if g.updated_at is distinct from p_updated_at or jsonb_array_length(g.moves)<>p_ply then raise exception 'out_of_sync';end if;
 if g.undo_requested_by is not null then raise exception 'undo_pending';end if;
 expected:=case when g.kind in('chess','janggi') then case when p_ply%2=0 then 'p1' else 'p2' end else g.turn end;
 if expected is null or not g.computer_seats @> array[expected] then raise exception 'not_your_turn';end if;
 if p_turn is null or p_turn not in('p1','p2') or (p_result is not null and p_result not in('p1','p2','draw')) or jsonb_typeof(p_move) is distinct from 'object' or length(p_move::text)>3000 then raise exception 'bad_move';end if;
 update public.board_games set moves=g.moves||jsonb_build_array(p_move),turn=p_turn,
  verified_state=p_state,result=p_result,reason=left(p_reason,20),
  status=case when p_result is null then 'playing' else 'done' end,
  updated_at=greatest(clock_timestamp(),g.updated_at+interval '1 microsecond') where id=p_id;
end;$$;
revoke all on function public.game_computer_commit(uuid,uuid,integer,timestamptz,jsonb,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.game_computer_commit(uuid,uuid,integer,timestamptz,jsonb,text,text,text,jsonb) to service_role;

create or replace function public.game_undo_request(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid:=auth.uid();v_g public.board_games%rowtype;v_len integer;
begin
 if v_me is null then raise exception 'not_signed_in';end if;
 select * into v_g from public.board_games g where g.id=p_id for update;
 if not found or v_g.status<>'playing' or v_g.kind not in('chess','janggi') then raise exception 'not_playing';end if;
 if v_me not in(v_g.p1,v_g.p2) then raise exception 'not_player';end if;
 if cardinality(v_g.computer_seats)>0 then raise exception 'computer_opponent';end if;
 if v_g.undo_requested_by is not null then raise exception 'undo_pending';end if;
 v_len:=jsonb_array_length(v_g.moves);
 if v_len<1 then raise exception 'no_move';end if;
 if v_me is distinct from(case when v_len%2=1 then v_g.p1 else v_g.p2 end) then raise exception 'not_last_mover';end if;
 if (v_me=v_g.p1 and v_g.undo_p1_count>=3) or (v_me=v_g.p2 and v_g.undo_p2_count>=3) then raise exception 'undo_limit';end if;
 update public.board_games g set undo_requested_by=v_me,undo_requested_ply=v_len,
  updated_at=greatest(clock_timestamp(),v_g.updated_at+interval '1 microsecond') where g.id=p_id;
end;$$;
revoke all on function public.game_undo_request(uuid) from public,anon;
grant execute on function public.game_undo_request(uuid) to authenticated;

create or replace function public.game_undo_answer(p_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid:=auth.uid();v_g public.board_games%rowtype;v_len integer;
begin
 if v_me is null then raise exception 'not_signed_in';end if;
 if p_accept is null then raise exception 'bad_answer';end if;
 select * into v_g from public.board_games g where g.id=p_id for update;
 if not found or v_g.status<>'playing' or v_g.kind not in('chess','janggi') then raise exception 'not_playing';end if;
 if v_me not in(v_g.p1,v_g.p2) then raise exception 'not_player';end if;
 if cardinality(v_g.computer_seats)>0 then raise exception 'computer_opponent';end if;
 if v_g.undo_requested_by is null then raise exception 'no_pending';end if;
 if p_accept and v_me=v_g.undo_requested_by then raise exception 'need_opponent';end if;
 if not p_accept then
  update public.board_games g set undo_requested_by=null,undo_requested_ply=null,
   updated_at=greatest(clock_timestamp(),v_g.updated_at+interval '1 microsecond') where g.id=p_id;
  return;
 end if;
 v_len:=jsonb_array_length(v_g.moves);
 if v_len<1 or v_len is distinct from v_g.undo_requested_ply then raise exception 'out_of_sync';end if;
 if v_g.undo_requested_by is distinct from(case when v_len%2=1 then v_g.p1 else v_g.p2 end) then raise exception 'not_last_mover';end if;
 if (v_g.undo_requested_by=v_g.p1 and v_g.undo_p1_count>=3) or (v_g.undo_requested_by=v_g.p2 and v_g.undo_p2_count>=3) then raise exception 'undo_limit';end if;
 update public.board_games g set moves=v_g.moves-(v_len-1),
  undo_p1_count=v_g.undo_p1_count+case when v_g.undo_requested_by=v_g.p1 then 1 else 0 end,
  undo_p2_count=v_g.undo_p2_count+case when v_g.undo_requested_by=v_g.p2 then 1 else 0 end,
  undo_requested_by=null,undo_requested_ply=null,
  updated_at=greatest(clock_timestamp(),v_g.updated_at+interval '1 microsecond') where g.id=p_id;
end;$$;
revoke all on function public.game_undo_answer(uuid,boolean) from public,anon;
grant execute on function public.game_undo_answer(uuid,boolean) to authenticated;

create or replace function ojjuda_guest_internal.streak_candidates(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,difficulty text,priority integer,variant text,achieved_at timestamptz)
language sql stable set search_path='' as $$
 with finished as (
  select g.* from public.board_games g where
   (g.kind=p_game or (p_game='billiards' and g.kind in('carom4','carom3','pool8')))
   and g.status='done' and g.result in('p1','p2','draw')
   and g.updated_at>=p_start and g.updated_at<=p_end
 ), events as (
  select p1 user_id,id round_id,kind variant,'online'::text difficulty,updated_at finished_at,
   case when result='p1' then 'win' when result='draw' then 'draw' else 'loss' end outcome
   from finished where not rank_excluded @> array['p1']
  union all
  select p2,id,kind,'online',updated_at,case when result='p2' then 'win' when result='draw' then 'draw' else 'loss' end
   from finished where p2 is not null and p2<>p1 and not rank_excluded @> array['p2']
  union all
  select r.user_id,r.round_id,r.game,r.difficulty,r.created_at,r.outcome from ojjuda_game_internal.practice_results r
   where (r.game=p_game or (p_game='billiards' and r.game in('carom4','carom3','pool8')))
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
