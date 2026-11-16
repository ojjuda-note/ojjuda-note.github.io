import {TEAMS,HOME,FINISH,YUT,DEFAULT_MODE,DEFAULT_PIECES,EVENT_NAMES,tileEffect,newGame,position,moves,nodeName,act,computerAction,lastThrowSeed} from './rules.mjs?v=11';
import {createBoard} from './board.mjs?v=19';
import {createToss,drawRack} from './toss.mjs?v=7';
import {openRoom,roomCode} from './room.mjs?v=11';
import {ANIMALS,animalFor,drawZodiac} from './zodiac.mjs?v=5';

const $=id=>document.getElementById(id), board=createBoard($('board'),chooseTile,choosePawn,dropPawn), toss=createToss($('toss-canvas'));
const dialog=$('sheet'), body=$('dialog-body'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
let local=newGame(2,11,DEFAULT_MODE,DEFAULT_PIECES,[1]), shown=null, net=null, room=null, pendingRoom=false, attempt=0, busy=false, motion=0, panel='',game=local;
let casting=false,selectedPawn=null,placement=null,resumeActionFocus=false;
const tray=$('reserve-pawns');
let trayKey='',trayDrag=null,suppressTrayClick=false;
const rack=$('rack-canvas'),rackContext=rack.getContext('2d');
let rackFaces=null,rackSeed=null,paintedFaces='',roomSetup=null,botTimer=null;
let localRound=0,lastResultKey='';
function showTable(){
  if($('setup').hidden)return;
  $('setup').hidden=true;$('entry-controls').replaceChildren();
  document.body.dataset.mpEntry='false';$('tabletop').hidden=false;
  window.dispatchEvent(new window.Event('resize'));
}
function showEntry(kind){
  closePanel();$('tabletop').hidden=true;$('setup').hidden=false;
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
function animalIcon(team,index,offset,teamAnimals){
  const canvas=element('canvas',undefined,'animal-icon');
  canvas.width=100;canvas.height=88;canvas.setAttribute('aria-hidden','true');
  const ctx=canvas.getContext('2d');
  const project=([x,y,z])=>[50+(x*.966+z*.259)*58,73+(-x*.259+z*.966)*30-y*50];
  if(ctx)drawZodiac(ctx,project,0,0,0,1,animalFor(team,index,offset,teamAnimals),TEAMS[team].color,index);
  return canvas;
}
const layer=(s)=>s.pawns.flatMap((team,t)=>team.flatMap((trail,i)=>{
  const node=position(trail);return node===HOME||node===FINISH?[]:[{team:t,index:i,node}];
}));
function turnTeam(s){return busy&&!casting&&s.lastMove?s.lastMove.team:s.team;}
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
const targetTile=m=>m.to===FINISH?0:m.to;
function canMovePiece(){
  return !game.computerTeams?.includes(game.team)&&game.phase==='move'&&!busy&&!pendingRoom&&!dialog.open&&
    (!net||!!(room&&net.game&&net.connected&&net.seat===game.team));
}
function choosePawn(index){
  if(!canMovePiece()||!moves(game).some(m=>m.index===index))return;
  selectedPawn=index;
  renderHUD();
}
function place(move,dragged=false){
  if(!canMovePiece())return;
  if(dragged)placement={state:game,move};
  dispatch({type:'move',index:move.index,shortcut:move.shortcut});
}
function dropPawn(index,tile){
  if(!canMovePiece())return;
  const move=moves(game).find(m=>m.index===index&&targetTile(m)===tile);
  if(move)place(move,true);
}
function chooseTile(tile){
  if(!canMovePiece())return;
  const picks=moves(game).filter(m=>targetTile(m)===tile&&(selectedPawn===null||m.index===selectedPawn));
  if(picks.length)place(picks[0]);
}
function result(s){return s.sticks?YUT[s.steps]+' · '+s.steps+'칸':'';}
function moveNotice(s){
  const move=s.lastMove;
  if(!move||s.phase!=='roll')return '';
  const parts=[];
  const eventName=EVENT_NAMES[move.event];
  if(eventName&&(move.event!=='carry'||move.pickedUp!=null))parts.push(eventName);
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
  $('outcome').textContent=result(s);
  rack.setAttribute('aria-label',rackFaces?'던진 윷 네 가락 · '+result(s):'던질 윷 네 가락');
  paintRack();
}
async function showState(s,animate=true){
  if(shown===s)return;
  cancelTrayDrag();
  const previous=shown;shown=s;game=s;const token=++motion;
  const placed=placement?.state===previous?placement.move:null;
  placement=null;selectedPawn=null;
  toss.cancel();$('toss-layer').hidden=true;
  const changed=animate&&previous&&previous.revision+1===s.revision&&!reduced.matches;
  casting=!!(changed&&s.phase==='move');busy=!!changed;
  if(casting)$('outcome').textContent='';else reveal(s);
  renderHUD();
  if(panel==='scores'&&dialog.open)standings();
  if(casting){
    draw(s);
    $('toss-label').textContent=TEAMS[s.team].name+' 팀 · 윷 던지기';
    $('toss-layer').hidden=false;
    await toss.play(s.sticks,lastThrowSeed(s),()=>{
      if(motion!==token)return;
      $('toss-label').textContent=result(s);reveal(s);
    });
  }else if(changed&&previous.phase==='move'&&s.lastMove){
    const {team,indices,frames}=s.lastMove,base=layer(previous).filter(p=>p.team!==team||!indices.includes(p.index));
    const dropAt=placed&&team===previous.team&&indices.includes(placed.index)?frames.indexOf(placed.to):-1;
    const remaining=dropAt<0?frames:frames.slice(dropAt+1);
    const movingAt=node=>[...base,...(node===HOME||node===FINISH?[]:indices.map(index=>({team,index,node})))];
    const pauseAt=node=>{
      if(s.lastMove.event&&node===s.lastMove.landing){
        $('note').textContent=net?.status||EVENT_NAMES[s.lastMove.event]||'';
        return 670;
      }
      return 235;
    };
    if(dropAt>=0){
      if(remaining.length){draw(s,movingAt(placed.to),true);await delay(pauseAt(placed.to));}
      else{draw(s,undefined,true);if(s.lastMove.event)await delay(pauseAt(placed.to));}
    }
    for(const node of remaining){
      if(token!==motion)return;
      draw(s,movingAt(node));await delay(pauseAt(node));
    }
  }
  if(token!==motion)return;
  casting=false;busy=false;$('toss-layer').hidden=true;reveal(s);draw(s);renderHUD();
  if(s.phase==='won'&&(animate||net?.game))showResult();
}
function showResult(reopen=false){
  const s=game,winner=s.winner;
  if(s.phase!=='won'||busy||!$('setup').hidden)return;
  const key='yut:'+ (net?net.host:'local-'+localRound);
  if(!reopen&&lastResultKey===key)return;
  lastResultKey=key;closePanel();
  const name=TEAMS[winner].name+' 팀',count=s.pawns[winner].length;
  const lost=net?net.seat>=0&&net.seat!==winner:s.computerTeams?.includes(winner);
  const replay=async()=>{
    if(net){await leaveRoom();showEntry('online');return;}
    resetLocal({count:s.pawns.length,offset:s.zodiacOffset,counts:s.pawns.map(p=>p.length),animals:s.teamAnimals,mode:s.mode},!!s.computerTeams?.length);
  };
  const actions=[
    {label:net?'온라인 대전':'다시 한 판',onClick:replay,autofocus:true},
    {label:'윷판 보기'},
    {label:'오락실로',onClick:()=>location.assign('/world.html?tab=arcade')}
  ];
  const title=name+' 승리!',metric='말 '+count+'개 모두 골인';
  if(window.OjjudaGameResults){
    window.OjjudaGameResults.show({key,outcome:lost?'failure':'success',title,metric,actions,share:false});
  }else{
    openPanel(title,'result');body.append(message(metric));
    for(const action of actions)body.append(button(action.label,'secondary',action.onClick??closePanel));
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
  if(m.to===FINISH)return '골인';
  if(choices.some(o=>o.index===m.index&&o.shortcut!==m.shortcut)){
    return m.shortcut?'지름길':position(s.pawns[s.team][m.index])===22?'다른 길':'바깥길';
  }
  const effect=tileEffect(s,m.to);
  if(effect)return EVENT_NAMES[effect];
  if(s.pawns.some((p,t)=>t!==s.team&&p.some(trail=>position(trail)===m.to)))return '잡기';
  if(s.pawns[s.team].some((trail,i)=>i!==m.index&&position(trail)===m.to))return '합류';
  return '도착';
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
      const copy=element('span',(index+1)+'번','pawn-copy');
      item.append(animalIcon(team,index,s.zodiacOffset,s.teamAnimals),copy);tray.append(item);
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
function moveControls(s,options){
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
    const copy=element('span',undefined,'pawn-copy');
    copy.append(element('b',group>1?'업기 ×'+group:(index+1)+'번'),element('small',nodeName(position(team[index]))));
    item.setAttribute('aria-label',pieceName(s,s.team,index)+' · '+nodeName(position(team[index]))+(group>1?' · 업은 말 '+group+'개':''));
    item.append(animalIcon(s.team,index,s.zodiacOffset,s.teamAnimals),copy);
    picker.append(item);
  }
  if(restorePicker)picker.querySelector('[data-pawn="'+selectedPawn+'"]')?.focus({preventScroll:true});
  const paths=options.filter(o=>o.index===selectedPawn).sort((a,b)=>Number(b.shortcut)-Number(a.shortcut));
  for(const [i,m] of paths.entries()){
    const cue=destinationLabel(s,m,options);
    const label=cue==='골인'?'골인하기':paths.length>1?cue+'로 이동':s.steps+'칸 이동';
    const eventName=EVENT_NAMES[tileEffect(s,m.to)];
    const action=button(eventName?label+' · '+eventName:label,i?'secondary route-btn':'primary advance-btn',()=>{if(game===s)place(m);});
    action.setAttribute('aria-label',action.textContent+' · '+nodeName(m.to));actions.append(action);
  }
}
function renderHUD(){
  const s=game,lobby=net&&!net.game,other=net&&net.seat!==s.team;
  const team=turnTeam(s),bot=s.computerTeams?.includes(s.team);
  $('team-title').replaceChildren(...(lobby?[document.createTextNode('온라인 대기실')]:
    [dot(team),document.createTextNode(TEAMS[team].name+' 팀'+(s.phase==='won'?' 승리!':busy&&!casting?' 이동 중':' 차례'))]));
  $('goals').textContent=lobby?'':'골인 '+s.pawns[team].filter(p=>position(p)===FINISH).length+'/'+s.pawns[team].length;
  const actions=$('actions');
  resumeActionFocus=actions.contains(document.activeElement)||(resumeActionFocus&&document.activeElement===document.body&&!dialog.open);
  actions.replaceChildren();
  const options=canMovePiece()?moves(s):[];
  if(options.length&&!options.some(o=>o.index===selectedPawn)){
    const onBoard=options.find(o=>position(s.pawns[s.team][o.index])!==HOME);
    selectedPawn=(onBoard??options[0]).index;
  }
  renderReserve(s,team,options,lobby);
  board.setMoves(options.map(m=>({team:s.team,index:m.index,from:position(s.pawns[s.team][m.index]),to:targetTile(m),label:destinationLabel(s,m,options)})),selectedPawn);
  const moving=options.length>0;
  const rackWasHidden=$('stick-rack').hidden;
  $('move-tools').hidden=!moving;$('stick-rack').hidden=moving;
  if(rackWasHidden&&!moving)paintRack();
  $('station').dataset.phase=moving?'move':'roll';
  $('note').textContent=net?.status||(!lobby&&!busy?moveNotice(s):'');
  if(moving)$('board').setAttribute('aria-description','말을 고른 뒤 금빛 칸을 누르세요.');
  else $('board').removeAttribute('aria-description');
  if(moving){
    $('move-result').textContent=result(s);
    moveControls(s,options);
  }else if(lobby)actions.append(button('대기실 열기','primary',lobbyPanel));
  else if(s.phase==='won')actions.append(button('결과 보기','primary',()=>showResult(true),busy));
  else{
    const disabled=busy||pendingRoom||bot||!!(net&&!net.connected)||!!other||s.phase!=='roll';
    const label=casting?'윷 던지는 중…':busy?'말 이동 중…':bot?'컴퓨터 차례':other?'상대 팀 차례':s.phase==='move'?'말 옮기기':'윷 던지기';
    actions.append(button(label,disabled?'primary':'primary cast-btn',()=>dispatch({type:'roll'}),disabled));
  }
  scheduleComputer();
  if(resumeActionFocus&&!dialog.open){
    const next=actions.querySelector('button:enabled');
    if(next){next.focus({preventScroll:true});resumeActionFocus=false;}
  }
}
function openPanel(title,name){
  cancelTrayDrag();panel=name;board.setMoves([],null);$('dialog-title').textContent=title;body.replaceChildren();if(!dialog.open)dialog.showModal();
}
function closePanel(){if(dialog.open)dialog.close();}
function message(text){const el=element('p',text,'message');el.setAttribute('role','status');return el;}
const eventDescriptions={
  carry:['×2','혼자 도착하면 대기 말 하나를 업어요. 두 말이 함께 움직여요.'],
  back:['−1','왔던 길로 한 칸 물러나요.'],
  home:['⌂','도착한 말과 그 위에 업힌 말이 함께 대기석으로 돌아가요.']
};
function eventPlace(node){
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
  list.append(element('li','윷 던지기를 누르세요.'),element('li','금빛 칸을 누르면 말이 이동해요.'));
  const more=element('details',undefined,'game-details');
  more.append(element('summary','자세한 규칙'),
    element('p','도·개·걸·윷·모는 1~5칸이에요. 다른 말을 쓰려면 판이나 대기석에서 먼저 고르세요. 말은 금빛 칸으로 끌어 놓거나 이동 버튼으로 옮겨도 돼요.'),
    element('p','갈림길에 멈추면 다음에 지름길을 고를 수 있어요. 출발점을 한 칸 지나면 골인이에요.'),
    element('p','같은 팀 말은 업어서 함께 가요. 윷·모가 나오거나 상대 말을 잡으면 한 번 더 던져요.'));
  if(game.eventTiles)more.append(button('이번 판 특수 칸 보기','secondary',showEventGuide));
  body.append(list,message('우리 팀 말을 먼저 모두 골인시키면 이겨요.'),more,button('알겠어요','primary',closePanel));
}
function resetLocal(setup,computer){
  const {count,offset,mode,counts,animals}=setup;
  const bots=computer?Array.from({length:count-1},(_,i)=>i+1):[];
  closePanel();showTable();localRound++;local=newGame(count,offset,mode,counts,bots,animals);void showState(local,false);
  $('actions').querySelector('button')?.focus({preventScroll:true});
}
function modePicker(current,onChange){
  const box=element('div'),label=element('label','놀이 방식'),select=element('select');
  label.htmlFor='game-mode';select.id=label.htmlFor;
  for(const [value,copy] of [['island','장애물 놀이'],['easy','쉬운 놀이']]){
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
  if((!net||net.game)&&game.eventTiles)menu.append(button('특수 칸','secondary',showEventGuide));
  menu.append(button('윷판 돌리기','secondary',()=>{board.rotate(1);closePanel();}));body.append(menu);
  if(net){
    body.append(button('온라인 대기실','secondary',lobbyPanel),
      button('방 나가기','secondary',()=>confirmPanel('온라인 방 나가기',net.isHost?'방장이 나가면 방이 닫혀요.':'현재 방에서 나갈까요?',leaveRoom)));
    return;
  }
  setupControls(body,false);
}
function setupControls(target,entry,kind=local.computerTeams?.length?'computer':'together'){
  const kinds=element('div',undefined,entry?'seg':'play-kinds');kinds.setAttribute('role','group');kinds.setAttribute('aria-label','대결 방식');
  const label=element('label','참가 팀');label.htmlFor='team-count';
  const teamCounts=Array.from({length:TEAMS.length-1},(_,i)=>[i+2,(i+2)+'팀']);
  const teams=setupSelect('team-count',teamCounts,local.pawns.length);
  const mode=modePicker(local.mode??DEFAULT_MODE),numbers=element('div'),settingsRow=element('div',undefined,'settings-row');numbers.append(label,teams);settingsRow.append(numbers,mode.box);
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
    if(kind==='online'){roomSetup=setup;void connect(null);return;}
    const play=()=>resetLocal(setup,kind==='computer');
    if(local.revision&&local.phase!=='won')confirmPanel('새 판을 시작할까요?','진행 중인 한 기기 게임을 끝내고 새 판을 시작해요.',play);else play();
  });
  const join=button('방 코드로 참가',entry?'ge-secondary':'secondary',joinPanel);
  function refresh(){
    for(const item of kinds.children)item.setAttribute('aria-pressed',String(item.dataset.kind===kind));
    start.textContent=kind==='online'?'초대방 만들기':entry?'게임 시작하기':'게임 시작';join.hidden=kind!=='online';
  }
  for(const [value,title,entryTitle] of [['computer','컴퓨터 대결','컴퓨터 대전'],['together','한 기기','같은 기기'],['online','온라인 멀티','온라인 대전']]){
    const item=button(entry?entryTitle:title,entry?'':'secondary',()=>{kind=value;refresh();});item.dataset.kind=value;kinds.append(item);
  }
  const options=element('details',undefined,entry?'ge-more':'game-details');
  options.append(element('summary','팀별 동물·말 수'),roster);
  actions.append(start,join);refresh();target.append(kinds,settingsRow,...(entry?[actions,options]:[options,actions]));
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
  openPanel('온라인 대기실','lobby');
  const capacity=net.setup?.count??TEAMS.length;
  const seat=net.seat<0?'자리 확인 중':TEAMS[net.seat].name+' 팀';
  body.append(message('접속 '+net.seats.length+'/'+capacity+'팀 · 내 자리 '+seat));
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
    const actions=element('div',undefined,'form-actions');
    if(!net.setup)actions.append(button('모인 팀으로 시작','primary',()=>start(false),net.seats.length<2||!net.connected));
    else if(full)actions.append(button('게임 시작','primary',()=>start(false),!net.connected));
    else actions.append(button('빈 '+(capacity-net.seats.length)+'팀은 컴퓨터로 시작','secondary',()=>start(true),!net.connected));
    body.append(actions);
  }else if(net.game)body.append(button('게임 보기','primary',closePanel));
  else body.append(message('방장이 시작하면 게임판이 열려요.'));
  if(net.status)body.append(message(net.status));
  body.append(button('방 나가기','secondary',()=>confirmPanel('방 나가기',net.isHost?'이 방의 게임을 끝낼까요?':'현재 방에서 나갈까요?',leaveRoom)));
}
let lastLobby='';
function networkUpdate(v){
  net=v;
  const signature=JSON.stringify([v.seats,v.status,!!v.game,v.seat,v.connected]);
  if(v.game&&(!shown||!roomGame||v.game.revision!==game.revision)){const first=!roomGame;roomGame=true;showTable();if(first&&panel==='lobby')closePanel();void showState(v.game,!first);}
  if(signature!==lastLobby){lastLobby=signature;if(panel==='lobby'&&dialog.open)lobbyPanel();renderHUD();}
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
  ++attempt;pendingRoom=false;const old=room;room=null;net=null;roomGame=false;lastLobby='';setRoomAddress(null);closePanel();void showState(local,false);renderHUD();
  if(old)await old.close().catch(()=>{});
}
$('settings').onclick=()=>settings();$('team-title').onclick=standings;$('close').onclick=closePanel;
dialog.addEventListener('close',()=>{if(!dialog.open){panel='';renderHUD();}});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();}});
reduced.addEventListener?.('change',()=>{if(reduced.matches&&casting)toss.cancel();});
void showState(local,false);
const invite=new URLSearchParams(location.hash.slice(1));const embedded=document.querySelector('meta[name="yut-invite-room"]')?.content;
showEntry(invite.has('room')||roomCode(embedded)?'online':undefined);
if(invite.has('room'))void connect(invite.get('room'));
else if(roomCode(embedded))void connect(embedded);
