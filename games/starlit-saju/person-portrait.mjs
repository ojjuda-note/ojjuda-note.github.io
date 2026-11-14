import { getTenGod } from './fortune-data.mjs?v=20261114-saju-depth1';
import { detailContent, portraitConversation } from './general-detail-scenes.mjs?v=20261114-saju-depth1';

// A plain-language portrait assembled from confirmed natal facts. The component
// meanings and the everyday examples are authored reference material. They are
// not a personality test, a strength calculation or a record of the user's life.
const ORIGIN='service-reference';
const ORDER=['month.stem','day.branch','month.branch','year.stem','year.branch','hour.stem','hour.branch'];
const GROUP_ORDER=['peer','expression','wealth','authority','resource'];
const unique=items=>[...new Set(items)];
const factId=entry=>'natal.god.'+entry.pillarKey+'.'+entry.position;
const location=entry=>entry.pillarKey+'.'+entry.position;
const fail=()=>{throw new Error('확인된 사주 정보로 나의 성향을 다시 준비해 주세요.');};

const STEMS={
  甲:{
    manner:'한 번 중요하다고 정한 일은 쉽게 바꾸지 않고 오래 붙드는 편이에요.',
    reason:'당장 편한 방법보다 처음 세운 목표를 지키고 싶어 해요. 목표가 분명하면 꾸준히 해내는 편이에요. 계획을 바꿀 때는 남이 재촉해서가 아니라, 내가 이해할 만한 이유가 있어야 마음이 움직여요.',
    edge:'계획을 바꾸는 일을 곧 포기로 받아들이면, 이미 불편해진 방법까지 계속 붙들 수 있어요.',
    reset:'지키려는 목표와 바꿔도 되는 방법을 따로 적어 보세요. 방법을 고쳐도 처음의 뜻까지 버리는 것은 아니에요.',
  },
  乙:{
    manner:'상대와 상황을 먼저 살피고, 뜻을 이루는 방법은 유연하게 바꾸는 편이에요.',
    reason:'같은 말도 누구에게 언제 꺼내면 좋을지 생각해요. 내 뜻만 밀어붙이기보다 대화를 이어 가려는 편이에요. 여러 사람이 원하는 것을 듣고, 함께할 방법을 찾는 모습을 보일 수 있어요.',
    edge:'대화가 끊기지 않게 맞추다 보면, 정작 내가 원했던 답을 뒤로 미룰 수 있어요.',
    reset:'상대에게 맞출 수 있는 부분을 말하기 전에 내가 꼭 원하는 한 가지를 먼저 정해 두세요.',
  },
  丙:{
    manner:'생각이나 기분이 생기면 말과 행동으로 밖에 드러내는 편이에요.',
    reason:'마음속에서만 정리하기보다 사람과 나누면서 생각을 더 분명히 해요. 관심 있는 일을 이야기할 때 반응이 빠르고, 주변도 함께 움직였으면 하는 마음이 실리기 쉬워요.',
    edge:'내가 들뜬 만큼 상대도 준비됐다고 생각하면, 함께 정해야 할 일을 먼저 확정할 수 있어요.',
    reset:'의견을 밝힌 뒤에는 상대가 생각할 시간을 남겨 주세요. 반응이 느리다는 이유만으로 관심이 없다고 결론 내릴 필요는 없어요.',
  },
  丁:{
    manner:'많은 일에 넓게 손대기보다 마음이 가는 사람이나 일을 세심하게 챙기는 편이에요.',
    reason:'겉으로 크게 드러난 일보다 작은 차이를 오래 살펴요. 관심을 가진 대상에는 시간과 정성을 쓰지만, 모두에게 똑같은 깊이로 마음을 쓰기는 어려운 모습이에요.',
    edge:'작은 변화까지 오래 생각하면, 상대가 별뜻 없이 한 말에도 혼자 여러 이유를 붙일 수 있어요.',
    reset:'직접 본 일과 혼자 짐작한 뜻을 따로 생각해 보세요. 궁금한 점은 짧게 물어보세요. 상대의 답을 듣고 판단해도 늦지 않아요.',
  },
  戊:{
    manner:'일이나 관계가 흔들려도 맡은 자리를 쉽게 떠나지 않는 편이에요.',
    reason:'계획을 빨리 바꾸기보다 지금까지 해 온 일을 지키려 해요. 주변이 급해져도 하던 일을 이어 가는 끈기가 있어요. 다만 방법이나 속도를 바꿔야 할 때는 그 이유를 충분히 알고 싶어 해요.',
    edge:'버티는 것이 늘 책임지는 방법이라고 생각하면, 다른 사람과 나눌 일까지 혼자 오래 붙잡을 수 있어요.',
    reset:'끝까지 내가 할 일과 도움을 받을 일을 따로 말해 보세요. 다른 사람과 나눠 한다고 맡은 일을 버리는 것은 아니에요.',
  },
  己:{
    manner:'큰말로 앞서기보다 주변에 빠진 것과 손이 필요한 곳을 챙기는 편이에요.',
    reason:'일을 계속하려면 무엇이 필요한지 미리 살피는 편이에요. 작은 준비도 여러 번 챙겨요. 그래서 눈에 보이는 결과보다 뒤에서 들인 수고가 더 많을 수 있어요.',
    edge:'내가 챙기는 것이 빠르다는 이유로 계속 대신하면, 어느새 부탁하지 않은 일까지 내 책임이 될 수 있어요.',
    reset:'도와줄 때는 어디까지 맡는지 함께 말해 주세요. 한 번 도와준 일이 계속 내 역할이 되는 상황을 줄일 수 있어요.',
  },
  庚:{
    manner:'문제가 생기면 무엇을 남기고 무엇을 고칠지 먼저 정리하는 편이에요.',
    reason:'말을 오래 주고받기보다 무엇을 할지 분명히 정하고 싶어 해요. 일이 복잡할 때 결정을 돕는 장점이 있어요. 다만 상대가 속상한 마음을 말하는 중에도 해결 방법부터 꺼낼 수 있어요.',
    edge:'문제를 빨리 끝내려는 말이 상대에게는 내 이야기를 그만하라는 뜻처럼 들릴 수 있어요.',
    reset:'방법을 제시하기 전에 지금 필요한 것이 공감인지 해결책인지 한 번 물어보세요.',
  },
  辛:{
    manner:'대충 비슷한 결과보다 내가 납득할 만큼 잘 다듬어진 결과를 원하는 편이에요.',
    reason:'다른 사람은 넘어가는 작은 차이도 눈에 들어와요. 끝까지 확인하는 꼼꼼함이 장점이지만, 기준이 높은 만큼 완성한 뒤에도 아쉬운 부분을 먼저 볼 수 있어요.',
    edge:'고칠 곳이 계속 보인다고 해서 이미 해낸 일까지 부족한 결과로 묶어 버릴 수 있어요.',
    reset:'시작하기 전에 꼭 해야 할 것과 나중에 더 고쳐도 될 것을 적어 보세요. 꼭 해야 할 일을 끝냈다면, 이번 결과는 일단 마무리해 보세요.',
  },
  壬:{
    manner:'한 가지 답을 고르기 전에 다른 사람과 여러 가능성을 함께 살피는 편이에요.',
    reason:'처음 정한 방법에만 머무르지 않아요. 새 정보를 찾아보고 도움을 줄 사람도 떠올려요. 일이 막혔을 때 다른 방법을 찾는 장점이 있어요. 다만 고를 수 있는 것이 많아지면 결정을 끝내기 어려울 수 있어요.',
    edge:'더 좋은 길이 있을 것 같아 계속 넓혀 보면, 이미 시작할 수 있는 선택까지 늦어질 수 있어요.',
    reset:'비교할 선택지를 몇 개로 좁히고 이번 결정에서 가장 중요한 조건 하나를 정해 보세요.',
  },
  癸:{
    manner:'바로 결론을 말하기보다 작은 변화와 상대의 뜻을 먼저 살피는 편이에요.',
    reason:'말하기 전에 혼자 여러 번 생각을 정리해요. 덕분에 성급한 판단을 줄이는 편이에요. 다만 상대는 그 과정을 알 수 없어서, 내가 아무 생각 없이 조용히 있는 줄 알 수도 있어요.',
    edge:'확실해질 때까지 표현을 미루면, 상대는 내가 무엇을 원하고 무엇이 불편한지 모를 수 있어요.',
    reset:'완벽하게 정리되지 않았어도 지금까지 생각한 것과 더 필요한 시간을 함께 알려 주세요.',
  },
};

// Each row describes one observed relationship, not one finished person type.
// Different cards connect different confirmed rows, the natal day stem, the
// existing season rule and every matching natal combination/clash.
const VOICES={
  companion:{group:'peer',brief:'스스로 고른 일에는 마음이 붙고, 이유 없이 따르라는 말에는 답답함을 느껴요.',
    headline:'스스로 납득한 답을 고르는 사람',
    decision:'다른 사람의 추천을 들어도 마지막 선택은 내가 이해한 이유로 하고 싶어 해요.',
    why:'결과만큼 내가 직접 판단했다는 느낌이 중요하기 때문이에요. 지시가 자세할수록 편해지는 경우도 있지만, 선택할 여지가 전혀 없으면 의욕이 떨어지는 쪽으로 나타날 수 있어요.',
    relationship:'가까운 사이에도 내 생각과 내 시간을 존중받고 싶어 해요. 자주 연락하는 것보다 서로의 선택을 믿어 주는 태도에서 편안함을 느낄 수 있어요.',
    work:'내가 맡은 부분의 방법을 정할 수 있을 때 책임감 있게 움직이는 편이에요. 사소한 단계까지 계속 허락을 받아야 하면, 일 자체보다 간섭받는 느낌 때문에 지칠 수 있어요.',
    stress:'이미 이유를 설명했는데도 내 선택을 계속 대신 정해 주려 할 때 답답함이 커질 수 있어요.',
    misread:'내가 결정하겠다는 말만 짧게 하면, 상대는 의견을 들을 생각이 없다는 뜻으로 받아들일 수 있어요.',
    action:'다른 의견에서 좋다고 느낀 점을 먼저 말해 보세요. 그런 다음 내가 직접 정하고 싶은 일이 무엇인지 알려 주세요.',
  },
  competitor:{group:'peer',brief:'함께 힘을 보태는 데 적극적이고, 수고가 공평하게 나뉘는지도 중요하게 생각해요.',
    headline:'함께할 줄 알지만 혼자 떠안지는 못하는 사람',
    decision:'나만 편해지는 답보다 함께하는 사람들이 얼마나 나누어 맡는지 살피는 편이에요.',
    why:'함께 만들었다는 느낌과 서로 비슷하게 애쓴다는 느낌이 중요하기 때문이에요. 협력하고 싶어도 내 수고가 당연하게 여겨지면 경쟁심이나 서운함이 올라올 수 있어요.',
    relationship:'일방적으로 받기만 하거나 주기만 하는 관계보다 서로 시간과 정성을 쓰는 관계가 편해요. 내가 많이 애쓰는 것 같을 때는 호감과 별개로 관계를 다시 따져 볼 수 있어요.',
    work:'동료와 나누어 맡고 함께 결과를 만드는 일에 힘을 보태는 편이에요. 누가 무엇을 했는지 모호하면 일의 양보다 인정받지 못하는 느낌이 더 크게 남을 수 있어요.',
    stress:'내가 더 준비했는데 결과는 똑같이 나누거나, 다른 사람의 빠진 일을 계속 메울 때 불편함이 쌓일 수 있어요.',
    misread:'공평하게 나누자는 뜻으로 한 말이, 상대에게는 작은 일까지 따지는 태도로 들릴 수 있어요.',
    action:'일을 시작할 때 누가 무엇을 언제까지 할지 함께 정해 보세요. 나중에 누가 더 애썼는지 따지기 전에, 서로 맡은 일을 확인할 수 있어요.',
  },
  creator:{group:'expression',brief:'마음을 말 한 번으로 끝내기보다 챙기고 만들고 반복하는 행동으로 보여 줘요.',
    headline:'작은 행동을 꾸준히 쌓아 마음을 보여 주는 사람',
    decision:'설명만 오래 듣기보다 작은 일이라도 직접 해 보고 판단하는 편이에요.',
    why:'손으로 해 본 경험과 눈앞에 남은 결과가 있어야 생각이 구체적으로 정리되기 때문이에요. 한 번에 크게 드러내기보다 반복해서 익숙하게 만드는 과정에 마음이 붙어요.',
    relationship:'큰 약속 한 번보다 안부를 묻거나 필요한 것을 챙기는 작은 행동으로 마음을 전하는 편이에요. 내가 한 일을 따로 설명하지 않으면 상대가 그 정성을 알아차리지 못할 수 있어요.',
    work:'만들고 고치고 다시 해 보면서 결과를 완성하는 과정이 잘 맞는 편이에요. 꾸준히 해낼 시간이 있을 때 장점이 드러나고, 시작만 반복하며 결과를 남기지 못하면 답답해질 수 있어요.',
    stress:'정성껏 해낸 것을 계속 당연하게 여기거나, 쉬지 않고 다음 결과만 요구할 때 기운이 떨어질 수 있어요.',
    misread:'말없이 계속 챙기면, 상대는 부담 없이 할 수 있어서 맡는 일이라고 생각할 수 있어요.',
    action:'해 준 일을 평가해 달라고 하기보다 어떤 마음으로 했는지 한 문장만 덧붙여 보세요. 내가 쉴 시간과 상대가 맡을 일도 함께 말해 주세요.',
  },
  critic:{group:'expression',brief:'말의 앞뒤가 맞지 않거나 불편한 방법이 반복되면 이유를 묻고 고칠 점을 찾아요.',
    headline:'불편한 이유를 찾아 자기 말로 표현하는 사람',
    decision:'늘 그렇게 해 왔다는 말보다 왜 그 방법이어야 하는지 납득하고 싶어 해요.',
    why:'정해진 답을 그대로 따르는 것보다 고칠 부분을 찾아 더 나은 방법으로 바꾸는 데 관심이 가기 때문이에요. 이유가 분명하면 움직이지만, 설명 없이 따르라고 하면 질문이 늘어날 수 있어요.',
    relationship:'좋아하는 사람에게도 불편한 점을 솔직하게 말하는 편이에요. 관계를 잘 만들고 싶어서 고칠 점을 말해도, 칭찬보다 지적이 먼저 나오면 상대는 평가받는다고 느낄 수 있어요.',
    work:'반복되는 실수나 불편한 절차를 찾아 고치는 일에서 장점을 쓰는 편이에요. 의견을 시험해 볼 수 있을 때 적극적이고, 질문 자체를 막는 환경에서는 답답해질 수 있어요.',
    stress:'더 나은 방법이 보이는데 이유를 묻거나 바꿔 볼 기회조차 없을 때 말이 날카로워질 수 있어요.',
    misread:'문제만 정확하게 말하면, 상대는 자신이 한 노력까지 부정당했다고 받아들일 수 있어요.',
    action:'상대가 해낸 부분을 먼저 짚고 바꾸고 싶은 한 가지만 말해 보세요. 가능하면 다른 방법을 짧게 보여 주면 비판보다 제안으로 전달하기 쉬워요.',
  },
  opportunist:{group:'wealth',brief:'새로운 사람이나 방법을 보면 지금 하려는 일에 어떻게 연결할지 먼저 떠올려요.',
    headline:'사람과 기회를 연결하며 일을 벌이는 사람',
    decision:'한 가지 선택만 보기보다 사람·시간·비용을 다르게 묶어 가능한 길을 찾는 편이에요.',
    why:'지금 가진 것만으로 해결하기보다 필요한 사람이나 준비물을 더 찾아보는 데 관심이 가기 때문이에요. 새로운 방법은 빨리 찾는 편이에요. 다만 그 일을 맡을 시간과 준비가 있는지는 따로 확인할 필요가 있어요.',
    relationship:'말로 호감을 표현하는 것과 함께 같이 해 볼 일이나 만날 자리를 만드는 편이에요. 관심이 생기면 연결을 넓히지만, 약속이 많아지면 한 사람에게 쓸 시간이 줄 수 있어요.',
    work:'필요한 사람이나 자료를 찾아 일을 움직이게 하는 역할에서 장점을 쓰는 편이에요. 가능성을 빨리 찾는 만큼, 맡긴 뒤 끝까지 확인할 일정이 있어야 벌인 일을 마무리하기 쉬워요.',
    stress:'해 볼 만한 제안이 여러 개 겹치면 하나를 놓치기 아쉬워, 내 시간보다 약속이 앞서 늘어날 수 있어요.',
    misread:'관심 있는 일을 빠르게 이야기하다가 계획이 바뀌면, 상대는 처음 약속도 가벼웠다고 느낄 수 있어요.',
    action:'제안을 받으면 하고 싶은 일과 실제로 맡을 일을 따로 말하세요. 시간과 비용을 확인한 뒤 약속하면 관심을 책임 있게 이어 갈 수 있어요.',
  },
  manager:{group:'wealth',brief:'이미 맡은 일과 가진 것을 빠뜨리지 않으려고 꾸준히 확인하고 관리해요.',
    headline:'작은 약속과 생활을 차근차근 지키는 사람',
    decision:'좋아 보인다는 느낌만으로 고르기보다 실제 비용과 반복해서 해야 할 일을 먼저 따지는 편이에요.',
    why:'시작하는 순간보다 다음에도 감당할 수 있는지가 중요하기 때문이에요. 작은 지출과 일정도 이어서 챙기는 장점이 있지만, 준비가 충분해야 마음을 놓는 쪽으로 나타날 수 있어요.',
    relationship:'연락이나 약속이 일정하게 이어질 때 신뢰가 쌓이는 편이에요. 큰 표현보다 실제로 지킨 행동을 보기 때문에, 말은 다정해도 약속이 자주 바뀌면 마음을 놓기 어려울 수 있어요.',
    work:'빠진 항목을 확인하고 정해진 일을 끝까지 관리하는 역할에서 장점을 쓰는 편이에요. 일을 늘리기 전에 현재 일정과 준비물을 확인하고 싶어 해요.',
    stress:'작은 약속이 계속 바뀌거나 누가 맡았는지 불분명한 일이 쌓일 때, 내가 모두 확인해야 할 것처럼 느낄 수 있어요.',
    misread:'아직 확인할 것이 남아 있어 신중하게 묻는 말이, 상대에게는 처음부터 반대하는 태도로 들릴 수 있어요.',
    action:'무엇을 확인하면 시작할 수 있는지 먼저 정해 보세요. 꼭 알아야 할 것은 먼저 묻고, 나중에 확인해도 될 것은 따로 적어 두세요. 준비만 하다가 시작을 미루는 일을 줄일 수 있어요.',
  },
  challenger:{group:'authority',brief:'어려운 문제가 생기면 내가 해결할 수 있는 일부터 정하고 움직여요.',
    headline:'어려운 일 앞에서 집중하지만 책임도 오래 짊어지는 사람',
    decision:'문제를 그대로 두기보다 가장 먼저 해결할 일을 정하고 움직이려는 편이에요.',
    why:'해야 할 일이 분명하고 책임질 대상이 있을 때 집중하기 쉽기 때문이에요. 급한 상황에서 힘을 모으는 장점이 있지만, 문제를 해결한 뒤에도 긴장을 내려놓기 어려울 수 있어요.',
    relationship:'가까운 사람이 어려워하면 실제로 해결할 방법을 찾으려는 편이에요. 든든하게 보일 수 있지만, 상대는 해결보다 이야기를 들어 주기를 바랄 때도 있어요.',
    work:'기한이 있거나 해결할 문제가 분명한 일에 집중하는 편이에요. 어려운 일을 맡았다는 이유로 필요한 인원과 시간을 말하지 않고 버티면 부담이 커질 수 있어요.',
    stress:'남의 어려움까지 내가 해결해야 한다고 받아들이면, 일이 끝나도 다음 문제를 먼저 찾으며 쉬지 못할 수 있어요.',
    misread:'상대를 도우려는 마음으로 방법을 계속 정해 주면, 상대는 자신의 선택을 대신하려 한다고 느낄 수 있어요.',
    action:'무엇을 언제까지 해낼지 정할 때, 필요한 도움도 함께 말해 보세요. 끝낸 일은 언제 다시 확인할지만 정해 두세요. 그때까지는 다른 일이나 휴식에 마음을 써도 돼요.',
  },
  officer:{group:'authority',brief:'한 번 한 약속과 맡은 역할을 가볍게 넘기지 않고 끝까지 지키려 해요.',
    headline:'믿을 수 있는 사람으로 남고 싶어 약속을 지키는 사람',
    decision:'내가 원하는 것과 함께 정한 약속이 어긋나지 않는지 확인하고 결정하는 편이에요.',
    why:'내 선택이 다른 사람에게 어떤 책임으로 이어지는지 신경 쓰기 때문이에요. 믿음을 주는 장점이 있지만, 기대를 저버리고 싶지 않아 내키지 않는 부탁을 받아들일 수 있어요.',
    relationship:'말과 행동이 맞고 서로 지킬 약속이 분명한 관계에서 편안함을 느끼는 편이에요. 좋아하는 마음이 있어도 관계가 계속 모호하면 확실한 답을 듣고 싶어질 수 있어요.',
    work:'기준과 책임이 정해진 일을 꼼꼼하게 마무리하는 편이에요. 무엇을 잘했다고 보는지 분명하면 집중하기 쉽지만, 평가 기준이 자주 바뀌면 필요 이상으로 자신을 점검할 수 있어요.',
    stress:'실수하지 말아야 한다는 생각이 커지면 작은 지적도 내가 맡을 자격이 부족하다는 말처럼 무겁게 받아들일 수 있어요.',
    misread:'약속을 중요하게 생각해 규칙을 먼저 말하면, 상대는 사정을 들을 여지가 없다고 느낄 수 있어요.',
    action:'부탁에 답하기 전에 지금 맡은 일을 알려 주세요. 그 일을 함께 할 수 있는 날짜도 말해 보세요. 모든 부탁을 받기보다, 지킬 수 있는 약속을 하는 편이 믿음을 쌓는 데 도움이 돼요.',
  },
  explorer:{group:'resource',brief:'익숙한 설명도 내 안에서 이해될 때까지 다른 각도로 살펴봐요.',
    headline:'쉽게 넘기지 않고 자기만의 이유를 찾는 사람',
    decision:'많이 알려진 답인지보다 내가 그 이유를 이해하는지를 먼저 살피는 편이에요.',
    why:'표면에 보이는 답에서 끝내기보다 다른 관점과 숨은 조건을 찾는 데 관심이 가기 때문이에요. 한 가지를 깊이 파고들 수 있지만, 생각이 정리되기 전에는 말수가 줄 수 있어요.',
    relationship:'많이 만나는 것보다 생각을 깊게 나눌 수 있는 대화에서 가까움을 느끼는 편이에요. 혼자 정리할 시간이 필요할 때는 그 이유를 말해야 상대가 거리감으로 받아들이지 않아요.',
    work:'자료를 찾아 원인을 파악하거나 같은 문제를 다른 각도로 설명하는 일에서 장점을 쓰는 편이에요. 관심이 생기면 깊게 들어가지만, 조사 범위를 정하지 않으면 실행이 늦어질 수 있어요.',
    stress:'답이 덜 정리됐다는 이유로 혼자 생각하는 시간이 길어지면, 질문하거나 시험해 볼 기회까지 뒤로 밀릴 수 있어요.',
    misread:'생각을 정리하느라 조용한 모습이 상대에게는 관심이 없거나 거리를 두는 태도로 보일 수 있어요.',
    action:'지금 가장 궁금한 질문 한 개를 골라 보세요. 그 답을 확인할 작은 행동부터 해 보세요. 답을 기다리는 사람에게는 생각 중이라는 말과 언제 다시 이야기할지 알려 주세요.',
  },
  scholar:{group:'resource',brief:'먼저 이해하고 준비한 다음, 배운 것을 차근차근 자기 것으로 만들어요.',
    headline:'서두르기보다 이해와 준비를 쌓는 사람',
    decision:'바로 답하기보다 설명을 듣고 기본을 확인한 뒤 선택하는 편이에요.',
    why:'어디서부터 시작해야 하는지 알아야 마음을 놓고 움직이기 때문이에요. 배움과 도움을 받아들이는 장점이 있지만, 충분히 준비됐다는 확신을 기다리면 시작이 늦어질 수 있어요.',
    relationship:'내 말을 끝까지 듣고 이유를 설명해 주는 사람에게 마음을 열기 쉬운 편이에요. 돌봄을 나누는 관계를 편하게 여기지만, 상대가 어려워한다는 이유만으로 계속 받아 주면 지칠 수 있어요.',
    work:'기본을 익히고 자료를 정리해 다른 사람이 이해하기 쉽게 전하는 일에서 장점을 쓰는 편이에요. 처음 배우는 과정이 존중될 때 안정적으로 경험을 쌓기 쉬워요.',
    stress:'아직 더 배워야 한다는 생각이 계속되면, 이미 아는 것까지 부족하다고 보고 실제 선택을 다른 사람에게 맡길 수 있어요.',
    misread:'확인하고 싶어서 조언을 자주 구하는 모습이, 상대에게는 스스로 정하지 못하는 태도로 보일 수 있어요.',
    action:'설명을 들었다면 내가 먼저 해 볼 행동을 한 가지 정해 보세요. 도움받은 내용을 어디에 쓸지도 말해 보세요. 더 배울 것이 남아 있어도, 아는 것부터 시작할 수 있어요.',
  },
};

// Topics use their own scenes. A response comes from an observed relationship;
// two responses share one hypothetical situation rather than repeating a whole
// reading or moving a romance example into the work chapter.
const TOPICS={
  decisions:'예를 들어 새로운 활동을 제안받았다고 해 볼게요.',
  relationships:'예를 들어 친구와 주말 약속을 정한다고 해 볼게요.',
  work:'예를 들어 팀에서 안내 자료를 함께 만든다고 해 볼게요.',
  pressure:'예를 들어 함께 준비하던 일에서 누군가 맡은 부분이 비었다고 해 볼게요.',
  adjustment:'예를 들어 친구가 새 계획에 대한 의견을 물었는데, 내 뜻과 다르게 받아들였다고 해 볼게요.',
};
const TOPIC_VOICES={
  companion:{
    titles:['남이 좋다는 답보다 내가 납득한 답','가까워도 내 선택은 존중받고 싶어요','방법을 맡겨 주면 책임도 커져요','내가 정할 여지가 없으면 답답해져요','고집을 부리기보다 직접 정하고 싶어요'],
    decisions:'좋다는 설명만 듣기보다, 내가 정할 수 있는 부분이 무엇인지부터 궁금해질 수 있어요.',
    relationships:'같이 가는 것은 좋아도 꼭 가고 싶은 곳 한 군데는 직접 고르고 싶어질 수 있어요.',
    work:'담당한 부분의 순서와 방법을 직접 정할 수 있으면 적극적으로 움직이지만, 작은 수정까지 계속 허락을 받아야 하면 답답해질 수 있어요.',
    pressure:'문제를 메우는 것보다 남이 내 일정을 먼저 정해 버렸다는 점이 불편하게 남을 수 있어요.',
    adjustment:'내가 알아서 정하겠다는 대답은 직접 판단하고 싶다는 뜻인데, 친구는 자신의 의견이 필요 없다는 뜻으로 들을 수 있어요.',
    relationAction:'서로 의견이 다를 때는 같이 정할 부분과 각자 정해도 되는 부분을 나누어 말해 주세요.',
    workAction:'무엇을 언제까지 만들지 먼저 함께 정해 보세요. 만드는 순서와 방법은 내가 골라도 되는지 물어보세요.',
    explainAction:'도움을 거절하기 전에 받아들인 의견을 한 가지 말하고, 직접 판단하고 싶은 부분을 덧붙여 주세요.',
  },
  competitor:{
    titles:['함께할수록 역할은 공평하게','서로 비슷하게 마음을 써야 편해요','같이 만든 결과에 내 수고도 보여야 해요','내 수고가 당연해지면 서운해져요','작은 이익보다 서로의 수고를 따져요'],
    decisions:'함께하는 사람이 있다면 누가 얼마나 준비하고 맡는지도 확인하고 싶어질 수 있어요.',
    relationships:'예약과 이동 준비를 한 사람만 계속 맡지 않도록 서로 나누고 싶어질 수 있어요.',
    work:'함께 아이디어를 내고 힘을 보태다가도, 실제 준비는 나에게 몰리고 이름만 함께 올라가면 마음이 불편해질 수 있어요.',
    pressure:'한 번 도와주는 것은 괜찮아도 같은 사람이 계속 빠지면, 일의 양보다 서로의 약속이 불공평하다는 점이 더 신경 쓰일 수 있어요.',
    adjustment:'누가 얼마나 맡는지 물었을 뿐인데, 친구는 시작하기도 전에 손해부터 따진다고 들을 수 있어요.',
    relationAction:'서운함이 쌓인 뒤 수고를 비교하기보다 다음 약속에서 서로 맡을 준비를 구체적으로 나누세요.',
    workAction:'누가 맡았는지 함께 볼 수 있게 적어 두세요. 맡은 일이 바뀌면 그 내용도 고쳐 주세요. 새 일을 부탁받았다면 하던 일 중 무엇을 늦출지 함께 정해 보세요.',
    explainAction:'손해 보기 싫다는 말보다 함께 오래 하려면 어떤 역할을 나누고 싶은지 말해 주세요.',
  },
  creator:{
    titles:['작게라도 해 봐야 내 답이 생겨요','큰 말보다 작은 행동으로 챙겨요','반복해서 다듬은 결과로 말해요','정성은 많은데 쉬는 몫이 줄어들어요','말하지 않은 정성이 가볍게 보일 수 있어요'],
    decisions:'긴 설명을 더 듣기보다 짧게 한 번 체험해 보고, 계속하고 싶은지 몸소 확인하고 싶어질 수 있어요.',
    relationships:'친구가 전에 좋아한다고 했던 음식이나 장소를 기억해 실제 일정에 넣으며 마음을 전할 수 있어요.',
    work:'설명만 주고받기보다 초안을 직접 만들고, 사람들이 읽으며 막히는 부분을 여러 번 고쳐 완성하려는 모습이에요.',
    pressure:'손을 보태 계속 완성해 내지만, 내가 쉰 사이에는 일이 멈출 것 같아 쉬어야 한다는 말을 늦출 수 있어요.',
    adjustment:'말로 길게 답하지 않고 작은 시안부터 만들어 보여 줬는데, 친구는 별다른 고민 없이 금방 할 수 있는 일이라고 생각할 수 있어요.',
    relationAction:'챙겨 준 행동에 어떤 마음이 있었는지 짧게 말해 주세요. 내가 쉬고 싶을 때는 상대가 대신 맡아 줄 일도 함께 부탁하세요.',
    workAction:'처음 만들 시간과 고칠 시간을 따로 잡아 보세요. 이번에 어디까지 끝낼지도 정해 두세요. 수정할 것을 계속 더하다가 마무리가 늦어지는 일을 줄일 수 있어요.',
    explainAction:'해 준 일만 보여 주지 말고 신경 쓴 부분과 걸린 시간도 짧게 알려 주세요.',
  },
  critic:{
    titles:['이유가 맞아야 마음도 움직여요','잘 지내고 싶어서 불편한 점도 말해요','늘 하던 방법에서도 고칠 곳을 찾아요','질문할 수 없으면 말이 날카로워져요','반대하려는 말이 아니라 더 잘하고 싶은 말'],
    decisions:'왜 그 방법으로 해야 하는지 묻고, 불편한 절차를 바꿀 수 있는지도 살필 수 있어요.',
    relationships:'돌아가는 길이나 애매한 약속이 보이면 바로 더 나은 방법을 말할 수 있어요. 고마움이 빠지면 준비한 친구에게 지적만 남을 수 있는 장면이에요.',
    work:'사람들이 헷갈릴 표현이나 반복해서 해야 하는 작업을 먼저 찾아 고치려는 모습이에요. 의견을 막으면 자료보다 일하는 방식 때문에 답답해질 수 있어요.',
    pressure:'빈자리를 메우면서도 같은 문제가 왜 반복되는지 짚고 싶어, 당장 해결하자는 사람과 말의 순서가 엇갈릴 수 있어요.',
    adjustment:'실패할 수 있는 부분을 먼저 짚었더니, 친구는 자신의 생각 전체가 틀렸다는 말을 들었다고 느낄 수 있어요.',
    relationAction:'불편한 점을 말할 때는 관계에서 고맙게 느끼는 점도 먼저 전하고, 바꾸고 싶은 행동을 한 가지로 좁혀 주세요.',
    workAction:'고칠 이유와 작은 수정 예시를 함께 보여 주세요. 더 나아졌는지 확인할 수 있어야 제안이 끝없는 비판으로 남지 않아요.',
    explainAction:'좋다고 본 부분을 먼저 말하고, 고치자는 대상이 사람인지 방법인지 헷갈리지 않게 구체적으로 짚어 주세요.',
  },
  opportunist:{
    titles:['없는 길도 사람과 방법을 연결해 찾아요','같이 할 일을 만들며 가까워져요','필요한 사람과 재료를 찾아 일을 넓혀요','좋은 제안이 많으면 약속도 늘어나요','관심을 보인 말이 확정된 약속으로 들려요'],
    decisions:'기존 선택지에서만 고르기보다 함께할 사람이나 다른 이용 방법을 떠올려 가능한 길을 넓힐 수 있어요.',
    relationships:'괜찮은 장소와 같이 어울릴 사람을 떠올리며 약속을 풍성하게 만들 수 있어요. 다만 즐거운 제안이 많을수록 실제로 함께할 시간을 확인해야 해요.',
    work:'내용에 필요한 자료를 찾거나 잘 아는 사람을 연결해 진행을 빠르게 만들 수 있어요. 새 아이디어가 늘어날 때마다 범위까지 넓히면 마무리가 밀릴 수 있는 장면이에요.',
    pressure:'다른 사람에게 도움을 부탁하거나 새 방법을 찾아보려 할 수 있어요. 그러다 하던 일에 연락하고 일정을 맞추는 일까지 더해질 수 있어요.',
    adjustment:'재미있겠다며 몇 가지 방법을 이야기했는데, 친구는 이미 함께하기로 약속한 것으로 받아들일 수 있어요.',
    relationAction:'같이하고 싶다는 마음과 실제로 가능한 날짜를 나누어 말해 주세요. 아직 정하지 못한 약속은 바로 확답하지 않아도 돼요.',
    workAction:'새 제안을 더할 때는 이번 결과에 넣을 것과 다음에 검토할 것을 나누고, 연락한 뒤 확인할 날짜도 정하세요.',
    explainAction:'흥미가 있다는 말 뒤에 참여를 결정한 것인지, 조건을 더 알아보는 중인지 한 문장을 덧붙여 주세요.',
  },
  manager:{
    titles:['시작한 뒤에도 감당할 수 있어야 골라요','다정한 말만큼 지킨 약속을 봐요','눈에 덜 띄는 확인까지 끝내요','빠진 것을 계속 내가 확인하게 돼요','반대하는 게 아니라 가능한 조건을 묻고 있어요'],
    decisions:'처음 드는 비용뿐 아니라 다음 달에도 계속 쓸 시간과 비용을 확인한 뒤 정하고 싶어질 수 있어요.',
    relationships:'좋은 장소라는 말과 함께 실제 이동 시간과 비용을 확인해야 편하게 약속할 수 있어요.',
    work:'자료의 빠진 항목, 필요한 비용, 마무리 날짜를 계속 확인하며 결과가 실제로 쓰일 수 있게 챙기는 모습이에요.',
    pressure:'이번 빠진 부분을 채우는 데서 끝내지 못하고 다른 항목도 놓쳤을까 다시 확인하느라 내 시간이 길어질 수 있어요.',
    adjustment:'시간과 비용을 확인하려고 질문했는데, 친구는 마음에 들지 않아 거절할 이유를 찾는다고 들을 수 있어요.',
    relationAction:'확인이 필요할 때는 함께하고 싶은 마음부터 말한 뒤, 언제 어디서 만날지처럼 정할 조건을 구체적으로 물어보세요.',
    workAction:'마지막으로 확인할 것과 끝낼 시간을 적어 두세요. 작은 수정이 생겼다면 지금 꼭 고쳐야 하는지 먼저 살펴보세요. 이미 끝낸 일을 매번 처음부터 확인할 필요는 없어요.',
    explainAction:'하고 싶은 마음과 아직 확인할 조건을 한 문장 안에서 함께 말해 주세요. 질문만 나열할 때 생기는 오해를 줄일 수 있어요.',
  },
  challenger:{
    titles:['문제가 보이면 해결할 순서부터 정해요','힘들다는 말을 들으면 방법부터 찾아요','어려운 일이 분명할 때 집중해요','문제를 끝내도 책임은 내려놓기 어려워요','도우려던 말이 지시처럼 들릴 수 있어요'],
    decisions:'무엇이 제일 어렵고 먼저 해결해야 할 일인지 알아야 참여할 방법이 구체적으로 떠오를 수 있어요.',
    relationships:'예약이 막히거나 일정이 꼬이면 대안을 찾아 직접 해결하려는 모습이 나올 수 있어요. 상대가 원하는 방법도 묻지 않으면 준비를 혼자 이끌게 될 수 있어요.',
    work:'마감이 가까워졌는데 초안이 비어 있으면 문제를 쪼개 우선 끝낼 부분부터 맡으려는 모습이에요.',
    pressure:'내가 해결하면 빨리 끝난다는 생각으로 급한 부분을 맡고, 끝난 뒤에도 다른 문제가 생길까 계속 살필 수 있어요.',
    adjustment:'친구가 어려울 부분을 미리 해결해 주려고 순서를 정했는데, 친구는 자신의 선택을 대신 정했다고 느낄 수 있어요.',
    relationAction:'도와주기 전에 이야기를 들어 주길 원하는지, 방법을 함께 찾길 원하는지 물어보세요. 상대가 원하는 도움의 크기도 확인해 주세요.',
    workAction:'급한 부분을 맡을 때도 끝내야 할 범위와 필요한 지원을 함께 말하고, 해결 뒤에는 원래 담당자에게 역할을 돌려주세요.',
    explainAction:'바로 방법을 정해 주기 전에 원하는 도움을 물어보고, 선택은 상대가 할 수 있게 남겨 주세요.',
  },
  officer:{
    titles:['내 선택이 약속과 어긋나지 않는지 봐요','분명한 약속에서 마음을 놓아요','믿고 맡길 수 있게 기준을 지켜요','작은 실수도 내 책임처럼 무겁게 느껴요','약속을 지키려는 말이 엄격하게 들려요'],
    decisions:'하고 싶은 마음이 생겨도 이미 한 약속과 부딪히지 않는지 확인한 뒤 대답하려는 모습이에요.',
    relationships:'한 번 정한 시간은 지키려 하고, 바뀌어야 한다면 서로에게 미리 알려야 마음이 편할 수 있어요.',
    work:'필수 항목과 약속한 기준을 빠뜨리지 않으려 하지만, 기준이 뒤늦게 바뀌면 내가 잘못 준비한 것처럼 무겁게 느낄 수 있어요.',
    pressure:'책임자가 아니라도 약속한 날짜를 어기면 안 된다는 생각에, 내 일정까지 바꿔 맞추려는 모습이 나올 수 있어요.',
    adjustment:'이미 한 약속부터 확인했는데, 친구는 새로운 생각을 들어 볼 마음이 없다고 들을 수 있어요.',
    relationAction:'먼저 상대에게 무슨 일이 생겼는지 물어보세요. 꼭 지켜야 할 약속과 바꿔도 괜찮은 약속을 함께 이야기해 보세요.',
    workAction:'시작할 때 무엇을 끝내야 하는지, 어디까지 내가 맡는지 확인해 보세요. 해야 할 일이 바뀌면 끝낼 날짜도 다시 정해 보세요.',
    explainAction:'지키려는 이유를 말한 뒤 바꿀 수 있는 부분도 알려 주세요. 기준과 사람의 사정을 함께 보고 있다는 뜻이 전해져요.',
  },
  explorer:{
    titles:['알려진 답이어도 내 이유를 찾고 싶어요','깊이 나누고 혼자 생각할 시간도 필요해요','남들이 넘긴 이유까지 찾아봐요','더 알아보는 동안 시작이 늦어져요','생각 중인 침묵이 무관심으로 보일 수 있어요'],
    decisions:'괜찮다는 평가를 그대로 믿기보다 다른 설명과 숨은 조건을 찾아보고 싶어질 수 있어요.',
    relationships:'모두가 좋다는 장소도 왜 좋은지 더 알아본 뒤 내 의견을 정리하고 싶어질 수 있어요.',
    work:'같은 질문이 자꾸 나오는 이유를 찾아 자료의 설명 순서를 새롭게 짤 수 있어요. 조사를 어디서 멈출지 정하지 않으면 첫 초안이 늦어질 수 있는 장면이에요.',
    pressure:'빠진 일을 바로 채우기 전에 왜 이런 문제가 생겼는지 살피다, 주변에서는 아직 움직이지 않는다고 오해할 수 있어요.',
    adjustment:'조용히 다른 가능성을 생각하고 있었는데, 친구는 계획에 관심이 없어 답을 피하는 것으로 받아들일 수 있어요.',
    relationAction:'혼자 생각할 시간이 필요하면 그렇게 말해 주세요. 관심이 없어서 미루는 것은 아니라는 점도 알려 주세요. 언제 다시 이야기할지 정하면 상대가 기다리기 편해요.',
    workAction:'이번 자료에서 답해야 할 질문을 먼저 좁히고, 조사한 내용으로 작은 초안을 만든 뒤 남은 질문을 확인하세요.',
    explainAction:'생각이 다 정리되기를 기다리기보다 지금 궁금한 점과 다시 답할 때를 먼저 알려 주세요.',
  },
  scholar:{
    titles:['충분히 이해해야 시작이 편해요','끝까지 듣고 설명해 주는 사람에게 마음을 열어요','배운 것을 정리해 믿을 만하게 전해요','준비가 부족하다는 생각에 답을 미뤄요','확인하고 싶은 마음이 자신 없음으로 보일 수 있어요'],
    decisions:'처음 시작하는 순서와 기본 예시를 알아야 마음을 놓고 참여할 수 있어요.',
    relationships:'잘 아는 친구의 설명을 먼저 듣고 모르는 조건을 확인하며 함께 계획을 정하고 싶어질 수 있어요.',
    work:'기존 자료를 차근차근 익힌 뒤 처음 읽는 사람도 따라갈 수 있게 정리하려는 모습이에요.',
    pressure:'내가 대신 맡아도 잘할 수 있는지 먼저 확인하고 싶어, 이미 아는 일에도 주변의 답을 기다릴 수 있어요.',
    adjustment:'내가 이해한 내용이 맞는지 확인하려고 질문했는데, 친구는 결정 자체를 대신해 달라는 뜻으로 들을 수 있어요.',
    relationAction:'조언을 들은 뒤에는 내 생각이 어디까지 정해졌는지도 말해 주세요. 상대가 내 선택을 모두 책임져야 한다고 느끼지 않게 하는 거예요.',
    workAction:'필수 설명을 확인한 뒤에는 배운 내용을 작은 결과로 먼저 보여 주세요. 부족한 부분은 그 결과를 보며 질문해도 돼요.',
    explainAction:'내가 정한 부분과 도움을 구하는 부분을 나누어 말해 주세요. 확인할 것이 있어도 직접 결정하고 있다는 뜻이 보이게 돼요.',
  },
};

function scene(topic,codes) {
  return TOPICS[topic]+' '+codes.map(code=>TOPIC_VOICES[code][topic]).join(' ');
}
function topicAction(codes,key) {
  return codes.map(code=>TOPIC_VOICES[code][key]).join(' ');
}

const PAIRS={
  'peer-expression':{headline:'자기 생각을 지키고, 말이나 행동으로 보여 주는 사람',bridge:'마음속에 기준만 세워 두기보다 그것을 표현해야 답답함이 풀려요. 그래서 의견을 낼 자리가 있으면 적극적이지만, 참아야만 관계가 이어진다고 느끼면 말이 거칠어지거나 아예 손을 놓고 싶어질 수 있어요.',adjust:'내가 원하는 결과와 표현할 방식을 나누어 보세요. 분명하게 말하는 것과 상대가 받아들이기 쉽게 말하는 것을 함께 할 수 있어요.'},
  'peer-wealth':{headline:'선택은 스스로 하고 시간과 비용도 분명하게 정하는 사람',bridge:'스스로 결정하고 싶은 마음과 실제로 쓸 수 있는 시간·비용을 챙기는 마음이 함께 있어요. 하고 싶은 일이라도 누가 결정하고 누가 부담하는지가 흐릿하면 편하게 시작하기 어려워요.',adjust:'함께하는 일은 내가 정할 부분, 함께 정할 부분, 실제로 부담할 비용을 먼저 구분해 말해 보세요.'},
  'peer-authority':{headline:'스스로 결정하고 한 번 한 약속은 끝까지 지키려는 사람',bridge:'남이 내 선택을 대신하는 것은 답답하지만, 이미 맡은 일에서는 기대를 저버리고 싶지 않아요. 그래서 속으로는 부담스러워도 겉으로는 하던 일을 계속하는 모습이 나올 수 있어요.',adjust:'부탁을 받았을 때 바로 수락하기보다 내가 정할 수 있는 방법과 실제로 지킬 수 있는 기한을 함께 제안해 보세요.'},
  'peer-resource':{headline:'조언을 듣고 배워도, 마지막 판단은 직접 하고 싶은 사람',bridge:'혼자 정하고 싶은 마음과 충분히 이해한 뒤 움직이고 싶은 마음이 함께 있어요. 도움을 받으면 생각이 넓어지지만, 도움을 줬다는 이유로 결정까지 대신하려 하면 거리를 두고 싶어질 수 있어요.',adjust:'조언에서 받아들인 점을 말한 뒤 내가 직접 결정할 부분을 덧붙여 보세요. 배움과 주도권을 동시에 지킬 수 있어요.'},
  'expression-wealth':{headline:'좋은 생각을 말로 끝내지 않고 쓸모 있는 결과로 만드는 사람',bridge:'표현하고 만드는 일과 그것을 실제 생활에 맞게 운영하는 일이 함께 중요해요. 그래서 재미만 있어도, 쓸모만 있어도 만족스럽지 않고 내가 만든 것이 실제로 어떻게 쓰이는지 확인하고 싶어 해요.',adjust:'만들고 싶은 것 한 가지를 정했다면 필요한 시간과 비용도 작게 정해 보세요. 첫 결과를 본 뒤에 규모를 넓혀도 돼요.'},
  'expression-authority':{headline:'자기 방식으로 잘해 내면서도 책임은 놓치고 싶지 않은 사람',bridge:'생각을 자유롭게 표현하고 싶은 마음과 정해진 기대에 맞게 해내려는 마음이 함께 있어요. 그래서 더 나은 방법이 떠올라도 규칙이나 평가가 마음에 걸려 속도가 늦어질 수 있어요.',adjust:'바꿔도 되는 방법과 꼭 지켜야 하는 기준을 먼저 확인하세요. 허용된 범위 안에서 작은 개선을 보여 주면 표현과 책임을 함께 이어 가기 쉬워요.'},
  'expression-resource':{headline:'배운 것을 자기 말과 자기 솜씨로 바꾸는 사람',bridge:'이해하고 싶은 마음과 직접 표현하고 싶은 마음이 함께 있어요. 설명을 듣는 데서 끝내기보다 내 말로 다시 풀거나 직접 만들어 볼 때 비로소 배운 것이 내 것처럼 느껴져요.',adjust:'읽거나 들은 뒤에는 한 문장으로 설명하거나 작은 결과물로 남겨 보세요. 막히는 곳이 다음에 물어볼 질문이 돼요.'},
  'wealth-authority':{headline:'맡은 일과 생활의 약속을 허투루 두기 어려운 사람',bridge:'현실의 시간·비용을 챙기면서 맡은 책임도 지키려는 마음이 함께 있어요. 그래서 일을 믿고 맡길 만한 모습을 보일 수 있지만, 작은 누락까지 모두 내 책임으로 받아들이면 쉽게 쉬지 못할 수 있어요.',adjust:'확인해야 할 항목과 다른 사람이 책임질 항목을 함께 적어 두세요. 모든 일을 직접 확인해야만 책임을 다하는 것은 아니에요.'},
  'wealth-resource':{headline:'충분히 알아보고 실제 쓸 곳까지 따져 움직이는 사람',bridge:'설명을 이해하는 일과 그것이 실제로 어떤 쓰임이 있는지 살피는 일이 함께 중요해요. 알고 있는 내용을 생활이나 일에 적용하는 데 장점이 있지만, 더 알아볼 조건이 계속 늘면 결정을 미룰 수 있어요.',adjust:'이번 선택에서 꼭 알아야 할 것 세 가지를 정하고 확인되면 작은 범위에서 시작해 보세요. 모든 가능성을 미리 알아낼 필요는 없어요.'},
  'authority-resource':{headline:'제대로 이해한 뒤 믿을 수 있게 책임지고 싶은 사람',bridge:'기본을 충분히 배우려는 마음과 잘 해내야 한다는 책임감이 함께 있어요. 그래서 준비를 성실히 하지만, 모르는 부분을 드러내면 신뢰를 잃을까 걱정해 질문을 늦출 수 있어요.',adjust:'모르는 점을 숨기기보다 확인이 필요한 부분과 이미 할 수 있는 부분을 나누어 말해 보세요. 질문도 일을 책임 있게 진행하는 방법이에요.'},
};
const SAME_GROUP={
  peer:{headline:'자기 선택과 서로의 공평함을 함께 지키려는 사람',bridge:'스스로 정하고 싶은 마음과 함께하는 사람의 기여를 살피는 마음이 나란히 있어요. 가까운 사이일수록 누가 계속 맞추고 있는지가 중요하게 느껴질 수 있어요.',adjust:'같이 정할 일에서도 내가 양보할 수 있는 부분과 상대에게 부탁할 부분을 각각 말해 보세요.'},
  expression:{headline:'생각을 속에만 두지 않고 말과 결과로 보여 주는 사람',bridge:'꾸준히 만드는 면과 더 나은 방법을 찾는 면이 함께 있어요. 하던 일을 잘 이어 가다가도 불편한 점이 보이면 그대로 반복하기 어려울 수 있어요.',adjust:'유지할 방법과 바꿔 볼 방법을 한 가지씩 정하세요. 익숙한 일을 모두 버리지 않고도 개선할 수 있어요.'},
  wealth:{headline:'가능한 쓰임을 넓게 보고 실제 관리는 꼼꼼히 하려는 사람',bridge:'새로운 쓰임을 찾는 마음과 이미 가진 것을 지키는 마음이 함께 있어요. 새 제안이 반가워도 유지 비용과 기존 계획이 마음에 걸려 곧바로 결정하지 못할 수 있어요.',adjust:'새로운 일에 쓸 금액과 시간은 기존 생활에 필요한 부분을 남긴 뒤 별도로 정해 보세요.'},
  authority:{headline:'어려운 일을 해결하고 약속도 제대로 지키려는 사람',bridge:'문제를 해결하려는 집중력과 정해진 기준을 지키려는 책임감이 함께 있어요. 급한 일을 마친 뒤에도 놓친 것이 없나 확인하며 마음을 놓기 어려울 수 있어요.',adjust:'문제가 해결됐다고 볼 기준과 마지막 확인 시점을 정하세요. 끝낸 일을 계속 다시 맡지 않도록 경계를 남겨 두는 거예요.'},
  resource:{headline:'기본을 익히면서 다른 이유까지 깊게 알아보는 사람',bridge:'차근차근 배우는 면과 익숙한 설명을 다른 각도로 보는 면이 함께 있어요. 이해가 깊어지는 장점이 있지만, 남에게 보여 줄 때는 여러 생각을 한꺼번에 꺼내 설명이 길어질 수 있어요.',adjust:'설명할 때는 가장 중요한 답을 먼저 말하고 이유를 두 가지 정도만 덧붙여 보세요. 더 자세한 내용은 상대가 궁금해할 때 이어 가도 돼요.'},
};
const SEASONS={
  same:'같은 목표를 가진 사람과 일하더라도 구체적인 방법은 직접 납득해야 편해요. 남이 먼저 해 본 방법이라는 이유만으로 따르기보다, 내 기준으로 괜찮은지 확인하려는 마음이 있어요.',
  output:'준비한 생각을 말하거나 만들어 밖에 보여 줄 때 의욕이 살아나요. 배운 것만 계속 쌓고 실제로 꺼내 볼 자리가 없으면, 하고 싶은 것은 많은데 해낸 것은 적다는 답답함이 남을 수 있어요.',
  wealth:'하고 싶은 일이 생기면 실제로 언제 하고 무엇이 필요한지까지 생각해요. 막연히 좋다는 설명보다 생활 속에서 감당할 조건이 구체적일 때 움직이기 쉬워요.',
  authority:'내가 원하는 것만큼 주변에서 기대하는 역할도 생각해요. 좋아서 한 선택과 기대에 맞추려고 한 선택이 섞이면, 일을 잘해 내고도 정작 내가 원한 일을 미뤘다는 아쉬움이 남을 수 있어요.',
  resource:'잘 모르는 일은 설명과 도움을 받아 이해한 뒤 시작하고 싶어 해요. 준비할 시간이 있으면 차분해지지만, 모든 답을 안 다음에 움직이려 하면 시작할 기회까지 늦어질 수 있어요.',
};

function combined(first,second) {
  if(!second)return {headline:VOICES[first].headline,bridge:VOICES[first].why,adjust:VOICES[first].action,key:'single.'+first};
  const left=VOICES[first].group,right=VOICES[second].group;
  if(left===right)return {...SAME_GROUP[left],key:'same.'+left};
  const key=[left,right].sort((a,b)=>GROUP_ORDER.indexOf(a)-GROUP_ORDER.indexOf(b)).join('-');
  if(!PAIRS[key])fail();
  return {...PAIRS[key],key};
}

function validate({profile,facts,chapters}) {
  if(!profile?.dayMaster||!STEMS[profile.dayMaster.hanja]||!Array.isArray(profile.gods)||!profile.gods.length
    ||!Array.isArray(profile.knownPillars)||!profile.knownPillars.some(pillar=>pillar.key==='day')
    ||!Array.isArray(profile.interactions)||!Array.isArray(facts)||!Array.isArray(chapters))fail();
  const registry=new Map();
  for(const fact of facts){if(typeof fact?.id!=='string'||typeof fact.text!=='string'||registry.has(fact.id))fail();registry.set(fact.id,fact);}
  for(const id of ['natal.day-master','natal.scope','natal.season','natal.interaction-count'])if(!registry.has(id))fail();
  const positions=new Set();
  for(const entry of profile.gods){
    if(!VOICES[entry.god?.code]||VOICES[entry.god.code].group!==entry.god.group
      ||!ORDER.includes(location(entry))||positions.has(location(entry))
      ||!profile.knownPillars.some(pillar=>pillar.key===entry.pillarKey)
      ||!registry.has(factId(entry))||getTenGod(profile.dayMaster,entry.stem).code!==entry.god.code)fail();
    positions.add(location(entry));
  }
  for(const [index,interaction] of profile.interactions.entries()){
    if(!['stem-combination','branch-combination','branch-clash'].includes(interaction.kind)
      ||!registry.has('natal.interaction.'+index))fail();
  }
  return registry;
}
function orderedEntries(profile) {
  return [...profile.gods].sort((a,b)=>ORDER.indexOf(location(a))-ORDER.indexOf(location(b)));
}
function choose(entries,groups=null) {
  const ordered=groups?[...entries].sort((a,b)=>groups.indexOf(a.god.group)-groups.indexOf(b.god.group)):entries;
  return unique(ordered.map(entry=>entry.god.code)).slice(0,2);
}
function idsFor(profile,codes) {
  return profile.gods.filter(entry=>codes.includes(entry.god.code)).map(factId);
}
function seasonFor(profile,chapters,registry) {
  const rules=chapters.flatMap(chapter=>chapter.rules||[]);
  if(!profile.season)return null;
  const rule=rules.find(value=>value.id?.startsWith('natal.season.')&&SEASONS[value.id.slice('natal.season.'.length)]);
  if(!rule||!Array.isArray(rule.factIds)||rule.factIds.some(id=>!registry.has(id)))fail();
  return {text:SEASONS[rule.id.slice('natal.season.'.length)],factIds:[...rule.factIds],ruleId:rule.id};
}
function relationsFor(profile) {
  const matches=profile.interactions.map((value,index)=>({value,id:'natal.interaction.'+index}));
  const combine=matches.filter(item=>item.value.kind!=='branch-clash');
  const clash=matches.filter(item=>item.value.kind==='branch-clash');
  if(!matches.length)return null;
  const text=combine.length&&clash.length
    ?'사람과 뜻을 맞추려는 면과, 서로 다른 요구를 그대로 따르기 어려운 면을 함께 살펴야 해요. 예를 들어 처음에는 좋다고 맞췄다가 실제 부담이 커지면 마음이 달라지는 장면을 떠올릴 수 있어요. 괜찮은 부분과 어려운 부분을 처음부터 나누어 말하는 것이 중요해요.'
    :clash.length
      ?'서로 다른 부탁을 한꺼번에 받으면 무엇부터 해야 할지 마음이 복잡해질 수 있어요. 예를 들어 두 약속의 시간이 겹쳤다고 해 볼게요. 둘 다 무리해서 지키려 하기보다 어느 약속을 먼저 지킬지 정해 보세요. 다른 약속은 시간을 바꿀 수 있는지 물어보면 돼요.'
      :'다른 사람과 뜻을 맞추고 관계를 이어 가려는 면도 함께 살펴볼 부분이에요. 다만 좋은 분위기를 유지하려고 내키지 않는 대답까지 해야 하는 것은 아니에요. 동의하는 점과 아직 정하지 못한 점을 나누어 말해 보세요.';
  return {text,factIds:matches.map(item=>item.id),kinds:unique(matches.map(item=>item.value.kind))};
}
function checked(registry,ids) {
  const values=unique(ids);
  if(!values.length||values.some(id=>!registry.has(id)))fail();
  return values;
}
function card(registry,{id,label,title,paragraphs,factIds,codes,chapterId,ruleIds=[]}) {
  if(typeof title!=='string'||!title.trim()||paragraphs.length<4||paragraphs.some(text=>typeof text!=='string'||!text.trim()))fail();
  return {id,label,title,paragraphs,factIds:checked(registry,factIds),godCodes:[...codes],origin:ORIGIN,navGroup:'나는 어떤 사람일까',chapterId,ruleIds};
}

const CARD_DETAIL_GROUPS={
  'portrait-decisions':[['선택할 때 먼저 보는 것',[0,1]],['결정이 어려워지는 때',[2]],['생활에서 보일 수 있는 모습',[3]],['이렇게 말해 볼 수 있어요',[4]],['다음 선택에서 해 볼 일',[5]]],
  'portrait-relationships':[['사람에게 마음을 여는 방식',[0,1]],['내 마음과 다르게 전해지는 때',[2]],['생활에서 보일 수 있는 모습',[3]],['서로 편해지는 대화',[4]],['관계에서 먼저 해 볼 일',[5]]],
  'portrait-work':[['일을 맡았을 때의 강점',[0,1]],['잘하려다 부담이 커지는 때',[2]],['일하는 장면으로 보면',[3]],['역할을 맞추는 대화',[4]],['다음 일에서 해 볼 방법',[5]]],
  'portrait-pressure':[['부담을 느낄 때의 반응',[0,1]],['이런 상황을 떠올려 보세요',[2]],['주변에서 다르게 볼 수 있는 점',[3]],['무리하지 않고 말하는 방법',[4]],['부담을 나누는 첫 행동',[5]]],
  'portrait-adjustment':[['내 뜻과 다르게 보이는 부분',[0,1]],['오해가 생길 수 있는 장면',[2]],['마음을 가다듬는 방법',[3]],['내 뜻을 전하는 대화',[4]],['다음 대화에서 해 볼 일',[5]]],
};

export function buildPersonPortrait(input) {
  const registry=validate(input),{profile,chapters}=input;
  const entries=orderedEntries(profile);
  const anchors=choose(entries),first=VOICES[anchors[0]],second=anchors[1]?VOICES[anchors[1]]:null;
  const core=combined(...anchors),stem=STEMS[profile.dayMaster.hanja];
  const season=seasonFor(profile,chapters,registry),relations=relationsFor(profile);
  const coreIds=['natal.day-master','natal.scope',...idsFor(profile,anchors)];
  const portraitParagraphs=[
    first.brief+(second?' '+second.brief:''),
    second?core.bridge:first.decision+' '+stem.edge,
    stem.manner+' '+stem.reason,
    season?.text||first.stress+' '+first.misread,
  ];
  const relationCodes=choose(entries,['peer','expression','authority','resource','wealth']);
  const workCodes=choose(entries,['expression','authority','wealth','resource','peer']);
  const relationFirst=VOICES[relationCodes[0]],relationSecond=relationCodes[1]?VOICES[relationCodes[1]]:null;
  const workFirst=VOICES[workCodes[0]],workSecond=workCodes[1]?VOICES[workCodes[1]]:null;
  const relationPair=combined(...relationCodes),workPair=combined(...workCodes);
  const relationIds=['natal.day-master','natal.scope',...idsFor(profile,relationCodes)];
  const workIds=['natal.day-master','natal.scope',...idsFor(profile,workCodes)];
  const stressCodes=choose(entries,['authority','peer','resource','wealth','expression']);
  const stressFirst=VOICES[stressCodes[0]],stressSecond=stressCodes[1]?VOICES[stressCodes[1]]:null;
  const stressPair=combined(...stressCodes);
  const remainingCodes=unique(entries.map(entry=>entry.god.code)).filter(code=>!unique([...anchors,...relationCodes,...workCodes,...stressCodes]).includes(code));
  const adjustmentCodes=remainingCodes.length?unique([...remainingCodes,...anchors]).slice(0,2):anchors;
  const adjustFirst=VOICES[adjustmentCodes[0]],adjustSecond=adjustmentCodes[1]?VOICES[adjustmentCodes[1]]:null;
  const adjustPair=combined(...adjustmentCodes);
  const cards=[
    card(registry,{id:'portrait-decisions',label:'결정할 때 드러나는 나',title:TOPIC_VOICES[anchors[0]].titles[0],
      paragraphs:[first.decision+' '+first.why,second?second.decision+' '+second.why:stem.manner,
        stem.edge,scene('decisions',anchors),portraitConversation('decisions',anchors[0]),core.adjust],
      factIds:coreIds,codes:anchors,chapterId:'day-season',ruleIds:['portrait.pair.'+core.key]}),
    card(registry,{id:'portrait-relationships',label:'사람을 대할 때 드러나는 나',title:TOPIC_VOICES[relationCodes[0]].titles[1],
      paragraphs:[relationFirst.relationship,relationSecond?relationSecond.relationship:relationFirst.why,
        relationFirst.misread+(relations?' '+relations.text:''),scene('relationships',relationCodes),portraitConversation('relationships',relationCodes[0]),topicAction(relationCodes,'relationAction')],
      factIds:[...relationIds,...(relations?.factIds||[])],codes:relationCodes,chapterId:'relationships',ruleIds:['portrait.pair.'+relationPair.key]}),
    card(registry,{id:'portrait-work',label:'일을 맡았을 때 드러나는 나',title:TOPIC_VOICES[workCodes[0]].titles[2],
      paragraphs:[workFirst.work,workSecond?workSecond.work:stem.reason,
        workFirst.stress+' '+(workSecond?workSecond.misread:workFirst.misread),
        scene('work',workCodes),portraitConversation('work',workCodes[0]),topicAction(workCodes,'workAction')],
      factIds:workIds,codes:workCodes,chapterId:'work',ruleIds:['portrait.pair.'+workPair.key]}),
    card(registry,{id:'portrait-pressure',label:'잘하다가도 힘들어지는 이유',title:TOPIC_VOICES[stressCodes[0]].titles[3],
      paragraphs:[stressFirst.stress,stressSecond?stressSecond.stress:stressFirst.why,
        scene('pressure',stressCodes),stressFirst.misread+(stressSecond?' '+stressSecond.misread:''),
        portraitConversation('pressure',stressCodes[0]),
        stressFirst.action+(stressSecond?' '+stressSecond.action:'')],
      factIds:['natal.day-master','natal.scope',...idsFor(profile,stressCodes)],codes:stressCodes,chapterId:'natal-combined-themes',ruleIds:['portrait.pair.'+stressPair.key]}),
    card(registry,{id:'portrait-adjustment',label:'내 마음과 다르게 보이는 모습',title:TOPIC_VOICES[adjustmentCodes[0]].titles[4],
      paragraphs:[adjustFirst.brief+' '+adjustFirst.misread,
        adjustSecond?adjustSecond.brief+' '+adjustSecond.misread:stem.edge,
        scene('adjustment',adjustmentCodes),stem.reset,portraitConversation('adjustment',adjustmentCodes[0]),topicAction(adjustmentCodes,'explainAction')],
      factIds:['natal.day-master','natal.scope',...idsFor(profile,adjustmentCodes)],codes:adjustmentCodes,chapterId:'natal-combined-themes',ruleIds:['portrait.pair.'+adjustPair.key]}),
  ];
  const usedCodes=unique([...anchors,...cards.flatMap(value=>value.godCodes)]);
  const omittedCodes=unique(entries.map(entry=>entry.god.code)).filter(code=>!usedCodes.includes(code));
  // A complete description must not quietly omit a confirmed relationship.
  // Keep any remaining facet as an explicit connected paragraph, not a ranking.
  if(omittedCodes.length){
    const target=cards[4];
    target.paragraphs[1]+=' '+omittedCodes.map(code=>VOICES[code].brief+' '+VOICES[code].misread).join(' ');
    target.godCodes.push(...omittedCodes);
    target.factIds=checked(registry,[...target.factIds,...idsFor(profile,omittedCodes)]);
  }
  for(const item of cards)Object.assign(item,detailContent(CARD_DETAIL_GROUPS[item.id].map(([title,indexes])=>[title,indexes.map(index=>item.paragraphs[index])])));
  const factIds=checked(registry,[...coreIds,...(season?.factIds||[]),...cards.flatMap(value=>value.factIds)]);
  return {
    id:'person-portrait',title:'나는 어떤 사람일까',headline:'당신은 '+core.headline+'이에요.',
    ...detailContent([['나를 이해하는 첫 모습',portraitParagraphs.slice(0,2)],['평소 행동에 드러나는 성향',portraitParagraphs.slice(2)]]),cards,
    origin:ORIGIN,factIds,facts:factIds.map(id=>({...registry.get(id)})),
    anchorCodes:[...anchors],godCodes:unique(entries.map(entry=>entry.god.code)),
    methodNotice:'확정된 원국의 일간·십성, 이미 계산한 계절 관계와 합충에 공통 전통 의미를 연결한 설명이에요. 생활 장면과 두 성향을 이어 쓴 문장은 오쭈다가 작성한 공통 참고 해설이며, 실제 경험이나 성격 검사 결과가 아니에요. 같은 단서에는 같은 설명을 쓰고, 함께 확인된 다른 단서에 따라 문단을 조합해요. 글자 개수로 강약이나 대표 성격을 정하지 않아요.',
    selectionNotice:'첫 문장을 정리할 때는 확정된 월간과 일지 본기의 관계를 먼저 읽고, 같은 관계가 겹치면 다음 확정 자리로 이어 가요. 이는 읽는 순서이며 성격의 강약을 순위로 매긴 결과가 아니에요. 관계·일·부담 등 각 주제에서는 그 주제와 관련된 관계를 먼저 연결하고, 확인된 다른 관계도 남겨요.',
    scopeNotice:profile.complete?'':'확정되지 않은 출생 정보는 성향 풀이에 채워 넣지 않았어요.',
    ruleIds:unique([...(season?[season.ruleId]:[]),...cards.flatMap(value=>value.ruleIds)]),
  };
}
