const assert=require('node:assert/strict');
const {fixture,A,B,C,MINOR}=require('./matgo-online-fixture.cjs');
(async()=>{
 const f=await fixture(),{db,call}=f;
 const gold=async id=>(await call(id,{action:'status'})).gold;
 const move=(id,r,command,request_id=crypto.randomUUID())=>call(id,{action:'online_move',room_id:r.id,version:r.version,request_id,command});
 try{
  for(const role of ['anon','authenticated']){
   const perms=(await db.query("select has_function_privilege($1,'public.matgo_online_service(uuid,text,uuid,text,text,integer,uuid,jsonb)','execute') f,has_schema_privilege($1,'ojjuda_matgo_internal','usage') s",[role])).rows[0];
   assert.equal(perms.f,false);assert.equal(perms.s,false);
  }
  assert.equal((await call(MINOR,{action:'online_quick'})).error,'adult_required');
  assert.equal((await call('invalid',{action:'online_quick'})).status,401);
  // Nobody joins: only a quick room falls back, after five seconds, with no gold paid.
  const quick=await call(A,{action:'online_quick'});assert.equal(quick.room.mode,'quick');
  assert.equal((await call(A,{action:'online_fallback',room_id:quick.room.id})).room.status,'waiting');
  assert.equal((await call(B,{action:'online_fallback',room_id:quick.room.id})).error,'room_not_found');
  assert.equal((await call(MINOR,{action:'online_fallback',room_id:quick.room.id})).error,'adult_required');
  await db.query("update ojjuda_matgo_internal.rooms set created_at=now()-interval '6 seconds' where id=$1",[quick.room.id]);
  const solo=await call(A,{action:'online_fallback',room_id:quick.room.id});assert.equal(solo.room.reason,'solo');assert.equal(solo.room.status,'cancelled');
  assert.equal((await call(A,{action:'online_fallback',room_id:quick.room.id})).room.reason,'solo','fallback is idempotent');
  assert.equal(await gold(A),5000);assert.equal((await call(A,{action:'start'})).status,200);
  assert.equal((await call(B,{action:'online_join',code:quick.room.code})).error,'room_unavailable');
  // If joining wins the lock, fallback reads the joined room without leaving it.
  const race=await call(A,{action:'online_quick'});
  await db.query("update ojjuda_matgo_internal.rooms set created_at=now()-interval '6 seconds' where id=$1",[race.room.id]);
  const joined=await call(B,{action:'online_join',code:race.room.code});assert.equal(joined.room.status,'active');
  const kept=await call(A,{action:'online_fallback',room_id:race.room.id});assert.equal(kept.room.status,'active');assert.deepEqual(kept.room.departed,[false,false]);
  await call(A,{action:'online_leave',room_id:race.room.id});await call(B,{action:'online_leave',room_id:race.room.id});
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.matgo_online_fallback(uuid,uuid)','execute') f",[role])).rows[0].f,false);
  let a=await call(A,{action:'online_create'});assert.equal(a.status,200);assert.equal(a.room.status,'waiting');
  assert.equal((await call(A,{action:'online_fallback',room_id:a.room.id})).error,'room_not_found','private rooms keep waiting');
  assert.equal(a.room.game,undefined);assert.equal(a.room.seed,undefined);
  assert.equal((await call(B,{action:'online_join',code:'00000000'})).error,'room_not_found');
  assert.equal((await call(C,{action:'online_read',room_id:a.room.id})).error,'room_not_found');
  assert.equal((await call(A,{action:'start'})).error,'match_in_progress');
  const initial=await call(B,{action:'online_join',code:a.room.code});assert.equal(initial.room.status,'active');assert.equal(initial.room.seat,1);
  assert.equal((await call(C,{action:'online_join',code:a.room.code})).error,'room_unavailable');
  let read=await call(A,{action:'online_read',room_id:a.room.id});
  assert.equal(read.room.game.hand.length,10);assert.equal(read.room.game.otherCount,10);
  assert.equal('seed' in read.room,false);assert.equal('actions' in read.room,false);assert.equal('deck' in read.room.game,false);
  assert.equal((await move(C,read.room,{type:'play',card:1})).error,'room_not_found');
  const seat=read.room.game.prompt.p,id=[A,B][seat],other=[A,B][1-seat];
  assert.equal((await move(other,read.room,{type:'play',card:0})).error,'not_your_turn');
  assert.equal((await move(id,read.room,{type:'play',card:999})).status,409);
  const unauth=await call(A,{action:'online_move',room_id:a.room.id,version:0,request_id:crypto.randomUUID(),command:{type:'play',card:0}});assert.equal(unauth.error,'state_conflict');
  const departed=await call(A,{action:'online_leave',room_id:a.room.id});assert.equal(departed.room.bots[0],true);assert.equal(departed.room.departed[0],true);
  assert.equal(await gold(A),5000);assert.equal(await gold(B),5000);
  await call(B,{action:'online_leave',room_id:a.room.id});
  assert.equal((await call(B,{action:'online_read',room_id:a.room.id})).room.status,'cancelled');
  // Queue matching is atomic and a third player gets a different room.
  const q=await Promise.all([call(A,{action:'online_quick'}),call(B,{action:'online_quick'}),call(C,{action:'online_quick'})]);
  assert.equal(q[0].room.id,q[1].room.id);assert.notEqual(q[1].room.id,q[2].room.id);
  await call(C,{action:'online_leave',room_id:q[2].room.id});
  const roomId=q[0].room.id;let ended=null,sawPrompt=false,lastRequest,lastBody;
  for(let i=0;i<160;i++){
    const host=(await call(A,{action:'online_read',room_id:roomId})).room;
    if(host.status==='finished'){ended=host;break;}
    const p=host.game.prompt.p,actor=[A,B][p];
    const r=(await call(actor,{action:'online_read',room_id:roomId})).room,pr=r.game.prompt;
    let command;
    if(pr.type==='chongtong')command={type:'chongtong',decision:'continue'};
    else if(pr.type==='choose'){sawPrompt=true;command={type:'choose',index:pr.indices[0]};}
    else if(pr.type==='gukjin')command={type:'gukjin',choice:'pi'};
    else if(pr.type==='gostop'){sawPrompt=true;command={type:'gostop',decision:'stop'};}
    else command={type:'play',card:r.game.hand[0]?.id??null};
    const req=crypto.randomUUID(),res=await move(actor,r,command,req);assert.equal(res.status,200,JSON.stringify(res));
    if(res.room.status==='active'&&['choose','gostop','gukjin'].includes(res.room.game.prompt?.type))assert.equal(res.room.deadline,r.deadline,'floor/go choices share the original 15-second turn');
    lastRequest=actor;lastBody={action:'online_move',room_id:roomId,version:r.version,command,request_id:req};
    const duplicate=await call(actor,lastBody);assert.equal(duplicate.room.version,res.room.version);
    if(res.room.status==='active'){assert.equal(await gold(A),5000);assert.equal(await gold(B),5000);}
    for(const ev of res.room.events)if(ev.type==='draw'&&ev.p!==p)assert.equal(ev.card,undefined);
  }
  assert.ok(ended,'two human transcripts finish');assert.ok(sawPrompt);
  assert.equal((await gold(A))+(await gold(B)),10000,'human gold is conserved');
  const balances=[await gold(A),await gold(B)];
  await call(lastRequest,lastBody);assert.deepEqual([await gold(A),await gold(B)],balances);
  assert.deepEqual(ended.result.paidDelta,[balances[0]-5000,balances[1]-5000]);
  await call(A,{action:'online_ready',room_id:roomId});
  assert.equal((await call(A,{action:'start'})).error,'match_in_progress');
  const rematch=await call(B,{action:'online_ready',room_id:roomId});assert.equal(rematch.room.status,'active');assert.equal(rematch.room.round,2);
  assert.equal(rematch.room.game.bank[0],balances[0]);
  const deadline=Date.parse(rematch.room.deadline);assert.ok(deadline-Date.now()>13000&&deadline-Date.now()<=15000,'each turn has 15 seconds');
  const turnsBefore=rematch.room.version;
  await db.query("update ojjuda_matgo_internal.rooms set deadline=now()-interval '1 second' where id=$1",[roomId]);
  const timeout=await call(A,{action:'online_read',room_id:roomId});assert.ok(timeout.room.version>turnsBefore);assert.notEqual(timeout.room.status,'cancelled');
  assert.deepEqual(timeout.room.bots,[false,false],'a timed-out player keeps their seat');
  assert.deepEqual([await gold(A),await gold(B)],balances);
  // Leaving converts just that seat to PC, which completes all choices itself.
  const left=await call(A,{action:'online_leave',room_id:roomId});assert.equal(left.room.bots[0],true);
  for(let i=0;i<60;i++){
    await db.query("update ojjuda_matgo_internal.rooms set deadline=now()-interval '1 second' where id=$1 and status='active'",[roomId]);
    const state=await call(B,{action:'online_read',room_id:roomId});assert.equal(state.status,200,JSON.stringify(state));
    if(state.room.status==='finished'){
      assert.ok(state.room.result.paidDelta[0]<=0,'departed winners never receive gold');ended=state.room;break;
    }
  }
  assert.equal(ended.round,2,'PC takeover finishes the actual second round');
  assert.equal((await call(A,{action:'start'})).status,200);
  const wait=await call(C,{action:'online_create'});
  await db.query("update ojjuda_matgo_internal.rooms set seen_host=now()-interval '61 seconds' where id=$1",[wait.room.id]);
  assert.equal((await call(C,{action:'online_read',room_id:wait.room.id})).room.status,'cancelled');
  // Losses cannot go below zero or create gold for a human winner.
  await db.query('update ojjuda_matgo_internal.wallets set gold=100,round_id=null,round_seed=null where user_id=$1',[B]);
  const low=await call(A,{action:'online_create'});await call(B,{action:'online_join',code:low.room.code});
  const raw=(await db.query('select * from ojjuda_matgo_internal.rooms where id=$1',[low.room.id])).rows[0];
  const aBefore=await gold(A);
  const next={actions:[],result:{goldDelta:[1000,-1000]},first:0,carry:1};
  await db.query('select public.matgo_online_service($1,$2,$3,null,null,$4,$5,$6)',[A,'commit',raw.id,raw.version,crypto.randomUUID(),next]);
  assert.equal(await gold(B),0);assert.equal(await gold(A),aBefore+100);
  // A stopped heartbeat hands that seat to the PC; the remaining member stays human.
  await db.query('update ojjuda_matgo_internal.wallets set gold=5000 where user_id=$1',[B]);
  const disconnected=await call(A,{action:'online_create'});await call(B,{action:'online_join',code:disconnected.room.code});
  await db.query("update ojjuda_matgo_internal.rooms set seen_host=now()-interval '31 seconds' where id=$1",[disconnected.room.id]);
  const takeover=await call(B,{action:'online_read',room_id:disconnected.room.id});assert.deepEqual(takeover.room.bots,[true,false]);
  console.log('PASS: human matching, codes, hidden hands, server choices, stale/duplicate moves, atomic gold, rematch, 15-second automatic turns, PC takeover and no winnings after leaving');
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
