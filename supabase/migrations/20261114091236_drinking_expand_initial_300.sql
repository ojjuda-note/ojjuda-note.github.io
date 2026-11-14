-- Add 300 reviewed initial entries; preserve existing IDs, queues and room snapshots.
begin;
select pg_advisory_xact_lock(24613,911);
-- Store reviewed answer words privately while every playable prompt stays two initials.
-- Compatibility initials remain valid for existing rows, old clients and admin edits.
create or replace function ojjuda_arcade_internal.drinking_initial_key(p_body text)
returns text language sql immutable strict security invoker set search_path='' as $initial_key$
 select case
  when pg_catalog.char_length(p_body)=2
   and p_body ~ '^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$' then p_body
  when pg_catalog.char_length(p_body)=2
   and pg_catalog.ascii(pg_catalog.substr(p_body,1,1)) between 44032 and 55203
   and pg_catalog.ascii(pg_catalog.substr(p_body,2,1)) between 44032 and 55203 then
    pg_catalog.substr('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ',
     (pg_catalog.ascii(pg_catalog.substr(p_body,1,1))-44032)/588+1,1)
    ||pg_catalog.substr('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ',
     (pg_catalog.ascii(pg_catalog.substr(p_body,2,1))-44032)/588+1,1)
  else null
 end;
$initial_key$;
revoke all on function ojjuda_arcade_internal.drinking_initial_key(text) from public,anon,authenticated;

-- Identify the exact previous initial-only check; leave all other checks intact.
do $initial_constraint$
declare
 prior_check constant text:=$check$CHECK (((kind <> 'initial'::text) OR (body ~ '^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$'::text)))$check$;
 check_name text;
 matches integer;
begin
 select count(*),min(conname) into matches,check_name from pg_catalog.pg_constraint
 where conrelid='ojjuda_arcade_internal.drinking_content_items'::regclass
  and contype='c' and pg_catalog.pg_get_constraintdef(oid)=prior_check;
 if matches<>1 then raise exception 'initial_word_constraint_source_changed'; end if;
 execute pg_catalog.format('alter table ojjuda_arcade_internal.drinking_content_items drop constraint %I',check_name);
 execute pg_catalog.format('alter table ojjuda_arcade_internal.drinking_content_items add constraint %I check (kind<>''initial'' or ojjuda_arcade_internal.drinking_initial_key(body) is not null)',check_name);
end;
$initial_constraint$;

-- Guard both small edits against drift. The original member/admin checks, raw
-- admin list, revision races and the other games' 68% party preference stay intact.
do $initial_catalog$
declare
 definition text:=pg_catalog.pg_get_functiondef('ojjuda_arcade_internal.drinking_content(text,jsonb)'::regprocedure);
 prior_pool constant text:=$old_pool$   else
    if favor_party then
     select exists(select 1 from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and party_pick) into favor_party;
    end if;
    select coalesce(jsonb_agg(case when second is null then to_jsonb(body) else jsonb_build_array(body,second) end order by id),'[]'::jsonb)
     into lines from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and (not coalesce(favor_party,false) or party_pick);$old_pool$;
 next_pool constant text:=$new_pool$   elsif requested='initial' then
    -- Group first: words sharing an initial key neither leak nor weight the draw.
    with keys as (
     select ojjuda_arcade_internal.drinking_initial_key(body) as initial_key,
      min(id) as first_id,bool_or(party_pick) as party_pick
     from ojjuda_arcade_internal.drinking_content_items where active and kind='initial'
     group by ojjuda_arcade_internal.drinking_initial_key(body)
    )
    select coalesce(jsonb_agg(initial_key order by first_id),'[]'::jsonb) into lines
    from keys where initial_key is not null
     and (not coalesce(favor_party,false) or party_pick
      or not exists(select 1 from keys where initial_key is not null and party_pick));
   else
    if favor_party then
     select exists(select 1 from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and party_pick) into favor_party;
    end if;
    select coalesce(jsonb_agg(case when second is null then to_jsonb(body) else jsonb_build_array(body,second) end order by id),'[]'::jsonb)
     into lines from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and (not coalesce(favor_party,false) or party_pick);$new_pool$;
 prior_validation constant text:=$old_validation$or (requested='initial' and wording !~ '^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$')$old_validation$;
 next_validation constant text:=$new_validation$or (requested='initial' and ojjuda_arcade_internal.drinking_initial_key(wording) is null)$new_validation$;
begin
 if length(definition)-length(replace(definition,prior_pool,''))<>length(prior_pool)
  or length(definition)-length(replace(definition,prior_validation,''))<>length(prior_validation) then
  raise exception 'initial_word_catalog_source_changed';
 end if;
 -- CREATE OR REPLACE preserves the function identity, owner and existing grants.
 execute replace(replace(definition,prior_pool,next_pool),prior_validation,next_validation);
end;
$initial_catalog$;

-- Only the initial path changes. Keep every other game's draw byte-for-byte,
-- including the party preference added after the original managed-draw migration.
do $initial_draw$
declare
 definition text:=pg_catalog.pg_get_functiondef('ojjuda_arcade_internal.drinking_draw_prompt(text,text[])'::regprocedure);
 prior_draw constant text:=$old_draw$declare
 result text[];
 favor_party boolean:=random()<0.68;
begin
 select case when c.second is null then array[c.body] else array[c.body,c.second] end
 into result
 from ojjuda_arcade_internal.drinking_content_items c
 where c.kind=p_kind and c.active
 order by case when c.body is distinct from p_previous[1] then 0
               when c.second is distinct from p_previous[2] then 1 else 2 end,
          case when favor_party and c.party_pick then 0 else 1 end, random()
 limit 1;
 if not found then raise exception 'invalid_game'; end if;
 return result;
end;$old_draw$;
 next_draw constant text:=$new_draw$declare
 result text[];
 favor_party boolean:=random()<0.68;
begin
 if p_kind='initial' then
  with keys as (
   select ojjuda_arcade_internal.drinking_initial_key(c.body) as initial_key,
    bool_or(c.party_pick) as party_pick
   from ojjuda_arcade_internal.drinking_content_items c
   where c.kind='initial' and c.active
   group by ojjuda_arcade_internal.drinking_initial_key(c.body)
  )
  select array[k.initial_key] into result from keys k
  where k.initial_key is not null
   and (k.initial_key is distinct from ojjuda_arcade_internal.drinking_initial_key(p_previous[1])
    or not exists(select 1 from keys other where other.initial_key is not null
     and other.initial_key is distinct from ojjuda_arcade_internal.drinking_initial_key(p_previous[1])))
  order by case when favor_party and k.party_pick then 0 else 1 end,random()
  limit 1;
  -- A sole remaining key may repeat, matching the existing last-prompt fallback.
  if not found then raise exception 'invalid_game'; end if;
  return result;
 end if;
 select case when c.second is null then array[c.body] else array[c.body,c.second] end
 into result
 from ojjuda_arcade_internal.drinking_content_items c
 where c.kind=p_kind and c.active
 order by case when c.body is distinct from p_previous[1] then 0
               when c.second is distinct from p_previous[2] then 1 else 2 end,
          case when favor_party and c.party_pick then 0 else 1 end, random()
 limit 1;
 if not found then raise exception 'invalid_game'; end if;
 return result;
end;$new_draw$;
begin
 if length(definition)-length(replace(definition,prior_draw,''))<>length(prior_draw) then
  raise exception 'initial_word_draw_source_changed';
 end if;
 execute replace(definition,prior_draw,next_draw);
end;
$initial_draw$;
insert into ojjuda_arcade_internal.drinking_content_items(kind,body,second,party_pick)
select 'initial',entry#>>'{}',null,true
from jsonb_array_elements($cards$[
  "가수",
  "가슴",
  "간식",
  "감성",
  "고수",
  "고민",
  "가면",
  "구멍",
  "구매",
  "고무",
  "고백",
  "가방",
  "간밤",
  "군밤",
  "기분",
  "감정",
  "고집",
  "걱정",
  "가족",
  "거짓",
  "기대",
  "구두",
  "기도",
  "감동",
  "고독",
  "냄새",
  "낚시",
  "농사",
  "녹색",
  "뉴스",
  "도시",
  "도서",
  "동생",
  "단서",
  "대사",
  "동전",
  "도전",
  "단점",
  "대접",
  "도장",
  "미소",
  "목숨",
  "맹세",
  "무시",
  "모습",
  "매점",
  "문자",
  "매장",
  "문제",
  "면접",
  "방송",
  "버스",
  "비서",
  "박수",
  "분수",
  "베개",
  "비결",
  "비교",
  "배경",
  "비극",
  "반지",
  "비전",
  "부장",
  "부자",
  "봉지",
  "사과",
  "소개",
  "소금",
  "시간",
  "수건",
  "새벽",
  "선배",
  "신부",
  "수박",
  "손발",
  "상상",
  "시선",
  "실수",
  "수술",
  "소설",
  "사이",
  "사연",
  "선약",
  "수업",
  "소원",
  "사진",
  "사전",
  "술집",
  "손짓",
  "심장",
  "애교",
  "안경",
  "얼굴",
  "연기",
  "야근",
  "약속",
  "이성",
  "의심",
  "인사",
  "음식",
  "애정",
  "연주",
  "의지",
  "인정",
  "의자",
  "자기",
  "자극",
  "진급",
  "장갑",
  "지갑",
  "질색",
  "질서",
  "진실",
  "진심",
  "자세",
  "친구",
  "출근",
  "축구",
  "창고",
  "최고",
  "고개",
  "가구",
  "가게",
  "고기",
  "구경",
  "가난",
  "그늘",
  "개념",
  "기념",
  "기능",
  "거리",
  "고래",
  "구름",
  "그림",
  "가루",
  "가을",
  "가위",
  "게임",
  "거울",
  "기억",
  "김치",
  "기차",
  "고추",
  "경찰",
  "관찰",
  "기타",
  "교통",
  "검토",
  "감탄",
  "개통",
  "간판",
  "거품",
  "골프",
  "공포",
  "경품",
  "기회",
  "고향",
  "결혼",
  "계획",
  "경험",
  "날개",
  "농구",
  "내기",
  "눈길",
  "난간",
  "나라",
  "노래",
  "노루",
  "노력",
  "능력",
  "나무",
  "나물",
  "눈물",
  "눈매",
  "냉면",
  "나비",
  "나방",
  "냄비",
  "눈빛",
  "낭비",
  "내일",
  "내용",
  "놀이",
  "노인",
  "녹음",
  "남자",
  "낮잠",
  "늦잠",
  "낙지",
  "농장",
  "달걀",
  "당근",
  "동굴",
  "도구",
  "등교",
  "다리",
  "도로",
  "달력",
  "드럼",
  "동료",
  "동물",
  "대문",
  "도마",
  "단맛",
  "뒷면",
  "두부",
  "담배",
  "대박",
  "돌봄",
  "답변",
  "단어",
  "더위",
  "다음",
  "동요",
  "동의",
  "단추",
  "대추",
  "당첨",
  "도착",
  "대출",
  "대화",
  "대학",
  "대회",
  "동화",
  "다행",
  "물건",
  "모기",
  "물감",
  "무게",
  "마개",
  "마늘",
  "메뉴",
  "만남",
  "막내",
  "무늬",
  "머리",
  "무릎",
  "모래",
  "미래",
  "매력",
  "멀미",
  "몸매",
  "메모",
  "매미",
  "맹물",
  "마법",
  "모범",
  "문법",
  "말벗",
  "멤버",
  "마음",
  "미역",
  "목욕",
  "모임",
  "마을",
  "비누",
  "바늘",
  "비닐",
  "배낭",
  "분노",
  "바람",
  "보리",
  "벌레",
  "볼링",
  "비료",
  "비밀",
  "발목",
  "반말",
  "별명",
  "부모",
  "바위",
  "배우",
  "병원",
  "비옷",
  "부엌",
  "소녀",
  "사냥",
  "손님",
  "실내",
  "소년",
  "사랑",
  "사람",
  "소리",
  "서랍",
  "술래",
  "언니",
  "오늘",
  "아내",
  "양념",
  "안녕",
  "요리",
  "이름",
  "여름",
  "오리",
  "음료",
  "자유",
  "장어",
  "주인",
  "직원",
  "졸음"
]$cards$::jsonb) entry;
notify pgrst,'reload schema';
commit;
