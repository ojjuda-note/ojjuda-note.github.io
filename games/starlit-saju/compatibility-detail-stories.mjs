// Reading-only explanations. Selection follows each person's already-confirmed
// portrait and the existing pair comparison; none of this changes a score.
import { summaryLinesFrom } from './reading-summary-lines.mjs?v=20261114-saju-depth1';

const unique=values=>[...new Set(values)];
const fail=()=>{throw new Error('두 사람의 자세한 풀이를 준비하지 못했어요. 다시 불러와 주세요.');};

// These are everyday versions of the same ten-god meanings used by the natal
// portrait. A sentence is chosen by that topic's actual selected god code,
// never by a name, gender, random choice or an invented future event.
const VOICES={
  companion:{
    decisions:'다른 사람이 정해 준 답보다 스스로 납득한 선택을 편하게 여겨요.',
    relationships:'가까운 사이에서도 자기 선택과 혼자 쓸 시간을 존중받고 싶어 해요.',
    work:'맡은 일을 어떻게 할지 직접 정할 수 있을 때 책임 있게 움직이는 편이에요.',
    pressure:'상황을 풀 방법을 스스로 정할 수 없으면 답답함을 느끼기 쉬워요.',
    adjustment:'직접 정하고 싶다는 뜻을 전해도, 상대는 도움을 거절하는 말로 받아들일 수 있어요.',
    choose:'함께할 것은 정하되, 내가 고를 수 있는 부분도 남겨 두고 싶어.',
    connect:'어떤 결과를 만들지는 같이 정하고, 내가 맡은 부분은 직접 방법을 골라 볼게.',
    contact:'너와 시간을 보내고 싶어. 오늘 혼자 쉬어야 할 시간도 먼저 말할게.',
    repair:'네 의견을 들었어. 그중 이 부분은 내가 생각해 보고 정하고 싶어.',
    talk:'지금은 바로 답을 정해 주기보다, 내가 고를 수 있는 방법을 같이 살펴줘.',
  },
  competitor:{
    decisions:'좋은 제안인지 살피면서, 각자가 얼마나 시간을 쓰고 수고를 나눌지도 함께 생각해요.',
    relationships:'서로 비슷하게 마음을 쓰고 준비를 나누는 관계에서 편안함을 느껴요.',
    work:'함께 힘을 보태는 데 적극적이고, 서로 맡은 일과 수고를 공평하게 나누고 싶어 해요.',
    pressure:'자기 수고가 당연하게 여겨지거나 같은 사람에게 일이 몰리면 서운함이 쌓이기 쉬워요.',
    adjustment:'서로 맡을 몫을 확인하려다가 작은 손해까지 따지는 사람으로 오해받을 수 있어요.',
    choose:'같이하고 싶어. 준비와 비용을 어떻게 나눌지도 먼저 정해 보자.',
    connect:'이번에 내가 맡을 일과 네가 맡을 일을 적어 보고, 한쪽에 몰리면 다시 나누자.',
    contact:'연락하거나 약속을 준비하는 일을 번갈아 하면 좋겠어. 한 사람만 애쓰지 않았으면 해.',
    repair:'하기 싫어서 묻는 게 아니야. 둘 다 오래 할 수 있게 수고를 나누고 싶어.',
    talk:'일이 많기도 하지만 내 수고를 알아주지 않는 것 같아서 속상했어.',
  },
  creator:{
    decisions:'설명을 계속 듣기보다 작은 범위에서 직접 해 보고 판단하는 편이에요.',
    relationships:'말로 크게 표현하기보다 안부를 묻거나 필요한 것을 챙기는 작은 행동으로 마음을 전해요.',
    work:'직접 만든 것을 여러 번 살피고 다듬으며 완성도를 높이는 편이에요.',
    pressure:'해야 할 일을 계속 손보느라 쉬고 싶다는 말을 뒤로 미루기 쉬워요.',
    adjustment:'말없이 준비를 챙기는 편이라, 들인 수고가 상대에게 당연한 일로 여겨질 수 있어요.',
    choose:'짧게 한 번 해 보고 우리에게 맞으면 계속해 보는 건 어때?',
    connect:'먼저 초안을 하나 만들어 볼게. 함께 확인한 뒤 필요한 부분만 고치자.',
    contact:'마음을 말로 자주 표현하지는 못해도 작은 일들을 챙기고 싶어. 어떤 도움이 편한지 알려 줘.',
    repair:'금방 끝난 것처럼 보이지만 이 부분을 신경 써서 여러 번 고쳤어.',
    talk:'계속 해내고는 있는데 잠깐 쉴 시간이 필요해. 이 일은 대신 맡아 줄 수 있을까?',
  },
  critic:{
    decisions:'이유가 납득되는지 확인하고 불편한 방법은 바꿀 수 있는지 묻는 편이에요.',
    relationships:'잘 지내고 싶은 마음으로 불편한 점이나 더 나은 방법을 솔직하게 말해요.',
    work:'늘 하던 방식에서도 고칠 점을 찾아 구체적인 개선안을 내는 편이에요.',
    pressure:'문제가 보여도 질문하거나 바꿀 수 없으면 말이 날카로워지기 쉬워요.',
    adjustment:'더 잘해 보려고 질문해도, 상대는 자기 수고나 판단을 깎아내리는 말로 들을 수 있어요.',
    choose:'함께하는 건 좋아. 이 방법을 고른 이유를 듣고 싶어. 불편한 부분은 조금 바꿔 보면 어떨까?',
    connect:'어떻게 준비하려는지 알겠어. 이 부분을 이렇게 바꾸면 덜 헷갈릴 것 같아.',
    contact:'네가 챙겨 준 건 고마워. 다음에는 이 부분만 다르게 해 주면 더 편할 것 같아.',
    repair:'반대하려는 뜻은 아니었어. 좋았던 점은 유지하고 이 문제만 고치고 싶어.',
    talk:'내가 계속 질문한 건 이유를 알고 싶어서였어. 불편하게 들린 말은 다시 설명할게.',
  },
  opportunist:{
    decisions:'새로운 사람이나 방법을 떠올리며 선택할 수 있는 길을 넓히는 편이에요.',
    relationships:'같이할 일이나 만날 자리를 먼저 만들면서 가까워지는 편이에요.',
    work:'필요한 사람과 방법을 찾아 기회를 만드는 편이에요. 여러 일을 한꺼번에 벌이지는 않는지 살펴볼 필요가 있어요.',
    pressure:'좋은 제안을 놓치고 싶지 않아 약속을 더하다가 시간과 힘이 부족해지기 쉬워요.',
    adjustment:'관심이 생긴 아이디어를 꺼냈다가, 이미 참여하기로 약속한 것처럼 오해받을 수 있어요.',
    choose:'다른 방법도 떠올랐어. 몇 개만 비교하고 이번에 할 것은 하나로 정하자.',
    connect:'필요한 사람이나 방법은 찾아볼게. 이번에 실제로 맡을 범위는 여기까지야.',
    contact:'같이해 보고 싶은 일이 생기면 먼저 이야기하고 싶어. 바로 약속으로 정하기보다 서로 가능한 시간을 보고 맞추자.',
    repair:'관심은 있지만 확정한 약속은 아니었어. 가능한지 확인해서 다시 답할게.',
    talk:'하고 싶은 것을 너무 많이 더한 것 같아. 지금 약속한 일부터 정리할게.',
  },
  manager:{
    decisions:'실제로 쓸 수 있는 시간과 비용을 확인하고 감당할 수 있는 선택을 찾는 편이에요.',
    relationships:'연락과 약속이 꾸준히 이어지고 서로의 생활을 예상할 수 있을 때 마음을 놓아요.',
    work:'시간과 비용, 필요한 준비를 빠뜨리지 않고 현실적으로 관리하는 편이에요.',
    pressure:'정해 둔 계획이나 한도가 계속 바뀌면 어디에 맞춰 준비해야 할지 몰라 불편해지기 쉬워요.',
    adjustment:'가능한 조건을 확인하려고 질문해도, 상대는 함께할 마음이 없어 반대하는 말로 들을 수 있어요.',
    choose:'나도 함께하고 싶어. 쓸 수 있는 시간과 비용을 확인한 뒤 정하자.',
    connect:'필요한 준비와 걸릴 시간을 적어 볼게. 더할 일이 생기면 무엇을 줄일지도 같이 고르자.',
    contact:'계획이 바뀌는 건 괜찮아. 준비를 바꿀 수 있도록 미리 알려 주면 좋겠어.',
    repair:'하기 싫다는 뜻은 아니야. 이 시간과 비용 안에서 가능한 방법을 찾고 있어.',
    talk:'계획이 계속 바뀌어서 준비하기 어려웠어. 이번에는 먼저 정할 조건을 알려줘.',
  },
  challenger:{
    decisions:'먼저 해결해야 할 문제를 정하고 직접 움직이면서 답을 찾는 편이에요.',
    relationships:'가까운 사람이 어려워하면 해결할 방법을 찾거나 행동으로 돕고 싶어 해요.',
    work:'막힌 일을 맡아 빠르게 움직이는 힘이 있지만 책임을 혼자 떠안지 않도록 살펴야 해요.',
    pressure:'급한 일을 먼저 처리하다가 자신에게 쌓인 부담을 뒤늦게 알아차리기 쉬워요.',
    adjustment:'바로 문제를 해결하려다가 상대의 마음이나 의견을 충분히 듣지 않는다는 오해를 받을 수 있어요.',
    choose:'지금 막힌 일부터 하나 해결해 볼게. 그다음 선택은 네 의견도 듣고 정하자.',
    connect:'급한 부분은 내가 맡을 수 있어. 대신 그 뒤에 이어지는 일은 같이 나누자.',
    contact:'도와주고 싶어서 방법부터 말했어. 지금은 들어 주는 게 더 필요한지 알려줘.',
    repair:'빨리 해결하고 싶었어. 네가 어떤 도움을 원했는지 먼저 물어봤어야 했네.',
    talk:'내가 다 처리하려다 부담이 커졌어. 어디까지 맡을 수 있는지 다시 정하고 싶어.',
  },
  officer:{
    decisions:'이미 정한 약속과 맡은 역할을 확인하고 지킬 수 있는 방법을 고르는 편이에요.',
    relationships:'서로 무엇을 지키기로 했는지 분명하고 약속이 이어질 때 마음을 놓아요.',
    work:'정해진 순서를 챙기며 맡은 일을 책임 있게 마무리하는 편이에요.',
    pressure:'지켜야 할 일이 많거나 약속이 불분명해지면 자신의 책임을 지나치게 넓게 잡기 쉬워요.',
    adjustment:'약속을 확인하려다가 융통성 없이 상대를 관리하는 것처럼 보일 수 있어요.',
    choose:'먼저 정해 둔 약속을 확인하자. 바꿔야 한다면 어느 부분인지 같이 정하고 싶어.',
    connect:'누가 무엇을 언제까지 할지 정리할게. 사정이 달라지면 숨기지 말고 다시 맞추자.',
    contact:'약속을 못 지키는 날도 있을 수 있어. 바뀐 내용과 다음 계획은 알려 주면 좋겠어.',
    repair:'너를 몰아세우려는 뜻은 아니야. 서로 어떤 약속을 한 건지 다시 확인하고 싶어.',
    talk:'내가 책임져야 한다는 생각이 너무 커졌어. 지금 꼭 지킬 일부터 함께 골라줘.',
  },
  explorer:{
    decisions:'익숙한 답도 다른 설명이나 빠진 조건이 있는지 더 살펴보는 편이에요.',
    relationships:'생각을 깊이 나누고 서로의 이유를 이해하는 대화에서 가까움을 느껴요.',
    work:'당연하게 여긴 전제를 다시 살펴 다른 방법이나 놓친 문제를 찾는 편이에요.',
    pressure:'혼자 생각을 오래 정리하다가 상대에게 필요한 답이나 설명을 늦출 수 있어요.',
    adjustment:'생각을 더 정리하려고 기다리지만, 상대에게는 관심이 없거나 결정을 피하는 것처럼 보일 수 있어요.',
    choose:'놓친 조건이 없는지 한 가지만 더 확인하고 싶어. 살펴본 뒤에 내 생각을 말할게.',
    connect:'빠진 조건이 없는지 확인해 볼게. 어디까지 알아보고 언제 답할지는 먼저 정해 두자.',
    contact:'말이 적어도 관심이 없는 것은 아니야. 생각을 정리한 뒤 다시 이야기하고 싶어.',
    repair:'피하려던 게 아니라 생각을 정리하고 있었어. 기다리게 했다면 언제 답할지 먼저 말할게.',
    talk:'혼자 정리할 시간이 필요해. 대화를 끝내려는 건 아니니 다시 이야기할 때를 정하자.',
  },
  scholar:{
    decisions:'설명을 듣고 기본을 충분히 이해한 뒤 시작하는 것을 편하게 여겨요.',
    relationships:'이야기를 끝까지 들어 주고 궁금한 점을 차분히 설명해 줄 때 마음을 열어요.',
    work:'자료를 익히고 정리해 다른 사람도 이해하기 쉽게 전하는 편이에요.',
    pressure:'아직 준비가 부족하다고 느끼면 이미 아는 것까지 믿지 못하고 답을 미룰 수 있어요.',
    adjustment:'확인하려고 조언을 구하다가 스스로 정하지 못하고 상대에게 의지한다는 오해를 받을 수 있어요.',
    choose:'처음이라 어떻게 하는지 조금 더 알고 싶어. 필요한 것만 확인하면 먼저 한 번 해 볼게.',
    connect:'필요한 정보를 정리해 둘게. 준비가 끝나면 내가 실제로 해 볼 일도 하나 맡고 싶어.',
    contact:'내 이야기를 끝까지 들어 주면 마음이 편해져. 내가 원하는 도움도 분명하게 말할게.',
    repair:'네가 대신 결정해 주길 바라는 건 아니야. 설명을 듣고 내 선택을 정하고 싶어.',
    talk:'지금은 내가 뭘 아는지부터 정리하고 싶어. 함께 확인한 뒤 작은 일부터 시작할게.',
  },
};

function pairFor(reading,topic) {
  const cards=reading.people.map(person=>person.cards.find(card=>card.topicId===topic));
  const codes=cards.map(card=>card?.godCodes?.[0]);
  const voices=codes.map(code=>VOICES[code]);
  if(cards.some(card=>!card)||voices.some(voice=>!voice))fail();
  const additionalCodes=cards.map(card=>card.godCodes[1]);
  if(additionalCodes.some(code=>code&&!VOICES[code]))fail();
  return {cards,codes,voices,additionalCodes,same:codes[0]===codes[1],factIds:unique(cards.flatMap(card=>card.factIds))};
}
function describe(pair,topic,intro) {
  const first=pair.voices[0][topic],second=pair.voices[1][topic];
  return pair.same
    ?`${intro} 두 사람 모두 ${first}`
    :`${intro} A는 ${first} B는 ${second}`;
}
function additionalTraits(pair,topic,intro) {
  const [first,second]=pair.additionalCodes;
  if(!first&&!second)return null;
  if(first===second)return `${intro} 두 사람 모두 ${VOICES[first][topic]}`;
  const clauses=[first?`A는 ${VOICES[first][topic]}`:'',second?`B는 ${VOICES[second][topic]}`:''].filter(Boolean);
  return `${intro} ${clauses.join(' ')}`;
}
function dialogue(pair,key,scene) {
  return pair.same
    ?`${scene} 두 사람에게 공통으로 보이는 성향을 말로 옮기면 “${pair.voices[0][key]}”라는 표현이 돼요.`
    :`${scene} A는 “${pair.voices[0][key]}”라고, B는 “${pair.voices[1][key]}”라고 마음을 설명하는 장면이에요.`;
}
function practice(pair,intro,ending) {
  const actions=pair.cards.map(card=>card.summaryLines[1]);
  return intro+(actions[0]===actions[1]
    ?` 두 사람에게 같은 방법을 권해요. ${actions[0]}`
    :` A는 이렇게 해 보세요. ${actions[0]} B는 이렇게 해 보세요. ${actions[1]}`)+' '+ending;
}
function section(title,paragraphs,factIds) {
  const text=paragraphs.filter(paragraph=>paragraph!=null);
  if(!text.length||text.some(paragraph=>typeof paragraph!=='string'||!paragraph.trim()))fail();
  return {title,paragraphs:text,factIds:unique(factIds)};
}
function withSections(item,detailSections) {
  return {...item,paragraphs:detailSections.flatMap(value=>value.paragraphs),detailSections};
}

const DETAIL_CONTEXTS={
  foundation:{topic:'decisions',field:'decisions',line:'choose',title:'두 사람이 함께 결정할 때',
    intro:'함께 결정할 때의 핵심은 각자가 중요하게 보는 조건을 아는 거예요.',
    additional:'결정을 내릴 때 이런 마음도 함께 나타날 수 있어요.',
    scene:'가상 장면으로, 둘이 주말에 할 활동 하나를 고른다고 해 볼게요.',
    practice:'이번에는 고를 수 있는 방법을 두세 가지로 줄이고 각자 꼭 필요한 조건을 먼저 말해 보세요.',
    ending:'둘의 조건을 들은 뒤 이번에 함께할 한 가지를 정하세요. 나머지 선택은 다음 기회로 남겨 두어도 돼요.'},
  zodiac:{topic:'relationships',field:'relationships',line:'contact',title:'띠와 함께 살펴볼 각자의 모습',
    intro:'띠와 함께 두 사람이 평소 사람을 대하는 모습도 살펴보세요.',
    additional:'각자의 관계 풀이에는 이런 모습도 함께 있어요. 띠에 대한 예상만으로 지나치기 쉬운 부분이에요.',
    scene:'가상 장면으로, 만남을 마친 뒤 서로 어떤 표현이 편한지 이야기한다고 해 볼게요.',
    practice:'다음 만남에서는 띠에 대한 예상보다 실제로 편했던 행동 하나를 서로 알려 주세요.',
    ending:'“원래 이런 띠라서 그래”라고 대화를 끝내기보다, 다음에도 이어 갈 행동을 한 가지 고르면 좋아요.'},
  connection:{topic:'work',field:'work',line:'connect',title:'함께 일할 때 살릴 장점',
    intro:'역할을 나눌 때 기준이 되는 것은 각자의 일하는 방식이에요.',
    additional:'준비를 맡길 때는 이런 일하는 모습도 함께 고려해 보세요.',
    scene:'가상 장면으로, 둘이 작은 모임의 준비를 나눈다고 해 볼게요.',
    practice:'준비할 일을 적은 뒤 각자 편하게 맡을 수 있는 것과 도움받고 싶은 것을 한 가지씩 골라 보세요.',
    ending:'한 번 잘했다고 그 역할을 계속 맡겨 두지는 마세요. 일이 끝난 뒤 걸린 시간과 힘들었던 부분을 함께 확인해 다음에는 다시 나눌 수 있어요.'},
  differences:{topic:'adjustment',field:'adjustment',line:'repair',title:'의도와 다르게 들리기 쉬운 말',
    intro:'오해를 줄이는 핵심은 말한 의도와 상대가 받아들인 뜻을 나누어 보는 거예요.',
    additional:'한 가지 말투만으로 상대를 다 설명하기는 어려워요. 이런 모습도 함께 살펴보세요.',
    scene:'가상 장면으로, 둘 사이에 오해가 생겨 자신의 말이나 행동이 어떤 뜻이었는지 설명한다고 해 볼게요.',
    practice:'불편했던 말 한 문장을 고르고, 실제로 전달하려던 뜻을 다시 말해 보세요.',
    ending:'상대가 바꿔 말한 뜻을 들은 뒤에도 필요한 조건이 다르다면, 표현의 오해와 실제로 정할 문제를 나눠 이야기하세요.'},
  everyday:{topic:'relationships',field:'relationships',line:'contact',title:'가까운 사이에서 편한 표현',
    intro:'하루를 함께 보내는 방법에는 각자가 마음을 주고받는 방식도 드러나요.',
    additional:'가까이 지낼 때 편안함을 느끼는 데에는 이런 모습도 함께 작용해요.',
    scene:'가상 장면으로, 바쁜 하루를 보낸 뒤 서로 어떻게 연락하고 챙겨 주면 좋을지 이야기한다고 해 볼게요.',
    practice:'오늘은 연락하기 편한 때와 혼자 쉬고 싶은 때를 각각 말해 보세요.',
    ending:'답장이 늦어질 것 같으면 바로 이야기하기 어렵다는 말과 다시 연락할 수 있는 때를 알려 주세요. 약속을 정한 뒤에도 그날의 사정에 맞춰 바꿀 수 있어요.'},
  conversation:{topic:'pressure',field:'pressure',line:'talk',title:'힘들 때 달라지는 대화',
    intro:'힘든 날 대화의 핵심은 서로의 부담을 먼저 알아주는 거예요. 평소에는 괜찮던 말도 지쳤을 때는 다르게 들릴 수 있으니, 두 사람이 힘들 때 보이는 반응을 함께 살펴보세요.',
    additional:'부담을 느끼는 이유에는 이런 모습도 함께 있을 수 있어요. 같은 날에도 여러 마음이 겹칠 수 있지요.',
    scene:'가상 장면으로, 함께 준비하던 일이 뜻대로 되지 않아 대화가 짧아졌다고 해 볼게요.',
    practice:'서로 지친 날에는 해결책을 늘어놓기 전에 지금 가장 부담스러운 것부터 한 가지씩 말해 보세요.',
    ending:'오늘 끝낼 일과 나중에 다시 이야기할 일을 구분하세요. 대화를 쉬기로 했다면 다시 이야기할 때도 함께 정하면 한쪽이 기다리기만 하는 일을 줄일 수 있어요.'},
};

function detailCard(card,reading) {
  const context=DETAIL_CONTEXTS[card.id];if(!context)fail();
  const pair=pairFor(reading,context.topic),ids=unique([...card.factIds,...pair.factIds]);
  const p=card.paragraphs;
  // Keep every original paragraph, including incomplete-input scope notices,
  // in its original order. The added sections connect the actual two people.
  const split=card.id==='everyday'?1:2;
  const scene=card.id==='zodiac'&&reading.zodiacRelation==='unconfirmed'?p.length:Math.min(split+1,p.length);
  const result=[section('두 사람의 관계를 자세히 보면',p.slice(0,split),card.factIds),
    section(context.title,[describe(pair,context.field,context.intro),additionalTraits(pair,context.field,context.additional)],ids)];
  if(p.slice(split,scene).length)result.push(section('생활에서 나타날 수 있는 장면',p.slice(split,scene),card.factIds));
  result.push(section('이렇게 대화해 보세요',[dialogue(pair,context.line,context.scene)],ids));
  if(p.slice(scene).length)result.push(section('관계를 편하게 만드는 방법',p.slice(scene),card.factIds));
  result.push(section('두 사람이 함께 해볼 일',[practice(pair,context.practice,context.ending)],ids));
  return withSections(card,result);
}

function scoreIntro(item,reading) {
  const day=reading.interactions.filter(match=>match.selfPillarKey==='day'&&match.partnerPillarKey==='day');
  const connects=reading.interactions.some(match=>match.kind!=='branch-clash');
  const clashes=reading.interactions.some(match=>match.kind==='branch-clash');
  if(item.id==='temperament') {
    const group=reading.dayMasterRelation.self.group;
    return group==='peer'
      ?'이 항목에서 주목하는 강점은 판단 방식의 닮은 점이에요. 말이 잘 통하더라도 이번에도 같은 선택을 원할 거라고 짐작하지 말고 각자의 생각을 들어 보세요.'
      :['expression','resource'].includes(group)
        ?'생각과 경험을 서로에게 필요한 도움으로 연결하는 것이 이 조합의 강점이에요. 어떤 도움을 원하는지 먼저 물으면 조언이 지나친 간섭으로 느껴지는 일을 줄이는 데 도움이 돼요.'
        :'이 항목에서 함께 맞출 부분은 일을 정할 때의 기준이에요. 한 사람이 정한 기준을 다른 사람이 따라야 한다고 보기보다, 무엇을 중요하게 보는지 차례로 들으면 함께할 방법을 찾기 쉬워요.';
  }
  if(item.id==='complement')return item.value>50
    ?'서로 잘하는 일을 나눠 힘을 보태는 것이 이 항목에서 살릴 강점이에요. 실제로 도움이 되려면 무엇을 잘하는지뿐 아니라 지금 얼마나 맡을 수 있는지도 알아야 해요. 역할을 나눈 뒤에도 필요한 도움이 달라지면 다시 이야기해 보세요.'
    :'이 비교에서는 추가로 보완되는 점이 두드러지지 않았어요. 그렇다고 실제로 도움을 주고받을 수 없다는 뜻은 아니에요. 비슷하게 잘하는 것은 번갈아 맡고, 둘 다 어려운 일은 함께 배우는 방법을 살펴보세요.';
  if(item.id==='daily')return day.some(match=>match.kind==='branch-clash')
    ?'이 항목에서 함께 맞출 부분은 연락과 휴식의 방식이에요. 연락하는 때나 쉬는 방식이 다를 때는 마음이 멀어졌다고 짐작하기 전에 그날의 일정과 필요한 시간을 묻는 것이 중요해요.'
    :day.some(match=>match.kind==='branch-combination')
      ?'작은 생활 약속을 함께 지키는 것이 이 조합에서 살릴 강점이에요. 익숙해졌다고 한 사람만 준비하도록 두지 말고, 서로 편했던 방법을 계속 확인해 보세요.'
      :item.value===80
        ?'이 일상 호흡 풀이는 닮은 생활 모습을 이해하는 데 초점을 둬요. 비슷하게 반응해도 그날 필요한 휴식이나 연락하고 싶은 때는 다를 수 있으니, 어떤 하루가 편한지 직접 물어보세요.'
        :'이 비교만으로 일상생활에서 잘 맞는 점이나 차이를 뚜렷하게 짚기는 어려워요. 함께 보내는 시간을 맞춰 보며 서로 편한 생활 방식을 알아가세요. 점수만 보고 연락 횟수나 생활 습관까지 정할 필요는 없어요.';
  if(item.id==='harmony')return connects&&clashes
    ?'이 조합의 핵심은 함께 힘을 보탤 점과 다시 맞출 부분을 나누어 보는 거예요. 잘 맞았던 경험은 유지하면서, 불편했던 장면은 별도로 살펴보세요. 한 번의 다툼으로 관계 전체를 평가할 필요는 없어요.'
    :clashes
      ?'이 항목의 핵심은 같은 말을 서로 어떻게 이해했는지 확인하는 거예요. 대화가 엇갈릴 때는 동의하는지부터 묻기보다, 각자가 어떤 상황으로 이해했는지 먼저 확인해 보세요.'
      :connects
        ?'각자 잘하는 일을 정해 함께 힘을 보태는 것이 이 조합의 강점이에요. 이야기가 잘 통하더라도 누가 무엇을 맡을지는 구체적으로 정해 보세요. 한 사람에게 수고가 몰리지 않도록 나누는 거예요.'
        :'이 비교에서는 두 사람의 관계를 뚜렷하게 설명할 만한 조합이 확인되지 않았어요. 서로에게 관심이 없거나 잘 맞지 않는다는 뜻은 아니에요. 함께한 뒤 무엇이 편했고 무엇을 바꾸고 싶은지 구체적으로 이야기해 보세요.';
  fail();
}
const SCORE_CONTEXTS={
  temperament:{topic:'decisions',field:'decisions',line:'choose',title:'각자의 선택 방식과 연결하면',
    intro:'각자의 기본 성향은 결정할 때 무엇부터 살피는지에 드러나요.',
    additional:'각자의 선택 방식에는 다음과 같은 모습도 함께 담겨 있어요.',
    scene:'가상 장면으로, 함께 배울 활동을 고르며 각자 궁금한 것을 묻는다고 해 볼게요.',
    practice:'결정하기 전에 “나는 이 조건이 중요해”라는 말을 각자 한 번씩 해 보세요.',
    ending:'상대의 조건을 들은 뒤에도 선택이 다르면, 이번에 함께 정할 부분과 각자 선택할 부분을 나누세요. 서로의 판단이 존중되는지를 확인하는 연습이에요.'},
  complement:{topic:'work',field:'work',line:'connect',title:'서로의 준비 방식과 연결하면',
    intro:'실제로 도움을 주고받을 방법은 두 사람이 일하는 모습을 살펴볼 때 더 분명해져요.',
    additional:'도움을 나눌 때는 각자에게 함께 보이는 장점과 부담도 살펴보세요.',
    scene:'가상 장면으로, 함께 작은 행사를 준비하면서 각자 맡을 몫을 고른다고 해 볼게요.',
    practice:'이번에 필요한 준비를 적고, 각자가 잘할 수 있는 일과 부담스러운 일을 따로 표시해 보세요.',
    ending:'서로 다른 장점을 쓸 수 있으면 나누어 맡고, 같은 장점을 쓰고 싶으면 번갈아 맡아도 돼요. 상대가 잘한다는 이유로 힘든 일을 계속 맡기지는 마세요.'},
  daily:{topic:'relationships',field:'relationships',line:'contact',title:'마음을 주고받는 모습과 연결하면',
    intro:'일상 호흡을 맞추는 기준은 서로의 일정과 관심을 주고받는 방식이에요.',
    additional:'편한 연락과 만남을 정할 때 이런 관계 모습도 함께 고려하면 좋아요.',
    scene:'가상 장면으로, 하루가 끝난 뒤 어떤 연락과 배려가 편한지 이야기한다고 해 볼게요.',
    practice:'오늘 연락을 주고받으며 편했던 순간과 부담스러웠던 순간이 있었는지 서로 떠올려 보세요.',
    ending:'답이 늦을 때 어떻게 알려 줄지, 만나지 못하는 날에는 무엇이 편한지 작은 약속을 하나 정해 보세요. 지키기 어려웠다면 이유를 듣고 다시 맞추면 돼요.'},
  harmony:{topic:'adjustment',field:'adjustment',line:'repair',title:'오해하기 쉬운 모습과 연결하면',
    intro:'관계의 편안함을 살피려면 좋은 의도가 상대에게 어떻게 전달되는지도 함께 봐야 해요.',
    additional:'말이 다르게 전달되는 데에는 이런 모습도 함께 영향을 줄 수 있어요.',
    scene:'가상 장면으로, 함께할 일을 이야기하다 서로 뜻을 다르게 받아들였다고 해 볼게요.',
    practice:'최근 대화를 예로 든다면 상대의 성격을 평가하는 대신, 불편했던 말과 내가 바라던 반응을 따로 설명해 보세요.',
    ending:'서로의 뜻을 확인한 뒤 다음에 바꿔 말할 한 문장을 정해 보세요. 다시 비슷한 일이 생겼을 때 그 약속이 도움이 되는지를 함께 살피면 돼요.'},
};
function scoreItem(item,reading) {
  const context=SCORE_CONTEXTS[item.id];if(!context)fail();
  const pair=pairFor(reading,context.topic),ids=unique([...item.factIds,...pair.factIds]);
  return withSections({...item,summaryLines:summaryLinesFrom(item.summary)},[
    section('이 항목에서 살펴볼 점',[scoreIntro(item,reading)],item.factIds),
    section(context.title,[describe(pair,context.field,context.intro),additionalTraits(pair,context.field,context.additional)],ids),
    section('생활 속 대화 예시',[dialogue(pair,context.line,context.scene)],ids),
    section('두 사람이 함께 해볼 일',[practice(pair,context.practice,context.ending)],ids),
  ]);
}

/** Attach prose only after the existing comparison, score and people exist. */
export function attachCompatibilityDetails(reading) {
  const registry=new Set(reading.facts.map(fact=>fact.id));
  const cards=reading.cards.map(card=>detailCard(card,reading));
  const score={...reading.score,items:reading.score.items.map(item=>scoreItem(item,reading))};
  for(const item of [...cards,...score.items])for(const part of item.detailSections) {
    if(part.factIds.some(id=>!registry.has(id)))fail();
  }
  return {...reading,cards,score};
}
