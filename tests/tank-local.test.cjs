const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture,ids}=require('./tank-online-fixture.cjs');
(async()=>{
 const f=await fixture(),owner=ids[0],outsider=ids[1];
 const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.room;};
 const create=capacity=>f.call(owner,{action:'create',request_id:randomUUID(),options:{mode:'local',capacity,title:'같은 기기 대전'}});
 const fire=(room,weapon,id=randomUUID())=>f.move(owner,room,{weapon,angle:45,power:100,moves:[]},id);
 try{
  let room=ok(await create(3));
  assert.equal(room.mode,'local');assert.equal(room.names.length,1,'one account owns all local seats');
  assert.equal((await f.call(outsider,{action:'list'})).rooms.length,0);
  assert.equal((await f.join(outsider,room)).error,'room_not_found');
  assert.equal((await f.call(outsider,{action:'read',room_id:room.id})).error,'room_not_found');
  room=ok(await f.start(owner,room));
  assert.deepEqual(room.game.names,['플레이어 1','플레이어 2','플레이어 3']);
  assert.equal(room.deadline,null);
  assert.equal((await f.call(owner,{action:'cpu',room_id:room.id,version:room.version,request_id:randomUUID()})).error,'not_your_turn');
  await f.db.query("update ojjuda_tank_internal.rooms set deadline=clock_timestamp()-interval '1 hour' where id=$1",[room.id]);
  assert.equal(ok(await f.call(owner,{action:'read',room_id:room.id})).version,room.version,'no automatic timeout in local games');
  // A flat fixture keeps the nuclear shot away from all tanks so every seat can act.
  room.game.terrain.fill(150);room.game.tanks.forEach((t,i)=>Object.assign(t,{x:[2100,600,1200][i],y:300,vy:0}));
  await f.db.query('update ojjuda_tank_internal.rooms set state=$2::jsonb where id=$1',[room.id,JSON.stringify(room.game)]);
  const before=room,request=randomUUID();room=ok(await fire(room,8,request));
  assert.equal(room.event.command.weapon,8);assert.equal(room.event.actor,0);assert.equal(room.coins,97);
  assert.equal(room.game.turn,1);assert.equal(ok(await fire(before,8,request)).coins,97,'retries never bill twice');
  assert.equal((await f.move(outsider,room,{weapon:0,angle:45,power:100,moves:[]})).error,'room_not_found');
  const unchanged=room;
  await f.db.query('update public.user_private set coins=0 where user_id=$1',[owner]);
  assert.equal((await fire(room,8)).error,'coins');
  assert.deepEqual(ok(await f.call(owner,{action:'read',room_id:room.id})).game,unchanged.game,'insufficient funds never substitutes a basic shell');
  await f.db.query('update public.user_private set coins=97 where user_id=$1',[owner]);
  room=ok(await fire(room,10));assert.equal(room.event.actor,1);assert.equal(room.game.turn,2);assert.equal(room.coins,96);
  room=ok(await fire(room,0));assert.equal(room.event.actor,2);assert.equal(room.game.turn,0);assert.equal(room.coins,96);
  const purchases=(await f.db.query('select user_id,coins from ojjuda_note_internal.spend_requests order by coins desc')).rows;
  assert.deepEqual(purchases,[{user_id:owner,coins:3},{user_id:owner,coins:1}]);
  assert.equal(ok(await f.call(owner,{action:'mine'})).mode,'local');
  // The first player's defeat must not stop the other people using the same account.
  room.game.tanks[0].hp=0;room.game.turn=1;
  await f.db.query('update ojjuda_tank_internal.rooms set state=$2::jsonb where id=$1',[room.id,JSON.stringify(room.game)]);
  room=ok(await fire(room,10));assert.equal(room.game.turn,2);assert.equal(room.status,'active');
  room=ok(await f.call(owner,{action:'surrender',room_id:room.id,version:room.version,request_id:randomUUID()}));
  assert.equal(room.status,'finished');assert.equal(room.game.tanks[1].hp>0,true);
  assert.equal((await f.db.query('select count(*)::integer n from ojjuda_tank_internal.wins')).rows[0].n,0,'same-device wins never enter online rankings');
  await f.call(owner,{action:'leave',room_id:room.id});
  for(const size of [2,12]){
   room=ok(await f.start(owner,ok(await create(size))));
   assert.equal(room.game.tanks.length,size);assert.equal(room.game.names.at(-1),`플레이어 ${size}`);
   assert.equal((await f.call(owner,{action:'leave',room_id:room.id})).room,null);
  }
  assert.equal((await f.call(owner,{action:'mine'})).room,null);
  console.log('PASS: 2–12 same-device players, all turns controllable, no CPU/timer/public listing, owner billing, nuclear selection, retry/insufficient funds, privacy, elimination and no ranked wins');
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
