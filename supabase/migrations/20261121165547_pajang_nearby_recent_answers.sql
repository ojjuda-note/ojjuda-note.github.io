-- The radar covers the current question and the previous two question rounds.
-- Keep the current-round people list, all saved answers, and location consent intact.
set local lock_timeout = '5s';

create function pajang_private.nearby_people(
  p_viewer uuid,p_day date,p_slot text,p_location pajang_private.locations)
returns jsonb language plpgsql stable security invoker set search_path='' as $function$
declare result jsonb;
begin
  -- Only the authenticated member wrapper calls this helper. A missing or stale
  -- location never returns another member's location, even if old rows remain.
  if p_viewer is null or p_day is null or p_slot is null or p_slot not in ('am','pm')
    or p_location.person is distinct from p_viewer or p_location.day is distinct from p_day
    or not exists (
      select from pajang_private.people v
      left join ojjuda_account_internal.location_preferences choice on choice.user_id=v.owner_id
      where v.id=p_viewer and v.owner_id=auth.uid()
        and coalesce(choice.enabled,v.location_enabled,false)
    ) then return '[]'::jsonb; end if;

  with recent_windows as (
    select d.day,s.slot
    from (values (p_day),(p_day-1)) as d(day)
    cross join (values ('am'::text),('pm'::text)) as s(slot)
    where (d.day,s.slot)<=(p_day,p_slot)
      and (d.day,s.slot)>=(date '2026-11-17','pm'::text)
    order by d.day desc,s.slot desc limit 3
  ), grouped as (
    select m.id,m.name,m.region,m.interest,geo.info,
      jsonb_agg(jsonb_build_object(
        'day',a.day,'slot',a.slot,'question',a.question_prompt,'body',a.body,'at',a.at,
        'likeCount',(select count(*) from pajang_private.answer_likes likes
          where (likes.person,likes.day,likes.slot)=(a.person,a.day,a.slot)),
        'liked',exists(select from pajang_private.answer_likes likes
          where (likes.person,likes.day,likes.slot,likes.liker)=(a.person,a.day,a.slot,p_viewer)))
        order by a.day desc,a.slot desc) as answers
    from recent_windows w
    join pajang_private.visible_answers a on (a.day,a.slot)=(w.day,w.slot)
    join pajang_private.people m on m.id=a.person
    join pajang_private.locations loc on loc.person=m.id and loc.day=p_day
    join auth.users account on account.id=m.owner_id
    join public.profiles profile on profile.id=account.id
    left join ojjuda_account_internal.location_preferences choice on choice.user_id=m.owner_id
    cross join lateral (select pajang_private.rangeinfo(p_location,loc) as info) geo
    where pajang_private.clear_pair(p_viewer,m.id)
      and coalesce(choice.enabled,m.location_enabled,false)
      and geo.info ? 'range'
      and a.question_prompt is not null
      and pajang_private.answer_is_visible(a.day,a.slot,a.archived,p_day,p_slot,a.publication_window_days,a.at)
      and account.is_anonymous is not true and account.deleted_at is null
      and (account.banned_until is null or account.banned_until<=now())
      and not exists(select from public.user_private status
        where status.user_id=account.id and status.banned_until>now())
      and not exists(select from ojjuda_account_deletion.requests deletion where deletion.user_id=account.id)
      and not exists(select from ojjuda_account_internal.member_identity identity
        where identity.user_id=account.id and extract(year from age(p_day,identity.birth_date))<19)
    group by m.id,m.name,m.region,m.interest,geo.info
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,'name',g.name,'region',g.region,'interest',g.interest,
    'body',g.answers->0->>'body','at',(g.answers->0->>'at')::bigint,
    'answers',g.answers)||g.info
    order by g.answers->0->>'day' desc,g.answers->0->>'slot' desc,
      (g.answers->0->>'at')::bigint desc,g.id),'[]'::jsonb)
  into result from grouped g;
  return result;
end;
$function$;
revoke all on function pajang_private.nearby_people(uuid,date,text,pajang_private.locations)
  from public,anon,authenticated,service_role;

-- Extend only the final member-state result. Entry, threads, writes, quotas,
-- the current-round people list and all existing permission guards are unchanged.
do $migration$
declare
  definition text;
  old_text constant text := $old$ return result||pajang_private.signal_quota(u,today);$old$;
  new_text constant text := $new$ return result||pajang_private.signal_quota(u,today)||jsonb_build_object(
   'nearbyPeople',case when mine.location_enabled then
     pajang_private.nearby_people(mine.id,today,active_window.slot,ownloc)
     else '[]'::jsonb end);$new$;
  occurrences integer;
begin
  select pg_get_functiondef('public.pajang_member(text,jsonb)'::regprocedure) into definition;
  occurrences := (length(definition)-length(replace(definition,old_text,''))) / length(old_text);
  if occurrences is distinct from 1 or position('nearbyPeople' in definition)>0 then
    raise exception 'Unexpected Pajang member definition. Review before extending nearby answers.';
  end if;
  execute replace(definition,old_text,new_text);
end;
$migration$;

comment on function pajang_private.nearby_people(uuid,date,text,pajang_private.locations) is
  'Private current-plus-two-previous-question radar feed. One marker per member; original visible answer snapshots and existing coarse range/bearing only. Shared location opt-out wins.';
