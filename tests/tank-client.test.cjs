// DOM and two-session integration test; no browser or preview server is required.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{fixture,ids}=require('./tank-online-fixture.cjs');
const root=path.resolve(__dirname,'..');
const wait=async fn=>{for(let i=0;i<600;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI condition timed out');};
(async()=>{
 const f=await fixture(),windows=[];
 async function client(actor,expectSaved=false,viewport={width:1536,height:626},joinCode='',savedSpeed=null){
  const html=fs.readFileSync(path.join(root,'games/tank/index.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://ojjuda.kr/games/tank/index.html',runScripts:'outside-only',pretendToBeVisual:true});windows.push(dom.window);
  const w=dom.window,context=dom.getInternalVMContext(),draw=()=>{};
  if(savedSpeed!==null)w.localStorage.setItem('ojjuda.tank.solo.speed',savedSpeed);
  w.scheduledDelays=[];const nativeTimeout=w.setTimeout.bind(w);
  w.setTimeout=(fn,delay,...args)=>{w.scheduledDelays.push(delay);return nativeTimeout(fn,delay,...args);};
  w.orientationLocks=[];w.orientationUnlocks=0;w.fullscreenCalls=0;
  Object.defineProperty(w.screen,'orientation',{value:{lock:async value=>{w.orientationLocks.push(value);},unlock:()=>{w.orientationUnlocks++;}}});
  w.document.documentElement.requestFullscreen=async()=>{w.fullscreenCalls++;};
  w.radialGradients=[];w.canvasScales=[];w.canvasTranslations=[];
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({translate:(...args)=>w.canvasTranslations.push(args),scale:(...args)=>w.canvasScales.push(args),createImageData:(x,y)=>({data:new Uint8ClampedArray(x*y*4)}),createLinearGradient:()=>({addColorStop:draw}),createRadialGradient:(...args)=>{w.radialGradients.push(args);return {addColorStop:draw};},measureText:()=>({width:20})},{get:(o,k)=>o[k]||draw});
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:this.id==='prot'?96:this.id==='power'?254:viewport.width,height:this.id==='prot'?56:this.id==='power'?28:viewport.height,top:['left','right'].includes(this.id)?viewport.height-86:0,bottom:this.id==='wind'?50:viewport.height,left:0,right:viewport.width};};
  w.matchMedia=()=>({matches:false,addEventListener:draw});w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=draw;w.confirm=()=>true;
  const parent={postMessage(m){
   if(m.type==='ready')queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{origin:'https://ojjuda.kr',source:parent,data:{source:'ojjuda-world',type:'tank-init',available:true,joinCode}})));
   if(m.type==='request')void f.call(actor,m.body).then(result=>w.dispatchEvent(new w.MessageEvent('message',{origin:'https://ojjuda.kr',source:parent,data:{source:'ojjuda-world',type:'tank-response',replyTo:m.requestId,result}})));
  }};
  Object.defineProperty(w,'parent',{value:parent});
  for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],context);
  const engine=new vm.SourceTextModule(fs.readFileSync(path.join(root,'games/tank/engine.mjs'),'utf8'),{context});
  const online=new vm.SourceTextModule(fs.readFileSync(path.join(root,'games/tank/online.mjs'),'utf8'),{context});
  await engine.link(()=>{throw Error('unexpected import');});await online.link(()=>engine);await online.evaluate();
  await wait(()=>expectSaved?(!w.document.getElementById('resumeHome').hidden&&!w.document.getElementById('resumeMatch').disabled):!w.document.getElementById('startSolo').disabled);
  return w;
 }
 try{
  const viewport={width:1536,height:626},a=await client(ids[0],false,viewport,'','8'),get=(w,id)=>w.document.getElementById(id);
  const weaponCard=(w,id)=>get(w,'wgrid').querySelector('[data-weapon="'+id+'"]');
  assert.equal(get(a,'soloMode').getAttribute('aria-pressed'),'true');
  assert.equal(get(a,'lobbyHome').hidden,true);
  get(a,'onlineMode').click();
  get(a,'createRoom').dispatchEvent(new a.Event('submit',{cancelable:true}));
  await wait(()=>!get(a,'waitingRoom').hidden&&get(a,'waitingCode').textContent.length===8);
  const b=await client(ids[1],false,{width:390,height:844},get(a,'waitingCode').textContent);
  await wait(()=>get(b,'waitingNames').children.length===2);
  await wait(()=>get(a,'waitingNames').children.length===2);
  assert.equal(get(b,'startMatch').hidden,true);
  get(a,'startMatch').click();
  await wait(()=>a.document.body.classList.contains('in-match'));
  await wait(()=>b.document.body.classList.contains('in-match'));
  a.TankOnline.tick();b.TankOnline.tick();
  assert.equal(get(a,'soloSpeed').hidden,true,'online play has no speed control');
  assert.equal(get(a,'cv').style.width,'1536px');assert.equal(get(a,'cv').style.height,'626px');
  assert.equal(get(b,'cv').style.width,'390px');assert.equal(get(b,'cv').style.height,'844px');
  assert.ok(a.eval('VW>800'));assert.ok(b.eval('VW<800&&H<=MH+.001'));
  assert.equal(get(b,'rotate'),null,'portrait play has no blocking rotate-phone overlay');
  assert.equal(a.eval('W'),1600);assert.equal(b.eval('W'),1600,'both sessions use the smaller battlefield');
  a.eval('draw()');assert.equal(a.eval('TS'),a.eval('tankRenderEngine.view().TS'));
  assert.ok(a.canvasScales.some(([x,y])=>x===.5175&&y===.5175),'tank rendering uses the enlarged physics scale');
  assert.deepEqual(Array.from(a.eval('WEAPONS.map(w=>w.r)')),[28.8,50.4,16.8,28.8,28.8,28.8,28.8,120,200,28.8,57.6,21.6,28.8,86.4,16.8],'the picker metadata agrees with enlarged weapon radii');
  assert.equal(a.orientationLocks.length,0);assert.equal(a.orientationUnlocks,1);assert.equal(a.fullscreenCalls,1);
  const beforeResize=a.eval('JSON.stringify(tankRenderEngine.snapshot())');
  viewport.width=844;viewport.height=390;a.dispatchEvent(new a.Event('resize'));a.TankOnline.tick();
  assert.equal(get(a,'cv').style.width,'844px');assert.equal(get(a,'cv').style.height,'390px');
  assert.ok(Math.abs(a.eval('VW*scale')-844)<1e-6);assert.ok(Math.abs(a.eval('H*scale')-390)<1e-6);
  // Resizing changes only the camera viewport, not battle positions or terrain.
  const saved=JSON.parse(beforeResize),resized=JSON.parse(a.eval('JSON.stringify(tankRenderEngine.snapshot())'));
  assert.deepEqual(saved.terrain,resized.terrain);assert.deepEqual(saved.tanks.map(t=>[t.x,t.y,t.hp]),resized.tanks.map(t=>[t.x,t.y,t.hp]));
  assert.equal(a.eval('tankRenderEngine.view().VW'),800);assert.equal(a.eval('tankRenderEngine.view().H'),450);
  a.eval('setAngle(43.75);setPower(68)');
  const beforeRotation=a.eval('JSON.stringify(tankRenderEngine.snapshot())');
  for(const [width,height] of [[320,568],[360,800],[430,932],[844,390]]){
   viewport.width=width;viewport.height=height;a.dispatchEvent(new a.Event('resize'));a.TankOnline.tick();
   assert.equal(get(a,'cv').style.width,width+'px');assert.equal(get(a,'cv').style.height,height+'px');
   assert.ok(a.eval('H<=MH+.001'),'tall displays keep tanks at a usable scale');
   assert.equal(a.eval('JSON.stringify(tankRenderEngine.snapshot())'),beforeRotation,'rotation preserves terrain, tanks, wind, turn and selected angle/power');
   assert.equal(a.TankOnline.canAim(),true);
  }
  a.eval('setAngle(90);setPower(5)');
  assert.equal(get(a,'fire').disabled,false);assert.equal(get(b,'fire').disabled,true);
  // Canvas drags move both camera axes without changing aim or battle state.
  const pointer=(type,x,y,id=1,target='cv',win=a,{isPrimary=true,button=0}={})=>{
   const event=new win.MouseEvent(type,{clientX:x,clientY:y,bubbles:true,cancelable:true,button,detail:type==='click'?1:0});
   Object.defineProperties(event,{pointerId:{value:id},isPrimary:{value:isPrimary}});get(win,target).dispatchEvent(event);
  };
  a.eval('camX=200;camY=100;camManual=false');
  const beforePan=a.eval('JSON.stringify(tankRenderEngine.snapshot())'),cameraScale=a.eval('scale');
  pointer('pointerdown',300,200);a.eval('updateCam()');
  assert.equal(a.eval('camY'),100,'automatic following pauses while a finger is down');
  pointer('pointermove',300,140);pointer('pointerup',300,140);
  assert.ok(Math.abs(a.eval('camY')-(100+60/cameraScale))<1e-6,'vertical dragging moves the camera');
  assert.equal(a.eval('camX'),200);assert.equal(a.TankView.input().angle,90,'a vertical drag must not change the angle');
  const afterVertical=a.eval('camY');a.eval('updateCam()');
  assert.equal(a.eval('camY'),afterVertical,'manual camera position stays put');
  pointer('pointerdown',300,200);pointer('pointermove',330,230);pointer('pointerup',330,230);
  assert.ok(Math.abs(a.eval('camX')-(200-30/cameraScale))<1e-6);
  assert.ok(Math.abs(a.eval('camY')-(afterVertical-30/cameraScale))<1e-6,'diagonal dragging moves both axes');
  pointer('pointerdown',300,200);pointer('pointermove',-10000,-10000);pointer('pointerup',-10000,-10000);
  assert.equal(a.eval('camX'),a.eval('Math.max(0,W-VW)'));assert.equal(a.eval('camY'),a.eval('Math.max(0,MH-PL+40)'));
  pointer('pointerdown',300,200);pointer('pointermove',10000,10000);pointer('pointerup',10000,10000);
  assert.equal(a.eval('camX'),0);assert.equal(a.eval('camY'),0,'dragging stays inside the camera limits');
  pointer('pointerdown',300,200);pointer('pointerdown',100,100,2);pointer('pointermove',-300,-200,2);pointer('pointerup',-300,-200,2);
  assert.equal(a.eval('pan.id'),1,'another finger must not take over the drag');assert.equal(a.eval('camY'),0);
  pointer('pointercancel',300,200);pointer('pointermove',300,100);
  assert.equal(a.eval('pan'),null);assert.equal(a.eval('camY'),0);assert.equal(a.TankView.input().angle,90);
  pointer('pointerdown',300,200);pointer('lostpointercapture',300,200);pointer('pointerup',300,200);
  assert.equal(a.eval('pan'),null);assert.equal(a.TankView.input().angle,90,'a cancelled gesture must not change the angle');
  assert.equal(a.eval('JSON.stringify(tankRenderEngine.snapshot())'),beforePan,'panning must not change game physics');
  pointer('pointerdown',300,200);pointer('pointerup',300,200);
  assert.equal(a.TankView.input().angle,90,'a battlefield tap does not change the angle');
  // Direct gauges set exact values and ignore other fingers, cancellations and spectators.
  const key=(target,value,win=a)=>get(win,target).dispatchEvent(new win.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
  pointer('pointerdown',83,18,11,'prot');assert.equal(a.TankView.input().angle,45);
  pointer('pointermove',13,18,12,'prot');pointer('pointercancel',13,18,12,'prot');
  assert.equal(a.TankView.input().angle,45,'another finger cannot take over angle adjustment');
  pointer('pointermove',13,18,11,'prot');assert.equal(a.TankView.input().angle,135);
  pointer('pointerup',13,18,11,'prot');get(a,'angleRight').click();assert.equal(a.TankView.input().angle,134.5);
  assert.equal(get(a,'angv').textContent,'각도 134.5°');assert.equal(get(a,'prot').getAttribute('aria-valuenow'),'134.5');
  get(a,'angleLeft').click();assert.equal(a.TankView.input().angle,135);
  pointer('pointerdown',0,53,11,'prot');pointer('lostpointercapture',0,53,11,'prot');pointer('pointermove',96,53,11,'prot');
  assert.equal(a.TankView.input().angle,180);assert.equal(get(a,'angleLeft').disabled,true);
  key('prot','Home');assert.equal(a.TankView.input().angle,0);assert.equal(get(a,'angleRight').disabled,true);
  key('prot','ArrowRight');assert.equal(a.TankView.input().angle,0);
  key('prot','ArrowLeft');assert.equal(a.TankView.input().angle,.5);assert.equal(a.eval('moveDir'),0,'slider keys must not move the tank');
  key('prot','End');key('prot','PageDown');assert.equal(a.TankView.input().angle,170);
  assert.equal(get(a,'prot').getAttribute('aria-valuenow'),'170');
  pointer('pointerdown',0,14,21,'power');pointer('pointermove',127,14,21,'power');
  assert.equal(a.TankView.input().power,53);
  pointer('pointermove',254,14,22,'power');pointer('pointerdown',48,3,22,'prot');get(a,'fire').click();
  assert.equal(a.TankView.input().power,53);assert.equal(a.TankView.input().angle,170);assert.equal(a.eval('shotNo'),0,'a second finger cannot fire during a slider drag');
  pointer('pointercancel',127,14,21,'power');pointer('pointermove',254,14,21,'power');assert.equal(a.TankView.input().power,53);
  pointer('pointerdown',400,14,21,'power');pointer('pointerup',400,14,21,'power');assert.equal(a.TankView.input().power,100);
  pointer('pointerdown',-20,14,21,'power');pointer('pointerup',-20,14,21,'power');assert.equal(a.TankView.input().power,5);
  key('power','End');key('power','PageDown');key('power','ArrowLeft');assert.equal(a.TankView.input().power,89);
  assert.equal(get(a,'power').getAttribute('aria-valuenow'),'89');assert.equal(get(a,'powv').textContent,'힘 89');
  // Advance just the control timers synchronously; network polling keeps its real clock.
  const realSetTimeout=a.setTimeout,realClearTimeout=a.clearTimeout,jobs=new Map();let clock=0,timerId=100000;
  a.setTimeout=(fn,delay)=>{const id=++timerId;jobs.set(id,{fn,at:clock+delay});return id;};
  a.clearTimeout=id=>{if(jobs.has(id))jobs.delete(id);else realClearTimeout.call(a,id);};
  const advance=ms=>{
   const until=clock+ms;
   for(;;){const next=[...jobs].filter(([,job])=>job.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
    const [id,job]=next;clock=job.at;jobs.delete(id);job.fn();}
   clock=until;
  };
  try{
   a.eval('setAngle(90);setPower(50)');get(a,'angleLeft').click();
   assert.equal(a.TankView.input().angle,90.5);assert.ok(a.eval('Math.cos(tanks[turn].ang*Math.PI/180)<0'),'left button tilts the barrel left');
   get(a,'angleRight').click();get(a,'angleRight').click();assert.equal(a.TankView.input().angle,89.5);
   assert.ok(a.eval('Math.cos(tanks[turn].ang*Math.PI/180)>0'),'right button tilts the barrel right');
   a.eval('setAngle(89.75)');get(a,'angleLeft').click();assert.equal(a.TankView.input().angle,90.25,'a half-degree step preserves a remembered quarter-degree offset');
   a.eval('setAngle(90)');pointer('pointerdown',10,10,61,'angleLeft');assert.equal(a.TankView.input().angle,90.5);
   advance(299);assert.equal(a.TankView.input().angle,90.5,'a tap applies one step immediately');
   advance(181);assert.equal(a.TankView.input().angle,92.5,'holding repeats after the initial delay');
   pointer('pointerdown',10,10,62,'angleRight');pointer('pointerup',10,10,62,'angleRight');
   pointer('pointerdown',10,10,62,'powerUp');pointer('pointerdown',48,3,62,'prot');pointer('pointerdown',254,14,62,'power');get(a,'fire').click();
   advance(60);assert.equal(a.TankView.input().angle,93);assert.equal(a.TankView.input().power,50);assert.equal(a.eval('shotNo'),0,'a second finger cannot replace the hold or fire');
   pointer('pointerup',400,200,61,'cv');advance(600);pointer('click',10,10,61,'angleLeft');
   assert.equal(a.TankView.input().angle,93,'releasing outside stops and the following click adds no extra step');
   pointer('pointerdown',10,10,63,'angleRight');pointer('pointerup',10,10,63,'angleRight');pointer('click',10,10,63,'angleRight');
   assert.equal(a.TankView.input().angle,92.5,'a complete pointer tap steps only once');
   pointer('pointerdown',10,10,64,'angleLeft',a,{isPrimary:false});advance(600);
   assert.equal(a.TankView.input().angle,92.5,'secondary pointers cannot begin a hold');
   for(const cancel of [
    ()=>pointer('pointercancel',10,10,65,'powerUp'),
    ()=>pointer('lostpointercapture',10,10,65,'powerUp'),
    ()=>a.dispatchEvent(new a.Event('blur')),
    ()=>a.dispatchEvent(new a.Event('resize')),
    ()=>a.TankView.resetInput(),
    ()=>{get(a,'wpn').click();get(a,'pClose').click();},
    ()=>{Object.defineProperty(a.document,'hidden',{value:true,configurable:true});a.document.dispatchEvent(new a.Event('visibilitychange'));delete a.document.hidden;},
    ()=>{a.eval("state='watch';syncUI()");a.TankOnline.tick();}
   ]){
    a.eval('setPower(50)');pointer('pointerdown',10,10,65,'powerUp');advance(420);
    assert.equal(a.TankView.input().power,54,'power increases by one per repeat');cancel();advance(600);
    assert.equal(a.TankView.input().power,54,'interrupted holds must stay stopped');
   }
   get(a,'powerDown').click();assert.equal(a.TankView.input().power,53);get(a,'powerUp').click();assert.equal(a.TankView.input().power,54);
   pointer('pointerdown',10,10,66,'powerDown');advance(360);pointer('pointerup',10,10,66,'powerDown');advance(600);
   assert.equal(a.TankView.input().power,51,'holding minus also repeats and stops on release');
   for(const [id,setup,field,limit] of [['angleLeft','setAngle(179)','angle',180],['angleRight','setAngle(1)','angle',0],['powerUp','setPower(98)','power',100],['powerDown','setPower(7)','power',5]]){
    a.eval(setup);pointer('pointerdown',10,10,67,id);advance(900);pointer('pointerup',10,10,67,id);pointer('click',10,10,67,id);
    assert.equal(a.TankView.input()[field],limit);assert.equal(get(a,id).disabled,true,'buttons stop at their limits');assert.equal(jobs.size,0,'limits do not leave repeat timers running');
   }
   a.eval('setAngle(90);setPower(50)');assert.equal(key('angleRight',' '),false,'custom keyboard holds suppress native click activation');advance(360);
   assert.equal(a.TankView.input().angle,88.5);
   get(a,'angleRight').dispatchEvent(new a.KeyboardEvent('keydown',{key:' ',repeat:true,bubbles:true,cancelable:true}));
   assert.equal(a.TankView.input().angle,88.5,'OS key repeats cannot add duplicate steps');
   get(a,'angleRight').dispatchEvent(new a.KeyboardEvent('keyup',{key:' ',bubbles:true,cancelable:true}));advance(600);
   assert.equal(a.TankView.input().angle,88.5);key('powerUp','Enter');advance(360);
   get(a,'powerUp').dispatchEvent(new a.Event('blur'));advance(600);assert.equal(a.TankView.input().power,53,'keyboard power holds stop when focus leaves');
   assert.equal(jobs.size,0);
  }finally{a.TankView.resetInput();a.setTimeout=realSetTimeout;a.clearTimeout=realClearTimeout;}
  const selected=a.TankView.input();
  for(let i=0;i<180;i++)a.TankOnline.tick();
  assert.equal(a.TankView.input().angle,selected.angle);assert.equal(a.TankView.input().power,selected.power,'chosen angle and power never sweep automatically');
  const watching=JSON.stringify(b.TankView.input());
  pointer('pointerdown',83,18,31,'prot',b);pointer('pointerdown',254,14,31,'power',b);get(b,'angleLeft').click();get(b,'powerUp').click();
  assert.equal(JSON.stringify(b.TankView.input()),watching,'spectators cannot edit the current player\'s aim');
  get(a,'wpn').click();const cards=get(a,'wgrid').children;assert.equal(cards.length,15);
  assert.deepEqual(Array.from(cards,c=>Number(c.dataset.weapon)),[0,1,2,14,4,6,7,10,11,3,5,9,12,13,8],'weapon cards sort by price while keeping their original weapon IDs');
  assert.match(weaponCard(a,14).textContent,/강철비.*무료/);assert.match(weaponCard(a,14).textContent,/10발.*10분의 1/);
  assert.match(cards[0].textContent,/무료/);assert.match(weaponCard(a,8).textContent,/5쭈\/발/);assert.match(weaponCard(a,10).textContent,/치료탄.*1쭈\/발/);assert.match(weaponCard(a,10).textContent,/땅은 파이지/);
  assert.match(weaponCard(a,12).textContent,/유도탄.*3쭈\/발/);assert.match(weaponCard(a,12).textContent,/85%/);assert.match(weaponCard(a,13).textContent,/벙커버스터.*3쭈\/발/);assert.match(weaponCard(a,13).textContent,/수직 낙하/);
  const inPicker=JSON.stringify(a.TankView.input());pointer('pointerdown',48,3,41,'prot');pointer('pointerdown',254,14,41,'power');pointer('pointerdown',10,10,41,'angleLeft');get(a,'powerDown').click();
  assert.equal(JSON.stringify(a.TankView.input()),inPicker,'the weapon picker blocks hidden aim controls');
  weaponCard(a,12).click();key('prot','Home');get(a,'angleLeft').click();get(a,'angleLeft').click();get(a,'angleLeft').click();
  pointer('pointerdown',254*45/95,14,51,'power');pointer('pointerup',254*45/95,14,51,'power');
  assert.equal(a.TankView.input().angle,1.5);assert.equal(a.TankView.input().power,50);
  get(a,'fire').click();get(a,'fire').click();
  await wait(()=>get(a,'netCoins').textContent==='보유 97쭈');
  const fired=(await f.call(ids[0],{action:'mine'})).room;
  assert.equal(fired.event.command.angle,1.5);assert.equal(fired.event.command.power,50);assert.equal(fired.game.shotNo,1,'one click fires the exact half-degree angle and power without charging');
  assert.equal(get(a,'netTurn').textContent,'유도탄 비행 중');assert.equal(a.eval('shots[0].w.kind'),'homing');assert.equal(a.eval('shots[0].w.dmg'),34);a.eval('draw()');
  const onlineFrame=a.eval('tankRenderEngine.view().frame');a.TankOnline.tick();assert.equal(a.eval('tankRenderEngine.view().frame'),onlineFrame+1,'online playback stays at normal speed despite a saved solo x2 preference');
  const flightBeforeRotation=a.eval('JSON.stringify([tanks.map(t=>[t.x,t.y,t.hp]),shots.map(s=>[s.x,s.y,s.vx,s.vy]),shotNo])');
  viewport.width=390;viewport.height=844;a.dispatchEvent(new a.Event('resize'));a.eval('draw()');
  assert.equal(a.eval('JSON.stringify([tanks.map(t=>[t.x,t.y,t.hp]),shots.map(s=>[s.x,s.y,s.vx,s.vy]),shotNo])'),flightBeforeRotation,'rotation during flight does not move or restart a projectile');
  viewport.width=844;viewport.height=390;a.dispatchEvent(new a.Event('resize'));
  assert.equal(a.eval('camManual'),false,'firing resumes automatic camera following');
  a.eval('camY=MH-PL+40;updateCam()');assert.ok(a.eval('camY<MH-PL+40'),'the camera follows the shell vertically');
  pointer('pointerdown',300,200);pointer('pointermove',240,140);pointer('pointerup',240,140);
  const flightPan=a.eval('JSON.stringify([camX,camY])');a.eval('updateCam()');
  assert.equal(a.eval('JSON.stringify([camX,camY])'),flightPan,'manual panning also holds during flight');
  for(let i=0;i<8000;i++)a.TankOnline.tick();
  await wait(()=>get(b,'netTurn').textContent.includes('비행'));
  for(let i=0;i<8000;i++)b.TankOnline.tick();
  assert.equal(get(a,'fire').disabled,true);assert.equal(get(b,'fire').disabled,false);
  assert.equal(get(a,'prot').getAttribute('aria-disabled'),'true');assert.equal(get(a,'power').getAttribute('aria-disabled'),'true');
  assert.equal(get(b,'prot').getAttribute('aria-disabled'),'false');assert.equal(get(b,'power').getAttribute('aria-disabled'),'false');
  get(b,'angleLeft').click();assert.equal(b.TankView.input().angle,90.5,'portrait players can use the half-degree angle control');
  pointer('pointerdown',254*37/95,14,71,'power',b);pointer('pointerup',254*37/95,14,71,'power',b);
  assert.equal(b.TankView.input().power,42,'portrait players can set power');
  assert.equal(a.eval('tanks[0].hp'),b.eval('tanks[0].hp'));
  assert.equal(a.eval('tanks[1].hp'),b.eval('tanks[1].hp'));
  // Reopening a third session for the same member restores the saved match without another debit.
  const reconnected=await client(ids[0],true);
  assert.equal(reconnected.document.body.classList.contains('in-match'),false);
  assert.equal(get(reconnected,'newMatch').hidden,true,'an active online room cannot be silently abandoned');
  get(reconnected,'resumeMatch').click();
  await wait(()=>reconnected.document.body.classList.contains('in-match'));
  await wait(()=>reconnected.orientationUnlocks===1);
  assert.equal(reconnected.orientationLocks.length,0,'resuming also allows either orientation');
  assert.equal(get(reconnected,'netCoins').textContent,'보유 97쭈');
  let deathSounds=0;a.sfx=type=>{if(type==='boom')deathSounds++;};
  get(a,'surrender').click();
  await wait(()=>a.TankView.hasEffects());
  a.eval('draw()'); // Destruction bursts have no weapon metadata and must render safely.
  assert.equal(deathSounds,1);assert.equal(get(a,'over').classList.contains('hidden'),true,'show the destruction before the result');
  for(let i=0;i<70;i++)a.TankOnline.tick();
  assert.equal(a.TankView.hasEffects(),false);assert.equal(get(a,'over').classList.contains('hidden'),false);
  const solo=await client(ids[2]);
  assert.ok(get(solo,'menu').querySelector('.game-entry .ge-primary'));
  get(solo,'soloOpponents').value='1';get(solo,'startSolo').click();
  await wait(()=>solo.document.body.classList.contains('in-match'));
  solo.TankOnline.tick();assert.equal(solo.eval('tanks.length'),2);
  assert.equal(get(solo,'soloSpeed').hidden,false);assert.equal(get(solo,'soloSpeed').textContent,'속도 ×1');
  const beforeSpeed=solo.eval('JSON.stringify(tankRenderEngine.snapshot())');
  get(solo,'soloSpeed').click();assert.equal(get(solo,'soloSpeed').textContent,'속도 ×2');
  assert.equal(solo.localStorage.getItem('ojjuda.tank.solo.speed'),'2');
  assert.equal(solo.eval('JSON.stringify(tankRenderEngine.snapshot())'),beforeSpeed,'speed changes do not alter aim or battle state');
  assert.equal(get(solo,'surrender').textContent,'그만하기');assert.doesNotMatch(get(solo,'netTurn').textContent,/초/);
  get(solo,'wpn').click();weaponCard(solo,12).click();
  solo.eval('setAngle(0);setPower(50);fireSelected();');
  await wait(()=>get(solo,'netTurn').textContent.endsWith('비행 중'));
  let soloFrame=solo.eval('tankRenderEngine.view().frame');solo.TankOnline.tick();assert.equal(solo.eval('tankRenderEngine.view().frame'),soloFrame+2,'double speed advances the flight by two frames');
  for(const speed of [4,8,1,2,4,8]){
   get(solo,'soloSpeed').click();assert.equal(get(solo,'soloSpeed').textContent,'속도 ×'+speed);
   assert.match(get(solo,'soloSpeed').getAttribute('aria-label'),new RegExp('속도 '+speed+'배'));
   assert.equal(solo.localStorage.getItem('ojjuda.tank.solo.speed'),String(speed));
   soloFrame=solo.eval('tankRenderEngine.view().frame');solo.TankOnline.tick();
   assert.equal(solo.eval('tankRenderEngine.view().frame'),soloFrame+speed,'speed can change during flight without skipping simulation');
  }
  const acceptedSolo=(await f.call(ids[2],{action:'mine'})).room;
  for(let i=0;i<8000;i++)solo.TankOnline.tick();
  const renderedSolo=JSON.parse(solo.eval('JSON.stringify(tankRenderEngine.snapshot())'));
  assert.deepEqual(renderedSolo.terrain,acceptedSolo.game.terrain);assert.deepEqual(renderedSolo.turnOrder,acceptedSolo.game.turnOrder);
  assert.deepEqual(renderedSolo.tanks.map(t=>[t.x,t.y,t.hp]),acceptedSolo.game.tanks.map(t=>[t.x,t.y,t.hp]),'eightfold speed preserves authoritative damage and positions');
  assert.ok(solo.scheduledDelays.includes(112.5),'eightfold speed shortens the computer wait');
  for(const [speed,delay] of [[1,900],[2,450],[4,225],[8,112.5]]){
   get(solo,'soloSpeed').click();assert.equal(get(solo,'soloSpeed').textContent,'속도 ×'+speed);
   assert.ok(solo.scheduledDelays.includes(delay),'changing speed reschedules the pending computer turn');
  }
  assert.match(get(solo,'netTurn').textContent,/컴퓨터 1/);
  for(let i=0;i<3&&!solo.TankOnline.canAim();i++){
   await wait(()=>get(solo,'netTurn').textContent.endsWith('비행 중'));
   for(let j=0;j<8000;j++)solo.TankOnline.tick();
  }
  assert.equal(solo.TankOnline.canAim(),true,'computer must automatically return the turn to the person');
  assert.equal(solo.TankView.input().angle,0);assert.equal(solo.TankView.input().power,50,'the player keeps their aim after the computer fires');
  assert.equal(get(solo,'netCoins').textContent,'보유 97쭈');
  get(solo,'surrender').click();
  await wait(()=>!solo.document.body.classList.contains('in-match'));
  assert.equal(get(solo,'entryHome').hidden,false);assert.equal(get(solo,'soloSetup').hidden,false);
  assert.equal(get(solo,'startSolo').disabled,false);
  assert.equal(deathSounds,1,'subsequent ticks and room refreshes must not repeat a death explosion');
  // Three people take turns on one authenticated device; no computer fires for them.
  const local=await client(ids[3],false,undefined,'','8');
  get(local,'localMode').click();assert.equal(get(local,'localMode').getAttribute('aria-pressed'),'true');
  assert.equal(get(local,'localSetup').hidden,false);assert.equal(get(local,'soloSetup').hidden,true);assert.equal(get(local,'lobbyHome').hidden,true);
  assert.match(get(local,'localSetup').textContent,/로그인한 계정의 쭈/);
  get(local,'localPlayers').value='3';get(local,'startLocal').click();
  await wait(()=>local.document.body.classList.contains('in-match'));local.TankOnline.tick();
  assert.equal(get(local,'soloSpeed').hidden,true,'same-device play has no speed control');
  assert.equal(local.eval('tanks.length'),3);assert.doesNotMatch(get(local,'netTurn').textContent,/컴퓨터|초/);
  const localAim=[[89.75,6],[90.25,7],[89.5,8]];
  for(const [seat,weapon,coins] of [[0,12,97],[1,10,96],[2,0,96]]){
   assert.equal(local.TankOnline.canAim(),true);assert.equal(local.TankOnline.seat(),seat);
   assert.match(get(local,'netTurn').textContent,new RegExp('플레이어 '+(seat+1)+' 차례'));
   get(local,'wpn').click();weaponCard(local,[1,2,0][seat]).click();
   get(local,'wpn').click();weaponCard(local,weapon).click();
   local.eval(`setAngle(${localAim[seat][0]});setPower(${localAim[seat][1]});fireSelected();`);
   await wait(()=>get(local,'netTurn').textContent.endsWith('비행 중'));
   for(let i=0;i<8000;i++)local.TankOnline.tick();
   assert.equal(get(local,'netCoins').textContent,`보유 ${coins}쭈`);
  }
  const nextLocalSeat=local.TankOnline.seat();
  assert.equal(local.TankView.input().angle,localAim[nextLocalSeat][0]);assert.equal(local.TankView.input().power,localAim[nextLocalSeat][1],'shuffled same-device turns restore each player\'s aim');
  local.eval('draw()');
  assert.equal(get(local,'angv').textContent,`각도 ${localAim[nextLocalSeat][0]}°`);assert.equal(get(local,'powv').textContent,`힘 ${localAim[nextLocalSeat][1]}`);
  assert.equal(local.TankView.input().weapon,[1,2,0][nextLocalSeat],'the shuffled next player restores their basic shell');
  assert.equal(get(local,'wName').textContent,['대형탄','산탄','일반탄'][nextLocalSeat]);
  get(local,'wpn').click();weaponCard(local,8).click();
  assert.equal(local.TankView.input().weapon,8);assert.equal(get(local,'wName').textContent,'핵탄');
  local.dispatchEvent(new local.Event('online'));
  await new Promise(r=>setTimeout(r,100));local.TankOnline.tick();
  assert.equal(local.TankView.input().weapon,8,'state polling must preserve the selected nuclear shell');
  assert.equal(local.TankView.input().angle,localAim[nextLocalSeat][0]);assert.equal(local.TankView.input().power,localAim[nextLocalSeat][1],'polling preserves restored aim');
  localAim[nextLocalSeat]=[90,5];
  local.eval('setAngle(90);setPower(5);fireSelected();');
  await wait(()=>get(local,'netTurn').textContent==='핵탄 비행 중');
  assert.equal(local.eval('shots[0].w.name'),'핵탄');assert.equal(local.eval('shots[0].w.dmg'),130);
  assert.equal(local.eval('shots[0].w.r'),200,'nuclear shells retain their original large blast range');
  assert.equal(get(local,'netCoins').textContent,'보유 91쭈');local.eval('draw()');
  for(let i=0;i<8000;i++)local.TankOnline.tick();
  let localRoom=(await f.call(ids[3],{action:'mine'})).room;
  assert.equal(localRoom.event.command.weapon,8);
  const restored=await client(ids[3],true);
  assert.equal(restored.TankOnline.canAim(),false,'saved matches wait for the resume button');
  assert.match(get(restored,'resumeInfo').textContent,/같은 기기 · 3명/);
  get(restored,'resumeMatch').click();restored.TankOnline.tick();
  assert.equal(get(restored,'netCoins').textContent,'보유 91쭈');
  assert.equal(restored.TankOnline.canAim(),true);assert.equal(restored.TankOnline.seat(),localRoom.game.turn);
  assert.deepEqual(Array.from(restored.eval('tanks.map(t=>t.basicWeapon)')),[1,2,0],'same-device players keep independent basic selections after reconnecting');
  assert.equal(restored.TankView.input().weapon,[1,2,0][localRoom.game.turn]);
  assert.equal(restored.TankView.input().angle,localAim[localRoom.game.turn][0]);
  assert.equal(restored.TankView.input().power,localAim[localRoom.game.turn][1],'continue restores the active player\'s last angle and power');
  restored.eval('draw()');
  assert.equal(get(restored,'angv').textContent,`각도 ${localAim[localRoom.game.turn][0]}°`);
  assert.equal(get(restored,'powv').textContent,`힘 ${localAim[localRoom.game.turn][1]}`);
  while(localRoom.status==='active')localRoom=(await f.call(ids[3],{action:'surrender',room_id:localRoom.id,version:localRoom.version,request_id:require('node:crypto').randomUUID()})).room;
  local.dispatchEvent(new local.Event('online'));
  await wait(()=>get(local,'netTurn').textContent==='전투 종료');
  for(let i=0;i<70;i++)local.TankOnline.tick();
  assert.equal(get(local,'over').classList.contains('hidden'),false);assert.equal(get(local,'bAgain').textContent,'다시 하기');
  const previousLocalId=localRoom.id;get(local,'bAgain').click();
  await wait(()=>local.TankOnline.canAim()&&local.eval('tankRenderEngine.snapshot().runId')!==previousLocalId);
  local.TankOnline.tick();assert.equal(local.eval('tanks.length'),3,'play again keeps the local player count');
  get(local,'surrender').click();await wait(()=>!local.document.body.classList.contains('in-match'));
  assert.equal(get(local,'localSetup').hidden,false);assert.equal(get(local,'startLocal').disabled,false);
  // The new shell is selectable, animates every stage, and uses one paid command.
  const bunker=await client(ids[6]);get(bunker,'localMode').click();get(bunker,'localPlayers').value='2';get(bunker,'startLocal').click();
  await wait(()=>bunker.document.body.classList.contains('in-match'));bunker.TankOnline.tick();
  get(bunker,'wpn').click();weaponCard(bunker,13).click();assert.equal(get(bunker,'wName').textContent,'벙커버스터');
  bunker.eval('setAngle(75);setPower(20);fireSelected();fireSelected();');
  await wait(()=>get(bunker,'netTurn').textContent==='벙커버스터 표적탄 비행 중');
  assert.equal(get(bunker,'netCoins').textContent,'보유 97쭈');
  const stages=new Set();let bunkerFrames=0;
  while(bunker.eval("['fly','settle'].includes(state)")&&bunkerFrames++<8000){
   const label=get(bunker,'netTurn').textContent;
   if(!stages.has(label)){
    stages.add(label);bunker.canvasTranslations.length=0;bunker.eval('draw()');
    const missile=bunker.eval('shots.find(s=>s.bunker)');
    if(missile)assert.ok(bunker.canvasTranslations.some(([x,y])=>x===missile.x&&y===missile.y),'draw the missile body at its actual contact point');
   }
   bunker.TankOnline.tick();
  }
  assert.ok(bunkerFrames<8000);
  for(const stage of ['표적탄 비행 중','미사일 낙하 중','지하 관통 중','지하 폭발'])assert.ok(stages.has('벙커버스터 '+stage),'render stage: '+stage);
  const bunkerRoom=(await f.call(ids[6],{action:'mine'})).room;
  assert.equal(bunkerRoom.coins,97);assert.equal(bunkerRoom.game.shotNo,1);assert.equal(bunkerRoom.event.command.weapon,13);
  assert.deepEqual(JSON.parse(bunker.eval('JSON.stringify(tankRenderEngine.snapshot().terrain)')),bunkerRoom.game.terrain,'the displayed crater matches the saved authoritative strike');
  get(bunker,'surrender').click();await wait(()=>!bunker.document.body.classList.contains('in-match'));
  // Steel Rain is available with zero coins and visibly splits into ten children.
  await f.db.query('update public.user_private set coins=0 where user_id=$1',[ids[7]]);
  const rain=await client(ids[7]);get(rain,'localMode').click();get(rain,'localPlayers').value='2';get(rain,'startLocal').click();
  await wait(()=>rain.document.body.classList.contains('in-match'));rain.TankOnline.tick();
  get(rain,'wpn').click();assert.equal(weaponCard(rain,14).disabled,false);weaponCard(rain,14).click();
  assert.equal(get(rain,'wName').textContent,'강철비');assert.equal(get(rain,'wAmmo').textContent,'무료');
  rain.eval('setAngle(70);setPower(60);fireSelected();fireSelected();');
  await wait(()=>get(rain,'netTurn').textContent==='강철비 비행 중');
  let rainFrames=0,sawSplit=false;
  while(rain.eval("['fly','settle'].includes(state)")&&rainFrames++<8000){
   if(!sawSplit&&get(rain,'netTurn').textContent==='강철비 10발 확산 중'){
    assert.equal(rain.eval('shots.length'),10);assert.ok(rain.eval("shots.every(s=>s.w.kind==='steelrain-pellet'&&s.w.r===16.8&&s.w.dmg===3.4)"));
    assert.ok(rain.eval('booms.some(b=>b.airburst&&b.fx)'));rain.eval('draw()');sawSplit=true;
   }
   rain.TankOnline.tick();
  }
  assert.ok(sawSplit&&rainFrames<8000);
  const rainRoom=(await f.call(ids[7],{action:'mine'})).room;
  assert.equal(rainRoom.coins,0);assert.equal(rainRoom.game.shotNo,1);assert.equal(rainRoom.game.tanks[0].basicWeapon,14);
  assert.equal(get(rain,'netCoins').textContent,'보유 0쭈');
  assert.deepEqual(JSON.parse(rain.eval('JSON.stringify(tankRenderEngine.snapshot().terrain)')),rainRoom.game.terrain);
  get(rain,'surrender').click();await wait(()=>!rain.document.body.classList.contains('in-match'));
  // An eightfold replay reaches bedrock through thin soil, shows one quake, and saves the falls.
  let quakeRoom=(await f.call(ids[8],{action:'create',request_id:require('node:crypto').randomUUID(),options:{mode:'solo',capacity:3,title:'지진'}})).room;
  quakeRoom=(await f.start(ids[8],quakeRoom)).room;
  const quakeGame=quakeRoom.game;quakeGame.wind=0;quakeGame.terrain.fill(150);quakeGame.terrain.fill(350,370,520);
  quakeGame.tanks.forEach((t,i)=>Object.assign(t,{x:[730,710,1400][i],y:300,vy:0}));
  await f.db.query('update ojjuda_tank_internal.rooms set state=$2::jsonb where id=$1',[quakeRoom.id,JSON.stringify(quakeGame)]);
  const earthquake=await client(ids[8],true,undefined,'','8');get(earthquake,'resumeMatch').click();earthquake.TankOnline.tick();
  let quakeSounds=0;earthquake.sfx=type=>{if(type==='quake')quakeSounds++;};
  earthquake.eval('setAngle(0);setPower(20);fireSelected();');
  await wait(()=>get(earthquake,'netTurn').textContent==='일반탄 비행 중');
  let quakeTicks=0,sawQuake=false;
  while(earthquake.eval("['fly','settle'].includes(state)")&&quakeTicks++<200){
   earthquake.TankOnline.tick();
   if(get(earthquake,'netTurn').textContent==='지진 · 지형 붕괴 중'){
    sawQuake=true;assert.equal(earthquake.TankOnline.canAim(),false);
    assert.ok(earthquake.eval('shake')>0);earthquake.eval('draw()');
   }
  }
  assert.ok(sawQuake&&quakeTicks<100);assert.equal(quakeSounds,1,'the quake is announced once even at eightfold speed');
  const shownQuake=JSON.parse(earthquake.eval('JSON.stringify(tankRenderEngine.snapshot())'));earthquake.close();
  const storedQuake=(await f.call(ids[8],{action:'mine'})).room;
  assert.equal(storedQuake.coins,100);assert.equal(storedQuake.game.shotNo,1);
  assert.deepEqual(shownQuake.terrain,storedQuake.game.terrain);
  assert.deepEqual(shownQuake.tanks.map(t=>[t.x,t.y,t.hp]),storedQuake.game.tanks.map(t=>[t.x,t.y,t.hp]));
  assert.ok(shownQuake.tanks.every(t=>t.hp<100),'the distant high ground also collapses and damages its tank');
  assert.ok(Math.max(...shownQuake.terrain)-Math.min(...shownQuake.terrain)<=1,'eightfold playback ends with the entire battlefield level');
  assert.ok(shownQuake.tanks.every(t=>t.y===shownQuake.terrain[Math.floor(t.x/2)]*2&&t.vy===0),'all tanks land before playback hands over the turn');
  // Opening the entrance must not run a saved computer turn or spend coins.
  let savedSolo=(await f.call(ids[5],{action:'create',request_id:require('node:crypto').randomUUID(),options:{mode:'solo',capacity:2,title:'저장된 판'}})).room;
  savedSolo=(await f.start(ids[5],savedSolo)).room;
  savedSolo=(await f.move(ids[5],savedSolo,{weapon:0,angle:0,power:50,moves:[]})).room;
  assert.equal(savedSolo.game.turn,1);
  const paused=await client(ids[5],true,{width:390,height:844},'',solo.localStorage.getItem('ojjuda.tank.solo.speed'));
  assert.equal(paused.document.body.classList.contains('in-match'),false);
  assert.equal(get(paused,'newMatch').hidden,false);
  await new Promise(r=>setTimeout(r,1100));
  const unchanged=(await f.call(ids[5],{action:'read',room_id:savedSolo.id})).room;
  assert.equal(unchanged.version,savedSolo.version,'CPU waits on the entrance');
  assert.deepEqual(unchanged.game,savedSolo.game);assert.equal(unchanged.coins,100);
  paused.confirm=()=>false;get(paused,'newMatch').click();
  assert.equal((await f.call(ids[5],{action:'mine'})).room.id,savedSolo.id,'cancelling a new game preserves the save');
  get(paused,'resumeMatch').click();
  assert.equal(get(paused,'soloSpeed').textContent,'속도 ×8','reopening restores the saved speed');
  assert.ok(paused.scheduledDelays.includes(112.5));
  assert.equal(paused.document.body.classList.contains('in-match'),true);
  await wait(async()=>(await f.call(ids[5],{action:'read',room_id:savedSolo.id})).room.version>savedSolo.version);
  paused.close();
  const replace=await client(ids[5],true,undefined,'','99');
  get(replace,'newMatch').click();
  await wait(()=>!get(replace,'entryHome').hidden);
  assert.equal((await f.call(ids[5],{action:'mine'})).room,null);
  assert.equal(get(replace,'soloOpponents').value,'1');
  get(replace,'startSolo').click();
  await wait(()=>replace.document.body.classList.contains('in-match'));
  assert.notEqual((await f.call(ids[5],{action:'mine'})).room.id,savedSolo.id);
  assert.equal(get(replace,'soloSpeed').textContent,'속도 ×1','invalid saved speeds fall back to normal');
  // A restored wreck stays quiet; a new match can explode once again.
  const {newGame,createEngine}=await import('../games/tank/engine.mjs');
  const living=newGame(['a','b'],'effects',88),wreck=structuredClone(living);wreck.tanks[1].hp=0;
  for(const [wind,label] of [[.076,'10 →'],[-.076,'← 10'],[.0095,'5 →'],[0,'0']]){
   solo.TankView.use(createEngine({...living,wind}),false);solo.eval('draw()');
   assert.equal(get(solo,'windv').textContent,label,'the displayed wind matches the capped physical strength');
  }
  // Compare the guide with windless shots: full ascent, then one third of the descent.
  const aimGame=structuredClone(living);aimGame.terrain.fill(150);aimGame.wind=0;
  aimGame.tanks.forEach((t,i)=>Object.assign(t,{x:i?1500:300,y:300,vy:0}));
  const aim=createEngine(aimGame);solo.TankView.use(aim,true);
  for(const [angle,power,wind] of [[60,70,.019],[60,70,0],[60,70,-.019],[120,85,-.019],[90,50,0],[0,55,0],[180,55,0],[45,100,0]]){
   Object.assign(aim.view().tanks[aim.view().turn],{ang:angle,pow:power,w:0});
   // Keep the same engine for angle/power changes to exercise live guide updates.
   solo.eval(`wind=${wind}`);
   const before=aim.snapshot(),guide=JSON.parse(solo.eval('JSON.stringify(aimPreview(tanks[turn]))'));
   solo.eval('draw();aimPreview(tanks[turn])');
   assert.deepEqual(aim.snapshot(),before,'previewing must not fire, spend currency, or mutate the match');
   const flight=createEngine({...before,wind:0});
   flight.begin({type:'fire',weapon:0,angle,power,moves:[]});
   const shot=flight.view().shots[0],trace=[{x:shot.x,y:shot.y,distance:0}];
   while(flight.view().shots.length&&trace.length<=12001){
    flight.step();
    const p=flight.view().shots[0]||flight.view().booms[0],previous=trace.at(-1);
    trace.push({x:p.x,y:p.y,distance:previous.distance+Math.hypot(p.x-previous.x,p.y-previous.y)});
   }
   assert.equal(flight.view().shots.length,0,'the reference shot reaches first impact');
   const apex=trace.reduce((top,p)=>p.y<top.y?p:top),impact=trace.at(-1),end=guide.at(-1);
   assert.ok(end&&guide.length<=162,'the visible guide has a bounded number of dots');
   for(const p of guide.filter(p=>Number.isInteger(p.frame))){
    assert.ok(Math.hypot(p.x-trace[p.frame].x,p.y-trace[p.frame].y)<1e-8,'guide dots ignore wind and follow the windless projectile');
   }
   const cutoff=apex.distance+(impact.distance-apex.distance)/3;
   assert.ok(Math.abs(end.distance-cutoff)<.05,'the endpoint is one third along the descending arc');
   if(angle>0&&angle<180){
    assert.ok(guide.some(p=>Math.abs(p.y-apex.y)<1e-8),'the apex is shown');
    assert.ok(end.y>apex.y&&end.y<impact.y,'the guide bends downward but stops before impact');
   }
  }
  const wallGame=structuredClone(aimGame);wallGame.terrain.fill(50,170,180);
  Object.assign(wallGame.tanks[wallGame.turn],{ang:10,pow:70,w:0});
  solo.TankView.use(createEngine(wallGame),true);
  const wallGuide=JSON.parse(solo.eval('JSON.stringify(aimPreview(tanks[turn]))'));
  assert.ok(wallGuide.length>0&&wallGuide.every(p=>p.x<344),'an ascending guide stops at a nearby cliff');
  solo.TankView.resetHistory();solo.TankView.use(createEngine(wreck),false);
  assert.equal(solo.TankView.hasEffects(),false);
  solo.TankView.resetHistory();solo.TankView.use(createEngine(living),false);solo.TankView.use(createEngine(wreck),false);
  assert.equal(solo.TankView.hasEffects(),true);
  for(let i=0;i<70;i++){solo.TankView.tickEffects();solo.TankView.use(createEngine(wreck),false);}
  assert.equal(solo.TankView.hasEffects(),false);
  // Outside bursts stay at the landing point; only the overlapping part can enter the view.
  const edgeGame=structuredClone(living);edgeGame.terrain.fill(150);edgeGame.tanks.forEach(t=>Object.assign(t,{y:300,vy:0}));
  for(const weapon of [0,8,11])for(const side of [-1,0,1]){
   const edge=createEngine(edgeGame);edge.begin({type:'fire',weapon,angle:90,power:5,moves:[]});
   const v=edge.view();Object.assign(v.shots[0],{x:side<0?-8:side>0?v.W+8:v.W/2,y:side?300:v.MH+41,vx:side,vy:1});edge.step();
   solo.TankView.resetHistory();solo.TankView.use(edge,false);
   const burst=edge.view().booms[0];assert.ok(burst.outside);
   const camera=solo.eval('({w:VW,h:H})');
   solo.eval(`camX=${side<0?0:side>0?v.W-camera.w:burst.x-camera.w/2};camY=${side?0:burst.y-camera.h-8}`);
   burst.cr=1;solo.radialGradients.length=0;solo.eval('draw()');
   assert.equal(solo.radialGradients.length,0,'an offscreen impact must not pop up inside the screen');
   burst.cr=burst.r;burst.t=burst.D;solo.radialGradients.length=0;solo.eval('draw()');
   assert.equal(solo.radialGradients.length,1,'a growing blast can reach the screen edge');
   const [x,y,,,,radius]=solo.radialGradients[0];
   assert.equal(x,burst.x);assert.equal(y,burst.y);assert.equal(radius,burst.r,'render at the actual position and size');
   const originalPosition=[burst.x,burst.y];
   solo.eval(`camX=${side<0?burst.r+40:side>0?v.W-camera.w-burst.r-40:burst.x-camera.w/2};camY=0`);
   solo.radialGradients.length=0;solo.eval('draw()');
   assert.equal(solo.radialGradients.length,0,'a distant explosion is not pinned to the viewport');
   assert.deepEqual([burst.x,burst.y],originalPosition,'panning never relocates an explosion');
  }
  console.log('PASS: direct angle/power gestures, directional half-degree buttons, repeated holds, power buttons, keyboard, cancellation, exact firing, destruction effects, common entrance, solo CPU turns, two online sessions, same-device human turns/reconnect/restart, nuclear selection/name/damage, homing selection/replay, bunker strike stages/crater/single payment and 3-jju payment in all modes');

 }finally{for(const w of windows)w.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
