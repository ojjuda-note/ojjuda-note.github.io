import { getReadingSources } from './sources.mjs?v=20261113-saju-reader1';
import { describePersonalPeriod } from './reader-summary.mjs?v=20261113-saju-portrait1';

// These are documented symbolic correspondences, not a computed useful element
// or a promise of good luck. The day master's element is never chosen by count.
const SYMBOLS = Object.freeze({
  wood: { name:'나무', color:'푸른색', numbers:[3,8], direction:'동쪽', scene:'새로 시작할 일을 적는 공책이나 책상 위 작은 소품에 푸른색을 골라 볼 수 있어요.' },
  fire: { name:'불', color:'붉은색', numbers:[2,7], direction:'남쪽', scene:'발표나 새로운 시도를 앞두고 마음을 다잡는 작은 소품에 붉은색을 써 볼 수 있어요.' },
  earth: { name:'흙', color:'노란색', numbers:[5,10], direction:'중앙', scene:'자주 쓰는 기록장이나 물건을 모아 두는 수납함에 노란색을 골라 볼 수 있어요.' },
  metal: { name:'쇠', color:'흰색', numbers:[4,9], direction:'서쪽', scene:'정리하고 싶은 책상이나 서류함에 흰색을 써서 나만의 표시를 만들어 볼 수 있어요.' },
  water: { name:'물', color:'검은색', numbers:[1,6], direction:'북쪽', scene:'생각을 정리하는 공책이나 오래 쓰는 작은 소품에 검은색을 골라 볼 수 있어요.' },
});

// Shared, service-authored applications of each actually calculated relation.
// Every month retains both observed relations and every detected interaction.
const TIMING = Object.freeze({
  companion: {
    label:'나의 기준과 동료',
    opportunity:'이번 달은 내 기준을 세우면서도 동료의 경험을 함께 들어 볼 만한 흐름이에요. 비슷한 일을 직접 해 본 동료와 서로의 방법을 비교하면, 내 계획에서 빠진 부분을 찾는 데 도움이 될 수 있어요.',
    people:'내 선택을 존중하면서도 구체적인 경험을 나누는 동료에게 의견을 구해 보세요. 무조건 내 편을 드는 말보다 실제로 무엇을 해 봤는지를 들어 보는 편이 좋아요.',
    document:'같이 하는 일이 있다면 담당할 일과 비용을 어디까지 나눌지 먼저 적어 보세요. 친한 사이여도 각자 이해한 내용을 확인할 시간이 필요해요.',
    caution:'남과 비교하다가 내 기준을 놓치거나, 공동의 일을 혼자 결정하는 상황을 살펴보세요. 의견이 다르면 바로 결론을 내리기보다 서로 지키고 싶은 조건을 하나씩 말해 보세요.',
  },
  competitor: {
    label:'협력과 경계',
    opportunity:'이번 달은 혼자 모든 일을 맡기보다 여럿 사이에서 내 역할을 분명히 하는 것이 중요하게 읽혀요. 서로 할 수 있는 일을 구체적으로 나누는 방식으로 이 흐름을 활용해 보세요.',
    people:'기여한 일과 약속한 몫을 분명히 말하는 사람과 협력을 검토해 보세요. 친분을 이유로 비용이나 책임을 계속 넘기는 행동은 따로 확인할 필요가 있어요.',
    document:'공동 구매나 함께 맡은 일은 누가 얼마를 내고 무엇을 맡는지 적어 보세요. 상황이 달라질 때 다시 이야기할 방법도 함께 정해 두면 좋아요.',
    caution:'분위기에 휩쓸려 내가 감당하기 어려운 시간이나 돈을 약속하는 장면을 조심해 보세요. 부탁을 받으면 바로 대답하기보다 가능한 범위를 먼저 계산해 보세요.',
  },
  creator: {
    label:'꾸준한 표현과 결과물',
    opportunity:'이번 달에는 생각만 하던 것을 직접 만들어 보여 주는 데 힘을 써 볼 만해요. 작은 글, 작업물, 연습 기록처럼 끝까지 완성할 수 있는 결과물부터 준비해 보세요.',
    people:'과정을 함께 지켜보고 구체적으로 피드백하는 사람에게 도움을 청해 보세요. 매번 새로운 일을 벌이기보다 꾸준히 해낼 수 있게 돕는 관계를 살펴볼 만해요.',
    document:'작업이나 납품을 약속한다면 무엇을 완성해 언제 전달할지 서로 확인해 보세요. 결과물의 범위와 수정할 부분을 같은 말로 이해하는 것이 먼저예요.',
    caution:'도와주고 싶은 마음 때문에 맡을 일을 계속 늘리는 상황을 살펴보세요. 이미 시작한 일을 마무리할 시간이 있는지 확인한 뒤 새 약속을 잡아 보세요.',
  },
  critic: {
    label:'새로운 생각과 전달',
    opportunity:'이번 달은 익숙한 방식에서 불편한 점을 찾아 내 생각을 표현하는 쪽으로 읽혀요. 개선안을 말로만 설명하기보다 짧은 예시나 초안을 만들어 보여 주는 데 활용해 보세요.',
    people:'다른 의견을 듣고도 이유를 차분히 설명하는 사람과 생각을 나눠 보세요. 내 말을 자주 끊거나 비난으로 답하는 행동이 있다면 대화의 경계를 정해 보세요.',
    document:'서로 다르게 이해할 수 있는 표현을 찾아 질문해 보세요. 예를 들어 ‘적당히 수정’ 같은 말은 어떤 부분을 몇 차례 살필지 구체적으로 이야기할 수 있어요.',
    caution:'옳은 말이라도 상대를 몰아붙이는 표현이 되지 않는지 살펴보세요. 고칠 점과 그 이유, 내가 제안하는 방법을 나눠 말하면 뜻을 전하기가 더 쉬워요.',
  },
  opportunist: {
    label:'교류와 새로운 제안',
    opportunity:'이번 달은 새로운 사람이나 제안에 관심이 움직이기 쉬운 흐름으로 읽혀요. 여러 가능성을 살펴보되 내 시간과 비용으로 실제 해 볼 수 있는지 하나씩 비교해 보세요.',
    people:'사람을 소개할 때 조건과 목적을 숨기지 않는 사람인지 살펴보세요. 좋은 기회라는 말만 듣기보다 직접 확인할 수 있는 경험과 자료를 요청해 보세요.',
    document:'새 제안은 예상되는 이익뿐 아니라 내가 내야 할 비용과 맡을 일도 함께 읽어 보세요. 확인할 시간을 주지 않고 서두르는 요구에는 바로 동의하지 않아도 돼요.',
    caution:'관심 가는 일이 많아지면서 계획과 지출이 함께 늘어나는 장면을 점검해 보세요. 지금 시작할 일과 나중에 다시 볼 일을 나누면 선택하기가 쉬워져요.',
  },
  manager: {
    label:'관리와 차근차근 쌓기',
    opportunity:'이번 달은 새 기회를 넓히는 일과 함께, 이미 가진 시간·돈·기술을 지켜 가는 일이 중요하게 읽혀요. 새 일을 크게 벌이기 전에 지금까지 쌓은 결과를 정리하고, 다음에 반복할 방법을 만들어 보세요.',
    people:'작은 약속도 지키고 진행 상황을 알려 주는 사람과 일을 맞춰 보세요. 말의 크기보다 약속한 일을 어떻게 마무리하는지 확인하는 편이 도움이 돼요.',
    document:'금액·날짜·납부 방식처럼 숫자로 적힌 조건을 차근차근 대조해 보세요. 처음 설명을 들었을 때의 조건과 실제 문서가 같은지 확인할 때 활용할 수 있어요.',
    caution:'계획을 지키려다 사정이 달라졌는데도 무리하게 버티는 장면을 살펴보세요. 변경할 수 있는 부분과 지금 지켜야 할 부분을 나눠 조정해 보세요.',
  },
  challenger: {
    label:'도전과 부담 조절',
    opportunity:'이번 달은 어려운 일을 맡았을 때 힘을 집중하되 부담을 나눠야 하는 흐름으로 읽혀요. 목표를 작게 나누고 어려운 부분을 미리 연습하는 데 이 흐름을 활용해 보세요.',
    people:'비슷한 문제를 해결해 본 실무자에게 구체적인 도움을 구해 보세요. 강하게 밀어붙이기만 하는 사람보다 위험과 한계를 함께 설명하는 사람인지 살펴보세요.',
    document:'마감이 촉박하거나 책임이 큰 약속은 내가 실제로 해낼 수 있는 범위를 먼저 확인해 보세요. 큰 금액이나 이해하기 어려운 조건은 관련 전문가에게 검토를 구하는 편이 좋아요.',
    caution:'압박을 받는다고 모든 일을 혼자 떠안는 상황을 점검해 보세요. 기한을 다시 맞추거나 도움을 요청할 수 있는 부분을 일찍 이야기해 보세요.',
  },
  officer: {
    label:'약속과 신뢰',
    opportunity:'이번 달은 맡은 역할과 약속을 분명히 할수록 내 강점을 드러내기 좋은 흐름으로 읽혀요. 공식 절차나 준비할 조건을 확인하고, 현재 맡은 일을 정리하는 데 활용해 보세요.',
    people:'기준을 설명해 주고 같은 기준을 스스로도 지키는 사람에게 조언을 구해 보세요. 직함만 보고 따르기보다 말과 행동이 맞는지 살펴볼 만해요.',
    document:'공식 제출이나 서명을 준비한다면 필요한 서류·기한·담당자를 확인해 보세요. 약속의 범위와 나에게 돌아오는 책임을 이해한 뒤 결정하는 것이 좋아요.',
    caution:'기대에 맞추려다가 내 사정을 말하지 못하는 상황을 살펴보세요. 지킬 수 없는 약속이라면 가능한 일정과 범위를 구체적으로 다시 제안해 보세요.',
  },
  explorer: {
    label:'깊이 살피기와 다른 관점',
    opportunity:'이번 달은 한 가지 문제를 깊이 살펴보고 새로운 방법을 찾아보는 데 초점을 둘 만해요. 궁금한 점을 조사하거나 막혔던 일을 다른 관점에서 검토하는 데 활용해 보세요.',
    people:'쉽게 단정하지 않고 근거를 찾아 설명하는 사람에게 질문해 보세요. 모르는 점을 솔직히 말하면서 확인 방법을 알려 주는 태도가 도움이 될 수 있어요.',
    document:'익숙하지 않은 용어나 조건은 뜻을 확인한 뒤 내 말로 다시 정리해 보세요. 자료를 많이 읽는 것과 내용을 이해한 것은 다를 수 있어 질문할 목록을 남겨 두면 좋아요.',
    caution:'생각을 오래 하다가 필요한 확인이나 대답을 미루는 장면을 살펴보세요. 조사할 질문과 결정할 기한을 나눠 적으면 다음 행동으로 옮기기 쉬워요.',
  },
  scholar: {
    label:'배움과 도움받기',
    opportunity:'이번 달은 혼자 서두르기보다 배우고 도움을 받으며 준비를 다지는 흐름으로 읽혀요. 기초를 다시 익히거나 경험 있는 사람에게 내 계획을 설명하고 질문하는 데 활용해 보세요.',
    people:'내가 스스로 이해하고 선택할 수 있도록 가르쳐 주는 사람을 찾아보세요. 대신 결정해 주는 말보다 이유와 방법을 알려 주는 조언이 도움이 될 수 있어요.',
    document:'신청서·학습 자료·증빙 서류를 정리하고 빠진 항목을 확인해 보세요. 다른 사람에게 맡겼더라도 마지막 내용은 직접 읽고 이해하는 시간이 필요해요.',
    caution:'도움을 받는 데 익숙해져 내 판단을 계속 미루는 상황을 점검해 보세요. 조언을 들은 뒤에는 내가 이해한 내용과 다음 행동을 직접 정리해 보세요.',
  },
});

const CAUTION_TITLES = Object.freeze({
  companion:'남의 속도에 맞추다가 내 기준을 잃지 마세요',
  competitor:'친분 때문에 돈과 책임을 먼저 떠안지 마세요',
  creator:'도와주겠다는 약속을 늘리기 전에 남은 일을 보세요',
  critic:'맞는 말이라도 상대를 몰아붙이는 표현은 피하세요',
  opportunist:'새 제안을 받을 때 시간과 지출을 겹쳐 약속하지 마세요',
  manager:'상황이 바뀌었는데 예전 계획만 고집하지 마세요',
  challenger:'급하다는 이유로 모든 책임을 혼자 맡지 마세요',
  officer:'지킬 수 없는 약속에는 가능한 범위를 먼저 말하세요',
  explorer:'확인할 질문과 대답할 기한을 함께 정하세요',
  scholar:'조언을 들은 뒤 마지막 선택은 직접 정하세요',
});

function checkedIds(report, ids) {
  const available=new Set(report.facts.map(value=>value.id));
  const values=[...new Set(ids)];
  if(values.some(id=>!available.has(id))) throw new Error('추가 풀이의 계산 근거를 확인하지 못했어요.');
  return values;
}

function symbols(report, fortune) {
  const day=fortune.profile.dayMaster, value=SYMBOLS[day.element];
  if(!value) throw new Error('확인된 속성으로 상징을 다시 읽어 주세요.');
  const sources=getReadingSources('lifelong',fortune.year).filter(source=>['traditional-colors-directions','hetu-numbers'].includes(source.id));
  return {
    title:'색·숫자·방향',
    headline:`나의 ${value.name} 속성과 연결되는 전통 상징이에요.`,
    paragraphs:[
      `나를 나타내는 속성은 ${value.name}예요. 여기에 전통적으로 연결한 색은 ${value.color}, 숫자는 ${value.numbers.join('·')}, 방향은 ${value.direction}이에요.`,
      '마음에 드는 색이나 나만의 표시를 고를 때 참고할 수 있어요. 행운을 보장하는 색·번호나 집의 좋은 자리를 따로 계산한 결과는 아니에요.',
    ],
    items:[
      {label:'색',value:value.color,description:value.scene},
      {label:'숫자',value:value.numbers.join(' · '),description:'마음에 드는 수를 골라 공책의 표시나 개인 소품에 활용할 수 있어요.'},
      {label:'방향',value:value.direction,description:value.direction==='중앙'?'중앙을 나만의 상징으로 참고할 수 있어요. 실제 방의 가운데는 오가기 편하게 비워 두고, 수납은 쓰는 물건 가까이에 두세요.':'방향은 나만의 상징으로 참고할 수 있어요. 침대·책상은 출입문, 창문, 빛과 통로를 함께 살펴 배치해 보세요.'},
    ],
    origin:'service-reference',element:day.element,
    factIds:checkedIds(report,['natal.day-master']),sources,
  };
}

function timings(report, fortune) {
  const items=fortune.months.map(month=>{
    const prefix=`month.${month.month}`;
    const codes=[...new Set([month.stemGod.code,month.branchGod.code])];
    if(codes.some(code=>!TIMING[code])) throw new Error('확인된 월별 관계로 시기 풀이를 다시 읽어 주세요.');
    const personal=describePersonalPeriod(fortune.profile,codes,'money','이 기간');
    const matching=fortune.profile.gods.filter(entry=>personal.natalCodes.includes(entry.god.code));
    const factIds=checkedIds(report,[`${prefix}.period`,`${prefix}.god.stem`,`${prefix}.god.branch`,`${prefix}.interaction-count`,
      ...month.interactions.map((_,index)=>`${prefix}.interaction.${index}`),
      ...matching.map(entry=>`natal.god.${entry.pillarKey}.${entry.position}`)]);
    const opportunities=codes.map(code=>({label:TIMING[code].label,text:TIMING[code].opportunity,topic:'opportunity'}));
    const people=codes.map(code=>({label:'도움을 구해 볼 사람',text:TIMING[code].people,topic:'people'}));
    const documents=codes.map(code=>({label:'문서·계약을 살필 때',text:TIMING[code].document,topic:'document'}));
    const cautions=codes.map(code=>({label:CAUTION_TITLES[code],text:TIMING[code].caution,topic:'caution'}));
    const clash=month.interactions.some(value=>value.kind==='branch-clash');
    const combination=month.interactions.some(value=>value.kind!=='branch-clash');
    if(clash) cautions.push({label:'변경에 대비하기',text:'이번 달은 정한 계획을 끝까지 밀기보다 바뀐 상황에 맞춰 조정할 여지를 두는 편이 좋겠어요. 일정이나 약속이 달라지면 이동 시간, 맡은 일, 필요한 비용부터 다시 확인해 보세요.',topic:'change'});
    if(combination) opportunities.push({label:'서로 맞춰 보기',text:'이번 달은 서로 다른 조건을 맞추며 함께할 방법을 찾아볼 만한 흐름이에요. 상대와 원하는 조건을 비교하고 함께 맞출 수 있는 부분을 찾아보세요.',topic:'coordination'});
    return {
      month:month.month,title:`${month.month}월 · ${codes.map(code=>TIMING[code].label).join(' · ')}`,
      periodLabel:`${month.start.label} ~ ${month.end.label} 직전 · 한국 시각`,
      headline:report.reader.months.find(value=>value.month===month.month)?.headline||'',
      paragraphs:[...personal.paragraphs],natalGodCodes:[...personal.natalCodes],
      opportunities,people,documents,cautions,factIds,
      chapterId:'month-interactions',godCodes:codes,origin:'service-reference',
    };
  });
  return {
    title:`${fortune.year}년 · 기회와 주의할 시기`,
    headline:'언제 무엇을 조심하고, 어떤 기회를 살릴지 확인하세요.',
    paragraphs:['시기는 선택을 돌아볼 참고예요. 만남·사고가 실제로 일어날 날짜나 계약 성공을 보장하는 날을 뜻하지 않아요.'],
    scope:'monthly',origin:'service-reference',items,
  };
}

export function attachReaderExtras(report, chart, fortune) {
  if(!report.reader||chart?.dayMaster?.hanja!==fortune?.profile?.dayMaster?.hanja) throw new Error('확인된 개인 풀이를 먼저 준비해 주세요.');
  report.reader.symbols=symbols(report,fortune);
  report.reader.timings=timings(report,fortune);
}
