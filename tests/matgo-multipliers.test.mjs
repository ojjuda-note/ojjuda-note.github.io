import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as browser from '../games/matgo-engine.mjs';
import * as server from '../supabase/functions/matgo/engine.mjs';
import * as legacy from '../supabase/functions/matgo/engine-v7.mjs';
import {createHandler} from '../supabase/functions/matgo/handler.mjs';
import {automaticOnline,replayOnline} from '../supabase/functions/matgo/online.mjs';

let cases = 0;
async function finish(engine, {winner=0, loserPi=8, loserGo=0, gwangbak=false, winnerPi=true, winnerGwang=true, loserCards, winnerGo=0, carry=1, shake=1, firstPpuk=0, rate=100}={}) {
  let result;
  const g = new engine.Game({event:async(type,data)=>{if(type==='end')result=data;}});
  g.deal();g.bank=[100000000,100000000];g.rate=rate;g.carry=carry;
  const used = new Set();
  const take = id => {assert.ok(!used.has(id));used.add(id);return {...engine.CARDS[id]};};
  const pi = n => engine.CARDS.filter(c=>c.k==='pi'&&!used.has(c.id)).slice(0,n).map(c=>take(c.id));
  const lost = loserCards ? loserCards.map(c=>({...take(c.id),...c})) : pi(loserPi);
  if(!gwangbak)lost.push(take(40));
  const won = winnerGwang ? [0,8,28].map(take) : [];
  if(winnerPi)won.push(take(48),take(49),...pi(winnerGwang?8:11));
  else won.push(...[1,5,9,13,17,21].map(take)); // Ribbons + three lights = 8 points, no pi score.
  g.caps=[[],[]];g.caps[winner]=won;g.caps[1-winner]=lost;
  g.go[winner]=winnerGo;g.go[1-winner]=loserGo;g.mult[winner]=shake;
  g.firstPpukGold[winner]=firstPpuk;g.firstPpukGold[1-winner]=-firstPpuk;
  await g.finish(winner);
  const balance=[...g.bank];await g.finish(winner);
  assert.deepEqual(g.bank,balance,'repeated finish does not pay twice');
  return {result,g};
}

assert.equal(fs.readFileSync(new URL('../games/matgo-engine.mjs',import.meta.url),'utf8'),fs.readFileSync(new URL('../supabase/functions/matgo/engine.mjs',import.meta.url),'utf8'));
for(const [name,engine] of [['browser',browser],['server',server]]) {
  // User rule: a winner with pi points doubles against 0..8 pi; 9 pi is safe.
  // Check both seats and every combination of pi/gwang/go penalties.
  for(const winner of [0,1])for(const loserPi of [0,1,5,6,7,8,9])for(const loserGo of [0,1,3])for(const gwangbak of [false,true]) {
    const {result:r}=await finish(engine,{winner,loserPi,loserGo,gwangbak});
    const multiplier=(loserPi<=8?2:1)*(loserGo?2:1)*(gwangbak?2:1);
    assert.equal(r.mult,multiplier,`${name}: winner ${winner}, loser pi ${loserPi}, go ${loserGo}, gwangbak ${gwangbak}`);
    assert.equal(r.pts,7);assert.equal(r.total,7*multiplier);assert.equal(r.money,700*multiplier);
    for(const [label,active] of [['피박',loserPi<=8],['고박',loserGo>0],['광박',gwangbak]])
      assert.equal(r.det.filter(([s])=>s===label).length,active?1:0,`${label} appears once only when active`);
    assert.equal(r.goldDelta[winner],r.money);assert.equal(r.goldDelta[1-winner],-r.money);
    cases++;
  }
  for(const winner of [0,1]) {
    const noPi=(await finish(engine,{winner,winnerPi:false,loserPi:0,gwangbak:false})).result;
    assert.equal(noPi.det.some(([s])=>s==='피박'),false,'no pi points means no pibak');
    const noGwang=(await finish(engine,{winner,winnerGwang:false,loserPi:9,gwangbak:true})).result;
    assert.equal(noGwang.det.some(([s])=>s==='광박'),false,'no light points means no gwangbak');
    // Physical cards are weighted: ssangpi and gukjin-as-pi count as two.
    for(const asPi of [false,true]) {
      const loserCards=[{id:32,asPi},{id:41},{id:47},{id:6},{id:7},{id:10}];
      const r=(await finish(engine,{winner,loserCards})).result;
      assert.equal(r.det.some(([s])=>s==='피박'),!asPi,'seven pi doubles; nine pi does not');cases++;
    }
    const all=(await finish(engine,{winner,loserPi:8,loserGo:1,gwangbak:true,winnerGo:3,carry:2,shake:2,firstPpuk:300,rate:500})).result;
    assert.equal(all.mult,64);assert.equal(all.total,9*64);assert.equal(all.money,288000);
    assert.equal(all.goldDelta[winner],288300,'opening ppuk is added after multipliers');cases+=3;
  }
}
// Cached v7 clients must settle using the amount originally shown; fresh v8
// clients must receive the new amount, including at higher stake rates.
async function playRound(engine, seed) {
  const round={seed,gold:100000,first:seed%2,carry:1,rate:500};
  let g,result;
  g=new engine.Game({event:async(type,data)=>{if(type==='end')result=data;},
    choose:async(p,ids)=>engine.aiChoose(g,p,ids),chooseGukjin:async p=>engine.aiChooseGukjin(g,p),
    goStop:async(p,s)=>p===1?engine.aiGoStop(g,p,s):'stop'});
  g.random=engine.seededRandom(seed);g.bank=[round.gold,5000];g.first=round.first;g.rate=round.rate;g.deal();
  for(let n=0;!g.over;n++) {
    assert.ok(n<150,'round terminates');
    const pending=g.pendingChongtong();
    if(pending){await g.declareChongtong(pending.p,pending.p===1?'win':'continue');continue;}
    const p=g.turn,card=p===1?engine.aiChooseCard(g,p):g.hand[p][0]||null;
    const same=card?g.hand[p].filter(c=>c.m===card.m):[],matches=card?g.matches(card.m):[];
    const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
    if(same.length>=3&&!bomb&&!g.shake[p])g.shakeCards(p,card.m);
    await g.play(p,card,bomb);
  }
  return {round,g,result};
}
let snapshot,paid,changed=0;
const handler=createHandler({env:n=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test'})[n],fetchImpl:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'00000000-0000-4000-8000-000000000001'});
  const body=JSON.parse(options.body);
  if(body.p_action==='round')return Response.json({round:snapshot});
  assert.equal(body.p_action,'settle');paid=body.p_gold;return Response.json({gold:paid});
}});
for(let seed=1;seed<=24;seed++) {
  const fresh=await playRound(server,seed),old=await playRound(legacy,seed);
  if(fresh.result?.total!==old.result?.total)changed++;
  for(const [played,rules_version] of [[old,7],[fresh,8]]) {
    snapshot=played.round;paid=null;
    const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({action:'settle',round_id:'00000000-0000-4000-8000-000000000002',rules_version,actions:played.g.actions,gold:99999999})}));
    assert.equal(response.status,200);assert.equal(paid,played.g.bank[0],`rules v${rules_version} replay at seed ${seed}`);
    cases++;
  }
}
assert.ok(changed>0,'the completed-game sample includes changed pibak payouts');
const room={status:'active',seed:'11'.repeat(32),actions:[],start_gold:[100000,100000],first:0,carry:1};
const first=await automaticOnline(room);assert.equal(first.actions[0].rules_version,8);
for(const rules_version of [7,8]) {
  const actions=structuredClone(first.actions);actions[0].rules_version=rules_version;
  const replay=await replayOnline({...room,actions});
  const r=(await finish({Game:replay.game.constructor,CARDS:server.CARDS},{loserPi:8})).result;
  assert.equal(r.det.some(([s])=>s==='피박'),rules_version===8,'online rounds retain their first recorded rules');cases++;
}
console.log(`PASS: ${cases} scoring/replay cases, both engines/seats, pi boundaries, ×2/×4/×8, weighted pi, v7/v8 settlements and online compatibility (${changed} changed full-round payouts)`);
