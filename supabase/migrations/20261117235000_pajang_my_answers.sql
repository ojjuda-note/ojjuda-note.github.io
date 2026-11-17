create function public.pajang_my_answers() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  entry jsonb := public.pajang_member('entry');
  today date := (entry->>'day')::date;
begin
  if (entry->'joined') is distinct from 'true'::jsonb then
    raise exception '먼저 파장에 참여해 주세요.' using errcode='42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('day',a.day,'slot',a.slot,
      'question',a.question_prompt,'body',a.body) order by a.day desc, a.slot desc),'[]'::jsonb)
    from pajang_private.people p join pajang_private.answers a on a.person=p.id
    where p.owner_id=auth.uid() and a.question_prompt is not null
      and pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,entry->>'slot')
  );
end; $$;
revoke all on function public.pajang_my_answers() from public,anon,authenticated;
grant execute on function public.pajang_my_answers() to authenticated;
