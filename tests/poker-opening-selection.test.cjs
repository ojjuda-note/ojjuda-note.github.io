const assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const {createOpeningSelection}=await import('../games/poker/opening-selection.mjs');
 const dom=new JSDOM('<main id="app"></main>',{pretendToBeVisual:true}),w=dom.window,root=w.document.querySelector('#app');
 let reduced=false,finished=0;w.matchMedia=()=>({matches:reduced});
 const animations=[],ui=createOpeningSelection({onFinish:()=>finished++});
 const board=()=>{root.innerHTML='<section class="player"><div class="my-cards"><button data-hand-card="12" data-card="0">A</button><button data-hand-card="25" data-card="1">A</button><button data-hand-card="8" data-card="2">10</button></div></section><section class="decision-panel"><div class="actions"><button data-action="select">공개</button></div></section>';};
 w.HTMLElement.prototype.getBoundingClientRect=function(){const raised=!!this.closest('.opening-selection'),i=Number(this.dataset.card)||0;return {left:30+i*(raised?100:45),top:raised?200:560,width:raised?95:70,height:raised?133:98};};
 w.HTMLElement.prototype.animate=function(frames,options){let resolve;const animation={frames,options,node:this,finished:new Promise(r=>resolve=r),cancel(){},finish(){resolve();}};animations.push(animation);return animation;};
 try{
  board();let before=ui.capture(root);ui.mount(root,{phase:'discard',selecting:true});
  assert.equal(root.querySelectorAll('[data-hand-card]').length,3,'one real hand, without duplicated card buttons');
  assert.ok(root.querySelector('.player').hasAttribute('inert'),'the board cannot steal input during selection');
  assert.equal(root.querySelector('.opening-selection').getAttribute('aria-modal'),'true');
  assert.equal(root.querySelector('.opening-step').textContent,'1 / 2 · 버릴 카드');
  assert.equal(ui.transfer(root,before),true);assert.equal(ui.active(),true);assert.ok(animations.every(a=>parseFloat(a.frames[0].translate.split(' ')[1])>0),'entry starts below the centered cards');
  animations[0].finish();await tick();assert.equal(finished,0,'one early arrival cannot finish a multi-card move');
  animations.slice(1).forEach(a=>a.finish());await tick();assert.equal(finished,1);assert.equal(ui.active(),false);
  before=ui.capture(root);board();const begin=animations.length;
  assert.equal(ui.transfer(root,before),true);assert.ok(animations.slice(begin).every(a=>parseFloat(a.frames[0].translate.split(' ')[1])<0),'return starts at the center above the player seat');
  assert.equal(root.querySelector('[data-action="select"]').disabled,true,'no action can run while the hand is returning');
  await tick();assert.equal(finished,1,'cleanup waits for actual completion, not a nominal timer');
  animations.slice(begin).forEach(a=>a.finish());await tick();assert.equal(finished,2);assert.equal(root.querySelector('[data-action="select"]').disabled,false);
  before=ui.capture(root);ui.mount(root,{phase:'open',selecting:false});assert.ok([...root.querySelectorAll('.my-cards button')].every(b=>b.disabled),'waiting for another player does not allow a local selection');
  const stale=animations.length;ui.transfer(root,before);ui.cancel();animations.slice(stale).forEach(a=>a.finish());await tick();assert.equal(finished,2,'cancelled old-round animations cannot trigger a new render');
  before=ui.capture(root);board();reduced=true;assert.equal(ui.transfer(root,before),false,'reduced motion places the cards immediately');assert.equal(root.hasAttribute('aria-busy'),false);
  console.log('PASS: one centered hand, two selection steps, private controls, upward/downward flights, actual completion, cancellation and reduced motion');
 }finally{ui.cancel();dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
