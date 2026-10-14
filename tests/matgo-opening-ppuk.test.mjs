import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as browser from '../games/matgo-engine.mjs';
import * as server from '../supabase/functions/matgo/engine.mjs';
import {dealSoloRound} from '../games/matgo-tazza.mjs';
import {verifyRound} from '../supabase/functions/matgo/verify.mjs';
import {setupOpening,playRound} from './matgo-opening-fixture.mjs';
import {replayOnline,advanceOnline,automaticOnline} from '../supabase/functions/matgo/online.mjs';
const conserved=g=>{const cards=[...g.hand.flat(),...g.caps.flat(),...g.floor.flat(),...g.deck];assert.equal(cards.length,50);assert.equal(new Set(cards.map(c=>c.id)).size,50);};
let cases=0;
for(const E of [browser,server])for(const p of [0,1])for(const route of ['hand','flip'])for(const opponent of [[],[6],[6,7],[41],[49]])for(const sweep of [false,true]){
  const events=[],g=new E.Game({event:async(type,data)=>events.push({type,...data}),choose:async(_p,ids)=>ids[0]});
  const {stack,card}=setupOpening(g,E,{p,route,opponent,sweep});
  assert.equal(stack.ppuk,true);assert.equal(stack.ppukOwner,null);
  assert.deepEqual(g.ppukCount,[0,0]);assert.deepEqual(g.firstPpukGold,[0,0]);
  await g.play(p,card);conserved(g);
  const claim=events.find(e=>e.type==='ppukget');assert.equal(claim.count,1);assert.equal(claim.self,false);assert.equal(claim.opening,true);
  assert.equal(events.some(e=>e.type==='sweep'),sweep);
  const steals=events.filter(e=>e.type==='steal').map(e=>e.card.id);
  assert.deepEqual(steals,opponent.length?(opponent[0]===6?opponent.slice(0,sweep?2:1):opponent):[]);
  assert.deepEqual(g.ppukCount,[0,0]);assert.deepEqual(g.firstPpukGold,[0,0]);
  assert.ok(!events.some(e=>e.type==='ppuk'||e.special==='three_ppuk'));cases++;
}
// Two opening triples plus a sweep are additive, with no fictitious self owner.
{
  const E=browser,events=[],g=new E.Game({event:async(type,data)=>events.push({type,...data})});
  for(let seed=1;seed<2000;seed++){g.random=E.seededRandom(seed);g.deal();if(g.floor.filter(st=>st.length===3).length===2)break;}
  const stacks=g.floor.filter(st=>st.length===3);assert.equal(stacks.length,2);
  const pool=new Map([...g.hand.flat(),...g.caps.flat(),...g.deck,...g.floor.filter(st=>!stacks.includes(st)).flat()].map(c=>[c.id,c]));
  const take=pred=>{const c=[...pool.values()].find(pred);assert.ok(c);pool.delete(c.id);return c;};
  const hand=take(c=>c.m===stacks[0][0].m),flip=take(c=>c.m===stacks[1][0].m);
  g.floor=stacks;g.hand=[[hand],[]];g.caps=[[],Array.from({length:3},()=>take(c=>c.k==='pi'))];g.deck=[flip,...pool.values()];g.turn=0;g.endTurn=async()=>{};
  await g.play(0,hand);conserved(g);assert.equal(events.filter(e=>e.type==='ppukget').length,2);assert.equal(events.filter(e=>e.type==='steal').length,3);assert.equal(g.floor.length,0);cases++;
}
// Fingerprints were recorded from the deployed v11 code before this fix.
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
for(const row of JSON.parse(fs.readFileSync(new URL('./matgo-opening-legacy-fixtures.json',import.meta.url)))){
  const {g,events}=await playRound(browser,dealSoloRound,row.round);
  assert.equal(hash(g.actions),row.actions);assert.equal(hash(events),row.events);assert.deepEqual(g.bank,row.bank);
  assert.equal((await verifyRound(row.round,g.actions)).gold,g.bank[0]);
  const fresh=await playRound(browser,dealSoloRound,{...row.round,rules_version:12});
  assert.equal((await verifyRound({...row.round,rules_version:12},fresh.g.actions)).gold,fresh.g.bank[0]);cases++;
}
// Online rules are server-pinned; old v8 actions still use their original deal.
let room={status:'active',seed:'11'.repeat(32),start_gold:[5000,5000],first:0,carry:1,actions:[]};
const first=await automaticOnline(room);assert.equal(first.actions[0].rules_version,9);
for(const version of [8,9]){
  const actions=structuredClone(first.actions);actions[0].rules_version=version;let saved={...room,actions};
  assert.equal((await replayOnline(saved)).game.openingPpuk,version===9);
  for(let n=0;n<150;n++){const s=await replayOnline(saved);if(s.game.over)break;saved={...saved,...await automaticOnline(saved)};}
  assert.equal((await replayOnline(saved)).game.over,true);assert.equal(saved.actions[0].rules_version,version);cases++;
}
console.log(`PASS: ${cases} opening triple cases, both engines/seats/routes, zero/single/double/triple pi, combined sweeps, 20 unchanged v11 fingerprints, v12 replay and online v8/v9 pinning`);
