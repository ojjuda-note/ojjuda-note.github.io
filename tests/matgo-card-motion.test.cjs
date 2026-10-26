const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../games/matgo.html'),'utf8');
const part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const dom=new JSDOM('<div class="zone me"><div class="cap"></div><div class="cap"></div><div class="cap"></div><div class="cap"></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,animations=[],sounds=[],timers=[];
 w.CW=40;w.CH=60;w.ME=0;w.game={caps:[[{id:1,k:'pi'},{id:2,k:'pi'}],[]]};w.Sound={play:(...args)=>sounds.push(args)};
 w.cardSVG=c=>'<svg data-face="'+c.id+'"></svg>';w.backSVG='<svg data-back="true"></svg>';
 w.sleep=async()=>{};w.setTimeout=(fn,delay)=>timers.push({fn,delay});
 w.Element.prototype.animate=function(frames,options){let complete;const finished=new Promise(resolve=>{complete=resolve;});const entry={node:this,frames,options,finish:()=>{entry.ended=true;complete();},ended:false};animations.push(entry);return {finished};};
 w.Element.prototype.getBoundingClientRect=function(){return {left:10,top:30,x:10,y:30,width:40,height:60};};
 w.eval(part('function flyEl(', 'function banner('));
 return {dom,w,animations,sounds,timers};
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
  let renders=0,resolved=false;w.render=()=>renders++;w.throwCard=()=>new Promise(resolve=>arrivals.push(resolve));
  w.eval(part('async function dealAnim(){','startRound();'));
  const task=w.dealAnim().then(()=>resolved=true);await tick();
  const targets=stack.querySelectorAll('.c');assert.equal(arrivals.length,2);
  assert.equal(targets[0].style.visibility,'hidden');assert.equal(targets[1].style.visibility,'hidden');assert.equal(resolved,false);
  arrivals[0]();await tick();assert.equal(targets[0].style.visibility,'','only a landed card is revealed');assert.equal(targets[1].style.visibility,'hidden','the next card waits for its own arrival');assert.equal(renders,0);
  arrivals[1]();await task;assert.equal(targets[1].style.visibility,'');assert.equal(renders,1,'the full board updates after every deal has arrived');
 }finally{dealt.dom.window.close();}
 console.log('PASS: delayed flights, synchronized flip faces, transform-only movement, staggered capture and individual deal completion');
})().catch(error=>{console.error(error);process.exitCode=1;});
