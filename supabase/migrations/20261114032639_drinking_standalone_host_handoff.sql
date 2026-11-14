-- These four engines back all thirteen direct-invite games. Managed child rooms
-- are already rejected earlier in each RPC and must use their parent to leave.
do $migration$
declare
 game record;
 definition text;
 old_branch text;
 new_branch text;
begin
 for game in select * from (values
  ('public.croc_multiplayer(text,text,jsonb)'::regprocedure,'croc_rooms',
   'turn=0,pressed=''{}'',trap=floor(random()*24)::int,loser=null'),
  ('public.liar_multiplayer(text,text,jsonb)'::regprocedure,'liar_rooms',
   'turn=0,hints=''{}'',votes=''{}'',liar_slot=null,secret_word=null'),
  ('public.king_multiplayer(text,text,jsonb)'::regprocedure,'king_rooms',
   'cards=''{}'',confirmed=''{}'',chosen=null,chosen_second=null,mission=null'),
  ('ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure,'party_vote_rooms',
   'confirmed=''{}'',votes=''{}'',odd_slot=null,pair=null,game_state=''{}'',last_ops=''{}''')
 ) as engines(fn,tbl,reset_state) loop
  definition:=pg_get_functiondef(game.fn);
  old_branch:=format($old$  if me=0 or r.phase<>'waiting' then
   delete from ojjuda_arcade_internal.%I where code=r.code;$old$,game.tbl);
  new_branch:=format($new$  if p_action='leave' and
     ((p_options ? 'round' and p_options->'round' is distinct from to_jsonb(r.round))
      or (p_options ? 'waiting' and p_options->'waiting' is distinct from to_jsonb(r.phase='waiting'))
      or (p_options ? 'host' and p_options->'host' is distinct from to_jsonb(me=0))) then
   raise exception 'stale_round';
  end if;
  if p_action='leave' and me=0 and cardinality(r.members)>1 then
   declare n int:=cardinality(r.members); successor int:=2+floor(random()*(n-1))::int;
   begin
    -- The normal action path holds this row FOR UPDATE. Move only the new host
    -- to the first seat; awaiting players retain their relative order.
    update ojjuda_arcade_internal.%I
     set members=array[r.members[successor]]||r.members[2:successor-1]||r.members[successor+1:n],
         names=array[r.names[successor]]||r.names[2:successor-1]||r.names[successor+1:n],
         creator=r.members[successor],request_id=gen_random_uuid(),phase='waiting',
         round=r.round+1,revision=r.revision+1,expires_at=now()+interval '1 day',
         %s
     where code=r.code;
   end;
   return jsonb_build_object('left',true);
  end if;
%s$new$,game.tbl,game.reset_state,old_branch);
  if strpos(definition,old_branch)=0 or strpos(definition,'raise exception ''managed_room''')=0
  then raise exception 'Unexpected direct room engine: %',game.fn; end if;
  execute replace(definition,old_branch,new_branch);
 end loop;
end;
$migration$;
