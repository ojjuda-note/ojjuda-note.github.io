# 계절·기념일 앱 아이콘 배포

## 적용 범위

아지트·공원·파장의 웹 탭, 설치 안내, PWA manifest에 같은 날짜의 그림을 사용한다. 기존 manifest 파일 위치, URL의 버전 매개변수, `id`, `start_url`, `scope`, 앱 이름을 유지한다. 내부 화면 이동으로 설치 앱의 정체성을 바꾸거나 로그인·초대·복구 토큰을 아이콘 URL에 넣지 않는다.

네이티브 Android 앱의 홈 화면 아이콘은 APK/AAB에 포함된 런처 자원으로 결정된다. 이 웹 배포가 기존 네이티브 앱의 런처를 바꾸지는 않는다. 네이티브 자동 아이콘은 별도 앱 구현·업데이트 상태를 확인한다.

## 원본과 선택

- 달력: `shared/app-icons/calendar.json`
- 날짜 선택: `shared/app-icons/selector.mjs`, `Asia/Seoul` 기준
- 원본: `brand/app-icons/seasonal/{agit,park,pajang}/{spring,summer,autumn,winter,newyear,seollal,chuseok,christmas}.png`
- 생성기: `ops/build-seasonal-app-icons.mjs`
- 배포 상태: `/shared/app-icons/current.json`

모든 원본은 불투명 1024×1024 PNG다. 가장 중요한 그림은 중앙의 마스킹 안전원에 둔다. 일반 아이콘은 중앙 800×800의 배경 여백을 정리한 뒤 비율 그대로 192×192, 512×512, 180×180으로 축소한다. `icon-maskable-512.png`는 같은 원본 전체를 512×512로 축소해 안전 여백을 유지한다. 원본의 안전원 구성은 디자인 검수 대상이며 자동 파일 검사만으로 보장하지 않는다.

정상 빌드는 미래의 예약 배포에서 이미지 누락이 발생하지 않도록 24개 파일을 모두 확인한다. 누락·투명도·치수·변환 오류가 있으면 배포를 실패시키며 기존 운영 배포를 유지한다.

## 예약과 버전

`.github/workflows/pages-publish.yml`에 `0 15 * * *` UTC를 예약한다. 한국시간 자정에 해당하며 GitHub의 작업 대기열에 따라 실제 시작·완료가 늦어지거나 실행이 누락될 수 있다. 기존 main 배포와 같은 Pages 동시 실행 그룹을 사용한다. 날짜가 바뀌면 예약 실행이 최신 main의 달력과 그림으로 사이트를 패키징한다. 한 번 실패하면 기존 배포를 유지하고 다음 main 배포·수동 실행·다음 날 예약 실행에서 다시 시도한다. 전환일에는 Actions 실행 결과와 상태 JSON을 함께 확인한다.

공개 저장소에서 60일간 저장소 활동이 없으면 GitHub가 예약 workflow를 비활성화할 수 있다. 장기간 운영 변경이 없을 때는 Actions의 예약 활성 상태를 확인하고 필요하면 다시 활성화한다.

같은 테마·같은 세 원본은 동일한 아이콘 revision을 사용한다. 매일 날짜가 바뀌었다는 이유만으로 아이콘 업데이트를 만들지 않는다. 테마나 그림 바이트가 바뀌면 세 manifest의 `icons[].src`에 새 revision을 넣는다. favicon·apple-touch-icon·설치 안내도 이 revision을 사용한다. 변경된 실행 파일은 별도 내용 해시를 사용해 캐시를 갱신한다. manifest 자체의 URL은 유지한다.

일일 생성은 배포 산출물에서 이루어져 Git 커밋이나 출시 버전을 매일 올리지 않는다. 자동 전환 기능의 첫 출시에서 영향을 받는 아지트·공원 버전을 각각 올리고, 게임과 오락실 버전은 유지한다.

## 로컬 확인

ImageMagick의 `magick` 또는 `convert`, Node.js가 필요하다.

```bash
node --test tests/app-icon-calendar.test.mjs tests/seasonal-app-icons-build.test.mjs
npm --prefix tests run test:pwa
node ops/build-seasonal-app-icons.mjs /absolute/path/to/staged-site --date 2026-12-25
```

`--date`는 검증용이다. 실제 배포에서는 날짜를 고정하지 않는다. 별도의 원본 경로를 검사하려면 `--source-root /absolute/path/to/source`를 사용한다. 원격 작업·브라우저 설정·서명키는 필요하지 않다.

배포 후 `/shared/app-icons/current.json`의 한국 날짜·테마·revision을 보고, 세 manifest의 아이콘 URL과 실제 PNG 응답을 함께 확인한다. 상태 JSON 확인만으로 사용자의 휴대폰 런처까지 갱신됐다고 기록하지 않는다.

## 설치된 기기의 반영

PWA의 이름과 아이콘 갱신은 브라우저·운영체제가 관리한다. 웹 배포 시각과 홈 화면 아이콘 갱신 시각은 다를 수 있다. Chrome 144의 큰 아이콘 변경은 사용자가 업데이트 검토 화면에서 적용할 수 있으므로, 설치된 PWA의 무인 즉시 교체를 보장하지 않는다. 이미 만들어진 일반 바로가기는 아이콘을 자동으로 다시 받지 않을 수도 있다. 데이터 삭제나 앱 강제 재설치를 기본 대응으로 사용하지 않는다.

공식 참고:

- Chrome manifest 변경 처리: https://developer.chrome.com/blog/improvements-to-web-app-updates
- Android 런처 자원: https://developer.android.com/studio/write/create-app-icons
- GitHub 예약 실행: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

확인한 `ojjuda-com-redirect` 저장소는 `.kr` 공원으로 이동하는 페이지이며 별도 manifest가 없다. 다만 실제 `https://ojjuda.com/agit/manifest.webmanifest` 공개 응답은 조사 환경에서 403으로 차단되어, 운영 중인 `.com`의 모든 경로가 이 저장소에서 제공된다고 단정하지 않는다. `.com` 경로에서 설치된 별도 PWA·네이티브 앱은 실제 manifest와 앱 원본을 확인해야 한다. 이 빌드의 검증 범위는 `.kr`의 세 manifest와 웹 진입 화면이다.
