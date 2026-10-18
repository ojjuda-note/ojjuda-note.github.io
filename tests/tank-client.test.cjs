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
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({createImageData:(x,y)=>({data:new Uint8ClampedArray(x*y*4)}),createLinearGradient:()=>({addColorStop:draw}),createRadialGradient:()=>({addColorStop:draw}),measureText:()=>({width:20})},{get:(o,k)=>o[k]||draw});
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
  get(a,'wpn').click();const cards=get(a,'wgrid').children;assert.equal(cards.length,12);assert.match(cards[0].textContent,/무료/);assert.match(cards[8].textContent,/3쭈\/발/);assert.match(cards[10].textContent,/치료탄.*1쭈\/발/);assert.match(cards[10].textContent,/땅은 파이지/);
  cards[3].click();a.eval('lockAngle();startCharge();tanks[turn].ang=0;tanks[turn].pow=50;release();');
  await wait(()=>get(a,'netCoins').textContent==='보유 98쭈');
  for(let i=0;i<8000;i++)a.TankOnline.tick();
  await wait(()=>get(b,'netTurn').textContent.includes('비행'));
  for(let i=0;i<8000;i++)b.TankOnline.tick();
  assert.equal(get(a,'fire').disabled,true);assert.equal(get(b,'fire').disabled,false);
  assert.equal(a.eval('tanks[0].hp'),b.eval('tanks[0].hp'));
  assert.equal(a.eval('tanks[1].hp'),b.eval('tanks[1].hp'));
  // Reopening a third session for the same member restores the saved match without another debit.
  const reconnected=await client(ids[0],true);
  assert.equal(get(reconnected,'netCoins').textContent,'보유 98쭈');
  let deathSounds=0;a.sfx=type=>{if(type==='boom')deathSounds++;};
  get(a,'surrender').click();
  await wait(()=>a.TankView.hasEffects());
  assert.equal(deathSounds,1);assert.equal(get(a,'over').classList.contains('hidden'),true,'show the destruction before the result');
  for(let i=0;i<70;i++)a.TankOnline.tick();
  assert.equal(a.TankView.hasEffects(),false);assert.equal(get(a,'over').classList.contains('hidden'),false);
  const solo=await client(ids[2]);
  assert.ok(get(solo,'menu').querySelector('.game-entry .ge-primary'));
  get(solo,'soloOpponents').value='1';get(solo,'startSolo').click();
  await wait(()=>solo.document.body.classList.contains('in-match'));
  solo.TankOnline.tick();assert.equal(solo.eval('tanks.length'),2);
  assert.equal(get(solo,'surrender').textContent,'그만하기');assert.doesNotMatch(get(solo,'netTurn').textContent,/초/);
  solo.eval('lockAngle();startCharge();tanks[turn].ang=0;tanks[turn].pow=50;release();');
  await wait(()=>get(solo,'netTurn').textContent==='포탄 비행 중');
  for(let i=0;i<8000;i++)solo.TankOnline.tick();
  assert.match(get(solo,'netTurn').textContent,/컴퓨터 1/);
  await wait(()=>get(solo,'netTurn').textContent==='포탄 비행 중');
  for(let i=0;i<8000;i++)solo.TankOnline.tick();
  assert.equal(solo.TankOnline.canAim(),true,'computer must automatically return the turn to the person');
  assert.equal(get(solo,'netCoins').textContent,'보유 100쭈');
  get(solo,'surrender').click();
  await wait(()=>!solo.document.body.classList.contains('in-match'));
  assert.equal(get(solo,'entryHome').hidden,false);assert.equal(get(solo,'soloSetup').hidden,false);
  assert.equal(get(solo,'startSolo').disabled,false);
  assert.equal(deathSounds,1,'subsequent ticks and room refreshes must not repeat a death explosion');
  // A restored wreck stays quiet; a new match can explode once again.
  const {newGame,createEngine}=await import('../games/tank/engine.mjs');
  const living=newGame(['a','b'],'effects',88),wreck=structuredClone(living);wreck.tanks[1].hp=0;
  solo.TankView.resetHistory();solo.TankView.use(createEngine(wreck),false);
  assert.equal(solo.TankView.hasEffects(),false);
  solo.TankView.resetHistory();solo.TankView.use(createEngine(living),false);solo.TankView.use(createEngine(wreck),false);
  assert.equal(solo.TankView.hasEffects(),true);
  for(let i=0;i<70;i++){solo.TankView.tickEffects();solo.TankView.use(createEngine(wreck),false);}
  assert.equal(solo.TankView.hasEffects(),false);
  console.log('PASS: one destruction burst and sound, result waits for burst, no duplicate/reconnect bursts, common entrance, solo CPU turns, two online sessions and paid ammo');

 }finally{for(const w of windows)w.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
