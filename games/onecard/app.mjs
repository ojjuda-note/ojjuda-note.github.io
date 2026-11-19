import {createGame,applyAction,projectState,chooseBotAction,cardInfo} from './engine.mjs?v=20261120-onecard1';
import {createCard,cardLabel} from './cards.mjs?v=20261120-onecard1';
import {createOnecardSound} from './sound.mjs?v=20261120-onecard1';
import {createCardMotion} from './motion.mjs?v=20261120-onecard1';
import {createOnlineClient} from './online.mjs?v=20261120-onecard1';

const $=id=>document.getElementById(id);
const app=$('onecard-app'),hand=$('hand'),sheet=$('sheet'),sound=createOnecardSound();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const motion=createCardMotion({layer:$('motion-layer'),createCard,sound,reduced:()=>reduced.matches});
const SUITS={S:['♠','스페이드'],H:['♥','하트'],D:['♦','다이아몬드'],C:['♣','클로버']};
const STORAGE='ojjuda-onecard-solo-v1';
const botNames=['하루','다온','보리','루아'];
let local=null,view=null,mode='solo',net=null,room=null,opponentCount=1,handPage=0;
let animating=false,working=false,armed=false,botTimer=null,toastTimer=null,epoch=0;
let presentation=Promise.resolve(),lastRoomVersion=-1,lastRoomId='',resultKey='',pendingSuit=null;
let saved=null,sheetKind='',returnFocus=null,autoJoinCode='';
const cardNodes=new Map(),seatNodes=new Map();
const pageSize=()=>app.clientWidth<430?8:10;
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function button(text,cls,fn){const e=element('button',text,cls);e.type='button';e.onclick=fn;return e;}
function me(){return view?.players.find(p=>p.id===(mode==='online'?room?.myId:'me'));}
function myId(){return mode==='online'?room?.myId:'me';}
function myTurn(){return !!(view?.status==='playing'&&view.players[view.turn]?.id===myId()&&me()?.active!==false);}
function locked(){return animating||working||!!net?.busy||sheet.open;}
function setText(id,text){if($(id).textContent!==text)$(id).textContent=text;}
function showToast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2700);}
function announce(text){setText('status',text);}
function saveLocal(){if(!local)return;try{localStorage.setItem(STORAGE,JSON.stringify({state:local,opponents:opponentCount}));saved={state:local,opponents:opponentCount};}catch{/* A full storage quota does not interrupt a game. */}}
function loadLocal(){try{const data=JSON.parse(localStorage.getItem(STORAGE)||'null');if(data?.state?.status==='playing'&&data.state.players?.some(p=>p.id==='me')&&data.state.players.length>=2&&data.state.players.length<=5){projectState(data.state,'me');return data;}}catch{}return null;}

function renderSound(){const enabled=sound.enabled;$('sound-toggle').setAttribute('aria-pressed',String(enabled));$('sound-toggle').setAttribute('aria-label',enabled?'효과음 끄기':'효과음 켜기');$('sound-toggle').classList.toggle('is-muted',!enabled);}
renderSound();
document.addEventListener('pointerdown',()=>{void sound.unlock();},{capture:true});
document.addEventListener('keydown',()=>{void sound.unlock();},{capture:true});
$('sound-toggle').onclick=()=>{sound.setEnabled(!sound.enabled);renderSound();};
$('stock-card').append(createCard(null,{faceDown:true}));
$('discard-card').append(createCard('H-A'));
for(const id of ['S-K','H-A','C-7'])$('hero-cards').append(createCard(id));

function setScreen(name){
  app.dataset.view=name;$('entry').hidden=name!=='welcome';$('lobby').hidden=name!=='lobby';
  for(const id of ['game-table','hand-area','game-controls'])$(id).inert=name!=='playing';
  if(name!=='playing'){clearTimeout(botTimer);$('turn-timer').hidden=true;}
}
function seatPosition(index,total){if(total===1)return 'top';if(total===2)return ['top-left','top-right'][index];if(total===3)return ['left','top','right'][index];return ['left','top-left','top-right','right'][index];}
function visiblePlayers(){if(!view)return[];const start=view.players.findIndex(p=>p.id===myId()),list=[];for(let i=1;i<view.players.length;i++)list.push(view.players[(Math.max(start,0)+i)%view.players.length]);return list;}
function renderSeats(){
  const opponents=visiblePlayers(),ids=new Set(opponents.map(p=>p.id));
  for(const [id,node] of seatNodes)if(!ids.has(id)){node.remove();seatNodes.delete(id);}
  opponents.forEach((p,i)=>{
    let node=seatNodes.get(p.id);
    if(!node){node=element('div',undefined,'seat');node.dataset.player=p.id;const avatar=element('span',p.name.slice(0,1),'avatar');avatar.setAttribute('aria-hidden','true');node.append(avatar,element('span',p.name,'seat-name'),element('span','','seat-count'));const fan=element('div',undefined,'seat-fan');fan.setAttribute('aria-hidden','true');for(let j=0;j<3;j++)fan.append(createCard(null,{faceDown:true,small:true}));node.append(fan);$('opponents').append(node);seatNodes.set(p.id,node);}
    node.dataset.position=seatPosition(i,opponents.length);node.style.setProperty('--seat-index',String(i));
    node.querySelector('.seat-name').textContent=p.name;
    node.classList.toggle('is-current',view.status==='playing'&&view.players[view.turn]?.id===p.id);
    node.classList.toggle('is-inactive',p.active===false);
    node.classList.toggle('has-one',p.handCount===1&&p.active!==false);
    setSeatCount(p.id,p.handCount??p.hand?.length??0);
    if(p.active===false)node.querySelector('.seat-count').textContent=p.eliminatedReason==='too-many-cards'?'탈락':'나감';
    node.setAttribute('aria-label',`${p.name}, ${p.active===false?'참여 종료':`${p.handCount}장`}${view.players[view.turn]?.id===p.id?', 현재 차례':''}`);
  });
}
function setSeatCount(id,count){if(id===myId()){setText('my-count',`${count}장`);return;}const node=seatNodes.get(id);if(!node)return;node.querySelector('.seat-count').textContent=count===1?'원카드 · 1장':`${count}장`;node.querySelector('.seat-fan').style.opacity=count? '1':'0';}
function renderHand(){
  const player=me(),cards=player?.hand||[],size=pageSize();
  handPage=Math.max(0,Math.min(handPage,Math.max(0,Math.ceil(cards.length/size)-1)));
  const shown=cards.slice(handPage*size,(handPage+1)*size),showSet=new Set(shown);
  for(const [id,node] of cardNodes)if(!showSet.has(id)){node.remove();cardNodes.delete(id);}
  const width=hand.clientWidth||app.clientWidth-24,cardWidth=parseFloat(getComputedStyle(app).getPropertyValue('--card-w'))||(width<430?66:78);
  const step=Math.min(cardWidth*.69,(width-cardWidth-64)/Math.max(1,shown.length-1));
  const spread=shown.length>1?Math.min(4.5,22/(shown.length-1)):0;
  shown.forEach((id,index)=>{
    let node=cardNodes.get(id);if(!node){node=createCard(id,{interactive:true,label:cardLabel(id)});node.classList.add('hand-card');node.dataset.card=id;node.onclick=()=>void playCard(id);hand.append(node);cardNodes.set(id,node);}
    const relative=index-(shown.length-1)/2,angle=relative*spread,y=Math.abs(relative)*Math.abs(relative)*.8;
    node.style.setProperty('--x',`${relative*step}px`);node.style.setProperty('--y',`${y}px`);node.style.setProperty('--angle',`${angle}deg`);node.style.zIndex=String(index+1);
    const legal=view?.legalCardIds?.includes(id)===true;
    node.classList.toggle('is-playable',legal&&myTurn());node.classList.toggle('is-unplayable',myTurn()&&!legal);
    node.disabled=locked()||!myTurn()||!legal;
    node.setAttribute('aria-label',`${cardLabel(id)}${legal&&myTurn()?', 낼 수 있어요':''}`);
  });
  $('hand-pager').hidden=cards.length<=size;
  setText('hand-page',`${handPage+1}/${Math.max(1,Math.ceil(cards.length/size))}`);
  $('previous-cards').disabled=locked()||handPage===0;$('next-cards').disabled=locked()||(handPage+1)*size>=cards.length;
  setText('my-name',player?.name||'나');setText('my-count',`${cards.length}장`);
}
function renderBoard(){
  if(!view)return;renderSeats();renderHand();
  const discard=$('discard-card');if(discard.dataset.card!==view.topCard){discard.replaceChildren(createCard(view.topCard));discard.dataset.card=view.topCard;}
  setText('deck-count',String(view.deckCount));
  const suit=SUITS[view.currentSuit];$('suit-indicator').hidden=!suit;
  if(suit){setText('suit-indicator',`${suit[0]} ${suit[1]}`);$('suit-indicator').dataset.suit=view.currentSuit;}
  setText('direction',view.direction===1?'↻ 시계 방향':'↺ 반대 방향');
  renderControls();
}
function hint(){
  if(!view)return '같은 무늬나 숫자를 내면 돼요.';
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
  $('previous-cards').disabled=locked()||handPage===0;
  $('next-cards').disabled=locked()||(handPage+1)*pageSize()>=(player?.hand?.length||0);
  if(!working)announce(hint());
  updateTimer();
}
function rectOf(node){return node?.getBoundingClientRect();}
function opponentRect(node){const fan=rectOf(node?.querySelector('.seat-fan'));return fan?.width&&fan?.height?fan:rectOf(node?.querySelector('.avatar'))||rectOf(node);}
function rectForPlayer(id){return id===myId()?rectOf(hand):opponentRect(seatNodes.get(id));}
function gameMessage(events){
  const event=events?.findLast(e=>['attack','skip','reverse','again','onecard','eliminate'].includes(e.type));
  if(!event)return;
  const name=view?.players.find(p=>p.id===event.playerId)?.name||'상대';
  const messages={attack:`${name} · 공격 +${event.count}`,skip:'다음 차례를 건너뛰어요',reverse:'진행 방향이 바뀌었어요',again:`${name} · 한 번 더`,onecard:`${name} · 원카드!`,eliminate:`${name} · 20장으로 탈락`};
  showToast(messages[event.type]);if(event.type==='onecard')sound.play('onecard');
}
async function present(next,{deal=false,animate=true}={}){
  const generation=epoch,previous=view;
  const oldRects=new Map([...cardNodes].map(([id,node])=>[id,{rect:rectOf(node),angle:parseFloat(node.style.getPropertyValue('--angle'))||0,width:node.offsetWidth}]));
  const oldSeats=new Map([...seatNodes].map(([id,node])=>[id,opponentRect(node)]));
  const fromStock=rectOf($('stock-card').firstElementChild),oldDiscard=rectOf($('discard-card').firstElementChild);
  animating=true;view=next;if((me()?.hand?.length||0)!==2)armed=false;renderBoard();
  const toDiscard=rectOf($('discard-card').firstElementChild),newRects=new Map([...cardNodes].map(([id,node])=>[id,{rect:rectOf(node),width:node.offsetWidth,angle:parseFloat(node.style.getPropertyValue('--angle'))||0}]));
  const events=next.lastEvents||[],flights=[],counts=new Map();let delay=0;
  const privateHand=new Set(me()?.hand||[]),reveal=new Set();
  const flightTarget=(id,cardId)=>newRects.get(cardId)?.rect||rectForPlayer(id);
  function arrive(id,cardId,count){return()=>{if(generation!==epoch)return;if(cardId&&cardNodes.has(cardId))cardNodes.get(cardId).style.opacity='';if(count!==undefined)setSeatCount(id,count);};}
  if(animate&&deal){
    announce('카드를 나누고 있어요.');
    for(const p of next.players){counts.set(p.id,0);setSeatCount(p.id,0);}
    for(const node of cardNodes.values()){node.style.opacity='0';reveal.add(node);}
    $('discard-card').style.visibility='hidden';
    for(const event of events.filter(e=>e.type==='deal')){
      const count=(counts.get(event.playerId)||0)+1;counts.set(event.playerId,count);
      const target=newRects.get(event.cardId),own=event.playerId===myId();
      flights.push({from:fromStock,to:flightTarget(event.playerId,event.cardId),cardId:own?event.cardId:null,faceDown:true,reveal:own,toAngle:target?.angle||0,toScale:target?target.width/78:.48,delay,duration:390,onLand:arrive(event.playerId,event.cardId,count)});delay+=62;
    }
    flights.push({from:fromStock,to:toDiscard,cardId:next.topCard,faceDown:true,reveal:true,toAngle:6,toScale:$('discard-card').firstElementChild.offsetWidth/78,delay,duration:390,onLand:()=>{$('discard-card').style.visibility='';},sound:'play'});
  }else if(animate&&previous){
    let playCount=0;
    for(const event of events){
      if(event.type==='play'){
        const own=event.playerId===myId(),old=oldRects.get(event.cardId);
        $('discard-card').style.visibility='hidden';playCount++;
        flights.push({from:own?old?.rect||rectOf(hand):oldSeats.get(event.playerId),to:toDiscard,cardId:event.cardId,faceDown:!own,reveal:!own,fromAngle:old?.angle||0,fromScale:own&&old?old.width/78:.48,toAngle:6,toScale:$('discard-card').firstElementChild.offsetWidth/78,delay,duration:360,sound:'play',onLand:()=>{$('discard-card').style.visibility='';}});delay+=130;
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
    // A reconnect may skip revisions. Its latest snapshot always wins over old motion.
    if(playCount>1||next.revision>previous.revision+1)flights.length=0;
  }
  try{await motion.run(flights);}finally{
    for(const node of reveal)node.style.opacity='';$('discard-card').style.visibility='';
    if(generation!==epoch)return;
    animating=false;renderSeats();setText('my-count',`${me()?.hand?.length||0}장`);renderControls();
  }
  if(generation!==epoch)return;
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
  }catch(error){showToast(({not_your_turn:'내 차례를 기다려 주세요.',invalid_card:'같은 무늬나 숫자를 골라 주세요.',invalid_move:'지금 낼 수 있는 카드를 골라 주세요.'})[error.code]||'지금 가능한 동작을 다시 골라 주세요.');return false;}
  finally{working=false;renderControls();scheduleBot();}
}
async function playCard(id){
  if(!myTurn()||locked()||!view.legalCardIds?.includes(id))return;
  const info=cardInfo(id);if(info.rank==='7'||id.startsWith('X-')){chooseSuit(id);return;}
  await dispatch({type:'play',cardId:id,declare:armed});armed=false;
}
function chooseSuit(cardId){
  pendingSuit=cardId;openSheet('무늬를 골라 주세요','suit');
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
$('previous-cards').onclick=()=>{if(!locked()){handPage--;renderHand();}};$('next-cards').onclick=()=>{if(!locked()){handPage++;renderHand();}};

async function startSolo(resume=false){
  epoch++;motion.cancel();closeSheet();clearTimeout(botTimer);net?.close();net=null;room=null;lastRoomVersion=-1;lastRoomId='';
  mode='solo';view=null;resultKey='';handPage=0;armed=false;working=false;animating=false;hand.replaceChildren();cardNodes.clear();
  if(resume&&saved){local=saved.state;opponentCount=saved.opponents||local.players.length-1;}
  else{opponentCount=Number($('opponent-count').value)||1;local=createGame({players:[{id:'me',name:'나'},...botNames.slice(0,opponentCount).map((name,i)=>({id:`bot-${i}`,name,bot:true}))]});}
  $('connection').hidden=true;setScreen('playing');saveLocal();await present(projectState(local,'me'),{deal:!resume,animate:!resume});
}
$('solo-start').onclick=()=>void startSolo();$('resume-solo').onclick=()=>void startSolo(true);

function openSheet(title,kind='menu'){
  clearTimeout(botTimer);returnFocus=document.activeElement;sheetKind=kind;setText('sheet-title',title);$('sheet-body').replaceChildren();
  if(!sheet.open)sheet.showModal();renderControls();
}
function closeSheet(){if(sheet.open)sheet.close();pendingSuit=null;sheetKind='';renderControls();scheduleBot();}
$('sheet-close').onclick=closeSheet;
sheet.addEventListener('cancel',()=>{pendingSuit=null;sheetKind='';setTimeout(()=>{renderControls();scheduleBot();},0);});
sheet.addEventListener('close',()=>{renderControls();scheduleBot();if(returnFocus?.isConnected&&!returnFocus.disabled)returnFocus.focus({preventScroll:true});});
function showRules(){
  openSheet('원카드, 이렇게 해요','rules');
  const lead=element('p','같은 무늬나 숫자를 한 장씩 내고, 손의 카드를 먼저 없애면 이겨요.','rules-lead');
  const list=element('div',undefined,'rules-list');
  const rules=[['시작','각자 7장. 낼 카드가 없으면 1장 받고 차례를 넘겨요.'],['2 · A','다음 사람에게 2장 · 3장 공격'],['검정 · 빨강 조커','5장 · 7장 공격 + 원하는 무늬 선택'],['공격이 오면','공격 카드(2·A·조커)를 이어 내거나 쌓인 장수만큼 받아요.'],['7','원하는 무늬로 바꿔요.'],['J · Q · K','다음 사람 건너뛰기 · 방향 바꾸기 · 한 번 더'],['둘이 할 때 Q','방향을 바꾸고 한 번 더 내요.'],['원카드!','2장일 때 먼저 누르거나, 1장이 된 직후 눌러요. 다음 사람이 행동할 때까지 안 누르면 2장을 받아요.'],['20장','손의 카드가 20장 이상이 되면 탈락해요.'],['멀티 차례','30초 안에 내거나 받아요. 시간이 지나면 자동으로 받아요.']];
  for(const [label,text] of rules){const row=element('div',undefined,'rule-row');row.append(element('strong',label),element('span',text));list.append(row);}
  $('sheet-body').append(lead,list);$('sheet-body').append(element('p','동네마다 조금씩 다른 원카드, 이 테이블에서는 위 규칙으로 즐겨요.','small-note'));
}
for(const id of ['rules-button','entry-rules'])$(id).onclick=showRules;
$('menu-button').onclick=()=>{
  openSheet(mode==='online'?'게임 메뉴':'잠깐 쉬어가기');const body=$('sheet-body');
  if(mode==='online'&&room?.status==='active')body.append(element('p','멀티게임은 메뉴를 열어도 계속돼요.','small-note'));
  body.append(button('게임 방법','btn btn-secondary',showRules));
  if(app.dataset.view==='playing'){
    body.append(button(mode==='solo'?'새 게임':'방 나가기','btn btn-secondary',()=>confirmExit(false)));
    body.append(button('계속하기','btn btn-primary',closeSheet));
  }else body.append(button('닫기','btn btn-primary',closeSheet));
};
function confirmExit(toArcade){
  if(app.dataset.view!=='playing'&&(!room||room.status==='finished')){void exit(toArcade);return;}
  openSheet(toArcade?'오락실로 돌아갈까요?':'첫 화면으로 갈까요?','exit');
  $('sheet-body').append(element('p',mode==='online'?'진행 중인 방에서는 나가게 돼요.': '혼자 하던 게임은 이어서 할 수 있어요.'));
  const row=element('div',undefined,'dialog-actions');row.append(button('계속하기','btn btn-secondary',closeSheet),button(toArcade?'오락실로':'나가기','btn btn-primary',()=>void exit(toArcade)));$('sheet-body').append(row);
}
async function exit(toArcade){
  if(working||net?.busy)return;working=true;renderControls();
  try{if(mode==='online'&&room){const ok=await net.leave();if(!ok)return;}epoch++;motion.cancel();clearTimeout(botTimer);net?.close();net=null;room=null;view=null;local=null;lastRoomId='';lastRoomVersion=-1;closeSheet();saved=loadLocal();$('resume-solo').hidden=!saved;setScreen('welcome');if(toArcade)location.assign('/world.html?tab=arcade');}
  finally{working=false;animating=false;renderControls();}
}
$('arcade-back').onclick=e=>{if(app.dataset.view==='playing'||room){e.preventDefault();confirmExit(true);}};
function showResult(){
  const key=`${mode}:${room?.id||'local'}:${room?.round||0}:${view.revision}`;if(resultKey===key)return;resultKey=key;
  const winners=view.winnerIds||[view.winnerId],win=winners.includes(myId()),winner=view.players.find(p=>p.id===view.winnerId);
  if(win)sound.play('win');openSheet(win?'멋진 한 판, 승리!':winner?`${winner.name} 승리`:'이번 판은 무승부','result');
  $('sheet-body').append(element('div',win?'♠':'♣','result-mark'));
  $('sheet-body').append(element('p',view.finishReason==='blocked'?'더 받을 카드가 없어, 남은 카드 수로 마쳤어요.':win?'마지막 카드까지 깔끔하게 내려놓았어요.':'다음 판에는 마지막 한 장까지!', 'result-copy'));
  const scores=element('div',undefined,'result-players');for(const p of view.players){const row=element('div');row.append(element('span',p.name),element('strong',p.active===false?'탈락':`${p.handCount??p.hand?.length??0}장`));scores.append(row);}$('sheet-body').append(scores);
  if(mode==='solo')$('sheet-body').append(button('한 판 더','btn btn-primary',()=>void startSolo()));
  else $('sheet-body').append(button('대기실로','btn btn-primary',()=>{closeSheet();setScreen('lobby');renderLobby();}));
  $('sheet-body').append(button('첫 화면으로','text-btn',()=>void exit(false)));
}

function connection(message){$('connection').textContent=message||'';$('connection').hidden=!message;}
function networkError(error){
  const text=error?.message||'연결을 확인한 뒤 다시 눌러 주세요.';
  if(app.dataset.view==='lobby'){$('lobby-error').textContent=text;$('lobby-error').hidden=false;}else showToast(text);
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
      epoch++;motion.cancel();view=null;animating=false;handPage=0;
      hand.replaceChildren();cardNodes.clear();
      if(app.dataset.view==='playing')setScreen('lobby');
    }
    renderLobby();return;
  }
  mode='online';$('login-link').hidden=true;$('lobby-error').hidden=true;
  if(next.status==='waiting'){setScreen('lobby');renderLobby();return;}
  if(!next.game)return;
  if(next.id===lastRoomId&&next.version<=lastRoomVersion){updateTimer();return;}
  const newRoom=next.id!==lastRoomId,roundChanged=!!previous&&previous.id===next.id&&previous.round!==next.round;
  const first=!view||mode!=='online'||newRoom||roundChanged;
  const started=next.game.lastEvents?.some(e=>e.type==='deal')===true&&(previous?.status==='waiting'||first);
  lastRoomId=next.id;lastRoomVersion=next.version;setScreen('playing');
  if(newRoom||roundChanged){epoch++;motion.cancel();view=null;handPage=0;resultKey='';animating=false;hand.replaceChildren();cardNodes.clear();presentation=Promise.resolve();closeSheet();}
  else if(sheetKind==='suit'&&(next.game.players[next.game.turn]?.id!==next.myId||!next.game.legalCardIds?.includes(pendingSuit)))closeSheet();
  const thisEpoch=epoch;
  presentation=presentation.then(async()=>{if(epoch!==thisEpoch)return;await present(next.game,{deal:started,animate:started||!first});}).catch(()=>{animating=false;if(epoch===thisEpoch){view=next.game;renderBoard();connection('화면을 다시 맞췄어요. 계속할 수 있어요.');}});
}
async function onlineAction(fn){
  if(working||net?.busy)return false;working=true;$('lobby-error').hidden=true;renderLobby();
  try{return await fn();}catch(error){networkError(error);return false;}finally{working=false;renderLobby();renderControls();}
}
async function openOnline(code=''){
  clearTimeout(botTimer);mode='online';view=null;local=null;setScreen('lobby');renderLobby();
  const client=ensureNetwork();
  await onlineAction(async()=>{
    const current=await client.enter();
    if(code&&!current){$('room-code').value=code;return client.join(code);}
    if(code&&current&&current.code!==code)showToast('참여 중인 방으로 돌아왔어요. 나간 뒤 다른 방에 참여할 수 있어요.');
    return true;
  });
}
$('online-open').onclick=()=>void openOnline();
$('create-room').onclick=()=>void onlineAction(()=>ensureNetwork().create({capacity:5}));
$('join-form').onsubmit=e=>{e.preventDefault();const code=$('room-code').value.trim().toUpperCase();if(!/^[A-F0-9]{8}$/.test(code)){networkError({message:'초대받은 8자리 코드를 입력해 주세요.'});return;}void onlineAction(()=>ensureNetwork().join(code));};
$('room-code').addEventListener('input',()=>{$('room-code').value=$('room-code').value.replace(/[^a-f0-9]/gi,'').toUpperCase();});
$('start-room').onclick=()=>void onlineAction(()=>net.start());
$('lobby-back').onclick=()=>{if(room)confirmExit(false);else{net?.close();net=null;mode='solo';setScreen('welcome');}};
function renderLobby(){
  if(app.dataset.view!=='lobby')return;
  const waiting=!!room;$('room-entry').hidden=waiting;$('room-waiting').hidden=!waiting;
  for(const id of ['create-room','join-room'])$(id).disabled=working||!!net?.busy;
  if(!waiting)return;
  setText('room-code-display',room.code);
  const players=room.players.filter(p=>p.active!==false),signature=JSON.stringify(players.map(p=>[p.id,p.name]))+room.hostId;
  if($('room-players').dataset.signature!==signature){
    $('room-players').dataset.signature=signature;const nodes=[];
    for(let i=0;i<room.capacity;i++){const p=players[i],li=element('li',undefined,p?'lobby-player':'lobby-player empty');li.append(element('span',p?p.name.slice(0,1):'+','avatar'),element('span',p?p.name:'빈자리'),element('small',p?(p.id===room.hostId?'방장':p.id===room.myId?'나':'참여 완료'):'초대할 수 있어요'));nodes.push(li);}$('room-players').replaceChildren(...nodes);
  }
  const host=room.myId===room.hostId;$('start-room').hidden=!host;$('start-room').disabled=!host||players.length<2||working||!!net?.busy;
  setText('start-room',room.status==='finished'?'새 판 시작':'게임 시작');
  setText('lobby-note',players.length<2?'친구 한 명만 더 오면 시작할 수 있어요.':host?`${players.length}명이 모였어요. 준비되면 시작하세요.`:'방장이 게임을 시작하면 함께 들어가요.');
}
$('copy-invite').onclick=async()=>{
  if(!room)return;const url=new URL('/games/onecard/',location.origin);url.searchParams.set('room',room.code);
  try{await navigator.clipboard.writeText(url.href);showToast('초대 링크를 복사했어요. 친구에게 보내 주세요.');}
  catch{openSheet('친구 초대','invite');$('sheet-body').append(element('p',`방 코드 ${room.code}`));const input=element('input');input.type='text';input.readOnly=true;input.value=url.href;$('sheet-body').append(input);input.focus();input.select();}
};
function updateTimer(){
  const timer=$('turn-timer');if(mode!=='online'||!room?.deadline||view?.status!=='playing'||app.dataset.view!=='playing'){timer.hidden=true;return;}
  const serverNow=(room.serverTime||Date.now())+Math.max(0,Date.now()-(room.receivedAt||Date.now()));
  const remaining=Math.max(0,Date.parse(room.deadline)-serverNow),seconds=Math.ceil(remaining/1000);timer.hidden=false;
  timer.firstElementChild.style.transform=`scaleX(${Math.min(1,remaining/30000)})`;timer.dataset.urgent=String(seconds<=7);timer.setAttribute('aria-label',`차례 남은 시간 ${seconds}초`);
}
setInterval(updateTimer,250);
new ResizeObserver(()=>{if(view&&!animating)renderHand();}).observe(app);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(botTimer);sound.stop();}else{scheduleBot();if(mode==='online')void net?.read();}});
window.addEventListener('pagehide',event=>{motion.cancel();sound.stop();clearTimeout(botTimer);if(!event.persisted)net?.close();});
window.addEventListener('pageshow',event=>{if(event.persisted){animating=false;if(view)renderBoard();scheduleBot();if(mode==='online')void net?.read();}});
saved=loadLocal();$('resume-solo').hidden=!saved;
setScreen('welcome');
const params=new URLSearchParams(location.search),requested=params.get('room')||'';
if(/^[A-F0-9]{8}$/i.test(requested)){autoJoinCode=requested.toUpperCase();$('room-code').value=autoJoinCode;void openOnline(autoJoinCode);}
else if(params.get('mode')==='online')void openOnline();
