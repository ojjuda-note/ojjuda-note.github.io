import assert from 'node:assert/strict';
import {CARDS,Game,score,seededRandom,aiChoose,aiChooseCard,aiGoStop,aiChooseGukjin} from '../games/matgo-engine.mjs';
import {heldPairMonths} from '../games/matgo-view.mjs';
import {verifyRound} from '../supabase/functions/matgo/verify.mjs';
import {replayOnline,advanceOnline,automaticOnline,onlineView} from '../supabase/functions/matgo/online.mjs';

function scenario({p=0,choice='pi',mode='hand',nearWin=false}={}){
  let asks=0,goCalls=0;const events=[];
  const g=new Game({event:async(type,data)=>events.push({type,...data}),choose:async(_p,ids)=>ids[0],
    chooseGukjin:async(seat,card)=>{asks++;assert.equal(seat,p);assert.equal(card.id,32);assert.equal(goCalls,0);return choice;},
    goStop:async()=>{goCalls++;assert.equal(g.caps[p].find(c=>c.id===32).asPi,true);return 'stop';}});
  g.deal();g.first=p;g.turn=p;
  const pool=new Map(CARDS.map(c=>[c.id,{...c,asPi:false}]));
  const take=id=>{assert.ok(pool.has(id));const c=pool.get(id);pool.delete(id);return c;};
  const hand=mode==='flip'?[16,20]:mode==='bomb'?[32,34,35,20]:mode==='ppuk'?[35,20]:mode==='bind'?[32,35,20]:[32,20];
  g.hand=[[],[]];g.hand[p]=hand.map(take);g.hand[1-p]=[40,41].map(take);
  const stack=(mode==='ppuk'?[32,33,34]:[33]).map(take);if(mode==='ppuk'){stack.ppuk=true;stack.ppukOwner=p;}
  g.floor=[stack,[take(24)]];g.caps=[[],[]];
  if(nearWin)g.caps[p]=[0,8,28,1,5,9,2,3,6,7,10,11,14,15].map(take);
  const flip=mode==='flip'?32:mode==='bind'?34:4;g.deck=[take(flip),...pool.values()];
  if(!nearWin)g.endTurn=async()=>{};
  return {g,events,get asks(){return asks;},get goCalls(){return goCalls;}};
}
for(const piles of [[[14,15],[]],[[14],[15]],[[],[14,15]]])assert.deepEqual([...heldPairMonths([CARDS[12],CARDS[13]],piles.map(ids=>ids.map(id=>CARDS[id])))],[4]);
assert.equal(heldPairMonths([CARDS[12]],[[CARDS[14],CARDS[15]],[]]).size,0);
assert.equal(heldPairMonths([CARDS[12],CARDS[13]],[[CARDS[14]],[]]).size,0);
assert.equal(heldPairMonths([CARDS[48],CARDS[49]],[[],[]]).size,0);
let cases=0;
for(const p of [0,1])for(const mode of ['hand','flip','bomb','ppuk'])for(const choice of ['yul','pi']){
  const f=scenario({p,mode,choice}),g=f.g;
  await g.play(p,g.hand[p][0],mode==='bomb'?g.hand[p].slice(1,3):null);
  assert.equal(f.asks,1);assert.equal(g.caps[p].find(c=>c.id===32).asPi,choice==='pi');
  assert.equal(g.actions[0].gukjin,choice);
  const s=score(g.caps[p]);assert.ok(choice==='pi'?s.pv>=2:s.y>=1);cases++;
}
{
  const f=scenario({mode:'bind'});await f.g.play(0,f.g.hand[0][0]);assert.equal(f.asks,0,'ppuk is not yet captured');
  await f.g.play(0,f.g.hand[0].find(c=>c.id===35));assert.equal(f.asks,1);cases++;
}
for(const choice of ['yul','pi']){
  const f=scenario({choice,nearWin:true});await f.g.play(0,f.g.hand[0][0]);
  assert.equal(f.goCalls,choice==='pi'?1:0,'selection changes seven-point go/stop immediately');cases++;
}
{const f=scenario({choice:'both'});await assert.rejects(f.g.play(0,f.g.hand[0][0]),/invalid_gukjin/);cases++;}

// Two-card bombs take all four matching cards and create exactly one later flip.
for(const p of [0,1])for(const bundled of [false,true]){
  const events=[],g=new Game({event:async(type,data)=>events.push({type,...data}),choose:async(_p,ids)=>ids[0]});g.deal();g.turn=p;g.endTurn=async()=>{};
  const pool=new Map(CARDS.map(c=>[c.id,{...c}])),take=id=>{const c=pool.get(id);pool.delete(id);return c;};
  g.hand=[[],[]];g.hand[p]=[0,1,16].map(take);g.hand[1-p]=[40,41].map(take);
  const floor=[2,3].map(take);g.floor=(bundled?[floor]:floor.map(c=>[c])).concat([[take(8)]]);
  g.caps=[[],[]];g.caps[1-p]=[10,11].map(take);g.deck=[take(4),take(20),...pool.values()];
  const option=g.bombOption(p,g.hand[p][0]);assert.equal(option.length,1);
  assert.equal(await g.play(p,g.hand[p][0],option),true);
  assert.equal(g.bomb[p],1);assert.equal(g.mult[p],2);assert.equal(g.hand[p].length,1);
  assert.deepEqual(g.caps[p].filter(c=>c.m===1).map(c=>c.id).sort(),[0,1,2,3]);
  assert.equal(events.find(e=>e.type==='bomb').flips,1);assert.equal(events.filter(e=>e.type==='steal').length,1);
  const count=()=>[...g.hand.flat(),...g.caps.flat(),...g.floor.flat(),...g.deck].map(c=>c.id);
  assert.equal(new Set(count()).size,50);assert.equal(count().length,50);
  const hand=g.hand[p].length,deck=g.deck.length;await g.play(p,null);
  assert.equal(g.bomb[p],0);assert.equal(g.hand[p].length,hand);assert.equal(g.deck.length,deck-1);
  assert.equal(await g.play(p,null),false,'cannot spend the one flip twice');cases++;
}
// Full legal transcripts prove choices are checked by final settlement, not just the UI.
for(const choice of ['yul','pi']){
  let exercised=false;
  for(let seed=1;seed<=50&&!exercised;seed++){
    let g;g=new Game({event:async()=>{},choose:async(p,ids)=>aiChoose(g,p,ids),chooseGukjin:async p=>p===0?choice:aiChooseGukjin(g,p),goStop:async(p,s)=>p===1?aiGoStop(g,p,s):'stop'});
    g.random=seededRandom(seed);g.deal();
    for(let i=0;i<150&&!g.over;i++){
      const pending=g.pendingChongtong();if(pending){await g.declareChongtong(pending.p,pending.p===1?'win':'continue');continue;}
      const p=g.turn,card=p?aiChooseCard(g,p):g.hand[p][0]||null,same=card?g.hand[p].filter(c=>c.m===card.m):[],ms=card?g.matches(card.m):[];
      const bomb=same.length>=3&&ms.length===1&&ms[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
      if(same.length>=3&&!bomb&&!g.shake[p])g.shakeCards(p,card.m);
      await g.play(p,card,bomb);
    }
    const chosen=g.actions.find(a=>a.p===0&&a.gukjin===choice);if(!chosen)continue;exercised=true;
    const round={seed,gold:5000,first:0,carry:1};assert.equal((await verifyRound(round,g.actions)).gold,g.bank[0]);
    for(const bad of [null,'both',undefined]){const forged=structuredClone(g.actions);forged.find(a=>a.p===0&&a.gukjin===choice).gukjin=bad;await assert.rejects(verifyRound(round,forged),/invalid_gukjin/);}
    const forged=structuredClone(g.actions);forged.find(a=>a.type==='play'&&a.gukjin===null).gukjin='pi';await assert.rejects(verifyRound(round,forged),/invalid_gukjin/);
    cases++;
  }
  assert.equal(exercised,true);
}

// A pending online choice belongs only to the capturer and shares that turn's clock.
let room={status:'active',seed:'11'.repeat(32),start_gold:[5000,5000],first:0,carry:1,actions:[]};
let pending;
for(let i=0;i<150;i++){
  const {game:g,prompt:pr}=await replayOnline(room);assert.ok(pr);
  if(pr.type==='gukjin'){pending={room:structuredClone(room),pr};break;}
  const command=pr.type==='choose'?{type:'choose',index:pr.indices[0]}:pr.type==='chongtong'?{type:'chongtong',decision:'continue'}:pr.type==='gostop'?{type:'gostop',decision:'go'}:{type:'play',card:g.hand[pr.p][0]?.id??null};
  const next=await advanceOnline(room,pr.p,command);if((await replayOnline({...room,actions:next.actions})).prompt?.type==='gukjin')assert.equal(next.reset_clock,false);
  room={...room,actions:next.actions};
}
assert.ok(pending,'online fixture captures gukjin');
const {pr}=pending;
assert.equal((await onlineView(room,1-pr.p)).game.prompt.type,'waiting');
await assert.rejects(advanceOnline(room,1-pr.p,{type:'gukjin',choice:'pi'}),/not_your_turn/);
await assert.rejects(advanceOnline(room,pr.p,{type:'gukjin',choice:'both'}),/invalid_gukjin/);
for(const choice of ['yul','pi']){
  const next=await advanceOnline(room,pr.p,{type:'gukjin',choice});
  const replay=await replayOnline({...room,actions:next.actions});
  assert.equal(replay.game.caps[pr.p].find(c=>c.id===32).asPi,choice==='pi');
}
const automatic=await automaticOnline(room);assert.ok(['yul','pi'].includes(automatic.actions.at(-1).gukjin));
assert.notEqual((await replayOnline({...room,actions:automatic.actions})).prompt?.type,'gukjin');
const legacy=structuredClone(room);for(const action of legacy.actions)delete action.gukjin;
assert.notEqual((await replayOnline(legacy)).prompt?.type,'gukjin','older recorded actions remain playable');
// Sessions opened before this release still settle with the frozen v3 rules.
const legacyEngine=await import('../supabase/functions/matgo/engine-v3.mjs');
let oldGame;oldGame=new legacyEngine.Game({event:async()=>{},choose:async(p,ids)=>legacyEngine.aiChoose(oldGame,p,ids),goStop:async(p,s)=>p?legacyEngine.aiGoStop(oldGame,p,s):'stop'});
oldGame.random=seededRandom(1);oldGame.deal();
while(!oldGame.over){
  const pending=oldGame.pendingChongtong();if(pending){await oldGame.declareChongtong(pending.p,pending.p?'win':'continue');continue;}
  const p=oldGame.turn,c=p?legacyEngine.aiChooseCard(oldGame,p):oldGame.hand[p][0]||null;
  const same=c?oldGame.hand[p].filter(x=>x.m===c.m):[],ms=c?oldGame.matches(c.m):[];
  const bomb=same.length>=3&&ms.length===1&&ms[0][0].length===1?same.filter(x=>x!==c).slice(0,2):null;
  if(same.length>=3&&!bomb&&!oldGame.shake[p])oldGame.shakeCards(p,c.m);
  await oldGame.play(p,c,bomb);
}
const {createHandler}=await import('../supabase/functions/matgo/handler.mjs');let savedGold;
const handler=createHandler({env:n=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'server',SUPABASE_ANON_KEY:'public'})[n],fetchImpl:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001'}));
  const b=JSON.parse(options.body);
  if(b.p_action==='round')return new Response(JSON.stringify({round:{seed:1,gold:5000,first:0,carry:1}}));
  savedGold=b.p_gold;return new Response(JSON.stringify({ok:true,gold:savedGold}));
}});
const oldResult=await handler(new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({action:'settle',round_id:'00000000-0000-4000-8000-000000000001',rules_version:3,actions:oldGame.actions})}));
assert.equal(oldResult.status,200);assert.equal(savedGold,oldGame.bank[0]);
console.log(`PASS: ${cases} gukjin capture/score/transcript cases; private online choice, shared deadline, auto-selection and old-room replay`);
