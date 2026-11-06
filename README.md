# 오쭈다 아지트

게임과 기능의 소스 위치는 [소스 안내](docs/source-map.md)를 기준으로 관리합니다.

| 폴더 | 내용 |
| --- | --- |
| `games/<게임명>/` | 게임 엔진, 화면 연결 코드, 전용 스타일 |
| `features/<기능명>/` | 친구, 프로필, 지갑, 오락실, 하루 변경 안내 |
| `app/portal/`, `app/world/` | 로그인 입구와 아지트 공통 화면 |
| `shared/<분야>/` | 여러 기능이 사용하는 인증·게임·화면·공유 코드 |
| `admin/`, `groups/`, `note/`, `park/`, `byeolcheonji/` | 각 서비스의 화면·기능 |
| `supabase/functions/<함수명>/` | 운영 서버 함수 |
| `supabase/migrations/` | 적용 순서를 보존하는 DB 변경 기록 |
| `supabase/scripts/<분야>/` | 개별 실행·참고용 SQL |
| `tests/`, `scripts/`, `ops/`, `docs/` | 검사, 구조 검사, 운영 도구, 문서 |

메인 및 기존 게임 진입 HTML 주소는 유지합니다. `config.js`와 서비스 워커 `sw.js`만 최상위 실행 파일로 둡니다.

```sh
node scripts/check-source-layout.mjs
npm --prefix tests ci --ignore-scripts
npm --prefix tests run test:groups
```
