import assert from 'node:assert/strict';
import * as browser from '../games/matgo-engine.mjs';
import * as server from '../supabase/functions/matgo/engine.mjs';
import {dealSoloRound,TAZZA_MODES} from '../games/matgo-tazza.mjs';
import {verifyRound} from '../supabase/functions/matgo/verify.mjs';

function finishFixture(engine,{mode='tan',cpuMode='standard',points=0}={}){
  const events=[],g=new engine.Game({event:async(type,data)=>events.push({type,...data})});
  g.cpuMode=cpuMode;g.deal();g.tazzaMode=mode;
  const mine=points?engine.CARDS.filter(c=>c.k==='pi').slice(0,9+points):[];
  g.hand=[[],[]];g.floor=[];g.caps=[mine.map(c=>({...c})),[]];
  g.deck=engine.CARDS.filter(c=>!mine.includes(c)).map(c=>({...c}));
  return {g,events};
}
const conserve=g=>{
  const cards=[...g.hand.flat(),...g.caps.flat(),...g.floor.flat(),...g.deck];
  assert.equal(cards.length,50);assert.equal(new Set(cards.map(c=>c.id)).size,50);
};
for(const engine of [browser,server]){
  for(const [winner,special] of [[-1,null],[1,null],[1,'chongtong'],[1,'three_ppuk']])for(const points of [0,5,9]){
    const {g,events}=finishFixture(engine,{points});g.carry=2;g.go[0]=points>=7?2:0;
    const before=g.bank[0];await g.finish(winner,special);conserve(g);
    const end=events.at(-1);assert.equal(end.type,'end');assert.equal(end.winner,0);assert.equal(end.tazzaSaved,true);
    assert.ok(end.total>=7);assert.ok(g.bank[0]>before);assert.equal(g.first,0);assert.equal(g.carry,1);
    assert.ok(end.det.some(([name])=>name==='탄쓰기 승리 보장'));
    if(points<7){assert.equal(end.total,7);assert.equal(end.special,'tazza');}
    else{
      const control=finishFixture(engine,{mode:null,points});control.g.carry=2;control.g.go[0]=2;
      await control.g.finish(0);assert.equal(end.total,control.events.at(-1).total,'earned points and multipliers are preserved');
    }
    const gold=g.bank[0];await g.finish(1);assert.equal(g.bank[0],gold,'guarantee pays only once');
  }
  for(const mode of [null,...Object.keys(TAZZA_MODES).filter(m=>m!=='tan')]){
    const {g,events}=finishFixture(engine,{mode});await g.finish(1,'chongtong');
    assert.equal(events.at(-1).winner,1);assert.equal(g.bank[0],4300,'other modes do not force victory');
  }
  {
    const {g,events}=finishFixture(engine,{cpuMode:'normal'});await g.finish(1,'chongtong');
    assert.equal(events.at(-1).winner,1,'online automation never enables the paid guarantee');
  }
  {
    const paid=finishFixture(engine,{points:9}),normal=finishFixture(engine,{mode:null,points:9});
    await paid.g.finish(0);await normal.g.finish(0);
    assert.deepEqual(paid.events,normal.events,'ordinary wins keep their original result');
    paid.g.deal();assert.equal(paid.g.tazzaMode,null);await paid.g.finish(1,'chongtong');
    assert.equal(paid.events.at(-1).winner,1,'the next ordinary round has no guarantee');
  }
}

let guaranteed=0,example;
for(const gold of [5000,400001,900001])for(const policy of ['first','random'])for(let seed=1;seed<=40;seed++){
  const {Game,seededRandom,aiChooseCard,aiChoose,aiChooseGukjin,aiGoStop}=browser;
  const random=seededRandom(seed+901),round={rules_version:13,seed,gold,first:seed%2,carry:1,rate:100,tazza_mode:'tan'};
  let g,result;
  g=new Game({event:async(type,data)=>{if(type==='end'||type==='nagari')result={type,...data};},
    choose:async(p,ids)=>p===1?aiChoose(g,p,ids):policy==='first'?ids[0]:ids[Math.floor(random()*ids.length)],
    chooseGukjin:async p=>p===1?aiChooseGukjin(g,p):'yul',
    goStop:async(p,s)=>p===1?aiGoStop(g,p,s):'go'});
  g.bank=[gold,5000];g.first=round.first;g.carry=round.carry;dealSoloRound(g,round,browser);
  for(let n=0;!g.over;n++){
    assert.ok(n<150);conserve(g);
    const pending=g.pendingChongtong();if(pending){await g.declareChongtong(pending.p,pending.p===1?'win':'continue');continue;}
    const p=g.turn,card=p===1?aiChooseCard(g,p):g.hand[0][policy==='first'?0:Math.floor(random()*g.hand[0].length)]||null;
    const same=card?g.hand[p].filter(c=>c.m===card.m):[],matches=card?g.matches(card.m):[];
    const bomb=p===1&&same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
    if(p===1&&same.length>=3&&!bomb&&!g.shake[p])g.shakeCards(p,card.m);
    await g.play(p,card,bomb);
  }
  conserve(g);assert.equal(result.type,'end');assert.equal(result.winner,0);assert.ok(result.total>=7);
  assert.equal((await verifyRound(round,g.actions)).gold,g.bank[0]);assert.ok(g.bank[0]>gold);
  if(result.tazzaSaved){guaranteed++;if(!example&&policy==='first'&&gold===900001&&round.first===0)example={seed,gold,total:result.total};}
}
assert.ok(guaranteed>0,'full legal transcripts actually exercise the guarantee');
console.log(`PASS: tan converts losses/draws/special defeats into wins, preserves earned scores, expires after one round; 240 arbitrary-play rounds verified (${guaranteed} saved), UI example ${JSON.stringify(example)}`);
