# 네이티브 검증 기록 — 2026-11-19

## 완료

| 검증 | 결과 |
|---|---|
| 원본 AAB 3개 | 읽기 전용 확인, baseline metadata와 SHA-256 기록, 원본 파일 보존 |
| 기존 앱 식별 정보 | package·v1/1.0.0·min24/target36·ABH2.7.4·AGP8.9.1 확인 |
| TWA 시작 주소 | 아지트 `.com/agit/`, 공원 `.com/`, 파장 `.com/pajang/` 보존 |
| JVM 테스트 | 16개 통과: 행사 D-7, 종료, 연말 겹침, KST 자정, 잘못된 데이터, ID 중복, alias 전환 실패, 시계 변경 |
| 웹/Java 달력 일치 | 2026-01-01~2035-12-31, 3,652일 비교, 불일치 0개 |
| Android Java 컴파일 | 공통 Android 클래스·3 flavor wrapper 16개 파일 컴파일 성공 |
| 이미지 입력 | 24개 모두 1024×1024 PNG·불투명 확인 |
| 리소스 생성 | 240개 density PNG + 24개 adaptive XML + 앱별 내장 달력 생성 |
| Android 리소스 컴파일 | 공식 AAPT2로 3앱 모두 성공 |
| 실제 Gradle CI | core:test, 3개 release variant lint, 3개 unsigned AAB 빌드 모두 성공 |
| 배포 파일 검사 | AAB 필수 구조·ZIP 무결성·서명 항목 부재 확인, SHA-256 기록 및 artifact 업로드 성공 |
| 내려받은 AAB 재검사 | ZIP SHA-256과 개별 AAB 체크섬 일치, 세 패키지·v2/1.1.0·기존 시작 주소·공통 달력·앱별 alias 8개·adaptive XML 8개·PNG 80개 확인 |
| Manifest 구조 | 8 alias 중 summer 하나만 기본 활성, 실제 LauncherActivity는 항상 활성, 모든 alias에 TWA 주소 metadata 포함 |
| 추가 권한 | INTERNET·RECEIVE_BOOT_COMPLETED만 명시, 정확한 알람 권한 없음 |

## 실제 CI 증거

[PR #1365](https://github.com/ojjuda-note/ojjuda-note.github.io/pull/1365)의 [Android CI run 44501464531](https://github.com/ojjuda-note/ojjuda-note.github.io/actions/runs/44501464531), job `135482072325`가 **success**로 완료됐습니다. PR head는 `00cb3c996c7798a387ac2a88f8e993b2df7fd31b`, 실제 검사한 PR merge checkout은 `9c5f5a612bd1b44e6856fb299bcfdaebfd01b8f9`입니다.

기존 GitHub-hosted runner의 JDK 17·Android SDK 36·build-tools 36.0.0·라이선스 기록을 확인해 사용했고, ImageMagick 7을 준비했습니다. 빌드 설정은 versionCode `2`, versionName `1.1.0`입니다.

- [무서명 AAB 3개와 SHA256SUMS](https://github.com/ojjuda-note/ojjuda-note.github.io/actions/runs/44501464531/artifacts/14518056489): 아지트 7,810,885 bytes, 공원 8,343,371 bytes, 파장 7,846,655 bytes.
- [JVM·Android lint 보고서](https://github.com/ojjuda-note/ojjuda-note.github.io/actions/runs/44501464531/artifacts/14517064133). CI artifact 보관 기간은 14일입니다.

CI 성공 후 실행 코드 변경 없이 이 검증 문서만 갱신했습니다.

## 교차 검토 후 반영

- 공개 원격 달력은 실제 Pages 도메인 `https://ojjuda.kr/shared/app-icons/calendar.json`을 사용합니다. 기존 TWA 시작 주소는 변경하지 않습니다.
- `TIME_SET`을 받으면 자정 작업의 상대 지연을 다시 계산합니다. 저장한 wall-clock/elapsedRealtime 차이도 비교하여 누락된 시간 변경 방송이나 재부팅 뒤 기존 상대 시간 예약을 보정합니다. 정상 반복 호출은 같은 작업을 계속 새로 예약하지 않습니다.
- 고정한 ABH 2.7.4 바이트코드는 실제 LauncherActivity 클래스의 metadata를 먼저 읽습니다. 원래 alias가 전환 도중 비활성화되어 alias 조회가 실패해도 기본 시작 주소가 남는 구조를 확인했습니다.
- 모든 제조사에서 홈 화면의 기존 바로가기 위치가 보존된다고 보장하지 않습니다. 이 제한과 절전·강제 종료에 따른 변경 지연을 README에 명시했습니다.

## 앞서 수행한 로컬 검증 도구

- 현재 환경의 OpenJDK 21.0.13 `jdk.compiler` 모듈. Java 8 소스·바이트코드 대상으로 컴파일했습니다.
- Google AOSP 공개 Android 36 API stub, Google Maven의 ABH 2.7.4·AndroidX Browser 1.10.0.
- Google Maven 공식 AAPT2 `8.9.1-12782657`.
- JUnit 4.13.2, org.json 20240303, ImageMagick 7.

대용량 도구, 원본 AAB, 생성한 density 파일과 임시 컴파일 결과는 저장소에 넣지 않습니다. 표준 Gradle wrapper만 빌드 진입 파일로 포함합니다.

## 아직 수행하지 않은 항목

**에뮬레이터/실기기 실행·업로드 서명·Play 배포는 완료하지 않았습니다.**

로컬 SDK 부재로 진행하지 못했던 전체 빌드와 lint는 위 CI에서 완료했습니다. 새 SDK EULA 자동 동의, 승인 표시 파일 생성, 키 생성·재설정·등록은 하지 않았습니다. 기존 업로드 키는 아직 확보하지 못했으며, 생성한 AAB는 무서명 상태입니다.

Samsung/Pixel 런처의 기존 설치 업데이트·행사 전환·절전 복귀를 실제 기기에서 확인하고, 기존 등록 업로드 키로 서명해 Play에 배포해야 합니다. CI 성공을 이미 설치된 앱 업데이트나 실기기 테스트 완료로 안내하지 않습니다.
