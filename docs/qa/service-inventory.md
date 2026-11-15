# 오쭈다 서비스 목록과 코드 점검 순서

2026-11-15 기준. 처음 보는 화면은 [사이트맵](https://ojjuda.kr/sitemap.html)에서, 구현 파일은 [소스 위치 안내](../source-map.md)에서 찾을 수 있다.

## 서비스 구역과 기능

| 구역 | 시스템 | 세부 기능 | 담당 소스 |
| --- | --- | --- | --- |
| 입장·계정 | 회원가입·인증 | 가입, 약관 동의, 이메일 인증, 로그인·로그아웃, 비밀번호 재설정, 탈퇴 | `app/portal/`, `shared/auth/`, `features/account/` |
| 아지트 홈 | 출석·미션 | 방문 도장, 추천 게임, 숫자야구, 상식 퀴즈, 초성 퀴즈 | `features/home/`, `world.html` |
| 오락실 | 게임·기록 | 혼자 하기, 회원 대전, 월간 순위, 게임별 점수 저장 | `games/`, `shared/games/`, `features/arcade/` |
| 대전방 | 실시간 참여 | 방 생성·검색·입장, 친구 초대, 재접속·종료 | `features/arcade/arcade-rooms.js`, 게임별 서버 함수 |
| 술게임 | 성인 회원용 파티 게임 | 한 대로 플레이, 여러 기기 대전, 대기실, 질문·단어 선택 | `games/drinking/`, 게임별 폴더 |
| 공원 | 익명카드 | 피드, 작성, 답글, 공감, 메모함, 공유, 신고·차단 | `park/`, `note/` |
| 설정·친구 | 관계·알림 | 프로필, 친구 신청·수락, 쪽지, 알림 설정, 종 버튼 알림함, 대전 초대 | `features/profile/`, `features/friends/`, `note/notifications.js` |
| 쭈·보상 | 지갑·선물 | 잔액, 충전, 쭈 사용, 이용권 재조회, 상품권 수령 | `features/wallet/`, `features/rewards/`, `gift.html` |
| 그룹·생활 | 모임·탐색 | 그룹 가입·초대, 글·미디어·일정, 맛집 지도, 축제·경기·공연 검색 | `groups/`, `games/certified-restaurants/`, `games/festival-schedule/` |
| 팬페이지 | 목록·상세 | 30팀 검색, 관심 등록, 사진·앨범·영상·일정, 허용된 편집 | `features/fanpages/` |
| 바이오리듬·운세 | 풀이·구매 | 바이오리듬, 타로, 사주, 두 사람 궁합, 이용권 확인 | `features/biorhythm/`, `games/moonlit-tarot/`, `games/starlit-saju/` |
| 운영·지원 | 진단·권한 | 관리자 업무, 문의·오류 신고, 사용 통계, 오프라인 안내 | `admin/`, `shared/diagnostics/`, `shared/analytics/`, `sw.js` |

## 관리자모드

| 영역 | 기능 |
| --- | --- |
| 운영 현황 | 운영 요약, 방문·이용 통계, 오류 현황 |
| 회원·ZU | 가입자 관리, 정지 계정, 탈퇴 계정, 추천인, 사용자별 ZU, 운세·리듬 구매내역, 첫 방문·무료 충전 설정, 상품권 등록 |
| 콘텐츠 관리 | 카드, 쪽지 관리, 그룹 관리, 포토땅따먹기, 술게임 질문·단어 관리, 위치 지도, 자료 모아보기 |
| 신고·안전 | 신고 처리, 문의·의견, 위험 신호, 카드 이용 제한, 도배 방지, 금칙어 |
| 운영·보관 | 공지 관리, 운영 연결, 작업 기록, 휴지통 전체, 삭제한 카드, 삭제한 쪽지, 기타 보관 |

## 페이지와 게임

배포 대상 HTML **103개**를 파일별로 기록했다. 한 게임의 체험·대전 주소와 아티스트별 안내 페이지도 각각 한 행이다. `world.html` 안의 아지트·오락실·공원·설정 탭과 미션은 위 기능표에 따로 담았다. 테스트용 HTML 한 개는 배포 대상에서 제외했다.

오락실 공개 바로가기는 혼자 즐기는 게임 12종과 함께하는 게임 7종이다. 포토땅따먹기·맞고·세븐포커·룰렛은 성인용 경로로, 술게임 15종에는 각각 전용 진입점이 있다. 나사 풀기의 두 모드와 당구의 세 종목은 각 게임에 포함한다.

### 입장·계정·안내 (12)

| 화면 | 진입 파일 |
| --- | --- |
| 회원 탈퇴 안내 | [delete-account.html](../../delete-account.html) |
| 제작자 소개 | [features/guide/creator.html](../../features/guide/creator.html) |
| 받은 기프티콘 | [gift.html](../../gift.html) |
| 사용법 | [guide.html](../../guide.html) |
| 오쭈다 아지트 | [index.html](../../index.html) |
| 연결 확인 | [offline.html](../../offline.html) |
| 개인정보처리방침 | [policies/2026-09-29/privacy.html](../../policies/2026-09-29/privacy.html) |
| 이용약관 | [policies/2026-09-29/terms.html](../../policies/2026-09-29/terms.html) |
| 개인정보처리방침 | [privacy.html](../../privacy.html) |
| 사이트맵 | [sitemap.html](../../sitemap.html) |
| 이용약관 | [terms.html](../../terms.html) |
| 오쭈다 아지트 | [world.html](../../world.html) |

### 오락실 (24)

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
| 월드땅따먹기 | [games/ttang.html](../../games/ttang.html) |

### 게임의 별도 진입·체험 (3)

| 화면 | 진입 파일 |
| --- | --- |
| 샛별키우기 별도 진입점 | [games/bulssi/index.html](../../games/bulssi/index.html) |
| 맞고 회원 대결 | [games/matgo-online.html](../../games/matgo-online.html) |
| 포토땅따먹기 한 판 체험 | [photo-ttang.html](../../photo-ttang.html) |

### 술게임 (17)

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
| 오쭈다 아지트 | [park/index.html](../../park/index.html) |

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

### 관리자 (2)

| 화면 | 진입 파일 |
| --- | --- |
| 관리자 모드 | [admin/index.html](../../admin/index.html) |
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

기준 소스는 `sitemap.html`, `world.html`, `admin/navigation.js`, `games/drinking/table-view.js`와 각 HTML 진입점이다. 메뉴가 바뀌면 해당 구역의 행과 링크를 함께 수정한다.
