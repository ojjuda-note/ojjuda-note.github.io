const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test');
const {JSDOM}=require('jsdom');
const game=path.join(__dirname,'../games/spot-difference'),read=file=>fs.readFileSync(path.join(game,file),'utf8'),core=require(path.join(game,'game-core.js'));
const key='jjuda-spot-six-v1',owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',originalOwner='33333333-3333-4333-8333-333333333333';
const receiptA={requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userId:owner,kind:'hint',spot:5};
const receiptB={requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',userId:other,kind:'time',spot:-1};
const spots=Array.from({length:10},(_,i)=>({x:15+(i%2)*60,y:10+Math.floor(i/2)*18,rx:4,ry:4,text:`정답 ${i+1}`}));
// Deliberately separate array index, display position and original data ID.
const puzzles=[
 {id:82,title:'마지막 명화',difficulty:'very-hard',spots},
 {id:7,title:'일상 둘',spots:spots.slice(0,6)},
 {id:61,title:'실사 둘',difficulty:'hard',spots:spots.slice(0,6)},
 {id:2,title:'일상 하나',difficulty:'normal',spots:spots.slice(0,6)},
 {id:49,title:'실사 하나',difficulty:'hard',spots:spots.slice(0,6)},
 {id:63,title:'첫 명화',difficulty:'very-hard',spots}
].map(p=>({...p,original:'/fixture.svg',difference:'/fixture.svg'}));
const expectedOrder=[3,1,4,2,5,0],flush=()=>new Promise(resolve=>setImmediate(resolve));
const catalogFiles=['puzzles.js','photo-puzzles.js','masterpiece-puzzles.js','fairytale-pets-puzzles.js'];
function readCatalog(){const context=vm.createContext({window:{}});for(const file of catalogFiles)vm.runInContext(read(file),context);return JSON.parse(JSON.stringify(context.window.JJUDA_PUZZLES));}

test('Spot inserts the 70 slightly-hard pictures in display order without changing the original 82 IDs or saved indices',()=>{
 const context=vm.createContext({window:{}});
 for(const file of catalogFiles.slice(0,3))vm.runInContext(read(file),context);
 const legacy=JSON.parse(JSON.stringify(context.window.JJUDA_PUZZLES));
 vm.runInContext(read('fairytale-pets-puzzles.js'),context);
 const actual=JSON.parse(JSON.stringify(context.window.JJUDA_PUZZLES)),before=JSON.stringify(actual);
 const order=[...Array.from({length:48},(_,i)=>i),...Array.from({length:70},(_,i)=>i+82),...Array.from({length:34},(_,i)=>i+48)];
 assert.deepEqual(actual.slice(0,82),legacy,'new data only appends, preserving every original image and answer');
 assert.deepEqual(['normal','slightly-hard','hard','very-hard'].map(d=>actual.filter(p=>core.puzzleDifficulty(p)===d).length),[48,70,14,20]);
 assert.deepEqual(core.difficultyOrder(actual),order);
 assert.deepEqual(order.slice(48,118).map(i=>actual[i].id),Array.from({length:70},(_,i)=>i+83),'new IDs 83–152 occupy display positions 49–118');
 assert.deepEqual(core.difficultyOrder(puzzles),expectedOrder,'difficulty precedes ID even if the underlying array is interleaved');
 assert.equal(JSON.stringify(actual),before,'ordering never changes puzzle IDs, artwork, answer coordinates or array positions');
 const migrated=core.cleanProgress({version:2,current:48,order:legacy.map((_,i)=>i).reverse()},actual);
 assert.equal(actual[migrated.current].id,49,'a saved index still refers to the same original picture');
 assert.equal(migrated.order.indexOf(migrated.current),118,'old ID 49 now displays as picture 119');
 assert.deepEqual(migrated.order,order);
});

test('old shuffled progress migrates deterministically, keeping valid current identity and completed IDs',()=>{
 for(const version of [1,2]){
  const raw={version,current:0,order:[0,5,2,4,1,3],completed:[61,61,999,-1,'7'],found:{7:[0,1,2,3,4,5],82:[0,1,2,3,4,5,6,7,8]}};
  const clean=core.cleanProgress(raw,puzzles);
  assert.equal(clean.current,0);assert.equal(puzzles[clean.current].id,82);assert.deepEqual(clean.order,expectedOrder);
  assert.deepEqual(clean.completed,[7,61],'legacy fully solved pictures join valid, deduplicated completion history');
  assert.equal(clean.rounds[82].status,'ready','nine finds cannot complete a ten-answer masterpiece');
 }
 for(const current of [-1,6,'0',null])assert.equal(core.cleanProgress({version:2,current},puzzles).current,3);
 const restored=core.cleanProgress({version:2,current:2,rounds:{61:{...core.freshRound(),status:'payment',pending:receiptA,rankOwner:originalOwner},49:{...core.freshRound(),status:'payment',pending:receiptB}}},puzzles);
 assert.deepEqual(restored.rounds[61].pending,receiptA);assert.equal(restored.rounds[61].rankOwner,originalOwner);
 assert.deepEqual(restored.rounds[49].pending,receiptB);
 for(const pending of [{...receiptA,spot:6},{...receiptA,requestId:'bad'},{...receiptB,spot:0}]){
  assert.equal(core.cleanProgress({version:2,rounds:{61:{...core.freshRound(),status:'payment',pending}}},puzzles).rounds[61].pending,null,'migration does not relax receipt validation');
 }
});

function fixture(t,stored,fixturePuzzles=puzzles){
 const dom=new JSDOM(read('index.html'),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,$=id=>d.getElementById(id);t.after(()=>w.close());
 let now=100000,account={userId:owner,coins:100},subscriber,uuidCalls=0;const ticks=[],charges=[],records=[],registered=[];
 w.Date.now=()=>now;w.setInterval=fn=>ticks.push(fn);w.scrollTo=()=>{};w.confirm=()=>true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.crypto.randomUUID=()=>{uuidCalls++;return 'cccccccc-cccc-4ccc-8ccc-'+String(uuidCalls).padStart(12,'0');};
 d.modelContext={registerTool:tool=>registered.push(tool)};
 w.JjudaWallet={getState:()=>account,subscribe:fn=>{subscriber=fn;fn(account);},refresh:async()=>{},buy:async(request,stage)=>{charges.push({...request,stage});return {ok:true,kind:request.kind,stage,spot:request.spot,price:1,extend_ms:60000};},recordClear:async(recordOwner,stage)=>{records.push({owner:recordOwner,stage});return {ok:true};}};
 w.JJUDA_PUZZLES=JSON.parse(JSON.stringify(fixturePuzzles));w.eval(read('game-core.js'));
 if(stored)w.localStorage.setItem(key,JSON.stringify(stored));w.eval(read('app.js'));
 const state=()=>JSON.parse(w.localStorage.getItem(key)),round=()=>state().rounds[fixturePuzzles[state().current].id];
 const load=()=>{for(const image of d.querySelectorAll('img'))if(image.onload)image.onload();};
 function select(index){$('stage-picker').value=index;$('stage-picker').dispatchEvent(new w.Event('change'));load();}
 function tap(x,y){const surface=$('original').parentElement;surface.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800});const init={bubbles:true,clientX:x*10,clientY:y*8};surface.dispatchEvent(new w.MouseEvent('pointerdown',init));surface.dispatchEvent(new w.MouseEvent('click',init));}
 function solve(){for(const s of fixturePuzzles[state().current].spots)tap(s.x,s.y);}
 function advance(ms){now+=ms;for(const tick of ticks)tick();}
 load();return {w,d,$,state,round,load,select,tap,solve,advance,charges,records,registered,uuidCalls:()=>uuidCalls,account:id=>{account={...account,userId:id};subscriber(account);}};
}

test('adding the real 70-picture catalog resumes old ID 49 at display 119 and preserves completed history',t=>{
 const catalog=readCatalog(),f=fixture(t,{version:2,current:48,order:Array.from({length:82},(_,i)=>i),completed:[7,49,82],found:{49:[0,1]},rounds:{49:{...core.freshRound(),status:'playing',deadline:999999}}},catalog);
 assert.equal(f.state().current,48);assert.equal(catalog[f.state().current].id,49);
 assert.match(f.$('stage-label').textContent,/119 \/ 152.*어려움$/);assert.equal(f.$('stage-picker').value,'48');
 assert.deepEqual(f.state().completed,[7,49,82]);assert.deepEqual(f.state().found[49],[]);assert.equal(f.round().status,'ready');
 assert.deepEqual(Array.from(f.$('stage-picker').children,g=>g.children.length),[48,70,14,20]);
 assert.deepEqual(f.records,[]);assert.deepEqual(f.charges,[],'resuming an existing picture does not create purchases');
});

test('new ID 83 clears only on its tenth answer and each Next handler requires the current picture to be won',async t=>{
 const catalog=readCatalog(),f=fixture(t,{version:2,current:82},catalog);
 assert.match(f.$('stage-label').textContent,/49 \/ 152.*조금 어려움$/);assert.equal(f.$('found-total').textContent,'10');
 const tryNext=()=>{for(const id of ['next','continue','celebration-next','retry-next'])f.$(id).onclick();};
 tryNext();assert.equal(f.state().current,82,'a ready picture cannot be skipped by result or menu handlers');
 f.$('start').click();for(const s of catalog[82].spots.slice(0,9))f.tap(s.x,s.y);
 assert.equal(f.state().found[83].length,9);assert.equal(f.round().status,'playing');assert.equal(f.$('next').disabled,true);assert.deepEqual(f.records,[]);
 tryNext();assert.equal(f.state().current,82,'nine answers cannot unlock the next picture');
 const tenth=catalog[82].spots[9];f.tap(tenth.x,tenth.y);await flush();
 assert.equal(f.round().status,'won');assert.deepEqual(f.records,[{owner,stage:83}],'score uses stable ID 83, not display position 49');assert.deepEqual(f.state().completed,[83]);
 f.$('celebration-next').onclick();f.load();assert.equal(f.state().current,83);assert.equal(catalog[f.state().current].id,84);assert.equal(f.round().status,'playing');
 tryNext();assert.equal(f.state().current,83,'repeated Next clicks cannot skip the fresh next picture');
});

test('the last slightly-hard picture advances from ID 152 to old ID 49 and reentry keeps that identity',async t=>{
 const catalog=readCatalog(),f=fixture(t,{version:2,current:151},catalog);
 assert.match(f.$('stage-label').textContent,/118 \/ 152.*조금 어려움$/);
 f.$('next').onclick();assert.equal(f.state().current,151,'the difficulty boundary stays locked before clearing');
 f.$('start').click();f.solve();await flush();assert.equal(f.round().status,'won');assert.deepEqual(f.records,[{owner,stage:152}]);
 f.$('celebration-next').onclick();f.load();assert.equal(f.state().current,48);assert.equal(catalog[f.state().current].id,49);assert.match(f.$('stage-label').textContent,/119 \/ 152.*어려움$/);
 f.$('next').onclick();f.$('celebration-next').onclick();assert.equal(f.state().current,48,'old ID 49 must also be cleared before advancing');
 const again=fixture(t,f.state(),catalog);assert.equal(again.state().current,48);assert.equal(again.round().status,'ready');assert.deepEqual(again.state().completed,[152]);assert.deepEqual(again.records,[]);
});

test('reentry remembers the last picture and history, while confirmed hints and time stay round consumables',async t=>{
 const stored={version:2,current:0,order:[0,5,4,2,1,3],completed:[61],found:{7:[0,1,2,3,4,5],82:[0,1,2]},rounds:{82:{...core.freshRound(),status:'playing',hearts:1,deadline:999999,remainingMs:9000,totalMs:120000,paid:[8],hintIndex:8,timeBought:true,assisted:true,rankOwner:other}}};
 const f=fixture(t,stored);assert.equal(f.state().current,0);assert.deepEqual(f.state().order,expectedOrder);assert.deepEqual(f.state().completed,[7,61]);
 assert.deepEqual(f.state().found[82],[]);assert.equal(f.round().status,'ready');assert.equal(f.round().hearts,3);assert.equal(f.round().remainingMs,60000);assert.equal(f.round().totalMs,60000);
 assert.deepEqual(f.round().paid,[]);assert.equal(f.round().hintIndex,null);assert.equal(f.round().timeBought,false);assert.equal(f.round().assisted,false,'confirmed purchases are consumed by the previous round, not permanent picture rights');
 assert.equal(f.$('retry-level-choice').hidden,true);assert.equal(f.$('celebration').open,false);assert.deepEqual(f.records,[]);assert.deepEqual(f.charges,[]);
 assert.deepEqual(Array.from(f.$('stage-picker').options,o=>Number(o.value)),expectedOrder);
 assert.deepEqual(Array.from(f.$('stage-picker').children,g=>g.label),['쭈다의 일상 · 보통','도시와 사계절 산 · 어려움','세계 명화 · 매우 어려움 · 10곳 찾기']);
 f.$('start').click();f.tap(spots[0].x,spots[0].y);const deadline=f.round().deadline;f.advance(7000);f.d.dispatchEvent(new f.w.Event('visibilitychange'));
 assert.equal(f.round().status,'playing');assert.equal(f.round().deadline,deadline);assert.equal(f.$('time-left').textContent,'53');assert.deepEqual(f.state().found[82],[0],'visibility changes preserve the current attempt');
 f.solve();await flush();assert.deepEqual(f.records,[{owner,stage:82}],'completion sends the original ID rather than order position six');
 assert.deepEqual(f.state().completed,[7,61,82]);f.$('celebration-current').click();f.load();assert.equal(f.round().status,'playing');assert.deepEqual(f.state().found[82],[]);assert.equal(f.$('solved-total').textContent,'3','completion history does not make the replay finish immediately');
 const nextVisit=fixture(t,f.state());assert.equal(nextVisit.state().current,0);assert.equal(nextVisit.round().status,'ready');assert.deepEqual(nextVisit.state().completed,[7,61,82]);assert.deepEqual(nextVisit.records,[],'opening an old completed picture does not resubmit its score');
});

test('all unresolved receipts survive reentry without moving their pictures or rebinding their owners',async t=>{
 const f=fixture(t,{version:2,current:1,order:[1,2,4,0,3,5],rounds:{61:{...core.freshRound(),status:'payment',pending:receiptA,rankOwner:originalOwner,paid:[0],totalMs:120000,timeBought:true},49:{...core.freshRound(),status:'payment',pending:receiptB}}});
 assert.equal(f.state().current,1);assert.deepEqual(f.state().order,expectedOrder);assert.deepEqual(f.state().rounds[61].pending,receiptA);assert.deepEqual(f.state().rounds[49].pending,receiptB);
 assert.equal(f.state().rounds[61].rankOwner,originalOwner);assert.equal(f.state().rounds[49].rankOwner,other,'a receipt supplies the owner only when the old round had none');
 assert.equal(f.state().rounds[61].totalMs,60000);assert.deepEqual(f.state().rounds[61].paid,[],'only unresolved purchases recover into a new attempt');
 f.select(2);assert.equal(f.round().status,'payment');assert.equal(f.$('retry-level-choice').hidden,true);assert.deepEqual(f.charges,[],'opening a receipt destination does not spend ZU or auto-confirm');
 f.$('original').onerror();assert.deepEqual(f.round().pending,receiptA,'a failed image load keeps the exact receipt');f.load();
 const open=f.registered.find(tool=>tool.name==='open_game_stage');assert.throws(()=>open.execute({stage:1}),/구매 결과/);f.select(3);assert.equal(f.state().current,2,'hidden menu handlers cannot abandon an unresolved purchase');
 f.$('start').click();await flush();assert.deepEqual(f.charges,[{...receiptA,stage:61}]);assert.equal(f.uuidCalls(),0,'receipt recovery must not issue a replacement request UUID');assert.equal(f.round().rankOwner,originalOwner);
 assert.equal(f.round().status,'playing');assert.deepEqual(f.round().paid,[5]);assert.deepEqual(f.state().rounds[49].pending,receiptB);
 f.solve();await flush();f.$('celebration-previous').click();assert.equal(f.state().current,4);assert.equal(f.round().status,'payment');f.load();assert.equal(f.round().status,'payment','an end choice opens receipt recovery without auto-starting or charging');
 f.$('start').click();await flush();assert.equal(f.charges.length,1,'another account cannot confirm the old receipt');assert.deepEqual(f.round().pending,receiptB);assert.equal(f.round().rankOwner,other);
 f.account(other);f.$('start').click();await flush();assert.deepEqual(f.charges[1],{...receiptB,stage:49});assert.equal(f.round().totalMs,120000);assert.equal(f.round().timeBought,true);assert.equal(f.uuidCalls(),0);
});

test('replaying a failed picture consumes the old round help without changing history or making a purchase',async t=>{
 const f=fixture(t,{version:2,current:1,completed:[7]});f.$('start').click();f.$('hint').click();await flush();f.advance(51000);f.$('extend').click();await flush();
 assert.deepEqual(f.round().paid,[0]);assert.equal(f.round().timeBought,true);assert.equal(f.round().totalMs,120000);assert.equal(f.charges.length,2);
 for(let i=0;i<3;i++)f.tap(95,95);assert.equal(f.round().status,'lost');f.$('retry-current').click();f.load();
 assert.equal(f.state().current,1);assert.equal(f.round().status,'playing');assert.equal(f.round().hearts,3);assert.equal(f.round().totalMs,60000);assert.deepEqual(f.round().paid,[]);assert.equal(f.round().timeBought,false);assert.equal(f.round().hintIndex,null);
 assert.deepEqual(f.state().completed,[7]);assert.equal(f.charges.length,2,'choosing the new round does not buy help');assert.deepEqual(f.records,[],'failure and replay never submit a completion');
});

test('explicit picture selection and the open-stage tool retain free access without permitting Next on an unfinished round',t=>{
 const f=fixture(t),open=f.registered.find(tool=>tool.name==='open_game_stage');
 assert.equal(f.state().current,expectedOrder[0]);assert.equal(f.$('next').disabled,true);
 f.$('next').onclick();assert.equal(f.state().current,expectedOrder[0]);
 f.select(0);assert.equal(f.state().current,0,'the menu may explicitly select any existing picture');
 assert.equal(open.execute({stage:3}).stage,61,'the tool keeps original array-index selection semantics');
 assert.equal(f.state().current,2);assert.equal(f.round().status,'ready');assert.deepEqual(f.charges,[]);assert.deepEqual(f.records,[]);
 assert.equal(Object.hasOwn(f.state(),'unlockedStage'),false);
 f.$('continue').onclick();assert.equal(f.state().current,2,'explicit access does not change the current-clear requirement for sequential progress');
});
