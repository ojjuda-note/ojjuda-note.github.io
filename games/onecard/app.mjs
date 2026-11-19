import {createGame,applyAction,projectState,chooseBotAction,cardInfo} from './engine.mjs?v=20261120-onecard9';
import {createCard,cardLabel} from './cards.mjs?v=20261120-onecard9';
import {createOnecardSound} from './sound.mjs?v=20261120-onecard9';
import {createCardMotion} from './motion.mjs?v=20261120-onecard9';
import {createOnlineClient} from './online.mjs?v=20261120-onecard9';
import {sortHand,handLayout,visibleHandRect} from './hand.mjs?v=20261120-onecard9';
import {createDirectionOrbit} from './orbit.mjs?v=20261120-onecard11';

const $=id=>document.getElementById(id);
const app=$('onecard-app'),hand=$('hand'),handScroll=$('hand-scroll'),sheet=$('sheet'),sound=createOnecardSound();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const motion=createCardMotion({layer:$('motion-layer'),createCard,sound,reduced:()=>reduced.matches});
const orbit=createDirectionOrbit({element:$('direction-orbit'),reduced});
const SUITS={S:['●','파랑'],H:['◆','빨강'],D:['▲','노랑'],C:['■','초록']};
const STORAGE='ojjuda-onecard-solo-v1';
const SORT_STORAGE='ojjuda-onecard-hand-sort-v1';
const RANKING_URL='/features/arcade/monthly-ranking.html?game=onecard';
const botNames=['하루','다온','보리','루아'];
const tableSize=5,opponentCount=4;
let local=null,view=null,mode='solo',net=null,room=null;
let animating=false,working=false,armed=false,botTimer=null,toastTimer=null,epoch=0;
let presentation=Promise.resolve(),lastRoomVersion=-1,lastRoomId='',resultKey='',pendingSuit=null;
let saved=null,sheetKind='',returnFocus=null,autoJoinCode='';
let entryMode='computer',roomUI=null,lastNetworkIssue=null;
let handSort='number',handGesture=null,suppressHandClick=false,handClickTimer=null,presentationId=0;
try{if(localStorage.getItem(SORT_STORAGE)==='color')handSort='color';}catch{}
const cardNodes=new Map(),seatNodes=new Map();
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function button(text,cls,fn){const e=element('button',text,cls);e.type='button';e.onclick=fn;return e;}
function resultName(player){return player.bot&&!/^컴퓨터(?:\s|$)/.test(player.name)?`${player.name} · 컴퓨터`:player.name;}
function me(){return view?.players.find(p=>p.id===(mode==='online'?room?.myId:'me'));}
function myId(){return mode==='online'?room?.myId:'me';}
function computerGame(){return mode==='solo'||room?.mode==='solo';}
function myTurn(){return !!(view?.status==='playing'&&view.players[view.turn]?.id===myId()&&me()?.active!==false);}
function locked(){return animating||working||!!net?.busy||sheet.open;}
function setText(id,text){if($(id).textContent!==text)$(id).textContent=text;}
function showToast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2700);}
function announce(text){setText('status',text);}
function saveLocal(){if(!local)return;try{localStorage.setItem(STORAGE,JSON.stringify({state:local,opponents:opponentCount}));saved={state:local,opponents:opponentCount};}catch{/* A full storage quota does not interrupt a game. */}}
function loadLocal(){try{const data=JSON.parse(localStorage.getItem(STORAGE)||'null');if(data?.state?.status==='playing'&&data.state.players?.some(p=>p.id==='me')&&data.state.players.length===tableSize&&data.state.players.filter(p=>p.bot).length===opponentCount){data.state.direction=data.state.direction===-1?-1:1;projectState(data.state,'me');return data;}}catch{}return null;}

function renderSound(){const enabled=sound.enabled;$('sound-toggle').setAttribute('aria-pressed',String(enabled));$('sound-toggle').setAttribute('aria-label',enabled?'효과음 끄기':'효과음 켜기');$('sound-toggle').classList.toggle('is-muted',!enabled);}
renderSound();
document.addEventListener('pointerdown',()=>{void sound.unlock();},{capture:true});
document.addEventListener('keydown',()=>{void sound.unlock();},{capture:true});
$('sound-toggle').onclick=()=>{sound.setEnabled(!sound.enabled);renderSound();};
$('stock-card').append(createCard(null,{faceDown:true}));
function setScreen(name){
  app.dataset.view=name;$('entry').hidden=name!=='welcome';$('lobby').hidden=name!=='lobby';
  $('setup').hidden=name==='playing';app.hidden=name!=='playing';document.body.dataset.mpEntry=String(name!=='playing');
  if(name!=='welcome')disposeRooms();
  for(const id of ['game-table','hand-area','game-controls'])$(id).inert=name!=='playing';
  if(name!=='playing'){clearTimeout(botTimer);$('turn-timer').hidden=true;}
  renderOrbit();
}
function renderOrbit(){orbit.update({direction:view?.direction,active:app.dataset.view==='playing'&&view?.status==='playing',paused:sheet.open});}
function seatPosition(index,total){if(total===1)return 'top';if(total===2)return ['top-left','top-right'][index];if(total===3)return ['left','top','right'][index];return ['left','top-left','top-right','right'][index];}
function visiblePlayers(){if(!view)return[];const start=view.players.findIndex(p=>p.id===myId()),list=[];for(let i=1;i<view.players.length;i++)list.push(view.players[(Math.max(start,0)+i)%view.players.length]);return list;}
function renderSeats(){
  const opponents=visiblePlayers(),ids=new Set(opponents.map(p=>p.id));
  for(const [id,node] of seatNodes)if(!ids.has(id)){node.remove();seatNodes.delete(id);}
  opponents.forEach((p,i)=>{
    let node=seatNodes.get(p.id);
    if(!node){node=element('div',undefined,'seat');node.dataset.player=p.id;const avatar=element('span',p.name.slice(0,1),'avatar');avatar.setAttribute('aria-hidden','true');node.append(avatar,element('span',p.name,'seat-name'),element('span','','seat-count'));const fan=element('div',undefined,'seat-fan');fan.setAttribute('aria-hidden','true');for(let j=0;j<3;j++)fan.append(createCard(null,{faceDown:true,small:true}));node.append(fan);$('opponents').append(node);seatNodes.set(p.id,node);}
    node.dataset.position=seatPosition(i,opponents.length);node.style.setProperty('--seat-index',String(i));
    node.querySelector('.seat-name').textContent=p.bot?`${p.name} · AI`:p.name;
    node.classList.toggle('is-bot',!!p.bot);node.querySelector('.avatar').textContent=p.bot?'AI':p.name.slice(0,1);
    node.classList.toggle('is-current',view.status==='playing'&&view.players[view.turn]?.id===p.id);
    node.classList.toggle('is-inactive',p.active===false);
    node.classList.toggle('has-one',p.handCount===1&&p.active!==false);
    setSeatCount(p.id,p.handCount??p.hand?.length??0);
    if(p.active===false)node.querySelector('.seat-count').textContent=p.eliminatedReason==='too-many-cards'?'탈락':'나감';
    node.setAttribute('aria-label',`${p.name}${p.bot?', 컴퓨터':''}, ${p.active===false?'참여 종료':`${p.handCount}장`}${view.players[view.turn]?.id===p.id?', 현재 차례':''}`);
  });
}
function setSeatCount(id,count){if(id===myId()){setText('my-count',`${count}장`);return;}const node=seatNodes.get(id);if(!node)return;node.querySelector('.seat-count').textContent=count===1?'원카드 · 1장':`${count}장`;node.querySelector('.seat-fan').style.opacity=count? '1':'0';}
function resetHand(){
  if(handGesture)finishHandGesture({pointerId:handGesture.id,type:'pointercancel'});
  hand.replaceChildren();cardNodes.clear();handScroll.scrollLeft=0;hand.style.width='';clearTimeout(handClickTimer);suppressHandClick=false;handScroll.classList.remove('is-dragging','is-motion-locked');
}
function renderDiscard(cardId){
  const discard=$('discard-card');
  if(!cardId){discard.replaceChildren();delete discard.dataset.card;}
  else if(discard.dataset.card!==cardId||!discard.firstElementChild){discard.replaceChildren(createCard(cardId));discard.dataset.card=cardId;}
  discard.style.visibility='';
}
function renderSort(){
  for(const [id,value] of [['sort-number','number'],['sort-color','color']]){const node=$(id);node.setAttribute('aria-pressed',String(handSort===value));node.disabled=locked();}
}
function renderHand(){
  const player=me(),cards=sortHand(player?.hand||[],handSort),keep=new Set(cards),scrollLeft=handScroll.scrollLeft,focused=document.activeElement;
  for(const [id,node] of cardNodes)if(!keep.has(id)){node.remove();cardNodes.delete(id);}
  const width=handScroll.clientWidth||app.clientWidth,cardWidth=parseFloat(getComputedStyle(app).getPropertyValue('--card-w'))||(width<430?66:78);
  const layout=handLayout(cards.length,width,cardWidth);hand.style.width=`${layout.width}px`;
  handScroll.classList.toggle('is-scrollable',layout.width>width+1);handScroll.tabIndex=layout.width>width+1?0:-1;
  cards.forEach((id,index)=>{
    let node=cardNodes.get(id);if(!node){node=createCard(id,{interactive:true,label:cardLabel(id)});node.classList.add('hand-card');node.dataset.card=id;node.onclick=()=>void playCard(id);cardNodes.set(id,node);}
    if(hand.children[index]!==node)hand.insertBefore(node,hand.children[index]||null);
    const relative=index-(cards.length-1)/2;
    node.style.setProperty('--x',`${relative*layout.step}px`);node.style.setProperty('--y','12px');node.style.setProperty('--angle','0deg');node.style.zIndex=String(index+1);
    const legal=view?.legalCardIds?.includes(id)===true;
    node.classList.toggle('is-playable',legal&&myTurn());node.classList.toggle('is-unplayable',myTurn()&&!legal);
    node.disabled=locked()||!myTurn()||!legal;
    node.setAttribute('aria-label',`${cardLabel(id)}${legal&&myTurn()?', 낼 수 있어요':''}`);
  });
  if(focused?.isConnected&&hand.contains(focused)&&document.activeElement!==focused)focused.focus({preventScroll:true});
  handScroll.scrollLeft=Math.max(0,Math.min(scrollLeft,layout.width-width));renderSort();
  setText('my-name',player?.name||'나');setText('my-count',`${cards.length}장`);
}
function renderBoard({deferDiscard=false}={}){
  if(!view)return;renderSeats();renderHand();
  if(!deferDiscard)renderDiscard(view.topCard);
  setText('deck-count',String(view.deckCount));
  const suit=SUITS[view.currentSuit];$('suit-indicator').hidden=!suit;
  if(suit){setText('suit-indicator',`${suit[0]} ${suit[1]}`);$('suit-indicator').dataset.suit=view.currentSuit;}
  setText('direction',view.direction===-1?'↺ 반시계 방향':'↻ 시계 방향');
  setText('game-record-mode',mode==='online'?'연승 기록 경기':'연습 · 순위 제외');
  renderControls();
}
function hint(){
  if(!view)return '같은 색이나 숫자를 내면 돼요.';
  if(me()?.active===false)return me()?.eliminatedReason==='too-many-cards'?'20장이 되어 이번 판은 관전해요.':'남은 사람들의 게임을 보고 있어요.';
  if(view.status==='finished')return '한 판 더, 가볍게 즐겨요.';
  if(animating)return '카드를 놓고 있어요.';
  if(myTurn()){
    if(view.pendingDraw)return `공격 카드로 넘기거나 ${view.pendingDraw}장 받으세요.`;
    if(me()?.hand?.length===2&&!me()?.calledOne&&!armed)return '한 장을 남기기 전, 원카드!를 눌러 주세요.';
    if(!view.legalCardIds?.length)return '낼 카드가 없어요. 한 장 가져오세요.';
    return '밝게 표시된 카드 중 한 장을 누르세요.';
  }
  return '내 차례를 기다려 주세요.';
}
function renderControls(){
  $('solo-mode').disabled=working||!!net?.busy;$('online-open').disabled=working||!!net?.busy;
  for(const id of ['solo-start','resume-solo','practice-start'])$(id).disabled=working||!!net?.busy;
  handScroll.classList.toggle('is-motion-locked',animating);
  if(animating&&handGesture)finishHandGesture({pointerId:handGesture.id,type:'pointercancel'});
  const playing=view?.status==='playing',can=myTurn()&&!locked();
  $('draw-button').disabled=!can;$('draw-pile').disabled=!can;
  const drawText=view?.pendingDraw?`${view.pendingDraw}장 받기`:'한 장 받기';
  setText('draw-button',drawText);$('draw-pile').setAttribute('aria-label',drawText);
  const player=me(),n=player?.hand?.length||0;
  const canCall=playing&&player?.active!==false&&((n===2&&myTurn())||(n===1&&!player?.calledOne));
  $('onecard-button').disabled=!canCall||locked();$('onecard-button').classList.toggle('is-ready',canCall);
  $('onecard-button').setAttribute('aria-pressed',String(armed||!!player?.calledOne));
  setText('onecard-button',armed||player?.calledOne?'외쳤어요!':'원카드!');
  const turn=playing?(animating?'카드 이동 중':myTurn()?'내 차례':`${view.players[view.turn]?.name||'상대'} 차례`):'게임 종료';
  setText('turn-label',turn);$('turn-label').classList.toggle('is-mine',myTurn());
  app.classList.toggle('my-turn',myTurn()&&!animating);
  for(const [id,node] of cardNodes)node.disabled=!can||!view?.legalCardIds?.includes(id);
  renderSort();
  if(!working)announce(hint());
  updateTimer();
  renderOrbit();
}
function rectOf(node){return node?.getBoundingClientRect();}
function handCardRect(node){return visibleHandRect(rectOf(node),rectOf(handScroll));}
function opponentRect(node){const fan=rectOf(node?.querySelector('.seat-fan'));return fan?.width&&fan?.height?fan:rectOf(node?.querySelector('.avatar'))||rectOf(node);}
function rectForPlayer(id){return id===myId()?rectOf(handScroll):opponentRect(seatNodes.get(id));}
function gameMessage(events){
  const event=events?.findLast(e=>['attack','skip','reverse','again','onecard','eliminate'].includes(e.type));
  if(!event)return;
  const name=view?.players.find(p=>p.id===event.playerId)?.name||'상대';
  const messages={attack:`${name} · 공격 +${event.count}`,skip:'다음 차례를 건너뛰어요',reverse:`${name} · ${event.direction===-1?'반시계':'시계'} 방향으로 바꿨어요`,again:`${name} · 한 번 더`,onecard:`${name} · 원카드!`,eliminate:`${name} · 20장으로 탈락`};
  showToast(messages[event.type]);if(event.type==='onecard')sound.play('onecard');
}
async function present(next,{deal=false,animate=true}={}){
  const generation=epoch,sequence=++presentationId,previous=view,isCurrent=()=>generation===epoch&&sequence===presentationId;
  const events=next.lastEvents||[],plays=events.filter(event=>event.type==='play');
  const continuous=!!previous&&next.revision===previous.revision+1&&plays.length<=1;
  const movingDiscard=animate&&(deal||(continuous&&plays.length===1&&plays[0].cardId===next.topCard));
  const oldRects=new Map([...cardNodes].map(([id,node])=>[id,{rect:handCardRect(node),angle:parseFloat(node.style.getPropertyValue('--angle'))||0,width:node.offsetWidth}]));
  const oldSeats=new Map([...seatNodes].map(([id,node])=>[id,opponentRect(node)]));
  const fromStock=rectOf($('stock-card').firstElementChild);
  animating=true;view=next;if((me()?.hand?.length||0)!==2)armed=false;renderBoard({deferDiscard:movingDiscard});
  const toDiscard=rectOf($('discard-card').firstElementChild)||rectOf($('discard-card'));
  const discardScale=($('discard-card').offsetWidth||parseFloat(getComputedStyle(app).getPropertyValue('--card-w'))||78)/78;
  const newRects=new Map([...cardNodes].map(([id,node])=>[id,{rect:handCardRect(node),width:node.offsetWidth,angle:parseFloat(node.style.getPropertyValue('--angle'))||0}]));
  const flights=[],counts=new Map();let delay=0;
  const privateHand=new Set(me()?.hand||[]),reveal=new Set();
  const flightTarget=(id,cardId)=>newRects.get(cardId)?.rect||rectForPlayer(id);
  const landDiscard=()=>{if(isCurrent())renderDiscard(view?.topCard);};
  function arrive(id,cardId,count){return()=>{if(!isCurrent())return;if(cardId&&cardNodes.has(cardId))cardNodes.get(cardId).style.opacity='';if(count!==undefined)setSeatCount(id,count);};}
  if(animate&&deal){
    announce('카드를 나누고 있어요.');
    for(const p of next.players){counts.set(p.id,0);setSeatCount(p.id,0);}
    for(const node of cardNodes.values()){node.style.opacity='0';reveal.add(node);}
    for(const event of events.filter(e=>e.type==='deal')){
      const count=(counts.get(event.playerId)||0)+1;counts.set(event.playerId,count);
      const target=newRects.get(event.cardId),own=event.playerId===myId();
      flights.push({from:fromStock,to:flightTarget(event.playerId,event.cardId),cardId:own?event.cardId:null,faceDown:true,reveal:own,toAngle:target?.angle||0,toScale:target?target.width/78:.48,delay,duration:390,onLand:arrive(event.playerId,event.cardId,count)});delay+=62;
    }
    flights.push({from:fromStock,to:toDiscard,cardId:next.topCard,faceDown:true,reveal:true,toAngle:6,toScale:discardScale,delay,duration:390,onLand:landDiscard,sound:'play'});
  }else if(animate&&continuous){
    for(const event of events){
      if(event.type==='play'&&movingDiscard){
        const own=event.playerId===myId(),old=oldRects.get(event.cardId);
        flights.push({from:own?old?.rect||rectOf(handScroll):oldSeats.get(event.playerId),to:toDiscard,cardId:event.cardId,faceDown:!own,reveal:!own,fromAngle:old?.angle||0,fromScale:own&&old?old.width/78:.48,toAngle:6,toScale:discardScale,delay,duration:360,sound:'play',onLand:landDiscard});delay+=130;
      }
      if(event.type==='draw'){
        const own=event.playerId===myId(),cards=event.cardIds||[];
        for(let i=0;i<event.count;i++){
          const id=cards[i],node=cardNodes.get(id),target=newRects.get(id);
          if(node&&privateHand.has(id)){node.style.opacity='0';reveal.add(node);}
          flights.push({from:fromStock,to:flightTarget(event.playerId,id),cardId:own?id:null,faceDown:true,reveal:own,toAngle:target?.angle||0,toScale:target?target.width/78:.48,delay,duration:350,sound:'draw',onLand:arrive(event.playerId,id)});delay+=56;
        }
      }
    }
  }
  // Old top stays underneath the flight. A skipped revision renders its latest top directly.
  try{await motion.run(flights);}catch{if(isCurrent())motion.cancel();}finally{
    if(!isCurrent())return;
    for(const node of reveal)node.style.opacity='';landDiscard();
    animating=false;renderBoard();
  }
  if(!isCurrent())return;
  if(!deal)gameMessage(events);
  if(view.status==='finished'){showResult();return;}
  if(myTurn()&&previous?.players[previous.turn]?.id!==myId())sound.play('turn');
  scheduleBot();
}
function scheduleBot(){
  clearTimeout(botTimer);
  if(mode!=='solo'||!local||local.status!=='playing'||animating||working||sheet.open||document.hidden||app.dataset.view!=='playing')return;
  const actor=local.players[local.turn];if(!actor?.bot)return;
  botTimer=setTimeout(()=>{if(mode!=='solo'||sheet.open||document.hidden)return;void dispatch(chooseBotAction(local,actor.id),actor.id);},720);
}
async function dispatch(command,actor=myId()){
  if(working||animating||!view||view.status!=='playing')return false;
  working=true;renderControls();
  try{
    if(mode==='online'){const ok=await net.move(command);await presentation;return ok;}
    local=applyAction(local,actor,command);saveLocal();await present(projectState(local,'me'));return true;
  }catch(error){showToast(({not_your_turn:'내 차례를 기다려 주세요.',invalid_card:'같은 색이나 숫자를 골라 주세요.',invalid_move:'지금 낼 수 있는 카드를 골라 주세요.'})[error.code]||'지금 가능한 동작을 다시 골라 주세요.');return false;}
  finally{working=false;renderControls();scheduleBot();}
}
async function playCard(id){
  if(!myTurn()||locked()||!view.legalCardIds?.includes(id))return;
  const info=cardInfo(id);if(info.rank==='7'||id.startsWith('X-')){chooseSuit(id);return;}
  await dispatch({type:'play',cardId:id,declare:armed});armed=false;
}
function chooseSuit(cardId){
  pendingSuit=cardId;openSheet('색을 골라 주세요','suit');
  const choices=element('div',undefined,'suit-choices');
  for(const [suit,[mark,name]] of Object.entries(SUITS)){
    const b=button('',`suit-choice suit-${suit}`,()=>{const id=pendingSuit;pendingSuit=null;closeSheet();void dispatch({type:'play',cardId:id,suit,declare:armed});armed=false;});
    b.append(element('span',mark,'suit-symbol'),element('span',name));b.setAttribute('aria-label',name);choices.append(b);
  }
  $('sheet-body').append(choices);choices.querySelector('button').focus();
}
$('draw-button').onclick=$('draw-pile').onclick=()=>{if(myTurn()&&!locked())void dispatch({type:'draw'});};
$('onecard-button').onclick=()=>{
  if(locked())return;
  if(me()?.hand?.length===2){armed=!armed;sound.play('onecard');renderControls();announce(armed?'원카드! 이제 카드를 내세요.':hint());}
  else if(me()?.hand?.length===1)void dispatch({type:'declare'});
};
for(const [id,value] of [['sort-number','number'],['sort-color','color']])$(id).onclick=()=>{
  if(locked())return;handSort=value;try{localStorage.setItem(SORT_STORAGE,value);}catch{}renderHand();
};

// Touch keeps native scrolling and inertia. Mouse/pen drags move only this viewport.
handScroll.addEventListener('pointerdown',event=>{
  if(animating){event.preventDefault();return;}
  if(event.isPrimary===false||event.button!==0)return;
  clearTimeout(handClickTimer);suppressHandClick=false;handGesture={id:event.pointerId,type:event.pointerType,x:event.clientX,y:event.clientY,left:handScroll.scrollLeft,dragged:false};
});
handScroll.addEventListener('pointermove',event=>{
  if(animating)return;
  const gesture=handGesture;if(!gesture||gesture.id!==event.pointerId)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  if(!gesture.dragged&&Math.hypot(dx,dy)>8){
    gesture.dragged=true;suppressHandClick=true;
    if(gesture.type!=='touch'){handScroll.classList.add('is-dragging');try{handScroll.setPointerCapture(event.pointerId);}catch{}}
  }
  if(gesture.dragged&&gesture.type!=='touch'){event.preventDefault();handScroll.scrollLeft=gesture.left-dx;}
});
function finishHandGesture(event){
  const gesture=handGesture;if(!gesture||gesture.id!==event.pointerId)return;
  if(gesture.dragged||(event.type==='pointercancel'&&gesture.type==='touch'))suppressHandClick=true;
  if(suppressHandClick){clearTimeout(handClickTimer);handClickTimer=setTimeout(()=>{suppressHandClick=false;},450);}
  handGesture=null;handScroll.classList.remove('is-dragging');
  try{if(handScroll.hasPointerCapture(event.pointerId))handScroll.releasePointerCapture(event.pointerId);}catch{}
}
handScroll.addEventListener('pointerup',finishHandGesture);handScroll.addEventListener('pointercancel',finishHandGesture);handScroll.addEventListener('lostpointercapture',finishHandGesture);
handScroll.addEventListener('click',event=>{if(suppressHandClick){suppressHandClick=false;event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
handScroll.addEventListener('keydown',event=>{
  if(animating){if(['ArrowLeft','ArrowRight','Home','End',' '].includes(event.key))event.preventDefault();return;}
  if(event.key==='Enter'||event.key===' ')suppressHandClick=false;
  if(event.target!==handScroll||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const end=Math.max(0,handScroll.scrollWidth-handScroll.clientWidth);
  handScroll.scrollLeft=event.key==='Home'?0:event.key==='End'?end:Math.max(0,Math.min(end,handScroll.scrollLeft+(event.key==='ArrowLeft'?-100:100)));
});

async function startPractice(resume=false){
  epoch++;motion.cancel();closeSheet();clearTimeout(botTimer);net?.close();net=null;room=null;lastRoomVersion=-1;lastRoomId='';
  mode='solo';view=null;resultKey='';armed=false;working=false;animating=false;resetHand();renderDiscard(null);
  if(resume&&saved){local={...saved.state,direction:saved.state.direction===-1?-1:1};}
  else{
    const players=[{id:'me',name:'나'},...botNames.map((name,i)=>({id:`bot-${i}`,name,bot:true}))];
    for(let i=players.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[players[i],players[j]]=[players[j],players[i]];}
    local=createGame({players,startIndex:0});
  }
  $('connection').hidden=true;setScreen('playing');saveLocal();await present(projectState(local,'me'),{deal:!resume,animate:!resume});
}
async function startSolo(resume=false,rematch=false){
  if(working||net?.busy)return;
  if(resume){await startPractice(true);return;}
  working=true;lastNetworkIssue=null;closeSheet();disposeRooms();
  $('practice-start').hidden=true;setText('solo-ranking-note','로그인을 확인하고 있어요.');renderControls();
  const client=ensureNetwork();
  try{
    // Wait for the real session check; a slow login must never become practice.
    const current=await client.enter();
    if(net!==client)return;
    if(current&&current.mode!=='solo'){showToast('참여 중인 대전방으로 돌아왔어요.');return;}
    if(current?.status==='active'){showToast('하던 컴퓨터 대전을 이어해요.');return;}
    if(current?.status==='finished'&&!rematch){await presentation;return;}
    if(!current&&!await client.create({mode:'solo'}))return;
    if(net===client&&room?.mode==='solo')await client.start();
    await presentation;
  }catch(error){
    if(net!==client)return;
    if(error?.code==='not_signed_in'&&!client.userId){await startPractice();return;}
    networkError(error);
    if(error?.code==='unavailable'){
      setText('solo-ranking-note','로그인을 확인하지 못했어요. 다시 시도하거나 연습으로 시작해 주세요.');
      $('practice-start').hidden=false;
    }
  }finally{working=false;renderControls();scheduleBot();}
}
$('solo-start').onclick=()=>{if(!working)void startSolo();};$('resume-solo').onclick=()=>{if(!working)void startSolo(true);};
$('practice-start').onclick=()=>{if(!working&&!net?.busy&&!room)void startPractice();};

function openSheet(title,kind='menu'){
  clearTimeout(botTimer);returnFocus=document.activeElement;sheetKind=kind;sheet.classList.toggle('game-result-dialog',kind==='result');sheet.setAttribute('aria-labelledby',kind==='result'?'onecard-result-title':'sheet-title');setText('sheet-title',title);$('sheet-body').replaceChildren();
  if(!sheet.open)sheet.showModal();renderControls();
}
function finishSheetClose(){
  // Native close events are queued: an earlier close must not touch a reopened sheet.
  if(sheet.open)return;
  pendingSuit=null;sheetKind='';renderControls();scheduleBot();
  const focus=returnFocus;returnFocus=null;
  if(focus?.isConnected&&!focus.disabled)focus.focus({preventScroll:true});
}
function closeSheet(){if(sheet.open)sheet.close();finishSheetClose();}
$('sheet-close').onclick=closeSheet;
sheet.addEventListener('click',event=>{if(event.target.closest('[data-act="close"]'))closeSheet();});
sheet.addEventListener('cancel',event=>{event.preventDefault();closeSheet();});
sheet.addEventListener('close',finishSheetClose);
function showRules(){
  openSheet('원카드, 이렇게 해요','rules');
  const lead=element('p','같은 색이나 숫자를 한 장씩 내고, 손의 카드를 먼저 없애면 이겨요.','rules-lead');
  const list=element('div',undefined,'rules-list');
  const rules=[['5인 플레이','항상 5명, 빈자리는 컴퓨터가 함께해요. 각자 7장으로 시작해요.'],['내 차례','같은 색이나 같은 숫자·기호를 한 장 내세요. 낼 카드가 없으면 1장 받고 넘겨요.'],['숫자 카드','네 가지 색의 1~7 카드예요. 색 옆의 도형으로도 구별할 수 있어요.'],['+2 · +3','다음 사람이 표시된 수만큼 카드를 받아요.'],['전체 색 +5 · +7','어떤 색에도 내고, 다음 색을 골라요. 다음 사람은 5장 · 7장을 받아요.'],['공격이 오면','마지막 공격 카드와 같거나 더 큰 + 카드만 이어 낼 수 있어요. 없으면 쌓인 장수만큼 받아요.'],['색 바꾸기','내고 나면 다음 색을 골라요.'],['건너뛰기 · 한 번 더','다음 사람을 건너뛰어요 · 내 차례를 한 번 더 해요.'],['방향 바꾸기','색깔마다 2장씩, 모두 8장이에요. 진행 방향을 반대로 바꾸고, 두 명이 남아도 상대에게 넘겨요.'],['원카드!','2장일 때 먼저 누르거나, 1장이 된 직후 눌러요. 다음 사람이 행동할 때까지 안 누르면 2장을 받아요.'],['진행','처음은 시계 방향이에요. 다음 판에는 자리를 다시 섞어요. 20장 이상이면 탈락해요.'],['연승 기록 경기','로그인한 컴퓨터·온라인 대전은 30초 안에 내거나 받아요. 시간이 지나면 자동으로 받아요.'],['게임 순위','로그인한 경기의 승리마다 연승이 늘어요. 패배·무승부는 현재 연승이 0이 되고, 이번 달 최고 연승은 남아요. 연습과 중도 나간 판은 제외해요.']];
  for(const [label,text] of rules){const row=element('div',undefined,'rule-row');row.append(element('strong',label),element('span',text));list.append(row);}
  $('sheet-body').append(lead,list);$('sheet-body').append(element('p','새 판은 전용 카드 58장으로 즐겨요. 방향 바꾸기는 8장이에요.','small-note'),rankingLink());
}
for(const id of ['rules-button','entry-rules'])$(id).onclick=showRules;
$('menu-button').onclick=()=>{
  openSheet(mode==='online'?'게임 메뉴':'잠깐 쉬어가기');const body=$('sheet-body');
  if(mode==='online'&&room?.status==='active')body.append(element('p','연승 기록 경기는 메뉴를 열어도 계속돼요.','small-note'));
  body.append(button('게임 방법','btn btn-secondary',showRules));
  if(app.dataset.view==='playing'){
    body.append(button(computerGame()?'새 게임':'방 나가기','btn btn-secondary',()=>confirmExit(false)));
    body.append(button('계속하기','btn btn-primary',closeSheet));
  }else body.append(button('닫기','btn btn-primary',closeSheet));
};
function confirmExit(toArcade){
  if(app.dataset.view!=='playing'&&(!room||room.status==='finished')){void exit(toArcade);return;}
  openSheet(toArcade?'오락실로 돌아갈까요?':'첫 화면으로 갈까요?','exit');
  $('sheet-body').append(element('p',mode==='online'?(room?.status==='active'?(computerGame()?'이번 판은 끝나고 연승에 기록되지 않아요.':'내 자리는 컴퓨터가 이어서 해요. 이 판은 내 연승에 기록되지 않아요.'):'이 대전방에서 나가요.'): '혼자 하던 연습은 이어서 할 수 있어요.'));
  const row=element('div',undefined,'dialog-actions');row.append(button('계속하기','btn btn-secondary',closeSheet),button(toArcade?'오락실로':'나가기','btn btn-primary',()=>void exit(toArcade)));$('sheet-body').append(row);
}
async function exit(toArcade){
  if(working||net?.busy)return;working=true;renderControls();
  try{if(mode==='online'&&room){const ok=await net.leave();if(!ok)return;}epoch++;motion.cancel();clearTimeout(botTimer);disposeRooms();net?.close();net=null;room=null;view=null;local=null;mode='solo';lastRoomId='';lastRoomVersion=-1;resetHand();renderDiscard(null);closeSheet();saved=loadLocal();$('resume-solo').hidden=!saved;setScreen('welcome');selectEntryMode('computer');if(toArcade)location.assign('/world.html?tab=arcade');}
  finally{working=false;animating=false;renderControls();}
}
$('arcade-back').onclick=e=>{if(app.dataset.view==='playing'||room){e.preventDefault();confirmExit(true);}};
$('entry-arcade-back').onclick=e=>{if(room){e.preventDefault();confirmExit(true);}};
function resultIcon(outcome){
  // The same vector artwork and classes used by the arcade's shared result cards.
  const paths=outcome==='success'
    ? '<path d="M17 8h30v13c0 11-7 18-15 18S17 32 17 21V8Z"/><path d="M17 12H9v7c0 7 4 12 12 12m26-19h8v7c0 7-4 12-12 12M32 39v12m-10 4h20"/><path class="game-result-icon-star" d="m32 14 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>'
    : outcome==='failure'
      ? '<circle cx="32" cy="30" r="22"/><path d="m18 24 7 3m14 0 7-3m-23 17c4-5 14-5 18 0M22 33v2m20-2v2"/><path class="game-result-icon-tear" d="M46 34c0 0-4 6-4 9a4 4 0 0 0 8 0c0-3-4-9-4-9Z"/>'
      : '<circle cx="32" cy="31" r="22"/><path d="m22 31 7 7 14-16"/>';
  const icon=element('div',undefined,'game-result-icon');
  icon.innerHTML='<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
  return icon;
}
function showResult(){
  const key=`${mode}:${room?.id||'local'}:${room?.round||0}:${view.revision}`;if(resultKey===key)return;resultKey=key;
  const win=view.winnerId===myId(),winner=view.players.find(p=>p.id===view.winnerId);
  const title=win?'승리!':winner?'게임 종료':'무승부',outcome=win?'success':winner?'failure':'draw';
  if(win)sound.play('win');openSheet(title,'result');
  const card=element('section',undefined,'game-result-card'),content=element('div',undefined,'game-result-content');
  card.dataset.resultOutcome=outcome;card.setAttribute('role','group');card.setAttribute('aria-labelledby','onecard-result-title');
  const heading=element('h2',title,'game-result-title');heading.id='onecard-result-title';
  const metric=winner?`${resultName(winner)} 승리`:'남은 카드 수로 마쳤어요.';
  const record=element('p',undefined,'game-result-encouragement');record.id='onecard-ranking-record';
  const ranking=mode==='online'?room?.ranking:null;
  record.append(document.createTextNode(ranking?.recorded?`현재 ${ranking.currentStreak}연승 · 이번 달 최고 ${ranking.bestStreak}연승\n저장 완료 · `:mode==='solo'?'연습 결과 · 순위 제외\n':'이번 판은 순위에 포함되지 않아요.\n'),rankingLink());
  content.append(resultIcon(outcome),heading,element('div',metric,'game-result-metric'),record);
  const actions=element('div',undefined,'game-result-actions');
  actions.append(button(computerGame()?'다시 한 판':'대기실로','',computerGame()?()=>void startSolo(false,true):()=>{closeSheet();setScreen('lobby');renderLobby();}),button('게임판 보기','',closeSheet),button('오락실로','',()=>void exit(true)));
  content.append(actions);
  const extra=element('div',undefined,'game-result-extra'),scores=element('div',undefined,'result-players');
  for(const p of view.players){const row=element('div');row.append(element('span',resultName(p)),element('strong',p.active===false?'탈락':`${p.handCount??p.hand?.length??0}장`));scores.append(row);}
  extra.append(scores);content.append(extra);card.append(content);$('sheet-body').append(card);actions.querySelector('button').focus();
}
function rankingLink(){const link=element('a','월간 순위 보기');link.href=RANKING_URL;link.target='_blank';link.rel='noopener';return link;}

function connection(message){$('connection').textContent=message||'';$('connection').hidden=!message;}
function networkError(error){
  lastNetworkIssue=error;
  const text=error?.message||'연결을 확인한 뒤 다시 눌러 주세요.';
  if(app.dataset.view==='lobby'){$('lobby-error').textContent=text;$('lobby-error').hidden=false;}
  else if(app.dataset.view==='welcome')$(entryMode==='computer'?'solo-ranking-note':'online-account-note').textContent=text;
  else showToast(text);
  if(['not_signed_in','sign_in','auth_required'].includes(error?.code))$('login-link').hidden=false;
}
function ensureNetwork(){
  if(net)return net;
  net=createOnlineClient({onRoom:receiveRoom,onError:networkError,onConnection:connection});return net;
}
function receiveRoom(next){
  const previous=room;room=next;
  if(!next){
    lastRoomId='';lastRoomVersion=-1;
    if(mode==='online'){
      epoch++;motion.cancel();view=null;animating=false;resetHand();renderDiscard(null);
      closeSheet();$('sheet-body').replaceChildren();resultKey='';setScreen('welcome');selectEntryMode(previous?.mode==='solo'?'computer':'opponent');
      queueMicrotask(()=>{if(mode==='online'&&!room&&entryMode==='opponent'&&app.dataset.view==='welcome')mountRooms();});
    }
    renderLobby();return;
  }
  mode='online';$('login-link').hidden=true;$('lobby-error').hidden=true;
  if(next.status==='waiting'){
    if(sheetKind==='arcade-room')closeSheet();
    if(next.mode==='solo'){setScreen('welcome');selectEntryMode('computer');setText('solo-ranking-note','컴퓨터 대전을 준비했어요. 혼자 하기를 누르면 시작해요.');}
    else{setScreen('lobby');renderLobby();}
    return;
  }
  if(!next.game)return;
  if(next.id===lastRoomId&&next.version<=lastRoomVersion){updateTimer();return;}
  const newRoom=next.id!==lastRoomId,roundChanged=!!previous&&previous.id===next.id&&previous.round!==next.round;
  const first=!view||mode!=='online'||newRoom||roundChanged;
  const started=next.game.lastEvents?.some(e=>e.type==='deal')===true&&(previous?.status==='waiting'||first);
  lastRoomId=next.id;lastRoomVersion=next.version;setScreen('playing');
  if(newRoom||roundChanged){epoch++;motion.cancel();view=null;resultKey='';animating=false;resetHand();renderDiscard(null);presentation=Promise.resolve();closeSheet();}
  else if(sheetKind==='suit'&&(next.game.players[next.game.turn]?.id!==next.myId||!next.game.legalCardIds?.includes(pendingSuit)))closeSheet();
  const thisEpoch=epoch;
  presentation=presentation.then(async()=>{if(epoch!==thisEpoch)return;await present(next.game,{deal:started,animate:started||!first});}).catch(()=>{if(epoch===thisEpoch){animating=false;view=next.game;renderBoard();connection('화면을 다시 맞췄어요. 계속할 수 있어요.');}});
}
async function onlineAction(fn){
  if(working||net?.busy)return false;working=true;lastNetworkIssue=null;$('lobby-error').hidden=true;renderLobby();renderControls();
  try{return await fn();}catch(error){networkError(error);return false;}finally{working=false;renderLobby();renderControls();}
}
async function openOnline(code=''){
  clearTimeout(botTimer);mode='online';view=null;local=null;resetHand();renderDiscard(null);setScreen('welcome');selectEntryMode('opponent');
  $('online-account-note').textContent='방을 만들거나 열린 대전방에 참여하세요. 빈자리는 컴퓨터가 채워요.';
  const client=ensureNetwork();
  await onlineAction(async()=>{
    // A prepared or completed private table has no multiplayer lobby to reopen.
    if(room?.mode==='solo'&&room.status!=='active'&&!await client.leave())return false;
    const current=await client.enter();
    if(code&&!current)return client.join(code);
    if(code&&current&&current.code!==code)showToast('참여 중인 방으로 돌아왔어요. 나간 뒤 다른 방에 참여할 수 있어요.');
    return true;
  });
  if(net===client&&!room&&entryMode==='opponent'){mountRooms();$('login-link').hidden=!!client.userId;}
}
$('online-open').onclick=()=>void openOnline();
$('solo-mode').onclick=()=>{if(working||net?.busy)return;selectEntryMode('computer');disposeRooms();if(!room){net?.close();net=null;mode='solo';}};
$('start-room').onclick=()=>void onlineAction(()=>net.start());
$('lobby-back').onclick=()=>confirmExit(false);
function selectEntryMode(kind){
  entryMode=kind;
  for(const node of $('entry').querySelectorAll('[data-entry-mode]')){const selected=node.dataset.entryMode===kind;node.classList.toggle('on',selected);node.setAttribute('aria-pressed',String(selected));}
  for(const node of $('entry').querySelectorAll('[data-entry-panel]'))node.hidden=node.dataset.entryPanel!==kind;
}
function disposeRooms(){roomUI?.dispose();roomUI=null;}
function mountRooms(){
  if(room||entryMode!=='opponent'||app.dataset.view!=='welcome'||!net)return;
  if(roomUI){roomUI.sync();return;}
  const client=net;
  if(!window.OjjudaArcadeRooms){networkError({message:'대전방 화면을 불러오지 못했어요. 새로고침해 주세요.'});return;}
  const requireSuccess=async task=>{if(!await onlineAction(task))throw Error(lastNetworkIssue?.code||'unavailable');};
  roomUI=window.OjjudaArcadeRooms.create({
    fixedKind:'onecard',getUserId:()=>net===client?client.userId:null,
    readRooms:async()=>({rooms:await client.list()}),notify:message=>{$('online-account-note').textContent=message;},
    renderModal:(markup,title)=>{openSheet(title,'arcade-room');$('sheet-body').innerHTML=markup;$('sheet-body').querySelector('.mhead')?.remove();},
    closeModal:closeSheet,goArcade:()=>{},canOpen:()=>app.dataset.view==='welcome',
    onCreateNative:async(kind,params)=>{if(kind!=='onecard')throw Error('invalid_request');await requireSuccess(()=>client.create({title:params.title}));},
    onOpen:async item=>requireSuccess(()=>client.join(item.code)),
    onFreshGame:async item=>requireSuccess(()=>client.join(item.code)),
    onCancelNative:async()=>requireSuccess(async()=>{await client.enter();return client.leave();}),
  });
  roomUI.sync();
}
function renderLobby(){
  if(app.dataset.view!=='lobby'||!room)return;
  setText('room-title',room.title||'원카드 같이 한 판 해요');
  setText('room-code-display',room.room_no?`#${room.room_no}`:room.code);
  const players=room.players.filter(p=>p.active!==false),signature=JSON.stringify(players.map(p=>[p.id,p.name]))+room.hostId;
  if($('room-players').dataset.signature!==signature){
    $('room-players').dataset.signature=signature;const nodes=[];
    for(let i=0;i<tableSize;i++){
      const p=players[i],li=element('li',undefined,p?'lobby-player':'lobby-player is-bot');
      if(p)li.append(element('span',p.name.slice(0,1),'avatar'),element('span',p.name),element('small',p.id===room.hostId?'방장':p.id===room.myId?'나':'참여 완료'));
      else{const label=element('span',undefined,'player-label');label.append(element('span',`컴퓨터 ${i-players.length+1}`),element('small','컴퓨터가 참여해요','bot-seat-note'));li.append(element('span','AI','avatar'),label,element('span','AI','seat-tag ai-tag'));}
      nodes.push(li);
    }
    $('room-players').replaceChildren(...nodes);
  }
  const host=room.myId===room.hostId;$('start-room').hidden=!host;$('start-room').disabled=!host||players.length<1||working||!!net?.busy;
  setText('start-room',room.status==='finished'?'새 판 시작':'게임 시작');
  setText('lobby-note',host?`사람 ${players.length}명${players.length<tableSize?` · 컴퓨터 ${tableSize-players.length}명`:''}으로 시작해요.`:'방장이 시작하면 빈자리는 컴퓨터가 함께해요.');
}
$('copy-invite').onclick=async()=>{
  if(!room)return;const url=new URL('/games/onecard/',location.origin);url.searchParams.set('room',room.code);
  try{await navigator.clipboard.writeText(url.href);showToast('초대 링크를 복사했어요. 친구에게 보내 주세요.');}
  catch{openSheet('친구 초대','invite');$('sheet-body').append(element('p',`방 코드 ${room.code}`));const input=element('input');input.type='text';input.readOnly=true;input.value=url.href;$('sheet-body').append(input);input.focus();input.select();}
};
function updateTimer(){
  const timer=$('turn-timer');if(mode!=='online'||!room?.deadline||view?.status!=='playing'||app.dataset.view!=='playing'){timer.hidden=true;return;}
  const serverNow=(room.serverTime||Date.now())+Math.max(0,Date.now()-(room.receivedAt||Date.now()));
  const remaining=Math.max(0,Date.parse(room.deadline)-serverNow),seconds=Math.ceil(remaining/1000);timer.hidden=!!view.players[view.turn]?.bot;if(timer.hidden)return;
  timer.firstElementChild.style.transform=`scaleX(${Math.min(1,remaining/30000)})`;timer.dataset.urgent=String(seconds<=7);timer.setAttribute('aria-label',`차례 남은 시간 ${seconds}초`);
}
setInterval(updateTimer,250);
new ResizeObserver(()=>{if(view&&!animating)renderHand();}).observe(app);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(botTimer);motion.cancel();if(view)renderDiscard(view.topCard);sound.stop();}else{scheduleBot();if(mode==='online')void net?.read();}});
window.addEventListener('pagehide',event=>{motion.cancel();if(view)renderDiscard(view.topCard);sound.stop();clearTimeout(botTimer);if(!event.persisted)net?.close();});
window.addEventListener('pageshow',event=>{if(event.persisted){animating=false;if(view)renderBoard();scheduleBot();if(mode==='online')void net?.read();}});
saved=loadLocal();$('resume-solo').hidden=!saved;
setScreen('welcome');
const params=new URLSearchParams(location.search),requested=params.get('room')||'';
if(/^[A-F0-9]{8}$/i.test(requested)){autoJoinCode=requested.toUpperCase();void openOnline(autoJoinCode);}
else if(params.get('mode')==='online')void openOnline();
