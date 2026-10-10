import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {installCapturedZoom} from '../games/matgo-captured-zoom.mjs';

const dom=new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>',{pretendToBeVisual:true});
const {window:w}=dom,d=w.document;
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
let now=0,next=0,timers=new Map(),cases=0,oldHandlerCalls=0,exits=0;
const realNow=Date.now;Date.now=()=>now;
w.setTimeout=(fn,delay)=>{timers.set(++next,{fn,at:now+delay});return next;};
w.clearTimeout=id=>timers.delete(id);
const tick=ms=>{now+=ms;for(const [id,t] of timers)if(t.at<=now){timers.delete(id);t.fn();}};
const pointer=(el,type,more={})=>{
  const event=new w.Event(type,{bubbles:true,cancelable:true});
  Object.assign(event,{pointerId:1,isPrimary:true,button:0,clientX:10,clientY:10,...more});el.dispatchEvent(event);return event;
};
const key=(el,key)=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
const viewer=()=>d.querySelector('dialog.captured-zoom[open]');
const close=()=>d.querySelector('#captured-close')?.click();
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));
const svg=id=>`<svg data-face="${id}" viewBox="0 0 80 120"><rect width="80" height="120"/></svg>`;
function board(mode){
  d.querySelector('main').innerHTML=['op','me'].map((seat,s)=>`<div class="zone ${seat}"><div class="caps ${seat==='me'?'caps-own':''}">${['광','열끗','띠','피'].map((name,i)=>`<div class="cap" data-g="${name}"><span class="lb">${name} 2</span>${mode==='solo'?[0,1].map(n=>`<div class="c" data-id="${s*20+i*2+n}">${svg(s*20+i*2+n)}</div>`).join(''):`<div class="cap-cards">${svg(s*20+i*2)}${svg(s*20+i*2+1)}</div>`}</div>`).join('')}</div><div class="hand"><div class="c">${svg(99)}</div></div></div>`).join('');
  d.querySelectorAll('.cap').forEach(el=>el.onclick=()=>oldHandlerCalls++);
}
try {
  installCapturedZoom(d);
  // Parent game Escape handlers must not close the game when dismissing the viewer.
  w.addEventListener('keydown',e=>{if(e.key==='Escape')exits++;});
  for(const mode of ['solo','online']) {
    board(mode);await flush();
    for(const seat of ['op','me'])for(let group=0;group<4;group++) {
      tick(1100);const el=d.querySelectorAll(`.zone.${seat} .cap`)[group];
      assert.equal(el.tabIndex,0);assert.equal(el.getAttribute('role'),'button');
      const expected=[...el.querySelectorAll('svg')].map(x=>x.dataset.face);
      pointer(el.querySelector('svg'),'pointerdown');tick(449);assert.equal(viewer(),null);
      tick(1);assert.ok(viewer(),`${mode} ${seat} group ${group} opens after hold`);
      assert.equal(viewer().querySelector('h2').textContent,seat==='me'?'내가 먹은 패':'상대가 먹은 패');
      assert.deepEqual([...viewer().querySelectorAll('svg')].map(x=>x.dataset.face),expected);
      assert.equal(viewer().querySelector('[data-face="99"]'),null,'hands never enter captured viewer');
      pointer(el,'pointerup');el.click();assert.ok(viewer(),'release click does not dismiss or duplicate');
      assert.equal(d.querySelectorAll('.captured-zoom').length,1);
      assert.deepEqual([...el.querySelectorAll('svg')].map(x=>x.dataset.face),expected,'original pile unchanged');
      close();assert.equal(viewer(),null);assert.equal(d.activeElement,el);cases++;
    }
    const el=d.querySelector('.zone.op .cap');
    tick(1100);pointer(el,'pointerdown');pointer(el,'pointermove',{clientX:40});tick(500);el.click();assert.equal(viewer(),null);cases++;
    for(const type of ['pointercancel','scroll']) {
      tick(1100);pointer(el,'pointerdown');pointer(el,type);tick(500);el.click();assert.equal(viewer(),null);cases++;
    }
    tick(1100);pointer(el,'pointerdown');pointer(el,'pointerdown',{pointerId:2,isPrimary:false});tick(500);assert.equal(viewer(),null);pointer(el,'pointerup');cases++;
    tick(1100);el.click();assert.ok(viewer(),'quick tap remains available');key(d.activeElement,'Escape');assert.equal(viewer(),null);assert.equal(exits,0);cases++;
    key(el,'Enter');assert.ok(viewer());close();key(el,' ');assert.ok(viewer());
    const panel=viewer();pointer(panel,'pointerdown');panel.click();assert.equal(viewer(),null);cases++;
    tick(1100);pointer(el,'pointerdown');el.remove();tick(500);assert.equal(viewer(),null,'replaced online DOM never opens stale cards');cases++;
    const another=d.querySelector('.cap');key(another,'Enter');assert.ok(viewer());
    const required=d.createElement('div');required.className='modal';required.textContent='고 / 스톱';d.body.appendChild(required);await flush();
    assert.equal(viewer(),null,'required game decisions automatically dismiss the viewer');required.remove();cases++;
    const empty=d.querySelector('.cap');empty.querySelectorAll('.c,.cap-cards').forEach(n=>n.remove());await flush();
    assert.equal(empty.tabIndex,-1);tick(1100);pointer(empty,'pointerdown');tick(500);empty.click();assert.equal(viewer(),null);cases++;
    const hand=d.querySelector('.hand .c');pointer(hand,'pointerdown');tick(500);assert.equal(viewer(),null);pointer(hand,'pointerup');cases++;
  }
  assert.equal(oldHandlerCalls,0,'legacy click handlers cannot open a second viewer');
  const view=fs.readFileSync(new URL('../games/matgo-view.mjs',import.meta.url),'utf8');assert.match(view,/import '\.\/matgo-captured-zoom\.mjs\?/);
  for(const file of ['matgo.html','matgo-online.mjs'])assert.match(fs.readFileSync(new URL('../games/'+file,import.meta.url),'utf8'),/matgo-view\.mjs\?v=20261010-hold1/);
  console.log(`PASS: ${cases} captured-view cases, solo/online, both players/all groups, hold/tap/keyboard, cancellation, safe dismissal, hidden-hand exclusion and unchanged cards`);
} finally {Date.now=realNow;dom.window.close();}
