# 오쭈다 서비스 목록과 코드 점검 순서

2026-11-20 기준. 처음 보는 화면은 [사이트맵](https://ojjuda.kr/sitemap.html)에서, 구현 파일은 [소스 위치 안내](../source-map.md)에서 찾을 수 있다. 담당 이름은 `features/organization/organization.json`의 공개 업무 조직을 따른다. 아래 표는 서비스와 책임의 연결 기준이며, 모든 운영 계정·외부 서비스의 실시간 정상 상태를 인증하는 표는 아니다.

## 서비스 구역과 기능

| 구역 | 시스템 | 세부 기능 | 담당 소스 |
| --- | --- | --- | --- |
| 입장·계정 | 회원가입·인증 | 가입, 약관 동의, 이메일 인증, 로그인·로그아웃, 비밀번호 재설정, 탈퇴 | `app/portal/`, `shared/auth/`, `features/account/` |
| 아지트 홈 | 출석·미션 | 방문 도장, 추천 게임, 숫자야구, 상식 퀴즈, 초성 퀴즈 | `features/home/`, `world.html` |
| 오락실 | 게임·기록 | 혼자 하기, 회원 대전, 월간 순위, 게임별 점수 저장 | `games/`, `shared/games/`, `features/arcade/` |
| 대전방 | 실시간 참여 | 방 생성·검색·입장, 친구 초대, 재접속·종료 | `features/arcade/arcade-rooms.js`, 게임별 서버 함수 |
| 술게임 | 성인 회원용 파티 게임 | 한 대로 플레이, 여러 기기 대전, 대기실, 질문·단어 선택 | `games/drinking/`, 게임별 폴더 |
| 공원 | 익명카드 | 피드, 작성, 답글, 공감, 메모함, 공유, 신고·차단 | `park/`, `note/` |
| 파장 | 질문·신호·대화 | 오늘의 질문·답변, 주변·레이더, 신호 수락, 대화·정보 교환, 공개 프로필·차단 | `features/pajang/`, `pajang_member` RPC, `supabase/functions/pajang-assets/` |
| 설정·친구 | 관계·알림 | 프로필, 친구 신청·수락, 쪽지, 알림 설정, 종 버튼 알림함, 대전 초대 | `features/profile/`, `features/friends/`, `note/notifications.js` |
| 쭈·보상 | 지갑·선물 | 잔액, 충전, 쭈 사용, 이용권 재조회, 상품권 수령 | `features/wallet/`, `features/rewards/`, `gift.html` |
| 그룹·생활 | 모임·탐색 | 그룹 가입·초대, 글·미디어·일정, 맛집 지도, 축제·경기·공연 검색 | `groups/`, `games/certified-restaurants/`, `games/festival-schedule/` |
| 팬페이지 | 목록·상세 | 30팀 검색, 관심 등록, 사진·앨범·영상·일정, 허용된 편집 | `features/fanpages/` |
| 바이오리듬·운세 | 풀이·구매 | 바이오리듬, 타로, 사주, 두 사람 궁합, 이용권 확인 | `features/biorhythm/`, `games/moonlit-tarot/`, `games/starlit-saju/` |
| 운영·지원 | 진단·권한 | 관리자 업무, 문의·오류 신고, 사용 통계, 오프라인 안내 | `admin/`, `shared/diagnostics/`, `shared/analytics/`, `sw.js` |
| 도움말·조직 | 공통 안내 | 아지트·공원·파장 설정 → 도움말 → 공개 조직도, 원래 서비스 설정으로 복귀 | `features/organization/`, `shared/navigation/section-back.js` |
| 앱 테스트 | 참여 신청 | 공원·파장 Android 테스터 신청, 동의·중복 처리, 운영자 확인 | `features/testers/`, `.github/workflows/android-apps.yml` |

## 부서별 서비스 연결 책임

업무를 맡기는 기준은 아래와 같다. 공통 기능의 변경은 담당 서비스팀과 공통팀이 함께 확인한다. 감사팀은 실제 검사 결과·발견 문제·담당자·재확인 근거를 검토하며, 조직도에 이름이 있다는 이유만으로 상시 점검이 작동한다고 표시하지 않는다.

| 담당 | 연결 범위 | 확인할 근거 |
| --- | --- | --- |
| 메인개발팀 · 회원계정팀 · 회원성장팀 | 모든 서비스의 가입·로그인·복구·로그아웃·탈퇴, 가입 후 원래 서비스 복귀 | `config.js`, `app/portal/`, `shared/auth/`, `features/account/`; 계정 전환 시 이전 회원 자료·늦은 응답 제거 |
| 메인개발팀 · 쭈관리팀 | 공통 잔액·충전·이용권·선물, 서비스 전환 후 같은 회원의 잔액 | `features/wallet/`, `features/rewards/`, `features/pajang/account-toolbar.mjs`; 명시적 구매·중복 차감 방지·실패 표시 |
| 아지트개발팀 · 방문미션팀 · 그룹운영팀 | 방문·미션, 그룹 가입·초대·게시글·사진·일정 | `features/home/`, `groups/`; 로그인과 초대 보존, 회원·공개 범위, 뒤로 가기 |
| 게임개발팀 · 나만의플레이팀 · 함께하는플레이팀 · 어른들플레이팀 | 오락실 → 게임·대전방 → 결과·순위 → 다시 시작·나가기 | `games/`, `shared/games/`, `features/arcade/`; 아래 게임 공통 기준과 각 게임의 서버 권한 |
| 공원개발팀 · 공원카드게시팀 · 카드편집팀 · 피드운영팀 · 이용자활동팀 | 자료 선정·예약 게시 → 카드·피드 → 답글·공감·공유·신고·메모·이벤트 | `park/`, `note/`, `supabase/functions/park-video/`; 작성 내용 보존, 비공개 미디어 권한, 게시 후 노출 |
| 파장개발팀 · 오늘파장팀 · 마음함팀 · 내파장팀 | 회원 확인 → 질문·답변 → 신호·대화·프로필·차단, 공통 계정·쭈·알림 | `features/pajang/member.mjs`, `account-toolbar.mjs`, `src/`; 성인·동의·수락 권한과 계정 변경 후 이전 대화 제거 |
| 일상정보팀 · 운세콘텐츠팀 | 팬페이지·맛집·행사와 바이오리듬·타로·사주·궁합의 입장·공유·복귀 | `features/fanpages/`, `features/biorhythm/`, 관련 `games/`; 목록·상세 이동, 구매 범위·가격·재조회 |
| 팬페이지자료팀 · 맛집자료팀 · 행사자료팀 · 자료검증팀 | 원자료 → 검증 자료 → 공개 목록·상세·공원 카드 인계 | 자료 파일·수집 스크립트·해당 워크플로; 출처·중복·갱신 시각·반영 결과를 구분 |
| 홍보기획팀 · 스레드운영팀 · 블로그운영팀 | 홍보 링크 → 서비스 입장 → 가입·추천인 → 첫 이용 | `shared/share/`, `shared/auth/invite-referral.js`, `shared/navigation/short-links.json`; 외부 계정·게시·성과는 연결된 실제 기록이 있을 때만 확인 완료 |
| 메인디자인팀 · 아지트디자인팀 · 공원디자인팀 · 파장디자인팀 · 화면개발팀 · 사용성기획팀 | 같은 기능의 이름·버튼·색·여백·접근성, 화면 전환·키보드·좁은 화면 | 공통 컴포넌트와 서비스별 실제 화면; 시각 순서와 DOM·탭 순서의 일치 |
| 품질검수팀 · 이용지원팀 · 커뮤니티관리팀 | 문의·오류·신고 → 담당 처리 → 결과 알림·원래 화면 | `note/support.js`, `note/notifications.js`, `shared/diagnostics/`, `admin/`; 재시도·회원 분리·공통 금칙어 치환 |
| 서버관리팀 · 보안관리팀 | 공통 API·인증·DB·저장소·실시간 채널, 서비스별 관리자 범위 | 실제 서버 지표·권한 검사·실패 응답; 클라이언트 표시와 서버 권한을 각각 검증 |
| 백업복구팀 · 배포관리팀 · 운영자동화팀 | DB·원본 파일·소스 백업, 배포 버전·캐시·예약 작업·롤백 | `admin/connections.js`, `ops/`, `.github/workflows/`, 영역별 버전; 작업 단계 성공·보관 시각·복원 시험을 따로 확인 |
| 인사팀 · 총무팀 · 구매계약팀 · 회계팀 · 예산관리팀 · 비서실 | 담당 배정·인수인계·결재, 도구·계약·구독·실제 비용 | 권한 있는 운영대장·작업·청구·결재 기록. 공개 서비스 소스만으로 실적·회계·계약 연동을 확인했다고 하지 않음 |
| 법무팀 | 약관·개인정보·콘텐츠 사용권·아동 안전·게임·쭈·앱 등록 정책 | `terms.html`, `privacy.html`, `child-safety.html`, `policies/`, 실제 계약·스토어 자료; 화면 안내와 처리 범위 일치 |

## 공통 연결 점검표

검사마다 대상 버전·서비스·회원 상태·기기·결과를 남긴다. 소스 연결 확인, 격리된 모의 검사, 실제 운영 조회, 실기기 사용을 구분한다. 실제 가입·발송·구매·대전·운영 데이터 변경은 읽기 전용 점검에 포함하지 않는다.

| 연결 | 통과 기준 | 기존 검사·소스 |
| --- | --- | --- |
| 가입·로그인 → 원래 서비스 | 아지트·공원·파장·그룹 등 허용된 목적지를 보존하고 외부 임의 주소를 거부한다. 로그아웃·계정 변경 이후 늦은 응답으로 이전 회원 상태가 살아나지 않는다. | `portal-auth-entry`, `world-auth-race`, `pajang-account`, `park-settings-navigation` 검사 |
| 서비스 전환·뒤로 가기 | 서비스 안의 창부터 닫고 실제 이전 화면으로 복귀한다. 직접 진입·새로고침·앞으로 가기에도 안전한 복귀 경로를 갖고 작성·전송 중인 내용을 보호한다. | `section-back-navigation`, `public-dialog-navigation`, `park-frame-cache`, `pajang-navigation`, `pajang-navigation-dom` 검사 |
| 잔액·충전·구매 | 동일 회원의 실제 잔액을 사용하며 계정 변경 시 이전 잔액을 지운다. 충전·구매 완료 뒤 늦은 조회가 새 잔액을 덮지 않고, 재시도로 중복 차감하지 않는다. | `pajang-account-toolbar`, `ju-charge-db`, `ju-charge-ui`, `world-wallet-response-ui` 검사와 상품별 구매 검사 |
| 알림·공지·초대 | 같은 회원의 읽음·배지 상태를 공유하고 대상 카드·문의·그룹·게임으로 연결한다. 초대 수락과 선물 수령은 명시적인 동작으로 처리하며, 공지 갱신이 게임·입력·iframe을 교체하지 않는다. | `notification-summary-ui`, `service-notice-refresh`, `game-friend-invites-db`, `page-share`, `invite-referral` 검사 |
| 도움말·약관·조직도 | 아지트·공원·파장 도움말에서 같은 공개 조직도를 열고 각 서비스 설정으로 돌아온다. 약관·개인정보·사용법의 서비스별 복귀를 보존한다. 공개 JSON과 관리자 내부 자료를 분리한다. | `features/organization/page.js`, `organization.json`, `shared/navigation/section-back.js`, `admin/operations.js` |
| 공개 주소·공유 | 사이트맵·짧은 주소·예전 주소가 현재 기능으로 연결된다. 공유 URL에 계정 토큰·인증 코드·내부 화면 상태를 넣지 않으며 추천인만 검증 후 보존한다. | `short-links`, `page-share`, `invite-referral` 검사 |
| 권한·개인정보 | 비회원·회원·성인 회원·관리자·호스트·참여자·관전자의 권한을 구분한다. 다른 회원·다른 서비스 자료 접근을 차단하고 탈퇴·차단·계정 전환 뒤도 확인한다. | `admin-service-scope`, 서비스별 DB·서버 검사; 기존 RLS·성인 확인·공개 동의 유지 |
| 자료·예약·지원 인계 | 검증된 자료와 예약 작업의 실제 결과를 공개 화면·운영 기록·이용자 알림에서 대조한다. 실패·중복·진행 중을 성공으로 표시하지 않는다. | 콘텐츠 워크플로·수집 결과·문의/신고 처리 기록; 외부 채널은 실제 연결 범위만 기록 |
| 배포·백업·복구 | 배포한 커밋·영역 버전·파일 캐시가 맞는다. 백업은 DB·파일·소스별 성공 단계를 확인하고, 임시 소스 복사·검사 성공·전체 백업·복원 성공을 구분한다. | `world-section-releases`, `admin-connections-ui`, 백업 job·단계 로그, 격리된 복원 시험 |

### 게임 입장·결과 버튼 기준

- 대전방과 게임 종료 창의 한 쌍은 **왼쪽 나가기, 오른쪽 시작·다시 시작** 순서다. `나가기`, `방 나가기`, `오락실로` 등 실제 나가는 동작은 왼쪽에 두고 이름을 목적지에 맞춘다.
- DOM도 나가기 → 시작·다시 시작 순서로 만들어 키보드 탭 순서와 화면 순서를 맞춘다. CSS `order`만으로 뒤집지 않는다. 좁은 화면에서도 두 버튼의 좌우 관계를 유지하고 긴 글자는 자연스럽게 줄바꿈한다. 순위·공유 등 보조 동작은 이 한 쌍의 위치를 바꾸지 않는다.
- 다시 시작은 현재 모드와 허용된 참가자를 기준으로 실제 새 판을 준비한다. 호스트만 시작할 수 있는 게임은 서버 권한을 유지하고, 참여자·관전자는 허용되지 않은 재시작을 요청하지 않는다. 재시작 불가·대기·상대 이탈은 이유를 표시한다.
- 나가기는 게임·방별로 이탈을 처리하고 타이머·입력·실시간 구독·폴링·음향을 정리한 뒤 올바른 서비스나 방 목록으로 복귀한다. 종료 창만 닫거나 이전 판 상태를 남긴 채 새 판처럼 표시하지 않는다.
- 결과·점수·월간 순위·쭈 정산은 같은 판에 한 번만 반영한다. 연속 클릭, 늦은 응답, 재접속, 상대 이탈에도 중복 정산과 낡은 결과 재표시를 검사한다.
- 공통 결과·입장·방 목록 검사와 각 게임의 실제 핸들러 검사를 함께 사용한다. 윷놀이의 공통 공개방 진입, 당구 세 종목, 나사 풀기 두 모드, 술게임 한 대·멀티 경로를 구별한다. 운영 회원으로 실제 방을 만들거나 참여하지 않고 격리된 세션으로 검증한다.

## 관리자모드

| 영역 | 기능 |
| --- | --- |
| 운영 현황 | 운영 요약, 방문·이용 통계, 오류 현황 |
| 회원·ZU | 가입자 관리, 정지 계정, 탈퇴 계정, 추천인, 사용자별 ZU, 운세·리듬 구매내역, 첫 방문·무료 충전 설정, 상품권 등록 |
| 콘텐츠 관리 | 카드, 쪽지 관리, 그룹 관리, 포토땅따먹기, 술게임 질문·단어 관리, 위치 지도, 자료 모아보기 |
| 신고·안전 | 신고 처리, 문의·의견, 위험 신호, 카드 이용 제한, 도배 방지, 금칙어 |
| 운영·보관 | 공지 관리, 운영 연결, 작업 기록, 휴지통 전체, 삭제한 카드, 삭제한 쪽지, 기타 보관 |

## 페이지와 게임

추적 중인 배포 대상 HTML **115개**를 파일별로 기록했다. 한 게임의 체험·대전 주소와 아티스트별 안내 페이지도 각각 한 행이다. `world.html` 안의 아지트·오락실·공원·설정 탭과 미션은 위 기능표에 따로 담았다. `tests/`의 검사 전용 HTML 한 개는 제외했으며, 실제 신청 화면인 테스터 모집은 포함한다. 빌드가 생성하는 짧은 주소 HTML은 원본 진입 파일과 중복 계산하지 않는다.

오락실 공개 바로가기는 혼자 즐기는 게임 12종과 함께하는 게임 9종이다. 포토땅따먹기·맞고·세븐포커·룰렛은 성인용 경로다. 술게임은 한 대로 16종·멀티 15종이며, 멀티 15종에는 각각 전용 진입점이 있다. 한 대 전용 모양 맞추기는 공통 술게임 화면에서 열며 별도 HTML로 세지 않는다. 나사 풀기의 두 모드와 당구의 세 종목은 각 게임에 포함한다.

### 입장·계정·안내 (16)

| 화면 | 진입 파일 |
| --- | --- |
| 아동 안전 표준 | [child-safety.html](../../child-safety.html) |
| 회원 탈퇴 안내 | [delete-account.html](../../delete-account.html) |
| 제작자 소개 | [features/guide/creator.html](../../features/guide/creator.html) |
| 공개 조직도 | [features/organization/index.html](../../features/organization/index.html) |
| 공원·파장 테스터 신청 | [features/testers/index.html](../../features/testers/index.html) |
| 받은 기프티콘 | [gift.html](../../gift.html) |
| 사용법 | [guide.html](../../guide.html) |
| 오쭈다 아지트 | [index.html](../../index.html) |
| 연결 확인 | [offline.html](../../offline.html) |
| 개인정보처리방침 | [policies/2026-09-29/privacy.html](../../policies/2026-09-29/privacy.html) |
| 이용약관 | [policies/2026-09-29/terms.html](../../policies/2026-09-29/terms.html) |
| 파장 약관·개인정보 개정 안내 | [policies/pajang-revision.html](../../policies/pajang-revision.html) |
| 개인정보처리방침 | [privacy.html](../../privacy.html) |
| 사이트맵 | [sitemap.html](../../sitemap.html) |
| 이용약관 | [terms.html](../../terms.html) |
| 오쭈다 아지트 | [world.html](../../world.html) |

### 오락실 (26)

| 화면 | 진입 파일 |
| --- | --- |
| 이번 달 게임 순위 | [features/arcade/monthly-ranking.html](../../features/arcade/monthly-ranking.html) |
| 뱅! | [games/bang/index.html](../../games/bang/index.html) |
| 당구 | [games/billiards/index.html](../../games/billiards/index.html) |
| 벽돌깨기 | [games/breakout/index.html](../../games/breakout/index.html) |
| 차차 러시! | [games/chacha-rush/index.html](../../games/chacha-rush/index.html) |
| 체스 | [games/chess/index.html](../../games/chess/index.html) |
| 바람의 궁수 | [games/forest-archer/index.html](../../games/forest-archer/index.html) |
| 장기 | [games/janggi/index.html](../../games/janggi/index.html) |
| 맞고 | [games/matgo.html](../../games/matgo.html) |
| 지뢰찾기 | [games/mines/index.html](../../games/mines/index.html) |
| 두더지 잡기 | [games/mole/index.html](../../games/mole/index.html) |
| 마블 | [games/ojjuda-tour/index.html](../../games/ojjuda-tour/index.html) |
| 원카드 | [games/onecard/index.html](../../games/onecard/index.html) |
| 포토땅따먹기 | [games/photo-ttang.html](../../games/photo-ttang.html) |
| 세븐포커 | [games/poker/index.html](../../games/poker/index.html) |
| 룰렛 | [games/roulette/index.html](../../games/roulette/index.html) |
| 쭈달리기 | [games/runner/index.html](../../games/runner/index.html) |
| 사천성 | [games/sacheonseong/index.html](../../games/sacheonseong/index.html) |
| 샛별키우기 | [games/saetbyeol/index.html](../../games/saetbyeol/index.html) |
| 나사 풀기 | [games/screw/index.html](../../games/screw/index.html) |
| 솔리테어 | [games/solitaire/index.html](../../games/solitaire/index.html) |
| 틀린그림찾기 | [games/spot-difference/index.html](../../games/spot-difference/index.html) |
| 탑 쌓기 | [games/stacker/index.html](../../games/stacker/index.html) |
| 탱크게임 | [games/tank/index.html](../../games/tank/index.html) |
| 윷놀이 | [games/yut/index.html](../../games/yut/index.html) |
| 월드땅따먹기 | [games/ttang.html](../../games/ttang.html) |

### 게임의 별도 진입·체험 (4)

| 화면 | 진입 파일 |
| --- | --- |
| 샛별키우기 별도 진입점 | [games/bulssi/index.html](../../games/bulssi/index.html) |
| 장기 AI 대국 | [games/janggi/ai.html](../../games/janggi/ai.html) |
| 맞고 회원 대결 | [games/matgo-online.html](../../games/matgo-online.html) |
| 포토땅따먹기 한 판 체험 | [photo-ttang.html](../../photo-ttang.html) |

### 술게임 (18)

| 화면 | 진입 파일 |
| --- | --- |
| 시간폭탄 | [games/bomb/index.html](../../games/bomb/index.html) |
| 술병 나침반 | [games/bottle/index.html](../../games/bottle/index.html) |
| 악어 이빨 | [games/croc/index.html](../../games/croc/index.html) |
| 술게임 입구·대전방 | [games/drinking/index.html](../../games/drinking/index.html) |
| 술게임 한 대로 플레이 | [games/drinking/local/index.html](../../games/drinking/local/index.html) |
| 술게임 회원 확인 | [games/drinking/verify/index.html](../../games/drinking/verify/index.html) |
| 손병호 게임 | [games/fingers/index.html](../../games/fingers/index.html) |
| 이미지 게임 | [games/imagevote/index.html](../../games/imagevote/index.html) |
| 초성 대결 | [games/initial/index.html](../../games/initial/index.html) |
| 왕게임 | [games/king/index.html](../../games/king/index.html) |
| 라이어 찾기 | [games/liar/index.html](../../games/liar/index.html) |
| 소수파 찾기 | [games/minority/index.html](../../games/minority/index.html) |
| 한 명만 다른 미션 | [games/mission/index.html](../../games/mission/index.html) |
| 러시안 룰렛 | [games/partyroulette/index.html](../../games/partyroulette/index.html) |
| 시크릿 카운트 | [games/secretcount/index.html](../../games/secretcount/index.html) |
| 감각 스톱워치 | [games/stopwatch/index.html](../../games/stopwatch/index.html) |
| 진실게임 | [games/truth/index.html](../../games/truth/index.html) |
| 업앤다운 | [games/updown/index.html](../../games/updown/index.html) |

### 공원 (2)

| 화면 | 진입 파일 |
| --- | --- |
| 스마트 글래스 미리보기 | [park/glasses.html](../../park/glasses.html) |
| 오쭈다 공원 | [park/index.html](../../park/index.html) |

### 파장 (3)

| 화면 | 진입 파일 |
| --- | --- |
| 질문·참여 입구 | [features/pajang/index.html](../../features/pajang/index.html) |
| 오늘·마음함·내 파장 | [features/pajang/station.html](../../features/pajang/station.html) |
| 모두의 답변 이전 주소 → 파장 답변 화면 | [features/pajang/feed.html](../../features/pajang/feed.html) |

### 그룹·생활 (3)

| 화면 | 진입 파일 |
| --- | --- |
| 인증맛집 | [games/certified-restaurants/index.html](../../games/certified-restaurants/index.html) |
| 축제일정 | [games/festival-schedule/index.html](../../games/festival-schedule/index.html) |
| 그룹 | [groups/index.html](../../groups/index.html) |

### 팬페이지 (32)

| 화면 | 진입 파일 |
| --- | --- |
| 아티스트 | [features/fanpages/artist.html](../../features/fanpages/artist.html) |
| 에이투오 라이트 (A2O LITE) | [features/fanpages/idols/a2olite.html](../../features/fanpages/idols/a2olite.html) |
| 에이투오 메이 (A2O MAY) | [features/fanpages/idols/a2omay.html](../../features/fanpages/idols/a2omay.html) |
| 에이투오 소울 (A2O SOUL) | [features/fanpages/idols/a2osoul.html](../../features/fanpages/idols/a2osoul.html) |
| 에스파 (aespa) | [features/fanpages/idols/aespa.html](../../features/fanpages/idols/aespa.html) |
| 앤팀 (&TEAM) | [features/fanpages/idols/andteam.html](../../features/fanpages/idols/andteam.html) |
| 에이티즈 (ATEEZ) | [features/fanpages/idols/ateez.html](../../features/fanpages/idols/ateez.html) |
| 베이비몬스터 (BABYMONSTER) | [features/fanpages/idols/babymonster.html](../../features/fanpages/idols/babymonster.html) |
| 블랙핑크 (BLACKPINK) | [features/fanpages/idols/blackpink.html](../../features/fanpages/idols/blackpink.html) |
| 보이넥스트도어 (BOYNEXTDOOR) | [features/fanpages/idols/boynextdoor.html](../../features/fanpages/idols/boynextdoor.html) |
| 방탄소년단 (BTS) | [features/fanpages/idols/bts.html](../../features/fanpages/idols/bts.html) |
| 엔하이픈 (ENHYPEN) | [features/fanpages/idols/enhypen.html](../../features/fanpages/idols/enhypen.html) |
| 하츠투하츠 (Hearts2Hearts) | [features/fanpages/idols/hearts2hearts.html](../../features/fanpages/idols/hearts2hearts.html) |
| 아이들 (i-dle) | [features/fanpages/idols/idle.html](../../features/fanpages/idols/idle.html) |
| 아일릿 (ILLIT) | [features/fanpages/idols/illit.html](../../features/fanpages/idols/illit.html) |
| 아이브 (IVE) | [features/fanpages/idols/ive.html](../../features/fanpages/idols/ive.html) |
| 키키 (KiiiKiii) | [features/fanpages/idols/kiiikiii.html](../../features/fanpages/idols/kiiikiii.html) |
| 키스오브라이프 (KISS OF LIFE) | [features/fanpages/idols/kissoflife.html](../../features/fanpages/idols/kissoflife.html) |
| 르세라핌 (LE SSERAFIM) | [features/fanpages/idols/lesserafim.html](../../features/fanpages/idols/lesserafim.html) |
| 엔시티 드림 (NCT DREAM) | [features/fanpages/idols/nctdream.html](../../features/fanpages/idols/nctdream.html) |
| 엔시티 위시 (NCT WISH) | [features/fanpages/idols/nctwish.html](../../features/fanpages/idols/nctwish.html) |
| 엔믹스 (NMIXX) | [features/fanpages/idols/nmixx.html](../../features/fanpages/idols/nmixx.html) |
| 리센느 (RESCENE) | [features/fanpages/idols/rescene.html](../../features/fanpages/idols/rescene.html) |
| 라이즈 (RIIZE) | [features/fanpages/idols/riize.html](../../features/fanpages/idols/riize.html) |
| 세븐틴 (SEVENTEEN) | [features/fanpages/idols/seventeen.html](../../features/fanpages/idols/seventeen.html) |
| 스테이씨 (STAYC) | [features/fanpages/idols/stayc.html](../../features/fanpages/idols/stayc.html) |
| 스트레이 키즈 (Stray Kids) | [features/fanpages/idols/straykids.html](../../features/fanpages/idols/straykids.html) |
| 트레저 (TREASURE) | [features/fanpages/idols/treasure.html](../../features/fanpages/idols/treasure.html) |
| 트와이스 (TWICE) | [features/fanpages/idols/twice.html](../../features/fanpages/idols/twice.html) |
| 투어스 (TWS) | [features/fanpages/idols/tws.html](../../features/fanpages/idols/tws.html) |
| 투모로우바이투게더 (TXT) | [features/fanpages/idols/txt.html](../../features/fanpages/idols/txt.html) |
| 팬페이지 | [features/fanpages/index.html](../../features/fanpages/index.html) |

### 바이오리듬·운세 (4)

| 화면 | 진입 파일 |
| --- | --- |
| 오늘의 바이오리듬 | [features/biorhythm/index.html](../../features/biorhythm/index.html) |
| 달의 마녀 타로 | [games/moonlit-tarot/index.html](../../games/moonlit-tarot/index.html) |
| 두 사람의 궁합 | [games/starlit-saju/compatibility.html](../../games/starlit-saju/compatibility.html) |
| 별빛 사주팔자 | [games/starlit-saju/index.html](../../games/starlit-saju/index.html) |

### 관리자 (3)

| 화면 | 진입 파일 |
| --- | --- |
| 관리자 모드 | [admin/index.html](../../admin/index.html) |
| 운영본부 내부 조직도 · 관리자 전용 | [admin/operations.html](../../admin/operations.html) |
| 상품권 등록 | [admin/rewards.html](../../admin/rewards.html) |

### 종료·이동 안내 (4)

| 화면 | 진입 파일 |
| --- | --- |
| 서비스 종료 안내 | [byeolcheonji/index.html](../../byeolcheonji/index.html) |
| 오쭈다 아지트 | [note/glasses.html](../../note/glasses.html) |
| 오쭈다 아지트 | [note/index.html](../../note/index.html) |
| 서비스 종료 안내 | [star/index.html](../../star/index.html) |

## 반복 점검 순서

| 순서 | 무엇을 확인하나 | 기록할 근거 |
| --- | --- | --- |
| 1. 코드 최적화 | 쓰지 않는 자료를 미리 읽는지, 같은 요청·계산을 반복하는지 | 같은 버전·같은 입력에서 변경 전후 처리량과 호출 수 |
| 2. 오류 | 회원가입·알림·관리자·게임의 정상 흐름과 실패 후 복귀 | 실패 검사 이름, 영향 범위, 수정 후 재검사 |
| 3. 속도 | 목록과 상세 화면의 초기 표시, 네트워크 요청, 서버 응답 | 측정 기기·시간·표본 수와 지연 시간. 화면과 서버를 따로 기록 |
| 4. 동시 접속 | 방 참여 경쟁·재접속, 점수·쭈 중복 반영 | 격리된 다중 세션 검사, 운영 집계의 5xx·429·DB 잠금 대기 |
| 5. 보안 | 회원·관리자 권한, 데이터 접근 정책, 보안 진단 변화 | 권한별 기존 검사와 읽기 전용 진단. 상세 보안 결과는 비공개 보고 |

기준 소스는 `sitemap.html`, `world.html`, `admin/navigation.js`, `games/drinking/table-view.js`, `features/organization/organization.json`, `shared/navigation/short-links.json`과 각 HTML 진입점이다. 메뉴·담당·공통 연결이 바뀌면 해당 구역의 행과 검사 근거를 함께 수정한다. 페이지 수는 `git ls-tree -r --name-only HEAD`의 `.html` 중 `tests/`를 제외한 목록과 대조한다.
