-- Keep this round's seat numbers stable until the next round or lobby begins.
create function ojjuda_arcade_internal.drinking_result_seat(kind text, state jsonb, n int)
returns int language plpgsql immutable security invoker set search_path='' as $$
declare
 g jsonb:=state->'game_state'; seats int[]; picks int[]; cards int[]; a int; b int;
begin
 case kind
 when 'croc' then seats:=array[(state->>'loser')::int];
 when 'bomb' then seats:=array[(g->>'loser')::int];
 when 'bottle','updown','secretcount','initial' then seats:=array[(g->>'winner')::int];
 when 'liar' then seats:=array[(state->>'liar_slot')::int];
 when 'mission' then seats:=array[(state->>'odd_slot')::int];
 when 'king' then
  select array_agg(v::int order by i) into cards from jsonb_array_elements_text(state->'cards') with ordinality e(v,i);
  seats:=array[array_position(cards,(state->>'chosen')::int)-1,array_position(cards,(state->>'chosen_second')::int)-1];
 when 'fingers','imagevote' then
  select array_agg(v::int) into seats from jsonb_array_elements_text(g->(case when kind='fingers' then 'losers' else 'winners' end)) e(v);
 when 'stopwatch' then
  select array_agg(seat) into seats from (
   select (i-1)::int seat, dense_rank() over(order by abs(v::int-(g->>'target')::int*10)) ranking
   from jsonb_array_elements_text(g->'scores') with ordinality e(v,i) where v is not null
  ) ranked where ranking=1;
 when 'minority' then
  select array_agg(v::int order by i),count(*) filter(where v='0'),count(*) filter(where v='1') into picks,a,b
   from jsonb_array_elements_text(state->'votes') with ordinality e(v,i);
  if a>0 and b>0 and a<>b then
   select array_agg(i-1) into seats from generate_subscripts(picks,1) i where picks[i]=case when a<b then 0 else 1 end;
  end if;
 when 'truth' then null;
 else raise exception 'invalid_game';
 end case;
 -- Tied winners take precedence in table order starting after the last host.
 return coalesce((select seat from unnest(seats) seat where seat between 0 and n-1
   order by (seat+n-1)%n limit 1),case when n>1 then 1 else 0 end);
end;
$$;
revoke all on function ojjuda_arcade_internal.drinking_result_seat(text,jsonb,int) from public,anon,authenticated;

create function ojjuda_arcade_internal.drinking_finish_host() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.phase='done' and old.phase<>'done' then
  new.result_host:=ojjuda_arcade_internal.drinking_result_seat(coalesce(to_jsonb(new)->>'kind',tg_argv[0]),to_jsonb(new),cardinality(new.members));
 elsif new.phase<>'done' then
  new.result_host:=null;
  if old.phase='done' and new.members is distinct from old.members then
   new.creator:=new.members[1];
   new.request_id:=gen_random_uuid();
  end if;
 end if;
 return new;
end;
$$;
revoke all on function ojjuda_arcade_internal.drinking_finish_host() from public,anon,authenticated;

do $engines$
declare
 e record; def text; guard text;
 -- Reorder in memory only for the two actions that discard this result.
 -- The engine's row lock, optimistic checks and atomic UPDATE remain authoritative.
 rotation text:=$change$
 if r.drinking_code is null and r.phase='done' and coalesce(r.result_host,0)>0 and p_action in ('again','leave') then
  declare k int:=r.result_host+1;
  begin
   r.members:=array[r.members[k]]||r.members[1:k-1]||r.members[k+1:cardinality(r.members)];
   r.names:=array[r.names[k]]||r.names[1:k-1]||r.names[k+1:cardinality(r.names)];
   me:=array_position(r.members,actor)-1;
   RESET_OPS
  end;
 end if;
$change$;
begin
 for e in select * from (values
  ('croc','croc_rooms','public.croc_multiplayer(text,text,jsonb)'::regprocedure),
  ('liar','liar_rooms','public.liar_multiplayer(text,text,jsonb)'::regprocedure),
  ('king','king_rooms','public.king_multiplayer(text,text,jsonb)'::regprocedure),
  ('party_vote','party_vote_rooms','ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure)
 ) engines(kind,tbl,fn) loop
  execute format('alter table ojjuda_arcade_internal.%I add column result_host integer',e.tbl);
  execute format('create trigger drinking_finish_host before update on ojjuda_arcade_internal.%I for each row execute function ojjuda_arcade_internal.drinking_finish_host(%L)',e.tbl,e.kind);
  -- Include finished games still open when this migration is applied.
  execute format('update ojjuda_arcade_internal.%I r set result_host=ojjuda_arcade_internal.drinking_result_seat(coalesce(to_jsonb(r)->>''kind'',%L),to_jsonb(r),cardinality(r.members)) where phase=''done''',e.tbl,e.kind);
  def:=pg_get_functiondef(e.fn);
  guard:=E' if r.drinking_code is not null then\n  select * into parent_row';
  if strpos(def,guard)=0 or strpos(def,'''code'',r.code,''title'',r.title')=0 then raise exception 'unexpected room definition %',e.fn; end if;
  def:=replace(def,guard,replace(rotation,'RESET_OPS',case when e.kind='party_vote' then 'r.last_ops:=''{}'';' else '' end)||guard);
  def:=replace(def,'''code'',r.code,''title'',r.title','''code'',r.code,''hostSeat'',coalesce(r.result_host,0),''title'',r.title');
  def:=replace(def,'actor=c.members[1]','actor=c.members[coalesce(c.result_host,0)+1]');
  execute def;
 end loop;
end;
$engines$;

-- Parent operations lock the parent before its child, just like returning to the lobby.
-- Reading the result does not mutate the roster, so final votes and names remain aligned.
create function ojjuda_arcade_internal.drinking_host_seat(h ojjuda_arcade_internal.drinking_rooms, lock_child boolean default false)
returns int language plpgsql volatile security invoker set search_path='' as $$
declare seat int;
begin
 if h.phase='playing' and h.child is not null then
  execute format('select result_host from %s where code=$1 and drinking_code=$2%s',ojjuda_arcade_internal.drinking_child_table(h.kind),
   case when lock_child then ' for update' else '' end) into seat using h.child,h.code;
 end if;
 return coalesce(seat,0);
end;
$$;
revoke all on function ojjuda_arcade_internal.drinking_host_seat(ojjuda_arcade_internal.drinking_rooms,boolean) from public,anon,authenticated;

create or replace function ojjuda_arcade_internal.drinking_snapshot(h ojjuda_arcade_internal.drinking_rooms,actor uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select jsonb_build_object('code',h.code,'title',h.title,'capacity',h.capacity,'players',h.names,
  'me',array_position(h.members,actor)-1,'hostSeat',ojjuda_arcade_internal.drinking_host_seat(h),
  'phase',h.phase,'kind',h.kind,'child',h.child,'round',h.round,'revision',h.revision);
$$;

do $parent$
declare fn regprocedure:='ojjuda_arcade_internal.drinking_room(text,text,jsonb)'::regprocedure;
 def text:=pg_get_functiondef(fn);
 anchor text:='   if p_action<>''leave'' and me<>0 then';
begin
 if strpos(def,anchor)=0 then raise exception 'unexpected parent definition'; end if;
 def:=replace(def,anchor,$host$   if h.phase='playing' and p_action in ('return','leave') then
    declare k int:=ojjuda_arcade_internal.drinking_host_seat(h,true)+1;
    begin
     if k>1 then
      h.members:=array[h.members[k]]||h.members[1:k-1]||h.members[k+1:n];
      h.names:=array[h.names[k]]||h.names[1:k-1]||h.names[k+1:n];
      me:=array_position(h.members,actor_id)-1;
      update ojjuda_arcade_internal.drinking_rooms set creator=h.members[1],members=h.members,names=h.names,request_id=gen_random_uuid() where code=h.code;
     end if;
    end;
   end if;
$host$||anchor);
 def:=replace(def,'v.names[1]', 'v.names[v.host_seat+1]');
 def:=replace(def,'from (select d.*,d.members','from (select d.*,ojjuda_arcade_internal.drinking_host_seat(d) as host_seat,d.members');
 execute def;
end;
$parent$;
