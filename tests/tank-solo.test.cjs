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
  for(let i=0;i<room.capacity*2&&room.status==='active'&&room.game.turn!==0;i++){
   const old=room,id=randomUUID(),next=await cpu(old,id);assert.equal(next.ok,true,JSON.stringify(next));
   assert.equal(next.coins,98);assert.equal(next.room.event.computer,true);assert.ok(next.room.event.command.weapon<3);
   const repeated=await cpu(old,id);assert.equal(repeated.room.version,next.room.version);assert.equal(repeated.coins,98);
   room=next.room;
  }
  assert.equal(room.game.turn,0);
  assert.equal((await f.call(ids[0],{action:'mine'})).room.id,room.id);
  const left=await f.call(ids[0],{action:'leave',room_id:room.id});assert.equal(left.room,null);
  assert.equal((await f.call(ids[0],{action:'mine'})).room,null);
  // Measure actual landing positions and damage, including splash and scatter.
  const {newGame,createEngine,advance}=await import('../games/tank/engine.mjs');
  const {computerCommand,COMPUTER_ACCURACY}=await import('../supabase/functions/tank/computer.mjs');
  function observeShot(sample,command){
   const engine=createEngine(sample),bursts=new Set(),price=engine.begin(command);let frames=0;
   while(['fly','settle'].includes(engine.view().state)&&frames++<18000){engine.step();engine.view().booms.forEach(b=>bursts.add(b));}
   assert.ok(frames<18000,'computer shots must finish');
   return {state:engine.snapshot(),price,bursts:[...bursts]};
  }
  const nearestTarget=sample=>sample.tanks.filter((t,i)=>i!==sample.turn&&t.hp>0).sort((a,b)=>Math.abs(a.x-sample.tanks[sample.turn].x)-Math.abs(b.x-sample.tanks[sample.turn].x))[0];
  const landingDistance=(sample,next)=>{const target=nearestTarget(sample);return Math.min(...next.bursts.map(b=>Math.hypot(b.x-target.x,b.y-target.y)));};
  assert.equal(COMPUTER_ACCURACY,.05);
  const oldGame=createEngine({names:['a','b','c'],runId:'old-cpu-map',seed:881,width:2400}).snapshot();delete oldGame.width;oldGame.wind=.076;
  const normalized=createEngine(oldGame).snapshot();
  assert.deepEqual(computerCommand(oldGame),computerCommand(normalized),'computer aiming uses the restored map width and capped wind of legacy saves');
  let hits=0,totalDamage=0,furthestLanding=0;
  for(const size of [2,4,12])for(let seed=1;seed<=200;seed++){
   const sample=newGame(Array.from({length:size},(_,i)=>String(i)),'balance',seed*1777,1700000000000+seed*8000);
   sample.turn=seed%size;sample.shotNo=seed;
   const before=structuredClone(sample),command=computerCommand(sample),next=observeShot(sample,command);
   assert.equal(next.price,0);assert.ok(command.weapon<3);
   assert.deepEqual(sample,before,'aim previews must not change the saved battle');
   if(seed===1)assert.deepEqual(computerCommand(sample),command,'retrying does not reroll accuracy');
   const damage=sample.tanks.reduce((sum,t,i)=>sum+(i===sample.turn?0:t.hp-next.state.tanks[i].hp),0);
   hits+=damage>0;totalDamage+=damage;
   const distance=landingDistance(sample,next);furthestLanding=Math.max(furthestLanding,distance);
   assert.ok(distance<180,`a computer should land near its nearest living opponent (${size} players, seed ${seed}, ${distance.toFixed(1)} away)`);
  }
  assert.ok(hits>=15&&hits<=45,`CPU hit rate should stay near 5%: ${hits}/600`);
  assert.ok(totalDamage/600<3,'computer average damage should stay very low');
  // Computer-vs-computer targeting also works at both edges and in strong winds.
  for(const side of [-1,1])for(const wind of [-.038,0,.038]){
   const sample=newGame(['나','컴퓨터 1','컴퓨터 2','탈락'],'near-edge',456789,1700000000000);
   sample.turn=1;sample.shotNo=3;sample.wind=wind;sample.terrain.fill(150);
   const positions=side>0?[80,900,sample.width-35,950]:[sample.width-80,700,35,650];
   sample.tanks.forEach((t,i)=>Object.assign(t,{x:positions[i],y:300,vy:0,hp:i===3?0:100}));
   assert.equal(nearestTarget(sample).name,'컴퓨터 2','the nearest live opponent can be another computer');
   const command=computerCommand(sample),next=observeShot(sample,command);
   assert.ok(landingDistance(sample,next)<180,'edge targets stay in range even with a strong headwind or tailwind');
   assert.ok(next.bursts.some(b=>b.x>=0&&b.x<=sample.width),'aim near the edge target instead of far outside the map');
  }
  // Fix the weather epoch as well as the terrain seed so CI time cannot change the duel.
  let state=newGame(['나','컴퓨터'],randomUUID(),456789,1700000000000),turns=0;
  for(;turns<800&&!state.over;turns++){
   const command=computerCommand(state),next=advance(state,state.turn,command);
   assert.equal(next.price,0);state=next.state;
  }
  assert.equal(state.over,true,'computer aiming must finish a duel');
  // Maximum opponent count, defeat and a clean return to the mode selector.
  room=(await f.call(ids[0],{action:'create',request_id:randomUUID(),options:{mode:'solo',capacity:12,title:'최대 인원'}})).room;
  room=(await f.start(ids[0],room)).room;assert.equal(room.game.tanks.length,12);
  const ended=await f.call(ids[0],{action:'surrender',room_id:room.id,version:room.version,request_id:randomUUID()});
  assert.equal(ended.room.status,'finished');assert.equal(ended.room.game.tanks[0].hp,0);assert.equal(ended.coins,98);
  console.log(`PASS: CPU hit rate ${hits}/600 (${(hits/6).toFixed(2)}%), furthest nearby landing ${furthestLanding.toFixed(1)}, computer targets at both edges and strong winds, solo privacy, 1–11 opponents, no timer, CPU authority, replay-safe billing, automatic turn cycle, defeat, leave and computer duel (${turns} turns)`);
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
