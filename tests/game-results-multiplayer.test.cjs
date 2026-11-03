const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const loadResults=require('./game-results-fixture.cjs');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function section(file,start,end){const source=read(file),a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,file+' source boundaries');return source.slice(a,b);}
function fixture(t,html='<main></main>'){
 const dom=new JSDOM(html,{url:'https://ojjuda.kr/games/fixture/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});loadResults(w);t.after(()=>w.close());return w;
}

test('bang guest completion is retained only from the active authorized game frame',t=>{
 const w=fixture(t);const finished=[];let allowed=true;
 w.OjjudaGuestAccess={finished:options=>finished.push(options)};
 w.OjjudaGameSession={create:()=>({enter:callback=>callback(),run:callback=>callback(),close:()=>true})};
 w.eval(read('world-bang-game.js'));w.OjjudaBangGame.open({authorized:()=>allowed});
 const frame=w.document.querySelector('iframe'),send=(source=frame.contentWindow,origin=w.location.origin,type='ojjuda-bang-local-finished')=>w.dispatchEvent(new w.MessageEvent('message',{source,origin,data:{source:'ojjuda-bang',type}}));
 send(w);send(frame.contentWindow,'https://other.invalid');assert.equal(finished.length,0);
 send();assert.equal(finished.length,1);assert.equal(finished[0].retainResult,true);
 send(frame.contentWindow,w.location.origin,'ojjuda-bang-finished');assert.equal(finished.length,1,'ranked online notification does not consume local guest trial');
 allowed=false;send();assert.equal(finished.length,1,'stale authorization cannot finish a trial');
});

test('poker uses settled net gold even when a hand received a positive gross payout',t=>{
 const w=fixture(t);w.eval(`
 const online={room:{id:'private-room',seat:0,ready:[false,false],departed:[false,false]}},wallet={gold:500};
 let game={_roomId:'private-room',_round:1,result:{net:[-75],payouts:[125]}};
 const fmt=n=>n.toLocaleString('ko-KR'),roundKey=()=>game._roomId+':'+game._round,refillButton=()=>'',startPopup=html=>html;
 ${section('games/poker/app.mjs','function nextHandPopup(){','\nfunction refillButton()')}
 window.renderResult=net=>{game.result.net[0]=net;document.body.innerHTML=nextHandPopup();};
 window.setReady=(ready,departed)=>{online.room.ready[0]=ready;online.room.departed[1]=departed;};
 `);
 for(const [net,outcome] of [[-75,'gold-loss'],[0,'gold-even'],[75,'gold-gain']]){
  w.renderResult(net);const card=w.document.querySelector('[data-game-result-card]');assert.equal(card.dataset.resultOutcome,outcome);assert.match(card.querySelector('.game-result-metric').textContent,new RegExp(String(net)));
  assert.equal(new URL(w.OjjudaGameResults.shareData({game:'poker',outcome}).url).searchParams.get('room'),null);
 }
 w.setReady(true,false);w.renderResult(75);assert.equal(w.document.querySelector('[data-action="online-ready"]').disabled,true);
 w.setReady(false,true);w.renderResult(-75);assert.equal(w.document.querySelector('[data-action="online-ready"]').disabled,true);
});

test('matgo waits for settlement, ignores a duplicate finish, and preserves the next-hand action',async t=>{
 const w=fixture(t,'<button id="exit"></button>');let complete;w.settleCalls=0;w.nextCalls=0;w.bridgeCalls=0;
 w.wallet={settle:()=>{w.settleCalls++;return new Promise(resolve=>{complete=resolve;});}};
 w.eval(`
 let settling=false,pendingResult=null,currentRound='reservation-one';
 const ME=0,game={actions:[{type:'stop'}],bank:[0],carry:2},$=s=>document.querySelector(s);
 const render=()=>{},Bridge={result:()=>window.bridgeCalls++},showRefill=()=>{},startRound=()=>window.nextCalls++;
 function modal(html,handlers){document.body.insertAdjacentHTML('beforeend','<div id="test-result">'+html+'</div>');for(const[id,fn]of Object.entries(handlers))document.getElementById(id).onclick=fn;}
 ${section('games/matgo.html','async function finishRound(type,d){','\nasync function startRound()')}
 window.finish=()=>finishRound('stop',{winner:0,total:7,det:[],money:700,goldDelta:[9999],firstPpukGold:[-300]});
 `);
 const first=w.finish();await w.finish();assert.equal(w.settleCalls,1);assert.equal(w.document.querySelector('[data-game-result-card]'),null);
 complete({gold:5400,settlement:{round_id:'reservation-one',before_gold:5000,after_gold:5400,net:400}});await first;
 const card=w.document.querySelector('[data-game-result-card]');assert.equal(card.dataset.resultOutcome,'success');assert.match(card.textContent,/\+400 G/);assert.equal(w.bridgeCalls,1);
 w.document.querySelector('#next').click();assert.equal(w.nextCalls,1);assert.equal(w.settleCalls,1);
});

test('matgo settlement failure keeps a retry control and cannot show a settled success',async t=>{
 const w=fixture(t);w.wallet={settle:async()=>{throw Error('연결 확인');}};
 w.eval(`
 let settling=false,pendingResult=null,currentRound='reservation-error';const ME=0,game={actions:[],bank:[0]},$=s=>document.querySelector(s);
 const render=()=>{},Bridge={result:()=>{throw Error('must not report');}};
 function modal(html,handlers){document.body.innerHTML=html;for(const[id,fn]of Object.entries(handlers))document.getElementById(id).onclick=fn;}
 ${section('games/matgo.html','async function finishRound(type,d){','\nasync function startRound()')}
 window.finish=()=>finishRound('stop',{winner:0,total:7,det:[],money:700});
 `);
 await w.finish();assert.equal(w.document.querySelector('[data-game-result-card]'),null);assert.ok(w.document.querySelector('#retry-save'));assert.equal(w.document.querySelector('#save-error').textContent,'연결 확인');
});

test('matgo uses only the matching settlement receipt, including a retry after the wallet changed',async t=>{
 const valid={round_id:'receipt-round',before_gold:5000,after_gold:5400,net:400};
 const cases=[
  {settlement:valid,gold:10400,delta:400},
  {settlement:{...valid,after_gold:4800,net:-200},gold:9800,delta:-200},
  {settlement:null,gold:5400},
  {settlement:{...valid,round_id:'another-round'},gold:5400},
  {settlement:{...valid,net:9999},gold:5400},
  {settlement:{...valid,before_gold:'5000'},gold:5400},
  {settlement:{...valid,after_gold:Infinity,net:Infinity},gold:5400}
 ];
 for(const expected of cases){
  const w=fixture(t);w.wallet={settle:async()=>expected};
  w.eval(`
   let settling=false,pendingResult=null,currentRound='receipt-round';const ME=0,game={actions:[],bank:[0],carry:2},$=s=>document.querySelector(s);
   const render=()=>{},Bridge={result:value=>window.report=value},showRefill=()=>{},startRound=()=>{};
   function modal(html,handlers){document.body.innerHTML=html;for(const[id,fn]of Object.entries(handlers))document.getElementById(id).onclick=fn;}
   ${section('games/matgo.html','async function finishRound(type,d){','\nasync function startRound()')}
   window.finish=()=>finishRound('stop',{winner:0,total:7,det:[],money:9999,goldDelta:[9999]});
  `);
  await w.finish();
  const metric=w.document.querySelector('.game-result-metric').textContent;
  if(expected.delta===undefined){assert.equal(metric,'정산 완료');assert.equal('delta' in w.report,false);}
  else{assert.equal(metric,(expected.delta>=0?'+':'')+expected.delta.toLocaleString()+' G');assert.equal(w.report.delta,expected.delta);}
 }
});

test('mines result decoration keeps restart and inspect handlers for successive rounds',t=>{
 const w=fixture(t,'<div id="result"><div id="minesResultCard"><button id="again">다시 하기</button><button id="look">판 보기</button></div></div>');
 const again=w.document.querySelector('#again'),look=w.document.querySelector('#look');let restart=0,inspect=0;again.onclick=()=>restart++;look.onclick=()=>inspect++;
 w.eval(`window.OjjudaMinesEntry={comparison:()=>null};const $=s=>document.querySelector(s),L={name:'고급',m:10},cells=Array(100),opened=35;let runId='first';const later=fn=>fn();${section('games/mines/index.html','function result(won,sec,rec,prev){','\n\n// view:')}window.setRun=id=>{runId=id;};`);
 w.result(false);again.click();w.setRun('second');w.result(true,42,true,50);look.click();
 assert.equal(restart,1);assert.equal(inspect,1);assert.equal(w.document.querySelector('#again'),again);assert.equal(w.document.querySelector('#look'),look);assert.equal(w.document.querySelector('[data-game-result-card]').dataset.resultOutcome,'success');assert.match(w.document.querySelector('.game-result-metric').textContent,/42초/);
});

test('tank result polling does not rebuild action nodes or repeat its card',t=>{
 const w=fixture(t,'<div id="over" class="hidden"><div id="tankResult"><button id="bAgain" class="go">다시 하기</button><button id="bMenu" class="go alt">목록</button></div></div>');
 const again=w.document.querySelector('#bAgain');let clicks=0;again.onclick=()=>clicks++;
 w.eval(`const $=id=>document.getElementById(id);${section('games/tank/index.html','function showTankResult(','\nconst stage=')}`);
 w.showTankResult('failure','내 탱크 탈락','same-match');const card=w.document.querySelector('[data-game-result-card]');w.showTankResult('failure','내 탱크 탈락','same-match');assert.equal(w.document.querySelector('[data-game-result-card]'),card);again.click();assert.equal(clicks,1);assert.equal(w.document.querySelector('#bAgain'),again);
 w.showTankResult('success','남은 체력 20','next-match');assert.equal(w.document.querySelector('#bAgain'),again);assert.equal(w.document.querySelector('[data-game-result-card]').dataset.resultOutcome,'success');
});

test('roulette exposes only acknowledged net gold and deduplicates repeated snapshots',t=>{
 const w=fixture(t);w.eval(`
 let closed=false,screen='game',room={id:'room-secret'},state={lastSettled:null,balance:1025},settledResultKey=null,settledResultPopup=null,waitingSettledResult=null;
 const fmt=n=>n.toLocaleString('ko-KR');
 ${section('games/roulette/app.js','function showSettledResult(','\nfunction showSpinResult(')}
 window.pending=()=>showSettledResult('spin-one',{number:7,total:125,net:-75},'room-secret');
 window.acknowledged=()=>{state.lastSettled='spin-one';window.pending();};
 `);
 w.pending();assert.equal(w.document.querySelector('[data-game-result-card]'),null);
 w.acknowledged();const card=w.document.querySelector('[data-game-result-card]');assert.equal(card.dataset.resultOutcome,'gold-loss');assert.equal(card.querySelector('.game-result-metric').textContent,'-75 G');
 w.acknowledged();assert.equal(w.document.querySelector('[data-game-result-card]'),card);
 const data=w.OjjudaGameResults.shareData({game:'roulette',outcome:'gold-loss'});assert.equal(data.url,'https://ojjuda.kr/world.html?game=roulette');assert.doesNotMatch(JSON.stringify(data),/room-secret|spin-one/);
});

test('tour elimination sharing does not resolve the watch action or advance the round',async t=>{
 const html='<div id="sheet" class="hidden"><div id="sTitle"></div><div id="sBody"></div><div id="sBust"></div><div id="sBtns"></div></div>';
 const w=fixture(t,html);let shared=0;Object.defineProperty(w.navigator,'share',{value:async()=>{shared++;}});
 w.eval(`
 const $=s=>document.querySelector(s),G={runId:'private-run'},GEN=1,pid=()=>0,ga=()=>'',sfx=()=>{};let sheetResolve=null;
 ${section('games/ojjuda-tour/index.html','function openSheet(','\nconst ask=')}
 window.openElimination=()=>openSheet('탈락','필수 상태',[{k:'watch',l:'관전하기'}],{},'sad');
 `);
 let resolved=false;const result=w.openElimination().then(value=>{resolved=true;return value;});w.document.querySelector('.game-result-share').click();await Promise.resolve();await Promise.resolve();
 assert.equal(shared,1);assert.equal(resolved,false);assert.equal(w.document.querySelector('#sheet').classList.contains('hidden'),false);
 w.document.querySelector('[data-k="watch"]').click();assert.equal(await result,'watch');
});

for(const scenario of [
 {name:'lower difficulty stays success without comparing unlike levels',before:89950,after:89950,me:false,difficulty:2,seconds:10,expected:null},
 {name:'a verified same-difficulty monthly leader can earn a new record',before:39950,after:39960,me:true,difficulty:2,seconds:40,expected:'record'},
 {name:'an earlier equal-time competitor never becomes the player record',before:39950,after:39960,me:false,difficulty:2,seconds:40,expected:'success',text:'같은 시간'},
 {name:'a slower same-difficulty completion reports the real time gap',before:39950,after:39950,me:false,difficulty:2,seconds:70,expected:'success',text:'20초'}
])test('mines monthly ranking: '+scenario.name,async t=>{
 const w=fixture(t),sent=[],scores=[];let readCount=0;
 w.eval(read('games/mines/rules.js'));w.eval(read('world-mines-game.js'));
 w.OjjudaMinesGame.open({owner:'10000000-0000-0000-0000-000000000001',onRanking:async()=>[{score:readCount++?scenario.after:scenario.before,me:readCount>1&&scenario.me}],onScore:async(score,id)=>{scores.push([score,id]);return {ok:true};}});
 const frame=w.document.querySelector('iframe');frame.contentWindow.postMessage=message=>sent.push(message);
 const send=message=>w.dispatchEvent(new w.MessageEvent('message',{source:frame.contentWindow,origin:w.location.origin,data:{source:'ojjuda-mines',...message}}));
 const runId='10000000-0000-4000-8000-000000000001',score=w.OjjudaMinesRules.score(scenario.difficulty,scenario.seconds);
 send({type:'ojjuda-game-start',runId,difficulty:scenario.difficulty});
 send({type:'ojjuda-game-result',runId,difficulty:scenario.difficulty,seconds:scenario.seconds,score,completed:true});
 for(let i=0;i<30&&!sent.some(message=>message.type==='ojjuda-mines-record');i++)await new Promise(resolve=>setImmediate(resolve));
 const response=sent.find(message=>message.type==='ojjuda-mines-record');assert.ok(response);assert.equal(response.ok,true);assert.equal(scores.length,1);
 assert.equal(response.comparison?.outcome||null,scenario.expected);if(scenario.text)assert.match(response.comparison.encouragement,new RegExp(scenario.text));
 send({type:'ojjuda-game-result',runId,difficulty:scenario.difficulty,seconds:scenario.seconds,score,completed:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(scores.length,1,'a repeated result never writes the score twice');
});
