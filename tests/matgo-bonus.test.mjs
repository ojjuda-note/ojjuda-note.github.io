import assert from 'node:assert/strict';
import * as current from '../games/matgo-engine.mjs';
import * as legacy from '../supabase/functions/matgo/engine-v4.mjs';
import * as previous from '../supabase/functions/matgo/engine-v5.mjs';
import * as previous7 from '../supabase/functions/matgo/engine-v7.mjs';
import {createHandler} from '../supabase/functions/matgo/handler.mjs';
import {replayOnline,advanceOnline,automaticOnline} from '../supabase/functions/matgo/online.mjs';

// Both players keep the bonus value, replacement card and turn, without taking pi.
for(const p of [0,1])for(const id of [48,49]){
  const events=[];
  const g=new current.Game({event:async(type,data)=>events.push({type,...data})});g.deal();
  const pool=new Map(current.CARDS.map(c=>[c.id,{...c}]));
  const take=id=>{const c=pool.get(id);pool.delete(id);return c;};
  g.hand=[[],[]];g.hand[p]=[take(id),take(0)];g.hand[1-p]=[take(4)];
  g.caps=[[],[]];g.caps[1-p]=[take(6),take(7)];g.floor=[[take(8)]];
  g.deck=[take(12),...pool.values()];g.turn=p;
  await g.play(p,g.hand[p][0]);
  assert.deepEqual(g.caps[1-p].map(c=>c.id),[6,7]);
  assert.equal(current.score(g.caps[p]).pv,id===48?2:3);
  assert.deepEqual(g.hand[p].map(c=>c.id),[0,12]);assert.equal(g.turn,p);
  assert.equal(g.normalPlays[p],0);assert.equal(events.some(e=>e.type==='steal'),false);
  const cards=[...g.hand.flat(),...g.caps.flat(),...g.floor.flat(),...g.deck];
  assert.equal(cards.length,50);assert.equal(new Set(cards.map(c=>c.id)).size,50);
}

// New and already-open CPU pages settle through their own engine versions.
for(const [version,engine] of [[4,legacy],[5,previous],[6,previous],[7,previous7],[8,current]])for(let seed=1;seed<=20;seed++){
  const round={seed,gold:5000,first:0,carry:1};let g;
  g=new engine.Game({event:async()=>{},choose:async(p,ids)=>engine.aiChoose(g,p,ids),
    chooseGukjin:async p=>engine.aiChooseGukjin(g,p),goStop:async(p,s)=>p===1?engine.aiGoStop(g,p,s):'stop'});
  g.random=engine.seededRandom(seed);g.deal();
  while(!g.over){
    const pending=g.pendingChongtong();if(pending){await g.declareChongtong(pending.p,'win');continue;}
    const p=g.turn,card=p===1?engine.aiChooseCard(g,p):g.hand[p][0]||null;
    const same=card?g.hand[p].filter(c=>c.m===card.m):[],matches=card?g.matches(card.m):[];
    const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
    if(same.length>=3&&!bomb&&!g.shake[p])g.shakeCards(p,card.m);
    await g.play(p,card,bomb);
  }
  let settledGold;
  const handler=createHandler({env:k=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'server',SUPABASE_ANON_KEY:'public'})[k],fetchImpl:async(url,opts)=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'00000000-0000-4000-8000-000000000001'});
    const body=JSON.parse(opts.body);
    if(body.p_action==='round')return Response.json({round});
    assert.equal(body.p_action,'settle');settledGold=body.p_gold;return Response.json({ok:true});
  }});
  const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({action:'settle',round_id:'00000000-0000-4000-8000-000000000002',rules_version:version,actions:g.actions})}));
  assert.equal(response.status,200);assert.equal(settledGold,g.bank[0]);
}

// The server pins new rounds, rejects client rule overrides and preserves old logs.
let room={status:'active',seed:'11'.repeat(32),start_gold:[5000,5000],first:0,carry:1,actions:[]};
const initial=await replayOnline(room),pr=initial.prompt;
const command=pr.type==='chongtong'?{type:'chongtong',decision:'continue'}:{type:'play',card:initial.game.hand[pr.p][0].id};
const first=await advanceOnline(room,pr.p,{...command,rules_version:4});
assert.equal(first.actions[0].rules_version,8);
assert.equal((await replayOnline({...room,actions:first.actions})).game instanceof legacy.Game,false);
const oldActions=structuredClone(first.actions);delete oldActions[0].rules_version;
assert.ok((await replayOnline({...room,actions:oldActions})).game instanceof legacy.Game);
for(const version of [5,7,8]){
  const actions=structuredClone(first.actions);actions[0].rules_version=version;
  room={...room,actions};
  assert.equal((await replayOnline(room)).game instanceof previous.Game,version===5);
  for(let i=0;i<120;i++){
    const state=await replayOnline(room);if(state.game.over)break;
    const next=await automaticOnline(room);room={...room,actions:next.actions};
    assert.equal(room.actions[0].rules_version,version);
  }
  assert.equal((await replayOnline(room)).game.over,true);
}
assert.equal((await replayOnline({...room,actions:[]})).game instanceof legacy.Game,false,'rematch uses new rules');
console.log('PASS: bonus value/turn/card conservation, 100 v4/v5/v6/v7/v8 CPU settlements, server-pinned online rules and legacy replay');
