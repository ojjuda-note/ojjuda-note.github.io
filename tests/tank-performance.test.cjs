const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
function deferred(){let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};}

async function fixture({mode='local',empty=false,hidden=false}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'games/tank/index.html'),'utf8'),{url:'https://tank.test/games/tank/index.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,context=dom.getInternalVMContext(),calls=[],timers=new Map();
 let now=Date.now(),visible=!hidden,sequence=0,renders=0;
 Object.defineProperty(w.document,'hidden',{get:()=>!visible});
 w.Date.now=()=>now;
 w.setTimeout=(fn,delay=0)=>{const id=++sequence;timers.set(id,{fn,at:now+delay});return id;};
 w.setInterval=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:now+delay,interval:delay});return id;};
 w.clearTimeout=w.clearInterval=id=>timers.delete(id);
 w.TankView={resetInput(){},resetHistory(){},refresh(){renders++;},use(){},hasEffects:()=>false,fullscreen:async()=>{}};
 const engine=new vm.SourceTextModule(fs.readFileSync(path.join(root,'games/tank/engine.mjs'),'utf8'),{context});
 await engine.link(()=>{throw Error('unexpected import');});await engine.evaluate();
 const id='a0000000-0000-4000-8000-000000000001';
 let room=empty?null:{id,code:'F00DABCD',title:'로컬 성능 테스트',mode,status:'active',capacity:4,names:mode==='online'?['나','플레이어2','플레이어3','플레이어4']:['나'],seat:0,hostSeat:0,version:1,coins:100,game:engine.namespace.newGame(['나','플레이어2','플레이어3','플레이어4'],id,123456)};
 const transport={next:null,error:null};
 const response=()=>({ok:true,coins:100,room:room?JSON.parse(JSON.stringify({...room,serverTime:now,deadline:new Date(now+45000).toISOString()})):null});
 const parent={postMessage(message){
  if(message.type==='ready')queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:parent,data:{source:'ojjuda-world',type:'tank-init',available:true,...(room?{joinCode:room.code}:{})}})));
  if(message.type!=='request')return;
  calls.push(message.body.action);
  const waiting=transport.next;transport.next=null;
  const value=waiting?waiting.promise:transport.error?{error:transport.error}:message.body.action==='list'?{ok:true,rooms:[],coins:100}:response();
  Promise.resolve(value).then(result=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:parent,data:{source:'ojjuda-world',type:'tank-response',replyTo:message.requestId,result}})));
 }};
 Object.defineProperty(w,'parent',{value:parent});
 const online=new vm.SourceTextModule(fs.readFileSync(path.join(root,'games/tank/online.mjs'),'utf8'),{context});
 await online.link(()=>engine);await online.evaluate();await flush();
 return {w,calls,transport,response,el:id=>w.document.getElementById(id),renders:()=>renders,
  async click(id){w.document.getElementById(id).click();await flush();},
  async visible(value){visible=value;w.document.dispatchEvent(new w.Event('visibilitychange'));await flush();},
  async advance(ms){const end=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [id,timer]=next;now=timer.at;if(timer.interval)timer.at+=timer.interval;else timers.delete(id);timer.fn();await flush();}now=end;await flush();},
  changeRoom(update){room=update(room);},
  close(){timers.clear();w.close();}
 };
}

for(const mode of ['solo','local','online'])test(mode+' stops hidden polling and redraws, then immediately reconciles the current turn',async()=>{
 const f=await fixture({mode});
 try{
  const visibleCalls=f.calls.length;await f.advance(60000);
  assert.equal(f.calls.length-visibleCalls,30,'visible room synchronization retains its two-second interval');
  await f.visible(false);const calls=f.calls.length,renders=f.renders();
  f.w.dispatchEvent(new f.w.Event('online'));
  await f.advance(60000);
  assert.equal(f.calls.length,calls,'a hidden minute sends no new room requests');
  assert.equal(f.renders(),renders,'a hidden minute does not repaint the controls');
  f.changeRoom(room=>({...room,version:room.version+1,game:{...room.game,turn:1,turnOrder:[1,2,3,0]}}));
  await f.visible(true);
  assert.equal(f.calls.length,calls+1,'returning performs one immediate authoritative read');
  assert.match(f.el('netTurn').textContent,/플레이어2/,'the restored view uses the new server turn');
  assert.equal(f.w.TankOnline.canAim(),mode==='local','online/solo cannot act on their stale turn');
  if(mode==='solo'){await f.advance(900);assert.equal(f.calls.at(-1),'cpu','computer turns resume after returning');}
  else{await f.advance(2000);assert.equal(f.calls.length,calls+2,'normal synchronization resumes');}
 }finally{f.close();}
});

test('an iframe initialized in a hidden tab waits for visibility before its first state check',async()=>{
 const f=await fixture({empty:true,hidden:true});
 try{
  await f.advance(60000);assert.deepEqual(f.calls,[]);assert.equal(f.el('startSolo').disabled,true);
  await f.visible(true);assert.deepEqual(f.calls,['mine']);assert.equal(f.el('startSolo').disabled,false);
 }finally{f.close();}
});

test('private entry keeps cross-device discovery while visible, and refreshes immediately on return',async()=>{
 const f=await fixture({empty:true});
 try{
  const first=f.calls.length;await f.advance(60000);assert.equal(f.calls.length-first,10);
  await f.visible(false);const hidden=f.calls.length;await f.advance(60000);assert.equal(f.calls.length,hidden);
  await f.visible(true);assert.equal(f.calls.length,hidden+1);assert.equal(f.el('startSolo').disabled,false);
 }finally{f.close();}
});

test('an already in-flight read can settle while hidden without scheduling another request',async()=>{
 const f=await fixture();
 try{
  const pending=deferred();f.transport.next=pending;
  await f.advance(2000);await f.visible(false);const calls=f.calls.length;
  pending.resolve(f.response());await flush();await f.advance(60000);
  assert.equal(f.calls.length,calls);await f.visible(true);assert.equal(f.calls.length,calls+1);
 }finally{f.close();}
});

test('a failed read does not retry in a hidden tab and recovers on return',async()=>{
 const f=await fixture();
 try{
  const pending=deferred();f.transport.next=pending;await f.advance(2000);await f.visible(false);
  const calls=f.calls.length;pending.resolve({error:'unavailable'});await flush();await f.advance(60000);
  assert.equal(f.calls.length,calls,'a late transport error cannot start a hidden retry');
  await f.visible(true);assert.equal(f.calls.length,calls+1);assert.equal(f.w.TankOnline.canAim(),true);
 }finally{f.close();}
});

test('a late private-state check does not start a hidden public-room listing',async()=>{
 const f=await fixture({empty:true});
 try{
  const pending=deferred();f.transport.next=pending;await f.click('onlineMode');await f.visible(false);
  const calls=f.calls.length;pending.resolve(f.response());await flush();await f.advance(60000);
  assert.equal(f.calls.length,calls);
  await f.visible(true);assert.deepEqual(f.calls.slice(calls),['mine','list'],'visible entry restores its public list');
 }finally{f.close();}
});

test('authentication failure remains blocked through hide/show transitions',async()=>{
 const f=await fixture();
 try{
  f.transport.error='not_signed_in';await f.advance(2000);const calls=f.calls.length;
  await f.visible(false);await f.advance(60000);await f.visible(true);await f.advance(60000);
  assert.equal(f.calls.length,calls);assert.equal(f.w.TankOnline.canAim(),false);
  assert.match(f.el('netMessage').textContent,/로그인/);
 }finally{f.close();}
});
