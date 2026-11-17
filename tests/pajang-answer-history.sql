-- The window covers 30 Seoul calendar dates, including today and both available slots.
do $test$
declare
  today constant date := date '2028-03-01';
  visible_days integer;
begin
  select count(*) into visible_days from generate_series(0,45) ago
  where pajang_private.answer_is_visible(today - ago,'pm',true,today,'pm');
  if visible_days <> 30
    or not pajang_private.answer_is_visible(today - 29,'pm',true,today,'am')
    or pajang_private.answer_is_visible(today - 30,'am',true,today,'am')
    or pajang_private.answer_is_visible(today + 1,'am',true,today,'pm')
    or pajang_private.answer_is_visible(today,'pm',true,today,'am')
  then raise exception 'Unexpected 30-day answer boundary'; end if;
  if not pajang_private.answer_is_visible(today,'am',false,today,'am')
    or pajang_private.answer_is_visible(today,'am',false,today,'pm')
    or pajang_private.answer_is_visible(today - 1,'pm',false,today,'am')
  then raise exception 'Legacy visibility changed'; end if;
end; $test$;
