import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as engine from '../games/matgo-engine.mjs';
import * as legacyEngine from '../supabase/functions/matgo/engine-v9.mjs';
import {dealSoloRound,selectTazzaSeed,openingValue,createTazzaQueue,TAZZA_MODES,isTazzaCard} from '../games/matgo-tazza.mjs';
import {verifyRound} from '../supabase/functions/matgo/verify.mjs';
import {verifyRound as verifyV8} from '../supabase/functions/matgo/verify-v8.mjs';
import {createHandler} from '../supabase/functions/matgo/handler.mjs';
import {advanceOnline} from '../supabase/functions/matgo/online.mjs';
const {Game,seededRandom,aiChooseCard,aiChoose,aiGoStop,aiChooseGukjin}=engine;
assert.equal(fs.readFileSync(new URL('../games/matgo-tazza.mjs',import.meta.url),'utf8'),fs.readFileSync(new URL('../supabase/functions/matgo/tazza.mjs',import.meta.url),'utf8'));
const queue=createTazzaQueue();
assert.equal(queue.queued,false);queue.toggle();assert.equal(queue.begin(),true);
queue.toggle();assert.equal(queue.queued,true,'cannot change the reserved choice during a start request');
queue.finish(false);assert.equal(queue.queued,true,'failed starts preserve the choice');
assert.equal(queue.begin(),true);queue.finish(true);assert.equal(queue.begin(),false,'only one successful round consumes it');queue.finish(false);
queue.toggle();queue.toggle();assert.equal(queue.begin(),false,'click again to cancel');queue.finish(false);

function conservation(g){const cards=[...g.hand.flat(),...g.floor.flat(),...g.caps.flat(),...g.deck];assert.equal(cards.length,50);assert.equal(new Set(cards.map(c=>c.id)).size,50);}
async function play(round,engineImpl=engine){
  const {Game,seededRandom,aiChooseCard,aiChoose,aiGoStop,aiChooseGukjin}=engineImpl;
  let g;
  g=new Game({event:async()=>{},choose:async(p,ids)=>aiChoose(g,p,ids),chooseGukjin:async p=>aiChooseGukjin(g,p),goStop:async(p,n)=>aiGoStop(g,p,n)});
  g.bank=[round.gold,5000];g.rate=round.rate;g.first=round.first;g.carry=round.carry;
  dealSoloRound(g,round,engineImpl);const initial=structuredClone(g.hand);
  for(let turns=0;!g.over;turns++){
    assert.ok(turns<150);conservation(g);
    const pending=g.pendingChongtong();if(pending){await g.declareChongtong(pending.p,pending.p===1?'win':'continue');continue;}
    const p=g.turn,rng=g.random;if(p===0)g.random=()=>.25;const card=aiChooseCard(g,p);g.random=rng;
    const same=card?g.hand[p].filter(c=>c.m===card.m):[],matches=card?g.matches(card.m):[];
    const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
    if(same.length>=3&&!bomb&&!g.shake[p])g.shakeCards(p,card.m);
    await g.play(p,card,bomb);
  }
  conservation(g);return {g,initial};
}
let better=0,regularMatches=0,tazzaMatches=0,last,lastRound;
for(let seed=1;seed<=160;seed++){
  const round={seed,gold:seed%3?5000:900001,rate:seed%3?100:2000,first:seed%2,carry:seed%4===0?2:1};
  const make=assisted=>{const g=new Game({});g.bank=[round.gold,5000];g.first=round.first;g.carry=round.carry;dealSoloRound(g,{...round,tazza_mode:assisted?'tan':null},engine);return g;};
  const normal=make(false),favored=make(true);
  assert.equal(selectTazzaSeed(round,engine),selectTazzaSeed({...round},engine));
  conservation(normal);conservation(favored);assert.equal(favored.pendingChongtong(),null);
  const advantage=g=>openingValue(g,0)-openingValue(g,1)*.45;
  if(normal.pendingChongtong()===null)assert.ok(advantage(favored)>=advantage(normal));
  if(advantage(favored)>advantage(normal))better++;
  const matches=g=>new Set(g.floor.flat().filter(c=>g.hand[0].some(h=>h.m===c.m)).map(c=>c.m)).size;
  regularMatches+=matches(normal);tazzaMatches+=matches(favored);
  for(const assisted of [false,true]){
    const paidRound={...round,tazza_mode:assisted?'tan':null};
    const {g}=await play(paidRound);
    const verified=await verifyRound(paidRound,g.actions);assert.equal(verified.gold,g.bank[0]);assert.equal(verified.first,g.first);assert.equal(verified.carry,g.carry);
    if(!assisted){const {g:old}=await play(round,legacyEngine);assert.equal((await verifyV8(round,old.actions)).gold,old.bank[0]);}
    else{last=g;lastRound=paidRound;await assert.rejects(verifyV8(round,g.actions));}
  }
}
assert.ok(better>=140);assert.ok(tazzaMatches>regularMatches*1.25,'actually provides more matching opening months');
for (const mode of Object.keys(TAZZA_MODES)) {
  for (let seed=1;seed<=30;seed++) {
    const round={seed,gold:seed%3?5000:900001,rate:100,first:seed%2,carry:1,tazza_mode:mode};
    const {g,initial}=await play(round);
    assert.equal((await verifyRound(round,g.actions)).gold,g.bank[0]);
    if(!['tan','peek'].includes(mode)) {
      const all=[...g.hand.flat(),...g.floor.flat(),...g.caps.flat(),...g.deck];
      const wanted=all.filter(c=>isTazzaCard(c,mode));
      assert.ok(wanted.length>=3);
      assert.ok(wanted.every(c=>initial[0].some(h=>h.id===c.id)),mode+' targets in own starting hand');
    }
  }
}
await assert.rejects(verifyRound({...lastRound,tazza_mode:null},last.actions),'unpaid mode is rejected');
await assert.rejects(verifyRound({...lastRound,tazza_mode:'peek'},last.actions),'different paid mode is rejected');
await assert.rejects(verifyRound(lastRound,last.actions.slice(1)),'paid mode cannot be omitted');
for(const marker of [{type:'tazza',p:1},{type:'tazza',p:0,seed:123}])await assert.rejects(verifyRound(lastRound,[marker,...last.actions.slice(1)]));
await assert.rejects(verifyRound(lastRound,[...last.actions.slice(0,2),{type:'tazza',p:0},...last.actions.slice(2)]));
await assert.rejects(verifyRound(lastRound,last.actions.slice(0,-1)));
const forged=structuredClone(last.actions);forged.find(a=>a.type==='play').card=999;await assert.rejects(verifyRound(lastRound,forged));
await assert.rejects(advanceOnline({status:'active',seed:'ab'.repeat(32),actions:[],start_gold:[5000,5000],first:0,carry:1},0,{type:'tazza'}));

const actor='00000000-0000-4000-8000-000000000001',roundId='00000000-0000-4000-9000-000000000001';let settled;
const handler=createHandler({env:n=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only'})[n],fetchImpl:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:actor});
  const body=JSON.parse(options.body);if(body.p_action==='round')return Response.json({round:lastRound});
  settled=body.p_gold;return Response.json({ok:true,gold:settled});
}});
const request=version=>handler(new Request('https://edge.invalid',{method:'POST',headers:{authorization:'Bearer user',origin:'https://ojjuda.kr'},body:JSON.stringify({action:'settle',round_id:roundId,rules_version:version,actions:last.actions})}));
assert.equal((await request(10)).status,200);assert.equal(settled,last.bank[0]);assert.equal((await request(8)).status,409);
const {g:oldPaid}=await play(lastRound,legacyEngine);last=oldPaid;
assert.equal((await request(9)).status,200);assert.equal(settled,oldPaid.bank[0]);
console.log(`PASS: one-round queue, 560 verified full rounds across 8 paid modes, 50-card conservation, v8 compatibility, forged modes/moves rejected, online excluded; matching opening months ${(regularMatches/160).toFixed(2)} → ${(tazzaMatches/160).toFixed(2)}`);
