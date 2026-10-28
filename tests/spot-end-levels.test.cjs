const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'../games/spot-difference'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
function fixture(pos=1,allDone=false){
 const dom=new JSDOM(read('index.html'),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,$=id=>d.getElementById(id);
 let now=100000,timerId=0;const timers=new Map(),intervals=[],scores=[],charges=[];
 w.Date.now=()=>now;w.setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=fn=>intervals.push(fn);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.scrollTo=()=>{};w.confirm=()=>true;
 w.JjudaWallet={getState:()=>({userId:'member-a',coins:100}),subscribe:fn=>fn({userId:'member-a',coins:100}),refresh:async()=>{},recordClear:async(owner,stage)=>{scores.push(stage);return {ok:true};},buy:request=>{charges.push(request);return new Promise(()=>{});}};
 for(const file of ['puzzles.js','photo-puzzles.js','game-core.js'])w.eval(read(file));
 const puzzles=w.JJUDA_PUZZLES,order=[48,50,49,...Array.from({length:puzzles.length},(_,i)=>i).filter(i=>![48,50,49].includes(i))],clean=w.JjudaGame.cleanProgress;
 w.JjudaGame.cleanProgress=(raw,p)=>{const s=clean(raw,p);s.order=order;s.current=order[pos];if(allDone)for(const i of order.filter(i=>i!==s.current)){s.found[p[i].id]=[0,1,2,3,4,5];s.rounds[p[i].id]={...w.JjudaGame.freshRound(),status:'won'};}return s;};
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
 return {w,d,$,order,state,round,load,advance,end,scores,charges};
}
for(const reason of ['won','time','hearts'])for(const offset of [-1,0,1]){
 const f=fixture();try{
  assert(f.$('retry-level-choice').hidden,'no level choice during entry or play');f.end(reason);
  const id=reason==='won'?'celebration-level':'retry-level',button=reason==='won'?'celebration-next':'start',select=f.$(id),completed=f.state().current;
  assert.equal(f.round().status,reason==='won'?'won':'lost');assert.equal(select.options.length,3);
  assert.deepEqual(Array.from(select.options,o=>o.textContent),['이전 레벨 · 1 / 62','현재 레벨 · 2 / 62','다음 레벨 · 3 / 62']);
  assert.equal(select.value,reason==='won'?'1':'0');
  f.advance(6000);assert.equal(f.state().current,completed,'result waits without automatically advancing');
  select.value=String(offset);select.dispatchEvent(new f.w.Event('change'));assert.equal(f.state().current,completed,'choosing alone does not discard the result');
  const oldOnload=f.$('original').onload;f.$(button).click();
  assert.equal(f.state().current,f.order[1+offset],'navigation follows shuffled level order');assert.equal(f.round().status,'ready');assert.equal(f.round().hearts,3);assert.equal(f.$('found-count').textContent,'0');assert.equal(f.$('celebration').open,false);
  f.advance(15000);oldOnload();assert.equal(f.round().status,'ready','old image callbacks cannot start the chosen level');assert.equal(f.$('time-left').textContent,'60','loading never consumes play time');
  f.load();assert.equal(f.round().status,'playing');assert(f.$('retry-level-choice').hidden);assert.equal(f.$('time-left').textContent,'60');
  assert.deepEqual(f.scores,reason==='won'?[completed+1]:[],'selection never submits a completion or erases an already submitted score');assert.equal(f.charges.length,0,'level choice does not spend ZU');
 }finally{f.w.close();}
}
for(const pos of [0,61]){
 const f=fixture(pos,pos===61);try{
  f.end('won');const select=f.$('celebration-level');
  assert.equal(select.options[0].disabled,pos===0);assert.equal(select.options[2].disabled,pos===61);
  assert.equal(select.value,pos===0?'1':'0');
  if(pos===61)assert.match(f.$('celebration-title').textContent,/모든 그림/);
  const current=f.state().current;select.value=pos===0?'-1':'1';f.$('celebration-next').click();assert.equal(f.state().current,current,'out-of-range choice cannot wrap or break the game');
  select.value='0';f.$('celebration-next').click();f.load();assert.equal(f.state().current,current);assert.equal(f.round().status,'playing');
 }finally{f.w.close();}
}
const f=fixture();try{
 for(let i=0;i<3;i++){f.end('time');f.$('retry-level').value='0';f.$('start').click();f.load();assert.equal(f.state().current,f.order[1],'current level can be replayed after each ended round');}
 f.advance(61000);f.$('extend').click();assert.equal(f.round().status,'payment');assert.equal(f.$('retry-level-choice').hidden,true,'unresolved payment hides level choices');
 const current=f.state().current;f.$('celebration-next').click();assert.equal(f.state().current,current);assert.equal(f.charges.length,1,'an unresolved payment cannot be discarded by level selection');
}finally{f.w.close();}
console.log('PASS: win, timeout and hearts choices; previous/current/next in shuffled order; no automatic navigation; first/last boundaries; repeat current; load-safe timer, completion and purchase safeguards.');
