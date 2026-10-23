-- Add ten city photographs and four seasonal mountain photographs (49–62).
-- Keep wallet prices, idempotency, caller checks and existing grants unchanged.
alter table ojjuda_guest_internal.spot_clears
 drop constraint spot_clears_stage_check,
 add constraint spot_clears_stage_check check(stage between 1 and 62);

do $stages$
declare signature text; definition text; updated text;
begin
 foreach signature in array array[
  'ojjuda_guest_internal.record_spot_clear(integer,text)',
  'ojjuda_shop_internal.spot_game_buy_v2(text,uuid,integer,integer,boolean)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,'p_stage not between 1 and 48','p_stage not between 1 and 62');
  if updated=definition then raise exception 'Expected stage boundary missing in %',signature;end if;
  execute updated;
 end loop;
end;$stages$;
