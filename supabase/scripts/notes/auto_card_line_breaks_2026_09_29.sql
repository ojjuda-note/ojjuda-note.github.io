-- Owner-requested line breaks, 2026-09-29. Only scheduled automatic cards.
-- Changes word-separating spaces to LF; wording is retained exactly.
-- Exact date/slot/body/author guards and publisher locks prevent unrelated edits.
-- All metadata except the body's normal edited_at timestamp is preserved.
-- A repeated run is a no-op; original/new bodies support deliberate rollback.
DO $line_breaks$
DECLARE
  v_edits jsonb := $line_edits$[
  {
    "local_day": "2026-09-29",
    "slot": 1,
    "old_body": "집에 돌아와 신발부터 벗었어요. 정리는 조금 미루고, 일단 편하게 쉬려고요.",
    "new_body": "집에 돌아와 신발부터 벗었어요.\n정리는 조금 미루고,\n일단 편하게 쉬려고요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 2,
    "old_body": "미루던 일을 시작하기 막막하다면 파일을 열고 제목만 적어 봐요. 시작이 어려울 땐 그 정도도 괜찮아요.",
    "new_body": "미루던 일을 시작하기 막막하다면\n파일을 열고 제목만 적어 봐요.\n시작이 어려울 땐 그 정도도 괜찮아요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 3,
    "old_body": "오늘은 숨 한번 고르고 가요. 빠르지 않아도 괜찮아요.",
    "new_body": "오늘은 숨 한번 고르고 가요.\n빠르지 않아도 괜찮아요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 4,
    "old_body": "창문을 여니 시원한 바람이 들어와요. 잠깐 멍하니 있으니 기분이 좋네요.",
    "new_body": "창문을 여니 시원한 바람이 들어와요.\n잠깐 멍하니 있으니 기분이 좋네요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 5,
    "old_body": "작은 일 하나 끝냈다면 오늘의 나에게 박수 한 번!",
    "new_body": "작은 일 하나 끝냈다면\n오늘의 나에게 박수 한 번!"
  },
  {
    "local_day": "2026-09-29",
    "slot": 6,
    "old_body": "유난히 지치는 날이 있죠. 따뜻한 물 한 잔 마시며 잠깐 쉬어 가요.",
    "new_body": "유난히 지치는 날이 있죠.\n따뜻한 물 한 잔 마시며\n잠깐 쉬어 가요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 7,
    "old_body": "괜찮은 척하지 않아도 돼요. 쉬어 갈 자리는 늘 있어요.",
    "new_body": "괜찮은 척하지 않아도 돼요.\n쉬어 갈 자리는 늘 있어요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 8,
    "old_body": "어제보다 한 번 더 웃었다면, 오늘도 좋은 순간이 있었던 거예요.",
    "new_body": "어제보다 한 번 더 웃었다면,\n오늘도 좋은 순간이 있었던 거예요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 9,
    "old_body": "마음이 무거운 날에는 잠깐 쉬어 가도 괜찮아요.",
    "new_body": "마음이 무거운 날에는\n잠깐 쉬어 가도 괜찮아요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 10,
    "old_body": "할 일을 다 못 해도 해낸 일이 사라지는 건 아니에요.",
    "new_body": "할 일을 다 못 해도\n해낸 일이 사라지는 건 아니에요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 11,
    "old_body": "집에 가는 길에 노을이 예쁘면 잠깐 올려다봐요. 바쁜 하루에도 이런 순간은 남네요.",
    "new_body": "집에 가는 길에 노을이 예쁘면\n잠깐 올려다봐요.\n바쁜 하루에도 이런 순간은 남네요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 12,
    "old_body": "내일 걱정까지 오늘 다 하려니 피곤하죠. 지금 할 수 없는 일은 잠시 내려놓아요.",
    "new_body": "내일 걱정까지 오늘 다 하려니 피곤하죠.\n지금 할 수 없는 일은\n잠시 내려놓아요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 13,
    "old_body": "좋아하는 노래를 틀고 잠깐 쉬어요. 아무것도 안 하는 몇 분도 필요하니까요.",
    "new_body": "좋아하는 노래를 틀고 잠깐 쉬어요.\n아무것도 안 하는 몇 분도 필요하니까요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 14,
    "old_body": "오늘 한 실수가 자꾸 생각나도 너무 오래 자책하진 말아요. 다음에 조금 다르게 해보면 돼요.",
    "new_body": "오늘 한 실수가 자꾸 생각나도\n너무 오래 자책하진 말아요.\n다음에 조금 다르게 해보면 돼요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 15,
    "old_body": "오늘도 수고 많았어요. 못 끝낸 일은 잠시 두고, 이제 푹 쉬어요.",
    "new_body": "오늘도 수고 많았어요.\n못 끝낸 일은 잠시 두고,\n이제 푹 쉬어요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 16,
    "old_body": "기상청 발표로 설악산 첫 단풍이 확인됐대요. 가을이 왔네요.",
    "new_body": "기상청 발표로\n설악산 첫 단풍이 확인됐대요.\n가을이 왔네요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 17,
    "old_body": "점심 메뉴 회의의 결론은 또 '아무거나'였어요.",
    "new_body": "점심 메뉴 회의의 결론은\n또 '아무거나'였어요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 18,
    "old_body": "휴대폰을 찾으며 손전등을 켰어요. 그 휴대폰으로요.",
    "new_body": "휴대폰을 찾으며 손전등을 켰어요.\n그 휴대폰으로요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 19,
    "old_body": "NASA가 태어난 지 100만 년도 안 된 행성의 발견 소식을 전했어요.",
    "new_body": "NASA가\n태어난 지 100만 년도 안 된\n행성의 발견 소식을 전했어요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 20,
    "old_body": "오늘의 운동: 알람 끄러 침대 끝까지 팔 뻗기.",
    "new_body": "오늘의 운동:\n알람 끄러 침대 끝까지 팔 뻗기."
  },
  {
    "local_day": "2026-09-29",
    "slot": 21,
    "old_body": "비밀번호를 바꿨는데 벌써 기억이 안 나요. 보안이 너무 철저해졌네요.",
    "new_body": "비밀번호를 바꿨는데 벌써 기억이 안 나요.\n보안이 너무 철저해졌네요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 22,
    "old_body": "냉장고를 세 번 열었는데 간식은 그대로네요. 한 번 더 열어볼까 고민 중이에요.",
    "new_body": "냉장고를 세 번 열었는데 간식은 그대로네요.\n한 번 더 열어볼까 고민 중이에요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 23,
    "old_body": "기상청이 전한 설악산 단풍 소식에 산책길이 궁금해졌어요.",
    "new_body": "기상청이 전한 설악산 단풍 소식에\n산책길이 궁금해졌어요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 24,
    "old_body": "오늘 가장 인기 있는 자리는 충전기 옆자리 아닐까요?",
    "new_body": "오늘 가장 인기 있는 자리는\n충전기 옆자리 아닐까요?"
  },
  {
    "local_day": "2026-09-29",
    "slot": 25,
    "old_body": "세탁할 땐 두 짝이었는데 널 때는 한 짝. 양말은 대체 어디로 가는 걸까요?",
    "new_body": "세탁할 땐 두 짝이었는데\n널 때는 한 짝.\n양말은 대체 어디로 가는 걸까요?"
  },
  {
    "local_day": "2026-09-29",
    "slot": 26,
    "old_body": "퇴근하면 이것저것 하려고 했는데, 소파에 앉자마자 계획이 바뀌었어요.",
    "new_body": "퇴근하면 이것저것 하려고 했는데,\n소파에 앉자마자 계획이 바뀌었어요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 27,
    "old_body": "분명 저녁을 먹었는데 야식 사진을 보니 또 배고파요. 안 보려고 했는데 자꾸 메뉴를 넘기고 있네요.",
    "new_body": "분명 저녁을 먹었는데\n야식 사진을 보니 또 배고파요.\n안 보려고 했는데 자꾸 메뉴를 넘기고 있네요."
  },
  {
    "local_day": "2026-09-29",
    "slot": 28,
    "old_body": "영상 하나만 보고 자려 했는데 벌써 세 편째예요. 다음 편은 내일 봐야겠어요.",
    "new_body": "영상 하나만 보고 자려 했는데\n벌써 세 편째예요.\n다음 편은 내일 봐야겠어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 1,
    "old_body": "별일 없는 하루가 가끔은 제일 반가워요. 걱정할 일 없이 편히 쉴 수 있으니까요.",
    "new_body": "별일 없는 하루가 가끔은 제일 반가워요.\n걱정할 일 없이 편히 쉴 수 있으니까요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 2,
    "old_body": "할 일이 자꾸 생각나면 잊지 않게 메모해 둬요. 계속 머릿속으로 되짚지 않아도 되니까요.",
    "new_body": "할 일이 자꾸 생각나면\n잊지 않게 메모해 둬요.\n계속 머릿속으로 되짚지 않아도 되니까요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 3,
    "old_body": "도무지 시작할 힘이 안 나는 날도 있죠. 그럴 땐 제일 쉬운 일 하나부터 해봐요.",
    "new_body": "도무지 시작할 힘이 안 나는 날도 있죠.\n그럴 땐 제일 쉬운 일 하나부터 해봐요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 4,
    "old_body": "아무것도 하지 않고 쉬어도 좋아요. 쉬는 시간까지 알차게 보낼 필요는 없잖아요.",
    "new_body": "아무것도 하지 않고 쉬어도 좋아요.\n쉬는 시간까지\n알차게 보낼 필요는 없잖아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 5,
    "old_body": "오늘 할 일을 셋만 적어 봐요. 하나씩이면 돼요.",
    "new_body": "오늘 할 일을 셋만 적어 봐요.\n하나씩이면 돼요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 6,
    "old_body": "커피 한 잔 마시는 동안만큼은 할 일 생각을 잠깐 멈춰 봐요.",
    "new_body": "커피 한 잔 마시는 동안만큼은\n할 일 생각을 잠깐 멈춰 봐요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 7,
    "old_body": "먼저 건넨 인사에 누군가 웃어 주면 괜히 기분이 좋아져요.",
    "new_body": "먼저 건넨 인사에 누군가 웃어 주면\n괜히 기분이 좋아져요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 8,
    "old_body": "길가의 작은 꽃도 제 속도로 피고 있어요.",
    "new_body": "길가의 작은 꽃도\n제 속도로 피고 있어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 9,
    "old_body": "웃긴 영상을 보면 친구에게도 보내봐요. 같이 웃으면 더 재밌잖아요.",
    "new_body": "웃긴 영상을 보면 친구에게도 보내봐요.\n같이 웃으면 더 재밌잖아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 10,
    "old_body": "어려운 일은 시작부터 막막하죠. 오늘은 첫 단계만 해보는 건 어때요?",
    "new_body": "어려운 일은 시작부터 막막하죠.\n오늘은 첫 단계만 해보는 건 어때요?"
  },
  {
    "local_day": "2026-09-30",
    "slot": 11,
    "old_body": "점심 한 끼는 화면에서 눈을 떼고 천천히 먹어요.",
    "new_body": "점심 한 끼는 화면에서 눈을 떼고\n천천히 먹어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 12,
    "old_body": "졸음이 쏟아지면 하던 일을 잠시 멈추고 몸을 쭉 펴봐요. 잠깐 쉬었다 해도 괜찮아요.",
    "new_body": "졸음이 쏟아지면\n하던 일을 잠시 멈추고 몸을 쭉 펴봐요.\n잠깐 쉬었다 해도 괜찮아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 13,
    "old_body": "생각이 너무 많을 땐 잠깐 하늘을 올려다봐요. 답을 찾으려 애쓰지 않아도 돼요.",
    "new_body": "생각이 너무 많을 땐\n잠깐 하늘을 올려다봐요.\n답을 찾으려 애쓰지 않아도 돼요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 14,
    "old_body": "오늘 잘한 일을 하나만 떠올려 봐요. 분명 있어요.",
    "new_body": "오늘 잘한 일을 하나만 떠올려 봐요.\n분명 있어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 15,
    "old_body": "답장이 늦으면 괜히 신경 쓰이죠. 바쁜가 보다 하고 내 할 일을 해보려고요.",
    "new_body": "답장이 늦으면 괜히 신경 쓰이죠.\n바쁜가 보다 하고 내 할 일을 해보려고요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 16,
    "old_body": "남들 속도에 맞추려다 너무 지치진 않았나요? 조금 천천히 가도 돼요.",
    "new_body": "남들 속도에 맞추려다\n너무 지치진 않았나요?\n조금 천천히 가도 돼요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 17,
    "old_body": "머리가 좀 헝클어져도 어때요. 바람 쐬고 기분이 나아졌으면 됐죠.",
    "new_body": "머리가 좀 헝클어져도 어때요.\n바람 쐬고 기분이 나아졌으면 됐죠."
  },
  {
    "local_day": "2026-09-30",
    "slot": 18,
    "old_body": "집에 가면 제일 먼저 뭘 하고 싶나요? 오늘은 좋아하는 일 하나만 해봐요.",
    "new_body": "집에 가면 제일 먼저 뭘 하고 싶나요?\n오늘은 좋아하는 일 하나만 해봐요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 19,
    "old_body": "저녁 하늘이 예쁜 날엔 사진 한 장 남겨봐요. 나중에 꺼내 보면 그날 기분도 떠오르잖아요.",
    "new_body": "저녁 하늘이 예쁜 날엔\n사진 한 장 남겨봐요.\n나중에 꺼내 보면 그날 기분도 떠오르잖아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 20,
    "old_body": "생각이 복잡할 땐 컵 하나만 씻어봐요. 작은 일을 끝내고 나면 조금 개운해질 때도 있어요.",
    "new_body": "생각이 복잡할 땐 컵 하나만 씻어봐요.\n작은 일을 끝내고 나면\n조금 개운해질 때도 있어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 21,
    "old_body": "오늘 있었던 일 중에 좋았던 장면 하나만 떠올려봐요. 아주 사소한 일이어도 좋아요.",
    "new_body": "오늘 있었던 일 중에\n좋았던 장면 하나만 떠올려봐요.\n아주 사소한 일이어도 좋아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 22,
    "old_body": "이제 알림은 잠시 꺼두고 쉬어요. 오늘은 이만하면 됐어요.",
    "new_body": "이제 알림은 잠시 꺼두고 쉬어요.\n오늘은 이만하면 됐어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 23,
    "old_body": "내일 할 일도 많겠지만, 오늘 쉴 시간까지 미루진 말아요.",
    "new_body": "내일 할 일도 많겠지만,\n오늘 쉴 시간까지 미루진 말아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 24,
    "old_body": "오늘도 여기까지 왔어요. 이제 편히 쉬어도 돼요.",
    "new_body": "오늘도 여기까지 왔어요.\n이제 편히 쉬어도 돼요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 25,
    "old_body": "밤에 몰래 간식을 꺼내는데 봉지 소리만 유난히 크네요. 조용히 먹기가 더 어렵겠어요.",
    "new_body": "밤에 몰래 간식을 꺼내는데\n봉지 소리만 유난히 크네요.\n조용히 먹기가 더 어렵겠어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 26,
    "old_body": "자기 전에 좋은 생각이 나서 적어뒀는데, 다시 보니 무슨 말인지 모르겠어요.",
    "new_body": "자기 전에 좋은 생각이 나서 적어뒀는데,\n다시 보니 무슨 말인지 모르겠어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 27,
    "old_body": "알람 다섯 개보다 강한 건 이불의 설득력이에요.",
    "new_body": "알람 다섯 개보다 강한 건\n이불의 설득력이에요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 28,
    "old_body": "잠깐 쉬려고 누웠는데 이불까지 덮었어요. 아무래도 오래 쉴 것 같아요.",
    "new_body": "잠깐 쉬려고 누웠는데 이불까지 덮었어요.\n아무래도 오래 쉴 것 같아요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 29,
    "old_body": "토스트를 너무 구웠네요. 바삭함만큼은 자신 있어요.",
    "new_body": "토스트를 너무 구웠네요.\n바삭함만큼은 자신 있어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 30,
    "old_body": "분명 이번 달 시작한 지 얼마 안 된 것 같은데, 벌써 월말이네요.",
    "new_body": "분명 이번 달 시작한 지 얼마 안 된 것 같은데,\n벌써 월말이네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 31,
    "old_body": "NASA가 소개한 어린 행성은 아직 먼지와 가스에 둘러싸여 있대요. 행성이 만들어지는 과정이 궁금해지네요.",
    "new_body": "NASA가 소개한 어린 행성은\n아직 먼지와 가스에 둘러싸여 있대요.\n행성이 만들어지는 과정이 궁금해지네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 32,
    "old_body": "무선 이어폰으로 바꿨는데 충전선은 또 엉켰어요. 선 정리는 끝이 없네요.",
    "new_body": "무선 이어폰으로 바꿨는데 충전선은 또 엉켰어요.\n선 정리는 끝이 없네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 33,
    "old_body": "검색창에 '뭐 먹지'를 치고 또 고민하는 중이에요.",
    "new_body": "검색창에 '뭐 먹지'를 치고\n또 고민하는 중이에요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 34,
    "old_body": "기상청은 28일 설악산 첫 단풍을 알렸어요. 가을 구경 갈까요?",
    "new_body": "기상청은 28일\n설악산 첫 단풍을 알렸어요.\n가을 구경 갈까요?"
  },
  {
    "local_day": "2026-09-30",
    "slot": 35,
    "old_body": "회의가 짧게 끝나면 그날의 행운을 다 쓴 기분이에요.",
    "new_body": "회의가 짧게 끝나면\n그날의 행운을 다 쓴 기분이에요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 36,
    "old_body": "점심시간만 되면 시계가 빨리 가는 것 같아요. 밥 먹고 왔는데 벌써 끝이네요.",
    "new_body": "점심시간만 되면\n시계가 빨리 가는 것 같아요.\n밥 먹고 왔는데 벌써 끝이네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 37,
    "old_body": "커피 한 잔씩 샀을 뿐인데 카드값을 보니 제법 쌓였네요.",
    "new_body": "커피 한 잔씩 샀을 뿐인데\n카드값을 보니 제법 쌓였네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 38,
    "old_body": "책상 정리하다 작년에 쓴 계획표를 찾았어요. 올해 목표랑 똑같아서 다시 쓰려고요.",
    "new_body": "책상 정리하다 작년에 쓴 계획표를 찾았어요.\n올해 목표랑 똑같아서\n다시 쓰려고요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 39,
    "old_body": "간식은 하나만 먹기로 했는데 봉지가 비었어요. 하나는 한 봉지였나 봐요.",
    "new_body": "간식은 하나만 먹기로 했는데\n봉지가 비었어요.\n하나는 한 봉지였나 봐요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 40,
    "old_body": "비밀번호 힌트가 '나만 아는 것'이라니, 지금의 저는 몰라요.",
    "new_body": "비밀번호 힌트가 '나만 아는 것'이라니,\n지금의 저는 몰라요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 41,
    "old_body": "산책 중 본 고양이는 저보다 여유로운 오후를 보내더군요.",
    "new_body": "산책 중 본 고양이는\n저보다 여유로운 오후를 보내더군요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 42,
    "old_body": "장바구니에 담아 놓고 배송을 기다렸어요. 결제는 아직 안 했는데 말이죠.",
    "new_body": "장바구니에 담아 놓고 배송을 기다렸어요.\n결제는 아직 안 했는데 말이죠."
  },
  {
    "local_day": "2026-09-30",
    "slot": 43,
    "old_body": "집에 오는 길엔 발걸음도 자동으로 빨라져요.",
    "new_body": "집에 오는 길엔\n발걸음도 자동으로 빨라져요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 44,
    "old_body": "오늘도 리모컨은 소파 틈에서 숨바꼭질 중입니다.",
    "new_body": "오늘도 리모컨은\n소파 틈에서 숨바꼭질 중입니다."
  },
  {
    "local_day": "2026-09-30",
    "slot": 45,
    "old_body": "영화 한 편 고르다 영화 볼 시간이 지나갔어요.",
    "new_body": "영화 한 편 고르다\n영화 볼 시간이 지나갔어요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 46,
    "old_body": "NASA가 소개한 별똥별 사진을 보니 괜히 소원을 빌고 싶어져요. 사진에도 통하면 좋겠네요.",
    "new_body": "NASA가 소개한 별똥별 사진을 보니\n괜히 소원을 빌고 싶어져요.\n사진에도 통하면 좋겠네요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 47,
    "old_body": "내일 입을 옷을 미리 골랐어요. 아침에도 같은 생각이길 바라요.",
    "new_body": "내일 입을 옷을 미리 골랐어요.\n아침에도 같은 생각이길 바라요."
  },
  {
    "local_day": "2026-09-30",
    "slot": 48,
    "old_body": "잠들기 전 휴대폰을 내려놓는 일, 오늘의 최종 보스예요.",
    "new_body": "잠들기 전 휴대폰을 내려놓는 일,\n오늘의 최종 보스예요."
  }
]$line_edits$::jsonb;
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
    -- This request changes spaces to LF only; wording must remain identical.
    IF replace(v_edit.new_body,chr(10),' ') IS DISTINCT FROM v_edit.old_body
      OR position(chr(10) IN v_edit.new_body)=0
      OR position(chr(13) IN v_edit.new_body)>0
      OR EXISTS (SELECT 1 FROM unnest(string_to_array(v_edit.new_body,chr(10))) AS line(body)
        WHERE line.body='' OR line.body<>btrim(line.body)) THEN
      RAISE EXCEPTION 'Only natural line breaks allowed at %/%',v_edit.local_day,v_edit.slot;
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
$line_breaks$;
