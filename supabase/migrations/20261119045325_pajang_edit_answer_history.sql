-- Extend the existing member RPC without replacing unrelated live policies.
-- Only the authenticated owner's listed answer body may change. Publication
-- dates, questions, visibility, moderation, signals and balances stay intact.
do $migration$
declare
  definition text := pg_get_functiondef('public.pajang_member(text,jsonb)'::regprocedure);
  patch record;
begin
  if to_regprocedure('public.has_banned(text)') is null
    or to_regclass('pajang_private.visible_answers') is null
    or position('edit-history-answer' in definition)>0 then
    raise exception 'unexpected_pajang_history_answer_dependencies' using errcode='55000';
  end if;

  for patch in select * from (values
    (
      'known_age int;',
      E'history_day date; history_slot text; history_body text;\n known_age int;'
    ),
    (
      $old$ if p_action in ('join','answer','edit-answer') then$old$,
      $new$ if p_action='edit-history-answer' and p_data->>'expectedPerson' is distinct from mine.id::text then
   raise exception '회원 정보가 바뀌었어요. 목록을 다시 열어 주세요.' using errcode='42501';
 end if;
 if p_action in ('join','answer','edit-answer','edit-history-answer') then$new$
    ),
    (
      $old$   if p_action='edit-answer' then$old$,
      $new$   if p_action='edit-history-answer' then
     -- Keep the current-answer round/question guards unchanged. History names
     -- its original round and never supplies the owner used for the lookup.
     if coalesce(p_data->>'day','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or coalesce(p_data->>'slot','') not in ('am','pm') then
       raise exception '수정할 답변을 다시 선택해 주세요.' using errcode='22023';
     end if;
     begin
       history_day:=(p_data->>'day')::date;
     exception when invalid_datetime_format or datetime_field_overflow then
       raise exception '수정할 답변을 다시 선택해 주세요.' using errcode='22023';
     end;
     history_slot:=p_data->>'slot';
     select a.body into history_body from pajang_private.answers a
     where a.person=mine.id and a.day=history_day and a.slot=history_slot
       and a.question_prompt is not null
       and (a.day<today or (a.day=today and (a.slot=active_window.slot or a.slot='am')))
       and exists(select from pajang_private.visible_answers v
         where (v.person,v.day,v.slot)=(a.person,a.day,a.slot))
     for update of a;
     if not found then
       raise exception '수정할 답변을 찾을 수 없어요. 목록을 다시 열어 주세요.' using errcode='PT409';
     end if;
     if p_data->>'previousBody' is null
       or (history_body is distinct from p_data->>'previousBody' and history_body is distinct from val) then
       raise exception '기존 답변이 달라졌어요. 창을 닫고 최신 답변을 다시 열어 주세요.' using errcode='PT412';
     end if;
     -- The shared trigger also checks changed text only. A completed save can
     -- be retried without reclassifying an unchanged historical body.
     if history_body is distinct from val and public.has_banned(val) then
       raise exception 'banned_word' using errcode='P0001', hint='욕설, 음란, 마약 관련 표현은 쓸 수 없어요';
     end if;
   end if;
   if p_action in ('edit-answer','edit-history-answer') then$new$
    ),
    (
      $old$     update pajang_private.answers a set body=val
     where a.person=mine.id and a.day=today and a.slot=active_window.slot$old$,
      $new$     update pajang_private.answers a set body=val
     where a.person=mine.id
       and a.day=case when p_action='edit-history-answer' then history_day else today end
       and a.slot=case when p_action='edit-history-answer' then history_slot else active_window.slot end
       and (p_action<>'edit-history-answer' or exists(select from pajang_private.visible_answers v
         where (v.person,v.day,v.slot)=(a.person,a.day,a.slot)))$new$
    )
  ) as changes(old_text,new_text)
  loop
    -- Refuse changed or ambiguous anchors instead of overwriting a newer RPC.
    if length(definition)-length(replace(definition,patch.old_text,''))<>length(patch.old_text) then
      raise exception 'unexpected_pajang_history_answer_definition' using errcode='55000';
    end if;
    definition:=replace(definition,patch.old_text,patch.new_text);
  end loop;
  execute definition;
end;
$migration$;
