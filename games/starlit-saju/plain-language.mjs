// An accessible reading of the existing calculation, not a second fortune engine.
// The underlying facts, rule records and complete evidence stay in readings.mjs.
const ELEMENTS = {wood:'나무',fire:'불',earth:'흙',metal:'쇠',water:'물'};
const ELEMENT_ORDER = ['wood','fire','earth','metal','water'];
const PILLARS = {year:'태어난 해',month:'태어난 달',day:'태어난 날',hour:'태어난 시간'};
const GROUPS = {
  peer:{name:'내 생각과 친구·동료',term:'비겁',meaning:'내 생각을 지키는 일, 친구나 동료와 함께하는 일을 살펴보는 이름이에요.'},
  expression:{name:'만들고 표현하는 일',term:'식상',meaning:'생각을 말이나 글로 전하고, 무언가를 만들어 나누는 일을 살펴보는 이름이에요.'},
  wealth:{name:'돈과 물건을 챙기는 일',term:'재성',meaning:'돈과 물건을 어디에 쓰고 어떻게 챙길지 살펴보는 이름이에요.'},
  authority:{name:'약속과 맡은 일',term:'관성',meaning:'약속을 지키고, 내가 맡은 일을 해내는 모습을 살펴보는 이름이에요.'},
  resource:{name:'배우고 도움을 받는 일',term:'인성',meaning:'새로운 것을 배우고, 다른 사람의 도움을 받는 일을 살펴보는 이름이에요.'},
};
const GODS = {
  companion:{topic:'내 생각과 친구·동료 관계',meaning:'내 생각을 지키는 일과 나와 비슷한 처지의 사람을 뜻해요.',example:'여럿이 함께 일하면서 내 의견도 말하고 다른 사람의 의견도 듣는 장면을 떠올릴 수 있어요.'},
  competitor:{topic:'함께 쓰는 것과 서로의 몫',meaning:'돈이나 물건을 함께 쓰는 일, 서로 경쟁하거나 힘을 합치는 일을 뜻해요.',example:'공동으로 쓰는 돈을 누가 얼마나 내고 어떻게 쓸지 정하는 장면을 떠올릴 수 있어요.'},
  creator:{topic:'꾸준히 만들고 나누는 일',meaning:'작은 일을 꾸준히 하고, 만든 것을 다른 사람과 나누는 일을 뜻해요.',example:'매일 조금씩 연습한 것을 글이나 음식, 물건으로 만들어 보여 주는 장면을 떠올릴 수 있어요.'},
  critic:{topic:'새로운 생각과 더 나은 방법',meaning:'다른 생각을 내고, 하던 일을 더 나은 방법으로 바꾸는 일을 뜻해요.',example:'늘 하던 방식에서 불편한 점을 찾아 더 쉬운 방법을 제안하는 장면을 떠올릴 수 있어요.'},
  opportunist:{topic:'돈과 물건의 여러 쓰임',meaning:'돈과 물건을 여러 곳에 쓰고, 사람들과 주고받는 일을 뜻해요.',example:'여러 사람과 함께할 일에 돈과 준비물이 얼마나 필요한지 살펴보는 장면을 떠올릴 수 있어요.'},
  manager:{topic:'돈과 물건을 차근차근 챙기기',meaning:'정해진 돈과 물건을 챙기고, 조금씩 모아 가는 일을 뜻해요.',example:'들어오는 돈과 나가는 돈을 적고, 필요한 것부터 준비하는 장면을 떠올릴 수 있어요.'},
  challenger:{topic:'어려운 일과 무거운 책임',meaning:'어려운 일을 맡거나, 부담이 큰 일을 마주하는 모습을 뜻해요.',example:'할 일이 한꺼번에 생겼을 때 무엇부터 하고 어디까지 맡을지 정하는 장면을 떠올릴 수 있어요.'},
  officer:{topic:'약속을 지키고 맡은 일 해내기',meaning:'정해진 약속과 규칙을 지키며 맡은 일을 하는 모습을 뜻해요.',example:'함께 정한 시간에 맞춰 일을 끝내고, 서로 맡은 일을 확인하는 장면을 떠올릴 수 있어요.'},
  explorer:{topic:'궁금한 것을 깊이 알아보기',meaning:'궁금한 것을 파고들고, 다른 방법이나 생각을 찾아보는 일을 뜻해요.',example:'잘 이해되지 않는 부분을 여러 자료에서 찾아보고 내 방식으로 정리하는 장면을 떠올릴 수 있어요.'},
  scholar:{topic:'차근차근 배우고 도움받기',meaning:'기초부터 배우고, 필요할 때 다른 사람의 도움을 받는 일을 뜻해요.',example:'모르는 것을 물어보고 배운 내용을 한 번 더 연습하는 장면을 떠올릴 수 있어요.'},
};
const STEMS = {
  '甲':{name:'갑목',image:'큰 나무',meaning:'큰 나무가 뿌리를 내리고 위로 자라는 모습에 빗대어, 내 생각을 세우고 오래 지켜 가는 일을 이야기해요.'},
  '乙':{name:'을목',image:'풀과 덩굴',meaning:'풀이 주변을 따라 부드럽게 자라는 모습에 빗대어, 사람들과 어울리며 내 길을 찾는 일을 이야기해요.'},
  '丙':{name:'병화',image:'햇살',meaning:'햇살이 넓은 곳을 비추는 모습에 빗대어, 생각이나 마음을 밖으로 드러내고 나누는 일을 이야기해요.'},
  '丁':{name:'정화',image:'등불',meaning:'등불이 가까운 곳을 밝히는 모습에 빗대어, 작은 차이를 살피고 한 가지 일에 마음을 쓰는 일을 이야기해요.'},
  '戊':{name:'무토',image:'산과 넓은 땅',meaning:'산과 땅이 제자리를 지키는 모습에 빗대어, 중심을 잡고 하던 일을 이어 가는 일을 이야기해요.'},
  '己':{name:'기토',image:'밭',meaning:'밭을 돌보고 가꾸는 모습에 빗대어, 필요한 것을 받아들이고 차근차근 보살피는 일을 이야기해요.'},
  '庚':{name:'경금',image:'단단한 쇠',meaning:'쇠로 모양을 만드는 모습에 빗대어, 필요한 것과 덜 필요한 것을 나누고 일을 정리하는 모습을 이야기해요.'},
  '辛':{name:'신금',image:'다듬어진 금속과 보석',meaning:'작은 부분까지 다듬는 모습에 빗대어, 세부를 살피고 내가 중요하게 여기는 기준을 찾는 일을 이야기해요.'},
  '壬':{name:'임수',image:'강과 바다',meaning:'물이 넓게 흐르는 모습에 빗대어, 여러 사람이나 생각을 만나고 이어 주는 일을 이야기해요.'},
  '癸':{name:'계수',image:'이슬과 비',meaning:'물이 조금씩 스며드는 모습에 빗대어, 눈에 잘 띄지 않는 부분을 살피고 천천히 이해하는 일을 이야기해요.'},
};
const unique = values => [...new Set(values)];
const entries = (profile,group) => profile.gods.filter(value=>value.god.group===group);
const count = (profile,group) => entries(profile,group).length;
const transitCount = (transit,group) => ['stemGod','branchGod'].filter(key=>transit[key].group===group).length;
const names = (profile,group) => unique(entries(profile,group).map(value=>value.god.name)).join('·');
const hasFinal = value => ((String(value).match(/[가-힣]/g)?.at(-1)?.charCodeAt(0)||0)-0xac00)%28!==0;
const ending = value => value+(hasFinal(value)?'이에요.':'예요.');
const topicParticle = value => value+(hasFinal(value)?'은':'는');
const wayParticle = value => value+(hasFinal(value)?'으로':'로');
const named = value => value+(hasFinal(value)?'이라는':'라는');
const location = entry => PILLARS[entry.pillarKey]+'의 '+(entry.position==='stem'?'위쪽 글자':'아래쪽 글자');
const elementCounts = profile => profile.elements.map(value=>ELEMENTS[value.key]+' '+value.count+'개').join(', ');
const topicNames = transit => unique([GODS[transit.stemGod.code].topic,GODS[transit.branchGod.code].topic]);
function themeSummary(profile,groups) {
  const found=unique(profile.gods.filter(value=>groups.includes(value.god.group)).map(value=>value.god.code));
  if(!found.length)return '확인한 글자에는 '+groups.map(group=>GROUPS[group].name).join('·')+'에 관한 이름이 없어요';
  return found.map(code=>GODS[code].topic).join(' · ')+'에 관한 뜻으로 읽어요';
}
function paragraphGroup(profile,group) {
  const definition=GROUPS[group], found=entries(profile,group);
  if(!found.length)return '내 사주의 확인된 부분에는 ‘'+definition.name+'’로 읽는 이름이 나오지 않았어요. 이 이름이 없다는 이유로 그 일을 못하거나 나쁜 일이 생긴다고 읽지는 않아요.';
  return '내 사주에서는 ‘'+definition.name+'’로 읽는 곳이 '+found.length+'곳이에요. '+found.map(location).join(', ')+'에서 확인했어요. 자세한 이름은 '+ending(names(profile,group));
}
function comparison(profile,transit,group,label) {
  const own=count(profile,group), moving=transitCount(transit,group), name=GROUPS[group].name;
  if(moving && own)return topicParticle('‘'+name+'’')+' 태어난 때의 사주에서 '+own+'곳, '+label+'의 두 글자에서 '+moving+'곳에 나와요. 오래 살펴볼 이야기와 이 시기의 이야기에 같은 이름이 들어 있는 셈이에요.';
  if(moving)return topicParticle('‘'+name+'’')+' 태어난 때의 사주에서 확인한 부분에는 없고, '+label+'의 두 글자 중 '+moving+'곳에 나와요. 그래서 이 시기의 글자를 볼 때 새로 살펴보는 이야기예요.';
  if(own)return topicParticle('‘'+name+'’')+' 태어난 때의 사주에 '+own+'곳 있어요. '+label+'의 두 글자에서는 나오지 않지만, 태어난 사주에 있던 이름이 사라지는 것은 아니에요.';
  return '이번에 확인한 태어난 사주와 '+label+'의 두 글자에는 ‘'+name+'’로 읽는 이름이 나오지 않았어요. 이 표에서 찾지 못했다는 뜻으로 읽으면 돼요.';
}
function interactionParagraphs(interactions,label) {
  const upper=interactions.filter(value=>value.kind==='stem-combination').length;
  const lower=interactions.filter(value=>value.kind==='branch-combination').length;
  const clash=interactions.filter(value=>value.kind==='branch-clash').length;
  const connect=upper+lower;
  const result=[
    '사주에서는 두 글자가 만났을 때 서로 맞추는 짝을 ‘합’, 서로 다른 방향을 가진 짝을 ‘충’이라고 불러요. 사람 사이에서 함께 맞출 점과 생각이 다른 점을 나누어 보는 것에 빗댄 설명이에요.',
    label+'에서 서로 맞추는 짝은 '+connect+'쌍, 서로 다른 방향의 짝은 '+clash+'쌍이에요. 맞추는 짝 중 위쪽 글자끼리는 '+upper+'쌍, 아래쪽 글자끼리는 '+lower+'쌍이에요.',
  ];
  if(connect&&clash)result.push('맞추는 짝과 다른 방향의 짝이 함께 있어요. 전통 풀이에서는 함께할 수 있는 부분과 조정할 부분을 둘 다 살펴봐요. 한쪽만 골라 좋거나 나쁘다고 정하지 않아요.');
  else if(clash)result.push('여기서는 서로 다른 방향의 짝이 나왔어요. 전통 풀이에서는 차이를 알아보고 조정할 부분을 살피라는 뜻으로 읽어요. 다툼이나 사고가 생긴다는 말은 아니에요.');
  else if(connect)result.push('여기서는 서로 맞추는 짝이 나왔어요. 전통 풀이에서는 두 사람이나 두 일을 어떻게 함께 맞춰 갈지 살펴보는 뜻으로 읽어요. 원하는 일이 저절로 이루어진다는 말은 아니에요.');
  else result.push('확인된 글자에서는 이 세 가지 종류의 짝을 찾지 못했어요. 실제 생활에서 만남이나 갈등이 없다는 뜻은 아니에요.');
  return result;
}
function interactionSummary(interactions) {
  const clash=interactions.filter(value=>value.kind==='branch-clash').length;
  return '서로 맞추는 짝 '+(interactions.length-clash)+'쌍, 서로 다른 방향의 짝 '+clash+'쌍이에요';
}
function elementComparison(profile,transit,label) {
  const top=ELEMENTS[transit.stem.element],bottom=ELEMENTS[transit.branch.element];
  const upperCount=profile.elements.find(value=>value.key===transit.stem.element).count;
  const lowerCount=profile.elements.find(value=>value.key===transit.branch.element).count;
  return [
    '사주는 글자를 나무·불·흙·쇠·물의 다섯 종류로 나눠요. 여기서는 '+label+'의 두 글자가 내 사주에 있던 것과 같은 종류인지 살펴봐요.',
    top===bottom
      ? label+'의 위쪽과 아래쪽 글자는 모두 '+top+'에 속해요. 내 사주에서 확인된 '+top+' 글자는 '+upperCount+'개예요.'
      : label+'의 위쪽 글자는 '+top+', 아래쪽 글자는 '+bottom+'에 속해요. 내 사주에는 '+top+' '+upperCount+'개, '+bottom+' '+lowerCount+'개가 확인돼요.',
    '같은 종류가 있으면 두 표에서 공통된 부분을, 없으면 새로 나타난 부분을 읽을 수 있어요. 이 개수만으로 어떤 색이나 물건이 행운을 준다고 정하지는 않아요.',
  ];
}
function seasonParagraph(profile) {
  if(!profile.season)return '입력한 정보로는 계절을 나누는 시점의 앞인지 뒤인지 확인할 수 없어요. 그래서 어느 계절의 글자인지 정하지 않았고, 계절에 따른 풀이도 덧붙이지 않았어요.';
  const day=ELEMENTS[profile.dayMaster.element],season=ELEMENTS[profile.season.element];
  const relation=(ELEMENT_ORDER.indexOf(profile.season.element)-ELEMENT_ORDER.indexOf(profile.dayMaster.element)+5)%5;
  const explanations=[
    '두 쪽이 같은 종류라, 내 생각과 비슷한 사람을 살펴보는 뜻으로 읽어요.',
    '옛 사주표에서는 나를 나타내는 쪽이 계절의 쪽을 돕는 짝이에요. 그래서 만들고 표현하는 일을 살펴보는 뜻으로 읽어요.',
    '옛 사주표에서는 나를 나타내는 쪽이 계절의 쪽을 다루는 짝이에요. 그래서 돈과 물건을 쓰고 챙기는 일을 살펴보는 뜻으로 읽어요.',
    '옛 사주표에서는 계절의 쪽이 나를 나타내는 쪽을 다루는 짝이에요. 그래서 약속과 맡은 일을 살펴보는 뜻으로 읽어요.',
    '옛 사주표에서는 계절의 쪽이 나를 나타내는 쪽을 돕는 짝이에요. 그래서 배우고 도움을 받는 일을 살펴보는 뜻으로 읽어요.',
  ];
  return '계절을 나누는 옛 달력 기준으로는 '+profile.season.label+'에 속해요. 나를 나타내는 글자는 '+day+', 이 계절의 대표는 '+ending(season)+' '+explanations[relation];
}
function chapter(title,summary,...easyParagraphs){return{title,summary,easyParagraphs};}
function lifelong(profile,chart) {
  const stem=STEMS[profile.dayMaster.hanja];
  const unknown=chart.pillars.filter(value=>value.uncertain||!value.hanja);
  const leading=profile.dominantElements.map(value=>ELEMENTS[value.key]+' '+value.count+'개').join(', ');
  const absent=profile.missingElements.map(value=>ELEMENTS[value.key]).join('·');
  const hiddenCount=profile.reference?.pillars.reduce((sum,value)=>sum+value.hiddenStems.length,0)||0;
  return {
    'natal-picture':chapter('내 사주부터 알아보기',profile.knownCharacterCount+'글자가 확인됐어요'+(unknown.length?' · 모르는 부분은 비워 두었어요':' · 해·달·날·시간을 모두 읽을 수 있어요'),
      '사주는 태어난 해·달·날·시간을 옛 달력의 글자로 적은 표예요. 각각 두 글자로 적기 때문에, 모두 알면 여덟 글자가 돼요. 이 태어난 때의 표를 ‘원국’이라고 불러요.',
      '이번에는 모두 '+profile.knownCharacterCount+'글자를 확인했어요. 확인된 글자의 이름은 '+ending(profile.knownPillars.map(value=>PILLARS[value.key]+' '+value.hangul).join(', ')),
      unknown.length
        ? '아직 정할 수 없는 부분은 '+ending(unknown.map(value=>PILLARS[value.key]).join('·'))+' 확인되지 않은 글자를 짐작으로 채우지 않았어요. 가능한 글자가 여럿이면 근거 표에서 모두 확인할 수 있어요.'
        : '해·달·날·시간의 글자가 모두 확인됐어요. 아래에서는 각 글자의 뜻을 풀고, 글자들이 서로 어떤 짝을 이루는지도 하나씩 살펴봐요.'),
    'day-season':chapter('나를 나타내는 글자와 태어난 계절',topicParticle(stem.name)+' '+stem.image+'에 빗대어 읽어요'+(profile.season?' · 사주 달력의 계절은 '+profile.season.label+'이에요':' · 계절은 아직 정할 수 없어요'),
      '사주에서는 태어난 날의 위쪽 글자를 나를 나타내는 기준으로 삼아요. 이를 ‘일간’이라고 해요. 내 기준 글자의 이름은 '+stem.name+'이고, '+stem.image+'에 빗대어 설명해요.',
      '전통적인 비유로는 이렇게 읽어요. '+stem.meaning,
      seasonParagraph(profile),
      '이것은 글자와 계절에 붙여 읽는 뜻이에요. 같은 글자라도 실제로 무엇을 좋아하고 어떻게 행동하는지는 살아온 경험과 선택에 따라 달라요.'),
    'element-yinyang':chapter('나무·불·흙·쇠·물의 개수','가장 많이 나온 것은 '+leading+'예요',
      '사주 글자는 나무·불·흙·쇠·물의 다섯 종류로 나눠요. 이 다섯 종류를 ‘오행’이라고 불러요. 내 사주에서 확인된 개수는 '+elementCounts(profile)+'예요.',
      '가장 많이 나온 것은 '+leading+'예요. '+(absent?'확인된 부분에서 '+absent+'에 속한 글자는 나오지 않았어요.':'다섯 종류가 모두 한 글자 이상 나왔어요.'),
      '개수는 표에 글자가 몇 개 있는지를 센 숫자예요. 많은 쪽이 무조건 좋거나, 없는 쪽에 해당하는 능력이 부족하다는 뜻은 아니에요.',
      '옛 사주표는 글자를 ‘음’과 ‘양’이라는 두 이름으로도 나눠요. 이번에는 음 '+profile.yinCount+'개, 양 '+profile.yangCount+'개예요. 이것도 글자의 종류를 센 수이지 성격 점수는 아니에요.'),
    'ten-gods':chapter('내 사주에서 읽는 다섯 가지 생활 이야기','확인된 '+profile.gods.length+'곳을 친구·표현·돈·약속·배움으로 나눠 읽어요',
      '나를 나타내는 글자와 다른 글자의 관계에는 열 가지 이름이 있어요. 이를 ‘십성’이라고 해요. 이 관계를 보면 어떤 생활 이야기로 풀어 읽는지 알 수 있어요.',
      '이 이름을 생활 이야기 다섯 가지로 묶어 읽어요. 내 생각과 친구·동료, 만들고 표현하는 일, 돈과 물건을 챙기는 일, 약속과 맡은 일, 배우고 도움받는 일이에요.',
      '내 사주에서 각 이야기로 읽는 곳은 친구·동료 '+count(profile,'peer')+'곳, 만들고 표현하기 '+count(profile,'expression')+'곳, 돈과 물건 '+count(profile,'wealth')+'곳이에요. 약속과 맡은 일은 '+count(profile,'authority')+'곳, 배움과 도움은 '+count(profile,'resource')+'곳이에요.',
      '이 숫자는 어떤 이름이 어디에 나왔는지 알려 줘요. 앞으로 잘될 일의 순위는 아니에요. 다음 항목에서 생활 이야기별로 뜻을 자세히 읽을 수 있어요.'),
    'natal-interactions':chapter('서로 맞추는 부분과 다른 방향인 부분',interactionSummary(profile.interactions),...interactionParagraphs(profile.interactions,'태어난 때의 사주')),
    relationships:chapter('내 생각과 사람들과의 관계',themeSummary(profile,['peer']),
      '이 항목은 내 생각을 지키는 일과, 비슷한 처지의 사람들과 함께하는 일을 읽어요. 이 두 가지를 살펴보는 사주 이름이 ‘비겁’이에요.',
      paragraphGroup(profile,'peer'),
      count(profile,'peer')
        ? '여기 나온 이름은 내 생각과 다른 사람의 생각을 어떻게 함께 둘지 살펴보는 데 쓰여요. 많다고 고집이 세다거나, 적다고 친구가 없다고 정하지 않아요.'
        : '친구를 사귀는 능력이나 사랑받을 가능성을 이 이름의 유무로 정할 수는 없어요. 사람들과의 관계는 실제로 나누는 말과 행동도 함께 살펴봐야 해요.'),
    work:chapter('잘 표현하는 일과 맡은 일을 해내는 것',themeSummary(profile,['expression','authority']),
      '일을 볼 때는 생각을 말이나 결과물로 만드는 쪽과, 약속을 지키고 맡은 일을 하는 쪽을 함께 봐요. 사주에서는 앞쪽을 ‘식상’, 뒤쪽을 ‘관성’이라고 불러요.',
      paragraphGroup(profile,'expression'),
      paragraphGroup(profile,'authority'),
      '표현하는 이름이 있으면 생각을 어떻게 전할지, 약속에 관한 이름이 있으면 어디까지 맡고 어떤 기준을 지킬지 살펴보는 뜻이에요. 직업이나 성적을 이 숫자만으로 고르지는 않아요.'),
    resources:chapter('돈과 물건을 챙기는 이야기',themeSummary(profile,['wealth']),
      '사주에서 ‘재성’은 돈과 물건을 쓰고 챙기는 일을 살펴보는 이름이에요. 가진 돈이 얼마인지 알려 주는 숫자는 아니에요.',
      paragraphGroup(profile,'wealth'),
      count(profile,'wealth')
        ? '여기서 편재는 여러 곳에 쓰고 주고받는 일을, 정재는 정해진 것을 차근차근 챙기는 일을 뜻해요. 내 표에 나온 이름을 보고 어떤 이야기를 읽는지 구별하면 돼요.'
        : '이번 표에서 이 이름이 나오지 않았다고 돈을 벌지 못한다는 뜻은 아니에요. 수입과 지출은 실제로 하는 일과 쓰는 습관을 보고 판단해야 해요.'),
    'learning-inner':chapter('배우는 방법과 도움받는 일',themeSummary(profile,['resource']),
      '배우고 도움을 받는 일을 살펴보는 사주 이름은 ‘인성’이에요. 사람의 품성이나 착한 정도를 말하는 ‘인성’과는 뜻이 달라요.',
      paragraphGroup(profile,'resource'),
      count(profile,'resource')
        ? '여기서 편인은 궁금한 것을 깊이 찾아보는 쪽, 정인은 기초부터 차근차근 배우는 쪽으로 풀어요. 어느 쪽이 더 똑똑하다는 순서는 없어요.'
        : '이 이름이 안 나와도 배우거나 도움받을 수 있어요. 공부 실력이나 시험 결과를 이 표 하나로 판단하지 않아요.',
      profile.knownPillars.some(value=>value.key==='hour')
        ? '태어난 시간의 글자도 이번 계산에 들어 있어요. 여러 생활 이야기가 함께 나오는 경우의 참고 설명은 근거를 펼쳐 볼 수 있어요.'
        : '태어난 시간을 몰라 시간의 글자는 이번 계산에 들어 있지 않아요. 모르는 부분을 대신 만들어 배움이나 앞으로의 삶을 정하지 않았어요.'),
    'source-reference':chapter('더 깊이 살펴보는 사주 자료','안쪽에 연결된 글자 '+hiddenCount+'개와 옛 분류 이름을 모두 보여 드려요',
      '아래쪽 글자 하나에 연결되는 다른 글자들을 ‘지장간’이라고 해요. 겉의 글자만 볼 때보다 한 단계 더 자세히 살피는 자료예요. 이번에 확인된 사주에서 이 글자 '+hiddenCount+'개를 모두 실었어요.',
      '‘십이운성’은 자라고 쉬어 가는 모습에 빗대어 붙인 열두 단계의 이름이에요. ‘병’이나 ‘사’라는 이름이 있어도 실제 질병이나 죽음을 알려 주는 말로 읽지 않아요.',
      '‘납음’은 두 글자의 조합마다 붙인 옛 이름이에요. ‘순’은 옛 달력의 글자 조합을 열 개씩 묶은 것이고, ‘공망’은 그 묶음에서 빠지는 두 글자예요.',
      '이 자료는 이름과 계산 결과까지 보여 드려요. 그 이름이 내 삶에 어떤 사건을 일으킨다고 덧붙이지는 않았어요. 모든 원래 글자와 자료 출처는 아래 근거에서 확인할 수 있어요.'),
  };
}
function annual(profile,fortune) {
  const year=fortune.year,a=fortune.annual,label=year+'년';
  return {
    'annual-overview':chapter(label+'에 읽는 생활 이야기','이 해에 읽는 뜻: '+topicNames(a).join(' · '),
      '태어난 때의 사주는 그대로 두고, '+label+'을 나타내는 두 글자를 나를 나타내는 글자와 비교해요. 한 해를 이렇게 읽는 풀이를 ‘세운’이라고 불러요.',
      a.stemGod.code===a.branchGod.code?'두 글자가 같은 이름인 '+wayParticle(a.stemGod.name)+' 읽혀요.':'위쪽의 사주 이름은 '+ending(a.stemGod.name)+' 아래쪽의 사주 이름은 '+ending(a.branchGod.name),
      '위쪽 글자는 이렇게 읽어요. '+GODS[a.stemGod.code].meaning+' 아래쪽 글자는 이렇게 읽어요. '+GODS[a.branchGod.code].meaning,
      '이 풀이의 한 해는 1월 1일이 아니라 봄의 시작을 알리는 ‘입춘’에서 나눠요. '+a.start.label+'부터 '+a.end.label+' 바로 전까지의 이야기예요.'),
    'annual-interactions':chapter('한 해의 글자와 내 사주가 만나는 모습',interactionSummary(a.interactions),...interactionParagraphs(a.interactions,label+'의 글자와 내 사주 사이')),
    'annual-relationships':chapter('친구·동료와 내 생각을 함께 살피기','친구·동료의 뜻은 태어난 사주 '+count(profile,'peer')+'곳, 이 해의 글자 '+transitCount(a,'peer')+'곳에 있어요',
      '사람들과의 관계에서는 내 의견을 어떻게 말하고, 다른 사람과 무엇을 함께 정할지 살펴봐요. 사주에서 이런 이야기를 읽는 이름들을 ‘비겁’이라고 불러요.',
      comparison(profile,a,'peer',label),
      '이 항목은 누군가를 언제 만나거나 헤어질지 정하는 풀이가 아니에요. 예를 들어 함께 일할 때 내 의견과 공동으로 정할 일을 구분하는 장면에 비추어 읽을 수 있어요.'),
    'annual-work-money':chapter('할 일과 돈을 차근차근 살피기','이 해에는 표현의 이름 '+transitCount(a,'expression')+'곳, 약속의 이름 '+transitCount(a,'authority')+'곳, 돈을 다루는 이름 '+transitCount(a,'wealth')+'곳이 나와요',
      comparison(profile,a,'expression',label),
      comparison(profile,a,'authority',label),
      comparison(profile,a,'wealth',label),
      '세 이야기는 각각 생각을 말이나 결과물로 만들기, 맡은 일을 해내기, 돈과 물건을 챙기기를 뜻해요. 이 이름들의 개수를 예상 수입이나 성공 확률로 바꾸지는 않아요.'),
    'annual-learning':chapter('배우고 도움을 받는 한 해의 이야기','배움의 뜻은 태어난 사주 '+count(profile,'resource')+'곳, 이 해의 글자 '+transitCount(a,'resource')+'곳에 있어요',
      '배움과 도움을 읽는 이름들을 사주에서는 ‘인성’이라고 해요. 학교 공부뿐 아니라 새 일을 배우거나 모르는 것을 물어보는 장면도 여기에 빗대어 읽어요.',
      comparison(profile,a,'resource',label),
      '이름이 나왔다면 배움과 도움에 관한 뜻을 살펴볼 수 있어요. 시험에 붙는지, 얼마나 빨리 배우는지는 이 표에서 계산하지 않았어요.'),
    'annual-elements':chapter('내 사주와 한 해의 공통점·차이','이 해의 위쪽은 '+ELEMENTS[a.stem.element]+', 아래쪽은 '+ELEMENTS[a.branch.element]+'에 속해요',...elementComparison(profile,a,label)),
  };
}
function monthly(profile,month) {
  const label=month.month+'월',top=GODS[month.stemGod.code],bottom=GODS[month.branchGod.code];
  return {
    'month-stem':chapter('이번 달의 첫 번째 이야기','‘'+top.topic+'’의 뜻으로 읽어요',
      label+'을 나타내는 위쪽 글자를 나를 나타내는 글자와 비교하면, '+named('‘'+top.topic+'’')+' 이야기로 읽어요. 이 관계의 사주 이름은 '+ending(month.stemGod.name),
      '쉬운 말로는 '+top.meaning+' 예를 들어 '+top.example,
      comparison(profile,month,month.stemGod.group,label)),
    'month-branch':chapter('이번 달의 두 번째 이야기','‘'+bottom.topic+'’의 뜻으로 읽어요',
      '달의 아래쪽 글자에는 연결된 글자가 여러 개일 수 있어요. 그중 대표가 되는 글자를 골라 나를 나타내는 글자와 비교해요. 이번에는 '+named('‘'+bottom.topic+'’')+' 이야기로 읽으며, 이름은 '+ending(month.branchGod.name),
      '쉬운 말로는 '+bottom.meaning+' 예를 들어 '+bottom.example,
      month.stemGod.code===month.branchGod.code
        ? '첫 번째 이야기와 같은 이름이 두 번 나왔어요. 같은 뜻을 두 자리에서 읽는다는 말이에요. 그만큼 행운이나 불운이 두 배가 된다는 뜻은 아니에요.'
        : comparison(profile,month,month.branchGod.group,label)),
    'month-interactions':chapter('함께 맞출 점과 조정할 점',interactionSummary(month.interactions),...interactionParagraphs(month.interactions,label+'의 글자와 내 사주 사이')),
    'month-elements':chapter('이번 달과 내 사주의 공통점·차이','이번 달의 위쪽은 '+ELEMENTS[month.stem.element]+', 아래쪽은 '+ELEMENTS[month.branch.element]+'에 속해요',...elementComparison(profile,month,label)),
  };
}
export const PLAIN_GUIDE = {
  title:'사주를 처음 읽어도 괜찮아요',
  paragraphs:[
    '먼저 각 항목의 쉬운 풀이를 읽어 보세요. 어려운 사주 이름은 뜻을 먼저 설명하고, 원래 이름도 함께 알려 드려요.',
    '‘예를 들어’ 뒤의 내용은 뜻을 이해하기 위한 생활 예시예요. 내가 겪었거나 앞으로 꼭 겪을 일을 말하는 것은 아니에요.',
    '더 자세히 알고 싶으면 ‘이 풀이의 근거 보기’를 펼쳐 보세요. 계산한 글자와 전통 해석, 함께 쓰는 설명, 저희가 작성한 참고 설명을 구분해 놓았어요.',
  ],
};
export const PLAIN_GLOSSARY = [
  {term:'사주·원국',meaning:'태어난 해·달·날·시간을 옛 달력의 글자로 적은 표예요. 원국은 이 태어난 때의 사주를 가리켜요.'},
  {term:'년주·월주·일주·시주',meaning:'순서대로 태어난 해·달·날·시간을 적은 글자예요. 각각 두 글자씩 묶어서 적어요.'},
  {term:'천간·지지',meaning:'두 글자 중 위쪽 글자를 천간, 아래쪽 글자를 지지라고 불러요.'},
  {term:'일간',meaning:'태어난 날의 위쪽 글자예요. 사주에서 나를 나타내는 기준으로 삼아요.'},
  {term:'오행',meaning:'사주 글자를 나무·불·흙·쇠·물의 다섯 종류로 나누는 방법이에요. 원래 이름은 목·화·토·금·수예요.'},
  {term:'음양',meaning:'옛 사주표에서 글자를 두 갈래로 나눠 붙인 이름이에요. 음과 양의 개수가 좋고 나쁨을 알려 주는 점수는 아니에요.'},
  {term:'십성',meaning:'나를 나타내는 글자와 다른 글자의 관계에 붙인 열 가지 이름이에요. 친구, 표현, 돈, 약속, 배움의 다섯 생활 이야기로 묶어 읽어요.'},
  ...Object.values(GROUPS).map(value=>({term:value.term,meaning:value.meaning})),
  {term:'비견·겁재',meaning:'비견은 내 생각과 비슷한 처지의 사람, 겁재는 함께 쓰는 것과 서로의 몫을 살펴보는 이름이에요.'},
  {term:'식신·상관',meaning:'식신은 꾸준히 만들고 나누기, 상관은 새 생각으로 더 나은 방법을 찾기를 살펴보는 이름이에요.'},
  {term:'편재·정재',meaning:'편재는 돈과 물건의 여러 쓰임, 정재는 정해진 것을 차근차근 챙기기를 살펴보는 이름이에요.'},
  {term:'편관·정관',meaning:'편관은 어려운 일과 무거운 책임, 정관은 약속을 지키고 맡은 일을 해내기를 살펴보는 이름이에요.'},
  {term:'편인·정인',meaning:'편인은 궁금한 것을 깊이 알아보기, 정인은 기초부터 배우고 도움받기를 살펴보는 이름이에요.'},
  {term:'합·충',meaning:'글자 사이에서 맞추는 짝은 합, 서로 다른 방향의 짝은 충이라고 불러요. 합이라고 무조건 좋거나, 충이라고 나쁜 일이 생기는 것은 아니에요.'},
  {term:'천간합·지지육합·지지충',meaning:'위쪽 글자끼리 맞추는 짝은 천간합, 아래쪽 글자끼리 맞추는 여섯 종류의 짝은 지지육합이에요. 아래쪽 글자끼리 다른 방향인 짝은 지지충이에요.'},
  {term:'절기·절기월·입춘',meaning:'계절의 흐름을 나누는 옛 달력의 시점을 절기라고 해요. 절기로 나눈 한 달은 달력의 1일에 시작하지 않을 수 있어요. 입춘은 봄의 시작을 알리는 절기예요.'},
  {term:'간지·세운·월운',meaning:'간지는 옛 달력에서 해·달·날·시간을 적는 두 글자예요. 한 해의 글자로 읽는 풀이를 세운, 한 달의 글자로 읽는 풀이를 월운이라고 해요.'},
  {term:'지장간·본기',meaning:'아래쪽 글자 하나에 연결되는 다른 글자들을 지장간이라고 해요. 그중 대표가 되는 글자는 본기라고 불러요.'},
  {term:'십이운성',meaning:'자라고 쉬어 가는 모습에 빗댄 열두 단계의 이름이에요. 이름에 병이나 사가 있어도 실제 병이나 죽음이 생긴다는 뜻은 아니에요.'},
  {term:'납음',meaning:'옛 달력의 두 글자 조합마다 붙인 이름이에요. 여기서는 원래 자료의 이름을 그대로 보여 줘요.'},
  {term:'순·공망',meaning:'옛 달력의 글자 조합을 열 개씩 묶은 것을 순이라고 해요. 그 묶음에서 빠지는 두 글자를 공망이라고 불러요.'},
  {term:'대운·용신·신살',meaning:'대운은 10년씩 나누어 읽는 큰 흐름, 용신은 사주의 균형을 읽을 때 중요하게 보는 기운, 신살은 특정한 글자 조합에 붙인 이름이에요. 이 서비스는 이 항목들을 계산하지 않아요.'},
];
function apply(chapters,copy) {
  for(const value of chapters){
    if(!copy[value.id])throw new Error('쉬운 풀이를 준비하지 못했어요. 다시 열어 주세요.');
    Object.assign(value,copy[value.id]);
  }
}
export function attachPlainLanguage(report,chart,fortune) {
  report.guide={title:PLAIN_GUIDE.title,paragraphs:[...PLAIN_GUIDE.paragraphs]};
  report.glossary=PLAIN_GLOSSARY.map(value=>({...value}));
  report.title='내 사주와 '+fortune.year+'년을 쉬운 말로 읽기';
  report.intro='확정된 '+fortune.profile.knownCharacterCount+'글자로 읽는 이야기예요. 어려운 이름을 외우지 않아도 뜻을 알 수 있게 풀어 썼어요.';
  const life=report.sections.find(value=>value.id==='lifelong');
  life.title='평생운 · 나의 사주와 생활 이야기';
  life.summary='내 사주에서 친구와 관계, 하는 일, 돈, 배움의 뜻을 차근차근 읽어요. 나이별로 일어날 사건을 정해 놓은 이야기는 아니에요.';
  apply(life.chapters,lifelong(fortune.profile,chart));
  const year=report.sections.find(value=>value.id==='annual');
  year.title=fortune.year+'년 올해운';
  year.summary='한 해를 나타내는 글자를 내 사주와 함께 읽어요. 어떤 생활 이야기가 나오는지 뜻부터 살펴봐요.';
  apply(year.chapters,annual(fortune.profile,fortune));
  for(const month of report.months){
    const source=fortune.months.find(value=>value.month===month.month);
    month.title=month.month+'월 이야기';
    month.summary='이번 달에 읽는 뜻: '+topicNames(source).join(' / ')+'.';
    apply(month.chapters,monthly(fortune.profile,source));
  }
  report.monthsIntro='사주의 한 달은 달력의 1일부터 말일까지와 달라요. 옛 달력에서 계절의 흐름을 나누는 시점을 기준으로 삼기 때문이에요. 각 달에 적힌 시작 날짜와 끝 날짜를 함께 봐 주세요.';
  if(fortune.notes.length>1)report.monthsIntro+=' '+fortune.notes.slice(1).join(' ');
  return report;
}
