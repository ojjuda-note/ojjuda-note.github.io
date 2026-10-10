import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CARDS,Game,seededRandom,aiChooseCard,aiChoose,aiGoStop,aiChooseGukjin,cpuLevelForGold,MAX_CPU_LEVEL} from '../games/matgo-engine.mjs';
import {aiChooseCard as oldChooseCard,aiChoose as oldChoose} from '../supabase/functions/matgo/engine-v4.mjs';
import * as current from '../games/matgo-engine.mjs';
import * as previous from '../supabase/functions/matgo/engine-v5.mjs';
import {verifyRound} from '../supabase/functions/matgo/verify.mjs';
import {createHandler} from '../supabase/functions/matgo/handler.mjs';
import {replayOnline,automaticOnline} from '../supabase/functions/matgo/online.mjs';

assert.equal(fs.readFileSync(new URL('../games/matgo-engine.mjs',import.meta.url),'utf8'),fs.readFileSync(new URL('../supabase/functions/matgo/engine.mjs',import.meta.url),'utf8'));
assert.equal(cpuLevelForGold(5000),1);
for(let n=1;n<10;n++){
  assert.equal(cpuLevelForGold(n*100000-1),n);
  assert.equal(cpuLevelForGold(n*100000),n);
  assert.equal(cpuLevelForGold(n*100000+1),n+1);
}
assert.equal(cpuLevelForGold(10000000),10);assert.equal(MAX_CPU_LEVEL,10);

const fixture=(gold,seed=23)=>{
  const game=new Game({event:async()=>{}});game.bank=[gold,5000];game.random=seededRandom(seed);game.deal();return game;
};
const low=fixture(100000),high=fixture(100001);
assert.equal(low.cpuLevel,1);assert.equal(high.cpuLevel,2);
for(const part of ['hand','floor','deck','caps'])assert.deepEqual(low[part],high[part],'gold never changes the shuffle or initial cards');
high.bank[0]=99999;assert.equal(high.cpuLevel,2,'tier is fixed for the current round');high.deal();assert.equal(high.cpuLevel,1,'the next round uses the new balance');

// Below the threshold, the old decisions and random-number consumption stay exact.
for(let seed=1;seed<=80;seed++){
  const game=fixture(100000,seed);game.random=seededRandom(seed+1000);const old=oldChooseCard(game,1);
  game.random=seededRandom(seed+1000);assert.equal(aiChooseCard(game,1)?.id,old?.id);
  const indices=game.floor.map((_,i)=>i);assert.equal(aiChoose(game,1,indices),oldChoose(game,1,indices));
}

// Higher tiers recognize a complete set rather than merely a high-value card.
const choice=fixture(900001);choice.caps=[[],[CARDS[5],CARDS[9]]];choice.floor=[[CARDS[0]],[CARDS[1]]];
assert.equal(aiChoose(choice,1,[0,1]),1,'complete hongdan with the ribbon');
choice.cpuLevel=1;assert.equal(aiChoose(choice,1,[0,1]),0,'normal policy remains unchanged');
choice.cpuLevel=10;choice.hand[1]=[CARDS[0],CARDS[13]];choice.floor=[[CARDS[2]],[CARDS[14]]];choice.caps=[[],[CARDS[17],CARDS[25]]];choice.random=()=>0;
assert.equal(aiChooseCard(choice,1).id,13,'collect the third chodan card');
// Accessing even one hidden card/next-deck entry makes the test fail.
const countOnly=n=>new Proxy({length:n},{get(target,key){if(key==='length')return target.length;throw Error('hidden information read: '+String(key));}});
choice.hand[0]=countOnly(8);choice.deck=countOnly(20);
assert.equal(aiChooseCard(choice,1).id,13);

async function play(seed,gold,cpuMode='adaptive',engine=current){
  const {Game,seededRandom,aiChooseCard,aiChoose,aiGoStop,aiChooseGukjin}=engine;
  let game,winner=-1;
  game=new Game({event:async(type,data)=>{if(type==='end')winner=data.winner;},choose:async(p,ids)=>aiChoose(game,p,ids),chooseGukjin:async p=>aiChooseGukjin(game,p),goStop:async(p,points)=>aiGoStop(game,p,points)});
  game.cpuMode=cpuMode;game.random=seededRandom(seed);game.bank=[gold,5000];game.first=seed%2;game.deal();
  let turns=0;
  while(!game.over){
    assert.ok(++turns<150);
    const pending=game.pendingChongtong();if(pending){await game.declareChongtong(pending.p,pending.p===1?'win':'continue');continue;}
    const p=game.turn;
    // Model a fixed human policy without consuming the CPU's random stream.
    const rng=game.random;if(p===0)game.random=()=>.25;const card=aiChooseCard(game,p);game.random=rng;
    const same=card?game.hand[p].filter(c=>c.m===card.m):[],matches=card?game.matches(card.m):[];
    const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
    if(same.length>=3&&!bomb&&!game.shake[p])game.shakeCards(p,card.m);
    await game.play(p,card,bomb);
  }
  return {game,winner,round:{seed,gold,first:seed%2,carry:1}};
}
let tiered,legacy,different=0;
for(let level=1;level<=10;level++)for(let seed=1;seed<=20;seed++){
  const gold=level===1?100000:(level-1)*100000+1;
  const played=await play(seed,gold),verified=await verifyRound(played.round,played.game.actions);
  assert.equal(verified.gold,played.game.bank[0],'server independently replays every tier');
  assert.ok(verified.gold>=0);
  if(level===10){
    const old=await play(seed,gold,'normal');
    assert.equal((await verifyRound(old.round,old.game.actions,{cpuMode:'normal'})).gold,old.game.bank[0]);
    if(JSON.stringify(played.game.actions)!==JSON.stringify(old.game.actions)){different++;tiered=played;legacy=old;}
  }
}
assert.ok(different>0,'high-tier strategy actually changes decisions');

// A cached v5 browser may still finish its original CPU policy. Both paths are
// fully replayed from a server-owned starting balance, never a client balance.
// Recreate the exact prior rules for cached clients, including the old CPU fallback.
const oldTiered=await play(23,900001,'adaptive',previous),oldNormal=await play(23,900001,'normal',previous);
let snapshot=tiered.round,settled;
const actor='00000000-0000-4000-8000-000000000001',roundId='00000000-0000-4000-9000-000000000001';
const handler=createHandler({env:name=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only'})[name],fetchImpl:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:actor});
  const params=JSON.parse(options.body);if(params.p_action==='round')return Response.json({round:snapshot});
  settled=params.p_gold;return Response.json({ok:true,gold:settled});
}});
const request=(actions,version=8)=>handler(new Request('https://edge.invalid',{method:'POST',headers:{authorization:'Bearer user',origin:'https://ojjuda.kr'},body:JSON.stringify({action:'settle',round_id:roundId,rules_version:version,actions,gold:1,cpuMode:'normal',cpuLevel:1})}));
assert.equal((await request(tiered.game.actions)).status,200);assert.equal(settled,tiered.game.bank[0]);
for(const played of [oldTiered,oldNormal]){
  snapshot=played.round;assert.equal((await request(played.game.actions,5)).status,200);assert.equal(settled,played.game.bank[0]);
}
const forged=structuredClone(oldNormal.game.actions);forged.find(a=>a.type==='play'&&a.p===1).card=999;
assert.equal((await request(forged,5)).status,409,'compatibility does not accept forged CPU moves');

const room={status:'active',seed:'ab'.repeat(32),actions:[],start_gold:[5000,5000],first:1,carry:1};
const rich={...room,start_gold:[900001,900001]};
assert.equal((await replayOnline(rich)).game.cpuLevel,1,'human-room takeover and timeouts keep the original policy');
assert.deepEqual((await automaticOnline(rich)).actions,(await automaticOnline(room)).actions);
console.log('PASS: 10 exact gold tiers, fixed round level, unchanged deal/normal AI, public-only strategy, 200 verified rounds, cached-client settlement and unchanged online automation');
