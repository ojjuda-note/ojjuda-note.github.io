import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCoinExchangeClient,COIN_PACKS} from '../games/forest-archer/coin-exchange.mjs';
const owner=randomUUID(),sessionId=randomUUID(),origin='https://fixture.test';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({store=new Map(),credit=()=>true,reply,timeout=40}={}){
 const callbacks=new Set(),sent=[],storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const parent={postMessage:message=>{sent.push(message);if(reply)queueMicrotask(()=>respond(message,reply(message)));}};
 const host={location:{origin},parent,crypto:{randomUUID},addEventListener:(t,f)=>callbacks.add(f),removeEventListener:(t,f)=>callbacks.delete(f)};
 const client=createCoinExchangeClient({host,storage,timeout,onCredit:credit});
 function emit(data,overrides={}){for(const callback of callbacks)callback({source:parent,origin,data,...overrides});}
 function init(fields={}){emit({source:'ojjuda-archery-world',type:'init',launchEpoch:4,owner,sessionId,coinExchangeAvailable:true,...fields});}
 function respond(message,result,fields={}){emit({source:'ojjuda-archery-world',type:'ammo-response',owner,sessionId,requestId:message.requestId,action:message.action,result,...fields});}
 return {client,sent,store,storage,init,respond,emit};
}
const receipt=message=>({ok:true,owner,request_id:message.receiptId||message.requestId,zu:message.zu,game_coins:message.zu*10,coins:10000-message.zu});
test('six packs, double clicks, forged replies and account changes cannot create extra charges or credits',async()=>{
 let credits=0;const f=fixture({credit:r=>{credits+=r.game_coins;return true;},timeout:1000});
 try{
  assert.deepEqual(COIN_PACKS,[10,50,100,500,1000,5000]);assert.equal((await f.client.exchange(10)).reason,'sign_in');f.init();
  assert.equal((await f.client.exchange(11)).reason,'invalid');
  const promise=f.client.exchange(5000);assert.equal((await f.client.exchange(5000)).reason,'busy');assert.equal(f.sent.length,1);
  const message=f.sent[0];f.respond(message,receipt(message),{owner:randomUUID()});assert.equal(credits,0);
  f.respond(message,{...receipt(message),zu:10});assert.equal((await promise).reason,'pending');assert.equal(credits,0);
  const retry=f.client.retry();f.respond(f.sent.at(-1),receipt(message));assert.equal((await retry).ok,true);assert.equal(credits,50000);
  assert.equal(f.sent.at(-1).requestId,message.requestId);assert.equal(f.store.size,0);
  const second=f.client.exchange(10);const late=f.sent.at(-1);f.init({owner:randomUUID(),sessionId:randomUUID()});f.respond(late,receipt(late));
  assert.equal((await second).reason,'unavailable');assert.equal(credits,50000);
  f.init({adminTrial:true});assert.equal(f.client.available,false);
 }finally{f.client.dispose();}
});
test('lost replies recover on reload by receipt lookup without another purchase and saved credit is applied once',async()=>{
 const store=new Map(),applied=new Set();let coins=0,committed;
 const credit=r=>{if(!applied.has(r.request_id)){coins+=r.game_coins;applied.add(r.request_id);}return true;};
 const first=fixture({store,credit});first.init();const promise=first.client.exchange(50);committed=receipt(first.sent[0]);assert.equal((await promise).reason,'pending');first.client.dispose();
 const next=fixture({store,credit,reply:m=>({ok:true,coins:committed.coins,found:true,receipt:committed})});next.init();await flush();
 assert.deepEqual(next.sent.map(m=>m.action),['coin-receipt']);assert.equal(coins,500);assert.equal(store.size,0);next.client.dispose();
});
test('saving must succeed before a debit request and before a fulfilled receipt is removed',async()=>{
 const f=fixture({credit:()=>false,reply:m=>receipt(m)});f.init();
 try{
  const set=f.storage.setItem;f.storage.setItem=()=>{throw Error('full');};assert.equal((await f.client.exchange(10)).reason,'storage');assert.equal(f.sent.length,0);
  f.storage.setItem=set;assert.equal((await f.client.exchange(100)).reason,'storage');assert.ok(f.client.pending);assert.equal(f.store.size,1);
 }finally{f.client.dispose();}
 let credited=0;const recovered=fixture({store:f.store,credit:r=>{credited+=r.game_coins;return true;},reply:m=>({ok:true,coins:9000,receipt:receipt(m)})});recovered.init();await flush();assert.equal(credited,1000);assert.equal(f.store.size,0);recovered.client.dispose();
});


test('signed-in old shells request a connection update instead of being mistaken for signed-out users',()=>{
 const f=fixture();
 try{
  f.init({coinExchangeAvailable:false});assert.equal(f.client.available,false);assert.equal(f.client.connection,'update');
  f.init({owner:null,coinExchangeAvailable:false});assert.equal(f.client.connection,'guest');
  f.init({adminTrial:true});assert.equal(f.client.connection,'trial');
  f.init();assert.equal(f.client.available,true);assert.equal(f.client.connection,'ready');
  assert.equal(f.sent.length,0,'reconnecting must never automatically buy a coin pack');
 }finally{f.client.dispose();}
});
