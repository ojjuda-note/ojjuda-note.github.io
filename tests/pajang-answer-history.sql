-- The window covers 365 Seoul calendar dates, including today and available slots.
do $test$
declare
  today constant date := date '2028-03-01';
  visible_days integer;
begin
  select count(*) into visible_days from generate_series(0,400) ago
  where pajang_private.answer_is_visible(today - ago,'pm',true,today,'pm',365::smallint);
  if visible_days <> 365
    or not pajang_private.answer_is_visible(today - 364,'pm',true,today,'am',365::smallint)
    or pajang_private.answer_is_visible(today - 365,'am',true,today,'am',365::smallint)
    or not pajang_private.answer_is_visible(date '2028-02-29','pm',true,today,'am',365::smallint)
    or pajang_private.answer_is_visible(today + 1,'am',true,today,'pm',365::smallint)
    or pajang_private.answer_is_visible(today,'pm',true,today,'am',365::smallint)
  then raise exception 'Unexpected 365-day answer boundary'; end if;
  if not pajang_private.answer_is_visible(today - 29,'am',true,today,'am',30::smallint)
    or pajang_private.answer_is_visible(today - 30,'am',true,today,'am',30::smallint)
    or pajang_private.answer_is_visible(today - 30,'am',true,today,'am')
    or not pajang_private.answer_is_visible(today,'am',false,today,'am')
    or pajang_private.answer_is_visible(today,'am',false,today,'pm')
    or pajang_private.answer_is_visible(today - 1,'pm',false,today,'am')
  then raise exception 'Legacy visibility changed'; end if;
end; $test$;
