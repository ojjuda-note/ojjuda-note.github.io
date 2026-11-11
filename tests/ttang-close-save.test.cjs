const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {randomUUID}=require('node:crypto');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

function fixture(t,{owner='member-a',preview=false,blockedStorage=false}={}){
 const dom=new JSDOM('<body><button id="entry">게임</button></body>',{url:'https://fixture.test/world.html',runScripts:'outside-only'}),w=dom.window;
 let activeOwner=owner,submit=async()=>({ok:true}),frame,outcome=null,dispose=()=>Promise.resolve(),disposals=0,finished=0;
 const calls=[],timers=new Map(),setTimeout=w.setTimeout.bind(w),clearTimeout=w.clearTimeout.bind(w);let timerId=-1;
 w.setTimeout=(callback,delay,...args)=>{
  if(delay===30000){const id=timerId--;timers.set(id,()=>callback(...args));return id;}
  return setTimeout(callback,delay,...args);
 };
 w.clearTimeout=id=>{if(!timers.delete(id))clearTimeout(id);};
 if(blockedStorage)for(const method of ['getItem','setItem','removeItem'])w.Storage.prototype[method]=()=>{throw Error('storage blocked');};
 w.OjjudaAdminPreview={isEnabled:()=>preview};w.OjjudaGuestAccess={finished:()=>{finished++;}};
 w.eval(read('games/ttang/ttang-bridge.js'));
 const bridge=w.OjjudaTtangBridge;
 const open=()=>{
  const scoreOwner=activeOwner;
  bridge.open({owner:scoreOwner,authorized:()=>activeOwner===scoreOwner,onResult:(won,round)=>{calls.push({owner:scoreOwner,won,round});return submit(won,round);}});
  frame=w.document.querySelector('iframe');outcome=null;
  frame.contentWindow.OjjudaTtang={result:()=>outcome,dispose:()=>{disposals++;return dispose();}};
 };
 const send=data=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:frame.contentWindow,data}));
 const start=(round=randomUUID(),mode='solo')=>{outcome=null;send({type:'ojjuda:ttang:start',round,mode});return round;};
 const finish=(round,win=true,mode='solo',post=true)=>{outcome={round,win,mode};if(post)send({type:'ojjuda:ttang:result',...outcome});};
 open();t.after(()=>w.close());
 return {w,bridge,calls,timers,open,start,finish,send,
  get frame(){return frame;},get overlay(){return w.document.querySelector('#ttang-overlay');},
  get status(){return w.document.querySelector('#ttang-save-status')?.textContent||'';},
  get retry(){return w.document.querySelector('#ttang-save-status button');},
  get disposals(){return disposals;},get finished(){return finished;},
  submit:handler=>{submit=handler;},dispose:handler=>{dispose=handler;},owner:value=>{activeOwner=value;},
  expire:()=>{const callbacks=[...timers.values()];timers.clear();for(const callback of callbacks)callback();}};
}

for(const blockedStorage of [false,true])test('Territory close waits for one completed result'+(blockedStorage?' with storage blocked':''),async t=>{
 const f=fixture(t,{blockedStorage}),receipt=deferred();f.submit(()=>receipt.promise);
 const round=f.start();f.finish(round);await tick();
 const overlay=f.overlay,closing=f.bridge.close();
 assert.equal(f.bridge.close(),closing,'repeated closes share the same save');
 await tick();assert.equal(f.overlay,overlay);assert.equal(f.frame.inert,true);assert.equal(f.disposals,0);
 assert.deepEqual(f.calls,[{owner:'member-a',won:true,round}]);
 receipt.resolve({ok:true});assert.notEqual(await closing,false);
 assert.equal(f.overlay,null);assert.equal(f.disposals,1);assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
 assert.equal(await f.bridge.close(),true);assert.equal(f.calls.length,1);
});

for(const failure of ['rejected','exception'])test('Territory retains a failed '+failure+' close and retries the same result',async t=>{
 const f=fixture(t),receipt=deferred();f.submit(()=>receipt.promise);
 const round=f.start();f.finish(round,false);await tick();
 const closing=f.bridge.close();await tick();
 if(failure==='exception')receipt.reject(Error('offline'));else receipt.resolve({ok:false});
 assert.equal(await closing,false);
 assert.ok(f.overlay);assert.equal(f.disposals,0);assert.equal(f.frame.inert,false);
 assert.match(f.status,/저장하지 못했어요/);assert.ok(f.retry);assert.equal(f.calls.length,1);
 f.submit(async()=>({ok:true}));f.retry.click();await tick();
 assert.equal(f.overlay,null);assert.equal(f.disposals,1);
 assert.deepEqual(f.calls,[{owner:'member-a',won:false,round},{owner:'member-a',won:false,round}]);
 assert.equal(await f.bridge.close(),true);assert.equal(f.calls.length,2);
});

test('Territory saves an outcome captured just before its result message and never resaves an acknowledged round',async t=>{
 const f=fixture(t),round=f.start();f.finish(round,true,'solo',false);
 assert.equal(f.calls.length,0);assert.notEqual(await f.bridge.close(),false);
 assert.deepEqual(f.calls,[{owner:'member-a',won:true,round}]);
 f.open();const next=f.start();f.finish(next);await tick();assert.match(f.status,/기록했어요/);
 assert.notEqual(await f.bridge.close(),false);assert.equal(f.calls.length,2);assert.equal(f.disposals,2);
});

test('Territory close preserves earlier completed rounds and blocks a new round while leaving',async t=>{
 const f=fixture(t),first=deferred(),second=deferred();
 const one=f.start();f.submit(()=>first.promise);f.finish(one);await tick();
 const two=f.start(undefined,'duo');f.submit(()=>second.promise);f.finish(two,false,'duo');await tick();
 const closing=f.bridge.close();await tick();
 const ignored=randomUUID();f.send({type:'ojjuda:ttang:start',round:ignored,mode:'solo'});
 f.send({type:'ojjuda:ttang:result',round:ignored,mode:'solo',win:true});
 second.resolve({ok:true});first.resolve({ok:false});assert.equal(await closing,false);
 f.submit(async()=>({ok:true}));f.retry.click();await tick();
 assert.equal(f.overlay,null);
 assert.deepEqual(f.calls,[{owner:'member-a',won:true,round:one},{owner:'member-a',won:false,round:two},{owner:'member-a',won:true,round:one}]);
});

test('Territory save timeout releases close and permits an idempotent retry without a late receipt changing it',async t=>{
 const f=fixture(t),first=deferred(),retry=deferred();f.submit(()=>first.promise);
 const round=f.start();f.finish(round);await tick();const closing=f.bridge.close();await tick();
 assert.equal(f.timers.size,1);f.expire();assert.equal(await closing,false);
 assert.ok(f.overlay);assert.ok(f.retry);assert.equal(f.disposals,0);
 f.submit(()=>retry.promise);const nextClose=f.bridge.close();await tick();
 first.resolve({ok:true});await tick();
 assert.ok(f.overlay,'an expired attempt cannot close the screen during its retry');
 assert.match(f.status,/저장하고 있어요/);assert.equal(f.disposals,0);
 retry.resolve({ok:true,duplicate:true});assert.notEqual(await nextClose,false);
 assert.equal(f.overlay,null);assert.equal(f.calls.length,2);assert.equal(f.disposals,1);
 assert.ok(f.calls.every(call=>call.round===round));assert.equal(f.timers.size,0);
});

test('Territory unfinished and excluded rounds close without manufacturing a result and retain the existing handoff wait',async t=>{
 const f=fixture(t),handoff=deferred();f.dispose(()=>handoff.promise);
 f.start(undefined,'duo');let closed=false;const closing=f.bridge.close().then(()=>{closed=true;});
 assert.equal(f.disposals,1,'transport disposal still starts synchronously');assert.equal(f.overlay,null);
 await tick();assert.equal(closed,false);assert.deepEqual(f.calls,[]);
 handoff.resolve();await closing;assert.equal(closed,true);
 f.open();const round=f.start(undefined,'duo');f.finish(round,true,'duo',false);
 f.send({type:'ojjuda:ttang:excluded',round});await f.bridge.close();assert.deepEqual(f.calls,[]);
});

test('Territory preview closes completed games without claiming or sending a saved record',async t=>{
 const f=fixture(t,{preview:true}),round=f.start();f.finish(round);await tick();
 assert.match(f.status,/관리자 체험/);assert.doesNotMatch(f.status,/기록했어요/);assert.deepEqual(f.calls,[]);
 await f.bridge.close();assert.equal(f.overlay,null);assert.deepEqual(f.calls,[]);
});

test('Territory guest retries retain the round and count one finished visit with storage blocked',async t=>{
 const f=fixture(t,{owner:null,blockedStorage:true});f.submit(async()=>({ok:false}));
 const round=f.start();f.finish(round);await tick();assert.equal(f.finished,1);assert.ok(f.retry);
 f.submit(async()=>({ok:true}));f.retry.click();await tick();
 assert.match(f.status,/손님으로 기록했어요/);assert.equal(f.finished,1);
 await f.bridge.close();assert.equal(f.overlay,null);
 assert.deepEqual(f.calls,[{owner:null,won:true,round},{owner:null,won:true,round}]);
});

for(const late of ['success','failure'])test('Territory account change releases close and isolates the old '+late+' receipt',async t=>{
 const f=fixture(t),receipt=deferred();f.submit(()=>receipt.promise);
 const round=f.start();f.finish(round);await tick();const closing=f.bridge.close();await tick();
 f.owner('member-b');await f.bridge.close();assert.notEqual(await closing,false);
 assert.equal(f.overlay,null);f.open();assert.equal(f.status,'월드땅따먹기');
 if(late==='success')receipt.resolve({ok:true});else receipt.reject(Error('offline'));
 await tick();assert.equal(f.status,'월드땅따먹기');assert.equal(f.retry,null);
 assert.deepEqual(f.calls,[{owner:'member-a',won:true,round}]);
 f.submit(async()=>({ok:true}));const next=f.start();f.finish(next);await tick();
 assert.deepEqual(f.calls.at(-1),{owner:'member-b',won:true,round:next});await f.bridge.close();
});

test('Territory account change before close cannot submit a captured old result',async t=>{
 const f=fixture(t),round=f.start();f.finish(round,true,'solo',false);f.owner('member-b');
 await f.bridge.close();assert.equal(f.overlay,null);assert.deepEqual(f.calls,[]);
});

test('World close gate respects Territory save failure and allows exit after its retry',async t=>{
 const f=fixture(t),world=read('world.html');
 const start=world.indexOf('function El(){'),end=world.indexOf("window.addEventListener('pagehide'",start);
 assert.ok(start>=0&&end>start);
 f.w.eval('var worldClosingGames=null,worldGameAssetRequest=0,R=null;\n'+world.slice(start,end));
 f.submit(async()=>({ok:false}));const round=f.start();f.finish(round);await tick();
 assert.equal(await f.w.El(),false);assert.ok(f.overlay);
 f.submit(async()=>({ok:true}));assert.equal(await f.w.El(),true);assert.equal(f.overlay,null);
 assert.ok(f.calls.every(call=>call.round===round));
});
