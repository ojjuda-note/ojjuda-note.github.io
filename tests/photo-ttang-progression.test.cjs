const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'games/photo-ttang.html'),'utf8');

function fixture(t){
  const dom=new JSDOM(html,{url:'https://fixture.test/photo',runScripts:'outside-only'}),w=dom.window;
  const timers=new Map();let nextTimer=0;const noop=()=>{};
  w.requestAnimationFrame=noop;w.OjjudaPhotoTtangAccess={allowed:()=>true,subscribe:()=>noop};
  w.setTimeout=(fn,ms)=>{timers.set(++nextTimer,{fn,ms});return nextTimer;};
  w.clearTimeout=id=>timers.delete(id);
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({createImageData:(x,y)=>({data:new Uint8ClampedArray(x*y*4)}),measureText:()=>({width:10})},{get:(object,key)=>object[key]||noop});
  w.eval(fs.readFileSync(path.join(root,'assets/photo-ttang/men-stages-v2.js'),'utf8'));
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],dom.getInternalVMContext());
  w.eval('sound=false;');
  t.after(()=>w.close());
  return {w,read:source=>w.eval(source),tick:ms=>{for(const[id,timer]of[...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}},clear:()=>{w.eval('mySil=silTotal*GOAL;win();');}};
}

test('photo stage handler rejects invalid and locked choices while preserving previously unlocked choices',t=>{
  const f=fixture(t),{w}=f;
  for(const index of[-1,1.5,40,NaN,'1'])assert.equal(w.startStage(index),false);
  const locked=w.document.querySelector('#grid [data-i="3"]');
  assert.equal(locked.disabled,true);
  locked.disabled=false;locked.click();
  assert.equal(f.read('mode'),'menu','the handler rejects a forced locked button');
  assert.equal(w.startStage(0),true);
  const world=f.read('world');assert.equal(w.startStage(3),false);assert.equal(f.read('world'),world);
  f.clear();w.toMenu();
  const available=Array.from(w.document.querySelectorAll('#grid .cell:not([disabled])'),button=>Number(button.dataset.i));
  assert.ok(available.includes(0)&&available.includes(1),'cleared and next photos remain selectable');
  assert.equal(w.startStage(available.at(-1)),true,'legacy unlocked choices remain available');
});

for(const failure of['timeout','last life'])test(`photo ${failure} offers retry only, even for a photo cleared in an earlier round`,t=>{
  const f=fixture(t),{w}=f;w.startStage(0);f.clear();assert.equal(f.read('photoDone(LIST[0])'),true);
  w.startStage(0);
  if(failure==='timeout'){w.timeUp();f.tick(500);}
  else{f.read("lives=1;world.events=[{t:'death',p:me,why:'mob'}];handleEvents();");f.tick(800);}
  assert.equal(f.read('roundCleared'),false);
  assert.equal(w.document.querySelector('#next'),null);
  assert.ok(w.document.querySelector('#again'));
  w.document.querySelector('#again').click();assert.equal(f.read('stage'),0);assert.equal(f.read('over'),false);
});

test('a current photo clear advances once and resets the next round outcome',t=>{
  const f=fixture(t),{w}=f;w.startStage(0);f.clear();f.tick(3000);
  const next=w.document.querySelector('#next');assert.ok(next);
  const stale=next.onclick;next.click();
  assert.equal(f.read('stage'),1);assert.equal(f.read('roundCleared'),false);assert.equal(f.read('over'),false);
  const current=f.read('world');stale();
  assert.equal(f.read('stage'),1);assert.equal(f.read('world'),current,'a repeated old next handler cannot skip another photo');
});

test('photo completion requires a living player and valid silhouette coverage at the actual goal',t=>{
  const f=fixture(t),{w}=f;w.startStage(0);
  const total=f.read('silTotal');
  for(const values of[[0,0],[NaN,100],[Infinity,100],[100,0],[100,NaN],[100,Infinity],[100,89]]){
    w.eval(`silTotal=${values[0]};mySil=${values[1]};`);
    assert.equal(w.win(),false);
    assert.equal(f.read('roundCleared'),false);assert.equal(f.read('over'),false);
  }
  w.eval(`silTotal=${total};mySil=silTotal*GOAL;me.alive=false;`);
  assert.equal(w.win(),false);assert.equal(f.read('photoDone(LIST[0])'),false);
  w.eval('me.alive=true;');f.clear();f.tick(3000);
  assert.equal(f.read('roundCleared'),true);assert.ok(w.document.querySelector('#next'));
});

test('an old victory Next cannot advance a failed retry with a historical clear record',t=>{
  const f=fixture(t),{w}=f;w.startStage(0);f.clear();f.tick(3000);
  const oldNext=w.document.querySelector('#next').onclick;
  w.startStage(0);w.timeUp();f.tick(500);
  assert.equal(f.read('photoDone(LIST[0])'),true);
  const failed=f.read('world');oldNext();
  assert.equal(f.read('stage'),0);assert.equal(f.read('world'),failed);assert.equal(f.read('roundCleared'),false);
  assert.ok(w.document.querySelector('#again'));
});

test('a delayed clear popup does not survive leaving or retrying the photo',t=>{
  const f=fixture(t),{w}=f;w.startStage(0);f.clear();w.toMenu();f.tick(3000);
  assert.equal(w.document.querySelector('#next'),null);
  w.startStage(0);f.clear();w.startStage(0);f.tick(3000);
  assert.equal(w.document.querySelector('#next'),null);assert.equal(f.read('roundCleared'),false);
});

test('unordered shared photos remain independently selectable',t=>{
  const f=fixture(t),{w}=f;
  f.read("tab='public';LIST=basePhotos().slice(0,2).map((photo,i)=>({...photo,id:'public-'+i,key:'cpublic-'+i}));Comm.record=()=>{};");
  assert.equal(w.startStage(1),true);assert.equal(f.read('stage'),1);
  f.clear();f.tick(3000);assert.equal(f.read('roundCleared'),true);
});

test('an uploaded photo trial can clear without offering a nonexistent next stage',t=>{
  const f=fixture(t),{w}=f;
  f.read("LIST=[{...basePhotos()[0],key:'trial-one',trial:true}];uploadTrial=document.createElement('section');");
  assert.equal(w.startStage(0),true);f.clear();f.tick(3000);
  assert.equal(f.read('roundCleared'),true);assert.equal(w.document.querySelector('#next'),null);
  assert.equal(w.document.querySelector('#list').textContent,'저장하기');
});
