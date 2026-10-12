# 자동 공원 카드와 우리집 노트

## 최신 변경 — 2026-10-13

사용자가 웃긴 짤은 앨범에 올리고 동영상도 포함하라고 요청했다. **이후 웃긴 이미지·영상은 우리집 미디어로만 준비한다.** 이미지의 화면 위치는 `앨범`, 영상은 `비디오`이며 `public.media`를 사용한다. 아래 2026-10-12의 짤을 노트에 준비하라는 지시는 종료했다.

- 공원 카드의 6시간 간격과 하루 4장 편성은 유지한다.
- 미공개 `curated_humor` 노트 예약은 검수한 `ojjuda_media_internal.items`로 옮기고 원래 큐에는 이동 사유와 취소 시각을 남긴다. 공개 글과 회원 글은 바꾸지 않는다.
- 앨범·비디오의 준비, 최소 2시간 간격, 파일·출처 검증은 [AUTO-HOUSE-MEDIA.md](AUTO-HOUSE-MEDIA.md)를 따른다. 새 짤을 `house_posts`나 노트 큐에 넣지 않는다.
- 매일 예약 보충 작업 하나가 공원 카드와 앨범·비디오 큐를 함께 보충한다. 별도의 중지된 사진·영상 보충 자동화는 켜지 않아 중복 실행을 막는다.

## 최신 사용자 기준 — 2026-10-12

- 공원 사진 카드: 가볍게 호감을 표현하는 플러팅 글. **6시간마다 1장, 한국 시간 01:01·07:01·13:01·19:01, 하루 4장.**
- 우리집 노트: **웃긴 짤 이미지와 짧은 한국어 농담 위주. 2시간마다 1편, 한국 시간 홀수 시각 1분, 하루 최대 12편.** 소설·이슈·일상 각 3편의 기존 균등 편성은 종료한다.
- 실제 회원 글, 이미 게시된 글, 우리집 사진·동영상 자동화의 중지 상태는 변경하지 않는다. 두 경로를 혼동하지 않는다.

## 공원 카드 준비와 발행

프로젝트 `ziezbdjofcugznowiuda`, `ojjuda_note_internal.auto_card_config`, `auto_card_copy`, `auto_card_schedule`을 사용한다. 기존 config와 cron의 중지 상태를 존중한다. 본문은 1–200자, `content_source=curated_automation`, 성별은 `private`, 기존 전국 위치와 사진·꾸미기를 유지한다.

하루 슬롯 **1·4·7·10만** 사용한다. `planned_at=(local_day::timestamp+(2*slot-1)*interval '1 hour') AT TIME ZONE 'Asia/Seoul'`. 원고와 예약을 같은 트랜잭션에서 직접 준비하고 날짜별 `pg_advisory_xact_lock(284726,(local_day-date '2000-01-01')::integer)`을 잡는다. 기존 슬롯/본문을 다시 확인하고 빈 곳만 채운다. 과거 24/48편용 `stage_auto_cards`·`plan_auto_cards`로 새 일정을 만들지 않는다.

서버 cron `ojjuda_note_daily_auto_cards`: UTC `1 4,10,16,22 * * *`, 기존 `run_auto_cards()` 호출. 2026-10-12 19:01 마지막 게시 뒤 남은 2편은 10월 13일 01:01·07:01로 이동했다. 이후에도 최소 6시간을 유지하고 놓친 시간을 몰아서 게시하지 않는다.

## 우리집 노트 준비와 발행

`ojjuda_house_note_internal.config`와 `queue`를 사용한다. 전용 자동 계정으로 `public.house_posts`에 발행하며 실제 회원의 경험으로 가장하지 않는다. `body`는 빈 글만 금지하며 길이를 자르지 않는다. 짤은 `content_source=curated_humor`에 저장한다.

한국 날짜 내일·모레의 빈 슬롯 1–12를 준비한다. `planned_at=(local_day::timestamp+(2*slot-1)*interval '1 hour') AT TIME ZONE 'Asia/Seoul'`. 날짜 잠금은 `pg_advisory_xact_lock(284729,(local_day-date '2000-01-01')::integer)`. `ready_at`은 실제 준비 완료 시각이다. 이미 준비된 적합한 짤은 보존하고 같은 본문·같은 원본을 중복 준비하지 않는다.

서버 cron `ojjuda_house_notes_every_2h`: UTC `1 0-22/2 * * *`, 기존 `run_house_notes()` 호출. 준비 작업은 직접 게시하지 않는다. 실제 성공은 `posted_at`, `note_id`, `public.house_posts`를 대조한다.

## 짤 형식

첫 줄은 짧은 제목, 그 아래 장면과 맞는 농담 한두 문장. 이미지 자체가 재미있거나 공감 상황이 바로 이해되는 사진을 고른다. 표정·동물·먹거리·생활 상황을 번갈아 쓰고 같은 동물/상황만 반복하지 않는다. 확인되지 않은 실화·인기 순위·유행 주장은 쓰지 않는다.

```text
[웃긴 짤] 내 택배 맞지?
문 앞에서 소리 나면 일단 확인해야 함.

![담장 사이로 내다보는 강아지](https://thumb.wikimedia.org/wikipedia/commons/thumb/6/69/Funny_dog.jpg/960px-Funny_dog.jpg)

출처: mikapon · CC BY-SA 2.0
https://commons.wikimedia.org/wiki/File:Funny_dog.jpg
https://creativecommons.org/licenses/by-sa/2.0/
사진 원본 유지 · 문구: 오쭈다
```

`house-note-content.js`는 우리집 주인/방문자 노트 목록과 본문에서 이미지와 출처 링크를 표시한다. 현재 이미지 허용 호스트는 `upload.wikimedia.org`, `thumb.wikimedia.org`의 `/wikipedia/commons/` 경로이며 JPG/PNG/WebP/GIF, HTTPS만 허용한다. 일반 HTML은 해석하지 않는다. 이미지를 새로 지원하려면 검토 없이 호스트 범위를 넓히지 않는다.

파일 상세 페이지에서 원작자·라이선스·장면을 확인하고 정확한 원본/썸네일 주소를 얻는다. 500–960px의 읽기 쉬운 이미지를 우선하고 출처 페이지·원작자·이용 조건 링크를 본문에 남긴다. 출처 불명 재업로드나 사생활 침해·굴욕·혐오·성적 이미지는 제외한다. 가능한 도구로 실제 이미지를 확인하고 링크가 깨졌거나 검수할 수 없는 후보를 확인 완료로 기록하지 않는다. 적합한 후보가 부족하면 기존 이미지를 돌려 쓰거나 이미지 없는 글로 수를 채우지 말고 실제 준비 수를 보고한다.

## 검증

날짜별 활성 공원 예약은 4개, 우리집 노트는 최대 12개인지 확인한다. 두 cron의 간격과 활성 상태, 중복 슬롯/본문/이미지 URL, 금지어, 예약과 실제 게시를 구분해 확인한다. 새 게시물을 보충하는 정기 작업은 `ops/daily-note-content.md`와 이 문서의 최신 규칙을 따른다.
