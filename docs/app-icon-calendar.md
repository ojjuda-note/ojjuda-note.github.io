# 앱 아이콘 달력

`shared/app-icons/calendar.json`은 웹과 Android가 함께 쓰는 데이터다. 스크립트나 이미지 URL을 실행하지 않으며, 설치된 8개 테마만 선택한다.

## 날짜와 우선순위

- 한국 시각(KST, UTC+09:00)을 기준으로 한다. 기기의 시간대 설정에 따라 달라지지 않는다.
- 봄은 3~5월, 여름은 6~8월, 가을은 9~11월, 겨울은 12~2월이다.
- 행사는 **본날 7일 전부터** 시작한다. 새해는 12월 25일~1월 1일, 크리스마스는 12월 18~25일, 설·추석은 본날 D-7~D+1이다. 시작일과 종료일을 모두 포함한다.
- 겹치면 **오늘이 본날인 행사 → 높은 `priority` → 본날까지의 절대 일수가 작은 행사 → ASCII 순으로 앞선 `id`** 순서로 선택한다. 따라서 12월 25일은 크리스마스, 12월 26일은 새해다.
- 행사가 끝나면 그 날짜의 계절로 돌아간다. 대체·임시 공휴일은 자동으로 범위를 늘리지 않는다.

## Schema 1

| 필드 | 형식 / 의미 |
| --- | --- |
| `schemaVersion`, `timezone` | `1`, `Asia/Seoul` 고정 |
| `revision` | 데이터 수정 시 갱신하는 식별자 |
| `themes` | `spring`, `summer`, `autumn`, `winter`, `newyear`, `seollal`, `chuseok`, `christmas` |
| `seasons` | `{theme, months:[1..12]}`. 4계절과 12개월을 중복 없이 모두 포함 |
| `annualEvents` | 매년 반복. `start`, `end`, `eventDate`는 `MM-DD` |
| `datedEvents` | 특정 날짜 행사. 같은 필드가 `YYYY-MM-DD` |
| 행사 `id`, `theme`, `priority` | ID는 `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`, 테마는 위 8개 중 하나, 우선순위는 정수 0~1000 |
| 행사 `start`, `end`, `eventDate` | 적용 시작일, 종료일, 본날. 실제 선택에는 이 세 날짜를 사용 |
| 행사 `leadDays`, `endOffsetDays` | 날짜를 만든 기준을 기록한 메타데이터. 기본 7일 전부터 시작하고 본날 또는 다음 날 종료 |
| `lunarCoverage`, `sources` | 음력 데이터의 검증 범위와 출처. 선택 코드가 출처 URL을 요청하지 않음 |

연간 행사의 `start > end`는 연말을 넘는 범위다. 예를 들어 새해 `eventDate: "01-01"`은 12월 구간에서는 다음 해 1월 1일을 뜻한다. 행사 ID는 달력 전체에서 고유하게 작성한다. 중복 ID가 들어오면 첫 유효 항목만 사용한다.

새 행사는 `datedEvents`에 넣는다. **기본 시작일은 본날에서 7일을 뺀 날짜**로 기입하고 실제 종료일까지 범위를 명시한다. 기존 8개 테마 중 하나를 재사용한다. 새 테마를 추가하려면 웹 이미지와 Android 별칭도 함께 배포해야 한다.

```json
{
  "id": "anniversary-2027",
  "theme": "newyear",
  "eventDate": "2027-07-15",
  "start": "2027-07-08",
  "end": "2027-07-15",
  "leadDays": 7,
  "endOffsetDays": 0,
  "priority": 300
}
```

## 음력 날짜 출처

2026년 11월 19일, [한국천문연구원 음양력 변환 계산](https://astro.kasi.re.kr/life/pageView/8)의 공개 조회 응답 20개를 확인했다. 설은 **평달 1월 1일**, 추석은 **평달 8월 15일**을 입력하고 응답의 `SOLC_YYYY`, `SOLC_MM`, `SOLC_DD`를 사용했다. 각 항목의 `sourceUrl`과 `sourceResponseSha256`에 조회 주소와 당시 응답 해시를 남겼다. 예: [2026년 설 조회](https://astro.kasi.re.kr/life/lunc?yyyy=2026&mm=01&dd=01), [2035년 추석 조회](https://astro.kasi.re.kr/life/lunc?yyyy=2035&mm=08&dd=15).

같은 20개 날짜를 [korean-lunar-calendar 0.4.0](https://pypi.org/project/korean-lunar-calendar/0.4.0/)의 `setLunarDate(year, month, day, False)`로 별도 계산해 모두 일치함을 확인했다. [프로젝트 원문](https://github.com/usingsky/korean_lunar_calendar_py)은 한국 음양력 변환표를 사용한다고 설명한다. 이 Python 패키지는 검증에만 사용했으며 앱 실행 의존성에 추가하지 않았다.

| 연도 | 설 본날 | 추석 본날 |
| --- | --- | --- |
| 2026 | 02-17 | 09-25 |
| 2027 | 02-07 | 09-15 |
| 2028 | 01-27 | 10-03 |
| 2029 | 02-13 | 09-22 |
| 2030 | 02-03 | 09-12 |
| 2031 | 01-23 | 10-01 |
| 2032 | 02-11 | 09-19 |
| 2033 | 01-31 | 09-08 |
| 2034 | 02-19 | 09-27 |
| 2035 | 02-08 | 09-16 |

이는 한국 음력 날짜를 변환한 자료이며, 향후 정부가 지정하는 전체 공휴일 목록은 아니다. 2036년 이후 음력 행사는 추정하지 않는다. 다음 범위를 공식 변환 결과로 검증해 추가하기 전까지 계절·양력 반복 행사만 적용한다.

## 선택 모듈과 검증

`shared/app-icons/selector.mjs`는 순수 함수만 제공한다. 시계·파일·네트워크를 읽지 않는다.

```js
import { selectTheme, getThemeSelection, toKstDate } from './shared/app-icons/selector.mjs';
selectTheme('2026-12-25', calendar); // 'christmas'
getThemeSelection('2026-12-25T15:00:00Z', calendar);
// {theme:'newyear', date:'2026-12-26', reason:'event', eventId:'newyear'}
```

입력은 `Date`, epoch 밀리초, 시간대가 명시된 ISO 문자열, `YYYY-MM-DD`다. 날짜만 있는 문자열은 이미 지정된 한국 날짜로 취급한다. 잘못된 날짜나 시간대 없는 시각은 `RangeError`로 거부한다.

잘못된 개별 행사는 무시한다. 전체 설정의 버전·시간대·테마·월 범위가 잘못됐거나 행사가 총 512개를 넘으면 기본 계절을 반환한다(`reason: "fallback"`). Android는 원격 설정을 채택하기 전에 검증하고, 실패하면 앱에 포함된 달력으로 돌아간다.

```sh
node --test tests/app-icon-calendar.test.mjs
```

테스트는 검증한 음력 20개 날짜, D-8/D-7/본날/종료 다음 날, 연말 겹침, 한국 자정, 우선순위, 잘못된 설정과 미래 음력 날짜의 비추정을 확인한다.
