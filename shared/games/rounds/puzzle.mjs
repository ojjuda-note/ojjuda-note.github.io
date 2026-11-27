import {round,tile,gap,element} from './controls.mjs?v=20261127-firsthands1';

function linkPath(values,a,b,cols){
  const rows=values.length/cols, dirs=[[0,-1],[1,0],[0,1],[-1,0]], seen=new Set();
  const queue=[[a%cols,Math.floor(a/cols),-1,0,[[a%cols,Math.floor(a/cols)]]]];
  for(let n=0;n<queue.length;n++){
    const [x,y,last,bends,path]=queue[n];
    for(let d=0;d<4;d++){
      const nx=x+dirs[d][0],ny=y+dirs[d][1],turns=bends+Number(last!==-1&&last!==d);
      if(nx< -1||nx>cols||ny< -1||ny>rows||turns>2)continue;
      const inside=nx>=0&&nx<cols&&ny>=0&&ny<rows,i=ny*cols+nx;
      if(inside&&i===b)return [...path,[nx,ny]];
      if(inside&&values[i])continue;
      const key=[nx,ny,d,turns].join(',');
      if(!seen.has(key)){seen.add(key);queue.push([nx,ny,d,turns,[...path,[nx,ny]]]);}
    }
  }
  return false;
}
const sacheonseong=round('꽃패 여섯 장 비우기',{pieces:['매화','대나무','매화','대나무','','','국화','','국화'],selected:null,route:null},(u,s)=>{
  const faces={'매화':'✿','국화':'❁','대나무':'竹'},kinds={'매화':'rose','국화':'gold','대나무':'green'};
  u.cue('같은 그림을 두 장 누르세요. 길은 두 번까지 꺾을 수 있고 판 바깥도 지나가요.');
  const field=u.grid(3,s.pieces.map((p,i)=>p?tile(faces[p],p,kinds[p],i===s.selected):gap()),i=>{
    const a=s.selected,p=s.pieces;
    if(a===null||i===a)return u.change({selected:a===i?null:i});
    if(p[i]!==p[a])return u.change({selected:i},'다른 그림이에요. 방금 고른 패와 같은 그림을 찾으세요.');
    const route=linkPath(p,a,i,3);
    if(!route)return u.say('사이에 패가 있어서 길이 세 번 이상 꺾여요. 다른 짝부터 비워 보세요.');
    const pieces=p.map((v,j)=>j===a||j===i?'':v),left=pieces.filter(Boolean).length;
    if(!left)return u.finish('세 쌍을 모두 이었어요. 실제 판에서도 막힌 짝은 나중에 다시 보세요.',{pieces,selected:null,route});
    u.change({pieces,selected:null,route},p[i]+' 한 쌍을 치웠어요. 남은 패 '+left+'장.');
  },'mahjong');
  if(s.route && s.selected===null){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    const line=document.createElementNS(svg.namespaceURI,'polyline');
    svg.setAttribute('viewBox','0 0 3 3');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
    const coord=v=>Math.max(-.09,Math.min(3.09,v+.5));
    line.setAttribute('points',s.route.map(([x,y])=>coord(x)+','+coord(y)).join(' '));
    svg.append(line);field.append(svg);
  }
});
const mines=round('숫자 1 옆에 깃발 꽂기',{flagMode:false,flags:[],open:[0,1,2,4,6,7]},(u,s)=>{
  const mined=3,counts=[1,1,0,0,1,0,1,1,0];
  u.cue('왼쪽 위 1에 닿는 닫힌 칸은 하나예요. 깃발을 꽂고 나머지 두 칸을 열어 보세요.');
  function play(i,flag=s.flagMode){
    if(s.open.includes(i))return u.say('열린 숫자는 주변 여덟 칸에 있는 지뢰의 수예요.');
    if(flag){const flags=s.flags.includes(i)?s.flags.filter(v=>v!==i):[...s.flags,i];return u.change({flags,flagMode:false},'깃발을 표시했어요. 안전한 칸은 눌러 열어요.');}
    if(s.flags.includes(i))return u.say('깃발을 지우려면 깃발 모드에서 이 칸을 다시 누르세요.');
    if(i===mined)return u.say('이 칸에 지뢰가 있어요. 깃발 모드로 바꿔 같은 칸을 누르세요.');
    const open=[...s.open,i];
    if(open.length===8)return u.finish('안전한 여덟 칸이 모두 열렸어요. 지뢰를 열지 않고 클리어했어요.',{open});
    u.change({open},'안전한 칸이에요. 옆의 숫자도 살펴보세요.');
  }
  const g=u.grid(3,counts.map((n,i)=>s.open.includes(i)?tile(String(n),n+' 주변 지뢰','opened'):tile(s.flags.includes(i)?'⚑':'▧',(Math.floor(i/3)+1)+'행 '+(i%3+1)+'열 '+(s.flags.includes(i)?'깃발':'닫힌 칸'),s.flags.includes(i)?'gold':'')),i=>play(i),'minefield');
  for(const b of g.querySelectorAll('button')){let since=0;b.oncontextmenu=e=>e.preventDefault();b.onpointerdown=()=>since=performance.now();b.onpointercancel=()=>since=0;
    b.onpointerup=e=>{if(since&&performance.now()-since>=350){e.preventDefault();b.onclick=null;play(+b.dataset.cell,true);}since=0;};}
  u.buttons([[s.flagMode?'⚑ 깃발 모드 켜짐':'⚑ 깃발 모드',()=>u.change({flagMode:!s.flagMode})]]);
});
function moves(u,s,tiles,cols,transfer,style){
  const select=i=>s.selected===null?transfer(i,null):transfer(s.selected,i);
  u.grid(cols,tiles.map((v,i)=>({...v,selected:s.selected===i})),select,style,transfer);
}
const solitaire=round('하트 A를 올리고 작업줄 잇기',{ace:false,six:false,selected:null},(u,s)=>{
  u.cue(!s.ace?'하트 A를 눌러 미션칸에 옮기세요. 끌어서 놓아도 돼요.':'빨강 6을 검은 7 아래에 이어 놓으세요.');
  const cards=[tile(s.ace?'♥ A':'♧',s.ace?'미션칸 하트 A':'빈 미션칸','slot'),tile(s.six?'♠ 7\n♥ 6':'♠ 7','검은 7 작업줄'),s.ace?gap():tile('♥ A','하트 A','rose'),s.six?gap():tile('♥ 6','빨강 6','rose')];
  moves(u,s,cards,2,(a,b)=>{
    const source=s.ace?3:2,dest=s.ace?1:0;
    if(a!==source)return u.change({selected:null},s.ace?'빨강 6부터 잡으세요.':'A가 미션칸의 첫 카드예요.');
    if(b===null)return u.change({selected:a},s.ace?'숫자가 하나 큰 검은 7에 놓으세요.':'위쪽 빈 미션칸을 누르세요.');
    if(b!==dest)return u.change({selected:null},'놓을 자리가 달라요. 카드를 다시 잡아 보세요.');
    if(s.ace)return u.finish('미션칸은 같은 무늬로 오름차순, 작업줄은 다른 색으로 내림차순이에요.',{six:true,selected:null});
    u.change({ace:true,selected:null},'하트 A가 올라갔어요.');
  },'hand');
});
function boardMove(id){
  const chess=id==='chess',first=chess?'♙':'卒',opponent=chess?'♟':'兵';
  return round(chess?'폰으로 전진하고 잡기':'졸로 전진하고 옆 말 잡기',{pos:9,selected:null,taken:false},(u,s)=>{
    const dest=s.pos===9?5:chess?2:6,enemy=chess?2:6;
    const coords=i=>chess?'defg'[i%4]+(4-Math.floor(i/4)):(Math.floor(i/4)+1)+'행 '+(i%4+1)+'열';
    u.cue(s.pos===9?(chess?'e2 백 폰을 잡고 e3로 한 칸 전진하세요.':'아래쪽 초의 졸을 잡고 바로 위로 한 칸 움직이세요.'):(chess?'e3에서 대각선 f4의 검은 폰을 잡으세요.':'이번에는 오른쪽에 있는 상대 병을 잡으세요.'));
    const tiles=Array.from({length:12},(_,i)=>tile(s.pos===i?first:!s.taken&&i===enemy?opponent:'·',coords(i)+(s.pos===i?' 내 말':!s.taken&&i===enemy?' 상대 말':' 빈칸'),s.pos===i?'own':!s.taken&&i===enemy?'enemy':'free'));
    moves(u,s,tiles,4,(a,b)=>{
      if(a!==s.pos)return u.change({selected:null},'먼저 내 말을 고르세요.');
      if(b===null)return u.change({selected:a},'이제 놓을 칸을 누르세요.');
      if(b!==dest)return u.change({selected:null},chess?'폰은 앞으로 가고 대각선으로 잡아요.':'졸은 앞으로 또는 옆으로 한 칸씩 가요.');
      if(s.pos!==9)return u.finish(chess?'폰으로 전진한 뒤 대각선의 상대 말을 잡았어요.':'졸이 방향을 바꿔 상대 병을 잡았어요.',{pos:b,taken:true,selected:null});
      u.change({pos:b,selected:null},'한 칸 전진했어요. 이어지는 장면을 연습해요.');
    },chess?'chessboard':'janggi');
  });
}
const screw=round('모형을 돌려 파란 상자 채우기',{back:false,removed:[]},(u,s)=>{
  u.cue('파란 나사 세 개를 같은 상자에 모으세요. 모형을 돌리면 뒤쪽 나사가 보여요.');
  const ids=s.back?[3,4,5]:[0,1,2],blue=[0,2,4];
  u.meter('파란 상자',s.removed.filter(i=>blue.includes(i)).length,3);
  u.grid(3,ids.map(i=>s.removed.includes(i)?gap():tile('⊕',blue.includes(i)?'파란 십자 나사':'노란 십자 나사',blue.includes(i)?'blue screw':'gold screw')),n=>{
    const i=ids[n],removed=[...s.removed,i],count=removed.filter(i=>blue.includes(i)).length;
    if(count===3)return u.finish('같은 색 세 개가 모여 파란 상자가 닫혔어요.',{removed});
    u.change({removed},blue.includes(i)?'파란 나사를 상자에 담았어요.':'다른 색 나사는 대기 칸에 두었어요.');
  },'hardware');
  u.buttons([[s.back?'↶ 앞면으로':'↷ 뒷면으로',()=>u.change({back:!s.back})]]);
});
const screw_flat=round('고정 나사 두 개 풀기',{screws:[0,2],selected:null},(u,s)=>{
  u.cue('철판 위의 나사를 하나씩 잡아 아래쪽 빈 구멍으로 옮기세요.');
  const tiles=Array.from({length:6},(_,i)=>tile(s.screws.includes(i)?'⊕':'○',(i<3?'철판 ':'바닥 ')+(i%3+1)+(s.screws.includes(i)?' 나사':' 구멍'),i<3?'metal':'wood'));
  moves(u,s,tiles,3,(a,b)=>{
    if(!s.screws.includes(a))return u.change({selected:null},'십자 머리가 보이는 나사를 먼저 누르세요.');
    if(b===null)return u.change({selected:a});
    if(b<3||s.screws.includes(b))return u.change({selected:null},'철판 밖에 비어 있는 구멍을 골라 보세요.');
    const screws=s.screws.map(i=>i===a?b:i);
    if(screws.every(i=>i>=3))return u.finish('고정 나사가 모두 빠져 철판이 떨어졌어요.',{screws,selected:null});
    u.change({screws,selected:null},'한쪽이 풀렸어요. 남은 고정 나사도 옮기세요.');
  },'hardware'+(s.done?' released':''));
});
function enclosed(path,home){
  const edge=new Set([...path,...home]),outside=new Set(),queue=[];
  for(let i=0;i<12;i++)if((i<4||i>=8||i%4===0||i%4===3)&&!edge.has(i)){queue.push(i);outside.add(i);}
  for(let k=0;k<queue.length;k++){
    const i=queue[k];
    for(const j of [i-4,i+4,i-1,i+1]){
      if(j<0||j>=12||Math.abs(i%4-j%4)>1||edge.has(j)||outside.has(j))continue;
      queue.push(j);outside.add(j);
    }
  }
  return Array.from({length:12},(_,i)=>i).filter(i=>!outside.has(i));
}
function territory(photo){
  return round(photo?'테두리를 닫아 그림 열기':'선을 내 땅까지 잇기',{path:[4],land:[]},(u,s)=>{
    const home=[0,4,8],last=s.path.at(-1);
    u.cue('왼쪽 내 땅에서 오른쪽으로 나가세요. 한 칸씩 이어서 다른 내 땅으로 돌아오세요.');
    const tiles=Array.from({length:12},(_,i)=>tile(i===last?'●':s.path.includes(i)?'•':home.includes(i)?'▧':i===11?'◆':'·',(Math.floor(i/4)+1)+'행 '+(i%4+1)+'열 '+(home.includes(i)?'내 땅':i===11?'상대':'빈칸'),s.land.includes(i)?'claimed':home.includes(i)?'home':s.path.includes(i)?'trail':'free'));
    u.grid(4,tiles,i=>{
      if(Math.abs(i%4-last%4)+Math.abs(Math.floor(i/4)-Math.floor(last/4))!==1)return u.say('지금 표시된 점과 가로 또는 세로로 맞닿은 칸을 누르세요.');
      if(i===11||s.path.includes(i))return u.say('밖에 나와 있는 동안 선과 상대를 피해요.');
      if(home.includes(i)){
        if(s.path.length<3)return u.say('오른쪽으로 나가 적어도 한 칸을 둘러싸세요.');
        const path=[...s.path,i];
        return u.finish(photo?'선을 닫아서 사진의 한 부분이 열렸어요.':'출발했던 땅으로 선이 이어져 영역을 얻었어요.',{path,land:enclosed(path,home)});
      }
      u.change({path:[...s.path,i]});
    },photo?'territory photo'+(s.done?' reveal':''):'territory');
  });
}
export const puzzles={sacheonseong,mines,solitaire,screw,screw_flat,chess:boardMove('chess'),janggi:boardMove('janggi'),ttang:territory(false),photo_ttang:territory(true)};
