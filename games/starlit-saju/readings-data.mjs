// Shared reference text, explicitly separated from calculated observations.
// These definitions are reusable rules, not individually authored predictions.
export const STEM_REFERENCE = {
  '甲': {name:'갑목',symbol:'큰 나무',description:'갑목은 큰 나무의 상징으로 설명하는 양목이에요. 곧게 자라고 방향을 세운다는 비유는 이 글자의 공통 설명이며, 이것만으로 실제 성격이나 인생의 결과를 정하지 않아요.'},
  '乙': {name:'을목',symbol:'풀과 덩굴',description:'을목은 풀과 덩굴의 상징으로 설명하는 음목이에요. 유연하게 자라고 주변과 연결된다는 비유는 이 글자의 공통 설명이에요.'},
  '丙': {name:'병화',symbol:'태양',description:'병화는 태양의 상징으로 설명하는 양화예요. 밝히고 드러낸다는 말은 이 글자를 이해하기 위한 전통적 비유예요.'},
  '丁': {name:'정화',symbol:'등불',description:'정화는 등불의 상징으로 설명하는 음화예요. 가까운 곳을 비추고 집중한다는 말은 이 글자의 공통적인 상징 설명이에요.'},
  '戊': {name:'무토',symbol:'산과 넓은 땅',description:'무토는 산과 넓은 땅으로 비유하는 양토예요. 중심과 유지의 주제로 설명하지만, 토 글자만으로 안정적인 삶을 예측하는 것은 아니에요.'},
  '己': {name:'기토',symbol:'밭과 대지',description:'기토는 밭과 대지로 비유하는 음토예요. 받아들이고 가꾼다는 말은 이 글자를 설명하는 공통 비유예요.'},
  '庚': {name:'경금',symbol:'단단한 쇠',description:'경금은 단단한 쇠로 비유하는 양금이에요. 가려내고 형태를 세운다는 말은 글자의 상징을 풀이하는 표현이에요.'},
  '辛': {name:'신금',symbol:'다듬어진 금속과 보석',description:'신금은 다듬어진 금속과 보석으로 비유하는 음금이에요. 세부와 기준이라는 설명은 글자의 공통적인 상징에 해당해요.'},
  '壬': {name:'임수',symbol:'강과 바다',description:'임수는 강과 바다로 비유하는 양수예요. 흐름과 연결이라는 표현은 이 글자를 이해하기 위한 전통적 비유예요.'},
  '癸': {name:'계수',symbol:'이슬과 비',description:'계수는 이슬과 비로 비유하는 음수예요. 스며들고 살핀다는 말은 이 글자의 공통 설명이에요.'},
};

export const GROUP_REFERENCE = {
  peer:{label:'비겁',meaning:'자기 기준·동료·공동의 몫',definition:'비겁은 일간과 같은 오행의 관계예요. 비견과 겁재를 묶으며, 자기 기준과 대등한 관계를 살피는 전통적 분류예요.'},
  expression:{label:'식상',meaning:'표현·제작·전달',definition:'식상은 일간이 생하는 오행의 관계예요. 식신과 상관을 묶으며, 밖으로 표현하고 만들어 내는 주제로 풀이해요.'},
  wealth:{label:'재성',meaning:'자원·관리·현실의 운영',definition:'재성은 일간이 극하는 오행의 관계예요. 편재와 정재를 묶어 자원과 현실 운영의 주제로 읽어요. 실제 재산이나 수익의 크기를 계산한 값은 아니에요.'},
  authority:{label:'관성',meaning:'역할·기준·책임',definition:'관성은 일간을 극하는 오행의 관계예요. 편관과 정관을 묶어 기준과 역할의 주제로 읽어요. 직급이나 승진 여부를 뜻하는 값은 아니에요.'},
  resource:{label:'인성',meaning:'학습·지원·받아들이기',definition:'인성은 일간을 생하는 오행의 관계예요. 편인과 정인을 묶어 배움과 지원의 주제로 읽어요. 실제 학업 능력이나 합격 여부를 측정한 값은 아니에요.'},
};

export const GOD_REFERENCE = {
  companion:{name:'비견',meaning:'독립적인 기준과 대등한 관계',definition:'비견은 일간과 오행·음양이 같은 천간의 관계예요. 자기 기준, 동료, 독립이라는 주제로 설명해요.'},
  competitor:{name:'겁재',meaning:'공동의 몫과 경쟁·협력의 경계',definition:'겁재는 일간과 오행은 같고 음양이 다른 관계예요. 공동의 몫, 경쟁, 협력의 경계라는 주제로 설명해요. 이름만으로 금전 손실을 예고하지 않아요.'},
  creator:{name:'식신',meaning:'꾸준한 생산과 표현',definition:'식신은 일간이 생하는 오행 중 음양이 같은 관계예요. 꾸준히 만들고 표현하는 주제로 설명해요.'},
  critic:{name:'상관',meaning:'새로운 발상과 방식의 개선',definition:'상관은 일간이 생하는 오행 중 음양이 다른 관계예요. 발상과 전달, 기존 방식의 개선이라는 주제로 설명해요.'},
  opportunist:{name:'편재',meaning:'자원의 연결과 다양한 쓰임',definition:'편재는 일간이 극하는 오행 중 음양이 같은 관계예요. 자원의 교류와 다양한 쓰임으로 풀이하며, 뜻밖의 수입을 계산한 결과는 아니에요.'},
  manager:{name:'정재',meaning:'자원의 반복적인 관리와 축적',definition:'정재는 일간이 극하는 오행 중 음양이 다른 관계예요. 반복적인 관리와 축적의 주제로 설명해요.'},
  challenger:{name:'편관',meaning:'과제·긴장·집중된 책임',definition:'편관은 일간을 극하는 오행 중 음양이 같은 관계이며 칠살이라고도 불러요. 과제와 긴장, 책임의 주제로 풀이해요. 사고나 질병을 뜻한다고 단정하지 않아요.'},
  officer:{name:'정관',meaning:'분명한 약속과 사회적 역할',definition:'정관은 일간을 극하는 오행 중 음양이 다른 관계예요. 약속과 기준, 사회적 역할의 주제로 설명해요.'},
  explorer:{name:'편인',meaning:'탐구와 다른 관점의 수용',definition:'편인은 일간을 생하는 오행 중 음양이 같은 관계예요. 탐구와 몰입, 다른 관점을 받아들이는 주제로 설명해요.'},
  scholar:{name:'정인',meaning:'기초 학습과 도움의 수용',definition:'정인은 일간을 생하는 오행 중 음양이 다른 관계예요. 기초를 배우고 도움을 받아들이는 주제로 설명해요.'},
};

export const ELEMENT_RELATIONS = [
  {key:'same',label:'같은 오행',meaning:'자기 기준과 동료의 관계',definition:'기준 글자와 대상 글자가 같은 오행이에요.'},
  {key:'output',label:'일간이 생함',meaning:'표현하고 만들어 내는 관계',definition:'일간의 오행이 대상 오행을 생하는 관계예요.'},
  {key:'wealth',label:'일간이 극함',meaning:'자원을 다루고 운영하는 관계',definition:'일간의 오행이 대상 오행을 극하는 관계예요.'},
  {key:'authority',label:'일간을 극함',meaning:'기준과 요구를 받아들이는 관계',definition:'대상 오행이 일간의 오행을 극하는 관계예요.'},
  {key:'resource',label:'일간을 생함',meaning:'배우고 바탕을 받는 관계',definition:'대상 오행이 일간의 오행을 생하는 관계예요.'},
];

export const RELATION_REFERENCE = {
  'stem-combination':{label:'천간합',meaning:'서로 맞추고 조율하는 상징',definition:'갑기·을경·병신·정임·무계 중 해당 천간의 짝을 찾은 결과예요. 합화가 실제로 성립하는지까지 판정한 것은 아니에요.'},
  'branch-combination':{label:'지지육합',meaning:'연결하고 맞물리는 상징',definition:'자축·인해·묘술·진유·사신·오미 중 해당 지지의 짝을 찾은 결과예요. 특정한 만남이나 좋은 결과를 보장하지 않아요.'},
  'branch-clash':{label:'지지충',meaning:'서로 다른 방향을 조정하는 상징',definition:'자오·축미·인신·묘유·진술·사해 중 해당 지지의 짝을 찾은 결과예요. 충이 있다는 사실만으로 갈등이나 사건의 발생을 정하지 않아요.'},
};

// Only rules whose two observed groups exist run. This finite rule list is
// disclosed; it is not a catalogue of individually authored fortune entries.
export const GROUP_PAIR_RULES = [
  {id:'peer-expression',left:'peer',right:'expression',title:'자기 기준과 표현',reading:'자기 기준을 밖으로 표현하는 주제와 다른 사람에게 전달하는 주제를 함께 읽어요. 주도권을 갖는 과정과 전달 방식이 서로 연결되는 구성으로 설명하는 규칙이에요.'},
  {id:'peer-wealth',left:'peer',right:'wealth',title:'자기 몫과 자원의 운영',reading:'자기 결정과 공동의 몫, 자원을 운영하는 주제를 함께 읽어요. 관계 안에서 누가 정하고 누가 관리하는지 구분해 보는 구성으로 설명해요.'},
  {id:'peer-authority',left:'peer',right:'authority',title:'나의 기준과 역할의 기준',reading:'자기 기준과 외부의 역할·약속을 함께 읽어요. 독립적으로 정할 부분과 합의된 기준을 따를 부분을 구별하는 구성으로 설명해요.'},
  {id:'peer-resource',left:'peer',right:'resource',title:'독립과 도움의 수용',reading:'스스로 정하는 주제와 도움을 받고 배우는 주제가 함께 있어요. 받아들인 내용을 자신의 기준으로 정리하는 과정으로 설명해요.'},
  {id:'expression-wealth',left:'expression',right:'wealth',title:'표현과 현실의 운영',reading:'만들고 표현하는 주제와 그 결과에 필요한 자원을 관리하는 주제를 함께 읽어요. 이 표기만으로 식상생재의 성립이나 수익의 발생까지 판정하지는 않아요.'},
  {id:'expression-authority',left:'expression',right:'authority',title:'제안과 약속의 조율',reading:'새 방식으로 표현하는 주제와 정해진 역할·기준을 함께 읽어요. 제안할 자유와 지켜야 할 약속 사이의 조율이라는 관점으로 설명해요.'},
  {id:'expression-resource',left:'expression',right:'resource',title:'배움과 표현의 왕복',reading:'받아들이고 배우는 주제와 밖으로 표현하는 주제가 함께 보여요. 자료를 이해한 뒤 설명하거나 만들어 보는 과정으로 연결해 읽는 규칙이에요.'},
  {id:'wealth-authority',left:'wealth',right:'authority',title:'자원과 책임의 연결',reading:'현실의 자원 운영과 맡은 역할을 함께 읽어요. 필요한 비용·시간과 책임의 범위를 같은 장면에서 살피는 구성으로 설명해요.'},
  {id:'wealth-resource',left:'wealth',right:'resource',title:'실용과 배움의 연결',reading:'자원의 쓰임과 배움을 받아들이는 주제가 함께 있어요. 준비에 필요한 자원과 실제 활용할 장면을 연결해 보는 구성으로 설명해요.'},
  {id:'authority-resource',left:'authority',right:'resource',title:'기준과 학습의 연결',reading:'기준과 역할을 살피는 주제에 배우고 지원받는 주제가 함께 있어요. 필요한 기준을 익히고 역할을 수행하는 과정으로 설명하는 규칙이에요.'},
];

export const PRACTICE_SUGGESTIONS = {
  peer:'함께하는 일이 있다면 내가 정할 일과 함께 의논할 일을 나누어 적어 보세요.',
  expression:'전하고 싶은 생각 하나를 짧게 써 보거나 작은 결과물로 만들어 보세요.',
  wealth:'자주 나가는 돈과 함께 쓰는 돈을 적어 보세요. 얼마를 언제, 누가 낼지도 함께 확인해 보세요.',
  authority:'맡은 일을 언제까지 끝낼지, 어떤 약속을 지켜야 하는지 확인해 보세요.',
  resource:'새로 배운 것을 내 말로 설명해 보고, 어디에 쓸 수 있을지 떠올려 보세요.',
};
