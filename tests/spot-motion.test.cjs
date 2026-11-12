const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'../games/spot-difference');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const catalogFiles=['puzzles.js','photo-puzzles.js','masterpiece-puzzles.js','fairytale-pets-puzzles.js','motion/scenes.js'];
const core=require(path.join(root,'game-core.js'));

test('30 motion scenes have five static answers, five motion answers and ten matching moving regions',()=>{
  const ctx=vm.createContext({window:{}});
  for(const file of catalogFiles)vm.runInContext(read(file),ctx);
  const catalog=ctx.window.JJUDA_PUZZLES;
  const motion=Array.from(catalog).filter(p=>p.motionScene);
  assert.equal(catalog.length,182);
  assert.deepEqual(motion.map(p=>p.id),Array.from({length:30},(_,i)=>153+i));
  for(const p of motion){
    const scene=p.motionScene;
    assert.deepEqual([scene.static.length,scene.motion.length,scene.common.length,p.spots.length],[5,5,10,10],p.title);
    const bytes=fs.readFileSync(path.join(root,p.original));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
    assert.equal(bytes.readUInt32LE(4)+8,bytes.length,p.original);
    assert.equal(p.difference,p.original,'both views share the same source photograph');
    for(const [i,s] of [...scene.static,...scene.motion].entries()){
      assert.equal(core.hitTest(p,s.x/10,s.y/10,[],{x:4,y:6})?.index,i,p.title+' · '+s.label);
    }
    for(const s of scene.common)assert.equal(core.hitTest(p,s.x/10,s.y/10,[],{x:4,y:6}),null,p.title+' · '+s.label);
  }
});

test('native menu launches motion independently, counts all ten, records stable ID and unlocks only its next stage',async t=>{
  const dom=new JSDOM(read('index.html'),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,$=id=>d.getElementById(id);
  t.after(()=>w.close());
  const record=[],draws=[];
  w.matchMedia=()=>({matches:true});
  w.HTMLCanvasElement.prototype.getContext=()=>({setTransform(){}});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.setInterval=()=>1;w.scrollTo=()=>{};
  const member={userId:'11111111-1111-4111-8111-111111111111',coins:5};
  w.JjudaWallet={getState:()=>member,subscribe:fn=>fn(member),recordClear:async(id,stage)=>{record.push([id,stage]);return {ok:true};}};
  const includes=[...d.querySelectorAll('script[src]')].map(s=>s.getAttribute('src').split('?')[0]);
  const scripts=[...catalogFiles,'motion/render.js','motion/native.js','game-core.js','app.js'];
  assert.deepEqual(includes.filter(f=>scripts.includes(f)),scripts,'native entry loads the scene data and renderer before setup');
  for(const file of scripts){
    w.eval(read(file));
    if(file==='motion/render.js')w.OjjudaMotionRenderer.create=(image,scene)=>({draw:(_ctx,side,time)=>draws.push([scene.id,side,time])});
  }
  const imagesReady=()=>{for(const image of d.querySelectorAll('img'))image.onload?.();};
  const enabled=()=>Array.from($('stage-picker').options).filter(o=>!o.disabled).map(o=>w.JJUDA_PUZZLES[o.value].id);
  imagesReady();
  assert.deepEqual(enabled(),[1]);
  $('motion-entry').click();imagesReady();
  assert.deepEqual(enabled(),[153]);
  assert.equal($('stage-total').textContent,'30');
  assert.equal($('found-total').textContent,'10');
  assert.equal(d.querySelectorAll('.native-motion-canvas').length,4);
  assert.deepEqual(draws.slice(0,2),[[1,0,0],[1,1,0]]);
  const p=w.JJUDA_PUZZLES[Number($('stage-picker').value)];
  $('start').click();
  function tap(x,y,side){
    const surface=$(side).parentElement;
    surface.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:1000});
    const init={bubbles:true,clientX:x*10,clientY:y*10};
    surface.dispatchEvent(new w.MouseEvent('pointerdown',init));surface.dispatchEvent(new w.MouseEvent('click',init));
  }
  const common=p.motionScene.common[0];
  tap(common.x/10,common.y/10,'original');assert.equal($('found-count').textContent,'0');
  for(const [idx,s] of p.spots.entries())tap(s.x,s.y,idx%2?'original':'difference');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal($('found-count').textContent,'10');assert.equal($('celebration').open,true);
  assert.deepEqual(record,[[member.userId,153]]);assert.deepEqual(enabled(),[153,154]);
});
