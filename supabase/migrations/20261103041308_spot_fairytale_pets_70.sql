-- Add 70 fairytale / cat / dog puzzles with stable IDs 83–152.
-- All new puzzles have ten answers; "slightly-hard" is a display tier.
-- Existing IDs, caller checks, prices, receipts, rankings, RLS and grants stay intact.
begin;
set local lock_timeout='5s';

alter table ojjuda_guest_internal.spot_clears
 drop constraint spot_clears_stage_check,
 add constraint spot_clears_stage_check check(stage between 1 and 152);

do $stages$
declare
 signature text;
 definition text;
 updated text;
 old_stage_boundary constant text := 'p_stage not between 1 and 82';
 old_hint_boundary constant text := 'p_stage between 63 and 82 then 9 else 5 end';
begin
 foreach signature in array array[
  'ojjuda_guest_internal.record_spot_clear(integer,text)',
  'ojjuda_shop_internal.spot_game_buy_v2(text,uuid,integer,integer,boolean)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if length(definition)-length(replace(definition,old_stage_boundary,'')) <> length(old_stage_boundary) then
   raise exception 'Expected one stage boundary missing or changed in %',signature;
  end if;
  updated:=replace(definition,old_stage_boundary,'p_stage not between 1 and 152');
  if signature='ojjuda_shop_internal.spot_game_buy_v2(text,uuid,integer,integer,boolean)' then
   if length(definition)-length(replace(definition,old_hint_boundary,'')) <> length(old_hint_boundary) then
    raise exception 'Expected one ten-answer boundary missing or changed in %',signature;
   end if;
   updated:=replace(updated,old_hint_boundary,'p_stage between 63 and 152 then 9 else 5 end');
  end if;
  execute updated;
 end loop;
end;$stages$;

commit;
