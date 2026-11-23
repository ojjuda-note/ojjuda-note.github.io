import { makeProfile, getTenGod, interactionPairs } from './fortune-data.mjs?v=20261114-saju-correction1';
import { GOD_CONTEXTS, PAIR_CONTEXTS } from './deeper-reading-data.mjs?v=20261120-saju-voice1';
import { describePersonalPeriod } from './reader-summary.mjs?v=20261120-saju-voice1';
import { buildDaeunSituations } from './daeun-situations.mjs?v=20261120-saju-voice1';
import { readingScoreCopy } from './reading-score.mjs?v=20261120-saju-voice1';
import { detailContent, domainConversation } from './general-detail-scenes.mjs?v=20261120-saju-voice1';
import { readingDetailText } from './reading-detail.mjs?v=20261114-saju-depth1';

// These are shared interpretations of computed relationships, not individual
// predictions assembled from a birth-date hash. Every selected rule keeps its
// own calculated evidence, and the complete calculation remains available.
const ORIGIN = 'service-reference';
const GROUPS = ['peer', 'expression', 'wealth', 'authority', 'resource'];
const TOPICS = [
  { id:'money', label:'재물과 돈 관리', preference:['wealth','expression','peer','authority','resource'],
    action:'돈을 쓰기 전에 새로 필요한 금액과 이미 약속한 지출을 함께 적으세요. 지출 뒤 다음 생활비가 얼마나 남는지 확인하세요.' },
  { id:'work', label:'일과 진로', preference:['expression','authority','resource','wealth','peer'],
    action:'이번에 끝낼 결과 하나와 내가 맡을 범위를 정하세요. 마친 뒤에는 잘된 점과 막힌 점을 적어 다음 작업에 반영하세요.' },
  { id:'relationships', label:'관계와 연애', preference:['peer','resource','expression','authority','wealth'],
    action:'원하는 것을 쉬운 말로 먼저 전하세요. 상대의 생각도 듣고 둘 다 지킬 약속 하나를 정하세요.' },
  { id:'learning', label:'공부와 성장', preference:['resource','expression','authority','peer','wealth'],
    action:'배울 내용을 작은 질문으로 나누고 연습 시간을 정하세요. 끝난 뒤 혼자 해낸 것과 다시 물어볼 것을 구분하세요.' },
];
const FOCUS = {
  companion:'내 기준을 세우고 선택하기', competitor:'각자 할 일과 비용 나누기',
  creator:'작은 결과를 꾸준히 완성하기', critic:'다른 방법을 찾고 표현하기',
  opportunist:'필요한 사람과 준비물 모으기', manager:'가진 것을 관리하고 차근차근 쌓기',
  challenger:'어려운 과제에 집중하고 부담 나누기', officer:'약속과 역할을 분명히 하기',
  explorer:'깊이 알아보고 다른 관점 찾기', scholar:'배우고 직접 연습하기',
};
// The first sentence gives the result for this actual relationship. Examples
// come from the existing shared domain rules rather than fabricated events.
const VOICES = {
  companion:{
    money:{title:'남의 선택보다 내 필요를 먼저 보세요',reading:'돈을 쓸 기준은 내 생활에 필요한지예요. 주변의 선택을 따라가기 전에 실제로 쓸 곳과 감당할 금액을 정하세요.',care:'남과 비교해 고른 물건이라면, 원래 필요했던 것인지 한 번 더 확인하세요.'},
    work:{title:'내가 결정할 범위를 분명히 하세요',reading:'이번 일의 핵심은 스스로 판단하는 힘이에요. 내가 정할 방법과 함께 맞출 기준을 나누어야 주도권을 살려요.',care:'다른 사람에게도 영향을 주는 결정은 먼저 의논하세요.'},
    relationships:{title:'가까워져도 각자의 시간을 지키세요',reading:'가까운 관계에서도 각자의 시간과 선택을 존중해야 해요. 자주 만나는 일만큼 편하게 쉬는 시간도 함께 정하세요.',care:'내가 편한 방식을 상대도 좋아한다고 짐작하지 말고 직접 물어보세요.'},
    learning:{title:'배운 내용을 내 말로 설명하세요',reading:'이해했는지 확인하는 가장 분명한 방법은 내 말로 설명하는 거예요. 자료를 덮고 설명하다 막힌 부분부터 다시 배우세요.',care:'익숙한 답을 외우는 데서 끝내지 말고, 왜 그 답이 나오는지 확인하세요.'},
  },
  competitor:{
    money:{title:'내 돈과 공동 비용을 나누세요',reading:'함께 쓰는 돈은 각자의 몫을 먼저 정해야 해요. 누가 얼마를 내고 남은 돈은 어떻게 나눌지 시작 전에 맞추세요.',care:'분위기에 휩쓸려 감당하기 어려운 비용까지 약속하지 마세요.'},
    work:{title:'협력할수록 맡을 일을 분명히 하세요',reading:'협력의 핵심은 각자 맡을 일과 책임을 정하는 거예요. 서로 잘하는 일을 나누고, 마지막 확인은 누가 할지도 정하세요.',care:'함께 시작했다는 이유만으로 수고까지 공평하게 나뉘지는 않아요. 늘어난 일은 다시 배분하세요.'},
    relationships:{title:'준비하는 수고까지 함께 나누세요',reading:'관계에서는 함께하는 시간만큼 준비하는 수고도 중요해요. 약속이나 집안일을 늘 한 사람이 챙긴다면 맡을 일을 다시 나누세요.',care:'누가 더 많이 했는지 따지기 전에, 서로 맡기로 한 일부터 확인하세요.'},
    learning:{title:'함께 배우고 혼자 풀어 보세요',reading:'함께 배우는 장점은 서로 다른 풀이를 비교하는 데 있어요. 설명할 차례를 번갈아 맡고, 마지막 문제는 각자 풀어 보세요.',care:'다른 사람의 진도에 맞추느라 내 이해를 확인하는 시간을 빼놓지 마세요.'},
  },
  creator:{
    money:{title:'계속 드는 비용까지 준비하세요',reading:'좋아하는 일을 꾸준히 하려면 반복해서 드는 비용부터 챙겨야 해요. 처음 살 도구와 계속 보충할 재료를 나누어 준비하세요.',care:'시작 비용만 보지 말고 매달 필요한 돈과 시간도 함께 적으세요.'},
    work:{title:'작은 결과부터 끝내세요',reading:'이번에 살릴 강점은 생각을 실제 결과로 만드는 힘이에요. 오늘 끝낼 분량을 정하고, 완성한 뒤 다음 작업으로 넘어가세요.',care:'새 계획을 더하기 전에 먼저 시작한 일을 어디까지 끝낼지 정하세요.'},
    relationships:{title:'마음을 작은 행동으로 전하세요',reading:'고마움과 애정은 평소의 말과 행동으로 전하세요. 크게 한 번 표현하기보다 상대가 좋아하는 작은 행동을 꾸준히 이어 가는 게 중요해요.',care:'내가 들인 정성만으로 상대의 만족을 짐작하지 마세요. 어떤 표현이 좋았는지 물어보세요.'},
    learning:{title:'읽은 내용을 직접 써 보세요',reading:'이번 배움은 직접 해 보는 과정에 힘을 실어 주세요. 설명 하나를 읽었다면 짧은 글이나 작은 결과로 만들어 보세요.',care:'결과를 많이 만드는 것보다 틀린 부분을 고치는 시간이 먼저예요.'},
  },
  critic:{
    money:{title:'습관처럼 나가는 돈을 점검하세요',reading:'지금도 필요한 지출인지 확인하는 것이 돈 관리의 출발점이에요. 자주 쓰지 않는 기능과 서비스를 찾아 실제 쓰임을 비교하세요.',care:'새 방법으로 바꾸기 전에는 첫 비용과 계속 드는 비용을 모두 확인하세요.'},
    work:{title:'고칠 점과 바꿀 방법을 함께 말하세요',reading:'불편한 점을 찾아 개선하는 힘이 강점이에요. 문제를 짚은 뒤에는 작은 초안으로 무엇을 바꿀지 보여 주세요.',care:'고칠 행동을 구체적으로 말하세요. 일을 지적하는 말이 사람을 평가하는 말로 번지지 않게 하세요.'},
    relationships:{title:'서운한 일과 바라는 행동을 함께 말하세요',reading:'불편했던 일과 다음에 바라는 행동을 함께 전하는 게 핵심이에요. 쌓아 두었다가 한꺼번에 말하지 말고 한 가지 상황부터 이야기하세요.',care:'내 말이 맞는지뿐 아니라 상대가 대화할 여유가 있는지도 확인하세요.'},
    learning:{title:'답이 달라지는 조건까지 확인하세요',reading:'이번 배움에서는 답의 이유를 따져 보세요. 같은 문제를 다른 방법으로 풀고, 조건 하나를 바꾸었을 때 달라지는 점을 비교하세요.',care:'새 설명을 찾더라도 처음 배운 방법을 언제 쓰는지 함께 정리하세요.'},
  },
  opportunist:{
    money:{title:'새 계획보다 꼭 낼 돈을 먼저 남기세요',reading:'하고 싶은 일이 여럿이라면 지출의 순서를 먼저 정하세요. 한 가지를 고른 뒤에도 꼭 내야 할 생활비가 남는지 확인해야 해요.',care:'좋은 제안이어도 비용과 조건을 확인한 뒤 약속하세요. 서두르라는 말에 순서를 바꾸지 마세요.'},
    work:{title:'필요한 사람과 준비물을 연결하세요',reading:'사람과 도구, 경험을 연결하는 힘을 살리세요. 이미 준비한 것과 도움받을 것을 나누면 누구에게 무엇을 부탁할지 분명해져요.',care:'여러 계획에 같은 시간과 돈을 겹쳐 잡지 않았는지 확인하세요.'},
    relationships:{title:'함께할 계획을 구체적으로 맞추세요',reading:'사람들과 계획을 이어 갈 때는 시간과 비용을 먼저 맞추세요. 즐거운 제안도 각자의 사정에 맞아야 부담 없이 함께해요.',care:'내가 괜찮은 시간과 비용을 상대도 감당한다고 짐작하지 마세요.'},
    learning:{title:'지금 막힌 부분을 풀 자료부터 고르세요',reading:'배울 방법이 많을수록 지금 필요한 질문 하나부터 정하세요. 그 질문에 답을 주는 책이나 수업을 고르고 바로 연습하세요.',care:'여러 수업을 신청하기 전에 배운 내용을 직접 써 볼 시간을 확보하세요.'},
  },
  manager:{
    money:{title:'남은 돈과 앞으로 낼 돈을 구분하세요',reading:'돈 관리의 핵심은 이미 약속한 지출을 빠뜨리지 않는 거예요. 잔액에서 앞으로 낼 돈을 빼고 새 지출을 정하세요.',care:'생활 조건이 바뀌었다면 계획도 고치세요. 처음 정한 금액을 무리하게 고집하지 마세요.'},
    work:{title:'반복하는 일의 순서와 마감을 정하세요',reading:'맡은 일을 빠뜨리지 않고 끝내는 꾸준함이 강점이에요. 자주 하는 일은 순서와 확인 항목을 적어 두세요.',care:'익숙한 순서라도 이번 작업의 양과 마감에 맞는지 확인하세요.'},
    relationships:{title:'작은 약속부터 꾸준히 지키세요',reading:'신뢰를 쌓는 기준은 평소에 지키는 작은 약속이에요. 연락이나 모임 준비를 한 사람만 맡고 있다면 역할을 다시 나누세요.',care:'상대의 사정이 바뀌면 약속도 조정하세요. 지킬 수 있는 방법을 함께 정하는 게 중요해요.'},
    learning:{title:'배울 분량과 복습 날짜를 정하세요',reading:'작은 분량을 반복해서 익히는 꾸준함을 살리세요. 오늘 공부할 내용과 다시 풀어 볼 날짜를 함께 정해 두세요.',care:'계획표를 채웠는지보다 배운 내용을 혼자 설명하는지 확인하세요.'},
  },
  challenger:{
    money:{title:'부담이 큰 약속은 내 한도부터 정하세요',reading:'돈과 책임이 걸린 선택에서는 감당할 범위가 기준이에요. 지금 낼 금액과 나중에 맡을 의무를 나누어 확인하세요.',care:'이해하지 못한 조건은 받아들이지 마세요. 급한 상황일수록 설명을 확인할 시간을 확보하세요.'},
    work:{title:'어려운 일일수록 범위와 도움을 정하세요',reading:'어려운 문제에 집중하는 힘을 살리되 맡을 양을 정해야 해요. 꼭 끝낼 일, 나중에 보완할 일, 도움받을 일을 나누세요.',care:'책임감만으로 일을 더 받지 마세요. 이미 정한 마감과 준비할 시간을 먼저 확인하세요.'},
    relationships:{title:'도움을 주더라도 내 생활을 지키세요',reading:'가까운 사람을 도울 때는 가능한 범위를 분명히 말하세요. 도와주고 싶은 마음과 실제로 해 줄 일은 나누어야 해요.',care:'상대의 요구가 강해도 내 일정과 쉬는 시간을 계속 뒤로 미루지 마세요.'},
    learning:{title:'막힌 단계를 나누고 도움을 구하세요',reading:'어려운 공부는 막힌 단계부터 나누어 풀어야 해요. 전부 다시 시작하지 말고 설명이 필요한 부분을 정확히 질문하세요.',care:'혼자 오래 버티기보다 도움받을 부분과 조정할 기한을 정하세요.'},
  },
  officer:{
    money:{title:'약속한 금액과 날짜를 적어 두세요',reading:'돈에 관한 약속은 누가 언제 무엇을 내는지 분명해야 해요. 들은 설명과 실제 조건을 나란히 적어 확인하세요.',care:'익숙한 상대나 공식 문서라도 뜻을 모르는 조건은 직접 물어보세요.'},
    work:{title:'맡을 역할과 완료 기준을 먼저 확인하세요',reading:'맡은 일을 잘 끝내려면 기대하는 결과부터 알아야 해요. 필요한 형식과 확인 절차를 정한 뒤 작업을 시작하세요.',care:'역할의 이름만 듣고 수락하지 마세요. 실제로 어디까지 맡는지 확인하세요.'},
    relationships:{title:'서로 지킬 약속을 말로 맞추세요',reading:'믿음은 서로 같은 뜻으로 이해한 약속에서 쌓여요. 연락이나 일정에서 무엇을 중요하게 여기는지 구체적으로 말하세요.',care:'기대에 맞추려고 지키기 어려운 약속에 동의하지 마세요. 가능한 범위를 먼저 알리세요.'},
    learning:{title:'요구하는 기준에 맞춰 준비하세요',reading:'시험이나 과제는 무엇을 보여 줘야 하는지부터 확인하세요. 작은 결과를 먼저 만들고 요구한 범위에 맞는지 점검받으세요.',care:'정해진 순서를 따라도 막히는 부분이 있다면 바로 질문하세요.'},
  },
  explorer:{
    money:{title:'낯선 조건은 뜻을 확인한 뒤 고르세요',reading:'처음 보는 지출은 조건을 이해하는 일이 먼저예요. 확인된 내용과 예상하는 내용을 나누고, 모르는 비용부터 물어보세요.',care:'자료를 더 찾기 전에 처음 궁금했던 비용과 조건에 답을 얻었는지 확인하세요.'},
    work:{title:'잘 안 풀리는 이유를 하나씩 확인하세요',reading:'문제의 이유를 깊이 살피는 힘이 강점이에요. 서로 다른 자료에서 공통으로 확인한 내용부터 정리해 작업에 적용하세요.',care:'생각만 이어 가며 중간 결과를 미루지 마세요. 확인한 부분부터 공유하세요.'},
    relationships:{title:'상대의 마음은 짐작보다 질문으로 확인하세요',reading:'짧은 말이나 표정만으로 상대의 마음을 정하지 마세요. 어떤 사정이 있는지 직접 물어야 혼자 한 생각과 실제 마음을 구분해요.',care:'오래 생각한 이유라도 상대에게 확인하기 전에는 짐작이에요.'},
    learning:{title:'설명이 달라지는 이유를 비교하세요',reading:'궁금한 내용을 깊이 파고드는 힘을 살리세요. 서로 다른 설명이 어떤 조건에서 나온 것인지 비교하면 이해가 깊어져요.',care:'자료를 더 모으기 전에 지금까지 알아낸 답과 남은 질문을 한 줄씩 적으세요.'},
  },
  scholar:{
    money:{title:'배운 것을 어디에 쓸지 정하고 지출하세요',reading:'배움에 돈을 쓰기 전에는 끝난 뒤 직접 할 일을 정하세요. 그 일에 필요한 수업을 고르고 연습할 시간까지 마련하세요.',care:'많이 배운다는 소개만 보지 말고 지금 필요한 기초를 다루는지 확인하세요.'},
    work:{title:'기초를 배우고 필요한 도움을 구하세요',reading:'새로운 일은 필요한 기초부터 익히세요. 처음부터 모두 해내려 하지 말고 모르는 부분을 정확히 질문하세요.',care:'설명을 들었다면 작은 부분을 혼자 해 보세요. 들은 내용과 실제로 익힌 것을 구분하는 과정이에요.'},
    relationships:{title:'필요한 도움을 구체적으로 말하세요',reading:'서로 배우고 도움을 주고받는 관계를 살리세요. 무엇을 원하는지 기다리지 말고, 막힌 부분과 필요한 도움을 직접 말하세요.',care:'고맙다는 이유로 모든 조언을 따를 필요는 없어요. 마지막 선택은 직접 하세요.'},
    learning:{title:'설명을 들은 뒤 혼자 적용하세요',reading:'기초는 설명을 듣고 직접 해 보는 과정에서 익혀요. 질문에 답을 얻었다면 비슷한 문제를 자료 없이 풀어 보세요.',care:'도움을 받는 데서 끝내지 말고 혼자 해 볼 작은 연습을 남기세요.'},
  },
};
const PAIR_OPENINGS = {
  'peer-expression':'내 기준을 세우고 다른 사람도 이해하도록 표현하세요. 생각을 정하는 일과 전달하는 일을 함께 챙기는 시기예요.',
  'peer-wealth':'혼자 정할 일과 함께 쓸 시간·돈을 나누세요. 지금 감당할 범위를 확인한 뒤 선택하는 게 핵심이에요.',
  'peer-authority':'내 방식으로 할 일과 함께 지킬 약속을 맞추세요. 바꿀 방법과 꼭 지킬 기준을 구분하는 게 핵심이에요.',
  'peer-resource':'배운 내용을 내 말로 정리하고 직접 활용하세요. 다른 사람의 설명을 내 판단으로 바꾸는 게 핵심이에요.',
  'expression-wealth':'만들고 싶은 결과를 정했다면 필요한 시간·재료·돈도 준비하세요. 시작과 완성을 함께 계획해야 해요.',
  'expression-authority':'새 방법을 제안할 때는 약속과 확인 기준도 함께 맞추세요. 무엇을 바꾸고 어떤 결과를 낼지 구체적으로 정해야 해요.',
  'expression-resource':'배운 것을 작은 결과로 만드세요. 직접 해 보고 막힌 부분에서 다음 공부를 시작하는 게 핵심이에요.',
  'wealth-authority':'일을 맡을 때 비용과 책임의 범위를 함께 확인하세요. 필요한 준비와 내 몫을 알고 약속해야 해요.',
  'wealth-resource':'배울 계획을 세울 때 쓸 시간과 돈도 함께 정하세요. 배운 뒤 직접 무엇을 할지 구체적으로 정하는 게 핵심이에요.',
  'authority-resource':'맡은 일에 필요한 기초와 기준부터 확인하세요. 모르는 부분을 정확히 배우는 데서 준비가 시작돼요.',
};
const INTERACTIONS = {
  money:{
    combination:'함께 쓸 돈은 목적과 각자 낼 몫부터 정하세요. 마음이 통해도 금액과 취소 조건은 따로 확인해야 해요.',
    clash:'돈의 쓰임이나 약속이 바뀌면 지출 순서도 다시 정하세요. 이미 약속한 돈과 새로 필요한 돈을 나란히 놓고 조정할 범위를 확인하세요.',
    ordinary:'돈을 쓸 목적과 필요한 날짜를 함께 정하세요. 지금 결정할 것과 추가 확인 뒤 결정할 것을 나누세요.',
  },
  work:{
    combination:'협력할 때는 서로 잘하는 일을 나누세요. 작은 결과를 먼저 함께 만들고, 각자의 역할과 확인할 부분을 맞추세요.',
    clash:'원하는 방식이 실제 조건과 맞지 않으면 계획을 조정하세요. 마감과 결과의 기준을 먼저 확인한 뒤 바꿀 순서를 정하세요.',
    ordinary:'준비한 내용을 보여 줄 작은 결과 하나를 정하세요. 끝낼 범위와 기준을 구체화한 뒤 새로운 제안을 감당할지 판단하세요.',
  },
  relationships:{
    combination:'관계의 장점을 살리려면 편한 거리와 함께할 시간을 맞추세요. 같은 마음이라고 짐작하지 말고 작은 약속을 지키며 확인하세요.',
    clash:'같은 일을 다르게 받아들였다면 이유부터 물어보세요. 각자 무엇이 중요했는지 확인한 뒤 다음에 바꿀 행동을 정하세요.',
    ordinary:'가까워지고 싶다면 서로 편한 만남과 시간을 먼저 확인하세요. 실제로 고마웠던 행동을 구체적으로 말하며 대화를 시작하세요.',
  },
  learning:{
    combination:'이미 아는 것과 새로 배운 것을 연결해 직접 연습하세요. 다른 사람에게 설명한 뒤 서로 다르게 이해한 부분을 확인하세요.',
    clash:'익숙한 공부법이 목표와 맞지 않으면 한 가지씩 바꾸세요. 잘되던 부분은 남기고 막힌 부분만 짧게 연습해 차이를 확인하세요.',
    ordinary:'배울 기회를 고를 때는 필요한 질문과 연습 방법을 함께 정하세요. 작은 부분부터 해 보고 막힌 곳에 필요한 도움을 구하세요.',
  },
};
const METHOD_NOTICE = '각 10년 구간의 사주 글자를 확정된 출생 사주와 비교한 참고 풀이예요. 같은 관계에는 같은 해석 규칙과 예시를 써요. 예시는 실제로 일어난 일이나 앞으로 생길 사건을 뜻하지 않아요. 이해를 돕기 위해 만든 상황이에요. 구간마다 돈·일·관계·배움과 문서·사람 관계를 나눠 설명해요. 두 관계가 함께 나오면 문서에서는 책임·재물을 먼저 설명해요. 사람 관계에서는 배움·협력을 먼저 설명해요. 이것은 읽기 편하게 정한 설명 순서예요. 관계의 세기나 길흉 점수를 새로 계산한 것은 아니에요. 앞 구간과 달라진 내용도 실제 계산을 비교해 보여 드려요. 성공 여부·재산의 크기·결혼과 이별의 날짜·질병과 사고·수명은 예측하지 않아요. 표시한 날짜는 선택한 전통 계산법으로 정한 구간의 시작과 끝이에요. 그날 사건이 생긴다는 뜻은 아니에요.';

const unique = values => [...new Set(values)];
const pad = value => String(value).padStart(2,'0');
const clone = value => structuredClone(value);
const fail = () => { throw new TypeError('확인된 대운 계산으로 풀이를 다시 준비해 주세요.'); };
const fact = (id,label,value) => ({id,label,value,origin:'calculation'});
const text = value => typeof value === 'string' && value.trim().length > 0;
const stamp = value => typeof value === 'string' && /T\d\d:\d\d:\d\d\+09:00$/.test(value) ? Date.parse(value) : NaN;
const PILLARS = {year:'태어난 해',month:'태어난 달',day:'태어난 날',hour:'태어난 시간'};

function interactionKey(value) {
  return [value.kind,value.position,value.birthPillarKey,value.pairHanja,value.birthCharacter?.hanja,value.otherCharacter?.hanja].join('|');
}
function pairKey(codes) {
  const groups=unique(codes.map(code=>getGroup(code))).sort((a,b)=>GROUPS.indexOf(a)-GROUPS.indexOf(b));
  return groups.length===2 ? groups.join('-') : null;
}
function getGroup(code) {
  const pairs={companion:'peer',competitor:'peer',creator:'expression',critic:'expression',opportunist:'wealth',manager:'wealth',challenger:'authority',officer:'authority',explorer:'resource',scholar:'resource'};
  return pairs[code];
}
function factRegistry(facts) {
  if (!Array.isArray(facts)) fail();
  const ids=new Set();
  for (const item of facts) {
    if (!text(item?.id)||!text(item.label)||!text(item.value)||item.origin!=='calculation'||ids.has(item.id)) fail();
    ids.add(item.id);
  }
  return ids;
}
function validate(chart,daeun,profile) {
  if (!daeun || typeof daeun.available!=='boolean' || !Array.isArray(daeun.periods)
      || !Array.isArray(daeun.sources) || !daeun.method) fail();
  const ids=factRegistry(daeun.facts);
  if (!daeun.available) {
    if (daeun.periods.length||!text(daeun.message)||!text(daeun.reason)||daeun.timeAssumed===true) fail();
    return;
  }
  const timeAssumed=daeun.timeAssumed===true;
  if (timeAssumed && (chart.timeKnown || daeun.assumedBirthTime?.hour!==6 || daeun.assumedBirthTime?.minute!==0
      || daeun.assumedBirthTime?.timezone!=='Asia/Seoul' || !text(daeun.birthTimeNotice))) fail();
  const birth=chart.solar.iso+'T'+pad(timeAssumed?6:chart.input.hour)+':'+pad(timeAssumed?0:chart.input.minute)+':00+09:00';
  if ((!timeAssumed&&(!chart.timeKnown||!profile.complete)) || daeun.birthAt!==birth
      || !['male','female'].includes(daeun.gender) || !['forward','reverse'].includes(daeun.direction)
      || daeun.method.periodYears!==10 || daeun.periods.length!==daeun.method.periodCount
      || !daeun.periods.length || !Number.isFinite(stamp(daeun.startsAt))
      || !['active','before-start','after-listed-periods'].includes(daeun.currentState)) fail();
  let previousEnd=null;
  const current=[];
  for (const [offset,period] of daeun.periods.entries()) {
    if (period.index!==offset+1 || !text(period.hanja) || period.hanja.length!==2
        || period.hanja!==period.stem?.hanja+period.branch?.hanja || !text(period.hangul)
        || !text(period.ageLabel)||!text(period.startLabel)||!text(period.endLabel)
        || !Number.isInteger(period.startAgeYears)||!Number.isInteger(period.endAgeYears)
        || period.startAgeYears<0||period.endAgeYears<period.startAgeYears
        || !Number.isFinite(stamp(period.startsAt))||!Number.isFinite(stamp(period.endsAt))
        || stamp(period.startsAt)>=stamp(period.endsAt)
        || (previousEnd!==null&&period.startsAt!==previousEnd)
        || (!offset&&period.startsAt!==daeun.startsAt)
        || typeof period.isCurrent!=='boolean' || !Array.isArray(period.interactions)
        || !Array.isArray(period.factIds)||!period.factIds.length
        || period.factIds.some(id=>!ids.has(id))) fail();
    const stemGod=getTenGod(profile.dayMaster,period.stem);
    const branchGod=getTenGod(profile.dayMaster,period.branchMainStem);
    if (stemGod.code!==period.stemGod?.code||branchGod.code!==period.branchGod?.code
        || !VOICES[stemGod.code]||!VOICES[branchGod.code]) fail();
    const expected=profile.knownPillars.flatMap(pillar=>interactionPairs(pillar,period,{
      birthPillarKey:pillar.key,birthPillarLabel:pillar.label,
    })).map(interactionKey).sort();
    if (JSON.stringify(expected)!==JSON.stringify(period.interactions.map(interactionKey).sort())) fail();
    previousEnd=period.endsAt;
    if (period.isCurrent) current.push(period.index);
  }
  if (current.length>1 || (current[0]??null)!==daeun.currentIndex
      || (daeun.currentState==='active')!==(current.length===1)) fail();
}
function natalFacts(profile) {
  return [
    fact('daeun.reading.natal.day-master','대운을 비교하는 나의 기준',profile.dayMaster.hangul+'('+profile.dayMaster.hanja+')'),
    ...profile.knownPillars.map(pillar=>fact('daeun.reading.natal.pillar.'+pillar.key,PILLARS[pillar.key]+'의 확정된 글자',pillar.hangul+'('+pillar.hanja+')')),
    ...profile.gods.map(entry=>fact('daeun.reading.natal.god.'+entry.pillarKey+'.'+entry.position,
      PILLARS[entry.pillarKey]+' · '+entry.positionLabel,
      entry.sourceHangul+'('+entry.sourceHanja+') · '+entry.god.name+'('+entry.god.hanja+')')),
  ];
}
function periodFacts(profile,period) {
  const prefix='daeun.reading.period.'+period.index;
  const facts=[
    fact(prefix+'.god.stem','이 구간의 위 글자와 나의 관계',period.stem.hangul+'('+period.stem.hanja+') · '+period.stemGod.name+'('+period.stemGod.hanja+')'),
    fact(prefix+'.god.branch','이 구간의 아래 글자와 나의 관계',period.branch.hangul+'('+period.branch.hanja+') · 본기 '+period.branchMainStem.hangul+'('+period.branchMainStem.hanja+') · '+period.branchGod.name+'('+period.branchGod.hanja+')'),
  ];
  for (const pillar of profile.knownPillars) {
    const matches=period.interactions.filter(value=>value.birthPillarKey===pillar.key);
    facts.push(fact(prefix+'.comparison.'+pillar.key,PILLARS[pillar.key]+'와 이 구간의 비교',
      pillar.hangul+'('+pillar.hanja+') ↔ '+period.hangul+'('+period.hanja+'): '+
      (matches.length ? matches.map(value=>value.label+' '+value.pairHangul+'('+value.pairHanja+')').join(' · ') : '비교한 천간합·지지육합·지지충에 해당하는 짝 없음')));
  }
  period.interactions.forEach((value,index)=>facts.push(fact(prefix+'.interaction.'+index,
    value.label+' · '+PILLARS[value.birthPillarKey],
    value.birthCharacter.hangul+'('+value.birthCharacter.hanja+') ↔ '+value.otherCharacter.hangul+'('+value.otherCharacter.hanja+') · '+value.pairHangul+'('+value.pairHanja+')')));
  return facts;
}
function natalConnection(profile,codes,topic) {
  const connection=describePersonalPeriod(profile,codes,topic.id,'이 10년 동안');
  if(!text(connection?.reading)||!Array.isArray(connection.paragraphs)||connection.paragraphs.length!==4||connection.paragraphs.some(value=>!text(value))
    ||!Array.isArray(connection.natalCodes)||!connection.natalCodes.length
    ||connection.natalCodes.some(code=>!profile.gods.some(entry=>entry.god.code===code)))fail();
  const chosen=profile.gods.filter(entry=>connection.natalCodes.includes(entry.god.code));
  return {reading:connection.reading,paragraphs:[...connection.paragraphs],factIds:chosen.map(entry=>'daeun.reading.natal.god.'+entry.pillarKey+'.'+entry.position),codes:[...connection.natalCodes]};
}
function interactionReading(period,topic) {
  const values=[];
  if (period.interactions.some(value=>value.kind!=='branch-clash')) values.push(INTERACTIONS[topic].combination);
  if (period.interactions.some(value=>value.kind==='branch-clash')) values.push(INTERACTIONS[topic].clash);
  return values.length ? values.join(' ') : INTERACTIONS[topic].ordinary;
}
function situationDetails(item,period) {
  const hasOther=item.godCodes.length>1;
  if(item.paragraphs.length!==(hasOther?7:6))fail();
  const [opening,natal]=item.paragraphs;
  const offset=hasOther?1:0;
  const other=hasOther?item.paragraphs[2]:null;
  const [example,interaction,boundary,action]=item.paragraphs.slice(2+offset);
  const documents=item.id.endsWith('.documents');
  const followUp=documents
    ? period.startAgeYears<18
      ? '가상 대화예요. “준비물은 내가 챙길게. 발표 내용을 바꾸려면 둘 다 확인하고 정하자.”라고 말하세요. 학교나 모임에서도 각자 맡을 일과 함께 정할 일을 나누세요.'
      : '가상 대화예요. “처음 약속은 여기까지예요. 새로 요청한 일은 시간과 비용을 다시 맞추고 싶어요.”라고 말하세요. 바뀐 조건 중 무엇에 동의했는지 서로 확인하세요.'
    : '도움받은 뒤의 가상 대화예요. “설명해 줘서 고마워. 이 부분은 내가 해 보고, 막히는 곳만 다시 물어볼게.”라고 말하세요. 고마움을 전하고 다음에 직접 할 일도 알려 주세요.';
  return {...item,...detailContent([
    [documents?'이 구간의 약속에서 살필 점':'이 구간에 살펴볼 사람과 도움',[opening]],
    ['평소 내 성향과 연결되는 부분',[natal,other]],
    ['생활에 적용한 가상 장면',[example]],
    ['서로 조건을 맞추는 방법',[interaction]],
    ['받아들이기 전에 확인할 부분',[boundary]],
    [documents?'약속을 분명히 하는 대화':'도움을 받은 뒤 이어 갈 일',[followUp]],
    ['지금 해 볼 한 가지',[action]],
  ])};
}
function makePeriod(profile,period,engineFacts,natal,previous=null) {
  const codes=unique([period.stemGod.code,period.branchGod.code]);
  const prefix='daeun.reading.period.'+period.index;
  const derived=periodFacts(profile,period);
  const sharedFactIds=unique([...period.factIds,'daeun.reading.natal.day-master',...derived.map(item=>item.id)]);
  const paired=pairKey(codes);
  const focus=codes.map(code=>FOCUS[code]).join(' · ');
  const subtitle='만 '+period.startAgeYears+'세부터의 핵심은 '+focus+'예요.';
  const paragraphs=[
    paired ? PAIR_OPENINGS[paired] : FOCUS[codes[0]]+'가 이 구간의 핵심이에요. 하고 싶은 일에 필요한 것을 적고, 지금 준비할 것부터 고르세요.',
  ];
  if (paired&&PAIR_CONTEXTS[paired]) paragraphs.push('가상의 상황을 떠올려 볼게요. '+PAIR_CONTEXTS[paired].example);
  else paragraphs.push('하고 싶은 일과 준비할 것을 함께 적으세요. 직접 해 본 뒤 편했던 점과 막힌 점을 남겨 다음 선택에 활용하세요.');
  const previousFacts=previous?periodFacts(profile,previous).filter(item=>item.id.endsWith('.god.stem')||item.id.endsWith('.god.branch')):[];
  const previousIds=previous?unique([...previous.factIds,...previousFacts.map(item=>item.id)]):[];
  if(previous) {
    const before=unique([previous.stemGod.code,previous.branchGod.code]);
    const entering=codes.filter(code=>!before.includes(code)),continuing=codes.filter(code=>before.includes(code));
    const change=entering.length
      ? `앞 구간의 핵심은 ${before.map(code=>FOCUS[code]).join(', ')}였어요. 이번 구간에는 ${entering.map(code=>FOCUS[code]).join(', ')}도 중요해요.`
      : `앞 구간에 이어 ${codes.map(code=>FOCUS[code]).join(', ')}가 계속 핵심이에요. 같은 주제라도 지금 나이와 맡은 일에 맞춰 활용하세요.`;
    paragraphs.push(change+(entering.length&&continuing.length?` ${continuing.map(code=>FOCUS[code]).join(', ')}도 계속 중요해요. 이미 익힌 방법과 새로 준비할 일을 나누세요.`:''));
  }
  const topics=TOPICS.map(topic=>{
    const primary=VOICES[codes[0]][topic.id];
    const secondary=codes[1]?VOICES[codes[1]][topic.id]:null;
    const connection=natalConnection(profile,codes,topic);
    const opening=primary.reading+(secondary?' 함께 챙길 점도 있어요. '+secondary.reading:'');
    const care=primary.care+(secondary&&secondary.care!==primary.care?' '+secondary.care:'');
    const details=detailContent([
      ['평소 내 모습',[connection.paragraphs[0]]],
      ['이번 10년 동안 살펴볼 주제',[opening,connection.paragraphs[1]]],
      ['내 성향을 이 시기에 써 보면',[connection.paragraphs[2]]],
      ['주변과 조건을 맞추는 방법',[interactionReading(period,topic.id)]],
      ['생활 속 가상 장면',['생활 속 가상 예시예요. '+GOD_CONTEXTS[codes[0]][topic.id].example]],
      ['일상에서 해 볼 대화',[domainConversation(codes[0],topic.id)]],
      ['먼저 해 볼 한 가지',[connection.paragraphs[3]]],
      ['부담을 줄이며 이어 가려면',[care+' '+topic.action]],
    ]);
    return {
      id:prefix+'.'+topic.id,label:topic.label,title:primary.title,
      ...details,factIds:unique([...sharedFactIds,...connection.factIds]),
      godCodes:[...codes],natalGodCodes:connection.codes,personalParagraphs:[...connection.paragraphs],origin:ORIGIN,
    };
  });
  const situations=buildDaeunSituations({period,
    natal:profile.gods.map(entry=>({code:entry.god.code,factId:'daeun.reading.natal.god.'+entry.pillarKey+'.'+entry.position})),
    sharedFactIds,
  }).map(item=>situationDetails(item,period));
  const allIds=unique([...sharedFactIds,...previousIds,...topics.flatMap(topic=>topic.factIds),...situations.flatMap(item=>item.factIds)]);
  const engine=engineFacts.filter(item=>allIds.includes(item.id));
  const allFacts=[...engine,...natal.filter(item=>allIds.includes(item.id)),...derived,...previousFacts];
  return {
    id:'reading-daeun-period-'+period.index,index:period.index,title:period.ageLabel,
    subtitle,headline:subtitle,ageLabel:period.ageLabel,periodLabel:period.startLabel+'부터 '+period.endLabel+' 전까지',
    startsAt:period.startsAt,endsAt:period.endsAt,startLabel:period.startLabel,endLabel:period.endLabel,
    startAgeYears:period.startAgeYears,endAgeYears:period.endAgeYears,isCurrent:period.isCurrent,
    hanja:period.hanja,hangul:period.hangul,
    ...detailContent([['이번 구간의 생활 주제',[paragraphs[0]]],['생활에 적용해 보기',[paragraphs[1]]],['앞 구간에서 달라진 점',paragraphs.slice(2)]]),topics,situations,facts:allFacts,
    factIds:allIds,godCodes:codes,origin:ORIGIN,
  };
}

export function buildDaeunReading(chart,daeun) {
  const profile=makeProfile(chart);
  validate(chart,daeun,profile);
  const common={
    id:'reading-daeun',title:'대운 · 나이별 인생의 흐름',availability:daeun.available,available:daeun.available,
    reason:daeun.reason,message:daeun.message,origin:ORIGIN,
    method:clone(daeun.method),sources:clone(daeun.sources),methodNotice:METHOD_NOTICE,
    direction:daeun.direction,directionLabel:daeun.directionLabel,currentIndex:daeun.currentIndex,currentState:daeun.currentState,
    ...(daeun.timeAssumed===true?{timeAssumed:true,assumedBirthTime:clone(daeun.assumedBirthTime),birthTimeNotice:daeun.birthTimeNotice}:{}),
  };
  if (!daeun.available) return {...common,headline:daeun.message,paragraphs:[],periods:[],facts:clone(daeun.facts),factIds:[]};
  const natal=natalFacts(profile);
  const periods=daeun.periods.map((period,index)=>makePeriod(profile,period,daeun.facts,natal,daeun.periods[index-1]));
  const facts=[...clone(daeun.facts),...natal,...daeun.periods.flatMap(period=>periodFacts(profile,period))];
  const registry=factRegistry(facts);
  for (const period of periods) for (const item of [period,...period.topics,...period.situations]) if (item.factIds.some(id=>!registry.has(id))) fail();
  const current=periods.find(period=>period.isCurrent);
  const first=periods[0];
  const headline=daeun.currentState==='after-listed-periods'
    ? '이번에 계산한 이전 기간을 나이별로 살펴보세요.'
    : (current?'지금 살펴볼 시기 · '+current.subtitle:'처음 살펴볼 시기 · '+first.subtitle);
  const paragraphs=daeun.currentState==='after-listed-periods'
    ? ['현재 시점은 이번에 계산한 마지막 구간이 지난 뒤예요. 아래에는 실제로 계산한 기간의 돈·일·관계·배움에 관한 풀이를 남겨 두었어요. 이후 기간을 임의로 이어서 풀이하지는 않아요.']
    : [current ? current.startLabel+'부터 '+current.endLabel+' 전까지가 현재 구간이에요. 아래에서 이 기간의 돈·일·관계·배움과 조심할 점을 하나씩 읽어 보세요.' : '첫 구간은 '+first.startLabel+'에 시작해 '+first.endLabel+' 전까지 이어져요. 평소의 성향을 이 기간의 일과 관계에 어떻게 써 볼지 분야별로 설명했어요.'];
  const selected=daeun.currentState==='after-listed-periods'?null:(current||first);
  const details=detailContent([
    [current?'지금 살펴볼 구간':selected?'처음 시작되는 구간':'계산한 기간의 범위',paragraphs],
    [current?'현재 구간의 생활 주제':'첫 구간에서 살펴볼 생활 주제',selected?[selected.paragraphs[0]]:[]],
    ['생활에 적용해 보는 예',selected?[selected.paragraphs[1]]:[]],
  ]);
  return {...common,headline,...details,periods,facts,factIds:unique(facts.map(item=>item.id)),
    startAge:clone(daeun.startAge),startsAt:daeun.startsAt,startLabel:daeun.startLabel};
}

const summaryCopy = item => [...(Array.isArray(item?.summaryLines) ? ['두 줄 요약',...item.summaryLines] : []),...readingScoreCopy(item)];

export function copyDaeunReading(reading) {
  if (!reading||typeof reading.availability!=='boolean'||!Array.isArray(reading.periods)||!Array.isArray(reading.facts)) fail();
  if (reading.timeAssumed===true&&!text(reading.birthTimeNotice)) fail();
  const lines=[reading.title,...(reading.timeAssumed===true?[reading.birthTimeNotice]:[]),reading.headline,
    ...(reading.availability?summaryCopy(reading):readingScoreCopy(reading)),...readingDetailText(reading)];
  if (!reading.availability) return lines.join('\n');
  for (const period of reading.periods) {
    lines.push('',period.title,period.subtitle,period.periodLabel,...summaryCopy(period),...readingDetailText(period));
    for (const topic of [...period.topics,...(period.situations||[])]) lines.push('',topic.label,topic.title,...summaryCopy(topic),...readingDetailText(topic));
  }
  return lines.filter(value=>typeof value==='string').join('\n');
}
