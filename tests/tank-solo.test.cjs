const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture,ids}=require('./tank-online-fixture.cjs');
(async()=>{
 const f=await fixture();
 try{
  const created=await f.call(ids[0],{action:'create',request_id:randomUUID(),options:{mode:'solo',capacity:4,title:'컴퓨터 대전'}});
  assert.equal(created.ok,true);let room=created.room;
  assert.equal(room.mode,'solo');assert.equal(room.names.length,1);
  assert.equal((await f.call(ids[1],{action:'list'})).rooms.length,0);
  assert.equal((await f.join(ids[1],room)).error,'room_not_found');
  assert.equal((await f.call(ids[1],{action:'read',room_id:room.id})).error,'room_not_found');
  room=(await f.start(ids[0],room)).room;
  assert.equal(room.game.names.length,4);assert.equal(room.game.names[3],'컴퓨터 3');
  assert.equal(room.deadline,null);assert.equal(room.game.turn,0);
  const cpu=(r,id=randomUUID())=>f.call(ids[0],{action:'cpu',room_id:r.id,version:r.version,request_id:id,command:{weapon:8,angle:90,power:100,moves:[]}});
  assert.equal((await cpu(room)).error,'not_your_turn');
  await f.db.query("update ojjuda_tank_internal.rooms set deadline=clock_timestamp()-interval '1 hour' where id=$1",[room.id]);
  assert.equal((await f.call(ids[0],{action:'read',room_id:room.id})).room.version,room.version);
  const paid={weapon:3,angle:0,power:50,moves:[]},requestId=randomUUID();
  const shot=await f.move(ids[0],room,paid,requestId);assert.equal(shot.ok,true);assert.equal(shot.coins,98);
  assert.equal((await f.move(ids[0],room,paid,requestId)).coins,98);room=shot.room;
  for(let i=0;i<3&&room.status==='active'&&room.game.turn!==0;i++){
   const old=room,id=randomUUID(),next=await cpu(old,id);assert.equal(next.ok,true,JSON.stringify(next));
   assert.equal(next.coins,98);assert.equal(next.room.event.computer,true);assert.ok(next.room.event.command.weapon<3);
   const repeated=await cpu(old,id);assert.equal(repeated.room.version,next.room.version);assert.equal(repeated.coins,98);
   room=next.room;
  }
  assert.equal(room.game.turn,0);
  assert.equal((await f.call(ids[0],{action:'mine'})).room.id,room.id);
  const left=await f.call(ids[0],{action:'leave',room_id:room.id});assert.equal(left.room,null);
  assert.equal((await f.call(ids[0],{action:'mine'})).room,null);
  // A complete computer duel demonstrates aiming, damage and termination without billing a person.
  const {newGame,advance}=await import('../games/tank/engine.mjs');
  const {computerCommand}=await import('../supabase/functions/tank/computer.mjs');
  let hits=0,totalDamage=0;
  for(const size of [2,4,12])for(let seed=1;seed<=24;seed++){
   const sample=newGame(Array.from({length:size},(_,i)=>String(i)),'balance',seed*1777,1700000000000+seed*8000);
   sample.turn=seed%size;sample.shotNo=seed;
   const next=advance(sample,sample.turn,computerCommand(sample));
   const damage=sample.tanks.reduce((sum,t,i)=>sum+(i===sample.turn?0:t.hp-next.state.tanks[i].hp),0);
   hits+=damage>0;totalDamage+=damage;
  }
  assert.ok(hits>=10&&hits<=36,`casual CPU should miss often but still hit: ${hits}/72`);
  assert.ok(totalDamage/72<15,'computer average damage should stay forgiving');
  // Fix the weather epoch as well as the terrain seed so CI time cannot change the duel.
  let state=newGame(['나','컴퓨터'],randomUUID(),456789,1700000000000),turns=0;
  for(;turns<70&&!state.over;turns++){
   const command=computerCommand(state),next=advance(state,state.turn,command);
   assert.equal(next.price,0);state=next.state;
  }
  assert.equal(state.over,true,'computer aiming must finish a duel');
  // Maximum opponent count, defeat and a clean return to the mode selector.
  room=(await f.call(ids[0],{action:'create',request_id:randomUUID(),options:{mode:'solo',capacity:12,title:'최대 인원'}})).room;
  room=(await f.start(ids[0],room)).room;assert.equal(room.game.tanks.length,12);
  const ended=await f.call(ids[0],{action:'surrender',room_id:room.id,version:room.version,request_id:randomUUID()});
  assert.equal(ended.room.status,'finished');assert.equal(ended.room.game.tanks[0].hp,0);assert.equal(ended.coins,98);
  console.log(`PASS: solo privacy, 1–11 opponents, no timer, CPU authority, replay-safe billing, automatic turn cycle, defeat, leave and computer duel (${turns} turns)`);
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
