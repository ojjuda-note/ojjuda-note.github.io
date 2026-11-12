const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{randomUUID}=require('node:crypto');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const dom=new JSDOM('<body><button>게임</button></body>',{url:'https://fixture.test',runScripts:'outside-only'}),w=dom.window;
 try{
  w.eval(read('games/ttang/ttang-bridge.js'));let allowed=true;const saved=[];
  w.OjjudaTtangBridge.open({owner:'a',authorized:()=>allowed,onResult:async(won,id)=>{saved.push([won,id]);return{ok:true}}});
  const frame=w.document.querySelector('iframe'),post=d=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:frame.contentWindow,data:d}));
  const first=randomUUID(),second=randomUUID();
  post({type:'ojjuda:ttang:start',round:first,mode:'solo'});post({type:'ojjuda:ttang:result',round:first,mode:'solo',win:true});await tick();
  post({type:'ojjuda:ttang:result',round:first,mode:'solo',win:true});post({type:'ojjuda:ttang:result',round:second,mode:'solo',win:true});
  assert.deepEqual(saved,[[true,first]]);
  post({type:'ojjuda:ttang:start',round:second,mode:'duo'});post({type:'ojjuda:ttang:result',round:second,mode:'duo',win:false});await tick();
  assert.deepEqual(saved.at(-1),[false,second]);assert.match(w.document.querySelector('#ttang-save-status').textContent,/기록했어요/);
  const third=randomUUID(),departedWindow=frame.contentWindow;let handoffs=0,finishHandoff,closed=false;
  departedWindow.OjjudaTtang={dispose:()=>{handoffs++;return new Promise(resolve=>{finishHandoff=resolve});}};
  post({type:'ojjuda:ttang:start',round:third,mode:'duo'});
  const closing=w.OjjudaTtangBridge.close().then(()=>{closed=true});await tick();
  assert.equal(handoffs,1);assert.equal(closed,false,'close waits for the computer handoff');
  assert.deepEqual(saved,[[true,first],[false,second]],'multiplayer departure does not fabricate a ranking result');
  finishHandoff();await closing;assert.equal(closed,true);
  w.OjjudaTtangBridge.open({owner:'a',authorized:()=>allowed,onResult:async(won,id)=>{saved.push([won,id]);return{ok:true}}});
  const nextFrame=w.document.querySelector('iframe'),next=randomUUID();
  const nextPost=d=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:nextFrame.contentWindow,data:d}));
  nextPost({type:'ojjuda:ttang:start',round:next,mode:'duo'});
  w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:departedWindow,data:{type:'ojjuda:ttang:result',round:third,mode:'duo',win:true}}));await tick();
  assert.deepEqual(saved,[[true,first],[false,second]],'a late departed-frame result cannot enter the new session');
  nextPost({type:'ojjuda:ttang:opponent-bot'});nextPost({type:'ojjuda:ttang:result',round:next,mode:'duo',win:true});await tick();
  assert.deepEqual(saved.at(-1),[true,next],'the human who finishes against the replacement computer still records the result');
  const excluded=randomUUID();nextPost({type:'ojjuda:ttang:start',round:excluded,mode:'duo'});
  nextPost({type:'ojjuda:ttang:excluded',round:excluded});nextPost({type:'ojjuda:ttang:result',round:excluded,mode:'duo',win:true});await tick();
  assert.deepEqual(saved,[[true,first],[false,second],[true,next]],'an excluded seat cannot submit a late result');
  const solo=randomUUID(),beforeSoloExit=saved.slice();nextPost({type:'ojjuda:ttang:start',round:solo,mode:'solo'});await w.OjjudaTtangBridge.close();await tick();
  assert.deepEqual(saved,beforeSoloExit,'unfinished solo departure preserves the streak without fabricating a loss');
  w.OjjudaTtangBridge.open({owner:'a',authorized:()=>allowed,onResult:async()=>{throw Error('offline')}});
  const f=w.document.querySelector('iframe'),r=randomUUID();
  const send=d=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:f.contentWindow,data:d}));
  send({type:'ojjuda:ttang:start',round:r,mode:'solo'});send({type:'ojjuda:ttang:result',round:r,mode:'solo',win:true});await tick();
  assert.match(w.document.querySelector('#ttang-save-status').textContent,/다시 저장/);allowed=false;w.OjjudaTtangBridge.close();
  // Exercise the actual picture completion function with a paid hint/time result.
  const app=read('games/spot-difference/app.js'),finish=app.slice(app.indexOf('  function finish(reason){'),app.indexOf('  function tick(){'));
  for(const [stage,total] of [[17,6],[82,10],[83,10],[152,10],[153,10],[182,10]]){
   const messages=[],r0={status:'playing',rankOwner:'a',assisted:true,paid:[0],timeBought:true},p={id:stage,spots:Array.from({length:total},()=>({}))};
   const context={previewSession:false,state:{completed:[1]},round:()=>r0,core:{timeLeft:()=>12000},zoomDialog:{open:false},hideHint(){},refresh(){},speak(){},celebrate(){},showFailure(){},$:()=>({focus(){}}),
    found:()=>Array.from({length:total},(_,i)=>i),puzzle:()=>p,targetCount:()=>p.spots.length,window:{scrollTo(){},location:{origin:'https://fixture.test'},parent:{postMessage:m=>messages.push(m)}},wallet:{}};
   vm.runInNewContext(finish+'finish("won");',context);
   assert.deepEqual(messages.filter(m=>m.type==='ojjuda:spot-clear').map(m=>[m.stage,m.owner]),[[stage,'a']],'paid completion records the actual picture ID and owner');
   assert.deepEqual(context.state.completed,[1,stage],'completion history uses the same original picture ID and retains earlier clears');
   vm.runInNewContext(finish+'finish("won");',context);
   assert.equal(messages.filter(m=>m.type==='ojjuda:spot-clear').length,1,'a finished round cannot record twice');
   assert.deepEqual(context.state.completed,[1,stage],'a repeated finish does not duplicate completion history');
   messages.length=0;r0.status='playing';context.found=()=>[0,1,2];vm.runInNewContext(finish+'finish("time");',context);
   assert.ok(messages.some(m=>m.type==='ojjuda:spot-finished'));assert.ok(!messages.some(m=>m.type==='ojjuda:spot-clear'),'partial finds are not completed pictures');
   if(total===10){
    messages.length=0;r0.status='playing';context.state.completed=[1];context.found=()=>[0,1,2,3,4,5];vm.runInNewContext(finish+'finish("won");',context);
    assert.ok(!messages.some(m=>m.type==='ojjuda:spot-clear'),'six finds cannot record a ten-answer picture');
    assert.deepEqual(context.state.completed,[1],'partial finds do not enter local completion history either');
   }
  }
  // Validate actual parent callback isolation and invalid stage rejection.
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.eval(read('games/spot-difference/world-spot-game.js'));const pictures=[];w.OjjudaSpotGame.open({onClear:async(stage,owner)=>pictures.push([stage,owner])});
  const sf=w.document.querySelector('iframe');
  const spot=(stage,source=sf.contentWindow,origin=w.location.origin)=>w.dispatchEvent(new w.MessageEvent('message',{source,origin,data:{type:'ojjuda:spot-clear',stage,owner:'a'}}));
  for(const invalid of [0,-1,183,153.5,'153',NaN,Infinity])spot(invalid);
  spot(153,w);spot(182,sf.contentWindow,'https://other.test');
  const validStages=[1,17,49,62,63,82,83,152,153,182];
  for(const stage of validStages)spot(stage);await tick();
  assert.deepEqual(pictures,validStages.map(stage=>[stage,'a']),'only integer stages 1–182 from the same-origin game frame are accepted');
  console.log('PASS: territory win/loss/solo quit, multiplayer handoff and ranking exclusion, remaining-human results, stale results, duplicates/retries, paid six/ten-answer picture completion, partial finds, 182-stage bounds and cross-origin isolation');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
