import {suit,face,cardName,bestHand} from './engine.mjs?v=20261022-voice1';
import {createPokerSound,pokerActionCall} from './sound.mjs?v=20261022-seatvoices1';
import {createOnlineClient,rotateView} from './online-client.mjs?v=20261021-poker6';
import {createDealMotion} from './deal-motion.mjs?v=20261022-club1';

const sfx=createPokerSound();
const dealMotion=createDealMotion({play:({seat=0}={})=>void sfx.play('card',{pan:seat===1?-.4:seat===3?.4:0}),onFinish:()=>{
  if(queuedRoom){const next=queuedRoom;queuedRoom=null;acceptRoom(next);return;}
  render({animateDeal:false});
  if(game?.phase==='betting'&&game.turn===0)void sfx.play('turn');
  schedule();
}});
const app=document.querySelector('#app');
const fmt=n=>Number(n).toLocaleString('ko-KR');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
let game=null,record={bank:0,rounds:0,wins:0,difficulty:'normal',saved:null},key='',ready=false,pick=-1,timer=null,lobby=true,saveFailed=false,conflict=false;
const send=(type,detail={})=>{if(parent!==window)parent.postMessage({source:'ojjuda-poker',type,...detail},location.origin);};
let playingView=null;

let mode='online',online=null,onlineError='',roomList=[],queuedRoom=null,onlineLobby=false,wallet=null,leaveOnExit=false;
let visual={game:null,cards:[],shown:[],bets:[],pot:0,finished:false,street:0};
let movePending=false,lastClockWarning='';
const faces=['C','H','D','S'];
const cardBack = '<span class="back-border" aria-hidden="true"><span class="back-emblem">♠<small>OJJUDA</small></span></span>';
const cardFace = c => `<img class="card-face" src="cards/${faces[suit(c)]}-${face(c)}.svg" alt="" draggable="false" decoding="async">`;
let peekedCard = null, peekDrag = null, peekPointer = null, peekClickUntil = 0;
const finalCardKey = () => game?.players[0].cards.length === 7 ? `${game._roomId}:${game._round}:${game.players[0].cards[6]}` : null;
const finalCardCovered = () => !!finalCardKey() && game.phase !== 'finished' && peekedCard !== finalCardKey();
function card(c,{hidden=false,publicCard=false,pendingPublic=false,best=false,selected=false,button=false,index=0,selectable=false,fresh=false,revealed=false,fan=0,dealSeat=0,dealOrder=index,peek=false}={}){
  const tag=button||peek?'button':'span',label=peek?'마지막 카드 · 절반만 아래로 내리면 공개':hidden?'비공개 카드':cardName(c);
  return `<${tag} class="card${hidden?' back':''}${peek?' final-covered':''}${publicCard?' public':''}${pendingPublic?' pending-public':''}${best?' best':''}${selected?' selected':''}${selectable?' selectable':''}${fresh?' dealing':''}${revealed?' revealing':''}" ${fresh?`data-deal-seat="${dealSeat}" data-deal-order="${dealOrder}"`:""} ${button||peek?`type="button" data-card="${index}" data-hand-card="${c}" aria-pressed="${selected}"`:''} ${peek?'data-peek-card aria-expanded="false"':''} style="--i:${index};--fan:${fan}deg" aria-label="${label}${publicCard?' · 공개':pendingPublic?' · 공개 예정':''}">${peek?`<span class="peek-face" aria-hidden="true">${cardFace(c)}</span><span class="peek-cover" aria-hidden="true">${cardBack}</span><span class="card-state">↓ 반만 내리기</span>`:hidden?cardBack:cardFace(c)}${publicCard||pendingPublic?`<span class="card-state" aria-hidden="true">${pendingPublic?'공개 예정':'공개'}</span>`:''}</${tag}>`;
}
function revealFinalCard(node=document.querySelector('#cards-dialog[open] [data-peek-card]')||app.querySelector('[data-peek-card]')){
  if(!finalCardCovered())return;
  const revealKey=finalCardKey(),distance=peekDrag?.distance||0;
  if(peekDrag){peekPointer=peekDrag.id;peekClickUntil=Date.now()+600;}
  peekedCard=revealKey;peekDrag=null;
  void sfx.play('reveal');
  const finish=()=>{
    if(finalCardKey()!==revealKey||node&&!node.isConnected)return;
    render({animateDeal:false});
    if(document.querySelector('#cards-dialog').open)fillCards(0);
  };
  if(!node?.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return;}
  node.classList.remove('is-peeking');node.classList.add('is-revealing');
  const cover=node.querySelector('.peek-cover'),face=node.querySelector('.peek-face'),height=node.getBoundingClientRect().height;
  const options={duration:220,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'};
  try{
    const uncover=face.animate([{clipPath:getComputedStyle(face).clipPath},{clipPath:'inset(0 0 0 0)'}],options);
    const slide=cover.animate([{transform:`translateY(${distance}px)`,opacity:1},{transform:`translateY(${Math.max(distance+24,height*.8)}px)`,opacity:0}],options);
    Promise.all([uncover.finished,slide.finished]).then(finish,finish);
  }catch{finish();}
}
document.addEventListener('pointerdown',event=>{
  if(peekPointer===null)peekClickUntil=0;
  if(peekDrag){if(event.pointerId!==peekDrag.id)cancelPeek();return;}
  const node=event.target.closest('[data-peek-card]');
  if(!node||event.button!==0||!finalCardCovered()||dealMotion.active())return;
  event.preventDefault();
  peekDrag={node,id:event.pointerId,start:event.clientY,distance:0,key:finalCardKey(),height:node.getBoundingClientRect().height};
  node.classList.add('is-peeking');
  try{node.setPointerCapture(event.pointerId);}catch{}
});
document.addEventListener('pointermove',event=>{
  if(!peekDrag||event.pointerId!==peekDrag.id)return;
  if(peekDrag.key!==finalCardKey()||!peekDrag.node.isConnected){cancelPeek();return;}
  event.preventDefault();
  peekDrag.distance=Math.max(0,Math.min(peekDrag.height,event.clientY-peekDrag.start));
  peekDrag.node.style.setProperty('--peek-distance',peekDrag.distance+'px');
  peekDrag.node.style.setProperty('--peek-hidden',Math.max(0,100-peekDrag.distance/peekDrag.height*100)+'%');
  if(peekDrag.distance>=peekDrag.height*.5)revealFinalCard(peekDrag.node);
});
function cancelPeek(){
  if(!peekDrag)return;
  const {node}=peekDrag;peekDrag=null;
  node.classList.remove('is-peeking');node.style.removeProperty('--peek-distance');node.style.removeProperty('--peek-hidden');
}
document.addEventListener('pointerup',event=>{
  if(peekPointer===event.pointerId){peekPointer=null;peekClickUntil=Date.now()+600;}
  if(!peekDrag||event.pointerId!==peekDrag.id)return;
  const reveal=peekDrag.key===finalCardKey()&&peekDrag.distance>=peekDrag.height*.5;
  if(reveal)revealFinalCard(peekDrag.node);else cancelPeek();
});
for(const type of ['pointercancel','lostpointercapture'])document.addEventListener(type,event=>{if(peekDrag?.id===event.pointerId)cancelPeek();if(type==='pointercancel'&&peekPointer===event.pointerId)peekPointer=null;});
document.addEventListener('keydown',event=>{
  if(event.target.closest('[data-peek-card]')&&['Enter',' ','ArrowDown'].includes(event.key)){
    event.preventDefault();if(!dealMotion.active())revealFinalCard();
  }
});
function chipStack(amount=500,{mini=false}={}){
  const count=mini?1:Math.min(4,Math.max(2,Math.ceil(amount/750)));
  return `<span class="chip-stacks${mini?' mini':''}" aria-hidden="true">${Array.from({length:count},(_,i)=>`<span class="chip-stack ${['jade','ivory','burgundy','gold'][i]}" style="--stack:${i}">${Array.from({length:mini?2:3+(i+Math.floor(amount/100))%4},(_,j)=>`<i class="chip" style="--layer:${j}"><span>${['50','100','500','1K'][i]}</span></i>`).join('')}</span>`).join('')}</span>`;
}
function dealer(index){return game.dealer===index?'<span class="dealer" title="이번 판 딜러" aria-label="딜러">D</span>':'';}
function canRefill(){return !!wallet&&!wallet.locked&&wallet.gold<1000;}
function walletView(){
  const refill=canRefill(),amount=wallet?fmt(wallet.gold):'…';
  const content=`<small>${refill?'골드 충전 +':'보유 골드'}</small><b>${amount}<span>G</span></b>`;
  return refill?`<button type="button" class="wallet wallet-refill" data-action="refill" aria-label="보유 골드 ${amount} G · 충전하기" ${online?.busy?'disabled':''}>${content}</button>`:`<div class="wallet">${content}</div>`;
}
function header(){
  return `<header class="app-header"><button class="table-back small-button" data-action="exit" aria-label="게임 목록으로 돌아가기">← <span>목록</span></button><div class="title"><img class="logo" src="/favicon.svg" alt="오쭈다"><span>세븐포커<small>OJJUDA · POKER CLUB</small></span></div><div class="header-tools"><button class="small-button" data-action="sound" aria-label="음성·효과음 설정" aria-haspopup="dialog"><svg class="sound-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4m12-1c2 2 2 6 0 8m3-11c4 4 4 10 0 14"/></svg>${sfx.settings().enabled&&sfx.settings().volume?'소리 켬':'소리 끔'}</button><button class="small-button" data-action="help">족보</button>${walletView()}</div></header>${saveFailed?'<div class="save-warning" role="alert">이 기기에 저장하지 못했어요. 창을 닫으면 진행 내용이 사라질 수 있어요.</div>':''}`;
}
function entryCard(content,{waiting=false}={}){
  return `<section class="poker-entry-shell"><div class="game-entry poker-entry" aria-labelledby="poker-title">
    <div class="ge-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="13" height="18" rx="2"/><path d="M4 6H3v15h11M13.5 8l3 4-3 4-3-4z"/></svg></div>
    <span class="ge-kicker">오쭈다 오락실 · 멀티게임</span><h1 class="ge-title" id="poker-title">세븐포커 <small>19+</small></h1>
    <p class="ge-copy">일곱 장의 카드로 나만의 승부를 즐겨보세요.</p>
    <div class="poker-entry-wallet"><span>보유 골드</span><strong>${wallet?fmt(wallet.gold)+' <small>G</small>':'확인 중…'}</strong></div>
    ${waiting?'':`<div class="seg ge-play-modes" role="group" aria-label="게임 모드"><button type="button" data-action="online-back" class="${onlineLobby?'':'on'}" aria-pressed="${!onlineLobby}">혼자 하기</button><button type="button" data-action="online" class="${onlineLobby?'on':''}" aria-pressed="${onlineLobby}" ${!wallet?'disabled':''}>온라인 대전</button></div>`}
    ${content}${refillButton()}
    <p class="ge-hint online-connection" role="status">${esc(onlineError)}</p>
    <button class="ge-secondary" type="button" data-action="exit">게임 목록으로</button>
    <details class="ge-more"><summary>게임 안내 · 설정</summary><p>만 19세 이상 · 최대 4명 · 기본 참가비 50 G<br>혼자 하기와 온라인 대전은 같은 골드를 사용해요.</p><p>${fmt(record.rounds)}판 · ${fmt(record.wins)}승 · 승률 ${record.rounds?Math.round(record.wins/record.rounds*100):0}%</p><button class="ge-secondary" type="button" data-action="help">게임 방법 · 족보 보기</button><button class="ge-secondary" type="button" data-action="sound" aria-label="음성·효과음 설정" aria-haspopup="dialog">${sfx.settings().enabled&&sfx.settings().volume?'소리 켬':'소리 끔'}</button></details>
  </div></section>`;
}
function renderLobby(){
  const canResume=game&&game.phase!=='finished';
  app.innerHTML=entryCard(`<div class="poker-solo-setup"><span class="ge-label" id="difficulty-label">컴퓨터 난이도</span><div class="seg" role="group" aria-labelledby="difficulty-label">${[['easy','편하게'],['normal','보통']].map(([id,label])=>`<button type="button" data-difficulty="${id}" class="${record.difficulty===id?'on':''}" aria-pressed="${record.difficulty===id}" ${canResume?'disabled':''}>${label}</button>`).join('')}</div><button class="ge-primary" type="button" data-action="${canResume?'resume':'start'}" ${(!wallet||record.bank<50)&&!canResume?'disabled':''}>${canResume?'하던 게임 이어서 하기':'혼자 시작하기'}</button><span class="ge-hint">나 1명 + 컴퓨터 3명</span></div>`);
}
function refillButton(){
 if(!canRefill())return '';
 return `<button class="refill" data-action="refill" ${online?.busy?'disabled':''}>5,000 G 충전 · ${wallet.free_left?`무료 (남은 ${wallet.free_left}회)`:'5쭈'}</button>`;
}
function acceptWallet(next){wallet=next;record.bank=next.gold;record.rounds=next.rounds;record.wins=next.wins;}
function roomBar(){
  if(mode!=='online'||!online?.room)return '';
  const r=online.room;
  if(r.mode==='solo')return '<div class="online-room-bar solo-room"><span>컴퓨터와 플레이</span><button class="small-button" data-action="online-leave">게임 끝내기</button></div><p class="online-connection" role="status">'+esc(onlineError)+'</p>';
  return `<div class="online-room-bar"><span>${esc(r.title)} <b>${esc(r.code)}</b></span><span class="online-clock" aria-label="차례 제한 30초 · 남은 시간" aria-live="off"></span><button class="small-button" data-action="online-copy">코드 복사</button><button class="small-button" data-action="online-leave">방 나가기</button></div><p class="online-connection" role="status">${esc(onlineError)}</p>`;
}
function renderOnlineLobby(){
  const r=online?.room;
  app.innerHTML=entryCard(r?`<h2 class="poker-waiting-title">${esc(r.title)}</h2><div class="poker-waiting-code"><strong>${esc(r.code)}</strong><button class="ge-secondary" type="button" data-action="online-copy">복사</button></div><p class="ge-hint">참여 ${r.names.length} / ${r.capacity}명</p><div class="online-seats">${Array.from({length:r.capacity},(_,i)=>`<div class="online-seat ${r.names[i]?'occupied':''}"><strong>${esc(r.names[i]||'참여를 기다리는 중')}</strong><small>${i===r.hostSeat?'방장':r.names[i]?'참여 완료':'빈자리'}</small></div>`).join('')}</div><p class="ge-hint">방 번호를 알려 함께할 사람을 초대해요.<br>두 명 이상 모이면 방장이 시작할 수 있어요.</p><button class="ge-primary" type="button" data-action="online-start" ${r.hostSeat!==r.seat||r.names.length<2?'disabled':''}>${r.hostSeat===r.seat?'게임 시작하기':'방장이 시작하기를 기다리는 중'}</button><button class="ge-secondary" type="button" data-action="online-leave">방 나가기</button>`:`<form id="poker-create" class="poker-entry-form"><label class="ge-label" for="poker-room-title">방 제목</label><input id="poker-room-title" name="title" maxlength="40" value="세븐포커 같이 해요" required><label class="ge-label" for="poker-room-capacity">최대 인원</label><select id="poker-room-capacity" name="capacity"><option value="2">2명</option><option value="3">3명</option><option value="4" selected>4명</option></select><button class="ge-primary" type="submit">방 만들기</button></form><details class="ge-more"><summary>방 번호로 참여하기</summary><form id="poker-join" class="poker-entry-form"><label class="ge-label" for="poker-room-code">8자리 방 번호</label><input id="poker-room-code" name="code" maxlength="8" pattern="[a-fA-F0-9]{8}" placeholder="예: A1B2C3D4" autocapitalize="characters" autocomplete="off" required><button class="ge-secondary" type="submit">입장하기</button></form></details><section class="poker-room-list"><h2>열린 대전방 <button class="ge-secondary" type="button" data-action="online-refresh">새로고침</button></h2><div class="online-room-list">${roomList.length?roomList.map(room=>`<button type="button" data-room-code="${esc(room.code)}"><span><b>${esc(room.title)}</b><small>${esc(room.code)}</small></span><span>${room.players}/${room.capacity}명 →</span></button>`).join(''):'<p class="ge-hint">기다리는 방이 없어요.<br>방을 만들어 함께 시작해 보세요.</p>'}</div></section>`,{waiting:!!r});
}
function onlineNotice(message){onlineError=message;document.querySelectorAll('.online-connection').forEach(el=>el.textContent=message);}
function acceptRoom(room){
  if(!online)return;
  if(dealMotion.active()&&room?.game){queuedRoom=room;return;}
  queuedRoom=null;if(room)onlineLobby=room.mode!=='solo';
  const next=room?rotateView(room):null;
  if(next){
    const same=game&&game._roomId===room.id&&game._round===room.round,wasDone=game?.phase==='finished',oldTurn=game?.turn;
    if(same){const call=pokerActionCall(game.log,next.log,next.players,oldTurn);if(call)void sfx.play(call.kind,{seat:call.seat,foleyOnly:call.seat<0});}
    if(same)Object.assign(game,next);else {peekedCard=null;game={...next,_roomId:room.id,_round:room.round};}
    sfx.preloadPlayers(game.players.length);
    lobby=false;pick=-1;render();
    if(!wasDone&&game.phase==='finished')void sfx.play(game.result.net[0]>0?'win':'end');
    else if(oldTurn!==0&&game.turn===0&&!dealMotion.active())void sfx.play('turn');
  }else{sfx.preloadPlayers(0);game=null;lobby=true;render();}
}
async function refreshRooms(){try{roomList=await online.list();if(mode==='online'&&!online.room)render();}catch(error){onlineNotice(error.message);}}
async function onlineAction(button){
 const action=button.dataset.action;
 if(action==='online'){
  if(!wallet||!online)return;onlineLobby=true;lobby=!online.room?.game;render();if(!online.room)await refreshRooms();return;
 }
 if(!online||online.busy)return;
 if(action==='online-back'){onlineLobby=false;lobby=true;render();return;}
 if(action==='online-refresh'){await refreshRooms();return;}
 if(action==='online-copy'){
  try{await navigator.clipboard.writeText(online.room.code);onlineNotice('방 코드를 복사했어요. 함께할 사람에게 알려 주세요.');}catch{onlineNotice('방 코드: '+online.room.code);}return;
 }
 if(action==='online-leave'){requestExit(true);return;}
 button.disabled=true;
 try{if(button.dataset.roomCode)await online.act('join',{code:button.dataset.roomCode});else if(action==='online-start')await online.act('start');else if(action==='online-ready')await online.act('ready');}
 finally{if(button.isConnected)button.disabled=false;}
}
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['poker-create','poker-join'].includes(form.id))return;event.preventDefault();if(!online||online.busy)return;
 const button=form.querySelector('button');button.disabled=true;onlineNotice('');
 try{if(form.id==='poker-create')await online.act('create',{options:{title:form.elements.title.value.trim(),capacity:Number(form.elements.capacity.value)}});else await online.act('join',{code:form.elements.code.value.trim().toUpperCase()});}
 finally{if(button.isConnected)button.disabled=false;}
});
function updateTurnClock(){
 const r=online?.room;
 if(!r?.deadline||r.status!=='active')return;
 const remaining=Math.max(0,Math.min(30,Math.ceil((Date.parse(r.deadline)-(r.serverTime+Date.now()-r.receivedAt))/1000)));
 if(!Number.isFinite(remaining))return;
 document.querySelectorAll('.online-clock').forEach(el=>el.textContent=remaining+'초');
 document.querySelectorAll('.turn-meter').forEach(el=>{el.style.setProperty('--remaining',remaining/30);el.classList.toggle('urgent',remaining<=8);});
 const warningKey=`${r.id}:${r.round}:${r.deadline}`;
 if(!document.hidden&&r.mode!=='solo'&&game?.turn===0&&remaining>0&&remaining<=5&&lastClockWarning!==warningKey){lastClockWarning=warningKey;void sfx.play('timer');}
}
setInterval(updateTurnClock,250);
function stageLabel(){return game.phase==='finished'?'쇼다운':game.phase==='discard'?'첫 패 선택':game.phase==='open'?'공개 패 선택':game.street===7?'마지막 히든':game.street+'구 · 공개 카드';}
function roundStrip(){
 const current=game.phase==='finished'?7:game.street;
 return `<div class="round-strip"><div class="table-id"><i></i>${online?.room?.mode==='solo'?'컴퓨터 대전':'온라인 대전'}<span>${String(online?.room?.round||record.rounds+1).padStart(2,'0')}번 판</span></div><div class="street-dots" aria-label="게임 진행 단계">${[[0,'패 선택'],[4,'4구'],[5,'5구'],[6,'6구'],[7,'히든']].map(([n,label])=>`<span class="${current===n?'on':current>n?'passed':''}" ${current===n?'aria-current="step"':''}><i aria-hidden="true"></i>${label}</span>`).join('')}</div></div>`;
}
function decisionDetail(){
 if(game.phase==='discard')return pick<0?'남길 세 장을 생각하고 한 장을 골라주세요.':'선택한 카드를 버리고 세 장으로 시작합니다.';
 if(game.phase==='open')return pick<0?'상대에게 보여줄 카드 한 장을 골라주세요.':'오른쪽 카드를 공개하고 베팅을 시작합니다.';
 if(game.phase==='betting'&&game.turn===0){const l=game.legal();return l.need?`콜에 필요한 골드 ${fmt(l.call)} G · 내 잔액 ${fmt(game.players[0].stack)} G`:`체크는 추가 골드 없이 차례를 넘깁니다.`;}
 return game.phase==='finished'?'':game.phase==='between'||game.phase==='runout'?'다음 카드를 준비하고 있습니다.':'상대의 선택을 기다려주세요.';
}
function syncMovePending(){
 const actions=app.querySelector('.actions');if(!actions)return;
 actions.classList.toggle('is-pending',movePending);
 if(movePending){
  actions.setAttribute('aria-busy','true');
  actions.querySelectorAll('button').forEach(b=>{if(!b.hasAttribute('data-before-pending'))b.dataset.beforePending=b.disabled?'1':'0';b.disabled=true;});
  if(!dealMotion.active()&&app.querySelector('#status'))app.querySelector('#status').textContent='선택을 반영하고 있어요';
 }else{
  actions.removeAttribute('aria-busy');
  actions.querySelectorAll('[data-before-pending]').forEach(b=>{b.disabled=b.dataset.beforePending==='1';delete b.dataset.beforePending;});
  if(!dealMotion.active()&&game&&app.querySelector('#status'))app.querySelector('#status').textContent=status();
 }
}
async function submitMove(command,cue){
 if(!online||online.busy||movePending)return false;
 movePending=true;syncMovePending();
 try{const ok=await online.act('move',{command});if(ok&&cue)void sfx.play(cue);return ok;}
 finally{movePending=false;syncMovePending();}
}
function raiseTarget(part){
  const l=game.legal(),p=game.players[0];
  return Math.min(l.maxTo,Math.max(l.minTo,p.bet+l.need+Math.floor((game.pot+l.need)*part)));
}
function controls(){
  if((game.phase==='discard'||game.phase==='open')&&(mode!=='online'||game.turn===0))return `<button class="primary wide" data-action="select" ${pick<0?'disabled':''}><span>${pick<0?'카드를 선택하세요':game.phase==='discard'?'선택한 카드 버리기':'선택한 카드 공개'}</span><small>${game.phase==='discard'?'한 장 버리기':'공개 후 시작'} →</small></button>`;
  if(game.phase==='finished'&&mode==='online')return refillButton()+ `<button class="primary wide" data-action="online-ready" ${online.room.ready[online.room.seat]||online.room.departed.some(Boolean)||wallet?.gold<50?'disabled':''}>${online.room.departed.some(Boolean)?'퇴장한 사람이 있어요 · 새 방에서 시작해 주세요':online.room.ready[online.room.seat]?'다른 사람의 준비를 기다리고 있어요':'다음 판 준비'}</button><button class="small-button wide" data-action="online-leave">방 나가기</button>`;
  if(game.phase!=='betting'||game.turn!==0)return '<div class="waiting" role="status"><span class="thinking"><i></i><i></i><i></i></span>잠시 후 내 차례가 돌아옵니다</div>';
  const l=game.legal(),p=game.players[0];
  const raiseButton=(action,label,part)=>{const to=raiseTarget(part);return `<button class="raise-choice" data-action="${action}" ${!l.mayRaise?'disabled':''}><span>${label}</span><small>+${fmt(to-p.bet)} G</small></button>`;};
  return `<div class="raise-options" role="group" aria-label="베팅 금액 선택">${raiseButton('minimum','삥',0)}${raiseButton('quarter','쿼터',.25)}${raiseButton('half','하프',.5)}</div><div class="primary-actions" role="group" aria-label="이번 차례 선택"><button class="fold" data-action="fold"><span>다이</span><small>이번 판 포기</small></button><button class="call" data-action="${l.check?'check':'call'}"><span>${l.check?'체크':'콜'}</span><small>${l.check?'추가 골드 없음':fmt(l.call)+' G'}</small></button><button class="allin" data-action="allin" ${!l.allIn?'disabled':''}><span>올인</span><small>${fmt(p.stack)} G</small></button></div>`;
}
function status(){
  if(mode==='online'&&['discard','open'].includes(game.phase)&&game.turn!==0)return `${game.players[game.turn].name} 님이 카드를 고르고 있어요`;
  if(game.phase==='discard')return '버릴 카드 1장을 선택하세요';
  if(game.phase==='open')return '공개할 카드 1장을 선택하세요';
  if(game.phase==='finished')return '쇼다운 · 이번 판 종료';
  if(game.phase==='between'||game.phase==='runout')return game.street===7?'마지막 패를 확인합니다':'다음 카드를 나눕니다';
  if(game.turn===0)return game.legal().check?'내 차례 · 체크 또는 베팅':`내 차례 · 콜 ${fmt(game.legal().call)} G`;
  return `${game.players[game.turn].name}의 차례`;
}
function renderTable(animateDeal=true){
  const done=game.phase==='finished',showdown=done&&!game.result.uncontested,me=game.players[0],hand=bestHand(me.cards),selecting=['discard','open'].includes(game.phase)&&(mode!=='online'||game.turn===0),myTurn=selecting||game.phase==='betting'&&game.turn===0;
  const same=visual.game===game,winning=new Set(done?game.result.pots.filter(p=>!p.refund).flatMap(p=>p.winners):[]);
  const fresh=(seat,c)=>animateDeal&&!done&&(!same||!visual.cards[seat]?.includes(c));
  const revealed=(seat,c)=>same&&!visual.shown[seat]?.includes(c);
  const potChanged=same&&visual.pot!==game.pot,stageChanged=same&&visual.street!==game.street;
  // Display groups retain the original card index used by the server and dealer animation.
  const splitHand=game.phase!=='discard',pendingOpen=game.phase==='open'&&selecting&&pick>=0;
  const ownCards=me.cards.map((c,i)=>({c,i,shown:me.up.includes(c)||(pendingOpen&&pick===i)}));
  const ownCard=({c,i})=>card(c,{button:true,index:i,peek:i===6&&finalCardCovered(),publicCard:me.up.includes(c),pendingPublic:pendingOpen&&pick===i,best:done&&!me.folded&&showdown&&hand.cards.includes(c),selected:pick===i&&selecting,selectable:selecting,fresh:fresh(0,c),fan:(i-(me.cards.length-1)/2)*1.4});
  const privateCards=ownCards.filter(c=>!c.shown&&c.i!==6),publicCards=ownCards.filter(c=>c.shown&&c.i!==6),finalCards=ownCards.filter(c=>c.i===6);
  const handGroup=(cards,kind,label)=>cards.length?`<div class="hand-group ${kind}-cards" role="group" aria-label="${label}" style="--group-count:${cards.length}">${cards.map(ownCard).join('')}</div>`:'';
  const myCards=splitHand?handGroup(privateCards,'private',done?'비공개였던 카드':'나만 보는 카드')+handGroup(publicCards,'public',pendingOpen?'공개할 카드':'공개 카드')+handGroup(finalCards,'final','마지막 비공개 카드'):ownCards.map(ownCard).join('');
  let result='';
  if(done){
    const pots=game.result.pots.filter(p=>!p.refund),won=winning.has(0),names=[...winning].map(i=>game.players[i].name).join(' · '),net=game.result.net[0];
    // Receiving a side pot (or an unmatched-bet refund) is not a win for the whole hand.
    const partial=won&&(net<0||pots.some(p=>!p.winners.includes(0))),victory=won&&!partial&&net>0;
    const title=partial?'일부 판돈 획득':won?(net===0?'손익 없음':'승리했습니다'):esc(names)+' 승리';
    const received=game.result.payouts?.[0]??me.total+net;
    result=`<section class="result-banner${victory?' result-win':''}${same&&visual.finished?'':' result-enter'}" aria-label="이번 판 결과"><div class="result-seal" aria-hidden="true">${victory?'♠':'◇'}</div><div class="result-copy"><small>${victory?'WINNING HAND':'HAND COMPLETE'}</small><b>${title}</b><p>${game.result.uncontested?(won?'상대 전원 다이':'다이로 종료'):[...winning].map(i=>`${esc(game.players[i].name)} · ${bestHand(game.players[i].cards).name}`).join(' / ')}${pots.length>1?' · 사이드팟 정산':''}</p></div><strong class="${net>=0?'profit':'loss'}"><small class="result-net-label">최종 손익</small>${net>0?'+':''}${fmt(net)}<small class="result-unit">G</small></strong><dl class="result-breakdown"><div><dt>건 골드</dt><dd>${fmt(me.total)} G</dd></div><div><dt>받은 골드</dt><dd>${fmt(received)} G</dd></div></dl></section>`;
  }
  const seats=game.players.slice(1).map((p,j)=>{
    const position=game.players.length===2?'north':game.players.length===3?['west','east'][j]:['west','north','east'][j];
    const i=j+1,reveal=showdown&&!p.folded,best=reveal?bestHand(p.cards):null,active=game.turn===i&&['betting','discard','open'].includes(game.phase),betMoved=same&&p.total>visual.bets[i];
    const up=p.cards.filter(c=>p.up.includes(c)),down=p.cards.filter(c=>!p.up.includes(c));
    return `<section class="seat seat-${i} seat-${position}${active?' active':''}${p.folded?' folded':''}${winning.has(i)?' winner':''}" aria-label="${esc(p.name)}${active?' 차례':''}"><div class="seat-label"><span class="seat-number">0${i}</span>${dealer(i)}<span class="seat-type">${online?.room?.mode==='solo'?'COMPUTER':'PLAYER'}</span></div><button class="seat-head" data-seat="${i}" aria-label="${esc(p.name)} 공개 카드 크게 보기"><span class="seat-monogram" aria-hidden="true">${['','♠','♦','♣'][i]}</span><span class="seat-info"><strong>${esc(p.name)}</strong><small>${fmt(p.stack)} <span>G</span></small></span><span class="turn-light" aria-hidden="true"></span></button><button class="seat-cards" data-seat="${i}" aria-label="${esc(p.name)} 공개 카드 크게 보기"><span class="down-cards">${down.map((c,k)=>card(c,{hidden:!reveal,index:k,dealSeat:i,dealOrder:p.cards.indexOf(c),fresh:fresh(i,c),revealed:reveal&&revealed(i,c),best:!!best?.cards.includes(c)})).join('')}</span><span class="up-cards">${up.map((c,k)=>card(c,{index:k,dealSeat:i,dealOrder:p.cards.indexOf(c),fresh:fresh(i,c),best:!!best?.cards.includes(c)})).join('')}</span></button><span class="seat-action${p.allIn?' is-allin':''}">${active?'<i class="action-dot"></i>':''}${esc((p.last||'대기').replace(/^(삥|쿼터|하프|베팅) [\d,]+$/, '$1'))}${p.bet>0?`<b>${fmt(p.bet)} <small>G</small></b>`:''}</span>${best?`<span class="result-seats">${best.name}</span>`:''}${betMoved?'<span class="bet-flight" aria-hidden="true"><i class="chip"></i><i class="chip"></i><i class="chip"></i></span>':''}</section>`;
  }).join('');
  app.innerHTML=header()+roomBar()+`<section class="game">${roundStrip()}<div class="table-scene"><div class="felt"><div class="felt-inlay" aria-hidden="true"></div><div class="opponents">${seats}</div><div class="pot-zone${potChanged?' pot-changed':''}"><div class="deal-deck" aria-hidden="true">${card(0,{hidden:true})}${card(0,{hidden:true})}${card(0,{hidden:true})}<small>DEALER</small></div><span class="pot-label">${done?'총 판돈':'현재 판돈'}</span><div class="pot-amount" style="--pot-digits:${fmt(game.pot).length}">${fmt(game.pot)}<span>G</span></div>${chipStack(game.pot)}<span class="table-stage${stageChanged?' stage-enter':''}">${stageLabel()}</span><span class="table-rule">SEVEN CARD STUD · ANTE 50</span></div><section class="player${myTurn?' active':''}${me.folded?' folded':''}"><div class="player-header"><div class="player-name">${dealer(0)}<b>내 패</b><span>${me.folded?'다이':me.allIn?'올인':fmt(me.stack)+' G'}</span></div><div class="hand-tools"><span class="hand-label">${selecting?'패 선택':finalCardCovered()?'히든 카드 확인':hand.name}</span><button class="hand-zoom" data-seat="0" aria-label="내 카드 크게 보기">크게 보기 ↗</button></div></div><div class="my-cards${splitHand?' split-hand':''}${game.phase==='open'&&selecting?' choosing-public':''}${publicCards.length?' has-public':''}${done?' hand-finished':''}" style="--card-count:${me.cards.length}">${myCards}</div>${same&&me.total>visual.bets[0]?'<span class="bet-flight player-flight" aria-hidden="true"><i class="chip"></i><i class="chip"></i><i class="chip"></i></span>':''}</section></div></div><section class="decision-panel${myTurn?' my-turn':''}">${result}<div class="decision-heading"><div class="decision-copy"><div class="status" id="status" role="status" aria-live="polite">${status()}</div><p class="decision-detail">${decisionDetail()}</p></div>${myTurn&&online?.room?.mode!=='solo'?'<span class="online-clock decision-clock" aria-label="남은 시간"></span>':''}</div>${myTurn&&online?.room?.mode!=='solo'?'<div class="turn-meter" aria-hidden="true"><i></i></div>':''}<div class="actions${done?' finished-actions':''}">${controls()}</div></section><div class="table-footer"><details class="recent"><summary>핸드 기록 <span>↗</span></summary><ol>${game.log.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></details><span>${online?.room?.mode==='solo'?'컴퓨터와 플레이':'온라인 대전'} · 참가비 50 G</span></div></section>`;
  visual={game,cards:game.players.map(p=>[...p.cards]),shown:game.players.map((p,i)=>i===0||showdown&&!p.folded?[...p.cards]:[...p.up]),bets:game.players.map(p=>p.total),pot:game.pot,finished:done,street:game.street};
}
function animateBetChips(){
 const felt=app.querySelector('.felt'),pot=app.querySelector('.pot-amount');
 if(!felt||!pot)return;
 const chips=[...felt.querySelectorAll('.bet-flight')];
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){chips.forEach(node=>node.remove());return;}
 const table=felt.getBoundingClientRect(),target=pot.getBoundingClientRect();
 const flights=chips.map(node=>{const source=(node.closest('.seat')?.querySelector('.seat-cards')||node.closest('.player')?.querySelector('.player-header')).getBoundingClientRect();return {node,x:source.left+source.width/2,y:source.top+source.height/2};});
 for(const {node,x,y} of flights){
  if(!node.animate){node.remove();continue;}
  Object.assign(node.style,{left:(x-table.left-13)+'px',top:(y-table.top-13)+'px',bottom:'auto'});felt.append(node);
  const dx=target.left+target.width/2-x,dy=target.top+target.height/2-y;
  const animation=node.animate([{translate:'0 0',scale:'.9',opacity:0},{translate:`${dx*.12}px ${dy*.12}px`,scale:'1',opacity:1,offset:.15},{translate:`${dx}px ${dy}px`,scale:'.65',opacity:1,offset:.86},{translate:`${dx}px ${dy}px`,scale:'.45',opacity:0}],{duration:520,easing:'cubic-bezier(.25,.6,.3,1)',fill:'both'});
  animation.finished?.then(()=>node.remove(),()=>node.remove());
 }
}
function captureHand(){
  if(lobby||visual.game!==game||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return null;
  const cards=new Map([...app.querySelectorAll('.my-cards [data-hand-card]')].map(node=>[node.dataset.handCard,node.getBoundingClientRect()]));
  const privateGroup=app.querySelector('.private-cards');
  return {cards,privateOpacity:privateGroup?getComputedStyle(privateGroup).opacity:'1'};
}
function settleHand(previous){
  if(!previous)return;
  const options={duration:240,easing:'cubic-bezier(.22,1,.36,1)'};
  for(const node of app.querySelectorAll('.my-cards [data-hand-card]')){
    const before=previous.cards.get(node.dataset.handCard);
    if(!before||!node.animate||node.classList.contains('dealing'))continue;
    const after=node.getBoundingClientRect(),x=before.left-after.left,y=before.top-after.top;
    if(Math.abs(x)+Math.abs(y)>1)node.animate([{translate:`${x}px ${y}px`},{translate:'0 0'}],options);
  }
  const privateGroup=app.querySelector('.private-cards');
  if(privateGroup?.animate){
    const opacity=getComputedStyle(privateGroup).opacity;
    if(opacity!==previous.privateOpacity)privateGroup.animate([{opacity:previous.privateOpacity},{opacity}],options);
  }
}
function render({animateDeal=true}={}){
  if(!ready||conflict)return;
  const handBefore=captureHand();
  const focused=document.activeElement,focusKey=focused?.hasAttribute('data-card')?['data-card',focused.dataset.card]:focused?.hasAttribute('data-action')?['data-action',focused.dataset.action]:null;
  const keyboardFocus=focused?.matches?.(':focus-visible'),historyOpen=app.querySelector('.recent')?.open;
  cancelPeek();
  dealMotion.cancel();
  document.body.classList.toggle('poker-entry-active',lobby);
  document.body.classList.toggle('poker-playing',!lobby);
  if(playingView!==!lobby){playingView=!lobby;send('table-view',{playing:playingView});}
  if(onlineLobby&&lobby)renderOnlineLobby();else if(lobby)renderLobby();else {renderTable(animateDeal);settleHand(handBefore);animateBetChips();dealMotion.start(app,{dealer:game.dealer,seats:game.players.length});}
  if(movePending)syncMovePending();updateTurnClock();
  if(historyOpen&&app.querySelector('.recent'))app.querySelector('.recent').open=true;
  if(keyboardFocus&&focusKey)app.querySelector(`[${focusKey[0]}="${focusKey[1]}"]`)?.focus({preventScroll:true});
}

function finishDealing(){
  if(dealMotion.cancel()){if(queuedRoom){const next=queuedRoom;queuedRoom=null;acceptRoom(next);}else render({animateDeal:false});}
}

function save(){
 if(!key)return;
 try{localStorage.setItem(key,JSON.stringify({audio:sfx.settings(),difficulty:record.difficulty}));}catch{}
}
function soundControls(){
  const {enabled,volume,voiceStyle='classic'}=sfx.settings();
  document.querySelector('#sound-enabled').checked=enabled;
  document.querySelectorAll('[name="poker-voice"]').forEach(input=>{input.checked=input.value===voiceStyle;});
  document.querySelector('[data-action="sound-test"]').disabled=!enabled||!volume;
  document.querySelector('#sound-volume').value=Math.round(volume*100);
  document.querySelector('#sound-volume-value').textContent=Math.round(volume*100)+'%';
}
function schedule(){}
async function start(){
 if(!wallet||wallet.gold<50||online.busy)return;
 onlineLobby=false;
 if(online.room){await online.act('ready');return;}
 await online.act('create',{options:{mode:'solo',capacity:4,title:'컴퓨터와 세븐포커',difficulty:record.difficulty}});
}
function fillCards(seat){
  const p=game.players[seat],reveal=seat===0||game.phase==='finished'&&!game.result.uncontested&&!p.folded;
  document.querySelector('#cards-title').textContent=seat===0?'내 카드':`${p.name}의 공개 카드`;
  document.querySelector('#cards-content').innerHTML=p.cards.map((c,i)=>card(c,{index:i,peek:seat===0&&i===6&&finalCardCovered(),hidden:!reveal&&!p.up.includes(c),publicCard:p.up.includes(c)})).join('')+`<p class="muted">${seat===0?'공개 표시가 없는 카드는 나만 볼 수 있어요.':'상대의 비공개 카드는 승부가 끝날 때 열려요.'}</p>`;
}
function showCards(seat){
  clearTimeout(timer);fillCards(seat);document.querySelector('#cards-dialog').showModal();
}
function exit(){online?.close();dealMotion.cancel();clearTimeout(timer);sfx.pause();save();send('exit');}
function requestExit(leave=false){
 finishDealing();leaveOnExit=!!online?.room&&(leave||online.room.mode!=='solo');
 if(!online?.room){exit();return;}
 document.querySelector('#exit-dialog p').textContent=leaveOnExit?'방에서 나가면 진행 중인 판은 다이 처리돼요. 남은 골드는 계정에 저장돼요.':'진행 중인 판은 계정에 저장돼요. 다시 들어오면 이어서 할 수 있어요.';
 document.querySelector('#confirm-exit').textContent=leaveOnExit?'방 나가기':'저장하고 나가기';
 document.querySelector('#exit-dialog').showModal();
}
document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(event.detail>0&&b.hasAttribute('data-card')&&Date.now()<peekClickUntil){event.preventDefault();return;}
  if(ready&&!conflict)void sfx.unlock();
  if(b.hasAttribute('data-close-dialog')){b.closest('dialog').close();return;}
  if(b.id==='confirm-exit'){if(leaveOnExit&&online?.room){b.disabled=true;const ok=await online.act('leave');b.disabled=false;if(!ok)return;}exit();return;}
  if(b.id==='confirm-refill'){
    if(!online||online.busy)return;b.disabled=true;
    const ok=await online.refill(true);b.disabled=false;
    if(ok)document.querySelector('#refill-dialog').close();
    else document.querySelector('#refill-message').textContent=onlineError;
    render({animateDeal:false});return;
  }
  if(!ready||conflict)return;
  if(dealMotion.active()){
    if(['help','sound'].includes(b.dataset.action))finishDealing();else return;
  }
  if(b.dataset.action?.startsWith('online')||b.hasAttribute('data-room-code')){await onlineAction(b);return;}
  if(mode==='online'&&online?.busy)return;
  if(b.dataset.difficulty){record.difficulty=b.dataset.difficulty;save();render();return;}
  if(b.hasAttribute('data-peek-card')){if(event.detail===0)revealFinalCard();return;}
  if(b.hasAttribute('data-seat')){showCards(Number(b.dataset.seat));return;}
  if(b.hasAttribute('data-card')){if(['discard','open'].includes(game.phase)&&(mode!=='online'||game.turn===0)){pick=Number(b.dataset.card);void sfx.play('select');render();}else showCards(0);return;}
  const action=b.dataset.action;
  if(action==='exit'){requestExit();return;}
  if(action==='help'){clearTimeout(timer);document.querySelector('#help').showModal();return;}
  if(action==='sound'){clearTimeout(timer);soundControls();document.querySelector('#sound-dialog').showModal();return;}
  if(action==='sound-test'){void sfx.play('half',{preview:true});return;}
  if(action==='resume'){lobby=false;render({animateDeal:false});schedule();return;}
  if(action==='lobby'){lobby=true;render();return;}
  if(action==='start'||action==='next'){start();return;}
  if(action==='refill'){
    if(!canRefill())return;
    if(wallet.free_left){await online.refill(false);render({animateDeal:false});}
    else {document.querySelector('#refill-message').textContent='';document.querySelector('#refill-dialog').showModal();}
    return;
  }
  if(mode==='online'){
    if(action==='select'&&pick>=0){const command={type:game.phase,index:pick},cue=game.phase==='discard'?'discard':'reveal';await submitMove(command,cue);return;}
    if(game?.phase==='betting'&&game.turn===0){const command=['minimum','quarter','half'].includes(action)?{type:'raise',to:raiseTarget({minimum:0,quarter:.25,half:.5}[action]),preset:action}:{type:action};if(['raise','fold','check','call','allin'].includes(command.type)){await submitMove(command);}return;}
    return;
  }

});
window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==parent||parent===window||event.data?.source!=='ojjuda-world')return;
  const message=event.data;
  if(message.type==='poker-exit-request'){requestExit();return;}
  if(message.type!=='poker-init'||ready||typeof message.owner!=='string'||!message.owner)return;
  key='ojjuda.poker.settings.v2.'+message.owner;
  try{
    const saved=JSON.parse(localStorage.getItem(key)||localStorage.getItem('ojjuda.poker.practice.v1.'+message.owner)||'null');
    if(saved?.audio)sfx.configure(saved.audio);record.difficulty=saved?.difficulty==='easy'?'easy':'normal';
  }catch{}
  online=createOnlineClient({onRoom:acceptRoom,onError:onlineNotice,onConnection:onlineNotice,onWallet:acceptWallet});
  ready=true;onlineError='골드를 불러오고 있어요…';render();
  try{
    const room=await online.enter();
    if(!room&&message.joinCode){onlineLobby=true;await online.act('join',{code:message.joinCode});}
  }catch(error){onlineNotice(error.message);}
});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',schedule));
document.querySelector('#sound-enabled').addEventListener('change',event=>{
  if(!ready||conflict)return;
  sfx.configure({enabled:event.target.checked});void sfx.unlock();soundControls();save();render();
  if(event.target.checked)void sfx.play('select');
});
document.querySelectorAll('[name="poker-voice"]').forEach(input=>input.addEventListener('change',event=>{
  if(!ready||conflict||!event.target.checked)return;
  sfx.configure({voiceStyle:event.target.value});void sfx.unlock();soundControls();save();
  void sfx.play('half',{preview:true});
}));
document.querySelector('#sound-volume').addEventListener('input',event=>{
  if(!ready||conflict)return;
  sfx.configure({volume:Number(event.target.value)/100});soundControls();save();render();
});
document.querySelector('#sound-volume').addEventListener('change',()=>{if(ready&&!conflict){void sfx.unlock();void sfx.play('half');}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){finishDealing();clearTimeout(timer);sfx.pause();save();}else schedule();});
window.addEventListener('pagehide',()=>{online?.close();dealMotion.cancel();clearTimeout(timer);sfx.pause();save();});
window.addEventListener('resize',()=>{if(dealMotion.active()){finishDealing();schedule();}});
window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',event=>{if(event.matches){finishDealing();schedule();}});
if(parent!==window)send('ready');
else app.innerHTML='<section class="gate"><span class="brand">오쭈다 오락실</span><h1>세븐포커</h1><p>오락실에서 세븐포커를 열어 주세요.</p><a href="/world.html?game=poker">오락실로 가기 →</a></section>';
setTimeout(()=>{if(!ready&&parent!==window)app.innerHTML='<section class="gate"><h1>게임을 연결하지 못했어요</h1><p>게임 목록으로 돌아갔다가 다시 열어 주세요.</p></section>';},10000);
