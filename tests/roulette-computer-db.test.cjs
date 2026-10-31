const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,ids:[A,B,C]}=require('./roulette-db.test.cjs');

(async()=>{
 const {db,call}=await fixture();let checks=0;
 const equal=(a,b,message)=>{assert.deepEqual(a,b,message);checks++};
 const bot=room=>room.players.find(p=>p.computer===true);
 try{
  const migrations=path.join(__dirname,'../supabase/migrations');
  await db.exec(fs.readFileSync(path.join(migrations,fs.readdirSync(migrations).find(n=>n.endsWith('_roulette_computer_mode.sql'))),'utf8'));
  const accountsBefore=(await db.query('select count(*)::int n from auth.users')).rows[0].n;
  await assert.rejects(()=>call(A,'create',{mode:'fake'}),/invalid_request/);
  let response=await call(A,'create',{mode:'solo',capacity:4,request_id:'computer-one',computer_bets:{n0:50000},number:0});
  let room=response.room;const id=room.id,code=room.code,computer=bot(room);
  equal(room.mode,'solo');equal(room.capacity,2);equal(room.players.length,2);
  equal(room.players.filter(p=>p.computer===false).map(p=>p.userId),[A]);
  equal(computer.userId,'computer');equal(computer.name,'컴퓨터');equal(computer.ready,true);equal(computer.confirmed,true);
  equal(room.bettingDeadline,null);equal(response.wallet.gold,10000);equal(response.wallet.coins,20);
  assert.ok(computer.stake>=300&&computer.stake<=1600,'computer bets come from the bounded server strategy');
  equal((await db.query('select ojjuda_roulette_internal.bet_total($1)::int amount',[computer.bets])).rows[0].amount,computer.stake);
  equal((await call(A,'create',{mode:'solo',request_id:'computer-one'})).room.id,id,'create retry keeps one private game');
  equal(bot((await call(A,'read',{code,computer_bets:{n0:50000}})).room).bets,computer.bets,'client-supplied bot moves have no authority');
  equal((await call(B,'list')).rooms.some(r=>r.id===id),false,'solo rooms are absent from the online lobby');
  await assert.rejects(()=>call(B,'join',{code}),/room_not_found/);
  await assert.rejects(()=>call(B,'read',{code}),/room_not_found/);
  await assert.rejects(()=>call(A,'join',{code}),/room_not_found/,'room codes cannot turn a private computer game into multiplayer');
  equal((await db.query('select count(*)::int n from ojjuda_roulette_internal.players where room_id=$1',[id])).rows[0].n,1,'computer has no real member row');
  equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,accountsBefore,'no fake accounts');
  equal((await db.query("select has_function_privilege('authenticated','ojjuda_roulette_internal.new_computer_bets()','execute') allowed")).rows[0].allowed,false);
  await assert.rejects(()=>call(A,'start',{code,bets:{}}),/invalid_bet/);

  // Cover every number: the actual server result always pays 3,564 G after fee.
  const bets=Object.fromEntries(Array.from({length:37},(_,n)=>['n'+n,100]));
  await call(A,'bet',{code,bets});
  equal(bot((await call(A,'read',{code})).room).bets,computer.bets,'the bot cannot peek at a human edit and change its draft');
  const started=await call(A,'ready',{code,bets,ready:true});room=started.room;
  equal(room.status,'spinning','computer mode starts immediately without a 30-second wait');
  equal(room.spin.startedAt,started.serverTime);equal(room.bettingDeadline,null);equal(started.wallet.gold,6300);
  equal(bot(room).bets,computer.bets);equal(bot(room).result,null,'computer winnings remain hidden until the ball stops');
  equal((await call(A,'start',{code,bets})).room.spin.id,room.spin.id,'a repeated start cannot create a second round');
  const stored=(await db.query('select computer_bets from ojjuda_roulette_internal.rounds where id=$1',[room.spin.id])).rows[0].computer_bets;
  equal(stored,computer.bets,'computer wagers are saved in the immutable round');
  equal((await db.query('select user_id from ojjuda_roulette_internal.entries where round_id=$1',[room.spin.id])).rows.map(e=>e.user_id),[A],'only the human can produce wallet/ranking receipts');
  await db.query("update ojjuda_roulette_internal.rounds set started_at=clock_timestamp()-interval '31 seconds' where id=$1",[room.spin.id]);
  const finished=await call(A,'read',{code});equal(finished.room.status,'finished');equal(finished.wallet.gold,6300);
  equal(finished.room.result.total,3564);equal(finished.room.result.fee,36);
  const expectedBot=(await db.query('select ojjuda_roulette_internal.payout($1,$2) result',[stored,room.spin.number])).rows[0].result;
  equal(bot(finished.room).result.total,expectedBot.total);equal(bot(finished.room).result.fee,expectedBot.fee);
  equal(bot(finished.room).result.stake,computer.stake);equal(bot(finished.room).result.number,room.spin.number);
  const next=await call(A,'confirm',{code,roundId:room.spin.id});equal(next.wallet.gold,9864);equal(next.wallet.coins,20);
  equal(next.room.status,'betting');equal(next.room.me.ready,false);equal(next.room.me.bets,{});equal(next.room.bettingDeadline,null);
  assert.ok(bot(next.room).stake>0);equal(bot(next.room).result,null,'next manual round has a new unplayed computer draft');
  equal((await call(A,'confirm',{code,roundId:room.spin.id})).wallet.gold,9864,'repeat confirmation cannot pay twice');
  equal((await db.query('select computer_bets from ojjuda_roulette_internal.rounds where id=$1',[room.spin.id])).rows[0].computer_bets,stored,'new draft does not overwrite historical computer bets');
  equal((await db.query('select count(*)::int n from ojjuda_roulette_internal.rounds where room_id=$1',[id])).rows[0].n,1,'computer confirmation does not auto-start another round');
  const humanReceipt=(await db.query('select payout::int payout,abandoned,settled_at from ojjuda_roulette_internal.entries where round_id=$1',[room.spin.id])).rows[0];
  equal(humanReceipt.payout,3564);equal(humanReceipt.abandoned,false);assert.ok(humanReceipt.settled_at,'normal computer matches preserve the human ranking result');

  const second=await call(A,'start',{code,bets:{red:100}});
  equal(bot(second.room).bets,bot(next.room).bets,'the second round freezes its own server-generated draft');
  const secondPayout=(await db.query('select payout::int payout from ojjuda_roulette_internal.entries where round_id=$1',[second.room.spin.id])).rows[0].payout;
  await call(A,'leave',{room_id:id});equal((await call(A,'status')).wallet.gold,9764+secondPayout,'leaving computer play settles the same server outcome');
  equal((await db.query('select abandoned from ojjuda_roulette_internal.entries where round_id=$1',[second.room.spin.id])).rows[0].abandoned,true);

  response=await call(A,'create');room=response.room;equal(room.mode,'online','existing callers keep online mode by default');
  equal(room.players.length,1);equal(bot(room),undefined);await call(B,'join',{code:room.code});
  const onlineFirst=await call(A,'start',{code:room.code,bets:{red:100}});equal(onlineFirst.room.status,'betting');
  equal(onlineFirst.room.bettingDeadline-onlineFirst.serverTime,30000,'online still uses the fixed 30-second timer');
  const onlineStarted=await call(B,'start',{code:room.code,bets:{black:100}});equal(onlineStarted.room.status,'spinning');
  equal(onlineStarted.room.players.every(p=>p.computer===false),true);
  equal((await db.query('select computer_bets from ojjuda_roulette_internal.rounds where id=$1',[onlineStarted.room.spin.id])).rows[0].computer_bets,{});
  equal((await call(C,'list')).rooms.some(r=>r.id===id),false);
  console.log(`PASS: ${checks} computer-mode assertions: private server-owned opponent, visible persistent bets, immediate manual spin, real payouts/fees, no bot account/wallet/ranking, fresh next-round draft, repeated requests, departure settlement and unchanged online countdown.`);
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
