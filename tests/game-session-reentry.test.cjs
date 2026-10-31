const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),test=require('node:test');
const {randomUUID}=require('node:crypto'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const kinds={
 tank:{file:'world-tank-game.js',api:'OjjudaTankGame',source:'ojjuda-tank',ready:'ready',init:'tank-init',request:'request'},
 bang:{file:'world-bang-game.js',api:'OjjudaBangGame',source:'ojjuda-bang',ready:'ojjuda-game-ready',init:'ojjuda-bang-init',request:'ojjuda-bang-request'},
 poker:{file:'world-poker-game.js',api:'OjjudaPokerGame',source:'ojjuda-poker',ready:'ready',init:'poker-init',request:'rpc'},
 roulette:{file:'world-roulette-game.js',api:'OjjudaRouletteBridge',source:'ojjuda-roulette',ready:'ready',init:'roulette-init',request:'rpc'},
 marble:{file:'world-tour-game.js',api:'OjjudaTourGame',source:'ojjuda-tour',ready:'ojjuda-game-ready',init:'ojjuda-tour-init',request:'ojjuda-marble-request'}
};
const room=(kind,patch={})=>({id:randomUUID(),code:'ABCDEF12',status:'active',mode:kind==='bang'?'multiplayer':'online',version:4,seat:0,hostSeat:0,names:['나','친구','다른 친구'],capacity:3,
 game:{tanks:[{hp:100}],players:[{bankrupt:false}]},state:{players:[{alive:true}],forfeited:[]},...patch});

async function fixture(t,kind,initial,options={}){
 const meta=kinds[kind],dom=new JSDOM('<button id="entry">게임</button>',{url:'https://fixture.test/world.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],messages=[],coins=[],gates=new Map();let allowed=true,current=initial,failLeave=false;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const client={functions:{invoke:async(name,{body})=>{
  calls.push({...body});if(gates.has(body.action))await gates.get(body.action).promise;
  let error;
  if(body.action==='leave'){
   if(failLeave)error='unavailable';else current=null;
  }else if(body.action==='surrender'){
   current.version++;current.game.tanks[0].hp=0;current.game.players[0].bankrupt=true;current.state.players[0].alive=false;current.state.forfeited=[0];
  }else if(body.action==='create'||body.action==='solo')current=room(kind,{status:'waiting',code:'AABBCCDD',names:['나'],game:null,state:null});
  else if(body.action==='join')current=room(kind,{status:'waiting',code:body.code,game:null,state:null});
  const data=error?{ok:false,error}:{ok:true,room:current?structuredClone(current):null,coins:77,wallet:{coins:77}};
  return {data,error:null};
 }},rpc:async(name,{p_action,p_payload}={})=>kind==='roulette'?client.functions.invoke(name,{body:{action:p_action,...p_payload}}):({data:{ok:true},error:null})};
 w.OjjudaMatgoAccess={check:async()=>({userId:'member-a',age:25}),visible:()=>allowed,subscribe:()=>()=>{},getClient:()=>client};
 w.eval(read('game-session.js'));w.eval(read(meta.file));const api=w[meta.api];
 const open=async(params={})=>{
  await api.open({owner:'member-a',client,authorized:()=>allowed,onCoins:value=>coins.push(value),...options,...params});
  const frame=w.document.querySelector('iframe');if(frame)frame.contentWindow.postMessage=value=>messages.push(value);
  return frame;
 };
 await open();
 const send=(type,extra={})=>{const child=w.document.querySelector('iframe')?.contentWindow;w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:child,data:{source:meta.source,type,...extra}}));};
 const ready=async()=>{send(meta.ready);await tick();await tick();};
 const request=body=>{const id=randomUUID();send(meta.request,['poker','roulette'].includes(kind)?{id,body}:{requestId:id,body});return id;};
 t.after(()=>{allowed=false;api.close();w.close();});
 return {w,api,calls,messages,coins,gates,ready,request,open,send,meta,room:()=>current,allowed:value=>allowed=value,failLeave:value=>failLeave=value};
}

for(const kind of Object.keys(kinds)){
 test(kind+': normal entry retires the old round before init and preserves account balances',async t=>{
  const f=await fixture(t,kind,room(kind));await f.ready();
  assert.deepEqual(f.calls.map(c=>c.action),['mine','leave']);
  assert.equal(f.room(),null);assert.equal(f.messages.filter(m=>m.type===f.meta.init).length,1);
  await f.ready();assert.equal(f.messages.filter(m=>m.type===f.meta.init).length,1,'duplicate ready messages do not restart the session');
  if(['tank','poker','roulette'].includes(kind))assert.ok(f.coins.every(n=>n===77));
  assert.equal(await f.api.close(),true);assert.equal(f.w.document.querySelector('iframe'),null);
  assert.equal(f.api.close(),true,'an inactive bridge closes synchronously');
 });
 test(kind+': a freshly created explicit target is kept and its intentional join remains usable',async t=>{
  const same=room(kind,{status:'waiting',game:null,state:null}),f=await fixture(t,kind,same,{joinCode:same.code});
  await f.ready();assert.deepEqual(f.calls.map(c=>c.action),['mine']);assert.equal(f.room().id,same.id);
  assert.equal(f.messages.find(m=>m.type===f.meta.init).joinCode,same.code);
  assert.equal(await f.api.close(),true);
  await f.open({joinCode:'CCCCDDDD'});await f.ready();f.request({action:'join',code:'CCCCDDDD'});await tick();await tick();
  assert.equal(f.room().code,'CCCCDDDD');assert.equal(f.room().status,'waiting','an intentional room join is still usable');
 });
 test(kind+': an invitation to a different room retires the previous match before joining',async t=>{
  const f=await fixture(t,kind,room(kind),{joinCode:'CCCCDDDD'});await f.ready();
  assert.deepEqual(f.calls.map(c=>c.action),['mine','leave']);
  assert.equal(f.room(),null);assert.equal(f.messages.find(m=>m.type===f.meta.init).joinCode,'CCCCDDDD');
  f.request({action:'join',code:'CCCCDDDD'});await tick();await tick();
  assert.equal(f.room().code,'CCCCDDDD');assert.equal(f.room().status,'waiting');
 });
 test(kind+': closing drains a pending create, rejects later work and leaves before reentry',async t=>{
  const f=await fixture(t,kind,null);await f.ready();const gate=deferred();f.gates.set('create',gate);
  f.request({action:'create',request_id:randomUUID(),options:{title:'new room',capacity:4}});await tick();
  const closing=f.api.close();assert.equal(typeof closing.then,'function');
  f.request({action:'create',request_id:randomUUID(),options:{title:'late room',capacity:4}});await tick();
  assert.equal(f.calls.filter(c=>c.action==='create').length,1);assert.ok(f.w.document.querySelector('iframe'));
  gate.resolve();assert.equal(await closing,true);assert.equal(f.room(),null);assert.equal(f.w.document.querySelector('iframe'),null);
  assert.deepEqual(f.calls.map(c=>c.action),['mine','create','mine','leave']);
  await f.open();await f.ready();assert.equal(f.room(),null);assert.equal(f.messages.filter(m=>m.type===f.meta.init).length,2);
 });
}

test('roulette rejects foreign frames, foreign origins and unsupported wallet commands',async t=>{
 const f=await fixture(t,'roulette',null);await f.ready();const before=f.calls.length,child=f.w.document.querySelector('iframe').contentWindow;
 for(const [origin,source] of [['https://foreign.test',child],[f.w.location.origin,f.w]]){
  f.w.dispatchEvent(new f.w.MessageEvent('message',{origin,source,data:{source:'ojjuda-roulette',type:'rpc',id:randomUUID(),body:{action:'create'}}}));
 }
 f.request({action:'refill',coins:999999});await tick();await tick();
 assert.equal(f.calls.length,before);assert.ok(f.messages.every(message=>!('access_token' in message)&&!('session' in message)));
 f.request({action:'create'});await tick();await tick();assert.equal(f.calls.at(-1).action,'create');
});

test('roulette account change cannot receive or settle a late previous-account response',async t=>{
 const f=await fixture(t,'roulette',null);await f.ready();const gate=deferred();f.gates.set('create',gate);
 const id=f.request({action:'create'});await tick();f.allowed(false);assert.equal(f.api.close(),true);
 gate.resolve();await tick();await tick();
 assert.equal(f.messages.some(message=>message.id===id),false);assert.deepEqual(f.calls.map(call=>call.action),['mine','create']);
 assert.equal(f.w.document.querySelector('iframe'),null);
});

for(const kind of ['tank','marble'])test(kind+': a failed leave keeps the game and invitations usable instead of claiming a fresh start',async t=>{
 const f=await fixture(t,kind,null);await f.ready();f.request({action:'create',request_id:randomUUID(),options:{title:'waiting',capacity:3}});await tick();
 f.failLeave(true);assert.equal(await f.api.close(),false);assert.ok(f.w.document.querySelector('dialog[open]'));assert.ok(f.room());
 assert.match(f.w.document.querySelector('.game-session-status').textContent,/다시 나가/);
 let invitation;f.w.OjjudaFriendInvites={available:()=>true,pick:async options=>{invitation=options;return true;}};
 f.request({action:'invite',room_id:f.room().id});await tick();await tick();assert.ok(invitation);assert.equal(invitation.signal.aborted,false,'a failed close must not permanently disable inviting a friend');
 f.failLeave(false);assert.equal(await f.api.close(),true);assert.equal(f.room(),null);
});

test('account replacement cannot send a pending old-session cleanup as the new member',async t=>{
 const f=await fixture(t,'tank',room('tank'));const gate=deferred();f.gates.set('mine',gate);
 f.send(f.meta.ready);await tick();f.allowed(false);assert.equal(f.api.close(),true);
 gate.resolve();await tick();await tick();assert.deepEqual(f.calls.map(c=>c.action),['mine']);assert.equal(f.messages.length,0);assert.equal(f.w.document.querySelector('iframe'),null);
});

test('visibility changes during a visit keep the same game and do not run exit cleanup',async t=>{
 const f=await fixture(t,'tank',null);await f.ready();f.request({action:'create',request_id:randomUUID(),options:{title:'same visit',capacity:3}});await tick();
 const before=f.calls.length,id=f.room().id;f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));await tick();
 assert.equal(f.calls.length,before);assert.equal(f.room().id,id);
});


test('page exit attempts handoff, while a saved browser page and tab hiding keep the same visit',async t=>{
 const f=await fixture(t,'tank',null);await f.ready();f.request({action:'create',request_id:randomUUID(),options:{title:'handoff',capacity:3}});await tick();
 const before=f.calls.length;f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));await tick();assert.equal(f.calls.length,before);assert.ok(f.room());
 f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:false}));await tick();await tick();
 assert.equal(f.room(),null);assert.equal(f.w.document.querySelector('iframe'),null);assert.equal(f.calls.at(-1).action,'leave');
});
