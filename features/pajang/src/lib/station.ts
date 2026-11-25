import type { RadarBand } from "./radar";
export const interests = [
  {key:"vinyl", name:"음악", bg:"#e9e5f7"}, {key:"coffee", name:"카페", bg:"#f9e1cb"},
  {key:"walk", name:"산책", bg:"#dfead9"}, {key:"camera", name:"사진", bg:"#dce8f2"},
  {key:"book", name:"독서", bg:"#ece1ee"}, {key:"tennis", name:"운동", bg:"#e6ebcf"},
] as const;
export const themes = [
  {q:["둘이서 보내는 느긋한 오후,","무엇을 하고 싶나요?"], answers:[
    "작은 음반 가게에서 서로를 닮은 노래를 한 곡씩 골라주고 싶어요. 집에 가는 길까지 생각날 것 같아서요.",
    "창가 자리가 있는 카페에 가요. 커피가 식는 줄도 모르고 이야기한 오후라면 완벽할 것 같아요.",
    "목적지는 정하지 말고 한강을 따라 걸어요. 해가 기울 때쯤 편의점 아이스크림 하나씩 들고요.",
    "필름 카메라 하나를 번갈아 들어요. 같은 동네를 서로 얼마나 다르게 보는지 궁금해요.",
    "동네 책방에서 서로에게 어울리는 첫 문장을 찾아줄래요. 마음에 들면 그 책은 제가 선물할게요.",
    "동네 코트에서 가볍게 공을 주고받고 싶어요. 점수 대신 제일 재밌었던 실수를 기억할래요."]},
  {q:["처음 만나는 사람에게","소개하고 싶은 장소는?"], answers:[
    "망원동 지하의 작은 음악 감상실이요. 제가 좋아하는 베이스 소리를 거기서 처음 들었어요.",
    "바리스타가 직접 잔을 고르는 작은 카페요. 상대에게 어떤 잔이 올지 기다리는 게 재밌어요.",
    "비가 그친 뒤의 서울숲이요. 나무 냄새가 짙어져서 이어폰을 빼고 걷게 돼요.",
    "을지로 오래된 골목이요. 오후 네 시에 벽돌집에 내려앉는 빛을 같이 담고 싶어요.",
    "추천 이유를 손글씨로 써둔 독립서점이요. 책보다 그 쪽지를 더 오래 읽을 때도 있어요.",
    "한강이 내려다보이는 작은 배드민턴장이요. 바람 때문에 공이 엉뚱하게 날아가도 재밌어요."]},
  {q:["요즘 당신을 웃게 하는","작은 순간은 뭔가요?"], answers:[
    "듣고 있던 노래가 카페 스피커에서도 흘러나온 순간이요. 모르는 사람과 취향이 맞은 기분이 들어요.",
    "우유 거품 위로 하트가 처음 그려졌어요. 사진 찍느라 정작 커피는 조금 식었지만요.",
    "산책길에 매일 보는 강아지가 먼저 꼬리를 흔들어줄 때요. 이제 저를 단골로 인정해준 것 같아요.",
    "현상한 필름에 친구가 몰래 찍어둔 제 뒷모습이 있었어요. 그날의 바람까지 생각나더라고요.",
    "빌린 책 사이에서 누군가 놓고 간 은행잎을 찾았어요. 저도 책갈피 하나를 만들었어요.",
    "테니스를 배우는 친구와 처음으로 열 번 넘게 공을 주고받았어요. 둘 다 점수도 잊고 박수쳤어요."]},
  {q:["주말에 하루가 더 생긴다면,","어떻게 보내고 싶나요?"], answers:[
    "낮 공연에 다녀오고 싶어요. 좋은 곡이 나오면 옆 사람과 눈을 마주치는 순간이 좋아요.",
    "아침 일찍 시장에 가서 원두와 빵을 사 올래요. 점심까지는 식탁을 떠나지 않을 거예요.",
    "낯선 역에서 내려 동네를 걸어보고 싶어요. 모르는 동네에서는 평범한 가게도 여행지 같아요.",
    "한동안 쓰지 않았던 카메라에 필름을 넣을래요. 구름이 예쁜 날을 그냥 보내긴 아깝거든요.",
    "찜해둔 소설을 읽으며 하루를 느긋하게 보내고 싶어요. 저녁엔 누군가와 마지막 장 이야기를 하고 싶어요.",
    "가까운 바다까지 자전거를 타보고 싶어요. 중간에 맛있는 게 보이면 언제든 멈추고요."]},
  {q:["서로에게 작은 선물을 한다면,","무엇을 건네고 싶나요?"], answers:[
    "같이 걸었던 길마다 한 곡씩 골라서 짧은 재생목록으로 만들고 싶어요.",
    "오전에 들른 빵집에서 고른 마들렌 두 개요. 하나는 오늘 먹고 하나는 내일 먹으면 좋겠어요.",
    "제가 제일 좋아하는 산책 코스를 그린 작은 지도를 줄래요. 벤치가 있는 곳에 별표도 해두고요.",
    "같이 웃었던 날의 사진을 한 장 인화할래요. 뒷면에는 찍은 날짜와 날씨만 짧게 남길 거예요.",
    "밑줄이 하나도 없는 시집이요. 다음에 만날 때 각자 가장 좋았던 한 줄을 고르고 싶어요.",
    "좋아하는 색의 라켓 손잡이 테이프요. 처음 함께 공을 쳤던 날이 떠오를 것 같아요."]},
  {q:["뜻밖에 여유가 생긴 저녁,","어디로 발길이 향하나요?"], answers:[
    "라이브 공연 포스터부터 찾아봐요. 처음 듣는 팀을 만나면 그날만의 노래가 생겨요.",
    "저녁에도 문 여는 동네 카페요. 따뜻한 차 한 잔을 시키고 친구에게 오랜만에 편지를 써요.",
    "집에 가는 길에 한 정거장 먼저 내려요. 평소에 지나치던 골목에 불이 켜져 있으면 들어가 봐요.",
    "다리 위에서 야경을 한 장 담고 싶어요. 늦은 버스 불빛이 사진에 길게 남는 게 좋아요.",
    "도서관에 책을 반납하고 새 소설 한 권을 고를래요. 계획도 그 정도면 충분해요.",
    "저녁 러닝 모임에 나가요. 한 바퀴 뛰고 나눠 먹는 귤이 유난히 달거든요."]},
  {q:["다음에 또 만나고 싶어지는","순간은 언제인가요?"], answers:[
    "제가 흥얼댄 멜로디를 기억했다가 노래 제목을 물어봐줄 때요. 같이 들을 곡이 벌써 생긴 거잖아요.",
    "마지막 한 모금을 천천히 마실 때요. 둘 다 자리에서 조금 더 머물고 싶은 것 같아서요.",
    "걸음 속도가 어느 순간 같아졌다는 걸 알아챘을 때요. 말이 없어도 편해요.",
    "사진을 찍는 동안 기다려주고, 자기는 무엇을 봤는지 이야기해줄 때요. 같은 길에서도 새로운 모습을 발견하게 돼요.",
    "서로 다른 결말을 좋아해도 왜 그랬는지 궁금해해줄 때요. 다음 이야기도 들려주고 싶어져요.",
    "실수해서 공을 놓쳐도 같이 웃을 때요. 괜히 다음 경기 날짜를 먼저 물어보게 돼요."]},
];
export type Slot = "am" | "pm";
export function themeFor(day: string, slot: Slot) {
  // The existing November 17 afternoon answer belongs to the first question.
  const days = Math.floor((Date.parse(day+"T00:00:00Z")-Date.UTC(2026,10,17))/86400000);
  const index = 2 * days + (slot === "am" ? -1 : 0);
  return themes[(index % themes.length + themes.length) % themes.length];
}
export type Person = {id:string; name:string; age?:number|null; region:string; interest:string; body?:string; at?:number; range?:RadarBand; bearing?:number; sameCell?:boolean};
export type NearbyAnswer = {day:string;slot:Slot;question:string;body:string;at:number;likeCount?:number;liked?:boolean};
export type NearbyPerson = Person & {answers?:NearbyAnswer[]};
export type Signal = {src:string;dst:string;day:string;note:string;at:number};
export type Message = {id:string;src:string;dst:string;body:string;at:number};
export type Station = {genderSharePending?:boolean;day:string;slot:Slot;question?:{id:number;q:string[];answers:string[]};nextAt:string;me:Person|null;people:Person[];nearbyPeople?:NearbyPerson[];signals:Signal[];messages:Message[];authenticated:boolean; remaining:number; freeRemaining?:number; paidRemaining?:number; purchasingEnabled?:boolean; radarOn?:boolean; radarDirectionOn?:boolean; locationEnabled?:boolean; locationVersion?:number; locationNotice?:string};
export const badges = (key:string) => interests.find(x=>x.key===key)||{key:"",name:"",bg:"#eae5ee"};
export function introDetails(person:Pick<Person,"region"|"interest">) {
  return [person.region,badges(person.interest).name].filter(Boolean).join(" · ");
}
type Relationship = {outgoing?:Signal; incoming?:Signal; match:boolean};
const signalIndexes=new WeakMap<Station,Map<string,Relationship>>();
const unrelated:Relationship={match:false};
export function signalsWith(s:Station,id:string):Relationship {
  let peers=signalIndexes.get(s);
  if(!peers){
    peers=new Map();
    const own=s.me?.id;
    for(const signal of s.signals){
      const sent=signal.src===own;
      if(!sent && signal.dst!==own)continue;
      const other=sent?signal.dst:signal.src;
      const relation=peers.get(other)??{match:false};
      if(sent)relation.outgoing??=signal;else relation.incoming??=signal;
      relation.match=!!relation.outgoing && !!relation.incoming;
      peers.set(other,relation);
    }
    signalIndexes.set(s,peers);
  }
  return peers.get(id)??unrelated;
}
