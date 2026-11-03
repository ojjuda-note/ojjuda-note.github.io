const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'../games/spot-difference'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const core=require('../games/spot-difference/game-core.js'),key='jjuda-spot-six-v1',owner='11111111-1111-4111-8111-111111111111';
const spots=[{x:20,y:20,rx:4,ry:4,text:'하나'},{x:50,y:50,rx:4,ry:4,text:'둘'},{x:80,y:80,rx:4,ry:4,text:'셋'}];
const puzzles=[{id:30,difficulty:'hard'},{id:10},{id:50,difficulty:'very-hard'},{id:20},{id:40,difficulty:'hard'}].map(p=>({...p,title:`그림 ${p.id}`,spots,original:'/fixture.svg',difference:'/fixture.svg'}));
const order=[1,3,0,4,2],flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,stored,{admin=false,storageBlocked=false,buy}={}){
  const dom=new JSDOM(read('index.html'),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,$=id=>d.getElementById(id);t.after(()=>w.close());
  let now=100000;const ticks=[],charges=[],records=[],tools=[];
  w.Date.now=()=>now;w.setInterval=fn=>ticks.push(fn);w.scrollTo=()=>{};w.confirm=()=>true;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  d.modelContext={registerTool:tool=>tools.push(tool)};
  w.JjudaWallet={getState:()=>({userId:owner,coins:100,canViewAnswers:admin}),subscribe:fn=>fn({userId:owner,coins:100,canViewAnswers:admin}),refresh:async()=>{},recordClear:async(userId,stage)=>{records.push({userId,stage});return {ok:true};},buy:async(request,stage)=>{charges.push({...request,stage});return buy?buy(request,stage):{ok:true,kind:request.kind,stage,spot:request.spot,price:1,extend_ms:60000};}};
  w.JJUDA_PUZZLES=JSON.parse(JSON.stringify(puzzles));w.eval(read('game-core.js'));
  if(stored)w.localStorage.setItem(key,JSON.stringify(stored));
  if(storageBlocked)w.Storage.prototype.setItem=function(){throw Error('blocked');};
  w.eval(read('app.js'));
  const state=()=>JSON.parse(w.localStorage.getItem(key)),current=()=>Number($('stage-picker').value);
  const load=()=>{for(const image of d.querySelectorAll('img'))image.onload?.();};
  const select=index=>{$('stage-picker').value=index;$('stage-picker').dispatchEvent(new w.Event('change'));load();};
  const round=()=>state().rounds[puzzles[state().current].id];
  const tap=(x,y)=>{const surface=$('original').parentElement;surface.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:1000});const init={bubbles:true,clientX:x*10,clientY:y*10};surface.dispatchEvent(new w.MouseEvent('pointerdown',init));surface.dispatchEvent(new w.MouseEvent('click',init));};
  const solve=()=>{load();$('start').click();for(const spot of spots)tap(spot.x,spot.y);};
  const advance=ms=>{now+=ms;for(const tick of ticks)tick();};
  load();return {w,d,$,state,current,round,load,select,tap,solve,advance,charges,records,tools};
}

test('only the first picture is selectable; a native select change, automation tool and stale Next cannot skip',t=>{
  const f=fixture(t,null,{admin:true}),first=order[0];
  assert.equal(f.current(),first);
  assert.deepEqual(Array.from(f.$('stage-picker').options,o=>[Number(o.value),o.disabled]),order.map(i=>[i,i!==first]));
  for(const index of order.slice(1)){
    f.select(index);assert.equal(f.current(),first);assert.equal(f.state().current,first);
    assert.throws(()=>f.tools.find(tool=>tool.name==='open_game_stage').execute({stage:index+1}),/앞선 그림/);
  }
  for(const id of ['next','continue','celebration-next','retry-next'])f.$(id).onclick();
  assert.equal(f.current(),first);assert.deepEqual(f.records,[]);assert.deepEqual(f.charges,[]);
  assert.equal(f.$('reveal-answers').hidden,false,'answer-view privilege does not unlock stages');
});

test('partial answers, time expiry and failed retry keep the next picture locked',t=>{
  const f=fixture(t);f.$('start').click();f.tap(20,20);f.tap(50,50);
  assert.equal(f.round().status,'playing');assert.equal(f.state().completed.length,0);
  f.select(order[1]);assert.equal(f.current(),order[0]);
  f.advance(61000);assert.equal(f.round().status,'lost');
  f.$('retry-next').onclick();assert.equal(f.current(),order[0]);
  f.$('retry-current').click();f.load();assert.equal(f.round().status,'playing');
  for(let i=0;i<3;i++)f.tap(97,3);
  assert.equal(f.round().status,'lost');assert.equal(f.$('stage-picker').options[1].disabled,true);
  const again=fixture(t,f.state());assert.equal(again.current(),order[0]);assert.equal(again.$('stage-picker').options[1].disabled,true);
});

test('a complete picture opens exactly the next difficulty-ordered picture and persists across reentry',async t=>{
  const f=fixture(t);f.solve();await flush();
  assert.deepEqual(f.state().completed,[10]);assert.deepEqual(f.records,[{userId:owner,stage:10}]);
  assert.deepEqual(Array.from(f.$('stage-picker').options,o=>o.disabled),[false,false,true,true,true]);
  f.$('celebration-next').onclick();f.load();assert.equal(f.current(),order[1]);
  f.$('celebration-next').onclick();assert.equal(f.current(),order[1]);
  const again=fixture(t,f.state());assert.equal(again.current(),order[1]);assert.equal(again.round().status,'ready');
  again.select(order[0]);assert.equal(again.current(),order[0]);
  assert.deepEqual(again.state().completed,[10]);assert.deepEqual(again.records,[]);
  again.select(order[1]);again.solve();again.$('celebration-next').onclick();again.load();
  assert.equal(again.current(),order[2],'the next tier follows display order, not raw array position');
});

test('legacy selected or inflated unlock values do not grant access, and real out-of-order clears remain replayable',t=>{
  const f=fixture(t,{version:2,current:order[4],unlockedStage:999,unlocked:999,completed:[30],found:{50:[0,1]}});
  assert.equal(f.current(),order[0]);assert.deepEqual(f.state().completed,[30]);
  f.select(order[2]);assert.equal(f.current(),order[2],'an actual past clear can be replayed');
  f.solve();assert.equal(f.round().status,'won');
  const before=f.state();
  f.$('celebration-next').onclick();f.$('next').onclick();f.$('continue').onclick();
  assert.deepEqual(f.state(),before,'replaying an isolated clear cannot open later uncleared pictures or reset their rounds');
  f.select(order[3]);assert.equal(f.current(),order[2]);
  f.select(order[0]);f.solve();f.$('celebration-next').click();f.load();f.solve();
  assert.equal(core.canSelectPuzzle(f.state(),puzzles,order[3]),true,'filling the earlier gap advances across the preserved clear');
});

test('legacy complete answer sets survive migration; a failed or partial round is not a clear',t=>{
  const f=fixture(t,{version:2,current:order[1],found:{10:[0,1,2],20:[0,1]},rounds:{20:{...core.freshRound(),status:'lost'}}});
  assert.deepEqual(f.state().completed,[10]);assert.equal(f.current(),order[1]);
  assert.equal(f.$('stage-picker').options[2].disabled,true);
});

test('a locked picture can recover its exact pending receipt without unlocking or starting it, and keeps the paid help',async t=>{
  const pending={requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userId:owner,kind:'hint',spot:2};
  const f=fixture(t,{version:2,current:order[2],rounds:{30:{...core.freshRound(),status:'payment',pending,rankOwner:owner}}});
  assert.equal(f.current(),order[2]);assert.equal(f.round().status,'payment');
  assert.match(f.$('stage-picker').selectedOptions[0].textContent,/구매 확인/);
  f.$('start').click();await flush();
  assert.deepEqual(f.charges,[{...pending,stage:30}]);assert.equal(f.current(),order[0]);
  assert.deepEqual(f.state().completed,[]);assert.equal(f.state().rounds[30].status,'ready');
  assert.equal(f.state().rounds[30].deferredHelp,true);assert.deepEqual(f.state().rounds[30].paid,[2]);
  assert.equal(f.$('stage-picker').options[2].disabled,true);
  const again=fixture(t,f.state());assert.equal(again.current(),order[0]);assert.deepEqual(again.state().rounds[30].paid,[2]);
  again.solve();again.$('celebration-next').click();again.load();again.solve();again.$('celebration-next').click();again.load();
  assert.equal(again.current(),order[2]);assert.equal(again.round().status,'playing');
  assert.deepEqual(again.round().paid,[2]);assert.equal(again.round().deferredHelp,undefined);
  assert.deepEqual(again.charges,[],'using the deferred help never creates another charge');
});

test('a rejected recovery cannot start a locked picture or erase another pending receipt',async t=>{
  const pending={requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userId:owner,kind:'time',spot:-1};
  const other={...pending,requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
  const f=fixture(t,{version:2,current:order[2],rounds:{30:{...core.freshRound(),status:'payment',pending},40:{...core.freshRound(),status:'payment',pending:other}}},{buy:()=>({ok:false,reason:'coins'})});
  f.$('start').click();await flush();
  assert.equal(f.current(),order[0]);assert.equal(f.state().rounds[30].pending,null);
  assert.equal(f.state().rounds[30].status,'ready');assert.deepEqual(f.state().rounds[40].pending,other);
  assert.deepEqual(f.state().completed,[]);assert.deepEqual(f.records,[]);
});

test('storage failure still enforces locks and opens only the next picture for the current visit',t=>{
  const f=fixture(t,null,{storageBlocked:true});f.select(order[4]);assert.equal(f.current(),order[0]);
  f.solve();assert.equal(f.$('stage-picker').options[1].disabled,false);assert.equal(f.$('stage-picker').options[2].disabled,true);
  f.$('celebration-next').click();f.load();assert.equal(f.current(),order[1]);
  f.select(order[3]);assert.equal(f.current(),order[1]);
});
