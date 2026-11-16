import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createThrow,sampleThrow} from '../games/yut/toss.mjs';

test('every throw rises, contacts the floor, rebounds and settles on its authoritative faces',()=>{
  for(let bits=0;bits<16;bits++){
    const faces=[0,1,2,3].map(i=>(bits>>i)&1);
    const plan=createThrow(faces,123+bits);
    for(const rod of plan.rods){
      const at=t=>sampleThrow(plan,t)[rod.index];
      const impact=rod.delay+rod.flight;
      assert.ok(at(rod.delay+rod.flight*.5).height>150);
      assert.ok(at(impact).height<.001);
      assert.ok(at(impact+rod.bounce*.5).height>20);
      const end=at(plan.settleMs+1);
      assert.ok(end.settled);assert.equal(end.height,0);
      assert.equal(end.roll,rod.face===1?0:Math.PI);
    }
    assert.ok(plan.totalMs-plan.settleMs>=450);
  }
});

test('one tap throws and auto-moves a forced piece; an actual choice waits for input',async t=>{
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
  await import('../games/yut/play.mjs');
  assert.equal(first().textContent,'윷 던지기');
  const rack=doc.getElementById('rack-canvas');
  assert.equal(text('rack-title'),'던질 윷');
  assert.equal(rack.width,390);
  assert.equal(rack.height,500);
  setFaces(1);first().click();
  assert.equal(doc.getElementById('toss-layer').hidden,false);assert.equal(text('outcome'),'');assert.ok(first().disabled);
  tick();
  await until(()=>text('team-title').includes('바다')&&first().textContent==='윷 던지기');
  assert.equal(text('outcome'),'도 · 1칸'); assert.ok(doc.getElementById('toss-layer').hidden);
  assert.equal(rack.getAttribute('aria-label'),'던진 윷 네 가락 · 도 · 1칸');
  prefs.matches=true;setFaces(2);first().click();
  assert.ok(doc.getElementById('toss-layer').hidden);
  await until(()=>text('team-title').includes('산호')&&first().textContent==='윷 던지기');
  assert.equal(rack.getAttribute('aria-label'),'던진 윷 네 가락 · 개 · 2칸');
  setFaces(1);first().click();
  assert.equal(doc.querySelectorAll('#actions .choice').length,2);
  await new Promise(r=>setTimeout(r,320));
  assert.equal(doc.querySelectorAll('#actions .choice').length,2);
  doc.querySelectorAll('#actions .choice')[1].click();
  assert.ok(text('team-title').includes('바다'));
  doc.getElementById('team-title').click();assert.ok(doc.querySelector('dialog').open);
  assert.equal(doc.querySelectorAll('.score-card').length,2);
  doc.getElementById('close').click();doc.getElementById('settings').click();
  [...doc.querySelectorAll('#dialog-body button')].find(b=>b.textContent==='놀이 방법').click();
  assert.deepEqual([...doc.querySelectorAll('.effect-row b')].map(el=>el.textContent),['바위턱','소용돌이','순풍']);
});
