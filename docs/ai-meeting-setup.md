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
- 상황판은 다른 대화의 작업이나 상시 자율 실행을 감시하지 않는다. 별도 작업 실행기·작업 대장이 연결되기 전까지 7개 AI는 회의 답변 역할이다. 실제 코드 배포의 근거는 GitHub Actions에서 확인한다.

## 운영 적용 전 체크리스트

1. `supabase/migrations/20261109052631_admin_ai_meeting.sql`이 적용됐는지 확인한다.
2. Supabase의 **Edge Functions → Secrets**에서 `OPENAI_API_KEY`를 설정한다. 키 값은 GitHub·브라우저 코드·대화에 넣지 않는다.
3. `supabase/functions/ai-meeting/`을 `ai-meeting` Edge Function으로 배포한다. 함수의 JWT 검증을 유지한다.
4. 정적 사이트에 `admin/meeting/index.html`, `features/ai-meeting/*`, `admin/app.js`를 배포한다.
5. 관리자·비관리자 각각으로 직접 URL 접근, 파일 업로드/다운로드, 1:1 AI 답변, 전체 회의, 재시도, 모바일 화면을 테스트한다.
6. OpenAI 사용량/오류율을 확인하고, 관리자만 열람할 수 있는 파일임을 재확인한다.

서버 설정이 빠진 경우 AI 호출은 `ai_not_configured`로 응답하며, 브라우저에는 API 키가 전송되지 않는다. 기존 자동 오류수정용 키는 변경하지 않는다.

## 로컬 검증

```sh
node --check features/ai-meeting/app.js
node --test features/ai-meeting/activity.test.mjs
node --test supabase/functions/ai-meeting/handler.test.mjs
```

