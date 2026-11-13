create table ojjuda_arcade_internal.party_vote_rooms (
 code text primary key, kind text not null check (kind in ('mission','minority')), title text not null, password_hash text not null, capacity smallint not null check (capacity between 3 and 12),
 creator uuid not null, request_id uuid not null, unique(kind,creator,request_id),
 members uuid[] not null, names text[] not null, phase text not null default 'waiting',
 confirmed boolean[] not null default '{}', votes int[] not null default '{}',
 odd_slot int, pair text[], round int not null default 1, revision int not null default 1,
 expires_at timestamptz not null default now()+interval '1 day'
);
create table ojjuda_arcade_internal.party_vote_attempts (
 actor uuid primary key, since timestamptz not null, attempts int not null
);
revoke all on ojjuda_arcade_internal.party_vote_attempts from public,anon,authenticated;
alter table ojjuda_arcade_internal.party_vote_attempts enable row level security;
create index party_vote_expiry on ojjuda_arcade_internal.party_vote_rooms(expires_at);
create index party_vote_kind_expiry on ojjuda_arcade_internal.party_vote_rooms(kind,expires_at desc);
revoke all on ojjuda_arcade_internal.party_vote_rooms from public,anon,authenticated;
alter table ojjuda_arcade_internal.party_vote_rooms enable row level security;

create function ojjuda_arcade_internal.party_vote_multiplayer(p_kind text,p_action text,p_code text default '',p_options jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); nick text; r ojjuda_arcade_internal.party_vote_rooms%rowtype;
 pw text:=coalesce(p_options->>'password',''); title_in text; cap int; req uuid;
 me int; target_slot int; rooms jsonb; changed boolean:=false;
 deal boolean:=false; totals int[]; ballot int;
 bank jsonb;
begin
 if p_kind is null or p_kind not in ('mission','minority') then raise exception 'invalid_game'; end if;
 select p.nickname into nick from public.profiles p join auth.users u on u.id=p.id
 where p.id=actor and not coalesce(u.is_anonymous,false);
 if not found then raise exception 'not_signed_in'; end if;
 if public.is_banned(actor) then raise exception 'banned'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(item order by mine desc,expiry desc),'[]') into rooms from (
   select actor=any(c.members) mine,c.expires_at expiry,jsonb_build_object(
    'room_no',(case when p_kind='mission' then 'MS-' else 'MN-' end)||c.code,'kind',p_kind,'native',true,'title',c.title,
    'status',case when c.phase='waiting' then 'waiting' else 'playing' end,'host_name',c.names[1],
    'players',cardinality(c.members),'capacity',c.capacity,'is_host',actor=c.members[1],
    'is_member',actor=any(c.members),'match_id',c.code,'code',c.code) item
   from ojjuda_arcade_internal.party_vote_rooms c where c.kind=p_kind and c.expires_at>now()
    and (c.phase='waiting' or actor=any(c.members))
    and (actor=any(c.members) or not exists(select 1 from unnest(c.members) m where public.blocked_between(actor,m)))
   order by mine desc,expiry desc limit 100) listed;
  return jsonb_build_object('rooms',rooms);
 end if;
 if p_action in ('create','join') then perform pg_advisory_xact_lock(hashtextextended(actor::text,836)); end if;
 if p_action='create' then
  req:=(p_options->>'request_id')::uuid; cap:=(p_options->>'capacity')::int; title_in:=trim(p_options->>'title');
  if req is null or cap is null or cap not between 3 and 12 or title_in is null or length(title_in) not between 1 and 40 then raise exception 'invalid_title'; end if;
  if length(pw) not between 4 and 32 or octet_length(pw)>72 then raise exception 'invalid_password'; end if;
  delete from ojjuda_arcade_internal.party_vote_rooms where expires_at<=now();
  delete from ojjuda_arcade_internal.party_vote_attempts where since<now()-interval '10 minutes';
  select * into r from ojjuda_arcade_internal.party_vote_rooms where kind=p_kind and creator=actor and request_id=req for update;
  if not found then
   if exists(select 1 from ojjuda_arcade_internal.party_vote_rooms where kind=p_kind and actor=any(members)) then raise exception 'room_in_progress'; end if;
   loop
    insert into ojjuda_arcade_internal.party_vote_rooms(kind,code,title,password_hash,capacity,creator,request_id,members,names)
    values(p_kind,upper(encode(extensions.gen_random_bytes(3),'hex')),title_in,extensions.crypt(pw,extensions.gen_salt('bf',8)),cap,actor,req,array[actor],array[nick])
    on conflict(code) do nothing returning * into r;
    exit when found;
   end loop;
  end if;
 elsif p_action='state' then
  select * into r from ojjuda_arcade_internal.party_vote_rooms where kind=p_kind and code=upper(p_code) and expires_at>now();
  if not found then raise exception 'room_unavailable'; end if;
 else
  select * into r from ojjuda_arcade_internal.party_vote_rooms where kind=p_kind and code=upper(p_code) and expires_at>now() for update;
  if not found then raise exception 'room_unavailable'; end if;
 end if;
 me:=array_position(r.members,actor)-1;
 if p_action='join' and me is null then
  if exists(select 1 from unnest(r.members) m where public.blocked_between(actor,m)) then raise exception 'room_unavailable'; end if;
  if r.phase<>'waiting' or cardinality(r.members)>=r.capacity then raise exception 'room_full'; end if;
  if exists(select 1 from ojjuda_arcade_internal.party_vote_rooms where kind=p_kind and actor=any(members) and expires_at>now()) then raise exception 'room_in_progress'; end if;
  if exists(select 1 from ojjuda_arcade_internal.party_vote_attempts c where c.actor=auth.uid() and c.attempts>=10 and c.since>now()-interval '1 minute') then
   return jsonb_build_object('error','join_rate_limit');
  end if;
  if length(pw) not between 4 and 32 or octet_length(pw)>72 or extensions.crypt(pw,r.password_hash)<>r.password_hash then
   insert into ojjuda_arcade_internal.party_vote_attempts as c values(actor,now(),1)
    on conflict on constraint party_vote_attempts_pkey do update set
    attempts=case when c.since>now()-interval '1 minute' then c.attempts+1 else 1 end,
    since=case when c.since>now()-interval '1 minute' then c.since else now() end;
   return jsonb_build_object('error','wrong_password');
  end if;
  delete from ojjuda_arcade_internal.party_vote_attempts c where c.actor=auth.uid();
  changed:=true; r.members:=array_append(r.members,actor); r.names:=array_append(r.names,nick); me:=cardinality(r.members)-1;
  deal:=cardinality(r.members)=r.capacity;
 elsif me is null then raise exception 'not_room_member';
 elsif p_action in ('create','join','state') then null;
 elsif p_action in ('leave','cancel') then
  if p_action='cancel' and (me<>0 or r.phase<>'waiting') then raise exception 'room_already_started'; end if;
  if me=0 or r.phase<>'waiting' then
   delete from ojjuda_arcade_internal.party_vote_rooms where code=r.code;
   return jsonb_build_object('left',true);
  end if;
  changed:=true; r.members:=array_remove(r.members,actor); r.names:=r.names[1:me]||r.names[me+2:cardinality(r.names)];


 elsif p_action in ('ready','start_vote','vote','again') then
  if (p_options->>'round')::int is distinct from r.round then raise exception 'stale_round'; end if;
  if p_action='again' then
   if me<>0 then raise exception 'host_only'; end if;
   if r.phase<>'done' then raise exception 'unavailable'; end if;
   r.round:=r.round+1; deal:=true;
  elsif p_action='ready' then
   if p_kind<>'mission' then raise exception 'unavailable'; end if;
   if r.confirmed[me+1] then null;
   elsif r.phase<>'cards' then raise exception 'unavailable';
   else
    r.confirmed[me+1]:=true; changed:=true;
    if not (false=any(r.confirmed)) then r.phase:='act'; end if;
   end if;
  elsif p_action='start_vote' then
   if me<>0 then raise exception 'host_only'; end if;
   if p_kind='mission' and r.phase='act' then r.phase:='vote'; changed:=true;
   elsif p_kind<>'mission' or r.phase not in ('vote','done') then raise exception 'unavailable'; end if;
  else
   if coalesce(p_options->>'target','') !~ '^(0|[1-9]|10|11)$' then raise exception 'invalid_target'; end if;
   target_slot:=(p_options->>'target')::int;
   if (p_kind='mission' and (target_slot>=r.capacity or target_slot=me))
     or (p_kind='minority' and target_slot>1) then raise exception 'invalid_target'; end if;
   if r.votes[me+1]=target_slot then null;
   elsif r.votes[me+1]>=0 then raise exception 'already_voted';
   elsif r.phase<>'vote' then raise exception 'unavailable';
   else
    r.votes[me+1]:=target_slot; changed:=true;
    if not (-1=any(r.votes)) then r.phase:='done'; end if;
   end if;
  end if;
 else raise exception 'invalid_action';
 end if;
 if deal then
  if p_kind='mission' then
   bank:='[["고양이", "호랑이"], ["펭귄", "오리"], ["바이올린", "기타"], ["양치하기", "가글하기"], ["스키", "스케이트"], ["축구 골키퍼", "야구 포수"], ["피자 만들기", "부침개 뒤집기"], ["모기 잡기", "비눗방울 터뜨리기"], ["노 젓기", "수영하기"], ["토끼", "캥거루"], ["세수하기", "화장하기"], ["망원경 보기", "사진 찍기"]]'::jsonb;
   r.odd_slot:=floor(random()*r.capacity)::int;
   r.phase:='cards';
  else
   bank:='[["평생 여름", "평생 겨울"], ["순간이동", "시간 멈추기"], ["아침형 인간", "야행성 인간"], ["여행은 바다", "여행은 산"], ["평생 단맛", "평생 짠맛"], ["계획 여행", "즉흥 여행"], ["영화관 맨 앞", "영화관 맨 뒤"], ["하늘을 날기", "물속에서 숨쉬기"], ["평생 라면", "평생 떡볶이"], ["집에서 파티", "밖에서 피크닉"], ["말하는 고양이", "노래하는 강아지"], ["하루가 30시간", "일주일이 4일"]]'::jsonb;
   r.phase:='vote';
  end if;
  select array[pair->>0,pair->>1] into r.pair from jsonb_array_elements(bank) pair
   where (pair->>0) is distinct from r.pair[1] order by random() limit 1;
  r.confirmed:=array_fill(false,array[r.capacity::int]);
  r.votes:=array_fill(-1,array[r.capacity::int]); changed:=true;
 end if;
 if changed then
  update ojjuda_arcade_internal.party_vote_rooms set members=r.members,names=r.names,phase=r.phase,confirmed=r.confirmed,
   votes=r.votes,pair=r.pair,odd_slot=r.odd_slot,round=r.round,revision=revision+1,expires_at=now()+interval '1 day'
   where code=r.code returning * into r;
 end if;
 if p_action='leave' then return jsonb_build_object('left',true); end if;
 if p_kind='mission' and r.phase='done' then
  totals:=array_fill(0,array[r.capacity::int]);
  foreach ballot in array r.votes loop totals[ballot+1]:=totals[ballot+1]+1; end loop;
 end if;
 return jsonb_strip_nulls(jsonb_build_object('code',r.code,'title',r.title,'capacity',r.capacity,'players',r.names,
  'phase',r.phase,'me',me,'round',r.round,'revision',r.revision,
  'word',case when p_kind='mission' and r.phase in ('cards','act','vote') then r.pair[case when me=r.odd_slot then 2 else 1 end] end,
  'choices',case when (p_kind='minority' and r.phase<>'waiting') or r.phase='done' then r.pair end,
  'ready',r.confirmed[me+1], 'readyCount',cardinality(array_positions(r.confirmed,true)),
  'voted',coalesce(r.votes[me+1]>=0,false),'voteCount',cardinality(array_remove(r.votes,-1)),
  'odd',case when r.phase='done' then r.odd_slot end,'totals',totals,
  'votes',case when r.phase='done' and p_kind='minority' then r.votes end));
end;
$$;

create function public.party_vote_multiplayer(p_kind text,p_action text,p_code text default '',p_options jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select ojjuda_arcade_internal.party_vote_multiplayer(p_kind,p_action,p_code,p_options);
$$;
revoke all on function ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb) from public,anon;
revoke all on function public.party_vote_multiplayer(text,text,text,jsonb) from public,anon;
grant execute on function ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb) to authenticated;
grant execute on function public.party_vote_multiplayer(text,text,text,jsonb) to authenticated;

do $feed$
declare definition text:=pg_get_functiondef('public.arcade_extra_rooms()'::regprocedure);
 anchor text:=$anchor$||coalesce(public.king_multiplayer('list')->'rooms','[]'::jsonb)$anchor$;
begin
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'arcade feed definition changed'; end if;
 execute replace(definition,anchor,anchor||$extra$
  ||coalesce(public.party_vote_multiplayer('minority','list')->'rooms','[]'::jsonb)
  ||coalesce(public.party_vote_multiplayer('mission','list')->'rooms','[]'::jsonb)$extra$);
end;
$feed$;
notify pgrst,'reload schema';
