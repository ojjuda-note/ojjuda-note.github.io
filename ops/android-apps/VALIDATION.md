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
| Manifest 구조 | 8 alias 중 summer 하나만 기본 활성, 실제 LauncherActivity는 항상 활성, 모든 alias에 TWA 주소 metadata 포함 |
| 추가 권한 | INTERNET·RECEIVE_BOOT_COMPLETED만 명시, 정확한 알람 권한 없음 |

## 교차 검토 후 반영

- 공개 원격 달력은 실제 Pages 도메인 `https://ojjuda.kr/shared/app-icons/calendar.json`을 사용합니다. 기존 TWA 시작 주소는 변경하지 않습니다.
- `TIME_SET`을 받으면 자정 작업의 상대 지연을 다시 계산합니다. 저장한 wall-clock/elapsedRealtime 차이도 비교하여 누락된 시간 변경 방송이나 재부팅 뒤 기존 상대 시간 예약을 보정합니다. 정상 반복 호출은 같은 작업을 계속 새로 예약하지 않습니다.
- 고정한 ABH 2.7.4 바이트코드는 실제 LauncherActivity 클래스의 metadata를 먼저 읽습니다. 원래 alias가 전환 도중 비활성화되어 alias 조회가 실패해도 기본 시작 주소가 남는 구조를 확인했습니다.
- 모든 제조사에서 홈 화면의 기존 바로가기 위치가 보존된다고 보장하지 않습니다. 이 제한과 절전·강제 종료에 따른 변경 지연을 README에 명시했습니다.

## 사용한 검증 도구

- 현재 환경의 OpenJDK 21.0.13 `jdk.compiler` 모듈. Java 8 소스·바이트코드 대상으로 컴파일했습니다.
- Google AOSP 공개 Android 36 API stub, Google Maven의 ABH 2.7.4·AndroidX Browser 1.10.0.
- Google Maven 공식 AAPT2 `8.9.1-12782657`.
- JUnit 4.13.2, org.json 20240303, ImageMagick 7.

대용량 도구, 원본 AAB, 생성한 density 파일과 임시 컴파일 결과는 저장소에 넣지 않습니다. 표준 Gradle wrapper만 빌드 진입 파일로 포함합니다.

## 아직 수행하지 않은 항목

**전체 Gradle AAB 빌드·Android lint·에뮬레이터/실기기 실행·업로드 서명·Play 배포는 완료하지 않았습니다.**

현재 환경에는 이미 라이선스가 승인된 전체 Android SDK와 기존 업로드 키가 없습니다. 새 SDK EULA 자동 동의, 승인 표시 파일 생성, 키 생성·재설정·등록을 하지 않았습니다. AAPT2 개별 리소스 컴파일과 Java 정적 컴파일은 전체 앱 패키징이나 실제 기기 동작 검증을 대신하지 않습니다.

기존 SDK 사용이 가능한 빌드 환경에서 README의 전체 빌드·lint를 실행하고, Samsung/Pixel 런처의 기존 설치 업데이트·행사 전환·절전 복귀를 확인한 뒤 기존 등록 키로 서명해야 합니다. 이번 폴더를 이미 설치된 앱에 적용된 완성 APK나 서명된 업데이트 파일로 안내하지 않습니다.
