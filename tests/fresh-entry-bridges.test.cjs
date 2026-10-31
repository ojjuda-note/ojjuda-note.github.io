const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const {JSDOM}=require('jsdom');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture(name){
 const dom=new JSDOM('<div id="toast"></div><button id="open">열기</button>',{url:'https://fixture.test/world.html',runScripts:'outside-only'});
 const w=dom.window;w.alert=()=>{};w.matchMedia=()=>({matches:false});
 return {w,load:()=>w.eval(source(name)),frame:()=>w.document.querySelector('iframe'),dispose:()=>w.close()};
}

test('an inactive ttang bridge closes synchronously so the shared entry gate can finish',()=>{
 const f=fixture('ttang-bridge.js');f.load();try{assert.equal(f.w.OjjudaTtangBridge.close(),true);}finally{f.dispose();}
});

for(const fail of [false,true])test('photo close releases an unfinished age check; late '+(fail?'failure':'success')+' cannot affect the new entry',async()=>{
 const f=fixture('photo-ttang-bridge.js'),old=deferred(),fresh=deferred();let calls=0;
 f.w.OjjudaPhotoTtangAccess={configure(){},check:()=>++calls===1?old.promise:fresh.promise,allowed:()=>true,subscribe:()=>()=>{}};f.load();
 try{
  const first=f.w.openPhotoTtang({owner:'member'});f.w.OjjudaPhotoTtangBridge.close();
  const second=f.w.openPhotoTtang({owner:'member'});assert.equal(calls,2);
  fresh.resolve({userId:'member'});await second;const frame=f.frame();assert.ok(frame);
  if(fail)old.reject(Error('late error'));else old.resolve({userId:'member'});
  await first;assert.equal(f.frame(),frame);assert.equal(f.w.document.getElementById('toast').textContent,'');
 }finally{f.w.OjjudaPhotoTtangBridge.close(true);f.dispose();}
});

function matgoFixture(invoke){
 const f=fixture('matgo-bridge.js');f.w.owner='member-a';
 const client={auth:{getSession:async()=>({data:{session:f.w.owner?{user:{id:f.w.owner},access_token:'fixture-'+f.w.owner}:null}})},functions:{invoke}};
 f.w.OjjudaMatgoAccess={check:async()=>({userId:f.w.owner}),getClient:()=>client,subscribe:()=>()=>{}};f.load();return f;
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('matgo parent tracks a late create after iframe removal, leaves it, then permits a fresh entry',async()=>{
 const created=deferred(),left=deferred(),calls=[];
 const f=matgoFixture((_name,{body,headers})=>{calls.push({body,headers});return body.action==='online_create'?created.promise:left.promise;});
 try{
  await f.w.openMatgo();const old=f.frame(),oldWindow=old.contentWindow;let disposed=0;
  oldWindow.OjjudaMatgoSession={dispose(){assert.ok(old.isConnected);disposed++;}};
  const pending=f.w.OjjudaMatgoBridge.invoke(oldWindow,{action:'online_create'});await flush();
  f.w.closeMatgo();assert.equal(disposed,1);assert.equal(f.frame(),null);
  const reopen=f.w.openMatgo();created.resolve({data:{ok:true,room:{id:'old-room',status:'waiting'}}});await pending;await flush();
  assert.equal(f.frame(),null,'new entry waits for cleanup of accepted old requests');
  assert.equal(calls[1].body.action,'online_leave');assert.equal(calls[1].body.room_id,'old-room');
  assert.equal(calls[1].headers.Authorization,'Bearer fixture-member-a');
  left.resolve({data:{ok:true}});assert.equal(await reopen,true);assert.notEqual(f.frame(),old);
  await assert.rejects(f.w.OjjudaMatgoBridge.invoke(oldWindow,{action:'start'}),/다시 열어/);assert.equal(calls.length,2);
 }finally{f.w.closeMatgo();f.dispose();}
});

test('matgo failed cleanup stays visible on re-entry and retries the same old round ID without a second charge',async()=>{
 const calls=[];let failed=true;
 const f=matgoFixture(async(_,{body})=>{calls.push({...body});if(body.action==='tazza_start')return {data:{ok:true,round:{id:'paid-round'},coins:15}};if(failed)return {error:{message:'offline'}};return {data:{ok:true,round:null,coins:15}};});
 try{
  await f.w.openMatgo();await f.w.OjjudaMatgoBridge.invoke(f.frame().contentWindow,{action:'tazza_start'});f.w.closeMatgo();await flush();
  await assert.rejects(f.w.openMatgo({propagateError:true}),/이전 판의 나가기/);assert.equal(f.frame(),null);
  failed=false;assert.equal(await f.w.openMatgo(),true);
  assert.ok(calls.filter(call=>call.action==='abandon').every(call=>call.round_id==='paid-round'));
  assert.equal(calls.filter(call=>call.action==='tazza_start').length,1);
 }finally{f.w.closeMatgo();f.dispose();}
});

test('matgo account change drops retired references before a late response can mutate the new account',async()=>{
 const created=deferred(),calls=[];
 const f=matgoFixture((_name,{body})=>{calls.push({...body});return created.promise;});
 try{
  await f.w.openMatgo();const pending=f.w.OjjudaMatgoBridge.invoke(f.frame().contentWindow,{action:'start'});await flush();
  f.w.closeMatgo();f.w.owner='member-b';
  const reopen=f.w.openMatgo();created.resolve({data:{ok:true,round:{id:'member-a-round'}}});await pending;assert.equal(await reopen,true);
  assert.deepEqual(calls,[{action:'start'}],'no old cleanup runs with the replacement account');
 }finally{f.w.closeMatgo();f.dispose();}
});

test('matgo rechecks the account between separate cleanup requests',async()=>{
 const calls=[];let f;
 f=matgoFixture(async(_name,{body})=>{
  calls.push({...body});if(body.action==='status')return {data:{ok:true,online_room:'old-room',round:{id:'old-round'}}};
  if(body.action==='online_leave'){f.w.owner='member-b';return {data:{ok:true}};}
  throw Error('old solo cleanup must not run with the replacement account');
 });
 try{
  await f.w.openMatgo();await f.w.OjjudaMatgoBridge.invoke(f.frame().contentWindow,{action:'status'});f.w.closeMatgo();await flush();
  assert.equal(await f.w.openMatgo(),true);assert.deepEqual(calls.map(call=>call.action),['status','online_leave']);
 }finally{f.w.closeMatgo();f.dispose();}
});

test('matgo public-room handoff preserves the explicitly created fresh room',async()=>{
 const calls=[],rooms=[];const f=matgoFixture(async(_,{body})=>{calls.push({...body});return {data:{ok:true,room:{id:'fresh-room',status:'waiting'}}};});
 try{
  f.w.OjjudaArcadeRoomCreated=room=>rooms.push(room);await f.w.openMatgo();const source=f.frame().contentWindow;
  await f.w.OjjudaMatgoBridge.invoke(source,{action:'online_create'});
  f.w.dispatchEvent(new f.w.MessageEvent('message',{origin:f.w.location.origin,source,data:{type:'ojjuda:matgo:room-created',room:{match_id:'fresh-room'}}}));
  await flush();assert.equal(f.frame(),null);assert.equal(rooms.length,1);assert.deepEqual(calls,[{action:'online_create'}]);
 }finally{f.w.closeMatgo();f.dispose();}
});

test('photo parent close disposes the active board before iframe removal and keeps completion/purchase storage',async()=>{
 const f=fixture('photo-ttang-bridge.js');
 f.w.OjjudaPhotoTtangAccess={configure(){},check:async()=>({userId:'member'}),allowed:()=>true,subscribe:()=>()=>{}};f.load();
 try{
  f.w.localStorage.setItem('ojjuda-photo-ttang','{"0":{"done":1}}');f.w.localStorage.setItem('pending-photo-purchase','receipt');
  await f.w.openPhotoTtang({owner:'member'});const old=f.frame();let disposed=0,busy=true;
  old.contentWindow.OjjudaPhotoTtang={canLeave:()=>!busy,dispose(){assert.ok(old.isConnected);disposed++;}};
  assert.equal(f.w.OjjudaPhotoTtangBridge.close(),false,'pending purchases retain their existing close guard');
  assert.equal(f.frame(),old);assert.equal(disposed,0);busy=false;
  f.w.OjjudaPhotoTtangBridge.close();assert.equal(disposed,1);assert.equal(f.frame(),null);
  await f.w.openPhotoTtang({owner:'member'});assert.notEqual(f.frame(),old);
  assert.equal(f.w.localStorage.getItem('ojjuda-photo-ttang'),'{"0":{"done":1}}');
  assert.equal(f.w.localStorage.getItem('pending-photo-purchase'),'receipt');
 }finally{f.w.OjjudaPhotoTtangBridge.close(true);f.dispose();}
});

for(const mode of ['host','join'])test('old ttang iframe load cannot '+mode+' a previous invitation in a new frame',async()=>{
 const f=fixture('ttang-bridge.js');f.load();const oldCode='a'.repeat(24),newCode='b'.repeat(24),calls=[];
 try{
  f.w.OjjudaTtangBridge.open({owner:'member',[mode+'Code']:oldCode});const old=f.frame();let disposed=0;
  old.contentWindow.OjjudaTtang={dispose(){assert.ok(old.isConnected);disposed++;}};
  f.w.OjjudaTtangBridge.close();assert.equal(disposed,1);
  f.w.OjjudaTtangBridge.open({owner:'member',[mode+'Code']:newCode});const current=f.frame();
  current.contentWindow.OjjudaTtang={host:async code=>{calls.push(code);return code;},join:code=>calls.push(code)};
  old.dispatchEvent(new f.w.Event('load'));assert.deepEqual(calls,[]);
  current.dispatchEvent(new f.w.Event('load'));await Promise.resolve();assert.deepEqual(calls,[newCode]);
 }finally{f.w.OjjudaTtangBridge.close();f.dispose();}
});

test('ttang close records the current unfinished round once and late room creation leaves only its own old room',async()=>{
 const f=fixture('ttang-bridge.js');f.load();const created=deferred(),calls=[],scores=[];
 const client={rpc(name,args){calls.push({...args});return args.p_action==='create'?created.promise:Promise.resolve({data:{ok:true}});}};
 try{
  f.w.OjjudaTtangBridge.open({client,owner:'member',onResult:async(won,round)=>{scores.push({won,round});return {ok:true};}});
  const old=f.frame();old.contentWindow.OjjudaTtang={host:async()=>{throw Error('closed session cannot host');},dispose(){}};
  const round='10000000-0000-4000-8000-000000000001';
  f.w.dispatchEvent(new f.w.MessageEvent('message',{origin:f.w.location.origin,source:old.contentWindow,data:{type:'ojjuda:ttang:start',mode:'solo',round}}));
  const pending=f.w.OjjudaTtangBridge.createPublicRoom();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls[0]?.p_action,'create');f.w.OjjudaTtangBridge.close();f.w.OjjudaTtangBridge.close();
  f.w.OjjudaTtangBridge.open({client,owner:'member',arcadeRoom:'new-room'});const current=f.frame();
  created.resolve({data:{ok:true,room:{id:'old-room',code:'a'.repeat(24)}}});assert.equal(await pending,false);
  assert.equal(f.frame(),current);assert.deepEqual(scores,[{won:false,round}]);
  assert.deepEqual(calls.filter(call=>call.p_action==='leave'),[{p_action:'leave',p_room:'old-room'}]);
 }finally{f.w.OjjudaTtangBridge.close();f.dispose();}
});

test('ttang failed old-room cleanup blocks a new public room until the same room is retired successfully',async()=>{
 const f=fixture('ttang-bridge.js');f.load();const calls=[];let fail=true;
 const client={async rpc(name,args){calls.push({...args});if(args.p_action==='leave'&&fail)return {error:{message:'offline'}};return {data:{ok:true,room:{id:'new-room',code:'b'.repeat(24)}}};}};
 try{
  f.w.OjjudaTtangBridge.open({client,owner:'member',arcadeRoom:'old-room'});f.frame().contentWindow.OjjudaTtang={dispose(){}};
  await assert.rejects(f.w.OjjudaTtangBridge.close(),/unavailable/);
  f.w.OjjudaTtangBridge.open({client,owner:'member'});f.frame().contentWindow.OjjudaTtang={host:async code=>code};
  await assert.rejects(f.w.OjjudaTtangBridge.createPublicRoom(),/unavailable/);
  assert.equal(calls.some(call=>call.p_action==='create'),false,'new room creation cannot race a failed old leave');
  fail=false;assert.equal(await f.w.OjjudaTtangBridge.createPublicRoom(),true);
  const created=calls.findIndex(call=>call.p_action==='create');assert.equal(calls[created-1].p_room,'old-room');
  assert.equal(f.w.document.querySelector('iframe')!==null,true);
 }finally{await f.w.OjjudaTtangBridge.close();f.dispose();}
});

test('ttang late room creation after an account change cannot send a leave as the new account',async()=>{
 const f=fixture('ttang-bridge.js');f.load();const created=deferred(),calls=[];let owner='A';
 const client={rpc(name,args){calls.push({...args});return created.promise;}};
 try{
  f.w.OjjudaTtangBridge.open({client,owner:'A',authorized:()=>owner==='A'});f.frame().contentWindow.OjjudaTtang={host:async()=>{throw Error('old frame');},dispose(){}};
  const pending=f.w.OjjudaTtangBridge.createPublicRoom();await new Promise(resolve=>setImmediate(resolve));
  const closing=f.w.OjjudaTtangBridge.close();owner='B';f.w.OjjudaTtangBridge.open({client,owner:'B',authorized:()=>owner==='B'});
  created.resolve({data:{ok:true,room:{id:'old-room',code:'a'.repeat(24)}}});await closing;assert.equal(await pending,false);
  assert.deepEqual(calls.map(call=>call.p_action),['create'],'a changed identity drops old actor cleanup references');
 }finally{await f.w.OjjudaTtangBridge.close();f.dispose();}
});
