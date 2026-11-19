const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const test=require('node:test');
const {JSDOM}=require('jsdom');
const feature=path.resolve(__dirname,'../features/pajang');
const {build}=createRequire(path.join(feature,'package.json'))('esbuild');
const clone=value=>JSON.parse(JSON.stringify(value));
const turn=()=>new Promise(resolve=>setTimeout(resolve,10));
const offers=[{id:'signal_1',quantity:1,price:11,revision:4},{id:'signal_3',quantity:3,price:31,revision:7},{id:'signal_5',quantity:5,price:51,revision:2}];
// Keep the varied-price fixtures above to prove the UI does not assume a price.
// These are the six configured launch offers returned by the server.
const launchOffers=[[1,10,2],[3,28,2],[5,45,2],[10,85,1],[20,160,1],[30,225,1]]
  .map(([quantity,price,revision])=>({id:'signal_'+quantity,quantity,price,revision}));
const wait=async(check,message='condition should be met')=>{
  for(let i=0;i<200;i++){if(check())return;await turn();}assert.ok(check(),message);
};
const bundles=new Map();
function bundle(mode){
  if(!bundles.has(mode))bundles.set(mode,build({stdin:{resolveDir:feature,loader:'tsx',contents:`
    import {createRoot} from 'react-dom/client';
    import {SignalPurchaseForm} from './src/app/signal-purchase';
    import StationApp from './src/app/station-app';
    ${mode==='station-toolbar'?"import {installPajangToolbar} from './account-toolbar.mjs';":''}
    let root;
    window.mountSignals=()=>{root=createRoot(document.getElementById('root'));root.render(${mode!=='form'
      ? '<StationApp initialStation={window.signalState}/>'
      : '<SignalPurchaseForm onBusyChange={value=>window.signalBusy(value)} onWallet={(value,id)=>window.signalWallet(value,id)} onPurchased={(value,id)=>window.signalBought(value,id)}/>'});};
    window.unmountSignals=()=>{root?.unmount();root=null;};window.mountSignals();
    ${mode==='station-toolbar'?'installPajangToolbar();':''}
  `},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}}).then(result=>result.outputFiles[0].text));
  return bundles.get(mode);
}

// The real React UI runs against an isolated wallet and receipt ledger. No live
// member data, authentication, purchase, or top-up is accessed by this test.
async function fixture(t,{wallet={},purchase,mode='form',remaining}={}){
  const dom=new JSDOM('<!doctype html><header class="pajang-mast"><button data-notifications-open><span data-notification-dot hidden></span></button><button data-ju-charge-open><span data-pajang-balance>…</span></button></header><div id="root"></div>',{url:'https://signals.test/features/pajang/station.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){if(this.open){this.open=false;this.dispatchEvent(new w.Event('close'));}};
  w.OjjudaLocation={acceptPreference(){},subscribe(){return ()=>{};}};w.pajangArt={};
  const state={calls:[],successes:[],wallets:[],busy:[],events:[],receipts:new Map(),
    wallet:{ok:true,coins:150,freeRemaining:0,paidRemaining:0,remaining:0,purchasingEnabled:true,offers:clone(offers),...wallet}};
  w.signalBusy=value=>state.busy.push(value);
  w.signalWallet=(value,id)=>state.wallets.push({value:clone(value),id});
  w.signalBought=(value,id)=>state.successes.push({value:clone(value),id});
  w.addEventListener('pajang:balance',event=>state.events.push(clone(event.detail)));
  const listeners=new Set();let session={access_token:'member-one-token',user:{id:'member-one',is_anonymous:false}};
  state.changeUser=id=>{session=id?{access_token:id+'-token',user:{id,is_anonymous:false}}:null;for(const fn of listeners)fn('SIGNED_IN',session);};
  const me={id:'pajang-one',name:'보리',region:'서울특별시',interest:'book',body:'내 이야기'};
  const peer={id:'pajang-two',name:'라온',region:'서울특별시',interest:'walk',body:'같이 걸어요.'};
  w.signalState={day:'2026-11-19',slot:'am',nextAt:new Date(Date.now()+3600000).toISOString(),question:{id:1,q:['오늘은 무엇을 하고 싶나요?']},
    me,people:[peer],signals:[],messages:[],authenticated:true,locationEnabled:false,locationVersion:0,radarOn:false,
    remaining:remaining??state.wallet.remaining,freeRemaining:remaining??state.wallet.freeRemaining,paidRemaining:state.wallet.paidRemaining,purchasingEnabled:state.wallet.purchasingEnabled};
  const receipt=(args,replayed=false)=>({...clone(state.wallet),requestId:args.p_request_id,pack:args.p_pack,
    quantity:state.wallet.offers.find(x=>x.id===args.p_pack).quantity,price:args.p_expected_price,revision:args.p_expected_revision,charged:replayed?0:args.p_expected_price,replayed});
  state.defaultPurchase=args=>{
    const saved=state.receipts.get(args.p_request_id);
    if(saved)return {data:{...clone(saved),coins:state.wallet.coins,freeRemaining:state.wallet.freeRemaining,paidRemaining:state.wallet.paidRemaining,remaining:state.wallet.remaining,charged:0,replayed:true},error:null};
    if(args.p_verify_only)return {data:{ok:false,reason:'not_found'},error:null};
    const offer=state.wallet.offers.find(x=>x.id===args.p_pack);
    if(!offer)return {data:{ok:false,reason:'purchase_unavailable'},error:null};
    if(offer.price!==args.p_expected_price||offer.revision!==args.p_expected_revision)return {data:{ok:false,reason:'price_changed'},error:null};
    if(state.wallet.freeRemaining>0)return {data:{ok:false,reason:'free_remaining'},error:null};
    if(state.wallet.coins<offer.price)return {data:{ok:false,reason:'coins'},error:null};
    state.wallet.coins-=offer.price;state.wallet.paidRemaining+=offer.quantity;state.wallet.remaining+=offer.quantity;
    const result=receipt(args);state.receipts.set(args.p_request_id,clone(result));return {data:result,error:null};
  };
  const db={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:listener=>{listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};}},
    from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{coins:state.wallet.coins}})})})}),
    schema:()=>({rpc:(name,args)=>db.rpc(name,args)}),rpc(name,args){
    let request,signal;const headers={};
    const query={setHeader(key,value){headers[key]=value;return query;},abortSignal(value){signal=value;return query;},then(resolve,reject){
      if(!request)request=Promise.resolve().then(async()=>{
        state.calls.push({name,args:clone(args??{}),headers:clone(headers)});
        if(name==='pajang_signal_wallet')return state.walletError?{error:{message:'wallet read failed'}}:{data:clone(state.wallet),error:null};
        if(name==='pajang_signal_purchase')return (await purchase?.(args,state,signal))??state.defaultPurchase(args);
        if(name==='pajang_discovery_feed')return {data:{items:[{...peer,peer:peer.id,day:'2026-11-19',slot:'am',at:1,question:'오늘은 무엇을 하고 싶나요?',own:false,sent:false,received:false}],nextCursor:null,total:1,remaining:w.signalState.remaining}};
        if(name==='pajang_member'){
          if(args.p_action==='signal'){
            w.signalState.remaining--;w.signalState.signals.push({src:me.id,dst:args.p_data.peer,day:'2026-11-19',note:args.p_data.note,at:1});
          }
          return {data:clone(w.signalState)};
        }
        if(name==='is_admin')return {data:false};
        if(name==='app_notification_summary')return {data:{notifications:0,retention:0}};
        if(name==='list_app_notifications')return {data:{items:[],unread_count:0,as_of:'2026-11-19T00:00:00Z',has_more:false,next_cursor:null}};
        if(name==='list_retention_alerts')return {data:[]};
        if(name==='beta_charge_status')return {data:{ok:true,enabled:true,coins:state.wallet.coins,left:5,limit:5}};
        if(name==='beta_charge'){state.wallet.coins+=10;return {data:{ok:true,coins:state.wallet.coins,added:10,bonus:0}};}
        throw Error('Unexpected RPC '+name);
      });return request.then(resolve,reject);
    }};return query;
  }};
  w.OjjudaGetClient=async()=>db;
  w.eval(await bundle(mode));
  t.after(()=>{w.unmountSignals();w.close();});
  const form=()=>w.document.querySelector('.signal-purchase');
  const submit=()=>form().requestSubmit();
  const purchases=()=>state.calls.filter(x=>x.name==='pajang_signal_purchase');
  const alert=()=>w.document.querySelector('[role="alert"]');
  const select=async id=>{const radio=w.document.querySelector(`input[name="signal-pack"][value="${id}"]`);assert.ok(radio,'offer should be selectable');radio.click();await turn();};
  const f={w,state,form,submit,select,purchases,alert,receipt,
    async reopen(){w.unmountSignals();w.mountSignals();await wait(()=>form()?.getAttribute('aria-busy')==='false');},
    balance(userId,coins){w.dispatchEvent(new w.CustomEvent('pajang:balance',{detail:{userId,coins}}));},
    buy:()=>form()?.querySelector('button[type="submit"]')};
  await wait(()=>mode==='form'?form()?.getAttribute('aria-busy')==='false':w.document.querySelector('#answers .sendlink'));
  return f;
}

test('server offers require a selection and explicit consent; duplicate submissions share one charge',async t=>{
  let resolve;
  const f=await fixture(t,{purchase:(args,state)=>new Promise(done=>{resolve=()=>done(state.defaultPurchase(args));})});
  assert.equal(f.buy().disabled,true);assert.equal(f.purchases().length,0);
  assert.deepEqual([...f.w.document.querySelectorAll('.signal-offers b')].map(x=>x.textContent),['11쭈','31쭈','51쭈']);
  await f.select('signal_3');assert.match(f.buy().textContent,/31쭈.*3개/);
  f.submit();f.submit();await wait(()=>f.purchases().length===1);
  assert.equal(f.buy().disabled,true);assert.equal(f.purchases()[0].headers.Authorization,'Bearer member-one-token');
  assert.equal(f.purchases()[0].args.p_expected_price,31);assert.equal(f.purchases()[0].args.p_expected_revision,7);
  assert.equal(f.purchases()[0].args.p_expected_user,'member-one');assert.equal(f.purchases()[0].args.p_verify_only,false);
  resolve();await wait(()=>f.state.successes.length===1);
  assert.equal(f.state.wallet.coins,119);assert.equal(f.state.successes[0].value.remaining,3);
  assert.deepEqual(f.state.events,[{userId:'member-one',coins:119}]);
});

test('all six configured signal offers display and purchase at their server price and revision',async t=>{
  for(const offer of launchOffers)await t.test(`${offer.quantity} signals for ${offer.price} coins`,async t=>{
    const f=await fixture(t,{mode:'station',wallet:{coins:1000,offers:clone(launchOffers)}});
    f.w.document.querySelector('.signal-buy').click();await wait(()=>f.form()?.getAttribute('aria-busy')==='false');
    const shown=[...f.form().querySelectorAll('.signal-offers label')].map(label=>({
      id:label.querySelector('input').value,quantity:label.querySelector('strong').textContent,price:label.querySelector('b').textContent
    }));
    assert.deepEqual(shown,launchOffers.map(item=>({id:item.id,quantity:`신호 ${item.quantity}개`,price:`${item.price}쭈`})));
    assert.equal(f.buy().disabled,true);assert.equal(f.purchases().length,0);
    await f.select(offer.id);
    assert.equal(f.buy().textContent,`${offer.price}쭈로 신호 ${offer.quantity}개 구매`);
    assert.equal(f.form().querySelector('.signal-confirm strong').textContent,`신호 ${offer.quantity}개`);
    assert.equal(f.form().querySelector('.signal-confirm span').textContent,`${offer.price}쭈 사용`);
    f.submit();await wait(()=>f.state.receipts.size===1&&!f.form());
    assert.equal(f.purchases().length,1);
    const args=f.purchases()[0].args;
    assert.equal(args.p_pack,offer.id);assert.equal(args.p_expected_price,offer.price);
    assert.equal(args.p_expected_revision,offer.revision);assert.equal(args.p_expected_user,'member-one');
    assert.equal(args.p_verify_only,false);
    assert.equal(f.state.wallet.coins,1000-offer.price);
    assert.equal(f.state.wallet.paidRemaining,offer.quantity);
    assert.equal(f.w.document.querySelector('.budget b').textContent,`${offer.quantity}개`);
    assert.deepEqual(f.state.events,[{userId:'member-one',coins:1000-offer.price}]);
    assert.equal(f.state.calls.filter(call=>call.name==='pajang_member'&&call.args.p_action==='signal').length,0);
  });
});

test('disabled purchasing has no fallback prices or purchase control',async t=>{
  const f=await fixture(t,{wallet:{purchasingEnabled:false,offers:[]}});
  assert.equal(f.w.document.querySelectorAll('[name="signal-pack"]').length,0);
  assert.equal(f.buy(),null);f.submit();await turn();assert.equal(f.purchases().length,0);
});

test('insufficient coins use the common top-up entry and only a matching balance event enables purchase',async t=>{
  const f=await fixture(t,{wallet:{coins:4}});await f.select('signal_3');
  assert.equal(f.buy().disabled,true);assert.ok(f.w.document.querySelector('[data-ju-charge-open]'));
  f.submit();await turn();assert.equal(f.purchases().length,0);
  f.balance('member-two',1000);f.balance('member-one',NaN);await turn();assert.equal(f.buy().disabled,true);
  f.balance('member-one',45);await turn();assert.equal(f.buy().disabled,false);
  assert.equal(f.purchases().length,0,'a top-up never automatically buys signals');
});

test('a lost purchase reply retries the same UUID and never credits the replay twice',async t=>{
  let first=true;
  const f=await fixture(t,{purchase:(args,state)=>{
    if(first){first=false;state.defaultPurchase(args);return {data:null,error:{message:'connection lost'}};}
  }});
  await f.select('signal_5');f.submit();await wait(f.alert);
  assert.equal(f.state.wallet.coins,99);assert.equal(f.state.successes.length,0);
  assert.equal(f.w.document.querySelectorAll('[name="signal-pack"]').length,0,'an uncertain purchase cannot silently switch packages');
  f.submit();await wait(()=>f.state.successes.length===1);
  assert.equal(f.purchases().length,2);assert.equal(f.purchases()[0].args.p_request_id,f.purchases()[1].args.p_request_id);
  assert.equal(f.state.wallet.coins,99);assert.equal(f.state.successes[0].value.remaining,5);
  assert.equal(f.state.successes[0].value.replayed,true);assert.equal(f.state.successes[0].value.charged,0);
});

test('reopening an uncertain purchase performs receipt-only recovery without another debit',async t=>{
  let first=true;
  const f=await fixture(t,{purchase:(args,state)=>{
    if(first){first=false;state.defaultPurchase(args);return {data:null,error:{message:'lost reply'}};}
  }});
  await f.select('signal_1');f.submit();await wait(f.alert);await f.reopen();
  await wait(()=>f.state.successes.length===1);
  assert.equal(f.purchases().length,2);assert.equal(f.purchases()[1].args.p_verify_only,true);
  assert.equal(f.purchases()[0].args.p_request_id,f.purchases()[1].args.p_request_id);
  assert.equal(f.state.wallet.coins,139);
});

test('a pending request with no receipt stays pending until the user explicitly retries',async t=>{
  let first=true;
  const f=await fixture(t,{purchase:()=>{if(first){first=false;return {data:null,error:{message:'offline'}};}}});
  await f.select('signal_1');f.submit();await wait(f.alert);await f.reopen();
  assert.equal(f.purchases().length,2);assert.equal(f.purchases()[1].args.p_verify_only,true);
  assert.equal(f.state.wallet.coins,150);assert.equal(f.state.successes.length,0);
  f.submit();await wait(()=>f.state.successes.length===1);
  assert.equal(f.purchases()[2].args.p_request_id,f.purchases()[0].args.p_request_id);
});

test('blocked browser storage keeps the current pending UUID in memory for safe recovery',async t=>{
  let first=true;
  const f=await fixture(t,{purchase:(args,state)=>{if(first){first=false;state.defaultPurchase(args);return {error:{message:'lost reply'}};}}});
  f.w.Storage.prototype.setItem=function(){throw Error('storage blocked');};
  await f.select('signal_3');f.submit();await wait(f.alert);await f.reopen();
  await wait(()=>f.state.successes.length===1);
  assert.equal(f.purchases()[1].args.p_verify_only,true);
  assert.equal(f.purchases()[0].args.p_request_id,f.purchases()[1].args.p_request_id);
  assert.equal(f.state.wallet.coins,119);
});

test('a price change invalidates the old selection and needs explicit consent at the new price',async t=>{
  const f=await fixture(t);await f.select('signal_3');
  f.state.wallet.offers[1]={...f.state.wallet.offers[1],price:33,revision:8};
  f.submit();await wait(()=>f.alert()?.textContent.includes('가격이 바뀌었어요'));
  assert.equal(f.state.wallet.coins,150);assert.equal(f.buy().disabled,true);
  assert.equal(f.w.document.querySelector('[name="signal-pack"]:checked'),null);
  await f.select('signal_3');assert.match(f.buy().textContent,/33쭈/);f.submit();await wait(()=>f.state.successes.length===1);
  assert.equal(f.purchases()[1].args.p_expected_price,33);assert.equal(f.purchases()[1].args.p_expected_revision,8);
  assert.notEqual(f.purchases()[0].args.p_request_id,f.purchases()[1].args.p_request_id);
});

test('mismatched receipts never report success or publish a balance',async t=>{
  const f=await fixture(t,{purchase:(args,state)=>{const result=state.defaultPurchase(args);result.data.requestId='wrong-request';return result;}});
  await f.select('signal_1');f.submit();await wait(f.alert);
  assert.equal(f.state.successes.length,0);assert.deepEqual(f.state.events,[]);
  assert.match(f.buy().textContent,/같은 구매/);
});

test('receipt revisions must match the price explicitly confirmed by the member',async t=>{
  const f=await fixture(t,{purchase:(args,state)=>{const result=state.defaultPurchase(args);result.data.revision++;return result;}});
  await f.select('signal_1');f.submit();await wait(f.alert);
  assert.equal(f.state.successes.length,0);assert.deepEqual(f.state.events,[]);
});

test('an explicit rejection keeps its correct message if refreshing the wallet also fails',async t=>{
  const f=await fixture(t,{purchase:(_args,state)=>{state.walletError=true;return {data:{ok:false,reason:'price_changed'}};}});
  await f.select('signal_3');f.submit();await wait(()=>f.alert()?.textContent.includes('잔액을 다시 확인'));
  assert.match(f.alert().textContent,/가격이 바뀌었어요/);assert.doesNotMatch(f.alert().textContent,/같은 구매/);
  assert.equal(f.w.sessionStorage.getItem('pajang:signal-purchase:member-one'),null);
});

test('an account change rejects a late purchase response and preserves recovery for its original owner',async t=>{
  let resolve;
  const f=await fixture(t,{purchase:(args,state)=>new Promise(done=>{resolve=()=>done(state.defaultPurchase(args));})});
  await f.select('signal_3');f.submit();await wait(()=>f.purchases().length===1);
  f.state.changeUser('member-two');resolve();await wait(()=>f.alert()?.textContent.includes('계정이 바뀌었어요'));
  assert.equal(f.state.successes.length,0);assert.deepEqual(f.state.events,[]);
  assert.ok(f.w.sessionStorage.getItem('pajang:signal-purchase:member-one'));
  assert.equal(f.w.sessionStorage.getItem('pajang:signal-purchase:member-two'),null);
});

test('a free signal restored before purchase blocks the charge and refreshes the quota',async t=>{
  const f=await fixture(t);await f.select('signal_1');
  f.state.wallet.freeRemaining=3;f.state.wallet.remaining=3;
  f.submit();await wait(()=>f.alert()?.textContent.includes('무료 신호'));
  assert.equal(f.state.wallet.coins,150);assert.equal(f.buy(),null);
  assert.equal(f.state.wallets.at(-1).value.freeRemaining,3);
});

test('the exhausted feed enters purchasing and returns to the signal editor without sending',async t=>{
  const f=await fixture(t,{mode:'station'});
  assert.equal(f.w.document.querySelector('#answers .sendlink').disabled,false);
  f.w.document.querySelector('#answers .sendlink').click();await wait(()=>f.form()?.getAttribute('aria-busy')==='false');
  await f.select('signal_3');f.submit();await wait(()=>f.w.document.querySelector('dialog textarea'));
  assert.equal(f.w.document.querySelector('.budget b').textContent,'3개');
  assert.match(f.w.document.querySelector('.signal-budget small').textContent,/무료 0.*구매 3/);
  assert.equal(f.state.calls.filter(x=>x.name==='pajang_member'&&x.args.p_action==='signal').length,0);
  assert.match(f.w.document.querySelector('dialog button.primary').textContent,/남은 3개/);
});

for(const freeRemaining of [0,3])test(`My Pajang opens and closes signal purchasing with ${freeRemaining} free signals without buying`,async t=>{
  const f=await fixture(t,{mode:'station',wallet:{freeRemaining,remaining:freeRemaining}});
  const {w}=f;
  const entry=()=>[...w.document.querySelectorAll('.account-settings button')].find(button=>
    button.querySelector('.ojjuda-settings-label')?.textContent==='신호 구매');
  w.document.querySelector('nav [aria-label="내 파장"]').click();await wait(entry);
  assert.equal(entry().disabled,false,'the account menu remains available before free signals run out');
  assert.equal(entry().nextElementSibling,w.document.querySelector('.account-settings [data-ju-charge-open]'),
    'signal purchasing appears directly above coin top-up');
  const index=w.history.state.pajangNavigation.index;
  entry().click();await wait(()=>f.form()?.getAttribute('aria-busy')==='false');
  assert.equal(w.document.querySelector('dialog[open]').getAttribute('aria-label'),'추가 신호 구매');
  assert.equal(new URL(w.location.href).searchParams.get('tab'),'profile');
  assert.equal(f.purchases().length,0,'opening the existing purchase popup never buys a package');
  if(freeRemaining){
    assert.match(f.form().textContent,/무료 신호를 먼저 사용해 주세요/);
    assert.equal(f.buy(),null);
    assert.equal(f.form().querySelectorAll('[name="signal-pack"]').length,0);
  }else{
    assert.equal(f.form().querySelectorAll('[name="signal-pack"]').length,offers.length);
    assert.equal(f.buy().disabled,true,'an available purchase still requires an explicit package choice');
  }
  w.history.back();await wait(()=>!f.form()&&w.history.state.pajangNavigation.index===index);
  assert.equal(new URL(w.location.href).searchParams.get('tab'),'profile','Back closes the popup and keeps My Pajang');
  assert.ok(entry());
  entry().click();await wait(()=>f.form()?.getAttribute('aria-busy')==='false');
  w.document.querySelector('dialog[open] [aria-label="닫기"]').click();
  await wait(()=>!f.form()&&w.history.state.pajangNavigation.index===index);
  assert.equal(new URL(w.location.href).searchParams.get('tab'),'profile','the close button also keeps My Pajang');
  assert.ok(entry());
  assert.equal(f.purchases().length,0);
  assert.equal(f.state.receipts.size,0);
  assert.equal(f.state.wallet.coins,150);
  assert.equal(f.state.wallet.freeRemaining,freeRemaining);
});

test('a completed purchase cannot charge again while the history close is still pending',async t=>{
  const f=await fixture(t,{mode:'station'});
  f.w.document.querySelector('.signal-buy').click();await wait(()=>f.form()?.getAttribute('aria-busy')==='false');
  await f.select('signal_3');
  f.w.history.back=()=>{}; // Deliberately delay popstate so the completed form stays mounted.
  f.submit();await wait(()=>f.state.wallet.coins===119&&f.buy()?.textContent==='구매 완료');
  assert.ok(f.form(),'history has not removed the dialog yet');assert.equal(f.buy().disabled,true);
  f.buy().click();f.submit();f.submit();await turn();await turn();
  assert.equal(f.purchases().length,1);assert.equal(f.state.receipts.size,1);assert.equal(f.state.wallet.coins,119);
});

test('disabled production offers preserve the original exhausted feed without purchase notices',async t=>{
  const f=await fixture(t,{mode:'station',wallet:{purchasingEnabled:false,offers:[]}});
  assert.equal(f.w.document.querySelector('#answers .sendlink').disabled,true);
  assert.equal(f.w.document.querySelector('.signal-buy'),null);assert.equal(f.form(),null);
  assert.doesNotMatch(f.w.document.body.textContent,/구매 준비|10쭈|29쭈|48쭈/);
});

test('a signal note survives a quota refresh and purchasing before the user sends it',async t=>{
  const f=await fixture(t,{mode:'station',remaining:1});
  f.w.document.querySelector('#answers .sendlink').click();await wait(()=>f.w.document.querySelector('dialog textarea'));
  const input=f.w.document.querySelector('dialog textarea');
  Object.getOwnPropertyDescriptor(f.w.HTMLTextAreaElement.prototype,'value').set.call(input,'함께 산책하고 싶어요.');
  input.dispatchEvent(new f.w.Event('input',{bubbles:true}));await turn();
  f.w.signalState.remaining=0;f.w.signalState.freeRemaining=0;
  f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));
  await wait(()=>f.form()?.getAttribute('aria-busy')==='false');
  await f.select('signal_1');f.submit();await wait(()=>f.w.document.querySelector('dialog textarea'));
  assert.equal(f.w.document.querySelector('dialog textarea').value,'함께 산책하고 싶어요.');
  assert.equal(f.state.calls.filter(x=>x.name==='pajang_member'&&x.args.p_action==='signal').length,0);
});

test('the common top-up stacks over a purchase, preserving its package and note through Back and close',async t=>{
  const f=await fixture(t,{mode:'station-toolbar',remaining:1,wallet:{coins:4}});
  f.w.document.querySelector('#answers .sendlink').click();await wait(()=>f.w.document.querySelector('dialog textarea'));
  const input=f.w.document.querySelector('dialog textarea');
  Object.getOwnPropertyDescriptor(f.w.HTMLTextAreaElement.prototype,'value').set.call(input,'산책 이야기를 나눠요.');
  input.dispatchEvent(new f.w.Event('input',{bubbles:true}));await turn();
  f.w.signalState.remaining=0;f.w.signalState.freeRemaining=0;f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));
  await wait(()=>f.form()?.getAttribute('aria-busy')==='false');await f.select('signal_1');
  const entry=f.w.history.state.pajangNavigation.index;
  f.form().querySelector('[data-ju-charge-open]').click();
  await wait(()=>f.w.document.querySelector('.ju-charge-dialog')?.open&&f.w.history.state.pajangNavigation.index===entry+1);
  assert.equal(f.form().querySelector('[name="signal-pack"]:checked').value,'signal_1');
  f.w.history.back();await wait(()=>!f.w.document.querySelector('.ju-charge-dialog').open);
  assert.equal(f.w.history.state.pajangNavigation.index,entry);
  assert.equal(f.form().querySelector('[name="signal-pack"]:checked').value,'signal_1');
  f.form().querySelector('[data-ju-charge-open]').click();await wait(()=>f.w.document.querySelector('.ju-charge-dialog').open);
  await wait(()=>!f.w.document.querySelector('.ju-charge-checkout').disabled);
  f.w.document.querySelector('.ju-charge-checkout').click();
  await wait(()=>f.state.wallet.coins===14&&f.w.document.querySelector('[data-pajang-balance]').textContent==='14');
  f.w.document.querySelector('.ju-charge-close').click();
  await wait(()=>!f.w.document.querySelector('.ju-charge-dialog').open&&f.w.history.state.pajangNavigation.index===entry);
  assert.equal(f.form().querySelector('[name="signal-pack"]:checked').value,'signal_1');assert.equal(f.buy().disabled,false);
  assert.equal(f.purchases().length,0,'closing top-up still needs explicit purchase consent');
  f.submit();await wait(()=>f.w.document.querySelector('dialog textarea'));
  assert.equal(f.w.document.querySelector('dialog textarea').value,'산책 이야기를 나눠요.');
  assert.equal(f.state.calls.filter(x=>x.name==='pajang_member'&&x.args.p_action==='signal').length,0);
});

test('common notifications follow Back, Forward, and their own close button without extra history entries',async t=>{
  const f=await fixture(t,{mode:'station-toolbar'});
  const base=f.w.history.state.pajangNavigation.index;
  f.w.document.querySelector('[data-notifications-open]').click();
  const layer=()=>f.w.document.querySelector('#note-notification-backdrop');
  await wait(()=>!layer().hidden&&f.w.history.state.pajangNavigation.index===base+1);
  f.w.history.back();await wait(()=>layer().hidden&&f.w.history.state.pajangNavigation.index===base);
  f.w.history.forward();await wait(()=>!layer().hidden&&f.w.history.state.pajangNavigation.index===base+1);
  layer().querySelector('.nn-heading button').click();await wait(()=>layer().hidden&&f.w.history.state.pajangNavigation.index===base);
});
