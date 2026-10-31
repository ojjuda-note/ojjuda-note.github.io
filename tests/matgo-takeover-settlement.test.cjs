const assert=require('node:assert/strict');
const {fixture,A,B,C,MINOR}=require('./matgo-online-fixture.cjs');

(async()=>{
 const f=await fixture({basic:true,fresh:true,takeover:true}),{db,call}=f;
 const raw=async room=>(await db.query('select * from ojjuda_matgo_internal.rooms where id=$1',[room])).rows[0];
 const wallets=async()=>(await db.query('select user_id,gold,online_room,round_id from ojjuda_matgo_internal.wallets order by user_id')).rows;
 const records=async room=>(await db.query("select user_id,value from ojjuda_guest_internal.round_records where game='matgo' and round_id=$1 order by user_id",[room])).rows;
 const start=async()=>{
  for(const actor of [A,B])assert.equal((await call(actor,{action:'status'})).status,200);
  await db.query('update ojjuda_matgo_internal.wallets set gold=100000 where user_id=any($1::uuid[])',[[A,B]]);
  const host=await call(A,{action:'online_create',stakes_version:1});assert.equal(host.status,200,JSON.stringify(host));
  const guest=await call(B,{action:'online_join',code:host.room.code,stakes_version:1});assert.equal(guest.room?.status,'active',JSON.stringify(guest));
  return guest.room.id;
 };
 const playToEnd=async room=>{
  for(let i=0;i<150;i++){
   const read=await call(B,{action:'online_read',room_id:room,stakes_version:1});assert.equal(read.status,200,JSON.stringify(read));
   if(read.room.status==='finished')return read.room;
   const seat=read.room.game.prompt.p,actor=[A,B][seat],r=(await call(actor,{action:'online_read',room_id:room,stakes_version:1})).room,pr=r.game.prompt;
   if(r.bots[seat])continue;
   const command=pr.type==='choose'?{type:'choose',index:pr.indices[0]}:pr.type==='gukjin'?{type:'gukjin',choice:'pi'}:
    pr.type==='gostop'?{type:'gostop',decision:'stop'}:pr.type==='chongtong'?{type:'chongtong',decision:'continue'}:{type:'play',card:r.game.hand[0]?.id??null};
   const move=await call(actor,{action:'online_move',room_id:room,version:r.version,request_id:crypto.randomUUID(),command,stakes_version:1});
   assert.equal(move.status,200,JSON.stringify(move));
   assert.equal('seed' in move.room,false);assert.equal('actions' in move.room,false);assert.equal('deck' in move.room.game,false);
  }
  throw Error('game did not finish');
 };
 const settleTrusted=async(room,delta)=>{
  const r=await raw(room);
  return db.query('select public.matgo_online_service($1,$2,$3,null,null,$4,$5,$6)',[A,'commit',room,r.version,crypto.randomUUID(),{actions:r.actions,result:{goldDelta:[delta,-delta]},first:0,carry:1}]);
 };
 try{
  for(const role of ['anon','authenticated']){
   const perms=(await db.query("select has_function_privilege($1,'public.matgo_online_service(uuid,text,uuid,text,text,integer,uuid,jsonb)','execute') service,has_function_privilege($1,'ojjuda_matgo_internal.mark_computer_round()','execute') marker",[role])).rows[0];
   assert.deepEqual(perms,{service:false,marker:false});
  }
  assert.equal((await call(MINOR,{action:'online_create'})).error,'adult_required');

  // A real deal continues from the saved seed/transcript after one player exits.
  const room=await start(),initial=await raw(room),historical=crypto.randomUUID();
  await db.query("insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,value,source) values('matgo',$1,$2,$3,765,'online')",['member:'+A,A,historical]);
  const left=await call(A,{action:'online_leave',room_id:room});assert.equal(left.status,200);
  const continued=await raw(room);assert.equal(continued.seed,initial.seed);assert.equal(continued.round_no,initial.round_no);
  assert.deepEqual(continued.rank_excluded,[true,false]);assert.deepEqual(continued.bots,[true,false]);
  assert.equal((await call(C,{action:'online_read',room_id:room})).error,'room_not_found');
  assert.equal((await call(A,{action:'start',rules_version:13,stakes_version:1})).error,'match_in_progress','a separate wallet cannot overwrite unsettled old gold');
  const ended=await playToEnd(room);assert.equal(ended.status,'finished');assert.deepEqual(ended.rankExcluded,[true,false]);
  assert.deepEqual((await records(room)).map(r=>r.user_id),[B],'only the remaining human records a result');
  assert.deepEqual(await records(historical),[{user_id:A,value:765}],'old human results remain untouched');
  assert.equal(ended.result.paidDelta[0]+ended.result.paidDelta[1],0);
  assert.deepEqual(ended.result.gold,[100000+ended.result.paidDelta[0],100000+ended.result.paidDelta[1]]);

  // Both explicit exits finish the same real game before the last leave returns.
  const both=await start();await call(A,{action:'online_leave',room_id:both});
  const last=await call(B,{action:'online_leave',room_id:both});assert.equal(last.status,200,JSON.stringify(last));
  assert.equal(last.room.status,'finished');assert.deepEqual(last.room.rankExcluded,[true,true]);assert.deepEqual(await records(both),[]);
  assert.equal(last.room.result.paidDelta.reduce((a,b)=>a+b,0),0);
  assert.deepEqual(last.room.result.gold,last.room.result.paidDelta.map(delta=>100000+delta));
  const paid=await wallets();
  await call(A,{action:'online_leave',room_id:both});await call(B,{action:'online_read',room_id:both});
  assert.deepEqual(await wallets(),paid,'repeated closes/reads cannot settle twice');
  assert.ok(paid.every(w=>w.online_room===null));

  // AI winners receive their actual bounded transfer; the marker only affects rank.
  const winner=await start();await call(A,{action:'online_leave',room_id:winner});
  await settleTrusted(winner,1200);
  const won=await raw(winner);assert.deepEqual(won.result.paidDelta,[1200,-1200]);assert.deepEqual(won.result.gold,[101200,98800]);
  assert.deepEqual((await records(winner)).map(r=>r.user_id),[B]);

  // One timed-out turn permanently excludes that seat even after it returns.
  const timed=await start();
  const before=(await call(A,{action:'online_read',room_id:timed,stakes_version:1})).room,seat=before.game.prompt.p;
  await db.query("update ojjuda_matgo_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1",[timed]);
  const auto=await call(B,{action:'online_read',room_id:timed,stakes_version:1});assert.equal(auto.status,200);assert.deepEqual(auto.room.bots,[false,false]);
  assert.equal(auto.room.rankExcluded[seat],true);assert.equal(auto.room.rankExcluded[1-seat],false);
  await call([A,B][seat],{action:'online_read',room_id:timed,stakes_version:1});assert.equal((await raw(timed)).rank_excluded[seat],true);
  await settleTrusted(timed,500);assert.deepEqual((await records(timed)).map(r=>r.user_id),[[A,B][1-seat]]);
  await call(A,{action:'online_ready',room_id:timed,stakes_version:1});
  const next=await call(B,{action:'online_ready',room_id:timed,stakes_version:1});assert.equal(next.room.round,2);assert.deepEqual(next.room.rankExcluded,[false,false]);
  await call(A,{action:'online_leave',room_id:timed});await call(B,{action:'online_leave',room_id:timed});

  // A silent two-person disconnect is reconciled by wallet status before fresh play.
  const silent=await start();
  await db.query("update ojjuda_matgo_internal.rooms set seen_host=clock_timestamp()-interval '31 seconds',seen_guest=clock_timestamp()-interval '31 seconds' where id=$1",[silent]);
  const status=await call(A,{action:'status'});assert.equal(status.status,200,JSON.stringify(status));assert.equal(status.online_room,null);
  const old=await raw(silent);assert.equal(old.status,'finished');assert.deepEqual(old.rank_excluded,[true,true]);assert.deepEqual(await records(silent),[]);
  const fresh=await call(A,{action:'start',rules_version:13,stakes_version:1});assert.equal(fresh.status,200);assert.ok(fresh.round?.id);
  const freshWallet=await wallets();await call(A,{action:'online_leave',room_id:silent});assert.deepEqual(await wallets(),freshWallet,'late old-room cleanup cannot clear or overwrite a new solo round');
  console.log('PASS: same-deal AI continuation, both-left final settlement, original-wallet winnings/losses, permanent timeout/leave ranking exclusion, retained history, rematch reset, silent disconnect reconciliation, exact-once settlement and service-only permissions.');
 }finally{await f.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
