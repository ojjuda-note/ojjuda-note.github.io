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
function oldGarden(pendingPurchase){const grid=E.generate(5).grid;grid[0][0]=grid[0][1]=-1;return {rulesVersion:E.RULES_VERSION,runId:randomUUID(),stage:5,unlocked:8,grid,startedAt:Date.now()-90000,finishedMs:null,penaltyMs:20000,sound:true,hints:2,shuffles:1,pendingPurchase};}

test('Sacheonseong exit/reentry starts the last played stage with a new full board and run, keeping unlocks and records',async t=>{
 const saved=oldGarden(),f=sacheon(t,saved);const child=await f.enter(),first=f.state();
 assert.equal(first.stage,5,'resume the last stage, not the highest unlocked stage');assert.equal(first.grid.flat().filter(value=>value!==-1).length,100);assert.notEqual(first.runId,saved.runId);
 assert.equal(first.startedAt,null);assert.equal(first.finishedMs,null);assert.equal(first.penaltyMs,0);assert.equal(first.unlocked,8);assert.equal(first.sound,true);assert.equal(first.hints,0);assert.equal(first.shuffles,0);
 assert.equal(f.records()[5][0].id,'best');
 child.document.querySelector('.tile').click();const active=f.state();assert.ok(active.startedAt);
 child.document.dispatchEvent(new child.Event('visibilitychange'));child.dispatchEvent(new child.Event('resize'));
 f.w.OjjudaSacheonseongGame.open({owner});assert.equal(f.w.document.querySelector('iframe').contentWindow,child);assert.deepEqual(f.state(),active,'focus/visibility changes do not restart an active visit');
 child.document.getElementById('game-home').click();assert.equal(f.w.document.querySelector('iframe'),null);await f.enter();
 assert.notEqual(f.state().runId,active.runId);assert.equal(f.state().startedAt,null);assert.equal(f.state().penaltyMs,0);assert.equal(f.state().stage,5);assert.equal(f.state().grid.flat().filter(value=>value!==-1).length,100);assert.equal(f.records()[5][0].id,'best');
});

test('an unresolved Sacheonseong purchase resumes the last stage and applies its paid receipt once to the fresh board',async t=>{
 const pending={id:randomUUID(),runId:randomUUID(),stage:5,kind:'hint',owner,requestedAt:Date.now()-90000};
 const receipts=new Map([[pending.id,{ok:true,kind:pending.kind,run_id:pending.runId,stage:pending.stage,price:3}]]);let balance=17;
 const f=sacheon(t,oldGarden(pending),item=>{
  if(!receipts.has(item.id)){balance-=3;receipts.set(item.id,{ok:true,kind:item.kind,run_id:item.runId,stage:item.stage,price:3});}
  return receipts.get(item.id);
 });await f.enter();
 assert.equal(f.state().stage,5);assert.equal(f.state().grid.flat().filter(value=>value!==-1).length,100);assert.equal(f.state().startedAt,null);assert.equal(f.state().penaltyMs,0);assert.notEqual(f.state().runId,pending.runId);assert.deepEqual(f.state().pendingPurchase,pending);
 const before=Date.now();f.child().document.getElementById('hint').click();await tick();await tick();
 assert.deepEqual(f.calls,[{kind:'hint',id:pending.id,runId:pending.runId,stage:5}]);
 assert.equal(balance,17,'recovering an already paid request does not charge again');assert.equal(receipts.size,1);
 assert.equal(f.state().pendingPurchase,null);assert.equal(f.state().hints,1);assert.equal(f.child().document.querySelectorAll('.tile.hinted').length,2);assert.ok(f.state().startedAt>=before,'recovery does not carry the previous visit timer into a new run');
 f.w.OjjudaSacheonseongGame.close();await f.enter();assert.equal(f.state().stage,5);assert.equal(f.state().hints,0);assert.equal(f.state().pendingPurchase,undefined);assert.equal(f.calls.length,1,'a consumed receipt is not recovered a second time');assert.equal(balance,17);
});

const screwKeys={box:{stage:'ojjuda-screw-stage',resume:'ojjuda-screw-last-stage-v1',max:500},flat:{stage:'ojjuda-screw-flat-stage-v1',resume:'ojjuda-screw-flat-last-stage-v1',max:1000}};
function withScrews(run,entries=[],blocked=false){
 const storage=new Map(entries),localStorage=blocked?{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
 const context=vm.createContext({console,localStorage,window:{}});vm.runInContext(read('screw3d.js').replace(/export \{[^}]*\};/,''),context);
 const previous=global.localStorage,games=[],records=[];global.localStorage=localStorage;
 const api={setScore(){},end(){},saveScore:score=>records.push(score)};
 try{
  const G=require('../screw-flat.js');
  run({storage,records,box(stage){const game=context.screw3d(api,stage);game.state=context.window.__ojjScrew3d;return game;},flat(stage){const game=G.flat(api,stage);games.push(game);return game;}});
 }finally{for(const game of games)game.destroy();global.localStorage=previous;}
}
function completeScrew(game){
 if(game.state.lvl){game.state.lvl.screws.forEach(screw=>screw.state='done');game.state.lvl.els.forEach(piece=>piece.state='gone');}
 else game.state.level.plates.forEach(plate=>plate.state='gone');
 game.update(.05);
}
function nextScrew(game){if(game.state.lvl)for(let i=0;i<30;i++)game.update(.1);else game.onKey('Enter');}

test('both screw modes migrate old progress and reopen independent last levels with fresh boards and preserved purchases',()=>{
 const boxPurchase='ojjuda-screw-purchases-v1:'+owner+':37',flatPurchase='ojjuda-screw-flat-hole-pending-v1:'+owner+':14';
 const receipt=JSON.stringify({paid:[{kind:'buffer',id:randomUUID()}],pending:{box:randomUUID()}}),pending=randomUUID();
 withScrews(f=>{
  const old=f.box();assert.equal(old.state.L,37);old.state.score=20;old.state.buf[0]={used:true};old.state.lvl.screws[0].state='done';
  const fresh=f.box();assert.equal(fresh.state.L,37);assert.equal(fresh.state.score,0);assert.equal(fresh.state.t,0);assert.ok(fresh.state.buf.every(value=>value===null));assert.notEqual(fresh.state.lvl,old.state.lvl);assert.ok(fresh.state.lvl.screws.every(s=>s.state==='in'));
  const oldFlat=f.flat();assert.equal(oldFlat.state.L,14);oldFlat.state.moves=4;oldFlat.state.score=40;oldFlat.state.level.plates[0].state='gone';
  const freshFlat=f.flat();assert.equal(freshFlat.state.L,14);assert.equal(freshFlat.state.moves,0);assert.equal(freshFlat.state.score,0);assert.equal(freshFlat.state.t,0);assert.notEqual(freshFlat.state.level,oldFlat.state.level);assert.ok(freshFlat.state.level.plates.every(p=>p.state==='fixed'));assert.ok(freshFlat.state.collection.has('puppy-beach'));
  assert.equal(f.storage.get(screwKeys.box.resume),'37');assert.equal(f.storage.get(screwKeys.flat.resume),'14');assert.equal(f.box().state.L,37,'switching modes does not replace the other saved level');
  assert.equal(f.storage.get(boxPurchase),receipt);assert.equal(f.storage.get(flatPurchase),pending);assert.deepEqual(f.records,[],'reentry does not resubmit a completed score');
 },[[screwKeys.box.stage,'37'],[screwKeys.flat.stage,'14'],['ojjuda-screw-flat-pictures-v1','["puppy-beach"]'],[boxPurchase,receipt],[flatPurchase,pending]]);
});

for(const mode of ['box','flat'])test(`${mode} screw remembers a lower selected level and advances its resume point only when the next level starts`,()=>{
 const keys=screwKeys[mode];
 withScrews(f=>{
  const chosen=f[mode](3);assert.equal(chosen.state.L,3);assert.equal(f.storage.get(keys.resume),'3');assert.equal(f.storage.get(keys.stage),'37');
  const reopened=f[mode]();assert.equal(reopened.state.L,3,'last selected level takes priority over the highest unlocked level');completeScrew(reopened);
  assert.equal(f.records.length,1);assert.equal(f.storage.get(keys.resume),'3','completion alone keeps the current level');assert.equal(f.storage.get(keys.stage),'37');
  const beforeNext=f[mode]();assert.equal(beforeNext.state.L,3);assert.equal(beforeNext.state.score,0);assert.equal(f.records.length,1,'reopening a completed level does not submit it again');
  completeScrew(beforeNext);nextScrew(beforeNext);assert.equal(beforeNext.state.L,4);assert.equal(f.storage.get(keys.resume),'4');assert.equal(f.storage.get(keys.stage),'37','replaying earlier stages does not lower the milestone');
  const nextVisit=f[mode]();assert.equal(nextVisit.state.L,4);assert.equal(nextVisit.state.score,0);assert.equal(f.records.length,2);
 },[[keys.stage,'37'],[keys.resume,'12']]);
});

for(const mode of ['box','flat'])test(`${mode} screw validates saved and explicit levels and safely reopens its final level`,()=>{
 const keys=screwKeys[mode];
 for(const [resume,milestone,expected] of [[undefined,undefined,1],[undefined,'7',7],['bad','7',7],['2.5','7',7],['0','7',7],[String(keys.max+1),'7',7],['bad','7junk',1],['bad','2.5',1]]){
  const entries=[];if(resume!==undefined)entries.push([keys.resume,resume]);if(milestone!==undefined)entries.push([keys.stage,milestone]);
  withScrews(f=>{assert.equal(f[mode]().state.L,expected,`resume ${resume}, legacy ${milestone}`);assert.equal(f.storage.get(keys.resume),String(expected));},entries);
 }
 withScrews(f=>{
  for(const invalid of [0,-1,1.5,keys.max+1,'5',null]){f.storage.set(keys.resume,'7');assert.equal(f[mode](invalid).state.L,1,'an invalid explicit level falls back to the first level');assert.equal(f.storage.get(keys.stage),'8');}
 },[[keys.stage,'8']]);
 withScrews(f=>{const game=f[mode]();assert.equal(game.state.L,keys.max);completeScrew(game);nextScrew(game);assert.equal(game.state.L,keys.max);assert.equal(f.storage.get(keys.resume),String(keys.max));assert.equal(f[mode]().state.L,keys.max);},[[keys.resume,String(keys.max)],[keys.stage,String(keys.max)]]);
});

test('both screw modes remain playable and can advance when browser storage is unavailable',()=>{
 withScrews(f=>{for(const mode of ['box','flat']){const game=f[mode]();assert.equal(game.state.L,1);completeScrew(game);nextScrew(game);assert.equal(game.state.L,2);assert.equal(f[mode]().state.L,1,'without storage a later visit safely starts at one');}},[],true);
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
 for(const file of ['puzzles','photo-puzzles','masterpiece-puzzles','game-core'])w.eval(read('games/spot-difference/'+file+'.js'));
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
