create table ojjuda_arcade_internal.liar_rooms (
 code text primary key, title text not null, password_hash text not null, capacity smallint not null check (capacity between 3 and 12),
 creator uuid not null, request_id uuid not null, unique(creator,request_id),
 members uuid[] not null, names text[] not null, phase text not null default 'waiting',
 turn int not null default 0, hints text[] not null default '{}', votes int[] not null default '{}',
 liar_slot int, secret_word text, round int not null default 1, revision int not null default 1,
 expires_at timestamptz not null default now()+interval '1 day'
);
create table ojjuda_arcade_internal.liar_attempts (
 actor uuid primary key, since timestamptz not null, attempts int not null
);
revoke all on ojjuda_arcade_internal.liar_attempts from public,anon,authenticated;
alter table ojjuda_arcade_internal.liar_attempts enable row level security;
create index liar_expiry on ojjuda_arcade_internal.liar_rooms(expires_at);
revoke all on ojjuda_arcade_internal.liar_rooms from public,anon,authenticated;
alter table ojjuda_arcade_internal.liar_rooms enable row level security;

create function public.liar_multiplayer(p_action text,p_code text default '',p_options jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); nick text; r ojjuda_arcade_internal.liar_rooms%rowtype;
 pw text:=coalesce(p_options->>'password',''); title_in text; cap int; req uuid;
 me int; target_slot int; hint text; rooms jsonb; changed boolean:=false;
 deal boolean:=false; totals int[]; ballot int;
 word_bank text[]:=array['팝콘','회전목마','수박','붕어빵','선풍기','볼링장','공항','우산','해파리','눈사람','편의점','잠수함','소풍','캠프파이어','횡단보도','만두','찜질방','기차역','손전등','낚싯대','솜사탕','망원경','비눗방울','놀이공원'];
begin
 select p.nickname into nick from public.profiles p join auth.users u on u.id=p.id
 where p.id=actor and not coalesce(u.is_anonymous,false);
 if not found then raise exception 'not_signed_in'; end if;
 if public.is_banned(actor) then raise exception 'banned'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(item order by mine desc,expiry desc),'[]') into rooms from (
   select actor=any(c.members) mine,c.expires_at expiry,jsonb_build_object(
    'room_no','L-'||c.code,'kind','liar','native',true,'title',c.title,
    'status',case when c.phase='waiting' then 'waiting' else 'playing' end,'host_name',c.names[1],
    'players',cardinality(c.members),'capacity',c.capacity,'is_host',actor=c.members[1],
    'is_member',actor=any(c.members),'match_id',c.code,'code',c.code) item
   from ojjuda_arcade_internal.liar_rooms c where c.expires_at>now()
    and (c.phase='waiting' or actor=any(c.members))
    and (actor=any(c.members) or not exists(select 1 from unnest(c.members) m where public.blocked_between(actor,m)))
   order by mine desc,expiry desc limit 100) listed;
  return jsonb_build_object('rooms',rooms);
 end if;
 if p_action in ('create','join') then perform pg_advisory_xact_lock(hashtextextended(actor::text,834)); end if;
 if p_action='create' then
  req:=(p_options->>'request_id')::uuid; cap:=(p_options->>'capacity')::int; title_in:=trim(p_options->>'title');
  if req is null or cap is null or cap not between 3 and 12 or title_in is null or length(title_in) not between 1 and 40 then raise exception 'invalid_title'; end if;
  if length(pw) not between 4 and 32 or octet_length(pw)>72 then raise exception 'invalid_password'; end if;
  delete from ojjuda_arcade_internal.liar_rooms where expires_at<=now();
  delete from ojjuda_arcade_internal.liar_attempts where since<now()-interval '10 minutes';
  select * into r from ojjuda_arcade_internal.liar_rooms where creator=actor and request_id=req for update;
  if not found then
   if exists(select 1 from ojjuda_arcade_internal.liar_rooms where actor=any(members)) then raise exception 'room_in_progress'; end if;
   loop
    insert into ojjuda_arcade_internal.liar_rooms(code,title,password_hash,capacity,creator,request_id,members,names)
    values(upper(encode(extensions.gen_random_bytes(3),'hex')),title_in,extensions.crypt(pw,extensions.gen_salt('bf',8)),cap,actor,req,array[actor],array[nick])
    on conflict(code) do nothing returning * into r;
    exit when found;
   end loop;
  end if;
 elsif p_action='state' then
  select * into r from ojjuda_arcade_internal.liar_rooms where code=upper(p_code) and expires_at>now();
  if not found then raise exception 'room_unavailable'; end if;
 else
  select * into r from ojjuda_arcade_internal.liar_rooms where code=upper(p_code) and expires_at>now() for update;
  if not found then raise exception 'room_unavailable'; end if;
 end if;
 me:=array_position(r.members,actor)-1;
 if p_action='join' and me is null then
  if exists(select 1 from unnest(r.members) m where public.blocked_between(actor,m)) then raise exception 'room_unavailable'; end if;
  if r.phase<>'waiting' or cardinality(r.members)>=r.capacity then raise exception 'room_full'; end if;
  if exists(select 1 from ojjuda_arcade_internal.liar_rooms where actor=any(members) and expires_at>now()) then raise exception 'room_in_progress'; end if;
  if exists(select 1 from ojjuda_arcade_internal.liar_attempts c where c.actor=auth.uid() and c.attempts>=10 and c.since>now()-interval '1 minute') then
   return jsonb_build_object('error','join_rate_limit');
  end if;
  if length(pw) not between 4 and 32 or octet_length(pw)>72 or extensions.crypt(pw,r.password_hash)<>r.password_hash then
   insert into ojjuda_arcade_internal.liar_attempts as c values(actor,now(),1)
    on conflict on constraint liar_attempts_pkey do update set
    attempts=case when c.since>now()-interval '1 minute' then c.attempts+1 else 1 end,
    since=case when c.since>now()-interval '1 minute' then c.since else now() end;
   return jsonb_build_object('error','wrong_password');
  end if;
  delete from ojjuda_arcade_internal.liar_attempts c where c.actor=auth.uid();
  changed:=true; r.members:=array_append(r.members,actor); r.names:=array_append(r.names,nick); me:=cardinality(r.members)-1;
  deal:=cardinality(r.members)=r.capacity;
 elsif me is null then raise exception 'not_room_member';
 elsif p_action in ('create','join','state') then null;
 elsif p_action in ('leave','cancel') then
  if p_action='cancel' and (me<>0 or r.phase<>'waiting') then raise exception 'room_already_started'; end if;
  if me=0 or r.phase<>'waiting' then
   delete from ojjuda_arcade_internal.liar_rooms where code=r.code;
   return jsonb_build_object('left',true);
  end if;
  changed:=true; r.members:=array_remove(r.members,actor); r.names:=r.names[1:me]||r.names[me+2:cardinality(r.names)];

 elsif p_action in ('hint','vote','again') then
  if (p_options->>'round')::int is distinct from r.round then raise exception 'stale_round'; end if;
  if p_action='again' then
   if me<>0 or r.phase<>'done' then raise exception 'unavailable'; end if;
   r.round:=r.round+1; deal:=true;
  elsif p_action='hint' then
   hint:=btrim(p_options->>'hint');
   if hint is null or length(hint) not between 1 and 80 then raise exception 'invalid_hint'; end if;
   if r.hints[me+1]=hint then null; -- An acknowledged or retried submission.
   elsif r.phase<>'hints' or me<>r.turn then raise exception 'not_your_turn';
   else
    r.hints:=array_append(r.hints,hint); r.turn:=r.turn+1; changed:=true;
    if r.turn=r.capacity then r.phase:='voting'; end if;
   end if;
  else
   target_slot:=(p_options->>'target')::int;
   if target_slot is null or target_slot not between 0 and r.capacity-1 or target_slot=me then raise exception 'invalid_vote'; end if;
   if r.votes[me+1]=target_slot then null;
   elsif r.phase<>'voting' or r.votes[me+1]<>-1 then raise exception 'vote_closed';
   else
    r.votes[me+1]:=target_slot; changed:=true;
    if not (-1=any(r.votes)) then r.phase:='done'; end if;
   end if;
  end if;
 else raise exception 'invalid_action';
 end if;
 if deal then
  r.liar_slot:=floor(random()*r.capacity)::int;
  select word into r.secret_word from unnest(word_bank) word
   where word is distinct from r.secret_word order by random() limit 1;
  r.turn:=0; r.phase:='hints'; r.hints:='{}'; r.votes:=array_fill(-1,array[r.capacity::int]); changed:=true;
 end if;
 if changed then
  update ojjuda_arcade_internal.liar_rooms set members=r.members,names=r.names,phase=r.phase,turn=r.turn,hints=r.hints,votes=r.votes,
   liar_slot=r.liar_slot,secret_word=r.secret_word,round=r.round,revision=revision+1,expires_at=now()+interval '1 day'
   where code=r.code returning * into r;
 end if;
 if p_action='leave' then return jsonb_build_object('left',true); end if;
 if r.phase='done' then
  totals:=array_fill(0,array[r.capacity::int]);
  foreach ballot in array r.votes loop totals[ballot+1]:=totals[ballot+1]+1; end loop;
 end if;
 return jsonb_strip_nulls(jsonb_build_object('code',r.code,'title',r.title,'capacity',r.capacity,'players',r.names,
  'phase',r.phase,'me',me,'turn',r.turn,'revision',r.revision,'round',r.round,'hints',r.hints,
  'role',case when r.phase<>'waiting' then case when me=r.liar_slot then 'liar' else 'citizen' end end,
  'word',case when r.phase='done' or me<>r.liar_slot then r.secret_word end,
  'voted',coalesce(r.votes[me+1]>=0,false),'voteCount',cardinality(array_remove(r.votes,-1)),
  'liar',case when r.phase='done' then r.liar_slot end,'totals',totals));
end;
$$;
revoke all on function public.liar_multiplayer(text,text,jsonb) from public,anon;
grant execute on function public.liar_multiplayer(text,text,jsonb) to authenticated;

-- Append to the existing native lobby without replacing its other game providers.
do $feed$
declare definition text:=pg_get_functiondef('public.arcade_extra_rooms()'::regprocedure);
 anchor text:=$anchor$||coalesce(public.croc_multiplayer('list')->'rooms','[]'::jsonb)$anchor$;
begin
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'arcade feed definition changed'; end if;
 execute replace(definition,anchor,anchor||$extra$||coalesce(public.liar_multiplayer('list')->'rooms','[]'::jsonb)$extra$);
end;
$feed$;
