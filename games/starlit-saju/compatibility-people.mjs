import { buildNatalReadingData, seasonRules } from './natal-reading-data.mjs?v=20261114-saju-depth1';
import { buildPersonPortrait } from './person-portrait.mjs?v=20261120-saju-voice1';
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
  companion:{relation:'가까워도 각자의 선택과 시간을 존중받고 싶어 하는',decision:'스스로 납득한 이유로 고르려는',scene:'가고 싶은 곳 한 군데를 직접 골라요.'},
  competitor:{relation:'서로 비슷하게 시간과 정성을 쓰기를 바라는',decision:'누가 얼마나 준비하고 맡는지 먼저 살피는',scene:'예약과 이동 준비를 어떻게 나눌지 먼저 물어요.'},
  creator:{relation:'작게라도 꾸준히 챙기는 행동으로 마음을 전하는',decision:'작게라도 직접 해 보고 판단하는',scene:'짧게 체험할 일을 골라 직접 해 보자고 해요.'},
  critic:{relation:'잘 지내고 싶어서 불편한 점도 솔직히 말하는',decision:'왜 그 방법이어야 하는지 묻고 고칠 점을 찾는',scene:'그 장소를 고른 이유를 묻고, 불편한 이동 방법은 바꾸자고 해요.'},
  opportunist:{relation:'함께할 일이나 만날 자리를 만들며 가까워지는',decision:'새로운 사람이나 방법까지 찾아 선택지를 넓히는',scene:'다른 장소나 함께할 사람을 떠올리며 선택지를 더해요.'},
  manager:{relation:'연락과 약속이 꾸준히 이어질 때 마음을 놓는',decision:'실제로 쓸 시간과 비용부터 확인하는',scene:'이동 시간과 비용을 확인한 뒤 약속을 정해요.'},
  challenger:{relation:'가까운 사람이 힘들면 해결할 방법부터 찾는',decision:'먼저 해결할 문제를 정하고 움직이는',scene:'예약이 안 되거나 일정이 겹치는 문제부터 해결해요.'},
  officer:{relation:'서로 지킬 약속이 분명할 때 마음을 놓는',decision:'이미 정한 약속과 맡을 일을 확인하는',scene:'이미 정한 시간과 각자 맡기로 한 준비부터 확인해요.'},
  explorer:{relation:'생각을 깊게 나누는 대화에서 가까움을 느끼는',decision:'알려진 답도 다른 설명과 조건을 더 살피는',scene:'추천받은 장소도 왜 좋은지 알아본 뒤 의견을 말해요.'},
  scholar:{relation:'끝까지 들어 주고 이유를 설명해 줄 때 마음을 여는',decision:'설명을 듣고 기본을 확인한 뒤 고르는',scene:'처음 가는 곳이라면 이용 방법을 듣고 모르는 조건부터 물어요.'},
};

// These clauses name the actual selected decision traits. They do not rank
// personalities or turn a traditional relationship into a promised outcome.
const CONCLUSIONS={
  companion:{focus:'직접 고를 여지를 중요하게 보는',ask:'직접 고를 부분',shared:'함께할 일과 각자 고를 일을 나누는 것이 중요해요',action:'각자 직접 정하고 싶은 부분을 하나씩 고른 뒤, 함께 결정할 일과 나누어 보세요.'},
  competitor:{focus:'서로 나눌 수고를 먼저 살피는',ask:'나누고 싶은 준비와 비용',shared:'준비와 비용을 공평하게 나누는 것이 중요해요',action:'눈에 보이는 준비뿐 아니라 예약과 이동에 드는 수고도 함께 적어 나누세요.'},
  creator:{focus:'작게 해 본 뒤 판단하는',ask:'먼저 해 볼 작은 일',shared:'작게 시작하고 함께 해 본 뒤 다음 단계를 정해요',action:'이번에 함께 끝낼 작은 일 하나와 해 본 뒤 이야기할 때를 정하세요.'},
  critic:{focus:'방법의 이유와 고칠 점을 찾는',ask:'고치고 싶은 방법',shared:'잘된 점은 살리고 불편한 방법은 고쳐 나가요',action:'좋다고 본 부분을 먼저 남기고, 이번에 바꿔 볼 방법은 하나만 고르세요.'},
  opportunist:{focus:'새로운 선택지를 넓혀 보는',ask:'비교하고 싶은 선택지',shared:'여러 선택지 중 지금 할 한 가지를 정해야 해요',action:'각자 떠올린 후보를 모은 뒤, 지금 가능한 시간과 준비에 맞는 한 가지를 고르세요.'},
  manager:{focus:'감당할 시간과 비용을 확인하는',ask:'감당할 시간과 비용',shared:'지킬 수 있는 계획을 차근차근 이어 가요',action:'계속 쓸 시간과 비용을 확인하고, 조건이 바뀌면 무엇부터 다시 정할지 약속하세요.'},
  challenger:{focus:'먼저 풀 문제를 찾는',ask:'먼저 풀고 싶은 문제',shared:'급한 문제를 풀되 책임은 나누어 맡아야 해요',action:'먼저 해결할 일 하나를 고르고, 그 뒤에 이어지는 책임은 따로 나누세요.'},
  officer:{focus:'이미 정한 약속을 점검하는',ask:'지켜야 할 기존 약속',shared:'서로 맡은 일과 마감을 분명히 정해야 해요',action:'각자가 이해한 역할과 마감을 말해 보고, 사정이 바뀌면 알릴 방법도 정하세요.'},
  explorer:{focus:'다른 설명과 조건을 더 살피는',ask:'더 확인할 조건',shared:'더 알아볼 것과 지금 시작할 일을 나누어야 해요',action:'각자 남은 질문을 하나씩 고르고, 답을 기다리는 동안 할 수 있는 일부터 정하세요.'},
  scholar:{focus:'시작 전에 필요한 설명을 확인하는',ask:'이해하고 싶은 설명',shared:'필요한 설명을 들은 뒤 시작할 때를 정해야 해요',action:'각자 이해한 방법을 짧게 설명하고, 모르는 부분을 확인한 뒤 함께 첫 단계를 정하세요.'},
};
const CONNECTIONS={peer:'서로 고른 이유를 듣고 각자의 선택을 존중해야 해요',expression:'생각과 경험을 나누며 서로의 준비를 도와요',resource:'생각과 경험을 나누며 서로의 준비를 도와요',wealth:'준비할 조건과 맡을 일을 함께 정해야 해요',authority:'준비할 조건과 맡을 일을 함께 정해야 해요'};
const particle=(value,closed,open)=>value+(((value.charCodeAt(value.length-1)-0xac00)%28)?closed:open);
function conclusionFor(cards,group) {
  const [first,second]=cards.map(card=>card.godCodes[0]),a=CONCLUSIONS[first],b=CONCLUSIONS[second];
  if(!a||!b||!CONNECTIONS[group])fail();
  if(first===second)return {headline:`두 사람 모두 ${VOICES[first].decision} 편이라, ${a.shared}.`,action:a.action};
  const aRequest=`A가 ${a.ask}`,bRequest=`B가 ${b.ask}`;
  return {headline:`${a.focus} A와 ${b.focus} B는 ${CONNECTIONS[group]}.`,
    action:`${particle(aRequest,'과','와')} ${particle(bRequest,'을','를')} 함께 적고, 이번에 먼저 맞출 조건을 정하세요.`};
}
const RELATION_STEPS={
  companion:'함께 보낼 시간과 혼자 쓸 시간을 알려 주세요. 상대도 직접 정하고 싶은 부분이 있는지 들어 보세요.',
  competitor:'이번 만남에서 맡을 준비를 먼저 제안하고 상대의 준비도 들어 보세요. 서로의 수고가 보이도록 약속하는 거예요.',
  creator:'이번에 챙길 수 있는 작은 일을 제안한 뒤, 상대도 그 도움을 반기는지 물어보세요.',
  critic:'불편한 점을 고치자는 말 앞에 함께 유지하고 싶은 좋은 점을 붙여 보세요. 상대에게도 바꾸고 싶은 행동을 물어보세요.',
  opportunist:'새로 함께하고 싶은 일을 제안하되, 상대가 바로 답하지 않아도 생각할 시간을 남겨 주세요.',
  manager:'준비에 필요한 시간과 비용을 먼저 알려 주세요. 상대의 사정이 달라지면 함께 줄이거나 바꿀 부분을 고르세요.',
  challenger:'어려운 이야기를 들었다면 해결을 맡기 전에 어느 정도의 도움을 원하는지 물어보세요.',
  officer:'서로 지키고 싶은 약속 하나를 같은 말로 정해 보세요. 못 지키는 날에는 어떻게 알릴지도 함께 의논하세요.',
  explorer:'상대의 이유를 듣는 시간과 혼자 생각할 시간을 나누어 보세요. 생각을 마친 뒤에는 이해한 뜻이 맞는지 되물어 보세요.',
  scholar:'상대의 이야기를 끝까지 들은 뒤 이해한 뜻을 말해 보세요. 조언이 필요한 부분과 직접 정할 부분도 구분해 주세요.',
};
const PAIR_STRENGTH={
  peer:'함께 결정할 때는 각자 고른 이유를 먼저 말하세요. 두 사람의 선택권을 지키는 것이 이 관계의 핵심이에요.',
  expression:'A는 생각을 제안하고 B는 자기 경험을 보태는 방식이 잘 맞아요. 돕기 전에는 상대에게 필요한 일부터 물어보세요.',
  resource:'B는 생각을 제안하고 A는 자기 경험을 보태는 방식이 잘 맞아요. 돕기 전에는 상대에게 필요한 일부터 물어보세요.',
  wealth:'A가 함께 쓸 돈과 시간을 정리하면 B는 맡을 일을 정하세요. 준비와 역할을 함께 정해야 계획이 구체적이 돼요.',
  authority:'B가 함께 쓸 돈과 시간을 정리하면 A는 맡을 일을 정하세요. 준비와 역할을 함께 정해야 계획이 구체적이 돼요.',
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
  const conclusion=conclusionFor(decisions,compatibility.dayMasterRelation.self.group),headline=conclusion.headline;
  const parts=[];
  const add=(id,text,factIds)=>parts.push({id,text,factIds:unique(factIds)});
  const opening=samePortrait
    ?`두 사람의 성향 풀이는 같아요. 둘 다 ${a.headline.replace(/^A는 /,'')} 성향 풀이가 같아도 취향과 살아온 경험은 각자의 것이에요.`
    :`${a.headline} ${b.headline}`;
  add('strength',headline+' '+opening+' '+pairStrength,introIds);
  const relationText=sameRelation
    ?`사람을 대하는 방식도 닮았어요. 두 사람 모두 ${relationVoices[0].relation} 사람이에요. 지금 필요한 배려는 따로 물어보세요.`
    :`A는 ${relationVoices[0].relation} 사람이에요. B는 ${relationVoices[1].relation} 사람이에요. 마음을 전할 때는 내게 익숙한 방식과 상대가 반기는 방식을 함께 생각하세요.`;
  add('relationships',relationText,topicIds(relationships));
  const decisionText=sameDecision
    ?`함께 결정할 때도 두 사람 모두 ${decisionVoices[0].decision} 방식을 택해요.`
    :`함께 결정할 때 A는 ${decisionVoices[0].decision} 사람이에요. B는 ${decisionVoices[1].decision} 사람이에요. 먼저 확인할 것이 다르니, 둘 다 답을 얻었는지 확인한 뒤 결정하세요.`;
  const disagreement=clashes
    ?' 의견이 갈리면 각자 놓치고 싶지 않은 조건을 하나씩 말하세요. 조건을 알아야 함께 고를 방법도 분명해져요.'
    :' 결정하기 전에 지금 원하는 것을 하나씩 말하세요.';
  add('differences',decisionText+disagreement,topicIds(decisions));
  const scene=sameDecision
    ?`예를 들어 둘이 주말 약속을 정한다고 해 볼게요. 두 사람 모두 ${decisionVoices[0].scene} 이때도 각자 꼭 하고 싶은 일을 하나씩 물으세요. 생각하는 방식이 같아도 고른 장소는 다를 수 있어요.`
    :`예를 들어 둘이 주말 약속을 정한다고 해 볼게요. A는 ${decisionVoices[0].scene} B는 ${decisionVoices[1].scene} 서로 다른 것을 먼저 묻는 장면이에요. 참여하기 싫다는 뜻인지, 확인할 조건이 남았다는 뜻인지 직접 물으세요.`;
  add('example',scene,topicIds(decisions));
  const actions=relationships.map(card=>RELATION_STEPS[card.godCodes[0]]);
  const actionText=actions[0]===actions[1]
    ?`마음을 전하는 방식이 닮아도 지금 필요한 배려는 직접 확인해야 해요. 번갈아 부탁할 행동을 하나씩 말하세요. ${actions[0]}`
    :`이번 만남에서 원하는 배려를 하나씩 말하세요. A는 ${actions[0]} B는 ${actions[1]} 둘 다 동의한 행동을 약속으로 정하세요.`;
  add('adjustment',actionText,topicIds(relationships));
  const agreement=connects&&clashes?'편했던 점과 다시 정할 점을 따로 이야기해 보세요.'
    :clashes?'서로 다르게 이해한 일 하나부터 이야기해 보세요.'
      :connects?'잘 맞았던 방법을 다음 약속에서도 이어 가 보세요.'
        :'함께하고 싶은 일과 각자 편한 방법을 구체적으로 이야기해 보세요.';
  add('agreement',conclusion.action+' '+agreement+' 며칠 해 본 뒤에는 편했던 점과 바꿀 점을 함께 확인하세요.',topicIds([...decisions,...relationships]));
  const methodNotice='각자의 실제 사주에서 고른 성향과 두 사람의 계산된 관계를 이어 쓴 공통 참고 풀이예요. 관계와 결정 방식은 각 개인 항목에서 먼저 설명한 성향을 짚었으며, 강약 순위를 매긴 것은 아니에요. 같은 단서에는 같은 설명을 써요. 주말 약속은 이해를 돕는 가상 장면이고, 실제 성격 검사나 미래 예측이 아니에요.';
  const sectionTitles={strength:'함께할 때 살릴 장점',relationships:'마음을 주고받는 방식',
    differences:'함께 결정하는 방식',example:'생활 속 가상 예시',adjustment:'A와 B가 해볼 방법',agreement:'함께 지킬 작은 약속'};
  return {synthesis:{id:'compatibility-synthesis',title:'두 사람의 종합 궁합',headline,
    summaryLines:summaryLinesFrom(headline,conclusion.action),paragraphs:parts.map(part=>part.text),
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
