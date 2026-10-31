-- Ranking months run from 01:00 Korea time on the first to the next first.
-- Keep calendar-day scores, wallet accounting and coupon snapshots unchanged.
begin;
set local lock_timeout='5s';
-- Drain existing collection writes while copying the surviving current month
-- and installing its new capture paths in this same transaction.
lock table ojjuda_guest_internal.scores,ojjuda_guest_internal.spot_clears,
 ojjuda_photo_internal.game_clears in share mode;

create schema ojjuda_ranking_internal;
revoke all on schema ojjuda_ranking_internal from public,anon,authenticated,service_role;

create function ojjuda_ranking_internal.month_key(p_at timestamptz)
returns date language sql immutable strict parallel safe set search_path='' as $$
 select date_trunc('month',(p_at at time zone 'Asia/Seoul')-interval '1 hour')::date;
$$;
create function ojjuda_ranking_internal.month_start(p_month date)
returns timestamptz language sql immutable strict parallel safe set search_path='' as $$
 select (p_month::timestamp+interval '1 hour') at time zone 'Asia/Seoul';
$$;
create function ojjuda_ranking_internal.catalog()
returns text[] language sql immutable parallel safe set search_path='' as $$
 select array['bang','sacheonseong','tank','saetbyeol','mines','tour','billiards',
  'janggi','chess','screw_box','screw_flat','spot','ttang','mole','runner','stacker',
  'breakout','matgo','poker','photo_ttang']::text[];
$$;

-- Start with the month of installation. Older surviving rows are not a complete
-- historical archive, so we never fabricate winners for an earlier month.
create table ojjuda_ranking_internal.settings (
 singleton boolean primary key default true check(singleton),
 first_month date not null check(extract(day from first_month)=1),
 installed_at timestamptz not null default clock_timestamp()
);
insert into ojjuda_ranking_internal.settings(singleton,first_month)
 values(true,ojjuda_ranking_internal.month_key(clock_timestamp()));

-- Separate monthly ledgers preserve the existing midnight daily/coupon policy.
-- The first-hour daily best must not hide a lower score earned after 01:00.
create table ojjuda_ranking_internal.guest_peaks (
 month_start date not null,game text not null,guest_hash text not null,
 score integer not null check(score>=0),achieved_at timestamptz not null,
 primary key(month_start,game,guest_hash),
 check(guest_hash ~ '^[a-f0-9]{64}$'),
 check(month_start=ojjuda_ranking_internal.month_key(achieved_at))
);
create table ojjuda_ranking_internal.picture_clears (
 game text not null check(game in('spot','photo_ttang')),
 actor_key text not null,user_id uuid references public.profiles(id) on delete cascade,guest_hash text,stage_key text not null,
 month_start date not null,achieved_at timestamptz not null,
 primary key(game,actor_key,month_start,stage_key),
 check(month_start=ojjuda_ranking_internal.month_key(achieved_at)),
 check((user_id is not null and guest_hash is null and actor_key='member:'||user_id::text)
  or (user_id is null and guest_hash is not null and guest_hash ~ '^[a-f0-9]{64}$' and actor_key='guest:'||guest_hash and game='spot'))
);
create index ranking_picture_period on ojjuda_ranking_internal.picture_clears(game,month_start,user_id);

insert into ojjuda_ranking_internal.guest_peaks(month_start,game,guest_hash,score,achieved_at)
 select distinct on(g.game,g.guest_hash) s.first_month,g.game,g.guest_hash,g.score,g.achieved_at
 from ojjuda_guest_internal.scores g cross join ojjuda_ranking_internal.settings s
 where ojjuda_ranking_internal.month_key(g.achieved_at)=s.first_month
 order by g.game,g.guest_hash,g.score desc,g.achieved_at;
insert into ojjuda_ranking_internal.picture_clears(game,actor_key,user_id,guest_hash,stage_key,month_start,achieved_at)
 select distinct on(c.actor_key,c.stage) 'spot',c.actor_key,c.user_id,c.guest_hash,c.stage::text,s.first_month,c.achieved_at
 from ojjuda_guest_internal.spot_clears c cross join ojjuda_ranking_internal.settings s
 where ojjuda_ranking_internal.month_key(c.achieved_at)=s.first_month
 order by c.actor_key,c.stage,c.achieved_at;
insert into ojjuda_ranking_internal.picture_clears(game,actor_key,user_id,stage_key,month_start,achieved_at)
 select distinct on(c.user_id,c.stage_key) 'photo_ttang','member:'||c.user_id::text,c.user_id,c.stage_key,s.first_month,c.cleared_at
 from ojjuda_photo_internal.game_clears c join public.profiles p on p.id=c.user_id
 cross join ojjuda_ranking_internal.settings s
 where ojjuda_ranking_internal.month_key(c.cleared_at)=s.first_month
 order by c.user_id,c.stage_key,c.cleared_at;

-- Patch only validated successful submission paths. Original calendar storage,
-- stage access checks, throttling, receipts and financial side effects stay intact.
do $collection$
declare definition text;updated text;
begin
 definition:=pg_get_functiondef('ojjuda_guest_internal.submit_score(text,integer,text,uuid)'::regprocedure);
 updated:=replace(definition,'    returning score into v_best;', $body$    returning score into v_best;
    insert into ojjuda_ranking_internal.guest_peaks as saved(month_start,game,guest_hash,score,achieved_at)
    values(ojjuda_ranking_internal.month_key(v_now),p_game,v_hash,p_score,v_now)
    on conflict(month_start,game,guest_hash) do update set
     score=greatest(saved.score,excluded.score),
     achieved_at=case when excluded.score>saved.score then excluded.achieved_at else saved.achieved_at end;$body$);
 if updated=definition then raise exception 'guest monthly capture patch target missing';end if;
 execute updated;

 definition:=pg_get_functiondef('ojjuda_guest_internal.record_spot_clear(integer,text)'::regprocedure);
 updated:=replace(definition,' get diagnostics v_added=row_count;', $body$
 insert into ojjuda_ranking_internal.picture_clears(game,actor_key,user_id,guest_hash,stage_key,month_start,achieved_at)
 values('spot',v_key,actor,v_hash,p_stage::text,ojjuda_ranking_internal.month_key(v_now),v_now) on conflict do nothing;
 get diagnostics v_added=row_count;$body$);
 updated:=replace(updated,'select count(*) into total from ojjuda_guest_internal.spot_clears where actor_key=v_key and month_start=v_month;',
  'select count(*) into total from ojjuda_ranking_internal.picture_clears where game=''spot'' and actor_key=v_key and month_start=ojjuda_ranking_internal.month_key(v_now);');
 if updated=definition or position('from ojjuda_ranking_internal.picture_clears where game=''spot''' in updated)=0
 then raise exception 'spot monthly capture patch target missing';end if;
 execute updated;

 definition:=pg_get_functiondef('ojjuda_photo_internal.record_game_clear(text)'::regprocedure);
 updated:=replace(definition,' total integer;', ' total integer; ranking_at timestamptz:=clock_timestamp();');
 updated:=replace(updated,' select count(*) into total from ojjuda_photo_internal.game_clears where user_id=actor and month_start=month_key;', $body$
 insert into ojjuda_ranking_internal.picture_clears(game,actor_key,user_id,stage_key,month_start,achieved_at)
 values('photo_ttang','member:'||actor::text,actor,p_stage,ojjuda_ranking_internal.month_key(ranking_at),ranking_at) on conflict do nothing;
 select count(*) into total from ojjuda_ranking_internal.picture_clears
  where game='photo_ttang' and user_id=actor and month_start=ojjuda_ranking_internal.month_key(ranking_at);$body$);
 if updated=definition or position('where game=''photo_ttang'' and user_id=actor' in updated)=0
 then raise exception 'photo monthly capture patch target missing';end if;
 execute updated;
end;
$collection$;

-- One candidate per identity, with the same precedence as each live game.
-- Existing round/streak helpers retain all computer-takeover exclusions.
-- Their inclusive upper bound is adapted to our half-open month interval.
create function ojjuda_ranking_internal.candidates(p_game text,p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,identity_key text,nick text,score bigint,achieved_at timestamptz,priority integer,details jsonb)
language plpgsql stable security invoker set search_path='' as $$
declare upper_bound timestamptz:=p_end-interval '1 microsecond';score_cap integer;
begin
 if p_game in('billiards','carom4','carom3','pool8','janggi','chess') then
  return query select c.user_id,'member:'||c.user_id::text,p.nickname,c.score,c.achieved_at,c.priority,
   jsonb_build_object('source','difficulty_streak','difficulty',c.difficulty,'variant',c.variant)
  from ojjuda_guest_internal.streak_candidates(p_game,p_start,upper_bound) c
  join public.profiles p on p.id=c.user_id
  where not exists(select 1 from public.user_private u where u.user_id=c.user_id and u.banned_until>now());
 elsif p_game='tank' then
  return query select c.user_id,'member:'||c.user_id::text,p.nickname,c.score,c.achieved_at,c.opponents::integer,
   jsonb_build_object('source','opponents_streak','opponents',c.opponents)
  from ojjuda_guest_internal.tank_candidates(p_start,upper_bound) c join public.profiles p on p.id=c.user_id
  where not exists(select 1 from public.user_private u where u.user_id=c.user_id and u.banned_until>now());
 elsif p_game in('tour','ttang','matgo','poker') then
  return query select c.user_id,coalesce('member:'||c.user_id::text,'guest:'||c.guest_hash),coalesce(p.nickname,'손님'),
   c.score,c.achieved_at,0,jsonb_build_object('source',case when p_game in('tour','ttang') then 'current_streak' else 'best_round_gain' end)
  from ojjuda_guest_internal.round_leaders(p_game,p_start,upper_bound) c
  left join public.profiles p on p.id=c.user_id
  left join ojjuda_account_internal.member_identity m on m.user_id=c.user_id
  where (c.user_id is null or p.id is not null)
   and not exists(select 1 from public.user_private u where u.user_id=c.user_id and u.banned_until>now())
   and (p_game in('tour','ttang') or ojjuda_account_internal.age_on(m.birth_date,(upper_bound at time zone 'Asia/Seoul')::date)>=19);
 elsif p_game in('spot','photo_ttang') then
  return query select c.user_id,c.actor_key,coalesce(p.nickname,'손님'),count(*),max(c.achieved_at),0,
   jsonb_build_object('source',case when p_game='spot' then 'picture_clears' else 'photo_clears' end)
  from ojjuda_ranking_internal.picture_clears c left join public.profiles p on p.id=c.user_id
  where c.game=p_game and c.month_start=ojjuda_ranking_internal.month_key(p_start)
   and c.achieved_at>=p_start and c.achieved_at<p_end and (c.user_id is null or p.id is not null)
   and not exists(select 1 from public.user_private u where u.user_id=c.user_id and u.banned_until>now())
  group by c.user_id,c.actor_key,p.nickname;
 elsif p_game='bang' then
  return query with ordered as(
   select r.*,sum(case when r.won then 0 else 1 end) over(partition by r.user_id
    order by r.achieved_at desc,r.room_id desc rows unbounded preceding) losses
   from ojjuda_bang_internal.results r where r.achieved_at>=p_start and r.achieved_at<p_end
  ), streaks as(
   select r.user_id,count(*) score,max(r.achieved_at) achieved_at from ordered r
   where r.won and r.losses=0 group by r.user_id
  ) select c.user_id,'member:'||c.user_id::text,p.nickname,c.score,c.achieved_at,0,jsonb_build_object('source','current_streak')
  from streaks c join public.profiles p on p.id=c.user_id
  where not exists(select 1 from public.user_private u where u.user_id=c.user_id and u.banned_until>now());
 else
  score_cap:=case when p_game='sacheonseong' then 1999999999 else ojjuda_guest_internal.score_limit(p_game) end;
  if score_cap is null then return;end if;
  return query with member_best as(
   select distinct on(g.user_id) g.user_id,g.score,g.created_at,
    case when p_game='sacheonseong' then split_part(g.game,'_',2)::integer else 0 end stage
   from public.game_scores g
   where ((p_game<>'sacheonseong' and g.game=p_game) or (p_game='sacheonseong' and g.game=any(array[
    'sacheonseong_1','sacheonseong_2','sacheonseong_3','sacheonseong_4','sacheonseong_5',
    'sacheonseong_6','sacheonseong_7','sacheonseong_8','sacheonseong_9','sacheonseong_10',
    'sacheonseong_11','sacheonseong_12','sacheonseong_13','sacheonseong_14','sacheonseong_15'])))
    and g.created_at>=p_start and g.created_at<p_end and g.score between 0 and score_cap
   order by g.user_id,stage desc,g.score desc,g.created_at
  ), guest_best as(
   select distinct on(g.guest_hash) g.guest_hash,g.score,g.achieved_at,
    case when p_game='sacheonseong' then split_part(g.game,'_',2)::integer else 0 end stage
   from ojjuda_ranking_internal.guest_peaks g
   where ((p_game<>'sacheonseong' and g.game=p_game) or (p_game='sacheonseong' and g.game=any(array[
    'sacheonseong_1','sacheonseong_2','sacheonseong_3','sacheonseong_4','sacheonseong_5',
    'sacheonseong_6','sacheonseong_7','sacheonseong_8','sacheonseong_9','sacheonseong_10',
    'sacheonseong_11','sacheonseong_12','sacheonseong_13','sacheonseong_14','sacheonseong_15'])))
    and g.month_start=ojjuda_ranking_internal.month_key(p_start)
    and g.achieved_at>=p_start and g.achieved_at<p_end and g.score between 0 and score_cap
   order by g.guest_hash,stage desc,g.score desc,g.achieved_at
  ) select m.user_id,'member:'||m.user_id::text,p.nickname,m.score::bigint,m.created_at,m.stage,
   jsonb_build_object('source','member_record')||case when p_game='sacheonseong' then jsonb_build_object('stage',m.stage) else '{}'::jsonb end
  from member_best m join public.profiles p on p.id=m.user_id
  where not exists(select 1 from public.user_private u where u.user_id=m.user_id and u.banned_until>now())
  union all
  select null::uuid,'guest:'||g.guest_hash,'손님',g.score::bigint,g.achieved_at,g.stage,
   jsonb_build_object('source','guest_record')||case when p_game='sacheonseong' then jsonb_build_object('stage',g.stage) else '{}'::jsonb end
  from guest_best g;
 end if;
end;
$$;

-- Internal current-month rows also serve existing individual monthly boards.
-- Only games which already hide blocked users continue to apply that filter.
create function ojjuda_ranking_internal.current_rows(p_game text,p_guest_token text default null)
returns json language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_now timestamptz:=statement_timestamp();v_start timestamptz;
 v_hash text;result json;
begin
 if p_game in('matgo','poker') then perform ojjuda_poker_internal.check_member(actor);
 elsif p_game='photo_ttang' then
  if actor is null or not ojjuda_photo_internal.member_allowed() or public.is_banned(actor)
   or not exists(select 1 from public.profiles where id=actor) then raise exception 'not_allowed' using errcode='42501';end if;
 elsif p_game in('bang','tank','billiards','carom4','carom3','pool8','janggi','chess') then
  if actor is null or not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
   where p.id=actor and not coalesce(u.is_anonymous,false)) then raise exception 'not_signed_in' using errcode='42501';end if;
 end if;
 v_start:=ojjuda_ranking_internal.month_start(ojjuda_ranking_internal.month_key(v_now));
 if p_guest_token ~ '^[a-f0-9]{64}$' then v_hash:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');end if;
 select coalesce(json_agg(r.item order by r.priority desc,r.score desc,r.achieved_at,r.identity_key),'[]'::json) into result
 from (select c.*,c.details||jsonb_build_object('nick',c.nick,'score',c.score,
   'me',coalesce(c.user_id=actor,c.identity_key='guest:'||v_hash,false)) item
  from ojjuda_ranking_internal.candidates(p_game,v_start,v_now+interval '1 microsecond') c
  where p_game not in('bang','tank','matgo','poker') or not public.blocked_between(actor,c.user_id)
  order by c.priority desc,c.score desc,c.achieved_at,c.identity_key limit 10) r;
 return result;
end;
$$;

-- Keep each old daily/all-time branch and its grants. Monthly paths share one
-- authoritative clock/window, including guest boards and Bang personal streaks.
do $monthly_reads$
declare signature text;definition text;updated text;
begin
 foreach signature in array array['ojjuda_guest_internal.ranking(text,text,text)','ojjuda_guest_internal.criteria_ranking(text,text,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=regexp_replace(definition,'begin[[:space:]]',case when signature='ojjuda_guest_internal.ranking(text,text,text)'
   then E'begin\n if p_period=''month'' and (p_game=''sacheonseong'' or ojjuda_guest_internal.score_limit(p_game) is not null) then return ojjuda_ranking_internal.current_rows(p_game,p_guest_token);end if;\n'
   else E'begin\n if p_period=''month'' and p_game in(''tour'',''tank'',''ttang'',''spot'',''matgo'',''poker'',''billiards'',''carom4'',''carom3'',''pool8'',''janggi'',''chess'') then return ojjuda_ranking_internal.current_rows(p_game,p_guest_token);end if;\n' end);
  if updated=definition then raise exception 'monthly dispatch patch target missing: %',signature;end if;
  execute updated;
 end loop;
 definition:=pg_get_functiondef('ojjuda_bang_internal.player_record(uuid,uuid)'::regprocedure);
 updated:=replace(definition,'date_trunc(''month'',now() at time zone ''Asia/Seoul'') at time zone ''Asia/Seoul''',
  'ojjuda_ranking_internal.month_start(ojjuda_ranking_internal.month_key(clock_timestamp()))');
 if updated=definition then raise exception 'bang personal month patch target missing';end if;
 execute updated;
end;
$monthly_reads$;
create or replace function ojjuda_bang_internal.ranking()
returns json language sql stable security definer set search_path='' as $$
 select ojjuda_ranking_internal.current_rows('bang');
$$;
create or replace function ojjuda_photo_internal.game_monthly_ranking()
returns json language sql stable security definer set search_path='' as $$
 select ojjuda_ranking_internal.current_rows('photo_ttang');
$$;

create table ojjuda_ranking_internal.archives (
 month_start date primary key check(extract(day from month_start)=1),
 starts_at timestamptz not null,ends_at timestamptz not null,
 captured_at timestamptz not null default clock_timestamp(),
 winners jsonb not null check(jsonb_typeof(winners)='object'),
 has_records boolean not null,
 check(starts_at=ojjuda_ranking_internal.month_start(month_start)),
 check(ends_at=ojjuda_ranking_internal.month_start((month_start+interval '1 month')::date))
);

create function ojjuda_ranking_internal.close_month(p_month date)
returns boolean language plpgsql volatile security definer set search_path='' set lock_timeout='5s' as $$
declare v_start timestamptz;v_end timestamptz;v_winners jsonb;v_first date;
begin
 if coalesce(nullif(current_setting('role',true),'none'),session_user) not in('postgres','supabase_admin','service_role')
 then raise exception 'not_allowed' using errcode='42501';end if;
 select first_month into v_first from ojjuda_ranking_internal.settings where singleton;
 if p_month is null or not isfinite(p_month) or extract(day from p_month)<>1 or p_month<v_first
  or p_month>=ojjuda_ranking_internal.month_key(clock_timestamp()) then
  raise exception 'invalid_closed_month' using errcode='22023';
 end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'archive_requires_read_committed' using errcode='25001';
 end if;
 -- One writer, immutable once inserted. A failed transaction leaves no marker,
 -- so the next scheduled attempt retries the same month instead of hiding errors.
 perform pg_advisory_xact_lock(hashtextextended('ojjuda-game-monthly-archive',0));
 if exists(select 1 from ojjuda_ranking_internal.archives where month_start=p_month) then return false;end if;
 -- Drain transactions already writing ranking sources, then read a fresh
 -- READ COMMITTED snapshot. Later/backdated submissions cannot rewrite a winner.
 -- SHARE allows normal reads; these locks are taken only for a missing archive.
 lock table public.board_games,public.game_scores,ojjuda_game_internal.practice_results,
  ojjuda_guest_internal.round_records,ojjuda_bang_internal.results,ojjuda_guest_internal.scores,
  ojjuda_guest_internal.spot_clears,ojjuda_photo_internal.game_clears,
  ojjuda_ranking_internal.guest_peaks,ojjuda_ranking_internal.picture_clears in share mode;
 v_start:=ojjuda_ranking_internal.month_start(p_month);
 v_end:=ojjuda_ranking_internal.month_start((p_month+interval '1 month')::date);
 select jsonb_object_agg(g.game,case when w.identity_key is null then null else
  w.details||jsonb_build_object('nick',w.nick,'score',w.score,'_userId',w.user_id) end)
 into v_winners from unnest(ojjuda_ranking_internal.catalog()) g(game)
 left join lateral(select c.* from ojjuda_ranking_internal.candidates(g.game,v_start,v_end) c
  order by c.priority desc,c.score desc,c.achieved_at,c.identity_key limit 1) w on true;
 insert into ojjuda_ranking_internal.archives(month_start,starts_at,ends_at,winners,has_records)
 values(p_month,v_start,v_end,v_winners,exists(select 1 from jsonb_each(v_winners) x where x.value<>'null'::jsonb));
 return true;
end;
$$;

create function ojjuda_ranking_internal.close_due_months()
returns integer language plpgsql volatile security definer set search_path='' as $$
declare v_month date;v_count integer:=0;v_current date:=ojjuda_ranking_internal.month_key(clock_timestamp());
begin
 if coalesce(nullif(current_setting('role',true),'none'),session_user) not in('postgres','supabase_admin','service_role')
 then raise exception 'not_allowed' using errcode='42501';end if;
 for v_month in select d::date from ojjuda_ranking_internal.settings s
  cross join lateral generate_series(s.first_month::timestamp,(v_current-interval '1 month')::timestamp,interval '1 month') d
  where not exists(select 1 from ojjuda_ranking_internal.archives a where a.month_start=d::date)
  order by d loop
  if ojjuda_ranking_internal.close_month(v_month) then v_count:=v_count+1;end if;
 end loop;
 return v_count;
end;
$$;

-- Retain archived labels after rename/account removal. Moderation and the
-- existing per-game block policy can hide a winner, never promote a runner-up.
create function ojjuda_ranking_internal.visible_winners(p_winners jsonb,p_games text[],p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_game text;v_record jsonb;v_user uuid;v_result jsonb:='{}';
begin
 foreach v_game in array p_games loop
  v_record:=p_winners->v_game;
  v_user:=nullif(v_record->>'_userId','')::uuid;
  if v_record is null or v_record='null'::jsonb or exists(select 1 from public.user_private u where u.user_id=v_user and u.banned_until>now())
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

create function ojjuda_ranking_internal.allowed_games(p_games text[])
returns text[] language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_game text;v_games text[]:='{}';v_adult boolean;
begin
 if coalesce(nullif(current_setting('role',true),'none'),session_user) not in('postgres','supabase_admin','authenticated','service_role')
  or actor is null or not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
   where p.id=actor and not coalesce(u.is_anonymous,false)) then raise exception 'not_signed_in' using errcode='42501';end if;
 if p_games is null or cardinality(p_games)>40 or array_ndims(p_games)>1 then raise exception 'invalid_games' using errcode='22023';end if;
 v_adult:=ojjuda_photo_internal.member_allowed() and not public.is_banned(actor);
 for v_game in select distinct g from unnest(p_games) x(g) loop
  if v_game is null or not v_game=any(ojjuda_ranking_internal.catalog()) then raise exception 'invalid_game' using errcode='22023';end if;
  if v_game not in('matgo','poker','photo_ttang') or v_adult then v_games:=array_append(v_games,v_game);end if;
 end loop;
 return v_games;
end;
$$;

create function ojjuda_ranking_internal.leaders(p_games text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_games text[]:=ojjuda_ranking_internal.allowed_games(p_games);v_game text;v_result jsonb:='{}';
begin
 foreach v_game in array v_games loop
  v_result:=v_result||jsonb_build_object(v_game,ojjuda_ranking_internal.current_rows(v_game)::jsonb->0);
 end loop;
 return v_result;
end;
$$;

create function ojjuda_ranking_internal.history(p_games text[],p_month date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_now timestamptz:=statement_timestamp();v_current date;
 v_month date;v_first date;v_games text[]:=ojjuda_ranking_internal.allowed_games(p_games);v_leaders jsonb:='{}';
 v_live jsonb;v_months jsonb:='[]';v_row record;v_visible jsonb;
 v_pending boolean:=false;v_has boolean;
begin
 v_current:=ojjuda_ranking_internal.month_key(v_now);
 select first_month into v_first from ojjuda_ranking_internal.settings where singleton;
 v_month:=coalesce(p_month,v_current);
 if not isfinite(v_month) or extract(day from v_month)<>1 or v_month>v_current then raise exception 'invalid_month' using errcode='22023';end if;
 if v_month<v_first then raise exception 'month_unavailable' using errcode='22023';end if;
 if v_month=v_current then v_live:=ojjuda_ranking_internal.leaders(v_games);v_leaders:=v_live;
 else
  select a.winners into v_visible from ojjuda_ranking_internal.archives a where a.month_start=v_month;
  if found then v_leaders:=ojjuda_ranking_internal.visible_winners(v_visible,v_games,actor);
  else v_pending:=true;end if;
 end if;
 for v_row in select d::date as ranking_month,a.winners from generate_series(v_first::timestamp,v_current::timestamp,interval '1 month') d
  left join ojjuda_ranking_internal.archives a on a.month_start=d::date order by d desc loop
  v_visible:=case when v_row.ranking_month=v_current then v_live when v_row.winners is not null
   then ojjuda_ranking_internal.visible_winners(v_row.winners,v_games,actor) else null end;
  v_has:=case when v_visible is null then null else exists(select 1 from jsonb_each(v_visible) x where x.value<>'null'::jsonb) end;
  v_months:=v_months||jsonb_build_array(jsonb_build_object('month',to_char(v_row.ranking_month,'YYYY-MM'),
   'hasRecords',v_has,'pending',v_row.ranking_month<v_current and v_row.winners is null));
 end loop;
 return jsonb_build_object('month',to_char(v_month,'YYYY-MM'),'currentMonth',to_char(v_current,'YYYY-MM'),
  'startsAt',ojjuda_ranking_internal.month_start(v_month),
  'endsAt',ojjuda_ranking_internal.month_start((v_month+interval '1 month')::date),
  'closed',v_month<v_current,'pending',v_pending,'months',v_months,'leaders',v_leaders);
end;
$$;

create function public.community_game_monthly_history(p_games text[],p_month date default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select ojjuda_ranking_internal.history(p_games,p_month);
$$;
create or replace function public.community_game_monthly_leaders(p_games text[])
returns jsonb language sql stable security invoker set search_path='' as $$
 select ojjuda_ranking_internal.leaders(p_games);
$$;

alter table ojjuda_ranking_internal.settings enable row level security;
alter table ojjuda_ranking_internal.guest_peaks enable row level security;
alter table ojjuda_ranking_internal.picture_clears enable row level security;
alter table ojjuda_ranking_internal.archives enable row level security;
revoke all on all tables in schema ojjuda_ranking_internal from public,anon,authenticated,service_role;
revoke all on all functions in schema ojjuda_ranking_internal from public,anon,authenticated,service_role;
grant usage on schema ojjuda_ranking_internal to authenticated,service_role;
grant execute on function ojjuda_ranking_internal.history(text[],date) to authenticated;
grant execute on function ojjuda_ranking_internal.leaders(text[]) to authenticated;
grant execute on function ojjuda_ranking_internal.close_month(date),ojjuda_ranking_internal.close_due_months() to service_role;
revoke all on function public.community_game_monthly_history(text[],date),public.community_game_monthly_leaders(text[]) from public,anon;
grant execute on function public.community_game_monthly_history(text[],date),public.community_game_monthly_leaders(text[]) to authenticated;

-- UTC month-end 16:00 is next month's first day at 01:00 in Korea.
-- A cheap hourly catch-up repairs a missed/failed close; existing months skip
-- before taking source locks. Coupon/referral schedules are intentionally separate.
do $schedule$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('ojjuda_game_monthly_archive','0 16 $ * *','select ojjuda_ranking_internal.close_due_months();');
  perform cron.schedule('ojjuda_game_monthly_archive_catchup','5 * * * *','select ojjuda_ranking_internal.close_due_months();');
 end if;
end;
$schedule$;

notify pgrst,'reload schema';
commit;
