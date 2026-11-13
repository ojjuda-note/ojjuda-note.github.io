alter table ojjuda_arcade_internal.party_vote_rooms
 drop constraint party_vote_rooms_kind_check,
 add constraint party_vote_rooms_kind_check check (kind in ('mission','minority','bottle','bomb','stopwatch','truth','initial','fingers','imagevote'));


create function ojjuda_arcade_internal.live_fingers(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql immutable security invoker set search_path='' as $fingers$
declare
 phase text:=g->>'phase';
 turn_no int:=(g->>'turn')::int;
 responses jsonb:=coalesce(g->'responses','{}'::jsonb);
 question text;
 remaining jsonb;
 losers jsonb;
begin
 if action='init' then
  return jsonb_build_object('phase','prompt','turn',0,'current',0,'fingers',array_fill(5,array[n]));
 end if;
 if action='tick' then return g; end if;
 if action='view' then
  return (g-'responses') || jsonb_build_object(
   'submitted',case when phase='done' then n else (select count(*) from jsonb_object_keys(responses)) end,
   'mine',phase='done' or responses ? (seat::text));
 end if;
 if action not in ('finger_prompt','finger_answer') then raise exception 'invalid_action'; end if;
 if opts->'turn' is distinct from g->'turn' then raise exception 'stale_turn'; end if;
 if action='finger_prompt' then
  if phase<>'prompt' then raise exception 'unavailable'; end if;
  if seat<>(g->>'current')::int then raise exception 'not_your_turn'; end if;
  question:=regexp_replace(opts->>'question','^[[:space:]]+|[[:space:]]+$','','g');
  if jsonb_typeof(opts->'question') is distinct from 'string'
     or char_length(question) not between 1 and 120 then raise exception 'invalid_question'; end if;
  return g || jsonb_build_object('phase','answer','question',question,'responses','{}'::jsonb);
 end if;
 if phase<>'answer' then raise exception 'unavailable'; end if;
 if responses ? (seat::text) then raise exception 'already_answered'; end if;
 if jsonb_typeof(opts->'fold') is distinct from 'boolean' then raise exception 'invalid_answer'; end if;
 responses:=responses || jsonb_build_object(seat::text,opts->'fold');
 if (select count(*) from jsonb_object_keys(responses))<n then
  return g || jsonb_build_object('responses',responses);
 end if;
 -- Apply all answers together so that nobody can see another player's response early.
 select jsonb_agg(left_count order by idx),
        coalesce(jsonb_agg(idx order by idx) filter (where left_count=0),'[]'::jsonb)
 into remaining,losers
 from (select i as idx, (g->'fingers'->>i)::int - (responses->>(i::text))::boolean::int as left_count
       from generate_series(0,n-1) i) s;
 if jsonb_array_length(losers)>0 then
  return (g-'responses') || jsonb_build_object('phase','done','fingers',remaining,'losers',losers);
 end if;
 return jsonb_build_object('phase','prompt','fingers',remaining,'turn',turn_no+1,
                           'current',((g->>'current')::int+1)%n);
end;
$fingers$;
revoke all on function ojjuda_arcade_internal.live_fingers(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;


create function ojjuda_arcade_internal.live_imagevote(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql immutable security invoker set search_path='' as $imagevote$
declare
 phase text:=g->>'phase';
 votes jsonb:=coalesce(g->'votes','{}'::jsonb);
 question text;
 target int;
 counts jsonb;
 winners jsonb;
begin
 if action='init' then return jsonb_build_object('phase','prompt','turn',0,'current',0); end if;
 if action='tick' then return g; end if;
 if action='view' then
  return (g-'votes') || jsonb_build_object(
   'submitted',case when phase='done' then n else (select count(*) from jsonb_object_keys(votes)) end,
   'mine',phase='done' or votes ? (seat::text));
 end if;
 if action not in ('image_prompt','image_vote') then raise exception 'invalid_action'; end if;
 if opts->'turn' is distinct from g->'turn' then raise exception 'stale_turn'; end if;
 if action='image_prompt' then
  if phase<>'prompt' then raise exception 'unavailable'; end if;
  if seat<>0 then raise exception 'host_only'; end if;
  question:=regexp_replace(opts->>'question','^[[:space:]]+|[[:space:]]+$','','g');
  if jsonb_typeof(opts->'question') is distinct from 'string'
     or char_length(question) not between 1 and 120 then raise exception 'invalid_question'; end if;
  return g || jsonb_build_object('phase','vote','question',question,'votes','{}'::jsonb);
 end if;
 if phase<>'vote' then raise exception 'unavailable'; end if;
 if votes ? (seat::text) then raise exception 'already_answered'; end if;
 if jsonb_typeof(opts->'target') is distinct from 'number' or opts->>'target' !~ '^(0|[1-9]|1[01])$'
 then raise exception 'invalid_target'; end if;
 target:=(opts->>'target')::int;
 if target>=n or (n>2 and target=seat) then raise exception 'invalid_target'; end if;
 votes:=votes || jsonb_build_object(seat::text,target);
 if (select count(*) from jsonb_object_keys(votes))<n then
  return g || jsonb_build_object('votes',votes);
 end if;
 -- Discard identifiable ballots when the round is scored. Only seat totals are public.
 with totals as (
  select i as idx,count(b.value) as score
  from generate_series(0,n-1) i left join jsonb_each_text(votes) b on b.value=i::text
  group by i
 ), ranked as (
  select idx,score,max(score) over () as top_score from totals
 )
 select jsonb_agg(score order by idx), jsonb_agg(idx order by idx) filter (where score=top_score)
 into counts,winners from ranked;
 return (g-'votes') || jsonb_build_object('phase','done','counts',counts,'winners',winners);
end;
$imagevote$;
revoke all on function ojjuda_arcade_internal.live_imagevote(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;


create or replace function ojjuda_arcade_internal.live_game_step(kind text,g jsonb,action text,opts jsonb,seat int,n int,ms bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 case kind
  when 'bottle' then return ojjuda_arcade_internal.live_bottle(g,action,opts,seat,n,ms);
  when 'bomb' then return ojjuda_arcade_internal.live_bomb(g,action,opts,seat,n,ms);
  when 'stopwatch' then return ojjuda_arcade_internal.live_stopwatch(g,action,opts,seat,n,ms);
  when 'truth' then return ojjuda_arcade_internal.live_truth(g,action,opts,seat,n,ms);
  when 'initial' then return ojjuda_arcade_internal.live_initial(g,action,opts,seat,n,ms);
  when 'fingers' then return ojjuda_arcade_internal.live_fingers(g,action,opts,seat,n,ms);
  when 'imagevote' then return ojjuda_arcade_internal.live_imagevote(g,action,opts,seat,n,ms);
  else raise exception 'invalid_game';
 end case;
end;
$$;

create or replace function ojjuda_arcade_internal.party_vote_multiplayer(p_kind text,p_action text,p_code text default '',p_options jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); nick text; r ojjuda_arcade_internal.party_vote_rooms%rowtype;
 pw text:=coalesce(p_options->>'password',''); title_in text; cap int; req uuid;
 me int; target_slot int; rooms jsonb; changed boolean:=false;
 deal boolean:=false; totals int[]; ballot int;
 bank jsonb;
 is_live boolean:=p_kind in ('bottle','bomb','stopwatch','truth','initial','fingers','imagevote');
 list_live boolean:=p_kind='live_lobby' and p_action='list';
 ms bigint; ticked jsonb; op_id uuid; due boolean:=false; tick_checked boolean:=false;
begin
 if p_kind is null or not (p_kind in ('mission','minority') or is_live or list_live) then raise exception 'invalid_game'; end if;
 select p.nickname into nick from public.profiles p join auth.users u on u.id=p.id
 where p.id=actor and not coalesce(u.is_anonymous,false);
 if not found then raise exception 'not_signed_in'; end if;
 if public.is_banned(actor) then raise exception 'banned'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(item order by mine desc,expiry desc),'[]') into rooms from (
   select actor=any(c.members) mine,c.expires_at expiry,jsonb_build_object(
    'room_no',(case c.kind when 'mission' then 'MS' when 'minority' then 'MN' else upper(c.kind) end)||'-'||c.code,'kind',c.kind,'native',true,'title',c.title,
    'status',case when c.phase='waiting' then 'waiting' else 'playing' end,'host_name',c.names[1],
    'players',cardinality(c.members),'capacity',c.capacity,'is_host',actor=c.members[1],
    'is_member',actor=any(c.members),'match_id',c.code,'code',c.code) item
   from ojjuda_arcade_internal.party_vote_rooms c where (c.kind=p_kind or (list_live and c.kind in ('bottle','bomb','stopwatch','truth','initial'))) and c.expires_at>now()
    and (c.phase='waiting' or actor=any(c.members))
    and (actor=any(c.members) or not exists(select 1 from unnest(c.members) m where public.blocked_between(actor,m)))
   order by mine desc,expiry desc limit 100) listed;
  return jsonb_build_object('rooms',rooms);
 end if;
 if p_action in ('create','join') then perform pg_advisory_xact_lock(hashtextextended(actor::text,836)); end if;
 if p_action='create' then
  req:=(p_options->>'request_id')::uuid; cap:=(p_options->>'capacity')::int; title_in:=trim(p_options->>'title');
  if req is null or cap is null or cap not between (case when is_live then 2 else 3 end) and 12 or title_in is null or length(title_in) not between 1 and 40 then raise exception 'invalid_title'; end if;
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
 ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 me:=array_position(r.members,actor)-1;
 if is_live and p_action='state' and me is not null and r.phase not in ('waiting','done') then
  ticked:=ojjuda_arcade_internal.live_game_step(r.kind,r.game_state,'tick','{}',me,r.capacity,ms);
  if ticked is distinct from r.game_state then
   select * into r from ojjuda_arcade_internal.party_vote_rooms where kind=p_kind and code=upper(p_code) and expires_at>now() for update;
   if not found then raise exception 'room_unavailable'; end if;
   me:=array_position(r.members,actor)-1;
   ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  else tick_checked:=true; end if;
 end if;
 if not tick_checked and is_live and me is not null and r.phase not in ('waiting','done') then
  ticked:=ojjuda_arcade_internal.live_game_step(r.kind,r.game_state,'tick','{}',me,r.capacity,ms);
  if ticked is distinct from r.game_state then
   due:=true; changed:=true; r.game_state:=ticked; r.phase:=ticked->>'phase';
  end if;
 end if;
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


 elsif is_live then
  -- Never let a client invoke the game's internal hooks or discard a deadline transition.
  if p_action in ('init','tick','view') or p_action is null then raise exception 'invalid_action'; end if;
  req:=(p_options->>'request_id')::uuid;
  if req is null then raise exception 'invalid_request'; end if;
  op_id:=(r.last_ops->>me::text)::uuid;
  if op_id=req or due then null;
  elsif (p_options->>'round')::int is distinct from r.round then raise exception 'stale_round';
  elsif r.phase='waiting' then raise exception 'unavailable';
  else
   if (p_options->>'revision')::int is distinct from r.revision then
    if not (coalesce((p_options->>'revision')::int,0) between 1 and r.revision-1 and
      ((p_kind='stopwatch' and p_action='watch_score' and r.phase='measure') or
       (p_kind='fingers' and p_action='finger_answer' and r.phase='answer' and (p_options->'turn') is not distinct from (r.game_state->'turn')) or
       (p_kind='imagevote' and p_action='image_vote' and r.phase='vote' and (p_options->'turn') is not distinct from (r.game_state->'turn')) or
       (p_kind='bottle' and p_action='seat' and r.phase='seating' and r.game_state->'positions'->me='null'::jsonb)))
    then raise exception 'stale_state'; end if;
   end if;
   if p_action='again' then
    if me<>0 then raise exception 'host_only'; end if;
    if r.phase<>'done' then raise exception 'unavailable'; end if;
    r.round:=r.round+1; deal:=true;
   else
    r.game_state:=ojjuda_arcade_internal.live_game_step(r.kind,r.game_state,p_action,p_options,me,r.capacity,ms);
    r.phase:=r.game_state->>'phase';
   end if;
   r.last_ops:=r.last_ops||jsonb_build_object(me::text,req);
   changed:=true;
  end if;
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
 if deal and is_live then
  r.game_state:=ojjuda_arcade_internal.live_game_step(p_kind,r.game_state,'init','{}',me,r.capacity,ms);
  r.phase:=r.game_state->>'phase'; changed:=true;
 elsif deal then
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
   game_state=r.game_state,last_ops=r.last_ops,votes=r.votes,pair=r.pair,odd_slot=r.odd_slot,round=r.round,revision=revision+1,expires_at=now()+interval '1 day'
   where code=r.code returning * into r;
 end if;
 if p_action='leave' then return jsonb_build_object('left',true); end if;
 if is_live then
  return jsonb_build_object('code',r.code,'title',r.title,'capacity',r.capacity,'players',r.names,'me',me,
    'phase',r.phase,'round',r.round,'revision',r.revision,'serverMs',ms,'game',
    case when r.phase='waiting' then '{}'::jsonb
         else ojjuda_arcade_internal.live_game_step(p_kind,r.game_state,'view','{}',me,r.capacity,ms) end);
 end if;
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

create or replace function public.party_live_multiplayer(p_kind text,p_action text,p_code text default '',p_options jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_kind is null or p_kind not in ('bottle','bomb','stopwatch','truth','initial','fingers','imagevote') then raise exception 'invalid_game'; end if;
 return ojjuda_arcade_internal.party_vote_multiplayer(p_kind,p_action,p_code,p_options);
end;
$$;

notify pgrst, 'reload schema';
