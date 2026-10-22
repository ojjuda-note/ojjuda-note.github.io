# 공원 카드 자동 예약

2026-10-21부터 오쭈다 아지트는 오락실·공원·설정만 운영한다.
우리집·앨범·비디오·게시판·생활 기능과 예약은 종료했다.

공원 카드는 한국 시간 01:01·07:01·13:01·19:01에 하루 4장 게시한다.
`ojjuda_note_internal.auto_card_copy`, `auto_card_schedule`의 슬롯 1·4·7·10을 사용한다.
`planned_at`은 해당 날짜 01·07·13·19시 KST 정각이며 본문은 1–200자다.
`content_source='curated_automation'`, `gender='private'`, 기존 전국 후보 `site_id`를 사용한다.
`ojjuda_note_daily_auto_cards`의 cron은 UTC `1 4,10,16,22 * * *`이다.

내일·모레의 빈 슬롯만 채우고 누락된 과거 시각을 몰아서 발행하지 않는다.
날짜별 트랜잭션에서 `pg_advisory_xact_lock(284726,(local_day-date '2000-01-01')::integer)`을 잡고 기존 슬롯을 재확인한다.
본문과 예약은 같은 트랜잭션에 저장하며 금지어·중복·길이를 확인한다.
구형 `stage_auto_cards`와 `plan_auto_cards`는 호출하지 않는다.
실제 발행은 기존 `run_auto_cards()`와 서버 cron에 맡긴다.
중지된 설정이나 예약 작업을 임의로 재개하지 않는다.
