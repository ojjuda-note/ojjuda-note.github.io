import {Game} from './engine.js';
import {CARDS,CHARACTERS,ROLES,art,rankName,suitSymbol} from './data.js';
import {Tutorial,CHAPTERS,STEPS} from './tutorial.js?v=20261030-bang-clear-actions1';
import {online} from './online.js?v=20261029-entry-fix1';
import {recommend} from './hints.js?v=20261029-bang-hints1';
import {createHintPurchase} from './hint-purchase.js?v=20261030-bang-help1';
import {CARD_GUIDES} from './card-guides.js?v=20261030-bang-clear-actions1';
import {CHARACTER_GUIDES} from './character-guides.js?v=20261030-bang-characters1';

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SAVE='ojjuda-bang-practice-v1';
let soloLobby=true,currentHint=null,currentHintContext=null,hintBusy=false;
const hintPurchase=createHintPurchase({storage:()=>localStorage,request:body=>online.request(body)});
const hintContext=()=>online.playing?`${online.owner}:${online.room.id}:${online.room.version}`:null;
function hintToggle(){
 if(tutorial||!online.playing)return '';
 const pending=hintPurchase.read(online.owner),label=hintBusy?'확인 중…':currentHint?'추천 확인함':pending?.status==='ready'?'추천 보기':pending?'구매 확인':'추천 1쭈';
 return `<button class="hand-log-button hint-toggle" data-action="hint" ${hintBusy||currentHint||online.busy?'disabled':''} aria-label="${label}">${label}</button>`;
}
function hintResponse(){return tutorial||!online.playing?'<div class="practice-help guide-links"><button class="secondary" data-action="catalog">카드 안내 · 무료</button><button class="secondary" data-action="characterCatalog">캐릭터 안내 · 무료</button></div>':`<aside class="hint-response">${hintToggle()}<span class="hint-caption">내 패와 공개 정보 기준</span>${currentHint?`<div role="status"><strong>${esc(currentHint.title)}</strong><p>${esc(currentHint.reason)}</p></div>`:''}</aside>`;}
const me=()=>online.playing&&!tutorial?online.room.seat:0;
let game=new Game(),page='lobby',selected=null,targeting=false,modal=null,botTimer=null,toastTimer=null;
let sound=false,fast=false,eliminationSeen=false,resultSeen=false,sidSelected=[];
let settings={count:5,role:'random',character:'random'},saved=null;
let tutorial=null,tutorialOrigin=null,tutorialDone=false,tutorialFocusStep=-1,practicePreview=null;
try{tutorialDone=localStorage.getItem('bang-tutorial-complete')==='1';}catch{}
// A new visit starts a new practice round; sound, speed and purchases are separate.
try{localStorage.removeItem(SAVE);sound=localStorage.getItem('bang-sound')==='1';fast=localStorage.getItem('bang-fast')==='1';}catch{}

function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600);}
function save(){if(tutorial||online.playing)return;try{localStorage.setItem(SAVE,JSON.stringify(game.s));saved=game.s;}catch{toast('이 브라우저에서는 자동 저장을 사용할 수 없어요.');}}
function clearPractice(){saved=null;try{localStorage.removeItem(SAVE);}catch{}}
let audioCtx,audioNoise;
function sfx(kind='tap'){
 if(!sound)return;
 try{
  audioCtx??=new(window.AudioContext||window.webkitAudioContext)();
  void audioCtx.resume().catch(()=>{});
  if(!audioNoise){
   audioNoise=audioCtx.createBuffer(1,Math.ceil(audioCtx.sampleRate*.6),audioCtx.sampleRate);
   const samples=audioNoise.getChannelData(0);let previous=0;
   for(let i=0;i<samples.length;i++){previous=previous*.4+(Math.random()*2-1)*.6;samples[i]=previous;}
  }
  const now=audioCtx.currentTime+.005;
  const brush=(delay,duration,hz,level)=>{
   const source=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain(),at=now+delay;
   source.buffer=audioNoise;source.playbackRate.value=.96+Math.random()*.08;
   filter.type='bandpass';filter.frequency.value=hz;filter.Q.value=.55;
   source.connect(filter);filter.connect(gain);gain.connect(audioCtx.destination);
   gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.004);
   gain.gain.exponentialRampToValueAtTime(.0001,at+duration);gain.gain.linearRampToValueAtTime(0,at+duration+.005);
   source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
   source.start(at,Math.random()*.35);source.stop(at+duration+.006);
  };
  if(kind==='shot'){brush(0,.035,1500,.17);brush(.008,.09,240,.24);}
  else{brush(0,.065,2200,.13);brush(.025,.028,650,.12);}
 }catch{}
}
function mutate(fn){const before=game.s.serial;const ok=fn();if(ok===false){toast('지금은 사용할 수 없어요.');return;}if(game.s.serial!==before)sfx(game.s.visual?.kind==='damage'?'shot':'tap');save();render();}
function header(){return `<header class="topbar ${page==='game'?'in-game':''}"><button class="brand" data-action="${tutorial?'tutorial-exit':'home'}" aria-label="뱅 살롱 홈"><img src="assets/logo.png" alt="BANG!"><span>SALOON</span></button><nav class="nav" aria-label="게임 메뉴">${tutorial?'<span class="practice-label">연습 테이블</span><button class="textbtn" data-action="catalog">카드 안내</button><button class="textbtn" data-action="characterCatalog">캐릭터 안내</button>':'<span class="small-meta">THE WILD WEST CARD GAME</span>'}<button class="iconbtn" data-action="sound" aria-label="${sound?'소리 끄기':'소리 켜기'}" title="${sound?'소리 끄기':'소리 켜기'}">${sound?'♪':'♩'}</button>${tutorial?'<button class="textbtn" data-action="tutorial-restart">처음부터</button><button class="textbtn" data-action="tutorial-exit">나가기</button>':`${page==='game'&&!online.playing?`<button class="textbtn" data-action="speed" aria-label="진행 속도 변경">${fast?'빠르게':'보통 속도'}</button><span class="practice-label">연습 · 순위 제외</span>`:(online.playing?`<span class="practice-label">${online.room.mode==='solo'?'컴퓨터 대전 · 순위 반영':'방 '+online.room.code}</span>`:'<button class="textbtn tutorial-nav" data-action="tutorial-start">따라 배우기</button>')}<button class="textbtn" data-action="rules">게임 방법</button>${page==='game'?`<button class="textbtn" data-action="new">${online.playing?'대전 나가기':'새 게임'}</button>`:''}`}</nav></header>`;}
function credits(){return `<footer class="credits">비공식 팬 게임 · BANG!® &amp; 카드 그림 © daVinci Editrice S.r.l.<br><a href="https://bang.dvgiochi.com/cardslist.php?id=1&lang=en" target="_blank" rel="noopener">공식 카드 자료</a> · 그림 Alessandro Pierangelini · 게임 Emiliano Sciarra</footer>`;}
function lobby(){
 if(online.room?.status==='waiting')return `${header()}${online.waiting()}`;
 if(!soloLobby)return `${header()}${online.lobby()}${credits()}`;
 return `${header()}<main class="online-lobby game-entry"><div class="ge-icon" aria-hidden="true">☆</div><span class="ge-kicker">오쭈다 오락실 · 멀티게임</span><h1 class="ge-title">뱅!</h1><p class="ge-copy">정체를 숨기고, 동료를 찾아 살아남아요.</p>
 ${online.resumeEntry?.()||''}<div class="seg ge-play-modes" role="group" aria-label="게임 모드"><button class="on" aria-pressed="true" data-action="solo-lobby">컴퓨터 대전</button><button aria-pressed="false" data-action="home">온라인 대전</button></div>
 <span class="ge-label">참가 인원 · 나 포함</span><div class="seg" role="group" aria-label="참가 인원">${[4,5,6,7].map(n=>`<button data-action="count" data-value="${n}" class="${settings.count===n?'on':''}" aria-pressed="${settings.count===n}">${n}명</button>`).join('')}</div>
 <button class="ge-primary" data-action="start">${online.available?'컴퓨터 대전 · 순위 반영':'컴퓨터 연습 · 순위 제외'}</button>${saved&&!saved.winner?'<button class="ge-secondary" data-action="resume">이전 연습 이어하기 · 순위 제외</button>':''}
 <p class="ge-hint">${online.available?'승패 자동 저장 · 승리 +1 · 패배·기권 0연승':'로그인 전 연습은 순위에 포함되지 않아요.'}</p><button class="ge-secondary" data-action="tutorial-start">${tutorialDone?'튜토리얼 다시 해보기':'처음이라면, 눌러서 배우기'}</button>
 <p class="ge-hint">역할은 매 판 무작위로 배정돼요.</p><details class="ge-more"><summary>캐릭터 설정</summary><label class="ge-label" for="character">나의 캐릭터</label><select id="character"><option value="random">무작위로 만나기</option>${CHARACTERS.map(c=>`<option value="${c.id}" ${settings.character===c.id?'selected':''}>${c.name}</option>`).join('')}</select><button class="ge-secondary" data-action="characterCatalog">캐릭터 능력 안내</button></details>
 <details class="ge-more"><summary>게임 방법 · 소리</summary><p>원작 카드 80장과 캐릭터 16명으로 즐기는 서부 카드게임. 카드를 누르면 한국어 설명이 보여요.</p><button class="ge-secondary" data-action="rules">게임 방법</button><button class="ge-secondary" data-action="sound">${sound?'소리 끄기':'소리 켜기'}</button></details></main>${credits()}`;
}
function hearts(p){return `<div class="hearts" aria-label="생명 ${Math.max(0,p.hp)} / ${p.maxHp}">${Array.from({length:p.maxHp},(_,i)=>`<span aria-hidden="true" class="bullet ${i>=p.hp?'empty':''}"></span>`).join('')}<span class="hp-number">${Math.max(0,p.hp)}/${p.maxHp}</span></div>`;}
function face(card){return `<span class="card-face"><img src="${art(CARDS[card.type].image)}" alt="${CARDS[card.type].name} 원작 카드" draggable="false"><span class="rank-overlay ${['H','D'].includes(card.suit)?'red':''}">${rankName(card.rank)}${suitSymbol[card.suit]}</span></span>`;}
function cardButton(card,action='card',extra=''){
 const active=game.s&&page==='game'&&action==='card'&&!game.canPlay(me(),card),isSel=(tutorial&&practicePreview?practicePreview.id===card.id:selected===card.id)||sidSelected.includes(card.id);
 const hinted=currentHint&&(action==='sidCard'?currentHint.action==='sid'&&currentHint.cardIds.includes(card.id):card.id===currentHint.cardId);
 return `<button class="hand-card ${hinted?'hint-card':''} ${isSel?'selected':''} ${action==='card'&&!active&&game.s.phase!=='discard'?'unplayable':''}" data-action="${action}" data-value="${card.id}" ${extra} aria-label="${CARDS[card.type].name} 카드" aria-pressed="${isSel}">${active?'<span class="playable-dot"></span>':''}${hinted?'<span class="hint-badge">추천</span>':''}${face(card)}<span class="card-label">${CARDS[card.type].name}</span></button>`;
}
const POSITIONS={3:[[19,44],[50,17],[81,44]],4:[[17,38],[36,15],[67,15],[85,45]],5:[[15,40],[32,14],[66,14],[86,40],[72,81]],6:[[15,40],[32,14],[66,14],[86,40],[77,81],[23,81]]};
function seat(p,idx,count){
 const s=game.s,c=game.char(p.id),known=!!tutorial||p.role==='sheriff'||!p.alive||s.winner,r=ROLES[p.role],valid=targeting&&selectedCard()&&game.targets(me(),selectedCard()).includes(p.id)&&(!tutorial||tutorial.expected().value===p.id),pos=POSITIONS[count][idx];
 const active=s.current===p.id&&!s.winner;
 return `<button class="seat ${currentHint?.targetId===p.id?'hint-target':''} ${active?'active':''} ${!p.alive?'dead':''} ${valid?'targetable':''}" style="left:${pos[0]}%;top:${pos[1]}%" data-action="player" data-value="${p.id}" aria-label="${online.playing?esc(p.name):c.name}${known?', '+r.name:', 정체 미공개'}${valid?', 선택 가능한 대상':''}">${active?'<span class="turn-indicator">진행 중</span>':''}<div class="seat-top"><div class="portrait"><img src="${art(c.image)}" alt=""></div><div class="seat-name">${online.playing?esc(p.name):c.name}${online.room?.computerSeats?.includes(p.id)?' · 컴퓨터':''}<span class="role-tag ${p.role==='sheriff'?'sheriff':''}">${known?(p.role==='sheriff'?'★ ':'')+r.name:'? 정체 미공개'}${!p.alive?' · 탈락':''}</span></div></div>${hearts(p)}<div class="seat-bottom"><span>▱ ${p.hand.length}장</span><span class="distance">${valid?'선택하기':p.alive?`거리 ${game.distance(me(),p.id)===Infinity?'—':game.distance(me(),p.id)}`:'OUT'}</span></div>${p.equipment.length?`<div class="equipment-dots">${p.equipment.map(e=>`<span class="equipment-tag">${CARDS[e.type].name}</span>`).join('')}</div>`:''}</button>`;
}
function selectedCard(){return game.s?.players[me()].hand.find(c=>c.id===selected);}
function needsTarget(card){return !!(CARDS[card.type].target||game.bangType(me(),card));}
function statusText(){const s=game.s,q=s.pending;if(tutorial)return `따라 배우기 · ${CHAPTERS[tutorial.lesson.chapter]}`;if(s.winner)return '마지막 총성이 울렸습니다';if(!game.p(me()).alive)return `${game.label(q?.player??s.current)} · 관전 중`;if(q?.player===me())return q.kind==='dying'?'마지막 생명을 지키세요':q.kind==='defend'||q.kind==='duel'?'공격에 대응하세요':'카드를 선택하세요';if(q)return `${game.label(q.player)}의 대응을 기다립니다`;if(s.current!==me())return `${game.label(s.current)}의 턴`;if(s.phase==='discard')return `손패 ${game.p(me()).hand.length-game.p(me()).hp}장을 버리세요`;return targeting?'대상 플레이어를 선택하세요':'당신의 턴입니다';}
function controls(){
 const s=game.s,p=game.p(me()),c=selectedCard();let title='카드를 선택하세요',desc='카드를 고르고 아래 「사용하기」를 누르세요.',buttons='',cue='';
 if(s.winner){title='게임 종료';desc=`${ROLES[s.winner].name}${s.winner==='sheriff'?'과 부관':''}의 승리`;buttons='<button class="primary" data-action="result">결과 보기</button><button class="secondary" data-action="new">다시 플레이</button>';}
 else if(!p.alive){title='관전 중입니다';desc='남은 플레이어들의 결말을 지켜보세요.';buttons='<button class="secondary" data-action="new">새 게임</button>';}
 else if(s.phase==='discard'&&s.current===me()&&!s.pending){title=c?`${CARDS[c.type].name} · 버릴 카드`:`카드 ${p.hand.length-p.hp}장을 버려주세요`;desc=c?CARDS[c.type].desc:`손패는 생명 ${p.hp}개만큼 남길 수 있어요.`;if(c){cue='아래 「버리기」를 누르세요.';buttons='<button class="primary card-use-button" data-action="discard">버리기</button><button class="secondary" data-action="zoom">카드 안내</button>';}}
 else{
  if(c){title=CARDS[c.type].name;desc=CARDS[c.type].desc;const reason=game.canPlay(me(),c);cue=reason||(targeting?'「선택하기」가 표시된 상대를 누르세요.':needsTarget(c)?'사용하기 → 상대 선택':'아래 「사용하기」를 누르세요.');buttons=targeting?'<button class="secondary" data-action="cancelTarget">선택 취소</button>':`<button class="primary card-use-button" data-action="use" aria-label="${esc(CARDS[c.type].name)} 사용하기" ${reason?'disabled':''}>사용하기</button>`;buttons+='<button class="secondary" data-action="zoom">카드 안내</button>';}
  if(s.current===me()&&s.phase==='play'&&!s.pending)buttons+='<button class="secondary" data-action="end">턴 종료 →</button>';
  if(s.current!==me()||s.pending){if(!c){title='상대의 움직임을 살펴보세요';desc='내 손패는 언제든 눌러 확인할 수 있어요.';}}
 }
 if(tutorial&&practicePreview){title=CARDS[practicePreview.type].name;desc=CARDS[practicePreview.type].desc;cue='';buttons='<button class="secondary" data-action="zoom">카드 안내</button><button class="secondary" data-action="previewClose">선택 해제</button>';}
 const showHint=currentHint&&(!c||c.id===currentHint.cardId);
 if(showHint){title=esc(currentHint.title);desc=esc(currentHint.reason);}
 return `<div class="controls ${c||tutorial&&practicePreview?'has-card':''} ${showHint?'has-hint':''} ${targeting?'target-mode':''}" ${showHint?'role="status"':''}><div class="selection-info"><strong>${title}</strong><p>${desc}</p>${cue?`<small class="selection-step">${cue}</small>`:''}</div><div class="action-buttons">${buttons}</div></div>`;
}
function renderGame(){
 const s=game.s,p=game.p(me()),c=game.char(me()),role=ROLES[p.role],others=s.players.slice(me()+1).concat(s.players.slice(0,me())),top=s.discard.at(-1);
 return `${header()}<main class="game-layout"><section class="table-area" aria-label="게임 테이블"><div class="game-status"><div class="status-left"><span class="live-dot"></span><strong>${statusText()}</strong></div><span class="turn-badge">TURN ${String(s.turn).padStart(2,'0')} · ${game.alive().length}/${s.players.length} ALIVE</span></div><div class="table players-${s.players.length}">${others.map((p,i)=>seat(p,i,others.length)).join('')}<div class="table-center"><p class="table-wordmark">SALOON</p><div class="piles"><div class="pile card-back" aria-label="뽑기 더미 ${s.deck.length}장"><span>BANG!</span><small class="pile-count">뽑기 ${s.deck.length}</small></div><button class="pile ${top?'':'empty-pile'}" style="padding:0;border:${top?'0':'1px dashed #beaf7c66'};background:${top?'none':'#152c1c44'}" data-action="discardTop" aria-label="버린 카드 더미 확인">${top?face(top):'버린 카드'}<small class="pile-count">버린 카드 ${s.discard.length}</small></button></div><div class="table-instruction">${tutorial?'연습용 공개 역할 · 천천히 따라 하세요':targeting?'빛나는 상대를 눌러 선택하세요':'가까운 상대일수록 위험합니다.'}</div></div></div><section class="player-strip" aria-label="나의 캐릭터"><button class="own-char" data-action="ownCharacter" data-value="${me()}" aria-label="내 캐릭터 자세히 보기"><img src="${art(c.image)}" alt="${c.name}"></button><div class="my-info"><p class="my-name">${c.name}<span>${role.name} · 나</span></p><div class="my-ability">${c.ability}</div>${p.equipment.length?`<div class="my-equip">${p.equipment.map(e=>`<button data-action="equipmentInfo" data-value="${e.id}">${CARDS[e.type].name}${CARDS[e.type].range?' · '+CARDS[e.type].range:''}</button>`).join('')}</div>`:''}${p.char==='sid'&&p.alive&&p.hp<p.maxHp&&p.hand.length>=2&&!s.winner?'<button class="mini-button" data-action="sid">능력 사용 · 2장 버려 회복</button>':''}</div><div class="my-health">${hearts(p)}<small>사정거리 ${game.range(me())} · ${game.weapon(me())?CARDS[game.weapon(me()).type].name:'콜트 .45'}</small></div></section><div class="hand-header"><strong>내 손패 <span>${p.hand.length}장</span></strong><span class="hand-tools"><span>${s.current===me()?'● 사용 가능한 카드':'카드를 눌러 살펴보세요'}</span>${hintToggle()}<button class="hand-log-button" data-action="logs">기록</button></span></div><div class="hand" aria-label="내 손패">${p.hand.length?p.hand.map(card=>cardButton(card)).join(''):'<div class="empty-hand">지금은 손에 카드가 없습니다.</div>'}</div>${controls()}<button class="mobile-log" data-action="logs" style="width:100%;text-align:left">${s.logs.at(-1)?.text||''} <span style="float:right">기록 ›</span></button></section><aside class="log-panel"><section class="mission-card"><div class="eyebrow">YOUR SECRET MISSION</div><div class="mission-body"><img src="${art(role.image)}" alt="${role.name} 역할 카드"><div><h3>${role.name}</h3><p>${role.goal}</p></div></div></section><div class="log-title">살롱의 기록 <span>LIVE</span></div><div class="log-list" aria-label="게임 기록">${logsHTML()}</div><div class="tips">뱅!은 턴마다 한 번. 무기를 바꾸면 더 멀리 공격할 수 있어요.<br><div class="guide-links"><button class="mini-button" data-action="catalog">카드 안내</button><button class="mini-button" data-action="characterCatalog">캐릭터 안내</button></div></div></aside></main>${credits()}`;
}
function logsHTML(){return [...game.s.logs].reverse().map(l=>`<div class="log-item ${l.kind}">${esc(l.text)}</div>`).join('');}
function wrap(content,{close=true,cls=''}={}){return `<section class="modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${close?'<button class="modal-close" data-action="close" aria-label="닫기">×</button>':''}${content}</section>`;}
function rules(){return wrap(`<div class="eyebrow">HOW TO PLAY</div><h2 id="dialog-title">한 판을 시작하는 방법</h2><p>내 역할의 목적을 달성하면 승리합니다.<br>보안관을 제외한 상대의 정체는 탈락할 때 드러나요.</p><div class="rule-steps"><span><b>01</b> 카드 2장 받기</span><span>→</span><span><b>02</b> 카드 사용하기</span><span>→</span><span><b>03</b> 남는 카드 버리기</span></div><div class="rules-grid">${Object.values(ROLES).map(r=>`<div class="rule-box"><h3>${r.name}</h3><p>${r.goal}</p></div>`).join('')}<div class="rule-box"><h3>거리와 총</h3><p>옆 사람은 거리 1. 원을 따라 가까운 쪽으로 셉니다. 총의 사정거리 안에서만 뱅!을 쓸 수 있어요.</p></div><div class="rule-box"><h3>무늬와 A는 무슨 뜻?</h3><p>♣·♥·♠·♦는 카드의 무늬, A는 에이스예요. 특수 효과를 판정할 때 더미에서 공개한 카드의 무늬와 숫자를 봅니다. 술통·감옥은 하트면 성공, 다이너마이트는 스페이드 2~9면 폭발해요. 판정은 자동이에요.</p></div><div class="rule-box"><h3>내 턴과 대응</h3><p>카드를 고르면 짧은 설명이 나와요. 아래 「사용하기」를 누르세요. 상대가 필요한 카드는 이어서 「선택하기」가 표시된 상대를 누르면 돼요. 공격받으면 쓸 수 있는 방어 카드가 크게 보여요. 턴 종료 후 생명 수보다 많은 손패는 골라 버립니다.</p></div></div><p class="helper">판정과 캐릭터의 자동 능력은 게임이 처리합니다. 선택이 필요한 능력은 직접 고를 수 있어요. 추천은 1회에 1쭈이며 로그인한 대전에서 사용할 수 있어요. 누른 시점의 내 패와 공개 정보로 한 번만 안내하고 다음 상황에는 자동으로 추천하지 않아요. 연습의 카드별 설명은 무료예요. 숨겨진 정체는 추측이며 승리를 보장하지 않아요. 로그인한 컴퓨터 대전과 회원 대전 모두 이번 달 연승 순위에 반영돼요. 패배·기권 시 0연승이에요. 회원 대전은 4~7명이 함께하며, 45초 동안 응답이 없으면 자동 진행합니다. 컴퓨터 대전은 내 선택을 기다려요. 24시간 동안 진행하지 않은 컴퓨터 대전은 기권으로 처리돼요. 튜토리얼과 로그인 전 연습은 순위에서 제외돼요.</p><div class="help-tabs"><button class="primary" data-action="tutorial-start">직접 눌러 배우기 · 튜토리얼</button><button class="secondary" data-action="catalog">카드 안내</button><button class="secondary" data-action="characterCatalog">캐릭터 안내</button><a class="secondary" href="https://bang.dvgiochi.com/content/1/docs/01_bang_rules_EN.pdf" target="_blank" rel="noopener" style="font-size:12px;text-decoration:none">공식 규칙서 ↗</a></div><p class="source-note">BANG! 비공식 팬 구현입니다. 원작 기본판 규칙을 바탕으로 하며, AI는 자신의 역할과 공개된 행동을 바탕으로 판단합니다. 원작 이미지의 글자는 그대로 두고 한국어 설명을 덧붙였습니다.</p>`);}
function catalog(){return wrap(`<div class="eyebrow">THE ORIGINAL DECK</div><h2 id="dialog-title">카드 안내</h2><p>카드를 누르면 효과 · 사용 방법 · 활용 팁을 무료로 볼 수 있어요.</p><div class="catalog">${Object.entries(CARDS).map(([key,c])=>`<button data-action="catalogCard" data-value="${key}"><img src="${art(c.image)}" alt="${c.name}" loading="lazy"><span>${c.name}</span></button>`).join('')}</div>`);}
function guideOpen(){return ['card','catalog','characters','character'].includes(modal?.type);}
function guideKeys(){return modal?.type==='card'?Object.keys(CARDS):modal?.type==='character'?CHARACTERS.map(c=>c.id):[];}
function guideNavigation(kind,key){
 const keys=kind==='card'?Object.keys(CARDS):CHARACTERS.map(c=>c.id),label=kind==='card'?'카드':'캐릭터';
 return `<nav class="guide-navigation" aria-label="${label} 안내 넘기기"><button class="secondary" data-action="guidePrevious" aria-label="이전 ${label} 안내">← 이전</button><span class="guide-position" aria-live="polite"><b>${keys.indexOf(key)+1} / ${keys.length}</b><small>좌우로 밀어 넘기기</small></span><button class="secondary" data-action="guideNext" aria-label="다음 ${label} 안내">다음 →</button></nav>`;
}
function moveGuide(delta){
 const keys=guideKeys();if(!keys.length)return;
 const key=modal.type==='card'?modal.card.type:modal.id,next=keys[(keys.indexOf(key)+delta+keys.length)%keys.length];
 if(modal.type==='card')modal={...modal,card:{type:next}};else modal={...modal,id:next};
 render();
}
function inspectCard(card,back=null){const c=CARDS[card.type];return wrap(`<div class="inspect guide-content"><div class="inspector-face">${card.id?face(card):`<img src="${art(c.image)}" alt="${c.name}" draggable="false" style="width:100%;border-radius:8px">`}</div><div><div class="eyebrow">${c.en}</div><h2 id="dialog-title">${c.name}</h2><p class="guide-free">카드 안내 · 무료</p><dl class="card-guide"><dt>효과</dt><dd>${c.desc}</dd><dt>사용 방법</dt><dd>${CARD_GUIDES[card.type].use}</dd><dt>활용 팁</dt><dd>${CARD_GUIDES[card.type].tip}</dd></dl><p class="source-note">${c.kind==='weapon'?'무기 카드':c.kind==='equipment'?'장착 카드':c.kind==='response'?'방어 카드':'즉시 사용 카드'}${card.rank?' · '+rankName(card.rank)+suitSymbol[card.suit]:''}</p></div></div>${guideNavigation('card',card.type)}${back?'<button class="guide-back" data-action="catalog">카드 목록으로</button>':''}`,{cls:'guide-modal'});}
function inspectCardBrief(card){const c=CARDS[card.type];return wrap(`<h2 id="dialog-title">${c.name}</h2><p>${c.desc}</p><button class="secondary" data-action="catalogCard" data-value="${card.type}">카드 안내</button>`,{cls:'brief-card-modal'});}
function characterCatalog(){return wrap(`<div class="eyebrow">MEET THE CHARACTERS</div><h2 id="dialog-title">캐릭터 안내</h2><p class="guide-intro">역할은 승리 조건, 캐릭터는 특수 능력을 정해요.<br>16명의 능력·발동 조건·사용 방법을 무료로 살펴보세요.</p><div class="character-catalog">${CHARACTERS.map(c=>`<button data-action="characterGuide" data-value="${c.id}"><img src="${art(c.image)}" alt="" loading="lazy" draggable="false"><span><strong>${c.name}</strong><small>${CHARACTER_GUIDES[c.id].mode} · 기본 생명 ${c.hp}</small></span></button>`).join('')}</div>`,{cls:'character-catalog-modal'});}
function inspectCharacter(id){
 const c=CHARACTERS.find(c=>c.id===id),g=CHARACTER_GUIDES[id];
 return wrap(`<div class="inspect guide-content"><div class="inspector-face"><img src="${art(c.image)}" alt="${c.name} 캐릭터 카드" draggable="false" style="width:100%;border-radius:8px"><span class="guide-health">기본 생명 ${c.hp} · 보안관이면 +1</span></div><div><div class="eyebrow">${c.en}</div><h2 id="dialog-title">${c.name}</h2><p class="guide-free">캐릭터 안내 · 무료 <span class="ability-mode">${g.mode}</span></p><dl class="card-guide character-guide"><dt>능력</dt><dd>${c.ability}</dd><dt>발동 조건</dt><dd>${g.when}</dd><dt>사용 방법</dt><dd>${g.use}</dd><dt>예시</dt><dd>${g.example}</dd></dl></div></div>${guideNavigation('character',id)}<button class="guide-back" data-action="characterCatalog">캐릭터 목록으로</button>`,{cls:'guide-modal character-guide-modal'});
}
function inspectPlayer(id){const p=game.p(id),c=game.char(id),known=id===me()||p.role==='sheriff'||!p.alive||game.s.winner;return wrap(`<div class="inspect"><img src="${art(c.image)}" alt="${c.name}"><div><div class="eyebrow">${c.en}</div><h2 id="dialog-title">${c.name}</h2><p>${c.ability}</p>${hearts(p)}<p>${known?ROLES[p.role].name:'정체 미공개'} · 손패 ${p.hand.length}장<br>사정거리 ${game.range(id)}</p>${known?`<p class="source-note">${ROLES[p.role].goal}</p>`:''}${p.equipment.length?`<div class="my-equip">${p.equipment.map(e=>`<button data-action="equipmentInfo" data-value="${e.id}">${CARDS[e.type].name}</button>`).join('')}</div>`:''}</div></div>`);}
function response(q){
 const p=game.p(me());let content='';
 if(q.kind==='defend'||q.kind==='duel'){
  const cards=game.defenseCards(me(),q.required),name=q.required==='bang'?'뱅!':'빗나감!';
  content=`<div class="danger-icon">${q.kind==='duel'?'⚔':'!'}</div><div class="eyebrow">${q.kind==='duel'?'DUEL':'UNDER ATTACK'}</div><h2 id="dialog-title">${cards.length?'카드를 눌러 방어하세요':'방어 카드가 없어요'}</h2><p>${game.label(q.source)}의 ${q.cause} 공격 · <b>${name} ${q.need}장 필요</b></p><div class="modal-cards defense-cards" aria-label="지금 사용할 수 있는 방어 카드">${cards.map(c=>cardButton(c,'respond')).join('')}</div>${cards.length?'<p class="helper">쓸 수 있는 카드만 보여요. 한 장씩 누르세요.</p>':'<p class="helper">확인하면 생명 1을 잃어요.</p>'}<div class="modal-actions"><button class="secondary" data-action="take">${cards.length?'방어하지 않고':'확인하고'} 생명 1 잃기</button></div>`;
 }else if(q.kind==='dying'){
  const beer=p.hand.filter(c=>c.type==='beer').length;
  content=`<div class="danger-icon">!</div><div class="eyebrow">LAST CHANCE</div><h2 id="dialog-title">마지막 생명을 지키세요</h2><p>생명을 ${1-p.hp} 회복해야 살아남을 수 있어요.</p><div class="modal-actions">${beer&&game.alive().length>2?`<button class="primary" data-action="saveBeer">맥주 마시기 · ${beer}장 보유</button>`:''}${p.char==='sid'&&p.hand.length>=2?'<button class="primary" data-action="sid">시드 능력 사용</button>':''}<button class="secondary" data-action="giveup">탈락 인정</button></div>${game.alive().length<=2?'<p class="helper">둘만 남은 결투에서는 맥주를 쓸 수 없습니다.</p>':''}`;
 }else if(q.kind==='kit'){
  content=`<div class="eyebrow">KIT CARLSON</div><h2 id="dialog-title">돌려놓을 1장을 고르세요</h2><p>나머지 2장은 내 손패로 가져옵니다.</p><div class="modal-cards">${q.cards.map(c=>cardButton(c,'choose')).join('')}</div>`;
 }else if(q.kind==='store'){
  content=`<div class="eyebrow">GENERAL STORE</div><h2 id="dialog-title">잡화점에 오신 걸 환영합니다</h2><p>가져갈 카드 1장을 고르세요.</p><div class="modal-cards">${q.cards.map(c=>cardButton(c,'choose')).join('')}</div>`;
 }else if(q.kind==='drawChoice'){
  content=`<div class="eyebrow">${q.ability==='jesse'?'JESSE JONES':'PEDRO RAMIREZ'}</div><h2 id="dialog-title">첫 카드를 어디서 가져올까요?</h2><p>두 번째 카드는 뽑기 더미에서 가져옵니다.</p><div class="choose-list"><button data-action="drawDeck">뽑기 더미</button>${q.ability==='pedro'?`<button data-action="drawDiscard">버린 카드 · ${CARDS[game.s.discard.at(-1).type].name}</button>`:game.alive().filter(p=>p.id!==me()&&p.hand.length).map(p=>`<button data-action="drawSteal" data-value="${p.id}">${game.label(p.id)} · 손패 ${p.hand.length}장</button>`).join('')}</div>`;
 }else if(q.kind==='steal'){
  const t=game.p(q.target);
  content=`<div class="eyebrow">${q.steal?'PANIC!':'CAT BALOU'}</div><h2 id="dialog-title">${q.steal?'가져올':'버릴'} 카드를 고르세요</h2><p>${game.label(t.id)}의 손패는 무작위로, 장비는 직접 고를 수 있어요.</p>${t.hand.length?`<div class="modal-actions"><button class="primary" data-action="stealHand">무작위 손패 1장 · ${t.hand.length}장 보유</button></div>`:''}<div class="modal-cards">${t.equipment.map(c=>cardButton(c,'stealEquip')).join('')}</div>`;
 }
 return wrap(content+hintResponse(),{close:false,cls:`response-modal ${['defend','duel'].includes(q.kind)?'defense-modal':''}`});
}
function sidModal(){return wrap(`<div class="eyebrow">SID KETCHUM</div><h2 id="dialog-title">생명 1을 회복합니다</h2><p>버릴 카드 2장을 고르세요. ${sidSelected.length}/2 선택</p><div class="modal-cards">${game.p(me()).hand.map(c=>cardButton(c,'sidCard')).join('')}</div><div class="modal-actions"><button class="primary" data-action="sidConfirm" ${sidSelected.length===2?'':'disabled'}>2장 버리고 회복</button></div>${currentHint?.action==='sid'?hintResponse():''}`);}
function result(){const s=game.s,p=game.p(me()),won=!(s.forfeited||[]).includes(me())&&(s.winner===p.role||(s.winner==='sheriff'&&p.role==='deputy'));return wrap(`<div class="result-star">${won?'★':'♠'}</div><div class="eyebrow">THE LAST SHOT</div><h2 id="dialog-title">${won?'당신의 승리입니다!':'다음 총성을 기다리며.'}</h2><p>${ROLES[s.winner].name}${s.winner==='sheriff'?'과 부관':''}의 승리 · ${s.turn}턴<br>${won?'당신의 임무를 완수했습니다.':'이번 살롱의 승자는 다른 편이었습니다.'}${online.playing?online.room.rankExcluded?.includes(me())?'<br><strong>컴퓨터가 대신 진행한 이번 판은 순위·연승에서 제외돼요.</strong>':online.room.record?.saved?`<br><strong>현재 ${online.room.record.streak}연승 · 순위 저장 완료</strong>`:'<br>순위 저장을 확인하고 있어요.':`<br><strong>연습 결과 · 순위에는 반영되지 않아요.</strong><br>${online.available?'새 컴퓨터 대전을 시작하면 순위에 반영돼요.':'로그인한 뒤 새 대전을 시작하면 순위에 반영돼요.'}`}</p><div class="result-roles">${s.players.map(p=>`<div class="result-person"><img src="${art(ROLES[p.role].image)}" alt="${ROLES[p.role].name}"><strong>${p.id===me()?'나':online.playing?esc(p.name):game.char(p.id).name}</strong><span>${ROLES[p.role].name}${p.alive?' · 생존':''}</span></div>`).join('')}</div><div class="modal-actions"><button class="primary" data-action="${online.playing?'online-leave':'start'}">${online.playing?'대기 화면으로':'한 판 더'}</button><button class="secondary" data-action="close">테이블 살펴보기</button></div>`,{cls:'response-modal result-modal'});}
function tutorialComplete(){return wrap(`<div class="result-star">★</div><div class="eyebrow">PRACTICE COMPLETE</div><h2 id="dialog-title">첫 총격전 연습, 완료!</h2><p>이제 한 판을 시작할 준비가 됐어요.</p><div class="lesson-recap"><div><img src="${art('bang')}" alt="뱅!"><strong>공격</strong><span>카드 선택 → 사용하기 → 상대</span></div><div><img src="${art('mancato')}" alt="빗나감!"><strong>방어</strong><span>공격받으면 빗나감!</span></div><div><img src="${art('birra')}" alt="맥주"><strong>회복</strong><span>맥주 선택 → 사용하기</span></div></div><p class="recap-turn"><b>내 턴 순서</b><br>2장 자동 받기 → 카드 사용 → 턴 종료<br><small>남은 손패는 현재 체력 수까지만 보유해요.</small></p><div class="modal-actions"><button class="primary" data-action="tutorial-play">새 실전 시작</button><button class="secondary" data-action="catalog">카드 안내</button><button class="secondary" data-action="characterCatalog">캐릭터 안내</button>${saved&&!saved.winner?'<button class="secondary" data-action="tutorial-resume">저장된 게임 이어하기</button>':'<button class="secondary" data-action="tutorial-exit">처음 화면으로</button>'}<button class="secondary" data-action="tutorial-restart">한 번 더 연습</button></div><p class="source-note">연습은 여기서 끝나요. 실전은 새로운 카드로 시작합니다.</p>`,{close:false,cls:'response-modal tutorial-complete'});}

function beginTutorial(){
 if(online.playing){toast('대전을 마친 뒤 연습할 수 있어요.');return;}
 clearTimeout(botTimer);
 if(!tutorial){if(page==='game')save();tutorialOrigin={game,page,selected,targeting,eliminationSeen,resultSeen};}
 practicePreview=null;tutorial=new Tutorial();game=tutorial.game;page='game';selected=null;targeting=false;modal=null;sidSelected=[];eliminationSeen=false;resultSeen=false;tutorialFocusStep=-1;render();
}
function leaveTutorial(){
 const origin=tutorialOrigin;practicePreview=null;tutorial=null;tutorialOrigin=null;modal=null;
 if(origin){game=origin.game;page=origin.page;selected=origin.selected;targeting=origin.targeting;eliminationSeen=origin.eliminationSeen;resultSeen=origin.resultSeen;}else page='lobby';
 tutorialFocusStep=-1;render();
}
function tutorialAction(action,value){
 if(action==='tutorial-exit'){leaveTutorial();return;}
 if(action==='tutorial-restart'){beginTutorial();return;}
 if(action==='tutorial-play'){tutorial=null;tutorialOrigin=null;start();return;}
 if(action==='tutorial-resume'&&saved){tutorial=null;tutorialOrigin=null;game=new Game(JSON.parse(JSON.stringify(saved)));settings={...game.s.options,role:'random'};page='game';selected=null;targeting=false;modal=null;eliminationSeen=false;resultSeen=false;render();return;}
 if(!tutorial.act(action,value)){toast(tutorial.lesson.tip);return;}
 practicePreview=null;selected=tutorial.selected;targeting=tutorial.targeting;
 if(tutorial.done){tutorialDone=true;try{localStorage.setItem('bang-tutorial-complete','1');}catch{}}
 sfx(['player','take'].includes(action)?'shot':'tap');render();
}
function paintTutorial(){
 const coach=$('#tutorial-coach');document.body.classList.toggle('training',!!tutorial&&!tutorial.done);
 if(!tutorial||tutorial.done){coach.hidden=true;coach.innerHTML='';document.documentElement.style.setProperty('--coach-space','0px');return;}
 if(guideOpen()){coach.hidden=true;document.documentElement.style.setProperty('--coach-space','0px');return;}
 const l=tutorial.lesson,expected=tutorial.expected();
 coach.hidden=false;coach.innerHTML=`<div class="coach-top"><span>직접 따라 배우기 <b>${l.chapter+1} / 6</b></span><button data-action="tutorial-exit">나중에 하기 ×</button></div><div class="coach-progress" aria-label="${CHAPTERS[l.chapter]} 단계">${CHAPTERS.map((name,i)=>`<span class="${i<l.chapter?'complete':i===l.chapter?'current':''}" title="${name}"></span>`).join('')}</div><div class="coach-copy" aria-live="polite"><h2>${l.title}</h2><p>${l.body}</p></div><div class="coach-bottom"><span>${l.tip}</span>${expected.action==='tutorial-next'?`<button class="primary" data-action="tutorial-next">${l.button||'다음'} →</button>`:'<b class="coach-tap">빛나는 곳을 눌러보세요</b>'}</div>`;
 // Only the current exercise action is enabled. Exit and restart remain available.
 document.querySelectorAll('#app button, #overlay button').forEach(button=>{
  const action=button.dataset.action;
  if(!['sound','tutorial-exit','tutorial-restart','card','catalog','catalogCard','characterCatalog','characterGuide','ownCharacter','guidePrevious','guideNext','previewClose','zoom','close','equipmentInfo','discardTop'].includes(action)&&!tutorial.accepts(action,button.dataset.value)){button.disabled=true;button.classList.add('training-muted');}
 });
 const target=tutorial.focus()?document.querySelector(tutorial.focus()):null;
 if(target)target.classList.add('tutorial-focus');
 const controls=$('.controls');if(controls)controls.classList.toggle('training-action',!!controls.querySelector('.action-buttons button:not(:disabled)'));
 const height=coach.getBoundingClientRect().height;
 document.documentElement.style.setProperty('--coach-space',`${Math.ceil(height+parseFloat(getComputedStyle(coach).bottom)+8)}px`);
 if(tutorialFocusStep!==tutorial.step){
  tutorialFocusStep=tutorial.step;
  requestAnimationFrame(()=>{
   if(!tutorial)return;
   // Keep the board stationary; only reveal a practice card within its hand row.
   if(target?.closest('.hand')){
    const hand=target.closest('.hand');
    hand.scrollLeft=Math.max(0,target.offsetLeft-(hand.clientWidth-target.clientWidth)/2);
   }
   const focus=expected.action==='tutorial-next'?coach.querySelector('[data-action="tutorial-next"]'):target;
   if(focus?.matches('button:not(:disabled)'))focus.focus({preventScroll:true});
  });
 }
}
function renderOverlay(){
 let html='';
 if(tutorial?.done&&!guideOpen())html=tutorialComplete();
 else if(modal?.type==='rules')html=rules();
 else if(modal?.type==='catalog')html=catalog();
 else if(modal?.type==='characters')html=characterCatalog();
 else if(modal?.type==='character')html=inspectCharacter(modal.id);
 else if(modal?.type==='card')html=inspectCard(modal.card,modal.back);
 else if(modal?.type==='briefCard')html=inspectCardBrief(modal.card);
 else if(modal?.type==='player')html=inspectPlayer(modal.id);
 else if(modal?.type==='sid')html=sidModal();
 else if(modal?.type==='logs')html=wrap(`<div class="eyebrow">SALOON LOG</div><h2 id="dialog-title">살롱의 기록</h2><div>${logsHTML()}</div>`);
 else if(modal?.type==='online-exit')html=wrap(online.room?.mode==='solo'?'<h2 id="dialog-title">컴퓨터 대전을 끝낼까요?</h2><p>진행 중인 컴퓨터 대전을 끝내면 기권 패배로 기록돼요.</p><div class="modal-actions"><button class="secondary" data-action="close">계속 플레이</button><button class="primary" data-action="online-surrender">기권하고 끝내기</button></div>':'<h2 id="dialog-title">대전에서 나갈까요?</h2><p>컴퓨터가 내 패와 체력을 그대로 이어받아요.<br>나는 다음에 새 게임을 시작하며, 이 판은 내 순위와 연승에 반영되지 않아요.</p><div class="modal-actions"><button class="secondary" data-action="close">계속 플레이</button><button class="primary" data-action="online-leave">컴퓨터에게 맡기고 나가기</button><button class="secondary" data-action="online-surrender">기권하기 · 패배 기록</button></div>');
 else if(modal?.type==='new')html=wrap('<div class="eyebrow">A NEW TABLE</div><h2 id="dialog-title">새 테이블을 준비할까요?</h2><p>현재 진행 중인 게임 대신 새 게임을 시작합니다.</p><div class="modal-actions"><button class="primary" data-action="goLobby">새 게임 준비</button><button class="secondary" data-action="close">계속 플레이</button></div>');
 else if(modal?.type==='result')html=result();
 else if(modal?.type==='eliminated')html=wrap(`<div class="eyebrow">GUN DOWN</div><h2 id="dialog-title">이번 총격전에서 탈락했어요</h2><p>아직 같은 편이 승리할 수 있습니다.<br>${online.playing?'결과가 나올 때까지 기다리면 팀 승리도 기록돼요.':'남은 대결을 지켜보거나 새로 시작하세요.'}</p><div class="modal-actions"><button class="primary" data-action="close">관전 계속</button>${online.playing?'':'<button class="secondary" data-action="goLobby">새 게임 준비</button>'}</div>`,{cls:'response-modal'});
 else if(page==='game'&&game.s.pending?.player===me())html=response(game.s.pending);
 const overlay=$('#overlay');overlay.innerHTML=html;overlay.hidden=!html;document.body.style.overflow=html?'hidden':'';
 if(html){$('#app').inert=true;requestAnimationFrame(()=>overlay.querySelector('button:not(:disabled)')?.focus({preventScroll:true}));}else $('#app').inert=false;
}
function render(){
 clearTimeout(botTimer);
 if(tutorial||page!=='game'||currentHintContext!==hintContext()){currentHint=null;currentHintContext=null;}
 document.body.classList.toggle('game-screen',page==='game');
 document.body.classList.toggle('lobby-screen',page==='lobby');
 const handScroll=$('.hand')?.scrollLeft||0;
 if(page==='game'){
  if(selected&&!selectedCard()){selected=null;targeting=false;}
  if(targeting&&selectedCard()&&game.canPlay(me(),selectedCard()))targeting=false;
  if(game.s.winner&&!resultSeen){modal={type:'result'};resultSeen=true;}
  else if(!game.p(me()).alive&&!eliminationSeen&&!game.s.winner){modal={type:'eliminated'};eliminationSeen=true;}
 }
 $('#app').innerHTML=page==='lobby'?lobby():renderGame();
 if($('.hand'))$('.hand').scrollLeft=handScroll;
 renderOverlay();paintTutorial();paintHint();schedule();if(online.busy||hintBusy)document.querySelectorAll('[data-action]').forEach(b=>{if(['card','use','player','end','discard','respond','take','choose','saveBeer','giveup','drawDeck','drawDiscard','drawSteal','stealHand','stealEquip','sidConfirm','online-start','online-create','online-join','start','online-surrender'].includes(b.dataset.action))b.disabled=true;});
}
function paintHint(){
 if(!currentHint)return;
 const action=currentHint.action==='play'?(targeting?'player':'use'):currentHint.action;
 document.querySelectorAll('[data-action]').forEach(b=>{
  if(b.dataset.action!==action||b.disabled)return;
  const value=['drawSteal','player'].includes(action)?currentHint.targetId:currentHint.cardId;
  if(b.dataset.value!==undefined&&Number(b.dataset.value)!==value)return;
  if(['play','discard'].includes(currentHint.action)&&selected!==currentHint.cardId)return;
  b.classList.add('hint-action');
 });
}
function schedule(){
 if(page!=='game'||modal||tutorial||online.playing||game.s.winner)return;
 const s=game.s,actor=s.pending?.player??s.current;
 if(actor===0)return;
 botTimer=setTimeout(()=>{if(modal||page!=='game')return;mutate(()=>game.aiAction());},fast?190:800);
}
function start(){settings.role='random';if(online.available){modal=null;void online.run('solo',{options:{...settings}});return;}clearTimeout(botTimer);game=new Game();game.create(settings);page='game';selected=null;targeting=false;modal=null;eliminationSeen=false;resultSeen=false;save();sfx();render();window.scrollTo(0,0);}

async function buyHint(){
 if(hintBusy||currentHint||online.busy||!online.playing||!online.owner||tutorial)return;
 const owner=online.owner,context=hintContext(),hint=recommend(game.s,me()),pending=hintPurchase.read(owner);
 if((!hint||hint.action==='wait')&&pending?.status!=='pending'){toast('직접 선택할 차례에 추천을 볼 수 있어요.');return;}
 hintBusy=true;render();
 const result=await hintPurchase.buy(owner,online.room);hintBusy=false;
 if(owner!==online.owner){render();return;}
 if(!result.ok){
  const notices={coins:'추천에는 1쭈가 필요해요.',pending:'결제 확인이 지연돼요. 구매 확인을 누르면 중복 차감 없이 확인해요.',storage:'구매 기록을 저장할 수 없어 차감하지 않았어요.',state_conflict:'상황이 바뀌어 차감하지 않았어요. 다시 눌러 주세요.',not_your_turn:'직접 선택할 차례에 추천을 볼 수 있어요.'};
  render();toast(notices[result.reason]||'추천을 구매할 수 없어요. 잠시 후 다시 시도해 주세요.');return;
 }
 if(page==='game'&&!tutorial&&context===hintContext()&&hint&&hint.action!=='wait'&&hintPurchase.consume(owner,result.record.id)){
  currentHint=hint;currentHintContext=context;
  if(!game.s.pending){selected=['play','discard'].includes(hint.action)?hint.cardId:null;targeting=false;}
  render();
  const card=$('.hand .hint-card'),hand=$('.hand');if(card&&hand)hand.scrollLeft=Math.max(0,card.offsetLeft-(hand.clientWidth-card.clientWidth)/2);
  toast('추천 1회 · 1쭈 사용');
 }else{render();toast('구매한 추천이 남아 있어요. 선택할 차례에 추천 보기를 눌러 주세요.');}
}

document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
 let action=b.dataset.action;const value=b.dataset.value,n=Number(value);
 if(action==='hint'&&!tutorial){
  void buyHint();
  return;
 }
 if(action==='online-create'){const title=$('#online-title')?.value.trim(),capacity=Number($('#online-capacity')?.value);void online.run('create',{options:{title,capacity}});return;}
 if(action==='online-join'){const code=$('#online-code')?.value.trim().toUpperCase();void online.run('join',{code});return;}
 if(action==='online-mine'){void online.run('mine');return;}
 if(action==='online-resume'){void online.resume();return;}
 if(action==='online-start'){void online.run('start');return;}
 if(action==='online-leave'){modal=null;void online.run('leave');return;}
 if(action==='online-copy'){navigator.clipboard?.writeText(online.room.code).then(()=>toast('방 코드를 복사했어요.')).catch(()=>toast('방 코드를 직접 복사해 주세요.'));return;}
 if(action==='online-surrender'){modal=null;void online.run('surrender').then(r=>{if(r?.ok){online.accept(null);page='lobby';soloLobby=false;render();}});return;}
 if(action==='solo-lobby'){soloLobby=true;render();return;}
 if(action==='card'&&!tutorial){
  if(page!=='game'||online.busy||hintBusy)return;
  const card=game.p(me()).hand.find(c=>c.id===n);if(!card)return;
  selected=selected===n?null:n;targeting=false;sfx();render();return;
 }
 if(online.playing&&!tutorial){
  if(['new','home','goLobby','start'].includes(action)){
   if(online.room.status==='finished'){modal=null;void online.run('leave');}else{modal={type:'online-exit'};render();}return;
  }
  let move=null;
  if(action==='use'){const card=selectedCard();if(card&&!game.canPlay(me(),card)&&!CARDS[card.type].target&&!game.bangType(me(),card))move={type:'play',card:card.id};}
  if(action==='player'&&targeting){const card=selectedCard();if(card&&!game.canPlay(me(),card)&&game.targets(me(),card).includes(n))move={type:'play',card:card.id,target:n};}
  if(action==='end')move={type:'end'};
  if(action==='discard'&&selectedCard())move={type:'discard',card:selectedCard().id};
  const choices={respond:'card',take:'take',choose:'choose',saveBeer:'beer',giveup:'giveup',drawDeck:'deck',drawDiscard:'discard',drawSteal:'steal',stealHand:'hand',stealEquip:'equipment'};
  if(choices[action])move={type:'choose',action:choices[action],value:value===undefined?null:n};
  if(action==='sidConfirm'){move={type:'heal',cards:[...sidSelected]};modal=null;sidSelected=[];}
  if(move){selected=null;targeting=false;currentHint=null;currentHintContext=null;void online.move(move);return;}
 }
 if(action==='tutorial-start'){beginTutorial();return;}
 if(action==='card'&&tutorial){
  const card=game.p(me()).hand.find(c=>c.id===n);if(!card)return;
  if(tutorial.accepts(action,value)){tutorialAction(action,value);return;}
  practicePreview=selected===n||practicePreview?.id===n?null:card;render();return;
 }
 if(tutorial&&!['sound','catalog','catalogCard','characterCatalog','characterGuide','ownCharacter','guidePrevious','guideNext','previewClose','close','zoom','equipmentInfo','discardTop'].includes(action)){tutorialAction(action,value);return;}
 switch(action){
  case 'count':settings.count=n;render();break;
  case 'start':start();break;
  case 'resume':if(saved){game=new Game(JSON.parse(JSON.stringify(saved)));settings={...game.s.options,role:'random'};page='game';modal=null;eliminationSeen=false;resultSeen=false;render();window.scrollTo(0,0);}break;
  case 'sound':sound=!sound;try{localStorage.setItem('bang-sound',sound?'1':'0');}catch{}sfx();render();break;
  case 'speed':fast=!fast;try{localStorage.setItem('bang-fast',fast?'1':'0');}catch{}toast(fast?'AI가 빠르게 진행합니다.':'AI가 보통 속도로 진행합니다.');render();break;
  case 'rules':modal={type:'rules'};render();break;
  case 'catalog':modal={type:'catalog'};render();break;
  case 'characterCatalog':modal={type:'characters'};render();break;
  case 'characterGuide':if(CHARACTER_GUIDES[value]){modal={type:'character',id:value};render();}break;
  case 'ownCharacter':modal={type:'character',id:game.p(me()).char};render();break;
  case 'guidePrevious':moveGuide(-1);break;
  case 'guideNext':moveGuide(1);break;
  case 'previewClose':practicePreview=null;render();break;
  case 'catalogCard':modal={type:'card',card:{type:value},back:true};render();break;
  case 'close':if(guideOpen())tutorialFocusStep=-1;modal=null;sidSelected=[];render();break;
  case 'home':if(page==='lobby'&&soloLobby){soloLobby=false;render();break;}if(page==='game'&&!game.s.winner){modal={type:'new'};render();}else{page='lobby';modal=null;render();}break;
  case 'new':if(!game.s.winner)modal={type:'new'};else{page='lobby';modal=null;}render();break;
  case 'goLobby':clearPractice();modal=null;page='lobby';render();window.scrollTo(0,0);break;
  case 'use':{
   const c=selectedCard();if(!c)break;const reason=game.canPlay(me(),c);if(reason){toast(reason);break;}
   if(CARDS[c.type].target||game.bangType(me(),c)){targeting=true;render();}
   else{selected=null;mutate(()=>game.play(me(),c.id));}break;
  }
  case 'cancelTarget':selected=null;targeting=false;render();break;
  case 'player':{
   if(targeting){const c=selectedCard();if(c&&game.targets(me(),c).includes(n)){selected=null;targeting=false;mutate(()=>game.play(me(),c.id,n));}else toast('이 상대에게는 사용할 수 없어요.');}
   else{modal={type:'player',id:n};render();}break;
  }
  case 'zoom':{const card=tutorial&&practicePreview||selectedCard();if(card){modal={type:'card',card};render();}break;}
  case 'discardTop':if(game.s.discard.length){modal={type:'briefCard',card:game.s.discard.at(-1)};render();}break;
  case 'equipmentInfo':{const card=game.s.players.flatMap(p=>p.equipment).find(c=>c.id===n);if(card){modal={type:'briefCard',card};render();}break;}
  case 'end':selected=null;targeting=false;mutate(()=>game.endTurn(me()));break;
  case 'discard':{const c=selectedCard();if(c){selected=null;mutate(()=>game.discardCard(me(),c.id));}break;}
  case 'respond':mutate(()=>game.choose('card',n));break;
  case 'take':mutate(()=>game.choose('take'));break;
  case 'choose':mutate(()=>game.choose('choose',n));break;
  case 'saveBeer':mutate(()=>game.choose('beer'));break;
  case 'giveup':mutate(()=>game.choose('giveup'));break;
  case 'drawDeck':mutate(()=>game.choose('deck'));break;
  case 'drawDiscard':mutate(()=>game.choose('discard'));break;
  case 'drawSteal':mutate(()=>game.choose('steal',n));break;
  case 'stealHand':mutate(()=>game.choose('hand'));break;
  case 'stealEquip':mutate(()=>game.choose('equipment',n));break;
  case 'sid':sidSelected=[];modal={type:'sid'};render();break;
  case 'sidCard':if(sidSelected.includes(n))sidSelected=sidSelected.filter(x=>x!==n);else if(sidSelected.length<2)sidSelected.push(n);render();break;
  case 'sidConfirm':{const ids=[...sidSelected];sidSelected=[];modal=null;mutate(()=>game.healSid(me(),ids));break;}
  case 'logs':modal={type:'logs'};render();break;
  case 'result':modal={type:'result'};render();break;
 }
});
document.addEventListener('change',e=>{if(e.target.id==='character')settings.character=e.target.value;});
let guideSwipe=null;
$('#overlay').addEventListener('pointerdown',e=>{
 guideSwipe=null;
 if(!guideKeys().length||e.isPrimary===false||e.button!==0||!e.target.closest('.guide-content')||e.target.closest('button,a,select,input'))return;
 guideSwipe={x:e.clientX,y:e.clientY,pointer:e.pointerId,type:modal.type,key:modal.type==='card'?modal.card.type:modal.id};
 try{$('#overlay').setPointerCapture?.(e.pointerId);}catch{}
});
$('#overlay').addEventListener('pointercancel',()=>{guideSwipe=null;});
$('#overlay').addEventListener('pointerup',e=>{
 const start=guideSwipe;guideSwipe=null;
 if(!start||start.pointer!==e.pointerId||start.type!==modal?.type||start.key!==(modal.type==='card'?modal.card.type:modal.id))return;
 const dx=e.clientX-start.x,dy=e.clientY-start.y;
 if(Math.abs(dx)<48||Math.abs(dx)<Math.abs(dy)*1.5||window.getSelection()?.toString())return;
 e.preventDefault();moveGuide(dx<0?1:-1);
});
document.addEventListener('keydown',e=>{
 if(guideKeys().length&&['ArrowLeft','ArrowRight'].includes(e.key)&&!e.altKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();moveGuide(e.key==='ArrowRight'?1:-1);return;}
 if(tutorial&&e.key==='Escape'&&!modal){e.preventDefault();leaveTutorial();return;}
 if(e.key==='Escape'&&modal){if(guideOpen())tutorialFocusStep=-1;modal=null;sidSelected=[];render();}
 else if(e.key==='Escape'&&targeting){targeting=false;render();}
 if(e.key==='Tab'&&!$('#overlay').hidden){const buttons=[...$('#overlay').querySelectorAll('button:not(:disabled),a[href],select'),...(tutorial&&!tutorial.done?[...$('#tutorial-coach').querySelectorAll('button:not(:disabled)')]:[])];if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(botTimer);else schedule();});
window.addEventListener('pagehide',()=>{if(page==='game')save();});
window.addEventListener('resize',()=>{if(tutorial){tutorialFocusStep=-1;paintTutorial();}});

online.onNotice=toast;
let onlineRoomId=null;
online.onChange=()=>{
 if(tutorial)return;
 if(online.room?.state){
  if(onlineRoomId!==online.room.id){selected=null;targeting=false;modal=null;eliminationSeen=false;resultSeen=false;onlineRoomId=online.room.id;}
  game=new Game(online.room.state);game.label=id=>id===me()?'나':game.p(id).name+(online.room.computerSeats?.includes(id)?' (컴퓨터)':'');
  page='game';soloLobby=false;
 }else if(online.room?.status==='waiting'||onlineRoomId){page='lobby';modal=null;soloLobby=false;onlineRoomId=null;}
 render();
};
render();
if(online.embedded)parent.postMessage({source:'ojjuda-bang',type:'ojjuda-game-ready'},location.origin);
