import { GOD_REFERENCE, GROUP_PAIR_RULES } from './readings-data.mjs?v=20261113-saju-brief1';
import { PLAIN_GOD_EXPLANATIONS } from './plain-language.mjs?v=20261113-saju-brief1';
import { GOD_CONTEXTS, PAIR_CONTEXTS, TOPIC_CONTEXTS } from './deeper-reading-data.mjs?v=20261113-saju-brief1';

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
      const text=`${sourceLabel(pillar,label)} ${pillar.hangul}(${pillar.hanja})의 ${position}는 ${ending(name)} 이를 내 기준 글자 ${profile.dayMaster.hangul}(${profile.dayMaster.hanja})에 견주어 읽는 이름은 ${ending(`${hidden.god.name}(${hidden.god.hanja})`)} ${meaning.meaning}`;
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
  return make({id,title:'아래쪽 글자 안의 뜻을 하나씩 읽기',summary:'대표 글자와 추가 글자를 나누고, 각각의 생활 뜻까지 읽어요',
    easyParagraphs:[
      '지장간은 아래쪽 글자 안에 연결된 글자예요. 그중 대표 글자를 본기라고 해요.',
      ...detail,...examples.map(value=>value.easyText),
    ],factIds:base,rules,referenceRules:examples,reference:[...definitions,
      '본기는 앞의 생활 이야기에서도 이미 읽은 같은 글자예요. 추가 글자는 원자료에 적힌 순서대로 보여 드리며, 이 순서에 힘의 크기나 좋고 나쁨을 붙이지 않았어요. 기존 글자 개수에 다시 더하지도 않아요.',
    ]});
}

function combinedChapter(make,profile) {
  const active=GROUP_PAIR_RULES.filter(rule=>profile.gods.some(value=>value.god.group===rule.left)&&profile.gods.some(value=>value.god.group===rule.right));
  const easyParagraphs=[];
  const reference=['여기서는 내 사주에 실제로 함께 나온 두 생활 이야기를 연결해 봐요. 두 주제가 같은 생활 장면에서 어떻게 만날 수 있는지 저희가 쓴 참고 풀이예요. 같은 조합에는 같은 설명 규칙을 쓰며, 아래 예시는 직접 겪을 일을 예고한 이야기가 아니에요.'];
  const referenceRules=[];
  for(const definition of active){
    const left=profile.gods.filter(value=>value.god.group===definition.left);
    const right=profile.gods.filter(value=>value.god.group===definition.right);
    const context=PAIR_CONTEXTS[definition.id];
    const actual=`${definition.title}. 확인한 이름과 자리: ${places(left)} / ${places(right)}. ${context.meaning}`;
    const example=`생활 예시: ${context.example}`;
    const question=`함께 생각해 볼 질문: ${context.question}`;
    easyParagraphs.push(actual,example,question);
    referenceRules.push(serviceRule(`natal.deep-pair.${definition.id}`,[...left,...right].map(natalGodId),
      `서비스 작성 참고 풀이 · ${actual} ${example} ${question}`));
  }
  if(!active.length)easyParagraphs.push('확정된 위쪽 글자와 아래쪽 대표 글자에서는 함께 읽을 두 주제가 나오지 않았어요.');
  return make({id:'natal-combined-themes',title:'두 가지 생활 이야기를 함께 읽기',
    summary:active.length?`${active[0].title}${active.length>1?'부터 여러 주제의 연결까지':''} 살펴봐요`:'확인된 이름으로 연결할 수 있는 범위를 살펴봐요',
    easyParagraphs,factIds:['natal.scope',...profile.gods.map(natalGodId)],referenceRules,reference});
}

function compareGod(profile,god) {
  const same=profile.gods.filter(value=>value.god.code===god.code);
  const related=profile.gods.filter(value=>value.god.group===god.group&&value.god.code!==god.code);
  if(same.length)return {ids:same.map(natalGodId),text:`태어난 사주에서도 같은 이름을 확인했어요. 확인한 자리: ${places(same)}.`};
  if(related.length)return {ids:profile.gods.map(natalGodId),text:`태어난 사주의 위쪽 글자와 아래쪽 대표 표에는 ${god.name} 이름이 없지만, 같은 생활 묶음에서 다른 이름도 확인돼요. 확인한 이름과 자리: ${places(related)}.`};
  return {ids:profile.gods.map(natalGodId),text:`태어난 사주에서 확인한 위쪽 글자와 아래쪽 대표 표에는 ${god.name} 이름이 나오지 않았어요.`};
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
  const reference=[`${label}에 실제로 나온 십성의 뜻을 ‘${context.focus}’에 연결해 저희가 쓴 생활 풀이예요. 먼저 어떤 글자에서 나온 뜻인지 읽고, 내 생활에 맞는 예시와 질문을 골라 보세요.`];
  for(const code of codes){
    const positions=['stem','branch'].filter(position=>transit[position+'God'].code===code);
    const god=transit[positions[0]+'God'];
    const actual=positions.map(position=>position==='stem'
      ?`위쪽 ${transit.stem.hangul}(${transit.stem.hanja})`
      :`아래쪽 ${transit.branch.hangul}(${transit.branch.hanja})의 대표 ${transit.branchMainStem.hangul}(${transit.branchMainStem.hanja})`).join(' / ');
    const meaning=PLAIN_GOD_EXPLANATIONS[code],application=GOD_CONTEXTS[code][topic],comparison=compareGod(profile,god);
    const from=`${label}의 ${actual}에서 읽는 이름은 ${ending(`${god.name}(${god.hanja})`)} ${meaning.meaning}`;
    const explanation=`${application.meaning} ${comparison.text}`;
    const example=`생활 예시: ${application.example} 생각해 볼 질문: ${application.question}`;
    easyParagraphs.push(from,explanation,example);
    definitions.push(GOD_REFERENCE[code].definition);
    referenceRules.push(serviceRule(`${prefix}.life-topic.${topic}.${code}`,
      ['natal.day-master','natal.scope',...positions.map(position=>`${prefix}.god.${position}`),...comparison.ids],
      `서비스 작성 참고 풀이 · ${from} ${explanation} ${example}`));
  }
  if(codes.length===1)reference.push('이번에는 위쪽 글자와 아래쪽 대표에서 같은 이름을 읽어요. 같은 설명을 두 번의 별개 예측으로 늘리지 않고, 두 자리의 근거를 한 뜻에 함께 연결했어요.');
  for(const type of ['connect','clash']){
    const found=transit.interactions.map((value,index)=>({value,index})).filter(({value})=>type==='clash'?value.kind==='branch-clash':value.kind!=='branch-clash');
    if(!found.length)continue;
    const actual=found.map(({value})=>pairDescription(value,label)).join(' / ');
    const description=type==='clash'?'서로 다른 방향을 조정한다':'서로 맞추고 연결한다';
    const text=`글자 사이에서 함께 볼 점: ${actual}. 전통에서 ‘${description}’고 읽는 뜻을 ${context[type]}에 빗대어 생각해 볼 수 있어요.`;
    easyParagraphs.push(text);
    referenceRules.push(serviceRule(`${prefix}.life-topic.${topic}.${type}`,
      found.map(({index})=>`${prefix}.interaction.${index}`),`서비스 작성 참고 풀이 · ${text}`));
  }
  if(!transit.interactions.length)reference.push('이번 시기와 확정된 내 사주 사이에서는 확인하는 세 종류의 합·충 짝이 나오지 않았어요. 이 단원은 위에서 확인한 십성 뜻과 내 사주의 비교를 바탕으로 읽어요.');
  easyParagraphs.push(`생각해 볼 질문: ${context.question}`);
  const summary=codes.map(code=>`${GOD_REFERENCE[code].name}의 ‘${PLAIN_GOD_EXPLANATIONS[code].topic}’`).join(' / ');
  return make({id,title:context.title,summary:`${summary}에서 살펴볼 점을 찾아요`,easyParagraphs,
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
