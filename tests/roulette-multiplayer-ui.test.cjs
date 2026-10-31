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
const roomFixture=patch=>({id:'room-one',code:'ABCDEF12',hostId:other,mode:'online',status:'betting',round:0,capacity:3,players:[{userId:me,name:'나',computer:false,ready:false,connected:true,bets:{}},{userId:other,name:'친구',computer:false,ready:false,connected:true,bets:{n7:500}}],me:{userId:me,ready:false,confirmed:false,bets:{},stake:0},spin:null,result:null,...patch});

async function fixture(t,initial=roomFixture(),options={}){
 const engine=await import(pathToFileURL(path.join(root,'games/roulette/engine.js')).href);
 const dom=new JSDOM(read('games/roulette/index.html'),{url:'https://roulette.test/games/roulette/index.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],sent=[],gates=new Map();let current=clone(initial),gold=10000,time=options.serverTime||Date.now(),clock=0,closed=false,hidden=false;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 w.performance.now=()=>clock;
 w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>0;w.scrollTo=()=>{};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLElement.prototype.animate=function(){return {finished:Promise.resolve()}};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 Object.defineProperty(w.document,'hidden',{get:()=>hidden});
 class Wheel{constructor(canvas,callbacks){this.callbacks=callbacks;w.testWheel=this;}resize(){}setReduced(){}setVisible(){}start(spin){this.last=spin;}showResult(){}}
 class Sound{unlock(){return Promise.resolve()}setEnabled(){}chip(){}beginRoll(){}stopRoll(){}win(){}roll(){}updateRoll(){}}
 Object.assign(w,engine,{RouletteWheel:Wheel,Sound,addChipDepth(){}});
 w.localStorage.setItem('ojjuda.roulette.preferences.v1',JSON.stringify({sound:false,reduced:true}));
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
 message({type:'roulette-init',owner:me,joinCode:options.joinCode});await tick();await tick();
 t.after(()=>{closed=true;w.close()});
 return {w,calls,sent,gates,message,room:()=>current,hide:()=>{hidden=true},advance:ms=>{clock+=ms;time+=ms},snapshot,ui:w.__roulette};
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
