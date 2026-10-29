const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../games/matgo.html'),'utf8');
const part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({images=false}={}){
 const dom=new JSDOM('<div class="zone me"><div class="cap"></div><div class="cap"></div><div class="cap"></div><div class="cap"></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,animations=[],sounds=[],timers=[],decodes=[];
 const style=w.document.createElement('style');style.textContent=fs.readFileSync(path.join(__dirname,'../games/matgo-shared.css'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../games/matgo-online.css'),'utf8');w.document.head.append(style);
 w.CW=40;w.CH=60;w.ME=0;w.game={caps:[[{id:1,k:'pi'},{id:2,k:'pi'}],[]]};w.Sound={play:(...args)=>sounds.push(args)};
 w.cardSVG=c=>'<svg data-face="'+c.id+'" aria-label="검사 패">'+(images?'<image href="/card-'+c.id+'.webp"/>':'')+'</svg>';w.backSVG='<svg data-back="true"></svg>';
 w.HTMLImageElement.prototype.decode=function(){return new Promise((resolve,reject)=>decodes.push({image:this,fail:reject,finish:()=>{Object.defineProperties(this,{naturalWidth:{value:120},naturalHeight:{value:180}});resolve();}}));};
 w.HTMLCanvasElement.prototype.getContext=function(){return {fillRect(){},drawImage:image=>this.dataset.painted=image.getAttribute('src')};};
 w.eval(fs.readFileSync(path.join(__dirname,'../games/matgo-flight-art.mjs'),'utf8').replace('export function','function'));
 w.flightArt=w.createFlightArt({cardSVG:w.cardSVG,backSVG:w.backSVG});
 w.sleep=async()=>{};w.setTimeout=(fn,delay)=>timers.push({fn,delay});
 w.Element.prototype.animate=function(frames,options){let complete;const finished=new Promise(resolve=>{complete=resolve;});const entry={node:this,frames,options,finish:()=>{entry.ended=true;complete();},ended:false};animations.push(entry);return {finished,cancel(){complete();}};};
 w.Element.prototype.getBoundingClientRect=function(){return {left:10,top:30,x:10,y:30,width:40,height:60};};
 w.eval(part('function flyEl(', 'function banner('));
 return {dom,w,animations,sounds,timers,decodes};
}
(async()=>{
 for(const back of [false,true]){
  const f=fixture();try{
   let resolved=false;
   const task=f.w.throwCard({id:1},{x:10,y:20,w:58,h:87},{x:90,y:120,rot:5},{back,dur:420}).then(()=>resolved=true);
   await tick();
   const flight=f.animations.find(a=>a.node.classList.contains('fly'));
   assert.ok(flight,'a flight starts');
   assert.equal(resolved,false,'a slow/delayed animation must not end when its nominal timer expires');
   assert.ok(flight.node.isConnected,'the moving card remains mounted until its animation completes');
   assert.equal(f.w.getComputedStyle(flight.node).opacity,'1','a moving solo card stays opaque');
   assert.equal(f.w.getComputedStyle(flight.node).backgroundColor,'rgba(0, 0, 0, 0)','no white placeholder covers a missing face');
   assert.ok(f.animations.every(a=>a.frames.every(k=>!('opacity' in k)||k.opacity===1)),'flips swap faces without fading either image');
   assert.ok(flight.frames.every(k=>!('width' in k)&&!('height' in k)),'movement does not trigger per-frame size layout');
   if(back){assert.ok(flight.node.querySelector('[data-face="1"]'),'the front artwork is mounted before the flip begins');assert.ok(f.animations.every(a=>a.options.easing===flight.options.easing),'both faces and the flight use the same eased timeline');assert.equal(f.timers.length,0,'flip timing uses the animation timeline, not an independent timeout');}
   assert.equal(f.sounds.some(s=>s[0]==='land'),false);
   flight.finish();await task;
   assert.equal(flight.node.isConnected,false);assert.equal(f.sounds.at(-1)[0],'land');
  }finally{f.dom.window.close();}
 }
 const f=fixture();try{
  const stack=f.w.document.createElement('div');stack.className='stack';stack.innerHTML='<div class="c" data-id="1"></div><div class="c" data-id="2"></div>';f.w.document.body.append(stack);
  let resolved=false;const task=f.w.collect([{id:1,k:'pi'},{id:2,k:'pi'}],0).then(()=>resolved=true);await tick();
  assert.equal(resolved,false,'capture waits for actual completion of every staggered flight');
  const flights=f.animations.filter(a=>a.node.classList.contains('fly'));assert.equal(flights.length,2);
  flights[0].finish();await tick();assert.ok(flights[0].node.isConnected,'landed cards remain visible until the capture is committed');assert.equal(resolved,false);assert.ok(flights[1].node.isConnected);
  flights[1].finish();await task;assert.ok(flights.every(a=>!a.node.isConnected));
 }finally{f.dom.window.close();}
 const dealt=fixture();try{
  const w=dealt.w,stack=w.document.createElement('div'),cards=[{id:1},{id:2}],arrivals=[];
  stack.className='stack';stack.innerHTML='<div class="c" data-id="1"></div><div class="c" data-id="2"></div>';w.document.body.append(stack);
  w.document.body.insertAdjacentHTML('beforeend','<div class="deck"><div class="back"></div></div>');
  w.$=selector=>w.document.querySelector(selector);w.game.floor=[cards];w.stackEls=new Map([[cards,stack]]);w.cardScreenPos=()=>({x:80,y:90,rot:0});
  w.document.body.insertAdjacentHTML('beforeend','<div class="floor"><div id="fl"></div></div>');w.$('#fl').append(stack);
  const frames=[];w.requestAnimationFrame=fn=>frames.push(fn);w.ui={dealing:true,chooseStacks:null};w.dealingFloorCards=new Set();w.fitFloor=()=>{};w.ensureSlot=()=>{};w.slotPos=()=>({x:80,y:90});w.cardXform=()=>({dx:0,dy:0,rot:0});
  w.eval(part('function cardEl(', 'function mount('));w.eval(part('function syncCards(', 'function showCaptured('));
  w.eval('window.renderFloor=function(){'+part('  // 바닥\n','  // 손패\n')+'};');
  let renders=0,resolved=false;w.render=()=>renders++;w.throwCard=()=>new Promise(resolve=>arrivals.push(resolve));
  w.eval(part('async function dealAnim(){','startRound();'));
  let decode;w.flightArt.prepare=()=>new Promise(resolve=>decode=resolve);
  const task=w.dealAnim().then(()=>resolved=true);await tick();
  const targets=stack.querySelectorAll('.c');assert.equal(arrivals.length,0,'dealing waits for every face to decode');
  decode(true);await tick();assert.equal(arrivals.length,0,'decoded faces still wait for the entrance layout');
  frames.shift()();await tick();assert.equal(arrivals.length,0);
  frames.shift()();await tick();assert.equal(arrivals.length,2);
  assert.equal(targets[0].style.visibility,'hidden');assert.equal(targets[1].style.visibility,'hidden');assert.equal(resolved,false);
  w.renderFloor();assert.equal(targets[0].style.visibility,'hidden','entrance resize must not reveal a card that is still flying');assert.equal(targets[1].style.visibility,'hidden','waiting cards stay hidden across a real floor render');
  arrivals[0]();await tick();assert.equal(targets[0].style.visibility,'','only a landed card is revealed');assert.equal(targets[1].style.visibility,'hidden','the next card waits for its own arrival');assert.equal(renders,1,'the settled layout is rendered before dealing');
  w.renderFloor();assert.equal(targets[0].style.visibility,'');assert.equal(targets[1].style.visibility,'hidden','a later resize preserves each card arrival separately');
  arrivals[1]();await task;assert.equal(targets[1].style.visibility,'');assert.equal(renders,2,'the full board updates after every deal has arrived');
 }finally{dealt.dom.window.close();}
 const online=fixture();try{
  const w=online.w;w.matchMedia=()=>({matches:false});
  w.document.body.insertAdjacentHTML('beforeend','<div class="board"><div id="hand"><button data-card="1" style="opacity:.6"><svg data-face="1"></svg></button></div><div class="floor"><div class="fl"></div></div><p id="turn-label"></p></div>');
  w.eval(fs.readFileSync(path.join(__dirname,'../games/matgo-online-motion.mjs'),'utf8').replace(/^import .*;\n/,'').replace('export function createOnlineMotion','function createOnlineMotion'));
  const motion=w.createOnlineMotion({cardSVG:w.cardSVG,backSVG:w.backSVG,sound:w.Sound,onEvent:()=>{}});
  const c={id:1,k:'pi'},next={seat:0,deadline:new Date(Date.now()+30000).toISOString(),serverTime:Date.now()};
  const task=motion.play({},next,[{type:'played',p:0,card:c,stack:[c]}]);await tick();
  const flight=online.animations.find(a=>a.node.classList.contains('online-flying-card'));assert.ok(flight);
  assert.ok(flight.frames.every(k=>k.opacity===1),'online movement must never interpolate from a translucent card');
  assert.equal(w.getComputedStyle(flight.node).opacity,'1');
  assert.equal(w.getComputedStyle(flight.node).backgroundColor,'rgba(0, 0, 0, 0)','online flights do not substitute a blank white face');
  flight.finish();await task;assert.equal(flight.node.isConnected,false);
 }finally{online.dom.window.close();}
 for(const event of ['take','played']){
  const f=fixture();try{
   const w=f.w;w.matchMedia=()=>({matches:false});
   w.document.body.insertAdjacentHTML('beforeend','<div class="board"><div class="op-hand hand"><div class="c"><svg data-back="a"></svg></div><div class="c"><svg data-back="b"></svg></div></div><div class="floor"><div class="fl"><button class="stack"><span class="c"><svg data-face="1"></svg></span></button></div><div class="deck"><svg></svg></div></div><div class="caps-own">'+Array(4).fill('<div class="cap"><div class="cap-cards"></div></div>').join('')+'</div></div>');
   w.eval(fs.readFileSync(path.join(__dirname,'../games/matgo-online-motion.mjs'),'utf8').replace(/^import .*;\n/,'').replace('export function createOnlineMotion','function createOnlineMotion'));
   const motion=w.createOnlineMotion({cardSVG:w.cardSVG,backSVG:w.backSVG,sound:w.Sound,onEvent(){}}),c={id:1,k:'pi'};
   const source=event==='take'?w.document.querySelector('.stack .c'):w.document.querySelector('.op-hand .c:last-child');
   const events=event==='take'?[{type:'take',p:0,cards:[c]}]:[{type:'played',p:1,card:{id:2,k:'pi'},stack:[]},{type:'flip',p:1,card:{id:3,k:'pi'},stack:[]}];
   const task=motion.play({}, {seat:0,deadline:new Date(Date.now()+30000).toISOString(),serverTime:Date.now()},events);await tick();
   assert.equal(source.style.visibility,'hidden',event+': hide the whole card including its border and shadow');
   f.animations[0].finish();await tick();
   assert.equal(source.isConnected,false,event+': remove the old card wrapper after landing');
   if(event==='played'){
    assert.equal(w.document.querySelectorAll('.op-hand .c').length,1,'opponent hand has no empty shadow-only cards between movements');
    assert.ok([...w.document.querySelectorAll('.op-hand .c')].every(node=>node.querySelector('svg')));
    f.animations[1].finish();
   }
   await task;assert.equal(w.document.querySelectorAll('.online-flying-card').length,0);
  }finally{f.dom.window.close();}
 }
 for(const back of [false,true]){
  const f=fixture({images:true});try{
   const task=f.w.throwCard({id:1},{x:0,y:0},{x:80,y:90,rot:0},{back});await tick();
   assert.equal(f.animations.length,0,'no flight begins before its actual face image decodes');
   assert.equal(f.w.document.querySelector('.fly'),null,'a pending image must not produce a white moving rectangle');
   f.decodes[0].finish();await tick();
   const flight=f.animations.find(a=>a.node.classList.contains('fly'));
   assert.ok(flight.node.querySelector('canvas[data-painted="/card-1.webp"]'),'the moving face contains the decoded artwork, including before a flip');
   assert.equal(flight.node.querySelector('svg image'),null,'motion does not depend on a newly mounted SVG external image');
   flight.finish();await task;
  }finally{f.dom.window.close();}
 }
 for(const cancel of [false,true]){
  const f=fixture({images:true});try{
   const w=f.w;w.matchMedia=()=>({matches:false});
   w.document.body.insertAdjacentHTML('beforeend','<div class="board"><div id="hand"><button data-card="1"><svg data-face="1"></svg></button></div><div class="floor"><div class="fl"></div></div></div>');
   w.eval(fs.readFileSync(path.join(__dirname,'../games/matgo-online-motion.mjs'),'utf8').replace(/^import .*;\n/,'').replace('export function createOnlineMotion','function createOnlineMotion'));
   const motion=w.createOnlineMotion({cardSVG:w.cardSVG,backSVG:w.backSVG,sound:w.Sound,onEvent(){}}),source=w.document.querySelector('[data-card]');
   const task=motion.play({}, {seat:0,deadline:new Date(Date.now()+30000).toISOString(),serverTime:Date.now()},[{type:'played',p:0,card:{id:1},stack:[]}]);await tick();
   assert.equal(source.style.visibility,'','the original card remains visible while artwork prepares');assert.equal(f.animations.length,0);
   if(cancel)motion.cancel();f.decodes[0].finish();await tick();
   if(cancel){assert.equal(f.animations.length,0,'cancelling a pending decode must not start stale motion');}
   else{const flight=f.animations[0];assert.ok(flight.node.querySelector('canvas[data-painted="/card-1.webp"]'));flight.finish();}
   await task;
  }finally{f.dom.window.close();}
 }
 const failed=fixture({images:true});try{
  const f=failed,task=f.w.throwCard({id:1},{x:0,y:0},{x:80,y:90,rot:0});f.decodes[0].fail(Error('image unavailable'));await task;
  assert.equal(f.animations.length,0,'a failed artwork load skips motion instead of moving an empty card');
  const retry=f.w.throwCard({id:1},{x:0,y:0},{x:80,y:90,rot:0});assert.equal(f.decodes.length,2);f.decodes[1].finish();await tick();f.animations[0].finish();await retry;
 }finally{failed.dom.window.close();}
 console.log('PASS: decoded painted flight artwork, slow/failed image loads, retry, cancellation, opaque motion and actual completion');
})().catch(error=>{console.error(error);process.exitCode=1;});
