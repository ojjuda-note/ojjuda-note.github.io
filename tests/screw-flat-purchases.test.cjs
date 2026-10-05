const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite'),G=require('../screw-flat.js');
const root=path.join(__dirname,'..'),storage=new Map();
global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const press=(game,x,y)=>{game.onDown(x,y,1);game.onUp(x,y,1);};
const settled=async game=>{for(let i=0;i<400&&game.state.shopBusy;i++)await new Promise(r=>setTimeout(r,5));assert.equal(game.state.shopBusy,'');};
(async()=>{
 const db=new PGlite(),member=randomUUID(),other=randomUUID(),poor=randomUUID();
 await db.exec(`
  create role anon;create role authenticated;create role service_role;
  create schema auth;create schema ojjuda_note_internal;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function public.is_banned(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.banned',true),'false')='true'$$;
  create table public.user_private(user_id uuid primary key,coins integer not null check(coins>=0));
  create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid not null,kind text not null,coins integer not null,result jsonb not null);
  insert into public.user_private values('${member}',50),('${other}',10),('${poor}',0);
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

 // Drive the shipped game against the migrated PostgreSQL function, without spending live currency.
 let user=other,balance=10,buyCalls=0,loseResponse=false,release=null;
 const api={getUserId:()=>user,getCoins:()=>balance,setScore(){},end(){},buyScrew:async(kind,id,stage,verify)=>{
  const owner=user;if(!verify){buyCalls++;if(release)await release.promise;}
  const result=await rpc(owner,kind,id,stage,verify);if(typeof result.coins==='number')balance=result.coins;
  if(!verify&&loseResponse){loseResponse=false;throw Error('response lost after commit');}return result;
 }};
 storage.set(G.STAGE_KEY,'12');let game=G.flat(api);await settled(game);
 assert.equal(game.state.extraHoles,0);assert.equal(buyCalls,0,'opening verifies without charging');
 let resolve;release={promise:new Promise(r=>resolve=r)};
 press(game,106,514);press(game,106,514);assert.equal(buyCalls,1,'double taps start one payment');resolve();release=null;await settled(game);
 assert.equal(game.state.extraHoles,1);assert.equal(balance,9);
 const extra=game.state.level.holes.find(h=>h.extra),screw=game.state.level.screws[game.state.level.order[0]];
 press(game,screw.hole.x,screw.hole.y);press(game,extra.x,extra.y);for(let i=0;i<60;i++)game.update(.05);
 assert.equal(screw.hole.id,extra.id,'the purchased hole accepts a real screw');
 for(let i=0;i<2;i++){press(game,106,514);await settled(game);}
 assert.equal(game.state.extraHoles,3);assert.equal(balance,7);assert.equal(buyCalls,3);
 press(game,106,514);await settled(game);assert.equal(buyCalls,3,'the fourth purchase never reaches checkout');
 const spares=game.state.level.holes.filter(h=>h.owner===null);assert.equal(spares.length,6);
 for(const a of spares)for(const b of spares)if(a!==b)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=42,'all top holes have distinct tap areas');
 press(game,297,514);await settled(game);assert.equal(game.state.extraHoles,3);assert.equal(balance,7,'retry keeps paid holes');
 game.destroy();storage.clear();storage.set(G.STAGE_KEY,'12');game=G.flat(api);await settled(game);assert.equal(game.state.extraHoles,3,'reopening restores server purchases even without local receipts');
 game.state.level.plates.forEach(p=>p.state='gone');game.update(.05);press(game,267,514);await settled(game);assert.equal(game.state.L,13);assert.equal(game.state.extraHoles,0,'the next stage starts with three basic holes');
 loseResponse=true;press(game,106,514);await settled(game);assert.equal(balance,6);assert.equal(game.state.extraHoles,0);
 press(game,106,514);await settled(game);assert.equal(game.state.extraHoles,1);assert.equal(balance,6,'recovery checks the original receipt instead of charging again');
 const before=buyCalls;user=poor;press(game,106,514);assert.equal(buyCalls,before,'switching wallets cannot buy through the previous game');game.destroy();
 storage.set(G.STAGE_KEY,'14');balance=0;game=G.flat(api);await settled(game);press(game,106,514);await settled(game);assert.equal(game.state.extraHoles,0);assert.equal(buyCalls,before,'zero balance never adds a hole');game.destroy();
 user=other;balance=6;storage.set(G.STAGE_KEY,'15');game=G.flat(api);await settled(game);
 release={promise:new Promise(r=>resolve=r)};press(game,106,514);game.destroy();resolve();release=null;await settled(game);assert.equal(game.state.extraHoles,0,'a late response never changes a closed game');
 game=G.flat(api);await settled(game);assert.equal(game.state.extraHoles,1,'a paid hole is recovered after closing during checkout');game.destroy();
 // Exhaust the real move budget, purchase three more, and continue on the same board.
 storage.set(G.STAGE_KEY,'16');game=G.flat(api);await settled(game);
 assert.equal(game.state.extraMoves,0);game.state.moves=game.state.moveLimit;
 const moving=game.state.level.screws[game.state.level.order[0]],from=moving.hole,destination=game.state.level.holes[0];
 press(game,from.x,from.y);press(game,destination.x,destination.y);
 assert.equal(game.state.pending,null);assert.equal(moving.hole,from,'zero moves prevents relocation');
 const moveBuys=buyCalls,oldBalance=balance,oldLevel=game.state.level;
 release={promise:new Promise(r=>resolve=r)};press(game,206,514);press(game,206,514);assert.equal(buyCalls,moveBuys+1);resolve();release=null;await settled(game);
 assert.equal(balance,oldBalance-1);assert.equal(game.state.extraMoves,3);assert.equal(game.state.level,oldLevel,'buying moves does not reset the puzzle');
 press(game,from.x,from.y);assert.equal(game.state.moves,game.state.moveLimit,'selection uses no move');
 press(game,destination.x,destination.y);for(let i=0;i<60;i++)game.update(.05);
 assert.equal(moving.hole,destination);assert.equal(game.state.moves,game.state.moveLimit+1);assert.equal(game.state.extraMoves,3);
 for(const target of [game.state.level.holes[1],game.state.level.holes[0]]){press(game,moving.hole.x,moving.hole.y);press(game,target.x,target.y);for(let i=0;i<60;i++)game.update(.05);assert.equal(moving.hole,target);}
 assert.equal(game.state.moves,game.state.moveLimit+3);press(game,moving.hole.x,moving.hole.y);press(game,270,100);assert.equal(game.state.pending,null,'a three-move pack permits exactly three moves');
 press(game,297,514);await settled(game);assert.equal(game.state.moves,0);assert.equal(game.state.extraMoves,3,'retry retains the purchased stage allowance');
 game.destroy();storage.clear();storage.set(G.STAGE_KEY,'16');game=G.flat(api);await settled(game);assert.equal(game.state.extraMoves,3,'reopening recovers moves from the server');
 loseResponse=true;press(game,206,514);await settled(game);assert.equal(game.state.extraMoves,3);assert.equal(balance,oldBalance-2);
 press(game,206,514);await settled(game);assert.equal(game.state.extraMoves,6);assert.equal(balance,oldBalance-2,'lost response recovery adds the paid pack exactly once');
 assert.equal(game.state.extraHoles,0,'buying moves never adds a hole');
 const recoveredBuys=buyCalls;press(game,297,514);await settled(game);assert.equal(game.state.extraMoves,6);assert.equal(buyCalls,recoveredBuys);
 game.state.level.plates.forEach(p=>p.state='gone');game.update(.05);press(game,267,514);await settled(game);assert.equal(game.state.extraMoves,0,'move packs belong to their stage');
 user=poor;press(game,206,514);assert.equal(buyCalls,recoveredBuys,'wallet switching blocks extra-move purchases');game.destroy();
 game=G.flat(api);await settled(game);press(game,206,514);await settled(game);assert.equal(buyCalls,recoveredBuys,'zero balance does not buy moves');game.destroy();
 storage.set(G.STAGE_KEY,'1');game=G.flat({setScore(){},end(){}});game.state.moves=game.state.moveLimit-2;
 for(let i=0;i<2;i++){const screw=game.state.level.screws[i],target=game.state.level.holes[i];press(game,screw.hole.x,screw.hole.y);press(game,target.x,target.y);for(let n=0;n<100;n++)game.update(.05);}
 assert.equal(game.state.moves,game.state.moveLimit);assert.equal(game.state.complete,true,'the final allowed move may finish the picture under gravity');game.destroy();
 await db.close();console.log('PASS: stage move limits, three-move packs for one ju, uncapped repeat packs, receipt recovery and existing hole/box purchase regressions.');
 console.log('PASS: one-ju atomic purchases, three-per-stage cap, idempotency, wallet isolation, box compatibility, actual extra-hole input, retry/reopen recovery and lost responses.');
})().catch(error=>{console.error(error);process.exitCode=1});
