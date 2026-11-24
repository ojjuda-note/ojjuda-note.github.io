-- Keep token boundaries and vocabulary in sync with note/preview.js.
CREATE OR REPLACE FUNCTION ojjuda_note_internal.park_card_context_tags(p_body text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $tags$
WITH vocabulary AS (
  SELECT lower(word) AS word, tier FROM (VALUES
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
위로 칭찬 혼잣말 앞날 질문 친절 준비 기억 시작 출발 결정 피곤 선택 안심 기대 긴장 인정 검색 대답 대화 인사 지원 실감'),
    (1, '혼자 성공 소리 옷 눈치 분위기 기회 간격 여유 계산 속도 결심 자존감 집중 장소 날짜 자리 바퀴 장면 타이밍 절반 결과 편지 모레 아침 점심 저녁 오후
기분 가격 계획 밥 의자 손끝 조각 재촉 그리움 외로움 머리 밑단 접시 시간표 시각 단계 갈등 계절 페이지 일정 색 행복 토닥토닥 잠 부담 기운 어린이
일상 옆구리 오랜만 자유 관심 깜빡 안전 고생 운동장 고구마 요가 장난감 동물원 어깨 목 마음 정신 짐 돈 느리게 자기비판 조급함 눈길'),
    (2, '하루 오늘 내일 어제 생각 시간 사람 일 말 몸 밤 낮 집 손 눈 문 길 물 차 끝 답 얘기 이야기 별일 매일 언젠가')
  ) AS lists(tier, words)
  CROSS JOIN LATERAL regexp_split_to_table(words, '[[:space:]]+') AS w(word)
), tokens AS MATERIALIZED (
  SELECT parts[1] AS token, pos FROM regexp_matches(coalesce(p_body, ''), '[가-힣A-Za-z0-9]+', 'g')
    WITH ORDINALITY AS t(parts, pos)
), stems AS (
  SELECT pos, token, left(token, n) AS stem, substr(token, n+1) AS ending, n
  FROM tokens CROSS JOIN LATERAL generate_series(1, least(length(token),20)) AS lengths(n)
), recognized AS (
  SELECT DISTINCT ON (pos) pos, stem AS tag, tier FROM stems
  JOIN vocabulary ON word = lower(stem)
  WHERE ending ~ '^(?:(?:들)?(?:에게서|에게|한테서|한테|께서|께|에서|으로부터|으로서|으로써|으로|에까지|에라도|에|부터|까지|처럼|보다|밖에|만큼|마다|조차|대로|이랑|랑|하고|이라도|라도|이나|나|이든|든|과|와|은|는|을|를|이|가|로|의|도|만|엔|에선|서|인|이다|이다가|이라|라|이라서|라서|이고|이고도|인데|인데도|인지는|인지|일수록|이니까|니까|이었던|였던|이었다|였다)?(?:에는|에도|까지|부터|은|는|에|도|만|요|만이라도)?)$'
     OR (lower(stem) = ANY(regexp_split_to_array('완벽 고백 걱정 고민 지각 면접 출근 퇴근 연락 운동 친절 감사 준비 공부 후회 기억 생각 시작 출발 축하 양보 결정 거절 사랑 피곤 실수 수다 통화 요리
선택 청소 빨래 설거지 쇼핑 약속 안심 합격 연애 기대 긴장 지출 인정 검색 사과 부탁 대답 대화 샤워 발표 산책 전화 인사 지원 칭찬 실감','[[:space:]]+')) AND ending ~ '^(?:하|한|할|함|해|했|합니|됩니|되|된|될|돼|됐)[가-힣]*$')
  ORDER BY pos, n DESC
), names AS (
  SELECT pos, parts[1] AS tag, 15 AS tier FROM tokens
  CROSS JOIN LATERAL regexp_match(token, '^([가-힣A-Za-z0-9]{2,14}?)(?:에서|에게|한테|이랑|으로부터|를|은|는|이|가)(?:도|는|만)?$') AS m(parts)
  WHERE token !~ '(다가|기가|보는|가는|오는|하는|되는|있는|없는|같은|않은)$'
    AND NOT EXISTS (SELECT 1 FROM recognized r WHERE r.pos=tokens.pos)
    AND NOT EXISTS (SELECT 1 FROM vocabulary v WHERE v.word=lower(parts[1]))
    AND parts[1] !~ '^(누구|요즘|지금|남들|지나|내일|오늘|자기|누군|누군가|하나|하루|거기|여기|저기|어디|이것|그것|저것|그곳|이곳|저곳|[0-9]+)$'
    AND parts[1] !~ '(다|하기|기기|하|되|리|르|오|가|같|않|싶|많|좋|작|적|늦|높|짧|낮|넓|찾|받|찍|읽|먹|남|닮|맞|젊|얇|입|싶은|하는|되는|있는|없는)$'
  UNION ALL
  SELECT pos, token, 15 FROM tokens WHERE (token ~ '^[A-Za-z][A-Za-z0-9]{1,13}$' OR (token ~ '^[가-힣]{2,10}$'
    AND token !~ '(다|요|어|아|했|네|지|까|고|게|서|는|은|면|든|만|야|죠|래|니|다가|려다가|지만|려고)$'
    AND token !~ '^(그냥|정말|진짜|너무|조금|계속|다시|아직|벌써|누구|어디|이거|그거|저거|아무|아무것|함께|가끔|항상)$'))
    AND (SELECT count(*) FROM tokens)=1
), candidates AS (
  SELECT pos,tag,tier*10 AS tier FROM recognized UNION ALL SELECT * FROM names
), unique_tags AS (
  SELECT DISTINCT ON (lower(tag)) tag,tier,pos FROM candidates ORDER BY lower(tag),tier,pos
), ranked AS (
  SELECT *, min(tier) OVER () AS best, row_number() OVER (PARTITION BY tier ORDER BY pos) AS position_in_tier
  FROM unique_tags
)
SELECT ARRAY(SELECT tag FROM ranked WHERE tier=best AND position_in_tier <= CASE tier WHEN 20 THEN 1 ELSE 3 END ORDER BY pos)
$tags$;
REVOKE ALL ON FUNCTION ojjuda_note_internal.park_card_context_tags(text) FROM PUBLIC;
