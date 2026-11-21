-- Audited deployed definitions captured on 2026-11-21 before answer likes.
-- Function metadata only; no member rows or answer contents.

CREATE OR REPLACE FUNCTION public.pajang_answer_feed(p_cursor jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  entry jsonb := public.pajang_member('entry');
  today date := (entry->>'day')::date;
  current_slot text := entry->>'slot';
  viewer uuid;
  cursor_at bigint; cursor_person uuid; cursor_day date; cursor_slot text;
  page jsonb; next_cursor jsonb; available integer;
begin
  if (entry->'joined') is distinct from 'true'::jsonb then
    raise exception '먼저 파장에 참여해 주세요.' using errcode='42501';
  end if;
  select id into strict viewer from pajang_private.people where owner_id=auth.uid();
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    cursor_at := (p_cursor->>'at')::bigint;
    cursor_person := (p_cursor->>'peer')::uuid;
    cursor_day := (p_cursor->>'day')::date;
    cursor_slot := p_cursor->>'slot';
    if cursor_at is null or cursor_person is null or cursor_day is null
      or cursor_slot is null or cursor_slot not in ('am','pm') then
      raise exception '목록을 다시 열어 주세요.' using errcode='22023';
    end if;
  end if;
  with candidates as (
    select a.at,a.person,a.day,a.slot,a.question_prompt,a.body
    from pajang_private.visible_answers a
    where (
      (a.person=viewer and (a.day<today or (a.day=today and (a.slot=current_slot or a.slot='am'))))
      or pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,current_slot,a.publication_window_days)
    )
      and a.question_prompt is not null
      and (a.person=viewer or pajang_private.clear_pair(viewer,a.person))
      and (cursor_at is null or (a.at,a.person,a.day,a.slot)<(cursor_at,cursor_person,cursor_day,cursor_slot))
    order by a.at desc,a.person desc,a.day desc,a.slot desc limit 25
  ), visible_page as (
    select * from candidates order by at desc,person desc,day desc,slot desc limit 24
  ), cards as (
    select a.at,a.person as peer,a.day,a.slot,a.question_prompt as question,a.body,p.name,
      a.person=viewer as own,
      exists(select from pajang_private.signals s where s.src=viewer and s.dst=a.person) as sent,
      exists(select from pajang_private.signals s where s.src=a.person and s.dst=viewer) as received
    from visible_page a join pajang_private.people p on p.id=a.person
  )
  select coalesce((select jsonb_agg(to_jsonb(c) order by at desc,peer desc,day desc,slot desc) from cards c),'[]'::jsonb),
    case when (select count(*) from candidates)>24 then (
      select jsonb_build_object('at',at,'peer',person,'day',day,'slot',slot)
      from visible_page order by at,person,day,slot limit 1
    ) end
  into page,next_cursor;

  select greatest(0,3-count(*)) into available from pajang_private.signals where src=viewer and day=today;
  return jsonb_build_object('items',page,'nextCursor',next_cursor,'remaining',available);
end; $function$;

CREATE OR REPLACE FUNCTION public.pajang_discovery_feed(p_cursor jsonb, p_interest text, p_order text, p_gender text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  entry jsonb := public.pajang_member('entry');
  today date := (entry->>'day')::date;
  current_slot text := entry->>'slot';
  viewer pajang_private.people;
  province text;
  after_priority integer; after_at bigint; after_peer uuid; after_day date; after_slot text;
  cards jsonb; next_cursor jsonb; amount bigint; available integer;
begin
  if (entry->'joined') is distinct from 'true'::jsonb then
    raise exception '먼저 파장에 참여해 주세요.' using errcode='42501';
  end if;
  select * into strict viewer from pajang_private.people where owner_id=auth.uid();
  province := split_part(viewer.region, ' ', 1);
  if p_interest is null or p_interest not in ('all','vinyl','coffee','walk','camera','book','tennis','conversation','casual','friendship','dating','marriage')
     or p_order is null or p_order not in ('latest','recommend','local')
     or p_gender is null or p_gender not in ('all','male','female') then
    raise exception '필터와 정렬 기준을 확인해 주세요.' using errcode='22023';
  end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    after_priority := (p_cursor->>'priority')::integer;
    after_at := (p_cursor->>'at')::bigint;
    after_peer := (p_cursor->>'peer')::uuid;
    after_day := (p_cursor->>'day')::date;
    after_slot := p_cursor->>'slot';
    if p_cursor->>'order' is distinct from p_order or p_cursor->>'interest' is distinct from p_interest
       or coalesce(p_cursor->>'gender','all') <> p_gender
       or after_priority is null or after_priority not between 0 and 2
       or after_at is null or after_peer is null or after_day is null
       or after_slot is null or after_slot not in ('am','pm') then
      raise exception '목록을 다시 열어 주세요.' using errcode='22023';
    end if;
  end if;

  with visible as (
    select a.at,a.person as peer,a.day,a.slot,
      case
        when p_order='recommend' then (viewer.interest<>'' and p.interest=viewer.interest)::integer
        when p_order<>'local' or viewer.region in ('','그 외 지역') or p.region in ('','그 외 지역') then 0
        when p.region=viewer.region and strpos(viewer.region,' ')>0 then 2
        when split_part(p.region,' ',1)=province then 1
        -- The old combined region does not identify a particular city or county.
        when province='경기·인천' and split_part(p.region,' ',1) in ('경기도','인천광역시') then 1
        when p.region='경기·인천' and province in ('경기도','인천광역시') then 1
        else 0
      end as priority
    from pajang_private.visible_answers a join pajang_private.people p on p.id=a.person
    where (
      (a.person=viewer.id and (a.day<today or (a.day=today and (a.slot=current_slot or a.slot='am'))))
      or pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,current_slot,a.publication_window_days)
    )
      and a.question_prompt is not null
      and (p_interest='all'
        or (p_interest in ('vinyl','coffee','walk','camera','book','tennis') and p.interest=p_interest)
        or (p_interest in ('conversation','casual','friendship','dating','marriage') and exists (
          select from pajang_private.public_profile_preferences pref
          where pref.person=p.id and (pref.preferences->'relationship_intents') ? p_interest
        )))
      and (p_gender='all' or exists (
        select from pajang_private.discovery_gender_opt_ins opt
        join ojjuda_account_internal.member_identity i on i.user_id=p.owner_id and i.gender=p_gender
        where opt.person=p.id
      ))
      and (a.person=viewer.id or pajang_private.clear_pair(viewer.id,a.person))
  ), candidates as (
    select * from visible
    where after_priority is null
      or (priority,at,peer,day,slot)<(after_priority,after_at,after_peer,after_day,after_slot)
    order by priority desc,at desc,peer desc,day desc,slot desc limit 25
  ), page as (
    select * from candidates order by priority desc,at desc,peer desc,day desc,slot desc limit 24
  ), details as (
    select x.*,a.question_prompt as question,a.body,p.name,p.region,p.interest,
      coalesce((select pref.preferences->'relationship_intents'
        from pajang_private.public_profile_preferences pref where pref.person=x.peer),'[]'::jsonb) as relationship_intents,
      x.peer=viewer.id as own,
      exists(select from pajang_private.signals s where s.src=viewer.id and s.dst=x.peer) as sent,
      exists(select from pajang_private.signals s where s.src=x.peer and s.dst=viewer.id) as received
    from page x join pajang_private.people p on p.id=x.peer
    join pajang_private.visible_answers a on (a.person,a.day,a.slot)=(x.peer,x.day,x.slot)
  )
  select (select count(*) from visible),
    coalesce((select jsonb_agg(to_jsonb(d)-'priority' order by priority desc,at desc,peer desc,day desc,slot desc)
      from details d),'[]'::jsonb),
    case when (select count(*) from candidates)>24 then (
      select to_jsonb(x)||jsonb_build_object('order',p_order,'interest',p_interest)
        || case when p_gender='all' then '{}'::jsonb else jsonb_build_object('gender',p_gender) end
      from page x order by priority,at,peer,day,slot limit 1
    ) end
  into amount,cards,next_cursor;

  select greatest(0,3-count(*)) into available from pajang_private.signals where src=viewer.id and day=today;
  return jsonb_build_object('items',cards,'nextCursor',next_cursor,'remaining',available,'total',amount);
end; $function$;

CREATE OR REPLACE FUNCTION public.pajang_discovery_feed(p_cursor jsonb DEFAULT NULL::jsonb, p_interest text DEFAULT 'all'::text, p_order text DEFAULT 'latest'::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select public.pajang_discovery_feed(p_cursor,p_interest,p_order,'all');
$function$;

CREATE OR REPLACE FUNCTION public.pajang_my_answers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    from pajang_private.people p join pajang_private.visible_answers a on a.person=p.id
    where p.owner_id=auth.uid() and a.question_prompt is not null
      and (a.day<today or (a.day=today and (a.slot=entry->>'slot' or a.slot='am')))
  );
end; $function$;
