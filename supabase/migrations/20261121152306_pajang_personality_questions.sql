-- Pajang: concrete, natural questions about behavior and personality.
-- Source: features/pajang/content/personality-*.json (936 hand-reviewed questions).
-- Regenerate with node scripts/build-pajang-personality-questions.mjs.
-- New IDs invalidate stale forms. Existing question/answer snapshots are untouched.
begin;
set local lock_timeout = '5s';
lock table pajang_private.answers in share row exclusive mode;

create table if not exists pajang_private.personality_question_catalog (
  id integer primary key check (id > 20000),
  ordinal integer unique,
  category text not null check (length(trim(category)) > 0),
  prompt text not null unique check (length(trim(prompt)) > 0),
  occasion text,
  edition smallint,
  turn smallint,
  unique(occasion,edition,turn),
  check ((occasion is null and edition is null and turn is null and ordinal is not null and ordinal between 1 and 732)
    or (occasion is not null and edition is not null and edition in (0,1) and turn is not null and turn >= 0 and ordinal is null)),
  samples text[] not null check (
    array_ndims(samples) = 1 and cardinality(samples) = 3
    and array_position(samples,null) is null and array_position(samples,'') is null
  )
);
alter table pajang_private.personality_question_catalog enable row level security;
revoke all on table pajang_private.personality_question_catalog from public,anon,authenticated;

-- A repeat is safe; conflicting edits abort instead of being overwritten.
do $seed$
declare
  reviewed constant jsonb := $catalog$[
  {
    "id": 20001,
    "category": "communication",
    "prompt": "친구에게 서운한 일이 생기면 어떻게 표현하나요?",
    "samples": [
      "그때 어떤 말이 서운했는지 바로 말해요.",
      "마음이 정리된 뒤 따로 이야기해요.",
      "가벼운 말로 먼저 반응을 살펴봐요."
    ],
    "ordinal": 1,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20002,
    "category": "communication",
    "prompt": "친구와 의견이 다를 때 내 생각을 어떻게 전하나요?",
    "samples": [
      "다르게 생각하는 이유부터 설명해요.",
      "친구 의견을 들은 뒤 제 생각을 말해요.",
      "서로 같은 생각부터 찾아서 말해요."
    ],
    "ordinal": 13,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20003,
    "category": "communication",
    "prompt": "내 이야기가 중간에 끊기면 어떻게 이어 가나요?",
    "samples": [
      "잠깐만 들어 달라고 하고 마저 말해요.",
      "상대 이야기가 끝나면 다시 꺼내요.",
      "그 이야기는 나중에 따로 전해요."
    ],
    "ordinal": 25,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20004,
    "category": "communication",
    "prompt": "문자로 보낸 말이 오해를 샀을 때 어떻게 풀어 가나요?",
    "samples": [
      "어떤 뜻으로 썼는지 문자로 설명해요.",
      "목소리로 전하려고 전화를 걸어요.",
      "상대가 어떻게 이해했는지 먼저 물어요."
    ],
    "ordinal": 37,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20005,
    "category": "communication",
    "prompt": "부탁받은 내용이 분명하지 않으면 어떻게 확인하나요?",
    "samples": [
      "제가 이해한 내용을 다시 말해 봐요.",
      "필요한 결과가 무엇인지 먼저 물어요.",
      "구체적인 예를 하나 들어 달라고 해요."
    ],
    "ordinal": 49,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20006,
    "category": "communication",
    "prompt": "재미있는 일을 겪고 친구에게 전할 때 어떻게 이야기하나요?",
    "samples": [
      "가장 재미있었던 장면부터 말해요.",
      "처음부터 차례대로 자세히 들려줘요.",
      "사진을 보여 주며 짧게 설명해요."
    ],
    "ordinal": 61,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20007,
    "category": "communication",
    "prompt": "대화 중 사실과 다른 이야기를 들으면 어떻게 하나요?",
    "samples": [
      "제가 아는 내용을 바로 덧붙여요.",
      "확인한 다음 조심스럽게 알려 줘요.",
      "이야기가 끝나면 따로 말해 줘요."
    ],
    "ordinal": 73,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20008,
    "category": "communication",
    "prompt": "여럿 앞에서 칭찬을 받으면 보통 어떻게 답하나요?",
    "samples": [
      "고맙다고 말하고 기쁜 마음을 표현해요.",
      "함께 도와준 사람들도 이야기해요.",
      "쑥스러워서 짧게 웃으며 답해요."
    ],
    "ordinal": 85,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20009,
    "category": "communication",
    "prompt": "친구가 약속 시간을 대충 정하려 하면 어떻게 말하나요?",
    "samples": [
      "몇 시에 만나면 좋을지 먼저 제안해요.",
      "출발할 때 연락하자고 이야기해요.",
      "가능한 시간대를 서로 확인해요."
    ],
    "ordinal": 97,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20010,
    "category": "communication",
    "prompt": "잡아 둔 약속을 취소해야 할 때 어떻게 전하나요?",
    "samples": [
      "사정을 설명하고 다른 날을 제안해요.",
      "취소해야 한다는 말부터 짧게 전해요.",
      "전화로 이야기하며 반응을 들어요."
    ],
    "ordinal": 109,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20011,
    "category": "communication",
    "prompt": "혼자 하기 어려운 일을 부탁할 때 어떻게 말을 꺼내나요?",
    "samples": [
      "도움이 필요한 부분을 바로 말해요.",
      "상대에게 여유가 있는지 먼저 물어요.",
      "제가 해 본 과정을 설명하고 부탁해요."
    ],
    "ordinal": 121,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20012,
    "category": "communication",
    "prompt": "친구의 농담을 이해하지 못했을 때 어떻게 반응하나요?",
    "samples": [
      "무슨 뜻인지 편하게 다시 물어봐요.",
      "친구들 반응을 보며 뜻을 짐작해요.",
      "잠깐 웃고 다음 이야기를 들어요."
    ],
    "ordinal": 133,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20013,
    "category": "communication",
    "prompt": "진지한 이야기를 해야 할 때 어떤 방식으로 전하나요?",
    "samples": [
      "직접 만나서 표정을 보며 이야기해요.",
      "생각을 글로 정리해서 먼저 보내요.",
      "통화할 시간을 정해서 이야기해요."
    ],
    "ordinal": 145,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20014,
    "category": "communication",
    "prompt": "여럿이 동의한 의견과 생각이 다르면 어떻게 말하나요?",
    "samples": [
      "제 생각이 다른 부분을 바로 말해요.",
      "다른 의견도 괜찮은지 먼저 물어요.",
      "이유를 정리한 뒤 차례를 기다려요."
    ],
    "ordinal": 157,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20015,
    "category": "communication",
    "prompt": "대화 중 내가 모르는 표현이 나오면 어떻게 하나요?",
    "samples": [
      "그 말의 뜻을 바로 물어봐요.",
      "앞뒤 이야기를 듣고 뜻을 짐작해요.",
      "제가 아는 표현으로 바꾸어 확인해요."
    ],
    "ordinal": 169,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20016,
    "category": "communication",
    "prompt": "처음 듣는 주제로 대화가 이어지면 어떻게 참여하나요?",
    "samples": [
      "궁금한 것을 하나씩 물어봐요.",
      "먼저 듣고 이해한 내용을 말해 봐요.",
      "제가 아는 비슷한 경험을 꺼내요."
    ],
    "ordinal": 181,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20017,
    "category": "communication",
    "prompt": "친구가 같은 이야기를 다시 할 때 어떻게 반응하나요?",
    "samples": [
      "지난번에 들은 뒤 달라진 점을 물어요.",
      "다시 듣다가 기억나는 부분을 말해요.",
      "처음 듣는 것처럼 끝까지 들어요."
    ],
    "ordinal": 193,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20018,
    "category": "communication",
    "prompt": "길게 온 메시지에 답할 때 어떤 방식이 편한가요?",
    "samples": [
      "내용을 나누어 하나씩 답하는 편이에요.",
      "가장 중요한 내용부터 답하는 편이에요.",
      "통화로 한 번에 이야기하는 게 편해요."
    ],
    "ordinal": 205,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20019,
    "category": "communication",
    "prompt": "친구가 내 말에 조용해지면 무엇을 먼저 확인하나요?",
    "samples": [
      "제가 한 말이 불편했는지 물어봐요.",
      "생각할 시간이 필요한지 살펴봐요.",
      "잘 들었는지 가볍게 다시 물어봐요."
    ],
    "ordinal": 217,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20020,
    "category": "communication",
    "prompt": "여럿의 대화에서 주제를 바꾸고 싶으면 어떻게 하나요?",
    "samples": [
      "지금 이야기와 이어지는 질문을 해요.",
      "잠깐 다른 얘기를 해도 될지 물어요.",
      "대화가 끊기는 순간을 기다려요."
    ],
    "ordinal": 229,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20021,
    "category": "communication",
    "prompt": "오랫동안 연락하지 않은 친구에게 어떻게 말을 건네나요?",
    "samples": [
      "문득 생각났다고 편하게 인사해요.",
      "함께 겪었던 일을 꺼내며 연락해요.",
      "요즘 어떻게 지내는지 바로 물어요."
    ],
    "ordinal": 241,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20022,
    "category": "communication",
    "prompt": "내가 했던 말을 바꾸고 싶을 때 어떻게 설명하나요?",
    "samples": [
      "생각이 바뀌었다고 먼저 밝혀요.",
      "새롭게 알게 된 이유부터 이야기해요.",
      "전과 달라진 부분만 짚어서 말해요."
    ],
    "ordinal": 253,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20023,
    "category": "communication",
    "prompt": "친구가 솔직한 평가를 부탁하면 어떻게 답하나요?",
    "samples": [
      "좋은 점과 아쉬운 점을 함께 말해요.",
      "무엇이 궁금한지 먼저 물어봐요.",
      "제가 느낀 인상을 바로 말해 줘요."
    ],
    "ordinal": 265,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20024,
    "category": "communication",
    "prompt": "게임을 처음 하는 친구에게 규칙을 어떻게 설명하나요?",
    "samples": [
      "중요한 규칙부터 짧게 설명해요.",
      "한 판 같이 하면서 보여 줘요.",
      "실수하기 쉬운 부분부터 알려 줘요."
    ],
    "ordinal": 277,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20025,
    "category": "communication",
    "prompt": "낯선 사람이 길을 물으면 어떤 식으로 설명하나요?",
    "samples": [
      "눈에 잘 띄는 건물을 기준으로 말해요.",
      "지도를 보여 주며 경로를 짚어요.",
      "방향과 걸리는 시간을 짧게 알려 줘요."
    ],
    "ordinal": 289,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20026,
    "category": "communication",
    "prompt": "갑자기 내 의견을 물으면 어떤 순서로 답하나요?",
    "samples": [
      "떠오르는 생각부터 말하며 정리해요.",
      "잠깐 생각할 시간을 달라고 해요.",
      "질문의 범위를 먼저 확인해요."
    ],
    "ordinal": 301,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20027,
    "category": "communication",
    "prompt": "상대가 내 말을 다르게 이해한 것 같으면 어떻게 하나요?",
    "samples": [
      "다른 예를 들어서 다시 설명해요.",
      "어떻게 이해했는지 먼저 물어봐요.",
      "제가 전하려던 핵심만 다시 말해요."
    ],
    "ordinal": 313,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20028,
    "category": "communication",
    "prompt": "내가 모르는 질문을 받으면 어떻게 대답하나요?",
    "samples": [
      "지금은 잘 모른다고 바로 말해요.",
      "아는 범위와 모르는 부분을 나누어 말해요.",
      "확인하고 다시 알려 주겠다고 해요."
    ],
    "ordinal": 325,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20029,
    "category": "communication",
    "prompt": "친구의 말에 공감이 잘 안 될 때 어떻게 답하나요?",
    "samples": [
      "왜 그렇게 느꼈는지 더 물어봐요.",
      "제 경험과 다른 점을 솔직히 말해요.",
      "판단 없이 이야기를 조금 더 들어요."
    ],
    "ordinal": 337,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20030,
    "category": "communication",
    "prompt": "할 말이 많을 때 상대에게 어떻게 전달하나요?",
    "samples": [
      "핵심부터 말하고 자세한 얘기를 이어 가요.",
      "항목을 나누어 차례로 이야기해요.",
      "대화를 주고받으며 조금씩 꺼내요."
    ],
    "ordinal": 349,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20031,
    "category": "communication",
    "prompt": "조용한 목소리 때문에 말이 잘 안 들리면 어떻게 하나요?",
    "samples": [
      "다시 말해 달라고 바로 부탁해요.",
      "조금 더 가까이 가서 들어요.",
      "제가 들은 내용을 말하며 확인해요."
    ],
    "ordinal": 361,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20032,
    "category": "communication",
    "prompt": "상대의 말이 끝났는지 헷갈릴 때 어떻게 하나요?",
    "samples": [
      "잠깐 기다렸다가 제 이야기를 해요.",
      "더 할 말이 있는지 가볍게 물어요.",
      "맞장구를 치며 반응을 살펴봐요."
    ],
    "ordinal": 373,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20033,
    "category": "communication",
    "prompt": "단체 대화방에서 내 질문에 답이 없으면 어떻게 하나요?",
    "samples": [
      "필요한 때가 되면 다시 질문해요.",
      "답할 만한 사람에게 따로 연락해요.",
      "조금 더 기다리며 다른 대화를 봐요."
    ],
    "ordinal": 385,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20034,
    "category": "communication",
    "prompt": "친구에게 좋은 소식을 전할 때 어떻게 시작하나요?",
    "samples": [
      "좋은 일이 생겼다고 바로 말해요.",
      "어떻게 된 일인지 처음부터 들려줘요.",
      "힌트를 주며 친구 반응을 기다려요."
    ],
    "ordinal": 397,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20035,
    "category": "communication",
    "prompt": "친구에게 아쉬운 소식을 전할 때 어떤 말을 먼저 하나요?",
    "samples": [
      "결과를 먼저 짧게 알려 줘요.",
      "어떤 일이 있었는지 먼저 설명해요.",
      "지금 이야기해도 되는지 물어봐요."
    ],
    "ordinal": 409,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20036,
    "category": "communication",
    "prompt": "새로운 모임에서 자기소개를 할 때 무엇부터 말하나요?",
    "samples": [
      "요즘 관심 있는 일을 먼저 이야기해요.",
      "평소 하는 일과 생활을 먼저 말해요.",
      "지금 모임에 오게 된 이유를 말해요."
    ],
    "ordinal": 421,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20037,
    "category": "communication",
    "prompt": "서로 모르는 두 친구를 소개할 때 어떤 이야기를 먼저 하나요?",
    "samples": [
      "두 사람의 공통 관심사를 꺼내요.",
      "각자 어떤 친구인지 짧게 소개해요.",
      "함께 답할 수 있는 질문을 던져요."
    ],
    "ordinal": 433,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20038,
    "category": "communication",
    "prompt": "내 이야기에 상대가 다른 경험을 꺼내면 어떻게 반응하나요?",
    "samples": [
      "상대 경험을 더 자세히 물어봐요.",
      "제 이야기와 비슷한 부분을 말해요.",
      "상대 이야기를 듣고 제 얘기를 이어 가요."
    ],
    "ordinal": 445,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20039,
    "category": "communication",
    "prompt": "친구가 말보다 표정으로 반응하면 어떻게 이해하나요?",
    "samples": [
      "어떤 생각인지 직접 물어봐요.",
      "말투와 상황을 함께 보며 짐작해요.",
      "조금 더 이야기하면서 반응을 봐요."
    ],
    "ordinal": 457,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20040,
    "category": "communication",
    "prompt": "처음 만난 사람에게 궁금한 점이 생기면 어떻게 물어보나요?",
    "samples": [
      "지금 나눈 이야기와 연결해서 물어요.",
      "제 경험을 먼저 말하고 질문해요.",
      "궁금한 내용을 바로 편하게 물어요."
    ],
    "ordinal": 469,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20041,
    "category": "communication",
    "prompt": "대화 중 내가 말이 길어졌다고 느끼면 어떻게 하나요?",
    "samples": [
      "핵심만 정리하고 상대에게 질문해요.",
      "어디까지 들었는지 반응을 살펴봐요.",
      "이어서 말해도 괜찮은지 물어봐요."
    ],
    "ordinal": 481,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20042,
    "category": "communication",
    "prompt": "문자에서 감정을 전할 때 어떤 표현을 자주 쓰나요?",
    "samples": [
      "느낌을 문장으로 분명하게 적어요.",
      "이모티콘을 함께 보내는 편이에요.",
      "느낌표나 물음표로 말투를 살려 써요."
    ],
    "ordinal": 493,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20043,
    "category": "communication",
    "prompt": "가볍게 시작한 대화가 진지해지면 어떻게 반응하나요?",
    "samples": [
      "제 생각도 진지하게 이야기해요.",
      "상대가 어떤 얘기를 원하는지 물어요.",
      "일단 듣고 천천히 제 얘기를 꺼내요."
    ],
    "ordinal": 505,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20044,
    "category": "communication",
    "prompt": "다툰 뒤 다시 대화를 시작할 때 어떤 말을 하나요?",
    "samples": [
      "아까 제 마음이 어땠는지 말해요.",
      "상대는 어떻게 느꼈는지 먼저 물어요.",
      "차분히 다시 이야기하자고 제안해요."
    ],
    "ordinal": 517,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20045,
    "category": "communication",
    "prompt": "잘못 전달한 정보를 뒤늦게 알게 되면 어떻게 알리나요?",
    "samples": [
      "어떤 부분이 달랐는지 바로 알려 줘요.",
      "확인한 내용과 함께 정정해요.",
      "영향받는 사람에게 먼저 따로 말해요."
    ],
    "ordinal": 529,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20046,
    "category": "communication",
    "prompt": "내 생각을 글로 쓸 때 어느 정도 설명을 덧붙이나요?",
    "samples": [
      "이유와 예시까지 자세히 적어요.",
      "핵심만 적고 질문이 오면 설명해요.",
      "상대가 아는 내용은 빼고 적어요."
    ],
    "ordinal": 541,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20047,
    "category": "communication",
    "prompt": "친구가 고민에 대한 답을 재촉하면 어떻게 말하나요?",
    "samples": [
      "더 생각할 시간이 필요하다고 말해요.",
      "지금 떠오르는 생각부터 전해요.",
      "어떤 결정을 고민하는지 다시 물어요."
    ],
    "ordinal": 553,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20048,
    "category": "communication",
    "prompt": "상대가 내 말에 동의할 때 보통 어떻게 이어 가나요?",
    "samples": [
      "동의한 이유가 궁금해서 더 물어봐요.",
      "제 생각을 조금 더 자세히 말해요.",
      "다음 주제로 자연스럽게 넘어가요."
    ],
    "ordinal": 565,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20049,
    "category": "communication",
    "prompt": "전화할 용건이 여러 개면 어떻게 이야기하나요?",
    "samples": [
      "중요한 용건부터 차례로 말해요.",
      "용건을 먼저 모두 알려 주고 시작해요.",
      "안부를 나눈 뒤 하나씩 꺼내요."
    ],
    "ordinal": 577,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20050,
    "category": "communication",
    "prompt": "친구가 장난인지 진심인지 모를 말을 하면 어떻게 하나요?",
    "samples": [
      "진심으로 한 말인지 직접 물어봐요.",
      "농담으로 답하며 반응을 살펴봐요.",
      "나중에 둘이 있을 때 다시 물어봐요."
    ],
    "ordinal": 589,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20051,
    "category": "communication",
    "prompt": "내 경험과 다른 조언을 들으면 어떻게 답하나요?",
    "samples": [
      "제 상황에 맞는 부분을 더 물어봐요.",
      "다르게 느끼는 이유를 이야기해요.",
      "일단 듣고 혼자 생각해 봐요."
    ],
    "ordinal": 601,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20052,
    "category": "communication",
    "prompt": "상대가 설명을 반복해도 이해가 안 되면 어떻게 하나요?",
    "samples": [
      "어느 부분부터 모르겠는지 말해요.",
      "다른 예로 설명해 달라고 부탁해요.",
      "제가 이해한 내용을 먼저 정리해요."
    ],
    "ordinal": 613,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20053,
    "category": "communication",
    "prompt": "대화 도중 갑자기 떠오른 질문은 어떻게 꺼내나요?",
    "samples": [
      "잊기 전에 짧게 끼어들어 물어요.",
      "상대의 이야기가 끝날 때까지 기다려요.",
      "메모해 두었다가 나중에 물어요."
    ],
    "ordinal": 625,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20054,
    "category": "communication",
    "prompt": "누군가 내 말을 대신 설명하면 어떻게 반응하나요?",
    "samples": [
      "빠진 내용이 있으면 덧붙여요.",
      "상대 설명을 듣고 맞는지 알려 줘요.",
      "제 말로 다시 설명해 보겠다고 해요."
    ],
    "ordinal": 637,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20055,
    "category": "communication",
    "prompt": "친구의 긴 이야기를 들을 때 어떻게 반응하나요?",
    "samples": [
      "기억에 남은 부분을 짚어서 말해요.",
      "중간중간 질문하며 듣는 편이에요.",
      "표정과 짧은 맞장구로 반응해요."
    ],
    "ordinal": 649,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20056,
    "category": "communication",
    "prompt": "대화를 마무리해야 할 때 어떤 식으로 인사하나요?",
    "samples": [
      "가야 할 시간이 됐다고 바로 말해요.",
      "오늘 이야기 중 좋았던 부분을 말해요.",
      "다음에 이어서 이야기하자고 해요."
    ],
    "ordinal": 661,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20057,
    "category": "communication",
    "prompt": "서로 말이 겹쳤을 때 보통 어떤 반응을 하나요?",
    "samples": [
      "상대에게 먼저 말하라고 해요.",
      "제 말을 짧게 마치고 차례를 넘겨요.",
      "웃으며 누구부터 말할지 정해요."
    ],
    "ordinal": 673,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20058,
    "category": "communication",
    "prompt": "상대가 내 질문을 피하는 것 같으면 어떻게 하나요?",
    "samples": [
      "다른 방식으로 한 번 더 물어봐요.",
      "답하기 어려운 질문인지 확인해요.",
      "다른 주제로 자연스럽게 넘어가요."
    ],
    "ordinal": 685,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20059,
    "category": "communication",
    "prompt": "내가 부탁한 내용이 다르게 전달되면 어떻게 말하나요?",
    "samples": [
      "원했던 내용을 구체적으로 다시 말해요.",
      "어디서 다르게 이해했는지 확인해요.",
      "예시를 보여 주며 부탁을 정리해요."
    ],
    "ordinal": 697,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20060,
    "category": "communication",
    "prompt": "새로운 사람과 대화한 뒤 무엇이 가장 오래 기억나나요?",
    "samples": [
      "그 사람이 어떤 이야기를 했는지 남아요.",
      "말투와 표정이 오래 기억에 남아요.",
      "제가 어떤 기분이었는지가 남아요."
    ],
    "ordinal": 709,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20061,
    "category": "communication",
    "prompt": "상대에게 어려운 이야기를 꺼내기 전 무엇을 준비하나요?",
    "samples": [
      "전하고 싶은 핵심을 미리 정리해요.",
      "조용히 이야기할 시간을 먼저 잡아요.",
      "상대가 할 말을 떠올려 보는 편이에요."
    ],
    "ordinal": 721,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20062,
    "category": "social_energy",
    "prompt": "처음 가는 모임에 아는 사람이 없으면 어떻게 하나요?",
    "samples": [
      "가까이 있는 사람에게 먼저 인사해요.",
      "주변 분위기를 살피며 자리를 잡아요.",
      "진행하는 사람에게 말을 걸어 봐요."
    ],
    "ordinal": 4,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20063,
    "category": "social_energy",
    "prompt": "사람들과 하루 종일 어울린 뒤에는 어떻게 쉬고 싶나요?",
    "samples": [
      "집에서 혼자 조용히 쉬고 싶어요.",
      "편한 사람 한 명과 더 이야기하고 싶어요.",
      "재미있었다면 모임을 조금 더 이어 가요."
    ],
    "ordinal": 16,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20064,
    "category": "social_energy",
    "prompt": "모임에 함께 간 친구가 다른 사람들과 이야기하면 어떻게 하나요?",
    "samples": [
      "다른 사람에게 먼저 말을 걸어 봐요.",
      "친구 옆에서 이야기를 함께 들어요.",
      "잠깐 혼자 쉬면서 주변을 둘러봐요."
    ],
    "ordinal": 28,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20065,
    "category": "social_energy",
    "prompt": "친구들과 헤어지려는데 더 놀자고 하면 어떻게 하나요?",
    "samples": [
      "재미있으면 바로 다음 장소로 가요.",
      "남은 기운을 보고 참여를 정해요.",
      "원래 정한 시간에 맞춰 집으로 가요."
    ],
    "ordinal": 40,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20066,
    "category": "social_energy",
    "prompt": "주말에 아무 약속이 없으면 어떻게 시간을 보내나요?",
    "samples": [
      "먼저 연락해서 만날 사람을 찾아요.",
      "연락이 오면 그때 약속을 잡아요.",
      "혼자 지내며 필요한 연락만 주고받아요."
    ],
    "ordinal": 52,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20067,
    "category": "social_energy",
    "prompt": "점심을 함께 먹을 사람이 정해지지 않으면 어떻게 하나요?",
    "samples": [
      "주변 사람에게 같이 먹자고 물어봐요.",
      "혼자 먹으며 쉬는 시간을 가져요.",
      "누가 함께 먹는지 보고 합류해요."
    ],
    "ordinal": 64,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20068,
    "category": "social_energy",
    "prompt": "새 동호회에 처음 나갈 때 무엇이 가장 신경 쓰이나요?",
    "samples": [
      "어떤 사람들을 만나게 될지 궁금해요.",
      "자연스럽게 어울릴 수 있을지 생각해요.",
      "활동에 집중할 시간이 충분한지 봐요."
    ],
    "ordinal": 76,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20069,
    "category": "social_energy",
    "prompt": "여러 무리가 따로 대화하는 모임에서는 어떻게 움직이나요?",
    "samples": [
      "여러 무리를 옮겨 다니며 이야기해요.",
      "대화가 잘 맞는 사람들 곁에 머물러요.",
      "활동을 하다가 자연스럽게 합류해요."
    ],
    "ordinal": 88,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20070,
    "category": "social_energy",
    "prompt": "친구를 여럿 만날 때 어떤 순간에 가장 편안한가요?",
    "samples": [
      "모두 함께 웃고 떠들 때 편안해요.",
      "한 사람과 깊게 이야기할 때 편안해요.",
      "말없이 같은 활동을 할 때 편안해요."
    ],
    "ordinal": 100,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20071,
    "category": "social_energy",
    "prompt": "친구가 새 사람을 모임에 데려오면 어떻게 가까워지나요?",
    "samples": [
      "바로 질문을 하며 대화를 시작해요.",
      "함께 활동하면서 조금씩 알아 가요.",
      "친구가 소개해 주는 이야기를 들어요."
    ],
    "ordinal": 112,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20072,
    "category": "social_energy",
    "prompt": "친구들이 두 무리로 나뉘어 놀면 어느 쪽에 합류하나요?",
    "samples": [
      "더 활발하게 노는 쪽으로 가요.",
      "조용히 이야기하는 쪽에 머물러요.",
      "양쪽을 오가며 함께 어울려요."
    ],
    "ordinal": 124,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20073,
    "category": "social_energy",
    "prompt": "집에 친구들을 초대한다면 몇 명을 부르고 싶나요?",
    "samples": [
      "여럿을 불러 북적이게 보내고 싶어요.",
      "두세 명과 편하게 이야기하고 싶어요.",
      "한 명과 여유롭게 시간을 보내고 싶어요."
    ],
    "ordinal": 136,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20074,
    "category": "social_energy",
    "prompt": "단체 음성 대화가 열려 있으면 어떻게 참여하나요?",
    "samples": [
      "바로 들어가서 인사를 건네요.",
      "누가 있는지 보고 참여를 정해요.",
      "듣고 싶을 때 잠깐씩 들어가요."
    ],
    "ordinal": 148,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20075,
    "category": "social_energy",
    "prompt": "사람이 많은 행사에서 쉬는 시간이 생기면 어떻게 보내나요?",
    "samples": [
      "새로 만난 사람과 이야기를 나눠요.",
      "조용한 곳을 찾아 잠깐 혼자 있어요.",
      "함께 온 사람 옆에서 쉬는 편이에요."
    ],
    "ordinal": 160,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20076,
    "category": "social_energy",
    "prompt": "가고 싶은 행사에 혼자 가게 되면 어떻게 즐기나요?",
    "samples": [
      "옆 사람과 감상을 나누며 즐겨요.",
      "혼자 보고 싶은 것에 집중해요.",
      "현장에서 같이 다닐 사람을 찾아요."
    ],
    "ordinal": 172,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20077,
    "category": "social_energy",
    "prompt": "버스나 기차를 기다리는데 낯선 사람이 말을 걸면 어떻게 반응하나요?",
    "samples": [
      "저도 질문하며 대화를 이어 가요.",
      "짧게 답하고 편하게 미소를 지어요.",
      "흥미로운 이야기면 오래 나눠요."
    ],
    "ordinal": 184,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20078,
    "category": "social_energy",
    "prompt": "같은 수업을 듣는 사람들과는 어떻게 친해지는 편인가요?",
    "samples": [
      "수업 전후에 먼저 인사를 건네요.",
      "함께 하는 활동이 생기면 가까워져요.",
      "상대가 말을 걸면 조금씩 친해져요."
    ],
    "ordinal": 196,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20079,
    "category": "social_energy",
    "prompt": "모임에서 잠시 혼자 있고 싶어지면 어떻게 하나요?",
    "samples": [
      "바람을 쐬고 오겠다고 잠깐 나가요.",
      "조용한 자리에 앉아서 쉬어요.",
      "친한 사람에게만 잠깐 이야기해요."
    ],
    "ordinal": 208,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20080,
    "category": "social_energy",
    "prompt": "아는 사람이 적은 모임에 초대받으면 무엇을 먼저 생각하나요?",
    "samples": [
      "새로 만날 사람들을 기대해요.",
      "함께 갈 친구가 있는지 생각해요.",
      "어떤 활동을 하는 모임인지 살펴봐요."
    ],
    "ordinal": 220,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20081,
    "category": "social_energy",
    "prompt": "주말 이틀 연속으로 사람을 만날 때 어떻게 쉬나요?",
    "samples": [
      "모임 사이에 혼자 있을 시간을 비워요.",
      "짧은 만남을 여러 번 잡는 편이에요.",
      "마음 편한 사람들과 계속 어울려요."
    ],
    "ordinal": 232,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20082,
    "category": "social_energy",
    "prompt": "혼자 하는 작업이 길어지면 사람들과 어떻게 어울리나요?",
    "samples": [
      "잠깐 통화하면서 기분을 바꿔요.",
      "같은 공간에서 각자 일할 사람을 찾아요.",
      "일을 마친 뒤에 연락을 확인해요."
    ],
    "ordinal": 244,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20083,
    "category": "social_energy",
    "prompt": "혼자 즐기던 취미를 모임에서 함께 하면 무엇이 달라지나요?",
    "samples": [
      "다른 사람의 반응이 있어서 더 신나요.",
      "제 속도대로 하기 어려운 점이 있어요.",
      "새로운 방법을 알게 되는 게 좋아요."
    ],
    "ordinal": 256,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20084,
    "category": "social_energy",
    "prompt": "한 번 만난 사람과 다시 만나고 싶으면 어떻게 하나요?",
    "samples": [
      "다음에 함께 할 일을 바로 제안해요.",
      "연락을 조금 더 나눈 뒤 약속해요.",
      "다음 모임에서 다시 볼 기회를 기다려요."
    ],
    "ordinal": 268,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20085,
    "category": "social_energy",
    "prompt": "매주 같은 사람들을 만나는 모임은 어떤 느낌인가요?",
    "samples": [
      "먼저 설명하지 않아도 통하는 게 좋아요.",
      "매번 만날 약속을 따로 안 잡아도 돼요.",
      "익숙해지면 새로운 사람도 만나고 싶어요."
    ],
    "ordinal": 280,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20086,
    "category": "social_energy",
    "prompt": "친구들과 며칠 여행할 때 혼자만의 시간은 어떻게 가지나요?",
    "samples": [
      "하루 중 잠깐은 따로 산책하고 싶어요.",
      "각자 쉬는 시간을 함께 정하고 싶어요.",
      "친구들과 계속 붙어 있어도 괜찮아요."
    ],
    "ordinal": 292,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20087,
    "category": "social_energy",
    "prompt": "모임을 마치고 집에 갈 때 주로 어떤 기분이 드나요?",
    "samples": [
      "더 이야기하고 싶어 아쉬운 편이에요.",
      "즐거웠지만 조용히 쉬고 싶어져요.",
      "그날 누구를 만났는지에 따라 달라요."
    ],
    "ordinal": 304,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20088,
    "category": "social_energy",
    "prompt": "모임 장소에 가장 먼저 도착하면 어떻게 기다리나요?",
    "samples": [
      "직원에게 인사하며 가벼운 이야기를 나눠요.",
      "혼자 주변을 둘러보며 기다려요.",
      "오는 친구들에게 연락을 해 봐요."
    ],
    "ordinal": 316,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20089,
    "category": "social_energy",
    "prompt": "모임에서 짧은 자기소개를 부탁받으면 어떻게 느끼나요?",
    "samples": [
      "저를 알릴 수 있어서 반가운 편이에요.",
      "어떤 말을 할지 잠깐 생각하게 돼요.",
      "짧게 끝내고 다른 사람 얘기를 듣고 싶어요."
    ],
    "ordinal": 328,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20090,
    "category": "social_energy",
    "prompt": "처음 함께 일하게 된 사람과 쉬는 시간이 겹치면 어떻게 하나요?",
    "samples": [
      "가벼운 안부부터 먼저 물어봐요.",
      "옆에서 쉬다가 눈이 마주치면 인사해요.",
      "둘 다 쉬기 편하게 각자 시간을 보내요."
    ],
    "ordinal": 340,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20091,
    "category": "social_energy",
    "prompt": "관심 있는 온라인 모임에 들어가면 처음에 무엇을 하나요?",
    "samples": [
      "소개 글을 올리고 인사를 나눠요.",
      "올라온 글을 읽으며 분위기를 익혀요.",
      "흥미로운 글에 댓글부터 달아 봐요."
    ],
    "ordinal": 352,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20092,
    "category": "social_energy",
    "prompt": "여러 친구와 연락이 뜸해지면 어떻게 관계를 이어 가나요?",
    "samples": [
      "생각나는 친구들에게 먼저 안부를 물어요.",
      "함께 만나는 자리를 한 번 잡아요.",
      "각자 여유가 생길 때 자연스럽게 연락해요."
    ],
    "ordinal": 364,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20093,
    "category": "social_energy",
    "prompt": "친구들과 만날 때 몇 명씩 모이는 게 편한가요?",
    "samples": [
      "여러 친구가 한 번에 모이는 게 편해요.",
      "두세 명씩 나누어 만나는 게 편해요.",
      "할 활동에 맞춰 인원을 정하는 게 편해요."
    ],
    "ordinal": 376,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20094,
    "category": "social_energy",
    "prompt": "모임에서 게임 참가자를 찾으면 어떻게 참여하나요?",
    "samples": [
      "먼저 손을 들어서 해 보겠다고 해요.",
      "다른 사람들이 하는 걸 본 뒤 참여해요.",
      "친구와 함께 할 수 있으면 나서요."
    ],
    "ordinal": 388,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20095,
    "category": "social_energy",
    "prompt": "모두의 관심이 갑자기 나에게 쏠리면 어떻게 반응하나요?",
    "samples": [
      "그 분위기를 즐기며 이야기를 해요.",
      "짧게 반응하고 관심을 다른 데로 넘겨요.",
      "친한 사람이 곁에 있으면 편하게 받아요."
    ],
    "ordinal": 400,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20096,
    "category": "social_energy",
    "prompt": "내 생일에 사람들을 만난다면 어떻게 시간을 보내고 싶나요?",
    "samples": [
      "여러 사람과 함께 축하를 나누고 싶어요.",
      "가까운 몇 명과 오래 이야기하고 싶어요.",
      "따로따로 짧게 만나는 게 편해요."
    ],
    "ordinal": 412,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20097,
    "category": "social_energy",
    "prompt": "공연장에서 관객이 함께 참여할 때 어떻게 즐기나요?",
    "samples": [
      "주변 사람들과 크게 호응하며 즐겨요.",
      "제 자리에서 조용히 감상하는 편이에요.",
      "익숙해지면 조금씩 함께 참여해요."
    ],
    "ordinal": 424,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20098,
    "category": "social_energy",
    "prompt": "사람이 많은 곳에 오래 있다가 집에 오면 무엇부터 하나요?",
    "samples": [
      "누군가에게 오늘 일을 이야기해요.",
      "잠시 연락을 끊고 혼자 쉬어요.",
      "함께 다녀온 사람에게 사진을 보내요."
    ],
    "ordinal": 436,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20099,
    "category": "social_energy",
    "prompt": "며칠 동안 혼자 지내면 사람들을 어떻게 만나고 싶어지나요?",
    "samples": [
      "활기찬 모임을 찾아서 나가고 싶어요.",
      "편한 친구 한 명을 만나고 싶어요.",
      "온라인으로 가볍게 안부만 나누고 싶어요."
    ],
    "ordinal": 448,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20100,
    "category": "social_energy",
    "prompt": "새 동네에 이사한 뒤에는 사람들과 어떻게 어울리며 지내나요?",
    "samples": [
      "동네 모임이나 수업에 참여해요.",
      "자주 마주치는 사람부터 인사해요.",
      "원래 알던 사람들과 연락을 이어 가요."
    ],
    "ordinal": 460,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20101,
    "category": "social_energy",
    "prompt": "오래된 친구의 다른 친구들을 만나면 어떻게 어울리나요?",
    "samples": [
      "각자 어떤 사람인지 질문하며 알아 가요.",
      "오래된 친구와의 공통 이야기를 꺼내요.",
      "함께 하는 활동에 먼저 참여해요."
    ],
    "ordinal": 472,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20102,
    "category": "social_energy",
    "prompt": "한 번 인사한 사람을 다시 만나면 어떻게 다가가나요?",
    "samples": [
      "지난번 이야기를 꺼내며 먼저 인사해요.",
      "눈이 마주치면 자연스럽게 웃어요.",
      "상대가 기억하는지 반응을 살펴봐요."
    ],
    "ordinal": 484,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20103,
    "category": "social_energy",
    "prompt": "친구들과 단체 게임을 할 때 어떻게 참여하는 편인가요?",
    "samples": [
      "분위기를 띄우며 적극적으로 참여해요.",
      "규칙을 살피고 차분하게 즐겨요.",
      "친한 친구와 함께 움직이는 편이에요."
    ],
    "ordinal": 496,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20104,
    "category": "social_energy",
    "prompt": "행사에서 즉석 참여를 권하면 무엇을 생각하나요?",
    "samples": [
      "재미있을 것 같으면 바로 해 봐요.",
      "어떤 활동인지 먼저 살펴봐요.",
      "아는 사람과 같이 할 수 있는지 봐요."
    ],
    "ordinal": 508,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20105,
    "category": "social_energy",
    "prompt": "친구와 둘이 보기로 했는데 다른 사람이 합류하면 어떻게 하나요?",
    "samples": [
      "새로 온 사람도 함께 알아 가고 싶어요.",
      "둘이 할 이야기는 다음으로 미뤄요.",
      "예정된 시간만 보내고 먼저 돌아가요."
    ],
    "ordinal": 520,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20106,
    "category": "social_energy",
    "prompt": "모임에서 대화가 잘 통하는 사람을 만나면 어떻게 하나요?",
    "samples": [
      "그 사람과 오래 이야기를 나누고 싶어요.",
      "다른 사람들도 대화에 함께 끌어들여요.",
      "연락처를 나누고 모임은 계속 둘러봐요."
    ],
    "ordinal": 532,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20107,
    "category": "social_energy",
    "prompt": "정기 모임에서 쉬는 시간이 나면 누구와 시간을 보내나요?",
    "samples": [
      "아직 이야기 못 한 사람에게 다가가요.",
      "늘 편하게 이야기하는 사람을 찾아요.",
      "잠깐 혼자 쉬었다가 다시 합류해요."
    ],
    "ordinal": 544,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20108,
    "category": "social_energy",
    "prompt": "온라인에서 친해진 사람을 처음 만날 때 어떤 기분인가요?",
    "samples": [
      "실제로 더 많이 이야기할 생각에 설레요.",
      "얼마나 편하게 말할 수 있을지 궁금해요.",
      "온라인과 다른 모습을 천천히 알고 싶어요."
    ],
    "ordinal": 556,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20109,
    "category": "social_energy",
    "prompt": "오랜만의 동창 모임에서는 누구와 먼저 이야기하나요?",
    "samples": [
      "예전에 가까웠던 친구부터 찾아요.",
      "달라진 모습이 궁금한 친구에게 가요.",
      "가까운 자리에 있는 사람과 시작해요."
    ],
    "ordinal": 568,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20110,
    "category": "social_energy",
    "prompt": "새로 알게 된 사람과 공통 관심사를 찾으면 어떻게 하나요?",
    "samples": [
      "관련된 이야기를 길게 나누고 싶어요.",
      "함께 해 볼 활동을 제안하고 싶어요.",
      "다음에 연락할 계기로 남겨 둬요."
    ],
    "ordinal": 580,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20111,
    "category": "social_energy",
    "prompt": "모임은 즐겁지만 기운이 떨어지면 어떻게 시간을 보내나요?",
    "samples": [
      "잠깐 쉬고 나서 다시 참여해요.",
      "조용히 듣는 쪽으로 바꿔서 머물러요.",
      "즐거웠다고 인사하고 먼저 돌아가요."
    ],
    "ordinal": 592,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20112,
    "category": "social_energy",
    "prompt": "친구들의 분위기가 평소보다 들떠 있으면 어떻게 어울리나요?",
    "samples": [
      "저도 덩달아 활발하게 어울려요.",
      "제 속도로 즐기며 곁에 있어요.",
      "차분한 친구와 따로 이야기를 나눠요."
    ],
    "ordinal": 604,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20113,
    "category": "social_energy",
    "prompt": "여럿이 앉는 자리에서 어떤 자리를 고르는 편인가요?",
    "samples": [
      "모두와 이야기하기 쉬운 가운데 앉아요.",
      "친한 사람 옆에 자리를 잡아요.",
      "조용히 듣기 편한 끝자리를 골라요."
    ],
    "ordinal": 616,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20114,
    "category": "social_energy",
    "prompt": "친구와 함께 있는데 대화가 잠시 끊기면 어떻게 느끼나요?",
    "samples": [
      "말없이 함께 있어도 편안한 편이에요.",
      "새로운 이야깃거리를 찾고 싶어져요.",
      "같이 할 활동을 하나 제안하고 싶어요."
    ],
    "ordinal": 628,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20115,
    "category": "social_energy",
    "prompt": "친구와 퇴근길이 같을 때 어떻게 시간을 보내고 싶나요?",
    "samples": [
      "하루 있었던 일을 나누며 가고 싶어요.",
      "함께 가면서도 조용히 쉬고 싶어요.",
      "그날 기분에 따라 따로 가기도 해요."
    ],
    "ordinal": 640,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20116,
    "category": "social_energy",
    "prompt": "친구와 함께 영상을 볼 때 어떻게 즐기는 편인가요?",
    "samples": [
      "보는 중에 바로 반응을 주고받으며 즐겨요.",
      "다 본 뒤 서로의 생각을 나누는 편이에요.",
      "중간에 말하지 않고 내용에 집중하고 싶어요."
    ],
    "ordinal": 652,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20117,
    "category": "social_energy",
    "prompt": "수업이나 강연이 끝난 뒤 사람들과 어떻게 어울리나요?",
    "samples": [
      "근처에서 더 이야기할 사람을 찾아요.",
      "아는 사람들과 짧게 인사하고 가요.",
      "필요한 연락처만 나누고 돌아가요."
    ],
    "ordinal": 664,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20118,
    "category": "social_energy",
    "prompt": "가까운 친구와 생활 시간이 다르면 어떻게 교류하나요?",
    "samples": [
      "시간을 맞춰 짧게라도 통화해요.",
      "서로 편할 때 읽도록 메시지를 남겨요.",
      "쉴 수 있는 날에 길게 만나고 싶어요."
    ],
    "ordinal": 676,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20119,
    "category": "social_energy",
    "prompt": "사람들과 만난 뒤 다음 약속은 언제 잡고 싶나요?",
    "samples": [
      "기분이 좋을 때 바로 다음 약속을 잡아요.",
      "며칠 쉬고 다시 만나고 싶을 때 잡아요.",
      "할 만한 일이 떠오르면 제안해요."
    ],
    "ordinal": 688,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20120,
    "category": "social_energy",
    "prompt": "처음 참여한 모임이 예상보다 조용하면 어떻게 하나요?",
    "samples": [
      "먼저 가벼운 이야기를 꺼내 봐요.",
      "조용한 분위기에 맞춰 편하게 있어요.",
      "함께 할 수 있는 활동을 찾아봐요."
    ],
    "ordinal": 700,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20121,
    "category": "social_energy",
    "prompt": "혼자 쉬려던 날 반가운 친구가 근처에 오면 어떻게 하나요?",
    "samples": [
      "잠깐이라도 만나러 나가고 싶어요.",
      "쉬는 시간을 보낸 뒤 짧게 만나요.",
      "다른 날 편하게 만나자고 제안해요."
    ],
    "ordinal": 712,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20122,
    "category": "social_energy",
    "prompt": "여럿이 모인 자리에서 소외된 느낌이 들면 어떻게 하나요?",
    "samples": [
      "제가 끼어들 수 있는 주제를 꺼내요.",
      "편한 사람에게 따로 말을 걸어요.",
      "잠깐 쉬며 다시 참여할 때를 봐요."
    ],
    "ordinal": 724,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20123,
    "category": "affection",
    "prompt": "고마운 마음이 들 때 상대에게 어떻게 표현하나요?",
    "samples": [
      "도움이 된 부분을 구체적으로 말해요.",
      "작은 선물이나 간식으로 마음을 전해요.",
      "나중에 필요한 일을 도와주는 편이에요."
    ],
    "ordinal": 7,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20124,
    "category": "affection",
    "prompt": "친구가 오늘 너무 힘들었다고 하면 어떻게 반응하나요?",
    "samples": [
      "어떤 일이 있었는지 먼저 들어 줘요.",
      "함께 쉬거나 산책하자고 제안해요.",
      "지금 무엇이 필요한지 물어봐요."
    ],
    "ordinal": 19,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20125,
    "category": "affection",
    "prompt": "가까운 사람에게 좋은 일이 생기면 어떻게 축하하나요?",
    "samples": [
      "기쁜 마음을 바로 크게 표현해요.",
      "둘이 만날 때 진심을 담아 말해요.",
      "기념할 만한 작은 일을 준비해요."
    ],
    "ordinal": 31,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20126,
    "category": "affection",
    "prompt": "한동안 못 본 사람이 보고 싶어지면 어떻게 하나요?",
    "samples": [
      "보고 싶다고 바로 연락을 보내요.",
      "함께 할 만한 일을 찾아서 제안해요.",
      "예전 사진을 보내며 대화를 시작해요."
    ],
    "ordinal": 43,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20127,
    "category": "affection",
    "prompt": "친구가 고민은 있지만 말하고 싶지 않다고 하면 어떻게 하나요?",
    "samples": [
      "말하고 싶을 때 연락하라고 해요.",
      "다른 이야기를 하며 곁에 있어요.",
      "혼자 쉴 수 있게 시간을 주는 편이에요."
    ],
    "ordinal": 55,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20128,
    "category": "affection",
    "prompt": "지친 날 누군가 챙겨 준다면 어떤 행동이 가장 반가운가요?",
    "samples": [
      "제 이야기를 오래 들어 주면 반가워요.",
      "해야 할 일을 조금 덜어 주면 좋아요.",
      "말없이 함께 쉬어 주면 편안해요."
    ],
    "ordinal": 67,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20129,
    "category": "affection",
    "prompt": "뜻밖에 작은 선물을 받으면 어떻게 반응하나요?",
    "samples": [
      "마음에 드는 점을 바로 이야기해요.",
      "잘 쓰는 모습을 나중에 보여 줘요.",
      "다음에 저도 작은 것을 챙겨 줘요."
    ],
    "ordinal": 79,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20130,
    "category": "affection",
    "prompt": "친한 사람에게 선물을 고를 때 무엇을 먼저 떠올리나요?",
    "samples": [
      "평소 갖고 싶다고 한 것을 떠올려요.",
      "함께한 추억이 떠오르는 것을 찾아요.",
      "일상에서 자주 쓸 만한 것을 생각해요."
    ],
    "ordinal": 91,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20131,
    "category": "affection",
    "prompt": "좋아하는 사람과 함께한 추억은 어떻게 남기는 편인가요?",
    "samples": [
      "사진을 모아 두고 가끔 다시 봐요.",
      "그날 느꼈던 마음을 글로 적어 둬요.",
      "다음에 만났을 때 자주 이야기해요."
    ],
    "ordinal": 103,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20132,
    "category": "affection",
    "prompt": "친구가 자랑스러운 일을 해냈을 때 어떻게 마음을 전하나요?",
    "samples": [
      "어떤 점이 멋졌는지 자세히 말해요.",
      "친구가 괜찮다면 다른 사람에게도 알려요.",
      "둘이 따로 만나 축하해 주고 싶어요."
    ],
    "ordinal": 115,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20133,
    "category": "affection",
    "prompt": "중요한 일을 앞둔 친구를 응원할 때 무엇을 하나요?",
    "samples": [
      "믿고 있다는 말을 먼저 전해요.",
      "준비에 필요한 도움이 있는지 물어요.",
      "방해되지 않게 짧은 메시지를 보내요."
    ],
    "ordinal": 127,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20134,
    "category": "affection",
    "prompt": "친구가 많이 지쳐 보이면 함께 무엇을 하고 싶나요?",
    "samples": [
      "천천히 걸으며 이야기를 듣고 싶어요.",
      "함께 아무것도 하지 않고 편하게 쉬고 싶어요.",
      "평소 좋아하던 활동을 같이 하고 싶어요."
    ],
    "ordinal": 139,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20135,
    "category": "affection",
    "prompt": "가까운 사람이 혼자 있고 싶다고 하면 어떻게 마음을 전하나요?",
    "samples": [
      "필요할 때 곁에 있겠다고 알려 줘요.",
      "짧게 안부만 남기고 기다려요.",
      "다시 연락할 때를 함께 정해 둬요."
    ],
    "ordinal": 151,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20136,
    "category": "affection",
    "prompt": "기분 좋은 일이 생기면 가까운 사람에게 언제 알리나요?",
    "samples": [
      "소식이 생기자마자 바로 알려요.",
      "일이 확실히 마무리된 뒤 이야기해요.",
      "직접 만날 때 표정을 보며 전해요."
    ],
    "ordinal": 163,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20137,
    "category": "affection",
    "prompt": "누군가에게 호감이 생기면 평소와 무엇이 달라지나요?",
    "samples": [
      "먼저 연락하는 일이 많아져요.",
      "상대가 한 작은 말을 잘 기억하게 돼요.",
      "함께 있을 기회를 찾아보게 돼요."
    ],
    "ordinal": 175,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20138,
    "category": "affection",
    "prompt": "좋아하는 마음을 표현할 때 어떤 방법이 편한가요?",
    "samples": [
      "좋아한다는 말을 직접 하는 게 편해요.",
      "자주 챙겨 주는 행동으로 표현해요.",
      "둘만의 시간을 만들어서 전해요."
    ],
    "ordinal": 187,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20139,
    "category": "affection",
    "prompt": "가까운 사람에게 어떤 칭찬을 들으면 오래 기억나나요?",
    "samples": [
      "제가 들인 노력을 알아주는 말이 남아요.",
      "저와 함께해서 편하다는 말이 좋아요.",
      "제 선택을 믿는다는 말이 기억에 남아요."
    ],
    "ordinal": 199,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20140,
    "category": "affection",
    "prompt": "평소 표현이 적던 사람이 다정한 말을 하면 어떻게 반응하나요?",
    "samples": [
      "저도 같은 마음을 말로 전해요.",
      "쑥스럽지만 기쁘다고 솔직하게 말해요.",
      "웃거나 가까이 앉으며 마음을 보여요."
    ],
    "ordinal": 211,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20141,
    "category": "affection",
    "prompt": "전에 했던 말을 누군가 기억해 주면 어떤 기분인가요?",
    "samples": [
      "제게 관심을 기울였다는 생각이 들어요.",
      "저도 그 사람의 이야기를 더 알고 싶어요.",
      "편하게 마음을 나눌 수 있을 것 같아요."
    ],
    "ordinal": 223,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20142,
    "category": "affection",
    "prompt": "새로 친해진 사람에게 마음이 열리는 때는 언제인가요?",
    "samples": [
      "서로 일상 이야기를 자연스럽게 할 때예요.",
      "불편한 점도 편하게 말할 수 있을 때예요.",
      "말없이 함께 있어도 어색하지 않을 때예요."
    ],
    "ordinal": 235,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20143,
    "category": "affection",
    "prompt": "친구가 자신이 잘한 일을 별것 아니라고 하면 어떻게 말하나요?",
    "samples": [
      "제가 본 노력과 변화를 구체적으로 말해요.",
      "친구는 어떻게 느끼는지 먼저 물어봐요.",
      "잘했다고 짧고 분명하게 전해 줘요."
    ],
    "ordinal": 247,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20144,
    "category": "affection",
    "prompt": "오랫동안 노력한 일을 끝냈을 때 어떤 반응을 받고 싶나요?",
    "samples": [
      "그동안 애썼다는 말을 듣고 싶어요.",
      "함께 즐겁게 축하하는 시간을 갖고 싶어요.",
      "결과에 대해 자세히 이야기하고 싶어요."
    ],
    "ordinal": 259,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20145,
    "category": "affection",
    "prompt": "해결하기 어려운 고민을 털어놓을 때 무엇을 바라나요?",
    "samples": [
      "제 말을 끊지 않고 들어 주면 좋겠어요.",
      "생각하지 못한 방법을 알려 주면 좋아요.",
      "제 편에서 마음을 이해해 주면 좋겠어요."
    ],
    "ordinal": 271,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20146,
    "category": "affection",
    "prompt": "친구가 기대한 결과를 얻지 못했을 때 어떻게 곁에 있나요?",
    "samples": [
      "결과보다 친구 마음부터 물어봐요.",
      "함께 다른 일을 하며 쉬자고 해요.",
      "도움이 필요하면 알려 달라고 말해요."
    ],
    "ordinal": 283,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20147,
    "category": "affection",
    "prompt": "작은 성취를 가까운 사람과 나눈다면 어떻게 하고 싶나요?",
    "samples": [
      "짧게 자랑하고 함께 웃고 싶어요.",
      "어떻게 해냈는지 자세히 들려주고 싶어요.",
      "따로 축하 없이 알아주기만 해도 좋아요."
    ],
    "ordinal": 295,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20148,
    "category": "affection",
    "prompt": "친구가 바쁜 시기를 보내면 어떤 방식으로 챙기나요?",
    "samples": [
      "답장 부담 없는 응원 메시지를 보내요.",
      "제가 대신할 수 있는 일을 물어봐요.",
      "바쁜 일이 끝난 뒤 만날 약속을 해요."
    ],
    "ordinal": 307,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20149,
    "category": "affection",
    "prompt": "가까운 사람과 기념일을 보낼 때 무엇이 가장 중요한가요?",
    "samples": [
      "서로 마음을 말로 나누는 시간이 중요해요.",
      "평소와 다른 경험을 함께 하고 싶어요.",
      "일상처럼 편하게 함께 있는 게 좋아요."
    ],
    "ordinal": 319,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20150,
    "category": "affection",
    "prompt": "큰 준비 없이 친구를 축하한다면 무엇을 하고 싶나요?",
    "samples": [
      "짧은 편지를 써서 마음을 전하고 싶어요.",
      "함께 좋아하는 것을 하며 보내고 싶어요.",
      "친구 이야기를 충분히 듣고 싶어요."
    ],
    "ordinal": 331,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20151,
    "category": "affection",
    "prompt": "마음에 꼭 맞지는 않는 선물을 받으면 어떻게 반응하나요?",
    "samples": [
      "저를 생각해 준 마음에 고맙다고 해요.",
      "어떻게 골랐는지 이야기를 듣고 싶어요.",
      "잘 활용할 수 있는 방법을 찾아봐요."
    ],
    "ordinal": 343,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20152,
    "category": "affection",
    "prompt": "가까운 사람이 멀리 살게 되면 어떻게 친밀함을 이어 가나요?",
    "samples": [
      "하루 중 작은 일을 자주 보내요.",
      "시간을 정해 길게 통화하는 편이에요.",
      "다음에 만날 계획을 함께 세워요."
    ],
    "ordinal": 355,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20153,
    "category": "affection",
    "prompt": "친구와 다툰 뒤 화해하면 어떤 시간을 보내고 싶나요?",
    "samples": [
      "서로 마음이 풀렸는지 더 이야기해요.",
      "평소처럼 함께 웃을 일을 하고 싶어요.",
      "조금 쉬었다가 자연스럽게 만나고 싶어요."
    ],
    "ordinal": 367,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20154,
    "category": "affection",
    "prompt": "오랫동안 못 볼 사람과 헤어질 때 어떻게 마음을 전하나요?",
    "samples": [
      "아쉬운 마음을 솔직하게 말해요.",
      "함께한 일 중 좋았던 순간을 말해요.",
      "앞으로 연락할 방법을 이야기해요."
    ],
    "ordinal": 379,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20155,
    "category": "affection",
    "prompt": "친구가 내 응원을 부담스러워하면 어떻게 맞춰 가나요?",
    "samples": [
      "어떤 방식이 편한지 직접 물어봐요.",
      "말로 응원하기보다 조용히 지켜봐요.",
      "평소처럼 지내며 필요할 때 돕고 싶어요."
    ],
    "ordinal": 391,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20156,
    "category": "affection",
    "prompt": "친구와 찍은 사진을 다시 보게 되면 보통 어떻게 하나요?",
    "samples": [
      "친구에게 보내고 그날 이야기를 해요.",
      "잘 나온 사진을 따로 골라 간직해요.",
      "비슷한 추억을 만들 약속을 잡고 싶어요."
    ],
    "ordinal": 403,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20157,
    "category": "affection",
    "prompt": "친구의 중요한 날이 다가오면 어떻게 기억하고 챙기나요?",
    "samples": [
      "미리 날짜를 적어 두고 연락해요.",
      "대화할 때 준비는 어떤지 물어봐요.",
      "끝난 뒤 어땠는지 먼저 물어봐요."
    ],
    "ordinal": 415,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20158,
    "category": "affection",
    "prompt": "가까운 사람이 내게 낯선 취미를 즐기면 어떻게 관심을 보이나요?",
    "samples": [
      "무엇이 재미있는지 이야기를 들어요.",
      "한 번 같이 해 보고 싶다고 말해요.",
      "좋아하는 모습을 지켜보며 응원해요."
    ],
    "ordinal": 427,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20159,
    "category": "affection",
    "prompt": "위로받고 싶을 때 상대에게 어떻게 마음을 알리나요?",
    "samples": [
      "오늘은 이야기를 들어 달라고 말해요.",
      "힘든 일이 있었다는 말부터 꺼내요.",
      "함께 시간을 보내자고 먼저 제안해요."
    ],
    "ordinal": 439,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20160,
    "category": "affection",
    "prompt": "가까운 사람이 나를 믿는다고 느끼는 순간은 언제인가요?",
    "samples": [
      "자기 고민을 편하게 털어놓을 때예요.",
      "제 선택을 존중하며 지켜봐 줄 때예요.",
      "필요할 때 저에게 도움을 청할 때예요."
    ],
    "ordinal": 451,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20161,
    "category": "affection",
    "prompt": "친구와 만날 때 늘 같은 활동을 하면 어떻게 느끼나요?",
    "samples": [
      "익숙해서 더 편안하고 안정돼요.",
      "가끔 새로운 활동을 더하고 싶어요.",
      "무엇을 하든 이야기만 잘 통하면 좋아요."
    ],
    "ordinal": 463,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20162,
    "category": "affection",
    "prompt": "누군가 나를 생각했다며 연락하면 어떻게 답하나요?",
    "samples": [
      "반갑다는 마음을 바로 표현해요.",
      "어떤 순간에 생각났는지 물어봐요.",
      "저도 그 사람을 떠올렸던 일을 말해요."
    ],
    "ordinal": 475,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20163,
    "category": "affection",
    "prompt": "내가 바쁜데 가까운 사람이 도움을 주려 하면 어떻게 하나요?",
    "samples": [
      "구체적으로 필요한 부분을 부탁해요.",
      "마음만으로도 힘이 된다고 말해요.",
      "함께 할 수 있는 작은 일을 찾아요."
    ],
    "ordinal": 487,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20164,
    "category": "affection",
    "prompt": "말로 표현이 적은 사람의 마음은 어떤 행동에서 느끼나요?",
    "samples": [
      "약속을 꾸준히 지켜 줄 때 느껴요.",
      "작은 불편함을 알아서 챙겨 줄 때예요.",
      "제 이야기를 기억해 줄 때 마음이 느껴져요."
    ],
    "ordinal": 499,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20165,
    "category": "affection",
    "prompt": "친한 사람을 오랜만에 만나면 어떻게 반가움을 표현하나요?",
    "samples": [
      "먼저 환하게 인사하고 다가가요.",
      "그동안 궁금했던 안부를 물어봐요.",
      "미리 챙긴 작은 것을 건네고 싶어요."
    ],
    "ordinal": 511,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20166,
    "category": "affection",
    "prompt": "가까운 사람이 하루를 마치고 돌아오면 어떻게 맞이하나요?",
    "samples": [
      "오늘 하루 어땠는지 먼저 물어봐요.",
      "쉬고 난 뒤 이야기할 시간을 줘요.",
      "반갑게 인사하고 함께 쉬고 싶어요."
    ],
    "ordinal": 523,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20167,
    "category": "affection",
    "prompt": "친구가 집에 놀러 오면 무엇을 먼저 신경 쓰나요?",
    "samples": [
      "편하게 쉬고 이야기할 자리를 마련해요.",
      "친구가 좋아할 작은 것을 챙겨 둬요.",
      "함께 할 만한 일을 준비하는 편이에요."
    ],
    "ordinal": 535,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20168,
    "category": "affection",
    "prompt": "멀리 있는 사람에게 일상을 나눌 때 무엇을 보내나요?",
    "samples": [
      "그날 있었던 작은 일을 글로 보내요.",
      "함께 보고 싶은 장면을 사진으로 보내요.",
      "여유가 될 때 목소리로 이야기해요."
    ],
    "ordinal": 547,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20169,
    "category": "affection",
    "prompt": "친구가 사람들 앞에서 축하받는 걸 쑥스러워하면 어떻게 하나요?",
    "samples": [
      "둘이 있을 때 따로 축하해 줘요.",
      "짧게 메시지로 마음을 전해요.",
      "친구가 편한 방식으로 기념하자고 해요."
    ],
    "ordinal": 559,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20170,
    "category": "affection",
    "prompt": "좋아하는 사람과 함께 시간을 낼 때 무엇을 우선하나요?",
    "samples": [
      "서로 집중해서 이야기할 시간을 잡아요.",
      "같이 해 보고 싶던 활동을 골라요.",
      "각자 쉬면서도 함께 있을 수 있게 해요."
    ],
    "ordinal": 571,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20171,
    "category": "affection",
    "prompt": "여럿 앞에서 가까운 사람에게 애정을 표현할 때 어떻게 하나요?",
    "samples": [
      "다정한 말을 자연스럽게 하는 편이에요.",
      "눈을 맞추거나 웃으며 작게 표현해요.",
      "둘이 있을 때 더 편하게 표현해요."
    ],
    "ordinal": 583,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20172,
    "category": "affection",
    "prompt": "반가운 사람을 만났을 때 어떤 인사가 가장 자연스러운가요?",
    "samples": [
      "먼저 손을 흔들며 밝게 인사해요.",
      "가까이 가서 안부를 묻는 편이에요.",
      "서로 편하면 가볍게 안아 주고 싶어요."
    ],
    "ordinal": 595,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20173,
    "category": "affection",
    "prompt": "친한 사람이 응원 메시지를 보내 주면 어떻게 하나요?",
    "samples": [
      "다시 읽을 수 있도록 따로 저장해요.",
      "고마웠던 마음을 나중에 꼭 전해요.",
      "문장보다 그때의 기분을 기억해요."
    ],
    "ordinal": 607,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20174,
    "category": "affection",
    "prompt": "친구가 해 준 작은 배려 중 어떤 것이 오래 남나요?",
    "samples": [
      "제가 불편했던 점을 기억해 준 일이 남아요.",
      "필요할 때 조용히 도와준 일이 기억나요.",
      "제 선택을 편하게 기다려 준 게 남아요."
    ],
    "ordinal": 619,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20175,
    "category": "affection",
    "prompt": "아무 특별한 날이 아니어도 마음을 전하고 싶으면 어떻게 하나요?",
    "samples": [
      "문득 고맙다는 메시지를 보내요.",
      "상대가 좋아할 만한 작은 것을 챙겨요.",
      "함께 보내는 시간을 먼저 제안해요."
    ],
    "ordinal": 631,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20176,
    "category": "affection",
    "prompt": "가까운 사람을 위해 한 일을 상대가 알아주지 못한 것 같으면 어떻게 하나요?",
    "samples": [
      "어떤 마음으로 했는지 이야기해요.",
      "알아주길 바랐다고 솔직하게 말해요.",
      "다른 방식으로 마음을 전해 봐요."
    ],
    "ordinal": 643,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20177,
    "category": "affection",
    "prompt": "상대가 해 준 일을 고맙게 느꼈다는 걸 언제 알려 주나요?",
    "samples": [
      "도움을 받은 순간 바로 알려 줘요.",
      "어떻게 도움이 됐는지 나중에 말해요.",
      "직접 만날 때 다시 한번 전해요."
    ],
    "ordinal": 655,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20178,
    "category": "affection",
    "prompt": "가까운 사람과 떨어져 지낼 때 어떤 연락이 특히 반가운가요?",
    "samples": [
      "별일 없어도 안부를 묻는 연락이 좋아요.",
      "저를 떠올린 이유를 담은 연락이 반가워요.",
      "다음에 만날 약속을 잡는 연락이 좋아요."
    ],
    "ordinal": 667,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20179,
    "category": "affection",
    "prompt": "친구가 평소보다 풀이 죽어 있으면 어떻게 다가가나요?",
    "samples": [
      "오늘 어떤 일이 있었는지 조심히 물어요.",
      "평소처럼 함께 시간을 보내려고 해요.",
      "혼자 있고 싶은지 먼저 확인해요."
    ],
    "ordinal": 679,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20180,
    "category": "affection",
    "prompt": "누군가 내 취향을 기억해 챙겨 주면 어떻게 답하나요?",
    "samples": [
      "기억해 줘서 기쁘다고 바로 말해요.",
      "잘 쓰거나 즐기는 모습을 보여 줘요.",
      "그 사람 취향도 더 알아보고 싶어요."
    ],
    "ordinal": 691,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20181,
    "category": "affection",
    "prompt": "친한 사람이 새로운 도전을 시작하면 어떻게 응원하나요?",
    "samples": [
      "왜 하고 싶은지 관심 있게 들어요.",
      "중간에 어떻게 되고 있는지 물어봐요.",
      "원할 때 도울 수 있다고 알려 줘요."
    ],
    "ordinal": 703,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20182,
    "category": "affection",
    "prompt": "좋아하는 사람과 하루를 보낸 뒤 어떤 말을 남기고 싶나요?",
    "samples": [
      "오늘 함께해서 좋았다고 말하고 싶어요.",
      "기억에 남은 장면을 하나 이야기해요.",
      "다음에 또 하고 싶은 일을 말해요."
    ],
    "ordinal": 715,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20183,
    "category": "affection",
    "prompt": "가까운 사람에게 힘이 되어 줬다고 느끼는 때는 언제인가요?",
    "samples": [
      "제게 말하고 마음이 편해졌다고 할 때예요.",
      "다음에도 편하게 도움을 청할 때예요.",
      "다시 자기 일상을 즐기는 모습을 볼 때예요."
    ],
    "ordinal": 727,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20184,
    "category": "boundaries",
    "prompt": "급한 일이 아닌데 늦은 밤 전화가 오면 어떻게 하나요?",
    "samples": [
      "지금은 쉬는 시간이라고 문자로 알려요.",
      "잠깐 통화하고 길어지면 내일로 미뤄요.",
      "다음 날 여유가 생겼을 때 연락해요."
    ],
    "ordinal": 10,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20185,
    "category": "boundaries",
    "prompt": "친구가 내 사진을 올리기 전에 무엇을 확인해 주면 좋겠나요?",
    "samples": [
      "어떤 사진인지 먼저 보여 주면 좋겠어요.",
      "누가 보는 곳인지 알려 주면 좋아요.",
      "얼굴이 나온 사진만 물어봐 주면 돼요."
    ],
    "ordinal": 22,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20186,
    "category": "boundaries",
    "prompt": "혼자 집중할 시간에 연락이 계속 오면 어떻게 하나요?",
    "samples": [
      "언제 다시 연락할 수 있는지 알려요.",
      "알림을 끄고 마친 뒤 한 번에 답해요.",
      "급한 내용만 확인하고 나중에 답해요."
    ],
    "ordinal": 34,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20187,
    "category": "boundaries",
    "prompt": "가까운 사람이 빠른 답장을 기대하면 어떻게 맞춰 가나요?",
    "samples": [
      "제가 연락하기 편한 시간을 이야기해요.",
      "바쁠 때는 짧게 상황만 알려 줘요.",
      "서로 어느 정도가 편한지 먼저 물어요."
    ],
    "ordinal": 46,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20188,
    "category": "boundaries",
    "prompt": "친구들이 잡은 모임 비용이 부담되면 어떻게 말하나요?",
    "samples": [
      "이번에 쓸 수 있는 예산을 솔직히 말해요.",
      "부담이 적은 다른 방법을 제안해요.",
      "이번에는 빠지고 다음에 보자고 해요."
    ],
    "ordinal": 58,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20189,
    "category": "boundaries",
    "prompt": "아끼는 물건을 빌려 달라는 부탁을 받으면 무엇을 확인하나요?",
    "samples": [
      "어디에 얼마나 쓸 예정인지 물어봐요.",
      "언제 돌려줄 수 있는지 먼저 정해요.",
      "제가 빌려줘도 편한 물건인지 생각해요."
    ],
    "ordinal": 70,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20190,
    "category": "boundaries",
    "prompt": "함께 사는 사람이 내 물건을 말없이 쓰면 어떻게 하나요?",
    "samples": [
      "사용하기 전에 물어봐 달라고 해요.",
      "함께 써도 되는 물건을 따로 정해요.",
      "이번에는 넘기고 다음에 이야기해요."
    ],
    "ordinal": 82,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20191,
    "category": "boundaries",
    "prompt": "내 개인적인 이야기가 다른 사람에게 전해지면 어떻게 말하나요?",
    "samples": [
      "어디까지 이야기해도 되는지 알려 줘요.",
      "전해진 내용을 먼저 확인해 봐요.",
      "그 이야기는 둘만 알고 싶었다고 말해요."
    ],
    "ordinal": 94,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20192,
    "category": "boundaries",
    "prompt": "친구가 부르는 별명이 불편하면 어떻게 알려 주나요?",
    "samples": [
      "그 별명은 불편하다고 바로 말해요.",
      "대신 불러 줬으면 하는 이름을 말해요.",
      "둘이 있을 때 조용히 이야기해요."
    ],
    "ordinal": 106,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20193,
    "category": "boundaries",
    "prompt": "부탁하지 않은 조언을 계속 들으면 어떻게 반응하나요?",
    "samples": [
      "지금은 들어 주기만 하면 좋겠다고 해요.",
      "도움이 필요한 부분을 구체적으로 말해요.",
      "고맙다고 하고 제 방식대로 해 보겠다고 해요."
    ],
    "ordinal": 118,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20194,
    "category": "boundaries",
    "prompt": "이미 할 일이 많은데 새 부탁을 받으면 어떻게 답하나요?",
    "samples": [
      "지금은 맡기 어렵다고 분명하게 말해요.",
      "도울 수 있는 부분까지만 제안해요.",
      "언제까지 필요한지 듣고 조정해 봐요."
    ],
    "ordinal": 130,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20195,
    "category": "boundaries",
    "prompt": "친구가 연락 없이 집 앞에 왔다고 하면 어떻게 하나요?",
    "samples": [
      "지금 만날 수 있는지 상황부터 살펴봐요.",
      "다음에는 미리 연락해 달라고 말해요.",
      "집 대신 밖에서 잠깐 만날지 정해요."
    ],
    "ordinal": 142,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20196,
    "category": "boundaries",
    "prompt": "정해 둔 귀가 시간이 됐는데 친구가 더 있자고 하면 어떻게 하나요?",
    "samples": [
      "오늘은 정한 시간에 가겠다고 말해요.",
      "얼마나 더 있을지 정하고 잠깐 남아요.",
      "다음에 오래 만나자고 하고 인사해요."
    ],
    "ordinal": 154,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20197,
    "category": "boundaries",
    "prompt": "단체 대화방의 알림이 너무 많으면 어떻게 관리하나요?",
    "samples": [
      "알림을 끄고 정한 때에 읽어요.",
      "중요한 내용은 따로 알려 달라고 해요.",
      "제가 참여할 대화만 골라서 봐요."
    ],
    "ordinal": 166,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20198,
    "category": "boundaries",
    "prompt": "친하지 않은 사람이 개인적인 질문을 하면 어디까지 답하나요?",
    "samples": [
      "편하게 말할 수 있는 범위만 답해요.",
      "왜 궁금한지 먼저 물어봐요.",
      "그 이야기는 나중에 하자고 넘겨요."
    ],
    "ordinal": 178,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20199,
    "category": "boundaries",
    "prompt": "어려운 대화를 잠시 멈추고 싶으면 어떻게 말하나요?",
    "samples": [
      "생각할 시간이 필요하다고 바로 말해요.",
      "다시 이야기할 시간을 정하자고 해요.",
      "핵심만 확인하고 나머지는 미뤄요."
    ],
    "ordinal": 190,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20200,
    "category": "boundaries",
    "prompt": "일을 마친 뒤 업무 연락이 오면 어떻게 답하나요?",
    "samples": [
      "급한 내용인지 먼저 확인해요.",
      "다음 근무 시간에 답하겠다고 알려요.",
      "짧게 확인 가능한 내용만 답해요."
    ],
    "ordinal": 202,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20201,
    "category": "boundaries",
    "prompt": "집중해서 일할 때 친구가 계속 대화를 걸면 어떻게 하나요?",
    "samples": [
      "끝나고 이야기할 시간을 먼저 말해요.",
      "지금은 집중하고 싶다고 알려 줘요.",
      "잠깐 쉬면서 짧게 이야기하고 돌아와요."
    ],
    "ordinal": 214,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20202,
    "category": "boundaries",
    "prompt": "친구들이 모임 준비를 자꾸 내게 맡기면 어떻게 하나요?",
    "samples": [
      "이번에는 역할을 나누자고 제안해요.",
      "제가 할 수 있는 범위를 먼저 말해요.",
      "다음 모임은 다른 사람이 맡자고 해요."
    ],
    "ordinal": 226,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20203,
    "category": "boundaries",
    "prompt": "가까운 사람이 어디에 있는지 자주 물으면 어떻게 답하나요?",
    "samples": [
      "제가 편한 만큼만 일정을 알려 줘요.",
      "어떤 점이 궁금한지 먼저 물어봐요.",
      "연락을 나누는 방식을 함께 정해요."
    ],
    "ordinal": 238,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20204,
    "category": "boundaries",
    "prompt": "개인 계정에 새로 알게 된 사람이 친구 신청을 하면 어떻게 하나요?",
    "samples": [
      "조금 더 알고 지낸 뒤에 받아요.",
      "공개하는 내용이 괜찮으면 바로 받아요.",
      "온라인에서도 대화를 나눈 뒤 정해요."
    ],
    "ordinal": 250,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20205,
    "category": "boundaries",
    "prompt": "친구가 돈을 빌려 달라고 하면 무엇부터 생각하나요?",
    "samples": [
      "제 생활에 부담 없는 금액인지 봐요.",
      "언제 돌려받을 수 있는지 먼저 물어요.",
      "돈을 빌려주는 관계가 편한지 생각해요."
    ],
    "ordinal": 262,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20206,
    "category": "boundaries",
    "prompt": "친구와 견해가 다른 주제로 논쟁이 길어지면 어떻게 하나요?",
    "samples": [
      "서로 다른 생각임을 인정하고 마쳐요.",
      "더 이야기할 마음이 있는지 물어봐요.",
      "잠깐 다른 주제로 바꾸자고 해요."
    ],
    "ordinal": 274,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20207,
    "category": "boundaries",
    "prompt": "친구가 외모에 대한 농담을 하면 어떻게 반응하나요?",
    "samples": [
      "그런 농담은 편하지 않다고 말해요.",
      "다른 이야기를 하자고 주제를 바꿔요.",
      "둘이 있을 때 제 기분을 알려 줘요."
    ],
    "ordinal": 286,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20208,
    "category": "boundaries",
    "prompt": "반가운 인사라도 신체 접촉이 불편하면 어떻게 표현하나요?",
    "samples": [
      "제가 편한 인사 방법을 먼저 보여 줘요.",
      "가까이 닿는 건 어색하다고 말해요.",
      "손을 흔들며 자연스럽게 거리를 둬요."
    ],
    "ordinal": 298,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20209,
    "category": "boundaries",
    "prompt": "단체 사진에 나오고 싶지 않을 때 어떻게 하나요?",
    "samples": [
      "이번에는 찍어 주겠다고 제안해요.",
      "사진에 나오고 싶지 않다고 말해요.",
      "친한 사람에게만 사진에서 빠지고 싶다고 말해요."
    ],
    "ordinal": 310,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20210,
    "category": "boundaries",
    "prompt": "친구가 내 물건의 위치를 바꾸어 두면 어떻게 말하나요?",
    "samples": [
      "원래 자리에 두는 게 편하다고 말해요.",
      "바꾼 이유를 듣고 함께 정리해 봐요.",
      "개인 물건은 제가 정리하겠다고 해요."
    ],
    "ordinal": 322,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20211,
    "category": "boundaries",
    "prompt": "통화가 예상보다 길어져 쉬고 싶으면 어떻게 마무리하나요?",
    "samples": [
      "오늘은 쉬고 싶다고 바로 말해요.",
      "남은 이야기는 다음에 하자고 해요.",
      "조금 뒤에 끊어야 한다고 미리 알려요."
    ],
    "ordinal": 334,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20212,
    "category": "boundaries",
    "prompt": "친구가 약속을 자주 늦게 바꾸면 다음 약속은 어떻게 잡나요?",
    "samples": [
      "확실한 날에만 잡자고 이야기해요.",
      "변경을 언제까지 알려 줄지 정해요.",
      "큰 준비가 필요 없는 만남으로 잡아요."
    ],
    "ordinal": 346,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20213,
    "category": "boundaries",
    "prompt": "함께 놀다가 먼저 쉬러 가고 싶어지면 어떻게 알리나요?",
    "samples": [
      "기운이 떨어져 먼저 쉬겠다고 말해요.",
      "조금 더 있다가 갈 시간을 알려요.",
      "친한 사람에게 말하고 먼저 인사해요."
    ],
    "ordinal": 358,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20214,
    "category": "boundaries",
    "prompt": "약속에 가기 직전에 급한 부탁을 받으면 어떻게 판단하나요?",
    "samples": [
      "제 일정을 바꿀 수 있는지 먼저 봐요.",
      "짧게 도울 수 있는 부분만 찾아요.",
      "다른 방법으로 해결할 수 있는지 물어요."
    ],
    "ordinal": 370,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20215,
    "category": "boundaries",
    "prompt": "친구가 집에서 며칠 머물고 싶다고 하면 무엇을 정하나요?",
    "samples": [
      "서로 편한 기간을 먼저 정해요.",
      "각자 지낼 공간과 시간을 이야기해요.",
      "제가 집에 있을 수 있는 날부터 봐요."
    ],
    "ordinal": 382,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20216,
    "category": "boundaries",
    "prompt": "여행 중 친구와 각자 시간을 보내고 싶으면 어떻게 제안하나요?",
    "samples": [
      "잠깐 따로 다니다 만나자고 말해요.",
      "각자 하고 싶은 일을 먼저 물어봐요.",
      "다시 만날 장소와 시간을 정해서 말해요."
    ],
    "ordinal": 394,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20217,
    "category": "boundaries",
    "prompt": "내 이야기를 다른 모임에서도 해도 되냐고 물으면 어떻게 답하나요?",
    "samples": [
      "어떤 내용을 누구에게 할지 먼저 물어요.",
      "이름 없이 말할 수 있는 범위를 정해요.",
      "그 이야기는 여기서만 나누자고 해요."
    ],
    "ordinal": 406,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20218,
    "category": "boundaries",
    "prompt": "친구가 허락 없이 다른 사람을 약속에 부르면 어떻게 하나요?",
    "samples": [
      "둘이 만나고 싶었던 이유를 말해요.",
      "이번엔 함께 보고 다음부터 물어 달라고 해요.",
      "다른 사람은 다음에 함께 보자고 해요."
    ],
    "ordinal": 418,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20219,
    "category": "boundaries",
    "prompt": "도움을 준 뒤 비슷한 부탁이 계속 오면 어떻게 하나요?",
    "samples": [
      "다음부터 도울 수 있는 범위를 알려요.",
      "혼자 할 수 있는 방법을 같이 정리해요.",
      "요즘 제 상황을 설명하고 쉬어 가요."
    ],
    "ordinal": 430,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20220,
    "category": "boundaries",
    "prompt": "친구가 사진을 계속 찍어 주길 바라면 어떻게 말하나요?",
    "samples": [
      "몇 장 더 찍고 함께 즐기자고 해요.",
      "지금은 저도 구경하고 싶다고 말해요.",
      "서로 번갈아 찍어 주자고 제안해요."
    ],
    "ordinal": 442,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20221,
    "category": "boundaries",
    "prompt": "빌려준 책에 메모를 해도 되냐고 물으면 어떻게 답하나요?",
    "samples": [
      "책에는 쓰지 말아 달라고 부탁해요.",
      "연필로만 적는 건 괜찮다고 말해요.",
      "제가 아끼는 정도에 따라 답이 달라요."
    ],
    "ordinal": 454,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20222,
    "category": "boundaries",
    "prompt": "이어폰을 끼고 쉬는데 누군가 자주 말을 걸면 어떻게 하나요?",
    "samples": [
      "잠깐 혼자 쉬고 싶다고 알려 줘요.",
      "급한 이야기인지 먼저 확인해요.",
      "이어폰을 빼고 짧게 이야기할 시간을 정해요."
    ],
    "ordinal": 466,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20223,
    "category": "boundaries",
    "prompt": "가족이 내 선택에 계속 의견을 보태면 어떻게 하나요?",
    "samples": [
      "의견은 듣되 결정은 제가 하겠다고 해요.",
      "어떤 점이 걱정되는지 먼저 물어봐요.",
      "결정한 뒤 이야기하고 싶다고 말해요."
    ],
    "ordinal": 478,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20224,
    "category": "boundaries",
    "prompt": "친구들과 비용을 나눌 때 어떤 방식을 먼저 제안하나요?",
    "samples": [
      "각자 쓴 만큼 나누자고 제안해요.",
      "비슷하게 썼다면 똑같이 나누자고 해요.",
      "시작 전에 모두 편한 방식을 정해요."
    ],
    "ordinal": 490,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20225,
    "category": "boundaries",
    "prompt": "공동 선물의 금액이 부담되면 어떻게 참여하나요?",
    "samples": [
      "제가 낼 수 있는 금액을 먼저 알려요.",
      "다른 가격대의 선물을 제안해요.",
      "따로 마음을 전하겠다고 말해요."
    ],
    "ordinal": 502,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20226,
    "category": "boundaries",
    "prompt": "처음 만난 사람이 수입을 물으면 어떻게 답하나요?",
    "samples": [
      "구체적인 금액은 말하기 어렵다고 해요.",
      "대략적인 범위만 편하게 이야기해요.",
      "왜 궁금한지 먼저 물어보는 편이에요."
    ],
    "ordinal": 514,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20227,
    "category": "boundaries",
    "prompt": "단체 대화방에서 나를 자주 부르면 어떻게 응답하나요?",
    "samples": [
      "제가 참여할 수 있을 때 답하는 편이에요.",
      "바쁜 시간에는 확인이 늦는다고 알려요.",
      "꼭 필요한 질문에만 먼저 답해요."
    ],
    "ordinal": 526,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20228,
    "category": "boundaries",
    "prompt": "친구가 다른 친구와 만나는 걸 서운해하면 어떻게 말하나요?",
    "samples": [
      "각자 다른 만남도 필요하다고 이야기해요.",
      "어떤 점이 서운했는지 먼저 들어요.",
      "함께 보낼 시간을 따로 정하자고 해요."
    ],
    "ordinal": 538,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20229,
    "category": "boundaries",
    "prompt": "빌려준 물건을 약속한 날에 돌려받지 못하면 어떻게 하나요?",
    "samples": [
      "필요한 날짜를 다시 분명하게 알려요.",
      "언제 돌려줄 수 있는지 먼저 물어요.",
      "직접 가져올 수 있는 방법을 정해요."
    ],
    "ordinal": 550,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20230,
    "category": "boundaries",
    "prompt": "처음 만난 사람이 연락처를 물으면 무엇을 보고 결정하나요?",
    "samples": [
      "다시 이야기하고 싶은 사람인지 봐요.",
      "앞으로 연락할 이유가 있는지 생각해요.",
      "조금 더 알고 지내도 괜찮을지 봐요."
    ],
    "ordinal": 562,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20231,
    "category": "boundaries",
    "prompt": "도와주기로 한 일이 예상보다 커지면 어떻게 말하나요?",
    "samples": [
      "처음 생각한 범위와 다르다고 알려요.",
      "끝낼 수 있는 부분까지만 다시 정해요.",
      "시간을 더 쓸 수 있는지 확인하고 말해요."
    ],
    "ordinal": 574,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20232,
    "category": "boundaries",
    "prompt": "공개하기로 한 사진을 뒤늦게 내리고 싶어지면 어떻게 말하나요?",
    "samples": [
      "마음이 바뀌었다고 말하고 내려 달라고 해요.",
      "왜 불편해졌는지 이유를 먼저 설명해요.",
      "제 얼굴을 가리고 다시 올릴지 이야기해요."
    ],
    "ordinal": 586,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20233,
    "category": "boundaries",
    "prompt": "예상보다 비싼 선물을 받아 부담되면 어떻게 답하나요?",
    "samples": [
      "고마운 마음과 부담을 함께 이야기해요.",
      "다음에는 가볍게 주고받자고 말해요.",
      "상대가 어떤 마음으로 골랐는지 물어봐요."
    ],
    "ordinal": 598,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20234,
    "category": "boundaries",
    "prompt": "친구가 예전 실수를 자꾸 이야기하면 어떻게 반응하나요?",
    "samples": [
      "그 이야기는 그만하고 싶다고 말해요.",
      "지금은 어떻게 달라졌는지 이야기해요.",
      "둘이 있을 때 불편한 마음을 알려 줘요."
    ],
    "ordinal": 610,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20235,
    "category": "boundaries",
    "prompt": "모임 사진이 단체 대화방에 올라갈 때 무엇이 신경 쓰이나요?",
    "samples": [
      "제가 나온 사진을 고를 수 있으면 좋아요.",
      "모임 사람들만 볼 수 있는지가 중요해요.",
      "다른 곳에 다시 올리는지는 물어봤으면 해요."
    ],
    "ordinal": 622,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20236,
    "category": "boundaries",
    "prompt": "함께 쓰는 방에서 쉬는 시간이 다르면 어떻게 맞추나요?",
    "samples": [
      "조용히 지낼 시간을 함께 정해요.",
      "각자 쉴 수 있는 자리를 나누어요.",
      "그날 필요한 시간을 서로 알려 줘요."
    ],
    "ordinal": 634,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20237,
    "category": "boundaries",
    "prompt": "정기적으로 혼자 하던 활동 시간에 약속이 생기면 어떻게 하나요?",
    "samples": [
      "제 활동 시간을 지키고 다른 때를 제안해요.",
      "이번 약속이 얼마나 중요한지 살펴봐요.",
      "활동 시간을 옮길 수 있는지 확인해요."
    ],
    "ordinal": 646,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20238,
    "category": "boundaries",
    "prompt": "한 번 거절한 부탁을 다시 받으면 어떻게 답하나요?",
    "samples": [
      "제 답이 같다는 것을 분명히 말해요.",
      "달라진 상황이 있는지 먼저 물어봐요.",
      "가능한 다른 방법을 짧게 제안해요."
    ],
    "ordinal": 658,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20239,
    "category": "boundaries",
    "prompt": "노래하고 싶지 않은데 친구들이 계속 권하면 어떻게 하나요?",
    "samples": [
      "오늘은 듣는 게 좋다고 이야기해요.",
      "함께 부르는 방식이라면 참여할지 봐요.",
      "다른 활동으로 분위기를 바꿔 봐요."
    ],
    "ordinal": 670,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20240,
    "category": "boundaries",
    "prompt": "친구가 내가 쓴 글을 보여 달라고 하면 어디까지 공개하나요?",
    "samples": [
      "공유해도 편한 부분만 골라 보여 줘요.",
      "어떤 내용이 궁금한지 먼저 물어봐요.",
      "혼자 간직할 글이라고 이야기해요."
    ],
    "ordinal": 682,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20241,
    "category": "boundaries",
    "prompt": "여러 사람이 내 일정을 대신 정하려 하면 어떻게 하나요?",
    "samples": [
      "제가 직접 확인하고 정하겠다고 해요.",
      "가능한 시간과 어려운 시간을 알려요.",
      "정하기 전에 꼭 물어봐 달라고 해요."
    ],
    "ordinal": 694,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20242,
    "category": "boundaries",
    "prompt": "가까운 사람이 매일 긴 통화를 원하면 어떻게 맞춰 가나요?",
    "samples": [
      "서로 편한 통화 시간과 횟수를 정해요.",
      "짧은 연락과 긴 통화를 나누어 제안해요.",
      "통화보다 편한 연락 방법을 말해요."
    ],
    "ordinal": 706,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20243,
    "category": "boundaries",
    "prompt": "내가 부탁을 거절한 뒤 분위기가 어색해지면 어떻게 하나요?",
    "samples": [
      "거절한 이유를 조금 더 설명해요.",
      "다른 이야기를 하며 평소처럼 대해요.",
      "서로 생각할 시간을 잠깐 두는 편이에요."
    ],
    "ordinal": 718,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20244,
    "category": "boundaries",
    "prompt": "친구의 고민을 오래 듣다가 지치면 어떻게 마음을 전하나요?",
    "samples": [
      "잠깐 쉬고 다시 듣고 싶다고 말해요.",
      "오늘 이야기할 수 있는 시간을 알려요.",
      "다음에 충분히 들을 시간을 함께 잡아요."
    ],
    "ordinal": 730,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20245,
    "category": "planning",
    "prompt": "일주일 뒤까지 끝내야 할 일이 생기면 어떻게 진행하나요?",
    "samples": [
      "받은 날 전체 내용을 먼저 살펴봐요.",
      "매일 할 분량을 나눠서 조금씩 해요.",
      "다른 일을 정리한 뒤 한 번에 집중해요."
    ],
    "ordinal": 2,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20246,
    "category": "planning",
    "prompt": "여행을 준비할 때 하루 일정을 얼마나 자세히 정하나요?",
    "samples": [
      "이동 시간과 식사할 곳까지 미리 정해요.",
      "꼭 가고 싶은 곳 몇 군데만 정해요.",
      "숙소만 정하고 그날 마음에 따라 움직여요."
    ],
    "ordinal": 14,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20247,
    "category": "planning",
    "prompt": "예정보다 일이 빨리 끝나서 한 시간이 남으면 뭘 하나요?",
    "samples": [
      "다음에 할 일을 조금 앞당겨 해요.",
      "밀려 있던 작은 일을 하나 처리해요.",
      "시간을 비워 두고 느긋하게 쉬어요."
    ],
    "ordinal": 26,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20248,
    "category": "planning",
    "prompt": "갑자기 잡힌 약속이 원래 계획과 겹치면 어떻게 하나요?",
    "samples": [
      "먼저 정한 일정을 지키겠다고 말해요.",
      "두 일정 중 옮길 수 있는 쪽을 찾아봐요.",
      "그날 더 하고 싶은 일을 골라요."
    ],
    "ordinal": 38,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20249,
    "category": "planning",
    "prompt": "하루에 해야 할 일이 여러 개면 어떤 순서로 시작하나요?",
    "samples": [
      "마감이 가장 가까운 일부터 시작해요.",
      "가장 어려운 일을 먼저 끝내 놓아요.",
      "금방 끝낼 수 있는 일부터 해요."
    ],
    "ordinal": 50,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20250,
    "category": "planning",
    "prompt": "새해에 세운 목표는 평소 어떻게 확인하나요?",
    "samples": [
      "정해 둔 날짜에 얼마나 했는지 돌아봐요.",
      "눈에 잘 보이는 곳에 적어 두고 봐요.",
      "목표가 생각날 때마다 진행 상황을 봐요."
    ],
    "ordinal": 62,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20251,
    "category": "planning",
    "prompt": "주말 약속은 보통 언제쯤 정해 두는 편인가요?",
    "samples": [
      "주초에 정해 놓아야 마음이 편해요.",
      "전날까지 상황을 보고 결정하는 편이에요.",
      "당일에 시간이 맞는 사람과 만나요."
    ],
    "ordinal": 74,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20252,
    "category": "planning",
    "prompt": "계획한 일을 하루 못 했을 때 다음 날 어떻게 하나요?",
    "samples": [
      "못 한 분량까지 다음 날에 이어서 해요.",
      "남은 날에 조금씩 나눠서 더 해요.",
      "지난 분량은 넘기고 원래 계획대로 해요."
    ],
    "ordinal": 86,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20253,
    "category": "planning",
    "prompt": "약속 장소에 갈 때 이동 시간에 여유를 얼마나 두나요?",
    "samples": [
      "길이 막힐 시간까지 넉넉하게 잡아요.",
      "평소 걸리는 시간에 조금만 더해요.",
      "실시간 교통 상황을 보고 출발해요."
    ],
    "ordinal": 98,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20254,
    "category": "planning",
    "prompt": "비가 와서 야외 나들이를 못 가면 어떻게 하나요?",
    "samples": [
      "미리 알아둔 실내 장소로 바꿔요.",
      "집에서 쉬면서 다음 날짜를 잡아요.",
      "밖에 나갈 다른 방법을 그때 찾아봐요."
    ],
    "ordinal": 110,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20255,
    "category": "planning",
    "prompt": "큰 일을 시작할 때 가장 먼저 정리하는 것은 무엇인가요?",
    "samples": [
      "완성했을 때 어떤 모습일지 정리해요.",
      "끝내야 하는 날짜와 순서를 적어요.",
      "지금 바로 할 수 있는 작은 일을 찾아요."
    ],
    "ordinal": 122,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20256,
    "category": "planning",
    "prompt": "혼자 쉬는 날에도 하루 일정표를 만드는 편인가요?",
    "samples": [
      "쉬는 시간도 포함해서 대략 적어 둬요.",
      "꼭 해야 할 일만 메모해 두는 편이에요.",
      "그날 컨디션에 맞춰 보내고 싶어요."
    ],
    "ordinal": 134,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20257,
    "category": "planning",
    "prompt": "매일 반복하는 일을 잊지 않으려고 어떤 방법을 쓰나요?",
    "samples": [
      "시간을 정해 알림이 울리게 해 둬요.",
      "다른 일과 묶어서 습관처럼 해요.",
      "눈에 보이는 곳에 필요한 물건을 둬요."
    ],
    "ordinal": 146,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20258,
    "category": "planning",
    "prompt": "길게 기다려야 하는 곳에 갈 때 시간을 어떻게 준비하나요?",
    "samples": [
      "예약할 수 있는 방법부터 확인해요.",
      "기다리면서 할 일을 미리 챙겨 가요.",
      "기다림도 일정의 일부로 생각하고 가요."
    ],
    "ordinal": 158,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20259,
    "category": "planning",
    "prompt": "여행 중 가고 싶던 곳이 문을 닫았으면 어떻게 하나요?",
    "samples": [
      "근처에 미리 적어 둔 다른 곳으로 가요.",
      "주변을 둘러보다 마음에 드는 곳에 가요.",
      "다른 날 다시 올 수 있게 일정을 바꿔요."
    ],
    "ordinal": 170,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20260,
    "category": "planning",
    "prompt": "해야 할 일의 예상 시간을 잡을 때 어떤 기준을 쓰나요?",
    "samples": [
      "전에 비슷한 일을 했던 시간을 참고해요.",
      "실제로 해 보면서 남은 시간을 가늠해요.",
      "처음부터 예상보다 넉넉하게 잡아요."
    ],
    "ordinal": 182,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20261,
    "category": "planning",
    "prompt": "계획이 너무 빡빡하다고 느끼면 무엇부터 줄이나요?",
    "samples": [
      "꼭 하지 않아도 되는 일을 빼요.",
      "각 일에 들이는 시간을 조금씩 줄여요.",
      "일부 일을 다른 날로 옮겨 여유를 만들어요."
    ],
    "ordinal": 194,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20262,
    "category": "planning",
    "prompt": "오래 걸리는 목표를 세우면 중간 목표도 정하나요?",
    "samples": [
      "일주일마다 확인할 작은 목표를 정해요.",
      "중요한 단계 몇 개만 정해 두는 편이에요.",
      "끝에 이루고 싶은 모습만 정해 둬요."
    ],
    "ordinal": 206,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20263,
    "category": "planning",
    "prompt": "정리할 물건이 많이 쌓였을 때 어디부터 손대나요?",
    "samples": [
      "종류별로 나눌 공간부터 마련해요.",
      "가장 자주 쓰는 물건부터 정리해요.",
      "눈앞에 보이는 것부터 하나씩 치워요."
    ],
    "ordinal": 218,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20264,
    "category": "planning",
    "prompt": "아침에 일어나 하루 계획을 바꾸게 되는 때는 언제인가요?",
    "samples": [
      "몸이 피곤하면 일정부터 가볍게 바꿔요.",
      "새로운 일이 들어오면 우선순위를 바꿔요.",
      "웬만하면 전날 정한 순서를 그대로 지켜요."
    ],
    "ordinal": 230,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20265,
    "category": "planning",
    "prompt": "재미있는 일이 생겼는데 할 일이 남아 있다면 어떻게 하나요?",
    "samples": [
      "할 일을 먼저 끝내고 마음 편히 즐겨요.",
      "잠깐 즐긴 뒤 돌아올 시간을 정해요.",
      "할 일의 마감을 확인하고 순서를 바꿔요."
    ],
    "ordinal": 242,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20266,
    "category": "planning",
    "prompt": "처음 가는 장소의 길은 언제 확인하는 편인가요?",
    "samples": [
      "전날에 경로와 출구까지 확인해 둬요.",
      "출발하기 직전에 길을 확인하는 편이에요.",
      "가면서 지도 안내를 따라 움직여요."
    ],
    "ordinal": 254,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20267,
    "category": "planning",
    "prompt": "여러 날 쓸 짐을 챙길 때 어떤 방식으로 준비하나요?",
    "samples": [
      "목록을 써서 챙긴 물건에 표시해요.",
      "쓰는 장면을 떠올리며 하나씩 넣어요.",
      "자주 쓰는 물건부터 넣고 나머지를 봐요."
    ],
    "ordinal": 266,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20268,
    "category": "planning",
    "prompt": "하고 싶은 일이 너무 많으면 계획을 어떻게 줄이나요?",
    "samples": [
      "지금 가장 중요한 한 가지를 먼저 골라요.",
      "각각 조금씩 해 볼 시간을 나눠요.",
      "기간을 나눠 한 가지씩 해 보기로 해요."
    ],
    "ordinal": 278,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20269,
    "category": "planning",
    "prompt": "미리 정한 계획에 새 아이디어가 떠오르면 어떻게 하나요?",
    "samples": [
      "지금 계획에 넣을 수 있는지 먼저 봐요.",
      "따로 메모해 두고 다음에 시도해요.",
      "더 마음에 들면 기존 계획을 바꿔요."
    ],
    "ordinal": 290,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20270,
    "category": "planning",
    "prompt": "하루를 마친 뒤 다음 날을 위해 무엇을 준비하나요?",
    "samples": [
      "할 일의 순서와 필요한 물건을 챙겨요.",
      "가장 먼저 해야 할 일 하나만 정해요.",
      "다음 날 아침에 상태를 보고 정해요."
    ],
    "ordinal": 302,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20271,
    "category": "planning",
    "prompt": "한 가지 일을 하다가 다른 할 일이 생각나면 어떻게 하나요?",
    "samples": [
      "메모만 해 두고 하던 일을 계속해요.",
      "금방 끝낼 일이면 먼저 처리하고 와요.",
      "두 일의 급한 정도를 비교해서 정해요."
    ],
    "ordinal": 314,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20272,
    "category": "planning",
    "prompt": "달력을 사용할 때 어떤 일정까지 적어 두나요?",
    "samples": [
      "약속뿐 아니라 혼자 할 일도 적어요.",
      "시간을 지켜야 하는 약속만 적어요.",
      "중요한 날짜만 적고 나머지는 기억해요."
    ],
    "ordinal": 326,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20273,
    "category": "planning",
    "prompt": "예약한 시간까지 여유가 많이 남으면 어떻게 보내나요?",
    "samples": [
      "시간이 걸리지 않는 할 일을 골라 해요.",
      "근처를 구경하다 여유 있게 돌아와요.",
      "일찍 도착해서 기다리는 편이 편해요."
    ],
    "ordinal": 338,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20274,
    "category": "planning",
    "prompt": "갑자기 하루를 통째로 쉬게 되면 어떻게 보내고 싶나요?",
    "samples": [
      "미뤄 둔 일을 끝낼 계획부터 세워요.",
      "한 가지 하고 싶은 일만 골라서 해요.",
      "무엇을 할지 정하지 않고 쉬고 싶어요."
    ],
    "ordinal": 350,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20275,
    "category": "planning",
    "prompt": "같은 일을 반복할 때 순서를 바꾸는 편인가요?",
    "samples": [
      "익숙한 순서가 편해서 그대로 해요.",
      "더 빨라질 방법이 보이면 바꿔 봐요.",
      "그날 하기 쉬운 순서로 조금씩 바꿔요."
    ],
    "ordinal": 362,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20276,
    "category": "planning",
    "prompt": "미뤄 둔 일이 계속 마음에 걸리면 어떻게 시작하나요?",
    "samples": [
      "시작할 시간을 정해 달력에 넣어요.",
      "가장 쉬운 부분을 잠깐만 해 봐요.",
      "다른 일을 치우고 집중할 시간을 만들어요."
    ],
    "ordinal": 374,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20277,
    "category": "planning",
    "prompt": "여행을 떠나기 전 빈 시간을 일정에 남겨 두나요?",
    "samples": [
      "예상치 못한 일을 위해 넉넉히 비워요.",
      "이동 사이에 짧은 여유만 두는 편이에요.",
      "보고 싶은 곳을 먼저 넣고 남은 시간을 봐요."
    ],
    "ordinal": 386,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20278,
    "category": "planning",
    "prompt": "운동이나 공부를 꾸준히 하려고 시간을 어떻게 잡나요?",
    "samples": [
      "매일 같은 시간에 하도록 정해요.",
      "그날 비는 시간을 찾아서 하는 편이에요.",
      "일주일의 총분량을 정해 나눠서 해요."
    ],
    "ordinal": 398,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20279,
    "category": "planning",
    "prompt": "계획보다 진도가 느리면 무엇부터 확인하나요?",
    "samples": [
      "예상 시간을 너무 짧게 잡았는지 봐요.",
      "막히는 부분을 줄일 방법부터 찾아요.",
      "목표를 줄이거나 마감을 옮길 수 있는지 봐요."
    ],
    "ordinal": 410,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20280,
    "category": "planning",
    "prompt": "새로 시작한 습관은 따로 기록하며 확인하는 편인가요?",
    "samples": [
      "매일 했는지 표시하며 변화를 확인해요.",
      "눈에 띄는 변화가 생겼을 때만 적어요.",
      "기록보다는 생활 속에서 이어 가려고 해요."
    ],
    "ordinal": 422,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20281,
    "category": "planning",
    "prompt": "약속이 연달아 있는 날 중간 시간을 어떻게 잡나요?",
    "samples": [
      "앞 약속이 길어질 것을 생각해 넉넉히 둬요.",
      "이동 시간만 계산해서 맞춰 두는 편이에요.",
      "중간에 혼자 쉴 시간을 따로 넣어 둬요."
    ],
    "ordinal": 434,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20282,
    "category": "planning",
    "prompt": "급하지 않은 집안일은 보통 언제 하는 편인가요?",
    "samples": [
      "요일을 정해 한꺼번에 처리하는 편이에요.",
      "눈에 띌 때마다 조금씩 해 두는 편이에요.",
      "여유가 생기는 날 몰아서 처리해요."
    ],
    "ordinal": 446,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20283,
    "category": "planning",
    "prompt": "하루 계획이 계속 밀릴 때 끝까지 지키는 것은 무엇인가요?",
    "samples": [
      "반드시 끝내야 할 핵심 업무 하나예요.",
      "식사나 잠처럼 생활에 필요한 시간이에요.",
      "다른 사람과 이미 약속한 시간이에요."
    ],
    "ordinal": 458,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20284,
    "category": "planning",
    "prompt": "일정을 잡을 때 다른 사람의 답을 기다려야 하면 어떻게 하나요?",
    "samples": [
      "답이 올 때까지 그 시간을 비워 둬요.",
      "답을 기다릴 기한을 정해서 알려 줘요.",
      "가능한 일정 몇 개를 준비해 놓고 기다려요."
    ],
    "ordinal": 470,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20285,
    "category": "planning",
    "prompt": "외출 준비를 예상보다 늦게 시작했다면 어떻게 하나요?",
    "samples": [
      "준비할 일 중 생략해도 되는 것을 골라요.",
      "도착 시간을 다시 계산해 먼저 알려요.",
      "준비 순서를 바꿔 이동을 서두르는 편이에요."
    ],
    "ordinal": 482,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20286,
    "category": "planning",
    "prompt": "새 달이 시작되면 계획을 어떻게 세우나요?",
    "samples": [
      "한 달 동안 할 일을 주차별로 나눠요.",
      "이번 달에 이루고 싶은 몇 가지만 정해요.",
      "월별 계획보다는 눈앞의 일부터 정해요."
    ],
    "ordinal": 494,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20287,
    "category": "planning",
    "prompt": "해야 할 일 목록을 다 끝내지 못한 날은 어떻게 정리하나요?",
    "samples": [
      "남은 일을 다음 날 목록으로 옮겨요.",
      "정말 필요한 일인지 다시 골라내요.",
      "마감에 맞춰 다른 날에 나눠 넣어요."
    ],
    "ordinal": 506,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20288,
    "category": "planning",
    "prompt": "처음 해 보는 일은 준비와 실행 중 어디에 시간을 더 쓰나요?",
    "samples": [
      "실수하지 않도록 준비에 더 시간을 써요.",
      "일단 해 보고 필요한 것을 보완해요.",
      "작게 준비해서 시험한 뒤 본격적으로 해요."
    ],
    "ordinal": 518,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20289,
    "category": "planning",
    "prompt": "여행 동선이 복잡해지면 어떤 기준으로 정리하나요?",
    "samples": [
      "이동 거리가 짧아지도록 순서를 바꿔요.",
      "꼭 가고 싶은 곳을 중심으로 다시 짜요.",
      "방문할 곳을 줄이고 여유 있게 움직여요."
    ],
    "ordinal": 530,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20290,
    "category": "planning",
    "prompt": "잠깐씩 생기는 자투리 시간은 어떻게 쓰는 편인가요?",
    "samples": [
      "짧게 끝낼 수 있는 일을 미리 적어 둬요.",
      "그때 생각나는 일을 가볍게 처리해요.",
      "다음 일을 위해 아무것도 하지 않고 쉬어요."
    ],
    "ordinal": 542,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20291,
    "category": "planning",
    "prompt": "일을 시작하기 전에 완성 기준을 정하는 편인가요?",
    "samples": [
      "어디까지 하면 끝인지 구체적으로 정해요.",
      "필수 조건만 정하고 하면서 다듬어요.",
      "직접 해 봐야 기준이 생기는 편이에요."
    ],
    "ordinal": 554,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20292,
    "category": "planning",
    "prompt": "반복해서 늦어지는 일정이 있으면 어떻게 바꾸나요?",
    "samples": [
      "처음부터 필요한 시간을 더 길게 잡아요.",
      "앞뒤 일정을 줄여서 공간을 만들어요.",
      "늦어지는 원인을 찾아 순서를 바꿔요."
    ],
    "ordinal": 566,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20293,
    "category": "planning",
    "prompt": "한 번 세운 계획은 얼마나 자주 다시 살펴보나요?",
    "samples": [
      "정해 둔 주기마다 진행 상황을 확인해요.",
      "예상과 달라졌을 때만 다시 살펴봐요.",
      "작업할 때마다 조금씩 고치는 편이에요."
    ],
    "ordinal": 578,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20294,
    "category": "planning",
    "prompt": "혼자 하는 하루 여행을 계획한다면 무엇부터 정하나요?",
    "samples": [
      "집에 돌아올 시간을 먼저 정해 둬요.",
      "꼭 보고 싶은 한 곳부터 고르는 편이에요.",
      "도착할 동네만 정하고 현장에서 움직여요."
    ],
    "ordinal": 590,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20295,
    "category": "planning",
    "prompt": "할 일 사이에 쉬는 시간은 어떤 방식으로 넣나요?",
    "samples": [
      "정해 둔 시간마다 잠깐씩 쉬는 편이에요.",
      "한 단계를 끝냈을 때 쉬는 편이에요.",
      "집중력이 떨어졌다고 느끼면 바로 쉬어요."
    ],
    "ordinal": 602,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20296,
    "category": "planning",
    "prompt": "계획을 공유해야 할 때 어느 정도 자세히 설명하나요?",
    "samples": [
      "순서와 예상 시간까지 구체적으로 알려요.",
      "큰 일정과 중요한 마감만 알려 줘요.",
      "먼저 간단히 말하고 질문을 받으면 더 설명해요."
    ],
    "ordinal": 614,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20297,
    "category": "planning",
    "prompt": "행사에 쓸 물건을 준비할 때 예비 물품도 챙기나요?",
    "samples": [
      "고장 나거나 잃어버릴 것에 대비해 챙겨요.",
      "꼭 필요한 물건만 여분으로 챙기는 편이에요.",
      "짐을 줄이고 필요하면 현장에서 구하려고 해요."
    ],
    "ordinal": 626,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20298,
    "category": "planning",
    "prompt": "오늘 할 일과 이번 달 할 일은 어떻게 구분하나요?",
    "samples": [
      "두 목록을 따로 만들어 관리하는 편이에요.",
      "한 목록에 적고 날짜로 구분하는 편이에요.",
      "당장 할 것만 적고 나머지는 따로 기억해요."
    ],
    "ordinal": 638,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20299,
    "category": "planning",
    "prompt": "시작한 일이 예상보다 커지면 어떻게 정리하나요?",
    "samples": [
      "여러 단계로 나눠 일정부터 다시 잡아요.",
      "꼭 필요한 부분을 먼저 완성하려고 해요.",
      "잠깐 멈추고 필요한 준비를 더 해요."
    ],
    "ordinal": 650,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20300,
    "category": "planning",
    "prompt": "정해진 시간 없이 할 수 있는 취미는 언제 하게 되나요?",
    "samples": [
      "미리 시간을 빼 두어야 꾸준히 하게 돼요.",
      "할 일을 마치고 남는 시간에 하는 편이에요.",
      "하고 싶다는 생각이 들면 바로 시작해요."
    ],
    "ordinal": 662,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20301,
    "category": "planning",
    "prompt": "오래 기다린 휴가를 앞두고 준비는 언제 시작하나요?",
    "samples": [
      "몇 주 전부터 필요한 것을 조금씩 챙겨요.",
      "출발이 가까워지면 한 번에 준비해요.",
      "예약만 먼저 하고 나머지는 천천히 정해요."
    ],
    "ordinal": 674,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20302,
    "category": "planning",
    "prompt": "하루에 집중해서 쓸 시간이 두 시간뿐이면 어떻게 쓰나요?",
    "samples": [
      "가장 중요한 한 가지 일에 모두 써요.",
      "여러 일의 급한 부분을 나눠서 처리해요.",
      "준비가 끝난 일부터 빠르게 마쳐요."
    ],
    "ordinal": 686,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20303,
    "category": "planning",
    "prompt": "일정이 자주 바뀌는 주에는 계획을 어떻게 세우나요?",
    "samples": [
      "매일 아침 새 일정에 맞춰 다시 정리해요.",
      "반드시 할 일만 정하고 시간은 열어 둬요.",
      "바뀔 경우를 생각해 대안 일정도 준비해요."
    ],
    "ordinal": 698,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20304,
    "category": "planning",
    "prompt": "준비를 마친 뒤 약속이 취소되면 남은 시간을 어떻게 쓰나요?",
    "samples": [
      "그 준비를 활용할 다른 일을 찾아봐요.",
      "계획에서 벗어난 시간을 그냥 즐겨요.",
      "미뤄 둔 일을 처리할 기회로 삼아요."
    ],
    "ordinal": 710,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20305,
    "category": "planning",
    "prompt": "새로운 목표를 시작할 때 첫 주의 분량은 어떻게 정하나요?",
    "samples": [
      "부담이 적은 분량부터 잡아 습관을 만들어요.",
      "실제로 가능한 최대 분량을 해 보고 조절해요.",
      "비슷한 경험이 있는 사람의 계획을 참고해요."
    ],
    "ordinal": 722,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20306,
    "category": "decision",
    "prompt": "마음에 드는 물건 두 개 중 하나만 산다면 무엇을 비교하나요?",
    "samples": [
      "실제로 더 자주 쓸 물건인지 비교해요.",
      "오래 두고 봐도 마음에 들지 생각해요.",
      "가격과 관리에 드는 수고를 비교해요."
    ],
    "ordinal": 5,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20307,
    "category": "decision",
    "prompt": "새로운 일을 해 볼 기회가 두 개 생기면 어떻게 고르나요?",
    "samples": [
      "지금 가진 능력을 잘 쓸 수 있는 쪽을 골라요.",
      "배울 것이 더 많은 쪽을 고르는 편이에요.",
      "현재 생활에 무리가 덜한 쪽을 골라요."
    ],
    "ordinal": 17,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20308,
    "category": "decision",
    "prompt": "중요한 선택을 앞두고 서로 다른 조언을 들으면 어떻게 하나요?",
    "samples": [
      "각 조언의 이유를 적어 놓고 비교해요.",
      "제 상황을 가장 잘 아는 사람의 말을 참고해요.",
      "잠깐 조언을 내려놓고 제 생각부터 정리해요."
    ],
    "ordinal": 29,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20309,
    "category": "decision",
    "prompt": "선택에 필요한 정보가 충분한지는 어떻게 판단하나요?",
    "samples": [
      "제가 중요하게 보는 조건을 확인하면 정해요.",
      "궁금한 점이 거의 없어질 때까지 알아봐요.",
      "더 알아봐도 결론이 같을 것 같으면 멈춰요."
    ],
    "ordinal": 41,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20310,
    "category": "decision",
    "prompt": "가려는 숙소의 후기가 서로 다르면 무엇을 더 살펴보나요?",
    "samples": [
      "최근에 작성된 후기를 더 찾아봐요.",
      "제가 중요하게 보는 부분의 평가를 봐요.",
      "사진과 시설 정보를 직접 비교해 봐요."
    ],
    "ordinal": 53,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20311,
    "category": "decision",
    "prompt": "결정을 내린 뒤에도 다른 선택지가 떠오르면 어떻게 하나요?",
    "samples": [
      "바꿀 수 있는 기간까지 한 번 더 비교해요.",
      "이미 정한 쪽을 잘 활용하는 데 집중해요.",
      "처음 결정한 이유를 다시 확인해 봐요."
    ],
    "ordinal": 65,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20312,
    "category": "decision",
    "prompt": "게임에서 점수를 조금씩 쌓는 방법과 한 번에 크게 노리는 방법 중 어떻게 고르나요?",
    "samples": [
      "실패해도 만회할 기회가 있는지 봐요.",
      "지금 더 재미있을 것 같은 방법을 골라요.",
      "현재 점수에 필요한 전략을 골라요."
    ],
    "ordinal": 77,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20313,
    "category": "decision",
    "prompt": "선택할 시간이 짧을 때 가장 먼저 확인하는 것은 뭔가요?",
    "samples": [
      "나중에 바꿀 수 있는 선택인지 확인해요.",
      "반드시 지켜야 할 조건부터 확인해요.",
      "현재 정보로 가장 가능성이 높은 쪽을 봐요."
    ],
    "ordinal": 89,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20314,
    "category": "decision",
    "prompt": "오래 고민해도 두 선택지가 비슷하게 느껴지면 어떻게 하나요?",
    "samples": [
      "각각을 선택한 하루를 구체적으로 떠올려요.",
      "둘 중 마음이 조금 더 가는 쪽을 골라요.",
      "결정할 시한을 정하고 그때까지 비교해요."
    ],
    "ordinal": 101,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20315,
    "category": "decision",
    "prompt": "느낌은 좋은데 객관적인 조건이 아쉬운 제안이라면 어떻게 하나요?",
    "samples": [
      "좋은 느낌이 드는 이유부터 생각해 봐요.",
      "부족한 조건을 바꿀 수 있는지 물어봐요.",
      "조건이 맞는 다른 제안도 더 찾아봐요."
    ],
    "ordinal": 113,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20316,
    "category": "decision",
    "prompt": "기분이 좋아서 평소보다 큰 소비를 하고 싶어지면 어떻게 하나요?",
    "samples": [
      "하루 정도 지나도 갖고 싶은지 봐요.",
      "정해 둔 예산 안에서만 골라 보는 편이에요.",
      "이번 기분을 즐길 다른 방법도 생각해요."
    ],
    "ordinal": 125,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20317,
    "category": "decision",
    "prompt": "한 번 정하면 오래 이어 가야 하는 활동은 어떻게 고르나요?",
    "samples": [
      "짧게 체험할 수 있는 방법부터 찾아요.",
      "꾸준히 할 수 있는 환경인지 먼저 봐요.",
      "관심이 오래 갈 주제인지 충분히 생각해요."
    ],
    "ordinal": 137,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20318,
    "category": "decision",
    "prompt": "마감이 임박한 신청 기회를 알게 되면 어떻게 하나요?",
    "samples": [
      "핵심 조건을 빠르게 확인하고 결정해요.",
      "다음에도 비슷한 기회가 있는지 찾아봐요.",
      "제가 원래 원하던 일인지부터 생각해요."
    ],
    "ordinal": 149,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20319,
    "category": "decision",
    "prompt": "익숙한 길과 더 빠를 수도 있는 새 길 중 어느 쪽을 택하나요?",
    "samples": [
      "시간이 급하면 익숙한 길로 가는 편이에요.",
      "실시간 길 안내를 확인하고 결정해요.",
      "여유가 있으면 새 길을 한 번 가 봐요."
    ],
    "ordinal": 161,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20320,
    "category": "decision",
    "prompt": "매일 하는 작은 선택은 어떻게 줄이는 편인가요?",
    "samples": [
      "옷이나 식사에 자주 고르는 기준을 정해 둬요.",
      "전날 정해 두고 당일에는 고민을 줄여요.",
      "작은 선택은 오래 생각하지 않고 골라요."
    ],
    "ordinal": 173,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20321,
    "category": "decision",
    "prompt": "꼭 알아야 할 정보가 빠진 제안을 받으면 어떻게 하나요?",
    "samples": [
      "답이 나올 때까지 결정을 미뤄요.",
      "빠진 정보를 직접 질문해서 확인해요.",
      "지금 아는 범위에서 가능한 부분만 정해요."
    ],
    "ordinal": 185,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20322,
    "category": "decision",
    "prompt": "믿는 사람이 추천했지만 내 취향과 다르면 어떻게 하나요?",
    "samples": [
      "추천한 이유를 듣고 한 번 경험해 봐요.",
      "제게 맞는 부분이 있는지 따로 알아봐요.",
      "제 취향에 맞는 다른 선택을 하는 편이에요."
    ],
    "ordinal": 197,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20323,
    "category": "decision",
    "prompt": "새로운 일을 맡을지 결정할 때 가장 크게 보는 조건은 뭔가요?",
    "samples": [
      "지금 가진 시간으로 해낼 수 있는지 봐요.",
      "제가 관심을 갖고 끝까지 할 수 있는지 봐요.",
      "앞으로 해 보고 싶은 일에 도움이 되는지 봐요."
    ],
    "ordinal": 209,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20324,
    "category": "decision",
    "prompt": "돈을 더 쓰면 시간을 아낄 수 있을 때 어떻게 결정하나요?",
    "samples": [
      "아낀 시간에 할 일이 무엇인지 생각해요.",
      "추가 비용이 예산 안에 들어오는지 봐요.",
      "얼마나 자주 필요한 일인지 따져 봐요."
    ],
    "ordinal": 221,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20325,
    "category": "decision",
    "prompt": "기능이 많은 제품과 쓰기 쉬운 제품 중 무엇을 고르나요?",
    "samples": [
      "실제로 쓸 기능이 충분하면 쉬운 쪽을 골라요.",
      "나중에 쓸 가능성까지 보고 기능을 골라요.",
      "직접 써 봤을 때 편한 쪽으로 정해요."
    ],
    "ordinal": 233,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20326,
    "category": "decision",
    "prompt": "새로운 계획의 장단점을 생각할 때 무엇부터 떠오르나요?",
    "samples": [
      "잘됐을 때 얻을 수 있는 것이 먼저 떠올라요.",
      "문제가 생겼을 때 대처할 방법부터 생각해요.",
      "지금 생활에서 달라질 부분부터 떠올려요."
    ],
    "ordinal": 245,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20327,
    "category": "decision",
    "prompt": "선택을 앞두고 남은 의문은 누구에게 물어보는 편인가요?",
    "samples": [
      "비슷한 선택을 직접 해 본 사람에게 물어요.",
      "제 성격을 잘 아는 사람에게 물어봐요.",
      "관련 정보를 전문적으로 아는 사람에게 물어요."
    ],
    "ordinal": 257,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20328,
    "category": "decision",
    "prompt": "원하는 조건을 모두 갖춘 선택지가 없으면 어떻게 하나요?",
    "samples": [
      "절대 포기할 수 없는 조건 하나를 정해요.",
      "조건을 조금씩 낮춰 가장 균형 잡힌 것을 골라요.",
      "지금 꼭 결정해야 하는 일인지 다시 봐요."
    ],
    "ordinal": 269,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20329,
    "category": "decision",
    "prompt": "이미 들인 시간 때문에 그만두기 어려운 일이 있으면 어떻게 하나요?",
    "samples": [
      "앞으로 더 들일 시간과 얻을 것을 비교해요.",
      "정한 기간까지만 더 해 보고 판단해요.",
      "시작했던 이유가 아직 유효한지 생각해요."
    ],
    "ordinal": 281,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20330,
    "category": "decision",
    "prompt": "배우고 싶은 수업 두 개의 시간이 겹치면 어떻게 고르나요?",
    "samples": [
      "다음에 다시 들을 수 있는지 먼저 확인해요.",
      "지금 더 필요한 내용을 다루는 쪽을 골라요.",
      "더 기다려 왔던 수업을 먼저 들어요."
    ],
    "ordinal": 293,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20331,
    "category": "decision",
    "prompt": "좋아 보이는 제안이 갑자기 들어오면 언제 답하는 편인가요?",
    "samples": [
      "그 자리에서 필요한 조건을 확인하고 답해요.",
      "하루쯤 생각할 시간을 달라고 말해요.",
      "기존 계획과 비교한 뒤 답을 주는 편이에요."
    ],
    "ordinal": 305,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20332,
    "category": "decision",
    "prompt": "아직 해 본 적 없는 일을 선택할 때 무엇을 근거로 삼나요?",
    "samples": [
      "비슷한 일을 했을 때 제 경험을 떠올려요.",
      "직접 해 본 사람들의 이야기를 모아 봐요.",
      "작게 시험해 본 뒤 느낌을 확인해요."
    ],
    "ordinal": 317,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20333,
    "category": "decision",
    "prompt": "나중에 후회할까 봐 결정을 못 내릴 때 어떻게 하나요?",
    "samples": [
      "각 선택에서 후회할 만한 점을 써 봐요.",
      "결정 후 바꿀 수 있는 부분을 확인해요.",
      "지금 가장 원하는 것을 기준으로 정해요."
    ],
    "ordinal": 329,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20334,
    "category": "decision",
    "prompt": "주변에서 인기 있는 활동을 시작할지는 어떻게 정하나요?",
    "samples": [
      "인기와 별개로 제 관심이 가는지 봐요.",
      "많이 찾는 이유가 궁금해 한 번 해 봐요.",
      "시간과 비용이 맞으면 가볍게 참여해요."
    ],
    "ordinal": 341,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20335,
    "category": "decision",
    "prompt": "오래 쓰던 물건을 새것으로 바꿀지는 무엇으로 결정하나요?",
    "samples": [
      "지금 물건이 제 역할을 하는지 먼저 봐요.",
      "새것으로 바꾸면 얼마나 편해질지 따져요.",
      "수리와 교체에 드는 비용을 비교해요."
    ],
    "ordinal": 353,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20336,
    "category": "decision",
    "prompt": "고민하던 선택에 새 정보가 생기면 어떻게 반영하나요?",
    "samples": [
      "처음부터 다시 비교해 결론을 내리는 편이에요.",
      "결정에 중요한 정보인지부터 구분해요.",
      "이미 정한 이유를 바꿀 만큼 큰지 살펴봐요."
    ],
    "ordinal": 365,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20337,
    "category": "decision",
    "prompt": "짧게 체험할 수 있는 기회가 있으면 얼마나 활용하나요?",
    "samples": [
      "직접 해 본 뒤 결정하는 편이 마음 편해요.",
      "설명만으로 판단하기 어려울 때 활용해요.",
      "관심이 확실하면 체험 없이 시작하기도 해요."
    ],
    "ordinal": 377,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20338,
    "category": "decision",
    "prompt": "처음 예상과 다른 결과가 나오면 다음 선택을 어떻게 하나요?",
    "samples": [
      "무엇이 달랐는지 살핀 뒤 방법을 바꿔요.",
      "한 번의 결과인지 더 지켜본 뒤 결정해요.",
      "다른 선택지도 다시 검토하는 편이에요."
    ],
    "ordinal": 389,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20339,
    "category": "decision",
    "prompt": "결정을 설명해 달라는 말을 들으면 어떤 내용을 먼저 말하나요?",
    "samples": [
      "제가 가장 중요하게 본 기준부터 말해요.",
      "비교한 선택지의 장단점부터 설명해요.",
      "그 선택을 했을 때의 제 느낌부터 말해요."
    ],
    "ordinal": 401,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20340,
    "category": "decision",
    "prompt": "평소 연습 시간에 오늘만 열리는 공연 초대를 받으면 어떻게 하나요?",
    "samples": [
      "공연을 놓쳤을 때 얼마나 아쉬울지 생각해요.",
      "연습을 하루 쉬어도 괜찮을지 따져 봐요.",
      "연습 시간을 옮길 수 있는지 확인해요."
    ],
    "ordinal": 413,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20341,
    "category": "decision",
    "prompt": "선택에 확신이 생기려면 어떤 확인이 필요한가요?",
    "samples": [
      "직접 경험해 보면 확신이 생기는 편이에요.",
      "여러 자료가 같은 방향을 가리키면 정해요.",
      "제 기준을 충족했는지 확인하면 충분해요."
    ],
    "ordinal": 425,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20342,
    "category": "decision",
    "prompt": "낯선 지역에서 살 곳을 고른다면 무엇부터 알아보나요?",
    "samples": [
      "매일 오갈 곳까지의 거리를 먼저 봐요.",
      "동네 분위기를 직접 걸으며 살펴봐요.",
      "생활비와 주거 조건부터 비교해 봐요."
    ],
    "ordinal": 437,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20343,
    "category": "decision",
    "prompt": "누군가 결정을 재촉하면 보통 어떻게 답하나요?",
    "samples": [
      "언제까지 답할 수 있는지 시간을 알려 줘요.",
      "지금 판단할 수 있는 범위에서 먼저 답해요.",
      "아직 확인할 조건이 무엇인지 설명해요."
    ],
    "ordinal": 449,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20344,
    "category": "decision",
    "prompt": "계획에 없던 여유 자금이 생기면 사용처를 어떻게 정하나요?",
    "samples": [
      "미뤄 둔 필요가 있었는지 먼저 돌아봐요.",
      "앞으로 필요한 시점을 생각해 남겨 둬요.",
      "오래 하고 싶었던 경험에 쓸지 생각해요."
    ],
    "ordinal": 461,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20345,
    "category": "decision",
    "prompt": "다들 같은 선택을 하는데 내 생각만 다르면 어떻게 하나요?",
    "samples": [
      "제가 다르게 보는 이유를 더 확인해요.",
      "다른 사람들이 고른 이유를 들어 봐요.",
      "제 기준에 맞으면 다른 쪽을 고르는 편이에요."
    ],
    "ordinal": 473,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20346,
    "category": "decision",
    "prompt": "작은 결정에도 다른 사람의 의견을 묻는 편인가요?",
    "samples": [
      "놓친 점이 있을까 봐 가볍게 물어봐요.",
      "제가 고민되는 선택에만 의견을 물어요.",
      "작은 일은 혼자 정하는 편이 더 편해요."
    ],
    "ordinal": 485,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20347,
    "category": "decision",
    "prompt": "나에게는 편하지만 비용이 더 드는 방법은 어떻게 판단하나요?",
    "samples": [
      "편해지는 정도를 실제로 비교해 봐요.",
      "반복해서 드는 비용인지 먼저 확인해요.",
      "피곤한 날처럼 필요할 때만 선택해요."
    ],
    "ordinal": 497,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20348,
    "category": "decision",
    "prompt": "정해 둔 예산 안에서 고르기 어려우면 무엇을 조정하나요?",
    "samples": [
      "원하는 조건 중 일부를 내려놓아요.",
      "결정 시기를 늦춰 선택지를 더 찾아요.",
      "사용 기간을 따져 예산을 조정할지 봐요."
    ],
    "ordinal": 509,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20349,
    "category": "decision",
    "prompt": "중요한 선택을 앞두면 혼자 생각할 시간이 필요한가요?",
    "samples": [
      "여러 의견을 들어도 마지막에는 혼자 정리해요.",
      "말하면서 생각이 정리돼 대화하는 편이에요.",
      "자료를 살펴보는 시간이 있으면 충분해요."
    ],
    "ordinal": 521,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20350,
    "category": "decision",
    "prompt": "전에 잘됐던 방법이 이번에는 맞지 않을 것 같으면 어떻게 하나요?",
    "samples": [
      "현재 상황에 맞게 일부를 바꿔 써요.",
      "작게 적용해 본 뒤 계속 쓸지 결정해요.",
      "이번 상황에 맞는 다른 방법을 찾아요."
    ],
    "ordinal": 533,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20351,
    "category": "decision",
    "prompt": "선택 후 만족하지 못하면 어떤 기준으로 바꿀지 정하나요?",
    "samples": [
      "불편함이 일시적인지 먼저 지켜봐요.",
      "바꾸는 데 드는 수고와 이익을 비교해요.",
      "처음 기대한 핵심이 충족됐는지 봐요."
    ],
    "ordinal": 545,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20352,
    "category": "decision",
    "prompt": "여러 선택지를 비교할 때 기록을 남기는 편인가요?",
    "samples": [
      "중요한 조건을 표로 만들어 비교해요.",
      "기억하고 싶은 장단점만 짧게 적어요.",
      "직접 비교하며 머릿속으로 정리하는 편이에요."
    ],
    "ordinal": 557,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20353,
    "category": "decision",
    "prompt": "관심 있는 수업 두 개의 비용과 시간이 같다면 무엇을 보고 고르나요?",
    "samples": [
      "더 오래 관심을 가져 온 쪽이 결정적이에요.",
      "함께할 사람이나 환경이 더 끌리는 쪽이에요.",
      "새롭게 배울 수 있는 것이 많은 쪽이에요."
    ],
    "ordinal": 569,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20354,
    "category": "decision",
    "prompt": "아직 필요하지 않은 물건이 크게 할인하면 어떻게 하나요?",
    "samples": [
      "앞으로 쓸 시점이 확실한지 먼저 생각해요.",
      "정가에도 사고 싶었을 물건인지 따져요.",
      "보관할 공간과 예산이 되면 미리 준비해요."
    ],
    "ordinal": 581,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20355,
    "category": "decision",
    "prompt": "시작한 취미를 계속할지 고민할 때 무엇을 살펴보나요?",
    "samples": [
      "하는 동안 즐거운 시간이 얼마나 되는지 봐요.",
      "실력이 늘고 싶은 마음이 남아 있는지 봐요.",
      "현재 생활에 무리가 되는 부분이 있는지 봐요."
    ],
    "ordinal": 593,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20356,
    "category": "decision",
    "prompt": "전문가의 설명과 내 경험이 다르면 어떻게 판단하나요?",
    "samples": [
      "두 경우의 조건이 어떻게 다른지 알아봐요.",
      "제 경험이 반복되는지 조금 더 확인해요.",
      "다른 전문가의 설명도 찾아서 비교해요."
    ],
    "ordinal": 605,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20357,
    "category": "decision",
    "prompt": "여행지의 숙소 위치와 시설 중 무엇을 더 중요하게 보나요?",
    "samples": [
      "이동을 줄일 수 있는 위치를 더 중요하게 봐요.",
      "돌아와 편히 쉴 수 있는 시설을 먼저 봐요.",
      "이번 여행에서 숙소에 머물 시간을 따져요."
    ],
    "ordinal": 617,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20358,
    "category": "decision",
    "prompt": "고르기 어려운 일을 잠시 미뤄 두면 도움이 되는 편인가요?",
    "samples": [
      "다른 일을 하고 오면 생각이 또렷해져요.",
      "계속 마음에 걸려 빨리 정하는 편이 나아요.",
      "새 정보가 더 나올 때만 미루는 게 도움 돼요."
    ],
    "ordinal": 629,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20359,
    "category": "decision",
    "prompt": "선택의 결과를 미리 알 수 없을 때 어떤 준비를 하나요?",
    "samples": [
      "잘 안될 경우의 다음 방법을 생각해 둬요.",
      "감당할 수 있는 범위부터 정해 둬요.",
      "일단 시작하고 확인할 시점을 정해 둬요."
    ],
    "ordinal": 641,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20360,
    "category": "decision",
    "prompt": "마음에 드는 수업이 멀리서 열리면 참여를 어떻게 결정하나요?",
    "samples": [
      "이동에 드는 시간을 꾸준히 낼 수 있는지 봐요.",
      "가까운 곳에서 비슷한 수업을 먼저 찾아봐요.",
      "그 수업에서만 얻을 수 있는 것을 생각해요."
    ],
    "ordinal": 653,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20361,
    "category": "decision",
    "prompt": "두 선택지 모두 아쉬운 점이 크면 어떻게 하나요?",
    "samples": [
      "새로운 선택지를 더 찾을 시간을 정해요.",
      "꼭 피하고 싶은 단점이 적은 쪽을 골라요.",
      "지금 결정하지 않아도 되는지 먼저 살펴요."
    ],
    "ordinal": 665,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20362,
    "category": "decision",
    "prompt": "오래 고민한 결정을 바꿔도 괜찮다고 느끼는 때는 언제인가요?",
    "samples": [
      "제 생활이나 필요가 달라졌을 때 바꿔요.",
      "처음 몰랐던 중요한 사실을 알게 됐을 때예요.",
      "직접 해 보니 맞지 않는다는 확신이 들 때예요."
    ],
    "ordinal": 677,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20363,
    "category": "decision",
    "prompt": "지인의 경험담을 참고할 때 어떤 부분을 가장 주의 깊게 듣나요?",
    "samples": [
      "그 사람과 제 상황이 얼마나 비슷한지 들어요.",
      "잘된 점보다 예상하지 못했던 점을 들어요.",
      "실제로 해 보고 만족한 이유를 자세히 들어요."
    ],
    "ordinal": 689,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20364,
    "category": "decision",
    "prompt": "결정하기 전에 최악의 경우를 생각하는 편인가요?",
    "samples": [
      "감당할 수 있는지 보려고 먼저 생각해 봐요.",
      "가능성이 높은 결과부터 생각하는 편이에요.",
      "중요한 선택일 때만 따로 시간을 들여 봐요."
    ],
    "ordinal": 701,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20365,
    "category": "decision",
    "prompt": "선택을 마친 뒤 다른 선택지의 정보도 계속 찾아보나요?",
    "samples": [
      "결정이 괜찮았는지 한동안 더 찾아봐요.",
      "이미 고른 것을 활용할 정보만 찾아봐요.",
      "바꿀 가능성이 남아 있을 때만 찾아봐요."
    ],
    "ordinal": 713,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20366,
    "category": "decision",
    "prompt": "마지막까지 결정을 못 내리면 어떤 기준으로 마무리하나요?",
    "samples": [
      "처음에 가장 중요하다고 정한 기준을 따라요.",
      "지금 더 해 보고 싶은 쪽으로 정해요.",
      "나중에 바꾸기 쉬운 쪽을 선택하는 편이에요."
    ],
    "ordinal": 725,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20367,
    "category": "curiosity",
    "prompt": "처음 배우는 취미가 생기면 어떤 방식으로 시작하나요?",
    "samples": [
      "기초를 설명하는 자료부터 차근차근 봐요.",
      "간단한 것부터 직접 만들어 보며 익혀요.",
      "입문 수업에 참여해서 함께 배워요."
    ],
    "ordinal": 8,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20368,
    "category": "curiosity",
    "prompt": "전혀 모르는 주제의 이야기를 들으면 보통 어떻게 하나요?",
    "samples": [
      "모르는 부분을 바로 물어보는 편이에요.",
      "우선 끝까지 듣고 나중에 찾아봐요.",
      "제가 아는 내용과 연결해서 이해해 봐요."
    ],
    "ordinal": 20,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20369,
    "category": "curiosity",
    "prompt": "평소와 다른 장르의 영화를 추천받으면 어떻게 고르나요?",
    "samples": [
      "예고편을 보고 관심이 생기면 시도해요.",
      "추천한 이유가 궁금해서 일단 봐요.",
      "비슷한 분위기의 짧은 영상부터 찾아봐요."
    ],
    "ordinal": 32,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20370,
    "category": "curiosity",
    "prompt": "새로 배운 내용을 기억하려고 어떤 방법을 쓰나요?",
    "samples": [
      "제 말로 짧게 정리해 적어 두는 편이에요.",
      "생활에서 바로 쓸 수 있는 곳을 찾아요.",
      "다른 사람에게 설명해 보면서 기억해요."
    ],
    "ordinal": 44,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20371,
    "category": "curiosity",
    "prompt": "어떤 현상이 왜 생기는지 궁금해지면 어디까지 알아보나요?",
    "samples": [
      "이유를 대략 이해하면 만족하는 편이에요.",
      "관련된 다른 원리까지 이어서 찾아봐요.",
      "직접 관찰하거나 시험할 방법을 찾아요."
    ],
    "ordinal": 56,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20372,
    "category": "curiosity",
    "prompt": "처음 쓰는 기기의 기능은 어떻게 익히는 편인가요?",
    "samples": [
      "설명서를 먼저 읽고 차례대로 써 봐요.",
      "자주 쓸 기능부터 직접 눌러 보며 익혀요.",
      "소개 영상을 보고 따라 하는 편이에요."
    ],
    "ordinal": 68,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20373,
    "category": "curiosity",
    "prompt": "취미를 배우다가 어려운 부분을 만나면 어떻게 접근하나요?",
    "samples": [
      "기초 단계로 돌아가 다시 익혀 봐요.",
      "다른 사람의 방법을 보고 따라 해 봐요.",
      "여러 방법을 바꿔 가며 직접 시도해요."
    ],
    "ordinal": 80,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20374,
    "category": "curiosity",
    "prompt": "여행지에서 계획에 없던 전시를 발견하면 어떻게 하나요?",
    "samples": [
      "주제를 살펴보고 흥미가 생기면 들어가요.",
      "남은 일정에 여유가 있는지 먼저 봐요.",
      "전시 정보를 챙겨 두고 나중에 알아봐요."
    ],
    "ordinal": 92,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20375,
    "category": "curiosity",
    "prompt": "읽던 책에서 낯선 단어가 나오면 어떻게 하나요?",
    "samples": [
      "뜻을 바로 찾아보고 이어서 읽어요.",
      "문맥으로 짐작하며 읽고 나중에 확인해요.",
      "읽는 데 꼭 필요할 때만 찾아보는 편이에요."
    ],
    "ordinal": 104,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20376,
    "category": "curiosity",
    "prompt": "새롭게 알게 된 흥미로운 사실은 어떻게 다루나요?",
    "samples": [
      "관련된 자료를 더 찾아서 읽어 봐요.",
      "누군가에게 이야기하며 생각을 나눠요.",
      "기억해 두었다가 필요할 때 활용해요."
    ],
    "ordinal": 116,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20377,
    "category": "curiosity",
    "prompt": "익숙한 방식보다 나은 방법을 발견하면 어떻게 시도하나요?",
    "samples": [
      "작은 일에 먼저 적용해서 비교해 봐요.",
      "방법을 충분히 이해한 다음 바꿔요.",
      "기존 방식과 섞어서 제게 맞게 써 봐요."
    ],
    "ordinal": 128,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20378,
    "category": "curiosity",
    "prompt": "직접 해 볼 수 있는 체험 전시에서는 어떻게 참여하나요?",
    "samples": [
      "안내를 읽고 원리부터 이해해 보려고 해요.",
      "일단 조작해 보고 어떤 일이 생기는지 봐요.",
      "다른 사람이 하는 모습을 먼저 지켜봐요."
    ],
    "ordinal": 140,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20379,
    "category": "curiosity",
    "prompt": "배우고 싶은 주제가 여러 개 생기면 어떻게 탐색하나요?",
    "samples": [
      "각 주제의 입문 자료를 조금씩 살펴봐요.",
      "가장 궁금한 한 가지부터 깊게 알아봐요.",
      "공통으로 연결되는 부분을 먼저 찾아봐요."
    ],
    "ordinal": 152,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20380,
    "category": "curiosity",
    "prompt": "자주 가는 동네에서 처음 보는 골목을 발견하면 어떻게 하나요?",
    "samples": [
      "시간이 있으면 직접 걸어가 보는 편이에요.",
      "지도에서 어디로 이어지는지 먼저 봐요.",
      "다음에 산책할 때 가 볼 곳으로 기억해 둬요."
    ],
    "ordinal": 164,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20381,
    "category": "curiosity",
    "prompt": "어떤 설명이 내 예상과 다르면 어떻게 반응하나요?",
    "samples": [
      "왜 다른지 이유부터 자세히 물어봐요.",
      "제가 알고 있던 내용을 다시 확인해요.",
      "두 설명이 적용되는 상황을 비교해 봐요."
    ],
    "ordinal": 176,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20382,
    "category": "curiosity",
    "prompt": "새로운 것을 배울 때 전체 그림과 세부 내용 중 무엇부터 보나요?",
    "samples": [
      "전체가 어떻게 연결되는지 먼저 살펴봐요.",
      "구체적인 예를 보면서 구조를 이해해요.",
      "궁금한 부분부터 보고 범위를 넓혀 가요."
    ],
    "ordinal": 188,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20383,
    "category": "curiosity",
    "prompt": "관심 있는 분야의 무료 강연을 발견하면 무엇을 확인하나요?",
    "samples": [
      "다루는 내용이 제 수준에 맞는지 봐요.",
      "평소 궁금했던 질문을 다루는지 확인해요.",
      "직접 참여할 시간과 장소가 맞는지 봐요."
    ],
    "ordinal": 200,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20384,
    "category": "curiosity",
    "prompt": "처음 가 본 미술관에서는 작품을 어떤 순서로 보나요?",
    "samples": [
      "안내된 순서를 따라 전체를 둘러봐요.",
      "눈길이 가는 작품부터 천천히 보는 편이에요.",
      "설명을 읽고 궁금한 작품을 먼저 찾아요."
    ],
    "ordinal": 212,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20385,
    "category": "curiosity",
    "prompt": "배운 방법대로 했는데 결과가 다르면 어떻게 하나요?",
    "samples": [
      "어느 단계부터 달랐는지 하나씩 확인해요.",
      "조건을 조금씩 바꿔서 다시 시도해요.",
      "같은 경험을 한 사람의 설명을 찾아봐요."
    ],
    "ordinal": 224,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20386,
    "category": "curiosity",
    "prompt": "오래 즐긴 취미가 단조로워지면 무엇을 바꿔 보나요?",
    "samples": [
      "평소 안 하던 방식이나 도구를 써 봐요.",
      "조금 더 어려운 과제에 도전해 봐요.",
      "잠시 다른 취미를 해 본 뒤 다시 돌아와요."
    ],
    "ordinal": 236,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20387,
    "category": "curiosity",
    "prompt": "낯선 나라의 생활 문화를 접하면 어떤 점이 궁금한가요?",
    "samples": [
      "그 문화가 생긴 배경부터 궁금해져요.",
      "그곳 사람들의 일상 모습이 궁금해요.",
      "제 생활과 다른 점을 직접 경험해 보고 싶어요."
    ],
    "ordinal": 248,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20388,
    "category": "curiosity",
    "prompt": "무언가를 처음 만들 때 설명서대로 따라가는 편인가요?",
    "samples": [
      "기본 형태를 완성한 뒤 제 방식으로 바꿔요.",
      "재료를 만져 보며 처음부터 자유롭게 만들어요.",
      "중요한 순서만 따르고 세부는 바꿔 보는 편이에요."
    ],
    "ordinal": 260,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20389,
    "category": "curiosity",
    "prompt": "흥미로운 다큐멘터리를 본 뒤에는 무엇을 하나요?",
    "samples": [
      "나온 주제의 다른 자료를 찾아보는 편이에요.",
      "인상 깊었던 내용을 누군가와 이야기해요.",
      "기억에 남는 장면을 혼자 다시 생각해 봐요."
    ],
    "ordinal": 272,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20390,
    "category": "curiosity",
    "prompt": "좋아하는 분야를 더 배울 때 다음 주제는 어떻게 고르나요?",
    "samples": [
      "아직 잘 모르는 기초 부분부터 골라요.",
      "지금 가장 궁금한 질문을 따라가는 편이에요.",
      "완성해 보고 싶은 결과물을 먼저 정해요."
    ],
    "ordinal": 284,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20391,
    "category": "curiosity",
    "prompt": "인터넷에서 흥미롭지만 의심스러운 설명을 보면 어떻게 하나요?",
    "samples": [
      "처음 나온 자료가 어디인지 확인해요.",
      "다른 설명과 비교해서 살펴보는 편이에요.",
      "판단을 미루고 확실한 정보가 나오는지 봐요."
    ],
    "ordinal": 296,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20392,
    "category": "curiosity",
    "prompt": "관심 없던 분야에서 의외로 재미를 느끼면 어떻게 하나요?",
    "samples": [
      "입문할 만한 쉬운 자료부터 찾아봐요.",
      "왜 재미있었는지 생각해 보고 다시 경험해요.",
      "그 분야를 좋아하는 사람에게 더 물어봐요."
    ],
    "ordinal": 308,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20393,
    "category": "curiosity",
    "prompt": "수업 중 궁금한 점이 생기면 언제 해결하는 편인가요?",
    "samples": [
      "질문할 수 있는 시간에 바로 물어봐요.",
      "일단 적어 두고 수업 후에 직접 찾아봐요.",
      "내용을 끝까지 들은 뒤에도 궁금하면 물어요."
    ],
    "ordinal": 320,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20394,
    "category": "curiosity",
    "prompt": "새로운 운동을 배울 때 무엇을 먼저 익히고 싶나요?",
    "samples": [
      "기본 자세를 충분히 익히고 싶어요.",
      "간단한 동작을 연결해 직접 해 보고 싶어요.",
      "전체 진행 방식을 알고 시작하고 싶어요."
    ],
    "ordinal": 332,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20395,
    "category": "curiosity",
    "prompt": "어떤 아이디어가 떠오르면 어떻게 남겨 두나요?",
    "samples": [
      "잊기 전에 메모나 음성으로 바로 남겨요.",
      "간단하게 그려서 형태를 잡아 보는 편이에요.",
      "계속 생각해 보다 쓸 만한 것만 정리해요."
    ],
    "ordinal": 344,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20396,
    "category": "curiosity",
    "prompt": "문제를 해결하는 방법이 하나 떠오르면 더 찾아보나요?",
    "samples": [
      "다른 방법도 비교해 보고 정하는 편이에요.",
      "그 방법을 먼저 해 보고 필요하면 더 찾아요.",
      "시간이 허락하면 전혀 다른 방식도 생각해요."
    ],
    "ordinal": 356,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20397,
    "category": "curiosity",
    "prompt": "완성된 작품을 볼 때 만드는 과정도 궁금해지나요?",
    "samples": [
      "어떤 도구와 순서로 만들었는지 찾아봐요.",
      "제게 인상적인 부분이 있을 때만 알아봐요.",
      "완성된 모습을 제 방식대로 느끼는 편이에요."
    ],
    "ordinal": 368,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20398,
    "category": "curiosity",
    "prompt": "평소 안 듣던 음악을 발견하면 어떻게 더 알아가나요?",
    "samples": [
      "같은 음악가의 다른 곡부터 들어 봐요.",
      "비슷한 분위기의 곡을 찾아 듣는 편이에요.",
      "그 곡을 여러 번 들으며 익숙해져 봐요."
    ],
    "ordinal": 380,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20399,
    "category": "curiosity",
    "prompt": "직접 경험한 것과 책의 설명을 연결해 보는 편인가요?",
    "samples": [
      "일상에서 비슷한 장면을 찾아보는 편이에요.",
      "차이가 보이면 그 이유를 따로 알아봐요.",
      "필요한 상황이 생겼을 때 떠올리는 편이에요."
    ],
    "ordinal": 392,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20400,
    "category": "curiosity",
    "prompt": "배우던 내용을 더 쉬운 말로 설명해야 하면 어떻게 하나요?",
    "samples": [
      "일상에서 볼 수 있는 예를 찾아 설명해요.",
      "그림이나 순서도를 그려서 보여 줘요.",
      "핵심 내용을 짧게 나눠서 이야기해요."
    ],
    "ordinal": 404,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20401,
    "category": "curiosity",
    "prompt": "어떤 일에 익숙해진 뒤에도 새로운 방법을 배우나요?",
    "samples": [
      "다른 방법이 있으면 꾸준히 찾아보는 편이에요.",
      "지금 방법이 불편해졌을 때 찾아봐요.",
      "여유가 생기면 재미로 다른 방식도 익혀요."
    ],
    "ordinal": 416,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20402,
    "category": "curiosity",
    "prompt": "처음 보는 보드게임을 배울 때 어떤 설명이 편한가요?",
    "samples": [
      "규칙을 처음부터 끝까지 듣고 시작해요.",
      "연습을 한 판 해 보면서 규칙을 익혀요.",
      "예시 상황을 보며 필요한 규칙부터 배워요."
    ],
    "ordinal": 428,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20403,
    "category": "curiosity",
    "prompt": "누군가 내 생각과 다른 해석을 말하면 무엇이 궁금해지나요?",
    "samples": [
      "어떤 경험 때문에 그렇게 느꼈는지 궁금해요.",
      "제가 놓친 근거가 있는지 알고 싶어요.",
      "같은 장면을 어떻게 다르게 봤는지 궁금해요."
    ],
    "ordinal": 440,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20404,
    "category": "curiosity",
    "prompt": "학습 자료가 너무 많으면 어떤 방식으로 시작하나요?",
    "samples": [
      "믿을 만한 입문 자료 하나를 끝까지 봐요.",
      "여러 자료를 훑어 제게 맞는 것을 골라요.",
      "궁금한 질문에 답하는 부분부터 찾아봐요."
    ],
    "ordinal": 452,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20405,
    "category": "curiosity",
    "prompt": "처음 시도한 방법이 잘되면 다음에는 어떻게 해 보나요?",
    "samples": [
      "같은 결과가 나오는지 다시 해 보는 편이에요.",
      "한 가지 조건을 바꿔 차이를 확인해요.",
      "더 어려운 상황에도 적용해 보고 싶어요."
    ],
    "ordinal": 464,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20406,
    "category": "curiosity",
    "prompt": "관심이 생긴 취미의 장비는 언제 준비하는 편인가요?",
    "samples": [
      "빌리거나 체험해 본 뒤 필요한 것을 사요.",
      "기본 장비부터 마련해서 시작하는 편이에요.",
      "한동안 배우면서 제게 맞는 장비를 알아봐요."
    ],
    "ordinal": 476,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20407,
    "category": "curiosity",
    "prompt": "읽던 책이 예상과 전혀 다른 내용이면 어떻게 하나요?",
    "samples": [
      "새로운 내용이 궁금해서 더 읽어 봐요.",
      "목차를 다시 보고 관심 가는 부분을 찾아요.",
      "지금 원하는 책인지 생각해 이어 읽을지 정해요."
    ],
    "ordinal": 488,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20408,
    "category": "curiosity",
    "prompt": "새로운 기술을 익힐 때 진행 과정을 기록하나요?",
    "samples": [
      "무엇이 잘되고 막혔는지 짧게 적어 둬요.",
      "처음과 나중의 결과를 남겨 비교해요.",
      "기록보다는 직접 반복하는 데 집중해요."
    ],
    "ordinal": 500,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20409,
    "category": "curiosity",
    "prompt": "궁금한 질문에 답을 찾았는데 새 의문이 생기면 어떻게 하나요?",
    "samples": [
      "연결된 의문을 계속 따라가 보는 편이에요.",
      "새 질문을 적어 두고 다음에 찾아봐요.",
      "처음 목적이 해결됐으면 잠깐 멈춰요."
    ],
    "ordinal": 512,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20410,
    "category": "curiosity",
    "prompt": "혼자 배우는 것과 수업을 듣는 것 중 어떻게 시작하나요?",
    "samples": [
      "혼자 조금 해 본 뒤 필요하면 수업을 들어요.",
      "기초를 제대로 잡으려고 수업부터 찾아요.",
      "주제의 난이도와 자료를 보고 정해요."
    ],
    "ordinal": 524,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20411,
    "category": "curiosity",
    "prompt": "새로운 도구를 써 볼 때 가장 먼저 시험하는 것은 뭔가요?",
    "samples": [
      "평소 하던 일을 얼마나 편하게 하는지 봐요.",
      "다른 도구에는 없던 기능부터 써 봐요.",
      "간단한 작업으로 기본 사용법부터 익혀요."
    ],
    "ordinal": 536,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20412,
    "category": "curiosity",
    "prompt": "설명서대로 만든 작품이 예시 사진과 다르게 나오면 어떻게 하나요?",
    "samples": [
      "왜 그렇게 됐는지 과정을 다시 살펴봐요.",
      "그 모습을 활용할 다른 방법을 생각해요.",
      "원래 의도대로 다시 해 본 뒤 비교해요."
    ],
    "ordinal": 548,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20413,
    "category": "curiosity",
    "prompt": "하루 체험 수업에서 재미를 느끼면 다음에는 뭘 하나요?",
    "samples": [
      "집에서도 할 수 있는 간단한 방법을 찾아요.",
      "조금 더 배울 수 있는 수업을 알아봐요.",
      "다른 분야도 체험해 보고 비교해 봐요."
    ],
    "ordinal": 560,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20414,
    "category": "curiosity",
    "prompt": "낯선 주제의 대화에 참여하려면 무엇을 먼저 알고 싶나요?",
    "samples": [
      "자주 나오는 기본 용어부터 알고 싶어요.",
      "사람들이 그 주제를 좋아하는 이유가 궁금해요.",
      "최근에 어떤 일이 있었는지부터 듣고 싶어요."
    ],
    "ordinal": 572,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20415,
    "category": "curiosity",
    "prompt": "새로운 것을 배우며 틀린 부분을 알게 되면 어떻게 다루나요?",
    "samples": [
      "왜 틀렸는지 정리해서 다음에 참고해요.",
      "그 부분을 다시 해 보며 감각을 익혀요.",
      "다른 예에도 적용해 보며 이해를 확인해요."
    ],
    "ordinal": 584,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20416,
    "category": "curiosity",
    "prompt": "예전에 포기했던 활동을 다시 해 보고 싶어지면 어떻게 시작하나요?",
    "samples": [
      "그때 어려웠던 부분부터 다시 살펴봐요.",
      "처음 배우는 마음으로 기초부터 시작해요.",
      "이번에는 다른 방법이나 환경을 찾아봐요."
    ],
    "ordinal": 596,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20417,
    "category": "curiosity",
    "prompt": "일상에서 불편한 점을 발견하면 어떤 생각을 하나요?",
    "samples": [
      "더 편하게 바꿀 방법을 직접 궁리해요.",
      "다른 사람들은 어떻게 하는지 찾아봐요.",
      "불편함이 반복되는 조건부터 살펴봐요."
    ],
    "ordinal": 608,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20418,
    "category": "curiosity",
    "prompt": "처음 듣는 주장의 근거를 확인할 때 무엇을 찾아보나요?",
    "samples": [
      "직접 확인할 수 있는 자료를 먼저 찾아요.",
      "반대 의견에서는 어떻게 설명하는지 봐요.",
      "그 주장이 나온 상황과 전제를 살펴봐요."
    ],
    "ordinal": 620,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20419,
    "category": "curiosity",
    "prompt": "새로운 경험을 고를 때 얼마나 낯선 것을 원하나요?",
    "samples": [
      "익숙한 경험과 조금 다른 정도가 좋아요.",
      "평소와 전혀 다른 경험을 해 보고 싶어요.",
      "그날의 여유와 컨디션에 따라 달라져요."
    ],
    "ordinal": 632,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20420,
    "category": "curiosity",
    "prompt": "배운 것을 실제로 써 볼 기회가 없으면 어떻게 하나요?",
    "samples": [
      "작은 연습 상황을 직접 만들어 봐요.",
      "필요할 때 다시 볼 수 있게 정리해 둬요.",
      "비슷한 활동에 연결해 써 볼 곳을 찾아요."
    ],
    "ordinal": 644,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20421,
    "category": "curiosity",
    "prompt": "책이나 강의를 고를 때 익숙한 설명과 낯선 관점 중 무엇에 끌리나요?",
    "samples": [
      "지식을 정리해 주는 익숙한 설명에 끌려요.",
      "생각을 넓혀 주는 낯선 관점이 궁금해요.",
      "지금 알고 싶은 내용을 기준으로 고르는 편이에요."
    ],
    "ordinal": 656,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20422,
    "category": "curiosity",
    "prompt": "재미있는 실험을 보고 직접 따라 하고 싶으면 어떻게 준비하나요?",
    "samples": [
      "안전하게 할 수 있는 조건부터 확인해요.",
      "작은 규모로 해 볼 방법을 찾아봐요.",
      "과정과 필요한 재료를 충분히 알아봐요."
    ],
    "ordinal": 668,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20423,
    "category": "curiosity",
    "prompt": "다른 사람의 작품에서 마음에 드는 점을 발견하면 어떻게 하나요?",
    "samples": [
      "그 부분이 어떻게 만들어졌는지 살펴봐요.",
      "제 작업에 맞게 바꿔 써 볼 방법을 생각해요.",
      "좋았던 점을 적어 두고 나중에 참고해요."
    ],
    "ordinal": 680,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20424,
    "category": "curiosity",
    "prompt": "한 분야를 오래 배우면 다른 분야에도 관심이 생기나요?",
    "samples": [
      "연결되는 분야를 찾아 함께 공부하는 편이에요.",
      "한 분야를 충분히 익힌 뒤 넓혀 가고 싶어요.",
      "관련 없어도 재미있는 분야면 새로 시작해요."
    ],
    "ordinal": 692,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20425,
    "category": "curiosity",
    "prompt": "배우는 속도가 예상보다 느리면 학습 방법을 어떻게 바꾸나요?",
    "samples": [
      "설명을 듣는 대신 직접 해 보는 시간을 늘려요.",
      "한 번에 배우는 양을 줄여 반복해요.",
      "다른 자료나 선생님의 설명을 찾아봐요."
    ],
    "ordinal": 704,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20426,
    "category": "curiosity",
    "prompt": "새로운 경험을 한 뒤 가장 오래 생각나는 것은 무엇인가요?",
    "samples": [
      "예상과 달랐던 점이 오래 생각나요.",
      "제가 어떤 반응을 했는지가 기억에 남아요.",
      "다음에 더 해 보고 싶은 부분이 떠올라요."
    ],
    "ordinal": 716,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20427,
    "category": "curiosity",
    "prompt": "평소 관심 밖이던 주제를 알아볼 시간은 어떻게 만들고 있나요?",
    "samples": [
      "가끔 낯선 책이나 강의를 의식적으로 골라요.",
      "우연히 재미있는 내용을 만나면 시간을 내요.",
      "익숙한 활동과 연결되는 주제부터 넓혀 가요."
    ],
    "ordinal": 728,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20428,
    "category": "independence",
    "prompt": "방법을 자유롭게 정해도 되는 일을 맡으면 어떻게 시작하나요?",
    "samples": [
      "제 방식으로 대략 해 보며 방향을 잡아요.",
      "기대하는 결과가 무엇인지 먼저 물어봐요.",
      "비슷한 사례를 참고해 제 방법을 정해요."
    ],
    "ordinal": 11,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20429,
    "category": "independence",
    "prompt": "처음 해 보는 활동에 함께 갈 사람이 없으면 어떻게 하나요?",
    "samples": [
      "혼자 참여할 수 있는 방법을 찾아봐요.",
      "함께할 사람을 조금 더 기다려 보는 편이에요.",
      "온라인이나 집에서 먼저 경험해 봐요."
    ],
    "ordinal": 23,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20430,
    "category": "independence",
    "prompt": "안내된 방법보다 내 방식이 편하다고 느끼면 어떻게 하나요?",
    "samples": [
      "결과에 문제가 없는지 확인하고 바꿔요.",
      "처음에는 안내대로 해 본 뒤 비교해요.",
      "꼭 따라야 하는 부분이 무엇인지 물어봐요."
    ],
    "ordinal": 35,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20431,
    "category": "independence",
    "prompt": "혼자 일을 하다가 막히면 언제 도움을 구하나요?",
    "samples": [
      "몇 가지 방법을 직접 해 본 뒤 물어봐요.",
      "모르는 부분을 확인하면 바로 도움을 구해요.",
      "시간을 정해 두고 해결되지 않으면 물어봐요."
    ],
    "ordinal": 47,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20432,
    "category": "independence",
    "prompt": "혼자 외출했는데 가려던 곳이 휴무라면 어떻게 움직이나요?",
    "samples": [
      "주변을 걸으며 다른 곳을 직접 찾아요.",
      "지도를 보고 가까운 대안을 정하는 편이에요.",
      "누군가에게 추천할 곳이 있는지 물어봐요."
    ],
    "ordinal": 59,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20433,
    "category": "independence",
    "prompt": "누가 확인하지 않는 일도 꾸준히 하려면 무엇이 도움이 되나요?",
    "samples": [
      "제게 필요한 이유를 분명히 해 두는 것이요.",
      "스스로 확인할 수 있는 작은 기록이 도움 돼요.",
      "함께 진행 상황을 나눌 사람이 있으면 좋아요."
    ],
    "ordinal": 71,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20434,
    "category": "independence",
    "prompt": "처음 처리하는 생활 업무가 생기면 어디서부터 알아보나요?",
    "samples": [
      "공식 안내를 찾아 순서대로 읽어 봐요.",
      "처리해 본 사람에게 흐름부터 물어봐요.",
      "담당 창구에 문의해서 필요한 것을 확인해요."
    ],
    "ordinal": 83,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20435,
    "category": "independence",
    "prompt": "혼자 여행할 때 하루의 방향은 어떻게 정하나요?",
    "samples": [
      "아침에 제 컨디션을 보고 직접 정해요.",
      "가이드북의 코스를 골라 따라가는 편이에요.",
      "숙소 직원이나 현지인의 추천을 참고해요."
    ],
    "ordinal": 95,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20436,
    "category": "independence",
    "prompt": "배우는 속도를 스스로 정할 수 있다면 어떻게 진행하나요?",
    "samples": [
      "충분히 이해했다고 느껴지면 다음으로 가요.",
      "정해진 교재의 진도를 기준으로 맞춰요.",
      "실제로 써 보며 필요한 부분부터 익혀요."
    ],
    "ordinal": 107,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20437,
    "category": "independence",
    "prompt": "함께할 사람과 시간이 계속 안 맞으면 어떻게 하나요?",
    "samples": [
      "혼자 먼저 해 보고 나중에 같이 하자고 해요.",
      "그 활동은 함께할 수 있을 때까지 기다려요.",
      "같이 할 부분과 혼자 할 부분을 나눠 봐요."
    ],
    "ordinal": 119,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20438,
    "category": "independence",
    "prompt": "내가 고른 방법에 다른 사람이 의문을 제기하면 어떻게 하나요?",
    "samples": [
      "제가 그 방법을 고른 이유를 설명해요.",
      "놓친 조건이 있는지 다시 살펴보는 편이에요.",
      "작게 시험한 결과를 보고 판단하자고 해요."
    ],
    "ordinal": 131,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20439,
    "category": "independence",
    "prompt": "다른 사람이 대신 선택해 주면 편한 일은 어떤 일인가요?",
    "samples": [
      "조건이 비슷해서 오래 고민하게 되는 일이요.",
      "제가 잘 모르는 분야의 작은 선택이 편해요.",
      "어떤 일이든 마지막 선택은 직접 하고 싶어요."
    ],
    "ordinal": 143,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20440,
    "category": "independence",
    "prompt": "칭찬이나 평가가 없어도 잘하고 있는지 어떻게 확인하나요?",
    "samples": [
      "처음 정한 기준에 얼마나 가까운지 봐요.",
      "예전 결과와 지금 결과를 비교해 봐요.",
      "믿을 만한 사람에게 구체적인 의견을 물어요."
    ],
    "ordinal": 155,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20441,
    "category": "independence",
    "prompt": "누군가 알아서 정해 주겠다고 하면 어떻게 답하나요?",
    "samples": [
      "제게 중요한 조건만 알려 주고 맡겨요.",
      "선택지를 몇 개 보여 달라고 말해요.",
      "제가 직접 정하고 싶은 부분을 설명해요."
    ],
    "ordinal": 167,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20442,
    "category": "independence",
    "prompt": "모임에서 자유 시간이 주어지면 어떤 방식이 편한가요?",
    "samples": [
      "혼자 원하는 곳을 둘러보는 것이 편해요.",
      "마음이 맞는 사람들과 함께 움직이고 싶어요.",
      "한동안 같이 다니다 따로 움직이는 게 좋아요."
    ],
    "ordinal": 179,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20443,
    "category": "independence",
    "prompt": "좋아하는 활동을 주변에서 아무도 하지 않으면 어떻게 즐기나요?",
    "samples": [
      "혼자 할 수 있는 방식으로 계속 즐겨요.",
      "같은 관심사를 가진 모임을 찾아보는 편이에요.",
      "주변 사람에게 가볍게 함께 해 보자고 해요."
    ],
    "ordinal": 191,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20444,
    "category": "independence",
    "prompt": "조언을 많이 들었는데 내 생각이 더 확실하면 어떻게 하나요?",
    "samples": [
      "제 판단을 선택하고 결과를 지켜봐요.",
      "다르게 생각한 이유를 한 번 더 물어봐요.",
      "작은 부분부터 제 생각대로 해 보는 편이에요."
    ],
    "ordinal": 203,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20445,
    "category": "independence",
    "prompt": "오랫동안 따르던 방식이 내게 맞지 않으면 어떻게 바꾸나요?",
    "samples": [
      "저에게 맞는 방법을 직접 만들어 봐요.",
      "다른 사람이 쓰는 대안을 참고해 바꿔요.",
      "불편한 부분만 조금씩 바꾸는 편이에요."
    ],
    "ordinal": 215,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20446,
    "category": "independence",
    "prompt": "일을 배울 때 자세한 지침과 자유로운 시도 중 무엇이 편한가요?",
    "samples": [
      "기본 지침이 자세해야 시작하기 편해요.",
      "목표만 알면 자유롭게 해 보는 쪽이 좋아요.",
      "처음에는 지침을 받고 익숙해지면 바꾸고 싶어요."
    ],
    "ordinal": 227,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20447,
    "category": "independence",
    "prompt": "맡을 역할을 직접 고를 수 있으면 무엇을 기준으로 정하나요?",
    "samples": [
      "제가 혼자서도 잘 처리할 수 있는 일을 골라요.",
      "새로운 방식을 시도할 수 있는 역할을 골라요.",
      "도움을 받으며 익힐 수 있는 역할을 골라요."
    ],
    "ordinal": 239,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20448,
    "category": "independence",
    "prompt": "쓰던 앱에 모르는 설정이 필요하면 어떻게 해결하나요?",
    "samples": [
      "설명을 찾아 직접 바꿔 보는 편이에요.",
      "잘 아는 사람에게 방법을 먼저 물어봐요.",
      "되돌릴 수 있는지 확인한 뒤 시도해요."
    ],
    "ordinal": 251,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20449,
    "category": "independence",
    "prompt": "부탁받은 일이 모호하면 어느 부분까지 직접 정하나요?",
    "samples": [
      "중요한 목적을 확인하고 방법은 제가 정해요.",
      "범위와 기준이 분명해질 때까지 물어봐요.",
      "작은 예시를 만들어 이 방향이 맞는지 확인해요."
    ],
    "ordinal": 263,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20450,
    "category": "independence",
    "prompt": "내가 정한 방식으로 일하려면 어떤 조건이 필요하나요?",
    "samples": [
      "완성해야 할 결과가 분명하면 충분해요.",
      "중간에 질문할 사람이 있으면 편해요.",
      "실수해도 고칠 시간과 여유가 필요해요."
    ],
    "ordinal": 275,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20451,
    "category": "independence",
    "prompt": "혼자 진행하는 일은 중간 상황을 얼마나 공유하나요?",
    "samples": [
      "중요한 단계가 끝날 때만 공유하는 편이에요.",
      "방향이 맞는지 초반에 먼저 확인받아요.",
      "완성한 뒤 결과를 보여 주는 편이 편해요."
    ],
    "ordinal": 287,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20452,
    "category": "independence",
    "prompt": "누군가 자주 진행 상황을 확인하면 어떻게 느끼나요?",
    "samples": [
      "방향이 맞는지 확인할 수 있어 편해요.",
      "제 속도로 할 시간이 따로 있으면 좋겠어요.",
      "확인할 시점을 미리 정해 두면 편해요."
    ],
    "ordinal": 299,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20453,
    "category": "independence",
    "prompt": "누가 마감을 정해 주지 않는 일은 언제 끝냈다고 판단하나요?",
    "samples": [
      "처음 정한 목적을 이루면 마무리해요.",
      "스스로 만족할 만큼 다듬은 뒤 끝내요.",
      "믿을 만한 사람의 의견을 듣고 마무리해요."
    ],
    "ordinal": 311,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20454,
    "category": "independence",
    "prompt": "새로운 일을 혼자 해 보라고 하면 어떤 지원이 있으면 좋나요?",
    "samples": [
      "필요할 때 물어볼 연락처가 있으면 좋아요.",
      "참고할 수 있는 완성 예시가 있으면 좋아요.",
      "결과에 필요한 조건만 분명하면 괜찮아요."
    ],
    "ordinal": 323,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20455,
    "category": "independence",
    "prompt": "앞으로 해 보고 싶은 일은 어떻게 찾아가는 편인가요?",
    "samples": [
      "혼자 관심사를 정리하며 방향을 찾아요.",
      "여러 사람의 경험을 듣고 제 방향을 정해요.",
      "작게 시도해 보면서 맞는 일을 알아가요."
    ],
    "ordinal": 335,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20456,
    "category": "independence",
    "prompt": "주변 사람보다 진도가 느릴 때 내 속도를 어떻게 정하나요?",
    "samples": [
      "제 이해 정도에 맞춰 원래 속도를 지켜요.",
      "다른 사람의 방법을 참고해 조정해 봐요.",
      "목표를 다시 보고 필요한 속도를 계산해요."
    ],
    "ordinal": 347,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20457,
    "category": "independence",
    "prompt": "누군가 옆에서 도와준다면 어떤 도움을 받고 싶나요?",
    "samples": [
      "막혔을 때 필요한 정보만 알려 주면 좋아요.",
      "처음 한 번 함께 해 주면 마음이 놓여요.",
      "제가 한 결과를 보고 의견을 주면 좋아요."
    ],
    "ordinal": 359,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20458,
    "category": "independence",
    "prompt": "처음부터 끝까지 혼자 맡는 일을 받으면 어떤 점부터 생각하나요?",
    "samples": [
      "제 방식으로 시도할 수 있는 부분부터 봐요.",
      "어려울 때 도움을 구할 곳부터 확인해요.",
      "전체 분량을 혼자 감당할 수 있는지 생각해요."
    ],
    "ordinal": 371,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20459,
    "category": "independence",
    "prompt": "새 일을 시작할 때 첫 단계를 누가 정해 주면 어떤가요?",
    "samples": [
      "시작이 쉬워져서 편하게 느껴져요.",
      "제 생각과 비교한 뒤 참고해서 시작해요.",
      "처음 단계부터 직접 고르는 편이 더 편해요."
    ],
    "ordinal": 383,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20460,
    "category": "independence",
    "prompt": "주제가 자유로운 만들기 과제를 받으면 무엇부터 하나요?",
    "samples": [
      "지금 표현해 보고 싶은 생각부터 적어요.",
      "다양한 예시를 보며 관심 가는 방향을 찾아요.",
      "손에 있는 재료를 보고 가능한 것을 정해요."
    ],
    "ordinal": 395,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20461,
    "category": "independence",
    "prompt": "혼자 해 보기도 전에 도움을 제안받으면 어떻게 답하나요?",
    "samples": [
      "우선 직접 해 보고 필요하면 부탁하겠다고 해요.",
      "처음 부분은 같이 해 달라고 말해요.",
      "방법만 알려 달라고 하고 제가 해 봐요."
    ],
    "ordinal": 407,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20462,
    "category": "independence",
    "prompt": "낯선 장소에서 길을 찾을 때 어떤 방식이 편한가요?",
    "samples": [
      "지도와 표지판을 보고 직접 찾아가요.",
      "가까운 사람에게 물어 빠르게 확인해요.",
      "먼저 찾아보다 헷갈리면 물어보는 편이에요."
    ],
    "ordinal": 419,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20463,
    "category": "independence",
    "prompt": "처음 예약하는 여행 상품은 어떻게 알아보나요?",
    "samples": [
      "조건과 이용 방법을 직접 찾아 비교해요.",
      "상담을 통해 맞는 선택지를 추천받아요.",
      "경험자의 후기를 참고해 제가 정해요."
    ],
    "ordinal": 431,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20464,
    "category": "independence",
    "prompt": "매장에서 직원이 적극적으로 추천하면 어떻게 고르나요?",
    "samples": [
      "추천 이유를 듣고 제 기준과 비교해요.",
      "혼자 둘러볼 시간을 달라고 말해요.",
      "제가 원하는 조건을 말하고 추천을 더 받아요."
    ],
    "ordinal": 443,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20465,
    "category": "independence",
    "prompt": "내가 정한 선택을 가까운 사람이 걱정하면 어떻게 하나요?",
    "samples": [
      "걱정하는 부분을 듣고 대비할 방법을 찾아요.",
      "제가 생각한 근거와 준비를 설명해요.",
      "새로 고려할 점이 있는지 시간을 두고 봐요."
    ],
    "ordinal": 455,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20466,
    "category": "independence",
    "prompt": "정답이 정해져 있지 않은 과제는 어떻게 완성하나요?",
    "samples": [
      "제가 중요하게 보는 기준을 먼저 정해요.",
      "여러 예시를 비교해 방향을 잡는 편이에요.",
      "일단 만들어 본 뒤 어울리는 방향을 찾아요."
    ],
    "ordinal": 467,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20467,
    "category": "independence",
    "prompt": "하루를 온전히 내 마음대로 쓸 수 있으면 어떻게 시작하나요?",
    "samples": [
      "누구와도 맞추지 않고 하고 싶은 일을 골라요.",
      "평소 하고 싶던 일의 순서를 정해 봐요.",
      "일단 쉬면서 하고 싶은 마음이 생기길 기다려요."
    ],
    "ordinal": 479,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20468,
    "category": "independence",
    "prompt": "혼자 참여할 수 있는 행사를 발견하면 무엇을 확인하나요?",
    "samples": [
      "혼자서도 참여하기 편한 진행 방식인지 봐요.",
      "내용이 충분히 흥미로운지를 먼저 봐요.",
      "현장에서 함께할 사람을 만날 수 있는지 봐요."
    ],
    "ordinal": 491,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20469,
    "category": "independence",
    "prompt": "직접 판단하기 어렵다고 느끼는 기준은 무엇인가요?",
    "samples": [
      "확인할 정보가 너무 부족할 때 어려워요.",
      "결과가 여러 사람에게 크게 영향을 줄 때예요.",
      "경험이 없는 분야라 비교 기준이 없을 때예요."
    ],
    "ordinal": 503,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20470,
    "category": "independence",
    "prompt": "스스로 정한 생활 규칙은 어떤 방식으로 지키나요?",
    "samples": [
      "예외를 적게 두고 꾸준히 지키는 편이에요.",
      "그날 상황에 맞춰 유연하게 조절해요.",
      "주기적으로 살펴보고 필요하면 다시 정해요."
    ],
    "ordinal": 515,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20471,
    "category": "independence",
    "prompt": "혼자 만든 결과물이 마음에 들지 않으면 어떻게 점검하나요?",
    "samples": [
      "처음 목표와 다른 부분을 직접 비교해요.",
      "잠시 두었다가 새롭게 보며 고쳐요.",
      "다른 사람에게 의견을 구해서 살펴봐요."
    ],
    "ordinal": 527,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20472,
    "category": "independence",
    "prompt": "다른 사람이 더 빠른 방법을 알려 주면 어떻게 받아들이나요?",
    "samples": [
      "직접 써 보고 제게 맞으면 바꿔요.",
      "기존 방식과 차이를 먼저 이해해 봐요.",
      "필요한 부분만 가져와 제 방식에 섞어요."
    ],
    "ordinal": 539,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20473,
    "category": "independence",
    "prompt": "혼자 진행하다 방향이 맞는지 불안해지면 어떻게 하나요?",
    "samples": [
      "작은 결과를 만들어 실제로 확인해요.",
      "초기에 정한 목적을 다시 읽어 봐요.",
      "경험 있는 사람에게 현재 방향을 물어봐요."
    ],
    "ordinal": 551,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20474,
    "category": "independence",
    "prompt": "내 목표를 정할 때 다른 사람의 성과는 어떤 영향을 주나요?",
    "samples": [
      "어떤 수준이 가능한지 참고하는 데 써요.",
      "제 상황이 다르니 따로 목표를 세워요.",
      "새롭게 도전해 보고 싶은 계기가 돼요."
    ],
    "ordinal": 563,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20475,
    "category": "independence",
    "prompt": "수업에서 제출 형식을 자유롭게 고르라고 하면 어떻게 하나요?",
    "samples": [
      "제가 생각을 잘 보여 줄 수 있는 형식을 골라요.",
      "익숙한 형식으로 내용에 집중하는 편이에요.",
      "평소 안 해 본 형식으로 도전해 봐요."
    ],
    "ordinal": 575,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20476,
    "category": "independence",
    "prompt": "강사가 정해 준 학습 순서와 다른 내용이 더 궁금해지면 어떻게 하나요?",
    "samples": [
      "기본 과정을 마친 뒤 더 알아봐요.",
      "지금 궁금한 내용을 먼저 찾아봐요.",
      "먼저 배워도 되는지 강사에게 물어봐요."
    ],
    "ordinal": 587,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20477,
    "category": "independence",
    "prompt": "누군가 곁에서 같이 시작해 주면 혼자 할 때와 무엇이 달라지나요?",
    "samples": [
      "시작할 때 망설임이 줄어드는 편이에요.",
      "서로 방법을 보며 아이디어가 더 생겨요.",
      "저는 혼자 생각할 때 더 빨리 시작하게 돼요."
    ],
    "ordinal": 599,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20478,
    "category": "independence",
    "prompt": "새로운 공간을 꾸밀 때 누구의 의견을 가장 많이 참고하나요?",
    "samples": [
      "제가 실제로 생활할 모습을 먼저 생각해요.",
      "공간을 함께 쓸 사람의 의견을 참고해요.",
      "배치 경험이 많은 사람의 조언을 들어요."
    ],
    "ordinal": 611,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20479,
    "category": "independence",
    "prompt": "누가 시키지 않았는데 필요해 보이는 일이 있으면 어떻게 하나요?",
    "samples": [
      "제가 할 수 있는 범위라면 먼저 시작해요.",
      "정말 필요한 일인지 확인한 뒤 움직여요.",
      "관련된 사람에게 제안하고 함께 정해요."
    ],
    "ordinal": 623,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20480,
    "category": "independence",
    "prompt": "공부할 주제를 스스로 고를 때 어떤 기준이 도움이 되나요?",
    "samples": [
      "당장 해결하고 싶은 질문이 기준이 돼요.",
      "앞으로 하고 싶은 일에 필요한지를 봐요.",
      "기초부터 이어지는 순서가 있으면 편해요."
    ],
    "ordinal": 635,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20481,
    "category": "independence",
    "prompt": "혼자 정한 계획을 주변에 알리는 편인가요?",
    "samples": [
      "구체적으로 시작한 뒤에 이야기하는 편이에요.",
      "계획 단계부터 의견을 들어 보는 편이에요.",
      "완성하거나 성과가 생기면 이야기해요."
    ],
    "ordinal": 647,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20482,
    "category": "independence",
    "prompt": "예상하지 못한 일이 생겨 바로 물어볼 사람이 없으면 어떻게 하나요?",
    "samples": [
      "되돌릴 수 있는 작은 조치부터 해 봐요.",
      "확실히 아는 범위까지만 진행하고 기다려요.",
      "관련 안내를 찾아 스스로 판단할 근거를 모아요."
    ],
    "ordinal": 659,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20483,
    "category": "independence",
    "prompt": "내가 잘 아는 일에도 확인을 받는 편인가요?",
    "samples": [
      "중요한 결과라면 익숙해도 확인을 받아요.",
      "평소와 다른 조건이 있을 때만 물어봐요.",
      "제 기준으로 점검하고 마무리하는 편이에요."
    ],
    "ordinal": 671,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20484,
    "category": "independence",
    "prompt": "가구를 조립할 때 직접 하는 것과 서비스를 이용하는 것 중 무엇이 편한가요?",
    "samples": [
      "배울 수 있는 일이라면 직접 해 보고 싶어요.",
      "시간을 아끼고 싶어서 서비스를 이용해요.",
      "간단한 가구는 직접 하고 복잡하면 맡겨요."
    ],
    "ordinal": 683,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20485,
    "category": "independence",
    "prompt": "일의 순서와 방법을 모두 정해 주는 방식이 편한가요?",
    "samples": [
      "무엇을 해야 할지 분명해서 시작하기 편해요.",
      "제게 맞게 바꿀 수 있는 여지가 있으면 좋겠어요.",
      "처음에는 편하지만 익숙해지면 직접 정하고 싶어요."
    ],
    "ordinal": 695,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20486,
    "category": "independence",
    "prompt": "혼자 해결한 경험은 다음 일을 시작할 때 어떤 영향을 주나요?",
    "samples": [
      "비슷한 일은 먼저 직접 해 보게 돼요.",
      "어디서 도움을 받아야 하는지 더 잘 알게 돼요.",
      "준비할 때 제 기준을 세우는 데 도움이 돼요."
    ],
    "ordinal": 707,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20487,
    "category": "independence",
    "prompt": "선택을 맡긴 뒤에도 중간에 직접 확인하고 싶은가요?",
    "samples": [
      "핵심 조건만 맞는지 한 번 확인하고 싶어요.",
      "믿고 맡겼다면 결과를 기다리는 편이에요.",
      "진행 과정을 알아야 마음이 편한 편이에요."
    ],
    "ordinal": 719,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20488,
    "category": "independence",
    "prompt": "처음부터 내 방식으로 해 볼 수 있다면 어떤 일을 골라 보고 싶나요?",
    "samples": [
      "방법이 여러 가지인 만들기 작업을 해 보고 싶어요.",
      "생활의 불편한 점을 고치는 일을 해 보고 싶어요.",
      "관심 있는 주제를 혼자 조사해 보고 싶어요."
    ],
    "ordinal": 731,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20489,
    "category": "emotion",
    "prompt": "하루 종일 일이 꼬인 날에는 집에 돌아와 무엇부터 하나요?",
    "samples": [
      "씻고 누워서 잠깐 아무것도 안 해요.",
      "가벼운 집안일로 기분을 전환해요.",
      "친한 사람에게 있었던 일을 말해요."
    ],
    "ordinal": 3,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20490,
    "category": "emotion",
    "prompt": "중요한 발표를 앞두고 긴장될 때 무엇을 하면 도움이 되나요?",
    "samples": [
      "첫 문장을 소리 내어 연습해요.",
      "천천히 걸으며 몸의 긴장을 풀어요.",
      "잘 끝난 뒤의 모습을 떠올려요."
    ],
    "ordinal": 15,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20491,
    "category": "emotion",
    "prompt": "열심히 준비한 일의 결과가 기대에 못 미치면 어떻게 반응하나요?",
    "samples": [
      "아쉬운 마음을 혼자 정리해요.",
      "원인을 바로 찾아 다음을 준비해요.",
      "함께 고생한 사람들과 이야기해요."
    ],
    "ordinal": 27,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20492,
    "category": "emotion",
    "prompt": "기분 좋은 일이 생겼을 때 가장 먼저 하는 행동은 뭔가요?",
    "samples": [
      "가까운 사람에게 바로 전화해요.",
      "혼자 웃으며 그 순간을 즐겨요.",
      "기억해 두려고 짧게 기록해요."
    ],
    "ordinal": 39,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20493,
    "category": "emotion",
    "prompt": "화가 난 상태에서 답장을 써야 한다면 어떻게 하나요?",
    "samples": [
      "초안을 쓰고 잠시 뒤 다시 읽어요.",
      "지금은 대화하기 어렵다고 말해요.",
      "통화로 차분하게 설명해 보려 해요."
    ],
    "ordinal": 51,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20494,
    "category": "emotion",
    "prompt": "사소한 실수가 하루 종일 생각날 때 어떻게 털어내나요?",
    "samples": [
      "그때 배운 점 하나를 적어 봐요.",
      "다른 일에 몰두하며 시간을 보내요.",
      "친구에게 말하고 함께 웃어넘겨요."
    ],
    "ordinal": 63,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20495,
    "category": "emotion",
    "prompt": "칭찬을 들었지만 스스로는 결과가 아쉬우면 어떤 생각이 드나요?",
    "samples": [
      "좋게 봐 줘서 고맙다는 생각이 들어요.",
      "부족한 점이 먼저 떠올라 쑥스러워요.",
      "왜 서로 다르게 느끼는지 궁금해져요."
    ],
    "ordinal": 75,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20496,
    "category": "emotion",
    "prompt": "예상하지 못한 지적을 들었을 때 마음을 어떻게 가라앉히나요?",
    "samples": [
      "잠깐 혼자 있을 시간을 가져요.",
      "구체적으로 무슨 뜻인지 물어봐요.",
      "내가 느낀 당황스러움을 적어 봐요."
    ],
    "ordinal": 87,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20497,
    "category": "emotion",
    "prompt": "기다리던 약속이 취소되면 아쉬운 마음을 어떻게 푸나요?",
    "samples": [
      "혼자라도 하고 싶던 일을 해요.",
      "아쉬웠다고 상대에게 솔직히 말해요.",
      "다음 약속을 잡으면 금방 풀려요."
    ],
    "ordinal": 99,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20498,
    "category": "emotion",
    "prompt": "별다른 이유 없이 기운이 없는 날에는 어떻게 보내나요?",
    "samples": [
      "평소보다 할 일을 줄이고 쉬어요.",
      "가벼운 산책으로 몸을 움직여요.",
      "친한 사람과 잠깐 만나고 와요."
    ],
    "ordinal": 111,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20499,
    "category": "emotion",
    "prompt": "해야 할 일이 한꺼번에 몰리면 마음에 어떤 변화가 먼저 생기나요?",
    "samples": [
      "서두르고 싶어서 말이 빨라져요.",
      "조용해지고 혼자 집중하게 돼요.",
      "오히려 할 일이 명확해져 차분해져요."
    ],
    "ordinal": 123,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20500,
    "category": "emotion",
    "prompt": "즐거운 모임이 끝난 뒤 허전할 때는 어떻게 하나요?",
    "samples": [
      "그날 찍은 사진을 보며 여운을 즐겨요.",
      "참석한 친구에게 짧게 연락해요.",
      "평소 하던 일로 자연스럽게 돌아가요."
    ],
    "ordinal": 135,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20501,
    "category": "emotion",
    "prompt": "누군가 내 말을 오해했을 때 가장 먼저 어떤 기분이 드나요?",
    "samples": [
      "바로잡고 싶어서 마음이 급해져요.",
      "어떻게 들렸을지 궁금해져요.",
      "설명을 다시 해야 해서 지치곤 해요."
    ],
    "ordinal": 147,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20502,
    "category": "emotion",
    "prompt": "실수를 만회할 기회를 얻으면 어떤 마음으로 다시 시작하나요?",
    "samples": [
      "이번에는 해내겠다는 의욕이 생겨요.",
      "같은 실수를 할까 조금 긴장해요.",
      "한 번 해 봐서 전보다 편안해요."
    ],
    "ordinal": 159,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20503,
    "category": "emotion",
    "prompt": "오래 기다려 온 일을 마쳤을 때 기쁨을 어떻게 표현하나요?",
    "samples": [
      "작은 보상을 정해서 스스로 축하해요.",
      "도와준 사람에게 고마움을 전해요.",
      "며칠은 쉬면서 성취감을 느껴요."
    ],
    "ordinal": 171,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20504,
    "category": "emotion",
    "prompt": "눈물이 날 만큼 감동받았을 때 다른 사람 앞에서 어떻게 하나요?",
    "samples": [
      "눈물이 나면 자연스럽게 흘려요.",
      "웃으며 잠깐 다른 곳을 바라봐요.",
      "어떤 부분이 좋았는지 이야기해요."
    ],
    "ordinal": 183,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20505,
    "category": "emotion",
    "prompt": "중요한 결과를 기다리는 동안 시간을 어떻게 보내나요?",
    "samples": [
      "평소 일정대로 지내려고 해요.",
      "기다리는 마음을 친구와 나눠요.",
      "몰입할 수 있는 취미를 찾아요."
    ],
    "ordinal": 195,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20506,
    "category": "emotion",
    "prompt": "사람이 많은 곳에서 정신없이 시간을 보낸 뒤에는 어떻게 쉬나요?",
    "samples": [
      "조용한 공간에서 소리를 줄여요.",
      "가볍게 운동하며 몸을 풀어요.",
      "편한 사람과 느긋하게 이야기해요."
    ],
    "ordinal": 207,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20507,
    "category": "emotion",
    "prompt": "노력한 일을 아무도 알아주지 않을 때 어떤 마음이 드나요?",
    "samples": [
      "혼자 만족했다면 크게 신경 안 써요.",
      "조금 서운해서 내가 한 일을 말해요.",
      "다음에는 결과를 잘 보여주고 싶어요."
    ],
    "ordinal": 219,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20508,
    "category": "emotion",
    "prompt": "즐거운 일을 앞둔 전날에는 평소와 무엇이 달라지나요?",
    "samples": [
      "들떠서 관련 정보를 계속 찾아봐요.",
      "평소보다 일찍 준비를 끝내 둬요.",
      "당일에 즐기려고 평소처럼 지내요."
    ],
    "ordinal": 231,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20509,
    "category": "emotion",
    "prompt": "기분이 상했는데 이유가 분명하지 않을 때 어떻게 하나요?",
    "samples": [
      "하루를 돌아보며 걸렸던 말을 찾아요.",
      "일단 쉬고 나서 다시 생각해요.",
      "누군가에게 말하며 감정을 정리해요."
    ],
    "ordinal": 243,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20510,
    "category": "emotion",
    "prompt": "친구의 좋은 소식을 듣고 부러운 마음이 들면 어떻게 하나요?",
    "samples": [
      "부러운 점을 솔직하게 말해요.",
      "내가 원하는 것이 무엇인지 돌아봐요.",
      "축하한 뒤 내 일에 다시 집중해요."
    ],
    "ordinal": 255,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20511,
    "category": "emotion",
    "prompt": "준비한 계획이 갑자기 바뀌면 마음이 진정되기까지 무엇이 필요한가요?",
    "samples": [
      "바뀐 이유를 충분히 알아야 해요.",
      "새 계획이 정해지면 편안해져요.",
      "잠깐 혼자 생각할 시간이 필요해요."
    ],
    "ordinal": 267,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20512,
    "category": "emotion",
    "prompt": "즐겁던 하루에 작은 문제가 생기면 전체 기분에 얼마나 영향을 받나요?",
    "samples": [
      "작은 일이어도 한동안 마음에 남아요.",
      "해결하면 다시 즐거운 기분이 들어요.",
      "좋았던 시간이 많으면 금방 잊어요."
    ],
    "ordinal": 279,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20513,
    "category": "emotion",
    "prompt": "누군가에게 부탁한 뒤 답을 기다릴 때 어떤 마음이 드나요?",
    "samples": [
      "거절당할까 조금 신경이 쓰여요.",
      "언제쯤 답이 올지 궁금할 뿐이에요.",
      "말을 꺼냈다는 것만으로 후련해요."
    ],
    "ordinal": 291,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20514,
    "category": "emotion",
    "prompt": "말하고 나서 괜히 너무 많이 이야기했다 싶으면 어떻게 하나요?",
    "samples": [
      "다음에는 천천히 말하자고 생각해요.",
      "상대 반응이 괜찮았다면 넘겨요.",
      "걱정되는 부분만 상대에게 확인해요."
    ],
    "ordinal": 303,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20515,
    "category": "emotion",
    "prompt": "처음 맡은 일을 끝낸 뒤 마음을 편하게 해 주는 것은 뭔가요?",
    "samples": [
      "빠진 부분이 없는지 확인하는 거예요.",
      "함께한 사람이 괜찮다고 말해 주는 거예요.",
      "잠시 그 일에서 벗어나 쉬는 거예요."
    ],
    "ordinal": 315,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20516,
    "category": "emotion",
    "prompt": "뜻밖의 실수로 사람들의 시선이 모이면 어떻게 반응하나요?",
    "samples": [
      "웃으며 상황을 가볍게 정리해요.",
      "해야 할 행동에만 집중하려 해요.",
      "당황했다고 솔직하게 말해요."
    ],
    "ordinal": 327,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20517,
    "category": "emotion",
    "prompt": "계속 마음에 걸리는 말을 들었을 때 혼자 어떻게 정리하나요?",
    "samples": [
      "정확히 어떤 부분이 싫었는지 적어요.",
      "상대의 입장에서 다시 생각해 봐요.",
      "다른 일을 하며 감정이 잦아들길 기다려요."
    ],
    "ordinal": 339,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20518,
    "category": "emotion",
    "prompt": "누군가와 비교되는 말을 들으면 어떤 감정이 먼저 드나요?",
    "samples": [
      "더 잘해 보고 싶은 의욕이 생겨요.",
      "내 방식이 무시된 것 같아 답답해요.",
      "비교가 맞는 말인지 먼저 궁금해요."
    ],
    "ordinal": 351,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20519,
    "category": "emotion",
    "prompt": "반복하던 일이 잘 풀리지 않는 날에는 어떻게 기분을 바꾸나요?",
    "samples": [
      "잠시 쉬었다가 다시 시도해요.",
      "다른 쉬운 일 하나를 끝내 봐요.",
      "잘하던 때의 방법을 떠올려 봐요."
    ],
    "ordinal": 363,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20520,
    "category": "emotion",
    "prompt": "휴일이 끝나갈 때 아쉬운 마음을 어떻게 달래나요?",
    "samples": [
      "다음 휴일에 할 일을 하나 정해요.",
      "오늘 좋았던 일을 떠올려 봐요.",
      "내일 준비를 끝내 마음을 가볍게 해요."
    ],
    "ordinal": 375,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20521,
    "category": "emotion",
    "prompt": "어려운 이야기를 꺼낸 뒤에는 어떤 기분이 드는 편인가요?",
    "samples": [
      "결과와 상관없이 후련해져요.",
      "상대 반응이 계속 신경 쓰여요.",
      "혼자 조용히 정리할 시간이 필요해요."
    ],
    "ordinal": 387,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20522,
    "category": "emotion",
    "prompt": "뜻대로 되지 않은 일을 다시 시작할 힘은 어디서 얻나요?",
    "samples": [
      "지난번보다 나아진 부분을 찾아요.",
      "응원해 주는 사람과 이야기해요.",
      "충분히 쉬고 나면 의욕이 돌아와요."
    ],
    "ordinal": 399,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20523,
    "category": "emotion",
    "prompt": "좋아하는 활동에서도 집중이 안 되는 날에는 어떻게 하나요?",
    "samples": [
      "그날은 쉬고 다음에 다시 해요.",
      "쉽고 짧은 부분만 해 보고 끝내요.",
      "다른 장소에서 기분을 바꿔 봐요."
    ],
    "ordinal": 411,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20524,
    "category": "emotion",
    "prompt": "여러 번 거절을 겪은 뒤에는 마음을 어떻게 추스르나요?",
    "samples": [
      "상황과 내 가치를 따로 생각해요.",
      "속상한 마음을 가까운 사람에게 말해요.",
      "당분간 다른 일로 자신감을 채워요."
    ],
    "ordinal": 423,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20525,
    "category": "emotion",
    "prompt": "약속 시간에 늦을 것 같으면 마음이 가장 쓰이는 부분은 뭔가요?",
    "samples": [
      "기다리는 사람의 기분이 걱정돼요.",
      "일정이 뒤로 밀리는 게 신경 쓰여요.",
      "급하게 움직이는 상황 자체가 불편해요."
    ],
    "ordinal": 435,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20526,
    "category": "emotion",
    "prompt": "생각보다 쉽게 일이 끝나면 남은 시간을 어떤 기분으로 보내나요?",
    "samples": [
      "잘 끝냈다는 만족감을 즐겨요.",
      "빠뜨린 것이 없는지 조금 걱정돼요.",
      "여유가 생겨서 다른 일이 하고 싶어요."
    ],
    "ordinal": 447,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20527,
    "category": "emotion",
    "prompt": "화가 조금씩 쌓이고 있다는 것을 어떤 변화로 알아차리나요?",
    "samples": [
      "평소보다 말수가 눈에 띄게 줄어요.",
      "작은 소리에도 예민하게 반응해요.",
      "해야 할 일에 집중하기 어려워져요."
    ],
    "ordinal": 459,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20528,
    "category": "emotion",
    "prompt": "답답한 마음을 말로 설명하기 어려울 때는 어떻게 표현하나요?",
    "samples": [
      "짧은 글로 적어서 보여줘요.",
      "지금은 설명하기 어렵다고 말해요.",
      "비슷한 경험을 예로 들어 이야기해요."
    ],
    "ordinal": 471,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20529,
    "category": "emotion",
    "prompt": "기분이 좋을 때 내 말투나 행동은 어떻게 달라지나요?",
    "samples": [
      "말이 많아지고 먼저 말을 걸어요.",
      "작은 일에도 웃음이 자주 나요.",
      "겉으로는 평소와 크게 다르지 않아요."
    ],
    "ordinal": 483,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20530,
    "category": "emotion",
    "prompt": "힘든 일을 마친 직후에는 혼자 있고 싶은가요, 함께 있고 싶은가요?",
    "samples": [
      "혼자 조용히 쉬어야 회복돼요.",
      "편한 사람과 수다를 떨고 싶어요.",
      "잠깐 혼자 쉰 뒤에 만나고 싶어요."
    ],
    "ordinal": 495,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20531,
    "category": "emotion",
    "prompt": "누군가 나를 재촉하면 일하는 모습이 어떻게 달라지나요?",
    "samples": [
      "속도가 붙어서 더 빨리 움직여요.",
      "실수가 늘까 봐 더 천천히 확인해요.",
      "마음이 급해져 잠깐 정리가 필요해요."
    ],
    "ordinal": 507,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20532,
    "category": "emotion",
    "prompt": "오랫동안 아껴 온 물건을 잃어버리면 무엇이 가장 아쉽나요?",
    "samples": [
      "그 물건에 담긴 기억이 아쉬워요.",
      "다시 구하기 어렵다는 점이 속상해요.",
      "내가 챙기지 못했다는 게 마음에 남아요."
    ],
    "ordinal": 519,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20533,
    "category": "emotion",
    "prompt": "마음이 복잡한 날에는 익숙한 활동과 새로운 활동 중 무엇을 찾나요?",
    "samples": [
      "익숙한 일을 하며 편안해지고 싶어요.",
      "새로운 활동으로 생각을 바꾸고 싶어요.",
      "아무 활동도 정하지 않고 쉬고 싶어요."
    ],
    "ordinal": 531,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20534,
    "category": "emotion",
    "prompt": "잠들기 전에 걱정이 떠오르면 보통 어떻게 하나요?",
    "samples": [
      "내일 할 수 있는 일을 메모해 둬요.",
      "차분한 소리를 들으며 주의를 돌려요.",
      "생각을 억지로 멈추지 않고 기다려요."
    ],
    "ordinal": 543,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20535,
    "category": "emotion",
    "prompt": "누군가 내 진심을 알아줬다고 느끼면 어떻게 반응하나요?",
    "samples": [
      "고마웠던 부분을 자세히 말해요.",
      "기뻐서 표정에 바로 드러나요.",
      "그 순간을 마음속에 오래 간직해요."
    ],
    "ordinal": 555,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20536,
    "category": "emotion",
    "prompt": "예상보다 큰 관심을 받게 되면 어떤 점이 가장 신경 쓰이나요?",
    "samples": [
      "기대에 계속 맞출 수 있을지 궁금해요.",
      "나답게 행동할 수 있을지가 중요해요.",
      "관심이 새로운 기회로 이어질지 궁금해요."
    ],
    "ordinal": 567,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20537,
    "category": "emotion",
    "prompt": "충분히 쉬었는데도 마음이 무거우면 무엇을 살펴보나요?",
    "samples": [
      "미뤄 둔 걱정이 있는지 돌아봐요.",
      "최근 누구와 어떤 이야기를 했는지 봐요.",
      "몸이 피곤한 건 아닌지 먼저 살펴봐요."
    ],
    "ordinal": 579,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20538,
    "category": "emotion",
    "prompt": "즐거운 감정을 오래 기억하고 싶을 때 무엇을 하나요?",
    "samples": [
      "그날의 일을 짧게 기록해 둬요.",
      "함께한 사람과 나중에 다시 이야기해요.",
      "따로 기록하지 않고 순간에 집중해요."
    ],
    "ordinal": 591,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20539,
    "category": "emotion",
    "prompt": "주변 분위기가 가라앉아 있으면 내 기분도 쉽게 달라지나요?",
    "samples": [
      "다른 사람의 기분이 바로 전해져요.",
      "이유를 알기 전에는 평소와 비슷해요.",
      "분위기를 조금 바꾸고 싶어져요."
    ],
    "ordinal": 603,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20540,
    "category": "emotion",
    "prompt": "기대하지 않았던 도움을 받으면 어떤 마음이 먼저 드나요?",
    "samples": [
      "혼자가 아니라는 안도감이 들어요.",
      "어떻게 보답할지부터 생각나요.",
      "내 상황을 알아줬다는 점이 기뻐요."
    ],
    "ordinal": 615,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20541,
    "category": "emotion",
    "prompt": "여유 없이 바쁘게 지낸 뒤에는 무엇을 해야 긴장이 풀리나요?",
    "samples": [
      "정해진 일정 없이 하루를 보내요.",
      "밀린 정리를 끝내야 편안해져요.",
      "맛있는 식사를 천천히 즐겨요."
    ],
    "ordinal": 627,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20542,
    "category": "emotion",
    "prompt": "실망한 마음을 가까운 사람에게 어느 정도 보여주는 편인가요?",
    "samples": [
      "그때 느낀 그대로 솔직히 말해요.",
      "조금 정리된 뒤 핵심만 이야기해요.",
      "말보다 표정이나 행동에 먼저 드러나요."
    ],
    "ordinal": 639,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20543,
    "category": "emotion",
    "prompt": "사람들 앞에서 웃긴 이야기를 했는데 반응이 없으면 어떻게 느끼나요?",
    "samples": [
      "잠깐 민망하지만 금방 잊어요.",
      "내 말이 어떻게 들렸을지 생각해요.",
      "다음에는 다른 방식으로 말해 보고 싶어요."
    ],
    "ordinal": 651,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20544,
    "category": "emotion",
    "prompt": "어려운 일을 앞두고 응원을 받으면 어떤 말이 힘이 되나요?",
    "samples": [
      "결과와 상관없이 응원한다는 말이요.",
      "준비한 만큼 하면 된다는 말이요.",
      "구체적으로 잘한 점을 짚어 주는 말이요."
    ],
    "ordinal": 663,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20545,
    "category": "emotion",
    "prompt": "자신 있게 말한 내용이 틀렸다는 걸 알면 어떤 반응이 먼저 나오나요?",
    "samples": [
      "민망하지만 바로 정정하게 돼요.",
      "어디서 잘못 알았는지 궁금해져요.",
      "당황해서 잠깐 생각을 정리해요."
    ],
    "ordinal": 675,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20546,
    "category": "emotion",
    "prompt": "정신없이 바쁜 날에도 기분을 회복하게 해 주는 짧은 행동은 뭔가요?",
    "samples": [
      "창밖을 보며 잠시 숨을 돌려요.",
      "좋아하는 노래 한 곡을 들어요.",
      "편한 사람과 짧게 안부를 나눠요."
    ],
    "ordinal": 687,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20547,
    "category": "emotion",
    "prompt": "즐거운 경험을 하고도 아쉬운 부분이 떠오르면 어떻게 하나요?",
    "samples": [
      "좋았던 점과 아쉬운 점을 함께 적어요.",
      "다음에는 바꿔 볼 부분만 기억해요.",
      "그날 즐거웠던 순간을 다시 떠올려요."
    ],
    "ordinal": 699,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20548,
    "category": "emotion",
    "prompt": "계속 참던 불편함을 말하고 나면 무엇이 가장 신경 쓰이나요?",
    "samples": [
      "내 뜻이 정확히 전달됐는지 궁금해요.",
      "상대와 사이가 달라질까 걱정돼요.",
      "이제 상황이 바뀔 수 있다는 점이 기대돼요."
    ],
    "ordinal": 711,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20549,
    "category": "emotion",
    "prompt": "스스로에게 실망한 날에는 어떤 말을 해 주고 싶나요?",
    "samples": [
      "오늘 하루가 내 전부는 아니라고 해요.",
      "다음에는 하나만 바꿔 보자고 해요.",
      "지금은 충분히 쉬어도 된다고 해요."
    ],
    "ordinal": 723,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20550,
    "category": "empathy",
    "prompt": "친구가 위로보다 솔직한 조언을 원하면 무엇부터 물어보나요?",
    "samples": [
      "지금 가장 바꾸고 싶은 점을 물어봐요.",
      "이미 시도한 방법이 무엇인지 물어봐요.",
      "어떤 제약이 있는지 먼저 물어봐요."
    ],
    "ordinal": 9,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20551,
    "category": "empathy",
    "prompt": "친구가 고민을 털어놓으면 조언이 필요한지 어떻게 알아보나요?",
    "samples": [
      "같이 방법을 찾아볼지 직접 물어봐요.",
      "이야기를 끝까지 듣고 반응을 살펴요.",
      "내 경험을 조금 말하고 반응을 봐요."
    ],
    "ordinal": 21,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20552,
    "category": "empathy",
    "prompt": "친구가 같은 고민을 여러 번 이야기하면 어떻게 대화를 이어가나요?",
    "samples": [
      "지난번과 달라진 점을 물어봐요.",
      "아직 마음에 남은 부분을 들어줘요.",
      "지금 시도할 수 있는 일을 함께 찾아요."
    ],
    "ordinal": 33,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20553,
    "category": "empathy",
    "prompt": "친구의 고민에 공감은 되지만 생각이 다를 때 어떻게 반응하나요?",
    "samples": [
      "마음을 이해한다고 먼저 말해요.",
      "내가 다르게 보는 부분도 조심히 말해요.",
      "친구가 그렇게 생각한 이유를 더 들어요."
    ],
    "ordinal": 45,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20554,
    "category": "empathy",
    "prompt": "잘 모르는 취미에 신난 친구의 이야기를 어떻게 듣나요?",
    "samples": [
      "어떤 점이 재미있는지 물어봐요.",
      "친구가 보여주는 사진을 함께 봐요.",
      "그 취미를 시작한 계기가 궁금해요."
    ],
    "ordinal": 57,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20555,
    "category": "empathy",
    "prompt": "내 기분이 좋지 않은 날 친구의 축하할 소식을 들으면 어떻게 하나요?",
    "samples": [
      "짧게 축하하고 나중에 더 이야기해요.",
      "친구의 좋은 소식에 함께 기분을 바꿔요.",
      "내 상태를 말하고 축하하는 마음도 전해요."
    ],
    "ordinal": 69,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20556,
    "category": "empathy",
    "prompt": "속상한 일이 생겼을 때 언제 위로받는 것이 가장 편한가요?",
    "samples": [
      "일이 생긴 직후에 이야기하고 싶어요.",
      "혼자 조금 정리한 뒤에 듣고 싶어요.",
      "내가 먼저 말을 꺼냈을 때가 좋아요."
    ],
    "ordinal": 81,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20557,
    "category": "empathy",
    "prompt": "평소 활발한 친구가 모임에서 말이 없으면 어떻게 하나요?",
    "samples": [
      "따로 잠깐 괜찮은지 물어봐요.",
      "편하게 참여할 수 있는 화제를 꺼내요.",
      "쉬고 싶을 수 있으니 곁에서 지켜봐요."
    ],
    "ordinal": 93,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20558,
    "category": "empathy",
    "prompt": "친구가 실수해서 민망해할 때 어떻게 반응하나요?",
    "samples": [
      "아무렇지 않게 다음 이야기로 넘어가요.",
      "내가 했던 비슷한 실수를 이야기해요.",
      "수습하는 데 필요한 일을 도와줘요."
    ],
    "ordinal": 105,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20559,
    "category": "empathy",
    "prompt": "같은 일을 겪고도 친구의 감정이 나와 다르면 무엇을 물어보나요?",
    "samples": [
      "어떤 부분이 가장 마음에 남았는지 물어요.",
      "내가 못 본 상황이 있었는지 물어요.",
      "지금 어떤 반응을 원하는지 물어요."
    ],
    "ordinal": 117,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20560,
    "category": "empathy",
    "prompt": "친구가 내 이야기를 듣다가 눈물을 보이면 어떻게 반응하나요?",
    "samples": [
      "잠시 멈추고 괜찮은지 물어봐요.",
      "말없이 곁에서 잠깐 기다려요.",
      "어떤 마음이 들었는지 조심스럽게 물어요."
    ],
    "ordinal": 129,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20561,
    "category": "empathy",
    "prompt": "위로가 필요한 날 가까운 사람에게 어떻게 도움을 청하나요?",
    "samples": [
      "잠깐 내 이야기를 들어달라고 말해요.",
      "같이 밥 먹을 수 있는지 물어봐요.",
      "지금 어떤 기분인지 메시지로 보내요."
    ],
    "ordinal": 141,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20562,
    "category": "empathy",
    "prompt": "친구의 조언이 내 상황과 맞지 않을 때 어떻게 이야기하나요?",
    "samples": [
      "내가 처한 상황을 조금 더 설명해요.",
      "지금은 듣기만 해 주면 좋겠다고 해요.",
      "고맙다고 하고 내 방식으로 정리해요."
    ],
    "ordinal": 153,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20563,
    "category": "empathy",
    "prompt": "친구가 솔직한 평가를 부탁하면 어떤 방식으로 말하나요?",
    "samples": [
      "좋았던 점부터 구체적으로 말해요.",
      "고칠 부분을 예시와 함께 바로 말해요.",
      "어느 부분이 궁금한지 먼저 물어봐요."
    ],
    "ordinal": 165,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20564,
    "category": "empathy",
    "prompt": "친구가 속상한 일을 긴 메시지로 보내면 어떻게 답하나요?",
    "samples": [
      "마음에 걸린 부분을 짚어 답해요.",
      "통화할 수 있는지 먼저 물어봐요.",
      "읽고 있다는 짧은 답부터 보내요."
    ],
    "ordinal": 177,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20565,
    "category": "empathy",
    "prompt": "친구를 위로할 때 가벼운 농담은 언제 꺼내는 편인가요?",
    "samples": [
      "친구가 조금 웃기 시작할 때 해요.",
      "친구가 분위기를 바꾸고 싶어 할 때 해요.",
      "상황이 정리될 때까지 농담은 아껴요."
    ],
    "ordinal": 189,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20566,
    "category": "empathy",
    "prompt": "힘들 때 누군가 곁에 있어 준다면 어떤 방식이 편한가요?",
    "samples": [
      "말없이 같은 공간에 있어 주면 좋아요.",
      "평소처럼 이야기를 나누면 좋아요.",
      "마음을 자세히 물어봐 주면 좋아요."
    ],
    "ordinal": 201,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20567,
    "category": "empathy",
    "prompt": "친구가 내게 말하던 고민을 다른 사람에게도 털어놓으면 어떤 생각이 드나요?",
    "samples": [
      "도움을 받을 사람이 많아서 다행이에요.",
      "제 말이 도움이 안 됐나 궁금해져요.",
      "다른 사람의 생각도 들어보고 싶어져요."
    ],
    "ordinal": 213,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20568,
    "category": "empathy",
    "prompt": "자신감을 잃은 사람에게 칭찬할 때 어떤 점을 말하나요?",
    "samples": [
      "그 사람이 실제로 해낸 일을 말해요.",
      "계속 노력해 온 과정을 짚어 줘요.",
      "함께할 때 느끼는 좋은 점을 전해요."
    ],
    "ordinal": 225,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20569,
    "category": "empathy",
    "prompt": "친구가 해결책 없이 들어주기만 해 달라고 하면 어떻게 반응하나요?",
    "samples": [
      "말을 끊지 않고 충분히 들어줘요.",
      "친구의 기분을 짧게 되짚어 줘요.",
      "더 말하고 싶은 부분이 있는지 물어요."
    ],
    "ordinal": 237,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20570,
    "category": "empathy",
    "prompt": "친구가 자기 실수를 털어놓으면 어떤 말을 먼저 하나요?",
    "samples": [
      "지금 가장 걱정되는 것이 뭔지 물어요.",
      "이미 수습한 부분이 있는지 물어요.",
      "말해 줘서 고맙다고 먼저 해요."
    ],
    "ordinal": 249,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20571,
    "category": "empathy",
    "prompt": "친구가 원하던 결과를 얻지 못했을 때 어떤 위로를 건네나요?",
    "samples": [
      "얼마나 아쉬울지 알 것 같다고 해요.",
      "그동안 얼마나 애썼는지 안다고 말해요.",
      "잠깐 같이 쉬러 가자고 제안해요."
    ],
    "ordinal": 261,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20572,
    "category": "empathy",
    "prompt": "말은 괜찮다는데 표정이 어두운 친구에게 어떻게 다가가나요?",
    "samples": [
      "표정이 조금 달라 보여 걱정된다고 해요.",
      "다른 이야기를 하며 곁에 있어요.",
      "친구가 먼저 말할 때까지 기다려요."
    ],
    "ordinal": 273,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20573,
    "category": "empathy",
    "prompt": "위로하려고 한 말이 다르게 전달되면 어떻게 하나요?",
    "samples": [
      "어떤 부분이 불편했는지 물어봐요.",
      "내가 전하려던 마음을 다시 설명해요.",
      "잠깐 멈추고 상대의 이야기를 들어요."
    ],
    "ordinal": 285,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20574,
    "category": "empathy",
    "prompt": "친구와 함께 실패를 겪었을 때 어떤 대화를 먼저 나누고 싶나요?",
    "samples": [
      "서로 어떤 기분인지 이야기하고 싶어요.",
      "무엇을 배웠는지 정리하고 싶어요.",
      "일단 다른 이야기로 쉬고 싶어요."
    ],
    "ordinal": 297,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20575,
    "category": "empathy",
    "prompt": "아직 친하지 않은 사람이 고민을 꺼내면 어떻게 반응하나요?",
    "samples": [
      "편하게 말할 수 있는 만큼만 들어요.",
      "내가 도울 수 있는 부분을 물어봐요.",
      "내 비슷한 경험을 짧게 나눠요."
    ],
    "ordinal": 309,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20576,
    "category": "empathy",
    "prompt": "친구가 바빠서 힘들어할 때 어떤 도움부터 생각하나요?",
    "samples": [
      "실제로 덜어 줄 일이 있는지 봐요.",
      "잠깐 쉴 시간을 함께 만들어 봐요.",
      "부담되는 점을 이야기할 수 있게 해요."
    ],
    "ordinal": 321,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20577,
    "category": "empathy",
    "prompt": "친구가 목표를 조금씩 이루고 있을 때 어떻게 응원하나요?",
    "samples": [
      "지난번보다 달라진 부분을 말해 줘요.",
      "함께 작은 성과를 축하하자고 해요.",
      "필요할 때 도울 수 있다고 알려줘요."
    ],
    "ordinal": 333,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20578,
    "category": "empathy",
    "prompt": "친구가 자랑하고 싶은 일을 이야기하면 어떻게 호응하나요?",
    "samples": [
      "기뻐하는 표정을 보며 함께 웃어요.",
      "어떻게 해냈는지 자세히 물어봐요.",
      "잘한 점을 구체적으로 짚어 줘요."
    ],
    "ordinal": 345,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20579,
    "category": "empathy",
    "prompt": "힘든 시기를 보내는 친구에게 얼마나 자주 안부를 묻나요?",
    "samples": [
      "부담 없는 짧은 연락을 자주 해요.",
      "며칠 간격으로 조용히 물어봐요.",
      "친구가 편한 연락 간격을 먼저 물어요."
    ],
    "ordinal": 357,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20580,
    "category": "empathy",
    "prompt": "친구가 익숙한 곳을 떠나 아쉬워할 때 무엇을 함께하고 싶나요?",
    "samples": [
      "좋았던 기억을 이야기하고 싶어요.",
      "새로운 곳에서 할 일을 같이 찾아요.",
      "떠나기 전에 편하게 시간을 보내요."
    ],
    "ordinal": 369,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20581,
    "category": "empathy",
    "prompt": "친구가 자신을 심하게 탓할 때 어떤 부분부터 이야기하나요?",
    "samples": [
      "실수와 그 사람 자체는 다르다고 해요.",
      "실제로 책임져야 할 범위를 함께 봐요.",
      "왜 그렇게 느끼는지 충분히 들어요."
    ],
    "ordinal": 381,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20582,
    "category": "empathy",
    "prompt": "겪어 보지 못한 일로 힘들어하는 친구를 어떻게 위로하나요?",
    "samples": [
      "잘은 모르지만 듣고 싶다고 말해요.",
      "그 상황에서 무엇이 힘든지 물어봐요.",
      "친구가 필요한 도움을 직접 물어봐요."
    ],
    "ordinal": 393,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20583,
    "category": "empathy",
    "prompt": "문자로 위로를 전할 때 가장 신경 쓰는 것은 뭔가요?",
    "samples": [
      "너무 가볍게 들리지 않는 표현이에요.",
      "상대가 답장할 부담이 없게 쓰는 거예요.",
      "내가 들은 내용을 정확히 짚는 거예요."
    ],
    "ordinal": 405,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20584,
    "category": "empathy",
    "prompt": "친구의 선택에 동의하지 않아도 응원할 수 있는 부분은 뭔가요?",
    "samples": [
      "스스로 결정하려고 애쓴 점이에요.",
      "선택한 뒤 책임지려는 마음이에요.",
      "새로운 일을 해 보려는 용기예요."
    ],
    "ordinal": 417,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20585,
    "category": "empathy",
    "prompt": "결과를 기다리며 불안해하는 친구와 무엇을 함께하고 싶나요?",
    "samples": [
      "산책하며 다른 이야기를 하고 싶어요.",
      "걱정되는 경우를 함께 정리하고 싶어요.",
      "평소 좋아하던 활동을 하고 싶어요."
    ],
    "ordinal": 429,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20586,
    "category": "empathy",
    "prompt": "친구가 내 걱정을 나보다 더 심각하게 받아들이면 어떻게 이야기하나요?",
    "samples": [
      "내가 느끼는 걱정의 정도를 설명해요.",
      "걱정해 줘서 고맙다고 먼저 말해요.",
      "지금 필요한 도움이 무엇인지 알려줘요."
    ],
    "ordinal": 441,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20587,
    "category": "empathy",
    "prompt": "친구가 시작도 하기 전에 자신 없어 하면 무엇을 말해 주나요?",
    "samples": [
      "해 볼 수 있는 작은 단계부터 찾아요.",
      "예전에 해냈던 일을 떠올려 줘요.",
      "잘하지 못해도 괜찮다고 말해요."
    ],
    "ordinal": 453,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20588,
    "category": "empathy",
    "prompt": "친구의 발표나 공연을 응원하러 가면 어떻게 마음을 표현하나요?",
    "samples": [
      "끝난 뒤 좋았던 부분을 자세히 말해요.",
      "눈이 마주치면 웃으며 반응해 줘요.",
      "준비한 작은 선물로 응원해요."
    ],
    "ordinal": 465,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20589,
    "category": "empathy",
    "prompt": "문제가 생겼을 때 주변에서 어떤 도움을 받으면 가장 편한가요?",
    "samples": [
      "내가 못 본 해결 방법을 알려주면 좋아요.",
      "결정할 때까지 기다려주면 좋아요.",
      "작은 일 하나를 대신 맡아주면 좋아요."
    ],
    "ordinal": 477,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20590,
    "category": "empathy",
    "prompt": "내 고민을 말하면 상대가 부담스러울까 걱정될 때 어떻게 하나요?",
    "samples": [
      "지금 이야기해도 괜찮은지 먼저 물어요.",
      "핵심만 짧게 말하고 반응을 봐요.",
      "어떤 도움이 필요한지 함께 말해요."
    ],
    "ordinal": 489,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20591,
    "category": "empathy",
    "prompt": "혼자 하기 버거운 일을 도와달라고 부탁할 때 어떻게 말하나요?",
    "samples": [
      "어느 부분이 어려운지 구체적으로 말해요.",
      "가능한 시간과 범위를 먼저 물어봐요.",
      "내가 해 본 방법부터 설명해요."
    ],
    "ordinal": 501,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20592,
    "category": "empathy",
    "prompt": "마감에 쫓기는 친구가 도움을 청하면 무엇부터 확인하나요?",
    "samples": [
      "지금 가장 급한 일이 무엇인지 물어요.",
      "내가 도울 수 있는 시간을 계산해요.",
      "친구가 맡아 줬으면 하는 일을 물어요."
    ],
    "ordinal": 513,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20593,
    "category": "empathy",
    "prompt": "친구가 “어떻게 해야 할지 모르겠어”라고 하면 어떻게 대화를 시작하나요?",
    "samples": [
      "가장 걱정되는 것이 뭔지 물어봐요.",
      "가능한 선택을 같이 적어 보자고 해요.",
      "당장 정하지 않아도 되는지 살펴봐요."
    ],
    "ordinal": 525,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20594,
    "category": "empathy",
    "prompt": "누군가 “다 잘될 거야”라고 위로하면 나는 어떻게 느끼나요?",
    "samples": [
      "확신을 나눠 주는 것 같아 힘이 나요.",
      "내 상황을 조금 더 들어주면 좋겠어요.",
      "말보다 함께 있어 준다는 점이 고마워요."
    ],
    "ordinal": 537,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20595,
    "category": "empathy",
    "prompt": "힘든 일을 말했는데 상대가 자기 경험을 꺼내면 어떻게 느끼나요?",
    "samples": [
      "비슷한 사람이 있다는 점이 위로돼요.",
      "내 이야기를 먼저 마치고 싶어요.",
      "어떻게 지나왔는지 듣고 싶어요."
    ],
    "ordinal": 549,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20596,
    "category": "empathy",
    "prompt": "피곤한 친구와 이야기할 때 어떤 방식으로 맞추나요?",
    "samples": [
      "핵심만 짧게 말하고 쉬게 해 줘요.",
      "말보다 함께할 조용한 활동을 찾아요.",
      "지금은 혼자 있고 싶은지 물어봐요."
    ],
    "ordinal": 561,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20597,
    "category": "empathy",
    "prompt": "도움을 받았을 때 가장 마음에 남는 것은 무엇인가요?",
    "samples": [
      "부탁하기 전에 알아차려 준 점이에요.",
      "내 방식을 존중하며 도와준 점이에요.",
      "실제로 어려운 일이 해결된 점이에요."
    ],
    "ordinal": 573,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20598,
    "category": "empathy",
    "prompt": "친구가 내 도움을 정중하게 거절하면 어떤 마음이 드나요?",
    "samples": [
      "필요한 방식이 다를 수 있다고 생각해요.",
      "다른 도움이 필요한지 궁금해져요.",
      "친구가 직접 해낼 수 있겠구나 싶어요."
    ],
    "ordinal": 585,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20599,
    "category": "empathy",
    "prompt": "친구가 고마워할 줄 알았던 도움에 반응이 적으면 어떻게 하나요?",
    "samples": [
      "도움이 되었는지 가볍게 물어봐요.",
      "친구에게 다른 일이 있나 생각해 봐요.",
      "내 마음을 전한 것으로 만족해요."
    ],
    "ordinal": 597,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20600,
    "category": "empathy",
    "prompt": "친구가 어려운 일을 하러 갈 때 동행을 부탁하면 어떤 역할이 편한가요?",
    "samples": [
      "옆에서 조용히 기다려주는 역할이에요.",
      "필요할 때 함께 질문해 주는 역할이에요.",
      "끝난 뒤 이야기를 들어주는 역할이에요."
    ],
    "ordinal": 609,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20601,
    "category": "empathy",
    "prompt": "실패한 친구가 원인 분석을 부탁하면 어떻게 함께 살펴보나요?",
    "samples": [
      "친구가 아쉬웠던 부분부터 물어봐요.",
      "잘된 부분과 어려웠던 부분을 나눠 봐요.",
      "다음에 바꿀 수 있는 점부터 찾아요."
    ],
    "ordinal": 621,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20602,
    "category": "empathy",
    "prompt": "친구가 기쁘면서도 걱정된다고 하면 어느 쪽 이야기를 먼저 듣나요?",
    "samples": [
      "친구가 더 말하고 싶은 쪽을 물어봐요.",
      "걱정되는 부분을 먼저 들어줘요.",
      "기쁜 일을 충분히 축하하고 싶어요."
    ],
    "ordinal": 633,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20603,
    "category": "empathy",
    "prompt": "혼자 쉬고 싶은 친구를 응원할 때 어떤 말을 남기나요?",
    "samples": [
      "필요할 때 편하게 연락하라고 해요.",
      "답장하지 않아도 괜찮다고 알려줘요.",
      "충분히 쉬고 나중에 보자고 해요."
    ],
    "ordinal": 645,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20604,
    "category": "empathy",
    "prompt": "긴 하루를 보낸 내가 집에 돌아왔을 때 어떤 반응을 바라나요?",
    "samples": [
      "오늘 어땠는지 먼저 물어봐 주면 좋아요.",
      "말없이 쉴 시간을 주면 좋아요.",
      "평소처럼 가볍게 웃어 주면 좋아요."
    ],
    "ordinal": 657,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20605,
    "category": "empathy",
    "prompt": "친구가 어려운 도전을 시작할 때 어떤 방식으로 힘을 보태나요?",
    "samples": [
      "연습할 상대가 필요하면 함께해요.",
      "진행 과정에 관심을 보이며 물어봐요.",
      "원할 때만 조언이나 도움을 줘요."
    ],
    "ordinal": 669,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20606,
    "category": "empathy",
    "prompt": "한 번 포기했던 일을 다시 시작하는 친구에게 어떤 말을 하나요?",
    "samples": [
      "다시 해 보려는 마음이 반갑다고 해요.",
      "이번에 바꾸고 싶은 점을 물어봐요.",
      "천천히 해도 괜찮다고 응원해요."
    ],
    "ordinal": 681,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20607,
    "category": "empathy",
    "prompt": "친구가 축하받는 자리를 부담스러워하면 어떻게 마음을 전하나요?",
    "samples": [
      "조용히 둘이 있을 때 축하해요.",
      "평소처럼 만나 짧게 마음을 전해요.",
      "어떤 방식이 편한지 먼저 물어봐요."
    ],
    "ordinal": 693,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20608,
    "category": "empathy",
    "prompt": "고민을 말하던 친구가 잠시 조용해지면 어떻게 하나요?",
    "samples": [
      "친구가 다시 말할 때까지 기다려요.",
      "잠깐 쉬었다 이야기할지 물어봐요.",
      "방금 한 말을 짧게 되짚어 줘요."
    ],
    "ordinal": 705,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20609,
    "category": "empathy",
    "prompt": "도움을 받은 사람이 자꾸 미안해하면 어떻게 답하나요?",
    "samples": [
      "내가 할 수 있어서 한 일이라고 해요.",
      "어떤 점이 미안한지 먼저 들어요.",
      "다음에 편하게 서로 도우면 된다고 해요."
    ],
    "ordinal": 717,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20610,
    "category": "empathy",
    "prompt": "나에게 힘이 됐던 위로가 친구에게는 맞지 않으면 어떻게 하나요?",
    "samples": [
      "친구에게 편한 방식을 직접 물어봐요.",
      "친구의 반응을 보며 표현을 바꿔요.",
      "내 경험보다 친구 이야기에 집중해요."
    ],
    "ordinal": 729,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20611,
    "category": "teamwork",
    "prompt": "여럿이 할 일에서 역할이 정해지지 않았다면 어떻게 하나요?",
    "samples": [
      "필요한 역할부터 함께 적어 봐요.",
      "내가 맡고 싶은 일을 먼저 말해요.",
      "다른 사람의 의견을 듣고 빈자리를 맡아요."
    ],
    "ordinal": 6,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20612,
    "category": "teamwork",
    "prompt": "모임에서 의견을 모을 때 내 생각은 언제 말하는 편인가요?",
    "samples": [
      "생각이 떠오르면 먼저 말해요.",
      "몇 사람의 이야기를 듣고 말해요.",
      "메모로 정리한 뒤 차례를 기다려요."
    ],
    "ordinal": 18,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20613,
    "category": "teamwork",
    "prompt": "함께 일할 때 각자 맡는 방식과 같이 의논하는 방식 중 무엇이 편한가요?",
    "samples": [
      "역할을 나누고 각자 집중하는 게 편해요.",
      "작은 결정도 함께 의논하면 좋아요.",
      "처음만 맞추고 중간에 다시 확인해요."
    ],
    "ordinal": 30,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20614,
    "category": "teamwork",
    "prompt": "공동 작업의 진행 상황은 언제 공유하는 편인가요?",
    "samples": [
      "작은 단계가 끝날 때마다 알려요.",
      "정해 둔 시간에 모아서 공유해요.",
      "변경이나 어려움이 생겼을 때 알려요."
    ],
    "ordinal": 42,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20615,
    "category": "teamwork",
    "prompt": "맡은 역할이 익숙하지 않을 때 동료에게 무엇부터 물어보나요?",
    "samples": [
      "완료된 모습의 예시를 보여달라고 해요.",
      "가장 중요한 기준부터 물어봐요.",
      "실수하기 쉬운 부분이 궁금해요."
    ],
    "ordinal": 54,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20616,
    "category": "teamwork",
    "prompt": "함께하는 사람과 일하는 속도가 다르면 어떻게 맞추나요?",
    "samples": [
      "서로 마칠 수 있는 시간을 확인해요.",
      "중간에 만날 지점을 정해 둬요.",
      "속도에 맞게 맡은 분량을 조정해요."
    ],
    "ordinal": 66,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20617,
    "category": "teamwork",
    "prompt": "여러 사람의 의견이 모이지 않을 때 어떤 방법을 제안하나요?",
    "samples": [
      "우선 공통으로 동의하는 점을 찾아요.",
      "각 방법을 작게 시험해 보자고 해요.",
      "결정 기준을 정하고 다시 비교해요."
    ],
    "ordinal": 78,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20618,
    "category": "teamwork",
    "prompt": "모두 같은 의견인데 나만 다르게 생각하면 어떻게 말하나요?",
    "samples": [
      "내가 걱정하는 부분을 질문으로 꺼내요.",
      "다른 방법의 장점을 짧게 설명해요.",
      "결정 전에 따로 의견을 전해 봐요."
    ],
    "ordinal": 90,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20619,
    "category": "teamwork",
    "prompt": "팀에서 익숙한 역할과 처음 해 보는 역할 중 무엇을 맡고 싶나요?",
    "samples": [
      "익숙한 역할로 안정적으로 돕고 싶어요.",
      "새 역할을 맡아 배우고 싶어요.",
      "팀에 더 필요한 쪽을 고르고 싶어요."
    ],
    "ordinal": 102,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20620,
    "category": "teamwork",
    "prompt": "여러 사람의 일정을 맞추는 역할을 맡으면 무엇부터 하나요?",
    "samples": [
      "각자 어려운 시간을 먼저 받아요.",
      "가능한 날짜 몇 개를 제안해요.",
      "함께 모여 한 번에 정하고 싶어요."
    ],
    "ordinal": 114,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20621,
    "category": "teamwork",
    "prompt": "회의에서 한 사람이 계속 말이 없으면 어떻게 의견을 듣나요?",
    "samples": [
      "부담 없이 생각을 물어봐요.",
      "회의 뒤에 따로 이야기할 기회를 만들어요.",
      "글로 의견을 받을 수 있게 해요."
    ],
    "ordinal": 126,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20622,
    "category": "teamwork",
    "prompt": "처음 팀을 이끌게 되면 어떤 분위기를 만들고 싶나요?",
    "samples": [
      "누구나 편하게 질문할 수 있으면 좋아요.",
      "해야 할 일이 분명한 분위기가 좋아요.",
      "각자 자기 방식으로 해 볼 수 있으면 좋아요."
    ],
    "ordinal": 138,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20623,
    "category": "teamwork",
    "prompt": "다른 사람이 일을 이끌 때 어떤 안내를 받으면 편한가요?",
    "samples": [
      "구체적인 순서가 있으면 편해요.",
      "목표만 알면 방법은 직접 찾고 싶어요.",
      "필요할 때 확인할 수 있으면 충분해요."
    ],
    "ordinal": 150,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20624,
    "category": "teamwork",
    "prompt": "팀 전체의 마감이 가까워지면 어떤 역할을 맡게 되나요?",
    "samples": [
      "남은 일을 정리하고 순서를 맞춰요.",
      "내가 맡은 부분의 완성도에 집중해요.",
      "막힌 사람을 찾아 함께 해결해요."
    ],
    "ordinal": 162,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20625,
    "category": "teamwork",
    "prompt": "동료가 예정대로 일을 마치기 어렵다고 하면 어떻게 조율하나요?",
    "samples": [
      "남은 일을 나눌 수 있는지 살펴봐요.",
      "일정에서 조정할 수 있는 부분을 찾아요.",
      "꼭 필요한 결과부터 함께 정해요."
    ],
    "ordinal": 174,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20626,
    "category": "teamwork",
    "prompt": "공동 작업에서 오류를 발견하면 어떻게 알리나요?",
    "samples": [
      "어느 부분인지 자료와 함께 공유해요.",
      "담당자에게 먼저 조용히 이야기해요.",
      "해결 방법을 찾아서 함께 제안해요."
    ],
    "ordinal": 186,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20627,
    "category": "teamwork",
    "prompt": "동료가 내가 만든 자료를 많이 수정하면 무엇이 궁금한가요?",
    "samples": [
      "수정한 이유와 기준이 궁금해요.",
      "완성된 결과가 어떻게 달라졌는지 봐요.",
      "앞으로 어떻게 맞추면 좋을지 물어요."
    ],
    "ordinal": 198,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20628,
    "category": "teamwork",
    "prompt": "진행 중인 모임에 새 사람이 들어오면 어떤 정보를 먼저 알려주나요?",
    "samples": [
      "현재 무엇을 하고 있는지 설명해요.",
      "사람별 역할을 알기 쉽게 알려줘요.",
      "편하게 질문할 수 있는 방법을 말해요."
    ],
    "ordinal": 210,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20629,
    "category": "teamwork",
    "prompt": "내가 한 일에 의견을 받을 때 어떤 방식이 가장 도움이 되나요?",
    "samples": [
      "구체적인 예시를 들어주면 좋아요.",
      "중요한 것부터 몇 가지만 말해주면 좋아요.",
      "생각해 볼 질문으로 알려주면 좋아요."
    ],
    "ordinal": 222,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20630,
    "category": "teamwork",
    "prompt": "동료의 결과물을 검토할 때 어떤 순서로 의견을 전하나요?",
    "samples": [
      "목표에 잘 맞는 부분부터 말해요.",
      "가장 영향이 큰 문제부터 짚어요.",
      "동료가 고민했던 부분부터 물어봐요."
    ],
    "ordinal": 234,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20631,
    "category": "teamwork",
    "prompt": "여럿이 아이디어를 낼 때 어떤 방식으로 참여하는 편인가요?",
    "samples": [
      "완성되지 않은 생각도 일단 말해요.",
      "다른 사람의 생각을 연결해 보태요.",
      "혼자 정리한 아이디어를 보여줘요."
    ],
    "ordinal": 246,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20632,
    "category": "teamwork",
    "prompt": "회의가 예상보다 길어지면 어떤 행동을 하나요?",
    "samples": [
      "남은 주제를 정리해 보자고 해요.",
      "핵심 결정이 무엇인지 다시 물어요.",
      "잠깐 쉬었다 이어가자고 제안해요."
    ],
    "ordinal": 258,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20633,
    "category": "teamwork",
    "prompt": "갑자기 다른 사람의 일을 이어받으면 무엇부터 확인하나요?",
    "samples": [
      "어디까지 진행됐는지 먼저 봐요.",
      "최종적으로 필요한 결과를 확인해요.",
      "담당자가 어려워했던 부분을 물어요."
    ],
    "ordinal": 270,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20634,
    "category": "teamwork",
    "prompt": "팀으로 낸 성과를 소개할 때 어떤 점을 이야기하고 싶나요?",
    "samples": [
      "각자 맡아서 잘해 낸 역할이에요.",
      "함께 어려움을 넘긴 과정이에요.",
      "결과가 실제로 도움이 된 부분이에요."
    ],
    "ordinal": 282,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20635,
    "category": "teamwork",
    "prompt": "팀의 결정이 내 의견과 다르면 이후 어떻게 참여하나요?",
    "samples": [
      "정해진 방향에서 내 역할을 찾아요.",
      "걱정했던 부분을 확인하며 진행해요.",
      "새 방식을 배운다는 마음으로 해 봐요."
    ],
    "ordinal": 294,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20636,
    "category": "teamwork",
    "prompt": "리더가 없는 모임에서 일이 더디게 진행되면 어떻게 하나요?",
    "samples": [
      "당장 정할 일부터 하나 꺼내요.",
      "진행을 맡을 사람을 정하자고 해요.",
      "각자 할 수 있는 일을 제안해요."
    ],
    "ordinal": 306,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20637,
    "category": "teamwork",
    "prompt": "처음 함께 일하는 사람들과 어느 정도 규칙을 정하고 싶나요?",
    "samples": [
      "연락과 마감 같은 기본만 정하고 싶어요.",
      "헷갈릴 부분을 미리 자세히 맞추고 싶어요.",
      "해 보면서 필요한 규칙을 만들고 싶어요."
    ],
    "ordinal": 318,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20638,
    "category": "teamwork",
    "prompt": "동료와 완성도에 대한 기준이 다르면 무엇을 맞춰 보나요?",
    "samples": [
      "실제로 쓰일 상황부터 확인해요.",
      "좋다고 보는 예시를 서로 보여줘요.",
      "쓸 수 있는 시간과 노력을 비교해요."
    ],
    "ordinal": 330,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20639,
    "category": "teamwork",
    "prompt": "팀원들과 의견을 나눌 때 글과 통화 중 어느 쪽이 편한가요?",
    "samples": [
      "글로 남겨 두고 천천히 읽는 게 편해요.",
      "통화로 바로 물으며 정하는 게 편해요.",
      "중요한 내용만 통화하고 글로 정리해요."
    ],
    "ordinal": 342,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20640,
    "category": "teamwork",
    "prompt": "집중하던 중 동료가 도움을 청하면 어떻게 시간을 조율하나요?",
    "samples": [
      "지금 끝낼 부분만 마치고 도와줘요.",
      "얼마나 급한 일인지 먼저 물어봐요.",
      "함께 볼 수 있는 시간을 바로 정해요."
    ],
    "ordinal": 354,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20641,
    "category": "teamwork",
    "prompt": "내가 맡은 일을 먼저 끝냈을 때 팀에서 무엇을 하나요?",
    "samples": [
      "다른 사람에게 필요한 도움이 있는지 봐요.",
      "내 결과물을 다시 확인하고 다듬어요.",
      "다음 단계에 필요한 준비를 해 둬요."
    ],
    "ordinal": 366,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20642,
    "category": "teamwork",
    "prompt": "동료가 같은 부분에서 오래 막혀 있으면 어떻게 함께 살펴보나요?",
    "samples": [
      "어디까지 해 봤는지 들어봐요.",
      "옆에서 같이 한 번 진행해 봐요.",
      "다른 방식으로 해 볼 방법을 제안해요."
    ],
    "ordinal": 378,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20643,
    "category": "teamwork",
    "prompt": "혼자 맡은 일을 해결하기 어려울 때 언제 팀에 도움을 요청하나요?",
    "samples": [
      "막힌 이유가 보이면 바로 알려요.",
      "몇 가지 방법을 시도한 뒤 요청해요.",
      "마감에 영향을 주기 전에 공유해요."
    ],
    "ordinal": 390,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20644,
    "category": "teamwork",
    "prompt": "경험 많은 동료와 생각이 다르면 어떤 방식으로 의견을 나누나요?",
    "samples": [
      "그 판단의 근거를 먼저 물어봐요.",
      "내가 본 자료나 사례를 보여줘요.",
      "두 방법을 비교해 보자고 제안해요."
    ],
    "ordinal": 402,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20645,
    "category": "teamwork",
    "prompt": "원하던 역할을 다른 사람이 맡게 되면 어떤 역할을 찾나요?",
    "samples": [
      "그 역할과 연결되는 일을 맡고 싶어요.",
      "내가 잘할 수 있는 다른 일을 찾아요.",
      "이번 기회에 새 역할을 해 보고 싶어요."
    ],
    "ordinal": 414,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20646,
    "category": "teamwork",
    "prompt": "친구들과 팀 게임을 마친 뒤 어떤 이야기를 나누고 싶나요?",
    "samples": [
      "재미있었던 장면을 다시 이야기해요.",
      "다음에 맞춰 볼 방법을 찾아요.",
      "서로 잘한 순간을 짚어 주고 싶어요."
    ],
    "ordinal": 426,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20647,
    "category": "teamwork",
    "prompt": "팀 대결을 할 때 나는 어떤 모습이 자주 나오나요?",
    "samples": [
      "전체 상황을 보며 의견을 내요.",
      "내가 맡은 역할에 깊게 집중해요.",
      "팀원들의 기분과 분위기를 살펴요."
    ],
    "ordinal": 438,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20648,
    "category": "teamwork",
    "prompt": "처음 하는 사람에게 공동 작업을 설명할 때 무엇을 먼저 보여주나요?",
    "samples": [
      "완성된 결과의 예시를 보여줘요.",
      "쉬운 단계 하나를 같이 해 봐요.",
      "전체 순서를 간단히 설명해요."
    ],
    "ordinal": 450,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20649,
    "category": "teamwork",
    "prompt": "잘 모르는 사람과 둘이 과제를 맡으면 어떻게 시작하나요?",
    "samples": [
      "각자 잘하는 일을 먼저 나눠요.",
      "같이 작은 부분부터 해 봐요.",
      "서로 편한 진행 방식을 물어봐요."
    ],
    "ordinal": 462,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20650,
    "category": "teamwork",
    "prompt": "협업하면서 가장 뿌듯한 순간은 언제인가요?",
    "samples": [
      "각자의 결과가 잘 이어질 때예요.",
      "혼자 못 풀던 문제를 함께 풀 때예요.",
      "팀원들이 편하게 의견을 낼 때예요."
    ],
    "ordinal": 474,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20651,
    "category": "teamwork",
    "prompt": "여럿이 같은 문서를 만들 때 어떤 방식을 선호하나요?",
    "samples": [
      "구역을 나눠 각자 작성하고 합쳐요.",
      "같은 문서를 보며 동시에 의논해요.",
      "한 사람이 초안을 만들고 함께 다듬어요."
    ],
    "ordinal": 486,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20652,
    "category": "teamwork",
    "prompt": "누가 맡을지 애매한 일이 생기면 어떻게 정하나요?",
    "samples": [
      "기존 역할과 가장 가까운 사람을 찾아요.",
      "시간이 되는 사람끼리 분담해요.",
      "앞으로도 쓸 기준을 함께 정해요."
    ],
    "ordinal": 498,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20653,
    "category": "teamwork",
    "prompt": "의견이 갈린 상태에서 시간이 부족하면 어떤 제안을 하나요?",
    "samples": [
      "일단 작은 범위에서 시험해 보자고 해요.",
      "결정할 담당자를 정하자고 해요.",
      "공통으로 가능한 부분부터 하자고 해요."
    ],
    "ordinal": 510,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20654,
    "category": "teamwork",
    "prompt": "준비한 모임에 참석자가 적으면 남은 사람들과 어떻게 진행하나요?",
    "samples": [
      "적은 인원에 맞게 활동을 바꿔요.",
      "계획대로 하되 더 여유 있게 즐겨요.",
      "참석자들이 원하는 방식을 물어봐요."
    ],
    "ordinal": 522,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20655,
    "category": "teamwork",
    "prompt": "팀이 기대했던 성과를 내지 못하면 무엇부터 돌아보고 싶나요?",
    "samples": [
      "목표가 현실적이었는지 살펴요.",
      "서로 역할을 잘 이해했는지 봐요.",
      "다음에 바꿀 수 있는 과정부터 찾아요."
    ],
    "ordinal": 534,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20656,
    "category": "teamwork",
    "prompt": "팀에서 비효율적인 방식을 계속 쓸 때 어떻게 개선을 제안하나요?",
    "samples": [
      "작게 바꿔 볼 수 있는 부분을 말해요.",
      "더 편한 방법의 예시를 보여줘요.",
      "현재 방식의 장단점을 함께 정리해요."
    ],
    "ordinal": 546,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20657,
    "category": "teamwork",
    "prompt": "모임을 조율하는 역할이 버거워지면 어떻게 나누고 싶나요?",
    "samples": [
      "일부 역할을 정해서 부탁하고 싶어요.",
      "진행자를 번갈아 맡으면 좋겠어요.",
      "결정할 일을 줄여 부담을 덜고 싶어요."
    ],
    "ordinal": 558,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20658,
    "category": "teamwork",
    "prompt": "내가 한 작업을 다른 사람에게 설명할 때 어디서 시작하나요?",
    "samples": [
      "왜 이 일을 했는지부터 말해요.",
      "현재 결과를 먼저 보여줘요.",
      "따라 할 수 있게 순서대로 설명해요."
    ],
    "ordinal": 570,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20659,
    "category": "teamwork",
    "prompt": "함께 할 일의 설명이 막연하면 무엇을 구체적으로 물어보나요?",
    "samples": [
      "어떤 결과를 원하는지 물어봐요.",
      "꼭 지켜야 하는 조건을 확인해요.",
      "언제까지 어느 정도 필요한지 물어봐요."
    ],
    "ordinal": 582,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20660,
    "category": "teamwork",
    "prompt": "일을 진행하다 더 좋은 아이디어가 떠오르면 어떻게 공유하나요?",
    "samples": [
      "지금 바꿀 수 있는 범위부터 말해요.",
      "다음 단계에 적용할 수 있게 적어 둬요.",
      "작은 예시를 만들어 보여줘요."
    ],
    "ordinal": 594,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20661,
    "category": "teamwork",
    "prompt": "팀원이 약속한 방법과 다르게 일하고 있으면 무엇부터 확인하나요?",
    "samples": [
      "방법을 바꾼 이유를 물어봐요.",
      "최종 결과에 영향이 있는지 살펴요.",
      "다른 팀원과 연결되는 부분을 확인해요."
    ],
    "ordinal": 606,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20662,
    "category": "teamwork",
    "prompt": "친한 친구와 함께 일을 맡을 때 무엇을 미리 맞추고 싶나요?",
    "samples": [
      "일 이야기와 사적인 대화의 시간을 나눠요.",
      "서로 기대하는 역할을 분명히 해요.",
      "불편한 점을 말하는 방식을 정해요."
    ],
    "ordinal": 618,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20663,
    "category": "teamwork",
    "prompt": "다른 사람에게 일을 맡긴 뒤 진행 상황을 어떻게 확인하나요?",
    "samples": [
      "중간 확인 시간을 미리 정해요.",
      "필요한 때 먼저 알려달라고 해요.",
      "작은 결과가 나올 때 함께 살펴봐요."
    ],
    "ordinal": 630,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20664,
    "category": "teamwork",
    "prompt": "여럿이 조용히 작업할 때 나는 어떤 분위기를 선호하나요?",
    "samples": [
      "각자 집중하다 필요할 때만 말해요.",
      "가끔 가벼운 대화가 있으면 좋아요.",
      "진행 상황을 자주 이야기하면 편해요."
    ],
    "ordinal": 642,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20665,
    "category": "teamwork",
    "prompt": "팀의 최종 결정을 맡게 되면 무엇을 가장 확인하나요?",
    "samples": [
      "다른 사람들의 우려를 충분히 들었는지 봐요.",
      "결정 기준에 맞는 선택인지 살펴요.",
      "실제로 실행할 수 있는지 확인해요."
    ],
    "ordinal": 654,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20666,
    "category": "teamwork",
    "prompt": "회의를 마칠 때 어떤 내용을 꼭 정리하고 싶나요?",
    "samples": [
      "누가 무엇을 맡는지 정리해요.",
      "무엇을 결정했고 무엇이 남았는지 봐요.",
      "다음에 언제 확인할지 정해요."
    ],
    "ordinal": 666,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20667,
    "category": "teamwork",
    "prompt": "팀에 반복적이고 지루한 일이 생기면 어떻게 나누고 싶나요?",
    "samples": [
      "돌아가면서 같은 양을 맡고 싶어요.",
      "빠르게 할 수 있는 사람이 맡으면 좋아요.",
      "각자 선호하는 일을 먼저 골라 나눠요."
    ],
    "ordinal": 678,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20668,
    "category": "teamwork",
    "prompt": "동료에게 내가 하던 일을 가르칠 때 어떤 방식이 편한가요?",
    "samples": [
      "직접 하는 모습을 보여주고 설명해요.",
      "동료가 해 보면서 질문하도록 해요.",
      "쉽게 참고할 수 있는 메모를 만들어요."
    ],
    "ordinal": 690,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20669,
    "category": "teamwork",
    "prompt": "내 실수로 팀 일정이 늦어지면 어떤 내용을 먼저 공유하나요?",
    "samples": [
      "현재 상황과 예상되는 지연을 알려요.",
      "수습할 수 있는 방법부터 말해요.",
      "도움이 필요한 부분을 구체적으로 말해요."
    ],
    "ordinal": 702,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20670,
    "category": "teamwork",
    "prompt": "함께하던 프로젝트가 끝나면 어떤 방식으로 마무리하고 싶나요?",
    "samples": [
      "배운 점을 짧게 모아 두고 싶어요.",
      "함께 고생한 사람들과 시간을 보내요.",
      "다음 사람이 쓸 자료를 정리하고 싶어요."
    ],
    "ordinal": 714,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20671,
    "category": "teamwork",
    "prompt": "이전에 함께했던 팀과 다시 일한다면 무엇을 먼저 이야기하고 싶나요?",
    "samples": [
      "지난번 좋았던 방식을 다시 꺼내요.",
      "이번에 바꾸고 싶은 점을 나눠요.",
      "각자 새로 해 보고 싶은 역할을 물어요."
    ],
    "ordinal": 726,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20672,
    "category": "values",
    "prompt": "공들여 끝낸 일을 돌아볼 때 무엇이 가장 만족스럽나요?",
    "samples": [
      "처음 세운 목표를 달성한 점이에요.",
      "하는 동안 내 실력이 늘어난 점이에요.",
      "다른 사람에게 실제로 도움이 된 점이에요."
    ],
    "ordinal": 12,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20673,
    "category": "values",
    "prompt": "혼자 연습해 온 일을 아무도 알아주지 않으면 무엇에서 보람을 찾나요?",
    "samples": [
      "나와 한 약속을 지켰다는 점이에요.",
      "어제보다 조금 나아졌다는 느낌이에요.",
      "그 일을 하는 시간 자체가 즐거워요."
    ],
    "ordinal": 24,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20674,
    "category": "values",
    "prompt": "동네 행사에 참여한다면 어떤 역할에서 보람을 느낄 것 같나요?",
    "samples": [
      "사람들이 즐길 프로그램을 만드는 역할이요.",
      "행사가 원활하게 돌아가게 준비하는 일이요.",
      "처음 온 사람이 편하게 참여하도록 돕는 일이요."
    ],
    "ordinal": 36,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20675,
    "category": "values",
    "prompt": "조건이 비슷한 두 일을 고를 때 더 끌리는 쪽은 무엇인가요?",
    "samples": [
      "내가 좋아하는 분야에 가까운 일이에요.",
      "생활과 균형을 맞추기 쉬운 일이에요.",
      "다른 사람에게 쓸모가 분명한 일이에요."
    ],
    "ordinal": 48,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20676,
    "category": "values",
    "prompt": "친구들과 가벼운 대결을 할 때 승패는 얼마나 중요한가요?",
    "samples": [
      "이기기 위해 집중하는 재미가 커요.",
      "함께 웃으며 즐겼는지가 더 중요해요.",
      "지난번보다 잘했는지가 가장 중요해요."
    ],
    "ordinal": 60,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20677,
    "category": "values",
    "prompt": "취미 활동의 기록이나 점수를 보면 무엇이 가장 궁금한가요?",
    "samples": [
      "지난번의 나보다 얼마나 나아졌는지 봐요.",
      "다른 사람들과 비교하면 어느 정도인지 봐요.",
      "즐기면서 꾸준히 했는지 확인해요."
    ],
    "ordinal": 72,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20678,
    "category": "values",
    "prompt": "내가 한 일을 칭찬받을 때 어떤 평가가 가장 기쁜가요?",
    "samples": [
      "믿고 맡길 수 있다는 말이 기뻐요.",
      "내 방식이 독특하다는 말이 좋아요.",
      "덕분에 도움이 됐다는 말이 좋아요."
    ],
    "ordinal": 84,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20679,
    "category": "values",
    "prompt": "함께 쓰는 물건이 부족할 때 어떤 배분 방식이 편한가요?",
    "samples": [
      "돌아가면서 같은 시간씩 쓰고 싶어요.",
      "가장 필요한 사람이 먼저 쓰면 좋아요.",
      "가능한 사람이 먼저 쓰고 나중에 맞춰요."
    ],
    "ordinal": 96,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20680,
    "category": "values",
    "prompt": "누군가의 성과를 평가할 때 노력과 결과를 어떻게 보나요?",
    "samples": [
      "실제로 만들어 낸 결과를 먼저 봐요.",
      "시작점에서 얼마나 성장했는지 봐요.",
      "과정과 결과를 함께 살펴보고 싶어요."
    ],
    "ordinal": 108,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20681,
    "category": "values",
    "prompt": "시간을 오래 쓴 일이 가치 있었다고 느끼는 때는 언제인가요?",
    "samples": [
      "생활에 쓸 수 있는 능력이 남았을 때예요.",
      "과정에서 좋은 사람을 만났을 때예요.",
      "다시 해도 즐겁겠다는 생각이 들 때예요."
    ],
    "ordinal": 120,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20682,
    "category": "values",
    "prompt": "내가 좋아하는 결과물이 좋은 평가를 받지 못하면 무엇을 돌아보나요?",
    "samples": [
      "내가 마음에 들어 한 이유를 생각해요.",
      "다른 사람에게 어떻게 전달됐는지 봐요.",
      "처음 만들려고 했던 목적을 다시 봐요."
    ],
    "ordinal": 132,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20683,
    "category": "values",
    "prompt": "배우는 데 시간이 오래 걸리는 취미를 계속하는 이유는 뭔가요?",
    "samples": [
      "작은 변화도 내가 직접 느낄 수 있어요.",
      "쉽게 익힐 수 없는 깊이가 재미있어요.",
      "그 일을 하는 시간이 편안해서 좋아요."
    ],
    "ordinal": 144,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20684,
    "category": "values",
    "prompt": "함께 준비하는 행사에서 내 기준과 사람들의 기대가 다르면 무엇부터 맞추나요?",
    "samples": [
      "내 기준에서 지킬 부분을 먼저 정해요.",
      "함께하는 목적에 맞춰 조정해 봐요.",
      "서로 중요하게 여기는 이유를 나눠요."
    ],
    "ordinal": 156,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20685,
    "category": "values",
    "prompt": "작은 목표를 달성했을 때 어떤 방식으로 스스로 인정하나요?",
    "samples": [
      "완료한 기록을 남겨 두고 돌아봐요.",
      "작은 선물이나 휴식으로 축하해요.",
      "가까운 사람에게 해냈다고 이야기해요."
    ],
    "ordinal": 168,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20686,
    "category": "values",
    "prompt": "겉으로 보이는 성과가 없던 기간에도 의미 있다고 느끼는 것은 뭔가요?",
    "samples": [
      "나에게 맞는 방식을 찾은 시간이에요.",
      "꾸준히 하는 습관이 생긴 점이에요.",
      "내가 원하는 것을 더 알게 된 점이에요."
    ],
    "ordinal": 180,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20687,
    "category": "values",
    "prompt": "스스로 정한 목표를 지키기 어려울 때 무엇을 기준으로 조정하나요?",
    "samples": [
      "현재 생활에 맞는 수준인지 살펴요.",
      "처음 시작한 이유가 여전히 중요한지 봐요.",
      "조금씩이라도 이어갈 방법이 있는지 봐요."
    ],
    "ordinal": 192,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20688,
    "category": "values",
    "prompt": "쉬는 날 아무것도 해내지 못했다고 느끼면 어떻게 생각하나요?",
    "samples": [
      "잘 쉬었다면 그 자체로 충분해요.",
      "작은 일 하나는 해 두고 싶어요.",
      "몸과 마음이 나아졌는지 돌아봐요."
    ],
    "ordinal": 204,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20689,
    "category": "values",
    "prompt": "나를 위한 작은 보상을 고른다면 무엇을 기준으로 정하나요?",
    "samples": [
      "오랫동안 갖고 싶었던 것을 골라요.",
      "앞으로도 쓸 수 있는 것을 골라요.",
      "지금 기분을 좋게 해 줄 경험을 찾아요."
    ],
    "ordinal": 216,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20690,
    "category": "values",
    "prompt": "함께한 일에서 내 역할이 작았어도 만족하는 순간은 언제인가요?",
    "samples": [
      "전체 결과가 잘 완성됐을 때예요.",
      "내가 맡은 부분을 확실히 해냈을 때예요.",
      "누군가 편하게 일할 수 있도록 도왔을 때예요."
    ],
    "ordinal": 228,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20691,
    "category": "values",
    "prompt": "익숙한 생활을 바꿀 기회가 생기면 무엇을 가장 지키고 싶나요?",
    "samples": [
      "지금 쌓아 온 생활의 안정감이에요.",
      "새로운 것을 해 볼 여유예요.",
      "중요한 사람들과 보내는 시간이에요."
    ],
    "ordinal": 240,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20692,
    "category": "values",
    "prompt": "빠르게 끝내기와 세밀하게 다듬기 사이에서 어떤 기준을 세우나요?",
    "samples": [
      "실제로 필요한 수준을 먼저 봐요.",
      "내가 만족할 수 있는 완성도를 봐요.",
      "쓸 수 있는 시간에 맞춰 정해요."
    ],
    "ordinal": 252,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20693,
    "category": "values",
    "prompt": "성과 없이 바쁘기만 했던 하루를 어떻게 평가하나요?",
    "samples": [
      "필요한 일을 처리했다면 의미가 있어요.",
      "새로 배운 것이 있는지 돌아봐요.",
      "내가 원한 하루였는지 생각해 봐요."
    ],
    "ordinal": 264,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20694,
    "category": "values",
    "prompt": "다른 사람이 나보다 취미를 잘하게 되면 어떤 자극을 받나요?",
    "samples": [
      "나도 더 연습하고 싶은 마음이 들어요.",
      "배울 수 있는 부분이 생겨 반가워요.",
      "내가 즐기는 방식은 그대로 이어가요."
    ],
    "ordinal": 276,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20695,
    "category": "values",
    "prompt": "여럿이 한 일에서 대표로 주목받게 되면 무엇이 신경 쓰이나요?",
    "samples": [
      "다른 사람들의 기여도 알려졌으면 해요.",
      "우리 결과를 잘 설명하고 싶어요.",
      "기대에 맞게 역할을 해야겠다고 느껴요."
    ],
    "ordinal": 288,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20696,
    "category": "values",
    "prompt": "내 아이디어가 팀의 성과로 소개되면 어떤 점이 가장 기쁜가요?",
    "samples": [
      "생각이 실제로 쓰였다는 점이에요.",
      "팀이 함께 결과를 냈다는 점이에요.",
      "내 기여를 알아줬다는 점이에요."
    ],
    "ordinal": 300,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20697,
    "category": "values",
    "prompt": "공동으로 받은 보상을 나눌 때 무엇을 기준으로 하고 싶나요?",
    "samples": [
      "각자 맡은 분량을 기준으로 나눠요.",
      "함께 참여했으니 같은 몫으로 나눠요.",
      "투입한 시간과 어려움을 함께 고려해요."
    ],
    "ordinal": 312,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20698,
    "category": "values",
    "prompt": "내가 한 실수를 만회했다고 느끼려면 무엇이 필요한가요?",
    "samples": [
      "실제로 생긴 문제를 해결해야 해요.",
      "비슷한 실수를 막을 방법을 찾아야 해요.",
      "상대와 오해가 풀렸는지 확인하고 싶어요."
    ],
    "ordinal": 324,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20699,
    "category": "values",
    "prompt": "모임의 규칙에 예외가 필요한 상황이 생기면 무엇을 먼저 보나요?",
    "samples": [
      "그 규칙을 정한 목적을 생각해요.",
      "다른 사람에게 미칠 영향을 살펴요.",
      "다음에도 적용할 수 있는지 봐요."
    ],
    "ordinal": 336,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20700,
    "category": "values",
    "prompt": "열심히 한 일을 인정받는다면 어떤 방식이 가장 좋은가요?",
    "samples": [
      "사람들 앞에서 구체적으로 말해 주면 좋아요.",
      "따로 진심을 담아 말해 주면 좋아요.",
      "더 믿고 맡겨 주는 것으로 느끼고 싶어요."
    ],
    "ordinal": 348,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20701,
    "category": "values",
    "prompt": "일을 빨리 마치려고 해도 꼭 지키고 싶은 기준은 무엇인가요?",
    "samples": [
      "나중에 다시 쓸 수 있게 정리하는 거예요.",
      "약속한 내용이 빠지지 않게 하는 거예요.",
      "함께하는 사람이 이해할 수 있게 만드는 거예요."
    ],
    "ordinal": 360,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20702,
    "category": "values",
    "prompt": "새로운 역할을 맡을 때 직함보다 더 중요하게 보는 것은 뭔가요?",
    "samples": [
      "실제로 결정할 수 있는 범위예요.",
      "배우고 성장할 수 있는 기회예요.",
      "일상에서 감당할 수 있는 부담이에요."
    ],
    "ordinal": 372,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20703,
    "category": "values",
    "prompt": "내가 만든 결과물을 언제 충분히 완성됐다고 느끼나요?",
    "samples": [
      "쓰는 사람이 불편 없이 이용할 때예요.",
      "처음 정한 기준을 모두 채웠을 때예요.",
      "내가 의도한 모습이 잘 드러났을 때예요."
    ],
    "ordinal": 384,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20704,
    "category": "values",
    "prompt": "오래 준비한 목표를 이룬 뒤 무엇이 남았으면 좋겠나요?",
    "samples": [
      "다음에도 쓸 수 있는 실력이요.",
      "함께 노력한 사람들과의 관계예요.",
      "나도 할 수 있다는 자신감이에요."
    ],
    "ordinal": 396,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20705,
    "category": "values",
    "prompt": "내가 만든 결과물에 비판을 들으면 어떤 의견을 받아들이게 되나요?",
    "samples": [
      "내가 놓친 사실을 구체적으로 짚는 말이에요.",
      "내 행동이 끼친 영향을 알려주는 말이에요.",
      "바로 바꿔 볼 수 있는 방법이 담긴 말이에요."
    ],
    "ordinal": 408,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20706,
    "category": "values",
    "prompt": "내가 익힌 요령을 다른 사람에게 알려줄 때 어떤 점이 즐거운가요?",
    "samples": [
      "상대가 덜 헤매고 할 수 있다는 점이에요.",
      "설명하면서 나도 더 이해하게 되는 점이에요.",
      "함께 더 어려운 일을 할 수 있다는 점이에요."
    ],
    "ordinal": 420,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20707,
    "category": "values",
    "prompt": "목표를 세울 때 도전적인 수준과 꾸준히 가능한 수준 중 무엇이 좋나요?",
    "samples": [
      "현재보다 크게 성장할 목표가 좋아요.",
      "생활 속에서 이어갈 수 있는 목표가 좋아요.",
      "기본 목표와 도전 목표를 나눠 잡아요."
    ],
    "ordinal": 432,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20708,
    "category": "values",
    "prompt": "공개하지 않고 혼자 만드는 작업도 오래 할 수 있는 이유는 뭔가요?",
    "samples": [
      "내가 만들고 싶은 것이 있어서요.",
      "누가 보지 않아도 과정이 재미있어요.",
      "완성했을 때 나에게 남을 것이 있어요."
    ],
    "ordinal": 444,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20709,
    "category": "values",
    "prompt": "공동 일정에 맞추느라 내 시간을 바꿀 때 무엇을 중요하게 보나요?",
    "samples": [
      "서로 번갈아 조정하고 있는지 봐요.",
      "이번 만남이 얼마나 중요한지 봐요.",
      "내가 무리 없이 감당할 수 있는지 봐요."
    ],
    "ordinal": 456,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20710,
    "category": "values",
    "prompt": "선물의 가격과 관계없이 오래 기억에 남는 이유는 뭔가요?",
    "samples": [
      "내가 했던 말을 기억해 줬기 때문이에요.",
      "실제로 자주 쓰게 되기 때문이에요.",
      "그날의 특별한 마음이 느껴졌기 때문이에요."
    ],
    "ordinal": 468,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20711,
    "category": "values",
    "prompt": "배울 기회가 제한된 모임에서 누구에게 먼저 기회를 주고 싶나요?",
    "samples": [
      "아직 해 보지 못한 사람에게 주고 싶어요.",
      "당장 활용할 사람이 먼저 배우면 좋아요.",
      "희망하는 사람끼리 순서를 정하고 싶어요."
    ],
    "ordinal": 480,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20712,
    "category": "values",
    "prompt": "잘하는 일을 부탁받았을 때 어떤 보답이 가장 기쁜가요?",
    "samples": [
      "내가 쓴 시간과 노력을 알아주면 좋아요.",
      "다음에 서로 편하게 도움을 주고받고 싶어요.",
      "도움이 어떻게 쓰였는지 알려주면 좋아요."
    ],
    "ordinal": 492,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20713,
    "category": "values",
    "prompt": "존경하는 사람의 평가와 내 만족이 다르면 무엇을 더 살펴보나요?",
    "samples": [
      "그 사람이 어떤 기준으로 평가했는지 봐요.",
      "내가 만족한 이유를 다시 생각해요.",
      "내가 원하는 방향과 맞는 조언인지 봐요."
    ],
    "ordinal": 504,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20714,
    "category": "values",
    "prompt": "꾸준히 해 온 노력을 확인할 때 어떤 기록이 의미 있나요?",
    "samples": [
      "처음과 지금의 차이를 보여주는 기록이에요.",
      "빠지지 않고 참여한 날들이에요.",
      "과정에서 느낀 변화와 배운 점이에요."
    ],
    "ordinal": 516,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20715,
    "category": "values",
    "prompt": "상이나 순위를 얻었을 때 가장 의미 있게 느껴지는 것은 뭔가요?",
    "samples": [
      "내가 노력한 결과가 확인된 점이에요.",
      "새로운 기회를 얻을 수 있다는 점이에요.",
      "응원해 준 사람들과 기뻐할 수 있는 점이에요."
    ],
    "ordinal": 528,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20716,
    "category": "values",
    "prompt": "내 아이디어를 누군가 더 발전시키면 어떤 생각이 먼저 드나요?",
    "samples": [
      "더 쓸모 있는 결과가 돼서 반가워요.",
      "제 기여도 함께 알아줬으면 해요.",
      "제가 생각 못 한 방법을 배우고 싶어요."
    ],
    "ordinal": 540,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20717,
    "category": "values",
    "prompt": "일에서 더 많은 기회와 더 많은 여유 중 무엇이 필요한 시기인가요?",
    "samples": [
      "새로운 역할을 맡고 성장하고 싶어요.",
      "현재 생활을 안정적으로 이어가고 싶어요.",
      "일 밖의 관심사에 쓸 시간이 필요해요."
    ],
    "ordinal": 552,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20718,
    "category": "values",
    "prompt": "내가 잘하고 있는지 확인할 때 누구와 비교하는 편인가요?",
    "samples": [
      "예전의 나와 가장 많이 비교해요.",
      "비슷한 상황의 사람들과 비교해요.",
      "비교보다 스스로 정한 기준을 봐요."
    ],
    "ordinal": 564,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20719,
    "category": "values",
    "prompt": "잘하지 못해도 계속 즐기고 싶은 활동은 어떤 특징이 있나요?",
    "samples": [
      "하는 동안 마음이 편안해져요.",
      "새로운 것을 발견하는 재미가 있어요.",
      "함께하는 사람들과 잘 어울릴 수 있어요."
    ],
    "ordinal": 576,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20720,
    "category": "values",
    "prompt": "하루를 잘 보냈다고 느끼게 하는 장면은 어떤 장면인가요?",
    "samples": [
      "해야 할 일을 마치고 편하게 쉬는 때예요.",
      "좋아하는 사람과 깊은 이야기를 나눈 때예요.",
      "새로운 것을 하나라도 알게 된 때예요."
    ],
    "ordinal": 588,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20721,
    "category": "values",
    "prompt": "여러 사람을 돕는 활동에서 어떤 결과가 가장 보람 있나요?",
    "samples": [
      "불편했던 일이 실제로 줄어드는 거예요.",
      "도움을 받은 사람이 편안해지는 모습이에요.",
      "다음에도 이어갈 수 있는 방식이 생기는 거예요."
    ],
    "ordinal": 600,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20722,
    "category": "values",
    "prompt": "보상은 같지만 일하는 방식이 다른 두 역할 중 무엇을 고르나요?",
    "samples": [
      "내 시간과 방법을 정할 수 있는 역할이요.",
      "전체 방향에 의견을 낼 수 있는 역할이요.",
      "명확한 역할 안에서 집중할 수 있는 일이요."
    ],
    "ordinal": 612,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20723,
    "category": "values",
    "prompt": "새로운 환경에 적응할 때 내 방식 중 무엇은 유지하고 싶나요?",
    "samples": [
      "사람을 대할 때 지키던 예의예요.",
      "일과 휴식을 나누는 생활 방식이에요.",
      "궁금한 점을 직접 확인하는 습관이에요."
    ],
    "ordinal": 624,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20724,
    "category": "values",
    "prompt": "모임에서 내 생각과 다른 규칙을 정하려 하면 무엇부터 확인하나요?",
    "samples": [
      "내가 양보하기 어려운 이유를 살펴요.",
      "서로 같은 목표를 보고 있는지 물어요.",
      "다른 방법으로 둘 다 지킬 수 있는지 봐요."
    ],
    "ordinal": 636,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20725,
    "category": "values",
    "prompt": "남들이 알아주지 않아도 스스로 잘했다고 느끼는 행동은 뭔가요?",
    "samples": [
      "어려운 일을 끝까지 마무리한 일이에요.",
      "필요한 순간에 솔직하게 말한 일이에요.",
      "내 상태를 알고 무리하지 않은 일이에요."
    ],
    "ordinal": 648,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20726,
    "category": "values",
    "prompt": "힘든 과정을 끝낸 뒤 축하할 때 무엇에 초점을 맞추고 싶나요?",
    "samples": [
      "마침내 해낸 결과를 기뻐하고 싶어요.",
      "포기하지 않고 지나온 시간을 돌아봐요.",
      "함께 도움을 주고받은 사람을 떠올려요."
    ],
    "ordinal": 660,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20727,
    "category": "values",
    "prompt": "나중에 쓸모가 없어진 일에 시간을 많이 썼다면 무엇을 남기고 싶나요?",
    "samples": [
      "다음에 활용할 수 있는 경험을 남겨요.",
      "그때 열심히 했던 마음을 인정해요.",
      "방향을 바꿔야 할 신호를 배워요."
    ],
    "ordinal": 672,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20728,
    "category": "values",
    "prompt": "오래 해 온 일을 그만둘지 고민할 때 가장 중요한 기준은 뭔가요?",
    "samples": [
      "지금도 내가 원하는 일인지 살펴요.",
      "계속할 때 얻는 것과 잃는 것을 봐요.",
      "다른 일에 더 마음이 가는지 생각해요."
    ],
    "ordinal": 684,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20729,
    "category": "values",
    "prompt": "처음 정한 목표보다 다른 성과가 생겼다면 어떻게 받아들이나요?",
    "samples": [
      "예상 밖의 성과도 충분히 반가워요.",
      "원래 목표와 얼마나 연결되는지 봐요.",
      "새로운 방향이 생겼다는 점이 좋아요."
    ],
    "ordinal": 696,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20730,
    "category": "values",
    "prompt": "예전에는 중요했지만 지금은 덜 중요해진 기준을 어떻게 알아차리나요?",
    "samples": [
      "그 기준을 지켜도 만족스럽지 않을 때예요.",
      "다른 선택을 해도 편안할 때예요.",
      "내가 시간을 쓰는 곳이 달라졌을 때예요."
    ],
    "ordinal": 708,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20731,
    "category": "values",
    "prompt": "새로운 역할을 제안받으면 어떤 점에서 의미를 느끼나요?",
    "samples": [
      "나를 믿고 맡겨 줬다는 점이에요.",
      "이전과 다른 기여를 할 수 있는 점이에요.",
      "내가 해 보고 싶던 일과 가까운 점이에요."
    ],
    "ordinal": 720,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 20732,
    "category": "values",
    "prompt": "한 해를 돌아볼 때 가장 먼저 떠올리고 싶은 것은 뭔가요?",
    "samples": [
      "새롭게 해낸 일과 배운 것들이에요.",
      "함께 시간을 보낸 소중한 사람들이에요.",
      "내 생활이 전보다 편안해진 부분이에요."
    ],
    "ordinal": 732,
    "occasion": null,
    "edition": null,
    "turn": null
  },
  {
    "id": 30001,
    "occasion": "spring",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "봄에 새 모임에 가입한다면 첫날 어떻게 적응하나요?",
    "samples": [
      "먼저 옆 사람에게 말을 걸어요.",
      "진행 방식을 보며 천천히 참여해요.",
      "공통 관심사가 있는 사람을 찾아요."
    ],
    "ordinal": null
  },
  {
    "id": 30002,
    "occasion": "spring",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "봄나들이를 가기로 한 날 갑자기 비가 오면 어떻게 하나요?",
    "samples": [
      "실내에서 할 만한 일을 바로 찾아요.",
      "함께 가는 사람들과 다시 의논해요.",
      "다른 날로 미루고 집에서 쉬어요."
    ],
    "ordinal": null
  },
  {
    "id": 30003,
    "occasion": "spring",
    "edition": 0,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "새로운 계절이 시작되면 생활 습관을 어떻게 바꾸나요?",
    "samples": [
      "바꿀 습관 하나를 정해 기록해요.",
      "필요하다고 느낄 때 조금씩 바꿔요.",
      "하던 생활을 유지하는 편이에요."
    ],
    "ordinal": null
  },
  {
    "id": 30004,
    "occasion": "spring",
    "edition": 0,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "벚꽃 구경을 갔는데 사람이 예상보다 많으면 어떻게 하나요?",
    "samples": [
      "다른 조용한 길을 찾아 걸어요.",
      "사람들과 어울려 분위기를 즐겨요.",
      "같이 온 사람의 생각을 먼저 물어요."
    ],
    "ordinal": null
  },
  {
    "id": 30005,
    "occasion": "spring",
    "edition": 0,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "봄에 새 취미를 시작할 때 누구와 배우고 싶나요?",
    "samples": [
      "친구와 함께 시작하면 편해요.",
      "혼자 배워 보면서 집중하고 싶어요.",
      "처음 만나는 사람들과 배워 보고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 30006,
    "occasion": "spring",
    "edition": 0,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "봄맞이 정리를 할 때 오래된 물건은 어떻게 처리하나요?",
    "samples": [
      "최근에 썼는지를 기준으로 정리해요.",
      "추억이 있는 물건은 따로 모아 둬요.",
      "사진을 찍어 두고 필요한 사람에게 줘요."
    ],
    "ordinal": null
  },
  {
    "id": 30007,
    "occasion": "spring",
    "edition": 0,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "소풍 준비를 여럿이 함께 한다면 어떤 역할이 편한가요?",
    "samples": [
      "전체 준비 목록을 만드는 일이 편해요.",
      "맡은 음식이나 물건을 챙기고 싶어요.",
      "빠진 것이 없는지 살피는 일이 편해요."
    ],
    "ordinal": null
  },
  {
    "id": 30008,
    "occasion": "spring",
    "edition": 0,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "따뜻한 봄날 갑자기 시간이 생기면 무엇부터 하나요?",
    "samples": [
      "친구에게 함께 나갈 수 있는지 물어요.",
      "혼자 걸으며 생각을 정리해요.",
      "미뤄 둔 일을 끝내고 쉬어요."
    ],
    "ordinal": null
  },
  {
    "id": 30009,
    "occasion": "spring",
    "edition": 0,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "봄나들이 중 친구와 걷는 속도가 다르면 어떻게 하나요?",
    "samples": [
      "천천히 함께 걸을 수 있게 맞춰요.",
      "쉬어 갈 장소를 정하자고 말해요.",
      "각자 걷고 만날 지점을 정해요."
    ],
    "ordinal": null
  },
  {
    "id": 30010,
    "occasion": "spring",
    "edition": 0,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "봄에 새로운 일을 맡게 되면 무엇을 먼저 알고 싶나요?",
    "samples": [
      "제가 맡을 범위와 마감을 알고 싶어요.",
      "함께 일할 사람들을 먼저 알고 싶어요.",
      "직접 해 볼 수 있는 일이 무엇인지 궁금해요."
    ],
    "ordinal": null
  },
  {
    "id": 30011,
    "occasion": "spring",
    "edition": 0,
    "turn": 10,
    "category": "seasonal_behavior",
    "prompt": "날이 풀려 약속이 늘어나면 혼자만의 시간은 어떻게 챙기나요?",
    "samples": [
      "약속 없는 날을 미리 비워 둬요.",
      "피곤해지면 약속을 조정해요.",
      "만남 사이에 짧게 혼자 쉬어요."
    ],
    "ordinal": null
  },
  {
    "id": 30012,
    "occasion": "spring",
    "edition": 0,
    "turn": 11,
    "category": "seasonal_behavior",
    "prompt": "봄이 끝날 무렵 새로 시작한 일을 어떻게 돌아보나요?",
    "samples": [
      "시작할 때 세운 목표와 비교해요.",
      "하면서 즐거웠는지를 생각해요.",
      "계속할지 다른 일을 할지 정해요."
    ],
    "ordinal": null
  },
  {
    "id": 30051,
    "occasion": "summer",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "여름휴가 일정을 잡을 때 가장 먼저 정하는 것은 무엇인가요?",
    "samples": [
      "함께 갈 사람과 날짜부터 정해요.",
      "얼마나 쓸 수 있는지 먼저 정해요.",
      "쉬고 싶은지 돌아다닐지 먼저 정해요."
    ],
    "ordinal": null
  },
  {
    "id": 30052,
    "occasion": "summer",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "휴가지에서 친구가 갑자기 일정을 바꾸자고 하면 어떻게 하나요?",
    "samples": [
      "새 일정이 괜찮은지 들어 보고 정해요.",
      "꼭 가고 싶던 곳은 남기자고 말해요.",
      "하루쯤 각자 다니자고 제안해요."
    ],
    "ordinal": null
  },
  {
    "id": 30053,
    "occasion": "summer",
    "edition": 0,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "더위 때문에 예민해졌을 때 주변 사람에게 어떻게 표현하나요?",
    "samples": [
      "조금 쉬고 싶다고 미리 이야기해요.",
      "말수를 줄이고 혼자 진정해요.",
      "어떤 점이 불편한지 바로 말해요."
    ],
    "ordinal": null
  },
  {
    "id": 30054,
    "occasion": "summer",
    "edition": 0,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "여름휴가를 함께 간다면 자유 시간은 얼마나 필요한가요?",
    "samples": [
      "하루에 한두 시간은 혼자 보내고 싶어요.",
      "대부분 함께 다니는 것이 좋아요.",
      "하고 싶은 일이 다를 때만 나눠 다녀요."
    ],
    "ordinal": null
  },
  {
    "id": 30055,
    "occasion": "summer",
    "edition": 0,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "휴가지에서 길을 잘못 들었을 때 가장 먼저 어떻게 하나요?",
    "samples": [
      "지도를 보고 돌아갈 길을 찾아요.",
      "근처 사람에게 길을 물어봐요.",
      "새 길에서 둘러볼 곳을 찾아봐요."
    ],
    "ordinal": null
  },
  {
    "id": 30056,
    "occasion": "summer",
    "edition": 0,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "친구들이 여름휴가 계획을 맡기면 어떻게 준비하나요?",
    "samples": [
      "선호하는 활동을 먼저 물어봐요.",
      "제가 짠 계획을 보여 주고 조정해요.",
      "각자 가고 싶은 곳을 맡아 정하게 해요."
    ],
    "ordinal": null
  },
  {
    "id": 30057,
    "occasion": "summer",
    "edition": 0,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "무더운 날 약속 장소까지 가기 힘들 것 같으면 어떻게 하나요?",
    "samples": [
      "미리 연락해서 장소를 바꿔 봐요.",
      "잠깐 쉬었다 갈 수 있게 일찍 나가요.",
      "상대에게 만나는 시간을 늦추자고 해요."
    ],
    "ordinal": null
  },
  {
    "id": 30058,
    "occasion": "summer",
    "edition": 0,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "여름휴가에서 돌아온 다음 날은 어떻게 보내고 싶나요?",
    "samples": [
      "집에서 조용히 쉬며 짐을 풀어요.",
      "다시 일상에 맞춰 할 일을 시작해요.",
      "사진을 정리하며 여행을 떠올려요."
    ],
    "ordinal": null
  },
  {
    "id": 30059,
    "occasion": "summer",
    "edition": 0,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "야외에서 놀다가 소나기를 만나면 어떤 반응이 먼저 나오나요?",
    "samples": [
      "비를 피할 장소부터 찾아요.",
      "예상 밖의 상황이 조금 재미있어요.",
      "남은 일정을 어떻게 할지 걱정돼요."
    ],
    "ordinal": null
  },
  {
    "id": 30060,
    "occasion": "summer",
    "edition": 0,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "친구와 휴가 예산이 다를 때 어떻게 맞추나요?",
    "samples": [
      "각자 쓸 수 있는 금액을 먼저 말해요.",
      "공통으로 할 활동만 정해요.",
      "둘 다 편하게 쓸 수 있는 곳을 찾아요."
    ],
    "ordinal": null
  },
  {
    "id": 30061,
    "occasion": "summer",
    "edition": 0,
    "turn": 10,
    "category": "seasonal_behavior",
    "prompt": "여름밤에 갑작스러운 모임 제안을 받으면 어떻게 답하나요?",
    "samples": [
      "내일 일정이 괜찮으면 바로 나가요.",
      "누가 오는지 듣고 결정해요.",
      "미리 잡은 약속이 편하다고 말해요."
    ],
    "ordinal": null
  },
  {
    "id": 30062,
    "occasion": "summer",
    "edition": 0,
    "turn": 11,
    "category": "seasonal_behavior",
    "prompt": "휴가를 마친 뒤 어떤 순간을 가장 오래 이야기하나요?",
    "samples": [
      "함께 웃었던 예상 밖의 일이요.",
      "새롭게 해 보고 배운 일이요.",
      "마음 편하게 쉬었던 시간이요."
    ],
    "ordinal": null
  },
  {
    "id": 30101,
    "occasion": "autumn",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "가을에 새 목표를 세운다면 어떤 방식으로 시작하나요?",
    "samples": [
      "작은 단계로 나눠 날짜를 정해요.",
      "일단 해 보고 목표를 조정해요.",
      "경험 있는 사람에게 먼저 물어봐요."
    ],
    "ordinal": null
  },
  {
    "id": 30102,
    "occasion": "autumn",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "친구와 가을 산책을 할 때 대화가 없어도 편한가요?",
    "samples": [
      "말없이 같이 걷는 시간도 편해요.",
      "무슨 생각을 하는지 물어보고 싶어요.",
      "잠깐 조용히 걷다가 제가 말을 꺼내요."
    ],
    "ordinal": null
  },
  {
    "id": 30103,
    "occasion": "autumn",
    "edition": 0,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "가을 여행에서 낯선 마을에 들를 기회가 생기면 어떻게 하나요?",
    "samples": [
      "시간을 확인한 뒤 들러 보고 싶어요.",
      "원래 가려던 곳을 먼저 가고 싶어요.",
      "함께 간 사람들의 의견을 들어요."
    ],
    "ordinal": null
  },
  {
    "id": 30104,
    "occasion": "autumn",
    "edition": 0,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "해가 짧아지면서 하루가 아쉽게 느껴지면 어떻게 하나요?",
    "samples": [
      "하고 싶은 일을 낮 시간에 배치해요.",
      "저녁에도 할 수 있는 일을 찾아요.",
      "계절에 맞게 느긋하게 지내요."
    ],
    "ordinal": null
  },
  {
    "id": 30105,
    "occasion": "autumn",
    "edition": 0,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "가을에 책을 한 권 읽기로 했다면 어떤 방식이 잘 맞나요?",
    "samples": [
      "매일 읽을 분량을 정해 둬요.",
      "관심 가는 부분부터 읽어요.",
      "같이 읽는 사람과 이야기를 나눠요."
    ],
    "ordinal": null
  },
  {
    "id": 30106,
    "occasion": "autumn",
    "edition": 0,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "단풍 구경 장소를 친구들과 정할 때 의견이 갈리면 어떻게 하나요?",
    "samples": [
      "각 장소의 장단점을 비교해요.",
      "가장 가고 싶어 하는 사람에게 맞춰요.",
      "이번과 다음 순서를 나눠 정해요."
    ],
    "ordinal": null
  },
  {
    "id": 30107,
    "occasion": "autumn",
    "edition": 0,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "선선한 날 혼자 외출할 때 계획은 어느 정도 세우나요?",
    "samples": [
      "가는 곳과 돌아올 시간을 정해요.",
      "목적지 하나만 정하고 나가요.",
      "그날 눈에 들어오는 곳에 들러요."
    ],
    "ordinal": null
  },
  {
    "id": 30108,
    "occasion": "autumn",
    "edition": 0,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "가을 축제에서 관심 있는 체험을 발견하면 어떻게 참여하나요?",
    "samples": [
      "혼자라도 바로 신청해 봐요.",
      "친구가 함께하면 참여하고 싶어요.",
      "다른 사람이 하는 것을 먼저 지켜봐요."
    ],
    "ordinal": null
  },
  {
    "id": 30109,
    "occasion": "autumn",
    "edition": 0,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "가을에 한 해의 계획을 점검하다 못한 일을 발견하면 어떻게 하나요?",
    "samples": [
      "남은 기간에 맞게 목표를 줄여요.",
      "왜 미뤘는지부터 생각해 봐요.",
      "지금도 필요한 일인지 다시 판단해요."
    ],
    "ordinal": null
  },
  {
    "id": 30110,
    "occasion": "autumn",
    "edition": 0,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "친구가 가을 풍경을 보며 옛일을 이야기하면 어떻게 듣나요?",
    "samples": [
      "그때의 마음이 어땠는지 물어봐요.",
      "비슷한 제 경험도 함께 이야기해요.",
      "말을 끊지 않고 끝까지 들어요."
    ],
    "ordinal": null
  },
  {
    "id": 30111,
    "occasion": "autumn",
    "edition": 0,
    "turn": 10,
    "category": "seasonal_behavior",
    "prompt": "날이 쌀쌀해져 집에 머무는 시간이 늘면 어떻게 지내나요?",
    "samples": [
      "밀린 일을 차분하게 정리해요.",
      "취미를 즐길 시간을 더 늘려요.",
      "친구와 통화하며 이야기를 나눠요."
    ],
    "ordinal": null
  },
  {
    "id": 30112,
    "occasion": "autumn",
    "edition": 0,
    "turn": 11,
    "category": "seasonal_behavior",
    "prompt": "올가을 나에게 맞았던 휴식 방식은 무엇인가요?",
    "samples": [
      "사람이 적은 곳에서 혼자 쉬는 거예요.",
      "편한 사람과 이야기하는 거예요.",
      "새로운 일을 하며 기분을 바꾸는 거예요."
    ],
    "ordinal": null
  },
  {
    "id": 30151,
    "occasion": "winter",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "추운 겨울 주말에 친구가 밖에서 만나자고 하면 어떻게 하나요?",
    "samples": [
      "따뜻한 실내에서 만나자고 제안해요.",
      "보고 싶은 친구라면 준비해서 나가요.",
      "집에서 쉬고 싶다고 솔직히 말해요."
    ],
    "ordinal": null
  },
  {
    "id": 30152,
    "occasion": "winter",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "눈 때문에 이동 계획이 늦어지면 무엇부터 챙기나요?",
    "samples": [
      "도착 시간을 확인해 상대에게 알려요.",
      "안전하게 갈 다른 방법을 찾아요.",
      "급한 일정이 있는지부터 정리해요."
    ],
    "ordinal": null
  },
  {
    "id": 30153,
    "occasion": "winter",
    "edition": 0,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "겨울에 기분이 가라앉는 날에는 어떤 도움이 편한가요?",
    "samples": [
      "이야기를 들어 주는 사람이 있으면 좋아요.",
      "혼자 쉴 시간을 주면 편해요.",
      "가볍게 산책하자고 해 주면 좋아요."
    ],
    "ordinal": null
  },
  {
    "id": 30154,
    "occasion": "winter",
    "edition": 0,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "겨울 여행에서 따뜻하게 쉬는 것과 밖을 둘러보는 것 중 무엇이 끌리나요?",
    "samples": [
      "숙소에서 충분히 쉬고 싶어요.",
      "추워도 새로운 곳을 보고 싶어요.",
      "낮에는 나가고 저녁에는 쉬고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 30155,
    "occasion": "winter",
    "edition": 0,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "연말 모임이 겹치면 어떤 기준으로 참석을 정하나요?",
    "samples": [
      "먼저 잡은 약속을 우선해요.",
      "오랜만에 만나는 사람을 우선해요.",
      "제가 쉴 수 있는 시간도 고려해요."
    ],
    "ordinal": null
  },
  {
    "id": 30156,
    "occasion": "winter",
    "edition": 0,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "추위를 많이 타는 친구와 외출하면 일정을 어떻게 잡나요?",
    "samples": [
      "중간에 실내에서 쉬는 시간을 넣어요.",
      "친구에게 편한 코스를 먼저 물어봐요.",
      "짧게 만나고 다음 약속을 잡아요."
    ],
    "ordinal": null
  },
  {
    "id": 30157,
    "occasion": "winter",
    "edition": 0,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "겨울에 집에서 오래 쉬게 되면 생활 리듬을 어떻게 유지하나요?",
    "samples": [
      "일어나는 시간을 일정하게 지켜요.",
      "그날 컨디션에 맞춰 쉬어요.",
      "밖에 나갈 약속을 가끔 잡아 둬요."
    ],
    "ordinal": null
  },
  {
    "id": 30158,
    "occasion": "winter",
    "edition": 0,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "눈 오는 날 예정보다 일찍 일이 끝나면 어떻게 보내고 싶나요?",
    "samples": [
      "집에 가서 편하게 쉬고 싶어요.",
      "잠깐 밖을 걸으며 눈을 보고 싶어요.",
      "친구에게 시간이 되는지 물어봐요."
    ],
    "ordinal": null
  },
  {
    "id": 30159,
    "occasion": "winter",
    "edition": 0,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "친구들과 겨울 여행을 준비할 때 짐은 어떻게 챙기나요?",
    "samples": [
      "필요한 물건을 목록으로 적어요.",
      "자주 쓰는 것부터 간단히 넣어요.",
      "함께 쓸 물건을 나눠 챙겨요."
    ],
    "ordinal": null
  },
  {
    "id": 30160,
    "occasion": "winter",
    "edition": 0,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "겨울철 취미를 새로 배울 때 어떤 수업이 편한가요?",
    "samples": [
      "정해진 진도를 따라가는 수업이요.",
      "제 속도에 맞춰 연습하는 수업이요.",
      "사람들과 함께 결과물을 만드는 수업이요."
    ],
    "ordinal": null
  },
  {
    "id": 30161,
    "occasion": "winter",
    "edition": 0,
    "turn": 10,
    "category": "seasonal_behavior",
    "prompt": "겨울 내내 미뤄 둔 일이 있다면 어떻게 다시 시작하나요?",
    "samples": [
      "오늘 할 수 있는 작은 일부터 해요.",
      "미루게 된 이유부터 정리해요.",
      "누군가와 함께 할 시간을 정해요."
    ],
    "ordinal": null
  },
  {
    "id": 30162,
    "occasion": "winter",
    "edition": 0,
    "turn": 11,
    "category": "seasonal_behavior",
    "prompt": "추운 계절을 함께 보낸 사람에게 고마움을 어떻게 전하나요?",
    "samples": [
      "도움받은 일을 구체적으로 말해요.",
      "같이 식사할 자리를 마련해요.",
      "제 도움이 필요할 때 먼저 나서요."
    ],
    "ordinal": null
  },
  {
    "id": 30201,
    "occasion": "seollal",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "설 연휴 일정을 잡을 때 무엇부터 확인하나요?",
    "samples": [
      "함께 지낼 사람들의 일정을 먼저 물어요.",
      "제가 쉬어야 할 날부터 정해요.",
      "이미 잡힌 약속부터 확인해요."
    ],
    "ordinal": null
  },
  {
    "id": 30202,
    "occasion": "seollal",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "설 모임에 오랜만에 만나는 사람이 있으면 어떻게 인사하나요?",
    "samples": [
      "요즘 어떻게 지내는지 먼저 물어요.",
      "반갑게 인사하고 대화를 기다려요.",
      "함께 기억하는 이야기를 꺼내요."
    ],
    "ordinal": null
  },
  {
    "id": 30203,
    "occasion": "seollal",
    "edition": 0,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "설에 여러 사람이 한꺼번에 말을 걸면 어떻게 대화하나요?",
    "samples": [
      "한 사람의 이야기를 차례로 들어요.",
      "여럿이 함께 이야기하도록 화제를 꺼내요.",
      "잠깐 조용한 자리로 옮겨 대화해요."
    ],
    "ordinal": null
  },
  {
    "id": 30204,
    "occasion": "seollal",
    "edition": 0,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "설 준비를 함께 할 때 맡을 일을 어떻게 정하나요?",
    "samples": [
      "제가 잘하는 일을 먼저 제안해요.",
      "필요한 일이 무엇인지 물어봐요.",
      "각자 원하는 역할을 먼저 들어요."
    ],
    "ordinal": null
  },
  {
    "id": 30205,
    "occasion": "seollal",
    "edition": 0,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "설날 덕담을 받으면 어떻게 반응하나요?",
    "samples": [
      "고맙다고 바로 말하며 웃어요.",
      "상대에게도 제 마음을 담아 답해요.",
      "조금 쑥스럽지만 나중에 다시 연락해요."
    ],
    "ordinal": null
  },
  {
    "id": 30206,
    "occasion": "seollal",
    "edition": 0,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "설에 내 계획을 묻는 질문을 받으면 어디까지 이야기하나요?",
    "samples": [
      "확실하게 정한 일만 이야기해요.",
      "고민 중인 부분도 편하게 말해요.",
      "아직 말하고 싶지 않다고 전해요."
    ],
    "ordinal": null
  },
  {
    "id": 30207,
    "occasion": "seollal",
    "edition": 0,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "설 연휴에 혼자 보내는 시간이 생기면 어떻게 쓰고 싶나요?",
    "samples": [
      "사람들을 만난 뒤 조용히 쉬고 싶어요.",
      "미뤄 둔 취미를 해 보고 싶어요.",
      "앞으로의 일정을 정리하고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 30208,
    "occasion": "seollal",
    "edition": 0,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "설 모임에서 모두 원하는 놀이가 다르면 어떻게 정하나요?",
    "samples": [
      "짧게 하나씩 돌아가며 해 보자고 해요.",
      "원하는 사람끼리 나눠 놀자고 해요.",
      "많이 원하는 놀이부터 골라요."
    ],
    "ordinal": null
  },
  {
    "id": 30209,
    "occasion": "seollal",
    "edition": 0,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "설 연휴가 끝나기 전 일상 복귀를 어떻게 준비하나요?",
    "samples": [
      "해야 할 일을 적고 짐을 챙겨요.",
      "수면 시간을 평소대로 맞춰요.",
      "마지막 날까지 쉬고 그다음 날 시작해요."
    ],
    "ordinal": null
  },
  {
    "id": 30210,
    "occasion": "seollal",
    "edition": 0,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "설에 들은 조언 중 내 생각과 다른 말은 어떻게 받아들이나요?",
    "samples": [
      "이유를 듣고 필요한 부분만 참고해요.",
      "제 생각도 차분하게 이야기해요.",
      "그 자리에서는 듣고 혼자 판단해요."
    ],
    "ordinal": null
  },
  {
    "id": 30251,
    "occasion": "chuseok",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "추석 연휴에 쉬는 날과 만나는 날은 어떻게 나누고 싶나요?",
    "samples": [
      "모임 없는 날을 먼저 남겨 둬요.",
      "만날 사람과 약속을 잡은 뒤 정해요.",
      "그날의 기분에 따라 정하고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 30252,
    "occasion": "chuseok",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "추석에 여럿이 음식을 준비하면 어떤 방식으로 함께 하나요?",
    "samples": [
      "역할을 나눠 각자 맡은 일을 해요.",
      "같은 일을 하면서 이야기를 나눠요.",
      "필요한 곳을 보며 도와요."
    ],
    "ordinal": null
  },
  {
    "id": 30253,
    "occasion": "chuseok",
    "edition": 0,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "추석 모임에서 낯선 사람 옆에 앉으면 어떻게 대화를 시작하나요?",
    "samples": [
      "어떻게 오게 됐는지 가볍게 물어요.",
      "주변에서 나누는 이야기에 참여해요.",
      "상대가 먼저 말을 걸 때까지 기다려요."
    ],
    "ordinal": null
  },
  {
    "id": 30254,
    "occasion": "chuseok",
    "edition": 0,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "추석에 친한 사람이 못 온다고 하면 어떻게 마음을 전하나요?",
    "samples": [
      "짧게라도 통화할 시간을 잡아요.",
      "편할 때 보라고 메시지를 남겨요.",
      "연휴 뒤에 따로 만날 약속을 잡아요."
    ],
    "ordinal": null
  },
  {
    "id": 30255,
    "occasion": "chuseok",
    "edition": 0,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "추석 모임에서 의견이 다른 이야기가 나오면 어떻게 참여하나요?",
    "samples": [
      "제 경험을 중심으로 조심스럽게 말해요.",
      "다른 생각의 이유를 먼저 물어봐요.",
      "논쟁보다 다른 화제로 넘어가고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 30256,
    "occasion": "chuseok",
    "edition": 0,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "추석에 혼자 산책할 시간이 생기면 어떤 생각을 많이 하나요?",
    "samples": [
      "요즘 제 마음이 어떤지 돌아봐요.",
      "앞으로 하고 싶은 일을 떠올려요.",
      "생각을 쉬고 주변 풍경에 집중해요."
    ],
    "ordinal": null
  },
  {
    "id": 30257,
    "occasion": "chuseok",
    "edition": 0,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "추석 연휴에 갑자기 모임 제안을 받으면 참석 여부를 어떻게 정하나요?",
    "samples": [
      "이미 정한 일정과 비교해 결정해요.",
      "보고 싶은 사람이 있으면 참석해요.",
      "예정대로 쉬겠다고 이야기해요."
    ],
    "ordinal": null
  },
  {
    "id": 30258,
    "occasion": "chuseok",
    "edition": 0,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "추석 선물을 고를 때 어떤 점에 가장 신경 쓰나요?",
    "samples": [
      "상대가 실제로 필요로 하는 것이요.",
      "제 마음이 잘 전해지는 것이요.",
      "부담 없이 받을 수 있는 가격이요."
    ],
    "ordinal": null
  },
  {
    "id": 30259,
    "occasion": "chuseok",
    "edition": 0,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "추석 모임을 마친 뒤에는 누구에게 먼저 연락하나요?",
    "samples": [
      "이야기를 많이 못 나눈 사람에게요.",
      "모임을 준비한 사람에게요.",
      "생각나는 사람에게 그때그때 연락해요."
    ],
    "ordinal": null
  },
  {
    "id": 30260,
    "occasion": "chuseok",
    "edition": 0,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "긴 연휴를 보내고 나면 어떤 시간이 가장 기억에 남나요?",
    "samples": [
      "서로 속마음을 나눴던 시간이요.",
      "새로운 곳을 함께 가 본 시간이요.",
      "아무 일정 없이 편히 쉰 시간이요."
    ],
    "ordinal": null
  },
  {
    "id": 30301,
    "occasion": "newyear",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "새해 목표를 주변 사람들에게 어떻게 알리는 편인가요?",
    "samples": [
      "가까운 사람에게 구체적으로 말해요.",
      "목표를 이룬 뒤에 알려 주고 싶어요.",
      "같이 도전할 사람을 찾아 공유해요."
    ],
    "ordinal": null
  },
  {
    "id": 30302,
    "occasion": "newyear",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "새해 첫날 계획과 다르게 하루를 보내면 어떻게 느끼나요?",
    "samples": [
      "시작이 아쉽지만 내일부터 다시 해요.",
      "계획보다 즐거웠다면 만족해요.",
      "왜 달라졌는지 정리해 보고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 30303,
    "occasion": "newyear",
    "edition": 0,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "새해에 바꾸고 싶은 습관은 어떻게 시작하나요?",
    "samples": [
      "매일 할 수 있을 만큼 작게 정해요.",
      "평소 일정 중 실천할 시간을 먼저 정해요.",
      "친구와 함께 점검하기로 약속해요."
    ],
    "ordinal": null
  },
  {
    "id": 30304,
    "occasion": "newyear",
    "edition": 0,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "새해 계획을 세울 때 휴식 시간은 어떻게 넣나요?",
    "samples": [
      "쉬는 날도 일정에 미리 적어요.",
      "일을 끝낸 다음 충분히 쉬어요.",
      "컨디션을 보며 유동적으로 정해요."
    ],
    "ordinal": null
  },
  {
    "id": 30351,
    "occasion": "valentines",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "좋아하는 마음을 전할 때 어떤 방식이 가장 편한가요?",
    "samples": [
      "만나서 제 마음을 직접 말해요.",
      "메시지로 생각을 정리해 전해요.",
      "함께할 시간을 자주 만들어요."
    ],
    "ordinal": null
  },
  {
    "id": 30352,
    "occasion": "valentines",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "밸런타인데이에 마음을 전하려 할 때 가장 걱정되는 점은 무엇인가요?",
    "samples": [
      "상대가 부담스러워할지 걱정돼요.",
      "제 마음을 말로 표현하기가 어려워요.",
      "관계가 어떻게 바뀔지 고민돼요."
    ],
    "ordinal": null
  },
  {
    "id": 30353,
    "occasion": "valentines",
    "edition": 0,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "기념일을 챙기는 방식이 상대와 다르면 어떻게 맞추나요?",
    "samples": [
      "서로 기대하는 것을 미리 말해요.",
      "둘 다 편한 방식 하나를 정해요.",
      "각자가 잘하는 방식으로 표현해요."
    ],
    "ordinal": null
  },
  {
    "id": 30354,
    "occasion": "valentines",
    "edition": 0,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "예상하지 못한 호감 표현을 받으면 어떻게 반응하나요?",
    "samples": [
      "제 마음도 바로 이야기해요.",
      "생각할 시간을 달라고 말해요.",
      "우선 고마운 마음부터 전해요."
    ],
    "ordinal": null
  },
  {
    "id": 30401,
    "occasion": "whiteday",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "선물을 받은 뒤 고마운 마음을 어떤 방식으로 전하나요?",
    "samples": [
      "받은 자리에서 느낀 점을 말해요.",
      "사용해 본 뒤 사진과 메시지를 보내요.",
      "상대와 함께할 시간을 준비해요."
    ],
    "ordinal": null
  },
  {
    "id": 30402,
    "occasion": "whiteday",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "기념일 선물을 주고받을 때 금액 차이가 크면 어떻게 느끼나요?",
    "samples": [
      "마음을 생각하면 크게 신경 쓰이지 않아요.",
      "다음에는 편한 예산을 정하고 싶어요.",
      "비슷하게 돌려줘야 할지 고민돼요."
    ],
    "ordinal": null
  },
  {
    "id": 30451,
    "occasion": "childrens",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "어릴 때 친구들과 놀던 모습 중 지금도 남아 있는 것은 무엇인가요?",
    "samples": [
      "하고 싶은 놀이를 먼저 제안하는 모습이요.",
      "옆에서 보다 천천히 참여하는 모습이요.",
      "게임의 규칙을 꼼꼼히 확인하는 모습이요."
    ],
    "ordinal": null
  },
  {
    "id": 30452,
    "occasion": "childrens",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "어릴 때 잘하지 못하던 놀이에 다시 도전한다면 어떻게 하나요?",
    "samples": [
      "혼자 연습한 뒤 함께 해 보고 싶어요.",
      "서툰 모습도 웃으며 바로 해 봐요.",
      "잘하는 친구에게 방법을 물어봐요."
    ],
    "ordinal": null
  },
  {
    "id": 30501,
    "occasion": "hangul",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "내 생각을 설명할 때 말과 글 중 어떤 방식이 편한가요?",
    "samples": [
      "글로 정리한 뒤 이야기하면 편해요.",
      "대화하면서 생각을 정리하는 편이에요.",
      "중요한 말만 글로 남기는 편이에요."
    ],
    "ordinal": null
  },
  {
    "id": 30502,
    "occasion": "hangul",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "누군가 내 말을 다르게 이해했을 때 어떻게 설명하나요?",
    "samples": [
      "구체적인 예를 들어 다시 말해요.",
      "상대가 어떻게 이해했는지 먼저 물어요.",
      "잠깐 생각을 정리한 뒤 설명해요."
    ],
    "ordinal": null
  },
  {
    "id": 30551,
    "occasion": "christmas",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "크리스마스 약속을 잡을 때 어떤 분위기를 원하나요?",
    "samples": [
      "여럿이 모여 활기차게 보내고 싶어요.",
      "가까운 한두 사람과 조용히 있고 싶어요.",
      "특별한 계획 없이 편히 쉬고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 30552,
    "occasion": "christmas",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "크리스마스에 준비한 일이 예상대로 안 되면 어떻게 하나요?",
    "samples": [
      "대신 할 수 있는 일을 바로 찾아요.",
      "아쉬운 마음을 함께 이야기해요.",
      "함께 있는 시간 자체를 즐기려 해요."
    ],
    "ordinal": null
  },
  {
    "id": 30553,
    "occasion": "christmas",
    "edition": 0,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "크리스마스에 선물을 주고받을 때 어떤 순간이 가장 즐거운가요?",
    "samples": [
      "상대를 생각하며 고르는 일이 더 즐거워요.",
      "어떤 선물을 받을지 기대하는 편이에요.",
      "함께 반응을 나누는 시간이 좋아요."
    ],
    "ordinal": null
  },
  {
    "id": 30554,
    "occasion": "christmas",
    "edition": 0,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "특별한 날 상대가 평소처럼 보내고 싶다고 하면 어떻게 하나요?",
    "samples": [
      "왜 그렇게 보내고 싶은지 물어봐요.",
      "저도 편한 하루를 함께 보내요.",
      "제가 기대한 것도 솔직히 이야기해요."
    ],
    "ordinal": null
  },
  {
    "id": 30601,
    "occasion": "yearend",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "한 해를 돌아볼 때 어떤 일을 먼저 떠올리나요?",
    "samples": [
      "제가 해낸 일부터 떠올려요.",
      "함께한 사람들과의 시간을 떠올려요.",
      "마음이 달라졌던 순간들을 떠올려요."
    ],
    "ordinal": null
  },
  {
    "id": 30602,
    "occasion": "yearend",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "올해 이루지 못한 목표는 어떻게 정리하나요?",
    "samples": [
      "내년에 이어 할 수 있게 나눠 둬요.",
      "지금도 원하는 목표인지 다시 봐요.",
      "못한 이유를 적고 마무리해요."
    ],
    "ordinal": null
  },
  {
    "id": 30603,
    "occasion": "yearend",
    "edition": 0,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "올해 고마웠던 사람에게 어떤 말을 전하고 싶나요?",
    "samples": [
      "도움받은 순간을 구체적으로 말하고 싶어요.",
      "함께해서 편했다고 말하고 싶어요.",
      "내년에도 자주 만나자고 말하고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 30604,
    "occasion": "yearend",
    "edition": 0,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "새해를 앞두고 지난 실수를 떠올리면 어떻게 마음을 정리하나요?",
    "samples": [
      "다음에 다르게 할 방법을 적어요.",
      "친한 사람과 이야기하며 털어내요.",
      "그때의 저를 이해해 보려고 해요."
    ],
    "ordinal": null
  },
  {
    "id": 30651,
    "occasion": "pepero",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "작은 간식을 건네며 마음을 표현하는 일이 편한가요?",
    "samples": [
      "말보다 작은 선물로 표현하기가 편해요.",
      "직접 고맙다고 말하는 것이 편해요.",
      "상대에게 부담이 될지 먼저 생각해요."
    ],
    "ordinal": null
  },
  {
    "id": 30652,
    "occasion": "pepero",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "주변 사람들이 챙기는 기념일을 나는 별로 중요하게 여기지 않으면 어떻게 하나요?",
    "samples": [
      "제 생각을 말하고 평소처럼 지내요.",
      "가까운 사람이 좋아하면 함께 챙겨요.",
      "가볍게 참여하며 분위기를 즐겨요."
    ],
    "ordinal": null
  },
  {
    "id": 30701,
    "occasion": "marchfirst",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "기념일을 맞아 몰랐던 역사 이야기를 접하면 어떻게 알아보나요?",
    "samples": [
      "궁금한 부분을 따로 찾아 읽어요.",
      "관련 장소나 전시를 가 보고 싶어요.",
      "아는 사람과 이야기를 나눠요."
    ],
    "ordinal": null
  },
  {
    "id": 30702,
    "occasion": "marchfirst",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "사람마다 같은 사건을 다르게 설명하면 어떤 점부터 살펴보나요?",
    "samples": [
      "설명의 근거가 무엇인지 확인해요.",
      "각자 어떤 경험에서 말하는지 들어요.",
      "서로 겹치는 사실부터 정리해요."
    ],
    "ordinal": null
  },
  {
    "id": 30751,
    "occasion": "gratitude",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "평소 고마운 사람에게 감사 인사를 할 때 무엇을 말하나요?",
    "samples": [
      "어떤 도움이 힘이 됐는지 말해요.",
      "그 사람의 어떤 점이 좋은지 말해요.",
      "앞으로 제가 돕고 싶은 마음을 전해요."
    ],
    "ordinal": null
  },
  {
    "id": 30752,
    "occasion": "gratitude",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "감사 인사를 받으면 어떤 반응이 가장 자연스럽나요?",
    "samples": [
      "저도 도움이 돼서 좋았다고 말해요.",
      "쑥스럽지만 고맙게 받아들여요.",
      "함께 수고한 사람의 이야기도 꺼내요."
    ],
    "ordinal": null
  },
  {
    "id": 30801,
    "occasion": "liberation",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "공휴일에 혼자 시간을 보낼 수 있다면 하루를 어떻게 정하나요?",
    "samples": [
      "쉬고 싶은 만큼 쉬며 정해요.",
      "평소 못한 일 하나를 정해 해요.",
      "밖에 나가서 마음 가는 대로 움직여요."
    ],
    "ordinal": null
  },
  {
    "id": 30802,
    "occasion": "liberation",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "내가 중요하게 여기는 원칙과 주변의 의견이 다르면 어떻게 하나요?",
    "samples": [
      "제 원칙이 필요한 이유를 말해요.",
      "다른 의견에서 받아들일 점을 찾아요.",
      "당장 결론 내리지 않고 생각해 봐요."
    ],
    "ordinal": null
  },
  {
    "id": 30851,
    "occasion": "foundation",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "함께하는 모임에 새 규칙이 필요하다면 어떻게 정하고 싶나요?",
    "samples": [
      "각자의 불편을 듣고 기준을 만들어요.",
      "간단한 규칙부터 시험해 보고 싶어요.",
      "모두가 동의할 때까지 의논하고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 30852,
    "occasion": "foundation",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "모임에서 오래 써 온 방식이 불편해지면 어떻게 바꾸자고 제안하나요?",
    "samples": [
      "바꿨을 때 좋은 점을 구체적으로 말해요.",
      "다른 사람도 불편한지 먼저 물어요.",
      "작은 부분부터 바꿔 보자고 해요."
    ],
    "ordinal": null
  },
  {
    "id": 30901,
    "occasion": "memorial",
    "edition": 0,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "누군가 자신에게 소중한 기억을 이야기하면 어떻게 듣나요?",
    "samples": [
      "어떤 마음이었는지 조심스럽게 물어요.",
      "말을 보태지 않고 차분히 들어요.",
      "기억에 남는 부분을 다시 짚어 줘요."
    ],
    "ordinal": null
  },
  {
    "id": 30902,
    "occasion": "memorial",
    "edition": 0,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "조용히 생각할 시간이 필요할 때 주변에 어떻게 알리나요?",
    "samples": [
      "혼자 있고 싶다고 직접 이야기해요.",
      "잠깐 걸어오겠다고 말하고 나가요.",
      "나중에 이야기할 시간을 따로 정해요."
    ],
    "ordinal": null
  },
  {
    "id": 32001,
    "occasion": "spring",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "봄에 새로 만난 사람과 친해질 때 먼저 하는 행동은 무엇인가요?",
    "samples": [
      "함께 할 수 있는 일을 제안해요.",
      "이야기를 나누며 공통점을 찾아요.",
      "자주 마주치면서 천천히 친해져요."
    ],
    "ordinal": null
  },
  {
    "id": 32002,
    "occasion": "spring",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "함께 꽃구경 갈 장소를 정할 때 어떻게 의견을 내나요?",
    "samples": [
      "후보 몇 곳을 찾아 보여 줘요.",
      "원하는 분위기부터 이야기해요.",
      "다른 사람의 제안을 듣고 보태요."
    ],
    "ordinal": null
  },
  {
    "id": 32003,
    "occasion": "spring",
    "edition": 1,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "봄맞이로 방을 새로 꾸민다면 무엇부터 시작하나요?",
    "samples": [
      "배치를 먼저 그린 뒤 움직여요.",
      "가장 불편한 곳부터 바꿔 봐요.",
      "물건을 정리하며 차츰 결정해요."
    ],
    "ordinal": null
  },
  {
    "id": 32004,
    "occasion": "spring",
    "edition": 1,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "새로운 모임의 분위기가 예상과 다르면 어떻게 하나요?",
    "samples": [
      "몇 번 더 참여하며 알아봐요.",
      "어떤 점이 다른지 운영자에게 물어요.",
      "제게 맞는 다른 모임도 찾아봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32005,
    "occasion": "spring",
    "edition": 1,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "봄에 운동을 시작했다가 며칠 빠졌다면 어떻게 다시 하겠어요?",
    "samples": [
      "다음에 할 날짜부터 정해요.",
      "부담 없는 양으로 줄여서 해요.",
      "같이 할 사람에게 연락해요."
    ],
    "ordinal": null
  },
  {
    "id": 32006,
    "occasion": "spring",
    "edition": 1,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "친구가 갑자기 봄 여행을 제안하면 무엇을 확인하나요?",
    "samples": [
      "일정과 비용이 가능한지 확인해요.",
      "어떤 여행을 생각하는지 물어봐요.",
      "함께 가는 사람을 먼저 알아봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32007,
    "occasion": "spring",
    "edition": 1,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "봄 소풍에서 준비한 음식이 부족하면 어떻게 대처하나요?",
    "samples": [
      "근처에서 더 구할 수 있는지 찾아요.",
      "있는 음식을 조금씩 나눠 먹자고 해요.",
      "사람들에게 원하는 대안을 물어봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32008,
    "occasion": "spring",
    "edition": 1,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "봄날 야외 모임에서 혼자 있는 사람을 보면 어떻게 행동하나요?",
    "samples": [
      "옆에 앉아 가벼운 말을 걸어요.",
      "함께 어울리고 싶은지 가볍게 물어봐요.",
      "혼자 쉬고 싶어 보이면 잠시 기다려요."
    ],
    "ordinal": null
  },
  {
    "id": 32009,
    "occasion": "spring",
    "edition": 1,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "봄에 하고 싶은 일이 여러 개 생기면 어떻게 순서를 정하나요?",
    "samples": [
      "지금 가장 궁금한 일부터 해요.",
      "오래 이어 갈 수 있는 일부터 해요.",
      "시간과 비용이 적게 드는 일부터 해요."
    ],
    "ordinal": null
  },
  {
    "id": 32010,
    "occasion": "spring",
    "edition": 1,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "봄나들이에서 친구가 계속 사진을 찍고 싶어 하면 어떻게 하나요?",
    "samples": [
      "저도 함께 찍으며 즐겨요.",
      "사진을 찍는 동안 주변을 둘러봐요.",
      "쉬거나 걷고 싶은 시간도 이야기해요."
    ],
    "ordinal": null
  },
  {
    "id": 32011,
    "occasion": "spring",
    "edition": 1,
    "turn": 10,
    "category": "seasonal_behavior",
    "prompt": "새 계절을 맞아 연락이 뜸했던 사람을 떠올리면 어떻게 하나요?",
    "samples": [
      "잘 지내는지 짧게 연락해요.",
      "함께 만날 계기가 생길 때 연락해요.",
      "마지막 대화를 떠올리며 잠깐 고민해요."
    ],
    "ordinal": null
  },
  {
    "id": 32012,
    "occasion": "spring",
    "edition": 1,
    "turn": 11,
    "category": "seasonal_behavior",
    "prompt": "봄에 시작한 취미가 생각보다 어렵다면 어떻게 이어 가나요?",
    "samples": [
      "쉬운 단계로 돌아가 다시 해요.",
      "도움을 받을 수 있는 사람을 찾아요.",
      "계속 배우고 싶은지 먼저 생각해요."
    ],
    "ordinal": null
  },
  {
    "id": 32051,
    "occasion": "summer",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "휴가 일정을 빽빽하게 잡자는 친구에게 어떻게 답하나요?",
    "samples": [
      "꼭 하고 싶은 일정만 골라 보자고 해요.",
      "저도 많이 보고 싶어서 함께 정해요.",
      "따로 쉴 시간을 남겨 달라고 말해요."
    ],
    "ordinal": null
  },
  {
    "id": 32052,
    "occasion": "summer",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "여름 여행에서 방을 함께 쓸 때 무엇을 미리 맞추고 싶나요?",
    "samples": [
      "잠들고 일어나는 시간을 맞추고 싶어요.",
      "혼자 쉴 시간이 필요한지 알고 싶어요.",
      "함께 쓰는 물건의 관리 방법을 정하고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32053,
    "occasion": "summer",
    "edition": 1,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "휴가지에서 새로운 활동에 참여하자고 하면 무엇이 결정에 영향을 주나요?",
    "samples": [
      "직접 해 보고 싶은 호기심이 커요.",
      "준비가 얼마나 필요한지 살펴봐요.",
      "함께하는 사람이 편안한지가 중요해요."
    ],
    "ordinal": null
  },
  {
    "id": 32054,
    "occasion": "summer",
    "edition": 1,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "여름휴가 중 연락은 어느 정도가 편한가요?",
    "samples": [
      "가까운 사람에게 하루 한 번쯤 연락해요.",
      "중요한 연락만 확인하고 쉬고 싶어요.",
      "재미있는 일이 생길 때마다 전하고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32055,
    "occasion": "summer",
    "edition": 1,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "친구와 여행하다 체력이 떨어지면 어떻게 말하나요?",
    "samples": [
      "얼마나 쉬고 싶은지 바로 이야기해요.",
      "잠깐 앉아도 되는지 가볍게 물어봐요.",
      "다음 일정부터 줄이자고 제안해요."
    ],
    "ordinal": null
  },
  {
    "id": 32056,
    "occasion": "summer",
    "edition": 1,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "여름 모임에서 처음 해 보는 게임을 하면 어떻게 배우나요?",
    "samples": [
      "규칙을 충분히 들은 뒤 시작해요.",
      "한 번 해 보면서 익혀요.",
      "옆 사람이 하는 것을 보고 따라 해요."
    ],
    "ordinal": null
  },
  {
    "id": 32057,
    "occasion": "summer",
    "edition": 1,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "휴가 계획을 혼자 짠 뒤 다른 사람이 반대하면 어떻게 하나요?",
    "samples": [
      "반대하는 이유를 들어 보고 조정해요.",
      "제가 중요하게 생각한 부분을 설명해요.",
      "각자 원하는 일정을 나눠 짜 봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32058,
    "occasion": "summer",
    "edition": 1,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "더운 날 친구가 말없이 조용해지면 어떻게 반응하나요?",
    "samples": [
      "괜찮은지 가볍게 물어봐요.",
      "편히 쉴 수 있게 잠시 말을 줄여요.",
      "시원한 곳에 가자고 제안해요."
    ],
    "ordinal": null
  },
  {
    "id": 32059,
    "occasion": "summer",
    "edition": 1,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "여름휴가의 예상 밖 지출을 마주하면 어떻게 조정하나요?",
    "samples": [
      "남은 예산을 다시 나눠 봐요.",
      "덜 중요한 일정을 줄여요.",
      "감당 가능한지 확인하고 즐기려 해요."
    ],
    "ordinal": null
  },
  {
    "id": 32060,
    "occasion": "summer",
    "edition": 1,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "오래 기다린 여름휴가가 짧아지면 무엇을 꼭 하고 싶나요?",
    "samples": [
      "일정을 줄이고 충분히 쉬고 싶어요.",
      "가장 기대했던 활동만큼은 해 보고 싶어요.",
      "함께 간 사람과 여유롭게 이야기하고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32061,
    "occasion": "summer",
    "edition": 1,
    "turn": 10,
    "category": "seasonal_behavior",
    "prompt": "여름에 함께 배운 운동에서 친구의 실력이 더 빨리 늘면 어떻게 하나요?",
    "samples": [
      "저도 방법을 바꿔 연습해 보고 싶어요.",
      "제 속도대로 즐기면 된다고 생각해요.",
      "어떻게 연습했는지 물어보고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32062,
    "occasion": "summer",
    "edition": 1,
    "turn": 11,
    "category": "seasonal_behavior",
    "prompt": "휴가를 다녀온 뒤 일상이 지루하게 느껴지면 어떻게 하나요?",
    "samples": [
      "가벼운 외출이나 새 취미로 변화를 줘요.",
      "여행 중 좋았던 습관을 이어 봐요.",
      "익숙한 생활에 돌아온 편안함을 찾아요."
    ],
    "ordinal": null
  },
  {
    "id": 32101,
    "occasion": "autumn",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "가을 여행에서 사진을 남길 때 어떤 순간에 카메라를 드나요?",
    "samples": [
      "함께한 사람의 표정이 좋을 때요.",
      "처음 보는 풍경이 눈에 들어올 때요.",
      "나중에 기억하고 싶은 일이 있을 때요."
    ],
    "ordinal": null
  },
  {
    "id": 32102,
    "occasion": "autumn",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "가을에 혼자 배우고 싶은 것이 생기면 공부 계획을 어떻게 잡나요?",
    "samples": [
      "매주 정해진 시간을 확보해요.",
      "궁금한 주제부터 찾아보기 시작해요.",
      "작은 결과물을 만들 날짜를 정해요."
    ],
    "ordinal": null
  },
  {
    "id": 32103,
    "occasion": "autumn",
    "edition": 1,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "가을 산책 중 친구가 고민을 털어놓으면 어떤 이야기를 먼저 듣고 싶나요?",
    "samples": [
      "어떤 일이 있었는지 차근차근 듣고 싶어요.",
      "친구가 지금 어떤 마음인지 알고 싶어요.",
      "친구가 바라는 도움이 무엇인지 듣고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32104,
    "occasion": "autumn",
    "edition": 1,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "단풍 여행에서 좋은 장소를 찾았는데 시간이 부족하면 어떻게 하나요?",
    "samples": [
      "기존 일정 하나를 줄여 머물러요.",
      "다음에 다시 올 곳으로 남겨 둬요.",
      "함께 간 사람에게 우선순위를 물어요."
    ],
    "ordinal": null
  },
  {
    "id": 32105,
    "occasion": "autumn",
    "edition": 1,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "가을 축제에 혼자 가면 어떤 식으로 둘러보나요?",
    "samples": [
      "관심 있는 행사 시간을 먼저 확인해요.",
      "눈에 띄는 곳부터 자유롭게 가 봐요.",
      "현장에서 추천하는 프로그램을 물어봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32106,
    "occasion": "autumn",
    "edition": 1,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "한 해가 얼마 남지 않았다고 느낄 때 무엇을 정리하나요?",
    "samples": [
      "마무리할 일을 골라 정리해요.",
      "지금까지 잘한 일을 적어 봐요.",
      "앞으로도 이어 갈 관계를 생각해요."
    ],
    "ordinal": null
  },
  {
    "id": 32107,
    "occasion": "autumn",
    "edition": 1,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "가을에 친구와 함께 읽은 책의 감상이 다르면 어떻게 이야기하나요?",
    "samples": [
      "다르게 느낀 부분이 무엇인지 물어요.",
      "제가 인상 깊었던 장면을 설명해요.",
      "정답 없이 각자의 느낌을 나누고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32108,
    "occasion": "autumn",
    "edition": 1,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "선선한 가을날 갑자기 산책하고 싶어지면 누구와 가고 싶나요?",
    "samples": [
      "혼자 생각하며 걸을 수 있으면 좋아요.",
      "편한 친구 한 명과 가고 싶어요.",
      "함께 갈 수 있는 사람들을 모아 봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32109,
    "occasion": "autumn",
    "edition": 1,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "가을맞이 정리를 할 때 가장 어려운 부분은 무엇인가요?",
    "samples": [
      "무엇부터 할지 정하는 일이 어려워요.",
      "남길 것과 버릴 것을 고르기 어려워요.",
      "정리를 시작하면 언제 멈출지 정하기 어려워요."
    ],
    "ordinal": null
  },
  {
    "id": 32110,
    "occasion": "autumn",
    "edition": 1,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "친구가 가을에 새로운 일을 시작한다고 하면 어떻게 응원하나요?",
    "samples": [
      "왜 시작했는지 관심을 갖고 물어봐요.",
      "필요한 도움을 구체적으로 물어봐요.",
      "부담 없이 힘내라고 짧게 전해요."
    ],
    "ordinal": null
  },
  {
    "id": 32111,
    "occasion": "autumn",
    "edition": 1,
    "turn": 10,
    "category": "seasonal_behavior",
    "prompt": "가을 여행 후 함께 쓴 비용을 정산할 때 어떤 방식이 편한가요?",
    "samples": [
      "쓴 내역을 바로 공유하며 나누는 방식이요.",
      "여행이 끝난 뒤 한 번에 정리하는 방식이요.",
      "큰 비용만 미리 기준을 정하는 방식이요."
    ],
    "ordinal": null
  },
  {
    "id": 32112,
    "occasion": "autumn",
    "edition": 1,
    "turn": 11,
    "category": "seasonal_behavior",
    "prompt": "계절이 바뀌면서 관심사가 달라지면 기존 취미는 어떻게 하나요?",
    "samples": [
      "쉬어 두었다가 생각나면 다시 해요.",
      "새 취미와 시간을 나눠 이어 가요.",
      "계속할 이유가 없으면 정리해요."
    ],
    "ordinal": null
  },
  {
    "id": 32151,
    "occasion": "winter",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "추운 날 약속을 앞두고 나가기 싫어지면 어떻게 마음을 정하나요?",
    "samples": [
      "만나서 즐거울 일을 떠올려요.",
      "제 컨디션을 확인하고 솔직히 연락해요.",
      "짧게 만나자고 일정을 조정해요."
    ],
    "ordinal": null
  },
  {
    "id": 32152,
    "occasion": "winter",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "겨울 여행지에서 계획에 없던 여유가 생기면 어떻게 하나요?",
    "samples": [
      "따뜻한 곳에서 쉬고 싶어요.",
      "근처에 새로 가 볼 곳을 찾아요.",
      "함께 온 사람과 긴 이야기를 나눠요."
    ],
    "ordinal": null
  },
  {
    "id": 32153,
    "occasion": "winter",
    "edition": 1,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "겨울에 함께 있는 사람과 실내 온도 선호가 다르면 어떻게 맞추나요?",
    "samples": [
      "둘 다 괜찮은 온도를 찾아봐요.",
      "옷이나 담요로 각자 조절해요.",
      "어떤 점이 불편한지 먼저 물어봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32154,
    "occasion": "winter",
    "edition": 1,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "눈 때문에 친구가 약속에 늦으면 기다리는 동안 무엇을 하나요?",
    "samples": [
      "상대가 안전하게 오는지 연락해요.",
      "근처에서 혼자 할 일을 찾아요.",
      "남은 약속 시간을 다시 계산해 봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32155,
    "occasion": "winter",
    "edition": 1,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "한동안 야외 활동을 못 하게 되면 어떤 방식으로 기분을 바꾸나요?",
    "samples": [
      "집에서 새로 해 볼 일을 찾아요.",
      "친구와 통화하며 이야기를 나눠요.",
      "생활 공간을 정리하거나 바꿔 봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32156,
    "occasion": "winter",
    "edition": 1,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "친구가 겨울에 의욕이 줄었다고 말하면 어떤 도움을 제안하나요?",
    "samples": [
      "함께 가볍게 할 일을 제안해요.",
      "충분히 쉬어도 된다고 말해요.",
      "무엇이 가장 힘든지 먼저 물어봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32157,
    "occasion": "winter",
    "edition": 1,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "겨울에 하고 싶은 일이 생겨도 준비가 오래 걸리면 어떻게 하나요?",
    "samples": [
      "필요한 준비를 하나씩 해 나가요.",
      "준비가 덜 필요한 쉬운 방법부터 해 봐요.",
      "지금 얼마나 원하는지 더 생각해요."
    ],
    "ordinal": null
  },
  {
    "id": 32158,
    "occasion": "winter",
    "edition": 1,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "연말 약속을 줄이고 싶을 때 어떻게 이야기하나요?",
    "samples": [
      "쉴 시간이 필요하다고 솔직히 말해요.",
      "다음 달에 따로 만나자고 제안해요.",
      "참석할 수 있는 날짜만 구체적으로 알려요."
    ],
    "ordinal": null
  },
  {
    "id": 32159,
    "occasion": "winter",
    "edition": 1,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "눈 오는 풍경을 보다가 즐거웠던 기억이 떠오르면 어떻게 하나요?",
    "samples": [
      "생각난 사람에게 바로 연락해요.",
      "사진이나 짧은 글로 남겨 둬요.",
      "혼자 조용히 그 기분을 즐겨요."
    ],
    "ordinal": null
  },
  {
    "id": 32160,
    "occasion": "winter",
    "edition": 1,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "겨울에 반복하던 습관을 바꾸려면 어떤 계기가 필요한가요?",
    "samples": [
      "불편한 점이 분명해져야 바꿔요.",
      "함께 바꿔 볼 사람이 있으면 시작해요.",
      "새 방법이 궁금해지면 시도해 봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32161,
    "occasion": "winter",
    "edition": 1,
    "turn": 10,
    "category": "seasonal_behavior",
    "prompt": "긴 겨울밤에 생각이 많아지면 어떻게 정리하나요?",
    "samples": [
      "떠오르는 생각을 글로 적어요.",
      "가까운 사람과 차분히 이야기해요.",
      "다른 활동에 집중하며 잠시 쉬어요."
    ],
    "ordinal": null
  },
  {
    "id": 32162,
    "occasion": "winter",
    "edition": 1,
    "turn": 11,
    "category": "seasonal_behavior",
    "prompt": "겨울을 마무리하며 나에게 어떤 점을 칭찬하고 싶나요?",
    "samples": [
      "어려워도 꾸준히 해 온 점이요.",
      "필요할 때 쉬는 선택을 한 점이요.",
      "익숙하지 않은 일에 도전한 점이요."
    ],
    "ordinal": null
  },
  {
    "id": 32201,
    "occasion": "seollal",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "설에 만날 사람들에게 내 근황을 어떻게 전하는 편인가요?",
    "samples": [
      "최근 있었던 일을 편하게 이야기해요.",
      "상대가 궁금해하는 것부터 답해요.",
      "특별히 달라진 일만 간단히 말해요."
    ],
    "ordinal": null
  },
  {
    "id": 32202,
    "occasion": "seollal",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "설 연휴에 개인적인 질문을 받으면 어떻게 답하나요?",
    "samples": [
      "말할 수 있는 범위를 정해 답해요.",
      "지금은 이야기하기 어렵다고 말해요.",
      "다른 근황 이야기로 자연스럽게 옮겨요."
    ],
    "ordinal": null
  },
  {
    "id": 32203,
    "occasion": "seollal",
    "edition": 1,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "설 음식을 만드는 방법에 서로 의견이 다르면 어떻게 맞추나요?",
    "samples": [
      "각자의 방법을 듣고 역할을 나눠요.",
      "중요한 기준만 먼저 정해 둬요.",
      "작게 해 보고 더 편한 방법을 골라요."
    ],
    "ordinal": null
  },
  {
    "id": 32204,
    "occasion": "seollal",
    "edition": 1,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "설 모임에서 내 이야기를 할 기회가 잘 안 생기면 어떻게 하나요?",
    "samples": [
      "대화가 잠깐 멈출 때 말을 꺼내요.",
      "편한 사람과 나중에 따로 이야기해요.",
      "듣는 것만으로도 괜찮은 편이에요."
    ],
    "ordinal": null
  },
  {
    "id": 32205,
    "occasion": "seollal",
    "edition": 1,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "설날 새 목표를 이야기하는 사람에게 어떤 질문을 하고 싶나요?",
    "samples": [
      "왜 그 일을 하고 싶은지 궁금해요.",
      "어떻게 시작할 생각인지 물어보고 싶어요.",
      "어떤 도움이 필요한지 알고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32206,
    "occasion": "seollal",
    "edition": 1,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "명절 모임에서 예상보다 일찍 지치면 어떻게 쉬나요?",
    "samples": [
      "잠깐 혼자 쉬겠다고 이야기해요.",
      "산책하거나 바깥 공기를 쐬어요.",
      "조용한 자리에 앉아 이야기를 들으며 쉬어요."
    ],
    "ordinal": null
  },
  {
    "id": 32207,
    "occasion": "seollal",
    "edition": 1,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "설 연휴에 연락을 많이 받으면 어떻게 답하는 편인가요?",
    "samples": [
      "받을 때마다 짧게라도 답해요.",
      "여유 있는 시간에 모아서 답해요.",
      "가까운 사람에게는 따로 길게 답해요."
    ],
    "ordinal": null
  },
  {
    "id": 32208,
    "occasion": "seollal",
    "edition": 1,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "설 모임에서 게임에 연달아 지면 어떤 반응이 나오나요?",
    "samples": [
      "다음에는 다르게 해 보려고 해요.",
      "결과보다 함께 웃는 시간이 좋아요.",
      "잠깐 구경하며 방법을 살펴봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32209,
    "occasion": "seollal",
    "edition": 1,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "설 모임이 끝난 뒤 아쉬운 마음을 어떻게 표현하나요?",
    "samples": [
      "집에 가는 길에 잘 만났다고 연락해요.",
      "다음에 볼 날짜를 구체적으로 잡아요.",
      "좋았던 순간을 사진이나 말로 남겨요."
    ],
    "ordinal": null
  },
  {
    "id": 32210,
    "occasion": "seollal",
    "edition": 1,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "설 연휴 계획 중 못한 일이 생기면 어떻게 받아들이나요?",
    "samples": [
      "다음에 할 수 있게 따로 적어 둬요.",
      "충분히 쉬었다면 괜찮다고 생각해요.",
      "왜 못했는지 확인해 다음 계획에 반영해요."
    ],
    "ordinal": null
  },
  {
    "id": 32251,
    "occasion": "chuseok",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "추석에 많은 사람을 만난 뒤에는 어떤 휴식이 필요한가요?",
    "samples": [
      "혼자 조용히 보내는 시간이 필요해요.",
      "가장 편한 사람과 이야기하고 싶어요.",
      "가볍게 몸을 움직이며 쉬고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32252,
    "occasion": "chuseok",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "추석 모임에서 역할이 한 사람에게 몰리면 어떻게 의논하나요?",
    "samples": [
      "제가 맡을 수 있는 일을 먼저 말해요.",
      "전체 할 일을 함께 다시 나눠요.",
      "당사자에게 필요한 도움부터 물어봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32253,
    "occasion": "chuseok",
    "edition": 1,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "명절 음식 준비 중 실수가 생기면 어떻게 반응하나요?",
    "samples": [
      "바로 고칠 수 있는 방법부터 찾아요.",
      "일단 괜찮다고 말해 분위기를 풀어요.",
      "누가 도울 수 있는지 확인해요."
    ],
    "ordinal": null
  },
  {
    "id": 32254,
    "occasion": "chuseok",
    "edition": 1,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "추석에 오랜만에 본 사람이 많이 달라졌다면 무엇이 궁금한가요?",
    "samples": [
      "어떤 일을 겪었는지 궁금해요.",
      "요즘 어떤 마음으로 지내는지 궁금해요.",
      "앞으로 무엇을 하고 싶은지 궁금해요."
    ],
    "ordinal": null
  },
  {
    "id": 32255,
    "occasion": "chuseok",
    "edition": 1,
    "turn": 4,
    "category": "seasonal_behavior",
    "prompt": "추석 연휴에 만나려는데 서로 가능한 시간이 다르면 어떻게 맞추나요?",
    "samples": [
      "서로 꼭 해야 할 일을 먼저 확인해요.",
      "가능한 시간을 새로 찾아 제안해요.",
      "이번에는 각자 보내는 것도 괜찮아요."
    ],
    "ordinal": null
  },
  {
    "id": 32256,
    "occasion": "chuseok",
    "edition": 1,
    "turn": 5,
    "category": "seasonal_behavior",
    "prompt": "추석 모임에서 오래된 실수 이야기가 나오면 어떻게 반응하나요?",
    "samples": [
      "지금은 웃을 수 있다면 함께 웃어요.",
      "불편하다면 그만 이야기해 달라고 해요.",
      "그 뒤에 달라진 제 이야기를 들려줘요."
    ],
    "ordinal": null
  },
  {
    "id": 32257,
    "occasion": "chuseok",
    "edition": 1,
    "turn": 6,
    "category": "seasonal_behavior",
    "prompt": "명절 선물을 준비할 시간이 부족하면 어떤 기준으로 고르나요?",
    "samples": [
      "상대가 평소 필요하다고 한 것을 골라요.",
      "상대가 직접 고를 수 있게 상품권을 준비해요.",
      "먼저 마음을 전하고 나중에 골라 줘요."
    ],
    "ordinal": null
  },
  {
    "id": 32258,
    "occasion": "chuseok",
    "edition": 1,
    "turn": 7,
    "category": "seasonal_behavior",
    "prompt": "추석 연휴를 조용히 보내고 싶다면 주변에 어떻게 말하나요?",
    "samples": [
      "이번에는 충분히 쉬고 싶다고 말해요.",
      "짧게 만날 수 있는 시간을 알려 줘요.",
      "연휴 뒤에 따로 보자고 제안해요."
    ],
    "ordinal": null
  },
  {
    "id": 32259,
    "occasion": "chuseok",
    "edition": 1,
    "turn": 8,
    "category": "seasonal_behavior",
    "prompt": "함께 보낸 추석에서 서로 좋았던 시간이 다르면 어떻게 이야기하나요?",
    "samples": [
      "왜 그 시간이 좋았는지 물어봐요.",
      "제가 좋았던 순간도 이야기해요.",
      "다음에는 둘 다 좋아하는 시간을 늘려 봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32260,
    "occasion": "chuseok",
    "edition": 1,
    "turn": 9,
    "category": "seasonal_behavior",
    "prompt": "연휴가 끝난 뒤 다시 일이 몰리면 어떤 순서로 시작하나요?",
    "samples": [
      "급한 일부터 골라 처리해요.",
      "작은 일을 먼저 끝내며 감을 되찾아요.",
      "함께할 사람들과 우선순위를 맞춰요."
    ],
    "ordinal": null
  },
  {
    "id": 32301,
    "occasion": "newyear",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "새해 계획에 없던 기회가 생기면 어떻게 결정하나요?",
    "samples": [
      "원래 목표와 비교한 뒤 조정해요.",
      "우선 시도해 보고 계획을 다시 세워요.",
      "믿는 사람의 의견을 듣고 결정해요."
    ],
    "ordinal": null
  },
  {
    "id": 32302,
    "occasion": "newyear",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "새해를 시작할 때 작년의 어떤 경험을 참고하나요?",
    "samples": [
      "계속하기 쉬웠던 방법을 참고해요.",
      "그만두고 싶었던 순간을 돌아봐요.",
      "사람들에게 도움받았던 일을 떠올려요."
    ],
    "ordinal": null
  },
  {
    "id": 32303,
    "occasion": "newyear",
    "edition": 1,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "새해 목표를 함께 세울 사람에게 어떤 역할을 기대하나요?",
    "samples": [
      "서로 진행 상황을 확인해 주면 좋아요.",
      "힘들 때 이야기를 들어 주면 좋아요.",
      "가끔 함께 실행할 수 있으면 좋아요."
    ],
    "ordinal": null
  },
  {
    "id": 32304,
    "occasion": "newyear",
    "edition": 1,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "새해 목표를 중간에 바꿔야 한다면 어떤 기준으로 판단하나요?",
    "samples": [
      "지금도 중요한 목표인지 살펴봐요.",
      "들일 시간과 얻을 것을 비교해요.",
      "해 보면서 느낀 제 마음을 참고해요."
    ],
    "ordinal": null
  },
  {
    "id": 32351,
    "occasion": "valentines",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "호감이 생겼을 때 상대를 알아가기 위해 어떤 행동을 하나요?",
    "samples": [
      "둘이 이야기할 기회를 만들어 봐요.",
      "취향이나 생각을 조금씩 물어봐요.",
      "친구처럼 편하게 지내며 알아봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32352,
    "occasion": "valentines",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "좋아하는 사람과 연락 속도가 다르면 어떻게 맞추고 싶나요?",
    "samples": [
      "서로 편한 연락 방식을 말해 보고 싶어요.",
      "상대의 생활 리듬을 보며 맞추고 싶어요.",
      "제 일상을 유지하며 자연스럽게 연락해요."
    ],
    "ordinal": null
  },
  {
    "id": 32353,
    "occasion": "valentines",
    "edition": 1,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "밸런타인데이에 마음을 전했는데 상대의 반응이 조용하면 어떻게 하나요?",
    "samples": [
      "어떻게 느꼈는지 직접 물어봐요.",
      "반응할 시간을 조금 더 기다려요.",
      "평소 행동을 함께 보며 생각해요."
    ],
    "ordinal": null
  },
  {
    "id": 32354,
    "occasion": "valentines",
    "edition": 1,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "밸런타인데이를 함께 보낸 뒤 어떤 점에서 가까워졌다고 느끼나요?",
    "samples": [
      "서로의 솔직한 생각을 알게 됐을 때요.",
      "말없이 있어도 편해졌을 때요.",
      "다음에 함께할 계획이 생겼을 때요."
    ],
    "ordinal": null
  },
  {
    "id": 32401,
    "occasion": "whiteday",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "화이트데이 선물로 받고 싶은 것을 상대가 직접 물으면 어떻게 느끼나요?",
    "samples": [
      "원하는 것을 받을 수 있어서 편해요.",
      "상대가 직접 골라 주면 더 기쁠 것 같아요.",
      "종류만 물어본 뒤 골라 주는 방식이 좋아요."
    ],
    "ordinal": null
  },
  {
    "id": 32402,
    "occasion": "whiteday",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "기념일에 선물보다 함께 보내는 시간을 원하면 어떻게 말하나요?",
    "samples": [
      "제가 원하는 시간을 구체적으로 말해요.",
      "함께할 활동을 먼저 제안해요.",
      "선물 이야기가 나올 때 편하게 말해요."
    ],
    "ordinal": null
  },
  {
    "id": 32451,
    "occasion": "childrens",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "어릴 때와 달라진 내 모습을 느끼는 순간은 언제인가요?",
    "samples": [
      "낯선 사람에게 먼저 말을 걸 때요.",
      "실수해도 오래 자책하지 않을 때요.",
      "혼자서도 선택을 잘할 수 있을 때요."
    ],
    "ordinal": null
  },
  {
    "id": 32452,
    "occasion": "childrens",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "함께 놀던 친구가 게임 규칙을 바꾸자고 하면 어떻게 반응하나요?",
    "samples": [
      "더 재미있을지 한번 해 보고 싶어요.",
      "모두 동의하는지 먼저 확인하고 싶어요.",
      "원래 규칙으로 한 번 끝낸 뒤 바꾸고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32501,
    "occasion": "hangul",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "고마운 마음을 글로 남긴다면 어떤 방식으로 쓰나요?",
    "samples": [
      "도움받았던 장면을 구체적으로 써요.",
      "짧아도 제 마음을 바로 표현해요.",
      "천천히 다듬어서 차분히 전해요."
    ],
    "ordinal": null
  },
  {
    "id": 32502,
    "occasion": "hangul",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "단체 대화방에서 내 글의 뜻이 잘못 전해지면 어떻게 하나요?",
    "samples": [
      "그 자리에서 뜻을 다시 설명해요.",
      "관련된 사람에게 따로 연락해요.",
      "오해한 부분이 무엇인지 먼저 물어요."
    ],
    "ordinal": null
  },
  {
    "id": 32551,
    "occasion": "christmas",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "크리스마스에 친한 사람을 초대한다면 준비는 어떻게 하나요?",
    "samples": [
      "편하게 지낼 수 있게 간단히 준비해요.",
      "각자 좋아하는 것을 미리 물어봐요.",
      "함께할 활동과 시간을 정해 둬요."
    ],
    "ordinal": null
  },
  {
    "id": 32552,
    "occasion": "christmas",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "특별한 날 혼자 보내게 되면 어떤 마음이 드나요?",
    "samples": [
      "제 시간을 쓸 수 있어 편안해요.",
      "가까운 사람과 잠깐이라도 연락하고 싶어요.",
      "평소 못한 일을 해 보고 싶어져요."
    ],
    "ordinal": null
  },
  {
    "id": 32553,
    "occasion": "christmas",
    "edition": 1,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "크리스마스 약속을 상대가 잊었다면 어떻게 이야기하나요?",
    "samples": [
      "아쉬웠던 마음을 바로 말해요.",
      "어떤 사정이 있었는지 먼저 물어요.",
      "다시 만날 날을 정하며 이야기해요."
    ],
    "ordinal": null
  },
  {
    "id": 32554,
    "occasion": "christmas",
    "edition": 1,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "함께 보낸 특별한 날을 기억하려면 어떤 방식이 잘 맞나요?",
    "samples": [
      "사진과 짧은 글로 남기는 방식이요.",
      "그날의 이야기를 자주 나누는 방식이요.",
      "좋았던 활동을 다음에 다시 하는 방식이요."
    ],
    "ordinal": null
  },
  {
    "id": 32601,
    "occasion": "yearend",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "올해 경험을 통해 전보다 중요하게 생각하게 된 것은 무엇인가요?",
    "samples": [
      "혼자 애쓰기보다 도움을 구하는 일이에요.",
      "바쁠수록 쉬는 시간을 챙기는 거예요.",
      "새로운 기회가 오면 직접 해 보는 거예요."
    ],
    "ordinal": null
  },
  {
    "id": 32602,
    "occasion": "yearend",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "연말에 사람들과 한 해를 돌아보면 어떤 이야기를 하고 싶나요?",
    "samples": [
      "서로 잘해 낸 일을 이야기하고 싶어요.",
      "힘들었지만 배운 일을 나누고 싶어요.",
      "예상 밖으로 즐거웠던 일을 나누고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32603,
    "occasion": "yearend",
    "edition": 1,
    "turn": 2,
    "category": "seasonal_behavior",
    "prompt": "올해 나를 힘들게 한 일과 거리를 두려면 어떻게 하나요?",
    "samples": [
      "제가 조절할 수 있는 부분을 정해요.",
      "가까운 사람에게 생각을 털어놔요.",
      "당분간 다른 일에 집중할 시간을 가져요."
    ],
    "ordinal": null
  },
  {
    "id": 32604,
    "occasion": "yearend",
    "edition": 1,
    "turn": 3,
    "category": "seasonal_behavior",
    "prompt": "한 해를 마무리하며 내년의 나에게 어떤 부탁을 하고 싶나요?",
    "samples": [
      "하고 싶은 일을 너무 미루지 말라고요.",
      "피곤할 때는 쉬어도 된다고요.",
      "필요할 때 도움을 구하라고 말하고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32651,
    "occasion": "pepero",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "친구들이 모두 작은 선물을 준비했는데 나만 없으면 어떻게 하나요?",
    "samples": [
      "받은 마음에 솔직하게 고맙다고 해요.",
      "다음에 제가 간식을 준비하고 싶어요.",
      "그 자리에서 함께 나눌 것을 찾아봐요."
    ],
    "ordinal": null
  },
  {
    "id": 32652,
    "occasion": "pepero",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "작은 기념일을 함께 챙기자는 제안을 받으면 무엇을 생각하나요?",
    "samples": [
      "함께 즐길 수 있을지 생각해요.",
      "서로에게 부담이 되지 않을지 봐요.",
      "어떤 마음으로 제안했는지 궁금해요."
    ],
    "ordinal": null
  },
  {
    "id": 32701,
    "occasion": "marchfirst",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "의미 있는 날을 기념하는 방식이 사람마다 다르면 어떻게 받아들이나요?",
    "samples": [
      "각자 중요하게 여기는 이유를 들어요.",
      "제가 할 수 있는 방식을 찾아요.",
      "함께할 수 있는 작은 부분을 찾아요."
    ],
    "ordinal": null
  },
  {
    "id": 32702,
    "occasion": "marchfirst",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "누군가 소신을 지킨 경험을 들려주면 무엇이 가장 궁금한가요?",
    "samples": [
      "그 선택을 하게 된 기준이 궁금해요.",
      "망설일 때 어떤 마음이었는지 궁금해요.",
      "그 뒤 생각이 달라졌는지 궁금해요."
    ],
    "ordinal": null
  },
  {
    "id": 32751,
    "occasion": "gratitude",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "오래전에 도움받은 일이 생각나면 어떻게 마음을 전하나요?",
    "samples": [
      "시간이 지나도 연락해서 고맙다고 해요.",
      "다음에 만났을 때 이야기해요.",
      "상대에게 필요한 도움이 있는지 살펴요."
    ],
    "ordinal": null
  },
  {
    "id": 32752,
    "occasion": "gratitude",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "칭찬이나 감사의 말을 공개적으로 받으면 어떻게 느끼나요?",
    "samples": [
      "여러 사람과 기쁨을 나누고 싶어요.",
      "기쁘지만 둘이 조용히 이야기하면 더 편해요.",
      "어떤 점이 도움이 됐는지 더 듣고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32801,
    "occasion": "liberation",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "누군가 내 선택을 존중해 줬다고 느끼는 순간은 언제인가요?",
    "samples": [
      "다른 의견이어도 끝까지 들어 줄 때요.",
      "결정을 재촉하지 않고 기다려 줄 때요.",
      "제가 고른 일에 관심을 보여 줄 때요."
    ],
    "ordinal": null
  },
  {
    "id": 32802,
    "occasion": "liberation",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "친구들과 함께 세운 계획과 다르게 움직이고 싶어지면 어떻게 하나요?",
    "samples": [
      "약속을 지키면서 가능한 방법을 찾아요.",
      "왜 하고 싶은지 이야기하고 조정해요.",
      "이번에는 약속을 우선하고 다음에 해요."
    ],
    "ordinal": null
  },
  {
    "id": 32851,
    "occasion": "foundation",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "새 모임을 시작한다면 처음에 어떤 것을 함께 정하고 싶나요?",
    "samples": [
      "서로 기대하는 목적부터 맞추고 싶어요.",
      "편하게 참여할 규칙을 정하고 싶어요.",
      "일단 만나 보며 필요한 것을 정하고 싶어요."
    ],
    "ordinal": null
  },
  {
    "id": 32852,
    "occasion": "foundation",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "오랫동안 함께한 사람들과 새로운 방식을 시도할 때 무엇이 필요한가요?",
    "samples": [
      "바꾸려는 이유를 충분히 나누는 것이요.",
      "작게 시험해 볼 기회를 만드는 것이요.",
      "각자의 의견을 편하게 말할 수 있는 것이요."
    ],
    "ordinal": null
  },
  {
    "id": 32901,
    "occasion": "memorial",
    "edition": 1,
    "turn": 0,
    "category": "seasonal_behavior",
    "prompt": "누군가 소중한 사람을 떠올리며 조용해지면 어떻게 곁에 있나요?",
    "samples": [
      "말을 걸지 않고 옆에 있어 줘요.",
      "이야기하고 싶은지 조심스럽게 물어봐요.",
      "편하게 쉴 수 있는 시간을 마련해 줘요."
    ],
    "ordinal": null
  },
  {
    "id": 32902,
    "occasion": "memorial",
    "edition": 1,
    "turn": 1,
    "category": "seasonal_behavior",
    "prompt": "오래 기억하고 싶은 사람의 모습을 어떤 방식으로 남기나요?",
    "samples": [
      "함께한 일을 글로 적어 둬요.",
      "사진이나 물건을 소중히 보관해요.",
      "그 사람을 아는 이들과 이야기를 나눠요."
    ],
    "ordinal": null
  }
]$catalog$::jsonb;
begin
  if exists (
    select from pajang_private.personality_question_catalog q
    join jsonb_to_recordset(reviewed) as p(id integer,ordinal integer,category text,prompt text,
      occasion text,edition smallint,turn smallint,samples text[]) using(id)
    where row(q.ordinal,q.category,q.prompt,q.occasion,q.edition,q.turn,q.samples)
      is distinct from row(p.ordinal,p.category,p.prompt,p.occasion,p.edition,p.turn,p.samples)
  ) then raise exception 'Pajang personality catalog changed; review the concurrent edit'; end if;
  insert into pajang_private.personality_question_catalog(id,ordinal,category,prompt,occasion,edition,turn,samples)
  select id,ordinal,category,prompt,occasion,edition,turn,samples
  from jsonb_to_recordset(reviewed) as p(id integer,ordinal integer,category text,prompt text,
    occasion text,edition smallint,turn smallint,samples text[])
  on conflict(id) do nothing;
  if (select count(*) from pajang_private.personality_question_catalog) <> 936 then
    raise exception 'Expected all 936 reviewed Pajang questions';
  end if;
  -- Never relabel a round that already has an answer to a legacy prompt.
  if exists (select from pajang_private.answers a
    where a.day >= date '2026-11-22' and a.question_prompt is not null
      and not exists(select from pajang_private.personality_question_catalog q where q.prompt=a.question_prompt)) then
    raise exception 'A legacy Pajang answer already exists after the cutover; choose the next unanswered window';
  end if;
end;
$seed$;

create or replace function pajang_private.question_for_window(on_day date,in_slot text)
returns jsonb language sql stable strict set search_path='' as $question$
  with position as (
    select 1+2*(on_day-date '2026-11-18')+(in_slot='pm')::int as legacy_number,
      1+2*(on_day-date '2026-11-22')+(in_slot='pm')::int as number,
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
    select q.id,q.prompt,q.samples,1
    from position p join pajang_private.personality_question_catalog q
      on q.ordinal=1+(p.number-1)%732
    where on_day>=date '2026-11-22'
  )
  select jsonb_build_object('id',id,'q',jsonb_build_array(prompt),'answers',samples)
  from choices order by rank limit 1;
$question$;
revoke all on function pajang_private.question_for_window(date,text) from public,anon,authenticated;

-- Check again at the actual INSERT. An old in-flight RPC may have validated its
-- old question before it waited for this migration's table lock.
create or replace function pajang_private.validate_question_insert()
returns trigger language plpgsql set search_path='' as $guard$
declare expected_prompt text;
begin
  if new.day >= date '2026-11-22' then
    expected_prompt := pajang_private.question_for_window(new.day,new.slot) #>> '{q,0}';
    if expected_prompt is null or new.question_prompt is distinct from expected_prompt then
      raise exception '질문이 바뀌었어요. 새 질문을 확인하고 다시 답해 주세요.' using errcode='PT409';
    end if;
  end if;
  return new;
end;
$guard$;
revoke all on function pajang_private.validate_question_insert() from public,anon,authenticated;
drop trigger if exists pajang_question_prompt_guard on pajang_private.answers;
create trigger pajang_question_prompt_guard before insert on pajang_private.answers
for each row execute function pajang_private.validate_question_insert();
commit;
