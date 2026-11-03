# 축제일정 운영

## 위치와 갱신

- 운영 경로: `https://ojjuda.kr/world.html?game=festival`
- 독립 경로: `https://ojjuda.kr/games/festival-schedule/index.html`
- 오락실 맨 아래 테스트 게임 구역의 `festival` 카드로 실행한다.
- 지도·캘린더·목록은 모두 `games/festival-schedule/events.json`을 사용한다.
- 매일 오후 1시 Asia/Seoul에 연결된 ChatGPT 예약 작업이 공식 자료를 확인하고 변경을 반영한다. 데이터 파일은 최신 상태를 읽도록 캐시를 재검증한다. 브라우저에서 외부 사이트를 직접 긁지 않는다.
- 새 행사/변경 확인 → 데이터 검증 → 관련 테스트 → GitHub PR 검사 → 병합 → GitHub Pages 배포 확인 순으로 진행한다. 관련 없는 수정은 포함하지 않는다.

## 데이터 형식

루트 객체는 `{ "schemaVersion": 1, "updatedAt": "YYYY-MM-DD", "events": [...] }`이다. `updatedAt`은 이 자료 묶음이 마지막으로 변경된 한국 날짜이며, 모든 행사의 재검증을 의미하지 않는다. 실제 검증일은 항목별 `sourceCheckedAt`이다.

필수 필드:

- `id`: 연도·행사를 식별하는 고유 문자열. 같은 행사 수정 시 유지한다(저장 목록과 캘린더 UID 유지).
- `title`, `category`: 종류는 `local`, `campus`, `film`, `expo` 중 하나.
- `start`, `end`: 포함되는 시작일·종료일, `YYYY-MM-DD`. 1일 행사도 둘 다 기록한다.
- `region`: 서울, 부산, 대구, 인천, 광주, 대전, 울산, 세종, 경기, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주 중 하나.
- `city`, `venue`, `address`, `lat`, `lng`, `geoApprox`: 대표 행사장. 근사 좌표는 `geoApprox: true`. 지도 핀으로 정확한 입구라고 주장하지 않는다.
- `summary`, `scheduleNote`, `priceNote`: 확인한 소개·운영 시간·요금. 확인 못 한 정보는 `공식 안내 확인`.
- `accessNote`: 외부인 입장, 나이, 비즈니스데이, 예약, 동의 등 방문 판단에 필요한 조건(해당 시).
- `sourceUrl`, `sourceName`, `sourceCheckedAt`: 근거 URL·기관명·실제 확인 날짜. `verificationSources` 배열에 추가 공식 근거를 보존할 수 있다.
- `status`: `scheduled`(일정으로 진행/예정/종료 자동 계산), `cancelled`, `postponed`.
- 선택 필드: `tags` 문자열 배열.

취소·연기는 기존 항목의 상태와 설명에 명시한다. 연기되어 새 일정이 미정이면 이전 날짜를 보존하되 정상 개최처럼 소개하지 않는다. 새 날짜가 공식 발표되면 같은 ID의 날짜를 수정하고 상태를 `scheduled`로 변경한다. 종료 행사는 `지난 행사 포함` 조회를 위해 남긴다. 복수 장소나 비연속 상영은 공백 기간에도 개최된다고 표시하지 않도록 프로그램별로 분리하거나 세부 일정을 분명히 안내한다.

## 근거 수집

한국관광공사 대한민국 구석구석, 제주관광공사, 각 지자체·관광재단, 대학·총학생회 공식 공지, 영화제·전시 주최 측·전시장 공식 일정을 우선한다. 현재 진행 중과 가까운 예정 행사를 우선 재확인한다. 전국 여러 지역과 네 종류를 함께 조사한다.

검색 요약만으로 연도를 가정하거나, 작년 일정을 올해 날짜로 바꾸거나, 대학축제 출연진·외부인 입장을 추정하지 않는다. 주최 측 최신 변경 공지가 이전 소개보다 우선한다. 새 데이터가 애매하거나 수집 실패 시 기존 정상 데이터를 지우지 말고 해당 항목의 검증일을 유지한다. 취소·연기·입장 제한을 누락하지 않는다.

## 검증과 배포

```sh
node games/festival-schedule/validate.mjs
node tests/festival-core.test.mjs
node tests/festival-entry.test.cjs
node tests/game-release-refresh.test.cjs
```

파일 변경 시 날짜 순서, 중복 ID, 시도명, 좌표 범위, 필수 출처 URL을 검사한다. `events.json`만 바뀌는 업데이트에는 게임 버전이나 아지트 버전을 올릴 필요가 없다. UI/코드 수정은 루트 `AGENTS.md`에 따라 `festival` 게임 버전과 관련 캐시 리비전을 함께 갱신하고, `game-release.json`·로더 revision·world.html 로더 쿼리를 일치시킨다. 아지트 `version.json` 및 `Go`는 변경하지 않는다.

브라우저에서 검색·지역·기간·종류 필터가 지도/캘린더/목록에 일관되게 적용되는지, 여러 날 행사가 매일 표시되는지, 저장과 상세창·캘린더 내보내기·게임 목록 복귀가 작동하는지 확인한다. 캘린더 파일은 종일 일정이고 종료 다음날을 `DTEND`로 사용한다. 내려받은 파일은 이후 변경을 자동 동기화하지 않는다.

지도 경계는 출처가 표시된 KOSTAT 2018 자료를 간소화한 참고용 경계다. 정확한 최신 행정 경계나 입구 안내로 사용하지 않는다. 상세 지도는 사용자가 선택했을 때 OpenStreetMap 타일을 로드하며 저작자 표시를 유지한다.
