# 공원 카드 카카오톡 공유 설정

카카오톡에서 카드 이미지와 눌러 열 수 있는 `카드 보기` 버튼을 함께 보내려면
카카오톡 공유 JavaScript SDK를 사용한다. 운영 앱 키가 설정되기 전에는
카카오톡 전용 버튼을 표시하지 않으며 SDK 요청이나 카카오 이미지 업로드도 하지 않는다.

## 활성화

1. [Kakao Developers](https://developers.kakao.com/console/app)의 오쭈다 앱에서
   JavaScript 키를 확인한다. REST API 키나 Admin 키를 사용하지 않는다.
2. 앱의 **플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인**에
   `https://ojjuda.kr`를 등록한다.
3. 앱의 **제품 링크 관리 → 웹 도메인**에도 `https://ojjuda.kr`를 등록한다.
4. `config.js`의 `kakaoJavaScriptKey`에 해당 JavaScript 키를 넣는다.
   `park/index.html`과 `world.html`의 config 캐시 번호 및 관련 공원 로더 캐시를
   새 값으로 올리고 아지트 버전 규칙에 따라 배포한다.
5. 운영 도메인에서 실제 Android/iPhone 카카오톡으로 카드 공유를 확인한다.
   이미지와 `카드 보기` 버튼이 표시되고, 그 버튼으로 공유한 카드가 열려야 한다.

현재 카드 링크는 `https://ojjuda.kr/world.html?place=park&card=…`이다.
`ojjuda.com`은 공유 메시지의 설명에만 표시한다.
실제 서비스 주소를 바꿀 때는 그 도메인의 앱 경로와 위 두 도메인 등록을 먼저 확인한다.

## 동작과 검증 범위

- 공유창에서는 카드의 공개 배경·본문·태그로 PNG를 먼저 만든다.
  별도 첨부 사진, 작성자 정보, 조작 버튼은 포함하지 않는다. 이벤트는 기존 링크 공유를 유지한다.
- 사용자가 `카카오톡 공유`를 눌렀을 때만 SDK 로드와 이미지 업로드를 시작한다.
  준비 뒤 `카카오톡으로 보내기`를 다시 누르면 그 클릭 안에서 즉시 SDK를 호출한다.
  이미지 준비 후 자동으로 카카오톡을 열면 사용자 클릭 조건을 잃을 수 있다.
- 준비 중 창을 닫거나 카드·계정이 바뀌면 보내지 않은 카카오 업로드를 정리한다.
  공유를 SDK에 넘긴 이미지는 유지하며, SDK 호출만으로 실제 전송 완료를 표시하지 않는다.
- 카카오는 업로드 이미지를 최대 100일 보관한다. 카카오 한도에 맞추기 위해
  5,000,000바이트를 넘는 파일은 업로드용 JPEG로만 축소한다. 원래 PNG는 유지한다.
- 일반 앱 공유는 이미지와 링크를 함께 요청하고 링크를 복사하지만,
  수신 앱이 링크를 버릴 수 있다. 이 버튼은 `다른 앱으로 공유`로 표시한다.
- `tests/note-card-share-ui.test.cjs`는 실제 PNG 생성과 카카오 SDK 경계의
  피드·링크·클릭·취소 처리를 검증한다. SDK 업로드·전송 메서드는 모의 구현이므로
  카카오톡에서 실제로 받은 메시지 검증을 대신하지 않는다.

## 공식 문서

- [카카오톡 공유 JavaScript](https://developers.kakao.com/docs/ko/kakaotalk-share/js-link)
- [JavaScript SDK 다운로드](https://developers.kakao.com/docs/ko/javascript/download)
- [앱 키와 도메인 설정](https://developers.kakao.com/docs/ko/app-setting/app)
