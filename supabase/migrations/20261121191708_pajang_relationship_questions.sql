-- Pajang: 72 open questions about attraction and relationships.
-- Source: features/pajang/content/relationship-*.json, reviewed with 216 samples.
-- Regenerate with node scripts/build-pajang-relationship-questions.mjs.
-- Preserve published windows, original catalogs, saved prompts and answers.
begin;
set local lock_timeout = '5s';
lock table pajang_private.answers in share row exclusive mode;

create table if not exists pajang_private.relationship_question_catalog (
  id integer primary key check (id between 50001 and 50072),
  ordinal integer not null unique check (ordinal between 1 and 72),
  category text not null check (category in ('attraction','communication','dates','affection','values','conflict')),
  prompt text not null unique check (length(trim(prompt)) > 0),
  samples text[] not null check (
    array_ndims(samples) = 1 and cardinality(samples) = 3
    and array_position(samples,null) is null and array_position(samples,'') is null
  )
);
alter table pajang_private.relationship_question_catalog enable row level security;
revoke all on table pajang_private.relationship_question_catalog from public,anon,authenticated;

-- Identical retries are safe; a concurrent edit is never silently overwritten.
do $seed$
declare
  reviewed constant jsonb := $catalog$[
  {
    "id": 50001,
    "category": "attraction",
    "prompt": "이성에 대한 첫인상이 좋아졌던 순간은 언제였나요?",
    "samples": [
      "조용해 보이던 사람이 좋아하는 일을 신나게 이야기할 때요.",
      "무뚝뚝해 보였는데 제 농담에 크게 웃어 줬을 때요.",
      "처음엔 낯설었는데 함께 걸으니 대화가 편하게 이어졌을 때요."
    ],
    "ordinal": 1
  },
  {
    "id": 50025,
    "category": "communication",
    "prompt": "연인에게 하루 이야기를 들려줄 때, 무엇부터 꺼내는 편인가요?",
    "samples": [
      "오늘 가장 웃겼던 일을 말하면서 같이 웃고 싶어요.",
      "하루 동안 마음에 남았던 일을 차근차근 이야기해요.",
      "지금 뭘 하고 있는지부터 말하다가 자연스럽게 하루 이야기로 이어 가요."
    ],
    "ordinal": 2
  },
  {
    "id": 50013,
    "category": "dates",
    "prompt": "연인과 만날 시간이 한 시간뿐이라면 그 시간을 어떻게 보내고 싶나요?",
    "samples": [
      "천천히 걸으면서 오늘 있었던 일을 나누고 싶어요.",
      "카페에 나란히 앉아 잠깐 쉬면서 함께 있고 싶어요.",
      "시간이 짧아도 둘이 좋아하는 활동 하나를 함께하고 싶어요."
    ],
    "ordinal": 3
  },
  {
    "id": 50037,
    "category": "affection",
    "prompt": "연인과 오래 만나도 꾸준히 이어 가고 싶은 다정한 행동은 무엇인가요?",
    "samples": [
      "만날 때 잠깐 하던 일을 멈추고 반갑게 맞아 주고 싶어요.",
      "상대가 기다리는 일이 있으면 그날 어땠는지 물어보고 싶어요.",
      "익숙해져도 함께 있어서 좋다는 말을 종종 전하고 싶어요."
    ],
    "ordinal": 4
  },
  {
    "id": 50061,
    "category": "values",
    "prompt": "사귄 지 얼마 안 된 연인이 일상을 더 많이 함께하고 싶어 하면 어떻게 이야기하나요?",
    "samples": [
      "함께 해 보고 싶은 일을 하나씩 정해서 조금씩 시간을 늘리고 싶어요.",
      "어떤 시간을 함께 보내고 싶은지 듣고 내 바람도 이야기해요.",
      "지금 내 생활에서 편하게 함께할 수 있는 시간부터 알려 줘요."
    ],
    "ordinal": 5
  },
  {
    "id": 50049,
    "category": "conflict",
    "prompt": "연인과 말다툼을 하다가 목소리가 커지면 어떻게 하나요?",
    "samples": [
      "잠깐 물을 마시고 와서 하던 이야기를 다시 꺼내요.",
      "지금 가장 하고 싶은 말을 하나만 골라 천천히 말해요.",
      "잠시 쉬었다가 다시 이야기할 시간을 함께 정해요."
    ],
    "ordinal": 6
  },
  {
    "id": 50002,
    "category": "attraction",
    "prompt": "이성의 사소한 버릇 중 유난히 눈길이 가는 건 무엇인가요?",
    "samples": [
      "이야기하면서 손으로 작게 표현하는 모습이 눈에 들어와요.",
      "좋아하는 음악이 나오면 저절로 리듬을 타는 모습이 좋아요.",
      "무언가에 집중할 때 평소와 달라지는 표정이 기억에 남아요."
    ],
    "ordinal": 7
  },
  {
    "id": 50026,
    "category": "communication",
    "prompt": "둘 다 바쁜 하루에는 연인과 연락을 어떻게 이어 가고 싶나요?",
    "samples": [
      "잠깐 쉴 때 짧게 안부를 주고받으면 좋겠어요.",
      "낮에는 각자 집중하고 저녁에 여유 있게 이야기하고 싶어요.",
      "서로 바쁜 시간을 미리 알려 두고 생각날 때 편하게 연락하고 싶어요."
    ],
    "ordinal": 8
  },
  {
    "id": 50014,
    "category": "dates",
    "prompt": "연인과 아무 약속도 없는 휴일을 보낸다면 하루를 어떻게 시작하고 싶나요?",
    "samples": [
      "느긋하게 일어나 함께 아침을 만들고 싶어요.",
      "밖의 날씨를 보고 그날 끌리는 곳으로 나가고 싶어요.",
      "각자 하고 싶은 일을 이야기한 뒤 하나씩 함께해 보고 싶어요."
    ],
    "ordinal": 9
  },
  {
    "id": 50038,
    "category": "affection",
    "prompt": "연인과 평범한 하루를 보내다 사랑받는다고 느끼는 순간은 언제인가요?",
    "samples": [
      "별일 없는 이야기를 하는데도 내 쪽으로 몸을 돌려 들어 줄 때요.",
      "각자 할 일을 하다가 문득 눈이 마주쳐 같이 웃을 때요.",
      "내가 좋아하는 자리를 자연스럽게 비워 두는 걸 발견할 때요."
    ],
    "ordinal": 10
  },
  {
    "id": 50062,
    "category": "values",
    "prompt": "연애하면서 혼자 보내는 시간은 어떻게 마련하고 싶나요?",
    "samples": [
      "매주 혼자 쉬는 시간을 미리 정해 두고 싶어요.",
      "혼자 있고 싶은 날에는 그날의 기분을 편하게 말하고 싶어요.",
      "각자 취미에 집중하는 시간을 두고 나중에 이야기를 나누고 싶어요."
    ],
    "ordinal": 11
  },
  {
    "id": 50050,
    "category": "conflict",
    "prompt": "연인이 서운했던 일을 며칠 뒤에 꺼내면 어떻게 이야기를 나누나요?",
    "samples": [
      "그날 무슨 일이 있었는지 서로 기억나는 것부터 이야기해요.",
      "그동안 어떤 마음이었는지 먼저 들어 보고 싶어요.",
      "생각하지 못했던 이야기라 잠깐 정리한 뒤 내 마음도 말해요."
    ],
    "ordinal": 12
  },
  {
    "id": 50003,
    "category": "attraction",
    "prompt": "처음 만나는 이성에게 내 어떤 모습을 자연스럽게 보여주고 싶나요?",
    "samples": [
      "편해지면 장난도 잘 치고 많이 웃는 모습을 보여주고 싶어요.",
      "상대의 이야기를 차분히 듣고 궁금한 걸 묻는 모습을 보여주고 싶어요.",
      "처음 보는 것에 호기심이 생기면 직접 해 보는 모습을 보여주고 싶어요."
    ],
    "ordinal": 13
  },
  {
    "id": 50027,
    "category": "communication",
    "prompt": "연인과 통화하다 둘 다 말이 없어지면, 그 시간을 어떻게 보내고 싶나요?",
    "samples": [
      "잠깐 조용해져도 연결된 채로 각자 하던 일을 하고 싶어요.",
      "문득 생각난 작은 이야기를 꺼내며 다시 대화를 이어 가고 싶어요.",
      "오늘 이야기는 충분히 나눴다는 기분으로 다정하게 인사하고 싶어요."
    ],
    "ordinal": 14
  },
  {
    "id": 50015,
    "category": "dates",
    "prompt": "데이트 장소가 시끄러워 서로의 말이 잘 안 들리면 어떻게 하고 싶나요?",
    "samples": [
      "이야기를 더 나누고 싶어서 조용한 곳으로 옮기자고 하고 싶어요.",
      "그곳의 분위기를 즐기고, 대화는 돌아가는 길에 하고 싶어요.",
      "종이나 휴대폰에 짧게 적어 보여주며 장난스럽게 이야기하고 싶어요."
    ],
    "ordinal": 15
  },
  {
    "id": 50039,
    "category": "affection",
    "prompt": "연인의 어떤 모습을 보면 칭찬을 꼭 해 주고 싶어지나요?",
    "samples": [
      "잘 안되던 일을 자기 방식으로 다시 해 볼 때 응원하는 말을 해 주고 싶어요.",
      "좋아하는 이야기를 신나게 할 때 눈이 반짝여서 보기 좋다고 말해 주고 싶어요.",
      "누가 보고 있지 않아도 작은 약속을 지키는 모습을 알아봐 주고 싶어요."
    ],
    "ordinal": 16
  },
  {
    "id": 50063,
    "category": "values",
    "prompt": "연인에게 아직 말하고 싶지 않은 개인적인 이야기가 있으면 어떻게 전하나요?",
    "samples": [
      "좀 더 편하게 이야기할 수 있을 때 내가 먼저 꺼내겠다고 해요.",
      "지금 말할 수 있는 부분만 이야기하고 자세한 내용은 남겨 둬요.",
      "그 이야기는 혼자 간직하고 싶다고 담담하게 말해요."
    ],
    "ordinal": 17
  },
  {
    "id": 50051,
    "category": "conflict",
    "prompt": "연인과 같은 일을 다르게 기억할 때 어떻게 이야기를 풀어 가나요?",
    "samples": [
      "각자 어떤 장면이 기억나는지 차례로 이야기해 봐요.",
      "그때 서로 어떤 기분이었는지 먼저 물어봐요.",
      "둘 다 기억하는 부분부터 확인하고 나머지는 서두르지 않아요."
    ],
    "ordinal": 18
  },
  {
    "id": 50004,
    "category": "attraction",
    "prompt": "소개팅에서 내 이야기를 하나 들려준다면, 어떤 경험을 꺼내고 싶나요?",
    "samples": [
      "새 취미를 배우다가 엉뚱한 실수를 해서 웃었던 이야기를 하고 싶어요.",
      "오래 고민한 뒤 생활을 바꿨던 선택을 이야기하고 싶어요.",
      "친구들과 아직도 꺼내며 웃는 추억을 들려주고 싶어요."
    ],
    "ordinal": 19
  },
  {
    "id": 50028,
    "category": "communication",
    "prompt": "연인과 메시지를 나눌 때, 글로는 잘 전해지지 않는 내 모습은 무엇인가요?",
    "samples": [
      "장난칠 때의 표정이 안 보여서 생각보다 진지하게 읽히는 것 같아요.",
      "기분이 좋아도 문장을 짧게 써서 신난 마음이 덜 보일 것 같아요.",
      "말로는 수줍어하는 편인데 글로는 편하게 말해서 그 차이가 클 것 같아요."
    ],
    "ordinal": 20
  },
  {
    "id": 50016,
    "category": "dates",
    "prompt": "연인과 둘 다 처음 해 보는 활동에 도전하면 나는 어떤 모습일 것 같나요?",
    "samples": [
      "둘 다 서툴러도 웃으면서 이것저것 해 볼 것 같아요.",
      "설명을 먼저 잘 듣고 익숙해질 때까지 차근차근 해 볼 것 같아요.",
      "서로 잘되는 부분을 알려 주면서 함께 요령을 찾을 것 같아요."
    ],
    "ordinal": 21
  },
  {
    "id": 50040,
    "category": "affection",
    "prompt": "연인에게 줄 선물을 준비하며 가장 기대하는 순간은 언제인가요?",
    "samples": [
      "연인이 갖고 싶어 하던 선물을 보고 놀라는 순간이 기대돼요.",
      "선물을 고르며 했던 생각을 나누는 시간이 좋아요.",
      "나중에 일상에서 잘 쓰는 모습을 보면 기쁠 것 같아요."
    ],
    "ordinal": 22
  },
  {
    "id": 50064,
    "category": "values",
    "prompt": "연애를 시작한 뒤에도 친구들과의 관계는 어떻게 이어 가고 싶나요?",
    "samples": [
      "서로의 친구 이야기는 나누면서 만남은 각자 편하게 갖고 싶어요.",
      "가끔은 함께 어울리고 평소 모임은 지금처럼 이어 가고 싶어요.",
      "가까운 친구들부터 천천히 소개하며 서로 알아 갔으면 해요."
    ],
    "ordinal": 23
  },
  {
    "id": 50052,
    "category": "conflict",
    "prompt": "친구들 앞에서 연인과 의견이 부딪히면 어떻게 대화를 이어 가나요?",
    "samples": [
      "내 생각을 짧게 말하고 다른 사람들의 이야기도 들어요.",
      "연인에게 왜 그렇게 생각하는지 조금 더 물어봐요.",
      "둘이 따로 이야기하고 싶다고 말하고 다른 주제로 넘어가요."
    ],
    "ordinal": 24
  },
  {
    "id": 50005,
    "category": "attraction",
    "prompt": "첫 데이트를 앞두고 무엇을 가장 신경 써서 준비하나요?",
    "samples": [
      "저답고 편하게 움직일 수 있는 옷을 고르는 데 시간을 써요.",
      "길을 헤매지 않도록 장소와 이동 시간을 확인해요.",
      "너무 잘 보이려 애쓰지 말자고 마음을 가볍게 해요."
    ],
    "ordinal": 25
  },
  {
    "id": 50029,
    "category": "communication",
    "prompt": "연인이 내 이야기에 어떻게 반응하면 더 많이 이야기하고 싶어지나요?",
    "samples": [
      "작은 부분을 기억했다가 물어봐 주면 이야기가 길어져요.",
      "내 기분에 맞춰 같이 웃거나 속상해해 주면 더 편해져요.",
      "자기도 비슷한 일을 겪었다며 경험을 나눠 주면 대화를 더 하고 싶어요."
    ],
    "ordinal": 26
  },
  {
    "id": 50017,
    "category": "dates",
    "prompt": "연인과 나란히 앉아 각자 책을 읽는다면 그 시간을 어떻게 보내고 싶나요?",
    "samples": [
      "마음에 드는 문장이 나오면 중간중간 보여주고 싶어요.",
      "각자 조용히 읽다가 쉬는 시간에 이야기를 나누고 싶어요.",
      "책을 바꿔 읽어 보며 서로 어떤 부분을 좋아했는지 알고 싶어요."
    ],
    "ordinal": 27
  },
  {
    "id": 50041,
    "category": "affection",
    "prompt": "내 애정 표현이 연인에게 잘 전해졌다고 느끼는 순간은 언제인가요?",
    "samples": [
      "내가 했던 말을 한참 뒤에도 기억해서 꺼내 줄 때요.",
      "나를 대하는 표정이나 말투가 조금 더 편안해질 때요.",
      "상대도 자기만의 방식으로 마음을 표현해 줄 때 느껴요."
    ],
    "ordinal": 28
  },
  {
    "id": 50065,
    "category": "values",
    "prompt": "연인과 데이트에 쓰고 싶은 금액이 다르면 어떻게 이야기를 나누고 싶나요?",
    "samples": [
      "각자 편하게 쓸 수 있는 금액을 이야기하고 그 안에서 계획하고 싶어요.",
      "평소 만남과 특별한 날을 나눠서 지출을 생각해 보고 싶어요.",
      "이번 데이트에서 꼭 하고 싶은 일을 서로 말한 뒤 비용을 맞춰 보고 싶어요."
    ],
    "ordinal": 29
  },
  {
    "id": 50053,
    "category": "conflict",
    "prompt": "연인과 같은 문제로 여러 번 다투게 되면 다음 대화는 어떻게 시작하나요?",
    "samples": [
      "가장 최근에 있었던 일 하나를 놓고 이야기해요.",
      "서로 어떤 점이 달라지기를 바라는지부터 물어봐요.",
      "지난번에 정한 방법이 왜 잘 맞지 않았는지 함께 살펴봐요."
    ],
    "ordinal": 30
  },
  {
    "id": 50006,
    "category": "attraction",
    "prompt": "첫 데이트에서 긴장될 때는 어떻게 풀어 가나요?",
    "samples": [
      "조금 떨린다고 솔직히 말하면 한결 편해져요.",
      "주변에서 눈에 띄는 것으로 가벼운 이야기를 시작해요.",
      "마주 앉아 있기보다 잠깐 함께 걸으면서 이야기해요."
    ],
    "ordinal": 31
  },
  {
    "id": 50030,
    "category": "communication",
    "prompt": "연인과 메시지를 나누다 이야기가 길어지면 어떻게 이어 가고 싶나요?",
    "samples": [
      "생각을 차분히 정리할 수 있어서 글로 천천히 이어 가고 싶어요.",
      "바로 반응을 들으며 이야기할 수 있게 통화하자고 하고 싶어요.",
      "급한 이야기가 아니면 만났을 때 얼굴을 보며 더 나누고 싶어요."
    ],
    "ordinal": 32
  },
  {
    "id": 50018,
    "category": "dates",
    "prompt": "연인과 함께 만든 요리가 예상과 다르게 나오면 어떻게 할 것 같나요?",
    "samples": [
      "엉뚱한 모양에 이름을 붙이며 둘만의 요리로 먹어 보고 싶어요.",
      "어디서 달라졌는지 함께 찾아보고 다시 만들어 보고 싶어요.",
      "간단한 다른 음식을 먹으면서 실패한 과정을 웃으며 이야기하고 싶어요."
    ],
    "ordinal": 33
  },
  {
    "id": 50042,
    "category": "affection",
    "prompt": "연인에게만 편하게 보여 줄 수 있을 것 같은 내 모습은 무엇인가요?",
    "samples": [
      "밖에서는 잘 안 하는 엉뚱한 장난을 마음껏 하는 모습이요.",
      "별일 없어도 기대고 싶다고 솔직하게 말하는 모습이요.",
      "잘하려고 애쓰지 않고 느긋하게 시간을 보내는 모습일 것 같아요."
    ],
    "ordinal": 34
  },
  {
    "id": 50066,
    "category": "values",
    "prompt": "연인이 둘의 미래 계획을 구체적으로 이야기하면 어떻게 대화를 이어 가나요?",
    "samples": [
      "내가 바라는 생활도 이야기하면서 함께 상상해 보고 싶어요.",
      "그 계획에서 가장 기대하는 일이 뭔지부터 물어봐요.",
      "아직 정하지 못한 부분은 솔직하게 말하고 천천히 생각해 보고 싶어요."
    ],
    "ordinal": 35
  },
  {
    "id": 50054,
    "category": "conflict",
    "prompt": "다툰 뒤 서로 다시 이야기하고 싶은 때가 다르면 어떻게 맞추나요?",
    "samples": [
      "각자 필요한 시간을 말하고 다시 대화할 때를 정해요.",
      "지금 꼭 전하고 싶은 말만 나누고 자세한 이야기는 미뤄요.",
      "말할 준비가 되면 먼저 글로 생각을 전해도 좋을지 물어봐요."
    ],
    "ordinal": 36
  },
  {
    "id": 50007,
    "category": "attraction",
    "prompt": "이성을 소개받을 때 어떤 이야기를 들으면 그 사람이 궁금해지나요?",
    "samples": [
      "쉬는 날을 어떻게 보내는지 들으면 일상이 궁금해져요.",
      "친구들이 그 사람과 함께했던 재미있는 일을 들으면 만나 보고 싶어요.",
      "요즘 푹 빠져 있는 일이 있다는 말을 들으면 직접 듣고 싶어요."
    ],
    "ordinal": 37
  },
  {
    "id": 50031,
    "category": "communication",
    "prompt": "연인이 내 생각을 물었는데 바로 답이 떠오르지 않으면 어떻게 말하나요?",
    "samples": [
      "조금만 생각할 시간을 달라고 하고 정리한 뒤 이야기해요.",
      "생각나는 것부터 말하면서 대화 속에서 내 생각을 정리해요.",
      "아직 잘 모르겠다고 말하고 연인의 생각을 먼저 들어 봐요."
    ],
    "ordinal": 38
  },
  {
    "id": 50019,
    "category": "dates",
    "prompt": "자주 데이트하던 곳이 문을 닫는다는 소식을 들으면 어떻게 하고 싶나요?",
    "samples": [
      "가능하다면 함께 마지막으로 들러 사진 한 장을 남기고 싶어요.",
      "그곳에서 있었던 일을 서로 이야기하며 기억하고 싶어요.",
      "두 사람이 좋아했던 점을 떠올리며 새로 갈 곳을 찾아보고 싶어요."
    ],
    "ordinal": 39
  },
  {
    "id": 50043,
    "category": "affection",
    "prompt": "사람들이 있는 자리에서 연인에게 애정을 표현한다면 어떻게 하고 싶나요?",
    "samples": [
      "눈이 마주치면 둘만 알아볼 만큼 살짝 웃고 싶어요.",
      "손을 잡거나 어깨에 기대면서 자연스럽게 함께 있고 싶어요.",
      "둘이 잠깐 따로 있을 때 다정한 말을 전하고 싶어요."
    ],
    "ordinal": 40
  },
  {
    "id": 50067,
    "category": "values",
    "prompt": "연인이 다른 도시에서 살아 보고 싶다고 하면 어떤 이야기를 나누고 싶나요?",
    "samples": [
      "그 도시에서 어떤 생활을 해 보고 싶은지 자세히 듣고 싶어요.",
      "떨어져 지내게 되면 서로를 만나는 시간을 어떻게 만들지 이야기하고 싶어요.",
      "내가 앞으로 살고 싶은 곳도 이야기하며 서로의 계획을 알아보고 싶어요."
    ],
    "ordinal": 41
  },
  {
    "id": 50055,
    "category": "conflict",
    "prompt": "연인과 함께 가기로 한 곳의 예약을 내가 잊었다면 어떻게 수습하나요?",
    "samples": [
      "잊었다고 바로 말하고 지금 갈 수 있는 다른 곳을 찾아봐요.",
      "기대했을 텐데 미안하다고 말하고 오늘은 뭘 하고 싶은지 물어요.",
      "다음에 둘 다 가능한 날을 찾아 내가 다시 예약하겠다고 말해요."
    ],
    "ordinal": 42
  },
  {
    "id": 50008,
    "category": "attraction",
    "prompt": "사진으로만 알던 이성을 직접 만나면 어떤 점이 가장 인상에 남나요?",
    "samples": [
      "말할 때의 목소리와 웃는 소리가 새로운 인상으로 남아요.",
      "이야기할 때 서로 얼마나 편안한지가 느껴져요.",
      "걷는 모습이나 작은 몸짓에서 그 사람다운 느낌을 받아요."
    ],
    "ordinal": 43
  },
  {
    "id": 50032,
    "category": "communication",
    "prompt": "연인이 앞으로 해 보고 싶은 일을 말하면, 어떤 이야기를 더 듣고 싶나요?",
    "samples": [
      "처음 그 일을 하고 싶다고 느낀 순간이 궁금해요.",
      "시작하면 평소 하루가 어떻게 달라질지 들어 보고 싶어요.",
      "무엇이 가장 기대되고 무엇이 아직 망설여지는지 궁금해요."
    ],
    "ordinal": 44
  },
  {
    "id": 50020,
    "category": "dates",
    "prompt": "연인과 처음 여행을 간다면 내 어떤 생활 습관을 미리 알려주고 싶나요?",
    "samples": [
      "아침에는 말수가 적어서 천천히 잠이 깨는 편이라고 알려주고 싶어요.",
      "배가 고프면 금방 지쳐서 식사 시간을 챙기고 싶다고 말하고 싶어요.",
      "한곳이 마음에 들면 오래 머무르는 편이라고 알려주고 싶어요."
    ],
    "ordinal": 45
  },
  {
    "id": 50044,
    "category": "affection",
    "prompt": "내가 지쳐서 표현이 줄어든 날에는 연인에게 마음을 어떻게 알리고 싶나요?",
    "samples": [
      "오늘은 말수가 적어도 함께 있는 건 좋다고 짧게 전하고 싶어요.",
      "잠깐 쉬고 여유가 생기면 내가 어떤 하루를 보냈는지 이야기하고 싶어요.",
      "말을 많이 하지는 못해도 가까이 앉아 시간을 함께 보내고 싶어요."
    ],
    "ordinal": 46
  },
  {
    "id": 50068,
    "category": "values",
    "prompt": "연인과 함께한 일상을 온라인에 올릴 때 어떤 기준을 두고 싶나요?",
    "samples": [
      "둘 다 올려도 좋다고 한 사진만 가까운 사람들에게 보여 주고 싶어요.",
      "함께 간 곳이나 풍경 위주로 남기고 개인적인 이야기는 둘만 알고 싶어요.",
      "평소 일상보다는 둘에게 특별했던 날을 가끔 기록하고 싶어요."
    ],
    "ordinal": 47
  },
  {
    "id": 50056,
    "category": "conflict",
    "prompt": "연인이 사과했는데도 마음에 남는 일이 있다면 어떻게 이야기하나요?",
    "samples": [
      "사과는 고맙지만 아직 속상한 부분이 있다고 구체적으로 말해요.",
      "지금은 마음이 복잡해서 조금 더 시간이 필요하다고 전해요.",
      "다음에 비슷한 일이 생기면 어떻게 해 주면 좋을지 이야기해요."
    ],
    "ordinal": 48
  },
  {
    "id": 50009,
    "category": "attraction",
    "prompt": "여럿이 있는 자리에서 마음에 드는 이성과 이야기하고 싶으면 어떻게 다가가나요?",
    "samples": [
      "그 사람이 꺼낸 이야기에서 궁금한 점을 물어봐요.",
      "함께할 작은 일이 생겼을 때 자연스럽게 옆에서 이야기해요.",
      "여럿의 대화에 먼저 참여하다가 따로 이야기할 때를 찾아요."
    ],
    "ordinal": 49
  },
  {
    "id": 50033,
    "category": "communication",
    "prompt": "서로에게 익숙해진 뒤에도 연인과 계속 나누고 싶은 이야기는 무엇인가요?",
    "samples": [
      "요즘 새로 좋아하게 된 것을 서로 알려 주고 싶어요.",
      "함께 보낸 날을 각자 어떻게 기억하는지 종종 이야기하고 싶어요.",
      "살면서 생각이 달라진 부분을 편하게 나누고 싶어요."
    ],
    "ordinal": 50
  },
  {
    "id": 50021,
    "category": "dates",
    "prompt": "첫 데이트를 상대가 준비했다면 다음 만남은 어떻게 준비하고 싶나요?",
    "samples": [
      "이번에는 제가 좋아하는 곳을 엮어 코스를 짜 보고 싶어요.",
      "각자 해 보고 싶은 것 하나씩 골라 함께 정하고 싶어요.",
      "만날 시간만 정하고 그날의 기분에 따라 함께 움직이고 싶어요."
    ],
    "ordinal": 51
  },
  {
    "id": 50045,
    "category": "affection",
    "prompt": "연인이 다정하게 마음을 표현해 주면, 나도 모르게 어떤 반응이 나오나요?",
    "samples": [
      "쑥스러워서 웃다가 시간이 조금 지나서 내 마음도 말하게 돼요.",
      "나도 기분이 좋아져서 바로 다정한 말을 더 하게 돼요.",
      "그 순간에는 말이 잘 안 나오고 함께 있던 장면을 오래 떠올리게 돼요."
    ],
    "ordinal": 52
  },
  {
    "id": 50069,
    "category": "values",
    "prompt": "연인을 믿고 의지할 수 있다고 느끼는 건 어떤 모습을 봤을 때인가요?",
    "samples": [
      "작은 약속도 기억하고 지켜 주는 모습을 봤을 때예요.",
      "내가 힘든 이야기를 꺼내면 함께 방법을 생각해 줄 때예요.",
      "실수한 일이 있어도 먼저 솔직하게 이야기해 줄 때예요."
    ],
    "ordinal": 53
  },
  {
    "id": 50057,
    "category": "conflict",
    "prompt": "연인과 다툰 날 친구들과의 모임을 함께 준비해야 한다면 어떻게 하나요?",
    "samples": [
      "준비할 일을 먼저 마치고 마음 이야기는 따로 나누자고 해요.",
      "잠깐 쉬면서 기분을 가라앉힌 뒤 같이 준비를 시작해요.",
      "각자 맡을 일을 나누고 필요한 내용만 주고받으며 준비해요."
    ],
    "ordinal": 54
  },
  {
    "id": 50010,
    "category": "attraction",
    "prompt": "마음에 드는 이성에게 처음 데이트를 제안한다면 어떤 말로 꺼내고 싶나요?",
    "samples": [
      "이야기를 더 나누고 싶은데 둘이 한번 만나자고 말하고 싶어요.",
      "전에 함께 관심을 보인 전시가 생각났다며 같이 가자고 하고 싶어요.",
      "이번 주에 잠깐 산책할 시간이 있는지 가볍게 물어보고 싶어요."
    ],
    "ordinal": 55
  },
  {
    "id": 50034,
    "category": "communication",
    "prompt": "연인과 장난을 주고받을 때, 어떤 분위기에서 가장 편하게 웃게 되나요?",
    "samples": [
      "서로 엉뚱한 말을 받아 주며 이야기가 이어질 때 많이 웃어요.",
      "둘이 겪었던 일을 살짝 떠올리는 장난이 편해요.",
      "가볍게 웃다가도 하고 싶은 말이 생기면 자연스럽게 들어 주는 분위기가 좋아요."
    ],
    "ordinal": 56
  },
  {
    "id": 50022,
    "category": "dates",
    "prompt": "데이트 중 연인과 줄을 오래 기다려야 한다면 그 시간을 어떻게 보내고 싶나요?",
    "samples": [
      "서로에게 궁금했던 것을 하나씩 물으며 이야기하고 싶어요.",
      "주변 풍경을 함께 구경하며 느긋하게 기다리고 싶어요.",
      "짧은 말놀이를 하거나 재미있는 영상을 함께 보고 싶어요."
    ],
    "ordinal": 57
  },
  {
    "id": 50046,
    "category": "affection",
    "prompt": "연인이 마음을 담아 쓴 편지를 읽고 나면, 어떻게 마음을 나누고 싶나요?",
    "samples": [
      "가장 마음에 남은 문장을 짚어 주며 이야기를 나누고 싶어요.",
      "조용히 여러 번 읽은 뒤 내 이야기도 글로 써 보고 싶어요.",
      "만나서 편지를 읽을 때 어떤 기분이었는지 말해 주고 싶어요."
    ],
    "ordinal": 58
  },
  {
    "id": 50070,
    "category": "values",
    "prompt": "이직을 고민하며 연인과 상의한다면 어떤 도움을 받고 싶나요?",
    "samples": [
      "내가 놓친 점을 짚어 주고 여러 방법을 함께 생각해 줬으면 해요.",
      "결론을 서두르지 않고 내가 말을 정리할 때까지 들어 줬으면 해요.",
      "연인이 비슷한 일을 겪었다면 그때의 경험을 들려줬으면 해요."
    ],
    "ordinal": 59
  },
  {
    "id": 50058,
    "category": "conflict",
    "prompt": "연인과 충분히 이야기했는데도 생각이 다르면 어떻게 대화를 마무리하나요?",
    "samples": [
      "오늘은 결론을 내리지 않고 각자 더 생각해 보자고 해요.",
      "생각이 다른 부분을 확인하고 각자의 방식을 존중하기로 해요.",
      "둘 다 해 볼 만한 방법을 잠깐 시도한 뒤 다시 이야기하자고 해요."
    ],
    "ordinal": 60
  },
  {
    "id": 50011,
    "category": "attraction",
    "prompt": "좋아하는 사람에게 내 마음을 전할 용기가 생기는 순간은 언제인가요?",
    "samples": [
      "상대도 저와 보내는 시간을 기다린다는 느낌이 들 때요.",
      "혼자 추측하기보다 제 마음을 솔직히 말하고 싶어질 때요.",
      "함께 겪은 일이 쌓여서 제 마음이 분명해졌을 때요."
    ],
    "ordinal": 61
  },
  {
    "id": 50035,
    "category": "communication",
    "prompt": "연인에게 길게 쓴 메시지를 보내기 전에는 어떤 생각을 하나요?",
    "samples": [
      "내 말투처럼 자연스럽게 읽힐지 생각해요.",
      "너무 다듬으면 마음이 달라질 것 같아서 쓴 그대로 보내고 싶어요.",
      "상대가 여유 있게 읽을 수 있는 시간인지 먼저 생각해요."
    ],
    "ordinal": 62
  },
  {
    "id": 50023,
    "category": "dates",
    "prompt": "연인에게 내가 오래 살았던 동네를 보여준다면 어떤 이야기를 들려주고 싶나요?",
    "samples": [
      "어릴 때 자주 놀던 곳과 그때의 제 모습을 이야기하고 싶어요.",
      "힘들 때 혼자 걷던 길에서 어떤 생각을 했는지 들려주고 싶어요.",
      "익숙한 가게를 지나며 저의 평범한 하루를 소개하고 싶어요."
    ],
    "ordinal": 63
  },
  {
    "id": 50047,
    "category": "affection",
    "prompt": "연인에게 편하게 기대고 싶은 날에는 함께 어떤 시간을 보내고 싶나요?",
    "samples": [
      "말을 많이 하지 않아도 괜찮은 조용한 산책을 하고 싶어요.",
      "내 이야기를 실컷 하고 나서 같이 맛있는 것을 먹고 싶어요.",
      "평소 둘이 즐기던 일을 하면서 자연스럽게 기분을 풀고 싶어요."
    ],
    "ordinal": 64
  },
  {
    "id": 50071,
    "category": "values",
    "prompt": "연인이 도와주려는 일을 혼자 해 보고 싶다면 어떻게 말하나요?",
    "samples": [
      "도와주려는 마음은 고맙지만 이번에는 내 힘으로 해 보고 싶다고 말해요.",
      "일단 혼자 해 보고 막히는 부분이 생기면 부탁하겠다고 해요.",
      "직접 해내고 싶은 이유를 이야기하고 다 끝나면 보여 주겠다고 해요."
    ],
    "ordinal": 65
  },
  {
    "id": 50059,
    "category": "conflict",
    "prompt": "다툰 뒤 연인이 평소처럼 말을 걸어오면 어떻게 반응하나요?",
    "samples": [
      "일상 이야기를 나누다 보면 나도 조금씩 편해져요.",
      "평소 이야기로 돌아가기 전에 남은 말을 마저 나누고 싶다고 해요.",
      "짧게 대답하면서 내 마음이 어떤지 조금 더 살펴봐요."
    ],
    "ordinal": 66
  },
  {
    "id": 50012,
    "category": "attraction",
    "prompt": "첫 데이트 뒤 다시 만나고 싶은지 생각할 때 무엇을 떠올리나요?",
    "samples": [
      "꾸미지 않은 제 이야기도 편하게 할 수 있었는지 떠올려요.",
      "돌아오는 길에도 계속 궁금했던 그 사람의 이야기를 떠올려요.",
      "함께 웃었던 순간과 다음에 같이 해 보고 싶은 일을 떠올려요."
    ],
    "ordinal": 67
  },
  {
    "id": 50036,
    "category": "communication",
    "prompt": "연인과 대화할 때, 어떤 순간에 가장 나답게 말할 수 있나요?",
    "samples": [
      "말을 잘하려고 애쓰지 않아도 서로 뜻이 통할 때 편안해요.",
      "내가 신나서 길게 이야기해도 즐겁게 들어 줄 때요.",
      "생각이 잘 정리되지 않은 이야기도 서두르지 않고 나눌 수 있을 때요."
    ],
    "ordinal": 68
  },
  {
    "id": 50024,
    "category": "dates",
    "prompt": "연인에게 내가 좋아하는 취미를 처음 알려준다면 어떻게 함께해 보고 싶나요?",
    "samples": [
      "제가 왜 좋아하게 됐는지 이야기하며 쉬운 것부터 같이 해 보고 싶어요.",
      "상대가 궁금해하는 것부터 자유롭게 해 보도록 곁에서 도와주고 싶어요.",
      "먼저 제가 즐기는 걸 함께 구경하며 어떤 점이 재미있는지 이야기하고 싶어요."
    ],
    "ordinal": 69
  },
  {
    "id": 50048,
    "category": "affection",
    "prompt": "연인에게서 닮고 싶은 모습을 발견하면, 어떤 방식으로 그 마음을 전하나요?",
    "samples": [
      "어떤 장면에서 그런 생각이 들었는지 구체적으로 말해 주고 싶어요.",
      "나도 조금 따라 해 본 뒤 덕분에 새로 해 봤다고 이야기하고 싶어요.",
      "어떻게 그런 생각이나 습관을 갖게 됐는지 궁금해하며 물어보고 싶어요."
    ],
    "ordinal": 70
  },
  {
    "id": 50072,
    "category": "values",
    "prompt": "연인과 함께 산다면 각자 쉴 공간은 어떻게 만들고 싶나요?",
    "samples": [
      "각자 편하게 쓸 수 있는 작은 방을 하나씩 두고 싶어요.",
      "같은 방 안에서도 각자 좋아하는 물건을 두는 자리를 만들고 싶어요.",
      "같은 공간을 쓰면서 혼자 쉬고 싶은 시간은 서로 맞춰 주고 싶어요."
    ],
    "ordinal": 71
  },
  {
    "id": 50060,
    "category": "conflict",
    "prompt": "연인과 다툰 뒤 마음이 풀렸다고 느끼는 순간은 어떤 때인가요?",
    "samples": [
      "같이 웃다가 아까의 어색함이 사라진 걸 느낄 때예요.",
      "연인이 내 마음을 어떻게 이해했는지 말해 줄 때예요.",
      "다음에 비슷한 상황에서 서로 조금 다르게 행동할 때예요."
    ],
    "ordinal": 72
  }
]$catalog$::jsonb;
begin
  if exists (
    select from pajang_private.relationship_question_catalog q
    join jsonb_to_recordset(reviewed) as p(id integer,ordinal integer,category text,prompt text,samples text[]) using(id)
    where row(q.ordinal,q.category,q.prompt,q.samples)
      is distinct from row(p.ordinal,p.category,p.prompt,p.samples)
  ) then raise exception 'Pajang relationship catalog changed; review the concurrent edit'; end if;
  if exists (
    select from jsonb_to_recordset(reviewed) as p(id integer,prompt text)
    join pajang_private.personality_question_catalog q on q.id=p.id or q.prompt=p.prompt
  ) or exists (
    select from jsonb_to_recordset(reviewed) as p(id integer)
    join pajang_private.question_catalog q using(id)
  ) then raise exception 'Pajang relationship question conflicts with an existing catalog'; end if;
  insert into pajang_private.relationship_question_catalog(id,ordinal,category,prompt,samples)
  select id,ordinal,category,prompt,samples
  from jsonb_to_recordset(reviewed) as p(id integer,ordinal integer,category text,prompt text,samples text[])
  on conflict(id) do nothing;
  if (select count(*) from pajang_private.relationship_question_catalog) <> 72 then
    raise exception 'Expected all 72 reviewed Pajang relationship questions';
  end if;
end;
$seed$;

create or replace function pajang_private.question_for_window(on_day date,in_slot text)
returns jsonb language sql stable strict set search_path='' as $question$
  with position as (
    select 1+2*(on_day-date '2026-11-18')+(in_slot='pm')::int as legacy_number,
      1+2*(on_day-date '2026-11-22')+(in_slot='pm')::int as number,
      (2*(on_day-date '2026-11-23')+(in_slot='pm')::int)%804 as round_index,
      extract(year from on_day)::int % 2 as edition
    where on_day>=date '2026-11-18' and in_slot in ('am','pm')
  ), choices as (
    select q.id,q.prompt,q.samples,0 as rank
    from position p cross join pajang_private.question_occasion(on_day) e
    join pajang_private.question_catalog q on q.occasion=e.kind
      and q.edition=p.edition and q.turn=2*e.day_no+(in_slot='pm')::int
    where on_day<date '2026-11-22'
    union all
    select q.id,q.prompt,q.samples,case when q.id=p.legacy_number then 1 else 2 end
    from position p join pajang_private.question_catalog q
      on q.occasion is null and q.id in(p.legacy_number,1+(p.legacy_number-1)%732)
    where on_day<date '2026-11-22'
    union all
    select q.id,q.prompt,q.samples,0
    from position p cross join pajang_private.question_occasion(on_day) e
    join pajang_private.personality_question_catalog q on q.occasion=e.kind
      and q.edition=p.edition and q.turn=2*e.day_no+(in_slot='pm')::int
    where on_day>=date '2026-11-22'
    union all
    select q.id,q.prompt,q.samples,2
    from position p join pajang_private.personality_question_catalog q
      on q.ordinal=case
        when on_day<date '2026-11-23' then 1+(p.number-1)%732
        else 1+(2+p.round_index-(p.round_index*72+803)/804)%732
      end
    where on_day>=date '2026-11-22'
    union all
    select q.id,q.prompt,q.samples,1
    from position p join pajang_private.relationship_question_catalog q
      on p.round_index=(q.ordinal-1)*804/72
    where on_day>=date '2026-11-23'
  )
  select jsonb_build_object('id',id,'q',jsonb_build_array(prompt),'answers',samples)
  from choices order by rank limit 1;
$question$;
revoke all on function pajang_private.question_for_window(date,text) from public,anon,authenticated;

-- Start after the current day; calendar questions retain priority. Spread the
-- 72 new questions evenly through 804 slots, instead of exhausting them up front.
-- Subtract already scheduled relationship slots to continue the 732-question
-- general pool from ordinal 3. Each regular prompt appears once per cycle.
-- Validate under the answers lock: never attach an existing answer to a new prompt.
do $published$
begin
  if exists (
    select from pajang_private.answers a
    where a.day>=date '2026-11-23'
      and a.question_prompt is distinct from (pajang_private.question_for_window(a.day,a.slot)#>>'{q,0}')
  ) then raise exception 'An answered Pajang window would change; choose a later relationship cutover'; end if;
end;
$published$;
-- The existing BEFORE INSERT guard checks the new selector after waiting for
-- this table lock, so a stale in-flight answer cannot slip through the cutover.
commit;
