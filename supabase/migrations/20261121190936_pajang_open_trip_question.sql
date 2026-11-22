-- Replace one unanswered planning prompt with an open, everyday question.
-- Current copy: features/pajang/content/personality-revisions.json.
-- Keep the original seed and all saved question/answer snapshots unchanged.
begin;
set local lock_timeout = '5s';
lock table pajang_private.answers in share row exclusive mode;

do $replacement$
declare
  previous pajang_private.personality_question_catalog;
  replacement pajang_private.personality_question_catalog;
  old_prompt constant text := '일주일 뒤까지 끝내야 할 일이 생기면 어떻게 진행하나요?';
  old_samples constant text[] := array[
    '받은 날 전체 내용을 먼저 살펴봐요.',
    '매일 할 분량을 나눠서 조금씩 해요.',
    '다른 일을 정리한 뒤 한 번에 집중해요.'
  ];
  new_prompt constant text := '여행 가기 전날 밤은 보통 어떻게 보내나요?';
  new_samples constant text[] := array[
    '미리 챙겨 둔 짐을 한 번 확인하고 일찍 자요.',
    '갈 곳을 더 찾아보다가 친구에게 이것저것 보내요.',
    '짐은 아침에 챙기고, 전날 밤에는 평소처럼 편하게 쉬어요.'
  ];
begin
  select * into previous from pajang_private.personality_question_catalog
    where id=20245 for update;
  select * into replacement from pajang_private.personality_question_catalog
    where id=40001 for update;

  -- A completed retry is a no-op even after members answer the new prompt.
  if previous.id is null and replacement.id is not null
    and row(replacement.ordinal,replacement.category,replacement.prompt,
      replacement.occasion,replacement.edition,replacement.turn,replacement.samples)
      is not distinct from row(2,'planning'::text,new_prompt,
        null::text,null::smallint,null::smallint,new_samples) then
    return;
  end if;
  if previous.id is null or replacement.id is not null
    or row(previous.ordinal,previous.category,previous.prompt,
      previous.occasion,previous.edition,previous.turn,previous.samples)
      is distinct from row(2,'planning'::text,old_prompt,
        null::text,null::smallint,null::smallint,old_samples) then
    raise exception 'Pajang planning question changed; review the concurrent edit';
  end if;
  if exists(select from pajang_private.answers where question_prompt=old_prompt) then
    raise exception 'Pajang planning question already has answers; preserve the published prompt';
  end if;

  -- A new identity rejects a stale answer form; ordinal 2 keeps its AM/PM slot.
  -- The existing INSERT trigger checks the prompt again after this table lock.
  update pajang_private.personality_question_catalog
    set id=40001,prompt=new_prompt,samples=new_samples
    where id=20245;
end;
$replacement$;
commit;
