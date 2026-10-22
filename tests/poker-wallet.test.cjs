const assert=require('node:assert/strict');
const {fixture}=require('./poker-online-fixture.cjs');
(async()=>{
 const f=await fixture(),{db,call,publicRpc,users}=f,[A,B,C,,MINOR]=users;
 const status=async actor=>{const r=await call(actor,{action:'status'});assert.equal(r.status,200,JSON.stringify(r));return r.wallet;};
 const act=(actor,r,action,extra={})=>call(actor,{action,room_id:r.id,version:r.version,request_id:crypto.randomUUID(),...extra});
 const refill=(actor,paid,id=crypto.randomUUID())=>call(actor,{action:'refill',paid,request_id:id});
 const low=actor=>db.query('update ojjuda_poker_internal.wallets set gold=900 where user_id=$1',[actor]);
 const expire=id=>db.query("update ojjuda_poker_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1",[id]);
 try{
  assert.equal((await call(MINOR,{action:'status'})).error,'adult_required');
  let w=await status(A);assert.equal(w.gold,5000);assert.equal(w.free_left,2);assert.equal(w.coins,20);
  assert.equal((await refill(A,false)).error,'gold_not_empty');
  await db.query('update ojjuda_poker_internal.wallets set gold=1000 where user_id=$1',[A]);
  assert.equal((await refill(A,false)).error,'gold_not_empty','1,000 G is outside the refill range');
  for(const [gold,left] of [[999,1],[900,0]]){
   await db.query('update ojjuda_poker_internal.wallets set gold=$2 where user_id=$1',[A,gold]);
   const id=crypto.randomUUID(),r=await refill(A,false,id);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.wallet.gold,gold+5000);assert.equal(r.wallet.free_left,left);assert.equal(r.wallet.coins,20);
   const duplicate=await refill(A,false,id);assert.equal(duplicate.wallet.duplicate,true);assert.equal(duplicate.wallet.gold,gold+5000);assert.equal(duplicate.wallet.free_left,left);
  }
  await low(A);assert.equal((await refill(A,false)).error,'paid_confirmation_required');
  w=await status(A);assert.equal(w.free_left,0);assert.equal(w.coins,20,'refused payment never debits ZU');
  const paidId=crypto.randomUUID(),paid=await refill(A,true,paidId);assert.equal(paid.wallet.charged,5);assert.equal(paid.wallet.coins,15);assert.equal(paid.wallet.gold,5900);
  const paidRetry=await refill(A,true,paidId);assert.equal(paidRetry.wallet.coins,15);assert.equal(paidRetry.wallet.duplicate,true);
  await low(A);const racing=await Promise.all([refill(A,true),refill(A,true)]);assert.equal(racing.filter(r=>r.status===200).length,1);assert.equal((await status(A)).coins,10,'parallel refill charges once');
  await low(A);await db.query('update public.user_private set coins=4 where user_id=$1',[A]);
  assert.equal((await refill(A,true)).error,'insufficient_zzu');assert.equal((await status(A)).gold,900);
  await db.query("update ojjuda_poker_internal.wallets set gold=5000,updated_at=now()-interval '2 days' where user_id=$1",[A]);
  assert.equal((await status(A)).free_left,0,'free allowance does not reset on another day or device');
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query("select has_table_privilege($1,'ojjuda_poker_internal.wallets','update') v",[role])).rows[0].v,false);
   assert.equal((await db.query("select has_function_privilege($1,'ojjuda_poker_internal.wallet(uuid,boolean,uuid,boolean)','execute') v",[role])).rows[0].v,false);
  }
  // Computer play uses the same server-authoritative wallet; never a client result.
  let r=(await call(A,{action:'create',request_id:crypto.randomUUID(),options:{mode:'solo',capacity:4,title:'컴퓨터 대전',difficulty:'normal'}})).room;
  assert.equal(r.mode,'solo');assert.equal(r.game.players.length,4);assert.equal(r.status,'active');
  assert.equal((await refill(A,true)).error,'round_in_progress');
  assert.equal((await publicRpc(B,'arcade_extra_rooms')).rooms.some(x=>x.kind==='poker'),false,'solo games are private');
  let count=0;
  while(r.status==='active'){
   assert.ok(++count<180,'solo game finishes');
   if(['between','runout'].includes(r.game.phase)||r.game.turn!==0){await expire(r.id);const next=await call(A,{action:'read',room_id:r.id});assert.equal(next.status,200,JSON.stringify(next));r=next.room;continue;}
   const g=r.game,command=g.phase==='discard'?{type:'discard',index:0}:g.phase==='open'?{type:'open',index:0}:{type:g.legal.check?'check':'call'};
   const moved=await act(A,r,'move',{command,state:{gold:99999999},gold:99999999});assert.equal(moved.status,200,JSON.stringify(moved));r=moved.room;
  }
  w=await status(A);assert.equal(w.gold,r.game.players[0].stack);assert.equal(w.rounds,1);assert.equal(w.locked,false);
  const ranks=await publicRpc(A,'community_game_monthly_ranking',['poker']);assert.equal(ranks[0].score,w.gold);assert.equal(ranks[0].me,true);
  await assert.rejects(()=>publicRpc(MINOR,'community_game_monthly_ranking',['poker']),/adult_required/);
  assert.equal((await act(A,r,'leave')).status,200);
  // Creating, leaving, and reopening rooms cannot mint a new 5,000 G bankroll.
  await db.query('update ojjuda_poker_internal.wallets set gold=700 where user_id=$1',[A]);
  let created=await call(A,{action:'create',request_id:crypto.randomUUID(),options:{capacity:2,title:'공개 포커방'}});r=created.room;
  assert.equal(created.wallet.gold,700);
  const feed=await publicRpc(B,'arcade_extra_rooms'),card=feed.rooms.find(x=>x.kind==='poker');
  assert.equal(card.code,r.code);assert.equal(card.capacity,2);assert.equal(card.players,1);assert.equal(card.status,'waiting');assert.equal(card.native,true);
  assert.equal((await publicRpc(MINOR,'arcade_extra_rooms')).rooms.some(x=>x.kind==='poker'),false,'minors cannot see poker rooms');
  await call(B,{action:'join',code:r.code});r=(await call(A,{action:'read',room_id:r.id})).room;
  const started=await act(A,r,'start');assert.equal(started.status,200,JSON.stringify(started));r=started.room;assert.equal(r.game.players[0].initial,700);
  assert.equal((await publicRpc(C,'arcade_extra_rooms')).rooms.find(x=>x.kind==='poker').status,'playing');
  const left=await act(A,r,'leave');assert.equal(left.status,200);assert.equal(left.wallet.locked,false);assert.equal(left.wallet.gold,650);
  assert.equal((await status(A)).free_left,0,'room changes never restore free refills');
  const other=(await call(B,{action:'read',room_id:r.id})).room;await act(B,other,'leave');
  assert.equal((await publicRpc(C,'arcade_extra_rooms')).rooms.some(x=>x.kind==='poker'),false,'closed room leaves the shared feed');
  const resumed=await call(A,{action:'create',request_id:crypto.randomUUID(),options:{capacity:2,title:'다음 방'}});assert.equal(resumed.wallet.gold,650);
  console.log('PASS: 2 lifetime free refills, additive 5,000 G, paid confirmation, 5 ZU atomic debit, duplicate/racing/insufficient refills, server solo, persistent multiplayer gold, ranking and age-filtered public rooms');
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
