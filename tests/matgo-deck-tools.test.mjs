import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import * as engine from '../games/matgo-engine.mjs';
import {floorLayout,heldPairMonths} from '../games/matgo-view.mjs';
import {dealSoloRound,createTazzaQueue,TAZZA_MODES,TAZZA_DETAILS} from '../games/matgo-tazza.mjs';
import {createVentControls,VENT_EFFECTS} from '../games/matgo-deck-tools.mjs';

const originalGlobals=new Map(['window','document','innerWidth','ResizeObserver','setTimeout','clearTimeout'].map(k=>[k,globalThis[k]]));
const realNow=Date.now;
const source=fs.readFileSync(new URL('../games/matgo.html',import.meta.url),'utf8');
const dom=new JSDOM(source,{url:'https://ojjuda.kr/games/matgo.html',pretendToBeVisual:true,runScripts:'outside-only'});
const w=dom.window,d=w.document;
Object.assign(globalThis,{window:w,document:d,innerWidth:390,ResizeObserver:undefined});
w.matchMedia=()=>({matches:false});w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
w.HTMLElement.prototype.getBoundingClientRect=function(){
  const floor=this.classList.contains('floor'),who=this.matches('.zone.op .who b'),button=this.id==='matgo-vent';
  const x=button?302:who?14:12,y=button?300:who?58:140,width=floor?366:button?66:100,height=floor?280:button?36:30;
  return {x,y,left:x,top:y,right:x+width,bottom:y+height,width,height};
};
const winTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>winTimeout(fn,Math.min(ms,1),...args);
w.setInterval=()=>1;w.clearInterval=()=>{};
w.localStorage.setItem('ojjuda-matgo-sound','off');
w.OjjudaMatgoAccess={check:async()=>{},allowed:()=>true,subscribe:()=>()=>{}};
let roundNumber=0,failStart=false;
const wallet={current:{ok:true,gold:5000,stake_rate:100},status:async()=>wallet.current,start:async({tazza=false}={})=>{
  if(failStart){failStart=false;throw Object.assign(Error('temporary network error'),{code:'unavailable'});}
  wallet.current={ok:true,gold:5000,stake_rate:100,round:{id:String(++roundNumber),gold:5000,seed:10,first:0,carry:1,rate:100,tazza_mode:tazza?'peek':null}};return wallet.current;
}};
Object.assign(w,engine,{floorLayout,heldPairMonths,dealSoloRound,createTazzaQueue,TAZZA_MODES,TAZZA_DETAILS,createVentControls,createWallet:()=>wallet});
let code=source.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;\s*$/gm,'');
code=code.replace('(async () => {','window.testInit=(async () => {').replace('startRound();\n})();','window.testGame={game,ui,tazza,vent,render,startRound};window.firstRound=startRound();\n})();');
try{
  vm.runInContext(code,dom.getInternalVMContext());await w.testInit;await w.firstRound;
  const t=w.testGame,button=d.getElementById('tazza-mode');
  assert.ok(button);assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.deepEqual([...d.querySelector('.deck').children].map(el=>el.id||el.className),['tazza-mode','back','deckN','matgo-vent']);
  const before=JSON.stringify([t.game.hand,t.game.deck,t.game.actions,t.game.bank]);
  button.click();assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal(JSON.stringify([t.game.hand,t.game.deck,t.game.actions,t.game.bank]),before,'current hand, deck, actions and gold stay unchanged');
  button.click();assert.equal(button.getAttribute('aria-pressed'),'false');button.click();
  t.game.over=true;failStart=true;
  assert.equal(await t.startRound(),false);assert.equal(t.tazza.queued,true);assert.equal(button.disabled,false,'failed start can be retried');
  d.querySelectorAll('.modal').forEach(el=>el.remove());
  await t.startRound();assert.equal(t.game.actions[0].type,'tazza');assert.equal(t.tazza.queued,false);assert.equal(button.querySelector('small').textContent,'상대 패 보기');
  assert.equal(d.querySelectorAll('#handOp.tazza-peek .c[data-id]').length,10,'peek shows opponent cards');
  t.game.over=true;await t.startRound();assert.equal(t.game.actions.length,0,'following unrequested round is ordinary');
  assert.equal(button.querySelector('small').textContent,'다음 판 · 5쭈');
  t.vent.destroy();

  let now=0,nextTimer=0,timers=new Map(),allowed=true,hits=0;
  Date.now=()=>now;
  globalThis.setTimeout=(fn,ms)=>{timers.set(++nextTimer,{fn,at:now+ms});return nextTimer;};
  globalThis.clearTimeout=id=>timers.delete(id);
  const tick=ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}};
  let purchases=0,failPurchase=false,errors=0;
  const purchase=async effect=>{purchases++;if(failPurchase)throw Error('쭈가 부족해요.');return {purchase:{effect}};};
  const sounds=[];let failAsset=false;
  const vent=createVentControls({canPlay:()=>allowed,purchase,prepare:async()=>{if(failAsset)throw Error('image failed');},sound:{unlock(){},stop(){},destroy(){},play:(id,timing)=>sounds.push({id,timing})},onError:()=>errors++,onHit:()=>hits++});vent.mount();
  assert.ok(d.querySelector('#matgo-vent .vent-icon img[src$="gun.png"]'),'gun drawing replaces the bomb icon');
  assert.equal(d.querySelector('#matgo-vent small').textContent,'1쭈');
  failAsset=true;d.getElementById('matgo-vent').click();await Promise.resolve();await Promise.resolve();assert.equal(purchases,0,'art failure never charges');assert.equal(sounds.length,0);failAsset=false;errors=0;
  failPurchase=true;d.getElementById('matgo-vent').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(errors,1);assert.equal(d.querySelector('.vent-layer'),null,'no animation on declined payment');failPurchase=false;
  const preserved=JSON.stringify([t.game.hand,t.game.deck,t.game.actions,t.game.bank]);
  for(const effect of VENT_EFFECTS){
    d.getElementById('matgo-vent').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    assert.equal(d.querySelector('.vent-layer')?.dataset.effect,effect.id);
    assert.equal(d.getElementById('matgo-vent').disabled,true);
    d.getElementById('matgo-vent').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(d.querySelectorAll('.vent-layer').length,1,'rapid taps do not pile up effects');
    tick(effect.hits.at(-1)+1);assert.ok(d.querySelector('.zone.op .who b').classList.contains('vent-hit'));
    tick(effect.duration-effect.hits.at(-1));assert.equal(d.querySelector('.vent-layer'),null);
    tick(200);assert.equal(d.getElementById('matgo-vent').disabled,false);
  }
  assert.equal(hits,6);assert.deepEqual(sounds.map(s=>s.id),VENT_EFFECTS.map(e=>e.id));assert.deepEqual(sounds.map(s=>s.timing),VENT_EFFECTS.map(e=>e.hits));assert.equal(JSON.stringify([t.game.hand,t.game.deck,t.game.actions,t.game.bank]),preserved);
  allowed=false;vent.sync();d.getElementById('matgo-vent').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(d.querySelector('.vent-layer'),null);
  // Online rerenders replace the entire board. A single delegated listener survives.
  allowed=true;d.querySelector('.floor').outerHTML='<div class="floor"><div class="deck"><div class="back"></div><small>20장</small></div></div>';
  vent.mount();assert.equal(d.querySelectorAll('#matgo-vent').length,1);assert.equal(d.querySelector('.deck .tazza-button'),null,'online control does not introduce tazza');
  d.getElementById('matgo-vent').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(d.querySelector('.vent-layer').dataset.effect,'gun');
  vent.destroy();assert.equal(d.querySelector('.vent-layer'),null);assert.equal(timers.size,0);
  console.log('PASS: real solo module boots; next-round toggle/cancel/failure/one-shot wiring; 5 effects, cooldown, cleanup, online remount and unchanged game state');
}finally{
  w.testGame?.vent.destroy();dom.window.close();Date.now=realNow;
  for(const [key,value] of originalGlobals){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
}
