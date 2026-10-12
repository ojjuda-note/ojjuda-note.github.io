# 자동카드 계정의 우리집 사진·영상

## 최신 변경 — 2026-10-13

사용자 요청에 따라 웃긴 짤은 **우리집 앨범**, 재미있는 짧은 동영상은 **우리집 비디오**로 올린다. 두 종류 모두 아래 `items` → `public.media` 경로를 사용하고 합쳐 최소 2시간마다 한 편만 게시한다. 노트에 이미지 링크를 넣어 대신 발행하지 않는다.

공원·짤 예약 보충 작업(`6accbea64b108191ab87403578af247b`)이 미디어까지 함께 준비한다. 기존 별도 사진·영상 보충 작업은 계속 중지해 중복 실행을 막는다. 매번 현재 설정과 중복 기록을 확인하고 앞으로 약 48시간 분량, 즉 `queued`와 `importing`을 합쳐 최대 24편을 목표로 보충한다. 사진과 짧은 영상이 번갈아 들어가도록 고르되 실제 재미와 품질을 우선한다.

기존 노트 예약을 옮길 때는 `retry_after`에 원래 `planned_at + interval '1 minute'`를 넣어 예약보다 일찍 공개하지 않는다. 같은 트랜잭션에서 원래 `curated_humor` 노트를 `cancelled_at`과 `cancel_reason`으로 보존하고 이동할 미디어를 저장한다. 미디어 자체 간격은 성공 게시 시각 기준이며 10분마다 확인하므로 실제 발행은 2시간보다 조금 늦을 수 있다. 원고 준비나 검사만으로 게시 완료라고 하지 않는다.

2026-10-09 사용자 요청: 출처를 직접 찾아 중복 없이 주기적으로 업로드한다. 기존 자동카드 계정을 사용한다. 운영 프로젝트는 `ziezbdjofcugznowiuda`, 계정은 `ojjuda_media_internal.config.author_id`에서 확인한다. 초기 사진 1개와 영상 1개가 게시되었고, 이후 최소 2시간 간격으로 하나씩 올린다. 사진/영상을 번갈아 우선 선택한다.

## 처리 경로

- 내부 `items` 큐 → `dispatch()` → `auto-house-media` Edge Function → 비공개 `media` 버킷 → `public.media` 공개범위 `all`.
- 원작자·라이선스·원본 링크는 해당 미디어의 첫 댓글에 기록한다. 앨범과 게시판에서 같은 댓글을 읽는다.
- pg_cron `ojjuda_house_media_every_2h`는 10분마다 준비 여부를 검사하되, 마지막 성공 이후 2시간이 지나기 전에는 게시하지 않는다. 누락분을 몰아서 게시하지 않는다.
- 활성화 여부와 주기는 기존 설정을 읽고 존중한다. 중지된 설정을 자동으로 켜지 않는다.
- Edge Function은 `verify_jwt=false`로 배포하지만 DB가 만든 5분 유효 일회용 토큰을 요구한다. 세 개의 작업 RPC는 service_role만 실행할 수 있다. 브라우저에 작업 권한이나 비밀키를 제공하지 않는다.

## 큐 보충

1. 설정, 큐의 상태별 개수, 기존 전체 `source_key`, `source_sha1`, `content_sha256`, `thumb_dhash`, 캡션을 읽는다. 필요한 만큼만 골라 `queued`와 `importing`을 합쳐 최대 24개 정도를 유지하고 사진·영상의 균형을 맞춘다. 이전 노트의 이미지 원본과도 비교한다. 같은 원고의 승인된 이동은 허용하지만 재게시·복제는 금지한다.
2. Wikimedia Commons에서 재미있는 동물 동작·표정, 공감 가는 생활 장면 등을 찾는다. 사람을 조롱하거나 사생활을 침해하는 콘텐츠, 출처·권리가 불분명한 커뮤니티 재업로드는 선택하지 않는다. 재미없는 자료 사진으로 수량만 채우지 않는다.
3. 파일 상세 페이지와 API에서 원작자, 재사용 조건, 원본 SHA1을 확인한다. 현재 수입 경로는 Commons 파일 호스트만 허용한다. CC0, CC BY/CC BY-SA 2.0·3.0·4.0만 지원한다.
4. 기존 기록과 대조한 다음 후보를 준비한다. Python 3, Pillow, ffmpeg/ffprobe가 필요하다. 이 스크립트는 다운로드와 검수 자료 생성만 하며 게시하지 않는다.

```sh
python scripts/prepare-house-media.py --title 'File:확인한 정확한 파일명.jpg' --caption '장면에 맞춰 직접 쓴 짧고 재미있는 한국어 문구' --out-dir /tmp/ojjuda-media-review
```

5. 실제 사진 또는 영상과 접촉표를 열어 화질·내용·캡션을 검수한다. 영상의 소리도 확인해야 하는 내용이면 함께 검수하고 확인할 수 없으면 제외한다. 같은 장면의 다른 인코딩·크롭·자막 버전, 이전과 사실상 같은 소재는 제외한다. 다운로드 바이트를 도구 본문에 붙이지 않는다.
6. 검수한 후보에만 UTC `reviewed_at`을 넣는다. 후보 JSON의 필드와 현재 테이블 컬럼을 대조해 연결된 Supabase SQL로 `ojjuda_media_internal.items`에 INSERT한다. `id,status,attempts` 등은 기본값을 사용한다. `thumb_dhash`는 64자리 이진 문자열을 `bit(64)`로 캐스팅한다. 문자열은 파라미터나 정확한 SQL 인용으로 전달한다. 원본 URL/파일 SHA1/실제 파일 SHA256은 각각 유일하며 사진 dHash 해밍거리가 4 이하인 후보도 DB에서 거부한다. 중복을 피하려고 해시를 바꾸거나 기록을 삭제하지 않는다.
7. 원본과 다운로드 SHA가 다르거나 용량이 달라지면 워커가 게시하지 않는다. 새 원본으로 재검수해야 한다. 실패 3회 뒤에는 자동 재시도하지 않는다. 실패 이유를 확인하기 전 기록을 초기화하지 않는다.
8. 큐가 채워졌는지 확인한다. 실제 게시 성공은 `items.status='published'`, `public.media`의 실제 행, 저장된 원본·썸네일, 출처 댓글을 함께 대조한다. 준비·예약·HTTP 요청만을 게시 완료라고 보고하지 않는다.

## 운영 조회

```sql
select enabled,author_id,min_interval,last_posted_at,next_kind from ojjuda_media_internal.config;
select status,kind,count(*) from ojjuda_media_internal.items group by 1,2;
select id,source_key,source_sha1,content_sha256,thumb_dhash,caption,status,error_code from ojjuda_media_internal.items order by created_at desc;
select jobname,schedule,active from cron.job where jobname='ojjuda_house_media_every_2h';
```

필요한 경우 기존 권한으로 `select ojjuda_media_internal.dispatch();`를 호출해 준비 상태를 확인할 수 있다. 이 함수도 같은 간격·동시실행 제한을 적용한다. 키·작업 토큰 원문을 조회하거나 로그에 남기지 않는다.

## 노트 콘텐츠

**노트는 우리집 → 노트 → 글쓰기의 `public.house_posts`이다. 공원의 사진 카드는 노트가 아니다.** 사진 카드는 기존 200자 제한과 꾸미기를 유지한다. `[창작 웹소설]`, `[유머]`, `[이슈]`, `[일상]` 글은 `ojjuda_house_note_internal.queue`에 준비하고 `ojjuda_house_notes_every_2h` cron이 한국 홀수 시각 1분에 우리집 노트로 발행한다. 이슈에는 확인 날짜와 출처를 넣고 창작은 창작임을 밝힌다. 노트 본문에는 애플리케이션 글자 수 제한이 없다.

2026-10-09 잘못 발행된 웹소설과 예약 원고를 본문·작성자·시각을 보존해 노트로 이동했다. 원본 카드와 이전 예약의 이력은 보관하며, 앞으로 긴 글을 `auto_card_copy`에 넣지 않는다. 준비 작업과 검증은 [AUTO-HOUSE-NOTES.md](AUTO-HOUSE-NOTES.md)를 따른다.
