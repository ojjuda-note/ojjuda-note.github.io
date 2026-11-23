-- Answer likes are independent of signals, wallet balances and private messages.
-- Persist one member's desired state per answer; only the authenticated RPC can write.
create table pajang_private.answer_likes (
  person uuid not null,
  day date not null,
  slot text not null check (slot in ('am','pm')),
  liker uuid not null references pajang_private.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person,day,slot,liker),
  foreign key (person,day,slot) references pajang_private.answers(person,day,slot) on delete cascade
);
create index answer_likes_liker_idx on pajang_private.answer_likes(liker);
alter table pajang_private.answer_likes enable row level security;
revoke all on table pajang_private.answer_likes from public,anon,authenticated,service_role;

create function public.pajang_answer_like(p_peer uuid,p_day date,p_slot text,p_liked boolean,p_expected_person uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  entry jsonb := public.pajang_member('entry');
  today date := (entry->>'day')::date;
  current_slot text := entry->>'slot';
  actor uuid;
  amount bigint;
begin
  -- Entry applies the existing account, anonymous-account and adult eligibility rules.
  if (entry->'joined') is distinct from 'true'::jsonb then
    raise exception '먼저 파장에 참여해 주세요.' using errcode='42501';
  end if;
  select p.id into strict actor from pajang_private.people p where p.owner_id=auth.uid();
  if actor is distinct from p_expected_person then
    raise exception '회원 정보가 바뀌었어요. 목록을 다시 열어 주세요.' using errcode='42501';
  end if;
  if p_peer is null or p_day is null or p_slot is null or p_slot not in ('am','pm') or p_liked is null then
    raise exception '좋아요를 표시할 답변을 확인해 주세요.' using errcode='22023';
  end if;

  -- Serialize changes for this answer, including retries and two members reacting at once.
  -- The FK row lock also prevents a concurrent answer deletion until this request completes.
  perform pg_advisory_xact_lock(hashtextextended(p_peer::text||':'||p_day::text||':'||p_slot,316));
  perform 1 from pajang_private.answers a
    where (a.person,a.day,a.slot)=(p_peer,p_day,p_slot) for key share;
  if not found or not exists (
    select from pajang_private.visible_answers a
    where (a.person,a.day,a.slot)=(p_peer,p_day,p_slot) and a.question_prompt is not null
      and (
        (a.person=actor and (a.day<today or (a.day=today and (a.slot=current_slot or a.slot='am'))))
        or (pajang_private.clear_pair(actor,a.person)
          and pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,current_slot,a.publication_window_days))
      )
  ) then
    raise exception '이 답변은 더 이상 볼 수 없어요. 목록을 다시 열어 주세요.' using errcode='42501';
  end if;

  if p_liked then
    insert into pajang_private.answer_likes(person,day,slot,liker)
      values(p_peer,p_day,p_slot,actor) on conflict (person,day,slot,liker) do nothing;
  else
    delete from pajang_private.answer_likes l
      where (l.person,l.day,l.slot,l.liker)=(p_peer,p_day,p_slot,actor);
  end if;
  select count(*) into amount from pajang_private.answer_likes l
    where (l.person,l.day,l.slot)=(p_peer,p_day,p_slot);
  return jsonb_build_object('peer',p_peer,'day',p_day,'slot',p_slot,'liked',p_liked,'likeCount',amount);
end;
$function$;
revoke all on function public.pajang_answer_like(uuid,date,text,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.pajang_answer_like(uuid,date,text,boolean,uuid) to authenticated;

-- Add only result fields to the deployed definitions. All authorization, publication,
-- moderation, filtering, keyset cursors and signal quota code stays byte-for-byte intact.
do $migration$
declare
  replacement record;
  definition text;
  occurrences integer;
begin
  for replacement in select * from (values
    ('public.pajang_my_answers()',
     $old$'question',a.question_prompt,'body',a.body)$old$,
     $new$'question',a.question_prompt,'body',a.body,
      'likeCount',(select count(*) from pajang_private.answer_likes l
        where (l.person,l.day,l.slot)=(a.person,a.day,a.slot)),
      'liked',exists(select from pajang_private.answer_likes l
        where (l.person,l.day,l.slot,l.liker)=(a.person,a.day,a.slot,p.id)))$new$),
    ('public.pajang_answer_feed(jsonb)',
     $old$a.person=viewer as own,$old$,
     $new$a.person=viewer as own,
      (select count(*) from pajang_private.answer_likes l
        where (l.person,l.day,l.slot)=(a.person,a.day,a.slot)) as "likeCount",
      exists(select from pajang_private.answer_likes l
        where (l.person,l.day,l.slot,l.liker)=(a.person,a.day,a.slot,viewer)) as liked,$new$),
    ('public.pajang_discovery_feed(jsonb,text,text,text)',
     $old$x.peer=viewer.id as own,$old$,
     $new$x.peer=viewer.id as own,
      (select count(*) from pajang_private.answer_likes l
        where (l.person,l.day,l.slot)=(x.peer,x.day,x.slot)) as "likeCount",
      exists(select from pajang_private.answer_likes l
        where (l.person,l.day,l.slot,l.liker)=(x.peer,x.day,x.slot,viewer.id)) as liked,$new$)
  ) as patches(signature,old_text,new_text) loop
    select pg_get_functiondef(replacement.signature::regprocedure) into definition;
    occurrences := (length(definition)-length(replace(definition,replacement.old_text,''))) / length(replacement.old_text);
    if occurrences is distinct from 1 or position('pajang_private.answer_likes' in definition)>0 then
      raise exception 'Unexpected Pajang answer feed definition: %. Review before adding likes.',replacement.signature;
    end if;
    execute replace(definition,replacement.old_text,replacement.new_text);
  end loop;
end;
$migration$;

comment on table pajang_private.answer_likes is
  'Private, persistent answer likes. One member per answer, with cascading answer/member deletion. No signals or wallet side effects.';
comment on function public.pajang_answer_like(uuid,date,text,boolean,uuid) is
  'Set the current member''s like on an answer they can see. Required expected person rejects stale account views. Idempotent desired-state API; self likes follow owner history access.';
