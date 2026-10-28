const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..','games','spot-difference'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const dom=new JSDOM(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=id=>w.document.getElementById(id);
 let accepted=true,coins=100,resolve,reject;const requests=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.confirm=()=>accepted;w.scrollTo=()=>{};
 w.JjudaWallet={getState:()=>({userId:'member-a',coins}),subscribe:fn=>fn({userId:'member-a',coins}),refresh:async()=>{},recordClear:async()=>({ok:true}),buy:(request,stage)=>{requests.push({...request,stage});return new Promise((yes,no)=>{resolve=yes;reject=no;});}};
 for(const file of ['puzzles.js','photo-puzzles.js','game-core.js'])w.eval(read(file));
 const fresh=w.JjudaGame.freshRound;w.JjudaGame.freshRound=()=>({...fresh(),remainingMs:9000});
 const clean=w.JjudaGame.cleanProgress;w.JjudaGame.cleanProgress=(raw,puzzles)=>({...clean(raw,puzzles),current:48});
 w.eval(read('app.js'));
 for(const im of w.document.querySelectorAll('img'))if(im.onload)im.onload();
 $('start').click();$('zoom').click();$('zoom-level').value='2';$('zoom-level').dispatchEvent(new w.Event('change'));
 for(const id of ['zoom-scroll-a','zoom-scroll-b']){$(id).scrollLeft=123;$(id).scrollTop=234;}
 const geometry=()=>Array.from(w.document.querySelectorAll('.zoom-picture'),el=>el.style.width).concat(['zoom-scroll-a','zoom-scroll-b'].flatMap(id=>[$(id).scrollLeft,$(id).scrollTop]));
 const expected=geometry();
 const preserved=()=>{assert.equal($('zoom-dialog').open,true,'paid help must keep the enlarged picture open');assert.equal($('zoom-level').value,'2');assert.deepEqual(geometry(),expected,'zoom width and pan remain unchanged');assert.equal(w.document.body.style.overflow,'hidden');};
 const round=()=>{const s=JSON.parse(w.localStorage.getItem('jjuda-spot-six-v1'));return s.rounds[w.JJUDA_PUZZLES[s.current].id];};
 return {w,$,requests,round,preserved,decline:()=>accepted=false,empty:()=>coins=0,fail:()=>reject(Error('연결이 끊겼어요. 구매를 다시 확인해 주세요.')),deny:()=>resolve({ok:false,reason:'coins'}),succeed:()=>{const q=requests.at(-1);resolve({ok:true,kind:q.kind,stage:q.stage,spot:q.spot,price:1,extend_ms:30000});}};
}
(async()=>{
 for(const kind of ['hint','time']){
  const f=fixture();try{
   f.$('zoom-'+(kind==='hint'?'hint':'extend')).click();f.preserved();
   assert.equal(f.$('zoom-home').getAttribute('aria-disabled'),'true');assert.equal(f.$('zoom-home').dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true})),false,'home does not interrupt an in-flight purchase');
   assert.equal(f.requests.length,1);assert.equal(f.round().status,'payment');assert.equal(f.round().deadline,null,'timer pauses during purchase');
   f.$('zoom-hint').click();f.$('zoom-extend').click();assert.equal(f.requests.length,1,'busy purchase cannot be duplicated');
   f.succeed();await flush();f.preserved();assert.equal(f.round().status,'playing');assert.equal(f.round().pending,null);assert.equal(f.round().assisted,true);
   if(kind==='time')assert.ok(f.round().remainingMs>38000);else assert.equal(f.round().paid.length,1);
  }finally{f.w.close();}
 }
 for(const kind of ['hint','time']){
  const f=fixture();try{
   f.$('zoom-'+(kind==='hint'?'hint':'extend')).click();f.fail();await flush();f.preserved();
   assert.equal(f.round().status,'payment');assert.equal(f.$('zoom-hint').disabled,false);assert.equal(f.$('zoom-hint').textContent,'구매 다시 확인');
   f.$('zoom-hint').click();assert.equal(f.requests.length,2);assert.equal(f.requests[1].requestId,f.requests[0].requestId,'retry reuses receipt to prevent another charge');assert.equal(f.requests[1].kind,kind);
   f.succeed();await flush();f.preserved();assert.equal(f.round().pending,null);
  }finally{f.w.close();}
 }
 for(const outcome of ['cancel','empty','denied','manual-close']){
  const f=fixture();try{
   if(outcome==='cancel')f.decline();if(outcome==='empty')f.empty();f.$('zoom-hint').click();
   if(outcome==='denied'){f.deny();await flush();}
   if(outcome==='manual-close'){f.$('close-zoom').click();f.succeed();await flush();assert.equal(f.$('zoom-dialog').open,false,'user closure is respected');}
   else f.preserved();
   assert.equal(f.requests.length,['denied','manual-close'].includes(outcome)?1:0);
  }finally{f.w.close();}
 }
 const f=fixture();try{
  const marks=()=>Array.from(f.w.document.querySelectorAll('.hint-mark'));
  const buyHint=async()=>{f.$('zoom-hint').click();f.succeed();await flush();};
  const p=f.w.JJUDA_PUZZLES[48],tap=i=>{const surface=f.$('zoom-original').parentElement;surface.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800});const init={bubbles:true,clientX:p.spots[i].x*10,clientY:p.spots[i].y*8};surface.dispatchEvent(new f.w.MouseEvent('pointerdown',init));surface.dispatchEvent(new f.w.MouseEvent('click',init));};
  await buyHint();assert.equal(marks().length,4,'a purchased hint appears on both normal and zoom pictures automatically');
  const initial=marks();assert.ok(initial.every(mark=>mark.children.length===0),'hint rings do not cover the picture with stars or labels');
  await new Promise(resolve=>setTimeout(resolve,3900));assert.deepEqual(marks(),initial,'hint persists beyond the former 3.5-second expiry');
  f.$('hide-hint').click();assert.deepEqual(marks(),initial,'closing hint text keeps the hint ring');
  f.$('zoom-hint').click();assert.equal(f.requests.length,1,'showing an existing hint does not charge again');
  tap(5);assert.deepEqual(marks(),initial,'finding a different answer does not restart or remove the hint');
  await buyHint();assert.equal(marks().length,8,'two unfound purchased hints remain together');assert.ok(initial.every(mark=>mark.isConnected));
  f.$('close-zoom').click();f.$('zoom').click();assert.equal(marks().length,8,'opening zoom preserves both hints');
  tap(0);assert.equal(marks().length,4);assert.ok(marks().every(mark=>mark.dataset.hintKey==='49:1'),'only the found hint disappears');
  tap(1);assert.equal(marks().length,0,'finding the second hint removes it from all four pictures');
  for(const i of [2,3,4])tap(i);assert.equal(f.$('found-count').textContent,'6');assert.equal(marks().length,0);assert.equal(f.$('celebration').open,true);
 }finally{f.w.close();}
 const host=new JSDOM('<!doctype html><body><button id="arcade">오락실</button></body>',{url:'https://fixture.test/world.html?tab=arcade',runScripts:'outside-only'});
 try{
  const w=host.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};let closed=0;
  w.eval(fs.readFileSync(path.join(root,'../../world-spot-game.js'),'utf8'));w.OjjudaSpotGame.open({onClose:()=>closed++});
  const frame=w.document.querySelector('iframe'),send=(origin,source)=>w.dispatchEvent(new w.MessageEvent('message',{origin,source,data:{type:'ojjuda:spot-home'}}));
  assert.equal(w.document.querySelector('.spot-game-header button').textContent,'아지트 홈');
  send('https://other.test',frame.contentWindow);send(w.location.origin,w);assert.ok(w.document.querySelector('.spot-game-dialog'),'ignore foreign home requests');
  send(w.location.origin,frame.contentWindow);await flush();assert.equal(w.document.querySelector('.spot-game-dialog'),null);assert.equal(w.document.body.classList.contains('gaming'),false);assert.equal(closed,1);
  assert.match(read('index.html'),/id="game-home"[^>]+href="\/world.html\?tab=arcade"/);assert.match(read('index.html'),/id="zoom-home"[^>]+href="\/world.html\?tab=arcade"/);
 }finally{host.window.close();}
 console.log('PASS: zoom/pan retained for paid help and retry; single receipt; persistent hint rings removed per found answer; safe home controls and iframe exit');
})().catch(error=>{console.error(error);process.exitCode=1;});
