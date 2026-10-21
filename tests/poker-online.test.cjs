const assert=require('node:assert/strict');
const {fixture}=require('./poker-online-fixture.cjs');
(async()=>{
 const f=await fixture(),{db,call,users}=f,[A,B,C,D,MINOR,OUT]=users;
 const action=(actor,room,type,extra={})=>call(actor,{action:type,room_id:room.id,version:room.version,request_id:crypto.randomUUID(),...extra});
 const read=async(actor,id)=>{const r=await call(actor,{action:'read',room_id:id});assert.equal(r.status,200,JSON.stringify(r));return r.room;};
 const create=async(cap=4)=>{const r=await call(A,{action:'create',request_id:crypto.randomUUID(),options:{capacity:cap,title:'사람끼리 포커'}});assert.equal(r.status,200,JSON.stringify(r));return r.room;};
 const join=async(actor,room)=>{const r=await call(actor,{action:'join',code:room.code});assert.equal(r.status,200,JSON.stringify(r));return r.room;};
 const expire=id=>db.query("update ojjuda_poker_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1",[id]);
 try{
  for(const role of ['anon','authenticated']){
   const r=await db.query("select has_function_privilege($1,'public.poker_online_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)','execute') f,has_schema_privilege($1,'ojjuda_poker_internal','usage') s",[role]);assert.equal(r.rows[0].f,false);assert.equal(r.rows[0].s,false);
  }
  assert.equal((await call(MINOR,{action:'list'})).error,'adult_required');
  assert.equal((await call(A,{action:'list'})).status,200,'19th birthday is eligible');
  assert.equal((await call('invalid',{action:'list'})).status,401);
  for(const cap of [2,4]){
   let r=await create(cap);
   assert.equal(r.game,null);assert.equal((await action(A,r,'start')).error,'need_players');
   for(const actor of users.slice(1,cap))await join(actor,r);
   assert.equal((await call(OUT,{action:'join',code:r.code})).error,'room_full');
   r=await read(A,r.id);
   assert.equal((await action(B,r,'start')).error,'not_room_owner');
   const started=await action(A,r,'start');assert.equal(started.status,200,JSON.stringify(started));r=started.room;
   assert.equal(r.game.players.length,cap);assert.equal(r.status,'active');
   const wire=JSON.stringify(r);for(const secret of ['deck','discarded','members','requests','seed'])assert.ok(!wire.includes('"'+secret+'"'),secret+' stays private');
   assert.ok(r.game.players[0].cards.every(Number.isInteger));assert.ok(r.game.players[1].cards.every(c=>typeof c==='string'));
   assert.equal((await call(OUT,{action:'read',room_id:r.id})).error,'room_not_found');
   assert.equal((await action(A,r,'move',{command:{type:'discard',index:0}})).error,'not_your_turn');
   let count=0;
   while(r.status==='active'){
    assert.ok(count++<90,'game finishes');
    if(['between','runout'].includes(r.game.phase)){await expire(r.id);r=await read(A,r.id);continue;}
    const actor=users[r.game.turn],own=await read(actor,r.id),g=own.game;
    let command=g.phase==='discard'?{type:'discard',index:0}:g.phase==='open'?{type:'open',index:0}:{type:g.legal.check?'check':'call'};
    const body={action:'move',room_id:r.id,version:own.version,request_id:crypto.randomUUID(),command};
    const moved=await call(actor,body);assert.equal(moved.status,200,JSON.stringify(moved));
    const duplicate=await call(actor,body);assert.equal(duplicate.room.version,moved.room.version,'retry cannot apply a move twice');
    assert.equal((await call(actor,{...body,request_id:crypto.randomUUID()})).error,'state_conflict');
    r=await read(A,r.id);
   }
   assert.equal(r.game.phase,'finished');assert.equal(r.game.players.reduce((s,p)=>s+p.stack,0),cap*5000);
   assert.ok(r.game.players.every(p=>p.cards.length===7&&p.cards.every(Number.isInteger)),'showdown reveals actual hands');
   for(const actor of users.slice(0,cap)){const own=await read(actor,r.id);const next=await action(actor,own,'ready');assert.equal(next.status,200,JSON.stringify(next));r=next.room;}
   assert.equal(r.round,2);assert.equal(r.status,'active');
   await expire(r.id);const timed=await read(A,r.id);assert.ok(timed.version>r.version,'timeout advances a human selection');r=timed;
   for(const actor of users.slice(0,cap)){const own=await read(actor,r.id);const left=await action(actor,own,'leave');assert.equal(left.status,200,JSON.stringify(left));assert.equal(left.room,null);}
   assert.equal((await call(A,{action:'mine'})).room,null,'leave frees membership');
  }
  // One remaining seat is assigned atomically under concurrent joins.
  let r=await create(2);const race=await Promise.all([call(B,{action:'join',code:r.code}),call(C,{action:'join',code:r.code})]);assert.equal(race.filter(x=>x.status===200).length,1);assert.equal(race.find(x=>x.status!==200).error,'room_full');
  r=await read(A,r.id);const visitor=race[0].status===200?B:C;
  await action(A,r,'leave');const host=await read(visitor,r.id);assert.equal(host.hostSeat,0,'waiting host hands room over');await action(visitor,host,'leave');
  // Server-side birthday checks also protect existing rooms.
  r=await create(2);await join(B,r);await db.query("update ojjuda_account_internal.member_identity set birth_date=current_date-interval '18 years' where user_id=$1",[B]);
  assert.equal((await call(B,{action:'read',room_id:r.id})).error,'adult_required');
  assert.equal((await action(A,await read(A,r.id),'start')).error,'adult_required');
  console.log('PASS: 2/4 human seats, hidden cards, full showdown, birthday 18/19, server turns, duplicate/stale requests, timeout, rematch, leave, host handover, capacity races and SQL permissions');
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
