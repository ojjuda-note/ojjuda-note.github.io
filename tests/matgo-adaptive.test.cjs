const assert=require('node:assert/strict');
const {fixture,A,B,MINOR}=require('./matgo-online-fixture.cjs');
(async()=>{
 const f=await fixture({adaptive:true}),{db,call}=f;
 const current=await import('../games/matgo-engine.mjs');
 const legacy=await import('../supabase/functions/matgo/engine-v10.mjs');
 const {dealSoloRound}=await import('../games/matgo-tazza.mjs');
 const {verifyRound}=await import('../supabase/functions/matgo/verify.mjs');
 const start=()=>call(A,{action:'start',rules_version:11,stakes_version:1});
 const status=()=>call(A,{action:'status'});
 const reset=async(level=1,gold=5000)=>{
  await status();await db.query('update ojjuda_matgo_internal.wallets set round_id=null,round_seed=null,round_cpu_level=null,last_round=null,gold=$2,stake_rate=100,stake_seen=100,cpu_level=$3,cpu_win_streak=0,cpu_loss_streak=0,next_first=0,next_carry=1 where user_id=$1',[A,gold,level]);
 };
 // This RPC is service-only; its policy is tested separately from Edge replay below.
 const record=async(round,outcome,gold=5000)=>(await db.query('select public.matgo_ranked_settle($1,$2,$3,0::smallint,1,$4) s',[A,round.id,gold,outcome])).rows[0].s;
 async function play(round,engine=current,randomHuman=false){
  const {Game,seededRandom,aiChooseCard,aiChoose,aiGoStop,aiChooseGukjin}=engine;const human=seededRandom(round.seed^0x518cc1b7);let g,result;
  g=new Game({event:async(type,data)=>{if(['end','nagari'].includes(type))result={type,...data};},choose:async(p,indices)=>aiChoose(g,p,indices),chooseGukjin:async p=>aiChooseGukjin(g,p),goStop:async(p,pts)=>aiGoStop(g,p,pts)});
  Object.assign(g,{bank:[round.gold,5000],rate:round.rate??100,first:round.first,carry:round.carry,roundCpuLevel:round.cpu_level});
  dealSoloRound(g,round,{Game,seededRandom});
  for(let i=0;i<160&&!g.over;i++){
   const pending=g.pendingChongtong();if(pending){await g.declareChongtong(pending.p,'win');continue;}
   const p=g.turn,rng=g.random;if(p===0)g.random=()=>.25;const card=p===0&&randomHuman?(g.hand[p][Math.floor(human()*g.hand[p].length)]??null):aiChooseCard(g,p);g.random=rng;const same=card?g.hand[p].filter(c=>c.m===card.m):[],matches=card?g.matches(card.m):[];
   const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
   if(same.length>=3&&!bomb&&!g.shake[p])g.shakeCards(p,card.m);
   await g.play(p,card,bomb);
  }
  assert.ok(g.over);return {g,outcome:result.type==='nagari'?'draw':result.winner===0?'win':'loss'};
 }
 try{
  await reset();
  assert.equal((await call(MINOR,{action:'start',rules_version:11,stakes_version:1})).error,'adult_required');
  assert.equal((await call(A,{action:'start',rules_version:10,stakes_version:1})).error,'client_update_required');
  assert.equal((await status()).round,null,'old client is rejected before creating a round');
  assert.equal((await call(A,{action:'tazza_start',rules_version:10,stakes_version:1,request_id:crypto.randomUUID()})).error,'client_update_required');
  assert.equal((await status()).coins,20,'old paid request cannot charge');
  for(const [level,outcome,count,expected] of [[1,'win',5,2],[1,'loss',3,1],[5,'win',5,6],[5,'loss',3,4],[10,'win',5,10]]){
   await reset(level);
   for(let i=0;i<count;i++){
    const s=await start();assert.equal(s.round.cpu_level,level);assert.equal(s.round.rules_version,11);
    const result=await record(s.round,outcome);
    assert.equal(result.cpu_level,i===count-1?expected:level,'only a complete streak changes the level');
    assert.equal(result.cpu_win_streak,outcome==='win'&&i<count-1?i+1:0);
    assert.equal(result.cpu_loss_streak,outcome==='loss'&&i<count-1?i+1:0);
   }
   assert.equal((await start()).round.cpu_level,expected,'next round uses the evaluated level');
  }
  await reset(5);
  for(const outcome of ['win','win','win','win','loss','loss','win'])await record((await start()).round,outcome);
  let interrupted=await status();assert.equal(interrupted.cpu_level,5);assert.equal(interrupted.cpu_win_streak,1);assert.equal(interrupted.cpu_loss_streak,0,'opposite result resets the streak');
  // Excluded rounds do not break an ordinary-game streak.
  await record((await start()).round,'draw');assert.equal((await status()).cpu_win_streak,1);
  await record((await call(A,{action:'tazza_start',rules_version:11,stakes_version:1,request_id:crypto.randomUUID()})).round,'loss');
  assert.equal((await status()).cpu_win_streak,1);assert.equal((await status()).cpu_loss_streak,0);
  await reset(3);
  let s=await start();const first=s.round.id;
  await db.query('update ojjuda_matgo_internal.wallets set cpu_level=8 where user_id=$1',[A]);
  for(let i=0;i<3;i++){s=await start();assert.equal(s.round.id,first);assert.equal(s.round.cpu_level,3);assert.equal(s.cpu_win_streak,0);}
  await record(s.round,'draw');assert.equal((await status()).cpu_win_streak,0,'draw is excluded');
  assert.equal((await start()).round.cpu_level,8);
  // Paid rounds are excluded by their server receipt, regardless of reported gold or mode.
  await reset();await db.query('update public.user_private set coins=100 where user_id=$1',[A]);
  for(const mode of ['tan','peek','ssang','gwang','godori','cheong','hong','cho']){
   s=await call(A,{action:'tazza_start',rules_version:11,stakes_version:1,request_id:crypto.randomUUID()});assert.equal(s.status,200);
   await db.query("update ojjuda_matgo_internal.fun_purchases set effect=$3 where user_id=$1 and reference_id=$2 and kind='tazza'",[A,s.round.id,mode]);
   const result=await record(s.round,'win');assert.equal(result.cpu_win_streak,0);assert.equal(result.cpu_level,1);
  }
  s=await call(A,{action:'tazza_start',rules_version:11,stakes_version:1,request_id:crypto.randomUUID()});
  const fresh=await start();assert.notEqual(fresh.round.id,s.round.id);assert.equal(fresh.round.tazza_mode,null);assert.equal(fresh.cpu_win_streak,0,'abandoning a paid round does not count');
  // Verify full transcripts at all levels with identical gold: account snapshot is authoritative.
  for(let level=1;level<=10;level++){
   const round={seed:43+level,gold:900001,first:0,carry:1,rate:100,cpu_level:level};
   const played=await play(round);assert.equal(played.g.cpuLevel,level);
   const verified=await verifyRound(round,played.g.actions);assert.equal(verified.gold,played.g.bank[0]);assert.equal(verified.outcome,played.outcome);
  }
  // Real Edge replay ignores client-supplied level, result, actor and gold.
  const outcomes=new Map();
  for(const seed of [1,4]){
   const played=await play({seed,gold:5000,first:0,carry:1,rate:100,cpu_level:1},current,true);if(!outcomes.has(played.outcome))outcomes.set(played.outcome,{seed,...played});
  }
  assert.deepEqual([...outcomes.keys()],['loss','win']);
  for(const [outcome,played] of outcomes){
   await reset();s=await start();await db.query('update ojjuda_matgo_internal.wallets set round_seed=$2 where user_id=$1',[A,played.seed]);
   const body={action:'settle',rules_version:11,round_id:s.round.id,actions:played.g.actions,cpu_level:10,outcome:'win',gold:999999999,user_id:B};
   assert.equal((await call(A,{...body,rules_version:10})).error,'client_update_required');
   const bad=structuredClone(body);bad.actions.find(a=>a.type==='play').card=999;
   assert.equal((await call(A,bad)).error,'invalid_round');assert.equal((await status()).cpu_win_streak,0);
   const results=await Promise.all([call(A,body),call(A,body)]);for(const result of results)assert.equal(result.status,200);
   s=await status();assert.equal(s.gold,played.g.bank[0]);assert.equal(s.cpu_loss_streak,outcome==='loss'?1:0);assert.equal(s.cpu_win_streak,outcome==='win'?1:0);
   assert.equal(f.calls.filter(p=>p.p_outcome).at(-1).p_outcome,outcome);
   await call(A,body);assert.equal((await status()).cpu_win_streak,s.cpu_win_streak,'retries do not count twice');assert.equal((await status()).cpu_loss_streak,s.cpu_loss_streak);
  }
  // Existing v10 rounds retain their old strategy and can finish after the migration.
  await reset(1,400001);s=await start();await db.query('update ojjuda_matgo_internal.wallets set round_cpu_level=null,round_seed=10,round_rate=100 where user_id=$1',[A]);
  s=await call(A,{action:'start',rules_version:10,stakes_version:1});assert.equal(s.status,200);assert.equal(s.round.cpu_level,null);
  const old=await play(s.round,legacy);assert.equal(old.g.cpuLevel,5);
  const completed=await call(A,{action:'settle',rules_version:10,round_id:s.round.id,actions:old.g.actions});assert.equal(completed.status,200);assert.equal(completed.cpu_win_streak,0);
  assert.equal((await start()).round.cpu_level,Math.max(5,Math.min(10,1+Math.floor(completed.gold/100000))),'a new round enforces the gold floor after a legacy round');
  // Exact stake boundaries, no offers, and old decline memory cannot suppress a raise.
  const brackets=[[99999,1,100],[100000,2,200],[100001,2,200],[199999,2,200],[200000,3,500],[299999,3,500],[300000,4,2000],[400000,5,5000],[500000,6,10000],[600000,7,20000],[700000,8,50000],[800000,9,100000],[900000,10,100000],[9007199254740991,10,100000]];
  for(const [gold,level,rate] of brackets){
   await reset(1,gold);await db.query('update ojjuda_matgo_internal.wallets set stake_seen=100000 where user_id=$1',[A]);
   s=await start();assert.equal(s.stake_offer,null);assert.equal(s.round.rate,rate);assert.equal(s.round.cpu_level,level,'exact gold threshold sets the minimum level');
  }
  // Three losses cannot go below the current balance floor at any bracket.
  for(const [gold,level] of [[100000,2],[200000,3],[300000,4],[400000,5],[500000,6],[600000,7],[700000,8],[800000,9],[900000,10]]){
   await reset(1,gold);
   for(let i=0;i<3;i++){s=await start();assert.equal(s.round.cpu_level,level);await record(s.round,'loss',gold);}
   s=await status();assert.equal(s.cpu_level,level);assert.equal(s.cpu_loss_streak,0);
  }
  // The fifth win and a gold threshold in one settlement do not promote twice.
  await reset(1,99999);
  for(let i=0;i<4;i++)await record((await start()).round,'win',99999);
  s=await record((await start()).round,'win',100000);assert.equal(s.cpu_level,2);assert.equal(s.cpu_win_streak,0);
  // A lower balance permits demotion only after the required losing streak.
  await record((await start()).round,'loss',99999);assert.equal((await status()).cpu_level,2);
  await record((await start()).round,'loss',99998);s=await record((await start()).round,'loss',99997);assert.equal(s.cpu_level,1);
  // Paid profit still raises the gold floor without contributing to streaks.
  await reset();await record((await start()).round,'win');
  s=await call(A,{action:'tazza_start',rules_version:11,stakes_version:1,request_id:crypto.randomUUID()});
  s=await record(s.round,'win',200000);assert.equal(s.cpu_level,3);assert.equal(s.cpu_win_streak,1);
  // Active snapshots issued before the new floor remain valid and unchanged.
  await reset(1,99999);s=await start();
  await db.query('update ojjuda_matgo_internal.wallets set gold=200000 where user_id=$1',[A]);
  const live=await start();assert.equal(live.round.id,s.round.id);assert.equal(live.round.cpu_level,1);assert.equal(live.round.rate,100);
  await record(live.round,'draw',200000);s=await start();assert.equal(s.round.cpu_level,3);assert.equal(s.round.rate,500);
  await reset(8);s=await start();assert.equal(s.round.cpu_level,8);assert.equal(s.round.rate,100);
  const raised=await record(s.round,'win',400000);assert.equal(raised.stake_rate,5000);s=await start();assert.equal(s.round.rate,5000);
  await db.query('update ojjuda_matgo_internal.wallets set gold=900000 where user_id=$1',[A]);
  assert.equal((await status()).round.rate,5000,'ongoing stake stays fixed');
  s=await record(s.round,'loss',10000);assert.equal(s.stake_rate,5000,'lower balance retains the attained stake');
  s=await start();await record(s.round,'loss',0);assert.equal((await status()).stake_rate,100);
  await call(A,{action:'refill',request_id:crypto.randomUUID(),paid:false});s=await start();assert.equal(s.round.rate,100);assert.equal(s.round.cpu_level,8,'refill does not reset difficulty');
  // Online uses automatic per-player caps, with its own fixed rate and no solo statistics.
  await reset(4,400000);await call(B,{action:'status'});await db.query('update ojjuda_matgo_internal.wallets set gold=300000 where user_id=$1',[B]);
  let room=await call(A,{action:'online_create',stakes_version:1});assert.equal(room.status,200);
  const joined=await call(B,{action:'online_join',code:room.room.code,stakes_version:1});assert.equal(joined.status,200);assert.equal(joined.room.rate,2000);
  await db.query('update ojjuda_matgo_internal.wallets set gold=900000 where user_id in($1,$2)',[A,B]);
  room=await call(A,{action:'online_read',room_id:room.room.id,stakes_version:1});assert.equal(room.room.rate,2000);assert.equal((await status()).cpu_win_streak,0);
  for(const role of ['anon','authenticated']){
   const permitted=(await db.query("select has_function_privilege($1,'public.matgo_ranked_settle(uuid,uuid,bigint,smallint,integer,text)','EXECUTE') allowed",[role])).rows[0].allowed;
   assert.equal(permitted,false,'clients cannot supply their own outcomes');
  }
  assert.equal((await db.query("select has_function_privilege('service_role','public.matgo_ranked_settle(uuid,uuid,bigint,smallint,integer,text)','EXECUTE') allowed")).rows[0].allowed,true);
  console.log('PASS: 5-win/3-loss streaks and resets, next-round snapshots, paid/draw exclusion, authoritative replay, retry/concurrency, legacy compatibility, gold minimum levels, 100,000G stake thresholds, bankruptcy/refill and online isolation');
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
