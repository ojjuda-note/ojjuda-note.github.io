-- Filter and sort the complete member-visible history before taking a page.
create function public.pajang_discovery_feed(
  p_cursor jsonb default null,
  p_interest text default 'all',
  p_order text default 'latest'
) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if p_interest is null or p_interest not in ('all','vinyl','coffee','walk','camera','book','tennis')
     or p_order is null or p_order not in ('latest','recommend','local') then
    raise exception '취향과 정렬 기준을 확인해 주세요.' using errcode='22023';
  end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    after_priority := (p_cursor->>'priority')::integer;
    after_at := (p_cursor->>'at')::bigint;
    after_peer := (p_cursor->>'peer')::uuid;
    after_day := (p_cursor->>'day')::date;
    after_slot := p_cursor->>'slot';
    if p_cursor->>'order' is distinct from p_order or p_cursor->>'interest' is distinct from p_interest
       or after_priority is null or after_priority not between 0 and 2
       or after_at is null or after_peer is null or after_day is null
       or after_slot is null or after_slot not in ('am','pm') then
      raise exception '목록을 다시 열어 주세요.' using errcode='22023';
    end if;
  end if;

  with visible as (
    select a.at,a.person as peer,a.day,a.slot,
      case
        when p_order='recommend' then (p.interest=viewer.interest)::integer
        when p_order<>'local' or viewer.region='그 외 지역' or p.region='그 외 지역' then 0
        when p.region=viewer.region and strpos(viewer.region,' ')>0 then 2
        when split_part(p.region,' ',1)=province then 1
        -- The old combined region does not identify a particular city or county.
        when province='경기·인천' and split_part(p.region,' ',1) in ('경기도','인천광역시') then 1
        when p.region='경기·인천' and province in ('경기도','인천광역시') then 1
        else 0
      end as priority
    from pajang_private.answers a join pajang_private.people p on p.id=a.person
    where pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,current_slot)
      and a.question_prompt is not null
      and (p_interest='all' or p.interest=p_interest)
      and (a.person=viewer.id or pajang_private.clear_pair(viewer.id,a.person))
  ), candidates as (
    select * from visible
    where after_priority is null
      or (priority,at,peer,day,slot)<(after_priority,after_at,after_peer,after_day,after_slot)
    order by priority desc,at desc,peer desc,day desc,slot desc limit 25
  ), page as (
    select * from candidates order by priority desc,at desc,peer desc,day desc,slot desc limit 24
  ), details as (
    select x.*,a.question_prompt as question,a.body,p.name,p.age,p.region,p.interest,
      x.peer=viewer.id as own,
      exists(select from pajang_private.signals s where s.src=viewer.id and s.dst=x.peer) as sent,
      exists(select from pajang_private.signals s where s.src=x.peer and s.dst=viewer.id) as received
    from page x join pajang_private.people p on p.id=x.peer
    join pajang_private.answers a on (a.person,a.day,a.slot)=(x.peer,x.day,x.slot)
  )
  select (select count(*) from visible),
    coalesce((select jsonb_agg(to_jsonb(d)-'priority' order by priority desc,at desc,peer desc,day desc,slot desc)
      from details d),'[]'::jsonb),
    case when (select count(*) from candidates)>24 then (
      select to_jsonb(x)||jsonb_build_object('order',p_order,'interest',p_interest)
      from page x order by priority,at,peer,day,slot limit 1
    ) end
  into amount,cards,next_cursor;

  select greatest(0,3-count(*)) into available from pajang_private.signals where src=viewer.id and day=today;
  return jsonb_build_object('items',cards,'nextCursor',next_cursor,'remaining',available,'total',amount);
end; $$;
revoke all on function public.pajang_discovery_feed(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.pajang_discovery_feed(jsonb,text,text) to authenticated;
