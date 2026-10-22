const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const owner = '10000000-0000-0000-0000-000000000001';
function game({member = 'guest', saved = null, legacy = null, initialize = true} = {}) {
  const dom = new JSDOM(read('games/mines/index.html'), {url:'https://fixture.test/games/mines/',runScripts:'outside-only'});
  const w = dom.window, messages = [], timers = new Map(); let timerId = 0, clock = 0, seed = 13;
  const parent = {postMessage:(data,origin) => messages.push({data,origin})};
  Object.defineProperty(w,'parent',{value:parent});
  w.performance.now = () => clock;
  w.Math.random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
  w.matchMedia = () => ({matches:false}); w.requestAnimationFrame = () => 1;
  w.setTimeout = (fn,ms) => { timers.set(++timerId,{fn,ms}); return timerId; };
  w.clearTimeout = id => timers.delete(id); w.setInterval = () => 1; w.clearInterval = () => {};
  w.confirm = () => true;
  w.HTMLElement.prototype.setPointerCapture = () => {};
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {get:() => () => {}});
  const $ = selector => w.document.querySelector(selector);
  Object.defineProperties($('#wrap'), {clientWidth:{get:() => 360},clientHeight:{get:() => 420}});
  $('#wrap').getBoundingClientRect = () => ({left:0,top:0,width:360,height:420});
  if (saved !== null) w.localStorage.setItem('ojjuda.mines.save.v1:' + member,JSON.stringify(saved));
  if (legacy !== null) w.localStorage.setItem('ojjuda-mines-v1',JSON.stringify(legacy));
  w.eval(read('games/mines/rules.js')); w.eval(read('games/mines/entry.js'));
  const script = $('script:not([src])').textContent;
  w.eval(script.replace("setMode('dig');\nwindow.OjjudaMinesEntry.connect", "window.fixture={get state(){return state},get saved(){return save},get cells(){return cells},get level(){return L},get view(){return view},newGame,open,win,flag,question,plant,nb,checkCustom};\nsetMode('dig');\nwindow.OjjudaMinesEntry.connect"));
  const receive = (data,origin=w.location.origin,sender=parent) => w.dispatchEvent(new w.MessageEvent('message',{origin,source:sender,data:{source:'ojjuda-world',...data}}));
  const tick = ms => { for (const [id,timer] of [...timers]) if (ms === undefined || timer.ms === ms) { timers.delete(id);timer.fn(); } };
  const pointer = (element,type,properties={}) => {
    const event = new w.Event(type,{bubbles:true,cancelable:true});
    Object.assign(event,{pointerId:1,button:0,clientX:10,clientY:10,pointerType:'touch',...properties});
    element.dispatchEvent(event);
  };
  if (initialize) receive({type:'ojjuda-mines-init',owner:member});
  return {dom,w,$,messages,receive,tick,pointer,advance:ms => { clock += ms; }};
}

const x = game({initialize:false});
try {
  const {w,$,receive,messages,tick,advance} = x, f = w.fixture;
  assert.equal($('#minesStart').disabled,true);
  receive({type:'ojjuda-mines-init',owner},'https://evil.test');
  receive({type:'ojjuda-mines-init',owner},w.location.origin,w);
  assert.equal($('#minesStart').disabled,true,'only the parent can initialize the game');
  receive({type:'ojjuda-mines-init',owner:'guest'});
  assert.equal($('#minesStart').disabled,false);
  assert.equal($('#minesLevel').options.length,9);
  $('#minesStart').click();
  assert.equal($('#minesEntry').hidden,true);assert.equal($('#app').hidden,false);
  const results = () => messages.filter(m => m.data.type === 'ojjuda-game-result');
  const finished = () => messages.filter(m => m.data.type === 'ojjuda-game-finished');
  for (let d=0; d<8; d++) {
    f.newGame(d);f.flag(f.cells[1]);f.open(f.cells[0]);
    assert.equal(f.cells.filter(c=>c.mine).length,f.level.m);
    assert.equal(f.cells[0].mine,false);
    assert.ok(f.nb(f.cells[0]).every(c=>!c.mine),'preset opening neighborhood is safe');
    advance(2300 + d*1000);
    f.flag(f.cells[1]);
    for (const cell of f.cells) if (!cell.mine) f.open(cell);
    assert.equal(f.state,'won');
    assert.equal(finished().length,d+1,'each win reports one completed trial');
    const result=results().at(-1).data;
    assert.equal(result.difficulty,d);assert.equal(result.seconds,3+d);
    assert.equal(result.score,(d+1)*10000+10000-(3+d));
    assert.equal(result.completed,true);
    assert.match(result.runId,/^[a-f0-9-]{36}$/i);
    const count=results().length;f.win();f.open(f.cells.find(c=>c.mine));
    assert.equal(results().length,count,'a finished round cannot report twice');
    if (d===0) {
      receive({type:'ojjuda-mines-record',runId:result.runId,ok:false});
      assert.equal($('#minesRetry').hidden,false);$('#minesRetry').click();
      assert.equal(results().at(-1).data.runId,result.runId,'retry keeps the same round identity');
    }
    receive({type:'ojjuda-mines-record',runId:result.runId,ok:true});
    assert.match($('#minesRecordText').textContent,/등록 완료/);
    assert.equal(f.saved.best[d],3+d);
  }
  const before=results().length;
  f.saved.custom={c:2,r:2,m:3};f.newGame(8);f.open(f.cells[0]);
  assert.equal(f.state,'won','even a dense custom board keeps the first cell safe');
  assert.equal(f.saved.cb['2x2x3'],1);assert.equal(results().length,before,'custom boards never enter public rankings');
  assert.match($('#minesRecordText').textContent,/커스텀/);
  assert.equal(finished().length,9,'custom wins count even without a ranking score');
  f.newGame(2);f.open(f.cells[0]);f.open(f.cells.find(c=>c.mine));
  assert.equal(f.state,'lost');assert.equal(results().length,before,'losses do not submit a score');
  assert.equal(finished().length,10,'losses report completion before delayed animations, preventing replay bypass');
  f.newGame(2);tick();
  assert.equal($('#result').classList.contains('on'),false,'old results cannot appear over a fresh round');
  assert.equal($('#board .boom'),null);assert.equal($('#board .o'),null,'old mine animations cannot reveal a fresh board');
  receive({type:'ojjuda-mines-ranking',rows:[{nick:'<img src=x onerror=alert(1)>',score:12345}]});
  assert.equal($('#minesRanking img'),null);
  assert.match($('#minesRanking').textContent,/바보 · 127분 35초/);
  assert.ok(messages.every(m=>m.origin==='https://fixture.test'));
  const stored=JSON.parse(w.localStorage.getItem('ojjuda.mines.save.v1:guest'));
  assert.equal(stored.best[7],10);
  f.open(f.cells[0]);w.confirm=()=>false;
  $('#face2').click();assert.ok(!messages.some(m=>m.data.type==='ojjuda-game-exit'));
  w.confirm=()=>true;receive({type:'ojjuda-mines-exit-request'});
  assert.ok(messages.some(m=>m.data.type==='ojjuda-game-exit'));
} finally {x.dom.window.close();}

// Pointer gestures should never accidentally open a cell while marking or panning.
const touch = game();
try {
  const {w,$,tick,pointer}=touch,f=w.fixture;
  $('#minesStart').click();let cell=$('#board .c');
  pointer(cell,'pointerdown');tick(380);pointer($('#wrap'),'pointerup');
  assert.equal(f.cells[0].flag,true);assert.equal(f.cells[0].open,false);
  assert.equal(f.state,'ready','a long press does not start the timer');
  f.newGame(7);cell=$('#board .c');
  pointer(cell,'pointerdown');pointer($('#wrap'),'pointermove',{clientX:60});pointer($('#wrap'),'pointerup',{clientX:60});
  assert.equal(f.state,'ready');assert.ok(f.cells.every(c=>!c.open));
  const zoom=f.view.z;
  pointer(cell,'pointerdown',{pointerId:1,clientX:10});
  pointer(cell,'pointerdown',{pointerId:2,clientX:110});
  pointer($('#wrap'),'pointermove',{pointerId:2,clientX:170});
  pointer($('#wrap'),'pointerup',{pointerId:2,clientX:170});
  pointer($('#wrap'),'pointerup',{pointerId:1,clientX:10});
  assert.ok(f.view.z>zoom,'two fingers zoom the board');assert.equal(f.state,'ready');
  $('#zfit').click();assert.ok(f.view.z<zoom);
  $('[data-m="q"]').click();pointer(cell,'pointerdown');pointer($('#wrap'),'pointerup');
  assert.equal(f.cells[0].q,true);assert.equal(f.state,'ready');
  $('#menu [data-d="8"]').click();
  $('#cw').value='101';$('#ch').value='10';$('#cm').value='10';
  assert.equal(f.checkCustom(),null);assert.equal($('#cok').disabled,true);
  $('#cw').value='100';$('#ch').value='100';$('#cm').value='9999';
  assert.equal(f.checkCustom().m,9999);assert.equal($('#cok').disabled,false);
  $('#cw').value='2';$('#ch').value='2';$('#cm').value='4';assert.equal(f.checkCustom(),null);
} finally {touch.dom.window.close();}

const corrupt = game({saved:{d:999,best:[-1,'9',null],custom:{c:Infinity,r:0,m:99999},cb:{'__proto__':42}}});
try {
  assert.equal(corrupt.w.fixture.saved.d,2);
  assert.equal(corrupt.w.fixture.saved.custom.c,20);
  assert.ok(corrupt.w.fixture.saved.best.every(x=>x===null));
  const rules=corrupt.w.OjjudaMinesRules;
  assert.ok(rules.score(5,60)>rules.score(1,10),'higher difficulty outranks a faster easy clear');
  assert.ok(rules.score(5,30)>rules.score(5,60),'within one difficulty the faster clear wins');
  assert.equal(rules.record(rules.score(5,60)).time,'1분 0초');
  assert.equal(rules.score(7,1),89999);assert.equal(rules.score(0,20000),10000);
  for(const [d,sec] of [[8,1],[-1,1],[1,0],[1,NaN],[1,1.5],['1',2]])assert.equal(rules.score(d,sec),null);
} finally {corrupt.dom.window.close();}
const old={d:1,best:[null,12,null,null,null,null,null,null]};
for(const member of ['guest',owner]) {
  const migrated=game({member,legacy:old});
  try {assert.equal(migrated.w.fixture.saved.best[1],member==='guest'?12:null,'legacy records are guest-only');}
  finally {migrated.dom.window.close();}
}
const world=read('world.html');
assert.match(world,/mines:\{name:"지뢰찾기",emoji:"🚩",unit:"초"/);
assert.match(world,/mines:_r.mines/);assert.match(world,/OjjudaMinesGame\.open\(\{owner,authorized/);
assert.match(world,/if\(entryGame==='mines'\)Al\('mines'\)/);
assert.match(read('guest-game-scores.js'),/'mines'/);assert.match(read('world-game-assets.js'),/mines:\[/);
console.log('PASS: Minesweeper entry, 8 preset wins, first-click safety, custom exclusions, retries, stale-round cleanup, touch gestures, save validation and account isolation');

(async()=>{
  const dom=new JSDOM('<body></body>',{url:'https://fixture.test/world.html',runScripts:'outside-only'});
  const w=dom.window,sent=[],scores=[];let authorized=true;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  try {
    w.eval(read('games/mines/rules.js'));w.eval(read('world-mines-game.js'));
    w.OjjudaMinesGame.open({owner,authorized:()=>authorized,onScore:async(...args)=>{scores.push(args);return {ok:true};}});
    const frame=w.document.querySelector('iframe');frame.contentWindow.postMessage=data=>sent.push(data);
    const receive=(data,origin=w.location.origin,sender=frame.contentWindow)=>w.dispatchEvent(new w.MessageEvent('message',{origin,source:sender,data:{source:'ojjuda-mines',...data}}));
    receive({type:'ojjuda-game-ready'});assert.equal(sent[0].owner,owner);
    const result={type:'ojjuda-game-result',runId:'11111111-1111-4111-8111-111111111111',difficulty:2,seconds:45,score:39955,completed:true};
    receive(result,'https://evil.test');receive(result,w.location.origin,w);
    receive({...result,completed:false});receive({...result,difficulty:8});receive({...result,score:99999});
    await settle();assert.equal(scores.length,0);
    receive(result);receive(result);await settle();assert.equal(scores.length,1);
    assert.ok(sent.some(m=>m.type==='ojjuda-mines-record'&&m.ok));
    authorized=false;receive({...result,runId:'22222222-2222-4222-8222-222222222222'});await settle();assert.equal(scores.length,1);
    w.OjjudaMinesGame.close();assert.equal(w.document.querySelector('dialog'),null);
    assert.equal(w.document.body.classList.contains('gaming'),false);
    console.log('PASS: Minesweeper host validates source, completion, difficulty/time score, duplicate rounds and account changes');
  }finally {w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
