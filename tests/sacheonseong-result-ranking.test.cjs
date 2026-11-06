const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {test}=require('node:test'),{JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const owner='11111111-1111-4111-8111-111111111111';

async function fixture(options={}){
  const dom=new JSDOM('<body></body>',{url:'https://fixture.test/world.html',runScripts:'outside-only',pretendToBeVisual:true});
  const parent=dom.window;let now=options.now??Date.parse('2026-11-15T12:00:00Z'),allowed=true,rankingCalls=0,resolveRanking;
  parent.Date.now=()=>now;parent.HTMLDialogElement.prototype.showModal=function(){this.open=true;};parent.HTMLDialogElement.prototype.close=function(){this.open=false;};
  parent.eval(read('games/sacheonseong/ranking.js'));parent.eval(read('games/sacheonseong/world-sacheonseong-game.js'));
  const rules=parent.OjjudaSacheonseongRanking,calls=[];
  const row=(stage,duration,me=false)=>({stage,score:rules.score(duration),me,nick:me?'나':'1등',source:'member_record'});
  parent.OjjudaSacheonseongGame.open({owner,authorized:()=>allowed,onScore:async(stage,score,id)=>{calls.push({stage,score,id});return {ok:options.recordOk!==false};},onRanking:async stage=>{
    assert.equal(stage,0,'every comparison uses the full monthly leaderboard');rankingCalls++;
    const result=rankingCalls===1?[row(options.beforeStage??9,options.beforeDuration??3600000)]:[row(options.afterStage??9,options.afterDuration??options.duration??3600000,options.afterMe??true)];
    if(options.holdRanking===rankingCalls)return new Promise(resolve=>{resolveRanking=()=>resolve(result);});
    if(options.failRanking===rankingCalls)throw Error('offline');return result;
  }});
  parent.document.querySelector('.ge-primary').click();const w=parent.document.querySelector('iframe').contentWindow;
  w.document.write(read('games/sacheonseong/index.html'));w.document.close();
  w.Date.now=()=>now;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.requestAnimationFrame=()=>1;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLElement.prototype.scrollIntoView=function(){};
  const timers=new Map();let timerId=0;w.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;};w.clearTimeout=id=>timers.delete(id);w.setInterval=()=>1;
  w.postMessage=data=>w.dispatchEvent(new w.MessageEvent('message',{data,origin:parent.location.origin,source:parent}));
  parent.postMessage=data=>parent.dispatchEvent(new parent.MessageEvent('message',{data,origin:parent.location.origin,source:w}));
  const $=id=>w.document.getElementById(id);Object.defineProperties($('board-scroll'),{clientWidth:{value:378},clientHeight:{value:702}});
  w.localStorage.setItem('ojjuda-sacheonseong-v1',JSON.stringify({stage:options.stage??9,unlocked:15,sound:false}));
  w.eval(read('shared/games/game-results.js'));
  for(const file of ['engine','faces','ranking','server'])w.eval(read('games/sacheonseong/'+file+'.js'));
  const generate=w.TileGarden.generate;w.TileGarden.generate=(...args)=>{const result=generate(...args);result.grid=result.grid.map(row=>row.map(()=>w.TileGarden.EMPTY));result.grid[0][0]=result.grid[0][1]=0;return result;};
  w.eval(read('games/sacheonseong/app.js'));await flush();await flush();
  const runTimers=delay=>{for(const [id,timer]of [...timers])if(timer.delay===delay){timers.delete(id);timer.fn();}};
  return {w,$,calls,rules,row,get rankingCalls(){return rankingCalls;},get now(){return now;},set now(value){now=value;},set allowed(value){allowed=value;},set recordOk(value){options.recordOk=value;},resolveRanking:()=>resolveRanking(),runTimers,
    begin:async()=>{$('board').querySelector('[data-r="0"][data-c="0"]').click();await flush();await flush();},
    finish:async()=>{now+=options.duration??3600000;$('board').querySelector('[data-r="0"][data-c="1"]').click();runTimers(120);await flush();await flush();await flush();},
    card:()=>$('completion').querySelector('.game-result-card'),close:()=>parent.close()};
}

for(const stage of [1,8])test(`stage ${stage} stays a simple success below the global stage 9 leader`,async()=>{
  const f=await fixture({stage,duration:1000});try{await f.begin();await f.finish();assert.equal(f.card().dataset.resultOutcome,'success');assert.equal(f.card().querySelector('.game-result-encouragement').hidden,true);assert.equal(f.calls.length,1);assert.equal(f.rankingCalls,1);}finally{f.close();}
});

test('same-stage slower time shows the real first-place gap after confirmed delivery',async()=>{
  const f=await fixture({duration:3660120,afterDuration:3600000,afterMe:false});try{await f.begin();await f.finish();assert.equal(f.card().dataset.resultOutcome,'success');assert.match(f.card().querySelector('.game-result-encouragement').textContent,/60\.12초 차이/);assert.equal(f.rankingCalls,2);assert.equal(f.calls[0].score,f.rules.score(3660120));}finally{f.close();}
});

test('only a strictly faster same-stage time confirmed as the global leader is a record',async()=>{
  const f=await fixture({duration:3599990,afterDuration:3599990,afterMe:true});try{await f.begin();await f.finish();assert.equal(f.card().dataset.resultOutcome,'record');assert.equal(f.card().querySelector('.game-result-title').textContent,'신기록');assert.equal(f.rankingCalls,2);assert.equal(f.calls.length,1);}finally{f.close();}
});

for(const options of [
  {duration:3600000,afterDuration:3600000,afterMe:true},
  {duration:3599990,afterDuration:3599990,afterMe:false},
  {stage:10,duration:3500000,afterStage:10,afterDuration:3500000,afterMe:true}
])test(`ties, another player's tied record and a different stage never become a time record: ${JSON.stringify(options)}`,async()=>{
  const f=await fixture(options);try{await f.begin();await f.finish();assert.equal(f.card().dataset.resultOutcome,'success');assert.doesNotMatch(f.card().textContent,/신기록/);}finally{f.close();}
});

test('failed delivery keeps local progress and the durable queue without claiming a record',async()=>{
  const f=await fixture({duration:3599000,recordOk:false});try{await f.begin();await f.finish();assert.equal(f.card().dataset.resultOutcome,'success');assert.equal(f.$('win-save-status').textContent,'기록 저장 대기');assert.equal(f.rankingCalls,1);assert.equal(JSON.parse(f.w.localStorage.getItem('ojjuda-sacheonseong-pending-v1')).length,1);}finally{f.close();}
});

test('retrying a failed save verifies the same result and clears its pending status',async()=>{
  const f=await fixture({duration:3599000,recordOk:false});try{await f.begin();await f.finish();const id=f.calls[0].id;f.recordOk=true;f.$('retry-records').click();await flush();await flush();await flush();assert.equal(f.calls[1].id,id);assert.equal(f.card().dataset.resultOutcome,'record');assert.equal(f.$('win-save-status').hidden,true);assert.equal(JSON.parse(f.w.localStorage.getItem('ojjuda-sacheonseong-pending-v1')).length,0);}finally{f.close();}
});

for(const failure of ['before','after','late-before'])test(`unavailable ${failure} ranking keeps the verified clear as success`,async()=>{
  const f=await fixture({duration:3599000,...(failure==='late-before'?{holdRanking:1}:{failRanking:failure==='before'?1:2})});try{await f.begin();await f.finish();if(failure==='late-before'){f.resolveRanking();await flush();}assert.equal(f.card().dataset.resultOutcome,'success');assert.equal(f.card().querySelector('.game-result-encouragement').hidden,true);assert.equal(f.calls.length,1);}finally{f.close();}
});

test('the monthly boundary is Korea 01:00 and a crossing round cannot mix monthly leaders',async()=>{
  const f=await fixture({now:Date.parse('2026-10-31T15:59:59Z'),duration:2000,beforeDuration:3000,afterDuration:2000});try{assert.equal(f.w.OjjudaSacheonseongOnline.monthKey(),'2026-10');await f.begin();await f.finish();assert.equal(f.w.OjjudaSacheonseongOnline.monthKey(),'2026-11');assert.equal(f.card().dataset.resultOutcome,'success');assert.equal(f.card().querySelector('.game-result-encouragement').hidden,true);}finally{f.close();}
});

test('an old ranking response cannot update a new round',async()=>{
  const f=await fixture({duration:3599000,holdRanking:2});try{await f.begin();await f.finish();assert.equal(f.rankingCalls,2);f.$('current-level').click();f.resolveRanking();await flush();assert.equal(f.$('completion').hidden,true);assert.equal(JSON.parse(f.w.localStorage.getItem('ojjuda-sacheonseong-v1')).finishedMs,null);}finally{f.close();}
});

test('an owner change prevents an old frame ranking response from claiming a new record',async()=>{
  const f=await fixture({duration:3599000,holdRanking:2});try{await f.begin();await f.finish();f.allowed=false;f.resolveRanking();await flush();f.runTimers(12000);await flush();assert.equal(f.card().dataset.resultOutcome,'success');assert.equal(f.card().querySelector('.game-result-encouragement').hidden,true);}finally{f.close();}
});
