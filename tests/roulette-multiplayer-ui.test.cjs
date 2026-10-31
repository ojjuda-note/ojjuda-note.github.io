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
const roomFixture=patch=>({id:'room-one',code:'ABCDEF12',hostId:other,status:'betting',round:0,capacity:3,players:[{userId:me,name:'나',ready:false,connected:true,bets:{}},{userId:other,name:'친구',ready:false,connected:true,bets:{n7:500}}],me:{userId:me,ready:false,confirmed:false,bets:{},stake:0},spin:null,result:null,...patch});

async function fixture(t,initial=roomFixture()){
 const engine=await import(pathToFileURL(path.join(root,'games/roulette/engine.js')).href);
 const dom=new JSDOM(read('games/roulette/index.html'),{url:'https://roulette.test/games/roulette/index.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],sent=[],gates=new Map();let current=clone(initial),gold=10000,time=Date.now(),closed=false,hidden=false;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
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
 const server=async body=>{
  calls.push(clone(body));if(gates.has(body.action))await gates.get(body.action).promise;
  if(body.action==='bet'){
   if(current.me.ready)throw Error('already_ready');
   current.me.bets=clone(body.bets);current.players.find(p=>p.userId===me).bets=clone(body.bets);
  }else if(body.action==='ready'){
   const next=body.ready!==false,stake=next?engine.totalBets(body.bets||current.me.bets):0;
   gold+=current.me.stake-stake;current.me={...current.me,ready:next,bets:next?clone(body.bets):{},stake};
   Object.assign(current.players.find(p=>p.userId===me),{ready:next,bets:clone(current.me.bets)});
   if(next&&current.players.length>=2&&current.players.every(p=>p.ready)){
    current.status='spinning';current.round++;
    current.spin={id:'spin-one',number:7,duration:20000,startedAt:time,variation:.5,bets:clone(current.me.bets)};
   }
  }else if(body.action==='confirm'){
   gold+=engine.payout(current.spin.bets,current.spin.number).total;current.status='finished';current.me.confirmed=true;
  }else if(body.action==='leave')current=null;
  const result=snapshot();if(body.action==='list')result.rooms=[];return result;
 };
 const parent={postMessage(message){sent.push(clone(message));if(message.type!=='rpc')return;Promise.resolve().then(()=>server(message.body)).then(data=>reply(message.id,data),error=>reply(message.id,null,error.message));}};
 Object.defineProperty(w,'parent',{value:parent});
 function reply(id,data,error=null){if(closed)return;w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:parent,data:{source:'ojjuda-world',type:'roulette-rpc',id,data,error}}))}
 const source=read('games/roulette/app.js').replace(/^import .*;\n/gm,'')+'\nwindow.__roulette={state,applySnapshot,getRoom:()=>room,readyId:()=>resultReadyId,hasExit:()=>exitRequested};';
 w.eval(source);
 const message=data=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:parent,data:{source:'ojjuda-world',...data}}));
 message({type:'roulette-init',owner:me});await tick();await tick();
 t.after(()=>{closed=true;w.close()});
 return {w,calls,sent,gates,message,room:()=>current,hide:()=>{hidden=true},snapshot,ui:w.__roulette};
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
