# 오쭈다 계절·행사 앱 아이콘

기존 Android 원본 프로젝트를 확보하지 못해, Play에서 받은 원본 AAB의 공개 리소스·Manifest·라이브러리 정보를 바탕으로 **다시 구성한 TWA 프로젝트**입니다. 원본 AAB는 수정하지 않습니다. 이 폴더에는 서명키가 없으며, 빌드 결과도 서명하지 않습니다.

## 구성

| 앱 | 기존 applicationId | flavor |
|---|---|---|
| 오쭈다 아지트 | `kr.ojjuda.agit` | `agit` |
| 오쭈다 공원 | `kr.ojjuda.park` | `park` |
| 오쭈다 파장 | `kr.ojjuda.pajang` | `pajang` |

`baselines/*.json`에는 실제 원본에서 읽은 버전·시작 주소·Manifest ID·색상·기능 설정과 원본 SHA-256을 기록합니다. 해당 파일이 없거나 패키지가 맞지 않으면 빌드를 중단합니다. 원본 소스가 복원됐다고 표현하지 않습니다.

- Gradle 8.11.1, Android Gradle Plugin 8.9.1, Android Browser Helper 2.7.4를 고정했습니다.
- minSdk 24, target/compileSdk 36, build-tools 36.0.0입니다. 원본과 같은 AGP를 사용하며 SDK 36 호환 경고 억제 설정도 명시했습니다.
- 원래 `Application`, `LauncherActivity`, `DelegationService` 컴포넌트 이름을 보존합니다. 실제 LauncherActivity는 항상 활성 상태이고, 홈/앱 목록 아이콘용 alias 8개만 전환합니다.
- `INTERNET`(공개 달력 확인)과 `RECEIVE_BOOT_COMPLETED`(재부팅 후 예약 복구) 일반 권한을 추가합니다. 정확한 알람·위치·알림·배터리 최적화 예외 권한은 요청하지 않습니다.
- 원본의 `https://https://ojjuda.kr` trusted origin과 scheme이 포함된 host는 `https://ojjuda.kr` 및 `ojjuda.kr`로 바로잡았습니다. `assetStatements`도 하나의 올바른 JSON 배열로 구성합니다. 웹 Digital Asset Links의 실제 Play 앱 서명 인증서 연결은 별도 배포 검증 대상입니다.

## 날짜와 행사 규칙

공통 파일 `shared/app-icons/calendar.json`을 APK에 함께 넣습니다. 기본 시간대는 휴대폰 설정과 관계없이 **한국 시간 `Asia/Seoul`**입니다.

| 종류 | 적용 기간 |
|---|---|
| 봄·여름·가을·겨울 | 공통 달력의 월별 구분 |
| 크리스마스 | 12월 18일~25일 |
| 새해 | 12월 25일~다음 해 1월 1일 |
| 설·추석 | 본날 7일 전~다음 날 |

기간의 양끝을 포함합니다. 겹치면 **오늘이 본날인 행사 → 높은 priority → 본날까지의 가까운 날짜 → id ASCII 순서**로 고릅니다. 따라서 12월 25일에는 크리스마스, 26일부터는 새해 아이콘입니다. 음력 행사 본날은 공통 달력에 명시된 2026~2035년 자료를 사용하며, 지원 연도 밖의 음력 날짜를 추측하지 않습니다.

서버에서 `https://ojjuda.kr/shared/app-icons/calendar.json`을 주기적으로 확인합니다. 리다이렉트는 따르지 않습니다. TLS 검증을 끄지 않으며, 256 KiB·512개 행사 제한과 schema/timezone/8개 theme ID/실제 날짜/priority/id 검증을 적용합니다. URL·스크립트·새 이미지·임의 Android 컴포넌트는 원격 JSON으로 실행하거나 내려받지 않습니다. 잘못된 행사 항목은 무시하고, 구조가 잘못된 업데이트는 마지막 정상 캐시 또는 앱에 든 달력으로 대체합니다.

추가 행사는 공통 달력의 `datedEvents`에 `id`, `theme`, `eventDate`, `start`, `end`, `priority`를 넣습니다. 현재 APK에 들어 있는 8가지 그림 중 하나를 선택할 수 있습니다. **새로운 그림 자체를 추가하려면 앱 업데이트가 필요합니다.**

## 기기에서 바뀌는 시점

- 앱 실행, 날짜·시간 변경을 수신했을 때 즉시 로컬 달력을 확인합니다.
- 재부팅 완료와 앱 패키지 교체 때 다시 확인하고 작업을 예약합니다.
- 한국 시간 다음 자정 부근에 JobScheduler 작업을 예약하고, 6시간 주기 작업도 유지합니다. 두 작업 모두 정확한 알람이 아닌 일반 작업입니다.
- 인터넷이 없어도 내장 달력/정상 캐시로 아이콘을 고릅니다. 서버 확인 실패로 앱 실행을 막지 않습니다.
- API 33 이상에서는 `setComponentEnabledSettings` 한 번으로 원자적으로 전환합니다. API 24~32에서는 새 alias를 먼저 켜고 성공을 확인한 뒤 이전 alias를 끕니다. 전환 오류 시 기존 진입점을 먼저 끄지 않습니다.

Android는 절전 모드, 앱 사용 제한, 제조사 정책에 따라 작업과 런처 갱신을 미룰 수 있습니다. 설정의 **강제 종료**를 선택한 앱은 다시 열기 전까지 작업·방송 수신이 막힐 수 있습니다. 자정 정각 또는 행사 시작 정각의 변경은 보장하지 않습니다. 앱을 다시 열면 현재 날짜로 맞춥니다.

alias 전환 때 일부 런처는 아이콘을 잠시 중복 표시하거나, 기존 홈 화면 바로가기를 이동·삭제하거나, 캐시 갱신을 늦출 수 있습니다. 앱 목록에는 새 활성 alias가 남도록 설계했지만 모든 제조사의 **기존 홈 화면 배치 보존**을 보장할 수는 없습니다. 실제 Activity를 비활성화하거나 앱 프로세스를 강제 종료하는 방법은 사용하지 않습니다. 출시 전에 Samsung One UI와 Pixel Launcher에서 기존 설치 → 업데이트 → 행사 전환을 확인해야 합니다.

## 그림과 빌드

입력은 `brand/app-icons/seasonal/{agit,park,pajang}/{theme}.png`의 제작한 **1024×1024 불투명 PNG 24개**입니다. `summer`를 포함해 8개 theme가 모두 있어야 하며 누락 시 대체 그림을 만들지 않고 실패합니다.

`scripts/prepare_resources.py`는 ImageMagick으로만 크기를 조절합니다. Legacy 아이콘은 기존처럼 중앙 800×800 영역을 잘라 48/72/96/144/192 px로 변환합니다.

Adaptive 배경은 전체 원본을 80%로 축소한 뒤, 좌상단 `(0,0)` 픽셀과 같은 색으로 여백을 채워 1024×1024 정중앙에 배치하고 108/162/216/324/432 px로 변환합니다. 입력 원본의 네 모서리는 같은 단색 브랜드 배경이어야 합니다. Adaptive foreground는 투명하며, 시스템이 기기의 마스크를 씌웁니다. 이 여백은 큰 한글 워드마크가 잘리는 것을 줄이기 위한 것으로, 새 원본이 준비되면 모든 글자 획이 최종 108 dp 캔버스의 중앙 66 dp 안전원 안에 들어가는지와 작은 크기의 가독성을 확인해야 합니다. 변환 설정 자체를 새 원본의 검증 완료로 간주하지 않습니다.

이미 라이선스가 승인된 Android SDK와 JDK 17 이상, ImageMagick 7, Python 3가 있는 환경에서 실행합니다. SDK 라이선스 자동 수락 스크립트는 제공하지 않습니다.

```sh
cd ops/android-apps
./gradlew :core:test
./gradlew :app:lintAgitRelease :app:lintParkRelease :app:lintPajangRelease
./gradlew :app:bundleAgitRelease :app:bundleParkRelease :app:bundlePajangRelease \
  -PreleaseVersionCode=2 -PreleaseVersionName=1.1.0
```

`releaseVersionCode=2`는 원본 v1 다음 후보값입니다. 실제 업로드 전 Play에 이미 사용된 모든 versionCode보다 큰지 확인해야 합니다. 기본 결과 위치는 `app/build/outputs/bundle/{flavor}Release/`입니다. debug variant를 끄고 모든 signingConfig를 비워 두었으므로 이 프로젝트가 새 debug/release 키를 생성하지 않습니다.

원본별 metadata를 다시 확인하려면 아래처럼 읽기 전용 추출기를 실행할 수 있습니다. 개인키·서명 비밀은 읽지 않습니다.

```sh
python3 scripts/inspect_original.py /path/to/original.aab --output baselines/agit.json
```

이 파일들만으로 이미 설치된 앱의 아이콘이 즉시 바뀌지는 않습니다. 기존 applicationId와 Play 앱 서명 연결을 유지하고, 등록된 업로드 키로 서명한 새 AAB를 Play 업데이트로 배포해야 합니다. 업로드 키 생성·재설정·등록·출시는 이 프로젝트에서 수행하지 않습니다.

## 검증 범위

핵심 JVM 테스트는 행사 D-7 시작·종료·연말 겹침·KST 자정·잘못된 데이터·중복 행사 ID와 API 33 원자 전환·구버전 enable-first·전환 실패 때 기존 진입점 보존을 검사합니다. `scripts/CalendarParity.java`는 공통 JS 선택기와 날짜별 결과를 대조할 때 사용합니다.

JVM/정적 컴파일 검증은 실기기·에뮬레이터 실행 검증을 대신하지 않습니다. unsigned 산출물은 설치·자동 업데이트가 완료된 앱으로 안내하지 않습니다.

공식 근거: [Android component 전환](https://developer.android.com/reference/android/content/pm/PackageManager#setComponentEnabledSettings(java.util.List)), [JobScheduler](https://developer.android.com/reference/android/app/job/JobScheduler), [적응형 아이콘](https://developer.android.com/develop/ui/views/launch/icon_design_adaptive), [앱 서명](https://developer.android.com/studio/publish/app-signing), [Android Browser Helper](https://github.com/GoogleChrome/android-browser-helper).
