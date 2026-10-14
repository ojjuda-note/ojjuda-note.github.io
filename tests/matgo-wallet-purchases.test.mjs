import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createWallet} from '../games/matgo-wallet.mjs';
const dom=new JSDOM('<html><body></body></html>',{url:'https://ojjuda.kr/games/matgo.html'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location});
let balance=20,fail=false,requests=[],receipts=new Map(),round=null;
const access={check:async()=>{},getClient:()=>({functions:{invoke:async(_, {body})=>{
  requests.push(structuredClone(body));
  if(body.action==='status')return{data:{ok:true,coins:balance,gold:5000,round}};
  if(body.action==='settle')return{data:{ok:true,coins:balance,gold:5000,round:null}};
  if(body.action==='start')return{data:{ok:true,coins:balance,gold:5000,round}};
  if(!receipts.has(body.request_id)){
    const price=body.action==='vent'?1:5;if(balance<price)return{data:{error:'insufficient_zzu'}};
    balance-=price;
    if(body.action==='tazza_start')round={id:crypto.randomUUID(),seed:1,gold:5000,first:0,carry:1,tazza_mode:'gwang'};
    receipts.set(body.request_id,{ok:true,coins:balance,gold:5000,round,purchase:{effect:body.effect??'gwang',price}});
  }
  if(fail){fail=false;return{error:{context:{json:async()=>({error:'unavailable'})}}};}
  return{data:receipts.get(body.request_id)};
}}})};
try{
  const wallet=createWallet(access,{stakes:true});
  fail=true;await assert.rejects(wallet.start({tazza:true}));assert.equal(balance,15);
  const paid=await wallet.start({tazza:true});assert.equal(paid.coins,15);assert.equal(paid.round.tazza_mode,'gwang');
  const buys=requests.filter(r=>r.action==='tazza_start');assert.equal(buys[0].request_id,buys[1].request_id);
  assert.ok(buys.every(r=>r.rules_version===13),'paid starts use the same new AI protocol as settlement');
  fail=true;await assert.rejects(wallet.vent(round.id,'gun'));assert.equal(balance,14);
  const [a,b]=await Promise.all([wallet.vent(round.id,'hammer'),wallet.vent(round.id,'hammer')]);
  assert.equal(a.purchase.effect,'gun');assert.equal(a,b);assert.equal(balance,14);
  const vents=requests.filter(r=>r.action==='vent');assert.equal(vents.length,2);assert.equal(vents[0].request_id,vents[1].request_id);
  await wallet.vent(round.id,'hammer');assert.equal(balance,13);
  balance=0;await assert.rejects(wallet.vent(round.id,'bomb'),/화풀이는 1쭈/);
  balance=1;await wallet.vent(round.id,'bomb');assert.equal(balance,0,'known decline does not reuse an old receipt');
  for(const version of [10,11,12,13]){round={id:crypto.randomUUID(),rules_version:version,cpu_level:version>=11?1:null};await wallet.status();await wallet.settle(round.id,[]);assert.equal(requests.at(-1).rules_version,version,'settlement uses the server-pinned version');}
  console.log('PASS: wallet keeps uncertain purchase IDs and effects, coalesces double clicks, charges once, and reports per-action prices');
}finally{dom.window.close();for(const key of ['window','document','location'])delete globalThis[key];}
