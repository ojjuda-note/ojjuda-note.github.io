const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
async function fixture(seat=0){
 const [{Game},data,{Tutorial,CHAPTERS,STEPS},{recommend},{visibleState}]=await Promise.all([
  import('../games/bang/engine.js'),import('../games/bang/data.js'),import('../games/bang/tutorial.js'),import('../games/bang/hints.js'),import('../games/bang/online-engine.js')
 ]);
 const dom=new JSDOM('<div id="app"></div><div id="overlay" hidden></div><aside id="tutorial-coach" hidden></aside><div id="toast"></div>',{url:'https://ojjuda.kr/games/bang/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,moves=[];
 w.scrollTo=()=>{};w.structuredClone=structuredClone;
 const online={embedded:false,room:null,busy:false,get playing(){return !!this.room?.state;},move:m=>moves.push(m)};
 Object.assign(w,{Game,...data,Tutorial,CHAPTERS,STEPS,recommend,online});
 let source=fs.readFileSync(path.join(root,'games/bang/app.js'),'utf8').replace(/^import .*;\n/gm,'');
 source+='\nwindow.qa={set(s){clearTimeout(botTimer);online.room={id:"qa",seat:'+seat+',state:s,code:"A1B2C3D4",status:"active"};online.onChange();},snapshot(){return JSON.stringify(game.s)},get selected(){return selected},startTutorial(){online.room=null;page="lobby";beginTutorial();}};';
 w.eval(source);
 const g=new Game(null,()=>.42);g.create({count:4,role:'sheriff',character:'bart'});
 Object.assign(g.s,{current:seat,phase:'play',pending:null,queue:[],bangs:0,winner:null,online:true});
 g.s.players.forEach((p,i)=>Object.assign(p,{char:'bart',role:['sheriff','outlaw','renegade','outlaw'][i],hp:i===seat?1:4,maxHp:4,equipment:[],hand:[],alive:true}));
 g.p(seat).hand=['beer','bang','missed'].map(type=>data.makeDeck().find(c=>c.type===type));
 const show=()=>w.qa.set(visibleState(g.s,seat));show();
 return {dom,w,g,moves,show};
}
test('recommendation selects and explains a card without playing or submitting it',async()=>{
 const {dom,w,g,moves}=await fixture(2);
 try{
  const before=w.qa.snapshot();w.document.querySelector('[data-action=hint]').click();
  assert.equal(w.qa.snapshot(),before);assert.equal(moves.length,0);
  const beer=g.p(2).hand.find(c=>c.type==='beer');assert.equal(w.qa.selected,beer.id);
  assert.equal(w.document.querySelector('.hand .hint-card').dataset.value,String(beer.id));
  assert.match(w.document.querySelector('.controls').textContent,/맥주.*추천/s);
  assert.match(w.document.querySelector('.controls').textContent,/생명 1/);
  assert.equal(w.document.querySelector('.own-char').dataset.value,'2');
  assert.ok(w.document.querySelector('[data-action=use].hint-action'));
  w.document.querySelector('[data-action=use]').click();assert.equal(moves.length,1);assert.equal(moves[0].card,beer.id);
 }finally{dom.window.close();}
});
test('advice updates on incoming multiplayer state, turns off and stays out of tutorial',async()=>{
 const {dom,w,g,show}=await fixture();
 try{
  w.document.querySelector('[data-action=hint]').click();g.p(0).hp=4;show();
  assert.ok(!w.document.querySelector('.hand .hint-card').textContent.includes('맥주'));
  w.document.querySelector('[data-action=hint]').click();assert.equal(w.document.querySelectorAll('.hint-card,.hint-action,.hint-target').length,0);
  w.qa.startTutorial();assert.equal(w.document.querySelector('[data-action=hint]'),null);
 }finally{dom.window.close();}
});
test('response dialog offers a recommendation and never responds on its own',async()=>{
 const {dom,w,g,moves,show}=await fixture(1);
 try{
  g.s.pending={kind:'defend',player:1,source:0,required:'missed',need:1,cause:'뱅!'};show();
  const before=w.qa.snapshot();w.document.querySelector('#overlay [data-action=hint]').click();
  assert.equal(w.qa.snapshot(),before);assert.equal(moves.length,0);
  assert.match(w.document.querySelector('.hint-response').textContent,/빗나감! 방어 추천/);
  assert.ok(w.document.querySelector('#overlay [data-action=respond].hint-card'));
  w.document.querySelector('#overlay [data-action=respond]').click();assert.equal(moves[0].action,'card');
 }finally{dom.window.close();}
});
