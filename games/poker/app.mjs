import {suit,face,cardName,bestHand} from './engine.mjs?v=20261021-poker6';
import {createPokerSound} from './sound.mjs?v=20261021-poker3';
import {createOnlineClient,rotateView} from './online-client.mjs?v=20261021-poker6';
import {createDealMotion} from './deal-motion.mjs?v=20261021-poker6';

const sfx=createPokerSound();
const dealMotion=createDealMotion({play:()=>void sfx.play('card'),onFinish:()=>{
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
const send=type=>{if(parent!==window)parent.postMessage({source:'ojjuda-poker',type},location.origin);};

let mode='online',online=null,onlineError='',roomList=[],queuedRoom=null,onlineLobby=false,wallet=null,leaveOnExit=false;
let visual={game:null,cards:[],shown:[],bets:[],pot:0,finished:false};
const faces=['C','H','D','S'];
function card(c,{hidden=false,publicCard=false,best=false,selected=false,button=false,index=0,selectable=false,fresh=false,revealed=false,fan=0,dealSeat=0,dealOrder=index}={}){
  const tag=button?'button':'span',label=hidden?'비공개 카드':cardName(c);
  return `<${tag} class="card${hidden?' back':''}${publicCard?' public':''}${best?' best':''}${selected?' selected':''}${selectable?' selectable':''}${fresh?' dealing':''}${revealed?' revealing':''}" ${fresh?`data-deal-seat="${dealSeat}" data-deal-order="${dealOrder}"`:""} ${button?`type="button" data-card="${index}" aria-pressed="${selected}"`:''} style="--i:${index};--fan:${fan}deg" aria-label="${label}${publicCard?' · 공개':''}">${hidden?'<span class="back-border" aria-hidden="true"><span class="back-emblem">♠<small>OJ JU DA</small></span></span>':`<img class="card-face" src="cards/${faces[suit(c)]}-${face(c)}.svg" alt="" draggable="false" decoding="async">`}${publicCard?'<span class="card-state" aria-hidden="true">공개</span>':''}</${tag}>`;
}
function chipStack(amount=500,{mini=false}={}){
  const count=mini?1:Math.min(4,Math.max(2,Math.ceil(amount/750)));
  return `<span class="chip-stacks${mini?' mini':''}" aria-hidden="true">${Array.from({length:count},(_,i)=>`<span class="chip-stack ${['jade','ivory','burgundy','gold'][i]}" style="--stack:${i}">${Array.from({length:mini?2:3+(i+Math.floor(amount/100))%4},(_,j)=>`<i class="chip" style="--layer:${j}"><span>${['50','100','500','1K'][i]}</span></i>`).join('')}</span>`).join('')}</span>`;
}
function dealer(index){return game.dealer===index?'<span class="dealer" title="이번 판 딜러" aria-label="딜러">D</span>':'';}
function header(){
  return `<header class="app-header"><div class="title"><img class="logo" src="/favicon.svg" alt="오쭈다"><span>세븐포커<small>OJ JU DA · POKER CLUB</small></span></div><div class="header-tools"><button class="small-button" data-action="sound" aria-label="효과음 설정" aria-haspopup="dialog">${sfx.settings().enabled&&sfx.settings().volume?'소리 켬':'소리 끔'}</button><button class="small-button" data-action="help">족보</button><div class="wallet"><small>MY GOLD</small><b>${wallet?fmt(wallet.gold):'…'}<span>G</span></b></div></div></header>${saveFailed?'<div class="save-warning" role="alert">이 기기에 저장하지 못했어요. 창을 닫으면 진행 내용이 사라질 수 있어요.</div>':''}`;
}
function renderLobby(){
  const canResume=game&&game.phase!=='finished';
  app.innerHTML=header()+`<section class="lobby"><div class="lobby-copy"><span class="eyebrow"><i></i> THE SEVEN CARD TABLE</span><h1>Seven<br><em>Poker.</em></h1><p class="intro">일곱 장의 패, 한 번의 승부.<br>마지막 히든까지, 흐름을 읽으세요.</p><div class="table-spec"><span><b>04</b> 플레이어</span><span><b>07</b> 카드</span><span><b>50 G</b> 참가비</span></div><div class="lobby-settings"><span>컴퓨터 난이도</span><div class="seg" role="group" aria-label="컴퓨터 난이도">${[['easy','편하게'],['normal','보통']].map(([id,label])=>`<button data-difficulty="${id}" class="${record.difficulty===id?'on':''}" aria-pressed="${record.difficulty===id}" ${canResume?'disabled':''}>${label}</button>`).join('')}</div></div><button class="primary start online-entry" data-action="online" ${!wallet?'disabled':''}><span>사람들과 플레이</span><small>2~4인 멀티 →</small></button><button class="small-button practice-entry" data-action="${canResume?'resume':'start'}" ${record.bank<50&&!canResume?'disabled':''}><span>${canResume?'게임 이어하기':'컴퓨터와 하기'}</span><span class="start-arrow" aria-hidden="true">↗</span></button>${refillButton()}<p class="online-connection" role="status">${esc(onlineError)}</p><button class="rules-link" data-action="help">게임 방법 · 족보 보기 <span aria-hidden="true">→</span></button></div><div class="lobby-showcase" aria-hidden="true"><div class="showcase-ring"></div><div class="showcase-label">OJ JU DA<span>SEVEN POKER</span></div><div class="showcase-deck">${card(0,{hidden:true})}${card(0,{hidden:true})}${card(0,{hidden:true})}</div><div class="card-fan">${[47,48,49,50,51].map((c,i)=>card(c,{index:i})).join('')}</div><div class="showcase-chips">${chipStack(2500)}</div><span class="showcase-dealer">D</span><span class="showcase-caption">A CLASSIC GAME. A NEW TABLE.</span></div><div class="lobby-footer"><div class="lobby-stats"><span><b>${fmt(record.rounds)}</b>플레이</span><span><b>${fmt(record.wins)}</b>승리</span><span><b>${record.rounds?Math.round(record.wins/record.rounds*100):0}%</b>승률</span></div><p class="practice-note">2~4인 멀티 · 컴퓨터 대전 · 만 19세 이상<br>포커 골드는 계정에 저장돼요</p></div></section>`;
}
function refillButton(){
 if(!wallet||wallet.locked||wallet.available>=1000)return '';
 return `<button class="refill" data-action="refill" ${online?.busy?'disabled':''}>5,000 G 충전 · ${wallet.free_left?`무료 (남은 ${wallet.free_left}회)`:'5쭈'}</button>`;
}
function acceptWallet(next){wallet=next;record.bank=next.gold;record.rounds=next.rounds;record.wins=next.wins;}
function roomBar(){
  if(mode!=='online'||!online?.room)return '';
  const r=online.room;
  if(r.mode==='solo')return '<div class="online-room-bar"><span>컴퓨터와 플레이</span><button class="small-button" data-action="online-leave">게임 끝내기</button></div><p class="online-connection" role="status">'+esc(onlineError)+'</p>';
  return `<div class="online-room-bar"><span>${esc(r.title)} <b>${esc(r.code)}</b></span><span class="online-clock" aria-live="off"></span><button class="small-button" data-action="online-copy">코드 복사</button><button class="small-button" data-action="online-leave">방 나가기</button></div><p class="online-connection" role="status">${esc(onlineError)}</p>`;
}
function renderOnlineLobby(){
  const r=online?.room;
  app.innerHTML=header()+`<section class="online-lobby"><span class="eyebrow"><i></i> LIVE SEVEN POKER</span><h1>${r?'함께 앉는 테이블':'사람들과 세븐포커'}</h1><p class="muted">만 19세 이상 · 2~4인 · 계정에 저장되는 포커 골드</p><p class="online-connection" role="status">${esc(onlineError)}</p>${r?`${roomBar()}<div class="online-seats">${Array.from({length:r.capacity},(_,i)=>`<div class="online-seat ${r.names[i]?'occupied':''}"><span>${r.names[i]?'♠':'＋'}</span><strong>${esc(r.names[i]||'참여를 기다리는 중')}</strong><small>${i===r.hostSeat?'방장':r.names[i]?'참여 완료':'EMPTY SEAT'}</small></div>`).join('')}</div><p>초대할 사람에게 방 코드를 알려 주세요. 두 명 이상 모이면 방장이 시작할 수 있어요.</p><button class="primary wide" data-action="online-start" ${r.hostSeat!==r.seat||r.names.length<2?'disabled':''}>${r.hostSeat===r.seat?'게임 시작':'방장이 시작하기를 기다리는 중'}</button>${refillButton()}`:`<div class="online-forms"><form id="poker-create"><h2>방 만들기</h2><label>방 이름<input name="title" maxlength="40" value="세븐포커 같이 해요" required></label><label>최대 인원<select name="capacity"><option value="4">4명</option><option value="3">3명</option><option value="2">2명</option></select></label><button class="primary" type="submit">새 방 만들기</button></form><form id="poker-join"><h2>코드로 참여</h2><label>방 코드<input name="code" maxlength="8" pattern="[a-fA-F0-9]{8}" placeholder="8자리 코드" autocapitalize="characters" autocomplete="off" required></label><button type="submit">참여하기</button></form></div><div class="online-list-heading"><h2>참여할 수 있는 방</h2><button class="small-button" data-action="online-refresh">새로고침</button></div><div class="online-room-list">${roomList.length?roomList.map(room=>`<button data-room-code="${esc(room.code)}"><span><b>${esc(room.title)}</b><small>${esc(room.code)}</small></span><span>${room.players}/${room.capacity}명 →</span></button>`).join(''):'<p class="muted">기다리는 방이 없어요. 새 방을 만들고 함께할 사람을 초대해 보세요.</p>'}</div>${refillButton()}<button class="small-button" data-action="online-back">처음 화면으로</button>`}</section>`;
}
function onlineNotice(message){onlineError=message;document.querySelectorAll('.online-connection').forEach(el=>el.textContent=message);}
function acceptRoom(room){
  if(!online)return;
  if(dealMotion.active()&&room?.game){queuedRoom=room;return;}
  queuedRoom=null;if(room)onlineLobby=room.mode!=='solo';
  const next=room?rotateView(room):null;
  if(next){
    const same=game&&game._roomId===room.id&&game._round===room.round,wasDone=game?.phase==='finished',oldTurn=game?.turn;
    if(same&&game.log.at(-1)!==next.log.at(-1)){const last=next.log.at(-1)||'';const cue=last.includes('올인')?'allin':last.includes('다이')?'fold':last.includes('베팅')?'raise':last.includes('체크')?'check':last.includes('콜')?'call':null;if(cue)void sfx.play(cue);}
    if(same)Object.assign(game,next);else game={...next,_roomId:room.id,_round:room.round};
    lobby=false;pick=-1;render();
    if(!wasDone&&game.phase==='finished')void sfx.play(game.result.net[0]>0?'win':'end');
    else if(oldTurn!==0&&game.turn===0&&!dealMotion.active())void sfx.play('turn');
  }else{game=null;lobby=true;render();}
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
setInterval(()=>{
 const clock=document.querySelector('.online-clock'),r=online?.room;
 if(clock&&r?.deadline&&r.status==='active'){const remaining=Math.max(0,Math.ceil((Date.parse(r.deadline)-(r.serverTime+Date.now()-r.receivedAt))/1000));clock.textContent=remaining+'초 · 차례 제한 30초';}
},1000);
function raiseTarget(part){
  const l=game.legal(),p=game.players[0];
  return Math.min(l.maxTo,Math.max(l.minTo,p.bet+l.need+Math.floor((game.pot+l.need)*part)));
}
function controls(){
  if((game.phase==='discard'||game.phase==='open')&&(mode!=='online'||game.turn===0))return `<button class="primary wide" data-action="select" ${pick<0?'disabled':''}><span>${pick<0?'카드를 선택하세요':game.phase==='discard'?'선택한 카드 버리기':'선택한 카드 공개'}</span><small>${game.phase==='discard'?'DISCARD':'OPEN CARD'} →</small></button>`;
  if(game.phase==='finished'&&mode==='online')return refillButton()+ `<button class="primary wide" data-action="online-ready" ${online.room.ready[online.room.seat]||online.room.departed.some(Boolean)||wallet?.gold<50?'disabled':''}>${online.room.departed.some(Boolean)?'퇴장한 사람이 있어요 · 새 방에서 시작해 주세요':online.room.ready[online.room.seat]?'다른 사람의 준비를 기다리고 있어요':'다음 판 준비'}</button><button class="small-button wide" data-action="online-leave">방 나가기</button>`;
  if(game.phase!=='betting'||game.turn!==0)return '<div class="waiting" role="status"><span class="thinking"><i></i><i></i><i></i></span>상대가 패를 읽고 있습니다</div>';
  const l=game.legal(),p=game.players[0];
  const raiseButton=(action,label,part)=>{const to=raiseTarget(part);return `<button data-action="${action}" ${!l.mayRaise?'disabled':''}><span>${label}</span><small>+${fmt(to-p.bet)} G</small></button>`;};
  return `<button class="fold" data-action="fold"><span>다이</span><small>FOLD</small></button><button class="call" data-action="${l.check?'check':'call'}"><span>${l.check?'체크':'콜'}</span><small>${l.check?'CHECK':fmt(l.call)+' G'}</small></button>${raiseButton('minimum','삥',0)}${raiseButton('quarter','쿼터',.25)}${raiseButton('half','하프',.5)}<button class="allin" data-action="allin" ${!l.allIn?'disabled':''}><span>올인</span><small>${fmt(p.stack)} G</small></button>`;
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
  const potChanged=same&&visual.pot!==game.pot;
  let result='';
  if(done){
    const won=winning.has(0),names=[...winning].map(i=>game.players[i].name).join(' · '),net=game.result.net[0];
    result=`<section class="result-banner${won?' result-win':''}${same&&visual.finished?'':' result-enter'}" aria-label="이번 판 결과"><div class="result-seal" aria-hidden="true">${won?'♠':'◇'}</div><div class="result-copy"><small>${won?'WINNING HAND':'HAND COMPLETE'}</small><b>${won?'나의 승리':esc(names)+' 승리'}</b><p>${game.result.uncontested?'상대 전원 다이':[...winning].map(i=>`${esc(game.players[i].name)} · ${bestHand(game.players[i].cards).name}`).join(' / ')}${game.result.pots.filter(p=>!p.refund).length>1?' · 사이드팟 정산':''}</p></div><strong class="${net>=0?'profit':'loss'}">${net>0?'+':''}${fmt(net)}<small>G</small></strong></section>`;
  }
  const seats=game.players.slice(1).map((p,j)=>{
    const i=j+1,reveal=showdown&&!p.folded,best=reveal?bestHand(p.cards):null,active=game.turn===i&&game.phase==='betting',betMoved=same&&p.total>visual.bets[i];
    const up=p.cards.filter(c=>p.up.includes(c)),down=p.cards.filter(c=>!p.up.includes(c));
    return `<section class="seat seat-${i}${active?' active':''}${p.folded?' folded':''}${winning.has(i)?' winner':''}" aria-label="${esc(p.name)}${active?' 차례':''}"><div class="seat-label"><span class="seat-number">0${i}</span>${dealer(i)}<span class="seat-type">${online?.room?.mode==='solo'?'COMPUTER':'PLAYER'}</span></div><button class="seat-head" data-seat="${i}" aria-label="${esc(p.name)} 공개 카드 크게 보기"><span class="seat-monogram" aria-hidden="true">${['','♠','♦','♣'][i]}</span><span class="seat-info"><strong>${esc(p.name)}</strong><small>${fmt(p.stack)} <span>G</span></small></span><span class="turn-light" aria-hidden="true"></span></button><button class="seat-cards" data-seat="${i}" aria-label="${esc(p.name)} 공개 카드 크게 보기"><span class="down-cards">${down.map((c,k)=>card(c,{hidden:!reveal,index:k,dealSeat:i,dealOrder:p.cards.indexOf(c),fresh:fresh(i,c),revealed:reveal&&revealed(i,c),best:!!best?.cards.includes(c)})).join('')}</span><span class="up-cards">${up.map((c,k)=>card(c,{index:k,dealSeat:i,dealOrder:p.cards.indexOf(c),fresh:fresh(i,c),best:!!best?.cards.includes(c)})).join('')}</span></button><span class="seat-action${p.allIn?' is-allin':''}">${active?'<i class="action-dot"></i>':''}${esc((p.last||'대기').replace(/^베팅 .*/, '베팅'))}${p.bet>0?`<b>${fmt(p.bet)} <small>G</small></b>`:''}</span>${best?`<span class="result-seats">${best.name}</span>`:''}${betMoved?'<span class="bet-flight" aria-hidden="true"><i class="chip"></i><i class="chip"></i><i class="chip"></i></span>':''}</section>`;
  }).join('');
  app.innerHTML=header()+roomBar()+`<section class="game"><div class="round-strip"><span class="table-id"><i></i> ${online?.room?.mode==='solo'?'COMPUTER':'ONLINE'} <span>· HAND ${String(mode==='online'?online.room.round:done?record.rounds:record.rounds+1).padStart(2,'0')}</span></span><div class="street-dots" aria-label="진행 단계">${[[0,'패 선택'],[4,'4구'],[5,'5구'],[6,'6구'],[7,'히든']].map(([n,label])=>`<span class="${game.street===n?'on':game.street>n?'passed':''}">${label}</span>`).join('')}</div></div><div class="table-scene"><div class="felt"><div class="felt-inlay" aria-hidden="true"></div><div class="opponents">${seats}</div><div class="pot-zone${potChanged?' pot-changed':''}"><div class="deal-deck" aria-hidden="true">${card(0,{hidden:true})}${card(0,{hidden:true})}${card(0,{hidden:true})}<small>DEALER</small></div><span class="pot-label">${done?'TOTAL POT':'MAIN POT'}</span><div class="pot-amount">${fmt(game.pot)}<span>G</span></div>${chipStack(game.pot)}<span class="table-rule">SEVEN CARD STUD · ANTE 50</span></div><section class="player${myTurn?' active':''}${me.folded?' folded':''}"><div class="player-header"><div class="player-name">${dealer(0)}<b>나</b><span>${me.folded?'다이':me.allIn?'ALL IN':myTurn?'YOUR TURN':'PLAYER'}</span></div><span class="hand-label">${selecting?'패 선택':hand.name}</span></div><div class="my-cards">${me.cards.map((c,i)=>card(c,{button:true,index:i,publicCard:me.up.includes(c),best:done&&!me.folded&&showdown&&hand.cards.includes(c),selected:pick===i&&selecting,selectable:selecting,fresh:fresh(0,c),fan:(i-(me.cards.length-1)/2)*1.4})).join('')}</div>${same&&me.total>visual.bets[0]?'<span class="bet-flight player-flight" aria-hidden="true"><i class="chip"></i><i class="chip"></i><i class="chip"></i></span>':''}<div class="player-bet">${me.bet>0?`<span class="bet-dot"></span>이번 베팅 <b>${fmt(me.bet)} G</b>`:'공개 4장 · 비공개 3장'}</div></section></div></div><section class="decision-panel${myTurn?' my-turn':''}">${result}<div class="decision-heading"><div class="status" id="status" role="status" aria-live="polite">${status()}</div><span>${done?'황금 테두리 · 베스트 5장':selecting?`${game.phase==='discard'?'DISCARD':'OPEN'} 1 / ${me.cards.length}`:'한국식 세븐포커'}</span></div><div class="actions${done?' finished-actions':''}">${controls()}</div></section><div class="table-footer"><details class="recent"><summary>핸드 기록 <span>↗</span></summary><ol>${game.log.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></details><span>${mode==='online'?'멀티 테이블 · 연습칩':'연습 테이블'} · 50 G ANTE</span></div></section>`;
  visual={game,cards:game.players.map(p=>[...p.cards]),shown:game.players.map((p,i)=>i===0||showdown&&!p.folded?[...p.cards]:[...p.up]),bets:game.players.map(p=>p.total),pot:game.pot,finished:done};
}
function render({animateDeal=true}={}){
  if(!ready||conflict)return;
  const focused=document.activeElement,focusKey=focused?.hasAttribute('data-card')?['data-card',focused.dataset.card]:focused?.hasAttribute('data-action')?['data-action',focused.dataset.action]:null;
  const keyboardFocus=focused?.matches?.(':focus-visible'),historyOpen=app.querySelector('.recent')?.open;
  dealMotion.cancel();
  if(onlineLobby&&lobby)renderOnlineLobby();else if(lobby)renderLobby();else {renderTable(animateDeal);dealMotion.start(app,{dealer:game.dealer,seats:game.players.length});}
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
  const {enabled,volume}=sfx.settings();
  document.querySelector('#sound-enabled').checked=enabled;
  document.querySelector('#sound-volume').value=Math.round(volume*100);
  document.querySelector('#sound-volume-value').textContent=Math.round(volume*100)+'%';
}
function actionSound(action){void sfx.play({minimum:'raise',quarter:'raise',half:'raise'}[action]||action);}
function schedule(){}
async function start(){
 if(!wallet||wallet.gold<50||online.busy)return;
 onlineLobby=false;
 if(online.room){await online.act('ready');return;}
 await online.act('create',{options:{mode:'solo',capacity:4,title:'컴퓨터와 세븐포커',difficulty:record.difficulty}});
}
function showCards(seat){
  clearTimeout(timer);
  const p=game.players[seat],reveal=seat===0||game.phase==='finished'&&!game.result.uncontested&&!p.folded;
  document.querySelector('#cards-title').textContent=seat===0?'내 카드':`${p.name}의 공개 카드`;
  document.querySelector('#cards-content').innerHTML=p.cards.map(c=>card(c,{hidden:!reveal&&!p.up.includes(c),publicCard:p.up.includes(c)})).join('')+`<p class="muted">${seat===0?'공개 표시가 없는 카드는 나만 볼 수 있어요.':'상대의 비공개 카드는 승부가 끝날 때 열려요.'}</p>`;
  document.querySelector('#cards-dialog').showModal();
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
  if(b.hasAttribute('data-seat')){showCards(Number(b.dataset.seat));return;}
  if(b.hasAttribute('data-card')){if(['discard','open'].includes(game.phase)&&(mode!=='online'||game.turn===0)){pick=Number(b.dataset.card);void sfx.play('select');render();}else showCards(0);return;}
  const action=b.dataset.action;
  if(action==='help'){clearTimeout(timer);document.querySelector('#help').showModal();return;}
  if(action==='sound'){clearTimeout(timer);soundControls();document.querySelector('#sound-dialog').showModal();return;}
  if(action==='sound-test'){void sfx.play('raise');return;}
  if(action==='resume'){lobby=false;render({animateDeal:false});schedule();return;}
  if(action==='lobby'){lobby=true;render();return;}
  if(action==='start'||action==='next'){start();return;}
  if(action==='refill'){
    if(!wallet||wallet.locked||wallet.available>=1000)return;
    if(wallet.free_left){await online.refill(false);render({animateDeal:false});}
    else {document.querySelector('#refill-message').textContent='';document.querySelector('#refill-dialog').showModal();}
    return;
  }
  if(mode==='online'){
    if(action==='select'&&pick>=0){const command={type:game.phase,index:pick},cue=game.phase==='discard'?'discard':'reveal';pick=-1;if(await online.act('move',{command}))void sfx.play(cue);return;}
    if(game?.phase==='betting'&&game.turn===0){const command=['minimum','quarter','half'].includes(action)?{type:'raise',to:raiseTarget({minimum:0,quarter:.25,half:.5}[action])}:{type:action};if(['raise','fold','check','call','allin'].includes(command.type)){await online.act('move',{command});}return;}
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
  sfx.configure({enabled:event.target.checked});void sfx.unlock();save();render();
  if(event.target.checked)void sfx.play('select');
});
document.querySelector('#sound-volume').addEventListener('input',event=>{
  if(!ready||conflict)return;
  sfx.configure({volume:Number(event.target.value)/100});soundControls();save();render();
});
document.querySelector('#sound-volume').addEventListener('change',()=>{if(ready&&!conflict){void sfx.unlock();void sfx.play('raise');}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){finishDealing();clearTimeout(timer);sfx.pause();save();}else schedule();});
window.addEventListener('pagehide',()=>{online?.close();dealMotion.cancel();clearTimeout(timer);sfx.pause();save();});
window.addEventListener('resize',()=>{if(dealMotion.active()){finishDealing();schedule();}});
window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',event=>{if(event.matches){finishDealing();schedule();}});
if(parent!==window)send('ready');
else app.innerHTML='<section class="gate"><span class="brand">오쭈다 오락실</span><h1>세븐포커</h1><p>오락실에서 세븐포커를 열어 주세요.</p><a href="/world.html?game=poker">오락실로 가기 →</a></section>';
setTimeout(()=>{if(!ready&&parent!==window)app.innerHTML='<section class="gate"><h1>게임을 연결하지 못했어요</h1><p>게임 목록으로 돌아갔다가 다시 열어 주세요.</p></section>';},10000);
