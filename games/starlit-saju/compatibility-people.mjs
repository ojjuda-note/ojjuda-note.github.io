import { buildNatalReadingData, seasonRules } from './natal-reading-data.mjs?v=20261114-saju-depth1';
import { buildPersonPortrait } from './person-portrait.mjs?v=20261114-saju-copy1';
import { summaryLinesFrom } from './reading-summary-lines.mjs?v=20261114-saju-depth1';

// Reuse the general reading's natal portrait without calculating a forecast.
// A person's words and evidence only depend on that person's confirmed chart.
const ORIGIN='service-reference';
const TOPICS={decisions:'결정하는 방식',relationships:'사람을 대하는 모습',work:'일하는 모습',pressure:'힘들 때 반응',adjustment:'오해받기 쉬운 모습'};
const unique=values=>[...new Set(values)];
const fail=()=>{throw new Error('두 사람의 성향과 연결된 근거를 확인하지 못했어요.');};
const copySections=source=>(source.detailSections||[{title:'자세히 읽어보세요',paragraphs:source.paragraphs}])
  .map(section=>({title:section.title,paragraphs:[...section.paragraphs]}));

// Short, third-person versions of the existing portrait's ten-god meanings.
// These are authored reference clauses, not another classification or score.
const VOICES={
  companion:{relation:'가까워도 각자의 선택과 시간을 존중받고 싶어 하는',decision:'스스로 납득한 이유로 고르려는',scene:'가고 싶은 곳 한 군데는 직접 고르고 싶을 수 있어요.'},
  competitor:{relation:'서로 비슷하게 시간과 정성을 쓰는 관계를 편하게 여기는',decision:'누가 얼마나 준비하고 맡는지 먼저 살피는',scene:'예약과 이동 준비를 어떻게 나눌지 먼저 물을 수 있어요.'},
  creator:{relation:'작게라도 꾸준히 챙기는 행동으로 마음을 전하는',decision:'작게라도 직접 해 보고 판단하는',scene:'짧게 체험할 일을 골라 직접 해 보자고 할 수 있어요.'},
  critic:{relation:'잘 지내고 싶어서 불편한 점도 솔직히 말하는',decision:'왜 그 방법이어야 하는지 묻고 고칠 점을 찾는',scene:'그 장소를 고른 이유를 묻고, 불편한 이동 방법은 바꾸자고 할 수 있어요.'},
  opportunist:{relation:'함께할 일이나 만날 자리를 만들며 가까워지는',decision:'새로운 사람이나 방법까지 찾아 선택지를 넓히는',scene:'다른 장소나 함께할 사람을 떠올리며 선택지를 더할 수 있어요.'},
  manager:{relation:'연락과 약속이 꾸준히 이어질 때 마음을 놓는',decision:'실제로 쓸 시간과 비용부터 확인하는',scene:'이동 시간과 비용을 확인한 뒤 약속을 정하고 싶을 수 있어요.'},
  challenger:{relation:'가까운 사람이 힘들면 해결할 방법부터 찾는',decision:'먼저 해결할 문제를 정하고 움직이는',scene:'예약이 안 되거나 일정이 겹치는 문제부터 해결하려고 할 수 있어요.'},
  officer:{relation:'서로 지킬 약속이 분명할 때 마음을 놓는',decision:'이미 정한 약속과 맡을 일을 확인하는',scene:'이미 정한 시간과 각자 맡기로 한 준비부터 확인할 수 있어요.'},
  explorer:{relation:'생각을 깊게 나누는 대화에서 가까움을 느끼는',decision:'알려진 답도 다른 설명과 조건을 더 살피는',scene:'추천받은 장소도 왜 좋은지 더 알아본 뒤 의견을 말하고 싶을 수 있어요.'},
  scholar:{relation:'끝까지 들어 주고 이유를 설명해 줄 때 마음을 여는',decision:'설명을 듣고 기본을 확인한 뒤 고르는',scene:'처음 가는 곳이라면 이용 방법을 듣고 모르는 조건부터 물을 수 있어요.'},
};

const PAIR_STRENGTH={
  peer:'이 궁합에서 살릴 강점은 각자가 원하는 것을 말하고 함께 결정하는 거예요. 한 사람의 뜻만 따르지 않고 둘의 선택을 나란히 놓는 것이 중요해요.',
  expression:'이 궁합에서 살릴 강점은 A의 생각과 B의 경험을 보태는 거예요. 서로의 이야기를 들으면 혼자서는 몰랐던 방법을 찾는 데 도움이 돼요.',
  resource:'이 궁합에서 살릴 강점은 B의 생각과 A의 경험을 보태는 거예요. 서로의 이야기를 들으면 혼자서는 몰랐던 방법을 찾는 데 도움이 돼요.',
  wealth:'두 사람의 강점은 필요한 준비와 실행할 일을 함께 정하는 데 있어요. A가 함께 쓸 돈과 시간을 챙길 때 B가 맡을 일도 정하면, 막연한 계획을 하나씩 실행하기 쉬워요.',
  authority:'두 사람의 강점은 필요한 준비와 실행할 일을 함께 정하는 데 있어요. B가 함께 쓸 돈과 시간을 챙길 때 A가 맡을 일도 정하면, 막연한 계획을 하나씩 실행하기 쉬워요.',
};

function personFrom(chart,profile,scope,key) {
  const marker=key==='self'?'A':'B',prefix=`person.${key}.`,link=id=>prefix+id;
  const native=buildNatalReadingData(chart,profile),rules=seasonRules(profile);
  const portrait=buildPersonPortrait({profile,facts:native.facts,chapters:[{id:'day-season',rules}]});
  const methodId=prefix+'method';
  const facts=native.facts.map(fact=>({id:link(fact.id),sourceId:fact.id,person:key,kind:fact.kind,
    label:`${marker} · ${fact.label}`,value:fact.text,
    origin:['reference-source','reference-note'].includes(fact.kind)?ORIGIN:'calculation'}));
  const ruleFacts=rules.map(rule=>({id:prefix+'rule.'+rule.id,sourceId:rule.id,person:key,
    kind:'interpretation-rule',label:`${marker} · 계절을 연결한 공통 해석`,value:rule.text,
    origin:rule.origin,factIds:rule.factIds.map(link)}));
  facts.push(...ruleFacts,{id:methodId,person:key,kind:'method',label:`${marker} · 성향 풀이 방법`,
    value:portrait.methodNotice+' '+portrait.selectionNotice,origin:ORIGIN});
  const cards=portrait.cards.map(card=>{
    const topicId=card.id.replace('portrait-','');
    if(!TOPICS[topicId])fail();
    return {...card,id:`person-${key}-${topicId}`,topicId,label:TOPICS[topicId],
      paragraphs:[...card.paragraphs],detailSections:copySections(card),godCodes:[...card.godCodes],ruleIds:[...card.ruleIds],
      sourceId:card.id,sourceFactIds:[...card.factIds],factIds:[...card.factIds.map(link),methodId],
      summaryLines:summaryLinesFrom(card.title,card.paragraphs.at(-1),card.paragraphs)};
  });
  const headline=portrait.headline.replace(/^당신은 /,`${marker}는 `);
  const scopeNotice=scope.excludedPillars.length
    ?`${marker}는 ${scope.excludedPillars.map(pillar=>pillar.label).join('·')}의 글자를 확정할 수 없어요. 이 부분을 채워 넣지 않고, 확인된 ${scope.knownCharacterCount}글자로 성향을 풀이했어요.`:'';
  const person={id:`compatibility-person-${key}`,key,marker,title:`${marker}의 성격과 특징`,headline,
    summaryLines:summaryLinesFrom(headline,cards[0].paragraphs.at(-1),portrait.paragraphs),
    paragraphs:[...portrait.paragraphs],detailSections:copySections(portrait),cards,origin:ORIGIN,
    factIds:unique([...portrait.factIds.map(link),link('natal.scope'),link('natal.season'),link('natal.interaction-count'),
      ...native.natal.pillars.map(link),...ruleFacts.map(fact=>fact.id),methodId]),
    anchorCodes:[...portrait.anchorCodes],godCodes:[...portrait.godCodes],ruleIds:[...portrait.ruleIds],
    methodNotice:portrait.methodNotice,selectionNotice:portrait.selectionNotice,scopeNotice,
    scope:{knownPillars:[...scope.knownPillars],knownCharacterCount:scope.knownCharacterCount,
      excludedPillars:scope.excludedPillars.map(pillar=>({...pillar}))}};
  return {person,facts};
}

function synthesisFrom(people,compatibility) {
  const [a,b]=people;
  const topic=(person,id)=>person.cards.find(card=>card.topicId===id);
  const decisions=people.map(person=>topic(person,'decisions'));
  const relationships=people.map(person=>topic(person,'relationships'));
  const decisionVoices=decisions.map(card=>VOICES[card.godCodes[0]]);
  const relationVoices=relationships.map(card=>VOICES[card.godCodes[0]]);
  const pairStrength=PAIR_STRENGTH[compatibility.dayMasterRelation.self.group];
  if(!pairStrength||decisionVoices.some(value=>!value)||relationVoices.some(value=>!value))fail();
  const samePortrait=JSON.stringify([a.paragraphs,a.cards.map(card=>card.paragraphs)])
    ===JSON.stringify([b.paragraphs,b.cards.map(card=>card.paragraphs)]);
  const sameDecision=decisions[0].godCodes[0]===decisions[1].godCodes[0];
  const sameRelation=relationships[0].godCodes[0]===relationships[1].godCodes[0];
  const connects=compatibility.interactions.some(item=>item.kind!=='branch-clash');
  const clashes=compatibility.interactions.some(item=>item.kind==='branch-clash');
  const methodId='synthesis.method';
  const pairIds=['self.scope','partner.scope','day-master.self-to-partner','day-master.partner-to-self','comparison.scope','interaction.counts',
    ...compatibility.interactions.map(item=>item.id)];
  const introIds=unique([...a.factIds,...b.factIds,...pairIds,methodId]);
  const topicIds=cards=>unique([...cards.flatMap(card=>card.factIds),...pairIds,methodId]);
  const headline=samePortrait?'닮은 성향이 강점이고, 각자의 바람을 확인하는 것이 핵심이에요.':'각자에게 편한 방식을 알고 역할을 나누는 것이 두 사람 궁합의 핵심이에요.';
  const parts=[];
  const add=(id,text,factIds)=>parts.push({id,text,factIds:unique(factIds)});
  const opening=samePortrait
    ?`두 사람의 성향 풀이는 같아요. 둘 다 ${a.headline.replace(/^A는 /,'')} 같은 설명에 해당해도 실제로 좋아하는 것과 겪어 온 일은 다를 수 있어요.`
    :`${a.headline} ${b.headline}`;
  add('strength',pairStrength+' '+opening+(connects?' 서로 잘하는 일을 나누어 맡아 보세요.':''),introIds);
  const relationText=sameRelation
    ?`사람을 대하는 방식에서도 닮은 점이 보여요. 두 사람 모두 ${relationVoices[0].relation} 편으로 풀이해요. 성향이 닮았다는 것과 원하는 답이 같다는 것은 별개예요. 이번에 바라는 것은 직접 물어보세요.`
    :`마음을 주고받을 때 A는 ${relationVoices[0].relation} 편이에요. B는 ${relationVoices[1].relation} 편이에요. 서로의 표현 방식을 알아두면 익숙하지 않은 말이나 행동에 담긴 마음도 이해하기 쉬워요.`;
  add('relationships',relationText,topicIds(relationships));
  const decisionText=sameDecision
    ?`함께 결정할 때도 두 사람 모두 ${decisionVoices[0].decision} 편으로 풀이해요.`
    :`함께 결정할 때 A는 ${decisionVoices[0].decision} 편이고, B는 ${decisionVoices[1].decision} 편이에요. 먼저 확인하고 싶은 것이 다르면, 한쪽은 이미 준비됐다고 느껴도 다른 쪽은 아직 묻고 싶은 것이 남을 수 있어요.`;
  const disagreement=clashes
    ?' 서로 다른 반응을 보일 때는 잠깐 멈춰 이유를 물어보세요. 누가 맞는지 정하기 전에 각자 놓치고 싶지 않은 것을 말해 보세요.'
    :' 같은 생각일 거라 넘기지 말고, 지금 바라는 것을 하나씩 말해 보세요.';
  add('differences',decisionText+disagreement,topicIds(decisions));
  const scene=sameDecision
    ?`예를 들어 둘이 주말 약속을 정한다고 해 볼게요. 두 사람 모두 ${decisionVoices[0].scene} 그때도 각자 꼭 하고 싶은 일을 하나씩 물으면, 같은 방식으로 생각하면서도 놓쳤던 바람을 알 수 있어요.`
    :`예를 들어 둘이 주말 약속을 정한다고 해 볼게요. A는 ${decisionVoices[0].scene} B는 ${decisionVoices[1].scene} 서로 다른 것을 먼저 묻더라도 약속이 싫다는 뜻으로 받아들이지 말고, 무엇을 확인하려는지 들어 보세요.`;
  add('example',scene,topicIds(decisions));
  const actions=relationships.map(card=>card.summaryLines[1]);
  const actionText=actions[0]===actions[1]
    ?`두 사람에게 먼저 권하는 방법은 같아요. ${actions[0]}`
    :`A가 해 볼 방법이에요. ${actions[0]} B가 해 볼 방법이에요. ${actions[1]}`;
  add('adjustment',actionText,topicIds(relationships));
  const agreement=connects&&clashes?'편했던 점과 다시 정할 점을 따로 이야기해 보세요.'
    :clashes?'서로 다르게 이해한 일 하나부터 이야기해 보세요.'
      :connects?'잘 맞았던 방법을 다음 약속에서도 이어 가 보세요.'
        :'함께하고 싶은 일과 각자 편한 방법을 구체적으로 이야기해 보세요.';
  add('agreement',agreement+' 마지막에는 두 사람 모두 실천할 수 있는 작은 약속을 하나 정하세요. 며칠 해 본 뒤 편했던 점과 어려웠던 점을 다시 이야기하면 돼요.',topicIds([...decisions,...relationships]));
  const methodNotice='각자의 실제 사주에서 고른 성향과 두 사람의 계산된 관계를 이어 쓴 공통 참고 풀이예요. 관계와 결정 방식은 각 개인 항목에서 먼저 설명한 성향을 짚었으며, 강약 순위를 매긴 것은 아니에요. 같은 단서에는 같은 설명을 써요. 주말 약속은 이해를 돕는 가상 장면이고, 실제 성격 검사나 미래 예측이 아니에요.';
  const sectionTitles={strength:'함께할 때 살릴 장점',relationships:'마음을 주고받는 방식',
    differences:'함께 결정하는 방식',example:'생활 속 가상 예시',adjustment:'A와 B가 해볼 방법',agreement:'함께 지킬 작은 약속'};
  return {synthesis:{id:'compatibility-synthesis',title:'두 사람의 종합 궁합',headline,
    summaryLines:summaryLinesFrom(headline,agreement),paragraphs:parts.map(part=>part.text),
    detailSections:parts.map(part=>({title:sectionTitles[part.id],paragraphs:[part.text],factIds:[...part.factIds]})),
    paragraphFactIds:parts.map(part=>[...part.factIds]),paragraphIds:parts.map(part=>part.id),
    factIds:unique(parts.flatMap(part=>part.factIds)),origin:ORIGIN,methodNotice,
    comparison:{samePortrait,sameLeadingDecision:sameDecision,sameLeadingRelationship:sameRelation}},
    facts:[{id:methodId,kind:'method',label:'종합 궁합을 이어 쓴 방법',value:methodNotice,origin:ORIGIN}]};
}

/** Pure additions; no name, gender, transit, price or access input is used. */
export function buildCompatibilityPeople({charts,profiles,scopes,compatibility}) {
  const built=['self','partner'].map(key=>personFrom(charts[key],profiles[key],scopes[key],key));
  const people=built.map(value=>value.person),combined=synthesisFrom(people,compatibility);
  const facts=[...built.flatMap(value=>value.facts),...combined.facts];
  const registry=new Set([...compatibility.facts,...facts].map(fact=>fact.id));
  if(registry.size!==compatibility.facts.length+facts.length)fail();
  for(const item of [...people,...people.flatMap(person=>person.cards),combined.synthesis,...facts]) {
    if(item.factIds?.some(id=>!registry.has(id)))fail();
  }
  return {people,synthesis:combined.synthesis,facts};
}
