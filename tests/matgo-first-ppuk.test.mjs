import assert from 'node:assert/strict';
import {CARDS,Game,seededRandom,aiChooseCard,aiChoose,aiGoStop} from '../games/matgo-engine.mjs';
import {verifyRound} from '../supabase/functions/matgo/verify.mjs';

function fixture(p=0,{hand=[1,3,16],flips=[2],other=[5,7,20]}={}){
  const events=[],g=new Game({event:async(type,data)=>events.push({type,...data,bank:[...g.bank]}),choose:async(_p,ids)=>ids[0],goStop:async()=> 'stop'});
  g.deal();g.turn=p;g.first=p;g.endTurn=async()=>{};
  const pool=new Map(CARDS.map(c=>[c.id,{...c}]));const take=id=>{const c=pool.get(id);assert.ok(c);pool.delete(id);return c;};
  g.hand=[[],[]];g.hand[p]=hand.map(take);g.hand[1-p]=other.map(take);
  g.floor=[0,4,8].map(id=>[take(id)]);g.caps=[[],[]];g.deck=flips.map(take).concat([...pool.values()]);
  return{g,events};
}
let cases=0;
for(const p of [0,1]){
  const {g,events}=fixture(p);await g.play(p,g.hand[p][0]);
  assert.equal(events.find(e=>e.type==='ppuk').firstPpuk,true);
  assert.deepEqual(events.find(e=>e.type==='ppuk').bank,[5000,5000],'event never pays during play');
  assert.equal(g.firstPpukGold[p],300);assert.equal(g.firstPpukGold[1-p],-300);
  assert.deepEqual(g.bank,[5000,5000],'leaving now cannot receive the pending reward');
  await g.finish(-1);
  assert.equal(g.bank[p],5300);assert.equal(g.bank[1-p],4700,'draw is also a completed round');
  await g.finish(-1);assert.equal(g.bank[p],5300,'finish cannot pay twice');
  g.deal();assert.deepEqual(g.firstPpukGold,[0,0]);assert.deepEqual(g.normalPlays,[0,0]);cases++;
}
for(const p of [0,1]){
  const {g,events}=fixture(p,{hand:[16,1,3],flips:[24,2]});
  await g.play(p,g.hand[p][0]);await g.play(p,g.hand[p][0]);
  assert.equal(g.ppukCount[p],1);assert.equal(events.find(e=>e.type==='ppuk').firstPpuk,false);
  await g.finish(-1);assert.deepEqual(g.bank,[5000,5000],'a later first ppuk is not the opening-turn reward');cases++;
}
{
  const {g,events}=fixture(0,{hand:[48,1,3],flips:[16,2]});
  await g.play(0,g.hand[0][0]);assert.equal(g.normalPlays[0],0);
  await g.play(0,g.hand[0].find(c=>c.id===1));assert.equal(events.find(e=>e.type==='ppuk').firstPpuk,true);
  assert.equal(g.firstPpukGold[0],300);assert.deepEqual(g.bank,[5000,5000]);cases++;
}
{
  const {g}=fixture(0,{flips:[48,49,2]});await g.play(0,g.hand[0][0]);
  assert.equal(g.floor.find(s=>s.ppuk).filter(c=>c.k==='bonus').length,2);
  assert.equal(g.firstPpukGold[0],300,'tied bonuses do not multiply the opening reward');cases++;
}
{
  const {g,events}=fixture(0,{flips:[2,6]});await g.play(0,g.hand[0][0]);
  g.turn=1;await g.play(1,g.hand[1][0]);assert.equal(events.filter(e=>e.firstPpuk).length,2);
  assert.deepEqual(g.firstPpukGold,[0,0]);await g.finish(-1);assert.deepEqual(g.bank,[5000,5000]);cases++;
}
{
  const {g}=fixture(1);g.bank[0]=100;await g.play(1,g.hand[1][0]);
  assert.equal(g.bank[0],100,'pending penalty cannot clamp the starting wallet early');
  await g.finish(0,'three_ppuk');assert.equal(g.bank[0],500,'100 + 700 - 300 is settled in one sum');cases++;
}
{
  const {g,events}=fixture(0);g.go[1]=1;await g.play(0,g.hand[0][0]);await g.finish(0,'three_ppuk');
  assert.equal(g.bank[0],6700,'7 points × gobak 2 + flat 300 gold');
  const result=events.find(e=>e.type==='end');assert.equal(result.total,14);assert.equal(result.goldDelta[0],1700);cases++;
}
{
  const {g}=fixture(1);g.bank[0]=100;await g.play(1,g.hand[1][0]);await g.finish(-1);assert.equal(g.bank[0],0);cases++;
}

// Use legal complete games and a valid first-ppuk prefix to exercise authoritative settlement.
let partial,complete,round;
for(let seed=1;seed<=30;seed++){
  let g;round={seed,gold:5000,first:0,carry:1};
  g=new Game({event:async()=>{},choose:async(p,ids)=>aiChoose(g,p,ids),goStop:async(p,s)=>p===1?aiGoStop(g,p,s):'stop'});g.random=seededRandom(seed);g.deal();
  let prefix;
  while(!g.over){
    const pending=g.pendingChongtong();if(pending){await g.declareChongtong(pending.p,pending.p===1?'win':'continue');continue;}
    const p=g.turn,card=p===1?aiChooseCard(g,p):g.hand[p][0]||null,same=card?g.hand[p].filter(c=>c.m===card.m):[],matches=card?g.matches(card.m):[];
    const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
    if(same.length>=3&&!bomb&&!g.shake[p])g.shakeCards(p,card.m);
    await g.play(p,card,bomb);
    if(!g.over){assert.deepEqual(g.bank,[5000,5000]);if(!prefix&&g.firstPpukGold[0])prefix=structuredClone(g.actions);}
  }
  if(prefix){partial=prefix;complete=structuredClone(g.actions);assert.equal((await verifyRound(round,complete)).gold,g.bank[0]);break;}
}
assert.ok(partial,'a real opening ppuk was exercised');
await assert.rejects(verifyRound(round,partial),/unfinished_round/,'abandoned rounds are rejected');
const {createHandler}=await import('../supabase/functions/matgo/handler.mjs');
let mutations=0,settled=false,storedGold=5000;
const handler=createHandler({env:k=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'server',SUPABASE_ANON_KEY:'public'})[k],fetchImpl:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001'}));
  const body=JSON.parse(options.body);
  if(body.p_action==='round')return new Response(JSON.stringify({ok:true,round,settled,gold:storedGold}));
  assert.equal(body.p_action,'settle');mutations++;storedGold=body.p_gold;settled=true;return new Response(JSON.stringify({ok:true,gold:storedGold}));
}});
const request=(actions,version=7)=>handler(new Request('https://edge.invalid',{method:'POST',headers:{authorization:'Bearer test',origin:'https://ojjuda.kr'},body:JSON.stringify({action:'settle',round_id:'00000000-0000-4000-9000-000000000001',rules_version:version,actions,first_ppuk_gold:999999})}));
assert.equal((await request(partial)).status,409);assert.equal(mutations,0);assert.equal(storedGold,5000);
assert.equal((await request(complete)).status,200);assert.equal(mutations,1);
assert.equal((await request(complete)).status,200);assert.equal(mutations,1,'duplicate final request cannot pay again');
assert.equal(storedGold,(await verifyRound(round,complete)).gold,'the client cannot choose a reward amount');
const {verifyRound:verifyV2Round}=await import('../supabase/functions/matgo/verify-v2.mjs');
const legacy=await import('../supabase/functions/matgo/engine-v2.mjs');
let oldGame;
oldGame=new legacy.Game({event:async()=>{},choose:async(p,ids)=>legacy.aiChoose(oldGame,p,ids),goStop:async(p,s)=>p===1?legacy.aiGoStop(oldGame,p,s):'stop'});
oldGame.random=legacy.seededRandom(round.seed);oldGame.deal();
while(!oldGame.over){
  const pending=oldGame.pendingChongtong();if(pending){await oldGame.declareChongtong(pending.p,'win');continue;}
  const p=oldGame.turn,card=p===1?legacy.aiChooseCard(oldGame,p):oldGame.hand[p][0]||null;
  await oldGame.play(p,card);
}
settled=false;mutations=0;
assert.equal((await request(oldGame.actions,2)).status,200);assert.equal(mutations,1);
assert.equal(storedGold,(await verifyV2Round(round,oldGame.actions)).gold,'older open pages keep their original settlement rules');
console.log(`PASS: ${cases} opening-ppuk cases, deferred-only gold, flat reward, aggregate/clamped settlement, abandoned round denial and single final server payment`);
