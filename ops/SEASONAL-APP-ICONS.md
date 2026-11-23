# 계절·기념일 앱 아이콘 배포

## 적용 범위

아지트·공원·파장의 웹 탭, 설치 안내, PWA manifest에 같은 날짜의 이름 글자 아이콘을 사용한다. 기존 manifest 파일 위치, URL의 버전 매개변수, `id`, `start_url`, `scope`, 앱 이름을 유지한다. 내부 화면 이동으로 설치 앱의 정체성을 바꾸거나 로그인·초대·복구 토큰을 아이콘 URL에 넣지 않는다.

네이티브 Android 앱의 홈 화면 아이콘은 APK/AAB에 포함된 런처 자원으로 결정된다. `ops/android-apps/scripts/prepare_resources.py`는 같은 24개 원본으로 Android 리소스를 만든다. 원격 달력은 포함된 테마의 선택 날짜만 바꾸므로 새 디자인은 앱을 재빌드하고 업데이트해야 반영된다. 새 Android 빌드·검증 상태는 해당 변경 커밋의 Android Actions 결과로 확인한다. 이전 일러스트 빌드의 성공을 새 원본 검증으로 사용하지 않는다.

## 원본과 선택

- 달력: `shared/app-icons/calendar.json`
- 날짜 선택: `shared/app-icons/selector.mjs`, `Asia/Seoul` 기준
- 원본: `brand/app-icons/seasonal/{agit,park,pajang}/{spring,summer,autumn,winter,newyear,seollal,chuseok,christmas}.png`
- 원본 제작: `ops/render-wordmark-app-icons.py`, 글꼴·SVG·미리보기는 `brand/app-icons/wordmark/`
- 웹 배포 생성기: `ops/build-seasonal-app-icons.mjs`
- 배포 상태: `/shared/app-icons/current.json`

모든 원본은 불투명 1024×1024 PNG다. 아지트·공원·파장 이름은 Bagel Fat One 파생 글꼴의 윤곽선으로 만들고, 계절·행사별 배경색과 작은 장식을 더한다. 일반 아이콘은 중앙 800×800의 배경 여백을 정리한 뒤 비율 그대로 192×192, 512×512, 180×180으로 축소한다. `icon-maskable-512.png`는 같은 원본 전체를 512×512로 축소해 안전 여백을 유지한다. 글자의 마스킹 안전영역과 가독성은 디자인 검수 대상이며 자동 파일 검사만으로 보장하지 않는다.

`brand/app-icons/<앱>-1024.png`와 `<앱>-maskable-1024.png` 6개도 현재 여름 이름 글자 아이콘이다. 일반 파일은 중앙 800×800을 1024×1024로 키운 것이고, 마스킹 파일은 여름 원본 전체다. 실제 날짜별 배포는 이 6개 대신 `seasonal/`의 선택된 원본을 사용한다.

정상 빌드는 미래의 예약 배포에서 이미지 누락이 발생하지 않도록 24개 파일을 모두 확인한다. 누락·투명도·치수·변환 오류가 있으면 배포를 실패시키며 기존 운영 배포를 유지한다.

이름 디자인 교체로 달력과 선택 순서를 바꾸지 않는다. 크리스마스는 12월 18~25일, 새해는 12월 25일~1월 1일, 설·추석은 본날 D-7~D+1이다. 12월 25일은 크리스마스가 우선한다. 전체 날짜·우선순위 규칙은 [앱 아이콘 달력](../docs/app-icon-calendar.md)을 따른다.

## 이름 글자 원본 재생성

Python 3, Pillow, fontTools, Inkscape와 저장소에 포함된 파생 글꼴이 필요하다. 저장소 루트에서 실행한다.

```bash
python3 ops/render-wordmark-app-icons.py
```

이 명령은 SVG 24개, 계절 PNG 24개, 여름 기본 PNG 6개, 해시 목록과 미리보기 3개를 다시 만든다. 이미 생성된 PNG로 미리보기만 갱신할 때는 `--previews-only`를 사용한다. 웹 배포용 PNG와 manifest는 아래 Node 생성기로 별도 생성한다. 세부 색상표·글꼴 원본 출처·OFL 1.1·미리보기 구성은 [이름 중심 아이콘 안내](../brand/app-icons/wordmark/README.md)를 따른다.

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
