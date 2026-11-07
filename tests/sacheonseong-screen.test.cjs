const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('games/sacheonseong/index.html');
const scripts=['engine','faces','app'].map(name=>read('games/sacheonseong/'+name+'.js'));
const E=require('../games/sacheonseong/engine.js');
const KEY='ojjuda-sacheonseong-v1',RECORDS='ojjuda-sacheonseong-records-v1';
const sizes=[
 {name:'320 phone',width:308,height:426},
 {name:'390 phone',width:378,height:702},
 {name:'844 landscape',width:832,height:268},
 {name:'open foldable',width:661,height:699},
 {name:'1280 desktop',width:1256,height:758}
];
const occupied=grid=>grid.flat().filter(value=>value!==E.EMPTY).length;
let cases=0;
for(const stage of [1,2,3,4,5,6,7,10,11,12,15,16,18,26,41,71,111,200])for(const initial of sizes){
 const dom=new JSDOM(html,{url:'https://example.test/games/sacheonseong/index.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,label='stage '+stage+', '+initial.name;
 try{
  let {width,height}=initial,now=1700000000000;
  const ticks=[],viewport=d.getElementById('board-scroll'),canvas=d.getElementById('board-canvas');
  Object.defineProperties(viewport,{clientWidth:{get:()=>width},clientHeight:{get:()=>height}});
  w.Date.now=()=>now;
  w.setInterval=callback=>{ticks.push(callback);return ticks.length;};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  const oldRecords={[stage]:[{id:'previous',duration:9000,at:1690000000000}]};
  w.localStorage.setItem(RECORDS,JSON.stringify(oldRecords));
  w.localStorage.setItem(KEY,JSON.stringify({stage,unlocked:E.MAX_STAGE,sound:false}));
  scripts.forEach(script=>w.eval(script));
  const saved=()=>JSON.parse(w.localStorage.getItem(KEY)),initialState=saved();
  const grid=initialState.grid,rows=grid.length,cols=grid[0].length,info=E.stackInfo(stage,cols),total=info.total,active=occupied(grid);
  const remaining=()=>d.getElementById('remaining').textContent.match(/\d+/g).map(Number);
  const every=[grid,...initialState.upcoming],counts=new Map();
  for(const floor of every)for(const face of floor.flat()){
   if(face===E.EMPTY)continue;
   assert(Number.isInteger(face)&&w.GardenFaces[face],label+': playable face');
   counts.set(face,(counts.get(face)||0)+1);
  }
  assert.equal(initialState.stage,stage,label+': reentry keeps the last level');
  assert.equal(initialState.unlocked,E.MAX_STAGE,label+': earned levels remain');
  assert.equal(initialState.startedAt,null,label+': reentry resets the clock');
  assert.equal(rows,info.rows,label+': stack dimensions');
  assert.equal(every.length,info.layerCount,label+': actual floor count');
  assert.equal(initialState.totalTiles,total,label+': tile inventory');
  assert.equal(every.reduce((sum,floor)=>sum+occupied(floor),0),total,label+': pairs across floors');
  assert([...counts.values()].every(n=>n===2||n===4),label+': copy limit');
  assert.equal(counts.size,info.typeCount,label+': disjoint palette');
  assert.equal(d.querySelectorAll('.tile').length,rows*cols*info.layerCount,label+': every floor has rendered cells');
  assert.equal(d.querySelectorAll('.tile:not(.empty)').length,total,label+': every remaining tile shows its real face');
  assert.equal(d.querySelectorAll('.tile.empty').length,rows*cols*info.layerCount-total,label+': irregular silhouettes keep their voids');
  assert.equal(d.querySelectorAll('.tile-layer').length,info.layerCount,label+': lower floors are real interactive layers');
  assert.equal(d.querySelectorAll('.board-underlay').length,0,label+': no placeholder-only floors');
  assert(d.querySelectorAll('.tile:not(:disabled)').length>0,label+': at least one face is selectable');
  assert.deepEqual(remaining(),[total,total],label+': counter includes lower floors');
  assert.equal(Number(canvas.style.getPropertyValue('--n')),cols,label+': grid CSS columns');
  assert.equal(d.getElementById('stage-label').textContent,stage+'단계'+(info.layerCount>1?' · '+info.layerCount+'층 남음':''));
  if(stage<=2)assert.equal(active,rows*cols,label+': tutorial is rectangular');
  else assert(active<rows*cols,label+': complex silhouette has spaces');
  const assertFit=()=>{
   const css=canvas.style,tile=parseFloat(css.getPropertyValue('--tile')),gap=parseFloat(css.getPropertyValue('--gap')),pad=parseFloat(css.getPropertyValue('--pad'));
   assert(tile>0,label+': positive tile size');
   const extra=(info.layerCount-1)*E.LAYER_OFFSET;
   assert((cols+extra)*tile+(cols-1+extra)*gap+pad*2<=width+.1,label+': all floors fit width');
   assert((rows+extra)*tile*1.19+(rows-1+extra)*gap+pad*2+4<=height+.1,label+': all floors fit height');
   assert.equal(d.getElementById('zoom-fit').getAttribute('aria-pressed'),'true');
  };
  assertFit();
  const move=E.exposedMoves(every);assert(move,label+': has an uncovered legal move');
  const at=p=>d.querySelector('[data-layer="'+p.layer+'"][data-r="'+p.r+'"][data-c="'+p.c+'"]'),a=at(move.a),b=at(move.b);
  a.click();assert.equal(a.getAttribute('aria-pressed'),'true',label+': selects');
  now+=12500;ticks.forEach(tick=>tick());
  assert.equal(d.getElementById('timer').textContent,'00:12.50',label+': timer');
  const beforeRotation=saved(),beforeTiles=[...d.querySelectorAll('.tile')].map(b=>[b.dataset.face,b.className]);
  for(const resized of sizes){
   ({width,height}=resized);w.dispatchEvent(new w.Event('resize'));ticks.forEach(tick=>tick());
   assertFit();
   assert.deepEqual(saved(),beforeRotation,label+': resizing keeps the same board, time and floors');
   assert.deepEqual([...d.querySelectorAll('.tile')].map(b=>[b.dataset.face,b.className]),beforeTiles,label+': tile faces and covered states survive rotation');
   assert.equal(at(move.a),a,label+': selected tile retains identity');
   assert.equal(a.getAttribute('aria-pressed'),'true');
   assert.deepEqual(remaining(),[total,total]);
  }
  b.click();const after=saved();
  const changed=move.a.layer===0?after.grid:after.upcoming[move.a.layer-1];
  assert.equal(occupied(changed),occupied(every[move.a.layer])-2,label+': matched pair removed from its own floor');
  assert.deepEqual(remaining(),[total-2,total],label+': correct remaining count');
  assert.equal(after.runId,beforeRotation.runId);
  assert.equal(after.startedAt,beforeRotation.startedAt);
  assert.deepEqual(JSON.parse(w.localStorage.getItem(RECORDS)),oldRecords);
  d.getElementById('zoom-in').click();assert.equal(d.getElementById('zoom-fit').getAttribute('aria-pressed'),'false');
  d.getElementById('zoom-fit').click();assertFit();
  d.getElementById('options-open').click();assert(d.getElementById('options').open);
  d.getElementById('ranking').click();assert(d.getElementById('modal').open);
  d.getElementById('modal-close').click();
  d.getElementById('all-stages').click();assert.equal(d.querySelectorAll('.stage-card').length,200);
  for(const target of [1,5,6,11,12,16,18,71,111,200]){
   const card=d.querySelector('[data-stage="'+target+'"]'),meta=E.stackInfo(target);
   assert.equal(parseInt(card.querySelector('strong').textContent,10),meta.total,label+': stage preview total');
   assert(card.querySelector(':scope > small').textContent.startsWith(meta.typeCount+'종'),label+': stage preview palette');
   assert(card.getAttribute('aria-label').includes(meta.layerCount+'층'),label+': stage preview floor count');
  }
  cases++;
 }finally{w.close();}
}
console.log('PASS: '+cases+' responsive layouts, 200-stage selector, shaped masks, floor totals, saved progress and rotation.');
