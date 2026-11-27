import {round,tile,element} from './controls.mjs?v=20261127-firsthands1';

function stage(u,kind,label){
  const field=element('div','round-stage '+kind);field.setAttribute('aria-label',label);u.board.append(field);return field;
}
function place(field,cls,x,y,face){
  const node=element('span','round-object '+cls,face);node.style.left=x+'%';node.style.top=y+'%';field.append(node);return node;
}
const runner=round('해마와 발판 두 개 건너기',{leg:0,air:false},(u,s)=>{
  u.cue(s.leg===0?'점프를 눌러 첫 틈을 건너세요.':'높은 발판 앞이에요. 한 번 뛰고 공중에서 다시 점프하세요.');
  const f=stage(u,'sea','물속 발판과 해마');
  for(const [x,y] of [[15,78],[49,78],[83,41]])place(f,'ledge',x,y,'');
  place(f,'pearl',80,25,'●');place(f,s.air?'jumper airborne':'jumper',s.done?82:s.air?65:s.leg?48:15,s.done?28:s.air?45:64,'');
  function jump(){
    if(!s.leg)return u.change({leg:1},'첫 틈을 건넜어요. 이제 높은 쪽으로 가요.');
    if(!s.air)return u.change({air:true,land:u.now()+1150},'공중이에요. 착지하기 전에 한 번 더!');
    u.finish('두 번째 점프로 높은 발판에 올라 진주를 모았어요.',{air:false});
  }
  if(s.air)u.later(s.land-u.now(),()=>u.change({air:false},'낮은 발판에 착지했어요. 두 번 이어서 뛰어 보세요.'));
  u.buttons([['점프',jump]]);
});
const chacha_rush=round('차선 변경과 점프 잇기',{lane:1,leg:0,gauge:100},(u,s)=>{
  u.cue(s.leg===0?'왼쪽과 가운데에 차가 있어요. 빈 오른쪽 차선으로 피하세요.':s.leg===1?'오른쪽 차선에 장애물이 나타났어요. 점프해서 넘으세요.':'앞이 비었어요. 남은 게이지에서 부스터를 써 보세요.');
  const f=stage(u,'road','세 차선 도로'); for(const x of [34,66])place(f,'divider',x,50,'');
  if(s.leg===0){place(f,'traffic',17,29,'▣');place(f,'traffic',50,29,'▣');}
  if(s.leg===1)place(f,'hurdle',83,33,'▥');
  place(f,'car',[17,50,83][s.lane],76,'▰');u.meter('부스트',s.gauge,100);
  function lane(d){const l=Math.max(0,Math.min(2,s.lane+d));u.change({lane:l,leg:s.leg===0&&l===2?1:s.leg},l===2?'오른쪽 차선이에요.':'앞차가 있어요. 오른쪽으로 빠져나가세요.');}
  u.buttons([['← 왼쪽',()=>lane(-1)],['오른쪽 →',()=>lane(1)],['점프',()=>s.leg===1&&s.lane===2?u.change({leg:2,gauge:60},'장애물을 넘었어요. 게이지 40을 썼어요.'):u.say('먼저 오른쪽 차선에서 장애물을 만나요.')],['부스터',()=>s.leg===2?u.finish('차선 변경과 점프 뒤에 부스터까지 썼어요. 게이지가 30 남았어요.',{gauge:30}):u.say('앞쪽 장애물을 넘고 나서 가속하세요.')]]);
});
const mole=round('구멍을 살피고 두 번 잡기',{hit:0},(u,s)=>{
  u.cue(s.hit===0?'올라온 두더지를 눌러요. 검은 폭탄은 피하세요.':'이번에는 금색 두더지예요. 다른 구멍을 살펴보세요.');
  const target=s.hit===0?4:2;const bomb=s.hit===0?0:3;
  u.grid(3,Array.from({length:6},(_,i)=>tile(!s.done&&i===target?'🐹':i===bomb?'●':'◒',!s.done&&i===target?(s.hit?'금색 두더지':'두더지'):i===bomb?'폭탄':'빈 구멍',i===target&&s.hit===1?'hole gold':'hole')),i=>{
    if(i!==target)return u.say(i===bomb?'검은 폭탄이에요. 올라온 두더지만 누르세요.':'빈 구멍이에요. 두더지가 올라온 위치를 보세요.');
    if(!s.hit)return u.change({hit:1},'한 마리 잡았어요. 1점!');
    u.finish('보통 두더지 1점과 금색 두더지 3점, 합쳐서 4점이에요.',{hit:2});
  },'holes');
});
const stacker=round('겹친 부분으로 세 층 쌓기',{layers:[{x:29,w:42}],start:0},(u,s)=>{
  const f=stage(u,'tower','위에서 움직이는 블록과 쌓인 층');
  s.layers.forEach(({x,w},i)=>{const b=place(f,'block settled',x,85-i*17,'');b.style.width=w+'%';});
  const prev=s.layers.at(-1);u.cue('움직이는 블록과 아랫층이 겹칠 때 놓으세요. 겹친 너비만 다음 층에 남아요.');
  if(s.done)return;
  const moving=place(f,'block travelling',0,85-s.layers.length*17,'');moving.style.width=prev.w+'%';moving.style.setProperty('--distance',(100-prev.w)+'%');
  const reduced=u.reduced();if(reduced){moving.style.animation='none';moving.style.left=prev.x+'%';}
  u.buttons([['블록 놓기',()=>{
    const field=f.getBoundingClientRect(),rect=moving.getBoundingClientRect(),x=100*(rect.left-field.left)/field.width;
    const lo=Math.max(prev.x,x),w=Math.min(prev.x+prev.w,x+prev.w)-lo;
    if(w<=0.3)return u.say('양 끝이 떨어져 있어요. 다음에 겹치는 순간 다시 놓으세요.');
    const layers=[...s.layers,{x:lo,w}];
    if(layers.length===4)return u.finish('세 층을 쌓았어요. 더 많이 포갤수록 다음 층이 넓게 남아요.',{layers});
    u.change({layers},(layers.length-1)+'층 성공. 다음 블록 너비가 실제 겹친 만큼 줄었어요.');
  }]]);
});
const breakout=round('받침대로 공 두 번 되받기',{paddle:50,hit:0,flight:false},(u,s)=>{
  const goal=s.hit?26:76,travel=1800;
  u.cue('받침대를 끌어 공이 내려오는 쪽으로 옮기세요. 공을 보내면 받침대와 만나는지 확인할 수 있어요.');
  const f=stage(u,'bricks','벽돌과 받침대');for(const [i,x] of [26,76].entries())if(!s.done&&(s.hit===0||i===0))place(f,'brick',x,12,'▦');
  const bat=place(f,'paddle',s.paddle,85,''),ball=place(f,'ball',s.done?50:goal,s.done?15:25,'');
  if(s.flight){ball.classList.add('falling');ball.style.animationDuration=travel+'ms';}
  function move(value){s.paddle=Math.max(10,Math.min(90,value));bat.style.left=s.paddle+'%';input.value=s.paddle;input.previousSibling.textContent='받침대 위치 '+s.paddle;}
  const input=u.range('받침대 위치',s.paddle,10,90,move);
  const aim=e=>{const r=f.getBoundingClientRect();move(Math.round((e.clientX-r.left)/r.width*100));};
  if(!s.done){f.onpointerdown=e=>{f.setPointerCapture(e.pointerId);aim(e);};f.onpointermove=e=>{if(f.hasPointerCapture(e.pointerId))aim(e);};}
  if(s.flight)u.later(s.until-u.now(),()=>{
    if(Math.abs(s.paddle-goal)>12)return u.change({flight:false},'공이 받침대 옆으로 빠졌어요. 공과 같은 가로 위치에 받침대를 두세요.');
    if(s.hit)return u.finish('왼쪽과 오른쪽으로 공을 받아 벽돌 두 개를 깼어요.',{hit:2,flight:false});
    u.change({hit:1,flight:false},'첫 벽돌을 깼어요. 이번에는 왼쪽으로 내려와요.');
  });
  u.buttons([['공 보내기',()=>u.change({flight:true,until:u.now()+travel}),s.flight]]);
});
const saetbyeol=round('불씨로 천체를 지나 성장하기',{pos:6,taken:[],selected:false},(u,s)=>{
  const stars=[2,5];u.cue(s.taken.length===2?'빛과 금속이 모였어요. 성장에서 첫 강화를 눌러요.':'불씨에서 작은 천체까지 끌어 보세요. 두 곳을 차례로 누를 수도 있어요.');
  function travel(a,b){
    if(a!==s.pos||!stars.includes(b)||s.taken.includes(b))return u.say('빛이 남은 작은 천체로 불씨를 옮겨 보세요.');
    u.change({pos:b,taken:[...s.taken,b],selected:false},'천체에서 자원을 모았어요.');
  }
  u.grid(3,Array.from({length:9},(_,i)=>tile(i===s.pos?'✹':stars.includes(i)&&!s.taken.includes(i)?'●':'·',i===s.pos?'내 불씨':stars.includes(i)&&!s.taken.includes(i)?'작은 천체':'우주',i===s.pos?'ember':'space',i===s.pos&&s.selected)),i=>i===s.pos?u.change({selected:true}):s.selected?travel(s.pos,i):u.say('불씨부터 잡으세요.'),'sky',travel);
  u.meter('모은 천체',s.taken.length,2);if(s.taken.length===2)u.buttons([['성장 · 첫 강화',()=>u.finish('탐험에서 모은 자원으로 불씨를 한 번 강화했어요.')]]);
});
const spot=round('쭈다 그림에서 달라진 두 곳 찾기',{found:[],large:false},(u,s)=>{
  u.cue('쭈다의 옷과 왼쪽 뒤 자전거를 비교해 보세요. 두 그림 중 어느 쪽을 눌러도 돼요.');
  const edits=[
    {name:'쭈다의 후드',x:39,y:43.3,clip:'inset(28.9% 52.3% 42.3% 30.3%)',detail:'후드에 남색 물방울무늬가 생겼어요.'},
    {name:'왼쪽 뒤 자전거',x:20,y:44.4,clip:'inset(30.9% 72% 41% 12.1%)',detail:'왼쪽 뒤 자전거가 사라졌어요.'}
  ];
  const pair=element('div','round-photos'+(s.large?' enlarged':''));u.board.append(pair);
  for(const side of ['A','B']){
    const frame=element('div','round-photo');const img=element('img','');img.src='/games/spot-difference/assets/01-original.webp';img.alt=side+' 쭈다 그림';frame.append(img);pair.append(frame);
    if(side==='B')edits.forEach(e=>{const layer=element('img','photo-edit');layer.alt='';layer.src='/games/spot-difference/assets/01-clear.webp';layer.style.clipPath=e.clip;frame.append(layer);});
    frame.append(element('b','photo-name',side));
    frame.onclick=()=>{if(!s.done)u.say('같은 위치를 번갈아 보세요. 왼쪽 뒤에도 다른 곳이 있어요.');};
    for(const [i,e] of edits.entries()){
      const b=element('button','photo-mark',s.found.includes(i)?'✓':'');b.setAttribute('aria-label',side+' '+e.name);
      b.style.left=e.x+'%';b.style.top=e.y+'%';b.disabled=s.found.includes(i);frame.append(b);
      b.onclick=event=>{event.stopPropagation();const found=[...s.found,i];if(found.length===2)u.finish(e.detail+' 두 곳을 모두 찾았어요.',{found});else u.change({found},e.detail);};
    }
  }
  u.buttons([[s.large?'나란히 보기':'크게 비교',()=>u.change({large:!s.large})]]);
});
export const actionGames={runner,chacha_rush,mole,stacker,breakout,saetbyeol,spot};
