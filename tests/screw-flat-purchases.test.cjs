const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite'),G=require('../screw-flat.js');
const root=path.join(__dirname,'..'),storage=new Map();
global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const press=(game,x,y)=>{game.onDown(x,y,1);game.onUp(x,y,1);};
const settled=async game=>{for(let i=0;i<400&&game.state.shopBusy;i++)await new Promise(r=>setTimeout(r,5));assert.equal(game.state.shopBusy,'');};
(async()=>{
 const db=new PGlite(),member=randomUUID(),other=randomUUID(),poor=randomUUID(),shopper=randomUUID();
 await db.exec(`
  create role anon;create role authenticated;create role service_role;
  create schema auth;create schema ojjuda_note_internal;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function public.is_banned(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.banned',true),'false')='true'$$;
  create table public.user_private(user_id uuid primary key,coins integer not null check(coins>=0));
  create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid not null,kind text not null,coins integer not null,result jsonb not null);
  insert into public.user_private values('${member}',50),('${other}',10),('${poor}',0),('${shopper}',20);
 `);
 for(const suffix of ['_flat_screw_extra_holes.sql','_flat_screw_extra_moves.sql']){
  const migration=fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith(suffix));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));
 }
 const rpc=async(user,kind,id,stage,verify)=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  return(await db.query('select public.screw_upgrade_buy($1,$2,$3,$4) as result',[kind,id,stage,verify])).rows[0].result;
 };
 let r=await rpc(member,'flat_hole',null,5,true);assert.equal(r.count,0);assert.equal(r.coins,50);
 const receipt=randomUUID();
 for(const id of [receipt,randomUUID(),randomUUID()]){r=await rpc(member,'flat_hole',id,5,false);assert.equal(r.ok,true);assert.equal(r.price,1);}
 assert.equal(r.count,3);assert.equal(r.coins,47);
 r=await rpc(member,'flat_hole',randomUUID(),5,false);assert.equal(r.reason,'limit');assert.equal(r.coins,47);
 r=await rpc(member,'flat_hole',receipt,5,false);assert.equal(r.count,3);assert.equal(r.coins,47,'repeated receipt never charges again');
 assert.equal((await rpc(member,'flat_hole',receipt,6,false)).reason,'request_conflict');
 assert.equal((await rpc(other,'flat_hole',receipt,5,false)).reason,'request_conflict');
 assert.equal((await rpc(member,'flat_hole',null,6,true)).count,0);
 assert.equal((await rpc(poor,'flat_hole',randomUUID(),5,false)).reason,'coins');
 for(const stage of [0,1001,null])assert.equal((await rpc(member,'flat_hole',randomUUID(),stage,false)).reason,'invalid');
 assert.equal((await rpc(member,'flat_hole',null,5,false)).reason,'invalid');
 assert.equal((await rpc(member,'flat_hole',randomUUID(),1000,true)).reason,'not_found');
 assert.equal((await rpc(member,'flat_hole',randomUUID(),1000,false)).ok,true);
 const boxId=randomUUID();r=await rpc(member,'box',boxId,500,false);assert.equal(r.price,10);
 assert.equal((await rpc(member,'box',boxId,500,true)).coins,r.coins);
 assert.equal((await rpc(member,'box',randomUUID(),501,false)).reason,'invalid');
 assert.equal((await rpc(member,'buffer',randomUUID(),2,false)).price,3);
 await db.exec("select set_config('test.banned','true',false)");assert.equal((await rpc(member,'flat_hole',randomUUID(),6,false)).reason,'banned');
 await db.exec("select set_config('test.banned','false',false)");
 await assert.rejects(()=>rpc(null,'flat_hole',null,5,true),/not_signed_in/);
 assert.equal((await db.query("select has_function_privilege('anon','public.screw_upgrade_buy(text,uuid,integer,boolean)','execute') as allowed")).rows[0].allowed,false);
 await db.exec('set role authenticated');assert.equal((await rpc(member,'flat_hole',null,5,true)).count,3);await db.exec('reset role');

 // Current attempt-scoped v3 allows nine one-ZU hole purchases, no free tenth,
 // and retains idempotent receipts and retry isolation.
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261105171754_flat_screw_nine_extra_holes.sql'),'utf8'));
 const rpcV3=async(user,kind,id,stage,attempt,verify)=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  return(await db.query('select public.screw_upgrade_buy_v3($1,$2,$3,$4,$5) as result',[kind,id,stage,attempt,verify])).rows[0].result;
 };
 const firstAttempt=randomUUID(),firstReceipt=randomUUID();
 let paid=await rpcV3(shopper,'flat_hole',null,18,firstAttempt,true);
 assert.equal(paid.count,0);assert.equal(paid.coins,20);
 for(let i=0;i<9;i++){
  paid=await rpcV3(shopper,'flat_hole',i===0?firstReceipt:randomUUID(),18,firstAttempt,false);
  assert.equal(paid.ok,true);assert.equal(paid.count,i+1);assert.equal(paid.coins,19-i);
 }
 paid=await rpcV3(shopper,'flat_hole',randomUUID(),18,firstAttempt,false);
 assert.equal(paid.reason,'limit');assert.equal(paid.count,9);assert.equal(paid.coins,11);
 paid=await rpcV3(shopper,'flat_hole',firstReceipt,18,firstAttempt,false);
 assert.equal(paid.ok,true);assert.equal(paid.count,9);assert.equal(paid.coins,11,'idempotent receipt replay does not double-charge');
 assert.equal((await rpcV3(shopper,'flat_hole',null,18,firstAttempt,true)).count,9);
 const nextAttempt=randomUUID();
 assert.equal((await rpcV3(shopper,'flat_hole',null,18,nextAttempt,true)).count,0);
 paid=await rpcV3(shopper,'flat_hole',randomUUID(),18,nextAttempt,false);
 assert.equal(paid.count,1);assert.equal(paid.coins,10,'a new attempt starts with a new paid limit');
 assert.equal((await rpcV3(shopper,'flat_hole',firstReceipt,18,nextAttempt,false)).reason,'request_conflict');

 // Move packs use their own receipts and stage totals, with no three-pack cap.
 r=await rpc(member,'flat_moves',null,950,true);const moveBalance=r.coins;assert.equal(r.count,0);assert.equal(r.extra_moves,0);
 const moveReceipt=randomUUID();
 for(const id of [moveReceipt,randomUUID(),randomUUID(),randomUUID()]){r=await rpc(member,'flat_moves',id,950,false);assert.equal(r.price,1);assert.equal(r.moves_per_purchase,3);}
 assert.equal(r.count,4);assert.equal(r.extra_moves,12);assert.equal(r.coins,moveBalance-4);
 r=await rpc(member,'flat_moves',moveReceipt,950,false);assert.equal(r.extra_moves,12);assert.equal(r.coins,moveBalance-4);
 assert.equal((await rpc(member,'flat_hole',moveReceipt,950,false)).reason,'request_conflict');
 assert.equal((await rpc(other,'flat_moves',moveReceipt,950,false)).reason,'request_conflict');
 assert.equal((await rpc(member,'flat_moves',moveReceipt,951,false)).reason,'request_conflict');
 assert.equal((await rpc(member,'flat_moves',null,951,true)).extra_moves,0);
 assert.equal((await rpc(member,'flat_hole',null,950,true)).count,0,'move packs never add holes');
 assert.equal((await rpc(poor,'flat_moves',randomUUID(),950,false)).reason,'coins');
 for(const stage of [0,1001,null])assert.equal((await rpc(member,'flat_moves',randomUUID(),stage,false)).reason,'invalid');
 assert.equal((await rpc(member,'flat_moves',null,950,false)).reason,'invalid');

 // The shipped flat game uses the newer attempt-scoped v3 RPC; keep the
 // older PostgreSQL v2 checks above for backwards compatibility.
 await db.close();
 const credits=new Map([[other,20],[poor,0]]),receipts=new Map(),counts=new Map();
 let user=other,buyCalls=0,loseResponse=false,release=null;
 const receiptKey=(who,kind,stage,attempt)=>`${who}:${kind}:${stage}:${attempt}`;
 const api={getUserId:()=>user,getCoins:()=>credits.get(user),setScore(){},end(){},buyScrew:async(kind,id,stage,verify,attempt)=>{
  const who=user;assert.match(attempt,/^[0-9a-f-]{36}$/);
  if(!verify){buyCalls++;if(release)await release.promise;}
  const key=receiptKey(who,kind,stage,attempt),count=counts.get(key)||0;
  const current=()=>{const paid=counts.get(key)||0;return {ok:true,stage,attempt_id:attempt,count:paid,extra_moves:kind==='flat_moves'?paid*3:0,coins:credits.get(who)};};
  if(verify)return current();
  if(receipts.has(id))return receipts.get(id);
  if(kind==='flat_hole'&&count>=9)return {...current(),reason:'limit'};
  if(credits.get(who)<1)return {...current(),ok:false,reason:'coins'};
  credits.set(who,credits.get(who)-1);counts.set(key,count+1);
  const result=current();receipts.set(id,result);
  if(loseResponse){loseResponse=false;throw Error('response lost after payment');}
  return result;
 }};
 storage.set(G.STAGE_KEY,'1000');let game=G.flat(api,12);await settled(game);
 assert.equal(game.state.L,12);assert.equal(game.state.extraHoles,0);
 let resolve;release={promise:new Promise(r=>resolve=r)};
 press(game,106,514);press(game,106,514);assert.equal(buyCalls,1,'double taps cannot duplicate a purchase');resolve();release=null;await settled(game);
 assert.equal(game.state.extraHoles,1);assert.equal(credits.get(other),19);
 const extra=game.state.level.holes.find(h=>h.extra),screw=game.state.level.screws[game.state.level.order[0]];
 press(game,screw.hole.x,screw.hole.y);for(let i=0;i<10;i++)game.update(.05);
 press(game,extra.x,extra.y);for(let i=0;i<60;i++)game.update(.05);
 assert.equal(screw.hole.id,extra.id,'a paid hole supports a real screw');
 for(let i=0;i<8;i++){press(game,106,514);await settled(game);}
 assert.equal(game.state.extraHoles,9);assert.equal(credits.get(other),11);
 press(game,106,514);await settled(game);assert.equal(credits.get(other),11,'only nine extra holes per attempt');
 const oldAttempt=game.state.attemptId;
 press(game,297,514);await settled(game);
 assert.notEqual(game.state.attemptId,oldAttempt,'retry begins a new attempt');
 assert.equal(game.state.extraHoles,0,'purchases never silently carry into a fresh attempt');
 loseResponse=true;press(game,106,514);await settled(game);
 assert.equal(credits.get(other),10);assert.equal(game.state.extraHoles,0);
 press(game,106,514);await settled(game);
 assert.equal(game.state.extraHoles,1);assert.equal(credits.get(other),10,'lost response is recovered without double charge');
 const savedAttempt=game.state.attemptId;
 game.destroy();game=G.flat(api,12);await settled(game);
 assert.notEqual(game.state.attemptId,savedAttempt,'closing finishes the paid attempt');
 assert.equal(game.state.extraHoles,0,'old attempt purchases cannot leak into another play');
 const previousBuys=buyCalls;user=poor;press(game,106,514);
 assert.equal(buyCalls,previousBuys,'switching wallets blocks a purchase');game.destroy();
 game=G.flat(api,16);await settled(game);press(game,206,514);await settled(game);
 assert.equal(game.state.extraMoves,0,'empty wallet cannot buy extra moves');game.destroy();
 user=other;game=G.flat(api,16);await settled(game);game.state.moves=game.state.moveLimit;
 const moving=game.state.level.screws.find(s=>s.hole&&require('../screw-flat-physics.js').canUnscrew(game.state.level,s));
 const from=moving.hole,oldLevel=game.state.level;
 press(game,from.x,from.y);assert.equal(moving.hole,from,'base move limit blocks new pickup');
 press(game,206,514);await settled(game);
 assert.equal(game.state.extraMoves,3);assert.equal(game.state.level,oldLevel,'paid moves extend the current board');
 press(game,from.x,from.y);assert.equal(moving.hole,null,'the new move physically lifts the screw');
 const seat=game.state.level.holes.find(h=>h.owner===null&&require('../screw-flat-physics.js').canSeatScrew(game.state.level,h,moving));
 assert.ok(seat);for(let i=0;i<15;i++)game.update(.05);press(game,seat.x,seat.y);
 for(let i=0;i<30;i++)game.update(.05);assert.equal(moving.hole,seat);
 const moveAttempt=game.state.attemptId;press(game,297,514);await settled(game);
 assert.notEqual(game.state.attemptId,moveAttempt);assert.equal(game.state.extraMoves,0,'retry resets move packs for the new attempt');
 const moveBefore=buyCalls;release={promise:new Promise(r=>resolve=r)};press(game,206,514);game.destroy();resolve();release=null;await settled(game);
 assert.equal(game.state.extraMoves,0,'late checkout responses cannot modify a closed board');
 assert.equal(buyCalls,moveBefore+1);
 storage.set(G.STAGE_KEY,'1');game=G.flat({setScore(){},end(){}},1);game.state.moves=game.state.moveLimit-2;
 for(let i=0;i<2;i++){const s=game.state.level.screws[i],target=game.state.level.holes[i];press(game,s.hole.x,s.hole.y);for(let n=0;n<10;n++)game.update(.05);press(game,target.x,target.y);for(let n=0;n<100;n++)game.update(.05);}
 assert.equal(game.state.complete,true,'a final permitted move may finish the picture');game.destroy();
 console.log('PASS: atomic v2 SQL purchases; v3 attempt-scoped holes and move packs, retry isolation, lost responses and wallet guards.');
})().catch(error=>{console.error(error);process.exitCode=1});
