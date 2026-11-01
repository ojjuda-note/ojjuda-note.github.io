-- Add twenty masterpiece stages (63–82), each with ten differences.
-- Existing stages keep six differences; prices, receipts, monthly capture,
-- caller checks and grants remain the existing function definitions.
begin;
set local lock_timeout='5s';

alter table ojjuda_guest_internal.spot_clears
 drop constraint spot_clears_stage_check,
 add constraint spot_clears_stage_check check(stage between 1 and 82);

do $stages$
declare signature text; definition text; updated text;
begin
 foreach signature in array array[
  'ojjuda_guest_internal.record_spot_clear(integer,text)',
  'ojjuda_shop_internal.spot_game_buy_v2(text,uuid,integer,integer,boolean)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('p_stage not between 1 and 62' in definition)=0 then
   raise exception 'Expected stage boundary missing in %',signature;
  end if;
  updated:=replace(definition,'p_stage not between 1 and 62','p_stage not between 1 and 82');
  if signature='ojjuda_shop_internal.spot_game_buy_v2(text,uuid,integer,integer,boolean)' then
   if position('p_spot not between 0 and 5' in definition)=0 then
    raise exception 'Expected hint boundary missing in %',signature;
   end if;
   updated:=replace(updated,'p_spot not between 0 and 5',
    'p_spot not between 0 and (case when p_stage between 63 and 82 then 9 else 5 end)');
  end if;
  execute updated;
 end loop;
end;$stages$;

commit;
