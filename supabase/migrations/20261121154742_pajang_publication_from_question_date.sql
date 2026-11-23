-- The public lifetime starts on the question's original Seoul date.
-- Keep the seven-argument API used by feeds, likes, profiles and signals, but
-- preserve the established six-argument 365/30-day publication rules exactly.
-- answer_at remains the actual writing timestamp for ordering and history.
create or replace function pajang_private.answer_is_visible(
  answer_day date,answer_slot text,shared_beyond_round boolean,current_day date,
  current_slot text,publication_window_days smallint,answer_at bigint)
returns boolean language sql immutable parallel safe set search_path='' as $function$
  select pajang_private.answer_is_visible(answer_day,answer_slot,shared_beyond_round,
    current_day,current_slot,publication_window_days);
$function$;
revoke all on function pajang_private.answer_is_visible(date,text,boolean,date,text,smallint,bigint)
  from public,anon,authenticated,service_role;

comment on function pajang_private.answer_is_visible(date,text,boolean,date,text,smallint,bigint) is
  'Compatibility overload: public expiry is measured from the question date, never the later answer-writing timestamp. Existing consent rules are unchanged.';
comment on function public.pajang_answer_past_question(date,text,text,text,uuid) is
  'Create one answer to a past official question. Identical retries are safe; existing answers are never overwritten. Public for the remaining part of 365 days from the question date.';
