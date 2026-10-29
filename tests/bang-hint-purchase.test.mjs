import test from 'node:test';
import assert from 'node:assert/strict';
import {createHintPurchase} from '../games/bang/hint-purchase.js';

const room={id:'room',version:7};
function setup(){
 const data=new Map(),calls=[];
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const receipt=b=>({ok:true,kind:'bang_hint',price:1,request_id:b.request_id,room_id:b.room_id,version:b.version,coins:2});
 let reply=async b=>receipt(b),serial=0;
 const make=()=>createHintPurchase({storage:()=>storage,uuid:()=>String(++serial),request:async b=>{calls.push(b);return reply(b);}});
 return {make,calls,data,storage,receipt,setReply:fn=>reply=fn};
}
test('rapid clicks share one purchase, and a consumed recommendation cannot be reused after reload',async()=>{
 const f=setup(),p=f.make();let resolve;f.setReply(b=>new Promise(r=>{resolve=()=>r(f.receipt(b));}));
 const a=p.buy('user',room),b=p.buy('user',room);assert.equal(f.calls.length,1);resolve();
 const [one,two]=await Promise.all([a,b]);assert.equal(one.record.id,two.record.id);
 assert.equal(p.consume('user',one.record.id),true);assert.equal(p.consume('user',one.record.id),false);
 assert.equal(f.make().read('user'),null);assert.equal(f.make().read('another'),null);
});
test('lost responses retain the request across reload and recover exactly one credit',async()=>{
 const f=setup();f.setReply(()=>{throw Error('connection lost after debit');});
 assert.equal((await f.make().buy('user',room)).reason,'pending');
 f.setReply(async b=>f.receipt(b));const p=f.make(),result=await p.buy('user',{id:'next-room',version:9});
 assert.equal(result.ok,true);assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0],f.calls[1]);
 assert.equal(f.make().read('user').status,'ready');
 await p.buy('user',room);assert.equal(f.calls.length,2,'unused credit is not charged again');
});
test('storage failure never initiates a charge; declined purchases do not create credits',async()=>{
 const f=setup();f.storage.setItem=()=>{throw Error('blocked');};
 assert.equal((await f.make().buy('user',room)).reason,'storage');assert.equal(f.calls.length,0);
 const g=setup();g.setReply(async()=>({ok:false,reason:'coins',coins:0}));const p=g.make();
 assert.equal((await p.buy('user',room)).reason,'coins');assert.equal(p.read('user'),null);assert.equal(p.consume('user','1'),false);
});
test('mismatched receipts and storage failure after success remain recoverable, never free credits',async()=>{
 const f=setup();f.setReply(async b=>({...f.receipt(b),room_id:'other'}));
 const p=f.make();assert.equal((await p.buy('user',room)).reason,'pending');assert.equal(p.read('user').status,'pending');
 const original=f.storage.setItem;f.setReply(async b=>{f.storage.setItem=()=>{throw Error('full');};return f.receipt(b);});
 assert.equal((await p.buy('user',room)).reason,'pending');f.storage.setItem=original;f.setReply(async b=>f.receipt(b));
 assert.equal((await p.buy('user',room)).ok,true);assert.equal(new Set(f.calls.map(b=>b.request_id)).size,1);
});
