const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test');
const {JSDOM}=require('jsdom'),{randomUUID}=require('node:crypto');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),tick=()=>new Promise(resolve=>setImmediate(resolve));
const E=require('../games/sacheonseong/engine.js'),KEY='ojjuda-sacheonseong-v1',owner=randomUUID();
function dialogs(w){w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.HTMLElement.prototype.scrollIntoView=()=>{};}
function sacheon(t,saved,buy){
 const dom=new JSDOM('<body><button>오락실</button></body>',{url:'https://fixture.test/world.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;dialogs(w);
 w.localStorage.setItem(KEY,JSON.stringify(saved));w.localStorage.setItem('ojjuda-sacheonseong-records-v1',JSON.stringify({5:[{id:'best',duration:1234,at:Date.now()}]}));
 for(const file of ['games/sacheonseong/ranking.js','world-sacheonseong-game.js'])w.eval(read(file));
 const calls=[];let child;
 async function enter(){
  w.OjjudaSacheonseongGame.open({owner,onBuy:async(kind,id,runId,stage)=>{const item={kind,id,runId,stage};calls.push(item);return buy?.(item);}});
  w.document.querySelector('.ge-primary').click();child=w.document.querySelector('iframe').contentWindow;
  child.document.write(read('games/sacheonseong/index.html'));child.document.close();dialogs(child);
  Object.defineProperties(child.document.getElementById('board-scroll'),{clientWidth:{value:348},clientHeight:{value:498}});
  child.postMessage=data=>child.dispatchEvent(new child.MessageEvent('message',{data,origin:w.location.origin,source:w}));
  w.postMessage=data=>w.dispatchEvent(new w.MessageEvent('message',{data,origin:w.location.origin,source:child}));
  for(const file of ['engine','faces','ranking','server','app'])child.eval(read('games/sacheonseong/'+file+'.js'));
  await tick();await tick();return child;
 }
 t.after(()=>w.close());
 return {w,enter,calls,state:()=>JSON.parse(w.localStorage.getItem(KEY)),child:()=>child,records:()=>JSON.parse(w.localStorage.getItem('ojjuda-sacheonseong-records-v1'))};
}
function oldGarden(pendingPurchase){const grid=E.generate(5).grid;grid[0][0]=grid[0][1]=-1;return {rulesVersion:E.RULES_VERSION,runId:randomUUID(),stage:5,unlocked:8,grid,startedAt:Date.now()-90000,finishedMs:null,sound:true,hints:2,shuffles:1,pendingPurchase};}

test('Sacheonseong exit/reentry starts stage one with a new full board and run, keeping unlocks and records',async t=>{
 const saved=oldGarden(),f=sacheon(t,saved);const child=await f.enter(),first=f.state();
 assert.equal(first.stage,1);assert.equal(first.grid.flat().filter(value=>value!==-1).length,4);assert.notEqual(first.runId,saved.runId);
 assert.equal(first.startedAt,null);assert.equal(first.finishedMs,null);assert.equal(first.unlocked,8);assert.equal(first.sound,true);assert.equal(first.hints,0);
 assert.equal(f.records()[5][0].id,'best');
 child.document.querySelector('.tile').click();const active=f.state();assert.ok(active.startedAt);
 child.document.dispatchEvent(new child.Event('visibilitychange'));child.dispatchEvent(new child.Event('resize'));
 f.w.OjjudaSacheonseongGame.open({owner});assert.equal(f.w.document.querySelector('iframe').contentWindow,child);assert.deepEqual(f.state(),active,'focus/visibility changes do not restart an active visit');
 f.w.OjjudaSacheonseongGame.close();await f.enter();
 assert.notEqual(f.state().runId,active.runId);assert.equal(f.state().startedAt,null);assert.equal(f.state().stage,1);assert.equal(f.records()[5][0].id,'best');
});

test('an unresolved Sacheonseong purchase keeps its receipt without restoring the old board or timer',async t=>{
 const pending={id:randomUUID(),runId:randomUUID(),stage:5,kind:'hint',owner,requestedAt:Date.now()-90000};
 const f=sacheon(t,oldGarden(pending),item=>({ok:true,kind:item.kind,run_id:item.runId,stage:item.stage,price:3}));await f.enter();
 assert.equal(f.state().stage,1);assert.equal(f.state().startedAt,null);assert.notEqual(f.state().runId,pending.runId);assert.equal(f.state().pendingPurchase.id,pending.id);
 const before=Date.now();f.child().document.getElementById('hint').click();await tick();await tick();
 assert.deepEqual(f.calls,[{kind:'hint',id:pending.id,runId:pending.runId,stage:5}]);
 assert.equal(f.state().pendingPurchase,null);assert.equal(f.state().hints,1);assert.ok(f.state().startedAt>=before,'recovery does not carry the previous visit timer into a new run');
 f.w.OjjudaSacheonseongGame.close();await f.enter();assert.equal(f.state().pendingPurchase,undefined);assert.equal(f.calls.length,1,'a consumed receipt is not recovered a second time');
});

test('both screw modes default to a fresh first stage while preserving milestones and purchased records',()=>{
 const storage=new Map([['ojjuda-screw-stage','37'],['ojjuda-screw-flat-stage-v1','14'],['ojjuda-screw-flat-pictures-v1','["puppy-beach"]'],['ojjuda-screw-upgrades-v1:'+owner+':37','receipt']]);
 const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
 const context=vm.createContext({console,localStorage,window:{}});vm.runInContext(read('screw3d.js').replace(/export \{[^}]*\};/,''),context);
 const api={setScore(){},end(){}};context.screw3d(api);const old=context.window.__ojjScrew3d;assert.equal(old.L,1);old.score=20;old.buf[0]={used:true};
 const box=context.screw3d(api),fresh=context.window.__ojjScrew3d;assert.equal(fresh.L,1);assert.equal(fresh.score,0);assert.ok(fresh.buf.every(value=>value===null));assert.notEqual(fresh.lvl,old.lvl);
 fresh.lvl.screws.forEach(screw=>screw.state='done');for(let i=0;i<30;i++)box.update(.1);assert.equal(storage.get('ojjuda-screw-stage'),'37','completing an earlier stage never lowers the saved milestone');
 const previous=global.localStorage;global.localStorage=localStorage;
 try{const G=require('../screw-flat.js');let game=G.flat(api);assert.equal(game.state.L,1);game.state.moves=4;game.destroy();game=G.flat(api);assert.equal(game.state.L,1);assert.equal(game.state.moves,0);assert.equal(game.state.score,0);assert.ok(game.state.collection.has('puppy-beach'));
  game.state.level.plates.forEach(plate=>plate.state='gone');game.update(.05);assert.equal(storage.get(G.STAGE_KEY),'14');game.destroy();
 }finally{global.localStorage=previous;}
 assert.equal(storage.get('ojjuda-screw-upgrades-v1:'+owner+':37'),'receipt');
});

async function pendingSpot(t,buy){
 const dom=new JSDOM(read('games/spot-difference/index.html'),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;t.after(()=>w.close());dialogs(w);w.confirm=()=>true;w.scrollTo=()=>{};
 const request={requestId:randomUUID(),userId:owner,kind:'hint',spot:2},calls=[];
 let actor=owner;
 w.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:actor?{user:{id:actor}}:null}}),onAuthStateChange(){}},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{coins:20}})})})}),
  rpc:(name,args)=>({abortSignal:async()=>{
   calls.push({name,args:{...args},actor});
   if(name==='record_spot_clear')return {data:{ok:true}};
   assert.equal(name,'spot_game_buy_v2');
   return {data:buy?await buy(args):{ok:true,kind:args.p_kind,stage:args.p_stage,spot:args.p_spot,price:1}};
  }})
 })};
 w.eval(read('games/spot-difference/wallet.js'));await tick();
 for(const file of ['puzzles','photo-puzzles','game-core'])w.eval(read('games/spot-difference/'+file+'.js'));
 const puzzles=w.JJUDA_PUZZLES,id=puzzles[48].id;
 w.localStorage.setItem('jjuda-spot-six-v1',JSON.stringify({version:2,current:48,order:puzzles.map((_,i)=>i),found:{[id]:[0,1]},rounds:{[id]:{...w.JjudaGame.freshRound(),status:'payment',hearts:1,remainingMs:5000,pending:request}},revisions:Object.fromEntries(puzzles.map(p=>[p.id,p.revision||'original']))}));
 w.eval(read('games/spot-difference/app.js'));for(const image of w.document.querySelectorAll('img'))if(image.onload)image.onload();
 const state=()=>JSON.parse(w.localStorage.getItem('jjuda-spot-six-v1')),round=()=>state().rounds[id];
 const surface=w.document.getElementById('original').parentElement;surface.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800});
 return {w,id,request,calls,state,round,
  async start(){w.document.getElementById('start').click();await tick();await tick();},
  async account(next){actor=next;await w.JjudaWallet.refresh();},
  async complete(){
   for(const spot of puzzles[48].spots){const init={bubbles:true,clientX:spot.x*10,clientY:spot.y*8};surface.dispatchEvent(new w.MouseEvent('pointerdown',init));surface.dispatchEvent(new w.MouseEvent('click',init));}
   await tick();await tick();assert.equal(round().status,'won');assert.equal(w.document.getElementById('found-count').textContent,'6');
  }
 };
}

test('Spot payment recovery uses a fresh round and the same receipt, then records completion for its original owner',async t=>{
 const {w,id,request,calls,state,round,start,complete}=await pendingSpot(t);
 assert.equal(state().current,48,'the receipt is confirmed against its original picture');assert.equal(state().order[0],48,'the recovered picture is a fresh first round');assert.deepEqual(state().found[id],[]);
 assert.equal(round().hearts,3);assert.equal(round().remainingMs,60000);assert.equal(round().totalMs,60000);assert.equal(round().pending.requestId,request.requestId);assert.equal(w.document.getElementById('found-count').textContent,'0');
 await start();assert.deepEqual(calls,[{name:'spot_game_buy_v2',args:{p_kind:'hint',p_request_id:request.requestId,p_stage:id,p_spot:2,p_verify_only:false},actor:owner}]);assert.equal(round().pending,null);assert.deepEqual(round().paid,[2]);
 const active=state();w.document.dispatchEvent(new w.Event('visibilitychange'));assert.deepEqual(state(),active,'returning to the same tab does not restart the round');
 await complete();assert.deepEqual(calls.filter(call=>call.name==='record_spot_clear'),[{name:'record_spot_clear',args:{p_stage:id},actor:owner}],'a recovered round still submits its completion');
 assert.equal(round().rankOwner,owner);
});

test('Spot denied receipt recovery still records a completed fresh round for the original owner',async t=>{
 const f=await pendingSpot(t,async()=>({ok:false,reason:'coins'}));
 await f.start();assert.equal(f.round().pending,null);assert.equal(f.round().status,'playing');assert.deepEqual(f.round().paid,[]);
 await f.complete();assert.deepEqual(f.calls.filter(call=>call.name==='record_spot_clear'),[{name:'record_spot_clear',args:{p_stage:f.id},actor:owner}]);assert.equal(f.round().rankOwner,owner);
});

test('Spot pending recovery cannot charge or submit a completion as a different account',async t=>{
 let resolve;const response=new Promise(done=>resolve=done),f=await pendingSpot(t,()=>response),other=randomUUID();
 await f.account(other);await f.start();assert.equal(f.calls.length,0,'another account cannot confirm the old receipt');assert.equal(f.round().status,'payment');assert.equal(f.round().pending.requestId,f.request.requestId);
 await f.account(owner);await f.start();assert.equal(f.calls.length,1);assert.equal(f.calls[0].actor,owner);assert.equal(f.calls[0].args.p_request_id,f.request.requestId);
 await f.account(other);resolve({ok:true,kind:'hint',stage:f.id,spot:2,price:1});await tick();await tick();
 assert.equal(f.round().pending,null);assert.equal(f.round().rankOwner,owner,'a late purchase response never rebinds the fresh round to the next account');
 await f.complete();assert.deepEqual(f.calls.filter(call=>call.name==='record_spot_clear'),[],'the real wallet rejects the old owner before a ranking RPC under the new account');
 assert.match(f.w.document.getElementById('message').textContent,/완료 기록을 저장하지 못했어요/);
});
