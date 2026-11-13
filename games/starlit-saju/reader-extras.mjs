import { getReadingSources } from './sources.mjs?v=20261113-saju-reader1';
import { describePersonalPeriod } from './reader-summary.mjs?v=20261113-saju-easy1';

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
    label:'내 생각과 동료의 경험',
    opportunity:'이번 달에는 내가 원하는 것을 정하고 동료의 경험도 들어 보세요. 비슷한 일을 해 본 사람과 방법을 비교해 보세요. 내 계획에서 빠진 준비를 찾는 데 도움이 될 수 있어요.',
    people:'내 선택을 존중하면서도 구체적인 경험을 나누는 동료에게 의견을 구해 보세요. 무조건 내 편을 드는 말보다 실제로 무엇을 해 봤는지를 들어 보는 편이 좋아요.',
    document:'같이 하는 일이 있다면 누가 무엇을 할지, 돈은 얼마씩 낼지 먼저 적어 보세요. 친한 사이여도 같은 뜻으로 이해했는지 확인해 보세요.',
    caution:'남과 비교하다가 내 기준을 놓치거나, 공동의 일을 혼자 결정하는 상황을 살펴보세요. 의견이 다르면 바로 결론을 내리기보다 서로 지키고 싶은 조건을 하나씩 말해 보세요.',
  },
  competitor: {
    label:'함께 나눠 할 일',
    opportunity:'이번 달에는 모든 일을 혼자 맡기보다 각자 할 일을 나눠 보세요. 내가 할 수 있는 것과 상대에게 부탁할 것을 분명히 말해 보면 좋아요.',
    people:'무엇을 했고 앞으로 무엇을 맡을지 분명히 말하는 사람과 함께할 방법을 찾아보세요. 친하다는 이유로 돈이나 일을 계속 떠넘기는지는 따로 살펴보세요.',
    document:'공동 구매나 함께 맡은 일은 누가 얼마를 내고 무엇을 맡는지 적어 보세요. 상황이 달라질 때 다시 이야기할 방법도 함께 정해 두면 좋아요.',
    caution:'분위기에 휩쓸려 쓸 수 있는 시간이나 돈보다 많이 약속하지 않도록 살펴보세요. 부탁에 답하기 전에 언제까지 무엇을 도울 수 있는지 먼저 생각해 보세요.',
  },
  creator: {
    label:'작게라도 끝내 보여 주기',
    opportunity:'이번 달에는 생각만 하던 것을 직접 만들어 보여 주는 데 힘을 써 볼 만해요. 작은 글, 작업물, 연습 기록처럼 끝까지 완성할 수 있는 결과물부터 준비해 보세요.',
    people:'하는 일을 지켜보고 무엇을 고치면 좋을지 구체적으로 말해 주는 사람에게 도움을 청해 보세요. 새 일을 계속 권하기보다 하던 일을 끝내도록 도와주는지도 살펴보세요.',
    document:'작업을 맡거나 물건을 보내기로 했다면 무엇을 언제까지 준비할지 확인해 보세요. 어디까지 만들고 몇 번 고칠지도 미리 이야기해 보세요.',
    caution:'도와주고 싶은 마음 때문에 맡을 일을 계속 늘리는 상황을 살펴보세요. 이미 시작한 일을 마무리할 시간이 있는지 확인한 뒤 새 약속을 잡아 보세요.',
  },
  critic: {
    label:'불편한 방법 고치기',
    opportunity:'이번 달에는 늘 하던 일에서 무엇이 불편했는지 살펴보세요. 바꾸고 싶은 점을 말로만 설명하기보다 짧은 예시나 초안으로 보여 주면 좋아요.',
    people:'의견이 달라도 이유를 차분히 설명하는 사람과 이야기해 보세요. 내 말을 자주 끊거나 비난으로 답한다면, 어떤 말은 불편한지 알려 주세요.',
    document:'서로 다르게 이해할 수 있는 표현을 찾아 질문해 보세요. 예를 들어 ‘적당히 수정’ 같은 말은 어떤 부분을 몇 차례 살필지 구체적으로 이야기할 수 있어요.',
    caution:'옳은 말이라도 상대를 몰아붙이는 표현이 되지 않는지 살펴보세요. 고칠 점과 그 이유, 내가 제안하는 방법을 나눠 말하면 뜻을 전하기가 더 쉬워요.',
  },
  opportunist: {
    label:'새로운 사람과 제안',
    opportunity:'이번 달은 새로운 사람이나 제안에 관심이 가기 쉬운 때로 읽어요. 마음이 가는 일이 있으면 실제로 쓸 시간과 돈을 확인해 보세요. 여러 일을 함께 할 수 있는지도 하나씩 비교해 보세요.',
    people:'사람을 소개할 때 조건과 목적을 숨기지 않는 사람인지 살펴보세요. 좋은 기회라는 말만 듣기보다 직접 확인할 수 있는 경험과 자료를 요청해 보세요.',
    document:'새 제안은 예상되는 이익뿐 아니라 내가 내야 할 비용과 맡을 일도 함께 읽어 보세요. 확인할 시간을 주지 않고 서두르는 요구에는 바로 동의하지 않아도 돼요.',
    caution:'관심 가는 일을 모두 계획에 넣다 보면 쓸 돈도 늘어날 수 있어요. 지금 시작할 일과 나중에 다시 볼 일을 나눠 보세요. 무엇부터 할지 고르기 쉬워져요.',
  },
  manager: {
    label:'맡은 일과 준비 챙기기',
    opportunity:'이번 달에는 새 일을 찾는 것과 함께 이미 가진 시간·돈·기술도 챙겨 보세요. 지금까지 해낸 일을 정리하고 다음에도 쓸 수 있는 방법을 남겨 보세요. 새 일을 크게 벌이기 전의 준비가 될 수 있어요.',
    people:'작은 약속도 지키고 진행 상황을 알려 주는 사람과 일을 맞춰 보세요. 말의 크기보다 약속한 일을 어떻게 마무리하는지 확인하는 편이 도움이 돼요.',
    document:'얼마를 언제 어떤 방법으로 내는지 하나씩 읽어 보세요. 처음 들은 설명과 문서에 적힌 내용이 같은지도 확인해 보세요.',
    caution:'사정이 달라졌는데도 예전 계획을 무리하게 지키려 하지 않는지 살펴보세요. 지금 꼭 지킬 일과 바꿔도 될 일을 따로 정해 보세요.',
  },
  challenger: {
    label:'어려운 일과 도움받기',
    opportunity:'이번 달에는 어려운 일에 집중하되 혼자 모두 맡지는 않는 쪽으로 읽어요. 목표를 작게 나누고 어려운 부분부터 미리 연습해 보세요. 도움받을 일도 함께 정해 두면 좋아요.',
    people:'비슷한 문제를 직접 풀어 본 사람에게 도움을 구해 보세요. 무조건 해 보라고 밀어붙이기보다 무엇이 어렵고 어디까지 할 수 있는지 설명해 주는 사람인지 살펴보세요.',
    document:'시간이 짧거나 책임이 큰 약속은 실제로 해낼 수 있는지 먼저 살펴보세요. 돈이 많이 들거나 조건이 이해되지 않는다면 그 일을 잘 아는 전문가에게 확인을 부탁해 보세요.',
    caution:'압박을 받는다고 모든 일을 혼자 떠안는 상황을 점검해 보세요. 기한을 다시 맞추거나 도움을 요청할 수 있는 부분을 일찍 이야기해 보세요.',
  },
  officer: {
    label:'약속과 신뢰',
    opportunity:'이번 달에는 맡은 일과 약속을 분명히 하는 데 장점을 써 볼 만해요. 필요한 절차와 준비물을 확인해 보세요. 지금 맡은 일이 어디까지인지 정리해 두면 좋아요.',
    people:'기준을 설명해 주고 같은 기준을 스스로도 지키는 사람에게 조언을 구해 보세요. 직함만 보고 따르기보다 말과 행동이 맞는지 살펴볼 만해요.',
    document:'서류를 내거나 서명할 일이 있다면 무엇을 언제까지 누구에게 내는지 확인해 보세요. 내가 어떤 일을 약속하고 책임지는지 이해한 뒤 결정하면 좋아요.',
    caution:'상대의 기대에 맞추느라 내 사정을 말하지 못하고 있지는 않은지 살펴보세요. 약속을 지키기 어렵다면 언제까지 무엇을 할 수 있는지 다시 말해 보세요.',
  },
  explorer: {
    label:'이유와 다른 방법 찾기',
    opportunity:'이번 달에는 문제 하나를 깊이 살펴보면 좋아요. 궁금한 점을 찾아보고, 하던 방법이 막혔다면 다른 방법도 비교해 보세요.',
    people:'쉽게 단정하지 않고 근거를 찾아 설명하는 사람에게 질문해 보세요. 모르는 점을 솔직히 말하면서 확인 방법을 알려 주는 태도가 도움이 될 수 있어요.',
    document:'처음 보는 말이나 조건은 뜻을 물어보세요. 답을 들은 뒤 내 말로 설명해 보세요. 자료를 많이 읽었어도 이해되지 않는 부분은 있을 수 있으니 질문을 적어 두면 좋아요.',
    caution:'생각을 오래 하다가 필요한 확인이나 대답을 미루는 장면을 살펴보세요. 조사할 질문과 결정할 기한을 나눠 적으면 다음 행동으로 옮기기 쉬워요.',
  },
  scholar: {
    label:'배움과 도움받기',
    opportunity:'이번 달에는 혼자 서두르기보다 배우고 도움받으며 준비해 보세요. 기초에서 막힌 부분을 다시 익혀 보세요. 경험 있는 사람에게 내 계획을 말하고 궁금한 점을 물어봐도 좋아요.',
    people:'내가 스스로 이해하고 선택할 수 있도록 가르쳐 주는 사람을 찾아보세요. 대신 결정해 주는 말보다 이유와 방법을 알려 주는 조언이 도움이 될 수 있어요.',
    document:'신청서나 공부 자료, 제출할 서류를 모아 빠진 것이 없는지 살펴보세요. 다른 사람에게 부탁했어도 마지막 내용은 직접 읽어 보세요.',
    caution:'도움받는 데 익숙해져 내 결정을 계속 미루고 있지는 않은지 살펴보세요. 조언을 들었다면 무엇을 이해했고 다음에 무엇을 할지 직접 정해 보세요.',
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
  officer:'약속을 지키기 어렵다면 할 수 있는 일을 먼저 말하세요',
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
    headline:`사주에서 나를 나타내는 ${value.name}에 옛사람들이 붙인 상징이에요.`,
    paragraphs:[
      `이 사주에서 나를 나타내는 글자는 ‘${value.name}’에 속해요. 옛 대응표의 ‘${value.name}’ 항목에 적힌 색은 ${value.color}, 숫자는 ${value.numbers.join('·')}, 방향은 ${value.direction}이에요.`,
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
    if(clash) cautions.push({label:'계획이 바뀔 때 살필 것',text:'이번 달에는 계획을 바꿔야 할 때 어떻게 할지도 생각해 두면 좋아요. 일정이나 약속이 달라졌다면 이동 시간, 맡은 일, 필요한 돈부터 다시 확인해 보세요.',topic:'change'});
    if(combination) opportunities.push({label:'함께할 방법 찾기',text:'이번 달에는 서로 원하는 것을 말하며 함께할 방법을 찾아보면 좋아요. 각자 꼭 필요한 것과 바꿔도 괜찮은 것을 이야기해 보세요.',topic:'coordination'});
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
    headline:'달마다 해 볼 일과 미리 살필 점을 읽어 보세요.',
    paragraphs:['각 달의 풀이는 무엇을 할지 생각할 때 참고하는 설명이에요. 만남이나 사고가 일어날 날짜를 알려 주는 것은 아니에요. 계약이 꼭 잘되는 날을 정한 것도 아니에요.'],
    scope:'monthly',origin:'service-reference',items,
  };
}

export function attachReaderExtras(report, chart, fortune) {
  if(!report.reader||chart?.dayMaster?.hanja!==fortune?.profile?.dayMaster?.hanja) throw new Error('확인된 개인 풀이를 먼저 준비해 주세요.');
  report.reader.symbols=symbols(report,fortune);
  report.reader.timings=timings(report,fortune);
}
