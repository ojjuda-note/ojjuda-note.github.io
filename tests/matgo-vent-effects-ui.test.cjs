const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),proof='/tmp/matgo-vent-proof';
(async()=>{
 const {CARDS}=await import('../games/matgo-engine.mjs');
 const {VENT_EFFECTS}=await import('../games/matgo-deck-tools.mjs');
 fs.mkdirSync(proof,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=user-gesture-required']});
 const errors=[];
 const initial={id:'12345678-1234-1234-1234-123456789012',round:1,version:1,status:'active',seat:0,names:['나','맞고 친구'],bots:[false,false],departed:[false,false],ready:[false,false],gold:[5000,5000],autoCount:0,eventCount:0,events:[],game:{hand:[CARDS[0],CARDS[8]],otherCount:2,floor:[{cards:[CARDS[1]]}],caps:[[],[]],deckCount:20,turn:0,go:[0,0],bomb:[0,0],shake:[0,0],ppukCount:[0,0],firstPpukGold:[0,0],over:false,prompt:{type:'play',p:0}}};
 async function screen({muted=false,reduced=false}={}){
  const context=await browser.newContext({viewport:{width:390,height:760},hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'});
  await context.addInitScript(({muted,room})=>{
   localStorage.setItem('ojjuda-matgo-sound',muted?'off':'on');window.fixtureRoom=room;window.payments=[];window.decline=false;window.slowPurchase=false;
   window.audioStarts=[];window.audioContexts=[];window.audioMetrics={peak:0,energy:0,count:0};
   const NativeAudio=window.AudioContext,connect=AudioNode.prototype.connect;
   window.AudioContext=class extends NativeAudio{constructor(...args){super(...args);this.probe=this.createAnalyser();this.probe.fftSize=2048;audioContexts.push(this);}};
   AudioNode.prototype.connect=function(target,...args){if(target===this.context.destination&&this.context.probe)connect.call(this,this.context.probe);return connect.call(this,target,...args);};
   for(const proto of [AudioBufferSourceNode.prototype,OscillatorNode.prototype]){const start=proto.start;proto.start=function(at){audioStarts.push({at,state:this.context.state});return start.apply(this,arguments);};}
   setInterval(()=>{for(const ctx of audioContexts){if(ctx.state!=='running')continue;const a=new Float32Array(ctx.probe.fftSize);ctx.probe.getFloatTimeDomainData(a);for(const v of a){audioMetrics.peak=Math.max(audioMetrics.peak,Math.abs(v));audioMetrics.energy+=v*v;audioMetrics.count++;}}},15);
   window.OjjudaMatgoAccess={check:async()=>{},allowed:()=>true,subscribe:()=>{},getClient:()=>({auth:{getSession:async()=>({})},functions:{invoke:async(_,{body})=>{
    if(body.action==='vent'){
     if(slowPurchase)await new Promise(r=>setTimeout(r,500));
     if(decline)return{data:{error:'insufficient_zzu'}};
     payments.push(body);return{data:{ok:true,gold:5000,coins:50-payments.length,purchase:{effect:body.effect,price:1}}};
    }
    return{data:body.action==='status'?{ok:true,gold:5000,coins:50,free_left:2,online_room:room.id}:{ok:true,room:{...fixtureRoom,deadline:new Date(Date.now()+15000).toISOString(),serverTime:Date.now()}}};
   }}})};
  },{muted,room:initial});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url()),file=path.join(root,decodeURIComponent(url.pathname));
   if(url.origin!=='https://fixture.test'||['/config.js','/matgo-access.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   if(url.pathname==='/games/matgo-online.mjs')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8')+'\nwindow.ventTest={vent,renderRoom};'});
   return route.fulfill({path:file,contentType:/\.(mjs|js)$/.test(file)?'text/javascript':url.pathname.endsWith('.css')?'text/css':undefined});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/games/matgo-online.html');await page.locator('#matgo-vent').waitFor();
  return {context,page};
 }
 try{
  const {context,page}=await screen();
  assert.equal(await page.evaluate(()=>audioStarts.length),0,'no sound on page load');
  await page.evaluate(()=>{decline=true;slowPurchase=true;});
  await page.locator('#matgo-vent').tap();await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>audioStarts.length),0,'no sound before confirmed charge');
  await page.waitForFunction(()=>!document.querySelector('#matgo-vent').disabled);
  assert.equal(await page.locator('.vent-layer').count(),0);assert.equal(await page.evaluate(()=>audioStarts.length),0,'declined purchase stays silent');
  await page.evaluate(()=>{decline=false;slowPurchase=false;});
  const metrics=[];
  for(const effect of VENT_EFFECTS){
   await page.waitForFunction(()=>!document.querySelector('#matgo-vent').disabled);
   await page.evaluate(()=>{audioMetrics={peak:0,energy:0,count:0};audioStarts.length=0;});
   await page.locator('#matgo-vent').tap();await page.locator(`.vent-layer[data-effect=${effect.id}]`).waitFor();
   assert.equal(await page.locator('.vent-layer').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
   if(effect.id!=='lightning')assert.equal(await page.locator('.vent-weapon img').evaluate(el=>el.complete&&el.naturalWidth>=1000),true,'full-resolution artwork loaded');
   await page.waitForTimeout(effect.hits[0]+70);
   await page.screenshot({path:path.join(proof,effect.id+'.png')});
   await page.locator('.vent-layer').waitFor({state:'detached'});
   const m=await page.evaluate(()=>({...audioMetrics,voices:audioStarts.length,states:audioStarts.map(x=>x.state)}));
   assert.ok(m.peak>.015&&m.energy>.01,`${effect.id} must produce actual audible samples: ${JSON.stringify(m)}`);
   assert.ok(m.peak<1,`${effect.id} output is bounded without clipping`);assert.ok(m.states.every(s=>s==='running'));
   metrics.push({effect:effect.id,peak:m.peak,rms:Math.sqrt(m.energy/m.count),voices:m.voices});
  }
  assert.equal(await page.evaluate(()=>payments.length),5);assert.ok(new Set(metrics.map(m=>m.voices)).size>=4,'effects have distinct sound layers');
  // Existing mute button cancels all scheduled sounds immediately and keeps future effects silent.
  await page.waitForFunction(()=>!document.querySelector('#matgo-vent').disabled);await page.locator('#matgo-vent').tap();await page.locator('.vent-layer').waitFor();
  await page.locator('#menu').click();await page.locator('#sound').tap();await page.waitForTimeout(100);
  await page.evaluate(()=>{audioMetrics={peak:0,energy:0,count:0};audioStarts.length=0;});await page.waitForTimeout(850);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ojjuda-matgo-sound')),'off');assert.equal(await page.evaluate(()=>audioMetrics.peak),0,'mute cancels second shot and tails');
  await page.locator('.vent-layer').waitFor({state:'detached'});await page.waitForFunction(()=>!document.querySelector('#matgo-vent').disabled);await page.locator('#matgo-vent').tap();await page.locator('.vent-layer').waitFor();
  assert.equal(await page.evaluate(()=>audioStarts.length),0,'muted effect schedules no audio');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.locator('.vent-layer').count(),0);
  fs.writeFileSync(path.join(proof,'sound-metrics.json'),JSON.stringify(metrics,null,2));await context.close();
  const reduced=await screen({muted:true,reduced:true});await reduced.page.setViewportSize({width:320,height:568});await reduced.page.locator('#matgo-vent').tap();await reduced.page.locator('.vent-layer').waitFor();
  assert.equal(await reduced.page.locator('.vent-weapon').isVisible(),false);assert.equal(await reduced.page.locator('.vent-word').isVisible(),true);assert.equal(await reduced.page.evaluate(()=>audioStarts.length),0);
  assert.equal(await reduced.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await reduced.page.screenshot({path:path.join(proof,'reduced-motion.png')});
  await reduced.context.close();assert.deepEqual(errors,[]);console.log('PASS: 5 high-resolution effects; real Web Audio energy, distinct profiles, gesture unlock, charge-before-play, mute, visibility and reduced motion');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
