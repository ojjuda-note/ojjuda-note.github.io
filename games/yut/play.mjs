import {roundSummary} from './results.mjs?v=20261119-yut-back-carry1';
import {TEAMS,HOME,FINISH,YUT,DEFAULT_MODE,DEFAULT_PIECES,EVENT_NAMES,tileEffect,newGame,newMatch,firstSeatRemaining,firstSeatTiming,position,moves,nodeName,act,computerAction,lastThrowSeed,pendingRolls,singleResult} from './rules.mjs?v=21';
import {createBoard,PAWN_HOP_MS} from './board.mjs?v=29';
import {createToss,drawRack,drawFirstSeatStick} from './toss.mjs?v=15';
import {createTableSounds} from './sound.mjs?v=5';
import {openRoom,roomCode} from './room.mjs?v=20261120-yut-lobby1';
import {createYutLobby} from './lobby.mjs?v=20261120-yut-lobby1';
import {ANIMALS,animalFor,drawZodiac} from './zodiac.mjs?v=6';

const $=id=>document.getElementById(id), board=createBoard($('board'),chooseTile,choosePawn,dropPawn), toss=createToss($('toss-canvas'));
const dialog=$('sheet'), body=$('dialog-body'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
const sounds=createTableSounds();
const bonusRoll=$('bonus-roll'),bursts=bonusRoll.querySelector('.game-result-effects');
let bonusTimer;
for(const event of ['pointerup','keydown','click'])document.addEventListener(event,sounds.unlock,true);
document.addEventListener('visibilitychange',()=>{if(document.hidden){sounds.stop();clearBonus();}});
window.addEventListener('pagehide',sounds.stop);
const YUT_DIFFICULTY_KEY='ojjuda.yut.difficulty.v1';
function preferredYutDifficulty(){
  try{return localStorage.getItem(YUT_DIFFICULTY_KEY)==='easy'?'easy':DEFAULT_MODE;}catch{return DEFAULT_MODE;}
}
function rememberYutDifficulty(value){
  if(value!=='easy'&&value!=='island')return;
  try{localStorage.setItem(YUT_DIFFICULTY_KEY,value);}catch{}
}
let local=newGame(2,11,preferredYutDifficulty(),DEFAULT_PIECES,[1]), shown=null, net=null, room=null, pendingRoom=false, attempt=0, busy=false, motion=0, panel='',game=local;
let casting=false,selectedPawn=null,pawnPicked=false,selectedSteps=null,placement=null,resumeActionFocus=false;
const tray=$('reserve-pawns');
let trayKey='',trayDrag=null,suppressTrayClick=false;
const rack=$('rack-canvas'),rackContext=rack.getContext('2d');
let rackFaces=null,rackSeed=null,paintedFaces='',roomSetup=null,botTimer=null;
let localRound=0,lastResultKey='';
let hold=null,releasedShuffle=null;
let roomUI=null,directory=null,directoryPending=null,entryEpoch=0,entryKind='computer',startingRoom=false,roomIssue='';
let directoryGeneration=0,pageClose=null,returnToPublic=false;
const tossLayer=$('toss-layer');
const castButton=button('윷 던지기','primary cast-btn',event=>{
  // Assistive activation has no preceding press. Pointer releases are handled below.
  if(!hold&&canCast()&&(event.detail===0||!window.PointerEvent))dispatch({type:'roll'});
});
function canCast(){
  return $('setup').hidden&&!dialog.open&&!busy&&!pendingRoom&&game.phase==='roll'&&
    !game.computerTeams?.includes(game.team)&&(!net||!!(room&&net.game&&net.connected&&net.seat===game.team));
}
function beginHold(input){
  if(hold||!canCast())return false;
  hold=input;releasedShuffle=null;clearBonus();
  tossLayer.classList.add('shuffling');tossLayer.hidden=false;
  $('toss-label').textContent='떼면 던져요';
  toss.shuffle(reduced.matches);return true;
}
function endHold(throwNow=false){
  if(!hold)return;
  const input=hold;hold=null;
  const pose=toss.cancel();
  tossLayer.hidden=true;tossLayer.classList.remove('shuffling');
  if(input.pointerId!==undefined&&castButton.hasPointerCapture?.(input.pointerId))castButton.releasePointerCapture(input.pointerId);
  if(throwNow&&canCast()){
    releasedShuffle={state:game,pose};dispatch({type:'roll'});
  }
}
castButton.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.isPrimary===false||!beginHold({pointerId:e.pointerId}))return;
  try{castButton.setPointerCapture?.(e.pointerId);}catch{/* Window still receives the release. */}
});
window.addEventListener('pointerup',e=>{if(hold&&hold.pointerId===e.pointerId&&hold.key===undefined)endHold(true);});
function cancelCastPointer(e){if(hold&&hold.pointerId===e.pointerId&&hold.key===undefined)endHold();}
window.addEventListener('pointercancel',cancelCastPointer);
castButton.addEventListener('lostpointercapture',cancelCastPointer);
castButton.addEventListener('contextmenu',e=>{if(hold)e.preventDefault();});
castButton.addEventListener('keydown',e=>{
  if(e.key!==' '&&e.key!=='Enter')return;
  e.preventDefault();if(!e.repeat)beginHold({key:e.key});
});
castButton.addEventListener('keyup',e=>{
  if(hold?.key!==e.key)return;
  e.preventDefault();endHold(true);
});
window.addEventListener('keydown',e=>{if(hold&&e.key==='Escape'){e.preventDefault();endHold();}});
castButton.addEventListener('blur',()=>{if(hold?.key)endHold();});
for(const event of ['blur','pagehide'])window.addEventListener(event,()=>endHold());
document.addEventListener('visibilitychange',()=>{if(document.hidden)endHold();});

function showTable(){
  if($('setup').hidden)return;
  disposeRooms();
  $('setup').hidden=true;$('entry-controls').replaceChildren();
  document.body.dataset.mpEntry='false';$('tabletop').hidden=false;
  window.dispatchEvent(new window.Event('resize'));
}
function showEntry(kind='computer'){
  disposeRooms();
  closePanel();$('tabletop').hidden=true;$('setup').hidden=false;
  $('yut-entry').hidden=false;$('online-lobby').hidden=true;
  document.body.dataset.mpEntry='true';
  const controls=$('entry-controls');controls.replaceChildren();setupControls(controls,true,kind);
}
function paintRack(){
  if(!rackContext)return;
  const rect=rack.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
  const w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);
  if(!w||!h)return;
  const key=rackFaces?rackFaces.join('')+'-'+rackSeed:'ready';
  if(w===rack.width&&h===rack.height&&key===paintedFaces)return;
  if(w!==rack.width)rack.width=w;
  if(h!==rack.height)rack.height=h;
  drawRack(rackContext,w,h,rackFaces,rackSeed);
  paintedFaces=key;
}
if(typeof ResizeObserver==='function')new ResizeObserver(paintRack).observe(rack);
else window.addEventListener('resize',paintRack);
function element(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function button(text,cls,fn,disabled=false){const b=element('button',text,cls);b.type='button';b.disabled=disabled;b.onclick=fn;return b;}
function dot(t){const badge=element('span',TEAMS[t].mark,'team-dot');badge.setAttribute('aria-hidden','true');badge.style.setProperty('--team',TEAMS[t].color);return badge;}
function pieceName(s,team,index){
  return (index+1)+'번 말 · '+ANIMALS[animalFor(team,index,s.zodiacOffset,s.teamAnimals)];
}
function animalIcon(team,index,offset,teamAnimals,numbered=true){
  const canvas=element('canvas',undefined,'animal-icon');
  canvas.width=100;canvas.height=88;canvas.setAttribute('aria-hidden','true');
  const ctx=canvas.getContext('2d');
  const project=([x,y,z])=>[50+(x*.966+z*.259)*58,73+(-x*.259+z*.966)*30-y*50];
  if(ctx)drawZodiac(ctx,project,0,0,0,1,animalFor(team,index,offset,teamAnimals),TEAMS[team].color,numbered?index:undefined);
  return canvas;
}
const layer=(s)=>s.pawns.flatMap((team,t)=>team.flatMap((trail,i)=>{
  const node=position(trail);return node===HOME||node===FINISH?[]:[{team:t,index:i,node}];
}));
function turnTeam(s){
  if(casting&&s.passedBackdo)return (s.team+s.pawns.length-1)%s.pawns.length;
  return busy&&!casting&&s.lastMove?s.lastMove.team:s.team;
}
function draw(s,override,snap=false){
  const pieces=override??layer(s);
  const waiting=s.pawns.flatMap((team,t)=>team.flatMap((trail,i)=>
    position(trail)===HOME&&!pieces.some(p=>p.team===t&&p.index===i)?[{team:t,index:i}]:[]));
  const withAnimal=p=>({...p,animal:animalFor(p.team,p.index,s.zodiacOffset,s.teamAnimals)});
  const activeTeam=(s.phase==='won'&&!busy)||(net&&!net.game)?null:turnTeam(s);
  board.setState({pieces:pieces.map(withAnimal),activeTeam,waiting:waiting.map(withAnimal),mode:s.mode??'island',eventTiles:s.eventTiles,islandTiles:s.islandTiles,snap});
  const locations=s.pawns[s.team].map((trail,i)=>pieceName(s,s.team,i)+' · '+nodeName(position(trail)));
  $('board').setAttribute('aria-label',TEAMS[s.team].name+' 팀. '+locations.join(', ')+'.');
}
function standings(){
  openPanel('말 현황','scores');const s=game;
  const rows=s.pawns.map((team,t)=>{
    const row=element('div',undefined,'score-card'+(t===s.team?' active':''));
    const top=element('div',undefined,'score-top');
    top.append(dot(t),document.createTextNode(TEAMS[t].name+' 팀'+(s.computerTeams?.includes(t)?' · 컴퓨터':'')),element('small','골인 '+team.filter(p=>position(p)===FINISH).length+'/'+team.length));
    const pawns=element('div',undefined,'score-pieces');
    team.forEach((trail,i)=>{
      const info=element('span',undefined,'score-piece'),copy=element('span');
      copy.append(element('b',pieceName(s,t,i)),element('small',nodeName(position(trail))));
      info.append(animalIcon(t,i,s.zodiacOffset,s.teamAnimals),copy);pawns.append(info);
    });
    row.append(top,pawns);return row;
  });const scoreboard=element('div',undefined,'scoreboard');scoreboard.append(...rows);body.append(scoreboard);
}
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const targetTile=m=>m.to===FINISH||m.to===HOME?0:m.to;
const distanceLabel=steps=>steps===-1?'뒤로 1칸':steps+'칸';
const rollLabel=(steps,separator=' · ')=>steps===-1?distanceLabel(steps):YUT[steps]+separator+distanceLabel(steps);
function canMovePiece(){
  return !game.computerTeams?.includes(game.team)&&game.phase==='move'&&!busy&&!pendingRoom&&!dialog.open&&
    (!net||!!(room&&net.game&&net.connected&&net.seat===game.team));
}
function currentSteps(){return selectedSteps??singleResult(game);}
function allMoves(s){
  return [...new Set(pendingRolls(s))].flatMap(steps=>moves(s,steps).map(m=>({...m,steps})));
}
function choosePawn(index){
  if(!canMovePiece())return;
  const choices=allMoves(game).filter(m=>m.index===index);
  if(!choices.length)return;
  if(selectedSteps&&!choices.some(m=>m.steps===selectedSteps))selectedSteps=null;
  selectedPawn=index;pawnPicked=true;
  renderHUD();
}
function place(move,dragged=false){
  if(!canMovePiece())return;
  if(dragged)placement={state:game,move};
  dispatch({type:'move',index:move.index,shortcut:move.shortcut,steps:move.steps});
}
function chooseDestination(tile,index=null){
  if(!canMovePiece())return;
  const s=game,dragged=index!==null;
  let picks=allMoves(s).filter(m=>targetTile(m)===tile&&(!dragged||m.index===index));
  if(!picks.length)return;
  const preferredPawn=!dragged&&pawnPicked?picks.filter(m=>m.index===selectedPawn):picks;
  if(preferredPawn.length)picks=preferredPawn;
  const preferredRoll=selectedSteps?picks.filter(m=>m.steps===selectedSteps):picks;
  if(preferredRoll.length)picks=preferredRoll;
  // Unselected reserve pieces are equivalent. Keep independent routes and rolls distinct.
  const choices=picks.filter((m,i)=>position(s.pawns[s.team][m.index])!==HOME||
    !picks.slice(0,i).some(prev=>prev.steps===m.steps&&position(s.pawns[s.team][prev.index])===HOME));
  if(choices.length===1&&preferredPawn.length&&preferredRoll.length){place(choices[0],dragged);return;}
  openPanel(choices.length===1?'이 칸으로 이동':'어떻게 이동할까요?','destination');
  for(const m of choices){
    const from=position(s.pawns[s.team][m.index]);
    const who=from===HOME?'새 말':(m.index+1)+'번 말';
    const route=m.to===FINISH?'골인':m.to===HOME?'대기석':m.to===0?nodeName(0):choices.some(o=>o.index===m.index&&o.steps===m.steps&&o.shortcut!==m.shortcut)?(m.shortcut?'지름길':'바깥길'):'';
    const name=who+' · '+rollLabel(m.steps,' ')+(route?' · '+route:'');
    body.append(button(name,'secondary',()=>{
      closePanel();if(game===s)place(m,dragged);
    }));
  }
}
function dropPawn(index,tile){chooseDestination(tile,index);}
function chooseTile(tile){chooseDestination(tile);}
function destinationMenu(s,options){
  if(!canMovePiece()||game!==s)return;
  openPanel('이동할 칸 선택','destination');
  for(const tile of new Set(options.map(targetTile))){
    const here=options.filter(m=>targetTile(m)===tile);
    const labels=[...new Set(here.map(m=>nodeName(m.to)))].join(' / ');
    const rolls=[...new Set(here.map(m=>YUT[m.steps]))].join('·');
    body.append(button(labels+' · '+rolls,'secondary',()=>{closePanel();if(game===s)chooseTile(tile);}));
  }
}
function result(s){return s.sticks?rollLabel(s.steps):'';}
function bankCounts(s){
  const counts=new Map();
  for(const steps of pendingRolls(s))counts.set(steps,(counts.get(steps)??0)+1);
  return counts;
}
function clearBonus(){
  clearTimeout(bonusTimer);bonusRoll.hidden=true;bursts.replaceChildren();
}
function showBonus(s){
  if(s.steps<4||document.visibilityState==='hidden')return;
  if(!reduced.matches){
    for(let burst=0;burst<2;burst++){
      const group=element('span',undefined,'bonus-burst');
      for(let ray=0;ray<12;ray++){
        const spark=element('i',undefined,'game-result-spark');
        spark.style.setProperty('--angle',(ray*30+burst*15)+'deg');
        group.append(spark);
      }
      bursts.append(group);
    }
  }
  bonusRoll.hidden=false;sounds.applaud();
  bonusTimer=setTimeout(clearBonus,1500);
}
function moveNotice(s){
  if(s.passedBackdo)return s.note;
  const move=s.lastMove;
  if(!move||s.phase!=='roll')return '';
  const parts=[];
  const eventName=EVENT_NAMES[move.event];
  if(eventName&&(move.event!=='carry'||move.pickedUp!=null))parts.push(eventName);
  if(move.pickedUp!=null&&move.event!=='carry')parts.push(EVENT_NAMES.carry);
  const pawns=s.pawns[move.team],at=position(pawns[move.indices[0]]);
  if(at===FINISH)parts.push('골인');
  else if(at!==HOME&&move.pickedUp==null&&pawns.filter(p=>position(p)===at).length>move.indices.length)parts.push('같은 팀 말과 합류');
  if(move.captured)parts.push('잡기');
  if(s.team===move.team)parts.push('한 번 더');
  return parts.join(' · ');
}
function reveal(s){
  rackFaces=s.sticks??null;
  rackSeed=lastThrowSeed(s);
  const held=pendingRolls(s);
  $('outcome').textContent=held.length>1?'모은 결과 · '+[...bankCounts(s)].map(([n,count])=>YUT[n]+(count>1?' ×'+count:'')).join(' · '):result(s);
  rack.setAttribute('aria-label',rackFaces?'던진 윷 네 가락 · '+result(s):'던질 윷 네 가락');
  paintRack();
}
const firstSeatLayer=$('first-seat');
const firstSeatStick=$('first-seat-stick');
drawFirstSeatStick(firstSeatStick.querySelector('canvas'));
let firstSeatAnimation, pickingFirst=false, firstSeatRevealed=false;
function advanceOpening(type){
  if(net&&(!net.isHost||!net.connected||!room))return;
  resumeActionFocus=true;
  const action={type};
  if(net)room.opening(action);
  else{local=act(local,action);void showState(local,false);}
}

async function showFirstSeat(s,token,remaining){
  const circle=$('first-seat-circle');
  const heading=$('first-seat-heading');
  const order=$('first-seat-order');
  const count=s.pawns.length;
  const degrees=360/count;
  const seats=s.pawns.map((_,seat)=>{
    const radians=seat*degrees*Math.PI/180;
    const badge=element('span',undefined,'first-seat-number');
    badge.append(animalIcon(seat,0,s.zodiacOffset,s.teamAnimals,false),
      element('b',String(seat+1)));
    badge.style.left=50+40*Math.sin(radians)+'%';
    badge.style.top=50-40*Math.cos(radians)+'%';
    badge.style.setProperty('--seat-color',TEAMS[seat].color);
    return badge;
  });
  circle.replaceChildren(firstSeatStick,...seats);
  firstSeatLayer.classList.remove('resolved');
  const ready=s.phase==='opening'&&s.firstSeatAt==null;
  heading.textContent=ready?'윷을 돌려 선을 정해요':'선을 정하는 중…';
  order.replaceChildren();
  firstSeatLayer.style.setProperty('--winner-color',TEAMS[s.team].color);
  const angle=1080+s.team*degrees;
  const rotate=degrees=>`rotate(${degrees-90}deg)`;
  const [spinMs,resultMs]=firstSeatTiming(s);
  const spin=Math.max(0,remaining-resultMs);
  firstSeatStick.style.transform=rotate(ready?0:angle);
  firstSeatLayer.hidden=false;
  if(ready)return;
  if(spin){
    if(!reduced.matches&&firstSeatStick.animate){
      firstSeatAnimation=firstSeatStick.animate([
        {transform:rotate(0)},{transform:rotate(angle)}
      ],{duration:spinMs,easing:'cubic-bezier(.17,.25,.30,1)',fill:'forwards'});
      firstSeatAnimation.currentTime=spinMs-spin;
      sounds.spinFirstSeat(spinMs-spin);
    }else firstSeatStick.style.transform=rotate(0);
    await delay(spin);
  }
  if(token!==motion)return;
  firstSeatAnimation?.cancel();
  firstSeatStick.style.transform=rotate(angle);
  firstSeatLayer.classList.add('resolved');
  seats[s.team].classList.add('is-first');
  heading.textContent=(s.team+1)+'번 '+TEAMS[s.team].name+' 팀부터 시작!';
  for(let i=0;i<count;i++){
    const seat=(s.team+i)%count;
    if(i)order.append(document.createTextNode(' → '));
    const spot=element('b',String(seat+1));
    spot.style.setProperty('--seat-color',TEAMS[seat].color);
    order.append(spot);
  }
  if(spin)sounds.land('finish');
  if(s.phase==='opening'){
    firstSeatRevealed=true;renderHUD();return;
  }
  await delay(Math.min(remaining,resultMs));
  if(token===motion)firstSeatLayer.hidden=true;
}
async function showState(s,animate=true){
  if(shown===s)return;
  endHold();cancelTrayDrag();
  const previous=shown;shown=s;game=s;const token=++motion;
  const placed=placement?.state===previous?placement.move:null;
  placement=null;selectedPawn=null;pawnPicked=false;selectedSteps=null;
  if(panel==='destination'&&dialog.open)closePanel();
  toss.cancel();sounds.stop();clearBonus();$('toss-layer').hidden=true;
  firstSeatAnimation?.cancel();firstSeatLayer.hidden=true;
  const opening=firstSeatRemaining(s);
  pickingFirst=s.phase==='opening'||opening>0;
  firstSeatRevealed=false;
  const fresh=animate&&previous&&previous.revision+1===s.revision;
  const changed=fresh&&!reduced.matches;
  const rolled=fresh&&previous.phase==='roll';
  const launch=rolled&&releasedShuffle?.state===previous?releasedShuffle.pose:null;releasedShuffle=null;
  casting=!!(changed&&rolled);busy=!!changed||pickingFirst;
  if(casting)$('outcome').textContent='';else reveal(s);
  renderHUD();
  if(panel==='scores'&&dialog.open)standings();
  if(pickingFirst){
    draw(s);await showFirstSeat(s,token,opening);
    if(s.phase==='opening')return;
  }else if(casting){
    draw(s);
    $('toss-label').textContent=TEAMS[previous.team].name+' 팀 · 윷 던지기';
    $('toss-layer').hidden=false;
    let settled=false;
    const landed=()=>{
      if(settled||motion!==token)return;
      settled=true;$('toss-label').textContent=result(s);reveal(s);showBonus(s);
    };
    await toss.play(s.sticks,lastThrowSeed(s),landed,sounds.throwSticks,launch);
    landed();
  }else if(changed&&previous.phase==='move'&&s.lastMove){
    const {team,indices,frames}=s.lastMove,base=layer(previous).filter(p=>p.team!==team||!indices.includes(p.index));
    const dropAt=placed&&team===previous.team&&indices.includes(placed.index)?frames.indexOf(placed.to):-1;
    const remaining=dropAt<0?frames:frames.slice(dropAt+1);
    const movingAt=node=>[...base,...(node===HOME||node===FINISH?[]:indices.map(index=>({team,index,node})))];
    const pauseAt=(node,index)=>{
      if(s.lastMove.event&&node===s.lastMove.landing){
        $('note').textContent=net?.status||EVENT_NAMES[s.lastMove.event]||'';
        return 670;
      }
      if(index===frames.length-1&&s.lastMove.pickedUp!=null){
        $('note').textContent=net?.status||EVENT_NAMES.carry;
        return 670;
      }
      return PAWN_HOP_MS;
    };
    const land=(node,ms,index)=>{
      const kind=node===FINISH?'finish':s.lastMove.landing===node&&s.lastMove.event?s.lastMove.event:
        index===frames.length-1&&s.lastMove.pickedUp!=null?'carry':
        index===frames.length-1&&s.lastMove.captured?'capture':null;
      sounds.land(kind,ms,index);
    };
    if(dropAt>=0){
      land(placed.to,0,dropAt);
      if(remaining.length){draw(s,movingAt(placed.to),true);await delay(pauseAt(placed.to,dropAt));}
      else{draw(s,undefined,true);if(s.lastMove.event)await delay(pauseAt(placed.to,dropAt));}
    }
    for(const [i,node] of remaining.entries()){
      if(token!==motion)return;
      land(node,node===HOME||node===FINISH?0:PAWN_HOP_MS,i+dropAt+1);
      // Resolve captures and carried teammates together on the final landing frame.
      draw(s,i===remaining.length-1?undefined:movingAt(node));await delay(pauseAt(node,i+dropAt+1));
    }
  }else if(rolled){
    sounds.quickThrow();showBonus(s);
  }else if(fresh&&previous.phase==='move'&&s.lastMove){
    const move=s.lastMove;
    sounds.land(move.frames.at(-1)===FINISH?'finish':move.pickedUp!=null?'carry':move.event||(move.captured?'capture':null));
  }
  if(token!==motion)return;
  casting=false;busy=false;pickingFirst=false;$('toss-layer').hidden=true;reveal(s);draw(s);renderHUD();
  if(s.phase==='won'&&(animate||net?.game))showResult();
}
function showResult(reopen=false){
  const s=game,winner=s.winner;
  if(s.phase!=='won'||busy||!$('setup').hidden)return;
  const key='yut:'+(s.roundId??(net?net.host:'local-'+localRound));
  if(!reopen&&lastResultKey===key)return;
  lastResultKey=key;closePanel();
  const name=TEAMS[winner].name+' 팀',count=s.pawns[winner].length;
  const lost=net?net.seat>=0&&net.seat!==winner:s.computerTeams?.includes(winner);
  const replay=async()=>{
    if(net){await leaveRoom();showEntry('online');return;}
    resetLocal({count:s.pawns.length,offset:s.zodiacOffset,counts:s.pawns.map(p=>p.length),animals:s.teamAnimals,mode:s.mode},!!s.computerTeams?.length);
  };
  const actions=[
    {label:'오락실로',role:'exit',onClick:()=>location.assign('/world.html?tab=arcade')},
    {label:'윷판 보기',role:'secondary'},
    {label:net?'온라인 대전':'다시 한 판',role:'primary',onClick:replay,autofocus:true}
  ];
  const title=name+' 승리!',metric='말 '+count+'개 모두 골인';
  const summary=roundSummary(s,net?net.seat:0);
  if(window.OjjudaGameResults){
    const result=window.OjjudaGameResults.show({game:'yut',key,outcome:lost?'failure':'success',title,metric,actions});
    result.card.querySelector('.game-result-extra').append(summary);
  }else{
    openPanel(title,'result');body.append(message(metric),summary);
    const monthly=element('a','이번 달 1~10위 · 내 순위','secondary');
    monthly.href='/features/arcade/monthly-ranking.html?game=yut';monthly.target='_blank';monthly.rel='noopener';body.append(monthly);
    const controls=element('div',undefined,'game-result-actions');
    for(const action of actions){const control=button(action.label,'secondary',action.onClick??closePanel);control.dataset.gameResultAction=action.role;controls.append(control);}
    body.append(controls);
  }
}
function dispatch(action){
  if(busy||pendingRoom||game.computerTeams?.includes(game.team))return;
  if(net){if(net.seat===game.team&&net.connected)room?.action(action);}
  else{local=act(local,action);void showState(local);}
}
function scheduleComputer(){
  clearTimeout(botTimer);
  const s=game;
  if(!$('setup').hidden||!s.computerTeams?.includes(s.team)||s.phase==='won'||busy||pendingRoom)return;
  if(net?(!room||!net.game||!net.isHost||!net.connected):dialog.open)return;
  botTimer=setTimeout(()=>{
    if(game!==s||busy||pendingRoom||(net?!net.isHost||!net.connected:dialog.open))return;
    const action=computerAction(s);
    if(!action)return;
    if(net)room?.computerAction(action,s.revision);
    else{local=act(s,action);void showState(local);}
  },s.phase==='roll'?680:850);
}
function destinationLabel(s,m,choices){
  if(m.to===HOME)return '대기석';
  if(m.to===FINISH)return '골인';
  if(m.to===0)return nodeName(0);
  if(choices.some(o=>o.index===m.index&&o.steps===m.steps&&o.shortcut!==m.shortcut)){
    return m.shortcut?'지름길':position(s.pawns[s.team][m.index])===22?'다른 길':'바깥길';
  }
  const effect=tileEffect(s,m.to);
  if(effect)return EVENT_NAMES[effect];
  if(s.pawns.some((p,t)=>t!==s.team&&p.some(trail=>position(trail)===m.to)))return '잡기';
  if(s.pawns[s.team].some((trail,i)=>i!==m.index&&position(trail)===m.to))return '합류';
  return m.steps===-1?'뒤로':'도착';
}
function renderReserve(s,team,options,lobby){
  $('reserve').hidden=!!lobby;
  if(lobby)return;
  const indices=s.pawns[team].flatMap((trail,index)=>position(trail)===HOME?[index]:[]);
  const animal=ANIMALS[animalFor(team,0,s.zodiacOffset,s.teamAnimals)];
  $('reserve-team').textContent=TEAMS[team].name+' · '+animal;
  const key=[team,animalFor(team,0,s.zodiacOffset,s.teamAnimals),...indices].join('/');
  if(key!==trayKey){
    cancelTrayDrag();trayKey=key;tray.replaceChildren();
    for(const index of indices){
      const item=element('button',undefined,'pawn-choice');
      item.type='button';item.dataset.pawn=String(index);
      item.setAttribute('aria-label',TEAMS[team].name+' 팀 '+pieceName(s,team,index)+' · 대기');
      item.title=item.getAttribute('aria-label');
      item.append(animalIcon(team,index,s.zodiacOffset,s.teamAnimals,false));tray.append(item);
    }
    if(!indices.length)tray.append(element('span','대기 말 없음','reserve-empty'));
  }
  for(const item of tray.querySelectorAll('button')){
    const index=Number(item.dataset.pawn);
    item.disabled=!options.some(m=>m.index===index);
    item.setAttribute('aria-pressed',String(!item.disabled&&index===selectedPawn));
  }
}
function clearTrayPointer(){
  const drag=trayDrag;if(!drag)return;
  trayDrag=null;drag.item.classList.remove('is-lifted');
  if(drag.item.hasPointerCapture?.(drag.id))drag.item.releasePointerCapture(drag.id);
}
function cancelTrayDrag(){
  if(!trayDrag)return;
  const moving=trayDrag.moving;
  clearTrayPointer();
  if(moving)board.cancelReserveDrag();
}
tray.addEventListener('click',event=>{
  const item=event.target.closest?.('button[data-pawn]');
  if(item&&!item.disabled&&(!suppressTrayClick||!event.detail))choosePawn(Number(item.dataset.pawn));
  suppressTrayClick=false;
});
tray.addEventListener('pointerdown',event=>{
  const item=event.target.closest?.('button[data-pawn]');
  if(!item||item.disabled||trayDrag||event.button!==0||event.isPrimary===false)return;
  suppressTrayClick=false;
  trayDrag={id:event.pointerId,item,index:Number(item.dataset.pawn),x:event.clientX,y:event.clientY,moving:false};
  try{item.setPointerCapture?.(event.pointerId);}catch{/* Window listeners still track the drag. */}
});
window.addEventListener('pointermove',event=>{
  const d=trayDrag;if(!d||event.pointerId!==d.id)return;
  if(!canMovePiece()){cancelTrayDrag();return;}
  if(!d.moving){
    if(Math.hypot(event.clientX-d.x,event.clientY-d.y)<5)return;
    choosePawn(d.index);
    if(!board.beginReserveDrag(d.index,event)){cancelTrayDrag();return;}
    d.moving=true;suppressTrayClick=true;d.item.classList.add('is-lifted');
  }
  board.updateReserveDrag(event);event.preventDefault();
},{passive:false});
window.addEventListener('pointerup',event=>{
  const d=trayDrag;if(!d||event.pointerId!==d.id)return;
  clearTrayPointer();
  if(d.moving)board.endReserveDrag(event);
});
function cancelMatchingPointer(event){if(trayDrag?.id===event.pointerId)cancelTrayDrag();}
window.addEventListener('pointercancel',cancelMatchingPointer);
tray.addEventListener('lostpointercapture',cancelMatchingPointer);
window.addEventListener('blur',cancelTrayDrag);
function moveControls(s,options,steps){
  const picker=$('pawn-picker'),actions=$('actions'),team=s.pawns[s.team];
  const indices=[...new Set(options.filter(o=>position(team[o.index])!==HOME).map(o=>o.index))];
  picker.hidden=!indices.length;$('field-label').hidden=picker.hidden;
  const restorePicker=picker.contains(document.activeElement);
  picker.replaceChildren();
  for(const index of indices){
    const selected=index===selectedPawn;
    const group=team.filter(trail=>position(trail)===position(team[index])).length;
    const item=button('','pawn-choice',()=>choosePawn(index));
    item.dataset.pawn=String(index);item.setAttribute('aria-pressed',String(selected));
    item.setAttribute('aria-label',pieceName(s,s.team,index)+' · '+nodeName(position(team[index]))+(group>1?' · 업은 말 '+group+'개':''));
    item.title=item.getAttribute('aria-label');
    item.append(animalIcon(s.team,index,s.zodiacOffset,s.teamAnimals,false));
    picker.append(item);
  }
  if(restorePicker)picker.querySelector('[data-pawn="'+selectedPawn+'"]')?.focus({preventScroll:true});
  if(!steps){
    actions.append(button('이동할 칸 선택','primary',()=>destinationMenu(s,options)));return;
  }
  const paths=options.filter(o=>o.index===selectedPawn&&o.steps===steps).sort((a,b)=>Number(b.shortcut)-Number(a.shortcut));
  for(const [i,m] of paths.entries()){
    const cue=destinationLabel(s,m,options);
    const label=m.to===0?'나가기 칸으로':m.to===HOME?'대기석으로':cue==='골인'?'골인하기':paths.length>1?cue+'로 이동':distanceLabel(steps)+' 이동';
    const eventName=EVENT_NAMES[tileEffect(s,m.to)];
    const action=button(eventName?label+' · '+eventName:label,i?'secondary route-btn':'primary advance-btn',()=>{if(game===s)place(m);});
    action.setAttribute('aria-label',action.textContent+' · '+nodeName(m.to));actions.append(action);
  }
}
function resultControls(s,steps,options){
  const holder=$('result-picker'),title=$('move-result'),counts=bankCounts(s);
  const focused=holder.contains(document.activeElement);
  holder.replaceChildren();holder.hidden=counts.size<2;title.hidden=!holder.hidden;
  if(holder.hidden){
    title.textContent=rollLabel(steps)+(counts.get(steps)>1?' ×'+counts.get(steps):'');
    return;
  }
  for(const [value,count] of counts){
    const chip=button(rollLabel(value,' ')+(count>1?' ×'+count:''),'result-choice',()=>{
      if(game!==s||!canMovePiece())return;
      selectedSteps=value;renderHUD();
    });
    chip.disabled=!options.some(m=>m.steps===value);
    chip.setAttribute('aria-pressed',String(steps===value));holder.append(chip);
  }
  if(focused)holder.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
}
function renderHUD(){
  const s=game,lobby=net&&!net.game,other=net&&net.seat!==s.team;
  const team=turnTeam(s),bot=s.computerTeams?.includes(s.team);
  $('team-title').replaceChildren(...(lobby?[document.createTextNode('온라인 대기실')]:
    pickingFirst?[document.createTextNode('선 정하기')]:[dot(team),document.createTextNode((team+1)+'번 · '+TEAMS[team].name+' 팀'+(s.phase==='won'?' 승리!':busy&&!casting?' 이동 중':' 차례'))]));
  $('goals').textContent=lobby||pickingFirst?'':'골인 '+s.pawns[team].filter(p=>position(p)===FINISH).length+'/'+s.pawns[team].length;
  const actions=$('actions');
  resumeActionFocus=actions.contains(document.activeElement)||(resumeActionFocus&&document.activeElement===document.body&&!dialog.open);
  const keepCast=actions.firstElementChild===castButton&&canCast();
  if(!keepCast){endHold();actions.replaceChildren();}
  const moving=canMovePiece(),steps=currentSteps();
  const options=s.phase==='move'&&!busy&&!pendingRoom&&!lobby&&!dialog.open?allMoves(s):[];
  if(moving&&steps&&!options.some(o=>o.index===selectedPawn&&o.steps===steps)){
    const eligible=options.filter(o=>o.steps===steps);
    const preferred=eligible.find(o=>position(s.pawns[s.team][o.index])!==HOME)??eligible[0];
    selectedPawn=preferred?.index??null;pawnPicked=false;
  }
  renderReserve(s,team,moving?options:[],lobby||pickingFirst);
  const manyRolls=bankCounts(s).size>1;
  board.setMoves(options.map(m=>({team:s.team,index:m.index,from:position(s.pawns[s.team][m.index]),
    to:targetTile(m),label:manyRolls?YUT[m.steps]:destinationLabel(s,m,options)})),selectedPawn,moving);
  const rackWasHidden=$('stick-rack').hidden;
  $('move-tools').hidden=!moving;$('stick-rack').hidden=moving;
  if(rackWasHidden&&!moving)paintRack();
  $('station').dataset.phase=moving?'move':'roll';
  $('note').textContent=net?.status||(!lobby&&!busy?moveNotice(s):'');
  if(moving)$('board').setAttribute('aria-description','금빛 칸을 누르거나 말을 끌어 놓으세요.');
  else $('board').removeAttribute('aria-description');
  if(moving){
    resultControls(s,steps,options);moveControls(s,options,steps);
  }else if(lobby)actions.append(button('대기실 열기','primary',lobbyPanel));
  else if(s.phase==='opening'){
    const host=!net||net.isHost;
    if(s.firstSeatAt==null){
      actions.append(button(host?'선 정하기':'방장이 선을 정해요','primary',
        ()=>advanceOpening('draw-first-seat'),!host||!!net&&(!net.connected||!room)));
    }else if(firstSeatRevealed){
      actions.append(button(host?'시작하기':'방장이 시작하면 진행돼요','primary',
        ()=>advanceOpening('begin-play'),!host||!!net&&(!net.connected||!room)));
    }else actions.append(button('선을 정하는 중…','primary',null,true));
  }
  else if(s.phase==='won')actions.append(button('결과 보기','primary',()=>showResult(true),busy));
  else{
    const disabled=!canCast();
    const throwLabel=pendingRolls(s).length||s.lastMove?.captured&&s.team===s.lastMove.team?'한 번 더 던지기':'윷 던지기';
    const label=pickingFirst?'선을 정하는 중…':casting?'윷 던지는 중…':busy?'말 이동 중…':bot?'컴퓨터 차례':other?'상대 팀 차례':s.phase==='move'?'말 옮기기':throwLabel;
    if(disabled)actions.append(button(label,'primary',null,true));
    else{castButton.textContent=label;if(!keepCast)actions.append(castButton);}
  }
  scheduleComputer();
  if(resumeActionFocus&&!dialog.open){
    const next=moving&&!steps?$('result-picker').querySelector('button'):actions.querySelector('button:enabled');
    if(next){next.focus({preventScroll:true});resumeActionFocus=false;}
  }
}
function openPanel(title,name){
  endHold();cancelTrayDrag();panel=name;board.setMoves([],null);$('dialog-title').textContent=title;body.replaceChildren();if(!dialog.open)dialog.showModal();
}
function closePanel(){if(dialog.open)dialog.close();}
function message(text){const el=element('p',text,'message');el.setAttribute('role','status');return el;}
const eventDescriptions={
  carry:['×2','혼자 도착하면 대기 말 하나를 업어요. 두 말이 함께 움직여요.'],
  back:['−1','왔던 길로 한 칸 물러나요.'],
  home:['⌂','도착한 말과 그 위에 업힌 말이 함께 대기석으로 돌아가요.']
};
function eventPlace(node){
  if(node===22)return '가운데 갈림길';
  if(node===5||node===10)return '바깥길 '+node+'번 갈림길';
  if(node===15)return '바깥길 15번 합류점';
  if(node<20)return '바깥길 '+node+'번';
  // Inner fork numbers run from the preceding corner or from the shared center.
  const [from,toward,offset]=node<22?[5,22,19]:node<25?[22,15,22]:node<27?[10,22,24]:[22,0,26];
  const landmark=n=>n===22?'가운데':n===0?'출발점':n+'번';
  return landmark(from)+' → '+landmark(toward)+' 사이 '+(node-offset)+'번째';
}
function eventGuide(s){
  const guide=element('div',undefined,'event-guide');
  const boardNodes=Array.from({length:FINISH},(_,n)=>n);
  for(const [type,[glyph,copy]] of Object.entries(eventDescriptions)){
    const nodes=boardNodes.filter(n=>tileEffect(s,n)===type);
    if(!nodes.length)continue;
    const card=element('div',undefined,'event-card'),icon=element('span',glyph,'event-glyph '+type);
    icon.setAttribute('aria-hidden','true');
    card.append(icon,element('strong',EVENT_NAMES[type]),element('p',copy),element('small',nodes.map(eventPlace).join(' · ')));
    guide.append(card);
  }
  return guide;
}
function showEventGuide(){
  openPanel('이번 판 특수 칸','events');
  const copy=game.islandTiles?'새 판마다 종류별로 한 칸씩 뽑아요. 멈춘 칸의 효과가 한 번 적용돼요.':'멈춘 칸의 효과가 한 번 적용돼요.';
  body.append(message(copy),eventGuide(game),button('알겠어요','primary',closePanel));
}
function rules(){
  openPanel('놀이 방법','help');
  const list=element('ol');
  list.append(element('li','윷 던지기를 누르면 섞이고, 떼면 던져요. 윷이나 모가 나오면 한 번 더 던져요.'),element('li','다 던지면 갈 수 있는 칸이 모두 빛나요. 원하는 칸을 누르세요.'));
  const more=element('details',undefined,'game-details');
  more.append(element('summary','자세한 규칙'),
    element('p','‘한 칸 뒤로’가 적힌 윷만 평평한 면이 위로 나오면 ‘뒤로’예요. 판 위의 말 하나를 한 칸 물려요. 첫 도 칸에서 물러나면 나가기 칸에 서요. 거기서 한 칸 더 나가면 골인이에요.'),
    element('p','도·개·걸·윷·모는 1~5칸이에요. 다른 말을 쓰려면 판이나 대기석에서 먼저 고르세요. 말은 금빛 칸으로 끌어 놓거나 이동 버튼으로 옮겨도 돼요.'),
    element('p','갈림길에 멈추면 다음에 지름길을 고를 수 있어요. 나가기 칸을 지나면 골인이에요.'),
    element('p','같은 팀 말은 업어서 함께 가요. 뒤로·도·개·걸로 상대 말을 잡으면 한 번 더 던져요. 남은 결과는 계속 쓸 수 있어요.'));
  if(game.eventTiles)more.append(button('이번 판 특수 칸 보기','secondary',showEventGuide));
  body.append(list,message('우리 팀 말을 먼저 모두 골인시키면 이겨요.'),more,button('알겠어요','primary',closePanel));
}
function resetLocal(setup,computer){
  const {count,offset,mode,counts,animals}=setup;
  const bots=computer?Array.from({length:count-1},(_,i)=>i+1):[];
  closePanel();showTable();localRound++;resumeActionFocus=true;
  local=newMatch(count,offset,mode,counts,bots,animals);void showState(local,false);
}
function modePicker(current,onChange){
  const box=element('div'),label=element('label','놀이 방식'),select=element('select');
  label.htmlFor='game-mode';select.id=label.htmlFor;
  for(const [value,copy] of [['island','보통 · 장애물 놀이'],['easy','쉬움 · 쉬운 놀이']]){
    const option=element('option',copy);option.value=value;select.append(option);
  }
  select.value=current;select.onchange=()=>onChange?.(select.value);
  box.append(label,select);return {box,select};
}
function setupSelect(id,items,current){
  const select=element('select');select.id=id;
  for(const [value,label] of items){
    const option=element('option',label);option.value=value;select.append(option);
  }
  select.value=String(current);return select;
}
function settings(){
  if(pendingRoom)return;
  openPanel('게임 메뉴','settings');
  const menu=element('div',undefined,'menu-grid');
  menu.append(button('놀이 방법','secondary',rules),button('말 현황','secondary',standings));
  const soundButton=button('','secondary',()=>{sounds.setEnabled(!sounds.enabled);soundLabel();});
  function soundLabel(){
    soundButton.textContent=sounds.enabled?'효과음 켜짐':'효과음 꺼짐';
    soundButton.setAttribute('aria-pressed',String(sounds.enabled));
  }
  soundLabel();menu.append(soundButton);
  if((!net||net.game)&&game.eventTiles)menu.append(button('특수 칸','secondary',showEventGuide));
  menu.append(button('윷판 돌리기','secondary',()=>{board.rotate(1);closePanel();}));body.append(menu);
  if(net){
    body.append(button('온라인 대기실','secondary',lobbyPanel),
      button('방 나가기','secondary',()=>confirmPanel('온라인 방 나가기',net.isHost?'방장이 나가면 방이 닫혀요.':'현재 방에서 나갈까요?',leaveRoom)));
    return;
  }
  setupControls(body,false);
}
function setupControls(target,entry,kind=entry?'computer':(local.computerTeams?.length?'computer':'together')){
  const kinds=element('div',undefined,entry?'seg':'play-kinds');kinds.setAttribute('role','group');kinds.setAttribute('aria-label','대결 방식');
  const label=element('label','참가 팀');label.htmlFor='team-count';
  const teamCounts=Array.from({length:TEAMS.length-1},(_,i)=>[i+2,(i+2)+'팀']);
  const teams=setupSelect('team-count',teamCounts,local.pawns.length);
  const mode=modePicker(entry?preferredYutDifficulty():(local.mode??DEFAULT_MODE),rememberYutDifficulty),numbers=element('div'),settingsRow=element('div',undefined,'settings-row');numbers.append(label,teams);settingsRow.append(numbers,mode.box);
  const roster=element('div',undefined,'roster'),head=element('div',undefined,'roster-line roster-head');
  head.append(element('b','팀 구성'),element('span','동물'),element('span','말 수'));
  const counts=TEAMS.map((_,t)=>local.pawns[t]?.length??DEFAULT_PIECES);
  const animals=TEAMS.map((_,t)=>animalFor(t,0,local.zodiacOffset,local.teamAnimals));
  function drawTeams(){
    roster.replaceChildren(head);
    for(let t=0;t<Number(teams.value);t++){
      const row=element('div',undefined,'roster-line'),team=element('div',undefined,'roster-team');
      team.append(animalIcon(t,0,animals[0],animals),element('span',TEAMS[t].name+' 팀'));
      const species=setupSelect('team-animal-'+t,ANIMALS.map((name,id)=>[id,name]),animals[t]);
      const count=setupSelect('team-pieces-'+t,[2,3,4].map(n=>[n,n+'개']),counts[t]);
      species.setAttribute('aria-label',TEAMS[t].name+' 팀 동물');count.setAttribute('aria-label',TEAMS[t].name+' 팀 말 수');
      species.onchange=()=>{animals[t]=Number(species.value);team.firstChild.replaceWith(animalIcon(t,0,animals[0],animals));};
      count.onchange=()=>{counts[t]=Number(count.value);};
      row.append(team,species,count);roster.append(row);
    }
  }
  teams.onchange=drawTeams;drawTeams();
  const actions=element('div',undefined,entry?'entry-actions':'form-actions');
  const start=button('',entry?'ge-primary':'primary',()=>{
    const count=Number(teams.value);
    const setup={count,counts:counts.slice(0,count),animals:animals.slice(0,count),offset:animals[0],mode:mode.select.value};
    const play=()=>resetLocal(setup,kind==='computer');
    if(local.revision&&local.phase!=='won')confirmPanel('새 판을 시작할까요?','진행 중인 한 기기 게임을 끝내고 새 판을 시작해요.',play);else play();
  });
  const recordNote=element('p','한 기기에서는 첫 번째 팀('+TEAMS[0].name+' 팀)의 승패가 내 월간 연승에 반영돼요.','ge-copy');
  const offlinePanel=element('div'),onlinePanel=entry?element('div'):null;
  if(onlinePanel){
    onlinePanel.id='public-room-host';
    onlinePanel.innerHTML='<section class="arcade-rooms" data-arcade-rooms aria-label="윷놀이 대전방"></section><a id="login-link" class="ge-secondary" href="/?auth=login&amp;next=world" hidden>오쭈다 로그인하기</a><p id="online-account-note" class="ge-hint" role="status"></p>';
  }
  function refresh(){
    for(const item of kinds.children)item.setAttribute('aria-pressed',String(item.dataset.kind===kind));
    start.textContent=entry?'게임 시작하기':'게임 시작';
    recordNote.hidden=kind!=='together';
    offlinePanel.hidden=kind==='online';
    if(onlinePanel)onlinePanel.hidden=kind!=='online';
    if(entry){entryKind=kind;if(kind==='online')void mountRooms();else disposeRooms();}
  }
  for(const [value,title,entryTitle] of [['computer','컴퓨터 대결','컴퓨터 대전'],['together','한 기기','같은 기기'],['online','온라인 멀티','온라인 대전']]){
    const item=button(entry?entryTitle:title,entry?'':'secondary',()=>{if(!entry&&value==='online'){showEntry('online');return;}kind=value;refresh();});item.dataset.kind=value;kinds.append(item);
  }
  const options=element('details',undefined,entry?'ge-more':'game-details');
  options.append(element('summary','팀별 동물·말 수'),roster);
  actions.append(start);offlinePanel.append(settingsRow,recordNote,...(entry?[actions,options]:[options,actions]));
  target.append(kinds,offlinePanel);if(onlinePanel)target.append(onlinePanel);refresh();
}
function disposeRooms(){entryEpoch++;roomUI?.dispose();roomUI=null;}
function onlineNote(text){const note=$('online-account-note');if(note)note.textContent=text;}
function onlineMessage(error){
  const code=String(error?.code||error?.message||'');
  if(/not_signed_in/.test(code))return '로그인하면 대전방을 만들고 참여할 수 있어요.';
  if(/room_(not_found|unavailable)|host_unavailable/.test(code))return '이미 닫힌 방이에요. 다른 방을 골라 주세요.';
  if(/blocked/.test(code))return '이 방에는 참여할 수 없어요. 다른 방을 골라 주세요.';
  if(/host_key_lost|identity/.test(code))return '방을 만든 창에서 다시 열어 주세요.';
  if(/[가-힣]/.test(code))return code;
  return window.OjjudaArcadeRooms?.message(error)||'연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
async function ensureDirectory(){
  if(directory)return directory;
  if(directoryPending)return directoryPending;
  const generation=directoryGeneration;
  const pending=(async()=>{
    const client=await window.OjjudaGetClient();
    if(generation!==directoryGeneration)throw Error('unavailable');
    directory=createYutLobby(client,{onAuthChange:()=>{
      if(!directory)return;
      if(net?.directory){void leaveRoom();return;}
      if(entryKind==='online'&&!$('setup').hidden){disposeRooms();void mountRooms();}
    }});
    return directory;
  })();
  directoryPending=pending;
  try{return await pending;}finally{if(directoryPending===pending)directoryPending=null;}
}
function defaultRoomSetup(count){
  return {count,counts:Array.from({length:count},(_,i)=>local.pawns[i]?.length??DEFAULT_PIECES),
    animals:Array.from({length:count},(_,i)=>animalFor(i,0,local.zodiacOffset,local.teamAnimals)),
    offset:local.zodiacOffset,mode:preferredYutDifficulty()};
}
function publicSetupForm(form){
  const details=element('details',undefined,'game-details'),content=element('div'),roster=element('div',undefined,'roster');
  const mode=setupSelect('room-mode',[['island','보통 · 장애물 놀이'],['easy','쉬움 · 쉬운 놀이']],preferredYutDifficulty());
  mode.addEventListener('change',()=>rememberYutDifficulty(mode.value));
  const label=element('label','놀이 방식');label.htmlFor=mode.id;
  const settings=defaultRoomSetup(TEAMS.length);
  details.append(element('summary','놀이 설정'),content);content.append(label,mode,roster);
  function draw(){
    const count=Number(form.elements.capacity.value)||2;roster.replaceChildren();
    for(let t=0;t<count;t++){
      const row=element('div',undefined,'roster-line'),name=element('span',TEAMS[t].name+' 팀');
      const animal=setupSelect('room-animal-'+t,ANIMALS.map((n,i)=>[i,n]),settings.animals[t]);
      const pieces=setupSelect('room-pieces-'+t,[2,3,4].map(n=>[n,n+'개']),settings.counts[t]);
      animal.setAttribute('aria-label',TEAMS[t].name+' 팀 동물');pieces.setAttribute('aria-label',TEAMS[t].name+' 팀 말 수');
      animal.onchange=()=>{settings.animals[t]=Number(animal.value);};pieces.onchange=()=>{settings.counts[t]=Number(pieces.value);};
      row.append(name,animal,pieces);roster.append(row);
    }
  }
  form.elements.capacity.addEventListener('change',draw);
  form.querySelector('[data-create-capacity]').after(details);queueMicrotask(()=>{if(form.isConnected)draw();});
  return count=>({...settings,count,mode:mode.value,offset:settings.animals[0],counts:settings.counts.slice(0,count),animals:settings.animals.slice(0,count)});
}
async function mountRooms(){
  const host=$('public-room-host');
  if(!host||host.hidden||$('setup').hidden||net||pendingRoom)return;
  if(roomUI){roomUI.sync();return;}
  const revision=++entryEpoch;
  onlineNote('대전방을 불러오는 중이에요.');
  try{
    const client=await ensureDirectory();await client.enter();
    if(revision!==entryEpoch||!host.isConnected||host.hidden||net||pendingRoom)return;
    if(!window.OjjudaArcadeRooms)throw Error('대전방 화면을 불러오지 못했어요. 새로고침해 주세요.');
    let readSetup=defaultRoomSetup;
    roomUI=window.OjjudaArcadeRooms.create({
      fixedKind:'yut',getUserId:()=>directory===client?client.userId:null,
      readRooms:signal=>client.list(signal),notify:onlineNote,
      renderModal:(markup,title)=>{openPanel(title,'arcade-room');body.innerHTML=markup;body.querySelector('.mhead')?.remove();const form=$('arcade-room-form');if(form)readSetup=publicSetupForm(form);},
      closeModal:closePanel,goArcade:()=>{},canOpen:()=>!$('setup').hidden&&!net,
      onCreateNative:async(kind,params)=>{if(kind!=='yut')throw Error('invalid_request');if(!await connectPublic({create:params,setup:readSetup(params.capacity)}))throw Error('unavailable');},
      onOpen:async item=>{if(!await connectPublic({roomNo:item.room_no}))throw Error('unavailable');},
      onFreshGame:async item=>{if(!await connectPublic({roomNo:item.room_no}))throw Error('unavailable');},
      onCancelNative:item=>client.cancel(item)
    });
    $('login-link').hidden=!!client.userId;onlineNote(client.userId?'':'로그인하면 대전방을 만들고 참여할 수 있어요.');roomUI.sync();
  }catch(error){
    if(revision!==entryEpoch||!host.isConnected||host.hidden)return;
    onlineNote(onlineMessage(error));
    const retry=button('다시 불러오기','ge-secondary',()=>{retry.remove();void mountRooms();});host.append(retry);
  }
}
function publicRoomAddress(roomNo){
  const url=new URL(location.href);url.hash='';url.searchParams.delete('create');url.searchParams.set('mode','online');
  if(roomNo)url.searchParams.set('room',String(roomNo));else url.searchParams.delete('room');
  try{history.replaceState(null,'',url.pathname+url.search);}catch{}
}
function publicInviteUrl(){const url=new URL('/games/yut/',location.href);url.searchParams.set('room',String(net.room_no));return url.href;}
function renderPublicLobby(){
  if(!net?.directory||net.game)return;
  disposeRooms();closePanel();$('setup').hidden=false;$('tabletop').hidden=true;document.body.dataset.mpEntry='true';
  $('yut-entry').hidden=true;$('online-lobby').hidden=false;
  const target=$('online-lobby-body'),capacity=net.setup?.count??2;
  target.replaceChildren(element('p',net.title||'윷놀이 같이 한 판 해요','ge-copy'));
  const meta=element('div',undefined,'room-code-row');meta.append(element('span',`방 #${net.room_no} · ${net.seats.length}/${capacity}명`));
  const copy=button('초대 링크 복사','ge-secondary',async()=>{
    try{await navigator.clipboard.writeText(publicInviteUrl());copy.textContent='복사했어요';}
    catch{openPanel('친구 초대','invite');const input=element('input');input.value=publicInviteUrl();input.readOnly=true;input.setAttribute('aria-label','초대 링크');body.append(input);input.focus();input.select();}
  });meta.append(copy);target.append(meta);
  const players=element('ol',undefined,'room-players');players.setAttribute('aria-label','참가자');
  for(let seat=0;seat<capacity;seat++){
    const key=net.seats[seat],member=net.players?.find(p=>p.key===key),name=member?.name||net.names?.[key];
    const row=element('li',undefined,'lobby-player'+(key?'':' is-empty'));
    row.append(dot(seat));const text=element('div');text.append(element('strong',key?(name||TEAMS[seat].name+' 팀'):'참가 대기'));
    text.append(element('small',key?`${TEAMS[seat].name} 팀${seat===net.seat?' · 나':''}${member?.is_host||key===net.host?' · 방장':''}`:TEAMS[seat].name+' 팀'));
    row.append(text);players.append(row);
  }
  target.append(players);
  const status=roomIssue||net.status||(net.isHost?(net.seats.length<capacity?'시작하면 빈자리는 컴퓨터가 채워요.':'모두 모였어요. 게임을 시작하세요.'):'방장이 시작하면 게임판이 열려요.');
  target.append(message(status));
  const controls=element('div',undefined,'room-actions');
  controls.append(button('방 나가기','ge-secondary',()=>void leaveRoom()));
  if(net.isHost)controls.append(button(startingRoom?'시작하는 중…':'게임 시작','ge-primary',async()=>{
    if(startingRoom||!room)return;startingRoom=true;roomIssue='';renderPublicLobby();
    try{await room.start(2,DEFAULT_MODE,DEFAULT_PIECES,true);}
    catch(error){roomIssue=onlineMessage(error);}
    finally{startingRoom=false;if(net?.directory&&!net.game)renderPublicLobby();}
  },startingRoom||pendingRoom||!room||!net.connected));
  target.append(controls);
}
async function connectPublic(options){
  if(pendingRoom||room)return false;
  const id=++attempt;pendingRoom=true;roomIssue='';disposeRooms();openPanel('온라인 방 연결','loading');body.append(message('방을 연결하고 있어요.'));
  try{
    const client=await ensureDirectory();if(!await client.enter())throw Error('not_signed_in');
    if(id!==attempt)return false;
    const update=view=>{if(id===attempt)networkUpdate(view);};
    const active=options.create?await client.create(options.create,options.setup||defaultRoomSetup(options.create.capacity),update):await client.join(options.roomNo,update);
    if(id!==attempt){await active.close();return false;}
    room=active;net=active.view();pendingRoom=false;publicRoomAddress(net.room_no);
    if(net.game){showTable();closePanel();}else renderPublicLobby();renderHUD();return true;
  }catch(error){
    if(id!==attempt)return false;
    pendingRoom=false;net=null;roomGame=false;showEntry('online');
    openPanel('방 연결을 확인해 주세요','error');body.append(message(onlineMessage(error)),button('다시 연결','primary',()=>void connectPublic(options)),button('방 목록으로','secondary',()=>{closePanel();void mountRooms();}));return false;
  }
}
function joinPanel(){
  openPanel('친구 방 참가','join');
  const label=element('label','방 코드 또는 초대 링크');label.htmlFor='join-code';
  const input=element('input');input.id=label.htmlFor;input.autocomplete='off';input.spellcheck=false;
  const error=message(''),submit=button('참가하기','primary',()=>{
    const code=roomCode(input.value);
    if(!code){error.textContent='친구가 보낸 방 코드나 링크 전체를 붙여 넣으세요.';input.focus();return;}
    void connect(code);
  });
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit.click();}};
  body.append(label,input,error,submit);input.focus();
}
function confirmPanel(title,copy,yes){
  openPanel(title,'confirm');const wrap=element('div',undefined,'form-actions');wrap.append(button('계속하기','primary',yes),button('취소','secondary',closePanel));body.append(message(copy),wrap);
}
function setRoomAddress(host){
  try{history.replaceState(null,'',host?'#room='+host:location.href.split('#')[0]);}
  catch{/* Some local-file browsers restrict history updates; the room still works. */}
}
function inviteUrl(){const u=new URL(location.href);u.hash='room='+net.host;return u.href;}
function copyValue(title,value,input){
  return button(title,'secondary',async event=>{
    const copy=event.currentTarget;
    try{await navigator.clipboard.writeText(value);copy.textContent='복사했어요';}
    catch{input.value=value;input.focus();input.select();copy.textContent='선택된 내용을 복사해 주세요';}
  });
}
function lobbyPanel(){
  if(!net)return;
  if(net.directory&&!net.game){renderPublicLobby();return;}
  openPanel('온라인 대기실','lobby');
  const capacity=net.setup?.count??TEAMS.length;
  const seat=net.seat<0?'자리 확인 중':TEAMS[net.seat].name+' 팀';
  if(net.directory)body.append(message(`방 #${net.room_no} · ${net.title}`));
  body.append(message('접속 '+net.seats.length+'/'+capacity+'팀 · 내 자리 '+seat));
  const actions=element('div',undefined,'form-actions room-actions');
  actions.append(button('방 나가기','secondary',()=>confirmPanel('방 나가기',net.isHost?'이 방의 게임을 끝낼까요?':'현재 방에서 나갈까요?',leaveRoom)));
  if(net.isHost&&!net.game){
    const label=element('label','친구 초대');label.htmlFor='invite';
    const link=element('input');link.id=label.htmlFor;link.readOnly=true;
    const web=location.protocol!=='file:';
    link.value=web?inviteUrl():net.host;
    const share=element('div',undefined,'share-actions');
    if(web)share.append(copyValue('초대 링크 복사',inviteUrl(),link));
    share.append(copyValue('방 코드 복사',net.host,link));body.append(label,link,share);
    const portable=document.querySelector('meta[name="yut-download"]')?.content;
    if(portable){
      const host=net.host;
      const download=button('친구에게 보낼 초대 파일 받기','secondary',async()=>{
        download.disabled=true;
        try{
          const response=await fetch(portable);
          if(!response.ok)throw Error();
          const template=await response.text();
          const marker='<meta name="yut-invite-room" content="">';
          if(!template.includes(marker))throw Error();
          const content=template.replace(marker,'<meta name="yut-invite-room" content="'+host+'">');
          const url=URL.createObjectURL(new Blob([content],{type:'text/html;charset=utf-8'}));
          const a=element('a');a.href=url;a.download='ojjuda-yut-invite.html';body.append(a);a.click();a.remove();
          setTimeout(()=>URL.revokeObjectURL(url),30000);
        }catch{download.textContent='초대 파일 다시 받기';}
        finally{download.disabled=false;}
      });
      body.append(download,message('다른 계정의 친구에게는 초대 파일을 보내세요. 친구가 브라우저로 파일을 열면 이 방에 들어와요.'));
    }
    body.append(message((portable?'':web?'친구에게 초대 링크를 보내세요. ':'친구에게 게임 파일과 방 코드를 보내세요. ')+'게임 중에는 방장 창을 열어 두세요.'));
    const start=fill=>{room?.start(2,DEFAULT_MODE,DEFAULT_PIECES,fill);if(net?.game)closePanel();};
    const full=net.seats.length===capacity;
    if(!net.setup)actions.append(button('모인 팀으로 시작','primary',()=>start(false),net.seats.length<2||!net.connected));
    else if(full)actions.append(button('게임 시작','primary',()=>start(false),!net.connected));
    else actions.append(button('빈 '+(capacity-net.seats.length)+'팀은 컴퓨터로 시작','secondary',()=>start(true),!net.connected));
  }else if(net.game)actions.append(button('게임 보기','primary',closePanel));
  else body.append(message('방장이 시작하면 게임판이 열려요.'));
  if(net.status)body.append(message(net.status));
  body.append(actions);
}
let lastLobby='';
function networkUpdate(v){
  net=v;
  if(v.directory&&v.closed){const issue=v.status;void leaveRoom().then(()=>onlineNote(issue||'방이 닫혔어요. 다른 방을 골라 주세요.'));return;}
  const signature=JSON.stringify([v.seats,v.status,!!v.game,v.seat,v.connected,v.names,v.title]);
  if(v.game&&(!shown||!roomGame||v.game.revision!==game.revision||v.game.phase!==game.phase||v.game.firstSeatAt!==game.firstSeatAt)){const first=!roomGame;roomGame=true;showTable();if(first&&panel==='lobby')closePanel();void showState(v.game,!first);}
  if(signature!==lastLobby){lastLobby=signature;if(v.directory&&!v.game)renderPublicLobby();else if(panel==='lobby'&&dialog.open)lobbyPanel();renderHUD();}
}
let roomGame=false;
async function connect(host){
  if(pendingRoom||room)return;
  const id=++attempt;pendingRoom=true;openPanel('온라인 방 연결','loading');body.append(message('잠시만요. 방을 연결하고 있어요.'));
  try{
    const active=await openRoom(host,v=>{if(id===attempt)networkUpdate(v);},undefined,host?null:roomSetup);
    if(id!==attempt){await active.close();return;}
    room=active;pendingRoom=false;showTable();renderHUD();
    setRoomAddress(net.host);if(net.game)closePanel();else lobbyPanel();
  }catch(err){
    if(id!==attempt)return;
    pendingRoom=false;net=null;roomGame=false;renderHUD();openPanel('방 연결을 확인해 주세요','error');body.append(message(err.message||'온라인 연결이 어려워요.'),
      button('다시 연결','primary',()=>connect(host)),button('한 기기에서 하기','secondary',async()=>{await leaveRoom();showEntry('together');}));
  }
}
async function leaveRoom(){
  const wasPublic=!!net?.directory;
  ++attempt;pendingRoom=false;const old=room;room=null;net=null;roomGame=false;lastLobby='';startingRoom=false;roomIssue='';
  if(wasPublic)publicRoomAddress(null);else setRoomAddress(null);
  closePanel();void showState(local,false);renderHUD();
  if(wasPublic)showEntry('online');
  if(old)await old.close().catch(()=>{});
  if(wasPublic)roomUI?.refresh();
}
$('settings').onclick=()=>settings();$('team-title').onclick=standings;$('close').onclick=closePanel;
body.addEventListener('click',event=>{if(event.target.closest('[data-act="close"]'))closePanel();});
dialog.addEventListener('close',()=>{if(!dialog.open){panel='';renderHUD();}});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();}});
reduced.addEventListener?.('change',()=>{if(hold)toss.shuffle(reduced.matches);else if(reduced.matches&&casting){toss.cancel();sounds.stop();}});
void showState(local,false);
const invite=new URLSearchParams(location.hash.slice(1));const embedded=document.querySelector('meta[name="yut-invite-room"]')?.content;
const entryQuery=new URLSearchParams(location.search),publicRoom=entryQuery.get('room');
showEntry(invite.has('room')||roomCode(embedded)||entryQuery.get('mode')==='online'||publicRoom?'online':undefined);
if(invite.has('room'))void connect(invite.get('room'));
else if(roomCode(embedded))void connect(embedded);
else if(publicRoom&&/^[1-9]\d{0,15}$/.test(publicRoom)&&Number.isSafeInteger(Number(publicRoom)))void connectPublic({roomNo:Number(publicRoom)});
else if(entryQuery.get('create')==='1')void (async()=>{
  try{
    const client=await ensureDirectory();await client.enter();
    let pending;try{pending=JSON.parse(sessionStorage.getItem('ojjuda-yut-create')||'null');}catch{}
    if(!pending||pending.owner!==client.userId||Date.now()-pending.createdAt>300000||Date.now()<pending.createdAt)return;
    if(await connectPublic({create:pending,setup:defaultRoomSetup(pending.capacity)}))sessionStorage.removeItem('ojjuda-yut-create');
  }catch(error){onlineNote(onlineMessage(error));}
})();
for(const link of document.querySelectorAll('.mp-entry-back,.rail-btn.back'))link.addEventListener('click',event=>{
  if(!net?.directory)return;event.preventDefault();const href=link.href;void leaveRoom().finally(()=>location.assign(href));
});
window.addEventListener('pagehide',()=>{
  disposeRooms();returnToPublic=!!net?.directory||entryKind==='online';
  const previous=directory,previousRoom=room;
  directory=null;directoryPending=null;directoryGeneration++;++attempt;pendingRoom=false;
  room=null;net=null;roomGame=false;lastLobby='';
  pageClose=Promise.allSettled([previousRoom?.close(),previous?.close()]);
});
window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  if(returnToPublic){publicRoomAddress(null);showEntry('online');void pageClose?.then(()=>roomUI?.refresh());}
});
