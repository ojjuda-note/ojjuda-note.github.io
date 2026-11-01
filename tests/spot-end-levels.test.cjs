const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'../games/spot-difference'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
function fixture(pos=48,allDone=false){
 const dom=new JSDOM(read('index.html'),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,$=id=>d.getElementById(id);
 let now=100000,timerId=0;const timers=new Map(),intervals=[],scores=[],charges=[];
 w.Date.now=()=>now;w.setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=fn=>intervals.push(fn);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.scrollTo=()=>{};w.confirm=()=>true;
 w.JjudaWallet={getState:()=>({userId:'member-a',coins:100}),subscribe:fn=>fn({userId:'member-a',coins:100}),refresh:async()=>{},recordClear:async(owner,stage)=>{scores.push(stage);return {ok:true};},buy:request=>{charges.push(request);return new Promise(()=>{});}};
 for(const file of ['puzzles.js','photo-puzzles.js','masterpiece-puzzles.js','game-core.js'])w.eval(read(file));
 const puzzles=w.JJUDA_PUZZLES,order=Array.from(w.JjudaGame.difficultyOrder(puzzles)),position=pos==='last'?order.length-1:pos,current=order[position];
 w.localStorage.setItem('jjuda-spot-six-v1',JSON.stringify({version:2,current,order:[...order].reverse(),completed:allDone?puzzles.filter((_,i)=>i!==current).map(p=>p.id):[]}));
 w.eval(read('app.js'));
 const state=()=>JSON.parse(w.localStorage.getItem('jjuda-spot-six-v1')),round=()=>{const s=state();return s.rounds[puzzles[s.current].id];};
 const load=()=>{for(const im of d.querySelectorAll('img'))if(im.onload)im.onload();};
 const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}for(const tick of intervals)tick();};
 const surface=$('original').parentElement;surface.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800});
 function tap(x,y){const init={bubbles:true,clientX:x*10,clientY:y*8};surface.dispatchEvent(new w.MouseEvent('pointerdown',init));surface.dispatchEvent(new w.MouseEvent('click',init));}
 function end(reason){
  load();$('start').click();
  if(reason==='won')for(const s of puzzles[state().current].spots)tap(s.x,s.y);
  else if(reason==='time')advance(61000);
  else{let miss;for(let y=1;y<100&&!miss;y+=5)for(let x=1;x<100&&!miss;x+=5)if(!w.JjudaGame.hitTest(puzzles[state().current],x,y))miss=[x,y];for(let i=0;i<3;i++)tap(...miss);}
 }
 return {w,d,$,order,position,puzzles,state,round,load,advance,end,scores,charges};
}
for(const reason of ['won','time','hearts'])for(const offset of [-1,0,1]){
 const f=fixture();try{
  assert(f.$('retry-level-choice').hidden,'no level choice during entry or play');f.end(reason);
  const prefix=reason==='won'?'celebration':'retry',names=['previous','current','next'],completed=f.state().current;
  assert.equal(f.round().status,reason==='won'?'won':'lost');
  assert.deepEqual(names.map(name=>f.$(prefix+'-'+name).querySelector('span').textContent),['이전 그림','지금 그림','다음 그림']);
  assert.deepEqual(names.map(name=>f.$(prefix+'-'+name).querySelector('small').textContent),['48 / 82 · 보통','49 / 82 · 어려움','50 / 82 · 어려움']);
  if(reason!=='won')assert.equal(f.$('start').hidden,true,'failure exposes direct choices without a second Start confirmation');
  f.advance(6000);assert.equal(f.state().current,completed,'result waits without automatically advancing');
  const oldOnload=f.$('original').onload;f.$(prefix+'-'+names[offset+1]).click();
  assert.equal(f.state().current,f.order[f.position+offset],'one click enters the adjacent difficulty-ordered picture');assert.equal(f.round().status,'ready');assert.equal(f.round().hearts,3);assert.equal(f.$('found-count').textContent,'0');assert.equal(f.$('celebration').open,false);
  f.advance(15000);oldOnload();assert.equal(f.round().status,'ready','old image callbacks cannot start the chosen level');assert.equal(f.$('time-left').textContent,'60','loading never consumes play time');
  f.load();assert.equal(f.round().status,'playing');assert(f.$('retry-level-choice').hidden);assert.equal(f.$('time-left').textContent,'60');
  assert.deepEqual(f.scores,reason==='won'?[f.puzzles[completed].id]:[],'selection never submits a completion or erases an already submitted score');assert.equal(f.charges.length,0,'picture choice does not spend ZU');
  assert.equal(f.state().completed.includes(f.puzzles[completed].id),reason==='won','replaying retains completed history separately from the fresh board');
 }finally{f.w.close();}
}
for(const pos of [0,'last']){
 const f=fixture(pos,pos==='last');try{
  f.end('won');
  assert.equal(f.$('celebration-previous').disabled,pos===0);assert.equal(f.$('celebration-next').disabled,pos==='last');
  if(pos==='last')assert.match(f.$('celebration-title').textContent,/모든 그림/);
  const current=f.state().current;f.$(pos===0?'celebration-previous':'celebration-next').click();assert.equal(f.state().current,current,'out-of-range choice cannot wrap or break the game');
  f.$('celebration-current').click();f.load();assert.equal(f.state().current,current);assert.equal(f.round().status,'playing');
 }finally{f.w.close();}
}
const f=fixture();try{
 for(let i=0;i<3;i++){f.end('time');f.$('retry-current').click();f.load();assert.equal(f.state().current,f.order[f.position],'current picture can be replayed after each ended round');}
 f.advance(61000);f.$('extend').click();assert.equal(f.round().status,'payment');assert.equal(f.$('retry-level-choice').hidden,true,'unresolved payment hides level choices');
 const current=f.state().current;f.$('celebration-next').click();assert.equal(f.state().current,current);assert.equal(f.charges.length,1,'an unresolved payment cannot be discarded by level selection');
}finally{f.w.close();}
console.log('PASS: direct win, timeout and hearts choices; previous/current/next in difficulty order; no automatic navigation; first/last boundaries; repeat current; load-safe timer, completed history and purchase safeguards.');
