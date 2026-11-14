import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {attachReadingSwipe} from '../games/starlit-saju/reading-swipe.mjs';

const {JSDOM}=createRequire(import.meta.url)('jsdom');

function reader(t,{index=1,attribute='data-reader-current',motion=null}={}) {
  const dom=new JSDOM('<!doctype html><main><div id="reader"><nav class="reading-pager"><button id="previous">이전</button><button id="next">다음</button></nav><article id="first"><p>처음 읽는 설명입니다.</p></article><article id="second"><p>현재 읽는 설명입니다.</p></article><article id="last"><p>마지막 설명입니다.</p></article></div></main>',{url:'https://example.test/'});
  const {document:doc}=dom.window,container=doc.getElementById('reader');
  const previous=doc.getElementById('previous'),next=doc.getElementById('next');
  const pages=[...container.querySelectorAll('article')],calls=[];
  const captures=new Set();
  container.setPointerCapture=id=>captures.add(id);
  container.hasPointerCapture=id=>captures.has(id);
  container.releasePointerCapture=id=>captures.delete(id);
  function show(value) {
    index=value;
    pages.forEach((page,position)=>{page.hidden=position!==index;page.removeAttribute(attribute);});
    pages[index].setAttribute(attribute,'true');
    previous.disabled=index===0;next.disabled=index===pages.length-1;
  }
  previous.addEventListener('click',()=>{calls.push('previous');show(index-1);});
  next.addEventListener('click',()=>{calls.push('next');show(index+1);});
  show(index);
  let dispose=attachReadingSwipe(container,{previous,next,motion});
  t.after(()=>{dispose();dom.window.close();});
  function pointer(type,options={}) {
    const {target=pages[index].querySelector('p'),pointerId=1,pointerType='touch',isPrimary=true,timeStamp=100,...mouse}=options;
    const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:200,clientY:300,button:0,buttons:type==='pointerup'?0:1,detail:1,...mouse});
    Object.defineProperties(event,{pointerId:{value:pointerId},pointerType:{value:pointerType},isPrimary:{value:isPrimary},timeStamp:{value:timeStamp}});
    target.dispatchEvent(event);return event;
  }
  function drag({dx=-100,dy=2,target=pages[index].querySelector('p'),pointerType='touch',...options}={}) {
    pointer('pointerdown',{target,pointerType,...options});
    const move=pointer('pointermove',{target,pointerType,clientX:200+dx,clientY:300+dy,timeStamp:140,...options});
    pointer('pointerup',{target,pointerType,clientX:200+dx,clientY:300+dy,timeStamp:180,...options});
    return move;
  }
  return {dom,doc,container,previous,next,pages,calls,show,pointer,drag,current:()=>pages[index],index:()=>index,
    dispose:()=>dispose(),reattach:()=>{dispose=attachReadingSwipe(container,{previous,next,motion});}};
}

test('touch, mouse and pen horizontal drags reuse the existing page steps once',t=>{
  for(const pointerType of ['touch','mouse','pen']) {
    const h=reader(t);
    h.drag({pointerType,dx:-150});
    assert.equal(h.index(),2,pointerType+': left moves to the next page');
    assert.deepEqual(h.calls,['next']);
    h.drag({pointerType,dx:150});
    assert.equal(h.index(),1,pointerType+': right returns to the previous page');
    assert.deepEqual(h.calls,['next','previous']);
  }
});

test('the first and last pages do not wrap or call disabled controls',t=>{
  const h=reader(t,{index:0});
  h.drag({dx:110});assert.equal(h.index(),0);assert.deepEqual(h.calls,[]);
  h.show(2);h.drag({dx:-110});assert.equal(h.index(),2);assert.deepEqual(h.calls,[]);
});

test('short movements and vertical scrolling leave the reading and native scroll alone',t=>{
  for(const [dx,dy] of [[0,-140],[-8,-140],[-24,1],[-60,70]]) {
    const h=reader(t),move=h.drag({dx,dy});
    assert.equal(h.index(),1,`${dx},${dy}: no page change`);
    if(Math.abs(dy)>Math.abs(dx))assert.equal(move.defaultPrevented,false,'vertical scrolling is not prevented');
    assert.deepEqual(h.calls,[]);
  }
  const h=reader(t);
  h.pointer('pointerdown');
  h.pointer('pointermove',{clientX:204,clientY:330,timeStamp:130});
  h.pointer('pointermove',{clientX:80,clientY:332,timeStamp:150});
  h.pointer('pointerup',{clientX:80,clientY:332,timeStamp:180});
  assert.deepEqual(h.calls,[],'a scroll that later drifts sideways remains a scroll');
});

test('form controls, links, disclosure headings and editable content keep their normal gestures',t=>{
  const examples=['<button><span>버튼</span></button>','<a href="#x"><span>링크</span></a>','<input>','<select><option>선택</option></select>',
    '<textarea>입력</textarea>','<details><summary><span>자세히</span></summary></details>','<div contenteditable="true"><span>편집</span></div>',
    '<div role="button"><span>역할 버튼</span></div>','<div draggable="true"><span>옮길 항목</span></div>'];
  for(const html of examples) {
    const h=reader(t),holder=h.doc.createElement('div');holder.innerHTML=html;h.current().append(holder);
    const target=holder.querySelector('span')||holder.firstElementChild;
    h.drag({target});assert.deepEqual(h.calls,[],html);
  }
  const h=reader(t);h.drag({target:h.container.querySelector('.reading-pager')});
  assert.deepEqual(h.calls,[],'the picker area itself is not a swipe surface');
});

test('pressing page controls, including a double click, preserves the active slide until navigation prepares its replacement',t=>{
  let visualOffset=84;const prepared=[];
  const motion={cancel(){visualOffset=0;},prepare(){prepared.push(visualOffset);visualOffset=0;},dispose(){}};
  const h=reader(t,{index:0,motion}),target=h.doc.createElement('span');
  target.textContent='다음 항목';h.next.append(target);
  // Prepare runs before the fixture changes its page; its next animation starts
  // after the button's existing navigation handler, as in the real pager.
  h.next.addEventListener('click',()=>motion.prepare(),true);
  h.next.addEventListener('click',()=>{visualOffset=116;});
  for(const detail of [1,2]) {
    const before=visualOffset;
    h.pointer('pointerdown',{target,pointerType:'mouse',timeStamp:detail*100});
    target.dispatchEvent(new h.dom.window.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,buttons:1,detail}));
    assert.equal(visualOffset,before,'a control press must not erase the previous slide before prepare reads its position');
    h.pointer('pointerup',{target,pointerType:'mouse',timeStamp:detail*100+40});
    target.dispatchEvent(new h.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,button:0,detail}));
  }
  assert.deepEqual(prepared,[84,116],'both single and double clicks prepare from the ongoing visual position');
  assert.deepEqual(h.calls,['next','next']);assert.equal(h.index(),2,'two deliberate clicks advance exactly two pages');
});

test('secondary buttons, modified gestures and nonprimary pointers do not navigate',t=>{
  for(const options of [{button:2,buttons:2},{button:1,buttons:4},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{isPrimary:false}]) {
    const h=reader(t);h.drag({pointerType:'mouse',...options});assert.deepEqual(h.calls,[],JSON.stringify(options));
  }
  for(const options of [{ctrlKey:true},{shiftKey:true},{buttons:3}]) {
    const h=reader(t),target=h.current().querySelector('p');
    h.pointer('pointerdown',{target,pointerType:'mouse'});
    h.pointer('pointermove',{target,pointerType:'mouse',clientX:160,timeStamp:130});
    h.pointer('pointermove',{target,pointerType:'mouse',clientX:100,timeStamp:150,...options});
    h.pointer('pointerup',{target,pointerType:'mouse',clientX:100,timeStamp:180});
    assert.deepEqual(h.calls,[],'changing to a modified drag cancels the page turn');
  }
});

test('cancelled gestures and lost capture cannot complete a page change',t=>{
  for(const cancellation of ['pointercancel','lostpointercapture']) {
    const h=reader(t),target=h.current().querySelector('p');
    h.pointer('pointerdown',{target});h.pointer('pointermove',{target,clientX:100,timeStamp:140});
    h.pointer(cancellation,{target:cancellation==='lostpointercapture'?h.container:target,clientX:100,timeStamp:150});h.pointer('pointerup',{target,clientX:100,timeStamp:180});
    assert.deepEqual(h.calls,[],cancellation);
    h.drag();assert.deepEqual(h.calls,['next'],'a later deliberate drag still works');
  }
  const transferred=reader(t),text=transferred.current().querySelector('p');
  transferred.pointer('pointerdown',{target:text});transferred.pointer('pointermove',{target:text,clientX:165,timeStamp:130});
  assert.equal(transferred.container.hasPointerCapture(1),true,'the reading now owns pending capture');
  transferred.pointer('lostpointercapture',{target:text,clientX:165,timeStamp:140});
  transferred.pointer('gotpointercapture',{target:transferred.container,clientX:165,timeStamp:141});
  transferred.pointer('pointermove',{target:transferred.container,clientX:100,timeStamp:160});
  transferred.pointer('pointerup',{target:transferred.container,clientX:100,timeStamp:180});
  assert.deepEqual(transferred.calls,['next'],'transfer from implicit text capture to the reader does not cancel a touch swipe');
});

test('window blur and hiding the tab cancel a claimed drag without breaking later gestures',t=>{
  for(const interruption of ['blur','hidden-visible']) {
    const h=reader(t),target=h.current().querySelector('p');let hidden=false;
    Object.defineProperty(h.doc,'hidden',{configurable:true,get:()=>hidden});
    const interrupt=()=>{
      if(interruption==='blur')h.dom.window.dispatchEvent(new h.dom.window.Event('blur'));
      else {
        hidden=true;h.doc.dispatchEvent(new h.dom.window.Event('visibilitychange'));
        hidden=false;h.doc.dispatchEvent(new h.dom.window.Event('visibilitychange'));
      }
    };
    h.pointer('pointerdown',{target});h.pointer('pointermove',{target,clientX:165,timeStamp:130});
    interrupt();h.pointer('pointerup',{target,clientX:100,timeStamp:180});
    assert.deepEqual(h.calls,[],interruption+': resuming cannot complete the old page turn');
    assert.equal(h.container.hasPointerCapture(1),false,'interruption releases the active pointer');
    assert.equal(h.container.classList.contains('reading-swipe-dragging'),false,'interruption restores normal text interaction');
    h.drag();assert.deepEqual(h.calls,['next'],'a fresh deliberate swipe still works');
    h.show(1);h.pointer('pointerdown',{target});h.pointer('pointermove',{target,clientX:165,timeStamp:130});
    h.dispose();interrupt();h.pointer('pointerup',{target,clientX:100,timeStamp:180});
    assert.deepEqual(h.calls,['next'],'disposed content stays inert through tab lifecycle events');
    h.reattach();h.drag();assert.deepEqual(h.calls,['next','next'],'cleanup does not interfere with a later binding');
  }
  for(const terminal of ['pointerup','pointercancel']) {
    const h=reader(t),target=h.current().querySelector('p'),active=new Map();
    function track(surface,names) {
      const add=surface.addEventListener,remove=surface.removeEventListener;
      for(const name of names)active.set(name,new Set());
      surface.addEventListener=function(name,listener,options) {
        if(names.includes(name))active.get(name).add(listener);
        return add.call(this,name,listener,options);
      };
      surface.removeEventListener=function(name,listener,options) {
        if(names.includes(name))active.get(name).delete(listener);
        return remove.call(this,name,listener,options);
      };
    }
    track(h.dom.window,['blur','pointerup','pointercancel']);track(h.doc,['visibilitychange']);
    const listenerCount=()=>[...active.values()].reduce((sum,listeners)=>sum+listeners.size,0);
    h.pointer('pointerdown',{target});
    if(terminal==='pointercancel')h.pointer('pointermove',{target,clientX:165,timeStamp:130});
    assert.ok(listenerCount()>0,'only a live gesture holds lifecycle listeners');
    h.container.remove();
    h.pointer(terminal,{target:terminal==='pointerup'?h.doc.body:h.dom.window,clientX:100,timeStamp:180});
    assert.deepEqual(h.calls,[],terminal+': an outside release cannot navigate detached content');
    assert.equal(h.container.hasPointerCapture(1),false);
    assert.equal(h.container.classList.contains('reading-swipe-dragging'),false);
    assert.equal(listenerCount(),0,'outside termination releases all transient lifecycle listeners');
    h.doc.querySelector('main').append(h.container);h.drag();
    assert.deepEqual(h.calls,['next'],'a later attached reading still accepts a fresh gesture');
    h.dispose();assert.equal(listenerCount(),0,'cleanup leaves no lifecycle listener behind');
  }
});

test('a second finger cancels navigation until that gesture finishes',t=>{
  const h=reader(t),target=h.current().querySelector('p');
  h.pointer('pointerdown',{target});h.pointer('pointermove',{target,clientX:170,timeStamp:120});
  h.pointer('pointerdown',{target,pointerId:2,isPrimary:false,timeStamp:130});
  h.pointer('pointerup',{target,pointerId:2,isPrimary:false,timeStamp:150});
  h.pointer('pointerup',{target,clientX:80,timeStamp:180});
  assert.deepEqual(h.calls,[],'pinch and multitouch are not page turns');
  h.drag();assert.deepEqual(h.calls,['next']);
});

test('long pressing and an existing text selection remain reading actions',t=>{
  const held=reader(t),target=held.current().querySelector('p');
  held.pointer('pointerdown',{target,pointerType:'mouse'});
  held.pointer('pointermove',{target,pointerType:'mouse',clientX:80,timeStamp:800});
  held.pointer('pointerup',{target,pointerType:'mouse',clientX:80,timeStamp:900});
  assert.deepEqual(held.calls,[],'holding before moving permits deliberate text selection');
  const selected=reader(t),range=selected.doc.createRange();range.selectNodeContents(selected.current().querySelector('p'));
  selected.dom.window.getSelection().addRange(range);
  const text=selected.dom.window.getSelection().toString();selected.drag({pointerType:'mouse'});
  assert.deepEqual(selected.calls,[]);assert.equal(selected.dom.window.getSelection().toString(),text,'existing selection is kept');
  const double=reader(t),word=double.current().querySelector('p');
  double.pointer('pointerdown',{target:word,pointerType:'mouse'});
  word.dispatchEvent(new double.dom.window.MouseEvent('mousedown',{bubbles:true,button:0,detail:2}));
  double.pointer('pointermove',{target:word,pointerType:'mouse',clientX:80,timeStamp:140});
  double.pointer('pointerup',{target:word,pointerType:'mouse',clientX:80,timeStamp:180});
  assert.deepEqual(double.calls,[],'a word-selecting double click is not a drag');
});

test('hidden, replaced or detached paid reading content cannot finish an old drag',t=>{
  for(const invalidation of ['hidden','ancestor','detached','page']) {
    const h=reader(t),target=h.current().querySelector('p');
    h.pointer('pointerdown',{target});h.pointer('pointermove',{target,clientX:160,timeStamp:130});
    if(invalidation==='hidden')h.container.hidden=true;
    if(invalidation==='ancestor')h.container.parentElement.hidden=true;
    if(invalidation==='detached')h.container.remove();
    if(invalidation==='page')h.show(0);
    h.pointer('pointerup',{target,clientX:70,timeStamp:180});
    assert.deepEqual(h.calls,[],invalidation+': old content cannot issue a step');
  }
});

test('the compatibility page marker is also guarded against replacement mid-drag',t=>{
  const h=reader(t,{attribute:'data-compatibility-current'}),target=h.current().querySelector('p');
  h.pointer('pointerdown',{target});h.pointer('pointermove',{target,clientX:160,timeStamp:130});
  h.show(0);h.pointer('pointerup',{target,clientX:70,timeStamp:180});
  assert.deepEqual(h.calls,[]);
});

test('a completed swipe suppresses its residual click but leaves the next deliberate click usable',t=>{
  const h=reader(t);let accidental=0;
  h.container.addEventListener('click',event=>{if(!event.target.closest('button'))accidental++;});
  h.drag();
  const residual=new h.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:100,clientY:302});
  Object.defineProperty(residual,'timeStamp',{value:181});
  h.container.dispatchEvent(residual);
  assert.equal(residual.defaultPrevented,true);assert.equal(accidental,0,'the release does not activate the newly displayed reading');
  h.pointer('pointerdown',{clientX:100});h.pointer('pointerup',{clientX:100,timeStamp:120});
  h.container.dispatchEvent(new h.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:100,clientY:300}));
  assert.equal(accidental,1,'a fresh tap is not swallowed');
});

test('cleanup removes the gesture and reattaching does not duplicate page steps',t=>{
  const h=reader(t);h.dispose();h.drag();assert.deepEqual(h.calls,[]);
  h.reattach();h.drag();assert.deepEqual(h.calls,['next']);
});

test('disposing an earlier binding cannot remove the current reader binding',t=>{
  const h=reader(t),old=attachReadingSwipe(h.container,{previous:h.previous,next:h.next});
  const latest=attachReadingSwipe(h.container,{previous:h.previous,next:h.next});t.after(latest);
  old();h.drag();assert.deepEqual(h.calls,['next']);
});
