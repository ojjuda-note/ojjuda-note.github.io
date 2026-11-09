const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test'),{JSDOM}=require('jsdom');
const E=require('../games/sacheonseong/engine.js'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const KEY='ojjuda-sacheonseong-v1',RECORDS='ojjuda-sacheonseong-records-v1';
function fixture({stage=2,grid=null,stack=null,saved=null,records={},seed=null,embedded=false}={}){
 const dom=new JSDOM(read('games/sacheonseong/index.html'),{url:'https://example.test/games/sacheonseong/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
 const timers=new Map(),intervals=[],sent=[],finished=[];let id=0,now=Date.now();w.Date.now=()=>now;
 if(embedded){
  Object.defineProperty(w,'parent',{value:{postMessage:(message,origin)=>{if(message.type==='ojjuda:sacheonseong-finished')finished.push({message,origin});},OjjudaGuestAccess:{canPlay:()=>finished.length===0}}});
  require('./game-results-fixture.cjs')(w);
 }
 if(seed!==null){let value=seed>>>0;w.Math.random=()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/4294967296);}
 w.setTimeout=(fn,delay)=>{timers.set(++id,{fn,delay});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=fn=>intervals.push(fn);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 Object.defineProperties(d.getElementById('board-scroll'),{clientWidth:{value:378},clientHeight:{value:702}});
 w.OjjudaSacheonseongOnline={newId:()=>w.crypto.randomUUID(),stage:()=>{},record:(stage,record)=>sent.push({stage,...record})};
 w.localStorage.setItem(KEY,JSON.stringify(saved||{unlocked:Math.min(E.MAX_STAGE,stage+1),sound:false}));
 w.localStorage.setItem(RECORDS,JSON.stringify(records));
 for(const name of ['engine','faces'])w.eval(read('games/sacheonseong/'+name+'.js'));
 // Arrange a late round directly; a later visit starts a fresh board at the saved level.
 if(!saved||stack){const generate=w.TileGarden.generateStack;let arranged=false;w.TileGarden.generateStack=(n,...args)=>{
  const result=generate(n,...args);if(!arranged&&n===stage){
   arranged=true;
   if(stack){result.grids=stack.map(floor=>floor.map(row=>row.slice()));result.info={...result.info,layerCount:stack.length,total:result.grids.flat(2).filter(v=>v!==E.EMPTY).length};}
   else{const late=grid?grid.map(row=>row.slice()):result.grids[0].map(row=>row.map(()=>E.EMPTY));
    if(!grid)late[0][0]=late[0][1]=0;
    result.grids=[late];result.info={...result.info,layerCount:1,total:late.flat().filter(v=>v!==E.EMPTY).length};}
  }return result;
 };}
 w.eval(read('games/sacheonseong/app.js'));
 if(!saved&&stage>1){d.getElementById('all-stages').click();d.querySelector(`[data-stage="${stage}"]`).click();}
 return {w,d,sent,finished,state:()=>JSON.parse(w.localStorage.getItem(KEY)),records:()=>JSON.parse(w.localStorage.getItem(RECORDS)),advance:ms=>{now+=ms;intervals.forEach(fn=>fn());},match:()=>{d.querySelector('[data-r="0"][data-c="0"]').click();now+=12000;d.querySelector('[data-r="0"][data-c="1"]').click();},pending:delay=>[...timers.values()].filter(timer=>timer.delay===delay).map(timer=>timer.fn),run:delay=>{for(const [key,timer]of [...timers])if(timer.delay===delay){timers.delete(key);timer.fn();}},close:()=>w.close()};
}
for(const stage of [1,7,200])test(`guest stage ${stage} completion ends the trial once and blocks an immediate next round`,()=>{
 const f=fixture({stage,embedded:true});try{
  const runId=f.state().runId;f.match();
  assert.equal(f.finished.length,1,'a single completed stage ends the guest round');
  assert.deepEqual(JSON.parse(JSON.stringify(f.finished[0])),{message:{source:'ojjuda-sacheonseong-game',type:'ojjuda:sacheonseong-finished',runId,stage},origin:'https://example.test'});
  f.run(120);f.run(1000);assert.equal(f.finished.length,1,'completion animation cannot send the round twice');
  f.d.getElementById('next').click();f.d.getElementById('restart').click();
  assert.equal(f.state().runId,runId,'guest replay and Next cannot begin another round during the login delay');
 }finally{f.close();}
});
for(const stage of [2,7])test(`stage ${stage} saves and queues its last pair completion before the screen can close`,()=>{
 const f=fixture({stage});try{
  const before=f.state();if(stage===7)assert.ok(before.grid.length>before.grid[0].length,'the late-round fixture retains the generated portrait shape');
  f.match();assert.equal(f.sent.length,1,'closing during the removal animation must not lose the leaderboard delivery');assert.equal(f.sent[0].stage,stage);assert.equal(f.sent[0].rulesVersion,E.RULES_VERSION);assert.equal(f.records()[stage].length,1);assert(f.state().finishedMs>=12000);
  assert.equal(f.state().grid.length,before.grid.length);assert.ok(f.state().grid.every(row=>row.length===before.grid[0].length));assert.ok(f.state().grid.flat().every(value=>value===E.EMPTY));
  f.run(120);assert.equal(f.sent.length,1,'the animation cannot send a duplicate record');assert.equal(f.d.getElementById('completion').hidden,false);
 }finally{f.close();}
});
test('switching stages immediately after the last pair keeps the completed record',()=>{
 const f=fixture();try{f.match();f.d.getElementById('all-stages').click();f.d.querySelector('[data-stage="3"]').click();f.run(120);assert.equal(f.state().stage,3);assert.equal(f.records()[2]?.length,1);assert.equal(f.sent.length,1);assert.equal(f.d.getElementById('completion').hidden,true);}finally{f.close();}
});
test('a late completion callback cannot mark a newer board complete or enable its Next button',()=>{
 const f=fixture();try{
  f.match();const queued=f.pending(120);assert.equal(queued.length,1);
  f.d.getElementById('all-stages').click();f.d.querySelector('[data-stage="3"]').click();const fresh=f.state();
  queued[0]();assert.deepEqual(f.state(),fresh);assert.equal(f.d.getElementById('completion').hidden,true);assert.equal(f.d.getElementById('next').disabled,true);
  // A detached or stale result handler must check the round, not its visibility.
  f.d.getElementById('completion').hidden=false;f.d.getElementById('next').onclick();assert.deepEqual(f.state(),fresh);
  assert.equal(f.sent.length,1);assert.equal(f.records()[2].length,1);
 }finally{f.close();}
});
test('history and unlocked levels do not allow Next on a fresh or partially solved attempt',()=>{
 const records={2:[{id:'old-clear',duration:12000,at:1700000000000,rulesVersion:3}]};
 const f=fixture({saved:{stage:2,unlocked:3},records});try{
  const before=f.state();assert.equal(f.d.getElementById('next').disabled,true);
  f.d.getElementById('completion').hidden=false;f.d.getElementById('next').onclick();assert.deepEqual(f.state(),before);
  f.d.getElementById('completion').hidden=true;f.d.querySelector('.tile:not(:disabled)').click();f.advance(1000);
  const playing=f.state();f.d.getElementById('next').onclick();assert.deepEqual(f.state(),playing);assert.deepEqual(f.records(),records);assert.equal(f.sent.length,0);
  f.d.getElementById('all-stages').click();const locked=f.d.querySelector('[data-stage="4"]');assert.equal(locked.disabled,true);locked.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true}));assert.equal(f.state().stage,2,'a forced locked menu event cannot open a new level');
  f.d.querySelector('[data-stage="3"]').click();f.d.getElementById('confirm-action').click();assert.equal(f.state().stage,3,'explicit selection of an already unlocked level remains available');
 }finally{f.close();}
});
test('a detached stage-change confirmation cannot affect a later attempt',()=>{
 const f=fixture({saved:{stage:2,unlocked:3}});try{
  f.d.querySelector('.tile:not(:disabled)').click();f.d.getElementById('all-stages').click();f.d.querySelector('[data-stage="3"]').click();
  const queued=f.d.getElementById('confirm-action').onclick;f.d.getElementById('cancel-action').click();
  f.d.getElementById('restart').click();f.d.getElementById('confirm-action').click();const fresh=f.state();
  queued();assert.deepEqual(f.state(),fresh,'the old selection cannot jump from the restarted round to stage 3');assert.equal(f.sent.length,0);
 }finally{f.close();}
});
for(const stage of [2,7])test(`reopening completed stage ${stage} preserves its best time without recording twice`,()=>{
 let f=fixture({stage}),saved,records;try{f.match();saved=f.state();records=f.records();}finally{f.close();}
 f=fixture({saved,records});try{
  assert.equal(f.state().stage,stage);assert.equal(f.state().totalTiles,E.stageInfo(stage).total);assert.equal(f.state().layerCount,E.layerCount(stage));assert.notEqual(f.state().runId,saved.runId);assert.equal(f.state().rulesVersion,E.RULES_VERSION);
  assert.ok(f.state().grid.flat().some(v=>v!==E.EMPTY),'reopening creates a new playable layer');
  assert.equal(f.state().grid.flat().filter(v=>v!==E.EMPTY).length+f.state().upcoming.flat(2).filter(v=>v!==E.EMPTY).length,E.stageInfo(stage).total);
  assert.ok(f.state().grid.every(row=>row.length===f.state().grid[0].length));
  assert.equal(f.state().startedAt,null);assert.equal(f.state().finishedMs,null);assert.equal(f.state().penaltyMs,0);
  assert.deepEqual(f.records(),records);assert.equal(f.sent.length,0);assert.equal(f.d.getElementById('completion').hidden,true);
 }finally{f.close();}
});
test('final-stage completion never advances beyond stage 200',()=>{
 let f=fixture({stage:200}),saved,records;try{f.match();f.run(120);f.run(1000);assert.equal(f.state().stage,200);assert.equal(f.sent.length,1);assert.match(f.d.getElementById('win-title').textContent,/모두 완성/);assert.equal(f.d.getElementById('next').disabled,true);f.d.getElementById('next').click();assert.equal(f.state().stage,200);assert.equal(f.d.getElementById('completion').hidden,false);assert.equal(f.d.getElementById('previous-level').disabled,false);assert.equal(f.d.getElementById('current-level').disabled,false);saved=f.state();records=f.records();}finally{f.close();}
 f=fixture({saved,records});try{
  assert.equal(f.state().stage,200);assert.equal(f.state().totalTiles,1200);assert.equal(f.state().layerCount,E.layerCount(200));assert.equal(f.state().upcoming.length,E.layerCount(200)-1);
  assert.equal(f.state().grid.flat().filter(v=>v!==E.EMPTY).length+f.state().upcoming.flat(2).filter(v=>v!==E.EMPTY).length,1200);
  assert.ok(f.state().grid.every(row=>row.length===f.state().grid[0].length));
  assert.equal(f.state().startedAt,null);assert.equal(f.state().finishedMs,null);assert.equal(f.d.getElementById('completion').hidden,true);
  assert.deepEqual(f.records(),records);assert.equal(f.sent.length,0);
 }finally{f.close();}
});

test('a layered round allows exposed pairs on any floor and finishes only when all tiles are gone',()=>{
 const previous={id:'old-record',duration:5000,at:1700000000000,rulesVersion:3};
 const f=fixture({saved:{rulesVersion:E.RULES_VERSION,stage:7,unlocked:7},records:{7:[previous]},seed:37});
 const remaining=()=>[f.state().grid,...f.state().upcoming].flat(2).filter(value=>value!==E.EMPTY).length;
 const matchNext=()=>{
  const move=E.exposedMoves([f.state().grid,...f.state().upcoming]);assert.ok(move,'the live board has an uncovered pair after automatic dead-end recovery');
  const at=p=>f.d.querySelector(`[data-layer="${p.layer}"][data-r="${p.r}"][data-c="${p.c}"]`);
  assert.equal(at(move.a).disabled,false);assert.equal(at(move.b).disabled,false);
  at(move.a).click();f.advance(25);at(move.b).click();f.run(120);
 };
 try{
  const total=E.stageInfo(7).total;
  assert.equal(remaining(),total);assert.equal(f.state().layerCount,E.layerCount(7));assert.equal(f.state().upcoming.length,E.layerCount(7)-1);
  assert.ok(f.state().grid.flat().some(value=>value===E.EMPTY),'irregular floors leave visible gaps');
  assert.equal(f.d.getElementById('remaining').textContent,`${total} / ${total}`);
  assert.equal(f.d.querySelectorAll('.tile:not(.empty)').length,total,'All layers reveal their actual tile faces');
  for(let pair=1;pair<total/2;pair++){matchNext();assert.equal(remaining(),total-2*pair);assert.equal(f.sent.length,0);}
  assert.equal(f.state().upcoming.length,E.layerCount(7)-1,'Lower floors stay in their original offset throughout the round');
  assert.equal(f.state().finishedMs,null);assert.equal(f.d.getElementById('completion').hidden,true);assert.equal(f.d.getElementById('remaining').textContent,`2 / ${total}`);
  matchNext();assert.equal(remaining(),0);assert.equal(f.d.getElementById('remaining').textContent,`0 / ${total}`);assert.equal(f.d.getElementById('completion').hidden,false);
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].stage,7);assert.equal(f.sent[0].rulesVersion,E.RULES_VERSION);assert.equal(f.records()[7].length,2);assert.deepEqual(f.records()[7].find(record=>record.id===previous.id),previous);assert.equal(f.state().unlocked,8);
  f.d.getElementById('next').click();const next=f.state(),nextTotal=E.stageInfo(8).total;
  assert.equal(next.stage,8);assert.equal(remaining(),nextTotal);assert.ok(E.withinCopyLimit(next.grid));
  assert.equal(f.d.getElementById('remaining').textContent,`${nextTotal} / ${nextTotal}`);assert.equal(next.startedAt,null);assert.equal(next.finishedMs,null);assert.equal(f.d.getElementById('completion').hidden,true);assert.equal(f.sent.length,1);assert.equal(f.records()[7].length,2);
 }finally{f.close();}
});

test('one upper tile covers four lower faces, which unlock while other upper tiles remain',()=>{
 const upper=Array.from({length:4},()=>Array(4).fill(E.EMPTY));
 upper[1][1]=upper[3][3]=9;upper[3][0]=upper[3][1]=10;
 const lower=Array.from({length:4},()=>Array(4).fill(E.EMPTY));
 lower[0][0]=lower[0][1]=7;lower[1][0]=lower[1][1]=8;
 const f=fixture({stage:6,stack:[upper,lower]});
 const at=(layer,r,c)=>f.d.querySelector(`[data-layer="${layer}"][data-r="${r}"][data-c="${c}"]`);
 try{
  assert.equal(f.d.querySelectorAll('.tile-layer').length,2);
  assert.equal(f.d.querySelectorAll('.tile:not(.empty)').length,8,'Both floors show actual pictures');
  for(let r=0;r<2;r++)for(let c=0;c<2;c++){
   assert(at(1,r,c).disabled,'An upper tile blocks this lower face');
   assert.match(at(1,r,c).getAttribute('aria-label'),/가려짐/);
  }
  const untouched=f.state();at(1,0,0).click();assert.deepEqual(f.state(),untouched,'Covered tiles cannot be clicked');
  at(0,1,1).click();at(0,3,3).click();f.run(120);
  assert.equal(f.state().grid[3][0],10,'The upper floor has not been cleared');
  for(let r=0;r<2;r++)for(let c=0;c<2;c++)assert.equal(at(1,r,c).disabled,false,'All four lower faces unlock once the covering tile disappears');
  at(1,0,0).click();at(1,0,1).click();f.run(120);
  assert.equal(f.state().upcoming[0][0][0],E.EMPTY,'An exposed lower pair is removed even while the upper layer remains');
  assert.equal(f.sent.length,0,'The stage does not finish early');
 }finally{f.close();}
});

test('a missing or invalid saved level starts at level one without discarding unlocked stages',()=>{
 for(const stage of [undefined,null,'5',2.5,0,-1,E.MAX_STAGE+1,{}]){
  const f=fixture({saved:{stage,unlocked:8,sound:true}});try{
   assert.equal(f.state().stage,1,`invalid saved level ${JSON.stringify(stage)}`);
   assert.equal(f.state().grid.flat().filter(v=>v!==-1).length,4);assert.equal(f.state().unlocked,8);assert.equal(f.state().sound,true);
   assert.equal(f.state().startedAt,null);assert.equal(f.state().penaltyMs,0);assert.equal(f.sent.length,0);
  }finally{f.close();}
 }
});

test('matching a pair keeps the other tile buttons and keyboard focus intact',()=>{
 const grid=Array.from({length:4},()=>Array(4).fill(-1));grid[0][0]=grid[0][1]=0;grid[1][0]=grid[1][1]=1;
 const f=fixture({stage:2,grid});
 try{const remaining=f.d.querySelector('[data-r="1"][data-c="1"]');remaining.focus();f.match();f.run(120);assert.equal(f.d.querySelector('[data-r="1"][data-c="1"]'),remaining);assert(remaining.isConnected);assert.equal(f.d.activeElement,remaining);assert.equal(f.d.querySelectorAll('.tile.empty').length,14);assert.equal(f.d.querySelectorAll('.tile.removing').length,0);}finally{f.close();}
});

test('a completion outside the local top 30 is not submitted again on reopening',()=>{
 const best=Array.from({length:30},(_,i)=>({id:'best-'+i,duration:i+1,at:Date.now()}));let f=fixture({records:{2:best}}),saved,records;
 try{f.match();saved=f.state();records=f.records();assert.equal(records[2].length,30);assert.equal(saved.lastRank,31);}finally{f.close();}
 f=fixture({saved,records});try{assert.equal(f.state().stage,2);assert.equal(f.sent.length,0);assert.equal(f.records()[2].length,30);assert.equal(f.d.getElementById('completion').hidden,true);}finally{f.close();}
});

test('completion waits for a choice instead of advancing after four seconds',()=>{
 const f=fixture();try{
  assert.equal(f.d.getElementById('completion').hidden,true);
  f.match();f.run(120);const completed=f.state();
  for(let i=0;i<60;i++)f.run(1000);
  assert.deepEqual(f.state(),completed);assert.equal(f.d.getElementById('completion').hidden,false);
  assert.deepEqual([...f.d.querySelectorAll('.completion-levels button span')].map(b=>b.textContent),['이전 레벨','지금 레벨','다음 레벨']);
 }finally{f.close();}
});

for(const [button,stage]of [['previous-level',1],['current-level',2],['next',3]])test(`${button} remembers the chosen level on reentry and keeps the completed record`,()=>{
 let f=fixture(),selected,records;try{
  f.match();f.run(120);f.d.getElementById(button).click();selected=f.state();records=f.records();
  assert.equal(selected.stage,stage);assert.equal(selected.grid.flat().filter(v=>v!==-1).length,4*stage*stage);
  assert.equal(selected.startedAt,null);assert.equal(selected.finishedMs,null);assert.equal(selected.unlocked,3);
  assert.equal(f.d.getElementById('completion').hidden,true);assert.equal(f.records()[2].length,1);assert.equal(f.sent.length,1);
  f.d.getElementById(button).click();f.run(1000);assert.deepEqual(f.state(),selected,'a second queued click cannot start another round');
 }finally{f.close();}
 f=fixture({saved:selected,records});try{
  assert.equal(f.state().stage,stage,'the chosen level is restored instead of the highest unlocked level');
  assert.equal(f.state().grid.flat().filter(v=>v!==-1).length,4*stage*stage);assert.notEqual(f.state().runId,selected.runId);
  assert.equal(f.state().startedAt,null);assert.equal(f.state().finishedMs,null);assert.equal(f.state().penaltyMs,0);assert.equal(f.state().unlocked,3);
  assert.deepEqual(f.records(),records);assert.equal(f.sent.length,0);
 }finally{f.close();}
});

test('first-stage completion disables only the previous level',()=>{
 const f=fixture({stage:1});try{
  f.match();f.run(120);assert.equal(f.d.getElementById('previous-level').disabled,true);
  f.d.getElementById('previous-level').click();assert.equal(f.state().stage,1);assert.equal(f.d.getElementById('completion').hidden,false);
  assert.equal(f.d.getElementById('current-level').disabled,false);assert.equal(f.d.getElementById('next').disabled,false);
 }finally{f.close();}
});

test('reopening a saved result starts fresh and still permits choosing its unlocked level',()=>{
 let f=fixture(),saved,records;try{f.match();f.run(120);saved=f.state();records=f.records();}finally{f.close();}
 f=fixture({saved,records});try{
  for(let i=0;i<10;i++)f.run(1000);
  assert.equal(f.state().stage,2);assert.equal(f.sent.length,0);assert.equal(f.d.getElementById('completion').hidden,true);
  f.d.getElementById('all-stages').click();f.d.querySelector('[data-stage="3"]').click();assert.equal(f.state().stage,3);assert.equal(f.state().finishedMs,null);assert.equal(f.records()[2].length,1);
 }finally{f.close();}
});

test('rapid consecutive pairs are accepted while earlier removal effects are running',()=>{
 const grid=Array.from({length:4},()=>Array(4).fill(-1));for(let r=0;r<3;r++)grid[r][0]=grid[r][1]=r;
 const f=fixture({stage:2,grid});
 try{
  const tile=(r,c)=>f.d.querySelector(`[data-r="${r}"][data-c="${c}"]`);
  f.match();assert.equal(f.d.querySelectorAll('.removing').length,2);assert.match(f.d.getElementById('remaining').textContent,/4/);
  tile(1,0).click();assert.equal(tile(1,0).getAttribute('aria-pressed'),'true','the next tap is accepted before any timer runs');
  tile(1,1).click();assert.equal(f.d.querySelectorAll('.removing').length,4);assert.equal(f.state().grid[1][0],-1);
  tile(2,0).click();tile(2,1).click();assert.equal(f.sent.length,1);assert.equal(f.state().grid.flat().filter(v=>v!==-1).length,0);
  f.run(120);assert.equal(f.d.querySelectorAll('.removing').length,0);assert.equal(f.d.getElementById('completion').hidden,false);assert.equal(f.sent.length,1);
 }finally{f.close();}
});

test('an older pair effect does not clear a newer selection or touch a restarted board',()=>{
 const grid=Array.from({length:4},()=>Array(4).fill(-1));for(let r=0;r<3;r++)grid[r][0]=grid[r][1]=r;
 const f=fixture({stage:2,grid});
 try{
  f.match();const next=f.d.querySelector('[data-r="1"][data-c="0"]');next.click();f.run(120);assert.equal(next.getAttribute('aria-pressed'),'true');
  f.d.querySelector('[data-r="1"][data-c="1"]').click();f.d.getElementById('restart').click();f.d.getElementById('confirm-action').click();
  const fresh=[...f.d.querySelectorAll('.tile')];f.run(120);assert.equal(f.d.querySelectorAll('.tile:not(:disabled)').length,16);assert.equal(f.d.querySelector('.tile'),fresh[0]);assert.equal(f.sent.length,0);
 }finally{f.close();}
});

test('each wrong face pair adds ten seconds to the clock and the completed local and online record',()=>{
 const grid=Array.from({length:4},()=>Array(4).fill(-1));for(let r=0;r<3;r++)grid[r][0]=grid[r][1]=r;
 const previous={id:'existing-best',duration:1234,at:1600000000000};
 const f=fixture({grid,records:{2:[previous]}}),tile=(r,c)=>f.d.querySelector(`[data-r="${r}"][data-c="${c}"]`),clock=()=>f.d.getElementById('timer').textContent;
 try{
  tile(0,2).click();tile(0,0).click();tile(0,0).click();f.advance(0);
  assert.equal(clock(),'00:00.00','empty cells, first selection and deselection are not mistakes');
  tile(0,0).click();tile(1,0).click();assert.equal(clock(),'00:10.00');
  tile(2,0).click();assert.equal(clock(),'00:20.00','a second wrong pair adds another ten seconds immediately');
  assert.deepEqual(f.state().grid,grid,'wrong pairs do not remove tiles');
  tile(2,1).click();tile(0,0).click();tile(0,1).click();assert.equal(clock(),'00:20.00','legal pairs do not add penalties');
  f.advance(1250);assert.equal(clock(),'00:21.25','the running clock retains penalties as real time advances');
  tile(1,0).click();tile(1,1).click();
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].duration,21250,'online delivery includes wall time and both penalties');
  assert.equal(f.records()[2].find(r=>r.id!==previous.id).duration,21250);
  assert.deepEqual(f.records()[2].find(r=>r.id===previous.id),previous,'an existing personal record is preserved');
  f.run(120);assert.equal(clock(),'00:21.25');assert.match(f.d.getElementById('win-desc').textContent,/00:21\.25/);
  assert.equal(f.sent.length,1,'removal effects do not submit the penalized record twice');
 }finally{f.close();}
});

test('repeated blocked same-face pairs add ten seconds each without charging cancellation or modal clicks',()=>{
 const grid=[[2,2,3,3],[4,0,5,4],[6,5,0,6],[7,7,8,8]],a={r:1,c:1},b={r:2,c:2};
 assert.equal(E.path(grid,a,b),null);assert.ok(E.moves(grid),'the board still has legal alternatives');
 const f=fixture({grid}),tile=p=>f.d.querySelector(`[data-r="${p.r}"][data-c="${p.c}"]`),clock=()=>f.d.getElementById('timer').textContent;
 try{
  tile(a).click();f.advance(2500);tile(b).click();assert.equal(clock(),'00:12.50');
  assert.equal(tile(a).getAttribute('aria-pressed'),'true','a blocked route keeps the original selection');
  tile(b).click();assert.equal(clock(),'00:22.50');assert.deepEqual(f.state().grid,grid);
  tile(a).click();assert.equal(clock(),'00:22.50','deselecting does not add another penalty');
  f.d.getElementById('options-open').click();tile(a).click();tile(b).click();
  assert.equal(clock(),'00:22.50','tiles cannot be played behind the open menu');
  f.d.getElementById('options-close').click();f.d.getElementById('all-stages').click();tile(a).click();tile(b).click();
  assert.equal(clock(),'00:22.50','tiles cannot be played behind a modal');assert.equal(f.sent.length,0);
 }finally{f.close();}
});

for(const action of ['restart','another stage','new visit'])test(`wrong-pair time resets on ${action} while earlier records survive`,()=>{
 const grid=Array.from({length:4},()=>Array(4).fill(-1));grid[0][0]=grid[0][1]=0;grid[1][0]=grid[1][1]=1;
 const records={2:[{id:'old-record',duration:5000,at:1600000000000}]};let f=fixture({grid,records});
 try{
  f.d.querySelector('[data-r="0"][data-c="0"]').click();f.d.querySelector('[data-r="1"][data-c="0"]').click();
  assert.equal(f.d.getElementById('timer').textContent,'00:10.00');
  if(action==='new visit'){const saved=f.state();f.close();f=fixture({saved,records});}
  else{
   if(action==='restart')f.d.getElementById('restart').click();
   else{f.d.getElementById('all-stages').click();f.d.querySelector('[data-stage="3"]').click();}
   f.d.getElementById('confirm-action').click();
  }
  assert.equal(f.d.getElementById('timer').textContent,'00:00.00');
  f.d.querySelector('.tile:not(:disabled)').click();f.advance(1000);
  assert.equal(f.d.getElementById('timer').textContent,'00:01.00','a fresh clock does not inherit the old penalty');
  assert.deepEqual(f.records(),records);assert.equal(f.sent.length,0);
 }finally{f.close();}
});
