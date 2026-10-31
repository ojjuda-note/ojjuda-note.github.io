const assert=require('node:assert/strict');
const {fixture,ids:[A,B,C]}=require('./roulette-db.test.cjs');

(async()=>{
 const {db,call}=await fixture();let checked=0;
 const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checked++};
 async function fresh(users=[A,B]){
  for(const user of[A,B,C])await call(user,'leave');
  await db.query('update ojjuda_roulette_internal.wallets set gold=10000');
  await db.query("update ojjuda_roulette_internal.rooms set created_at=clock_timestamp()-interval '2 minutes'");
  const {room}=await call(users[0],'create',{capacity:Math.max(2,users.length)});
  for(const user of users.slice(1))await call(user,'join',{code:room.code});
  return room;
 }
 const expire=room=>db.query("update ojjuda_roulette_internal.rooms set betting_deadline=clock_timestamp()-interval '1 second' where id=$1 returning floor(extract(epoch from betting_deadline)*1000)::float8 stamp",[room.id]);
 const finish=room=>db.query("update ojjuda_roulette_internal.rounds set started_at=clock_timestamp()-interval '31 seconds' where room_id=$1",[room.id]);
 try{
  let room=await fresh();
  await assert.rejects(()=>call(A,'start',{code:room.code,bets:{}}),/invalid_bet/);
  equal((await call(A,'read',{code:room.code})).room.bettingDeadline,null,'an empty first start cannot open a countdown');
  const first=await call(A,'start',{code:room.code,bets:{red:100}}),deadline=first.room.bettingDeadline;
  equal(deadline-first.serverTime,30000,'first consent opens exactly 30 seconds');
  equal(first.room.status,'betting');equal(first.wallet.gold,9900);
  await call(A,'ready',{code:room.code,ready:false});
  equal((await call(B,'read',{code:room.code})).room.bettingDeadline,deadline,'cancel cannot reset or extend the countdown');
  const again=await call(A,'start',{code:room.code,bets:{red:100}});equal(again.room.bettingDeadline,deadline);
  const early=await call(B,'start',{code:room.code,bets:{black:300}});
  equal(early.room.status,'spinning','both start before 30 seconds rotates immediately');
  equal(early.room.spin.startedAt,early.serverTime);equal(early.room.bettingDeadline,null);
  equal(early.wallet.gold,9700);equal((await call(A,'read',{code:room.code})).wallet.gold,9900);
  equal((await call(B,'start',{code:room.code,bets:{black:300}})).room.spin.id,early.room.spin.id,'repeated consent cannot spin twice');

  room=await fresh([A,B,C]);
  await call(B,'bet',{code:room.code,bets:{black:300}});
  await call(A,'start',{code:room.code,bets:{red:100}});
  const cutoff=(await expire(room)).rows[0].stamp;
  // A late placement is rejected; only the already-shared draft participates.
  await assert.rejects(()=>call(B,'bet',{code:room.code,bets:{n0:500}}),/round_in_progress/);
  const timed=await call(B,'read',{code:room.code}),observer=await call(C,'read',{code:room.code});
  equal(timed.room.status,'spinning');equal(timed.room.spin.startedAt,cutoff,'late reads play from the original betting deadline');
  equal(timed.room.spin.bets,{black:300});equal(timed.wallet.gold,9700,'timeout escrows the stored draft exactly once');
  equal(observer.room.spin.id,timed.room.spin.id);equal(observer.room.spin.bets,{});equal(observer.wallet.gold,10000);
  equal(observer.room.me.stake,0,'an unbet viewer gets a zero-stake round');
  equal((await call(B,'read',{code:room.code})).wallet.gold,9700);
  equal((await call(A,'ready',{code:room.code,ready:false})).wallet.gold,9900,'cancel after cutoff cannot refund a frozen wager');
  equal((await db.query('select count(*)::int n from ojjuda_roulette_internal.entries where round_id=$1',[timed.room.spin.id])).rows[0].n,3);
  await finish(room);
  for(const user of[A,B,C])await call(user,'confirm',{code:room.code,roundId:timed.room.spin.id});
  const next=await call(A,'read',{code:room.code});equal(next.room.status,'betting');equal(next.room.bettingDeadline,null);
  equal(next.room.players.every(p=>!p.ready),true,'confirmation never auto-starts the next round');
  equal((await call(C,'status')).wallet.gold,10000);

  room=await fresh();await call(A,'start',{code:room.code,bets:{red:100}});
  await db.query("select ojjuda_roulette_internal.advance(id,betting_deadline-interval '1 millisecond') from ojjuda_roulette_internal.rooms where id=$1",[room.id]);
  equal((await db.query('select status from ojjuda_roulette_internal.rooms where id=$1',[room.id])).rows[0].status,'betting','one millisecond before cutoff remains open');
  await db.query('select ojjuda_roulette_internal.advance(id,betting_deadline) from ojjuda_roulette_internal.rooms where id=$1',[room.id]);
  equal((await db.query('select status from ojjuda_roulette_internal.rooms where id=$1',[room.id])).rows[0].status,'spinning','the exact cutoff closes betting');

  room=await fresh([A]);
  const alone=await call(A,'start',{code:room.code,bets:{red:100}});
  equal(alone.room.status,'betting','one ready participant waits for others during the full window');
  equal((await call(A,'read',{code:room.code})).room.spin,null);
  const soloCutoff=(await expire(room)).rows[0].stamp;
  const solo=await call(A,'read',{code:room.code});equal(solo.room.status,'spinning');equal(solo.room.spin.startedAt,soloCutoff);

  room=await fresh();
  await call(A,'start',{code:room.code,bets:{red:100}});
  const zeroReady=await call(B,'start',{code:room.code,bets:{}});
  equal(zeroReady.room.status,'spinning','zero-gold observers may consent to an existing window for an early start');
  equal(zeroReady.room.spin.bets,{});equal(zeroReady.wallet.gold,10000);

  room=await fresh();
  await call(A,'start',{code:room.code,bets:{red:100}});
  await call(A,'ready',{code:room.code,ready:false});await expire(room);
  const empty=await call(B,'read',{code:room.code});equal(empty.room.status,'betting');equal(empty.room.bettingDeadline,null);
  equal(empty.room.players.every(p=>!p.ready),true);
  equal((await db.query('select count(*)::int n from ojjuda_roulette_internal.rounds where room_id=$1',[room.id])).rows[0].n,0,'no bet means no empty spin');
  equal((await call(A,'status')).wallet.gold,10000);

  room=await fresh();await call(A,'start',{code:room.code,bets:{red:100}});await call(B,'bet',{code:room.code,bets:{black:500}});
  await db.query('update ojjuda_roulette_internal.wallets set gold=100 where user_id=$1',[B]);await expire(room);
  const reduced=await call(B,'read',{code:room.code});equal(reduced.room.status,'spinning');equal(reduced.room.me.stake,0);
  equal(reduced.wallet.gold,100,'an intervening balance correction cannot produce a negative wallet');equal(reduced.room.spin.bets,{});

  room=await fresh([A,B,C]);
  await call(A,'start',{code:room.code,bets:{red:100}});await call(B,'start',{code:room.code,bets:{black:100}});
  await db.query("update public.user_private set banned_until=clock_timestamp()+interval '1 day' where user_id=$1",[B]);
  await call(C,'leave',{code:room.code});
  const eligible=await call(A,'read',{code:room.code});equal(eligible.room.players.map(p=>p.userId),[A]);equal(eligible.room.status,'betting');
  equal((await db.query('select gold::int gold from ojjuda_roulette_internal.wallets where user_id=$1',[B])).rows[0].gold,10000,'revoked member is safely refunded without blocking leave/read');
  await db.query('update public.user_private set banned_until=null where user_id=$1',[B]);

  room=await fresh([A]);await call(A,'start',{code:room.code,bets:{red:100}});
  await db.query("update ojjuda_roulette_internal.rooms set betting_deadline=clock_timestamp()-interval '3 minutes' where id=$1",[room.id]);
  await db.query("update ojjuda_roulette_internal.players set last_seen=clock_timestamp()-interval '4 minutes' where room_id=$1",[room.id]);
  const returned=await call(A,'status');
  const receipt=(await db.query('select payout::int payout,abandoned,settled_at from ojjuda_roulette_internal.entries where room_id=$1',[room.id])).rows[0];
  assert.ok(receipt,'deadline is processed before stale-seat cleanup; disconnecting cannot cancel a locked wager');
  equal(returned.wallet.gold,9900+receipt.payout);equal(receipt.abandoned,true);assert.ok(receipt.settled_at);equal(returned.room,null);
  equal(returned.wallet.coins,20,'all paths preserve ZU');
  console.log(`PASS: ${checked} countdown assertions: fixed 30 seconds, early unanimity, stored-draft escrow, zero-stake viewers, solo timeout, deadline replay, duplicate protection, empty windows, revoked seats, stale disconnect settlement and ZU isolation.`);
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
