create schema if not exists pajang_private;
revoke all on schema pajang_private from public, anon, authenticated;
create table pajang_private.people(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 12), age int not null check(age between 19 and 110),
 region text not null, interest text not null, joined_at timestamptz not null default now());
create table pajang_private.answers(person uuid references pajang_private.people on delete cascade, day date not null, body text not null check(char_length(body) between 1 and 220), at bigint not null, primary key(person,day));
create table pajang_private.signals(src uuid references pajang_private.people on delete cascade,dst uuid references pajang_private.people on delete cascade,day date not null,note text not null check(char_length(note)<=120),at bigint not null, primary key(src,dst),check(src<>dst));
create table pajang_private.blocks(src uuid references pajang_private.people on delete cascade,dst uuid references pajang_private.people on delete cascade,primary key(src,dst),check(src<>dst));
create table pajang_private.messages(id uuid primary key,src uuid references pajang_private.people on delete cascade,dst uuid references pajang_private.people on delete cascade,body text not null check(char_length(body) between 1 and 500),at bigint not null,check(src<>dst));
create table pajang_private.locations(person uuid primary key references pajang_private.people on delete cascade, day date not null,lat int not null check(abs(lat)<=9000), lon int not null check(abs(lon)<=18000),direction boolean not null);
create index on pajang_private.answers(day,at desc);
create index on pajang_private.signals(dst,at desc);
create index on pajang_private.messages(src,dst,at desc);
alter table pajang_private.people enable row level security;
alter table pajang_private.answers enable row level security;
alter table pajang_private.signals enable row level security;
alter table pajang_private.blocks enable row level security;
alter table pajang_private.messages enable row level security;
alter table pajang_private.locations enable row level security;
revoke all on all tables in schema pajang_private from public,anon,authenticated;

create function pajang_private.clear_pair(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select a<>b and not exists(select from pajang_private.blocks where (src=a and dst=b) or (src=b and dst=a));
$$;
create function pajang_private.rangeinfo(a pajang_private.locations,b pajang_private.locations) returns jsonb language plpgsql immutable set search_path='' as $$
declare x float8; y float8; d float8; band int; bearing int;
begin
 if a.person is null or b.person is null then return '{}'::jsonb; end if;
 d:=power(sin(radians((a.lat-b.lat)/200.0)),2) + cos(radians(a.lat/100.0))*cos(radians(b.lat/100.0))*power(sin(radians((a.lon-b.lon)/200.0)),2);
 d:=12742*asin(sqrt(least(1,greatest(0,d))));
 band:=case when d<=1 then 1 when d<=3 then 3 when d<=7 then 7 when d<=15 then 15 end;
 if band is null then return '{}'::jsonb; end if;
 if not(a.direction and b.direction) then return jsonb_build_object('range',band); end if;
 if a.lat=b.lat and a.lon=b.lon then return jsonb_build_object('range',band,'sameCell',true); end if;
 x:=sin(radians((b.lon-a.lon)/100.0))*cos(radians(b.lat/100.0));
 y:=cos(radians(a.lat/100.0))*sin(radians(b.lat/100.0))-sin(radians(a.lat/100.0))*cos(radians(b.lat/100.0))*cos(radians((b.lon-a.lon)/100.0));
 bearing:=((round(degrees(atan2(x,y))/45.0)::int*45)%360+360)%360;
 return jsonb_build_object('range',band,'bearing',bearing);
end; $$;

create function public.pajang_member(p_action text default 'state',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=ojjuda_restaurants_internal.require_member(); today date:=(now() at time zone 'Asia/Seoul')::date;
 stamp bigint:=floor(extract(epoch from clock_timestamp())*1000); mine pajang_private.people; peer uuid; age_now int; display_name text;
 val text:=btrim(coalesce(p_data->>'body','')); cleanname text:=btrim(coalesce(p_data->>'name','')); reg text:=p_data->>'region'; pref text:=p_data->>'interest';
 known_age int; lim int; mid uuid; ownloc pajang_private.locations; answer jsonb; people jsonb; sig jsonb; pr jsonb; result jsonb;
begin
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception '회원 로그인이 필요해요.' using errcode='42501'; end if;
 select extract(year from age(today,i.birth_date))::int into known_age from ojjuda_account_internal.member_identity i where i.user_id=u;
 if known_age is not null and known_age<19 then raise exception '파장은 만 19세 이상 회원만 이용할 수 있어요.' using errcode='42501'; end if;
 select left(nickname,12) into display_name from public.profiles where id=u;
 if p_action not in ('state','entry','thread') then perform pg_advisory_xact_lock(hashtextextended(u::text,125)); end if;
 select * into mine from pajang_private.people where owner_id=u;
 if p_action='entry' then return jsonb_build_object('day',today,'joined',mine.id is not null,'nickname',display_name,'age',known_age,'body',(select body from pajang_private.answers where person=mine.id and day=today));end if;
 if p_action in ('join','profile') then
   age_now:=coalesce(known_age,(p_data->>'age')::integer);
   if cleanname='' or char_length(cleanname)>12 or age_now is null or age_now not between 19 and 110 or reg is null or reg not in ('마포구','성동구','종로구','용산구','서대문구','영등포구','서울 기타','경기·인천','그 외 지역') or pref is null or pref not in ('vinyl','coffee','walk','camera','book','tennis') then raise exception '닉네임, 만 나이, 지역과 취향을 확인해 주세요.';end if;
   if mine.id is null and (p_action<>'join' or (p_data->'consent') is distinct from 'true'::jsonb) then raise exception '첫 참여 동의가 필요해요.';end if;
   insert into pajang_private.people(owner_id,name,age,region,interest) values(u,cleanname,age_now,reg,pref) on conflict(owner_id) do update set name=excluded.name,age=excluded.age,region=excluded.region,interest=excluded.interest returning * into mine;
 end if;
 if mine.id is null then raise exception '질문에 답하고 파장에 참여해 주세요.' using errcode='42501';end if;
 if p_action in ('join','answer') then
   if p_data->>'day' is distinct from today::text or char_length(val) not between 1 and 220 then raise exception '오늘의 답변을 1~220자로 적어 주세요.';end if;
   insert into pajang_private.answers values(mine.id,today,val,stamp) on conflict(person,day) do update set body=excluded.body,at=excluded.at;
 elsif p_action in ('signal','message','block','thread') then
   peer:=(p_data->>'peer')::uuid;
   if peer is not null and p_action<>'thread' then perform pg_advisory_xact_lock(hashtextextended(least(mine.id,peer)::text||greatest(mine.id,peer)::text,126));end if;
   if peer is null or not pajang_private.clear_pair(mine.id,peer) or not exists(select from pajang_private.people where id=peer) then raise exception '이 프로필을 이용할 수 없어요.' using errcode='42501'; end if;
   if p_action='signal' then
     if p_data->>'day' is distinct from today::text or not exists(select from pajang_private.answers where person=mine.id and day=today) or not(exists(select from pajang_private.answers where person=peer and day=today) or exists(select from pajang_private.signals where src=peer and dst=mine.id)) then raise exception '오늘의 답변을 확인해 주세요.';end if;
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
 select jsonb_build_object('body',a.body,'at',a.at) into answer from pajang_private.answers a where person=mine.id and day=today;
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',m.id,'name',m.name,'age',m.age,'region',m.region,'interest',m.interest,'body',a.body,'at',a.at))||pajang_private.rangeinfo(ownloc,l) order by a.at desc nulls last),'[]')
 into people from pajang_private.people m left join pajang_private.answers a on a.person=m.id and a.day=today left join pajang_private.locations l on l.person=m.id and l.day=today
 where pajang_private.clear_pair(mine.id,m.id) and (a.person is not null or exists(select from pajang_private.signals where (src=mine.id and dst=m.id) or(src=m.id and dst=mine.id)));
 select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc),'[]') into sig from pajang_private.signals t where (src=mine.id or dst=mine.id) and pajang_private.clear_pair(src,dst);
 select count(*) into lim from pajang_private.signals where src=mine.id and day=today;
 pr:=jsonb_build_object('id',mine.id,'name',mine.name,'age',mine.age,'region',mine.region,'interest',mine.interest)||coalesce(answer,'{}');
 result:=jsonb_build_object('day',today,'authenticated',true,'me',pr,'people',people,'signals',sig,'messages','[]'::jsonb,'remaining',greatest(0,3-lim),'radarOn',ownloc.person is not null,'radarDirectionOn',coalesce(ownloc.direction,false));
 return result;
end; $$;
revoke all on all functions in schema pajang_private from public,anon,authenticated;
revoke all on function public.pajang_member(text,jsonb) from public,anon,authenticated;
grant execute on function public.pajang_member(text,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('pajang-member-assets','pajang-member-assets',false,1048576,array['image/webp','application/javascript']) on conflict(id) do nothing;
create function public.pajang_art_allowed() returns boolean stable language sql security definer set search_path='' as $$
 select ojjuda_restaurants_internal.member_allowed() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and not exists(select from ojjuda_account_internal.member_identity where user_id=auth.uid() and birth_date>(now() at time zone 'Asia/Seoul')::date-interval '19 years');
$$;
revoke all on function public.pajang_art_allowed() from public,anon,authenticated;
grant execute on function public.pajang_art_allowed() to authenticated;
create policy pajang_member_asset_read on storage.objects for select to authenticated
using (bucket_id='pajang-member-assets' and (select public.pajang_art_allowed()));
