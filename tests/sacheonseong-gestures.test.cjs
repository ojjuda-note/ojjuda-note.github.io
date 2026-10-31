const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const dom=new JSDOM(read('games/sacheonseong/index.html'),{url:'https://example.test/games/sacheonseong/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
try{
 let now=Date.now();w.Date.now=()=>now;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(read('games/sacheonseong/engine.js'));w.eval(read('games/sacheonseong/faces.js'));
 w.localStorage.setItem('ojjuda-sacheonseong-v1',JSON.stringify({rulesVersion:w.TileGarden.RULES_VERSION,stage:5,unlocked:5,grid:w.TileGarden.generate(5).grid,startedAt:null,finishedMs:null,hints:0,shuffles:0}));
 const viewport=d.getElementById('board-scroll'),canvas=d.getElementById('board-canvas');
 Object.defineProperties(viewport,{clientWidth:{value:348},clientHeight:{value:498}});
 viewport.getBoundingClientRect=()=>({left:6,top:86,right:354,bottom:584,width:348,height:498});
 canvas.getBoundingClientRect=()=>{const size=parseFloat(canvas.style.getPropertyValue('--tile'))||30,gap=parseFloat(canvas.style.getPropertyValue('--gap'))||3,pad=8,width=size*10+gap*9+pad*2,height=size*11.9+gap*9+pad*2+4;return {width,height,left:6+Math.max(0,(348-width)/2)-viewport.scrollLeft,top:86+Math.max(0,(498-height)/2)-viewport.scrollTop};};
 w.eval(read('games/sacheonseong/app.js'));
 d.getElementById('all-stages').click();d.querySelector('[data-stage="5"]').click();
 const size=()=>parseFloat(canvas.style.getPropertyValue('--tile')),initial=size();
 function pointer(type,id,x,y,target=viewport){const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y});Object.defineProperties(e,{pointerId:{value:id},pointerType:{value:'touch'}});target.dispatchEvent(e);return e;}
 const click=target=>target.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
 const first=d.querySelector('.tile');pointer('pointerdown',1,100,200,first);assert(first.classList.contains('pressed'),'touch-down gives immediate feedback');assert.equal(first.getAttribute('aria-pressed'),'false','a press alone does not commit a move');pointer('pointerup',1,100,200,first);assert.equal(first.getAttribute('aria-pressed'),'true','release selects without waiting for click');click(first);assert.equal(first.getAttribute('aria-pressed'),'true','compatibility click cannot toggle the selection again');first.click();assert.equal(first.getAttribute('aria-pressed'),'false','keyboard activation remains immediate');
 pointer('pointerdown',1,100,200);pointer('pointerdown',2,200,200);const move=pointer('pointermove',2,300,200);
 assert(move.defaultPrevented,'pinch consumes browser zoom');assert(size()>initial*1.9);assert.equal(d.getElementById('zoom-fit').getAttribute('aria-pressed'),'false');
 pointer('pointerup',2,300,200);pointer('pointerup',1,100,200);click(first);assert.equal(first.getAttribute('aria-pressed'),'false','ending a gesture does not select a tile');
 pointer('pointerdown',6,100,200,first);pointer('pointerup',6,100,200,first);click(first);assert.equal(first.getAttribute('aria-pressed'),'true','a fresh tap immediately after pinch is not delayed');first.click();
 pointer('pointerdown',7,100,200,first);pointer('pointermove',7,120,220,first);assert(!first.classList.contains('pressed'),'drag clears press feedback');pointer('pointerup',7,120,220,first);click(first);assert.equal(first.getAttribute('aria-pressed'),'false');
 pointer('pointerdown',8,100,200,first);pointer('pointercancel',8,100,200,first);click(first);assert(!first.classList.contains('pressed'));assert.equal(first.getAttribute('aria-pressed'),'false','cancel cannot select a tile');
 const left=viewport.scrollLeft,top=viewport.scrollTop;pointer('pointerdown',3,200,300);pointer('pointermove',3,140,240);pointer('pointerup',3,140,240);assert(viewport.scrollLeft>left);assert(viewport.scrollTop>top);
 const enlarged=size();let wheel=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:35,clientX:150,clientY:250});viewport.dispatchEvent(wheel);assert(wheel.defaultPrevented);assert(size()<enlarged);
 wheel=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:30});viewport.dispatchEvent(wheel);assert(!wheel.defaultPrevented,'ordinary scrolling remains native');
 d.getElementById('zoom-fit').click();assert.equal(size(),initial);assert.equal(viewport.scrollLeft,0);assert.equal(viewport.scrollTop,0);
 pointer('pointerdown',4,100,200);pointer('pointerdown',5,200,200);pointer('pointermove',5,120,200);assert.equal(size(),initial,'pinch-out stops at full-board fit');pointer('pointercancel',4,100,200);pointer('pointercancel',5,120,200);
 assert.equal(d.querySelector('.topbar').style.transform,'');assert.equal(d.querySelector('.game-actions').style.transform,'');
 console.log('PASS: touch pinch zoom, pan, trackpad zoom prevention, normal taps, no gesture-end selection, cancellation and full-board reset.');
}finally{w.close();}
