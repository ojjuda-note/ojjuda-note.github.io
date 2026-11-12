# 오쭈다 관리자 AI 회의실

주소: `/admin/meeting/` 또는 `/admin/?admin=meeting`

## 동작

- 기존 Supabase 회원 로그인 및 `public.app_admins`로 관리자 접근을 확인한다.
- 대표 메시지와 역할별 AI 답변을 `public.ai_meeting_messages`에 기록한다.
- `전체 회의` 선택 시 한 번의 AI 요청으로 본부장과 관련 전문 담당 역할의 의견을 나눠 표시한다. 각각 독립적으로 백그라운드 작업을 수행하는 에이전트는 아니다.
- PDF/TXT/JPG/PNG를 최대 8MB까지 관리자 전용 Storage에 저장하고 60초 유효한 서명 URL로 공유한다. 현재 파일 본문은 AI에 전송하지 않는다.
- 최신 80개 메시지를 6.5초 간격으로 갱신하며, API 호출은 관리자 로그인 확인 후 서버에서만 수행한다.
- `AI 작업 상황판`은 **현재 브라우저에서 실제로 진행한 회의 요청**의 전송·저장·AI 답변 확인 단계 및 경과 시간을 보여준다. 요청 성공·실패 시 대기로 전환한다.
- 최근 회의 처리 내역은 DB에 저장된 대표 메시지와 AI 답변(`reply_to`) 관계로 계산한다. 답변 기록이 없는 요청은 `답변 기록 없음`으로 표시하며, 백그라운드 작업 중이라고 추정하지 않는다.
- 회의 처리 상황판은 답변 요청을 추적한다. 별도의 **실제 작업** 목록은 저장된 작업 대장과 기존 자동 수리기의 진행·검토·배포 결과를 조회한다.
- 대표가 사이트 오류 수정·기능 개선 지시를 보내면 서버가 기존 자동 수리기에 자동 접수한다. 별도의 실행 버튼이나 종류 선택은 없다. 질문·상태 확인·계획 검토·실행하지 말라는 요청은 대화로 처리한다.
- 회의 AI는 최근 실제 작업 기록도 참고해 답변한다. 기록 조회 실패는 미확인으로, 전달 성공은 전달 성공으로 설명하며 실제 완료로 바꾸지 않는다.

## 실제 작업 연결

1. 수정할 화면과 원하는 결과를 **2,000자 이내**로 적어 보낸다. 예: `로그인 버튼 오류를 고쳐줘`, `관리자 화면에 검색 기능 추가해줘`.
2. 서버가 이번 메시지를 `bug`·`idea`·`none`으로 판별하고, 수정 지시는 자동 접수한다. 실제 접수가 확인된 뒤 AI 답변에 접수 결과를 덧붙인다.
3. `실제 작업` 목록에서 진행 상태·결과·GitHub 근거를 확인한다. 검증을 통과한 변경은 기존 자동 수리 절차에 따라 사이트에 반영된다.

`그대로 해줘`처럼 짧은 지시에는 같은 작성자의 앞선 회의 내용 최대 4개를 참고한다. 구체적인 선행 수정안이 없으면 필요한 설명을 묻는다. 실행 본문은 현재 지시를 전부 보존하고, 남은 2,000자 한도 안에서 이전 내용을 JSON 인용문으로 첨부한다. AI가 지시를 다시 작성하지 않으며, 과거에 답변이 끝난 메시지는 소급해 실행하지 않는다.

접수 경로는 `admin_ai_meeting_create_task` → `feedback` → 기존 INSERT 트리거 → `feedback-codex` → 기존 GitHub 수리 워크플로다. 기존 한도·비공개 nonce·독립 검토·회귀 검사·배포 검증을 그대로 적용한다. 새로운 API 키는 필요하지 않다.

`ai_meeting_tasks`는 회의 메시지와 feedback를 한 건씩 연결한다. 생성 RPC는 관리자이면서 메시지 작성자인지 검사하고 메시지 행을 잠근 뒤 원자적으로 접수한다. 같은 메시지의 재요청은 기존 작업을 반환한다. 통신 오류로 접수 결과가 불확실하면 브라우저가 같은 메시지 ID로 한 번 자동 재확인한다. 서버는 `admin_ai_meeting_task`로 기존 작업을 먼저 찾아 중복 실행을 막고, 이미 접수된 지시를 다시 AI로 분류하지 않는다. 이미 전달에 실패한 작업은 자동으로 재실행하지 않으며 실패 사유를 표시한다.

| 상태 | 의미 |
|---|---|
| `queued` | 접수 후 실행 대기 |
| `running` | 수정·검증 진행 |
| `needs_review` | 검토 필요 |
| `blocked` | 보류 |
| `resolved` | 기존 실행기의 검증·배포 확인을 통과한 완료 |
| `dispatch_status=failed` | 실행기에 전달하지 못함 |

조회 RPC는 작업에 필요한 상태·요약·결과·근거만 반환한다. 실행 인증용 nonce·lease는 브라우저와 회의 AI에 전달하지 않는다. 새로고침해도 서버에 저장된 작업 목록을 다시 불러온다.

실행 범위는 기존 수리기가 허용하는 오쭈다 코드 수정·기능 개선이다. 보호된 파일·권한 변경 및 외부 연락·SNS 게시·광고 집행은 연결 범위에 포함하지 않는다. 첨부 파일 내용은 수리기에도 보내지 않으므로 필요한 설명을 본문에 적는다. 7개 담당 AI는 회의 답변 역할이며 독립적으로 상시 실행되는 작업자가 아니다.

## 운영 적용 전 체크리스트

1. `supabase/migrations/20261109052631_admin_ai_meeting.sql`이 적용됐는지 확인한다.
   실제 작업 연결에는 `supabase/migrations/20261112042123_admin_ai_meeting_tasks.sql`도 적용한다.
   자동 접수에는 `supabase/migrations/20261112043809_admin_ai_meeting_auto_dispatch.sql`을 추가 적용한다.
2. Supabase의 **Edge Functions → Secrets**에서 `OPENAI_API_KEY`를 설정한다. 키 값은 GitHub·브라우저 코드·대화에 넣지 않는다.
3. `supabase/functions/ai-meeting/`을 `ai-meeting` Edge Function으로 배포한다. 함수의 JWT 검증을 유지한다.
4. 정적 사이트에 `admin/meeting/index.html`, `features/ai-meeting/*`, `admin/app.js`를 배포한다.
5. 관리자·비관리자 각각으로 직접 URL 접근, 파일 업로드/다운로드, 1:1 AI 답변, 전체 회의, 지시 자동 접수·일반 질문 미실행, 동일 작업 재시도, 작업 상태 갱신, 모바일 화면을 테스트한다.
6. OpenAI 사용량/오류율을 확인하고, 관리자만 열람할 수 있는 파일임을 재확인한다.

서버 설정이 빠진 경우 AI 호출은 `ai_not_configured`로 응답하며, 브라우저에는 API 키가 전송되지 않는다. 기존 자동 오류수정용 키는 변경하지 않는다.

## 로컬 검증

```sh
node --check features/ai-meeting/app.js
node --test features/ai-meeting/activity.test.mjs
node --test supabase/functions/ai-meeting/handler.test.mjs
node --test features/ai-meeting/*.test.mjs
node tests/ai-meeting-tasks-db.test.cjs
node tests/feedback-ai-dispatch-db.test.cjs
node tests/feedback-codex-gateway.test.cjs
```

