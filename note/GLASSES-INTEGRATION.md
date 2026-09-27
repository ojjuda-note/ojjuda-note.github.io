# 스마트 글래스 연결 경계

`glasses.html`은 브라우저에서 확인하는 화면 미리보기입니다. 실제 안경에 표시하려면 기기별 앱과 실기 검증이 필요합니다.

## 공통 표시 계약

`glasses.js`는 `window.OJJUDA_GLASS_PREVIEW`를 제공합니다.

- `setLocation({latitude, longitude})`: 위치를 근처 조회 POST RPC로 보내며 화면·URL·저장소·표시 이벤트에 좌표를 넣지 않습니다.
- `setBattery(0..100)`: **안경** 배터리만 전달합니다. 브라우저 배터리 값은 안경 배터리로 취급하지 않습니다.
- `move(-1|1)`, `select()`: 카드 이동과 한 줄/전체 전환.
- `getView()` 및 `ojjuda:glasses-view`: 현재 시각, 배터리, 카드 본문·거리 구간만 전달합니다. 좌표는 없습니다.

근처 조회는 `ojjuda_note.list_cards`의 `p_sort:'nearby'`를 사용합니다. 공개 응답은 서버가 정한 순서와 `distance_band`만 사용합니다. 일반 카드의 정확한 GPS는 응답에서 제외합니다. 위치 접근 거부 시 샘플 화면으로 UI를 살펴볼 수 있습니다.

## Even G2

공식 [Even Hub SDK](https://hub.evenrealities.com/docs/build/display)는 웹앱을 동반 앱의 WebView에서 실행하지만 안경 화면은 HTML/CSS가 아니라 576×288 SDK 컨테이너로 그립니다. `glasses-even-g2.mjs`는 SDK 위치·배터리·터치/링 입력을 공통 계약에 연결하는 **번들링 전 소스**입니다. 배포용 Even Hub 프로젝트에서 SDK를 설치·고정하고 `glasses.js` 로드 후 `attachEvenG2()`를 호출해야 합니다. 매니페스트에 [`location` 권한과 Supabase origin의 `network.whitelist`](https://hub.evenrealities.com/docs/build/networking)를 선언하고, CORS와 로그인/익명 조회 동작을 실제 G2·동반 앱에서 검증해야 합니다. 원본 파일을 GitHub Pages에서 직접 import하면 bare package import가 해석되지 않습니다.

## Rokid

대상은 공식 제품명 [Rokid Glasses (With Display)](https://global.rokid.com/products/rokid-glasses)입니다. 화면이 없는 `Rokid AI Glasses Style`, `Max 2`, `Glass3`의 SDK와 혼동하지 않습니다. Rokid 개발 포털은 동반 Rokid AI 앱을 확장하는 [CXR-L SDK](https://open.rokid.com/sdk?lang=en)와 안경 내부 앱용 [CXR-S SDK/YodaOS-Sprite](https://open.rokid.com/sprite?lang=en)를 안내합니다. 이 리포지토리에는 Rokid 전용 앱 빌드·SDK 인증·실기 연결이 없으므로 현재는 위 공통 표시 계약까지만 준비했습니다. 해당 SDK 접근과 실제 디스플레이 기기가 확보되면 시각·안경 배터리·카드 한 줄/전체·이동을 기기 앱에 매핑해야 합니다. 정적 웹페이지 자체가 Rokid 안경 화면으로 자동 표시되는 것은 아닙니다.

실제 기기 연결, 권한, 표시 크기, 긴 글 스크롤, 위치 변화에 따른 새로고침, 배터리 값은 아직 실기 검증 전입니다.
