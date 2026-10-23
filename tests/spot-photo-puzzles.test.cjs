const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..','games','spot-difference');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const dom=new JSDOM(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;const scores=[],registered=[];
try{
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});
 w.document.modelContext={registerTool:tool=>registered.push(tool)};
 w.JjudaWallet={getState:()=>({ready:true,userId:'fixture-member',coins:0}),subscribe:fn=>fn({ready:true,userId:'fixture-member',coins:0}),recordClear:async(owner,stage)=>{scores.push(stage);return {ok:true};},refresh:async()=>{},buy:()=>{throw Error('unexpected payment');}};
 for(const f of ['puzzles.js','photo-puzzles.js','game-core.js'])w.eval(read(f));
 const puzzles=w.JJUDA_PUZZLES,photos=puzzles.slice(48),core=w.JjudaGame;
 assert.equal(puzzles.length,62);assert.equal(new Set(puzzles.map(p=>p.id)).size,62);
 assert.deepEqual(Array.from(photos,p=>p.id),Array.from({length:14},(_,i)=>49+i));
 assert.equal(photos.filter(p=>p.category==='city').length,10);assert.equal(photos.filter(p=>p.category==='mountain').length,4);
 assert.deepEqual(Array.from(photos.slice(10),p=>p.title.split(' · ')[0]),['봄','여름','가을','겨울']);
 const manifest=JSON.parse(read('photo-assets.json'));
 assert.equal(manifest.puzzles.length,14);
 for(const p of photos){
  assert.equal(p.difficulty,'hard');assert.equal(p.spots.length,6);
  assert.equal(p.original,p.difference,'both sides use identical base pixels outside the six masks');
  assert.equal(p.layers.length,1);assert.equal(p.layers[0].regions.length,6);
  assert.deepEqual(Array.from(p.layers[0].regions,r=>r.spotIndex),[0,1,2,3,4,5]);
  for(let i=0;i<6;i++){
   const s=p.spots[i],r=p.layers[0].regions[i],b=s.targetBounds;
   assert.equal(r.shape,'rect');assert.ok(b.left>=0&&b.top>=0&&b.right<=100&&b.bottom<=100);
   assert.ok(b.right>b.left&&b.bottom>b.top);assert.ok((b.right-b.left)*(b.bottom-b.top)<140,'hard differences stay local');
   assert.ok(Math.abs(r.x-r.rx-b.left)<1e-8&&Math.abs(r.y-r.ry-b.top)<1e-8&&Math.abs(r.x+r.rx-b.right)<1e-8&&Math.abs(r.y+r.ry-b.bottom)<1e-8);
   for(const [x,y] of [[s.x,s.y],[b.left,b.top],[b.right,b.bottom],[b.left,b.bottom],[b.right,b.top]])assert.equal(core.hitTest(p,x,y)?.index,i,`stage ${p.id} difference ${i+1}: all changed pixels can be selected`);
   assert.equal(core.hitTest(p,s.x,s.y,[i]).alreadyFound,true);
   for(let j=0;j<i;j++){const t=p.spots[j].targetBounds;assert.ok(b.right<t.left||b.left>t.right||b.bottom<t.top||b.top>t.bottom,'six independent non-overlapping edited regions');}
  }
  const assets=manifest.puzzles.find(m=>m.id===p.id).files;
  for(const f of Object.values(assets)){const bytes=fs.readFileSync(path.join(root,f.path));assert.equal(bytes.length,f.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(f.width,1536);assert.equal(f.height,1024);}
 }
 w.eval(read('app.js'));
 const $=id=>w.document.getElementById(id);
 const groups=Array.from($('stage-picker').children,g=>[g.label,g.children.length]);
 assert.deepEqual(groups,[['도시 풍경 · 어려움',10],['사계절 산 · 어려움',4],['쭈다의 일상',48]]);
 assert.equal($('stage-total').textContent,'62');
 const loadImages=()=>{for(const im of w.document.querySelectorAll('img'))if(im.onload)im.onload();};
 const tap=(surface,x,y)=>{const point={bubbles:true,clientX:x*8,clientY:y*5.33};surface.dispatchEvent(new w.MouseEvent('pointerdown',point));surface.dispatchEvent(new w.MouseEvent('click',point));};
 for(const surface of w.document.querySelectorAll('.picture'))surface.getBoundingClientRect=()=>({left:0,top:0,width:800,height:533});
 for(const p of photos){
  $('stage-picker').value=p.id-1;$('stage-picker').dispatchEvent(new w.Event('change'));loadImages();
  assert.equal($('start').disabled,false);assert.match($('stage-label').textContent,/62.*어려움/);
  assert.equal(w.document.querySelectorAll('.contrast-overlay').length,2,'one mask layer in the main and zoom views');
  const overlay=w.document.querySelector('.contrast-overlay');assert.equal(overlay.style.maskImage.split('linear-gradient').length-1,6);
  $('start').click();assert.equal($('board-curtain').hidden,true);
  const surface=$('original').parentElement;
  tap(surface,p.spots[0].x,p.spots[0].y);tap(surface,p.spots[0].x,p.spots[0].y);
  assert.equal($('found-count').textContent,'1');assert.equal($('hearts').getAttribute('aria-label'),'남은 하트 3개');
  let miss;for(let y=2;y<100&&!miss;y+=7)for(let x=2;x<100&&!miss;x+=7)if(!core.hitTest(p,x,y))miss=[x,y];
  tap(surface,...miss);assert.equal($('hearts').getAttribute('aria-label'),'남은 하트 2개');
  for(const s of p.spots.slice(1))tap($('difference').parentElement,s.x,s.y);
  assert.equal($('found-count').textContent,'6');assert.equal($('celebration').open,true);$('celebration').close();
 }
 assert.deepEqual(scores,Array.from({length:14},(_,i)=>49+i));
 assert.equal($('solved-total').textContent,'14');
 const progress=registered.find(t=>t.name==='read_game_progress'),open=registered.find(t=>t.name==='open_game_stage');
 assert.equal(progress.execute().totalStages,62);assert.equal(open.inputSchema.properties.stage.maximum,62);
 assert.equal(open.execute({stage:62}).stage,62);assert.throws(()=>open.execute({stage:63}),/1~62/);
 console.log('PASS: 14 hard photo pairs, 84 independent masks, all target corners clickable, 28 image hashes, grouping, duplicate/miss handling, completion recording and stage-62 WebMCP');
}finally{w.close();}
