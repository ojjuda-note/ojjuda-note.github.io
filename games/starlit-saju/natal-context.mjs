import {PAIR_CONTEXTS} from './deeper-reading-data.mjs?v=20261114-saju-depth1';

// Connections between already observed natal clues. The ordering selects what
// to explain; it never measures strength, predicts an event or fills a gap.
const ORDER=['month.stem','day.branch','month.branch','year.stem','year.branch','hour.stem','hour.branch'];
const GROUPS=['peer','expression','wealth','authority','resource'];
const unique=values=>[...new Set(values)];
const position=entry=>entry.pillarKey+'.'+entry.position;
const factId=entry=>'natal.god.'+position(entry);
const particle=(text,a,b)=>text+((text.charCodeAt(text.length-1)-0xac00)%28?a:b);
const MOTIVES={
  companion:{group:'peer',focus:'스스로 납득한 선택',first:'스스로 납득할 기준을 세우고',last:'자기 선택을 지키려는 사람'},
  competitor:{group:'peer',focus:'함께한 수고의 공평한 분담',first:'서로의 수고와 몫을 살피고',last:'함께 만든 결과를 공평하게 나누려는 사람'},
  creator:{group:'expression',focus:'직접 만들어 보여 주는 실천',first:'작게라도 직접 만들고 고치며',last:'시작한 일을 결과로 보여 주는 사람'},
  critic:{group:'expression',focus:'불편한 방법을 고치는 일',first:'하던 방식의 불편함을 찾아 바꾸고',last:'더 나은 방법을 제안하는 사람'},
  opportunist:{group:'wealth',focus:'사람과 도구를 연결하는 준비',first:'필요한 사람과 도구를 찾아 연결하고',last:'실제로 시작할 방법을 마련하는 사람'},
  manager:{group:'wealth',focus:'작은 지출과 약속을 챙기는 관리',first:'시간과 비용을 꼼꼼히 확인하고',last:'작은 약속과 준비를 꾸준히 챙기는 사람'},
  challenger:{group:'authority',focus:'어려운 문제를 풀려는 집중',first:'어려운 문제에서 풀 수 있는 부분을 찾고',last:'맡은 문제를 해결하는 데 집중하는 사람'},
  officer:{group:'authority',focus:'맡은 역할과 지켜야 할 약속',first:'맡은 역할과 끝낼 기준을 확인하고',last:'정한 약속을 책임 있게 지키려는 사람'},
  explorer:{group:'resource',focus:'다른 이유와 방법을 깊이 알아보는 일',first:'익숙한 답도 다른 각도에서 살피고',last:'이유를 충분히 이해한 뒤 움직이는 사람'},
  scholar:{group:'resource',focus:'기초를 배우고 필요한 도움을 받는 일',first:'기본을 배우고 모르는 것을 확인하며',last:'배운 것을 차근차근 익혀 쓰는 사람'},
};
const SAME_GROUP={
  peer:'내가 정할 권한과 함께하는 사람의 수고를 같이 보세요. 선택은 존중받으면서도 일의 몫은 서로 납득할 수 있어야 편해요.',
  expression:'하던 일을 끝내는 것과 더 나은 방법을 찾는 일을 나누어 보세요. 지금 마칠 부분을 정해 두면 떠오른 개선도 다음 시도로 이어 갈 수 있어요.',
  wealth:'새로 해 볼 일에 쓸 준비와 이미 이어 가는 생활의 준비를 나누어 보세요. 시작할 여유와 계속할 여유를 함께 확인하는 게 중요해요.',
  authority:'문제를 해결하는 일과 정해진 약속을 지키는 일을 함께 보세요. 추가로 맡는 일이 생기면 원래의 마감과 책임도 다시 맞춰야 해요.',
  resource:'기본 설명을 익힌 뒤 다른 질문을 살펴보세요. 알아본 내용을 직접 써 볼 자리가 있어야 무엇을 더 물어볼지도 분명해져요.',
};
const DOMAIN_OPENINGS={
  overview:'여러 선택을 함께 놓고 보면',decisions:'새 일을 선택할 때',relationships:'가까운 사람과 뜻을 맞출 때',
  work:'함께 일을 진행할 때',money:'돈을 쓰거나 비용을 나눌 때',learning:'서로 다른 설명을 받아들일 때',
  pressure:'여러 요구가 한꺼번에 들어올 때',adjustment:'내 뜻을 다른 사람에게 전할 때',
};
const SEASON_CONNECTIONS={
  same:'같은 목표로 함께하더라도 방법까지 모두 같을 필요는 없어요. 직접 정할 부분과 함께 맞출 부분을 나누면 이 장점을 지키기 쉬워요.',
  output:'생각을 안에만 남기지 않고 말이나 작은 결과로 보여 줄 자리가 중요해요. 준비한 것을 한번 꺼내 본 뒤 반응에 맞춰 다듬어 보세요.',
  wealth:'하고 싶은 마음을 실제로 낼 수 있는 시간과 비용에 맞춰 보는 과정이 중요해요. 이번에 감당할 준비를 정하면 선택도 구체적이 돼요.',
  authority:'좋아서 선택한 일과 주변의 기대 때문에 맡은 일을 구분하는 게 중요해요. 지킬 약속을 정할 때 내가 원하는 일에 쓸 시간도 남겨 두세요.',
  resource:'설명을 듣고 도움을 받아 이해할 여유가 중요해요. 이미 할 수 있는 부분부터 시작하면 남은 질문도 더 구체적으로 물을 수 있어요.',
};

function checkedEntries(profile) {
  const known=new Set(profile?.knownPillars?.map(p=>p.key)||[]);
  if(!Array.isArray(profile?.gods)||!profile.gods.length||!Array.isArray(profile.interactions))throw new TypeError('확인한 성향의 연결을 준비하지 못했어요.');
  for(const entry of profile.gods)if(!known.has(entry.pillarKey)||!ORDER.includes(position(entry))
    ||MOTIVES[entry.god?.code]?.group!==entry.god?.group)throw new TypeError('확인한 성향의 연결을 준비하지 못했어요.');
  return [...profile.gods].sort((a,b)=>ORDER.indexOf(position(a))-ORDER.indexOf(position(b)));
}
function pairMeaning(a,b) {
  const left=MOTIVES[a].group,right=MOTIVES[b].group;
  if(left===right)return SAME_GROUP[left];
  const key=[left,right].sort((a,b)=>GROUPS.indexOf(a)-GROUPS.indexOf(b)).join('-');
  return PAIR_CONTEXTS[key].meaning;
}

/** Exact positions stay in metadata; the story describes their shared meanings. */
export function describeNatalContext(profile,{codes,domain='overview',seasonKey=null}={}) {
  const entries=checkedEntries(profile),observed=new Set(entries.map(e=>e.god.code));
  if(!Array.isArray(codes)||!codes.length||codes.some(code=>!observed.has(code))||!DOMAIN_OPENINGS[domain]
    ||(seasonKey&&!SEASON_CONNECTIONS[seasonKey]))throw new TypeError('확인한 성향의 연결을 준비하지 못했어요.');
  const selected=unique(codes),first=selected[0],second=selected[1];
  const anchorEntries=selected.map(code=>entries.find(entry=>entry.god.code===code));
  const other=entries.find(entry=>!selected.includes(entry.god.code));
  const contextCodes=other?[first,other.god.code]:second?[first,second]:[first];
  const contextEntries=contextCodes.map(code=>entries.find(entry=>entry.god.code===code));
  const paragraphs=[];
  if(other) {
    const next=other.god.code;
    paragraphs.push(`${particle(MOTIVES[first].focus,'을','를')} 중요하게 여기면서, ${particle(MOTIVES[next].focus,'도','도')} 함께 챙기려는 모습으로 풀이해요. ${pairMeaning(first,next)}`);
  }
  const selectedPositions=new Set(entries.filter(e=>selected.includes(e.god.code)).map(position));
  const relevant=profile.interactions.map((value,index)=>{
    const slot=value.kind==='stem-combination'?'stem':'branch';
    const positions=[value.birthPillarKey+'.'+slot,value.otherPillarKey+'.'+slot];
    const related=positions.map(key=>entries.find(entry=>position(entry)===key)).filter(Boolean);
    return {value,index,positions,entries:related,relevant:positions.some(key=>selectedPositions.has(key))};
  }).filter(item=>item.relevant&&item.entries.length);
  const interactionParagraphs=[];
  for(const clash of [false,true]) {
    const matches=relevant.filter(item=>(item.value.kind==='branch-clash')===clash);
    const chosen=matches[0];if(!chosen)continue;
    const linked=unique(chosen.entries.map(entry=>entry.god.code));
    const themes=linked.length>1?particle(MOTIVES[linked[0]].focus,'과','와')+' '+MOTIVES[linked[1]].focus:MOTIVES[linked[0]].focus;
    interactionParagraphs.push({text:clash
      ?`${DOMAIN_OPENINGS[domain]}, ${particle(themes,'을','를')} ${linked.length>1?'함께 지키려 하면 선택이 서로 엇갈릴 수 있어요.':'그대로 이어 가기 어려운 요구가 함께 있을 수 있어요.'} 먼저 지킬 조건을 정하고, 나머지는 조정할 여지를 남겨 두세요.`
      :`${DOMAIN_OPENINGS[domain]}, ${particle(themes,'을','를')} ${linked.length>1?'서로 연결해 보는':'다른 사람의 생각이나 조건과 맞춰 보는'} 쪽으로 읽어요. 함께 원하는 결과를 먼저 말하되, 아직 정하지 않은 부분까지 동의한 것으로 넘기지 마세요.`,
      factIds:unique(['natal.interaction.'+chosen.index,...chosen.entries.map(factId)]),
      positions:chosen.positions,kind:chosen.value.kind,codes:linked});
  }
  const season=seasonKey?`${particle(MOTIVES[first].focus,'을','를')} 살릴 때는 주변 조건도 함께 보세요. ${SEASON_CONNECTIONS[seasonKey]}`:null;
  return {
    headline:second?`${MOTIVES[first].first}, ${MOTIVES[second].last}`:MOTIVES[first].last,
    paragraphs,season,interactions:interactionParagraphs,
    factIds:unique([...anchorEntries,...contextEntries].map(factId).concat(interactionParagraphs.flatMap(item=>item.factIds),season?['natal.season']:[])),
    anchorPositions:anchorEntries.map(position),contextPositions:contextEntries.map(position),
    godCodes:unique([...selected,...contextCodes,...interactionParagraphs.flatMap(item=>item.codes)]),additionalCode:other?.god.code||null,seasonKey,
  };
}
