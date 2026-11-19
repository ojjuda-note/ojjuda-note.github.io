-- Patch only height validation so deployed profile-field rules and privileges stay intact.
-- The editor accepts decimal centimetres; keep the same 1..300 range on the server.
do $migration$
declare
  definition text := pg_get_functiondef('pajang_private.exchange_fields(jsonb)'::regprocedure);
  previous_height text := $previous$      if txt !~ '^[0-9]{1,3}$' then raise exception '키를 센티미터 단위로 입력해 주세요.' using errcode='22023'; end if;
      if txt::integer not between 1 and 300 then raise exception '키를 확인해 주세요.' using errcode='22023'; end if;
      result:=result||jsonb_build_object(item.key,txt::integer);$previous$;
  decimal_height text := $decimal$      if txt !~ '^[0-9]{1,3}([.][0-9]+)?$' then raise exception '키를 센티미터 단위의 숫자로 입력해 주세요.' using errcode='22023'; end if;
      if txt::numeric not between 1 and 300 then raise exception '키는 1~300cm 사이로 입력해 주세요.' using errcode='22023'; end if;
      result:=result||jsonb_build_object(item.key,txt::numeric);$decimal$;
begin
  if position(previous_height in definition)>0 then
    execute replace(definition,previous_height,decimal_height);
  elsif position(decimal_height in definition)=0 then
    raise exception 'Unexpected exchange height validator; review the current function before applying this migration';
  end if;
end;
$migration$;
