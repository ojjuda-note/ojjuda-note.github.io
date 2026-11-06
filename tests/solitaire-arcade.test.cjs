const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('solitaire validates iframe messages, confirms exit, saves and removes its overlay', () => {
  const dom = new JSDOM('<button id="entry">솔리테어</button>', {url:'https://ojjuda.kr/world.html?tab=arcade', runScripts:'outside-only'});
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; };
  w.eval(read('games/solitaire/world-solitaire-game.js'));
  let exits = 0, saves = 0, pauses = 0, resumes = 0, finished = 0;
  w.OjjudaGuestAccess = {finished:() => finished++};
  const entry = w.document.getElementById('entry'); entry.focus();
  w.OjjudaSolitaireGame.open({onExitRequest:() => {exits++; return true;}});
  const dialog = w.document.querySelector('.solitaire-game-dialog'), frame = dialog.querySelector('iframe');
  frame.contentWindow.OjjudaSolitaireControls = {save:() => saves++, pause:() => {pauses++; return () => resumes++;}};
  const send = (type, origin = w.location.origin, source = frame.contentWindow) => w.dispatchEvent(new w.MessageEvent('message', {origin, source, data:{source:'ojjuda-solitaire',type}}));
  send('ojjuda-game-exit-request', 'https://unrelated.example');
  send('ojjuda-game-exit-request', w.location.origin, w);
  assert.equal(exits, 0);
  send('ojjuda-game-exit-request');
  assert.equal(exits, 1); assert.ok(dialog.isConnected, 'request keeps game open for the shared confirmation');
  const resume = w.OjjudaSolitaireGame.pause(); assert.equal(pauses, 1); resume(); assert.equal(resumes, 1);
  send('ojjuda-game-finished'); send('ojjuda-game-finished'); assert.equal(finished, 1);
  dialog.dispatchEvent(new w.Event('cancel', {cancelable:true}));
  assert.equal(saves, 1); assert.equal(dialog.isConnected, false);
  assert.equal(w.document.body.classList.contains('gaming'), false); assert.equal(w.document.activeElement, entry);
  send('ojjuda-game-exit-request'); assert.equal(exits, 1, 'closed game no longer receives messages');
  w.OjjudaSolitaireGame.close(); assert.equal(saves, 1);
  dom.window.close();
});

test('member sessions do not use the guest completion gate or share guest saves', () => {
  const dom = new JSDOM('', {url:'https://ojjuda.kr/', runScripts:'outside-only'}), w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; };
  w.eval(read('games/solitaire/world-solitaire-game.js'));
  let valid = true, requests = 0;
  w.OjjudaSolitaireGame.open({owner:'member-a', authorized:() => valid, onExitRequest:() => { requests++; return true; }});
  const frame = w.document.querySelector('iframe');
  assert.equal(new URL(frame.src).searchParams.get('owner'), 'member-a');
  valid = false;
  w.dispatchEvent(new w.MessageEvent('message', {origin:w.location.origin, source:frame.contentWindow, data:{source:'ojjuda-solitaire',type:'ojjuda-game-exit-request'}}));
  assert.equal(requests, 0);
  w.OjjudaSolitaireGame.close(); dom.window.close();
});

test('finished records validate mode/time, deduplicate a run and retry a failed save', async () => {
  const dom = new JSDOM('', {url:'https://ojjuda.kr/',runScripts:'outside-only'}),w=dom.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.eval(read('games/solitaire/rules.js'));w.eval(read('games/solitaire/world-solitaire-game.js'));
  let valid=true,calls=0,resolve;
  w.OjjudaSolitaireGame.open({authorized:()=>valid,onScore:()=>{calls++;return new Promise(r=>resolve=r);}});
  const frame=w.document.querySelector('iframe'),acks=[];
  frame.contentWindow.postMessage=data=>acks.push(data);
  const message={source:'ojjuda-solitaire',type:'ojjuda-game-result',completed:true,runId:'10000000-0000-4000-8000-000000000001',drawCount:3,seconds:120,score:299999880};
  const send=(data=message)=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:frame.contentWindow,data}));
  const settle=()=>new Promise(r=>setImmediate(r));
  for(const wrong of [{completed:false},{seconds:60},{drawCount:1},{runId:'wrong'},{score:null}])send({...message,...wrong});
  await settle();assert.equal(calls,0);
  send();send();await settle();assert.equal(calls,1);
  resolve({ok:false});await settle();assert.equal(acks.at(-1).ok,false);
  send();await settle();assert.equal(calls,2);resolve({ok:true});await settle();assert.equal(acks.at(-1).ok,true);
  send();await settle();assert.equal(calls,2,'saved runs reuse their receipt');
  send({...message,score:299999940,seconds:60});await settle();assert.equal(calls,2,'same run cannot submit a different record');
  valid=false;send({...message,runId:'10000000-0000-4000-8000-000000000002'});await settle();assert.equal(calls,2);
  w.OjjudaSolitaireGame.close();dom.window.close();
});

test('the last card freezes the clear time before the finish animation and retries the same saved record',async()=>{
  const {pathToFileURL}=require('node:url');
  const engine=await import(pathToFileURL(path.join(root,'games/solitaire/engine.js')));
  const gestures=await import(pathToFileURL(path.join(root,'games/solitaire/gestures.js')));
  const dom=new JSDOM(read('games/solitaire/index.html'),{url:'https://ojjuda.kr/games/solitaire/index.html?owner=qa',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  const state=engine.createGame(3);state.stock=[];state.waste=[];state.tableau=Array.from({length:7},()=>[]);
  state.foundations=engine.SUITS.map(suit=>Array.from({length:13},(_,i)=>({id:suit+'-'+(i+1),suit,rank:i+1,up:true})));
  state.tableau[0].push(state.foundations[3].pop());
  const runId='10000000-0000-4000-8000-000000000003',key='ojjuda-solitaire-v1:qa',messages=[];
  w.localStorage.setItem(key,JSON.stringify({version:1,state,history:[],elapsed:119500,started:true,runId}));
  Object.defineProperty(w,'parent',{value:{postMessage:data=>messages.push(data)}});
  Object.assign(w,engine,gestures,{cardFace:()=>'<img alt="">',CARD_RATIO:1.4,createViewport:()=>({prepare(){},updateSize(){}}),matchMedia:()=>({matches:true})});
  let clock=1000,tick,finishAnimation;
  w.Date.now=()=>clock;w.setInterval=callback=>{tick=callback;return 1;};
  w.playWinAnimation=callback=>{finishAnimation=callback;};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.eval(read('games/solitaire/rules.js'));
  w.eval(read('games/solitaire/app.js').replace(/^import .*;\n/gm,''));
  assert.equal(messages.length,0,'unfinished games do not submit');
  clock=1250;
  w.document.querySelector('[data-card-id="diamonds-13"]').click();
  w.document.querySelector('[data-card-id="diamonds-13"]').click();
  const record=messages.find(m=>m.type==='ojjuda-game-result');
  assert.equal(record.seconds,120);assert.equal(record.drawCount,3);assert.equal(record.score,299999880);assert.equal(record.runId,runId);
  clock=11250;tick();finishAnimation();
  assert.match(w.document.querySelector('.win-stats').textContent,/02:00/);
  const ack=ok=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:w.parent,data:{source:'ojjuda-world',type:'ojjuda-solitaire-record',runId,ok}}));
  ack(false);assert.equal(w.document.querySelector('#retry-ranking').hidden,false);
  w.document.querySelector('#retry-ranking').click();
  const retried=messages.filter(m=>m.type==='ojjuda-game-result').at(-1);assert.equal(retried.seconds,120);assert.equal(retried.runId,runId);
  ack(true);assert.equal(w.document.querySelector('#ranking-status').textContent,'순위에 기록했어요.');
  assert.equal(JSON.parse(w.localStorage.getItem(key)).completion.saved,true);
  w.document.querySelector('#play-again').click();
  assert.equal(w.document.querySelector('#dialog').open,false,'restart immediately deals a fresh hand');
  const next=JSON.parse(w.localStorage.getItem(key));assert.notEqual(next.runId,runId);assert.equal(next.completion,null);
  assert.equal(next.state.drawCount,3);assert.equal(next.state.stock.length,24);assert.equal(next.elapsed,0);assert.equal(next.history.length,0);
  w.document.querySelector('#stock').click();assert.equal(JSON.parse(w.localStorage.getItem(key)).state.waste.length,3,'the new hand accepts input');
  dom.window.close();
});

test('celebration can restart before images load and cannot trap the board on rendering failure',()=>{
  for(const scenario of ['restart','timeout','no-canvas','canvas-error']){
    const dom=new JSDOM('<div class="pile" data-type="foundation" data-col="0"></div>',{runScripts:'outside-only'}),w=dom.window;
    const timers=new Map(),frames=new Map();let timerId=0,frameId=0,completed=0,restarted=0;
    Object.assign(w,{SUITS:['hearts'],CARD_RATIO:1.4,cardAsset:()=>'/card.svg',matchMedia:()=>({matches:false}),Image:class{},
      setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
      requestAnimationFrame:fn=>{const id=++frameId;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
    w.HTMLCanvasElement.prototype.getContext=function(){if(scenario==='canvas-error')throw Error('canvas unavailable');return scenario==='no-canvas'?null:{scale(){}};};
    w.eval(read('games/solitaire/celebration.js').replace(/^import .*;\n/gm,'').replace('export function','function'));
    const cancel=w.playWinAnimation(()=>completed++,{onRestart:()=>restarted++});
    if(scenario==='restart'){
      w.document.querySelector('[data-restart]').click();assert.equal(restarted,1);assert.equal(completed,0);
    }else if(scenario==='timeout'){
      for(const callback of [...timers.values()])callback();assert.equal(completed,1);
    }else assert.equal(completed,1,'unsupported canvas immediately opens the result');
    assert.equal(w.document.querySelector('.win-celebration'),null);assert.equal(timers.size,0);assert.equal(frames.size,0);
    cancel();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter'}));
    assert.equal(completed+restarted,1,'completion or restart happens exactly once');dom.window.close();
  }
});

test('guest client accepts solitaire and uses the same run ID for save and monthly ranking',async()=>{
  const dom=new JSDOM('',{url:'https://ojjuda.kr/',runScripts:'outside-only'}),w=dom.window,calls=[];
  w.OJJUDA_CONFIG={supabaseUrl:'https://project.example',supabaseKey:'public-key'};
  w.supabase={createClient:()=>({rpc:(name,args)=>{calls.push({name,args});return{abortSignal:async()=>({data:name==='guest_game_ranking'?[]:{ok:true},error:null})};}})};
  w.eval(read('shared/games/guest-game-scores.js'));
  const runId='10000000-0000-4000-8000-000000000004';
  assert.equal((await w.OjjudaGuestScores.submit('solitaire',299999880,runId)).ok,true);
  assert.equal(calls[0].args.p_game,'solitaire');assert.equal(calls[0].args.p_request_id,runId);
  await w.OjjudaGuestScores.ranking('solitaire','month');assert.equal(calls[1].args.p_period,'month');
  dom.window.close();
});
