(() => {
'use strict';
const $=selector=>document.querySelector(selector);
const playerKey='oj.party.'+document.getElementById('access-content').dataset.member+'.players';
const turnOrderKey=playerKey+'.turnOrder';
const app=$('#app'), settings=$('#settings'), feedback=$('#feedback'), fx=window.PartyFX;
const entryRevision=new URL(location.href).searchParams.get('v')||'20261127-arcade-practice1';
let entryRequest=0;
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
const games=window.DrinkingTableView.localGames;
const pageIntroductions={
  shapematch:{
    heading:['녹색 동그라미가','보이면 누르세요.'],
    description:['휴대폰 한 대를 돌려가며 반응 시간을 재요.','가장 느린 사람이 당첨이에요.'],
    steps:[['차례 확인','휴대폰을 받아요'],['모양 확인','초록색 원을 기다려요'],['화면 터치','모두의 기록을 비교해요']],
    button:'게임 시작하기'
  },
  partyroulette:{
    heading:['탄창을 돌리고,','한 사람을 가리켜요.'],
    description:['불발이면 가리킨 사람에게 폰을 넘겨요.','팡! 하면 그 사람이 당첨이에요.'],
    steps:[['장전','참가자 수보다 한 칸 더 생겨요'],['회전','위에서 아래로 쓸어요'],['시작','방아쇠를 눌러요']],
    button:'장전 화면 열기'
  },
  liar:{
    heading:['힌트 속에 숨은','한 사람을 찾아요.'],
    description:['한 명만 제시어를 몰라요.','힌트를 듣고 라이어를 골라 보세요.'],
    steps:[['내 카드','혼자 확인해요'],['힌트 주기','정답은 비밀로'],['비밀 투표','한 명을 골라요']],
    button:'카드 받고 시작하기'
  },
  king:{
    heading:['오늘의 왕은','누구일까요?'],
    description:['왕이 번호와 미션을 골라요.','둘이 하는 미션은 함께 동의해요.'],
    steps:[['카드 확인','역할은 비밀로'],['왕의 선택','번호와 미션 선택'],['미션 공개','함께 확인해요']],
    button:'왕과 번호 뽑기'
  },
  initial:{
    heading:['두 글자 초성,','5초면 충분해요.'],
    description:['초성에 맞는 두 글자 단어를 말해요.','중복·오답·시간 초과는 탈락해요.'],
    steps:[['초성 확인','두 글자 단어'],['5초 도전','말하고 누르기'],['살아남기','마지막 한 명 승리']],
    button:'초성 대결 시작'
  },
  minority:{
    heading:['우리의 선택은','몇 대 몇일까요?'],
    description:['둘 중 하나를 몰래 골라요.','더 적게 선택된 쪽이 소수파예요.'],
    steps:[['선택지 정하기','목록 또는 직접 입력'],['비밀 투표','마음 가는 쪽으로'],['함께 공개','표수를 확인해요']],
    button:'선택지 정하기'
  },
  mission:{
    heading:['같은 듯 다른 몸짓,','한 명을 찾아요.'],
    description:['한 명만 다른 제시어를 받아요.','동시에 몸짓을 한 뒤 그 사람을 찾아요.'],
    steps:[['제시어 보기','혼자 확인해요'],['동시에 몸짓','말없이 표현해요'],['비밀 투표','다른 한 명 찾기']],
    button:'제시어 받고 시작하기'
  },
  fingers:{
    heading:['해당하면 접어요.','다섯 개면 당첨!'],
    description:['‘목걸이 한 사람 접어!’','해당하면 손가락 하나를 접어요.'],
    steps:[['조건 정하기','목록 또는 직접 입력'],['하나 접기','해당하면 선택'],['기록 확인','다 접으면 당첨']],
    button:'손가락 다섯 개로 시작'
  },
  imagevote:{
    heading:['이 질문에','딱 맞는 사람은?'],
    description:['질문을 읽고 한 사람에게 투표해요.','가장 많이 지목된 사람을 공개해요.'],
    steps:[['질문 정하기','추천 또는 직접'],['한 명 선택','몰래 한 표'],['결과 공개','함께 확인해요']],
    button:'질문 고르고 시작하기'
  },
  updown:{
    heading:['범위를 좁혀서,','숫자를 맞혀요.'],
    description:['업·다운 힌트를 따라 범위를 좁혀요.','1~100 사이의 정답을 먼저 맞혀 보세요.'],
    steps:[['숫자 입력','남은 범위 안에'],['업·다운','힌트를 따라요'],['정답 도전','먼저 맞혀요']],
    button:'숫자 맞히기 시작'
  }
};
const prompts=window.DrinkingPrompts;
const questionMenu=window.DrinkingQuestionMenu;
function rand(n){return Math.floor(Math.random()*n)}
function shuffled(items){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=rand(i+1);[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
const bags=new WeakMap();
function draw(items){if(!items.length)return '';if(!bags.get(items)?.length)bags.set(items,shuffled(items));return bags.get(items).pop()}
const truthDeck={mild:[],spicy:[]};
const truthSettings={mode:'spicy',showFlavor:false};
const truthTools=window.PartyTruthCards;
let preparedTruth=null;
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
  return '<img class="game-art '+cls+'" src="'+artPath(id)+'" alt="" draggable="false" decoding="async">';
}
function btn(label,action,cls='start',value=''){return '<button type="button" class="'+cls+'" data-action="'+action+'" data-value="'+esc(value)+'">'+esc(label)+'</button>'}
function actions(...buttons){return '<div class="actions">'+buttons.join('')+'</div>'}
function roundActions(...buttons){return '<div class="actions drinking-round-actions">'+buttons.join('')+'</div>'}
function choiceList(items,action){return '<div class="options">'+items.map(([value,label])=>btn(label,action,'choice',value)).join('')+'</div>'}
const defaultPlayers=()=>Array.from({length:4},(_,i)=>'참가자 '+(i+1));
let seatNames=defaultPlayers();
try{const p=JSON.parse(localStorage.getItem(playerKey));if(Array.isArray(p)&&p.length>=2&&p.length<=12&&p.every(n=>typeof n==='string'&&n.trim()&&n.length<=12)&&new Set(p).size===p.length)seatNames=p}catch{}
// Seat numbers follow the saved roster. Only turn order follows the host.
let players=seatNames;
try{
  const order=JSON.parse(localStorage.getItem(turnOrderKey));
  if(Array.isArray(order)&&order.length===seatNames.length&&seatNames.every(name=>order.includes(name)))players=order;
}catch{}
function hostFirst(host){return [host,...players.filter(name=>name!==host)]}
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
  shell('<h2><span class="suite-kicker">03 · 순발력</span>생각은 짧게,<br>대답은 빠르게.</h2><p>나라·음식 이름을 하나 말하고 넘겨요.<br>폭탄이 터질 때 차례인 사람이 당첨!</p>'+
    '<div class="bomb-timer"><div class="bomb-timer-head"><label for="bomb-seconds">기준 시간 <strong id="bomb-base"></strong></label>'+
    '<button type="button" class="quiet" data-action="random-bomb-time" aria-label="타이머 랜덤 선택">랜덤</button></div>'+
    '<input id="bomb-seconds" type="range" min="'+bombMinSeconds+'" max="'+limit+'" step="1" value="'+bombSeconds+'" aria-describedby="bomb-window"'+(limit===bombMinSeconds?' disabled':'')+'>'+
    '<div class="bomb-timer-limits"><span>'+timeLabel(bombMinSeconds)+'</span><span>'+players.length+'명 · 최대 '+timeLabel(limit)+'</span></div>'+
    '<p id="bomb-window" aria-live="polite"></p></div>'+
    actions(btn('이 시간으로 준비하기','confirm-bomb-time')),true);
  updateBombTimer(bombSeconds);
  $('#bomb-seconds').oninput=e=>updateBombTimer(Number(e.target.value));
}
function readyBomb(random){
  round={phase:'bomb-ready',turn:0,randomTime:random};
  const label=random?'랜덤 타이머':timeLabel(bombSeconds)+' 타이머';
  shell('<h2>'+label+'</h2><div class="bomb-launch">'+art('bomb')+btn('폭탄 시작','start-bomb')+'</div>'+
    actions(btn('시간 다시 정하기','bomb-setup','quiet')));
  app.querySelector('[data-action="start-bomb"]').focus({preventScroll:true});
}
async function loadRoundBank(r){
  const kind=game.id;
  const loaded=await prompts.refresh(kind);
  if(round!==r)return false;
  r.bank=loaded?prompts.list(kind):[];
  if(r.bank.length)return true;
  const message=loaded?'아직 등록된 내용이 없어요.':'내용을 불러오지 못했어요. 연결을 확인해 주세요.';
  shell('<h2>'+message+'</h2>'+roundActions(btn('게임 목록','menu','quiet'),btn('다시 시도',kind==='bomb'?'start-bomb':'start')));
  return false;
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
  timed(620,()=>end('펑! '+players[r.turn]+' 당첨','폭탄이 터질 때 폰을 들고 있던 사람이에요.',null))
}
const name=i=>esc(players[i]), tag=i=>'<span class="turn-tag">'+name(i)+' 차례</span>';
const cards=()=>games.filter(g=>filter==='전체'||filter===g.category);
function stopClock(){clearInterval(timer);timer=null}
function markLocalHost(){
  const r=round;
  let candidates=[];
  switch(game.id){
    case 'croc':case 'bomb':case 'secretcount':case 'updown':candidates=[r.turn];break;
    case 'bottle':candidates=[players.indexOf(seatNames[r.winningSeat])];break;
    case 'initial':candidates=r.alive;break;
    case 'king':candidates=[r.roles.indexOf(r.number),r.second==null?-1:r.roles.indexOf(r.second)];break;
    case 'liar':case 'mission':candidates=[r.secret];break;
    case 'fingers':candidates=players.map((_,i)=>r.fingers[i]===0?i:-1);break;
    case 'imagevote':candidates=players.map((_,i)=>r.counts[i]===Math.max(...r.counts)?i:-1);break;
    case 'shapematch':candidates=r.shapeWinners;break;
    case 'stopwatch':{
      const errors=r.records.map(v=>Math.abs(v-r.target));
      candidates=errors.map((v,i)=>v===Math.min(...errors)?i:-1);break;
    }
    case 'minority':{
      const a=r.votes.filter(v=>v===0).length,b=r.votes.length-a;
      if(a&&b&&a!==b)candidates=r.votes.map((v,i)=>v===(a<b?0:1)?i:-1);
      break;
    }
  }
  const seats=players.map((_,i)=>(i+1)%players.length);
  const next=seats.find(i=>candidates.includes(i))??seats[0];
  r.nextHost=players[next];
  try {
    const saved=JSON.parse(localStorage.getItem(playerKey)) ?? defaultPlayers();
    if (Array.isArray(saved) && saved.length===seatNames.length && seatNames.every((name,i)=>saved[i]===name)) {
      localStorage.setItem(turnOrderKey,JSON.stringify(hostFirst(r.nextHost)));
    }
  } catch {}
  window.DrinkingTableView?.result(app.querySelector('.play-body'),r.nextHost);
}
function cleanup(){
  round?.stopShape?.();
  round?.rouletteBoard?.destroy();
  if(round?.nextHost)players=hostFirst(round.nextHost);
  stopClock();fx.quiet();
  if(round?.watchFrame!=null)cancelAnimationFrame(round.watchFrame);
  if(round?.bottleFrame!=null)cancelAnimationFrame(round.bottleFrame);
  round=null;
}
function navigation(inGame){
  const back=$('#local-back');
  back.href=inGame?'#menu':'/world.html?tab=arcade';
  back.dataset.drinkingBack=inGame?'games':'arcade';
  back.querySelector('[data-local-back-label]').textContent=inGame?'술게임으로':'오락실로';
  $('.mode-back').hidden=inGame;
}
function renderMenu(){
  window.DrinkingPresentation?.leave();
  navigation(false);
  const preview=players.slice(0,3).map(esc).join(' · ')+(players.length>3?' 외 '+(players.length-3)+'명':'');
  const roster='<section class="main-roster" aria-label="함께할 참가자"><div><h2>참가자 <b>'+players.length+'명</b></h2>'+
    '<p>'+preview+'</p><p id="roster-feedback" role="status"></p></div>'+btn('참가자 설정','people','quiet')+'</section>';
  const count=cards().length;
  app.innerHTML='<section class="hero"><picture class="hero-art"><source media="(max-width: 720px)" srcset="art/hero-small.webp"><img src="art/hero.webp" width="1788" height="596" alt="" fetchpriority="high"></picture><div class="hero-copy"><h1>술게임</h1><p>한 대를 돌려가며 즐기는<br>게임 '+games.length+'가지</p><button class="hero-play" data-action="random">'+icon('random')+'랜덤 게임</button></div></section>'+roster+'<div class="catalog-head"><div class="section-title"><h2>게임 선택</h2><span class="num">'+String(count).padStart(2,'0')+'</span></div><div class="chips" aria-label="게임 분류">'+['전체','운과 감각','추리와 대화','순발력'].map(f=>'<button class="chip" data-action="filter" data-value="'+f+'" aria-pressed="'+(filter===f)+'">'+f+'</button>').join('')+'</div></div><section class="games" aria-label="게임 목록"></section><footer class="catalog-foot">오쭈다 술게임 · 테스트판</footer>';
  app.querySelector('.games').replaceChildren(...cards().map(g=>{
    const tile=window.DrinkingTableView.card(g);
    tile.dataset.action='open';tile.dataset.value=g.id;
    return tile;
  }));
}
function shell(body,scene=false){
  navigation(true);
  app.innerHTML='<article class="play-shell"><header class="round-head"><h1>'+art(game.id,'round-mark')+game.title+'</h1><span>'+players.length+'명 플레이</span></header>'+(scene&&game.id!=='secretcount'?'<div class="stage-art" style="--pastel:'+game.color+';--scene:url('+artPath(game.id)+')">'+art(game.id)+'</div>':'')+'<div class="play-body">'+body+'</div></article>';
  if(window.DrinkingTableView){
    app.querySelector('.round-head').replaceWith(window.DrinkingTableView.heading(game.id,game.title,players.length));
  }
  if(round?.phase==='done'&&game.id!=='partyroulette')markLocalHost();
  window.DrinkingGameScreen?.local(game.id,round,app);
}
function pageIntro(copy,enough){
  shell('<h2><span class="suite-kicker">'+game.num+' · '+esc(game.category)+'</span>'+copy.heading.map(esc).join('<br>')+'</h2>'+
    '<p>'+copy.description.map(esc).join('<br>')+'</p>'+
    '<ol class="suite-rules" aria-label="게임 순서">'+copy.steps.map(([title,description],i)=>
      '<li><span aria-hidden="true">0'+(i+1)+'</span><strong>'+esc(title)+'</strong><small>'+esc(description)+'</small></li>').join('')+'</ol>'+
    actions(enough?btn(copy.button,'start'):'<a class="quiet" href="#participants">참가자 설정하기</a>')+
    '<div class="suite-meta">'+(enough?game.min+'~12명 · 한 대로 함께':game.min+'명부터 함께할 수 있어요.')+'</div>',true);
}
function intro(){const enough=players.length>=game.min;
  if(game.id==='croc'){
    const steps=[['차례대로','휴대폰을 돌려가며'],['하나씩','남은 이빨을 눌러요'],['딱!','입이 닫히면 당첨']];
    shell('<div class="croc-kicker">01 · 운과 감각</div><h2>아픈 이빨은<br>딱 하나.</h2>'+
      '<p>하나씩 눌러 보세요.<br>입이 닫히면 누른 사람이 당첨!</p>'+
      '<ol class="croc-rules" aria-label="게임 순서">'+steps.map(([title,description],i)=>
        '<li><span aria-hidden="true">0'+(i+1)+'</span><strong>'+title+'</strong><small>'+description+'</small></li>').join('')+'</ol>'+
      actions(enough?btn('게임 시작하기','start'):'<a class="quiet" href="#participants">참가자 설정하기</a>')+
      '<div class="croc-meta">2~12명 · 한 대로 함께</div>',true);
    return;
  }
  if(game.id==='bottle'){
    const steps=[['자리 표시','앉은 곳을 표시'],['돌리기','버튼을 눌러요'],['멈추기','돌아갈 때 터치']];
    shell('<div class="bottle-kicker">02 · 운과 감각</div><h2>병 끝이 가리키는<br>오늘의 주인공.</h2>'+
      '<p>돌아가는 병을 터치해 멈춰요.<br>병 입구가 가리키는 사람이 당첨!</p>'+
      '<ol class="bottle-rules" aria-label="게임 순서">'+steps.map(([title,description],i)=>
        '<li><span aria-hidden="true">0'+(i+1)+'</span><strong>'+title+'</strong><small>'+description+'</small></li>').join('')+'</ol>'+
      actions(enough?btn('자리 정하고 시작하기','start'):'<a class="quiet" href="#participants">참가자 설정하기</a>')+
      '<div class="bottle-meta">2~12명 · 한 대로 함께</div>',true);
    return;
  }
  if(game.id==='secretcount')return secretSetup();
  if(game.id==='bomb')return bombSetup();
  if(game.id==='stopwatch')return watchSetup();
  if(game.id==='truth'){
    shell('<h2><span class="suite-kicker">07 · 추리와 대화</span>오늘은 조금 더<br>솔직하게.</h2>'+
      '<p>내 차례에 카드 한 장을 뒤집고 질문에 답해요.<br>세 바퀴를 마치면 다 같이 한잔!</p>'+
      actions(btn('게임 시작','start')),true);
    app.querySelector('.round-head').insertAdjacentHTML('beforeend',btn('설정','truth-settings','quiet truth-settings-link'));
    return;
  }
  if(pageIntroductions[game.id])return pageIntro(pageIntroductions[game.id],enough);
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
  game=games.find(g=>g.id===id)||null;
  if(game){
    lastMenuFocus=game.id;
    intro();
    scrollTo(0,0);
    app.focus({preventScroll:true});
  }else{
    renderMenu();
    scrollTo(0,0);
    if(lastMenuFocus)app.querySelector('[data-action="open"][data-value="'+lastMenuFocus+'"]')?.focus({preventScroll:true});
  }
}
function go(id){if(id===location.hash.slice(1))route();else location.hash=id}
async function openLocal(id){
  const refresh=window.OjjudaDrinkingEntry;
  if(!refresh)return go(id);
  const request=++entryRequest,from=location.href;
  window.DrinkingArrival?.show();
  const moved=await refresh.navigateLocal(id,entryRevision);
  if(!moved)window.DrinkingArrival?.hide();
  if(moved||request!==entryRequest||location.href!==from||app.querySelector('.play-shell')||document.querySelector('dialog[open]'))return;
  go(id);
}
function end(title,desc,sound='result'){
  stopClock();round.phase='done';if(sound)fx.play(sound);
  shell('<span class="turn-tag">라운드 결과</span><h2>'+esc(title)+'</h2><p>'+esc(desc)+'</p>'+roundActions(btn('게임 목록','menu','quiet'),btn('한 판 더',game.id==='bomb'?'bomb-setup':game.id==='truth'?'truth-setup':'start')),true)
}
function secretSetup(){
  cleanup();
  const ui=window.SecretCountControls,n=players.length;
  shell(ui.setup(n));
  ui.bindSetup(app,n,target=>{
    const {min,max}=ui.limits(n);
    round={phase:'press',turn:0,total:0,used:0,target:target??(min+rand(max-min+1))};
    secretPlay();
  });
}
function secretPlay(){
  const r=round;
  const controls=window.SecretCountControls;
  shell(controls.controls(true,r.used,r.turn,name(r.turn)));
  const press=app.querySelector('[data-sc-press]'),pass=app.querySelector('[data-sc-pass]');
  press.onclick=()=>{
    if(round!==r||r.phase!=='press'||r.used>=3)return;
    const until=controls.pressFeedback(press);
    r.total++;r.used++;
    press.toggleAttribute('data-sc-held',r.used===3);
    if(r.total===r.target){
      r.phase='finishing';press.disabled=true;pass.disabled=true;
      setTimeout(()=>{if(round===r)end(players[r.turn]+'님 당첨!','비밀 숫자는 '+r.target+'였어요.');},until-performance.now());
      return;
    }
    press.disabled=r.used===3;pass.disabled=false;
  };
  pass.onclick=()=>{
    if(round!==r||r.phase!=='press'||!r.used)return;
    r.used=0;r.turn=(r.turn+1)%players.length;fx.play('turn');
    secretPlay();
  };
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
  if(game.id==='secretcount')return secretSetup();
  if(players.length<game.min)return go('participants');
  cleanup();round={turn:0,phase:'play'};const r=round;
  const cardGame=['liar','mission','king','truth','minority','fingers','imagevote'].includes(game.id);
  fx.play(game.id==='croc'?'tooth':cardGame?'deal':'tap');
  if(prompts.managed(game.id)&&!['truth','fingers','minority','king','imagevote'].includes(game.id)){
    const button=app.querySelector('[data-action="start"]');
    if(button){button.disabled=true;button.textContent='불러오는 중…';}
    if(!await loadRoundBank(r))return;
  }
  switch(game.id){
    case 'partyroulette':{
      shell(window.PartyRouletteBoard.markup());
      const model=window.PartyRouletteBoard.model(players.length);
      r.rouletteBoard=window.PartyRouletteBoard.mount(app.querySelector('.roulette-table'),model,{
        finish:()=>{
          if(r!==round)return;
          r.rouletteBoard.destroy();
          end('가리킨 사람이 당첨!','방금 휴대폰이 가리킨 사람이 이번 판의 당첨자예요.',null);
        }
      });
      return;
    }
    case 'croc':r.trap=rand(CROC_TOOTH_COUNT);r.pressed=new Set();return croc();
    case 'bottle':return chooseBottleTable();
    case 'shapematch':r.records=[];return shapeReady();
    case 'stopwatch':
      r.target=watchTenths*10;r.records=[];
      return readyWatch();
    case 'truth':r.lap=1;r.truthSettings={...truthSettings};return dealTruth();
    case 'fingers':
      r.fingers=players.map(()=>5);
      return fingerPrompt();
    case 'imagevote':return chooseVotePrompt();
    case 'updown':
      r.answer=1+rand(100);r.low=1;r.high=100;r.guesses=0;
      return upDown();
    case 'initial':r.alive=players.map((_,i)=>i);r.initial=draw(r.bank);return initialReady();
    case 'minority':return chooseVotePrompt();
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
  const safe=r.lastSafe!=null?(r.lastSafe+1)+'번은 통과! · ':'';
  const hint=snap?(r.trap+1)+'번이 아픈 이빨!':safe+remaining;
  shell(tag(r.turn)+'<h2>'+(snap?'딱! 악어한테 물렸어요':'이빨 하나를 골라요')+'</h2><p class="croc-hint" role="status">'+hint+'</p>'+
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
  const positions=seatNames.map((_,i)=>sameTable?round.positions[i]??null:null);
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
    const label=esc(seatNames[i]),attrs='data-seat="'+i+'" style="'+seatStyle(point)+'"';
    if(picking)return '<button class="seat" type="button" '+attrs+' data-action="edit-player" data-value="'+i+'" aria-label="'+label+' 자리 옮기기" aria-pressed="'+(i===r.activePlayer)+'">'+(i+1)+'</button>';
    return '<span class="seat" '+attrs+' title="'+label+'">'+(i+1)+'</span>';
  }).join('');
  const roster=seatNames.map((name,i)=>'<li>'+(picking?'<button data-action="edit-player" data-value="'+i+'" aria-pressed="'+(i===r.activePlayer)+'" aria-label="'+esc(name)+(r.positions[i]?' 자리 옮기기':' 자리 놓기')+'">':'')+
    '<b>'+(i+1)+'</b>'+esc(name)+(picking?'</button>':'')+'</li>').join('');
  const heading=picking?(complete?'자리를 확인해 주세요':esc(seatNames[r.activePlayer])+'님의 자리는 어디인가요?'):'술병을 돌려 보세요';
  const hint=picking?(complete?'자리를 끌어 옮길 수 있어요. 준비되면 술병을 돌려요.':'테이블에서 앉은 곳을 누르세요. 다른 이름을 골라 자리를 정할 수도 있어요.'):'화면을 터치하면 병이 서서히 멈춰요.';
  const controls=picking?actions(complete?btn('술병 돌리기','spin'):'',r.seatHistory.length?btn('한 번 되돌리기','undo-seat','quiet'):'',btn('테이블 다시 선택','change-table','quiet')):'';
  const ratio=bottleTables[r.table].ratio,vertical=r.direction==='vertical';
  const size=ratio===1?340:vertical?490/ratio:490;
  const surface=picking?'<button type="button" class="seat-surface" aria-label="'+esc(seatNames[r.activePlayer])+' 자리 놓기. 방향키로 위치를 정한 뒤 엔터를 누르세요."></button>':'';
  shell('<h2 id="bottle-title">'+heading+'</h2><p id="bottle-hint" aria-live="polite">'+hint+'</p>'+
    '<div class="dial bottle-dial table-'+r.table+' '+r.direction+'" style="aspect-ratio:'+(vertical?1/ratio:ratio)+';--board-width:'+size+'px">'+art('pointer')+surface+seats+'</div>'+
    '<div id="spin-status">'+controls+'</div><ul class="bottle-seats" aria-label="참가자 자리">'+roster+'</ul>');
  if(picking)bindSeatBoard();
}
function spin(){
  const r=round;
  if(!['seating','done'].includes(r.phase)||!r.positions.every(Boolean))return;
  if(r.nextHost){
    players=hostFirst(r.nextHost);
    r.seatHistory=[];
    delete r.nextHost;
  }
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
  r.winningSeat=rand(seatNames.length);
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
    $('#bottle-title').textContent=seatNames[seat]+'님 당첨!';
    $('#bottle-hint').textContent='병 입구가 '+(seat+1)+'번 자리를 가리켰어요.';
    $('#spin-status').innerHTML=roundActions(btn('게임 목록','menu','quiet'),btn('자리 옮기기','edit-seats','quiet'),btn('다시 돌리기','spin'));
    fx.play('finish');
    markLocalHost();
    window.DrinkingGameScreen?.local(game.id,r,app);
    return;
  }
  const tick=Math.floor(r.angle/180);
  if(tick!==r.lastTick&&!feedback.open)fx.play('spin');
  r.lastTick=tick;
  r.bottleFrame=requestAnimationFrame(animateBottle);
}
function bomb(){const r=round;shell(tag(r.turn)+'<h2>'+esc(r.topic)+'</h2>'+art('bomb','mini-art pulse')+'<p>주제에 맞는 답을 하나 말하고 바로 넘기세요. 이미 나온 답은 안 돼요.</p>'+actions(btn('말했어요 · 다음 사람','pass-bomb')))}
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
  shell('<h2><span class="suite-kicker">04 · 운과 감각</span>숫자가 사라지면,<br>감각으로 멈춰요.</h2><p>1초 뒤 숫자가 가려져요.<br>목표 시간에 가장 가깝게 멈춰 보세요.</p>'+
    '<div class="watch-config"><label for="watch-target">목표 시간</label>'+
    '<div class="watch-step"><button id="watch-minus" type="button" aria-label="0.1초 줄이기">−</button>'+
    '<output id="watch-setting" for="watch-target"></output>'+
    '<button id="watch-plus" type="button" aria-label="0.1초 늘리기">＋</button></div>'+
    '<input id="watch-target" type="range" min="5.0" max="10.0" step="0.1" value="'+(watchTenths/10).toFixed(1)+'">'+
    '<div class="watch-limits"><span>5.0초</span><span>10.0초</span></div></div>'+
    actions(btn('이 시간으로 시작하기','start')));
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
function shapeReady(){
  round.phase='shape-ready';
  shell(tag(round.turn)+'<h2>휴대폰을 받아 주세요</h2><p>녹색 동그라미가 보이면 화면을 누르세요.</p>'+
    actions(btn('내 차례 시작','shape-go')));
}

function shapeGo(){
  const r=round;
  if(r?.phase!=='shape-ready'||document.hidden)return;
  r.phase='shape-live';
  shell(tag(r.turn)+'<h2>녹색 동그라미를 찾아요</h2>'+
    '<div class="sm-field" role="button" tabindex="0" aria-label="도형이 들어오는 게임 화면">'+
    '<span class="sm-piece" hidden></span><img class="sm-ghost" src="/games/shapematch/ghost.svg" alt="귀신" hidden>'+
    '<span class="sm-hint"></span><span class="sm-live" aria-live="polite"></span></div>');
  r.stopShape=window.OjjudaShapeMatch.play(app.querySelector('.sm-field'),{
    scare:()=>fx.play('shape-scare'),
    interrupt:()=>{if(r===round&&r.phase==='shape-live'){fx.quiet();r.stopShape=null;shapeReady()}},
    finish:ms=>{
      if(r!==round||r.phase!=='shape-live')return;
      r.stopShape=null;r.records.push(ms);r.phase='shape-score';fx.play('stop');
      shell(tag(r.turn)+'<h2>'+ms+' ms</h2><p>녹색 동그라미를 보고 누르기까지 걸린 시간이에요.</p>'+
        actions(btn(r.turn+1<players.length?'다음 참가자':'당첨자 보기','shape-next')));
      app.querySelector('[data-action="shape-next"]').focus({preventScroll:true});
    }
  });
}

function nextShape(){
  const r=round;
  if(r?.phase!=='shape-score')return;
  if(r.turn+1<players.length){r.turn++;return shapeReady()}
  const slowest=Math.max(...r.records);
  r.shapeWinners=r.records.flatMap((ms,i)=>ms===slowest?[i]:[]);
  const title=r.shapeWinners.map(name).join(' · ')+(r.shapeWinners.length>1?' 공동 당첨!':' 당첨!');
  const rows=r.records.map((ms,i)=>{
    const winner=ms===slowest;
    const badge=winner?' <small>당첨</small>':'';
    return '<tr'+(winner?' class="sm-slowest"':'')+'><th scope="row">'+name(i)+badge+'</th> <td>'+ms+' ms</td></tr>';
  }).join('');
  r.phase='done';fx.play('result');
  shell('<span class="turn-tag">라운드 결과</span><h2>'+title+'</h2>'+
    '<p>가장 느린 반응 시간은 '+slowest+' ms예요.</p>'+
    '<table class="sm-results" aria-label="참가자별 반응 시간"><thead><tr>'+
      '<th scope="col">참가자</th><th scope="col">반응 시간</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    roundActions(btn('게임 목록','menu','quiet'),btn('한 판 더','start')));
}

function startWatch(){
  const r=round;
  if(r?.phase!=='watch-ready'||document.hidden||feedback.open)return;
  r.phase='watch-running';watchScreen(true);fx.play('watch');
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
    '<p>목표 시간에 가장 가깝게 멈췄어요.</p><p>목표 '+(r.target/100).toFixed(1)+'초</p><table class="watch-results"><thead><tr><th>참가자</th><th>기록</th><th>목표와 차이</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    roundActions(btn('게임 목록','menu','quiet'),btn('한 판 더','watch-setup')));
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
    r.phase='king';r.number=1;r.second=null;return king();
  }
  r.phase='talk';
  shell('<h2>'+(game.id==='liar'?'한 사람씩 힌트를 말해요':'하나, 둘, 셋! 동시에 흉내 내요')+'</h2><p>'+(game.id==='liar'?'정답과 초성은 말하지 마세요. 각자 힌트를 하나씩 주고, 누가 단어를 모르는지 찾아봐요.':'말이나 소품 없이 혼자 표현해 주세요. 다른 사람에게 닿지 않아요. 누가 다른 동작을 했나요?')+'</p>'+actions(btn('비밀 투표 시작','start-vote')),true)
}
function king(){
  const r=round,count=players.length-1;
  const options=(selected,exclude)=>Array.from({length:count},(_,i)=>i+1).filter(n=>n!==exclude)
    .map(n=>'<option value="'+n+'"'+(n===selected?' selected':'')+'>'+n+'번</option>').join('');
  const secondOptions=()=>'<option value="">한 명에게만</option>'+options(r.second,r.number);
  const second=count>1?'<label>두 번째 번호 (선택)<select class="field" id="king-second">'+secondOptions()+'</select></label>':'';
  shell('<span class="turn-tag">오늘의 왕 · '+name(r.king)+'</span><h2>번호와 미션을 골라 주세요</h2>'+
    '<form id="king-order-form"><div class="king-numbers"><label>첫 번째 번호<select class="field" id="king-number">'+options(r.number)+'</select></label>'+second+'</div>'+
    questionMenu.markup('king','명령 내리기')+'</form>',true);
  const display=mission=>questionMenu.kingMission(mission,r.number,r.second);
  const refresh=questionMenu.mount($('#king-order-form'),{kind:'king',display,load:()=>questionMenu.catalog('king',r.second!=null),apply:(mission,manual)=>{
    if(round!==r||r.phase!=='king')return false;
    if(manual)prompts.submit('king',mission);
    r.prompt=manual?mission:display(mission);r.answers={};
    r.phase=r.second==null?'done':'king-answer';fx.play('king');kingResult();
  }});
  function switchRecipients(second){
    const changed=(r.second==null)!==(second==null);
    r.second=second;void refresh({labelsOnly:!changed});
  }
  $('#king-number').onchange=e=>{
    r.number=Number(e.target.value);
    switchRecipients(r.second===r.number?null:r.second);
    if(count>1)$('#king-second').innerHTML=secondOptions();
  };
  if(count>1)$('#king-second').onchange=e=>switchRecipients(Number(e.target.value)||null);
}
function kingResult(){
  const r=round,numbers=r.second==null?[r.number]:[r.number,r.second];
  const recipients=numbers.map(n=>'<div><dt>카드 '+n+'번</dt><dd>'+name(r.roles.indexOf(n))+'</dd></div>').join('');
  const next=numbers.find(n=>!r.answers[n]);
  let footer=roundActions(btn('게임 목록','menu','quiet'),btn('한 판 더','start'));
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
function showTruthSettings(){
  shell('<h2 tabindex="-1" id="truth-settings-title">진실게임 설정</h2>'+truthTools.settingsForm(truthSettings)+
    '<p id="prepared-truth" role="status"></p>'+
    actions(btn('질문 고르기','truth-choose','quiet'),btn('질문 카드 등록','truth-editor','quiet'))+
    actions(btn('설정 완료','truth-intro')));
  $('#local-back [data-local-back-label]').textContent='진실게임으로';
  truthTools.bindSettings(truthSettings);
  const summary=$('#prepared-truth');
  function showPrepared(){
    if(preparedTruth&&!truthTools.enabledFlavors(truthSettings.mode).includes(preparedTruth.flavor))preparedTruth=null;
    summary.textContent=preparedTruth?'준비한 질문 · '+preparedTruth.question:'';
    summary.hidden=!preparedTruth;
  }
  app.querySelector('.truth-settings').addEventListener('change',showPrepared);
  showPrepared();
  $('#truth-settings-title').focus({preventScroll:true});
}
function chooseTruthQuestion(){
  const flavors=truthTools.enabledFlavors(truthSettings.mode);
  shell('<h2 tabindex="-1" id="truth-choose-title">질문 고르기</h2><p>다음 게임의 첫 두 장 중 한 장에 넣을 질문을 골라요.</p>'+
    '<form id="truth-prompt">'+questionMenu.markup('truth','카드에 넣기',flavors)+'</form>'+
    actions(btn('설정으로','truth-settings','quiet')));
  $('#local-back [data-local-back-label]').textContent='설정으로';
  questionMenu.mount($('#truth-prompt'),{kind:'truth',load:async()=>{
    const loaded=await prompts.refresh('truth');
    const deck=truthTools.deck(loaded?prompts.truth():{mild:[],spicy:[]});
    if(!loaded&&!flavors.some(flavor=>deck[flavor].length))throw Error('catalog unavailable');
    return deck;
  },apply:(question,manual,flavor)=>{
    preparedTruth={question,flavor,manual};
    if(manual)prompts.submit('truth',question,flavor);
    showTruthSettings();
  }});
  $('#truth-choose-title').focus({preventScroll:true});
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
  input.value='';input.focus();
  truthMessage.textContent=result.saved?'이 기기의 질문에 추가했어요.':'이번 플레이에 사용할 질문으로 추가했어요.';
};
function truthTurn(r){
  return '<span class="turn-tag">'+r.lap+'/3바퀴 · '+name(r.turn)+' 차례</span>';
}
function dealTruth(){
  const r=round,{mode,showFlavor}=r.truthSettings;
  r.phase='truth-pick';
  const flavors=mode==='mixed'?shuffled(['mild','spicy']):[mode,mode];
  r.truthCards=flavors.map(flavor=>({flavor,question:''}));
  const prepared=r.turn===0?preparedTruth:null;
  if(prepared){
    const matches=r.truthCards.filter(card=>card.flavor===prepared.flavor);
    if(matches.length)matches[rand(matches.length)].prepared=prepared;
    preparedTruth=null;
  }
  const cards=r.truthCards.map(({flavor},i)=>{
    const taste=showFlavor?flavor:null;
    return '<button type="button" class="truth-back" disabled data-action="truth-pick" data-value="'+i+
      '" aria-label="'+truthTools.sideName(i,taste)+'">'+art('back')+truthTools.cardLabel(taste)+'</button>';
  }).join('');
  shell(truthTurn(r)+'<h2 tabindex="-1" id="truth-title">카드 한 장을 골라 주세요</h2>'+
    '<div class="truth-pair">'+cards+'</div><p id="truth-load" role="status">카드를 준비하고 있어요.</p>'+
    '<button type="button" class="quiet" id="truth-retry" hidden>다시 불러오기</button>'+
    '<button type="button" class="quiet" data-action="truth-reconfigure" hidden>설정으로</button>');
  const status=$('#truth-load'),retry=$('#truth-retry');
  async function loadHand(){
    retry.hidden=true;
    status.hidden=false;status.textContent='카드를 준비하고 있어요.';
    const loaded=await prompts.refresh('truth');
    if(!status.isConnected)return;
    refreshTruthDeck(loaded?prompts.truth():{mild:[],spicy:[]});
    for(const card of r.truthCards){
      const selected=card.prepared;
      if(selected&&(selected.manual||truthDeck[card.flavor].includes(selected.question)))card.question=selected.question;
    }
    for(const [i,card] of r.truthCards.entries()){
      if(!card.question){
        const deck=truthDeck[card.flavor],other=r.truthCards[1-i];
        card.question=draw(deck);
        if(deck.length>1&&other.question===card.question)card.question=draw(deck.filter(q=>q!==other.question));
      }
      app.querySelector('[data-action="truth-pick"][data-value="'+i+'"]').disabled=!card.question;
    }
    const ready=r.truthCards.every(card=>card.question);
    retry.hidden=ready;
    status.hidden=ready;
    if(!ready)status.textContent=loaded?'이 수위의 질문이 부족해요. 설정에서 질문을 추가할 수 있어요.':'카드를 다 불러오지 못했어요.';
    app.querySelector('[data-action="truth-reconfigure"]').hidden=ready;
  }
  retry.onclick=loadHand;
  void loadHand();
  $('#truth-title').focus({preventScroll:true});
}
function revealTruth(value){
  if(round.phase!=='truth-pick'||(value!=='0'&&value!=='1'))return;
  const card=round.truthCards[Number(value)];
  if(card.question)showTruthQuestion(round,card.flavor==='spicy',card.question);
}
function showTruthQuestion(r,spicy,question){
  r.phase='truth-answer';fx.play('truth');
  shell(truthTurn(r)+'<div class="truth-front '+(spicy?'truth-spicy':'truth-mild')+'">'+
    '<h2 tabindex="-1" id="truth-title">'+(spicy?'빨간맛':'순한맛')+'</h2><p>'+esc(question)+'</p></div>'+
    actions(btn('답했어요','truth-next'),btn('패스','truth-pass','quiet')));
  $('#truth-title').focus({preventScroll:true});
}
function initialReady(){
  const r=round;r.phase='initial-ready';const turn=r.alive[r.turn];
  shell(tag(turn)+'<h2>준비되면 시작하세요</h2><p>초성 <b>'+esc(r.initial)+'</b> · 남은 사람 '+r.alive.length+'명<br>5초 안에 두 글자 단어를 말해요. 같은 초성에서 이미 나온 단어는 안 돼요.</p>'+actions(btn('5초 시작','initial-go')),true)
}
function initialGo(){
  const r=round;r.phase='initial-live';shell(tag(r.alive[r.turn])+'<h2>'+esc(r.initial)+'</h2><p>새 단어를 소리 내어 말해요.</p><div class="countdown" id="seconds">5</div>'+actions(btn('말했어요','word-ok'),btn('중복·오답','word-out','quiet')));
  fx.play('count');timed(5000,()=>initialOut('시간 초과'),1000,b=>{$('#seconds').textContent=b;fx.play('count')})
}
function initialOut(reason){
  stopClock();const r=round,who=r.alive.splice(r.turn,1)[0];if(r.alive.length===1)return end(players[r.alive[0]]+'님 승리!',players[who]+'님이 탈락했어요. ('+reason+')');
  r.turn%=r.alive.length;r.initial=draw(r.bank);r.phase='intermission';fx.play('snap');
  shell('<span class="turn-tag">'+esc(reason)+'</span><h2>'+name(who)+'님 탈락</h2><p>새 초성으로 이어갑니다. '+r.alive.length+'명이 남았어요.</p>'+actions(btn('다음 차례','initial-next')))
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
    if(guess===r.answer)return end(players[r.turn]+'님 정답!','숨은 숫자는 '+guess+'! '+r.guesses+'번 만에 맞혔어요.');
    if(guess<r.answer)r.low=guess+1;else r.high=guess-1;
    r.turn=(r.turn+1)%players.length;fx.play('turn');upDown(guess);
  };
}
function fingerPrompt(){
  const r=round,turn=r.turn,picker=window.FingerConditions;
  r.phase='party-prompt';
  shell(tag(turn)+'<h2>접을 지시를 정해 주세요</h2><form class="party-prompt" id="party-prompt">'+picker.markup()+
    '<button class="start" type="submit" disabled>이 지시로 시작</button></form>'+fingerScoreboard());
  picker.mount($('#party-prompt'),picker.draft(),()=>prompts.fingerBank(),(prompt,manual)=>{
    if(round!==r||r.phase!=='party-prompt'||r.turn!==turn)return;
    if(manual)prompts.submit('fingers',prompt);
    r.prompt=prompt;fx.play('deal');showFold(r,prompt);
  });
}
function showFold(r,prompt){
  r.phase='fold';
  shell(tag(r.turn)+'<h2>'+esc(prompt)+'</h2><p>조건에 해당해서 접겠다는 사람만 골라 주세요. 패스한 사람은 고르지 않아요.</p>'+
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
    fx.play('turn');fingerPrompt();
  };
}
function chooseVotePrompt(){
  const r=round,kind=game.id,paired=kind==='minority';
  r.phase='party-prompt';
  shell('<h2>'+(paired?'투표할 선택지를 정해 주세요':'지목할 질문을 정해 주세요')+'</h2>'+
    '<form id="party-prompt">'+questionMenu.markup(kind,'비밀 투표 시작')+'</form>');
  questionMenu.mount($('#party-prompt'),{kind,load:()=>questionMenu.catalog(kind),apply:(value,manual)=>{
    if(round!==r||r.phase!=='party-prompt')return false;
    if(paired)r.pair=value;
    else{
      r.prompt=value;
      if(manual)prompts.submit(kind,value);
    }
    fx.play('deal');startVotes(kind);
  }});
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
  shell('<span class="turn-tag">비공개 · '+(r.pos+1)+' / '+players.length+'</span><h2>'+name(r.pos)+'님의 선택</h2><p>'+(r.voteKind==='imagevote'?esc(r.prompt)+'<br>'+(players.length===2?'둘이 할 때는 나도 고를 수 있어요.':'나를 제외한 한 명을 골라요.'):r.voteKind==='minority'?'둘 중 하나만 고른다면?':'가장 의심되는 한 명을 골라 주세요.')+'</p>'+choiceList(items,'cast'));
}
function votesDone(){
  const r=round;r.phase='done';fx.play('result');
  if(r.voteKind==='imagevote'){
    const most=Math.max(...r.counts),top=players.filter((_,i)=>r.counts[i]===most);
    const rows=players.map((_,i)=>'<li><span>'+name(i)+'</span><b>'+r.counts[i]+'표</b></li>').join('');
    return shell('<span class="turn-tag">투표 결과</span><h2>'+top.map(esc).join(' · ')+(top.length>1?' 공동 1위':'님이 가장 많이 지목됐어요')+'</h2>'+
      '<p>'+esc(r.prompt)+'</p><ul class="party-scores" aria-label="참가자별 득표수">'+rows+'</ul>'+
      roundActions(btn('게임 목록','menu','quiet'),btn('새 질문으로 한 판 더','start')),true);
  }
  if(r.voteKind==='minority'){
    const sets=[[],[]];r.votes.forEach((v,i)=>sets[v].push(name(i)));
    const [a,b]=sets.map(group=>group.length);
    const heading=a===b?'정확히 반반!':a*b===0?'모두 같은 선택!':'소수파는 '+r.pair[a<b?0:1]+'!';
    return shell('<span class="turn-tag">투표 결과</span><h2>'+esc(heading)+'</h2>'+sets.map((group,i)=>'<div class="results-line"><strong>'+esc(r.pair[i])+' · '+group.length+'표</strong><br>'+(group.join(', ')||'선택한 사람 없음')+'</div>').join('')+roundActions(btn('게임 목록','menu','quiet'),btn('다른 질문으로 한 판','start')),true)
  }
  const counts=players.map(()=>0);r.votes.forEach(i=>counts[i]++);const highest=Math.max(...counts),picks=counts.flatMap((v,i)=>v===highest?[i]:[]);
  const title=picks.length>1?'최다 득표가 동점이에요':picks[0]===r.secret?'찾았어요!':'정체를 숨겼어요!';
  const role=game.id==='liar'?'라이어':'다른 미션을 받은 사람';
  const answer=game.id==='liar'?'제시어 · '+esc(r.word):'공통 미션 · '+esc(r.pair[0])+'<br>다른 미션 · '+esc(r.pair[1]);
  shell('<span class="turn-tag">투표 결과</span><h2>'+title+'</h2><p>'+role+'은 <strong>'+name(r.secret)+'</strong></p><div class="results-line">'+answer+'</div><p>최다 득표 · '+picks.map(name).join(', ')+' ('+highest+'표)</p>'+roundActions(btn('게임 목록','menu','quiet'),btn('한 판 더','start')),true)
}
function playerSettings(){
  if(game)return;
  $('#player-status').textContent='';
  draft=[...seatNames];nameFields();settings.showModal()
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
function applyPlayers(next){
  if(players.length!==next.length)bombSeconds=bombLimit(next.length);
  seatNames=next;
  players=next;
  renderMenu();
}
$('#reset-players').onclick=()=>{
  try { localStorage.removeItem(turnOrderKey); localStorage.removeItem(playerKey); }
  catch {
    $('#player-status').textContent='저장한 이름을 지우지 못했어요. 다시 시도해 주세요.';
    return;
  }
  applyPlayers(defaultPlayers());
  draft=[...seatNames];
  nameFields();
  $('#player-status').textContent='기본 참가자 4명으로 초기화했어요.';
};
$('#player-form').onsubmit=e=>{
  e.preventDefault();
  const next=draft.map((s,i)=>s.trim()||'참가자 '+(i+1));
  const duplicate=next.findIndex((v,i)=>next.indexOf(v)!==i);
  if(duplicate!==-1){
    const input=$('#name-fields').querySelectorAll('input')[duplicate];
    input.setCustomValidity('서로 구분할 수 있는 다른 이름을 적어 주세요.');
    input.reportValidity();
    return;
  }
  let message='참가자 '+next.length+'명을 저장했어요.';
  try { localStorage.removeItem(turnOrderKey); localStorage.setItem(playerKey,JSON.stringify(next)); }
  catch { message='이 기기에 저장하지 못했어요. 이번에는 입력한 이름으로 플레이해요.'; }
  applyPlayers(next);
  settings.close();
  fx.play('turn');
  $('#roster-feedback').textContent=message;
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
  if(action==='random'||action==='open'){const eligible=games.filter(g=>g.min<=players.length);const id=action==='random'?eligible[rand(eligible.length)].id:value;fx.play(id==='croc'?'tooth':'tap');return openLocal(id)}
  if(game?.id==='shapematch'&&action==='shape-go')return shapeGo();
  if(game?.id==='shapematch'&&action==='shape-next')return nextShape();
  if(game?.id==='bomb'){
    if(action==='bomb-setup'&&(r?.phase==='done'||r?.phase==='bomb-ready')){cleanup();return bombSetup()}
    if(!r&&(action==='random-bomb-time'||action==='confirm-bomb-time')){
      fx.play('tap');return readyBomb(action==='random-bomb-time');
    }
    if(action==='start-bomb')return startBomb();
  }
  if(game?.id==='stopwatch'&&action==='watch-setup'&&r?.phase==='done'){cleanup();return watchSetup()}
  if(game?.id==='truth'&&action==='truth-setup'&&r?.phase==='done'){cleanup();return intro()}
  if(game?.id==='truth'&&action==='truth-reconfigure'&&r?.phase==='truth-pick'){cleanup();return showTruthSettings();}
  if(game?.id==='truth'&&!r){
    if(action==='truth-settings')return showTruthSettings();
    if(action==='truth-choose')return chooseTruthQuestion();
    if(action==='truth-editor')return openTruthEditor();
    if(action==='truth-intro'){intro();app.querySelector('[data-action="truth-settings"]').focus();return;}
  }
  if(game?.id==='truth'&&action==='menu'&&$('#truth-choose-title'))return showTruthSettings();
  if(game?.id==='truth'&&action==='menu'&&$('#truth-settings-title')){intro();app.querySelector('[data-action="truth-settings"]').focus();return;}
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
    case 'king-yes':case 'king-no':{
      const n=Number(value);
      if(r.phase!=='king-answer'||n!==[r.number,r.second].find(i=>!r.answers[i]))return;
      r.answers[n]=action==='king-yes';
      if(action==='king-no'){r.declined=n;r.phase='done';}
      else if(r.answers[r.number]&&r.answers[r.second])r.phase='done';
      fx.play(r.phase==='done'?'result':'vote');
      return kingResult();
    }
    case 'truth-pick':return revealTruth(value);
    case 'truth-next':case 'truth-pass':
      if(r.phase!=='truth-answer')return;
      r.turn=(r.turn+1)%players.length;
      if(r.turn===0){
        if(r.lap===3)return end('다 같이 한잔!','모두 세 바퀴를 마쳤어요.');
        r.lap++;
      }
      fx.play('turn');return dealTruth();
    case 'initial-go':if(r.phase==='initial-ready')initialGo();return;
    case 'initial-next':if(r.phase==='intermission')initialGo();return;
    case 'word-ok':stopClock();r.turn=(r.turn+1)%r.alive.length;fx.play('turn');return initialReady();
    case 'word-out':return initialOut('중복·오답');
  }
}
document.addEventListener('click',event=>{
  if(round?.phase==='spinning'&&!event.target.closest('button,a,input,label,dialog,[data-drinking-overlay]'))brakeBottle();
},true);
$('#local-back').addEventListener('click',event=>{
  if(!game||event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  handle('menu');
});
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
