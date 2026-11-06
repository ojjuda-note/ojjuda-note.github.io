-- Match the published monthly ranking, including its existing tie breakers.
-- Administrative winners are recorded and excluded; prizes are not passed to second place.
create function ojjuda_rewards_internal.monthly_candidates(p_as_of timestamptz default now())
returns table(game text,user_id uuid,identity_key text,nickname text,score bigint,tie_at timestamptz)
language sql stable set search_path=pg_catalog as $$
 with bounds as (
  select date_trunc('month',p_as_of at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as start_at
 ), catalogue as (
  select g,ojjuda_guest_internal.score_limit(g) as maximum from unnest(array[
   'saetbyeol','mines','tour','screw_box','screw_flat','spot','ttang','mole','runner','stacker','breakout']) g
 ), member_best as (
  select distinct on(g.game,g.user_id) g.game,g.user_id,g.score,g.created_at
  from public.game_scores g join catalogue c on c.g=g.game cross join bounds b
  where g.created_at>=b.start_at and g.created_at<=p_as_of and g.score between 0 and c.maximum
  order by g.game,g.user_id,g.score desc,g.created_at
 ), guest_best as (
  select distinct on(g.game,g.guest_hash) g.game,g.guest_hash,g.score,g.achieved_at
  from ojjuda_guest_internal.scores g join catalogue c on c.g=g.game cross join bounds b
  where g.achieved_at>=b.start_at and g.achieved_at<=p_as_of and g.score between 0 and c.maximum
  order by g.game,g.guest_hash,g.score desc,g.achieved_at
 ), finished as (
  select g.* from public.board_games g cross join bounds b where g.kind in ('carom4','carom3','pool8','chess','janggi')
   and g.status='done' and g.result in ('p1','p2','draw') and g.updated_at>=b.start_at and g.updated_at<=p_as_of
 ), events as (
  select kind||'_online' as game,p1 as user_id,id as round_id,updated_at as finished_at,
   case when result='p1' then 'win' when result='draw' then 'draw' else 'loss' end as outcome from finished
  union all
  select kind||'_online',p2,id,updated_at,case when result='p2' then 'win' when result='draw' then 'draw' else 'loss' end
   from finished where p2 is not null and p2<>p1
  union all
  select r.game||'_'||r.difficulty,r.user_id,r.round_id,r.created_at,r.outcome
   from ojjuda_game_internal.practice_results r cross join bounds b
   where r.game in ('carom4','carom3','pool8','chess','janggi') and r.difficulty in ('easy','normal','hard','online')
    and r.created_at>=b.start_at and r.created_at<=p_as_of
 ), ordered_events as (
  select *,count(*) filter(where outcome<>'win') over(partition by game,user_id
   order by finished_at desc,round_id desc rows unbounded preceding) as breaks from events
 ), streaks as (
  select game,user_id,count(*) filter(where outcome='win' and breaks=0) as score,max(finished_at) as latest
   from ordered_events group by game,user_id
 ), members as (
  select game,user_id,score::bigint,created_at as tie_at from member_best
  union all
  select game,user_id,score,latest from streaks where score>0
  union all
  select 'tank',w.user_id,count(*)::bigint,max(w.finished_at)
   from ojjuda_tank_internal.wins w cross join bounds b
   where w.finished_at>=b.start_at and w.finished_at<=p_as_of group by w.user_id
  union all
  select 'photo_ttang',c.user_id,count(*)::bigint,max(c.cleared_at)
   from ojjuda_photo_internal.game_clears c cross join bounds b
   where c.month_start=(b.start_at at time zone 'Asia/Seoul')::date and c.cleared_at<=p_as_of group by c.user_id
  union all
  select 'matgo',w.user_id,w.gold,'epoch'::timestamptz from ojjuda_matgo_internal.wallets w cross join bounds b
   where w.updated_at>=b.start_at and w.updated_at<=p_as_of
  union all
  select 'poker',w.user_id,w.gold+coalesce((r.state->'players'->(array_position(r.members,w.user_id)-1)->>'stack')::bigint,0),
   'epoch'::timestamptz
   from ojjuda_poker_internal.wallets w cross join bounds b
   join ojjuda_account_internal.member_identity m on m.user_id=w.user_id
   left join ojjuda_poker_internal.rooms r on r.id=w.active_room
   where w.rounds>0 and w.updated_at>=b.start_at and w.updated_at<=p_as_of
    and ojjuda_account_internal.age_on(m.birth_date,(p_as_of at time zone 'Asia/Seoul')::date)>=19
 )
 select m.game,m.user_id,'member:'||m.user_id::text,p.nickname,m.score,m.tie_at
  from members m join public.profiles p on p.id=m.user_id where not public.is_banned(m.user_id)
 union all
 select g.game,null::uuid,'guest:'||g.guest_hash,'손님',g.score::bigint,g.achieved_at from guest_best g;
$$;

create function ojjuda_rewards_internal.capture_month_end()
returns jsonb language plpgsql set search_path=pg_catalog as $$
declare captured timestamptz:=statement_timestamp(); local_now timestamp:=captured at time zone 'Asia/Seoul';
 month_day date:=date_trunc('month',local_now)::date; cfg ojjuda_rewards_internal.policy%rowtype;
 winner record; why text; award uuid; recipient_phone text; recorded integer:=0;
begin
 -- Cron runs daily at 23:59 KST; only the final calendar day is actionable.
 if local_now::date<>(date_trunc('month',local_now)+interval '1 month - 1 day')::date
  or local_now::time<time '23:59' then return jsonb_build_object('skipped','not_month_end_cutoff'); end if;
 select * into strict cfg from ojjuda_rewards_internal.policy where singleton for update;
 for winner in
  select distinct on(game) * from ojjuda_rewards_internal.monthly_candidates(captured)
  order by game,score desc,tie_at,identity_key
 loop
  if exists(select 1 from ojjuda_rewards_internal.monthly_results where month_start=month_day and game=winner.game) then continue; end if;
  why:=ojjuda_rewards_internal.exclusion_reason(winner.user_id); award:=null;
  if why is null then
   select ojjuda_rewards_internal.phone_hash(phone_number) into recipient_phone
    from ojjuda_account_internal.member_identity where user_id=winner.user_id;
   insert into ojjuda_rewards_internal.awards(award_key,kind,recipient_id,recipient_phone_hash,amount,game,month_start,status_reason)
    values('monthly:'||month_day||':'||winner.game,'monthly_game',winner.user_id,recipient_phone,
     cfg.monthly_amount,winner.game,month_day,'provider_setup_required') returning id into award;
  end if;
  insert into ojjuda_rewards_internal.monthly_results(month_start,game,winner_id,winner_label,score,captured_at,award_id,reason)
   values(month_day,winner.game,winner.user_id,winner.nickname,winner.score,captured,award,coalesce(why,'awaiting_provider'));
  recorded:=recorded+1;
 end loop;
 return jsonb_build_object('recorded_games',recorded,'month',month_day,'cutoff',captured);
end;$$;
revoke all on function ojjuda_rewards_internal.monthly_candidates(timestamptz) from public,anon,authenticated;
revoke all on function ojjuda_rewards_internal.capture_month_end() from public,anon,authenticated;
