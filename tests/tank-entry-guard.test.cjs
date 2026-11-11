const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const test=require('node:test');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const flush=async()=>{for(let i=0;i<150;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function clock(w){
 let now=0,id=0;const timers=new Map();
 w.setTimeout=(callback,delay,...args)=>{const key=++id;timers.set(key,{at:now+delay,callback:()=>callback(...args)});return key;};
 w.clearTimeout=key=>timers.delete(key);
 return {advance(ms){now+=ms;for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.callback();}}};
}
async function fixture(t,{preview=false,existing=null,handler=null}={}){
 const engine=await import('../games/tank/engine.mjs');
 const host=new JSDOM('<body><button>탱크</button></body>',{url:'https://fixture.test/world.html',runScripts:'outside-only',pretendToBeVisual:true});
 const p=host.window,hostClock=clock(p),calls=[],coins=[],errors=[],responses=[],children=[];
 let owner='member-a',allowed=true,room=existing,service=handler,frame,child,childClock;
 p.HTMLDialogElement.prototype.showModal=function(){this.open=true;};p.HTMLDialogElement.prototype.close=function(){this.open=false;};
 p.OjjudaAdminPreview={isEnabled:()=>preview};
 const result=()=>({ok:true,room:room?structuredClone(room):null,coins:0});
 const fallback=body=>{
  if(body.action==='create')room={id:randomUUID(),code:'A1B2C3D4',mode:body.options.mode,title:'테스트',status:'waiting',seat:0,hostSeat:0,capacity:body.options.capacity,names:['나'],version:0,serverTime:Date.now(),coins:0};
  if(body.action==='start'){const names=Array.from({length:room.capacity},(_,i)=>'플레이어 '+i);room={...room,status:'active',version:1,game:engine.newGame(names,room.id,123),deadline:new Date(Date.now()+45000).toISOString()};}
  if(body.action==='leave')room=null;
  return result();
 };
 const client={functions:{invoke:async(_,{body})=>{calls.push(structuredClone(body));return {data:await(service?service(body,fallback):fallback(body)),error:null};}}};
 p.eval(read('shared/games/game-session.js'));p.eval(read('games/tank/world-tank-game.js'));
 const bridge=p.OjjudaTankGame;
 const open=async()=>{
  const scoreOwner=owner,receipt=bridge.open({owner:scoreOwner,client,authorized:()=>allowed&&owner===scoreOwner,onCoins:value=>coins.push(value),onError:message=>errors.push(message)});
  frame=p.document.querySelector('iframe');if(!frame)return receipt;
  const openedFrame=frame,dom=new JSDOM(read('games/tank/index.html'),{url:'https://fixture.test/games/tank/index.html',runScripts:'outside-only',pretendToBeVisual:true});
  child=dom.window;children.push(child);const w=child;childClock=clock(w);
  const parent={postMessage:data=>queueMicrotask(()=>p.dispatchEvent(new p.MessageEvent('message',{origin:p.location.origin,source:openedFrame.contentWindow,data})))};
  Object.defineProperty(w,'parent',{value:parent});
  openedFrame.contentWindow.postMessage=data=>{responses.push(structuredClone(data));queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:parent,data})));};
  w.TankView={resetInput(){},resetHistory(){},refresh(){},use(){},hasEffects:()=>false,fullscreen:async()=>{},input:()=>({weapon:0,basicWeapon:0,angle:90,power:5})};
  w.tankEngine=engine;
  w.eval(read('games/tank/online.mjs').replace(/^import[^\n]+\n/,'const {createEngine,WEAPONS}=window.tankEngine;\n'));
  await flush();return receipt;
 };
 t.after(()=>{allowed=false;bridge.close();for(const w of children)w.close();p.close();});
 const receipt=await open();
 const request=body=>{const requestId=randomUUID();p.dispatchEvent(new p.MessageEvent('message',{origin:p.location.origin,source:frame.contentWindow,data:{source:'ojjuda-tank',type:'request',requestId,body}}));return requestId;};
 return {p,bridge,calls,coins,errors,responses,receipt,open,request,hostClock,
  get frame(){return p.document.querySelector('iframe');},get child(){return child;},get childClock(){return childClock;},
  get status(){return p.document.querySelector('.game-session-status')?.textContent||'';},
  get retry(){return p.document.querySelector('.game-session-status button');},
  el:id=>child.document.getElementById(id),handler:value=>{service=value;},preview:value=>{preview=value;},owner:value=>{owner=value;},
  room:value=>{if(value!==undefined)room=value;return room;}};
}

for(const existing of [null,{id:'11111111-1111-4111-8111-111111111111',code:'ABCDEF12',status:'active',mode:'solo'}])test('Tank preview gives a clear refusal before reading or leaving '+(existing?'an existing room':'any room'),async t=>{
 const f=await fixture(t,{preview:true,existing});
 assert.equal(f.frame,null);assert.deepEqual(f.calls,[]);
 assert.equal(f.receipt?.ok,false);assert.equal(f.receipt?.error,'admin_preview');
 assert.match(f.receipt.message,/관리자 체험/);assert.match(f.receipt.message,/끄|끈|해제/);assert.deepEqual(f.errors,[f.receipt.message]);
});

test('Tank still protects direct preview callers without an error callback',async t=>{
 const f=await fixture(t);await f.bridge.close();f.preview(true);
 const receipt=f.bridge.open({owner:'member-a'});
 assert.equal(f.frame,null);assert.equal(receipt?.error,'admin_preview');assert.match(receipt?.message,/관리자 체험/);
});

test('Tank shows the preview explanation if it is enabled after entry, without sending mutations',async t=>{
 const f=await fixture(t);f.preview(true);f.el('startSolo').click();await flush();
 assert.equal(f.calls.some(call=>call.action==='create'),false);
 assert.match(f.el('netMessage').textContent,/관리자 체험/);assert.match(f.el('netMessage').textContent,/끄|끈|해제/);
 assert.doesNotMatch(f.el('netMessage').textContent,/연결이 원활/);
 f.request({action:'invite',room_id:randomUUID()});await flush();assert.equal(f.responses.at(-1).result.error,'admin_preview');
});

for(const mode of ['solo','local'])test('Tank '+mode+' entry and free weapons stay available at zero coins',async t=>{
 const f=await fixture(t);assert.equal(f.el('startSolo').disabled,false);
 f.el(mode+'Mode').click();f.el(mode==='solo'?'startSolo':'startLocal').click();await flush();
 assert.equal(f.child.document.body.classList.contains('in-match'),true);assert.equal(f.child.TankOnline.canAim(),true);assert.equal(f.child.TankOnline.balance(),0);
 assert.equal(f.calls.filter(call=>call.action==='create').length,1);assert.equal(f.calls.filter(call=>call.action==='start').length,1);
});

for(const action of ['mine','leave'])test('Tank initial '+action+' timeout offers retry and ignores its late receipt',async t=>{
 const pending=deferred(),existing=action==='leave'?{id:randomUUID(),code:'ABCDEF12',status:'active',mode:'solo'}:null;
 const f=await fixture(t,{existing,handler:(body,next)=>body.action===action?pending.promise:next(body)});
 f.hostClock.advance(18000);await flush();
 assert.match(f.status,/이전 게임에서 나오지 못/);assert.equal(f.retry.hidden,false);assert.equal(f.frame.inert,true);
 f.handler(null);f.retry.click();f.retry.click();await flush();
 assert.equal(f.el('startSolo').disabled,false);assert.equal(f.frame.inert,false);
 assert.equal(f.responses.filter(message=>message.type==='tank-init').length,1,'retry only initializes the game once');
 const coins=f.coins.slice();pending.resolve({ok:true,room:existing,coins:999});await flush();
 assert.deepEqual(f.coins,coins);assert.equal(f.el('startSolo').disabled,false);
});

test('Tank close keeps the screen after an unconfirmed leave, then retries safely',async t=>{
 const f=await fixture(t);f.el('startSolo').click();await flush();
 const pending=deferred();f.handler((body,next)=>body.action==='leave'?pending.promise:next(body));
 let settled=false,value;f.bridge.close().then(result=>{settled=true;value=result;});await flush();
 f.hostClock.advance(18000);await flush();
 assert.equal(settled,true);assert.equal(value,false);assert.ok(f.frame);assert.match(f.status,/다시 나가/);
 f.handler(null);assert.equal(await f.bridge.close(),true);await f.open();const coins=f.coins.slice();
 pending.resolve({ok:true,room:null,coins:999});await flush();assert.deepEqual(f.coins,coins);assert.equal(f.el('startSolo').disabled,false);
});

test('Tank late requests cannot update a replacement account or game',async t=>{
 const pending=deferred(),f=await fixture(t,{handler:()=>pending.promise});
 f.owner('member-b');assert.equal(f.bridge.close(),true);f.handler(null);await f.open();const coins=f.coins.slice();
 pending.resolve({ok:true,room:null,coins:999});await flush();
 assert.deepEqual(f.coins,coins);assert.equal(f.el('startSolo').disabled,false);
 assert.equal(f.responses.filter(message=>message.type==='tank-init').length,1);
});

test('Tank older same-session reads cannot overwrite a newer receipt balance',async t=>{
 const f=await fixture(t),pending=deferred();let reads=0;
 f.handler((body,next)=>body.action==='read'?(++reads===1?pending.promise:{ok:true,room:null,coins:5}):next(body));
 f.request({action:'read',room_id:randomUUID()});await flush();f.request({action:'read',room_id:randomUUID()});await flush();
 assert.equal(f.coins.at(-1),5);pending.resolve({ok:true,room:null,coins:999});await flush();assert.equal(f.coins.at(-1),5);
});

for(const action of ['create','start','fire'])test('Tank does not declare an unresolved '+action+' mutation complete when closing',async t=>{
 const f=await fixture(t),pending=deferred();
 f.handler((body,next)=>body.action===action?pending.promise:next(body));
 f.request({action,request_id:randomUUID(),room_id:randomUUID(),version:0,options:{mode:'solo',title:'시험',capacity:2},command:{weapon:0,angle:90,power:5,moves:[]}});await flush();
 let closed=false;const closing=f.bridge.close().then(value=>{closed=true;return value;});await flush();f.hostClock.advance(36000);await flush();
 assert.equal(closed,false);assert.ok(f.frame);assert.equal(f.calls.some(call=>call.action==='leave'),false);
 pending.resolve({ok:true,room:null,coins:0});assert.equal(await closing,true);
});

test('Tank iframe retry preserves its create request ID and a late first response cannot overwrite the started game',async t=>{
 const f=await fixture(t),pending=deferred();let creates=0,receipt;
 f.handler((body,next)=>{if(body.action==='create'){creates++;if(creates===1)return pending.promise;receipt=next(body);return receipt;}return next(body);});
 f.el('startSolo').click();await flush();f.childClock.advance(20000);await flush();
 const requests=f.calls.filter(call=>call.action==='create');assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
 assert.equal(f.child.document.body.classList.contains('in-match'),true);const coins=f.coins.slice();
 pending.resolve({...receipt,coins:999});await flush();assert.deepEqual(f.coins,coins);assert.equal(f.child.document.body.classList.contains('in-match'),true);
});
