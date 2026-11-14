import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createReadingMotion} from '../games/starlit-saju/reading-motion.mjs';

const {JSDOM}=createRequire(import.meta.url)('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

function scene(t,{reduced='false',systemReduced=false,waapi=true,width=320}={}) {
  const dom=new JSDOM(`<!doctype html><html${reduced===null?'':` data-reduced-motion="${reduced}"`}><body><main><div id="reader"><nav><button id="previous">이전</button><button id="next">다음</button></nav><article id="first" data-reader-current="true"><h3 id="first-title">첫 이야기</h3><p id="first-copy">처음 읽는 내용입니다.</p><a href="#first-title">다시 읽기</a></article><article id="second" hidden><h3 id="second-title">다음 이야기</h3><p>다음 항목의 내용입니다.</p></article><article id="third" hidden><h3>세 번째 이야기</h3><p>마지막 항목입니다.</p></article></div></main></body></html>`,{url:'https://example.test/',pretendToBeVisual:true});
  const win=dom.window,doc=win.document,container=doc.getElementById('reader');
  const pages=[...container.querySelectorAll('article')],animations=[],mediaListeners=new Set();
  let index=0;
  const query={matches:systemReduced,addEventListener:(name,fn)=>{if(name==='change')mediaListeners.add(fn);},removeEventListener:(name,fn)=>mediaListeners.delete(fn)};
  win.matchMedia=()=>query;
  container.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:width,bottom:800,width,height:800});
  Object.defineProperty(container,'clientWidth',{value:width});
  for(const page of pages) {
    page.getBoundingClientRect=()=>({x:20,y:120,left:20,top:120,right:300,bottom:540,width:280,height:420});
    Object.defineProperty(page,'offsetWidth',{value:280});
  }
  if(waapi)win.Element.prototype.animate=function(frames,options) {
    let resolve,reject;
    const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const animation={target:this,frames,options,finished,playState:'running',currentTime:0,
      effect:{target:this,getKeyframes:()=>frames,getComputedTiming:()=>({duration:typeof options==='number'?options:options.duration})},
      cancel(){if(this.playState==='idle')return;const running=this.playState==='running';this.playState='idle';if(running)reject(new win.DOMException('Canceled','AbortError'));this.oncancel?.();},
      finish(){if(this.playState!=='running')return;this.playState='finished';resolve(this);this.onfinish?.();}};
    // A test can cancel the stand-in directly, as a browser can cancel a
    // detached animation. Production rejection handling is checked in Chromium.
    finished.catch(()=>{});animations.push(animation);return animation;
  };
  const motion=createReadingMotion(container,{getCurrentPage:()=>pages[index]});
  function show(value) {
    index=value;
    pages.forEach((page,i)=>{page.hidden=i!==index;page.removeAttribute('data-reader-current');});
    pages[index].setAttribute('data-reader-current','true');
  }
  function turn(value,direction=value>index?1:-1) {
    const ticket=motion.prepare(direction);show(value);motion.finish(ticket,pages[index]);return ticket;
  }
  function finish() {for(const animation of [...animations])animation.finish();}
  function systemMotion(value) {query.matches=value;for(const fn of mediaListeners)fn({matches:value});}
  t.after(()=>{motion.dispose();dom.window.close();});
  return {dom,win,doc,container,pages,animations,motion,show,turn,finish,systemMotion,current:()=>pages[index],index:()=>index};
}

function clean(h) {
  assert.equal(h.container.querySelectorAll('.reading-slide-outgoing,.reading-slide-incoming,.reading-slide-dragging').length,0);
  assert.ok(h.pages.every(page=>!page.style.transform),'no page is left shifted after the effect');
}

test('dragged reading follows the pointer, while an unavailable edge resists and returns without changing content',async t=>{
  const h=scene(t),page=h.current();
  h.motion.drag(page,-90);
  assert.match(page.style.transform,/-90(?:px)?/,'the content moves with a normal horizontal drag');
  assert.equal(h.index(),0,'previewing a drag does not commit another reading');
  h.motion.settle();
  assert.ok(h.animations.length>0,'a short drag eases back instead of jumping');
  h.finish();await tick();clean(h);
  h.motion.drag(page,90,{bounded:true});
  const boundedOffset=Number(page.style.transform.match(/translate3d\((-?[\d.]+)px/)?.[1]);
  assert.ok(boundedOffset>0&&boundedOffset<90,'the first/last edge offers limited visual movement');
  h.motion.settle();h.finish();await tick();clean(h);assert.equal(h.index(),0);
});

test('a page turn changes the model once and animates an inaccessible outgoing view beside the new reading',async t=>{
  const h=scene(t),next=h.doc.getElementById('next');next.focus();
  h.motion.drag(h.current(),-85);
  h.turn(1);
  assert.equal(h.current().id,'second','the actual reading changes synchronously');
  const outgoing=h.container.querySelector('.reading-slide-outgoing');
  assert.ok(outgoing,'the old reading remains visually available while sliding away');
  assert.match(outgoing.textContent,/처음 읽는 내용/);
  assert.equal(outgoing.getAttribute('aria-hidden'),'true');
  assert.ok(outgoing.inert===true||outgoing.hasAttribute('inert'));
  assert.equal(outgoing.id,'');
  assert.equal(outgoing.querySelectorAll('[id],[data-reader-current],[data-compatibility-current]').length,0,'visual copies do not become duplicate navigation targets');
  assert.equal(outgoing.hasAttribute('data-reader-current'),false);
  assert.equal(h.container.querySelectorAll('[data-reader-current]').length,1);
  assert.equal(h.doc.activeElement,next,'motion does not move keyboard focus');
  assert.ok(h.animations.length>=2,'outgoing and incoming readings both move');
  h.finish();await tick();clean(h);assert.equal(h.current().id,'second');
});

test('switching between a full-width reading and a narrower centered reading preserves the outgoing position at release',async t=>{
  const offset=transform=>Number(transform.match(/translate3d\((-?[\d.]+)px/)?.[1]||0);
  for(const direction of [1,-1]) {
    const h=scene(t,{width:960});
    for(const [index,left,width] of [[0,20,920],[1,128,704]]) {
      const page=h.pages[index];
      // A browser's bounding rectangle includes the current drag transform.
      page.getBoundingClientRect=()=>{
        const x=left+offset(page.style.transform);
        return {x,y:120,left:x,top:120,right:x+width,bottom:540,width,height:420};
      };
    }
    h.show(direction>0?0:1);
    const page=h.current();h.motion.drag(page,-85*direction);
    const before=page.getBoundingClientRect();
    h.turn(direction>0?1:0,direction);
    const ghost=h.container.querySelector('.reading-slide-outgoing');
    const animation=h.animations.find(item=>item.target===ghost);
    assert.ok(animation,'the outgoing reading has a slide animation');
    assert.equal(parseFloat(ghost.style.left)+offset(animation.frames[0].transform),before.left,
      'the outgoing view starts exactly where the dragged reading was, without a 108px alignment jump');
    assert.equal(parseFloat(ghost.style.width),before.width,'the outgoing view keeps its original width');
    h.finish();await tick();clean(h);
  }
});

test('rapid consecutive turns settle on the last requested page without old effects restoring earlier content',async t=>{
  const h=scene(t);h.turn(1);const old=[...h.animations];h.turn(2);
  assert.equal(h.current().id,'third');
  for(const animation of old)animation.finish();
  assert.equal(h.current().id,'third');
  assert.ok(h.container.querySelectorAll('.reading-slide-outgoing').length<=1,'a burst of input does not accumulate copies');
  h.finish();await tick();clean(h);assert.equal(h.container.querySelector('[data-reader-current]').id,'third');
});

test('reduced motion and a browser without animation support keep direct, clean page changes',async t=>{
  for(const options of [{reduced:'true'},{reduced:null,systemReduced:true},{waapi:false}]) {
    const h=scene(t,options);h.motion.drag(h.current(),-90);h.turn(1);await tick();
    assert.equal(h.current().id,'second');assert.equal(h.animations.length,0);clean(h);
  }
  const override=scene(t,{reduced:'false',systemReduced:true});override.turn(1);
  assert.ok(override.animations.length>0,'explicitly turning movement on overrides the system default');
  override.finish();await tick();clean(override);
});

test('turning reduced motion on during a slide immediately removes moving copies and offsets',async t=>{
  const h=scene(t);h.turn(1);h.doc.documentElement.dataset.reducedMotion='true';await tick();
  clean(h);assert.equal(h.current().id,'second');h.finish();await tick();clean(h);
  const system=scene(t,{reduced:null});system.turn(1);system.systemMotion(true);await tick();
  clean(system);assert.equal(system.current().id,'second');
});

test('hidden, detached or replaced readings cannot leave old personal content or a delayed page change',async t=>{
  for(const interruption of ['hidden','ancestor','detached','replaced']) {
    const h=scene(t);h.turn(1);
    if(interruption==='hidden')h.container.hidden=true;
    if(interruption==='ancestor')h.container.parentElement.hidden=true;
    if(interruption==='detached')h.container.remove();
    if(interruption==='replaced')h.show(2);
    await tick();clean(h);h.finish();await tick();clean(h);
    assert.equal(h.index(),interruption==='replaced'?2:1,'a visual completion cannot navigate after invalidation');
  }
});

test('cancel and disposal are repeatable and never leave transforms on the live page',async t=>{
  const h=scene(t);h.motion.drag(h.current(),-90);h.motion.cancel();h.motion.cancel();clean(h);
  h.turn(1);h.motion.dispose();h.motion.dispose();h.finish();await tick();clean(h);
  assert.equal(h.current().id,'second');
});
