import { PLAIN_GOD_EXPLANATIONS } from './plain-language.mjs?v=20261114-saju-copy1';
import { GOD_CONTEXTS } from './deeper-reading-data.mjs?v=20261114-saju-depth1';
import { STAGE_MEANINGS } from './stage-reading.mjs?v=20261114-saju-final-review2';
import { readingDetailText } from './reading-detail.mjs?v=20261114-saju-depth1';
import { summaryLinesFrom } from './reading-summary-lines.mjs?v=20261114-saju-depth1';

// Keep the useful meaning of confirmed supplementary classifications in the
// reading. Calculation tables, source names and formulas stay in the registry.
// A hidden stem is not a measured hidden personality, and a stage is not an
// age, health condition or forecast. Neither receives a new strength score.
const ORIGIN='service-reference';
const unique=values=>[...new Set(values)];
const DOMAIN={peer:'relationships',expression:'work',wealth:'money',authority:'work',resource:'learning'};
const STAGE_TITLES={
  长生:'처음 배우고 시작할 때',沐浴:'새로운 일에 익숙해질 때',冠带:'내 방법을 갖춰 갈 때',
  临官:'맡은 역할을 해낼 때',帝旺:'잘하는 일을 이어 갈 때',衰:'계속할 일과 줄일 일을 나눌 때',
  病:'혼자 맡기 버거운 일을 나눌 때',死:'마친 일에서 배운 것을 남길 때',墓:'이룬 것을 정리해 둘 때',
  绝:'다음 일을 정하기 전에',胎:'작은 생각을 키워 갈 때',养:'준비를 구체적으로 채울 때',
};
const fail=()=>{throw new Error('추가 해설에 필요한 개인 풀이를 확인하지 못했어요. 다시 불러와 주세요.');};

function checked(registry,ids) {
  const values=unique(ids);
  if(!values.length||values.some(id=>!registry.has(id)))fail();
  return values;
}

function item(registry,context,{kind,label,sections,action,scopeNotice,codes=[],stages=[]}) {
  if(!sections.length||sections.some(section=>!section.title||!section.paragraphs.length))fail();
  const paragraphs=sections.flatMap(section=>section.paragraphs);
  const summaryLines=summaryLinesFrom(paragraphs[0],action,paragraphs);
  const factIds=checked(registry,[...context.factIds,...sections.flatMap(section=>section.factIds)]);
  return {
    id:`${context.prefix.replaceAll('.','-')}-supplement-${kind}`,
    kind,label,title:summaryLines[0],summaryLines,paragraphs,detailSections:sections,
    scopeNotice,origin:ORIGIN,factIds,godCodes:codes,stageCodes:stages,
    sourceChapterId:kind==='hidden'?context.hiddenChapterId:context.stageChapterId,
  };
}

function hiddenReading(registry,context) {
  const groups=new Map();
  for(const pillar of context.reference.pillars) {
    for(const hidden of pillar.hiddenStems) {
      const {code,group}=hidden.god;
      if(!PLAIN_GOD_EXPLANATIONS[code]||!GOD_CONTEXTS[code]?.[DOMAIN[group]])fail();
      const factId=`${context.prefix}.reference.${pillar.pillarKey}.hidden.${hidden.order}`;
      checked(registry,[factId]);
      if(!groups.has(code))groups.set(code,{code,group,factIds:[]});
      groups.get(code).factIds.push(factId);
    }
  }
  if(!groups.size)return null;
  const sections=[...groups.values()].map(({code,group,factIds})=>{
    const plain=PLAIN_GOD_EXPLANATIONS[code],application=GOD_CONTEXTS[code][DOMAIN[group]];
    return {title:plain.topic,code,factIds:unique(factIds),paragraphs:[
      application.meaning,
      `생활 속 가상 장면이에요. ${plain.example} ${application.question}`,
    ]};
  });
  const first=[...groups.values()][0];
  return item(registry,context,{
    kind:'hidden',label:context.period?`${context.period} 더 살필 내 모습`:'내 성향을 더 자세히',sections,
    action:GOD_CONTEXTS[first.code][DOMAIN[first.group]].question,codes:[...groups.keys()],
    scopeNotice:(context.period
      ?`${context.period}의 주제를 내 생활에 적용한 추가 해설이에요. 이 시기에 반드시 이런 일이 생긴다는 뜻은 아니에요.`
      :'내 사주에서 함께 확인된 성향을 더 자세히 읽은 내용이에요. 이 성향이 앞의 풀이보다 더 강하거나 더 좋다는 뜻은 아니에요.')
      +(context.partial?' 확인하지 못한 출생 정보는 이 설명에도 채워 넣지 않았어요.':''),
  });
}

function stageReading(registry,context) {
  const groups=new Map();
  for(const pillar of context.reference.pillars) {
    const code=pillar.lifeStage?.hanja;
    if(!STAGE_MEANINGS[code]||!STAGE_TITLES[code])fail();
    const factId=`${context.prefix}.reference.${pillar.pillarKey}.life-stage`;
    checked(registry,[factId]);
    if(!groups.has(code))groups.set(code,{code,factIds:[]});
    groups.get(code).factIds.push(factId);
  }
  if(!groups.size)return null;
  const sections=[...groups.values()].map(({code,factIds})=>({
    title:STAGE_TITLES[code],code,factIds:unique(factIds),paragraphs:[
      STAGE_MEANINGS[code].meaning,
      `내 생활에 적용할 때는 이렇게 물어보세요. ${STAGE_MEANINGS[code].question}`,
    ],
  }));
  return item(registry,context,{
    kind:'stages',label:context.period?`${context.period} 시작과 마무리`:'시작과 마무리에서 살필 점',sections,
    action:STAGE_MEANINGS[[...groups.keys()][0]].question,stages:[...groups.keys()],
    scopeNotice:(context.period
      ?`${context.period}의 풀이에 연결된 모습을 생활에 비춰 보는 설명이에요. 실제로 일이 시작되거나 끝나는 때를 정한 것은 아니에요.`
      :'내 사주에 연결된 성장과 정리의 비유를 생활에 비춰 보는 설명이에요. 어린 시절부터 노년까지의 순서로 읽지는 않아요.')
      +' 병·죽음·수명이나 성공과 실패를 판정한 내용은 아니에요.'
      +(context.partial?' 확인하지 못한 출생 정보의 설명은 만들지 않았어요.':''),
  });
}

function cardsFor(registry,source,{prefix,period=null,partial=false}) {
  if(!source.reference?.pillars?.length)return [];
  const context={prefix,period,partial,reference:source.reference,
    hiddenChapterId:prefix==='natal'?'natal-hidden-meaning':prefix==='annual'?'annual-hidden-meaning':'month-hidden-meaning',
    stageChapterId:prefix==='natal'?'life-stage-meanings':prefix==='annual'?'annual-stage-meaning':'month-stage-meaning',
    factIds:['natal.day-master','natal.scope',...(prefix==='natal'?[]:[`${prefix}.period`])],
  };
  return [hiddenReading(registry,context),stageReading(registry,context)].filter(Boolean);
}

/** Attach before summary/copy generation; this does not change existing cards. */
export function attachReaderSupplements(report,fortune) {
  if(!report?.reader||!Array.isArray(report.facts)||!fortune?.profile||!Array.isArray(fortune.months))fail();
  const registry=new Set(report.facts.map(fact=>fact.id));
  const partial=!fortune.profile.complete;
  report.reader.supplements={
    lifelong:cardsFor(registry,fortune.profile,{prefix:'natal',partial}),
    annual:cardsFor(registry,fortune.annual,{prefix:'annual',period:`${fortune.year}년`,partial}),
    months:fortune.months.map(month=>({month:month.month,cards:cardsFor(registry,month,{prefix:`month.${month.month}`,period:`${month.month}월`,partial})})),
  };
  return report;
}

/** The display and copy use exactly the same card order, units and scope. */
export function copyReaderSupplements(report,topic,{month=null}={}) {
  const supplements=report?.reader?.supplements;
  if(!supplements)return [];
  if(!['lifelong','annual','monthly','all'].includes(topic))fail();
  if(topic==='all')return ['lifelong','annual','monthly'].flatMap(category=>copyReaderSupplements(report,category));
  const cards=topic==='monthly'
    ?supplements.months.filter(value=>month===null||value.month===month).flatMap(value=>value.cards)
    :supplements[topic];
  return cards.flatMap(card=>['',card.label,'추가 해설',...card.summaryLines,...readingDetailText(card),card.scopeNotice]);
}
