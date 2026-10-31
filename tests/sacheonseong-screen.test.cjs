const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('games/sacheonseong/index.html');
const E=require('../games/sacheonseong/engine.js');
const KEY='ojjuda-sacheonseong-v1';
const sizes=[[308,426],[348,498],[378,702],[832,268],[1156,598]];
(async()=>{
 for(let stage=1;stage<=15;stage++){
  const dom=new JSDOM(html,{url:'https://example.test/games/sacheonseong/index.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;
  try{
   let width=348,height=498;
   const viewport=d.getElementById('board-scroll'),canvas=d.getElementById('board-canvas');
   Object.defineProperties(viewport,{clientWidth:{get:()=>width},clientHeight:{get:()=>height}});
   w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
   w.HTMLDialogElement.prototype.close=function(){this.open=false;};
   w.HTMLElement.prototype.scrollIntoView=function(){};
   let grid=E.generate(stage).grid;
   const stored={rulesVersion:E.RULES_VERSION,stage,unlocked:15,grid,startedAt:null,finishedMs:null,sound:false,hints:0,shuffles:0,lastRecord:null};
   w.localStorage.setItem(KEY,JSON.stringify(stored));
   w.eval(read('games/sacheonseong/engine.js'));w.eval(read('games/sacheonseong/faces.js'));w.eval(read('games/sacheonseong/app.js'));
   assert.equal(JSON.parse(w.localStorage.getItem(KEY)).stage,1,'normal entry starts a fresh first stage');
   assert.equal(JSON.parse(w.localStorage.getItem(KEY)).unlocked,15,'earned stages stay selectable');
   if(stage>1){d.getElementById('all-stages').click();d.querySelector(`[data-stage="${stage}"]`).click();}
   grid=JSON.parse(w.localStorage.getItem(KEY)).grid;
   assert.equal(d.querySelectorAll('.tile').length,4*stage*stage);
   for([width,height] of sizes){
    w.dispatchEvent(new w.Event('resize'));
    const css=canvas.style,n=stage*2,tile=parseFloat(css.getPropertyValue('--tile')),gap=parseFloat(css.getPropertyValue('--gap')),pad=parseFloat(css.getPropertyValue('--pad'));
    assert(tile>0);
    assert(n*tile+(n-1)*gap+pad*2<=width+.1,`stage ${stage} width ${width}`);
    assert(n*tile*1.19+(n-1)*gap+pad*2+4<=height+.1,`stage ${stage} height ${height}`);
    assert.equal(d.getElementById('zoom-fit').getAttribute('aria-pressed'),'true');
   }
   d.getElementById('zoom-in').click();
   assert.equal(d.getElementById('zoom-fit').getAttribute('aria-pressed'),'false');
   d.getElementById('zoom-fit').click();
   assert.equal(d.getElementById('zoom-fit').getAttribute('aria-pressed'),'true');
   const move=E.moves(grid),a=d.querySelector(`[data-r="${move.a.r}"][data-c="${move.a.c}"]`),b=d.querySelector(`[data-r="${move.b.r}"][data-c="${move.b.c}"]`);
   a.click();assert.equal(a.getAttribute('aria-pressed'),'true','full-board mode selects a tile without zooming');
   assert.equal(d.getElementById('zoom-fit').getAttribute('aria-pressed'),'true');b.click();
   const after=JSON.parse(w.localStorage.getItem(KEY));
   assert.equal(after.grid.flat().filter(v=>v!==-1).length,4*stage*stage-2,'matching pair is removed in full-board mode');
   assert(after.startedAt>0);
   d.getElementById('options-open').click();assert(d.getElementById('options').open);
   d.getElementById('ranking').click();assert(!d.getElementById('options').open);assert(d.getElementById('modal').open);assert(d.getElementById('rank-select'));
   d.getElementById('modal-close').click();
   d.getElementById('all-stages').click();assert.equal(d.querySelectorAll('.stage-card').length,15);
  }finally{w.close();}
 }
 console.log('PASS: all 15 stages fit both axes at five viewport sizes, unlocked stages stay selectable after fresh entry, full-board matching and menu controls work.');
})().catch(error=>{console.error(error);process.exitCode=1;});
