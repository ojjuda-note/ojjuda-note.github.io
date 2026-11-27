import {round,tile,gap} from './controls.mjs?v=20261127-firsthands1';
import {puzzles} from './puzzle.mjs?v=20261127-firsthands1';
import {actionGames} from './action.mjs?v=20261127-firsthands1';
import {billiardGames} from './billiards.mjs?v=20261127-firsthands1';

const deck=[['파랑',5,'blue'],['파랑',3,'blue'],['노랑',3,'gold']];
const onecard=round('세 장을 이어 내고 원카드 외치기',{hand:[0,1,2],top:['빨강',5],called:false},(u,s)=>{
  u.cue(s.hand.length===2&&!s.called?'두 장이 남았어요. 원카드를 외친 뒤 같은 색이나 숫자를 이어 내세요.':'바닥 카드와 색이나 숫자가 같은 카드를 손에서 내세요.');
  u.display('바닥 · '+s.top[0]+' '+s.top[1],'card-face');u.grid(3,deck.map(([color,n,kind],i)=>s.hand.includes(i)?tile(color+'\n'+n,color+' '+n,kind):gap()),i=>{
    const [color,n]=deck[i];
    if(color!==s.top[0]&&n!==s.top[1])return u.say('색과 숫자가 모두 달라요. 바닥 카드와 한 가지가 같은 패를 찾으세요.');
    if(s.hand.length===2&&!s.called)return u.say('한 장이 남기 전에 원카드를 먼저 외쳐 보세요.');
    const hand=s.hand.filter(v=>v!==i),top=[color,n];
    if(!hand.length)return u.finish('세 장을 모두 냈어요. 마지막 한 장 전에 원카드도 외쳤어요.',{hand,top});
    u.change({hand,top},'카드를 냈어요. 다음 내 차례의 바닥이에요.');
  },'hand');
  if(s.hand.length===2&&!s.called)u.buttons([['원카드!',()=>u.change({called:true},'원카드를 외쳤어요. 이제 두 번째 패를 내세요.')]]);
});
const hwatu=['00-764cec06fb15','02-9d99ccd01090','04-504aeb5fd942','08-54cb2203af89'];
function flower(index,label,selected=false){return {...tile('',label,'flower-card',selected),image:'/assets/game-media/hwatu-'+hwatu[index]+'.webp'};}
const matgo=round('같은 달 화투패 가져오기',{picked:false,captured:false},(u,s)=>{
  u.cue(s.captured?'이어서 점수가 난 장면이에요. 지금 판을 끝내려면 스톱을 누르세요.':'아래 손패의 1월 송학을 먼저 잡고, 위에서 같은 달의 소나무 패를 고르세요.');
  u.display('바닥패','legend');
  u.grid(3,[s.captured?gap():flower(1,'1월 소나무 바닥패'),flower(2,'2월 매화 바닥패'),flower(3,'3월 벚꽃 바닥패')],i=>{
    if(!s.picked)return u.say('내 손패에서 낼 패를 먼저 잡으세요.');
    if(i!==0)return u.say('꽃과 나무 모양을 보세요. 송학과 같은 달은 소나무예요.');
    u.change({captured:true,picked:false},'같은 달 두 장을 가져왔어요.');
  },'hand');
  if(!s.captured){u.display('내 손패','legend');u.grid(1,[flower(0,'내 1월 송학',s.picked)],()=>u.change({picked:true}),'single-card');}
  else u.buttons([['고',()=>u.say('고는 판을 이어 가는 선택이에요. 이번 연습은 지금 점수로 끝내 봐요.')],['스톱',()=>u.finish('같은 달 패를 가져오고 스톱으로 판을 끝냈어요.')]]);
});
const yut=round('개를 던져 같은 편 말에 업기',{thrown:false,selected:false,pos:0},(u,s)=>{
  u.cue(!s.thrown?'윷가락을 던져 나온 수를 확인하세요.':s.selected?'개는 두 칸이에요. 두 칸 앞 우리 편 말이 있는 자리를 누르세요.':'출발에 있는 내 말을 골라요.');
  u.display(s.thrown?'● ● ○ ○  ·  개':'윷가락 네 개','sticks');
  u.grid(4,[tile(s.pos===0?'●':'○','출발 말','own',s.selected),tile('·','한 칸'),tile(s.pos===2?'●●':'●','두 칸 우리 편 말','green'),tile('·','세 칸')],i=>{
    if(!s.thrown)return u.say('먼저 윷을 던지세요.');
    if(!s.selected&&i===0)return u.change({selected:true});
    if(s.selected&&i===2)return u.finish('두 칸 가서 우리 편 말에 업혔어요. 다음부터 두 말이 함께 움직여요.',{pos:2,selected:false});
    u.say(s.selected?'개는 두 칸이에요.':'출발에 있는 내 말부터 잡으세요.');
  },'trailboard');
  if(!s.thrown)u.buttons([['윷 던지기',()=>u.change({thrown:true},'이번 연습 결과는 개예요.')]]);
});
const tour=round('첫 도시를 사고 통행료 받기',{phase:0,money:2000},(u,s)=>{
  u.cue(['내 차례예요. 주사위를 굴려 첫 도시로 가세요.','주인 없는 연습 도시에 도착했어요. 매입 가격은 100만이에요.','내 도시를 샀어요. 다음 차례를 진행해 보세요.','상대 말이 내 도시에 도착했어요.'][s.phase]);
  u.grid(4,['출발','휴식','여행',s.phase>1?'내 도시':'연습 도시'].map((v,i)=>({...tile((s.phase===0&&i===0||s.phase>0&&i===3?'●\n':'')+v,v,i===3&&s.phase>1?'green':'slot'),inert:true})),()=>{},'trailboard');
  u.display('보유금 '+s.money.toLocaleString('ko-KR')+'만','bank');
  if(s.phase===0)u.buttons([['주사위 굴리기',()=>u.change({phase:1},'이번 주사위의 합은 3이에요.')]]);
  if(s.phase===1)u.buttons([['도시 매입 · 100만',()=>u.change({phase:2,money:1900})]]);
  if(s.phase===2)u.buttons([['다음 차례',()=>u.finish('상대가 도착해 연습 통행료 20만을 받았어요.',{phase:3,money:1920})]]);
});
const tank=round('연료를 보며 내 차량 옮기기',{pos:1,fuel:3},(u,s)=>{
  u.cue('내 차례에 이동 버튼으로 오른쪽 표시 칸까지 가 보세요. 연습판에서는 한 칸마다 연료 한 칸을 써요.');
  u.grid(5,Array.from({length:5},(_,i)=>({...tile(i===s.pos?'▣':i===3?'◇':'·',i===s.pos?'내 차량':i===3?'도착 칸':'지형',i===3?'gold':'ground'),inert:true})),()=>{},'terrain');
  u.meter('연습 연료',s.fuel,3);
  function drive(dir){const pos=s.pos+dir;if(pos<0||pos>4)return u.say('이쪽은 보드 끝이에요.');
    if(!s.fuel)return u.say('연료를 다 썼어요. 처음부터를 눌러 더 짧은 길로 가세요.');
    const fuel=s.fuel-1;if(pos===3)return u.finish('남은 연료를 보고 내 차량을 표시 칸까지 옮겼어요.',{pos,fuel});u.change({pos,fuel});}
  u.buttons([['← 이동',()=>drive(-1)],['이동 →',()=>drive(1)]]);
});
const bang=round('내 카드로 한 번 방어하기',{phase:0,hp:3},(u,s)=>{
  u.cue(s.phase===0?'상대가 뱅! 카드를 냈어요. 내 손에서 빗나감! 카드를 꺼내세요.':'방어에 성공했어요. 카드 더미에서 남은 내 카드를 확인하세요.');
  u.meter('내 체력',s.hp,3);
  const cards=[['빗나감!','01_mancato'],['맥주','01_birra']];
  u.grid(2,cards.map(([name,asset],i)=>s.phase&&i===0?gap():{...tile('',name,'bang-card'),image:'/games/bang/assets/'+asset+'.png'}),i=>{
    if(!s.phase&&i===0)return u.change({phase:1},'빗나감!을 한 장 썼어요. 체력은 그대로 세 칸이에요.');
    if(!s.phase)return u.say('맥주는 회복 카드예요. 이번 공격은 빗나감!으로 막으세요.');
    u.finish('방어에 쓴 카드는 빠지고 맥주는 손에 남았어요. 게임 안에서 역할별 연습도 이어 할 수 있어요.');
  },'hand');
});
export const rounds={...puzzles,...actionGames,...billiardGames,onecard,matgo,yut,tour,tank,bang};
