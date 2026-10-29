const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const delay=()=>new Promise(resolve=>setTimeout(resolve,45));
(async()=>{
 const dom=new JSDOM('<div class="tour-game-dialog"><header class="tour-game-header"><button>닫기</button></header><iframe src="/games/bang/index.html"></iframe></div><div class="tour-game-dialog" id="foreign"><iframe src="https://example.org/games/bang/index.html"></iframe></div><div class="modal-bg"><div class="ge-board-entry game-entry"><button data-act="close">닫기</button></div></div>',{url:'https://ojjuda.kr/world.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,observers=[],Base=w.MutationObserver;w.MutationObserver=class extends Base{constructor(fn){super(fn);observers.push(this);}};
 let closes=0,legacyCloses=0;const host=w.document.querySelector('.tour-game-dialog'),frame=host.querySelector('iframe'),legacy=w.document.querySelector('.modal-bg');host.querySelector('button').onclick=()=>closes++;
 try{
  w.eval(fs.readFileSync(path.join(__dirname,'../multiplayer-entry.js'),'utf8'));await delay();
  assert.equal(host.dataset.mpActive,'true');assert.equal(host.querySelectorAll('.mp-entry-bar').length,1);assert.equal(w.document.querySelector('#foreign').classList.contains('mp-entry-host'),false);
  host.querySelector('.mp-entry-back').click();assert.equal(closes,1,'shared back preserves original close');
  const message=(origin,source,active)=>w.dispatchEvent(new w.MessageEvent('message',{origin,source,data:{type:'ojjuda:entry:view',active}}));
  message('https://example.org',frame.contentWindow,false);assert.equal(host.dataset.mpActive,'true');
  message(w.location.origin,w,false);assert.equal(host.dataset.mpActive,'true');
  message(w.location.origin,frame.contentWindow,false);assert.equal(host.dataset.mpActive,'false','gameplay restores native host');
  message(w.location.origin,frame.contentWindow,true);assert.equal(host.dataset.mpActive,'true');
  legacy.querySelector('.ge-board-entry').innerHTML='<button data-act="close">새 닫기</button>';legacy.querySelector('[data-act="close"]').onclick=()=>legacyCloses++;
  await delay();legacy.querySelector('.mp-entry-back').click();assert.equal(legacyCloses,1,'rerendered board entry keeps working back');
  legacy.querySelector('.ge-board-entry').remove();legacy.append(w.document.createElement('canvas'));await delay();
  assert.equal(legacy.classList.contains('mp-entry-host'),false);assert.equal(legacy.querySelector('.mp-entry-bar'),null,'board start removes entrance shell');
  frame.remove();await delay();assert.equal(host.querySelector('.mp-entry-bar'),null,'removed iframes release toolbar');
  console.log('PASS: common fullscreen lifecycle, close forwarding, origin/source validation, board rerenders and gameplay restoration');
 }finally{observers.forEach(o=>o.disconnect());await delay();w.close();}
 const child=new JSDOM('<main id="app"></main><section class="game-entry"></section>',{url:'https://ojjuda.kr/games/matgo.html',runScripts:'outside-only',pretendToBeVisual:true});
 const cw=child.window,childObservers=[],ChildBase=cw.MutationObserver;cw.MutationObserver=class extends ChildBase{constructor(fn){super(fn);childObservers.push(this);}};
 cw.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{width:300,height:300}];};
 let fits=0;cw.addEventListener('resize',()=>{assert.equal(cw.document.body.dataset.mpEntry,'false','refit runs after entrance styles are removed');fits++;});
 try{
  cw.eval(fs.readFileSync(path.join(__dirname,'../multiplayer-entry.js'),'utf8'));await delay();assert.equal(cw.document.body.dataset.mpEntry,'true');
  cw.document.querySelector('.game-entry').hidden=true;await delay();assert.equal(fits,1,'entry-to-game transition refits the game board once');
  cw.document.querySelector('#app').append(cw.document.createElement('div'));await delay();assert.equal(fits,1,'ordinary game rendering does not refit repeatedly');
  console.log('PASS: standalone entry-to-game transition restores measured board geometry');
 }finally{childObservers.forEach(o=>o.disconnect());await delay();cw.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
