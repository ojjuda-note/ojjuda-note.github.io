-- Poker and Matgo use member_identity.birth_date evaluated on Korea's calendar date.
-- This private set helper only feeds room membership checks; no ages or identities are exposed.
create function ojjuda_arcade_internal.drinking_adult_members(ids uuid[])
returns uuid[] language sql stable security invoker set search_path='' as $adult$
 select coalesce(array_agg(m.id order by m.ord),'{}'::uuid[])
 from unnest(ids) with ordinality m(id,ord)
 join auth.users u on u.id=m.id and not coalesce(u.is_anonymous,false)
 join public.profiles p on p.id=m.id
 join ojjuda_account_internal.member_identity i on i.user_id=m.id
 where ojjuda_account_internal.age_on(i.birth_date,(statement_timestamp() at time zone 'Asia/Seoul')::date)>=19;
$adult$;
revoke all on function ojjuda_arcade_internal.drinking_adult_members(uuid[]) from public,anon,authenticated;

-- A member may repair their own pre-existing group. Recheck eligibility under a row lock;
-- preserve adult seat order, room code, password and capacity. No global cleanup or scans.
create function ojjuda_arcade_internal.drinking_restore_parent(room_id text)
returns ojjuda_arcade_internal.drinking_rooms language plpgsql volatile security invoker set search_path='' as $restore$
declare
 h ojjuda_arcade_internal.drinking_rooms%rowtype;
 keep uuid[]; kept_names text[];
begin
 select * into h from ojjuda_arcade_internal.drinking_rooms
  where code=room_id and expires_at>now() and members @> array[auth.uid()] for update;
 if not found then raise exception 'room_unavailable'; end if;
 keep:=ojjuda_arcade_internal.drinking_adult_members(h.members);
 if not(auth.uid()=any(keep)) then raise exception 'adult_required'; end if;
 if keep=h.members then return h; end if;
 select array_agg(h.names[array_position(h.members,m)] order by pos) into kept_names from unnest(keep) with ordinality a(m,pos);
 if h.child is not null then
  execute format('delete from %s where code=$1 and drinking_code=$2',ojjuda_arcade_internal.drinking_child_table(h.kind))
   using h.child,h.code;
 end if;
 update ojjuda_arcade_internal.drinking_rooms set members=keep,names=kept_names,creator=keep[1],
  request_id=case when creator=keep[1] then request_id else gen_random_uuid() end,
  phase='lobby',child=null,revision=revision+1,expires_at=now()+interval '1 day'
  where code=room_id returning * into h;
 return h;
end;
$restore$;
revoke all on function ojjuda_arcade_internal.drinking_restore_parent(text) from public,anon,authenticated;

create function ojjuda_arcade_internal.drinking_restore_standalone(kind text,room_id text)
returns void language plpgsql volatile security invoker set search_path='' as $restore$
declare
 room_table regclass:=ojjuda_arcade_internal.drinking_child_table(kind);
 members_before uuid[]; names_before text[]; keep uuid[]; kept_names text[]; reset_state text;
begin
 execute format('select members,names from %s where code=$1 and drinking_code is null and expires_at>now() and members @> array[$2] for update',room_table)
  into members_before,names_before using room_id,auth.uid();
 if members_before is null then raise exception 'room_unavailable'; end if;
 keep:=ojjuda_arcade_internal.drinking_adult_members(members_before);
 if not(auth.uid()=any(keep)) then raise exception 'adult_required'; end if;
 if keep=members_before then return; end if;
 select array_agg(names_before[array_position(members_before,m)] order by pos) into kept_names from unnest(keep) with ordinality a(m,pos);
 reset_state:=case kind
  when 'croc' then 'turn=0,pressed=''{}'',loser=null,trap=floor(random()*24)::int'
  when 'king' then 'cards=''{}'',confirmed=''{}'',chosen=null,chosen_second=null,mission=null'
  when 'liar' then 'turn=0,hints=''{}'',votes=''{}'',liar_slot=null,secret_word=null'
  else 'confirmed=''{}'',votes=''{}'',odd_slot=null,pair=''{}'',game_state=''{}'',last_ops=''{}''' end;
 execute format('update %s set members=$2,names=$3,creator=$2[1],request_id=case when creator=$2[1] then request_id else gen_random_uuid() end,
  phase=''waiting'',round=round+1,revision=revision+1,expires_at=now()+interval ''1 day'',%s where code=$1 and drinking_code is null',room_table,reset_state)
 using room_id,keep,kept_names;
end;
$restore$;
revoke all on function ojjuda_arcade_internal.drinking_restore_standalone(text,text) from public,anon,authenticated;

do $guards$
declare
 f record; definition text; guard text; room_table text; game_expr text;
 parent_proc regprocedure:='ojjuda_arcade_internal.drinking_room(text,text,jsonb)'::regprocedure;
 start_proc regprocedure:='ojjuda_arcade_internal.drinking_start_child(ojjuda_arcade_internal.drinking_rooms,text)'::regprocedure;
begin
 for f in select * from (values
  ('croc','public.croc_multiplayer(text,text,jsonb)'::regprocedure,'414c56101350040945af624059a698b7'),
  ('liar','public.liar_multiplayer(text,text,jsonb)'::regprocedure,'dd1129f18d639d27a306ce4475c97292'),
  ('king','public.king_multiplayer(text,text,jsonb)'::regprocedure,'24e291aa4eb21c46e0e766c4a9b19718'),
  ('party_vote','ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure,'31bb39d06e21a165692db79b3d989139')
 ) as d(kind,proc,original_hash) loop
  if (select md5(prosrc) from pg_proc where oid=f.proc)<>f.original_hash then raise exception 'game definition changed: %',f.proc; end if;
  definition:=pg_get_functiondef(f.proc);
  room_table:='ojjuda_arcade_internal.'||f.kind||'_rooms';
  game_expr:=case when f.kind='party_vote' then 'r.kind' else quote_literal(f.kind) end;
  definition:=replace(definition,' if p_action=''list'' then',E' perform ojjuda_poker_internal.check_member(actor);\n if p_action=''list'' then');
  definition:=replace(definition,'c where c.drinking_code is null and ',
   'c where c.drinking_code is null and (actor=any(c.members) or c.members=ojjuda_arcade_internal.drinking_adult_members(c.members)) and ');
  guard:=$child$
 if r.members<>ojjuda_arcade_internal.drinking_adult_members(r.members) then
  if not(actor=any(r.members)) then raise exception 'room_unavailable'; end if;
  if r.drinking_code is not null then raise exception 'member_unavailable'; end if;
  perform ojjuda_arcade_internal.drinking_restore_standalone(GAME_KIND,r.code);
  select * into strict r from ROOM_TABLE where code=r.code;
  p_action:='state';
 end if;
$child$;
  guard:=replace(replace(guard,'GAME_KIND',game_expr),'ROOM_TABLE',room_table);
  -- Match only the first row read, not the timed game's re-read under its row lock.
  definition:=replace(definition,E'\n me:=array_position(r.members,actor)-1;',guard||E'\n me:=array_position(r.members,actor)-1;');
  execute definition;
 end loop;

 if (select md5(prosrc) from pg_proc where oid=parent_proc)<>'7b2d1219ba5538699dcf95d2d1acfc4c'
 or (select md5(prosrc) from pg_proc where oid=start_proc)<>'18f6e29ec2824c9415c0ad4f2f98b125' then raise exception 'drinking room definition changed'; end if;
 definition:=pg_get_functiondef(parent_proc);
 definition:=replace(definition,' if p_action=''list'' then',E' perform ojjuda_poker_internal.check_member(actor_id);\n if p_action=''list'' then');
 definition:=replace(definition,'(d.phase=''lobby'' and cardinality(d.members)<d.capacity',
  '(d.phase=''lobby'' and d.members=ojjuda_arcade_internal.drinking_adult_members(d.members) and cardinality(d.members)<d.capacity');
 definition:=replace(definition,'  return jsonb_build_object(''room'',case when found then ojjuda_arcade_internal.drinking_snapshot(h,actor_id) end);',
 $mine$  if not found then return jsonb_build_object('room',null); end if;
  if h.members<>ojjuda_arcade_internal.drinking_adult_members(h.members) then
   h:=ojjuda_arcade_internal.drinking_restore_parent(h.code);
  end if;
  return jsonb_build_object('room',ojjuda_arcade_internal.drinking_snapshot(h,actor_id));$mine$);
 definition:=replace(definition,'return ojjuda_arcade_internal.drinking_snapshot(h,actor_id);',
 $snap$if h.members<>ojjuda_arcade_internal.drinking_adult_members(h.members) then h:=ojjuda_arcade_internal.drinking_restore_parent(h.code); end if;
  return ojjuda_arcade_internal.drinking_snapshot(h,actor_id);$snap$);
 definition:=replace(definition,'  me:=array_position(h.members,actor_id)-1;',
 $mutation$  if h.members<>ojjuda_arcade_internal.drinking_adult_members(h.members) then
   if not(actor_id=any(h.members)) then raise exception 'room_unavailable'; end if;
   h:=ojjuda_arcade_internal.drinking_restore_parent(h.code);
   -- Removing inactive seats may promote the caller. Let the client explicitly confirm
   -- leaving their newly hosted room instead of converting the old guest action to a close.
   return ojjuda_arcade_internal.drinking_snapshot(h,actor_id);
  end if;
  me:=array_position(h.members,actor_id)-1;$mutation$);
 execute definition;
 definition:=pg_get_functiondef(start_proc);
 definition:=replace(definition,' if n<(case when game',E' if h.members<>ojjuda_arcade_internal.drinking_adult_members(h.members) then raise exception ''member_unavailable''; end if;\n if n<(case when game');
 execute definition;
end;
$guards$;

-- Old clients still call the original arcade feed. Use the ordinary game providers there too.
create or replace function public.arcade_extra_rooms() returns jsonb
language sql stable security invoker set search_path='' as $$
 select public.arcade_general_extra_rooms();
$$;
notify pgrst,'reload schema';
