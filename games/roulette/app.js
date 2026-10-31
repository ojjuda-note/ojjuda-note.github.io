import {BETS,COLOR,MAX_BET,totalBets,cleanChips,initialState,payout} from './engine.js?v=20261031-roulette-modes1';
import {RouletteWheel} from './wheel.js?v=20261031-roulette-modes1';
import {Sound} from './sound.js?v=20261031-roulette-modes1';
import {addChipDepth} from './chips.js?v=20261031-roulette-modes1';

const $=id=>document.getElementById(id),fmt=n=>Math.round(n).toLocaleString('ko-KR'),short=n=>n>=1000?(n/1000).toLocaleString('en-US',{maximumFractionDigits:1})+'K':String(n);
const KEY='ojjuda.roulette.preferences.v1';
const sound=new Sound();
const state=initialState();state.balance=0;
let lobbyMode='solo';
let room=null,owner=null,initialized=false,screen='lobby',animating=false,settling=false,startingSpin=false,undo=[],lastResult=null,toastTimer,resultReadyId=null,betMode='straight';
let commandBusy=false,pollTimer=null,reading=false,requestCounter=0,lastServerTime=0,closed=false,connecting=false,exitRequested=false;
let draftTimer=null,draftRequest=null,draftVersion=0;
let bettingClockKey='',bettingClockAt=0,bettingClockTimer=null,bettingClockFired=false;
let computerOutcome=null;
const requests=new Map();
try{const prefs=JSON.parse(localStorage.getItem(KEY));state.sound=prefs?.sound!==false;state.reduced=prefs?.reduced===true}catch{}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({sound:state.sound,reduced:state.reduced}))}catch{}}
async function mutate(callback){const result=await callback();persist();return result}
function send(message){if(window.parent!==window)window.parent.postMessage({source:'ojjuda-roulette',...message},location.origin)}
function rpc(action,payload={}){
  if(!initialized||closed)return Promise.reject(new Error('login'));
  const id='roulette-'+(++requestCounter);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{requests.delete(id);reject(new Error('timeout'))},15000);
    requests.set(id,{resolve,reject,timer});send({type:'rpc',id,body:{action,...payload}});
  });
}
const ERRORS={login:'로그인한 뒤 다시 들어와 주세요.',underage:'만 19세 이상 회원만 이용할 수 있어요.',insufficient_gold:'베팅할 골드가 부족해요.',invalid_bet:'베팅 금액을 확인해 주세요.',not_host:'방장이 공을 굴릴 수 있어요.',not_ready:'다른 회원의 시작을 기다리고 있어요.',room_full:'이미 네 명이 참여하고 있어요.',room_not_found:'방을 찾지 못했어요.',room_closed:'종료된 방이에요.',round_active:'아직 공이 돌고 있어요.',round_in_progress:'베팅이 마감됐어요. 결과를 확인할게요.',not_finished:'아직 공이 돌고 있어요.',room_busy:'진행 중인 방은 다음 판에 참여해 주세요.',round_not_finished:'아직 공이 돌고 있어요.',timeout:'응답이 늦어지고 있어요. 방 상태를 다시 확인할게요.',unavailable:'잠시 연결이 끊겼어요. 다시 시도해 주세요.'};
function errorText(error){const code=String(error?.message||error||'unavailable');return ERRORS[code]||Object.entries(ERRORS).find(([key])=>code.includes(key))?.[1]||'처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'}
function renderLobbyMode(){
  const solo=lobbyMode==='solo';
  $('computerEntry').hidden=!solo;$('onlineEntry').hidden=solo;
  $('modeDescription').textContent=solo?'컴퓨터와 베팅하고, 시작을 누르면 바로 돌아가요.':'첫 시작 후 30초에 마감해요. 모두 시작을 누르면 바로 돌아가요.';
  $('entryHint').textContent=solo?'컴퓨터와 1:1 · 가상 골드 · 만 19세 이상':'1–4명 · 가상 골드 · 만 19세 이상';
  for(const button of document.querySelectorAll('[data-roulette-mode]')){
    const selected=button.dataset.rouletteMode===lobbyMode;button.classList.toggle('on',selected);button.setAttribute('aria-pressed',String(selected));button.disabled=commandBusy||connecting;
  }
}
function selectMode(mode,{refresh=true}={}){lobbyMode=mode==='online'?'online':'solo';renderLobbyMode();if(refresh&&initialized&&!room&&!commandBusy&&!connecting)schedulePoll(0)}
function renderComputerResult(){
  const visible=room?.mode==='solo'&&lastResult&&computerOutcome?.id===(state.pending?.id||state.lastSettled);
  const result=visible?computerOutcome.result:null;
  const text=result?`컴퓨터 · 당첨금 ${fmt(result.total)} G · ${result.net>0?'순이익 +'+fmt(result.net):result.net<0?'손실 '+fmt(-result.net):'손익 0'} G`:'';
  for(const id of ['computerResult','wheelComputerResult']){const el=$(id);el.hidden=!visible;el.textContent=text;el.title=text}
}
function ownReady(){return room?.me?.ready===true}
function activePlayers(){return (room?.players||[]).filter(player=>player.connected!==false)}
function bettingRemaining(){return room?.mode!=='solo'&&room?.status==='betting'&&bettingClockKey?Math.max(0,bettingClockAt-performance.now()):null}
function bettingExpired(){return bettingRemaining()===0}
function syncBettingClock(serverTime){
  const deadline=Number(room?.bettingDeadline);
  if(!room||room.mode==='solo'||room.status!=='betting'||!Number.isFinite(deadline)||deadline<=0){
    clearTimeout(bettingClockTimer);bettingClockTimer=null;bettingClockKey='';bettingClockAt=0;bettingClockFired=false;return;
  }
  const key=room.id+':'+deadline,at=performance.now()+Math.max(0,deadline-serverTime);
  if(key!==bettingClockKey){bettingClockKey=key;bettingClockAt=at;bettingClockFired=false}
  else bettingClockAt=Math.min(bettingClockAt,at);
}
function renderBettingClock(){
  clearTimeout(bettingClockTimer);bettingClockTimer=null;
  const remaining=bettingRemaining(),badge=$('bettingCountdown');badge.hidden=remaining===null;
  if(remaining===null)return;
  const seconds=Math.ceil(remaining/1000);
  $('bettingSeconds').textContent=seconds+'초';badge.classList.toggle('urgent',seconds<=10);badge.classList.toggle('expired',seconds===0);
  badge.setAttribute('aria-label',seconds?'베팅 마감까지 '+seconds+'초':'베팅 마감, 서버 결과 확인 중');
  if(remaining>0){bettingClockTimer=setTimeout(renderBettingClock,Math.min(250,remaining));return}
  if(!bettingClockFired){
    bettingClockFired=true;clearTimeout(draftTimer);render();schedulePoll(0);
  }
}
function queueDraft(){draftVersion++;clearTimeout(draftTimer);const remaining=bettingRemaining();draftTimer=setTimeout(shareDraft,remaining!==null&&remaining<1000?0:120)}
async function shareDraft(){
  clearTimeout(draftTimer);
  if(draftRequest||!room||room.status!=='betting'||ownReady()||commandBusy||closed||bettingExpired())return;
  const version=draftVersion,code=room.code;
  draftRequest=rpc('bet',{code,bets:{...state.bets}});
  try{const data=await draftRequest;if(room?.code===code)applySnapshot(data)}
  catch(error){if(/round_in_progress/.test(error?.message||'')||bettingExpired())schedulePoll(0);else if(version===draftVersion&&!commandBusy&&!ownReady()&&!state.pending&&room?.code===code)notice(errorText(error))}
  finally{draftRequest=null;if(draftVersion!==version&&!closed)draftTimer=setTimeout(shareDraft,120)}
}
function setScreen(next){if(screen===next)return;screen=next;document.body.dataset.screen=next;if(next==='game')window.scrollTo({top:0,behavior:'instant'});$('playSection').inert=next!=='game';$('multiplayerBar').hidden=next!=='game';requestAnimationFrame(()=>{wheel.resize();positionSeams()})}
function renderRoom(){
  const solo=room?.mode==='solo';
  $('roomCode').textContent=solo?'':room?.code||'';$('copyCode').hidden=solo;$('soloRoomLabel').hidden=!solo;
  $('tableModeLabel').textContent=solo?'COMPUTER':'ONLINE · 1–4 PLAYERS';
  const strip=$('playersStrip');strip.replaceChildren();
  for(const player of activePlayers()){
    const el=document.createElement('span');el.className='online-player'+(player.ready?' is-ready':'');
    const name=player.computer?'컴퓨터':player.name||'회원';el.classList.toggle('is-computer',player.computer===true);
    el.textContent=(!solo&&player.userId===room?.hostId?'♛ ':'')+name+(player.userId===owner?' · 나':'')+(player.ready?' ✓':'');
    el.title=name+' · '+(player.computer?'베팅 완료':player.confirmed&&room?.status!=='betting'?'확인 완료':player.ready?'시작 누름':'베팅 중');strip.append(el);
  }
  $('cancelReady').hidden=solo||!ownReady()||room?.status!=='betting';$('cancelReady').disabled=commandBusy||bettingExpired();
  $('startSoloButton').disabled=!initialized||commandBusy||connecting;
  $('createRoomButton').disabled=!initialized||commandBusy||connecting;
  $('joinRoomButton').disabled=!initialized||commandBusy||connecting;
  $('refreshRooms').disabled=!initialized||commandBusy||connecting;renderLobbyMode();renderBettingClock();renderComputerResult();
}
function renderRooms(rooms){
  const list=$('roomList');list.replaceChildren();
  for(const entry of rooms||[]){
    if(entry.mode==='solo')continue;
    const code=String(entry.code||'');if(!/^[a-f0-9]{8}$/i.test(code))continue;
    const count=Array.isArray(entry.players)?entry.players.length:Number(entry.players??entry.playerCount??entry.player_count??entry.count??entry.seats??0);
    const capacity=[2,3,4].includes(Number(entry.capacity))?Number(entry.capacity):4;
    const row=document.createElement('button');row.type='button';row.className='room-row';
    const name=document.createElement('strong');name.textContent=entry.title||entry.hostName||entry.host_name||entry.name||'룰렛 테이블';
    const meta=document.createElement('span');meta.textContent=`${code} · ${Number.isFinite(count)?count:0}/${capacity}명`;
    row.append(name,meta);row.disabled=commandBusy||count>=capacity||entry.status==='spinning'||entry.status==='finished';
    row.addEventListener('click',()=>joinRoom(code));list.append(row);
  }
  $('emptyRooms').hidden=list.children.length>0;
}
function displaySpin(serverSpin,serverTime){
  if(!serverSpin||!Number.isInteger(serverSpin.number)||serverSpin.number<0||serverSpin.number>36)return;
  if(state.pending?.id===serverSpin.id||state.lastSettled===serverSpin.id)return;
  const bets=serverSpin.bets||room.me.bets||{};
  const spin={...serverSpin,bets:{...bets},chips:cleanChips(state.betChips,bets),startedAt:serverSpin.startedAt+(Date.now()-serverTime)};
  state.lastBets={...bets};state.lastChips=cleanChips(spin.chips,bets);state.bets={};state.betChips={};state.pending=spin;undo=[];
  clearResult();clearHighlight();animating=true;settling=false;openWheelPopup(spin);
  // Every participant uses the same starting pose, including a late status read.
  wheel.rotation=0;wheel.ballAngle=-Math.PI/2;sound.beginRoll(spin);wheel.start(spin);
}
function acknowledgeRemoteResult(){
  const spin=state.pending;
  if(spin&&state.lastSettled!==spin.id){const result=payout(spin.bets,spin.number);state.lastSettled=spin.id;state.history.unshift(spin.number);state.history=state.history.slice(0,30);revealResult({...result,number:spin.number,net:result.total-result.stake,bets:spin.bets})}
  state.pending=null;animating=false;resultReadyId=null;sound.stopRoll();void closeWheelPopup(null,{instant:true});
}
function applySnapshot(data){
  if(!data||closed)return;
  const serverTime=Number(data.serverTime)||Date.now();if(serverTime<lastServerTime)return;lastServerTime=serverTime;
  if(Number.isSafeInteger(data.wallet?.gold)&&data.wallet.gold>=0)state.balance=data.wallet.gold;
  if(Array.isArray(data.rooms))renderRooms(data.rooms);
  if(Object.prototype.hasOwnProperty.call(data,'room')){
    const previous=room;room=data.room;
    if(!room){
      state.pending=null;state.bets={};state.betChips={};undo=[];animating=false;resultReadyId=null;sound.stopRoll();closeWheelPopup(null,{instant:true});setScreen('lobby');
    }else{
      lobbyMode=room.mode==='solo'?'solo':'online';
      if(previous?.id!==room.id){state.bets={};state.betChips={};state.pending=null;state.history=[];state.lastBets={};state.lastChips={};state.lastSettled=null;undo=[];clearResult()}
      setScreen('game');
      if(room.status==='betting'){
        if(previous?.id===room.id&&(previous.status!=='betting'||previous.round!==room.round)){state.bets={};state.betChips={};undo=[];if(!settling)acknowledgeRemoteResult()}
        if(room.me?.ready){state.bets={...(room.me.bets||{})};state.betChips=cleanChips(state.betChips,state.bets)}
        if(!lastResult){$('resultTitle').textContent=room.mode==='solo'?'컴퓨터와 한 판':'함께 베팅하고 있어요';$('resultDetail').textContent=room.mode==='solo'?'베팅을 마치고 시작을 누르세요':`${activePlayers().length}/${[2,3,4].includes(Number(room.capacity))?Number(room.capacity):4}명 · ${activePlayers().filter(player=>player.ready).length}명 시작`}
      }else if(!room.me?.confirmed&&!settling){displaySpin(room.spin,serverTime)}
      else if(room.me?.confirmed&&!settling){acknowledgeRemoteResult()}
      const computer=room.mode==='solo'&&room.players?.find(player=>player.computer===true);
      if(room.spin?.id&&computer?.result)computerOutcome={id:room.spin.id,result:{...computer.result}};
    }
  }
  syncBettingClock(serverTime);render();
}
async function command(action,payload={}){
  if(commandBusy||closed)return null;commandBusy=true;render();
  try{const data=await rpc(action,{...(room?{code:room.code}:{}),...payload});applySnapshot(data);return data}
  catch(error){notice(errorText(error));return null}
  finally{commandBusy=false;render();if(exitRequested){exitRequested=false;void leaveRoom({exit:true})}else schedulePoll(bettingExpired()?0:250)}
}
function schedulePoll(delay){clearTimeout(pollTimer);if(!initialized||closed)return;const remaining=bettingRemaining(),usual=document.hidden?8000:room?1400:4500;const next=remaining===null?usual:remaining===0?500:Math.min(usual,remaining);pollTimer=setTimeout(poll,delay??next)}
async function poll(){
  if(reading||commandBusy||closed){schedulePoll();return}reading=true;
  try{const data=await rpc(room?'read':lobbyMode==='online'?'list':'status',room?{code:room.code}:{});applySnapshot(data);$('connectionStatus').textContent=''}
  catch(error){if(!document.hidden)$('connectionStatus').textContent='연결을 다시 확인하고 있어요';if(room&&/room_not_found|room_closed/.test(error?.message||'')){room=null;state.pending=null;state.bets={};state.betChips={};animating=false;resultReadyId=null;closeWheelPopup(null,{instant:true});setScreen('lobby');render();notice(errorText(error))}}
  finally{reading=false;schedulePoll()}
}
async function joinRoom(code){selectMode('online',{refresh:false});const value=String(code||'').trim().toUpperCase();if(!/^[A-F0-9]{8}$/.test(value)){notice('8자리 방 코드를 입력해 주세요.');$('joinCode').focus();return}sound.unlock().catch(()=>{});await command('join',{code:value})}
async function leaveRoom({exit=false}={}){
  if(commandBusy)return;const data=room?await command('leave',{roundId:room.spin?.id}):{};
  if(data){room=null;state.pending=null;state.bets={};state.betChips={};undo=[];animating=false;resultReadyId=null;settling=false;sound.stopRoll();await closeWheelPopup(null,{instant:true});setScreen('lobby');render();if(exit){closed=true;clearTimeout(pollTimer);clearTimeout(bettingClockTimer);clearTimeout(draftTimer);send({type:'exit'})}}
}
window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.source!=='ojjuda-world')return;
  const message=event.data;
  if(message.type==='roulette-rpc'){
    const pending=requests.get(message.id);if(!pending)return;clearTimeout(pending.timer);requests.delete(message.id);
    if(message.error||message.data?.error||message.data?.ok===false)pending.reject(new Error(message.error||message.data?.error||'unavailable'));else pending.resolve(message.data);return;
  }
  if(message.type==='roulette-exit-request'){if(commandBusy||settling)exitRequested=true;else void leaveRoom({exit:true});return}
  if(message.type!=='roulette-init'||initialized||!message.owner)return;
  initialized=true;owner=message.owner;connecting=true;if(message.joinCode)selectMode('online',{refresh:false});render();
  try{applySnapshot(await rpc('status'));if(message.joinCode)applySnapshot(await rpc('join',{code:String(message.joinCode).toUpperCase()}));else if(lobbyMode==='online')applySnapshot(await rpc('list'));$('connectionStatus').textContent=''}catch(error){notice(errorText(error));$('connectionStatus').textContent=errorText(error)}finally{connecting=false;render();schedulePoll()}
});
const media=matchMedia('(prefers-reduced-motion: reduce)');
const reduced=()=>state.reduced||media.matches;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const busy=()=>animating||settling||!!state.pending;
const betsClosed=()=>busy()||startingSpin||commandBusy||!room||room.status!=='betting'||ownReady()||bettingExpired();
const center=el=>{const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}};
function notice(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2800)}
function animateCounter(el,from,to,duration=650){return new Promise(resolve=>{if(reduced()){el.textContent=fmt(to);resolve();return}const start=performance.now();function frame(now){const p=Math.min(1,(now-start)/duration),t=1-(1-p)**3;el.textContent=fmt(from+(to-from)*t);if(p<1)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)})}

function fly(from,to,{amount=100,delay=0,duration=530,kind='bet',fade=false,owner='me'}={}){
  if(reduced())return Promise.resolve();
  const a=from instanceof Element?center(from):from,b=to instanceof Element?center(to):to;
  if(!a||!b||!Number.isFinite(a.x)||!Number.isFinite(b.x))return Promise.resolve();
  const chip=document.createElement('i');chip.className=`flight-chip ${owner} chip-${amount>=5000?5000:amount>=1000?1000:amount>=500?500:100}`;const label=document.createElement('span');label.textContent=short(amount);chip.append(label);addChipDepth(chip);$('flightLayer').append(chip);
  const dx=b.x-a.x,dy=b.y-a.y,arc=Math.min(95,Math.max(28,Math.abs(dx)*.11+Math.abs(dy)*.12));
  chip.style.left=`${a.x-17}px`;chip.style.top=`${a.y-17}px`;
  const finalScale=kind==='bet'?.83:kind==='bank'?.65:.86;
  const frames=[{transform:'translate3d(0,0,0) perspective(600px) rotateX(28deg) rotateZ(-12deg) scale(1)',opacity:1,offset:0},{transform:`translate3d(${dx*.52}px,${dy*.42-arc}px,0) perspective(600px) rotateX(48deg) rotateZ(22deg) scale(1.08)`,opacity:1,offset:.46},{transform:`translate3d(${dx}px,${dy}px,0) perspective(600px) rotateX(24deg) rotateZ(42deg) scale(${finalScale})`,opacity:fade?0:1,offset:1}];
  const animation=chip.animate(frames,{duration,delay,easing:'cubic-bezier(.25,.65,.3,1)',fill:'both'});
  return animation.finished.catch(()=>{}).then(()=>chip.remove());
}

function makeBet(id,content,cls){const b=document.createElement('button');b.className=`bet-cell ${cls||''}`;b.dataset.bet=id;b.setAttribute('aria-label',`${BETS[id].label} 베팅, 당첨 시 원금 포함 ${BETS[id].multiplier}배`);b.innerHTML=content;b.addEventListener('click',()=>placeBet(id));b.addEventListener('pointerenter',()=>highlight(id));b.addEventListener('pointerleave',clearHighlight);b.addEventListener('focus',()=>highlight(id));b.addEventListener('blur',clearHighlight);return b}
function buildTable(){
  for(let n=0;n<=36;n++){const b=makeBet(`n${n}`,`<span>${n}</span>`,`number-cell ${COLOR(n)} ${n===0?'zero':''}`);if(n){b.style.setProperty('--col',Math.floor((n-1)/3)+2);b.style.setProperty('--row',3-((n-1)%3))}$('numberGrid').append(b)}
  for(const [id,bet]of Object.entries(BETS))if(bet.type)$('numberGrid').append(makeBet(id,'<span class="seam-target" aria-hidden="true">+</span>',`seam-bet ${bet.type}`));
  $('numberGrid').dataset.mode=betMode;
  for(let i=1;i<=3;i++)$('columnGrid').append(makeBet(`col${i}`,`${i}열 <small>${i} · ${i+3} · …</small>`));
  for(let i=1;i<=3;i++)$('dozenGrid').append(makeBet(`dozen${i}`,`${(i-1)*12+1} – ${i*12}`));
  for(const [id,label]of [['low','1–18'],['even','짝수'],['red','<span class="color-diamond" aria-hidden="true"></span><span>빨강</span>'],['black','<span class="color-diamond black" aria-hidden="true"></span><span>검정</span>'],['odd','홀수'],['high','19–36']])$('outsideGrid').append(makeBet(id,label));
}
const cell=id=>document.querySelector(`[data-bet="${id}"]`);
function betPoint(id){return center(cell(id))}

function positionSeams(){
  const portrait=matchMedia('(max-width:620px)').matches;
  for(const [id,bet]of Object.entries(BETS)){
    if(!bet.type)continue;const elements=bet.numbers.map(n=>cell(`n${n}`));let x,y;
    if(bet.numbers[0]===0){const [zero,n]=elements;x=portrait?n.offsetLeft+n.offsetWidth/2:zero.offsetLeft+zero.offsetWidth;y=portrait?zero.offsetTop+zero.offsetHeight:n.offsetTop+n.offsetHeight/2}
    else{x=elements.reduce((sum,e)=>sum+e.offsetLeft+e.offsetWidth/2,0)/elements.length;y=elements.reduce((sum,e)=>sum+e.offsetTop+e.offsetHeight/2,0)/elements.length}
    cell(id).style.setProperty('--x',`${x}px`);cell(id).style.setProperty('--y',`${y}px`);
  }
}
function clearHighlight(){document.querySelectorAll('.coverage').forEach(el=>el.classList.remove('coverage'))}
function highlight(id){clearHighlight();if(busy()||id.startsWith('n')||matchMedia('(hover: none)').matches)return;for(const n of BETS[id].numbers)cell(`n${n}`).classList.add('coverage')}
function renderBets(bets=state.bets,landedId=null){
  const stacks=cleanChips(state.pending?.chips||state.betChips,bets);
  for(const el of document.querySelectorAll('[data-bet]')){
    const id=el.dataset.bet,amount=bets[id]||0;let stack=el.querySelector('.bet-stack');
    el.classList.toggle('has-bet',amount>0);el.setAttribute('aria-label',`${BETS[id].label} 베팅, ${BETS[id].multiplier}배${amount?`, ${fmt(amount)} 골드, 칩 ${stacks[id].length}개`:''}`);
    if(!amount){stack?.remove();continue}
    if(!stack){stack=document.createElement('span');stack.className='bet-stack';stack.setAttribute('aria-hidden','true');el.append(stack)}
    const chips=stacks[id].slice(-6),signature=chips.join(',')+':'+amount;
    if(stack.dataset.signature!==signature){
      stack.replaceChildren();chips.forEach((chip,index)=>{const disc=document.createElement('i');disc.className=`stack-disc chip-${chip}`;disc.style.setProperty('--level',index);if(index===chips.length-1){const face=document.createElement('span');face.className='stack-face';face.textContent=short(amount);disc.append(face)}addChipDepth(disc);stack.append(disc)});stack.dataset.signature=signature;
    }
    stack.classList.toggle('landed',id===landedId);
  }
  renderOpponentBets();
}
function renderOpponentBets(){
  const opponents=activePlayers().filter(player=>player.userId!==owner);
  for(const el of document.querySelectorAll('[data-bet]')){
    const visible=opponents.map((player,index)=>({player,index,amount:Number(player.bets?.[el.dataset.bet]||0)})).filter(item=>Number.isSafeInteger(item.amount)&&item.amount>0);
    let layer=el.querySelector('.opponent-chips');
    if(!visible.length){layer?.remove();continue}
    if(!layer){layer=document.createElement('span');layer.className='opponent-chips';layer.setAttribute('aria-hidden','true');el.append(layer)}
    const signature=visible.map(item=>item.player.userId+':'+item.amount).join('|');
    if(layer.dataset.signature===signature)continue;
    layer.replaceChildren();layer.dataset.signature=signature;
    for(const {player,index,amount} of visible){
      const stack=document.createElement('span');stack.className='opponent-stack';stack.style.setProperty('--opponent',String(index));
      stack.title=(player.computer?'컴퓨터':player.name||'상대')+' · '+fmt(amount)+' G';
      const chip=amount>=5000?5000:amount>=1000?1000:amount>=500?500:100;
      const disc=document.createElement('i');disc.className='stack-disc chip-'+chip;disc.style.setProperty('--level','0');
      const face=document.createElement('span');face.className='stack-face';face.textContent=short(amount);disc.append(face);addChipDepth(disc);stack.append(disc);layer.append(stack);
    }
  }
}
function renderHistory(){const h=$('history');h.replaceChildren();if(!state.history.length){const e=document.createElement('span');e.className='history-empty';e.textContent='첫 번째 공을 기다리는 중';h.append(e);return}for(const [index,n] of state.history.slice(0,15).entries()){const e=document.createElement('span');e.className=`history-number ${COLOR(n)}`;e.textContent=n;e.title=`${index+1}번째 최근 결과: ${n}`;h.append(e)}}
function render({bets=true,balance=true}={}){
  const locked=betsClosed(),sum=totalBets(state.pending?.bets||state.bets);
  if(balance)$('balance').textContent=fmt(Math.max(0,state.balance-(ownReady()?0:totalBets(state.bets))));
  $('totalBet').innerHTML=`${fmt(sum)} <small>G</small>`;
  $('spinButton').disabled=commandBusy||busy()||!room||room.status!=='betting'||ownReady()||(sum===0&&bettingRemaining()===null)||bettingExpired();
  $('spinLabel').textContent=settling?'정산하는 중':resultReadyId?'결과 확인 중':state.pending||animating?'공이 도는 중':commandBusy?'확인하는 중':room?.status==='finished'?'다른 회원 확인 중':bettingExpired()?'마감 확인 중':ownReady()?(activePlayers().length===1?'마감 기다리는 중':`시작 대기 ${activePlayers().filter(player=>player.ready).length}/${activePlayers().length}`):sum?'시작':bettingRemaining()!==null?'시작 · 관람':'칩을 올려주세요';
  $('undoButton').disabled=locked||!undo.length||!totalBets(state.bets);
  $('clearButton').disabled=locked||!totalBets(state.bets);
  $('repeatButton').disabled=locked||totalBets(state.lastBets)===0;
  for(const el of document.querySelectorAll('[data-chip]')){const chip=Number(el.dataset.chip);el.disabled=locked||chip>state.balance-totalBets(state.bets)||chip+totalBets(state.bets)>MAX_BET;const selected=chip===state.selectedChip;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected))}
  for(const el of document.querySelectorAll('[data-bet]')){const type=BETS[el.dataset.bet].type;el.disabled=locked||(type&&type!==betMode)||(el.classList.contains('number-cell')&&betMode!=='straight');if(type){el.tabIndex=type===betMode?0:-1;el.setAttribute('aria-hidden',String(type!==betMode&&!el.querySelector('.bet-stack')))}}
  for(const el of document.querySelectorAll('[data-bet-mode]')){el.disabled=locked;el.setAttribute('aria-pressed',String(el.dataset.betMode===betMode))}
  $('chipHint').textContent=`선택한 칩 ${fmt(state.selectedChip)} G`;
  for(const id of ['soundButton','wheelSoundButton']){$(id).setAttribute('aria-label',state.sound?'소리 끄기':'소리 켜기');$(id).title=state.sound?'소리 끄기':'소리 켜기';$(id).querySelector('use').setAttribute('href',state.sound?'#i-sound':'#i-mute')}
  $('motionButton').setAttribute('aria-pressed',String(reduced()));$('motionButton').textContent=reduced()?'모션 줄임 켜짐':'모션 줄이기';document.body.classList.toggle('reduced-motion',reduced());document.body.classList.toggle('is-spinning',animating);
  sound.setEnabled(state.sound);wheel.setReduced(reduced());
  if(bets)renderBets(state.pending?.bets||state.bets);renderHistory();renderRoom();
}
function setStatus(text){$('statusText').textContent=text}
function clearResult(){document.querySelectorAll('.hit').forEach(e=>e.classList.remove('hit'));$('resultBanner').classList.remove('won');$('resultNumber').className='result-number';$('resultNumber').textContent='✦';$('resultTitle').textContent='행운을 놓을 자리를 골라주세요';$('resultDetail').textContent='칩을 고른 뒤 숫자를 누르면 바로 놓여요.';lastResult=null;computerOutcome=null;renderComputerResult()}
function placeBet(id){
  if(betsClosed())return;
  const amount=state.selectedChip,origin=document.querySelector(`[data-chip="${amount}"]`);
  clearHighlight();commitBet(id,amount,origin||$('chipAnchor'));
}
async function commitBet(id,chipAmount,origin){
  if(betsClosed())return;sound.unlock().catch(()=>{});
  let amount,accepted=false;
  await mutate(()=>{if(state.pending)return;amount=chipAmount;const sum=totalBets(state.bets);if(sum+amount>MAX_BET){notice('한 판에는 최대 50,000 G까지 베팅할 수 있어요.');return}if(sum+amount>state.balance){notice('베팅할 골드가 부족해요. 칩 금액을 낮춰주세요.');return}state.selectedChip=amount;state.bets[id]=(state.bets[id]||0)+amount;(state.betChips[id]??=[]).push(amount);undo.push({id,amount});accepted=true});
  if(!accepted){render();return}queueDraft();if(lastResult)clearResult();render({bets:false});
  const source=origin||$('chipAnchor'),target=betPoint(id);sound.chip();
  await fly(source,target,{amount});if(!busy())renderBets(state.bets,id);
}
async function removeBets(all){
  if(betsClosed())return;let outgoing={};await mutate(()=>{if(state.pending)return;if(all){outgoing={...state.bets};state.bets={};state.betChips={};undo=[]}else{let action;while(undo.length){action=undo.pop();if((state.bets[action.id]||0)>=action.amount)break;action=null}if(!action)return;outgoing[action.id]=action.amount;state.bets[action.id]-=action.amount;const chips=state.betChips[action.id]||[],index=chips.lastIndexOf(action.amount);if(index>=0)chips.splice(index,1);if(!state.bets[action.id])delete state.bets[action.id]}});
  queueDraft();render();const tray=$('chipAnchor');sound.chip();await Promise.all(Object.entries(outgoing).map(([id,amount],i)=>fly(betPoint(id),tray,{amount,duration:460,delay:i*28,fade:true})));
}
async function repeatBets(){
  if(betsClosed())return;let copied=false;await mutate(()=>{if(state.pending)return;const total=totalBets(state.lastBets);if(!total)return;if(total>state.balance){notice('이전과 똑같이 베팅하기에는 골드가 부족해요.');return}state.bets={...state.lastBets};state.betChips=cleanChips(state.lastChips,state.bets);undo=Object.entries(state.betChips).flatMap(([id,chips])=>chips.map(amount=>({id,amount})));copied=true});
  if(!copied){render();return}queueDraft();clearResult();render({bets:false});const source=$('chipAnchor');await Promise.all(Object.entries(state.bets).map(([id,amount],i)=>fly(source,betPoint(id),{amount,delay:Math.min(i*34,500)})));if(!busy())renderBets();sound.chip();
}
async function startSpin(){
  if(commandBusy||busy()||!room||room.status!=='betting'||bettingExpired())return;
  sound.unlock().catch(()=>{});
  if(ownReady())return;
  if(!totalBets(state.bets)&&bettingRemaining()===null)return;
  clearTimeout(draftTimer);
  await command('ready',{ready:true,bets:{...state.bets}});
}
function openWheelPopup(spin){
  const modal=$('wheelDialog');resultReadyId=null;$('confirmResultButton').hidden=true;$('confirmResultButton').disabled=true;modal.dataset.spin=spin.id;modal.dataset.phase='spinning';modal.classList.remove('closing');
  $('wheelOutcome').hidden=true;$('wheelFootnote').hidden=false;$('wheelDialogTitle').textContent='공이 멈추는 순간.';$('wheelDialogHint').textContent=totalBets(spin.bets)?`베팅 마감 · ${fmt(totalBets(spin.bets))} G`:'관람 · 베팅 없음';
  if($('helpDialog').open)$('helpDialog').close();
  document.body.classList.add('wheel-open');if(!modal.open)modal.showModal();wheel.setVisible(true);$('wheelDialogTitle').focus({preventScroll:true});
}
async function closeWheelPopup(spinId,{instant=false}={}){
  const modal=$('wheelDialog');if(spinId&&modal.dataset.spin!==spinId)return;sound.stopRoll();
  if(modal.open&&!instant&&!reduced()&&!document.hidden){modal.classList.add('closing');await sleep(280)}
  if(spinId&&modal.dataset.spin!==spinId)return;
  if(modal.open)modal.close();modal.classList.remove('closing');wheel.setVisible(false);document.body.classList.remove('wheel-open');
}
function revealResult(result,{pending=false}={}){
  lastResult=result;const {number,total,gross,fee,net}=result;
  const color=COLOR(number),colorName=color==='red'?'빨강':color==='black'?'검정':'초록';
  $('resultNumber').className=`result-number ${color}`;$('resultNumber').textContent=number;
  $('resultBanner').classList.toggle('won',net>0);
  $('resultTitle').textContent=total?`${fmt(total)} G ${pending?'지급 예정':'지급'}${net>0?` · 순이익 +${fmt(net)} G`:''}`:'다음 행운을 기다려볼까요';
  $('resultDetail').textContent=total?`당첨 ${fmt(gross)} G − 수수료 ${fmt(fee)} G (1%)`:`${number} · ${colorName} 당첨 / 이번 베팅 ${fmt(result.stake)} G`;
  setStatus(`${number} · ${colorName}${number===0?'':number%2?' · 홀수':' · 짝수'}`);
  cell(`n${number}`).classList.add('hit');for(const w of result.wins)cell(w.id).classList.add('hit');
  $('wheel').setAttribute('aria-label',`룰렛 결과 ${number}, ${colorName}. 당첨금 ${fmt(total)} 골드 ${pending?'지급 예정':'지급'}.`);
  $('wheelDialog').dataset.phase='resolved';$('wheelDialogTitle').textContent='공이 멈췄어요.';$('wheelDialogHint').textContent=pending?'확인을 누르면 칩을 정산해요':'칩을 정산하고 있어요';
  $('wheelOutcomeNumber').className=`result-number ${color}`;$('wheelOutcomeNumber').textContent=number;
  $('wheelOutcomeTitle').textContent=total?`${fmt(total)} G ${pending?'지급 예정':'지급'}`:`${number} · ${colorName}`;
  $('wheelOutcomeDetail').textContent=total?`당첨 ${fmt(gross)} G − 수수료 ${fmt(fee)} G`:pending?'확인을 눌러 테이블로 돌아가요':'테이블로 돌아가요';
  if(!result.stake){$('resultTitle').textContent='베팅 없이 함께 관람했어요';$('resultDetail').textContent=`${number} · ${colorName}`;$('wheelOutcomeDetail').textContent='확인을 누르면 테이블로 돌아가요'}
  renderComputerResult();
  $('wheelOutcome').hidden=false;$('wheelFootnote').hidden=true;
}
function showSpinResult(id){
  sound.stopRoll();
  if(settling||resultReadyId===id)return;
  const spin=state.pending;const paid=spin?.id===id?payout(spin.bets,spin.number):null;const result=paid?{...paid,number:spin.number,net:paid.total-paid.stake,bets:spin.bets}:null;
  if(!result){animating=false;closeWheelPopup(id,{instant:true});render();return}
  animating=false;resultReadyId=id;wheel.showResult(result.number);
  render();revealResult(result,{pending:true});
  if(room?.mode==='solo'&&computerOutcome?.id!==id)schedulePoll(0);
  $('confirmResultButton').hidden=false;$('confirmResultButton').disabled=false;
  $('confirmResultButton').textContent='확인';$('confirmResultButton').focus({preventScroll:true});
}
async function confirmResult(){
  const id=resultReadyId;if(!id||settling)return;
  settling=true;resultReadyId=null;$('confirmResultButton').disabled=true;
  $('confirmResultButton').textContent='정산하는 중';let result,oldBalance;
  const spin=state.pending;if(!spin||spin.id!==id){settling=false;render();return}
  const calculated=payout(spin.bets,spin.number);result={...calculated,number:spin.number,net:calculated.total-calculated.stake,bets:{...spin.bets}};oldBalance=state.balance;
  try{
    if(room?.mode==='solo'&&computerOutcome?.id!==id)applySnapshot(await rpc('read',{code:room.code}));
    const data=await rpc('confirm',{code:room.code,roundId:id});state.lastSettled=id;state.history.unshift(spin.number);state.history=state.history.slice(0,30);state.pending=null;state.bets={};state.betChips={};undo=[];applySnapshot(data);
  }
  catch(error){settling=false;resultReadyId=id;$('confirmResultButton').disabled=false;$('confirmResultButton').textContent='확인';notice(errorText(error));render();if(exitRequested){exitRequested=false;void leaveRoom({exit:true})}else schedulePoll(200);return}

  if(!result){await closeWheelPopup(id,{instant:true});settling=false;render();return}
  render({bets:false,balance:false});revealResult(result);renderHistory();
  if(result.net>0)sound.win();
  await closeWheelPopup(id,{instant:document.hidden});
  if(document.hidden){settling=false;render();if(exitRequested){exitRequested=false;void leaveRoom({exit:true})}else schedulePoll(200);return}
  if(matchMedia('(max-width:940px)').matches){$('playSection').scrollIntoView({behavior:reduced()?'instant':'smooth',block:'start'});await sleep(reduced()?0:650)}
  const tableRect=$('feltTable').getBoundingClientRect(),bank={x:tableRect.left+tableRect.width/2,y:tableRect.top-12};
  const winners=new Set(result.wins.map(w=>w.id));
  const loseFlights=Object.entries(result.bets).filter(([bet])=>!winners.has(bet)).map(([bet,amount],i)=>{
    const el=cell(bet);el.querySelector('.bet-stack')?.remove();
    return fly(betPoint(bet),bank,{amount,delay:Math.min(i*35,420),duration:620,fade:true,kind:'bank'});
  });
  const winFlights=result.wins.flatMap((w,i)=>{
    const count=Math.min(4,Math.max(2,Math.ceil(w.return/5000)));
    return Array.from({length:count},(_,j)=>fly({x:bank.x+(j-2)*8,y:bank.y},betPoint(w.id),{amount:Math.max(100,Math.round(w.return/count/100)*100),delay:200+i*75+j*65,duration:620,kind:'payout'}));
  });
  await Promise.all([...loseFlights,...winFlights]);
  if(result.total){
    sound.chip();await sleep(reduced()?0:200);
    await Promise.all(result.wins.flatMap((w,i)=>{
      const el=cell(w.id);el.querySelector('.bet-stack')?.remove();
      return Array.from({length:Math.min(3,Math.max(1,Math.ceil(w.return/5000)))},(_,j)=>fly(betPoint(w.id),$('balance'),{amount:Math.max(100,w.stake),delay:i*60+j*65,duration:680,fade:true,kind:'bank'}));
    }));
    await animateCounter($('balance'),oldBalance,state.balance);
  }
  settling=false;render({balance:!result.total});

  if(state.balance<100&&result.stake>0)notice('베팅할 골드가 부족해요.');if(exitRequested){exitRequested=false;void leaveRoom({exit:true})}else schedulePoll(200);
}
const wheel=new RouletteWheel($('wheel'),{
  onTick:(p,b)=>{if(b)sound.roll(p,b)},
  onFrame:(p,pose)=>sound.updateRoll(p,pose),
  onPhase:phase=>setStatus({orbit:'공이 원판을 돌고 있어요',drop:'천천히 안쪽으로 내려옵니다…',rebound:'턱을 맞고 다시 바깥으로…',return:'공이 다시 안쪽으로 파고듭니다',settle:'마지막 튕김, 아직 모릅니다',coast:'원판이 천천히 멈추고 있어요'}[phase]),
  onDone:id=>showSpinResult(id)
});
buildTable();document.querySelectorAll('.casino-chip').forEach(addChipDepth);const gridObserver=new ResizeObserver(positionSeams);gridObserver.observe($('numberGrid'));
for(const button of document.querySelectorAll('[data-bet-mode]'))button.addEventListener('click',()=>{if(betsClosed())return;betMode=button.dataset.betMode;$('numberGrid').dataset.mode=betMode;$('betModeHint').textContent=betMode==='straight'?'숫자에 칩을 올려주세요':betMode==='split'?'두 숫자 사이의 금색 점에 칩을 올려주세요':'네 숫자가 만나는 금색 점에 칩을 올려주세요';clearHighlight();positionSeams();render({bets:false})});
for(const button of document.querySelectorAll('[data-roulette-mode]'))button.addEventListener('click',()=>{if(commandBusy||connecting||room)return;selectMode(button.dataset.rouletteMode)});
$('startSoloButton').addEventListener('click',()=>{sound.unlock().catch(()=>{});selectMode('solo',{refresh:false});void command('create',{mode:'solo'})});
$('createRoomButton').addEventListener('click',()=>{sound.unlock().catch(()=>{});selectMode('online',{refresh:false});void command('create',{mode:'online'})});
$('joinForm').addEventListener('submit',event=>{event.preventDefault();void joinRoom($('joinCode').value)});
$('refreshRooms').addEventListener('click',()=>void poll());
$('cancelReady').addEventListener('click',async()=>{if(bettingExpired())return;const data=await command('ready',{ready:false});if(data&&room?.status==='betting'&&!ownReady())queueDraft()});
$('copyCode').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(room.code);notice('방 코드를 복사했어요.')}catch{notice('방 코드: '+(room?.code||''))}});
$('spinButton').addEventListener('click',startSpin);
$('confirmResultButton').addEventListener('click',confirmResult);
$('brandButton').addEventListener('click',()=>{if(room)void leaveRoom();else send({type:'exit'})});
for(const id of ['soundButton','wheelSoundButton'])$(id).addEventListener('click',async()=>{sound.unlock().catch(()=>{});await mutate(()=>state.sound=!state.sound);render({bets:false})});
$('motionButton').addEventListener('click',async()=>{await mutate(()=>state.reduced=!state.reduced);render({bets:false})});
media.addEventListener('change',()=>render({bets:false}));
for(const el of document.querySelectorAll('[data-chip]'))el.addEventListener('click',async()=>{
  if(betsClosed())return;
  await mutate(()=>{if(!state.pending)state.selectedChip=Number(el.dataset.chip)});
  render({bets:false});sound.unlock().catch(()=>{});
});
$('undoButton').addEventListener('click',()=>removeBets(false));$('clearButton').addEventListener('click',()=>removeBets(true));$('repeatButton').addEventListener('click',repeatBets);
const dialog=$('helpDialog');$('helpButton').addEventListener('click',()=>dialog.showModal());$('closeHelp').addEventListener('click',()=>dialog.close());$('helpDone').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
$('wheelDialog').addEventListener('cancel',event=>{if(busy())event.preventDefault()});
$('wheelDialog').addEventListener('close',()=>{document.body.classList.remove('wheel-open');wheel.setVisible(false)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)sound.stopRoll();else if(state.pending&&animating)sound.beginRoll(state.pending);renderBettingClock();schedulePoll(document.hidden?undefined:100)});
window.addEventListener('pagehide',()=>{closed=true;clearTimeout(pollTimer);clearTimeout(draftTimer);clearTimeout(bettingClockTimer);sound.stopRoll();for(const pending of requests.values()){clearTimeout(pending.timer);pending.reject(new Error('closed'))}requests.clear()});
render();send({type:'ready'});
setTimeout(()=>{if(!initialized){$('connectionStatus').replaceChildren();const link=document.createElement('a');link.href='/world.html?game=roulette';link.target='_top';link.textContent='오쭈다 오락실에서 시작하기';$('connectionStatus').append(link)}},7000);
