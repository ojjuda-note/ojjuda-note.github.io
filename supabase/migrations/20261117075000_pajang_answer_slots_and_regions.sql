-- Both the RPC and legacy backfill use the same Seoul noon/midnight boundaries.
create function pajang_private.answer_window(instant timestamptz)
returns table(day date, slot text, next_at timestamptz)
language sql stable strict set search_path='' as $$
  select local_time::date,
         case when local_time::time < time '12:00' then 'am' else 'pm' end,
         (local_time::date + case when local_time::time < time '12:00'
           then interval '12 hours' else interval '1 day' end) at time zone 'Asia/Seoul'
  from (select instant at time zone 'Asia/Seoul' as local_time) as clock;
$$;
revoke all on function pajang_private.answer_window(timestamptz) from public, anon, authenticated;

alter table pajang_private.answers add column slot text;
update pajang_private.answers as a
set slot=(select w.slot from pajang_private.answer_window(to_timestamp(a.at / 1000.0)) as w);
alter table pajang_private.answers
  alter column slot set not null,
  add check(slot in ('am','pm')),
  drop constraint answers_pkey,
  add primary key(person,day,slot);
create index answers_by_window on pajang_private.answers(day,slot,at desc);

-- The province alone is a complete choice. City/county names are qualified by province.
create table pajang_private.region_choices(region text primary key);
alter table pajang_private.region_choices enable row level security;
revoke all on table pajang_private.region_choices from public, anon, authenticated;
insert into pajang_private.region_choices(region)
select concat_ws(' ', province, nullif(city,''))
from (values
  ('서울특별시', array[]::text[]),
  ('부산광역시', array['기장군']::text[]),
  ('대구광역시', array['군위군','달성군']::text[]),
  ('인천광역시', array['강화군','옹진군']::text[]),
  ('대전광역시', array[]::text[]),
  ('울산광역시', array['울주군']::text[]),
  ('세종특별자치시', array[]::text[]),
  ('경기도', array['가평군','고양시','과천시','광명시','광주시','구리시','군포시','김포시','남양주시','동두천시','부천시','성남시','수원시','시흥시','안산시','안성시','안양시','양주시','양평군','여주시','연천군','오산시','용인시','의왕시','의정부시','이천시','파주시','평택시','포천시','하남시','화성시']::text[]),
  ('강원특별자치도', array['강릉시','고성군','동해시','삼척시','속초시','양구군','양양군','영월군','원주시','인제군','정선군','철원군','춘천시','태백시','평창군','홍천군','화천군','횡성군']::text[]),
  ('충청북도', array['괴산군','단양군','보은군','영동군','옥천군','음성군','제천시','증평군','진천군','청주시','충주시']::text[]),
  ('충청남도', array['계룡시','공주시','금산군','논산시','당진시','보령시','부여군','서산시','서천군','아산시','예산군','천안시','청양군','태안군','홍성군']::text[]),
  ('전북특별자치도', array['고창군','군산시','김제시','남원시','무주군','부안군','순창군','완주군','익산시','임실군','장수군','전주시','정읍시','진안군']::text[]),
  ('전남광주통합특별시', array['강진군','고흥군','곡성군','광양시','구례군','나주시','담양군','목포시','무안군','보성군','순천시','신안군','여수시','영광군','영암군','완도군','장성군','장흥군','진도군','함평군','해남군','화순군']::text[]),
  ('경상북도', array['경산시','경주시','고령군','구미시','김천시','문경시','봉화군','상주시','성주군','안동시','영덕군','영양군','영주시','영천시','예천군','울릉군','울진군','의성군','청도군','청송군','칠곡군','포항시']::text[]),
  ('경상남도', array['거제시','거창군','고성군','김해시','남해군','밀양시','사천시','산청군','양산시','의령군','진주시','창녕군','창원시','통영시','하동군','함안군','함양군','합천군']::text[]),
  ('제주특별자치도', array['서귀포시','제주시']::text[])
) as areas(province,cities)
cross join lateral unnest(array_prepend('',cities)) as pick(city);

-- Seoul boroughs have one unambiguous parent. Broad legacy labels remain until edited.
update pajang_private.people set region='서울특별시'
where region in ('마포구','성동구','종로구','용산구','서대문구','영등포구','서울 기타');

create or replace function public.pajang_member(p_action text default 'state',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=ojjuda_restaurants_internal.require_member();
 active_window record; today date; stamp bigint; accepted_at timestamptz; mine pajang_private.people; peer uuid; age_now int; display_name text;
 val text:=btrim(coalesce(p_data->>'body','')); cleanname text:=btrim(coalesce(p_data->>'name','')); reg text:=p_data->>'region'; pref text:=p_data->>'interest';
 known_age int; lim int; mid uuid; ownloc pajang_private.locations; answer jsonb; people jsonb; sig jsonb; pr jsonb; result jsonb;
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
 if p_action='entry' then
   return jsonb_build_object(
     'day',today,'slot',active_window.slot,'nextAt',active_window.next_at,
     'joined',mine.id is not null,'nickname',display_name,'age',known_age,
     'body',(select a.body from pajang_private.answers a
             where a.person=mine.id and a.day=today and a.slot=active_window.slot));
 end if;

 if p_action in ('join','answer') or (p_action='signal' and p_data ? 'slot') then
   if p_data->>'day' is distinct from today::text or p_data->>'slot' is distinct from active_window.slot then
     raise exception '질문 시간이 바뀌었어요. 새 질문을 확인해 주세요.' using errcode='PT409';
   end if;
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
 result:=jsonb_build_object('day',today,'slot',active_window.slot,'nextAt',active_window.next_at,'authenticated',true,'me',pr,'people',people,'signals',sig,'messages','[]'::jsonb,'remaining',greatest(0,3-lim),'radarOn',ownloc.person is not null,'radarDirectionOn',coalesce(ownloc.direction,false));
 return result;
end; $$;
