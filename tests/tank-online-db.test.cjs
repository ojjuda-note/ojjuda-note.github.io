const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture,ids}=require('./tank-online-fixture.cjs');
(async()=>{
 const f=await fixture(),{db,call,create,join,start,move}=f,[a,b,c]=ids;
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.ok,true);return r.room;};
 const command=(weapon=0)=>({weapon,angle:90,power:50,moves:[]});
 try{
  assert.equal((await call(null,{action:'mine'})).error,'not_signed_in');
  await db.query('update auth.users set is_anonymous=true where id=$1',[c]);assert.equal((await call(c,{action:'mine'})).error,'not_signed_in');await db.query('update auth.users set is_anonymous=false where id=$1',[c]);
  let room=ok(await create(a,2));assert.equal((await start(a,room)).error,'need_players');
  assert.equal((await call(c,{action:'read',room_id:room.id})).error,'room_not_found');
  assert.equal((await call(b,{action:'list'})).rooms[0].code,room.code);
  const race=await Promise.all([join(b,room),join(c,room)]);assert.equal(race.filter(r=>r.ok).length,1);
  const guest=race[0].ok?b:c;room=ok(race.find(r=>r.ok));
  assert.equal((await start(guest,room)).error,'not_room_owner');room=ok(await start(a,room));
  assert.deepEqual(ok(await call(guest,{action:'read',room_id:room.id})).game,room.game);
  assert.equal((await move(guest,room,command())).error,'not_your_turn');
  assert.equal((await move(a,room,{...command(),moves:Array(251).fill(1)})).error,'bad_request');
  assert.equal((await move(a,room,{...command(),power:101})).error,'bad_request');
  assert.equal((await move(a,room,{...command(),basicWeapon:8})).error,'bad_request');
  assert.equal((await move(a,room,command(15))).error,'bad_request','unknown ammo cannot bypass the server catalog');
  // Forged client cost and state never change authoritative prices or health.
  const request=randomUUID(),before=room;
  const shotStarted=Date.now();
  room=ok(await move(a,room,{...command(12),basicWeapon:2,price:0,hp:999,type:'timeout',windTime:1,wind:999},request));
  assert.ok(room.event.command.windTime>=shotStarted,'server chooses shot timing, ignoring the client override');
  assert.equal(room.event.command.wind,undefined,'clients cannot set the turn wind');
  assert.notEqual(room.game.wind,before.game.wind,'the next player receives new wind');
  assert.equal(room.game.tanks[0].basicWeapon,2,'the server saves the selected basic shell alongside a paid shot');
  assert.equal(room.coins,97);assert.equal(room.game.shotNo,1);
  const replay=ok(await move(a,before,command(12),request));assert.equal(replay.coins,97);assert.equal(replay.version,room.version);
  assert.equal((await db.query('select count(*)::integer n from ojjuda_note_internal.spend_requests')).rows[0].n,1);
  assert.equal((await move(a,before,command())).error,'state_conflict');
  // Every basic shell is free; paid shells fail atomically with an empty wallet.
  await db.query('update public.user_private set coins=2 where user_id=$1',[guest]);
  assert.equal((await move(guest,room,command(12))).error,'coins');
  assert.equal((await move(guest,room,command(13))).error,'coins');
  assert.equal(ok(await call(guest,{action:'read',room_id:room.id})).coins,2,'a 3-jju homing shot cannot spend a 2-jju balance');
  await db.query('update public.user_private set coins=0 where user_id=$1',[guest]);
  const stateBefore=room.game;
  assert.equal((await move(guest,room,command(8))).error,'coins');
  assert.equal((await move(guest,room,command(10))).error,'coins');
  assert.equal((await move(guest,room,command(11))).error,'coins');
  assert.equal((await move(guest,room,command(12))).error,'coins');
  assert.deepEqual(ok(await call(guest,{action:'read',room_id:room.id})).game,stateBefore);
  room=ok(await move(guest,room,command(1)));assert.equal(room.coins,0);
  assert.equal(room.game.tanks[0].w,2,'returning to an online turn restores the remembered basic shell');
  const beforeHeal=room,healRequest=randomUUID();
  const dupe=await Promise.all([move(a,room,command(10),healRequest),move(a,room,command(10),healRequest)]);assert.equal(dupe.filter(r=>r.ok).length,2);
  room=ok(dupe.find(r=>r.ok));
  assert.equal(room.coins,96,'healing costs exactly 1 jju even with concurrent retry');
  assert.equal(dupe[0].room.version,dupe[1].room.version);
  assert.deepEqual(room.game.terrain,beforeHeal.game.terrain,'authoritative healing leaves terrain unchanged');
  assert.equal((await db.query('select count(*)::integer n from ojjuda_note_internal.spend_requests')).rows[0].n,2);
  // A missing player cannot hold the room forever.
  await db.query("update ojjuda_tank_internal.rooms set deadline=now()-interval '1 second' where id=$1",[room.id]);
  const turn=room.game.turn;room=ok(await call(a,{action:'read',room_id:room.id}));assert.notEqual(room.game.turn,turn);
  room=ok(await call(a,{action:'surrender',room_id:room.id,version:room.version,request_id:randomUUID()}));assert.equal(room.status,'finished');
  const wins=(await db.query('select * from ojjuda_tank_internal.wins')).rows;
  assert.equal(wins.length,1);assert.equal(wins[0].user_id,guest,'only the authoritative surviving player receives a win');
  assert.ok(!JSON.stringify(room).includes(a));assert.ok(!JSON.stringify(room).includes('requests'));
  // Full 12-person admission, membership and reconnect; a 13th cannot enter.
  let large=ok(await create(a,12));for(const id of ids.slice(1,12))large=ok(await join(id,large));
  assert.equal(large.names.length,12);assert.equal((await join(ids[12],large)).error,'room_full');
  ok(await call(a,{action:'leave',room_id:large.id}));large=ok(await call(b,{action:'read',room_id:large.id}));assert.equal(large.hostSeat,0);assert.equal(large.seat,0);
  large=ok(await start(b,large));for(const id of ids.slice(1,12))assert.deepEqual(ok(await call(id,{action:'read',room_id:large.id})).game,large.game);
  for(const role of ['anon','authenticated']){
   await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select public.tank_online_service($1,'mine')",[a]);}),/permission denied/);
   await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query('select * from ojjuda_tank_internal.rooms');}),/permission denied/);
  }
  assert.equal((await f.handler(f.request(a,{action:'mine'},{origin:'https://evil.test'}))).status,403);
  // A complete bunker strike has one atomic charge, including a concurrent retry.
  const bunkerUser=ids[13];
  let bunker=ok(await call(bunkerUser,{action:'create',request_id:randomUUID(),options:{mode:'local',capacity:2,title:'벙커버스터 검증'}}));
  bunker=ok(await start(bunkerUser,bunker));const bunkerBefore=bunker,bunkerRequest=randomUUID();
  const strikes=await Promise.all([move(bunkerUser,bunker,{...command(13),angle:75,power:20,price:0},bunkerRequest),move(bunkerUser,bunker,{...command(13),angle:75,power:20},bunkerRequest)]);
  bunker=ok(strikes[0]);assert.equal(ok(strikes[1]).version,bunker.version);
  assert.equal(bunker.coins,97);assert.equal(bunker.game.shotNo,1);assert.equal(bunker.event.command.weapon,13);
  assert.notDeepEqual(bunker.game.terrain,bunkerBefore.game.terrain,'the authoritative strike saves its underground excavation');
  assert.equal((await db.query('select count(*)::integer n from ojjuda_note_internal.spend_requests where user_id=$1',[bunkerUser])).rows[0].n,1);
  assert.deepEqual(ok(await call(bunkerUser,{action:'mine'})).game,bunker.game,'reconnecting restores the excavated terrain');
  // All ten Steel Rain pellets are free, including with an empty wallet and retries.
  const rainUser=ids[12];await db.query('update public.user_private set coins=0 where user_id=$1',[rainUser]);
  let rain=ok(await call(rainUser,{action:'create',request_id:randomUUID(),options:{mode:'local',capacity:2,title:'강철비 검증'}}));
  rain=ok(await start(rainUser,rain));const rainRequest=randomUUID();
  const rains=await Promise.all([move(rainUser,rain,{...command(14),angle:70,power:60,basicWeapon:14,price:999},rainRequest),move(rainUser,rain,{...command(14),angle:70,power:60,basicWeapon:14},rainRequest)]);
  rain=ok(rains[0]);assert.equal(ok(rains[1]).version,rain.version);assert.equal(rain.coins,0);
  assert.equal(rain.game.shotNo,1);assert.equal(rain.event.command.weapon,14);assert.equal(rain.game.tanks[0].basicWeapon,14);
  assert.equal((await db.query('select count(*)::integer n from ojjuda_note_internal.spend_requests where user_id=$1',[rainUser])).rows[0].n,0);
  assert.deepEqual(ok(await call(rainUser,{action:'mine'})).game,rain.game,'reconnecting restores Steel Rain terrain and selection');
  // The restored nuclear shell costs five in every mode, including retries.
  ok(await call(rainUser,{action:'leave',room_id:rain.id}));
  ok(await call(bunkerUser,{action:'leave',room_id:bunker.id}));
  for(const mode of ['solo','local','online']){
   let nuclear=ok(await call(rainUser,{action:'create',request_id:randomUUID(),options:{mode,capacity:2,title:'핵탄 가격 검증'}}));
   if(mode==='online')nuclear=ok(await join(bunkerUser,nuclear));
   nuclear=ok(await start(rainUser,nuclear));
   const beforeNuclear=nuclear,nuclearRequest=randomUUID(),shot={...command(8),angle:45,power:100,price:3};
   await db.query('update public.user_private set coins=4 where user_id=$1',[rainUser]);
   assert.equal((await move(rainUser,nuclear,shot,nuclearRequest)).error,'coins',`${mode}: four jju cannot buy a nuclear shell`);
   const rejected=ok(await call(rainUser,{action:'read',room_id:nuclear.id}));
   assert.equal(rejected.coins,4);assert.equal(rejected.version,nuclear.version);assert.deepEqual(rejected.game,nuclear.game);
   assert.equal((await db.query('select count(*)::integer n from ojjuda_note_internal.spend_requests where request_id=$1',[nuclearRequest])).rows[0].n,0);
   await db.query('update public.user_private set coins=5 where user_id=$1',[rainUser]);
   const duplicates=await Promise.all([move(rainUser,nuclear,shot,nuclearRequest),move(rainUser,nuclear,shot,nuclearRequest)]);
   nuclear=ok(duplicates[0]);assert.equal(ok(duplicates[1]).version,nuclear.version);
   assert.equal(nuclear.coins,0);assert.equal(nuclear.game.shotNo,1);assert.equal(nuclear.event.command.weapon,8);
   assert.equal(ok(await move(rainUser,beforeNuclear,shot,nuclearRequest)).coins,0,'retries do not bill again');
   const charges=(await db.query('select coins,result from ojjuda_note_internal.spend_requests where request_id=$1',[nuclearRequest])).rows;
   assert.equal(charges.length,1);assert.equal(charges[0].coins,5);assert.equal(charges[0].result.price,5);
   if(mode!=='online')ok(await call(rainUser,{action:'leave',room_id:nuclear.id}));
  }
  console.log('PASS: 12 players, capacity race, authentication, private state, deterministic reconnect, authoritative fire, free basic ammo, atomic paid ammo, insufficient funds, duplicate retries, timeout and host transfer');
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
