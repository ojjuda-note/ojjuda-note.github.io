import {PAIR_CONTEXTS} from './deeper-reading-data.mjs?v=20261120-saju-voice1';

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
  peer:'내가 정할 일과 함께 의논할 일을 나누세요. 서로의 선택을 존중하고, 맡은 수고도 공평하게 인정해야 해요.',
  expression:'지금 끝낼 일과 다음에 고칠 일을 나누세요. 오늘 마칠 부분부터 완성하고, 새 아이디어는 따로 적어 두세요.',
  wealth:'새 일에 쓸 돈과 생활비를 따로 정하세요. 처음 시작할 비용과 계속 이어 갈 비용을 모두 확인해야 해요.',
  authority:'일을 더 맡을 때는 기존 마감과 맡은 범위도 다시 정하세요. 새 부탁 때문에 앞서 한 약속이 밀리지 않게 하세요.',
  resource:'기본 방법을 익힌 뒤 직접 써 보세요. 막힌 부분을 짚어 질문하면 필요한 설명을 정확히 받을 수 있어요.',
};
const DOMAIN_OPENINGS={
  overview:'여러 선택을 함께 놓고 보면',decisions:'새 일을 선택할 때',relationships:'가까운 사람과 뜻을 맞출 때',
  work:'함께 일을 진행할 때',money:'돈을 쓰거나 비용을 나눌 때',learning:'서로 다른 설명을 받아들일 때',
  pressure:'여러 요구가 한꺼번에 들어올 때',adjustment:'내 뜻을 다른 사람에게 전할 때',
};
const SEASON_CONNECTIONS={
  same:'목표가 같아도 일하는 방법은 달라요. 함께 맞출 부분만 정하고, 각자 맡은 일의 방법은 존중하세요.',
  output:'생각을 짧은 말이나 초안으로 보여 주세요. 상대가 이해한 내용을 확인한 뒤 부족한 부분을 다듬으세요.',
  wealth:'할 수 있는 시간과 쓸 돈부터 정하세요. 그 범위 안에서 지금 시작할 일 하나를 고르세요.',
  authority:'내가 원해서 맡은 일과 부탁받은 일을 구분하세요. 약속을 정할 때 내가 하고 싶은 일에 쓸 시간도 남겨 두세요.',
  resource:'알고 있는 부분부터 직접 시작하세요. 모르는 곳에서 멈추면 무엇이 막혔는지 짚어 도움을 요청하세요.',
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
    paragraphs.push(`${particle(MOTIVES[first].focus,'을','를')} 중요하게 여기고, ${MOTIVES[next].focus}도 함께 챙겨요. ${pairMeaning(first,next)}`);
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
      ?`${DOMAIN_OPENINGS[domain]}, ${particle(themes,'을','를')} ${linked.length>1?'모두 지키려 하면 결정이 복잡해져요.':'지키려는 마음과 다른 사람의 요구가 부딪히는 점이 주의할 부분이에요.'} 먼저 지킬 조건 하나를 정하고, 나머지는 의논해 조정하세요.`
      :`${DOMAIN_OPENINGS[domain]}, ${particle(themes,'을','를')} ${linked.length>1?'함께 살리는 데 강점이 있어요.':'다른 사람의 생각과 맞추는 데 강점이 있어요.'} 함께 원하는 결과부터 말하세요. 아직 정하지 않은 부분은 따로 확인하세요.`,
      factIds:unique(['natal.interaction.'+chosen.index,...chosen.entries.map(factId)]),
      positions:chosen.positions,kind:chosen.value.kind,codes:linked});
  }
  const season=seasonKey?SEASON_CONNECTIONS[seasonKey]:null;
  return {
    headline:second?`${MOTIVES[first].first}, ${MOTIVES[second].last}`:MOTIVES[first].last,
    paragraphs,season,interactions:interactionParagraphs,
    factIds:unique([...anchorEntries,...contextEntries].map(factId).concat(interactionParagraphs.flatMap(item=>item.factIds),season?['natal.season']:[])),
    anchorPositions:anchorEntries.map(position),contextPositions:contextEntries.map(position),
    godCodes:unique([...selected,...contextCodes,...interactionParagraphs.flatMap(item=>item.codes)]),additionalCode:other?.god.code||null,seasonKey,
  };
}
