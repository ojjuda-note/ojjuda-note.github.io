# 별천지 빈방 알림

새 오쭈다 회원 전용 기능의 통합 API다. 이전 Star 도우미나 별도 Sites 배포를 사용하지 않는다.

## 이용 조건과 예약 연결

- `전체 / 주말 / 평일`, `전체 / 2인 / 4인 / 6인 / 8인`을 지원한다.
- 주말은 **금·토 입실 또는 대한민국 공휴일 전날 입실**이다. 평일은 그 외 입실일이다. 날짜 계산은 한국 시간 기준이다.
- 현재부터 45일 안의 **1박** 객실을 확인한다. 인원을 고르면 확인된 최대 정원이 해당 인원 이상인 객실만 표시한다. `전체`는 정원으로 제외하지 않는다.
- 영업·휴무 여부는 예약처의 실제 달력만 따른다. 특정 휴무 요일을 별도로 고정하지 않는다.
- 예약 버튼은 해당 객실의 네이버 예약 주소로 연결한다. 객실 상세 화면에 맞는 `startDateTime`·`endDateTime`을 전달한다. 네이버 로그인, 최종 인원 확인, 예약 확정과 결제는 네이버에서 진행한다. 예약을 대신 제출하거나 결제하지 않는다.

공식 예약처: <https://booking.naver.com/booking/3/bizes/1627625>.

## API

기본 URL: `https://ziezbdjofcugznowiuda.supabase.co/functions/v1/byeolcheonji`

| 요청 | 결과 |
| --- | --- |
| `GET /status` | VAPID 공개키, 마지막 조회 시각, 본인 기기의 알림 설정 |
| `GET /availability?dateMode=all&guests=all` | 확인된 빈방과 정확한 객실 예약 URL, 조회 불확실 여부 |
| `POST /subscription` | 현재 조건과 기기의 PushSubscription 등록 |
| `DELETE /subscription` | 본인 기기의 등록 삭제 |
| `POST /test` | 본인 기기에 테스트 알림 전송; 공급자의 수락만 확인 |
| `POST /tick` | 서명된 내부 스케줄러 전용 |

회원 요청은 `Authorization: Bearer <Ojjuda access token>`이 필요하다. 기기 등록·삭제·테스트에는 별도의 `X-Device-Token`도 필요하다. 토큰은 32바이트의 무작위 Base64URL 값이며 서버에는 SHA-256 해시만 저장한다. `/status`에서 기기 토큰은 선택 사항이다. 회원 토큰을 URL에 넣지 않는다.

`POST /subscription`의 본문은 `{ subscription, filters: { dateMode, guests } }`다. 응답과 오류는 JSON이며 오류는 `{error, code, retryAfter?}` 형태다. 다른 조회가 진행 중이면 `inventory_loading`과 5초 재시도 안내를 반환할 수 있다. 브라우저 CORS와 변경 요청 Origin은 `ojjuda.kr`, `www.ojjuda.kr`만 허용한다.

## 회원과 데이터 보호

Auth 서버가 토큰을 검증한 후 실제 `auth.sessions`, `auth.users`, `public.profiles`를 확인한다. 익명 계정, 삭제된 회원, 만료·삭제된 세션, Auth 또는 `public.user_private`의 이용 제한 계정은 차단한다. 회원이 수정할 수 있는 메타데이터로 권한을 판정하지 않는다.

`byeolcheonji_internal`은 비공개 스키마다. 모든 테이블에 RLS를 켜고 PUBLIC·anon·authenticated의 접근 권한을 제거한다. 각 기기의 등록은 회원 ID와 기기 토큰 해시에 함께 묶인다. 다른 회원·다른 기기 토큰은 기존 endpoint를 가져갈 수 없다. 회원 삭제 시 외래키로 해당 등록도 삭제한다. 백그라운드 발송 직전에도 실제 회원 상태와 설정 revision을 다시 확인한다.

VAPID 비밀키와 스케줄러 서명키는 Vault에만 저장한다. 스케줄러 요청에는 120초 유효 서명, 일회용 nonce, 일반 조회/검사 모드를 넣는다. DB의 기본 함수 권한을 철회하여 브라우저가 dispatch를 실행할 수 없게 한다. 원본 키나 기기 endpoint를 로그에 출력하지 않는다.

## 빈방 조회와 알림

회원 화면과 스케줄러는 DB에 저장된 같은 재고 캐시를 사용한다. DB 임대와 소유 토큰으로 여러 서버가 예약처를 동시에 반복 조회하지 않게 한다. 성공한 조회는 약 2분간 공유한다. 실패한 갱신은 오래된 긍정 결과를 이용할 수 없게 표시하고, 요청 제한 시 5분간 대기한다. 공식 요청 제한을 우회하지 않는다.

빈방은 객실 접수 상태, 날짜별 영업·판매 상태, 예약·점유 수를 뺀 잔여 재고가 확인된 경우에만 표시한다. 누락된 날짜나 실패한 객실은 매진으로 확정하지 않는다. 같은 날짜·객실은 새로 열렸을 때 한 번 알리며, 조회 실패 중에도 기존 알림 이력을 보존한다. 실제 마감 후 재개된 경우에는 다시 알린다.

등록된 회원이 없으면 스케줄러가 예약처 조회를 생략한다. 한 회원은 최대 5개 기기를 등록할 수 있다. 한 차례에 최대 20개 기기에 병렬 4개씩 전송한다. 미전송 건은 다음 차례에 남고 오류 시 대기 후 다시 전송한다. 만료된 기기 endpoint는 삭제한다. 브라우저 알림 공급자의 수락은 실제 휴대폰 표시를 증명하지 않으므로, 사용자가 테스트 알림 표시를 확인해야 한다.

공휴일 기본 자료는 우주항공청 2026/2027 월력요항을 반영하고, Nager.Date의 국가·연도·공휴일 구분이 검증된 자료를 합친다. 12월 31일 주말 분류에는 다음 해 1월 1일도 조회한다. 해당 연도의 자료가 없으면 불확실한 날짜를 주말·평일로 단정하지 않는다. `전체` 날짜 조회는 휴일 분류 실패로 제외하지 않는다.

## 배포 순서

1. `schema.sql`을 오쭈다 DB에 적용한다. 기존 기능의 테이블·작업은 변경하지 않는다.
2. Edge Function 이름 `byeolcheonji`로 `index.ts`, `model.mjs`, `provider.mjs`, `security.mjs`, `deno.json`을 배포한다. 이 함수는 자체 회원 인증과 별도 스케줄러 인증을 수행하므로 게이트웨이 `verify_jwt`는 `false`다.
3. DB 소유자로 `select byeolcheonji_internal.dispatch(true);`를 실행하고 반환된 요청 ID의 `net._http_response`를 확인한다. 검사 모드는 암호화와 실제 재고 조회를 확인하지만 기기에 알림을 보내지 않는다.
4. 검사 성공 후 `schedule.sql`을 적용한다. 작업 이름은 `byeolcheonji-vacancies-every-two-minutes`이며 2분마다 실행한다.
5. 비회원 API 차단, 회원 조회, 예약처 연결, 본인 기기의 알림 동의를 확인한다. 일반 사용자의 기기 등록을 임의로 만들지 않는다.

기능 코드는 Git 저장소에서 관리한다. schema와 배포를 임의의 브라우저 세션이나 사용자 비밀키에 의존시키지 않는다.

## 검증

```sh
node --test tests/byeolcheonji-model.test.mjs tests/byeolcheonji-provider.test.mjs tests/byeolcheonji-security.test.mjs tests/byeolcheonji-db.test.cjs
```

DB 테스트는 PGlite에 플랫폼 확장 부분만 시험용으로 대체하여 실제 스키마, 접근 권한, 회원 삭제 정리, 중복 endpoint, nonce 재사용 차단, 임대 소유권을 검증한다. 모델·공급자 테스트는 날짜 경계, 필터, 객실 정원, 부분 실패, 요청 제한, 중복 알림과 예약 URL을 검증한다. 라이브 예약이나 결제는 테스트하지 않는다.
