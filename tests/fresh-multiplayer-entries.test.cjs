const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto'),{fixture,ids,read}=require('./multiplayer-session-fixture.cjs');
const signatures=[
 'ojjuda_tank_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)',
 'ojjuda_marble_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)',
 'public.bang_online_service(uuid,text,uuid,text,uuid,jsonb,integer,jsonb)',
 'ojjuda_poker_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)',
 'ojjuda_game_internal.capture_ranked_round()',
 'ojjuda_shop_internal.bang_hint_buy(uuid,uuid,integer,boolean)'
];
const actions=(f,kind)=>async(actor,body)=>{const result=await f.callGame(kind,actor,body);assert.equal(result.ok,true,kind+' '+body.action+': '+JSON.stringify(result));return result;};
const raw=(f,kind,id)=>f.db.query(`select * from ojjuda_${kind}_internal.rooms where id=$1`,[id]).then(x=>x.rows[0]);
const due=(f,kind,id)=>f.db.query(`update ojjuda_${kind}_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1`,[id]);
async function table(f,kind,actors){
 const call=actions(f,kind),request_id=randomUUID();
 const options={title:'테스트 게임',capacity:actors.length,...(kind==='marble'?{maxRound:15}:{}),...(kind==='poker'?{mode:'online'}:{})};
 let room=(await call(actors[0],{action:'create',request_id,options})).room;
 for(const actor of actors.slice(1))room=(await call(actor,{action:'join',code:room.code})).room;
 room=(await call(actors[0],{action:'start',room_id:room.id,version:room.version,request_id:randomUUID()})).room;
 return {room,call,createRequest:request_id,options};
}
const currentSeat=(kind,state)=>kind==='bang'?state.pending?.player??state.current:state.turn;
const leave=(call,actor,room)=>call(actor,{action:'leave',room_id:room.id,version:room.version,request_id:randomUUID()});

test('handoff migration preserves function security and rejects an unexpected predecessor',async t=>{
 const f=await fixture({migrate:false});try{
  const metadata=()=>Promise.all(signatures.map(async signature=>(await f.db.query('select oid::regprocedure::text signature,proowner::regrole::text owner,proacl::text acl,prosecdef,proconfig,md5(pg_get_functiondef(oid)) hash from pg_proc where oid=$1::regprocedure',[signature])).rows[0]));
  const before=await metadata(),dir=path.join(__dirname,'../supabase/migrations'),migration=read(fs.readdirSync(dir).find(name=>name.endsWith('_fresh_multiplayer_entries.sql')));
  await f.db.exec(migration);const after=await metadata();
  for(let i=0;i<before.length;i++){const security=({hash,...rest})=>rest;assert.deepEqual(security(after[i]),security(before[i]));assert.notEqual(after[i].hash,before[i].hash);assert.equal((await f.db.query("select has_function_privilege('authenticated',$1,'execute') permitted",[signatures[i]])).rows[0].permitted,i===5,'the existing member-only hint API keeps its original permission; trusted game services stay inaccessible');}
  t.diagnostic('Previous function hashes: '+JSON.stringify(before.map(({signature,hash})=>({signature,hash}))));
  t.diagnostic('Updated function hashes: '+JSON.stringify(after.map(({signature,hash})=>({signature,hash}))));
  await assert.rejects(()=>f.db.exec(migration),/already exists/,'a duplicate migration cannot silently patch a different definition');
 }catch(error){delete error.query;throw error;}finally{await f.close();}
});

for(const kind of ['tank','marble','bang'])test(kind+': leave preserves the exact seat, AI continues it, access retires, and final departure is bounded',async()=>{
 const f=await fixture();try{
  const actors=ids.slice(0,kind==='bang'?5:2),{room,call,createRequest,options}=await table(f,kind,actors),before=await raw(f,kind,room.id);
  const seat=currentSeat(kind,before.state),actor=actors[seat],remaining=actors.filter(id=>id!==actor);
  let hintRequest;
  if(kind==='bang'){
   hintRequest=randomUUID();await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
   assert.equal((await f.db.query('select public.bang_hint_buy($1,$2,$3,false) v',[hintRequest,room.id,before.version])).rows[0].v.ok,true);
  }
  assert.equal((await leave(call,actor,room)).room,null);const handed=await raw(f,kind,room.id);
  assert.deepEqual(handed.state,before.state,'leaving cannot fold, kill, bankrupt, redeal or skip this seat');
  assert.deepEqual(handed.members,before.members);assert.deepEqual(handed.names,before.names);assert.ok(handed.computer_seats.includes(seat));assert.ok(handed.rank_excluded.includes(seat));
  assert.equal(handed.status,'active');assert.equal((await call(actor,{action:'mine'})).room,null);
  assert.notEqual((await f.callGame(kind,actor,{action:'read',room_id:room.id})).ok,true,'a departed account cannot read its old hand');
  assert.notEqual((await f.callGame(kind,actor,{action:'join',code:room.code})).ok,true,'an old room code cannot reclaim a computer seat');
  if(kind==='bang'){
   assert.equal((await f.db.query('select public.bang_hint_buy($1,$2,$3,false) v',[randomUUID(),room.id,handed.version])).rows[0].v.reason,'room_unavailable','a departed seat cannot buy a new hint for an inherited hand');
   assert.equal((await f.db.query('select public.bang_hint_buy($1,$2,$3,true) v',[hintRequest,room.id,before.version])).rows[0].v.ok,true,'an existing purchase receipt remains recoverable after leaving');
  }
  if(seat===0)assert.equal((await f.callGame(kind,actor,{action:'create',request_id:createRequest,options})).error,'room_unavailable','a lost create response cannot reclaim the departed seat');
  if(kind==='poker'){
   const mine=await call(actor,{action:'mine'});assert.equal(mine.wallet.locked,true);assert.equal(mine.wallet.available,0,'the same gold is not refunded while AI can still spend it');
   assert.equal((await f.callGame(kind,actor,{action:'create',request_id:randomUUID(),options:{mode:'solo',capacity:4,title:'새 게임'}})).error,'round_in_progress');
  }else{
   const next=await call(actor,{action:'create',request_id:randomUUID(),options:{title:'새 게임',capacity:kind==='bang'?4:2,...(kind==='marble'?{maxRound:15}:{})}});
   assert.notEqual(next.room.id,room.id,'the departed person can start a different room');
  }
  await due(f,kind,room.id);const advanced=await call(remaining[0],{action:'read',room_id:room.id}),after=await raw(f,kind,room.id);
  assert.equal(advanced.room.id,room.id);assert.ok(after.version>handed.version);assert.notDeepEqual(after.state,handed.state,'existing server AI makes a real move from the inherited position');
  assert.ok(advanced.room.computerSeats.includes(seat));assert.ok(advanced.room.rankExcluded.includes(seat));
  if(kind==='tank')assert.match(advanced.room.game.tanks[seat].name,/컴퓨터/);
  if(kind==='marble')assert.match(advanced.room.game.players[seat].name,/컴퓨터/);
  if(kind==='tank'){assert.equal(after.state.shotNo,before.state.shotNo+1);assert.equal(advanced.room.event.computer,true);assert.ok(advanced.room.event.command.weapon<=2);assert.equal((await f.db.query('select coins from public.user_private where user_id=$1',[remaining[0]])).rows[0].coins,100,'the other player is never charged for the AI shell');}
  if(kind==='bang')assert.ok(advanced.room.state.players[seat].hand.every(card=>card.hidden),'the inherited hand remains private');
  if(kind==='poker')assert.ok(advanced.room.game.players[seat].cards.some(card=>String(card).startsWith('hidden:')),'AI hole cards are still hidden');
  for(const person of remaining){const latest=await raw(f,kind,room.id);await leave(call,person,latest);}
  const final=await raw(f,kind,room.id);assert.equal(final.status,'closed');
  assert.equal((await f.callGame(kind,actors[0],{action:'create',request_id:createRequest,options})).error,'room_unavailable','a closed create request cannot re-open the old round');
  if(kind==='poker'){
   assert.equal(final.state.phase,'finished');assert.equal(final.settled_round,final.round);
   const wallets=(await f.db.query('select * from ojjuda_poker_internal.wallets where user_id=any($1)',[actors])).rows;
   assert.ok(wallets.every(w=>w.active_room===null));assert.equal(wallets.reduce((sum,w)=>sum+Number(w.gold),0),actors.length*5000,'final AI settlement conserves all real gold');
   assert.ok(wallets.every(w=>w.rounds===0&&w.wins===0),'AI-taken-over hands do not increment personal records');
   const mine=await call(actor,{action:'mine'});assert.equal(mine.room,null);assert.equal(mine.wallet.locked,false);
   assert.equal((await call(actor,{action:'create',request_id:randomUUID(),options:{mode:'online',capacity:2,title:'정산 후 새 방'}})).room.status,'waiting');
  }else assert.equal((await f.db.query('select count(*)::int n from ojjuda_guest_internal.round_records where round_id=$1',[room.id])).rows[0].n,0,'closing an all-computer table cannot invent a ranked win');
 }catch(error){delete error.query;throw error;}finally{await f.close();}
});

for(const mode of ['solo','local'])test('tank '+mode+': the sole account leaving closes the private game without a fabricated win',async()=>{
 const f=await fixture();try{
  const call=actions(f,'tank');let room=(await call(ids[0],{action:'create',request_id:randomUUID(),options:{mode,capacity:4,title:'새 판'}})).room;
  room=(await call(ids[0],{action:'start',room_id:room.id,version:room.version,request_id:randomUUID()})).room;
  const before=await raw(f,'tank',room.id);await leave(call,ids[0],room);const after=await raw(f,'tank',room.id);
  assert.equal(after.status,'closed');assert.deepEqual(after.state,before.state);assert.equal((await call(ids[0],{action:'mine'})).room,null);
  assert.equal((await f.db.query('select count(*)::int n from ojjuda_tank_internal.wins where room_id=$1',[room.id])).rows[0].n,0);
 }catch(error){delete error.query;throw error;}finally{await f.close();}
});

for(const kind of ['tank','marble','bang'])test(kind+': eliminated spectators do not keep an abandoned game active or lose their human eligibility',async()=>{
 const f=await fixture();try{
  const {room,call}=await table(f,kind,ids.slice(0,kind==='bang'?4:3)),before=await raw(f,kind,room.id),state=structuredClone(before.state);
  const players=kind==='tank'?state.tanks:state.players;
  for(let seat=1;seat<players.length;seat++)if(kind==='tank')players[seat].hp=0;else if(kind==='marble')players[seat].bankrupt=true;else players[seat].alive=false;
  await f.db.query(`update ojjuda_${kind}_internal.rooms set state=$2 where id=$1`,[room.id,state]);
  await leave(call,ids[1],room);let after=await raw(f,kind,room.id);assert.equal(after.status,'active');assert.deepEqual(after.rank_excluded,[],'merely leaving a dead spectator seat is not AI assistance');
  await leave(call,ids[0],after);after=await raw(f,kind,room.id);assert.equal(after.status,'closed');assert.deepEqual(after.state,state);assert.deepEqual(after.rank_excluded,[0]);
 }catch(error){delete error.query;throw error;}finally{await f.close();}
});

for(const kind of ['tank','marble','bang'])test(kind+': deadline AI records exclusion without ejecting a returning human',async()=>{
 const f=await fixture();try{
  const actors=ids.slice(0,kind==='bang'?4:2),{room,call}=await table(f,kind,actors),before=await raw(f,kind,room.id),seat=currentSeat(kind,before.state);
  await due(f,kind,room.id);await call(actors.find((_,i)=>i!==seat),{action:'read',room_id:room.id});
  const after=await raw(f,kind,room.id);assert.deepEqual(after.computer_seats,[]);assert.deepEqual(after.rank_excluded,[seat]);
  assert.notDeepEqual(after.state,before.state);assert.equal((await call(actors[seat],{action:'mine'})).room.id,room.id,'same-visit reconnect keeps the original human seat');
  assert.equal((await call(actors[seat],{action:'read',room_id:room.id})).room.seat,seat);
 }catch(error){delete error.query;throw error;}finally{await f.close();}
});

test('a naturally eliminated Bang deputy keeps the human team result after leaving spectators',async()=>{
 const f=await fixture();try{
  const {room,call}=await table(f,'bang',ids.slice(0,5)),initial=await raw(f,'bang',room.id);
  const {onlineGame}=await import('../supabase/functions/bang/online-engine.js');const game=onlineGame(structuredClone(initial.state),()=>.42),deputy=game.s.players.findIndex(p=>p.role==='deputy');assert.ok(deputy>=0);
  game.eliminate(deputy,null);game.pump();await f.db.query('update ojjuda_bang_internal.rooms set state=$2 where id=$1',[room.id,game.s]);
  await leave(call,ids[deputy],room);assert.equal((await raw(f,'bang',room.id)).rank_excluded.includes(deputy),false);
  for(const player of game.s.players.filter(p=>p.alive&&!['sheriff','deputy'].includes(p.role))){const latest=await raw(f,'bang',room.id);if(latest.status!=='active')break;await call(ids[player.id],{action:'surrender',room_id:room.id,version:latest.version,request_id:randomUUID()});}
  assert.equal((await raw(f,'bang',room.id)).status,'finished');
  const result=(await f.db.query('select won from ojjuda_bang_internal.results where room_id=$1 and user_id=$2',[room.id,ids[deputy]])).rows[0];assert.equal(result.won,true);
 }catch(error){delete error.query;throw error;}finally{await f.close();}
});

test('Bang hands off a pending defense without changing the attack, cards or health',async()=>{
 const f=await fixture();try{
  const {room,call}=await table(f,'bang',ids.slice(0,4)),initial=await raw(f,'bang',room.id);
  const {onlineGame}=await import('../supabase/functions/bang/online-engine.js'),{makeDeck}=await import('../games/bang/data.js');
  const game=onlineGame(structuredClone(initial.state),()=>.42),deck=makeDeck(),bang=deck.find(card=>card.type==='bang'),miss=deck.find(card=>card.type==='missed');
  Object.assign(game.s,{current:0,phase:'play',pending:null,queue:[],bangs:0});
  for(const player of game.s.players){player.equipment=[];player.hand=[];player.char='bart';}
  game.s.players[0].hand=[bang];game.s.players[1].hand=[miss];game.s.deck=deck.filter(card=>![bang.id,miss.id].includes(card.id));
  assert.equal(game.play(0,bang.id,1),true);assert.equal(game.s.pending.player,1);
  await f.db.query('update ojjuda_bang_internal.rooms set state=$2 where id=$1',[room.id,game.s]);
  const before=structuredClone(game.s);await leave(call,ids[1],room);const handed=await raw(f,'bang',room.id);assert.deepEqual(handed.state,before);
  await due(f,'bang',room.id);const advanced=await call(ids[0],{action:'read',room_id:room.id}),after=await raw(f,'bang',room.id);
  assert.equal(after.state.players[1].hp,before.players[1].hp,'the inherited missed card defends the same attack');
  assert.equal(after.state.players[1].hand.some(card=>card.id===miss.id),false);assert.equal(after.state.pending,null);
  assert.deepEqual(after.rank_excluded,[1]);assert.ok(advanced.room.state.players[1].hand.every(card=>card.hidden));
 }catch(error){delete error.query;throw error;}finally{await f.close();}
});

