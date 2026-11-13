import { makeProfile, getTenGod, interactionPairs } from './fortune-data.mjs?v=20261113-saju-reader1';
import { GOD_CONTEXTS, PAIR_CONTEXTS } from './deeper-reading-data.mjs?v=20261113-saju-easy1';
import { describePersonalPeriod } from './reader-summary.mjs?v=20261113-saju-easy1';
import { buildDaeunSituations } from './daeun-situations.mjs?v=20261113-saju-easy1';
import { readingScoreCopy } from './reading-score.mjs?v=20261114-saju-wind2';

// These are shared interpretations of computed relationships, not individual
// predictions assembled from a birth-date hash. Every selected rule keeps its
// own calculated evidence, and the complete calculation remains available.
const ORIGIN = 'service-reference';
const GROUPS = ['peer', 'expression', 'wealth', 'authority', 'resource'];
const TOPICS = [
  { id:'money', label:'재물과 돈 관리', preference:['wealth','expression','peer','authority','resource'],
    action:'돈을 쓰기 전에 필요한 금액과 이미 약속한 지출을 함께 적어 보세요. 한 번의 결정이 다음 생활에 어떤 부담을 남기는지도 확인하면 좋아요.' },
  { id:'work', label:'일과 진로', preference:['expression','authority','resource','wealth','peer'],
    action:'이번에 끝낼 결과 하나와 내가 맡을 범위를 먼저 정해 보세요. 시작한 뒤에는 잘된 점과 막힌 점을 남겨 다음 선택에 써 보세요.' },
  { id:'relationships', label:'관계와 연애', preference:['peer','resource','expression','authority','wealth'],
    action:'상대가 알아서 맞춰 주길 기다리기보다 원하는 것을 쉬운 말로 전해 보세요. 상대에게도 가능한 방법인지 듣고 둘 다 해 볼 약속 하나를 정하면 좋아요.' },
  { id:'learning', label:'공부와 성장', preference:['resource','expression','authority','peer','wealth'],
    action:'지금 배우려는 것을 작은 질문으로 나누고 직접 해 볼 시간을 정해 보세요. 끝난 뒤 혼자 할 수 있게 된 것과 다시 물어볼 것을 구분하면 다음 연습이 분명해져요.' },
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
    money:{title:'남의 선택보다 내 필요를 먼저 살피세요',reading:'주변의 선택보다 내게 필요한 지출을 먼저 따져 볼 때예요. 주변 사람이 고른 것에 마음이 움직이더라도 내가 실제로 쓸 곳과 감당할 수 있는 금액을 따져 볼 만해요.',care:'남과 비슷하게 갖추려는 마음이 내 생활의 우선순위를 가리지 않는지 살펴보세요.'},
    work:{title:'내가 판단할 수 있는 일을 찾아보세요',reading:'일에서는 스스로 판단할 수 있는 범위를 살펴볼 때예요. 정해진 방법을 따르더라도 왜 그렇게 하는지 설명할 수 있으면 내 강점을 드러낼 곳을 찾기 쉬워요.',care:'내 판단을 지키려다가 다른 사람과 함께 정해야 할 부분까지 혼자 결정하지 않는지 돌아보세요.'},
    relationships:{title:'가까워져도 각자의 선택은 존중해 주세요',reading:'가까운 관계에서도 내 시간과 선택을 지키는 일이 중요해요. 자주 만나는 것만큼 각자 편한 거리와 생활 방식을 알아 가는 데 마음을 써 보세요.',care:'내게 편한 방식이 상대에게도 편할 것이라고 짐작하지 않는 편이 좋아요.'},
    learning:{title:'배운 것을 내 말로 설명해 보세요',reading:'배운 내용을 내 말로 설명하면서 이해를 확인해 볼 때예요. 자료를 덮고 이유를 설명해 보면 아는 부분과 더 배울 부분이 구체적으로 보여요.',care:'익숙한 답이라는 이유만으로 끝까지 이해했다고 여기지 않는지 확인해 보세요.'},
  },
  competitor:{
    money:{title:'내 돈과 함께 쓰는 돈의 경계를 분명히 하세요',reading:'함께 내는 비용과 각자가 맡을 몫을 살피는 게 중요해요. 친한 사이라도 누가 얼마를 내고 남은 돈은 어떻게 나눌지 정해야 부담이 한쪽에 몰리는 일을 줄일 수 있어요.',care:'분위기에 맞추느라 감당하기 어려운 비용을 먼저 약속하지 않는지 살펴보세요.'},
    work:{title:'협력할수록 역할과 기여를 눈에 보이게 하세요',reading:'함께 일할 때 내가 맡을 역할과 다른 사람의 역할을 나눠 볼 때예요. 혼자 해내는 양보다 서로 잘하는 부분을 나누고 결과에 대한 책임을 분명히 하는 데 집중해 볼 만해요.',care:'함께 시작했다는 이유로 수고와 책임도 자연스럽게 공평해질 것이라고 짐작하지 마세요.'},
    relationships:{title:'시간과 수고를 서로 납득할 만큼 나누세요',reading:'가까운 사람과 함께할 일과 각자 맡을 일을 맞추는 게 중요해요. 만나는 약속을 잡거나 집안일을 나눌 때 누가 늘 준비하는지 한 번씩 돌아보면 좋아요.',care:'비교한 결과만 말하기보다 서로 맡기로 한 일이 무엇이었는지 먼저 확인해 보세요.'},
    learning:{title:'함께 배우되 혼자 할 수 있는 시간도 남기세요',reading:'다른 사람의 공부 방법을 보고, 내 방법도 나누며 배워 볼 때예요. 함께 공부할 때도 설명하는 역할을 번갈아 맡으면 듣기만 할 때 놓친 부분을 찾아볼 수 있어요.',care:'다른 사람이 빨리 해내는 모습에 맞추느라 내 이해를 확인할 시간을 놓치지 마세요.'},
  },
  creator:{
    money:{title:'꾸준히 할 활동의 실제 비용부터 챙기세요',reading:'오래 하고 싶은 일에는 재료와 비용도 꾸준히 챙겨야 해요. 좋아하는 활동이나 만들고 싶은 결과가 있다면 한 번 드는 돈과 계속 보충할 돈을 나눠 볼 만해요.',care:'시작할 준비만 보고 반복해서 드는 비용과 시간을 빼놓지 않는지 확인해 보세요.'},
    work:{title:'작은 일부터 끝내며 다음 할 일을 찾으세요',reading:'생각을 작은 결과로 완성하는 힘을 써 볼 때예요. 한꺼번에 일을 늘리기보다 끝낼 수 있는 크기로 나누면 어떤 과정이 내게 잘 맞는지 알아가기 쉬워요.',care:'새로운 계획을 계속 더하느라 먼저 시작한 일을 마칠 기준이 흐려지지 않는지 살펴보세요.'},
    relationships:{title:'마음을 알아볼 수 있는 작은 행동으로 전하세요',reading:'좋아하는 마음이나 고마움을 평소의 말과 행동으로 전하는 게 중요해요. 큰 표현을 한 번 준비하는 것과 함께 평소 어떤 행동이 상대에게 도움이 되는지도 알아볼 만해요.',care:'내가 정성껏 한 일이니 상대도 같은 방식으로 기뻐해야 한다고 기대하지 않는 편이 좋아요.'},
    learning:{title:'읽은 내용을 직접 써 보며 익히세요',reading:'배운 내용을 직접 해 보면서 이해를 쌓아 볼 때예요. 짧은 글을 쓰거나 방법 하나를 직접 따라 해 보면 처음보다 무엇을 더 할 수 있는지 확인할 수 있어요.',care:'결과를 많이 만드는 데만 마음을 써서 틀린 부분을 되짚는 시간을 놓치지 마세요.'},
  },
  critic:{
    money:{title:'습관처럼 쓰던 돈의 쓰임을 다시 보세요',reading:'습관처럼 내던 비용이 지금도 필요한지 돌아볼 때예요. 지금의 필요를 더 편하고 알맞게 채울 방법을 비교해 볼 만해요.',care:'새 방법이 눈에 띈다는 이유만으로 바꾸기 전에 처음 드는 비용과 계속 드는 비용을 함께 확인하세요.'},
    work:{title:'불편한 점과 바꿀 방법을 함께 보여 주세요',reading:'하던 일에서 불편한 부분을 찾아 고칠 방법을 제안해 볼 때예요. 생각을 말로만 전하기보다 작은 초안이나 예시를 보여 주면 다른 사람도 무엇이 달라지는지 이해하기 쉬워요.',care:'고칠 점을 말할 때 사람 전체에 대한 평가가 되지 않도록 구체적인 행동과 조건을 나누어 보세요.'},
    relationships:{title:'서운한 점 뒤에 바라는 행동을 붙여 말하세요',reading:'관계에서 불편했던 일을 짚고 바라는 행동을 이야기해 볼 때예요. 마음에 쌓아 두다가 한꺼번에 말하기보다 어떤 장면이 어려웠고 다음에는 무엇을 바라는지 작게 나누어 볼 만해요.',care:'내 말이 맞는지에만 집중하다가 상대가 들을 여유와 표현의 세기를 놓치지 않는지 살펴보세요.'},
    learning:{title:'답을 얻은 뒤 다른 조건도 시험해 보세요',reading:'배운 설명에 질문을 붙이며 더 알아볼 때예요. 같은 문제를 다른 방법으로 풀거나 조건 하나를 바꾸어 보면 어떤 이유로 답이 달라지는지 자세히 볼 수 있어요.',care:'새로운 설명을 찾는 동안 처음 배운 방법이 언제 쓰이는지도 함께 확인해 보세요.'},
  },
  opportunist:{
    money:{title:'여러 계획 중 고를 때 남겨 둘 돈도 보세요',reading:'돈을 쓰고 싶은 곳이 여럿이라면 먼저 순서를 정해 볼 때예요. 여행, 배움, 작업처럼 하고 싶은 일이 겹친다면 하나를 고른 뒤 다른 계획에 남는 돈도 함께 살펴볼 만해요.',care:'좋은 제안이라는 말만 듣고 확인할 시간 없이 비용부터 약속하지 않는 편이 좋아요.'},
    work:{title:'필요한 사람과 준비물을 함께 찾아보세요',reading:'일에 필요한 사람과 도구, 경험을 한데 모아 볼 때예요. 가능한 선택을 넓혀 본 뒤 이미 가진 것과 도움받을 수 있는 것을 나누면 시작할 첫 단계가 분명해져요.',care:'할 일을 늘릴 때 같은 시간과 돈을 여러 번 쓰기로 약속하지는 않았는지 살펴보세요.'},
    relationships:{title:'함께할 일과 각자 준비할 것을 맞춰 보세요',reading:'제안을 받거나 사람을 만날 때 함께할 계획을 구체적으로 살펴보세요. 즐거운 내용뿐 아니라 각자 쓸 수 있는 시간과 비용을 알면 서로 편하게 참여할 방법을 고르기 쉬워요.',care:'내가 괜찮다고 느끼는 시간과 비용을 상대도 편하게 감당할 것이라고 짐작하지 마세요.'},
    learning:{title:'지금 필요한 답을 줄 자료와 경험을 고르세요',reading:'지금 필요한 답을 찾도록 자료와 연습 방법을 골라 볼 때예요. 책, 수업, 직접 해 보는 활동 가운데 지금 막힌 부분을 풀 방법을 고르면 넓게 모은 자료를 실제 이해로 이어 가기 쉬워요.',care:'배울 것이 많아 보여 여러 수업을 고르기 전에 실제로 연습할 시간도 남아 있는지 확인하세요.'},
  },
  manager:{
    money:{title:'들어온 돈과 이미 쓸 돈을 나누어 챙기세요',reading:'남은 돈과 반복해서 나가는 돈을 함께 관리하는 게 중요해요. 남아 있는 금액만 보기보다 앞으로 낼 돈을 함께 적으면 실제로 쓸 수 있는 범위를 알아보기 쉬워요.',care:'계획을 지키려다가 생활 조건이 달라졌는데도 같은 금액을 무리하게 유지하지 않는지 돌아보세요.'},
    work:{title:'반복할 순서와 마감 기준을 만들어 보세요',reading:'이미 맡은 일을 빠뜨리지 않고 꾸준히 해내는 힘을 살펴볼 때예요. 매번 처음부터 고민하는 부분을 순서와 확인표로 남기면 작은 실수를 줄이고 다음 일에 쓸 시간을 찾기 쉬워요.',care:'익숙하게 해 온 순서가 지금 필요한 양과 마감에도 맞는지 다시 대조해 보세요.'},
    relationships:{title:'작은 약속을 서로 편한 방식으로 이어 가세요',reading:'평소의 작은 약속을 꾸준히 지키는 일이 중요해요. 연락, 집안일, 모임 준비처럼 자주 하는 일을 한 사람만 떠맡고 있지 않은지 서로 이야기해 볼 만해요.',care:'약속을 지키는 데 마음을 쓰더라도 상대의 사정이 달라졌을 때 조정할 여지는 남겨 주세요.'},
    learning:{title:'배울 양과 복습할 때를 현실에 맞게 정하세요',reading:'작은 분량을 여러 번 익히며 이해를 쌓아 볼 때예요. 오늘 읽을 양과 다시 확인할 때를 정해 두면 그날의 의욕에만 기대지 않고 배움을 이어 가기 쉬워요.',care:'계획표의 칸을 채우는 일보다 실제로 기억하고 설명할 수 있는지가 먼저라는 점을 놓치지 마세요.'},
  },
  challenger:{
    money:{title:'부담이 큰 약속은 감당할 범위부터 정하세요',reading:'돈과 책임이 함께 걸린 선택에서는 내가 감당할 양부터 살펴보세요. 급하게 결정해야 할 것처럼 느껴져도 내가 내야 할 금액과 나중에 맡을 의무를 나누어 볼 만해요.',care:'압박을 받는다는 이유로 이해하지 못한 조건까지 한꺼번에 받아들이지 않는 편이 좋아요.'},
    work:{title:'어려운 과제일수록 끝낼 범위와 도움을 정하세요',reading:'어려운 문제에 집중하는 힘을 쓰되, 맡을 양도 함께 정해 볼 때예요. 어려운 일을 맡았다면 꼭 끝낼 부분과 나중에 보완할 부분, 다른 사람에게 도움을 구할 부분을 나누어 볼 만해요.',care:'책임을 다하려는 마음으로 이미 맡은 마감과 준비를 살피지 않은 채 일을 계속 더하지 마세요.'},
    relationships:{title:'관계를 지키려다 부담을 혼자 떠안지 마세요',reading:'가까운 사람을 어디까지 도울 수 있는지 살피는 게 중요해요. 도와주고 싶은 마음과 실제로 해 줄 수 있는 범위를 함께 말하면 무리해서 버티는 일을 줄일 수 있어요.',care:'상대가 강하게 요구한다고 내 사정과 쉬어야 할 시간을 계속 뒤로 미루지 않는 편이 좋아요.'},
    learning:{title:'어려운 부분을 나누고 필요한 도움을 구하세요',reading:'꼭 해내야 할 과제를 골라 하나씩 익혀 볼 때예요. 한 번에 전부 해내려 하기보다 막히는 단계를 따로 연습하면 어떤 설명과 도움이 필요한지 구체적으로 알 수 있어요.',care:'어렵다는 이유로 혼자 오래 버티기만 하기보다 질문하거나 기한을 조정할 부분을 찾아보세요.'},
  },
  officer:{
    money:{title:'약속한 금액과 날짜를 같은 내용으로 확인하세요',reading:'돈과 관련된 약속은 누가 무엇을 책임지는지 분명히 해야 해요. 누가 언제 무엇을 내기로 했는지 적어 두면 처음 들은 설명과 실제 조건이 같은지 차근차근 대조할 수 있어요.',care:'공식적인 문서나 익숙한 상대라는 이유만으로 이해하지 못한 조건을 지나치지 마세요.'},
    work:{title:'맡을 역할과 끝낼 기준을 먼저 확인하세요',reading:'맡은 역할과 완료 기준을 알고 준비하는 게 중요해요. 기대하는 결과와 확인할 절차를 미리 알아 두면 내 준비를 어떤 모습으로 보여 줄지 정하기 쉬워요.',care:'책임의 이름만 알고 실제로 어디까지 해야 하는지는 다르게 이해하고 있지 않은지 확인해 보세요.'},
    relationships:{title:'서로 지킬 약속과 편한 기준을 말로 맞추세요',reading:'서로 믿고 지킬 수 있는 약속을 정하는 게 중요해요. 연락하거나 함께 정한 일을 지킬 때 각자 무엇을 중요하게 느끼는지 알아 두면 기대의 차이를 줄일 수 있어요.',care:'상대의 기대에 맞추느라 내가 지킬 수 없는 약속에도 먼저 동의하지 않는 편이 좋아요.'},
    learning:{title:'필요한 기준을 알고 준비한 결과를 확인하세요',reading:'무엇을 배우고 어떤 결과를 보여야 하는지 확인하며 준비할 때예요. 시험이나 과제를 준비한다면 요구하는 범위를 먼저 보고 작은 결과부터 확인받아 볼 만해요.',care:'다른 사람이 하라는 순서만 따르다가 내가 막힌 부분을 말하지 못하고 있지 않은지 돌아보세요.'},
  },
  explorer:{
    money:{title:'익숙하지 않은 조건은 뜻을 확인한 뒤 고르세요',reading:'낯선 지출이나 조건은 자세히 알아보고 설명도 비교해 볼 때예요. 처음 보는 조건이 있다면 무엇이 확인된 내용이고 무엇은 예상인지 나누면 판단할 질문이 분명해져요.',care:'자료를 오래 모으는 동안 처음 확인하려던 비용과 조건이 흐려지지 않는지 살펴보세요.'},
    work:{title:'쉽게 풀리지 않는 일은 다른 관점으로 살펴보세요',reading:'잘 풀리지 않는 일은 이유를 깊이 살피고 다른 방법도 찾아볼 때예요. 서로 다른 자료에서 공통으로 확인하는 내용과 조건이 다른 부분을 나누면 지금 일에 맞는 방법을 고르기 쉬워요.',care:'생각을 오래 이어 가느라 필요한 질문이나 중간 결과를 보여 줄 때를 계속 미루지 마세요.'},
    relationships:{title:'겉으로 보인 반응 뒤의 사정을 먼저 물어보세요',reading:'상대의 말과 행동을 자세히 보되, 그 이유도 직접 물어볼 때예요. 여러 가능성을 떠올리는 것과 함께 직접 물어 확인하면 혼자 짐작한 마음과 상대가 실제로 말한 마음을 나눌 수 있어요.',care:'확인하지 않은 이유를 오래 생각하다가 상대의 뜻을 이미 안다고 여기지 않는 편이 좋아요.'},
    learning:{title:'궁금한 문제를 깊게 파고 답의 조건도 비교하세요',reading:'궁금한 내용을 깊이 알아보고 다른 설명도 비교해 볼 때예요. 왜 그런지 궁금한 점을 하나씩 조사하면 단편적으로 외웠던 내용을 서로 이어 이해할 수 있어요.',care:'자료를 더 모으기 전에 처음 질문에 어느 정도 답했는지, 다음에 확인할 것이 무엇인지 정리해 보세요.'},
  },
  scholar:{
    money:{title:'배움에 쓸 돈은 활용할 장면과 함께 정하세요',reading:'배우고 준비하는 데 쓸 비용을 살펴볼 때예요. 수업이나 자료를 고를 때 끝난 뒤 직접 해 보고 싶은 일을 정하면 도움받을 곳과 실제로 연습할 시간을 함께 마련하기 쉬워요.',care:'많이 배울 수 있다는 말만 듣고 지금 필요한 기초와 맞는지 확인하지 않은 채 비용을 쓰지 마세요.'},
    work:{title:'기본을 배우고 경험 있는 사람에게 물어보세요',reading:'맡은 일을 해내는 데 필요한 것을 배우고 도움도 받아볼 때예요. 처음부터 모두 잘하려 하기보다 모르는 부분을 정확히 물으면 지금 갖춰야 할 준비가 구체적으로 보여요.',care:'설명을 들었다는 이유만으로 혼자서도 할 수 있다고 여기기 전에 작은 부분을 직접 해 보세요.'},
    relationships:{title:'도움을 고맙게 받되 필요한 것도 구체적으로 말하세요',reading:'다른 사람에게 배우거나 마음을 나눌 도움을 받아볼 때예요. 상대가 해 줄 수 있는 것을 기다리기만 하기보다 어디에서 막혔고 무엇이 필요한지 알려 주면 도움을 주고받기 쉬워요.',care:'고마운 마음 때문에 상대의 조언을 모두 따라야 한다고 느끼지는 않는지 돌아보세요.'},
    learning:{title:'기초를 익히고 배운 내용을 내 힘으로 써 보세요',reading:'설명을 들은 뒤 직접 해 보면서 기본을 익힐 때예요. 모르는 것을 작은 질문으로 바꾸어 물은 뒤 비슷한 일을 혼자 해 보면 이해한 내용이 차곡차곡 쌓일 수 있어요.',care:'도움을 받는 단계에 머무르지 않도록 자료 없이 해 볼 수 있는 작은 연습을 남겨 두세요.'},
  },
};
const PAIR_OPENINGS = {
  'peer-expression':'내 기준을 세우는 일과 그것을 다른 사람이 알아볼 수 있게 표현하는 일이 함께 중요해요.',
  'peer-wealth':'혼자 정할 일과 함께 쓸 시간·돈을 나눠 보세요. 지금 할 수 있는 선택인지 확인해 볼 때예요.',
  'peer-authority':'내 방식으로 해 보고 싶은 부분과 이미 함께 정한 약속을 맞추는 일이 중요해요.',
  'peer-resource':'도움을 받아 배운 내용을 내 기준으로 정리하고 스스로 써 볼 때예요.',
  'expression-wealth':'만들고 싶은 결과와 거기에 필요한 시간·재료·돈을 함께 준비할 때예요.',
  'expression-authority':'새로운 방법을 제안하면서 함께 지킬 약속과 확인 기준도 맞출 때예요.',
  'expression-resource':'배운 것을 작은 결과로 만들고, 해 본 경험에서 다음 배울 것을 찾을 때예요.',
  'wealth-authority':'어떤 일을 맡을 때 필요한 비용과 책임의 범위를 함께 살피는 것이 중요해요.',
  'wealth-resource':'배우는 데 쓸 시간·돈과 배운 내용을 실제로 써 볼 장면을 함께 정할 때예요.',
  'authority-resource':'맡은 역할에 필요한 기초와 기준을 배우면서 준비를 갖출 때예요.',
};
const INTERACTIONS = {
  money:{
    combination:'함께 쓰는 비용을 조율할 때는 목적과 각자 낼 몫을 먼저 맞춰 볼 만해요. 마음이 통하더라도 금액과 취소할 때의 조건은 같은 말로 확인해 주세요.',
    clash:'돈의 쓰임이나 약속을 바꾸게 된다면 조정할 수 있는 범위를 먼저 살펴보세요. 실제 조건이 달라지면 이미 정한 지출과 새로 필요한 돈을 나란히 놓고 우선순위를 다시 정하는 편이 좋아요.',
    ordinary:'기회를 살릴 때는 돈을 쓸 목적과 실제로 필요한 때를 함께 정해 보세요. 지금 할 선택과 조금 더 확인한 뒤 고를 선택을 나누면 준비가 구체적으로 보여요.',
  },
  work:{
    combination:'다른 사람과 잘하는 부분을 보태며 함께 끝낼 일을 찾아볼 만해요. 먼저 작은 결과를 같이 만들어 보면 각자가 맡을 역할과 다시 확인할 부분을 알기 쉬워요.',
    clash:'하고 싶은 방식과 실제 조건이 다를 때는 계획을 조정할 여지가 중요해요. 마감과 결과의 기준을 그대로 지킬 수 있는지 먼저 확인하고 바꿀 순서를 정해 보세요.',
    ordinary:'기회를 살릴 때는 내 준비를 보여 줄 작은 결과 하나를 정해 보세요. 끝낼 범위와 확인할 기준이 구체적이면 새로운 제안도 실제로 해 볼 수 있는지 비교하기 쉬워요.',
  },
  relationships:{
    combination:'서로 편한 거리와 함께할 시간을 맞추며 관계의 장점을 살려 볼 만해요. 같은 마음이라고 짐작하는 데서 그치지 말고 작은 약속으로 확인해 보세요.',
    clash:'같은 일을 다르게 받아들이는 부분은 서둘러 결론을 내리기보다 이유를 하나씩 물어보세요. 내게 중요했던 것과 상대가 놓치고 싶지 않았던 것을 알면 조정할 방법을 찾기 쉬워요.',
    ordinary:'관계를 넓히거나 가까워지고 싶다면 내가 편한 만남과 상대가 바라는 시간을 함께 살펴보세요. 서로에게 실제로 도움이 된 행동을 알아 두면 다음 대화의 시작점이 생겨요.',
  },
  learning:{
    combination:'이미 아는 것과 새로 배운 것을 연결해 직접 해 볼 기회를 찾아보세요. 다른 사람에게 설명하거나 함께 연습하면 서로 다른 이해를 비교할 수 있어요.',
    clash:'익숙한 공부 방법이 지금의 목표와 맞지 않는다면 한 가지씩 바꾸어 볼 만해요. 원래 잘되던 부분과 막힌 부분을 나눈 뒤 작은 연습으로 차이를 확인해 보세요.',
    ordinary:'배울 기회를 고를 때는 지금 알고 싶은 질문과 연습할 방법을 함께 살펴보세요. 어려운 내용은 작은 부분부터 직접 해 보고 필요한 도움을 구하면 좋아요.',
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
    if (daeun.periods.length||!text(daeun.message)||!text(daeun.reason)) fail();
    return;
  }
  const birth=chart.solar.iso+'T'+pad(chart.input.hour)+':'+pad(chart.input.minute)+':00+09:00';
  if (!chart.timeKnown || !profile.complete || daeun.birthAt!==birth
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
function makePeriod(profile,period,engineFacts,natal,previous=null) {
  const codes=unique([period.stemGod.code,period.branchGod.code]);
  const prefix='daeun.reading.period.'+period.index;
  const derived=periodFacts(profile,period);
  const sharedFactIds=unique([...period.factIds,'daeun.reading.natal.day-master',...derived.map(item=>item.id)]);
  const paired=pairKey(codes);
  const focus=codes.map(code=>FOCUS[code]).join(' · ');
  const subtitle='만 '+period.startAgeYears+'세부터는 '+focus+'에 신경 써 볼 만해요.';
  const paragraphs=[
    paired ? PAIR_OPENINGS[paired] : FOCUS[codes[0]]+'를 살펴볼 때예요. 하고 싶은 일에 무엇이 필요한지 적고, 지금 준비할 수 있는 것부터 골라 보세요.',
  ];
  if (paired&&PAIR_CONTEXTS[paired]) paragraphs.push('가상의 상황을 떠올려 볼게요. '+PAIR_CONTEXTS[paired].example);
  else paragraphs.push('작은 선택을 할 때도 하고 싶은 일과 준비할 것을 함께 적어 보세요. 직접 해 본 뒤에는 편했던 점과 막힌 점을 남겨 보세요. 다음에 비슷한 일을 고를 때 내게 맞는 방법을 찾는 데 도움이 돼요.');
  const previousFacts=previous?periodFacts(profile,previous).filter(item=>item.id.endsWith('.god.stem')||item.id.endsWith('.god.branch')):[];
  const previousIds=previous?unique([...previous.factIds,...previousFacts.map(item=>item.id)]):[];
  if(previous) {
    const before=unique([previous.stemGod.code,previous.branchGod.code]);
    const entering=codes.filter(code=>!before.includes(code)),continuing=codes.filter(code=>before.includes(code));
    const change=entering.length
      ? `앞 구간에서 살펴본 일은 ${before.map(code=>FOCUS[code]).join(', ')}였어요. 이번 구간에는 ${entering.map(code=>FOCUS[code]).join(', ')}도 함께 살펴봐요.`
      : `앞 구간에 이어 ${codes.map(code=>FOCUS[code]).join(', ')}를 계속 살펴봐요. 같은 풀이가 이어져도 나이와 맡은 일은 달라질 수 있어요. 지금 생활에서 어디에 적용할지 다시 골라 보세요.`;
    paragraphs.push(change+(entering.length&&continuing.length?` ${continuing.map(code=>FOCUS[code]).join(', ')}도 계속 살펴요. 이미 익힌 방법과 새로 준비할 일을 나눠 보세요.`:''));
  }
  const topics=TOPICS.map(topic=>{
    const primary=VOICES[codes[0]][topic.id];
    const secondary=codes[1]?VOICES[codes[1]][topic.id]:null;
    const connection=natalConnection(profile,codes,topic);
    const opening=primary.reading+(secondary?' 또 하나 살펴볼 점이 있어요. '+secondary.reading:'');
    const care=primary.care+(secondary&&secondary.care!==primary.care?' '+secondary.care:'');
    const paragraphs=[
      connection.paragraphs[0],opening,...connection.paragraphs.slice(1,3),interactionReading(period,topic.id),
      '생활 속 상황을 가정해 볼게요. '+GOD_CONTEXTS[codes[0]][topic.id].example,
      connection.paragraphs[3],
      care+' '+topic.action,
    ];
    return {
      id:prefix+'.'+topic.id,label:topic.label,title:primary.title,
      paragraphs,factIds:unique([...sharedFactIds,...connection.factIds]),
      godCodes:[...codes],natalGodCodes:connection.codes,personalParagraphs:[...connection.paragraphs],origin:ORIGIN,
    };
  });
  const situations=buildDaeunSituations({period,
    natal:profile.gods.map(entry=>({code:entry.god.code,factId:'daeun.reading.natal.god.'+entry.pillarKey+'.'+entry.position})),
    sharedFactIds,
  });
  const allIds=unique([...sharedFactIds,...previousIds,...topics.flatMap(topic=>topic.factIds),...situations.flatMap(item=>item.factIds)]);
  const engine=engineFacts.filter(item=>allIds.includes(item.id));
  const allFacts=[...engine,...natal.filter(item=>allIds.includes(item.id)),...derived,...previousFacts];
  return {
    id:'reading-daeun-period-'+period.index,index:period.index,title:period.ageLabel,
    subtitle,headline:subtitle,ageLabel:period.ageLabel,periodLabel:period.startLabel+'부터 '+period.endLabel+' 전까지',
    startsAt:period.startsAt,endsAt:period.endsAt,startLabel:period.startLabel,endLabel:period.endLabel,
    startAgeYears:period.startAgeYears,endAgeYears:period.endAgeYears,isCurrent:period.isCurrent,
    hanja:period.hanja,hangul:period.hangul,paragraphs,topics,situations,facts:allFacts,
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
  return {...common,headline,paragraphs,periods,facts,factIds:unique(facts.map(item=>item.id)),
    startAge:clone(daeun.startAge),startsAt:daeun.startsAt,startLabel:daeun.startLabel};
}

const summaryCopy = item => [...(Array.isArray(item?.summaryLines) ? ['두 줄 요약',...item.summaryLines] : []),...readingScoreCopy(item)];

export function copyDaeunReading(reading) {
  if (!reading||typeof reading.availability!=='boolean'||!Array.isArray(reading.periods)||!Array.isArray(reading.facts)) fail();
  const lines=[reading.title,reading.headline,...(reading.availability?summaryCopy(reading):readingScoreCopy(reading)),...reading.paragraphs];
  if (!reading.availability) return lines.join('\n');
  for (const period of reading.periods) {
    lines.push('',period.title,period.subtitle,period.periodLabel,...summaryCopy(period),...period.paragraphs);
    for (const topic of [...period.topics,...(period.situations||[])]) lines.push('',topic.label,topic.title,...summaryCopy(topic),...topic.paragraphs);
  }
  return lines.filter(value=>typeof value==='string').join('\n');
}
