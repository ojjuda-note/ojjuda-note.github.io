const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'../games/spot-difference'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const dom=new JSDOM(read('index.html'),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,$=id=>d.getElementById(id);
try{
 let now=Date.now(),charges=0,pageScroll=0;w.Date.now=()=>now;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.scrollTo=()=>{};w.scrollBy=(x,y)=>pageScroll+=y;w.confirm=()=>true;
 w.JjudaWallet={getState:()=>({userId:'member-a',coins:100}),subscribe:fn=>fn({userId:'member-a',coins:100}),refresh:async()=>{},recordClear:async()=>({ok:true}),buy:()=>{charges++;return Promise.resolve({ok:false,reason:'coins'});}};
 const panes=[$('zoom-scroll-a'),$('zoom-scroll-b')],surfaces=panes.map(p=>p.querySelector('.zoom-picture'));
 const width=()=>parseFloat(surfaces[0].style.width)||850;
 for(let i=0;i<2;i++){
  const pane=panes[i],surface=surfaces[i];let left=0,top=0;
  Object.defineProperties(pane,{clientWidth:{value:360},clientHeight:{value:250},scrollWidth:{get:()=>Math.max(360,width())},scrollHeight:{get:()=>Math.max(250,width()*2/3)},scrollLeft:{get:()=>left,set:v=>left=Math.max(0,Math.min(width()-360,v))},scrollTop:{get:()=>top,set:v=>top=Math.max(0,Math.min(width()*2/3-250,v))}});
  pane.getBoundingClientRect=()=>({left:0,top:i*260,width:360,height:250,right:360,bottom:i*260+250});
  surface.getBoundingClientRect=()=>({left:-left,top:i*260-top,width:width(),height:width()*2/3});
  $(i?'difference':'original').parentElement.getBoundingClientRect=()=>({left:0,top:i*260,width:360,height:240});
 }
 for(const file of ['puzzles.js','photo-puzzles.js','game-core.js'])w.eval(read(file));
 const clean=w.JjudaGame.cleanProgress;w.JjudaGame.cleanProgress=(raw,puzzles)=>({...clean(raw,puzzles),current:48});w.eval(read('app.js'));
 for(const im of d.querySelectorAll('img'))if(im.onload)im.onload();$('start').click();
 const round=()=>{const s=JSON.parse(w.localStorage.getItem('jjuda-spot-six-v1'));return s.rounds[w.JJUDA_PUZZLES[s.current].id];};
 function pointer(target,type,id,x,y){const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y});Object.defineProperties(e,{pointerId:{value:id},pointerType:{value:'touch'}});target.dispatchEvent(e);return e;}
 const normal=$('original').parentElement,initial=round();
 pointer(normal,'pointerdown',1,100,100);pointer(normal,'pointerdown',2,200,100);assert($('zoom-dialog').open,'pinching a normal picture opens paired comparison');
 const initialWidth=width();pointer(panes[0],'pointermove',2,300,100);assert(width()>initialWidth*1.9);assert.equal(surfaces[0].style.width,surfaces[1].style.width);
 pointer(panes[0],'pointerup',2,300,100);pointer(panes[0],'pointerup',1,100,100);normal.dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:100,clientY:100}));assert.equal(round().hearts,initial.hearts);assert.equal($('found-count').textContent,'0','pinch end never guesses an answer');
 now+=500;const beforePan=panes[0].scrollLeft;pointer(surfaces[0],'pointerdown',3,200,150);pointer(panes[0],'pointermove',3,140,100);pointer(panes[0],'pointerup',3,140,100);assert(panes[0].scrollLeft>beforePan);assert.equal(panes[0].scrollLeft,panes[1].scrollLeft);assert.equal(panes[0].scrollTop,panes[1].scrollTop);
 panes[0].scrollLeft=100;panes[0].dispatchEvent(new w.Event('scroll'));assert.equal(panes[1].scrollLeft,100);panes[0].scrollLeft=150;panes[0].dispatchEvent(new w.Event('scroll'));assert.equal(panes[1].scrollLeft,150,'rapid scrolls stay synchronized before the next frame');
 panes[1].scrollTop=70;panes[1].dispatchEvent(new w.Event('scroll'));assert.equal(panes[0].scrollTop,70,'either picture controls both');
 const beforeWheel=width(),wheel=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-25,clientX:180,clientY:400});surfaces[1].dispatchEvent(wheel);assert(wheel.defaultPrevented);assert(width()>beforeWheel);assert.equal(surfaces[0].style.width,surfaces[1].style.width);
 pointer(surfaces[1],'pointerdown',4,100,400);pointer(surfaces[1],'pointerdown',5,200,400);pointer(panes[1],'pointermove',5,5000,400);assert(width()<=2550);pointer(panes[1],'pointercancel',4,100,400);pointer(panes[1],'pointercancel',5,5000,400);
 now+=500;const spot=w.JJUDA_PUZZLES[48].spots[0],rect=surfaces[1].getBoundingClientRect(),x=rect.left+rect.width*spot.x/100,y=rect.top+rect.height*spot.y/100;
 pointer(surfaces[1],'pointerdown',6,x,y);pointer(surfaces[1],'pointerup',6,x,y);surfaces[1].dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));assert.equal($('found-count').textContent,'1','normal taps still find the correct spot after zooming');assert.equal(charges,0,'zoom and pan do not buy a hint');
 $('close-zoom').click();now+=500;pointer(normal,'pointerdown',7,100,200);pointer(normal,'pointermove',7,100,150);pointer(normal,'pointerup',7,100,150);assert(pageScroll>0,'one-finger scrolling remains available outside enlarged comparison');
 console.log('PASS: either photo pinches and pans both together; normal-view entry, trackpad zoom, rapid scroll synchronization, gesture cancellation, no accidental guesses or charges, normal answers and page scrolling.');
}finally{w.close();}
