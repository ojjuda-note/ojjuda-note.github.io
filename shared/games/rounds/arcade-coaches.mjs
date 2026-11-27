import {lesson,step,adjust} from './instruction.mjs?v=20261127-coach1';

const sacheonseong=lesson(['같은 그림 찾기','길 살피기','판 비우기'],'같은 패를 이어 판을 비우세요. 길은 두 번까지 꺾을 수 있어요.',s=>{
  const left=s.pieces.filter(Boolean).length,chapter=(6-left)/2;
  const i=s.selected??s.pieces.findIndex(Boolean),face=s.pieces[i],partner=s.pieces.findIndex((v,j)=>v===face&&j!==i);
  if(s.selected===null)return step(chapter,i,face+' 한 장을 골라요.','그림이 같은 두 장을 짝지어요. 어느 쪽부터 골라도 돼요.');
  return step(chapter,partner,'같은 '+face+'를 한 번 더 눌러요.','두 패가 사라질 때 남는 선이 실제로 지나간 길이에요.');
},{pieces:['국화','','국화','대나무','','매화','대나무','','매화']});
const mines=lesson(['숫자 읽기','깃발 꽂기','안전한 칸 열기'],'지뢰를 피해 닫힌 안전 칸을 모두 여세요.',s=>{
  if(!s.flags.includes(3)){
    if(!s.flagMode)return step(0,'⚑ 깃발 모드','왼쪽 위 1 옆에 닫힌 칸은 하나예요. 먼저 깃발 모드를 켜요.','1은 주변 여덟 칸에 지뢰가 하나 있다는 뜻이에요.');
    return step(1,3,'그 1 바로 아래의 닫힌 칸에 깃발을 꽂아요.','지뢰라고 판단한 칸은 열지 않고 표시해 둬요.');
  }
  const i=[5,8].find(n=>!s.open.includes(n));
  if(s.flags.includes(i))return step(2,s.flagMode?i:'⚑ 깃발 모드','오른쪽 안전 칸에 꽂은 깃발을 먼저 거둬요.','깃발 모드에서 같은 칸을 다시 누르면 표시를 지워요.');
  return step(2,s.flagMode?'⚑ 깃발 모드 켜짐':i,s.flagMode?'깃발 모드를 꺼서 칸 열기로 돌아가요.':'오른쪽의 닫힌 안전 칸을 열어요.','이미 지뢰 위치를 찾았어요. 오른쪽 0에 붙은 칸에는 지뢰가 없어요.');
});
const solitaire=lesson(['미션칸 시작','작업줄 잇기'],'미션칸에는 A를 올리고 작업줄에는 다른 색의 작은 카드를 이으세요.',s=>{
  if(!s.ace)return s.selected===null?step(0,2,'하트 A를 잡아요.','빈 미션칸은 A로 시작해요.'):
    step(0,0,'잡은 A를 왼쪽 위 미션칸에 놓아요.','위칸에는 같은 무늬를 A부터 차례로 쌓아요.');
  return s.selected===null?step(1,3,'이번에는 빨강 6을 잡아요.','작업줄에서는 색을 번갈아 가며 숫자를 하나씩 낮춰요.'):
    step(1,1,'검은 7 아래에 빨강 6을 놓아요.','같은 색 7이나 검은 8에는 이 카드를 놓을 수 없어요.');
});
function pieceGame(chess){
  return lesson(chess?['폰 전진','대각선 잡기']:['졸 전진','옆으로 잡기'],chess?'백 폰을 전진시킨 다음 검은 폰을 잡으세요.':'초의 졸로 전진한 뒤 상대 병을 잡으세요.',s=>{
    const first=s.pos===9,dst=first?5:(s.enemy??(chess?2:6));
    if(s.selected===null)return step(first?0:1,s.pos,chess?'흰 폰을 먼저 잡아요.':'초의 졸을 먼저 잡아요.','내 말을 누른 뒤 목적지를 누르거나 바로 끌어 놓을 수 있어요.');
    return step(first?0:1,dst,first?'바로 위 빈칸으로 한 칸 옮겨요.':chess?'대각선에 있는 검은 폰을 잡아요.':'같은 줄 옆에 있는 상대 병을 잡아요.',chess?'폰은 곧장 전진하고, 상대 말은 대각선 앞으로 잡아요.':'졸은 앞으로도 옆으로도 한 칸씩 가고 잡을 수 있어요.');
  },{enemy:chess?0:4});
}
const screw=lesson(['색 맞추기','모형 돌리기','상자 채우기'],'모형 양쪽에서 파란 나사 세 개를 찾아 상자를 닫으세요.',s=>{
  const blue=[0,2,4],rest=blue.filter(n=>!s.removed.includes(n)),visible=rest.find(n=>(n>=3)===s.back);
  if(visible===undefined)return step(1,s.back?'↶ 앞면으로':'↷ 뒷면으로','보이는 쪽은 끝났어요. 모형을 반대로 돌려요.','앞면에서 보이지 않는 나사도 있어요.');
  return step(rest.length===1?2:0,visible%3,'파란 십자 머리를 눌러 상자로 보내요.','상자와 같은 색 세 개를 모으면 한 상자가 완성돼요.');
},{back:true});
const screw_flat=lesson(['고정 나사 잡기','빈 구멍으로 옮기기','철판 떼기'],'나사 두 개를 철판 밖으로 옮겨 철판을 떨어뜨리세요.',s=>{
  const fixed=s.screws.filter(n=>n<3),slot=[3,4,5].find(n=>!s.screws.includes(n));
  if(s.selected===null)return step(fixed.length===2?0:2,fixed[0],'철판을 붙잡고 있는 십자 나사를 눌러요.','이미 아래로 뺀 나사는 옮길 필요가 없어요.');
  if(s.selected>=3)return step(fixed.length===2?1:2,slot,'잡은 나사를 다른 빈 바닥 구멍에 놓아요.','철판 위에 남은 나사를 빼야 판이 떨어져요.');
  return step(fixed.length===2?1:2,slot,'아래쪽 빈 구멍에 나사를 놓아요.','철판 위 모든 고정점이 풀려야 철판이 떨어져요.');
},{screws:[1,2]});
function returnPath(s){
  const home=[0,4,8],last=s.path.at(-1),queue=[[last]],seen=new Set(s.path);
  while(queue.length){
    const route=queue.shift(),i=route.at(-1);
    for(const n of [i+1,i-4,i+4,i-1]){
      if(n<0||n>=12||n===11||Math.abs(i%4-n%4)>1||seen.has(n))continue;
      if(home.includes(n)){if(s.path.length+route.length>=4)return route[1]??n;continue;}
      seen.add(n);queue.push([...route,n]);
    }
  }
  return null;
}
function territory(photo){
  return lesson(['경계 나가기','선 잇기','영역 닫기'],photo?'가려진 사진 위에 길을 만들고 테두리로 돌아가세요.':'밖으로 나가 선을 만들고 내 땅으로 돌아오세요.',s=>{
    const n=s.path.length===1?5:returnPath(s),end=[0,4,8].includes(n);
    if(n===null)return step(1,null,'길이 막혔어요. 처음부터 눌러 다른 길을 그려 보세요.','같은 선을 다시 밟지 않고 빈칸을 한 칸씩 지나야 해요.');
    return step(s.path.length===1?0:end?2:1,n,s.path.length===1?'시작점 바로 오른쪽 빈칸으로 나가요.':end?'이제 테두리로 돌아가 선을 닫아요.':'현재 점 옆 빈칸에 선을 이어요.',photo?'기존 테두리와 다시 연결된 부분의 사진이 드러나요.':'선을 내 땅에 연결해야 둘러싼 영역이 내 것이 돼요.');
  });
}
const runner=lesson(['첫 점프','공중에서 한 번 더'],'첫 틈을 뛰어넘고 높은 발판의 진주까지 가세요.',s=>
  step(s.leg?1:0,'점프',!s.leg?'점프를 한 번 눌러 첫 틈을 건너요.':s.air?'지금 공중이에요. 착지하기 전에 한 번 더 눌러요.':'다시 뛰고 공중에서 한 번 더 눌러요.','두 번째 점프는 첫 점프로 떠 있는 동안에만 이어져요.',{delay:s.air?350:1100}));
const chacha_rush=lesson(['빈 차선 찾기','장애물 넘기','가속하기'],'차를 피하고 장애물을 넘은 다음 빈 도로에서 가속하세요.',s=>{
  if(!s.leg||s.leg===1&&s.lane!==2)return step(0,'오른쪽 →','빈 오른쪽 차선으로 옮겨요.','앞차와 같은 차선에 남으면 길이 막혀요.');
  return s.leg===1?step(1,'점프','장애물 앞에서 점프를 눌러요.','점프 뒤 게이지가 100에서 60으로 줄어요.'):
    step(2,'부스터','앞길이 비었어요. 부스터를 눌러요.','부스터는 게이지 30을 써요. 장애물을 넘고도 쓸 양이 남았어요.');
},{lane:0});
const mole=lesson(['두더지 찾기','금색 구별하기'],'폭탄을 건드리지 않고 보통과 금색 두더지를 한 번씩 잡으세요.',s=>
  step(s.hit?1:0,s.hit?(s.goldAt??2):(s.firstAt??4),s.hit?'금빛 테두리의 두더지를 눌러요.':'구멍에서 얼굴을 내민 두더지를 눌러요.',s.hit?'금색은 한 마리에 3점이에요.':'빈 구멍은 득점이 없고 검은 폭탄은 피해야 해요.'),{firstAt:5,goldAt:1});
const stacker=lesson(['겹치는 순간','남은 폭 읽기','한 층 더 쌓기'],'블록 세 층을 쌓으세요. 다음 블록이 얼마나 좁아지는지 보세요.',s=>
  step(s.layers.length-1,'블록 놓기',s.layers.length===1?'윗블록이 아랫블록 위에 오면 놓아요.':'남은 블록의 양 끝을 보고 겹칠 때 놓아요.','아랫층 밖으로 나온 부분은 잘리고 겹친 폭만 남아요.',{align:true}),{layers:[{x:36,w:32}]});
const breakout=lesson(['받을 곳 찾기','공 되받기','반대쪽 받기'],'받침대를 움직여 양쪽에서 오는 공을 되받으세요.',s=>{
  const x=s.hit?26:76;
  if(s.flight)return step(s.hit?2:1,null,'공이 내려와 받침대에 닿는 순간을 봐요.','공과 받침대의 가로 위치가 겹쳐야 공을 되받아요.');
  if(Math.abs(s.paddle-x)>10)return step(s.hit?2:0,adjust('받침대 위치',x),s.hit?'받침대를 왼쪽 공 아래로 옮겨요.':'받침대를 오른쪽 공 바로 아래로 옮겨요.','손가락으로 받침대를 끌거나 아래 막대를 움직일 수 있어요.');
  return step(s.hit?2:1,'공 보내기','공을 보내고 벽돌과 받침대를 지켜봐요.','두 번째 공은 반대편으로 내려와요.');
},{paddle:18});
const saetbyeol=lesson(['불씨 잡기','작은 천체 지나기','성장에 쓰기'],'천체 두 곳에서 자원을 모아 불씨를 강화하세요.',s=>{
  if(s.taken.length===2)return step(2,'성장 · 첫 강화','모은 자원으로 첫 강화를 눌러요.','탐험에서 얻은 자원이 성장에 쓰여요.');
  return s.selected?step(1,[2,5].find(i=>!s.taken.includes(i)),'빛나는 작은 천체로 불씨를 옮겨요.','이미 지나간 천체 대신 빛이 남은 곳을 찾으세요.'):step(s.taken.length?1:0,s.pos,'내 불씨를 잡아요.','불씨에서 천체까지 한 번에 끌어도 돼요.');
},{pos:7});
const spot=lesson(['같은 위치 비교','다른 곳 짚기'],'두 그림을 비교해 바뀐 부분 두 곳을 찾으세요.',s=>{
  const i=s.found.includes(0)?1:0;
  return step(s.found.length?1:0,i?'B 왼쪽 뒤 자전거':'B 쭈다의 후드',i?'왼쪽 뒤에 있던 자전거가 B에서도 보이는지 확인해요.':'두 그림에서 쭈다의 옷 무늬를 보고 달라진 자리를 눌러요.','A와 B 중 어느 쪽을 눌러도 돼요. 작으면 크게 비교를 눌러요.');
});
function billiards(mode){
  const carom=mode==='carom3',pool=mode==='pool8';
  const angle=carom?43:pool?-43:-15,power=carom?80:pool?50:65;
  return lesson(['방향 맞추기','샷 보내기','결과 읽기'],pool?'줄무늬 공을 포켓에 넣고 8번 공은 남겨 두세요.':carom?'두 번째 대상구에 닿기 전에 쿠션 세 번을 거치세요.':'한 번의 샷으로 빨간 공 두 개를 맞히세요.',s=>{
    if(s.shot)return step(2,null,'공이 멈출 때까지 경로를 따라가요.',carom?'두 번째 대상구를 맞히기 전의 쿠션만 세요.':pool?'줄무늬 공을 넣어도 흰 공이 함께 빠지면 성공하지 못해요.':'흰 공이 두 빨간 공을 모두 건드렸는지 봐요.');
    const wanted=s.mirror?-angle:angle;
    if(s.angle!==wanted)return step(0,adjust('조준 각도',wanted),'막대로 '+wanted+'°에 맞춰요. 마지막 1도는 −와 +로 조절해요.',carom?'먼저 쿠션으로 향하게 하면 벽을 돌아 두 번째 공에 닿을 수 있어요.':pool?'흰 공과 줄무늬 공, 포켓을 잇는 방향을 읽어요.':'빨간 공 한쪽을 스치면 흰 공이 방향을 바꿔 다음 공으로 가요.');
    if(s.power!==power)return step(1,adjust('힘',power),'힘 막대를 '+power+'에 맞춰요.','같은 방향으로 쳐도 힘에 따라 공이 굴러가는 거리가 달라져요.');
    return step(1,'샷','점선의 방향을 확인하고 샷을 눌러요.','이 각도는 이 연습 배치에 맞는 한 가지 예예요. 공 위치가 달라지면 각도도 바뀌어요.');
  },{mirror:true,angle:0});
}
const onecard=lesson(['숫자 잇기','원카드 외치기','손패 비우기'],'바닥과 색 또는 숫자가 같은 카드를 내서 손을 비우세요.',s=>{
  if(s.hand.length===3)return step(0,0,'빨강 5 위에 낼 수 있는 파랑 5를 눌러요.','색이 달라도 숫자가 같으면 낼 수 있어요.');
  if(s.hand.length===2&&!s.called)return step(1,'원카드!','손에 두 장이 남았어요. 원카드를 먼저 외쳐요.','지금 외쳐 두면 한 장만 남길 때 선언을 잊지 않아요.');
  return step(2,s.hand[0],s.hand.length===2?'이번에는 바닥과 같은 색의 파랑 3을 내요.':'마지막 노랑 3을 내요.','같은 색으로 이은 다음 같은 숫자로 이어 갈 수 있어요.');
});
const matgo=lesson(['손패 내기','달 맞추기','판 마치기'],'같은 달의 화투패를 가져오고 점수가 나면 스톱을 선택하세요.',s=>!s.picked&&!s.captured?
  step(0,'내 1월 송학','아래 손패에서 소나무와 학이 그려진 패를 눌러요.','화투는 달마다 대표 그림이 있어요.'):
  !s.captured?step(1,'1월 소나무 바닥패','위 바닥에서 소나무가 그려진 1월 패를 골라요.','같은 달 두 장이 만나면 가져올 수 있어요.'):
  step(2,'스톱','점수가 난 다음 장면이에요. 스톱으로 판을 끝내요.','고를 누르면 지금 점수로 끝내지 않고 계속해요.'));
const yut=lesson(['윷 던지기','말 고르기','업어 가기'],'던진 수만큼 말을 옮겨 우리 편 말과 만나세요.',s=>!s.thrown?
  step(0,'윷 던지기','윷가락을 던지고 나온 수를 봐요.','이번 예시는 두 칸 가는 개예요.'):!s.selected?
  step(1,0,'출발에 있는 내 말을 눌러요.','던진 결과를 어느 말에 쓸지 먼저 정해요.'):
  step(2,2,'두 칸 앞 우리 편 말 위에 놓아요.','같은 편 말이 한 칸에서 만나면 다음부터 함께 움직여요.'));
const tour=lesson(['주사위 굴리기','도시 사기','통행료 받기'],'주인 없는 도시를 내 것으로 만들고 다음 차례의 통행료를 확인하세요.',s=>[
  step(0,'주사위 굴리기','주사위를 굴려 도착할 칸을 확인해요.','도착한 칸의 주인에 따라 할 일이 달라요.'),
  step(1,'도시 매입 · 100만','빈 도시를 100만에 사요.','보유금은 줄지만 이 칸의 주인이 돼요.'),
  step(2,'다음 차례','상대 차례를 진행하고 보유금 변화를 봐요.','상대가 내 도시에 도착하면 통행료가 들어와요.')
][s.phase]);
const tank=lesson(['이동 칸 찾기','연료 확인하기'],'연습 차량을 표시 칸까지 옮기고 남은 연료를 확인하세요.',s=>
  step(s.pos<2?0:1,s.pos<3?'이동 →':'← 이동',s.pos<2?'오른쪽 이동을 한 번 눌러요.':'남은 연료를 보고 표시 칸으로 한 칸 더 가요.','연습판에서는 한 칸 이동할 때 연료 한 칸을 써요.'),{pos:0,fuel:3});
const bang=lesson(['대응 카드 내기','남은 손패 확인'],'상대 카드에 대응해 체력 세 칸을 지키세요.',s=>s.phase?
  step(1,'맥주','손에 남은 맥주 카드를 확인해요.','빗나감! 한 장만 방어에 썼고 맥주는 손에 남았어요.'):
  step(0,'빗나감!','상대가 낸 카드에 빗나감!을 내요.','게임에서 빗나감!은 이번 뱅! 카드의 효과를 막아요.'));
export const coaches={sacheonseong,mines,solitaire,chess:pieceGame(true),janggi:pieceGame(false),screw,screw_flat,ttang:territory(false),photo_ttang:territory(true),runner,chacha_rush,mole,stacker,breakout,saetbyeol,spot,billiards:billiards('billiards'),carom3:billiards('carom3'),pool8:billiards('pool8'),onecard,matgo,yut,tour,tank,bang};
