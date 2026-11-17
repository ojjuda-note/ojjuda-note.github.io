-- Keep existing answers tied to the original question up through November 17, Seoul time.
-- Rank lunar festivals first, fixed observances second, and the seasonal weekend third.
create function pajang_private.question_occasion(on_day date)
returns table(kind text, day_no integer) language sql stable strict set search_path='' as $$
  with calendar as (
    select extract(year from on_day)::int as y, extract(month from on_day)::int as m,
           date_trunc('month',on_day::timestamp)::date as first_day
  ), events as (
    select l.name as kind, l.anchor - 2 as start_on, 5 as span, 1 as priority
    from calendar c join pajang_private.lunar_festivals f on f.year=c.y
    cross join lateral (values ('seollal',f.seollal),('chuseok',f.chuseok)) l(name,anchor)
    union all
    select h.name,make_date(c.y,h.month_no,h.day_no),h.span,2
    from calendar c cross join (values
      ('newyear',1,1,2),('valentines',2,13,2),('marchfirst',3,1,1),('whiteday',3,14,1),
      ('childrens',5,5,1),('gratitude',5,8,1),('memorial',6,6,1),('foundation',10,3,1),('liberation',8,15,1),('hangul',10,9,1),
      ('pepero',11,11,1),('christmas',12,24,2),('yearend',12,30,2)
    ) h(name,month_no,day_no,span)
  ), choices as (
    select e.kind,on_day-e.start_on as day_no,e.priority from events e
    where on_day >= e.start_on and on_day < e.start_on + e.span
    union all
    select (array['winter','spring','summer','autumn'])[1+((c.m % 12) / 3)],
           2*((c.m % 12) % 3)+(on_day-w.saturday), 3
    from calendar c cross join lateral (
      select c.first_day + ((6-extract(isodow from c.first_day)::int+7)%7)+7 as saturday
    ) w
    where on_day between w.saturday and w.saturday+1
  )
  select c.kind,c.day_no from choices c order by c.priority limit 1;
$$;
revoke all on function pajang_private.question_occasion(date) from public,anon,authenticated;

create function pajang_private.question_for_window(on_day date,in_slot text)
returns jsonb language sql stable strict set search_path='' as $$
  with position as (
    select 1 + 2 * (on_day-date '2026-11-18') + (in_slot='pm')::int as number,
           extract(year from on_day)::int % 2 as edition
    where on_day>=date '2026-11-18' and in_slot in ('am','pm')
  ), choices as (
    select q.id,0 as rank
    from position p cross join pajang_private.question_occasion(on_day) e
    join pajang_private.question_catalog q on q.occasion=e.kind
      and q.edition=p.edition and q.turn=2*e.day_no+(in_slot='pm')::int
    union all
    select q.id,case when q.id=p.number then 1 else 2 end
    from position p join pajang_private.question_catalog q
      on q.occasion is null and q.id in (p.number,1+(p.number-1)%732)
  )
  select jsonb_build_object('id',q.id,'q',jsonb_build_array(q.prompt),'answers',q.samples)
  from choices c join pajang_private.question_catalog q using(id)
  order by c.rank limit 1;
$$;
revoke all on function pajang_private.question_for_window(date,text) from public,anon,authenticated;

-- Stale clients must never save an answer under a different prompt.
create or replace function public.pajang_member(p_action text default 'state',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=ojjuda_restaurants_internal.require_member();
 active_window record; today date; stamp bigint; accepted_at timestamptz; mine pajang_private.people; peer uuid; age_now int; display_name text;
 val text:=btrim(coalesce(p_data->>'body','')); cleanname text:=btrim(coalesce(p_data->>'name','')); reg text:=p_data->>'region'; pref text:=p_data->>'interest';
 known_age int; lim int; mid uuid; ownloc pajang_private.locations; answer jsonb; people jsonb; sig jsonb; pr jsonb; result jsonb; question jsonb;
begin
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception '회원 로그인이 필요해요.' using errcode='42501'; end if;
 -- Decide the slot after waiting for another request from this member.
 if p_action not in ('state','entry','thread') then perform pg_advisory_xact_lock(hashtextextended(u::text,125)); end if;
 accepted_at := clock_timestamp();
 select * into active_window from pajang_private.answer_window(accepted_at);
 today := active_window.day;
 stamp := floor(extract(epoch from accepted_at)*1000);
 select extract(year from age(today,i.birth_date))::int into known_age from ojjuda_account_internal.member_identity i where i.user_id=u;
 if known_age is not null and known_age<19 then raise exception '파장은 만 19세 이상 회원만 이용할 수 있어요.' using errcode='42501'; end if;
 select left(nickname,12) into display_name from public.profiles where id=u;
 select * into mine from pajang_private.people where owner_id=u;
 if p_action not in ('thread','delete') then
   question := pajang_private.question_for_window(today,active_window.slot);
 end if;
 if p_action='entry' then
   return jsonb_build_object(
     'day',today,'slot',active_window.slot,'nextAt',active_window.next_at,'question',question,
     'joined',mine.id is not null,'nickname',display_name,'age',known_age,
     'body',(select a.body from pajang_private.answers a
             where a.person=mine.id and a.day=today and a.slot=active_window.slot));
 end if;

 if p_action in ('join','answer') or (p_action='signal' and p_data ? 'slot') then
   if p_data->>'day' is distinct from today::text or p_data->>'slot' is distinct from active_window.slot then
     raise exception '질문 시간이 바뀌었어요. 새 질문을 확인해 주세요.' using errcode='PT409';
   end if;
 end if;
 if p_action in ('join','answer') and question is not null and
      p_data->>'questionId' is distinct from question->>'id' then
   raise exception '질문이 바뀌었어요. 페이지를 새로고침하고 새 질문을 확인해 주세요.' using errcode='PT409';
 end if;
 -- A retry of a completed join must leave both its answer and profile untouched.
 if (p_action='join' and mine.id is null) or p_action='profile' then
   age_now:=coalesce(known_age,(p_data->>'age')::integer);
   if cleanname='' or char_length(cleanname)>12 or age_now is null or age_now not between 19 and 110
      or reg is null or (reg is distinct from mine.region and not exists(
        select from pajang_private.region_choices c where c.region=reg))
      or pref is null or pref not in ('vinyl','coffee','walk','camera','book','tennis') then
     raise exception '닉네임, 만 나이, 지역과 취향을 확인해 주세요.';
   end if;
   if mine.id is null and (p_action<>'join' or (p_data->'consent') is distinct from 'true'::jsonb) then
     raise exception '첫 참여 동의가 필요해요.';
   end if;
   insert into pajang_private.people(owner_id,name,age,region,interest) values(u,cleanname,age_now,reg,pref)
   on conflict(owner_id) do update set name=excluded.name,age=excluded.age,region=excluded.region,interest=excluded.interest
   returning * into mine;
 end if;
 if mine.id is null then raise exception '질문에 답하고 파장에 참여해 주세요.' using errcode='42501';end if;
 if p_action in ('join','answer') then
   if char_length(val) not between 1 and 220 then raise exception '이번 답변을 1~220자로 적어 주세요.';end if;
   insert into pajang_private.answers(person,day,slot,body,at) values(mine.id,today,active_window.slot,val,stamp)
   on conflict(person,day,slot) do nothing;
 elsif p_action in ('signal','message','block','thread') then
   peer:=(p_data->>'peer')::uuid;
   if peer is not null and p_action<>'thread' then perform pg_advisory_xact_lock(hashtextextended(least(mine.id,peer)::text||greatest(mine.id,peer)::text,126));end if;
   if peer is null or not pajang_private.clear_pair(mine.id,peer) or not exists(select from pajang_private.people where id=peer) then raise exception '이 프로필을 이용할 수 없어요.' using errcode='42501'; end if;
   if p_action='signal' then
     if p_data->>'day' is distinct from today::text or not exists(select from pajang_private.answers where person=mine.id and day=today and slot=active_window.slot) or not(exists(select from pajang_private.answers where person=peer and day=today and slot=active_window.slot) or exists(select from pajang_private.signals where src=peer and dst=mine.id)) then raise exception '오늘의 답변을 확인해 주세요.';end if;
     if not exists(select from pajang_private.signals where src=mine.id and dst=peer) then
       if (select count(*) from pajang_private.signals where src=mine.id and day=today)>=3 then raise exception '오늘 보낼 신호를 모두 사용했어요.';end if;
       insert into pajang_private.signals values(mine.id,peer,today,coalesce(p_data->>'note',''),stamp);
     end if;
   elsif p_action='block' then insert into pajang_private.blocks values(mine.id,peer) on conflict do nothing;
   else
     if not(exists(select from pajang_private.signals where src=mine.id and dst=peer) and exists(select from pajang_private.signals where src=peer and dst=mine.id)) then raise exception '서로 신호를 보낸 회원만 대화할 수 있어요.' using errcode='42501';end if;
     if p_action='thread' then return coalesce((select jsonb_agg(to_jsonb(m) order by m.at,m.id) from (select * from pajang_private.messages where (src=mine.id and dst=peer) or(src=peer and dst=mine.id) order by at desc,id desc limit 100)m),'[]');end if;
     mid:=(p_data->>'id')::uuid;
     if mid is null or char_length(val) not between 1 and 500 then raise exception '메시지를 확인해 주세요.';end if;
     insert into pajang_private.messages values(mid,mine.id,peer,val,stamp) on conflict(id) do nothing;
     if not exists(select from pajang_private.messages where id=mid and src=mine.id and dst=peer and body=val) then raise exception '메시지를 다시 보내 주세요.';end if;
   end if;
 elsif p_action='radar-enable' then
   if (p_data->'consent') is distinct from 'true'::jsonb then raise exception '위치 사용 동의가 필요해요.';end if;
   delete from pajang_private.locations where day<today;
   insert into pajang_private.locations values(mine.id,today,(p_data->>'latCell')::integer,(p_data->>'lonCell')::integer,(p_data->'shareBearing') is not distinct from 'true'::jsonb)
   on conflict(person) do update set day=excluded.day,lat=excluded.lat,lon=excluded.lon,direction=excluded.direction;
 elsif p_action='radar-disable' then delete from pajang_private.locations where person=mine.id;
 elsif p_action='delete' then delete from pajang_private.people where id=mine.id; return jsonb_build_object('deleted',true);
 elsif p_action not in ('state','profile') then raise exception '지원하지 않는 요청이에요.';end if;
 select * into ownloc from pajang_private.locations where person=mine.id and day=today;
 select jsonb_build_object('body',a.body,'at',a.at) into answer from pajang_private.answers a where a.person=mine.id and a.day=today and a.slot=active_window.slot;
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',m.id,'name',m.name,'age',m.age,'region',m.region,'interest',m.interest,'body',a.body,'at',a.at))||pajang_private.rangeinfo(ownloc,l) order by a.at desc nulls last),'[]')
 into people from pajang_private.people m left join pajang_private.answers a on a.person=m.id and a.day=today and a.slot=active_window.slot left join pajang_private.locations l on l.person=m.id and l.day=today
 where pajang_private.clear_pair(mine.id,m.id) and (a.person is not null or exists(select from pajang_private.signals where (src=mine.id and dst=m.id) or(src=m.id and dst=mine.id)));
 select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc),'[]') into sig from pajang_private.signals t where (src=mine.id or dst=mine.id) and pajang_private.clear_pair(src,dst);
 select count(*) into lim from pajang_private.signals where src=mine.id and day=today;
 pr:=jsonb_build_object('id',mine.id,'name',mine.name,'age',mine.age,'region',mine.region,'interest',mine.interest)||coalesce(answer,'{}');
 result:=jsonb_build_object('day',today,'slot',active_window.slot,'nextAt',active_window.next_at,'question',question,'authenticated',true,'me',pr,'people',people,'signals',sig,'messages','[]'::jsonb,'remaining',greatest(0,3-lim),'radarOn',ownloc.person is not null,'radarDirectionOn',coalesce(ownloc.direction,false));
 return result;
end; $$;
