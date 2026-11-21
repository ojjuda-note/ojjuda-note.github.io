-- Preview only the next official question, using the same Seoul clock and
-- calendar selector as publication. No future answers or catalog are exposed.
set local lock_timeout = '5s';

create function public.pajang_next_question()
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
  entry jsonb;
  upcoming record;
  starts_at timestamptz;
  prompt text;
begin
  -- The existing entry wrapper checks membership, anonymous accounts, account
  -- restrictions and the adult gate. Keep its clock-based volatility as well.
  entry := public.pajang_member('entry');
  if (entry->'joined') is distinct from 'true'::jsonb then
    raise exception '먼저 파장에 참여해 주세요.' using errcode='42501';
  end if;

  starts_at := (entry->>'nextAt')::timestamptz;
  select * into upcoming from pajang_private.answer_window(starts_at);
  prompt := pajang_private.question_for_window(upcoming.day,upcoming.slot) #>> '{q,0}';
  if prompt is null or btrim(prompt)='' then
    raise exception '다음 질문을 불러오지 못했어요. 다시 확인해 주세요.' using errcode='PT503';
  end if;

  return jsonb_build_object('day',upcoming.day,'slot',upcoming.slot,
    'startsAt',starts_at,'prompt',prompt);
end;
$function$;
revoke all on function public.pajang_next_question() from public,anon,authenticated,service_role;
grant execute on function public.pajang_next_question() to authenticated;

comment on function public.pajang_next_question() is
  'Joined adult-member preview of the single next Seoul AM/PM question. Reuses the publication calendar; returns only day, slot, startsAt and prompt. Does not create or publish answers.';
