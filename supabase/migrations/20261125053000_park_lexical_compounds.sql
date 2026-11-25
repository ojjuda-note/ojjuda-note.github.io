-- Add lexical compounds to the existing keyword classifier; no schedule or row changes.
CREATE OR REPLACE FUNCTION ojjuda_note_internal.park_card_context_tags(p_body text)
RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $tags$
WITH vocabulary AS MATERIALIZED (
  SELECT lower(word) AS word, tier
  FROM (VALUES
    (0, '누리호 면접 지각 NASA 게임대상 만두 붉은사막 스쿼시 안세영 이력서 출근 퇴근 단감 레이더 로봇 반도체 보드게임 붕어빵 빨래 새잎 설거지 슬리퍼 올빼미
우산 운동화 이불 이어폰 청소 친구 카드값 하늘다람쥐 향수 강아지 고양이 그림 기타 꽃 노을 답장 독감 동료 둥지 등산 메일 발표 부모님 비밀번호 사직서
사진 샤워 아이스크림 알람 양말 월급 월세 이직 책 커피 통장 퍼즐 합격 해킹 화분 회의 가계부 가족 과자 국물 국수 귤 김치 냉장고 노래 늦잠 단풍 달걀
도시락 떡볶이 라면 로켓 목성 문단속 미술관 박물관 빵집 산불 산책길 상사 세탁기 쓰레기 안경 야식 열쇠 위성 초콜릿 카레 허리 화성 간식 고분 과일 구름
드라마 메시지 바람 서점 유물 주식 축제 택배 햇빛 햇살 계단 농담 무역 베개 병원 빵 사진첩 시험 영화 자료 전시 전화 정류장 출근길 충전기 퇴근길 휴가
휴대폰 디저트 레시피 배드민턴 버스 서류 소파 숙제 신발 야구 여행 지하철 책상 편의점 AI 공연 마트 말투 반찬 비 알림 엘리베이터 장바구니 카페 골목
동네 문자 보안 수출 아빠 엄마 영상 침대 파일 한글 할인 고백 금요일 메모 소금 아버지 안부 운동 월요일 눈물 라디오 배달 연애 짝사랑 맛집 약 연락
우승 거절 게임 공부 사랑 장보기 후회 반려동물 설렘 시장 통화 가을 겨울 봄 여름 요리 우주 음료 음악 지도 취업 감사 걱정 마우스 산책 서운함 우편물
주말 하늘 고민 기후 다툼 사과 식당 약속 공원 모기 새벽 업무 오해 지출 만남 저녁밥 취미 부탁 쇼핑 절약 회사 휴식 건강 대전 부산 서울 스마트폰 제주
청주 10대 20대 30대 40대 50대 60대 과학 첫인사 행사 모임 상담 집안일 퇴직 실수 응원 취향 식비 잔고 월급날 김치찌개 완벽 점심시간 점심때
요청 수정 시계 메신저 수다 배달비 이체일 입꼬리 가격표 계산기 창가 창밖 옆자리 단톡방 밥상 그릇 문장 토요일 일요일 맞은편 TV 싱크대 숟가락
전자레인지 곰탕 햇볕 셀카 주머니 장갑 조명 오타 단어 메뉴 습관 재료 포장 볶음밥 양배추 커버 스트레스 코드 챕터 우유 세제 옷걸이 첫눈 잔소리 입맛
소식 양보 축하 생일 옷차림 냄새 주황빛 냉면 국 고장 결제 음악회 통장잔고 영어 국어 벚꽃 강아지풀 병아리 종이 딸기 책방 도서관 산더미 서른 음식 문제 창문 가게 공기
위로 칭찬 혼잣말 앞날 질문 손질 필름 필름카메라 만년필 목도리 손뜨개 뜨개질 독서 독서모임 독립서점 동네책방 뜨개실 코바늘 북클럽 수업 도예 머그잔 텃밭 모종 상추 바질 씨앗 화분받침 구독 해지 이체 저축 공과금 전기요금 관리비 배터리 고사리 버섯 김밥 재즈 카메라 양말짝 손편지 한강 수영 기타줄 새우 배달앱 조깅 러닝 마라톤 완주 스케치 수채화 노을빛 보조배터리 옥상 물감 자전거 텀블러 장마철 친절 준비 기억 시작 출발 결정 피곤 선택 안심 기대 긴장 인정 검색 대답 대화 인사 지원 실감'),
    (1, '혼자 성공 소리 옷 눈치 분위기 기회 간격 여유 계산 속도 결심 자존감 집중 장소 날짜 자리 바퀴 장면 타이밍 절반 결과 편지 모레 아침 점심 저녁 오후
기분 가격 계획 밥 의자 손끝 조각 재촉 그리움 외로움 머리 밑단 접시 시간표 시각 단계 갈등 계절 페이지 일정 색 행복 토닥토닥 잠 부담 기운 어린이
일상 옆구리 오랜만 자유 관심 깜빡 안전 고생 운동장 고구마 요가 장난감 동물원 어깨 목 마음 정신 짐 돈 느리게 자기비판 조급함 눈길 작년 올해'),
    (2, '하루 오늘 내일 어제 생각 시간 사람 일 말 몸 밤 낮 집 손 눈 문 길 물 차 끝 답 얘기 이야기 별일 매일 언젠가')
  ) AS lists(tier, words)
  CROSS JOIN LATERAL regexp_split_to_table(words, '[[:space:]]+') AS w(word)
), tokens AS MATERIALIZED (
  SELECT parts[1] AS token, parts[2] AS separator, lead(parts[1]) OVER (ORDER BY pos) AS next_token, pos, count(*) OVER () AS total
  FROM regexp_matches(coalesce(p_body, ''), '(#[가-힣A-Za-z0-9_]+|[가-힣A-Za-z0-9]+)([^가-힣A-Za-z0-9#]*)', 'g')
    WITH ORDINALITY AS t(parts, pos)
), stems AS (
  SELECT pos, left(token,n) AS tag, substr(token,n+1) AS ending, n
  FROM tokens CROSS JOIN LATERAL generate_series(1,least(length(token),20)) AS sizes(n)
  WHERE left(token,1)<>'#'
), recognized AS MATERIALIZED (
  -- A whole compound wins over a shorter word at its start.
  SELECT DISTINCT ON (pos) pos, tag,
    CASE WHEN v.tier IS NULL OR v.tier=0 THEN 6
         WHEN lower(tag)=ANY(string_to_array('돈 밑단 어깨 접시 외로움 그리움 자존감 취향 목도리 밥',' ')) THEN 5
         WHEN v.tier=1 THEN 3 ELSE 1 END AS base,
    (v.tier IS NULL OR v.tier=0) AND n>=3 AS specific, ending
  FROM stems LEFT JOIN vocabulary v ON v.word=lower(tag)
  WHERE (v.word IS NOT NULL OR (n>=3 AND tag ~ '(?:카메라|목도리|자전거|배터리|이어폰|충전기|키보드|마우스|머그잔|텀블러|키링|가방|노트북|도서관|미술관|박물관|책방|서점|빵집|맛집|시장|극장|공방|수업|전시회|음악회|공연장|클럽|동호회|연습장|산책로|산책길|등산로|운동장|정류장|기차역|공원|놀이터|목걸이|돈가스|돈까스|사랑니|팔찌|반지|케이스|향수|운동화|티셔츠|스니커즈|강아지|고양이|강아지풀|꽃다발|나무|라떼|커피|케이크|샌드위치|파스타|볶음밥|김밥|국밥|국수|도시락|찌개|주스|쿠키|독서회|콘서트|동아리|음악제|영화제|전시관|망원경|현미경|에이드|스무디|청바지|카디건|보온병|휴게소|박람회)$'))
    AND (ending ~ '^(?:(?:들)?(?:에게서|에게|한테서|한테|께서|께|에서|으로부터|으로서|으로써|으로|에까지|에라도|에|부터|까지|처럼|보다|밖에|만큼|마다|조차|대로|이랑|랑|하고|이라도|라도|이나|나|이든|든|과|와|은|는|을|를|이|가|로|의|도|만|엔|에선|서|인|이다|이다가|이라|라|이라서|라서|이고|이고도|인데|인데도|인지는|인지|일수록|이니까|니까|이었던|였던|이었다|였다)?(?:에는|에도|까지|부터|은|는|에|도|만|요|만이라도)?)$' OR
      (lower(tag)=ANY(regexp_split_to_array('완벽 고백 걱정 고민 지각 면접 출근 퇴근 연락 운동 친절 감사 준비 공부 후회 기억 생각 시작 출발 축하 양보 결정 거절 사랑 피곤 실수 수다 통화 요리
선택 청소 빨래 설거지 쇼핑 약속 안심 합격 연애 기대 긴장 지출 인정 검색 사과 부탁 대답 대화 샤워 발표 산책 전화 인사 지원 칭찬 실감 손질 독서 구독 해지 이체 저축 조깅 완주 스케치','[[:space:]]+')) AND ending ~ '^(?:하|한|할|함|해|했|합니|됩니|되|된|될|돼|됐)[가-힣]*$'))
  ORDER BY pos,n DESC
), unknowns AS (
  SELECT t.*, regexp_match(token,'^([가-힣A-Za-z0-9]{2,18}?)(들)?(으로부터|에게서|한테서|에서는|에서도|에서|에게|한테|처럼|까지|부터|으로|이랑|에는|에선|엔|을|를|은|는|이|가|에|로|랑)(?:도|는|만)?$') AS parts
  FROM tokens t WHERE left(token,1)<>'#' AND NOT EXISTS (SELECT FROM recognized r WHERE r.pos=t.pos)
), inflected AS (
  SELECT pos, parts[1] AS tag, parts[3] AS particle,
    CASE WHEN right(parts[1],1) ~ '[가-힣]' THEN (ascii(right(parts[1],1))-44032) % 28 ELSE -1 END AS consonant
  FROM unknowns WHERE parts IS NOT NULL AND token !~ '(?:대로|없이|같이|듯이|(?:다|냐|라|자|이|드|추|루|내|려|보|되|하|가|오|르|리|지|있|없)는|(?:다|려다|하나|어|려)가(?:도|는|만)?|(?:같|않|싶|좋|많|있|없|작|적|젊|높|짧|얇|남|맞|받|입|찾|먹|읽|넓|낮|늦|찍|깊|찮)(?:은|을)|(?:하|되|오|가|있|없|같|않|보|르|리|나|지|받|찾|먹|잡|놓|듣|웃|우|주)는|(?:려|다)기에|(?:하|리|보|쉬|알)기(?:로|엔)|으려|면서|느라)$'
    AND parts[1] !~ '^(?:누군가|누군|누구|무언가|무엇|무슨|어디|여기|저기|거기|자기|어떻게|하나|하루|누가|서로|요즘|지금|이번|지난|그때|가끔|한참|갑자기|나머지|한가운데|가운데|하나쯤|부분|결국|자꾸|괜히|역시|그래도|그렇게|이렇게|저렇게|어쩐지|아무것|이것|저것|그것|이곳|저곳|그곳|남들|평소|정도|다음|처음|마지막|나중|사이|그동안|아무|바로|잠깐|조금|한번|진짜|정말|그냥|드디어|아직|벌써|계속|다시|너무|모두|전부|대부분|내일|오늘|어제|누군가랑|이유|예전|며칠|나랑|당장|분들|때문|덕분|주변|다음번|오전|사실|예상|것밖|뿐만|[0-9]+(?:시|분|년|월|일)?)$' AND parts[1] !~ '(?:려다|하다|되다|보다|하는|같은|이는|라는|려는|면서|느라|려다가|하다가|되다가|보다가|하기|리기|기기|말없|정신없|보기|잡기|전에|날에|때만큼|쪽으)$'
    AND (parts[3]<>'는' OR (separator ~ '^[[:blank:]]+$' AND next_token ~ '(?:다|어요|아요|네요|더라|였어|했어|예요|이에요|을|를|에서|에게|한테)$'))
), names AS (
  SELECT pos,tag, CASE WHEN particle IN ('을','를') THEN 7 ELSE 6 END AS weight
  FROM inflected WHERE consonant<0 OR NOT (
    (consonant=0 AND particle IN ('을','은','이','이랑','으로')) OR
    (consonant>0 AND particle IN ('를','는','가','랑')))
), parsed AS (
  SELECT pos, substr(token,2) AS tag, 100 AS weight, true AS explicit FROM tokens
  WHERE left(token,1)='#' AND length(token) BETWEEN 2 AND 21 AND token ~ '[가-힣A-Za-z]'
  UNION ALL
  SELECT pos,tag,base + specific::integer
    + CASE WHEN base>=5 AND ending IN ('을','를') THEN 1
           WHEN base>=5 AND ending IN ('랑','이랑','와','과','하고') THEN -1 ELSE 0 END, false
  FROM recognized
  UNION ALL
  SELECT pos,tag,weight,false FROM names
  UNION ALL
  SELECT pos,token,6,false FROM unknowns WHERE token ~ '^[A-Z][A-Z0-9]{1,9}$'
  UNION ALL
  SELECT pos,token,6,false FROM unknowns u WHERE total=1
    AND token !~ '^[A-Z][A-Z0-9]{1,9}$' AND NOT EXISTS (SELECT FROM names n WHERE n.pos=u.pos)
    AND (token ~ '^[A-Za-z][A-Za-z0-9]{1,13}$' OR (token ~ '^[가-힣]{2,10}$'
      AND token !~ '(?:다|요|어|아|했|네|지|까|고|게|서|는|은|면|든|만|야|죠|래|니|다가|려다가|지만|려고)$' AND token !~ '^(?:그냥|정말|진짜|너무|조금|계속|다시|아직|벌써|누구|어디|이거|그거|저거|아무|아무것|함께|가끔|항상)$'))
), mentions AS (
  SELECT lower(coalesce(c.tag,t.token)) AS key FROM tokens t LEFT JOIN parsed c ON c.pos=t.pos
  GROUP BY lower(coalesce(c.tag,t.token)) HAVING count(*)>1
), candidates AS (
  SELECT * FROM parsed
  UNION ALL
  SELECT u.pos,u.token,6,false FROM unknowns u JOIN mentions m ON m.key=lower(u.token)
  WHERE NOT EXISTS (SELECT FROM parsed p WHERE p.pos=u.pos)
    AND token !~ '(?:도|를|랑|의|에|로)$'
    AND token !~ '^(?:누군가|누군|누구|무언가|무엇|무슨|어디|여기|저기|거기|자기|어떻게|하나|하루|누가|서로|요즘|지금|이번|지난|그때|가끔|한참|갑자기|나머지|한가운데|가운데|하나쯤|부분|결국|자꾸|괜히|역시|그래도|그렇게|이렇게|저렇게|어쩐지|아무것|이것|저것|그것|이곳|저곳|그곳|남들|평소|정도|다음|처음|마지막|나중|사이|그동안|아무|바로|잠깐|조금|한번|진짜|정말|그냥|드디어|아직|벌써|계속|다시|너무|모두|전부|대부분|내일|오늘|어제|누군가랑|이유|예전|며칠|나랑|당장|분들|때문|덕분|주변|다음번|오전|사실|예상|것밖|뿐만|[0-9]+(?:시|분|년|월|일)?)$'
    AND (token ~ '^[A-Za-z][A-Za-z0-9]{1,13}$' OR (token ~ '^[가-힣]{2,10}$'
      AND token !~ '(?:다|요|어|아|했|네|지|까|고|게|서|는|은|면|든|만|야|죠|래|니|다가|려다가|지만|려고)$' AND token !~ '^(?:그냥|정말|진짜|너무|조금|계속|다시|아직|벌써|누구|어디|이거|그거|저거|아무|아무것|함께|가끔|항상)$'))
), phrases AS (
  SELECT c.pos FROM candidates c JOIN tokens t ON t.pos=c.pos
  JOIN candidates following ON following.pos=c.pos+1
  WHERE c.weight>=3 AND following.weight>=3 AND t.token=c.tag AND t.separator ~ '^[[:blank:]]+$'
), weighted AS (
  SELECT c.pos,c.tag,c.explicit,c.weight + CASE WHEN EXISTS
    (SELECT FROM phrases p WHERE p.pos IN (c.pos,c.pos-1)) THEN 2 ELSE 0 END AS weight
  FROM candidates c
), grouped AS (
  SELECT (array_agg(tag ORDER BY pos))[1] AS tag,min(pos) AS pos,bool_or(explicit) AS explicit,
    max(weight) + CASE WHEN max(weight)>1 THEN least(count(*)-1,2)*3 ELSE 0 END AS score
  FROM weighted GROUP BY lower(tag)
), ranked AS (
  SELECT *,least(5,max(score) OVER ()) AS cutoff,row_number() OVER (ORDER BY score DESC,pos) AS preference
  FROM grouped
)
SELECT ARRAY(SELECT tag FROM ranked WHERE score>=cutoff AND preference<=CASE WHEN cutoff=1 THEN 1 ELSE 3 END
             ORDER BY explicit DESC,pos)
$tags$;
