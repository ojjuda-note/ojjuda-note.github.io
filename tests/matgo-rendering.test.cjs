const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
(async()=>{
 const engine=await import('../games/matgo-engine.mjs'),art=await import('../games/matgo-art.mjs');
 const dom=new JSDOM(read('games/matgo-online.html'),{url:'https://fixture.test/games/matgo-online.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  const noop=()=>{},flights=[];let cancels=0;
  w.matchMedia=()=>({matches:false});
  w.OjjudaMatgoAccess={check:async()=>{},allowed:()=>true,subscribe:noop,getClient:()=>({auth:{getSession:async()=>({})}})};
  w.eval(read('games/matgo-view.mjs').replace(/^import .*;\n/,'').replaceAll('export function','function')+'\nwindow.view={floorLayout,heldPairMonths,piClaimMessage,positionGoStopPrompt};');
  w.deps={...engine,...art,...w.view,shuffledFloorSlots:noop,floorStackIds:stack=>[...stack.querySelectorAll('[data-face]')].map(n=>Number(n.dataset.face)),
   createWallet:()=>({status:async()=>({gold:5000,free_left:2})}),
   createOnlineMotion:()=>({play:(previous,next,events)=>new Promise(resolve=>flights.push({previous,next,events,resolve})),cancel:()=>{cancels++;}}),
   createOnlineSound:()=>({play:noop,cancel:noop}),cpuPortraitHTML:()=>'<span class="cpu-portrait"><img src="fixture.png"></span>',
   createVentControls:()=>({mount:noop,sync:noop})};
  const source=read('games/matgo-online.mjs').replace(/^import \{([^}]+)\} from '[^']+';/gm,(_,names)=>`const {${names.replace(/ as /g,':')}}=window.deps;`);
  await w.eval('(async()=>{'+source+'\nwindow.renderTest={accept,cancelPresentation,getRoom:()=>room};clearInterval(pollTimer);clearInterval(accessTimer);})()');
  const card=id=>({...engine.CARDS[id]}),stamp=r=>({...structuredClone(r),serverTime:Date.now(),deadline:new Date(Date.now()+20000).toISOString()});
  const initial={id:'render-room',round:1,version:1,status:'active',seat:0,names:['나','상대'],bots:[false,false],gold:[5000,5000],autoCount:0,eventCount:0,events:[],game:{hand:[card(0),card(8)],otherCount:2,floor:[{cards:[card(1)]},{cards:[card(12)]}],caps:[[card(20)],[]],deckCount:20,turn:0,go:[0,0],bomb:[0,0],ppukCount:[0,0],firstPpukGold:[0,0],over:false,prompt:{type:'play',p:0}}};
  const t=w.renderTest;await t.accept(stamp(initial));
  const board=w.document.querySelector('.board'),hand=w.document.querySelector('#hand'),held=hand.querySelector('[data-card="8"]'),floor=w.document.querySelector('.fl [data-face="12"]').closest('.stack'),captured=w.document.querySelector('.caps-own [data-face="20"]');
  const vent=w.document.createElement('button');vent.id='matgo-vent';w.document.querySelector('.deck').append(vent);
  held.focus();hand.scrollLeft=31;
  for(let version=2;version<=20;version++)await t.accept(stamp({...initial,version}));
  assert.equal(w.document.querySelector('.board'),board,'heartbeat snapshots keep the live board');
  assert.equal(w.document.querySelector('#hand'),hand,'scroll container stays connected');
  assert.equal(w.document.activeElement,held,'unchanged cards keep focus');assert.equal(hand.scrollLeft,31);
  assert.equal(w.document.querySelector('.fl [data-face="12"]').closest('.stack'),floor);
  assert.equal(w.document.querySelector('.caps-own [data-face="20"]'),captured,'decoded public artwork is reused');
  assert.equal(w.document.querySelector('#matgo-vent'),vent,'mounted deck controls remain intact');
  const played={...structuredClone(initial),version:21,eventCount:1,events:[{id:0,type:'played',p:0,card:card(0)}],game:{...structuredClone(initial.game),hand:[card(8)],floor:[{cards:[card(1),card(0)]},{cards:[card(12)]}],turn:1,prompt:{type:'waiting',p:1}}};
  const moving=t.accept(stamp(played));assert.equal(flights.length,1);const beforeCancel=cancels;
  const reply={...structuredClone(played),version:22,eventCount:2,events:[...played.events,{id:1,type:'flip',p:1,card:card(16)}],game:{...structuredClone(played.game),floor:[...played.game.floor,{cards:[card(16)]}]}};
  await t.accept(stamp(reply));assert.equal(cancels,beforeCancel,'a newer same-round snapshot does not cancel a moving card');assert.equal(flights.length,1);
  flights[0].resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(flights.length,2,'the following update starts after the first movement');assert.deepEqual(flights[1].events.map(e=>e.id),[1],'already presented events are not replayed');
  flights[1].resolve();await moving;
  assert.equal(t.getRoom().version,22);assert.equal(w.document.querySelector('.board'),board);
  assert.equal(w.document.querySelector('[data-card="0"]'),null);assert.equal(w.document.querySelector('[data-card="8"]'),held);
  assert.equal(w.document.querySelector('.fl [data-face="12"]').closest('.stack'),floor,'unaffected floor piles do not move or remount');
  assert.equal(w.document.querySelectorAll('.fl [data-face="16"]').length,1);
  const next={...structuredClone(reply),version:23,eventCount:3,events:[{id:2,type:'draw',p:1}]};const old=t.accept(stamp(next));
  await t.accept(stamp({...next,version:24}));
  await t.accept(stamp({...initial,round:2,version:25}));flights[2].resolve();await old;
  assert.equal(t.getRoom().round,2,'new rounds discard queued old snapshots');assert.equal(t.getRoom().version,25);
  assert.notEqual(w.document.querySelector('.board'),board,'new rounds initialize a clean board');
  const decision={...structuredClone(initial),round:2,version:26,game:{...structuredClone(initial.game),prompt:{type:'gostop',p:0,points:7}}};
  await t.accept(stamp(decision));
  const prompt=w.document.querySelector('.go-stop-prompt');assert(prompt,'go/stop uses the clear compact prompt');assert.equal(prompt.getAttribute('aria-modal'),'true');assert(w.document.querySelector('.caps-own [data-face="20"]'));assert(w.document.querySelector('[data-card="8"]'));assert(w.document.querySelector('.go-stop-prompt #go'));assert(w.document.querySelector('.go-stop-prompt #stop'));
  await t.accept(stamp({...initial,round:2,version:27}));assert.equal(w.document.querySelector('.go-stop-prompt'),null,'decision prompt is removed when the turn advances');
  console.log('PASS: persistent Matgo board/cards/focus/scroll, decoded artwork, deck controls, ordered concurrent snapshots and old-round cancellation');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
