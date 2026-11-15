'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM, VirtualConsole} = require('jsdom');
const {screen, until, root} = require('./helpers/drinking-ui-fixture.cjs');
const kinds = ['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown','secretcount','partyroulette'];
const delay = () => new Promise(resolve => setTimeout(resolve, 35));

async function presentation({concealed = false, reducedMotion = false} = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname,'drinking-presentation-frame.html'),'utf8'), {
    url:'https://fixture.test/tests/drinking-presentation-frame.html',
    runScripts:'outside-only',pretendToBeVisual:true,virtualConsole
  });
  const w = dom.window, content = w.document.getElementById('access-content');
  let hidden = false;
  Object.defineProperty(w.document,'hidden',{get:()=>hidden,configurable:true});
  w.OjjudaDrinkingAccessReady = true;
  content.hidden = concealed;
  w.matchMedia = () => ({matches:reducedMotion,addEventListener(){},removeEventListener(){}});
  w.HTMLDialogElement.prototype.showModal = function () {this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));
  };
  for (const name of ['game-guides.js','presentation.js'])
    w.eval(fs.readFileSync(path.join(root,'games/drinking',name),'utf8'));
  const dialog = type => w.document.querySelector('[data-drinking-dialog="'+type+'"]');
  const isOpen = type => {
    const panel=dialog(type);
    return !!panel && !panel.closest('[hidden]') && panel.getAttribute('role')==='dialog';
  };
  return {w,content,dialog,isOpen,errors,dp:w.DrinkingPresentation,
    closeDialog(type) {const button=dialog(type)?.querySelector('[data-drinking-close]');assert.ok(button,type+' close control');button.click();},
    async hidden(value) {hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));await delay();},
    async access(allowed) {
      w.OjjudaDrinkingAccessReady=allowed;
      w.document.dispatchEvent(new w.CustomEvent('ojjuda:drinking-access',{detail:{allowed}}));await delay();
    },
    close() {w.dispatchEvent(new w.Event('pagehide'));w.close();}
  };
}

test('each drinking game has its own guide, only on entry or an explicit help request', async t => {
  const f=await presentation();t.after(()=>f.close());
  const guides=f.w.DrinkingGameGuides;
  assert.deepEqual(Object.keys(guides).sort(),[...kinds,'shapematch'].sort());
  assert.equal(Object.isFrozen(guides),true);
  for (const local of [false,true]) for (const kind of local ? [...kinds,'shapematch'] : kinds) {
    const guide=guides[kind];
    assert.ok(guide.title.trim()&&guide.goal.trim(),kind+' title and purpose');
    assert.equal(guide.steps.length,3,kind+' has three actionable steps');
    assert.ok(guide.steps.every(step=>typeof step==='string'&&step.trim().length>5));
    f.dp.enter(kind,{local});await delay();
    assert.ok(f.isOpen('guide'),kind+' first-entry guide');
    assert.match(f.dialog('guide').textContent,new RegExp(guide.title));
    assert.ok(f.content.contains(f.dialog('guide')),'guides stay inside the member gate');
    assert.ok(f.w.document.body.classList.contains('dp-playing'));
    f.closeDialog('guide');
    f.dp.enter(kind,{local});f.dp.update({phase:'ready',roundKey:kind+'.1',result:null});await delay();
    assert.equal(f.isOpen('guide'),false,kind+' polling does not reopen instructions');
    f.dp.help();await delay();assert.ok(f.isOpen('guide'),kind+' help reopens instructions');
    f.closeDialog('guide');f.dp.leave();
    assert.equal(f.w.document.body.classList.contains('dp-playing'),false);
  }
  assert.deepEqual(f.errors,[]);
});

test('confirmed results open once per key, preserve game controls and reset for the next round', async t => {
  const f=await presentation();t.after(()=>f.close());
  const control=f.w.document.getElementById('game-control'),draft=f.w.document.getElementById('draft');
  let gameActions=0;control.addEventListener('click',()=>gameActions++);
  f.dp.enter('croc');f.closeDialog('guide');
  const result={key:'croc:room-a:1',title:'이번 판 결과',body:'참가자 1님이 당첨됐어요.',names:['참가자 1']};
  const state={phase:'done',roundKey:'room-a:1',result};
  f.dp.update(state);await delay();
  assert.ok(f.isOpen('result'));
  const first=f.dialog('result');
  assert.ok(f.content.contains(first),'results cannot escape the approved content');
  for(let i=0;i<5;i++)f.dp.update(state);
  assert.equal(f.dialog('result'),first,'identical snapshots do not replace the dialog or restart its animation');
  f.closeDialog('result');f.dp.update(state);await delay();
  assert.equal(f.isOpen('result'),false,'a dismissed result stays dismissed on polling');
  assert.equal(f.w.document.getElementById('game-control'),control);
  assert.equal(f.w.document.getElementById('draft'),draft);
  assert.equal(draft.value,'남겨 둔 힌트');
  assert.equal(gameActions,0,'presentation does not submit game actions');
  f.dp.update({phase:'ready',roundKey:'room-a:2',result:null});
  f.dp.update({phase:'done',roundKey:'room-a:2',result:{...result,key:'croc:room-a:2'}});await delay();
  assert.ok(f.isOpen('result'),'the next confirmed round can show its own result');
  f.dp.update({phase:'ready',roundKey:'room-a:3',result:null});await delay();
  assert.equal(f.isOpen('result'),false,'a new round clears a previous round overlay');
  assert.deepEqual(f.errors,[]);
});

test('result text and participant names are inert text, and timed play closes automatic overlays', async t => {
  const f=await presentation();t.after(()=>f.close());
  const attack='<img src=x onerror="window.__injected=true">';
  f.dp.enter('bomb');await delay();assert.ok(f.isOpen('guide'));
  f.dp.update({phase:'active',roundKey:'bomb:1',urgent:true,result:null});await delay();
  assert.equal(f.isOpen('guide'),false,'instructions do not block an already running timer');
  f.dp.update({phase:'done',roundKey:'bomb:1',result:{key:'bomb:1',title:attack,body:attack,names:[attack]}});await delay();
  assert.ok(f.isOpen('result'));
  for(const selector of ['.dp-dialog-title','.dp-result-description','.dp-result-names li'])
    assert.equal(f.dialog('result').querySelector(selector).textContent,attack,'untrusted result text is preserved literally');
  const artwork=[...f.dialog('result').querySelectorAll('image[data-drinking-glass-image]')];
  assert.equal(artwork.length,1,'only the static glass asset is rendered as an image');
  const source=new URL(artwork[0].getAttribute('href'),f.w.location.href);
  assert.equal(source.pathname,'/games/drinking/assets/result-glass-v2.webp');
  assert.equal(source.origin,f.w.location.origin);
  assert.equal(f.dialog('result').querySelector('img'),null,'participant text cannot become an HTML image');
  assert.equal(f.dialog('result').querySelector('[onerror],[onload],script'),null,'result strings cannot insert active HTML');
  assert.equal(f.w.__injected,undefined);
  f.dp.update({phase:'active',roundKey:'bomb:2',urgent:true,result:null});await delay();
  assert.equal(f.isOpen('result'),false);
  f.dp.leave();f.dp.enter('bomb');await delay();
  assert.ok(f.isOpen('guide'),'a fresh visit gets instructions again');
  assert.deepEqual(f.errors,[]);
});

test('focus stays inside the dialog and Escape restores the original game control', async t => {
  const f=await presentation();t.after(()=>f.close());
  const original=f.w.document.getElementById('game-control');original.focus();
  f.dp.enter('croc');await delay();
  const panel=f.dialog('guide'),controls=[...panel.querySelectorAll('[data-drinking-close]')];
  assert.ok(panel.contains(f.w.document.activeElement));
  controls.at(-1).focus();
  f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
  assert.equal(f.w.document.activeElement,controls[0]);
  f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
  assert.equal(f.w.document.activeElement,controls.at(-1));
  original.focus();assert.ok(panel.contains(f.w.document.activeElement),'programmatic focus cannot escape an open dialog');
  f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(f.isOpen('guide'),false);
  assert.equal(f.w.document.activeElement,original);
  assert.equal(f.content.querySelectorAll('[inert]').length,0);
});

test('native bottle help text and backdrop clicks do not submit a brake action', async t => {
  const f=await presentation({reducedMotion:true});t.after(()=>{f.w.PartyLiveGame?.unmount();f.close();});
  f.w.eval(fs.readFileSync(path.join(root,'games/party-live/bottle.js'),'utf8'));
  const sent=[],state={phase:'spinning',me:0,players:['하나','둘'],game:{phase:'spinning',shape:'round',direction:'horizontal',
    positions:[{x:15,y:50},{x:85,y:50}],initialDeg:0,spinAt:0}};
  const ui={esc:String,now:()=>100,send:(...args)=>sent.push(args)},feature=f.w.PartyLiveGame;
  f.w.document.getElementById('view').innerHTML='<section class="card"><div id="game">'+feature.view(state,ui)+'</div></section>';
  f.dp.enter('bottle');f.dp.update({phase:'spinning',roundKey:'bottle:1',urgent:true});
  feature.mount(state,ui);
  f.dp.help();f.dialog('guide').querySelector('.dp-guide-goal').click();
  assert.equal(sent.length,0,'reading instructions must not brake the bottle');
  assert.ok(f.isOpen('guide'));
  f.w.document.querySelector('[data-drinking-overlay]').click();
  assert.equal(sent.length,0,'closing instructions by the backdrop must not brake the bottle');
  assert.equal(f.isOpen('guide'),false);
  f.w.document.querySelector('#game h1').click();
  assert.deepEqual(sent,[['brake']],'ordinary game-surface taps keep their original behavior');
});

test('local bottle capture handlers ignore help contents and backdrop clicks while spinning', async t => {
  const f=await screen({url:'/games/drinking/local/#bottle',prepare(w){
    w.scrollTo=()=>{};
    w.localStorage.setItem('oj.party.member-a.players',JSON.stringify(['하나','둘']));
  }});
  t.after(()=>f.close());
  await until(()=>f.find('[data-drinking-dialog="guide"]'),'local bottle instructions');
  f.click('[data-drinking-dialog="guide"] [data-drinking-close]');
  f.click('[data-action="start"]');f.click('[data-action="set-bottle-table"]');
  for(const x of [40,260]) {
    f.find('.bottle-dial').getBoundingClientRect=()=>({left:0,top:0,width:300,height:300,right:300,bottom:300});
    f.find('.seat-surface').dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,detail:1,clientX:x,clientY:150}));
  }
  f.click('[data-action="spin"]');
  f.w.DrinkingPresentation.help();f.find('.dp-guide-goal').click();
  assert.equal(f.find('#bottle-title').textContent,'병이 돌고 있어요');
  f.find('[data-drinking-overlay]').click();
  assert.ok(f.find('[data-action="brake"]'),'closing help must not trigger the document capture brake handler');
  assert.equal(f.find('[data-drinking-dialog="guide"]'),null);
  f.find('#bottle-title').click();
  assert.equal(f.find('#bottle-title').textContent,'서서히 멈추는 중…','a real game-surface tap still brakes');
  assert.deepEqual(f.errors,[]);
});

test('the local primary back link restores the game menu and cancels a running stopwatch', async t => {
  const pendingFrames=new Set(),cancelledFrames=new Set();
  const release=JSON.parse(fs.readFileSync(path.join(root,'game-release.json'),'utf8'));
  const f=await screen({url:'/games/drinking/local/#menu',prepare(w){
    w.scrollTo=()=>{};
    w.localStorage.setItem('oj.party.member-a.players',JSON.stringify(['하나','둘']));
    w.fetch=async url=>{
      assert.equal(new URL(url,w.location.href).pathname,'/game-release.json');
      return {ok:true,json:async()=>release};
    };
    const request=w.requestAnimationFrame,cancel=w.cancelAnimationFrame;
    w.requestAnimationFrame=callback=>{
      const id=request(time=>{pendingFrames.delete(id);callback(time);});
      pendingFrames.add(id);return id;
    };
    w.cancelAnimationFrame=id=>{pendingFrames.delete(id);cancelledFrames.add(id);cancel(id);};
  }});
  t.after(()=>f.close());
  await until(()=>f.find('.game-card'),'local game menu');
  assert.equal(f.find('#local-back').getAttribute('href'),'/world.html?tab=arcade');
  assert.equal(f.find('[data-local-back-label]').textContent,'오락실로');
  assert.equal(f.find('.mode-back').hidden,false);

  f.click('[data-action="open"][data-value="stopwatch"]');
  await until(async()=>{
    // The release response settles before go() queues the real hashchange.
    // Drain zero-delay work as well as promises while waiting for game entry.
    await f.advance(0);
    return f.find('[data-drinking-dialog="guide"]');
  },'stopwatch instructions');
  f.click('[data-drinking-dialog="guide"] [data-drinking-close]');
  assert.equal(f.find('#local-back').getAttribute('href'),'#menu');
  assert.equal(f.find('[data-local-back-label]').textContent,'술게임으로');
  assert.equal(f.find('.mode-back').hidden,true);
  assert.equal(f.find('.menu-nav'),null,'the page does not repeat the game-menu link');
  f.click('[data-action="start"]');f.click('[data-action="watch-go"]');await f.advance(64);
  assert.ok(f.find('[data-action="watch-stop"]'),'the stopwatch is running before leaving');
  const runningFrames=[...pendingFrames];
  assert.ok(runningFrames.length>0,'the active game has scheduled animation work');

  // Click the actual anchor, including its hashchange cleanup path.
  f.find('#local-back').click();await f.advance(0);
  await until(()=>f.find('.game-card'),'returned game menu');
  assert.equal(f.w.location.hash,'#menu');
  assert.ok(runningFrames.every(id=>cancelledFrames.has(id)),'leaving cancels the running game frames');
  assert.equal(pendingFrames.size,0);
  assert.equal(f.find('#local-back').getAttribute('href'),'/world.html?tab=arcade');
  assert.equal(f.find('[data-local-back-label]').textContent,'오락실로');
  assert.equal(f.find('.mode-back').hidden,false);
  assert.equal(f.w.document.activeElement.dataset.value,'stopwatch','keyboard focus returns to the selected game card');
  assert.equal(f.w.document.body.classList.contains('dp-playing'),false);
  await f.advance(5000);
  assert.ok(f.find('.game-card'));
  assert.equal(f.find('#watch-reading'),null);
  assert.equal(f.find('[data-drinking-dialog]'),null,'the departed round cannot show an old popup');
  assert.deepEqual(f.errors,[]);
});

test('a guide queued while approved modules load opens when the gate exposes content', async t => {
  const f=await presentation({concealed:true});t.after(()=>f.close());
  f.dp.enter('liar');await delay();
  assert.ok(!f.isOpen('guide'),'the hidden access wrapper cannot show a top-layer dialog');
  // access.js signals allowed:true before it loads modules, then only changes
  // hidden=false. There is deliberately no second access event here.
  f.content.hidden=false;await delay();
  assert.ok(f.isOpen('guide'),'first-entry instructions survive the actual module-loading order');
  assert.deepEqual(f.errors,[]);
});

test('access denial, backgrounding and page departure conceal presentation without stale result replay', async t => {
  const f=await presentation();t.after(()=>f.close());
  f.dp.enter('king');f.closeDialog('guide');
  const state={phase:'done',roundKey:'private:1',result:{key:'private:1',title:'미션 배정',body:'개인 결과',names:['이전 참가자']}};
  f.dp.update(state);await delay();assert.ok(f.isOpen('result'));
  await f.access(false);
  assert.equal(f.isOpen('result'),false);
  assert.equal(f.w.document.querySelectorAll('[data-drinking-overlay]:not([hidden]) [data-drinking-dialog]').length,0);
  await f.access(true);f.dp.update(state);await delay();
  assert.equal(f.isOpen('result'),false,'revalidation does not replay an already displayed private result');
  f.dp.help();await delay();assert.ok(f.isOpen('guide'));
  await f.hidden(true);assert.equal(f.isOpen('guide'),false);
  await f.hidden(false);assert.equal(f.isOpen('guide'),false,'returning to the tab does not interrupt play');
  f.dp.help();await delay();f.w.dispatchEvent(new f.w.Event('pagehide'));await delay();
  assert.equal(f.w.document.querySelectorAll('[data-drinking-overlay]:not([hidden]) [data-drinking-dialog]').length,0);
  assert.deepEqual(f.errors,[]);
});

test('the real access gate exposes the first native guide after loading all modules', async t => {
  const state={code:'LIAR01',title:'가이드 검사',players:['하나','둘','셋'],me:0,capacity:3,
    phase:'hints',revision:1,round:1,turn:0,hints:[],role:'citizen',word:'사과'};
  const f=await screen({url:'/games/liar/?room=LIAR01',gate:true,rpc:()=>state});
  t.after(()=>f.close());
  await until(()=>!f.find('#access-content').hidden&&!!f.find('[data-drinking-overlay]:not([hidden]) [data-drinking-dialog="guide"]'),'native first-entry guide');
  assert.ok(f.find('#access-content').contains(f.find('[data-drinking-dialog="guide"]')));
  f.click('[data-drinking-dialog="guide"] [data-drinking-close]');
  f.find('#hint [name="hint"]').value='다시 연결돼도 남길 힌트';
  await f.online(false);assert.equal(f.find('#access-content').hidden,true);
  assert.equal(!!f.find('[data-drinking-overlay]:not([hidden]) [data-drinking-dialog="guide"]'),false);
  await f.online(true);
  await until(()=>!f.find('#access-content').hidden,'same-member gate recovery');
  assert.equal(f.find('#hint [name="hint"]').value,'다시 연결돼도 남길 힌트');
  assert.equal(!!f.find('[data-drinking-overlay]:not([hidden]) [data-drinking-dialog="guide"]'),false);
  assert.deepEqual(f.errors,[]);
});

test('all native and local adapters publish outcomes only from a confirmed done state', async t => {
  const f=await presentation();t.after(()=>f.close());
  const updates=[],entries=[];
  f.w.DrinkingPresentation={enter:(...args)=>entries.push(args),update:value=>updates.push(value)};
  f.w.eval(fs.readFileSync(path.join(root,'games/drinking/game-screen.js'),'utf8'));
  const view=f.w.document.getElementById('view');
  view.innerHTML='<section class="card"><div id="game"><h1>공개된 결과</h1><p>확정된 설명</p></div></section>';
  const app=f.w.document.createElement('main');
  app.innerHTML='<div class="play-body"><h2>공개된 결과</h2><p>확정된 설명</p></div>';
  for(const kind of kinds) {
    for(const phase of ['entry','waiting','cards','hints','vote','answer','consent','active','braking']) {
      f.w.DrinkingGameScreen.native(kind,{code:'ROOM01',round:3,phase},view);
      assert.equal(updates.at(-1).result,null,kind+' native '+phase+' has no premature outcome');
      f.w.DrinkingGameScreen.local(kind,{phase},app);
      assert.equal(updates.at(-1).result,null,kind+' local '+phase+' has no premature outcome');
    }
    const state={code:'ROOM01',round:3,phase:'done'};
    f.w.DrinkingGameScreen.native(kind,state,view);
    const confirmed=updates.at(-1);
    if(kind==='partyroulette')assert.equal(confirmed.result,null,'the draw displays only this phone’s private result');
    else assert.ok(confirmed.result?.key&&confirmed.result.title,kind+' native confirmed outcome');
    f.w.DrinkingGameScreen.native(kind,{...state,revision:100},view);
    assert.equal(updates.at(-1).result?.key,confirmed.result?.key,kind+' poll revisions do not invent a new outcome');
    f.w.DrinkingGameScreen.local(kind,{phase:'done'},app);
    assert.ok(updates.at(-1).result?.key,kind+' local confirmed outcome');
    assert.equal(entries.at(-1)[1].local,true);
  }
  f.w.DrinkingGameScreen.native('king',{code:'KING01',round:1,phase:'done',declined:0},view);
  assert.equal(updates.at(-1).result.title,'이번 미션은 패스했어요','declined consent is not presented as completed action');
  app.innerHTML='<div class="play-body"><h2>소수파 결과</h2><p class="results-line"><strong>먼저 고백 · 1표</strong>하나</p><p class="results-line"><strong>고백 기다리기 · 2표</strong>둘, 셋</p></div>';
  f.w.DrinkingGameScreen.local('minority',{phase:'done'},app);
  assert.match(updates.at(-1).result.body,/먼저 고백 · 1표 · 하나/,'names in text nodes stay in minority results');
  assert.match(updates.at(-1).result.body,/둘, 셋/);
  app.innerHTML='<div class="play-body"><h2>미션 결과</h2><p>다른 미션은 하나</p><p class="results-line">공통: 양치<br>다른 미션: 세수</p></div>';
  f.w.DrinkingGameScreen.local('mission',{phase:'done'},app);
  assert.match(updates.at(-1).result.body,/공통: 양치\n다른 미션: 세수/,'separate revealed prompts remain readable');
  assert.deepEqual(f.errors,[]);
});

test('spinning the same local bottle round again creates a fresh result key only on completion', async t => {
  const f=await presentation();t.after(()=>f.close());
  const updates=[];
  f.w.DrinkingPresentation={enter(){},update:value=>updates.push(value)};
  f.w.eval(fs.readFileSync(path.join(root,'games/drinking/game-screen.js'),'utf8'));
  const app=f.w.document.getElementById('view');
  app.innerHTML='<div class="play-body"><h2>참가자 1님 당첨!</h2></div>';
  const round={phase:'done'},bridge=f.w.DrinkingGameScreen;
  bridge.local('bottle',round,app);const first=updates.at(-1).result.key;
  bridge.local('bottle',round,app);assert.equal(updates.at(-1).result.key,first);
  round.phase='spinning';bridge.local('bottle',round,app);
  assert.equal(updates.at(-1).result,null);assert.equal(updates.at(-1).urgent,true);
  round.phase='braking';bridge.local('bottle',round,app);assert.equal(updates.at(-1).result,null);
  round.phase='done';bridge.local('bottle',round,app);
  assert.notEqual(updates.at(-1).result.key,first,'same object, newly confirmed bottle outcome');
  const second=updates.at(-1).result.key;
  bridge.local('bottle',round,app);assert.equal(updates.at(-1).result.key,second);
});

test('shape match uses the longest reaction, including ties, for the shared result and next host', async t => {
  const f=await screen({url:'/games/drinking/local/#shapematch',prepare(w){
    w.localStorage.setItem('oj.party.member-a.players',JSON.stringify(['하나','둘','셋']));
    w.scrollTo=()=>{};
  }});
  t.after(()=>f.close());
  await until(()=>f.find('[data-drinking-dialog="guide"]'),'shape match instructions');
  f.click('[data-drinking-close]');
  let finish;
  f.w.OjjudaShapeMatch={play:(_field,options)=>{finish=options.finish;return ()=>{}}};
  f.click('[data-action="start"]');
  for(const ms of [140,720,720]){
    f.click('[data-action="shape-go"]');
    finish(ms);
    assert.equal(f.find('[data-drinking-dialog="result"]'),null);
    f.click('[data-action="shape-next"]');
  }
  const panel=f.find('[data-drinking-dialog="result"]');
  assert.match(panel.textContent,/둘 · 셋 공동 당첨!/);
  assert.match(panel.textContent,/720 ms/);
  assert.doesNotMatch(panel.querySelector('h2').textContent,/하나/);
  assert.match(f.find('.table-host').textContent,/둘/);
  assert.ok(panel.querySelector('[data-drinking-glass] [data-drinking-glass-image]'));
});
