-- ZU purchases never disqualify a completed result.
alter table ojjuda_guest_internal.round_records
 add column opponents smallint check(opponents between 1 and 11),
 drop constraint round_records_game_check,
 drop constraint round_records_check,
 drop constraint round_records_check1,
 add constraint round_records_game_check check(game in ('tour','tank','ttang','matgo','poker')),
 add constraint round_records_actor_check check(
  (user_id is not null and guest_hash is null and actor_key='member:'||user_id::text)
  or (user_id is null and guest_hash is not null and guest_hash ~ '^[a-f0-9]{64}$' and actor_key='guest:'||guest_hash and game in ('tour','ttang'))),
 add constraint round_records_outcome_check check(game not in ('tour','tank','ttang') or value in (0,1));

-- Count the actual starting field, including computers, not unused lobby capacity.
update ojjuda_guest_internal.round_records r set opponents=jsonb_array_length(t.state->'tanks')-1
 from ojjuda_tank_internal.rooms t where r.game='tank' and r.round_id=t.id
 and jsonb_typeof(t.state->'tanks')='array' and jsonb_array_length(t.state->'tanks') between 2 and 12;
create function ojjuda_guest_internal.capture_tank_opponents()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.game='tank' then
  select jsonb_array_length(r.state->'tanks')-1 into new.opponents from ojjuda_tank_internal.rooms r
   where r.id=new.round_id and jsonb_typeof(r.state->'tanks')='array'
    and jsonb_array_length(r.state->'tanks') between 2 and 12;
 end if;
 return new;
end;$$;
revoke all on function ojjuda_guest_internal.capture_tank_opponents() from public,anon,authenticated;
create trigger round_record_tank_opponents before insert on ojjuda_guest_internal.round_records
 for each row when (new.game='tank') execute function ojjuda_guest_internal.capture_tank_opponents();

create function ojjuda_guest_internal.tank_candidates(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,score bigint,opponents smallint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with ordered as (
  select r.*,count(*) filter(where value=0) over(partition by user_id,opponents
   order by achieved_at desc,round_id desc rows unbounded preceding) breaks
  from ojjuda_guest_internal.round_records r where game='tank'
   and achieved_at>=p_start and achieved_at<=p_end and opponents is not null
 ), streaks as (
  select user_id,opponents,count(*) filter(where value=1 and breaks=0) score,max(achieved_at) achieved_at
  from ordered group by user_id,opponents
 ) select distinct on(user_id) user_id,score,opponents,achieved_at from streaks where score>0
  order by user_id,opponents desc,score desc,achieved_at;
$$;
revoke all on function ojjuda_guest_internal.tank_candidates(timestamptz,timestamptz) from public,anon,authenticated;

-- One distinct picture per Korean calendar month, including paid hints/time.
create table ojjuda_guest_internal.spot_clears (
 actor_key text not null,user_id uuid references public.profiles(id) on delete cascade,guest_hash text,
 stage smallint not null check(stage between 1 and 48),
 month_start date not null,achieved_at timestamptz not null default clock_timestamp(),
 primary key(actor_key,month_start,stage),
 check((user_id is not null and guest_hash is null and actor_key='member:'||user_id::text)
  or (user_id is null and guest_hash is not null and guest_hash ~ '^[a-f0-9]{64}$' and actor_key='guest:'||guest_hash))
);
alter table ojjuda_guest_internal.spot_clears enable row level security;
revoke all on ojjuda_guest_internal.spot_clears from public,anon,authenticated,service_role;
create index spot_clears_period on ojjuda_guest_internal.spot_clears(achieved_at,user_id);
create function ojjuda_guest_internal.record_spot_clear(p_stage integer,p_guest_token text)
returns json language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();v_hash text;v_key text;v_now timestamptz:=clock_timestamp();v_month date;v_added integer;total integer;
begin
 if p_stage is null or p_stage not between 1 and 48 then return json_build_object('ok',false,'reason','invalid');end if;
 if actor is not null then
  if not exists(select 1 from public.profiles where id=actor) then raise exception 'not_signed_in';end if;
  if public.is_banned(actor) then return json_build_object('ok',false,'reason','banned');end if;
  v_key:='member:'||actor::text;
 else
  if p_guest_token is null or p_guest_token !~ '^[a-f0-9]{64}$' then return json_build_object('ok',false,'reason','invalid');end if;
  v_hash:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');v_key:='guest:'||v_hash;
 end if;
 v_month:=date_trunc('month',v_now at time zone 'Asia/Seoul')::date;
 insert into ojjuda_guest_internal.spot_clears(actor_key,user_id,guest_hash,stage,month_start,achieved_at)
  values(v_key,actor,v_hash,p_stage,v_month,v_now) on conflict do nothing;
 get diagnostics v_added=row_count;
 select count(*) into total from ojjuda_guest_internal.spot_clears where actor_key=v_key and month_start=v_month;
 return json_build_object('ok',true,'score',total,'duplicate',v_added=0,'verified',false,'reward',0);
end;$$;
revoke all on function ojjuda_guest_internal.record_spot_clear(integer,text) from public;
grant execute on function ojjuda_guest_internal.record_spot_clear(integer,text) to anon,authenticated;
create function public.record_spot_clear(p_stage integer,p_guest_token text default null)
returns json language sql security invoker set search_path='' as $$
 select ojjuda_guest_internal.record_spot_clear(p_stage,p_guest_token);
$$;
revoke all on function public.record_spot_clear(integer,text) from public;
grant execute on function public.record_spot_clear(integer,text) to anon,authenticated;
create function ojjuda_guest_internal.spot_candidates(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,guest_hash text,score bigint,achieved_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select user_id,guest_hash,count(*),max(achieved_at) from ojjuda_guest_internal.spot_clears
  where achieved_at>=p_start and achieved_at<=p_end group by actor_key,user_id,guest_hash;
$$;
revoke all on function ojjuda_guest_internal.spot_candidates(timestamptz,timestamptz) from public,anon,authenticated;

-- Peer-hosted territory outcomes remain casual records, as before, without gold rewards.
-- Reuse the established caller isolation, duplicate receipt and conflict checks.
do $territory$
declare definition text;
begin
 definition:=pg_get_functiondef('ojjuda_guest_internal.record_marble_result(uuid,boolean,text)'::regprocedure);
 definition:=replace(replace(replace(definition,'record_marble_result','record_ttang_result'),'''tour''','''ttang'''),'ojjuda-marble-result:','ojjuda-ttang-result:');
 definition:=regexp_replace(definition,'if exists\(select 1 from ojjuda_marble_internal.rooms where id=p_round\) then return json_build_object\(''ok'',false,''reason'',''online_result_is_server_owned''\);end if;','');
 execute definition;
end;$territory$;
revoke all on function ojjuda_guest_internal.record_ttang_result(uuid,boolean,text) from public;
grant execute on function ojjuda_guest_internal.record_ttang_result(uuid,boolean,text) to anon,authenticated;
create function public.record_ttang_result(p_round uuid,p_won boolean,p_guest_token text default null)
returns json language sql security invoker set search_path='' as $$
 select ojjuda_guest_internal.record_ttang_result(p_round,p_won,p_guest_token);
$$;
revoke all on function public.record_ttang_result(uuid,boolean,text) from public;
grant execute on function public.record_ttang_result(uuid,boolean,text) to anon,authenticated;

do $patch$
declare definition text;updated text;signature text;
begin
 definition:=pg_get_functiondef('ojjuda_guest_internal.round_leaders(text,timestamptz,timestamptz)'::regprocedure);
 execute replace(definition,'''tour'',''tank''','''tour'',''tank'',''ttang''');
 definition:=pg_get_functiondef('ojjuda_guest_internal.criteria_ranking(text,text,text)'::regprocedure);
 updated:=replace(definition,'''tour'',''tank'',''matgo''','''tour'',''tank'',''ttang'',''spot'',''matgo''');
 updated:=replace(updated,'p_game<>''tour''','p_game not in (''tour'',''ttang'',''spot'')');
 updated:=replace(updated,'''tour'',''tank'')','''tour'',''tank'',''ttang'')');
 updated:=replace(updated,'if p_game in (''billiards''', $body$if p_game='tank' then
  select coalesce(json_agg(json_build_object('nick',r.nickname,'score',r.score,'opponents',r.opponents,
   'me',r.user_id=actor,'source','opponents_streak') order by r.opponents desc,r.score desc,r.achieved_at,r.user_id),'[]'::json) into result
  from (select s.*,p.nickname from ojjuda_guest_internal.tank_candidates(v_start,v_now) s
   join public.profiles p on p.id=s.user_id where not public.is_banned(s.user_id) and not public.blocked_between(actor,s.user_id)
   order by s.opponents desc,s.score desc,s.achieved_at,s.user_id limit 10) r;
 elsif p_game='spot' then
  select coalesce(json_agg(json_build_object('nick',r.nickname,'score',r.score,'me',r.me,'source','picture_clears')
   order by r.score desc,r.achieved_at,r.actor_key),'[]'::json) into result
  from (select s.*,coalesce(p.nickname,'손님') nickname,
   coalesce(s.user_id=actor,s.guest_hash=v_hash,false) me,coalesce('member:'||s.user_id::text,'guest:'||s.guest_hash) actor_key
   from ojjuda_guest_internal.spot_candidates(v_start,v_now) s left join public.profiles p on p.id=s.user_id
   where (s.user_id is null or p.id is not null) and not public.is_banned(s.user_id)
   order by s.score desc,s.achieved_at,actor_key limit 10) r;
 elsif p_game in ('billiards'$body$);
 if updated=definition then raise exception 'criteria dispatch missing';end if;execute updated;
 foreach signature in array array['public.community_game_ranking(text)','public.community_game_monthly_ranking(text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,'''tour'',''tank'',''matgo''','''tour'',''tank'',''ttang'',''spot'',''matgo''');
  if updated=definition then raise exception 'ranking dispatch missing: %',signature;end if;execute updated;
 end loop;
 definition:=pg_get_functiondef('public.guest_game_ranking(text,text,text)'::regprocedure);
 execute replace(definition,'p_game=''tour''','p_game in (''tour'',''ttang'',''spot'')');
 definition:=pg_get_functiondef('ojjuda_rewards_internal.monthly_candidates(timestamptz)'::regprocedure);
 updated:=replace(definition,'), rounds as (', $body$), tanks as (
  select s.*,p.nickname,max(s.opponents) over() highest from bounds b
  cross join lateral ojjuda_guest_internal.tank_candidates(b.start_at,p_as_of) s
  join public.profiles p on p.id=s.user_id where not public.is_banned(s.user_id)
 ), pictures as (
  select s.*,coalesce(p.nickname,'손님') nickname from bounds b
  cross join lateral ojjuda_guest_internal.spot_candidates(b.start_at,p_as_of) s
  left join public.profiles p on p.id=s.user_id where (s.user_id is null or p.id is not null) and not public.is_banned(s.user_id)
 ), rounds as ($body$);
 updated:=replace(updated,'(values(''tour''),(''tank''),(''matgo''),(''poker''))','(values(''tour''),(''ttang''),(''matgo''),(''poker''))');
 updated:=replace(updated,'g.game in (''tour'',''tank'')','g.game in (''tour'',''ttang'')');
 updated:=replace(updated,'''tour'',''tank'',''matgo''','''tour'',''tank'',''ttang'',''spot'',''matgo''');
 updated:=replace(updated,'from rounds;', $body$from rounds
 union all select 'tank',user_id,'member:'||user_id::text,nickname,score,achieved_at from tanks where opponents=highest
 union all select 'spot',user_id,coalesce('member:'||user_id::text,'guest:'||guest_hash),nickname,score,achieved_at from pictures;$body$);
 if updated=definition or position('from tanks where opponents=highest' in updated)=0 then raise exception 'monthly criteria patch missing';end if;
 execute updated;
 -- Preserve saved older Matgo rounds, but include their paid victories too.
 if to_regprocedure('ojjuda_matgo_internal.ranked_settle(uuid,uuid,bigint,smallint,integer,text)') is not null then
  definition:=pg_get_functiondef('ojjuda_matgo_internal.ranked_settle(uuid,uuid,bigint,smallint,integer,text)'::regprocedure);
  updated:=regexp_replace(definition,'v_count:=p_outcome<>''draw'' and not exists\(select 1 from ojjuda_matgo_internal.fun_purchases[[:space:]]+where user_id=p_actor and kind=''tazza'' and reference_id=p_round\);','v_count:=p_outcome<>''draw'';');
  if updated=definition then raise exception 'legacy paid-result exclusion missing';end if;execute updated;
 end if;
end;$patch$;
notify pgrst,'reload schema';
