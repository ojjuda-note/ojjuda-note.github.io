const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test'),{JSDOM}=require('jsdom');
const E=require('../games/sacheonseong/engine.js'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const KEY='ojjuda-sacheonseong-v1',RECORDS='ojjuda-sacheonseong-records-v1';
function fixture({stage=2,grid=null,saved=null,records={}}={}){
 const dom=new JSDOM(read('games/sacheonseong/index.html'),{url:'https://example.test/games/sacheonseong/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
 const timers=new Map(),intervals=[],sent=[];let id=0,now=Date.now();w.Date.now=()=>now;
 w.setTimeout=(fn,delay)=>{timers.set(++id,{fn,delay});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=fn=>intervals.push(fn);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 Object.defineProperties(d.getElementById('board-scroll'),{clientWidth:{value:348},clientHeight:{value:498}});
 w.OjjudaSacheonseongOnline={newId:()=>w.crypto.randomUUID(),stage:()=>{},record:(stage,record)=>sent.push({stage,...record})};
 const lateGrid=grid||Array.from({length:stage*2},()=>Array(stage*2).fill(-1));if(!grid)lateGrid[0][0]=lateGrid[0][1]=0;
 w.localStorage.setItem(KEY,JSON.stringify(saved||{unlocked:Math.min(15,stage+1),sound:false}));
 w.localStorage.setItem(RECORDS,JSON.stringify(records));
 for(const name of ['engine','faces'])w.eval(read('games/sacheonseong/'+name+'.js'));
 // Arrange a late round directly; storage now keeps achievements, not an active board to resume.
 if(!saved){const generate=w.TileGarden.generate;let arranged=false;w.TileGarden.generate=n=>{
  const result=generate(n);if(!arranged&&n===stage){arranged=true;result.grid=lateGrid.map(row=>row.slice());}return result;
 };}
 w.eval(read('games/sacheonseong/app.js'));
 if(!saved&&stage>1){d.getElementById('all-stages').click();d.querySelector(`[data-stage="${stage}"]`).click();}
 return {w,d,sent,state:()=>JSON.parse(w.localStorage.getItem(KEY)),records:()=>JSON.parse(w.localStorage.getItem(RECORDS)),advance:ms=>{now+=ms;intervals.forEach(fn=>fn());},match:()=>{d.querySelector('[data-r="0"][data-c="0"]').click();now+=12000;d.querySelector('[data-r="0"][data-c="1"]').click();},run:delay=>{for(const [key,timer]of [...timers])if(timer.delay===delay){timers.delete(key);timer.fn();}},close:()=>w.close()};
}
test('the last pair saves and queues its completion before the screen can close',()=>{
 const f=fixture();try{f.match();assert.equal(f.sent.length,1,'closing during the removal animation must not lose the leaderboard delivery');assert.equal(f.records()[2].length,1);assert(f.state().finishedMs>=12000);f.run(120);assert.equal(f.sent.length,1,'the animation cannot send a duplicate record');assert.equal(f.d.getElementById('completion').hidden,false);}finally{f.close();}
});
test('switching stages immediately after the last pair keeps the completed record',()=>{
 const f=fixture();try{f.match();f.d.getElementById('all-stages').click();f.d.querySelector('[data-stage="3"]').click();f.run(120);assert.equal(f.state().stage,3);assert.equal(f.records()[2]?.length,1);assert.equal(f.sent.length,1);assert.equal(f.d.getElementById('completion').hidden,true);}finally{f.close();}
});
test('reopening a completed round preserves its best time without recording twice',()=>{
 let f=fixture(),saved,records;try{f.match();saved=f.state();records=f.records();}finally{f.close();}
 f=fixture({saved,records});try{assert.equal(f.state().stage,1);assert.equal(f.state().grid.flat().filter(v=>v!==-1).length,4);assert.equal(f.records()[2].length,1);assert.equal(f.sent.length,0);assert.equal(f.d.getElementById('completion').hidden,true);}finally{f.close();}
});
test('final-stage completion never advances beyond stage 15',()=>{
 const f=fixture({stage:15});try{f.match();f.run(120);f.run(1000);assert.equal(f.state().stage,15);assert.equal(f.sent.length,1);assert.match(f.d.getElementById('win-title').textContent,/모두 완성/);assert.equal(f.d.getElementById('next').disabled,true);f.d.getElementById('next').click();assert.equal(f.state().stage,15);assert.equal(f.d.getElementById('completion').hidden,false);assert.equal(f.d.getElementById('previous-level').disabled,false);assert.equal(f.d.getElementById('current-level').disabled,false);}finally{f.close();}
});

test('matching a pair keeps the other tile buttons and keyboard focus intact',()=>{
 const grid=Array.from({length:4},()=>Array(4).fill(-1));grid[0][0]=grid[0][1]=0;grid[1][0]=grid[1][1]=1;
 const f=fixture({stage:2,grid});
 try{const remaining=f.d.querySelector('[data-r="1"][data-c="1"]');remaining.focus();f.match();f.run(120);assert.equal(f.d.querySelector('[data-r="1"][data-c="1"]'),remaining);assert(remaining.isConnected);assert.equal(f.d.activeElement,remaining);assert.equal(f.d.querySelectorAll('.tile.empty').length,14);assert.equal(f.d.querySelectorAll('.tile.removing').length,0);}finally{f.close();}
});

test('a completion outside the local top 30 is not submitted again on reopening',()=>{
 const best=Array.from({length:30},(_,i)=>({id:'best-'+i,duration:i+1,at:Date.now()}));let f=fixture({records:{2:best}}),saved,records;
 try{f.match();saved=f.state();records=f.records();assert.equal(records[2].length,30);assert.equal(saved.lastRank,31);}finally{f.close();}
 f=fixture({saved,records});try{assert.equal(f.state().stage,1);assert.equal(f.sent.length,0);assert.equal(f.records()[2].length,30);assert.equal(f.d.getElementById('completion').hidden,true);}finally{f.close();}
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

for(const [button,stage]of [['previous-level',1],['current-level',2],['next',3]])test(`${button} starts only the chosen level and keeps the completed record`,()=>{
 const f=fixture();try{
  f.match();f.run(120);f.d.getElementById(button).click();const selected=f.state();
  assert.equal(selected.stage,stage);assert.equal(selected.grid.flat().filter(v=>v!==-1).length,4*stage*stage);
  assert.equal(selected.startedAt,null);assert.equal(selected.finishedMs,null);assert.equal(selected.unlocked,3);
  assert.equal(f.d.getElementById('completion').hidden,true);assert.equal(f.records()[2].length,1);assert.equal(f.sent.length,1);
  f.d.getElementById(button).click();f.run(1000);assert.deepEqual(f.state(),selected,'a second queued click cannot start another round');
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
  assert.equal(f.state().stage,1);assert.equal(f.sent.length,0);assert.equal(f.d.getElementById('completion').hidden,true);
  f.d.getElementById('all-stages').click();f.d.querySelector('[data-stage="2"]').click();assert.equal(f.state().stage,2);assert.equal(f.state().finishedMs,null);assert.equal(f.records()[2].length,1);
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
