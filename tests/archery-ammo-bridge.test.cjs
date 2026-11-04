const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');

const root=path.resolve(__dirname,'..');
const bridge=fs.readFileSync(path.join(root,'world-archery-game.js'),'utf8');
const world=fs.readFileSync(path.join(root,'world.html'),'utf8');
const origin='https://ojjuda.test',owner='11111111-1111-4111-8111-111111111111';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const snapshot=(extra={})=>({ok:true,launch_epoch:5,remaining:20,free_remaining:20,paid_remaining:0,coins:100,revision:1,main_rounds:5,milestones_granted:1,daily_eligible:true,day:'2026-11-02',daily_checked:true,pack_ammo:10,pack_price:5,server_now:'2026-11-02T12:00:00.000Z',coach_expires_at:null,coach_active:false,coach_price:10,coach_duration_seconds:86400,...extra});

// Only the bridge and parent callback wiring run here. There is no network client.
function fixture(options={},fakeTimers=false){
 const listeners=new Map(),nodes=[],classes=new Set(),timers=new Map(),finishes=[];let authorized=true,timerId=0;
 class Element extends EventTarget{
  constructor(tag){super();this.tagName=tag;this.isConnected=false;this.open=false;this.sent=[];if(tag==='iframe')this.contentWindow={postMessage:(data,targetOrigin)=>this.sent.push({data:JSON.parse(JSON.stringify(data)),targetOrigin})};}
  setAttribute(){}
  set innerHTML(html){this.html=html;this.button=new Element('button');this.trialButton=new Element('button');this.trialButton.hidden=true;this.trialButton.textContent=html.match(/data-archery-trial-toggle[^>]*>([^<]*)</)?.[1]||'';this.frame=new Element('iframe');this.frame.src=html.match(/<iframe[^>]*src="([^"]+)"/)[1];}
  querySelector(selector){return selector==='iframe'?this.frame:selector==='button'?this.button:selector==='[data-archery-trial-toggle]'?this.trialButton:null;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){this.isConnected=false;}
  focus(){}
  click(){this.dispatchEvent(new Event('click'));}
 }
 const previous=new Element('button');previous.isConnected=true;
 const document={activeElement:previous,createElement:tag=>new Element(tag),body:{classList:{contains:key=>classes.has(key),add:key=>classes.add(key),remove:key=>classes.delete(key)},append:node=>{node.isConnected=true;nodes.push(node);}}};
 const window={OjjudaGuestAccess:{finished:options=>finishes.push(options)},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);}};
 vm.runInNewContext(bridge,{window,document,location:{origin,search:options.search||''},crypto:{randomUUID},setTimeout:fakeTimers?fn=>{const id=++timerId;timers.set(id,fn);return id;}:setTimeout,clearTimeout:fakeTimers?id=>timers.delete(id):clearTimeout});
 const defaults={owner,authorized:()=>authorized,onAmmoStatus:async()=>snapshot(),onRoundStart:async()=>snapshot({run_id:randomUUID()}),onRoundComplete:async()=>snapshot(),onAmmoSpend:async()=>snapshot(),onAmmoBuy:async()=>snapshot(),onCoachBuy:async()=>snapshot(),onAmmoReceipt:async()=>snapshot({found:false,receipt:null})};
 const api={
  open(overrides={}){window.OjjudaArcheryGame.open({...defaults,...options,...overrides});return nodes.at(-1)?.frame;},
  close(){window.OjjudaArcheryGame.close();},
  expireRequests(){for(const callback of [...timers.values()])callback();timers.clear();},
  setAuthorized(value){authorized=value;},
  get dialog(){return nodes.at(-1);},
  emit(data,{frame=nodes.at(-1).frame,source=frame.contentWindow,messageOrigin=origin}={}){for(const receive of [...(listeners.get('message')||[])])receive({data,source,origin:messageOrigin});},
  ready(frame=nodes.at(-1).frame){api.emit({source:'ojjuda-archery-game',type:'ready'},{frame});return frame.sent.at(-1)?.data;},
  finishes,nodes,
  finish(fields={},overrides={}){
   const frame=overrides.frame||nodes.at(-1).frame,init=frame.sent.find(entry=>entry.data.type==='init')?.data;
   const data={source:'ojjuda-archery-game',type:'round-finished',kind:'main',owner:init?.owner,sessionId:init?.sessionId,runId:randomUUID(),stage:1,...fields};
   api.emit(data,{frame,...overrides});return data;
  },
  async request(action,fields={},overrides={}){
   const frame=overrides.frame||nodes.at(-1).frame,init=frame.sent.find(entry=>entry.data.type==='init')?.data;
   const data={source:'ojjuda-archery-game',type:'ammo-request',launchEpoch:5,owner:init?.owner,sessionId:init?.sessionId,requestId:randomUUID(),action,...fields};
   api.emit(data,{frame,...overrides});await tick();return data;
  },
  responses(frame=nodes.at(-1).frame){return frame.sent.filter(entry=>entry.data.type==='ammo-response').map(entry=>entry.data);}
 };
 api.open();if(api.dialog)api.ready();return api;
}

test('a completed guest main round requests automatic login once while event and stale messages do not',()=>{
 const f=fixture({owner:null});
 try{
  for(const fields of [{kind:'event'},{stage:0},{stage:221},{stage:'1'},{runId:'invalid'},{owner},{sessionId:randomUUID()},{source:'another-game'},{score:9999}])f.finish(fields);
  f.finish({}, {messageOrigin:'https://other.test'});f.finish({}, {source:{}});
  assert.equal(f.finishes.length,0,'only a real same-origin, same-session main result can consume the guest trial');
  const completed=f.finish();assert.deepEqual(f.finishes,[undefined]);
  assert.equal(f.dialog.open,true);assert.equal(f.dialog.isConnected,true,'the result remains visible until the shared login delay completes');
  f.finish(completed);f.finish();assert.equal(f.finishes.length,1,'duplicate completion and replay messages cannot consume twice');
  const oldFrame=f.dialog.frame;f.close();f.open({owner:null});f.ready();
  f.finish(completed);f.finish({}, {frame:oldFrame});assert.equal(f.finishes.length,1,'a closed iframe and its old nonce cannot finish the new session');
  f.setAuthorized(false);f.finish();assert.equal(f.finishes.length,1);assert.equal(f.dialog.isConnected,false);
 }finally{f.close();}
});

test('member and account-changed archery sessions cannot consume a guest trial',()=>{
 const f=fixture();
 try{
  const member=f.finish();f.finish({owner:null});assert.equal(f.finishes.length,0);
  const oldFrame=f.dialog.frame;f.close();f.open({owner:null});f.ready();
  f.finish(member);f.finish(member,{frame:oldFrame});assert.equal(f.finishes.length,0);
  f.finish();assert.deepEqual(f.finishes,[undefined]);
 }finally{f.close();}
});

test('reconnecting opens the coin tab in a normal game without requesting a purchase',()=>{
 const f=fixture({search:'?tab=arcade&game=archery&archery_shop=coin',onCoinExchange:async()=>assert.fail('opening the shop must not buy'),onCoinReceipt:async()=>({ok:true,found:false})});
 try{
  assert.match(f.dialog.frame.src,/&shop=coin(?:&|$)/);
  assert.equal(f.dialog.frame.sent[0].data.coinExchangeAvailable,true);
  assert.equal(f.responses().length,0);
 }finally{f.close();}
});

test('initialization reveals no auth client and only the live same-origin owner/session can request ammo',async()=>{
 let calls=0;const f=fixture({onAmmoStatus:async()=>{calls++;return snapshot();}});
 try{
  const frame=f.dialog.frame,init=frame.sent[0].data;
  assert.equal(init.source,'ojjuda-archery-world');assert.equal(init.owner,owner);assert.equal(init.available,true);
  assert.match(init.sessionId,/^[0-9a-f-]{36}$/);assert.equal(calls,0,'ready does not spend, buy, or claim');
  assert.ok(frame.sent.every(entry=>entry.targetOrigin===origin));
  assert.ok(!('client' in init)&&!('token' in init)&&!('access_token' in init));
  await f.request('status',{}, {messageOrigin:'https://wrong.test'});
  await f.request('status',{}, {source:{}});
  await f.request('status',{owner:'another-owner'});
  await f.request('status',{sessionId:randomUUID()});
  await f.request('status',{source:'another-game'});
  assert.equal(calls,0);assert.equal(f.responses().length,0);
  await f.request('status');assert.equal(calls,1);assert.equal(f.responses().at(-1).result.remaining,20);
  f.setAuthorized(false);await f.request('status');assert.equal(calls,1);assert.equal(f.dialog.isConnected,false);
 }finally{f.close();}
});

test('only allowlisted argument shapes reach callbacks, with no client price/count or arbitrary RPC',async()=>{
 const calls=[];const f=fixture({onRoundStart:async(...args)=>{calls.push(['start',...args]);return snapshot({run_id:owner});},onRoundComplete:async(...args)=>{calls.push(['complete',...args]);return snapshot();},onAmmoBuy:async(...args)=>{calls.push(['buy',...args]);return snapshot();},onCoachBuy:async(...args)=>{calls.push(['coach-buy',...args]);return snapshot();}});
 try{
  for(const [action,fields]of [['status',{launchEpoch:3}],['round-complete',{stage:5,runId:owner,score:151}],['round-complete',{stage:5,runId:owner,score:2.5}],['round-start',{stage:0}],['round-start',{stage:221}],['round-start',{stage:220.5}],['round-start',{stage:'220'}],['round-complete',{stage:221,runId:owner}],['round-complete',{stage:5,runId:'invalid'}],['buy',{price:0}],['buy',{quantity:10000}],['coach-buy',{price:0}],['coach-buy',{duration:999999}],['coach-buy',{coach_expires_at:'2099-01-01'}],['spend',{count:0}],['status',{rpc:'daily_checkin'}],['receipt',{receiptId:owner,originalAction:'status'}]]){
   await f.request(action,fields);assert.equal(f.responses().at(-1).result.reason,'invalid');
  }
  assert.equal(calls.length,0);
  const start=await f.request('round-start',{stage:220});
  const complete=await f.request('round-complete',{stage:220,runId:owner,score:150});
  const buy=await f.request('buy');
  const coach=await f.request('coach-buy');
  assert.deepEqual(calls,[['start',start.requestId,220],['complete',complete.requestId,owner,220,150],['buy',buy.requestId],['coach-buy',coach.requestId]]);
 }finally{f.close();}
});

test('duplicate purchases share one operation; parallel actions and conflicting UUID reuse cannot mutate twice',async()=>{
 let resolve,calls=0,spends=0;const f=fixture({onAmmoBuy:()=>{calls++;return new Promise(done=>{resolve=done;});},onAmmoSpend:async()=>{spends++;return snapshot();}});
 try{
  const id=randomUUID();await f.request('buy',{requestId:id});await f.request('buy',{requestId:id});
  assert.equal(calls,1);assert.equal(f.responses().length,0);
  await f.request('spend');assert.equal(f.responses().at(-1).result.reason,'busy');assert.equal(spends,0);
  await f.request('spend',{requestId:id});assert.equal(f.responses().at(-1).result.reason,'request_conflict');
  resolve(snapshot({remaining:30,coins:95,revision:2}));await tick();
  assert.equal(f.responses().filter(reply=>reply.requestId===id&&reply.result.ok).length,2);
  await f.request('buy',{requestId:id});assert.equal(calls,1,'successful replay uses the same receipt');
 }finally{f.close();}
});

test('unknown payment outcomes retry the same UUID, while receipt recovery performs no purchase or spend',async()=>{
 const receipts=new Map();let balance=100,buys=0,spends=0,lookups=0;
 const f=fixture({
  onAmmoBuy:async id=>{buys++;if(!receipts.has(id)){balance-=5;receipts.set(id,snapshot({coins:balance,remaining:30,revision:2}));throw Error('lost response after commit');}return receipts.get(id);},
  onAmmoSpend:async()=>{spends++;throw Error('unreachable in receipt recovery');},
  onAmmoReceipt:async(id,action)=>{lookups++;return snapshot({coins:balance,remaining:30,revision:2,found:receipts.has(id),receipt:receipts.has(id)?{action,request_id:id}:null});}
 });
 try{
  const id=randomUUID();await f.request('buy',{requestId:id});assert.equal(f.responses().at(-1).result.reason,'pending');assert.equal(balance,95);
  await f.request('buy',{requestId:id});assert.equal(buys,2);assert.equal(balance,95,'mock server idempotency prevents a second debit');
  const oldFrame=f.dialog.frame,oldNonce=oldFrame.sent[0].data.sessionId;f.close();const newFrame=f.open();const init=f.ready();
  assert.notEqual(init.sessionId,oldNonce);assert.equal(buys,2,'opening has no financial side effect');
  await f.request('receipt',{receiptId:id,originalAction:'buy'});assert.equal(lookups,1);assert.equal(f.responses().at(-1).result.found,true);assert.equal(buys,2);assert.equal(spends,0);
  await f.request('receipt',{receiptId:randomUUID(),originalAction:'spend'});assert.equal(lookups,2);assert.equal(f.responses().at(-1).result.found,false);assert.equal(spends,0,'missing receipt cannot create a deduction');
  await f.request('buy',{}, {frame:oldFrame});assert.equal(buys,2,'closed iframe cannot use its prior session');
  assert.equal(newFrame.src.startsWith('/games/forest-archer/'),true);
 }finally{f.close();}
});

test('a lost coach-rental reply retries its own receipt without a second debit or extending expiry',async()=>{
 const receipts=new Map(),expires='2026-11-03T12:00:00.000Z';let balance=100,buys=0,charges=0,ammoBuys=0;
 const f=fixture({
  onCoachBuy:async id=>{
   buys++;
   if(!receipts.has(id)){balance-=10;charges++;receipts.set(id,snapshot({coins:balance,revision:2,coach_active:true,coach_expires_at:expires}));throw Error('reply lost after rental committed');}
   return receipts.get(id);
  },
  onAmmoBuy:async()=>{ammoBuys++;return snapshot();},
  onAmmoReceipt:async(id,action)=>{
   assert.equal(action,'coach-buy');return snapshot({coins:balance,revision:2,coach_active:true,coach_expires_at:expires,found:receipts.has(id),receipt:receipts.get(id)||null});
  }
 });
 try{
  const id=randomUUID();await f.request('coach-buy',{requestId:id});
  assert.equal(f.responses().at(-1).result.reason,'pending');assert.equal(balance,90);assert.equal(charges,1);
  await f.request('coach-buy',{requestId:id});assert.equal(buys,2);assert.equal(charges,1);
  assert.equal(f.responses().at(-1).result.coach_expires_at,expires);
  await f.request('buy',{requestId:id});assert.equal(f.responses().at(-1).result.reason,'request_conflict');assert.equal(ammoBuys,0);
  const frame=f.dialog.frame;f.close();f.open();f.ready();
  await f.request('receipt',{receiptId:id,originalAction:'coach-buy'});
  assert.equal(f.responses().at(-1).result.coach_expires_at,expires);assert.equal(buys,2);assert.equal(balance,90);
  await f.request('coach-buy',{}, {frame});assert.equal(buys,2,'a closed game cannot rent through its previous session');
 }finally{f.close();}
});

test('a transport timeout stays pending and its original UUID can reconcile an already committed purchase',async()=>{
 let calls=0,charged=0,resolveOriginal;const receipts=new Map();
 const f=fixture({onAmmoBuy:id=>{
  calls++;if(!receipts.has(id)){charged++;receipts.set(id,snapshot({coins:95,remaining:30,revision:2}));return new Promise(resolve=>{resolveOriginal=resolve;});}
  return Promise.resolve(receipts.get(id));
 }},true);
 try{
  const id=randomUUID();await f.request('buy',{requestId:id});assert.equal(f.responses().length,0);
  f.expireRequests();await tick();assert.equal(f.responses().at(-1).result.reason,'pending');assert.equal(charged,1);
  await f.request('buy',{requestId:id});assert.equal(f.responses().at(-1).result.ok,true);assert.equal(calls,2);assert.equal(charged,1);
  const replies=f.responses().length;resolveOriginal(receipts.get(id));await tick();
  assert.equal(f.responses().length,replies,'the late timed-out transport cannot emit a second receipt');
 }finally{f.close();}
});

test('guest requests, late replies after close/account changes, and insufficient balance stay isolated',async()=>{
 let resolve,calls=0;const f=fixture({onAmmoBuy:()=>{calls++;return new Promise(done=>{resolve=done;});}});
 try{
  const oldFrame=f.dialog.frame;await f.request('buy');assert.equal(calls,1);f.close();
  const other='22222222-2222-4222-8222-222222222222';f.open({owner:other});f.ready();
  resolve(snapshot({coins:0}));await tick();assert.equal(f.responses(oldFrame).length,0);assert.equal(f.responses().length,0);
  f.close();f.open({owner:null});const guest=f.ready();assert.equal(guest.available,false);
  await f.request('buy');assert.equal(f.responses().at(-1).result.reason,'sign_in');assert.equal(calls,1);
  f.close();let funded=false;
  f.open({onAmmoBuy:async()=>funded?snapshot({coins:0,remaining:30}):{ok:false,reason:'coins',coins:0,pack_ammo:10,pack_price:5}});f.ready();
  const id=randomUUID();await f.request('buy',{requestId:id});assert.equal(f.responses().at(-1).result.reason,'coins');
  funded=true;await f.request('buy',{requestId:id});assert.equal(f.responses().at(-1).result.ok,true,'a definitive declined receipt is not cached as a purchase');
 }finally{f.close();}
});

test('the real archery launch branch routes record and coin exchange RPCs through the existing account-bound wallet wrapper',async()=>{
 const start=world.indexOf(' if(t==="archery"){'),end=world.indexOf('\n if(t==="saetbyeol")',start);
 assert.ok(start>=0&&end>start);const calls=[];let opened,version=0;
 const D={online:true,user:{id:owner}};
 const context=vm.createContext({D,Promise,M:()=>{},CustomEvent:class {constructor(type,values){this.type=type;this.detail=values?.detail;}},window:{dispatchEvent(){},OjjudaArcheryGame:{open:options=>{opened=options;}}},worldRewardRequest:()=>({owner:D.online?D.user?.id:null,version:++version}),vl:async(rpc,args,request)=>{calls.push({rpc,args:JSON.parse(JSON.stringify(args)),request});return snapshot();}});
 const launch=()=>vm.runInContext(`(function(t){${world.slice(start,end)}})('archery');`,context);
 launch();assert.equal(opened.owner,owner);assert.ok(!('client' in opened));
 assert.equal(opened.canAdminTrial,undefined);D.isAdmin=true;assert.equal(opened.canAdminTrial,undefined);D.isAdmin=false;assert.equal(opened.canAdminTrial,undefined);
 const requestId=randomUUID(),runId=randomUUID();
 await opened.onAmmoStatus();await opened.onRoundStart(requestId,7);await opened.onRoundComplete(requestId,runId,7,48);await opened.onAmmoSpend(requestId);await opened.onAmmoBuy(requestId);await opened.onCoachBuy(requestId);await opened.onAmmoReceipt(requestId,'coach-buy');await opened.onCoinExchange(requestId,5000);await opened.onCoinReceipt(requestId,5000);
 assert.deepEqual(calls.map(call=>[call.rpc,call.args]),[
  ['archery_single_action',{p_epoch:5,p_action:'status'}],['archery_single_action',{p_epoch:5,p_action:'round-start',p_request_id:requestId,p_stage:7}],['archery_single_action',{p_epoch:5,p_action:'round-complete',p_request_id:requestId,p_run_id:runId,p_stage:7,p_score:48}],['archery_single_action',{p_epoch:5,p_action:'spend',p_request_id:requestId}],['archery_single_action',{p_epoch:5,p_action:'buy',p_request_id:requestId}],['archery_single_action',{p_epoch:5,p_action:'coach-buy',p_request_id:requestId}],['archery_single_receipt',{p_epoch:5,p_request_id:requestId,p_action:'coach-buy'}],['archery_coin_exchange_v5',{p_epoch:5,p_request_id:requestId,p_zu:5000,p_action:'exchange'}],['archery_coin_exchange_v5',{p_epoch:5,p_request_id:requestId,p_zu:5000,p_action:'receipt'}]
 ]);
 assert.ok(calls.every(call=>call.request.owner===owner));assert.deepEqual(calls.map(call=>call.request.version),[1,2,3,4,5,6,7,8,9]);
 D.user={id:'another-owner'};assert.equal((await opened.onCoachBuy(randomUUID())).reason,'sign_in');assert.equal(calls.length,9);
 D.online=false;launch();assert.equal((await opened.onAmmoStatus()).reason,'sign_in');assert.equal(calls.length,9);
});

test('coin exchange bridge validates all packs, isolates receipts and ignores retired trial options',async()=>{
 const calls=[];const f=fixture({onCoinExchange:async(id,zu)=>{calls.push(['exchange',id,zu]);return {ok:true,coins:990,game_coins:zu*10};},onCoinReceipt:async(id,zu)=>{calls.push(['receipt',id,zu]);return {ok:true,found:false};}});
 try{
  assert.equal(f.ready().coinExchangeAvailable,true);
  for(const zu of [10,50,100,500,1000,5000])await f.request('coin-exchange',{zu});
  assert.deepEqual(calls.map(x=>x[2]),[10,50,100,500,1000,5000]);
  for(const fields of [{zu:1},{zu:10000},{zu:'10'},{zu:10,game_coins:999999},{zu:10,coins:0}])await f.request('coin-exchange',fields);
  assert.equal(calls.length,6);
  const id=randomUUID();await f.request('coin-receipt',{zu:50,receiptId:id});assert.deepEqual(calls.at(-1),['receipt',id,50]);
  const duplicate=await f.request('coin-exchange',{zu:10});await f.request('coin-exchange',{zu:50,requestId:duplicate.requestId});
  assert.equal(f.responses().at(-1).result.reason,'request_conflict');
  f.close();f.open({adminTrial:true,canAdminTrial:()=>true});assert.equal(f.ready().coinExchangeAvailable,true);assert.doesNotMatch(f.dialog.html,/아이템 체험|adminTrial=|data-archery-trial-toggle/);
  const before=calls.length;await f.request('coin-exchange',{zu:10});assert.equal(calls.length,before+1);
 }finally{f.close();}
});
