const assert=require('node:assert/strict');
const test=require('node:test');
const {fixture,ids:[A,B,C]}=require('./roulette-db.test.cjs');

for(const departure of ['leave','timeout'])test(`the remaining ready players start after an unready member ${departure}`,async()=>{
 const {db,call}=await fixture();
 try{
  const {room}=await call(A,'create',{capacity:3});
  await call(B,'join',{code:room.code});await call(C,'join',{code:room.code});
  await call(A,'ready',{code:room.code,bets:{red:100}});
  await call(B,'ready',{code:room.code,bets:{black:100}});
  assert.equal((await call(A,'read',{code:room.code})).room.status,'betting','unready C prevents a spin');
  if(departure==='leave')await call(C,'leave',{room_id:room.id});
  else await db.query("update ojjuda_roulette_internal.players set last_seen=clock_timestamp()-interval '3 minutes' where room_id=$1 and user_id=$2",[room.id,C]);
  const first=await call(A,'read',{code:room.code}),second=await call(B,'read',{code:room.code});
  assert.deepEqual(first.room.players.map(p=>p.userId).sort(),[A,B].sort());
  assert.ok(first.room.players.every(p=>p.ready));
  assert.equal(first.room.status,'spinning','all remaining players already pressed start; their existing consent must trigger one spin');
  assert.equal(first.room.spin.id,second.room.spin.id,'subsequent reads reuse the same spin');
  assert.equal((await db.query('select count(*)::int n from ojjuda_roulette_internal.rounds where room_id=$1',[room.id])).rows[0].n,1);
  assert.equal(first.wallet.gold,9900);assert.equal(second.wallet.gold,9900);
  assert.equal((await call(C,'status')).wallet.gold,10000,'a non-betting departing player is never charged');
 }finally{await db.close()}
});
