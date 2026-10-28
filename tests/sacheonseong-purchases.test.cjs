const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {JSDOM}=require('jsdom'),E=require('../games/sacheonseong/engine.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),tick=()=>new Promise(r=>setImmediate(r));
const KEY='ojjuda-sacheonseong-v1',owner=randomUUID();
async function fixture({stored=null,member=owner,buy}={}){
 const dom=new JSDOM('<body></body>',{url:'https://example.test/world.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(read('games/sacheonseong/ranking.js'));w.eval(read('world-sacheonseong-game.js'));
 const calls=[];w.OjjudaSacheonseongGame.open({owner:member,onBuy:async(kind,id,runId,stage)=>{const item={kind,id,runId,stage};calls.push(item);return buy?buy(item):{ok:false,reason:'coins'};}});
 w.document.querySelector('.ge-primary').click();const child=w.document.querySelector('iframe').contentWindow;
 child.document.write(read('games/sacheonseong/index.html'));child.document.close();
 child.HTMLDialogElement.prototype.showModal=function(){this.open=true;};child.HTMLDialogElement.prototype.close=function(){this.open=false;};child.HTMLElement.prototype.scrollIntoView=function(){};
 child.postMessage=data=>child.dispatchEvent(new child.MessageEvent('message',{data,origin:w.location.origin,source:w}));
 w.postMessage=data=>w.dispatchEvent(new w.MessageEvent('message',{data,origin:w.location.origin,source:child}));
 Object.defineProperties(child.document.getElementById('board-scroll'),{clientWidth:{value:348},clientHeight:{value:498}});
 child.localStorage.setItem(KEY,JSON.stringify(stored||{rulesVersion:E.RULES_VERSION,stage:5,unlocked:5,grid:E.generate(5).grid,startedAt:null,finishedMs:null,sound:false,hints:0,shuffles:0}));
 for(const f of ['engine','faces','ranking','server','app'])child.eval(read('games/sacheonseong/'+f+'.js'));
 await tick();await tick();
 return {w:child,$:id=>child.document.getElementById(id),calls,state:()=>JSON.parse(child.localStorage.getItem(KEY)),close:()=>w.close()};
}
(async()=>{
 let resolve,balance=30;const receipts=new Map();
 const receipt=item=>{if(!receipts.has(item.id)){const price=item.kind==='hint'?3:10;balance-=price;receipts.set(item.id,{ok:true,kind:item.kind,run_id:item.runId,stage:item.stage,price});}return {...receipts.get(item.id),coins:balance};};
 let f=await fixture({buy:item=>new Promise(r=>{resolve=()=>r(receipt(item));})});
 try{
  assert.equal(f.$('hint').getAttribute('aria-label'),'힌트 3쭈');assert.equal(f.$('shuffle').getAttribute('aria-label'),'섞기 10쭈');
  f.$('hint').click();f.$('hint').click();f.$('shuffle').click();await tick();
  assert.equal(f.calls.length,1);assert(f.$('hint').disabled);assert(f.$('all-stages').disabled);assert.equal(f.$('board').querySelectorAll('.hinted').length,0);
  const before=f.state().grid;f.$('board').querySelector('button').click();assert.equal(f.$('board').querySelectorAll('.selected').length,0);assert.deepEqual(f.state().grid,before);
  resolve();await tick();await tick();assert.equal(balance,27);assert.equal(f.state().hints,1);assert.equal(f.state().pendingPurchase,null);assert.equal(f.$('board').querySelectorAll('.hinted').length,2);
  f.$('shuffle').click();await tick();assert.equal(f.calls.at(-1).kind,'shuffle');resolve();await tick();await tick();assert.equal(balance,17);assert.equal(f.state().shuffles,1);assert.notDeepEqual(f.state().grid,before);
  assert.deepEqual(f.state().grid.flat().sort(),before.flat().sort());
 }finally{f.close();}
 f=await fixture({buy:async()=>({ok:false,reason:'coins',coins:9,price:10})});
 try{const before=f.state().grid;f.$('shuffle').click();await tick();await tick();assert.deepEqual(f.state().grid,before);assert.equal(f.state().shuffles,0);assert.equal(f.state().pendingPurchase,null);assert.match(f.$('toast').textContent,/10쭈/);}finally{f.close();}
 f=await fixture({member:null});try{f.$('hint').click();f.$('shuffle').click();await tick();assert.equal(f.calls.length,0);assert.match(f.$('toast').textContent,/로그인/);}finally{f.close();}
 f=await fixture({buy:async item=>{receipt(item);throw Error('lost response');}});
 let saved,id,afterCharge;
 try{f.$('hint').click();await tick();await tick();saved=f.state();id=saved.pendingPurchase.id;afterCharge=balance;assert.equal(saved.hints,0);assert.match(f.$('hint').getAttribute('aria-label'),/다시 확인/);}finally{f.close();}
 f=await fixture({stored:saved,buy:async item=>receipt(item)});
 try{assert(f.$('all-stages').disabled);f.$('hint').click();await tick();await tick();assert.equal(f.calls[0].id,id);assert.equal(balance,afterCharge,'reload retry reuses the paid receipt');assert.equal(f.state().hints,1);assert.equal(f.state().pendingPurchase,null);assert.equal(f.$('board').querySelectorAll('.hinted').length,2);}finally{f.close();}
 f=await fixture({stored:saved,member:randomUUID(),buy:async item=>receipt(item)});
 try{f.$('hint').click();await tick();assert.equal(f.calls.length,0);assert.match(f.$('toast').textContent,/구매를 시작한 계정/);}finally{f.close();}
 f=await fixture();try{f.w.Storage.prototype.setItem=function(){throw Error('full');};f.$('hint').click();await tick();assert.equal(f.calls.length,0);assert.match(f.$('toast').textContent,/저장할 수 없어/);}finally{f.close();}
 console.log('PASS: visible 3/10 prices, real iframe purchase bridge, charge before effect, duplicate-click guard, insufficient funds, guest denial, account binding, durable lost-response retry and storage failures.');
})().catch(e=>{console.error(e);process.exitCode=1});
