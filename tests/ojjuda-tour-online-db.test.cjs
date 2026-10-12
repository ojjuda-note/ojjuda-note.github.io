const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture,ids}=require('./ojjuda-tour-online-fixture.cjs');
(async()=>{
 const f=await fixture(),{db,call,create,join,start,move}=f,[a,b,c]=ids;
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.ok,true);return r.room;};
 try{
  assert.equal((await call(null,{action:'mine'})).error,'not_signed_in');
  await db.query('update auth.users set is_anonymous=true where id=$1',[c]);assert.equal((await call(c,{action:'mine'})).error,'not_signed_in');await db.query('update auth.users set is_anonymous=false where id=$1',[c]);
  let room=ok(await create(a,2));assert.match(room.code,/^[A-F0-9]{8}$/);assert.equal(room.names.length,1);
  assert.equal(ok(await call(a,{action:'mine'})).id,room.id);
  assert.equal((await call(c,{action:'read',room_id:room.id})).error,'room_not_found');
  assert.equal((await start(a,room)).error,'need_players');
  assert.equal((await create(a)).error,'room_in_progress');
  await db.query('insert into public.blocks values($1,$2)',[a,b]);assert.equal((await join(b,room)).error,'room_unavailable');await db.exec('delete from public.blocks');
  const race=await Promise.all([join(b,room),join(c,room)]);assert.equal(race.filter(r=>r.ok).length,1,'only one final seat is taken');
  const guest=race[0].ok?b:c,other=guest===b?c:b;room=ok(race.find(r=>r.ok));
  assert.equal((await start(guest,room)).error,'not_room_owner');
  room=ok(await call(a,{action:'read',room_id:room.id}));room=ok(await start(a,room));
  const r2=ok(await call(guest,{action:'read',room_id:room.id}));assert.equal(r2.seat,1);assert.deepEqual(r2.game,room.game);
  assert.equal((await join(other,room)).error,'room_already_started');
  assert.equal((await move(guest,room,{type:'roll'})).error,'not_your_turn');
  assert.equal((await move(a,room,{type:'surrender'})).error,'bad_request','move cannot smuggle another action');
  f.dice(0,2);const request_id=randomUUID(),before=room;room=ok(await move(a,room,{type:'roll'},request_id));
  assert.equal(room.game.players[0].pos,4);assert.equal(room.prompt.kind,'buy');
  const replay=ok(await move(a,before,{type:'roll'},request_id));assert.equal(replay.version,room.version);assert.deepEqual(replay.game,room.game,'network retry returns the same committed move');
  assert.equal((await move(a,before,{type:'roll'})).error,'state_conflict');
  assert.equal((await move(a,room,{type:'choose',value:99})).error,'invalid_choice');
  room=ok(await move(a,room,{type:'choose',value:'yes'}));assert.equal(room.game.owner[4],0);assert.equal(room.game.turn,1);
  const duplicate=await Promise.all([move(guest,room,{type:'roll'}),move(guest,room,{type:'roll'})]);assert.equal(duplicate.filter(r=>r.ok).length,1,'concurrent moves advance once');
  room=ok(await call(a,{action:'read',room_id:room.id}));
  await db.query("update ojjuda_marble_internal.rooms set deadline=now()-interval '1 second' where id=$1",[room.id]);
  const oldTurn=room.game.turn;room=ok(await call(a,{action:'read',room_id:room.id}));assert.ok(room.game.over||room.game.turn!==oldTurn,'timeout advances without the host or active player');
  // Finishing from either device persists both scores in the same transaction.
  const quitter=ids[room.seat],surrender={action:'surrender',room_id:room.id,version:room.version,request_id:randomUUID()};
  room=ok(await call(quitter,surrender));assert.equal(room.status,'finished');assert.equal(room.ranked,true);assert.equal(room.game.players[room.seat].bankrupt,true);
  const scores=(await db.query('select * from public.game_scores order by id')).rows;assert.equal(scores.length,2);assert.ok(scores.every(r=>r.reward===0&&!r.verified&&r.game==='tour'));assert.equal(scores.find(r=>r.user_id===quitter).score,0);
  ok(await call(quitter,surrender));assert.equal((await db.query('select count(*)::integer as n from public.game_scores')).rows[0].n,2,'finish retry cannot duplicate rankings');
  assert.ok(!JSON.stringify(room).includes(a));assert.ok(!JSON.stringify(room).includes('requests'),'private membership and idempotency data are omitted');
  // Waiting hosts can leave; a remaining participant becomes the host.
  let waiting=ok(await create(a,8));waiting=ok(await join(guest,waiting));ok(await call(a,{action:'leave',room_id:waiting.id}));waiting=ok(await call(guest,{action:'read',room_id:waiting.id}));assert.equal(waiting.hostSeat,0);assert.equal(waiting.seat,0);assert.equal(waiting.names.length,1);
  await db.query("update ojjuda_marble_internal.rooms set expires_at=now()-interval '1 second' where id=$1",[waiting.id]);assert.equal((await call(guest,{action:'read',room_id:waiting.id})).error,'room_unavailable');
  await db.query('insert into public.bans values($1)',[other]);assert.equal((await call(other,{action:'mine'})).error,'banned');
  for(const role of ['anon','authenticated']){
   await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select public.marble_online_service($1,'mine')",[a]);}),/permission denied/);
   await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query('select * from ojjuda_marble_internal.rooms');}),/permission denied/);
  }
  const cors=await f.handler(f.request(a,{action:'mine'},{origin:'https://evil.test'}));assert.equal(cors.status,403);
  const malformed=await f.handler(new Request('https://edge.test',{method:'POST',headers:{authorization:'Bearer fixture-'+a,origin:'https://ojjuda.kr'},body:'a'.repeat(4097)}));assert.equal(malformed.status,400);
  console.log('PASS: online rooms, real membership/capacity races, host transfer, move authorization, CAS, retries, timeout, reconnect snapshots, all-player rankings and private SQL access');
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
