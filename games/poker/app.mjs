import {SevenPoker,SUITS,rank,suit,face,cardName,bestHand,aiView,chooseAI,restoreGame} from './engine.mjs?v=20261021-poker3';
import {createPokerSound} from './sound.mjs?v=20261021-poker3';

const sfx=createPokerSound();
const app=document.querySelector('#app');
const fmt=n=>Number(n).toLocaleString('ko-KR');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
let game=null,record={bank:5000,rounds:0,wins:0,difficulty:'normal',saved:null},key='',ready=false,pick=-1,timer=null,lobby=true,saveFailed=false,conflict=false;
const send=type=>{if(parent!==window)parent.postMessage({source:'ojjuda-poker',type},location.origin);};

let visual={game:null,cards:[],shown:[],bets:[],pot:0,finished:false};
const faces=['C','H','D','S'];
function card(c,{hidden=false,publicCard=false,best=false,selected=false,button=false,index=0,selectable=false,fresh=false,revealed=false,fan=0}={}){
  const tag=button?'button':'span',label=hidden?'비공개 카드':cardName(c);
  return `<${tag} class="card${hidden?' back':''}${publicCard?' public':''}${best?' best':''}${selected?' selected':''}${selectable?' selectable':''}${fresh?' dealing':''}${revealed?' revealing':''}" ${button?`type="button" data-card="${index}" aria-pressed="${selected}"`:''} style="--i:${index};--fan:${fan}deg" aria-label="${label}${publicCard?' · 공개':''}">${hidden?'<span class="back-border" aria-hidden="true"><span class="back-emblem">♠<small>OJ JU DA</small></span></span>':`<img class="card-face" src="cards/${faces[suit(c)]}-${face(c)}.svg" alt="" draggable="false" decoding="async">`}${publicCard?'<span class="card-state" aria-hidden="true">공개</span>':''}</${tag}>`;
}
function chipStack(amount=500,{mini=false}={}){
  const count=mini?1:Math.min(4,Math.max(2,Math.ceil(amount/750)));
  return `<span class="chip-stacks${mini?' mini':''}" aria-hidden="true">${Array.from({length:count},(_,i)=>`<span class="chip-stack ${['jade','ivory','burgundy','gold'][i]}" style="--stack:${i}">${Array.from({length:mini?2:3+(i+Math.floor(amount/100))%4},(_,j)=>`<i class="chip" style="--layer:${j}"><span>${['50','100','500','1K'][i]}</span></i>`).join('')}</span>`).join('')}</span>`;
}
function dealer(index){return game.dealer===index?'<span class="dealer" title="이번 판 딜러" aria-label="딜러">D</span>':'';}
function header(){
  return `<header class="app-header"><div class="title"><img class="logo" src="/favicon.svg" alt="오쭈다"><span>세븐포커<small>OJ JU DA · POKER CLUB</small></span></div><div class="header-tools"><button class="small-button" data-action="sound" aria-label="효과음 설정" aria-haspopup="dialog">${sfx.settings().enabled&&sfx.settings().volume?'소리 켬':'소리 끔'}</button><button class="small-button" data-action="help">족보</button><div class="wallet"><small>MY GOLD</small><b>${fmt(game?game.players[0].stack:record.bank)}<span>G</span></b></div></div></header>${saveFailed?'<div class="save-warning" role="alert">이 기기에 저장하지 못했어요. 창을 닫으면 진행 내용이 사라질 수 있어요.</div>':''}`;
}
function renderLobby(){
  const canResume=game&&game.phase!=='finished';
  app.innerHTML=header()+`<section class="lobby"><div class="lobby-copy"><span class="eyebrow"><i></i> THE SEVEN CARD TABLE</span><h1>Seven<br><em>Poker.</em></h1><p class="intro">일곱 장의 패, 한 번의 승부.<br>마지막 히든까지, 흐름을 읽으세요.</p><div class="table-spec"><span><b>04</b> 플레이어</span><span><b>07</b> 카드</span><span><b>50 G</b> 참가비</span></div><div class="lobby-settings"><span>컴퓨터 난이도</span><div class="seg" role="group" aria-label="컴퓨터 난이도">${[['easy','편하게'],['normal','보통']].map(([id,label])=>`<button data-difficulty="${id}" class="${record.difficulty===id?'on':''}" aria-pressed="${record.difficulty===id}" ${canResume?'disabled':''}>${label}</button>`).join('')}</div></div><button class="primary start" data-action="${canResume?'resume':'start'}" ${record.bank<50&&!canResume?'disabled':''}><span>${canResume?'하던 판 이어하기':'테이블 입장'}</span><span class="start-arrow" aria-hidden="true">↗</span></button>${record.bank<1000&&!canResume?'<button class="refill" data-action="refill">연습용 골드 5,000 G 충전</button>':''}<button class="rules-link" data-action="help">게임 방법 · 족보 보기 <span aria-hidden="true">→</span></button></div><div class="lobby-showcase" aria-hidden="true"><div class="showcase-ring"></div><div class="showcase-label">OJ JU DA<span>SEVEN POKER</span></div><div class="showcase-deck">${card(0,{hidden:true})}${card(0,{hidden:true})}${card(0,{hidden:true})}</div><div class="card-fan">${[47,48,49,50,51].map((c,i)=>card(c,{index:i})).join('')}</div><div class="showcase-chips">${chipStack(2500)}</div><span class="showcase-dealer">D</span><span class="showcase-caption">A CLASSIC GAME. A NEW TABLE.</span></div><div class="lobby-footer"><div class="lobby-stats"><span><b>${fmt(record.rounds)}</b>플레이</span><span><b>${fmt(record.wins)}</b>승리</span><span><b>${record.rounds?Math.round(record.wins/record.rounds*100):0}%</b>승률</span></div><p class="practice-note">컴퓨터 3명과 대전 · 만 20세 이상<br>기기에 저장되는 연습용 골드</p></div></section>`;
}
function raiseTarget(part){
  const l=game.legal(),p=game.players[0];
  return Math.min(l.maxTo,Math.max(l.minTo,p.bet+l.need+Math.floor((game.pot+l.need)*part)));
}
function controls(){
  if(game.phase==='discard'||game.phase==='open')return `<button class="primary wide" data-action="select" ${pick<0?'disabled':''}><span>${pick<0?'카드를 선택하세요':game.phase==='discard'?'선택한 카드 버리기':'선택한 카드 공개'}</span><small>${game.phase==='discard'?'DISCARD':'OPEN CARD'} →</small></button>`;
  if(game.phase==='finished')return `<button class="primary wide" data-action="${record.bank<50?'refill':'next'}">${record.bank<50?'연습용 골드 5,000 G 충전':'다음 판 시작'}<small>NEXT HAND →</small></button><button class="wide small-button" data-action="lobby">로비로 돌아가기</button>`;
  if(game.phase!=='betting'||game.turn!==0)return '<div class="waiting" role="status"><span class="thinking"><i></i><i></i><i></i></span>상대가 패를 읽고 있습니다</div>';
  const l=game.legal(),p=game.players[0];
  const raiseButton=(action,label,part)=>{const to=raiseTarget(part);return `<button data-action="${action}" ${!l.mayRaise?'disabled':''}><span>${label}</span><small>+${fmt(to-p.bet)} G</small></button>`;};
  return `<button class="fold" data-action="fold"><span>다이</span><small>FOLD</small></button><button class="call" data-action="${l.check?'check':'call'}"><span>${l.check?'체크':'콜'}</span><small>${l.check?'CHECK':fmt(l.call)+' G'}</small></button>${raiseButton('minimum','삥',0)}${raiseButton('quarter','쿼터',.25)}${raiseButton('half','하프',.5)}<button class="allin" data-action="allin" ${!l.allIn?'disabled':''}><span>올인</span><small>${fmt(p.stack)} G</small></button>`;
}
function status(){
  if(game.phase==='discard')return '버릴 카드 1장을 선택하세요';
  if(game.phase==='open')return '공개할 카드 1장을 선택하세요';
  if(game.phase==='finished')return '쇼다운 · 이번 판 종료';
  if(game.phase==='between'||game.phase==='runout')return game.street===7?'마지막 패를 확인합니다':'다음 카드를 나눕니다';
  if(game.turn===0)return game.legal().check?'내 차례 · 체크 또는 베팅':`내 차례 · 콜 ${fmt(game.legal().call)} G`;
  return `${game.players[game.turn].name}의 차례`;
}
function renderTable(){
  const done=game.phase==='finished',showdown=done&&!game.result.uncontested,me=game.players[0],hand=bestHand(me.cards),selecting=['discard','open'].includes(game.phase),myTurn=selecting||game.phase==='betting'&&game.turn===0;
  const same=visual.game===game,winning=new Set(done?game.result.pots.filter(p=>!p.refund).flatMap(p=>p.winners):[]);
  const fresh=(seat,c)=>!same||!visual.cards[seat]?.includes(c);
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
    return `<section class="seat seat-${i}${active?' active':''}${p.folded?' folded':''}${winning.has(i)?' winner':''}" aria-label="${esc(p.name)}${active?' 차례':''}"><div class="seat-label"><span class="seat-number">0${i}</span>${dealer(i)}<span class="seat-type">COMPUTER</span></div><button class="seat-head" data-seat="${i}" aria-label="${esc(p.name)} 공개 카드 크게 보기"><span class="seat-monogram" aria-hidden="true">${['','♠','♦','♣'][i]}</span><span class="seat-info"><strong>${esc(p.name)}</strong><small>${fmt(p.stack)} <span>G</span></small></span><span class="turn-light" aria-hidden="true"></span></button><button class="seat-cards" data-seat="${i}" aria-label="${esc(p.name)} 공개 카드 크게 보기"><span class="down-cards">${down.map((c,k)=>card(c,{hidden:!reveal,index:k,fresh:fresh(i,c),revealed:reveal&&revealed(i,c),best:!!best?.cards.includes(c)})).join('')}</span><span class="up-cards">${up.map((c,k)=>card(c,{index:k,fresh:fresh(i,c),best:!!best?.cards.includes(c)})).join('')}</span></button><span class="seat-action${p.allIn?' is-allin':''}">${active?'<i class="action-dot"></i>':''}${esc((p.last||'대기').replace(/^베팅 .*/, '베팅'))}${p.bet>0?`<b>${fmt(p.bet)} <small>G</small></b>`:''}</span>${best?`<span class="result-seats">${best.name}</span>`:''}${betMoved?'<span class="bet-flight" aria-hidden="true"><i class="chip"></i><i class="chip"></i><i class="chip"></i></span>':''}</section>`;
  }).join('');
  app.innerHTML=header()+`<section class="game"><div class="round-strip"><span class="table-id"><i></i> TABLE 01 <span>· HAND ${String(done?record.rounds:record.rounds+1).padStart(2,'0')}</span></span><div class="street-dots" aria-label="진행 단계">${[[0,'패 선택'],[4,'4구'],[5,'5구'],[6,'6구'],[7,'히든']].map(([n,label])=>`<span class="${game.street===n?'on':game.street>n?'passed':''}">${label}</span>`).join('')}</div></div><div class="table-scene"><div class="felt"><div class="felt-inlay" aria-hidden="true"></div><div class="opponents">${seats}</div><div class="pot-zone${potChanged?' pot-changed':''}"><span class="pot-label">${done?'TOTAL POT':'MAIN POT'}</span><div class="pot-amount">${fmt(game.pot)}<span>G</span></div>${chipStack(game.pot)}<span class="table-rule">SEVEN CARD STUD · ANTE 50</span></div><section class="player${myTurn?' active':''}${me.folded?' folded':''}"><div class="player-header"><div class="player-name">${dealer(0)}<b>나</b><span>${me.folded?'다이':me.allIn?'ALL IN':myTurn?'YOUR TURN':'PLAYER'}</span></div><span class="hand-label">${selecting?'패 선택':hand.name}</span></div><div class="my-cards">${me.cards.map((c,i)=>card(c,{button:true,index:i,publicCard:me.up.includes(c),best:done&&!me.folded&&showdown&&hand.cards.includes(c),selected:pick===i&&selecting,selectable:selecting,fresh:fresh(0,c),fan:(i-(me.cards.length-1)/2)*1.4})).join('')}</div>${same&&me.total>visual.bets[0]?'<span class="bet-flight player-flight" aria-hidden="true"><i class="chip"></i><i class="chip"></i><i class="chip"></i></span>':''}<div class="player-bet">${me.bet>0?`<span class="bet-dot"></span>이번 베팅 <b>${fmt(me.bet)} G</b>`:'공개 4장 · 비공개 3장'}</div></section></div></div><section class="decision-panel${myTurn?' my-turn':''}">${result}<div class="decision-heading"><div class="status" id="status" role="status" aria-live="polite">${status()}</div><span>${done?'황금 테두리 · 베스트 5장':selecting?`${game.phase==='discard'?'DISCARD':'OPEN'} 1 / ${me.cards.length}`:'한국식 세븐포커'}</span></div><div class="actions${done?' finished-actions':''}">${controls()}</div></section><div class="table-footer"><details class="recent"><summary>핸드 기록 <span>↗</span></summary><ol>${game.log.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></details><span>연습 테이블 · 50 G ANTE</span></div></section>`;
  visual={game,cards:game.players.map(p=>[...p.cards]),shown:game.players.map((p,i)=>i===0||showdown&&!p.folded?[...p.cards]:[...p.up]),bets:game.players.map(p=>p.total),pot:game.pot,finished:done};
}
function render(){
  if(!ready||conflict)return;
  const focused=document.activeElement,focusKey=focused?.hasAttribute('data-card')?['data-card',focused.dataset.card]:focused?.hasAttribute('data-action')?['data-action',focused.dataset.action]:null;
  const keyboardFocus=focused?.matches?.(':focus-visible'),historyOpen=app.querySelector('.recent')?.open;
  if(lobby)renderLobby();else renderTable();
  if(historyOpen&&app.querySelector('.recent'))app.querySelector('.recent').open=true;
  if(keyboardFocus&&focusKey)app.querySelector(`[${focusKey[0]}="${focusKey[1]}"]`)?.focus({preventScroll:true});
}

function save(){
  if(!key||conflict)return false;
  if(game){record.bank=game.players[0].stack;record.saved=game;}
  try{localStorage.setItem(key,JSON.stringify({...record,audio:sfx.settings(),saved:game?{...game,random:undefined}:null}));saveFailed=false;return true;}catch{saveFailed=true;return false;}
}
function settle(){
  if(game?.phase==='finished'&&!game.counted){game.counted=true;record.rounds++;if(game.result.pots.some(p=>!p.refund&&p.winners.includes(0)))record.wins++;void sfx.play(game.result.net[0]>0?'win':'end');}
  save();
}
function soundControls(){
  const {enabled,volume}=sfx.settings();
  document.querySelector('#sound-enabled').checked=enabled;
  document.querySelector('#sound-volume').value=Math.round(volume*100);
  document.querySelector('#sound-volume-value').textContent=Math.round(volume*100)+'%';
}
function actionSound(action){void sfx.play({minimum:'raise',quarter:'raise',half:'raise'}[action]||action);}
function schedule(){
  clearTimeout(timer);timer=null;
  if(!game||lobby||conflict||document.hidden||document.querySelector('#exit-dialog').open||document.querySelector('#sound-dialog').open)return;
  if(game.phase==='betting'&&game.turn===0||['discard','open','finished'].includes(game.phase))return;
  const current=game;
  timer=setTimeout(()=>{
    if(current!==game||lobby||conflict)return;
    try{
      if(['between','runout'].includes(game.phase)){game.advance();void sfx.play(game.phase==='finished'?'reveal':'card');}
      else{const move=chooseAI(aiView(game),random,record.difficulty);game.act(move.type,move.to);actionSound(move.type);}
      settle();render();if(game.phase==='betting'&&game.turn===0)void sfx.play('turn');schedule();
    }catch(error){console.error('Poker action failed',error);clearTimeout(timer);document.querySelector('#status').textContent='진행 중 문제가 생겼어요. 오락실에서 다시 열어 주세요.';}
  },game.phase==='runout'?850:600+Math.floor(random()*350));
}
function start(){
  if(record.bank<50)return;
  const dealer=game?(game.dealer+1)%4:record.rounds%4;
  const cpu=game?game.players.slice(1).map(p=>p.stack<500?5000:p.stack):[5000,5000,5000];
  game=new SevenPoker({stacks:[record.bank,...cpu],dealer,random});pick=-1;lobby=false;void sfx.play('deal');save();render();
}
function showCards(seat){
  const p=game.players[seat],reveal=seat===0||game.phase==='finished'&&!game.result.uncontested&&!p.folded;
  document.querySelector('#cards-title').textContent=seat===0?'내 카드':`${p.name}의 공개 카드`;
  document.querySelector('#cards-content').innerHTML=p.cards.map(c=>card(c,{hidden:!reveal&&!p.up.includes(c),publicCard:p.up.includes(c)})).join('')+`<p class="muted">${seat===0?'공개 표시가 없는 카드는 나만 볼 수 있어요.':'상대의 비공개 카드는 승부가 끝날 때 열려요.'}</p>`;
  document.querySelector('#cards-dialog').showModal();
}
function exit(){clearTimeout(timer);sfx.pause();save();send('exit');}
function requestExit(){if(conflict){exit();return;}clearTimeout(timer);if(game&&game.phase!=='finished')document.querySelector('#exit-dialog').showModal();else exit();}
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(ready&&!conflict)void sfx.unlock();
  if(b.hasAttribute('data-close-dialog')){b.closest('dialog').close();return;}
  if(b.id==='confirm-exit'){exit();return;}
  if(!ready||conflict)return;
  if(b.dataset.difficulty){record.difficulty=b.dataset.difficulty;save();render();return;}
  if(b.hasAttribute('data-seat')){showCards(Number(b.dataset.seat));return;}
  if(b.hasAttribute('data-card')){if(['discard','open'].includes(game.phase)){pick=Number(b.dataset.card);void sfx.play('select');render();}else showCards(0);return;}
  const action=b.dataset.action;
  if(action==='help'){document.querySelector('#help').showModal();return;}
  if(action==='sound'){clearTimeout(timer);soundControls();document.querySelector('#sound-dialog').showModal();return;}
  if(action==='sound-test'){void sfx.play('raise');return;}
  if(action==='resume'){lobby=false;render();schedule();return;}
  if(action==='lobby'){lobby=true;render();return;}
  if(action==='start'||action==='next'){start();return;}
  if(action==='refill'){
    if(record.bank<1000&&(!game||game.phase==='finished')){record.bank+=5000;game=null;record.saved=null;save();lobby=true;render();}return;
  }
  if(action==='select'&&pick>=0){const cue=game.phase==='discard'?'discard':'reveal';if(game.phase==='discard')game.discard(pick);else if(game.phase==='open')game.open(pick);pick=-1;void sfx.play(cue);save();render();schedule();return;}
  if(game?.phase!=='betting'||game.turn!==0)return;
  try{
    if(['minimum','quarter','half'].includes(action))game.act('raise',raiseTarget({minimum:0,quarter:.25,half:.5}[action]));
    else if(['fold','check','call','allin'].includes(action))game.act(action);
    else return;
    actionSound(action);settle();render();schedule();
  }catch{document.querySelector('#status').textContent='지금 가능한 베팅을 다시 골라 주세요.';}
});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||parent===window||event.data?.source!=='ojjuda-world')return;
  const message=event.data;
  if(message.type==='poker-exit-request'){requestExit();return;}
  if(message.type!=='poker-init'||ready||typeof message.owner!=='string'||!message.owner)return;
  key='ojjuda.poker.practice.v1.'+message.owner;
  try{
    const saved=JSON.parse(localStorage.getItem(key)||'null');
    if(saved?.audio)sfx.configure(saved.audio);
    if(saved&&Number.isSafeInteger(saved.bank)&&saved.bank>=0&&saved.bank<=1e9){
      record={bank:saved.bank,rounds:Number.isSafeInteger(saved.rounds)&&saved.rounds>=0?saved.rounds:0,wins:Number.isSafeInteger(saved.wins)&&saved.wins>=0?saved.wins:0,difficulty:saved.difficulty==='easy'?'easy':'normal',saved:null};
      game=restoreGame(saved.saved,random);if(game)record.bank=game.players[0].stack;
    }
  }catch{}
  ready=true;render();
});
window.addEventListener('storage',event=>{
  if(event.key!==key||!ready)return;
  conflict=true;clearTimeout(timer);sfx.pause();
  app.innerHTML='<section class="gate"><h1>다른 창에서 진행 중이에요</h1><p>골드가 겹쳐 저장되지 않도록 이 창은 멈췄어요.<br>오락실로 돌아갔다가 다시 열어 주세요.</p></section>';
});
document.querySelector('#exit-dialog').addEventListener('close',schedule);
document.querySelector('#sound-dialog').addEventListener('close',schedule);
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
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);sfx.pause();save();}else schedule();});
window.addEventListener('pagehide',()=>{clearTimeout(timer);sfx.pause();save();});
if(parent!==window)send('ready');
else app.innerHTML='<section class="gate"><span class="brand">오쭈다 오락실</span><h1>세븐포커</h1><p>오락실에서 세븐포커를 열어 주세요.</p><a href="/world.html?game=poker">오락실로 가기 →</a></section>';
setTimeout(()=>{if(!ready&&parent!==window)app.innerHTML='<section class="gate"><h1>게임을 연결하지 못했어요</h1><p>게임 목록으로 돌아갔다가 다시 열어 주세요.</p></section>';},10000);
