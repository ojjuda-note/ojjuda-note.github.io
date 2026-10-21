# 오쭈다 약관·개인정보처리방침 점검 — 2026-10-21

대상: `terms.html`, `privacy.html`, `delete-account.html`, 공통 가입 동의 화면.
기준 소스: `1f2d507f3e6ff93a84233c25a1f55ab0311205c1` (0.46.21-beta).
배포 버전: 0.46.22-beta. 공개일 2026-10-21, 개정 시행일 2026-11-20 00:00 Asia/Seoul.

## 수정한 내용

- 오락실·공원·설정에 맞춰 현재 기능을 설명하고, 폐지된 방·앨범·동물·카페·도서관·상점·이벤트 광고 설명을 현재 문서에서 제거했다.
- 둘러보기, 선택 추천인과 이메일 확인 후 집계, 친구 쪽지의 관리자 열람 및 접근 기록, 게임·무료 ZU 충전·카드 보관을 명시했다.
- 전화번호 등의 실제 비밀번호 찾기 용도와 현재 설정의 개인정보 수정·회원 탈퇴 경로를 반영했다. 미제공 선물 전달을 수집 목적으로 주장하던 문구를 제거했다.
- 카드 공개 만료를 실제 함수의 한국 시간 월 경계와 일치시켰다. 10월 작성 → 다음 해 4월 안내 → 5월 1일 목록 제외라는 예시를 포함했다.
- 무료·베타라는 이유로 책임을 포괄 배제하던 조항을 관계 법령에 따른 책임과 이의 제기 절차로 수정했다.
- 실제 외부 처리에 포함되나 종전 방침에서 빠졌던 GitHub Actions 백업, 국내 네이버클라우드 암호화 저장, 의견·고장 신고의 비공개 GitHub/OpenAI 분석을 설명했다.
- 이전 게시 원문을 `policies/2026-09-29/`에 보존했다. 원문 본문은 변경하지 않고 보관본 표시·홈 기준 경로·검색 제외만 추가했다.
- 기존 고지 기간을 단축하거나 소급 동의시키지 않는다. 가입 동의 링크와 기록하는 약관 버전은 한국 시간 시행 경계에 맞춰 같은 문서를 사용한다. 기존 회원 동의 기록은 변경하지 않는다.
- 세 문서의 목차·링크·표·모바일/어두운 화면 가독성을 함께 정리했다.

## 실제 처리 방식 확인

운영 DB에서는 행 데이터 대신 함수 정의·외래 키·정기 작업을 읽었다. 개인정보 행 조회나 자료 삭제, 스키마 변경은 하지 않았다.

| 항목 | 확인 근거와 결과 |
| --- | --- |
| 쪽지 | `friend_messages` 발신자/수신자 모두 Auth 삭제 시 CASCADE. 친구 해제는 삭제가 아님. 관리자 조회는 접근 기록을 남김. 별도 자동 만료 없음 |
| 추천인 | 가입자 탈퇴 시 `user_id` SET NULL; 추천인 탈퇴 시 CASCADE. 가입/확인 시각과 집계가 남으므로 완전 익명화라고 표현하지 않음 |
| 탈퇴 계정정보 | `withdrawn_member_accounts`, 1개월 만료와 5분 주기 파기 작업. 재가입 제한 72시간 |
| 카드·답글 | `next_note_archive_due`, `run_retention_purge` 및 실행 중인 archive/purge 정기 작업 |
| 신고 | 처리 완료 후 1년 파기 함수와 정기 작업. 신고 종류에 따라 탈퇴 시 CASCADE 또는 연결 SET NULL |
| 의견·고장 신고 | `public.feedback.user_id` SET NULL. 본문·진단·상태는 잔존. 공원 문의의 `inquiries.user_id` CASCADE와 구별 |
| 백업 | `ops/backup.py` 및 `nightly-backup.yml`. 매주 실행 시 30일 경과분 정리. 생성 30일째 즉시 삭제 또는 운영 행 삭제와 동시 삭제라고 표현하지 않음 |
| 자동 오류 분석 | 비공개 `ojjuda-codex-worker` 워크플로: 제한된 의견 자료 전달, OpenAI API 분석, 비공개 산출물 1일 보관 설정 |

## 확정하지 않은 사항

이번 작업은 실제 처리 현황에 맞춘 문서 정리이며, 모든 법률 요건 충족을 인증하지 않는다. 아래 항목은 운영 계약·설정 또는 별도 운영 결정이 필요하므로 공개 문서에서도 미확정 사실을 확정적으로 쓰지 않았다.

- 공급자별 정확한 계약 법인, 모든 처리 국가, 플랜별 백업·접속 로그 보관 기간, 국외 이전 근거와 별도 동의의 적정성.
- 고장 신고 본문·관리자 접근 기록·이메일 문의의 구체적 보관 종료 기준. 현재 없는 자동 파기 기능을 있다고 쓰지 않았다.
- 필수 가입정보의 최소수집 및 동의 구분, 72시간 재가입 제한을 넘어서는 1개월 탈퇴 정보 보관의 법적 근거 검토.
- 백업 장애 시 만료 자료의 적시 재정리, 복구 시 삭제 요청을 재적용하는 운영 절차. 기존 백업 파일은 이번에 변경·삭제하지 않았다.

## 검증

- 로컬 가입 회귀 검사 통과. 시행 직전/정각(2026-11-19 14:59:59.999Z / 15:00:00.000Z)의 링크와 동의 버전 일치 확인.
- 현재 문서에서 폐지 기능 설명 미검출, 문서 로컬 링크·목차 대상·ID 검사 통과.
- CI `39572333809` / job `119129334187` 통과: 가입·추천인 UI 회귀, 전체 인라인 스크립트 문법, 3개 문서 × 320·390·1280px × 밝게·어둡게 18개 레이아웃, 보관본 링크.
- 첫 CI의 문서 검사는 긴 전체 페이지 스크린샷 캡처 오류로 중단되었으며, 화면 단위 캡처로 바꾼 뒤 동일한 레이아웃 검사를 모두 통과했다. 앱 코드 오류는 아니었다.
- 검증된 작업 커밋: `b482212c8a08e24d5fa7b5064c1a948df7f88ea7`. 스크린샷 묶음 SHA-256: `e26ec830a02047f2a5dddd5eabbe0f2a91f3cad4b5e3a8e5c361bd99d29a33d9`.
- 실제 회원가입·쪽지 발송·탈퇴·결제는 수행하지 않았다. 배포 후 내용 해시와 실제 문서 화면을 확인한다.

## 참고한 공식 자료

- 개인정보보호위원회 [2026 개인정보 처리방침 작성지침 공개 안내](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20885)
- [개인정보 보호법 제30조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?lsJoLnkSeq=1033215151), [시행령 제31조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=67000), [국외 이전 제28조의8](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029331899)
- [약관법 제7조](https://law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0007&lsiSeq=260021&urlMode=lsScJoRltInfoR)
- [Supabase 처리 위치 안내 (2026-10-06)](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq)
- [GitHub 개인정보처리방침](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), [OpenAI API 데이터 관리](https://developers.openai.com/api/docs/guides/your-data)
- [Google Fonts 개인정보 안내](https://fonts.googleblog.com/2022/11/your-privacy-and-google-fonts.html), [OSMF 정책](https://osmfoundation.org/wiki/Privacy_Policy)
