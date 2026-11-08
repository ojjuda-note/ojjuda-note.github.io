-- Stage 62 now contains ten hard-tier differences. Keep all other stages unchanged.
do $spot62_ten$
declare
  definition text;
  updated text;
begin
  definition:=pg_get_functiondef('ojjuda_shop_internal.spot_game_buy_v2(text,uuid,integer,integer,boolean)'::regprocedure);
  if definition is null or position('p_stage between 63 and 152 then 9 else 5 end' in definition)=0 then
    raise exception 'Expected original stage 63–152 hint limit not found; refuse to modify function';
  end if;
  updated:=replace(definition,'p_stage between 63 and 152 then 9 else 5 end','p_stage between 62 and 152 then 9 else 5 end');
  execute updated;
end;
$spot62_ten$;
