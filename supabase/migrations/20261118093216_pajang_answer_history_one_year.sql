-- Include today and the preceding 364 Seoul calendar dates.
-- Answers that were shared only for their original round keep that visibility.
create or replace function pajang_private.answer_is_visible(
  answer_day date, answer_slot text, shared_beyond_round boolean,
  current_day date, current_slot text
) returns boolean language sql immutable parallel safe
return answer_day between current_day - 364 and current_day
  and (
    (answer_day = current_day and answer_slot = current_slot)
    or (shared_beyond_round and
        (answer_day < current_day or (answer_slot = 'am' and current_slot = 'pm')))
  );

revoke all on function pajang_private.answer_is_visible(date,text,boolean,date,text)
  from public,anon,authenticated;
