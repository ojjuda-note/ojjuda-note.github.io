// Shared reference text, explicitly separated from calculated observations.
// These definitions are reusable rules, not individually authored predictions.
export const STEM_REFERENCE = {
  '甲': {name:'갑목',symbol:'큰 나무',description:'갑목은 큰 나무의 상징으로 설명하는 양목이에요. 곧게 자라고 방향을 세운다는 비유는 이 글자의 공통 설명이며, 이것만으로 실제 성격이나 인생의 결과를 정하지 않아요.'},
  '乙': {name:'을목',symbol:'풀과 덩굴',description:'을목은 풀과 덩굴의 상징으로 설명하는 음목이에요. 유연하게 자라고 주변과 연결된다는 비유는 이 글자의 공통 설명이에요.'},
  '丙': {name:'병화',symbol:'태양',description:'병화는 태양의 상징으로 설명하는 양화예요. 밝히고 드러낸다는 말은 이 글자를 이해하기 위한 전통적 비유예요.'},
  '丁': {name:'정화',symbol:'등불',description:'정화는 등불의 상징으로 설명하는 음화예요. 가까운 곳을 비추고 집중한다는 말은 이 글자의 공통적인 상징 설명이에요.'},
  '戊': {name:'무토',symbol:'산과 넓은 땅',description:'무토는 산과 넓은 땅으로 비유하는 양토예요. 한자리에 머물며 꾸준히 이어 가는 모습에 빗대어 읽어요. 이 글자만으로 삶이 안정될지 알 수는 없어요.'},
  '己': {name:'기토',symbol:'밭과 대지',description:'기토는 밭과 대지로 비유하는 음토예요. 받아들이고 가꾼다는 말은 이 글자를 설명하는 공통 비유예요.'},
  '庚': {name:'경금',symbol:'단단한 쇠',description:'경금은 단단한 쇠로 비유하는 양금이에요. 필요한 것을 고르고 일을 정리하는 모습에 빗대어 읽어요.'},
  '辛': {name:'신금',symbol:'다듬어진 금속과 보석',description:'신금은 다듬어진 금속과 보석으로 비유하는 음금이에요. 작은 차이를 살피고 꼼꼼하게 다듬는 모습에 빗대어 읽어요.'},
  '壬': {name:'임수',symbol:'강과 바다',description:'임수는 강과 바다로 비유하는 양수예요. 여러 사람의 생각을 모으고 서로 이어 주는 모습에 빗대어 읽어요.'},
  '癸': {name:'계수',symbol:'이슬과 비',description:'계수는 이슬과 비로 비유하는 음수예요. 스며들고 살핀다는 말은 이 글자의 공통 설명이에요.'},
};

export const GROUP_REFERENCE = {
  peer:{label:'비겁',meaning:'내 생각·동료·서로의 몫',definition:'비겁은 일간과 같은 오행의 관계예요. 비견과 겁재를 묶으며, 내 의견을 지키는 모습과 친구·동료 사이의 관계로 풀이해요.'},
  expression:{label:'식상',meaning:'말하기·만들기·전하기',definition:'식상은 일간이 생하는 오행의 관계예요. 식신과 상관을 묶으며, 생각을 말하거나 무언가를 만드는 모습으로 풀이해요.'},
  wealth:{label:'재성',meaning:'돈과 물건을 챙기고 쓰기',definition:'재성은 일간이 극하는 오행의 관계예요. 편재와 정재를 함께 부르는 말이에요. 돈과 물건을 챙기고 쓰는 모습으로 풀이해요. 실제 재산이나 수익의 크기를 계산한 값은 아니에요.'},
  authority:{label:'관성',meaning:'약속과 맡은 일',definition:'관성은 일간을 극하는 오행의 관계예요. 편관과 정관을 함께 부르는 말이에요. 약속을 지키고 맡은 일을 하는 모습으로 풀이해요. 직급이나 승진 여부를 뜻하는 값은 아니에요.'},
  resource:{label:'인성',meaning:'배우고 도움받기',definition:'인성은 일간을 생하는 오행의 관계예요. 편인과 정인을 함께 부르는 말이에요. 배우거나 도움을 받는 모습으로 풀이해요. 실제 학업 능력이나 합격 여부를 측정한 값은 아니에요.'},
};

export const GOD_REFERENCE = {
  companion:{name:'비견',meaning:'내 의견을 지키고 동료와 함께하기',definition:'비견은 일간과 오행·음양이 같은 천간의 관계예요. 내 생각을 지키고 친구·동료와 지내는 모습으로 풀이해요.'},
  competitor:{name:'겁재',meaning:'서로의 몫을 정하고 힘을 합치기',definition:'겁재는 일간과 오행은 같고 음양이 다른 관계예요. 함께 쓰는 것을 나누거나 서로 경쟁하고 힘을 합치는 모습으로 풀이해요. 이름만으로 금전 손실을 예고하지 않아요.'},
  creator:{name:'식신',meaning:'꾸준히 만들고 표현하기',definition:'식신은 일간이 생하는 오행 중 음양이 같은 관계예요. 꾸준히 만들고 표현하는 주제로 설명해요.'},
  critic:{name:'상관',meaning:'새로운 생각으로 방법 바꾸기',definition:'상관은 일간이 생하는 오행 중 음양이 다른 관계예요. 새 생각을 말하고 불편한 방법을 고치는 모습으로 풀이해요.'},
  opportunist:{name:'편재',meaning:'필요한 돈과 물건을 찾아 쓰기',definition:'편재는 일간이 극하는 오행 중 음양이 같은 관계예요. 돈과 물건을 주고받거나 여러 곳에 쓰는 모습으로 풀이해요. 뜻밖의 수입을 계산한 결과는 아니에요.'},
  manager:{name:'정재',meaning:'돈과 물건을 챙기고 모으기',definition:'정재는 일간이 극하는 오행 중 음양이 다른 관계예요. 돈과 물건을 꾸준히 챙기고 조금씩 모으는 모습으로 풀이해요.'},
  challenger:{name:'편관',meaning:'어려운 일과 무거운 책임',definition:'편관은 일간을 극하는 오행 중 음양이 같은 관계이며 칠살이라고도 불러요. 어려운 일을 맡았을 때 느끼는 긴장과 책임으로 풀이해요. 사고나 질병을 뜻한다고 단정하지 않아요.'},
  officer:{name:'정관',meaning:'약속을 지키고 맡은 일 해내기',definition:'정관은 일간을 극하는 오행 중 음양이 다른 관계예요. 함께 정한 약속을 지키고 맡은 일을 해내는 모습으로 풀이해요.'},
  explorer:{name:'편인',meaning:'깊이 알아보고 다른 생각도 들어 보기',definition:'편인은 일간을 생하는 오행 중 음양이 같은 관계예요. 궁금한 것을 깊이 알아보고 다른 사람의 생각도 들어 보는 모습으로 풀이해요.'},
  scholar:{name:'정인',meaning:'기초부터 배우고 도움받기',definition:'정인은 일간을 생하는 오행 중 음양이 다른 관계예요. 기초부터 배우고 필요한 도움을 받는 모습으로 풀이해요.'},
};

export const ELEMENT_RELATIONS = [
  {key:'same',label:'같은 오행',meaning:'내 의견과 친구·동료 관계',definition:'기준 글자와 대상 글자가 같은 오행이에요.'},
  {key:'output',label:'일간이 생함',meaning:'표현하고 만들어 내는 관계',definition:'일간의 오행이 대상 오행을 생하는 관계예요.'},
  {key:'wealth',label:'일간이 극함',meaning:'돈과 물건을 챙기고 쓰는 관계',definition:'일간의 오행이 대상 오행을 극하는 관계예요.'},
  {key:'authority',label:'일간을 극함',meaning:'약속을 지키고 맡은 일을 하는 관계',definition:'대상 오행이 일간의 오행을 극하는 관계예요.'},
  {key:'resource',label:'일간을 생함',meaning:'배우고 도움을 받는 관계',definition:'대상 오행이 일간의 오행을 생하는 관계예요.'},
];

export const RELATION_REFERENCE = {
  'stem-combination':{label:'천간합',meaning:'서로의 생각을 맞춰 가는 모습',definition:'갑기·을경·병신·정임·무계 중 해당 천간의 짝을 찾은 결과예요. 합화가 실제로 성립하는지까지 판정한 것은 아니에요.'},
  'branch-combination':{label:'지지육합',meaning:'함께하는 일을 맞춰 가는 모습',definition:'자축·인해·묘술·진유·사신·오미 중 해당 지지의 짝을 찾은 결과예요. 특정한 만남이나 좋은 결과를 보장하지 않아요.'},
  'branch-clash':{label:'지지충',meaning:'서로 다른 점을 알고 맞춰 가는 모습',definition:'자오·축미·인신·묘유·진술·사해 중 해당 지지의 짝을 찾은 결과예요. 충이 있다는 사실만으로 갈등이나 사건의 발생을 정하지 않아요.'},
};

// Only rules whose two observed groups exist run. This finite rule list is
// disclosed; it is not a catalogue of individually authored fortune entries.
export const GROUP_PAIR_RULES = [
  {id:'peer-expression',left:'peer',right:'expression',title:'내 생각을 다른 사람에게 전하기',reading:'내가 정한 생각을 어떻게 말하고 다른 사람에게 전하는지 함께 살펴봐요. 스스로 결정하는 모습과 그 결정을 설명하는 모습을 연결해 풀이해요.'},
  {id:'peer-wealth',left:'peer',right:'wealth',title:'함께 쓰는 돈과 서로의 몫',reading:'돈이나 물건을 함께 쓸 때 누가 결정하고 얼마나 나누는지 살펴봐요. 누가 챙기고 관리할지도 함께 생각하는 풀이예요.'},
  {id:'peer-authority',left:'peer',right:'authority',title:'내 생각과 함께 정한 약속',reading:'내가 원하는 것과 다른 사람과 정한 약속을 함께 살펴봐요. 혼자 결정할 일인지, 함께 정한 약속을 따라야 할 일인지 나누어 생각하는 풀이예요.'},
  {id:'peer-resource',left:'peer',right:'resource',title:'도움을 받으며 스스로 결정하기',reading:'다른 사람에게 배우거나 도움을 받으면서도 내 선택을 하는 모습으로 풀이해요. 들은 내용을 내 상황에 맞게 정리하는 과정을 살펴봐요.'},
  {id:'expression-wealth',left:'expression',right:'wealth',title:'만드는 일과 필요한 돈',reading:'무언가를 만드는 일과 그 일에 드는 돈·준비물을 함께 살펴봐요. 두 이름이 있다고 해서 재능이 돈으로 이어진다거나 수익이 생긴다고 판단하지 않아요. 전통에서 말하는 ‘식상생재’가 성립하는지도 따로 판단하지 않아요.'},
  {id:'expression-authority',left:'expression',right:'authority',title:'새로운 방법과 지켜야 할 약속',reading:'새로운 방법을 제안하는 모습과 함께 정한 약속을 지키는 모습을 살펴봐요. 바꿔도 되는 부분과 계속 지켜야 할 부분을 나누어 생각하는 풀이예요.'},
  {id:'expression-resource',left:'expression',right:'resource',title:'배운 것을 직접 써 보기',reading:'배우는 모습과 배운 것을 표현하는 모습이 함께 나와요. 내용을 이해한 뒤 내 말로 설명하거나 직접 만들어 보는 과정으로 풀이해요.'},
  {id:'wealth-authority',left:'wealth',right:'authority',title:'맡은 일에 필요한 돈과 시간',reading:'맡은 일을 해내는 데 얼마나 돈과 시간이 드는지 함께 살펴봐요. 내가 어디까지 맡고 챙길지 생각하는 풀이예요.'},
  {id:'wealth-resource',left:'wealth',right:'resource',title:'배우는 데 드는 준비와 쓰임',reading:'배우는 데 드는 돈·시간과 배운 것을 쓸 곳을 함께 살펴봐요. 무엇을 준비하고 생활에서 어떻게 활용할지 생각하는 풀이예요.'},
  {id:'authority-resource',left:'authority',right:'resource',title:'맡은 일을 배우고 도움받기',reading:'맡은 일을 해내는 모습과 배우거나 도움을 받는 모습을 함께 살펴봐요. 필요한 방법과 규칙을 익혀 실제로 일을 하는 과정으로 풀이해요.'},
];

export const PRACTICE_SUGGESTIONS = {
  peer:'함께하는 일이 있다면 내가 정할 일과 함께 의논할 일을 나누어 적어 보세요.',
  expression:'전하고 싶은 생각 하나를 짧게 써 보거나 작은 결과물로 만들어 보세요.',
  wealth:'자주 나가는 돈과 함께 쓰는 돈을 적어 보세요. 얼마를 언제, 누가 낼지도 함께 확인해 보세요.',
  authority:'맡은 일을 언제까지 끝낼지, 어떤 약속을 지켜야 하는지 확인해 보세요.',
  resource:'새로 배운 것을 내 말로 설명해 보고, 어디에 쓸 수 있을지 떠올려 보세요.',
};
