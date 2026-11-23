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
    decisions:'스스로 이유를 납득해야 마음 편하게 결정해요.',
    relationships:'가까운 사이에서도 자기 선택과 혼자 쓸 시간을 존중받고 싶어 해요.',
    work:'방법을 직접 정하고 맡은 일을 책임져요.',
    pressure:'자기 의견을 낼 여지가 없을 때 답답해해요.',
    adjustment:'직접 정하겠다는 말이 도움을 거절하는 뜻으로 들리기 쉬워요.',
    choose:'함께할 것은 정하되, 내가 고를 수 있는 부분도 남겨 두고 싶어.',
    connect:'어떤 결과를 만들지는 같이 정하고, 내가 맡은 부분은 직접 방법을 골라 볼게.',
    contact:'너와 시간을 보내고 싶어. 오늘 혼자 쉬어야 할 시간도 먼저 말할게.',
    repair:'네 의견을 들었어. 그중 이 부분은 내가 생각해 보고 정하고 싶어.',
    talk:'지금은 바로 답을 정해 주기보다, 내가 고를 수 있는 방법을 같이 살펴줘.',
  },
  competitor:{
    decisions:'제안의 장점과 함께 각자가 들일 시간과 수고를 따져요.',
    relationships:'서로 비슷하게 마음을 쓰고 준비를 나눌 때 편안해해요.',
    work:'함께하는 일에 적극적이고, 역할과 수고를 공평하게 나누고 싶어 해요.',
    pressure:'수고를 알아주지 않거나 일이 한쪽에 몰릴 때 서운해해요.',
    adjustment:'역할을 나누자는 말이 작은 손해까지 따지는 태도로 들리기 쉬워요.',
    choose:'같이하고 싶어. 준비와 비용을 어떻게 나눌지도 먼저 정해 보자.',
    connect:'이번에 내가 맡을 일과 네가 맡을 일을 적어 보고, 한쪽에 몰리면 다시 나누자.',
    contact:'연락하거나 약속을 준비하는 일을 번갈아 하면 좋겠어. 한 사람만 애쓰지 않았으면 해.',
    repair:'하기 싫어서 묻는 게 아니야. 둘 다 오래 할 수 있게 수고를 나누고 싶어.',
    talk:'일이 많기도 하지만 내 수고를 알아주지 않는 것 같아서 속상했어.',
  },
  creator:{
    decisions:'작게라도 직접 해 보고 판단해요.',
    relationships:'안부를 묻고 필요한 것을 챙기는 행동으로 마음을 전해요.',
    work:'직접 만든 것을 여러 번 다듬으며 완성도를 높여요.',
    pressure:'일을 계속 손보느라 쉬고 싶다는 말을 미뤄요.',
    adjustment:'말없이 챙기다 보면 들인 수고가 상대에게 잘 드러나지 않아요.',
    choose:'짧게 한 번 해 보고 우리에게 맞으면 계속해 보는 건 어때?',
    connect:'먼저 초안을 하나 만들어 볼게. 함께 확인한 뒤 필요한 부분만 고치자.',
    contact:'마음을 말로 자주 표현하지는 못해도 작은 일들을 챙기고 싶어. 어떤 도움이 편한지 알려 줘.',
    repair:'금방 끝난 것처럼 보이지만 이 부분을 신경 써서 여러 번 고쳤어.',
    talk:'계속 해내고는 있는데 잠깐 쉴 시간이 필요해. 이 일은 대신 맡아 줄 수 있을까?',
  },
  critic:{
    decisions:'방법을 고른 이유를 묻고 불편한 점은 고치려 해요.',
    relationships:'잘 지내고 싶어서 불편한 점과 더 나은 방법을 솔직하게 말해요.',
    work:'늘 하던 방식에서도 고칠 점을 찾아 새 방법을 제안해요.',
    pressure:'문제를 알아도 말하거나 고치지 못할 때 예민해져요.',
    adjustment:'방법을 고치자는 말이 상대의 수고를 깎아내리는 뜻으로 들리기 쉬워요.',
    choose:'함께하는 건 좋아. 이 방법을 고른 이유를 듣고 싶어. 불편한 부분은 조금 바꿔 보면 어떨까?',
    connect:'어떻게 준비하려는지 알겠어. 이 부분을 이렇게 바꾸면 덜 헷갈릴 것 같아.',
    contact:'네가 챙겨 준 건 고마워. 다음에는 이 부분만 다르게 해 주면 더 편할 것 같아.',
    repair:'반대하려는 뜻은 아니었어. 좋았던 점은 유지하고 이 문제만 고치고 싶어.',
    talk:'내가 계속 질문한 건 이유를 알고 싶어서였어. 불편하게 들린 말은 다시 설명할게.',
  },
  opportunist:{
    decisions:'새로운 사람과 방법을 찾아 선택지를 넓혀요.',
    relationships:'같이할 일이나 만날 자리를 먼저 만들며 가까워져요.',
    work:'필요한 사람과 방법을 연결하는 데 능해요. 시작할 일은 하나씩 정하는 것이 좋아요.',
    pressure:'좋은 제안을 놓치기 싫어 약속을 늘리다가 지쳐요.',
    adjustment:'관심 있다는 말이 참여를 약속한 뜻으로 들리기 쉬워요.',
    choose:'다른 방법도 떠올랐어. 몇 개만 비교하고 이번에 할 것은 하나로 정하자.',
    connect:'필요한 사람이나 방법은 찾아볼게. 이번에 실제로 맡을 범위는 여기까지야.',
    contact:'같이해 보고 싶은 일이 생기면 먼저 이야기하고 싶어. 바로 약속으로 정하기보다 서로 가능한 시간을 보고 맞추자.',
    repair:'관심은 있지만 확정한 약속은 아니었어. 가능한지 확인해서 다시 답할게.',
    talk:'하고 싶은 것을 너무 많이 더한 것 같아. 지금 약속한 일부터 정리할게.',
  },
  manager:{
    decisions:'쓸 시간과 비용을 확인한 뒤 감당할 일을 골라요.',
    relationships:'연락과 약속이 꾸준하고 일정을 미리 알 때 마음을 놓아요.',
    work:'시간과 비용, 준비물을 빠뜨리지 않고 챙겨요.',
    pressure:'계획이나 예산이 자주 바뀌면 준비하기 어려워해요.',
    adjustment:'시간과 비용을 묻는 말이 함께하기 싫다는 뜻으로 들리기 쉬워요.',
    choose:'나도 함께하고 싶어. 쓸 수 있는 시간과 비용을 확인한 뒤 정하자.',
    connect:'필요한 준비와 걸릴 시간을 적어 볼게. 더할 일이 생기면 무엇을 줄일지도 같이 고르자.',
    contact:'계획이 바뀌는 건 괜찮아. 준비를 바꿀 수 있도록 미리 알려 주면 좋겠어.',
    repair:'하기 싫다는 뜻은 아니야. 이 시간과 비용 안에서 가능한 방법을 찾고 있어.',
    talk:'계획이 계속 바뀌어서 준비하기 어려웠어. 이번에는 먼저 정할 조건을 알려줘.',
  },
  challenger:{
    decisions:'먼저 풀 문제를 정하고 직접 움직여요.',
    relationships:'가까운 사람이 힘들어하면 해결할 방법부터 찾아요.',
    work:'막힌 일을 맡아 빠르게 해결해요. 일이 끝난 뒤의 책임까지 혼자 맡지는 마세요.',
    pressure:'급한 일부터 처리하느라 자기 부담을 뒤늦게 알아차려요.',
    adjustment:'문제부터 해결하려는 행동이 상대의 마음을 듣지 않는 태도로 보이기 쉬워요.',
    choose:'지금 막힌 일부터 하나 해결해 볼게. 그다음 선택은 네 의견도 듣고 정하자.',
    connect:'급한 부분은 내가 맡을 수 있어. 대신 그 뒤에 이어지는 일은 같이 나누자.',
    contact:'도와주고 싶어서 방법부터 말했어. 지금은 들어 주는 게 더 필요한지 알려줘.',
    repair:'빨리 해결하고 싶었어. 네가 어떤 도움을 원했는지 먼저 물어봤어야 했네.',
    talk:'내가 다 처리하려다 부담이 커졌어. 어디까지 맡을 수 있는지 다시 정하고 싶어.',
  },
  officer:{
    decisions:'이미 한 약속과 맡은 역할을 확인하고 지킬 방법을 골라요.',
    relationships:'서로 지킬 약속이 분명하고 꾸준할 때 마음을 놓아요.',
    work:'정해진 순서와 약속을 지키며 일을 마무리해요.',
    pressure:'약속이 불분명해지면 자기 책임을 지나치게 넓게 잡아요.',
    adjustment:'약속을 확인하는 말이 상대를 통제하는 태도로 들리기 쉬워요.',
    choose:'먼저 정해 둔 약속을 확인하자. 바꿔야 한다면 어느 부분인지 같이 정하고 싶어.',
    connect:'누가 무엇을 언제까지 할지 정리할게. 사정이 달라지면 숨기지 말고 다시 맞추자.',
    contact:'약속을 못 지키는 날도 있을 수 있어. 바뀐 내용과 다음 계획은 알려 주면 좋겠어.',
    repair:'너를 몰아세우려는 뜻은 아니야. 서로 어떤 약속을 한 건지 다시 확인하고 싶어.',
    talk:'내가 책임져야 한다는 생각이 너무 커졌어. 지금 꼭 지킬 일부터 함께 골라줘.',
  },
  explorer:{
    decisions:'익숙한 답도 다른 이유나 빠진 조건이 없는지 살펴요.',
    relationships:'생각을 깊이 나누고 서로의 이유를 이해하는 대화에서 가까움을 느껴요.',
    work:'당연하게 여긴 것을 다시 살펴 놓친 문제와 다른 방법을 찾아요.',
    pressure:'혼자 오래 생각하느라 답이나 설명이 늦어져요.',
    adjustment:'생각을 정리하는 동안의 침묵이 관심이 없다는 뜻으로 들리기 쉬워요.',
    choose:'놓친 조건이 없는지 한 가지만 더 확인하고 싶어. 살펴본 뒤에 내 생각을 말할게.',
    connect:'빠진 조건이 없는지 확인해 볼게. 어디까지 알아보고 언제 답할지는 먼저 정해 두자.',
    contact:'말이 적어도 관심이 없는 것은 아니야. 생각을 정리한 뒤 다시 이야기하고 싶어.',
    repair:'피하려던 게 아니라 생각을 정리하고 있었어. 기다리게 했다면 언제 답할지 먼저 말할게.',
    talk:'혼자 정리할 시간이 필요해. 대화를 끝내려는 건 아니니 다시 이야기할 때를 정하자.',
  },
  scholar:{
    decisions:'설명을 듣고 기본을 충분히 이해한 뒤 시작해요.',
    relationships:'이야기를 끝까지 들어 주고 궁금한 점을 차분히 설명해 줄 때 마음을 열어요.',
    work:'자료를 익히고 정리해서 다른 사람에게 쉽게 설명해요.',
    pressure:'준비가 부족하다고 느끼면 아는 것도 다시 확인하며 답을 미뤄요.',
    adjustment:'설명을 구하는 말이 결정을 대신해 달라는 부탁으로 들리기 쉬워요.',
    choose:'처음이라 어떻게 하는지 조금 더 알고 싶어. 필요한 것만 확인하면 먼저 한 번 해 볼게.',
    connect:'필요한 정보를 정리해 둘게. 준비가 끝나면 내가 실제로 해 볼 일도 하나 맡고 싶어.',
    contact:'내 이야기를 끝까지 들어 주면 마음이 편해져. 내가 원하는 도움도 분명하게 말할게.',
    repair:'네가 대신 결정해 주길 바라는 건 아니야. 설명을 듣고 내 선택을 정하고 싶어.',
    talk:'지금은 내가 뭘 아는지부터 정리하고 싶어. 함께 확인한 뒤 작은 일부터 시작할게.',
  },
};

// Each page applies the same confirmed trait to its own situation. Reusing a
// person's two-line advice here made different pages repeat the same task.
const PRACTICES={
  foundation:{
    companion:'이번 활동에서 직접 고르고 싶은 부분을 하나 정하고, 나머지는 어디까지 함께 정할지 말해 보세요.',
    competitor:'활동 자체뿐 아니라 예약과 이동 준비를 누가 맡을지 제안해 보세요.',
    creator:'길게 약속하기 전에 짧게 해 볼 수 있는 방법을 하나 찾아보세요.',
    critic:'고른 방법에서 꼭 바꾸고 싶은 점 하나와 그대로 두어도 되는 점을 나누어 보세요.',
    opportunist:'떠오른 후보를 모두 잡기보다 이번에 실제로 가능한 두세 가지로 좁혀 보세요.',
    manager:'이번에 쓸 수 있는 시간과 비용을 먼저 정하고 후보를 그 안에서 비교해 보세요.',
    challenger:'막힌 문제가 여러 개라면 어떤 것부터 풀어야 선택할 수 있는지 말해 보세요.',
    officer:'이미 정해 둔 일정과 겹치는지 확인하고, 바꿔야 할 약속이 있다면 먼저 알려 주세요.',
    explorer:'결정을 바꿀 만큼 중요한 질문 하나를 고르고, 언제까지 확인할지 말해 보세요.',
    scholar:'처음 참여하는 데 필요한 설명을 먼저 묻고, 이해한 방법을 내 말로 되짚어 보세요.',
  },
  zodiac:{
    companion:'함께 지내면서도 직접 고를 수 있어 편했던 순간을 하나 이야기해 보세요.',
    competitor:'서로 준비를 나누어 부담이 덜했던 경험이 있다면 어떤 점이 좋았는지 알려 주세요.',
    creator:'작은 행동으로 전한 마음이 상대에게 어떻게 느껴졌는지 들어 보세요.',
    critic:'솔직하게 말해도 편했던 대화가 있다면 어떤 말이 도움이 됐는지 짚어 보세요.',
    opportunist:'새로운 만남이나 활동을 제안받았을 때 반가웠던 점을 구체적으로 말해 보세요.',
    manager:'일정을 미리 알았을 때 편했던 점과 꼭 알 필요는 없었던 부분을 나누어 보세요.',
    challenger:'누군가 도와준 경험을 떠올리며, 실제로 반가웠던 도움의 크기를 말해 보세요.',
    officer:'작은 약속을 지켜 주었을 때 믿음이 생겼던 이유를 이야기해 보세요.',
    explorer:'생각을 충분히 나눈 대화에서 어떤 질문이 좋았는지 알려 주세요.',
    scholar:'이야기를 끝까지 들어 주었을 때 도움이 됐던 점을 말해 보세요.',
  },
  connection:{
    companion:'맡을 결과는 함께 정하고, 준비 방법 중 직접 정할 부분을 골라 보세요.',
    competitor:'겉으로 보이는 일과 뒤에서 챙길 일을 함께 적어 역할을 제안해 보세요.',
    creator:'초안을 어디까지 만든 뒤 상대에게 보여 줄지 정해 보세요.',
    critic:'준비 과정에서 줄이고 싶은 불편 하나와 작은 수정안을 함께 제시해 보세요.',
    opportunist:'찾아볼 사람이나 준비물을 정하되, 실제로 맡기로 한 일은 따로 확인해 보세요.',
    manager:'필요한 준비물과 걸릴 시간을 적어, 이미 준비된 것과 남은 것을 구분해 보세요.',
    challenger:'급하게 맡을 부분을 정한 뒤, 그 일을 마치면 누구에게 넘길지도 확인해 보세요.',
    officer:'누가 무엇을 언제까지 마칠지 적고, 완료했다고 볼 기준을 함께 확인하세요.',
    explorer:'먼저 알아볼 조건과 확인을 마칠 때를 정해 준비가 멈추지 않게 해 보세요.',
    scholar:'상대가 바로 쓸 수 있도록 필요한 정보를 짧게 정리해 전달해 보세요.',
  },
  differences:{
    companion:'의견을 거절한 것인지 직접 판단할 시간이 필요한 것인지 나누어 설명해 보세요.',
    competitor:'하고 싶지 않은 것인지 수고를 다시 나누고 싶은 것인지 분명히 말해 보세요.',
    creator:'보이지 않았던 준비와 걸린 시간을 알려, 금방 해낼 수 있는 일이라는 오해를 풀어 보세요.',
    critic:'좋다고 생각한 부분과 고치고 싶은 방법을 나누어 설명해 보세요.',
    opportunist:'아이디어를 나눈 것인지 참여를 약속한 것인지 먼저 분명히 해 주세요.',
    manager:'함께하고 싶은 마음과 아직 확인하지 못한 비용·일정을 나누어 말해 보세요.',
    challenger:'어디까지 돕고 싶었던 것인지 설명하고, 상대가 원했던 도움도 들어 보세요.',
    officer:'상대를 탓하려던 것인지 서로 약속한 내용을 확인하려던 것인지 뜻을 설명해 보세요.',
    explorer:'조용히 생각하고 있었던 내용과 언제 답할 수 있는지를 함께 알려 주세요.',
    scholar:'대신 정해 달라는 부탁인지 설명만 더 필요한 것인지 구분해 주세요.',
  },
  everyday:{
    companion:'오늘 혼자 쉬고 싶은 시간과 함께 이야기할 시간을 나누어 알려 주세요.',
    competitor:'안부를 묻고 만남을 준비하는 일이 한쪽에만 쏠리지 않도록 이번 순서를 정해 보세요.',
    creator:'바쁜 날에도 부담 없이 할 수 있는 짧은 안부를 고르고 상대가 원하는 빈도도 물어보세요.',
    critic:'하루의 불편을 이야기할 때 고마웠던 행동도 함께 말하고 오늘 바꿀 일은 하나만 고르세요.',
    opportunist:'새 약속을 더 잡기 전에 이미 함께하기로 한 시간을 확인해 보세요.',
    manager:'오늘 일정이 바뀌었다면 달라진 시간과 그대로인 약속을 구분해 알려 주세요.',
    challenger:'힘든 이야기를 들었을 때 바로 해결하기보다 지금 필요한 도움부터 물어보세요.',
    officer:'연락할 시간을 못 지키는 날에는 바뀐 사정과 다시 연락할 때를 알려 주세요.',
    explorer:'잠깐 생각을 정리하고 싶다면 대화를 마치는 뜻인지 쉬었다 이어 갈 뜻인지 알려 주세요.',
    scholar:'서로의 하루를 들을 시간을 짧게라도 정하고, 조언이 필요한지도 물어보세요.',
  },
  conversation:{
    companion:'지쳤을 때는 누군가 정해 주길 바라는지, 직접 고를 시간을 원하는지 말해 보세요.',
    competitor:'일의 양 때문에 힘든지 수고를 몰라줘서 서운한지 나누어 이야기해 보세요.',
    creator:'계속 손보던 일 중 오늘 멈춰도 되는 부분을 골라 상대에게 알려 주세요.',
    critic:'날카롭게 들린 말이 있다면 사람에 대한 평가를 빼고 바꾸고 싶었던 행동을 설명해 보세요.',
    opportunist:'새로운 부탁을 더 받기보다 이미 약속한 일 중 무엇부터 마칠지 함께 골라 보세요.',
    manager:'어떤 계획이 달라져 준비하기 어려웠는지 한 가지부터 이야기해 보세요.',
    challenger:'혼자 맡아 부담이 커진 부분을 말하고, 지금 넘길 수 있는 일을 골라 보세요.',
    officer:'지켜야 한다고 생각한 약속을 꺼내 놓고, 실제로 맡은 범위와 같은지 확인해 보세요.',
    explorer:'대화를 잠깐 쉬어야 한다면 다시 이야기할 시간을 정해 기다리는 부담을 줄여 보세요.',
    scholar:'이미 이해해 할 수 있는 부분과 설명이 더 필요한 부분을 나누어 말해 보세요.',
  },
  temperament:{
    companion:'상대가 다른 선택을 해도 내가 꼭 직접 정해야 하는 부분은 무엇인지 확인해 보세요.',
    competitor:'서로 고른 방법에서 준비와 수고가 어떻게 달라지는지 비교해 보세요.',
    creator:'직접 해 본 뒤 바뀐 생각을 말하고 상대도 같은 경험을 원하는지 들어 보세요.',
    critic:'상대가 고른 이유를 먼저 들은 뒤 실제로 바꿀 필요가 있는 부분을 좁혀 보세요.',
    opportunist:'새 후보를 더할 때마다 상대가 중요하게 본 조건도 충족하는지 확인해 보세요.',
    manager:'비용이나 시간이 달라도 받아들일 수 있는 범위를 상대의 조건과 함께 놓아 보세요.',
    challenger:'빨리 해결하는 것과 둘 다 동의하는 것이 다를 때 무엇을 먼저 정할지 이야기해 보세요.',
    officer:'기존 약속과 다른 제안을 받았다면 지킬 부분과 바꿔도 되는 부분을 설명해 보세요.',
    explorer:'답을 더 찾아야 하는 질문과 서로 취향이 달라 남는 선택을 구별해 보세요.',
    scholar:'설명이 더 필요한 것인지 이미 이해했지만 다른 선택을 원하는 것인지 말해 보세요.',
  },
  complement:{
    companion:'내 방식대로 맡은 부분과 상대의 작업이 이어지는 지점에서 도움이 필요한지 확인해 보세요.',
    competitor:'나눈 일의 개수뿐 아니라 실제 걸린 시간과 힘도 비교해 다음 분담에 반영해 보세요.',
    creator:'직접 만들기와 고치기 중 어느 단계에서 상대의 도움을 받고 싶은지 정해 보세요.',
    critic:'제안한 개선을 누가 시험할지 정하고 상대에게 새 부담이 생기는지도 물어보세요.',
    opportunist:'사람이나 자료를 연결한 뒤 실제 작업을 이어 갈 담당자도 함께 정해 보세요.',
    manager:'꼼꼼히 챙기던 준비 중 상대에게 넘겨도 되는 일을 하나 골라 보세요.',
    challenger:'급한 문제를 해결한 뒤에도 계속 떠안은 일이 없는지 역할을 다시 확인해 보세요.',
    officer:'정리한 역할이 실제 일의 양과 맞는지 상대에게 물어보고 필요한 부분만 다시 나누세요.',
    explorer:'알아낸 조건을 상대가 바로 사용할 수 있는 짧은 설명으로 바꾸어 전달해 보세요.',
    scholar:'배워서 준비한 내용을 실제로 써 보고, 상대에게 다시 확인받을 부분을 골라 보세요.',
  },
  daily:{
    companion:'혼자 쉴 시간을 알린 뒤 상대가 언제 다시 연락할지 알 수 있었는지도 물어보세요.',
    competitor:'연락을 번갈아 하는 약속이 편했는지, 횟수를 맞추는 일이 부담되지는 않았는지 들어 보세요.',
    creator:'계속 챙길 수 있는 작은 행동과 쉬어야 할 행동을 나누어 부담이 커지기 전에 알려 주세요.',
    critic:'바꿔 달라고 부탁한 행동이 실제로 편해졌는지와 상대도 지킬 수 있었는지를 함께 살펴보세요.',
    opportunist:'새로 잡은 약속이 기존 생활을 밀어내지는 않았는지 일정의 여유를 확인해 보세요.',
    manager:'예상과 달라진 하루가 있었다면 꼭 미리 알았어야 할 것만 골라 다음 약속에 반영하세요.',
    challenger:'도움을 준 뒤 상대가 편했는지 묻고, 다음에는 혼자 해 보고 싶은 부분도 들어 보세요.',
    officer:'연락 약속을 못 지킨 날의 사정을 듣고 같은 기준을 계속 쓸지 다시 의논해 보세요.',
    explorer:'생각할 시간을 가진 뒤 대화를 이어 갔다면 기다리는 방식은 어땠는지 서로 물어보세요.',
    scholar:'이야기를 나눈 뒤 어떤 설명이 도움이 됐는지, 조언 없이 듣기만 할 때도 필요한지 물어보세요.',
  },
  harmony:{
    companion:'직접 정하겠다는 말이 상대에게 어떻게 들렸는지 듣고, 받아들인 의견도 함께 알려 주세요.',
    competitor:'분담을 묻는 말을 거절로 들었는지 확인하고, 실제로 함께할 의사가 있는지 다시 답해 주세요.',
    creator:'말하지 않았던 수고를 서로 확인한 뒤 다음에는 준비를 어떻게 알릴지 정해 보세요.',
    critic:'고치자는 말에서 상대가 부정당했다고 느낀 부분이 있다면 원래 뜻과 나누어 확인해 보세요.',
    opportunist:'서로 약속으로 받아들인 말이 무엇이었는지 확인하고, 아직 정하지 않은 조건을 남겨 두세요.',
    manager:'확인하려고 한 질문을 상대가 반대로 받아들였다면 함께하고 싶은 마음을 먼저 전한 뒤 남은 조건을 정하세요.',
    challenger:'빠르게 도운 것이 간섭으로 느껴졌다면 다음에는 어느 때 먼저 물어볼지 함께 정해 보세요.',
    officer:'같은 약속을 서로 다르게 이해했다면 상대를 탓하기 전에 두 사람이 기억한 내용을 나란히 놓아 보세요.',
    explorer:'침묵을 거절로 받아들였다면 생각 중임을 알릴 짧은 말과 다시 답할 때를 정해 보세요.',
    scholar:'조언을 구한 뜻과 결정을 맡긴 뜻이 달랐다면 앞으로 누구의 선택인지 먼저 분명히 해 주세요.',
  },
};
const QUESTIONS={
  zodiac:{companion:'함께하면서도 직접 고를 수 있어 편했던 순간이 있었어?',competitor:'준비를 나눌 때 어떤 방식이 가장 공평하게 느껴졌어?',creator:'작은 일을 챙겨 줄 때 어떤 마음을 전하고 싶었어?',critic:'솔직히 이야기해도 편했던 말투가 있었어?',opportunist:'새로운 일을 함께 제안할 때 어떤 점이 반가웠어?',manager:'일정을 미리 알면 어떤 준비가 편해져?',challenger:'힘든 이야기를 들으면 어떤 도움을 먼저 생각해?',officer:'내가 지켜 주었으면 하는 작은 약속은 무엇이야?',explorer:'어떤 이야기를 충분히 나눴을 때 가까워졌다고 느껴?',scholar:'이야기를 들어 줄 때 어떤 반응이 가장 도움이 됐어?'},
  temperament:{companion:'이 선택에서 직접 고르고 싶은 부분은 어디까지야?',competitor:'어떻게 나누면 준비가 한쪽에 몰리지 않을까?',creator:'짧게 해 보면 무엇을 확인할 수 있을까?',critic:'그 방법에서 꼭 바꾸고 싶은 부분이 무엇이야?',opportunist:'후보를 더 찾아야 할까, 지금 있는 것 중 고르면 될까?',manager:'어느 정도의 시간과 비용이면 편하게 참여할 수 있어?',challenger:'어떤 문제부터 풀면 함께 결정할 수 있을까?',officer:'이번 선택과 겹치는 약속 중 무엇을 먼저 맞춰야 해?',explorer:'어떤 조건을 더 알면 판단이 달라질까?',scholar:'어떤 설명까지 들으면 시작해도 괜찮겠어?'},
  complement:{companion:'내 작업과 네 작업을 맞출 때 어디에서 확인이 필요해?',competitor:'나눈 일의 개수보다 실제 부담은 어땠어?',creator:'만들기와 고치기 중 어디에서 도움이 필요해?',critic:'이 방법을 바꾸면 누가 새로 맡을 일이 생겨?',opportunist:'사람이나 자료를 찾은 다음에는 누가 이어서 확인할까?',manager:'계속 챙기던 준비 중 내가 넘겨받을 것은 없을까?',challenger:'급한 일 뒤에 남은 책임까지 계속 맡고 있지는 않아?',officer:'처음 나눈 역할이 실제 일의 양과도 맞아?',explorer:'알아낸 조건 중 지금 준비에 바로 쓸 것은 무엇이야?',scholar:'준비한 내용을 직접 써 보려면 어떤 도움이 필요해?'},
  daily:{companion:'혼자 쉴 시간과 다시 연락할 때를 서로 알 수 있었어?',competitor:'연락을 나누는 약속이 편했어, 횟수를 맞추는 게 부담됐어?',creator:'계속 챙길 수 있는 일과 잠깐 쉬고 싶은 일이 있어?',critic:'바꿔 본 연락 방식이 실제로 더 편했어?',opportunist:'새 약속을 더하고도 원래 생활에 여유가 남았어?',manager:'계획이 달라졌을 때 미리 알았으면 했던 것은 무엇이야?',challenger:'도와주기 전에 어떤 도움이 필요한지 물어볼 수 있었어?',officer:'연락 약속을 못 지킨 날에는 어떻게 바꾸는 게 좋을까?',explorer:'생각할 시간을 기다리는 방법은 서로에게 편했어?',scholar:'오늘 이야기는 설명이 필요했어, 들어 주기만 하면 됐어?'},
  harmony:{companion:'직접 정하겠다는 말을 네 의견이 필요 없다는 뜻으로 들었어?',competitor:'분담을 묻는 말이 함께하기 싫다는 뜻으로 들렸어?',creator:'내가 말하지 않아 몰랐던 준비가 있었어?',critic:'내가 고치자고 한 말에서 어떤 부분이 불편했어?',opportunist:'관심 있다는 말을 이미 참여하겠다는 약속으로 들었어?',manager:'시간과 비용을 묻는 말을 반대로 받아들였어?',challenger:'내가 바로 도운 것이 네 선택을 대신한 것처럼 느껴졌어?',officer:'우리가 같은 약속을 서로 다르게 기억하고 있는 부분이 있어?',explorer:'생각하느라 조용했던 시간을 거절로 받아들였어?',scholar:'설명을 묻는 말을 결정을 대신해 달라는 부탁으로 들었어?'},
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
    ?`${scene} 두 사람 모두 “${pair.voices[0][key]}”라고 말하는 장면이에요.`
    :`${scene} A는 “${pair.voices[0][key]}”라고, B는 “${pair.voices[1][key]}”라고 마음을 설명하는 장면이에요.`;
}
function questionDialogue(pair,key,scene) {
  const questions=pair.codes.map(code=>QUESTIONS[key]?.[code]);
  if(questions.some(value=>!value))fail();
  return pair.same
    ?`${scene} 두 사람 모두 “${questions[0]}”라고 서로 물어보는 장면이에요.`
    :key==='harmony'
      ?`${scene} A는 “${questions[0]}”라고, B는 “${questions[1]}”라고 자신의 말이 어떻게 들렸는지 확인하는 장면이에요.`
      :`${scene} A에게는 “${questions[0]}”라고, B에게는 “${questions[1]}”라고 서로 물어보는 장면이에요.`;
}
function practice(pair,context,key) {
  const actions=pair.codes.map(code=>PRACTICES[key]?.[code]);
  if(actions.some(value=>!value))fail();
  return context.practice+(pair.same
    ?` 두 사람 모두 ${actions[0]}`
    :` A는 ${actions[0]} B는 ${actions[1]}`)+' '+context.ending;
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
    practice:'편한 연락은 횟수뿐 아니라 각자의 하루에 맞는지도 함께 살펴야 해요.',
    ending:'답장이 늦어질 것 같으면 바로 이야기하기 어렵다는 말과 다시 연락할 수 있는 때를 알려 주세요. 약속을 정한 뒤에도 그날의 사정에 맞춰 바꿀 수 있어요.'},
  conversation:{topic:'pressure',field:'pressure',line:'talk',title:'힘들 때 달라지는 대화',
    intro:'힘든 날에는 해결책보다 무엇이 부담인지부터 들어 주세요.',
    additional:'부담이 쌓일 때 이런 반응도 함께 나타나요.',
    scene:'가상 장면으로, 함께 준비하던 일이 뜻대로 되지 않아 대화가 짧아졌다고 해 볼게요.',
    practice:'서로 지친 날에는 가장 부담스러운 일을 하나씩 말하세요.',
    ending:'오늘 끝낼 일과 나중에 이야기할 일을 나누세요. 대화를 쉬기로 했다면 다시 이야기할 시간도 정하세요.'},
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
  if(p.slice(split,scene).length)result.push(section('생활 속 가상 예시',p.slice(split,scene),card.factIds));
  result.push(section('이렇게 대화해 보세요',[card.id==='zodiac'?questionDialogue(pair,card.id,context.scene):dialogue(pair,context.line,context.scene)],ids));
  if(p.slice(scene).length)result.push(section('관계를 편하게 만드는 방법',p.slice(scene),card.factIds));
  result.push(section('두 사람이 함께 해볼 일',[practice(pair,context,card.id)],ids));
  return withSections(card,result);
}

function scoreIntro(item,reading) {
  const day=reading.interactions.filter(match=>match.selfPillarKey==='day'&&match.partnerPillarKey==='day');
  const connects=reading.interactions.some(match=>match.kind!=='branch-clash');
  const clashes=reading.interactions.some(match=>match.kind==='branch-clash');
  if(item.id==='temperament') {
    const group=reading.dayMasterRelation.self.group;
    return group==='peer'
      ?'판단하는 방식이 닮은 조합이에요. 서로의 이유를 이해하기 쉽다는 것이 장점이에요. 이번에도 같은 선택을 원하는지는 직접 물어보세요.'
      :['expression','resource'].includes(group)
        ?'생각과 경험을 나누며 서로 돕는 조합이에요. 아는 것을 알려 주고 함께 해결할 방법을 찾는 힘이 있어요. 조언하기 전에는 지금 어떤 도움이 필요한지 물어보세요.'
        :'함께 결정할 때 중요하게 보는 기준이 다른 조합이에요. 한 사람의 기준으로만 고르면 다른 사람에게 부담이 돼요. 각자 꼭 지키고 싶은 조건을 하나씩 말하세요.';
  }
  if(item.id==='complement')return item.value>50
    ?'서로 다른 강점을 보태는 조합이에요. 잘하는 일을 나누되 지금 감당할 여유도 함께 확인하세요. 한 사람이 잘한다는 이유로 계속 맡겨 두지는 마세요.'
    :'이번 비교에서는 뚜렷한 보완점이 없어요. 실제로 도움을 주고받는 방법은 함께하는 경험에서 찾아야 해요. 비슷하게 잘하는 일은 번갈아 맡고, 둘 다 어려운 일은 함께 배우세요.';
  if(item.id==='daily')return day.some(match=>match.kind==='branch-clash')
    ?'연락하는 때와 쉬는 방식의 차이를 맞춰야 하는 조합이에요. 답장이 늦은 이유를 마음이 멀어졌기 때문이라고 단정하지 마세요. 그날의 일정과 혼자 쉬고 싶은 시간을 물어보세요.'
    :day.some(match=>match.kind==='branch-combination')
      ?'작은 생활 약속을 함께 지키는 것이 강점이에요. 연락할 시간과 함께할 일을 분명히 정하세요. 만남을 준비하는 수고도 번갈아 맡는 것이 좋아요.'
      :item.value===80
        ?'생활 방식의 닮은 점을 살리는 조합이에요. 비슷한 반응이 익숙하게 느껴져도 그날 필요한 휴식은 각자 달라요. 언제 연락하고 언제 혼자 쉬고 싶은지 알려 주세요.'
        :'이 비교에는 일상 호흡을 가를 뚜렷한 단서가 없어요. 연락 횟수나 생활 습관은 실제로 함께 지내며 정하세요. 서로 편했던 시간과 부담스러웠던 시간을 이야기하는 것부터 시작하세요.';
  if(item.id==='harmony')return connects&&clashes
    ?'잘 맞는 점과 조율할 차이가 함께 있는 조합이에요. 편했던 방법은 이어 가고, 불편했던 일은 따로 이야기하세요. 한 번의 다툼으로 관계 전체를 판단하지 마세요.'
    :clashes
      ?'같은 말을 서로 다르게 이해하기 쉬운 조합이에요. 대화가 엇갈리면 내가 뜻한 것과 상대가 들은 뜻부터 확인하세요. 뜻을 맞춘 뒤 각자 원하는 것을 말하세요.'
      :connects
        ?'함께 준비하고 힘을 보태는 것이 강점이에요. 이야기가 잘 통할 때도 누가 무엇을 맡을지는 분명히 정하세요. 준비하는 수고가 한쪽에 몰리지 않게 나누세요.'
        :'이 비교에는 관계 조화를 가를 뚜렷한 단서가 없어요. 두 사람의 실제 대화와 행동을 기준으로 맞춰 가세요. 함께한 뒤 편했던 점과 바꾸고 싶은 점을 하나씩 말하세요.';
  fail();
}
const SCORE_CONTEXTS={
  temperament:{topic:'decisions',field:'decisions',line:'choose',title:'각자가 결정하는 방식',
    intro:'결정할 때 먼저 확인하는 것을 보면 차이가 분명해져요.',
    additional:'결정할 때 이런 모습도 함께 나타나요.',
    scene:'가상 장면으로, 함께 배울 활동을 고르며 각자 궁금한 것을 묻는다고 해 볼게요.',
    practice:'결정하기 전에 “나는 이 조건이 중요해”라고 각자 말하세요.',
    ending:'조건을 들은 뒤에도 선택이 다르면, 함께 정할 일과 각자 고를 일을 나누세요.'},
  complement:{topic:'work',field:'work',line:'connect',title:'일을 준비하는 방식',
    intro:'역할을 나눌 때는 각자의 일하는 방식을 먼저 확인하세요.',
    additional:'함께 준비할 때 이런 모습도 나타나요.',
    scene:'가상 장면으로, 함께 작은 행사를 준비하면서 각자 맡을 몫을 고른다고 해 볼게요.',
    practice:'필요한 준비를 적고, 잘하는 일과 부담스러운 일을 따로 표시하세요.',
    ending:'한 번 나눈 역할도 부담이 달라지면 다시 조정하세요.'},
  daily:{topic:'relationships',field:'relationships',line:'contact',title:'마음을 주고받는 방식',
    intro:'연락과 만남은 서로의 일정에 맞아야 편안해요.',
    additional:'가까이 지낼 때 이런 모습도 나타나요.',
    scene:'가상 장면으로, 하루가 끝난 뒤 어떤 연락과 배려가 편한지 이야기한다고 해 볼게요.',
    practice:'약속을 지켜 본 뒤에는 계속할 행동과 바꿀 행동을 나누세요.',
    ending:'답이 늦어질 때 알릴 방법을 하나 정하세요. 지키기 어려웠다면 이유를 듣고 시간을 다시 맞추세요.'},
  harmony:{topic:'adjustment',field:'adjustment',line:'repair',title:'오해가 생기기 쉬운 말',
    intro:'좋은 뜻으로 한 말도 상대에게 어떻게 들렸는지 확인해야 해요.',
    additional:'이런 말과 행동도 오해하기 쉬워요.',
    scene:'가상 장면으로, 함께할 일을 이야기하다 서로 뜻을 다르게 받아들였다고 해 볼게요.',
    practice:'최근 대화에서 불편했던 말과 내가 바라던 반응을 따로 설명하세요.',
    ending:'서로 뜻을 확인한 뒤, 다음에 바꿔 말할 문장을 하나 정하세요.'},
};
function scoreItem(item,reading) {
  const context=SCORE_CONTEXTS[item.id];if(!context)fail();
  const pair=pairFor(reading,context.topic),ids=unique([...item.factIds,...pair.factIds]);
  return withSections({...item,summaryLines:summaryLinesFrom(item.summary)},[
    section('핵심부터 읽어요',[scoreIntro(item,reading)],item.factIds),
    section(context.title,[describe(pair,context.field,context.intro),additionalTraits(pair,context.field,context.additional)],ids),
    section('생활 속 대화 예시',[questionDialogue(pair,item.id,context.scene)],ids),
    section('두 사람이 함께 해볼 일',[practice(pair,context,item.id)],ids),
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
