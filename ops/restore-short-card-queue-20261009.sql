-- Refill only the upcoming Park slots vacated by the move to Our-house Notes.
-- Completed cards and the moved long-form writing are never overwritten.
BEGIN;
DO $restore$
DECLARE item record; copy_id bigint; place_id bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ojjuda_note_internal.auto_card_config WHERE singleton AND enabled)
  THEN RAISE EXCEPTION 'Auto cards are paused'; END IF;
  FOR item IN SELECT * FROM (VALUES
    (date '2026-10-09',8,'빨래를 개려고 앉았는데 수건 한 장이 무릎 담요가 됐다.\n집안일은 왜 자꾸 휴식으로 빠지는 길이 생길까.'),
    (date '2026-10-09',9,'분명 간식 하나만 사러 나갔다.\n봉투는 두 개인데 정작 사려던 과자는 안 보인다. 기억력도 장바구니에 담고 싶다.'),
    (date '2026-10-09',10,'휴일 저녁만 되면 시간에 바퀴가 달리는 것 같다.\n아침에는 그렇게 천천히 가더니, 지금은 잡을 틈도 없네.'),
    (date '2026-10-09',11,'휴대폰 사진을 정리하다가 옛날 사진만 한참 봤다.\n지운 건 다섯 장인데 한 시간은 어디로 사라진 걸까.'),
    (date '2026-10-09',12,'일찍 자려고 불을 껐더니 갑자기 내일 할 일이 생각난다.\n낮에는 조용하던 머리가 꼭 이 시간에 회의를 연다.'),
    (date '2026-10-10',1,'이불 밖에 충전기가 있는데 손이 닿을 듯 말 듯하다.\n배터리 7퍼센트와 귀찮음이 아주 팽팽하게 싸우는 중.'),
    (date '2026-10-10',2,'새벽에 들리는 냉장고 소리는 유난히 또렷하다.\n너도 오늘 할 말이 많았구나. 나는 내일 좀 들어주면 안 될까.'),
    (date '2026-10-10',3,'주말에 늦잠 자려고 했는데 눈이 먼저 떠졌다.\n평일 알람에는 꿈쩍도 않던 눈이 왜 쉬는 날만 성실한지.'),
    (date '2026-10-10',4,'아침에 창문을 열고 상쾌하게 시작하려 했다.\n먼저 보인 건 먼지 쌓인 창틀. 오늘의 할 일이 하나 늘었다.'),
    (date '2026-10-10',5,'토요일 아침에는 뭘 해도 될 것 같은데 그래서 아무것도 못 고르겠다.\n일단 아침부터 먹으면서 다시 고민해야지.'),
    (date '2026-10-10',6,'정리함을 사면 방이 정리될 줄 알았다.\n이제 방 한쪽에 정리함을 정리할 공간부터 만들어야 한다.'),
    (date '2026-10-10',7,'점심 메뉴를 한참 골랐는데 옆 테이블 음식이 더 맛있어 보인다.\n메뉴판 볼 때는 없던 선택지가 왜 이제 나타날까.'),
    (date '2026-10-10',8,'잠깐 소파에 누웠을 뿐인데 쿠션이 너무 정확하게 편하다.\n아까 세운 외출 계획이 조용히 실내 일정으로 바뀌고 있다.'),
    (date '2026-10-10',9,'냉장고에 먹을 건 많은데 지금 먹고 싶은 건 하나도 없다.\n문을 닫았다 열면 새로운 메뉴가 생겼으면 좋겠다.'),
    (date '2026-10-10',10,'설거지를 끝내고 돌아섰는데 책상에서 컵이 하나 더 나왔다.\n마지막인 줄 알았는데 꼭 추가 문제가 붙는다.'),
    (date '2026-10-10',11,'보고 싶던 영화를 골라 놓고 예고편만 세 개째 보고 있다.\n영화 한 편 시작하는 데 준비 시간이 이렇게 길 줄이야.'),
    (date '2026-10-10',12,'오늘 한 일을 적으려니 별로 없어 보인다.\n그래도 미뤘던 화분 물은 줬다. 화분만큼은 내 토요일을 인정해 주겠지.')
  ) AS writing(local_day,slot,body) ORDER BY local_day,slot
  LOOP
    PERFORM pg_advisory_xact_lock(284726,(item.local_day-date '2000-01-01')::integer);
    IF (item.local_day::timestamp+(2*item.slot-1)*interval '1 hour') AT TIME ZONE 'Asia/Seoul'
      <=statement_timestamp() THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM ojjuda_note_internal.auto_card_schedule q
      WHERE q.local_day=item.local_day AND q.slot=item.slot) THEN CONTINUE; END IF;
    item.body:=replace(item.body,E'\\n',E'\n');
    IF NOT ojjuda_note_internal.valid_note_body(item.body) OR public.has_banned(item.body)
      OR EXISTS(SELECT 1 FROM ojjuda_note_internal.auto_card_copy c WHERE c.body=item.body)
    THEN RAISE EXCEPTION 'Short card validation failed for %, %',item.local_day,item.slot; END IF;
    SELECT id INTO STRICT place_id FROM ojjuda_note_internal.auto_card_sites ORDER BY random() LIMIT 1;
    INSERT INTO ojjuda_note_internal.auto_card_copy(body,local_day,slot,ready_at,content_source)
      VALUES(item.body,item.local_day,item.slot,statement_timestamp(),'curated_automation') RETURNING id INTO copy_id;
    INSERT INTO ojjuda_note_internal.auto_card_schedule(local_day,slot,planned_at,copy_id,site_id,gender)
      VALUES(item.local_day,item.slot,(item.local_day::timestamp+(2*item.slot-1)*interval '1 hour') AT TIME ZONE 'Asia/Seoul',copy_id,place_id,'private');
  END LOOP;
END;
$restore$;
COMMIT;
