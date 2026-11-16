import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createThrow,sampleThrow} from '../games/yut/toss.mjs';
import {createBoard} from '../games/yut/board.mjs';

test('each stick rebounds briefly once and settles on its rolled face in the pile',()=>{
  const arrangements=new Set();
  for(let bits=0;bits<16;bits++){
    const faces=[0,1,2,3].map(i=>(bits>>i)&1);
    const plan=createThrow(faces,123+bits);
    const rest=sampleThrow(plan,plan.totalMs),upper=rest[plan.upper];
    assert.notEqual(plan.upper,plan.base);
    assert.equal(upper.baseIndex,plan.base);
    assert.ok(upper.contact && upper.contact.gap<.001 && Math.abs(upper.pitch)>.05);
    arrangements.add([plan.base,plan.upper,Math.round(upper.yaw*10)].join('/'));
    for(const rod of plan.rods){
      const at=t=>sampleThrow(plan,t)[rod.index];
      const impact=rod.delay+rod.flight;
      const apex=at(rod.delay+rod.flight*.5).height, contact=at(impact);
      const rebound=at(impact+rod.bounce*.5);
      assert.ok(apex>150);
      assert.ok(Math.abs(contact.arc)<.001&&Math.abs(contact.pitch)>.1);
      assert.ok(rod.bounce>=150 && rod.bounce<=250);
      assert.ok(rebound.phase==='bounce' && rebound.arc>apex*.012 && rebound.arc<apex*.1);
      for(let t=impact+rod.bounce+1;t<=plan.totalMs;t+=16)assert.equal(at(t).arc,0);
      for(const boundary of [impact,impact+rod.bounce,rod.finish]){
        const left=at(boundary-.01),right=at(boundary+.01);
        assert.ok(Math.hypot(left.x-right.x,left.depth-right.depth,left.height-right.height)<.1);
      }
      const end=at(plan.settleMs+1);
      assert.ok(end.settled);
      if(rod.index!==plan.upper)assert.equal(end.height,0);
      assert.equal(end.roll,rod.face===1?0:Math.PI);
    }
    assert.ok(plan.totalMs-plan.settleMs>=450);
  }
  assert.ok(arrangements.size>4);
});

test('a throw waits for a player to place a piece, including a reserve piece',async t=>{
  const html=readFileSync(new URL('../games/yut/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://example.test/games/yut/'});
  const {window:w}=dom, doc=w.document, frames=new Map();
  const prefs={matches:false,addEventListener(){}};
  for(const [key,val] of Object.entries({window:w,document:doc,location:w.location,history:w.history,matchMedia:()=>prefs})){
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:val});
  }
  let fid=0;
  globalThis.requestAnimationFrame=f=>{frames.set(++fid,f);return fid;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const gradient=()=>({addColorStop(){}});
  const ctx=new Proxy({createLinearGradient:gradient,createRadialGradient:gradient},{get(target,key){return target[key]??(()=>{});}});
  w.HTMLCanvasElement.prototype.getContext=()=>ctx;
  w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:390,height:500,left:0,top:0});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  t.after(()=>dom.window.close());
  const first=()=>doc.querySelector('#actions button'), text=id=>doc.getElementById(id).textContent;
  const tick=()=>{const queued=[...frames.values()];frames.clear();queued.forEach(f=>f(performance.now()+4000));};
  const until=async(pred)=>{for(let i=0;i<100;i++){if(pred())return;await new Promise(r=>setTimeout(r,20));}assert.fail('state did not arrive');};
  function setFaces(n){let i=0;t.mock.method(Math,'random',()=>i++%4<n?0.1:0.9);}
  function chooseMove(which){
    assert.equal(first().textContent,'이동 선택');
    first().click();
    const choices=doc.querySelectorAll('#dialog-body .choice');
    assert.ok(choices.length>which);
    choices[which].click();
  }
  await import('../games/yut/play.mjs');
  assert.equal(first().textContent,'윷 던지기');
  const rack=doc.getElementById('rack-canvas');
  assert.equal(text('rack-title'),'던질 윷');
  assert.equal(rack.width,390);
  assert.equal(rack.height,500);
  setFaces(1);first().click();
  assert.equal(doc.getElementById('toss-layer').hidden,false);assert.equal(text('outcome'),'');assert.ok(first().disabled);
  tick();
  await until(()=>first().textContent==='이동 선택');
  await new Promise(r=>setTimeout(r,350));
  assert.match(text('team-title'),/산호/);
  assert.match(text('note'),/끌어/);
  assert.equal(text('outcome'),'도 · 1칸'); assert.ok(doc.getElementById('toss-layer').hidden);
  assert.equal(rack.getAttribute('aria-label'),'던진 윷 네 가락 · 도 · 1칸');
  tick();
  const canvas=doc.getElementById('board');
  function pointer(type,x,y){
    const e=new w.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true,cancelable:true});
    Object.defineProperty(e,'pointerId',{value:1});canvas.dispatchEvent(e);
  }
  // With both pieces still waiting, tapping the highlighted first square opens
  // the two legal choices without committing either. Use that hit to drop #2.
  let destination;
  for(let y=0;y<500&&!destination;y+=6)for(let x=0;x<390&&!destination;x+=6){
    pointer('click',x,y);if(doc.querySelector('dialog').open)destination=[x,y];
  }
  assert.ok(destination);
  doc.getElementById('close').click();
  tick();
  let held=false;
  for(let y=0;y<500&&!held;y+=6)for(let x=0;x<390&&!held;x+=6){
    pointer('pointerdown',x,y);
    held=text('note').startsWith('2번 말');
    if(!held)pointer('pointercancel',x,y);
  }
  assert.ok(held);
  assert.match(text('note'),/2번 말/);
  pointer('pointermove',...destination);tick();pointer('pointerup',...destination);
  await until(()=>text('team-title').includes('바다')&&first().textContent==='윷 던지기');
  prefs.matches=true;setFaces(2);first().click();
  assert.ok(doc.getElementById('toss-layer').hidden);
  chooseMove(0);
  await until(()=>text('team-title').includes('산호')&&first().textContent==='윷 던지기');
  assert.equal(rack.getAttribute('aria-label'),'던진 윷 네 가락 · 개 · 2칸');
  setFaces(1);first().click();
  chooseMove(0);
  assert.ok(text('team-title').includes('바다'));
  doc.getElementById('team-title').click();assert.ok(doc.querySelector('dialog').open);
  assert.equal(doc.querySelectorAll('.score-card').length,2);
  doc.getElementById('close').click();doc.getElementById('settings').click();
  [...doc.querySelectorAll('#dialog-body button')].find(b=>b.textContent==='놀이 방법').click();
  assert.deepEqual([...doc.querySelectorAll('.effect-row b')].map(el=>el.textContent),['바위턱','소용돌이','순풍']);
  doc.getElementById('close').click();doc.getElementById('settings').click();
  const pair=doc.getElementById('zodiac-pair');
  assert.equal(pair.options.length,12);
  pair.value='11';pair.dispatchEvent(new w.Event('change'));
  [...doc.querySelectorAll('#dialog-body button')].find(b=>b.textContent==='한 기기에서 새로 시작').click();
  [...doc.querySelectorAll('#dialog-body button')].find(b=>b.textContent==='계속하기').click();
  doc.getElementById('team-title').click();
  assert.match(doc.querySelector('.score-card').textContent,/1번 말 · 돼지/);
  assert.match(doc.querySelector('.score-card').textContent,/2번 말 · 쥐/);
});

test('board dragging uses the chosen pawn and its legal squares, including after rotation',()=>{
  globalThis.window={devicePixelRatio:1,addEventListener(){},removeEventListener(){}};
  globalThis.matchMedia=()=>({matches:true});
  let frame;
  globalThis.requestAnimationFrame=fn=>{frame=fn;return 1;};
  globalThis.cancelAnimationFrame=()=>{};
  const draw=()=>frame(performance.now());
  const grad=()=>({addColorStop(){}});
  const tags=new Map();
  const ctx=new Proxy({createLinearGradient:grad,createRadialGradient:grad,fillText:(s,x,y)=>tags.set(s,[x,y])},
    {get:(obj,key)=>obj[key]??(()=>{})});
  const handlers=new Map(),bounds={left:0,top:0,width:390,height:390};
  const canvas={width:390,height:390,style:{},getContext:()=>ctx,getBoundingClientRect:()=>bounds,
    addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener(){},
    setPointerCapture(){},releasePointerCapture(){},classList:{toggle(){}}};
  const options=[{team:0,index:0,from:1,to:2},{team:0,index:1,from:7,to:8}];
  let touched=null,selected=null;const drops=[];
  const board=createBoard(canvas,n=>{touched=n},i=>{selected=i;board.setMoves(options,i)},(i,n)=>drops.push([i,n]));
  const pointer=(type,x,y)=>handlers.get(type)({pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:y,preventDefault(){}});
  board.setState({activeTeam:0,pieces:[{team:0,index:0,node:1},{team:0,index:1,node:7}]});
  for(const orientation of [0,90]){
    board.setMoves([],null);
    if(orientation)board.rotate();
    board.setTargets([1,2,7,8]);draw();
    const spans=new Map();
    for(let y=0;y<390;y+=4)for(let x=0;x<390;x+=4){
      touched=null;pointer('click',x,y);
      if(touched===null)continue;
      const box=spans.get(touched)??[x,y,x,y];
      spans.set(touched,[Math.min(x,box[0]),Math.min(y,box[1]),Math.max(x,box[2]),Math.max(y,box[3])]);
    }
    const center=n=>{const [x,y,right,bottom]=spans.get(n);return [(x+right)/2,(y+bottom)/2];};
    assert.equal(spans.size,4);
    board.setTargets([]);board.setMoves(options,null);draw();
    const start=center(1),legal=center(2),illegal=center(8);
    const before=drops.length;
    pointer('pointerdown',...start);pointer('pointermove',...illegal);pointer('pointerup',...illegal);
    assert.equal(drops.length,before);
    pointer('pointerdown',...start);pointer('pointermove',...legal);pointer('pointercancel',...legal);
    assert.equal(drops.length,before);
    pointer('pointerdown',...start);pointer('pointermove',...legal);draw();pointer('pointerup',...legal);
    assert.equal(selected,0);
    assert.deepEqual(drops.slice(before),[[0,2]]);
  }
  board.setState({activeTeam:0,pieces:[{team:0,index:0,node:1},{team:1,index:0,node:2},{team:1,index:1,node:2}],
    waiting:[{team:0,index:1}],snap:true});
  board.setMoves([options[0]],null);tags.clear();draw();
  assert.deepEqual([...tags.keys()].sort(),['산호 1','바다 1·2','대기 2'].sort());
  const before=drops.length,source=tags.get('산호 1'),occupied=tags.get('바다 1·2');
  pointer('pointerdown',...source);pointer('pointermove',...occupied);draw();pointer('pointerup',...occupied);
  assert.deepEqual(drops.slice(before),[[0,2]]);
  board.destroy();
});

test('destination light rises, accepts a drop on its shaft and stops animating',()=>{
  globalThis.window={devicePixelRatio:1,addEventListener(){},removeEventListener(){}};
  let reduced=false;
  globalThis.matchMedia=()=>({matches:reduced});
  let pending=null;
  globalThis.requestAnimationFrame=fn=>{pending=fn;return 1;};
  globalThis.cancelAnimationFrame=()=>{pending=null;};
  const paint=time=>{const run=pending;assert.ok(run);pending=null;run(time);};
  const grad=()=>({addColorStop(){}});
  const ctx=new Proxy({createLinearGradient:grad,createRadialGradient:grad},{get:(o,k)=>o[k]??(()=>{})});
  const handlers=new Map(),canvas={style:{},classList:{toggle(){}},width:390,height:390,
    getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:390,height:390}),
    addEventListener:(k,v)=>handlers.set(k,v),removeEventListener(){}};
  let hit=null;
  const board=createBoard(canvas,n=>{hit=n});
  const tap=(x,y)=>{hit=null;handlers.get('click')({clientX:x,clientY:y});return hit;};
  board.setTargets([22]);paint(100);
  const base=[];
  for(let y=0;y<390;y++)if(tap(195,y)===22)base.push(y);
  const above=base[0]-9;
  assert.ok(base.length>=30);
  assert.equal(tap(195,above),null);
  paint(700);assert.equal(tap(195,above),22);
  paint(1500);assert.equal(pending,null);
  board.setTargets([]);paint(1510);
  assert.equal(tap(195,above),null);assert.equal(pending,null);
  reduced=true;board.setTargets([22]);paint(1520);
  assert.equal(tap(195,above),22);assert.equal(pending,null);
  board.destroy();
});
