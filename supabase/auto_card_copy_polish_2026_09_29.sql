-- Owner-requested copy edit, 2026-09-29. Only registered automatic cards.
-- Original/new bodies are retained below for review and deliberate rollback.
-- A different body, author, archived state or missing slot aborts every edit.
-- Re-running after success is a no-op; schedules and entitlements are unchanged.
-- Verified factual wording:
-- https://science.nasa.gov/universe/newfound-baby-planet-smashes-record-for-youngest-known-world/ (2026-09-16)
-- https://apod.nasa.gov/apod/ap260926.html (2026-09-26)
DO $copy_polish$
DECLARE
  v_edits jsonb := $copy_edits$[
  {
    "local_day": "2026-09-29",
    "slot": 1,
    "old_body": "현관에 벗어 둔 신발 한 짝이 옆으로 누운 저녁이 있다. 하루를 정리할 힘이 남지 않은 모양이다. 신발은 내일 바로 세워도 된다. 지금은 불을 켜고 물 한 잔 마실 수 있는 곳까지 돌아왔다는 사실만 남겨 두자.",
    "new_body": "집에 돌아와 신발부터 벗었어요. 정리는 조금 미루고, 일단 편하게 쉬려고요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 2,
    "old_body": "할 일 목록에 한참 남아 있던 항목을 펼치면 제목을 적을 빈칸이 먼저 나온다. 파일 이름을 붙이고 저장하는 데는 겨우 몇 초. 막막하던 일이 그 몇 초 뒤에는 이름이 있는 일이 된다. 아직 끝나지 않았어도 손댈 자리는 생긴 셈이다.",
    "new_body": "미루던 일을 시작하기 막막하다면 파일을 열고 제목만 적어 봐요. 시작이 어려울 땐 그 정도도 괜찮아요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 4,
    "old_body": "창문을 열었더니 바람이 먼저 인사했어요. 꽤 다정한 아침이네요.",
    "new_body": "창문을 여니 시원한 바람이 들어와요. 잠깐 멍하니 있으니 기분이 좋네요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 6,
    "old_body": "지친 날엔 따뜻한 물 한 잔도 좋은 계획이에요.",
    "new_body": "유난히 지치는 날이 있죠. 따뜻한 물 한 잔 마시며 잠깐 쉬어 가요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 8,
    "old_body": "어제보다 조금 웃었다면 그걸로 충분한 진전이에요.",
    "new_body": "어제보다 한 번 더 웃었다면, 오늘도 좋은 순간이 있었던 거예요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 11,
    "old_body": "퇴근길 노을이 예쁘면 잠깐 멈춰 봐요. 무료 선물이에요.",
    "new_body": "집에 가는 길에 노을이 예쁘면 잠깐 올려다봐요. 바쁜 하루에도 이런 순간은 남네요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 12,
    "old_body": "내일의 걱정은 내일의 나와 나눠 들어요.",
    "new_body": "내일 걱정까지 오늘 다 하려니 피곤하죠. 지금 할 수 없는 일은 잠시 내려놓아요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 13,
    "old_body": "좋아하는 노래 한 곡이면 마음의 속도가 조금 느려져요.",
    "new_body": "좋아하는 노래를 틀고 잠깐 쉬어요. 아무것도 안 하는 몇 분도 필요하니까요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 14,
    "old_body": "오늘의 실수는 오늘에 두고 와요. 내일은 새 종이예요.",
    "new_body": "오늘 한 실수가 자꾸 생각나도 너무 오래 자책하진 말아요. 다음에 조금 다르게 해보면 돼요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 15,
    "old_body": "늦은 밤에도 수고했어요. 이제 몸과 마음을 쉬게 해요.",
    "new_body": "오늘도 수고 많았어요. 못 끝낸 일은 잠시 두고, 이제 푹 쉬어요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 19,
    "old_body": "나사 발표: 아주 어린 행성이 발견됐대요. 우주도 새 얼굴이 있네요.",
    "new_body": "NASA가 태어난 지 100만 년도 안 된 행성의 발견 소식을 전했어요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 21,
    "old_body": "비밀번호를 바꿨더니 제 기억력부터 로그아웃했어요.",
    "new_body": "비밀번호를 바꿨는데 벌써 기억이 안 나요. 보안이 너무 철저해졌네요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 22,
    "old_body": "냉장고를 세 번 열어도 새 간식은 안 생기네요. 신기해요.",
    "new_body": "냉장고를 세 번 열었는데 간식은 그대로네요. 한 번 더 열어볼까 고민 중이에요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 25,
    "old_body": "양말 세탁기의 비밀 통로는 아직 발견되지 않았어요.",
    "new_body": "세탁할 땐 두 짝이었는데 널 때는 한 짝. 양말은 대체 어디로 가는 걸까요?"
  },
  {
    "local_day": "2026-09-29",
    "slot": 26,
    "old_body": "퇴근 후의 계획은 많았는데 소파가 먼저 예약했네요.",
    "new_body": "퇴근하면 이것저것 하려고 했는데, 소파에 앉자마자 계획이 바뀌었어요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 27,
    "old_body": "야식 앞에서는 시계도 살짝 눈을 감는 것 같아요.",
    "new_body": "분명 저녁을 먹었는데 야식 사진을 보니 또 배고파요. 안 보려고 했는데 자꾸 메뉴를 넘기고 있네요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 28,
    "old_body": "잠들기 전 한 편만 보려던 영상, 다음 편이 손을 흔드네요.",
    "new_body": "영상 하나만 보고 자려 했는데 벌써 세 편째예요. 다음 편은 내일 봐야겠어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 1,
    "old_body": "새벽 공기가 차가워도, 하루는 천천히 따뜻해져요.",
    "new_body": "별일 없는 하루가 가끔은 제일 반가워요. 걱정할 일 없이 편히 쉴 수 있으니까요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 2,
    "old_body": "눈 뜨자마자 바쁘다면 물 한 모금부터 챙겨요.",
    "new_body": "할 일이 자꾸 생각나면 잊지 않게 메모해 둬요. 계속 머릿속으로 되짚지 않아도 되니까요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 3,
    "old_body": "이불 밖 첫걸음도 오늘의 작은 용기예요.",
    "new_body": "도무지 시작할 힘이 안 나는 날도 있죠. 그럴 땐 제일 쉬운 일 하나부터 해봐요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 4,
    "old_body": "아침 햇살이 책상 끝에 앉았네요. 좋은 시작이에요.",
    "new_body": "아무것도 하지 않고 쉬어도 좋아요. 쉬는 시간까지 알차게 보낼 필요는 없잖아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 6,
    "old_body": "커피가 식기 전에 마음도 잠깐 쉬어 가요.",
    "new_body": "커피 한 잔 마시는 동안만큼은 할 일 생각을 잠깐 멈춰 봐요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 7,
    "old_body": "반가운 인사 하나가 평범한 길을 바꿔 놓기도 해요.",
    "new_body": "먼저 건넨 인사에 누군가 웃어 주면 괜히 기분이 좋아져요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 9,
    "old_body": "웃을 일이 없다면 웃긴 양말부터 찾아볼까요?",
    "new_body": "웃긴 영상을 보면 친구에게도 보내봐요. 같이 웃으면 더 재밌잖아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 10,
    "old_body": "어려운 일 앞에서는 시작만 해도 절반의 용기예요.",
    "new_body": "어려운 일은 시작부터 막막하죠. 오늘은 첫 단계만 해보는 건 어때요?"
  },
  {
    "local_day": "2026-09-30",
    "slot": 12,
    "old_body": "오후의 졸음은 열심히 살았다는 알림일지도 몰라요.",
    "new_body": "졸음이 쏟아지면 하던 일을 잠시 멈추고 몸을 쭉 펴봐요. 잠깐 쉬었다 해도 괜찮아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 13,
    "old_body": "잠깐 하늘을 보면 생각에도 빈칸이 생겨요.",
    "new_body": "생각이 너무 많을 땐 잠깐 하늘을 올려다봐요. 답을 찾으려 애쓰지 않아도 돼요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 15,
    "old_body": "답장이 늦어도 마음까지 늦은 건 아닐 거예요.",
    "new_body": "답장이 늦으면 괜히 신경 쓰이죠. 바쁜가 보다 하고 내 할 일을 해보려고요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 16,
    "old_body": "서두르지 않아도 괜찮아요. 당신의 걸음에도 리듬이 있어요.",
    "new_body": "남들 속도에 맞추려다 너무 지치진 않았나요? 조금 천천히 가도 돼요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 17,
    "old_body": "바람 부는 길에서는 머리카락도 산책을 나가요.",
    "new_body": "머리가 좀 헝클어져도 어때요. 바람 쐬고 기분이 나아졌으면 됐죠."
  },
  {
    "local_day": "2026-09-30",
    "slot": 18,
    "old_body": "집으로 가는 발걸음엔 수고했다는 말을 실어 주세요.",
    "new_body": "집에 가면 제일 먼저 뭘 하고 싶나요? 오늘은 좋아하는 일 하나만 해봐요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 19,
    "old_body": "저녁 하늘의 색은 매일 다른 선물 같아요.",
    "new_body": "저녁 하늘이 예쁜 날엔 사진 한 장 남겨봐요. 나중에 꺼내 보면 그날 기분도 떠오르잖아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 20,
    "old_body": "마음이 복잡하면 설거지 하나만 해봐요. 물소리가 도와줘요.",
    "new_body": "생각이 복잡할 땐 컵 하나만 씻어봐요. 작은 일을 끝내고 나면 조금 개운해질 때도 있어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 21,
    "old_body": "오늘의 끝에서 아쉬움보다 고마운 장면을 골라 봐요.",
    "new_body": "오늘 있었던 일 중에 좋았던 장면 하나만 떠올려봐요. 아주 사소한 일이어도 좋아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 22,
    "old_body": "불을 하나 끄면 마음의 소음도 조금 작아져요.",
    "new_body": "이제 알림은 잠시 꺼두고 쉬어요. 오늘은 이만하면 됐어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 23,
    "old_body": "내일의 나는 오늘의 휴식 덕분에 더 가벼울 거예요.",
    "new_body": "내일 할 일도 많겠지만, 오늘 쉴 시간까지 미루진 말아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 25,
    "old_body": "밤마다 냉장고 불은 제가 올 때만 켜지네요. 인기 많은 줄 알았어요.",
    "new_body": "밤에 몰래 간식을 꺼내는데 봉지 소리만 유난히 크네요. 조용히 먹기가 더 어렵겠어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 26,
    "old_body": "새벽에 떠오른 천재적인 생각, 아침엔 글씨를 못 알아봤어요.",
    "new_body": "자기 전에 좋은 생각이 나서 적어뒀는데, 다시 보니 무슨 말인지 모르겠어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 28,
    "old_body": "양치하는 동안 거울 속 제가 제일 먼저 출근했네요.",
    "new_body": "잠깐 쉬려고 누웠는데 이불까지 덮었어요. 아무래도 오래 쉴 것 같아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 29,
    "old_body": "토스트 한쪽만 진하게 익었어요. 개성으로 받아들일게요.",
    "new_body": "토스트를 너무 구웠네요. 바삭함만큼은 자신 있어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 30,
    "old_body": "달력이 한 장 남을 때마다 시간이 달리기를 잘하네요.",
    "new_body": "분명 이번 달 시작한 지 얼마 안 된 것 같은데, 벌써 월말이네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 31,
    "old_body": "나사에 따르면 아주 어린 행성이 확인됐대요. 우주에도 아기가 있네요.",
    "new_body": "NASA가 소개한 어린 행성은 아직 먼지와 가스에 둘러싸여 있대요. 행성이 만들어지는 과정이 궁금해지네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 32,
    "old_body": "이어폰 줄은 없앴는데, 충전선은 여전히 매듭 장인입니다.",
    "new_body": "무선 이어폰으로 바꿨는데 충전선은 또 엉켰어요. 선 정리는 끝이 없네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 36,
    "old_body": "점심시간은 왜 늘 세 배 빠른 시계로 움직일까요?",
    "new_body": "점심시간만 되면 시계가 빨리 가는 것 같아요. 밥 먹고 왔는데 벌써 끝이네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 37,
    "old_body": "영수증은 작아도 지갑 속에서 존재감이 크네요.",
    "new_body": "커피 한 잔씩 샀을 뿐인데 카드값을 보니 제법 쌓였네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 38,
    "old_body": "책상 정리하다가 잃어버린 펜과 작년의 결심을 찾았어요.",
    "new_body": "책상 정리하다 작년에 쓴 계획표를 찾았어요. 올해 목표랑 똑같아서 다시 쓰려고요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 39,
    "old_body": "간식 상자를 닫았는데 손이 열쇠를 알고 있네요.",
    "new_body": "간식은 하나만 먹기로 했는데 봉지가 비었어요. 하나는 한 봉지였나 봐요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 42,
    "old_body": "장바구니에 담아 둔 물건은 마음속에서 이미 배송됐어요.",
    "new_body": "장바구니에 담아 놓고 배송을 기다렸어요. 결제는 아직 안 했는데 말이죠."
  },
  {
    "local_day": "2026-09-30",
    "slot": 46,
    "old_body": "나사 사진 속 별똥별은 한 장면인데, 제 소원은 열 개예요.",
    "new_body": "NASA가 소개한 별똥별 사진을 보니 괜히 소원을 빌고 싶어져요. 사진에도 통하면 좋겠네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 47,
    "old_body": "내일 입을 옷을 골랐는데 내일의 제가 다시 고를 거래요.",
    "new_body": "내일 입을 옷을 미리 골랐어요. 아침에도 같은 생각이길 바라요."
  }
]$copy_edits$::jsonb;
  v_day date;
  v_author uuid;
  v_old_claim text;
  v_edit record;
  v_copy_id bigint;
  v_body text;
  v_card_id uuid;
  v_protected jsonb;
  v_after jsonb;
  v_count integer;
  v_prepared integer := 0;
  v_posted integer := 0;
BEGIN
  -- Use the dedicated bot context, as the existing trusted publisher does.
  -- The normal prohibited-word/edit triggers remain enabled and still run.
  SELECT cfg.author_id INTO v_author FROM ojjuda_note_internal.auto_card_config cfg
    JOIN auth.users u ON u.id=cfg.author_id AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true'
    JOIN public.profiles p ON p.id=cfg.author_id
    JOIN public.user_private up ON up.user_id=cfg.author_id
    WHERE cfg.singleton;
  IF v_author IS NULL THEN RAISE EXCEPTION 'Registered automatic-card author required'; END IF;
  v_old_claim := current_setting('request.jwt.claim.sub',true);
  PERFORM set_config('request.jwt.claim.sub',v_author::text,true);
  -- Same date locks as run_auto_cards: a due card cannot publish mid-edit.
  FOR v_day IN SELECT DISTINCT (e->>'local_day')::date
    FROM jsonb_array_elements(v_edits) e ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(284726,(v_day-date '2000-01-01')::integer);
  END LOOP;
  FOR v_edit IN SELECT * FROM jsonb_to_recordset(v_edits)
    AS e(local_day date,slot integer,old_body text,new_body text)
    ORDER BY local_day,slot
  LOOP
    IF v_edit.new_body IS NULL OR v_edit.new_body<>btrim(v_edit.new_body)
      OR NOT ojjuda_note_internal.valid_note_body(v_edit.new_body)
      OR public.has_banned(v_edit.new_body)
      OR char_length(v_edit.new_body) NOT BETWEEN 20 AND 80 THEN
      RAISE EXCEPTION 'Invalid copy for %/%',v_edit.local_day,v_edit.slot;
    END IF;
    SELECT id,body INTO v_copy_id,v_body
      FROM ojjuda_note_internal.auto_card_copy
      WHERE local_day=v_edit.local_day AND slot=v_edit.slot FOR UPDATE;
    IF NOT FOUND OR v_body NOT IN (v_edit.old_body,v_edit.new_body) THEN
      RAISE EXCEPTION 'Copy changed or missing at %/%',v_edit.local_day,v_edit.slot;
    END IF;
    SELECT card_id INTO v_card_id FROM ojjuda_note_internal.auto_card_schedule
      WHERE local_day=v_edit.local_day AND slot=v_edit.slot AND copy_id=v_copy_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Schedule changed at %/%',v_edit.local_day,v_edit.slot; END IF;
    IF v_card_id IS NOT NULL THEN
      SELECT c.body INTO v_body FROM ojjuda_note.cards c
        JOIN ojjuda_note_internal.auto_card_config cfg ON cfg.singleton AND cfg.author_id=c.author_id
        JOIN auth.users u ON u.id=c.author_id AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true'
        WHERE c.id=v_card_id AND c.kind='memo' AND c.parent_id IS NULL AND c.archived_at IS NULL
        FOR UPDATE OF c;
      IF NOT FOUND OR v_body NOT IN (v_edit.old_body,v_edit.new_body) THEN
        RAISE EXCEPTION 'Published card changed or not an active automatic card at %/%',v_edit.local_day,v_edit.slot;
      END IF;
    END IF;
    SELECT jsonb_build_object('copy',to_jsonb(t)-'body','schedule',to_jsonb(q),
        'card',to_jsonb(c)-'body'-'edited_at','visual',to_jsonb(v),'gender',to_jsonb(g))
      INTO v_protected FROM ojjuda_note_internal.auto_card_copy t
      JOIN ojjuda_note_internal.auto_card_schedule q ON q.copy_id=t.id
      LEFT JOIN ojjuda_note.cards c ON c.id=q.card_id
      LEFT JOIN ojjuda_note_internal.card_visuals v ON v.card_id=c.id
      LEFT JOIN ojjuda_note_internal.card_gender g ON g.card_id=c.id
      WHERE t.id=v_copy_id;
    IF v_card_id IS NOT NULL THEN
      UPDATE ojjuda_note.cards SET body=v_edit.new_body
        WHERE id=v_card_id AND body=v_edit.old_body;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_posted := v_posted+v_count;
    END IF;
    UPDATE ojjuda_note_internal.auto_card_copy SET body=v_edit.new_body
      WHERE id=v_copy_id AND body=v_edit.old_body;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_prepared := v_prepared+v_count;
    SELECT jsonb_build_object('copy',to_jsonb(t)-'body','schedule',to_jsonb(q),
        'card',to_jsonb(c)-'body'-'edited_at','visual',to_jsonb(v),'gender',to_jsonb(g))
      INTO v_after FROM ojjuda_note_internal.auto_card_copy t
      JOIN ojjuda_note_internal.auto_card_schedule q ON q.copy_id=t.id
      LEFT JOIN ojjuda_note.cards c ON c.id=q.card_id
      LEFT JOIN ojjuda_note_internal.card_visuals v ON v.card_id=c.id
      LEFT JOIN ojjuda_note_internal.card_gender g ON g.card_id=c.id
      WHERE t.id=v_copy_id;
    IF v_after IS DISTINCT FROM v_protected THEN
      RAISE EXCEPTION 'Protected card metadata changed at %/%',v_edit.local_day,v_edit.slot;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_old_claim,''),true);
  RAISE NOTICE 'Revised % prepared texts and % public automatic cards',v_prepared,v_posted;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_old_claim,''),true);
  RAISE;
END;
$copy_polish$;
