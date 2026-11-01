const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('games/sacheonseong/index.html');
const scripts=['engine','faces','app'].map(name=>read(`games/sacheonseong/${name}.js`));
const E=require('../games/sacheonseong/engine.js');
const KEY='ojjuda-sacheonseong-v1',RECORDS='ojjuda-sacheonseong-records-v1';
// These are the board-scroll areas after the existing HUD, controls and margins.
const sizes=[
 {name:'320 phone',width:308,height:426},
 {name:'390 phone',width:378,height:702},
 {name:'430 phone',width:418,height:790},
 {name:'844 landscape',width:832,height:268},
 {name:'folded phone',width:332,height:740},
 {name:'open foldable',width:661,height:699},
 {name:'1280 desktop',width:1256,height:758}
];
const occupied=grid=>grid.flat().filter(value=>value!==E.EMPTY).length;
const fit=(width,height,rows,cols,gap=2,pad=8)=>Math.min((width-2*pad-(cols-1)*gap)/cols,(height-2*pad-4-(rows-1)*gap)/(rows*1.19));
let cases=0;
for(let stage=1;stage<=15;stage++)for(const initial of sizes){
 const dom=new JSDOM(html,{url:'https://example.test/games/sacheonseong/index.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,label=`stage ${stage}, ${initial.name}`;
 try{
  let {width,height}=initial,now=1700000000000;
  const ticks=[],viewport=d.getElementById('board-scroll'),canvas=d.getElementById('board-canvas');
  Object.defineProperties(viewport,{clientWidth:{get:()=>width},clientHeight:{get:()=>height}});
  w.Date.now=()=>now;
  w.setInterval=callback=>{ticks.push(callback);return ticks.length;};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  const previousRecords={[stage]:[{id:'previous-record',duration:9000,at:1690000000000}]};
  w.localStorage.setItem(RECORDS,JSON.stringify(previousRecords));
  w.localStorage.setItem(KEY,JSON.stringify({rulesVersion:E.RULES_VERSION,stage,unlocked:15,grid:E.generate(stage).grid,startedAt:1600000000000,finishedMs:null,sound:false,hints:0,shuffles:0,lastRecord:null}));
  scripts.forEach(script=>w.eval(script));
  const saved=()=>JSON.parse(w.localStorage.getItem(KEY)),initialState=saved(),grid=initialState.grid,rows=grid.length,cols=grid[0].length,total=4*stage*stage;
  assert.equal(initialState.stage,stage,`${label}: reentry keeps the last level`);
  assert.equal(initialState.unlocked,15,`${label}: earned stages stay selectable`);
  assert.equal(initialState.startedAt,null,`${label}: reentry starts a fresh clock`);
  assert.equal(occupied(grid),total,`${label}: portrait padding cannot add or remove tiles`);
  assert(grid.every(row=>row.length===cols),`${label}: all rows share a width`);
  assert.equal(d.querySelectorAll('.tile').length,rows*cols,`${label}: every grid cell has a position`);
  assert.equal(d.querySelectorAll('.tile:not(.empty)').length,total,`${label}: only actual tiles are visible`);
  assert.equal(Number(canvas.style.getPropertyValue('--n')),cols,`${label}: CSS columns match the playable grid`);
  if(stage<=5){assert.equal(rows,stage*2,`${label}: early rows are unchanged`);assert.equal(cols,stage*2,`${label}: early columns are unchanged`);}
  else{
   assert(cols>=stage&&cols<=stage*2&&rows>=stage*2,`${label}: later boards narrow without losing capacity`);
   assert(rows*cols-total<cols,`${label}: padding fits at the end of one row`);
   assert(fit(width,height,rows,cols)>=fit(width,height,stage*2,stage*2)*.99-.02,`${label}: responsive layout does not shrink tiles compared with the square board`);
   if(initial.name==='390 phone'&&stage===6){
    assert.equal(cols,9,'390px phone uses nine columns for 144 tiles');
    assert.equal(rows,16,'390px phone uses sixteen rows for 144 tiles');
    assert(fit(width,height,rows,cols)>fit(width,height,12,12)*1.20,'the first portrait board makes tiles at least 20% wider');
   }
   if(['844 landscape','open foldable','1280 desktop'].includes(initial.name))assert.equal(cols,stage*2,`${label}: wide screens keep the square layout`);
  }
  const assertFit=()=>{
   const css=canvas.style,tile=parseFloat(css.getPropertyValue('--tile')),gap=parseFloat(css.getPropertyValue('--gap')),pad=parseFloat(css.getPropertyValue('--pad'));
   assert(tile>0,`${label}: positive tile size`);
   assert(cols*tile+(cols-1)*gap+pad*2<=width+.1,`${label}: ${cols} columns fit width ${width}`);
   assert(rows*tile*1.19+(rows-1)*gap+pad*2+4<=height+.1,`${label}: ${rows} rows fit height ${height}`);
   assert.equal(d.getElementById('zoom-fit').getAttribute('aria-pressed'),'true');
  };
  assertFit();
  const move=E.moves(grid);assert(move,`${label}: fresh board has a legal match`);
  const at=p=>d.querySelector(`[data-r="${p.r}"][data-c="${p.c}"]`),a=at(move.a),b=at(move.b);
  a.click();assert.equal(a.getAttribute('aria-pressed'),'true',`${label}: full-board view selects a tile`);
  now+=12500;ticks.forEach(tick=>tick());
  assert.equal(d.getElementById('timer').textContent,'00:12.50',`${label}: selection starts the clock`);
  const beforeRotation=saved(),beforeMarkup=d.getElementById('board').innerHTML;
  for(const resized of sizes){
   ({width,height}=resized);w.dispatchEvent(new w.Event('resize'));ticks.forEach(tick=>tick());
   assertFit();
   assert.deepEqual(saved(),beforeRotation,`${label}: resizing to ${resized.name} preserves the run, grid, clock and tool counters`);
   assert.equal(d.getElementById('board').innerHTML,beforeMarkup,`${label}: resizing does not recreate or reorder the tiles`);
   assert.equal(at(move.a),a,`${label}: a selected tile keeps its DOM identity`);
   assert.equal(a.getAttribute('aria-pressed'),'true',`${label}: selection survives rotation`);
   assert.equal(d.getElementById('timer').textContent,'00:12.50',`${label}: rotation cannot restart the timer`);
  }
  b.click();
  const after=saved();
  assert.equal(occupied(after.grid),total-2,`${label}: the original selected pair still matches after rotation`);
  assert.equal(after.runId,beforeRotation.runId,`${label}: matching stays in the same run`);
  assert.equal(after.startedAt,beforeRotation.startedAt,`${label}: matching keeps the initial start time`);
  assert.deepEqual(JSON.parse(w.localStorage.getItem(RECORDS)),previousRecords,`${label}: old records survive layout changes`);
  d.getElementById('zoom-in').click();
  assert.equal(d.getElementById('zoom-fit').getAttribute('aria-pressed'),'false');
  d.getElementById('zoom-fit').click();assertFit();
  d.getElementById('options-open').click();assert(d.getElementById('options').open);
  d.getElementById('ranking').click();assert(!d.getElementById('options').open);assert(d.getElementById('modal').open);assert(d.getElementById('rank-select'));
  d.getElementById('modal-close').click();
  d.getElementById('all-stages').click();assert.equal(d.querySelectorAll('.stage-card').length,15);
  cases++;
 }finally{w.close();}
}
console.log(`PASS: ${cases} fresh-stage layouts preserve tile totals, fit both axes, improve phone tiles and keep the active run, selection, timer and records across rotation.`);
