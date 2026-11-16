// Service-authored daily-life suggestions, selected by observed relationships.
// They are not source quotations, traditional verdicts or predicted events.
const PILLARS = {year:'태어난 해',month:'태어난 달',day:'태어난 날',hour:'태어난 시간'};
const unique = values => [...new Set(values)];
const place = entry => `${PILLARS[entry.pillarKey]}의 ${entry.position==='stem'?'위쪽 글자':'아래쪽 대표 글자'}`;
const godId = entry => `natal.god.${entry.pillarKey}.${entry.position}`;
const called = name => `‘${name}’${(name.charCodeAt(name.length-1)-0xac00)%28?'이라는':'라는'}`;

const GOD_ADVICE = {
  companion:{
    theme:'내 생각을 지키면서 친구나 동료와 함께하는 일',
    title:'내가 정할 일과 함께 정할 일을 나눠 보세요',
    action:'함께하는 일에서는 혼자 정할 부분과 같이 의논할 부분을 구분하는 게 먼저예요. 종이를 둘로 나눠 한쪽에는 내가 정할 수 있는 일을, 다른 쪽에는 같이 의논할 일을 적으세요. 내 의견을 한 문장으로 말한 뒤, 상대가 중요하게 생각하는 것도 물어보세요.',
    caution:'내가 혼자 정할 수 있는 일인지, 다른 사람의 동의가 필요한 일인지 먼저 확인해 보세요. 생각이 다르다고 어느 한쪽이 틀린 것은 아니에요.',
  },
  competitor:{
    theme:'함께 쓰는 돈과 물건, 서로의 몫을 정하는 일',
    title:'함께 쓰는 돈과 물건의 몫을 정해 보세요',
    action:'공동으로 쓸 돈이나 물건이 있다면 누가 얼마나 내고 언제 쓰는지 기록하는 것이 먼저예요. 나중에 돌려줄 것이 있다면 돌려줄 때와 방법도 함께 정해 두세요.',
    caution:'여럿이 쓰는 돈이나 물건을 혼자 결정해서 쓰기 전에 서로의 생각을 확인해 보세요. 이런 풀이가 나왔다고 누군가 돈을 빼앗거나 손해가 생긴다는 뜻은 아니에요.',
  },
  creator:{
    theme:'작은 일을 꾸준히 하고 만든 것을 나누는 일',
    title:'작은 결과물 하나부터 완성해 보세요',
    action:'시작의 기준은 하고 싶은 것 중 오늘 끝낼 수 있는 작은 일 하나예요. 짧은 글을 쓰거나, 배운 것을 연습하거나, 필요한 물건을 하나 만들어도 좋아요. 마친 뒤에는 잘된 점과 다음에 고칠 점을 하나씩 적어 보세요.',
    caution:'시작할 일을 한꺼번에 늘리기 전에 지금 하는 일을 이어 갈 시간과 힘이 있는지 살펴보세요. 오래 걸리는 일은 중간에 확인할 작은 단계로 나눌 수 있어요.',
  },
  critic:{
    theme:'새로운 생각을 내고 하던 방법을 더 쉽게 바꾸는 일',
    title:'불편한 방법 하나를 더 쉽게 바꿔 보세요',
    action:'방법을 고칠 때의 출발점은 공부나 집안일, 함께하는 일에서 겪은 구체적인 불편 하나예요. 지금 방법과 바꿔 볼 방법을 나란히 적고, 작은 일 하나에 먼저 적용해 무엇이 달라지는지 확인해 보세요. 다른 사람에게 제안할 때는 바꾸려는 이유부터 설명해 보세요.',
    caution:'방법에 대한 의견과 사람에 대한 평가는 구분해서 말해야 해요. 상대가 먼저 정한 약속이 있다면 무엇을 바꿔도 되는지 먼저 확인하세요.',
  },
  opportunist:{
    theme:'돈과 물건의 여러 쓰임을 살피고 필요한 곳에 연결하는 일',
    title:'할 일마다 필요한 돈과 물건을 적어 보세요',
    action:'계획을 구체화하는 첫 단계는 할 일마다 필요한 돈과 준비물을 적는 거예요. 꼭 있어야 하는 것과 나중에 마련해도 되는 것을 나누고, 이미 가진 것을 함께 쓸 수 있는지도 확인해 보세요.',
    caution:'새로운 일을 맡기 전에 추가로 드는 돈과 시간을 살펴보세요. 다른 사람과 함께한다면 각자 낼 돈과 맡을 일을 먼저 정해 보세요.',
  },
  manager:{
    theme:'정해진 돈과 물건을 차근차근 챙기는 일',
    title:'들어오는 돈과 쓰는 돈을 적어 보세요',
    action:'들어오는 돈, 자주 쓰는 돈, 남겨 둘 돈을 나누어 기록하는 것이 돈 관리의 기본이에요. 계획한 금액과 실제로 쓴 금액이 다르면 무엇 때문에 달라졌는지 한 줄 남겨 보세요. 돈 대신 자주 쓰는 준비물의 개수를 기록해도 좋아요.',
    caution:'전체 금액뿐 아니라 언제 필요한지도 확인해 보세요. 내 돈과 함께 쓰는 돈은 구별해서 적으면 서로의 몫을 알아보기 쉬워요.',
  },
  challenger:{
    theme:'어려운 일을 맡을 때 책임과 부담을 살피는 일',
    title:'어려운 일은 나누고, 내가 할 일을 정해 보세요',
    action:'어려운 일을 정리할 때는 급한 일, 중요한 일, 도움이 필요한 일을 구분하는 것이 먼저예요. 지금 할 수 있는 가장 작은 일부터 시작하고, 혼자 하기 어려운 부분은 누구에게 어떤 도움을 부탁할지 적어 보세요.',
    caution:'내가 쓸 수 있는 시간과 해야 할 일을 먼저 확인해 보세요. 전부 혼자 책임지겠다고 약속하지 않아도 돼요. 일이 더해지면 끝내는 시간도 다시 의논해 보세요.',
  },
  officer:{
    theme:'약속을 지키고 함께 정한 역할을 해내는 일',
    title:'누가 무엇을 언제까지 할지 정해 보세요',
    action:'함께하는 일은 누가 무엇을 언제까지 할지 한눈에 보이게 기록해야 맡은 범위가 분명해져요. 끝났다는 것을 어떻게 확인할지도 정해 두세요. 일정이 달라지면 관련된 사람에게 미리 알려 주세요.',
    caution:'같은 말을 듣고도 서로 다르게 이해할 수 있어요. 약속한 내용을 내 말로 다시 말해 보세요. 내용이 바뀌었다면 모두 알고 있는지도 확인해 보세요.',
  },
  explorer:{
    theme:'궁금한 것을 깊이 알아보고 다른 생각도 살피는 일',
    title:'궁금한 점 하나를 깊이 알아보세요',
    action:'깊이 알아보는 첫 단계는 잘 이해되지 않는 점을 질문 한 문장으로 적는 거예요. 서로 다른 자료에서 답을 찾아보고, 확인한 내용과 아직 추측인 내용을 나눠 보세요. 다른 설명이 있다면 무엇이 다른지도 적어 보세요.',
    caution:'찾아볼 것이 너무 많아지면 처음에 무엇이 궁금했는지 다시 확인해 보세요. 많이 읽어도 내용을 충분히 확인하지 못할 수 있어요. 누가 쓴 자료인지, 어떤 근거가 있는지도 살펴보세요.',
  },
  scholar:{
    theme:'기초부터 배우고 필요한 도움을 받는 일',
    title:'기초부터 해 보고 모르는 점을 물어보세요',
    action:'배움을 내 것으로 만드는 출발점은 배우고 싶은 내용을 작은 단계로 나누는 거예요. 설명을 읽은 뒤에는 직접 해 보거나 내 말로 설명해 보세요. 막히는 부분은 어디까지 이해했고 무엇을 모르겠는지 적어 질문해 보세요.',
    caution:'설명을 읽어서 익숙해진 것과 혼자 해낼 수 있는 것은 다를 수 있어요. 도움을 받은 뒤에는 같은 일을 스스로 한 번 더 해 보며 확인해 보세요.',
  },
};

function suggestion(id, definition, why, factIds) {
  return {id,title:definition.title,why,action:definition.action,caution:definition.caution,factIds:unique(factIds),origin:'service-advice'};
}

function natalGodAdvice(profile) {
  return unique(profile.gods.map(entry=>entry.god.code)).map(code=>{
    const found=profile.gods.filter(entry=>entry.god.code===code), definition=GOD_ADVICE[code];
    const why=`내 사주에서 ${called(found[0].god.name)} 관계를 확인했어요. 나를 나타내는 글자와 ${placeList(found)}를 비교한 결과예요. 이 관계가 뜻하는 ‘${definition.theme}’을 생활에서 해 볼 수 있게 제안했어요.`;
    return suggestion(`natal.advice.god.${code}`,definition,why,['natal.day-master','natal.scope',...found.map(godId)]);
  });
}
function placeList(entries) { return entries.map(place).join(', '); }

function transitGodAdvice(profile,transit,prefix,label) {
  return unique([transit.stemGod.code,transit.branchGod.code]).map(code=>{
    const positions=['stem','branch'].filter(position=>transit[position+'God'].code===code);
    const found=profile.gods.filter(entry=>entry.god.code===code), definition=GOD_ADVICE[code];
    const god=transit[positions[0]+'God'];
    const places=positions.map(position=>position==='stem'?'위쪽 글자':'아래쪽 대표 글자').join('와 ');
    const comparison=found.length
      ? `태어난 사주에서도 같은 이름이 ${found.length}곳(${placeList(found)})에 있어요. 평소의 성향이 이번 시기에 어떻게 드러나는지 함께 살펴봐요.`
      : '이번 시기에 새로 나오는 이름이에요. 태어난 사주에서 확인한 위쪽 글자와 아래쪽 대표 글자에는 이 이름이 없어요.';
    const why=`${label}에는 ${called(god.name)} 관계를 확인했어요. 내 기준 글자와 이 시기의 ${places}를 비교한 결과예요. ${comparison} 이 관계가 뜻하는 ‘${definition.theme}’을 생활에서 해 볼 수 있게 제안했어요.`;
    return suggestion(`${prefix}.advice.god.${code}`,definition,why,[
      'natal.day-master','natal.scope',...positions.map(position=>`${prefix}.god.${position}`),
      ...(found.length?found:profile.gods).map(godId),
    ]);
  });
}

function pairAdvice(interactions,prefix,label) {
  const selected=kinds=>interactions.map((entry,index)=>({entry,index})).filter(({entry})=>kinds.includes(entry.kind));
  const connects=selected(['stem-combination','branch-combination']), clashes=selected(['branch-clash']);
  const cards=[];
  if(connects.length)cards.push(suggestion(`${prefix}.advice.connect`,{
    title:'함께할 일은 누가 무엇을 할지 먼저 정해 보세요',
    action:'함께할 계획이 있다면 각자 맡고 싶은 일, 도울 수 있는 일, 미리 정해야 할 약속을 적어 보세요. 둘 다 할 수 있는 작은 일부터 맞춰 보고, 달라진 점이 있으면 다시 의논해 보세요.',
    caution:'사주에 어울리는 조합이 있어도 상대의 생각은 직접 물어봐야 해요. 어떤 일을 하고 싶은지, 어디까지 맡을 수 있는지 이야기한 뒤 결정해 보세요.',
  },`${label}에서 서로 어울리는 글자 조합인 ‘합’이 ${connects.length}쌍 나왔어요. 위쪽 글자끼리 ${connects.filter(({entry})=>entry.kind==='stem-combination').length}쌍, 아래쪽 글자끼리 ${connects.filter(({entry})=>entry.kind==='branch-combination').length}쌍이에요. 전통에서는 서로 맞춰 가는 모습으로 읽어요. 이 뜻에 따라 각자 맡을 일을 정하는 방법을 제안했어요.`,connects.map(({index})=>`${prefix}.interaction.${index}`)));
  if(clashes.length)cards.push(suggestion(`${prefix}.advice.clash`,{
    title:'생각이 다른 부분을 따로 적어 보세요',
    action:'의견을 맞춰야 할 일이 있다면 이미 동의한 부분과 아직 생각이 다른 부분을 나눠 보세요. 다른 부분 중 하나를 골라 서로 중요하게 여기는 이유를 물어보세요. 결정하기 어려우면 언제 다시 이야기할지도 정할 수 있어요.',
    caution:'사주에 차이가 부딪히는 조합이 있어도 다툼이나 사고가 생긴다는 뜻은 아니에요. 실제로 나눈 말과 서로의 행동을 보고 판단해 보세요.',
  },`${label}에서 차이가 부딪히는 글자 조합인 ‘충’이 ${clashes.length}쌍 나왔어요. 전통에서는 서로 다른 점을 알고 맞춰 가는 모습으로 읽어요. 이 뜻에 따라 서로의 생각을 물어보는 방법을 제안했어요.`,clashes.map(({index})=>`${prefix}.interaction.${index}`)));
  if(!interactions.length)cards.push(suggestion(`${prefix}.advice.no-pair`,{
    title:'실제로 확인한 일부터 차근차근 살펴보세요',
    action:'고민하는 일이 있다면 확인한 사실, 아직 추측인 부분, 내가 준비할 수 있는 일을 나눠 적어 보세요. 더 알아야 할 것이 있다면 직접 확인할 방법을 하나 정해 보세요.',
    caution:'이 세 종류의 짝이 없다고 실제 만남이나 갈등도 없다는 뜻은 아니에요. 모르는 부분에 좋고 나쁜 결론을 먼저 붙이지 않아도 돼요.',
  },`${label}에서는 합이나 충에 해당하는 조합을 찾지 못했어요. 확인한 종류는 천간합·지지육합·지지충이에요. 없는 관계를 추측해 넣는 대신, 실제 생활에서 확인할 것을 정리하는 방법을 제안했어요.`,[`${prefix}.interaction-count`,'natal.scope']));
  return cards;
}

export function attachAdvice(report,fortune) {
  const profile=fortune.profile;
  report.adviceNotice='오쭈다가 쓴 생활 제안이에요. 내 상황에 맞는 것을 골라 보세요.';
  report.adviceByCategory={
    lifelong:[...natalGodAdvice(profile),...pairAdvice(profile.interactions,'natal','태어난 사주')],
    annual:[...transitGodAdvice(profile,fortune.annual,'annual',`${fortune.year}년`),...pairAdvice(fortune.annual.interactions,'annual',`${fortune.year}년 글자와 태어난 사주 사이`)],
  };
  for(const month of report.months){
    const source=fortune.months.find(value=>value.month===month.month),prefix=`month.${month.month}`;
    month.advice=[...transitGodAdvice(profile,source,prefix,`${fortune.year}년 ${month.month}월`),...pairAdvice(source.interactions,prefix,`${month.month}월 글자와 태어난 사주 사이`)];
  }
}
