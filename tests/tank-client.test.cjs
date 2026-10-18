// DOM and two-session integration test; no browser or preview server is required.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{fixture,ids}=require('./tank-online-fixture.cjs');
const root=path.resolve(__dirname,'..');
const wait=async fn=>{for(let i=0;i<600;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI condition timed out');};
(async()=>{
 const f=await fixture(),windows=[];
 async function client(actor,expectMatch=false){
  const html=fs.readFileSync(path.join(root,'games/tank/index.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://ojjuda.kr/games/tank/index.html',runScripts:'outside-only',pretendToBeVisual:true});windows.push(dom.window);
  const w=dom.window,context=dom.getInternalVMContext(),draw=()=>{};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({createImageData:(x,y)=>({data:new Uint8ClampedArray(x*y*4)}),createLinearGradient:()=>({addColorStop:draw}),createRadialGradient:()=>({addColorStop:draw}),measureText:()=>({width:20})},{get:(o,k)=>o[k]||draw});
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:this.id==='prot'?96:900,height:this.id==='prot'?56:506,top:['left','right'].includes(this.id)?420:0,bottom:this.id==='wind'?50:506,left:0,right:900};};
  w.matchMedia=()=>({matches:false,addEventListener:draw});w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=draw;w.confirm=()=>true;
  const parent={postMessage(m){
   if(m.type==='ready')queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{origin:'https://ojjuda.kr',source:parent,data:{source:'ojjuda-world',type:'tank-init',available:true}})));
   if(m.type==='request')void f.call(actor,m.body).then(result=>w.dispatchEvent(new w.MessageEvent('message',{origin:'https://ojjuda.kr',source:parent,data:{source:'ojjuda-world',type:'tank-response',replyTo:m.requestId,result}})));
  }};
  Object.defineProperty(w,'parent',{value:parent});
  for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],context);
  const engine=new vm.SourceTextModule(fs.readFileSync(path.join(root,'games/tank/engine.mjs'),'utf8'),{context});
  const online=new vm.SourceTextModule(fs.readFileSync(path.join(root,'games/tank/online.mjs'),'utf8'),{context});
  await engine.link(()=>{throw Error('unexpected import');});await online.link(()=>engine);await online.evaluate();
  await wait(()=>expectMatch?w.document.body.classList.contains('in-match'):!w.document.getElementById('lobbyHome').hidden);
  return w;
 }
 try{
  const a=await client(ids[0]),b=await client(ids[1]),get=(w,id)=>w.document.getElementById(id);
  get(a,'createRoom').dispatchEvent(new a.Event('submit',{cancelable:true}));
  await wait(()=>!get(a,'waitingRoom').hidden&&get(a,'waitingCode').textContent.length===8);
  get(b,'roomCode').value=get(a,'waitingCode').textContent;get(b,'joinRoom').dispatchEvent(new b.Event('submit',{cancelable:true}));
  await wait(()=>get(b,'waitingNames').children.length===2);
  await wait(()=>get(a,'waitingNames').children.length===2);
  assert.equal(get(b,'startMatch').hidden,true);
  get(a,'startMatch').click();
  await wait(()=>a.document.body.classList.contains('in-match'));
  await wait(()=>b.document.body.classList.contains('in-match'));
  a.TankOnline.tick();b.TankOnline.tick();
  assert.equal(get(a,'fire').disabled,false);assert.equal(get(b,'fire').disabled,true);
  get(a,'wpn').click();const cards=get(a,'wgrid').children;assert.equal(cards.length,10);assert.match(cards[0].textContent,/무료/);assert.match(cards[8].textContent,/3쭈\/발/);
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
  console.log('PASS: actual game DOM, create/join/start, two isolated sessions, own-turn controls, price picker, special-shot debit, shared playback, turn handoff and reconnect');

 }finally{for(const w of windows)w.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
