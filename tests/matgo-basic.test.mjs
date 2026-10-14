import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as E from '../games/matgo-engine.mjs';
import * as server from '../supabase/functions/matgo/engine.mjs';
import {dealSoloRound,TAZZA_MODES} from '../games/matgo-tazza.mjs';
import {verifyRound} from '../supabase/functions/matgo/verify.mjs';
import {playRound} from './matgo-opening-fixture.mjs';
const {fixture,A,B}=createRequire(import.meta.url)('./matgo-online-fixture.cjs');
const boundaries=[[0,1],[5000,1],[199999,1],[200000,1],[200001,2],[499999,2],[500000,2],[500001,3],[9007199254740991,3]];
for(const engine of [E,server]){
  for(const [gold,tier] of boundaries)assert.equal(engine.cpuTierForGold(gold),tier);
  const cards=ids=>ids.map(id=>({...engine.CARDS[id]}));
  for(let tier=1;tier<=3;tier++){
    const g=new engine.Game({});g.cpuMode='standard';g.roundCpuLevel=tier;g.bank=[5000,5000];g.random=()=>.25;g.deal();
    assert.equal(g.cpuLevel,tier,'the server snapshot overrides current balance');
    g.floor=cards([0,1]).map(c=>[c]);g.caps=[[],cards([5,9])];
    g.random=()=>{throw Error('deliberate random mistake');};
    assert.equal(engine.aiChoose(g,1,[0,1]),tier===1?0:1,'higher tiers complete a scoring combination');
    g.caps=[cards([5,9]),[]];
    assert.equal(engine.aiChoose(g,1,[0,1]),tier===3?1:0,'expert tier blocks an exposed opponent combination');
    const hidden=n=>new Proxy([],{get:(_,key)=>{if(key==='length')return n;throw Error('hidden cards read: '+String(key));}});
    g.hand=[hidden(4),cards([2,6,10,14])];g.deck=hidden(12);g.random=()=>.25;
    assert.ok(engine.aiChooseCard(g,1));
    g.pts=()=>4;g.go=[0,0];
    assert.equal(engine.aiGoStop(g,1,8),tier===3?'stop':'go','expert secures a win against an opponent close to scoring');
    // Basic is the original normal strategy, including its tie-break random stream.
    if(tier===1){
      const expected=engine.aiChooseCard(g,1);g.cpuMode='normal';
      assert.equal(engine.aiChooseCard(g,1).id,expected.id);
      assert.equal(engine.aiChoose(g,1,[0,1]),0);
    }
  }
}
for(const gold of [200000,200001,500001])for(const mode of [null,...Object.keys(TAZZA_MODES)]){
  const round={rules_version:13,seed:71,gold,first:0,carry:1,rate:100,cpu_level:E.cpuTierForGold(gold),tazza_mode:mode};
  const {g}=await playRound(E,dealSoloRound,round),result=await verifyRound(round,g.actions);
  assert.equal(g.cpuMode,'standard');assert.equal(g.cpuLevel,round.cpu_level);assert.equal(result.gold,g.bank[0]);
  const ids=[...g.hand.flat(),...g.floor.flat(),...g.caps.flat(),...g.deck].map(c=>c.id);
  assert.equal(ids.length,E.CARDS.length);assert.equal(new Set(ids).size,E.CARDS.length);
  if(mode==='tan')assert.equal(result.outcome,'win');
}
const f=await fixture({adaptive:true}),{db,call}=f;
try{
  const start=(actor=A,version=13)=>call(actor,{action:'start',rules_version:version,stakes_version:1});
  const status=(actor=A)=>call(actor,{action:'status'});
  const reset=async gold=>{
    await status();
    await db.query('update ojjuda_matgo_internal.wallets set round_id=null,round_seed=null,round_cpu_level=null,round_rules_version=null,last_round=null,gold=$2,stake_rate=100,stake_seen=100,cpu_level=9,cpu_win_streak=4,cpu_loss_streak=0,next_first=0,next_carry=1 where user_id=$1',[A,gold]);
  };
  const complete=async(gold)=>{
    const s=await status();return (await db.query("select public.matgo_wallet_service($1,'settle',null,false,$2,$3,0::smallint,1) s",[A,s.round.id,gold])).rows[0].s;
  };
  await reset(600000);let old=await start();assert.equal(old.round.rules_version,12);
  const oldPlay=await playRound(E,dealSoloRound,old.round);
  const request=crypto.randomUUID();const paid=await call(B,{action:'tazza_start',rules_version:13,stakes_version:1,request_id:request});
  const paidPlay=await playRound(E,dealSoloRound,paid.round);
  const dir=new URL('../supabase/migrations/',import.meta.url),file=fs.readdirSync(dir).find(n=>n.endsWith('_matgo_basic_difficulty.sql'));
  await db.exec(fs.readFileSync(new URL(file,dir),'utf8'));
  const resumed=await start(A,12);assert.deepEqual(resumed.round,old.round);assert.equal(resumed.stake_rate,old.stake_rate);
  const retry=await call(B,{action:'tazza_start',rules_version:12,stakes_version:1,request_id:request});
  assert.deepEqual(retry.round,paid.round);assert.equal(retry.coins,paid.coins,'old paid retry cannot charge twice');
  for(const [actor,s,played] of [[A,old,oldPlay],[B,paid,paidPlay]]){
    const done=await call(actor,{action:'settle',rules_version:12,round_id:s.round.id,actions:played.g.actions});
    assert.equal(done.status,200,JSON.stringify(done));assert.equal(done.gold,played.g.bank[0]);
    assert.equal(done.cpu_level,E.cpuTierForGold(done.gold));assert.equal(done.cpu_win_streak,0);assert.equal(done.cpu_loss_streak,0);
  }
  assert.equal((await start(A,12)).error,'client_update_required');
  assert.equal((await status()).round,null,'an old client cannot start another legacy round');
  for(const [gold,tier] of boundaries){
    const sql=(await db.query('select ojjuda_matgo_internal.cpu_tier_for_gold($1) tier',[gold])).rows[0].tier;
    assert.equal(sql,tier);
    if(!gold)continue;
    await reset(gold);const s=await start();assert.equal(s.status,200,JSON.stringify(s));
    assert.equal(s.round.cpu_level,tier);assert.equal(s.round.rules_version,13);assert.equal(s.cpu_win_streak,0);assert.equal(s.cpu_loss_streak,0);
  }
  // Balance changes never change a running round; the next round re-evaluates gold.
  await reset(200000);let s=await start();
  await db.query('update ojjuda_matgo_internal.wallets set gold=500001 where user_id=$1',[A]);
  let kept=await start();assert.equal(kept.round.id,s.round.id);assert.equal(kept.round.cpu_level,1);assert.equal(kept.round.rate,500);
  await complete(500001);s=await start();assert.equal(s.round.cpu_level,3);assert.equal(s.round.rate,3000);
  await complete(125000);s=await start();assert.equal(s.round.cpu_level,1);assert.equal(s.round.rate,3000,'stakes retain their attained value');
  await complete(0);assert.equal((await status()).stake_rate,100);
  await call(A,{action:'refill',request_id:crypto.randomUUID(),paid:false});s=await start();assert.equal(s.round.cpu_level,1);assert.equal(s.round.rate,100);
  // Authoritative replay chooses the tier and gold, and never calls the old ranked RPC.
  for(const gold of [200000,200001,500001]){
    await reset(gold);s=await start();const played=await playRound(E,dealSoloRound,s.round);
    const body={action:'settle',rules_version:13,round_id:s.round.id,actions:played.g.actions,cpu_level:10,cpuMode:'normal',gold:999999999,outcome:'win'};
    assert.equal((await call(A,{...body,rules_version:12})).error,'client_update_required');
    const before=f.calls.length;const done=await call(A,body);
    assert.equal(done.status,200,JSON.stringify(done));assert.equal(done.gold,played.g.bank[0]);
    assert.equal(f.calls.slice(before).some(c=>Object.hasOwn(c,'p_outcome')),false);
    assert.equal(done.cpu_win_streak,0);assert.equal(done.cpu_loss_streak,0);
    assert.equal((await call(A,body)).gold,done.gold,'settlement retries are idempotent');
  }
  for(const role of ['anon','authenticated']){
    assert.equal((await db.query("select has_function_privilege($1,'ojjuda_matgo_internal.cpu_tier_for_gold(bigint)','EXECUTE') allowed",[role])).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege($1,'ojjuda_matgo_internal.wallet_service_v1(uuid,text,uuid,boolean,uuid,bigint,smallint,integer)','EXECUTE') allowed",[role])).rows[0].allowed,false);
  }
  console.log('PASS: strict gold tiers, basic strategy without deliberate mistakes, combo/blocking expert policy, hidden-card isolation, all paid modes, server replay, legacy migration/resume, no streak progression, saved stakes and bankruptcy/refill');
}finally{await f.close();}
