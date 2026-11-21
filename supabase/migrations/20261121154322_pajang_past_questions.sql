-- Past questions remain tied to their original round; a new answer gets its own
-- publication time. No existing answer, question snapshot, or consent is changed.
set local lock_timeout = '5s';

-- question_prompt has always been populated by the server, never member input.
-- Prefer the first official snapshot so later copy edits cannot rewrite history.
-- Windows without an answer are recovered from the same delivery calendar.
create or replace function pajang_private.published_question_prompt(p_day date,p_slot text)
returns text language sql stable strict set search_path='' as $function$
  select coalesce(
    (select a.question_prompt from pajang_private.answers a
      where a.day=p_day and a.slot=p_slot and a.question_prompt is not null
      order by a.at,a.person limit 1),
    pajang_private.question_for_window(p_day,p_slot) #>> '{q,0}',
    pajang_private.legacy_prompt(p_day,p_slot))
  where p_slot in ('am','pm') and (p_day,p_slot)>=(date '2026-11-17','pm'::text);
$function$;
revoke all on function pajang_private.published_question_prompt(date,text)
  from public,anon,authenticated,service_role;

-- Past rounds accept their original official snapshot. The current/future round
-- keeps the cutover guard against the live catalog, including in-flight inserts.
create or replace function pajang_private.validate_question_insert()
returns trigger language plpgsql set search_path='' as $guard$
declare expected_prompt text; active_window record;
begin
  if new.day >= date '2026-11-22' then
    select * into active_window from pajang_private.answer_window(clock_timestamp());
    if (new.day,new.slot)<(active_window.day,active_window.slot) then
      expected_prompt := pajang_private.published_question_prompt(new.day,new.slot);
    else
      expected_prompt := pajang_private.question_for_window(new.day,new.slot) #>> '{q,0}';
    end if;
    if expected_prompt is null or new.question_prompt is distinct from expected_prompt then
      raise exception '질문이 바뀌었어요. 새 질문을 확인하고 다시 답해 주세요.' using errcode='PT409';
    end if;
  end if;
  return new;
end;
$guard$;
revoke all on function pajang_private.validate_question_insert()
  from public,anon,authenticated,service_role;

create or replace function public.pajang_past_questions(p_cursor jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  entry jsonb := public.pajang_member('entry');
  today date := (entry->>'day')::date;
  current_slot text := entry->>'slot';
  actor uuid;
  after_day date; after_slot text;
  cards jsonb; next_cursor jsonb;
begin
  if (entry->'joined') is distinct from 'true'::jsonb then
    raise exception '먼저 파장에 참여해 주세요.' using errcode='42501';
  end if;
  select p.id into strict actor from pajang_private.people p where p.owner_id=auth.uid();
  if p_cursor is not null and p_cursor<>'null'::jsonb then
    if jsonb_typeof(p_cursor)<>'object'
      or coalesce(p_cursor->>'day','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(p_cursor->>'slot','') not in ('am','pm') then
      raise exception '지난 질문 목록을 다시 열어 주세요.' using errcode='22023';
    end if;
    begin
      after_day := (p_cursor->>'day')::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception '지난 질문 목록을 다시 열어 주세요.' using errcode='22023';
    end;
    after_slot := p_cursor->>'slot';
    if after_day<greatest(today-364,date '2026-11-17')
      or (after_day,after_slot)<(date '2026-11-17','pm'::text)
      or (after_day,after_slot)>=(today,current_slot) then
      raise exception '지난 질문 목록을 다시 열어 주세요.' using errcode='22023';
    end if;
  end if;

  with windows as (
    select today-n as day,s.slot
    from generate_series(0,least(364,today-date '2026-11-17')) as d(n)
    cross join (values ('am'::text),('pm'::text)) as s(slot)
  ), candidates as (
    select w.day,w.slot from windows w
    where (w.day,w.slot)>=(date '2026-11-17','pm'::text)
      and (w.day,w.slot)<(today,current_slot)
      and (after_day is null or (w.day,w.slot)<(after_day,after_slot))
    order by w.day desc,w.slot desc limit 25
  ), page as (
    select * from candidates order by day desc,slot desc limit 24
  ), details as (
    select w.day,w.slot,
      coalesce(a.question_prompt,pajang_private.published_question_prompt(w.day,w.slot)) as question,
      a.person is not null as answered,
      case when v.person is not null and a.question_prompt is not null then a.body end as body,
      v.person is not null and a.question_prompt is not null as "canEdit"
    from page w
    left join pajang_private.answers a on (a.person,a.day,a.slot)=(actor,w.day,w.slot)
    left join pajang_private.visible_answers v on (v.person,v.day,v.slot)=(actor,w.day,w.slot)
  )
  select coalesce((select jsonb_agg(to_jsonb(d) order by day desc,slot desc) from details d),'[]'::jsonb),
    case when (select count(*) from candidates)>24 then (
      select jsonb_build_object('day',day,'slot',slot) from page order by day,slot limit 1
    ) end
  into cards,next_cursor;
  return jsonb_build_object('items',cards,'nextCursor',next_cursor);
end;
$function$;
revoke all on function public.pajang_past_questions(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pajang_past_questions(jsonb) to authenticated;

create or replace function public.pajang_answer_past_question(
  p_day date,p_slot text,p_question text,p_body text,p_expected_person uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  u uuid := ojjuda_restaurants_internal.require_member();
  entry jsonb;
  active_window record;
  accepted_at timestamptz;
  actor uuid;
  expected_prompt text;
  submitted text := btrim(coalesce(p_body,''),E' \t\n\r\f'||chr(11));
  cleaned text;
  saved pajang_private.answers;
  inserted boolean;
begin
  -- Share the existing member mutation lock with answer edits and deletion.
  -- Recheck eligibility and the current window after any waiting request.
  perform pg_advisory_xact_lock(hashtextextended(u::text,125));
  entry := public.pajang_member('entry');
  if (entry->'joined') is distinct from 'true'::jsonb then
    raise exception '먼저 파장에 참여해 주세요.' using errcode='42501';
  end if;
  select p.id into strict actor from pajang_private.people p where p.owner_id=u for key share;
  if p_expected_person is distinct from actor then
    raise exception '회원 정보가 바뀌었어요. 지난 질문 목록을 다시 열어 주세요.' using errcode='42501';
  end if;
  accepted_at := clock_timestamp();
  select * into active_window from pajang_private.answer_window(accepted_at);
  if p_day is null or p_slot is null or p_slot not in ('am','pm')
    or p_day<greatest(active_window.day-364,date '2026-11-17')
    or (p_day,p_slot)<(date '2026-11-17','pm'::text)
    or (p_day,p_slot)>=(active_window.day,active_window.slot) then
    raise exception '답변할 수 있는 지난 질문을 다시 선택해 주세요.' using errcode='22023';
  end if;
  expected_prompt := pajang_private.published_question_prompt(p_day,p_slot);
  if expected_prompt is null or p_question is distinct from expected_prompt then
    raise exception '질문이 바뀌었어요. 지난 질문 목록에서 다시 선택해 주세요.' using errcode='22023';
  end if;
  cleaned := public.mask_banned(submitted);
  if char_length(replace(cleaned,'❤️❤️','♥')) not between 1 and 220 then
    raise exception '답변을 1~220자로 적어 주세요.' using errcode='22023';
  end if;

  begin
    insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived,publication_window_days)
      values(actor,p_day,p_slot,cleaned,floor(extract(epoch from accepted_at)*1000),expected_prompt,true,365)
      on conflict(person,day,slot) do nothing returning * into saved;
    inserted := found;
  exception when sqlstate 'PT409' then
    -- The insert guard may observe a catalog change while this request waited.
    raise exception '질문이 바뀌었어요. 지난 질문 목록에서 다시 선택해 주세요.' using errcode='22023';
  end;
  if not inserted then
    select * into saved from pajang_private.answers a
      where (a.person,a.day,a.slot)=(actor,p_day,p_slot) for update;
    if saved.person is null or saved.question_prompt is distinct from p_question
      or (saved.body is distinct from submitted and saved.body is distinct from cleaned) then
      raise exception '이미 답변한 질문이에요. 내 답변에서 수정해 주세요.' using errcode='PT409';
    end if;
  end if;
  if not exists(select from pajang_private.visible_answers a
    where (a.person,a.day,a.slot)=(actor,p_day,p_slot)) then
    raise exception '이 답변은 수정할 수 없어요. 목록을 다시 열어 주세요.' using errcode='PT409';
  end if;
  return jsonb_build_object('day',saved.day,'slot',saved.slot,'question',saved.question_prompt,
    'body',saved.body,'at',saved.at,'saved',true,'alreadyAnswered',not inserted);
end;
$function$;
revoke all on function public.pajang_answer_past_question(date,text,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.pajang_answer_past_question(date,text,text,text,uuid) to authenticated;

-- A yearly publication starts on the answer's writing date in Seoul. Existing
-- 30-day consent and current-round-only answers retain their original rules.
-- greatest also preserves any legacy rows whose old timestamp precedes the round.
create or replace function pajang_private.answer_is_visible(
  answer_day date,answer_slot text,shared_beyond_round boolean,current_day date,
  current_slot text,publication_window_days smallint,answer_at bigint)
returns boolean language sql immutable parallel safe set search_path='' as $function$
  select answer_day<=current_day
    and publication_day between current_day-(case when publication_window_days=365 then 364 else 29 end) and current_day
    and ((answer_day=current_day and answer_slot=current_slot)
      or (shared_beyond_round and (answer_day<current_day or (answer_slot='am' and current_slot='pm'))))
  from (select case when publication_window_days=365 then greatest(answer_day,
      (to_timestamp(answer_at/1000.0) at time zone 'Asia/Seoul')::date)
    else answer_day end as publication_day) as publication;
$function$;
revoke all on function pajang_private.answer_is_visible(date,text,boolean,date,text,smallint,bigint)
  from public,anon,authenticated,service_role;

-- Patch the deployed callers, including likes, profiles and signal validation.
-- Other visibility, moderation, block, filter, cursor and quota policies stay intact.
do $migration$
declare
  patch record;
  definition text;
  before_call text;
  after_call text;
  occurrences integer;
begin
  for patch in select * from (values
    ('public.pajang_answer_feed(jsonb)','current_slot'),
    ('public.pajang_discovery_feed(jsonb,text,text,text)','current_slot'),
    ('public.pajang_member(text,jsonb)','active_window.slot'),
    ('pajang_private.read_public_profile_preferences(uuid)','current_slot'),
    ('public.pajang_answer_like(uuid,date,text,boolean,uuid)','current_slot')
  ) as targets(signature,slot_expression) loop
    definition := pg_get_functiondef(patch.signature::regprocedure);
    before_call := 'pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,'||patch.slot_expression||',a.publication_window_days)';
    after_call := 'pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,'||patch.slot_expression||',a.publication_window_days,a.at)';
    occurrences := (length(definition)-length(replace(definition,before_call,'')))/length(before_call);
    if occurrences=1 and position(after_call in definition)=0 then
      execute replace(definition,before_call,after_call);
    elsif occurrences<>0 or (length(definition)-length(replace(definition,after_call,'')))/length(after_call)<>1 then
      raise exception 'Unexpected Pajang visibility definition: %. Review before adding past answers.',patch.signature;
    end if;
  end loop;
end;
$migration$;

comment on function public.pajang_past_questions(jsonb) is
  '24 published past question windows, including unanswered windows, from the last 365 Seoul calendar days. Only the caller''s editable answer is returned.';
comment on function public.pajang_answer_past_question(date,text,text,text,uuid) is
  'Create one answer to a past official question. Identical retries are safe; existing answers are never overwritten. Public for 365 days from writing.';
