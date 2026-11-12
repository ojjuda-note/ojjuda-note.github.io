# 별빛 사주팔자 계산 기준

## 계산 범위

`engine.mjs`는 브라우저 안에서 양력·한국 음력 생일을 변환하고 년주·월주·일주·시주를 계산한다. API 호출, 회원 데이터 읽기, 생년월일 저장은 없다. 같은 입력은 같은 결과를 만든다.

- 입력 연도는 1900년부터 현재까지이며, 라이브러리 상한은 2050년이다. 존재하지 않는 생일과 미래 생일·시각은 거절한다.
- 음력 입력은 한국 음력 기준이며 평달과 윤달을 구별한다. `korean-lunar-calendar`가 유효한 날짜인지 확인한 뒤 양력으로 변환한다. 중국 음력 날짜로 대체하지 않는다.
- 입력 시각은 **현대 한국 표준시 UTC+9**다. 출생지 경도에 따른 태양시, 역사적인 UTC+8:30 표준시, 과거 서머타임은 보정하지 않는다. 이 한계는 결과의 `conventions`에도 반환한다.
- 년주는 입춘 순간, 월주는 12절의 교체 순간을 사용한다. `lunar-javascript`가 제공하는 UTC+8 절기 시각과 비교할 때만 한국 시각을 1시간 앞선 시각으로 변환한다. 한국의 일주·시주를 계산할 때 날짜나 시간을 1시간 빼지 않는다.
- 일주는 자정에 바뀐다. 시주는 `lunar-javascript`의 공식 `EightChar` 기본 `sect=2`와 같은 야자시 분리법이다. 23:00~23:59의 일주는 당일이지만 자시의 시주는 다음 일간을 사용하며, 다음 날 00:00~00:59까지 동일한 시주로 이어진다. 23시에 일주도 바꾸는 유파와는 결과가 다를 수 있다.
- 오행은 표시된 천간·지지의 대표 오행을 각각 한 글자로 센다. 지장간, 월령·계절의 세기, 합·충, 신강·신약, 대운 등을 종합한 수치가 아니다.

## 불확실한 출생시각

`hour: null`은 시간 모름이며 `hour: 0`과 구별한다. 시주를 임의의 시간으로 채우지 않는다. 해당 한국 날짜의 시작과 끝에서 년·월주가 달라지면 그 주도 확정하지 않고 두 후보를 반환한다.

입력이 분 단위이므로, 입력한 1분 안에 절기가 바뀌는 경우 역시 해당 년·월주를 확정하지 않는다. 결과의 `warnings`, `pillars[].uncertain`, `pillars[].alternatives`를 표시해야 한다. 오행 집계에는 확정된 글자만 포함하며 `knownCharacterCount`는 2·4·6·8 중 하나다.

## 인터페이스

```js
import { calculateSaju } from './engine.mjs';
const result = calculateSaju({
  year: 2005, month: 12, day: 23,
  calendar: 'solar', leapMonth: false,
  hour: 8, minute: 37,
});
```

잘못된 입력은 한국어 `message`와 안정된 `code`를 가진 `SajuInputError`를 던진다. 코드: `input`, `calendar`, `year`, `date`, `leap-month`, `time`, `clock`, `future`, `range`.

주요 반환값:

- `solar`, `lunar`: 변환된 날짜와 표시용 `label`; `solar.iso`, `lunar.leapMonth` 포함.
- `timeKnown`, `timeLabel`: 알려진 시각인지와 표시용 문구.
- `pillars`: `year`, `month`, `day`, `hour` 순서. 각 항목에 한자·한글·천간·지지·확정 여부·후보가 있다. 미확정이면 `hanja`, `hangul`, `stem`, `branch`는 `null`이다.
- `dayMaster`: 확정된 일간의 한자·한글·오행·음양.
- `elements`, `knownCharacterCount`: 확정된 글자만 집계한 목·화·토·금·수.
- `warnings`, `conventions`: 사용자가 결과를 이해할 때 필요한 제한과 기준.

## 고정한 외부 소스와 재현

모두 MIT 라이선스이며 원문 라이선스를 `vendor/`에 함께 보존했다.

| 구성 | 고정 버전·원본 | 용도 |
| --- | --- | --- |
| `korean-lunar-calendar` | npm `0.4.0`; [원저작자 저장소](https://github.com/usingsky/korean_lunar_calendar_js), 확인한 소스 커밋 `6f988e3f50a424d165b9834f9e28cd3ea962da63` | 한국 음양력·윤달·일간지 |
| `lunar-javascript` | `1.7.8`; [고정 소스 커밋](https://github.com/6tail/lunar-javascript/tree/5c92e62c904ba5cc0b62f032796aeef433702268) | 정확한 절기 경계의 년·월간지 |
| esbuild | `0.25.12` (빌드 시에만 사용) | 원본을 정적 브라우저 ESM으로 bundle/minify |

한국 음력 라이브러리는 npm 패키지의 `dist/korean-lunar-calendar.mjs`를 `format=esm`, `platform=browser`, `target=es2020`, `bundle=true`, `minify=true`로 빌드했다. lunar는 고정 커밋의 `lunar.js`를 import한 다음 `export const Solar = lunar.Solar`를 내보내는 작은 ESM 진입점을 같은 설정으로 빌드했다. 원본 알고리즘·표는 수정하지 않았다. 실행 시 npm/CDN/빌드 도구를 필요로 하지 않는다.

공식 참고:

- [한국음력 라이브러리 사용법과 지원 범위](https://github.com/usingsky/korean_lunar_calendar_js#readme)
- [lunar 절기와 절입 시각](https://6tail.cn/calendar/lunar.jieqi.html)
- [lunar 간지·자시 유파 설명](https://6tail.cn/calendar/lunar.ganzhi.html)
- [lunar 시간대·진태양시 FAQ](https://6tail.cn/calendar/faq.html)
- [공식 EightChar 테스트](https://github.com/6tail/lunar-javascript/blob/5c92e62c904ba5cc0b62f032796aeef433702268/__tests__/EightChar.test.js)

## 확인 방법

```sh
node --test tests/saju-engine.test.mjs
```

공식 예제 간지, 한국 음력·윤달 변환, 한국·중국 달력이 다른 날짜, 잘못된 날짜, 미래 입력, 자정·23시, 한국 시각의 입춘 전후, 절기 경계의 분 정밀도, 시간 모름을 확인한다. 풀이 문구는 전통적 상징을 바탕으로 한 감상용 문구이며 계산으로 미래를 예측한다는 뜻은 아니다.
