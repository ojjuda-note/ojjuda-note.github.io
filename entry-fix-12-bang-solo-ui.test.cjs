const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
async function fixture(available){
 const [{Game},data,tutorial,{recommend}]=await Promise.all([import('../games/bang/engine.js'),import('../games/bang/data.js'),import('../games/bang/tutorial.js'),import('../games/bang/hints.js')]);
 const dom=new JSDOM('<div id="app"></div><div id="overlay" hidden></div><aside id="tutorial-coach" hidden></aside><div id="toast"></div>',{url:'https://ojjuda.kr/games/bang/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
 w.scrollTo=()=>{};w.structuredClone=structuredClone;
 const online={embedded:false,available,busy:false,room:null,get playing(){return !!this.room?.state;},run:async(...args)=>{calls.push(args);return null;}};
 Object.assign(w,{Game,...data,...tutorial,recommend,online});
 let source=fs.readFileSync(path.join(__dirname,'../games/bang/app.js'),'utf8').replace(/^import .*;\n/gm,'');
 source+='\nwindow.qa={result(record){clearTimeout(botTimer);const g=new Game(null,()=>.42);g.create({count:4,role:"sheriff",character:"bart"});g.s.winner="sheriff";game=g;page="game";resultSeen=false;online.room=record===false?null:{id:"qa",mode:"solo",seat:0,code:"TEST",status:"finished",state:g.s,record};render();},tutorial(){online.room=null;beginTutorial();}}';w.eval(source);
 return {dom,w,calls};
}
test('signed-in computer start uses the server and never creates an unranked local game',async()=>{
 const {dom,w,calls}=await fixture(true);try{
  assert.match(w.document.querySelector('[data-action=start]').textContent,/컴퓨터 대전 · 순위 반영/);
  w.document.querySelector('[data-action=start]').click();assert.equal(calls.length,1);assert.equal(calls[0][0],'solo');
  assert.equal(calls[0][1].options.count,5);assert.equal(w.localStorage.getItem('ojjuda-bang-practice-v1'),null);
 }finally{dom.window.close();}
});
test('a saved result displays the server-confirmed streak; unsaved and legacy results cannot claim ranking credit',async()=>{
 const {dom,w}=await fixture(true);try{
  w.qa.result({saved:true,won:true,streak:2});assert.match(w.document.querySelector('#overlay').textContent,/현재 2연승 · 순위 저장 완료/);
  w.qa.result(null);assert.match(w.document.querySelector('#overlay').textContent,/순위 저장을 확인/);assert.doesNotMatch(w.document.querySelector('#overlay').textContent,/저장 완료/);
  w.qa.result(false);assert.match(w.document.querySelector('#overlay').textContent,/연습 결과 · 순위에는 반영되지 않아요/);
 }finally{dom.window.close();}
});
test('guest play and tutorial clearly remain unranked and do not submit results',async()=>{
 const {dom,w,calls}=await fixture(false);try{
  assert.match(w.document.querySelector('[data-action=start]').textContent,/연습 · 순위 제외/);
  w.document.querySelector('[data-action=start]').click();assert.equal(calls.length,0);
  assert.match(w.document.querySelector('.topbar').textContent,/연습 · 순위 제외/);
  w.qa.result(false);assert.match(w.document.querySelector('#overlay').textContent,/로그인한 뒤 새 대전/);
  w.qa.tutorial();assert.equal(calls.length,0);assert.match(w.document.querySelector('#tutorial-coach').textContent,/직접 따라 배우기/);
 }finally{dom.window.close();}
});

async function reentryFixture(room,{joinCode=''}={}){
 const f=await fixture(false),{w}=f,calls=[],old=w.online;
 const host={postMessage(message){
  if(message.type!=='ojjuda-bang-request')return;
  calls.push(message.body);
  queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:host,data:{source:'ojjuda-world',type:'ojjuda-bang-response',replyTo:message.requestId,result:{ok:true,room}}})));
 }};
 Object.defineProperty(w,'parent',{value:host,configurable:true});
 w.eval(fs.readFileSync(path.join(__dirname,'../games/bang/online.js'),'utf8').replace('export const online=','const online=')+'\nwindow.online=online;');
 w.online.onChange=old.onChange;w.online.onNotice=old.onNotice;
 w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:host,data:{source:'ojjuda-world',type:'ojjuda-bang-init',owner:'member',onlineAvailable:true,joinCode}}));
 for(let i=0;i<10;i++)await new Promise(r=>setTimeout(r,5));
 return {...f,calls};
}
test('reopening a signed-in solo game stays at the entrance until explicit resume',async()=>{
 const {Game}=await import('../games/bang/engine.js'),g=new Game(null,()=>.42);g.create({count:4,role:'sheriff',character:'bart'});
 const room={id:'saved-solo',version:4,mode:'solo',seat:0,status:'active',state:g.s};
 const {dom,w,calls}=await reentryFixture(room);try{
  assert.ok(w.document.querySelector('.game-entry [data-action=online-resume]'));
  assert.equal(w.document.querySelector('.game-layout'),null,'saved state does not bypass the entrance');
  assert.equal(w.online.room,null);assert.equal(w.online.timer,null,'discovery does not start active-game polling');
  assert.deepEqual(calls.map(x=>x.action),['mine']);
  w.document.querySelector('[data-action=home]').click();
  assert.ok(w.document.querySelector('.game-entry [data-action=online-resume]'),'both mode tabs offer resume');
  w.document.querySelector('[data-action=online-resume]').click();
  for(let i=0;i<10&&!w.document.querySelector('.game-layout');i++)await new Promise(r=>setTimeout(r,5));
  assert.ok(w.document.querySelector('.game-layout'));
  assert.deepEqual(calls.map(x=>x.action),['mine','read']);assert.equal(calls[1].room_id,room.id);
 }finally{dom.window.close();}
});
test('saved waiting rooms require resume while explicit invitations still join directly',async()=>{
 const room={id:'waiting',version:1,mode:'multi',seat:0,hostSeat:0,status:'waiting',title:'친구 방',code:'ABCDEF12',capacity:4,names:['친구']};
 for(const joinCode of ['',room.code]){
  const {dom,w,calls}=await reentryFixture(room,{joinCode});try{
   assert.deepEqual(calls.map(x=>x.action),[joinCode?'join':'mine']);
   assert.equal(!!w.document.querySelector('.room-code'),!!joinCode);
   assert.equal(!!w.document.querySelector('[data-action=online-resume]'),!joinCode);
  }finally{dom.window.close();}
 }
});
