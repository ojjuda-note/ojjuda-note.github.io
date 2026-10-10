const assert=require('node:assert/strict');
const {fixture,A,B,MINOR}=require('./matgo-online-fixture.cjs');
(async()=>{
 const f=await fixture({stakes:true}),{db,call}=f;
 const tiers=[[100000,100],[200000,200],[300000,500],[400000,2000],[500000,5000],[600000,10000],[700000,20000],[800000,50000],[900000,100000]];
 const status=(actor=A)=>call(actor,{action:'status'});
 const start=(actor=A)=>call(actor,{action:'start',stakes_version:1});
 const choose=(rate,accept=true,actor=A)=>call(actor,{action:'stake',rate,accept,user_id:B,gold:99999999});
 const balance=(gold,actor=A)=>db.query('update ojjuda_matgo_internal.wallets set gold=$1 where user_id=$2',[gold,actor]);
 const settle=(round,gold,actor=A)=>db.query("select public.matgo_wallet_service($1,'settle',null,false,$2,$3,0::smallint,1) value",[actor,round.id,gold]);
 try{
  for(const role of ['anon','authenticated']){
   for(const signature of ['public.matgo_stake_service(uuid,integer,boolean)','ojjuda_matgo_internal.stake_service(uuid,integer,boolean)'])
    assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok',[role,signature])).rows[0].ok,false);
  }
  assert.equal((await choose(200,true,MINOR)).error,'adult_required');
  assert.equal((await call(A,{action:'stake',rate:200})).status,400,'consent must be explicit');
  assert.equal((await choose(1000)).status,400,'removed 1000G tier is rejected');
  await status();await status(B);
  await db.query("update public.user_private set banned_until=now()+interval '1 day' where user_id=$1",[B]);
  assert.equal((await choose(200,true,B)).error,'banned');
  await db.query('update public.user_private set banned_until=null where user_id=$1',[B]);
  for(let i=1;i<tiers.length;i++){
   const [gold,rate]=tiers[i];
   for(const [amount,want] of [[gold-1,tiers[i-1][1]],[gold,rate],[gold+1,rate]])
    assert.equal((await db.query('select ojjuda_matgo_internal.stake_for_gold($1) rate',[amount])).rows[0].rate,want);
  }
  assert.equal((await db.query('select ojjuda_matgo_internal.stake_for_gold(9000000000) rate')).rows[0].rate,100000);
  await balance(200000);
  let state=await status();assert.deepEqual(state.stake_offer,{rate:200,threshold:200000});assert.equal(state.stake_rate,100);
  assert.equal((await start()).error,'stake_offer_pending','no undisclosed automatic raise');
  assert.equal((await choose(500)).error,'stake_offer_changed','server balance limits the offer');
  assert.equal((await choose(200,false)).stake_rate,100);
  assert.equal((await choose(200,false)).stake_offer,null,'decline retry is idempotent');
  state=await start();assert.equal(state.round.rate,100);await settle(state.round,300000);
  assert.equal((await status()).stake_offer.rate,500,'declined tier does not block the next offer');
  assert.equal((await choose(500)).stake_rate,500);
  assert.equal((await status(B)).stake_rate,100,'spoofed actor is ignored');
  const starts=await Promise.all([start(),start()]);state=starts[0];assert.equal(starts[1].round.id,state.round.id);assert.equal(state.round.rate,500);
  assert.equal((await call(A,{action:'start'})).error,'client_update_required');
  await balance(400000);assert.equal((await choose(2000)).error,'round_in_progress');
  assert.equal((await start()).round.rate,500,'resuming cannot change the round rate');
  assert.equal((await call(A,{action:'settle',round_id:state.round.id,rules_version:5,actions:[]})).error,'client_update_required');
  await settle(state.round,400000);await choose(2000);
  await balance(125000);assert.equal((await status()).stake_rate,2000,'balance falling below the threshold keeps the chosen rate');
  state=await start();assert.equal(state.round.rate,2000);
  await settle(state.round,0);assert.equal((await status()).stake_rate,100);
  await settle(state.round,999999);assert.equal((await status()).gold,0,'duplicate settlement cannot restore gold or a stake');
  assert.equal((await call(A,{action:'refill',request_id:crypto.randomUUID(),paid:false})).stake_rate,100);
  assert.equal((await status()).gold,5000);
  await balance(200000);assert.equal((await status()).stake_offer.rate,200,'bankruptcy resets remembered offers');
  // Replay complete solo rounds at every rate, then settle using server snapshots.
  const {Game,seededRandom,aiChooseCard,aiChoose,aiGoStop,aiChooseGukjin}=await import('../games/matgo-engine.mjs');
  const {verifyRound}=await import('../supabase/functions/matgo/verify.mjs');
  let rounds=0;
  for(const [gold,rate] of tiers){
   await db.query('update ojjuda_matgo_internal.wallets set gold=$1,stake_rate=100,stake_seen=100 where user_id=$2',[gold,A]);
   if(rate>100)await choose(rate);
   for(let seed=1;seed<=12;seed++){
    await balance(gold);state=await start();assert.equal(state.status,200,JSON.stringify(state));
    await db.query('update ojjuda_matgo_internal.wallets set round_seed=$1 where user_id=$2',[seed,A]);
    const round={...state.round,seed};let game;
    game=new Game({event:async()=>{},choose:async(p,ids)=>aiChoose(game,p,ids),chooseGukjin:async p=>aiChooseGukjin(game,p),goStop:async(p,s)=>p===1?aiGoStop(game,p,s):'stop'});
    game.bank=[gold,5000];game.rate=round.rate;game.first=round.first;game.carry=round.carry;game.random=seededRandom(seed);game.deal();
    while(!game.over){
     const pending=game.pendingChongtong();if(pending){await game.declareChongtong(pending.p,pending.p===1?'win':'continue');continue;}
     const p=game.turn,card=p===1?aiChooseCard(game,p):game.hand[p][0]||null;
     const same=card?game.hand[p].filter(c=>c.m===card.m):[],matches=card?game.matches(card.m):[];
     const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
     if(same.length>=3&&!bomb&&!game.shake[p])game.shakeCards(p,card.m);
     await game.play(p,card,bomb);
    }
    assert.equal((await verifyRound(round,game.actions)).gold,game.bank[0]);
    const body={action:'settle',round_id:round.id,rules_version:8,actions:game.actions,rate:1,gold:999999};
    const result=await call(A,body);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.gold,game.bank[0]);
    assert.equal((await call(A,body)).gold,result.gold);rounds++;
    // Isolate the next replay from bankruptcy/offer transitions tested above.
    await db.query('update ojjuda_matgo_internal.wallets set gold=$1,stake_rate=$2,stake_seen=$2 where user_id=$3',[gold,rate,A]);
   }
  }
  // A large solo choice never affects a human room, even with forged rate fields.
  await balance(100, B);
  const created=await call(A,{action:'online_create',rate:100000});
  const joined=await call(B,{action:'online_join',code:created.room.code,rate:100000});assert.equal(joined.status,200);
  assert.equal((await choose(100000,false)).error,'match_in_progress');
  const {replayOnline,automaticOnline}=await import('../supabase/functions/matgo/online.mjs');
  const raw=(await db.query('select * from ojjuda_matgo_internal.rooms where id=$1',[created.room.id])).rows[0];
  let simulated={...raw,rate:100000};assert.equal((await replayOnline(simulated)).game.rate,100);
  for(let turn=0;turn<160&&!simulated.result;turn++)simulated={...simulated,...await automaticOnline(simulated)};
  assert.ok(simulated.result);if(simulated.result.total)assert.equal(simulated.result.money,simulated.result.total*100);
  await db.query('update ojjuda_matgo_internal.wallets set stake_rate=100000,stake_seen=100000 where user_id=$1',[B]);
  const next={actions:[],result:{goldDelta:[1000,-1000]},first:0,carry:1};
  await db.query('select public.matgo_online_service($1,$2,$3,null,null,$4,$5,$6)',[A,'commit',raw.id,raw.version,crypto.randomUUID(),next]);
  assert.equal((await status(B)).gold,0);assert.equal((await status(B)).stake_rate,100,'PvP bankruptcy also resets the saved solo stake');
  assert.equal((await status()).stake_rate,100000,'joining a human room does not lower saved solo stakes');
  console.log(`PASS: all stake thresholds/consent, persistence, frozen rounds, old-client guard, ${rounds} authoritative replays, idempotency, zero/refill reset, actor/age/ban checks and fixed 100G PvP`);
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
