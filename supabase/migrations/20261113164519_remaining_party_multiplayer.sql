alter table ojjuda_arcade_internal.party_vote_rooms
 add column game_state jsonb not null default '{}', add column last_ops jsonb not null default '{}',
 drop constraint party_vote_rooms_kind_check, drop constraint party_vote_rooms_capacity_check,
 add constraint party_vote_rooms_kind_check check (kind in ('mission','minority','bottle','bomb','stopwatch','truth','initial')),
 add constraint party_vote_rooms_capacity_check check (capacity between (case when kind in ('mission','minority') then 3 else 2 end) and 12);

create function ojjuda_arcade_internal.live_bottle(
 g jsonb, action text, opts jsonb, seat int, n int, ms bigint
) returns jsonb language plpgsql security invoker set search_path='' as $bottle$
declare
 phase text:=g->>'phase';
 shape text:=g->>'shape';
 direction text:=g->>'direction';
 positions jsonb:=g->'positions';
 x double precision; y double precision; ratio double precision;
 winner int; steps int; roll int; bearings double precision[];
 target_deg double precision; initial_deg double precision; gap double precision;
 duration_ms int; forward_ms int; return_ms int:=0;
 residual double precision; travel double precision; power double precision;
begin
 if action='init' then
  -- Keep the same table and seats for a rematch. Everyone may reposition before spinning.
  if phase='done' and jsonb_array_length(positions)=n then
   return jsonb_build_object('phase','seating','shape',shape,'direction',direction,'positions',positions);
  end if;
  return jsonb_build_object('phase','table','shape','round','direction','horizontal',
                            'positions',to_jsonb(array_fill(null::int,array[n])));
 end if;
 if action='view' then return g-'pendingWinner'-'targetDeg'; end if;
 if action='tick' then
  if phase='braking' and ms >= (g->>'started')::bigint+(g->>'durationMs')::int then
   return jsonb_build_object('phase','done','shape',shape,'direction',direction,'positions',positions,
                            'winner',g->'pendingWinner','finalDeg',g->'targetDeg');
  end if;
  return g;
 end if;
 if action in ('table','spin','brake','change_table') and seat<>0 then raise exception 'host_only'; end if;
 if action='change_table' then
  if phase<>'seating' then raise exception 'unavailable'; end if;
  return g||'{"phase":"table"}'::jsonb;
 end if;
 if action='table' then
  if phase<>'table' then raise exception 'unavailable'; end if;
  if coalesce(opts->>'shape','') not in ('round','oval','square','long')
     or coalesce(opts->>'direction','') not in ('horizontal','vertical') then raise exception 'invalid_settings'; end if;
  if shape<>opts->>'shape' or direction<>opts->>'direction' then positions:=to_jsonb(array_fill(null::int,array[n])); end if;
  return jsonb_build_object('phase','seating','shape',opts->>'shape','direction',opts->>'direction','positions',positions);
 end if;
 ratio:=case shape when 'oval' then 1.65 when 'long' then 1.85 else 1 end;
 if direction='vertical' then ratio:=1/ratio; end if;
 if action='seat' then
  if phase<>'seating' then raise exception 'unavailable'; end if;
  if jsonb_typeof(opts->'x') is distinct from 'number' or jsonb_typeof(opts->'y') is distinct from 'number' then
   raise exception 'invalid_seat';
  end if;
  if (opts->>'x')::numeric not between 5 and 95 or (opts->>'y')::numeric not between 5 and 95 then raise exception 'invalid_seat'; end if;
  x:=(opts->>'x')::double precision; y:=(opts->>'y')::double precision;
  if shape in ('round','oval') and (x-50)^2+(y-50)^2>2025.01 then raise exception 'invalid_seat'; end if;
  if ((x-50)*ratio)^2+(y-50)^2<9 then raise exception 'invalid_seat'; end if;
  if exists(select 1 from jsonb_array_elements(positions) with ordinality p(point,idx)
            where idx<>seat+1 and point<>'null'::jsonb
            and ( ((point->>'x')::double precision-x)*ratio )^2+((point->>'y')::double precision-y)^2<16) then
   raise exception 'seat_taken';
  end if;
  return jsonb_set(g,array['positions',seat::text],jsonb_build_object('x',x,'y',y),false);
 end if;
 if action='spin' then
  if phase<>'seating' or (select count(*) from jsonb_array_elements(positions) p where p<>'null'::jsonb)<>n then
   raise exception 'unavailable';
  end if;
  return g||jsonb_build_object('phase','spinning','spinAt',ms,'initialDeg',0);
 end if;
 if action<>'brake' then raise exception 'invalid_action'; end if;
 if phase<>'spinning' then raise exception 'unavailable'; end if;

 -- Each layout uses the same aspect ratio on every phone, even when their pixel widths differ.
 select array_agg(degrees(atan2(((p->>'x')::double precision-50)*ratio,50-(p->>'y')::double precision)) order by i)
 into bearings from jsonb_array_elements(positions) with ordinality q(p,i);
 winner:=floor(random()*n)::int;
 target_deg:=bearings[winner+1]; if target_deg<0 then target_deg:=target_deg+360; end if;
 roll:=floor(random()*100)::int;
 steps:=case when roll<10 then 1 when roll<15 then 2 else 0 end;
 duration_ms:=10000+floor(random()*10001)::int;
 gap:=0;
 if steps>0 then
  if steps=n then gap:=360;
  else
   select rel into gap from (
    select idx,mod((b-target_deg+720)::numeric,360)::double precision rel
    from unnest(bearings) with ordinality a(b,idx) where idx<>winner+1
   ) neighbours order by rel,idx offset (steps-1) limit 1;
   -- Collinear seats are valid; an offset within the marker makes the return visible.
   if gap<0.000001 then gap:=2; end if;
  end if;
  return_ms:=round(case when steps=2 then least(duration_ms*.60,4600+22*gap)
                        else least(duration_ms*.55,3400+14*gap) end)::int;
 end if;
 forward_ms:=duration_ms-case when steps=0 then 0 else return_ms+1200 end;
 initial_deg:=mod(greatest(0,ms-(g->>'spinAt')::bigint)*1.44,360)::double precision;
 residual:=mod((target_deg+gap-initial_deg+720)::numeric,360)::double precision;
 travel:=residual+360*round((1.44*forward_ms/(1.8+0.8*random())-residual)/360);
 power:=1.44*forward_ms/travel;
 return g||jsonb_build_object('phase','braking','started',ms,'durationMs',duration_ms,
  'initialDeg',initial_deg,'travel',travel,'power',power,'reverseDeg',gap,
  'forwardMs',forward_ms,'returnMs',return_ms,'pendingWinner',winner,'targetDeg',target_deg);
end;
$bottle$;
revoke all on function ojjuda_arcade_internal.live_bottle(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;

create function ojjuda_arcade_internal.live_bomb(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql volatile set search_path='' as $$
declare
 phase text:=g->>'phase';
 limit_seconds int:=30+(n-4)*5;
 base_seconds int;
 low_seconds int;
 high_seconds int;
 duration_seconds int;
 topics text[]:=array['분식집 메뉴','동물 이름','빨간색 물건','가방에 넣는 물건','바다에서 볼 수 있는 것','과일 이름','세 글자 음식','여행 준비물','겨울에 떠오르는 것','카페 메뉴','주방 도구','학교에서 보는 것'];
 topic text;
 random_mode boolean;
begin
 if action='init' then
  return jsonb_build_object('phase','setup','baseSeconds',limit_seconds);
 elsif action='view' then
  return g-'endsAt';
 elsif action='tick' then
  if phase='active' and ms>=(g->>'endsAt')::bigint then
   return (g-'endsAt')||jsonb_build_object('phase','done','loser',g->'holder');
  end if;
  return g;
 elsif action in ('configure','adjust','start') and seat<>0 then
  raise exception 'host_only';
 elsif action='configure' and phase='setup' then
  random_mode:=coalesce(opts->'random'='true'::jsonb,false);
  if random_mode then return jsonb_build_object('phase','ready','random',true); end if;
  if coalesce(opts->>'baseSeconds','') !~ '^[0-9]{1,3}$' then raise exception 'invalid_time'; end if;
  base_seconds:=(opts->>'baseSeconds')::int;
  if base_seconds not between 20 and limit_seconds then raise exception 'invalid_time'; end if;
  return jsonb_build_object('phase','ready','random',false,'baseSeconds',base_seconds);
 elsif action='adjust' and phase='ready' then
  return jsonb_build_object('phase','setup','baseSeconds',coalesce((g->>'baseSeconds')::int,limit_seconds));
 elsif action='start' and phase='ready' then
  if (g->>'random')::boolean then
   base_seconds:=20+floor(random()*(limit_seconds-19))::int;
  else
   base_seconds:=(g->>'baseSeconds')::int;
  end if;
  low_seconds:=base_seconds-15;
  high_seconds:=least(limit_seconds,base_seconds+15);
  duration_seconds:=low_seconds+floor(random()*(high_seconds-low_seconds+1))::int;
  topic:=topics[1+floor(random()*cardinality(topics))::int];
  return jsonb_build_object('phase','active','topic',topic,'holder',0,'turn',0,'endsAt',ms+duration_seconds*1000);
 elsif action='pass' and phase='active' then
  if ms>=(g->>'endsAt')::bigint then
   return (g-'endsAt')||jsonb_build_object('phase','done','loser',g->'holder');
  end if;
  if seat<>(g->>'holder')::int then raise exception 'not_your_turn'; end if;
  if opts->'turn' is distinct from g->'turn' then raise exception 'stale_turn'; end if;
  return g||jsonb_build_object('holder',(seat+1)%n,'turn',(g->>'turn')::int+1);
 end if;
 raise exception 'unavailable';
end;
$$;
revoke all on function ojjuda_arcade_internal.live_bomb(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;

create function ojjuda_arcade_internal.live_stopwatch(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql set search_path='' as $$
declare
 phase text:=g->>'phase'; scores jsonb:=g->'scores'; target int; score int; count_in int;
begin
 if action='init' then return jsonb_build_object('phase','setup','target',coalesce((g->>'target')::int,50)); end if;
 if action='tick' then return g; end if;
 if action='view' then
  if phase='setup' then return g-'scores'; end if;
  select count(*) into count_in from jsonb_array_elements(scores) v where v <> 'null'::jsonb;
  return jsonb_strip_nulls(jsonb_build_object('phase',phase,'target',g->'target','submitted',count_in,
   'myScore',scores->seat,'scores',case when phase='done' then scores end));
 end if;
 if action='watch_begin' then
  if seat<>0 then raise exception 'host_only'; end if;
  if phase<>'setup' then raise exception 'unavailable'; end if;
  if coalesce(opts->>'target','') !~ '^(100|[5-9][0-9])$' then raise exception 'invalid_target'; end if;
  target:=(opts->>'target')::int;
  return jsonb_build_object('phase','measure','target',target,'scores',to_jsonb(array_fill(null::int,array[n])));
 end if;
 if action='watch_score' then
  if coalesce(opts->>'score','') !~ '^(0|[1-9][0-9]{0,7})$' then raise exception 'invalid_score'; end if;
  score:=(opts->>'score')::int;
  if scores->>seat is not null then
   if (scores->>seat)::int=score then return g; end if;
   raise exception 'already_scored';
  end if;
  if phase<>'measure' then raise exception 'unavailable'; end if;
  scores:=jsonb_set(scores,array[seat::text],to_jsonb(score),false);
  return g||jsonb_build_object('scores',scores,'phase',case when scores @> '[null]'::jsonb then 'measure' else 'done' end);
 end if;
 raise exception 'invalid_action';
end;
$$;
revoke all on function ojjuda_arcade_internal.live_stopwatch(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;

create function ojjuda_arcade_internal.live_truth(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql set search_path='' as $$
declare
 phase text:=g->>'phase'; player int:=(g->>'turn')::int; deck jsonb; pool jsonb; questions jsonb;
 flavor text; side int; card int; k text; answer text; spent jsonb;
begin
 if action='init' then return jsonb_build_object('phase','setup'); end if;
 if action='tick' then return g; end if;
 if action='view' then
  return jsonb_strip_nulls(jsonb_build_object('phase',phase,'turn',player,'question',g->'question','flavor',g->'flavor'));
 end if;
 if action='truth_begin' then
  if seat<>0 then raise exception 'host_only'; end if;
  if phase<>'setup' then raise exception 'unavailable'; end if;
  deck:=opts->'deck';
  if jsonb_typeof(deck) is distinct from 'object' then raise exception 'invalid_deck'; end if;
  foreach k in array array['mild','spicy'] loop
   questions:=deck->k;
   if jsonb_typeof(questions) is distinct from 'array' then raise exception 'invalid_deck'; end if;
   if jsonb_array_length(questions) not between 1 and 256
    or exists(select 1 from jsonb_array_elements(questions) q where jsonb_typeof(q)<>'string'
     or length(trim(q#>>'{}')) not between 1 and 240)
    or (select count(distinct trim(q)) from jsonb_array_elements_text(questions) q)<>jsonb_array_length(questions)
    then raise exception 'invalid_deck'; end if;
  end loop;
  return jsonb_build_object('phase','pick','turn',0,'deck',jsonb_build_object('mild',deck->'mild','spicy',deck->'spicy'),
   'remaining','{}'::jsonb,'spicySide',floor(random()*2)::int);
 end if;
 if seat is distinct from player then raise exception 'not_your_turn'; end if;
 if action='truth_pick' then
  if phase<>'pick' then raise exception 'unavailable'; end if;
  if coalesce(opts->>'side','') not in ('0','1') then raise exception 'invalid_target'; end if;
  side:=(opts->>'side')::int;
  flavor:=case when side=(g->>'spicySide')::int then 'spicy' else 'mild' end;
  spent:=g->'remaining'; pool:=spent->flavor;
  if pool is null or jsonb_array_length(pool)=0 then pool:=g->'deck'->flavor; end if;
  card:=floor(random()*jsonb_array_length(pool))::int;
  answer:=pool->>card;
  return (g-'spicySide')||jsonb_build_object('phase','answer','question',answer,'flavor',flavor,
   'remaining',jsonb_set(spent,array[flavor],pool-card));
 elsif action in ('truth_answer','truth_pass') then
  if phase<>'answer' then raise exception 'unavailable'; end if;
  if player+1>=n then return jsonb_build_object('phase','done'); end if;
  return (g-'question'-'flavor')||jsonb_build_object('phase','pick','turn',player+1,'spicySide',floor(random()*2)::int);
 end if;
 raise exception 'invalid_action';
end;
$$;
revoke all on function ojjuda_arcade_internal.live_truth(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;

create function ojjuda_arcade_internal.live_initial(g jsonb, action text, opts jsonb, seat int, n int, ms bigint)
returns jsonb language plpgsql volatile set search_path='' as $$
declare
 phase text:=g->>'phase';
 alive int[];
 current_seat int:=(g->>'current')::int;
 cursor_pos int;
 next_seat int;
 turn_no int:=coalesce((g->>'turn')::int,0);
 reason text;
 prompt text;
 initials text[]:=array['ㅅㄱ','ㄱㅅ','ㅂㅅ','ㅅㅈ','ㄱㅈ','ㄷㅅ','ㅈㅅ','ㅎㅅ','ㅅㅂ','ㅊㅅ','ㅂㄱ','ㄱㅁ','ㅅㅁ','ㅈㄱ'];
begin
 if action='init' then
  select array_agg(i order by i) into alive from generate_series(0,n-1) i;
  select x into prompt from unnest(initials) x where x is distinct from g->>'initial' order by random() limit 1;
  return jsonb_build_object('phase','ready','initial',prompt,'alive',alive,'current',0,'turn',0);
 elsif action='view' then
  return g;
 elsif action='tick' and (phase<>'active' or ms<(g->>'endsAt')::bigint) then
  return g;
 elsif action='tick' and phase='active' then
  reason:='시간 초과';
 elsif action in ('start','answer','out','next') then
  if opts->'turn' is distinct from g->'turn' then raise exception 'stale_turn'; end if;
  if seat<>current_seat then raise exception 'not_your_turn'; end if;
  if action='start' and phase='ready' then
   return g||jsonb_build_object('phase','active','endsAt',ms+5000);
  elsif action='next' and phase='intermission' then
   return (g-'lastOut'-'reason')||jsonb_build_object('phase','ready');
  elsif phase='active' and action in ('answer','out') then
   if ms>=(g->>'endsAt')::bigint then reason:='시간 초과';
   elsif action='out' then reason:='중복·오답';
   end if;
  else raise exception 'unavailable';
  end if;
 else raise exception 'unavailable';
 end if;
 select array_agg(value::int order by ord) into alive from jsonb_array_elements_text(g->'alive') with ordinality a(value,ord);
 cursor_pos:=array_position(alive,current_seat);
 if reason is null then
  next_seat:=alive[1+cursor_pos%cardinality(alive)];
  return (g-'endsAt')||jsonb_build_object('phase','ready','current',next_seat,'turn',turn_no+1);
 end if;
 alive:=array_remove(alive,current_seat);
 if cardinality(alive)=1 then
  return jsonb_build_object('phase','done','winner',alive[1],'lastOut',current_seat,'reason',reason,'alive',alive,'turn',turn_no+1);
 end if;
 next_seat:=alive[1+(cursor_pos-1)%cardinality(alive)];
 select x into prompt from unnest(initials) x where x<>g->>'initial' order by random() limit 1;
 return jsonb_build_object('phase','intermission','initial',prompt,'lastOut',current_seat,'reason',reason,'alive',alive,'current',next_seat,'turn',turn_no+1);
end;
$$;
revoke all on function ojjuda_arcade_internal.live_initial(jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;

create function ojjuda_arcade_internal.live_game_step(kind text,g jsonb,action text,opts jsonb,seat int,n int,ms bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 case kind
  when 'bottle' then return ojjuda_arcade_internal.live_bottle(g,action,opts,seat,n,ms);
  when 'bomb' then return ojjuda_arcade_internal.live_bomb(g,action,opts,seat,n,ms);
  when 'stopwatch' then return ojjuda_arcade_internal.live_stopwatch(g,action,opts,seat,n,ms);
  when 'truth' then return ojjuda_arcade_internal.live_truth(g,action,opts,seat,n,ms);
  when 'initial' then return ojjuda_arcade_internal.live_initial(g,action,opts,seat,n,ms);
  else raise exception 'invalid_game';
 end case;
end;
$$;
revoke all on function ojjuda_arcade_internal.live_game_step(text,jsonb,text,jsonb,int,int,bigint) from public,anon,authenticated;

create or replace function ojjuda_arcade_internal.party_vote_multiplayer(p_kind text,p_action text,p_code text default '',p_options jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); nick text; r ojjuda_arcade_internal.party_vote_rooms%rowtype;
 pw text:=coalesce(p_options->>'password',''); title_in text; cap int; req uuid;
 me int; target_slot int; rooms jsonb; changed boolean:=false;
 deal boolean:=false; totals int[]; ballot int;
 bank jsonb;
 is_live boolean:=p_kind in ('bottle','bomb','stopwatch','truth','initial');
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


create function public.party_live_multiplayer(p_kind text,p_action text,p_code text default '',p_options jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_kind is null or p_kind not in ('bottle','bomb','stopwatch','truth','initial') then raise exception 'invalid_game'; end if;
 return ojjuda_arcade_internal.party_vote_multiplayer(p_kind,p_action,p_code,p_options);
end;
$$;
revoke all on function public.party_live_multiplayer(text,text,text,jsonb) from public,anon;
grant execute on function public.party_live_multiplayer(text,text,text,jsonb) to authenticated;

do $feed$
declare definition text:=pg_get_functiondef('public.arcade_extra_rooms()'::regprocedure);
 anchor text:=$anchor$||coalesce(public.party_vote_multiplayer('mission','list')->'rooms','[]'::jsonb)$anchor$;
begin
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'arcade feed definition changed'; end if;
 execute replace(definition,anchor,anchor||$extra$
  ||coalesce(ojjuda_arcade_internal.party_vote_multiplayer('live_lobby','list')->'rooms','[]'::jsonb)$extra$);
end;
$feed$;
notify pgrst,'reload schema';
