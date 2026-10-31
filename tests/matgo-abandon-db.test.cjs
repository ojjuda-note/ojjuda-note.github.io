const assert=require('node:assert/strict');
const {fixture}=require('./matgo-online-fixture.cjs');
(async()=>{
 const f=await fixture({basic:true,fresh:true}),{db,call,A,B,C,MINOR}=f;
 const start=actor=>call(actor,{action:'start',stakes_version:1,rules_version:13});
 const abandon=(actor,round)=>call(actor,{action:'abandon',round_id:round,user_id:B,gold:999999,coins:999999});
 const wallet=async actor=>(await db.query("select to_jsonb(w)-'updated_at' value from ojjuda_matgo_internal.wallets w where user_id=$1",[actor])).rows[0].value;
 const receipts=async()=>(await db.query('select to_jsonb(p) value from ojjuda_matgo_internal.fun_purchases p order by request_id')).rows;
 try{
  assert.equal((await abandon(A,'invalid')).status,400);assert.equal((await abandon('not-signed-in',crypto.randomUUID())).status,401);
  const first=await start(A);assert.equal(first.status,200);const before=await wallet(A);
  const ended=await abandon(A,first.round.id);assert.equal(ended.abandoned,true);assert.equal(ended.round,null);
  const after=await wallet(A);for(const key of ['round_id','round_seed','round_cpu_level','round_rules_version']){assert.equal(after[key],null);before[key]=null;}
  assert.deepEqual(after,before,'only unfinished round fields change; balances, last result, refills and tiers stay intact');
  assert.equal((await abandon(A,first.round.id)).abandoned,false);
  assert.equal((await call(A,{action:'settle',round_id:first.round.id,actions:[],rules_version:13})).error,'round_mismatch','old transcript cannot settle after abandonment');
  const second=await start(A);assert.notEqual(second.round.id,first.round.id);
  const secondBefore=await wallet(A);assert.equal((await abandon(A,first.round.id)).abandoned,false);assert.deepEqual(await wallet(A),secondBefore,'a late old-ID request cannot discard the new round');
  await start(B);const otherBefore=await wallet(B);assert.equal((await abandon(B,second.round.id)).abandoned,false);assert.deepEqual(await wallet(B),otherBefore,'actor cannot discard another account round');
  assert.equal((await abandon(MINOR,second.round.id)).error,'adult_required');
  await abandon(A,second.round.id);
  const paidRequest=crypto.randomUUID(),paid=await call(A,{action:'tazza_start',request_id:paidRequest,stakes_version:1,rules_version:13});
  assert.equal(paid.status,200);const purchased=await receipts(),coins=paid.coins;
  const paidEnd=await abandon(A,paid.round.id);assert.equal(paidEnd.coins,coins);assert.equal(paidEnd.gold,paid.gold);assert.deepEqual(await receipts(),purchased,'paid receipts are never refunded, erased or repeated');
  assert.equal((await call(A,{action:'tazza_start',request_id:paidRequest,stakes_version:1,rules_version:13})).error,'purchase_completed');
  assert.equal((await call(A,{action:'settle',round_id:paid.round.id,actions:[],rules_version:13})).error,'round_mismatch');
  const ordinary=await start(A);assert.equal(ordinary.round.tazza_mode,null);assert.equal(ordinary.coins,coins);
  const waiting=await call(B,{action:'online_create',stakes_version:1});await call(C,{action:'online_join',code:waiting.room.code,stakes_version:1});
  const onlineBefore=await wallet(B);assert.equal((await abandon(B,waiting.room.id)).abandoned,false);assert.deepEqual(await wallet(B),onlineBefore,'solo abandonment cannot detach an active online wallet or bypass settlement');
  for(const role of ['anon','authenticated']){
   await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query('select public.matgo_abandon_round($1,$2)',[A,ordinary.round.id]);}),/permission denied/);
   const allowed=(await db.query("select has_function_privilege($1,'ojjuda_matgo_internal.abandon_round(uuid,uuid)','execute') allowed",[role])).rows[0].allowed;assert.equal(allowed,false);
  }
  const granted=(await db.query("select has_function_privilege('service_role','public.matgo_abandon_round(uuid,uuid)','execute') allowed")).rows[0].allowed;assert.equal(granted,true);
  const service=await db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query('select public.matgo_abandon_round($1,$2) value',[A,ordinary.round.id]);});assert.equal(service.rows[0].value.abandoned,true);
  assert.ok(f.calls.filter(p=>p.p_round===ordinary.round.id).every(p=>p.p_actor===A),'Edge uses authenticated actor and forwards no forged values');
  console.log('PASS: authoritative solo abandonment, unchanged balances/refills/receipts, exact-ID retries, old settlement rejection, account/age isolation, online locks and service-only execution.');
 }finally{await f.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
