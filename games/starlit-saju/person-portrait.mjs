import { getTenGod } from './fortune-data.mjs?v=20261114-saju-correction1';
import { detailContent, portraitConversation } from './general-detail-scenes.mjs?v=20261120-saju-voice1';
import { describeNatalContext } from './natal-context.mjs?v=20261120-saju-voice1';

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
    manner:'한 번 중요하다고 정한 일은 오래 붙들어요.',
    reason:'목표가 분명할수록 꾸준히 해내요. 계획을 바꿀 때도 남의 재촉보다 스스로 납득한 이유가 필요해요.',
    edge:'목표를 지키려다 불편한 방법까지 고집하기 쉬워요. 목표와 방법을 구분하는 것이 중요해요.',
    reset:'지킬 목표와 바꿀 방법을 따로 적으세요. 방법을 고치는 것도 목표를 이루는 과정이에요.',
  },
  乙:{
    manner:'상대와 상황을 살피고, 뜻을 이루는 방법은 유연하게 바꿔요.',
    reason:'같은 말도 누구에게 언제 꺼낼지 생각해요. 여러 사람의 바람을 듣고 함께할 방법을 찾는 것이 강점이에요.',
    edge:'대화를 이어 가려고 계속 맞추면 정작 내 바람을 말할 때를 놓쳐요.',
    reset:'대화하기 전에 꼭 원하는 한 가지를 정하세요. 그다음 서로 맞출 부분을 이야기하세요.',
  },
  丙:{
    manner:'생각과 기분을 말과 행동으로 표현해요.',
    reason:'사람들과 이야기하면서 생각을 정리해요. 관심 있는 일에는 반응이 빠르고, 주변 사람도 함께하기를 바라요.',
    edge:'내가 신난 만큼 상대도 준비됐다고 넘겨짚기 쉬워요. 함께할 일은 상대의 대답까지 듣고 정하세요.',
    reset:'의견을 말한 뒤에는 상대가 생각할 시간을 주세요. 답이 늦다면 언제 다시 이야기할지 물으세요.',
  },
  丁:{
    manner:'마음이 가는 사람과 일을 세심하게 챙겨요.',
    reason:'작은 표정과 말투의 차이까지 오래 기억해요. 많은 사람에게 넓게 관심을 두기보다 가까운 관계에 정성을 쏟아요.',
    edge:'작은 변화에 너무 오래 매달리면 상대의 말보다 내 짐작이 앞서요.',
    reset:'직접 본 일과 짐작한 뜻을 나누세요. 궁금한 점은 짧게 묻고 상대의 답을 들으세요.',
  },
  戊:{
    manner:'일이나 관계가 흔들려도 맡은 자리를 지켜요.',
    reason:'주변이 급해져도 하던 일을 이어 가는 끈기가 있어요. 방법을 바꾸려면 왜 바꿔야 하는지부터 충분히 이해하려 해요.',
    edge:'끝까지 버티려다 나눠 맡을 일까지 혼자 붙잡기 쉬워요.',
    reset:'직접 끝낼 일과 도움받을 일을 나누세요. 맡을 사람과 마감도 함께 정하세요.',
  },
  己:{
    manner:'말을 앞세우기보다 빠진 준비와 도움이 필요한 곳을 챙겨요.',
    reason:'일이 끊기지 않도록 필요한 것을 미리 살펴요. 결과 뒤에 가려진 작은 수고까지 꾸준히 맡는 것이 강점이에요.',
    edge:'내가 하는 게 빠르다는 이유로 계속 대신하면 부탁받지 않은 일까지 맡게 돼요.',
    reset:'도와줄 때는 맡을 범위와 끝낼 때를 함께 말하세요. 다음에도 필요한 일이라면 담당자를 따로 정하세요.',
  },
  庚:{
    manner:'문제가 생기면 남길 것과 고칠 것부터 정리해요.',
    reason:'이야기를 오래 주고받기보다 다음 행동을 분명히 정해요. 복잡한 일에서 우선순위를 잡는 것이 강점이에요.',
    edge:'상대가 속상한 마음을 말하는 중에도 해결책부터 꺼내기 쉬워요. 이때는 답보다 공감이 먼저예요.',
    reset:'방법을 제시하기 전에 지금 필요한 것이 공감인지 해결책인지 물으세요.',
  },
  辛:{
    manner:'작은 차이까지 살피고 납득할 만큼 결과를 다듬어요.',
    reason:'다른 사람이 지나친 부분도 꼼꼼히 확인해요. 완성도를 높이는 힘이 있지만, 끝낸 뒤에도 고칠 곳부터 찾는 경향이 있어요.',
    edge:'아쉬운 부분만 보면 이미 잘해 낸 일까지 낮게 평가하기 쉬워요.',
    reset:'꼭 끝낼 일과 나중에 다듬을 일을 처음부터 나누세요. 필수 항목을 끝냈다면 이번 작업은 마무리하세요.',
  },
  壬:{
    manner:'여러 사람의 의견을 듣고 다양한 방법을 비교해요.',
    reason:'일이 막히면 새 정보와 도움을 줄 사람을 찾아요. 다른 길을 발견하는 것이 강점이지만, 선택지가 늘수록 결정을 미루기 쉬워요.',
    edge:'더 좋은 방법만 찾다 보면 지금 시작할 수 있는 일도 늦어져요.',
    reset:'선택지를 몇 개로 좁히세요. 이번에 가장 중요한 조건 하나를 정하고 비교하세요.',
  },
  癸:{
    manner:'서둘러 답하기보다 작은 변화와 상대의 뜻을 먼저 살펴요.',
    reason:'말하기 전에 혼자 생각을 정리해요. 성급한 판단은 줄지만, 그 과정을 말하지 않으면 상대는 내가 무엇을 생각하는지 몰라요.',
    edge:'생각이 완벽해질 때까지 기다리면 내 바람과 불편함을 제때 전하기 어려워요.',
    reset:'지금까지 생각한 것부터 말하세요. 시간이 더 필요하다면 언제 다시 답할지도 알려 주세요.',
  },
};

// Each row describes one observed relationship, not one finished person type.
// Different cards connect different confirmed rows, the natal day stem, the
// existing season rule and every matching natal combination/clash.
const VOICES={
companion:{group:'peer',brief:'스스로 고른 일에는 적극적이고, 이유 없이 따르라는 말에는 답답함을 느껴요.',
    headline:'스스로 납득한 답을 고르는 사람',
    decision:'추천을 듣더라도 마지막 선택은 내 이유로 결정해요.',
    why:'결과만큼 직접 판단했다는 느낌이 중요해요. 선택할 여지가 없으면 하고 싶은 마음도 줄어요.',
    relationship:'가까운 사이에도 내 생각과 시간을 존중받고 싶어 해요. 자주 연락하는 것만큼 서로의 선택을 믿어 주는 태도를 중요하게 봐요.',
    work:'맡은 일을 내 방식으로 책임 있게 이끄는 것이 강점이에요. 작은 단계마다 허락을 받아야 하는 환경은 답답하게 느껴요.',
    stress:'이유를 설명했는데도 남이 내 선택을 대신 정하면 답답함이 커져요.',
    misread:'“내가 정할게”라는 말만 짧게 하면 상대의 의견을 거절하는 말처럼 들리기 쉬워요.',
    action:'상대의 의견에서 받아들인 점을 먼저 말하세요. 그다음 직접 정하고 싶은 부분을 설명하세요.',
  },
  competitor:{group:'peer',brief:'함께 힘을 보태는 데 적극적이고, 수고를 공평하게 나누는지도 살펴요.',
    headline:'협력하면서도 자기 몫을 지키는 사람',
    decision:'누가 얼마나 준비하고 무엇을 맡는지 먼저 확인해요.',
    why:'함께 만들었다는 느낌과 서로 비슷하게 애쓴다는 느낌이 중요해요. 내 수고가 당연한 몫이 되면 서운함이 쌓여요.',
    relationship:'서로 시간과 정성을 쓰는 관계를 편하게 느껴요. 한쪽만 계속 애쓰는 관계에서는 공평하게 나눌 방법을 찾으려 해요.',
    work:'동료와 역할을 나누고 함께 결과를 만드는 것이 강점이에요. 내 수고가 드러나지 않으면 일의 양보다 인정받지 못한 점이 더 마음에 남아요.',
    stress:'내가 더 준비했는데 수고가 드러나지 않거나 남의 빈자리를 계속 메울 때 불편함이 쌓여요.',
    misread:'공평하게 나누자는 말이 작은 일까지 계산하는 태도로 들리기 쉬워요.',
    action:'시작할 때 누가 무엇을 언제까지 할지 정하세요. 준비와 뒷정리도 역할에 넣으세요.',
  },
  creator:{group:'expression',brief:'마음을 말로만 전하지 않고 챙기고 만들고 반복하는 행동으로 보여 줘요.',
    headline:'작은 행동을 꾸준히 쌓아 마음을 보여 주는 사람',
    decision:'긴 설명보다 작은 일이라도 직접 해 본 경험을 믿어요.',
    why:'손으로 해 보고 결과가 남아야 생각이 구체적으로 정리돼요. 한 번 크게 드러내기보다 반복하며 익숙해지는 과정에 힘을 써요.',
    relationship:'안부를 묻고 필요한 것을 챙기는 작은 행동으로 마음을 전해요. 그 행동에 담긴 마음도 말해 줘야 정성이 제대로 전해져요.',
    work:'직접 만들고 고치며 완성하는 것이 강점이에요. 꾸준히 작업할 시간이 필요하고, 시작만 반복하는 일에는 답답함을 느껴요.',
    stress:'정성껏 끝낸 일을 당연하게 여기고 다음 결과만 요구하면 지치기 쉬워요.',
    misread:'말없이 계속 챙기면 상대는 부담 없이 하는 일로 받아들이기 쉬워요.',
    action:'어떤 마음으로 했는지 한 문장으로 알려 주세요. 쉴 시간과 상대가 맡을 일도 분명히 말하세요.',
  },
  critic:{group:'expression',brief:'앞뒤가 맞지 않는 말이나 불편한 절차를 보면 이유를 묻고 고칠 점을 찾아요.',
    headline:'불편한 이유를 찾아 자기 말로 표현하는 사람',
    decision:'늘 해 오던 방식이라는 설명보다 왜 그 방법이어야 하는지가 중요해요.',
    why:'불편한 점을 찾아 더 나은 방법으로 바꾸는 데 관심이 많아요. 이유를 알면 움직이고, 설명 없이 따르라는 말에는 질문부터 나와요.',
    relationship:'좋아하는 사람에게도 불편한 점을 솔직히 말해요. 관계를 잘 이어 가려는 말이어도 지적부터 꺼내면 고마운 마음이 가려져요.',
    work:'반복되는 실수와 불편한 절차를 찾아 고치는 것이 강점이에요. 의견을 시험할 기회가 있을 때 적극적으로 움직여요.',
    stress:'더 나은 방법이 보이는데 질문하거나 바꿀 기회가 없으면 말이 날카로워지기 쉬워요.',
    misread:'문제만 짚으면 상대의 노력까지 부정하는 말처럼 들리기 쉬워요.',
    action:'잘된 부분을 먼저 짚고 바꿀 한 가지만 말하세요. 작은 수정 예시도 함께 보여 주세요.',
  },
  opportunist:{group:'wealth',brief:'새로운 사람이나 방법을 보면 지금 하려는 일과 연결할 길을 찾아요.',
    headline:'사람과 기회를 연결해 일을 시작하는 사람',
    decision:'사람·시간·비용을 다르게 조합하며 가능한 방법을 비교해요.',
    why:'지금 가진 것에만 머무르지 않고 필요한 사람과 준비물을 찾아요. 새 방법을 빨리 찾는 만큼 실제로 맡을 시간도 확인해야 해요.',
    relationship:'호감을 말로 표현하고 함께할 일과 만날 자리도 만들어요. 약속을 늘릴 때는 한 사람에게 충분히 쓸 시간부터 남겨 두세요.',
    work:'필요한 사람과 자료를 연결해 일을 시작하는 것이 강점이에요. 시작한 뒤에는 진행 상황을 확인할 날짜까지 정해야 마무리가 돼요.',
    stress:'좋은 제안이 겹치면 하나를 놓치기 아쉬워 약속을 너무 많이 잡기 쉬워요.',
    misread:'관심을 보인 말을 상대가 이미 결정한 약속으로 받아들이기 쉬워요.',
    action:'관심 있는 일과 실제로 맡을 일을 나누어 말하세요. 시간과 비용을 확인한 뒤 답하세요.',
  },
  manager:{group:'wealth',brief:'맡은 일과 가진 것을 빠뜨리지 않도록 꾸준히 확인해요.',
    headline:'작은 약속과 생활을 차근차근 지키는 사람',
    decision:'좋아 보이는 느낌보다 실제 비용과 반복해서 할 일을 먼저 따져요.',
    why:'시작한 뒤에도 꾸준히 감당할 수 있는지가 중요해요. 작은 지출과 일정까지 챙기고, 준비가 갖춰져야 마음을 놓아요.',
    relationship:'연락과 약속이 꾸준히 이어질 때 신뢰를 쌓아요. 다정한 말만큼 실제로 지킨 행동을 중요하게 봐요.',
    work:'빠진 항목을 확인하고 정한 일을 끝까지 챙기는 것이 강점이에요. 새 일을 늘리기 전에 현재 일정과 준비물부터 확인해요.',
    stress:'약속이 계속 바뀌거나 담당자가 불분명하면 내가 모두 확인해야 한다는 부담을 느껴요.',
    misread:'조건을 꼼꼼히 묻는 말이 처음부터 반대하는 태도로 들리기 쉬워요.',
    action:'시작에 꼭 필요한 조건부터 확인하세요. 나중에 알아도 되는 항목은 따로 적고 준비가 끝난 일부터 시작하세요.',
  },
  challenger:{group:'authority',brief:'어려운 문제가 생기면 해결할 순서를 정하고 움직여요.',
    headline:'어려운 일에 집중하고 책임도 무겁게 느끼는 사람',
    decision:'문제를 미뤄 두기보다 먼저 해결할 일을 정해요.',
    why:'해야 할 일과 책임질 대상이 분명할 때 집중해요. 급한 일을 해내는 힘이 있지만, 끝난 뒤에도 긴장을 풀기 어려워요.',
    relationship:'가까운 사람이 힘들어하면 해결 방법부터 찾아요. 든든한 도움이 되려면 상대가 원하는 도움부터 물어야 해요.',
    work:'기한과 해결할 문제가 분명할 때 집중하는 것이 강점이에요. 필요한 인원과 시간을 말하지 않고 혼자 버티면 부담만 커져요.',
    stress:'남의 문제까지 내 책임으로 받아들이면 한 일을 끝내고도 다음 문제를 찾느라 쉬기 어려워요.',
    misread:'도우려는 마음으로 방법을 계속 정해 주면 상대에게는 지시처럼 들리기 쉬워요.',
    action:'끝낼 범위와 기한을 정할 때 필요한 도움도 말하세요. 끝낸 일은 다음 확인 날짜까지 내려놓으세요.',
  },
  officer:{group:'authority',brief:'한 번 한 약속과 맡은 역할을 끝까지 지키려 해요.',
    headline:'약속을 지키며 신뢰를 쌓는 사람',
    decision:'내가 원하는 일과 이미 정한 약속이 어긋나는지 먼저 확인해요.',
    why:'내 선택이 다른 사람에게 어떤 책임으로 이어지는지 생각해요. 기대를 저버리기 싫어 내키지 않는 부탁까지 받기 쉬워요.',
    relationship:'말과 행동이 같고 서로 지킬 약속이 분명할 때 편안해져요. 관계가 모호하게 이어지면 확실한 답을 원해요.',
    work:'기준과 책임이 정해진 일을 꼼꼼하게 마무리하는 것이 강점이에요. 평가 기준이 자주 바뀌면 필요 이상으로 자신을 점검하기 쉬워요.',
    stress:'실수하면 안 된다는 생각이 강해지면 작은 지적도 자신의 능력 전체에 대한 평가로 받아들이기 쉬워요.',
    misread:'규칙부터 말하면 상대의 사정은 들을 생각이 없다는 뜻처럼 들리기 쉬워요.',
    action:'부탁에 답하기 전에 지금 맡은 일과 가능한 날짜를 말하세요. 지킬 수 있는 약속을 하세요.',
  },
  explorer:{group:'resource',brief:'익숙한 설명도 납득할 때까지 다른 각도로 살펴요.',
    headline:'쉽게 넘기지 않고 자기만의 이유를 찾는 사람',
    decision:'널리 알려진 답인지보다 그 이유를 이해하는지가 중요해요.',
    why:'표면의 답에서 멈추지 않고 다른 관점과 숨은 조건을 찾아요. 깊이 알아보는 힘이 있지만, 정리하는 동안에는 말수가 줄어요.',
    relationship:'자주 만나는 것만큼 생각을 깊게 나누는 대화를 중요하게 봐요. 혼자 정리할 시간이 필요하면 그 이유도 알려 주세요.',
    work:'자료를 찾아 원인을 밝히고 다른 방법을 설명하는 것이 강점이에요. 조사할 범위를 정하지 않으면 실행이 뒤로 밀려요.',
    stress:'아직 답이 덜 정리됐다는 생각에 질문하거나 시험할 때를 미루기 쉬워요.',
    misread:'혼자 생각하느라 조용한 모습이 관심 없다는 태도로 보이기 쉬워요.',
    action:'가장 궁금한 질문 하나를 고르고 확인할 작은 행동부터 하세요. 답을 기다리는 사람에게는 다시 이야기할 때를 알려 주세요.',
  },
  scholar:{group:'resource',brief:'먼저 이해하고 준비한 뒤 배운 것을 차근차근 익혀요.',
    headline:'기본을 이해하고 준비를 쌓는 사람',
    decision:'설명을 듣고 기본을 확인한 뒤 선택해요.',
    why:'어디서 시작해야 하는지 알아야 마음이 놓여요. 배움과 도움을 잘 받아들이지만, 준비가 완벽해지기를 기다리면 시작이 늦어져요.',
    relationship:'내 말을 끝까지 듣고 이유를 설명해 주는 사람에게 마음을 열어요. 서로 돌보는 관계를 좋아해도 모든 부탁을 받아 줄 필요는 없어요.',
    work:'기본을 익히고 자료를 정리해 쉽게 전하는 것이 강점이에요. 배운 내용을 직접 해 볼 시간이 있어야 경험이 쌓여요.',
    stress:'더 배워야 한다는 생각만 커지면 이미 아는 것까지 부족하게 보고 결정을 남에게 맡기기 쉬워요.',
    misread:'조언을 자주 구하면 스스로 정하지 못한다는 인상을 주기 쉬워요.',
    action:'설명을 들었다면 바로 해 볼 행동 하나를 정하세요. 아는 것부터 시작하고 막힌 부분만 다시 물으세요.',
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
    titles:["내가 납득한 이유로 선택해요","가까워도 내 선택은 존중받고 싶어요","방법을 맡겨 주면 책임 있게 움직여요","내가 정할 여지가 없으면 답답해요","스스로 판단하고 싶은 마음이 강해요"],
    decisions:"좋다는 설명을 듣고도 내가 정할 수 있는 부분부터 물을 거예요.",
    relationships:"함께 가는 것은 반갑지만 꼭 가고 싶은 곳 한 군데는 직접 고르고 싶을 거예요.",
    work:"맡은 부분의 순서와 방법을 직접 정할 때 의욕이 생겨요. 작은 수정까지 허락받아야 한다면 답답하게 느낄 거예요.",
    pressure:"일이 늘어난 것보다 내 의사를 묻지 않고 일정을 정한 점이 더 불편할 거예요.",
    adjustment:"“내가 알아서 정할게”라고 답하면 친구는 의견을 내지 말라는 뜻으로 듣기 쉬워요.",
    relationAction:"같이 정할 부분과 각자 정할 부분을 나누어 말하세요.",
    workAction:"무엇을 언제까지 만들지 함께 정하세요. 순서와 방법은 직접 골라도 되는지 확인하세요.",
    explainAction:"받아들인 의견을 먼저 말하고 직접 판단할 부분을 덧붙이세요.",
  },
  competitor:{
    titles:["함께할수록 역할을 공평하게 나눠요","서로 비슷하게 마음을 써야 편해요","함께 낸 결과에 내 수고도 드러나야 해요","내 수고가 당연해지면 서운해요","서로의 수고를 공평하게 나누고 싶어요"],
    decisions:"누가 무엇을 준비하고 어느 정도 맡는지부터 확인할 거예요.",
    relationships:"예약과 이동 준비를 한 사람만 계속 맡지 않도록 나누는 일을 중요하게 볼 거예요.",
    work:"아이디어는 함께 냈어도 준비가 내게만 몰리면 불공평하게 느낄 거예요.",
    pressure:"같은 사람이 계속 빠진다면 일의 양보다 약속을 지키지 않은 점이 더 마음에 남을 거예요.",
    adjustment:"“누가 얼마나 맡아?”라는 질문만 꺼내면 친구는 손해부터 따지는 말로 듣기 쉬워요.",
    relationAction:"다음 약속에서 서로 맡을 준비를 구체적으로 정하세요.",
    workAction:"담당자와 할 일을 함께 볼 수 있게 적으세요. 새 일을 받으면 기존 일의 마감도 조정하세요.",
    explainAction:"함께 오래하려면 어떤 역할을 나눠야 하는지 말하세요.",
  },
  creator:{
    titles:["작게라도 해 봐야 답이 생겨요","작은 행동으로 마음을 전해요","반복해서 다듬은 결과로 말해요","남을 챙기다 쉴 시간을 놓쳐요","말하지 않은 정성은 드러나기 어려워요"],
    decisions:"짧게 체험한 뒤 계속하고 싶은지 직접 판단하려 할 거예요.",
    relationships:"친구가 좋아하던 음식이나 장소를 기억해 일정에 넣으며 마음을 전할 거예요.",
    work:"설명을 더 나누기보다 초안을 만들고 읽기 어려운 부분을 고쳐 갈 거예요.",
    pressure:"내가 쉬면 일이 멈출까 걱정해 쉬어야 한다는 말을 늦추기 쉬운 장면이에요.",
    adjustment:"고민 끝에 작은 시안을 만들어도 과정을 말하지 않으면 친구는 금방 할 수 있는 일로 생각하기 쉬워요.",
    relationAction:"챙긴 행동에 담긴 마음을 짧게 말하세요. 쉬어야 할 때는 대신 맡아 줄 일도 부탁하세요.",
    workAction:"처음 만들 시간과 고칠 시간을 나누세요. 이번에 끝낼 범위도 미리 정하세요.",
    explainAction:"신경 쓴 부분과 걸린 시간을 짧게 알려 주세요.",
  },
  critic:{
    titles:["이유를 알아야 마음이 움직여요","잘 지내고 싶어서 불편한 점도 말해요","익숙한 방법에서도 고칠 곳을 찾아요","질문을 막으면 말이 날카로워져요","더 잘하고 싶은 마음이 지적으로 들려요"],
    decisions:"왜 그 방법이어야 하는지 묻고 불편한 절차를 바꿀 수 있는지 확인할 거예요.",
    relationships:"돌아가는 길이나 모호한 약속이 보이면 다른 방법을 제안할 거예요. 먼저 고마움을 전해야 준비한 친구에게 지적만 남지 않아요.",
    work:"헷갈리는 표현과 반복 작업을 찾아 고칠 거예요. 의견을 말할 수 없다면 자료보다 일하는 방식이 답답할 거예요.",
    pressure:"빈자리를 메우면서 같은 문제가 반복되는 이유도 짚고 싶을 거예요. 당장 끝내려는 사람과는 이야기할 순서부터 맞추세요.",
    adjustment:"실패할 부분부터 짚으면 친구는 생각 전체를 부정당한 듯 느끼기 쉬워요.",
    relationAction:"고마운 점을 먼저 전하고 바꾸고 싶은 행동 하나를 말하세요.",
    workAction:"고칠 이유와 수정 예시를 함께 보여 주세요. 바꾼 뒤 무엇이 좋아졌는지도 확인하세요.",
    explainAction:"좋게 본 점을 먼저 말하고 고칠 방법을 구체적으로 짚으세요.",
  },
  opportunist:{
    titles:["사람과 방법을 연결해 선택을 넓혀요","같이 할 일을 만들며 가까워져요","필요한 사람과 자료를 찾아요","좋은 제안이 많으면 약속도 늘어요","관심을 보인 말이 약속으로 들려요"],
    decisions:"함께할 사람과 다른 방법을 찾아 선택지를 넓힐 거예요.",
    relationships:"괜찮은 장소와 함께 어울릴 사람을 떠올리며 약속을 만들 거예요. 제안한 뒤에는 실제로 가능한 시간도 확인하세요.",
    work:"자료와 잘 아는 사람을 연결해 일을 진행할 거예요. 새 아이디어를 더할 때마다 작업 범위도 다시 확인하세요.",
    pressure:"다른 사람에게 연락하거나 새 방법을 찾으며 해결하려 할 거예요. 그 연락과 일정 조율에 필요한 시간도 남겨 두세요.",
    adjustment:"“재미있겠다”는 말 뒤에 여러 방법을 덧붙이면 친구는 함께하기로 정한 줄 알기 쉬워요.",
    relationAction:"함께하고 싶은 마음과 실제로 가능한 날짜를 나누어 말하세요.",
    workAction:"이번에 넣을 제안과 다음에 검토할 제안을 나누세요. 진행 상황을 확인할 날짜도 정하세요.",
    explainAction:"참여를 정한 것인지 조건을 알아보는 중인지 분명히 덧붙이세요.",
  },
  manager:{
    titles:["계속 감당할 수 있어야 선택해요","다정한 말만큼 지킨 약속을 봐요","빠진 항목까지 꼼꼼히 확인해요","놓친 부분을 혼자 계속 확인해요","거절하려는 게 아니라 조건을 묻는 거예요"],
    decisions:"처음 드는 돈과 다음 달에도 필요한 시간·비용을 확인한 뒤 정할 거예요.",
    relationships:"좋은 장소라는 설명에 더해 실제 이동 시간과 비용을 알아야 마음 편히 약속할 거예요.",
    work:"빠진 내용과 필요한 비용, 마무리 날짜를 챙겨 실제로 쓸 수 있는 자료를 만들 거예요.",
    pressure:"빠진 부분을 채운 뒤에도 다른 누락이 없는지 확인하느라 마무리가 늦어지기 쉬운 장면이에요.",
    adjustment:"시간과 비용만 계속 물으면 친구는 거절할 이유를 찾는다고 오해하기 쉬워요.",
    relationAction:"함께하고 싶은 마음부터 말한 뒤 날짜와 비용처럼 필요한 조건을 물으세요.",
    workAction:"마지막 확인 항목과 끝낼 시간을 정하세요. 새 수정이 생겨도 필요한 부분만 다시 확인하세요.",
    explainAction:"하고 싶은 마음과 아직 확인할 조건을 함께 말하세요.",
  },
  challenger:{
    titles:["문제가 보이면 해결 순서부터 정해요","힘들다는 말을 들으면 방법부터 찾아요","풀어야 할 일이 분명할 때 집중해요","일이 끝나도 책임을 내려놓기 어려워요","도우려는 말이 지시처럼 들려요"],
    decisions:"가장 어려운 점과 먼저 해결할 일을 알아본 뒤 참여할 방법을 찾을 거예요.",
    relationships:"예약이나 일정이 막히면 대안을 찾아 해결하려 할 거예요. 직접 움직이기 전에 상대가 원하는 방법도 물으세요.",
    work:"마감이 가까운데 초안이 비었다면 문제를 나누고 급한 부분부터 맡을 거예요.",
    pressure:"직접 하면 빨리 끝난다는 생각에 급한 일을 맡고, 끝난 뒤에도 남은 문제를 살피려 할 거예요.",
    adjustment:"도우려고 순서를 정해 줘도 친구는 자신의 선택을 대신 정했다고 느끼기 쉬워요.",
    relationAction:"이야기를 들어 주길 원하는지 방법을 함께 찾길 원하는지 먼저 물으세요.",
    workAction:"맡을 범위와 필요한 도움을 말하세요. 급한 일을 끝냈다면 원래 담당자에게 역할을 돌려 주세요.",
    explainAction:"필요한 도움을 먼저 묻고 최종 선택은 상대에게 맡기세요.",
  },
  officer:{
    titles:["내 선택이 약속과 맞는지 확인해요","분명한 약속에서 마음을 놓아요","기준을 지켜 믿고 맡길 결과를 만들어요","작은 실수도 내 책임처럼 느껴요","약속을 지키려는 말이 엄격하게 들려요"],
    decisions:"하고 싶어도 이미 한 약속과 겹치지 않는지 확인한 뒤 답할 거예요.",
    relationships:"정한 시간을 지키고, 바뀌면 미리 알리는 것을 중요하게 볼 거예요.",
    work:"필수 내용과 약속한 기준을 챙길 거예요. 기준이 뒤늦게 바뀌면 내 준비가 잘못된 것처럼 받아들이기 쉬워요.",
    pressure:"담당자가 아니어도 마감을 지켜야 한다는 생각에 내 일정을 바꿔 맞추려 할 거예요.",
    adjustment:"기존 약속만 먼저 확인하면 친구는 새 생각을 들어 볼 마음이 없다고 느끼기 쉬워요.",
    relationAction:"상대의 사정을 먼저 들으세요. 지킬 약속과 바꿀 약속을 함께 정하세요.",
    workAction:"끝낼 내용과 내 담당 범위를 확인하세요. 일이 늘면 마감도 다시 정하세요.",
    explainAction:"약속을 지키려는 이유와 조정할 수 있는 부분을 함께 말하세요.",
  },
  explorer:{
    titles:["알려진 답에서도 이유를 찾아요","깊은 대화와 혼자 생각할 시간이 필요해요","남들이 지나친 원인까지 찾아요","더 알아보는 동안 시작이 늦어져요","생각 중인 침묵이 무관심으로 보여요"],
    decisions:"좋다는 평가를 듣고도 다른 설명과 숨은 조건을 확인할 거예요.",
    relationships:"모두가 좋다는 장소라도 이유를 알아본 뒤 내 의견을 정리할 거예요.",
    work:"같은 질문이 반복되는 이유를 찾아 설명 순서를 고칠 거예요. 조사할 범위를 정하고 초안을 낼 날짜도 잡으세요.",
    pressure:"원인을 살피는 동안 주변에서는 아무것도 하지 않는다고 오해하기 쉬워요. 지금 확인 중인 내용을 알려 주세요.",
    adjustment:"조용히 다른 방법을 생각해도 친구는 관심이 없어 답을 피한다고 느끼기 쉬워요.",
    relationAction:"생각할 시간이 필요하다고 말하고 언제 다시 이야기할지 정하세요.",
    workAction:"자료에서 답할 질문을 좁히세요. 작은 초안을 만든 뒤 남은 질문을 확인하세요.",
    explainAction:"지금 궁금한 점과 다시 답할 때를 먼저 알려 주세요.",
  },
  scholar:{
    titles:["기본을 이해하면 시작이 편해요","끝까지 듣는 사람에게 마음을 열어요","배운 내용을 알기 쉽게 정리해요","준비가 부족하다는 생각에 답을 미뤄요","확인하려는 질문이 자신 없음으로 보여요"],
    decisions:"시작하는 순서와 기본 예시를 알아야 마음 편히 참여할 거예요.",
    relationships:"잘 아는 친구의 설명을 듣고 모르는 조건을 확인한 뒤 계획을 정할 거예요.",
    work:"기존 자료를 익힌 뒤 처음 읽는 사람도 따라갈 수 있게 정리할 거예요.",
    pressure:"대신 맡아도 잘할지 확인하고 싶어 이미 아는 일에서도 주변의 답을 기다리기 쉬운 장면이에요.",
    adjustment:"이해한 내용을 확인하려는 질문이어도 친구는 결정까지 맡기는 뜻으로 듣기 쉬워요.",
    relationAction:"조언을 들은 뒤 직접 정한 부분도 말하세요. 도움이 필요한 질문은 따로 하세요.",
    workAction:"필수 내용을 확인했다면 작은 결과부터 보여 주세요. 그 결과를 보며 부족한 부분을 물으세요.",
    explainAction:"정한 부분과 도움받을 부분을 나누어 말하세요.",
  },
};

function scene(topic,codes) {
  return TOPICS[topic]+' '+codes.map(code=>TOPIC_VOICES[code][topic]).join(' ');
}
function topicAction(codes,key) {
  return codes.map(code=>TOPIC_VOICES[code][key]).join(' ');
}

const PAIRS={
  "peer-expression":{headline:"자기 생각을 말과 행동으로 보여 주는 사람",bridge:"의견을 표현할 자리가 있어야 의욕이 생겨요. 관계를 지키려고 계속 참으면 말이 거칠어지거나 일을 놓고 싶어지기 쉬워요.",adjust:"원하는 결과를 먼저 말하세요. 그다음 상대가 이해하기 쉬운 표현을 고르세요."},
  "peer-wealth":{headline:"스스로 선택하고 시간과 비용도 챙기는 사람",bridge:"직접 결정하고 싶은 마음과 시간·비용을 챙기는 마음이 함께 있어요. 하고 싶은 일이어도 누가 정하고 누가 부담하는지가 분명해야 시작이 편해요.",adjust:"직접 정할 부분과 함께 정할 부분을 나누세요. 각자 부담할 시간과 비용도 확인하세요."},
  "peer-authority":{headline:"스스로 결정하고 맡은 약속은 지키는 사람",bridge:"남이 선택을 대신하는 것은 답답하지만 맡은 일에서는 기대를 저버리고 싶지 않아요. 그래서 부담이 커도 거절하지 못하고 계속하는 경향이 있어요.",adjust:"부탁을 받으면 가능한 방법과 기한부터 제안하세요. 감당할 수 있는 범위에서 약속하세요."},
  "peer-resource":{headline:"조언을 듣고 마지막 판단은 직접 하는 사람",bridge:"충분히 이해한 뒤 직접 정하고 싶어 해요. 도움은 반갑지만 조언한 사람이 결정까지 대신하면 거리를 두려 해요.",adjust:"조언에서 받아들인 점을 말하세요. 마지막으로 직접 결정할 부분도 알려 주세요."},
  "expression-wealth":{headline:"생각을 실제로 쓰이는 결과로 만드는 사람",bridge:"만드는 즐거움과 실제 쓰임을 모두 중요하게 봐요. 재미있는 생각을 떠올리는 데서 끝내지 않고 누가 어떻게 쓸지 확인하려 해요.",adjust:"만들 것 하나와 필요한 시간·비용을 정하세요. 첫 결과를 확인한 뒤 규모를 늘리세요."},
  "expression-authority":{headline:"자기 방식과 맡은 책임을 함께 챙기는 사람",bridge:"자유롭게 표현하고 싶어도 약속한 기준은 지키려 해요. 더 나은 방법이 떠올랐을 때 규칙과 평가가 마음에 걸려 망설이기 쉬워요.",adjust:"바꿔도 되는 방법과 꼭 지킬 기준을 먼저 확인하세요. 그 안에서 작은 개선을 보여 주세요."},
  "expression-resource":{headline:"배운 것을 자기 말과 솜씨로 바꾸는 사람",bridge:"이해한 것을 직접 표현해야 배웠다는 실감이 나요. 설명을 듣고 내 말로 다시 풀거나 작은 결과를 만들며 익혀요.",adjust:"읽거나 들은 뒤 한 문장으로 설명하세요. 작은 결과를 만들고 막힌 부분만 질문하세요."},
  "wealth-authority":{headline:"생활과 맡은 책임을 꼼꼼히 챙기는 사람",bridge:"시간과 비용을 따지면서 맡은 약속도 지키려 해요. 누락을 끝까지 챙기는 것이 강점이지만 모든 일을 내 책임으로 받으면 쉬기 어려워요.",adjust:"직접 확인할 항목과 다른 사람의 담당을 나누세요. 마지막 확인 날짜도 정하세요."},
  "wealth-resource":{headline:"충분히 알아보고 쓸 곳까지 따지는 사람",bridge:"설명을 이해하는 일과 실제 쓰임을 모두 중요하게 봐요. 배운 내용을 생활에 적용하는 것이 강점이지만 조건을 계속 더 찾으면 결정이 늦어져요.",adjust:"꼭 알아야 할 조건 세 가지를 정하세요. 확인한 뒤 작은 범위부터 시작하세요."},
  "authority-resource":{headline:"이해한 일을 책임 있게 해내는 사람",bridge:"기본을 배우는 성실함과 잘해 내야 한다는 책임감이 함께 있어요. 모르는 점을 보이기 싫어 질문을 늦추기 쉬워요.",adjust:"할 수 있는 일과 확인할 일을 나누어 말하세요. 막힌 부분은 일찍 질문하세요."},
};
const SAME_GROUP={
  "peer":{headline:"자기 선택과 서로의 공평함을 지키는 사람",bridge:"직접 정하고 싶은 마음과 서로의 기여를 살피는 마음이 함께 있어요. 가까운 사이일수록 한쪽만 계속 맞추고 있지는 않은지 생각해요.",adjust:"양보할 부분과 상대에게 부탁할 부분을 각각 말하세요."},
  "expression":{headline:"생각을 말과 결과로 보여 주는 사람",bridge:"꾸준히 만드는 힘과 더 나은 방법을 찾는 마음이 함께 있어요. 익숙한 작업도 불편한 점이 보이면 고치고 싶어 해요.",adjust:"유지할 방법과 바꿀 방법을 하나씩 정하세요. 지금 작업을 끝낸 뒤 새 방법을 시험하세요."},
  "wealth":{headline:"새로운 쓰임을 찾고 실제 관리도 챙기는 사람",bridge:"새 제안을 반기면서도 유지 비용과 기존 계획을 함께 따져요. 시작의 즐거움과 계속할 부담을 모두 중요하게 보는 성향이에요.",adjust:"기존 생활에 필요한 돈과 시간을 먼저 남기세요. 새 일에 쓸 몫은 따로 정하세요."},
  "authority":{headline:"문제를 해결하고 약속을 지키는 사람",bridge:"어려운 일에 집중하면서 정한 기준도 지키려 해요. 급한 일을 끝낸 뒤에도 놓친 것이 없는지 확인하느라 긴장을 풀기 어려워요.",adjust:"일이 끝났다고 볼 기준과 마지막 확인 날짜를 정하세요. 끝난 뒤에는 담당을 내려놓으세요."},
  "resource":{headline:"기본을 익히고 다른 이유도 깊이 찾는 사람",bridge:"기초부터 배우면서 익숙한 설명도 다른 각도로 살펴요. 깊이 이해하는 것이 강점이지만 여러 생각을 한꺼번에 말하면 설명이 길어져요.",adjust:"가장 중요한 답을 먼저 말하세요. 이유는 두 가지 정도로 정리하세요."},
};
const SEASONS={
  same:'같은 목표를 가진 사람과 일하더라도 구체적인 방법은 직접 납득해야 편해요. 남이 먼저 해 본 방법이라는 이유만으로 따르기보다, 내 기준으로 괜찮은지 확인하려는 마음이 있어요.',
  output:'생각을 말하거나 직접 만들어 보여 줄 때 의욕이 살아나요. 배운 것만 쌓지 말고 작은 결과로 꺼내 보세요.',
  wealth:'하고 싶은 일이 생기면 실제로 언제 하고 무엇이 필요한지까지 생각해요. 막연히 좋다는 설명보다 생활 속에서 감당할 조건이 구체적일 때 움직이기 쉬워요.',
  authority:'내 바람만큼 주변에서 기대하는 역할도 생각해요. 직접 원하는 일과 기대에 맞추려고 맡은 일을 구분해야 내 시간을 지킬 수 있어요.',
  resource:'낯선 일은 설명을 듣고 이해한 뒤 시작해요. 준비가 길어지면 기본부터 작게 해 보세요. 직접 막힌 부분을 알아야 다음 질문도 분명해져요.',
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
  return {text:SEASONS[rule.id.slice('natal.season.'.length)],factIds:[...rule.factIds],ruleId:rule.id,key:rule.id.slice('natal.season.'.length)};
}
function relationsFor(profile) {
  const matches=profile.interactions.map((value,index)=>({value,id:'natal.interaction.'+index}));
  const combine=matches.filter(item=>item.value.kind!=='branch-clash');
  const clash=matches.filter(item=>item.value.kind==='branch-clash');
  if(!matches.length)return null;
  const text=combine.length&&clash.length
    ?'관계를 이어 가고 싶어도 서로의 요구가 다르면 무리해서 맞추기 어려워요. 예를 들어 처음에는 좋다고 했다가 부담이 커져 마음이 달라지는 상황을 생각해 보세요. 처음부터 괜찮은 부분과 어려운 부분을 나누어 말하세요.'
    :clash.length
      ?'서로 다른 부탁이 겹치면 우선순위를 정하는 것이 중요해요. 예를 들어 두 약속의 시간이 겹쳤다고 해 볼게요. 먼저 지킬 약속을 정하고 다른 약속은 시간을 조정하세요.'
      :'다른 사람과 뜻을 맞추고 관계를 이어 가려는 마음도 있어요. 동의하는 점은 분명히 말하세요. 아직 정하지 못한 부분까지 좋다고 답할 필요는 없어요.';
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
  'portrait-decisions':[['선택할 때 먼저 보는 것',[0,1]],['결정이 어려워지는 때',[2]],['생활 속 예시',[3]],['이렇게 말하세요',[4]],['다음 선택에서 해 볼 일',[5]]],
  'portrait-relationships':[['사람에게 마음을 여는 방식',[0,1]],['내 마음과 다르게 전해지는 때',[2]],['생활 속 예시',[3]],['서로 편해지는 대화',[4]],['관계에서 먼저 해 볼 일',[5]]],
  'portrait-work':[['일을 맡았을 때의 강점',[0,1]],['잘하려다 부담이 커지는 때',[2]],['일하는 장면으로 보면',[3]],['역할을 맞추는 대화',[4]],['다음 일에서 해 볼 방법',[5]]],
  'portrait-pressure':[['부담을 느낄 때의 반응',[0,1]],['이런 상황을 떠올려 보세요',[2]],['주변에서 오해하기 쉬운 점',[3]],['무리하지 않고 말하는 방법',[4]],['부담을 나누는 첫 행동',[5]]],
  'portrait-adjustment':[['내 뜻과 다르게 보이는 부분',[0,1]],['오해가 생기는 장면',[2]],['마음을 가다듬는 방법',[3]],['내 뜻을 전하는 대화',[4]],['다음 대화에서 해 볼 일',[5]]],
};

export function buildPersonPortrait(input) {
  const registry=validate(input),{profile,chapters}=input;
  const entries=orderedEntries(profile);
  const anchors=choose(entries),first=VOICES[anchors[0]],second=anchors[1]?VOICES[anchors[1]]:null;
  const core=combined(...anchors),stem=STEMS[profile.dayMaster.hanja];
  const season=seasonFor(profile,chapters,registry),relations=relationsFor(profile);
  const context=describeNatalContext(profile,{codes:anchors,seasonKey:season?.key});
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
  for(const item of cards) {
    const groups=CARD_DETAIL_GROUPS[item.id].map(([title,indexes])=>[title,indexes.map(index=>item.paragraphs[index])]);
    if(item.id!=='portrait-decisions') {
      const connected=describeNatalContext(profile,{codes:item.godCodes,domain:item.id.slice('portrait-'.length)});
      const extra=connected.additionalCode?VOICES[connected.additionalCode]:null;
      const field={'portrait-relationships':'relationship','portrait-work':'work','portrait-pressure':'stress','portrait-adjustment':'misread'}[item.id];
      const paragraphs=[extra?.[field],...(['portrait-relationships','portrait-pressure'].includes(item.id)?connected.interactions.map(value=>value.text):[])].filter(Boolean);
      if(paragraphs.length)groups.splice(2,0,['다른 성향과 함께 나타나는 모습',paragraphs]);
      item.natalContext=connected;
      checked(registry,connected.factIds);
    }
    Object.assign(item,detailContent(groups));
  }
  checked(registry,context.factIds);
  const factIds=checked(registry,[...coreIds,...(season?.factIds||[]),...cards.flatMap(value=>value.factIds)]);
  return {
    id:'person-portrait',title:'나는 어떤 사람일까',headline:'당신은 '+context.headline+'이에요.',
    ...detailContent([['나를 이해하는 첫 모습',portraitParagraphs.slice(0,2)],
      ['여러 모습이 함께 드러나는 이유',[...context.paragraphs,...context.interactions.map(value=>value.text)]],
      ['평소 행동에 드러나는 성향',portraitParagraphs.slice(2)],
      ['이 성향을 편하게 쓰는 조건',[context.season]]]),cards,natalContext:context,
    origin:ORIGIN,factIds,facts:factIds.map(id=>({...registry.get(id)})),
    anchorCodes:[...anchors],godCodes:unique(entries.map(entry=>entry.god.code)),
    methodNotice:'확정된 원국의 일간·십성, 이미 계산한 계절 관계와 합충에 공통 전통 의미를 연결한 설명이에요. 생활 장면과 두 성향을 이어 쓴 문장은 오쭈다가 작성한 공통 참고 해설이며, 실제 경험이나 성격 검사 결과가 아니에요. 같은 단서에는 같은 설명을 쓰고, 함께 확인된 다른 단서에 따라 문단을 조합해요. 글자 개수로 강약이나 대표 성격을 정하지 않아요.',
    selectionNotice:'첫 문장을 정리할 때는 확정된 월간과 일지 본기의 관계를 먼저 읽고, 같은 관계가 겹치면 다음 확정 자리로 이어 가요. 이는 읽는 순서이며 성격의 강약을 순위로 매긴 결과가 아니에요. 관계·일·부담 등 각 주제에서는 그 주제와 관련된 관계를 먼저 연결하고, 확인된 다른 관계도 남겨요.',
    scopeNotice:profile.complete?'':'확정되지 않은 출생 정보는 성향 풀이에 채워 넣지 않았어요.',
    ruleIds:unique([...(season?[season.ruleId]:[]),...cards.flatMap(value=>value.ruleIds)]),
  };
}
