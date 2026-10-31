const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fixture,ids:[A,B,C,D,MINOR,BANNED,ANON]}=require('./roulette-db.test.cjs');

(async()=>{
 const {db,call}=await fixture();let checks=0;
 const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++};
 const fails=async(fn,error)=>{await assert.rejects(fn,error);checks++};
 const status=async actor=>(await call(actor,'status')).wallet;
 const refill=(actor,request=randomUUID(),paid=false,extra={})=>call(actor,'refill',{request_id:request,paid,...extra});
 const funds=async(actor,gold,coins)=>{
  await call(actor,'status');
  await db.query('update ojjuda_roulette_internal.wallets set gold=$2 where user_id=$1',[actor,gold]);
  if(coins!==undefined)await db.query('update public.user_private set coins=$2 where user_id=$1',[actor,coins]);
 };
 const receipts=async actor=>(await db.query('select count(*)::int n from ojjuda_roulette_internal.refills where user_id=$1',[actor])).rows[0].n;
 const expire=room=>db.query("update ojjuda_roulette_internal.rounds set started_at=clock_timestamp()-interval '31 seconds' where room_id=$1",[room]);
 try{
  // The production account table already has updated_at; keep the shared
  // historical fixture unchanged and add that real column in this test only.
  await db.exec('alter table public.user_private add column updated_at timestamptz default now()');
  const directory=path.join(__dirname,'../supabase/migrations');
  for(const suffix of['_roulette_computer_mode.sql','_roulette_gold_refills.sql']){
   const filename=fs.readdirSync(directory).find(name=>name.endsWith(suffix));
   assert.ok(filename,'required real migration exists: '+suffix);
   await db.exec(fs.readFileSync(path.join(directory,filename),'utf8'));
  }

  for(const actor of[null,ANON])await fails(()=>refill(actor),/not_signed_in/);
  await fails(()=>refill(MINOR),/adult_required/);await fails(()=>refill(BANNED),/banned/);
  for(const role of['anon','authenticated','service_role']){
   equal((await db.query("select has_table_privilege($1,'ojjuda_roulette_internal.refills','select,insert,update,delete') allowed",[role])).rows[0].allowed,false);
   for(const name of['refill_locked(uuid)','wallet_snapshot(uuid)','apply_refill(uuid,uuid,boolean,timestamptz)']){
    equal((await db.query("select has_function_privilege($1,$2,'execute') allowed",[role,'ojjuda_roulette_internal.'+name])).rows[0].allowed,false);
   }
  }
  equal((await db.query("select relrowsecurity enabled from pg_class where oid='ojjuda_roulette_internal.refills'::regclass")).rows[0].enabled,true);
  const initial=await status(A);
  equal(initial,{gold:10000,available:10000,coins:20,free_left:2,refill_cost:0,refill_amount:10000,refill_locked:false,can_refill:false,charged:0,duplicate:false});
  for(const payload of[{}, {request_id:''},{request_id:'not-a-uuid'},{request_id:123},{request_id:randomUUID(),paid:null},{request_id:randomUUID(),paid:'true'},{request_id:randomUUID(),paid:1}]){
   await fails(()=>call(A,'refill',payload),/invalid_request/);
  }
  equal(await receipts(A),0,'invalid requests never consume a free credit');
  await funds(A,1000);await fails(()=>refill(A),/gold_not_empty/);
  equal((await status(A)).can_refill,false,'exactly 1,000G is not eligible');
  await funds(A,999);equal((await status(A)).can_refill,true);
  const first=randomUUID();let response=await refill(A,first,false,{user_id:B,gold:999999,free_used:-1,cost:0});
  equal([response.wallet.gold,response.wallet.coins,response.wallet.free_left,response.wallet.charged],[10999,20,1,0],'free credit is additive and identity/amount overrides are ignored');
  equal((await status(B)).gold,10000,'another account is untouched');
  response=await refill(A,first,true);equal([response.wallet.gold,response.wallet.free_left,response.wallet.duplicate,response.wallet.charged],[10999,1,true,0]);
  equal(await receipts(A),1);await fails(()=>refill(A),/gold_not_empty/);

  await db.query("update ojjuda_roulette_internal.wallets set updated_at=now()-interval '30 days' where user_id=$1",[A]);
  await db.query("update ojjuda_roulette_internal.refills set created_at=now()-interval '30 days' where user_id=$1",[A]);
  equal((await status(A)).free_left,1,'free credits do not reset on a later day/month');
  await funds(A,0);response=await refill(A,randomUUID(),true);
  equal([response.wallet.gold,response.wallet.free_left,response.wallet.refill_cost,response.wallet.coins,response.wallet.charged],[10000,0,10,20,0],'paid=true cannot spend ZU while a free credit remains');
  await funds(A,500);await fails(()=>refill(A),/paid_confirmation_required/);
  equal([(await status(A)).gold,(await status(A)).coins,await receipts(A)],[500,20,2]);
  await funds(A,500,9);equal((await status(A)).can_refill,false,'insufficient shared ZU disables paid refill');
  await fails(()=>refill(A,randomUUID(),true),/insufficient_zzu/);
  equal([(await status(A)).gold,(await status(A)).coins,await receipts(A)],[500,9,2],'failed payment rolls back gold, free count and receipt');
  await funds(A,500,20);const paidRequest=randomUUID();response=await refill(A,paidRequest,true);
  equal([response.wallet.gold,response.wallet.free_left,response.wallet.coins,response.wallet.charged],[10500,0,10,10]);
  response=await refill(A,paidRequest,false);equal([response.wallet.gold,response.wallet.coins,response.wallet.duplicate,response.wallet.charged],[10500,10,true,10],'paid retry needs no second confirmation or debit');
  await funds(A,900);response=await refill(A,paidRequest,true);
  equal([response.wallet.gold,response.wallet.coins,response.wallet.duplicate],[900,10,true],'reusing a receipt after spending never refills again');
  response=await refill(A,randomUUID(),true);equal([response.wallet.gold,response.wallet.coins],[10900,0]);
  equal(await receipts(A),4);

  // These client calls are deliberately submitted together; PGlite serializes
  // transactions. They check replay/interleaving behavior, not multi-backend
  // Postgres lock scheduling (the migration keeps room-before-wallet order).
  await funds(B,500);const bRequest=first;
  const same=await Promise.all([refill(B,bRequest),refill(B,bRequest),refill(B,bRequest)]);
  equal(same.map(x=>x.wallet.duplicate),[false,true,true]);
  equal([(await status(B)).gold,(await status(B)).free_left,await receipts(B)],[10500,1,1],'same token is actor-scoped and simultaneous retries add once');
  await funds(C,500);
  const different=await Promise.allSettled([refill(C),refill(C)]);
  equal(different.filter(x=>x.status==='fulfilled').length,1);
  equal(different.filter(x=>x.status==='rejected').map(x=>x.reason.message),['gold_not_empty']);
  equal([(await status(C)).gold,(await status(C)).free_left,await receipts(C)],[10500,1,1],'two devices with different IDs cannot spend both free credits at once');

  // Install the actual poker wallet/economic function, not a mock debit, to
  // verify that independent gold/free counters still contend for shared ZU.
  const poker=fs.readFileSync(path.join(directory,'20261021015125_poker_wallet_ranking_lobby.sql'),'utf8');
  const tables=poker.slice(poker.indexOf('create table ojjuda_poker_internal.wallets'),poker.indexOf('alter table ojjuda_poker_internal.rooms'));
  const wallet=poker.slice(poker.indexOf('create function ojjuda_poker_internal.wallet('),poker.indexOf('create function ojjuda_poker_internal.room_result('));
  await db.exec('create schema ojjuda_poker_internal;'+tables+`
   create table ojjuda_poker_internal.rooms(id uuid primary key,members uuid[],state jsonb);
   create function ojjuda_poker_internal.check_member(p_actor uuid) returns void language sql as $$select ojjuda_roulette_internal.check_member(p_actor)$$;
  `+wallet);
  const pokerCall=(actor,request,paid=true)=>db.transaction(async tx=>{
   await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
   return(await tx.query('select ojjuda_poker_internal.wallet($1,true,$2,$3) value',[actor,request,paid])).rows[0].value;
  });
  await funds(C,500,10);
  await db.query('update ojjuda_roulette_internal.wallets set free_used=2 where user_id=$1',[C]);
  await db.query('insert into ojjuda_poker_internal.wallets(user_id,gold,free_used) values($1,500,2)',[C]);
  const crossGame=await Promise.allSettled([refill(C,randomUUID(),true),pokerCall(C,randomUUID())]);
  equal(crossGame.filter(x=>x.status==='fulfilled').length,1,'one shared ZU balance cannot fund both concurrent game requests');
  equal(crossGame.filter(x=>x.status==='rejected').map(x=>x.reason.message),['insufficient_zzu']);
  equal((await status(C)).coins,0);equal((await status(C)).gold,10500);
  equal((await db.query('select gold::int gold from ojjuda_poker_internal.wallets where user_id=$1',[C])).rows[0].gold,500);
  await funds(D,500,20);
  await db.query('insert into ojjuda_poker_internal.wallets(user_id,gold) values($1,500)',[D]);
  const pokerFree=await pokerCall(D,randomUUID(),false);
  equal([pokerFree.gold,pokerFree.free_left,pokerFree.coins],[5500,1,20]);
  equal((await status(D)).free_left,2,'another game does not consume roulette lifetime credits');
  await refill(D);equal((await status(D)).free_left,1);
  equal((await db.query('select gold::int gold,free_used from ojjuda_poker_internal.wallets where user_id=$1',[D])).rows[0],{gold:5500,free_used:1});

  let room=(await call(B,'create',{capacity:4})).room;
  await call(B,'ready',{code:room.code,bets:{red:10000}});
  response=await call(B,'read',{code:room.code});
  equal([response.wallet.gold,response.room.me.stake,response.wallet.refill_locked,response.wallet.can_refill],[500,10000,true,false],'escrow-low available gold cannot qualify for credit');
  await fails(()=>refill(B),/round_in_progress/);
  response=await refill(B,bRequest);equal([response.wallet.duplicate,response.wallet.gold,response.room.id],[true,500,room.id],'old receipt remains replayable after a round is reserved');
  await call(B,'ready',{code:room.code,ready:false});
  equal((await status(B)).gold,10500);await fails(()=>refill(B),/gold_not_empty/);

  await call(D,'join',{code:room.code});await funds(D,500);
  await call(D,'bet',{code:room.code,bets:{red:500}});
  equal((await status(D)).can_refill,true,'unready draft chips do not reserve gold');
  response=await refill(D);
  equal([response.wallet.gold,response.room.me.bets,response.room.me.stake,response.room.me.ready],[10500,{red:500},0,false],'refill preserves the current unready draft and room');
  await call(B,'ready',{code:room.code,bets:{red:10000}});
  const spinning=await call(D,'ready',{code:room.code,bets:{black:500}});
  equal(spinning.room.status,'spinning');await fails(()=>refill(B),/round_in_progress/);
  await expire(room.id);equal((await call(B,'read',{code:room.code})).room.status,'finished');
  await fails(()=>refill(B),/round_in_progress/);
  await call(B,'confirm',{code:room.code,roundId:spinning.room.spin.id});
  equal((await status(B)).refill_locked,true,'a finished table remains locked while another player is confirming');
  await fails(()=>refill(B),/round_in_progress/);
  await call(D,'confirm',{code:room.code,roundId:spinning.room.spin.id});
  equal((await status(B)).refill_locked,false);await funds(B,500);
  response=await refill(B);equal([response.wallet.gold,response.wallet.free_left],[10500,0]);

  // Zero-bet observers also wait until their current round is closed/left.
  await funds(D,500,20);await call(B,'ready',{code:room.code,bets:{red:100}});
  await call(D,'ready',{code:room.code,bets:{}});await fails(()=>refill(D,randomUUID(),true),/round_in_progress/);
  await call(D,'leave',{code:room.code});
  response=await refill(D,randomUUID(),true);equal([response.wallet.gold,response.wallet.coins],[10500,10],'leaving settles the zero receipt before eligibility is checked');
  await call(B,'leave',{code:room.code});

  // Countdown expiry must seal the saved draft before testing eligibility.
  await funds(A,500,20);room=(await call(A,'create')).room;await call(B,'join',{code:room.code});
  await call(A,'bet',{code:room.code,bets:{red:500}});await call(B,'ready',{code:room.code,bets:{black:100}});
  await db.query("update ojjuda_roulette_internal.rooms set betting_deadline=clock_timestamp()-interval '1 second' where id=$1",[room.id]);
  const beforeExpiry=await receipts(A);await fails(()=>refill(A,randomUUID(),true),/round_in_progress/);
  equal(await receipts(A),beforeExpiry);equal((await db.query('select coins from public.user_private where user_id=$1',[A])).rows[0].coins,20);
  response=await call(A,'read',{code:room.code});equal([response.room.status,response.wallet.gold,response.wallet.refill_locked],['spinning',0,true]);
  await call(A,'leave',{code:room.code});await call(B,'leave',{code:room.code});

  // The same account keeps its exhausted credits when switching game modes.
  await funds(A,500,20);room=(await call(A,'create',{mode:'solo'})).room;
  equal(room.mode,'solo');equal((await status(A)).free_left,0);
  response=await refill(A,randomUUID(),true);
  equal([response.wallet.gold,response.wallet.coins,response.wallet.free_left,response.room.mode],[10500,10,0,'solo']);
  await call(A,'ready',{code:room.code,bets:{red:10000}});await fails(()=>refill(A,randomUUID(),true),/round_in_progress/);
  equal((await db.query('select count(*)::int n from ojjuda_roulette_internal.wallets where user_id not in(select id from auth.users)')).rows[0].n,0,'computer seats never acquire wallets or free credits');

  console.log(`PASS: ${checks} roulette refill checks: lifetime two freebies, strict 1,000G floor, additive 10,000G, 10-ZU confirmation, auth/private permissions, receipts/replays, overlapping client requests, actual poker shared-ZU calls, escrow/countdown/observer/result locks, draft preservation and solo/online shared account credits.`);
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
