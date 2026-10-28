# 오쭈다 사천성

싱글 플레이 사천성. 4개부터 900개까지 15단계이며 같은 그림은 한 판에 최대 4개입니다. 각 패를 무작위로 섞고, 막히면 다시 섞습니다.

완료 시간은 오락실의 이번 달 게임순위에 자동 등록합니다. 회원과 손님을 합쳐 한 사람당 최고 기록 하나를 비교합니다. 완료한 단계가 높을수록 우선이며, 같은 단계는 가장 짧은 시간, 같은 시간은 먼저 달성한 순서입니다. 첫 패·힌트·섞기부터 시간을 측정하고 게임을 나가도 시간은 흐릅니다. 진행과 개인 기록은 브라우저에 저장하며, 등록 실패한 기록은 동일한 계정에서 재전송할 수 있습니다.

입구: `/world.html?game=sacheonseong`

검증:
- `node tests/sacheonseong-engine.test.cjs`
- `node tests/sacheonseong-ranking.test.cjs`
- `node tests/sacheonseong-leaderboard.test.cjs`
- `tests/sacheonseong-best-ranking.sql`: 최고 단계·시간·동점·사용자별 중복 제거 검증
- `tests/sacheonseong-ranking.sql`: 기록이 없는 테스트 DB에서 트랜잭션 롤백 검증

공식 순위는 기존 캐주얼 게임 기록 API를 사용합니다. 시간은 1/100초 단위로 변환하며 보상 없이 미검증 기록으로 저장합니다. 기존 단계별 저장 기록을 보존하며 게시판과 게임 안의 공식 순위는 모두 종합 순위로 표시합니다.
