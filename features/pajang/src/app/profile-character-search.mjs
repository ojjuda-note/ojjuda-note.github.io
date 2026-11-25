import wardrobe from "./profile-character-wardrobe.json" with {type:"json"};

const vocabulary = [
  "흰색 흰 흰옷 흰색깔 하양 하얀 하얀색 화이트 white",
  "검정 검정색 검은 검은색 까만 까만색 블랙 black", "회색 그레이 잿빛 gray grey",
  "파랑 파란 파란색 파랑색 청색 블루 blue", "남색 네이비 감색 곤색 navy",
  "하늘색 소라색 스카이블루 연파랑", "청록 청록색 틸 터쿼이즈",
  "분홍 분홍색 핑크 핑크색 pink", "빨강 빨간 빨간색 빨강색 레드 red",
  "자주 자주색 버건디 와인색 와인", "주황 주황색 오렌지 orange",
  "노랑 노란 노란색 노랑색 옐로우 옐로 yellow", "초록 초록색 녹색 그린 green",
  "연두 연두색 라임", "카키 카키색 올리브", "보라 보라색 퍼플 purple",
  "연보라 연보라색 라벤더 라일락", "갈색 브라운 밤색 고동색 brown",
  "베이지 베이지색 샌드 beige", "아이보리 크림 크림색 상아색 ivory",
  "은색 실버 silver", "금색 골드 gold",
  "원피스 원피스룩 onepiece", "치마 스커트 skirt", "미니스커트 미니치마 짧은치마 짧은스커트",
  "롱스커트 롱치마 긴치마 긴스커트", "바지 팬츠 pants", "반바지 숏팬츠 쇼츠",
  "청바지 진 데님팬츠 jeans", "바지정장 팬츠수트", "정장 슈트 수트 양복 suit",
  "재킷 자켓 쟈켓 jacket", "블라우스 블라우즈 blouse", "드레스 dress",
  "유니폼 제복 uniform", "티셔츠 반팔티 티 tshirt", "카디건 가디건", "후드 후디 후드티",
  "조끼 베스트", "민소매 나시", "플리츠 주름", "셔츠 남방", "운동복 스포츠웨어 트레이닝복",
  "차분 차분한 차분하게 차분함 잔잔한 조용한 고요한 침착한",
  "귀여움 귀여운 귀엽게 귀엽다 귀염 귀염뽀짝 큐트 깜찍 깜찍한 아기자기한",
  "시크 시크한 시크하게 쿨한 chic",
  "우아 우아한 우아하게 엘레강스 엘레강트 고상한", "단아 단아한 정갈한",
  "청순 청순한 청초한 수수한", "로맨틱 로맨틱한 러블리 사랑스러운 사랑스러움 낭만적인",
  "발랄 발랄한 상큼 상큼한 통통튀는 경쾌한", "화사 화사한 산뜻한 밝은",
  "화려 화려한 눈부신 반짝이는 글래머러스한", "고급 고급진 고급스러운 럭셔리 럭셔리한",
  "단정 단정한 반듯한 말끔한", "깔끔 깔끔한 심플 심플한 미니멀 미니멀한",
  "편안 편안한 편한 이지 이지룩 느긋한", "포근 포근한 따뜻한 아늑한 부드러운",
  "친근 친근한 다정한", "소박 소박한 소탈한", "내추럴 내츄럴 자연스러운 자연스런",
  "스포티 스포티한 스포츠 스포티브", "활동적 활동적인 활기찬 역동적인",
  "강렬 강렬한 카리스마 카리스마있는 강인한", "든든 든든한 씩씩한",
  "신비 신비한 신비로운 미스터리한", "몽환 몽환적 몽환적인 꿈같은",
  "빈티지 빈티지한 vintage", "레트로 복고 복고풍", "클래식 클래식한 고전적인",
  "캐주얼 캐쥬얼 캐주얼한 데일리 데일리룩 일상적인", "댄디 댄디한 멋스러운",
  "모던 모던한 세련 세련된 현대적인", "전문적 전문적인 프로페셔널한",
  "힙 힙한 트렌디 트렌디한", "스트리트 스트릿 스트릿룩", "전통 전통적인 전통풍",
  "청량 청량한 시원한 싱그러운", "감성 감성적인 감성적 서정적인",
  "장난기 장난기있는 장난스러운 개구쟁이 유쾌한", "수줍음 수줍은 수줍어하는",
  "자유분방 자유분방한 자유로운", "도회적 도회적인 도시적 도시적인",
  "중후 중후한 묵직한", "도도 도도한", "판타지 판타지풍 환상적인", "오피스룩 출근복 직장인룩", "미래적 미래적인"
];
const canonical = new Map(vocabulary.flatMap(line=>{
  const words=line.split(" ");
  return words.map(word=>[word,words[0]]);
}));
const broader = {
  하늘색:"파랑",남색:"파랑",연보라:"보라",연두:"초록",형광노랑:"노랑",
  롱스커트:"치마",미니스커트:"치마",펜슬스커트:"치마",플리츠스커트:"치마 플리츠",
  롱원피스:"원피스",미니원피스:"원피스",롱드레스:"드레스 원피스",드레스:"원피스",
  청바지:"바지 데님",배기진:"청바지 바지",조거팬츠:"바지",와이드팬츠:"바지",반바지:"바지",카고바지:"바지",
  블레이저:"재킷",바시티재킷:"재킷",데님재킷:"재킷 데님",가죽재킷:"재킷",니트조끼:"니트 조끼",
  턱시도:"정장",연미복:"정장",단아:"단정",몽환:"신비",레트로:"빈티지",운동복:"스포티"
};
const phrases = [
  [/(미니|롱|짧은|긴)\s+(스커트|치마|드레스|원피스)/gu,"$1$2"],
  [/정장\s*바지|바지\s*정장/gu,"정장 바지"],[/카리스마\s+있는/gu,"카리스마있는"],
  [/통통\s+튀는/gu,"통통튀는"],[/장난기\s+있는/gu,"장난기있는"]
];
const normalize=s=>s.normalize("NFKC").toLowerCase().trim();
export function characterSearchTerms(input){
  let query=normalize(input);
  for(const [pattern,replacement] of phrases)query=query.replace(pattern,replacement);
  return (query.match(/[\p{L}\p{N}]+/gu)||[]).filter(word=>!["분위기","느낌","스타일","캐릭터","색깔","색상"].includes(word))
    .map(word=>canonical.get(word)||word);
}
export function characterSearchIndex({id,name,group}){
  const labels=wardrobe[id].split(" ");
  if(group==="직업 유니폼")labels.push("유니폼");
  if(group)labels.push(group.replace(/\s/g,""));
  const tags=new Set();
  for(const label of labels){
    const term=canonical.get(label)||label;
    tags.add(term);
    for(const parent of (broader[term]||"").split(" "))if(parent)tags.add(parent);
  }
  return {name:normalize(name).replace(/\s/g,""),tags};
}
export function matchesCharacter(index,terms){
  return terms.every(term=>index.tags.has(term)||index.name.includes(term));
}
