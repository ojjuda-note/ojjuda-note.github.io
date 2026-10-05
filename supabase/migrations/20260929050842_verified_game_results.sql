-- Only game-action's authenticated, deterministic rule checks may commit moves.
alter table public.board_games add column if not exists verified_state jsonb;
alter table public.game_scores add column if not exists verified boolean not null default false;

create or replace function public.game_verified_commit(
  p_id uuid, p_actor uuid, p_ply integer, p_updated_at timestamptz,
  p_move jsonb, p_turn text, p_result text, p_reason text, p_state jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare g public.board_games%rowtype; expected uuid;
begin
  if p_actor is null or p_ply is null or p_updated_at is null then raise exception 'bad_request'; end if;
  select * into g from public.board_games where id=p_id for update;
  if not found or g.status <> 'playing' then raise exception 'not_playing'; end if;
  if g.updated_at is distinct from p_updated_at or jsonb_array_length(g.moves) <> p_ply then raise exception 'out_of_sync'; end if;
  if g.undo_requested_by is not null then raise exception 'undo_pending'; end if;
  expected := case when g.kind in ('chess','janggi')
    then case when p_ply % 2 = 0 then g.p1 else g.p2 end
    else case when g.turn='p1' then g.p1 else g.p2 end end;
  if p_actor is distinct from expected then raise exception 'not_your_turn'; end if;
  if p_turn is null or p_turn not in ('p1','p2') or
     (p_result is not null and p_result not in ('p1','p2','draw')) or
     jsonb_typeof(p_move) is distinct from 'object' or length(p_move::text)>3000 then raise exception 'bad_move'; end if;
  update public.board_games set moves=g.moves||jsonb_build_array(p_move),turn=p_turn,
    verified_state=p_state,result=p_result,reason=left(p_reason,20),
    status=case when p_result is null then 'playing' else 'done' end,
    updated_at=greatest(clock_timestamp(),g.updated_at+interval '1 microsecond') where id=p_id;
end $$;
revoke all on function public.game_verified_commit(uuid,uuid,integer,timestamptz,jsonb,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.game_verified_commit(uuid,uuid,integer,timestamptz,jsonb,text,text,text,jsonb) to service_role;
revoke execute on function public.game_move(uuid,integer,jsonb), public.game_shot(uuid,integer,jsonb,text), public.game_finish(uuid,text,text) from public,anon,authenticated;

-- Preserve all existing personal records. Unverified records cannot enter a
-- public ranking, issue currency, or advertise a server-verified result.
create or replace function public.submit_score(p_game text,p_score integer)
returns json language plpgsql security definer set search_path='' as $$
declare mx integer; latest timestamptz; best integer; balance integer;
  day_start timestamptz := date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if public.is_banned(auth.uid()) then return json_build_object('ok',false,'reason','banned'); end if;
  mx := case p_game when 'mole' then 200 when 'runner' then 50000 when 'stacker' then 300 when 'breakout' then 20000 when 'snake' then 300 when 'screw' then 1000000 end;
  if mx is null or p_score is null or p_score<0 or p_score>mx then return json_build_object('ok',false,'reason','invalid'); end if;
  select coins into balance from public.user_private where user_id=auth.uid() for update;
  if not found then raise exception 'no_account'; end if;
  select max(created_at) into latest from public.game_scores where user_id=auth.uid();
  if latest>now()-interval '5 seconds' then return json_build_object('ok',false,'reason','too_fast'); end if;
  insert into public.game_scores(user_id,nick,game,score,reward,verified)
    select auth.uid(),nickname,p_game,p_score,0,false from public.profiles where id=auth.uid();
  select max(score) into best from public.game_scores where user_id=auth.uid() and game=p_game and created_at>=day_start;
  return json_build_object('ok',true,'reward',0,'coins',balance,'best',best,'rank',null,'left',0,'verified',false);
end $$;
create or replace function public.game_ranking(p_game text) returns json
language sql stable security definer set search_path='' as $$
  select coalesce(json_agg(x order by x.score desc),'[]'::json) from (
    select max(g.nick) nick,max(g.score) score,(g.user_id=auth.uid()) me
    from public.game_scores g where g.game=p_game and g.verified
      and g.created_at>=(date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    group by g.user_id order by max(g.score) desc limit 10
  )x;
$$;
