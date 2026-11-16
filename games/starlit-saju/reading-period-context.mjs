import { makeTransitContext } from './fortune-data.mjs?v=20261114-saju-correction1';
import { readingDetailSections } from './reading-detail.mjs?v=20261114-saju-depth1';
import { particle } from './natal-reading-data.mjs?v=20261114-saju-wind1';

// Connect the themes of actual overlapping periods. These authored bridges
// explain how to apply the confirmed relationships together; they do not
// calculate chart strength, useful elements, or the probability of an event.
const ORIGIN='service-reference';
const unique=values=>[...new Set(values)];
const THEMES={
  companion:'스스로 선택하는 힘',competitor:'협력과 공정한 분담',
  creator:'꾸준한 표현과 완성',critic:'새로운 방법과 솔직한 표현',
  opportunist:'사람과 기회를 연결하는 일',manager:'돈과 시간을 꾸준히 관리하는 일',
  challenger:'어려운 과제와 책임',officer:'약속과 역할의 기준',
  explorer:'깊이 알아보고 다른 관점을 찾는 일',scholar:'기초를 배우고 도움을 주고받는 일',
};
const GROUPS={companion:'peer',competitor:'peer',creator:'expression',critic:'expression',
  opportunist:'wealth',manager:'wealth',challenger:'authority',officer:'authority',explorer:'resource',scholar:'resource'};
const SHARED={
  peer:'내 선택과 다른 사람의 몫을 나누는 문제가 이어져요. 의견을 모으는 자리에서도 내가 정할 부분과 함께 정할 부분을 먼저 구분하세요.',
  expression:'생각을 말이나 결과로 드러내는 주제가 이어져요. 할 일을 더 벌이기보다 이미 만든 것을 보여 주고 필요한 부분을 고치는 데 힘을 써 보세요.',
  wealth:'시간과 돈을 어디에 쓸지 정하는 주제가 이어져요. 한 가지 선택이 다른 계획에 쓸 여유를 얼마나 남기는지 함께 살피세요.',
  authority:'약속한 역할과 책임을 확인하는 주제가 이어져요. 해야 할 일이 늘었다면 마감과 맡을 범위도 함께 다시 정하세요.',
  resource:'배운 것을 익히고 도움을 활용하는 주제가 이어져요. 설명을 더 듣는 것과 직접 해 보는 시간을 나누면 배움이 내 실력으로 남아요.',
};
const BRIDGES={
  'peer-expression':'내 기준을 세웠다면 이제 다른 사람도 이해할 수 있는 말과 결과로 보여 줄 차례예요. 원하는 방법만 말하기보다 짧은 초안이나 예시를 함께 준비하세요.',
  'peer-wealth':'스스로 고르는 힘을 시간과 돈의 선택에 적용해 보세요. 함께 시작하는 일에서도 내 몫과 공동으로 쓸 몫을 구분해야 선택을 오래 이어 갈 수 있어요.',
  'peer-authority':'내 방식으로 해 보고 싶은 마음과 함께 지킬 약속을 맞추는 것이 핵심이에요. 결과의 기준은 함께 정하고, 진행 방법에서 내가 결정할 범위를 찾아보세요.',
  'peer-resource':'내가 직접 결정할 문제에 필요한 배움을 골라야 해요. 여러 조언을 모두 따르려 하기보다 지금 막힌 부분을 질문하고 내 말로 답을 정리하세요.',
  'expression-peer':'쌓아 온 표현과 결과를 내 선택의 기준으로 삼아 보세요. 반응이 좋았던 방법을 그대로 따르기보다 어떤 부분이 나에게 잘 맞았는지 돌아보는 게 중요해요.',
  'expression-wealth':'만들거나 표현하던 일을 실제 시간과 비용에 맞추는 것이 핵심이에요. 좋아하는 활동을 이어 가려면 한 번의 준비뿐 아니라 반복해서 필요한 돈과 수고도 챙기세요.',
  'expression-authority':'새로운 생각을 함께 지킬 기준 안에서 완성하는 데 초점을 두세요. 고치고 싶은 부분과 꼭 지켜야 할 조건을 나누면 제안이 구체적인 결과로 이어져요.',
  'expression-resource':'직접 해 본 경험에서 다음에 배울 것을 찾는 과정이 중요해요. 자료를 처음부터 다시 모으기보다 결과가 막힌 지점 하나를 골라 배우고 다시 써 보세요.',
  'wealth-peer':'관리해 온 시간과 돈을 누구의 기준으로 쓸지 돌아보는 시기예요. 주변의 기대에 맞춘 선택과 내게 필요한 선택을 나누면 지킬 것과 줄일 것이 분명해져요.',
  'wealth-expression':'준비한 시간과 재료를 눈에 보이는 작은 결과로 바꾸는 것이 핵심이에요. 더 많이 갖추기를 기다리기보다 지금 가진 것으로 끝낼 수 있는 작업부터 정하세요.',
  'wealth-authority':'돈과 시간을 쓸 계획에 역할과 책임을 함께 맞춰야 해요. 비용을 낼 사람, 일을 맡을 사람, 바뀐 조건을 확인할 사람을 분명히 정하세요.',
  'wealth-resource':'배움에 쓸 시간과 돈을 실제 활용할 장면과 연결하세요. 수업이나 자료의 양보다 배운 뒤 혼자 해낼 일을 정하는 것이 선택의 기준이에요.',
  'authority-peer':'맡은 책임 안에서 내가 판단할 수 있는 범위를 찾는 것이 핵심이에요. 부탁을 받을 때 맡을 부분과 다른 사람의 확인이 필요한 부분을 나누어 말하세요.',
  'authority-expression':'지켜야 할 기준을 알았다면 내 생각을 결과로 보여 줄 차례예요. 기준에 맞는 작은 초안을 먼저 내고, 확인받은 부분을 바탕으로 다음 작업을 이어 가세요.',
  'authority-wealth':'책임을 다하기 위해 필요한 시간과 비용을 구체적으로 살펴야 해요. 일의 범위가 늘었다면 준비물과 마감도 그대로인지 함께 확인하세요.',
  'authority-resource':'맡은 역할을 잘해 내는 데 필요한 기초를 채우는 것이 핵심이에요. 모르는 부분을 정확히 물은 뒤 비슷한 일을 혼자 해 보며 익히세요.',
  'resource-peer':'배운 내용을 내 판단으로 바꾸는 과정이 중요해요. 설명을 그대로 따르는 데서 한 걸음 나아가, 왜 그 방법을 고르는지 내 말로 정리해 보세요.',
  'resource-expression':'배우고 생각한 것을 작은 결과로 꺼내는 것이 핵심이에요. 더 알아야 한다는 부담이 크다면 지금 이해한 부분만 짧게 설명하거나 직접 만들어 보세요.',
  'resource-wealth':'배운 것이 실제 생활에 쓰이도록 시간과 돈의 계획을 붙여 주세요. 새로운 자료를 더 고르기 전에 이미 배운 내용을 써 볼 시간부터 남겨 두세요.',
  'resource-authority':'쌓아 온 공부와 경험을 맡은 역할에 적용하는 것이 핵심이에요. 배운 내용을 전부 보여 주려 하기보다 이번에 요구받은 기준에 맞는 결과 하나를 준비하세요.',
};

const fail=()=>{throw new Error('시기별 풀이가 이어지는 기간을 확인하지 못했어요. 다시 불러와 주세요.');};
const time=value=>{const result=Date.parse(value);return Number.isFinite(result)?result:fail();};
const codesOf=value=>{
  const codes=unique([value?.stemGod?.code,value?.branchGod?.code]);
  if(codes.some(code=>!THEMES[code]))fail();
  return codes;
};
const themes=codes=>codes.map(code=>THEMES[code]).join(' · ');
const quoteThemes=codes=>'‘'+themes(codes)+'’';
function dateLabel(value) {
  const date=new Date(time(value)+9*3600000);
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth()+1}월 ${date.getUTCDate()}일 ${String(date.getUTCHours()).padStart(2,'0')}:${String(date.getUTCMinutes()).padStart(2,'0')}`;
}
function together(background,focus) {
  const before=unique(background.map(code=>GROUPS[code])),now=unique(focus.map(code=>GROUPS[code]));
  const shared=now.filter(group=>before.includes(group));
  const added=now.filter(group=>!before.includes(group));
  return unique([
    ...shared.map(group=>SHARED[group]),
    ...added.map((group,index)=>BRIDGES[before[index%before.length]+'-'+group]),
  ]);
}
function overlaps(period,start,end) {
  return time(period.startsAt)<time(end)&&time(period.endsAt)>time(start);
}
function periodSegments(daeun,start,end) {
  if(!daeun?.available)return [];
  if(!Array.isArray(daeun.periods))fail();
  return daeun.periods.filter(period=>overlaps(period,start,end)).map(period=>({
    period,index:period.index,
    startsAt:new Date(Math.max(time(start),time(period.startsAt))).toISOString(),
    endsAt:new Date(Math.min(time(end),time(period.endsAt))).toISOString(),
    godCodes:codesOf(period),
  }));
}
function applyContext(item,context) {
  const original=readingDetailSections(item)||[{title:'이 시기의 핵심',paragraphs:[...item.paragraphs]}];
  const sections=original.filter(section=>section.contextKind!=='period-connection');
  const additions=context.sections.map(section=>({...section,contextKind:'period-connection'}));
  item.periodContext=context;
  item.detailSections=[...sections,...additions];
  item.paragraphs=item.detailSections.flatMap(section=>section.paragraphs);
}
function segmentReading(segment,focus,label,wholeStart,wholeEnd,position,total) {
  const partial=time(segment.startsAt)!==time(wholeStart)||time(segment.endsAt)!==time(wholeEnd);
  const periodLabel=partial?`${dateLabel(segment.startsAt)}부터 ${dateLabel(segment.endsAt)} 전까지`:
    `${segment.period.startLabel}부터 ${segment.period.endLabel} 전까지`;
  const beginning=total>1?`${position===0?'앞':'다음'} 대운과 겹치는 ${periodLabel}, `:`${periodLabel} 이어지는 대운에서는 `;
  return [
    beginning+`${particle(quoteThemes(segment.godCodes),'을','를')} 살펴봐요. ${label}의 ${particle(quoteThemes(focus),'과','와')} 함께 읽으면 다음에 힘쓸 일이 분명해져요.`,
    ...together(segment.godCodes,focus),
  ];
}
function contextFacts(prefix,segments) {
  return unique(['natal.day-master',`${prefix}.pillar`,`${prefix}.period`,`${prefix}.god.stem`,`${prefix}.god.branch`,
    ...segments.flatMap(segment=>segment.period.factIds)]);
}

/** Link each selected period, not the browser clock's current decade. */
export function attachPeriodContexts(report,fortune) {
  if(!report?.reader?.annual||!Array.isArray(report.reader.months)||!fortune?.profile?.dayMaster)fail();
  const daeun=report.daeunCalculation;
  const annual=fortune.annual,annualCodes=codesOf(annual);
  const annualSegments=periodSegments(daeun,annual.start.iso,annual.end.iso);
  if(annualSegments.length) {
    const paragraphs=unique(annualSegments.flatMap((segment,index)=>segmentReading(segment,annualCodes,`${fortune.year}년`,annual.start.iso,annual.end.iso,index,annualSegments.length)));
    if(daeun.timeAssumed===true)paragraphs.push(daeun.birthTimeNotice);
    applyContext(report.reader.annual,{origin:ORIGIN,solarTermYear:fortune.year,yearHanja:annual.hanja,
      yearGodCodes:annualCodes,segments:annualSegments.map(({period,...segment})=>segment),
      factIds:contextFacts('annual',annualSegments),
      sections:[{title:'대운과 함께 읽는 올해',paragraphs}],
    });
  }
  for(const overview of report.reader.months) {
    const month=fortune.months.find(value=>value.month===overview.month);
    if(!month?.yearHanja||!Number.isInteger(month.solarTermYear))fail();
    const focus=codesOf(month);
    const year=month.yearHanja===annual.hanja?annual:makeTransitContext(month.yearHanja,fortune.profile,
      {label:`${month.solarTermYear}년`,key:`context.year.${month.solarTermYear}`,scope:'annual'});
    const yearCodes=codesOf(year),segments=periodSegments(daeun,month.start.iso,month.end.iso);
    const yearLead=month.solarTermYear===fortune.year?`${fortune.year}년에`:`입춘 전이라 ${month.solarTermYear}년의 흐름에서`;
    const yearParagraphs=[
      `${yearLead} 살펴보는 주제는 ${particle(quoteThemes(yearCodes),'이에요','예요')}. ${month.month}월에는 ${particle(quoteThemes(focus),'을','를')} 함께 읽어요.`,
      ...together(yearCodes,focus),
    ];
    const sections=[{title:'올해와 함께 읽는 이달',paragraphs:yearParagraphs}];
    if(segments.length) {
      const used=new Set(yearParagraphs);
      const paragraphs=segments.flatMap((segment,index)=>segmentReading(segment,focus,`${month.month}월`,month.start.iso,month.end.iso,index,segments.length))
        .filter(paragraph=>{if(used.has(paragraph))return false;used.add(paragraph);return true;});
      if(daeun.timeAssumed===true)paragraphs.push(daeun.birthTimeNotice);
      sections.push({title:'대운에서 이달로 이어지는 주제',paragraphs});
    }
    applyContext(overview,{origin:ORIGIN,solarTermYear:month.solarTermYear,yearHanja:year.hanja,
      yearGodCodes:yearCodes,monthGodCodes:focus,segments:segments.map(({period,...segment})=>segment),
      factIds:unique([...contextFacts(`month.${month.month}`,segments),`month.${month.month}.term-year`]),sections,
    });
  }
  const registry=new Set([...report.facts,...(report.daeun?.facts||[])].map(fact=>fact.id));
  for(const overview of [report.reader.annual,...report.reader.months]) {
    if(overview.periodContext?.factIds.some(id=>!registry.has(id)))fail();
  }
  return report;
}
