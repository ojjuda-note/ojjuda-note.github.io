const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const clone=value=>JSON.parse(JSON.stringify(value));
const me='member-a',other='member-b';
const historyKey=owner=>`ojjuda.roulette.history.v1:${owner}`;
const historyStorage=(entries,owner=me)=>({[historyKey(owner)]:JSON.stringify({version:1,owner,entries})});
const storageSnapshot=w=>Object.fromEntries(Array.from({length:w.localStorage.length},(_,index)=>{const key=w.localStorage.key(index);return [key,w.localStorage.getItem(key)]}));
const roomFixture=patch=>({id:'room-one',code:'ABCDEF12',hostId:other,mode:'online',status:'betting',round:0,capacity:3,players:[{userId:me,name:'나',computer:false,ready:false,connected:true,bets:{}},{userId:other,name:'친구',computer:false,ready:false,connected:true,bets:{n7:500}}],me:{userId:me,ready:false,confirmed:false,bets:{},stake:0},spin:null,result:null,...patch});

async function fixture(t,initial=roomFixture(),options={}){
 const engine=await import(pathToFileURL(path.join(root,'games/roulette/engine.js')).href);
 const dom=new JSDOM(read('games/roulette/index.html'),{url:'https://roulette.test/games/roulette/index.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],sent=[],gates=new Map(),storageFailures=[];let current=clone(initial),gold=10000,time=options.serverTime||Date.now(),clock=0,closed=false,hidden=false;
 const motionListeners=new Set(),motionMedia={matches:options.systemReduced===true,addEventListener(type,listener){if(type==='change')motionListeners.add(listener)},removeEventListener(type,listener){motionListeners.delete(listener)}};
 w.matchMedia=query=>query==='(prefers-reduced-motion: reduce)'?motionMedia:{matches:false,addEventListener(){},removeEventListener(){}};
 w.performance.now=()=>clock;
 w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>0;w.scrollTo=()=>{};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLElement.prototype.animate=function(){return {finished:Promise.resolve()}};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 Object.defineProperty(w.document,'hidden',{get:()=>hidden});
 class Wheel{constructor(canvas,callbacks){this.callbacks=callbacks;w.testWheel=this;}resize(){}setReduced(value){this.reduced=value;}setVisible(){}start(spin){this.last=spin;}showResult(){}}
 class Sound{unlock(){return Promise.resolve()}setEnabled(){}chip(){}beginRoll(){}stopRoll(){}win(){}roll(){}updateRoll(){}}
 Object.assign(w,engine,{RouletteWheel:Wheel,Sound,addChipDepth(){}});
 const preferences='preferences' in options?options.preferences:{sound:false,reduced:true};
 if(preferences!==null)w.localStorage.setItem('ojjuda.roulette.preferences.v1',JSON.stringify(preferences));
 for(const [key,value] of Object.entries(options.storage||{}))w.localStorage.setItem(key,value);
 for(const method of options.storageThrows||[]){
  w.Storage.prototype[method]=function(key){storageFailures.push({method,key});throw new w.DOMException('Synthetic storage failure',method==='setItem'?'QuotaExceededError':'SecurityError')};
 }
 const snapshot=()=>({ok:true,serverTime:++time,wallet:{coins:777,gold},room:clone(current)});
 const begin=(startedAt=time)=>{
  current.status='spinning';current.round++;current.bettingDeadline=null;
  current.spin={id:'spin-one',number:7,duration:20000,startedAt,variation:.5,bets:clone(current.me.bets)};
 };
 const expire=()=>{
  if(current?.status==='spinning'&&time>=current.spin.startedAt+current.spin.duration){
   current.status='finished';current.result={...engine.payout(current.spin.bets,current.spin.number),number:current.spin.number};
   const computer=current.players.find(p=>p.computer);
   if(computer){const paid=engine.payout(computer.bets,current.spin.number);computer.result={...paid,number:current.spin.number,net:paid.total-paid.stake};}
  }
  if(current?.status!=='betting'||!current.bettingDeadline||time<current.bettingDeadline)return;
  const deadline=current.bettingDeadline;
  if(!current.players.some(p=>engine.totalBets(p.bets||{})>0)){current.bettingDeadline=null;return}
  if(!current.me.ready){current.me.stake=engine.totalBets(current.me.bets||{});gold-=current.me.stake;current.me.ready=true}
  current.players.forEach(p=>{p.ready=true});begin(deadline);
 };
 const server=async body=>{
  calls.push(clone(body));if(gates.has(body.action))await gates.get(body.action).promise;
  if(['read','status','list','mine'].includes(body.action))expire();
  if(body.action==='create'){
   const solo=body.mode==='solo';
   current=roomFixture({mode:solo?'solo':'online',hostId:me,capacity:solo?2:4,bettingDeadline:null});
   current.players=[current.players[0]];
   if(solo)current.players.push({userId:'computer',name:'컴퓨터',computer:true,connected:true,ready:true,confirmed:true,bets:{n7:500},stake:500,result:null});
  }else if(body.action==='join'){
   current=roomFixture({code:body.code,mode:'online'});
  }else if(body.action==='bet'){
   if(current.me.ready)throw Error('already_ready');
   current.me.bets=clone(body.bets);current.players.find(p=>p.userId===me).bets=clone(body.bets);
  }else if(body.action==='ready'){
   const next=body.ready!==false,stake=next?engine.totalBets(body.bets||current.me.bets):0;
   gold+=current.me.stake-stake;current.me={...current.me,ready:next,bets:next?clone(body.bets):{},stake};
   Object.assign(current.players.find(p=>p.userId===me),{ready:next,bets:clone(current.me.bets)});
   if(current.mode==='solo'){if(next&&stake>0)begin()}
   else{
    if(next&&stake>0&&!current.bettingDeadline)current.bettingDeadline=time+30000;
    if(next&&current.players.length>=2&&current.players.every(p=>p.ready)&&current.players.some(p=>engine.totalBets(p.bets||{})>0))begin();
   }
  }else if(body.action==='confirm'){
   gold+=engine.payout(current.spin.bets,current.spin.number).total;current.status='finished';current.me.confirmed=true;
   if(current.mode==='solo'){
    current.status='betting';current.me={...current.me,ready:false,confirmed:false,bets:{},stake:0};current.spin=null;current.result=null;
    Object.assign(current.players.find(p=>p.userId===me),{ready:false,confirmed:false,bets:{},stake:0});
    Object.assign(current.players.find(p=>p.computer),{bets:{n8:500},stake:500,result:null});
   }
  }else if(body.action==='leave')current=null;
  const result=snapshot();if(body.action==='list')result.rooms=clone(options.rooms||[]);return result;
 };
 const parent={postMessage(message){sent.push(clone(message));if(message.type!=='rpc')return;Promise.resolve().then(()=>server(message.body)).then(data=>reply(message.id,data),error=>reply(message.id,null,error.message));}};
 Object.defineProperty(w,'parent',{value:parent});
 function reply(id,data,error=null){if(closed)return;w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:parent,data:{source:'ojjuda-world',type:'roulette-rpc',id,data,error}}))}
 const source=read('games/roulette/app.js').replace(/^import .*;\n/gm,'')+'\nwindow.__roulette={state,applySnapshot,getRoom:()=>room,readyId:()=>resultReadyId,hasExit:()=>exitRequested};';
 w.eval(source);
 const message=data=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:parent,data:{source:'ojjuda-world',...data}}));
 message({type:'roulette-init',owner:options.owner??me,joinCode:options.joinCode});await tick();await tick();
 t.after(()=>{closed=true;w.close()});
 return {w,calls,sent,gates,message,storageFailures,room:()=>current,hide:()=>{hidden=true},advance:ms=>{clock+=ms;time+=ms},setSystemReduced:value=>{motionMedia.matches=value;for(const listener of motionListeners)listener({matches:value})},snapshot,ui:w.__roulette};
}

function beginHistoryRound(f,id,number=7){
 const r=f.room();r.status='spinning';r.round++;r.me={...r.me,ready:true,confirmed:false,bets:{},stake:0};
 r.spin={id,number,duration:20000,startedAt:Date.now()-20000,variation:.5,bets:{}};r.result=null;
 f.ui.applySnapshot(f.snapshot());
}

async function confirmHistoryRound(f,id,number=7){
 beginHistoryRound(f,id,number);f.w.testWheel.callbacks.onDone(id);
 f.w.document.getElementById('confirmResultButton').click();await tick();await tick();await tick();
}

test('a non-host starts with one button; every participant-ready response opens the shared spin',async t=>{
 const r=roomFixture();r.players[1].ready=true;
 const f=await fixture(t,r),w=f.w;
 w.document.querySelector('[data-bet="n7"]').click();await tick();
 assert.equal(w.document.getElementById('spinLabel').textContent,'시작');
 w.document.getElementById('spinButton').click();await tick();await tick();
 assert.equal(f.calls.filter(c=>c.action==='ready').length,1);
 assert.equal(f.calls.filter(c=>c.action==='start').length,0,'no extra host-only start request');
 assert.equal(f.room().status,'spinning');assert.equal(f.ui.state.pending.id,'spin-one');
 assert.equal(w.testWheel.last.number,7);assert.equal(w.document.getElementById('wheelDialog').open,true);
 assert.equal(f.ui.state.balance,9900,'server gold is used, never the 777 ZU field');
});

test('opponent drafts are visible separately while the own chip remains solid and editable',async t=>{
 const r=roomFixture();r.players.push({userId:'member-c',name:'다른 친구',ready:false,connected:true,bets:{n7:1000}});
 const f=await fixture(t,r),cell=f.w.document.querySelector('[data-bet="n7"]');
 assert.equal(cell.querySelectorAll('.opponent-stack').length,2);
 assert.deepEqual([...cell.querySelectorAll('.opponent-stack .stack-face')].map(e=>e.textContent),['500','1K']);
 assert.equal(cell.querySelectorAll('.bet-stack').length,0);
 cell.click();await tick();
 assert.equal(cell.querySelectorAll('.opponent-stack').length,2);
 assert.equal(cell.querySelectorAll('.bet-stack').length,1);
 assert.equal(cell.disabled,false);
});

test('cancelling start republishes retained own chips so opponents see the same draft',async t=>{
 const f=await fixture(t),w=f.w;
 w.document.querySelector('[data-bet="n7"]').click();await tick();
 w.document.getElementById('spinButton').click();await tick();await tick();
 assert.equal(f.room().me.ready,true);
 const before=f.calls.length;
 w.document.getElementById('cancelReady').click();await tick();await wait(180);await tick();
 assert.equal(f.ui.state.bets.n7,100,'cancel keeps editable chips on the own table');
 assert.equal(f.room().me.ready,false);
 assert.equal(f.room().players.find(p=>p.userId===me).bets.n7,100,'the retained draft reaches opponents again');
 assert.ok(f.calls.slice(before).some(c=>c.action==='bet'&&c.bets.n7===100));
});

test('snapshot updates cannot use ZU or an older response to replace roulette gold',async t=>{
 const f=await fixture(t),r=clone(f.room());
 f.ui.applySnapshot({ok:true,serverTime:Date.now()+10000,wallet:{coins:999999,gold:8400},room:r});
 assert.equal(f.ui.state.balance,8400);
 f.ui.applySnapshot({ok:true,serverTime:Date.now()+11000,wallet:{coins:999999},room:r});
 assert.equal(f.ui.state.balance,8400);
 f.ui.applySnapshot({ok:true,serverTime:1,wallet:{gold:10000},room:null});
 assert.equal(f.ui.state.balance,8400);assert.equal(f.ui.getRoom().id,r.id);
});

test('an exit queued during confirmation is completed even when the tab becomes hidden',async t=>{
 const r=roomFixture({status:'spinning',round:1});r.me.ready=true;r.me.bets={n7:100};r.me.stake=100;r.spin={id:'spin-one',number:7,duration:20000,startedAt:Date.now()-20000,variation:.5,bets:{n7:100}};
 const f=await fixture(t,r),gate=deferred();f.gates.set('confirm',gate);
 f.w.testWheel.callbacks.onDone('spin-one');
 f.w.document.getElementById('confirmResultButton').click();await tick();
 f.message({type:'roulette-exit-request'});f.hide();
 assert.equal(f.ui.hasExit(),true);assert.equal(f.calls.some(c=>c.action==='leave'),false);
 gate.resolve();await tick();await tick();await tick();
 assert.ok(f.calls.some(c=>c.action==='leave'),'queued exit is not stranded by hidden-tab early return');
 assert.ok(f.sent.some(c=>c.type==='exit'));assert.equal(f.room(),null);
});

test('shared entrance toolbar hides once roulette play starts',()=>{
 const dom=new JSDOM('<style>'+read('multiplayer-entry.css')+'\n'+read('world-roulette-game.css')+'</style><dialog open class="roulette-game-dialog mp-entry-host" data-mp-active="false"><header class="mp-entry-bar">공통 입구</header><header class="roulette-original">게임 목록</header><iframe></iframe></dialog>');
 try{assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.mp-entry-bar')).display,'none','game header styles must not reopen the shared entrance header');assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.roulette-original')).display,'flex');}finally{dom.window.close()}
});


test('first start opens a server-aligned 30 second countdown even with a skewed local clock',async t=>{
 const serverTime=Date.now()+3600000,f=await fixture(t,roomFixture(),{serverTime});
 const w=f.w;w.document.querySelector('[data-bet="n7"]').click();await tick();
 w.document.getElementById('spinButton').click();await tick();await tick();
 assert.equal(f.room().status,'betting');assert.equal(w.document.getElementById('bettingCountdown').hidden,false);
 assert.equal(w.document.getElementById('bettingSeconds').textContent,'30초');
 f.advance(11200);await wait(275);
 assert.equal(w.document.getElementById('bettingSeconds').textContent,'19초','server-relative remaining time survives a one-hour client clock difference');
 assert.equal(f.ui.state.pending,null,'first start does not invent a local spin');
});

test('expiry locks all local betting and requests the server before showing an automatic spin',async t=>{
 const serverTime=Date.now(),r=roomFixture();r.bettingDeadline=serverTime+30000;r.players[1].ready=true;
 const f=await fixture(t,r,{serverTime}),w=f.w;
 w.document.querySelector('[data-bet="n7"]').click();await tick();await wait(170);
 assert.equal(f.room().me.bets.n7,100,'draft is shared before automatic closing');
 const readGate=deferred();f.gates.set('read',readGate);
 f.advance(31000);await wait(280);await tick();
 assert.equal(w.document.getElementById('bettingSeconds').textContent,'0초');
 assert.equal(w.document.getElementById('spinButton').disabled,true);
 assert.equal(w.document.querySelector('[data-bet="n8"]').disabled,true);
 assert.equal(w.document.querySelector('[data-chip="500"]').disabled,true);
 assert.ok(f.calls.some(call=>call.action==='read'),'expiry immediately asks the server to advance');
 assert.equal(f.ui.state.pending,null,'countdown alone cannot choose an outcome');
 w.document.querySelector('[data-bet="n8"]').click();await tick();assert.equal(f.ui.state.bets.n8,undefined);
 readGate.resolve();await tick();await tick();
 assert.equal(f.room().status,'spinning');assert.equal(f.ui.state.pending.id,'spin-one');assert.equal(f.ui.state.pending.bets.n7,100);
 assert.equal(f.ui.state.balance,9900,'server automatically escrows the shared draft');
 assert.equal(w.document.getElementById('bettingCountdown').hidden,true);
});

test('editing a started bet keeps the original deadline and republishes the chips',async t=>{
 const f=await fixture(t),w=f.w;w.document.querySelector('[data-bet="n7"]').click();await tick();
 w.document.getElementById('spinButton').click();await tick();await tick();const deadline=f.room().bettingDeadline;
 f.advance(5000);w.document.getElementById('cancelReady').click();await tick();await wait(170);
 assert.equal(w.document.getElementById('cancelReady').textContent,'베팅 수정');
 assert.equal(f.room().bettingDeadline,deadline,'editing never resets the thirty seconds');
 assert.equal(w.document.getElementById('bettingSeconds').textContent,'25초');
 assert.equal(f.room().me.bets.n7,100);assert.equal(f.ui.state.balance,10000);
});

test('a zero-gold spectator can press start during the countdown and confirm the shared result',async t=>{
 const serverTime=Date.now(),r=roomFixture();r.bettingDeadline=serverTime+30000;r.players[1].ready=true;
 const f=await fixture(t,r,{serverTime}),w=f.w;
 assert.equal(w.document.getElementById('spinLabel').textContent,'시작 · 관람');
 assert.equal(w.document.getElementById('spinButton').disabled,false);
 w.document.getElementById('spinButton').click();await tick();await tick();
 assert.equal(f.room().status,'spinning');assert.deepEqual(clone(f.ui.state.pending.bets),{});
 assert.equal(f.ui.state.balance,10000,'spectating never deducts gold');
 assert.match(w.document.getElementById('wheelDialogHint').textContent,/관람/);
 w.testWheel.callbacks.onDone('spin-one');w.document.getElementById('confirmResultButton').click();await tick();await tick();await tick();
 assert.equal(f.ui.state.balance,10000);assert.equal(w.document.getElementById('wheelDialog').open,false);
 assert.match(w.document.getElementById('resultTitle').textContent,/관람/);
});

test('one participant waits for the deadline instead of starting immediately',async t=>{
 const r=roomFixture();r.players=[r.players[0]];r.hostId=me;
 const f=await fixture(t,r),w=f.w;w.document.querySelector('[data-bet="n7"]').click();await tick();w.document.getElementById('spinButton').click();await tick();await tick();
 assert.equal(f.room().status,'betting');assert.equal(w.document.getElementById('bettingSeconds').textContent,'30초');
 f.advance(31000);await wait(280);await tick();await tick();
 assert.equal(f.room().status,'spinning');assert.equal(f.ui.state.pending.bets.n7,100);
});

test('entrance defaults to computer play and only loads online rooms after selecting online',async t=>{
 const rooms=[{id:'private',code:'AABBCC11',mode:'solo',players:1,capacity:2,title:'비공개 컴퓨터'},{id:'online',code:'AABBCC22',mode:'online',players:1,capacity:3,title:'함께 룰렛'}];
 const f=await fixture(t,null,{rooms}),w=f.w,d=w.document;
 assert.equal(d.getElementById('soloMode').getAttribute('aria-pressed'),'true');
 assert.equal(d.getElementById('computerEntry').hidden,false);assert.equal(d.getElementById('onlineEntry').hidden,true);
 assert.equal(d.getElementById('startSoloButton').disabled,false);
 assert.equal(f.calls.some(c=>c.action==='list'),false,'computer entrance does not request the public room list');
 d.getElementById('onlineMode').click();await wait(30);await tick();
 assert.equal(d.getElementById('computerEntry').hidden,true);assert.equal(d.getElementById('onlineEntry').hidden,false);
 assert.equal(d.getElementById('onlineMode').getAttribute('aria-pressed'),'true');
 assert.match(d.getElementById('modeDescription').textContent,/30초/);
 assert.equal(d.querySelectorAll('.room-row').length,1);assert.match(d.getElementById('roomList').textContent,/함께 룰렛/);
 d.getElementById('soloMode').click();await tick();
 assert.equal(d.getElementById('onlineEntry').hidden,true,'room creation, join codes and room list leave the computer view together');
});

test('online room creation explicitly selects online and retains the thirty-second flow',async t=>{
 const f=await fixture(t,null),d=f.w.document;
 d.getElementById('onlineMode').click();d.getElementById('createRoomButton').click();await tick();await tick();
 assert.equal(f.calls.find(c=>c.action==='create').mode,'online');assert.equal(f.room().mode,'online');
 assert.equal(d.getElementById('copyCode').hidden,false);assert.equal(d.getElementById('soloRoomLabel').hidden,true);
 d.querySelector('[data-bet="n7"]').click();await tick();d.getElementById('spinButton').click();await tick();await tick();
 assert.equal(f.room().status,'betting');assert.equal(d.getElementById('bettingCountdown').hidden,false);
 assert.equal(d.getElementById('bettingSeconds').textContent,'30초');
});

test('an invited room code routes directly into online play regardless of the computer default',async t=>{
 const f=await fixture(t,null,{joinCode:'aabbcc22'}),d=f.w.document;
 assert.equal(f.calls.find(c=>c.action==='join').code,'AABBCC22');assert.equal(f.calls.some(c=>c.action==='create'),false);
 assert.equal(f.room().mode,'online');assert.equal(d.body.dataset.screen,'game');
 assert.equal(d.getElementById('onlineMode').getAttribute('aria-pressed'),'true');assert.equal(d.getElementById('roomCode').textContent,'AABBCC22');
});

test('computer play starts immediately, shows server bot bets, and preserves the server result after confirmation',async t=>{
 const f=await fixture(t,null),w=f.w,d=w.document;
 d.getElementById('startSoloButton').click();await tick();await tick();
 assert.equal(f.calls.find(c=>c.action==='create').mode,'solo');assert.equal(f.room().mode,'solo');
 assert.equal(d.getElementById('copyCode').hidden,true);assert.equal(d.getElementById('roomCode').textContent,'');
 assert.equal(d.getElementById('soloRoomLabel').hidden,false);assert.match(d.getElementById('playersStrip').textContent,/컴퓨터/);
 assert.match(d.querySelector('[data-bet="n7"] .opponent-stack').title,/컴퓨터.*500/);
 d.querySelector('[data-bet="n7"]').click();await tick();d.getElementById('spinButton').click();await tick();await tick();
 assert.equal(f.room().status,'spinning');assert.equal(f.room().bettingDeadline,null);
 assert.equal(d.getElementById('bettingCountdown').hidden,true);assert.equal(f.ui.state.balance,9900);
 assert.equal(d.getElementById('wheelComputerResult').hidden,true,'computer payout does not appear during the spin');
 f.advance(20000);w.testWheel.callbacks.onDone('spin-one');d.getElementById('confirmResultButton').click();await tick();await tick();await wait(30);
 const confirmIndex=f.calls.findIndex(c=>c.action==='confirm');
 assert.ok(f.calls.slice(0,confirmIndex).some(c=>c.action==='read'),'a quick confirmation obtains the server result before the next round replaces it');
 assert.equal(f.ui.state.balance,13464,'only the human bet and human payout affect the server gold wallet');
 assert.equal(f.room().status,'betting');assert.equal(f.room().players.find(p=>p.computer).result,null);
 assert.equal(d.getElementById('computerResult').hidden,false);assert.match(d.getElementById('computerResult').textContent,/컴퓨터.*17,820 G.*17,320 G/);
 assert.equal(d.getElementById('wheelDialog').open,false);assert.equal(f.ui.state.pending,null);assert.deepEqual(clone(f.ui.state.bets),{});
 assert.equal(d.getElementById('spinButton').disabled,true,'the next solo round requires another manual bet and start');
 d.querySelector('[data-bet="n8"]').click();await tick();assert.equal(d.getElementById('computerResult').hidden,true,'new betting clears the previous computer result');
});

test('the motion button can override OS reduction in either direction and remembers an explicit off choice',async t=>{
 const f=await fixture(t,roomFixture(),{preferences:null,systemReduced:true}),button=f.w.document.getElementById('motionButton');
 assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(f.w.testWheel.reduced,true);
 button.click();await tick();
 assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(f.w.testWheel.reduced,false,'OS reduction cannot force an explicitly disabled setting back on');
 const saved=JSON.parse(f.w.localStorage.getItem('ojjuda.roulette.preferences.v1'));
 assert.equal(saved.reducedOverride,false);
 f.setSystemReduced(false);f.setSystemReduced(true);assert.equal(f.w.testWheel.reduced,false);
 button.click();await tick();f.setSystemReduced(false);
 assert.equal(f.w.testWheel.reduced,true,'an explicit on choice also takes precedence over OS off');
 const restored=await fixture(t,roomFixture(),{preferences:saved,systemReduced:true});
 assert.equal(restored.w.testWheel.reduced,false,'explicit off survives a fresh load');
});

test('an inherited motion preference follows OS changes even after unrelated preferences are saved',async t=>{
 const f=await fixture(t,roomFixture(),{preferences:{sound:false,reduced:false},systemReduced:false});
 assert.equal(f.w.testWheel.reduced,false);
 f.setSystemReduced(true);assert.equal(f.w.testWheel.reduced,true,'legacy default false still inherits the operating system');
 f.w.document.getElementById('soundButton').click();await tick();
 const saved=JSON.parse(f.w.localStorage.getItem('ojjuda.roulette.preferences.v1'));
 assert.equal(saved.sound,true);assert.equal(saved.reducedOverride,null,'saving sound does not silently make motion explicit');
 f.setSystemReduced(false);assert.equal(f.w.testWheel.reduced,false);
});

test('legacy reduced true remains enabled until the player explicitly turns it off',async t=>{
 const f=await fixture(t,roomFixture(),{preferences:{sound:false,reduced:true},systemReduced:false});
 assert.equal(f.w.testWheel.reduced,true);assert.equal(f.ui.state.sound,false);
 f.setSystemReduced(true);f.setSystemReduced(false);assert.equal(f.w.testWheel.reduced,true);
 f.w.document.getElementById('motionButton').click();await tick();
 const saved=JSON.parse(f.w.localStorage.getItem('ojjuda.roulette.preferences.v1'));
 assert.equal(saved.reducedOverride,false);assert.equal(saved.sound,false,'changing motion preserves the sound preference');
});

test('past-number chart counts the latest five hundred results and orders numbers by their last appearance',async t=>{
 const f=await fixture(t),d=f.w.document;
 const history=[7,7,0,8,0,...Array.from({length:495},(_,i)=>i%2?8:36),...Array(100).fill(1)];
 const retained=history.slice(0,500);
 f.ui.state.history=f.w.normalizeState({version:1,history}).history;
 assert.deepEqual(clone(f.ui.state.history),retained,'six hundred input results retain only the latest five hundred');
 f.ui.applySnapshot(f.snapshot());
 const before={balance:f.ui.state.balance,bets:clone(f.ui.state.bets),calls:f.calls.length};
 assert.equal(d.getElementById('historyButton').hidden,false);
 d.getElementById('historyButton').click();
 assert.equal(d.getElementById('historyDialog').open,true);
 const rows=[...d.querySelectorAll('#historyList li')];
 assert.deepEqual(rows.map(row=>Number(row.querySelector('.history-number').textContent)),[7,0,8,36],
  'newest appearances determine row order, not numeric order or the largest frequency');
 const counts=rows.map(row=>parseInt(row.querySelector('.history-frequency').textContent,10));
 assert.deepEqual(counts,[2,2,248,248],'discarded older occurrences never contribute to the chart');
 assert.equal(counts.reduce((sum,count)=>sum+count,0),500,'frequencies add up to the retained result count');
 assert.deepEqual(rows.map(row=>row.querySelector('.history-order').textContent),['최신','2회 전','3회 전','5회 전']);
 assert.equal(rows[1].querySelector('.history-number').classList.contains('green'),true,'zero keeps its green color');
 assert.equal(rows[1].querySelector('.history-bar').classList.contains('green'),true);
 assert.equal(rows[2].querySelector('.history-bar').classList.contains('black'),true);
 const widths=rows.map(row=>parseFloat(row.querySelector('.history-bar').style.width));
 assert.equal(widths[0],widths[1]);assert.equal(widths[2],100);assert.equal(widths[3],100);
 assert.ok(Math.abs(widths[0]*124-100)<1e-8,'bar length scales with count even when the newest number is uncommon');
 assert.equal(rows.every(row=>row.querySelector('.history-bar-track').getAttribute('aria-hidden')==='true'),true,
  'decorative bars do not repeat the visible number, recency and count for assistive technology');
 assert.deepEqual([...d.querySelectorAll('#history .history-number')].map(node=>Number(node.textContent)),retained.slice(0,15));
 assert.equal(d.getElementById('historyCount').textContent,'최근 500회 · 최근 나온 번호순');
 assert.equal(d.getElementById('historyEmpty').hidden,true);
 d.getElementById('closeHistory').click();
 assert.equal(d.getElementById('historyDialog').open,false);
 assert.deepEqual(clone(f.ui.state.history),retained);
 assert.deepEqual({balance:f.ui.state.balance,bets:clone(f.ui.state.bets),calls:f.calls.length},before,
  'viewing past numbers never settles, bets, or fetches a new outcome');
});

test('past-number history excludes pending and unacknowledged results but keeps consecutive equal outcomes from distinct rounds',async t=>{
 const f=await fixture(t),w=f.w,d=w.document;
 d.getElementById('historyButton').click();
 assert.equal(d.getElementById('historyEmpty').hidden,false);
 beginHistoryRound(f,'history-spin-one');
 assert.equal(d.getElementById('historyDialog').open,false,'a new spin closes history before showing the wheel');
 assert.deepEqual(clone(f.ui.state.history),[],'an in-progress server outcome is not past history');
 assert.equal(d.querySelectorAll('#historyList li').length,0);
 w.testWheel.callbacks.onDone('history-spin-one');
 assert.deepEqual(clone(f.ui.state.history),[],'the animation ending does not count as settlement');
 const gate=deferred();f.gates.set('confirm',gate);
 d.getElementById('confirmResultButton').click();await tick();
 assert.deepEqual(clone(f.ui.state.history),[],'an unanswered confirmation does not publish history');
 assert.equal(w.localStorage.getItem(historyKey(me)),null,'neither a pending result nor its unanswered confirmation is persisted');
 gate.resolve();await tick();await tick();await tick();f.gates.delete('confirm');
 assert.deepEqual(clone(f.ui.state.history),[7]);
 assert.equal(d.querySelector('#historyList .history-frequency').textContent,'1회');
 await confirmHistoryRound(f,'history-spin-two');
 f.ui.applySnapshot(f.snapshot());
 assert.deepEqual(clone(f.ui.state.history),[7,7],'two settled round IDs remain two entries even with equal numbers');
 d.getElementById('historyButton').click();
 assert.deepEqual([...d.querySelectorAll('#historyList li .history-number')].map(node=>Number(node.textContent)),[7]);
 assert.equal(d.querySelector('#historyList .history-frequency').textContent,'2회','consecutive identical outcomes increment the same number bar');
 assert.equal(d.getElementById('historyCount').textContent,'최근 2회 · 최근 나온 번호순');
 assert.deepEqual(JSON.parse(w.localStorage.getItem(historyKey(me))),{version:1,owner:me,entries:[{id:'history-spin-two',number:7},{id:'history-spin-one',number:7}]},
  'only round IDs and confirmed numbers are stored, without wallet, bet or pending state');
 const reopened=await fixture(t,roomFixture({id:'room-reopened'}),{storage:storageSnapshot(w)});
 assert.deepEqual(clone(reopened.ui.state.history),[7,7],'a fresh app instance restores both equal confirmed outcomes');
 assert.equal(reopened.w.document.querySelector('#historyList .history-frequency').textContent,'2회');
 assert.equal(reopened.ui.state.balance,10000,'history restoration keeps the authoritative server wallet');
});

test('local and remote confirmations retain five hundred results across reentry without counting a saved round twice',async t=>{
 const entries=Array.from({length:500},(_,index)=>({id:`history-seed-${index}`,number:index===499?36:8}));
 const f=await fixture(t,roomFixture(),{storage:historyStorage(entries)}),w=f.w,d=w.document;
 await confirmHistoryRound(f,'history-cap-local',7);
 assert.deepEqual(clone(f.ui.state.history),[7,...Array(499).fill(8)],'local confirmation removes exactly the oldest retained result');
 const localSaved=JSON.parse(w.localStorage.getItem(historyKey(me))).entries;
 assert.equal(localSaved.length,500);assert.deepEqual(localSaved[0],{id:'history-cap-local',number:7});
 beginHistoryRound(f,'history-cap-remote',0);
 assert.equal(f.ui.state.history[0],7,'an unacknowledged new result does not appear in the chart');
 f.room().status='finished';f.room().me.confirmed=true;f.ui.applySnapshot(f.snapshot());
 const expected=[0,7,...Array(498).fill(8)];
 assert.deepEqual(clone(f.ui.state.history),expected,'remote acknowledgement uses the same five-hundred-result window');
 f.ui.applySnapshot(f.snapshot());
 assert.deepEqual(clone(f.ui.state.history),expected,'a repeated confirmed snapshot cannot increment the count again');
 assert.deepEqual([...d.querySelectorAll('#historyList .history-frequency')].map(node=>node.textContent),['1회','1회','498회']);
 const remoteSaved=JSON.parse(w.localStorage.getItem(historyKey(me))).entries;
 assert.equal(remoteSaved.length,500);assert.deepEqual(remoteSaved[0],{id:'history-cap-remote',number:0});
 const reopened=await fixture(t,roomFixture({id:'room-reentry'}),{storage:storageSnapshot(w)});
 assert.deepEqual(clone(reopened.ui.state.history),expected,'remote confirmation and zero survive a new app instance');
 const before=storageSnapshot(reopened.w);
 beginHistoryRound(reopened,'history-cap-local',7);
 reopened.room().status='finished';reopened.room().me.confirmed=true;reopened.ui.applySnapshot(reopened.snapshot());
 assert.deepEqual(clone(reopened.ui.state.history),expected,'an older saved round is not recounted or moved to the front after reentry');
 assert.deepEqual(storageSnapshot(reopened.w),before);
 assert.equal(reopened.calls.some(call=>call.action==='confirm'),false,'history replay never requests another payout');
 assert.equal(reopened.ui.state.balance,10000);
});

test('past-number history survives room changes and leaving the table while the dialog closes on exit',async t=>{
 const saved=historyStorage([{id:'history-room-seven',number:7},{id:'history-room-zero',number:0}]);
 const f=await fixture(t,roomFixture(),{storage:saved}),d=f.w.document;
 d.getElementById('historyButton').click();
 assert.equal(d.getElementById('historyDialog').open,true);
 f.ui.applySnapshot({...f.snapshot(),room:roomFixture({id:'room-two',code:'BBCCDD22'})});
 assert.deepEqual(clone(f.ui.state.history),[7,0]);
 assert.deepEqual([...d.querySelectorAll('#historyList .history-number')].map(node=>Number(node.textContent)),[7,0],
  'the same account keeps its confirmed numbers across tables');
 assert.equal(d.getElementById('historyEmpty').hidden,true);
 d.getElementById('historyButton').click();
 assert.equal(d.getElementById('historyDialog').open,true);
 f.message({type:'roulette-exit-request'});await tick();await tick();await tick();
 assert.equal(f.ui.getRoom(),null);
 assert.equal(d.getElementById('historyDialog').open,false);
 assert.equal(d.getElementById('historyButton').hidden,true);
 assert.deepEqual(clone(f.ui.state.history),[7,0]);
 assert.equal(f.w.localStorage.getItem(historyKey(me)),saved[historyKey(me)],'leaving does not erase the saved history');
});

test('different accounts have separate saved histories and the original account restores its own results on login',async t=>{
 const first=await fixture(t);await confirmHistoryRound(first,'account-a-round',7);
 const storage=storageSnapshot(first.w),accountB=roomFixture();accountB.me.userId=other;
 const second=await fixture(t,accountB,{owner:other,storage});
 assert.deepEqual(clone(second.ui.state.history),[],'a new account never displays the previous account history');
 assert.equal(second.w.document.getElementById('historyEmpty').hidden,false);
 await confirmHistoryRound(second,'account-b-round',0);
 assert.deepEqual(clone(second.ui.state.history),[0]);
 assert.equal(second.w.localStorage.getItem(historyKey(me)),storage[historyKey(me)],'saving account B does not overwrite account A');
 assert.deepEqual(JSON.parse(second.w.localStorage.getItem(historyKey(other))),{version:1,owner:other,entries:[{id:'account-b-round',number:0}]});
 const returned=await fixture(t,roomFixture(),{storage:storageSnapshot(second.w)});
 assert.deepEqual(clone(returned.ui.state.history),[7],'logging back in as account A restores only its own confirmed round');
 assert.equal(returned.ui.state.balance,10000);
 assert.deepEqual(clone(returned.ui.state.bets),{});
});

test('history restoration rejects corrupt documents and validates entries before enforcing the five hundred result limit',async t=>{
 const invalidDocuments=[['broken JSON','{'],['wrong version',JSON.stringify({version:2,owner:me,entries:[{id:'invalid-version',number:7}]})],
  ['wrong owner',JSON.stringify({version:1,owner:other,entries:[{id:'another-owner',number:7}]})],
  ['non-array entries',JSON.stringify({version:1,owner:me,entries:{id:'invalid-shape',number:7}})]];
 for(const [label,value] of invalidDocuments){
  await t.test(label,async t=>{
   const f=await fixture(t,roomFixture(),{storage:{[historyKey(me)]:value}});
   assert.deepEqual(clone(f.ui.state.history),[]);assert.equal(f.ui.state.balance,10000);
   assert.equal(f.w.document.getElementById('historyEmpty').hidden,false);
   await confirmHistoryRound(f,`recovered-${label.replaceAll(' ','-')}`,0);
   assert.deepEqual(clone(f.ui.state.history),[0],'a bad stored document does not block later confirmation or saving');
   assert.equal(JSON.parse(f.w.localStorage.getItem(historyKey(me))).entries.length,1);
  });
 }
 const valid=Array.from({length:505},(_,index)=>({id:`validated-${index}`,number:index%37}));
 const mixed=[{id:'zero',number:0},{id:'seven',number:7},{id:'seven',number:36},{id:'another-seven',number:7},null,{},
  {id:'',number:8},{id:' padded ',number:8},{id:'x'.repeat(129),number:8},{id:5,number:8},
  {id:'fraction',number:2.5},{id:'negative',number:-1},{id:'outside-wheel',number:37},{id:'number-string',number:'8'},...valid];
 const f=await fixture(t,roomFixture(),{storage:historyStorage(mixed)});
 const expected=[0,7,7,...valid.map(entry=>entry.number)].slice(0,500);
 assert.deepEqual(clone(f.ui.state.history),expected,'invalid entries and duplicate IDs are removed before taking the newest five hundred');
 assert.equal(f.w.document.getElementById('historyCount').textContent,'최근 500회 · 최근 나온 번호순');
 assert.equal(f.ui.state.balance,10000);assert.equal(f.ui.state.pending,null);assert.deepEqual(clone(f.ui.state.bets),{});
});

test('a confirmation merges newer same-account storage without losing another app instance result',async t=>{
 const original={id:'already-saved',number:7},external={id:'other-instance-confirmed',number:0};
 const f=await fixture(t,roomFixture(),{storage:historyStorage([original])});
 f.w.localStorage.setItem(historyKey(me),historyStorage([external,original])[historyKey(me)]);
 assert.deepEqual(clone(f.ui.state.history),[7],'the running instance still has its previous in-memory snapshot');
 await confirmHistoryRound(f,'this-instance-confirmed',36);
 const expected=[{id:'this-instance-confirmed',number:36},external,original];
 assert.deepEqual(JSON.parse(f.w.localStorage.getItem(historyKey(me))).entries,expected,
  'reading the current stored record before writing preserves another instance confirmation');
 assert.deepEqual(clone(f.ui.state.history),[36,0,7]);
 assert.equal(f.calls.filter(call=>call.action==='confirm').length,1);
});

test('unavailable or full local storage never prevents a paid game from settling or changes the authoritative gold',async t=>{
 for(const storageThrows of [['getItem','setItem'],['setItem']]){
  await t.test(storageThrows.length===2?'storage access denied':'storage quota exceeded',async t=>{
   const r=roomFixture();r.players[1].ready=true;
   const f=await fixture(t,r,{storageThrows,systemReduced:true}),d=f.w.document;
   d.querySelector('[data-bet="n7"]').click();await tick();
   d.getElementById('spinButton').click();await tick();await tick();
   assert.equal(f.ui.state.balance,9900,'the synthetic server escrows exactly one 100 G bet');
   f.w.testWheel.callbacks.onDone('spin-one');d.getElementById('confirmResultButton').click();await tick();await tick();await wait(30);
   assert.deepEqual(clone(f.ui.state.history),[7],'the current session keeps its result even if persistence fails');
   assert.equal(f.ui.state.balance,13464,'the server payout, including its existing fee, still reaches the wallet');
   assert.equal(f.ui.state.pending,null);assert.equal(d.getElementById('wheelDialog').open,false);
   assert.equal(f.calls.filter(call=>call.action==='confirm').length,1);
   assert.ok(f.storageFailures.some(failure=>failure.method==='setItem'&&failure.key===historyKey(me)),'the save failure was actually exercised');
   if(storageThrows.includes('getItem'))assert.ok(f.storageFailures.some(failure=>failure.method==='getItem'&&failure.key===historyKey(me)));
   f.message({type:'roulette-exit-request'});await tick();await tick();await tick();
   assert.equal(f.ui.getRoom(),null,'failed storage does not block leaving the game');
  });
 }
 await t.test('a later successful save includes a result confirmed while storage was full',async t=>{
  const entries=Array.from({length:500},(_,index)=>({id:`quota-seed-${index}`,number:8}));
  const f=await fixture(t,roomFixture(),{storage:historyStorage(entries)}),w=f.w;
  const stored=w.localStorage.getItem(historyKey(me)),setItem=w.Storage.prototype.setItem;
  w.Storage.prototype.setItem=function(key,value){if(key===historyKey(me))throw new w.DOMException('Synthetic full storage','QuotaExceededError');return setItem.call(this,key,value)};
  await confirmHistoryRound(f,'confirmed-during-quota-error',0);
  assert.equal(w.localStorage.getItem(historyKey(me)),stored,'a failed write leaves the previous stored record intact');
  assert.deepEqual(clone(f.ui.state.history),[0,...Array(499).fill(8)]);
  w.Storage.prototype.setItem=setItem;
  await confirmHistoryRound(f,'confirmed-after-quota-recovery',7);
  const expected=[{id:'confirmed-after-quota-recovery',number:7},{id:'confirmed-during-quota-error',number:0},...entries.slice(0,498)];
  assert.deepEqual(JSON.parse(w.localStorage.getItem(historyKey(me))).entries,expected,
   'the formerly unsaved result stays ahead of old stored entries when the next write succeeds');
  assert.deepEqual(clone(f.ui.state.history),[7,0,...Array(498).fill(8)]);
  assert.equal(f.ui.state.balance,10000);
 });
});
