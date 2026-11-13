import { getTenGod, makeProfile, interactionPairs } from './fortune-data.mjs?v=20261113-saju-reader1';
import { GOD_REFERENCE, RELATION_REFERENCE } from './readings-data.mjs?v=20261113-saju-brief1';
import { zodiacFromChart } from './zodiac.mjs?v=20261113-saju-zodiac1';
import { buildCompatibilityScore } from './compatibility-score.mjs?v=20261113-compatibility-score1';

// A local comparison of two already-calculated charts. All cross-chart pillar
// pairs are retained; the prose is a disclosed application of shared meanings.
// The reference score uses disclosed product rules, not event predictions.
// There is no birth-time guess, request or storage.
const ORIGIN='service-reference';
const PILLARS={year:'태어난 해',month:'태어난 달',day:'태어난 날',hour:'태어난 시간'};
const ELEMENTS={wood:'나무',fire:'불',earth:'흙',metal:'쇠',water:'물'};
const POSITION={stem:'위 글자',branch:'아래 글자'};
// Plain-language versions of the day-stem symbols in STEM_REFERENCE.
const STEM_THEMES={
  甲:'방향을 정하고 꾸준히 이어 가는 모습',乙:'상황에 맞춰 방법을 바꾸고 연결점을 찾는 모습',
  丙:'생각과 마음을 밖으로 드러내는 모습',丁:'가까운 곳의 작은 차이에 집중하는 모습',
  戊:'중심을 지키고 하던 일을 이어 가는 모습',己:'주변의 필요를 받아들이고 차근차근 가꾸는 모습',
  庚:'필요한 것을 가려내고 정리하는 모습',辛:'작은 차이를 다듬고 자기 기준을 살피는 모습',
  壬:'여러 생각과 사람을 연결해 보는 모습',癸:'조용히 살피며 천천히 이해하는 모습',
};
const unique=values=>[...new Set(values)];
const character=value=>`${value.hangul}(${value.hanja})`;
const personPillar=(person,pillar)=>`${person==='self'?'내':'상대'} ${pillar.label}`;

export class CompatibilityInputError extends Error {
  constructor(code,message) { super(message);this.name='CompatibilityInputError';this.code=code; }
}

function checkedProfile(chart,person) {
  try { return makeProfile(chart); }
  catch (error) {
    if (error?.name!=='FortuneInputError') throw error;
    throw new CompatibilityInputError(`${person}-chart`,`${person==='self'?'내':'상대'} 사주에서 확인된 태어난 날이 필요해요. 출생 정보를 다시 확인해 주세요.`);
  }
}

const BASE_STORIES={
  peer:{
    headline:'서로의 선택을 존중하며 가까워지는 관계로 읽혀요.',
    title:'가까워지는 일과 각자의 기준을 지키는 일이 함께 중요해요',
    meaning:'두 사람은 가까이 지내면서도 자기 생각과 선택을 소중히 여기는 관계로 읽혀요. 함께 결정할 때 각자 원하는 것을 꺼내 놓아야 어느 한쪽만 참고 따르는 상황을 줄일 수 있어요.',
    sides:'나는 내 방식대로 하고 싶고, 상대도 자기 방식을 존중받고 싶을 수 있어요. 서로 좋아하더라도 쉬는 방법이나 만나고 싶은 사람, 하루를 보내는 속도는 다를 수 있어요.',
    example:'예를 들어 주말을 함께 보낸다고 해 볼게요. 한 사람은 밖에 나가고 싶고 다른 사람은 집에서 쉬고 싶을 수 있어요. 둘 다 상대를 좋아하면서도 그날 필요한 시간은 다를 수 있지요.',
    adjustment:'이럴 때는 “오늘 꼭 하고 싶은 것 하나씩 말해 보자”라고 물어보세요. 오전에는 함께 나가고 오후에는 각자 쉬는 식으로, 함께하는 시간과 혼자 쓰는 시간을 나눠 볼 수 있어요.',
    strength:'두 사람의 장점은 각자의 생각을 분명하게 나눌 때 살릴 수 있어요. 한쪽이 이끌고 다른 쪽이 따라가기보다 서로 납득할 이유를 찾으면 함께 정한 일에 힘을 보태기 쉬워요.',
    difference:'“내가 편한 방식이면 상대도 편할 것”이라고 짐작하는 순간에는 서로의 선택이 가려질 수 있어요. 같은 선택을 하는지보다 선택할 여지가 둘 다 있는지를 살펴보세요.',
  },
  expression:{
    headline:'내가 건네는 생각과 상대가 바라는 도움을 맞춰 가는 관계로 읽혀요.',
    title:'내가 전하는 것과 상대가 받아들이는 것을 맞춰 보세요',
    meaning:'내 쪽에서는 생각을 밖으로 꺼내 상대에게 전하고, 상대는 그 말이나 행동에서 도움을 얻는 모습으로 읽혀요. 내가 알고 있는 것을 나누거나 함께 방법을 찾아줄 때 서로에게 필요한 것을 주고받을 수 있어요.',
    sides:'나는 도움이 되고 싶어서 먼저 답을 내놓을 수 있어요. 하지만 상대가 원하는 것이 해결책인지, 마음을 들어 주는 시간인지 먼저 물어야 정성이 상대에게 편하게 닿을 수 있어요.',
    example:'예를 들어 상대가 어려운 일을 이야기한다고 해 볼게요. 나는 함께 방법을 찾으려고 여러 제안을 할 수 있지만, 상대는 우선 자기 이야기를 들어 주길 바랄 수도 있어요.',
    adjustment:'“같이 방법을 찾아볼까, 먼저 들어 줄까?”라고 물어보세요. 서로 원하는 도움을 맞춘 다음에 생각을 건네면, 정성껏 준비한 말이 어떤 도움인지 더 분명해져요.',
    strength:'한 사람이 먼저 생각을 꺼내고 다른 사람이 자기 경험을 보태면, 혼자서는 떠올리지 못한 방법을 함께 찾아볼 수 있어요. 도움을 주고받은 뒤 무엇이 실제로 유용했는지 말해 주면 서로의 장점을 알아가기 쉬워요.',
    difference:'주려는 도움과 받고 싶은 도움이 다르면, 애써 건넨 말도 부담스럽게 들릴 수 있어요. 도움의 양보다 지금 필요한 종류를 먼저 물어보세요.',
  },
  resource:{
    headline:'상대의 생각을 받아들이며 나에게 필요한 도움도 말해 가는 관계로 읽혀요.',
    title:'상대의 뜻을 듣고, 내가 필요한 도움도 말해 보세요',
    meaning:'내 쪽에서는 배우고 도움을 받아들이며 힘을 얻고, 상대는 자기 생각이나 경험을 전해 주는 모습으로 읽혀요. 상대가 건네는 말을 내 상황에 맞게 되짚어 볼 때 필요한 도움을 골라 받을 수 있어요.',
    sides:'상대는 도움이 되고 싶어서 먼저 방법을 제안할 수 있어요. 나는 고맙게 느끼는 부분과 지금 필요한 것을 함께 말하면 좋아요. 설명이 더 필요한지, 잠깐 들어 주기만 하면 되는지 구체적으로 알려 주세요.',
    example:'예를 들어 내가 어려운 일을 이야기한다고 해 볼게요. 상대는 함께 방법을 찾으려고 여러 제안을 할 수 있지만, 나는 우선 내 이야기를 들어 주길 바랄 수도 있어요.',
    adjustment:'그럴 때는 “방법도 고맙지만 지금은 이야기를 먼저 들어 줬으면 해”라고 말해 보세요. 도움이 필요한 부분이 분명해지면 상대도 어떤 방식으로 함께할지 알기 쉬워져요.',
    strength:'한 사람이 먼저 생각을 꺼내고 다른 사람이 자기 경험을 보태면, 혼자서는 떠올리지 못한 방법을 함께 찾아볼 수 있어요. 도움을 주고받은 뒤 무엇이 실제로 유용했는지 말해 주면 서로의 장점을 알아가기 쉬워요.',
    difference:'받은 말을 모두 따라야 한다고 느끼거나, 필요한 도움을 말하지 않고 기다리면 서로의 뜻이 어긋날 수 있어요. 이해한 부분과 내가 결정할 부분을 나눠 보세요.',
  },
  wealth:{
    headline:'내가 세우는 현실적인 계획과 상대가 맡을 역할을 함께 맞춰 가는 관계로 읽혀요.',
    title:'현실의 계획과 서로 맡을 일을 함께 정해 보세요',
    meaning:'나는 함께 쓸 돈과 시간을 먼저 살피고, 상대는 그 계획에서 자신이 무엇을 맡아야 하는지 확인하려는 모습으로 읽혀요. 준비할 조건과 각자의 책임이 함께 정리되면 같은 계획을 두고 서로 다르게 기대하는 일을 줄일 수 있어요.',
    sides:'나는 준비가 되어 있으니 시작해도 된다고 생각할 수 있지만, 상대는 맡을 일이 분명해야 마음이 놓일 수 있어요. 필요한 비용을 마련했는지와 누가 어디까지 하기로 했는지를 함께 확인해 주세요.',
    example:'예를 들어 함께 여행을 준비한다고 해 볼게요. 나는 시간과 비용을 먼저 정리하고 싶고, 상대는 누가 예약하고 누가 일정을 확인할지부터 알아야 마음이 놓일 수 있어요.',
    adjustment:'“여기에 쓸 돈은 이 정도로 생각했어. 너는 어느 부분을 맡고 싶어?”처럼 계획과 역할을 함께 물어보세요. 상대가 다른 방식을 원한다면 그 이유도 듣고 다시 나눌 수 있어요.',
    strength:'두 사람은 필요한 준비와 각자의 책임을 함께 정할 때 장점을 살릴 수 있어요. 한 사람이 놓친 조건을 다른 사람이 짚어 주면, 막연했던 계획을 실제로 해 볼 수 있는 일로 정리하기 쉬워져요.',
    difference:'내가 세운 계획을 상대도 받아들였다고 생각하거나, 상대의 역할을 미리 정하면 부담이 생길 수 있어요. 제안한 것과 함께 정한 것을 구분해 보세요.',
  },
  authority:{
    headline:'내가 맡을 책임과 상대의 현실적인 계획을 함께 맞춰 가는 관계로 읽혀요.',
    title:'내가 맡을 수 있는 범위와 상대의 계획을 함께 살펴보세요',
    meaning:'나는 내가 어디까지 책임져야 하는지 먼저 살피고, 상대는 함께 쓸 돈과 시간을 구체적으로 준비하려는 모습으로 읽혀요. 내가 맡을 수 있는 범위를 말하고 상대의 계획을 들으면 둘 다 감당할 수 있는 약속을 정하기 쉬워요.',
    sides:'상대는 준비가 되어 있으니 시작해도 된다고 생각할 수 있지만, 나는 맡을 일이 분명해야 마음이 놓일 수 있어요. 상대를 돕고 싶은 마음이 있어도 할 수 있는 일과 함께 의논할 일을 나누어 말해 주세요.',
    example:'예를 들어 함께 여행을 준비한다고 해 볼게요. 상대는 시간과 비용을 먼저 정리하고 싶고, 나는 누가 예약하고 누가 일정을 확인할지부터 알아야 마음이 놓일 수 있어요.',
    adjustment:'“예약은 내가 할 수 있어. 일정 확인은 같이 했으면 해”처럼 맡을 수 있는 범위를 먼저 말해 보세요. 필요한 시간과 비용도 함께 확인하면 두 사람이 생각한 계획을 맞추기 쉬워져요.',
    strength:'두 사람은 필요한 준비와 각자의 책임을 함께 정할 때 장점을 살릴 수 있어요. 한 사람이 놓친 조건을 다른 사람이 짚어 주면, 막연했던 계획을 실제로 해 볼 수 있는 일로 정리하기 쉬워져요.',
    difference:'상대가 세운 계획을 내 의무처럼 받아들이거나, 불편한데도 먼저 동의하면 부담이 쌓일 수 있어요. 할 수 있는 일과 다시 의논할 일을 나눠 보세요.',
  },
};

function scopeFor(chart,profile,person) {
  const confirmed=new Set(profile.knownPillars.map(pillar=>pillar.key));
  return {person,knownPillars:profile.knownPillars.map(pillar=>pillar.key),knownCharacterCount:profile.knownCharacterCount,
    excludedPillars:Object.keys(PILLARS).filter(key=>!confirmed.has(key)).map(key=>({key,label:PILLARS[key],reason:chart.pillars.find(pillar=>pillar.key===key)?.reason||'확정된 글자가 없음'}))};
}
function scopeNotice(scopes) {
  const missing=scopes.filter(scope=>scope.excludedPillars.length);
  if(!missing.length)return '';
  return missing.map(scope=>`${scope.person==='self'?'내':'상대'} 사주에서 ${scope.excludedPillars.map(pillar=>pillar.label).join('·')}에 해당하는 글자가 확정되지 않아 그 부분은 비교에서 뺐어요.`).join(' ');
}
function relationLabel(god) {
  return `${god.name}(${god.hanja}) · ${GOD_REFERENCE[god.code].meaning}`;
}
function interactionText(match) {
  return `내 ${match.selfPillarLabel} ${POSITION[match.position]} ${character(match.birthCharacter)} ↔ 상대 ${match.partnerPillarLabel} ${POSITION[match.position]} ${character(match.otherCharacter)}: ${match.label} ${match.pairHangul}(${match.pairHanja}).`;
}
function compareZodiac(profiles,zodiac,interactions) {
  const years=Object.fromEntries(['self','partner'].map(person=>[person,profiles[person].knownPillars.find(pillar=>pillar.key==='year')]));
  const matches=interactions.filter(match=>match.selfPillarKey==='year'&&match.partnerPillarKey==='year'&&match.position==='branch');
  const confirmed=years.self&&years.partner&&zodiac.self.status==='confirmed'&&zodiac.partner.status==='confirmed';
  const kind=!confirmed?'unconfirmed':matches.some(match=>match.kind==='branch-combination')?'combination'
    :matches.some(match=>match.kind==='branch-clash')?'clash':years.self.branch.hanja===years.partner.branch.hanja?'same':'none';
  return {kind,matches};
}
function allFacts(profiles,scopes,relation,comparisons,interactions,zodiac,zodiacRelation) {
  const facts=[];
  const add=(id,label,value)=>{facts.push({id,label,value,origin:'calculation'});return id;};
  for(const person of ['self','partner']) {
    const profile=profiles[person],scope=scopes.find(value=>value.person===person);
    add(`${person}.scope`,`${person==='self'?'내':'상대'} 사주에서 확인한 범위`,`${profile.knownCharacterCount}글자 · ${profile.knownPillars.map(pillar=>pillar.label).join('·')} 확인${scope.excludedPillars.length?` · ${scope.excludedPillars.map(value=>value.label).join('·')} 제외`:''}.`);
    for(const pillar of profile.knownPillars)add(`${person}.pillar.${pillar.key}`,personPillar(person,pillar),`${pillar.hangul}(${pillar.hanja}) · ${POSITION.stem} ${character(pillar.stem)} · ${POSITION.branch} ${character(pillar.branch)}.`);
    for(const missing of scope.excludedPillars)add(`${person}.excluded.${missing.key}`,`${person==='self'?'내':'상대'} ${missing.label} 제외`,missing.reason);
    add(`${person}.day-master`,`${person==='self'?'내':'상대'} 일간`,`${character(profile.dayMaster)} · ${ELEMENTS[profile.dayMaster.element]}(${profile.dayMaster.elementHanja}) · ${profile.dayMaster.yinYang}.`);
    add(`${person}.elements`,`${person==='self'?'내':'상대'} 확정 글자의 오행 분포`,`${profile.elements.map(element=>`${ELEMENTS[element.key]} ${element.count}개`).join(' · ')}. 전체 ${profile.knownCharacterCount}글자로 비중을 계산하며 미확정 글자는 포함하지 않았어요.`);
    const animal=zodiac[person];
    add(`${person}.zodiac`,`${person==='self'?'내':'상대'} 띠`,`${animal.status==='uncertain'?'후보 ':''}${animal.label} · ${animal.basis}${animal.candidates.length?` · 년지 ${animal.candidates.map(character).join(' / ')}`:''}${animal.status==='confirmed'?'':` · ${animal.note}`}.`);
  }
  add('day-master.self-to-partner','내 기준에서 상대의 일간을 비교',`${character(profiles.self.dayMaster)} → ${character(profiles.partner.dayMaster)}: ${relationLabel(relation.self)}.`);
  add('day-master.partner-to-self','상대 기준에서 내 일간을 비교',`${character(profiles.partner.dayMaster)} → ${character(profiles.self.dayMaster)}: ${relationLabel(relation.partner)}.`);
  for(const comparison of comparisons) {
    add(comparison.id,`내 ${comparison.self.label} ↔ 상대 ${comparison.partner.label}`,
      `내 ${comparison.self.hangul}(${comparison.self.hanja})과 상대 ${comparison.partner.hangul}(${comparison.partner.hanja}): ${comparison.interactions.length?comparison.interactions.map(value=>`${value.label} ${value.pairHangul}(${value.pairHanja})`).join(' · '):'비교한 천간합·지지육합·지지충에 해당하는 짝 없음'}.`);
  }
  for(const match of interactions)add(match.id,`${match.label} · 내 ${match.selfPillarLabel}와 상대 ${match.partnerPillarLabel}`,interactionText(match));
  const selfDay=profiles.self.knownPillars.find(pillar=>pillar.key==='day'),partnerDay=profiles.partner.knownPillars.find(pillar=>pillar.key==='day');
  const dayMatches=interactions.filter(match=>match.selfPillarKey==='day'&&match.partnerPillarKey==='day'&&match.position==='branch');
  add('day-branches','두 사람의 일지 비교',`내 일지 ${character(selfDay.branch)} · 상대 일지 ${character(partnerDay.branch)}: ${dayMatches.length?dayMatches.map(match=>match.label).join('·'):selfDay.branch.hanja===partnerDay.branch.hanja?'같은 글자이며 비교한 육합·충에는 해당하지 않음':'비교한 육합·충에 해당하는 짝 없음'}.`);
  const zodiacResult=zodiacRelation.kind==='unconfirmed'?'한쪽 이상의 띠가 확정되지 않아 년지끼리의 육합·충 비교를 보류함'
    :zodiacRelation.matches.length?zodiacRelation.matches.map(match=>`${match.label} ${match.pairHangul}(${match.pairHanja})`).join(' · ')
      :zodiacRelation.kind==='same'?'같은 띠이며 비교한 년지 육합·충에는 해당하지 않음':'비교한 년지 육합·충에 해당하는 짝 없음';
  add('zodiac.comparison','태어난 해의 띠끼리 비교',`내 ${zodiac.self.label} · 상대 ${zodiac.partner.label}: ${zodiacResult}. 입춘 기준의 년지만 비교한 결과이며 사주 전체의 궁합 점수가 아니에요.`);
  add('comparison.scope','관계를 비교한 전체 범위',`확정된 내 ${profiles.self.knownPillars.length}개 기둥 × 상대 ${profiles.partner.knownPillars.length}개 기둥 = ${comparisons.length}개 기둥 쌍의 위·아래 글자를 모두 비교했어요.`);
  add('interaction.counts','확인한 합·충의 개수',`천간합 ${interactions.filter(match=>match.kind==='stem-combination').length}쌍 · 지지육합 ${interactions.filter(match=>match.kind==='branch-combination').length}쌍 · 지지충 ${interactions.filter(match=>match.kind==='branch-clash').length}쌍. 같은 짝도 나타난 위치를 각각 남겼으며, 이 개수는 궁합 점수가 아니에요.`);
  return facts;
}

function makeCards(base,relations,profiles,facts,zodiac,zodiacRelation) {
  const registry=new Set(facts.map(fact=>fact.id));
  const common=['self.scope','partner.scope','self.day-master','partner.day-master','day-master.self-to-partner','day-master.partner-to-self'];
  const matches=relations.filter(match=>match.kind!=='branch-clash'),clashes=relations.filter(match=>match.kind==='branch-clash');
  const comparedIds=facts.filter(fact=>fact.id.startsWith('comparison.')).map(fact=>fact.id);
  const sourceIds=unique([...common,...comparedIds,...relations.map(match=>match.id)]);
  const card=(id,label,title,paragraphs,factIds)=>{
    const linked=unique(factIds);
    if(linked.some(value=>!registry.has(value)))throw new Error('두 사람 풀이의 계산 근거를 확인하지 못했어요.');
    return {id,label,title,paragraphs,factIds:linked,origin:ORIGIN};
  };
  const cards=[card('foundation','서로의 기본 모습',base.title,[base.meaning,base.sides,base.example,base.adjustment,
    '한 번 이야기한 뒤에는 “내가 이해한 네 뜻은 이런데 맞아?”라고 되짚어 보세요. 내가 짐작한 마음과 상대가 직접 말한 마음을 나눠 들을 수 있어요.'],common)];
  const zodiacIds=['self.zodiac','partner.zodiac','zodiac.comparison',...['self','partner'].map(person=>registry.has(`${person}.pillar.year`)?`${person}.pillar.year`:`${person}.excluded.year`),...zodiacRelation.matches.map(match=>match.id)];
  const zodiacPair=`내 ${zodiac.self.label}와 상대 ${zodiac.partner.label}`;
  const zodiacStories={
    combination:{title:'함께할 일을 정하면 서로의 힘을 보태기 좋은 띠 조합이에요',paragraphs:[
      `${zodiacPair}는 육합으로 이어지는 짝이에요. 띠 관계에서는 서로 다른 몫을 맞물려 함께하는 쪽으로 읽어요.`,
      '처음부터 같은 방법을 고르기보다, 함께 이루고 싶은 일을 먼저 정해 보세요. 내가 편하게 맡을 일과 상대가 잘할 일을 나누면 각자의 장점을 함께 쓸 수 있어요.',
      '예를 들어 둘이 모임을 준비한다고 해 볼게요. 한 사람은 참석할 사람들의 의견을 모으고, 다른 사람은 모인 의견에 맞춰 장소를 알아볼 수 있어요. 서로 맡은 일이 이어지도록 정하는 장면이에요.',
      '“나는 의견을 모을게. 네가 장소를 찾아볼 수 있을까?”처럼 부탁할 범위를 말해 주세요. 같은 목표를 가졌더라도 어느 한쪽이 모든 일을 맡으면 함께하는 즐거움이 줄어들 수 있어요.',
      '끝난 뒤에는 잘 맞았던 역할을 기억해 두세요. 다음에는 누가 무엇을 맡으면 편할지 이야기하고, 상대가 힘들었던 부분은 다시 나누면 돼요.',
    ]},
    clash:{title:'결정하는 속도와 우선순위의 차이를 먼저 맞춰 보세요',paragraphs:[
      `${zodiacPair}는 충에 해당하는 짝이에요. 띠 관계에서는 서로 다른 방향을 조정하는 일이 중요하게 읽혀요.`,
      '같은 제안을 들어도 한 사람은 빨리 정하고 싶고, 다른 사람은 조건을 더 살피고 싶을 수 있어요. 의견이 갈릴 때는 찬성과 반대부터 묻기보다 각자가 먼저 챙기려는 것을 들어 보세요.',
      '예를 들어 함께 살 물건을 고른다고 해 볼게요. 한 사람은 지금 필요한 기능을, 다른 사람은 오래 쓸 수 있는지를 먼저 볼 수 있어요. 둘 중 하나만 옳다고 정하면 서로의 이유가 잘 들리지 않아요.',
      '각자 포기하기 어려운 조건을 하나씩 말하고, 공통으로 맞출 수 있는 범위를 정해 보세요. 당장 결정하기 어렵다면 언제 다시 이야기할지 정해 두면 재촉하거나 피하는 상황을 줄일 수 있어요.',
      '불편했던 순간에는 “왜 나와 달라?”보다 “이 선택에서 너는 무엇이 가장 중요해?”라고 물어보세요. 차이를 말로 확인하는 행동이 두 사람이 함께 정할 수 있는 선택지를 넓혀 줘요.',
    ]},
    same:{title:'같은 띠여도 각자가 편한 방식은 따로 들어 보세요',paragraphs:[
      `두 사람은 같은 ${zodiac.self.label}예요. 이 년지끼리의 비교에서는 육합이나 충의 짝에 해당하지 않아요.`,
      '익숙하게 느껴지는 점이 있더라도 좋아하는 것과 싫어하는 것까지 같다고 생각하지는 마세요. 같은 띠 안에서도 태어난 달·날·시간이 달라 두 사람의 다른 모습이 함께 나타날 수 있어요.',
      '예를 들어 함께 쉬는 날을 보낸다고 해 볼게요. 나는 아무 계획 없이 쉬고 싶은데 상대는 작은 외출을 기대할 수 있어요. “나와 같겠지”라고 넘겼던 바람을 직접 물어보는 장면이에요.',
      '먼저 각자 오늘 하고 싶은 일과 쉬고 싶은 시간을 말해 보세요. 함께할 시간 한 가지를 정하고 나머지는 각자의 선택으로 남겨 두는 방법도 있어요.',
      '두 사람이 실제로 즐거웠던 일을 기준으로 다음 약속을 정해 보세요. 닮은 점은 함께 즐기고, 다른 점은 어느 한쪽이 참고 있다는 뜻인지 차분히 확인하면 돼요.',
    ]},
    none:{title:'띠의 짝보다 두 사람이 주고받는 도움을 살펴보세요',paragraphs:[
      `${zodiacPair}는 이 계산에서 육합이나 충으로 직접 연결되는 짝에 해당하지 않아요. 이 사실만으로 궁합이 좋거나 나쁘다고 정하지는 않아요.`,
      '두 사람이 잘 맞는 지점은 다른 사주 글자의 관계와 실제로 편했던 경험을 함께 살펴보세요. 띠 비교에서 특정한 짝이 없다는 이유로 서로의 장점까지 없다고 볼 필요는 없어요.',
      '예를 들어 한 사람이 고민을 털어놓는다고 해 볼게요. 함께 해결책을 찾는 시간이 도움이 될 수도 있고, 조용히 들어 주는 시간이 더 편할 수도 있어요. 어떤 도움을 반기는지 알아보는 장면이에요.',
      '“지금은 같이 방법을 찾을까, 이야기를 들어 줄까?”라고 먼저 물어보세요. 상대가 원하는 도움을 들은 뒤 내가 할 수 있는 범위에서 건네면 돼요.',
      '도움을 주고받은 뒤에는 무엇이 편했고 무엇은 부담스러웠는지 짧게 나눠 보세요. 그런 경험이 쌓이면 두 사람에게 맞는 연락과 약속의 방식도 구체적으로 정할 수 있어요.',
    ]},
    unconfirmed:{title:['self','partner'].some(person=>zodiac[person].status==='uncertain')?'띠를 하나로 정할 수 없어 후보를 함께 보여드려요':'띠를 확인할 출생 정보가 더 필요해요',paragraphs:[
      ['self','partner'].map(person=>`${person==='self'?'내':'상대'} 띠${zodiac[person].status==='uncertain'?' 후보':''}: ${zodiac[person].label}`).join(' · ')+'.',
      ...['self','partner'].filter(person=>zodiac[person].status!=='confirmed').map(person=>`${person==='self'?'내':'상대'} 출생 정보는 ${zodiac[person].note}`),
      '띠끼리의 육합·충은 확정하지 않았어요. 다른 단원에서는 두 사람의 확인된 달·날·시간 가운데 비교할 수 있는 내용으로 궁합을 이어서 보여드려요.',
    ]},
  };
  const zodiacStory=zodiacStories[zodiacRelation.kind];
  cards.push(card('zodiac','두 사람의 띠',zodiacStory.title,zodiacStory.paragraphs,zodiacIds));
  cards.push(card('connection','잘 맞을 수 있는 점',matches.length?'서로 다른 부분을 함께할 방법으로 이어 보세요':'함께할 방법은 두 사람의 기본 관계에서 찾아봐요',[
    matches.length?'두 사람은 서로 다른 장점을 한 가지 일에 보태는 쪽으로 관계를 풀어 갈 만해요. 방법이 조금 달라도 함께 이루고 싶은 것을 정하면 각자 잘하는 부분을 나눠 맡을 수 있어요.':'함께할 때는 취향이 얼마나 같은지보다 서로 어떤 도움을 주고받는지가 중요해요. 내가 편하게 해낼 수 있는 일과 상대가 잘하는 일을 구체적으로 알아보면 두 사람에게 맞는 역할을 찾을 수 있어요.',
    base.strength,
    '예를 들어 함께 식사를 준비한다고 해 볼게요. 한 사람이 장을 볼 내용을 정하고 다른 사람이 만들 순서를 정할 수도 있어요. 처음부터 방법이 같을 필요는 없고, 둘 다 할 수 있는 몫을 찾는 게 먼저예요.',
    '그다음에는 “이 부분은 내가 하고, 저 부분은 네가 해 줄 수 있을까?”처럼 서로의 몫을 물어보세요. 어느 한쪽이 알아서 해 주기를 기다리는 것보다 함께 정한 일을 확인하기 쉬워져요.',
    '일을 마친 뒤에는 좋았던 점을 행동으로 말해 보세요. “네가 시간을 미리 확인해 줘서 편했어”처럼 무엇이 도움이 됐는지 말하면 다음에도 이어 갈 방법을 찾을 수 있어요.',
  ],sourceIds));
  cards.push(card('differences','다르게 느낄 수 있는 점',clashes.length?'같은 일을 다르게 받아들이는 부분을 하나씩 맞춰 보세요':'다른 점은 짐작하지 말고 실제 바람부터 확인해 보세요',[
    clashes.length?'두 사람은 같은 일을 두고도 먼저 챙기고 싶은 것이 달라질 수 있는 관계로 읽혀요. 한 사람에게는 속도가 중요하고 다른 사람에게는 준비가 중요할 수 있으니, 의견이 다를 때 무엇을 놓치고 싶지 않은지 먼저 들어 보세요.':'서로에게 바라는 것을 말하지 않은 채 알아주길 기다리면 작은 불편이 쌓일 수 있어요. 두 사람의 생각이 같은지 짐작하기보다, 이번 일에서 각자 바라는 것을 한 가지씩 말해 보세요.',
    base.difference,
    '예를 들어 약속 시간이 바뀌었다고 해 볼게요. 한 사람은 “조금 늦어도 괜찮다”고 생각하고, 다른 사람은 “바뀌면 미리 알려 줬으면 좋겠다”고 생각할 수 있어요. 같은 늦음이라도 불편했던 이유는 다를 수 있지요.',
    '이때는 “너는 늘 이래”보다 “시간이 바뀐 걸 몰라서 기다리기 어려웠어”처럼 실제 있었던 일과 내 불편을 나누어 말해 보세요. 상대도 무엇을 바꾸면 좋을지 구체적으로 이해할 수 있어요.',
    '그다음에는 한 번에 한 가지 약속을 정해 보세요. 늦어질 때 연락하는 방법이나 일정을 다시 정하는 순서처럼, 다음에 확인할 수 있는 작은 약속이면 충분해요.',
  ],sourceIds));
  const selfDay=profiles.self.knownPillars.find(pillar=>pillar.key==='day'),partnerDay=profiles.partner.knownPillars.find(pillar=>pillar.key==='day');
  const dayRelations=relations.filter(match=>match.selfPillarKey==='day'&&match.partnerPillarKey==='day'&&match.position==='branch');
  const dayClash=dayRelations.some(match=>match.kind==='branch-clash'),dayConnection=dayRelations.some(match=>match.kind==='branch-combination');
  const dayOpening=dayClash?'가까이 지낼수록 연락하는 방식이나 쉬는 시간처럼 반복되는 작은 차이를 맞추는 일이 중요하게 읽혀요. 내게 자연스러운 하루가 상대에게도 편한지 물어보면, 애정과 생활 습관을 섞어서 오해하는 일을 줄일 수 있어요.'
    :dayConnection?'두 사람은 일상 속 작은 약속을 함께 만들어 가는 쪽으로 가까워질 수 있는 관계로 읽혀요. 연락할 때나 함께 쉬는 방법을 조금씩 맞추면 서로의 하루에 편하게 들어갈 방법을 찾을 수 있어요.'
    :selfDay.branch.hanja===partnerDay.branch.hanja?'두 사람의 일상에서는 익숙하게 느끼는 모습이 있을 수 있어요. 닮은 점이 보여도 쉬고 싶은 시간이나 연락을 기다리는 마음까지 같지는 않을 수 있으니, 각자 편한 하루를 구체적으로 나눠 보세요.'
    :'가까이 지낼 때 필요한 것은 각자의 하루를 서로 알아 가는 일이에요. 바쁜 시간, 혼자 쉬고 싶은 시간, 함께하고 싶은 일을 알려 주면 서로에게 맞추느라 무리하는 부분을 줄일 수 있어요.';
  cards.push(card('everyday','가까이 지낼 때',dayClash?'연락과 쉬는 시간의 차이를 미리 이야기해 보세요':dayConnection?'작은 약속을 함께 만들며 서로의 일상을 알아가세요':'서로 편한 하루를 구체적으로 이야기해 보세요',[
    dayOpening,
    '예를 들어 일을 마친 뒤의 시간을 떠올려 보세요. 한 사람은 바로 이야기를 나누고 싶고 다른 사람은 잠깐 혼자 쉬고 싶을 수 있어요. 답이 늦은 이유를 마음이 멀어졌기 때문이라고 먼저 정하지 않아도 돼요.',
    '“집에 오면 잠깐 쉬고 이야기하고 싶어” 또는 “바로 답하기 어려우면 나중에 연락한다고 알려 줬으면 해”처럼 내게 편한 방법을 말해 보세요. 시간을 정할 때는 상대도 가능한지 함께 물어보면 돼요.',
    '한 번 정한 방법이 매일 그대로 맞지는 않을 수 있어요. 바쁜 날이나 아픈 날처럼 사정이 달라졌다면, 그날의 상황을 알려 주고 약속을 다시 맞출 수 있어요.',
    '가까운 관계일수록 큰 말보다 반복되는 작은 행동을 확인해 보세요. 서로 정한 방법이 실제로 편했는지 묻고 조금씩 바꾸는 과정이 두 사람의 생활을 알아가는 데 도움이 돼요.',
  ],[...common,'self.pillar.day','partner.pillar.day','comparison.day.day','day-branches',...dayRelations.map(match=>match.id)]));
  const talkTitle=matches.length&&clashes.length?'잘 이어지는 부분과 다시 맞출 부분을 나눠 이야기하세요'
    :clashes.length?'서로 다르게 이해한 한 가지부터 다시 맞춰 보세요'
    :matches.length?'서로 맞춘 내용을 작은 약속으로 남겨 보세요':'서로의 기준을 듣고 함께할 방법을 정해 보세요';
  cards.push(card('conversation','대화와 조율 방법',talkTitle,[
    matches.length&&clashes.length?'두 사람에게는 함께 힘을 보탤 부분과 서로의 차이를 맞출 부분이 함께 보여요. 잘 통했던 일과 다시 이야기할 일을 나누어 보면, 한 번의 불편 때문에 좋았던 부분까지 놓치는 일을 줄일 수 있어요.'
      :clashes.length?'두 사람의 대화에서는 같은 말을 서로 다르게 이해한 부분부터 확인하는 것이 중요해요. 누가 잘못했는지 먼저 정하기보다 각자 무엇을 기대했고 어떤 점에서 불편했는지 들어 보세요.'
      :matches.length?'두 사람은 서로 이해한 것을 작은 약속으로 이어 갈 때 관계의 장점을 살릴 수 있어요. “잘해 보자”라고 끝내기보다 무엇을 함께하고 어떤 부분은 각자 맡을지 한 걸음 더 구체적으로 말해 보세요.'
      :'대화할 때는 상대가 알아서 맞춰 주길 기다리기보다 내 바람을 먼저 쉽게 말해 보세요. 서로 원하는 것을 들은 뒤 둘 다 해 볼 수 있는 일을 하나씩 정하면 함께할 방법이 구체적으로 보이기 시작해요.',
    '일단 두 사람이 함께 바꿔 보고 싶은 장면 하나를 고르세요. 연락, 함께 쓰는 돈, 약속을 준비하는 일 가운데 지금 가장 이야기하고 싶은 것을 정하면 대화가 여러 문제로 한꺼번에 번지지 않아요.',
    '실제로 대화할 때는 세 가지를 차례로 말해 보세요. 먼저 “이런 일이 있었어”라고 상황을 말하고, “나는 이렇게 느꼈어”라고 내 마음을 말한 뒤, “다음에는 이렇게 해 보면 어때?”라고 한 가지 방법을 제안하는 거예요.',
    '상대의 답을 들은 뒤에는 “그러면 너는 이 부분이 중요했던 거네”라고 내가 이해한 뜻을 확인해 보세요. 상대가 아니라고 하면, 바로 반박하기보다 어느 부분이 다른지 다시 물을 수 있어요.',
    '마지막으로 두 사람이 모두 해 볼 수 있는 작은 약속 하나를 정해 보세요. 며칠 지내 본 뒤 편했던 점과 어려웠던 점을 다시 이야기하면, 두 사람에게 맞는 방법을 조금씩 구체적으로 만들어 갈 수 있어요.',
  ],sourceIds));
  return cards;
}

/** Pure local comparison; callers own birth entry and any existing access gate. */
export function buildCompatibilityReading(chart,partnerChart) {
  const profiles={self:checkedProfile(chart,'self'),partner:checkedProfile(partnerChart,'partner')};
  const zodiac={self:zodiacFromChart(chart),partner:zodiacFromChart(partnerChart)};
  const scopes=[scopeFor(chart,profiles.self,'self'),scopeFor(partnerChart,profiles.partner,'partner')];
  const dayMasterRelation={self:getTenGod(profiles.self.dayMaster,profiles.partner.dayMaster),partner:getTenGod(profiles.partner.dayMaster,profiles.self.dayMaster)};
  const comparisons=[],interactions=[];
  for(const self of profiles.self.knownPillars)for(const partner of profiles.partner.knownPillars) {
    const matches=interactionPairs(self,partner,{
      selfPillarKey:self.key,selfPillarLabel:self.label,partnerPillarKey:partner.key,partnerPillarLabel:partner.label,
    }).map(match=>({...match,id:`interaction.${self.key}.${partner.key}.${match.kind}`}));
    comparisons.push({id:`comparison.${self.key}.${partner.key}`,self:{key:self.key,label:self.label,hanja:self.hanja,hangul:self.hangul},partner:{key:partner.key,label:partner.label,hanja:partner.hanja,hangul:partner.hangul},interactions:matches});
    interactions.push(...matches);
  }
  const zodiacRelation=compareZodiac(profiles,zodiac,interactions);
  const facts=allFacts(profiles,scopes,dayMasterRelation,comparisons,interactions,zodiac,zodiacRelation);
  const {score,facts:scoreFacts}=buildCompatibilityScore({profiles,comparisons,interactions});
  facts.push(...scoreFacts);
  const base=BASE_STORIES[dayMasterRelation.self.group];
  const selfTheme=STEM_THEMES[profiles.self.dayMaster.hanja],partnerTheme=STEM_THEMES[profiles.partner.dayMaster.hanja];
  const personalOpening=profiles.self.dayMaster.hanja===profiles.partner.dayMaster.hanja
    ?`두 사람 모두 ${selfTheme}이 보여요. 서로 익숙하게 느끼는 면이 있어도 각자가 정한 기준은 다를 수 있으니, 닮은 점을 발판 삼아 원하는 것을 편하게 이야기해 보세요.`
    :`내게는 ${selfTheme}이, 상대에게는 ${partnerTheme}이 보여요. 각자의 방식이 다른 만큼 한 사람이 자연스럽게 하는 일을 다른 사람이 새롭게 배우는 장면도 생길 수 있어요.`;
  const connections=interactions.some(match=>match.kind!=='branch-clash'),clashes=interactions.some(match=>match.kind==='branch-clash');
  const relationParagraph=connections&&clashes?'두 사람은 힘을 합쳐 함께할 부분과 서로 다른 속도나 기준을 맞출 부분이 함께 있는 관계로 읽혀요. 잘 통하는 점을 살리면서 불편한 장면은 하나씩 이야기하는 편이 좋아요.'
    :clashes?'두 사람은 같은 상황을 다르게 받아들이는 부분을 차근차근 맞춰 가는 일이 중요하게 읽혀요. 상대의 반응을 마음의 크기로 판단하기 전에 무엇이 중요했는지 물어보세요.'
    :connections?'두 사람은 각자의 장점을 보태며 함께할 방법을 찾는 쪽으로 읽혀요. 서로 편하게 해낼 수 있는 몫을 나누고 작은 약속을 지키는 과정에서 관계의 장점을 살려 보세요.'
    :'서로에게 기대하는 도움과 함께 지키고 싶은 약속을 나누어 보면 좋아요. 아래에서 두 사람이 가까워질 때 살릴 점, 다르게 느낄 수 있는 점, 일상을 맞추는 방법을 이어서 살펴볼게요.';
  return {
    title:'두 사람의 궁합',headline:base.headline,paragraphs:[personalOpening,relationParagraph],
    cards:makeCards(base,interactions,profiles,facts,zodiac,zodiacRelation),facts,score,origin:ORIGIN,
    scopeNotice:scopeNotice(scopes),
    methodNotice:'확정된 두 사주의 일간 관계와 모든 기둥 사이의 천간합·지지육합·지지충을 비교했어요. 띠는 입춘 기준 년지로 표시하고, 띠끼리는 년지의 육합·충만 따로 보여줘요. 해석과 가상 예시는 계산 결과에 연결한 공통 참고 풀이이며, 같은 관계에는 같은 설명을 써요. 점수는 오쭈다 고정 규칙으로 비교한 참고값이며 실제 관계의 성공 확률이 아니에요. 합화의 성립, 결혼·이별의 시기나 실제 사건은 계산하지 않아요. 합은 좋은 결과를 보장하지 않고, 충은 이별을 뜻하지 않아요.',
    dayMasterRelation,interactions,comparisons,zodiac,zodiacRelation:zodiacRelation.kind,scope:{self:scopes[0],partner:scopes[1]},
    rules:Object.fromEntries(unique(interactions.map(match=>match.kind)).map(kind=>[kind,{...RELATION_REFERENCE[kind]}])),
  };
}
