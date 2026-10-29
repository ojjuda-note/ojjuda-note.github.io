-- Ranked computer matches share the existing monthly streak ledger.
-- Only the Edge service can create/move games; browser-supplied wins are never accepted.
alter table ojjuda_bang_internal.rooms
 add column mode text not null default 'multiplayer' check(mode in('multiplayer','solo')),
 add column options jsonb not null default '{}'::jsonb check(jsonb_typeof(options)='object');

create function ojjuda_bang_internal.player_record(p_actor uuid,p_room uuid)
returns jsonb language sql volatile set search_path='' as $$
 with ordered as(
  select won,sum(case when won then 0 else 1 end) over(order by achieved_at desc,room_id desc rows unbounded preceding) losses
  from ojjuda_bang_internal.results where user_id=p_actor
   and achieved_at>=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' and achieved_at<=clock_timestamp()
 )select jsonb_build_object('saved',true,'won',r.won,'streak',(select count(*) from ordered where won and losses=0),'achieved_at',r.achieved_at)
 from ojjuda_bang_internal.results r where r.room_id=p_room and r.user_id=p_actor;
$$;
revoke all on function ojjuda_bang_internal.player_record(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.bang_online_service(p_actor uuid,p_action text,p_room uuid default null,p_code text default null,p_request uuid default null,p_options jsonb default '{}'::jsonb,p_expected int default null,p_next jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r ojjuda_bang_internal.rooms;v_name text;v_cap int;v_seat int;v_state jsonb;v_now timestamptz:=clock_timestamp();v_winner text;v_player jsonb;i int;v_forfeit boolean;
begin
 if coalesce(nullif(current_setting('role',true),'none'),session_user) not in('service_role','postgres','supabase_admin') then raise exception 'not_signed_in';end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and not coalesce(is_anonymous,false)) then raise exception 'not_signed_in';end if;
 select left(nickname,12) into v_name from public.profiles where id=p_actor;
 if v_name is null then raise exception 'not_signed_in';end if;
 if public.is_banned(p_actor) then raise exception 'banned';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,6421));
 -- Abandoned solo runs cannot be used to skip a loss and keep a streak.
 if p_action in('mine','create') then
  insert into ojjuda_bang_internal.results(room_id,user_id,won,achieved_at)
   select id,host_id,false,expires_at from ojjuda_bang_internal.rooms
   where host_id=p_actor and mode='solo' and status='active' and expires_at<=v_now
   on conflict(room_id,user_id) do nothing;
  update ojjuda_bang_internal.rooms set status='closed',ranked_at=coalesce(ranked_at,expires_at)
   where host_id=p_actor and mode='solo' and status='active' and expires_at<=v_now;
 end if;
 if p_action='create' then
  if p_request is null then raise exception 'invalid_request';end if;
  select * into r from ojjuda_bang_internal.rooms where host_id=p_actor and create_request=p_request;
  if found then return jsonb_build_object('room',to_jsonb(r),'seat',array_position(r.members,p_actor)-1,'record',ojjuda_bang_internal.player_record(p_actor,r.id));end if;
 end if;
 if p_action in('mine','create') then
  select * into r from ojjuda_bang_internal.rooms x where p_actor=any(x.members) and x.status in('waiting','active') and x.expires_at>v_now
   and not coalesce((x.state->'forfeited') @> jsonb_build_array(array_position(x.members,p_actor)-1),false) order by created_at desc limit 1;
  if p_action='mine' then return jsonb_build_object('room',case when r.id is null then null else to_jsonb(r) end,'seat',array_position(r.members,p_actor)-1,'record',ojjuda_bang_internal.player_record(p_actor,r.id));end if;
  if r.id is not null then raise exception 'room_in_progress';end if;
  if (select count(*) from ojjuda_bang_internal.rooms where host_id=p_actor and created_at>v_now-interval '1 minute')>=5 then raise exception 'room_rate_limit';end if;
  if jsonb_typeof(p_options)<>'object' or coalesce(p_options->>'capacity','') !~ '^[4-7]$' then raise exception 'invalid_options';end if;
  v_cap:=(p_options->>'capacity')::int;
  if coalesce(p_options->>'mode','multiplayer') not in('multiplayer','solo') then raise exception 'invalid_options';end if;
  if p_options->>'mode'='solo' and (p_options->>'count' is distinct from p_options->>'capacity' or coalesce(p_options->>'role','') not in('sheriff','random') or coalesce(p_options->>'character','') !~ '^[a-z]+$') then raise exception 'invalid_options';end if;
  insert into ojjuda_bang_internal.rooms(code,host_id,members,names,title,capacity,create_request,mode,options)
  values(upper(left(replace(gen_random_uuid()::text,'-',''),8)),p_actor,array[p_actor],array[v_name],left(coalesce(nullif(trim(p_options->>'title'),''),'뱅! 같이 한 판 해요'),40),v_cap,p_request,coalesce(p_options->>'mode','multiplayer'),p_options) returning * into r;
  return jsonb_build_object('room',to_jsonb(r),'seat',0,'record',ojjuda_bang_internal.player_record(p_actor,r.id));
 end if;
 if p_action='join' then
  if p_code is null or p_code !~ '^[A-Fa-f0-9]{8}$' then raise exception 'invalid_code';end if;
  select * into r from ojjuda_bang_internal.rooms where code=upper(p_code) for update;
 else select * into r from ojjuda_bang_internal.rooms where id=p_room for update;end if;
 if r.id is null or r.expires_at<=v_now or r.status='closed' then raise exception 'room_not_found';end if;
 if exists(select 1 from unnest(r.members) m where public.blocked_between(p_actor,m) or exists(select 1 from public.user_private u where u.user_id=m and u.banned_until>v_now)) then raise exception 'room_unavailable';end if;
 v_seat:=array_position(r.members,p_actor)-1;
 if p_action='join' then
  if r.mode='solo' then raise exception 'room_unavailable';end if;
  if v_seat is not null then return jsonb_build_object('room',to_jsonb(r),'seat',v_seat,'record',ojjuda_bang_internal.player_record(p_actor,r.id));end if;
  if r.status<>'waiting' then raise exception 'room_already_started';end if;
  if cardinality(r.members)>=r.capacity then raise exception 'room_full';end if;
  if exists(select 1 from ojjuda_bang_internal.rooms x where p_actor=any(x.members) and x.status in('waiting','active') and x.expires_at>v_now and not coalesce((x.state->'forfeited') @> jsonb_build_array(array_position(x.members,p_actor)-1),false)) then raise exception 'room_in_progress';end if;
  update ojjuda_bang_internal.rooms set members=array_append(members,p_actor),names=array_append(names,v_name),version=version+1 where id=r.id returning * into r;
  return jsonb_build_object('room',to_jsonb(r),'seat',cardinality(r.members)-1,'record',ojjuda_bang_internal.player_record(p_actor,r.id));
 end if;
 if v_seat is null then raise exception 'room_not_found';end if;
 if p_action='read' then return jsonb_build_object('room',to_jsonb(r),'seat',v_seat,'record',ojjuda_bang_internal.player_record(p_actor,r.id));end if;
 if p_action='leave' then
  if r.status='active' then raise exception 'use_surrender';end if;
  if r.status='waiting' then
   if cardinality(r.members)=1 then update ojjuda_bang_internal.rooms set status='closed' where id=r.id;
   else update ojjuda_bang_internal.rooms set members=array_remove(members,p_actor),names=names[1:v_seat]||names[v_seat+2:cardinality(names)],host_id=case when host_id=p_actor then (array_remove(members,p_actor))[1] else host_id end,version=version+1 where id=r.id;end if;
  end if;
  return jsonb_build_object('room',null);
 end if;
 if p_action not in('start','commit') or p_request is null then raise exception 'invalid_action';end if;
 if p_request=any(r.requests) then return jsonb_build_object('room',to_jsonb(r),'seat',v_seat,'record',ojjuda_bang_internal.player_record(p_actor,r.id));end if;
 if p_expected is distinct from r.version then raise exception 'state_conflict';end if;
 if p_action='start' then
  if r.host_id<>p_actor or r.status<>'waiting' then raise exception 'not_room_owner';end if;
  if r.mode='multiplayer' and cardinality(r.members)<4 then raise exception 'need_players';end if;
 elsif r.status<>'active' then raise exception 'room_unavailable';end if;
 v_state:=p_next->'state';
 if jsonb_typeof(v_state)<>'object' or octet_length(v_state::text)>200000 or v_state->>'runId' is distinct from r.id::text or jsonb_array_length(v_state->'players')<>(case when r.mode='solo' then r.capacity else cardinality(r.members) end) then raise exception 'invalid_request';end if;
 v_winner:=v_state->>'winner';
 if v_winner is not null and v_winner not in('sheriff','outlaw','renegade') then raise exception 'invalid_request';end if;
 update ojjuda_bang_internal.rooms set state=v_state,status=case when v_winner is not null then 'finished' else 'active' end,version=version+1,
  requests=(array_append(requests,p_request))[greatest(1,cardinality(requests)-510):],deadline=v_now+interval '45 seconds',expires_at=v_now+interval '24 hours' where id=r.id returning * into r;
 -- Forfeits break a streak immediately; final settlement cannot turn them into wins.
 for i in 0..cardinality(r.members)-1 loop
  v_forfeit:=coalesce((v_state->'forfeited') @> jsonb_build_array(i),false);
  if v_forfeit or v_winner is not null then
   v_player:=v_state->'players'->i;
   insert into ojjuda_bang_internal.results(room_id,user_id,won,achieved_at) values(r.id,r.members[i+1],
    not v_forfeit and case when v_winner='sheriff' then v_player->>'role' in('sheriff','deputy') else v_player->>'role'=v_winner end,v_now)
   on conflict(room_id,user_id) do nothing;
  end if;
 end loop;
 if v_winner is not null and r.ranked_at is null then update ojjuda_bang_internal.rooms set ranked_at=v_now where id=r.id returning * into r;end if;
 return jsonb_build_object('room',to_jsonb(r),'seat',v_seat,'record',ojjuda_bang_internal.player_record(p_actor,r.id));
end;$$;
revoke all on function public.bang_online_service(uuid,text,uuid,text,uuid,jsonb,int,jsonb) from public,anon,authenticated;
grant execute on function public.bang_online_service(uuid,text,uuid,text,uuid,jsonb,int,jsonb) to service_role;

create or replace function ojjuda_bang_internal.arcade_rooms() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();result jsonb;begin
 if actor is null or not exists(select 1 from auth.users where id=actor and not coalesce(is_anonymous,false)) then raise exception 'not_signed_in';end if;
 if public.is_banned(actor) then raise exception 'banned';end if;
 select coalesce(jsonb_agg(jsonb_build_object('room_no','B-'||r.code,'kind','bang','native',true,'title',r.title,'status',case when r.status='active' then 'playing' else 'waiting' end,
  'host_name',p.nickname,'players',cardinality(r.members),'capacity',r.capacity,'is_host',actor=r.host_id,'is_member',actor=any(r.members),'match_id',r.id,'code',r.code,'created_at',r.created_at) order by r.created_at desc),'[]'::jsonb)
 into result from(select x.* from ojjuda_bang_internal.rooms x where x.mode='multiplayer' and x.status in('waiting','active') and x.expires_at>now()
  and not exists(select 1 from unnest(x.members) m where public.blocked_between(actor,m) or exists(select 1 from public.user_private u where u.user_id=m and u.banned_until>now())) order by x.created_at desc limit 100)r join public.profiles p on p.id=r.host_id;
 return jsonb_build_object('ok',true,'rooms',result);
end;$$;
revoke all on function ojjuda_bang_internal.arcade_rooms() from public,anon;
grant execute on function ojjuda_bang_internal.arcade_rooms() to authenticated;

notify pgrst,'reload schema';
