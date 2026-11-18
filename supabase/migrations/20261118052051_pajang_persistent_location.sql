-- The switch belongs to the member. Coordinates still expire each Seoul day.
alter table pajang_private.people
  add column location_enabled boolean not null default true,
  add column location_version bigint not null default 0;

CREATE OR REPLACE FUNCTION public.pajang_member(p_action text DEFAULT 'state'::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid:=ojjuda_restaurants_internal.require_member();
 active_window record; today date; stamp bigint; accepted_at timestamptz; mine pajang_private.people; peer uuid; display_name text;
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
     'locationEnabled',coalesce(mine.location_enabled,true),'locationVersion',coalesce(mine.location_version,0),
     'body',(select a.body from pajang_private.answers a
             where a.person=mine.id and a.day=today and a.slot=active_window.slot));
 end if;

 if p_action in ('join','answer','edit-answer') or (p_action='signal' and p_data ? 'slot') then
   if p_data->>'day' is distinct from today::text or p_data->>'slot' is distinct from active_window.slot then
     raise exception '질문 시간이 바뀌었어요. 새 질문을 확인해 주세요.' using errcode='PT409';
   end if;
 end if;
 if p_action in ('join','answer','edit-answer') and question is not null and
      p_data->>'questionId' is distinct from question->>'id' then
   raise exception '질문이 바뀌었어요. 페이지를 새로고침하고 새 질문을 확인해 주세요.' using errcode='PT409';
 end if;
 -- A retry of a completed join must leave both its answer and profile untouched.
 if (p_action in ('join','participate') and mine.id is null) or p_action='profile' then
   cleanname:=coalesce(nullif(cleanname,''),case when not (p_data ? 'name') then mine.name end,
                       nullif(btrim(display_name),''),'파장 회원');
   reg:=btrim(coalesce(reg,mine.region,''));
   pref:=btrim(coalesce(pref,mine.interest,''));
   if char_length(cleanname)>12
      or (reg<>'' and reg is distinct from mine.region and not exists(
        select from pajang_private.region_choices c where c.region=reg))
      or pref not in ('','vinyl','coffee','walk','camera','book','tennis') then
     raise exception '닉네임, 활동 지역과 공개 취향을 확인해 주세요.';
   end if;
   -- Older clients may send a self-reported age. It must never override account details.
   if known_age is null and mine.id is null and p_data->>'age' is not null and
      (p_data->>'age')::integer not between 19 and 110 then
     raise exception '파장은 만 19세 이상 회원만 이용할 수 있어요.' using errcode='42501';
   end if;
   if mine.id is null and (p_action not in ('join','participate') or (p_data->'consent') is distinct from 'true'::jsonb) then
     raise exception '첫 참여 동의가 필요해요.';
   end if;
   insert into pajang_private.people(owner_id,name,region,interest) values(u,cleanname,reg,pref)
   on conflict(owner_id) do update set name=excluded.name,region=excluded.region,interest=excluded.interest
   returning * into mine;
 end if;
 if mine.id is null then raise exception '먼저 파장에 참여해 주세요.' using errcode='42501';end if;
 if p_action in ('join','answer','edit-answer') then
   if char_length(val) not between 1 and 220 then raise exception '이번 답변을 1~220자로 적어 주세요.';end if;
   if p_action='edit-answer' then
     -- Keep the original publication time, visibility and signal references.
     update pajang_private.answers a set body=val
     where a.person=mine.id and a.day=today and a.slot=active_window.slot
       and p_data->>'previousBody' is not null
       and (a.body=p_data->>'previousBody' or a.body=val);
     if not found then
       raise exception '기존 답변이 달라졌어요. 창을 닫고 최신 답변을 다시 열어 주세요.' using errcode='PT412';
     end if;
   else
     insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived)
     values(mine.id,today,active_window.slot,val,stamp,
       coalesce(question #>> '{q,0}',pajang_private.legacy_prompt(today,active_window.slot)),
       (p_data->'archive') is not distinct from 'true'::jsonb)
     on conflict(person,day,slot) do nothing;
   end if;
 elsif p_action in ('signal','message','block','thread') then
   peer:=(p_data->>'peer')::uuid;
   if peer is not null and p_action<>'thread' then perform pg_advisory_xact_lock(hashtextextended(least(mine.id,peer)::text||greatest(mine.id,peer)::text,126));end if;
   if peer is null or not pajang_private.clear_pair(mine.id,peer) or not exists(select from pajang_private.people where id=peer) then raise exception '이 프로필을 이용할 수 없어요.' using errcode='42501'; end if;
   if p_action='signal' then
     if p_data ? 'answerDay' or p_data ? 'answerSlot' then
       -- A signal from the board must name the exact visible answer, including past rounds.
       if not exists (
         select from pajang_private.answers a where a.person=peer
           and a.day=(p_data->>'answerDay')::date and a.slot=p_data->>'answerSlot'
           and pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,active_window.slot)
       ) then raise exception '지금 볼 수 있는 답변을 선택해 주세요.' using errcode='PT409'; end if;
     elsif p_data->>'day' is distinct from today::text or not (
       exists(select from pajang_private.answers where person=peer and day=today and slot=active_window.slot)
       or exists(select from pajang_private.signals where src=peer and dst=mine.id)
     ) then raise exception '답변이나 받은 신호를 확인해 주세요.'; end if;
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
 elsif p_action in ('radar-enable','radar-disable') then
   -- Automatic arrivals may update a cell, but never override a later switch choice.
   if p_data ? 'accountId' and p_data->>'accountId' is distinct from u::text then
     raise exception '회원 정보를 다시 확인해 주세요.' using errcode='42501';
   end if;
   if (p_data->'automatic') is not distinct from 'true'::jsonb then
     if p_action<>'radar-enable' or not mine.location_enabled or
        p_data->>'locationVersion' is distinct from mine.location_version::text then
       return public.pajang_member('state');
     end if;
   else
     if p_data ? 'locationVersion' and p_data->>'locationVersion' is distinct from mine.location_version::text then
       raise exception '다른 화면에서 위치 설정이 바뀌었어요. 현재 설정을 확인해 주세요.' using errcode='PT412';
     end if;
     update pajang_private.people set location_enabled=(p_action='radar-enable'),
       location_version=location_version+1 where id=mine.id returning * into mine;
   end if;
   if p_action='radar-enable' then
     if (p_data->'consent') is distinct from 'true'::jsonb then raise exception '위치 사용 동의가 필요해요.';end if;
     delete from pajang_private.locations where day<today;
     insert into pajang_private.locations values(mine.id,today,(p_data->>'latCell')::integer,(p_data->>'lonCell')::integer,(p_data->'shareBearing') is not distinct from 'true'::jsonb)
     on conflict(person) do update set day=excluded.day,lat=excluded.lat,lon=excluded.lon,direction=excluded.direction;
   else
     delete from pajang_private.locations where person=mine.id;
   end if;
 elsif p_action='delete' then delete from pajang_private.people where id=mine.id; return jsonb_build_object('deleted',true);
 elsif p_action not in ('state','profile','participate') then raise exception '지원하지 않는 요청이에요.';end if;
 select * into ownloc from pajang_private.locations where person=mine.id and day=today;
 select jsonb_build_object('body',a.body,'at',a.at) into answer from pajang_private.answers a where a.person=mine.id and a.day=today and a.slot=active_window.slot;
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',m.id,'name',m.name,'region',m.region,'interest',m.interest,'body',a.body,'at',a.at))||pajang_private.rangeinfo(ownloc,l) order by a.at desc nulls last),'[]')
 into people from pajang_private.people m left join pajang_private.answers a on a.person=m.id and a.day=today and a.slot=active_window.slot left join pajang_private.locations l on l.person=m.id and l.day=today
 where pajang_private.clear_pair(mine.id,m.id) and (a.person is not null or exists(select from pajang_private.signals where (src=mine.id and dst=m.id) or(src=m.id and dst=mine.id)));
 select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc),'[]') into sig from pajang_private.signals t where (src=mine.id or dst=mine.id) and pajang_private.clear_pair(src,dst);
 select count(*) into lim from pajang_private.signals where src=mine.id and day=today;
 pr:=jsonb_build_object('id',mine.id,'name',mine.name,'age',known_age,'region',mine.region,'interest',mine.interest)||coalesce(answer,'{}');
 result:=jsonb_build_object('day',today,'slot',active_window.slot,'nextAt',active_window.next_at,'question',question,'authenticated',true,'me',pr,'people',people,'signals',sig,'messages','[]'::jsonb,'remaining',greatest(0,3-lim),'locationEnabled',mine.location_enabled,'locationVersion',mine.location_version,'radarOn',ownloc.person is not null,'radarDirectionOn',coalesce(ownloc.direction,false));
 return result;
end; $function$
