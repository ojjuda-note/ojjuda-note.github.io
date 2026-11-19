# 오쭈다 공식 로고

2026-09-29에 확정한 **웃는 노트**입니다. 코랄색 노트 모양, 오른쪽 위의 접힌 모서리, 흰색 미소를 유지합니다.

- `ojjuda-approved.png`: 사용자가 승인한 투명 배경 원본.
- `ojjuda-logo.svg`: 웹 화면과 작은 아이콘용 벡터 로고.
- `/favicon.svg`: 기존 화면에서 사용하는 공식 벡터 로고.
- `og-image.png`: 같은 로고를 사용하는 공유 이미지.
- 공유 미리보기는 `brand/og-agit-20261022.png`를 사용합니다. 이전 이미지와 다른 파일명을 써서 이미지 캐시가 섞이지 않게 합니다. 공유 디자인을 다시 바꿀 때는 이 파일명과 두 도메인의 `og:image`·`twitter:image` 주소를 함께 갱신합니다.

기본색: `#FF765F`. 서비스 기본 테마는 `#245A48`이며 웹 화면의 로고 모양은 동일하게 유지합니다. 벡터 favicon과 공유 이미지는 `ops/render-brand.py`로 승인된 SVG에서 생성합니다. 로고를 회전하거나 비율을 늘리지 않습니다.

## 앱 설치 아이콘 — 2026-11-19 승인 시안

아지트·공원·파장의 설치 아이콘은 각각 승인한 입체 일러스트를 사용합니다. 웹 화면의 기존 로고나 공유 이미지를 교체하는 작업과 구분합니다. `ops/render-brand.py`는 아래 PNG를 덮어쓰지 않습니다.

| 앱 | 일반 원본 | 마스킹용 원본 | 배포 폴더 |
| --- | --- | --- | --- |
| 아지트 | `app-icons/agit-1024.png` | `app-icons/agit-maskable-1024.png` | 저장소 루트 |
| 공원 | `app-icons/park-1024.png` | `app-icons/park-maskable-1024.png` | `park/assets/` |
| 파장 | `app-icons/pajang-1024.png` | `app-icons/pajang-maskable-1024.png` | `features/pajang/assets/` |

위 파일은 최초 승인 시안의 원본으로 보존합니다. 최초 시안을 재현할 때는 일반 원본을 192×192, 512×512, 180×180으로 축소하고, 마스킹용 원본을 512×512로 축소합니다. 현재 각 배포 폴더의 `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `icon-maskable-512.png`는 아래 계절·기념일 생성 절차에서 만듭니다.

아지트의 기존 아이콘 경로와 manifest `id`·`start_url`은 유지합니다. 공원·파장은 각각 전용 manifest와 아이콘 경로를 사용합니다. 설치된 앱의 갱신 경로를 유지하기 위해 manifest URL의 `?v=20261119-illustrated-icons-1`도 바꾸지 않습니다. 아이콘 URL과 해당 아이콘을 사용하는 HTML·`shared/pwa/app-identity.js`·설치 안내의 revision만 함께 갱신합니다.

## 계절과 기념일 자동 아이콘

`app-icons/seasonal/<앱>/<테마>.png`의 1024×1024 입체 일러스트 원본 24개를 사용합니다. 중요한 그림은 중앙의 마스킹 안전원 안에 배치합니다. 일반 아이콘은 중앙 800×800의 배경 여백만 정리한 뒤 비율 그대로 축소하고, 마스킹용은 전체 1024×1024를 축소합니다. 앱 아이콘·웹 탭·설치 안내에 같은 그림을 적용합니다. 날짜 선택은 `shared/app-icons/calendar.json`과 `selector.mjs`에서 한국 날짜를 기준으로 결정합니다.

Pages 배포는 `ops/build-seasonal-app-icons.mjs`로 선택한 그림을 기존 아이콘 경로에 생성합니다. 매일 한국시간 자정에도 배포를 예약해 계절·행사 종료 후 다음 그림으로 전환합니다. 같은 테마·같은 원본이면 icon revision을 유지합니다. 현재 배포 테마와 원본 해시는 `shared/app-icons/current.json`에 기록합니다. 운영과 확인 방법은 `ops/SEASONAL-APP-ICONS.md`를 따릅니다.

공원은 `/park/`에서 `/world.html?place=park`로 이동하므로 World 진입 시 `app-identity.js`가 공원 메타데이터를 선택합니다. 파장의 두 HTML 진입점에도 같은 파장 manifest를 연결합니다. 이미 열린 앱의 정체성은 내부 탭 이동으로 바꾸지 않습니다. Android 네이티브 앱의 런처 아이콘은 별도 앱 패키지 업데이트가 필요합니다.

X 등 외부 서비스가 이미 저장한 페이지 제목과 미리보기는 사이트 배포만으로 즉시 바뀌지 않을 수 있습니다. 서버 원문 확인과 외부 서비스에서의 실제 미리보기 확인을 구분하며, 외부 확인 전에는 갱신 완료로 기록하지 않습니다.
