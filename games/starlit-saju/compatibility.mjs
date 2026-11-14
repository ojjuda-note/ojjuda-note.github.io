import { getTenGod, makeProfile, interactionPairs } from './fortune-data.mjs?v=20261114-saju-correction1';
import { GOD_REFERENCE, RELATION_REFERENCE } from './readings-data.mjs?v=20261114-saju-depth1';
import { zodiacFromChart } from './zodiac.mjs?v=20261114-saju-depth1';
import { buildCompatibilityScore } from './compatibility-score.mjs?v=20261114-saju-copy1';
import { buildCompatibilityPeople } from './compatibility-people.mjs?v=20261114-saju-final-review2';
import { attachCompatibilityDetails } from './compatibility-detail-stories.mjs?v=20261114-saju-final-review2';
import { READING_SCOPES } from './reading-scope.mjs?v=20261114-saju-final-review2';

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
  甲:'할 일을 정하면 꾸준히 이어 가는 편이에요',乙:'상황에 맞게 방법을 바꾸고 사람들과 어울리는 편이에요',
  丙:'생각이나 마음을 말과 행동으로 표현하는 편이에요',丁:'작은 변화를 알아채고 한 가지에 집중하는 편이에요',
  戊:'중요하게 여기는 것을 지키며 하던 일을 이어 가는 편이에요',己:'도움이 필요한 곳을 살피고 차근차근 챙기는 편이에요',
  庚:'필요한 것과 정리할 것을 분명히 나누는 편이에요',辛:'작은 부분도 내 기준에 맞게 꼼꼼히 다듬는 편이에요',
  壬:'여러 사람의 생각을 듣고 함께할 방법을 찾는 편이에요',癸:'바로 답하기보다 조용히 살피며 이해하는 편이에요',
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
    throw new CompatibilityInputError(`${person}-chart`,`${person==='self'?'내':'상대'} 생일을 확인할 수 없어요. 출생 정보를 다시 확인해 주세요.`);
  }
}

const BASE_STORIES={
  peer:{
    headline:'이 관계의 핵심은 가까이 지내면서도 각자의 선택을 존중하는 거예요.',
    title:'함께하고 싶어도 각자의 바람은 따로 물어보세요',
    meaning:'이 궁합에서 중요하게 보는 건 서로의 선택을 존중하는 태도예요. 가까이 지내면서도 자기 생각을 지키려는 모습으로 읽어요. 함께 결정할 때 각자 원하는 것을 말하면 한 사람만 참고 따라가는 일을 줄이는 데 도움이 돼요.',
    sides:'나는 내 방식이 편하고, 상대도 자기 방식이 편할 수 있어요. 서로 좋아해도 쉬는 방법은 다를 수 있지요. 만나고 싶은 사람이나 하루를 보내는 계획도 같을 필요는 없어요.',
    example:'예를 들어 주말을 함께 보낸다고 해 볼게요. 한 사람은 밖에 나가고 싶고 다른 사람은 집에서 쉬고 싶을 수 있어요. 둘 다 상대를 좋아하면서도 그날 필요한 시간은 다를 수 있지요.',
    adjustment:'이럴 때는 “오늘 꼭 하고 싶은 것 하나씩 말해 보자”라고 물어보세요. 오전에는 함께 나가고 오후에는 각자 쉬는 식으로, 함께하는 시간과 혼자 쓰는 시간을 나눠 볼 수 있어요.',
    strength:'두 사람의 강점은 각자의 생각을 나누며 함께 선택하는 데 있어요. 한 사람이 정한 대로 따르기보다 왜 그렇게 하고 싶은지 들어 보세요. 둘 다 이유를 이해하면 함께 정한 일에도 힘을 보태기 쉬워요.',
    difference:'함께 맞출 부분은 각자 편한 방식을 서로 확인하는 일이에요. “내가 편하니까 상대도 편하겠지”라고 생각하면 상대의 바람을 놓칠 수 있어요. 늘 같은 것을 고를 필요는 없으니, 둘 다 자기 의견을 말하고 선택할 수 있는지 살펴보세요.',
  },
  expression:{
    headline:'내 생각과 경험을 상대에게 필요한 도움으로 연결하는 것이 이 관계의 강점이에요.',
    title:'조언하기 전에 어떤 도움이 필요한지 물어보세요',
    meaning:'이 궁합의 강점은 내가 나누는 생각과 경험을 상대에게 필요한 도움으로 연결하는 데 있어요. 아는 것을 설명하거나 함께 해결할 방법을 찾는 식이에요. 어떤 도움을 원하는지는 상대에게 먼저 묻는 것이 중요해요.',
    sides:'나는 돕고 싶은 마음에 답부터 알려 줄 수 있어요. 그런데 상대는 해결책보다 이야기를 들어 줄 사람이 필요할 수도 있지요. 어떤 도움이 필요한지 먼저 물으면 내 정성이 부담으로 느껴지는 일을 줄일 수 있어요.',
    example:'예를 들어 상대가 어려운 일을 이야기한다고 해 볼게요. 나는 함께 방법을 찾으려고 여러 제안을 할 수 있지만, 상대는 우선 자기 이야기를 들어 주길 바랄 수도 있어요.',
    adjustment:'“같이 방법을 찾아볼까, 먼저 들어 줄까?”라고 물어보세요. 상대의 답을 들은 다음 내 생각을 전해도 늦지 않아요. 상대가 필요한 도움을 고를 수 있게 해 주는 거예요.',
    strength:'두 사람의 강점은 내 생각에 상대의 경험을 보태는 데 있어요. 서로의 경험을 들으면 혼자서는 몰랐던 방법을 찾는 데 도움이 돼요. 서로 도운 뒤에는 어떤 말이나 행동이 유용했는지 알려 주세요.',
    difference:'함께 맞출 부분은 도움을 주고받는 방식이에요. 내가 해 주고 싶은 것과 상대가 바라는 것이 다르면, 애써 한 말도 부담이 될 수 있어요. 얼마나 많이 도울지 정하기 전에 지금 무엇이 필요한지 물어보세요.',
  },
  resource:{
    headline:'상대의 생각과 경험을 배우고 내 상황에 맞게 쓰는 것이 이 관계의 강점이에요.',
    title:'고마운 점과 지금 필요한 도움을 함께 말해 보세요',
    meaning:'이 궁합의 강점은 상대의 생각과 경험에서 배우고 필요한 도움을 얻는 데 있어요. 상대의 말을 내 상황에 맞게 받아들이는 것이 핵심이에요. 어떤 조언이 필요한지, 무엇은 직접 정할지 나누어 보면 도움을 고르기 쉬워요.',
    sides:'상대는 나를 돕고 싶어서 방법부터 제안할 수 있어요. 고마운 점은 말해 주되, 지금 필요한 도움도 알려 주세요. 설명을 더 듣고 싶은지, 잠깐 이야기를 들어 주면 되는지 구체적으로 말하면 좋아요.',
    example:'예를 들어 내가 어려운 일을 이야기한다고 해 볼게요. 상대는 함께 방법을 찾으려고 여러 제안을 할 수 있지만, 나는 우선 내 이야기를 들어 주길 바랄 수도 있어요.',
    adjustment:'그럴 때는 “방법을 알려 줘서 고마워. 지금은 이야기를 먼저 들어 줬으면 해”라고 말해 보세요. 원하는 것을 분명히 말하면 상대도 어떻게 도울지 알기 쉬워요.',
    strength:'두 사람의 강점은 상대의 생각에 내 경험을 보태는 데 있어요. 서로의 경험을 함께 놓고 보면 혼자서는 몰랐던 방법을 찾는 데 도움이 돼요. 도움을 받은 뒤에는 어떤 말이나 행동이 유용했는지 알려 주세요.',
    difference:'함께 맞출 부분은 받아들일 조언과 내가 직접 결정할 일의 구분이에요. 고맙다고 해서 모든 조언을 따를 필요는 없어요. 필요한 도움을 말하지 않고 기다리기만 해도 서로 오해할 수 있으니, 무엇을 원하는지 분명히 전해 주세요.',
  },
  wealth:{
    headline:'내가 챙길 돈과 시간, 상대가 맡을 일을 함께 정하는 것이 이 관계의 핵심이에요.',
    title:'돈과 시간을 정할 때 맡을 일도 함께 나눠 보세요',
    meaning:'함께 맞출 부분은 준비와 역할이에요. 이 관계에서는 나는 함께 쓸 돈과 시간을 먼저 챙기는 쪽으로, 상대는 자신이 무엇을 맡을지 확인하는 쪽으로 읽어요. 준비할 것과 각자 할 일을 함께 정하면 서로 다른 기대를 하고 시작하는 일을 줄이는 데 도움이 돼요.',
    sides:'나는 준비를 마쳤으니 바로 시작해도 된다고 생각할 수 있어요. 하지만 상대는 맡을 일을 알아야 마음이 놓일 수 있지요. 돈을 마련했는지만 보지 말고, 누가 어디까지 하기로 했는지도 확인해 주세요.',
    example:'예를 들어 함께 여행을 준비한다고 해 볼게요. 나는 시간과 비용을 먼저 정리하고 싶고, 상대는 누가 예약하고 누가 일정을 확인할지부터 알아야 마음이 놓일 수 있어요.',
    adjustment:'“여기에 쓸 돈은 이 정도로 생각했어. 너는 어느 부분을 맡고 싶어?”처럼 계획과 역할을 함께 물어보세요. 상대가 다른 방식을 원한다면 그 이유도 듣고 다시 나눌 수 있어요.',
    strength:'두 사람의 강점은 필요한 준비와 각자 할 일을 하나의 계획으로 모으는 데 있어요. 내가 놓친 것을 상대가 알아채고, 상대가 어려워하는 일을 내가 도울 수 있지요. 이렇게 나누면 막연한 계획도 시작할 수 있는 일로 정리돼요.',
    difference:'함께 맞출 부분은 제안과 합의의 구분이에요. 내 계획에 상대도 동의했다고 넘겨짚거나 상대가 맡을 일을 미리 정하면 부담을 줄 수 있어요. 내가 제안한 것인지, 두 사람이 함께 정한 것인지 확인해 보세요.',
  },
  authority:{
    headline:'내가 맡을 일과 상대가 챙길 돈·시간을 함께 정하는 것이 이 관계의 핵심이에요.',
    title:'상대의 계획을 듣고 내가 할 수 있는 일을 말해 보세요',
    meaning:'함께 맞출 부분은 각자가 맡을 범위와 필요한 준비예요. 이 관계에서는 나는 어디까지 맡을지 먼저 확인하는 쪽으로, 상대는 함께 쓸 돈과 시간을 챙기는 쪽으로 읽어요. 상대의 계획을 듣고 내가 할 수 있는 일을 말하면, 둘 다 지킬 수 있는 약속을 정하기 쉬워요.',
    sides:'상대는 준비를 마쳤으니 바로 시작해도 된다고 생각할 수 있어요. 하지만 나는 맡을 일을 알아야 마음이 놓일 수 있지요. 돕고 싶더라도 혼자 할 수 있는 일과 함께 의논할 일을 나누어 말해 주세요.',
    example:'예를 들어 함께 여행을 준비한다고 해 볼게요. 상대는 시간과 비용을 먼저 정리하고 싶고, 나는 누가 예약하고 누가 일정을 확인할지부터 알아야 마음이 놓일 수 있어요.',
    adjustment:'“예약은 내가 할 수 있어. 일정 확인은 같이 했으면 해”처럼 말해 보세요. 어디까지 할 수 있는지 먼저 알려 주는 거예요. 필요한 시간과 돈도 함께 확인하면 서로 생각한 계획이 같은지 알기 쉬워요.',
    strength:'두 사람의 강점은 필요한 준비와 각자 할 일을 하나의 계획으로 모으는 데 있어요. 상대가 놓친 것을 내가 알아채고, 내가 어려워하는 일을 상대가 도울 수 있지요. 이렇게 나누면 막연한 계획도 시작할 수 있는 일로 정리돼요.',
    difference:'함께 맞출 부분은 실제로 맡을 책임의 범위예요. 상대가 세운 계획을 내가 모두 책임질 필요는 없어요. 불편한데도 먼저 동의하면 부담이 쌓일 수 있으니, 할 수 있는 일과 다시 의논할 일을 나누어 말해 보세요.',
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
  return missing.map(scope=>`${scope.person==='self'?'내':'상대'} 사주에서 ${scope.excludedPillars.map(pillar=>pillar.label).join('·')}의 글자를 하나로 정할 수 없어요. 이 부분은 빼고 비교했어요.`).join(' ');
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
    '이야기를 들은 뒤에는 “내가 이해한 네 뜻은 이런데 맞아?”라고 물어보세요. 내가 짐작한 것이 맞는지 상대에게 직접 확인하는 거예요.'],common)];
  const zodiacIds=['self.zodiac','partner.zodiac','zodiac.comparison',...['self','partner'].map(person=>registry.has(`${person}.pillar.year`)?`${person}.pillar.year`:`${person}.excluded.year`),...zodiacRelation.matches.map(match=>match.id)];
  const zodiacPair=`내 ${zodiac.self.label}와 상대 ${zodiac.partner.label}`;
  const zodiacStories={
    combination:{title:'같이 할 일을 정하고 잘하는 일을 나눠 맡아 보세요',paragraphs:[
      `${zodiacPair}의 궁합에서 살릴 강점은 서로 잘하는 점을 보태는 거예요. 사주에서는 이 두 띠의 관계를 ‘육합’이라고 불러요.`,
      '처음부터 방법까지 같을 필요는 없어요. 함께 하고 싶은 일을 먼저 정해 보세요. 내가 편하게 할 일과 상대가 잘하는 일을 나누면 두 사람의 장점을 함께 쓸 수 있어요.',
      '예를 들어 둘이 모임을 준비한다고 해 볼게요. 한 사람은 참석할 사람들의 의견을 모으고, 다른 사람은 모인 의견에 맞춰 장소를 알아볼 수 있어요. 서로 맡은 일이 이어지도록 정하는 장면이에요.',
      '“나는 의견을 모을게. 네가 장소를 찾아볼 수 있을까?”처럼 부탁해 보세요. 무엇을 맡아 주면 되는지 분명하게 말하는 거예요. 같은 일을 하고 싶어도 한 사람에게 모두 맡기면 함께하는 즐거움이 줄어들 수 있어요.',
      '끝난 뒤에는 잘 맞았던 역할을 기억해 두세요. 다음에는 누가 무엇을 맡으면 편할지 이야기하고, 상대가 힘들었던 부분은 다시 나누면 돼요.',
    ]},
    clash:{title:'서로 무엇을 먼저 챙기고 싶은지 들어 보세요',paragraphs:[
      `${zodiacPair}의 궁합에서는 생각이 다를 때 결정을 어떻게 맞출지가 핵심이에요. 사주에서는 이 두 띠의 관계를 ‘충’이라고 불러요.`,
      '같은 제안을 들어도 나는 빨리 정하고 싶고, 상대는 더 알아보고 싶을 수 있어요. 의견이 갈리면 찬성인지 반대인지부터 묻지 않아도 돼요. 서로 무엇을 먼저 챙기고 싶은지 들어 보세요.',
      '예를 들어 함께 살 물건을 고른다고 해 볼게요. 한 사람은 지금 필요한 기능을, 다른 사람은 오래 쓸 수 있는지를 먼저 볼 수 있어요. 둘 중 하나만 옳다고 정하면 서로의 이유가 잘 들리지 않아요.',
      '각자 꼭 필요한 조건을 하나씩 말하고, 둘 다 받아들일 수 있는 방법을 찾아보세요. 바로 결정하기 어렵다면 언제 다시 이야기할지 정해 두세요. 한 사람이 재촉하거나 대화를 피하는 일을 줄일 수 있어요.',
      '불편할 때는 “왜 나와 달라?”보다 “너는 여기서 무엇이 가장 중요해?”라고 물어보세요. 서로 중요하게 여기는 것을 알면 함께 고를 수 있는 다른 방법도 찾아보기 쉬워요.',
    ]},
    same:{title:'같은 띠여도 각자가 편한 방식은 따로 들어 보세요',paragraphs:[
      `두 사람은 같은 ${zodiac.self.label}예요. 두 띠만 비교했을 때는 ‘육합’이나 ‘충’에 해당하지 않아요.`,
      '닮은 점이 있어도 좋아하는 것과 싫어하는 것이 모두 같지는 않을 수 있어요. 같은 띠라도 태어난 달·날·시간에 따라 풀이가 달라질 수 있지요. 사주의 다른 글자와 각자가 실제로 원하는 것도 함께 살펴보세요.',
      '예를 들어 함께 쉬는 날을 보낸다고 해 볼게요. 나는 아무 계획 없이 쉬고 싶은데 상대는 작은 외출을 기대할 수 있어요. “나와 같겠지”라고 넘겼던 바람을 직접 물어보는 장면이에요.',
      '먼저 오늘 하고 싶은 일과 쉬고 싶은 시간을 각자 말해 보세요. 함께할 시간을 정하고, 나머지는 각자 편하게 보내는 방법도 있어요.',
      '다음 약속을 잡을 때는 둘 다 즐거웠던 일을 떠올려 보세요. 좋아하는 것이 같으면 함께 즐기면 돼요. 다를 때는 한 사람만 참고 있는 것은 아닌지 물어보세요.',
    ]},
    none:{title:'함께 있을 때 어떤 도움이 편한지 살펴보세요',paragraphs:[
      `${zodiacPair}는 이 계산에서 ‘육합’이나 ‘충’에 해당하지 않아요. 이것만으로 궁합이 좋거나 나쁘다고 정하지는 않아요.`,
      '잘 맞는 점을 알아보려면 다른 사주 글자도 함께 봐야 해요. 실제로 함께 있을 때 편했던 경험도 중요하지요. 두 띠 사이에 특정한 관계가 없다고 해서 서로의 장점까지 없다는 뜻은 아니에요.',
      '예를 들어 한 사람이 고민을 털어놓는다고 해 볼게요. 함께 해결책을 찾는 시간이 도움이 될 수도 있고, 조용히 들어 주는 시간이 더 편할 수도 있어요. 어떤 도움을 반기는지 알아보는 장면이에요.',
      '“지금은 같이 방법을 찾을까, 이야기를 들어 줄까?”라고 먼저 물어보세요. 상대가 원하는 도움을 들은 뒤 내가 할 수 있는 범위에서 건네면 돼요.',
      '서로 도운 뒤에는 편했던 점과 부담스러웠던 점을 짧게 이야기해 보세요. 그런 경험을 바탕으로 얼마나 자주 연락하고 어떻게 약속을 잡으면 좋을지도 함께 정할 수 있어요.',
    ]},
    unconfirmed:{title:['self','partner'].some(person=>zodiac[person].status==='uncertain')?'띠를 하나로 정할 수 없어 가능한 띠를 함께 보여드려요':'띠를 확인하려면 출생 정보가 더 필요해요',paragraphs:[
      ['self','partner'].map(person=>`${person==='self'?'내':'상대'} 띠${zodiac[person].status==='uncertain'?' 후보':''}: ${zodiac[person].label}`).join(' · ')+'.',
      ...['self','partner'].filter(person=>zodiac[person].status!=='confirmed').map(person=>`${person==='self'?'내':'상대'} 띠 안내: ${zodiac[person].note}`),
      '띠끼리의 육합·충은 확정하지 않았어요. 나머지 항목에서는 두 사람의 사주에서 확인된 글자들로 궁합을 보여드려요.',
    ]},
  };
  const zodiacStory=zodiacStories[zodiacRelation.kind];
  cards.push(card('zodiac','두 사람의 띠',zodiacStory.title,zodiacStory.paragraphs,zodiacIds));
  cards.push(card('connection','함께 살릴 강점',matches.length?'각자 잘하는 일을 나누는 것이 강점이에요':'어떤 도움이 편한지 서로 알아가세요',[
    matches.length?'이 궁합에서 살릴 강점은 각자 잘하는 일을 보태는 거예요. 방법이 조금 달라도 함께하고 싶은 일을 먼저 정하면 돼요. 그다음 각자가 편하게 맡을 일을 나누는 것이 중요해요.':'함께할 때 살펴볼 점은 취향과 도움을 주고받는 방식이에요. 내가 편하게 할 수 있는 일과 상대가 잘하는 일을 알면 각자 맡을 일을 찾기 쉬워요.',
    base.strength,
    '예를 들어 함께 식사를 준비한다고 해 볼게요. 한 사람이 살 재료를 고르고 다른 사람이 요리할 순서를 정할 수도 있어요. 처음부터 방법이 같을 필요는 없고, 둘 다 할 수 있는 몫을 찾는 게 먼저예요.',
    '그다음에는 “이건 내가 할게. 저건 네가 해 줄 수 있을까?”라고 물어보세요. 상대가 알아서 해 주기를 기다리기보다, 누가 무엇을 할지 함께 확인하는 거예요.',
    '일을 마친 뒤에는 고마웠던 행동을 구체적으로 말해 보세요. “네가 시간을 미리 확인해 줘서 편했어”처럼 무엇이 도움이 됐는지 말하면 다음에도 이어 갈 방법을 찾을 수 있어요.',
  ],sourceIds));
  cards.push(card('differences','함께 맞출 부분',clashes.length?'의견이 다를 때는 이유부터 들어 보세요':'바라는 것을 짐작하지 말고 직접 물어보세요',[
    clashes.length?'의견이 다를 때 무엇을 먼저 챙기는지 확인하는 것이 이 항목의 핵심이에요. 예를 들어 나는 빨리 하는 것이 중요하고, 상대는 준비를 충분히 하는 것이 중요할 수 있지요. 그럴 때 무엇을 놓치고 싶지 않은지 들어 보세요.':'함께 맞출 부분은 기대하는 것을 말로 확인하는 일이에요. 말하지 않아도 알아주길 기다리면 작은 불편이 쌓일 수 있어요. 서로 생각이 같겠거니 짐작하지 말고, 이번 일에서 바라는 것을 하나씩 말해 보세요.',
    base.difference,
    '예를 들어 약속 시간이 바뀌었다고 해 볼게요. 한 사람은 “조금 늦어도 괜찮다”고 생각하고, 다른 사람은 “바뀌면 미리 알려 줬으면 좋겠다”고 생각할 수 있어요. 약속이 늦어진 같은 상황에서도 불편했던 이유는 다를 수 있지요.',
    '이런 상황에서는 “너는 늘 이래”보다 “시간이 바뀐 걸 몰라서 기다리기 어려웠어”라고 말해 보세요. 무슨 일이 있었고 왜 불편했는지 나누어 설명하는 거예요. 상대도 무엇을 바꾸면 좋을지 이해하기 쉬워요.',
    '그다음에는 한 번에 한 가지 약속을 정해 보세요. 늦어질 때 연락하는 방법이나 일정을 다시 정하는 순서처럼, 다음에 확인할 수 있는 작은 약속이면 충분해요.',
  ],sourceIds));
  const selfDay=profiles.self.knownPillars.find(pillar=>pillar.key==='day'),partnerDay=profiles.partner.knownPillars.find(pillar=>pillar.key==='day');
  const dayRelations=relations.filter(match=>match.selfPillarKey==='day'&&match.partnerPillarKey==='day'&&match.position==='branch');
  const dayClash=dayRelations.some(match=>match.kind==='branch-clash'),dayConnection=dayRelations.some(match=>match.kind==='branch-combination');
  const dayOpening=dayClash?'이 항목에서 먼저 맞출 것은 연락하는 때와 쉬는 방식이에요. 내게 익숙한 생활이 상대에게도 편한지 물어보세요. 서로의 습관을 알면 답장이 늦다는 이유만으로 마음이 멀어졌다고 오해하는 일을 줄이는 데 도움이 돼요.'
    :dayConnection?'작은 생활 약속을 함께 지키는 것이 이 항목에서 살릴 강점이에요. 언제 연락하면 편한지, 쉬는 날에는 무엇을 함께하고 싶은지 물어보세요. 그 답을 바탕으로 둘 다 편한 방법을 찾아가는 거예요.'
    :selfDay.branch.hanja===partnerDay.branch.hanja?'이 풀이에서는 닮은 생활 모습에 주목해요. 그래도 쉬고 싶은 시간이나 답장을 기다리는 마음까지 같지는 않을 수 있지요. 각자 어떤 하루가 편한지 이야기해 보세요.'
    :'가까이 지낼 때의 핵심은 서로의 하루를 구체적으로 아는 거예요. 언제 바쁜지, 언제 혼자 쉬고 싶은지, 무엇을 함께하고 싶은지 알려 주세요. 상대에게 맞추느라 무리하는 일을 줄이는 데 도움이 돼요.';
  cards.push(card('everyday','가까이 지낼 때',dayClash?'연락과 쉬는 시간의 차이를 미리 이야기해 보세요':dayConnection?'작은 약속을 함께 만들며 서로의 일상을 알아가세요':'서로 편한 하루를 구체적으로 이야기해 보세요',[
    dayOpening,
    '예를 들어 일을 마친 뒤의 시간을 떠올려 보세요. 한 사람은 바로 이야기를 나누고 싶고 다른 사람은 잠깐 혼자 쉬고 싶을 수 있어요. 답이 늦은 이유를 마음이 멀어졌기 때문이라고 먼저 정하지 않아도 돼요.',
    '“집에 오면 잠깐 쉬고 이야기하고 싶어” 또는 “바로 답하기 어려우면 나중에 연락한다고 알려 줬으면 해”처럼 내게 편한 방법을 말해 보세요. 시간을 정할 때는 상대도 가능한지 함께 물어보면 돼요.',
    '한 번 정했다고 매일 같은 방법을 지킬 수 있는 것은 아니에요. 바쁘거나 아픈 날에는 사정이 달라질 수 있지요. 그날의 상황을 알려 주고 약속을 다시 정해도 돼요.',
    '가까운 사이일수록 큰 약속만큼 작은 행동도 살펴보세요. 함께 정한 방법이 실제로 편했는지 물어보는 거예요. 불편한 점을 조금씩 바꾸면 서로의 생활을 더 잘 알아갈 수 있어요.',
  ],[...common,'self.pillar.day','partner.pillar.day','comparison.day.day','day-branches',...dayRelations.map(match=>match.id)]));
  const talkTitle=matches.length&&clashes.length?'잘 맞는 점과 불편한 점을 나누어 말해 보세요'
    :clashes.length?'서로 다르게 이해한 일 하나부터 이야기해 보세요'
    :matches.length?'이야기한 뒤에는 함께 지킬 약속을 정해 보세요':'서로 원하는 것을 듣고 함께할 일을 정해 보세요';
  cards.push(card('conversation','편하게 대화하는 방법',talkTitle,[
    matches.length&&clashes.length?'잘 맞는 점과 의견이 다른 점이 함께 있는 관계로 풀이해요. 편했던 일과 다시 이야기할 일을 나누어 보세요. 한 번 불편했다고 좋았던 점까지 모두 잊을 필요는 없어요.'
      :clashes.length?'이 항목의 핵심은 서로의 말뜻을 먼저 확인하는 거예요. 같은 말을 다르게 받아들였다면 누가 잘못했는지부터 정하지 말고, 각자 무엇을 기대했는지 들어 보세요. 어느 부분이 불편했는지 알면 다시 이야기할 일도 분명해져요.'
      :matches.length?'두 사람의 강점은 이해한 내용을 함께 지킬 약속으로 이어 가는 데 있어요. “잘해 보자”에서 끝내지 말고 무엇을 같이 할지 정해 보세요. 각자 맡을 일도 함께 확인하면 좋아요.'
      :'상대가 알아서 맞춰 주길 기다리기보다 내가 원하는 것을 쉬운 말로 알려 주세요. 상대가 원하는 것도 듣고, 둘 다 해 볼 수 있는 일을 하나 정해 보세요. 함께할 방법이 더 분명해져요.',
    '먼저 두 사람이 바꾸고 싶은 일 하나를 고르세요. 연락하는 방법이나 함께 쓰는 돈, 약속을 준비하는 일처럼요. 지금 가장 이야기하고 싶은 것부터 고르면 여러 문제를 한꺼번에 꺼내지 않아도 돼요.',
    '실제로 대화할 때는 세 가지를 차례로 말해 보세요. 먼저 “이런 일이 있었어”라고 상황을 말하고, “나는 이렇게 느꼈어”라고 내 마음을 말한 뒤, “다음에는 이렇게 해 보면 어때?”라고 한 가지 방법을 제안하는 거예요.',
    '상대의 답을 들은 뒤에는 “그러면 너는 이 부분이 중요했던 거네”라고 내가 이해한 뜻을 확인해 보세요. 상대가 아니라고 하면, 바로 반박하기보다 어느 부분이 다른지 다시 물을 수 있어요.',
    '마지막에는 두 사람 모두 지킬 수 있는 작은 약속을 하나 정해 보세요. 며칠 해 본 뒤 편했던 점과 어려웠던 점을 다시 이야기해요. 그렇게 조금씩 바꾸면 둘에게 맞는 방법을 찾아갈 수 있어요.',
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
    ?`사주로 보면 두 사람 모두 ${selfTheme}. 닮은 점이 있어도 중요하게 여기는 것은 다를 수 있어요. 익숙하게 느껴지는 점부터 이야기하고, 각자 원하는 것도 편하게 말해 보세요.`
    :`사주로 보면 나는 ${selfTheme}. 상대는 ${partnerTheme}. 각자 익숙한 방법을 이야기하다 보면 상대가 잘하는 점을 배울 수도 있어요.`;
  const connections=interactions.some(match=>match.kind!=='branch-clash'),clashes=interactions.some(match=>match.kind==='branch-clash');
  const relationParagraph=connections&&clashes?'이 궁합의 핵심은 잘 맞는 점을 살리고 의견이 갈리는 부분은 따로 조율하는 거예요. 잘 통하는 점은 이어 가고, 불편한 일은 하나씩 이야기해 보세요. 일을 정하는 속도나 중요하게 여기는 것이 다를 수 있어요.'
    :clashes?'이 궁합에서는 각자가 어떤 뜻으로 이해했는지 확인하는 일이 중요해요. 반응이 다르다고 마음이 적다고 판단하지는 마세요. 상대에게 무엇이 중요했는지 묻고, 서로 이해한 뜻을 확인해 보세요.'
    :connections?'두 사람의 강점은 각자 잘하는 일을 보태 함께 준비하는 데 있어요. 서로 편하게 할 수 있는 일을 나눠 맡아 보세요. 작은 약속을 함께 지키는 것이 두 사람의 장점을 살리는 방법이에요.'
    :'서로에게 어떤 도움을 바라는지, 함께 지키고 싶은 약속은 무엇인지 이야기해 보세요. 아래에서 잘 맞을 수 있는 점과 다르게 느낄 수 있는 점을 살펴볼게요. 가까이 지낼 때 생활을 함께 맞추는 방법도 알려드려요.';
  const reading={
    title:'두 사람의 궁합',headline:base.headline,paragraphs:[personalOpening,relationParagraph],
    cards:makeCards(base,interactions,profiles,facts,zodiac,zodiacRelation),facts,score,origin:ORIGIN,
    scopeNotice:scopeNotice(scopes),readingScope:READING_SCOPES.compatibility,
    methodNotice:'확인할 수 있는 두 사람의 사주 글자를 모두 비교했어요. 나를 나타내는 글자끼리의 관계(일간 관계)와, 해·달·날·시간의 글자 사이에 있는 천간합·지지육합·지지충을 확인했어요. 띠는 입춘을 기준으로 태어난 해의 아래 글자(년지)에서 가져와요. 띠 항목에는 년지끼리의 육합·충만 따로 보여드려요. 설명과 가상 예시는 계산 결과에 연결한 공통 참고 풀이예요. 같은 관계에는 같은 설명을 써요. 점수는 오쭈다 고정 규칙으로 비교한 참고값이에요. 실제 관계의 성공 확률이 아니에요. 합화가 성립하는지는 계산하지 않아요. 결혼·이별의 시기 같은 실제 사건은 계산하지 않아요. 합이 있다고 좋은 결과를 보장하지 않으며, 충이 있다고 이별한다는 뜻도 아니에요.',
    dayMasterRelation,interactions,comparisons,zodiac,zodiacRelation:zodiacRelation.kind,scope:{self:scopes[0],partner:scopes[1]},
    rules:Object.fromEntries(unique(interactions.map(match=>match.kind)).map(kind=>[kind,{...RELATION_REFERENCE[kind]}])),
  };
  const additions=buildCompatibilityPeople({charts:{self:chart,partner:partnerChart},profiles,scopes:reading.scope,compatibility:reading});
  return attachCompatibilityDetails({...reading,people:additions.people,synthesis:additions.synthesis,facts:[...facts,...additions.facts]});
}
