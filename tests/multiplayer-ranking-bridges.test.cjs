const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{randomUUID}=require('node:crypto');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const dom=new JSDOM('<body><button>게임</button></body>',{url:'https://fixture.test',runScripts:'outside-only'}),w=dom.window;
 try{
  w.eval(read('ttang-bridge.js'));let allowed=true;const saved=[];
  w.OjjudaTtangBridge.open({owner:'a',authorized:()=>allowed,onResult:async(won,id)=>{saved.push([won,id]);return{ok:true}}});
  const frame=w.document.querySelector('iframe'),post=d=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:frame.contentWindow,data:d}));
  const first=randomUUID(),second=randomUUID();
  post({type:'ojjuda:ttang:start',round:first,mode:'solo'});post({type:'ojjuda:ttang:result',round:first,mode:'solo',win:true});await tick();
  post({type:'ojjuda:ttang:result',round:first,mode:'solo',win:true});post({type:'ojjuda:ttang:result',round:second,mode:'solo',win:true});
  assert.deepEqual(saved,[[true,first]]);
  post({type:'ojjuda:ttang:start',round:second,mode:'duo'});post({type:'ojjuda:ttang:result',round:second,mode:'duo',win:false});await tick();
  assert.deepEqual(saved.at(-1),[false,second]);assert.match(w.document.querySelector('#ttang-save-status').textContent,/기록했어요/);
  const third=randomUUID();post({type:'ojjuda:ttang:start',round:third,mode:'duo'});w.OjjudaTtangBridge.close();await tick();assert.deepEqual(saved.at(-1),[false,third],'quitting cannot preserve a streak');
  w.OjjudaTtangBridge.open({owner:'a',authorized:()=>allowed,onResult:async()=>{throw Error('offline')}});
  const f=w.document.querySelector('iframe'),r=randomUUID();
  const send=d=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:f.contentWindow,data:d}));
  send({type:'ojjuda:ttang:start',round:r,mode:'solo'});send({type:'ojjuda:ttang:result',round:r,mode:'solo',win:true});await tick();
  assert.match(w.document.querySelector('#ttang-save-status').textContent,/다시 저장/);allowed=false;w.OjjudaTtangBridge.close();
  // Exercise the actual picture completion function with a paid hint/time result.
  const app=read('games/spot-difference/app.js'),finish=app.slice(app.indexOf('  function finish(reason){'),app.indexOf('  function tick(){'));
  const messages=[],r0={status:'playing',rankOwner:'a',assisted:true,paid:[0],timeBought:true};
  const context={round:()=>r0,core:{timeLeft:()=>12000},zoomDialog:{open:false},hideHint(){},refresh(){},speak(){},celebrate(){},
   found:()=>[0,1,2,3,4,5],puzzle:()=>({id:17}),window:{location:{origin:'https://fixture.test'},parent:{postMessage:m=>messages.push(m)}},wallet:{}};
  vm.runInNewContext(finish+'finish("won");',context);
  assert.equal(messages.find(m=>m.type==='ojjuda:spot-clear').stage,17,'paid completion records a picture ID');
  messages.length=0;r0.status='playing';context.found=()=>[0,1,2];vm.runInNewContext(finish+'finish("time");',context);
  assert.ok(messages.some(m=>m.type==='ojjuda:spot-finished'));assert.ok(!messages.some(m=>m.type==='ojjuda:spot-clear'),'partial finds are not completed pictures');
  // Validate actual parent callback isolation and invalid stage rejection.
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.eval(read('world-spot-game.js'));const pictures=[];w.OjjudaSpotGame.open({onClear:async(stage,owner)=>pictures.push([stage,owner])});
  const sf=w.document.querySelector('iframe');
  const spot=(stage,source=sf.contentWindow,origin=w.location.origin)=>w.dispatchEvent(new w.MessageEvent('message',{source,origin,data:{type:'ojjuda:spot-clear',stage,owner:'a'}}));
  spot(0);spot(49);spot(1,w);spot(1,sf.contentWindow,'https://other.test');spot(17);await tick();
  assert.deepEqual(pictures,[[17,'a']]);
  console.log('PASS: territory win/loss/quit/duplicates/retries, paid picture completion, partial finds and cross-origin isolation');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
