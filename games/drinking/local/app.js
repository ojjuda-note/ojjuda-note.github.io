(() => {
'use strict';
const $=selector=>document.querySelector(selector);
const memberStore='oj.party.'+document.getElementById('access-content').dataset.member+'.';
const app=$('#app'), settings=$('#settings'), feedback=$('#feedback'), fx=window.PartyFX;
// Half of each gum line, measured on the toy artwork from the hinge to the front.
// Coordinates locate touch targets; the visible crown tilts inward independently.
const crocGum=[
  {x:12.2, upper:55.1, lower:62.3, width:8.0, height:5.1, angle:57},
  {x:12.5, upper:49.6, lower:67.7, width:8.0, height:5.4, angle:32},
  {x:19.6, upper:47.3, lower:69.2, width:6.2, height:8.6, angle:15},
  {x:27.5, upper:46.1, lower:70.3, width:8.9, height:6.0, angle:8},
  {x:36.3, upper:45.7, lower:70.2, width:8.6, height:5.7, angle:4},
  {x:45.35, upper:45.6, lower:70.1, width:9.2, height:5.5, angle:2}
];
const jawCount=crocGum.length*2;
const CROC_TOOTH_COUNT=jawCount*2;
const games=[
  ['croc','악어 이빨','운과 감각','아픈 이빨은 딱 하나','#b7dab0',2,CROC_TOOTH_COUNT+'개의 이빨 중 하나를 골라 돌아가며 눌러요. 아픈 이빨을 건드리면 악어 입이 닫혀요.'],
  ['bottle','술병 나침반','운과 감각','병 끝이 가리키는 사람','#b7d9d7',2,'2~12명이 함께해요. 테이블 모양과 방향을 고르고 각자 자리를 정해요. 돌아가는 병을 터치하면 10~20초 동안 서서히 멈춰요. 가끔은 잠깐 멈췄다가 한 칸이나 두 칸 뒤로 아주 천천히 돌아가요.'],
  ['bomb','시간폭탄','운과 감각','터지기 전에 넘겨요','#f5bba7',2,'‘키스 직전에 하면 깨는 말’처럼 주제에 맞는 답을 하고 폰을 넘겨요. 폭탄이 터지면 그때 화면에 표시된 사람이 당첨이에요.'],
  ['stopwatch','감각 스톱워치','운과 감각','목표 시간에 멈추기','#c8d9ce',2,'첫 1초가 지나면 숫자가 사라져요. 목표 시간에 가장 가깝게 멈춘 사람이 이겨요.'],
  ['liar','라이어 찾기','추리와 대화','첫 키스, 들키지 말고 설명하기','#d0c2e1',3,'한 명만 단어를 몰라요. 한 사람씩 힌트를 준 뒤, 각자 의심하는 사람에게 몰래 투표해요.'],
  ['king','왕게임','추리와 대화','고백부터 둘만의 스킨십까지','#f0d790',2,'한 명은 왕, 나머지는 비밀 번호를 받아요. 왕이 한 명이나 두 명에게 미션을 내려요. 두 사람 미션은 각자 동의하고 시작해요. 원하지 않는 미션은 벌칙 없이 패스해요.'],
  ['truth','진실게임','추리와 대화','솔직한 질문 카드','#f0c6c4',2,'내 차례에 카드 한 장을 골라 질문에 답해요. 답하기 어려우면 패스해도 돼요.'],
  ['initial','초성 대결','순발력','두 글자 단어를 5초 안에','#b8cfe1',2,'초성 두 개에 맞는 새 두 글자 단어를 5초 안에 말해요. 연애·성인 주제도 좋아요. 시간이 다 되거나 틀리면 탈락하고 마지막 한 명이 이겨요.'],
  ['minority','소수파 찾기','추리와 대화','우리의 선택은 몇 대 몇?','#bfd5bb',3,'두 선택지 중 하나를 각자 몰래 골라요. 모두 투표하면 어느 쪽이 소수파인지 공개돼요.'],
  ['mission','한 명만 다른 미션','추리와 대화','비슷한 연애 장면, 다른 몸짓','#e5bdac',3,'한 명만 조금 다른 제시어를 받아요. 말·소품·실제 접촉 없이 각자 혼자 몸짓으로 표현한 뒤, 다른 동작을 한 사람에게 몰래 투표해요.'],
  ['fingers','손병호 게임','추리와 대화','해당하면 손가락 하나 접기','#e1bd95',2,'성인이 된 뒤의 경험을 기준으로 해요. 조건에 해당하면 스스로 손가락을 접고, 공개하기 싫으면 패스해도 돼요. 다섯 개를 먼저 접은 사람이 걸려요.'],
  ['imagevote','이미지 게임','추리와 대화','이 질문에 딱 맞는 사람은?','#b9c9e4',2,'상상 속 성인 연애 상황에 가장 어울리는 사람에게 몰래 한 표를 주세요. 모두 투표하면 가장 많이 지목된 사람이 공개돼요.'],
  ['updown','업앤다운','운과 감각','숫자를 부르면, 업 또는 다운!','#c9d8ea',2,'1부터 100 사이에 숨은 숫자를 돌아가며 맞혀요. 업이면 더 큰 수, 다운이면 더 작은 수예요. 정확히 맞힌 사람이 이겨요.']
].map(([id,title,category,short,color,min,rule],i)=>({id,title,category,short,color,min,rule,num:String(i+1).padStart(2,'0')}));
const prompts=window.DrinkingPrompts;
const manualGames=new Set(['king','fingers','imagevote']);
function rand(n){return Math.floor(Math.random()*n)}
function shuffled(items){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=rand(i+1);[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
const bags=new WeakMap();
function draw(items){if(!items.length)return '';if(!bags.get(items)?.length)bags.set(items,shuffled(items));return bags.get(items).pop()}
const truthDeck={mild:[],spicy:[]};
const truthSettings={mode:'spicy',showFlavor:false};
const truthTools=window.PartyTruthCards;
const truthFlavorNames={mild:'순한맛',spicy:'빨간맛'};
function refreshTruthDeck(official){
  const next=window.PartyTruthCards.deck(official);
  for(const flavor of Object.keys(truthDeck)){
    const deck=truthDeck[flavor],current=new Set(deck),available=new Set(next[flavor]);
    const added=next[flavor].filter(q=>!current.has(q));
    if(!added.length&&deck.length===available.size)continue;
    const pending=bags.get(deck);
    if(pending?.length)bags.set(deck,shuffled([...pending.filter(q=>available.has(q)),...added]));
    deck.splice(0,deck.length,...next[flavor]);
  }
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const paths={users:'<circle cx="9" cy="8" r="3"/><path d="M3 19v-2a6 6 0 0 1 12 0v2M16 6a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4"/>',sound:'<path d="M3 9h4l5-4v14l-5-4H3zM15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',arrow:'<path d="M5 12h13m-5-5 5 5-5 5"/>',back:'<path d="m14 5-7 7 7 7"/>',random:'<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 5-5m2-3c2-3 3-4 5-4h3m-4-4 4 4-4 4"/>',play:'<path d="m7 4 13 8-13 8z" fill="currentColor" stroke="none"/>'};
function icon(key){return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">'+paths[key]+'</svg>'}
function artPath(id){
  const directory=(id==='croc'||id==='croc-board')?'/games/croc/art/':'art/';
  return directory+id+'.webp';
}
function art(id,cls=''){
  if(id==='stopwatch')return '<span class="game-art watch-art '+cls+'" aria-hidden="true">'+watchCase('0.00')+'</span>';
  return '<img class="game-art '+cls+'" src="'+artPath(id)+'" alt="" draggable="false" decoding="async">';
}
function btn(label,action,cls='start',value=''){return '<button type="button" class="'+cls+'" data-action="'+action+'" data-value="'+esc(value)+'">'+esc(label)+'</button>'}
function actions(...buttons){return '<div class="actions">'+buttons.join('')+'</div>'}
function choiceList(items,action){return '<div class="options">'+items.map(([value,label])=>btn(label,action,'choice',value)).join('')+'</div>'}
let players=Array.from({length:4},(_,i)=>'참가자 '+(i+1));
try{const p=JSON.parse(localStorage.getItem(memberStore+'players'));if(Array.isArray(p)&&p.length>=2&&p.length<=12&&p.every(n=>typeof n==='string'&&n.trim()&&n.length<=12)&&new Set(p).size===p.length)players=p}catch{}
let game=null, round=null, filter='전체', draft=[], lastMenuFocus=null, timer=null, lastStamp=0;
const bombMinSeconds=20, bombSpreadSeconds=15;
function bombLimit(count){return 30+(count-4)*5}
function bombWindow(base){
  return [base-bombSpreadSeconds,Math.min(base+bombSpreadSeconds,bombLimit(players.length))];
}
let bombSeconds=bombLimit(players.length);
function timeLabel(seconds){
  const minutes=Math.floor(seconds/60),rest=seconds%60;
  return [minutes?minutes+'분':'',rest?rest+'초':''].filter(Boolean).join(' ');
}
function updateBombTimer(value){
  if(!Number.isInteger(value)||value<bombMinSeconds||value>bombLimit(players.length))return;
  bombSeconds=value;
  const slider=$('#bomb-seconds');
  slider.value=String(value);slider.setAttribute('aria-valuetext',timeLabel(value));
  $('#bomb-base').textContent=timeLabel(value);
  const [first,last]=bombWindow(value);
  $('#bomb-window').textContent=timeLabel(first)+' ~ '+timeLabel(last)+' 사이에 터져요.';
}
function bombSetup(){
  const limit=bombLimit(players.length);
  shell('<h2>시간폭탄 타이머</h2><p>'+game.rule+'</p>'+
    '<div class="bomb-timer"><div class="bomb-timer-head"><label for="bomb-seconds">기준 시간 <strong id="bomb-base"></strong></label>'+
    '<button type="button" class="quiet" data-action="random-bomb-time" aria-label="타이머 랜덤 선택">랜덤</button></div>'+
    '<input id="bomb-seconds" type="range" min="'+bombMinSeconds+'" max="'+limit+'" step="1" value="'+bombSeconds+'" aria-describedby="bomb-window"'+(limit===bombMinSeconds?' disabled':'')+'>'+
    '<div class="bomb-timer-limits"><span>'+timeLabel(bombMinSeconds)+'</span><span>'+players.length+'명 · 최대 '+timeLabel(limit)+'</span></div>'+
    '<p id="bomb-window" aria-live="polite"></p></div>'+
    actions(btn('시간 선택 완료','confirm-bomb-time')),true);
  updateBombTimer(bombSeconds);
  $('#bomb-seconds').oninput=e=>updateBombTimer(Number(e.target.value));
}
function readyBomb(random){
  round={phase:'bomb-ready',turn:0,randomTime:random};
  const label=random?'랜덤 타이머':timeLabel(bombSeconds)+' 타이머';
  shell('<h2>'+label+'</h2><div class="bomb-launch">'+art('bomb')+btn('시작','start-bomb')+'</div>'+
    actions(btn('시간 다시 선택','bomb-setup','quiet')));
  app.querySelector('[data-action="start-bomb"]').focus({preventScroll:true});
}
async function loadRoundBank(r){
  const kind=game.id;
  const loaded=await prompts.refresh(kind);
  if(round!==r)return false;
  r.bank=loaded?prompts.list(kind):[];
  if(r.bank.length)return true;
  const message=loaded?'아직 등록된 내용이 없어요.':'내용을 불러오지 못했어요. 연결을 확인해 주세요.';
  shell('<h2>'+message+'</h2>'+actions(btn('다시 시도',kind==='bomb'?'start-bomb':'start'),btn('게임 목록','menu','quiet')));
  return false;
}
function bindLocalSuggestion(r,field,button,choices=()=>r.bank){
  button.hidden=!choices().length;
  if(r.bank.length)return;
  let edited=false;
  field.addEventListener('input',()=>{edited=true;},{once:true});
  r.bankReady.then(()=>{
    const available=choices();
    if(round!==r||!field.isConnected||!available.length)return;
    button.hidden=false;
    if(!edited&&!field.value)field.value=draw(available);
  });
}
async function startBomb(){
  const r=round;
  if(r?.phase!=='bomb-ready')return;
  const button=app.querySelector('[data-action="start-bomb"]');
  if(button){button.disabled=true;button.textContent='주제 불러오는 중…';}
  if(!await loadRoundBank(r))return;
  r.phase='play';
  const base=r.randomTime?bombMinSeconds+rand(bombLimit(players.length)-bombMinSeconds+1):bombSeconds;
  const [first,last]=bombWindow(base);
  const seconds=first+rand(last-first+1);
  r.topic=draw(r.bank);fx.play('deal');bomb();
  timed(seconds*1000,bombBurst,850,()=>fx.play('tick'));
}
function bombBurst(){
  const r=round;r.lock=true;fx.play('boom');shell('<div class="burst-stage">'+art('bomb','burst-bomb')+'<i aria-hidden="true"></i><b>펑!</b></div><h2>'+name(r.turn)+' 당첨!</h2>');
  timed(620,()=>end('펑! '+players[r.turn]+' 당첨','폭탄이 터질 때 폰을 들고 있던 사람이에요.','stop'))
}
const name=i=>esc(players[i]), tag=i=>'<span class="turn-tag">'+name(i)+' 차례</span>';
const cards=()=>games.filter(g=>filter==='전체'||filter===g.category);
function stopClock(){clearInterval(timer);timer=null}
function cleanup(){
  stopClock();fx.quiet();
  if(round?.watchFrame!=null)cancelAnimationFrame(round.watchFrame);
  if(round?.bottleFrame!=null)cancelAnimationFrame(round.bottleFrame);
  round=null;
}
function renderMenu(){
  const preview=players.slice(0,3).map(esc).join(' · ')+(players.length>3?' 외 '+(players.length-3)+'명':'');
  const roster='<section class="main-roster" aria-label="함께할 참가자"><div><h2>참가자 <b>'+players.length+'명</b></h2>'+
    '<p>'+preview+'</p></div>'+btn('참가자 설정','people','quiet')+'</section>';
  const count=cards().length;
  app.innerHTML='<section class="hero"><picture class="hero-art"><source media="(max-width: 720px)" srcset="art/hero-small.webp"><img src="art/hero.webp" width="1788" height="596" alt="" fetchpriority="high"></picture><div class="hero-copy"><h1>술게임</h1><p>한 대를 돌려가며 즐기는<br>게임 '+games.length+'가지</p><button class="hero-play" data-action="random">'+icon('random')+'랜덤 게임</button></div></section>'+roster+'<div class="catalog-head"><div class="section-title"><h2>게임 선택</h2><span class="num">'+String(count).padStart(2,'0')+'</span></div><div class="chips" aria-label="게임 분류">'+['전체','운과 감각','추리와 대화','순발력'].map(f=>'<button class="chip" data-action="filter" data-value="'+f+'" aria-pressed="'+(filter===f)+'">'+f+'</button>').join('')+'</div></div><section class="games" aria-label="게임 목록">'+cards().map(g=>'<button class="game-card" data-action="open" data-value="'+g.id+'"><span class="card-art" style="--pastel:'+g.color+'">'+art(g.id)+'<span class="card-num">'+g.num+'</span></span><span class="card-copy"><strong class="card-title">'+g.title+'</strong><span class="card-sub">'+g.short+icon('arrow')+'</span></span></button>').join('')+'</section><footer class="catalog-foot">오쭈다 술게임 · 테스트판</footer>';
}
function shell(body,scene=false){
  app.innerHTML='<button class="menu-nav" data-action="menu">'+icon('back')+'게임 목록</button><article class="play-shell"><header class="round-head"><h1>'+art(game.id,'round-mark')+game.title+'</h1><span>'+players.length+'명 플레이</span></header>'+(scene?'<div class="stage-art" style="--pastel:'+game.color+';--scene:url('+artPath(game.id)+')">'+art(game.id)+'</div>':'')+'<div class="play-body">'+body+'</div></article>';
}
function intro(){const enough=players.length>=game.min;
  if(game.id==='bomb')return bombSetup();
  if(game.id==='stopwatch')return watchSetup();
  if(game.id==='truth'){
    shell('<h2>'+game.short+'</h2><p>'+game.rule+'</p>'+truthTools.settingsForm(truthSettings)+actions(btn('게임 시작 · 한 대로','start'),
      btn('질문 카드 등록','truth-editor','quiet'))+'<p id="truth-start-message" role="status"></p>',true);
    truthTools.bindSettings(truthSettings);
    return;
  }
  const needPlayers='<p>'+game.min+'명부터 함께할 수 있어요.</p>';
  const rosterLink='<a class="quiet" href="#participants">메인에서 참가자 설정</a>';
  const local=enough?btn('게임 시작 · 한 대로','start'):rosterLink;
  shell('<h2>'+game.short+'</h2><p>'+game.rule+'</p>'+(enough?'':needPlayers)+actions(local),true);
}
function route(){let id=location.hash.slice(1);if(id==='jenga'){
  id='stopwatch';history.replaceState(null,'','#stopwatch');
}cleanup();
  if(id==='participants'){
    history.replaceState(null,'','#menu');game=null;renderMenu();scrollTo(0,0);playerSettings();return;
  }
  game=games.find(g=>g.id===id)||null;game?intro():renderMenu();scrollTo(0,0);if(game)app.focus({preventScroll:true});else if(lastMenuFocus){app.querySelector('[data-action="open"][data-value="'+lastMenuFocus+'"]')?.focus({preventScroll:true})}}
function go(id){if(id===location.hash.slice(1))route();else location.hash=id}
function end(title,desc,sound='result'){
  stopClock();round.phase='done';if(sound)fx.play(sound);
  shell('<span class="turn-tag">라운드 결과</span><h2>'+esc(title)+'</h2><p>'+esc(desc)+'</p>'+actions(btn('한 판 더',game.id==='bomb'?'bomb-setup':game.id==='truth'?'truth-setup':'start'),btn('게임 목록','menu','quiet')),true)
}
function clock(){
  stopClock();lastStamp=performance.now();
  timer=setInterval(()=>{
    const now=performance.now(),delta=now-lastStamp;lastStamp=now;
    if(!round||document.hidden||feedback.open||settings.open||round.paused)return;
    const r=round;r.remain-=delta;
    if(r.remain<=0){stopClock();r.onLimit();return}
    if(r.beat){const b=Math.ceil(r.remain/r.beat);if(b!==r.lastBeat){r.lastBeat=b;r.onBeat?.(b)}}
  },45)
}
function timed(ms,onLimit,beat=0,onBeat=null){
  Object.assign(round,{remain:ms,onLimit,beat,lastBeat:Math.ceil(ms/beat),onBeat});clock()
}
async function begin(){
  if(players.length<game.min)return go('participants');
  cleanup();round={turn:0,phase:'play'};fx.play(game.id==='croc'?'tooth':'deal');const r=round;
  if(manualGames.has(game.id)){
    const kind=game.id;
    r.bank=[];
    r.bankReady=prompts.refresh(kind).then(loaded=>{if(round===r&&loaded)r.bank=prompts.list(kind);});
  }else if(prompts.managed(game.id)&&game.id!=='truth'){
    const button=app.querySelector('[data-action="start"]');
    if(button){button.disabled=true;button.textContent='불러오는 중…';}
    if(!await loadRoundBank(r))return;
  }
  switch(game.id){
    case 'croc':r.trap=rand(CROC_TOOTH_COUNT);r.pressed=new Set();return croc();
    case 'bottle':return chooseBottleTable();
    case 'stopwatch':
      r.target=watchTenths*10;r.records=[];
      return readyWatch();
    case 'truth':return startTruthRound(r);
    case 'fingers':
      r.fingers=players.map(()=>5);
      return partyPrompt();
    case 'imagevote':return partyPrompt();
    case 'updown':
      r.answer=1+rand(100);r.low=1;r.high=100;r.guesses=0;
      return upDown();
    case 'initial':r.alive=players.map((_,i)=>i);r.initial=draw(r.bank);return initialReady();
    case 'minority':r.pair=draw(r.bank);return startVotes('minority');
    case 'liar':r.secret=rand(players.length);r.word=draw(r.bank);break;
    case 'mission':r.secret=rand(players.length);r.pair=draw(r.bank);break;
    case 'king':r.roles=shuffled(players.map((_,i)=>i));r.king=r.roles.indexOf(0);break;
  }
  r.phase='deal';r.pos=0;r.revealed=false;deal();
}
function croc(snap=false){
  const r=round;
  const teeth=Array.from({length:CROC_TOOTH_COUNT},(_,i)=>{
    const pressed=r.pressed.has(i);
    const state=snap&&i===r.trap?' trap':pressed?' sunk':'';
    const lower=i>=jawCount, slot=i%jawCount, right=slot>=crocGum.length;
    const tooth=crocGum[right?jawCount-1-slot:slot];
    const x=right?100-tooth.x:tooth.x, y=lower?tooth.lower:tooth.upper;
    const tilt=tooth.angle*(right?1:-1)*(lower?-1:1);
    const style='left:'+x+'%;top:'+y+'%;width:'+tooth.width+'%;height:'+tooth.height+'%;--tilt:'+tilt+'deg';
    const label=(lower?'아랫니 ':'윗니 ')+(i+1)+'번'+(state===' trap'?', 당첨':pressed?', 이미 눌렀어요':'');
    return '<button class="tooth'+state+'" data-jaw="'+(lower?'lower':'upper')+'" style="'+style+'" data-action="tooth" data-value="'+i+'" aria-label="'+label+'" '+(pressed||snap?'disabled':'')+'>'+
      '<span class="tooth-crown">'+(i+1)+'</span></button>';
  }).join('');
  const remaining='남은 이빨 '+(CROC_TOOTH_COUNT-r.pressed.size)+'개';
  const safe=r.lastSafe!=null?(r.lastSafe+1)+'번은 안전! · ':'';
  const hint=snap?(r.trap+1)+'번이 아픈 이빨!':safe+remaining;
  shell(tag(r.turn)+'<h2>'+(snap?'딱! 악어한테 물렸어요':'이빨 하나를 콕!')+'</h2><p class="croc-hint" role="status">'+hint+'</p>'+
    (snap?actions(btn('확인','ack-bite')):'')+
    '<div class="croc-toy'+(snap?' snapped':'')+'">'+art('croc-board','croc-board')+
    '<div class="teeth">'+teeth+'</div></div>');
  if(snap)app.querySelector('[data-action="ack-bite"]').focus();
}
const bottleTables={
  round:{label:'원형',ratio:1}, oval:{label:'타원형',ratio:1.65},
  square:{label:'정사각형',ratio:1}, long:{label:'긴 직사각형',ratio:1.85}
};
function chooseBottleTable(){
  const r=round;
  r.phase='table';
  const shapes=Object.entries(bottleTables).map(([id,table])=>
    '<label class="table-option"><input type="radio" name="table-shape" value="'+id+'" '+(id===(r.table??'round')?'checked':'')+'>'+
    '<span><i aria-hidden="true" class="table-mini '+id+'"></i>'+table.label+'</span></label>').join('');
  const directions=[['horizontal','가로'],['vertical','세로']].map(([id,label])=>
    '<label class="direction-option"><input type="radio" name="table-direction" value="'+id+'" '+(id===(r.direction??'horizontal')?'checked':'')+'>'+
    '<span>'+label+'</span></label>').join('');
  shell('<h2>어떤 테이블에 앉았나요?</h2><div class="bottle-setup">'+
    '<fieldset><legend>테이블 모양</legend><div class="table-options">'+shapes+'</div></fieldset>'+
    '<fieldset><legend>테이블 방향</legend><div class="direction-options">'+directions+'</div></fieldset></div>'+
    actions(btn('자리 선택하기','set-bottle-table')));
}
function setBottleTable(){
  if(round.phase!=='table')return;
  const table=$('input[name="table-shape"]:checked').value;
  const direction=$('input[name="table-direction"]:checked').value;
  if(!Object.hasOwn(bottleTables,table)||!['horizontal','vertical'].includes(direction))return;
  const sameTable=round.table===table&&round.direction===direction&&Array.isArray(round.positions);
  const positions=players.map((_,i)=>sameTable?round.positions[i]??null:null);
  Object.assign(round,{table,direction,positions,seatHistory:[],angle:0});
  fx.play('tap');editBottleSeats();
}
function editBottleSeats(){
  const r=round;
  r.phase='seating';
  const next=r.positions.indexOf(null);
  r.activePlayer=next<0?0:next;
  showBottle();
}
function seatStyle(point){return 'left:'+point.left+'%;top:'+point.top+'%'}
function placeBottleSeat(player,point,rect){
  const r=round;
  if(r.phase!=='seating')return false;
  const distance=p=>Math.hypot((point.left-p.left)*rect.width/100,(point.top-p.top)*rect.height/100);
  let message='';
  if(distance({left:50,top:50})<8)message='병이 방향을 가리킬 수 있게 가운데에서 조금 옆을 눌러 주세요.';
  else if(r.positions.some((p,i)=>i!==player&&p&&distance(p)<12))message='다른 자리에서 조금 옆을 눌러 주세요.';
  if(message){$('#bottle-hint').textContent=message;return false}
  r.seatHistory.push({player,previous:r.positions[player]});
  r.positions[player]=point;
  const next=r.positions.indexOf(null);
  r.activePlayer=next<0?player:next;
  fx.play('tap');showBottle();return true;
}
// Keep the marker inside the visible table, preserving arbitrary interior coordinates.
function seatPoint(x,y,rect){
  const margin=Math.min(22,Math.max(14,rect.width*.05));
  const rx=Math.max(1,rect.width/2-margin),ry=Math.max(1,rect.height/2-margin);
  let dx=x-rect.left-rect.width/2,dy=y-rect.top-rect.height/2;
  if(round.table==='round'||round.table==='oval'){
    const scale=Math.max(1,Math.hypot(dx/rx,dy/ry));dx/=scale;dy/=scale;
  }else{
    dx=Math.max(-rx,Math.min(rx,dx));dy=Math.max(-ry,Math.min(ry,dy));
  }
  return {left:50+dx/rect.width*100,top:50+dy/rect.height*100};
}
function bindSeatBoard(){
  const dial=$('.bottle-dial'), surface=dial.querySelector('.seat-surface'), r=round;
  let drag=null;
  let cursor=r.positions[r.activePlayer]??{left:50,top:15};
  const measure=()=>dial.getBoundingClientRect();
  const pointAt=e=>seatPoint(e.clientX,e.clientY,measure());
  surface.onclick=e=>{
    const keyboard=e.detail===0;
    if(placeBottleSeat(r.activePlayer,keyboard?cursor:pointAt(e),measure())&&keyboard)$('.seat-surface').focus({preventScroll:true});
  };
  surface.onkeydown=e=>{
    const keys={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const delta=keys[e.key];if(!delta)return;
    e.preventDefault();
    const box=measure(),step=e.shiftKey?2:10;
    cursor=seatPoint(box.left+box.width*cursor.left/100+delta[0]*step,box.top+box.height*cursor.top/100+delta[1]*step,box);
    surface.style.setProperty('--cursor-x',cursor.left+'%');surface.style.setProperty('--cursor-y',cursor.top+'%');
  };
  surface.style.setProperty('--cursor-x',cursor.left+'%');surface.style.setProperty('--cursor-y',cursor.top+'%');
  dial.onpointerdown=e=>{
    const marker=e.target.closest('button[data-seat]');
    if(!marker||!e.isPrimary||e.button!==0)return;
    const player=Number(marker.dataset.seat),box=measure(),old=r.positions[player];
    drag={marker,player,id:e.pointerId,x:e.clientX,y:e.clientY,dx:box.left+old.left*box.width/100-e.clientX,dy:box.top+old.top*box.height/100-e.clientY,moved:false};
    marker.setPointerCapture(e.pointerId);
  };
  const draggedPoint=e=>seatPoint(e.clientX+drag.dx,e.clientY+drag.dy,measure());
  dial.onpointermove=e=>{
    if(!drag||drag.id!==e.pointerId)return;
    if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<4)return;
    drag.moved=true;
    drag.marker.style.cssText=seatStyle(draggedPoint(e));
  };
  dial.onpointerup=e=>{
    if(!drag||drag.id!==e.pointerId)return;
    if(!drag.moved){drag=null;return}
    const {player,marker}=drag,point=draggedPoint(e);
    drag=null;
    if(!placeBottleSeat(player,point,measure()))marker.style.cssText=seatStyle(r.positions[player]);
  };
  dial.onpointercancel=dial.onlostpointercapture=e=>{
    if(!drag||drag.id!==e.pointerId)return;
    drag.marker.style.cssText=seatStyle(r.positions[drag.player]);drag=null;
  };
}
function showBottle(){
  const r=round,picking=r.phase==='seating',complete=r.positions.every(Boolean);
  const seats=r.positions.map((point,i)=>{
    if(!point)return '';
    const label=esc(players[i]),attrs='data-seat="'+i+'" style="'+seatStyle(point)+'"';
    if(picking)return '<button class="seat" type="button" '+attrs+' data-action="edit-player" data-value="'+i+'" aria-label="'+label+' 자리 옮기기" aria-pressed="'+(i===r.activePlayer)+'">'+(i+1)+'</button>';
    return '<span class="seat" '+attrs+' title="'+label+'">'+(i+1)+'</span>';
  }).join('');
  const roster=players.map((name,i)=>'<li>'+(picking?'<button data-action="edit-player" data-value="'+i+'" aria-pressed="'+(i===r.activePlayer)+'" aria-label="'+esc(name)+(r.positions[i]?' 자리 옮기기':' 자리 놓기')+'">':'')+
    '<b>'+(i+1)+'</b>'+esc(name)+(picking?'</button>':'')+'</li>').join('');
  const heading=picking?(complete?'자리를 확인해 주세요':esc(players[r.activePlayer])+'님의 자리는 어디인가요?'):'술병을 돌려 보세요';
  const hint=picking?(complete?'자리 표시를 끌어 옮기거나, 이름을 고른 뒤 새 위치를 누르세요.':'테이블에서 앉은 곳을 누르세요. 이름을 고르면 그 사람부터 놓을 수 있어요.'):'병이 돌 때 화면을 터치하면 서서히 멈춰요.';
  const controls=picking?actions(complete?btn('술병 돌리기','spin'):'',r.seatHistory.length?btn('한 번 되돌리기','undo-seat','quiet'):'',btn('테이블 다시 선택','change-table','quiet')):'';
  const ratio=bottleTables[r.table].ratio,vertical=r.direction==='vertical';
  const size=ratio===1?340:vertical?490/ratio:490;
  const surface=picking?'<button type="button" class="seat-surface" aria-label="'+esc(players[r.activePlayer])+' 자리 놓기. 방향키로 위치를 정한 뒤 엔터를 누르세요."></button>':'';
  shell('<h2 id="bottle-title">'+heading+'</h2><p id="bottle-hint" aria-live="polite">'+hint+'</p>'+
    '<div class="dial bottle-dial table-'+r.table+' '+r.direction+'" style="aspect-ratio:'+(vertical?1/ratio:ratio)+';--board-width:'+size+'px">'+art('pointer')+surface+seats+'</div>'+
    '<div id="spin-status">'+controls+'</div><ul class="bottle-seats" aria-label="참가자 자리">'+roster+'</ul>');
  if(picking)bindSeatBoard();
}
function spin(){
  const r=round;
  if(!['seating','done'].includes(r.phase)||!r.positions.every(Boolean))return;
  r.phase='spinning';showBottle();
  r.speed=matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.18 : 1.44;
  r.startAngle=r.angle%360;
  r.started=performance.now();
  r.lastTick=Math.floor(r.startAngle/180);
  const dial=$('.bottle-dial');
  dial.querySelector('.winning-seat')?.classList.remove('winning-seat');
  r.pointer=dial.querySelector('.game-art');
  $('#bottle-title').textContent='병이 돌고 있어요';
  $('#bottle-hint').textContent='원하는 순간에 화면을 터치하세요.';
  $('#spin-status').innerHTML=actions(btn('터치해서 멈추기','brake'));
  $('#spin-status button').focus({preventScroll:true});
  fx.play('spin');
  r.bottleFrame=requestAnimationFrame(animateBottle);
}
function brakeBottle(){
  const r=round;
  if(r?.phase!=='spinning')return;
  const now=performance.now();
  r.startAngle=(r.startAngle+r.speed*(now-r.started))%360;
  r.started=now;
  r.phase='braking';
  r.duration=10000+rand(10001);
  r.winningSeat=rand(players.length);
  const rect=$('.bottle-dial').getBoundingClientRect();
  const bearings=r.positions.map(p=>Math.atan2((p.left-50)*rect.width,(50-p.top)*rect.height)*180/Math.PI);
  const target=(bearings[r.winningSeat]+360)%360;
  r.reverseArc=0;
  r.returnDuration=0;
  r.forwardDuration=r.duration;
  const roll=rand(100);
  const steps=roll<10?1:roll<15?2:0;
  if(steps){
    // Sort by the physical seating order starting at the winner, regardless of marker number.
    const clockwise=bearings.map((bearing,i)=>{
      const gap=(bearing-target+720)%360;
      return {index:i,gap:gap>360-1e-7||gap<1e-7?0:gap};
    }).filter(seat=>seat.index!==r.winningSeat).sort((a,b)=>a.gap-b.gap);
    if(steps===r.positions.length){
      // With two people, two seats backwards is a full turn back to the first stop.
      r.reverseArc=360;
    }else{
      const stop=clockwise[steps-1];
      r.reverseArc=stop.gap;
      if(!r.reverseArc){
        // Aim at the side of a collinear marker so the return is visible.
        const p=r.positions[stop.index];
        const radius=Math.hypot((p.left-50)*rect.width/100,(p.top-50)*rect.height/100);
        r.reverseArc=Math.atan2(6,radius)*180/Math.PI;
      }
    }
    r.returnDuration=steps===2?Math.min(r.duration*0.60,4600+22*r.reverseArc):Math.min(r.duration*0.55,3400+14*r.reverseArc);
    r.forwardDuration=r.duration-1200-r.returnDuration;
  }
  const residual=(target+r.reverseArc-r.startAngle+360)%360;
  const idealPower=1.8+Math.random()*0.8;
  const idealTravel=r.speed*r.forwardDuration/idealPower;
  r.travel=residual+360*Math.round((idealTravel-residual)/360);
  // Fit the randomly varied slowdown to the seat while preserving speed at the tap.
  r.easePower=r.speed*r.forwardDuration/r.travel;
  r.lastTick=Math.floor(r.startAngle/180);
  $('#bottle-title').textContent='서서히 멈추는 중…';
  $('#bottle-hint').textContent='병 입구가 가리킬 자리를 지켜보세요.';
  $('#spin-status').innerHTML='';
}
function animateBottle(now){
  const r=round;
  if(!r||!['spinning','braking'].includes(r.phase))return;
  const elapsed=Math.max(0,now-r.started);
  const braking=r.phase==='braking';
  if(!braking){
    r.angle=r.startAngle+r.speed*elapsed;
  }else if(r.reverseArc&&elapsed>r.forwardDuration){
    // Hold the first stop for 1.2 seconds before easing backwards.
    const returnStart=r.duration-r.returnDuration;
    const t=Math.min(1,Math.max(0,(elapsed-returnStart)/r.returnDuration));
    // The backward roll starts and ends at rest, with no jump at the turn.
    r.angle=r.startAngle+r.travel-r.reverseArc*t*t*(3-2*t);
  }else{
    const t=Math.min(1,elapsed/r.forwardDuration);
    r.angle=r.startAngle+r.travel*(1-(1-t)**r.easePower);
  }
  r.pointer.style.transform='rotate('+r.angle+'deg)';
  if(braking&&elapsed>=r.duration){
    r.bottleFrame=null;
    r.phase='done';
    const seat=r.winningSeat;
    $('.bottle-dial [data-seat="'+seat+'"]').classList.add('winning-seat');
    $('#bottle-title').textContent=players[seat]+'님 당첨!';
    $('#bottle-hint').textContent='병 입구가 '+(seat+1)+'번 자리를 가리켰어요. 오늘은 이 자리로 시선이 쏠리네요.';
    $('#spin-status').innerHTML=actions(btn('다시 돌리기','spin'),btn('자리 옮기기','edit-seats','quiet'),btn('게임 목록','menu','quiet'));
    fx.play('stop');
    return;
  }
  const tick=Math.floor(r.angle/180);
  if(tick!==r.lastTick&&!feedback.open)fx.play('spin');
  r.lastTick=tick;
  r.bottleFrame=requestAnimationFrame(animateBottle);
}
function bomb(){const r=round;shell(tag(r.turn)+'<h2>'+esc(r.topic)+'</h2>'+art('bomb','mini-art pulse')+'<p>이미 나온 답을 빼고 단어나 짧은 말을 하나 하세요. 대사는 상상해서 만들어도 돼요.</p>'+actions(btn('말했어요 · 다음 사람','pass-bomb')))}
let watchTenths=50;
function watchCase(reading,live=false){
  return '<span class="watch-case"><span class="watch-crown"></span><span class="watch-bezel">'+
    '<span class="watch-scale"></span><span class="watch-lcd"'+(live?' id="watch-reading"':'')+'>'+reading+'</span>'+
    '<span class="watch-pin"></span></span></span>';
}
function setWatchTarget(tenths){
  if(!Number.isInteger(tenths)||tenths<50||tenths>100)return;
  watchTenths=tenths;
  const value=(tenths/10).toFixed(1),slider=$('#watch-target');
  slider.value=value;slider.setAttribute('aria-valuetext',value+'초');
  $('#watch-setting').textContent=value+'초';
  $('#watch-minus').disabled=tenths===50;$('#watch-plus').disabled=tenths===100;
}
function watchSetup(){
  shell('<h2>몇 초에 멈출까요?</h2><p>'+game.rule+'</p>'+
    '<div class="watch-config"><label for="watch-target">목표 시간</label>'+
    '<div class="watch-step"><button id="watch-minus" type="button" aria-label="0.1초 줄이기">−</button>'+
    '<output id="watch-setting" for="watch-target"></output>'+
    '<button id="watch-plus" type="button" aria-label="0.1초 늘리기">＋</button></div>'+
    '<input id="watch-target" type="range" min="5.0" max="10.0" step="0.1" value="'+(watchTenths/10).toFixed(1)+'">'+
    '<div class="watch-limits"><span>5.0초</span><span>10.0초</span></div></div>'+
    actions(btn('게임 시작 · 한 대로','start')));
  setWatchTarget(watchTenths);
  $('#watch-minus').onclick=()=>setWatchTarget(watchTenths-1);
  $('#watch-plus').onclick=()=>setWatchTarget(watchTenths+1);
  $('#watch-target').oninput=e=>setWatchTarget(Math.round(Number(e.target.value)*10));
}
function watchScreen(running,interrupted=false){
  const r=round;
  shell(tag(r.turn)+'<h2>목표 '+(r.target/100).toFixed(1)+'초</h2>'+
    '<div class="watch-board">'+watchCase('0.00',true)+'</div>'+
    '<p>'+(interrupted?'화면이 바뀌었어요. 이번 차례를 다시 시작하세요.':running?'목표 시간이라고 느낄 때 멈추세요.':'준비되면 시작을 누르세요.')+'</p>'+
    actions(running?btn('멈추기','watch-stop'):btn('시작','watch-go')));
  app.querySelector('[data-action="'+(running?'watch-stop':'watch-go')+'"]').focus({preventScroll:true});
}
function readyWatch(interrupted=false){
  round.phase='watch-ready';watchScreen(false,interrupted);
}
function startWatch(){
  const r=round;
  if(r?.phase!=='watch-ready'||document.hidden||feedback.open)return;
  r.phase='watch-running';watchScreen(true);
  const face=$('#watch-reading');
  r.started=performance.now();
  function update(now){
    if(round!==r||r.phase!=='watch-running')return;
    const elapsed=Math.max(0,now-r.started);
    if(elapsed>=1000){
      face.textContent='–.––';face.setAttribute('aria-label','시간 숨김');r.watchFrame=null;return;
    }
    face.textContent=(Math.floor(elapsed/10)/100).toFixed(2);
    r.watchFrame=requestAnimationFrame(update);
  }
  r.watchFrame=requestAnimationFrame(update);
}
function interruptWatch(){
  if(round?.phase!=='watch-running')return;
  if(round.watchFrame!=null)cancelAnimationFrame(round.watchFrame);
  round.watchFrame=null;readyWatch(true);
}
function stopWatch(){
  const r=round;
  if(r?.phase!=='watch-running')return;
  const score=Math.max(0,Math.round((performance.now()-r.started)/10));
  if(r.watchFrame!=null)cancelAnimationFrame(r.watchFrame);
  r.watchFrame=null;r.phase='watch-score';r.records.push(score);fx.play('stop');
  const delta=score-r.target;
  shell(tag(r.turn)+'<h2>'+(!delta?'정확히 맞혔어요!':(Math.abs(delta)/100).toFixed(2)+'초 '+(delta<0?'빨랐어요':'늦었어요'))+'</h2>'+
    '<div class="watch-board">'+watchCase((score/100).toFixed(2))+'</div>'+
    '<p>내 기록 '+(score/100).toFixed(2)+'초 · 목표 '+(r.target/100).toFixed(1)+'초</p>'+
    actions(btn(r.turn+1<players.length?'다음 참가자':'결과 보기','watch-next')));
  app.querySelector('[data-action="watch-next"]').focus({preventScroll:true});
}
function nextWatch(){
  const r=round;
  if(r?.phase!=='watch-score')return;
  if(r.turn+1<players.length){r.turn++;return readyWatch()}
  r.phase='done';fx.play('result');
  const ordered=r.records.map((score,i)=>({i,score,error:Math.abs(score-r.target)})).sort((a,b)=>a.error-b.error);
  const winners=ordered.filter(p=>p.error===ordered[0].error);
  const rows=ordered.map(p=>'<tr><th scope="row">'+name(p.i)+'</th><td>'+(p.score/100).toFixed(2)+'초</td><td>'+(p.error/100).toFixed(2)+'초</td></tr>').join('');
  shell('<span class="turn-tag">라운드 결과</span><h2>'+winners.map(p=>name(p.i)).join(' · ')+(winners.length>1?' 공동 1등!':' 1등!')+'</h2>'+
    '<p>이 감이면 고백 타이밍도 놓치지 않겠는데요?</p><p>목표 '+(r.target/100).toFixed(1)+'초</p><table class="watch-results"><thead><tr><th>참가자</th><th>기록</th><th>목표와 차이</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    actions(btn('한 판 더','watch-setup'),btn('게임 목록','menu','quiet')));
}
function privateScreen(title,description,face,button){
  shell('<span class="turn-tag">비공개 · '+(round.pos+1)+' / '+players.length+'</span><h2>'+title+'</h2><p>'+description+'</p><div class="private-card '+(round.revealed?'':'hidden-face')+'">'+art(round.revealed?game.id:'back','secret-art')+'<strong>'+face+'</strong></div>'+button)
}
function deal(){
  const r=round;let info='비밀 카드';
  if(r.revealed){if(game.id==='king')info=r.roles[r.pos]===0?'당신은 왕!':r.roles[r.pos]+'번';
    if(game.id==='liar')info=r.secret===r.pos?'당신은 라이어':esc(r.word);
    if(game.id==='mission')info=esc(r.pair[Number(r.secret===r.pos)]);}
  privateScreen(name(r.pos)+'님'+(r.revealed?'의 카드':'에게 폰을 주세요'),r.revealed?'혼자 확인한 뒤 카드를 가려 주세요.':'다른 사람은 잠시 화면을 보지 마세요.',info,actions(r.revealed?btn('카드 가리기','hide'):btn('내 카드 보기','reveal')))
}
function afterDeal(){const r=round;r.revealed=false;
  if(game.id==='king'){
    r.phase='king';r.number=1;r.second=null;r.prompt=draw(prompts.kingChoices(r.bank,false));return king();
  }
  r.phase='talk';
  shell('<h2>'+(game.id==='liar'?'한 사람씩 힌트를 말해요':'하나, 둘, 셋! 동시에 표현해요')+'</h2><p>'+(game.id==='liar'?'정답과 초성은 숨기고, 장소·느낌·상황으로 한마디씩 설명하세요. 누가 단어를 모르는지 찾아봐요.':'말·소품·실제 접촉 없이 각자 혼자 몸짓만으로 표현하세요. 누가 다른 동작을 했나요?')+'</p>'+actions(btn('비밀 투표 시작','start-vote')),true)
}
function king(){
  const r=round,count=players.length-1;
  const options=(selected,exclude)=>Array.from({length:count},(_,i)=>i+1).filter(n=>n!==exclude)
    .map(n=>'<option value="'+n+'"'+(n===selected?' selected':'')+'>'+n+'번</option>').join('');
  const secondOptions=()=>'<option value="">한 명에게만</option>'+options(r.second,r.number);
  const second=count>1?'<label for="king-second">두 번째 번호 (선택)</label><p><select class="field" id="king-second">'+secondOptions()+'</select></p>':'';
  shell('<span class="turn-tag">오늘의 왕 · '+name(r.king)+'</span><h2>몇 번에게 미션을 줄까요?</h2>'+
    '<label for="king-number">첫 번째 번호</label><p><select class="field" id="king-number">'+options(r.number)+'</select></p>'+second+
    '<label for="king-mission">왕의 미션</label><p><input class="field" id="king-mission" maxlength="80" value="'+esc(r.prompt)+'"></p>'+
    '<p><small>직접 쓴 내용은 관리자 검토 후 공용 목록에 등록될 수 있어요.</small></p>'+
      actions(btn('번호 주인공 공개','royal'),btn('다른 미션','new-prompt','quiet')),true);
  const field=$('#king-mission'),suggest=app.querySelector('[data-action="new-prompt"]');
  const choices=()=>prompts.kingChoices(r.bank,r.second!=null);
  bindLocalSuggestion(r,field,suggest,choices);
  field.oninput=()=>{r.custom=true;field.setCustomValidity('');};
  function switchRecipients(second){
    if(r.second===second)return;
    r.second=second;suggest.hidden=!choices().length;
    if(!r.custom)field.value=r.prompt=draw(choices());
  }
  $('#king-number').onchange=e=>{
    r.number=Number(e.target.value);
    if(r.second===r.number)switchRecipients(null);
    if(count>1)$('#king-second').innerHTML=secondOptions();
  };
  if(count>1)$('#king-second').onchange=e=>switchRecipients(Number(e.target.value)||null);
}
function revealKingOrder(){
  const r=round;
  if(r.phase!=='king')return;
  const input=$('#king-mission'),mission=input.value.trim();
  if(!mission){
    input.setCustomValidity('미션을 적거나 다른 미션을 골라 주세요.');input.reportValidity();
    input.oninput=()=>input.setCustomValidity('');return;
  }
  window.DrinkingPrompts.submit('king',mission);
  r.prompt=mission;r.answers={};
  r.phase=r.second==null?'done':'king-answer';fx.play('king');
  kingResult();
}
function kingResult(){
  const r=round,numbers=r.second==null?[r.number]:[r.number,r.second];
  const recipients=numbers.map(n=>'<div><dt>카드 '+n+'번</dt><dd>'+name(r.roles.indexOf(n))+'</dd></div>').join('');
  const next=numbers.find(n=>!r.answers[n]);
  let footer=actions(btn('한 판 더','start'),btn('게임 목록','menu','quiet'));
  if(r.phase==='king-answer'){
    footer='<p>'+name(r.roles.indexOf(next))+'님, 이 미션을 할까요?</p>'+
      actions(btn('동의','king-yes', 'start',next),btn('패스','king-no','quiet',next));
  }else if(r.declined!=null){
    footer='<p>이번 미션은 패스했어요. 벌칙 없이 다음 판으로 넘어가요.</p>'+footer;
  }else if(r.second!=null)footer='<p>두 사람 모두 동의했어요. 진행 중에도 언제든 멈출 수 있어요.</p>'+footer;
  else footer='<p>답하거나 하기 어려운 미션은 이유를 말하지 않고 패스해도 돼요.</p>'+footer;
  shell('<section class="king-order"><span class="king-order-label">왕의 명령</span>'+
    '<h2>'+esc(r.prompt)+'</h2><dl class="king-recipients" aria-label="명령을 받은 사람">'+recipients+'</dl></section>'+footer,true);
}
const truthEditor=$('#truth-editor'),truthMessage=$('#truth-message');
async function startTruthRound(r){
  const button=app.querySelector('[data-action="start"]'),message=$('#truth-start-message');
  if(button)button.disabled=true;
  if(message)message.textContent='질문을 불러오는 중이에요…';
  let loaded=false;
  try{loaded=await prompts.refresh('truth')}catch{}
  if(round!==r)return;
  r.official=loaded?prompts.truth():{mild:[],spicy:[]};
  refreshTruthDeck(r.official);
  r.truthSettings={...truthSettings};
  const missing=truthTools.enabledFlavors(r.truthSettings.mode).find(flavor=>!truthDeck[flavor].length);
  if(!missing)return dealTruth();
  if(loaded){
    cleanup();intro();openTruthEditor();
    $('#truth-flavor').value=missing;
    truthMessage.textContent=truthFlavorNames[missing]+' 질문을 한 장 이상 추가해 주세요.';
    return;
  }
  cleanup();intro();
  $('#truth-start-message').textContent='질문을 불러오지 못했어요. 연결을 확인하고 다시 시작해 주세요.';
}
function openTruthEditor(){
  truthMessage.textContent='';
  truthEditor.showModal();
}
$('#truth-close').onclick=()=>truthEditor.close();
$('#truth-form').onsubmit=e=>{
  e.preventDefault();
  const input=$('#truth-question'),flavor=$('#truth-flavor').value;
  const result=window.PartyTruthCards.register(flavor,input.value);
  if(result.error||result.known){
    truthMessage.textContent=result.error||'이미 있는 질문이에요.';input.focus();return;
  }
  if(round&&game?.id==='truth')refreshTruthDeck(round.official);
  input.value='';input.focus();
  truthMessage.textContent=result.saved?'이 기기의 질문에 추가했어요.':'이번 플레이에 사용할 질문으로 추가했어요.';
};
function dealTruth(){
  const {mode,showFlavor}=round.truthSettings;
  round.truthCards=mode==='mixed'?shuffled(['mild','spicy']):[mode,mode];
  round.phase='truth-pick';
  const cards=round.truthCards.map((flavor,i)=>{
    const taste=showFlavor?flavor:null;
    return '<button type="button" class="truth-back" data-action="truth-pick" data-value="'+i+
      '" aria-label="'+truthTools.sideName(i,taste)+'">'+art('back')+truthTools.cardLabel(taste)+'</button>';
  }).join('');
  shell(tag(round.turn)+'<h2 tabindex="-1" id="truth-title">카드 한 장을 골라요</h2>'+
    '<div class="truth-pair">'+cards+'</div>'+btn('질문 카드 등록','truth-editor','quiet'));
  $('#truth-title').focus({preventScroll:true});
}
function revealTruth(value){
  const r=round;
  if(r.phase!=='truth-pick'||(value!=='0'&&value!=='1'))return;
  r.phase='truth-answer';
  const spicy=r.truthCards[Number(value)]==='spicy';
  const question=draw(spicy?truthDeck.spicy:truthDeck.mild);
  fx.play('truth');
  shell(tag(r.turn)+'<div class="truth-front '+(spicy?'truth-spicy':'truth-mild')+'">'+
    '<h2 tabindex="-1" id="truth-title">'+(spicy?'빨간맛':'순한맛')+'</h2><p>'+esc(question)+'</p></div>'+
    actions(btn('답했어요','truth-next'),btn('패스','truth-pass','quiet'),btn('질문 카드 등록','truth-editor','quiet')));
  $('#truth-title').focus({preventScroll:true});
}
function initialReady(){
  const r=round;r.phase='initial-ready';const turn=r.alive[r.turn];
  shell(tag(turn)+'<h2>준비되면 시작하세요</h2><p>초성 <b>'+esc(r.initial)+'</b> · 남은 사람 '+r.alive.length+'명<br>초성 두 개에 맞는 새 두 글자 단어를 말해요. 연애·성인 주제도 좋아요. 이번 초성에서 이미 나온 단어는 빼 주세요.</p>'+actions(btn('5초 시작','initial-go')),true)
}
function initialGo(){
  const r=round;r.phase='initial-live';shell(tag(r.alive[r.turn])+'<h2>'+esc(r.initial)+'</h2><p>새 단어를 소리 내어 말해요.</p><div class="countdown" id="seconds">5</div>'+actions(btn('말했어요','word-ok'),btn('중복·오답','word-out','quiet')));
  fx.play('count');timed(5000,()=>initialOut('시간 초과'),1000,b=>{$('#seconds').textContent=b;fx.play('count')})
}
function initialOut(reason){
  stopClock();const r=round,who=r.alive.splice(r.turn,1)[0];if(r.alive.length===1)return end(players[r.alive[0]]+'님 승리!',players[who]+'님이 '+reason+'로 탈락했어요.');
  r.turn%=r.alive.length;r.initial=draw(r.bank);r.phase='intermission';fx.play('snap');
  shell('<span class="turn-tag">'+esc(reason)+'</span><h2>'+name(who)+'님 탈락</h2><p>새 초성으로 이어갑니다. '+r.alive.length+'명이 남았어요.</p>'+actions(btn('다음 차례','initial-ready')))
}
function upDown(lastGuess){
  const r=round,attempt=r.guesses;
  const range=r.low===r.high?String(r.low):r.low+' ~ '+r.high;
  const higher=lastGuess<r.answer;
  const feedback=lastGuess===undefined?'<h2>숨은 숫자는 뭘까요?</h2>':
    '<h2 class="updown-hint '+(higher?'higher':'lower')+'">'+lastGuess+' '+(higher?'↑ 업!':'↓ 다운!')+'</h2><p>'+
    (higher?'더 큰 숫자예요.':'더 작은 숫자예요.')+'</p>';
  shell(tag(r.turn)+feedback+'<form class="party-prompt updown-form" id="updown-form" novalidate>'+
    '<label id="updown-range" for="updown-value">남은 범위 <strong>'+range+'</strong></label>'+
    '<div><input class="field" id="updown-value" inputmode="numeric" type="text" required autocomplete="off" aria-describedby="updown-range updown-error" aria-label="추측할 숫자">'+
    '<button class="start" type="submit">숫자 외치기</button></div><p id="updown-error" role="alert"></p></form>');
  const form=$('#updown-form'),field=$('#updown-value'),error=$('#updown-error');
  form.onsubmit=event=>{
    event.preventDefault();
    if(round!==r||r.phase!=='play'||attempt!==r.guesses)return;
    const raw=field.value.trim(),guess=Number(raw);
    if(!/^[0-9]{1,3}$/.test(raw)||guess<r.low||guess>r.high){
      error.textContent=r.low===r.high?'남은 숫자는 '+r.low+'예요.':r.low+'부터 '+r.high+' 사이의 정수를 입력해 주세요.';
      field.setAttribute('aria-invalid','true');field.focus();return;
    }
    r.guesses++;
    if(guess===r.answer)return end(players[r.turn]+'님 정답!','숨은 숫자는 '+guess+'! '+r.guesses+'번 만에 맞혔어요. 숫자 읽는 눈치로 썸 신호도 맞히겠는데요?');
    if(guess<r.answer)r.low=guess+1;else r.high=guess-1;
    r.turn=(r.turn+1)%players.length;fx.play('turn');upDown(guess);
  };
}
function partyPrompt(){
  const r=round,fingers=game.id==='fingers';
  r.phase='party-prompt';
  shell((fingers?tag(r.turn):'')+'<h2>'+(fingers?'어떤 사람이 접을까요?':'어떤 사람을 찾을까요?')+'</h2>'+
    '<form class="party-prompt" id="party-prompt"><label for="party-question">'+(fingers?'접을 조건':'지목할 질문')+'</label>'+
    '<textarea class="field" id="party-question" rows="2" maxlength="120" required>'+esc(draw(r.bank))+'</textarea>'+
    '<p><small>직접 쓴 내용은 관리자 검토 후 공용 목록에 등록될 수 있어요.</small></p>'+
      '<div class="actions">'+btn(fingers?'다른 조건':'다른 질문','party-suggest','quiet')+
    '<button class="start" type="submit">'+(fingers?'이 조건으로 접기':'비밀 투표 시작')+'</button></div></form>'+
    (fingers?fingerScoreboard():''));
  const field=$('#party-question');
  bindLocalSuggestion(r,field,app.querySelector('[data-action="party-suggest"]'));
  field.oninput=()=>field.setCustomValidity('');
  $('#party-prompt').onsubmit=event=>{
    event.preventDefault();
    if(round!==r||r.phase!=='party-prompt')return;
    const prompt=field.value.trim();
    if(!prompt||prompt.length>120){field.setCustomValidity('1~120자로 적어 주세요.');field.reportValidity();return}
    window.DrinkingPrompts.submit(game.id,prompt);
    r.prompt=prompt;
    fx.play('deal');
    if(!fingers)return startVotes('imagevote');
    r.phase='fold';
    shell(tag(r.turn)+'<h2>'+esc(prompt)+'</h2><p>성인이 된 뒤의 경험이에요. 본인이 접겠다고 한 사람만 골라 주세요. 패스한 사람은 접지 않고 넘어가요.</p>'+
      '<form id="fold-form"><fieldset class="fold-players" aria-label="손가락을 접을 사람">'+
      players.map((_,i)=>'<label><input type="checkbox" value="'+i+'"><span>'+name(i)+'</span><small>'+r.fingers[i]+'개</small></label>').join('')+
      '</fieldset><button class="start" type="submit">선택 완료</button></form>');
    $('#fold-form').onsubmit=e=>{
      e.preventDefault();
      if(round!==r||r.phase!=='fold')return;
      const checked=e.currentTarget.querySelectorAll('input:checked');
      for(const box of checked)r.fingers[Number(box.value)]--;
      const losers=players.filter((_,i)=>r.fingers[i]===0);
      if(losers.length)return end(losers.join(' · ')+(losers.length>1?' 함께 걸렸어요!':'님이 걸렸어요!'),'다섯 손가락을 모두 접었어요.');
      r.turn=(r.turn+1)%players.length;
      fx.play('turn');partyPrompt();
    };
  };
}
function fingerScoreboard(){
  return '<ul class="party-scores" aria-label="남은 손가락">'+players.map((_,i)=>
    '<li><span>'+name(i)+'</span><b>'+round.fingers[i]+'개</b></li>').join('')+'</ul>';
}
function startVotes(kind){
  Object.assign(round,{phase:'vote',voteKind:kind,pos:0,revealed:false});
  if(kind==='imagevote')round.counts=players.map(()=>0);else round.votes=[];
  vote();
}
function canVoteFor(index){
  if(!Number.isInteger(index)||index<0)return false;
  if(round.voteKind==='minority')return index<2;
  return index<players.length&&(index!==round.pos||(round.voteKind==='imagevote'&&players.length===2));
}
function vote(){
  const r=round;if(!r.revealed)return privateScreen(name(r.pos)+'님에게 폰을 주세요',r.voteKind==='imagevote'?'누가 누구를 골랐는지는 공개되지 않아요.':'선택은 마지막에 함께 공개해요.','비밀 투표',actions(btn('내 투표 열기','open-vote')));
  const items=r.voteKind==='minority'?r.pair.map((v,i)=>[i,v]):players.flatMap((v,i)=>canVoteFor(i)?[[i,v]]:[]);
  shell('<span class="turn-tag">비공개 · '+(r.pos+1)+' / '+players.length+'</span><h2>'+name(r.pos)+'님의 선택</h2><p>'+(r.voteKind==='imagevote'?esc(r.prompt)+'<br>'+(players.length===2?'둘이 할 때는 나도 고를 수 있어요.':'나를 제외한 한 명을 골라요.'):r.voteKind==='minority'?'더 끌리는 쪽을 골라 주세요.':'가장 의심되는 한 명을 골라 주세요.')+'</p>'+choiceList(items,'cast'));
}
function votesDone(){
  const r=round;r.phase='done';fx.play('result');
  if(r.voteKind==='imagevote'){
    const most=Math.max(...r.counts),top=players.filter((_,i)=>r.counts[i]===most);
    const rows=players.map((_,i)=>'<li><span>'+name(i)+'</span><b>'+r.counts[i]+'표</b></li>').join('');
    return shell('<span class="turn-tag">투표 결과</span><h2>'+top.map(esc).join(' · ')+(top.length>1?' 공동 1위':'님이 가장 많이 지목됐어요')+'</h2>'+
      '<p>'+esc(r.prompt)+'</p><ul class="party-scores" aria-label="참가자별 득표수">'+rows+'</ul>'+
      actions(btn('새 질문으로 한 판 더','start'),btn('게임 목록','menu','quiet')),true);
  }
  if(r.voteKind==='minority'){
    const sets=[[],[]];r.votes.forEach((v,i)=>sets[v].push(name(i)));
    const [a,b]=sets.map(group=>group.length);
    const heading=a===b?'정확히 반반!':a*b===0?'모두 같은 선택!':'소수파는 '+r.pair[a<b?0:1]+'!';
    return shell('<span class="turn-tag">투표 결과</span><h2>'+esc(heading)+'</h2>'+sets.map((group,i)=>'<div class="results-line"><strong>'+esc(r.pair[i])+' · '+group.length+'표</strong><br>'+(group.join(', ')||'선택한 사람 없음')+'</div>').join('')+actions(btn('다른 질문으로 한 판','start'),btn('게임 목록','menu','quiet')),true)
  }
  const counts=players.map(()=>0);r.votes.forEach(i=>counts[i]++);const highest=Math.max(...counts),picks=counts.flatMap((v,i)=>v===highest?[i]:[]);
  const title=picks.length>1?'최다 득표가 동점이에요':picks[0]===r.secret?'찾았어요!':'정체를 숨겼어요!';
  const role=game.id==='liar'?'라이어':'다른 미션을 받은 사람';
  const answer=game.id==='liar'?'제시어 · '+esc(r.word):'공통 미션 · '+esc(r.pair[0])+'<br>다른 미션 · '+esc(r.pair[1]);
  shell('<span class="turn-tag">투표 결과</span><h2>'+title+'</h2><p>'+role+'은 <strong>'+name(r.secret)+'</strong></p><div class="results-line">'+answer+'</div><p>최다 득표 · '+picks.map(name).join(', ')+' ('+highest+'표)</p>'+actions(btn('한 판 더','start'),btn('게임 목록','menu','quiet')),true)
}
function playerSettings(){
  if(game)return;
  draft=[...players];nameFields();settings.showModal()
}
function nameFields(){
  $('#draft-count').textContent=draft.length+'명';$('#less').disabled=draft.length===2;$('#more').disabled=draft.length===12;
  $('#name-fields').innerHTML=draft.map((v,i)=>'<label>'+(i+1)+'번 자리<input aria-label="'+(i+1)+'번 참가자 이름" maxlength="12" autocomplete="off" data-index="'+i+'" value="'+esc(v)+'" placeholder="참가자 '+(i+1)+'"></label>').join('');
}
function privateCover(){
  const r=round;if(!r?.revealed)return;
  r.revealed=false;if(r.phase==='deal')deal();else if(r.phase==='vote')vote();
}
$('#name-fields').addEventListener('input',e=>{if(e.target.matches('input')){draft[Number(e.target.dataset.index)]=e.target.value;$('#name-fields').querySelectorAll('input').forEach(i=>i.setCustomValidity(''))}});
$('#less').onclick=()=>{if(draft.length>2){draft.pop();nameFields();fx.play('tap')}};
$('#more').onclick=()=>{if(draft.length<12){draft.push('참가자 '+(draft.length+1));nameFields();fx.play('tap')}};
$('#dismiss').onclick=()=>settings.close();
settings.addEventListener('close',()=>{if(!game)app.querySelector('[data-action="people"]')?.focus({preventScroll:true})});
$('#player-form').onsubmit=e=>{e.preventDefault();const next=draft.map((s,i)=>s.trim()||'참가자 '+(i+1));const duplicate=next.findIndex((v,i)=>next.indexOf(v)!==i);
  if(duplicate!==-1){const input=$('#name-fields').querySelectorAll('input')[duplicate];input.setCustomValidity('서로 구분할 수 있는 다른 이름을 적어 주세요.');input.reportValidity();return}
  if(players.length!==next.length)bombSeconds=bombLimit(next.length);
  players=next;try{localStorage.setItem(memberStore+'players',JSON.stringify(players))}catch{};settings.close();fx.play('turn');renderMenu()
};
$('#effects').innerHTML=icon('sound');
$('#effects').onclick=()=>{interruptWatch();privateCover();if(round?.phase!=='bite')fx.quiet();$('#audio-check').checked=fx.prefs.sound;$('#haptic-check').checked=fx.prefs.vibration;
  $('#haptic-check').disabled=typeof navigator.vibrate!=='function';
  $('#haptic-note').textContent=$('#haptic-check').disabled?'이 브라우저에서는 진동을 지원하지 않아요. 게임 효과음을 체험해 보세요.':'효과를 눌러 악어 입이 닫히는 순간을 체험해 보세요.';feedback.showModal()};
$('#fx-close').onclick=()=>feedback.close();$('#fx-test').onclick=()=>{fx.unlock();fx.play('snap')};
$('#audio-check').onchange=e=>fx.change('sound',e.target.checked);$('#haptic-check').onchange=e=>fx.change('vibration',e.target.checked);
function handle(action,value){
  const r=round;
  if(action==='filter'){filter=value;fx.play('tap');renderMenu();app.querySelector('.chip[aria-pressed=true]').focus({preventScroll:true});return}
  if(action==='random'||action==='open'){const eligible=games.filter(g=>g.min<=players.length);const id=action==='random'?eligible[rand(eligible.length)].id:value;lastMenuFocus=id;fx.play(id==='croc'?'tooth':'tap');return go(id)}
  if(game?.id==='bomb'){
    if(action==='bomb-setup'&&(r?.phase==='done'||r?.phase==='bomb-ready')){cleanup();return bombSetup()}
    if(!r&&(action==='random-bomb-time'||action==='confirm-bomb-time')){
      fx.play('tap');return readyBomb(action==='random-bomb-time');
    }
    if(action==='start-bomb')return startBomb();
  }
  if(game?.id==='stopwatch'&&action==='watch-setup'&&r?.phase==='done'){cleanup();return watchSetup()}
  if(game?.id==='truth'&&action==='truth-setup'&&r?.phase==='done'){cleanup();return intro()}
  if(game?.id==='truth'&&action==='truth-editor')return openTruthEditor();
  if(action==='menu')return go('menu');if(action==='people')return playerSettings();if(action==='start')return begin();if(!r)return;
  switch(action){
    case 'tooth':{const i=Number(value);if(r.lock||r.pressed.has(i))return;r.pressed.add(i);
      if(r.trap===i){
        r.lock=true;
        r.phase='bite';
        croc(true);
        fx.play('tooth');
        fx.startBite();
        return;
      }
      r.lastSafe=i;fx.play('tooth');r.turn=(r.turn+1)%players.length;return croc()}
    case 'ack-bite':
      if(r.phase!=='bite')return;
      fx.quiet();
      return end(players[r.turn]+' 당첨!','아픈 '+(r.trap+1)+'번 이빨을 눌렀어요. 들켰네요. 썸 탈 때도 이렇게 티 나요?',null);
    case 'set-bottle-table':return setBottleTable();
    case 'change-table':
      if(r.phase==='seating')return chooseBottleTable();
      return;
    case 'edit-player':{
      const player=Number(value);
      if(r.phase==='seating'&&Number.isInteger(player)&&player>=0&&player<r.positions.length){
        r.activePlayer=player;showBottle();$('.seat-surface').focus({preventScroll:true});
      }
      return;
    }
    case 'undo-seat':{
      if(r.phase!=='seating'||!r.seatHistory.length)return;
      const {player,previous}=r.seatHistory.pop();
      r.positions[player]=previous;r.activePlayer=player;showBottle();return;
    }
    case 'edit-seats':
      if(r.phase==='done')editBottleSeats();
      return;
    case 'spin':return spin();
    case 'brake':return brakeBottle();
    case 'pass-bomb':if(r.phase!=='play'||r.lock)return;r.turn=(r.turn+1)%players.length;fx.play('turn');return bomb();
    case 'watch-go':return startWatch();
    case 'watch-stop':return stopWatch();
    case 'watch-next':return nextWatch();
    case 'reveal':r.revealed=true;fx.play('flip');return deal();
    case 'hide':r.revealed=false;r.pos++;fx.play('deal');return r.pos===players.length?afterDeal():deal();
    case 'start-vote':return startVotes(game.id);
    case 'party-suggest':
      if(r.phase==='party-prompt'){
        const field=$('#party-question');
        field.value=draw(r.bank);field.setCustomValidity('');fx.play('flip');
      }
      return;
    case 'open-vote':if(r.phase!=='vote'||r.revealed)return;r.revealed=true;fx.play('flip');return vote();
    case 'cast':{
      if(r.phase!=='vote'||!r.revealed)return;
      const target=Number(value);
      if(value===''||!canVoteFor(target))return;
      if(r.voteKind==='imagevote')r.counts[target]++;else r.votes.push(target);
      r.revealed=false;r.pos++;fx.play('vote');return r.pos===players.length?votesDone():vote();
    }
    case 'new-prompt':r.custom=false;r.prompt=draw(prompts.kingChoices(r.bank,r.second!=null));fx.play('flip');return king();
    case 'royal':return revealKingOrder();
    case 'king-yes':case 'king-no':{
      const n=Number(value);
      if(r.phase!=='king-answer'||n!==[r.number,r.second].find(i=>!r.answers[i]))return;
      r.answers[n]=action==='king-yes';
      if(action==='king-no'){r.declined=n;r.phase='done';}
      else if(r.answers[r.number]&&r.answers[r.second])r.phase='done';
      return kingResult();
    }
    case 'truth-pick':return revealTruth(value);
    case 'truth-next':case 'truth-pass':
      if(r.phase!=='truth-answer')return;
      if(++r.turn===players.length)return end('모두 한 번씩 마쳤어요!','새로운 질문으로 다음 라운드를 즐겨요.');
      fx.play('turn');return dealTruth();
    case 'initial-go':return initialGo();case 'initial-ready':return initialReady();
    case 'word-ok':stopClock();r.turn=(r.turn+1)%r.alive.length;fx.play('turn');return initialReady();
    case 'word-out':return initialOut('중복·오답');
  }
}
document.addEventListener('click',event=>{
  if(round?.phase==='spinning'&&!event.target.closest('button,a,input,label,dialog'))brakeBottle();
},true);
app.addEventListener('click',e=>{
  const b=e.target.closest('button[data-action]');
  if(b&&!b.disabled)handle(b.dataset.action,b.dataset.value);
});
document.addEventListener('visibilitychange',()=>{lastStamp=performance.now();if(document.hidden){interruptWatch();privateCover()}
  else if(round?.phase==='bite')fx.startBite();
});
window.addEventListener('pagehide',()=>{interruptWatch();privateCover();fx.quiet()});
window.addEventListener('pageshow',()=>{if(round?.phase==='bite')fx.startBite()});
window.addEventListener('hashchange',route);route();
})();
