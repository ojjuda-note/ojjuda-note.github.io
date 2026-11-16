import { GOD_REFERENCE, GROUP_PAIR_RULES } from './readings-data.mjs?v=20261113-saju-easy1';
import { PLAIN_GOD_EXPLANATIONS } from './plain-language.mjs?v=20261114-saju-copy1';
import { GOD_CONTEXTS, PAIR_CONTEXTS, TOPIC_CONTEXTS } from './deeper-reading-data.mjs?v=20261113-saju-easy1';

// A transparent explanation layer over existing facts. No extra chart facts,
// gender rules, strength scores, or event predictions are produced here.
const PILLARS = {year:'태어난 해',month:'태어난 달',day:'태어난 날',hour:'태어난 시간'};
const unique = values => [...new Set(values)];
const hasFinal = value => ((String(value).match(/[가-힣]/g)?.at(-1)?.charCodeAt(0)||0)-0xac00)%28!==0;
const ending = value => value+(hasFinal(value)?'이에요.':'예요.');
const natalGodId = entry => `natal.god.${entry.pillarKey}.${entry.position}`;
const location = entry => `${PILLARS[entry.pillarKey]}의 ${entry.position==='stem'?'위쪽 글자':'아래쪽 대표 글자'}`;
const places = entries => entries.map(entry=>`${location(entry)}의 ${entry.god.name}`).join(', ');
const sourceLabel = (pillar,label) => PILLARS[pillar.pillarKey] || label;
const serviceRule = (id,factIds,text) => ({id,factIds:unique(factIds),text,origin:'service-reference'});

function chapterFactory(report) {
  const facts=new Map(report.facts.map(value=>[value.id,value]));
  return ({id,title,summary,easyParagraphs,factIds=[],rules=[],referenceRules=[],reference=[],practice=[]}) => {
    const ids=unique([...factIds,...rules.flatMap(value=>value.factIds),...referenceRules.flatMap(value=>value.factIds)]);
    const calculation=ids.map(id=>{
      if(!facts.has(id))throw new Error(`심화 풀이의 근거가 없어요: ${id}`);
      return facts.get(id).text;
    });
    const interpretation=rules.map(value=>value.text);
    return {id,title,summary,easyParagraphs,factIds:ids,calculation,rules,referenceRules,
      reference:unique([...reference,...referenceRules.map(value=>value.text)]),practice,interpretation,
      paragraphs:[...calculation,...interpretation],basis:calculation};
  };
}

function hiddenChapter(make,profile,source,prefix,label,id) {
  const reference=source.reference;
  if(!reference?.pillars.length)return null;
  const rules=[],definitions=[],detail=[];
  const base=['natal.day-master','natal.scope',`${prefix}.reference.source`];
  for(const pillar of reference.pillars){
    for(const hidden of pillar.hiddenStems){
      const factId=`${prefix}.reference.${pillar.pillarKey}.hidden.${hidden.order}`;
      const name=`${hidden.stem.hangul}(${hidden.stem.hanja})`;
      const position=hidden.isMain?'대표로 쓰는 글자(본기)':`추가로 연결된 글자(자료 순서 ${hidden.order})`;
      const meaning=PLAIN_GOD_EXPLANATIONS[hidden.god.code];
      const text=`${sourceLabel(pillar,label)}의 ${pillar.hangul}(${pillar.hanja})에서 ${position}는 ${ending(name)} 나를 나타내는 ${profile.dayMaster.hangul}(${profile.dayMaster.hanja})과 비교했어요. 이 관계의 이름은 ${ending(`${hidden.god.name}(${hidden.god.hanja})`)} ${meaning.meaning}`;
      rules.push({id:`${prefix}.hidden-reading.${pillar.pillarKey}.${hidden.order}`,
        factIds:['natal.day-master',`${prefix}.reference.source`,factId],text,origin:'traditional-symbolic'});
      definitions.push(GOD_REFERENCE[hidden.god.code].definition);
      detail.push(text);
    }
  }
  const codes=unique(reference.pillars.flatMap(value=>value.hiddenStems.map(hidden=>hidden.god.code)));
  const examples=codes.map(code=>{
    const found=reference.pillars.flatMap(pillar=>pillar.hiddenStems.filter(value=>value.god.code===code).map(hidden=>({pillar,hidden})));
    const context=PLAIN_GOD_EXPLANATIONS[code];
    const easyText=`생활 예시 · ${GOD_REFERENCE[code].name}: ${context.example}`;
    return {...serviceRule(`${prefix}.hidden-example.${code}`,found.map(({pillar,hidden})=>`${prefix}.reference.${pillar.pillarKey}.hidden.${hidden.order}`),`서비스 작성 ${easyText}`),easyText};
  });
  return make({id,title:'아래쪽 글자 안의 뜻을 하나씩 읽기',summary:'대표 글자와 추가 글자가 생활에서 무엇을 뜻하는지 살펴봐요',
    easyParagraphs:[
      '사주의 아래쪽 글자에는 다른 글자들이 연결되어 있어요. 이를 지장간이라고 해요. 그중 대표로 쓰는 글자를 본기라고 불러요.',
      ...detail,...examples.map(value=>value.easyText),
    ],factIds:base,rules,referenceRules:examples,reference:[...definitions,
      '대표 글자인 본기는 앞의 생활 풀이에서도 이미 사용했어요. 추가 글자는 원자료에 적힌 순서대로 보여 드려요. 먼저 나온다고 더 강하거나 좋다는 뜻은 아니에요. 기존 글자 개수에 다시 더하지도 않아요.',
    ]});
}

function combinedChapter(make,profile) {
  const active=GROUP_PAIR_RULES.filter(rule=>profile.gods.some(value=>value.god.group===rule.left)&&profile.gods.some(value=>value.god.group===rule.right));
  const easyParagraphs=[];
  const reference=['내 사주에서 실제로 함께 확인한 두 관계를 살펴봐요. 두 관계의 뜻이 일이나 대화에서 어떻게 나타날 수 있는지 저희가 쓴 참고 풀이예요. 같은 조합에는 같은 설명 규칙을 써요. 아래 예시는 이해를 돕는 가상 상황이며, 직접 겪을 일을 예고하지 않아요.'];
  const referenceRules=[];
  for(const definition of active){
    const left=profile.gods.filter(value=>value.god.group===definition.left);
    const right=profile.gods.filter(value=>value.god.group===definition.right);
    const context=PAIR_CONTEXTS[definition.id];
    const actual=`${definition.title}. ${context.meaning} 계산에서 확인한 이름과 자리: ${places(left)} / ${places(right)}.`;
    const example=`생활 예시: ${context.example}`;
    const question=`함께 생각해 볼 질문: ${context.question}`;
    easyParagraphs.push(actual,example,question);
    referenceRules.push(serviceRule(`natal.deep-pair.${definition.id}`,[...left,...right].map(natalGodId),
      `서비스 작성 참고 풀이 · ${actual} ${example} ${question}`));
  }
  if(!active.length)easyParagraphs.push('확정된 위쪽 글자와 아래쪽 대표 글자를 확인했어요. 이 글자들에서는 이번 기준으로 함께 읽을 두 관계가 나오지 않았어요.');
  return make({id:'natal-combined-themes',title:'두 가지 생활 이야기를 함께 읽기',
    summary:active.length?`실제로 확인한 ${active.length}가지 조합을 생활 속 예시로 살펴봐요`:'함께 읽을 관계가 확인되지 않아 조합 풀이를 만들지 않았어요',
    easyParagraphs,factIds:['natal.scope',...profile.gods.map(natalGodId)],referenceRules,reference});
}

function compareGod(profile,god) {
  const same=profile.gods.filter(value=>value.god.code===god.code);
  const related=profile.gods.filter(value=>value.god.group===god.group&&value.god.code!==god.code);
  if(same.length)return {ids:same.map(natalGodId),text:`태어난 사주에서도 같은 관계를 확인했어요. 확인한 자리: ${places(same)}.`};
  if(related.length)return {ids:profile.gods.map(natalGodId),text:`태어난 사주의 위쪽 글자와 아래쪽 대표 글자에는 ${god.name} 관계가 없어요. 다만 같은 종류로 묶어 읽는 다른 관계는 확인했어요. 확인한 이름과 자리: ${places(related)}.`};
  return {ids:profile.gods.map(natalGodId),text:`태어난 사주의 위쪽 글자와 아래쪽 대표 글자에는 ${god.name} 관계가 나오지 않았어요.`};
}

function pairDescription(value,label) {
  const birth=`${PILLARS[value.birthPillarKey]}의 ${value.birthCharacter.hangul}(${value.birthCharacter.hanja})`;
  const period=`${label}의 ${value.otherCharacter.hangul}(${value.otherCharacter.hanja})`;
  return `${birth} / ${period}: ${value.pairHangul}(${value.pairHanja}) ${value.label}`;
}

function topicChapter(make,profile,transit,prefix,label,topic,id) {
  const context=TOPIC_CONTEXTS[topic],referenceRules=[],definitions=[];
  const codes=unique([transit.stemGod.code,transit.branchGod.code]);
  const easyParagraphs=[];
  const reference=[`${label}의 글자와 내 사주를 비교해 확인한 관계를 십성이라고 해요. 그 뜻을 ‘${context.focus}’에 연결해 저희가 쓴 생활 풀이예요. 어떤 글자에서 나온 설명인지 함께 적었어요. 예시와 질문은 내 생활에 맞는 것을 골라 보세요.`];
  for(const code of codes){
    const positions=['stem','branch'].filter(position=>transit[position+'God'].code===code);
    const god=transit[positions[0]+'God'];
    const actual=positions.map(position=>position==='stem'
      ?`위쪽 ${transit.stem.hangul}(${transit.stem.hanja})`
      :`아래쪽 ${transit.branch.hangul}(${transit.branch.hanja})의 대표 ${transit.branchMainStem.hangul}(${transit.branchMainStem.hanja})`).join(' / ');
    const meaning=PLAIN_GOD_EXPLANATIONS[code],application=GOD_CONTEXTS[code][topic],comparison=compareGod(profile,god);
    const from=`나를 나타내는 글자와 ${label}의 글자를 비교했어요. ${actual}에서 확인한 관계의 이름은 ${ending(`${god.name}(${god.hanja})`)} ${meaning.meaning}`;
    const explanation=`${application.meaning} ${comparison.text}`;
    const example=`생활 예시: ${application.example} 생각해 볼 질문: ${application.question}`;
    easyParagraphs.push(explanation,from,example);
    definitions.push(GOD_REFERENCE[code].definition);
    referenceRules.push(serviceRule(`${prefix}.life-topic.${topic}.${code}`,
      ['natal.day-master','natal.scope',...positions.map(position=>`${prefix}.god.${position}`),...comparison.ids],
      `서비스 작성 참고 풀이 · ${from} ${explanation} ${example}`));
  }
  if(codes.length===1)reference.push('이번에는 위쪽 글자와 아래쪽 대표 글자에서 같은 관계를 확인했어요. 설명은 한 번만 쓰고 두 자리의 근거를 함께 남겼어요. 같은 내용을 별개의 예측처럼 늘리지 않아요.');
  for(const type of ['connect','clash']){
    const found=transit.interactions.map((value,index)=>({value,index})).filter(({value})=>type==='clash'?value.kind==='branch-clash':value.kind!=='branch-clash');
    if(!found.length)continue;
    const actual=found.map(({value})=>pairDescription(value,label)).join(' / ');
    const description=type==='clash'?'서로 다른 점을 조정하는 관계':'서로 맞춰 보는 관계';
    const text=`함께 확인한 글자의 짝: ${actual}. 전통에서는 ‘${description}’로 읽어요. 생활에서는 ${context[type]}을 떠올려 보세요.`;
    easyParagraphs.push(text);
    referenceRules.push(serviceRule(`${prefix}.life-topic.${topic}.${type}`,
      found.map(({index})=>`${prefix}.interaction.${index}`),`서비스 작성 참고 풀이 · ${text}`));
  }
  if(!transit.interactions.length)reference.push('이번 시기의 글자와 확정된 내 사주 사이에서는 확인 대상인 세 종류의 합·충 짝이 나오지 않았어요. 따라서 합·충 해석을 덧붙이지 않았어요. 위에서 확인한 십성의 뜻과 내 사주를 비교한 내용으로 읽어 주세요.');
  easyParagraphs.push(`생각해 볼 질문: ${context.question}`);
  const summary=codes.map(code=>`${GOD_REFERENCE[code].name}의 ‘${PLAIN_GOD_EXPLANATIONS[code].topic}’`).join(' / ');
  return make({id,title:context.title,summary:`이번에 확인한 내용: ${summary}`,easyParagraphs,
    factIds:[`${prefix}.pillar`,`${prefix}.period`,`${prefix}.interaction-count`],referenceRules,reference:[...definitions,...reference]});
}

export function attachDeeperReadings(report,fortune) {
  const make=chapterFactory(report),profile=fortune.profile;
  const life=report.sections.find(value=>value.id==='lifelong');
  const hiddenLife=hiddenChapter(make,profile,profile,'natal','태어난 사주','natal-hidden-meaning');
  if(hiddenLife)life.chapters.push(hiddenLife);
  life.chapters.push(combinedChapter(make,profile));
  const annual=report.sections.find(value=>value.id==='annual'),label=`${fortune.year}년`;
  const hiddenAnnual=hiddenChapter(make,profile,fortune.annual,'annual',label,'annual-hidden-meaning');
  if(hiddenAnnual)annual.chapters.push(hiddenAnnual);
  annual.chapters.push(
    topicChapter(make,profile,fortune.annual,'annual',label,'work','annual-career-detail'),
    topicChapter(make,profile,fortune.annual,'annual',label,'money','annual-money-detail'),
  );
  for(const month of report.months){
    const source=fortune.months.find(value=>value.month===month.month),prefix=`month.${month.month}`,label=`${fortune.year}년 ${month.month}월`;
    const hidden=hiddenChapter(make,profile,source,prefix,label,'month-hidden-meaning');
    if(hidden)month.chapters.push(hidden);
    for(const topic of Object.keys(TOPIC_CONTEXTS))month.chapters.push(topicChapter(make,profile,source,prefix,label,topic,`month-${topic}-detail`));
  }
  return report;
}
