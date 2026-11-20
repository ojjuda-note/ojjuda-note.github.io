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
  peer:'계속 중요한 주제는 각자의 선택과 몫이에요. 의견을 모을 때도 내가 정할 일과 함께 정할 일을 먼저 나누세요.',
  expression:'생각을 실제 결과로 보여 주는 일이 계속 중요해요. 새 일을 더 벌이기 전에 이미 만든 것을 보여 주고 필요한 부분을 고치세요.',
  wealth:'시간과 돈을 쓰는 기준을 계속 지켜야 해요. 하나를 선택한 뒤 다른 계획에 쓸 여유가 얼마나 남는지 확인하세요.',
  authority:'약속한 역할과 책임이 계속 핵심이에요. 일이 늘었다면 마감과 맡을 범위도 다시 정하세요.',
  resource:'배운 내용을 직접 익히는 일이 계속 중요해요. 설명을 듣는 시간과 혼자 연습하는 시간을 나누세요.',
};
const BRIDGES={
  'peer-expression':'내 기준을 세웠다면 짧은 초안이나 예시로 보여 주세요. 원하는 방법을 구체적인 결과로 설명하는 단계예요.',
  'peer-wealth':'스스로 고르는 힘을 시간과 돈의 관리에 쓰세요. 함께 시작하는 일에서도 내 몫과 공동으로 쓸 몫을 구분해야 해요.',
  'peer-authority':'결과의 기준은 함께 정하고 진행 방법은 어디까지 직접 정할지 확인하세요. 내 방식을 살리면서 약속도 지키는 게 핵심이에요.',
  'peer-resource':'지금 결정할 문제에 필요한 내용부터 배우세요. 여러 조언을 모두 따르지 말고 막힌 부분을 질문한 뒤 내 말로 답을 정리하세요.',
  'expression-peer':'직접 만든 결과에서 다음 선택의 기준을 찾으세요. 반응이 좋았던 방법 중 무엇이 내게 잘 맞았는지 구체적으로 정리하세요.',
  'expression-wealth':'좋아하는 활동을 이어 가려면 시간과 비용을 맞춰야 해요. 처음 준비할 돈뿐 아니라 반복해서 드는 돈과 수고도 챙기세요.',
  'expression-authority':'새 방법을 제안할 때는 꼭 지킬 조건부터 확인하세요. 고칠 부분과 그대로 둘 부분을 나눈 뒤 작은 결과로 보여 주세요.',
  'expression-resource':'직접 해 보고 막힌 부분에서 다음 공부를 시작하세요. 자료를 처음부터 다시 모으지 말고 질문 하나를 골라 배운 뒤 적용하세요.',
  'wealth-peer':'관리해 온 시간과 돈을 내 필요에 맞게 쓰세요. 주변의 기대 때문에 고른 것과 실제로 필요한 것을 나누어 정리하세요.',
  'wealth-expression':'준비한 시간과 재료로 작은 결과를 만드세요. 더 갖추기를 기다리지 말고 지금 가진 것으로 끝낼 작업부터 정하세요.',
  'wealth-authority':'돈과 시간을 정할 때 각자의 책임도 함께 맞추세요. 비용을 낼 사람, 일할 사람, 바뀐 조건을 확인할 사람을 분명히 나누세요.',
  'wealth-resource':'배움에 쓸 돈과 시간은 배운 뒤 혼자 할 일을 기준으로 정하세요. 수업과 자료를 많이 모으는 것보다 실제 연습이 먼저예요.',
  'authority-peer':'맡은 일에서 어디까지 직접 판단할지 확인하세요. 부탁을 받을 때도 내 몫과 다른 사람의 확인이 필요한 일을 나누어 말하세요.',
  'authority-expression':'기준을 확인했다면 작은 초안부터 보여 주세요. 확인받은 내용에 맞춰 다음 작업을 이어 가세요.',
  'authority-wealth':'맡은 일을 해내는 데 필요한 시간과 비용을 계산하세요. 일의 범위가 늘었다면 준비물과 마감도 다시 맞춰야 해요.',
  'authority-resource':'맡은 일에 필요한 기초부터 익히세요. 모르는 부분을 정확히 묻고, 비슷한 일을 혼자 해 보며 확인하세요.',
  'resource-peer':'배운 내용으로 직접 판단하는 연습을 하세요. 설명을 그대로 따라 하기 전에 왜 그 방법을 고르는지 내 말로 정리하세요.',
  'resource-expression':'배운 것을 작은 결과로 만드세요. 더 알아야 한다는 부담이 크다면 지금 이해한 부분부터 짧게 설명하세요.',
  'resource-wealth':'배운 내용을 써 볼 시간과 비용부터 마련하세요. 새로운 자료를 더 고르기 전에 이미 배운 것을 직접 적용하세요.',
  'resource-authority':'공부와 경험을 지금 맡은 일에 적용하세요. 배운 것을 전부 보여 주려 하지 말고 요구받은 기준에 맞는 결과 하나를 준비하세요.',
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
    beginning+`${particle(quoteThemes(segment.godCodes),'을','를')} 우선해요. ${label}에는 ${quoteThemes(focus)}도 함께 챙기세요.`,
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
    const yearLead=month.solarTermYear===fortune.year?`${fortune.year}년 풀이의 핵심은`:`입춘 전이라 ${month.solarTermYear}년 풀이를 적용해요. 핵심은`;
    const yearParagraphs=[
      `${yearLead} ${particle(quoteThemes(yearCodes),'이에요','예요')}. ${month.month}월에는 ${particle(quoteThemes(focus),'을','를')} 함께 챙기세요.`,
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
