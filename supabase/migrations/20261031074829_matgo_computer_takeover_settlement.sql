-- Continue the original multiplayer deal under AI, settling both gains and
-- losses to its original wallets. Only the assisted seat loses rank eligibility.
alter table ojjuda_matgo_internal.rooms
 add column rank_excluded boolean[] not null default array[false,false];

create function ojjuda_matgo_internal.mark_computer_round()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.round_no is distinct from old.round_no then
  new.rank_excluded:=array[false,false];
 elsif old.status='active' then
  new.rank_excluded:=array[
   coalesce(old.rank_excluded[1],false) or coalesce(new.rank_excluded[1],false) or new.bots[1]
    or (new.auto_count>old.auto_count and new.last_auto->>'p'='0'),
   coalesce(old.rank_excluded[2],false) or coalesce(new.rank_excluded[2],false) or new.bots[2]
    or (new.auto_count>old.auto_count and new.last_auto->>'p'='1')
  ];
 end if;
 return new;
end;$$;
revoke all on function ojjuda_matgo_internal.mark_computer_round() from public,anon,authenticated,service_role;
create trigger mark_computer_round before update on ojjuda_matgo_internal.rooms
 for each row execute function ojjuda_matgo_internal.mark_computer_round();

-- The Edge service finishes an all-computer deal using its original seed and
-- transcript. Never cancel that funded deal or release its wallets prematurely.
create or replace function ojjuda_matgo_internal.expire_online(p_room uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 update ojjuda_matgo_internal.rooms
 set bots=array[bots[1] or seen_host<clock_timestamp()-interval '30 seconds',bots[2] or seen_guest<clock_timestamp()-interval '30 seconds'],
  departed=array[departed[1] or seen_host<clock_timestamp()-interval '30 seconds',departed[2] or seen_guest<clock_timestamp()-interval '30 seconds'],version=version+1
 where id=p_room and status='active' and ((not bots[1] and seen_host<clock_timestamp()-interval '30 seconds') or (not bots[2] and seen_guest<clock_timestamp()-interval '30 seconds'));
 update ojjuda_matgo_internal.rooms set status='cancelled',reason='timeout',version=version+1
 where id=p_room and (
  (status='waiting' and seen_host<clock_timestamp()-interval '60 seconds') or
  (status='finished' and ready<>array[false,false] and deadline<clock_timestamp())
 );
 update ojjuda_matgo_internal.wallets set online_room=null where online_room=p_room
  and exists(select 1 from ojjuda_matgo_internal.rooms where id=p_room and status='cancelled');
end;$$;

do $matgo_settlement$
declare
 definition text:=pg_get_functiondef('ojjuda_matgo_internal.online_service_v1(uuid,text,uuid,text,text,integer,uuid,jsonb)'::regprocedure);
 original text;replacement text;
begin
 original:=$old$      if r.departed=array[true,true] then
        update ojjuda_matgo_internal.rooms set status='cancelled',reason='left',version=version+1 where id=r.id returning * into r;
        update ojjuda_matgo_internal.wallets set online_room=null where online_room=r.id;
      end if;$old$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'matgo last-departure predecessor changed';end if;
 definition:=replace(definition,original,'      -- Both seats remain locked until the same deal reaches final settlement.');
 original:=$old$        -- A departed player never receives winnings. Losses still settle at the end.
        v_paid:=array[case when r.departed[1] and v_transfer>0 then 0 else v_transfer end,case when r.departed[2] and v_transfer<0 then 0 else -v_transfer end];$old$;
 replacement:=$new$        -- Leaving changes control and ranking, never ownership of final gold.
        v_paid:=array[v_transfer,-v_transfer];$new$;
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'matgo gold-settlement predecessor changed';end if;
 definition:=replace(definition,original,replacement);
 execute definition;
end;$matgo_settlement$;

do $matgo_ranking$
declare
 definition text:=pg_get_functiondef('ojjuda_game_internal.capture_ranked_round()'::regprocedure);
 original text:='for n in 1..2 loop';
begin
 if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then raise exception 'matgo ranking predecessor changed';end if;
 definition:=replace(definition,original,original||E'\n    if new.rank_excluded[n] then continue;end if;');
 execute definition;
end;$matgo_ranking$;
