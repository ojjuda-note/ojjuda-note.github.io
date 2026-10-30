const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
async function fixture(seat=0){
 const [{Game},data,{Tutorial,CHAPTERS,STEPS},{recommend},{visibleState},{createHintPurchase},{CARD_GUIDES},{CHARACTER_GUIDES}]=await Promise.all([
  import('../games/bang/engine.js'),import('../games/bang/data.js'),import('../games/bang/tutorial.js'),import('../games/bang/hints.js'),import('../games/bang/online-engine.js'),import('../games/bang/hint-purchase.js'),import('../games/bang/card-guides.js'),import('../games/bang/character-guides.js')
 ]);
 const dom=new JSDOM('<div id="app"></div><div id="overlay" hidden></div><aside id="tutorial-coach" hidden></aside><div id="toast"></div>',{url:'https://ojjuda.kr/games/bang/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,moves=[],purchases=[];
 w.scrollTo=()=>{};w.structuredClone=structuredClone;
 const online={embedded:false,room:null,busy:false,owner:"11111111-1111-4111-8111-111111111111",request:async b=>{purchases.push(b);return {ok:true,kind:"bang_hint",price:1,request_id:b.request_id,room_id:b.room_id,version:b.version};},get playing(){return !!this.room?.state;},move:m=>moves.push(m)};
 Object.assign(w,{Game,...data,Tutorial,CHAPTERS,STEPS,recommend,createHintPurchase,CARD_GUIDES,CHARACTER_GUIDES,online});
 let source=fs.readFileSync(path.join(root,'games/bang/app.js'),'utf8').replace(/^import .*;\n/gm,'');
 source+='\nwindow.qa={set(s){clearTimeout(botTimer);online.room={id:"22222222-2222-4222-8222-222222222222",version:(online.room?.version||0)+1,seat:'+seat+',state:s,code:"A1B2C3D4",status:"active"};online.onChange();},snapshot(){return JSON.stringify(game.s)},get selected(){return selected},startTutorial(){online.room=null;page="lobby";beginTutorial();}};';
 w.eval(source);
 const g=new Game(null,()=>.42);g.create({count:4,role:'sheriff',character:'bart'});
 Object.assign(g.s,{current:seat,phase:'play',pending:null,queue:[],bangs:0,winner:null,online:true});
 g.s.players.forEach((p,i)=>Object.assign(p,{char:'bart',role:['sheriff','outlaw','renegade','outlaw'][i],hp:i===seat?1:4,maxHp:4,equipment:[],hand:[],alive:true}));
 g.p(seat).hand=['beer','bang','missed'].map(type=>data.makeDeck().find(c=>c.type===type));
 const show=()=>w.qa.set(visibleState(g.s,seat));show();
 return {dom,w,g,moves,purchases,show};
}
test('recommendation selects and explains a card without playing or submitting it',async()=>{
 const {dom,w,g,moves,purchases}=await fixture(2);
 try{
  const before=w.qa.snapshot();w.document.querySelector('[data-action=hint]').click();await new Promise(r=>setTimeout(r,0));
  assert.equal(w.qa.snapshot(),before);assert.equal(moves.length,0);assert.equal(purchases.length,1);
  const beer=g.p(2).hand.find(c=>c.type==='beer');assert.equal(w.qa.selected,beer.id);
  assert.equal(w.document.querySelector('.hand .hint-card').dataset.value,String(beer.id));
  assert.match(w.document.querySelector('.controls').textContent,/맥주.*추천/s);
  assert.match(w.document.querySelector('.controls').textContent,/생명 1/);
  assert.equal(w.document.querySelector('.own-char').dataset.value,'2');
  assert.ok(w.document.querySelector('.hand [data-action=card].hint-action'));
  w.document.querySelector('.hand [data-action=card].hint-action').click();assert.equal(moves.length,1);assert.equal(moves[0].card,beer.id);
 }finally{dom.window.close();}
});
test('paid advice ends on the next state and stays out of tutorial',async()=>{
 const {dom,w,g,show,purchases}=await fixture();
 try{
  w.document.querySelector('[data-action=hint]').click();await new Promise(r=>setTimeout(r,0));g.p(0).hp=4;show();
  assert.equal(w.document.querySelector('.hand .hint-card'),null);assert.equal(purchases.length,1);
  w.document.querySelector('[data-action=hint]').click();await new Promise(r=>setTimeout(r,0));assert.equal(purchases.length,2);
  w.qa.startTutorial();assert.equal(w.document.querySelector('[data-action=hint]'),null);
 }finally{dom.window.close();}
});
test('response dialog offers a recommendation and never responds on its own',async()=>{
 const {dom,w,g,moves,show,purchases}=await fixture(1);
 try{
  g.s.pending={kind:'defend',player:1,source:0,required:'missed',need:1,cause:'뱅!'};show();
  const before=w.qa.snapshot();w.document.querySelector('#overlay [data-action=hint]').click();await new Promise(r=>setTimeout(r,0));
  assert.equal(w.qa.snapshot(),before);assert.equal(moves.length,0);assert.equal(purchases.length,1);
  assert.match(w.document.querySelector('.hint-response').textContent,/빗나감! 방어 추천/);
  assert.ok(w.document.querySelector('#overlay [data-action=respond].hint-card'));
  w.document.querySelector('#overlay [data-action=respond]').click();assert.equal(moves[0].action,'card');
 }finally{dom.window.close();}
});
test('waiting and insufficient balance do not show paid advice; a late purchase is retained once',async()=>{
 const {dom,w,g,show,purchases}=await fixture();try{
  g.s.current=1;show();w.document.querySelector('[data-action=hint]').click();await new Promise(r=>setTimeout(r,0));
  assert.equal(purchases.length,0);assert.equal(w.document.querySelector('.hint-card'),null);
  g.s.current=0;show();w.online.request=async()=>({ok:false,reason:'coins'});
  w.document.querySelector('[data-action=hint]').click();await new Promise(r=>setTimeout(r,0));
  assert.match(w.document.querySelector('#toast').textContent,/1쭈가 필요/);assert.equal(w.document.querySelector('.hint-card'),null);
  let resolve,count=0;w.online.request=body=>{count++;return new Promise(r=>{resolve=()=>r({ok:true,kind:'bang_hint',price:1,request_id:body.request_id,room_id:body.room_id,version:body.version});});};
  w.document.querySelector('[data-action=hint]').click();w.document.querySelector('[data-action=hint]').click();assert.equal(count,1);
  g.p(0).hp=4;show();resolve();await new Promise(r=>setTimeout(r,0));
  assert.equal(w.document.querySelector('.hint-card'),null);assert.equal(w.document.querySelector('[data-action=hint]').textContent,'추천 보기');
  w.document.querySelector('[data-action=hint]').click();await new Promise(r=>setTimeout(r,0));
  assert.equal(count,1);assert.ok(w.document.querySelector('.hint-card'));
 }finally{dom.window.close();}
});
