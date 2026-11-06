# 소스 위치 안내

2026-11-06 정리: 독립 실행 파일 166개를 게임·기능별 폴더로 이동했습니다. 최상위 JS/CSS는 126개에서 2개로 줄였습니다.

## 게임과 서버

| 게임·기능 | 프런트 소스 | 서버 함수 |
| --- | --- | --- |
| 바람의 궁수 | `games/forest-archer/` | `game-action` |
| 나사 풀기 | `games/screw/` | `flat-drill-clear* (운영 보정 도구)` |
| 맞고 | `games/matgo/` | `matgo` |
| 포커 | `games/poker/` | `poker` |
| 탱크 | `games/tank/` | `tank` |
| 뱅 | `games/bang/` | `bang` |
| 오쭈다 투어 | `games/ojjuda-tour/` | `marble` |
| 룰렛 | `games/roulette/` | `DB RPC` |
| 솔리테어 | `games/solitaire/` | `DB RPC` |
| 사천성 | `games/sacheonseong/` | `DB RPC` |
| 지뢰찾기 | `games/mines/` | `game-action / DB RPC` |
| 새별 | `games/saetbyeol/` | `game-action / DB RPC` |
| 틀린그림찾기 | `games/spot-difference/` | `DB RPC` |
| 땅따먹기 | `games/ttang/` | `game-action / DB RPC` |
| 사진 땅따먹기 | `games/photo-ttang/` | `DB RPC` |
| 두더지 | `games/mole/` | `game-action` |
| 달리기 | `games/runner/` | `game-action` |
| 벽돌깨기 | `games/breakout/` | `game-action` |
| 축제·스포츠·공연 | `games/festival-schedule/` | `정적 자료 / DB RPC` |
| 맛집·추천 | `games/certified-restaurants/` | `DB RPC` |
| 그룹 | `groups/` | `group_board / group_invitation / group_home RPC` |
| 별천지 | `byeolcheonji/` | `byeolcheonji` |
| 계정 복구 | `shared/auth/` | `member-recovery` |
| 오류 신고 | `shared/diagnostics/` | `feedback-codex` |

## 유지하는 경계

- `world.html`은 아지트 진입점이며, 기존 장기·체스·당구 등의 통합 초기화 코드도 포함합니다. 공유 상태가 있는 이 코드는 경로 정리만으로 임의 분해하지 않습니다. 독립 파일은 모두 게임별 폴더로 모았습니다.
- 기존 공개 HTML 주소와 회원·게임 기록·업로드 파일의 위치는 유지합니다. CSS·JS 참조와 테스트·워크플로 경로는 새 위치를 사용합니다.
- `supabase/migrations/`는 이력을 재실행할 수 있도록 파일명과 순서를 유지합니다.
- 서버 함수는 Supabase 배포 규칙에 맞게 함수명별 폴더를 유지합니다. 서로 다른 게임의 권한이나 서버 상태를 합치지 않습니다.
- 맞고의 `engine-v*.mjs`, `verify-v*.mjs`는 진행 중이던 이전 게임 정산에 사용하므로 보존합니다.
- 운영에만 있던 `matgo-release-transfer`의 현재 소스를 복원했습니다. 이전 작업 완료 후 410을 반환하는 비활성 응답이며 재가동하지 않습니다.

## 검사

`node scripts/check-source-layout.mjs`는 이전 경로 잔존, 새 소스 누락, 최상위 코드 재혼입, 로컬 리소스 연결, 운영 함수 16개의 소스 누락을 검사합니다. 이동 대응표는 `docs/source-layout.json`에 있습니다.
