-- One receipt per completed round. Only unverified personal-score games use this
-- endpoint. Earned time determines both calendars; arrival time controls retries.
begin;
create table ojjuda_guest_internal.arcade_round_receipts(
 actor_key text not null, round_id uuid not null, game text not null,
 submitted_score integer not null, finished_at timestamptz not null,
 received_at timestamptz not null, receipt jsonb not null,
 primary key(actor_key,round_id)
);
create index arcade_round_recent on ojjuda_guest_internal.arcade_round_receipts(actor_key,game,received_at desc);
alter table ojjuda_guest_internal.arcade_round_receipts enable row level security;
revoke all on ojjuda_guest_internal.arcade_round_receipts from public,anon,authenticated;

create function ojjuda_guest_internal.submit_arcade_round(
 p_game text,p_score integer,p_round_id uuid,p_finished_at timestamptz,p_guest_token text,p_expected_owner uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); guest_hash_value text; identity_key text; now_at timestamptz;
 earned timestamptz; day_key date; day_start timestamptz; previous ojjuda_guest_internal.arcade_round_receipts%rowtype;
 previous_period boolean; cap integer; points integer:=p_score; best_score integer; nickname_value text; balance integer; result jsonb;
begin
 if p_game is null or (p_game not in ('runner','stacker','mole','breakout','chacha_rush','mines','solitaire')
   and p_game !~ '^sacheonseong_([1-9]|[1-9][0-9]|1[0-9]{2}|200)$')
   or p_round_id is null or p_score is null or p_score<0 or p_finished_at is null or not isfinite(p_finished_at)
 then return jsonb_build_object('ok',false,'reason','invalid');end if;
 if actor is distinct from p_expected_owner or (actor is not null and p_guest_token is not null)
 then return jsonb_build_object('ok',false,'reason','owner_changed');end if;
 if actor is null then
  if p_game='chacha_rush' or p_guest_token is null or p_guest_token !~ '^[0-9a-f]{64}$'
  then return jsonb_build_object('ok',false,'reason','invalid');end if;
  guest_hash_value:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');
  identity_key:='guest:'||guest_hash_value;
 else
  if public.is_banned(actor) then return jsonb_build_object('ok',false,'reason','banned');end if;
  select p.nickname,u.coins into nickname_value,balance from public.profiles p join public.user_private u on u.user_id=p.id where p.id=actor;
  if not found then return jsonb_build_object('ok',false,'reason','no_account');end if;
  identity_key:='member:'||actor::text;
 end if;
 -- Serialize the logical receipt even if another tab replays it under a different game.
 perform pg_advisory_xact_lock(hashtextextended('ojjuda-arcade-round:'||identity_key||':'||p_round_id,0));
 select * into previous from ojjuda_guest_internal.arcade_round_receipts where actor_key=identity_key and round_id=p_round_id;
 if found then
  if previous.game<>p_game or previous.submitted_score<>p_score
  then return jsonb_build_object('ok',false,'reason','request_conflict');end if;
  if ojjuda_ranking_internal.month_key(least(previous.finished_at,previous.received_at))<ojjuda_ranking_internal.month_key(clock_timestamp())
  then return previous.receipt||jsonb_build_object('previous_period',true);end if;
  return previous.receipt;
 end if;
 cap:=ojjuda_guest_internal.score_limit(p_game);
 if p_game='mole' then points:=ojjuda_guest_internal.mole_rank_key(p_score);
 elsif p_game='mines' then points:=ojjuda_game_internal.mines_rank_score(p_score);end if;
 if cap is null or points is null or points<0 or points>cap then return jsonb_build_object('ok',false,'reason','invalid');end if;
 -- Use the same member/guest lock as the original submission paths.
 perform pg_advisory_xact_lock(hashtextextended(case when actor is null then 'ojjuda-guest-score:'||guest_hash_value
  else 'ojjuda-personal-score:'||actor::text end||':'||p_game,0));
 now_at:=clock_timestamp();
 if p_finished_at>now_at+interval '5 minutes' then return jsonb_build_object('ok',false,'reason','invalid_time');end if;
 earned:=least(now_at,p_finished_at);
 -- The monthly winners archive stays frozen. A later receipt can still restore
 -- the personal score and original guest period without changing the next month.
 if ojjuda_ranking_internal.month_key(earned)<(select first_month from ojjuda_ranking_internal.settings where singleton)
 then return jsonb_build_object('ok',false,'reason','invalid_time');end if;
 previous_period:=ojjuda_ranking_internal.month_key(earned)<ojjuda_ranking_internal.month_key(now_at);
 day_key:=(earned at time zone 'Asia/Seoul')::date;
 day_start:=day_key::timestamp at time zone 'Asia/Seoul';
 if exists(select 1 from ojjuda_guest_internal.arcade_round_receipts where actor_key=identity_key and game=p_game and received_at>now_at-interval '5 seconds')
 or (actor is not null and exists(select 1 from public.game_scores where user_id=actor and game=p_game and created_at>now_at-interval '5 seconds'))
 or (actor is null and exists(select 1 from ojjuda_guest_internal.scores where guest_hash=guest_hash_value and game=p_game
     and day in(day_key,(now_at at time zone 'Asia/Seoul')::date) and last_submitted_at>now_at-interval '5 seconds'))
 then return jsonb_build_object('ok',false,'reason','too_fast');end if;
 if actor is not null then
  insert into public.game_scores(user_id,nick,game,score,reward,verified,created_at) values(actor,nickname_value,p_game,points,0,false,earned);
  select max(score) into best_score from public.game_scores where user_id=actor and game=p_game and created_at>=day_start and created_at<day_start+interval '1 day';
  result:=jsonb_build_object('ok',true,'reward',0,'coins',balance,'best',best_score,'rank',null,'left',0,'verified',false);
 else
  insert into ojjuda_guest_internal.scores as s(day,game,guest_hash,score,achieved_at,last_submitted_at,last_request_id,last_score)
  values(day_key,p_game,guest_hash_value,points,earned,now_at,p_round_id,p_score)
  on conflict(day,game,guest_hash) do update set score=greatest(s.score,excluded.score),
   achieved_at=case when excluded.score>s.score then excluded.achieved_at when excluded.score=s.score then least(s.achieved_at,excluded.achieved_at) else s.achieved_at end,
   last_submitted_at=excluded.last_submitted_at,last_request_id=excluded.last_request_id,last_score=excluded.last_score returning score into best_score;
  insert into ojjuda_ranking_internal.guest_peaks as s(month_start,game,guest_hash,score,achieved_at)
  values(ojjuda_ranking_internal.month_key(earned),p_game,guest_hash_value,points,earned)
  on conflict(month_start,game,guest_hash) do update set score=greatest(s.score,excluded.score),
   achieved_at=case when excluded.score>s.score then excluded.achieved_at when excluded.score=s.score then least(s.achieved_at,excluded.achieved_at) else s.achieved_at end;
  result:=jsonb_build_object('ok',true,'guest',true,'reward',0,'best',best_score,'rank',null,'verified',false);
 end if;
 if previous_period then result:=result||jsonb_build_object('previous_period',true);end if;
 insert into ojjuda_guest_internal.arcade_round_receipts values(identity_key,p_round_id,p_game,p_score,p_finished_at,now_at,result);
 return result;
end;
$$;
create function public.submit_arcade_round(
 p_game text,p_score integer,p_round_id uuid,p_finished_at timestamptz,p_guest_token text,p_expected_owner uuid
) returns jsonb language sql security invoker set search_path='' as $$
 select ojjuda_guest_internal.submit_arcade_round(p_game,p_score,p_round_id,p_finished_at,p_guest_token,p_expected_owner);
$$;
revoke all on function public.submit_arcade_round(text,integer,uuid,timestamptz,text,uuid),
 ojjuda_guest_internal.submit_arcade_round(text,integer,uuid,timestamptz,text,uuid) from public;
grant execute on function public.submit_arcade_round(text,integer,uuid,timestamptz,text,uuid),
 ojjuda_guest_internal.submit_arcade_round(text,integer,uuid,timestamptz,text,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
