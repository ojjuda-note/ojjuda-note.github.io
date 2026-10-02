# 맞고 오락실 연결 · 2026-10-03

- 자뻑을 먹으면 상대 피 2장을 가져옵니다. 손패·뒤집은 패 모두 적용하며, 상대 뻑은 1장입니다. 다른 피 가져오기 보상과 합산하고, 부족하면 있는 만큼만 가져옵니다.
- 만 19세 이상만 입장할 수 있습니다. 미만·비로그인·생년월일 미등록 계정에는 오락실의 맞고 버튼이 보이지 않습니다. 직접 URL, 게임 시작, 골드 조회·충전·정산도 나이를 확인합니다.
- 나이는 서버에 저장된 가입 생년월일을 한국시간 기준으로 계산합니다. 현재 정보는 직접 등록한 생년월일이며 휴대폰 본인인증으로 확인한 나이는 아닙니다.
- 게임머니는 골드입니다. 처음 한 번 5,000골드를 지급하며, 패배 후 잔액은 최소 0입니다.
- 0골드일 때 한국시간 하루 2회, 매회 5,000골드 무료 리필. 이후에는 사용자가 `5쭈 사용 · 5,000골드` 버튼을 누르면 5쭈를 차감하고 충전합니다. 한국시간 자정에 무료 횟수가 초기화됩니다.
- 골드와 무료 횟수는 계정별 서버 저장입니다. 초기 지급 중복, 반복 정산, 충전 중복 차감, 잔액 부족, 날짜 전환을 처리합니다.
- 실제 손패 진행·선택·고/스톱·흔들기·국진 전환 기록을 서버의 같은 규칙 엔진으로 재생하고 골드를 정산합니다. 클라이언트가 주장하는 승리/잔액/가격은 사용하지 않습니다.
- 골드에서 쭈로 바꾸거나 승리 보상으로 쭈를 지급하는 기능은 없습니다.

## 배포 파일

`world.html`, `matgo-access.js`, `matgo-bridge.js`, `games/matgo.html`, `games/matgo-engine.mjs`, `games/matgo-wallet.mjs`.
기존 `config.js`는 오쭈다 월드 프로젝트를 계속 사용합니다. 서버 마이그레이션은 `supabase/migrations/20261002195728_matgo_gold_wallet.sql`, Edge Function은 `supabase/functions/matgo/`입니다.
서버 적용 후 프런트 파일을 함께 배포해야 합니다. HTML 하나만 교체하는 예전 설치 방법은 이 버전에 적용되지 않습니다.
Edge Function은 요청마다 Supabase Auth로 사용자를 재검증하고, 서비스 전용 함수에서 회원 나이를 확인합니다. 서비스 키는 서버 환경변수에만 둡니다.
게임과 Edge의 엔진 파일은 동일해야 하며 테스트가 이를 검사합니다.

## 검사

- 자뻑과 상대 뻑의 양쪽 플레이어·손패·뒤집기, 보너스·싹쓸이 합산, 피 부족: 16가지.
- 자동 대국 300판: 전부 종료, 매 단계 50장 보존·중복 없음.
- 서버 대국 재생 100판, 금액 위조·미완료 대국 차단, 잔액 0 처리.
- 서버 금액·연령·무료/유료 리필·중복·쭈 부족·한국시간 날짜 전환 검사.
- 브라우저: 직접 접속 차단, 19세 미만 버튼 숨김, 성인 오락실 입장, 로그아웃, 모바일 320/390/768px, 실제 한 판 정산, 무료/유료 충전 화면.

## 화투 그림 출처
- 도안: Marcus Richert. 원도안: Louie Mantia, Jr.
- 원본: https://www.marcusrichert.com/images/hwatu/
- 라이선스: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- 라이선스 전문: https://creativecommons.org/licenses/by-sa/4.0/legalcode
- 변경: 개별 PNG를 240 × 391 WebP로 축소·변환하고 게임 화면에 맞춰 표시했습니다. 11월 붉은 바탕 쌍피를 해당 점수 카드와 연결했습니다.
- 위 화투 그림과 변환본은 CC BY-SA 4.0으로 제공됩니다. 이 고지는 해당 그림 자산에 적용됩니다.
- 재배포할 때 이 출처와 게임 안 규칙 화면의 출처 표시를 유지하세요.
- 보너스패·뒷면은 이번 수정에서 작성한 도형입니다. 효과음 출처는 아래와 같습니다.


## 보내주신 녹음으로 효과음 교체 (2026-10-02)
- 첫 타격 녹음 `음성 261002_211048.m4a`: 빈 바닥에 놓을 때의 둔탁한 소리입니다.
- 새 타격 녹음 `음성 261002_212740-1.m4a`: 기존 패 위에 놓을 때의 짝 소리입니다.
- 두 번째 파일 `음성 261002_211212.m4a`: 딴 패 가져오기와 피 가져오기에 사용합니다.
- 녹음의 짧은 구간을 골라 앞뒤 여백과 음량을 정리했습니다. 원래 재생 속도와 음높이를 유지합니다.
- 빈 바닥과 패 위 착지에 각각 가장 분명한 주 타격 구간을 사용하여 소리가 들쭉날쭉하지 않게 했습니다.
- 이전 외부 효과음을 제거하고, 기본 패 효과음은 제공된 세 녹음으로 구성했습니다. 이벤트에는 아래의 별도 효과음을 사용합니다.
- 기본 패 녹음은 48kHz 모노 PCM-16으로 HTML에 내장되어 별도 음원 업로드나 외부 다운로드가 필요 없습니다.
- 소리 끄기는 재생 중이거나 예약된 소리에 즉시 적용됩니다.

### 사용 구간
- 내려치기: 최신 타격 녹음 2.735–2.925초 / 0.585–0.835초 / 1.790–1.985초
- 가져오기: 두 번째 녹음 2.350–2.720초
- 음원 출처: 이번 대화에서 사용자가 제공한 위 세 녹음.


### 이벤트 음원 출처
라이선스: https://creativecommons.org/publicdomain/zero/1.0/
- Wood Block — Sassaby, CC0 1.0: https://freesound.org/people/Sassaby/sounds/533093/
- Gong 1_5 — Joao_Janz, CC0 1.0: https://freesound.org/people/Joao_Janz/sounds/482642/
- Aplause - short burst.wav — soundmary, CC0 1.0: https://freesound.org/people/soundmary/sounds/117592/
- Triangle_Open_04 — cabled_mess, CC0 1.0: https://freesound.org/people/cabled_mess/sounds/349504/
- Cash Register (imitation with toaster and bells) — modusmogulus, CC0 1.0: https://freesound.org/people/modusmogulus/sounds/794903/
- wah wah sad trombone.wav — kirbydx, CC0 1.0: https://freesound.org/people/kirbydx/sounds/175409/
- Big Maraca OS 1 — Sadiquecat, CC0 1.0: https://freesound.org/people/Sadiquecat/sounds/792505/
- BD2.wav — Tristan, CC0 1.0: https://freesound.org/people/Tristan/sounds/16786/


