const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
async function fixture(available){
 const [{Game},data,tutorial,{recommend},{createHintPurchase},{CARD_GUIDES},{CHARACTER_GUIDES}]=await Promise.all([import('../games/bang/engine.js'),import('../games/bang/data.js'),import('../games/bang/tutorial.js'),import('../games/bang/hints.js'),import('../games/bang/hint-purchase.js'),import('../games/bang/card-guides.js'),import('../games/bang/character-guides.js')]);
 const dom=new JSDOM('<div id="app"></div><div id="overlay" hidden></div><aside id="tutorial-coach" hidden></aside><div id="toast"></div>',{url:'https://ojjuda.kr/games/bang/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
 w.scrollTo=()=>{};w.structuredClone=structuredClone;
 const online={embedded:false,available,busy:false,room:null,get playing(){return !!this.room?.state;},run:async(...args)=>{calls.push(args);return null;}};
 Object.assign(w,{Game,...data,...tutorial,recommend,createHintPurchase,CARD_GUIDES,CHARACTER_GUIDES,online});
 let source=fs.readFileSync(path.join(__dirname,'../games/bang/app.js'),'utf8').replace(/^import .*;\n/gm,'');
 source+='\nwindow.qa={result(record){clearTimeout(botTimer);const g=new Game(null,()=>.42);g.create({count:4,role:"sheriff",character:"bart"});g.s.winner="sheriff";game=g;page="game";resultSeen=false;online.room=record===false?null:{id:"qa",mode:"solo",seat:0,code:"TEST",status:"finished",state:g.s,record};render();},tutorial(){online.room=null;beginTutorial();},snapshot(){return JSON.stringify({state:game.s,step:tutorial?.step,selected,targeting,settings});},stepTo(step){while(tutorial.step<step&&!tutorial.done){const e=tutorial.expected();tutorialAction(e.action,e.value);}}}';w.eval(source);
 return {dom,w,calls};
}
test('signed-in computer start uses the server and never creates an unranked local game',async()=>{
 const {dom,w,calls}=await fixture(true);try{
  assert.match(w.document.querySelector('[data-action=start]').textContent,/컴퓨터 대전 · 순위 반영/);
  w.document.querySelector('[data-action=start]').click();assert.equal(calls.length,1);assert.equal(calls[0][0],'solo');
  assert.equal(calls[0][1].options.count,5);assert.equal(calls[0][1].options.role,'random');assert.equal(w.document.querySelector('[data-action=role]'),null);assert.equal(w.localStorage.getItem('ojjuda-bang-practice-v1'),null);
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
test('selecting a card stays on the table; only the card guide opens detailed lessons',async()=>{
 const {dom,w,calls}=await fixture(false);try{
  w.document.querySelector('[data-action=start]').click();
  const saved=JSON.parse(w.localStorage.getItem('ojjuda-bang-practice-v1'));
  assert.equal(saved.options.role,'random');
  w.document.querySelector('.hand [data-action=card]').click();
  assert.equal(w.document.querySelector('#overlay').hidden,true);
  assert.ok(w.document.querySelector('.controls.has-card .selection-info p').textContent.length>10);
  w.document.querySelector('.controls [data-action=zoom]').click();
  assert.match(w.document.querySelector('#overlay').textContent,/카드 안내 · 무료/);
  assert.deepEqual([...w.document.querySelectorAll('.card-guide dt')].map(x=>x.textContent),['효과','사용 방법','활용 팁']);
  assert.deepEqual(JSON.parse(w.localStorage.getItem('ojjuda-bang-practice-v1')),saved);
  w.document.querySelector('[data-action=close]').click();
  w.qa.tutorial();const before=w.document.querySelector('#tutorial-coach h2').textContent;
  w.document.querySelector('.hand [data-action=card]').click();
  assert.equal(w.document.querySelector('#overlay').hidden,true);
  assert.equal(w.document.querySelector('#tutorial-coach').hidden,false);
  assert.match(w.document.querySelector('.selection-info strong').textContent,/뱅!/);
  w.document.querySelector('.controls [data-action=zoom]').click();
  assert.ok(w.document.querySelector('.card-guide'));assert.equal(w.document.querySelector('#tutorial-coach').hidden,true);
  w.document.querySelector('[data-action=close]').click();
  assert.equal(w.document.querySelector('#tutorial-coach h2').textContent,before,'browsing a card does not skip a lesson');
  w.document.querySelector('.topbar [data-action=catalog]').click();
  assert.equal(w.document.querySelector('#overlay [data-action=characterCatalog]'),null,'card guide has no character tab');
  const types=[...w.document.querySelectorAll('[data-action=catalogCard]')].map(x=>x.dataset.value);assert.equal(types.length,22);
  for(const type of types){
   w.document.querySelector(`[data-action=catalogCard][data-value=${type}]`).click();
   assert.equal(w.document.querySelectorAll('.card-guide dd').length,3);
   assert.ok([...w.document.querySelectorAll('.card-guide dd')].every(x=>x.textContent.length>10));
   w.document.querySelector('#overlay [data-action=catalog]').click();
  }
  assert.equal(calls.length,0,'free guidance never calls a purchase or game RPC');
 }finally{dom.window.close();}
});

test('all 16 character lessons are free, explain activation and preserve the current practice',async()=>{
 const {dom,w,calls}=await fixture(false);try{
  w.qa.tutorial();const before=w.qa.snapshot();
  assert.equal(w.document.querySelector('.own-char').disabled,false);
  w.document.querySelector('.topbar [data-action=characterCatalog]').click();
  assert.equal(w.document.querySelector('#overlay [data-action=catalog]'),null,'character guide has no card tab');
  const ids=[...w.document.querySelectorAll('[data-action=characterGuide]')].map(x=>x.dataset.value);
  assert.equal(new Set(ids).size,16);
  for(const id of ids){
   w.document.querySelector(`[data-action=characterGuide][data-value=${id}]`).click();
   assert.deepEqual([...w.document.querySelectorAll('.character-guide dt')].map(x=>x.textContent),['능력','발동 조건','사용 방법','예시']);
   assert.ok([...w.document.querySelectorAll('.character-guide dd')].every(x=>x.textContent.length>10));
   assert.equal(w.document.querySelector('#tutorial-coach').hidden,true);
   w.document.querySelector('#overlay [data-action=characterCatalog]').click();
  }
  w.document.querySelector('[data-action=close]').click();
  assert.equal(w.qa.snapshot(),before);assert.equal(calls.length,0);
  assert.equal(w.localStorage.getItem('ojjuda-bang-practice-v1'),null);
 }finally{dom.window.close();}
});
function pointer(w,target,type,x,y){
 const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});
 Object.defineProperties(e,{pointerId:{value:1},pointerType:{value:'touch'},isPrimary:{value:true}});target.dispatchEvent(e);
}
function swipe(w,dx,dy=0,cancel=false){
 const content=w.document.querySelector('.guide-content'),overlay=w.document.querySelector('#overlay');
 pointer(w,content,'pointerdown',180,100);
 if(cancel)pointer(w,overlay,'pointercancel',180+dx,100+dy);
 pointer(w,overlay,'pointerup',180+dx,100+dy);
}
test('card and character guides swipe both ways and wrap; scrolling, short drags and cancelled gestures do not turn a page',async()=>{
 const {dom,w,calls}=await fixture(false);try{
  w.qa.tutorial();const before=w.qa.snapshot();
  w.document.querySelector('.topbar [data-action=catalog]').click();w.document.querySelector('[data-action=catalogCard][data-value=bang]').click();
  const title=()=>w.document.querySelector('#dialog-title').textContent;
  swipe(w,-110);assert.equal(title(),'빗나감!');assert.equal(w.document.querySelector('.guide-position b').textContent,'2 / 22');
  swipe(w,110);assert.equal(title(),'뱅!');swipe(w,110);assert.equal(title(),'윈체스터');
  w.document.querySelector('[data-action=guideNext]').click();assert.equal(title(),'뱅!');
  swipe(w,-20);swipe(w,-100,150);swipe(w,-100,0,true);assert.equal(title(),'뱅!');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(title(),'빗나감!');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(title(),'뱅!');
  w.document.querySelector('[data-action=close]').click();w.document.querySelector('.topbar [data-action=characterCatalog]').click();
  w.document.querySelector('[data-action=characterGuide][data-value=bart]').click();swipe(w,-100);assert.equal(title(),'블랙 잭');
  swipe(w,100);assert.equal(title(),'바트 캐시디');swipe(w,100);assert.equal(title(),'윌리 더 키드');
  w.document.querySelector('[data-action=close]').click();assert.equal(w.qa.snapshot(),before);assert.equal(calls.length,0);
 }finally{dom.window.close();}
});
test('own character help leaves target selection, defence and completed practice intact',async()=>{
 const {dom,w,calls}=await fixture(false);try{
  w.qa.tutorial();w.qa.stepTo(1);
  w.document.querySelector('.hand [aria-label="뱅! 카드"]').click();
  assert.equal(w.document.querySelector('#overlay').hidden,true,'the lesson card is selected without a popup');
  assert.equal(w.document.querySelector('.controls [data-action=use]').disabled,false);
  w.qa.stepTo(3);const targeting=w.qa.snapshot();
  w.document.querySelector('.hand [aria-label="맥주 카드"]').click();
  assert.equal(w.document.querySelector('#overlay').hidden,true);
  assert.match(w.document.querySelector('.selection-info strong').textContent,/맥주/);
  assert.equal(w.qa.snapshot(),targeting,'a brief preview keeps the exercise target and card');
  w.document.querySelector('[data-action=previewClose]').click();
  w.document.querySelector('.own-char').click();assert.equal(w.document.querySelector('#dialog-title').textContent,'럭키 듀크');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(w.qa.snapshot(),targeting);assert.equal(w.document.querySelector('[data-action=player][data-value="1"]').disabled,false);
  w.document.querySelector('[data-action=player][data-value="1"]').click();assert.notEqual(w.qa.snapshot(),targeting,'the target still executes the exercise');
  w.qa.stepTo(8);const defending=w.qa.snapshot();
  w.document.querySelector('#overlay [data-action=characterCatalog]').click();
  w.document.querySelector('[data-action=characterGuide][data-value=kit]').click();assert.match(w.document.querySelector('.character-guide').textContent,/돌려놓을 1장/);
  w.document.querySelector('[data-action=close]').click();assert.ok(w.document.querySelector('#overlay [data-action=respond]'));assert.equal(w.qa.snapshot(),defending);
  w.qa.stepTo(99);const completed=w.qa.snapshot();
  w.document.querySelector('#overlay [data-action=characterCatalog]').click();w.document.querySelector('[data-action=characterGuide][data-value=sid]').click();
  w.document.querySelector('[data-action=close]').click();assert.match(w.document.querySelector('#overlay').textContent,/연습, 완료/);assert.equal(w.qa.snapshot(),completed);assert.equal(calls.length,0);
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
