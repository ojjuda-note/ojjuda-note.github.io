# 가입 자동 닉네임 단어

`words.txt`는 국립국어원 **표준국어대사전**의 2026-06-05 내려받기 자료에서 추출한 명사 표제어입니다. 출처와 해시는 `source.json`에 기록했습니다. 배포 파일에는 뜻풀이·인용 예문·미디어를 넣지 않았습니다.

- 원출처: https://stdict.korean.go.kr/
- 공개 자료 미러: https://github.com/spellcheck-ko/korean-dict-nikl/tree/42c0d01889f34536e9cf94fe57f62bd2055b1bde/stdict
- 원자료·수정한 단어 목록의 이용허락: **CC BY-SA 2.0 KR** — https://creativecommons.org/licenses/by-sa/2.0/kr/
- 저작권 정책: https://stdict.korean.go.kr/join/copyrightPolicy.do
- 수정 내용: 한글 1~5음절 명사만 추출, 단어 구분 붙임표 제거, 중복·인명·지명·비하/욕설/성적 표현 제외. 가입 시 기존 서버 금칙어 검사를 추가 적용합니다. 모든 조합의 적절성을 사람이 검수한 목록은 아닙니다.

## 재생성·배포

1. `python3 scripts/build-signup-dictionary.py /absolute/path/to/cache`로 고정한 원본 버전에서 재생성합니다.
2. `signup_korean_nickname_allocation` 마이그레이션을 적용합니다. 스키마와 이 버전의 전체 단어 목록이 하나의 트랜잭션으로 설치됩니다.
3. 단어 수·권한·`suggest_signup_nickname()`을 확인한 뒤 웹 코드를 배포합니다.
4. 이후 사전 목록을 별도로 갱신할 때 `node scripts/seed-signup-dictionary.mjs /absolute/path/to/seed.sql`로 해시를 검증한 단일 SQL 파일을 만들 수 있습니다. 이 INSERT는 기존 가입 예약과 순번을 지우지 않습니다. 이미 적용한 마이그레이션은 수정하지 않습니다.

조합을 전부 저장하지 않습니다. 단어·실제 가입 예약·소진 후 사용한 순번만 저장합니다. 익명 미리보기는 가입 예약이나 숫자 순번을 소비하지 않습니다.
