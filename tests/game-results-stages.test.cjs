const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function shared(window){
  window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  window.HTMLElement.prototype.scrollIntoView=function(){};
  window.scrollTo=()=>{};window.confirm=()=>true;
  window.eval(read('game-results.js'));
}
function assertResult(container,outcome){
  const card=container.querySelector('.game-result-card');
  assert.ok(card,'one shared card is shown inside the existing popup');
  assert.equal(container.querySelectorAll('.game-result-card').length,1);
  assert.ok(card.querySelector('.game-result-share'),'sharing is in the result popup');
  assert.ok(card.textContent.includes(outcome==='success'?'성공':outcome==='failure'?'실패':''));
  return card;
}

function spot(){
  const dom=new JSDOM(read('games/spot-difference/index.html'),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,$=id=>w.document.getElementById(id);shared(w);
  let now=Date.now(),resolvePurchase,rejectPurchase;const intervals=[],requests=[];
  w.Date.now=()=>now;w.setInterval=fn=>{intervals.push(fn);return intervals.length;};
  w.JjudaWallet={getState:()=>({userId:'member-a',coins:100}),subscribe:fn=>fn({userId:'member-a',coins:100}),refresh:async()=>{},recordClear:async()=>({ok:true}),buy:(request,stage)=>{requests.push({...request,stage});return new Promise((resolve,reject)=>{resolvePurchase=resolve;rejectPurchase=reject;});}};
  for(const file of ['puzzles.js','game-core.js','app.js'])w.eval(read('games/spot-difference/'+file));
  function loaded(){for(const image of w.document.querySelectorAll('img'))image.onload?.();}
  loaded();$('start').click();
  const state=()=>JSON.parse(w.localStorage.getItem('jjuda-spot-six-v1'));
  const current=()=>w.JJUDA_PUZZLES[state().current];
  const round=()=>state().rounds[current().id];
  function tap(x,y){const surface=$('original').parentElement;surface.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800});const init={bubbles:true,clientX:x*10,clientY:y*8};surface.dispatchEvent(new w.MouseEvent('pointerdown',init));surface.dispatchEvent(new w.MouseEvent('click',init));}
  const solve=()=>current().spots.forEach(p=>tap(p.x,p.y));
  function lose(){let miss;for(let x=1;x<100&&!miss;x+=5)for(let y=1;y<100&&!miss;y+=5)if(!w.JjudaGame.hitTest(current(),x,y,[]))miss={x,y};for(let i=0;i<3;i++)tap(miss.x,miss.y);}
  return {w,$,state,round,requests,loaded,solve,lose,expire:()=>{now+=70000;intervals.forEach(fn=>fn());},failPurchase:()=>rejectPurchase(Error('구매 다시 확인')),finishPurchase:()=>{const request=requests.at(-1);resolvePurchase({ok:true,kind:request.kind,stage:request.stage,spot:request.spot,price:1,extend_ms:30000});}};
}

test('spot success and failure retain direct choices, real clear guards and one share card',()=>{
  const f=spot();try{
    f.solve();assert.equal(f.$('celebration').open,true);const success=assertResult(f.$('celebration'),'success');
    assert.equal(success.querySelectorAll('.end-picture-choice').length,3);
    f.$('celebration-next').click();f.loaded();assert.equal(f.state().current,1);assert.equal(f.round().status,'playing');
    f.solve();f.$('celebration-current').click();f.loaded();f.lose();
    assert.equal(f.$('spot-failure').open,true);const failure=assertResult(f.$('spot-failure'),'failure');
    assert.equal(failure.querySelectorAll('.end-picture-choice').length,3);assert.equal(f.$('retry-next').disabled,true);
    f.$('retry-next').onclick();assert.equal(f.state().current,1,'old completed history cannot unlock a failed replay');
    f.$('retry-previous').click();f.loaded();assert.equal(f.state().current,0);assert.equal(f.$('spot-failure').open,false);
  }finally{f.w.close();}
});

test('spot timeout result can recover its original paid extension receipt and resume the same round',async()=>{
  const f=spot();try{
    f.expire();assert.equal(f.round().status,'lost');assert.equal(f.$('spot-failure').open,true);
    f.$('retry-extend').click();assert.equal(f.requests.length,1);assert.equal(f.round().status,'payment');
    assert.equal(f.$('retry-current').disabled,true);f.$('retry-current').onclick();assert.equal(f.round().status,'payment');
    f.failPurchase();await flush();assert.equal(f.$('spot-failure').open,true);assert.equal(f.$('retry-extend').disabled,false);
    f.$('retry-extend').click();assert.equal(f.requests.length,2);assert.equal(f.requests[0].requestId,f.requests[1].requestId);
    f.finishPurchase();await flush();assert.equal(f.round().status,'playing');assert.equal(f.round().timeBought,true);assert.equal(f.$('spot-failure').open,false);
  }finally{f.w.close();}
});

test('a completed guest result blocks another round during the automatic-login delay',async()=>{
  const f=spot();try{
    f.solve();f.w.OjjudaGuestAccess={canPlay:()=>false};
    const before=f.state().current;f.$('celebration-next').click();f.$('celebration-next').onclick();
    assert.equal(f.state().current,before);assert.equal(f.$('celebration').open,true);
    const copied=[];Object.defineProperty(f.w.navigator,'clipboard',{value:{writeText:async text=>copied.push(text)}});
    f.$('celebration').querySelector('.game-result-share').click();await flush();
    assert.equal(copied.length,1);assert.match(copied[0],/game=spot/);assert.equal(f.$('celebration').open,true);
  }finally{f.w.close();}
});

test('sacheonseong shares one compact result without replacing its level handlers or recording twice',()=>{
  const dom=new JSDOM(read('games/sacheonseong/index.html'),{url:'https://fixture.test/games/sacheonseong/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;shared(w);const timers=[],records=[];
  w.setTimeout=(fn,delay)=>{timers.push({fn,delay});return timers.length;};w.clearTimeout=()=>{};w.setInterval=()=>1;
  Object.defineProperties(d.getElementById('board-scroll'),{clientWidth:{value:378},clientHeight:{value:702}});
  w.OjjudaSacheonseongOnline={newId:()=>w.crypto.randomUUID(),stage(){},record:(stage,record)=>records.push({stage,record})};
  for(const file of ['engine.js','faces.js'])w.eval(read('games/sacheonseong/'+file));
  const generate=w.TileGarden.generate;w.TileGarden.generate=(...args)=>{const value=generate(...args);value.grid=value.grid.map(row=>row.map(()=>w.TileGarden.EMPTY));value.grid[0][0]=value.grid[0][1]=0;return value;};
  w.eval(read('games/sacheonseong/app.js'));
  const complete=()=>{d.querySelector('[data-r="0"][data-c="0"]').click();d.querySelector('[data-r="0"][data-c="1"]').click();for(const task of timers.splice(0))if(task.delay===120)task.fn();};
  try{
    const next=d.getElementById('next');complete();assert.equal(d.getElementById('completion').hidden,false);
    const card=assertResult(d.getElementById('completion'),'success');assert.equal(card.querySelectorAll('.level-choice').length,3);
    assert.equal(d.getElementById('next'),next,'existing listener node is preserved');assert.equal(records.length,1);
    next.click();assert.equal(d.getElementById('completion').hidden,true);assert.equal(records.length,1);
    const state=JSON.parse(w.localStorage.getItem('ojjuda-sacheonseong-v1'));assert.equal(state.stage,2);
    next.onclick();assert.equal(JSON.parse(w.localStorage.getItem('ojjuda-sacheonseong-v1')).stage,2,'a stale result cannot skip the new board');
    complete();assertResult(d.getElementById('completion'),'success');assert.equal(records.length,2);
  }finally{w.close();}
});

test('saetbyeol remains a popup exception and preserves its original growth and evolution flow',()=>{
  const {game}=require('./saetbyeol-fixture.cjs');const f=game();
  try{
    const g=f.w.fixture;f.$('#starStart').click();g.run.gain.light=12;g.run.heat=0;g.updateRun(.05);
    assert.equal(f.$('.game-result-card'),null);assert.match(f.$('#ovText').textContent,/이번에 모은 빛 12/);
    const restart=[...f.$('#ovBtns').querySelectorAll('button')].find(button=>button.textContent==='바로 다시 타오르기');restart.click();assert.equal(g.mode,'run');
    for(const upgrade of g.upgrades)g.state.lv[upgrade.id]=upgrade.mx;g.startRun(true);assert.ok(g.run.boss);
    const stage=g.state.stage;g.run.boss.hp=0;assert.equal(g.winBoss(),true);f.tick(900);assert.equal(g.state.stage,stage+1);
    assert.equal(f.$('.game-result-card'),null,'boss evolution retains its original story overlay');
    assert.doesNotMatch(read('games/bulssi/index.html'),/game-results\.(?:js|css)|OjjudaGameResults|resultOverlay/);
    assert.doesNotMatch(read('world-saetbyeol-game.js'),/retainResult|web-share/);
  }finally{f.w.close();}
});

test('archery result preserves three stage choices and guards advancement after a failed round',()=>{
  const source=read('games/forest-archer/game.mjs');
  assert.match(source,/function stageChoiceMarkup\(className\)/,'result and menu render the same three choices');
  assert.match(source,/data-action="previous-stage"/);
  assert.match(source,/data-action="retry"/);
  assert.match(source,/data-action="next-stage"/);
  assert.match(source,/const canAdvanceStage=/,'next-stage permission is centralised');
  assert.match(source,/if\(delta>0&&!canAdvanceStage\(\)\)/,'navigation refuses advancement without success');
  assert.match(source,/if\(!stageAvailable\(id\)\)/,'locked stages cannot be entered');
  assert.match(source,/progress\.unlocked=unlockedStage\(progress\.best\)/,'unlocking follows the original score record');
  assert.match(source,/window\.OjjudaGameResults\.decorate\(content/,'shared result card remains');
  assert.doesNotMatch(source,/function enterEvent\(/,'removed event mode does not reappear in result flow');
});
