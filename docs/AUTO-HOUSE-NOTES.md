# 자동 카드와 우리집 노트

- 공원 사진 카드: `ojjuda_note.cards`, 본문 1–200자, 기존 사진·태그·꾸미기 유지.
- 우리집 노트 → 글쓰기: `public.house_posts`, 빈 글만 금지하며 본문 길이 상한 없음.
- 두 기능을 이름이 비슷하다는 이유로 혼동하지 않는다. 웹소설·유머·이슈·일상 원고는 **우리집 노트**로 발행한다.

## 준비와 발행

Supabase 프로젝트 `ziezbdjofcugznowiuda`를 사용한다. 작성자는 각 config의 전용 자동 계정이며 실제 회원으로 가장하지 않는다.

`ojjuda_house_note_internal.config`의 `enabled`와 cron 활성 상태를 먼저 확인하고 사용자가 멈췄으면 재개하지 않는다. `queue`는 비공개이며 API 역할에 권한이 없다. 본문은 `body`, 종류는 `content_source`(`curated_fiction`, `curated_humor`, `curated_issue`, `curated_daily`)에 저장한다.

한국 날짜 기준 내일·모레를 준비한다. 하루 슬롯은 1–12이며 `planned_at=(local_day::timestamp+(2*slot-1)*interval '1 hour') AT TIME ZONE 'Asia/Seoul'`이다. 날짜별 트랜잭션에서 `pg_advisory_xact_lock(284729,(local_day-date '2000-01-01')::integer)`을 잡고 이미 있는 슬롯과 본문 중복을 다시 확인한다. `ready_at`은 준비 완료 시각이다. 빈 슬롯만 채우며 본문은 자르지 않는다. 금지어와 SHA256 중복 검증을 통과해야 한다.

`ojjuda_house_notes_every_2h`가 UTC `1 0-22/2 * * *`에 `ojjuda_house_note_internal.run_house_notes()`를 호출한다. 현재 시간대의 준비된 글 최대 한 편만 `public.house_posts`에 전체 공개로 발행한다. 같은 시간에 재호출해도 중복 발행하지 않는다. 놓친 예약은 `missed_hour`로 기록하고 몰아서 게시하지 않는다. 준비 작업이 직접 게시하지 않는다.

카드용 짧은 글은 기존 `ojjuda_note_internal.auto_card_copy`와 `auto_card_schedule`에만 준비한다. `content_source='curated_automation'`, 본문 200자 이내의 짧은 푸념·일상 문장으로 기존 카드 성격을 유지한다. 카드 날짜 잠금은 `284726`이다. 24편용 이전 `stage_auto_cards`/`plan_auto_cards`로 새로운 일정을 만들지 않는다. 카드 cron과 두 시간 간격은 유지한다.

## 2026-10-09 위치 정정

잘못 만든 `curated_fiction/humor/issue/daily` 원고만 선별하여 노트 큐로 옮겼다. 이미 게시된 웹소설은 동일 작성자·본문·게시 시각으로 `house_posts`에 저장한 뒤 원본 카드를 보관 처리했다. 큐의 `original_copy`, `original_schedule`, `original_card`와 `source_copy_id`, `source_card_id`가 이전 내용을 보존한다. 기존 짧은 카드·실제 회원 글·앨범·비디오는 이동하지 않는다.

## 검증

```sql
select enabled,author_id from ojjuda_house_note_internal.config;
select local_day,content_source,count(*),count(posted_at),count(cancelled_at)
from ojjuda_house_note_internal.queue group by 1,2 order by 1,2;
select q.id,q.note_id,p.user_id,p.visibility,p.created_at,
       extensions.digest(q.body,'sha256')=extensions.digest(p.body,'sha256') as body_preserved
from ojjuda_house_note_internal.queue q join public.house_posts p on p.id=q.note_id;
select jobname,schedule,active from cron.job
where jobname in ('ojjuda_house_notes_every_2h','ojjuda_note_daily_auto_cards');
```
