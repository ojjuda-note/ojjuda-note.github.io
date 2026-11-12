-- Extend the existing stage IDs and ten-answer hint range for the motion collection.
set local lock_timeout = '5s';

alter table ojjuda_guest_internal.spot_clears
  drop constraint spot_clears_stage_check,
  add constraint spot_clears_stage_check check (stage between 1 and 182);

do $stages$
declare
  signature text;
  original text;
  updated text;
  stage_check constant text := 'p_stage not between 1 and 152';
  hint_check constant text := 'p_stage between 62 and 152 then 9 else 5 end';
begin
  foreach signature in array array[
    'ojjuda_guest_internal.record_spot_clear(integer,text)',
    'ojjuda_shop_internal.spot_game_buy_v2(text,uuid,integer,integer,boolean)'
  ] loop
    original := pg_get_functiondef(signature::regprocedure);
    if array_length(string_to_array(original, stage_check), 1) <> 2 then
      raise exception 'Unexpected stage-boundary definition in %', signature;
    end if;
    updated := replace(original, stage_check, 'p_stage not between 1 and 182');
    if signature like '%spot_game_buy_v2%' then
      if array_length(string_to_array(updated, hint_check), 1) <> 2 then
        raise exception 'Unexpected hint-boundary definition in %', signature;
      end if;
      updated := replace(updated, hint_check, 'p_stage between 62 and 182 then 9 else 5 end');
    end if;
    execute updated;
  end loop;
end;
$stages$;
