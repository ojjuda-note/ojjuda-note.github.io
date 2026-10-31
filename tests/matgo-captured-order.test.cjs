const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../games/matgo.html'),'utf8');
const start=source.indexOf('function syncCards('),end=source.indexOf('\nfunction showCaptured(',start);
assert.ok(start>=0&&end>start,'load the actual solo card synchronizer');
const dependencies=Promise.all([import('../games/matgo-engine.mjs'),import('../games/matgo-art.mjs'),import('../games/matgo-captured-zoom.mjs')]);
async function fixture(t){
 const [engine,art,zoom]=await dependencies;
 const groups=()=>'<div class="caps">'+['광','열끗','띠','피'].map(name=>`<div class="cap" data-g="${name}"><span class="lb">${name} 0</span></div>`).join('')+'</div>';
 const dom=new JSDOM('<!doctype html><html><body><div class="zone me">'+groups()+'</div><div class="zone op">'+groups()+'</div></body></html>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;t.after(()=>w.close());w.eval(source.slice(start,end));
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const card=(id,asPi=false)=>({...engine.CARDS[id],asPi});
 const pile=(seat='me',name='피')=>d.querySelector(`.zone.${seat} .cap[data-g="${name}"]`);
 const nodes=el=>[...el.querySelectorAll(':scope > .c')],ids=el=>nodes(el).map(node=>+node.dataset.id);
 const make=c=>{const node=d.createElement('div');node.className='c';node.dataset.id=c.id;node.innerHTML=art.cardSVG(c).replace('<svg',`<svg data-face="${c.id}"`);return node;};
 function sync(el,cards){
  w.syncCards(el,cards,make,(node,c)=>{const left=(6+cards.indexOf(c)*18)+'px';if(node.style.left!==left)node.style.left=left;});
 }
 function render(cards,seat='me'){
  for(const [name,filter] of [['광',c=>c.k==='gwang'],['열끗',c=>c.k==='yul'&&!c.asPi],['띠',c=>c.k==='tti'],['피',engine.isPi]])sync(pile(seat,name),cards.filter(filter));
 }
 return {w,d,engine,zoom,card,pile,nodes,ids,make,sync,render};
}

test('gukjin joining an existing pi pile follows capture order before and after the next card',async t=>{
 const f=await fixture(t),cup=f.card(32),chrysanthemum=f.card(34),peony=f.card(22),cards=[cup,chrysanthemum];
 f.render(cards);assert.deepEqual(f.ids(f.pile()),[34]);
 const original34=f.nodes(f.pile())[0];cup.asPi=true;f.render(cards);
 assert.deepEqual(f.ids(f.pile()),[32,34],'a new leftmost card must paint before the existing rightmost card');
 cards.push(peony);f.render(cards);
 assert.deepEqual(f.ids(f.pile()),[32,34,22]);
 assert.deepEqual(f.nodes(f.pile()).map(node=>node.style.left),['6px','24px','42px']);
 assert.equal(f.pile().querySelector('[data-id="34"]'),original34);
 assert.equal(f.engine.score(cards).pv,4);assert.equal(f.engine.score(cards).pts,0);
});

test('reordering preserves existing card nodes, event listeners and non-card metadata',async t=>{
 const f=await fixture(t),el=f.pile(),cards=[f.card(34),f.card(22),f.card(35)];f.sync(el,cards);
 const label=el.querySelector('.lb'),before=new Map(f.nodes(el).map(node=>[+node.dataset.id,node]));
 const note=f.d.createElement('small');note.className='capture-note';note.textContent='metadata';el.append(note);
 let clicked=0;before.get(22).addEventListener('click',()=>clicked++);
 f.sync(el,[cards[1],cards[2],cards[0]]);
 assert.deepEqual(f.ids(el),[22,35,34]);
 for(const [id,node] of before)assert.equal(el.querySelector(`[data-id="${id}"]`),node);
 before.get(22).click();assert.equal(clicked,1);
 assert.equal(el.querySelector('.lb'),label);assert.equal(el.firstElementChild,label);
 assert.equal(el.querySelector('.capture-note'),note);assert.equal(note.textContent,'metadata');
});

test('the same ordered state performs no synchronizer DOM writes',async t=>{
 const f=await fixture(t),el=f.pile(),cards=[f.card(32,true),f.card(34),f.card(22)];f.sync(el,cards);
 const observer=new f.w.MutationObserver(()=>{});observer.observe(el,{childList:true,subtree:true,attributes:true,characterData:true});
 f.sync(el,cards);assert.deepEqual(observer.takeRecords(),[]);
 f.nodes(el)[1].style.visibility='hidden';observer.takeRecords();f.sync(el,cards);
 assert.equal(f.nodes(el)[1].style.visibility,'','a card hidden by a completed flight is restored');
 assert.ok(observer.takeRecords().length>0);
 f.sync(el,cards);assert.deepEqual(observer.takeRecords(),[]);observer.disconnect();
});

test('switching gukjin back to yul and then to pi keeps the two piles ordered and disjoint',async t=>{
 const f=await fixture(t),cup=f.card(32,true),cards=[cup,f.card(34),f.card(22)];f.render(cards);
 const remaining=f.nodes(f.pile()).slice(1);cup.asPi=false;f.render(cards);
 assert.deepEqual(f.ids(f.pile()),[34,22]);assert.deepEqual(f.ids(f.pile('me','열끗')),[32]);
 assert.equal(f.engine.score(cards).pv,2);assert.equal(f.engine.score(cards).y,1);
 cup.asPi=true;f.render(cards);assert.deepEqual(f.ids(f.pile()),[32,34,22]);assert.deepEqual(f.ids(f.pile('me','열끗')),[]);
 assert.equal(f.pile().querySelector('[data-id="34"]'),remaining[0]);assert.equal(f.pile().querySelector('[data-id="22"]'),remaining[1]);
 assert.equal(f.d.querySelectorAll('.zone.me .caps [data-id="32"]').length,1);
});

test('a pi transfer removes only the departed card and appends it in the recipient capture order',async t=>{
 const f=await fixture(t),mine=[f.card(32,true),f.card(34),f.card(22)],other=[f.card(2),f.card(6)];
 f.render(mine);f.render(other,'op');const survivor=f.pile().querySelector('[data-id="22"]'),recipient=f.nodes(f.pile('op'))[0];
 other.push(mine.splice(1,1)[0]);f.render(mine);f.render(other,'op');
 assert.deepEqual(f.ids(f.pile()),[32,22]);assert.deepEqual(f.ids(f.pile('op')),[2,6,34]);
 assert.equal(f.pile().querySelector('[data-id="22"]'),survivor);assert.equal(f.nodes(f.pile('op'))[0],recipient);
 assert.equal(f.d.querySelectorAll('.caps [data-id="34"]').length,1);
});

test('the real captured-card viewer reads the same corrected order without moving source cards',async t=>{
 const f=await fixture(t),cup=f.card(32),cards=[cup,f.card(34)];f.render(cards);cup.asPi=true;f.render(cards);cards.push(f.card(22));f.render(cards);
 const originals=f.nodes(f.pile());f.zoom.installCapturedZoom(f.d);f.pile().click();
 const dialog=f.d.querySelector('dialog.captured-zoom');assert.ok(dialog?.open);
 assert.deepEqual([...dialog.querySelectorAll('.captured-expanded > svg')].map(node=>+node.dataset.face),[32,34,22]);
 assert.deepEqual(f.nodes(f.pile()),originals);dialog.querySelector('#captured-close').click();
 assert.equal(f.d.querySelector('dialog.captured-zoom'),null);assert.deepEqual(f.nodes(f.pile()),originals);
});

test('emptying a captured pile retains its label and metadata',async t=>{
 const f=await fixture(t),el=f.pile(),label=el.querySelector('.lb');f.sync(el,[f.card(34)]);
 const note=f.d.createElement('small');note.textContent='preserve';el.append(note);f.sync(el,[]);
 assert.deepEqual(f.ids(el),[]);assert.equal(el.querySelector('.lb'),label);assert.equal(label.textContent,'피 0');assert.equal(note.parentNode,el);
});
