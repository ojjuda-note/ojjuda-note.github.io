-- A drinking room owns its roster and at most one short-lived native game.
create table ojjuda_arcade_internal.drinking_rooms (
 code text primary key, creator uuid not null, request_id uuid not null, unique(creator,request_id),
 title text not null, password_hash text not null, capacity smallint not null check(capacity between 2 and 12),
 members uuid[] not null, names text[] not null,
 phase text not null default 'lobby' check(phase in ('lobby','playing')), kind text, child text,
 round int not null default 0, revision int not null default 1,
 expires_at timestamptz not null default now()+interval '1 day',
 check(cardinality(members) between 1 and capacity and cardinality(names)=cardinality(members)),
 check(creator=members[1] and ((phase='lobby' and child is null) or (phase='playing' and kind is not null and child is not null)))
);
create index drinking_rooms_expiry on ojjuda_arcade_internal.drinking_rooms(expires_at);
create index drinking_rooms_members on ojjuda_arcade_internal.drinking_rooms using gin(members);
create table ojjuda_arcade_internal.drinking_attempts (
 actor uuid primary key, since timestamptz not null, attempts int not null
);
-- Leave receipts deliberately outlive closed rooms, so a lost reply can be retried.
create table ojjuda_arcade_internal.drinking_ops (
 actor uuid not null, request_id uuid not null, room_code text not null, action text not null,
 expires_at timestamptz not null default now()+interval '1 day', primary key(actor,request_id)
);
create index drinking_ops_expiry on ojjuda_arcade_internal.drinking_ops(expires_at);
revoke all on ojjuda_arcade_internal.drinking_rooms,ojjuda_arcade_internal.drinking_attempts,
 ojjuda_arcade_internal.drinking_ops from public,anon,authenticated;
alter table ojjuda_arcade_internal.drinking_rooms enable row level security;
alter table ojjuda_arcade_internal.drinking_attempts enable row level security;
alter table ojjuda_arcade_internal.drinking_ops enable row level security;

-- Only tagged children are managed. An ordinary room can use the same game and
-- members independently, and is never removed or repurposed by a drinking room.
do $tag$
declare t text;
begin
 foreach t in array array['croc_rooms','liar_rooms','king_rooms','party_vote_rooms'] loop
  execute format('alter table ojjuda_arcade_internal.%I add column drinking_code text references ojjuda_arcade_internal.drinking_rooms(code) on delete cascade',t);
  execute format('create unique index %I on ojjuda_arcade_internal.%I(drinking_code) where drinking_code is not null',t||'_drinking',t);
 end loop;
end;
$tag$;

-- Keep the existing deals, role secrecy, timed rules and DTOs as their single source.
-- hub_bootstrap is accepted once only, for the missing host of an already linked,
-- locked, full-roster parent. Guests occupy their original seats in the same transaction.
do $bridge$
declare
 f record; definition text; guard text; boot text; decl text; childtable text; game_expr text;
begin
 for f in select * from (values
  ('croc','public.croc_multiplayer(text,text,jsonb)'::regprocedure,'d49519a6b8672c25af094a9a57e2b378'),
  ('liar','public.liar_multiplayer(text,text,jsonb)'::regprocedure,'b3eaaf634d0bc74100abc07f57c69336'),
  ('king','public.king_multiplayer(text,text,jsonb)'::regprocedure,'77af776746a5cb555596aa1a74cfc3d6'),
  ('party_vote','ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure,'9dad710431d084cfd285a9d41a343d52')
 ) d(kind,proc,expected_md5) loop
  if (select md5(prosrc) from pg_proc where oid=f.proc)<>f.expected_md5 then raise exception 'native game definition changed: %',f.proc;end if;
  definition:=pg_get_functiondef(f.proc);
  childtable:='ojjuda_arcade_internal.'||f.kind||'_rooms';
  game_expr:=case when f.kind='party_vote' then 'r.kind' else quote_literal(f.kind) end;
  -- Keep create-idempotency and standalone exclusivity scoped to standalone games.
  definition:=replace(definition,childtable||' c where ',childtable||' c where c.drinking_code is null and ');
  definition:=replace(definition,'creator=actor and request_id=req','drinking_code is null and creator=actor and request_id=req');
  definition:=replace(definition,'and actor=any(members)','and drinking_code is null and actor=any(members)');
  definition:=replace(definition,'where actor=any(members)','where drinking_code is null and actor=any(members)');
  decl:=E'declare\n parent_row ojjuda_arcade_internal.drinking_rooms%rowtype;';
  definition:=replace(definition,E'declare\n',decl||E'\n');
  guard:=$guard$
 if r.drinking_code is not null then
  select * into parent_row from ojjuda_arcade_internal.drinking_rooms h where h.code=r.drinking_code
   and h.phase='playing' and h.child=r.code and h.kind=GAME_KIND and h.expires_at>now();
  if not found or not(actor=any(parent_row.members)) then raise exception 'not_room_member'; end if;
  if p_action in ('leave','cancel','again') then raise exception 'managed_room'; end if;
  if p_action='hub_bootstrap' and (r.phase<>'waiting' or r.creator<>actor or parent_row.creator<>actor
       or r.members<>parent_row.members[2:cardinality(parent_row.members)]) then raise exception 'managed_room'; end if;
 elsif p_action='hub_bootstrap' then raise exception 'invalid_action';
 end if;
$guard$;
  guard:=replace(guard,'GAME_KIND',game_expr);
  boot:=$boot$
 if p_action='hub_bootstrap' then
  r.members:=parent_row.members; r.names:=parent_row.names; me:=0;
  DEAL
 elsif p_action='join' and me is null then$boot$;
  boot:=replace(boot,'DEAL',case when f.kind='croc' then 'joined:=true; r.phase:=''playing'';' else 'deal:=true; changed:=true;' end);
  definition:=replace(definition,' if p_action=''join'' and me is null then',guard||boot);
  execute definition;
 end loop;
end;
$bridge$;

create function ojjuda_arcade_internal.drinking_child_table(kind text) returns regclass
language sql immutable security invoker set search_path='' as $$
 select case $1 when 'croc' then 'ojjuda_arcade_internal.croc_rooms'::regclass
  when 'king' then 'ojjuda_arcade_internal.king_rooms'::regclass
  when 'liar' then 'ojjuda_arcade_internal.liar_rooms'::regclass
  else 'ojjuda_arcade_internal.party_vote_rooms'::regclass end;
$$;
revoke all on function ojjuda_arcade_internal.drinking_child_table(text) from public,anon,authenticated;

create function ojjuda_arcade_internal.drinking_start_child(h ojjuda_arcade_internal.drinking_rooms, game text)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare
 room_table regclass:=ojjuda_arcade_internal.drinking_child_table(game);
 n int:=cardinality(h.members); candidate text; child_code text; state_in jsonb;
 extra_cols text:=''; extra_values text:='';
begin
 if auth.uid() is distinct from h.creator then raise exception 'host_only'; end if;
 if n<(case when game in ('liar','king','minority','mission') then 3 else 2 end) then raise exception 'not_enough_players'; end if;
 if exists(select 1 from unnest(h.members) m left join auth.users u on u.id=m left join public.profiles p on p.id=m
           left join public.user_private flags on flags.user_id=m
           where u.id is null or p.id is null or coalesce(u.is_anonymous,false) or flags.banned_until>now())
  or exists(select 1 from public.blocks b where b.blocker=any(h.members) and b.blocked=any(h.members))
 then raise exception 'member_unavailable'; end if;
 if game='croc' then extra_cols:=',trap';extra_values:=',floor(random()*24)::int';
 elsif game not in ('king','liar') then extra_cols:=',kind';extra_values:=',$9'; end if;
 loop
  candidate:=upper(encode(extensions.gen_random_bytes(3),'hex'));
  execute format('insert into %s(code,title,password_hash,capacity,creator,request_id,members,names,drinking_code%s)
    values($1,$2,$3,$4,$5,gen_random_uuid(),$6,$7,$8%s) on conflict(code) do nothing returning code',room_table,extra_cols,extra_values)
   into child_code using candidate,h.title,h.password_hash,n,h.creator,h.members[2:n],h.names[2:n],h.code,game;
  exit when child_code is not null;
 end loop;
 update ojjuda_arcade_internal.drinking_rooms set phase='playing',child=child_code,kind=game,round=round+1
 where code=h.code;
 case game
 when 'croc' then state_in:=public.croc_multiplayer('hub_bootstrap',child_code);
 when 'liar' then state_in:=public.liar_multiplayer('hub_bootstrap',child_code);
 when 'king' then state_in:=public.king_multiplayer('hub_bootstrap',child_code);
 else state_in:=ojjuda_arcade_internal.party_vote_multiplayer(game,'hub_bootstrap',child_code);
 end case;
 if state_in->>'phase' in ('waiting','done') or state_in->'players' is distinct from to_jsonb(h.names)
 then raise exception 'child_start_failed'; end if;
 return child_code;
end;
$$;
revoke all on function ojjuda_arcade_internal.drinking_start_child(ojjuda_arcade_internal.drinking_rooms,text) from public,anon,authenticated;

create function ojjuda_arcade_internal.drinking_snapshot(h ojjuda_arcade_internal.drinking_rooms,actor uuid)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('code',h.code,'title',h.title,'capacity',h.capacity,'players',h.names,
  'me',array_position(h.members,actor)-1,'phase',h.phase,'kind',h.kind,'child',h.child,'round',h.round,'revision',h.revision);
$$;
revoke all on function ojjuda_arcade_internal.drinking_snapshot(ojjuda_arcade_internal.drinking_rooms,uuid) from public,anon,authenticated;

create function ojjuda_arcade_internal.drinking_room(p_action text,p_code text default '',p_options jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $drinking$
declare
 actor_id uuid:=auth.uid(); nick text; room_id text:=upper(trim(p_code)); pw text:=coalesce(p_options->>'password','');
 req uuid; title_in text; cap int; requested_kind text:=p_options->>'kind';
 valid_kinds text[]:=array['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown'];
 h ojjuda_arcade_internal.drinking_rooms%rowtype; receipt ojjuda_arcade_internal.drinking_ops%rowtype;
 rooms jsonb; me int; n int; bump boolean:=false; child_table regclass;
begin
 select p.nickname into nick from public.profiles p join auth.users u on u.id=p.id
 where p.id=actor_id and not coalesce(u.is_anonymous,false);
 if not found then raise exception 'not_signed_in'; end if;
 if public.is_banned(actor_id) then raise exception 'banned'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('code',v.code,'title',v.title,'players',cardinality(v.members),
   'capacity',v.capacity,'host',v.names[1],'phase',v.phase,'kind',v.kind,'mine',v.mine) order by v.mine desc,v.expires_at desc),'[]')
  into rooms from (select d.*,d.members @> array[actor_id] as mine from ojjuda_arcade_internal.drinking_rooms d
   where d.expires_at>now() and (d.members @> array[actor_id] or (d.phase='lobby' and cardinality(d.members)<d.capacity
    and not exists(select 1 from unnest(d.members) m where public.blocked_between(actor_id,m))))
   order by mine desc,d.expires_at desc limit 100) v;
  return jsonb_build_object('rooms',rooms);
 elsif p_action='mine' then
  select * into h from ojjuda_arcade_internal.drinking_rooms d where d.members @> array[actor_id] and d.expires_at>now() limit 1;
  return jsonb_build_object('room',case when found then ojjuda_arcade_internal.drinking_snapshot(h,actor_id) end);
 elsif p_action='state' then
  select * into h from ojjuda_arcade_internal.drinking_rooms d where d.code=room_id and d.expires_at>now();
  if not found then raise exception 'room_unavailable'; end if;
  if not(h.members @> array[actor_id]) then raise exception 'not_room_member'; end if;
  return ojjuda_arcade_internal.drinking_snapshot(h,actor_id);
 end if;
 if p_action is null or p_action not in ('create','join','select','start','return','leave') then raise exception 'invalid_action'; end if;

 -- Same-account retries, joins into different rooms, and receipts for closed rooms serialize.
 perform pg_advisory_xact_lock(hashtextextended(actor_id::text,837));
 if p_action<>'join' then
  req:=(p_options->>'request_id')::uuid;
  if req is null then raise exception 'invalid_request'; end if;
  select * into receipt from ojjuda_arcade_internal.drinking_ops o where o.actor=actor_id and o.request_id=req and o.expires_at>now();
  if found then
   if receipt.action<>p_action or (p_action<>'create' and receipt.room_code is distinct from room_id) then raise exception 'invalid_request'; end if;
   if p_action='leave' then return jsonb_build_object('left',true); end if;
   select * into h from ojjuda_arcade_internal.drinking_rooms d where d.code=receipt.room_code and d.expires_at>now() and d.members @> array[actor_id];
   if not found then raise exception 'room_unavailable'; end if;
   return ojjuda_arcade_internal.drinking_snapshot(h,actor_id);
  end if;
 end if;
 if p_action='create' then
  title_in:=trim(p_options->>'title');cap:=(p_options->>'capacity')::int;
  if title_in is null or length(title_in) not between 1 and 40 or cap is null or cap not between 2 and 12 then raise exception 'invalid_title'; end if;
  if length(pw) not between 4 and 32 or octet_length(pw)>72 then raise exception 'invalid_password'; end if;
  if requested_kind is not null and not(requested_kind=any(valid_kinds)) then raise exception 'invalid_game'; end if;
  delete from ojjuda_arcade_internal.drinking_rooms where expires_at<=now();
  delete from ojjuda_arcade_internal.drinking_ops where expires_at<=now();
  delete from ojjuda_arcade_internal.drinking_attempts where since<now()-interval '10 minutes';
  if exists(select 1 from ojjuda_arcade_internal.drinking_rooms where members @> array[actor_id]) then raise exception 'room_in_progress'; end if;
  loop
   insert into ojjuda_arcade_internal.drinking_rooms(code,title,password_hash,capacity,creator,request_id,members,names,kind)
    values(upper(encode(extensions.gen_random_bytes(3),'hex')),title_in,extensions.crypt(pw,extensions.gen_salt('bf',8)),
           cap,actor_id,req,array[actor_id],array[nick],requested_kind)
   on conflict(code) do nothing returning * into h;
   exit when found;
  end loop;
 else
  select * into h from ojjuda_arcade_internal.drinking_rooms d where d.code=room_id and d.expires_at>now() for update;
  if not found then raise exception 'room_unavailable'; end if;
  me:=array_position(h.members,actor_id)-1;
  n:=cardinality(h.members);
  if p_action='join' then
   if me is not null then return ojjuda_arcade_internal.drinking_snapshot(h,actor_id); end if;
   if exists(select 1 from unnest(h.members) m where public.blocked_between(actor_id,m)) then raise exception 'room_unavailable'; end if;
   if h.phase<>'lobby' or n>=h.capacity then raise exception 'room_full'; end if;
   if exists(select 1 from ojjuda_arcade_internal.drinking_rooms d where d.members @> array[actor_id] and d.expires_at>now()) then raise exception 'room_in_progress'; end if;
   if exists(select 1 from ojjuda_arcade_internal.drinking_attempts a where a.actor=actor_id and a.attempts>=10 and a.since>now()-interval '1 minute')
   then return jsonb_build_object('error','join_rate_limit'); end if;
   if length(pw) not between 4 and 32 or octet_length(pw)>72 or extensions.crypt(pw,h.password_hash)<>h.password_hash then
    insert into ojjuda_arcade_internal.drinking_attempts as a values(actor_id,now(),1) on conflict(actor) do update
     set attempts=case when a.since>now()-interval '1 minute' then a.attempts+1 else 1 end,
         since=case when a.since>now()-interval '1 minute' then a.since else now() end;
    return jsonb_build_object('error','wrong_password');
   end if;
   delete from ojjuda_arcade_internal.drinking_attempts where actor=actor_id;
   update ojjuda_arcade_internal.drinking_rooms set members=array_append(members,actor_id),names=array_append(names,nick) where code=h.code;
   bump:=true;
  else
   if me is null then raise exception 'not_room_member'; end if;
   if p_action<>'leave' and me<>0 then raise exception 'host_only'; end if;
   if (p_options->>'revision')::int is distinct from h.revision then raise exception 'stale_state'; end if;
   if p_action in ('select','start') then
    if h.phase<>'lobby' then raise exception 'unavailable'; end if;
    if p_action='start' then requested_kind:=coalesce(requested_kind,h.kind); end if;
    if requested_kind is null or not(requested_kind=any(valid_kinds)) then raise exception 'invalid_game'; end if;
    if p_action='select' then
     update ojjuda_arcade_internal.drinking_rooms set kind=requested_kind where code=h.code;
    else perform ojjuda_arcade_internal.drinking_start_child(h,requested_kind);
    end if;
   elsif p_action='return' or p_action='leave' then
    if p_action='return' and h.phase<>'playing' then raise exception 'unavailable'; end if;
    if h.child is not null then
     child_table:=ojjuda_arcade_internal.drinking_child_table(h.kind);
     execute format('delete from %s where code=$1 and drinking_code=$2',child_table) using h.child,h.code;
    end if;
    if p_action='leave' and me=0 then
     delete from ojjuda_arcade_internal.drinking_rooms where code=h.code;
    elsif p_action='leave' then
     update ojjuda_arcade_internal.drinking_rooms set phase='lobby',child=null,members=array_remove(members,actor_id),
      names=h.names[1:me]||h.names[me+2:n] where code=h.code;
    else update ojjuda_arcade_internal.drinking_rooms set phase='lobby',child=null where code=h.code;
    end if;
   end if;
   bump:=true;
  end if;
 end if;
 if p_action<>'join' then
  insert into ojjuda_arcade_internal.drinking_ops(actor,request_id,room_code,action) values(actor_id,req,h.code,p_action);
 end if;
 if bump then
  update ojjuda_arcade_internal.drinking_rooms set revision=revision+1,expires_at=now()+interval '1 day'
   where code=h.code returning * into h;
 end if;
 if p_action='leave' then return jsonb_build_object('left',true); end if;
 return ojjuda_arcade_internal.drinking_snapshot(h,actor_id);
end;
$drinking$;
create function public.drinking_room(p_action text,p_code text default '',p_options jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select ojjuda_arcade_internal.drinking_room(p_action,p_code,p_options);
$$;
revoke all on function public.drinking_room(text,text,jsonb),ojjuda_arcade_internal.drinking_room(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.drinking_room(text,text,jsonb),ojjuda_arcade_internal.drinking_room(text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
-- The multiplayer lobby lists general games. Drinking rooms have their own member-aware list.
create function public.arcade_general_extra_rooms()
returns jsonb language sql stable security invoker set search_path=pg_catalog as $general$
 select jsonb_build_object('ok',true,'rooms',
  coalesce(ojjuda_poker_internal.arcade_rooms()->'rooms','[]'::jsonb)
  ||coalesce(ojjuda_bang_internal.arcade_rooms()->'rooms','[]'::jsonb)
  ||coalesce(ojjuda_roulette_internal.arcade_rooms()->'rooms','[]'::jsonb));
$general$;
revoke all on function public.arcade_general_extra_rooms() from public,anon;
grant execute on function public.arcade_general_extra_rooms() to authenticated;
