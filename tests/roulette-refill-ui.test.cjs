const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const flush=async()=>{await tick();await tick();await tick()};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve}};
const me='10000000-0000-4000-8000-000000000001';
const wallet=patch=>{const value={gold:999,available:999,coins:25,free_left:2,refill_cost:0,refill_amount:10000,can_refill:true,refill_locked:false,charged:0,duplicate:false,...patch};value.available=patch?.available??value.gold;return value};
const room=patch=>({id:'room-one',code:'ABCDEF12',hostId:me,mode:'online',status:'betting',round:0,capacity:4,bettingDeadline:null,players:[{userId:me,name:'나',ready:false,connected:true,computer:false,bets:{},stake:0}],me:{userId:me,ready:false,confirmed:false,bets:{},stake:0},spin:null,result:null,...patch});

// The money outcomes are explicit server responses, not a second implementation
// of the SQL economy. Exercise the real app's requests, rendering and controls.
async function fixture(t,options={}){
  const engine=await import(pathToFileURL(path.join(root,'games/roulette/engine.js')).href);
  const dom=new JSDOM(read('games/roulette/index.html'),{url:'https://roulette.test/games/roulette/index.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,calls=[],queued=[];let serverWallet=wallet(options.wallet),current=clone(options.room??null),time=Date.now()+10000,closed=false,timerId=-1;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>0;w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLElement.prototype.animate=function(){return{finished:Promise.resolve()}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
  const nativeTimeout=w.setTimeout.bind(w),nativeClear=w.clearTimeout.bind(w);
  w.setTimeout=(fn,delay,...args)=>fn.name==='poll'?timerId--:nativeTimeout(fn,delay,...args);
  w.clearTimeout=id=>{if(id>=0)nativeClear(id)};
  class Wheel{constructor(canvas,callbacks){this.callbacks=callbacks;w.testWheel=this}resize(){}setReduced(){}setVisible(){}start(spin){this.last=spin}showResult(){}}
  class Sound{unlock(){return Promise.resolve()}setEnabled(){}chip(){}beginRoll(){}stopRoll(){}win(){}roll(){}updateRoll(){}}
  Object.assign(w,engine,{RouletteWheel:Wheel,Sound,addChipDepth(){}});
  w.localStorage.setItem('ojjuda.roulette.preferences.v1',JSON.stringify({sound:false,reducedOverride:true}));
  const snapshot=()=>({ok:true,serverTime:++time,wallet:clone(serverWallet),room:clone(current)});
  const server=async body=>{
    calls.push(clone(body));
    if(body.action==='refill'){
      const response=queued.shift();if(!response)throw Error('unexpected_refill');
      if(response.gate)await response.gate.promise;
      if(response.wallet)serverWallet=wallet(response.wallet);
      if(response.error)throw Error(response.error);
    }else if(body.action==='bet'&&current){current.me.bets=clone(body.bets);current.players[0].bets=clone(body.bets)}
    const data=snapshot();if(body.action==='list')data.rooms=[];return data;
  };
  const parent={postMessage(message){if(message.type!=='rpc')return;Promise.resolve().then(()=>server(message.body)).then(data=>reply(message.id,data),error=>reply(message.id,null,error.message))}};
  Object.defineProperty(w,'parent',{value:parent});
  function reply(id,data,error=null){if(!closed)w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:parent,data:{source:'ojjuda-world',type:'roulette-rpc',id,data,error}}))}
  w.eval(read('games/roulette/app.js').replace(/^import .*;\n/gm,'')+'\nwindow.__refillTest={state,poll};');
  w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:parent,data:{source:'ojjuda-world',type:'roulette-init',owner:me}}));
  await flush();t.after(()=>{closed=true;w.close()});
  const find=selector=>{const element=w.document.querySelector(selector);assert.ok(element,selector+' exists');return element};
  return{w,calls,find,state:w.__refillTest.state,
    button:()=>find(current?'#refillButton':'#lobbyRefillButton'),
    enqueue:response=>queued.push(response),
    refills:()=>calls.filter(call=>call.action==='refill'),
    async refresh(nextWallet,nextRoom){if(nextWallet)serverWallet=wallet(nextWallet);if(arguments.length>1)current=clone(nextRoom);await w.__refillTest.poll();await flush()},
    feedback:()=>['#refillMessage','#toast','#connectionStatus'].map(selector=>w.document.querySelector(selector)?.textContent||'').join(' ')
  };
}
const unavailable=button=>button.disabled||button.hidden;
const assertUUID=value=>assert.match(value,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

test('the lobby offers two lifetime free additions, then asks explicitly before spending 10 ZU',async t=>{
  const f=await fixture(t);assert.equal(unavailable(f.button()),false);assert.match(f.button().textContent,/무료/);assert.match(f.button().textContent,/2/);
  for(const freeLeft of [1,0]){
    f.enqueue({wallet:wallet({gold:10999,free_left:freeLeft,refill_cost:freeLeft?0:10,can_refill:false})});
    f.button().click();await flush();
    const request=f.refills().at(-1);assert.equal(request.paid,false);assertUUID(request.request_id);
    assert.equal(f.state.balance,10999,'the existing 999 G is retained alongside the server addition');
    assert.equal(f.find('#balance').textContent,'10,999');assert.ok(unavailable(f.button()));
    await f.refresh(wallet({free_left:freeLeft,refill_cost:freeLeft?0:10}));
    assert.match(f.button().textContent,freeLeft?/무료/:/10\s*쭈/);
  }
  const before=f.refills().length;f.button().click();await flush();
  assert.equal(f.find('#refillDialog').open,true);assert.equal(f.refills().length,before,'opening the paid dialog does not spend ZU');
  assert.match(f.find('#refillCost').textContent,/10/);assert.match(f.find('#refillCoins').textContent,/25/);
  const cancel=[...f.find('#refillDialog').querySelectorAll('button')].find(button=>/취소/.test(button.textContent));assert.ok(cancel,'paid dialog offers cancellation');
  cancel.click();await flush();assert.equal(f.find('#refillDialog').open,false);assert.equal(f.refills().length,before);
  f.button().click();await flush();f.enqueue({wallet:wallet({gold:10999,coins:15,free_left:0,refill_cost:10,charged:10,can_refill:false})});
  f.find('#confirmRefillButton').click();await flush();
  const paid=f.refills().at(-1);assert.equal(paid.paid,true);assertUUID(paid.request_id);assert.equal(new Set(f.refills().map(r=>r.request_id)).size,3,'successful separate purchases have distinct IDs');
  assert.equal(f.find('#refillDialog').open,false);assert.equal(f.state.balance,10999);assert.ok(unavailable(f.button()));
});

test('a 1,000 G wallet cannot refill when an editable draft makes the displayed balance look lower',async t=>{
  const f=await fixture(t,{room:room(),wallet:wallet({gold:1000,can_refill:false})});
  assert.ok(unavailable(f.button()));f.find('[data-bet="n7"]').click();await flush();
  assert.equal(f.state.balance,1000);assert.equal(f.find('#balance').textContent,'900');assert.equal(f.state.bets.n7,100);
  assert.ok(unavailable(f.button()),'eligibility uses the account gold, not gold minus a draft');
  f.button().click();await flush();assert.equal(f.refills().length,0);
});

test('999 G with an unready draft can refill without losing that draft or charging ZU',async t=>{
  const f=await fixture(t,{room:room()});f.find('[data-bet="n7"]').click();await flush();
  assert.equal(f.find('#balance').textContent,'899');assert.equal(unavailable(f.button()),false);
  f.enqueue({wallet:wallet({gold:10999,free_left:1,can_refill:false})});f.button().click();await flush();
  assert.equal(f.refills().length,1);assert.equal(f.refills()[0].paid,false);assert.equal(f.state.balance,10999);assert.equal(f.state.bets.n7,100);
  assert.equal(f.find('#balance').textContent,'10,899','draft display is deducted once from the new server wallet');
  assert.equal(f.find('[data-bet="n7"]').querySelectorAll('.bet-stack').length,1);
});

test('server restrictions and reserved or unconfirmed rounds cannot be bypassed by a low displayed balance',async t=>{
  const f=await fixture(t);
  for(const values of [wallet({can_refill:false}),wallet({refill_locked:true}),wallet({gold:1000,can_refill:true})]){
    await f.refresh(values);assert.ok(unavailable(f.button()));f.button().click();await flush();
  }
  const prepared=room();prepared.me={...prepared.me,ready:true,bets:{n7:100},stake:100};Object.assign(prepared.players[0],{ready:true,bets:{n7:100},stake:100});
  await f.refresh(wallet({gold:899,refill_locked:true,can_refill:false}),prepared);assert.ok(unavailable(f.button()));f.button().click();
  for(const status of ['spinning','finished']){
    const playing=room({status,round:1});playing.me={...playing.me,ready:true,bets:{n7:100},stake:100};playing.spin={id:'spin-one',number:7,duration:20000,startedAt:Date.now(),variation:.5,bets:{n7:100}};
    await f.refresh(wallet({gold:899,refill_locked:true,can_refill:false}),playing);assert.ok(unavailable(f.button()));f.button().click();
    if(status==='finished')f.w.testWheel.callbacks.onDone('spin-one');
    assert.ok(unavailable(f.button()),'showing a result does not unlock a still-unconfirmed wager');
  }
  await flush();assert.equal(f.refills().length,0);
});

test('a held free refill disables both controls, rejects double clicks, and waits for the server balance',async t=>{
  const f=await fixture(t,{room:room()}),gate=deferred();
  f.enqueue({gate,wallet:wallet({gold:10999,free_left:1,can_refill:false})});f.button().click();f.button().click();await flush();
  assert.equal(f.refills().length,1);assert.equal(f.state.balance,999,'no optimistic credit before server confirmation');
  assert.equal(f.find('#refillButton').disabled,true);assert.equal(f.find('#lobbyRefillButton').disabled,true);
  f.find('#lobbyRefillButton').click();await flush();assert.equal(f.refills().length,1,'the alternative entry cannot submit another refill');
  gate.resolve();await flush();assert.equal(f.state.balance,10999);assert.ok(unavailable(f.button()));
});

test('a paid refill waits for explicit consent and stays busy until its server response',async t=>{
  const f=await fixture(t,{wallet:wallet({free_left:0,refill_cost:10})}),gate=deferred();
  f.button().click();await flush();assert.equal(f.refills().length,0);
  f.enqueue({gate,wallet:wallet({gold:10999,coins:15,free_left:0,refill_cost:10,can_refill:false,charged:10})});
  f.find('#confirmRefillButton').click();f.find('#confirmRefillButton').click();await flush();
  assert.equal(f.refills().length,1);assert.equal(f.refills()[0].paid,true);assert.equal(f.find('#confirmRefillButton').disabled,true);assert.equal(f.state.balance,999);
  gate.resolve();await flush();assert.equal(f.find('#refillDialog').open,false);assert.equal(f.state.balance,10999);
});

test('insufficient ZU returned by the server leaves gold unchanged and presents a retryable error',async t=>{
  const f=await fixture(t,{wallet:wallet({free_left:0,refill_cost:10})});f.button().click();await flush();
  f.enqueue({error:'insufficient_zzu'});f.find('#confirmRefillButton').click();await flush();
  assert.equal(f.state.balance,999);assert.equal(f.find('#refillDialog').open,true);assert.equal(f.find('#confirmRefillButton').disabled,false);
  assert.match(f.feedback(),/쭈/);assert.match(f.feedback(),/부족/);
  f.enqueue({wallet:wallet({gold:10999,coins:15,free_left:0,refill_cost:10,can_refill:false,charged:10})});f.find('#confirmRefillButton').click();await flush();
  assert.equal(f.state.balance,10999);assert.equal(f.find('#refillDialog').open,false);
});

test('a known 9 ZU balance cannot submit a 10 ZU refill',async t=>{
  const f=await fixture(t,{wallet:wallet({coins:9,free_left:0,refill_cost:10,can_refill:false})});
  assert.ok(unavailable(f.button()));assert.equal(f.find('#confirmRefillButton').disabled,true);
  assert.match(f.find('#lobbyRefillHint').textContent,/9쭈/);assert.match(f.find('#lobbyRefillHint').textContent,/10쭈/);
  f.button().click();f.find('#confirmRefillButton').click();await flush();assert.equal(f.refills().length,0);assert.equal(f.state.balance,999);
});

test('a paid dialog closes when a newer server balance or reserved round removes eligibility',async t=>{
  const paid=wallet({free_left:0,refill_cost:10}),f=await fixture(t,{wallet:paid});
  f.button().click();await flush();assert.equal(f.find('#refillDialog').open,true);
  await f.refresh({...paid,gold:1000,can_refill:false});assert.equal(f.find('#refillDialog').open,false);assert.equal(f.find('#confirmRefillButton').disabled,true);
  await f.refresh(paid);f.button().click();await flush();assert.equal(f.find('#refillDialog').open,true);
  const prepared=room();prepared.me={...prepared.me,ready:true,bets:{n7:100},stake:100};
  await f.refresh({...paid,gold:899,can_refill:false,refill_locked:true},prepared);
  assert.equal(f.find('#refillDialog').open,false);f.find('#confirmRefillButton').click();await flush();assert.equal(f.refills().length,0);
});

test('a free allowance consumed elsewhere never becomes a paid charge without new consent',async t=>{
  const f=await fixture(t);f.enqueue({error:'paid_confirmation_required'});f.button().click();await flush();
  assert.equal(f.refills().length,1);assert.equal(f.refills()[0].paid,false);assert.equal(f.state.balance,999);assert.match(f.feedback(),/쭈/);
  await f.refresh(wallet({free_left:0,refill_cost:10}));f.button().click();await flush();
  assert.equal(f.find('#refillDialog').open,true);assert.equal(f.refills().length,1,'a refreshed price still needs a deliberate paid confirmation');
});

test('uncertain free and paid responses retain the same purchase ID on retry',async t=>{
  for(const paid of [false,true])for(const error of ['unavailable','timeout']){
    const f=await fixture(t,{wallet:wallet({free_left:paid?0:2,refill_cost:paid?10:0})});
    if(paid){f.button().click();await flush()}
    const submit=()=>paid?f.find('#confirmRefillButton'):f.button();
    const committed=wallet({gold:10999,coins:paid?15:25,free_left:paid?0:1,refill_cost:paid?10:0,can_refill:false,charged:paid?10:0});
    // The write committed, but its response was lost. No polling is delivered
    // before the retry, exactly the case where a new ID could charge twice.
    f.enqueue({wallet:committed,error});submit().click();await flush();
    assert.equal(f.state.balance,999);assert.equal(f.refills().length,1);const first=f.refills()[0];assertUUID(first.request_id);
    assert.equal(submit().disabled,false,'a network error releases the pending control');
    f.enqueue({wallet:{...committed,duplicate:true}});submit().click();await flush();
    assert.equal(f.refills().length,2);assert.equal(f.refills()[1].request_id,first.request_id,'an uncertain purchase keeps its idempotency key');assert.equal(f.refills()[1].paid,paid);
    assert.equal(f.state.balance,10999,'the replayed server receipt is applied once');
  }
});

test('the parent bridge forwards refill and publishes the returned ZU balance without confusing it with gold',async t=>{
  const dom=new JSDOM('<button>오락실</button>',{url:'https://roulette.test/world.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[],coins=[],responses=[];
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  let fail=false;
  const client={rpc:async(name,args)=>{calls.push({name,args:clone(args)});return{data:fail?{ok:false,error:'insufficient_zzu'}:{ok:true,wallet:wallet({gold:10999,coins:15,free_left:0,refill_cost:10,can_refill:false,charged:10}),room:null},error:null}}};
  w.OjjudaMatgoAccess={check:async()=>({userId:me,age:25}),visible:()=>true,subscribe:()=>()=>{},getClient:()=>client};
  w.eval(read('game-session.js'));w.eval(read('world-roulette-game.js'));
  await w.OjjudaRouletteBridge.open({owner:me,client,onCoins:value=>coins.push(value)});
  const child=w.document.querySelector('iframe').contentWindow;child.postMessage=value=>responses.push(clone(value));
  const send=(id,body)=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:child,data:{source:'ojjuda-roulette',type:'rpc',id,body}}));
  t.after(()=>w.close());
  w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:child,data:{source:'ojjuda-roulette',type:'ready'}}));await flush();
  assert.ok(responses.some(value=>value.type==='roulette-init'),'the parent completes the actual session handshake');calls.length=0;coins.length=0;responses.length=0;
  const id=randomUUID();send('refill-first',{action:'refill',request_id:id,paid:true});await flush();
  assert.deepEqual(calls,[{name:'roulette_action',args:{p_action:'refill',p_payload:{request_id:id,paid:true}}}]);
  assert.deepEqual(coins,[15],'the main application receives ZU, not the 10,999 G roulette wallet');
  assert.equal(responses.at(-1).data.wallet.gold,10999);assert.equal(responses.at(-1).data.wallet.coins,15);
  fail=true;send('refill-error',{action:'refill',request_id:randomUUID(),paid:true});await flush();
  assert.deepEqual(coins,[15],'a rejected refill cannot mutate the main ZU display');assert.equal(responses.at(-1).error,'insufficient_zzu');
});
