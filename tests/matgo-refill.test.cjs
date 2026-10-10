const assert=require('node:assert/strict');
const {fixture,A,B,MINOR}=require('./matgo-online-fixture.cjs');
(async()=>{
 const f=await fixture({stakes:true,refill:true}),{db,call}=f;
 const status=()=>call(A,{action:'status'});
 const refill=(paid=false,request_id=crypto.randomUUID(),actor=A)=>call(actor,{action:'refill',paid,request_id});
 async function reset(gold,free=0,coins=20){
  await db.query("update ojjuda_matgo_internal.wallets set gold=$1,free_used=$2,refill_day=(now() at time zone 'Asia/Seoul')::date,round_id=null,round_seed=null,online_room=null,next_first=1,next_carry=2 where user_id=$3",[gold,free,A]);
  await db.query('update public.user_private set coins=$1 where user_id=$2',[coins,A]);
 }
 try{
  await status();await call(B,{action:'status'});
  for(const paid of [false,true])for(const gold of [0,1,500,700,999]){
   await reset(gold,paid?2:0);const id=crypto.randomUUID(),result=await refill(paid,id);
   assert.equal(result.gold,gold+5000);assert.equal(result.coins,paid?15:20);assert.equal(result.free_left,paid?0:1);
   const duplicate=await refill(paid,id);assert.equal(duplicate.gold,gold+5000);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.coins,result.coins);
   const saved=(await db.query('select next_first,next_carry from ojjuda_matgo_internal.wallets where user_id=$1',[A])).rows[0];
   if(gold>0)assert.deepEqual(saved,{next_first:1,next_carry:2},'partial top-up preserves next-round state');
   assert.equal((await refill(paid)).error,'gold_not_empty','different retry IDs cannot refill a funded wallet twice');
  }
  for(const gold of [1000,1001,5000])for(const paid of [false,true]){
   await reset(gold,paid?2:0);assert.equal((await refill(paid)).error,'gold_not_empty');
   assert.equal((await status()).gold,gold);assert.equal((await status()).coins,20);
  }
  await reset(999,2,4);assert.equal((await refill(true)).error,'insufficient_zzu');assert.equal((await status()).gold,999);assert.equal((await status()).coins,4);
  await reset(700,2);assert.equal((await refill(false)).error,'paid_confirmation_required');assert.equal((await status()).gold,700);
  const id=crypto.randomUUID();const results=await Promise.all([refill(true,id),refill(true,id)]);assert.ok(results.every(x=>x.gold===5700));assert.equal((await status()).coins,15);
  await reset(999);const round=await call(A,{action:'start',stakes_version:1});
  assert.equal((await refill()).error,'round_in_progress');assert.equal((await status()).round.id,round.round.id,'a top-up cannot discard an active solo replay');
  await reset(700);const room=await call(A,{action:'online_create',stakes_version:1});
  assert.equal((await refill()).error,'match_in_progress');await call(A,{action:'online_leave',room_id:room.room.id});
  assert.equal((await refill()).gold,5700,'the shared wallet also refills from the multiplayer lobby');
  assert.equal((await refill(false,crypto.randomUUID(),MINOR)).error,'adult_required');
  assert.equal((await call(B,{action:'status'})).gold,5000,'only the caller wallet changes');
  console.log('PASS: 0/1/500/700/999G add exactly 5000G, 1000G boundary, free/paid/idempotent charges, insufficient funds, preserved round state and solo/online guards');
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
