import assert from 'node:assert/strict';
import {CARDS, Game, seededRandom, aiChooseCard, aiChoose, aiGoStop} from '../games/matgo-engine.mjs';
import {verifyRound} from '../supabase/functions/matgo/verify.mjs';

let cases=0;
function conserved(g){
  const cards=[...g.floor.flat(),...g.hand.flat(),...g.caps.flat(),...g.deck];
  assert.equal(cards.length,50);assert.equal(new Set(cards.map(c=>c.id)).size,50);
}
function fixture({p=0,bonuses=[],hand=[1,3,16],floor=[0,4],flips=[2],opponent=[6,7,10,11]}={}){
  const events=[];
  const g=new Game({event:async(type,data)=>events.push({type,...data}),choose:async(_p,ids)=>ids[0],goStop:async()=> 'stop'});
  g.deal();g.turn=p;g.first=p;g.endTurn=async()=>{};
  const pool=new Map(CARDS.map(c=>[c.id,{...c}]));
  const take=id=>{const c=pool.get(id);assert.ok(c,`unique fixture card ${id}`);pool.delete(id);return c;};
  g.hand=[[],[]];g.hand[p]=hand.map(take);g.hand[1-p]=[44].map(take);
  g.floor=floor.map(id=>[take(id)]);g.caps=[[],[]];g.caps[1-p]=opponent.map(take);
  g.deck=[...bonuses,...flips].map(take).concat([...pool.values()]);
  return {g,events};
}

// Bonuses are earned exactly once, when the tied ppuk is captured, by either route/player.
for(const p of [0,1])for(const bonusIds of [[48],[48,49]])for(const self of [true,false])for(const route of ['hand','flip']){
  const {g,events}=fixture({p,bonuses:bonusIds});
  await g.play(p,g.hand[p][0]);conserved(g);
  const stack=g.floor.find(st=>st.ppuk);
  assert.equal(stack.length,3+bonusIds.length);
  assert.equal(stack.ppukOwner,p);assert.equal(g.ppukCount[p],1);
  assert.deepEqual(stack.filter(c=>c.k==='bonus').map(c=>c.id),bonusIds);
  assert.ok(!g.caps[p].some(c=>c.k==='bonus'));
  assert.equal(events.filter(e=>e.type==='steal').length,0,'tying a bonus does not award or steal early');
  const collector=self?p:1-p;
  if(!self){g.caps[p]=g.caps[1-p];g.caps[1-p]=[];}
  const matching=g.hand[p].splice(g.hand[p].findIndex(c=>c.id===3),1)[0];
  const free=g.deck.splice(g.deck.findIndex(c=>c.id===20),1)[0];
  if(route==='hand'){g.hand[collector].push(matching);g.deck.unshift(free);}
  else{g.deck.unshift(matching);g.hand[collector].push(free);}
  events.length=0;g.turn=collector;
  await g.play(collector,route==='hand'?matching:free);conserved(g);
  assert.equal(events.find(e=>e.type==='ppukget').count,(self?2:1));
  assert.equal(events.filter(e=>e.type==='steal').length,(self?2:1));
  assert.ok(bonusIds.every(id=>g.caps[collector].some(c=>c.id===id)));
  assert.equal(g.ppukCount[p],1,'capturing does not reset or increment ppuk count');
  cases++;
}
// Ordinary bonus flips still award immediately; lack of pi never invents cards.
for(const opponent of [[],[6]]){
  const {g,events}=fixture({bonuses:[48],opponent});
  await g.play(0,g.hand[0][0]);events.length=0;
  const unrelated=g.deck.splice(g.deck.findIndex(c=>c.id===20),1)[0];g.deck.unshift(unrelated);
  await g.play(0,g.hand[0].find(c=>c.id===3));conserved(g);
  assert.equal(events.filter(e=>e.type==='steal').length,opponent.length);
  cases++;
}
{
  const {g,events}=fixture({bonuses:[48,49],flips:[20]});
  await g.play(0,g.hand[0][0]);conserved(g);
  assert.equal(g.floor.some(st=>st.ppuk),false);assert.equal(events.filter(e=>e.type==='steal').length,0);
  assert.equal(g.caps[0].filter(c=>c.k==='bonus').length,2);cases++;
}

// Hand bonuses keep their pi value and replace the hand card without stealing or spending a turn.
for(const p of [0,1])for(const id of [48,49]){
  const {g,events}=fixture({p,hand:[id,16],flips:[20]});
  const opponentBefore=g.caps[1-p].map(c=>c.id),turn=g.turn,normal=g.normalPlays[p];
  await g.play(p,g.hand[p][0]);conserved(g);
  assert.deepEqual(g.caps[1-p].map(c=>c.id),opponentBefore);
  assert.equal(events.filter(e=>e.type==='steal').length,0);
  assert.equal(g.caps[p].find(c=>c.id===id).pv,id===48?2:3);
  assert.ok(g.hand[p].some(c=>c.id===20));assert.equal(g.turn,turn);assert.equal(g.normalPlays[p],normal);cases++;
}

// Three ppuks by one player end the round even with no scoring captures.
for(const p of [0,1])for(const opponentGo of [0,1,2]){
  const {g,events}=fixture({p,bonuses:[48],hand:[1,5,9,16],floor:[0,4,8],flips:[2,6,10],opponent:[14,15]});
  g.carry=8;g.mult[p]=4;g.bank[1-p]=200;g.go[1-p]=opponentGo;
  for(let i=0;i<3;i++){
    await g.play(p,g.hand[p][0]);conserved(g);
    assert.equal(g.ppukCount[p],i+1);assert.equal(g.over,i===2);
  }
  const end=events.find(e=>e.type==='end');
  assert.equal(end.winner,p);assert.equal(end.special,'three_ppuk');assert.equal(end.pts,7);
  assert.equal(end.mult,opponentGo?2:1);assert.equal(end.total,opponentGo?14:7);
  assert.equal(end.det.some(([label])=>label==='고박'),!!opponentGo);
  assert.equal(end.money,opponentGo?1400:700);assert.equal(g.bank[1-p],0);assert.equal(g.carry,1);
  assert.equal(await g.play(p,g.hand[p][0]),false);
  g.deal();assert.deepEqual(g.ppukCount,[0,0]);cases++;
}
{
  const {g}=fixture();g.ppukCount[1]=2;
  await g.play(0,g.hand[0][0]);assert.deepEqual(g.ppukCount,[1,2]);assert.equal(g.over,false);cases++;
}

function seeded(seed,first=0){
  const events=[];let g;
  g=new Game({event:async(type,data)=>events.push({type,...data}),choose:async(p,ids)=>aiChoose(g,p,ids),goStop:async(p,s)=>p===1?aiGoStop(g,p,s):'stop'});
  g.random=seededRandom(seed);g.first=first;g.deal();return {g,events};
}
for(const [seed,p] of [[9,0],[77,1]])for(const decision of ['win','continue']){
  const {g,events}=seeded(seed);assert.equal(g.pendingChongtong().p,p);
  assert.equal(await g.play(g.turn,g.hand[g.turn][0]),false,'choice precedes play');
  assert.equal(await g.declareChongtong(1-p,'win'),false,'only the holder can declare');
  assert.equal(await g.declareChongtong(p,'invalid'),false);
  g.carry=8;g.mult[p]=4;
  assert.equal(await g.declareChongtong(p,decision),true);conserved(g);
  assert.equal(g.over,decision==='win');assert.deepEqual(g.go,[0,0]);
  if(decision==='win'){
    const end=events.find(e=>e.type==='end');assert.equal(end.total,7);assert.equal(end.special,'chongtong');
  }else{
    assert.equal(g.pendingChongtong(),null);assert.equal(await g.declareChongtong(p,'win'),false,'continue is final for this month');
    assert.equal(await g.play(g.turn,g.hand[g.turn][0])===false,false);
  }
  cases++;
}
for(const first of [0,1]){
  const {g}=seeded(5972,first);assert.equal(g.pendingChongtong().p,first);
  assert.equal(await g.declareChongtong(1-first,'win'),false);
  await g.declareChongtong(first,'continue');assert.equal(g.pendingChongtong().p,1-first);cases++;
}
{
  const {g}=fixture({hand:[0,1,2,48],floor:[4],flips:[3]});
  assert.equal(g.pendingChongtong(),null);await g.play(0,g.hand[0].find(c=>c.id===48));
  assert.equal(g.pendingChongtong().p,0,'a hand bonus replacement can complete four matching cards');conserved(g);cases++;
}

// The authoritative replay accepts the special win/continue actions and rejects forged declarations.
for(const [seed,p] of [[9,0],[77,1]]){
  const round={seed,gold:5000,first:0,carry:1};const {g}=seeded(seed);
  await g.declareChongtong(p,'win');assert.equal((await verifyRound(round,g.actions)).gold,p===0?5700:4300);
  await assert.rejects(verifyRound({...round,seed:10},g.actions),/invalid_chongtong/);
  await assert.rejects(verifyRound(round,[{type:'chongtong',p:1-p,decision:'win'}]),/invalid_chongtong/);
  if(p===1)await assert.rejects(verifyRound(round,[{type:'chongtong',p,decision:'continue'}]),/invalid_chongtong/);
  cases++;
}
for(const seed of [9,108,468]){
  const round={seed,gold:5000,first:0,carry:1};const {g,events}=seeded(seed);
  if(seed!==9)g.ui.goStop=async(p,s)=>p===1?aiGoStop(g,p,s):'go';
  while(!g.over){
    const pending=g.pendingChongtong();if(pending){await g.declareChongtong(pending.p,pending.p===1?'win':'continue');continue;}
    const p=g.turn,card=p===1?aiChooseCard(g,p):g.hand[p][0]||null;
    const same=card?g.hand[p].filter(c=>c.m===card.m):[],matches=card?g.matches(card.m):[];
    const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
    if(same.length>=3&&!bomb&&!g.shake[p])g.shakeCards(p,card.m);
    await g.play(p,card,bomb);
  }
  assert.equal((await verifyRound(round,g.actions)).gold,g.bank[0]);conserved(g);
  if(seed!==9){const result=events.find(e=>e.type==='end');assert.equal(result.special,'three_ppuk');assert.equal(result.total,seed===468?14:7);}
  cases++;
}
console.log(`PASS: ${cases} bonus-bound ppuk, per-player triple ppuk, chongtong choice and server replay scenarios`);
