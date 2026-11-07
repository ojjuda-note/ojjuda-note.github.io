import './rules.js?v=20261106-solitaire-ranking1';
import {SUITS,red,copy,createGame,getPile,canMove,move,draw,isWon,canFinish,legalMoves,suggest,validateState,visibleWasteCount,restoreWastePackets} from './engine.js?v=20261106-solitaire-ranking1';
import {cardFace,CARD_RATIO} from './cards.js?v=20261106-solitaire-images1';
import {gestureSource,HOLD_DELAY} from './gestures.js?v=20261107-solitaire-hold250-1';
import {playWinAnimation} from './celebration.js?v=20261106-solitaire-images1';
import {overlappingTarget} from './drop-targets.js?v=20261106-solitaire-ranking1';
import {createViewport} from './viewport.js?v=20261106-solitaire-ranking1';
const $=s=>document.querySelector(s);
const SYMBOLS={spades:'♠',hearts:'♥',clubs:'♣',diamonds:'♦'};
const SUIT_NAMES={spades:'스페이드',hearts:'하트',clubs:'클로버',diamonds:'다이아몬드'};
const cardElements=new Map();
const KEY='ojjuda-solitaire-v1:'+ (new URLSearchParams(location.search).get('owner')||'guest');
let externalPaused=false, runId=crypto.randomUUID(), completion=null, stopWinAnimation=null;
let state=createGame(), history=[], elapsed=0, started=false, selected=null, locked=false, winPlaying=false, lastTick=Date.now(), ignoreClickUntil=0, lastTap=null, pointer=null, toastTimer, saveWorking=true;
try {
  const saved=JSON.parse(localStorage.getItem(KEY));
  if(saved?.version===1 && validateState(saved.state)) {
    state=saved.state;
    if(typeof saved.runId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(saved.runId))runId=saved.runId;
    if(isWon(state)&&saved.completion?.runId===runId&&saved.completion.drawCount===state.drawCount&&saved.completion.score!=null&&window.OjjudaSolitaireRules.score(state.drawCount,saved.completion.seconds)===saved.completion.score)completion=saved.completion;
    elapsed=Number.isFinite(saved.elapsed)?Math.max(0,saved.elapsed):0;
    started=!!saved.started;
    history=Array.isArray(saved.history)?saved.history.filter(validateState).slice(-100):[];
  }
} catch {}
restoreWastePackets([...history,state]);

function save(){
  try {localStorage.setItem(KEY,JSON.stringify({version:1,state,history,elapsed,started,runId,completion}));saveWorking=true;}
  catch {saveWorking=false;}
  if(!saveWorking)$('#new-game').title='이 브라우저에서는 저장할 수 없어요';
}
const formatTime=t=>{const s=Math.floor(t/1000);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
const rankName=r=>({1:'A',11:'J',12:'Q',13:'K'}[r]||r);
function cardName(c){return `${SUIT_NAMES[c.suit]} ${rankName(c.rank)}`;}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
function makeCard(c,source){
  if(!c.id){
    const back=document.createElement('div');back.className='card back';back.innerHTML=cardFace({up:false});back.setAttribute('aria-label','뒤집힌 카드');return back;
  }
  let card=cardElements.get(c.id);
  if(!card){
    card=document.createElement('button');card.type='button';card.dataset.cardId=c.id;
    // Keep both sides in the same node, ready before the covering card moves.
    card.innerHTML=`<span class="card-front">${cardFace(c)}</span><span class="card-back">${cardFace({up:false})}</span>`;
    const art=card.querySelector('.card-front img');
    art.decoding='async';art.fetchPriority=c.up?'high':'low';
    art.decode?.().catch(()=>{});
    cardElements.set(c.id,card);
  }
  card.className=`card ${c.up?(red(c)?'red':''):'back'}`;
  card.style.cssText='';card.disabled=!c.up||!source;
  card.setAttribute('aria-label',c.up?cardName(c):'뒤집힌 카드');
  card.removeAttribute('aria-pressed');card.removeAttribute('title');
  if(!c.up||!source){delete card.dataset.source;return card;}
  card.dataset.source=JSON.stringify(source);card.title=cardName(c);
  if(selected && selected.type===source.type && selected.col===source.col && source.index>=selected.index){card.classList.add('selected');card.setAttribute('aria-pressed','true');}
  return card;
}
function makePile(type,col,label,symbol){
  const p=document.createElement('div');p.className='pile';p.dataset.type=type;p.dataset.col=col;
  p.setAttribute('role','group');p.setAttribute('aria-label',label);
  const slot=document.createElement('button');slot.className='slot';slot.type='button';slot.setAttribute('aria-label',label);
  slot.innerHTML=`<span class="slot-symbol">${symbol}</span><span class="slot-label">${type==='foundation'?'A → K':type==='tableau'?'K':''}</span>`;
  p.append(slot);return p;
}
function updateStats(){
  $('#time').textContent=formatTime(elapsed);
  $('#undo').disabled=!history.length || locked;$('#auto').hidden=!canFinish(state);$('#auto').disabled=locked;$('#hint').disabled=locked||isWon(state);
  $('#mode-label').textContent=`${state.drawCount===1?'초보':'보통'} · ${state.drawCount}장`;
}
function render(){
  const top=$('#top-row');top.replaceChildren();
  const stock=document.createElement('div');stock.className='pile';stock.dataset.type='stock';
  const stockButton=document.createElement('button');stockButton.id='stock';stockButton.className='stock-button';stockButton.type='button';
  stockButton.setAttribute('aria-label',state.stock.length?`카드 ${state.drawCount}장 뽑기, ${state.stock.length}장 남음`:state.waste.length?'카드 다시 돌리기':'남은 카드 없음');
  stockButton.disabled=!state.stock.length&&!state.waste.length;
  if(state.stock.length){stockButton.append(makeCard({up:false},null));stockButton.innerHTML+=`<span class="stock-counter">${state.stock.length}</span>`;}
  else stockButton.innerHTML=`<span class="slot"><span class="slot-symbol">${state.waste.length?'↻':'✓'}</span><span class="slot-label">${state.waste.length?'다시 돌리기':'모두 뽑음'}</span></span>`;
  stock.append(stockButton);top.append(stock);
  const waste=makePile('waste',0,'뽑은 카드','');waste.querySelector('.slot').disabled=true;
  const shown=visibleWasteCount(state);
  state.waste.slice(-shown||state.waste.length).forEach((c,i)=>{
    const index=state.waste.length-shown+i,card=makeCard(c,{type:'waste',col:0,index});
    card.style.left=`${i*55}%`;card.style.zIndex=i+1;
    if(index!==state.waste.length-1){card.disabled=true;card.style.pointerEvents='none';}
    waste.append(card);
  });
  top.append(waste,document.createElement('div'));
  state.foundations.forEach((p,col)=>{const pile=makePile('foundation',col,`${SUIT_NAMES[SUITS[col]]} 미션칸`,SYMBOLS[SUITS[col]]);if(p.length)pile.append(makeCard(p.at(-1),{type:'foundation',col,index:p.length-1}));top.append(pile);});
  const table=$('#tableau');table.replaceChildren();
  state.tableau.forEach((p,col)=>{const pile=makePile('tableau',col,`${col+1}번째 줄, 빈칸에는 K`,'');p.forEach((c,index)=>{const card=makeCard(c,{type:'tableau',col,index});card.dataset.index=index;card.style.zIndex=index+1;pile.append(card);});table.append(pile);});
  layout();updateStats();
  // Warm the complete 52-card deck, including the next stock/waste/foundation
  // cards. Re-renders reuse these decoded images instead of requesting on reveal.
  for(const c of [...state.stock,...state.waste,...state.foundations.flat()])if(!cardElements.has(c.id))makeCard(c,null);
}
function layout(){
  if(pointer?.dragging)pointer.candidates=null;
  view.prepare();
  const first=$('#tableau .pile');if(!first)return;
  const width=first.clientWidth, cardHeight=width*CARD_RATIO;
  const faceStep=Math.max(24,Math.ceil(width*.43)),backStep=width<65?12:18;
  $('#tableau').querySelectorAll('.pile').forEach((pile,col)=>{
    const cards=state.tableau[col];let offsets=[],offset=0;
    cards.forEach(c=>{offsets.push(offset);offset+=c.up?faceStep:backStep;});
    pile.querySelectorAll('.card').forEach((el,index)=>{el.style.top=`${offsets[index]}px`;});
    pile.style.setProperty('--pile-height',`${(offsets.at(-1)||0)+cardHeight}px`);
  });
  view.updateSize();
}
function commit(action){
  const previous=copy(state);if(!action())return false;
  history.push(previous);if(history.length>100)history.shift();
  selected=null;lastTap=null;if(!started)lastTick=Date.now();started=true;render();save();
  if(isWon(state))win();return true;
}
function undo(){if(locked||!history.length)return;state=history.pop();selected=null;lastTap=null;render();save();toast('한 번의 이동을 되돌렸어요.');}
function targetFrom(el){const pile=el?.closest('.pile');return pile?{type:pile.dataset.type,col:Number(pile.dataset.col)}:null;}
function autoMove(source){
  const top=gestureSource(state,source),card=getPile(state,top)?.[top.index];
  if(!card)return;
  const target={type:'foundation',col:SUITS.indexOf(card.suit)};
  if(canMove(state,top,target))commit(()=>move(state,top,target));else{selected=top;render();toast('미션칸에는 같은 무늬를 A부터 순서대로 놓아 주세요.');}
}
$('#board').addEventListener('click',e=>{
  if(locked||Date.now()<ignoreClickUntil)return;
  if(e.target.closest('#stock')){commit(()=>draw(state));return;}
  const target=targetFrom(e.target),card=e.target.closest('.card[data-source]');
  if(selected && target && canMove(state,selected,target)){commit(()=>move(state,selected,target));return;}
  if(card){
    const source=gestureSource(state,JSON.parse(card.dataset.source));
    if(source.type==='waste' && source.index!==state.waste.length-1)return;
    if(lastTap?.id===card.dataset.cardId && Date.now()-lastTap.time<380){lastTap=null;autoMove(source);return;}
    lastTap={id:card.dataset.cardId,time:Date.now()};
    const same=selected&&selected.type===source.type&&selected.col===source.col&&selected.index===source.index;
    selected=same?null:source;render();
  }else if(selected && target){toast(target.type==='tableau'&&!getPile(state,target)?.length?'빈 줄에는 K부터 놓을 수 있어요.':'색을 번갈아, 숫자는 하나 작게 놓아 주세요.');}
});
$('#board').addEventListener('pointerdown',e=>{
  if(locked||e.button!==0||pointer)return;
  ignoreClickUntil=0;
  const el=e.target.closest('.card[data-source]');if(!el)return;
  const touched=JSON.parse(el.dataset.source);
  if(touched.type==='waste'&&touched.index!==state.waste.length-1)return;
  const source=gestureSource(state,touched),r=el.getBoundingClientRect();
  pointer={id:e.pointerId,touched,source,el,startX:e.clientX,startY:e.clientY,width:r.width,dragging:false,grouped:false};
  const p=pointer;
  p.holdTimer=setTimeout(()=>{
    if(pointer!==p||p.dragging)return;
    const group=gestureSource(state,p.touched,true);if(!group)return;
    p.grouped=true;p.source=group;selected=group;lastTap=null;
    p.el.parentElement.querySelectorAll('.card[data-source]').forEach(c=>{const s=JSON.parse(c.dataset.source);c.classList.toggle('selected',s.index>=group.index);});
    const count=getPile(state,group).length-group.index;toast(count>1?`${count}장 묶음 선택 · 끌어서 옮기세요`:'1장 선택 · 끌어서 옮기세요');
  },HOLD_DELAY);
  el.setPointerCapture(e.pointerId);
});
$('#board').addEventListener('pointermove',e=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  const p=pointer;
  if(!p.dragging && Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>7){
    clearTimeout(p.holdTimer);p.dragging=true;selected=null;lastTap=null;
    p.ghost=document.createElement('div');p.ghost.className='drag-layer';p.ghost.style.width=`${p.width}px`;
    const sourceCards=[...p.el.parentElement.querySelectorAll('.card[data-source]')].filter(el=>JSON.parse(el.dataset.source).index>=p.source.index);
    p.origins=sourceCards;
    const sourceRects=sourceCards.map(el=>el.getBoundingClientRect()),first=sourceRects[0],firstTop=first.top;
    p.height=Math.max(...sourceRects.map(r=>r.bottom))-firstTop;
    p.dx=p.startX-first.left;p.dy=p.grouped?p.startY-firstTop:Math.min(p.startY-firstTop,first.height*.5);
    p.dy=Math.max(8,p.dy);
    p.candidates=dropCandidates(p.source);clearTargets();
    sourceCards.forEach((el,index)=>{const clone=el.cloneNode(true);clone.classList.remove('selected');clone.style.top=`${sourceRects[index].top-firstTop}px`;clone.style.left='0';clone.setAttribute('aria-hidden','true');p.ghost.append(clone);el.classList.add('drag-origin');});
    p.ghost.style.height=`${p.height}px`;document.body.append(p.ghost);
  }
  if(p.dragging){
    e.preventDefault();p.left=e.clientX-p.dx;p.top=e.clientY-p.dy;
    p.ghost.style.transform=`translate3d(${p.left}px,${p.top}px,0)`;
    const target=findDropTarget(p)?.element;
    if(target!==p.targetElement){p.targetElement?.classList.remove('target');target?.classList.add('target');p.targetElement=target;}
  }
});
function clearTargets(){document.querySelectorAll('.pile.target').forEach(el=>el.classList.remove('target'));}
function dropCandidates(source){
  const visible=$('#board-viewport').getBoundingClientRect();
  return [...document.querySelectorAll('#board .pile')].flatMap(element=>{
    const target=targetFrom(element);if(!canMove(state,source,target))return [];
    const surface=element.querySelector('.card:last-child')||element.querySelector('.slot');
    const r=surface.getBoundingClientRect();
    const rect={left:Math.max(r.left,visible.left),right:Math.min(r.right,visible.right),top:Math.max(r.top,visible.top),bottom:Math.min(r.bottom,visible.bottom)};
    return rect.right>=rect.left&&rect.bottom>=rect.top?[{target,element,rect}]:[];
  });
}
function findDropTarget(p){
  // Read target geometry once per drag (again only after resize/scroll), not on every pointer event.
  p.candidates??=dropCandidates(p.source);
  return overlappingTarget({left:p.left,top:p.top,right:p.left+p.width,bottom:p.top+p.height},p.candidates);
}
$('#board-viewport').addEventListener('scroll',()=>{if(pointer?.dragging)pointer.candidates=null;},{passive:true});
function endDrag(e,cancel=false){
  if(!pointer||pointer.id!==e.pointerId)return;
  const p=pointer;pointer=null;
  clearTimeout(p.holdTimer);
  try{p.el.releasePointerCapture(e.pointerId);}catch{}
  if(!p.dragging){if(p.grouped){ignoreClickUntil=Date.now()+450;selected=cancel?null:p.source;render();}return;}
  if(!cancel){p.left=e.clientX-p.dx;p.top=e.clientY-p.dy;}
  const target=cancel?null:findDropTarget(p)?.target;
  ignoreClickUntil=Date.now()+450;p.ghost.remove();p.origins.forEach(el=>el.classList.remove('drag-origin'));clearTargets();
  if(cancel)return;
  if(target && canMove(state,p.source,target))commit(()=>move(state,p.source,target));else{selected=p.source;render();}
}
$('#board').addEventListener('pointerup',e=>endDrag(e));$('#board').addEventListener('pointercancel',e=>endDrag(e,true));
$('#board').addEventListener('contextmenu',e=>{if(e.target.closest('.card'))e.preventDefault();});
function hint(){
  if(locked)return;selected=null;render();const h=suggest(state);
  if(!h){toast('추천할 이동이 없어요. 되돌리거나 새 게임을 시작해 보세요.');return;}
  if(h.draw){$('#stock').classList.add('hinted');toast(state.stock.length?'왼쪽 카드 더미에서 카드를 뽑아 보세요.':'왼쪽 ↻ 버튼을 눌러 카드를 다시 돌려 보세요.');}
  else{
    const c=getPile(state,h.source)[h.source.index];$(`[data-card-id="${c.id}"]`).classList.add('hinted');$(`.pile[data-type="${h.target.type}"][data-col="${h.target.col}"]`).classList.add('target');
    toast(`${cardName(c)} → ${h.target.type==='foundation'?'위쪽 미션칸':`${h.target.col+1}번째 줄`}`);
  }
  setTimeout(()=>document.querySelectorAll('.hinted,.target').forEach(el=>el.classList.remove('hinted','target')),3300);
}
async function finish(){
  if(locked||!canFinish(state))return;locked=true;updateStats();
  while(canFinish(state)){
    const next=legalMoves(state,false).find(m=>m.target.type==='foundation');if(!next)break;
    commit(()=>move(state,next.source,next.target));await new Promise(r=>setTimeout(r,100));
  }
  locked=winPlaying;updateStats();
}
const dialog=$('#dialog');
function openDialog(html){
  const now=Date.now();if(started&&!isWon(state)&&!document.hidden&&!dialog.open&&!externalPaused)elapsed+=Math.max(0,now-lastTick);
  $('#dialog-content').innerHTML=html;lastTick=now;if(!dialog.open)dialog.showModal();
  $('#dialog-content').querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());
}
dialog.addEventListener('close',()=>{lastTick=Date.now();});
function newGameDialog(){
  if(locked&&!isWon(state))return;
  stopCelebration();let chosen=state.drawCount;
  openDialog(`<div class="dialog-icon">♠</div><div class="dialog-kicker">A FRESH START</div><h2 class="dialog-title">새로운 한 판</h2><p class="dialog-text">${state.moves&&!isWon(state)?'진행 중인 게임은 새 게임으로 바뀌어요.':'카드를 섞고, 천천히 시작해 볼까요?'}<br>난이도를 골라 주세요.</p><div class="draw-options"><button class="draw-option ${chosen===1?'active':''}" data-draw="1" aria-pressed="${chosen===1}"><strong>초보</strong><small>한 번에 1장씩 공개</small></button><button class="draw-option ${chosen===3?'active':''}" data-draw="3" aria-pressed="${chosen===3}"><strong>보통</strong><small>한 번에 3장씩 공개</small></button></div><div class="dialog-buttons"><button data-close>돌아가기</button><button class="primary" id="start-new">게임 시작</button></div>`);
  dialog.querySelectorAll('[data-draw]').forEach(b=>b.onclick=()=>{chosen=Number(b.dataset.draw);dialog.querySelectorAll('[data-draw]').forEach(x=>{x.classList.toggle('active',Number(x.dataset.draw)===chosen);x.setAttribute('aria-pressed',String(Number(x.dataset.draw)===chosen));});});
  $('#start-new').onclick=()=>startNewGame(chosen);
}
function stopCelebration(){
  const stop=stopWinAnimation;stopWinAnimation=null;winPlaying=false;locked=false;stop?.();
}
function startNewGame(drawCount=state.drawCount){
  stopCelebration();
  state=createGame(drawCount);runId=crypto.randomUUID();completion=null;history=[];elapsed=0;started=false;selected=null;lastTap=null;lastTick=Date.now();ignoreClickUntil=0;
  $('#confetti').replaceChildren();render();save();if(dialog.open)dialog.close();
  $('#new-game').focus({preventScroll:true});toast('새 카드를 나눴어요. 편안하게 즐겨 주세요.');
}
function help(){
  if(locked)return;
  openDialog('<div class="dialog-icon">♣</div><div class="dialog-kicker">HOW TO PLAY</div><h2 class="dialog-title">한 장씩, 차근차근</h2><ol class="rules"><li>위쪽 미션칸 네 곳에 <strong>같은 무늬끼리 A부터 K까지</strong> 모으면 완성이에요.</li><li>아래 줄은 <strong>빨강·검정을 번갈아, 큰 숫자부터</strong> 놓아요. 순서가 맞는 카드 묶음도 함께 옮길 수 있어요.</li><li><strong>빈 줄에는 K</strong> 또는 K로 시작하는 묶음만 놓을 수 있어요.</li><li>왼쪽 더미를 누르면 <strong>초보는 1장, 보통은 3장</strong>씩 공개돼요. 다 뽑으면 <strong>↻</strong>로 다시 돌릴 수 있어요.</li><li><strong>바로 끌면 맨 위 한 장</strong>, <strong>0.25초 누른 뒤 끌면 연결된 묶음</strong>을 옮겨요. 중간 카드를 길게 누르면 그 카드부터 선택돼요.</li><li>카드를 <strong>두 번 터치하면 미션칸으로 자동 이동</strong>해요. 선택 후 목적지를 눌러 옮길 수도 있어요.</li><li>옮기는 카드가 목적지 카드에 닿으면 놓을 수 있어요. <strong>두 손가락으로 확대·축소와 화면 이동</strong>이 가능해요. 아래 % 버튼을 누르면 화면에 다시 맞춰요.</li></ol><div class="rules-example">♠ K &nbsp; <span class="r">♥ Q</span> &nbsp; ♣ J &nbsp; <span class="r">♦ 10</span></div><div class="dialog-buttons"><button class="primary" data-close>알겠어요</button></div>');
}
function pause(){if(locked||isWon(state))return;openDialog('<div class="dialog-icon">Ⅱ</div><div class="dialog-kicker">TAKE YOUR TIME</div><h2 class="dialog-title">잠깐 쉬어 가요</h2><p class="dialog-text">카드도 시간도 잠시 멈췄어요.<br>준비되면 이어서 즐겨 주세요.</p><div class="dialog-buttons"><button class="primary" data-close>게임 계속하기</button></div>');save();}
function win(){
  const now=Date.now();
  if(started&&!document.hidden&&!dialog.open&&!externalPaused)elapsed+=Math.max(0,now-lastTick);
  lastTick=now;
  if(!completion){
    const seconds=Math.max(1,Math.ceil(elapsed/1000));
    completion={runId,drawCount:state.drawCount,seconds,score:window.OjjudaSolitaireRules.score(state.drawCount,seconds),saved:false};
  }
  save();submitCompletion();
  winPlaying=true;locked=true;updateStats();
  const complete=()=>{if(!winPlaying)return;stopWinAnimation=null;winPlaying=false;locked=false;updateStats();showWinResult();};
  try{const stop=playWinAnimation(complete,{onRestart:()=>{notifyArcade('ojjuda-game-finished');startNewGame();}});if(winPlaying)stopWinAnimation=stop;}
  catch{complete();}
}
function showWinResult(){
  notifyArcade('ojjuda-game-finished');
  openDialog(`<div class="dialog-icon">♛</div><div class="dialog-kicker">BEAUTIFULLY DONE</div><h2 class="dialog-title">멋지게 완성했어요!</h2><p class="dialog-text">52장의 카드가 모두 제자리를 찾았네요.</p><div class="win-stats"><div><small>시간</small><strong>${formatTime((completion?.seconds||Math.ceil(elapsed/1000))*1000)}</strong></div><div><small>이동</small><strong>${state.moves}</strong></div><div><small>난이도</small><strong>${state.drawCount===3?'보통':'초보'}</strong></div></div><p id="ranking-status" class="dialog-text"></p><button id="retry-ranking" hidden>순위 저장 다시 시도</button><div class="dialog-buttons"><button data-close>카드 보기</button><button class="primary" id="play-again">다시 시작</button></div>`);
  updateRankingStatus();
  $('#retry-ranking').onclick=submitCompletion;
  $('#play-again').onclick=()=>startNewGame();
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){for(let i=0;i<45;i++){const p=document.createElement('span');p.className='confetti-piece';p.style.left=`${Math.random()*100}%`;p.style.animationDelay=`${Math.random()*.6}s`;p.style.animationDuration=`${2+Math.random()*2}s`;$('#confetti').append(p);}setTimeout(()=>$('#confetti').replaceChildren(),5000);}
}
$('#new-game').onclick=newGameDialog;$('#settings').onclick=newGameDialog;$('#help').onclick=help;$('#pause').onclick=pause;$('#undo').onclick=undo;$('#hint').onclick=hint;$('#auto').onclick=finish;
document.addEventListener('keydown',e=>{if(dialog.open||locked)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}else if(e.key.toLowerCase()==='h'){hint();}else if(e.key==='Escape'){e.preventDefault();requestExit();}else if(e.code==='Space'&&e.target===document.body){e.preventDefault();commit(()=>draw(state));}});
document.addEventListener('visibilitychange',()=>{lastTick=Date.now();save();});window.addEventListener('pagehide',save);window.addEventListener('resize',layout);
let timerTicks=0;
setInterval(()=>{const now=Date.now();if(started&&!isWon(state)&&!document.hidden&&!dialog.open&&!externalPaused){elapsed+=Math.max(0,now-lastTick);$('#time').textContent=formatTime(elapsed);}lastTick=now;if(++timerTicks%5===0)save();},1000);
const view=createViewport({
  cancelDrag:()=>{if(pointer)endDrag({pointerId:pointer.id},true);selected=null;lastTap=null;document.querySelectorAll('.selected').forEach(el=>el.classList.remove('selected'));},
  suppressClick:()=>{ignoreClickUntil=Date.now()+450;},
  canInteract:()=>!locked&&!dialog.open,
  relayout:layout
});
render();save();

function notifyArcade(type,data={}){if(window.parent!==window)window.parent.postMessage({source:'ojjuda-solitaire',type,...data},location.origin);}
function requestExit(){
  save();
  if(window.parent!==window){notifyArcade('ojjuda-game-exit-request');return;}
  openDialog('<h2 class="dialog-title">아지트로 갈까요?</h2><div class="dialog-buttons"><button data-close>게임 계속하기</button><button class="primary" id="leave-arcade">아지트로 나가기</button></div>');
  $('#leave-arcade').onclick=()=>location.assign('/world.html?tab=arcade');
}
$('#game-home').onclick=requestExit;
window.OjjudaSolitaireControls={save,pause(){
  const now=Date.now();
  if(started&&!isWon(state)&&!document.hidden&&!dialog.open&&!externalPaused)elapsed+=Math.max(0,now-lastTick);
  externalPaused=true;lastTick=now;
  if(pointer)endDrag({pointerId:pointer.id},true);
  save();
  return ()=>{externalPaused=false;lastTick=Date.now();};
}};

function submitCompletion(){
  if(!completion||completion.saved||window.parent===window||completion.score==null)return;
  completion.failed=false;updateRankingStatus();
  notifyArcade('ojjuda-game-result',{...completion,completed:true});
}
function updateRankingStatus(){
  const line=$('#ranking-status'),retry=$('#retry-ranking');
  if(!line||!completion||window.parent===window)return;
  line.textContent=completion.saved?'순위에 기록했어요.':completion.failed?'연결을 확인하고 다시 저장해 주세요.':'순위 기록을 저장하고 있어요…';
  if(retry)retry.hidden=!completion.failed;
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.source!=='ojjuda-world'||event.data.type!=='ojjuda-solitaire-record'||event.data.runId!==completion?.runId)return;
  completion.saved=event.data.ok===true;completion.failed=!completion.saved;save();updateRankingStatus();
});
submitCompletion();
