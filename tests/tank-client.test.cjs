// DOM and two-session integration test; no browser or preview server is required.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{fixture,ids}=require('./tank-online-fixture.cjs');
const root=path.resolve(__dirname,'..');
const wait=async fn=>{for(let i=0;i<600;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI condition timed out');};
(async()=>{
 const f=await fixture(),windows=[];
 async function client(actor,expectMatch=false,viewport={width:1536,height:626},joinCode=''){
  const html=fs.readFileSync(path.join(root,'games/tank/index.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://ojjuda.kr/games/tank/index.html',runScripts:'outside-only',pretendToBeVisual:true});windows.push(dom.window);
  const w=dom.window,context=dom.getInternalVMContext(),draw=()=>{};
  w.radialGradients=[];
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({createImageData:(x,y)=>({data:new Uint8ClampedArray(x*y*4)}),createLinearGradient:()=>({addColorStop:draw}),createRadialGradient:(...args)=>{w.radialGradients.push(args);return {addColorStop:draw};},measureText:()=>({width:20})},{get:(o,k)=>o[k]||draw});
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:this.id==='prot'?96:viewport.width,height:this.id==='prot'?56:viewport.height,top:['left','right'].includes(this.id)?viewport.height-86:0,bottom:this.id==='wind'?50:viewport.height,left:0,right:viewport.width};};
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
  await wait(()=>expectMatch?w.document.body.classList.contains('in-match'):!w.document.getElementById('startSolo').disabled);
  return w;
 }
 try{
  const viewport={width:1536,height:626},a=await client(ids[0],false,viewport),get=(w,id)=>w.document.getElementById(id);
  assert.equal(get(a,'soloMode').getAttribute('aria-pressed'),'true');
  assert.equal(get(a,'lobbyHome').hidden,true);
  get(a,'onlineMode').click();
  get(a,'createRoom').dispatchEvent(new a.Event('submit',{cancelable:true}));
  await wait(()=>!get(a,'waitingRoom').hidden&&get(a,'waitingCode').textContent.length===8);
  const b=await client(ids[1],false,{width:1024,height:768},get(a,'waitingCode').textContent);
  await wait(()=>get(b,'waitingNames').children.length===2);
  await wait(()=>get(a,'waitingNames').children.length===2);
  assert.equal(get(b,'startMatch').hidden,true);
  get(a,'startMatch').click();
  await wait(()=>a.document.body.classList.contains('in-match'));
  await wait(()=>b.document.body.classList.contains('in-match'));
  a.TankOnline.tick();b.TankOnline.tick();
  assert.equal(get(a,'cv').style.width,'1536px');assert.equal(get(a,'cv').style.height,'626px');
  assert.equal(get(b,'cv').style.width,'1024px');assert.equal(get(b,'cv').style.height,'768px');
  assert.ok(a.eval('VW>800'));assert.ok(b.eval('H>450'));
  const beforeResize=a.eval('JSON.stringify(tankRenderEngine.snapshot())');
  viewport.width=844;viewport.height=390;a.dispatchEvent(new a.Event('resize'));a.TankOnline.tick();
  assert.equal(get(a,'cv').style.width,'844px');assert.equal(get(a,'cv').style.height,'390px');
  assert.ok(Math.abs(a.eval('VW*scale')-844)<1e-6);assert.ok(Math.abs(a.eval('H*scale')-390)<1e-6);
  // Preview time and aim angle may advance; positions and terrain must not resize.
  const saved=JSON.parse(beforeResize),resized=JSON.parse(a.eval('JSON.stringify(tankRenderEngine.snapshot())'));
  assert.deepEqual(saved.terrain,resized.terrain);assert.deepEqual(saved.tanks.map(t=>[t.x,t.y,t.hp]),resized.tanks.map(t=>[t.x,t.y,t.hp]));
  assert.equal(a.eval('tankRenderEngine.view().VW'),800);assert.equal(a.eval('tankRenderEngine.view().H'),450);
  assert.equal(get(a,'fire').disabled,false);assert.equal(get(b,'fire').disabled,true);
  get(a,'wpn').click();const cards=get(a,'wgrid').children;assert.equal(cards.length,13);assert.match(cards[0].textContent,/무료/);assert.match(cards[8].textContent,/3쭈\/발/);assert.match(cards[10].textContent,/치료탄.*1쭈\/발/);assert.match(cards[10].textContent,/땅은 파이지/);
  assert.match(cards[12].textContent,/유도탄.*3쭈\/발/);assert.match(cards[12].textContent,/85%/);
  cards[12].click();a.eval('lockAngle();startCharge();tanks[turn].ang=0;tanks[turn].pow=50;release();');
  await wait(()=>get(a,'netCoins').textContent==='보유 97쭈');
  assert.equal(get(a,'netTurn').textContent,'유도탄 비행 중');assert.equal(a.eval('shots[0].w.kind'),'homing');assert.equal(a.eval('shots[0].w.dmg'),34);a.eval('draw()');
  for(let i=0;i<8000;i++)a.TankOnline.tick();
  await wait(()=>get(b,'netTurn').textContent.includes('비행'));
  for(let i=0;i<8000;i++)b.TankOnline.tick();
  assert.equal(get(a,'fire').disabled,true);assert.equal(get(b,'fire').disabled,false);
  assert.equal(a.eval('tanks[0].hp'),b.eval('tanks[0].hp'));
  assert.equal(a.eval('tanks[1].hp'),b.eval('tanks[1].hp'));
  // Reopening a third session for the same member restores the saved match without another debit.
  const reconnected=await client(ids[0],true);
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
  assert.equal(get(solo,'surrender').textContent,'그만하기');assert.doesNotMatch(get(solo,'netTurn').textContent,/초/);
  get(solo,'wpn').click();get(solo,'wgrid').children[12].click();
  solo.eval('lockAngle();startCharge();tanks[turn].ang=0;tanks[turn].pow=50;release();');
  await wait(()=>get(solo,'netTurn').textContent.endsWith('비행 중'));
  for(let i=0;i<8000;i++)solo.TankOnline.tick();
  assert.match(get(solo,'netTurn').textContent,/컴퓨터 1/);
  await wait(()=>get(solo,'netTurn').textContent.endsWith('비행 중'));
  for(let i=0;i<8000;i++)solo.TankOnline.tick();
  assert.equal(solo.TankOnline.canAim(),true,'computer must automatically return the turn to the person');
  assert.equal(get(solo,'netCoins').textContent,'보유 97쭈');
  get(solo,'surrender').click();
  await wait(()=>!solo.document.body.classList.contains('in-match'));
  assert.equal(get(solo,'entryHome').hidden,false);assert.equal(get(solo,'soloSetup').hidden,false);
  assert.equal(get(solo,'startSolo').disabled,false);
  assert.equal(deathSounds,1,'subsequent ticks and room refreshes must not repeat a death explosion');
  // Three people take turns on one authenticated device; no computer fires for them.
  const local=await client(ids[3]);
  get(local,'localMode').click();assert.equal(get(local,'localMode').getAttribute('aria-pressed'),'true');
  assert.equal(get(local,'localSetup').hidden,false);assert.equal(get(local,'soloSetup').hidden,true);assert.equal(get(local,'lobbyHome').hidden,true);
  assert.match(get(local,'localSetup').textContent,/로그인한 계정의 쭈/);
  get(local,'localPlayers').value='3';get(local,'startLocal').click();
  await wait(()=>local.document.body.classList.contains('in-match'));local.TankOnline.tick();
  assert.equal(local.eval('tanks.length'),3);assert.doesNotMatch(get(local,'netTurn').textContent,/컴퓨터|초/);
  for(const [seat,weapon,coins] of [[0,12,97],[1,10,96],[2,0,96]]){
   assert.equal(local.TankOnline.canAim(),true);assert.equal(local.TankOnline.seat(),seat);
   assert.match(get(local,'netTurn').textContent,new RegExp('플레이어 '+(seat+1)+' 차례'));
   get(local,'wpn').click();get(local,'wgrid').children[weapon].click();
   local.eval('lockAngle();startCharge();tanks[turn].ang=90;tanks[turn].pow=5;release();');
   await wait(()=>get(local,'netTurn').textContent.endsWith('비행 중'));
   for(let i=0;i<8000;i++)local.TankOnline.tick();
   assert.equal(get(local,'netCoins').textContent,`보유 ${coins}쭈`);
  }
  assert.equal(local.TankOnline.seat(),0);
  get(local,'wpn').click();get(local,'wgrid').children[8].click();
  assert.equal(local.TankView.input().weapon,8);assert.equal(get(local,'wName').textContent,'핵탄');
  local.dispatchEvent(new local.Event('online'));
  await new Promise(r=>setTimeout(r,100));local.TankOnline.tick();
  assert.equal(local.TankView.input().weapon,8,'state polling must preserve the selected nuclear shell');
  local.eval('lockAngle();startCharge();tanks[turn].ang=90;tanks[turn].pow=5;release();');
  await wait(()=>get(local,'netTurn').textContent==='핵탄 비행 중');
  assert.equal(local.eval('shots[0].w.name'),'핵탄');assert.equal(local.eval('shots[0].w.dmg'),130);
  assert.equal(local.eval('shots[0].w.r'),200,'nuclear shells retain their original large blast range');
  assert.equal(get(local,'netCoins').textContent,'보유 93쭈');local.eval('draw()');
  for(let i=0;i<8000;i++)local.TankOnline.tick();
  let localRoom=(await f.call(ids[3],{action:'mine'})).room;
  assert.equal(localRoom.event.command.weapon,8);
  const restored=await client(ids[3],true);restored.TankOnline.tick();
  assert.equal(get(restored,'netCoins').textContent,'보유 93쭈');
  assert.equal(restored.TankOnline.canAim(),true);assert.equal(restored.TankOnline.seat(),localRoom.game.turn);
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
  // A restored wreck stays quiet; a new match can explode once again.
  const {newGame,createEngine}=await import('../games/tank/engine.mjs');
  const living=newGame(['a','b'],'effects',88),wreck=structuredClone(living);wreck.tanks[1].hp=0;
  solo.TankView.resetHistory();solo.TankView.use(createEngine(wreck),false);
  assert.equal(solo.TankView.hasEffects(),false);
  solo.TankView.resetHistory();solo.TankView.use(createEngine(living),false);solo.TankView.use(createEngine(wreck),false);
  assert.equal(solo.TankView.hasEffects(),true);
  for(let i=0;i<70;i++){solo.TankView.tickEffects();solo.TankView.use(createEngine(wreck),false);}
  assert.equal(solo.TankView.hasEffects(),false);
  // Outside bursts remain visible at the canvas edge, including missed utility shells.
  for(const weapon of [0,10,11])for(const side of [-1,1]){
   const edge=createEngine(living);edge.begin({type:'fire',weapon,angle:90,power:5,moves:[]});
   Object.assign(edge.view().shots[0],{x:side<0?-81:edge.view().W+81,y:edge.view().MH+41,vx:side,vy:1});edge.step();
   solo.TankView.resetHistory();solo.TankView.use(edge,false);solo.radialGradients.length=0;solo.eval('draw()');
   assert.equal(solo.radialGradients.length,1,'missed shells draw an explosion');
   const [x,y]=solo.radialGradients[0],camera=solo.eval('({x:camX,y:camY,w:VW,h:H})');
   assert.equal(x,side<0?camera.x+12:camera.x+camera.w-12);
   assert.equal(y,camera.y+camera.h-12,'explosion is visible just inside the lower screen edge');
  }
  console.log('PASS: destruction effects, common entrance, solo CPU turns, two online sessions, same-device human turns/reconnect/restart, nuclear selection/name/damage, homing selection/replay and 3-jju payment in all modes');

 }finally{for(const w of windows)w.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
