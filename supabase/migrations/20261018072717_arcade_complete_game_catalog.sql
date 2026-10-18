-- Read-only directory for existing tank/marble rooms, and short-lived ttang lobbies.
-- Friend-invite Marble rooms remain private unless their host publishes them.
alter table ojjuda_marble_internal.rooms add column public_lobby boolean not null default false;
create function public.arcade_publish_marble(p_room uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and not coalesce(is_anonymous,false)) then raise exception 'not_signed_in';end if;
 if public.is_banned(actor) then raise exception 'banned';end if;
 update ojjuda_marble_internal.rooms set public_lobby=true where id=p_room and host_id=actor and status='waiting' and expires_at>clock_timestamp();
 if not found then raise exception 'not_room_owner';end if;
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.arcade_publish_marble(uuid) from public,anon;
grant execute on function public.arcade_publish_marble(uuid) to authenticated;
create table ojjuda_arcade_internal.ttang_rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,24),
 title text not null check(char_length(title) between 1 and 40),
 host_id uuid not null references auth.users(id) on delete cascade,
 guest_id uuid references auth.users(id) on delete cascade,
 request_id uuid not null,
 status text not null default 'preparing' check(status in ('preparing','waiting','playing','closed')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '90 seconds',
 unique(host_id,request_id),check(host_id is distinct from guest_id)
);
create index ttang_lobby_host on ojjuda_arcade_internal.ttang_rooms(host_id,created_at desc);
alter table ojjuda_arcade_internal.ttang_rooms enable row level security;
revoke all on ojjuda_arcade_internal.ttang_rooms from public,anon,authenticated;

create function public.arcade_extra_rooms()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();result jsonb;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and not coalesce(is_anonymous,false)) then raise exception 'not_signed_in';end if;
 if public.is_banned(actor) then raise exception 'banned';end if;
 with all_rooms as (
  select 'tank'::text kind,'T-'||r.code room_no,r.code,r.id,r.title,r.host_id,r.members,r.capacity,r.status,r.created_at,r.expires_at
   from ojjuda_tank_internal.rooms r where r.mode='online'
  union all
  select 'tour','M-'||r.code,r.code,r.id,r.title,r.host_id,r.members,r.capacity,r.status,r.created_at,r.expires_at from ojjuda_marble_internal.rooms r where r.public_lobby
  union all
  select 'ttang','D-'||upper(left(r.id::text,8)),null,r.id,r.title,r.host_id,array_remove(array[r.host_id,r.guest_id],null),2,
   case r.status when 'playing' then 'active' else r.status end,r.created_at,r.expires_at from ojjuda_arcade_internal.ttang_rooms r
 ), visible as (
  select r.* from all_rooms r where r.status in ('waiting','active') and r.expires_at>clock_timestamp()
   and not exists(select 1 from unnest(r.members) member where exists(select 1 from public.user_private banned where banned.user_id=member and banned.banned_until>now()) or public.blocked_between(actor,member))
  order by r.created_at desc limit 100
 )
 select coalesce(jsonb_agg(jsonb_build_object('room_no',r.room_no,'kind',r.kind,'native',true,'title',r.title,
  'status',case r.status when 'active' then 'playing' else 'waiting' end,
  'host_name',coalesce(p.nickname,'회원'),'players',cardinality(r.members),'capacity',r.capacity,
  'is_host',actor=r.host_id,'is_member',actor=any(r.members),'match_id',r.id,'code',r.code,'created_at',r.created_at)
  order by r.created_at desc),'[]'::jsonb) into result from visible r left join public.profiles p on p.id=r.host_id;
 return jsonb_build_object('ok',true,'rooms',result);
end;$$;
revoke all on function public.arcade_extra_rooms() from public,anon;
grant execute on function public.arcade_extra_rooms() to authenticated;

create function public.arcade_ttang_room(p_action text,p_room uuid default null,p_title text default null,p_request uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();r ojjuda_arcade_internal.ttang_rooms%rowtype;title_value text;
begin
 if actor is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=actor and not coalesce(u.is_anonymous,false)) then raise exception 'not_signed_in';end if;
 if public.is_banned(actor) then raise exception 'banned';end if;
 if p_action is null or p_action not in ('create','join','heartbeat','leave') then raise exception 'invalid_action';end if;
 perform pg_advisory_xact_lock(hashtextextended('ttang-lobby:'||actor::text,0));
 if p_action='create' then
  title_value:=btrim(p_title);
  if title_value is null or char_length(title_value) not between 1 and 40 or title_value~'[[:cntrl:]]' then raise exception 'invalid_title';end if;
  if p_request is null then raise exception 'invalid_request';end if;
  select * into r from ojjuda_arcade_internal.ttang_rooms where host_id=actor and request_id=p_request;
  if not found then
   if exists(select 1 from ojjuda_arcade_internal.ttang_rooms where (host_id=actor or guest_id=actor) and status<>'closed' and expires_at>clock_timestamp()) then raise exception 'room_in_progress';end if;
   if (select count(*) from ojjuda_arcade_internal.ttang_rooms where host_id=actor and created_at>clock_timestamp()-interval '1 minute')>=5 then raise exception 'room_rate_limit';end if;
   insert into ojjuda_arcade_internal.ttang_rooms(title,host_id,request_id) values(title_value,actor,p_request) returning * into r;
  elsif r.title<>title_value then raise exception 'invalid_request';end if;
 else
  select * into r from ojjuda_arcade_internal.ttang_rooms where id=p_room for update;
  if r.id is null then raise exception 'room_unavailable';end if;
  if p_action='leave' then
   if actor<>r.host_id and actor is distinct from r.guest_id then raise exception 'not_room_owner';end if;
   update ojjuda_arcade_internal.ttang_rooms set status='closed' where id=r.id;
   return jsonb_build_object('ok',true);
  end if;
  if r.status='closed' or r.expires_at<=clock_timestamp() then raise exception 'room_unavailable';end if;
  if exists(select 1 from public.user_private banned where banned.user_id=r.host_id and banned.banned_until>now()) or public.blocked_between(actor,r.host_id) or (r.guest_id is not null and (exists(select 1 from public.user_private banned where banned.user_id=r.guest_id and banned.banned_until>now()) or public.blocked_between(actor,r.guest_id))) then raise exception 'room_unavailable';end if;
  if p_action='heartbeat' then
   if actor<>r.host_id then raise exception 'not_room_owner';end if;
   update ojjuda_arcade_internal.ttang_rooms set expires_at=clock_timestamp()+interval '90 seconds',status=case when status='preparing' then 'waiting' else status end where id=r.id returning * into r;
  elsif actor<>r.host_id and actor is distinct from r.guest_id then
   if r.status<>'waiting' or r.guest_id is not null then raise exception 'room_full';end if;
   if exists(select 1 from ojjuda_arcade_internal.ttang_rooms where (host_id=actor or guest_id=actor) and status<>'closed' and expires_at>clock_timestamp()) then raise exception 'room_in_progress';end if;
   update ojjuda_arcade_internal.ttang_rooms set guest_id=actor,status='playing' where id=r.id returning * into r;
  end if;
 end if;
 if r.status='closed' or r.expires_at<=clock_timestamp() then raise exception 'room_unavailable';end if;
 return jsonb_build_object('ok',true,'room',jsonb_build_object('id',r.id,'code',r.code,'title',r.title,'is_host',actor=r.host_id));
end;$$;
revoke all on function public.arcade_ttang_room(text,uuid,text,uuid) from public,anon;
grant execute on function public.arcade_ttang_room(text,uuid,text,uuid) to authenticated;

-- Monthly tank wins come only from completed authoritative matches.
create function public.tank_monthly_ranking()
returns json language plpgsql stable security definer set search_path=pg_catalog as $$
declare result json;
begin
 if auth.uid() is null then raise exception 'not_signed_in';end if;
 if public.is_banned(auth.uid()) then raise exception 'banned';end if;
 select coalesce(json_agg(json_build_object('nick',ranked.nickname,'score',ranked.score,'me',ranked.user_id=auth.uid(),'source','tank_wins') order by ranked.score desc,ranked.achieved_at,ranked.user_id),'[]'::json) into result
 from (select w.user_id,p.nickname,count(*)::integer score,max(w.finished_at) achieved_at
  from ojjuda_tank_internal.wins w join public.profiles p on p.id=w.user_id
  where w.finished_at>=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
   and w.finished_at<=now() and not exists(select 1 from public.user_private banned where banned.user_id=w.user_id and banned.banned_until>now()) and not public.blocked_between(auth.uid(),w.user_id)
  group by w.user_id,p.nickname order by score desc,achieved_at,w.user_id limit 10) ranked;
 return result;
end;$$;
revoke all on function public.tank_monthly_ranking() from public,anon;
grant execute on function public.tank_monthly_ranking() to authenticated;
create or replace function public.community_game_monthly_ranking(p_game text)
returns json language plpgsql stable security invoker set search_path='' as $$
begin
 if p_game='tank' then return public.tank_monthly_ranking();end if;
 if ojjuda_guest_internal.score_limit(p_game) is not null then return ojjuda_guest_internal.ranking(p_game,'month',null);end if;
 return ojjuda_game_internal.community_game_monthly_ranking(p_game);
end;$$;
notify pgrst,'reload schema';
